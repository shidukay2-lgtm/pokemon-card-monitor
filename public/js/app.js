// メインアプリケーション
const App = {
  currentView: 'dashboard',
  patrolStatus: null,
  statusInterval: null,

  async init() {
    // LocalStorageから状態復元
    this.restoreState();
    // サイドバー
    this.initSidebar();
    // 巡回ステータス監視
    await this.updatePatrolStatus();
    this.statusInterval = setInterval(() => this.updatePatrolStatus(), 10000);
    // ビュー初期化
    this.navigate(this.currentView);
    // Service Worker
    this.registerSW();
    // 巡回トグルイベント
    document.getElementById('patrol-toggle')?.addEventListener('change', () => this.onPatrolToggle());
    // 間隔変更
    document.getElementById('patrol-interval-input')?.addEventListener('change', (e) => this.onIntervalChange(e));
    // ローディング画面を非表示
    const loader = document.getElementById('app-loader');
    if (loader) { loader.classList.add('hide'); setTimeout(() => loader.remove(), 500); }
  },

  restoreState() {
    this.currentView = localStorage.getItem('current_view') || 'dashboard';
    const collapsed = localStorage.getItem('sidebar_collapsed') === 'true';
    if (collapsed && window.innerWidth > 768) {
      document.querySelector('.sidebar')?.classList.add('collapsed');
    }
  },

  saveState() {
    localStorage.setItem('current_view', this.currentView);
  },

  initSidebar() {
    const menuBtn = document.getElementById('menu-toggle');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    menuBtn?.addEventListener('click', () => {
      sidebar?.classList.toggle('open');
      overlay?.classList.toggle('active');
    });

    overlay?.addEventListener('click', () => {
      sidebar?.classList.remove('open');
      overlay?.classList.remove('active');
    });

    // ナビゲーションクリック
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const view = item.dataset.view;
        if (view) this.navigate(view);
        sidebar?.classList.remove('open');
        overlay?.classList.remove('active');
      });
    });
  },

  navigate(view) {
    this.currentView = view;
    this.saveState();

    // ナビ active 更新
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelector(`.nav-item[data-view="${view}"]`)?.classList.add('active');

    // ビュー切り替え
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const viewEl = document.getElementById(`view-${view}`);
    if (viewEl) viewEl.classList.add('active');

    // ヘッダータイトル更新
    const titles = { dashboard: '📊 ダッシュボード', cards: '🃏 カード管理', shops: '🏪 ショップ管理', alerts: '🔔 アラート設定' };
    const titleEl = document.getElementById('header-title');
    if (titleEl) titleEl.textContent = titles[view] || '';

    // ビュー初期化
    switch (view) {
      case 'dashboard': Dashboard.init(); break;
      case 'cards': Cards.init(); break;
      case 'shops': Shops.init(); break;
      case 'alerts': Alerts.init(); break;
    }
  },

  async updatePatrolStatus() {
    try {
      this.patrolStatus = await API.getPatrolStatus();
      this.renderPatrolStatus();
    } catch (e) { /* silent */ }
  },

  renderPatrolStatus() {
    const s = this.patrolStatus;
    if (!s) return;

    const toggle = document.getElementById('patrol-toggle');
    if (toggle) toggle.checked = s.isEnabled;

    const intervalInput = document.getElementById('patrol-interval-input');
    if (intervalInput) intervalInput.value = s.interval;

    const statusEl = document.getElementById('patrol-status-badge');
    if (statusEl) {
      const statusMap = {
        '巡回中': { class: 'running', text: '🔄 巡回中' },
        '待機中': { class: 'waiting', text: '⏳ 待機中' },
        '停止中': { class: 'stopped', text: '⏹ 停止中' },
      };
      const st = statusMap[s.progress?.status] || statusMap['停止中'];
      statusEl.className = `patrol-status ${st.class}`;
      statusEl.textContent = st.text;
    }
  },

  async onPatrolToggle() {
    try {
      const result = await API.togglePatrol();
      Components.showToast(result.isEnabled ? '自動巡回を開始しました' : '自動巡回を停止しました', 'success');
      await this.updatePatrolStatus();
    } catch (e) { /* error shown by API */ }
  },

  async onIntervalChange(e) {
    const val = parseInt(e.target.value);
    if (val < 5 || val > 120) {
      Components.showToast('間隔は5〜120分で設定してください', 'warning');
      return;
    }
    try {
      await API.setPatrolInterval(val);
      Components.showToast(`巡回間隔を${val}分に変更しました`, 'success');
    } catch (e) { /* error shown */ }
  },

  async registerSW() {
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('/sw.js');
      } catch (e) { console.log('SW registration failed:', e); }
    }
  },
};

// DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => App.init());
