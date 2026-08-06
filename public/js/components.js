// 共通UIコンポーネント
const Components = {
  // トースト通知
  showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
    toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 4000);
  },

  // モーダル表示
  showModal(title, contentHtml, onSave) {
    let overlay = document.getElementById('modal-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'modal-overlay';
      overlay.className = 'modal-overlay hidden';
      document.body.appendChild(overlay);
    }

    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3>${title}</h3>
          <button class="modal-close" id="modal-close-btn">✕</button>
        </div>
        <div class="modal-body">${contentHtml}</div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="modal-cancel-btn">キャンセル</button>
          ${onSave ? '<button class="btn btn-primary" id="modal-save-btn">保存</button>' : ''}
        </div>
      </div>
    `;
    overlay.classList.remove('hidden');

    const close = () => overlay.classList.add('hidden');
    document.getElementById('modal-close-btn').onclick = close;
    document.getElementById('modal-cancel-btn').onclick = close;
    overlay.onclick = (e) => { if (e.target === overlay) close(); };

    if (onSave) {
      document.getElementById('modal-save-btn').onclick = () => {
        onSave();
        close();
      };
    }
  },

  // 確認ダイアログ
  confirm(message) {
    return new Promise(resolve => {
      this.showModal('確認', `<p>${message}</p>`, null);
      const overlay = document.getElementById('modal-overlay');
      const footer = overlay.querySelector('.modal-footer');
      footer.innerHTML = `
        <button class="btn btn-secondary" id="confirm-no">いいえ</button>
        <button class="btn btn-danger" id="confirm-yes">はい</button>
      `;
      document.getElementById('confirm-no').onclick = () => { overlay.classList.add('hidden'); resolve(false); };
      document.getElementById('confirm-yes').onclick = () => { overlay.classList.add('hidden'); resolve(true); };
    });
  },

  // 価格フォーマット
  formatPrice(price) {
    if (price === null || price === undefined) return '-';
    return `¥${Number(price).toLocaleString()}`;
  },

  // 日付フォーマット
  formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  },

  // 在庫バッジ
  stockBadge(status) {
    const map = {
      'in_stock': '<span class="badge badge-success">在庫あり</span>',
      'out_of_stock': '<span class="badge badge-danger">在庫なし</span>',
      'link_only': '<span class="badge badge-info">リンク</span>',
      'unknown': '<span class="badge badge-muted">不明</span>',
    };
    return map[status] || map['unknown'];
  },

  // プロバイダーバッジ
  providerBadge(type) {
    if (type.includes('api')) return '<span class="badge provider-api">API</span>';
    if (type.includes('scraper')) return '<span class="badge provider-scraper">スクレイパー</span>';
    return '<span class="badge provider-link">リンクのみ</span>';
  },

  // AI評価表示
  aiRating(analysis) {
    if (!analysis || analysis.rating === 0) return '<span class="ai-verdict fair">未分析</span>';
    const stars = '★'.repeat(analysis.rating) + '☆'.repeat(5 - analysis.rating);
    const verdictLabel = { cheap: '割安', fair: '適正', expensive: '割高', unknown: '-' };
    const verdictClass = analysis.verdict || 'fair';
    return `<span class="ai-rating"><span class="ai-stars">${stars}</span><span class="ai-verdict ${verdictClass}">${verdictLabel[analysis.verdict] || '-'}</span></span>`;
  },

  // ローディング表示
  loading(container) {
    if (typeof container === 'string') container = document.getElementById(container);
    if (container) container.innerHTML = '<div class="loading-overlay"><span class="spinner"></span> 読み込み中...</div>';
  },

  // 空状態表示
  empty(container, icon, message) {
    if (typeof container === 'string') container = document.getElementById(container);
    if (container) container.innerHTML = `<div class="empty-state"><div class="icon">${icon}</div><p>${message}</p></div>`;
  },
};
