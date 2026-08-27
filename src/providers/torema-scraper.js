const axios = require('axios');
const cheerio = require('cheerio');
const { BaseProvider } = require('./base-provider');

class ToremaScraper extends BaseProvider {
  getSearchUrl(keyword) {
    if (this.shop.search_url_pattern) {
      return this.shop.search_url_pattern.replace('{keyword}', encodeURIComponent(keyword));
    }
    return `https://www.tcgmp.jp/product/?order=I1&style=N&word=${encodeURIComponent(keyword)}&prc_id=44&alf=0`;
  }

  async search(keyword) {
    const searchUrl = this.getSearchUrl(keyword);
    this.logger.info(`検索: ${keyword} -> ${searchUrl}`);

    try {
      const response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8'
        },
        timeout: 10000
      });

      const results = this.parseResults(response.data, searchUrl);

      // 上位マッチカードについて、詳細ページから加盟店舗ごとの厳密な最安値と最安店舗名を補完
      for (const item of results.slice(0, 3)) {
        if (item.productUrl && item.productUrl.includes('detail?id=')) {
          const detailData = await this.fetchDetailShopMinPrice(item.productUrl);
          if (detailData && detailData.minPrice > 0) {
            item.price = detailData.minPrice;
            item.stockStatus = detailData.stockStatus;
            if (detailData.minShopName) {
              item.name = `${item.name} (${detailData.minShopName})`;
            }
          }
        }
      }

      return results;
    } catch (error) {
      this.logger.error(`HTTP Error: ${error.message}`);
      return [];
    }
  }

  /**
   * 商品詳細ページ（detail?id=...）から全出品店舗の価格を取得し、加盟店中最安値を特定
   * @param {string} detailUrl
   * @returns {Promise<{minPrice: number, minShopName: string, stockStatus: string, offerCount: number}|null>}
   */
  async fetchDetailShopMinPrice(detailUrl) {
    try {
      const res = await axios.get(detailUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
        },
        timeout: 5000
      });

      const $ = cheerio.load(res.data);
      const offers = [];

      $('#stocks_body tr.stock, tr.stock').each((_, el) => {
        const $row = $(el);
        const shopName = $row.find('a[href^="/shop/"]').first().text().trim();
        const priceText = $row.find('strong.price, .price').first().text().trim();
        const hasCart = $row.find('select.addcart, input.addcart, button.addcart').length > 0;

        const priceMatch = priceText.match(/[\d,]+/);
        if (shopName && priceMatch) {
          const price = parseInt(priceMatch[0].replace(/,/g, ''), 10);
          if (!isNaN(price) && price > 0) {
            offers.push({
              shopName,
              price,
              inStock: hasCart
            });
          }
        }
      });

      if (offers.length === 0) return null;

      // 在庫あり店舗を優先して最安値を抽出
      const inStockOffers = offers.filter(o => o.inStock);
      const bestOffer = inStockOffers.length > 0
        ? inStockOffers.reduce((min, cur) => cur.price < min.price ? cur : min)
        : offers.reduce((min, cur) => cur.price < min.price ? cur : min);

      return {
        minPrice: bestOffer.price,
        minShopName: bestOffer.shopName,
        stockStatus: bestOffer.inStock ? 'in_stock' : 'out_of_stock',
        offerCount: offers.length
      };
    } catch (e) {
      this.logger.warn(`詳細ページ加盟店価格取得スキップ: ${e.message}`);
      return null;
    }
  }

  parseResults(html, searchUrl) {
    const results = [];
    const $ = cheerio.load(html);

    // 1. gtag JSONからの高精度抽出
    const gtagMatch = html.match(/'items':\s*(\[\s*\{[\s\S]*?\}\s*\])/);
    if (gtagMatch) {
      try {
        const items = JSON.parse(gtagMatch[1]);
        for (const item of items) {
          if (item && item.id && item.price !== undefined && item.price !== null) {
            const price = parseInt(item.price, 10);
            if (!isNaN(price) && price > 0) {
              const detailUrl = `https://www.tcgmp.jp/product/detail?id=${item.id}&referer=1`;
              results.push(this.createResult({
                name: item.name || `${item.id}`,
                price: price,
                stockStatus: 'in_stock',
                productUrl: detailUrl
              }));
            }
          }
        }
      } catch (e) {
        this.logger.warn(`gtagパース例外: ${e.message}`);
      }
    }

    // 2. HTML本文内のDOMからのフォールバック抽出（gtagが空または補完用）
    if (results.length === 0) {
      $('a[href*="/product/detail?id="]').each((_, el) => {
        const $a = $(el);
        const href = $a.attr('href') || '';
        const matchId = href.match(/id=(\d+)/);
        if (!matchId) return;

        const detailId = matchId[1];
        const detailUrl = `https://www.tcgmp.jp/product/detail?id=${detailId}&referer=1`;
        const name = $a.text().trim();
        const $container = $a.closest('tr, li, div[class*="product"], .box, .item');
        const containerText = $container.text();
        const priceMatch = containerText.match(/([\d,]+)\s*円/);

        if (name && priceMatch) {
          const price = parseInt(priceMatch[1].replace(/,/g, ''), 10);
          if (!isNaN(price) && price > 0 && !results.some(r => r.productUrl === detailUrl)) {
            results.push(this.createResult({
              name,
              price,
              stockStatus: 'in_stock',
              productUrl: detailUrl
            }));
          }
        }
      });
    }

    this.logger.info(`${results.length}件の結果を取得`);
    return results;
  }
}

module.exports = { ToremaScraper };
