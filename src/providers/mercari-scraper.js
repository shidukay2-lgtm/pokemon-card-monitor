const cheerio = require('cheerio');
const { BaseProvider } = require('./base-provider');
const { throttledRequest } = require('../utils/rate-limiter');

class MercariScraper extends BaseProvider {
  async search(keyword) {
    const searchUrl = `https://jp.mercari.com/search?keyword=${encodeURIComponent('ポケモンカード ' + keyword)}&status=on_sale&order=asc&sort=price`;
    this.logger.info(`検索: ${keyword}`);

    const html = await throttledRequest(searchUrl, (u) => this.fetchHtmlBot(u), {
      intervalMs: this.shop.request_interval_ms || 5000,
    });

    if (!html) return [];

    try {
      const $ = cheerio.load(html);
      const results = [];
      const seenIds = new Set();

      // 各 <a href="/item/mXXXX"> 内のテキストから商品ID・価格・商品名を正確に抽出
      $('a[href*="/item/m"]').each((_, el) => {
        const $a = $(el);
        const href = $a.attr('href') || '';
        const text = $a.text().replace(/\s+/g, ' ').trim();

        // 商品IDを抽出
        const idMatch = href.match(/\/item\/(m\d+)/);
        if (!idMatch) return;
        const itemId = idMatch[1];

        // 重複チェック
        if (seenIds.has(itemId)) return;

        // テキストが短すぎるリンクはスキップ（サムネイルのみのリンク等）
        if (text.length < 5) return;

        // 価格を抽出（テキスト先頭の ¥XX,XXX パターン）
        const priceMatch = text.match(/[¥￥]([\d,]+)/);
        if (!priceMatch) return;
        const price = parseInt(priceMatch[1].replace(/,/g, ''), 10);
        if (isNaN(price) || price <= 0) return;

        // 「現在 ¥XX,XXX」はオークション → スキップ
        if (text.startsWith('現在')) return;

        // 商品名を抽出（価格部分を除いたテキスト）
        const name = text.replace(/^[¥￥][\d,]+/, '').trim();
        if (name.length < 3) return;

        seenIds.add(itemId);
        const productUrl = `https://jp.mercari.com/item/${itemId}`;

        results.push(this.createResult({
          name,
          price,
          stockStatus: 'in_stock',
          productUrl,
        }));
      });

      this.logger.info(`${results.length}件の結果を取得`);
      return results.slice(0, 20);
    } catch (error) {
      this.logger.error(`HTML解析エラー: ${error.message}`);
      return [];
    }
  }

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
