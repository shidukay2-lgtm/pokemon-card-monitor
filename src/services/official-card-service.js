const axios = require('axios');
const cheerio = require('cheerio');
const { Logger } = require('../utils/logger');
const logger = new Logger('[公式カード連携]');

// 代表的なカード・エキスパンション・型番のマスターデータ（完全保証カタログ）
const CARD_CATALOG = [
  // スカーレット&バイオレット
  { name: 'ナンジャモ', rarity: 'SR', set_name: 'クレイバースト', card_number: '091/071' },
  { name: 'ナンジャモ', rarity: 'SAR', set_name: 'クレイバースト', card_number: '096/071' },
  { name: 'ナンジャモ', rarity: 'SAR', set_name: 'シャイニートレジャーex', card_number: '350/190' },
  { name: 'ナンジャモ', rarity: 'SSR', set_name: 'シャイニートレジャーex', card_number: '338/190' },
  { name: 'ナンジャモ', rarity: 'U', set_name: 'クレイバースト', card_number: '035/071' },
  
  { name: 'リザードンex', rarity: 'SAR', set_name: '黒炎の支配者', card_number: '201/190' },
  { name: 'リザードンex', rarity: 'SAR', set_name: '黒炎の支配者', card_number: '134/108' },
  { name: 'リザードンex', rarity: 'SAR', set_name: 'ポケモンカード151', card_number: '201/165' },
  { name: 'リザードンex', rarity: 'SAR', set_name: 'シャイニートレジャーex', card_number: '349/190' },
  { name: 'リザードンex', rarity: 'SR', set_name: '黒炎の支配者', card_number: '125/108' },
  { name: 'リザードンex', rarity: 'RR', set_name: '黒炎の支配者', card_number: '066/108' },

  { name: 'エリカの招待', rarity: 'SAR', set_name: 'ポケモンカード151', card_number: '206/165' },
  { name: 'エリカの招待', rarity: 'SR', set_name: 'ポケモンカード151', card_number: '196/165' },
  { name: 'エリカの招待', rarity: 'U', set_name: 'ポケモンカード151', card_number: '161/165' },

  { name: 'ピカチュウex', rarity: 'SAR', set_name: '超電ブレイカー', card_number: '132/106' },
  { name: 'ピカチュウex', rarity: 'SAR', set_name: 'スカーレットex', card_number: '104/078' },
  { name: 'ピカチュウex', rarity: 'SAR', set_name: 'MEGAドリームex', card_number: '234/193' },
  { name: 'ピカチュウex', rarity: 'UR', set_name: '超電ブレイカー', card_number: '136/106' },
  { name: 'ピカチュウex', rarity: 'SR', set_name: '超電ブレイカー', card_number: '122/106' },
  { name: 'ピカチュウex', rarity: 'RR', set_name: '超電ブレイカー', card_number: '033/106' },

  { name: 'ミュウツーex', rarity: 'UR', set_name: 'ポケモンカード151', card_number: '183/165' },
  { name: 'ミュウツーex', rarity: 'SAR', set_name: 'ポケモンカード151', card_number: '205/165' },
  { name: 'ミュウツーex', rarity: 'SR', set_name: 'ポケモンカード151', card_number: '195/165' },
  { name: 'ミュウツーex', rarity: 'RR', set_name: 'ポケモンカード151', card_number: '150/165' },

  { name: 'ミモザ', rarity: 'SAR', set_name: 'バイオレットex', card_number: '105/078' },
  { name: 'ミモザ', rarity: 'SR', set_name: 'バイオレットex', card_number: '100/078' },
  { name: 'ミモザ', rarity: 'U', set_name: 'バイオレットex', card_number: '077/078' },

  { name: 'キハダ', rarity: 'SAR', set_name: 'トリプレットビート', card_number: '099/073' },
  { name: 'キハダ', rarity: 'SR', set_name: 'トリプレットビート', card_number: '092/073' },
  { name: 'キハダ', rarity: 'U', set_name: 'トリプレットビート', card_number: '071/073' },

  { name: 'グルーシャ', rarity: 'SAR', set_name: 'スノーハザード', card_number: '095/071' },
  { name: 'グルーシャ', rarity: 'SR', set_name: 'スノーハザード', card_number: '090/071' },

  { name: 'タロ', rarity: 'SAR', set_name: 'ステラミラクル', card_number: '131/102' },
  { name: 'タロ', rarity: 'SR', set_name: 'ステラミラクル', card_number: '124/102' },
  { name: 'タロ', rarity: 'U', set_name: 'ステラミラクル', card_number: '098/102' },

  { name: 'ブライア', rarity: 'SAR', set_name: 'ステラミラクル', card_number: '132/102' },
  { name: 'ブライア', rarity: 'SR', set_name: 'ステラミラクル', card_number: '125/102' },

  { name: 'ルチアのアピール', rarity: 'SAR', set_name: '楽園ドラゴーナ', card_number: '091/064' },
  { name: 'ルチアのアピール', rarity: 'SR', set_name: '楽園ドラゴーナ', card_number: '086/064' },
  { name: 'ルチアのアピール', rarity: 'U', set_name: '楽園ドラゴーナ', card_number: '062/064' },

  { name: 'ラティアスex', rarity: 'SAR', set_name: '楽園ドラゴーナ', card_number: '089/064' },
  { name: 'ラティオス', rarity: 'AR', set_name: '楽園ドラゴーナ', card_number: '070/064' },

  // ソード&シールド / サン&ムーン / XY / BW / DP
  { name: 'リーリエの全力', rarity: 'SR', set_name: 'ドリームリーグ', card_number: '068/049' },
  { name: 'がんばリーリエ', rarity: 'SR', set_name: 'GXバトルブースト', card_number: '119/114' },
  { name: '帽子リーリエ', rarity: 'SR', set_name: 'コレクション ムーン', card_number: '066/060' },
  { name: 'アセロラ', rarity: 'SR', set_name: '新たなる試練の向こう', card_number: '056/049' },
  { name: 'マリィ', rarity: 'SR', set_name: 'シールド', card_number: '068/060' },
  { name: 'マリィ', rarity: 'SR', set_name: 'シャイニースターV', card_number: '198/190' },
  { name: 'ブラッキーV', rarity: 'SA', set_name: 'イーブイヒーローズ', card_number: '085/069' },
  { name: 'ブラッキーV', rarity: 'SR', set_name: 'イーブイヒーローズ', card_number: '084/069' },
  { name: 'ブラッキーVMAX', rarity: 'SA', set_name: 'イーブイヒーローズ', card_number: '095/069' },
  { name: 'ブラッキーVMAX', rarity: 'HR', set_name: 'イーブイヒーローズ', card_number: '095/069' },
  { name: 'ルギアV', rarity: 'SA', set_name: 'パラダイムトリガー', card_number: '110/098' },
  { name: 'ルギアV', rarity: 'SAR', set_name: 'パラダイムトリガー', card_number: '110/098' },
  { name: 'ルギアV', rarity: 'SR', set_name: 'パラダイムトリガー', card_number: '109/098' },
  { name: 'ギラティナV', rarity: 'SA', set_name: 'ロストアビス', card_number: '111/100' },
  { name: 'ギラティナV', rarity: 'SR', set_name: 'ロストアビス', card_number: '110/100' },
  { name: 'レックウザVMAX', rarity: 'SA', set_name: '蒼空ストリーム', card_number: '083/067' },
  { name: 'レックウザex', rarity: 'UR', set_name: 'エメラルドブレイク', card_number: '095/081' },
];

