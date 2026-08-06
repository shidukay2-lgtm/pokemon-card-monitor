// データベース初期化 & シードスクリプト
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function seed() {
  // DB削除して再作成
  const fs = require('fs');
  const dbPath = path.join(__dirname, 'data', 'pokemon-cards.db');
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
    console.log('旧DB削除');
  }

  const { getDB } = require('./src/models/db');
  const db = await getDB();
  console.log('DB初期化完了');

  // ショップのsearch_url_pattern更新（スキーマのデフォルトはOK、念のため上書き）
  const shopUpdates = [
    { id: 1, name: '楽天市場', url: 'https://www.rakuten.co.jp/', search_url_pattern: 'https://search.rakuten.co.jp/search/mall/{keyword}/', provider_type: 'rakuten-api' },
    { id: 2, name: 'Yahoo!ショッピング', url: 'https://shopping.yahoo.co.jp/', search_url_pattern: 'https://shopping.yahoo.co.jp/search?p={keyword}', provider_type: 'yahoo-api' },
    { id: 3, name: '駿河屋', url: 'https://www.suruga-ya.jp/', search_url_pattern: 'https://www.suruga-ya.jp/search?category=&search_word={keyword}', provider_type: 'surugaya-scraper' },
    { id: 4, name: '遊々亭', url: 'https://yuyu-tei.jp/', search_url_pattern: 'https://yuyu-tei.jp/sell/poc/s/{keyword}', provider_type: 'yuyutei-scraper' },
    { id: 5, name: 'カードラッシュ', url: 'https://www.cardrush-pokemon.jp/', search_url_pattern: 'https://www.cardrush-pokemon.jp/?mode=srh&keyword={keyword}', provider_type: 'cardrush-scraper' },
    { id: 6, name: 'メルカリ', url: 'https://jp.mercari.com/', search_url_pattern: 'https://jp.mercari.com/search?keyword={keyword}', provider_type: 'mercari-scraper' },
    { id: 7, name: 'Amazon', url: 'https://www.amazon.co.jp/', search_url_pattern: 'https://www.amazon.co.jp/s?k={keyword}', provider_type: 'link-only' },
    { id: 8, name: 'トレトク', url: 'https://www.toretoku.jp/', search_url_pattern: 'https://www.toretoku.jp/purchaselist/pokemon/?sword={keyword}', provider_type: 'link-only' },
  ];

  for (const shop of shopUpdates) {
    db.updateShop(shop.id, { ...shop, is_active: 1, scrape_enabled: 1, request_interval_ms: 3000 });
  }
  console.log(`ショップ更新: ${shopUpdates.length}件`);

  // カード登録
  const cards = [
    { name: 'リザードンex SAR', set_name: '黒炎の支配者', rarity: 'SAR', card_number: '201/190', target_price_min: 8000, target_price_max: 20000 },
    { name: 'ナンジャモ SR', set_name: 'クレイバースト', rarity: 'SR', card_number: '091/071', target_price_min: 10000, target_price_max: 30000 },
    { name: 'エリカの招待 SAR', set_name: 'ポケモンカード151', rarity: 'SAR', card_number: '206/165', target_price_min: 15000, target_price_max: 40000 },
    { name: 'ピカチュウex SAR', set_name: 'スカーレットex', rarity: 'SAR', card_number: '104/078', target_price_min: 3000, target_price_max: 8000 },
    { name: 'リーリエの全力 SR', set_name: 'ドリームリーグ', rarity: 'SR', card_number: '068/049', target_price_min: 20000, target_price_max: 60000 },
    { name: 'ブラッキーV SA', set_name: 'イーブイヒーローズ', rarity: 'SA', card_number: '085/069', target_price_min: 15000, target_price_max: 50000 },
    { name: 'ルギアV SA', set_name: 'パラダイムトリガー', rarity: 'SAR', card_number: '109/098', target_price_min: 3000, target_price_max: 10000 },
    { name: 'ミュウツーex UR', set_name: 'ポケモンカード151', rarity: 'UR', card_number: '183/165', target_price_min: 5000, target_price_max: 15000 },
  ];

  for (const card of cards) {
    db.createCard(card);
  }
  console.log(`カード登録: ${cards.length}枚`);

  // 登録確認
  const allCards = db.getAllCards();
  for (const c of allCards) {
    console.log(`  ${c.id}: ${c.name} [${c.rarity}] 目標${c.target_price_min}-${c.target_price_max}円`);
  }

  const allShops = db.getAllShops();
  for (const s of allShops) {
    console.log(`  ${s.id}: ${s.name} [${s.provider_type}] active:${s.is_active}`);
  }

  // アラート設定
  const alerts = [
    { card_id: 1, condition_type: 'price_below', condition_value: 15000, notify_browser: 1, notify_email: 0 },
    { card_id: 2, condition_type: 'price_below', condition_value: 25000, notify_browser: 1, notify_email: 0 },
    { card_id: 3, condition_type: 'price_below', condition_value: 30000, notify_browser: 1, notify_email: 0 },
    { card_id: 5, condition_type: 'price_below', condition_value: 50000, notify_browser: 1, notify_email: 0 },
    { card_id: 6, condition_type: 'price_below', condition_value: 40000, notify_browser: 1, notify_email: 0 },
  ];

  for (const alert of alerts) {
    db.createAlert(alert);
  }
  console.log(`アラート設定: ${alerts.length}件`);

  db.close();
  console.log('\n✅ シード完了！ node server.js で起動してください。');
  process.exit(0);
}

seed().catch(err => {
  console.error('エラー:', err);
  process.exit(1);
});
