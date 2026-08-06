const cheerio = require('cheerio');
const { BaseProvider } = require('./base-provider');
const { throttledRequest } = require('../utils/rate-limiter');

class YuyuteiScraper extends BaseProvider {
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

      // 遊々亭のカードリスト解析
      $('.card_list_item, .card-list-item, [class*="card_unit"], .rarity_box .col').each((_, el) => {
        const $el = $(el);
        const name = $el.find('.card_name, .name, h4, .card-name').first().text().trim();
        const priceText = $el.find('.price, .card_price, [class*="price"]').first().text().trim();
        const link = $el.find('a').first().attr('href');

        if (!name || !priceText) return;

        const price = parseInt(priceText.replace(/[^0-9]/g, ''), 10);
        if (isNaN(price)) return;

        const productUrl = link ? (link.startsWith('http') ? link : `https://yuyu-tei.jp${link}`) : '';
        const stockText = $el.text();
        const stockStatus = stockText.includes('売切') || stockText.includes('品切') ? 'out_of_stock' : 'in_stock';

        results.push(this.createResult({ name, price, stockStatus, productUrl }));
      });

      this.logger.info(`${results.length}件の結果を取得`);
      return results;
    } catch (error) {
      this.logger.error(`HTML解析エラー: ${error.message}`);
      return [];
    }
  }
}

module.exports = { YuyuteiScraper };
