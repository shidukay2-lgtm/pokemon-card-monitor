/**
 * 検索結果の高度な関連性フィルター
 * - ポケモンカード以外のTCG（ワンピース、遊戯王、デュエマ、ヴァイス等）の完全除外
 * - 書籍・同人誌・グッズ・サプライ品（スリーブ、フィギュア、空箱等）の完全除外
 * - 日本語および英数字の厳密な単語境界判定（「タロ」で「キタロウ」を誤爆しない）
 * - レアリティの厳密な単語境界照合（「SAREYOMA」で「SAR」を誤爆しない）
 * - セット名・型番（コレクションナンバー）の厳密照合
 * - グローバル設定＆カード個別カスタムキーワードの動的適用
 */

// 他TCGキーワード（ポケカ以外のカードゲーム）
const OTHER_TCG_KEYWORDS = [
  'ワンピース', 'one piece', 'ワンピカード', 'ワンピ', 'op0', 'op1', 'op2', 'op3', 'op4', 'op5', 'op6', 'op7', 'op8', 'op9', 'op-',
  '遊戯王', 'yugioh', 'yu-gi-oh', 'ラッシュデュエル', 'デュエルモンスターズ', 'プリズマティック', 'クオシク', '20thシークレット',
  'デュエマ', 'デュエルマスターズ', 'dmrp', 'dmex', 'dm2', 'dm3',
  'ヴァイスシュヴァルツ', 'ヴァイス', 'ws',
  'マジック：ザ・ギャザリング', 'マジックザギャザリング', 'mtg',
  'ドラゴンボール', 'フュージョンワールド', 'スーパードラゴンボールヒーローズ', 'sdbh', 'ヒーローズ',
  'バトルスピリッツ', 'バトスピ',
  'ユニオンアリーナ', 'ユニアリ',
  'シャドウバース', 'エボルヴ', 'シャドバ',
  'ガンバライジング', 'ガンバレジェンズ', 'ダイの大冒険', 'クロスブレイド',
  'アイカツ', 'プリパラ', 'プリマジ', 'bbm', 'カルビープロ野球', 'topps',
  '名探偵コナンカード', 'ディズニーロルカナ', 'lorcana', 'ガンダムカード', 'デジモンカード'
];

// 書籍・同人誌・サプライ・非カード・ノイズキーワード
const SUPPLY_KEYWORDS = [
  '同人', '同人誌', 'コミック', 'アンソロジー', '画集', '小説', '文庫', 'イラスト集', '設定資料集', '雑誌', '書籍', '本',
  'cd', 'dvd', 'blu-ray', 'ブルーレイ', 'サントラ', 'ポスター', 'タペストリー', '抱き枕',
  'スリーブ', 'デッキシールド', 'デッキケース', 'プレイマット', 'プレマ', 'ラバーマット',
  'カードファイル', 'コレクションファイル', 'バインダー', 'ストレイジ', 'ストレージボックス',
  'ローダー', 'マグネットローダー', 'トップローダー', 'ディスプレイフレーム',
  'フィギュア', 'ぬいぐるみ', 'マスコット', 'キーホルダー', 'アクリルスタンド', 'アクスタ',
  '缶バッジ', 'シール', 'ステッカー', 'メダル', 'ピンズ', 'コイン',
  '空箱', '空box', '空パック', '外箱のみ', '箱のみ', '空き箱', '空きbox', '空缶',
  'レプリカ', 'オリパ', '福袋', 'くじ', 'お楽しみ袋', '引退品大量',
  'psa9', 'psa8', 'psa7', 'psa6', 'psa5', 'bgs9', 'ars9'
];

// バンドル・パック・BOXキーワード
const BUNDLE_KEYWORDS = [
  'box', 'ボックス', 'パック', 'セット売り', 'まとめ売り', 'まとめ',
  '大量', 'lot', 'シュリンク', '未開封box', '未開封ボックス', 'カートン',
  'セット販売', '10パック', '20パック', '30パック'
];

// 拡張パック一覧
const EXPANSION_PACK_NAMES = [
  'バイオレットex', 'スカーレットex', 'クレイバースト', 'スノーハザード',
  '黒炎の支配者', 'レイジングサーフ', '古代の咆哮', '未来の一閃',
  'シャイニートレジャーex', 'ワイルドフォース', 'サイバージャッジ',
  'クリムゾンヘイズ', '変幻の仮面', 'ステラミラクル', '超電ブレイカー',
  'テラスタルフェスex', '楽園ドラゴーナ', '熱風のアリーナ', 'バトルパートナーズ',
  'パラダイムトリガー', 'VSTARユニバース', 'ハイクラスパック',
  'ポケモンカード151', 'バトルマスターデッキ', 'デッキビルドBOX',
  'exスペシャルセット', 'スターターセット', 'スペシャルデッキセット',
  'ドリームリーグ', 'タッグオールスターズ', 'イーブイヒーローズ', '蒼空ストリーム',
  '摩天パーフェクト', 'フュージョンアーツ', 'ロストアビス', '白熱のアルカナ',
  '漆黒のガイスト', '白銀のランス', 'スペースジャグラー', 'タイムゲイザー'
];

