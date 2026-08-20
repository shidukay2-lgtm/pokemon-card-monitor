const cheerio = require('cheerio');
const { BaseProvider } = require('./base-provider');
const { throttledRequest } = require('../utils/rate-limiter');

class CardRushScraper extends BaseProvider {
  async search(keyword) {
    const url = this.getSearchUrl(keyword);
    this.logger.info(`検索: ${keyword}`);

    let html;
    try {
      html = await throttledRequest(url, (u) => this.fetchHtml(u), {
        intervalMs: this.shop.request_interval_ms || 3000,
      });
    } catch (e) {
      this.logger.warn(`アクセスブロック(${e.message}) - 検索リンクで代替`);
      return [this.createResult({ name: keyword, price: null, stockStatus: 'unknown', productUrl: url })];
    }

    if (!html) return [this.createResult({ name: keyword, price: null, stockStatus: 'unknown', productUrl: url })];

    try {
      const $ = cheerio.load(html);
      const results = [];

      // 検索結果セクション内の商品リストのみを厳密に抽出
      $('.ajax_list_box li.list_item_cell, .item_list li.list_item_cell').each((_, el) => {
        const $el = $(el);

        // 新着・おすすめ・SALE品ブロックを除外
        const elHtml = $el.html() || '';
        if (elHtml.includes('itemph_newitem') || elHtml.includes('itemph_recommend') || elHtml.includes('itemph_sale')) return;

        // 商品名（goods_name、またはalt属性から）
        let name = $el.find('.goods_name').first().text().trim();
        if (!name) {
          name = $el.find('img[alt]').first().attr('alt') || '';
        }
        if (!name || name.includes('☆SALE☆')) return;

        // 価格
        const priceText = $el.find('.selling_price .figure, .price .figure').first().text().trim();
        const priceMatch = priceText.match(/([\d,]+)\s*円?/);
        if (!priceMatch) return;
        const price = parseInt(priceMatch[1].replace(/,/g, ''), 10);
        if (isNaN(price) || price <= 0) return;

        // 商品リンク
        const link = $el.find('a.item_data_link, a').first().attr('href');
        const productUrl = link ? (link.startsWith('http') ? link : `https://www.cardrush-pokemon.jp${link}`) : '';

        // 在庫状態
        const text = $el.text();
        const soldOut = text.includes('売切') || text.includes('SOLD') || text.includes('品切');
        const stockStatus = soldOut ? 'out_of_stock' : 'in_stock';

        results.push(this.createResult({ name, price, stockStatus, productUrl }));
      });

      this.logger.info(`${results.length}件の結果を取得`);
      if (results.length === 0) {
        return [this.createResult({ name: keyword, price: null, stockStatus: 'unknown', productUrl: url })];
      }
      return results.slice(0, 30);
    } catch (error) {
      this.logger.error(`HTML解析エラー: ${error.message}`);
      return [this.createResult({ name: keyword, price: null, stockStatus: 'unknown', productUrl: url })];
    }
  }
}

module.exports = { CardRushScraper };
