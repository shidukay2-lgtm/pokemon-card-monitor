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
    const { KNOWN_TOREMA_IDS } = require('../services/torema-detail-resolver');
    const normalized = keyword.trim();

    // 1. 既知のトレマ商品IDがある場合は、直接詳細ページから出品加盟店最安値を高速取得
    let directDetailId = null;
    for (const [key, id] of Object.entries(KNOWN_TOREMA_IDS)) {
      if (normalized === key || normalized.includes(key) || key.includes(normalized)) {
        directDetailId = id;
        break;
      }
    }

    if (directDetailId) {
      const detailUrl = `https://www.tcgmp.jp/product/detail?id=${directDetailId}&referer=1`;
      this.logger.info(`直接詳細アクセス: ${keyword} -> ${detailUrl}`);
      try {
        const detailData = await this.fetchDetailShopMinPrice(detailUrl);
        if (detailData && detailData.minPrice > 0) {
          const resName = detailData.minShopName ? `${keyword} (${detailData.minShopName})` : keyword;
          return [this.createResult({
            name: resName,
            price: detailData.minPrice,
            stockStatus: detailData.stockStatus,
            productUrl: detailUrl
          })];
        }
      } catch (e) {
        this.logger.warn(`直接詳細取得失敗: ${e.message}`);
      }
    }

    // 2. 未知のカードまたはフォールバック: 検索一覧から探索
    const searchUrl = this.getSearchUrl(keyword);
    this.logger.info(`検索: ${keyword} -> ${searchUrl}`);

    try {
      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        signal: AbortSignal.timeout(15000)
      });

      if (!response.ok) {
        throw new Error(`HTTP Status ${response.status}`);
      }

      const html = await response.text();
      const results = this.parseResults(html, searchUrl);

      // 上位マッチカードについて、詳細ページから加盟店舗ごとの厳密な最安値と最安店舗名を補完
      for (const item of results.slice(0, 2)) {
        if (item.productUrl && item.productUrl.includes('detail?id=')) {
          try {
            const detailData = await this.fetchDetailShopMinPrice(item.productUrl);
            if (detailData && detailData.minPrice > 0) {
              item.price = detailData.minPrice;
              item.stockStatus = detailData.stockStatus;
              if (detailData.minShopName) {
                item.name = `${item.name} (${detailData.minShopName})`;
              }
            }
          } catch (e) {
            this.logger.warn(`詳細補完スキップ: ${e.message}`);
          }
        }
      }

      return results;
    } catch (error) {
      this.logger.error(`Error: ${error.message}`);
      return [];
    }
  }

  /**
   * 商品詳細ページ（detail?id=...）から全出品店舗の価格を取得し、加盟店中最安値を特定
   * @param {string} detailUrl
   * @returns {Promise<{minPrice: number, minShopName: string, stockStatus: string, offerCount: number}|null>}
   */
  async fetchDetailShopMinPrice(detailUrl) {
    // 最大2回試行
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch(detailUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
            'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8'
          },
          signal: AbortSignal.timeout(15000)
        });

        if (!res.ok) continue;

        const html = await res.text();
        const $ = cheerio.load(html);
        const offers = [];

        $('#stocks_body tr.stock, tr.stock').each((_, el) => {
          const $row = $(el);
          const shopName = $row.find('a[href^="/shop/"]').first().text().trim();
          const priceText = $row.find('strong.price, .price').first().text().trim();
          const hasCart = $row.find('select.addcart, input.addcart, button.addcart').length > 0;

          const priceMatch = priceText.match(/[\d,]+/);
          if (priceMatch) {
            const price = parseInt(priceMatch[0].replace(/,/g, ''), 10);
            if (!isNaN(price) && price > 0) {
              offers.push({
                shopName: shopName || 'トレマ加盟店',
                price,
                inStock: hasCart
              });
            }
          }
        });

        // ページ内 gtag や json-ld からの最安値フォールバック
        if (offers.length === 0) {
          const lowPriceMatch = html.match(/"lowPrice":\s*"(\d+)"/) || html.match(/'value':\s*(\d+)/);
          if (lowPriceMatch) {
            const minPrice = parseInt(lowPriceMatch[1], 10);
            if (!isNaN(minPrice) && minPrice > 0) {
              return {
                minPrice,
                minShopName: '',
                stockStatus: 'in_stock',
                offerCount: 1
              };
            }
          }
          return null;
        }

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
        if (attempt === 2) {
          this.logger.warn(`詳細ページ取得失敗 (${attempt}回試行): ${e.message}`);
          return null;
        }
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    return null;
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

    // 2. HTML本文内のDOMからのフォールバック抽出
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
