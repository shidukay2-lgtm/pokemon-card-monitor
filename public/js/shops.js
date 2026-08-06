// ショップ管理画面
const Shops = {
  shops: [],

  async init() {
    await this.refresh();
  },

  async refresh() {
    const container = document.getElementById('view-shops');
    Components.loading(container);
    try {
      this.shops = await API.getShops();
      this.render();
    } catch (e) {
      Components.empty(container, '⚠️', '読み込み失敗');
    }
  },

  render() {
    const container = document.getElementById('view-shops');
    container.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">🏪 ショップ一覧</span>
          <button class="btn btn-sm btn-primary" onclick="Shops.showAddModal()">＋ ショップ追加</button>
        </div>
        <div class="panel-body" style="padding:0">
          <div class="table-wrapper">${this.renderTable()}</div>
        </div>
      </div>
    `;
  },

  renderTable() {
    if (this.shops.length === 0) {
      return '<div class="empty-state"><div class="icon">🏪</div><p>ショップが登録されていません</p></div>';
    }
    let html = `<table class="data-table"><thead><tr>
      <th>ショップ名</th><th>URL</th><th>取得方式</th><th>状態</th><th>巡回</th><th>操作</th>
    </tr></thead><tbody>`;

    this.shops.forEach(s => {
      html += `<tr>
        <td><strong>${s.name}</strong></td>
        <td><a href="${s.url}" target="_blank" rel="noopener" style="font-size:.8rem">${s.url.replace(/https?:\/\//, '').slice(0, 30)}...</a></td>
        <td>${Components.providerBadge(s.provider_type)}</td>
        <td>${s.is_active ? '<span class="badge badge-success">有効</span>' : '<span class="badge badge-muted">無効</span>'}</td>
        <td>${s.scrape_enabled ? '<span class="badge badge-success">ON</span>' : '<span class="badge badge-muted">OFF</span>'}</td>
        <td class="col-actions"><div class="action-group">
          <button class="btn btn-sm btn-secondary" onclick="Shops.showEditModal(${s.id})">✏️</button>
          <button class="btn btn-sm btn-secondary" onclick="Shops.toggleActive(${s.id}, ${s.is_active})">${s.is_active ? '⏸' : '▶'}</button>
          <button class="btn btn-sm btn-danger" onclick="Shops.remove(${s.id})">🗑</button>
        </div></td>
      </tr>`;
    });
    html += '</tbody></table>';
    return html;
  },

  getFormHtml(shop = {}) {
    return `
      <div class="form-group">
        <label class="form-label">ショップ名 *</label>
        <input type="text" class="form-input" id="shop-name" value="${shop.name || ''}" placeholder="例: カードショップXX">
      </div>
      <div class="form-group">
        <label class="form-label">URL *</label>
        <input type="url" class="form-input" id="shop-url" value="${shop.url || ''}" placeholder="https://example.com">
      </div>
      <div class="form-group">
        <label class="form-label">検索URLパターン</label>
        <input type="text" class="form-input" id="shop-search-pattern" value="${shop.search_url_pattern || ''}" placeholder="https://example.com/search?q={keyword}">
        <small style="color:var(--text-muted)">{keyword} がカード名に置換されます</small>
      </div>
      <div class="form-group">
        <label class="form-label">取得方式</label>
        <select class="form-select" id="shop-provider">
          ${['link-only', 'rakuten-api', 'yahoo-api', 'surugaya-scraper', 'yuyutei-scraper'].map(p =>
            `<option value="${p}" ${shop.provider_type === p ? 'selected' : ''}>${p}</option>`
          ).join('')}
        </select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-check"><input type="checkbox" id="shop-scrape" ${shop.scrape_enabled !== 0 ? 'checked' : ''}> 巡回対象にする</label>
        </div>
        <div class="form-group">
          <label class="form-label">リクエスト間隔(ms)</label>
          <input type="number" class="form-input" id="shop-interval" value="${shop.request_interval_ms || 3000}" min="1000">
        </div>
      </div>
    `;
  },

  getFormData() {
    return {
      name: document.getElementById('shop-name').value.trim(),
      url: document.getElementById('shop-url').value.trim(),
      search_url_pattern: document.getElementById('shop-search-pattern').value.trim(),
      provider_type: document.getElementById('shop-provider').value,
      scrape_enabled: document.getElementById('shop-scrape').checked ? 1 : 0,
      request_interval_ms: parseInt(document.getElementById('shop-interval').value) || 3000,
    };
  },

  showAddModal() {
    Components.showModal('ショップ追加', this.getFormHtml(), async () => {
      const data = this.getFormData();
      if (!data.name || !data.url) { Components.showToast('名前とURLは必須です', 'warning'); return; }
      await API.createShop(data);
      Components.showToast('ショップを追加しました', 'success');
      this.refresh();
    });
  },

  showEditModal(id) {
    const shop = this.shops.find(s => s.id === id);
    if (!shop) return;
    Components.showModal('ショップ編集', this.getFormHtml(shop), async () => {
      const data = this.getFormData();
      if (!data.name || !data.url) { Components.showToast('名前とURLは必須です', 'warning'); return; }
      await API.updateShop(id, data);
      Components.showToast('ショップを更新しました', 'success');
      this.refresh();
    });
  },

  async toggleActive(id, currentState) {
    const shop = this.shops.find(s => s.id === id);
    if (!shop) return;
    await API.updateShop(id, { ...shop, is_active: currentState ? 0 : 1 });
    this.refresh();
  },

  async remove(id) {
    if (await Components.confirm('このショップを削除しますか？')) {
      await API.deleteShop(id);
      Components.showToast('ショップを削除しました', 'success');
      this.refresh();
    }
  },
};
