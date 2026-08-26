const express = require('express');
const router = express.Router();
const { getDB } = require('../models/db');
const { getShopDetector } = require('../services/shop-detector');

router.get('/', async (req, res) => {
  try {
    const db = await getDB();
    res.json({ success: true, data: db.getAllShops() });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ショップ名またはURLから自動検出
router.post('/lookup', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query || !query.trim()) {
      return res.status(400).json({ success: false, message: 'ショップ名またはURLを入力してください' });
    }
    const detector = getShopDetector();
    const info = await detector.detectShopInfo(query.trim());
    res.json({ success: true, data: info });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const db = await getDB();
    const { name, url } = req.body;
    if (!name || !url) return res.status(400).json({ success: false, message: 'ショップ名とURLは必須です' });
    const shop = db.createShop(req.body);
    res.json({ success: true, data: shop });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const db = await getDB();
    const shop = db.getShop(req.params.id);
    if (!shop) return res.status(404).json({ success: false, message: 'ショップが見つかりません' });
    const updated = db.updateShop(req.params.id, { ...shop, ...req.body });
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const db = await getDB();
    db.deleteShop(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
