const axios = require('axios');
const { getDB } = require('../models/db');
const { Logger } = require('../utils/logger');
const { getMarketPriceFetcher } = require('./market-price-fetcher');
const config = require('../../config');
const logger = new Logger('[AI相場推論]');

class AiAnalyzer {
  async getCachedAnalysis(cardId) {
    const db = await getDB();
    const cached = db.getAiAnalysis(cardId);
    if (!cached) return null;
    const cacheAge = (Date.now() - new Date(cached.analyzed_at).getTime()) / (1000 * 60 * 60);
    if (cacheAge > config.ai.cacheDurationHours) return null;
    try { return JSON.parse(cached.analysis_json); } catch { return null; }
  }

  async analyzeCard(cardId, forceRefresh = false) {
    if (!forceRefresh) {
      const cached = await this.getCachedAnalysis(cardId);
      if (cached) {
        logger.info(`キャッシュから取得: カードID ${cardId}`);
        return cached;
      }
    }

    const db = await getDB();
    const card = db.getCard(cardId);
    if (!card) return null;

    const prices = db.getLatestPrices(cardId);
    const validPrices = (prices || []).filter(p => p.price !== null && p.price > 0);
    if (validPrices.length === 0) {
      return this._emptyAnalysis('監視ショップの有効な価格データがありません');
    }

    // 外部買取サイト・市場相場の収集
    const marketFetcher = getMarketPriceFetcher();
    const marketData = await marketFetcher.getMarketAndBuybackPrices(card, prices);

    // 多角的推論（Gemini API または 高精度相場推論エンジン）
    let result;
    if (config.gemini.apiKey) {
      try {
        result = await this._callGeminiWithMarketData(card, validPrices, marketData);
      } catch (error) {
        logger.warn(`Gemini API呼び出し失敗(${error.message}) - 高精度相場推論エンジンを実行`);
        result = this._inferPriceReasonableness(card, validPrices, marketData);
      }
    } else {
      result = this._inferPriceReasonableness(card, validPrices, marketData);
    }

    if (cardId && result) {
      try {
        db.saveAiAnalysis(cardId, result, result._tokenCount || 0);
      } catch (e) {
        logger.warn(`キャッシュ保存失敗: ${e.message}`);
      }
    }

    return result;
  }

  async analyzeBatch(cardIds) {
    const results = {};
    for (const id of cardIds.slice(0, config.ai.maxCardsPerBatch)) {
      results[id] = await this.analyzeCard(id);
    }
    return results;
  }

  // 複数の買取サイト相場＆市場データを組み合わせた厳格な妥当性推論アルゴリズム
  _inferPriceReasonableness(card, validPrices, marketData) {
    const priceValues = validPrices.map(p => p.price);
    const minPrice = Math.min(...priceValues);
    const maxPrice = Math.max(...priceValues);
    const avgPrice = Math.round(priceValues.reduce((a, b) => a + b, 0) / priceValues.length);
    const minShop = validPrices.find(p => p.price === minPrice);

    const buybackPrice = marketData.buybackPrice;
    const fairMarketPrice = marketData.fairMarketPrice || avgPrice;
    const buybackSource = marketData.buybackSource;

    let rating = 3;
    let verdict = 'fair';
    let comment = '';
    let trend = 'stable';
    let confidence = 'high';
    let isSuspicious = false;

    // 1. 買取相場との比較（最安値 / 買取価格 比率）
    let buybackRatio = null;
    if (buybackPrice && buybackPrice > 0) {
      buybackRatio = Math.round((minPrice / buybackPrice) * 100);

      // ケースA: 異常安値（買取価格の45%未満など）➡ 傷あり品・ジャンク品・型番違いの疑い
      if (buybackRatio < 45 && buybackPrice >= 1500) {
        isSuspicious = true;
        rating = 3;
        verdict = 'fair';
        comment = `買取相場(¥${buybackPrice.toLocaleString()})対比45%未満の異常安値。状態難や型番違いに注意が必要です。`;
      }
      // ケースB: 超割安・爆アド（最安値 ≦ 買取価格）➡ 利益確定レベル
      else if (minPrice <= buybackPrice) {
        rating = 5;
        verdict = 'cheap';
        comment = `買取相場(¥${buybackPrice.toLocaleString()})以下で超割安！即買い推奨の優良価格です。`;
      }
      // ケースC: 割安・買い時（最安値が買取相場の 1.01〜1.20倍）
      else if (buybackRatio <= 120) {
        rating = 4;
        verdict = 'cheap';
        comment = `買取相場(¥${buybackPrice.toLocaleString()})近辺の好水準。市場相場(¥${fairMarketPrice.toLocaleString()})より割安です。`;
      }
      // ケースD: 適正相場（買取相場の 1.21〜1.45倍、市場マージン範囲内）
      else if (buybackRatio <= 145) {
        rating = 3;
        verdict = 'fair';
        comment = `買取相場(¥${buybackPrice.toLocaleString()})対比+${buybackRatio - 100}%。適正な流通相場価格です。`;
      }
      // ケースE: 割高・様子見（買取相場の 1.46倍以上）
      else {
        rating = 2;
        verdict = 'expensive';
        comment = `買取相場(¥${buybackPrice.toLocaleString()})に対し割高。相場下落を待つのが推奨です。`;
      }
    } else {
      // 買取データがない場合は市場相場（中央値・平均値）で厳格推論
      const ratioToFair = fairMarketPrice > 0 ? (minPrice / fairMarketPrice) : 1;
      if (ratioToFair <= 0.8) {
        rating = 4;
        verdict = 'cheap';
        comment = `市場適正相場(¥${fairMarketPrice.toLocaleString()})より割安水準です。`;
      } else if (ratioToFair >= 1.2) {
        rating = 2;
        verdict = 'expensive';
        comment = `市場適正相場(¥${fairMarketPrice.toLocaleString()})より高めの価格設定です。`;
      } else {
        rating = 3;
        verdict = 'fair';
        comment = `市場適正相場(¥${fairMarketPrice.toLocaleString()})に沿った標準価格です。`;
      }
    }

    // 目標価格との整合性チェック
    if (card.target_price_max > 0 && minPrice > card.target_price_max && verdict === 'cheap' && !isSuspicious) {
      // 買取対比で安くてもユーザーの目標上限を超えている場合はコメントで補足
      comment += ` (目標¥${card.target_price_max.toLocaleString()}は超過)`;
    }

    return {
      rating,
      trend,
      verdict,
      comment,
      source: 'market_multi_eval',
      stats: {
        min: minPrice,
        max: maxPrice,
        avg: avgPrice,
        minShop: minShop ? minShop.shop_name : null,
        count: validPrices.length,
      },
      reasoning: {
        buybackPrice: buybackPrice || null,
        buybackSource: buybackSource || '未取得',
        buybackRatio: buybackRatio ? `${buybackRatio}%` : null,
        fairMarketPrice: fairMarketPrice || avgPrice,
        isSuspicious,
        details: marketData.buybackDetails || []
      }
    };
  }

