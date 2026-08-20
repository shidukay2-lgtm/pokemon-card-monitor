const cron = require('node-cron');
const { getDB } = require('../models/db');
const { Logger } = require('../utils/logger');
const { RakutenApiProvider } = require('../providers/rakuten-api');
const { YahooApiProvider } = require('../providers/yahoo-api');
const { SurugayaScraper } = require('../providers/surugaya-scraper');
const { YuyuteiScraper } = require('../providers/yuyutei-scraper');
const { CardRushScraper } = require('../providers/cardrush-scraper');
const { MercariScraper } = require('../providers/mercari-scraper');
const { LinkOnlyProvider } = require('../providers/link-only');
const { getPriceTracker } = require('./price-tracker');
const { filterResults } = require('../utils/relevance-filter');
const { getOfficialCardService } = require('./official-card-service');

const logger = new Logger('[スケジューラー]');

const PROVIDER_MAP = {
  'rakuten-api': RakutenApiProvider,
  'yahoo-api': YahooApiProvider,
  'surugaya-scraper': SurugayaScraper,
  'yuyutei-scraper': YuyuteiScraper,
  'cardrush-scraper': CardRushScraper,
  'mercari-scraper': MercariScraper,
  'link-only': LinkOnlyProvider,
};

class Scheduler {
  constructor() {
    this.cronJob = null;
    this.isRunning = false;
    this.isEnabled = false;
    this.intervalMinutes = 30;
    this.lastRun = null;
    this.nextRun = null;
    this.progress = { current: 0, total: 0, status: '停止中' };
  }

  async init() {
    const db = await getDB();
    const enabled = db.getSetting('patrol_enabled');
    const interval = db.getSetting('patrol_interval');
    const savedLastRun = db.getSetting('last_patrol_time');

    if (savedLastRun) {
      this.lastRun = savedLastRun;
    } else {
      // 価格レコードから最新日時を取得
      const lastRecord = db._get('SELECT MAX(fetched_at) as last_time FROM price_records WHERE price IS NOT NULL');
      if (lastRecord && lastRecord.last_time) {
        this.lastRun = lastRecord.last_time;
      }
    }

    this.isEnabled = enabled !== 'false';
    this.intervalMinutes = parseInt(interval) || 30;
    if (this.isEnabled) this.start();
    logger.info(`初期化完了 - 自動巡回: ${this.isEnabled ? 'ON' : 'OFF'}, 間隔: ${this.intervalMinutes}分, 最終巡回: ${this.lastRun || 'なし'}`);
  }

  start() {
    this.stop(false);
    this.isEnabled = true;
    this._saveSetting('patrol_enabled', 'true');
    const cronExpr = `*/${this.intervalMinutes} * * * *`;
    this.cronJob = cron.schedule(cronExpr, () => { this.runPatrol(); });
    this._calcNextRun();
    this.progress.status = '待機中';
    logger.info(`自動巡回開始 - ${this.intervalMinutes}分間隔`);
  }

  stop(save = true) {
    if (this.cronJob) { this.cronJob.stop(); this.cronJob = null; }
    this.isEnabled = false;
    this.nextRun = null;
    this.progress.status = '停止中';
    if (save) this._saveSetting('patrol_enabled', 'false');
    logger.info('自動巡回停止');
  }

  toggle() {
    if (this.isEnabled) { this.stop(); } else { this.start(); }
    return this.isEnabled;
  }

  setInterval(minutes) {
    minutes = Math.max(5, Math.min(120, parseInt(minutes) || 30));
    this.intervalMinutes = minutes;
    this._saveSetting('patrol_interval', String(minutes));
    if (this.isEnabled) this.start();
    logger.info(`巡回間隔を${minutes}分に変更`);
    return minutes;
  }

  async runNow() {
    if (this.isRunning) return { success: false, message: '巡回は既に実行中です' };
    return this.runPatrol();
  }

  async runPatrol() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.progress.status = '巡回中';
    logger.info('巡回開始');

    const db = await getDB();
    const tracker = await getPriceTracker();
    const officialService = getOfficialCardService();
    const filterSettings = db.getFilterSettings();
    const cards = db.getActiveCards();
    const shops = db.getActiveShops().filter(s => s.scrape_enabled);
    this.progress.total = cards.length * shops.length;
    this.progress.current = 0;
    const results = [];

    try {
      // 巡回前に未入力のセット名・型番を公式情報から自動補完
      for (const card of cards) {
        if (!card.set_name || !card.card_number) {
          const filled = await officialService.autoFillCard(card, db);
          if (filled._autoFilled) {
            card.set_name = filled.set_name;
            card.card_number = filled.card_number;
            card.rarity = filled.rarity;
          }
        }
      }

      for (const card of cards) {
        for (const shop of shops) {
          try {
            const ProviderClass = PROVIDER_MAP[shop.provider_type];
            if (!ProviderClass) { this.progress.current++; continue; }
            const provider = new ProviderClass(shop);
            const searchResults = await provider.search(card.name);
            // 関連性フィルター適用（他TCG/グッズ除外・型番/セット名照合・カスタム設定）
            const filtered = filterResults(searchResults, card, filterSettings);
            const removed = searchResults.length - filtered.length;
            if (removed > 0) logger.info(`[フィルター] ${card.name}@${shop.name}: ${searchResults.length}件→${filtered.length}件 (${removed}件除外)`);
            tracker.saveBestShopResult(db, card.id, shop, filtered, card.name);
            results.push({ card: card.name, shop: shop.name, count: filtered.length });
          } catch (error) {
            logger.error(`エラー: ${card.name} @ ${shop.name}: ${error.message}`);
          }
          this.progress.current++;
        }
      }
      this.lastRun = new Date().toISOString();
      this._saveSetting('last_patrol_time', this.lastRun);
      this._calcNextRun();
      logger.info(`巡回完了 - ${results.length}件処理`);
      return { success: true, results, timestamp: this.lastRun };
    } catch (error) {
      logger.error(`巡回エラー: ${error.message}`);
      return { success: false, message: error.message };
    } finally {
      this.isRunning = false;
      this.progress.status = this.isEnabled ? '待機中' : '停止中';
      this.progress.current = 0;
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning, isEnabled: this.isEnabled, interval: this.intervalMinutes,
      lastRun: this.lastRun, nextRun: this.nextRun, progress: { ...this.progress },
    };
  }

  _calcNextRun() {
    if (this.isEnabled) {
      const next = new Date();
      next.setMinutes(next.getMinutes() + this.intervalMinutes);
      this.nextRun = next.toISOString();
    }
  }

  async _saveSetting(key, value) {
    try { const db = await getDB(); db.setSetting(key, value); } catch (e) { logger.error(`設定保存エラー: ${e.message}`); }
  }
}

let instance = null;
async function getScheduler() {
  if (!instance) { instance = new Scheduler(); }
  return instance;
}

module.exports = { getScheduler };
