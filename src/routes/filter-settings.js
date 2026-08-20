const express = require('express');
const router = express.Router();
const { getDB } = require('../models/db');
const { scoreRelevance, filterResults, OTHER_TCG_KEYWORDS, SUPPLY_KEYWORDS } = require('../utils/relevance-filter');

// 抽出条件設定の取得
router.get('/', async (req, res) => {
  try {
    const db = await getDB();
    const settings = db.getFilterSettings();
    res.json({
      success: true,
      data: {
        ...settings,
        preset_tcg_count: OTHER_TCG_KEYWORDS.length,
        preset_supplies_count: SUPPLY_KEYWORDS.length,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 抽出条件設定の更新
router.put('/', async (req, res) => {
  try {
    const db = await getDB();
    const updated = db.updateFilterSettings(req.body);
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 抽出シミュレーションテスト
router.post('/test', async (req, res) => {
  try {
    const db = await getDB();
    const { productName, card, settings } = req.body;

    if (!productName || !card) {
      return res.status(400).json({ success: false, message: '商品名とカード情報は必須です' });
    }

    const filterSettings = settings || db.getFilterSettings();
    const score = scoreRelevance(productName, card, filterSettings);
    const isPassed = score >= 35;

    res.json({
      success: true,
      data: {
        productName,
        cardName: card.name,
        setName: card.set_name || '',
        cardNumber: card.card_number || '',
        score,
        isPassed,
        status: isPassed ? '✅ 抽出対象' : '❌ 除外対象',
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
