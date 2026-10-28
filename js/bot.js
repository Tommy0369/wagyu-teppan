/* 和牛の刀 鉄板十五日 — BOT
 * 人と同じ入力（移動・つかむ・作業）だけで遊ぶ自動操作。
 * 使い道：①バランス検証（tools/sim.js） ②タイトル画面のデモ ③1〜2日目の「次にやること」ヒント
 */
var WK = (typeof WK !== 'undefined') ? WK : {};
if (typeof module !== 'undefined' && !WK.Engine) WK = require('./engine.js');

(function (WK) {
  'use strict';
  var D = WK.DATA, E = WK.Engine;
  var B = WK.Bot = {};
  var MW = E.MW;

  B.create = function (opts) {
    opts = opts || {};
    return {
      mc: opts.mc || 'slack',          // always / slack / never
      react: opts.react != null ? opts.react : 0.12, // 次の判断までの間（秒）
      mistake: opts.mistake || 0,      // 判断をわざと遅らせる確率
      task: null, path: null, cool: 0, grabPulse: false, lastPos: null, stuckT: 0, seed: opts.seed || 1
    };
  };

  function brand(b) { b.seed = (b.seed * 1103515245 + 12345) >>> 0; return b.seed / 4294967296; }

  // ---------- 状態を読む ----------
  function waitingGroups(s) {
    // 相席なら、1つのカウンターに複数の組
    var out = [];
    s.counters.forEach(function (c) { if (c.unlocked) E.groupsAt(s, c).forEach(function (g) { out.push({ c: c, g: g }); }); });
    return out.filter(function (o) { return o.g && o.g.state === 'waiting'; });
  }
  // 肉の種類（神戸牛・エンペラー・ハラル・部位）＋ご飯・酒の数を0で
  function zeroCounts() { var o = { rice: 0, app: 0 }; Object.keys(D.meats).concat(Object.keys(D.drinks)).forEach(function (m) { o[m] = 0; }); return o; }
  // 担当ごとにする仕事（スタッフ）。担当なし（自分・検証の Bot）は全部
  var ROLE = {
    grill: { plates: 1, burnt: 1, meat: 1, rice: 1, clean: 1, wash: 1 },   // 手が空いたら鉄板の掃除・皿の回収と洗い物も（2026-10-28）
    kitchen: { wash: 1, clean: 1, apps: 1, drinks: 1 },
    mc: { mc: 1 }
  };
  function roleCan(b) { return function (cat) { return !b || !b.role || !!ROLE[b.role][cat]; }; }
  B.ROLE = ROLE;
  function needsOf(s, self) {
    // 種類ごとの「まだ出していない数」と、仕込み中の数
    var need = zeroCounts();
    waitingGroups(s).forEach(function (o) {
      o.g.guests.forEach(function (gu) {
        if (!gu.got.main) need[gu.order.main]++;
        if (gu.order.rice && !gu.got.rice) need.rice++;
        need.app += Math.max(0, (gu.order.apps || 0) - (gu.got.apps || 0));
        if (gu.order.drink && !gu.got.drink) need[gu.order.drink]++;
      });
    });
    var pipe = zeroCounts();
    var count = function (it) {
      if (!it) return;
      if (it.k === 'steak' && E.classify(it) !== 'burnt') pipe[it.m] += (it.n || 1);
      if (it.k === 'rice' && E.classify(it) !== 'burnt') pipe.rice++;
      if (it.k === 'drink') pipe[it.d] += (it.n || 1);
      if (it.k === 'apps') pipe.app += (it.n || 1);
    };
    s.counters.forEach(function (c) { c.slots.forEach(count); });
    s.stations.forEach(function (st) { count(st.item); if (st.type === 'board' && st.item && st.item.k === 'plates') pipe.app += st.item.n; });
    s.players.forEach(function (p) { count(p.hold); });
    // ほかの人が取りに向かっている分（同じものを2人で取りに行かない）
    s.players.forEach(function (p) { if (p !== self && p.claim && p.claim.k in pipe) pipe[p.claim.k] += p.claim.n || 0; });
    return { need: need, pipe: pipe };
  }
  B.needsOf = needsOf;

  function wantedDones(s, c, m) {
    return E.groupsAt(s, c).reduce(function (a, g) { return a.concat(wantedDonesG(g, m)); }, []);
  }
  function wantedDonesG(g, m) {
    if (!g || g.state !== 'waiting') return [];
    return g.guests.filter(function (gu) { return gu.order.main === m && !gu.got.main; }).map(function (gu) { return gu.order.done; });
  }

  // 皿を持って行けば今出せる鉄板（焼き加減が合うもの優先）
  function readySlots(s, soon) {
    var out = [];
    s.counters.forEach(function (c) {
      if (!c.unlocked) return;
      c.slots.forEach(function (it, i) {
        if (!it || (it.k !== 'steak' && it.k !== 'rice')) return;
        var cl = E.classify(it);
        if (cl === 'burnt') return;
        var wants = E.guestsWanting(s, c, it);
        if (!wants.length) return;
        if (it.k === 'rice') { if (cl === 'ok') out.push({ c: c, i: i, pri: 1, exact: true }); else if (soon && D.rice.ready - it.t < soon) out.push({ c: c, i: i, pri: 0.5, wait: true }); return; }
        var dones = wantedDones(s, c, it.m);
        var th = E.thresholds(it.m);
        var heat = E.heat(s);
        if (dones.indexOf(cl) >= 0) { out.push({ c: c, i: i, pri: 2 + it.t, exact: true }); return; }
        // 欲しい焼き加減をもう過ぎた → 焦げる前に出す
        var order = ['rare', 'medium', 'well'];
        var maxWanted = Math.max.apply(null, dones.map(function (d) { return order.indexOf(d); }));
        if (cl !== 'raw' && order.indexOf(cl) > maxWanted) { out.push({ c: c, i: i, pri: 3 + it.t, exact: false }); return; }
        if (soon) {
          var minWanted = Math.min.apply(null, dones.map(function (d) { return order.indexOf(d); }));
          var startT = th[order[minWanted]];
          if (startT > it.t && (startT - it.t) / heat < soon) out.push({ c: c, i: i, pri: 0.5, wait: true });
        }
      });
    });
    return out.sort(function (a, b) { return b.pri - a.pri; });
  }

  // ---------- 道のり ----------
  function bfs(s, sx, sy, goals) {
    var key = function (x, y) { return y * MW + x; };
    var goalSet = {}; goals.forEach(function (g) { goalSet[key(g[0], g[1])] = true; });
    var prev = {}; prev[key(sx, sy)] = -1;
    var q = [[sx, sy]];
    while (q.length) {
      var c = q.shift();
      if (goalSet[key(c[0], c[1])]) {
        var path = [], k = key(c[0], c[1]);
        while (k !== -1) { path.unshift([k % MW, Math.floor(k / MW)]); k = prev[k]; }
        return path;
      }
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        var nx = c[0] + d[0], ny = c[1] + d[1], nk = key(nx, ny);
        if (prev[nk] === undefined && !E.isSolid(s, nx, ny)) { prev[nk] = key(c[0], c[1]); q.push([nx, ny]); }
      });
    }
    return null;
  }
  function standTiles(s, tx, ty) {
    return [[0, 1], [0, -1], [1, 0], [-1, 0]].map(function (d) { return [tx + d[0], ty + d[1]]; })
      .filter(function (t) { return !E.isSolid(s, t[0], t[1]); });
  }
  function distTo(s, p, tx, ty) {
    var path = bfs(s, Math.floor(p.x), Math.floor(p.y), standTiles(s, tx, ty));
    return path ? path.length : 999;
  }
  function nearestStation(s, p, pred) {
    var best = null, bd = 999;
    s.stations.forEach(function (st) { if (!pred(st)) return; var d = distTo(s, p, st.x, st.y); if (d < bd) { bd = d; best = st; } });
    return best;
  }
  function providerFor(kind) {
    for (var k in D.stations) if (D.stations[k].provides === kind) return k;
    return null;
  }

  // ---------- 次にやること ----------
  function T(x, y, act, label, extra) { var t = { x: x, y: y, act: act, label: label }; if (extra) for (var k in extra) t[k] = extra[k]; return t; }

  // 焼き担当を雇っている店長は、前菜・ドリンク・ご飯を先にやる（肉と、焼けた肉の皿は焼き担当に任せる）
  //  ただし焼く肉が3枚以上たまったら、肉も手伝う（焼き担当ひとりでは12席の肉が追いつかない）
  function grillHelping(s, b, nd) {
    if (b && b.role) return false;
    if (!s.players.some(function (q) { return q.staff && q.role === 'grill'; })) return false;
    var meatShort = 0;
    ['emperor', 'halal'].concat(E.cutsOpen(s), ['beef']).forEach(function (m) { meatShort += Math.max(0, (nd.need[m] || 0) - (nd.pipe[m] || 0)); });
    return meatShort < 3;
  }
  B.choose = function (s, p, b) {
    var h = p.hold;
    var mcPolicy = b ? b.mc : 'slack';
    var can = roleCan(b);
    var nd = needsOf(s, p);
    if (h) return chooseHolding(s, p, h, nd, b);
    var grillHelp = grillHelping(s, b, nd);
    var mcTaken = function (g) { return s.players.some(function (q) { return q !== p && q.claim && q.claim.k === 'mc' && q.claim.g === g.id; }); };
    // 思い出づくりは、全員に肉をお出しした組だけ（最後の肉のフランベ）。早く撮ると★もチップも増えない
    var mcReady = function (o) { return !o.g.mc && !mcTaken(o.g) && E.mcStage(o.g) === 'last'; };

    var ready = readySlots(s, 0);
    var burnt = null;
    s.counters.forEach(function (c) { c.slots.forEach(function (it, i) { if (it && E.classify(it) === 'burnt' && !burnt) burnt = { c: c, i: i }; }); });
    var queueWaiting = s.queue.length > 0;

    // 1) 焼けた肉を出すための皿（皿棚までの距離ぶん、早めに取りに行く）
    if (can('plates') && !grillHelp && E.cleanPlatesAvailable(s) > 0) {
      var src = nearestStation(s, p, function (st) { return (st.type === 'rack' && st.plates > 0) || ((st.type === 'sink' || st.type === 'washer') && st.clean > 0) || (st.item && st.item.k === 'plates' && !st.item.dirty && st.type !== 'board'); });
      if (src) {
        var lead = distTo(s, p, src.x, src.y) / D.player.speed * 2 + 0.8;
        var soonList = readySlots(s, lead);
        if (ready.length || soonList.length) return T(src.x, src.y, 'grab', '皿を取る（焼けた肉を出す）', { wantPlates: Math.min(Math.max(1, soonList.length), D.player.plateCarryMax) });
      }
    }
    // 皿が切れていて、焼けた肉か前菜に皿が要る → 先に洗う
    if (can('wash') && (ready.length || nd.need.app - nd.pipe.app > 0) && E.cleanPlatesAvailable(s) === 0) {
      var sinkW = nearestStation(s, p, function (st) { return st.type === 'sink' && st.dirty > 0; });
      if (sinkW) return T(sinkW.x, sinkW.y, 'work', '皿を洗う（皿がありません）');
    }
    // 2) 焦げを片付ける
    if (burnt && can('burnt')) return T(burnt.c.x0 + burnt.i, 3, 'grab', '焦げた肉を下げる');
    // 3) 記念日は先に思い出づくり
    if (mcPolicy !== 'never' && can('mc')) {
      var anniv = waitingOrEating(s).filter(function (o) { return o.g.anniv && mcReady(o); })[0];
      if (anniv) return T(anniv.c.x0 + (anniv.g.off || 0) + anniv.g.size - 1, 3, 'work', '記念日の思い出づくり', { claim: { k: 'mc', g: anniv.g.id, n: 0 } });
    }
    // 4) 入口で待っている → 片付けを先に
    if (queueWaiting && can('clean')) {
      var dirtyC = s.counters.filter(function (c) { return c.unlocked && E.counterEmpty(c) && c.dirty.some(function (d) { return d > 0; }); })[0];
      if (dirtyC) return T(dirtyC.x0, 3, 'grab', '汚れた皿を回収（入口でお待ちです）');
      var scrapeC = s.counters.filter(function (c) { return c.unlocked && E.counterEmpty(c) && c.needsScrape; })[0];
      if (scrapeC) return T(scrapeC.x0, 3, 'work', '鉄板を掃除（入口でお待ちです）');
    }
    if (grillHelp) { var kt = kitchenFirst(); if (kt) return kt; }
    // 5) 作業台に出してある肉を持つ（仕込みスタッフが出した分）
    var kinds = can('meat') ? ['emperor', 'halal'].concat(E.cutsOpen(s), ['beef']) : [];
    for (var ki = 0; ki < kinds.length; ki++) {
      var m = kinds[ki];
      if (nd.need[m] <= 0) continue;
      var onBoard = s.stations.filter(function (st) { return st.type === 'bench' && st.item && st.item.k === 'steak' && st.item.m === m && st.item.t === 0; })[0];
      if (onBoard && freeSlotFor(s, m)) return T(onBoard.x, onBoard.y, 'grab', '作業台の肉を持つ');
    }
    // 6) 足りない肉を取りに行く
    for (ki = 0; ki < kinds.length; ki++) {
      m = kinds[ki];
      if (nd.need[m] - nd.pipe[m] > 0 && freeSlotFor(s, m)) {
        var prov = nearestStation(s, p, function (st) { return D.stations[st.type].provides === m; });
        if (prov) return T(prov.x, prov.y, 'grab', D.stations[prov.type].short + 'を取る（ショーケース）', { claim: { k: m, n: 1 } });
      }
    }
    var kt2 = grillHelp ? null : kitchenFirst();
    if (kt2) return kt2;
    function kitchenFirst() {
    // 6.4) 肉を焼き始めてから、まな板：できた前菜を取る／皿を置いてあれば前菜を作る
    if (nd.need.app > 0 && can('apps')) {
      var appB = nearestStation(s, p, function (st) { return st.type === 'board' && st.item && st.item.k === 'apps'; });
      if (appB) return T(appB.x, appB.y, 'grab', '前菜を取る（まな板）');
    }
    var plB = can('apps') && nearestStation(s, p, function (st) { return st.type === 'board' && st.item && st.item.k === 'plates'; });
    if (plB) return T(plB.x, plB.y, 'work', '前菜を作る（作業・長押し）');
    // 6.5) ドリンク（重ねて持って、まとめて出す）
    var dk = Object.keys(D.drinks).filter(function (d) { return nd.need[d] - nd.pipe[d] > 0; })
      .sort(function (a, b) { return (nd.need[b] - nd.pipe[b]) - (nd.need[a] - nd.pipe[a]); })[0];
    if (dk && can('drinks')) {
      var ds = nearestStation(s, p, function (st) { return D.stations[st.type].provides === dk; });
      if (ds) return T(ds.x, ds.y, 'grab', D.drinks[dk].name + 'を取る', { wantN: Math.min(nd.need[dk] - nd.pipe[dk], D.player.steakCarryMax), claim: { k: dk, n: Math.min(nd.need[dk] - nd.pipe[dk], D.player.steakCarryMax) } });
    }
    // 6.6) 前菜：まな板に空きがあれば、足りない数だけ皿を取りに行く（まとめて盛る）
    if (can('apps') && nd.need.app - nd.pipe.app > 0 && E.cleanPlatesAvailable(s) > 0) {
      var freeB = nearestStation(s, p, function (st) { return st.type === 'board' && (!st.item || (st.item.k === 'plates' && st.item.n < D.work.appMax)); });
      var srcA = freeB && nearestStation(s, p, function (st) { return (st.type === 'rack' && st.plates > 0) || ((st.type === 'sink' || st.type === 'washer') && st.clean > 0); });
      var room = freeB ? D.work.appMax - (freeB.item ? freeB.item.n : 0) : 0;
      if (srcA) return T(srcA.x, srcA.y, 'grab', '皿を取る（前菜）', { wantPlates: Math.min(nd.need.app - nd.pipe.app, room), claim: { k: 'app', n: Math.min(nd.need.app - nd.pipe.app, room) } });
    }
    if (can('rice') && nd.need.rice - nd.pipe.rice > 0 && freeSlotFor(s, 'rice')) {
      var rc = nearestStation(s, p, function (st) { return st.type === 'rice'; });
      if (rc) return T(rc.x, rc.y, 'grab', 'ご飯を取る（炊飯器）', { claim: { k: 'rice', n: 1 } });
    }
    return null;
    }
    // 7) 思い出づくり（いつでも型）
    if (mcPolicy === 'always' && can('mc')) {
      var mcg = waitingOrEating(s).filter(mcReady)[0];
      if (mcg) return T(mcg.c.x0 + (mcg.g.off || 0), 3, 'work', '思い出づくり（フランベ）', { claim: { k: 'mc', g: mcg.g.id, n: 0 } });
    }
    if (b && b.role && !can('clean')) return null;
    // 8) 汚れた皿の回収・洗う・掃除
    var dc = s.counters.filter(function (c) { return c.unlocked && c.dirty.some(function (d) { return d > 0; }); })[0];
    if (dc) return T(dc.x0, 3, 'grab', '汚れた皿を回収');
    var sc = s.counters.filter(function (c) { return c.unlocked && E.counterEmpty(c) && c.needsScrape; })[0];
    if (sc) return T(sc.x0, 3, 'work', '鉄板を掃除（作業・長押し）');
    var sinkD = nearestStation(s, p, function (st) { return st.type === 'sink' && st.dirty > 0; });
    if (sinkD) return T(sinkD.x, sinkD.y, 'work', '皿を洗う（作業・長押し）');
    // 9) 手が空いたら思い出づくり
    if (mcPolicy === 'slack' && can('mc')) {
      var mcs = waitingOrEating(s).filter(mcReady)[0];
      if (mcs) return T(mcs.c.x0 + (mcs.g.off || 0), 3, 'work', '思い出づくり（作業・長押し）', { claim: { k: 'mc', g: mcs.g.id, n: 0 } });
    }
    // 10) 焼き上がり待ち：皿を先に持つ
    var soon = readySlots(s, 3);
    if (soon.length && !grillHelp && E.cleanPlatesAvailable(s) > 0) {
      var src2 = nearestStation(s, p, function (st) { return (st.type === 'rack' && st.plates > 0) || ((st.type === 'sink' || st.type === 'washer') && st.clean > 0); });
      if (src2) return T(src2.x, src2.y, 'grab', '皿を持って焼き上がりを待つ', { wantPlates: Math.min(soon.length, D.player.plateCarryMax) });
    }
    return null;
  };

  function kindsWaiting(nd) { return Object.keys(nd.need).filter(function (k) { return nd.need[k] > nd.pipe[k]; }); }
  function firstSink(s) { return s.stations.filter(function (st) { return st.type === 'sink'; })[0]; }
  function countOnSlots(s, m) { var n = 0; s.counters.forEach(function (c) { c.slots.forEach(function (it) { if (it && it.k === 'steak' && it.m === m && E.classify(it) !== 'burnt') n++; }); }); return n; }
  function waitingOrEating(s) {
    var all = []; s.counters.forEach(function (c) { if (c.unlocked) E.groupsAt(s, c).forEach(function (g) { all.push({ c: c, g: g }); }); });
    return all
      .filter(function (o) { return o.g && (o.g.state === 'waiting' || o.g.state === 'eating'); });
  }

  // その種類を待っているカウンターの空いた鉄板（前のお客様の分を優先）
  // カウンターごとに（相席なら組をまとめて）足りない数を見て、頼んだ人の前の空いた鉄板を選ぶ
  function freeSlotFor(s, m) {
    var best = null, bestNeed = 0;
    var wants = function (gu) { return m === 'rice' ? (gu.order.rice && !gu.got.rice) : (gu.order.main === m && !gu.got.main); };
    s.counters.forEach(function (c) {
      if (!c.unlocked || c.needsScrape) return;
      var groups = E.groupsAt(s, c).filter(function (g) { return g.state === 'waiting'; });
      if (!groups.length) return;
      var need = 0, cooking = 0;
      groups.forEach(function (g) { g.guests.forEach(function (gu) { if (wants(gu)) need++; }); });
      c.slots.forEach(function (it) { if (it && ((m === 'rice' && it.k === 'rice') || (it.k === 'steak' && it.m === m)) && E.classify(it) !== 'burnt') cooking++; });
      var free = c.slots.map(function (it, i) { return it ? -1 : i; }).filter(function (i) { return i >= 0; });
      if (need - cooking > bestNeed && free.length) {
        bestNeed = need - cooking;
        var prefer = free.filter(function (i) {
          var g = E.groupAtSeat(s, c, i); if (!g || g.state !== 'waiting') return false;
          var gu = g.guests[i - (g.off || 0)]; return gu && wants(gu);
        })[0];
        best = { c: c, i: prefer != null ? prefer : free[0] };
      }
    });
    return best;
  }

  function chooseHolding(s, p, h, nd, b) {
    var can = roleCan(b);
    if (h.k === 'steak' || h.k === 'rice') {
      var cl = E.classify(h);
      // 焼き上がったご飯を持っている → 頼んだ人のカウンターへ持って出す
      if (h.k === 'rice' && cl === 'ok') {
        var rc2 = null; s.counters.forEach(function (c) { if (!rc2 && c.unlocked && E.servableGuests(s, c, h).length) rc2 = c; });
        if (rc2) return T(rc2.x0, 3, 'grab', 'ご飯をお出しする');
      }
      if (cl === 'burnt' || (h.t > 0 && cl !== 'raw')) {
        var tr = nearestStation(s, p, function (st) { return st.type === 'trash'; });
        return tr ? T(tr.x, tr.y, 'grab', 'ゴミ箱へ') : null;
      }
      var slot = freeSlotFor(s, h.k === 'rice' ? 'rice' : h.m);
      if (slot) return T(slot.c.x0 + slot.i, 3, 'grab', '鉄板で焼く');
      // 焼く場所が無い → 手を空ける
      var park = nearestStation(s, p, function (st) { return st.type === 'bench' && !st.item; });
      if (park) return T(park.x, park.y, 'grab', '作業台に置いて手を空ける');
      var m = h.k === 'rice' ? 'rice' : h.m;
      var surplus = nd.pipe[m] - nd.need[m];
      var blocked = kindsWaiting(nd).some(function (k) { return k !== m; });
      if (surplus >= (h.n || 1) || blocked) {
        var tr2 = nearestStation(s, p, function (st) { return st.type === 'trash'; });
        if (tr2) return T(tr2.x, tr2.y, 'grab', '余った肉を捨てる（ロス）');
      }
      return null;
    }
    if (h.k === 'apps') {
      var ta = null;
      waitingGroups(s).forEach(function (o) { if (!ta) o.g.guests.forEach(function (gu, gi) { if (!ta && (gu.got.apps || 0) < (gu.order.apps || 0)) ta = { c: o.c, i: (o.g.off || 0) + gi }; }); });
      if (ta) return T(ta.c.x0 + ta.i, 3, 'grab', '前菜を出す');
      var tra = nearestStation(s, p, function (st) { return st.type === 'trash'; });
      return tra ? T(tra.x, tra.y, 'grab', '余った前菜を下げる（ロス）') : null;
    }
    if (h.k === 'drink') {
      var tgt = null;
      waitingGroups(s).forEach(function (o) { if (!tgt) o.g.guests.forEach(function (gu, gi) { if (!tgt && gu.order.drink === h.d && !gu.got.drink) tgt = { c: o.c, i: (o.g.off || 0) + gi }; }); });
      if (tgt) return T(tgt.c.x0 + tgt.i, 3, 'grab', D.drinks[h.d].name + 'を出す');
      var back = nearestStation(s, p, function (st) { return D.stations[st.type].provides === h.d; });
      return back ? T(back.x, back.y, 'work', 'ドリンクを戻す（作業・長押し）') : null;
    }
    if (h.k === 'dish') {
      // 皿にのせた料理：出せる鉄板へ。どこにも出せなければ捨てる
      var dc = null;
      s.counters.forEach(function (c) { if (!dc && c.unlocked && E.servableGuests(s, c, h.food).length) dc = c; });
      if (dc) return T(dc.x0, 3, 'grab', '皿ごと運んで出す');
      var tr3 = nearestStation(s, p, function (st) { return st.type === 'trash'; });
      return tr3 ? T(tr3.x, tr3.y, 'grab', '料理を下げる（ロス）') : null;
    }
    if (h.k === 'plates' && h.dirty) {
      if (h.n < D.player.plateCarryMax) {
        var more = s.counters.filter(function (c) { return c.unlocked && c.dirty.some(function (d) { return d > 0; }); })[0];
        if (more && distTo(s, p, more.x0, 3) <= 3) return T(more.x0, 3, 'grab', '汚れた皿を回収');
      }
      var dest = nearestStation(s, p, function (st) { return st.type === 'sink' || (st.type === 'washer' && st.dirty < D.washerCap); });
      return dest ? T(dest.x, dest.y, 'grab', '汚れた皿を洗い場へ') : null;
    }
    if (h.k === 'plates' && !h.dirty) {
      var appBoard = can('apps') && nd.need.app - nd.pipe.app > 0 && nearestStation(s, p, function (st) { return st.type === 'board' && (!st.item || (st.item.k === 'plates' && st.item.n < D.work.appMax)); });
      if (appBoard && ((b && b.role === 'kitchen') || grillHelping(s, b, nd))) return T(appBoard.x, appBoard.y, 'grab', 'まな板に皿を並べる（前菜）');
      var ready = readySlots(s, 0);
      if (ready.length && can('plates')) return T(ready[0].c.x0 + ready[0].i, 3, 'grab', '盛って出す（皿を持って鉄板へ）');
      var soon = readySlots(s, 4);
      if (soon.length && can('plates')) return T(soon[0].c.x0 + soon[0].i, 3, 'wait', '焼き上がりを待つ');
      // 焼き上がりが近くなければ前菜：まな板に皿を並べる
      if (can('apps') && nd.need.app - nd.pipe.app > 0) {
        var fb = nearestStation(s, p, function (st) { return st.type === 'board' && (!st.item || (st.item.k === 'plates' && st.item.n < D.work.appMax)); });
        if (fb) return T(fb.x, fb.y, 'grab', 'まな板に皿を並べる（前菜）');
      }
      // 出すものが無い → 空いている作業台に置く
      if (Object.keys(nd.need).reduce(function (a, k) { return a + nd.need[k]; }, 0) <= 0) return null;
      var bench = nearestStation(s, p, function (st) { return st.type === 'bench' && !st.item; });
      if (bench) return T(bench.x, bench.y, 'grab', '皿を作業台に置く');
      var rack = nearestStation(s, p, function (st) { return st.type === 'rack'; });
      return rack ? T(rack.x, rack.y, 'work', '皿を皿棚に戻す（作業・長押し）') : null;
    }
    return null;
  }

  // ---------- 入力をつくる ----------
  B.input = function (s, p, b, dt) {
    var inp = B.inputRaw(s, p, b, dt);
    p.claim = b.task && b.task.claim ? b.task.claim : null;
    return inp;
  };
  // 雇ったスタッフ（s.players の2人目から）を動かす。Bot の状態は人ごとに持つ（保存には入れない）
  var staffBots = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  B.staffInputs = function (s, dt, from) {
    var out = [];
    for (var i = from; i < s.players.length; i++) {
      var p = s.players[i], b = staffBots && staffBots.get(p);
      if (!p.staff) { out.push({}); continue; }
      if (!b) {
        var sd = D.staff[p.role];
        b = B.create({ react: sd.react, mc: p.role === 'mc' ? 'always' : 'never', seed: 97 + i * 31 });
        b.role = p.role;
        if (staffBots) staffBots.set(p, b);
      }
      out.push(B.input(s, p, b, dt));
    }
    return out;
  };
  B.inputRaw = function (s, p, b, dt) {
    var inp = { mx: 0, my: 0, grab: false, work: false };
    if (s.phase === 'prep') return inp;
    b.cool -= dt;
    if (b.task && b.needReplan && b.cool <= 0) b.task = null;
    if (!b.task) {
      if (b.cool > 0) return inp;
      b.task = B.choose(s, p, b);
      b.needReplan = false;
      b.path = null;
      if (!b.task) { b.cool = 0.15; return inp; }
      var w0 = b.task.act === 'work' ? E.stationAt(s, b.task.x, b.task.y) : null;
      if (w0 && w0.type === 'sink') b.task.startDirty = w0.dirty;
      if (b.mistake && brand(b) < b.mistake) { b.cool = 0.6; b.task = null; return inp; }
    }
    var t = b.task;
    var ptx = Math.floor(p.x), pty = Math.floor(p.y);
    var goals = standTiles(s, t.x, t.y);
    var atGoal = goals.some(function (g) { return g[0] === ptx && g[1] === pty; });
    if (!atGoal) {
      if (!b.path || !b.path.length || b.path[0][0] !== ptx || b.path[0][1] !== pty) {
        b.path = bfs(s, ptx, pty, goals);
        if (!b.path) { b.task = null; b.cool = 0.2; return inp; }
      }
      var next = b.path.length > 1 ? b.path[1] : b.path[0];
      var dx = next[0] + 0.5 - p.x, dy = next[1] + 0.5 - p.y;
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      inp.mx = dx / len; inp.my = dy / len;
      if (b.path.length > 1 && Math.abs(dx) < 0.15 && Math.abs(dy) < 0.15) b.path.shift();
      stuckCheck(b, p, dt);
      return inp;
    }
    // 目的の前：中央へ寄せてから向く
    var cx = ptx + 0.5 - p.x, cy = pty + 0.5 - p.y;
    var fdx = t.x - ptx, fdy = t.y - pty;
    if (p.fx !== fdx || p.fy !== fdy) {
      inp.mx = fdx + cx * 0.5; inp.my = fdy + cy * 0.5;
      return inp;
    }
    if (t.act === 'wait') { if (!b.needReplan) { b.needReplan = true; b.cool = 0.1; } return inp; }
    if (t.act === 'work') {
      var w = E.workable(s, p);
      if (!w) { b.task = null; b.cool = b.react; return inp; }
      // 洗い物は2枚ずつで区切って、ほかに急ぐことがないか見直す
      if (w.kind === 'wash' && t.startDirty != null && w.st.dirty <= t.startDirty - 2) { b.task = null; b.cool = b.react; return inp; }
      inp.work = true;
      return inp;
    }
    // grab：押した次のフレームで判断し直す
    if (b.grabPulse) { b.grabPulse = false; finishGrab(s, p, b); return inp; }
    inp.grab = true; b.grabPulse = true;
    return inp;
  };
  function finishGrab(s, p, b) {
    var t = b.task;
    if (t.wantN && p.hold && (p.hold.k === 'drink' || p.hold.k === 'steak') && (p.hold.n || 1) < t.wantN) return;   // 同じ場所でもう1つ
    if (t.wantPlates && p.hold && p.hold.k === 'plates' && !p.hold.dirty && p.hold.n < t.wantPlates) {
      var st = E.stationAt(s, t.x, t.y);
      var left = st && ((st.type === 'rack' && st.plates > 0) || ((st.type === 'sink' || st.type === 'washer') && st.clean > 0));
      if (left) return; // 同じ場所で、もう一度つかんでもう1枚
    }
    b.task = null; b.cool = b.react;
  }
  function stuckCheck(b, p, dt) {
    if (b.lastPos && Math.abs(b.lastPos[0] - p.x) + Math.abs(b.lastPos[1] - p.y) < 0.002) {
      b.stuckT += dt;
      if (b.stuckT > 0.8) { b.task = null; b.path = null; b.stuckT = 0; b.cool = 0.1; }
    } else b.stuckT = 0;
    b.lastPos = [p.x, p.y];
  }

  // 作業が終わった・状況が変わった → 判断し直す
  B.tick = function (s, b) {
    if (!b.task) return;
    var t = b.task;
    if (t.act === 'work') return;
    var tgSt = E.stationAt(s, t.x, t.y);
    if (t.act === 'grab' && t.label.indexOf('皿を取る') === 0 && tgSt && tgSt.type === 'rack' && tgSt.plates <= 0) b.task = null;
  };

  // ---------- 人へのヒント ----------
  B.suggest = function (s) {
    if (s.phase !== 'service') return null;
    var p = s.players[0];
    var t = B.choose(s, p, { mc: 'slack' });
    if (!t) return null;
    return { x: t.x, y: t.y, act: t.act, label: t.label };
  };

  // ---------- 夜の判断（検証用） ----------
  B.night = function (s, policy) {
    policy = policy || {};
    var E2 = E;
    if (s.phase === 'card') {
      var pair = s.cardPair.slice();
      var pref = policy.cards || ['garlic', 'emperor', 'anniversary', 'inbound', 'halal', 'impatient', 'rush'];
      pair.sort(function (a, b) { return pref.indexOf(a) - pref.indexOf(b); });
      E2.pickCard(s, pair[0]);
    }
    if (s.phase !== 'shop') return;
    if (E2.staffUnlocked(s)) {
      (policy.hire || []).forEach(function (h) {
        if (s.day + 1 >= h.from) E2.setStaff(s, h.id, true);
      });
    }
    var wish = policy.buy || ['plates', 'sakeShelf', 'wineCellar', 'sink', 'board', 'counter', 'washer', 'sneakers', 'reservation', 'bench', 'highHeat', 'showcase'];
    var reserve = policy.reserve || 0;
    for (var round = 0; round < 3; round++) {
      var bought = false;
      wish.forEach(function (id) {
        s.offers.forEach(function (o, i) {
          if (o.sold || o.id !== id) return;
          var it = E2.shopItem(id);
          if (s.cash - it.price >= reserve && E2.buy(s, i)) bought = true;
        });
      });
      if (!bought) break;
    }
    if (policy.layout) B.autoLayout(s);
  };

  // 検証用の配置：鉄板の真後ろ（5段目）に皿棚・洗い場・まな板・ショーケースを寄せる
  // 5段目は 5列目と10列目を通路に残す。あふれた設備は7段目へ（6段目は通路）
  B.autoLayout = function (s) {
    // 部位の店：部位のショーケースを神戸牛ショーケースの場所から順に（よく出る順＝解放の順）
    var cutTypes = E.cutsOpen(s).map(function (id) { return 'sc_' + id; });
    var order = ['rack', 'sink'].concat(cutTypes.slice(0, 1), cutTypes.length ? [] : ['showcase'], ['board', 'beer', 'water', 'washer'], cutTypes.slice(1, 3),
      ['eshowcase', 'rice', 'sake', 'wine', 'hshowcase'], cutTypes.slice(3), ['board', 'sink', 'trash', 'bench', 'showcase', 'bench', 'board', 'bench', 'bench', 'bench']);
    var spots = [[3, 5], [2, 5], [4, 5], [1, 5], [7, 5], [6, 5], [8, 5], [9, 5], [12, 5], [11, 5], [13, 5], [14, 5],
      [3, 7], [4, 7], [6, 7], [7, 7], [8, 7], [9, 7], [11, 7], [12, 7], [13, 7], [14, 7], [1, 7], [2, 7]];
    spots = spots.map(function (sp) { return [D.mirrorX(sp[0]), sp[1]]; });   // 店が左右反転なら、置き場所も反転
    var before = s.stations.map(function (st) { return [st.x, st.y]; });
    var placed = [], k = 0;
    order.forEach(function (type) {
      var st = s.stations.filter(function (x) { return x.type === type && placed.indexOf(x) < 0; })[0];
      if (!st || !spots[k]) return;
      var spot = spots[k++];
      placed.push(st);
      var occ = E.stationAt(s, spot[0], spot[1]);
      if (occ && occ !== st) { occ.x = st.x; occ.y = st.y; }
      st.x = spot[0]; st.y = spot[1];
    });
    if (!E.layoutOk(s)) s.stations.forEach(function (st, i) { st.x = before[i][0]; st.y = before[i][1]; });
    E.placePlayer(s);
  };
})(WK);

if (typeof module !== 'undefined') module.exports = WK;
