const axios = require('axios');
const cheerio = require('cheerio');
const { Logger } = require('../utils/logger');
const logger = new Logger('[買取相場]');

class MarketPriceFetcher {
  constructor() {
    this.cache = new Map(); // cardId/keyword -> { data, timestamp }
    this.cacheDurationMs = 1000 * 60 * 60 * 6; // 6時間キャッシュ
  }

  // 買取相場および市場相場の総合取得
  async getMarketAndBuybackPrices(card, activeShopPrices = []) {
    const cacheKey = `${card.name}_${card.card_number || ''}_${card.rarity || ''}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheDurationMs) {
      return cached.data;
    }

    // 1. 遊々亭 買取からリアルタイムデータ取得
    const yuyuBuyback = await this._fetchYuyuBuyback(card);

    // 2. ショップ販売価格から市場相場を統計分析
    const shopValidPrices = (activeShopPrices || [])
      .filter(p => p.price != null && p.price > 0)
      .map(p => p.price);

    let marketMedian = null;
    let estimatedBuyback = null;

    if (shopValidPrices.length > 0) {
      const sorted = [...shopValidPrices].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      marketMedian = sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
      // TCG専門店の標準買取相場は販売中央値の約65%〜70%
      estimatedBuyback = Math.round(marketMedian * 0.68);
    }

    // 3. 買取相場の統合（実測買取価格があれば最優先、なければ推計）
    let buybackPrice = null;
    let buybackSource = 'none';
    let buybackDetails = [];

    if (yuyuBuyback && yuyuBuyback.price) {
      buybackPrice = yuyuBuyback.price;
      buybackSource = '遊々亭 買取';
      buybackDetails.push({
        shop: '遊々亭 買取',
        price: yuyuBuyback.price,
        cardName: yuyuBuyback.fullName,
        cardNumber: yuyuBuyback.cardNumber,
        url: yuyuBuyback.url
      });
    }

    if (!buybackPrice && estimatedBuyback) {
      buybackPrice = estimatedBuyback;
      buybackSource = '専門店相場推計';
    }

    // 市場適正販売価格（買取価格の約1.35倍、または販売中央値）
    const fairMarketPrice = buybackPrice ? Math.round(buybackPrice * 1.35) : (marketMedian || null);

    const result = {
      cardName: card.name,
      cardNumber: card.card_number || null,
      rarity: card.rarity || null,
      buybackPrice,
      buybackSource,
      buybackDetails,
      marketMedian,
      fairMarketPrice,
      fetchedAt: new Date().toISOString()
    };

    this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  }

  // 遊々亭 買取検索
  async _fetchYuyuBuyback(card) {
    try {
      const keyword = card.name.split(' ')[0]; // 先頭のカード名（例: タロ SAR -> タロ）
      const url = `https://yuyu-tei.jp/sell/poc/s/search?search_word=${encodeURIComponent(keyword)}`;
      
      const res = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8'
        },
        timeout: 7000
      });

      const $ = cheerio.load(res.data);
      const items = [];

      $('a[href*="/sell/poc/card/"]').each((_, el) => {
        const $link = $(el);
        const href = $link.attr('href') || '';
        const imgAlt = $link.find('img').attr('alt') || '';
        const h4Name = $link.find('h4').text().trim();
        
        const $container = $link.closest('div');
        const priceText = $container.find('strong').text().trim();
        const cleanPrice = parseInt(priceText.replace(/[^\d]/g, ''), 10);
        const cardNum = $container.find('span.border').text().trim();

        if ((imgAlt || h4Name) && !isNaN(cleanPrice) && cleanPrice > 0) {
          const fullName = imgAlt || h4Name;
          if (!items.find(x => x.url === href)) {
            items.push({
              fullName,
              cardNumber: cardNum,
              price: cleanPrice,
              url: href
            });
          }
        }
      });

      if (items.length === 0) return null;

      // 該当カードとのマッチング（型番・レアリティ・完全一致を優先）
      let bestMatch = null;

      // 1. 型番完全一致（例: 131/102 または 131）
      if (card.card_number) {
        const numPart = card.card_number.split('/')[0].trim();
        bestMatch = items.find(it => it.cardNumber && (it.cardNumber === card.card_number || it.cardNumber.startsWith(numPart)));
      }

      // 2. レアリティ一致（例: SAR, SR）
      if (!bestMatch && card.rarity) {
        bestMatch = items.find(it => it.fullName.includes(card.rarity) && it.fullName.includes(card.name.split(' ')[0]));
      }

      // 3. カード名一致
      if (!bestMatch) {
        bestMatch = items.find(it => it.fullName.includes(card.name.split(' ')[0]));
      }

      if (bestMatch) {
        logger.info(`遊々亭買取一致: ${bestMatch.fullName} -> ¥${bestMatch.price.toLocaleString()}`);
        return bestMatch;
      }

      return items[0] || null;
    } catch (e) {
      logger.warn(`遊々亭買取取得スキップ: ${e.message}`);
      return null;
    }
  }
}

let instance = null;
function getMarketPriceFetcher() {
  if (!instance) instance = new MarketPriceFetcher();
  return instance;
}

module.exports = { getMarketPriceFetcher, MarketPriceFetcher };
