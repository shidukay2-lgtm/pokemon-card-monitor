const express = require('express');
const path = require('path');
const config = require('./config');
const { getDB } = require('./src/models/db');
const { getScheduler } = require('./src/services/scheduler');
const { getNotifier } = require('./src/services/notifier');
const { Logger } = require('./src/utils/logger');

const app = express();
const logger = new Logger('[サーバー]');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// APIルート
app.use('/api/cards', require('./src/routes/cards'));
app.use('/api/shops', require('./src/routes/shops'));
app.use('/api/monitor', require('./src/routes/monitor'));
app.use('/api/alerts', require('./src/routes/alerts'));
app.use('/api/ai', require('./src/routes/ai'));

// 設定API
app.get('/api/settings', async (req, res) => {
  try {
    const db = await getDB();
    res.json({ success: true, data: db.getAllSettings() });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/settings', async (req, res) => {
  try {
    const db = await getDB();
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ success: false, message: 'キーは必須です' });
    db.setSetting(key, value);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// エラーハンドリング
app.use((err, req, res, next) => {
  logger.error(`未処理エラー: ${err.message}`);
  res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' });
});

// 非同期起動
async function start() {
  try {
    // DB初期化
    await getDB();
    logger.info('データベース初期化完了');

    // サーバー起動（0.0.0.0で全ネットワークからアクセス可能）
    const PORT = config.port;
    app.listen(PORT, '0.0.0.0', () => {
      const os = require('os');
      const nets = os.networkInterfaces();
      let localIP = 'localhost';
      for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
          if (net.family === 'IPv4' && !net.internal) {
            localIP = net.address;
            break;
          }
        }
      }
      logger.info(`サーバー起動: http://localhost:${PORT}`);
      logger.info(`📱 スマホからアクセス: http://${localIP}:${PORT}`);
    });

    // スケジューラー初期化
    const scheduler = await getScheduler();
    await scheduler.init();

    // 通知サービス初期化
    await getNotifier();

    logger.info('全サービス初期化完了');
  } catch (error) {
    logger.error(`起動エラー: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

start();

// グレースフルシャットダウン
process.on('SIGINT', async () => {
  logger.info('シャットダウン中...');
  try {
    const db = await getDB();
    db.close();
  } catch (e) {}
  process.exit(0);
});
