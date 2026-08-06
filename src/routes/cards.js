const express = require('express');
const router = express.Router();
const { getDB } = require('../models/db');

// 全カード取得
router.get('/', async (req, res) => {
  try {
    const db = await getDB();
    const cards = db.getAllCards();
    res.json({ success: true, data: cards });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// カード作成
router.post('/', async (req, res) => {
  try {
    const db = await getDB();
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'カード名は必須です' });
    }
    const card = db.createCard(req.body);
    res.json({ success: true, data: card });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// カード更新
router.put('/:id', async (req, res) => {
  try {
    const db = await getDB();
    const card = db.getCard(req.params.id);
    if (!card) return res.status(404).json({ success: false, message: 'カードが見つかりません' });
    const updated = db.updateCard(req.params.id, { ...card, ...req.body });
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// カード削除
router.delete('/:id', async (req, res) => {
  try {
    const db = await getDB();
    db.deleteCard(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
