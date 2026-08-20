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
    const { cards, shops, totalCards, totalShops } = this.data || { cards: [], shops: [], totalCards: 0, totalShops: 0 };
    const container = document.getElementById('view-dashboard');
    const status = App.patrolStatus || {};

    container.innerHTML = `
      <!-- 巡回進捗バナー -->
      <div id="patrol-progress-banner" style="display:none;margin-bottom:16px;padding:12px 16px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px"></div>

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
          <div class="stat-value" id="stat-last-patrol" style="font-size:1rem">${status.lastRun ? Components.formatDate(status.lastRun) : '未実行'}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">次回巡回</div>
          <div class="stat-value" id="stat-next-patrol" style="font-size:1rem">${status.isEnabled && status.nextRun ? Components.formatDate(status.nextRun) : '-'}</div>
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
          <div class="filter-bar" style="padding:12px 16px;display:flex;gap:10px;flex-wrap:wrap">
            <input type="text" class="filter-input" id="filter-name" placeholder="🔍 カード名で検索..." value="${this.filterState.name || ''}" oninput="Dashboard.applyFilter()" style="min-width:200px">
            <select class="filter-select" id="filter-rarity" onchange="Dashboard.applyFilter()">
              <option value="">全レアリティ</option>
              <option value="SAR">SAR</option><option value="SR">SR</option>
              <option value="AR">AR</option><option value="RR">RR</option>
              <option value="UR">UR</option><option value="SA">SA</option><option value="R">R</option>
            </select>
            <select class="filter-select" id="filter-target-status" onchange="Dashboard.applyFilter()">
              <option value="">全判定（対象あり・対象なし・該当なし）</option>
              <option value="in_range">🎯 対象あり（目標価格内）</option>
              <option value="out_of_range">⚠️ 対象なし（目標価格外）</option>
              <option value="none">⏹ 該当なし</option>
            </select>
          </div>
          
          <!-- PC表示用ワイドデータテーブル -->
          <div class="pc-view-only table-wrapper">
            ${this.renderPriceTable(cards, shops)}
          </div>

          <!-- スマホ表示用カード型リスト -->
          <div class="mobile-view-only" style="padding:10px">
            ${this.renderMobileCardList(cards, shops)}
          </div>
        </div>
      </div>
    `;

    // フィルター復元
    if (this.filterState.rarity) document.getElementById('filter-rarity').value = this.filterState.rarity;
    if (this.filterState.targetStatus) document.getElementById('filter-target-status').value = this.filterState.targetStatus;
    this.applyFilter();
  },

  renderPriceTable(cards, shops) {
    if (!cards || cards.length === 0) {
      return '<div class="empty-state"><div class="icon">📋</div><p>監視カードを追加してください</p></div>';
    }

    const activeShops = shops.filter(s => s.is_active);

    let headerHtml = '<th>カード名</th><th>レアリティ</th><th>最安値 / 判定</th>';
    activeShops.forEach(s => {
      headerHtml += `<th>${s.name}</th>`;
    });
    headerHtml += '<th>AI診断</th>';

    let bodyHtml = '';
    cards.forEach(card => {
      const analysis = this.analyses[card.id] || {};
      const minPrice = card.minPrice;
      const minPriceShop = card.minPriceShop;
      const hasTargetMax = card.target_price_max > 0;
      const hasTargetMin = card.target_price_min > 0;

      let targetStatusBadge = '<span class="badge badge-muted">⏹ 該当なし</span>';
      let targetStatusKey = 'none';

      if (minPrice !== null && minPrice > 0) {
        let inRange = true;
        if (hasTargetMax && minPrice > card.target_price_max) inRange = false;
        if (hasTargetMin && minPrice < card.target_price_min) inRange = false;
        if (inRange) {
          targetStatusBadge = '<span class="badge badge-success">🎯 対象あり</span>';
          targetStatusKey = 'in_range';
        } else {
          targetStatusBadge = '<span class="badge badge-danger">⚠️ 対象なし</span>';
          targetStatusKey = 'out_of_range';
        }
      }

      const targetRangeStr = hasTargetMax 
        ? (hasTargetMin ? `¥${card.target_price_min.toLocaleString()}〜¥${card.target_price_max.toLocaleString()}` : `〜¥${card.target_price_max.toLocaleString()}`)
        : '';

      const cardInfoSub = [
        card.set_name || '',
        card.card_number ? `(${card.card_number})` : ''
      ].filter(Boolean).join(' ');

      bodyHtml += `<tr data-card-name="${card.name}" data-rarity="${card.rarity || ''}" data-target-status="${targetStatusKey}">`;
      bodyHtml += `<td><strong>${card.name}</strong>${cardInfoSub ? `<br><small style="color:var(--text-muted);font-size:0.75rem">${cardInfoSub}</small>` : ''}</td>`;
      bodyHtml += `<td>${card.rarity ? `<span class="badge badge-primary">${card.rarity}</span>` : '-'}</td>`;

      bodyHtml += `<td>`;
      if (minPrice !== null && minPrice > 0) {
        bodyHtml += `<strong class="price" style="font-size:1.05rem">${Components.formatPrice(minPrice)}</strong>`;
        bodyHtml += `<br>${targetStatusBadge}`;
        if (minPriceShop) bodyHtml += `<br><small style="color:var(--text-muted);font-size:0.75rem">${minPriceShop}</small>`;
      } else {
        bodyHtml += `${targetStatusBadge}`;
      }
      if (targetRangeStr) {
        bodyHtml += `<br><small style="color:var(--text-secondary);font-size:0.7rem">目標: ${targetRangeStr}</small>`;
      }
      bodyHtml += `</td>`;

      activeShops.forEach(shop => {
        const prices = card.shopPrices[shop.id] || [];
        const entry = prices[0];
        if (entry && entry.price !== null && entry.price > 0) {
          const isMin = entry.price === minPrice && minPrice > 0;
          const cellClass = isMin ? 'price-min' : '';
          bodyHtml += `<td>`;
          if (entry.product_url) {
            bodyHtml += `<a href="${entry.product_url}" target="_blank" rel="noopener" class="price ${cellClass}">${Components.formatPrice(entry.price)} ↗</a>`;
          } else {
            bodyHtml += `<span class="price ${cellClass}">${Components.formatPrice(entry.price)}</span>`;
          }
          bodyHtml += `<br>${Components.stockBadge(entry.stock_status)}</td>`;
        } else {
          bodyHtml += '<td style="color:var(--text-muted);font-size:0.85rem">該当なし</td>';
        }
      });

      bodyHtml += `<td>${Components.aiRating(analysis)}</td>`;
      bodyHtml += '</tr>';
    });

    return `<table class="data-table" id="price-table"><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
  },

  renderMobileCardList(cards, shops) {
    if (!cards || cards.length === 0) {
      return '<div class="empty-state"><div class="icon">📋</div><p>監視カードを追加してください</p></div>';
    }

    const activeShops = shops.filter(s => s.is_active);
    let html = '<div class="mobile-card-grid">';

    cards.forEach(card => {
      const minPrice = card.minPrice;
      const minPriceShop = card.minPriceShop;
      const hasTargetMax = card.target_price_max > 0;
      const hasTargetMin = card.target_price_min > 0;

      let targetStatusBadge = '<span class="badge badge-muted">⏹ 該当なし</span>';
      let targetStatusKey = 'none';

      if (minPrice !== null && minPrice > 0) {
        let inRange = true;
        if (hasTargetMax && minPrice > card.target_price_max) inRange = false;
        if (hasTargetMin && minPrice < card.target_price_min) inRange = false;
        if (inRange) {
          targetStatusBadge = '<span class="badge badge-success">🎯 目標内</span>';
          targetStatusKey = 'in_range';
        } else {
          targetStatusBadge = '<span class="badge badge-danger">⚠️ 目標外</span>';
          targetStatusKey = 'out_of_range';
        }
      }

      const targetRangeStr = hasTargetMax 
        ? (hasTargetMin ? `¥${card.target_price_min.toLocaleString()}〜¥${card.target_price_max.toLocaleString()}` : `〜¥${card.target_price_max.toLocaleString()}`)
        : '';

      const cardInfoSub = [
        card.set_name || '',
        card.card_number ? `(${card.card_number})` : ''
      ].filter(Boolean).join(' ');

      html += `
        <div class="mobile-card-card" data-card-name="${card.name}" data-rarity="${card.rarity || ''}" data-target-status="${targetStatusKey}">
          <div class="mobile-card-top">
            <div>
              <div class="mobile-card-title">${card.name}</div>
              ${cardInfoSub ? `<div class="mobile-card-meta">${cardInfoSub}</div>` : ''}
            </div>
            ${card.rarity ? `<span class="badge badge-primary">${card.rarity}</span>` : ''}
          </div>

          <div class="mobile-card-best-box">
            <div>
              <div class="mobile-best-label">最安値 (${minPriceShop || '-'})</div>
              <div class="mobile-best-val">${minPrice ? Components.formatPrice(minPrice) : '該当なし'}</div>
            </div>
            <div>
              ${targetStatusBadge}
              ${targetRangeStr ? `<div style="font-size:0.65rem;color:var(--text-muted);text-align:right;margin-top:2px">目標: ${targetRangeStr}</div>` : ''}
            </div>
          </div>

          <div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:4px;font-weight:bold">ショップ別価格</div>
          <div class="mobile-shop-list">
      `;

      activeShops.forEach(shop => {
        const prices = card.shopPrices[shop.id] || [];
        const entry = prices[0];
        if (entry && entry.price !== null && entry.price > 0) {
          const isMin = entry.price === minPrice && minPrice > 0;
          const href = entry.product_url ? `href="${entry.product_url}" target="_blank" rel="noopener"` : '';
          html += `
            <a class="mobile-shop-pill" ${href} style="${isMin ? 'border-color:var(--success);background:var(--success-bg)' : ''}">
              <span class="mobile-shop-name">${shop.name} ↗</span>
              <span class="mobile-shop-price" style="${isMin ? 'color:var(--success)' : ''}">${Components.formatPrice(entry.price)}</span>
            </a>
          `;
        } else {
          html += `
            <div class="mobile-shop-pill" style="opacity:0.6">
              <span class="mobile-shop-name">${shop.name}</span>
              <span class="mobile-shop-price" style="color:var(--text-muted);font-weight:normal">-</span>
            </div>
          `;
        }
      });

      html += `
          </div>
        </div>
      `;
    });

    html += '</div>';
    return html;
  },

  applyFilter() {
    const name = (document.getElementById('filter-name')?.value || '').toLowerCase();
    const rarity = document.getElementById('filter-rarity')?.value || '';
    const targetStatus = document.getElementById('filter-target-status')?.value || '';

    this.filterState = { name, rarity, targetStatus };
    this.saveFilterState();

    // PCテーブルのフィルタリング
    const rows = document.querySelectorAll('#price-table tbody tr');
    rows.forEach(row => {
      const cardName = (row.dataset.cardName || '').toLowerCase();
      const cardRarity = row.dataset.rarity || '';
      const rowTargetStatus = row.dataset.targetStatus || '';

      let show = true;
      if (name && !cardName.includes(name)) show = false;
      if (rarity && cardRarity !== rarity) show = false;
      if (targetStatus && rowTargetStatus !== targetStatus) show = false;

      row.style.display = show ? '' : 'none';
    });

    // スマホカードのフィルタリング
    const mobileCards = document.querySelectorAll('.mobile-card-grid .mobile-card-card');
    mobileCards.forEach(cardEl => {
      const cardName = (cardEl.dataset.cardName || '').toLowerCase();
      const cardRarity = cardEl.dataset.rarity || '';
      const rowTargetStatus = cardEl.dataset.targetStatus || '';

      let show = true;
      if (name && !cardName.includes(name)) show = false;
      if (rarity && cardRarity !== rarity) show = false;
      if (targetStatus && rowTargetStatus !== targetStatus) show = false;

      cardEl.style.display = show ? '' : 'none';
    });
  },

  async patrol() {
    const btn = document.getElementById('btn-patrol-now');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ 巡回中...'; }
    Components.showToast('巡回を開始しました', 'info');

    // 進捗監視用のタイマー開始（2秒ごとにステータス取得）
    const progressTimer = setInterval(async () => {
      await App.updatePatrolStatus();
      this.updateProgressDisplay();
    }, 2000);

    try {
      await API.runPatrol();
      // 巡回完了直後に最新ステータスを確実に取得
      await App.updatePatrolStatus();
      // ダッシュボードの価格データと最終巡回日時を最新データでリフレッシュ
      await this.refresh();
      Components.showToast('巡回が完了しました ✓', 'success');
    } catch (e) {
      Components.showToast(`巡回エラー: ${e.message}`, 'error');
    } finally {
      clearInterval(progressTimer);
      if (btn) { btn.disabled = false; btn.textContent = '▶ 手動巡回'; }
      await App.updatePatrolStatus();
      this.updateProgressDisplay();
    }
  },

  updateProgressDisplay() {
    const s = App.patrolStatus;
    const progressContainer = document.getElementById('patrol-progress-banner');
    if (!progressContainer) return;

    if (s?.isRunning || s?.progress?.status === '巡回中') {
      const current = s.progress.current || 0;
      const total = s.progress.total || 1;
      const pct = Math.min(100, Math.round((current / total) * 100));
      progressContainer.style.display = 'block';
      progressContainer.innerHTML = `
        <div style="display:flex;justify-content:space-between;font-size:0.85rem;margin-bottom:6px">
          <span>🔄 ショップ巡回中... (${current} / ${total} 処理完了)</span>
          <span>${pct}%</span>
        </div>
        <div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden">
          <div style="height:100%;background:var(--color-primary);width:${pct}%;transition:width 0.3s"></div>
        </div>
      `;
    } else {
      progressContainer.style.display = 'none';
    }
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
