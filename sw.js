// Two-Do 서비스 워커: 앱 화면만 저장해서 빠르게 열리게 해줘.
// 데이터와 사진은 저장하지 않아 (항상 Supabase에서 최신으로 받아와).
// 코드를 바꾼 뒤 배포할 땐 아래 버전 숫자를 하나 올려줘.
const CACHE = 'twodo-v2';
const SHELL = [
  './', './index.html', './styles.css', './app.js', './config.js',
  './manifest.webmanifest', './icon-192.png', './apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // 네트워크 우선 → 실패하면(오프라인) 저장된 화면
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
  );
});
