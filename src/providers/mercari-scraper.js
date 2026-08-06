const cheerio = require('cheerio');
const { BaseProvider } = require('./base-provider');
const { throttledRequest } = require('../utils/rate-limiter');

class MercariScraper extends BaseProvider {
  async search(keyword) {
    // メルカリ検索（価格昇順・販売中のみ）
    const searchUrl = `https://jp.mercari.com/search?keyword=${encodeURIComponent('ポケモンカード ' + keyword)}&status=on_sale&order=asc&sort=price`;
    this.logger.info(`検索: ${keyword}`);

    const html = await throttledRequest(searchUrl, (u) => this.fetchHtmlBot(u), {
      intervalMs: this.shop.request_interval_ms || 5000,
    });

    if (!html) return [];

    try {
      const $ = cheerio.load(html);
      const results = [];

      // 商品リンクから個別商品のIDを収集
      const itemIds = [];
      $('a[href*="/item/m"]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const match = href.match(/\/item\/(m\d+)/);
        if (match && !itemIds.includes(match[1])) {
          itemIds.push(match[1]);
        }
      });

      // search-item-grid内のテキストから価格を抽出
      const gridText = $('[data-testid="search-item-grid"]').text();
      // パターン: ¥XX,XXX + 商品名
      const pricePattern = /[¥￥]([\d,]+)([\s\S]*?)(?=[¥￥]|$)/g;
      let match;
      let itemIndex = 0;

      while ((match = pricePattern.exec(gridText)) !== null && itemIndex < 30) {
        const price = parseInt(match[1].replace(/,/g, ''), 10);
        const nameText = match[2].trim();

        if (isNaN(price) || price <= 0) continue;
        // 「現在」で始まるのはオークション価格、スキップ
        if (nameText.startsWith('現在')) continue;
        // 短すぎる名前はスキップ
        if (nameText.length < 3) continue;

        // 商品名を整形（改行やスペースを正規化）
        const name = nameText.replace(/\s+/g, ' ').substring(0, 100);
        const itemId = itemIds[itemIndex] || null;
        const productUrl = itemId ? `https://jp.mercari.com/item/${itemId}` : searchUrl;

        results.push(this.createResult({
          name,
          price,
          stockStatus: 'in_stock',
          productUrl,
        }));
        itemIndex++;
      }

      this.logger.info(`${results.length}件の結果を取得`);
      return results.slice(0, 20);
    } catch (error) {
      this.logger.error(`HTML解析エラー: ${error.message}`);
      return [];
    }
  }

  // SSR用のfetch（Googlebot UA）
  async fetchHtmlBot(url) {
    const axios = require('axios');
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'ja-JP,ja;q=0.9',
        },
        timeout: 15000,
        responseType: 'text',
      });
      return response.data;
    } catch (error) {
      this.logger.error(`HTTP Error: ${error.message}`);
      return null;
    }
  }
}

module.exports = { MercariScraper };
