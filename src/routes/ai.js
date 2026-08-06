const express = require('express');
const router = express.Router();
const { getAiAnalyzer } = require('../services/ai-analyzer');

// カード分析
router.post('/analyze/:cardId', async (req, res) => {
  try {
    const analyzer = getAiAnalyzer();
    const result = await analyzer.analyzeCard(parseInt(req.params.cardId));
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// バッチ分析
router.post('/analyze-batch', async (req, res) => {
  try {
    const { cardIds } = req.body;
    if (!cardIds || !Array.isArray(cardIds)) {
      return res.status(400).json({ success: false, message: 'cardIds配列が必要です' });
    }
    const analyzer = getAiAnalyzer();
    const results = await analyzer.analyzeBatch(cardIds);
    res.json({ success: true, data: results });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// キャッシュされた分析結果を取得
router.get('/analysis/:cardId', (req, res) => {
  try {
    const analyzer = getAiAnalyzer();
    const cached = analyzer.getCachedAnalysis(parseInt(req.params.cardId));
    res.json({ success: true, data: cached });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
