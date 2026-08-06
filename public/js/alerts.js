// アラート設定画面
const Alerts = {
  alerts: [],
  history: [],
  cards: [],

  async init() {
    await this.refresh();
  },

  async refresh() {
    const container = document.getElementById('view-alerts');
    Components.loading(container);
    try {
      [this.alerts, this.history, this.cards] = await Promise.all([
        API.getAlerts(),
        API.getAlertHistory(),
        API.getCards(),
      ]);
      this.render();
    } catch (e) {
      Components.empty(container, '⚠️', '読み込み失敗');
    }
  },

  render() {
    const container = document.getElementById('view-alerts');
    container.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">🔔 アラート設定</span>
          <div style="display:flex;gap:6px">
            <button class="btn btn-sm btn-secondary" onclick="Alerts.subscribePush()">📱 通知を許可</button>
            <button class="btn btn-sm btn-secondary" onclick="Alerts.testNotify()">🧪 テスト</button>
            <button class="btn btn-sm btn-primary" onclick="Alerts.showAddModal()">＋ アラート追加</button>
          </div>
        </div>
        <div class="panel-body" style="padding:0">
          <div class="table-wrapper">${this.renderTable()}</div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">📜 アラート履歴</span>
        </div>
        <div class="panel-body" style="padding:0">
          <div class="table-wrapper">${this.renderHistory()}</div>
        </div>
      </div>
    `;
  },

  renderTable() {
    if (this.alerts.length === 0) {
      return '<div class="empty-state"><div class="icon">🔔</div><p>アラートが設定されていません</p></div>';
    }
    let html = `<table class="data-table"><thead><tr>
      <th>カード</th><th>条件</th><th>値</th><th>通知方法</th><th>状態</th><th>操作</th>
    </tr></thead><tbody>`;

    const condLabels = { price_below: '以下になったら', price_above: '以上になったら', in_stock: '入荷したら' };

    this.alerts.forEach(a => {
      html += `<tr>
        <td><strong>${a.card_name}</strong>${a.set_name ? `<br><small>${a.set_name}</small>` : ''}</td>
        <td>${condLabels[a.condition_type] || a.condition_type}</td>
        <td>${a.condition_type === 'in_stock' ? '-' : Components.formatPrice(a.condition_value)}</td>
        <td>
          ${a.notify_browser ? '<span class="badge badge-info">ブラウザ</span>' : ''}
          ${a.notify_email ? '<span class="badge badge-warning">メール</span>' : ''}
        </td>
        <td>${a.is_active ? '<span class="badge badge-success">有効</span>' : '<span class="badge badge-muted">無効</span>'}</td>
        <td class="col-actions"><div class="action-group">
          <button class="btn btn-sm btn-secondary" onclick="Alerts.toggleActive(${a.id}, ${a.is_active})">${a.is_active ? '⏸' : '▶'}</button>
          <button class="btn btn-sm btn-danger" onclick="Alerts.remove(${a.id})">🗑</button>
        </div></td>
      </tr>`;
    });
    html += '</tbody></table>';
    return html;
  },

  renderHistory() {
    if (!this.history || this.history.length === 0) {
      return '<div class="empty-state"><div class="icon">📜</div><p>まだアラート履歴はありません</p></div>';
    }
    let html = `<table class="data-table"><thead><tr>
      <th>日時</th><th>カード</th><th>ショップ</th><th>価格</th><th>メッセージ</th>
    </tr></thead><tbody>`;

    this.history.slice(0, 20).forEach(h => {
      html += `<tr>
        <td>${Components.formatDate(h.notified_at)}</td>
        <td>${h.card_name || '-'}</td>
        <td>${h.shop_name || '-'}</td>
        <td class="price">${Components.formatPrice(h.triggered_price)}</td>
        <td style="font-size:.8rem">${h.message || '-'}</td>
      </tr>`;
    });
    html += '</tbody></table>';
    return html;
  },

  getFormHtml() {
    const cardOptions = this.cards.map(c => `<option value="${c.id}">${c.name}${c.rarity ? ` (${c.rarity})` : ''}</option>`).join('');
    return `
      <div class="form-group">
        <label class="form-label">対象カード *</label>
        <select class="form-select" id="alert-card">${cardOptions}</select>
      </div>
      <div class="form-group">
        <label class="form-label">条件</label>
        <select class="form-select" id="alert-condition" onchange="Alerts.onConditionChange()">
          <option value="price_below">指定価格以下になったら</option>
          <option value="price_above">指定価格以上になったら</option>
          <option value="in_stock">入荷したら</option>
        </select>
      </div>
      <div class="form-group" id="alert-value-group">
        <label class="form-label">価格 (円)</label>
        <input type="number" class="form-input" id="alert-value" value="0" min="0">
      </div>
      <div class="form-group">
        <label class="form-label">通知方法</label>
        <label class="form-check"><input type="checkbox" id="alert-browser" checked> ブラウザ通知</label>
        <label class="form-check"><input type="checkbox" id="alert-email"> メール通知</label>
      </div>
    `;
  },

  onConditionChange() {
    const cond = document.getElementById('alert-condition')?.value;
    const group = document.getElementById('alert-value-group');
    if (group) group.style.display = cond === 'in_stock' ? 'none' : 'block';
  },

  showAddModal() {
    if (this.cards.length === 0) {
      Components.showToast('先にカードを追加してください', 'warning');
      return;
    }
    Components.showModal('アラート追加', this.getFormHtml(), async () => {
      const data = {
        card_id: parseInt(document.getElementById('alert-card').value),
        condition_type: document.getElementById('alert-condition').value,
        condition_value: parseInt(document.getElementById('alert-value').value) || 0,
        notify_browser: document.getElementById('alert-browser').checked ? 1 : 0,
        notify_email: document.getElementById('alert-email').checked ? 1 : 0,
      };
      await API.createAlert(data);
      Components.showToast('アラートを追加しました', 'success');
      this.refresh();
    });
  },

  async toggleActive(id, currentState) {
    const alert = this.alerts.find(a => a.id === id);
    if (!alert) return;
    await API.updateAlert(id, { ...alert, is_active: currentState ? 0 : 1 });
    this.refresh();
  },

  async remove(id) {
    if (await Components.confirm('このアラートを削除しますか？')) {
      await API.deleteAlert(id);
      Components.showToast('アラートを削除しました', 'success');
      this.refresh();
    }
  },

  async subscribePush() {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        Components.showToast('このブラウザはプッシュ通知に対応していません', 'warning');
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        Components.showToast('通知が許可されませんでした', 'warning');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const vapidData = await API.getVapidKey();
      if (!vapidData.publicKey) { Components.showToast('VAPID鍵が未設定です', 'error'); return; }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: Alerts.urlBase64ToUint8Array(vapidData.publicKey),
      });
      await API.subscribePush(sub.toJSON());
      Components.showToast('プッシュ通知を有効にしました ✓', 'success');
    } catch (e) {
      Components.showToast(`通知設定エラー: ${e.message}`, 'error');
    }
  },

  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = window.atob(base64);
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
  },

  async testNotify() {
    await API.testNotification();
    Components.showToast('テスト通知を送信しました', 'info');
  },
};
