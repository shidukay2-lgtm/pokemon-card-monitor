const cheerio = require('cheerio');
const { BaseProvider } = require('./base-provider');
const { throttledRequest } = require('../utils/rate-limiter');

class SurugayaScraper extends BaseProvider {
  getSearchUrl(keyword) {
    // 駿河屋のトレカ・カードゲームカテゴリ（category=501）を指定
    return `https://www.suruga-ya.jp/search?category=501&search_word=${encodeURIComponent(keyword)}`;
  }

  async search(keyword) {
    const url = this.getSearchUrl(keyword);
    this.logger.info(`検索: ${keyword}`);

    let html;
    try {
      html = await throttledRequest(url, (u) => this.fetchHtml(u), {
        intervalMs: this.shop.request_interval_ms || 3000,
      });
    } catch (e) {
      // 403/404等のHTTPエラーはリンクのみ返す（クラウドIPブロック対策）
      this.logger.warn(`アクセスブロック(${e.message}) - 検索リンクで代替`);
      return [this.createResult({ name: keyword, price: null, stockStatus: 'unknown', productUrl: url })];
    }

    if (!html) return [this.createResult({ name: keyword, price: null, stockStatus: 'unknown', productUrl: url })];

    try {
      const $ = cheerio.load(html);
      const results = [];
      const seenUrls = new Set();

      // 駿河屋の商品リスト解析（.item を対象）
      $('.item, .search_result_item').each((_, el) => {
        const $el = $(el);

        // 商品名取得
        const titleEl = $el.find('.title a, .item_title a, h3 a, .product_name a, a.title').first();
        const name = titleEl.text().trim() || $el.find('.title, h3, .product_name').first().text().trim();
        if (!name) return;

        // オリパ・福袋・サプライ品等を除外
        if (name.includes('オリパ') || name.includes('福袋') || name.includes('くじ') || 
            name.includes('デッキシールド') || name.includes('スリーブ') || name.includes('プレイマット') ||
            name.includes('デッキケース') || name.includes('コレクションファイル')) {
          return;
        }

        // 商品リンク取得
        const link = titleEl.attr('href') || $el.find('a').first().attr('href');
        const productUrl = link ? (link.startsWith('http') ? link : `https://www.suruga-ya.jp${link}`) : '';
        if (productUrl && seenUrls.has(productUrl)) return;
        if (productUrl) seenUrls.add(productUrl);

        // 在庫状態判定
        const isSoldOut = $el.find('.price, p.price').text().includes('品切れ') || 
                          $el.find('.price, p.price').text().includes('売切');

        // 価格抽出（手数料説明文の「5,000円」等の誤取得を防止）
        let price = null;

        // 1. 定価・本体価格の抽出（p.price_teika または p.price からピンポイントで取得）
        const priceTeikaText = $el.find('.price_teika, p.price_teika').text().trim();
        const priceText = $el.find('p.price, .price').first().text().trim();

        // 「中古：￥6,480」や「新品：￥10,000」や「￥6,480」
        const matchTeika = priceTeikaText.match(/[￥¥]([\d,]+)/);
        if (matchTeika) {
          price = parseInt(matchTeika[1].replace(/,/g, ''), 10);
        } else if (!isSoldOut) {
          const matchPrice = priceText.match(/[￥¥]([\d,]+)/);
          if (matchPrice) {
            price = parseInt(matchPrice[1].replace(/,/g, ''), 10);
          }
        }

        // 2. マケプレ価格のチェック（本体が品切れ、またはマケプレがある場合）
        const makepreText = $el.find('.item_price').text();
        const makepreMatch = makepreText.match(/マケプレ\s*[￥¥]([\d,]+)/);
        let makeprePrice = null;
        if (makepreMatch) {
          makeprePrice = parseInt(makepreMatch[1].replace(/,/g, ''), 10);
        }

        // 在庫状態と価格の決定
        let stockStatus = 'in_stock';
        if (isSoldOut && !price) {
          if (makeprePrice) {
            price = makeprePrice;
            stockStatus = 'in_stock';
          } else {
            price = null;
            stockStatus = 'out_of_stock';
          }
        } else if (isSoldOut) {
          stockStatus = 'out_of_stock';
        }

        if (price && (isNaN(price) || price <= 0)) {
          price = null;
        }

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
