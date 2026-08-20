const express = require('express');
const router = express.Router();
const { getDB } = require('../models/db');

const { getOfficialCardService } = require('../services/official-card-service');

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

// 単体カード取得
router.get('/:id(\\d+)', async (req, res) => {
  try {
    const db = await getDB();
    const card = db.getCard(parseInt(req.params.id));
    if (!card) return res.status(404).json({ success: false, message: 'カードが見つかりません' });
    res.json({ success: true, data: card });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 公式カード情報検索
router.post('/lookup', async (req, res) => {
  try {
    const { name, rarity } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'カード名は必須です' });
    }
    const officialService = getOfficialCardService();
    const info = await officialService.lookupOfficial(name, rarity);
    res.json({ success: true, data: info });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 未入力カードの一括自動補完
router.post('/autofill-all', async (req, res) => {
  try {
    const db = await getDB();
    const officialService = getOfficialCardService();
    const cards = db.getAllCards();
    const updatedCards = [];

    for (const card of cards) {
      if (!card.set_name || !card.card_number || !card.rarity) {
        const filled = await officialService.autoFillCard(card, db);
        if (filled._autoFilled) {
          updatedCards.push(filled);
        }
      }
    }

    res.json({
      success: true,
      data: {
        total: cards.length,
        updatedCount: updatedCards.length,
        updatedCards,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// カード作成（未入力項目は公式から自動補完）
router.post('/', async (req, res) => {
  try {
    const db = await getDB();
    const { name, rarity, set_name, card_number } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'カード名は必須です' });
    }

    let cardData = { ...req.body };

    // セット名やカード番号が未入力なら公式から自動取得
    if (!set_name || !card_number) {
      const officialService = getOfficialCardService();
      const officialInfo = await officialService.lookupOfficial(name, rarity);
      if (officialInfo) {
        if (!cardData.set_name && officialInfo.set_name) cardData.set_name = officialInfo.set_name;
        if (!cardData.card_number && officialInfo.card_number) cardData.card_number = officialInfo.card_number;
        if (!cardData.rarity && officialInfo.rarity) cardData.rarity = officialInfo.rarity;
      }
    }

    const card = db.createCard(cardData);
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
