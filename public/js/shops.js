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
          <!-- PC用テーブル -->
          <div class="pc-view-only table-wrapper">${this.renderTable()}</div>
          <!-- スマホ用カードリスト -->
          <div class="mobile-view-only" style="padding:10px">${this.renderMobileShops()}</div>
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

  renderMobileShops() {
    if (this.shops.length === 0) {
      return '<div class="empty-state"><div class="icon">🏪</div><p>ショップが登録されていません</p></div>';
    }

    let html = '<div class="mobile-card-grid">';
    this.shops.forEach(s => {
      html += `
        <div class="mobile-card-card">
          <div class="mobile-card-top">
            <div>
              <div class="mobile-card-title">${s.name}</div>
              <div class="mobile-card-meta">
                <a href="${s.url}" target="_blank" rel="noopener">${s.url.replace(/https?:\/\//, '').slice(0, 35)}... ↗</a>
              </div>
            </div>
            <div style="display:flex;gap:4px">
              ${Components.providerBadge(s.provider_type)}
              ${s.is_active ? '<span class="badge badge-success">有効</span>' : '<span class="badge badge-muted">無効</span>'}
            </div>
          </div>
          
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:0.8rem;color:var(--text-secondary)">
            <span>巡回スクレイピング: ${s.scrape_enabled ? '<strong style="color:var(--success)">ON</strong>' : '<strong style="color:var(--text-muted)">OFF</strong>'}</span>
            <div style="display:flex;gap:6px">
              <button class="btn btn-sm btn-secondary" onclick="Shops.showEditModal(${s.id})">✏️ 編集</button>
              <button class="btn btn-sm btn-secondary" onclick="Shops.toggleActive(${s.id}, ${s.is_active})">${s.is_active ? '⏸' : '▶'}</button>
              <button class="btn btn-sm btn-danger" onclick="Shops.remove(${s.id})">🗑</button>
            </div>
          </div>
        </div>
      `;
    });
    html += '</div>';
    return html;
  },

  getFormHtml(shop = {}) {
    const isEdit = !!shop.id;
    return `
      <!-- 自動検索・補完セクション -->
      <div style="background:linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(34,197,94,0.08) 100%);border:1px solid rgba(99,102,241,0.3);border-radius:8px;padding:12px;margin-bottom:16px">
        <label class="form-label" style="color:var(--accent-hover);font-weight:bold;margin-bottom:4px">
          🔍 ショップ名またはURLから自動入力
        </label>
        <div style="display:flex;gap:8px">
          <input type="text" class="form-input" id="shop-lookup-input" placeholder="例: 晴れる屋2、トレトク、ドラゴンスター、または https://..." onkeydown="if(event.key==='Enter'){event.preventDefault();Shops.autoDetectShop();}">
          <button type="button" class="btn btn-primary" id="btn-detect-shop" onclick="Shops.autoDetectShop()" style="white-space:nowrap;padding:8px 14px">
            🔍 自動取得
          </button>
        </div>
        <div id="shop-detect-status" style="font-size:0.75rem;margin-top:6px;color:var(--text-muted)">
          💡 ショップ名（晴れる屋2、カードラボ等）や通販URLを入れると、検索URLと推奨取得方式を自動入力します
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">ショップ名 *</label>
        <input type="text" class="form-input" id="shop-name" value="${shop.name || ''}" placeholder="例: 晴れる屋2">
      </div>
      <div class="form-group">
        <label class="form-label">ベースURL *</label>
        <input type="url" class="form-input" id="shop-url" value="${shop.url || ''}" placeholder="https://www.hareruya2.com">
      </div>
      <div class="form-group">
        <label class="form-label">検索URLパターン *</label>
        <input type="text" class="form-input" id="shop-search-pattern" value="${shop.search_url_pattern || ''}" placeholder="https://www.hareruya2.com/product-list?keyword={keyword}">
        <small style="color:var(--text-muted)">{keyword} が検索時にカード名へ置換されます</small>
      </div>
      <div class="form-group">
        <label class="form-label">取得方式 (推奨方式が自動選択されます)</label>
        <select class="form-select" id="shop-provider">
          ${[
            { id: 'link-only', label: 'link-only (汎用リンク・推奨)' },
            { id: 'torema-scraper', label: 'torema-scraper (トレマ専用スクレイパー)' },
            { id: 'mercari-scraper', label: 'mercari-scraper (メルカリ専用)' },
            { id: 'surugaya-scraper', label: 'surugaya-scraper (駿河屋専用)' },
            { id: 'yuyutei-scraper', label: 'yuyutei-scraper (遊々亭専用)' },
            { id: 'cardrush-scraper', label: 'cardrush-scraper (カードラッシュ専用)' },
            { id: 'rakuten-api', label: 'rakuten-api (楽天市場API)' },
            { id: 'yahoo-api', label: 'yahoo-api (Yahoo!ショッピングAPI)' }
          ].map(p =>
            `<option value="${p.id}" ${shop.provider_type === p.id ? 'selected' : ''}>${p.label}</option>`
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

  async autoDetectShop() {
    const input = document.getElementById('shop-lookup-input');
    const status = document.getElementById('shop-detect-status');
    const btn = document.getElementById('btn-detect-shop');
    const query = input?.value.trim();

    if (!query) {
      Components.showToast('ショップ名またはURLを入力してください', 'warning');
      input?.focus();
      return;
    }

    if (btn) { btn.disabled = true; btn.textContent = '⏳ 検出中...'; }
    if (status) status.innerHTML = '<span style="color:var(--accent)">🔍 ショップ情報と検索URLパターンを解析中...</span>';

    try {
      const info = await API.lookupShop(query);
      if (!info || !info.name) {
        throw new Error('ショップ情報を取得できませんでした');
      }

      // 各フォーム要素に自動反映
      const nameEl = document.getElementById('shop-name');
      const urlEl = document.getElementById('shop-url');
      const patternEl = document.getElementById('shop-search-pattern');
      const providerEl = document.getElementById('shop-provider');
      const scrapeEl = document.getElementById('shop-scrape');
      const intervalEl = document.getElementById('shop-interval');

      if (nameEl) nameEl.value = info.name;
      if (urlEl) urlEl.value = info.url;
      if (patternEl) patternEl.value = info.search_url_pattern || '';
      if (providerEl && info.provider_type) {
        providerEl.value = info.provider_type;
      }
      if (scrapeEl) {
        scrapeEl.checked = info.scrape_enabled !== 0;
      }
      if (intervalEl && info.request_interval_ms) {
        intervalEl.value = info.request_interval_ms;
      }

      if (status) {
        status.innerHTML = `
          <span style="color:var(--success);font-weight:bold">
            ✨ 【${info.name}】の情報を自動入力しました！（推奨方式: ${info.provider_type} / ${info.description || '自動設定完了'}）
          </span>
        `;
      }
      Components.showToast(`「${info.name}」の設定を自動入力しました ✓`, 'success');
    } catch (e) {
      if (status) {
        status.innerHTML = `<span style="color:var(--danger)">⚠️ 検出エラー: ${e.message}</span>`;
      }
      Components.showToast(`自動検出失敗: ${e.message}`, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '🔍 自動取得'; }
    }
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
      if (!data.name || !data.url) {
        Components.showToast('ショップ名とURLは必須です', 'warning');
        return false;
      }
      try {
        await API.createShop(data);
        Components.showToast('ショップを追加しました ✓', 'success');
        await this.refresh();
        return true;
      } catch (e) {
        Components.showToast(`追加失敗: ${e.message}`, 'error');
        return false;
      }
    });
  },

  showEditModal(id) {
    const shop = this.shops.find(s => s.id === id);
    if (!shop) return;
    Components.showModal('ショップ編集', this.getFormHtml(shop), async () => {
      const data = this.getFormData();
      if (!data.name || !data.url) {
        Components.showToast('ショップ名とURLは必須です', 'warning');
        return false;
      }
      try {
        await API.updateShop(id, data);
        Components.showToast('ショップを更新しました ✓', 'success');
        await this.refresh();
        return true;
      } catch (e) {
        Components.showToast(`更新失敗: ${e.message}`, 'error');
        return false;
      }
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
