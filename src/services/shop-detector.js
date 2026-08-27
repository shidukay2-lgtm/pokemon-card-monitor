const axios = require('axios');
const cheerio = require('cheerio');
const { Logger } = require('../utils/logger');
const logger = new Logger('[ショップ自動検出]');

// 主要ポケカショップ・ECサイトのプリセット辞書
const PRESET_SHOPS = [
  {
    keywords: ['メルカリ', 'mercari'],
    name: 'メルカリ',
    url: 'https://jp.mercari.com',
    search_url_pattern: 'https://jp.mercari.com/search?keyword={keyword}',
    provider_type: 'mercari-scraper',
    scrape_enabled: 1,
    request_interval_ms: 3000,
    description: 'フリマ最大手・リアルタイム最安値スクレイピング対応'
  },
  {
    keywords: ['駿河屋', 'surugaya', 'suruga'],
    name: '駿河屋',
    url: 'https://www.suruga-ya.jp',
    search_url_pattern: 'https://www.suruga-ya.jp/search?category=50101&search_word={keyword}',
    provider_type: 'surugaya-scraper',
    scrape_enabled: 1,
    request_interval_ms: 3000,
    description: 'トレカ通販大手・ポケカカテゴリ自動検索スクレイピング対応'
  },
  {
    keywords: ['遊々亭', 'yuyutei', 'yuyu'],
    name: '遊々亭',
    url: 'https://yuyu-tei.jp',
    search_url_pattern: 'https://yuyu-tei.jp/sell/poc/s/search?search_word={keyword}',
    provider_type: 'yuyutei-scraper',
    scrape_enabled: 1,
    request_interval_ms: 3000,
    description: 'TCG専門店・リアルタイム在庫＆買取相場スクレイピング対応'
  },
  {
    keywords: ['カードラッシュ', 'cardrush', 'card-rush'],
    name: 'カードラッシュ',
    url: 'https://www.cardrush-pokemon.jp',
    search_url_pattern: 'https://www.cardrush-pokemon.jp/?mode=srh&keyword={keyword}',
    provider_type: 'cardrush-scraper',
    scrape_enabled: 1,
    request_interval_ms: 3000,
    description: 'ポケカ専門店・最安値スクレイピング対応'
  },
  {
    keywords: ['楽天', '楽天市場', 'rakuten'],
    name: '楽天市場',
    url: 'https://www.rakuten.co.jp',
    search_url_pattern: 'https://search.rakuten.co.jp/search/mall/{keyword}/',
    provider_type: 'rakuten-api',
    scrape_enabled: 1,
    request_interval_ms: 2000,
    description: '楽天公式APIによる高速・安定データ取得'
  },
  {
    keywords: ['yahoo', 'ヤフー', 'ヤフーショッピング', 'paypayモール'],
    name: 'Yahoo!ショッピング',
    url: 'https://shopping.yahoo.co.jp',
    search_url_pattern: 'https://shopping.yahoo.co.jp/search?p={keyword}',
    provider_type: 'yahoo-api',
    scrape_enabled: 1,
    request_interval_ms: 2000,
    description: 'Yahoo!ショッピング公式APIによるデータ取得'
  },
  {
    keywords: ['トレマ', 'torema', 'tcgmp', 'トレマ通販'],
    name: 'トレマ',
    url: 'https://www.tcgmp.jp',
    search_url_pattern: 'https://www.tcgmp.jp/product/?prc_id=5&word={keyword}',
    provider_type: 'link-only',
    scrape_enabled: 0,
    request_interval_ms: 3000,
    description: 'トレカ通販モール（ポケカカテゴリ検索リンク生成・推奨: link-only）'
  },
  {
    keywords: ['晴れる屋', '晴れる屋2', 'hareruya', 'hareruya2'],
    name: '晴れる屋2',
    url: 'https://www.hareruya2.com',
    search_url_pattern: 'https://www.hareruya2.com/product-list?keyword={keyword}',
    provider_type: 'link-only',
    scrape_enabled: 0,
    request_interval_ms: 3000,
    description: 'ポケカ専門大規模店（リンク生成推奨）'
  },
  {
    keywords: ['トレトク', 'toretoku'],
    name: 'トレトク',
    url: 'https://www.toretoku.jp',
    search_url_pattern: 'https://www.toretoku.jp/purchaselist/pokemon/?sword={keyword}',
    provider_type: 'link-only',
    scrape_enabled: 0,
    request_interval_ms: 3000,
    description: 'トレカ通販専門店（リンク生成推奨）'
  },
  {
    keywords: ['ドラゴンスター', 'dorasuta', 'dragonstar'],
    name: 'ドラゴンスター',
    url: 'https://dorasuta.jp',
    search_url_pattern: 'https://dorasuta.jp/pokemon-card/product-list?kw={keyword}',
    provider_type: 'link-only',
    scrape_enabled: 0,
    request_interval_ms: 3000,
    description: 'TCG専門店・通販サイト（リンク生成推奨）'
  },
  {
    keywords: ['カードラボ', 'c-labo', 'cardlabo'],
    name: 'カードラボ',
    url: 'https://www.c-labo-online.jp',
    search_url_pattern: 'https://www.c-labo-online.jp/product-list?keyword={keyword}',
    provider_type: 'link-only',
    scrape_enabled: 0,
    request_interval_ms: 3000,
    description: 'アニメイト系列TCG専門店（リンク生成推奨）'
  },
  {
    keywords: ['フルコンプ', 'fullcomp'],
    name: 'フルコンプ',
    url: 'https://www.fullcomp-online.com',
    search_url_pattern: 'https://www.fullcomp-online.com/product-list?keyword={keyword}',
    provider_type: 'link-only',
    scrape_enabled: 0,
    request_interval_ms: 3000,
    description: 'TCG大型専門店通販（リンク生成推奨）'
  },
  {
    keywords: ['ホビーステーション', 'hobbystation', 'hobbysta'],
    name: 'ホビーステーション',
    url: 'https://www.hobbystation-single.jp',
    search_url_pattern: 'https://www.hobbystation-single.jp/product-list?keyword={keyword}',
    provider_type: 'link-only',
    scrape_enabled: 0,
    request_interval_ms: 3000,
    description: '全国展開TCG専門店（リンク生成推奨）'
  },
  {
    keywords: ['あみあみ', 'amiami'],
    name: 'あみあみ',
    url: 'https://www.amiami.jp',
    search_url_pattern: 'https://www.amiami.jp/top/detail/review?scode=&keyword={keyword}',
    provider_type: 'link-only',
    scrape_enabled: 0,
    request_interval_ms: 3000,
    description: 'ホビー・TCG総合通販（リンク生成推奨）'
  },
  {
    keywords: ['magi', 'マギ'],
    name: 'magi (マギ)',
    url: 'https://magi.camp',
    search_url_pattern: 'https://magi.camp/items/search?item_name={keyword}',
    provider_type: 'link-only',
    scrape_enabled: 0,
    request_interval_ms: 3000,
    description: 'TCG専門フリマ・通販アプリ（リンク生成推奨）'
  },
  {
    keywords: ['bee本舗', 'beehonpo', 'ビーホンポ'],
    name: 'Bee本舗',
    url: 'https://beehonpo-online.com',
    search_url_pattern: 'https://beehonpo-online.com/product-list?keyword={keyword}',
    provider_type: 'link-only',
    scrape_enabled: 0,
    request_interval_ms: 3000,
    description: 'トレカ専門店通販（リンク生成推奨）'
  },
  {
    keywords: ['amazon', 'アマゾン'],
    name: 'Amazon',
    url: 'https://www.amazon.co.jp',
    search_url_pattern: 'https://www.amazon.co.jp/s?k={keyword}',
    provider_type: 'link-only',
    scrape_enabled: 0,
    request_interval_ms: 3000,
    description: '総合ECモール（リンク生成推奨）'
  },
  {
    keywords: ['ポケモンセンター', 'ポケセン', 'pokemoncenter'],
    name: 'ポケモンセンターオンライン',
    url: 'https://www.pokemoncenter-online.com',
    search_url_pattern: 'https://www.pokemoncenter-online.com/?main_page=product_list&keyword={keyword}',
    provider_type: 'link-only',
    scrape_enabled: 0,
    request_interval_ms: 3000,
    description: '公式ポケモンセンター通販（リンク生成推奨）'
  }
];

