const cheerio = require('cheerio');
const { BaseProvider } = require('./base-provider');
const { throttledRequest } = require('../utils/rate-limiter');

class SurugayaScraper extends BaseProvider {
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

      // 駿河屋の商品リスト解析（複数のHTML構造に対応）
      const selectors = [
        '.item',
        '.item_box',
        '.search_result_item',
        'li.listitem',
        '.product-list-item',
      ];

      $(selectors.join(', ')).each((_, el) => {
        const $el = $(el);

        // 商品名取得
        const name = $el.find('.title a, .item_title a, h3 a, .product_name a, a.title').first().text().trim();
        if (!name) return;

        // 価格取得 - 最初の価格テキストのみ使用
        let priceText = '';
        $el.find('.price, .item_price').each((_, priceEl) => {
          const t = $(priceEl).text().trim();
          // 「円」や「¥」を含むテキストから数値を抽出
          if (t.match(/[¥￥円]/) || t.match(/^\d[\d,]+$/)) {
            if (!priceText) priceText = t;
          }
        });

        if (!priceText) return;

        // 数値のみ抽出（カンマ除去）
        const priceMatch = priceText.match(/[\d,]+/);
        if (!priceMatch) return;
        const price = parseInt(priceMatch[0].replace(/,/g, ''), 10);
        if (isNaN(price) || price <= 0) return;

        // リンク取得
        const link = $el.find('.title a, .item_title a, h3 a, a.title').first().attr('href');
        const productUrl = link ? (link.startsWith('http') ? link : `https://www.suruga-ya.jp${link}`) : '';

        // 在庫状態
        const stockText = $el.text();
        const stockStatus = stockText.includes('品切れ') || stockText.includes('売切') || stockText.includes('SOLD') ? 'out_of_stock' : 'in_stock';

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

module.exports = { SurugayaScraper };
