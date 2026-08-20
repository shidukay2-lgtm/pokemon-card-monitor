const webpush = require('web-push');
const nodemailer = require('nodemailer');
const { getDB } = require('../models/db');
const { Logger } = require('../utils/logger');
const config = require('../../config');

const logger = new Logger('[通知]');

class Notifier {
  constructor() { this.vapidReady = false; this.mailer = null; }

  async init() {
    await this._initVapid();
    this._initMailer();
  }

  async _initVapid() {
    try {
      const db = await getDB();
      let publicKey = db.getSetting('vapid_public_key');
      let privateKey = db.getSetting('vapid_private_key');
      if (!publicKey || !privateKey) {
        const keys = webpush.generateVAPIDKeys();
        publicKey = keys.publicKey;
        privateKey = keys.privateKey;
        db.setSetting('vapid_public_key', publicKey);
        db.setSetting('vapid_private_key', privateKey);
        logger.info('VAPID鍵を自動生成しました');
      }
      webpush.setVapidDetails('mailto:pokemoncard-monitor@example.com', publicKey, privateKey);
      this._vapidPublicKey = publicKey;
      this.vapidReady = true;
      logger.info('WebPush初期化完了');
    } catch (error) {
      logger.error(`VAPID初期化エラー: ${error.message}`);
    }
  }

  _initMailer() {
    if (config.smtp.user && config.smtp.pass) {
      this.mailer = nodemailer.createTransport({
        host: config.smtp.host, port: config.smtp.port, secure: config.smtp.port === 465,
        auth: { user: config.smtp.user, pass: config.smtp.pass },
      });
      logger.info('メール通知初期化完了');
    }
  }

  getVapidPublicKey() {
    if (this._vapidPublicKey) return this._vapidPublicKey;
    try {
      // データベースからフォールバック取得
      const { getDB } = require('../models/db');
      // DBが初期化済みの場合
      const db = require('../models/db');
      return this._vapidPublicKey || '';
    } catch (e) {
      return this._vapidPublicKey || '';
    }
  }

  async getVapidPublicKeyAsync() {
    if (this._vapidPublicKey) return this._vapidPublicKey;
    const db = await getDB();
    this._vapidPublicKey = db.getSetting('vapid_public_key') || '';
    return this._vapidPublicKey;
  }

  async checkAlerts(cardId, priceRecords) {
    const db = await getDB();
    const alerts = db.getActiveAlerts().filter(a => a.card_id === cardId);
    for (const alert of alerts) {
      for (const record of priceRecords) {
        if (record.price === null) continue;
        let triggered = false, message = '';
        switch (alert.condition_type) {
          case 'price_below':
            if (record.price <= alert.condition_value) {
              triggered = true;
              message = `${alert.card_name} が ¥${record.price.toLocaleString()} に値下がり（${record.shop_name || 'ショップ'}）`;
            }
            break;
          case 'price_above':
            if (record.price >= alert.condition_value) {
              triggered = true;
              message = `${alert.card_name} が ¥${record.price.toLocaleString()} に値上がり（${record.shop_name || 'ショップ'}）`;
            }
            break;
          case 'in_stock':
            if (record.stock_status === 'in_stock') {
              triggered = true;
              message = `${alert.card_name} が入荷しました（${record.shop_name || 'ショップ'}）`;
            }
            break;
        }
        if (triggered) {
          db.addAlertHistory({ alert_id: alert.id, card_id: cardId, shop_id: record.shop_id, triggered_price: record.price, message });
          if (alert.notify_browser) await this.sendPushNotification({ title: '🔔 価格アラート', body: message, url: record.product_url || '' });
          if (alert.notify_email) await this.sendEmail('価格アラート', message);
          logger.info(`アラート発火: ${message}`);
        }
      }
    }
  }

  async sendPushNotification(data) {
    if (!this.vapidReady) return;
    const db = await getDB();
    const subscriptions = db.getAllPushSubscriptions();
    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: JSON.parse(sub.keys_json) }, JSON.stringify(data));
      } catch (error) {
        if (error.statusCode === 410 || error.statusCode === 404) { db.removePushSubscription(sub.endpoint); }
        else { logger.error(`プッシュ通知エラー: ${error.message}`); }
      }
    }
  }

  async sendEmail(subject, body) {
    if (!this.mailer || !config.notificationEmail) return;
    try {
      await this.mailer.sendMail({
        from: config.smtp.user, to: config.notificationEmail,
        subject: `[ポケカモニター] ${subject}`, text: body,
        html: `<div style="font-family:sans-serif;padding:20px"><h2>🔔 ${subject}</h2><p>${body}</p></div>`,
      });
    } catch (error) { logger.error(`メール送信エラー: ${error.message}`); }
  }

  async sendTest() {
    await this.sendPushNotification({ title: '🧪 テスト通知', body: 'ポケカモニターの通知テストです' });
    return { success: true };
  }
}

let instance = null;
async function getNotifier() {
  if (!instance) {
    instance = new Notifier();
    await instance.init();
  }
  return instance;
}

module.exports = { getNotifier };
