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

      return this.parseResults(response.data, searchUrl);
    } catch (error) {
      this.logger.error(`HTTP Error: ${error.message}`);
      return [];
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
