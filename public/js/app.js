// メインアプリケーション
const App = {
  currentView: 'dashboard',
  deviceMode: 'auto', // 'auto', 'pc', 'mobile'
  patrolStatus: null,
  statusInterval: null,

  async init() {
    try {
      // LocalStorageから状態復元
      this.restoreState();
      // 表示モード初期化（PC/スマホ切替）
      this.initDeviceMode();
      // サイドバー & ボトムナビ初期化
      this.initSidebar();
      this.initBottomNav();
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
    } catch (e) {
      console.error('App init error:', e);
    } finally {
      // ローディング画面を確実に非表示・削除
      const loader = document.getElementById('app-loader');
      if (loader) {
        loader.classList.add('hide');
        setTimeout(() => loader.remove(), 400);
      }
    }
  },

  restoreState() {
    this.currentView = localStorage.getItem('current_view') || 'dashboard';
    this.deviceMode = localStorage.getItem('device_mode') || 'auto';
    const collapsed = localStorage.getItem('sidebar_collapsed') === 'true';
    if (collapsed && window.innerWidth > 768) {
      document.querySelector('.sidebar')?.classList.add('collapsed');
    }
  },

  saveState() {
    localStorage.setItem('current_view', this.currentView);
    localStorage.setItem('device_mode', this.deviceMode);
  },

  initDeviceMode() {
    this.setDeviceMode(this.deviceMode);

    // 切り替えボタンのイベント登録
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        if (mode) this.setDeviceMode(mode);
      });
    });
  },

  setDeviceMode(mode) {
    this.deviceMode = mode;
    this.saveState();

    // ボタンのactive表示更新
    document.querySelectorAll('.mode-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === mode);
    });

    // bodyのクラス適用
    document.body.classList.remove('mode-pc', 'mode-mobile');
    if (mode === 'pc') {
      document.body.classList.add('mode-pc');
    } else if (mode === 'mobile') {
      document.body.classList.add('mode-mobile');
    }
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

    // サイドバーナビゲーションクリック
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const view = item.dataset.view;
        if (view) this.navigate(view);
        sidebar?.classList.remove('open');
        overlay?.classList.remove('active');
      });
    });
  },

  initBottomNav() {
    // ボトムナビゲーションクリック
    document.querySelectorAll('.bottom-nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const view = item.dataset.view;
        if (view) this.navigate(view);
      });
    });
  },

  navigate(view) {
    this.currentView = view;
    this.saveState();

    // サイドバーナビ active 更新
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelector(`.nav-item[data-view="${view}"]`)?.classList.add('active');

    // ボトムナビ active 更新
    document.querySelectorAll('.bottom-nav-item').forEach(n => n.classList.remove('active'));
    document.querySelector(`.bottom-nav-item[data-view="${view}"]`)?.classList.add('active');

    // ビュー切り替え
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const viewEl = document.getElementById(`view-${view}`);
    if (viewEl) viewEl.classList.add('active');

    // ヘッダータイトル更新
    const titles = {
      dashboard: '📊 ダッシュボード',
      cards: '🃏 カード管理',
      shops: '🏪 ショップ管理',
      alerts: '🔔 アラート設定',
      'filter-settings': '⚙️ 抽出条件設定'
    };
    const titleEl = document.getElementById('header-title');
    if (titleEl) titleEl.textContent = titles[view] || '';

    // ビュー初期化
    switch (view) {
      case 'dashboard': Dashboard.init(); break;
      case 'cards': Cards.init(); break;
      case 'shops': Shops.init(); break;
      case 'alerts': Alerts.init(); break;
      case 'filter-settings': FilterSettings.init(); break;
    }
  },

  async updatePatrolStatus() {
    try {
      const prevStatus = this.patrolStatus;
      this.patrolStatus = await API.getPatrolStatus();
      this.renderPatrolStatus();

      // 巡回完了検知（lastRunが更新された、または 巡回中→待機中 に変化した場合）
      const lastRunChanged = prevStatus && this.patrolStatus.lastRun && prevStatus.lastRun !== this.patrolStatus.lastRun;
      const statusChangedFromRunning = prevStatus?.progress?.status === '巡回中' && this.patrolStatus?.progress?.status === '待機中';

      if (lastRunChanged || statusChangedFromRunning) {
        if (this.currentView === 'dashboard' && typeof Dashboard !== 'undefined' && Dashboard.refresh) {
          Dashboard.refresh();
        }
      }

      // 巡回中の進捗バナー更新
      if (this.currentView === 'dashboard' && typeof Dashboard !== 'undefined' && Dashboard.updateProgressDisplay) {
        Dashboard.updateProgressDisplay();
      }
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

    // ダッシュボード統計カードの直接更新
    const lastPatrolEl = document.getElementById('stat-last-patrol');
    if (lastPatrolEl) {
      lastPatrolEl.textContent = s.lastRun ? Components.formatDate(s.lastRun) : '未実行';
    }
    const nextPatrolEl = document.getElementById('stat-next-patrol');
    if (nextPatrolEl) {
      nextPatrolEl.textContent = s.isEnabled && s.nextRun ? Components.formatDate(s.nextRun) : '-';
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