/**
 * 商品名が指定のキーワードのいずれかを含むかチェック
 */
function containsAny(text, keywords) {
  const norm = normalize(text);
  return keywords.some(kw => {
    const k = normalize(kw);
    return k && norm.includes(k);
  });
}

/**
 * カンマ、読点、改行、スペース区切りの文字列を配列に変換
 */
function parseKeywordsList(str) {
  if (!str || typeof str !== 'string') return [];
  return str
    .split(/[,、\n\r\t]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * カード名が商品名内で「完全な独立単語」として一致しているか判定
 * 例: "タロ" は "タロ SAR" にマッチするが、"キタロウ" や "コタロウ" にはマッチしない
 */
function isExactCardName(productName, cardName) {
  if (!productName || !cardName) return false;

  const pName = normalize(productName);
  const cName = normalize(cardName);

  let startPos = 0;
  while (true) {
    const idx = pName.indexOf(cName, startPos);
    if (idx === -1) break;

    // 前の文字チェック
    let beforeOk = true;
    if (idx > 0) {
      const beforeChar = pName[idx - 1];
      // 前の文字が漢字・ひらがな・カタカナ・英数字の場合は、別の単語の一部なのでNG
      if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF0-9a-zA-Z]/.test(beforeChar)) {
        beforeOk = false;
      }
    }

    // 後ろの文字チェック
    let afterOk = true;
    const afterIdx = idx + cName.length;
    if (afterIdx < pName.length) {
      const afterChar = pName[afterIdx];
      const remaining = pName.substring(afterIdx);
      // 直後に "ex", "v", "vstar", "vmax", "gx", "v-union" や区切り文字が続くのはOK
      const isAllowedSuffix = /^(ex|v|vstar|vmax|gx|v-union|\s|[・/()（）\[\]【】_,\-!！？:：\d★◆]|$)/i.test(remaining);

      if (!isAllowedSuffix && /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF0-9a-zA-Z]/.test(afterChar)) {
        afterOk = false;
      }
    }

    if (beforeOk && afterOk) {
      return true; // 独立した単語としての一致
    }

    startPos = idx + 1;
  }

  return false;
}

/**
 * レアリティ記号が商品名内で独立したトークンとして存在するか判定
 * 例: "SAR" は "タロ SAR" にマッチするが、"SAREYOMA" や "STAR" にはマッチしない
 */
function matchRarityWord(productName, rarity) {
  if (!productName || !rarity) return false;
  const pName = normalize(productName);
  const r = normalize(rarity);

  const pattern = new RegExp(`(^|[\\s・/()（）\\[\\]【】_,\\-!！？:：\\d★◆])${r}([\\s・/()（）\\[\\]【】_,\\-!！？:：\\d★◆]|$)`, 'i');
  return pattern.test(pName);
}

/**
 * カード検索結果の関連性スコアを計算
 * @param {string} productName - 商品名
 * @param {object} card - カード情報 {name, set_name, rarity, card_number, include_keywords, exclude_keywords}
 * @param {object} filterSettings - 抽出設定 {exclude_other_tcg, exclude_supplies, strict_mode, custom_exclude, custom_include}
 * @returns {number} スコア (0-100, 0=除外)
 */
