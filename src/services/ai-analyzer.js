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

    // 1. 複数の外部買取サイト・市場相場データの収集
    const marketFetcher = getMarketPriceFetcher();
    const marketData = await marketFetcher.getMarketAndBuybackPrices(card, prices);

    // 2. 厳格な妥当性推論エンジン（Gemini API または 多角的ルール推論）
    let result;
    if (config.gemini.apiKey) {
      try {
        result = await this._callGeminiWithMarketData(card, validPrices, marketData);
      } catch (error) {
        logger.warn(`Gemini API呼び出し失敗(${error.message}) - 厳格相場推論エンジンを実行`);
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

  /**
   * 複数買取サイト相場・実勢取引データを組み合わせた厳格な最安値妥当性推論エンジン
   */
  _inferPriceReasonableness(card, validPrices, marketData) {
    const priceValues = validPrices.map(p => p.price);
    const minPrice = Math.min(...priceValues);
    const maxPrice = Math.max(...priceValues);
    const avgPrice = Math.round(priceValues.reduce((a, b) => a + b, 0) / priceValues.length);
    const minShop = validPrices.find(p => p.price === minPrice);

    const buybackPrice = marketData.buybackPrice;
    const fairMarketPrice = marketData.fairMarketPrice || avgPrice;
    const buybackSource = marketData.buybackSource;
    const sourceSummaries = marketData.sourceSummaries || [];

    let rating = 3;
    let verdict = 'fair';
    let comment = '';
    let trend = 'stable';
    let confidence = 'high';
    let isSuspicious = false;

    // 乖離率計算
    const marketDiffPercent = Math.round(((minPrice - fairMarketPrice) / fairMarketPrice) * 100);
    const buybackDiffPercent = buybackPrice ? Math.round(((minPrice - buybackPrice) / buybackPrice) * 100) : null;

    // ========================================================
    // 厳格な多角的相場推論ロジック
    // ========================================================

    if (buybackPrice && buybackPrice > 0) {
      const buybackRatio = (minPrice / buybackPrice) * 100;

      // 【Case 1: 異常安値 (Suspiciously Cheap)】
      // 最安値が買取相場の 75% 未満（例: 買取¥6,000 なのに ¥3,780 で販売）
      // 専門店で即現金化できる買取価格より大幅に安い場合、傷あり・白かけ・型番違いの疑いが極めて高い
      if (buybackRatio < 75 && buybackPrice >= 1200) {
        isSuspicious = true;
        rating = 2;
        verdict = 'suspicious_cheap';
        confidence = 'high';
        comment = `🚨 【要確認・異常安値】最安値（¥${minPrice.toLocaleString()}）が買取相場（¥${buybackPrice.toLocaleString()} / ${buybackSource}）を${Math.abs(buybackDiffPercent)}%も下回っています。通常、美品であれば買取価格以上で取引されるため、傷あり・白かけ・プレイ用ランク、または型番違いの疑いがあります。購入前に商品状態の確認を強く推奨します。`;
      }
      // 【Case 2: 超お買い得・特価 (Bargain)】
      // 最安値が買取相場〜適正販売価格の 85% 以下（適正相場より15%以上割安で、かつ買取価格割れではない）
      else if (minPrice <= Math.round(fairMarketPrice * 0.85)) {
        rating = 5;
        verdict = 'bargain';
        confidence = 'high';
        trend = 'down';
        comment = `🔥 【即買い推奨・超特価】適正市場相場（¥${fairMarketPrice.toLocaleString()}）に対して約${Math.abs(marketDiffPercent)}%割安です。買取相場（¥${buybackPrice.toLocaleString()}）とほぼ同等水準の非常に有利な価格設定となっており、お買い得度が高いです。`;
      }
      // 【Case 3: 適正相場 (Fair Price)】
      // 最安値が適正販売価格の 85% 〜 105%
      else if (minPrice <= Math.round(fairMarketPrice * 1.05)) {
        rating = 4;
        verdict = 'fair';
        confidence = 'high';
        trend = 'stable';
        comment = `⚖️ 【適正価格・買い頃】買取相場（¥${buybackPrice.toLocaleString()}）および実勢取引相場（¥${fairMarketPrice.toLocaleString()}）に合致した妥当な販売価格です。大きな価格乖離はなく、安心して購入できる相場水準です。`;
      }
      // 【Case 4: やや割高 (Overpriced)】
      // 最安値が適正販売価格の 105% 〜 125%
      else if (minPrice <= Math.round(fairMarketPrice * 1.25)) {
        rating = 2;
        verdict = 'overpriced';
        confidence = 'high';
        trend = 'up';
        comment = `⚠️ 【割高・様子見推奨】市場の適正販売相場（¥${fairMarketPrice.toLocaleString()}）に対して約${marketDiffPercent}%割高です。出品ショップ全体の価格が高止まりしているため、急ぎでなければ今後の再入荷や価格調整を待つことを推奨します。`;
      }
      // 【Case 5: 超割高・品薄プレ値 (Very Overpriced)】
      // 最安値が適正販売価格の 125% 超
      else {
        rating = 1;
        verdict = 'very_overpriced';
        confidence = 'high';
        trend = 'up';
        comment = `❌ 【超割高・購入非推奨】適正相場（¥${fairMarketPrice.toLocaleString()}）および買取相場（¥${buybackPrice.toLocaleString()}）から+${marketDiffPercent}%以上も乖離したプレミア価格です。品薄による一時的高騰の可能性が高く、購入は見送りを強く推奨します。`;
      }
    } else {
      // 買取相場が特定できなかった場合の統計推論（厳格化）
      if (minPrice <= Math.round(fairMarketPrice * 0.80)) {
        rating = 4;
        verdict = 'bargain';
        comment = `💡 監視ショップ中央値（¥${fairMarketPrice.toLocaleString()}）より約${Math.abs(marketDiffPercent)}%安い価格です。`;
      } else if (minPrice <= Math.round(fairMarketPrice * 1.10)) {
        rating = 3;
        verdict = 'fair';
        comment = `⚖️ 監視ショップ中央値（¥${fairMarketPrice.toLocaleString()}）と同等の標準的な価格帯です。`;
      } else {
        rating = 2;
        verdict = 'overpriced';
        comment = `⚠️ 監視ショップ中央値（¥${fairMarketPrice.toLocaleString()}）より約${marketDiffPercent}%割高な設定です。`;
      }
    }

    // 目標価格との比較
    if (card.target_price_min && minPrice <= card.target_price_min) {
      comment += `\n🎯 ユーザー設定の目標下限価格（¥${card.target_price_min.toLocaleString()}）を下回っています。`;
    }

    return {
      cardId: card.id,
      cardName: card.name,
      rating,
      verdict,
      confidence,
      trend,
      comment,
      priceAnalysis: {
        currentMin: minPrice,
        currentMax: maxPrice,
        currentAvg: avgPrice,
        minShop: minShop?.shop_name || '最安ショップ',
        buybackPrice,
        buybackSource,
        fairMarketPrice,
        marketDiffPercent,
        buybackDiffPercent,
        isSuspicious,
        sourceSummaries
      },
      analyzedAt: new Date().toISOString()
    };
  }

  /**
   * Gemini API を用いた厳格な多角的相場推論
   */
  async _callGeminiWithMarketData(card, validPrices, marketData) {
    const minPrice = Math.min(...validPrices.map(p => p.price));
    const avgPrice = Math.round(validPrices.reduce((a, b) => a + b.price, 0) / validPrices.length);

    const priceListText = validPrices.map(p => `- ${p.shop_name}: ¥${p.price.toLocaleString()} (${p.stock_status})`).join('\n');
    const buybackDetailsText = (marketData.buybackDetails || [])
      .map(b => `- ${b.source}: 買取価格 ¥${b.price?.toLocaleString()} ${b.note || ''}`)
      .join('\n') || `買取相場: ¥${marketData.buybackPrice?.toLocaleString()} (${marketData.buybackSource})`;

    const prompt = `あなたはポケモンカードの厳格なプロフェッショナル相場鑑定AIです。
ショップの出品価格のみに惑わされず、外部の買取相場や実勢成約相場を基準に、画面上の最安値が「本当に妥当でお買い得か、それとも割高や異常安値（傷ありリスク）か」を厳しく判定してください。

【対象カード】: ${card.name} (${card.rarity || 'レアリティ未指定'}, 型番: ${card.card_number || '不明'})
【目標設定価格】: ¥${card.target_price_min || '未設定'} 〜 ¥${card.target_price_max || '未設定'}

【監視ショップ販売価格一覧】:
${priceListText}

【外部買取サイト・実勢相場データ】:
${buybackDetailsText}
- 適正市場販売相場（推計）: ¥${marketData.fairMarketPrice?.toLocaleString() || '不明'}
- 実測基準買取価格: ¥${marketData.buybackPrice?.toLocaleString() || '不明'} (${marketData.buybackSource})

【厳格な評価基準】:
1. 最安値が買取価格の75%未満の場合 ➡ 「suspicious_cheap（異常安値・傷あり疑い）」Rating: 1〜2。
2. 最安値が適正販売相場の85%以下の場合 ➡ 「bargain（超特価・即買い推奨）」Rating: 5。
3. 最安値が適正販売相場の85%〜105%の場合 ➡ 「fair（適正価格）」Rating: 3〜4。
4. 最安値が適正販売相場の105%〜125%の場合 ➡ 「overpriced（割高・様子見）」Rating: 2。
5. 最安値が適正販売相場の125%超の場合 ➡ 「very_overpriced（超割高・見送り）」Rating: 1。

必ず以下のJSON形式のみを出力してください:
{
  "rating": 1〜5の整数,
  "verdict": "suspicious_cheap" | "bargain" | "fair" | "overpriced" | "very_overpriced",
  "confidence": "high" | "medium" | "low",
  "trend": "down" | "stable" | "up",
  "comment": "買取相場や適正価格と比較した客観的で厳格な理由を含む日本語解説文"
}`;

    const url = `${config.gemini.baseUrl}?key=${config.gemini.apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json"
        }
      }),
      signal: AbortSignal.timeout(12000)
    });

    if (!res.ok) throw new Error(`Gemini API Error ${res.status}`);
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = JSON.parse(text);

    return {
      cardId: card.id,
      cardName: card.name,
      rating: parsed.rating || 3,
      verdict: parsed.verdict || 'fair',
      confidence: parsed.confidence || 'high',
      trend: parsed.trend || 'stable',
      comment: parsed.comment || '',
      priceAnalysis: {
        currentMin: minPrice,
        currentMax: Math.max(...validPrices.map(p => p.price)),
        currentAvg: avgPrice,
        buybackPrice: marketData.buybackPrice,
        buybackSource: marketData.buybackSource,
        fairMarketPrice: marketData.fairMarketPrice,
        marketDiffPercent: marketData.fairMarketPrice ? Math.round(((minPrice - marketData.fairMarketPrice) / marketData.fairMarketPrice) * 100) : 0,
        buybackDiffPercent: marketData.buybackPrice ? Math.round(((minPrice - marketData.buybackPrice) / marketData.buybackPrice) * 100) : 0,
        isSuspicious: parsed.verdict === 'suspicious_cheap',
        sourceSummaries: marketData.sourceSummaries || []
      },
      analyzedAt: new Date().toISOString()
    };
  }

  _emptyAnalysis(reason) {
    return {
      rating: 0,
      verdict: 'unknown',
      confidence: 'low',
      trend: 'unknown',
      comment: reason,
      priceAnalysis: null,
      analyzedAt: new Date().toISOString()
    };
  }
}

let analyzerInstance = null;
function getAiAnalyzer() {
  if (!analyzerInstance) analyzerInstance = new AiAnalyzer();
  return analyzerInstance;
}

module.exports = { AiAnalyzer, getAiAnalyzer };
