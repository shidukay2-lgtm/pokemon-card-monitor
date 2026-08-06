// ダッシュボード画面
const Dashboard = {
  data: null,
  analyses: {},
  filterState: null,

  async init() {
    this.loadFilterState();
    await this.refresh();
  },

  async refresh() {
    const container = document.getElementById('view-dashboard');
    Components.loading(container);

    try {
      this.data = await API.getPrices();
      this.render();
    } catch (e) {
      Components.empty(container, '⚠️', 'データの読み込みに失敗しました');
    }
  },

  loadFilterState() {
    try {
      this.filterState = JSON.parse(localStorage.getItem('dashboard_filters')) || {};
    } catch { this.filterState = {}; }
  },

  saveFilterState() {
    localStorage.setItem('dashboard_filters', JSON.stringify(this.filterState));
  },

  render() {
    const { cards, shops, totalCards, totalShops } = this.data;
    const container = document.getElementById('view-dashboard');

    const alertCount = 0; // 後で取得
    const status = App.patrolStatus || {};

    container.innerHTML = `
      <div class="stats-row">
        <div class="stat-card">
          <div class="stat-label">監視カード</div>
          <div class="stat-value">${totalCards}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">有効ショップ</div>
          <div class="stat-value">${totalShops}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">最終巡回</div>
          <div class="stat-value" style="font-size:1rem">${status.lastRun ? Components.formatDate(status.lastRun) : '未実行'}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">次回巡回</div>
          <div class="stat-value" style="font-size:1rem">${status.isEnabled && status.nextRun ? Components.formatDate(status.nextRun) : '-'}</div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">📊 価格比較</span>
          <div style="display:flex;gap:6px">
            <button class="btn btn-sm btn-secondary" onclick="Dashboard.refresh()">🔄 更新</button>
            <button class="btn btn-sm btn-primary" id="btn-patrol-now" onclick="Dashboard.patrol()">▶ 手動巡回</button>
            <button class="btn btn-sm btn-secondary" onclick="Dashboard.analyzeAll()">🤖 AI診断</button>
          </div>
        </div>
        <div class="panel-body" style="padding:0">
          <div class="filter-bar" style="padding:12px 16px">
            <input type="text" class="filter-input" id="filter-name" placeholder="🔍 カード名で検索..." value="${this.filterState.name || ''}" oninput="Dashboard.applyFilter()">
            <select class="filter-select" id="filter-rarity" onchange="Dashboard.applyFilter()">
              <option value="">全レアリティ</option>
              <option value="SAR">SAR</option><option value="SR">SR</option>
              <option value="AR">AR</option><option value="RR">RR</option>
              <option value="UR">UR</option><option value="R">R</option>
            </select>
            <select class="filter-select" id="filter-stock" onchange="Dashboard.applyFilter()">
              <option value="">全在庫状態</option>
              <option value="in_stock">在庫あり</option>
            </select>
          </div>
          <div class="table-wrapper">
            ${this.renderPriceTable(cards, shops)}
          </div>
        </div>
      </div>
    `;

    // フィルター復元
    if (this.filterState.rarity) document.getElementById('filter-rarity').value = this.filterState.rarity;
    if (this.filterState.stock) document.getElementById('filter-stock').value = this.filterState.stock;
    this.applyFilter();
  },

  renderPriceTable(cards, shops) {
    if (!cards || cards.length === 0) {
      return '<div class="empty-state"><div class="icon">📋</div><p>監視カードを追加してください</p></div>';
    }

    const activeShops = shops.filter(s => s.is_active);

    let headerHtml = '<th>カード名</th><th>レアリティ</th><th>最安値</th>';
    activeShops.forEach(s => {
      headerHtml += `<th>${s.name}</th>`;
    });
    headerHtml += '<th>AI</th><th>検索リンク</th>';

    let bodyHtml = '';
    cards.forEach(card => {
      const analysis = this.analyses[card.id];
      const inRange = card.minPrice !== null && card.target_price_max > 0 && card.minPrice <= card.target_price_max;
      const priceClass = inRange ? 'price-in-range' : (card.minPrice !== null && card.target_price_max > 0 ? 'price-over' : '');

      bodyHtml += `<tr data-card-name="${card.name}" data-rarity="${card.rarity || ''}">`;
      bodyHtml += `<td><strong>${card.name}</strong>${card.set_name ? `<br><small style="color:var(--text-muted)">${card.set_name}</small>` : ''}</td>`;
      bodyHtml += `<td>${card.rarity ? `<span class="badge badge-info">${card.rarity}</span>` : '-'}</td>`;
      bodyHtml += `<td class="price ${priceClass}">${Components.formatPrice(card.minPrice)}${card.minPriceShop ? `<br><small style="color:var(--text-muted)">${card.minPriceShop}</small>` : ''}</td>`;

      activeShops.forEach(shop => {
        const entry = (card.shopPrices[shop.id] || [])[0];
        const searchUrl = (shop.search_url_pattern || '').replace('{keyword}', encodeURIComponent(card.name));
        const linkUrl = entry?.product_url || searchUrl;

        if (entry && entry.price != null && entry.price > 0) {
          const cellClass = card.target_price_max > 0 && entry.price <= card.target_price_max ? 'price-in-range' : '';
          bodyHtml += '<td>';
          if (linkUrl) {
            bodyHtml += `<a href="${linkUrl}" target="_blank" rel="noopener" class="price-link"><span class="price ${cellClass}">${Components.formatPrice(entry.price)}</span> ↗</a>`;
          } else {
            bodyHtml += `<span class="price ${cellClass}">${Components.formatPrice(entry.price)}</span>`;
          }
          bodyHtml += `<br>${Components.stockBadge(entry.stock_status)}</td>`;
        } else if (linkUrl) {
          bodyHtml += `<td><a href="${linkUrl}" target="_blank" rel="noopener" class="price-link" style="font-size:0.85rem">🔍 検索 ↗</a></td>`;
        } else {
          bodyHtml += '<td style="color:var(--text-muted)">-</td>';
        }
      });

      bodyHtml += `<td>${Components.aiRating(analysis)}</td>`;

      // 検索リンク
      bodyHtml += '<td><div class="shop-links">';
      activeShops.forEach(shop => {
        const searchUrl = (shop.search_url_pattern || '').replace('{keyword}', encodeURIComponent(card.name));
        if (searchUrl) {
          bodyHtml += `<a href="${searchUrl}" target="_blank" rel="noopener" class="shop-link" title="${shop.name}で検索">${shop.name.slice(0, 3)} ↗</a>`;
        }
      });
      bodyHtml += '</div></td>';
      bodyHtml += '</tr>';
    });

    return `<table class="data-table" id="price-table"><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
  },

  applyFilter() {
    const name = (document.getElementById('filter-name')?.value || '').toLowerCase();
    const rarity = document.getElementById('filter-rarity')?.value || '';
    const stock = document.getElementById('filter-stock')?.value || '';

    this.filterState = { name, rarity, stock };
    this.saveFilterState();

    const rows = document.querySelectorAll('#price-table tbody tr');
    rows.forEach(row => {
      const cardName = (row.dataset.cardName || '').toLowerCase();
      const cardRarity = row.dataset.rarity || '';
      let show = true;
      if (name && !cardName.includes(name)) show = false;
      if (rarity && cardRarity !== rarity) show = false;
      if (stock === 'in_stock' && !row.innerHTML.includes('在庫あり')) show = false;
      row.style.display = show ? '' : 'none';
    });
  },

  async patrol() {
    const btn = document.getElementById('btn-patrol-now');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ 巡回中...'; }
    Components.showToast('巡回を開始しました', 'info');

    try {
      await API.runPatrol();
      Components.showToast('巡回が完了しました', 'success');
      await this.refresh();
    } catch (e) {
      // error already shown by API helper
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '▶ 手動巡回'; }
    }
    App.updatePatrolStatus();
  },

  async analyzeAll() {
    if (!this.data?.cards?.length) return;
    Components.showToast('AI診断を開始しています...', 'info');
    try {
      const ids = this.data.cards.map(c => c.id);
      const results = await API.analyzeBatch(ids);
      this.analyses = results || {};
      this.render();
      Components.showToast('AI診断が完了しました', 'success');
    } catch (e) {
      // error shown
    }
  },
};
