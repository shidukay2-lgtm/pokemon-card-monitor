const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const config = require('../../config');

class DB {
  constructor() {
    this.db = null;
    this.dbPath = config.db.path;
    this._ready = false;
  }

  async initialize() {
    const dbDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    const SQL = await initSqlJs();

    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(buffer);
    } else {
      this.db = new SQL.Database();
    }

    // スキーマ適用
    const schema = fs.readFileSync(path.join(__dirname, '../../database/schema.sql'), 'utf8');
    this.db.exec(schema);
    this._save();
    this._ready = true;
  }

  _save() {
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.dbPath, buffer);
  }

  // ヘルパー: SELECT系（結果を配列として返す）
  _all(sql, params = []) {
    const stmt = this.db.prepare(sql);
    if (params.length) stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  }

  // ヘルパー: SELECT 1行
  _get(sql, params = []) {
    const rows = this._all(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  // ヘルパー: INSERT/UPDATE/DELETE
  _run(sql, params = []) {
    this.db.run(sql, params);
    this._save();
    // lastInsertRowid 相当
    const result = this._get('SELECT last_insert_rowid() as id');
    return { lastInsertRowid: result ? result.id : 0 };
  }

  // ========== カード ==========
  getAllCards() {
    return this._all('SELECT * FROM cards ORDER BY created_at DESC');
  }

  getActiveCards() {
    return this._all('SELECT * FROM cards WHERE is_active = 1 ORDER BY name');
  }

  getCard(id) {
    return this._get('SELECT * FROM cards WHERE id = ?', [id]);
  }

  createCard(data) {
    const result = this._run(
      `INSERT INTO cards (name, set_name, rarity, card_number, target_price_min, target_price_max, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [data.name, data.set_name || '', data.rarity || '', data.card_number || '',
       data.target_price_min || 0, data.target_price_max || 0, data.notes || '']
    );
    return this.getCard(result.lastInsertRowid);
  }

  updateCard(id, data) {
    this._run(
      `UPDATE cards SET name = ?, set_name = ?, rarity = ?, card_number = ?,
        target_price_min = ?, target_price_max = ?, notes = ?, is_active = ?,
        updated_at = datetime('now', 'localtime')
       WHERE id = ?`,
      [data.name, data.set_name || '', data.rarity || '', data.card_number || '',
       data.target_price_min || 0, data.target_price_max || 0, data.notes || '',
       data.is_active !== undefined ? data.is_active : 1, id]
    );
    return this.getCard(id);
  }

  deleteCard(id) {
    this._run('DELETE FROM price_records WHERE card_id = ?', [id]);
    this._run('DELETE FROM alerts WHERE card_id = ?', [id]);
    this._run('DELETE FROM ai_analyses WHERE card_id = ?', [id]);
    this._run('DELETE FROM cards WHERE id = ?', [id]);
  }

  // ========== ショップ ==========
  getAllShops() {
    return this._all('SELECT * FROM shops ORDER BY id');
  }

  getActiveShops() {
    return this._all('SELECT * FROM shops WHERE is_active = 1 ORDER BY name');
  }

  getShop(id) {
    return this._get('SELECT * FROM shops WHERE id = ?', [id]);
  }

  createShop(data) {
    const result = this._run(
      `INSERT INTO shops (name, url, search_url_pattern, provider_type, scrape_enabled, request_interval_ms)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [data.name, data.url, data.search_url_pattern || '',
       data.provider_type || 'link-only', data.scrape_enabled !== undefined ? data.scrape_enabled : 1,
       data.request_interval_ms || 3000]
    );
    return this.getShop(result.lastInsertRowid);
  }

  updateShop(id, data) {
    this._run(
      `UPDATE shops SET name = ?, url = ?, search_url_pattern = ?, provider_type = ?,
        is_active = ?, scrape_enabled = ?, request_interval_ms = ?,
        updated_at = datetime('now', 'localtime')
       WHERE id = ?`,
      [data.name, data.url, data.search_url_pattern || '', data.provider_type || 'link-only',
       data.is_active !== undefined ? data.is_active : 1,
       data.scrape_enabled !== undefined ? data.scrape_enabled : 1,
       data.request_interval_ms || 3000, id]
    );
    return this.getShop(id);
  }

  deleteShop(id) {
    this._run('DELETE FROM price_records WHERE shop_id = ?', [id]);
    this._run('DELETE FROM shops WHERE id = ?', [id]);
  }

  // ========== 価格履歴 ==========
  addPriceRecord(data) {
    return this._run(
      `INSERT INTO price_records (card_id, shop_id, price, original_price, stock_status, product_url, product_name)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [data.card_id, data.shop_id, data.price, data.original_price || data.price,
       data.stock_status || 'unknown', data.product_url || '', data.product_name || '']
    );
  }

  getLatestPrices(cardId) {
    // 各ショップの最安値を取得（価格ありレコード + リンクのみレコード）
    const priced = this._all(
      `SELECT pr.*, s.name as shop_name, s.url as shop_url
       FROM price_records pr
       JOIN shops s ON pr.shop_id = s.id
       WHERE pr.card_id = ? AND pr.price IS NOT NULL AND pr.price > 0
       AND pr.id IN (
         SELECT p2.id FROM price_records p2
         WHERE p2.card_id = pr.card_id AND p2.shop_id = pr.shop_id
           AND p2.price IS NOT NULL AND p2.price > 0
         ORDER BY p2.price ASC LIMIT 1
       )
       ORDER BY pr.price ASC`,
      [cardId]
    );
    // リンクのみ（price=NULL）のレコードも含める
    const linkOnly = this._all(
      `SELECT pr.*, s.name as shop_name, s.url as shop_url
       FROM price_records pr
       JOIN shops s ON pr.shop_id = s.id
       WHERE pr.card_id = ? AND pr.price IS NULL
       AND pr.shop_id NOT IN (SELECT DISTINCT shop_id FROM price_records WHERE card_id = ? AND price IS NOT NULL AND price > 0)
       AND pr.id IN (SELECT MAX(id) FROM price_records WHERE card_id = ? AND price IS NULL GROUP BY shop_id)`,
      [cardId, cardId, cardId]
    );
    return [...priced, ...linkOnly];
  }

  getPriceHistory(cardId, shopId, limit = 50) {
    return this._all(
      'SELECT * FROM price_records WHERE card_id = ? AND shop_id = ? ORDER BY fetched_at DESC LIMIT ?',
      [cardId, shopId, limit]
    );
  }

  getAllLatestPrices() {
    // 各カード×ショップの最安値レコードを取得
    const priced = this._all(
      `SELECT pr.*, s.name as shop_name, s.provider_type,
              c.name as card_name, c.set_name, c.rarity, c.target_price_min, c.target_price_max
       FROM price_records pr
       JOIN shops s ON pr.shop_id = s.id
       JOIN cards c ON pr.card_id = c.id
       WHERE pr.price IS NOT NULL AND pr.price > 0
       AND pr.price = (
         SELECT MIN(p2.price) FROM price_records p2
         WHERE p2.card_id = pr.card_id AND p2.shop_id = pr.shop_id
           AND p2.price IS NOT NULL AND p2.price > 0
       )
       AND pr.id = (
         SELECT MAX(p3.id) FROM price_records p3
         WHERE p3.card_id = pr.card_id AND p3.shop_id = pr.shop_id AND p3.price = pr.price
       )
       ORDER BY c.name, pr.price ASC`
    );
    // リンクのみ（price=NULL）も取得
    const linkOnly = this._all(
      `SELECT pr.*, s.name as shop_name, s.provider_type,
              c.name as card_name, c.set_name, c.rarity, c.target_price_min, c.target_price_max
       FROM price_records pr
       JOIN shops s ON pr.shop_id = s.id
       JOIN cards c ON pr.card_id = c.id
       WHERE pr.price IS NULL
       AND pr.id IN (
         SELECT MAX(id) FROM price_records WHERE price IS NULL GROUP BY card_id, shop_id
       )
       ORDER BY c.name`
    );
    return [...priced, ...linkOnly];
  }

  // ========== アラート ==========
  getAllAlerts() {
    return this._all(
      `SELECT a.*, c.name as card_name, c.set_name, c.rarity
       FROM alerts a
       JOIN cards c ON a.card_id = c.id
       ORDER BY a.created_at DESC`
    );
  }

  getActiveAlerts() {
    return this._all(
      `SELECT a.*, c.name as card_name, c.target_price_min, c.target_price_max
       FROM alerts a
       JOIN cards c ON a.card_id = c.id
       WHERE a.is_active = 1`
    );
  }

  createAlert(data) {
    return this._run(
      `INSERT INTO alerts (card_id, condition_type, condition_value, notify_browser, notify_email)
       VALUES (?, ?, ?, ?, ?)`,
      [data.card_id, data.condition_type || 'price_below', data.condition_value || 0,
       data.notify_browser !== undefined ? data.notify_browser : 1,
       data.notify_email !== undefined ? data.notify_email : 0]
    );
  }

  updateAlert(id, data) {
    this._run(
      `UPDATE alerts SET condition_type = ?, condition_value = ?,
        notify_browser = ?, notify_email = ?, is_active = ?
       WHERE id = ?`,
      [data.condition_type, data.condition_value,
       data.notify_browser !== undefined ? data.notify_browser : 1,
       data.notify_email !== undefined ? data.notify_email : 0,
       data.is_active !== undefined ? data.is_active : 1, id]
    );
  }

  deleteAlert(id) {
    this._run('DELETE FROM alerts WHERE id = ?', [id]);
  }

  addAlertHistory(data) {
    return this._run(
      `INSERT INTO alert_history (alert_id, card_id, shop_id, triggered_price, message)
       VALUES (?, ?, ?, ?, ?)`,
      [data.alert_id, data.card_id, data.shop_id, data.triggered_price, data.message || '']
    );
  }

  getAlertHistory(limit = 50) {
    return this._all(
      `SELECT ah.*, c.name as card_name, s.name as shop_name
       FROM alert_history ah
       JOIN cards c ON ah.card_id = c.id
       LEFT JOIN shops s ON ah.shop_id = s.id
       ORDER BY ah.notified_at DESC LIMIT ?`,
      [limit]
    );
  }

  // ========== AI分析 ==========
  getAiAnalysis(cardId) {
    return this._get(
      'SELECT * FROM ai_analyses WHERE card_id = ? ORDER BY analyzed_at DESC LIMIT 1',
      [cardId]
    );
  }

  saveAiAnalysis(cardId, analysisJson, tokenCount) {
    return this._run(
      'INSERT INTO ai_analyses (card_id, analysis_json, token_count) VALUES (?, ?, ?)',
      [cardId, JSON.stringify(analysisJson), tokenCount || 0]
    );
  }

  // ========== 設定 ==========
  getSetting(key) {
    const row = this._get('SELECT value FROM settings WHERE key = ?', [key]);
    return row ? row.value : null;
  }

  setSetting(key, value) {
    // UPSERT: sql.jsでON CONFLICTを使う
    const existing = this._get('SELECT key FROM settings WHERE key = ?', [key]);
    if (existing) {
      this._run('UPDATE settings SET value = ?, updated_at = datetime(\'now\', \'localtime\') WHERE key = ?',
        [String(value), key]);
    } else {
      this._run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, String(value)]);
    }
  }

  getAllSettings() {
    const rows = this._all('SELECT key, value FROM settings');
    const obj = {};
    rows.forEach(r => { obj[r.key] = r.value; });
    return obj;
  }

  // ========== プッシュ通知 ==========
  savePushSubscription(subscription) {
    const existing = this._get('SELECT id FROM push_subscriptions WHERE endpoint = ?', [subscription.endpoint]);
    if (existing) {
      this._run('UPDATE push_subscriptions SET keys_json = ? WHERE endpoint = ?',
        [JSON.stringify(subscription.keys), subscription.endpoint]);
    } else {
      this._run('INSERT INTO push_subscriptions (endpoint, keys_json) VALUES (?, ?)',
        [subscription.endpoint, JSON.stringify(subscription.keys)]);
    }
  }

  getAllPushSubscriptions() {
    return this._all('SELECT * FROM push_subscriptions');
  }

  removePushSubscription(endpoint) {
    this._run('DELETE FROM push_subscriptions WHERE endpoint = ?', [endpoint]);
  }

  close() {
    if (this.db) {
      this._save();
      this.db.close();
    }
  }
}

// シングルトン（非同期初期化対応）
let instance = null;
let initPromise = null;

async function getDB() {
  if (instance && instance._ready) return instance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    instance = new DB();
    await instance.initialize();
    return instance;
  })();

  return initPromise;
}

module.exports = { getDB };