class ShopDetector {
  async detectShopInfo(query) {
    if (!query || typeof query !== 'string') {
      throw new Error('ショップ名またはURLを入力してください');
    }

    const q = query.trim();
    const isUrl = q.startsWith('http://') || q.startsWith('https://') || q.includes('.com') || q.includes('.jp') || q.includes('.net');

    // 1. プリセット辞書からの検索（キーワード完全一致または部分一致）
    const qLower = q.toLowerCase();
    const matchedPreset = PRESET_SHOPS.find(preset => {
      if (preset.name.toLowerCase().includes(qLower) || qLower.includes(preset.name.toLowerCase())) return true;
      if (preset.url.toLowerCase().includes(qLower) || qLower.includes(preset.url.toLowerCase())) return true;
      return preset.keywords.some(kw => qLower.includes(kw.toLowerCase()) || kw.toLowerCase().includes(qLower));
    });

    if (matchedPreset) {
      logger.info(`プリセット辞書に一致: ${matchedPreset.name}`);
      return {
        ...matchedPreset,
        source: 'preset',
        recommended_provider: matchedPreset.provider_type
      };
    }

    // 2. 未知のURLの場合: 実際にアクセスしてメタデータと検索パターンを自動推論
    if (isUrl) {
      let targetUrl = q;
      if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        targetUrl = `https://${targetUrl}`;
      }
      return await this._crawlAndDetectUrl(targetUrl);
    }

