/* 和牛の刀 鉄板十五日 — アプリ（ホーム画面から開く版）のための保存係
 * 一度開いたら、ゲームのファイルを端末にしまう → 2回目からはすぐ開き、電波がなくても遊べる。
 * VERSION は tools/pwa-version.mjs が、ファイルの中身から自動で書き換える（変えると、次に開いたときに新しい版へ入れ替わる）
 */
var VERSION = 'bdcb3216f7';
var CACHE = 'wk-teppan-' + VERSION;
var FILES = ['./', 'index.html', 'style.css', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  'js/data.js', 'js/engine.js', 'js/bot.js', 'js/sprites.js', 'js/art-images.js', 'js/art-chars.js', 'js/render.js', 'js/audio.js', 'js/ui.js', 'js/main.js'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('wk-teppan-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
// しまってあるものを先に出す（なければ取りに行く）
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(function (hit) { return hit || fetch(e.request); }));
});
