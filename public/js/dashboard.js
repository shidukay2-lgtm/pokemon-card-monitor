/**
 * ダッシュボード画面（価格一覧）
 */
const Dashboard = {
  data: null,
  analyses: {},
  filterState: { name: '', rarity: '', targetStatus: '' },

  init() {
    this.loadFilterState();
    this.render();
    this.refresh();
  },

  loadFilterState() {
    try {
      const saved = localStorage.getItem('dashboard_filter_state');
      if (saved) this.filterState = JSON.parse(saved);
    } catch (e) {}
  },

  saveFilterState() {
    try {
      localStorage.setItem('dashboard_filter_state', JSON.stringify(this.filterState));
    } catch (e) {}
  },

  async refresh() {
    try {
      const res = await API.getPrices();
      if (res && res.data) {
        this.data = res.data;
        if (this.data.cards) {
          this.data.cards.forEach(card => {
            if (card.aiAnalysis) {
              this.analyses[card.id] = card.aiAnalysis;
            }
          });
        }
        this.render();
      }
    } catch (error) {
      Components.showToast(`データ取得エラー: ${error.message}`, 'error');
    }
  },

  render() {
    const container = document.getElementById('view-container');
    if (!container) return;

    const cards = this.data?.cards || [];
    const shops = this.data?.shops || [];
    const activeShops = shops.filter(s => s.is_active);

    container.innerHTML = `
      <div class="card" style="border:none;background:transparent;padding:0">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px">
          <div style="display:flex;align-items:center;gap:12px">
            <h2 style="font-size:1.4rem;font-weight:700;margin:0">📊 価格モニター</h2>
            <span class="badge badge-secondary" style="font-size:0.85rem">${cards.length} 枚監視中 / ${activeShops.length} ショップ</span>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-secondary" id="btn-ai-analyze-all" onclick="Dashboard.analyzeAll()" style="font-size:0.85rem">🤖 AI一括診断</button>
            <button class="btn btn-primary" id="btn-patrol" onclick="Dashboard.runPatrol()" style="font-size:0.85rem">▶ 手動巡回</button>
          </div>
        </div>

        <!-- 巡回進捗バナー -->
        <div id="patrol-progress-banner" style="display:none;background:var(--bg-secondary);border:1px solid var(--accent);border-radius:8px;padding:12px 16px;margin-bottom:16px"></div>

        <div class="card" style="padding:0;overflow:hidden">
          <!-- フィルターバー -->
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
      const analysis = this.analyses[card.id] || null;
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
          const hasRange = entry.has_range || (entry.max_price && entry.max_price > entry.price) || (entry.original_price && entry.original_price > entry.price);
          const maxVal = entry.max_price || entry.original_price || entry.price;
          const minVal = entry.min_price || entry.price;

          // 最安出品店舗名の抽出（例: 平安堂座光寺店）
          let branchName = '';
          if (entry.product_name && entry.product_name.includes('(')) {
            const match = entry.product_name.match(/\(([^)]+)\)/);
            if (match) branchName = match[1];
          }

          bodyHtml += `<td>`;
          if (entry.product_url) {
            bodyHtml += `<a href="${entry.product_url}" target="_blank" rel="noopener" class="price ${cellClass}" style="text-decoration:none;font-weight:700" title="クリックで最安値商品詳細ページを開く">${Components.formatPrice(minVal)} ↗</a>`;
          } else {
            bodyHtml += `<span class="price ${cellClass}">${Components.formatPrice(minVal)}</span>`;
          }

          // 複数店舗の価格範囲（例: ¥6,000 〜 ¥10,500）
          if (hasRange) {
            bodyHtml += `<div style="font-size:0.75rem;color:var(--text-secondary);margin-top:2px;font-weight:600;letter-spacing:-0.2px">¥${minVal.toLocaleString()}〜¥${maxVal.toLocaleString()}</div>`;
          }

          if (branchName) {
            bodyHtml += `<div style="margin-top:2px"><span style="display:inline-block;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-muted);font-size:0.68rem;background:rgba(255,255,255,0.06);padding:1px 5px;border-radius:4px" title="${branchName}">🏪 ${branchName}</span></div>`;
          }

          bodyHtml += `<div style="margin-top:3px">${Components.stockBadge(entry.stock_status)}</div></td>`;
        } else if (entry && entry.product_url) {
          bodyHtml += `<td><a href="${entry.product_url}" target="_blank" rel="noopener" class="btn btn-sm btn-secondary" style="font-size:0.75rem;padding:3px 8px;text-decoration:none;display:inline-flex;align-items:center;gap:3px">🔍 検索 ↗</a><br><small style="color:var(--text-muted);font-size:0.65rem">リンク検索</small></td>`;
        } else {
          bodyHtml += '<td style="color:var(--text-muted);font-size:0.85rem">該当なし</td>';
        }
      });

      // AI診断列（クリックで詳細モーダル）
      if (analysis && analysis.rating > 0) {
        bodyHtml += `<td><div style="cursor:pointer" onclick="Dashboard.showAiDetail(${card.id})" title="クリックでAI診断の詳細を表示">${Components.aiRating(analysis)}<br><small style="color:var(--text-muted);font-size:0.7rem;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${analysis.comment || ''}</small></div></td>`;
      } else {
        bodyHtml += `<td><button class="btn btn-sm btn-secondary" onclick="Dashboard.analyzeCard(${card.id})" style="font-size:0.75rem;padding:3px 6px">🤖 診断</button></td>`;
      }

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
      const analysis = this.analyses[card.id] || null;
      const minPrice = card.minPrice;
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

      // 各ショップの価格バッジリスト
      let shopBadgesHtml = '';
      activeShops.forEach(shop => {
        const prices = card.shopPrices[shop.id] || [];
        const entry = prices[0];
        if (entry && entry.price !== null && entry.price > 0) {
          const isMin = entry.price === minPrice && minPrice > 0;
          const minBorder = isMin ? 'border:2px solid var(--accent-green);background:rgba(34,197,94,0.12);' : '';
          const hasRange = entry.has_range || (entry.max_price && entry.max_price > entry.price) || (entry.original_price && entry.original_price > entry.price);
          const maxVal = entry.max_price || entry.original_price || entry.price;
          const minVal = entry.min_price || entry.price;

          let branchName = '';
          if (entry.product_name && entry.product_name.includes('(')) {
            const match = entry.product_name.match(/\(([^)]+)\)/);
            if (match) branchName = match[1];
          }

          const rangeText = hasRange ? `¥${minVal.toLocaleString()}〜¥${maxVal.toLocaleString()}` : Components.formatPrice(minVal);

          shopBadgesHtml += `
            <a href="${entry.product_url || '#'}" target="_blank" rel="noopener" class="mobile-shop-pill" style="${minBorder}text-decoration:none;display:flex;justify-content:space-between;align-items:center;padding:8px 12px;margin-bottom:6px;border-radius:8px;background:var(--bg-secondary)">
              <div style="display:flex;flex-direction:column;gap:2px">
                <div style="display:flex;align-items:center;gap:6px">
                  <span style="font-weight:600;font-size:0.85rem;color:var(--text-primary)">${shop.name}</span>
                  ${isMin ? '<span class="badge badge-success" style="font-size:0.65rem;padding:1px 5px">最安値</span>' : ''}
                </div>
                ${branchName ? `<small style="font-size:0.7rem;color:var(--text-muted)">🏪 ${branchName}</small>` : ''}
              </div>
              <div style="text-align:right">
                <span class="price" style="font-weight:700;font-size:0.95rem;color:${isMin ? 'var(--accent-green)' : 'var(--text-primary)'}">${rangeText} ↗</span>
                <div style="margin-top:2px">${Components.stockBadge(entry.stock_status)}</div>
              </div>
            </a>
          `;
        } else if (entry && entry.product_url) {
          shopBadgesHtml += `
            <a href="${entry.product_url}" target="_blank" rel="noopener" class="mobile-shop-pill" style="text-decoration:none;display:flex;justify-content:space-between;align-items:center;padding:8px 12px;margin-bottom:6px;border-radius:8px;background:var(--bg-secondary);opacity:0.85">
              <span style="font-weight:600;font-size:0.85rem;color:var(--text-secondary)">${shop.name}</span>
              <span class="btn btn-sm btn-secondary" style="font-size:0.75rem;padding:2px 8px">🔍 検索 ↗</span>
            </a>
          `;
        }
      });

      // AI診断セクション（スマホ用）
      let aiSectionHtml = '';
      if (analysis && analysis.rating > 0) {
        aiSectionHtml = `
          <div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border);cursor:pointer" onclick="Dashboard.showAiDetail(${card.id})">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span style="font-size:0.75rem;color:var(--text-muted)">🤖 AI相場診断</span>
              ${Components.aiRating(analysis)}
            </div>
            <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:3px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${analysis.comment || ''}</div>
          </div>
        `;
      } else {
        aiSectionHtml = `
          <div style="margin-top:8px;padding-top:6px;border-top:1px solid var(--border);display:flex;justify-content:flex-end">
            <button class="btn btn-sm btn-secondary" onclick="Dashboard.analyzeCard(${card.id})" style="font-size:0.75rem;padding:3px 8px">🤖 AI診断</button>
          </div>
        `;
      }

      html += `
        <div class="mobile-card-card card" data-card-name="${card.name}" data-rarity="${card.rarity || ''}" data-target-status="${targetStatusKey}" style="margin-bottom:12px;padding:14px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
            <div>
              <strong style="font-size:1.05rem;color:var(--text-primary)">${card.name}</strong>
              ${card.rarity ? `<span class="badge badge-primary" style="margin-left:6px;font-size:0.7rem">${card.rarity}</span>` : ''}
              ${cardInfoSub ? `<div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px">${cardInfoSub}</div>` : ''}
            </div>
            <div>${targetStatusBadge}</div>
          </div>

          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px;padding:6px 10px;background:var(--bg-tertiary);border-radius:6px">
            <span style="font-size:0.8rem;color:var(--text-muted)">全ショップ最安値:</span>
            <strong style="font-size:1.15rem;color:var(--accent-green)">${minPrice ? Components.formatPrice(minPrice) : '該当なし'}</strong>
          </div>

          <!-- 各ショップ価格リスト -->
          <div style="margin-bottom:4px">
            ${shopBadgesHtml}
          </div>

          ${aiSectionHtml}
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

  async runPatrol() {
    const btn = document.getElementById('btn-patrol');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ 巡回中...'; }
    Components.showToast('ショップ巡回を開始しました...', 'info');

    const progressTimer = setInterval(async () => {
      await App.updatePatrolStatus();
      this.updateProgressDisplay();
    }, 1500);

    try {
      await API.patrol();
      await App.updatePatrolStatus();
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
          <div style="height:100%;background:var(--accent);width:${pct}%;transition:width 0.3s"></div>
        </div>
      `;
    } else {
      progressContainer.style.display = 'none';
    }
  },

  // カード単体のAI診断
  async analyzeCard(cardId) {
    Components.showToast('🤖 AI診断を実行中...', 'info');
    try {
      const result = await API.analyzeCard(cardId);
      if (result) {
        this.analyses[cardId] = result;
        this.render();
        Components.showToast('AI診断が完了しました ✓', 'success');
      }
    } catch (e) {
      Components.showToast(`AI診断エラー: ${e.message}`, 'error');
    }
  },

  // 全カードのAI一括診断
  async analyzeAll() {
    if (!this.data?.cards?.length) return;
    const btn = document.getElementById('btn-ai-analyze-all');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ AI診断中...'; }
    Components.showToast('🤖 全カードのAI診断を開始しました...', 'info');

    try {
      const ids = this.data.cards.map(c => c.id);
      const results = await API.analyzeBatch(ids);
      this.analyses = results || {};
      this.render();
      Components.showToast('AI一括診断が完了しました ✓', 'success');
    } catch (e) {
      Components.showToast(`AI診断エラー: ${e.message}`, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '🤖 AI一括診断'; }
    }
  },

  // AI診断詳細モーダル
  showAiDetail(cardId) {
    const card = this.data?.cards?.find(c => c.id === cardId);
    const analysis = this.analyses[cardId];
    if (!card || !analysis) return;

    const stars = '★'.repeat(analysis.rating || 0) + '☆'.repeat(5 - (analysis.rating || 0));
    const verdictLabels = {
      bargain: '🔥 超特価・即買い推奨',
      fair: '⚖️ 適正相場・買い頃',
      overpriced: '⚠️ 割高・様子見推奨',
      very_overpriced: '❌ 超割高・購入非推奨',
      suspicious_cheap: '🚨 異常安値・状態要確認',
      unknown: 'データ不足'
    };
    const trendLabels = { up: '📈 上昇傾向', stable: '➡️ 横ばい・安定', down: '📉 下落傾向' };

    const pa = analysis.priceAnalysis || analysis.reasoning || {};
    const buybackPriceStr = pa.buybackPrice ? `¥${pa.buybackPrice.toLocaleString()}` : '取得中';
    const fairPriceStr = pa.fairMarketPrice ? `¥${pa.fairMarketPrice.toLocaleString()}` : '-';
    const buybackSourceStr = pa.buybackSource || '遊々亭 買取 (実測値)';
    const minPriceVal = pa.currentMin || card.minPrice;
    const minPriceStr = minPriceVal ? `¥${minPriceVal.toLocaleString()}` : '-';
    const minShopStr = pa.minShop || card.minPriceShop || '-';

    const modalHtml = `
      <div style="font-size:0.95rem">
        <div style="margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid var(--border)">
          <strong style="font-size:1.15rem;color:var(--text-primary)">${card.name}</strong>
          ${card.rarity ? ` <span class="badge badge-primary">${card.rarity}</span>` : ''}
          <div style="font-size:0.8rem;color:var(--text-muted);margin-top:2px">${card.set_name || ''} ${card.card_number ? `(${card.card_number})` : ''}</div>
        </div>

        <!-- スコア＆判定バナー -->
        <div style="display:grid;grid-template-columns:repeat(2, 1fr);gap:10px;margin-bottom:12px">
          <div style="background:var(--bg-tertiary);padding:10px 14px;border-radius:8px">
            <div style="font-size:0.75rem;color:var(--text-muted)">割安度スコア（厳格基準）</div>
            <div style="font-size:1.25rem;color:#f59e0b;font-weight:bold;letter-spacing:1px">${stars}</div>
          </div>
          <div style="background:var(--bg-tertiary);padding:10px 14px;border-radius:8px">
            <div style="font-size:0.75rem;color:var(--text-muted)">総合相場判定</div>
            <div style="font-size:1rem;font-weight:bold;color:var(--text-primary)">${verdictLabels[analysis.verdict] || analysis.verdict}</div>
          </div>
        </div>

        <!-- 外部買取相場 vs 販売最安値 比較テーブル -->
        <div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:12px">
          <div style="font-size:0.8rem;font-weight:bold;color:var(--accent-hover);margin-bottom:8px">📊 多角相場データ比較</div>
          <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:8px;text-align:center">
            <div style="background:var(--bg-tertiary);padding:8px 6px;border-radius:6px">
              <div style="font-size:0.7rem;color:var(--text-muted)">外部買取相場</div>
              <div style="font-size:1rem;font-weight:bold;color:var(--accent-hover);margin-top:2px">${buybackPriceStr}</div>
              <div style="font-size:0.65rem;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${buybackSourceStr}</div>
            </div>
            <div style="background:var(--bg-tertiary);padding:8px 6px;border-radius:6px">
              <div style="font-size:0.7rem;color:var(--text-muted)">監視ショップ最安</div>
              <div style="font-size:1rem;font-weight:bold;color:var(--success);margin-top:2px">${minPriceStr}</div>
              <div style="font-size:0.65rem;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${minShopStr}</div>
            </div>
            <div style="background:var(--bg-tertiary);padding:8px 6px;border-radius:6px">
              <div style="font-size:0.7rem;color:var(--text-muted)">市場適正相場</div>
              <div style="font-size:1rem;font-weight:bold;color:var(--text-primary);margin-top:2px">${fairPriceStr}</div>
              <div style="font-size:0.65rem;color:var(--text-muted)">専門店相場中央値</div>
            </div>
          </div>
          ${pa.buybackDiffPercent != null ? `<div style="font-size:0.75rem;color:var(--text-secondary);margin-top:8px;text-align:right">買取相場との乖離: <strong>${pa.buybackDiffPercent > 0 ? '+' : ''}${pa.buybackDiffPercent}%</strong></div>` : ''}
        </div>

        <!-- AI推論コメント＆アドバイス -->
        <div style="background:linear-gradient(135deg, rgba(99,102,241,0.1) 0%, rgba(34,197,94,0.1) 100%);padding:12px;border-radius:8px;border:1px solid rgba(99,102,241,0.25);margin-bottom:12px">
          <div style="font-size:0.8rem;font-weight:bold;color:var(--accent-hover);margin-bottom:4px">💡 AI相場鑑定士の推論根拠</div>
          <div style="font-size:0.85rem;line-height:1.5;color:var(--text-primary);font-weight:500">${analysis.comment || '相場データを分析しました。'}</div>
        </div>

        <div style="font-size:0.75rem;color:var(--text-muted);display:flex;justify-content:space-between">
          <span>相場トレンド: <strong>${trendLabels[analysis.trend] || '横ばい'}</strong></span>
          <span>分析方式: <strong>複数買取サイト照合</strong></span>
        </div>
      </div>
    `;

    Components.showModal('🤖 AI相場診断 詳細', modalHtml, [
      { text: '閉じる', class: 'btn-secondary', onclick: () => Components.closeModal() }
    ]);
  }
};
