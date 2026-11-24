// 11단계 설치형 웹앱 서비스 워커.
// 오프라인 안내 화면만 저장한다. /api 요청과 자료·토큰·기기 키는 저장하거나 가로채지 않는다.
const CACHE = 'byte-back-offline-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.add(new Request(OFFLINE_URL, { cache: 'reload' }))));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  // 화면 이동(문서 요청)만 다룬다. 네트워크가 실패할 때만 오프라인 안내를 보여 준다.
  if (request.mode !== 'navigate') return;
  event.respondWith(fetch(request).catch(async () => (await caches.match(OFFLINE_URL)) ?? Response.error()));
});