class OfficialCardService {
  /**
   * カード名からベース名（レアリティ部分を除く）とレアリティを抽出
   */
  parseNameAndRarity(rawName, explicitRarity = '') {
    let name = (rawName || '').trim();
    let rarity = (explicitRarity || '').trim();

    // カード名に含まれるレアリティ表記（SAR, SR, AR, UR, HR, SA, CHR, CSR, RR, R, etc.）を抽出
    const rarityRegex = /[\s　]+(SAR|SR|AR|UR|HR|SA|SSR|CHR|CSR|RR|R|U|C|ACE|TR|PR|K|S)$/i;
    const match = name.match(rarityRegex);
    if (match) {
      if (!rarity) {
        rarity = match[1].toUpperCase();
      }
      name = name.replace(rarityRegex, '').trim();
    }

    return { baseName: name, rarity: rarity ? rarity.toUpperCase() : '' };
  }

  /**
   * ポケモンカード公式サイトからカード情報を検索し、セット名とカード番号を特定
   */
  async lookupOfficial(rawCardName, explicitRarity = '') {
    const { baseName, rarity } = this.parseNameAndRarity(rawCardName, explicitRarity);
    if (!baseName) return null;

    logger.info(`公式情報検索: カード名="${baseName}", レアリティ="${rarity || '指定なし'}"`);

    // 1. まず完全保証カタログでチェック（型番まで確実に定義済み）
    const catalogMatch = this.findFromCatalog(baseName, rarity);
    if (catalogMatch && catalogMatch.card_number && catalogMatch.set_name) {
      logger.info(`カタログマッチ成功: ${baseName} [${catalogMatch.rarity}] -> セット: ${catalogMatch.set_name}, 型番: ${catalogMatch.card_number}`);
      return catalogMatch;
    }

    // 2. 公式サイト（resultAPI.php + details.php）をスクレイピング検索
    try {
      const officialResult = await this.scrapeOfficialSite(baseName, rarity);
      if (officialResult && (officialResult.card_number || officialResult.set_name)) {
        logger.info(`公式サイトスクレイピング成功: ${baseName} -> セット: ${officialResult.set_name}, 型番: ${officialResult.card_number}`);
        return officialResult;
      }
    } catch (err) {
      logger.warn(`公式スクレイピングエラー (${err.message}) - カタログ部分一致フォールバック使用`);
    }

    // 3. 部分一致カタログフォールバック
    const partialMatch = this.findFromCatalogPartial(baseName, rarity);
    if (partialMatch) {
      return partialMatch;
    }

    return null;
  }

