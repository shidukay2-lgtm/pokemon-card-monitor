const express = require('express');
const router = express.Router();
const { getDB } = require('../models/db');
const { getNotifier } = require('../services/notifier');

router.get('/', async (req, res) => {
  try {
    const db = await getDB();
    res.json({ success: true, data: db.getAllAlerts() });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const db = await getDB();
    const { card_id } = req.body;
    if (!card_id) return res.status(400).json({ success: false, message: 'カードIDは必須です' });
    db.createAlert(req.body);
    res.json({ success: true, data: db.getAllAlerts() });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const db = await getDB();
    db.updateAlert(req.params.id, req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const db = await getDB();
    db.deleteAlert(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/history', async (req, res) => {
  try {
    const db = await getDB();
    res.json({ success: true, data: db.getAlertHistory(parseInt(req.query.limit) || 50) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/subscribe', async (req, res) => {
  try {
    const db = await getDB();
    const { subscription } = req.body;
    if (!subscription || !subscription.endpoint) return res.status(400).json({ success: false, message: 'サブスクリプションが不正です' });
    db.savePushSubscription(subscription);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/vapid-key', async (req, res) => {
  try {
    const notifier = await getNotifier();
    res.json({ success: true, data: { publicKey: notifier.getVapidPublicKey() } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/test', async (req, res) => {
  try {
    const notifier = await getNotifier();
    await notifier.sendTest();
    res.json({ success: true, message: 'テスト通知を送信しました' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
