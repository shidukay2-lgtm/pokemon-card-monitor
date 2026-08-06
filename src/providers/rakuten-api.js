const cheerio = require('cheerio');
const { BaseProvider } = require('./base-provider');
const config = require('../../config');

class RakutenApiProvider extends BaseProvider {
  async search(keyword) {
    const searchKeyword = `ポケモンカード ${keyword}`;

    // まずAPI方式を試す
    if (config.rakuten.appId) {
      const apiResult = await this._tryApi(searchKeyword);
      if (apiResult && apiResult.length > 0) return apiResult;
    }

    // API失敗時はHTML検索結果をスクレイピング
    return this._scrapeSearch(keyword);
  }

  async _tryApi(searchKeyword) {
    const data = await this.fetchJson(config.rakuten.baseUrl, {
      applicationId: config.rakuten.appId,
      format: 'json',
      keyword: searchKeyword,
      hits: 30,
      sort: '+itemPrice',
    });
    if (!data || data.error || !data.Items) return null;
    return data.Items.map(item => {
      const i = item.Item || item;
      return this.createResult({
        name: i.itemName || '',
        price: i.itemPrice || 0,
        stockStatus: i.availability === 0 ? 'out_of_stock' : 'in_stock',
        productUrl: i.itemUrl || '',
      });
    });
  }

  async _scrapeSearch(keyword) {
    const searchUrl = `https://search.rakuten.co.jp/search/mall/${encodeURIComponent('ポケモンカード ' + keyword)}/`;
    this.logger.info(`検索スクレイピング: ${keyword}`);

    const html = await this.fetchHtml(searchUrl);
    if (!html) return [];

    try {
      const $ = cheerio.load(html);
      const results = [];

      // 楽天検索結果の各商品
      $('[class*="searchresultitem"], .dui-card, [data-testid="searchResultItem"]').each((_, el) => {
        const $el = $(el);
        const name = $el.find('[class*="title"] a, .content--titleLink--3Nc0g, h2 a').first().text().trim();
        const link = $el.find('[class*="title"] a, .content--titleLink--3Nc0g, h2 a').first().attr('href');
        const priceText = $el.find('[class*="price"], .price--OX_YW').first().text().trim();

        if (!name) return;
        const priceMatch = priceText.match(/([\d,]+)\s*円/);
        if (!priceMatch) return;
        const price = parseInt(priceMatch[1].replace(/,/g, ''), 10);
        if (isNaN(price) || price <= 0) return;

        results.push(this.createResult({
          name,
          price,
          stockStatus: 'in_stock',
          productUrl: link || searchUrl,
        }));
      });

      // フォールバック: 一般的な商品リンクからも収集
      if (results.length === 0) {
        $('a[href*="item.rakuten.co.jp"], a[href*="product.rakuten.co.jp"]').each((_, el) => {
          const $a = $(el);
          const $parent = $a.closest('div, li, article');
          const name = $a.text().trim() || $parent.find('h2, h3, [class*="title"]').first().text().trim();
          const link = $a.attr('href');

          if (!name || name.length < 5 || name.length > 200) return;
          const priceText = $parent.text();
          const priceMatch = priceText.match(/([\d,]+)\s*円/);
          if (!priceMatch) return;
          const price = parseInt(priceMatch[1].replace(/,/g, ''), 10);
          if (isNaN(price) || price <= 0) return;

          results.push(this.createResult({ name, price, stockStatus: 'in_stock', productUrl: link || '' }));
        });
      }

      this.logger.info(`${results.length}件の結果を取得`);
      if (results.length === 0) {
        // 0件でも検索リンクは返す
        return [this.createResult({ name: `${keyword} (楽天検索)`, price: null, stockStatus: 'unknown', productUrl: searchUrl })];
      }
      return results.slice(0, 30);
    } catch (error) {
      this.logger.error(`解析エラー: ${error.message}`);
      return [this.createResult({ name: `${keyword} (楽天検索)`, price: null, stockStatus: 'unknown', productUrl: this.getSearchUrl(keyword) })];
    }
  }
}

module.exports = { RakutenApiProvider };
