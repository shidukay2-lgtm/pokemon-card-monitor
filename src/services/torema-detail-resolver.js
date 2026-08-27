const axios = require('axios');
const cheerio = require('cheerio');
const { Logger } = require('../utils/logger');
const logger = new Logger('[トレマ個別ページ解決]');

// メモリ内URLキャッシュ
const toremaUrlCache = new Map();

// 主要カードの既知のトレマ個別商品ID辞書（フォールバック＆超高速解決用）
const KNOWN_TOREMA_IDS = {
  'エリカの招待 SAR': '469730',
  'エリカの招待': '469730',
  'タロ SAR': '562769',
  'タロ': '562769',
  'ミモザ SAR': '424045',
  'ミモザ': '424045',
  'ナンジャモ SAR': '457811',
  'ナンジャモ SR': '457812',
  'ナンジャモ': '457812',
  'リザードンex SAR': '482200',
  'ピカチュウex SAR': '424001',
  'リーリエの全力 SR': '241503',
  'ブラッキーV SA': '342600',
  'ルギアV SA': '408100',
  'ミュウツーex UR': '469750'
};

class ToremaDetailResolver {
  /**
   * カード名からトレマの最安値個別商品詳細ページURLを取得
   * @param {string} cardName
   * @returns {Promise<string>}
   */
  async resolveDetailUrl(cardName) {
    if (!cardName) return 'https://www.tcgmp.jp';

    const normalized = cardName.trim();

    // 1. キャッシュ確認
    if (toremaUrlCache.has(normalized)) {
      return toremaUrlCache.get(normalized);
    }

    // 2. 既知のID辞書確認
    for (const [key, id] of Object.entries(KNOWN_TOREMA_IDS)) {
      if (normalized.includes(key) || key.includes(normalized)) {
        const url = `https://www.tcgmp.jp/product/detail?id=${id}&referer=1`;
        toremaUrlCache.set(normalized, url);
        return url;
      }
    }

    // 3. トレマの検索API/HTMLから動的に商品IDを探索
    try {
      const searchUrl = `https://www.tcgmp.jp/product/?order=I1&style=N&word=${encodeURIComponent(normalized)}&prc_id=44&alf=0`;
      const res = await axios.get(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
        },
        timeout: 5000
      });

      // gtag items から探索
      const gtagMatch = res.data.match(/'items':\s*(\[\s*\{[\s\S]*?\}\s*\])/);
      if (gtagMatch) {
        const items = JSON.parse(gtagMatch[1]);
        if (items && items.length > 0 && items[0].id) {
          const url = `https://www.tcgmp.jp/product/detail?id=${items[0].id}&referer=1`;
          toremaUrlCache.set(normalized, url);
          return url;
        }
      }

      // DOM から探索
      const $ = cheerio.load(res.data);
      const firstDetailLink = $('a[href*="/product/detail"]').first().attr('href');
      if (firstDetailLink) {
        const idMatch = firstDetailLink.match(/id=(\d+)/);
        if (idMatch) {
          const url = `https://www.tcgmp.jp/product/detail?id=${idMatch[1]}&referer=1`;
          toremaUrlCache.set(normalized, url);
          return url;
        }
      }
    } catch (e) {
      logger.warn(`個別URL探索失敗: ${e.message}`);
    }

    // フォールバック: 検索URL
    const fallback = `https://www.tcgmp.jp/product/?order=I1&style=N&word=${encodeURIComponent(normalized)}&prc_id=44&alf=0`;
    toremaUrlCache.set(normalized, fallback);
    return fallback;
  }
}

let instance = null;
function getToremaDetailResolver() {
  if (!instance) instance = new ToremaDetailResolver();
  return instance;
}

module.exports = { getToremaDetailResolver, ToremaDetailResolver, KNOWN_TOREMA_IDS };
