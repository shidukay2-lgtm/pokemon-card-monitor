// API通信ヘルパー
const API = {
  async _request(method, url, body = null) {
    try {
      const opts = {
        method,
        headers: { 'Content-Type': 'application/json' },
      };
      if (body) opts.body = JSON.stringify(body);
      const res = await fetch(url, opts);
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'エラーが発生しました');
      return data.data;
    } catch (error) {
      Components.showToast(error.message, 'error');
      throw error;
    }
  },

  // カード
  getCards: () => API._request('GET', '/api/cards'),
  createCard: (data) => API._request('POST', '/api/cards', data),
  updateCard: (id, data) => API._request('PUT', `/api/cards/${id}`, data),
  deleteCard: (id) => API._request('DELETE', `/api/cards/${id}`),
  lookupOfficialCard: (name, rarity) => API._request('POST', '/api/cards/lookup', { name, rarity }),
  autofillAllCards: () => API._request('POST', '/api/cards/autofill-all'),

  // ショップ
  getShops: () => API._request('GET', '/api/shops'),
  createShop: (data) => API._request('POST', '/api/shops', data),
  updateShop: (id, data) => API._request('PUT', `/api/shops/${id}`, data),
  deleteShop: (id) => API._request('DELETE', `/api/shops/${id}`),
  lookupShop: (query) => API._request('POST', '/api/shops/lookup', { query }),

  // 監視
  getPrices: () => API._request('GET', '/api/monitor/prices'),
  getCardPrices: (id) => API._request('GET', `/api/monitor/prices/${id}`),
  getPriceHistory: (cardId, shopId) => API._request('GET', `/api/monitor/history/${cardId}/${shopId}`),
  runPatrol: () => API._request('POST', '/api/monitor/patrol'),
  getPatrolStatus: () => API._request('GET', '/api/monitor/status'),
  togglePatrol: () => API._request('POST', '/api/monitor/toggle'),
  setPatrolInterval: (interval) => API._request('PUT', '/api/monitor/interval', { interval }),

  // アラート
  getAlerts: () => API._request('GET', '/api/alerts'),
  createAlert: (data) => API._request('POST', '/api/alerts', data),
  updateAlert: (id, data) => API._request('PUT', `/api/alerts/${id}`, data),
  deleteAlert: (id) => API._request('DELETE', `/api/alerts/${id}`),
  getAlertHistory: () => API._request('GET', '/api/alerts/history'),
  getVapidKey: () => API._request('GET', '/api/alerts/vapid-key'),
  subscribePush: (sub) => API._request('POST', '/api/alerts/subscribe', { subscription: sub }),
  testNotification: () => API._request('POST', '/api/alerts/test'),

  // AI
  analyzeCard: (id) => API._request('POST', `/api/ai/analyze/${id}`),
  analyzeBatch: (ids) => API._request('POST', '/api/ai/analyze-batch', { cardIds: ids }),
  getAnalysis: (id) => API._request('GET', `/api/ai/analysis/${id}`),

  // 抽出条件設定
  getFilterSettings: () => API._request('GET', '/api/filter-settings'),
  updateFilterSettings: (data) => API._request('PUT', '/api/filter-settings', data),
  testFilter: (data) => API._request('POST', '/api/filter-settings/test', data),

  // 設定
  getSettings: () => API._request('GET', '/api/settings'),
  setSetting: (key, value) => API._request('PUT', '/api/settings', { key, value }),
};
