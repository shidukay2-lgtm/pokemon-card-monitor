// 抽出条件設定画面
const FilterSettings = {
  settings: {},
  cards: [],

  async init() {
    await this.refresh();
  },

  async refresh() {
    const container = document.getElementById('view-filter-settings');
    Components.loading(container);
    try {
      this.settings = await API.getFilterSettings();
      this.cards = await API.getCards();
      this.render();
    } catch (e) {
      Components.empty(container, '⚠️', '設定の読み込みに失敗しました');
    }
  },

  render() {
    const container = document.getElementById('view-filter-settings');
    const s = this.settings;

    container.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(360px, 1fr));gap:16px;">
        
        <!-- 基本フィルター設定 -->
        <div class="panel">
          <div class="panel-header">
            <span class="panel-title">🛡️ ポケカ専用・ノイズ除外フィルター</span>
          </div>
          <div class="panel-body">
            
            <div class="form-group" style="margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--border)">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <div>
                  <strong>他TCG（ポケカ以外）を自動除外</strong>
                  <div style="font-size:0.75rem;color:var(--text-muted)">ワンピース、遊戯王、デュエマ、ヴァイス、MTG、ドラゴンボール等の商品を完全排除</div>
                </div>
                <label class="toggle-switch">
                  <input type="checkbox" id="filter-exclude-tcg" ${s.exclude_other_tcg ? 'checked' : ''}>
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>

            <div class="form-group" style="margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--border)">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <div>
                  <strong>サプライ品・グッズ・空箱等を自動除外</strong>
                  <div style="font-size:0.75rem;color:var(--text-muted)">スリーブ、フィギュア、アクリルスタンド、空箱、未開封パック、オリパ等を除外</div>
                </div>
                <label class="toggle-switch">
                  <input type="checkbox" id="filter-exclude-supplies" ${s.exclude_supplies ? 'checked' : ''}>
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label"><strong>型番（カード番号）判定ポリシー</strong></label>
              <select class="form-select" id="filter-strict-mode">
                <option value="strict" ${s.strict_mode === 'strict' ? 'selected' : ''}>🔒 厳格モード（異なる型番の商品は完全に除外）</option>
                <option value="score" ${s.strict_mode === 'score' ? 'selected' : ''}>⚖️ 標準モード（型番一致を最優先、異なる型番は減点）</option>
                <option value="lenient" ${s.strict_mode === 'lenient' ? 'selected' : ''}>🕊️ 柔軟モード（カード名の一致を重視）</option>
              </select>
              <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px">
                厳格モードにすると、「ナンジャモ SR (091/071)」監視時に「096/071 (SAR)」や「035/071 (U)」のタイトルが明記された商品を確実に弾きます。
              </div>
            </div>

            <div style="margin-top:20px;text-align:right">
              <button class="btn btn-primary" onclick="FilterSettings.saveSettings()">💾 基本設定を保存</button>
            </div>
          </div>
        </div>

        <!-- 任意追加キーワード設定 -->
        <div class="panel">
          <div class="panel-header">
            <span class="panel-title">✏️ カスタム抽出キーワード</span>
          </div>
          <div class="panel-body">
            
            <div class="form-group">
              <label class="form-label"><strong>グローバル除外キーワード（任意追加）</strong></label>
              <textarea class="form-textarea" id="filter-custom-exclude" placeholder="除外したい語句をカンマまたは改行で入力 (例: PSA9, レプリカ, ガンバライジング, 初期傷)" style="height:90px">${s.custom_exclude || ''}</textarea>
              <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px">
                ここに入力した語句が商品タイトルに含まれる場合、自動的に除外されます。
              </div>
            </div>

            <div class="form-group" style="margin-top:14px">
              <label class="form-label"><strong>グローバル必須キーワード（任意追加）</strong></label>
              <input type="text" class="form-input" id="filter-custom-include" value="${s.custom_include || ''}" placeholder="含むべき語句をカンマ区切り (通常は空でOK)">
              <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px">
                指定した場合、この語句が含まれない商品はすべて除外されます。
              </div>
            </div>

            <div style="margin-top:20px;text-align:right">
              <button class="btn btn-primary" onclick="FilterSettings.saveSettings()">💾 キーワード設定を保存</button>
            </div>
          </div>
        </div>

      </div>

      <!-- リアルタイム抽出判定テストツール -->
      <div class="panel" style="margin-top:16px;">
        <div class="panel-header">
          <span class="panel-title">🧪 抽出条件シミュレーター（判定テスト）</span>
        </div>
        <div class="panel-body">
          <div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:12px">
            商品タイトルを入力して、設定したフィルター条件で正しく抽出・除外されるかをリアルタイムで確認できます。
          </div>
          
          <div style="display:grid;grid-template-columns:1fr 2fr auto;gap:10px;align-items:flex-end;">
            <div class="form-group" style="margin:0">
              <label class="form-label">照合対象カード</label>
              <select class="form-select" id="test-card-select">
                ${this.cards.map(c => `<option value="${c.id}">${c.name} [${c.rarity || '-'}] (${c.set_name || 'セット未設定'} / ${c.card_number || '型番なし'})</option>`).join('')}
              </select>
            </div>
            <div class="form-group" style="margin:0">
              <label class="form-label">検証する商品タイトル（例: メルカリや駿河屋の出品名）</label>
              <input type="text" class="form-input" id="test-product-name" placeholder="例: ワンピースカード ナミ SR, ナンジャモ SR 091/071 クレイバースト 美品">
            </div>
            <button class="btn btn-secondary" onclick="FilterSettings.runSimulationTest()" style="height:38px">🔍 判定テスト</button>
          </div>

          <!-- テスト結果表示コンテナ -->
          <div id="test-result-box" style="margin-top:14px;display:none;padding:12px;border-radius:6px;border:1px solid var(--border);background:var(--bg-secondary)"></div>
        </div>
      </div>
    `;
  },

  async saveSettings() {
    const data = {
      exclude_other_tcg: document.getElementById('filter-exclude-tcg').checked,
      exclude_supplies: document.getElementById('filter-exclude-supplies').checked,
      strict_mode: document.getElementById('filter-strict-mode').value,
      custom_exclude: document.getElementById('filter-custom-exclude').value.trim(),
      custom_include: document.getElementById('filter-custom-include').value.trim(),
    };

    try {
      this.settings = await API.updateFilterSettings(data);
      Components.showToast('抽出条件設定を保存しました', 'success');
    } catch (e) {
      Components.showToast('設定の保存に失敗しました', 'error');
    }
  },

  async runSimulationTest() {
    const cardId = parseInt(document.getElementById('test-card-select')?.value);
    const productName = document.getElementById('test-product-name')?.value.trim();

    if (!productName) {
      Components.showToast('検証する商品タイトルを入力してください', 'warning');
      return;
    }

    const card = this.cards.find(c => c.id === cardId);
    if (!card) {
      Components.showToast('カードを選択してください', 'warning');
      return;
    }

    const currentSettings = {
      exclude_other_tcg: document.getElementById('filter-exclude-tcg')?.checked,
      exclude_supplies: document.getElementById('filter-exclude-supplies')?.checked,
      strict_mode: document.getElementById('filter-strict-mode')?.value,
      custom_exclude: document.getElementById('filter-custom-exclude')?.value.trim(),
      custom_include: document.getElementById('filter-custom-include')?.value.trim(),
    };

    try {
      const res = await API.testFilter({
        productName,
        card,
        settings: currentSettings,
      });

      const box = document.getElementById('test-result-box');
      box.style.display = 'block';

      const isPass = res.isPassed;
      box.style.borderColor = isPass ? 'var(--color-success)' : 'var(--color-danger)';
      box.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between">
          <span style="font-weight:bold;font-size:1.05rem;color:${isPass ? 'var(--color-success)' : 'var(--color-danger)'}">
            ${res.status} (スコア: ${res.score}点 / 100点)
          </span>
          <span class="badge ${isPass ? 'badge-success' : 'badge-danger'}">${isPass ? '合格' : '除外'}</span>
        </div>
        <div style="margin-top:8px;font-size:0.85rem;color:var(--text-secondary)">
          <div><strong>商品名:</strong> ${res.productName}</div>
          <div><strong>対象カード:</strong> ${res.cardName} | <strong>セット:</strong> ${res.setName || '未設定'} | <strong>型番:</strong> ${res.cardNumber || '未設定'}</div>
        </div>
      `;
    } catch (e) {
      Components.showToast('テスト実行に失敗しました', 'error');
    }
  },
};