function scoreRelevance(productName, card, filterSettings = {}) {
  if (!productName || !card || !card.name) return 0;

  const pName = normalize(productName);

  // 1. 他TCGフィルター（デフォルト有効）
  const excludeOtherTcg = filterSettings.exclude_other_tcg !== false;
  if (excludeOtherTcg && containsAny(pName, OTHER_TCG_KEYWORDS)) {
    return 0; // 他TCGは完全除外
  }

  // 2. サプライ・書籍・同人誌・グッズフィルター（デフォルト有効）
  const excludeSupplies = filterSettings.exclude_supplies !== false;
  if (excludeSupplies && containsAny(pName, SUPPLY_KEYWORDS)) {
    return 0; // 同人誌やスリーブ等は完全除外
  }

  // 3. グローバルカスタム除外キーワード（ユーザーが自由に追加した除外ワード）
  if (filterSettings.custom_exclude) {
    const customExcludes = parseKeywordsList(filterSettings.custom_exclude);
    if (containsAny(pName, customExcludes)) {
      return 0; // ユーザー指定の除外ワードが含まれる場合は即座に完全除外
    }
  }

  // 4. グローバルカスタム必須キーワード
  if (filterSettings.custom_include) {
    const customIncludes = parseKeywordsList(filterSettings.custom_include);
    if (customIncludes.length > 0 && !customIncludes.some(k => pName.includes(normalize(k)))) {
      return 0;
    }
  }

  // 5. カード個別カスタム除外キーワード
  if (card.exclude_keywords) {
    const cardExcludes = parseKeywordsList(card.exclude_keywords);
    if (containsAny(pName, cardExcludes)) {
      return 0;
    }
  }

  // 6. カード個別カスタム必須キーワード
  if (card.include_keywords) {
    const cardIncludes = parseKeywordsList(card.include_keywords);
    if (cardIncludes.length > 0 && !cardIncludes.every(k => pName.includes(normalize(k)))) {
      return 0;
    }
  }

  // 7. カード名とレアリティの分離・検証
  const rarityPattern = /\s+(sar|sr|ur|hr|ar|chr|csr|rr|r|u|c|n|tr|pr|sa|s|k|a|ssr)$/i;
  const nameNorm = normalize(card.name);
  const rarityMatch = nameNorm.match(rarityPattern);
  const baseName = rarityMatch ? nameNorm.replace(rarityPattern, '').trim() : nameNorm;
  const embeddedRarity = rarityMatch ? rarityMatch[1] : null;
  const rarity = card.rarity ? normalize(card.rarity) : embeddedRarity;

  // 単語境界を考慮したカード名一致判定（「タロ」で「キタロウ」を完全遮断）
  if (!isExactCardName(pName, baseName)) {
    return 0;
  }

  let score = 50;

  // 8. レアリティの厳密照合（単語境界チェック）
  if (rarity) {
    if (matchRarityWord(pName, rarity)) {
      score += 20;
    } else {
      // 別の主要レアリティ（SAR狙いなのにSR、SR狙いなのにSARやRR等）が含まれている場合は大幅減点
      const allRarities = ['sar', 'sr', 'ur', 'hr', 'ar', 'ssr', 'rr', 'sa'];
      const conflictingRarity = allRarities.find(r => r !== rarity && matchRarityWord(pName, r));
      if (conflictingRarity) {
        score -= 40;
      } else {
        score -= 10;
      }
    }
  }

  // 9. カード番号（型番）の厳密照合
  if (card.card_number) {
    const cardNum = normalize(card.card_number); // 例: "091/071"
    const [targetNumerator] = cardNum.split('/').map(s => s.trim());

    // タイトルから "000/000" パターンの型番を抽出
    const foundNumbers = pName.match(/\b\d{2,3}\s*[\/\uff0f]\s*\d{2,3}\b/g) || [];
    const normalizedFoundNums = foundNumbers.map(n => n.replace(/[\s\uff0f]+/g, '/'));

    if (pName.includes(cardNum) || (targetNumerator && pName.includes(targetNumerator))) {
      score += 35; // 型番一致は極めて信頼性が高い
    } else if (normalizedFoundNums.length > 0) {
      // タイトルに全く別の型番（例: 096/071 が欲しいのに 035/071 や 350/190 が書かれている）が存在する場合
      const hasMismatch = normalizedFoundNums.some(fn => fn !== cardNum);
      if (hasMismatch) {
        if (filterSettings.strict_mode === 'strict') {
          return 0; // 厳格モードでは型番不一致を即除外
        }
        score -= 50; // 通常モードでも大幅減点
      }
    }
  }

  // 10. セット名（エキスパンション名）の照合
  if (card.set_name) {
    const setName = normalize(card.set_name);
    if (pName.includes(setName)) {
      score += 15;
    }
  }

  // 11. バンドル・パック・BOX・未開封系の減点
  if (isBundleProduct(pName)) {
    score -= 45;
  }

  // 12. 拡張パック商品自体の誤検出チェック
  if (isExpansionPackProduct(pName, baseName)) {
    score -= 40;
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * バンドル・まとめ売り商品かチェック
 */
function isBundleProduct(productName) {
  return BUNDLE_KEYWORDS.some(kw => productName.includes(kw));
}

/**
 * 拡張パック自体の誤検出チェック
 */
function isExpansionPackProduct(productName, cardName) {
  for (const pack of EXPANSION_PACK_NAMES) {
    const normPack = normalize(pack);
    if (productName.includes(normPack)) {
      const withoutPack = productName.replace(normPack, '');
      if (!withoutPack.includes(cardName)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * 文字列の正規化
 */
function normalize(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[\s　]+/g, ' ')
    .trim();
}

/**
 * 検索結果をフィルタリング
 * @param {Array} results - 検索結果配列
 * @param {object} card - カード情報
 * @param {object} filterSettings - 抽出条件設定 (任意)
 * @param {number} minScore - 最低スコア (デフォルト35)
 * @returns {Array} フィルタ後の結果
 */
function filterResults(results, card, filterSettings = {}, minScore = 35) {
  if (!results || results.length === 0) return results;

  const linkOnly = results.filter(r => r.price === null);
  const priced = results.filter(r => r.price !== null);

  const scored = priced.map(r => ({
    ...r,
    _relevanceScore: scoreRelevance(r.name || r.product_name || '', card, filterSettings),
  }));

  const filtered = scored.filter(r => r._relevanceScore >= minScore);

  // スコア降順ソート
  filtered.sort((a, b) => b._relevanceScore - a._relevanceScore);

  return [...filtered, ...linkOnly];
}

module.exports = {
  filterResults,
  scoreRelevance,
  isExactCardName,
  matchRarityWord,
  parseKeywordsList,
  normalize,
  OTHER_TCG_KEYWORDS,
  SUPPLY_KEYWORDS,
  BUNDLE_KEYWORDS,
};
