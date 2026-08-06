const axios = require('axios');
const { getDB } = require('../models/db');
const { Logger } = require('../utils/logger');
const config = require('../../config');
const logger = new Logger('[AI分析]');

class AiAnalyzer {
  async getCachedAnalysis(cardId) {
    const db = await getDB();
    const cached = db.getAiAnalysis(cardId);
    if (!cached) return null;
    const cacheAge = (Date.now() - new Date(cached.analyzed_at).getTime()) / (1000 * 60 * 60);
    if (cacheAge > config.ai.cacheDurationHours) return null;
    try { return JSON.parse(cached.analysis_json); } catch { return null; }
  }

  async analyzeCard(cardId) {
    const cached = await this.getCachedAnalysis(cardId);
    if (cached) { logger.info(`キャッシュから取得: カードID ${cardId}`); return cached; }
    if (!config.gemini.apiKey) {
      logger.warn('Gemini API キー未設定 - ローカル分析');
      return this._localAnalysis(cardId);
    }
    const db = await getDB();
    const card = db.getCard(cardId);
    if (!card) return null;
    const prices = db.getLatestPrices(cardId);
    if (prices.length === 0) return this._emptyAnalysis('価格データがありません');
    try {
      const result = await this._callGemini(card, prices);
      db.saveAiAnalysis(cardId, result, result._tokenCount || 0);
      return result;
    } catch (error) {
      logger.error(`Gemini APIエラー: ${error.message}`);
      return this._localAnalysis(cardId);
    }
  }

  async analyzeBatch(cardIds) {
    const results = {};
    for (const id of cardIds.slice(0, config.ai.maxCardsPerBatch)) {
      results[id] = await this.analyzeCard(id);
    }
    return results;
  }

  async _callGemini(card, prices) {
    const priceData = prices.filter(p => p.price !== null)
      .map(p => `${p.shop_name}:¥${p.price}(${p.stock_status === 'in_stock' ? '在庫あり' : '在庫なし'})`).join(', ');
    const prompt = `ポケモンカード「${card.name}」(${card.rarity || '不明'})の相場分析。現在価格: ${priceData || 'データなし'}。目標: ¥${card.target_price_min}-¥${card.target_price_max}。\nJSON形式で回答: {"rating":1-5,"trend":"up/stable/down","verdict":"cheap/fair/expensive","comment":"20文字以内"}`;
    const response = await axios.post(
      `${config.gemini.baseUrl}?key=${config.gemini.apiKey}`,
      { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, maxOutputTokens: 100, responseMimeType: 'application/json' } },
      { timeout: 10000 }
    );
    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const tokenCount = response.data?.usageMetadata?.totalTokenCount || 0;
    try {
      const parsed = JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim());
      return {
        rating: Math.min(5, Math.max(1, parsed.rating || 3)),
        trend: ['up', 'stable', 'down'].includes(parsed.trend) ? parsed.trend : 'stable',
        verdict: ['cheap', 'fair', 'expensive'].includes(parsed.verdict) ? parsed.verdict : 'fair',
        comment: (parsed.comment || '分析完了').slice(0, 50), source: 'ai', _tokenCount: tokenCount,
      };
    } catch { return this._localAnalysis(null, prices); }
  }

  async _localAnalysis(cardId, prices = null) {
    const db = await getDB();
    if (!prices && cardId) prices = db.getLatestPrices(cardId);
    if (!prices || prices.length === 0) return this._emptyAnalysis('価格データ不足');
    const validPrices = prices.filter(p => p.price !== null).map(p => p.price);
    if (validPrices.length === 0) return this._emptyAnalysis('有効な価格データなし');
    const min = Math.min(...validPrices), max = Math.max(...validPrices);
    const avg = Math.round(validPrices.reduce((a, b) => a + b, 0) / validPrices.length);
    let card = null;
    if (cardId) card = db.getCard(cardId);
    let verdict = 'fair', rating = 3;
    if (card && card.target_price_max > 0) {
      if (min <= card.target_price_max) { verdict = 'cheap'; rating = 4; }
      if (min <= card.target_price_min) { rating = 5; }
      if (min > card.target_price_max) { verdict = 'expensive'; rating = 2; }
    }
    return { rating, trend: 'stable', verdict, comment: `最安¥${min.toLocaleString()} 平均¥${avg.toLocaleString()}`, source: 'local', stats: { min, max, avg, count: validPrices.length } };
  }

  _emptyAnalysis(comment) {
    return { rating: 0, trend: 'stable', verdict: 'unknown', comment, source: 'none' };
  }
}

let instance = null;
function getAiAnalyzer() { if (!instance) instance = new AiAnalyzer(); return instance; }
module.exports = { getAiAnalyzer };
