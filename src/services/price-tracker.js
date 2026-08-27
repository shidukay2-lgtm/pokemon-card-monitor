const { getDB } = require('../models/db');
const { Logger } = require('../utils/logger');
const logger = new Logger('[価格追跡]');

function pickBestSearchResult(searchResults) {
  const withPrice = searchResults.filter(r => r.price != null && r.price > 0);
  if (withPrice.length > 0) {
    return withPrice.reduce((best, current) => (current.price < best.price ? current : best));
  }
  return searchResults.find(r => r.productUrl) || null;
}

const { KNOWN_TOREMA_IDS } = require('./torema-detail-resolver');

function buildFallbackSearchUrl(shop, cardName) {
  if (shop.name && (shop.name.includes('トレマ') || shop.url.includes('tcgmp'))) {
    // 既知のトレマ商品IDから個別詳細ページを生成
    for (const [key, id] of Object.entries(KNOWN_TOREMA_IDS)) {
      if (cardName.includes(key) || key.includes(cardName)) {
        return `https://www.tcgmp.jp/product/detail?id=${id}&referer=1`;
      }
    }
  }
  if (shop.search_url_pattern) {
    return shop.search_url_pattern.replace('{keyword}', encodeURIComponent(cardName));
  }
  return shop.url || '';
}

class PriceTracker {
  saveBestShopResult(db, cardId, shop, searchResults, cardName) {
    const best = pickBestSearchResult(searchResults);
    const fallbackUrl = buildFallbackSearchUrl(shop, cardName);

    if (best && best.price != null && best.price > 0) {
      db.addPriceRecord({
        card_id: cardId,
        shop_id: shop.id,
        price: best.price,
        original_price: best.originalPrice || best.price,
        stock_status: best.stockStatus || 'unknown',
        product_url: best.productUrl || fallbackUrl,
        product_name: best.name || '',
      });
      return 1;
    }

    const productUrl = (best && best.productUrl) || fallbackUrl;
    if (!productUrl) return 0;

    db.addPriceRecord({
      card_id: cardId,
      shop_id: shop.id,
      price: null,
      original_price: null,
      stock_status: best?.stockStatus || 'link_only',
      product_url: productUrl,
      product_name: best?.name || `${cardName} (${shop.name}で検索)`,
    });
    return 1;
  }

  async trackPrices(cardId, shopId, results) {
    const db = await getDB();
    const shop = db.getShop(shopId);
    const card = db.getCard(cardId);
    if (!shop || !card) return 0;
    const saved = this.saveBestShopResult(db, cardId, shop, results, card.name);
    logger.info(`${saved}件の最安値を保存 (カード:${cardId}, ショップ:${shopId})`);
    return saved;
  }

  async getPriceSummary(cardId) {
    const db = await getDB();
    const prices = db.getLatestPrices(cardId);
    const card = db.getCard(cardId);
    if (prices.length === 0) return { card, prices: [], stats: null };
    const validPrices = prices.filter(p => p.price !== null);
    const priceValues = validPrices.map(p => p.price);
    const stats = priceValues.length > 0 ? {
      min: Math.min(...priceValues), max: Math.max(...priceValues),
      avg: Math.round(priceValues.reduce((a, b) => a + b, 0) / priceValues.length),
      count: priceValues.length, inStockCount: validPrices.filter(p => p.stock_status === 'in_stock').length,
    } : null;
    return { card, prices, stats };
  }

  async getDashboardData() {
    const db = await getDB();
    const cards = db.getActiveCards();
    const shops = db.getAllShops();
    const activeShops = shops.filter(s => s.is_active);
    const aiAnalyses = db.getAllLatestAiAnalyses ? db.getAllLatestAiAnalyses() : {};

    const resultCards = cards.map(card => {
      const shopPrices = {};
      let minPrice = null;
      let minPriceShop = null;

      const latestByShop = new Map();
      for (const price of db.getLatestPrices(card.id)) {
        latestByShop.set(price.shop_id, price);
      }

      for (const shop of activeShops) {
        const price = latestByShop.get(shop.id);
        const fallbackUrl = buildFallbackSearchUrl(shop, card.name);

        if (price && price.price != null && price.price > 0) {
          shopPrices[shop.id] = [{
            ...price,
            product_url: price.product_url || fallbackUrl
          }];
          if (minPrice === null || price.price < minPrice) {
            minPrice = price.price;
            minPriceShop = price.shop_name;
          }
        } else {
          shopPrices[shop.id] = [{
            shop_id: shop.id,
            shop_name: shop.name,
            price: null,
            product_url: (price && price.product_url) || fallbackUrl,
            product_name: `${card.name} (${shop.name}で検索)`,
            stock_status: 'link_only',
          }];
        }
      }

      const aiAnalysis = aiAnalyses[card.id] || null;

      return { ...card, shopPrices, minPrice, minPriceShop, aiAnalysis };
    });

    return {
      cards: resultCards,
      shops,
      totalCards: cards.length,
      totalShops: activeShops.length,
    };
  }
}

let instance = null;
async function getPriceTracker() { if (!instance) instance = new PriceTracker(); return instance; }
module.exports = { getPriceTracker, pickBestSearchResult, buildFallbackSearchUrl };
