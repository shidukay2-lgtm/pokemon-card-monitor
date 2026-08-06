const cheerio = require('cheerio');
const { BaseProvider } = require('./base-provider');
const { throttledRequest } = require('../utils/rate-limiter');

class CardRushScraper extends BaseProvider {
  async search(keyword) {
    const url = this.getSearchUrl(keyword);
    this.logger.info(`検索: ${keyword}`);

    const html = await throttledRequest(url, (u) => this.fetchHtml(u), {
      intervalMs: this.shop.request_interval_ms || 3000,
    });

    if (!html) return [];

    try {
      const $ = cheerio.load(html);
      const results = [];

      // カードラッシュの商品構造:
      // div.item_box > div.item_data > a.item_data_link > div.item_name > p.goods_name
      // div.item_box > div.item_data > div.price > p.selling_price > span.figure
      $('.item_box, .ajax_item_box').each((_, el) => {
        const $el = $(el);

        // 商品名
        const name = $el.find('.goods_name, .item_name').first().text().trim();
        if (!name) return;

        // 価格 (span.figure内の「XXX円」)
        const priceText = $el.find('.selling_price .figure, .price .figure').first().text().trim();
        const priceMatch = priceText.match(/([\d,]+)\s*円?/);
        if (!priceMatch) return;
        const price = parseInt(priceMatch[1].replace(/,/g, ''), 10);
        if (isNaN(price) || price <= 0) return;

        // 商品リンク
        const link = $el.find('a.item_data_link, a').first().attr('href');
        const productUrl = link ? (link.startsWith('http') ? link : `https://www.cardrush-pokemon.jp${link}`) : '';

        // 在庫状態（カートボタンの有無で判定）
        const hasCart = $el.find('.itemlist_cartbutton, [class*="productadd"]').length > 0;
        const soldOut = $el.text().includes('売切') || $el.text().includes('SOLD') || $el.text().includes('品切');
        const stockStatus = soldOut ? 'out_of_stock' : (hasCart ? 'in_stock' : 'unknown');

        results.push(this.createResult({ name, price, stockStatus, productUrl }));
      });

      this.logger.info(`${results.length}件の結果を取得`);
      return results.slice(0, 30);
    } catch (error) {
      this.logger.error(`HTML解析エラー: ${error.message}`);
      return [];
    }
  }
}

module.exports = { CardRushScraper };