  // Gemini APIによる多角推論（APIキー設定時）
  async _callGeminiWithMarketData(card, prices, marketData) {
    const priceData = prices.map(p => `${p.shop_name}:¥${p.price}`).join(', ');
    const buybackStr = marketData.buybackPrice ? `¥${marketData.buybackPrice}(取得元:${marketData.buybackSource})` : '不明';

    const prompt = `あなたはプロのポケモンカード相場鑑定士です。
以下のデータから最安値の妥当性を推論し、基準を甘くせず厳格に診断してください。

【カード情報】: ${card.name} (${card.rarity || '不明'}, 型番: ${card.card_number || '不明'})
【監視ショップ販売価格】: ${priceData}
【外部大手買取相場】: ${buybackStr}
【市場適正価格目安】: ¥${marketData.fairMarketPrice || '不明'}
【ユーザー目標価格】: ¥${card.target_price_min}〜¥${card.target_price_max}

回答形式(JSON):
{
  "rating": 1〜5 (厳格な★スコア。買取価格以下なら5、買取付近なら4、適正なら3、割高なら2),
  "verdict": "cheap" または "fair" または "expensive",
  "trend": "up" または "stable" または "down",
  "comment": "買取相場と販売最安値を比較した35文字以内の客観的推論コメント"
}`;

    const response = await axios.post(
      `${config.gemini.baseUrl}?key=${config.gemini.apiKey}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 150, responseMimeType: 'application/json' }
      },
      { timeout: 10000 }
    );

    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const tokenCount = response.data?.usageMetadata?.totalTokenCount || 0;
    const parsed = JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim());

    const fallback = this._inferPriceReasonableness(card, prices, marketData);

    return {
      rating: Math.min(5, Math.max(1, parsed.rating || fallback.rating)),
      trend: ['up', 'stable', 'down'].includes(parsed.trend) ? parsed.trend : fallback.trend,
      verdict: ['cheap', 'fair', 'expensive'].includes(parsed.verdict) ? parsed.verdict : fallback.verdict,
      comment: (parsed.comment || fallback.comment).slice(0, 60),
      source: 'gemini_with_market_data',
      _tokenCount: tokenCount,
      stats: fallback.stats,
      reasoning: fallback.reasoning
    };
  }

  _emptyAnalysis(comment) {
    return {
      rating: 0,
      trend: 'stable',
      verdict: 'unknown',
      comment,
      source: 'none',
      reasoning: { buybackPrice: null, buybackSource: 'なし', fairMarketPrice: null }
    };
  }
}

let instance = null;
function getAiAnalyzer() {
  if (!instance) instance = new AiAnalyzer();
  return instance;
}

module.exports = { getAiAnalyzer, AiAnalyzer };
