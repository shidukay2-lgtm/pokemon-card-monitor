const cheerio = require('cheerio');
const { Logger } = require('../utils/logger');
const logger = new Logger('[買取相場]');

class MarketPriceFetcher {
  constructor() {
    this.cache = new Map(); // cardKey -> { data, timestamp }
    this.cacheDurationMs = 1000 * 60 * 60 * 4; // 4時間キャッシュ
  }

  /**
   * 複数の外部買取サイト・実勢成約相場から多角的にデータを収集・統合
   * @param {object} card - カード情報
   * @param {Array} activeShopPrices - 画面上のショップ価格一覧
   * @returns {Promise<object>} 市場・買取相場データ
   */
  async getMarketAndBuybackPrices(card, activeShopPrices = []) {
    const cacheKey = `${card.name}_${card.card_number || ''}_${card.rarity || ''}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheDurationMs) {
      return cached.data;
    }

    const buybackDetails = [];
    const sourceNames = [];

    // 1. 遊々亭 買取から型番・レアリティ完全一致でリアルタイム買取価格を取得
    const yuyuBuyback = await this._fetchYuyuBuyback(card);
    if (yuyuBuyback && yuyuBuyback.price > 0) {
      buybackDetails.push({
        source: '遊々亭 買取',
        price: yuyuBuyback.price,
        cardName: yuyuBuyback.fullName,
        cardNumber: yuyuBuyback.cardNumber,
        url: yuyuBuyback.url
      });
      sourceNames.push(`遊々亭 買取: ¥${yuyuBuyback.price.toLocaleString()}`);
    }

    // 2. メルカリ実売（成約済み・売り切れ）取引相場の収集
    const mercariSold = await this._fetchMercariSoldStats(card);
    if (mercariSold && mercariSold.medianPrice > 0) {
      const estimatedBuybackFromSold = Math.round(mercariSold.medianPrice * 0.72);
      buybackDetails.push({
        source: 'メルカリ実売成約相場',
        price: estimatedBuybackFromSold,
        marketPrice: mercariSold.medianPrice,
        sampleCount: mercariSold.sampleCount,
        note: `成約中央値 ¥${mercariSold.medianPrice.toLocaleString()} (直近${mercariSold.sampleCount}件)`
      });
      sourceNames.push(`メルカリ成約相場: ¥${mercariSold.medianPrice.toLocaleString()} (買取換算: ¥${estimatedBuybackFromSold.toLocaleString()})`);
    }

    // 3. 画面ショップ価格およびトレマ複数店舗の統計値
    const validPrices = (activeShopPrices || [])
      .filter(p => p.price != null && p.price > 0)
      .map(p => p.price);

    let shopMedian = null;
    if (validPrices.length > 0) {
      const sorted = [...validPrices].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      shopMedian = sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
    }

    // 4. 複数ソースからの買取最高値・平均値の統合算出
    const allBuybackPrices = buybackDetails.map(b => b.price).filter(p => p > 0);
    let primaryBuybackPrice = null;
    let buybackSource = 'none';

    if (yuyuBuyback && yuyuBuyback.price > 0) {
      primaryBuybackPrice = yuyuBuyback.price;
      buybackSource = '遊々亭 買取 (実測値)';
    } else if (allBuybackPrices.length > 0) {
      primaryBuybackPrice = Math.max(...allBuybackPrices);
      buybackSource = buybackDetails[0].source;
    } else if (shopMedian) {
      // 外部買取が一切取れなかった場合の最後のフォールバック（TCG標準買取率約65%）
      primaryBuybackPrice = Math.round(shopMedian * 0.65);
      buybackSource = '専門市場標準推計(65%)';
    }

    // 5. 適正市場販売価格（Fair Market Price）の算出
    // TCG専門店の健全な利益マージン（買取価格の約1.25〜1.35倍）と成約中央値を基準に算出
    let fairMarketPrice = null;
    if (primaryBuybackPrice) {
      const fromBuyback = Math.round(primaryBuybackPrice * 1.30);
      if (mercariSold && mercariSold.medianPrice > 0) {
        // 実売相場と買取換算相場の加重平均
        fairMarketPrice = Math.round((fromBuyback * 0.5) + (mercariSold.medianPrice * 0.5));
      } else if (shopMedian) {
        fairMarketPrice = Math.round((fromBuyback * 0.6) + (shopMedian * 0.4));
      } else {
        fairMarketPrice = fromBuyback;
      }
    } else if (shopMedian) {
      fairMarketPrice = shopMedian;
    }

    const result = {
      cardName: card.name,
      cardNumber: card.card_number || null,
      rarity: card.rarity || null,
      buybackPrice: primaryBuybackPrice,
      buybackSource,
      buybackDetails,
      sourceSummaries: sourceNames,
      marketMedian: shopMedian,
      mercariSoldMedian: mercariSold?.medianPrice || null,
      fairMarketPrice,
      fetchedAt: new Date().toISOString()
    };

    this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  }

  /**
   * 遊々亭 買取検索（型番・レアリティ照合）
   */
  async _fetchYuyuBuyback(card) {
    try {
      const keyword = card.name.split(' ')[0]; // 先頭のカード名（例: ナンジャモ SR -> ナンジャモ）
      const url = `https://yuyu-tei.jp/sell/poc/s/search?search_word=${encodeURIComponent(keyword)}`;

      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8'
        },
        signal: AbortSignal.timeout(8000)
      });

      if (!res.ok) return null;
      const html = await res.text();
      const $ = cheerio.load(html);
      const items = [];

      $('a[href*="/sell/poc/card/"]').each((_, el) => {
        const $a = $(el);
        const name = ($a.find('img').attr('alt') || $a.text() || '').trim();
        const href = $a.attr('href') || '';
        const $container = $a.closest('div.card-product, div.item, .col, li, div');
        const text = $container.text();
        const priceMatch = text.match(/([\d,]+)\s*円/);

        if (priceMatch && name) {
          const price = parseInt(priceMatch[1].replace(/,/g, ''), 10);
          if (price > 0) {
            items.push({
              fullName: name,
              price,
              url: href.startsWith('http') ? href : `https://yuyu-tei.jp${href}`
            });
          }
        }
      });

      if (items.length === 0) return null;

      // 型番またはレアリティによる厳密マッチング
      const cardNum = card.card_number ? card.card_number.replace(/\s+/g, '') : '';
      const rarity = card.rarity ? card.rarity.toUpperCase() : '';

      // 1. 型番完全一致
      if (cardNum) {
        const numMatch = items.find(it => it.fullName.includes(cardNum));
        if (numMatch) return numMatch;
      }

      // 2. レアリティ＆カード名完全一致
      if (rarity) {
        const rarityMatches = items.filter(it => {
          const fn = it.fullName.toUpperCase();
          return fn.includes(rarity) && fn.includes(keyword);
        });
        if (rarityMatches.length > 0) {
          // 最高買取価格を採用
          return rarityMatches.reduce((max, cur) => cur.price > max.price ? cur : max);
        }
      }

      // 3. カード名一致
      const nameMatches = items.filter(it => it.fullName.includes(card.name));
      if (nameMatches.length > 0) {
        return nameMatches.reduce((max, cur) => cur.price > max.price ? cur : max);
      }

      return null;
    } catch (error) {
      logger.warn(`遊々亭 買取取得エラー (${card.name}): ${error.message}`);
      return null;
    }
  }

  /**
   * メルカリ実売（売り切れ）相場データの抽出
   */
  async _fetchMercariSoldStats(card) {
    try {
      const keyword = `${card.name} ${card.rarity || ''}`.trim();
      // メルカリ検索API / スクレイピング
      const searchUrl = `https://jp.mercari.com/search?keyword=${encodeURIComponent(keyword)}&status=sold_out`;
      
      const res = await fetch(`https://api.mercari.jp/items/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'X-Platform': 'web'
        },
        body: JSON.stringify({
          keyword,
          status: ['STATUS_SOLD_OUT'],
          limit: 15
        }),
        signal: AbortSignal.timeout(6000)
      });

      if (!res.ok) return null;
      const json = await res.json();
      const items = json.items || [];
      const validPrices = [];

      for (const item of items) {
        const price = parseInt(item.price, 10);
        const name = (item.name || '').toLowerCase();
        // パックやまとめ売り、未開封BOXの除外
        if (name.includes('box') || name.includes('パック') || name.includes('セット') || name.includes('まとめ')) {
          continue;
        }
        if (price >= 300) {
          validPrices.push(price);
        }
      }

      if (validPrices.length === 0) return null;

      // 中央値算出
      validPrices.sort((a, b) => a - b);
      const mid = Math.floor(validPrices.length / 2);
      const medianPrice = validPrices.length % 2 !== 0
        ? validPrices[mid]
        : Math.round((validPrices[mid - 1] + validPrices[mid]) / 2);

      return {
        medianPrice,
        sampleCount: validPrices.length,
        minPrice: validPrices[0],
        maxPrice: validPrices[validPrices.length - 1]
      };
    } catch (e) {
      return null;
    }
  }
}

let fetcherInstance = null;
function getMarketPriceFetcher() {
  if (!fetcherInstance) fetcherInstance = new MarketPriceFetcher();
  return fetcherInstance;
}

module.exports = { MarketPriceFetcher, getMarketPriceFetcher };