    // 3. 一般キーワードの場合: デフォルトの汎用検索URLを生成
    return {
      name: q,
      url: `https://www.google.com/search?q=${encodeURIComponent(q)}`,
      search_url_pattern: `https://www.google.com/search?q=${encodeURIComponent(q)}+{keyword}`,
      provider_type: 'link-only',
      recommended_provider: 'link-only',
      scrape_enabled: 0,
      request_interval_ms: 3000,
      source: 'generic',
      description: '汎用Web検索リンク（推奨: link-only）'
    };
  }

  async _crawlAndDetectUrl(targetUrl) {
    try {
      const parsedUrl = new URL(targetUrl);
      const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;
      logger.info(`未知のURLを解析中: ${baseUrl}`);

      const res = await axios.get(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
        },
        timeout: 8000
      });

      const $ = cheerio.load(res.data);

      // ショップ名の推定（OGPサイト名、タイトルタグ、またはドメイン）
      let siteName = $('meta[property="og:site_name"]').attr('content') ||
                     $('meta[name="site_name"]').attr('content') || '';

      if (!siteName) {
        const title = $('title').text().trim();
        if (title) {
          // 「晴れる屋2 - ポケモンカード通販」のようなタイトルからサイト名を抽出
          const parts = title.split(/[-|｜_／/]/);
          siteName = parts[0].trim().length > 1 ? parts[0].trim() : title.slice(0, 30);
        }
      }

      if (!siteName) {
        siteName = parsedUrl.hostname.replace(/^www\./, '');
      }

      // 検索フォームの検出
      let searchPattern = '';
      $('form').each((_, form) => {
        if (searchPattern) return;
        const $form = $(form);
        const action = $form.attr('action') || '';
        const method = ($form.attr('method') || 'GET').toUpperCase();
        
        const $input = $form.find('input[type="text"], input[type="search"], input:not([type])').first();
        const inputName = $input.attr('name');

        if (inputName && method === 'GET') {
          let fullAction = action;
          if (!fullAction.startsWith('http')) {
            fullAction = fullAction.startsWith('/') ? `${baseUrl}${fullAction}` : `${baseUrl}/${fullAction}`;
          }
          const sep = fullAction.includes('?') ? '&' : '?';
          searchPattern = `${fullAction}${sep}${inputName}={keyword}`;
        }
      });

      // 検索パターンが見つからない場合のフォールバック
      if (!searchPattern) {
        if (res.data.includes('product-list')) {
          searchPattern = `${baseUrl}/product-list?keyword={keyword}`;
        } else if (res.data.includes('search')) {
          searchPattern = `${baseUrl}/search?q={keyword}`;
        } else {
          searchPattern = `${baseUrl}/?s={keyword}`;
        }
      }

      return {
        name: siteName,
        url: baseUrl,
        search_url_pattern: searchPattern,
        provider_type: 'link-only',
        recommended_provider: 'link-only',
        scrape_enabled: 0,
        request_interval_ms: 3000,
        source: 'crawled',
        description: 'Webサイトから自動推論（推奨: link-only）'
      };
    } catch (e) {
      logger.warn(`URL解析失敗(${e.message}) - 基本情報で生成`);
      try {
        const parsed = new URL(targetUrl);
        const baseUrl = `${parsed.protocol}//${parsed.host}`;
        return {
          name: parsed.hostname.replace(/^www\./, ''),
          url: baseUrl,
          search_url_pattern: `${baseUrl}/search?q={keyword}`,
          provider_type: 'link-only',
          recommended_provider: 'link-only',
          scrape_enabled: 0,
          request_interval_ms: 3000,
          source: 'fallback',
          description: '基本URL構成（推奨: link-only）'
        };
      } catch {
        throw new Error('有効なURLまたはショップ名を入力してください');
      }
    }
  }
}

let instance = null;
function getShopDetector() {
  if (!instance) instance = new ShopDetector();
  return instance;
}

module.exports = { getShopDetector, ShopDetector };
