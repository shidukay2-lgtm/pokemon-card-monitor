const { BaseProvider } = require('./base-provider');

// スクレイピング禁止ショップ用 - 検索リンクのみ生成
class LinkOnlyProvider extends BaseProvider {
  async search(keyword) {
    const searchUrl = this.getSearchUrl(keyword);
    this.logger.info(`検索リンク生成: ${keyword} -> ${searchUrl}`);

    // データ取得は行わず、検索リンクのみを返す
    return [this.createResult({
      name: `${this.shop.name}で「${keyword}」を検索`,
      price: null,
      stockStatus: 'link_only',
      productUrl: searchUrl,
    })];
  }
}

module.exports = { LinkOnlyProvider };
