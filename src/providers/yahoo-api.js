const { BaseProvider } = require('./base-provider');
const config = require('../../config');

class YahooApiProvider extends BaseProvider {
  async search(keyword) {
    if (!config.yahoo.appId) {
      this.logger.warn('Yahoo!ショッピングAPI キーが未設定です');
      return [];
    }

    const searchKeyword = `ポケモンカード ${keyword}`;
    const data = await this.fetchJson(config.yahoo.baseUrl, {
      appid: config.yahoo.appId,
      query: searchKeyword,
      results: 30,
      sort: '+price',
      type: 'all',
    });

    if (!data || !data.hits) {
      this.logger.warn('Yahoo API: 結果なし');
      return [];
    }

    return data.hits.map(item => {
      return this.createResult({
        name: item.name || '',
        price: item.price || 0,
        originalPrice: item.originalPrice || item.price || 0,
        stockStatus: item.inStock ? 'in_stock' : 'out_of_stock',
        productUrl: item.url || '',
      });
    });
  }
}

module.exports = { YahooApiProvider };
