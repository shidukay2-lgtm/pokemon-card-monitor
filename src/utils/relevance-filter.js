/**
 * 検索結果の関連性フィルター
 * AI不使用・トークンゼロ・軽量処理
 */

// 除外すべきバンドル/パック系キーワード
const BUNDLE_KEYWORDS = [
  'box', 'ボックス', 'パック', 'セット売り', 'まとめ売り', 'まとめ',
  '大量', 'lot', 'シュリンク', '未開封box', 'カートン',
  'オリパ', 'くじ', '福袋', 'セット販売',
];

// 拡張パック名（商品名に含まれるが、カード名と混同しやすい）
const EXPANSION_PACK_NAMES = [
  'バイオレットex', 'スカーレットex', 'クレイバースト', 'スノーハザード',
  '黒炎の支配者', 'レイジングサーフ', '古代の咆哮', '未来の一閃',
  'シャイニートレジャーex', 'ワイルドフォース', 'サイバージャッジ',
  'クリムゾンヘイズ', '変幻の仮面', 'ステラミラクル', 'スーパーエレクトリックブレイカー',
  'パラダイムトリガー', 'VSTARユニバース', 'ハイクラスパック',
  'ポケモンカード151', 'バトルマスターデッキ', 'デッキビルドBOX',
  'exスペシャルセット', 'スターターセット', 'スペシャルデッキセット',
  'テラスタルフェスex', 'バトルパートナーズ', 'ジャーニートゥゲザー',
  'サイドオーダー', 'レリックアーツ',
];

/**
 * カード検索結果の関連性スコアを計算
 * @param {string} productName - 商品名
 * @param {object} card - カード情報 {name, set_name, rarity, card_number}
 * @returns {number} スコア (0-100, 0=無関係)
 */
function scoreRelevance(productName, card) {
  if (!productName || !card.name) return 0;

  const pName = normalize(productName);
  const cName = normalize(card.name);

  // ステップ1: カード名が商品名に含まれているか
  if (!pName.includes(cName)) return 0;

  let score = 50; // ベーススコア

  // ステップ2: 部分一致チェック（ナンジャモ → ナンジャモの全力 を除外）
  if (!isExactCardName(pName, cName)) {
    // カード名の後ろに「の」「と」等が続く場合は別カードの可能性
    score -= 40;
  }

  // ステップ3: レアリティが一致するか
  if (card.rarity) {
    const rarity = normalize(card.rarity);
    if (pName.includes(rarity)) {
      score += 20;
    } else {
      // レアリティ指定ありなのに商品名にない → 減点
      score -= 15;
    }
  }

  // ステップ4: カード番号が一致するか
  if (card.card_number) {
    const cardNum = normalize(card.card_number);
    if (pName.includes(cardNum)) {
      score += 20; // 番号一致は非常に強い指標
    }
  }

  // ステップ5: セット名が一致するか
  if (card.set_name) {
    const setName = normalize(card.set_name);
    if (pName.includes(setName)) {
      score += 10;
    }
  }

  // ステップ6: バンドル・パック系は除外
  if (isBundleProduct(pName)) {
    score -= 30;
  }

  // ステップ7: 拡張パック名がカード名に含まれる場合の誤検出チェック
  // 例: カード名「レックウザ」で検索 → 「レックウザex拡張パック」がヒット
  if (isExpansionPackProduct(pName, cName)) {
    score -= 25;
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * カード名が商品名内で「完全一致」しているかチェック
 * 「ナンジャモ」が「ナンジャモの全力」にマッチしないようにする
 */
function isExactCardName(productName, cardName) {
  const idx = productName.indexOf(cardName);
  if (idx === -1) return false;

  const afterIdx = idx + cardName.length;
  if (afterIdx >= productName.length) return true;

  const afterChar = productName[afterIdx];

  // カード名の後に続いてOKな文字
  const allowedAfter = [
    ' ', '　', '/', '(', ')', '（', '）', '[', ']', '【', '】',
    '-', '_', '・', ',', '、', '!', '！',
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  ];

  // レアリティ記号の開始
  const rarityStarts = ['s', 'u', 'r', 'h', 'a', 'p', 'c', 'n', 'S', 'U', 'R', 'H', 'A', 'P', 'C', 'N'];

  if (allowedAfter.includes(afterChar)) return true;
  if (rarityStarts.includes(afterChar)) return true;

  // 「の」「と」「を」「が」「は」「に」「で」「も」→ 別の名前の一部の可能性
  const extendChars = ['の', 'と', 'を', 'が', 'は', 'に', 'で', 'も', 'ン', 'ー'];
  if (extendChars.includes(afterChar)) return false;

  return true;
}

/**
 * バンドル・まとめ売り商品かチェック
 */
function isBundleProduct(productName) {
  return BUNDLE_KEYWORDS.some(kw => productName.includes(kw));
}

/**
 * 拡張パック商品の誤検出チェック
 * 商品名がパック名を含み、かつカード単品ではない場合
 */
function isExpansionPackProduct(productName, cardName) {
  for (const pack of EXPANSION_PACK_NAMES) {
    const normPack = normalize(pack);
    if (productName.includes(normPack)) {
      // パック名を除去した後にカード名が残るか確認
      const withoutPack = productName.replace(normPack, '');
      if (!withoutPack.includes(cardName)) {
        return true; // パック名のみでカード名がヒットした = 誤検出
      }
    }
  }
  return false;
}

/**
 * 正規化（全角→半角、大文字→小文字、余分な空白除去）
 */
function normalize(str) {
  return str
    .toLowerCase()
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 検索結果をフィルタリング
 * @param {Array} results - 検索結果配列
 * @param {object} card - カード情報
 * @param {number} minScore - 最低スコア (デフォルト30)
 * @returns {Array} フィルタ後の結果
 */
function filterResults(results, card, minScore = 35) {
  if (!results || results.length === 0) return results;

  // link-only結果（price=null）はフィルタしない
  const linkOnly = results.filter(r => r.price === null);
  const priced = results.filter(r => r.price !== null);

  const scored = priced.map(r => ({
    ...r,
    _relevanceScore: scoreRelevance(r.name || r.product_name || '', card),
  }));

  const filtered = scored.filter(r => r._relevanceScore >= minScore);

  // スコア順にソート（高い順）
  filtered.sort((a, b) => b._relevanceScore - a._relevanceScore);

  return [...filtered, ...linkOnly];
}

module.exports = { filterResults, scoreRelevance, normalize };
