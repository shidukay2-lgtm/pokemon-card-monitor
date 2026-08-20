// カード管理画面
const Cards = {
  cards: [],

  async init() {
    await this.refresh();
  },

  async refresh() {
    const container = document.getElementById('view-cards');
    Components.loading(container);
    try {
      this.cards = await API.getCards();
      this.render();
    } catch (e) {
      Components.empty(container, '⚠️', '読み込み失敗');
    }
  },

  render() {
    const container = document.getElementById('view-cards');
    container.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">🃏 監視カード一覧</span>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-sm btn-secondary" onclick="Cards.autofillAll()" title="未入力のセット名・カード番号を公式サイトから自動補完します">⚡ 一括補完</button>
            <button class="btn btn-sm btn-primary" onclick="Cards.showAddModal()">＋ カード追加</button>
          </div>
        </div>
        <div class="panel-body" style="padding:0">
          <!-- PC表示用テーブル -->
          <div class="pc-view-only table-wrapper">
            ${this.renderTable()}
          </div>
          <!-- スマホ表示用カードリスト -->
          <div class="mobile-view-only" style="padding:10px">
            ${this.renderMobileCards()}
          </div>
        </div>
      </div>
    `;
  },

  renderTable() {
    if (this.cards.length === 0) {
      return '<div class="empty-state"><div class="icon">🃏</div><p>まだカードが登録されていません</p></div>';
    }
    let html = `<table class="data-table"><thead><tr>
      <th>カード名</th><th>セット名・型番</th><th>レアリティ</th>
      <th>目標価格帯</th><th>状態</th><th>操作</th>
    </tr></thead><tbody>`;

    this.cards.forEach(c => {
      const targetRange = c.target_price_min || c.target_price_max
        ? `${Components.formatPrice(c.target_price_min)} 〜 ${Components.formatPrice(c.target_price_max)}`
        : '-';

      const setInfo = c.set_name 
        ? `<strong>${c.set_name}</strong>${c.card_number ? `<br><span class="badge badge-info" style="font-size:0.75rem">${c.card_number}</span>` : ''}`
        : (c.card_number ? `<span class="badge badge-info">${c.card_number}</span>` : '<span style="color:var(--text-muted)">未設定 (巡回時自動補完)</span>');

      html += `<tr>
        <td><strong>${c.name}</strong></td>
        <td>${setInfo}</td>
        <td>${c.rarity ? `<span class="badge badge-info">${c.rarity}</span>` : '<span style="color:var(--text-muted)">-</span>'}</td>
        <td>${targetRange}</td>
        <td>${c.is_active ? '<span class="badge badge-success">有効</span>' : '<span class="badge badge-muted">無効</span>'}</td>
        <td class="col-actions"><div class="action-group">
          <button class="btn btn-sm btn-secondary" onclick="Cards.showEditModal(${c.id})" title="編集">✏️</button>
          <button class="btn btn-sm btn-secondary" onclick="Cards.toggleActive(${c.id}, ${c.is_active})" title="${c.is_active ? '無効化' : '有効化'}">${c.is_active ? '⏸' : '▶'}</button>
          <button class="btn btn-sm btn-danger" onclick="Cards.remove(${c.id})" title="削除">🗑</button>
        </div></td>
      </tr>`;
    });
    html += '</tbody></table>';
    return html;
  },

  renderMobileCards() {
    if (this.cards.length === 0) {
      return '<div class="empty-state"><div class="icon">🃏</div><p>まだカードが登録されていません</p></div>';
    }

    let html = '<div class="mobile-card-grid">';
    this.cards.forEach(c => {
      const targetRange = c.target_price_min || c.target_price_max
        ? `${Components.formatPrice(c.target_price_min)} 〜 ${Components.formatPrice(c.target_price_max)}`
        : '未設定';

      html += `
        <div class="mobile-card-card">
          <div class="mobile-card-top">
            <div>
              <div class="mobile-card-title">${c.name}</div>
              <div class="mobile-card-meta">
                ${c.set_name || 'セット未設定'} ${c.card_number ? `(${c.card_number})` : ''}
              </div>
            </div>
            <div style="display:flex;gap:4px;align-items:center">
              ${c.rarity ? `<span class="badge badge-primary">${c.rarity}</span>` : ''}
              ${c.is_active ? '<span class="badge badge-success">有効</span>' : '<span class="badge badge-muted">無効</span>'}
            </div>
          </div>
          
          <div style="font-size:0.8rem;color:var(--text-secondary);margin:8px 0;background:var(--bg-tertiary);padding:6px 10px;border-radius:6px">
            🎯 目標価格: <strong style="color:var(--text-primary)">${targetRange}</strong>
          </div>

          <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px;border-top:1px dashed var(--border);padding-top:8px">
            <button class="btn btn-sm btn-secondary" onclick="Cards.showEditModal(${c.id})">✏️ 編集</button>
            <button class="btn btn-sm btn-secondary" onclick="Cards.toggleActive(${c.id}, ${c.is_active})">${c.is_active ? '⏸ 停止' : '▶ 開始'}</button>
            <button class="btn btn-sm btn-danger" onclick="Cards.remove(${c.id})">🗑 削除</button>
          </div>
        </div>
      `;
    });
    html += '</div>';
    return html;
  },

  getFormHtml(card = {}) {
    return `
      <div class="form-group">
        <label class="form-label">カード名 *</label>
        <div style="display:flex;gap:6px">
          <input type="text" class="form-input" id="card-name" value="${card.name || ''}" placeholder="例: ナンジャモ SR, リザードンex SAR" style="flex:1">
          <button type="button" class="btn btn-secondary" onclick="Cards.lookupOfficialInfo()" style="white-space:nowrap">🔍 公式から自動取得</button>
        </div>
        <small style="color:var(--text-muted);font-size:0.75rem">カード名やレアリティから公式情報を検索してセット名・型番を自動入力できます</small>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">セット名（エキスパンション）</label>
          <input type="text" class="form-input" id="card-set" value="${card.set_name || ''}" placeholder="例: クレイバースト, 黒炎の支配者">
        </div>
        <div class="form-group">
          <label class="form-label">レアリティ</label>
          <select class="form-select" id="card-rarity">
            <option value="">選択してください</option>
            ${['SAR','SR','AR','UR','HR','SA','RR','R','U','C','ACE','その他'].map(r => `<option value="${r}" ${card.rarity === r ? 'selected' : ''}>${r}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">カード番号（型番）</label>
        <input type="text" class="form-input" id="card-number" value="${card.card_number || ''}" placeholder="例: 091/071, 201/190">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">目標価格（下限）</label>
          <input type="number" class="form-input" id="card-price-min" value="${card.target_price_min || 0}" min="0">
        </div>
        <div class="form-group">
          <label class="form-label">目標価格（上限）</label>
          <input type="number" class="form-input" id="card-price-max" value="${card.target_price_max || 0}" min="0">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">個別除外キーワード（任意）</label>
          <input type="text" class="form-input" id="card-exclude-kw" value="${card.exclude_keywords || ''}" placeholder="例: SAR, SSR, プロモ, PSA9 (カンマ区切り)">
        </div>
        <div class="form-group">
          <label class="form-label">個別必須キーワード（任意）</label>
          <input type="text" class="form-input" id="card-include-kw" value="${card.include_keywords || ''}" placeholder="例: クレイバースト, 091/071">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">メモ</label>
        <textarea class="form-textarea" id="card-notes">${card.notes || ''}</textarea>
      </div>
    `;
  },

  async lookupOfficialInfo() {
    const name = document.getElementById('card-name')?.value.trim();
    const rarity = document.getElementById('card-rarity')?.value.trim();

    if (!name) {
      Components.showToast('カード名を入力してください', 'warning');
      return;
    }

    Components.showToast('公式情報を検索中...', 'info');
    try {
      const info = await API.lookupOfficialCard(name, rarity);
      if (info && (info.set_name || info.card_number)) {
        const setInput = document.getElementById('card-set');
        const numInput = document.getElementById('card-number');
        const raritySelect = document.getElementById('card-rarity');

        if (setInput && info.set_name) {
          setInput.value = info.set_name;
          setInput.style.borderColor = 'var(--accent)';
        }
        if (numInput && info.card_number) {
          numInput.value = info.card_number;
          numInput.style.borderColor = 'var(--accent)';
        }
        if (raritySelect && info.rarity) {
          raritySelect.value = info.rarity;
        }

        const msg = `公式情報を反映しました: ${info.set_name || ''} ${info.card_number ? '[' + info.card_number + ']' : ''}`;
        Components.showToast(msg, 'success');
      } else {
        Components.showToast('公式情報が見つかりませんでした。手動で入力してください', 'warning');
      }
    } catch (e) {
      Components.showToast('公式情報の取得に失敗しました', 'error');
    }
  },

  async autofillAll() {
    Components.showToast('未入力情報を公式から一括取得中...', 'info');
    try {
      const res = await API.autofillAllCards();
      if (res.updatedCount > 0) {
        Components.showToast(`${res.updatedCount}件のカード情報を公式情報で補完しました`, 'success');
        this.refresh();
      } else {
        Components.showToast('補完対象の未入力カードはありませんでした', 'info');
      }
    } catch (e) {
      Components.showToast('一括補完に失敗しました', 'error');
    }
  },

  getFormData() {
    return {
      name: document.getElementById('card-name').value.trim(),
      set_name: document.getElementById('card-set').value.trim(),
      rarity: document.getElementById('card-rarity').value,
      card_number: document.getElementById('card-number').value.trim(),
      target_price_min: parseInt(document.getElementById('card-price-min').value) || 0,
      target_price_max: parseInt(document.getElementById('card-price-max').value) || 0,
      exclude_keywords: document.getElementById('card-exclude-kw')?.value.trim() || '',
      include_keywords: document.getElementById('card-include-kw')?.value.trim() || '',
      notes: document.getElementById('card-notes').value.trim(),
    };
  },

  showAddModal() {
    Components.showModal('カード追加', this.getFormHtml(), async () => {
      const data = this.getFormData();
      if (!data.name) { Components.showToast('カード名を入力してください', 'warning'); return; }
      await API.createCard(data);
      Components.showToast('カードを追加しました', 'success');
      this.refresh();
    });
  },

  showEditModal(id) {
    const card = this.cards.find(c => c.id === id);
    if (!card) return;
    Components.showModal('カード編集', this.getFormHtml(card), async () => {
      const data = this.getFormData();
      if (!data.name) { Components.showToast('カード名を入力してください', 'warning'); return; }
      await API.updateCard(id, data);
      Components.showToast('カードを更新しました', 'success');
      this.refresh();
    });
  },

  async toggleActive(id, currentState) {
    const card = this.cards.find(c => c.id === id);
    if (!card) return;
    await API.updateCard(id, { ...card, is_active: currentState ? 0 : 1 });
    this.refresh();
  },

  async remove(id) {
    if (await Components.confirm('このカードを削除しますか？関連する価格データも削除されます。')) {
      await API.deleteCard(id);
      Components.showToast('カードを削除しました', 'success');
      this.refresh();
    }
  },
};
