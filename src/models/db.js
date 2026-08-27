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

    // 既存テーブルのカラムマイグレーション（include_keywords, exclude_keywords）
    try {
      this.db.run('ALTER TABLE cards ADD COLUMN include_keywords TEXT DEFAULT ""');
    } catch (e) { /* すでに存在する場合は無視 */ }
    try {
      this.db.run('ALTER TABLE cards ADD COLUMN exclude_keywords TEXT DEFAULT ""');
    } catch (e) { /* すでに存在する場合は無視 */ }
    // 駿河屋のカテゴリURL更新
    try {
      this.db.run("UPDATE shops SET search_url_pattern = 'https://www.suruga-ya.jp/search?category=50101&search_word={keyword}' WHERE name = '駿河屋' AND search_url_pattern LIKE '%category=&%'");
    } catch (e) { /* ignore */ }
    // トレマの検索URL・URL更新
    try {
      this.db.run("UPDATE shops SET url = 'https://www.tcgmp.jp', search_url_pattern = 'https://www.tcgmp.jp/product/?prc_id=5&word={keyword}', provider_type = 'link-only' WHERE name LIKE '%トレマ%' OR url LIKE '%torema.jp%'");
    } catch (e) { /* ignore */ }

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
    try {
      const res = this.db.exec('SELECT last_insert_rowid() as id');
      if (res.length > 0 && res[0].values.length > 0) {
        return { lastInsertRowid: res[0].values[0][0] };
      }
    } catch (e) {
      // ignore
    }
    return { lastInsertRowid: 0 };
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
    this._run(
      `INSERT INTO cards (name, set_name, rarity, card_number, target_price_min, target_price_max, include_keywords, exclude_keywords, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.name, data.set_name || '', data.rarity || '', data.card_number || '',
       data.target_price_min || 0, data.target_price_max || 0,
       data.include_keywords || '', data.exclude_keywords || '', data.notes || '']
    );
    const last = this._get('SELECT * FROM cards ORDER BY id DESC LIMIT 1');
    return last;
  }

  updateCard(id, data) {
    const existing = this.getCard(id);
    if (!existing) return null;
    const merged = { ...existing, ...data };
    this._run(
      `UPDATE cards SET name = ?, set_name = ?, rarity = ?, card_number = ?,
        target_price_min = ?, target_price_max = ?, include_keywords = ?, exclude_keywords = ?, notes = ?, is_active = ?,
        updated_at = datetime('now', 'localtime')
       WHERE id = ?`,
      [merged.name, merged.set_name || '', merged.rarity || '', merged.card_number || '',
       merged.target_price_min || 0, merged.target_price_max || 0,
       merged.include_keywords || '', merged.exclude_keywords || '', merged.notes || '',
       merged.is_active !== undefined ? merged.is_active : 1, id]
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
    this._run(
      `INSERT INTO shops (name, url, search_url_pattern, provider_type, scrape_enabled, request_interval_ms)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [data.name, data.url, data.search_url_pattern || '',
       data.provider_type || 'link-only', data.scrape_enabled !== undefined ? data.scrape_enabled : 1,
       data.request_interval_ms || 3000]
    );
    return this._get('SELECT * FROM shops ORDER BY id DESC LIMIT 1');
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
    // 各ショップの最新巡回レコード（MAX(id)）を取得
    return this._all(
      `SELECT pr.*, s.name as shop_name, s.url as shop_url
       FROM price_records pr
       JOIN shops s ON pr.shop_id = s.id
       WHERE pr.card_id = ?
       AND pr.id IN (
         SELECT MAX(p2.id) FROM price_records p2
         WHERE p2.card_id = ?
         GROUP BY p2.shop_id
       )
       ORDER BY CASE WHEN pr.price IS NULL THEN 1 ELSE 0 END, pr.price ASC`,
      [cardId, cardId]
    );
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
    const row = this._get(
      'SELECT * FROM ai_analyses WHERE card_id = ? ORDER BY analyzed_at DESC LIMIT 1',
      [cardId]
    );
    if (!row) return null;
    try {
      const parsed = JSON.parse(row.analysis_json);
      return { ...parsed, analyzed_at: row.analyzed_at };
    } catch {
      return null;
    }
  }

  getAllLatestAiAnalyses() {
    const rows = this._all(
      `SELECT a1.* FROM ai_analyses a1
       INNER JOIN (
         SELECT card_id, MAX(id) as max_id
         FROM ai_analyses
         GROUP BY card_id
       ) a2 ON a1.id = a2.max_id`
    );
    const map = {};
    rows.forEach(r => {
      try {
        const parsed = JSON.parse(r.analysis_json);
        map[r.card_id] = { ...parsed, analyzed_at: r.analyzed_at };
      } catch (e) {}
    });
    return map;
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

  // ========== 抽出条件設定 ==========
  getFilterSettings() {
    return {
      exclude_other_tcg: this.getSetting('filter_exclude_other_tcg', 'true') === 'true',
      exclude_supplies: this.getSetting('filter_exclude_supplies', 'true') === 'true',
      strict_mode: this.getSetting('filter_strict_mode', 'score'),
      custom_exclude: this.getSetting('filter_custom_exclude', ''),
      custom_include: this.getSetting('filter_custom_include', ''),
    };
  }

  updateFilterSettings(settings = {}) {
    if (settings.exclude_other_tcg !== undefined) {
      this.setSetting('filter_exclude_other_tcg', String(settings.exclude_other_tcg));
    }
    if (settings.exclude_supplies !== undefined) {
      this.setSetting('filter_exclude_supplies', String(settings.exclude_supplies));
    }
    if (settings.strict_mode !== undefined) {
      this.setSetting('filter_strict_mode', String(settings.strict_mode));
    }
    if (settings.custom_exclude !== undefined) {
      this.setSetting('filter_custom_exclude', String(settings.custom_exclude));
    }
    if (settings.custom_include !== undefined) {
      this.setSetting('filter_custom_include', String(settings.custom_include));
    }
    return this.getFilterSettings();
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
