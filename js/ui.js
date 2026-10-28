/* 和牛の刀 鉄板十五日 — UI（HUD・ヒント・トースト・モーダル）
 * 状態は持たない。state を読んで描き、押されたら act のハンドラを呼ぶ。
 */
var WK = (typeof WK !== 'undefined') ? WK : {};

(function (WK) {
  'use strict';
  var D = WK.DATA, E = WK.Engine;
  var U = WK.UI = {};
  var el = {}, act = {}, toastSeen = {};

  function $(id) { return document.getElementById(id); }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function yen(n) { return Math.round(n).toLocaleString('ja-JP') + '円'; }
  function signed(n) { return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(Math.round(n)).toLocaleString('ja-JP') + '円'; }
  U.yen = yen;

  U.init = function (handlers) {
    act = handlers;
    ['app', 'hud', 'hDay', 'hClock', 'hClockBar', 'hSales', 'hRep', 'hClaim', 'btnPause', 'stage', 'banner', 'bannerTitle', 'bannerSub', 'btnOpen',
      'toasts', 'hint', 'hintNext', 'hintTarget', 'touch', 'modalWrap', 'modal'].forEach(function (id) { el[id] = $(id); });
    el.btnPause.addEventListener('click', function () { act.pause(); });
    el.btnOpen.addEventListener('click', function () { act.open(); });
    el.modal.addEventListener('keydown', trapFocus);
  };

  U.setPhase = function (phase) { el.app.dataset.phase = phase; };

  // ---------- HUD ----------
  var last = {};
  U.hud = function (s) {
    var day = s.day + '日目';
    if (last.day !== day) { el.hDay.textContent = day; last.day = day; }
    var dur = s.dur || E.dayDuration(s.day);
    var r = s.phase === 'service' ? Math.min(1, s.t / dur) : 0;
    var hrs = D.day.clockStart + (D.day.clockEnd - D.day.clockStart) * r;
    var h = Math.floor(hrs), m = Math.floor((hrs - h) * 60 / 5) * 5;
    var clock = (s.phase === 'service' && s.t > dur) ? '22:00〜' : (h + ':' + (m < 10 ? '0' : '') + m);
    if (last.clock !== clock) { el.hClock.textContent = clock; last.clock = clock; }
    // 画面の書き換えは、変わったときだけ（スマホで毎コマ書くと重い）
    var bar = (r * 100).toFixed(0) + '%';
    if (last.bar !== bar) { el.hClockBar.style.width = bar; last.bar = bar; }
    var rev = s.stats ? s.stats.revenue : 0;
    if (last.rev !== rev) { el.hSales.textContent = yen(rev); last.rev = rev; }
    var rep = '★' + s.rep.toFixed(1);
    if (last.rep !== rep) { el.hRep.textContent = rep; last.rep = rep; }
    var cl = s.stats ? s.stats.complaints : 0;
    if (last.cl !== cl) {
      var dots = el.hClaim.querySelectorAll('i');
      for (var i = 0; i < dots.length; i++) dots[i].classList.toggle('on', i < cl);
      el.hClaim.setAttribute('aria-label', 'クレーム' + cl + '件（' + D.day.complaintLimit + '件でその日は失敗）');
      last.cl = cl;
    }
  };

  // ---------- 開店準備のバナー ----------
  U.banner = function (s, show) {
    el.banner.hidden = !show;
    if (!show) return;
    el.bannerTitle.textContent = s.day + '日目の開店準備';
    var tips = {
      1: '侍コース：肉を焼き、前菜（まな板）とドリンク（水・ビール）もお出しします',
      3: '今夜の店に酒棚・ワインセラーが並びます。日本酒・ワインは売上が大きい',
      6: '今日から将軍コース（シャトー・フィレ。前菜2品）が始まります',
      2: '設備は「つかむ」で持ち上げて動かせます。鉄板の近くに寄せると速くなります'
    };
    var news = s.stations.some(function (st) { return st.isNew; });
    el.bannerSub.textContent = tips[s.day] || (news ? '届いた設備（NEW）を好きな場所へ置きましょう' : '配置を見直したら開店しましょう');
  };

  // ---------- ヒント ----------
  U.hint = function (s, p, mode, suggestion) {
    var html = describe(s, p, mode);
    if (html !== last.hintT) { el.hintTarget.innerHTML = html; last.hintT = html; }
    var next = suggestion ? '次：' + suggestion.label : '';
    if (next !== last.hintN) { el.hintNext.textContent = next; last.hintN = next; }
  };
  function key(mode, k) {
    if (mode === 'touch') return '<kbd>' + (k === 'grab' ? 'つかむ' : '作業') + '</kbd>';
    if (mode === 'pad') return '<kbd>' + (k === 'grab' ? 'A' : 'X') + '</kbd>';
    return '<kbd>' + (k === 'grab' ? 'Z' : 'A 長押し') + '</kbd>';
  }
  function describe(s, p, mode) {
    if (s.phase !== 'service' && s.phase !== 'prep') return '';
    var tg = E.getTarget(s, p);
    var h = p.hold;
    var a = [];
    var G = function (t) { a.push(key(mode, 'grab') + t); }, W = function (t) { a.push(key(mode, 'work') + t); };
    if (s.phase === 'prep') {
      if (h && h.k === 'station') {
        if (tg && tg.k === 'floor') G(D.stations[h.st.type].name + 'をここに置く');
        else if (tg && tg.why === 'trap') a.push('<b style="color:#ffb4b0">ここに置くと、通れない場所ができます</b>');
        else a.push('空いている床の方を向いて置きます');
      }
      else if (tg && tg.k === 'station') G(D.stations[tg.st.type].name + 'を持ち上げる');
      else a.push('設備の前に立つと持ち上げられます');
      return a.join('<span class="sep">／</span>');
    }
    if (!tg) {
      if (h) return '<b>手に：</b>' + holdName(h);
      return '';
    }
    var name = '';
    if (tg.k === 'station') {
      var st = tg.st, def = D.stations[st.type];
      name = def.name;
      if (def.provides) {
        var rawH = h && ((h.k === 'steak' && h.t === 0 && h.m === def.provides) || (h.k === 'drink' && D.drinks[def.provides]) || (h.k === 'rice' && h.t === 0 && def.provides === 'rice' && E.carryMax(s, 'rice') > 1));
        var hmax = h ? E.carryMax(s, h.k) : 0, hn = h ? (h.k === 'drink' ? E.drinkList(h).length : (h.n || 1)) : 0;
        if (!h) G(def.short + 'を取る');
        else if (rawH && hn < hmax) G((h.k === 'drink' ? def.short + 'も取る' : 'もう1つ取る') + '（いま' + hn + '）');
        else if (rawH) a.push(hmax + (h.k === 'drink' ? '杯' : 'つ') + 'まで持てます');
        else if (h.k === 'rice' && def.provides === 'rice' && h.t === 0) G('戻す');
        var canBack = h && ((h.k === 'steak' && h.t === 0 && h.m === def.provides) || (h.k === 'drink' && E.drinkList(h).indexOf(def.provides) >= 0) || (h.k === 'rice' && h.t === 0 && def.provides === 'rice'));
        if (canBack) W(h.k === 'drink' ? def.short + 'を戻す' : '戻す');
      } else if (st.type === 'board') {
        var cleanB = h && h.k === 'plates' && !h.dirty;
        if (cleanB && (!st.item || (st.item.k === 'plates' && st.item.n < D.work.appMax))) G('皿を並べる（' + D.work.appMax + '皿まで）');
        if (st.item && st.item.k === 'plates') W('前菜を盛る（' + st.item.n + '皿）');
        if (!h && st.item) G(holdName(st.item) + 'を取る');
        if (!st.item && !cleanB) a.push('きれいな皿を並べて、長押しで前菜を盛ります');
      } else if (st.type === 'bench') {
        if (!h && st.item) G(holdName(st.item) + 'を取る');
        if (h && !st.item) G('置く');
      } else if (st.type === 'rack') {
        var cleanH = h && h.k === 'plates' && !h.dirty;
        if (!h && st.plates > 0) G('皿を取る（残り' + st.plates + '枚）');
        if (cleanH && st.plates > 0 && h.n < D.player.plateCarryMax) G('もう1枚取る（いま' + h.n + '枚）');
        if (cleanH && h.n >= D.player.plateCarryMax) a.push(D.player.plateCarryMax + '枚まで持てます');
        if (cleanH) W('皿を戻す');
        if (st.plates === 0 && !cleanH) a.push('<b style="color:#ffb4b0">皿がありません</b>');
      } else if (st.type === 'sink' || st.type === 'washer') {
        var cleanS = h && h.k === 'plates' && !h.dirty;
        if (h && h.k === 'plates' && h.dirty) G('汚れた皿を入れる');
        if (!h && st.clean > 0) G('きれいな皿を取る');
        if (cleanS && st.clean > 0 && h.n < D.player.plateCarryMax) G('もう1枚取る（いま' + h.n + '枚）');
        if (st.type === 'sink' && st.dirty > 0) W('洗う（残り' + st.dirty + '枚）');
        else if (cleanS) W('皿を戻す');
        if (st.type === 'washer' && st.dirty > 0) a.push('自動で洗っています（' + st.dirty + '枚）');
      } else if (st.type === 'trash') {
        if (h && h.k === 'dish') G('料理を捨てる（皿は手に残る・ロス）');
        else if (h && h.k !== 'plates') G('捨てる（ロスになります）');
      }
    } else if (tg.k === 'slot') {
      var c = tg.c, it = c.slots[tg.i];
      name = '鉄板 ' + c.id;
      var dirty = c.dirty.some(function (d) { return d > 0; });
      var riceOk = function (r) { return r && r.k === 'rice' && E.classify(r) === 'ok'; };
      if (h && (h.k === 'steak' || (h.k === 'rice' && !riceOk(h))) && !it && !c.needsScrape) G('焼く');
      if (h && h.k === 'plates' && !h.dirty && it) {
        var cl = E.classify(it);
        if (cl === 'raw') a.push('まだ生です');
        else if (cl === 'burnt') a.push('焦げています');
        else {
          var here = E.servableGuests(s, c, it);
          var where = here.length ? null : E.whereServable(s, it, c);
          var subst = here.length && !here.some(function (o) { return o.subst === null; }) ? here[0].subst : null;
          if (here.length) G('盛って出す（' + (it.k === 'rice' ? 'ご飯' : D.doneness.name[cl]) + (subst === 'up' ? '・サービス' : subst === 'down' ? '・取り違え' : '') + '）');
          else if (where) G('お皿に盛る（鉄板' + where + 'の分）');
          else a.push(esc(E.whyNot(s, c, it)));
        }
      }
      if (h && h.k === 'dish') {
        var hereD = E.servableGuests(s, c, h.food);
        if (hereD.length) G('お出しする');
        else { a.push(esc(E.whyNot(s, c, h.food))); if (!it && !c.needsScrape) G('鉄板に戻す'); }
      }
      // ガーリックライス：焼き上がったら手ぶらでも、手に持っていても、そのまま出せる
      if (!h && riceOk(it) && E.servableGuests(s, c, it).length) G('ご飯をお出しする');
      if (riceOk(h)) { if (E.servableGuests(s, c, h).length) G('ご飯をお出しする'); else a.push(esc(E.whyNot(s, c, h))); }
      if (h && (h.k === 'drink' || h.k === 'apps')) {
        var sv = E.servableGuests(s, c, h);
        if (sv.length) G(h.k === 'drink' ? D.drinks[sv[0].gu.order.drink].name + 'を出す' : '前菜を出す'); else a.push(esc(E.whyNot(s, c, h)));
      }
      if ((!h || (h.k === 'plates' && h.dirty)) && dirty) G('汚れた皿を回収');
      else if (!h && it && !(riceOk(it) && E.servableGuests(s, c, it).length)) G(holdName(it) + 'を下げる');
      var w = E.workable(s, p);
      if (w && w.kind === 'mc') W(w.stage === 'last' ? '最後の肉でフランベ・思い出づくり' : w.stage === 'mid' ? '思い出づくり（まだ食事の途中）' : '思い出づくり（食事の前は撮りづらい）');
      if (w && w.kind === 'scrape') W('鉄板を掃除');
      if (c.needsScrape && dirty) a.push('皿を回収して掃除すると、次のお客様が座れます');
    }
    var out = '<b>' + esc(name) + '</b>';
    if (a.length) out += '<span class="sep">｜</span>' + a.join('<span class="sep">／</span>');
    if (h) out += '<span class="sep">｜</span>手に：' + holdName(h);
    return out;
  }
  function holdName(h) {
    if (!h) return '';
    if (h.k === 'plates') return (h.dirty ? '汚れた皿' : '皿') + '×' + h.n;
    if (h.k === 'steak') {
      var cl = E.classify(h);
      var nm = E.meatName(h.m);
      return nm + (cl === 'raw' ? '' : '（' + D.doneness.name[cl] + '）') + ((h.n || 1) > 1 ? '×' + h.n : '');
    }
    if (h.k === 'rice') return 'ご飯' + ((h.n || 1) > 1 ? '×' + h.n : '');
    if (h.k === 'drink') {
      // 混ざっていれば「水・ビール×2」のように種類ごとに
      var cnt = {}, order = [];
      E.drinkList(h).forEach(function (d) { if (!cnt[d]) order.push(d); cnt[d] = (cnt[d] || 0) + 1; });
      return order.map(function (d) { return D.drinks[d].name + (cnt[d] > 1 ? '×' + cnt[d] : ''); }).join('・');
    }
    if (h.k === 'apps') return '前菜' + ((h.n || 1) > 1 ? '×' + h.n : '');
    if (h.k === 'dish') return holdName(h.food) + 'の皿' + ((h.n || 1) > 1 ? '（＋皿' + (h.n - 1) + '枚）' : '');
    if (h.k === 'station') return D.stations[h.st.type].name;
    return '';
  }
  U.holdName = holdName;

  // ---------- トースト ----------
  U.toast = function (text, kind) {
    var now = Date.now();
    if (toastSeen[text] && now - toastSeen[text] < 1500) return;
    toastSeen[text] = now;
    var host = el.modalWrap.hidden ? el.toasts : el.modal;
    var t = document.createElement('div');
    t.className = 'toast ' + (kind || '');
    t.textContent = text;
    if (host === el.modal) { t.style.position = 'sticky'; t.style.top = '0'; t.style.margin = '0 auto 8px'; t.style.width = 'max-content'; host.prepend(t); }
    else host.appendChild(t);
    while (el.toasts.children.length > 3) el.toasts.removeChild(el.toasts.firstChild);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, kind === 'bad' ? 2600 : 1900);
  };

  // ---------- モーダル ----------
  var lastFocus = null;
  function open(html, firstSel) {
    lastFocus = document.activeElement;
    el.modal.innerHTML = html;
    el.modalWrap.hidden = false;
    // いつも上から見せる。最初のボタンが画面の外（遊び方の末尾の「戻る」など）なら、画面そのものにフォーカスする（監査 F05：末尾へ飛んでいた）
    el.modal.scrollTop = 0; el.modalWrap.scrollTop = 0;
    var f = firstSel ? el.modal.querySelector(firstSel) : el.modal.querySelector('button');
    var box = el.modal.getBoundingClientRect(), fr = f && f.getBoundingClientRect();
    var seen = fr && fr.bottom <= Math.min(box.bottom, window.innerHeight) + 1;
    (seen ? f : el.modal).focus({ preventScroll: true });
  }
  U.close = function () {
    el.modalWrap.hidden = true; el.modal.innerHTML = '';
    // ゲームの操作ボタン（Ⅱ・開店・画面ボタン）にはフォーカスを戻さない（Space で誤って押されるため）
    var game = lastFocus && lastFocus.closest && (lastFocus.closest('#hud') || lastFocus.closest('#banner') || lastFocus.closest('#touch'));
    if (game) { if (lastFocus.blur) lastFocus.blur(); }
    else if (lastFocus && lastFocus.focus && document.body.contains(lastFocus)) try { lastFocus.focus(); } catch (e) { /* 無視 */ }
  };
  U.isOpen = function () { return !el.modalWrap.hidden; };
  function trapFocus(e) {
    if (e.key !== 'Tab') return;
    var f = el.modal.querySelectorAll('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])');
    if (!f.length) return;
    var first = f[0], lastEl = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastEl.focus(); }
    else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); first.focus(); }
  }
  function on(sel, fn) { var b = el.modal.querySelector(sel); if (b) b.addEventListener('click', fn); }
  function onAll(sel, fn) { el.modal.querySelectorAll(sel).forEach(function (b) { b.addEventListener('click', function () { fn(b); }); }); }

  // タイトル
  U.title = function (hasSave, saveDay) {
    open(
      '<div class="title-hero">' +
      '<div class="kicker">神戸牛 鉄板焼き</div>' +
      '<h1 id="modalTitle">和牛の刀 鉄板十五日</h1>' +
      '<p>お客様の目の前で焼き、皿を回し、思い出をつくる。15日間、店を回し切りましょう。</p>' +
      '</div>' +
      '<div class="title-actions">' +
      (hasSave ? '<button class="btn primary" data-a="continue" type="button">続きから（' + saveDay + '日目の開店前）</button>' : '') +
      '<button class="btn ' + (hasSave ? '' : 'primary') + '" data-a="new" type="button">はじめから</button>' +
      '<button class="btn ghost" data-a="howto" type="button">遊び方</button>' +
      '</div>' +
      '<div class="title-meta">' + (act.installKind() ? '<button class="btn ghost sm" data-a="install" type="button">アプリとして入れる（全画面）</button>' : '') +
      '<button class="btn ghost sm" data-a="settings" type="button">設定</button></div>'
    );
    on('[data-a="install"]', function () { act.install(); });
    on('[data-a="continue"]', function () { act.continueGame(); });
    on('[data-a="new"]', function () { act.newGame(); });
    on('[data-a="howto"]', function () { U.howto(function () { act.toTitle(); }); });
    on('[data-a="settings"]', function () { U.settings(function () { act.toTitle(); }); });
  };

  // 難易度（肉の焼けるスピード）を選ぶ
  U.difficulty = function (pick, back) {
    var html = '<h2 id="modalTitle">難易度を選ぶ</h2><p class="lead">肉の焼けるスピードが変わります。ハードと鬼ムズは、お肉が部位ごとに分かれます。あとから変えるときは、はじめからやり直します。</p><div class="cards diff-cards">';
    D.difficultyOrder.forEach(function (id) {
      var d = D.difficulties[id];
      html += '<button class="card" type="button" data-diff="' + id + '"><span class="name">' + d.name + '</span><span class="desc">' + esc(d.desc) + '</span></button>';
    });
    html += '</div><div class="actions"><button class="btn ghost" data-a="back" type="button">戻る</button></div>';
    open(html, '[data-diff="normal"]');
    onAll('[data-diff]', function (b) { pick(b.getAttribute('data-diff')); });
    on('[data-a="back"]', back);
  };

  U.howto = function (back) {
    open(
      '<h2 id="modalTitle">遊び方</h2>' +
      '<p class="lead">ボタンは2つだけ。「つかむ」と「作業（長押し）」です。</p>' +
      '<ol class="howto">' +
      '<li><b>コース</b><span>お客様はコースを頼みます。侍コース＝サーロイン・別格・和サーロ、将軍コース（6日目から）＝シャトー・フィレ、大将軍コース＝エンペラー（カード）・皇帝ロイン・皇帝ブリアン（鬼ムズ11日目）。注文の札の上の色と文字が部位です。</span></li>' +
      '<li><b>1. 肉を取る</b><span>部位のショーケースで「つかむ」と、切り分けた肉が1枚。続けて押すと4枚まで重ねて持てます。戻すときは作業（長押し）。</span></li>' +
      '<li><b>前菜</b><span>まな板にきれいな皿を並べ（4皿まで）、作業（長押し）でまとめて盛ります。重ねて持って1皿ずつお出しします。侍は1品、将軍・大将軍は2品。食べ終えた前菜の皿は、席に下がります。</span></li>' +
      '<li><b>ドリンク</b><span>ひとり1杯。水・ビールのサーバーで「つかむ」（4杯まで重ねて持てる）。水は無料、ビールは安い。夜の店で酒棚・ワインセラーを買うと、日本酒・ワインを頼むお客様が出て、売上が大きく上がります。</span></li>' +
      '<li><b>2. 鉄板で焼く</b><span>お客様の前の鉄板に置きます。リングの太いところが、注文の焼き加減です。</span></li>' +
      '<li><b>3. 皿を持って鉄板へ</b><span>皿を持って焼けた肉の前で「つかむ」。盛り付けて、そのままお出しします。ほかの鉄板のお客様の分なら、皿に盛って運べます。</span></li>' +
      '<li><b>皿の扱い</b><span>皿棚で「つかむ」を押すたびに1枚ずつ取れます（6枚まで重ねて持てる）。1皿出すごとに1枚減ります。戻すときは「作業（長押し）」。</span></li>' +
      '<li><b>取り違え</b><span>エンペラーをふつうのお客様に出すと「サービス」（差額はロス）。ふつうの肉をエンペラーのお客様に出すと★が下がります。ハラルのお客様にはハラル牛だけ。</span></li>' +
      '<li><b>部位（どの難易度も）</b><span>お肉は初日からサーロイン・別格・和サーロに分かれ、6日目からシャトー・フィレ、鬼ムズは11日目から皇帝ロイン・皇帝ブリアンも。部位ごとのショーケースから取ります。注文の札の上の色と、肉に刺した旗の色で見分けます。部位ちがいは取り違え（★−1）。シャトー・フィレ・皇帝ブリアンは厚いので、焼けるのが少し遅い。</span></li>' +
      '<li><b>4. 片付ける</b><span>帰ったお客様の皿を回収して洗い場へ。カウンターの全員が帰ったら、鉄板を掃除します（作業・長押し）。</span></li>' +
      '<li><b>相席と入口</b><span>4人席に空きが並んでいれば、待っている組がその人数ぶん隣に座ります（汚れた皿が残る席には座れません）。座れない人数なら外で待ちます。入口の札が、待っている組の人数です。</span></li>' +
      '<li><b>ガーリックライス</b><span>焼き上がったら、手ぶらで「つかむ」とその場でお出しします。手に持っても、頼んだお客様の前でお出しできます。</span></li>' +
      '<li><b>思い出づくり（フランベ）</b><span>肉をお出しして、最後の肉をお出ししたら、お客様の前の鉄板で作業（長押し）。フランベの炎が上がり、思い出ができます。「フランベどき」の札が合図です。食事の前に撮ると時間がかかり、★は増えず、チップもわずか（最後の肉の約5分の1）です。最後の肉の思い出は、チップが多く、写真つきの口コミになりやすい（評判に2回ぶん効く）。★5は思い出づくりをした組だけ。記念日のお客様には必須です。</span></li>' +
      '<li><b>チップ</b><span>★4以上の組からいただけます。組の前（鉄板の内側）に立って焼いたり話したりした時間が長いほど、もらいやすく額も増えます。スタッフが前にいた時間は半分に数えます。</span></li>' +
      '<li><b>夜</b><span>利益で設備を買い、4日目からはスタッフも雇えます（焼き担当かキッチン担当のどちらか1人と、MC担当）。3日ごとに「お店の変化カード」を選びます。</span></li>' +
      '</ol>' +
      '<h3>操作</h3>' +
      '<dl class="keys">' +
      '<dt>移動</dt><dd>矢印キー／画面のスティック／ゲームパッド</dd>' +
      '<dt>つかむ・置く・出す</dt><dd>Z ／ 画面の「つかむ」／ ゲームパッドの A</dd>' +
      '<dt>作業（長押し）</dt><dd>A ／ 画面の「作業」／ ゲームパッドの X</dd>' +
      '<dt>開店</dt><dd>Enter ／ 「開店する」</dd>' +
      '<dt>一時停止</dt><dd>Esc ／ 右上の Ⅱ</dd>' +
      '</dl>' +
      '<p class="note" style="margin-top:16px">クレーム（料理を待ち切れずに帰ったお客様）が1日3件になると、その日は失敗です。開店前からやり直せます。入口で待ち切れずに帰ったお客様はクレームではなく、売上を逃した「機会損失」として日報に出ます。</p>' +
      '<div class="actions"><button class="btn primary" data-a="back" type="button">戻る</button></div>'
    );
    on('[data-a="back"]', back);
  };

  // iPhone・iPad：Safari の共有ボタンから「ホーム画面に追加」すると、全画面のアプリとして開く
  U.installIOS = function (back) {
    open(
      '<h2 id="modalTitle">アプリとして入れる</h2>' +
      '<p>ホーム画面に置くと、ブラウザの枠のない全画面で遊べます。一度開けば、電波がなくても遊べます。</p>' +
      '<ol class="steps">' +
      '<li>Safari で、このページを開く（ほかのアプリの中のブラウザでは追加できません）</li>' +
      '<li>画面下（iPad は右上）の<b>共有ボタン</b>（四角から上向きの矢印）を押す</li>' +
      '<li><b>「ホーム画面に追加」</b>を押し、右上の<b>「追加」</b>を押す</li>' +
      '<li>ホーム画面の「鉄板十五日」から開く</li>' +
      '</ol>' +
      '<div class="actions"><button class="btn primary" data-a="back" type="button">戻る</button></div>'
    );
    on('[data-a="back"]', back);
  };

  U.settings = function (back) {
    var st = act.getSettings();
    var row = function (id, label, val, desc) {
      return '<div class="setting-row"><div><b>' + label + '</b>' + (desc ? '<div class="note">' + desc + '</div>' : '') + '</div>' +
        '<button class="btn sm toggle" type="button" data-set="' + id + '" aria-pressed="' + (val ? 'true' : 'false') + '">' + (val ? 'オン' : 'オフ') + '</button></div>';
    };
    open(
      '<h2 id="modalTitle">設定</h2>' +
      row('sound', '音', st.sound, '鉄板の音・効果音') +
      row('hints', '「次にやること」のヒント', st.hints, '1〜2日目は自動でオン') +
      row('reduced', '動きを減らす', st.reduced, '画面の揺れと粒の演出を止めます') +
      row('touch', '画面のボタン', st.touch, 'スマホ・タブレットでは自動でオン') +
      row('lite', '軽量モード', st.lite, '電池と発熱をおさえます（画面の細かさ・粒を減らす）。スマホ・タブレットでは自動でオン') +
      '<div class="actions"><button class="btn primary" data-a="back" type="button">戻る</button></div>'
    );
    onAll('[data-set]', function (b) {
      var id = b.getAttribute('data-set');
      var v = !(b.getAttribute('aria-pressed') === 'true');
      act.setSetting(id, v);
      b.setAttribute('aria-pressed', v ? 'true' : 'false'); b.textContent = v ? 'オン' : 'オフ';
    });
    on('[data-a="back"]', back);
  };

  U.pause = function (s) {
    open(
      '<h2 id="modalTitle">一時停止</h2>' +
      '<p class="lead">' + s.day + '日目（' + (D.difficulties[s.difficulty] || D.difficulties.normal).name + '）。手を止めている間、お客様も待っています。</p>' +
      '<div class="title-actions">' +
      '<button class="btn primary" data-a="resume" type="button">再開する</button>' +
      '<button class="btn" data-a="howto" type="button">遊び方</button>' +
      '<button class="btn" data-a="settings" type="button">設定</button>' +
      (s.phase === 'service' ? '<button class="btn ghost" data-a="retry" type="button">この日を開店前からやり直す</button>' : '') +
      '<button class="btn ghost" data-a="title" type="button">タイトルへ（' + (act.saveStatus() === false ? '保存できていません。続きからは遊べません' : '開店前の状態は保存済み') + '）</button>' +
      '</div>'
    );
    on('[data-a="resume"]', function () { act.resume(); });
    on('[data-a="howto"]', function () { U.howto(function () { U.pause(s); }); });
    on('[data-a="settings"]', function () { U.settings(function () { U.pause(s); }); });
    on('[data-a="retry"]', function () { act.retry(); });
    on('[data-a="title"]', function () { act.toTitle(); });
  };

  // 日報
  function plTable(r) {
    var rate = r.revenue ? Math.round(r.cost / r.revenue * 100) : 0;
    return '<table class="pl"><tbody>' +
      '<tr><td>売上</td><td class="plus">' + signed(r.revenue) + '</td></tr>' +
      '<tr><td>原価（肉・ご飯・酒）</td><td class="minus">' + signed(-r.cost) + '</td></tr>' +
      '<tr class="sub"><td>　うちロス（焦がし・余り）</td><td>' + yen(r.loss) + '</td></tr>' +
      '<tr class="sub"><td>　原価率（売上に対する原価）</td><td>' + rate + '%</td></tr>' +
      '<tr><td>人件費</td><td class="minus">' + signed(-r.labor) + '</td></tr>' +
      '<tr><td>固定費（家賃・光熱）</td><td class="minus">' + signed(-r.fixed) + '</td></tr>' +
      '<tr class="total"><td>利益</td><td class="' + (r.profit >= 0 ? 'plus' : 'minus') + '">' + signed(r.profit) + '</td></tr>' +
      '</tbody></table>';
  }
  function kpis(s, r) {
    var k = function (lab, val, sub) { return '<div class="kpi"><span class="lab">' + lab + '</span><b>' + val + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>'; };
    return '<div class="kpis">' +
      k('お客様', r.guests + '名', r.groups + '組') +
      k('★の平均', r.avgRating ? r.avgRating.toFixed(1) : '—', '口コミ +' + r.reviewsGood + (r.photoReviews ? '（写真つき ' + r.photoReviews + '）' : '')) +
      k('思い出づくり', r.mc + '組', '最後の肉で ' + (r.mcLast || 0) + '組・TIP ' + yen(r.tips)) +
      k('評判', '★' + r.repAfter.toFixed(1), (r.repAfter >= r.repBefore ? '+' : '−') + Math.abs(r.repAfter - r.repBefore).toFixed(2)) +
      k('焼き加減ちがい', (r.wrongDone != null ? r.wrongDone : r.wrong) + '枚', '部位ちがい ' + (r.wrongPart || 0) + '枚・焦がし ' + r.burnt + '枚') +
      k('入れなかった組', r.lostGroups + '組', r.lostSales ? '約' + yen(r.lostSales) : '') +
      '</div>';
  }
  // 今日のふりかえり：あなたの手順 → 結果 → 問い（答えは書かない）→ 概念の名前
  function reflect(r) {
    var b = r.bottleneck, f = r.reflection;
    if (!f) return '<div class="reflect"><span class="lab">今日のふりかえり</span><p>' + esc(b.q) + '</p><span class="concept">' + esc(b.concept) + '</span></div>';
    var steps = '<ol class="rf-steps">' + f.steps.map(function (st) {
      return '<li>' + (st.t ? '<b class="rf-time">' + esc(st.t) + '</b>' : '') + '<span>' + esc(st.text) + '</span></li>';
    }).join('') + '</ol>';
    var use = f.timeUse && f.timeUse.length ? '<div class="rf-use" aria-label="今日の時間の使い方">' +
      '<div class="rf-bar">' + f.timeUse.map(function (g) { return '<i class="u-' + g.id + '" style="width:' + (g.share * 100).toFixed(1) + '%"></i>'; }).join('') + '</div>' +
      '<ul class="rf-legend">' + f.timeUse.map(function (g) { return '<li><i class="u-' + g.id + '"></i>' + esc(g.label) + ' ' + Math.round(g.share * 100) + '%</li>'; }).join('') + '</ul></div>' : '';
    return '<div class="reflect"><span class="lab">今日のふりかえり</span>' +
      '<h3 class="rf-h">あなたの手順</h3>' + steps +
      (f.result ? '<p class="rf-result"><span>結果</span>' + esc(f.result) + '</p>' : '') +
      use +
      '<h3 class="rf-h">問いかけ</h3><p class="rf-q">' + esc(f.q) + '</p>' +
      (f.next ? '<p class="rf-next">' + esc(f.next) + '</p>' : '') +
      '<span class="concept">' + esc(f.concept) + '</span></div>';
  }
  U.report = function (s) {
    var r = s.report;
    var cash = s.cash;
    open(
      '<h2 id="modalTitle">' + r.day + '日目の日報</h2>' +
      '<p class="lead">閉店しました。所持金 ' + yen(cash) + '</p>' +
      '<div class="report-grid">' + plTable(r) + kpis(s, r) + '</div>' +
      reflect(r) +
      '<div class="actions"><button class="btn primary" data-a="next" type="button">' + (r.day >= D.day.total ? '15日間の結果を見る' : '夜の買い出しへ') + '</button></div>'
    );
    on('[data-a="next"]', function () { act.afterReport(); });
  };

  U.failed = function (s) {
    var r = s.report;
    open(
      '<h2 id="modalTitle">' + r.day + '日目は、ここで閉店です</h2>' +
      '<p class="lead">料理を待ち切れずに帰ったお客様が' + r.complaints + '組になりました。</p>' +
      '<div class="report-grid">' + plTable(r) + kpis(s, r) + '</div>' +
      reflect(r) +
      '<div class="actions"><button class="btn ghost" data-a="title" type="button">タイトルへ</button><span class="spacer"></span>' +
      '<button class="btn primary" data-a="retry" type="button">' + r.day + '日目を開店前からやり直す</button></div>',
      '[data-a="retry"]'
    );
    on('[data-a="retry"]', function () { act.retry(); });
    on('[data-a="title"]', function () { act.toTitle(); });
  };

  // カード
  U.cards = function (s) {
    var html = '<h2 id="modalTitle">' + s.day + '日目の夜 — お店の変化</h2>' +
      '<p class="lead">明日から、どちらかがお店に加わります。良いことには、必ず大変なことが付いてきます。</p><div class="cards">';
    s.cardPair.forEach(function (id) {
      var c = E.cardDef(id);
      html += '<button class="card" type="button" data-card="' + id + '">' +
        '<span class="kind ' + c.kind + '">' + (c.kind === 'dish' ? '料理' : 'お客様') + '</span>' +
        '<span class="name">' + esc(c.name) + '</span>' +
        '<span class="good">' + esc(c.good) + '</span>' +
        '<span class="hard">' + esc(c.hard) + '</span></button>';
    });
    html += '</div>';
    if (s.cards.length) html += '<p class="note" style="margin-top:16px">いまのお店：' + s.cards.map(function (id) { return E.cardDef(id).name; }).join('・') + '</p>';
    open(html);
    onAll('[data-card]', function (b) { act.pickCard(b.getAttribute('data-card')); });
  };

  // 買い出し
  U.shop = function (s) {
    var html = '<h2 id="modalTitle">' + s.day + '日目の夜 — 買い出し</h2>' +
      '<div class="cashline"><span class="lead">所持金</span><b>' + yen(s.cash) + '</b></div>' +
      '<div class="offers">';
    s.offers.forEach(function (o, i) {
      var it = E.shopItem(o.id);
      var can = !o.sold && s.cash >= it.price;
      html += '<div class="offer' + (o.sold ? ' sold' : '') + '"><div><div class="name">' + esc(it.name) + '</div><div class="desc">' + esc(it.desc) + '</div></div>' +
        '<div><div class="price">' + yen(it.price) + '</div>' +
        (o.sold ? '<span class="note">買いました</span>' : can ? '<button class="btn sm primary" type="button" data-buy="' + i + '">買う</button>' :
          '<span class="note">あと ' + yen(it.price - s.cash) + '</span>') + '</div></div>';
    });
    html += '</div>';
    var rc = E.rerollCost(s);
    html += '<div class="actions" style="justify-content:flex-start;margin-top:12px"><button class="btn sm ghost" type="button" data-a="reroll"' + (s.cash >= rc ? '' : ' disabled') + '>品ぞろえを入れ替える（' + yen(rc) + '）</button></div>';
    html += '<h3>スタッフ（雇っている間、毎日人件費がかかります）</h3>';
    if (E.staffUnlocked(s)) {
      html += '<p class="note">焼き担当とキッチン担当は、どちらか1人だけ雇えます。もう片方を雇うと入れ替えになります。</p><div class="staff">';
      Object.keys(D.staff).forEach(function (id) {
        var sd = D.staff[id], onv = s.staff[id];
        // 同じ枠（焼き・キッチン）の、もう片方を雇っているなら「入れ替える」
        var other = sd.slot && Object.keys(D.staff).filter(function (o) { return o !== id && D.staff[o].slot === sd.slot && s.staff[o]; })[0];
        html += '<div class="staff-row"><div><div class="name">' + esc(sd.name) + '　<span class="num">日給 ' + yen(sd.wage) + '</span></div><div class="desc">' + esc(sd.desc) + '</div></div>' +
          '<button class="btn sm toggle" type="button" data-staff="' + id + '" aria-pressed="' + (onv ? 'true' : 'false') + '">' + (onv ? '雇っている' : other ? D.staff[other].short + 'と入れ替える' : '雇う') + '</button></div>';
      });
      html += '</div>';
    } else {
      html += '<p class="note">' + D.day.staffFromDay + '日目から雇えます。</p>';
    }
    html += '<p class="note" style="margin-top:12px">買った設備は、次の開店準備で好きな場所へ動かせます。</p>' +
      '<div class="actions"><button class="btn primary" data-a="next" type="button">' + (s.day + 1) + '日目の開店準備へ</button></div>';
    open(html, '[data-a="next"]');
    onAll('[data-buy]', function (b) { act.buy(+b.getAttribute('data-buy')); });
    onAll('[data-staff]', function (b) { var id = b.getAttribute('data-staff'); act.setStaff(id, !(b.getAttribute('aria-pressed') === 'true')); });
    on('[data-a="reroll"]', function () { act.reroll(); });
    on('[data-a="next"]', function () { act.nextDay(); });
  };

  // 結果
  function radar(axes) {
    var keys = D.axes, n = keys.length, cx = 160, cy = 150, R = 105;
    var pt = function (i, r) { var a = -Math.PI / 2 + i * Math.PI * 2 / n; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; };
    var grid = '';
    [0.25, 0.5, 0.75, 1].forEach(function (k) {
      grid += '<polygon points="' + keys.map(function (_, i) { return pt(i, R * k).join(','); }).join(' ') + '" fill="none" stroke="rgba(255,255,255,.12)" />';
    });
    var spokes = keys.map(function (_, i) { var p = pt(i, R); return '<line x1="' + cx + '" y1="' + cy + '" x2="' + p[0] + '" y2="' + p[1] + '" stroke="rgba(255,255,255,.08)"/>'; }).join('');
    var shape = keys.map(function (k, i) { return pt(i, R * Math.max(0.04, axes[k.id] / 100)).join(','); }).join(' ');
    var labels = keys.map(function (k, i) {
      var p = pt(i, R + 26);
      return '<text x="' + p[0] + '" y="' + p[1] + '" fill="#f3ede4" font-size="13" font-weight="700" text-anchor="middle" dominant-baseline="middle">' + k.name + '</text>' +
        '<text x="' + p[0] + '" y="' + (p[1] + 16) + '" fill="#b9b2a7" font-size="12" text-anchor="middle" dominant-baseline="middle">' + axes[k.id] + '</text>';
    }).join('');
    return '<svg class="radar" viewBox="0 0 320 310" role="img" aria-label="店長スタイルの6軸">' + grid + spokes +
      '<polygon points="' + shape + '" fill="rgba(201,164,92,.28)" stroke="#c9a45c" stroke-width="2"/>' + labels + '</svg>';
  }
  U.result = function (s) {
    var f = E.finalScore(s);
    open(
      '<h2 id="modalTitle">15日間、お疲れさまでした</h2>' +
      '<div class="result-grid"><div>' +
      '<div class="lead">あなたの店長スタイル</div>' +
      '<div class="style-name">' + esc(f.style.name) + '</div>' +
      '<p>' + esc(f.style.line) + '</p>' +
      '<div class="kpis" style="margin-top:16px">' +
      '<div class="kpi"><span class="lab">15日の利益</span><b>' + yen(f.profit) + '</b></div>' +
      '<div class="kpi"><span class="lab">お客様</span><b>' + f.guests + '名</b></div>' +
      '<div class="kpi"><span class="lab">TIP</span><b>' + yen(f.tips) + '</b></div>' +
      '<div class="kpi"><span class="lab">やり直し</span><b>' + f.retries + '回</b></div>' +
      '</div></div><div>' + radar(f.axes) + '</div></div>' +
      '<h3>自分への3つの問い</h3><ol class="questions">' + D.finalQuestions.map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ol>' +
      '<div class="actions"><button class="btn ghost" data-a="title" type="button">タイトルへ</button><button class="btn primary" data-a="new" type="button">もう一度、1日目から</button></div>'
    );
    on('[data-a="title"]', function () { act.toTitle(); });
    on('[data-a="new"]', function () { act.newGame(); });
  };

  U.showTouch = function (show) { el.touch.hidden = !show; };
})(WK);
