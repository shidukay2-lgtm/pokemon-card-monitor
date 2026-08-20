-- 監視対象カード
CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  set_name TEXT DEFAULT '',
  rarity TEXT DEFAULT '',
  card_number TEXT DEFAULT '',
  target_price_min INTEGER DEFAULT 0,
  target_price_max INTEGER DEFAULT 0,
  include_keywords TEXT DEFAULT '',
  exclude_keywords TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT DEFAULT (datetime('now', 'localtime'))
);

-- ショップ情報
CREATE TABLE IF NOT EXISTS shops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  search_url_pattern TEXT DEFAULT '',
  provider_type TEXT NOT NULL DEFAULT 'link-only',
  is_active INTEGER DEFAULT 1,
  scrape_enabled INTEGER DEFAULT 1,
  request_interval_ms INTEGER DEFAULT 3000,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT DEFAULT (datetime('now', 'localtime'))
);

-- 価格履歴
CREATE TABLE IF NOT EXISTS price_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER NOT NULL,
  shop_id INTEGER NOT NULL,
  price INTEGER,
  original_price INTEGER,
  stock_status TEXT DEFAULT 'unknown',
  product_url TEXT DEFAULT '',
  product_name TEXT DEFAULT '',
  fetched_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
);

-- アラート設定
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER NOT NULL,
  condition_type TEXT NOT NULL DEFAULT 'price_below',
  condition_value INTEGER NOT NULL DEFAULT 0,
  notify_browser INTEGER DEFAULT 1,
  notify_email INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
);

-- アラート発火履歴
CREATE TABLE IF NOT EXISTS alert_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_id INTEGER NOT NULL,
  card_id INTEGER NOT NULL,
  shop_id INTEGER,
  triggered_price INTEGER,
  message TEXT DEFAULT '',
  notified_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (alert_id) REFERENCES alerts(id) ON DELETE CASCADE,
  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
);

-- AI診断結果キャッシュ
CREATE TABLE IF NOT EXISTS ai_analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER NOT NULL,
  analysis_json TEXT NOT NULL DEFAULT '{}',
  token_count INTEGER DEFAULT 0,
  analyzed_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
);

-- アプリ設定の永続化
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TEXT DEFAULT (datetime('now', 'localtime'))
);

-- プッシュ通知サブスクリプション
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT NOT NULL UNIQUE,
  keys_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_price_records_card ON price_records(card_id);
CREATE INDEX IF NOT EXISTS idx_price_records_shop ON price_records(shop_id);
CREATE INDEX IF NOT EXISTS idx_price_records_fetched ON price_records(fetched_at);
CREATE INDEX IF NOT EXISTS idx_alerts_card ON alerts(card_id);
CREATE INDEX IF NOT EXISTS idx_ai_analyses_card ON ai_analyses(card_id);

-- デフォルト設定の挿入
INSERT OR IGNORE INTO settings (key, value) VALUES ('patrol_enabled', 'true');
INSERT OR IGNORE INTO settings (key, value) VALUES ('patrol_interval', '30');
INSERT OR IGNORE INTO settings (key, value) VALUES ('notification_method', 'browser');
INSERT OR IGNORE INTO settings (key, value) VALUES ('notification_email', '');
INSERT OR IGNORE INTO settings (key, value) VALUES ('filter_exclude_other_tcg', 'true');
INSERT OR IGNORE INTO settings (key, value) VALUES ('filter_exclude_supplies', 'true');
INSERT OR IGNORE INTO settings (key, value) VALUES ('filter_strict_mode', 'score');
INSERT OR IGNORE INTO settings (key, value) VALUES ('filter_custom_exclude', '');
INSERT OR IGNORE INTO settings (key, value) VALUES ('filter_custom_include', '');

-- デフォルトショップ登録
INSERT OR IGNORE INTO shops (id, name, url, search_url_pattern, provider_type) VALUES
  (1, '楽天市場', 'https://www.rakuten.co.jp/', 'https://search.rakuten.co.jp/search/mall/{keyword}/', 'rakuten-api'),
  (2, 'Yahoo!ショッピング', 'https://shopping.yahoo.co.jp/', 'https://shopping.yahoo.co.jp/search?p={keyword}', 'yahoo-api'),
  (3, '駿河屋', 'https://www.suruga-ya.jp/', 'https://www.suruga-ya.jp/search?category=50101&search_word={keyword}', 'surugaya-scraper'),
  (4, '遊々亭', 'https://yuyu-tei.jp/', 'https://yuyu-tei.jp/sell/poc/s/{keyword}', 'yuyutei-scraper'),
  (5, 'カードラッシュ', 'https://www.cardrush-pokemon.jp/', 'https://www.cardrush-pokemon.jp/?mode=srh&keyword={keyword}', 'link-only'),
  (6, 'メルカリ', 'https://jp.mercari.com/', 'https://jp.mercari.com/search?keyword={keyword}', 'link-only'),
  (7, 'Amazon', 'https://www.amazon.co.jp/', 'https://www.amazon.co.jp/s?k={keyword}', 'link-only'),
  (8, 'トレトク', 'https://www.toretoku.jp/', 'https://www.toretoku.jp/purchaselist/pokemon/?sword={keyword}', 'link-only');
