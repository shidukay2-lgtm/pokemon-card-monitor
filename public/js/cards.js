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
          <button class="btn btn-sm btn-primary" onclick="Cards.showAddModal()">＋ カード追加</button>
        </div>
        <div class="panel-body" style="padding:0">
          <div class="table-wrapper">
            ${this.renderTable()}
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
      <th>カード名</th><th>セット名</th><th>レアリティ</th><th>カード番号</th>
      <th>目標価格帯</th><th>状態</th><th>操作</th>
    </tr></thead><tbody>`;

    this.cards.forEach(c => {
      const targetRange = c.target_price_min || c.target_price_max
        ? `${Components.formatPrice(c.target_price_min)} 〜 ${Components.formatPrice(c.target_price_max)}`
        : '-';
      html += `<tr>
        <td><strong>${c.name}</strong></td>
        <td>${c.set_name || '-'}</td>
        <td>${c.rarity ? `<span class="badge badge-info">${c.rarity}</span>` : '-'}</td>
        <td>${c.card_number || '-'}</td>
        <td>${targetRange}</td>
        <td>${c.is_active ? '<span class="badge badge-success">有効</span>' : '<span class="badge badge-muted">無効</span>'}</td>
        <td class="col-actions"><div class="action-group">
          <button class="btn btn-sm btn-secondary" onclick="Cards.showEditModal(${c.id})">✏️</button>
          <button class="btn btn-sm btn-secondary" onclick="Cards.toggleActive(${c.id}, ${c.is_active})">${c.is_active ? '⏸' : '▶'}</button>
          <button class="btn btn-sm btn-danger" onclick="Cards.remove(${c.id})">🗑</button>
        </div></td>
      </tr>`;
    });
    html += '</tbody></table>';
    return html;
  },

  getFormHtml(card = {}) {
    return `
      <div class="form-group">
        <label class="form-label">カード名 *</label>
        <input type="text" class="form-input" id="card-name" value="${card.name || ''}" placeholder="例: リザードンex SAR">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">セット名</label>
          <input type="text" class="form-input" id="card-set" value="${card.set_name || ''}" placeholder="例: 黒炎の支配者">
        </div>
        <div class="form-group">
          <label class="form-label">レアリティ</label>
          <select class="form-select" id="card-rarity">
            <option value="">選択してください</option>
            ${['SAR','SR','AR','UR','RR','R','U','C','ACE','その他'].map(r => `<option value="${r}" ${card.rarity === r ? 'selected' : ''}>${r}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">カード番号</label>
        <input type="text" class="form-input" id="card-number" value="${card.card_number || ''}" placeholder="例: 112/081">
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
      <div class="form-group">
        <label class="form-label">メモ</label>
        <textarea class="form-textarea" id="card-notes">${card.notes || ''}</textarea>
      </div>
    `;
  },

  getFormData() {
    return {
      name: document.getElementById('card-name').value.trim(),
      set_name: document.getElementById('card-set').value.trim(),
      rarity: document.getElementById('card-rarity').value,
      card_number: document.getElementById('card-number').value.trim(),
      target_price_min: parseInt(document.getElementById('card-price-min').value) || 0,
      target_price_max: parseInt(document.getElementById('card-price-max').value) || 0,
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
