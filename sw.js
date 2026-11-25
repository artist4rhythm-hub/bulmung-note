// 불멍노트 — 앱 화면 파일 보관 (모임 데이터는 Firestore가 따로 지켜요)
// 앱 파일은 언제나 새 것을 먼저 받고, 인터넷이 안 될 때만 보관본을 써요. 새 버전을 올릴 때 숫자를 바꿔 주세요.
const CACHE = 'bulmung-v1.0.0';
const SHELL = ['./', 'index.html', 'app.css', 'app.js', 'pool.js', 'firebase-config.js', 'manifest.webmanifest',
  'icons/icon-64.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/character.png', 'icons/favicon-32.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => { })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    try { const res = await fetch(e.request); if (res && res.ok) c.put(e.request, res.clone()).catch(() => { }); return res; }
    catch { return (await c.match(e.request, { ignoreSearch: true })) || (e.request.mode === 'navigate' ? await c.match('index.html') : null) || Response.error(); }
  }));
});
