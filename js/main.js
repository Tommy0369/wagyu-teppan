/* 和牛の刀 鉄板十五日 — MAIN（ループ・入力・保存・演出のつなぎ） */
(function (WK) {
  'use strict';
  var D = WK.DATA, E = WK.Engine, B = WK.Bot, R = WK.Render, A = WK.Audio, U = WK.UI;
  var SAVE_KEY = 'wk-teppan-save-v1', SET_KEY = 'wk-teppan-settings-v1';
  var STEP = 1 / 60;

  var s = null, mode = 'title', paused = false, hitstop = 0, acc = 0, lastTs = 0;
  var demo = null, demoBot = null;
  var auto = null;   // デモプレイ：Bot が自分の代わりに遊ぶ（WKdebug.autoplay）。{ bot, speed, policy, t }
  var view = null, lastPhase = null, hintCache = null, hintT = 0, workSoundT = 0, warned = {};
  var input = { keys: {}, grab: false, work: false, stick: { x: 0, y: 0 }, tWork: false, pad: { x: 0, y: 0, work: false } };
  var inputMode = 'key', padPrev = {};   // タッチ端末は下で 'touch' から始める（手がかりの表示を「つかむ」「作業」に）

  // ---------- 保存（使えない環境でも遊べる） ----------
  // 保存できたかを返す（監査 F02：失敗を隠して「保存済み」と出していた）
  function store(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function load(k) { try { var t = localStorage.getItem(k); return t ? JSON.parse(t) : null; } catch (e) { return null; } }
  var reducedMq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var coarse = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || ('ontouchstart' in window);
  if (coarse) inputMode = 'touch';
  // lite＝軽量モード（スマホは自動でオン）：画面の細かさを1.5倍まで・粒を半分・重い端末では描くのを30コマに・夜の画面の間は描かない
  var settings = Object.assign({ sound: true, hints: null, reduced: reducedMq.matches, touch: coarse, lite: coarse }, load(SET_KEY) || {});
  // アプリとして入れる：Android・PC の Chrome は入れる案内を出せる（beforeinstallprompt）。iPhone は「ホーム画面に追加」の手順を見せる
  var installEvt = null;
  // iPhone アプリ（ios/ の入れ物）の中で動いているか：入れ物が UA に WagyuTeppanApp を付ける
  var inApp = /WagyuTeppanApp/.test(navigator.userAgent);
  var standalone = inApp || (window.matchMedia && (window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches)) || navigator.standalone === true;
  var isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); installEvt = e;
    if (mode === 'title' && document.querySelector('#modal [data-a="new"]')) act.toTitle();   // タイトルを出し直して、入れるボタンを見せる
  });
  var drawNow = true, workEma = 0, halfRate = false, frameNo = 0, skipDt = 0;

  // saveOk：いまの開店前の状態を保存できたか（null＝まだ保存していない）。できなければ一度だけ知らせる
  var saveOk = null, saveWarned = false;
  function save() {
    if (!s || !s.morning) return;
    var rec = { v: D.saveVersion, day: s.day, morning: s.morning };
    saveOk = store(SAVE_KEY, rec);
    // 空きがないときは、前のセーブを消してから1回だけ書き直す（前のセーブが残って、古い日に戻るのを防ぐ）
    if (!saveOk && store(SAVE_KEY, null)) saveOk = store(SAVE_KEY, rec);
    if (!saveOk) {
      var old = load(SAVE_KEY), stale = old && old.morning !== s.morning ? old.day : 0;
      if (!saveWarned) U.toast('保存できませんでした（ブラウザの設定で保存が止められているか、空きがありません）。' + (stale ? '前に保存した' + stale + '日目のデータが残っています。' : '') + 'タイトルに戻ると、この続きからは遊べません', 'bad');
      saveWarned = true;
    }
  }
  function savedRun() {
    var sv = load(SAVE_KEY);
    if (!sv || sv.v !== D.saveVersion || !sv.morning) return null;
    return sv;
  }
  function hintsOn() { return settings.hints === null ? (s && s.day <= 2) : !!settings.hints; }

  // ---------- 画面の流れ ----------
  var act = {
    newGame: function () { U.difficulty(function (d) { act.startGame(d); }, function () { act.toTitle(); }); },
    startGame: function (difficulty) {
      A.init(); lockLandscape();
      s = E.newRun((Date.now() ^ 0x5bd1e995) >>> 0, difficulty);
      warned = {}; saveWarned = false;
      enterPrep();
    },
    continueGame: function () {
      A.init(); lockLandscape();
      var sv = savedRun();
      var r = sv && E.restore(sv.morning);
      // 難易度の画面を開いてから知らせる（先に出すと、画面の入れ替えで消えた）
      if (!r) { store(SAVE_KEY, null); act.newGame(); U.toast('保存データが壊れていて読めませんでした。はじめから始めます', 'warn'); return; }
      s = r; warned = {};
      enterPrep();
    },
    toTitle: function () {
      mode = 'title'; paused = false;
      U.setPhase('title'); U.banner(null, false);
      var sv = savedRun();
      U.title(!!sv, sv ? sv.day : 0);
    },
    open: function () {
      if (!s || s.phase !== 'prep' || U.isOpen()) return;
      A.init();
      var problems = E.checkLayout(s);
      if (problems.length) { problems.slice(0, 3).forEach(function (t) { U.toast(t, 'bad'); }); A.play('deny'); return; }
      s.stations.forEach(function (st) { delete st.isNew; });
      blurControls();
      E.beginService(s);
      save();
      U.banner(s, false);
      U.setPhase('service');
    },
    pause: function () {
      if (mode !== 'game' || !s || (s.phase !== 'service' && s.phase !== 'prep')) return;
      if (U.isOpen()) return;
      paused = true; U.pause(s);
    },
    resume: function () { paused = false; U.close(); },
    retry: function () { s = E.retryDay(s); paused = false; warned = {}; enterPrep(); },
    afterReport: function () { E.afterReport(s); night(); },
    pickCard: function (id) { if (E.pickCard(s, id)) { A.play('card'); night(); } },
    buy: function (i) { if (E.buy(s, i)) { A.play('buy'); U.shop(s); } else A.play('deny'); },
    reroll: function () { if (E.reroll(s)) { A.play('ui'); U.shop(s); } },
    setStaff: function (id, on) { if (E.setStaff(s, id, on)) { A.play('ui'); U.shop(s); } },
    nextDay: function () { E.nextDay(s); enterPrep(); },
    // 'prompt'＝その場で入れられる／'ios'＝手順を見せる／null＝もうアプリ・入れられない
    installKind: function () { if (standalone) return null; if (installEvt) return 'prompt'; if (isIOS && coarse) return 'ios'; return null; },
    install: function () {
      if (installEvt) { var e = installEvt; installEvt = null; e.prompt(); if (e.userChoice) e.userChoice.then(function () { act.toTitle(); }); return; }
      U.installIOS(function () { act.toTitle(); });
    },
    saveStatus: function () { return saveOk; },
    getSettings: function () { return { sound: settings.sound, hints: settings.hints === null ? true : settings.hints, reduced: settings.reduced, touch: settings.touch, lite: settings.lite }; },
    setSetting: function (id, v) {
      settings[id] = v; store(SET_KEY, settings);
      if (id === 'sound') { A.init(); A.setOn(v); }
      if (id === 'reduced') view.reduced = v;
      if (id === 'touch') U.showTouch(v);
      if (id === 'lite') { view.lite = v; halfRate = false; workEma = 0; resize(); }
    }
  };

  function enterPrep() {
    mode = 'game'; paused = false;
    U.close();
    U.setPhase('prep');
    U.banner(s, true);
    lastPhase = 'prep';
    save();
  }
  function night() {
    if (s.phase === 'card') U.cards(s);
    else if (s.phase === 'shop') U.shop(s);
    else if (s.phase === 'result') { store(SAVE_KEY, null); U.result(s); }
    U.setPhase(s.phase);
  }

  // ---------- 入力 ----------
  // キー（本人指定 2026-10-28）：移動＝矢印キー、つかむ＝Z、作業（長押し）＝A。A が左移動と重なるので WASD はやめた
  //  Space は何もしないが受け止める（画面のボタンに残ったフォーカスで、誤って押されないように）
  var MOVE = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
  var GRAB_KEYS = { KeyZ: 1 }, WORK_KEYS = { KeyA: 1 };
  var GAME_KEYS = { KeyZ: 1, KeyA: 1, Space: 1, Enter: 1, NumpadEnter: 1, Escape: 1 };
  // 押しっぱなしの入力をすべて離す（画面が切り替わるとき・ウィンドウを離れたとき）
  function releaseAll() { input.keys = {}; input.work = false; input.tWork = false; input.grab = false; input.stick.x = 0; input.stick.y = 0; }
  // ゲーム中のキーでボタンが押されないように、画面上のボタンからフォーカスを外す
  function blurControls() {
    var a = document.activeElement;
    if (a && a !== document.body && a.blur && !(a.closest && a.closest('#modal'))) a.blur();
  }
  function onKey(e, down) {
    var c = e.code;
    // 離したキーは画面の状態に関係なく必ず受け取る（閉じた後に勝手に歩かないように）
    if (!down) {
      if (MOVE[c]) input.keys[c] = false;
      if (WORK_KEYS[c]) input.work = false;
      if (!U.isOpen() && (MOVE[c] || GAME_KEYS[c])) e.preventDefault();
      return;
    }
    if (U.isOpen()) {
      if (e.key === 'Escape' && paused) { e.preventDefault(); act.resume(); }
      return;
    }
    if (MOVE[c] || GAME_KEYS[c]) blurControls();
    if (MOVE[c]) { input.keys[c] = true; e.preventDefault(); inputMode = 'key'; return; }
    if (GRAB_KEYS[c]) { if (down && !e.repeat) input.grab = true; e.preventDefault(); inputMode = 'key'; A.init(); return; }
    if (WORK_KEYS[c]) { input.work = true; e.preventDefault(); inputMode = 'key'; return; }
    if (c === 'Space') { e.preventDefault(); return; }
    if (down && (c === 'Enter' || c === 'NumpadEnter')) { e.preventDefault(); act.open(); return; }
    if (down && c === 'Escape') { e.preventDefault(); act.pause(); }
  }
  window.addEventListener('keydown', function (e) { onKey(e, true); });
  window.addEventListener('keyup', function (e) { onKey(e, false); });
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', function () { if (document.hidden) act.pause(); });
  // アプリ：裏に回る直前に入れ物が知らせる（visibilitychange が遅れて届くことがあったため）
  window.addEventListener('wagyuapp:pause', function () { act.pause(); });

  function setupTouch() {
    var stick = document.getElementById('stick'), knob = document.getElementById('stickKnob');
    var pid = null, cx = 0, cy = 0, R0 = 52;
    var upd = function (x, y) {
      var dx = x - cx, dy = y - cy;
      // 画面を90度回しているときは、指の動きもゲームの向きに直す
      if (document.documentElement.classList.contains('rot')) { var t = dx; dx = dy; dy = -t; }
      var len = Math.sqrt(dx * dx + dy * dy);
      if (len > R0) { dx = dx / len * R0; dy = dy / len * R0; }
      knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      input.stick.x = dx / R0; input.stick.y = dy / R0;
    };
    stick.addEventListener('pointerdown', function (e) {
      A.init(); inputMode = 'touch';
      var r = stick.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      pid = e.pointerId; try { stick.setPointerCapture(pid); } catch (er) { /* 合成イベントなど */ } upd(e.clientX, e.clientY); e.preventDefault();
    });
    stick.addEventListener('pointermove', function (e) { if (e.pointerId === pid) upd(e.clientX, e.clientY); });
    var end = function (e) { if (e.pointerId !== pid) return; pid = null; input.stick.x = 0; input.stick.y = 0; knob.style.transform = ''; };
    stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);
    var g = document.getElementById('tGrab'), w = document.getElementById('tWork');
    g.addEventListener('pointerdown', function (e) { A.init(); inputMode = 'touch'; input.grab = true; g.classList.add('on'); vibrate(8); e.preventDefault(); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { g.addEventListener(ev, function () { g.classList.remove('on'); }); });
    w.addEventListener('pointerdown', function (e) { A.init(); inputMode = 'touch'; input.tWork = true; w.classList.add('on'); try { w.setPointerCapture(e.pointerId); } catch (er) { /* 合成イベントなど */ } e.preventDefault(); });
    ['pointerup', 'pointercancel'].forEach(function (ev) { w.addEventListener(ev, function () { input.tWork = false; w.classList.remove('on'); }); });
    // マウスでも押せるように click は無視（pointerdown で処理済み）
    [g, w].forEach(function (b) { b.addEventListener('click', function (e) { e.preventDefault(); }); b.addEventListener('contextmenu', function (e) { e.preventDefault(); }); });
  }
  function vibrate(ms) { if (settings.reduced || inputMode !== 'touch' || !navigator.vibrate) return; try { navigator.vibrate(ms); } catch (e) { /* 無視 */ } }

  function pollPad() {
    var pads = navigator.getGamepads ? navigator.getGamepads() : [];
    var p = pads && pads[0];
    if (!p) { input.pad.x = 0; input.pad.y = 0; input.pad.work = false; return; }
    var ax = p.axes[0] || 0, ay = p.axes[1] || 0;
    if (Math.abs(ax) < 0.25) ax = 0; if (Math.abs(ay) < 0.25) ay = 0;
    var b = function (i) { return p.buttons[i] && p.buttons[i].pressed; };
    if (b(12)) ay = -1; if (b(13)) ay = 1; if (b(14)) ax = -1; if (b(15)) ax = 1;
    input.pad.x = ax; input.pad.y = ay;
    input.pad.work = b(2) || b(1);
    if (ax || ay || b(0) || b(2)) inputMode = 'pad';
    if (b(0) && !padPrev[0]) { if (U.isOpen()) { var f = document.activeElement; if (f && f.click) f.click(); } else input.grab = true; }
    if (b(9) && !padPrev[9]) { if (s && s.phase === 'prep') act.open(); else act.pause(); }
    if (b(8) && !padPrev[8]) act.pause();
    padPrev = { 0: b(0), 8: b(8), 9: b(9) };
  }

  function buildInput() {
    var mx = 0, my = 0;
    Object.keys(input.keys).forEach(function (k) { if (input.keys[k] && MOVE[k]) { mx += MOVE[k][0]; my += MOVE[k][1]; } });
    mx += input.stick.x + input.pad.x; my += input.stick.y + input.pad.y;
    var len = Math.sqrt(mx * mx + my * my); if (len > 1) { mx /= len; my /= len; }
    return { mx: mx, my: my, grab: input.grab, work: input.work || input.tWork || input.pad.work };
  }

  // ---------- 演出 ----------
  function fxDispatch(st, v) {
    var gold = [R.C.gold, '#fff3d6'], spark = ['#ffb86b', '#fff1c9'];
    st.fx.forEach(function (f) {
      switch (f.t) {
        case 'toast': U.toast(f.text, f.kind === 'warn' ? 'warn' : ''); if (f.kind === 'warn') A.play('deny'); break;
        case 'pick': A.play('pick'); v.punch.player = v.time; break;
        case 'place': A.play('place'); R.burst(v, f.x, f.y, 5, ['#8a8f96', '#c9c3b8'], { speed: 1.4, life: 0.3, size: 0.04 }); break;
        case 'sizzle': A.play('sizzle'); R.burst(v, f.x, f.y, 12, spark, { speed: 2.6, life: 0.35, size: 0.035, up: true }); break;
        case 'appDone': A.play('cutDone'); R.burst(v, f.x, f.y - 0.3, 8, ['#9fdc7e', '#f08e30', '#ee8896'], { speed: 1.6, life: 0.4, size: 0.04, up: true }); break;
        case 'washDone': A.play('washDone'); R.burst(v, f.x, f.y - 0.3, 5, ['#bfe3ff', '#ffffff'], { speed: 1.2, life: 0.5, size: 0.05, up: true }); break;
        case 'scrapeDone': A.play('cutDone'); R.burst(v, f.x, f.y, 10, ['#e7e2d8', '#9aa0a8'], { speed: 2.4, life: 0.4, size: 0.035 }); R.float(v, f.x, f.y - 0.6, '鉄板きれい', R.C.cream); break;
        case 'serve':
          if (f.subst === 'up') {
            A.play('serve'); v.punch['seat' + f.seat] = v.time;
            R.float(v, f.seat + 0.5, 1.6, E.meatName(f.have) + 'をサービス（差額はロス）', '#ffd59a'); R.react(v, 'happy'); R.guestReact(v, f.seat + 0.5, 'happy');
          } else if (f.subst === 'down') {
            A.play('serveWrong');
            R.float(v, f.seat + 0.5, 1.6, '取り違え（' + E.meatName(f.wantMain) + 'のご注文）', '#ffb4b0'); R.react(v, 'trouble'); R.guestReact(v, f.seat + 0.5, 'trouble');
          } else if (f.good && !f.done) {
            // 前菜・ドリンク・ご飯：小さく（肉の「ぴったり」の手応えを薄めない）
            A.play('pick'); v.punch['seat' + f.seat] = v.time;
            R.float(v, f.seat + 0.5, 1.7, f.have === 'app' ? '前菜' : (D.drinks[f.have] ? D.drinks[f.have].name : 'お待たせしました'), R.C.cream);
          } else if (f.good) {
            A.play('serve'); hitstop = 0.05; v.punch['seat' + f.seat] = v.time; vibrate(12);
            R.burst(v, f.seat + 0.5, 2.3, 14, gold, { speed: 3, life: 0.6, size: 0.05 });
            R.float(v, f.seat + 0.5, 1.6, f.done ? 'ぴったり ' + D.doneness.name[f.done] : 'お待たせしました', R.C.gold); R.react(v, 'happy'); R.guestReact(v, f.seat + 0.5, 'happy');
          } else {
            A.play('serveWrong');
            R.float(v, f.seat + 0.5, 1.6, '焼き加減ちがい（' + D.doneness.short[f.want] + 'のご注文）', '#ffb4b0'); R.react(v, 'trouble'); R.guestReact(v, f.seat + 0.5, 'trouble');
          }
          break;
        case 'pay':
          A.play('pay');
          R.float(v, f.x, 1.2, '+' + U.yen(f.amount), '#c9f0d1', true);
          if (f.tip) { A.play('tip'); R.float(v, f.x + 0.6, 0.8, 'TIP ' + U.yen(f.tip), R.C.gold); }
          if (f.review === 5) { R.float(v, f.x - 0.6, 0.8, f.photo ? '写真つき口コミ ★5' : '口コミ ★5', R.C.gold); R.guestReact(v, f.x, 'happy', 2); }
          if (f.review && f.review <= 2) R.float(v, f.x - 0.6, 0.8, '口コミ ★' + f.review, '#ffb4b0');
          break;
        case 'mc':
          A.play('flambe'); A.play('mc');
          var big = f.stage === 'last' || !f.stage;   // 最後の肉のフランベは大きく、食事の前は控えめに
          R.burst(v, f.x, 3.0, big ? 26 : f.stage === 'mid' ? 14 : 6, ['#fff3b0', '#ffd23c', '#ff8a2c', '#ff4a1e'], { speed: big ? 4.2 : 3, life: 0.7, size: 0.06, up: true });   // フランベの仕上げ
          v.flash = settings.reduced || !big ? 0 : 0.28; vibrate(15); if (f.by !== 'staff') R.react(v, 'happy'); R.guestReact(v, f.x, 'happy', big ? 2 : 1);
          R.burst(v, f.x, f.y, 18, gold, { speed: 3.4, life: 0.8, size: 0.05, up: true });
          var mcLab = f.stage === 'early' ? '思い出づくり（食事の前・控えめ）' : f.stage === 'mid' ? '思い出づくり（食事の途中）' : '最後の肉でフランベ！思い出づくり';
          R.float(v, f.x, f.y - 0.6, (f.by === 'staff' ? 'MC担当：' : '') + (f.anniv && f.stage !== 'early' ? '記念日の' : '') + mcLab, f.stage === 'early' ? '#e8d9b0' : R.C.gold, true);
          break;
        case 'complaint':
          A.play('complaint'); R.shake(v, 7); vibrate(40); R.react(v, 'trouble');
          R.float(v, f.x, 1.2, 'クレーム ' + f.n + '件目', '#ffb4b0', true);
          U.toast('料理を待ち切れず、お客様が帰りました（クレーム' + f.n + '件／' + D.day.complaintLimit + '件で失敗）', 'bad');
          break;
        case 'lost':
          A.play('lost'); R.float(v, 0.9, 1.4, '入れずに帰った… −約' + U.yen(f.amount), R.C.muted);
          break;
        case 'arrive': A.play('arrive'); break;
        case 'order': A.play('order'); break;
        case 'doneness':
          if (f.d === 'burnt') { A.play('burnt'); R.shake(v, 2.5); R.react(v, 'trouble'); R.float(v, f.x, f.y - 0.7, '焦げた！', '#ffb4b0'); R.burst(v, f.x, f.y, 8, ['#3a3533', '#5a5450'], { speed: 1, life: 0.9, size: 0.09, up: true, smoke: true }); }
          break;
        case 'trash': A.play('trash'); if (f.cost) R.float(v, f.x, f.y - 0.6, 'ロス −' + U.yen(f.cost), '#ffb4b0'); break;
        case 'open': A.play('open'); U.toast('開店！ いらっしゃいませ', 'good'); break;
        case 'close': A.play('close'); break;
        case 'fail': A.play('fail'); break;
      }
    });
    st.fx.length = 0;
  }

  function patienceWarnings(st) {
    st.groups.forEach(function (g) {
      if (g.state !== 'waiting' || warned[g.id]) return;
      if (g.patience / g.pMax < D.guests.lowRatio) { warned[g.id] = true; A.play('warn'); }
    });
  }

  function cookingCount(st) {
    var n = 0;
    st.counters.forEach(function (c) { c.slots.forEach(function (it) { if (it && (it.k === 'steak' || it.k === 'rice')) n++; }); });
    return n;
  }

  // ---------- タイトルのデモ ----------
  function demoReset() {
    demo = E.newRun(20261025);
    demo.cards = ['garlic'];
    E.deliver(demo, 'rice');
    B.autoLayout(demo);
    E.beginService(demo);
    demo.spawns.forEach(function (sp) { sp.t *= 0.6; });
    demoBot = B.create({ mc: 'slack', react: 0.18, seed: 7 });
  }

  // ---------- ループ ----------
  function frame(ts) {
    var dt = Math.min(0.05, lastTs ? (ts - lastTs) / 1000 : 0.016);
    lastTs = ts;
    frameNo++;
    // 軽量モード：夜の画面・一時停止の間は店を描き直さない。1コマの処理が重い端末では、描くのを2コマに1回（動きの計算は毎コマ）
    var frozen = settings.lite && mode === 'game' && (paused || U.isOpen());
    // タイトルのデモは見るだけなので、軽量モードでは30コマで描く
    drawNow = !frozen && !((halfRate || (settings.lite && mode === 'title')) && frameNo % 2);
    var t0 = performance.now();
    tick(dt, drawNow ? dt + skipDt : 0);   // 描かなかったコマの時間も、次に描くときの動き（炎・湯気など）に足す
    skipDt = drawNow ? 0 : skipDt + dt;
    if (drawNow && settings.lite) {
      workEma += ((performance.now() - t0) - workEma) * 0.05;
      if (!halfRate && workEma > 13) halfRate = true;          // 60コマに間に合わない
      else if (halfRate && workEma < 6) halfRate = false;      // 余裕が戻った
    }
    requestAnimationFrame(frame);
  }
  // デモプレイ：開店準備は自動の配置、日報・夜は少し見せてから Bot が進める
  function autoDrive(dt) {
    auto.t += dt;
    var ph = s.phase, wait = auto.t > 2.2 / Math.max(1, auto.speed / 2);
    if (ph === 'prep' && !U.isOpen() && auto.t > 0.8) { B.autoLayout(s); act.open(); auto.bot.task = null; auto.t = 0; }
    else if (ph === 'report' && U.isOpen() && wait) { U.close(); act.afterReport(); auto.t = 0; }
    else if ((ph === 'card' || ph === 'shop') && wait) { B.night(s, auto.policy); if (s.phase === 'shop') { U.close(); act.nextDay(); } auto.t = 0; }
    else if (ph === 'failed' && U.isOpen() && wait) { U.close(); act.retry(); auto.bot = B.create({ mc: 'slack', react: 0.14, seed: (auto.seed += 7) }); auto.t = 0; }
    else if (ph === 'result') auto = null;
    else if (ph === 'service') auto.t = 0;
  }
  function tick(dt, rdt) {
    if (!rdt) rdt = dt;
    pollPad();
    if (mode === 'title') {
      if (!demo || demo.phase !== 'service') demoReset();
      acc += dt;
      while (acc >= STEP) { E.step(demo, STEP, [B.input(demo, demo.players[0], demoBot, STEP)]); acc -= STEP; }
      demo.fx.length = 0;
      R.follow(view, demo.players[0].x, dt);
      if (drawNow) R.draw(view, demo, rdt, {});
      input.grab = false;
      return;
    }
    var running = s && !paused && !U.isOpen() && (s.phase === 'service' || s.phase === 'prep');
    if (running) {
      if (hitstop > 0) { hitstop -= dt; }
      else {
        acc += dt * (auto ? auto.speed : 1);
        var first = true;
        while (acc >= STEP) {
          var inp = auto ? B.input(s, s.players[0], auto.bot, STEP) : buildInput();
          if (!first) inp.grab = false;
          E.step(s, STEP, [inp]);
          if (first) input.grab = false;
          first = false;
          acc -= STEP;
          if (s.phase !== 'service' && s.phase !== 'prep') break;
        }
      }
    } else { acc = 0; releaseAll(); }
    if (auto && s) autoDrive(dt);
    if (s) {
      fxDispatch(s, view);
      patienceWarnings(s);
      if (s.phase !== lastPhase) {
        lastPhase = s.phase;
        U.setPhase(s.phase);
        // 閉店の余韻を少し見せてから日報（その間に状態が進んでいたら出さない）
        if (s.phase === 'report') { var sr = s; setTimeout(function () { if (s === sr && s.phase === 'report' && !U.isOpen()) U.report(s); }, 450); }
        if (s.phase === 'failed') { var sf = s; setTimeout(function () { if (s === sf && s.phase === 'failed' && !U.isOpen()) U.failed(s); }, 650); }
      }
      var p = s.players[0];
      var live = s.phase === 'service' || s.phase === 'prep';
      var target = live ? E.getTarget(s, p) : null;
      var workable = s.phase === 'service' ? E.workable(s, p) : null;
      hintT -= dt;
      if (hintT <= 0) { hintCache = (s.phase === 'service' && hintsOn()) ? B.suggest(s) : null; hintT = 0.3; }
      R.follow(view, p.x, dt);
      if (drawNow) R.draw(view, s, rdt, { target: target, workable: workable && p.workOn ? workable : (workable && workable.prog > 0 ? workable : null), hint: hintCache });
      U.hud(s);
      if (live) U.hint(s, p, inputMode, hintCache);
      A.setSizzle(s.phase === 'service' && running ? cookingCount(s) : 0);
      // 作業中の音
      workSoundT -= dt;
      if (p.workOn && workSoundT <= 0) {
        A.play(p.workOn === 'wash' ? 'wash' : p.workOn === 'scrape' ? 'scrape' : p.workOn === 'mc' ? 'flambe' : p.workOn === 'app' ? 'chop' : 'ui');
        workSoundT = p.workOn === 'mc' ? 0.3 : p.workOn === 'app' ? 0.18 : 0.22;
        // フランベの火の粉
        if (p.workOn === 'mc' && workable && workable.c) R.burst(view, workable.c.x0 + Math.min(workable.g.size, workable.c.seats) / 2, 3.1, 6, ['#ffe25c', '#ff9a2c', '#ff5a1e'], { speed: 2.2, life: 0.5, size: 0.035, up: true });
      }
    }
  }

  // スマホの横画面（高さ520px未満のタッチ端末）は、スマホ用の画面にする：店を高さいっぱいに描き、左右の余白に情報と操作を置く
  function isPhone() {
    var w = window.innerWidth, h = window.innerHeight, rot = document.documentElement.classList.contains('rot');
    return coarse && Math.min(w, h) < 520 && (rot || w > h);
  }
  function resize() {
    var st = document.getElementById('stage'), root = document.documentElement;
    view.phone = isPhone();
    root.classList.toggle('phone', view.phone);
    // 片側の余白の最小：スティック（112px）＋画面の切り欠き（safe area）
    var probe = document.getElementById('safeProbe');
    if (!probe) { probe = document.createElement('div'); probe.id = 'safeProbe'; probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right)'; document.body.appendChild(probe); }
    var cs = getComputedStyle(probe), inset = Math.max(parseFloat(cs.paddingLeft) || 0, parseFloat(cs.paddingRight) || 0);
    view.gutMin = inset + 124;
    R.resize(view, st.clientWidth, st.clientHeight);
    // 左右の余白（店の外）の幅を CSS に渡す：情報と操作ボタンをそこに並べる
    root.style.setProperty('--gut-l', Math.max(0, view.ox) + 'px');
    root.style.setProperty('--gut-r', Math.max(0, st.clientWidth - view.ox - view.T * E.MW) + 'px');
    root.style.setProperty('--map-w', (view.T * E.MW) + 'px');
  }

  // スマホを縦に持っているときは、画面ごと90度回して横画面で遊ぶ
  function applyRotate() {
    if (inApp) { document.documentElement.classList.toggle('phone', isPhone()); return; }   // アプリは横向きに固定（回さない）
    var w = window.innerWidth, h = window.innerHeight;
    var rot = coarse && h > w && w < 700;
    var root = document.documentElement;
    root.classList.toggle('rot', rot);
    root.classList.toggle('phone', isPhone());   // 先に付けておく（#stage の大きさが決まる前に、スマホの並びにする）
    if (rot) { root.style.setProperty('--rot-w', h + 'px'); root.style.setProperty('--rot-h', w + 'px'); }
  }
  // Android など、固定できる端末は全画面＋横向きに固定する（できなくても遊べる）
  function lockLandscape() {
    if (!coarse || inApp) return;   // アプリは入れ物が横向き・全画面にしている
    try {
      var el = document.documentElement;
      var p = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : null;
      var lock = function () { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function () {}); };
      if (p && p.then) p.then(lock).catch(function () {}); else lock();
    } catch (e) { /* 対応していない端末はそのまま */ }
  }

  function boot() {
    if (WK.ART_IMAGES && WK.ART_IMAGES.title) document.documentElement.style.setProperty('--title-bg', 'url("' + WK.ART_IMAGES.title + '")');
    applyRotate();
    window.addEventListener('resize', applyRotate);
    window.addEventListener('orientationchange', function () { setTimeout(applyRotate, 200); });
    view = R.create(document.getElementById('cv'));
    view.reduced = settings.reduced; view.lite = settings.lite;
    U.init(act);
    U.showTouch(settings.touch);
    A.on = settings.sound;
    setupTouch();
    resize();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(document.getElementById('stage'));
    else window.addEventListener('resize', resize);
    act.toTitle();
    // アプリ版：ファイルを端末にしまう（https のときだけ。手元のサーバーでは ?sw を付けたときだけ＝直したファイルが古いまま出ないように）
    try {
      if (!inApp && 'serviceWorker' in navigator && (location.protocol === 'https:' || (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && /[?&]sw\b/.test(location.search)))) {
        navigator.serviceWorker.register('sw.js').catch(function () { /* 使えない場所ではそのまま */ });
      }
    } catch (e) { /* 埋め込み（claude.ai のページなど）では触るだけで止められる。そのまま遊べる */ }
    requestAnimationFrame(frame);
    // 検証用（コンソール）
    // 検証用：画面が隠れていて rAF が止まっていても、時間を進めて描ける
    window.WKdebug = {
      state: function () { return s; }, act: act, E: E, B: B, input: input,
      advance: function (sec, inp) {
        var n = Math.round(sec * 60);
        for (var i = 0; i < n; i++) { if (inp) { var o = typeof inp === 'function' ? inp(i) : inp; Object.assign(input, o); } tick(1 / 60); }
        return s ? s.phase : mode;
      },
      setState: function (st) { s = st; mode = 'game'; lastPhase = st.phase; U.setPhase(st.phase); },
      // 描かずに Bot で営業を進める（検証用）
      sim: function (sec, opts) {
        var b = this._bot || (this._bot = B.create(Object.assign({ react: 0.12 }, opts || {})));
        var n = Math.round(sec * 60);
        for (var i = 0; i < n && s && s.phase === 'service'; i++) E.step(s, STEP, [B.input(s, s.players[0], b, STEP)]);
        if (s) s.fx.length = 0;
        tick(1 / 60);
        return s.phase;
      },
      // 夜を Bot に任せて、次の日の開店前まで進める（検証用）
      // デモプレイ：Bot が自分の代わりに15日間を遊ぶ（speed 倍速）。止めるときは autoplay(null)
      autoplay: function (difficulty, speed, policy) {
        if (difficulty === null) { auto = null; return 'stop'; }
        U.close(); act.startGame(difficulty || 'easy');
        auto = { bot: B.create({ mc: 'slack', react: 0.14, seed: 11 }), speed: speed || 1, t: 0, seed: 11,
          policy: policy || { hire: [{ id: 'kitchen', from: 4 }, { id: 'mc', from: 7 }], buy: ['plates', 'sakeShelf', 'wineCellar', 'sink', 'board', 'washer', 'sneakers', 'reservation', 'bench', 'highHeat', 'showcase'] } };
        return s.phase;
      },
      night: function (policy) { B.night(s, policy || { hire: [{ id: 'kitchen', from: 6 }] }); if (s.phase === 'shop') { E.nextDay(s); enterPrep(); } return s.phase; }
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(WK);
