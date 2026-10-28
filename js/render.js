/* 和牛の刀 鉄板十五日 — RENDER
 * canvas に描くだけ。state を書き換えない。
 * 光源は天井の暖色光ひとつ。鉄板だけが自分で光る（主役）。
 */
var WK = (typeof WK !== 'undefined') ? WK : {};

(function (WK) {
  'use strict';
  var D = WK.DATA, E = WK.Engine;
  var R = WK.Render = {};

  var C = {
    bg: '#0c0e13', wall: '#141720', wallTop: '#1b1f2b', trim: '#b08d4a',
    hall: '#5e412d', hall2: '#563b29', seat: '#7d2a2e', seatTop: '#9a3a3d',
    kit: '#30343a', kit2: '#2c3036', grout: '#24282d',
    teppan: '#262a2f', teppanHi: '#4a5058', steel: '#6a717a', steelDark: '#434950', wood: '#9a6a43', woodDark: '#6b462c',
    glow: '255,138,61', gold: '#c9a45c', cream: '#f3ede4', muted: '#b9b2a7', ink: '#11131a',
    rare: '#d0505c', medium: '#b77b62', well: '#7a5440', burnt: '#2b201b',
    good: '#7cc48a', warn: '#e9b44c', bad: '#ef6461', noren: '#1e2a4a'
  };
  R.C = C;
  // 店の上に描く文字の大きさ：スマホ（v.phone）は小さい画面で読めるよう、最小を2px・比率を2割上げる（本人指定 2026-10-28「携帯だと文字が小さい」）
  function fz(v, k, min) { return v.phone ? Math.max(min + 2, Math.round(v.T * k * 1.2)) : Math.max(min, Math.round(v.T * k)); }
  var FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", system-ui, sans-serif';
  var MINCHO = '"Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif';

  R.create = function (canvas) {
    return { canvas: canvas, ctx: canvas.getContext('2d'), T: 40, ox: 0, oy: 0, dpr: 1, w: 0, h: 0,
      parts: [], floats: [], shake: 0, shakeT: 0, flash: 0, punch: {}, reduced: false, time: 0 };
  };

  // 全体が入る大きさで描く。スマホ縦のように小さくなりすぎるときは、料理人を追うカメラにする
  R.resize = function (v, cssW, cssH) {
    v.dpr = Math.min(v.lite ? 1.5 : 2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);   // 軽量モードは細かさを1.5倍まで（描く量が約4割減る）
    v.w = cssW; v.h = cssH;
    v.canvas.width = Math.round(cssW * v.dpr); v.canvas.height = Math.round(cssH * v.dpr);
    v.canvas.style.width = cssW + 'px'; v.canvas.style.height = cssH + 'px';
    // 上の壁は2段見せる。スマホは1段にして、そのぶん店を大きく（高さいっぱい・左右の余白に操作と情報を置く）
    var wall = R.pixel ? (v.phone ? 1 : 2) : 0;
    var rowsH = E.MH + wall;
    var fitH = cssH / (rowsH + (v.phone ? 0.1 : 0.2));
    var T = Math.floor(Math.min(cssW / E.MW, fitH));
    v.cam = !v.phone && T < 34 && fitH > T * 1.3;
    if (v.cam) T = Math.floor(Math.min(fitH, 42));
    if (R.pixel && !v.phone) {
      // 32px の絵がくっきり見えるように、16px 刻みにそろえる（小さい画面とスマホはそのまま＝少しでも大きく）
      if (v.cam) T = fitH >= 48 ? 48 : (fitH >= 32 ? 32 : Math.floor(fitH));
      else if (T >= 32) T = Math.floor(T / 16) * 16;
    }
    // スマホは左右の余白に操作と情報を置くので、余白が足りなければ店を少し小さくする（片側 v.gutMin）
    if (v.phone && v.gutMin) T = Math.min(T, Math.floor((cssW - 2 * v.gutMin) / E.MW));
    v.T = Math.max(16, T);
    v.ox = Math.floor((cssW - v.T * E.MW) / 2);
    v.oy = Math.floor((cssH - v.T * rowsH) / 2) + wall * v.T;
    v.camX = null;
  };
  R.follow = function (v, x, dt) {
    if (!v.cam) return;
    var want = v.w / 2 - x * v.T;
    want = Math.min(0, Math.max(v.w - E.MW * v.T, want));
    v.camX = v.camX == null ? want : v.camX + (want - v.camX) * Math.min(1, dt * 6);
    v.ox = Math.round(v.camX);
  };
  // 画面の外で急ぐことが起きている鉄板・入口を、端に知らせる
  function edgeAlerts(v, s) {
    var T = v.T, items = [];
    s.counters.forEach(function (c) {
      if (!c.unlocked) return;
      var urgent = null;
      if (E.groupsAt(s, c).some(function (g) { return g.state === 'waiting' && g.patience / g.pMax < 0.5; })) urgent = 'お待ち';
      c.slots.forEach(function (it) { if (it && it.k === 'steak') { var cl = E.classify(it); if (cl === 'burnt') urgent = '焦げ'; else if (cl === 'well' && !urgent) urgent = '焼けすぎ注意'; } });
      if (!urgent && c.needsScrape && s.queue.length) urgent = '片付け';
      if (!urgent) return;
      items.push({ x: c.x0 + c.seats / 2, text: '鉄板' + c.id + '：' + urgent });
    });
    if (s.queue.length) items.push({ x: 0.5, text: '入口 ' + s.queue.length + '組' });
    var ly = 0, ry = 0;
    items.forEach(function (it) {
      var sx = px(v, it.x);
      if (sx > T * 0.6 && sx < v.w - T * 0.6) return;
      var left = sx <= T * 0.6;
      var y = py(v, 1.0) + (left ? ly++ : ry++) * T * 0.62;
      chip(v, left ? T * 1.6 : v.w - T * 1.6, y, (left ? '← ' : '') + it.text + (left ? '' : ' →'), 'rgba(17,19,26,.9)', '#ffd59a', R.C.warn);
    });
  }

  // ---------- 小物 ----------
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function mix(c1, c2, t) {
    var a = parseInt(c1.slice(1), 16), b = parseInt(c2.slice(1), 16);
    var r = Math.round(lerp(a >> 16, b >> 16, t)), g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, t)), bl = Math.round(lerp(a & 255, b & 255, t));
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }
  function px(v, x) { return v.ox + x * v.T; }
  function py(v, y) { return v.oy + y * v.T; }

  function steakColor(it) {
    var cl = E.classify(it);
    if (cl === 'burnt') return C.burnt;
    var th = E.thresholds(it.m);
    var t = it.t;
    if (t < th.rare) return mix('#c23b4a', '#c4484f', t / th.rare);
    if (t < th.medium) return mix('#c4484f', '#a8604f', (t - th.rare) / (th.medium - th.rare));
    if (t < th.well) return mix('#a8604f', '#7d5240', (t - th.medium) / (th.well - th.medium));
    return mix('#7d5240', '#4a3326', Math.min(1, (t - th.well) / (th.burn - th.well)));
  }
  R.steakColor = steakColor;

  // ---------- 食材・皿 ----------
  function drawItem(v, it, x, y, s) {
    var ctx = v.ctx, T = v.T * (s || 1);
    if (!it) return;
    if (it.k === 'plates') {
      var n = Math.min(it.n, 6);
      for (var i = 0; i < n; i++) {
        var yy = y - i * T * 0.045;
        ctx.fillStyle = it.dirty ? '#b8ad9c' : '#f4efe7';
        ctx.beginPath(); ctx.ellipse(x, yy, T * 0.26, T * 0.15, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = it.dirty ? '#8a7f6e' : '#cfc6b8'; ctx.lineWidth = 1; ctx.stroke();
      }
      if (it.dirty) { ctx.fillStyle = 'rgba(120,80,40,.55)'; ctx.beginPath(); ctx.ellipse(x - T * 0.05, y - n * T * 0.045 + T * 0.02, T * 0.1, T * 0.05, 0.4, 0, Math.PI * 2); ctx.fill(); }
      if (it.n > 1) badge(v, x + T * 0.24, y - T * 0.2, String(it.n));
      return;
    }
    if (it.k === 'block') {
      ctx.fillStyle = it.m === 'emperor' ? '#b8323a' : (it.m === 'halal' ? '#b2414a' : '#c03a45');
      rr(ctx, x - T * 0.24, y - T * 0.15, T * 0.48, T * 0.3, T * 0.07); ctx.fill();
      ctx.strokeStyle = 'rgba(243,233,220,.75)'; ctx.lineWidth = Math.max(1, T * 0.025);
      for (var k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(x - T * 0.2 + k * T * 0.11, y - T * 0.12); ctx.quadraticCurveTo(x - T * 0.15 + k * T * 0.1, y, x - T * 0.19 + k * T * 0.12, y + T * 0.12); ctx.stroke(); }
      if (it.m === 'emperor') { ctx.strokeStyle = C.gold; ctx.lineWidth = 2; rr(ctx, x - T * 0.24, y - T * 0.15, T * 0.48, T * 0.3, T * 0.07); ctx.stroke(); }
      if (it.m === 'halal') tag(v, x, y + T * 0.2, 'ハラル', '#3f7d5a');
      if (D.stations['sc_' + it.m]) tag(v, x, y + T * 0.2, D.meats[it.m].abbr, D.meats[it.m].color);
      return;
    }
    if (it.k === 'steak') {
      var n2 = it.n || 1;
      for (var j = n2 - 1; j >= 0; j--) {
        var ox = j * T * 0.09, oy = -j * T * 0.06;
        ctx.fillStyle = steakColor(it);
        ctx.beginPath(); ctx.ellipse(x + ox, y + oy, T * 0.22, T * 0.14, -0.15, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(243,233,220,.55)'; ctx.lineWidth = Math.max(1, T * 0.02);
        ctx.beginPath(); ctx.ellipse(x + ox, y + oy, T * 0.16, T * 0.08, -0.15, 0.3, 2.6); ctx.stroke();
        if (it.m === 'emperor') { ctx.strokeStyle = C.gold; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(x + ox, y + oy, T * 0.22, T * 0.14, -0.15, 0, Math.PI * 2); ctx.stroke(); }
      }
      if (it.m === 'halal') tag(v, x, y + T * 0.2, 'ハラル', '#3f7d5a');
      if (n2 > 1) badge(v, x + T * 0.26, y - T * 0.16, String(n2));
      return;
    }
    if (it.k === 'rice') {
      var cl = E.classify(it);
      ctx.fillStyle = '#6b4a35'; rr(ctx, x - T * 0.2, y - T * 0.02, T * 0.4, T * 0.16, T * 0.06); ctx.fill();
      ctx.fillStyle = cl === 'burnt' ? '#3a2a20' : (cl === 'ok' ? '#e3c58f' : '#f2ede2');
      ctx.beginPath(); ctx.ellipse(x, y - T * 0.02, T * 0.2, T * 0.11, 0, 0, Math.PI * 2); ctx.fill();
      return;
    }
    if (it.k === 'dish') {
      // 皿の上に料理（下に重ねた皿の枚数をバッジで）
      var nd = it.n || 1;
      for (var q = 0; q < Math.min(nd, 4); q++) {
        ctx.fillStyle = '#f4efe7'; ctx.beginPath(); ctx.ellipse(x, y - q * T * 0.045, T * 0.27, T * 0.16, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#cfc6b8'; ctx.lineWidth = 1; ctx.stroke();
      }
      drawItem(v, it.food, x, y - Math.min(nd, 4) * T * 0.045 - T * 0.02, (s || 1) * 0.8);
      if (nd > 1) badge(v, x + T * 0.26, y - T * 0.2, String(nd));
      return;
    }
    if (it.k === 'sake') {
      ctx.fillStyle = '#e8e2d6';
      ctx.beginPath(); ctx.moveTo(x - T * 0.06, y - T * 0.26); ctx.lineTo(x + T * 0.06, y - T * 0.26); ctx.lineTo(x + T * 0.13, y + T * 0.1); ctx.lineTo(x - T * 0.13, y + T * 0.1); ctx.closePath(); ctx.fill();
      ctx.fillStyle = C.noren; ctx.fillRect(x - T * 0.1, y - T * 0.06, T * 0.2, T * 0.08);
      ctx.fillStyle = '#e8e2d6'; ctx.beginPath(); ctx.arc(x + T * 0.2, y + T * 0.06, T * 0.05, 0, Math.PI * 2); ctx.fill();
      return;
    }
  }
  R.drawItem = drawItem;

  function badge(v, x, y, text, bg) {
    var ctx = v.ctx, r = Math.max(8, v.T * 0.17);
    ctx.fillStyle = bg || C.ink; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = C.gold; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = C.cream; ctx.font = '700 ' + Math.round(r * 1.2) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 1);
  }
  function tag(v, x, y, text, bg) {
    var ctx = v.ctx, fs = fz(v, 0.22, 10);
    ctx.font = '700 ' + fs + 'px ' + FONT;
    var w = ctx.measureText(text).width + fs * 0.8;
    ctx.fillStyle = bg; rr(ctx, x - w / 2, y - fs * 0.7, w, fs * 1.4, fs * 0.7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y + 1);
  }
  // 肉の種類の札（神戸牛は札なし）。色の明るい札は黒い文字
  function meatOf(m) { var x = D.meats[m]; return (m !== 'beef' && x && x.abbr) ? x : null; }
  function inkOn(hex) { var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16); return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? C.ink : '#fff'; }
  // ドリンクの絵（札用）：絵のある範囲だけを切り出して使い回す
  var iconCache = {};
  function drinkIcon(d) {
    if (iconCache[d]) return iconCache[d];
    var cv = d === 'sake' ? sprite('sake_set') : (atlasReady(ITEMSA) ? atlasFrame(ITEMSA, d, false) : null);
    if (!cv) return null;
    var x = cv.getContext('2d'), px0 = x.getImageData(0, 0, cv.width, cv.height).data, x0 = cv.width, y0 = cv.height, x1 = -1, y1 = -1;
    for (var yy = 0; yy < cv.height; yy++) for (var xx = 0; xx < cv.width; xx++) if (px0[(yy * cv.width + xx) * 4 + 3] > 0) { x0 = Math.min(x0, xx); x1 = Math.max(x1, xx); y0 = Math.min(y0, yy); y1 = Math.max(y1, yy); }
    if (x1 < 0) return null;
    return (iconCache[d] = { cv: cv, sx: x0, sy: y0, sw: x1 - x0 + 1, sh: y1 - y0 + 1 });
  }
  function miniChip(v, x, y, text, bg, fg) {
    var ctx = v.ctx, fs = fz(v, 0.18, 9);
    ctx.font = '700 ' + fs + 'px ' + FONT;
    var w = ctx.measureText(text).width + fs * 0.6, h = fs * 1.4;
    ctx.fillStyle = bg; rr(ctx, x - w / 2, y - h / 2, w, h, 3); ctx.fill();
    ctx.strokeStyle = 'rgba(17,19,26,.7)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y + 0.5);
  }
  function chip(v, x, y, text, bg, fg, border) {
    var ctx = v.ctx, fs = fz(v, 0.22, 11);
    ctx.font = '700 ' + fs + 'px ' + FONT;
    var w = Math.max(fs * 2, ctx.measureText(text).width + fs * 0.7), h = fs * 1.45;
    ctx.fillStyle = bg; rr(ctx, x - w / 2, y - h / 2, w, h, h / 2); ctx.fill();
    if (border) { ctx.strokeStyle = border; ctx.lineWidth = 2; ctx.stroke(); }
    ctx.fillStyle = fg || '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y + 1);
    return w;
  }
  R.chip = chip;

  // ---------- 床・壁 ----------
  function drawFloor(v, s) {
    var ctx = v.ctx, T = v.T;
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, v.w, v.h);
    for (var y = 0; y < E.MH; y++) for (var x = 0; x < E.MW; x++) {
      var c = E.ch(x, y), X = px(v, x), Y = py(v, y);
      if (c === 'k') {
        ctx.fillStyle = ((x + y) % 2) ? C.kit : C.kit2; ctx.fillRect(X, Y, T, T);
        ctx.strokeStyle = C.grout; ctx.lineWidth = 1; ctx.strokeRect(X + 0.5, Y + 0.5, T - 1, T - 1);
      } else if (c === 'h' || c === 'S' || c === 'p' || c === 'D' || c === 'w') {
        ctx.fillStyle = (y % 2) ? C.hall : C.hall2; ctx.fillRect(X, Y, T, T);
        ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.moveTo(X, Y + T * 0.5); ctx.lineTo(X + T, Y + T * 0.5); ctx.stroke();
      } else if (c === '#') {
        ctx.fillStyle = C.wall; ctx.fillRect(X, Y, T, T);
      }
    }
    // 上の壁：金の線・提灯・看板
    var wy = py(v, 0);
    ctx.fillStyle = C.wallTop; ctx.fillRect(px(v, 0), wy, T * E.MW, T);
    ctx.fillStyle = C.trim; ctx.fillRect(px(v, 0), wy + T - 3, T * E.MW, 2);
    [1, 3, 5, 9, 11, 13].forEach(function (i) { lantern(v, px(v, i) + T * 0.5, wy + T * 0.5); });
    ctx.fillStyle = C.cream; ctx.font = '600 ' + Math.round(T * 0.42) + 'px ' + MINCHO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('和牛の刀', px(v, 7) + T * 0.5, wy + T * 0.52);
    // 入口の暖簾
    var dx = px(v, 0), dy = py(v, 1);
    ctx.fillStyle = C.noren; ctx.fillRect(dx + T * 0.08, dy - T * 0.05, T * 0.84, T * 0.5);
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.moveTo(dx + T * 0.5, dy); ctx.lineTo(dx + T * 0.5, dy + T * 0.45); ctx.stroke();
    ctx.fillStyle = C.cream; ctx.font = '600 ' + Math.round(T * 0.26) + 'px ' + MINCHO; ctx.fillText('刀', dx + T * 0.5, dy + T * 0.2);
    // 待合の長椅子
    ctx.fillStyle = C.woodDark; rr(ctx, px(v, 0) + T * 0.12, py(v, 2) + T * 0.1, T * 0.76, T * 1.8, T * 0.12); ctx.fill();
    // 下の壁
    ctx.fillStyle = C.trim; ctx.fillRect(px(v, 0), py(v, E.MH - 1) + 1, T * E.MW, 2);
    // 厨房の光：鉄板の前（4段目）を明るく、奥ほど暗く
    var kx = px(v, 1), ky = py(v, 4), kw = T * (E.MW - 1), kh = T * (E.MH - 5);
    var kg = ctx.createLinearGradient(0, ky, 0, ky + kh);
    kg.addColorStop(0, 'rgba(255,170,100,.10)'); kg.addColorStop(0.35, 'rgba(255,170,100,.03)'); kg.addColorStop(1, 'rgba(0,0,0,.22)');
    ctx.fillStyle = kg; ctx.fillRect(kx, ky, kw, kh);
    // 植栽（仕切り）
    [5, 10].forEach(function (x) {
      var X = px(v, x) + T / 2, Y = py(v, 2) + T * 0.55;
      ctx.fillStyle = '#3a2a1e'; rr(ctx, X - T * 0.18, Y, T * 0.36, T * 0.3, 4); ctx.fill();
      ctx.fillStyle = '#41583c'; ctx.beginPath(); ctx.arc(X, Y - T * 0.05, T * 0.26, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4d6a46'; ctx.beginPath(); ctx.arc(X - T * 0.08, Y - T * 0.12, T * 0.14, 0, Math.PI * 2); ctx.fill();
    });
  }
  function lantern(v, x, y) {
    var ctx = v.ctx, T = v.T;
    var g = ctx.createRadialGradient(x, y, 1, x, y, T * 0.9);
    g.addColorStop(0, 'rgba(255,170,90,.16)'); g.addColorStop(1, 'rgba(255,170,90,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, T * 0.9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#b8322f'; ctx.beginPath(); ctx.ellipse(x, y, T * 0.17, T * 0.24, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(x - T * 0.1, y - T * 0.27, T * 0.2, T * 0.06); ctx.fillRect(x - T * 0.1, y + T * 0.21, T * 0.2, T * 0.06);
  }

  // ---------- 鉄板カウンター ----------
  function drawCounters(v, s, time) {
    var ctx = v.ctx, T = v.T;
    s.counters.forEach(function (c) {
      var X = px(v, c.x0), Y = py(v, 3), W = T * c.seats;
      // 席
      for (var i = 0; i < c.seats; i++) {
        var sx = px(v, c.x0 + i) + T / 2, sy = py(v, 2) + T * 0.55;
        ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(sx, sy + T * 0.16, T * 0.26, T * 0.1, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = c.unlocked ? C.seat : '#3a2a2b'; ctx.beginPath(); ctx.ellipse(sx, sy, T * 0.25, T * 0.17, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = c.unlocked ? C.seatTop : '#4a3536'; ctx.beginPath(); ctx.ellipse(sx, sy - T * 0.03, T * 0.19, T * 0.11, 0, 0, Math.PI * 2); ctx.fill();
      }
      // 木の縁（お客様側）
      ctx.fillStyle = C.wood; ctx.fillRect(X, Y, W, T * 0.2);
      ctx.fillStyle = C.woodDark; ctx.fillRect(X, Y + T * 0.18, W, T * 0.04);
      // 鉄板
      var g = ctx.createLinearGradient(X, Y + T * 0.22, X, Y + T * 0.86);
      g.addColorStop(0, C.teppanHi); g.addColorStop(1, C.teppan);
      ctx.fillStyle = g; ctx.fillRect(X, Y + T * 0.22, W, T * 0.64);
      // 鉄板の照り（天井光の映り込み）と、手前の熱の縁
      if (c.unlocked) {
        var sheen = ctx.createLinearGradient(X, 0, X + W, 0);
        sheen.addColorStop(0, 'rgba(255,255,255,0)'); sheen.addColorStop(0.5, 'rgba(255,236,210,.10)'); sheen.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = sheen; ctx.fillRect(X, Y + T * 0.24, W, T * 0.12);
        var edge = ctx.createLinearGradient(0, Y + T * 0.66, 0, Y + T * 0.86);
        edge.addColorStop(0, 'rgba(' + C.glow + ',0)'); edge.addColorStop(1, 'rgba(' + C.glow + ',' + (0.16 + 0.03 * Math.sin(time * 2)) + ')');
        ctx.fillStyle = edge; ctx.fillRect(X, Y + T * 0.66, W, T * 0.2);
      }
      // 前面（料理人側）
      ctx.fillStyle = C.steelDark; ctx.fillRect(X, Y + T * 0.86, W, T * 0.14);
      ctx.fillStyle = 'rgba(' + C.glow + ',.55)'; ctx.fillRect(X, Y + T * 0.86, W, Math.max(1.5, T * 0.025));
      if (!c.unlocked) {
        ctx.fillStyle = 'rgba(12,14,19,.82)'; ctx.fillRect(X, Y - T, W, T * 2);
        ctx.fillStyle = C.muted; ctx.font = '600 ' + fz(v, 0.3, 12) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('増設予定', X + W / 2, Y - T * 0.1);
        return;
      }
      // 汚れ
      if (c.needsScrape) {
        ctx.fillStyle = 'rgba(120,85,45,.38)';
        for (var k = 0; k < c.seats * 3; k++) { var hx = X + ((k * 37) % 100) / 100 * W, hy = Y + T * 0.3 + ((k * 53) % 100) / 100 * T * 0.5; ctx.beginPath(); ctx.ellipse(hx, hy, T * 0.12, T * 0.05, k, 0, Math.PI * 2); ctx.fill(); }
        if (c.scrapeT > 0) progressBar(v, X + W / 2, Y + T * 0.55, W * 0.6, c.scrapeT / D.work.scrape, C.cream);
      }
      // 区切り線
      for (var j = 1; j < c.seats; j++) { ctx.strokeStyle = 'rgba(255,255,255,.04)'; ctx.beginPath(); ctx.moveTo(X + j * T, Y + T * 0.24); ctx.lineTo(X + j * T, Y + T * 0.84); ctx.stroke(); }
      // 焼いているもの
      c.slots.forEach(function (it, i) {
        var cx = px(v, c.x0 + i) + T / 2, cy = Y + T * 0.56;
        if (it && (it.k === 'steak' || it.k === 'rice')) {
          var cl = E.classify(it);
          var heat = cl === 'burnt' ? 0.08 : 0.22 + 0.05 * Math.sin(time * 9 + i);
          var hg = ctx.createRadialGradient(cx, cy, 2, cx, cy, T * 0.55);
          hg.addColorStop(0, 'rgba(' + C.glow + ',' + heat + ')'); hg.addColorStop(1, 'rgba(' + C.glow + ',0)');
          ctx.fillStyle = hg; ctx.fillRect(cx - T * 0.5, Y + T * 0.22, T, T * 0.64);
          drawItem(v, it, cx, cy, 0.9);
          if (it.k === 'steak') donenessRing(v, s, c, i, it, cx, cy);
          else riceRing(v, it, cx, cy);
        } else if (it) drawItem(v, it, cx, cy, 0.9);
      });
      // 食べている皿・汚れた皿（木の縁の上）
      for (var q = 0; q < c.seats; q++) {
        var lx = px(v, c.x0 + q) + T / 2, ly = Y + T * 0.08;
        var g2 = E.groupAtSeat(s, c, q), gu = g2 && g2.guests[q - (g2.off || 0)];
        if (gu && gu.dishes) drawMiniPlate(v, lx, ly, gu, g2.state === 'eating');
        if (c.dirty[q] > 0) drawItem(v, { k: 'plates', n: c.dirty[q], dirty: true }, lx, ly + T * 0.02, 0.62);
      }
    });
  }
  function drawMiniPlate(v, x, y, gu, eating) {
    var ctx = v.ctx, T = v.T;
    ctx.fillStyle = '#f4efe7'; ctx.beginPath(); ctx.ellipse(x, y, T * 0.18, T * 0.09, 0, 0, Math.PI * 2); ctx.fill();
    if (gu.got.main) { ctx.fillStyle = gu.servedDone === 'rare' ? '#c4484f' : (gu.servedDone === 'well' ? '#7d5240' : '#a8604f'); ctx.beginPath(); ctx.ellipse(x - T * 0.03, y - 1, T * 0.1, T * 0.05, 0, 0, Math.PI * 2); ctx.fill(); }
    if (gu.got.rice) { ctx.fillStyle = '#e3c58f'; ctx.beginPath(); ctx.arc(x + T * 0.09, y - 1, T * 0.05, 0, Math.PI * 2); ctx.fill(); }
  }
  function progressBar(v, x, y, w, t, color) {
    var ctx = v.ctx, h = Math.max(5, v.T * 0.12);
    ctx.fillStyle = 'rgba(0,0,0,.6)'; rr(ctx, x - w / 2, y - h / 2, w, h, h / 2); ctx.fill();
    ctx.fillStyle = color; rr(ctx, x - w / 2, y - h / 2, Math.max(h, w * Math.min(1, t)), h, h / 2); ctx.fill();
  }
  R.progressBar = progressBar;

  // 焼き加減リング：レア・ミディアム・ウェルダンの幅を色で、いまの位置を白い印で
  function donenessRing(v, s, c, i, it, cx, cy) {
    var ctx = v.ctx, T = v.T, th = E.thresholds(it.m), r = T * 0.36;
    var full = th.burn * 1.08, a0 = -Math.PI / 2;
    var seg = function (from, to, col, wdt) {
      ctx.strokeStyle = col; ctx.lineWidth = wdt;
      ctx.beginPath(); ctx.arc(cx, cy, r, a0 + from / full * Math.PI * 2, a0 + to / full * Math.PI * 2); ctx.stroke();
    };
    var lw = Math.max(3, T * 0.08);
    seg(0, th.rare, 'rgba(255,255,255,.18)', lw);
    // 待っているお客様の焼き加減だけ太く
    var want = {};
    E.groupsAt(s, c).forEach(function (g) { if (g.state === 'waiting') g.guests.forEach(function (gu) { if (gu.order.main === it.m && !gu.got.main) want[gu.order.done] = true; }); });
    seg(th.rare, th.medium, C.rare, want.rare ? lw * 1.7 : lw * 0.7);
    seg(th.medium, th.well, C.medium, want.medium ? lw * 1.7 : lw * 0.7);
    seg(th.well, th.burn, C.well, want.well ? lw * 1.7 : lw * 0.7);
    seg(th.burn, full, 'rgba(0,0,0,.6)', lw);
    var a = a0 + Math.min(it.t, full) / full * Math.PI * 2;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, Math.max(3, lw * 0.8), 0, Math.PI * 2); ctx.fill();
    var cl = E.classify(it);
    var label = D.doneness.short[cl];
    var col = cl === 'raw' ? 'rgba(17,19,26,.85)' : (cl === 'burnt' ? C.bad : C[cl]);
    var pulse = (cl !== 'raw' && cl !== 'burnt' && want[cl]) ? 1 : 0;
    var mt = meatOf(it.m);
    chip(v, cx, cy + T * 0.44, label, col, '#fff', pulse ? '#fff' : (mt ? mt.color : null));
    if (mt) miniChip(v, cx, cy - T * 0.5, mt.abbr, mt.color, inkOn(mt.color));
  }
  function riceRing(v, it, cx, cy) {
    var cl = E.classify(it);
    var col = cl === 'burnt' ? C.bad : (cl === 'ok' ? C.good : 'rgba(17,19,26,.85)');
    chip(v, cx, cy + v.T * 0.44, cl === 'ok' ? 'ご飯OK' : (cl === 'burnt' ? '焦げ' : '炒め中'), col, cl === 'ok' ? C.ink : '#fff');
  }

  // ---------- 設備 ----------
  var ICON = {
    showcase: '#c03a45', eshowcase: '#c9a45c', hshowcase: '#3f7d5a', rice: '#e3c58f', sake: '#e8e2d6',
    board: '#c9a77c', bench: '#8b8f96', rack: '#f4efe7', sink: '#7fa7c9', washer: '#9fb7c9', trash: '#4b4f56'
  };
  function drawStation(v, s, st, hx, hy, lifted) {
    var ctx = v.ctx, T = v.T;
    var X = hx != null ? hx : px(v, st.x), Y = hy != null ? hy : py(v, st.y);
    var H = T * 0.26, pad = T * 0.06;
    // 影
    ctx.fillStyle = 'rgba(0,0,0,.35)'; rr(ctx, X + pad, Y + pad + T * 0.06, T - pad * 2, T - pad * 2, T * 0.1); ctx.fill();
    // 前面
    ctx.fillStyle = st.type === 'trash' ? '#2f3237' : '#3b4048';
    rr(ctx, X + pad, Y + T - pad - H - T * 0.05, T - pad * 2, H + T * 0.05, T * 0.08); ctx.fill();
    // 上面
    var top = st.type === 'board' ? '#6a5a48' : (st.type === 'trash' ? '#3a3d43' : '#59606a');
    ctx.fillStyle = top; rr(ctx, X + pad, Y + pad - H, T - pad * 2, T - pad * 2, T * 0.1); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.fillRect(X + pad + 3, Y + pad - H + 1, T - pad * 2 - 6, 1);
    var cx = X + T / 2, cy = Y + T / 2 - H;
    switch (st.type) {
      case 'showcase': case 'eshowcase': case 'hshowcase': case 'sc_sirloin': case 'sc_bekkaku': case 'sc_wasaro': case 'sc_chateau': case 'sc_filet': case 'sc_kotei_loin': case 'sc_kotei_brian':
        ctx.fillStyle = '#20262c'; rr(ctx, cx - T * 0.34, cy - T * 0.3, T * 0.68, T * 0.56, T * 0.06); ctx.fill();
        ctx.fillStyle = 'rgba(150,200,230,.12)'; rr(ctx, cx - T * 0.32, cy - T * 0.28, T * 0.64, T * 0.24, T * 0.05); ctx.fill();
        drawItem(v, { k: 'block', m: D.stations[st.type].provides }, cx, cy + T * 0.04, 0.85);
        break;
      case 'rice':
        ctx.fillStyle = '#e9e4da'; ctx.beginPath(); ctx.ellipse(cx, cy, T * 0.3, T * 0.24, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#bdb6aa'; ctx.beginPath(); ctx.ellipse(cx, cy - T * 0.04, T * 0.2, T * 0.12, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = C.primary || '#ff8a3d'; ctx.fillRect(cx + T * 0.12, cy + T * 0.1, T * 0.08, T * 0.05);
        break;
      case 'sake':
        ctx.fillStyle = C.woodDark; rr(ctx, cx - T * 0.34, cy - T * 0.3, T * 0.68, T * 0.56, T * 0.06); ctx.fill();
        drawItem(v, { k: 'sake' }, cx - T * 0.12, cy + T * 0.02, 0.8); drawItem(v, { k: 'sake' }, cx + T * 0.14, cy + T * 0.02, 0.8);
        break;
      case 'bench':
        ctx.fillStyle = '#6c737c'; rr(ctx, cx - T * 0.34, cy - T * 0.3, T * 0.68, T * 0.56, T * 0.05); ctx.fill();
        break;
      case 'rack':
        ctx.fillStyle = '#4a4036'; rr(ctx, cx - T * 0.34, cy - T * 0.3, T * 0.68, T * 0.56, T * 0.06); ctx.fill();
        if (st.plates > 0) drawItem(v, { k: 'plates', n: st.plates, dirty: false }, cx, cy + T * 0.08, 0.95);
        else { ctx.fillStyle = C.bad; ctx.font = '700 ' + fz(v, 0.24, 11) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('皿なし', cx, cy); }
        break;
      case 'sink': case 'washer':
        ctx.fillStyle = st.type === 'sink' ? '#9aa6b1' : '#8796a5'; rr(ctx, cx - T * 0.34, cy - T * 0.3, T * 0.68, T * 0.56, T * 0.08); ctx.fill();
        ctx.fillStyle = st.type === 'sink' ? '#4d7ea8' : '#33475c'; rr(ctx, cx - T * 0.26, cy - T * 0.22, T * 0.52, T * 0.4, T * 0.07); ctx.fill();
        if (st.type === 'washer') { ctx.fillStyle = 'rgba(160,210,255,.35)'; ctx.beginPath(); ctx.arc(cx, cy - T * 0.02, T * 0.14, 0, Math.PI * 2); ctx.fill(); }
        if (st.dirty > 0) { drawItem(v, { k: 'plates', n: 1, dirty: true }, cx - T * 0.13, cy + T * 0.02, 0.62); badge(v, cx - T * 0.3, cy - T * 0.26, String(st.dirty), '#7a5a3a'); }
        if (st.clean > 0) { drawItem(v, { k: 'plates', n: 1, dirty: false }, cx + T * 0.15, cy + T * 0.06, 0.62); badge(v, cx + T * 0.3, cy - T * 0.26, String(st.clean)); }
        var need = st.type === 'sink' ? D.work.wash : D.washerSec;
        if (st.washT > 0 && st.dirty > 0) progressBar(v, cx, cy - T * 0.4, T * 0.7, st.washT / need, '#9fd0ff');
        break;
      case 'trash':
        ctx.fillStyle = '#25282c'; ctx.beginPath(); ctx.arc(cx, cy, T * 0.24, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#5a6068'; ctx.lineWidth = 2; ctx.stroke();
        break;
    }
    if (st.item && st.type !== 'rack') drawItem(v, st.item, cx, cy + T * 0.02, 0.9);
    if (st.isNew && s.phase === 'prep') tag(v, cx, Y - H - T * 0.05, 'NEW', '#8a5a1c');
    if (lifted) { ctx.strokeStyle = C.gold; ctx.lineWidth = 2; rr(ctx, X + pad, Y + pad - H, T - pad * 2, T - pad * 2, T * 0.1); ctx.stroke(); }
  }
  // 設備の名前は最後にまとめて描く（手前の設備に隠れないように）
  function drawLabels(v, s) {
    var ctx = v.ctx, T = v.T;
    if (T < 40) return;
    var fs = Math.round(Math.max(12, Math.min(14, T * 0.19)));
    ctx.font = '600 ' + fs + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    s.stations.forEach(function (st) {
      var x = px(v, st.x) + T / 2, y = py(v, st.y) + T * 0.8;
      var t = D.stations[st.type].label;
      var w = ctx.measureText(t).width + 8;
      ctx.fillStyle = 'rgba(17,19,26,.72)'; rr(ctx, x - w / 2, y - fs * 0.62, w, fs * 1.24, 4); ctx.fill();
      var pm = D.stations[st.type].provides, mt = pm && meatOf(pm);
      if (mt) { ctx.fillStyle = mt.color; ctx.fillRect(x - w / 2, y + fs * 0.5, w, 2); }
      ctx.fillStyle = 'rgba(243,237,228,.9)'; ctx.fillText(t, x, y + 0.5);
    });
  }
  var _t = 0, _v = null; function time0() { return _t; }
  function firstOf(s, type) { for (var i = 0; i < s.stations.length; i++) if (s.stations[i].type === type) return s.stations[i]; return null; }

  function staffFigure(v, x, y, coat, time) {
    var ctx = v.ctx, T = v.T * 0.75, b = Math.sin(time * 6) * T * 0.02;
    ctx.fillStyle = coat; rr(ctx, x - T * 0.16, y - T * 0.1 + b, T * 0.32, T * 0.32, T * 0.12); ctx.fill();
    ctx.fillStyle = '#e8c2a0'; ctx.beginPath(); ctx.arc(x, y - T * 0.2 + b, T * 0.13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2a2420'; ctx.beginPath(); ctx.arc(x, y - T * 0.25 + b, T * 0.12, Math.PI, 0); ctx.fill();
  }

  // ---------- 人物 ----------
  var LOOKS = [
    { coat: '#33456b', hair: '#1d1b1a' }, { coat: '#5b6b3c', hair: '#5a3b24' }, { coat: '#7a3b45', hair: '#d8b56a' },
    { coat: '#6b6f78', hair: '#2a2420' }, { coat: '#8a6a2c', hair: '#9a9a9a' }, { coat: '#2f6466', hair: '#3a2617' }
  ];
  function person(v, x, y, look, opt) {
    var ctx = v.ctx, T = v.T;
    opt = opt || {};
    var bob = opt.bob || 0, sc = opt.scale || 1;
    var s2 = T * sc;
    ctx.fillStyle = 'rgba(0,0,0,.32)'; ctx.beginPath(); ctx.ellipse(x, y, s2 * 0.24, s2 * 0.09, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = look.coat; rr(ctx, x - s2 * 0.2, y - s2 * 0.52 + bob, s2 * 0.4, s2 * 0.46, s2 * 0.16); ctx.fill();
    if (opt.apron) { ctx.fillStyle = '#1b2233'; rr(ctx, x - s2 * 0.15, y - s2 * 0.34 + bob, s2 * 0.3, s2 * 0.28, s2 * 0.06); ctx.fill(); }
    ctx.fillStyle = '#e8c2a0'; ctx.beginPath(); ctx.arc(x, y - s2 * 0.66 + bob, s2 * 0.17, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = look.hair; ctx.beginPath();
    if (opt.back) ctx.arc(x, y - s2 * 0.67 + bob, s2 * 0.172, 0, Math.PI * 2);
    else ctx.arc(x, y - s2 * 0.71 + bob, s2 * 0.16, Math.PI * 1.05, Math.PI * 1.95);
    ctx.fill();
    if (opt.band) { ctx.fillStyle = '#f3ede4'; ctx.fillRect(x - s2 * 0.17, y - s2 * 0.76 + bob, s2 * 0.34, s2 * 0.06); ctx.fillStyle = '#b8323a'; ctx.fillRect(x - s2 * 0.04, y - s2 * 0.76 + bob, s2 * 0.08, s2 * 0.06); }
    if (!opt.back) {
      ctx.fillStyle = '#2a2420';
      var ex = (opt.face || 0) * s2 * 0.05;
      ctx.beginPath(); ctx.arc(x - s2 * 0.06 + ex, y - s2 * 0.64 + bob, s2 * 0.022, 0, Math.PI * 2); ctx.arc(x + s2 * 0.06 + ex, y - s2 * 0.64 + bob, s2 * 0.022, 0, Math.PI * 2); ctx.fill();
      if (opt.mood === 'happy') { ctx.strokeStyle = '#7a3b2a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x + ex, y - s2 * 0.6 + bob, s2 * 0.05, 0.2, Math.PI - 0.2); ctx.stroke(); }
      if (opt.mood === 'angry') { ctx.strokeStyle = '#2a2420'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - s2 * 0.1 + ex, y - s2 * 0.71 + bob); ctx.lineTo(x - s2 * 0.03 + ex, y - s2 * 0.69 + bob); ctx.moveTo(x + s2 * 0.1 + ex, y - s2 * 0.71 + bob); ctx.lineTo(x + s2 * 0.03 + ex, y - s2 * 0.69 + bob); ctx.stroke(); }
    }
  }
  R.person = person;

  function drawGroups(v, s, time) {
    var ctx = v.ctx, T = v.T;
    // 待合（入口）
    var qi = 0;
    s.queue.forEach(function (id) {
      var g = E.groupById(s, id); if (!g) return;
      if (qi < 2) {
        var spot = D.waitSpots[qi];
        var bx = px(v, spot.x) + T / 2, by = py(v, spot.y) + T * 0.82;
        for (var k = 0; k < g.size; k++) person(v, bx + (k - (g.size - 1) / 2) * T * 0.16, by - k * 1, LOOKS[g.guests[k].look], { scale: 0.62, bob: Math.sin(time * 3 + k) * 1 });
        ring(v, bx, by - T * 0.82, g.patience / g.pMax, g.size);
      }
      qi++;
    });
    if (s.queue.length > 2) chip(v, px(v, D.mirrorX(0)) + T / 2, py(v, 3) + T * 0.95, '+' + (s.queue.length - 2) + '組・' + s.queue.slice(2).reduce(function (n, id) { var g = E.groupById(s, id); return n + (g ? g.size : 0); }, 0) + '名', C.ink, C.cream, C.gold);
    var walkers = s.groups.filter(function (g) { return g.state === 'walkIn' || g.state === 'leaving'; });
    var seated = s.groups.filter(function (g) { return g.state !== 'queue' && g.state !== 'walkIn' && g.state !== 'leaving'; });
    walkers.concat(seated).forEach(function (g) {
      var c = g.counter ? E.counterById(s, g.counter) : null;
      if (g.state === 'walkIn' || g.state === 'leaving') {
        for (var k = 0; k < g.size; k++) person(v, px(v, g.px - g.size * 0.18 + k * 0.36), py(v, 1.85) - k, LOOKS[g.guests[k].look],
          { bob: Math.abs(Math.sin(time * 10 + k)) * -T * 0.04, mood: g.angry ? 'angry' : (g.state === 'leaving' && !g.lost ? 'happy' : null), face: g.state === 'leaving' ? -1 : 1 });
        if (g.angry) { ctx.fillStyle = C.bad; ctx.font = '800 ' + Math.round(T * 0.4) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.fillText('！', px(v, g.px), py(v, 0.95)); }
        return;
      }
      if (!c) return;
      var X0 = c.x0 + (g.off || 0);
      g.guests.forEach(function (gu, i) {
        var sx = px(v, X0 + i) + T / 2, sy = py(v, 2) + T * 0.72;
        var happy = g.state === 'eating';
        var low = g.state === 'waiting' && g.patience / g.pMax < D.guests.lowRatio;
        var bobv = g.state === 'eating' ? Math.sin(time * 5 + i) * T * 0.02 : Math.sin(time * 2 + i * 1.3) * T * 0.012;
        var p = v.punch['seat' + (X0 + i)];
        var sc = 1;
        if (p) { var u = (time - p) / 0.22; if (u < 1) sc = 1 + 0.15 * Math.sin(u * Math.PI); }
        person(v, sx, sy, LOOKS[gu.look], { bob: bobv, mood: happy ? 'happy' : (low ? 'angry' : null), scale: sc });
        if (g.state === 'waiting') orderBubble(v, s, gu, sx, py(v, 1.62));
      });
      var gx = px(v, X0) + (g.size * T) / 2;
      if (g.state === 'waiting' || g.state === 'ordering') patienceBar(v, gx, py(v, 0.98), g.size * T * 0.9, g.state === 'ordering' ? 1 : g.patience / g.pMax);
      if (g.state === 'ordering') chip(v, gx, py(v, 1.62), '注文を考えています…', 'rgba(17,19,26,.85)', C.cream);
      if (g.anniv) tag(v, px(v, X0) + T * 0.2, py(v, 2.25), '記念日', '#8a2f55');
      if (g.mc) { ctx.fillStyle = C.gold; ctx.font = '700 ' + fz(v, 0.26, 11) + 'px ' + FONT; ctx.textAlign = 'right'; ctx.fillText('✦ 思い出', px(v, X0 + g.size) - 2, py(v, 2.2)); }
      if (g.mcT > 0 && !g.mc) progressBar(v, gx, py(v, 2.1), g.size * T * 0.7, g.mcT / E.mcNeed(g), C.gold);
    });
  }
  function orderBubble(v, s, gu, x, y) {
    var parts = bubbleParts(gu);
    if (!parts.length) { chip(v, x, y, '✓', 'rgba(124,196,138,.9)', C.ink); return; }
    var fs = fz(v, 0.22, 11);
    parts.forEach(function (p, i) {
      var yy = y - i * fs * 1.55;
      if (!p.row) { chip(v, x, yy, p.t, p.bg, p.fg, p.border); return; }
      // 小さい札を横に並べる（前菜の残り・ドリンク・ご飯）
      var ctx = v.ctx, mfs = fz(v, 0.18, 9); ctx.font = '700 ' + mfs + 'px ' + FONT;
      var ih = mfs * 1.4;
      var ws = p.row.map(function (r) { return r.icon ? ih * 0.9 : ctx.measureText(r.t).width + mfs * 0.6; }), gap = 2, tw = ws.reduce(function (a, b) { return a + b; }, 0) + gap * (ws.length - 1), xx = x - tw / 2;
      p.row.forEach(function (r, k) {
        var cx2 = xx + ws[k] / 2, cy2 = yy + fs * 0.1;
        if (r.icon) {   // ドリンクはグラスの絵（文字だと隣の札に重なる）
          ctx.fillStyle = r.bg; rr(ctx, cx2 - ws[k] / 2, cy2 - ih / 2, ws[k], ih, 3); ctx.fill();
          ctx.strokeStyle = 'rgba(17,19,26,.7)'; ctx.lineWidth = 1; ctx.stroke();
          var I = r.icon, sc = Math.min((ih - 3) / I.sh, (ws[k] - 3) / I.sw);
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(I.cv, I.sx, I.sy, I.sw, I.sh, Math.round(cx2 - I.sw * sc / 2), Math.round(cy2 - I.sh * sc / 2), I.sw * sc, I.sh * sc);
          ctx.imageSmoothingEnabled = true;
        } else miniChip(v, cx2, cy2, r.t, r.bg, r.fg);
        xx += ws[k] + gap;
      });
    });
  }
  // 注文の札（下から：焼き加減 → 肉の種類 → ご飯 → 酒）
  function bubbleParts(gu) {
    var parts = [];
    if (!gu.got.main) {
      var mt = meatOf(gu.order.main);
      parts.push({ t: D.doneness.short[gu.order.done], bg: C[gu.order.done], fg: '#fff', border: mt ? mt.color : null });
      if (mt) parts.push({ t: mt.abbr, bg: mt.color, fg: inkOn(mt.color) });
    }
    var row = [], na = (gu.order.apps || 0) - (gu.got.apps || 0);
    if (na > 0) row.push({ t: '前' + na, bg: '#5e9e4a', fg: '#fff' });
    if (gu.order.drink && !gu.got.drink) { var dk = D.drinks[gu.order.drink], ic = drinkIcon(gu.order.drink); row.push(ic ? { icon: ic, bg: '#f3ede4' } : { t: dk.abbr, bg: dk.color, fg: inkOn(dk.color) }); }
    if (gu.order.rice && !gu.got.rice) row.push({ t: 'ご飯', bg: '#e3c58f', fg: C.ink });
    if (row.length) parts.push({ row: row });
    return parts;
  }
  function patienceBar(v, x, y, w, r) {
    var ctx = v.ctx, h = Math.max(6, v.T * 0.14);
    var col = r > 0.6 ? C.good : (r > D.guests.lowRatio ? C.warn : C.bad);
    ctx.fillStyle = 'rgba(0,0,0,.65)'; rr(ctx, x - w / 2 - 1, y - h / 2 - 1, w + 2, h + 2, h); ctx.fill();
    ctx.fillStyle = col; rr(ctx, x - w / 2, y - h / 2, Math.max(h, w * Math.max(0, r)), h, h); ctx.fill();
    if (r < D.guests.lowRatio) { ctx.fillStyle = C.bad; ctx.font = '800 ' + Math.round(h * 2) + 'px ' + FONT; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText('！', x - w / 2 - 4, y); }
  }
  function ring(v, x, y, r, size) {
    var ctx = v.ctx, rad = v.T * 0.2;
    ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = r > 0.6 ? C.good : (r > 0.35 ? C.warn : C.bad);
    ctx.beginPath(); ctx.arc(x, y, rad, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, r)); ctx.stroke();
    ctx.fillStyle = C.cream; ctx.font = '700 ' + Math.round(rad) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(size, x, y + 1);
  }

  function drawMcStaff(v, s, time) {
    if (!s.mcStaff) return;
    var m = s.mcStaff, g = m.target ? E.groupById(s, m.target) : null;
    var x = px(v, m.px), y = py(v, 1.85);
    person(v, x, y, { coat: '#1b2233', hair: '#2a2420' }, { bob: Math.sin(time * 6) * 1.5, face: 1 });
    if (g && m.t > 0) progressBar(v, x, y - v.T * 1.0, v.T * 0.8, m.t / D.staff.mc.sec, C.gold);
  }

  function drawPlayer(v, s, p, time, target, workable) {
    var ctx = v.ctx, T = v.T;
    var x = px(v, p.x), y = py(v, p.y) + T * 0.28;
    var bob = p.moving ? Math.abs(Math.sin(p.bob)) * -T * 0.05 : Math.sin(time * 2.2) * T * 0.012;
    person(v, x, y, { coat: '#f1ece3', hair: '#1d1b1a' }, { bob: bob, band: true, apron: true, back: p.fy < 0, face: p.fx });
    var h = p.hold;
    if (h) {
      var hx = x + p.fx * T * 0.22, hy = y - T * 0.5 + bob + (p.fy < 0 ? -T * 0.1 : 0);
      if (h.k === 'station') {
        var X = hx - T / 2, Y = hy - T * 0.6;
        drawStation(v, s, h.st, X, Y, true);
      } else drawItem(v, h, hx, hy, 0.9);
    }
    var pu = v.punch.player;
    if (pu && time - pu < 0.18) { ctx.strokeStyle = 'rgba(255,255,255,' + (0.5 * (1 - (time - pu) / 0.18)) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y - T * 0.4, T * 0.5 * (1 + (time - pu) * 2), 0, Math.PI * 2); ctx.stroke(); }
  }

  function drawTarget(v, s, target, workable, time, hint) {
    var ctx = v.ctx, T = v.T;
    if (hint && s.phase === 'service') {
      var hx = px(v, hint.x), hy = py(v, hint.y);
      var a = 0.35 + 0.25 * Math.sin(time * 5);
      ctx.strokeStyle = 'rgba(201,164,92,' + a + ')'; ctx.setLineDash([5, 4]); ctx.lineWidth = 2;
      rr(ctx, hx + 2, hy + 2 - (hint.y >= 4 ? T * 0.26 : 0), T - 4, T - 4, T * 0.14); ctx.stroke(); ctx.setLineDash([]);
    }
    if (!target) return;
    var X = px(v, target.x), Y = py(v, target.y);
    var lift = (target.k === 'station') ? T * 0.26 : 0;
    var ok = target.k !== 'blocked';
    ctx.strokeStyle = ok ? 'rgba(243,237,228,.9)' : 'rgba(239,100,97,.9)'; ctx.lineWidth = 2.5;
    rr(ctx, X + 2, Y + 2 - lift, T - 4, T - 4, T * 0.14); ctx.stroke();
    if (workable && workable.need > 0) {
      var t = workable.prog / workable.need;
      ctx.strokeStyle = C.gold; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(X + T / 2, Y + T / 2 - lift, T * 0.46, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * t); ctx.stroke();
    }
  }

  // ---------- 演出 ----------
  R.burst = function (v, x, y, n, colors, opt) {
    if (v.reduced) n = Math.min(n, 3);
    else if (v.lite) n = Math.ceil(n / 2);
    opt = opt || {};
    for (var i = 0; i < n; i++) {
      var a = opt.up ? (-Math.PI / 2 + (Math.random() - 0.5) * 1.6) : Math.random() * Math.PI * 2;
      var sp = (opt.speed || 3) * (0.5 + Math.random());
      v.parts.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: (opt.life || 0.55) * (0.7 + Math.random() * 0.6),
        col: colors[i % colors.length], r: (opt.size || 0.07) * (0.6 + Math.random() * 0.8), drag: opt.drag || 3.5, g: opt.g || 0, smoke: !!opt.smoke });
    }
  };
  // 料理人の反応（CHARACTER：成功・失敗への反応）。happy＝両手を上げる／trouble＝頭を抱える
  R.react = function (v, kind) { v.react = { kind: kind, t: v.time, dur: kind === 'happy' ? 0.9 : 1.1 }; };
  // お客様の反応（席の x を中心に r マスの範囲）
  R.guestReact = function (v, x, kind, r) { (v.greact = (v.greact || []).filter(function (e) { return v.time - e.t < 2; })).push({ x: x, r: r || 0.5, kind: kind, t: v.time }); };
  R.float = function (v, x, y, text, color, big) {
    v.floats.push({ x: x, y: y, text: text, col: color || C.cream, life: 0, max: big ? 1.4 : 1.0, big: !!big });
    if (v.floats.length > 12) v.floats.shift();
  };
  R.shake = function (v, amp) { if (v.reduced) return; v.shake = Math.max(v.shake, amp); };

  function drawParticles(v, dt) {
    var ctx = v.ctx, T = v.T;
    for (var i = v.parts.length - 1; i >= 0; i--) {
      var p = v.parts[i];
      p.life += dt;
      if (p.life >= p.max) { v.parts.splice(i, 1); continue; }
      var k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vy = p.vy * k + p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      var u = p.life / p.max;
      var r = p.r * T * (p.smoke ? (0.6 + u * 1.4) : (1 - u * 0.7));
      ctx.globalAlpha = p.smoke ? 0.28 * (1 - u) : (1 - u * u);
      ctx.fillStyle = p.col;
      ctx.beginPath(); ctx.arc(px(v, p.x), py(v, p.y), Math.max(0.5, r), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (var j = v.floats.length - 1; j >= 0; j--) {
      var f = v.floats[j];
      f.life += dt;
      if (f.life >= f.max) { v.floats.splice(j, 1); continue; }
      var t = f.life / f.max;
      var rise = (1 - Math.pow(1 - t, 3)) * 0.8;
      var fs = Math.max(13, Math.round(T * (f.big ? 0.42 : 0.32)));
      ctx.globalAlpha = t < 0.75 ? 1 : (1 - (t - 0.75) / 0.25);
      ctx.font = '800 ' + fs + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(12,14,19,.85)';
      ctx.strokeText(f.text, px(v, f.x), py(v, f.y - rise));
      ctx.fillStyle = f.col; ctx.fillText(f.text, px(v, f.x), py(v, f.y - rise));
    }
    ctx.globalAlpha = 1;
  }

  // 焼いている鉄板から湯気・煙
  function ambient(v, s, dt) {
    if (v.reduced) return;
    s.counters.forEach(function (c) {
      c.slots.forEach(function (it, i) {
        if (!it || (it.k !== 'steak' && it.k !== 'rice')) return;
        var cl = E.classify(it);
        var rate = cl === 'burnt' ? 10 : (cl === 'well' ? 5 : 3);
        if (Math.random() < rate * dt) {
          v.parts.push({ x: c.x0 + i + 0.5 + (Math.random() - 0.5) * 0.3, y: 3.5, vx: (Math.random() - 0.5) * 0.2, vy: -0.9 - Math.random() * 0.5, life: 0, max: 1.1,
            col: cl === 'burnt' ? '#3a3533' : '#d9d4cc', r: 0.08, drag: 0.8, g: 0, smoke: true });
        }
      });
    });
  }

  // ---------- 1フレーム ----------
  R.draw = function (v, s, dt, extra) {
    if (R.pixel) return R.drawPixel(v, s, dt, extra);
    extra = extra || {};
    v.time += dt; _t = v.time;
    var ctx = v.ctx;
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    var sx = 0, sy = 0;
    if (v.shake > 0.1) { sx = (Math.random() - 0.5) * v.shake * 2; sy = (Math.random() - 0.5) * v.shake; v.shake *= Math.exp(-14 * dt); } else v.shake = 0;
    ctx.save(); ctx.translate(sx, sy);
    drawFloor(v, s);
    // 天井の暖色光（光源はひとつ）
    var lg = ctx.createRadialGradient(v.ox + v.T * 7.5, v.oy + v.T * 2.6, v.T, v.ox + v.T * 7.5, v.oy + v.T * 2.6, v.T * 9);
    lg.addColorStop(0, 'rgba(255,190,120,.07)'); lg.addColorStop(1, 'rgba(255,190,120,0)');
    ctx.fillStyle = lg; ctx.fillRect(0, 0, v.w, v.h);
    if (s.phase === 'prep') prepGrid(v, s);
    drawCounters(v, s, v.time);
    drawMcStaff(v, s, v.time); // 注文の札より奥に描く
    drawGroups(v, s, v.time);
    // 奥から手前へ（y順）
    var list = s.stations.map(function (st) { return { y: st.y + 0.5, st: st }; });
    s.players.forEach(function (p) { list.push({ y: p.y, p: p }); });
    list.sort(function (a, b) { return a.y - b.y; });
    drawTarget(v, s, extra.target, extra.workable, v.time, extra.hint);
    list.forEach(function (o) { if (o.st) drawStation(v, s, o.st); else drawPlayer(v, s, o.p, v.time, extra.target, extra.workable); });
    drawLabels(v, s);
    ambient(v, s, dt);
    drawParticles(v, dt);
    ctx.restore();
    if (v.cam) edgeAlerts(v, s);
    if (v.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + Math.min(0.35, v.flash) + ')'; ctx.fillRect(0, 0, v.w, v.h); v.flash -= dt * 2.2; }
  };

  function prepGrid(v, s) {
    var ctx = v.ctx, T = v.T;
    ctx.fillStyle = 'rgba(201,164,92,.16)';
    for (var y = 4; y < E.MH; y++) for (var x = 0; x < E.MW; x++) {
      if (!E.isFloor(x, y) || E.stationAt(s, x, y)) continue;
      ctx.beginPath(); ctx.arc(px(v, x) + T / 2, py(v, y) + T / 2, Math.max(1.5, T * 0.04), 0, Math.PI * 2); ctx.fill();
    }
  }

  // =====================================================================
  // ドット絵の描画（WK.SPRITES があるとき）
  // 店の絵は 1マス32px の別のキャンバスに描き、画面へ拡大して写す。
  // 文字・注文の札・リング・ゲージ・粒は、読みやすいように画面のキャンバスへなめらかに描く。
  // =====================================================================
  var SP = WK.SPRITES || null;
  R.pixel = !!SP;
  var NT = 32;                         // 配置の基準（1マス32）
  var PS = (SP && SP.scale) || 1;      // 絵の細かさ（v0.5 は2：1マス64ドット。描く先のキャンバスを PS 倍にする）
  var EXT = 2;                         // 上の壁は地図の0段目の上にさらに2段（合わせて3段）
  // 参考画像から作った背景（壁画・鉄板）。画像の読み込みが終わってから使う
  var ART = WK.ART_IMAGES || null, ARTIMG = {};
  if (ART && typeof Image !== 'undefined') {
    ARTIMG.mural = new Image(); ARTIMG.mural.src = ART.mural;
    ARTIMG.teppan = ART.teppan.map(function (u) { var i = new Image(); i.src = u; return i; });
  }
  function artReady() { return ARTIMG.mural && ARTIMG.mural.complete && ARTIMG.teppan.every(function (i) { return i.complete; }) && (!PROPA || atlasReady(PROPA)); }
  // 料理人（自分とスタッフ）：本人の素材シートから作ったコマ（VectorCraft の書き出し）。読み込み前はドット絵の図で描く
  // お客様：本人のお客様シート（15人・26コマ）。誰がどのポーズを持つかは GUEST.cast
  function loadAtlas(A) { if (!A || typeof Image === 'undefined') return null; var im = new Image(); im.src = A.atlas; return { A: A, img: im, cache: {} }; }
  var CHARS = WK.ART_CHARS || {}, COOKA = loadAtlas(CHARS.cook), GUESTA = loadAtlas(CHARS.guest), EMOTEA = loadAtlas(CHARS.emote), PROPA = loadAtlas(CHARS.prop), TEPPANA = loadAtlas(CHARS.teppan), MEATA = loadAtlas(CHARS.meattag), ITEMSA = loadAtlas(CHARS.items);
  var CHAIR_GY = 33;   // 椅子の脚の下端（行2の上から）。空いた椅子も座りコマ（椅子ごと）も同じ床の線に置く（カウンターに1ドット隠れる）
  var COOK = COOKA && COOKA.A, GUEST = GUESTA && GUESTA.A;
  var GUEST_IDS = GUEST ? Object.keys(GUEST.cast) : [];
  function atlasReady(T) { return T && T.img.complete && T.img.width > 0; }
  function cookReady() { return atlasReady(COOKA); }
  function guestReady() { return atlasReady(GUESTA); }
  function atlasFrame(T, name, mirror) {
    var key = name + (mirror ? '|m' : '');
    if (T.cache[key]) return T.cache[key];
    var A = T.A, r = A.frames[name]; if (!r) return null;
    var c = document.createElement('canvas'); c.width = A.fw; c.height = A.fh;
    var x = c.getContext('2d');
    if (mirror) { x.translate(A.fw, 0); x.scale(-1, 1); }
    x.drawImage(T.img, r[0], r[1], A.fw, A.fh, 0, 0, A.fw, A.fh);
    return (T.cache[key] = c);
  }
  // 人を「体の真ん中 cx・足の裏 gy」（32基準）で描く。横向きのコマは左向きに描かれているので、右を向くときは反転する
  // clip を渡すと、コマの上から clip ドットまでだけ描く（座ったお客様の足を隠す）
  function blitAtlas(b, T, name, cx, gy, mirror, clip) {
    var c = atlasFrame(T, name, mirror); if (!c) return;
    var A = T.A, ax = mirror ? A.fw - A.ax : A.ax, h = clip || A.fh;
    var x = Math.round((cx - ax / PS) * PS) / PS, y = Math.round((gy - A.foot / PS) * PS) / PS;
    b.ctx.drawImage(c, 0, 0, A.fw, h, x, y, A.fw / PS, h / PS);
  }
  function blitCook(b, name, cx, gy, mirror) { blitAtlas(b, COOKA, name, cx, gy, mirror); }
  // 大きさを変えて描く（フランベの炎）。足元（下の真ん中）を基準に
  function blitAtlasScaled(b, T, name, cx, gy, k) {
    var c = atlasFrame(T, name, false); if (!c) return;
    var A = T.A, w = A.fw / PS * k, h = A.fh / PS * k;
    b.ctx.drawImage(c, 0, 0, A.fw, A.fh, Math.round(cx - w / 2), Math.round(gy - h), w, h);
  }
  // 思い出づくりのフランベ：思い出づくりをしている組（自分・MC担当）と、その進み具合（0〜1）
  function flambeGroups(s) {
    var out = {};
    if (s.phase !== 'service') return out;
    s.players.forEach(function (p) { if (p.workOn !== 'mc') return; var w = E.workable(s, p); if (w && w.g) out[w.g.id] = Math.min(1, w.prog / w.need); });
    return out;
  }
  R.flambeGroups = flambeGroups;
  // 足元の影（接地）。自分には金の輪を足して、スタッフと見分ける
  function footShadow(b, cx, gy, mine) {
    var x = b.ctx;
    x.fillStyle = 'rgba(58,36,32,0.26)'; x.beginPath(); x.ellipse(cx, gy, 9, 2.6, 0, 0, Math.PI * 2); x.fill();
    if (mine) { x.strokeStyle = 'rgba(230,180,80,0.95)'; x.lineWidth = 0.75; x.beginPath(); x.ellipse(cx, gy, 11, 3.6, 0, 0, Math.PI * 2); x.stroke(); }
  }
  var spCache = {};
  function sprite(name, swap, mirror) {
    var key = name + '|' + (swap ? JSON.stringify(swap) : '') + (mirror ? '|m' : '');
    if (spCache[key]) return spCache[key];
    var rows = SP.sprites[name];
    if (!rows) return null;
    var h = rows.length, w = rows[0].length;
    var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    var cx = cv.getContext('2d');
    for (var y = 0; y < h; y++) {
      var row = rows[y];
      for (var x = 0; x < w; x++) {
        var ch = row[x];
        if (ch === '.') continue;
        cx.fillStyle = (swap && swap[ch]) || SP.palette[ch] || '#ff00ff';
        cx.fillRect(mirror ? w - 1 - x : x, y, 1, 1);
      }
    }
    spCache[key] = cv;
    return cv;
  }
  // x, y は32基準。絵は PS 倍の細かさなので、32基準の大きさ（width / PS）で描く＝描く先では1ドット＝1ドット
  function blit(b, name, x, y, swap, mirror, scale) {
    var cv = sprite(name, swap, mirror);
    if (!cv) return null;
    var k = (scale || 1) / PS;
    b.ctx.drawImage(cv, Math.round(x), Math.round(y), cv.width * k, cv.height * k);
    return cv;
  }
  // 1マス32px の座標（行 r の上端。壁の上の1段ぶん下げる）
  function nx(x) { return x * NT; }
  function ny(y) { return EXT * NT + y * NT; }

  function pxBuffer(v) {
    var W = E.MW * NT, H = (E.MH + EXT) * NT;
    if (!v.buf || v.buf.width !== W * PS || v.buf.height !== H * PS) {
      v.buf = document.createElement('canvas'); v.buf.width = W * PS; v.buf.height = H * PS;
      v.bufCtx = v.buf.getContext('2d'); v.bufCtx.imageSmoothingEnabled = false;
      v.bg = null;
    }
    v.bufCtx.setTransform(PS, 0, 0, PS, 0, 0);
    return { ctx: v.bufCtx, w: W, h: H };
  }

  // 背景（壁・床・暖簾・柱・植物・待合・椅子）：一度描いて使い回す
  function pxBackground(v) {
    if (v.bg) return v.bg;
    var W = E.MW * NT, H = (E.MH + EXT) * NT;
    var cv = document.createElement('canvas'); cv.width = W * PS; cv.height = H * PS;
    var b = { ctx: cv.getContext('2d') };
    b.ctx.imageSmoothingEnabled = false;
    b.ctx.setTransform(PS, 0, 0, PS, 0, 0);
    var x, y;
    // 上の壁（3段）：参考画像から作った壁画（天井・フード・スポットライト・金箔・瑞雲・ロゴ・富士）。右端は赤い花の壁
    var ready = artReady();
    if (ready) {
      var ms = ARTIMG.mural.width / (E.MW * NT);                                         // 壁画の細かさ
      b.ctx.drawImage(ARTIMG.mural, 0, 0, E.MW * NT, 3 * NT);
      var rx0 = D.mirror ? 0 : 12;                                                         // 赤い花の壁は入口の反対の端（3マス）
      for (x = rx0; x < rx0 + 3; x++) for (y = 0; y < 3; y++) blit(b, 'wall_red', nx(x), y * NT);
      b.ctx.drawImage(ARTIMG.mural, rx0 * NT * ms, 0, 3 * NT * ms, 13 * ms, rx0 * NT, 0, 3 * NT, 13);   // 天井とフードは赤い壁の上にも
    } else {
      for (x = 0; x < E.MW; x++) for (y = 0; y < 3; y++) blit(b, D.mirrorX(x) >= 11 ? 'wall_red' : 'wall_gold', nx(x), y * NT);
      blit(b, 'logo', nx(D.mirrorX(1)), 24); blit(b, 'fuji', nx(D.mirrorX(4)) + 4, ny(1) - 46);
    }
    b.ctx.fillStyle = SP.palette.g; b.ctx.fillRect(0, ny(1) - 2, W, 1);
    b.ctx.fillStyle = SP.palette.K; b.ctx.fillRect(0, ny(1) - 1, W, 1);
    for (y = 1; y < E.MH; y++) for (x = 0; x < E.MW; x++) {
      var c = E.ch(x, y);
      if (c === '#') blit(b, 'wall_brick', nx(x), ny(y));
      else if (c === 'k') blit(b, 'floor_kitchen', nx(x), ny(y));
      else if (c === '|') blit(b, 'wall_brick', nx(x), ny(y));
      else if (c === 'T') { /* 鉄板は毎フレーム描く */ }
      else blit(b, 'floor_hall', nx(x), ny(y));
    }
    blit(b, 'noren', nx(D.door.x), ny(D.door.y) - 2);
    blit(b, 'wait_bench', nx(D.door.x), ny(2) + 4);
    for (x = 0; x < E.MW; x++) if (E.ch(x, 2) === 'p') blit(b, 'plant', nx(x), ny(2) - 6);
    // 椅子：本人の椅子の絵（細い脚・背もたれ）。座面の上の端が、座ったお客様の腰の高さ（行2の上から18）にくる
    // 素材が読めたら椅子は背景に描かない（pxCounters で、空いている席だけ描く。座っている席は座りコマに椅子ごと描かれている）
    if (!atlasReady(PROPA)) for (x = 0; x < E.MW; x++) if (E.ch(x, 2) === 'S') blit(b, 'chair', nx(x), ny(2) + 6);
    if (ready) v.bg = cv;   // 画像の読み込み前は使い回さない
    return cv;
  }
  R.resetBackground = function (v) { v.bg = null; };

  var MAN_LOOKS, WOMAN_LOOKS;
  function guestLook(look) {
    MAN_LOOKS = MAN_LOOKS || SP.looks.man; WOMAN_LOOKS = WOMAN_LOOKS || SP.looks.woman;
    var woman = look % 2 === 1, k = Math.floor(look / 2) % 3;
    return { name: woman ? 'guest_woman' : 'guest_man', swap: (woman ? WOMAN_LOOKS : MAN_LOOKS)[k] };
  }

  // お客様が誰か：同じ組には「似た見た目の人」（眼鏡どうし・ひげどうし）を並べない。見た目の種類を順に回し、種類の中で人を選ぶ
  var GUEST_TYPES = [['beard_white', 'beard_gray', 'beard_red', 'beard_plaid'], ['brunette_cam', 'pattern_a', 'brunette_cap', 'pattern_b'],
    ['glasses_gray', 'suit_navy', 'glasses_polo', 'suit_gray', 'hoodie_black'], ['blonde_white', 'blonde_yellow'], ['cap_kid']];
  function guestWho(g, k) {
    var h = (g.id * 2654435761) >>> 0, types = GUEST_TYPES.filter(function (ty) { return ty.every(function (w) { return GUEST.cast[w]; }); });
    if (!types.length) return GUEST_IDS[(h + k * 7) % GUEST_IDS.length];
    var ty = types[(h + k) % types.length];
    return ty[((h >>> 8) + k * 3) % ty.length];
  }
  function guestHas(who, pose) { return GUEST.cast[who].poses.indexOf(pose) >= 0; }
  function guestReactAt(x) {
    var list = (_v && _v.greact) || [], best = null;
    list.forEach(function (e) { var dur = e.kind === 'happy' ? 1.0 : 1.2; if (_t - e.t < dur && Math.abs(x - e.x) <= e.r) best = e; });
    return best;
  }
  // ポーズ：反応（喜ぶ・困る）→ 注文で手を挙げる → 待ちくたびれる → 食べる → ふつう
  function guestPose(who, x, state, ratio, seed) {
    var re = guestReactAt(x), t = _t;
    if (re && re.kind === 'happy') return { f: guestHas(who, 'cheer') ? 'cheer' : (guestHas(who, 'wave') ? 'wave' : 'front'), dy: -Math.round(Math.abs(Math.sin((t - re.t) * 12)) * 4) / 2 };
    if (re) return { f: guestHas(who, 'trouble') ? 'trouble' : 'front', dx: Math.sin(t * 40) > 0 ? 0.5 : -0.5 };
    if (state === 'ordering' && guestHas(who, 'point') && (t + seed) % 1.6 < 0.8) return { f: 'point' };
    if ((state === 'waiting' || state === 'queue') && ratio < 0.35) {
      if (guestHas(who, 'trouble')) return { f: 'trouble' };
      return { f: 'front', dx: (t + seed) % 2 < 0.35 ? (Math.sin(t * 36) > 0 ? 0.5 : -0.5) : 0 };   // そわそわ
    }
    if (state === 'eating') return { f: 'front', dy: Math.sin(t * 5 + seed) > 0.3 ? 0.5 : 0 };
    return { f: 'front' };
  }
  // 頭の上の印：喜ぶ＝ハートが浮く／困る＝怒りマークが点滅／待ちくたびれ（困るコマがない人）＝汗
  function guestEmote(b, who, x, state, ratio, cx, gy, seed, troubleFrame) {   // troubleFrame：困るコマを出しているなら汗は出さない
    if (!atlasReady(EMOTEA)) return;
    var re = guestReactAt(x), head = gy - 26, ex = cx + 7;
    if (re && re.kind === 'happy') { blitAtlas(b, EMOTEA, 'heart', ex, head - 1 - Math.min(1, _t - re.t) * 6, false); return; }
    if (re) { if ((_t - re.t) % 0.4 < 0.3) blitAtlas(b, EMOTEA, 'anger', ex, head, false); return; }
    if ((state === 'waiting' || state === 'queue') && ratio < 0.35 && !troubleFrame && (_t + seed) % 2 < 1.1)
      blitAtlas(b, EMOTEA, 'sweat', ex, head + 2 + ((_t + seed) % 2) * 2, false);
  }
  // 座っているとき（座りコマがある人）：反応 → 注文で手を挙げる → 待ちくたびれ → 食べる → ときどき横を見る → ふつう
  function seatedPose(who, x, state, ratio, seed) {
    var re = guestReactAt(x), t = _t, has = function (p) { return guestHas(who, p); };
    if (re && re.kind === 'happy') return { f: has('seatHappy') ? 'seatHappy' : (has('seatWave') ? 'seatWave' : 'seated'), dy: -Math.round(Math.abs(Math.sin((t - re.t) * 12)) * 4) / 2 };
    if (re) return { f: has('seatTrouble') ? 'seatTrouble' : 'seated', dx: Math.sin(t * 40) > 0 ? 0.5 : -0.5 };
    if (state === 'ordering' && has('seatWave') && (t + seed) % 1.6 < 0.8) return { f: 'seatWave' };
    if (state === 'waiting' && ratio < 0.35) {
      if (has('seatTrouble')) return { f: 'seatTrouble' };
      return { f: 'seated', dx: (t + seed) % 2 < 0.35 ? (Math.sin(t * 36) > 0 ? 0.5 : -0.5) : 0 };
    }
    if (state === 'eating') return { f: 'seated', dy: Math.sin(t * 5 + seed) > 0.3 ? 0.5 : 0 };
    if (has('seatLook') && (t + seed * 3) % 6 < 1.2) return { f: 'seatLook' };
    return { f: 'seated' };
  }
  function blitGuest(b, who, pose, cx, gy, mirror, clip) { blitAtlas(b, GUESTA, who + '.' + pose.f, cx + (pose.dx || 0), gy + (pose.dy || 0), mirror, clip); }

  // 食材・皿（中心の座標）
  function pxItem(b, it, cx, cy, pending) {
    if (!it) return;
    var n, i, cv;
    if (it.k === 'plates') {
      n = Math.min(it.n, 4);
      for (i = 0; i < n; i++) blit(b, it.dirty ? 'plate_dirty' : 'plate_white', cx - 10, cy - 4 - i * 2);
      if (it.n > 1) pending.push({ badge: String(it.n), x: cx + 10, y: cy - 8 - n * 2, bg: it.dirty ? '#7a5a3a' : null });
      return;
    }
    var cut = D.stations['sc_' + it.m] && atlasReady(MEATA);
    if (it.k === 'steak') {
      var cl = E.classify(it), st = cl === 'raw' ? 'raw' : cl;
      n = Math.min(it.n || 1, 3);
      for (i = n - 1; i >= 0; i--) blit(b, 'steak_' + st, cx - 10 + i * 3, cy - 6 - i * 2, SP.cook[st]);
      if (it.m === 'emperor') { b.ctx.fillStyle = SP.palette.G; b.ctx.fillRect(cx - 9, cy + 5, 18, 1); }
      if (it.m === 'halal') { b.ctx.fillStyle = SP.palette.z; b.ctx.fillRect(cx + 6, cy - 6, 3, 3); }
      if (cut) blitAtlas(b, MEATA, 'flag_' + it.m, cx + 11, cy + 1, false);   // 部位の旗（つまようじを肉の右に刺す）
      if ((it.n || 1) > 1) pending.push({ badge: String(it.n), x: cx + 12, y: cy - 8 });
      return;
    }
    if (it.k === 'rice') {
      var rc = E.classify(it), rn = Math.min(it.n || 1, 3);
      for (i = rn - 1; i >= 0; i--) blit(b, 'rice_' + (rc === 'ok' ? 'ok' : rc === 'burnt' ? 'burnt' : 'raw'), cx - 8 + i * 4, cy - 6 - i * 3);
      if ((it.n || 1) > 1) pending.push({ badge: String(it.n), x: cx + 12, y: cy - 10 });
      return;
    }
    if (it.k === 'drink') {
      // 種類が混ざっていれば、それぞれの絵を並べる（水とビールを一緒に）
      var dl = E.drinkList(it);
      n = Math.min(dl.length, 3);
      for (i = n - 1; i >= 0; i--) {
        if (dl[i] === 'sake') blit(b, 'sake_set', cx - 7 + i * 4, cy - 10 - i);
        else if (atlasReady(ITEMSA)) blitAtlas(b, ITEMSA, dl[i], cx - 3 + i * 5, cy + 5 - i, false);
      }
      if (dl.length > 1) pending.push({ badge: String(dl.length), x: cx + 12, y: cy - 10 });
      return;
    }
    if (it.k === 'apps') {
      n = Math.min(it.n || 1, 3);
      for (i = n - 1; i >= 0; i--) if (atlasReady(ITEMSA)) blitAtlas(b, ITEMSA, 'app', cx + i * 2, cy + 5 - i * 3, false);
      if ((it.n || 1) > 1) pending.push({ badge: String(it.n), x: cx + 12, y: cy - 10 });
      return;
    }
    if (it.k === 'dish') {
      blit(b, 'plate_white', cx - 10, cy - 4);
      pxItem(b, it.food, cx, cy - 3, pending);
      if ((it.n || 1) > 1) pending.push({ badge: String(it.n), x: cx + 12, y: cy - 10 });
      return;
    }
  }

  function pxStation(b, s, st, x, y, pending, lifted) {
    var def = D.stations[st.type], onBench = { water: 'pitcher', beer: 'beertap', wine: 'bottles' }[st.type];
    blit(b, def.part ? 'showcase' : (onBench ? 'bench' : st.type), x, y);
    if (onBench && atlasReady(ITEMSA)) blitAtlas(b, ITEMSA, onBench, x + 16, y + 21, false);
    if (def.part && atlasReady(MEATA)) blitAtlas(b, MEATA, 'card_' + def.provides, x + 16, y + 29, false);   // 部位の値札（ショーケースの前面。下の名前の札にかからない）
    var cx = x + 16, cy = y + 14;
    if (st.type === 'sink' || st.type === 'washer') {
      if (st.dirty > 0) { blit(b, 'plate_dirty', x + 2, y + 10); pending.push({ badge: String(st.dirty), x: x + 6, y: y + 6, bg: '#7a5a3a' }); }
      if (st.clean > 0) { blit(b, 'plate_white', x + 12, y + 14); pending.push({ badge: String(st.clean), x: x + 26, y: y + 6 }); }
    } else if (st.type === 'rack') {
      pending.push(st.plates > 0 ? { badge: String(st.plates), x: x + 26, y: y + 6 } : { text: '皿なし', x: x + 16, y: y + 14 });
    } else if (st.item) pxItem(b, st.item, cx, cy, pending);
    if ((st.type === 'sink' || st.type === 'washer') && st.washT > 0 && st.dirty > 0)
      pending.push({ bar: st.washT / (st.type === 'sink' ? D.work.wash : D.washerSec), x: cx, y: y - 4, color: '#9fd0ff' });
    if (st.type === 'board' && st.appT > 0 && st.item && st.item.k === 'plates')
      pending.push({ bar: st.appT / (D.work.app + D.work.appPer * ((st.item.n || 1) - 1)), x: cx, y: y - 4, color: '#9fdc7e' });
    if (st.isNew && s.phase === 'prep') pending.push({ tag: _v && _v.phone ? '新' : 'NEW', x: cx, y: y - 2 });   // スマホは1文字（並ぶと重なった）
    if (lifted) { b.ctx.strokeStyle = C.gold; b.ctx.lineWidth = 1; b.ctx.strokeRect(x + 0.5, y + 0.5, 31, 39); }
  }

  function pxCounters(b, s, pending) {
    var fl = flambeGroups(s);
    if (atlasReady(PROPA)) {
      var taken = {};
      s.counters.forEach(function (c) {
        E.groupsAt(s, c).forEach(function (g) { if (g.state !== 'walkIn' && g.state !== 'queue' && g.state !== 'leaving') for (var q = 0; q < g.size; q++) taken[c.x0 + (g.off || 0) + q] = true; });
      });
      for (var cxs = 0; cxs < E.MW; cxs++) if (E.ch(cxs, 2) === 'S' && !taken[cxs]) blitAtlas(b, PROPA, 'chair', nx(cxs) + 16, ny(2) + CHAIR_GY, false);
    }
    s.counters.forEach(function (c) {
      // お客様（椅子の上）→ 鉄板（大理石の縁が手前）。相席なら組ごとに、組の先頭の席（off）から
      E.groupsAt(s, c).forEach(function (g) {
      if (g.state !== 'walkIn' && g.state !== 'queue' && g.state !== 'leaving') {
        var o = g.off || 0;
        g.guests.forEach(function (gu, j) {
          var i = o + j;
          if (guestReady()) {
            var who = guestWho(g, j), x = c.x0 + i + 0.5, ratio = g.patience / (g.pMax || 1), cx = nx(c.x0 + i) + 16;
            if (guestHas(who, 'seated')) {   // 座りコマ（椅子ごと）。椅子の脚の下端を、空いた椅子と同じ位置に
              blitGuest(b, who, seatedPose(who, x, g.state, ratio, i * 0.7), cx, ny(2) + CHAIR_GY, false);
              guestEmote(b, who, x, g.state, ratio, cx, ny(2) + CHAIR_GY, i * 0.7, guestHas(who, 'seatTrouble'));
              return;
            }
            // 座りコマがない人：立ち姿の腰から上だけ（椅子の座面が見える）
            if (atlasReady(PROPA)) blitAtlas(b, PROPA, 'chair', cx, ny(2) + CHAIR_GY, false);
            blitGuest(b, who, guestPose(who, x, g.state, ratio, i * 0.7), cx, ny(2) + SEAT_GY, false, SEAT_CLIP);
            guestEmote(b, who, x, g.state, ratio, cx, ny(2) + SEAT_GY, i * 0.7, guestHas(who, 'trouble'));
            return;
          }
          var L = guestLook(gu.look);
          var bob = g.state === 'eating' ? Math.round(Math.sin(_t * 5 + i)) : 0;
          blit(b, L.name, nx(c.x0 + i), ny(2) - 16 + bob, L.swap);
        });
      }
      });
      for (var i = 0; i < c.seats; i++) {
        var X = nx(c.x0 + i), Y = ny(3);
        if (atlasReady(TEPPANA)) { var tf = TEPPANA.A.frames['t' + ((c.x0 + i) % 4)]; b.ctx.drawImage(TEPPANA.img, tf[0], tf[1], TEPPANA.A.fw, TEPPANA.A.fh, X, Y, NT, NT); }   // 銀色の鉄板（4マスで照りがつながる）
        else if (ARTIMG.teppan && ARTIMG.teppan[0].complete) b.ctx.drawImage(ARTIMG.teppan[(c.x0 + i) % 4], X, Y, NT, NT); else blit(b, 'teppan', X, Y);
        if (c.needsScrape) {
          b.ctx.fillStyle = SP.palette.L;
          for (var k = 0; k < 6; k++) b.ctx.fillRect(X + 3 + ((k * 13 + i * 7) % 26), Y + 12 + ((k * 5) % 10), 3, 1);
        }
        var it = c.slots[i];
        if (it) pxItem(b, it, X + 16, Y + 18, pending);
        var g = E.groupAtSeat(s, c, i), gu = g && g.guests[i - (g.off || 0)];
        if (gu && gu.dishes) blit(b, 'plate', X + 2, Y - 1);
        if (gu && gu.got && gu.got.drink && g.state !== 'leaving') {
          if (gu.order.drink === 'sake') blit(b, 'sake_set', X + 19, Y - 6); else if (atlasReady(ITEMSA)) blitAtlas(b, ITEMSA, gu.order.drink, X + 25, Y + 7, false);
        }
        if (c.dirty[i] > 0) pxItem(b, { k: 'plates', n: c.dirty[i], dirty: true }, X + 16, Y + 3, pending);
      }
      // フランベ：その組の席の鉄板から炎が上がる（進むほど大きく。席ごとに揺れをずらす）
      E.groupsAt(s, c).forEach(function (g) {
      if (fl[g.id] != null && atlasReady(ITEMSA)) {
        var pr = fl[g.id], sk = { early: 0.45, mid: 0.75, last: 1 }[E.mcStage(g)];   // 肉が鉄板にない前半は小さい火、最後の肉は大きく
        for (var q = 0; q < g.size; q++) {
          var fX = nx(c.x0 + (g.off || 0) + q) + 16, fY = ny(3) + 22, f = Math.floor(_t * 14 + q * 1.7) % 3;
          b.ctx.save(); b.ctx.globalCompositeOperation = 'lighter'; b.ctx.globalAlpha = 0.35;
          blitAtlasScaled(b, ITEMSA, 'flame' + ((f + 1) % 3), fX, fY + 1, (1.0 + pr * 1.4) * sk);   // ほのかな光
          b.ctx.restore();
          blitAtlasScaled(b, ITEMSA, 'flame' + f, fX + Math.sin(_t * 9 + q) * 0.6, fY, (0.6 + pr * 0.9) * sk);
        }
      }
      });
    });
  }

  var walkLast = {}, walkDir = {};
  var SEAT_GY = 24, SEAT_CLIP = 50;   // 座ったお客様：足の裏の位置（行2の上から）と、描く高さ（コマの上から50ドット＝腰まで。頭が大きい絵なので腰は下の方）
  function pxWalkers(b, s) {
    // 入口で待つ組（2組まで）
    s.queue.slice(0, 2).forEach(function (id, qi) {
      var g = E.groupById(s, id); if (!g) return;
      var spot = D.waitSpots[qi];
      if (guestReady()) {
        var who = guestWho(g, 0), cx = nx(spot.x) + 16, gy = ny(spot.y) + 30;
        footShadow(b, cx, gy, false);
        var qp = guestPose(who, -9, 'queue', g.patience / (g.pMax || 1), qi);
        if (!guestHas(who, qp.f)) qp = { f: guestHas(who, 'front') ? 'front' : 'walk' };   // 立った正面がない人は横向きで待つ
        blitGuest(b, who, qp, cx, gy, false);
        guestEmote(b, who, -9, 'queue', g.patience / (g.pMax || 1), cx, gy, qi, guestHas(who, 'trouble'));
        return;
      }
      var L = guestLook(g.guests[0].look);
      blit(b, L.name, nx(spot.x), ny(spot.y) - 6, L.swap);
    });
    s.groups.forEach(function (g) {
      if (g.state !== 'walkIn' && g.state !== 'leaving') return;
      var dir = (walkLast[g.id] === undefined ? 0 : g.px - walkLast[g.id]) || walkDir[g.id] || (g.state === 'leaving' ? -1 : 1);
      walkLast[g.id] = g.px; walkDir[g.id] = dir;
      if (guestReady()) {
        for (var q = g.size - 1; q >= 0; q--) {
          var who = guestWho(g, q), cx = g.px * NT + (q - (g.size - 1) / 2) * 12, gy = ny(1) + 30;
          var face = GUEST.cast[who].walkFacing, step = Math.floor(_t * 6 + q) % 2;
          footShadow(b, cx, gy, false);
          if (face && guestHas(who, 'walk')) blitGuest(b, who, { f: step ? 'walk' : 'front', dy: 0 }, cx, gy, step ? (dir > 0) !== (face === 'right') : false);
          else blitGuest(b, who, { f: 'front', dy: -Math.round(Math.abs(Math.sin(_t * 10 + q)) * 3) / 2 }, cx, gy, false);
        }
        return;
      }
      for (var k = g.size - 1; k >= 0; k--) {
        var L = guestLook(g.guests[k].look);
        var hop = Math.round(Math.abs(Math.sin(_t * 10 + k)) * -2);
        blit(b, L.name, g.px * NT - 16 + (k - (g.size - 1) / 2) * 12, ny(1) - 6 + hop, L.swap, g.state === 'leaving');
      }
    });
  }

  // 自分のコマを選ぶ：反応（成功・失敗）→ 作業 → 移動 → 待機（呼吸・長く待つと手を振る）
  // 人ごとのコマ選び（自分もスタッフも同じ料理人）。成功・失敗の反応は自分だけ。待機の手振りは人ごとの時計で
  function playerPose(p) {
    var t = _t, re = !p.staff && _v && _v.react, side = p.fx !== 0, back = p.fy < 0;
    var idleSince = p._idle || 0;
    if (re && t - re.t < re.dur) {
      var k = Math.floor((t - re.t) / 0.16);
      if (re.kind === 'happy') return { f: back ? 'back_cheer' : ['cheer_a', 'cheer_b'][k % 2] };
      return { f: ['trouble_a', 'trouble_b'][Math.floor((t - re.t) / 0.3) % 2] };
    }
    var step = Math.floor(t / 0.14) % 2;
    if (p.workOn) {
      p._idle = t;
      if (back) return { f: step ? 'back_a' : 'back_b' };
      if (side) return { f: step ? 'side_idle' : 'side_idle2', m: p.fx > 0 };
      var w = { scrape: 'front_tools', mc: 'front_wave' }[p.workOn] || 'front_idle';
      return { f: w, dy: step ? 0 : 0.5 };
    }
    if (p.moving) {
      p._idle = t;
      var ph = Math.floor(p.bob / 2.6);
      if (back) return { f: ['back_idle', 'back_a', 'back_idle2', 'back_b'][ph % 4] };
      if (side) return { f: ph % 2 ? 'side_walk' : 'side_idle', m: p.fx > 0 };
      return { f: 'front_idle', dy: ph % 2 ? -0.5 : 0 };
    }
    var breathe = Math.sin(t * 2.2) > 0.55 ? 0.5 : 0;
    if (back) return { f: 'back_idle', dy: breathe };
    if (side) return { f: 'side_idle', m: p.fx > 0, dy: breathe };
    if (!p.hold && t - idleSince > 6 && (t - idleSince) % 5 < 0.9) return { f: 'front_wave' };   // 長く待つと手を振る
    return { f: 'front_idle', dy: breathe };
  }
  R.lastPlayer = null;   // テスト用：今の自分のコマと向き
  function pxPlayer(b, s, p, pending) {
    var h = p.hold;
    if (!cookReady()) return pxPlayerOld(b, s, p, pending);
    var pose = playerPose(p), cx = p.x * NT, gy = EXT * NT + p.y * NT + 3, dy = pose.dy || 0;
    if (!p.staff) R.lastPlayer = { frame: pose.f, mirror: !!pose.m, facing: pose.m ? 'right' : (/^side/.test(pose.f) ? 'left' : (/^back/.test(pose.f) ? 'up' : 'down')) };
    var hx = cx + p.fx * 7, hy = gy - 13 + dy;
    footShadow(b, cx, gy, !p.staff);   // 金の輪は自分だけ
    if (p.staff) {   // スタッフは頭の上に担当の札。近くに先の人がいれば、札を上にずらして重ねない
      var near = s.players.filter(function (q) { return q !== p && s.players.indexOf(q) < s.players.indexOf(p) && Math.abs(q.x - p.x) < 0.7 && Math.abs(q.y - p.y) < 0.7; }).length;
      pending.push({ tag: D.staff[p.role].short, bg: D.staff[p.role].color, x: cx + near * 6, y: gy - 33 + dy - near * 9 });
    }
    if (h && p.fy < 0 && h.k !== 'station') pxItem(b, h, hx, hy - 6, pending);      // 背中側：先に描く
    blitCook(b, pose.f, cx, gy + dy, pose.m);
    if (h && h.k === 'station') pxStation(b, s, h.st, cx - 16, gy - 62, pending, true);
    else if (h && p.fy >= 0) pxItem(b, h, hx, hy, pending);
  }
  function pxPlayerOld(b, s, p, pending) {
    var bob = p.moving ? Math.round(Math.abs(Math.sin(p.bob)) * -2) : 0;
    var x = p.x * NT - 16, y = EXT * NT + p.y * NT - 44 + bob;
    var name = p.fy < 0 ? 'chef_back' : (p.fx !== 0 ? 'chef_side' : 'chef_front');
    var h = p.hold;
    var hx = p.x * NT + p.fx * 8, hy = EXT * NT + p.y * NT - 16 + bob;
    if (h && p.fy < 0 && h.k !== 'station') pxItem(b, h, hx, hy - 6, pending);
    blit(b, name, x, y, null, p.fx < 0);
    if (h && h.k === 'station') pxStation(b, s, h.st, x, y - 26, pending, true);
    else if (h && p.fy >= 0) pxItem(b, h, hx, hy, pending);
  }




  // ドット絵の1フレーム
  R.drawPixel = function (v, s, dt, extra) {
    extra = extra || {};
    v.time += dt; _t = v.time; _v = v;
    var b = pxBuffer(v), pending = [];
    b.ctx.clearRect(0, 0, b.w, b.h);
    b.ctx.drawImage(pxBackground(v), 0, 0, b.w, b.h);
    pxWalkers(b, s);
    pxCounters(b, s, pending);
    var list = s.stations.map(function (st) { return { y: st.y + 0.5, st: st }; });
    s.players.forEach(function (p) { list.push({ y: p.y, p: p }); });
    list.sort(function (a, c) { return a.y - c.y; });
    list.forEach(function (o) { if (o.st) pxStation(b, s, o.st, nx(o.st.x), ny(o.st.y) - 8, pending); else pxPlayer(b, s, o.p, pending); });

    // 画面へ写す（整数倍ならくっきり、そうでなければなめらかに）
    var ctx = v.ctx;
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    ctx.fillStyle = '#1e1416'; ctx.fillRect(0, 0, v.w, v.h);
    var sx = 0, sy = 0;
    if (v.shake > 0.1) { sx = (Math.random() - 0.5) * v.shake * 2; sy = (Math.random() - 0.5) * v.shake; v.shake *= Math.exp(-14 * dt); } else v.shake = 0;
    ctx.save(); ctx.translate(sx, sy);
    var k = v.T / NT;                                   // 32基準 → 画面
    var kd = v.T / (NT * PS) * v.dpr;                   // 絵の1ドット → 画面の実ピクセル
    ctx.imageSmoothingEnabled = kd < 1.4 && Math.abs(kd - Math.round(kd)) > 0.01;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(v.buf, v.ox, v.oy - EXT * v.T, E.MW * v.T, (E.MH + EXT) * v.T);
    ctx.imageSmoothingEnabled = true;

    // ここから上に重ねる（読みやすさ優先）
    if (s.phase === 'prep') prepGrid(v, s);
    s.counters.forEach(function (c) {
      var X = px(v, c.x0), Y = py(v, 3), W = v.T * c.seats;
      if (!c.unlocked) {
        ctx.fillStyle = 'rgba(30,20,22,.78)'; ctx.fillRect(X, Y - v.T, W, v.T * 2);
        ctx.fillStyle = C.cream; ctx.font = '600 ' + fz(v, 0.3, 12) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('増設予定', X + W / 2, Y - v.T * 0.1);
        return;
      }
      if (c.needsScrape && c.scrapeT > 0) progressBar(v, X + W / 2, Y + v.T * 0.55, W * 0.6, c.scrapeT / D.work.scrape, C.cream);
      c.slots.forEach(function (it, i) {
        if (!it) return;
        var cx = px(v, c.x0 + i) + v.T / 2, cy = Y + v.T * 0.56;
        if (it.k === 'steak') donenessRing(v, s, c, i, it, cx, cy); else if (it.k === 'rice') riceRing(v, it, cx, cy);
      });
    });
    pxGroupOverlay(v, s);
    drawTarget(v, s, extra.target, extra.workable, v.time, extra.hint);
    pending.forEach(function (o) {
      var X = v.ox + o.x * k, Y = v.oy - EXT * v.T + o.y * k;
      if (o.badge) badge(v, X, Y, o.badge, o.bg);
      else if (o.text) { ctx.fillStyle = C.bad; ctx.font = '700 ' + fz(v, 0.24, 11) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(o.text, X, Y); }
      else if (o.bar != null) progressBar(v, X, Y, v.T * 0.7, o.bar, o.color);
      else if (o.tag) tag(v, X, Y, o.tag, o.bg || '#8a5a1c');
    });
    s.players.forEach(function (p) {
      var pu = v.punch.player;
      if (pu && v.time - pu < 0.18) { ctx.strokeStyle = 'rgba(255,255,255,' + (0.5 * (1 - (v.time - pu) / 0.18)) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px(v, p.x), py(v, p.y) - v.T * 0.2, v.T * 0.5 * (1 + (v.time - pu) * 2), 0, Math.PI * 2); ctx.stroke(); }
    });
    drawLabels(v, s);
    ambient(v, s, dt);
    drawParticles(v, dt);
    ctx.restore();
    if (v.cam) edgeAlerts(v, s);
    if (v.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + Math.min(0.35, v.flash) + ')'; ctx.fillRect(0, 0, v.w, v.h); v.flash -= dt * 2.2; }
  };

  // お客様まわりの札・ゲージ（なめらかに描く）
  function pxGroupOverlay(v, s) {
    var ctx = v.ctx, T = v.T;
    // 外で待っている組：待てる長さの輪＋人数の札（2026-10-28 本人指定「外で待っている人数が分かるように」）
    s.queue.slice(0, 2).forEach(function (id, qi) {
      var g = E.groupById(s, id); if (!g) return;
      // 輪の横（店の内側）に人数の札を並べる（縦に積むと、下の組の輪に重なった：スマホ横 2026-10-28）
      var spot = D.waitSpots[qi], inward = D.mirror ? -1 : 1, rx = px(v, spot.x) + T * (D.mirror ? 0.3 : 0.7), ry = py(v, spot.y) + T * 0.25;
      ring(v, rx, ry, g.patience / g.pMax, g.size);
      chip(v, rx + inward * T * 0.62, ry, g.size + '名', C.ink, C.cream, C.gold);
    });
    if (s.queue.length > 2) {
      var rest = s.queue.slice(2).reduce(function (n, id) { var g = E.groupById(s, id); return n + (g ? g.size : 0); }, 0);
      var sp3 = D.waitSpots[1];
      chip(v, px(v, sp3.x) + T * 0.5 + (D.mirror ? -1 : 1) * T * 0.55, py(v, sp3.y) + T * 0.85, '+' + (s.queue.length - 2) + '組・' + rest + '名', C.ink, C.cream, C.gold);
    }
    s.groups.forEach(function (g) {
      if (g.state === 'walkIn' || g.state === 'leaving') {
        if (g.angry) { ctx.fillStyle = C.bad; ctx.font = '800 ' + Math.round(T * 0.4) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('！', px(v, g.px), py(v, 0.95)); }
        return;
      }
      var c = g.counter ? E.counterById(s, g.counter) : null;
      if (!c) return;
      // 札が横に重なる大きさのときは、1人おきに上下へずらす
      var stagger = T < 52, fsB = fz(v, 0.22, 11), topB = py(v, 0.86);
      var X0 = c.x0 + (g.off || 0);   // 相席なら、組の先頭の席から
      if (g.state === 'waiting') g.guests.forEach(function (gu, i) {
        // 狭い画面では1席おきに上へずらす。ずらす幅は、左隣の札の段数ぶん（2段の札でも重ならない）
        var lift = 0;
        if (stagger && (X0 + i) % 2) {
          var seat = (g.off || 0) + i - 1, ng = seat >= 0 ? E.groupAtSeat(s, c, seat) : null, nb = ng && ng.state === 'waiting' ? ng.guests[seat - (ng.off || 0)] : null;
          lift = nb ? (bubbleParts(nb).length || 1) * fsB * 1.55 + 2 : fsB * 1.6;
        }
        var by = py(v, 1.42) - lift, n = bubbleParts(gu).length || 1;
        orderBubble(v, s, gu, px(v, X0 + i) + T / 2, by);
        topB = Math.min(topB, by - (n - 1) * fsB * 1.55 - fsB * 0.73 - Math.max(6, T * 0.14) / 2 - 3);   // 待ち時間のバーは、いちばん上の札より上に
      });
      var gx = px(v, X0) + (g.size * T) / 2;
      if (g.state === 'waiting' || g.state === 'ordering') patienceBar(v, gx, Math.min(py(v, 0.86), topB), g.size * T * 0.9, g.state === 'ordering' ? 1 : g.patience / g.pMax);
      if (g.state === 'ordering') chip(v, gx, py(v, 1.42), g.size < 3 ? '注文中…' : '注文を考えています…', 'rgba(17,19,26,.85)', C.cream);
      // 記念日の札は左、思い出は右。記念日の小さい組（2人まで）は思い出を「✦」だけに（重なって読めなかった 2026-10-28）
      if (g.anniv) tag(v, Math.max(px(v, X0) + T * 0.2, v.ox + T * 0.42), py(v, 2.3), '記念日', '#8a2f55');
      if (g.mc) { ctx.fillStyle = C.gold; ctx.font = '700 ' + fz(v, 0.26, 11) + 'px ' + FONT; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(g.anniv && g.size <= 2 ? '✦' : '✦ 思い出', px(v, X0 + g.size) - 2, py(v, 2.3)); }
      // 全員に肉をお出しした組＝最後の肉のフランベどき（思い出づくりがいちばん喜ばれる）
      else if ((g.state === 'waiting' || g.state === 'eating') && !(g.mcT > 0) && E.mcStage(g) === 'last') {
        // 2人までの組は短く。記念日の札と並ぶときは、1段下（鉄板の縁）へ
        var lab = g.size <= 2 ? 'フランベ' : 'フランベどき', fsT = fz(v, 0.22, 10), ty = g.anniv && g.size <= 2 ? 2.74 : 2.3;
        ctx.font = '700 ' + fsT + 'px ' + FONT;
        var tw = ctx.measureText(lab).width + fsT * 0.8, pulse = v.reduced ? 1 : 0.82 + 0.18 * Math.sin(_t * 6);
        ctx.save(); ctx.globalAlpha = pulse; tag(v, Math.max(px(v, X0) + tw / 2, px(v, X0 + g.size) - 2 - tw / 2), py(v, ty), lab, '#b4481a'); ctx.restore();
      }
      if (g.mcT > 0 && !g.mc) progressBar(v, gx, py(v, 2.1), g.size * T * 0.7, g.mcT / E.mcNeed(g), C.gold);
    });
  }

  R.tileToScreen = function (v, x, y) { return { x: px(v, x), y: py(v, y) }; };
})(WK);
