/* 筋トレ：オフラインでも、電波が弱くても即座に開くためのキャッシュ
   （家計簿と同じ方針：キャッシュ優先 / stale-while-revalidate）
   - キャッシュがあれば通信を待たずに即返す
   - 同時に裏で更新を取りに行き、取れたら次回起動時に反映される
   - 裏の更新は3秒で打ち切る

   注意：GitHub Pages では家計簿と同じ配信元（neru0225.github.io）になり、
   キャッシュ置き場を共有する。古い版を消す時は「kintore-」で始まるものだけを消すこと。
   全部消すと家計簿のキャッシュまで消え、家計簿が機内モードで開けなくなる。
*/
const PREFIX = 'kintore-';
const CACHE = PREFIX + 'v0.3';
const REVALIDATE_TIMEOUT = 3000;
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(
        ASSETS.map(u =>
          fetch(new Request(u, { cache: 'reload' }))
            .then(res => res && res.ok ? c.put(u, res) : null)
            .catch(() => null)
        )
      ))
      .then(() => self.skipWaiting())
      .catch(() => {})
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      // 自分の古い版だけを消す（同じ配信元の他アプリのキャッシュには触らない）
      .then(ks => Promise.all(ks.filter(k => k.startsWith(PREFIX) && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function fetchWithTimeout(req, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(req).then(res => { clearTimeout(timer); resolve(res); },
                    err => { clearTimeout(timer); reject(err); });
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith('http')) return;
  if (new URL(req.url).origin !== self.location.origin) return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);

    const revalidate = fetchWithTimeout(req, REVALIDATE_TIMEOUT)
      .then(res => {
        if (res && res.status === 200) cache.put(req, res.clone()).catch(() => {});
        return res;
      })
      .catch(() => null);

    if (cached) return cached;
    return (await revalidate) || (await cache.match('./index.html'));
  })());
});
