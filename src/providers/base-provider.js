const axios = require('axios');
const { Logger } = require('../utils/logger');

class BaseProvider {
  constructor(shop) {
    this.shop = shop;
    this.logger = new Logger(`[${shop.name}]`);
  }

  // サブクラスで実装する検索メソッド
  async search(keyword) {
    throw new Error('search() must be implemented by subclass');
  }

  // 検索URLを生成
  getSearchUrl(keyword) {
    if (!this.shop.search_url_pattern) return this.shop.url;
    return this.shop.search_url_pattern.replace('{keyword}', encodeURIComponent(keyword));
  }

  // 標準化された結果オブジェクトを生成
  createResult(data) {
    // 価格のサニティチェック（0〜1000万円の範囲外は無効）
    let price = data.price;
    if (price !== null && price !== undefined) {
      price = Number(price);
      if (isNaN(price) || price < 0 || price > 10000000) {
        price = null;
      }
    }
    return {
      name: data.name || '',
      price: price,
      originalPrice: data.originalPrice || price || null,
      stockStatus: data.stockStatus || 'unknown',
      productUrl: data.productUrl || '',
      shopName: this.shop.name,
      shopId: this.shop.id,
    };
  }

  // HTTPリクエスト（共通）
  async fetchHtml(url, options = {}) {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        timeout: options.timeout || 15000,
        responseType: 'text',
      });
      return response.data;
    } catch (error) {
      this.logger.error(`HTTP Error fetching ${url}: ${error.message}`);
      return null;
    }
  }

  // APIリクエスト（JSON）
  async fetchJson(url, params = {}) {
    try {
      const response = await axios.get(url, { params, timeout: 15000 });
      return response.data;
    } catch (error) {
      this.logger.error(`API Error: ${error.message}`);
      return null;
    }
  }
}

module.exports = { BaseProvider };