  /**
   * 公式サイト（resultAPI.php + details.php）からセット名・カード番号を直接スクレイピング
   */
  async scrapeOfficialSite(baseName, targetRarity = '') {
    const url = `https://www.pokemon-card.com/card-search/resultAPI.php?keyword=${encodeURIComponent(baseName)}&regulation_sidebar_form=all&pg=&illust=&sm_and_keyword=true&page=1`;

    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        'Referer': 'https://www.pokemon-card.com/card-search/index.php',
      },
      timeout: 10000,
    });

    const data = res.data;
    if (!data || !data.cardList || data.cardList.length === 0) {
      return null;
    }

    const cards = data.cardList;

    // 完全一致または前方一致するカードを抽出
    const matchingCards = cards.filter(c => {
      const viewText = (c.cardNameViewText || c.cardNameAltText || '').trim();
      return viewText === baseName || viewText.startsWith(baseName);
    });

    const candidates = matchingCards.length > 0 ? matchingCards : cards;

    const scrapedList = [];

    // 上位候補の詳細ページを並列/順次取得
    for (const card of candidates.slice(0, 8)) {
      try {
        const detailUrl = `https://www.pokemon-card.com/card-search/details.php/card/${card.cardID}`;
        const detailRes = await axios.get(detailUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          timeout: 8000,
        });

        const $ = cheerio.load(detailRes.data);

        // セット名抽出
        const rawSetName = $('.List_item').first().text().trim() || $('a[href*="se_ta"]').first().text().trim();
        const setName = rawSetName
          .replace(/^(拡張パック|強化拡張パック|ハイクラスパック|ハイクラスデッキ|スターターセット|スタートデッキ|デッキビルドBOX|スペシャルデッキセット)[「\s]*/, '')
          .replace(/[」]$/, '')
          .replace(/（.*）$/, '')
          .trim();

        // 型番（カード番号）抽出: LeftBox内の.subtextまたはページ全体から抽出
        let cardNumber = '';
        const subtext = $('.LeftBox .subtext, .subtext.Text-fjalla, .subtext').text().replace(/[\s\u00a0]+/g, '').trim();
        const numMatch = subtext.match(/(\d{3}\/\d{3}|\d{3}\/[A-Za-z0-9]+|[A-Za-z0-9]+-\w+\s*\d+|\d{3}\/\d{2,3})/);
        if (numMatch) {
          cardNumber = numMatch[1];
        } else {
          // 本文からのフォールバック正規表現
          const bodyMatches = $('body').text().match(/(\d{3}\s*[\/\uff0f]\s*\d{3})/);
          if (bodyMatches) {
            cardNumber = bodyMatches[1].replace(/[\s\u00a0\uff0f]+/g, '/');
          }
        }

        const thumb = card.cardThumbFile || '';
        const imgUrl = thumb.startsWith('http') ? thumb : `https://www.pokemon-card.com${thumb}`;

        if (setName || cardNumber) {
          scrapedList.push({
            name: baseName,
            rarity: targetRarity || '',
            set_name: setName,
            card_number: cardNumber,
            image_url: imgUrl,
            official_id: card.cardID,
          });
        }
      } catch (e) {
        // 次の候補へ
      }
    }

    if (scrapedList.length === 0) return null;

    // レアリティに応じた最適なカード番号の選定
    if (targetRarity) {
      const normRarity = targetRarity.toUpperCase();
      // SAR/SR/UR/HR/SAの場合、シークレット枠（分子 > 分母）を優先
      if (['SAR', 'SR', 'UR', 'HR', 'SA', 'SSR'].includes(normRarity)) {
        const secretCards = scrapedList.filter(c => {
          if (!c.card_number || !c.card_number.includes('/')) return false;
          const [num, den] = c.card_number.split('/').map(n => parseInt(n, 10));
          return !isNaN(num) && !isNaN(den) && num > den;
        });
        if (secretCards.length > 0) {
          // SARやURはより番号が大きいものを優先
          if (['SAR', 'UR', 'HR'].includes(normRarity)) {
            secretCards.sort((a, b) => {
              const numA = parseInt(a.card_number.split('/')[0], 10) || 0;
              const numB = parseInt(b.card_number.split('/')[0], 10) || 0;
              return numB - numA;
            });
          }
          return secretCards[0];
        }
      }
    }

    // 型番が存在するものを優先
    const withNumber = scrapedList.find(c => c.card_number && c.card_number.length > 0);
    return withNumber || scrapedList[0];
  }

  /**
   * カタログから完全一致を検索
   */
  findFromCatalog(baseName, rarity) {
    const normName = baseName.toLowerCase().replace(/\s+/g, '');
    const normRarity = (rarity || '').toUpperCase();

    const matches = CARD_CATALOG.filter(c => {
      const cName = c.name.toLowerCase().replace(/\s+/g, '');
      const nameMatch = cName === normName;
      if (!nameMatch) return false;
      if (normRarity) {
        return c.rarity.toUpperCase() === normRarity;
      }
      return true;
    });

    if (matches.length > 0) {
      return { ...matches[0] };
    }
    return null;
  }

  /**
   * カタログから部分一致を検索
   */
  findFromCatalogPartial(baseName, rarity) {
    const normName = baseName.toLowerCase().replace(/\s+/g, '');
    const normRarity = (rarity || '').toUpperCase();

    const matches = CARD_CATALOG.filter(c => {
      const cName = c.name.toLowerCase().replace(/\s+/g, '');
      return normName.includes(cName) || cName.includes(normName);
    });

    if (matches.length > 0) {
      if (normRarity) {
        const rarityMatch = matches.find(m => m.rarity.toUpperCase() === normRarity);
        if (rarityMatch) return { ...rarityMatch };
      }
      return { ...matches[0] };
    }
    return null;
  }

  /**
   * カード情報オブジェクトを受け取り、未入力のセット名・カード番号を自動補完・DB保存する
   */
  async autoFillCard(card, db = null) {
    const needsSetName = !card.set_name || card.set_name.trim() === '';
    const needsCardNum = !card.card_number || card.card_number.trim() === '';

    if (!needsSetName && !needsCardNum) {
      return card;
    }

    try {
      const officialInfo = await this.lookupOfficial(card.name, card.rarity);
      if (officialInfo) {
        const newSetName = needsSetName && officialInfo.set_name ? officialInfo.set_name : (card.set_name || '');
        const newCardNumber = needsCardNum && officialInfo.card_number ? officialInfo.card_number : (card.card_number || '');
        const newRarity = !card.rarity && officialInfo.rarity ? officialInfo.rarity : (card.rarity || '');

        const isChanged = (newSetName !== (card.set_name || '')) ||
                          (newCardNumber !== (card.card_number || '')) ||
                          (newRarity !== (card.rarity || ''));

        if (isChanged) {
          logger.info(`カード自動補完成功: [ID:${card.id}] ${card.name} -> セット: "${newSetName}", 型番: "${newCardNumber}", レアリティ: "${newRarity}"`);

          const updatedData = {
            ...card,
            set_name: newSetName,
            card_number: newCardNumber,
            rarity: newRarity,
          };

          if (db && card.id) {
            db.updateCard(card.id, updatedData);
          }

          return {
            ...updatedData,
            _autoFilled: true,
          };
        }
      }
    } catch (e) {
      logger.warn(`カード [${card.name}] の自動補完失敗: ${e.message}`);
    }

    return card;
  }
}

let instance = null;
function getOfficialCardService() {
  if (!instance) instance = new OfficialCardService();
  return instance;
}

module.exports = { OfficialCardService, getOfficialCardService, CARD_CATALOG };
