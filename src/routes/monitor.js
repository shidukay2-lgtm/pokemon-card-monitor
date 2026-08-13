const express = require('express');
const router = express.Router();
const { getDB } = require('../models/db');
const { getScheduler } = require('../services/scheduler');
const { getPriceTracker } = require('../services/price-tracker');

router.get('/prices', async (req, res) => {
  try {
    const tracker = await getPriceTracker();
    const data = await tracker.getDashboardData();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/prices/:cardId', async (req, res) => {
  try {
    const tracker = await getPriceTracker();
    const data = await tracker.getPriceSummary(parseInt(req.params.cardId));
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/history/:cardId/:shopId', async (req, res) => {
  try {
    const db = await getDB();
    const history = db.getPriceHistory(
      parseInt(req.params.cardId), parseInt(req.params.shopId), parseInt(req.query.limit) || 50
    );
    res.json({ success: true, data: history });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/patrol', async (req, res) => {
  try {
    const scheduler = await getScheduler();
    const result = await scheduler.runNow();
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/status', async (req, res) => {
  try {
    const scheduler = await getScheduler();
    res.json({ success: true, data: scheduler.getStatus() });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/toggle', async (req, res) => {
  try {
    const scheduler = await getScheduler();
    const enabled = scheduler.toggle();
    res.json({ success: true, data: { isEnabled: enabled } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/interval', async (req, res) => {
  try {
    const scheduler = await getScheduler();
    const interval = scheduler.setInterval(req.body.interval);
    res.json({ success: true, data: { interval } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 価格データリセット（古い誤データを削除）
router.delete('/prices', async (req, res) => {
  try {
    const db = await getDB();
    db.db.run('DELETE FROM price_records');
    db._save();
    res.json({ success: true, message: '全価格レコードを削除しました' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
