const CACHE_NAME = 'pokeca-monitor-v1';
const STATIC_ASSETS = ['/', '/css/style.css', '/js/app.js', '/js/api.js', '/js/components.js', '/js/dashboard.js', '/js/cards.js', '/js/shops.js', '/js/alerts.js'];

// インストール
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

// アクティベート
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim())
  );
});

// フェッチ（ネットワーク優先、失敗時キャッシュ）
self.addEventListener('fetch', event => {
  if (event.request.url.includes('/api/')) return; // APIはキャッシュしない
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// プッシュ通知受信
self.addEventListener('push', event => {
  let data = { title: '🔔 ポケカモニター', body: '通知があります' };
  try {
    data = event.data.json();
  } catch (e) {
    data.body = event.data ? event.data.text() : data.body;
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="%236366f1"/><text x="50" y="65" font-size="50" text-anchor="middle" fill="white">⚡</text></svg>',
      badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="%236366f1"/></svg>',
      data: { url: data.url || '/' },
      requireInteraction: true,
    })
  );
});

// 通知クリック
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(list => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) return client.focus();
      }
      return clients.openWindow(url);
    })
  );
});
