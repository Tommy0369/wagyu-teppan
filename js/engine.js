/* 和牛の刀 鉄板十五日 — ENGINE
 * 状態遷移だけを持つ。DOM・音・描画に触れない（Node でも動く）。
 * 真実は state ひとつ。UI は state を読むだけ。
 */
var WK = (typeof WK !== 'undefined') ? WK : {};
if (typeof module !== 'undefined' && !WK.DATA) WK = require('./data.js');

(function (WK) {
  'use strict';
  var D = WK.DATA;
  var E = WK.Engine = {};
  var MW = D.map[0].length, MH = D.map.length;
  E.MW = MW; E.MH = MH;

  // ---------- 乱数（シード可能・1か所に集約） ----------
  function rand(s) {
    var t = (s.rng = (s.rng + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  E.rand = rand;
  function pickWeighted(s, weights) {
    var sum = 0, i;
    for (i = 0; i < weights.length; i++) sum += weights[i];
    var r = rand(s) * sum;
    for (i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) return i; }
    return weights.length - 1;
  }

  // ---------- マップ ----------
  function ch(x, y) { return (y < 0 || y >= MH || x < 0 || x >= MW) ? '#' : D.map[y][x]; }
  E.ch = ch;
  function isFloor(x, y) { return ch(x, y) === 'k'; }
  E.isFloor = isFloor;

  function stationAt(s, x, y) {
    for (var i = 0; i < s.stations.length; i++) { var st = s.stations[i]; if (st.x === x && st.y === y) return st; }
    return null;
  }
  E.stationAt = stationAt;
  function isSolid(s, x, y) { return !isFloor(x, y) || !!stationAt(s, x, y); }
  E.isSolid = isSolid;

  function counterAtSlot(s, x, y) {
    if (ch(x, y) !== 'T') return null;
    for (var i = 0; i < s.counters.length; i++) {
      var c = s.counters[i];
      if (x >= c.x0 && x < c.x0 + c.seats) return { c: c, i: x - c.x0 };
    }
    return null;
  }
  E.counterAtSlot = counterAtSlot;

  function fx(s, ev) { if (s.fx) s.fx.push(ev); if (s.stats && s.phase === 'service') logEv(s, ev); }

  // ---------- その日の手順の記録（日報のふりかえり用） ----------
  // 何が起きたか＋そのとき自分が何をしていたか（作業・持ち物・鉄板の上の枚数）を残す
  var LOG_KINDS = { sizzle: 1, doneness: 1, serve: 1, appDone: 1, washDone: 1, scrapeDone: 1, mc: 1, complaint: 1, lost: 1, order: 1, trash: 1 };
  function activity(p) {
    if (p.workOn) return p.workOn;
    var h = p.hold;
    if (h) return 'carry:' + (h.k === 'plates' ? (h.dirty ? 'dirty' : 'plates') : h.k);
    return p.moving ? 'walk' : 'idle';
  }
  E.activity = activity;
  function onTeppan(s) { var n = 0; s.counters.forEach(function (c) { c.slots.forEach(function (it) { if (it && it.k === 'steak') n++; }); }); return n; }
  function logEv(s, ev) {
    if (!LOG_KINDS[ev.t] && !ev.raw) return;
    var L = s.stats.log || (s.stats.log = []);
    if (L.length >= 600) return;
    var p = s.players[0];
    L.push({ t: Math.round(s.t * 10) / 10, k: ev.t, x: ev.x, d: ev.d, good: ev.good, want: ev.want, done: ev.done, subst: ev.subst,
      seat: ev.seat, reason: ev.reason, cost: ev.cost, wait: ev.wait, dirty: ev.dirty, a: activity(p), on: onTeppan(s), py: Math.round(p.y) });
  }
  function toast(s, text, kind) { fx(s, { t: 'toast', text: text, kind: kind || 'info' }); }

  // ---------- 作成 ----------
  function newStation(s, type, x, y) {
    var st = { id: s.nextId++, type: type, x: x, y: y, item: null };
    if (type === 'rack') st.plates = 0;
    if (type === 'sink' || type === 'washer') { st.dirty = 0; st.clean = 0; st.washT = 0; }
    if (type === 'bench') st.prepT = 0;
    if (type === 'board') { st.appT = 0; st.prepT = 0; }
    return st;
  }

  E.newRun = function (seed, difficulty) {
    var s = {
      v: D.saveVersion,
      difficulty: D.difficulties[difficulty] ? difficulty : D.defaultDifficulty,
      seed: seed >>> 0, rng: seed >>> 0,
      nextId: 1,
      day: 1, phase: 'prep',
      cash: D.money.startCash,
      rep: D.rating.repStart,
      cards: [], flags: { sneakers: false, highHeat: false, reservation: false },
      staff: { grill: false, kitchen: false, mc: false },
      staffDays: 0, retries: 0,
      platesTotal: D.startPlates,
      bought: {},
      stations: [], counters: [],
      players: [], groups: [], queue: [], spawns: [],
      t: 0, dur: 0, window: 0,
      stats: null, history: [], report: null,
      offers: [], rerolls: 0, cardPair: [],
      fx: []
    };
    D.counters.forEach(function (c) {
      s.counters.push({ id: c.id, x0: c.x0, seats: c.seats, unlocked: c.unlocked, seatGroup: new Array(c.seats).fill(null),
        slots: new Array(c.seats).fill(null), dirty: new Array(c.seats).fill(0), needsScrape: false, scrapeT: 0 });
    });
    D.startStations.forEach(function (d) { s.stations.push(newStation(s, d.type, d.x, d.y)); });
    E.startPrep(s);
    return s;
  };

  function rackOf(s) { for (var i = 0; i < s.stations.length; i++) if (s.stations[i].type === 'rack') return s.stations[i]; return null; }

  // 開店準備に入る。皿は全部きれいにして皿棚へ戻す（閉店後の片付けは済んでいる扱い）
  E.startPrep = function (s) {
    s.phase = 'prep';
    s.t = 0;
    s.groups = []; s.queue = []; s.spawns = [];
    s.counters.forEach(function (c) {
      delete c.group; c.seatGroup = new Array(c.seats).fill(null); c.slots = new Array(c.seats).fill(null); c.dirty = new Array(c.seats).fill(0);
      c.needsScrape = false; c.scrapeT = 0;
    });
    s.stations.forEach(function (st) {
      st.item = null;
      if (st.type === 'sink' || st.type === 'washer') { st.dirty = 0; st.clean = 0; st.washT = 0; }
      if (st.type === 'bench') st.prepT = 0;
      if (st.type === 'board') { st.appT = 0; st.prepT = 0; }
      if (st.type === 'rack') st.plates = 0;
    });
    var rack = rackOf(s);
    if (rack) rack.plates = s.platesTotal;
    s.players = [{ id: 0, x: D.playerStart.x, y: D.playerStart.y, fx: 0, fy: -1, hold: null, moving: false, workOn: null, bob: 0 }];
    // 雇ったスタッフも厨房に立つ（自分の左右に並ぶ）。動かすのは Bot（担当の仕事だけ）
    Object.keys(D.staff).filter(function (k) { return s.staff[k]; }).forEach(function (k, i) {
      s.players.push({ id: i + 1, staff: true, role: k, x: D.playerStart.x + (i % 2 ? 1.5 : -1.5) * Math.ceil((i + 1) / 2), y: D.playerStart.y, fx: 0, fy: -1, hold: null, moving: false, workOn: null, bob: 0 });
    });
    E.placePlayer(s);
    delete s.mcStaff;
    s.stats = null;
    s.fx = [];
    var added = ensureCuts(s);
    if (s.day === 1 && E.cutMode(s)) toast(s, '今日のお肉：' + E.cutsOpen(s).map(E.meatName).join('・') + '（部位ごとのショーケースから取ります）', 'info');
    else if (added.length) toast(s, '今日から新しい部位：' + added.map(E.meatName).join('・') + '（ショーケースが届きました）', 'info');
    s.morning = E.snapshot(s);
  };

  // 立ち位置が設備に重なっていたら、鉄板の前（4段目）に近い空きマスへずらす
  // 鉄板の前とつながっている床（ここにいれば、どこへでも行ける）
  function mainRegion(s) {
    var start = null;
    s.counters.forEach(function (c) {
      if (!c.unlocked || start) return;
      for (var i = 0; i < c.seats; i++) if (!isSolid(s, c.x0 + i, 4)) { start = [c.x0 + i, 4]; break; }
    });
    if (!start) for (var y = 4; y < MH && !start; y++) for (var x = 0; x < MW; x++) if (!isSolid(s, x, y)) { start = [x, y]; break; }
    return start ? reachable(s, start[0], start[1]) : {};
  }
  function nearestFree(s, tx, ty) {
    var main = mainRegion(s), best = null, bd = 1e9, fallback = null, fd = 1e9;
    for (var y = 4; y < MH; y++) for (var x = 0; x < MW; x++) {
      if (isSolid(s, x, y)) continue;
      var d = Math.abs(x - tx) + Math.abs(y - ty) * 1.01;
      if (main[y * MW + x]) { if (d < bd) { bd = d; best = [x, y]; } }
      else if (d < fd) { fd = d; fallback = [x, y]; }
    }
    return best || fallback;
  }
  // 立ち位置が設備に重なっていたり、閉じ込められていたら、鉄板の前とつながる空きマスへ移す
  E.placePlayer = function (s) {
    var main = mainRegion(s);
    s.players.forEach(function (p) {
      var tx = Math.floor(p.x), ty = Math.floor(p.y);
      if (!isSolid(s, tx, ty) && main[ty * MW + tx] && !collides(s, p.x, p.y, D.player.radius)) return;
      var best = nearestFree(s, tx, ty);
      if (best) { p.x = best[0] + 0.5; p.y = best[1] + 0.5; }
    });
  };

  // ---------- 保存 ----------
  E.snapshot = function (s) {
    var keep = s.fx, morning = s.morning; s.fx = undefined; s.morning = undefined;
    var json = JSON.stringify(s);
    s.fx = keep; s.morning = morning;
    return json;
  };
  // 読めない・欠けた保存は null（監査 F09：壊れたセーブで続きからが止まった）
  E.restore = function (json) {
    try {
      var r = restoreRaw(json);
      if (!r || typeof r.day !== 'number' || !Array.isArray(r.counters) || !Array.isArray(r.stations) || !Array.isArray(r.players) || !Array.isArray(r.groups)) return null;
      return r;
    } catch (e) { return null; }
  };
  function restoreRaw(json) {
    var s = JSON.parse(json);
    if (!s || s.v !== D.saveVersion) return null;
    s.fx = [];
    s.morning = json;
    // 前の版の保存：洗い場・仕込みスタッフ → キッチン担当
    if (s.staff && ('wash' in s.staff || 'prep' in s.staff)) { s.staff = { grill: false, kitchen: !!(s.staff.wash || s.staff.prep), mc: !!s.staff.mc }; if (s.phase === 'prep') E.startPrep(s); }
    // 焼き担当とキッチン担当を両方雇っていた保存 → 焼き担当だけにする（どちらか1人だけ 2026-10-28）
    if (s.staff && s.staff.grill && s.staff.kitchen) { s.staff.kitchen = false; if (s.phase === 'prep') E.startPrep(s); }
    if (s.phase === 'prep' && ensureCuts(s).length) s.morning = E.snapshot(s);
    E.placePlayer(s);
    return s;
  }
  E.retryDay = function (s) {
    var r = E.restore(s.morning);
    if (!r) return s;
    r.retries = (s.retries || 0) + 1;
    r.morning = E.snapshot(r);
    return r;
  };

  // ---------- 1日の設定 ----------
  function cardOn(s, id) { return s.cards.indexOf(id) >= 0; }
  E.cardOn = cardOn;
  function cardDef(id) { for (var i = 0; i < D.cards.length; i++) if (D.cards[i].id === id) return D.cards[i]; return null; }
  E.cardDef = cardDef;

  E.repMult = function (rep) {
    var m = 1 + (rep - D.rating.repStart) * D.demand.repMultK;
    return Math.max(D.demand.repMultMin, Math.min(D.demand.repMultMax, m));
  };
  E.groupCount = function (s) {
    var n = (D.demand.baseGroups + D.demand.perDay * (s.day - 1)) * E.repMult(s.rep);
    s.cards.forEach(function (id) { var c = cardDef(id); if (c && c.groupMult) n *= c.groupMult; });
    return Math.max(1, Math.round(n));
  };
  // ハード・鬼ムズ：その日に出る部位（なければ []＝神戸牛だけ）
  E.cutsOpen = function (s, day) {
    var d = D.difficulties[s.difficulty], out = [];
    if (!d || !d.cuts) return out;
    d.cuts.forEach(function (c) { if ((day || s.day) >= c[0]) out = out.concat(c[1]); });
    return out;
  };
  E.cutMode = function (s) { return !!(D.difficulties[s.difficulty] || {}).cuts; };
  // 注文の肉：コースを選んでから、そのコースの部位を選ぶ（コースで肉の系統が決まる）
  //  大将軍コースは、エンペラーのカード（エンペラー）か、鬼ムズの11日目（皇帝2種）から
  E.coursesOpen = function (s) {
    var by = {};
    E.cutsOpen(s).forEach(function (id) { var c = D.meats[id].course; (by[c] = by[c] || []).push(id); });
    if (cardOn(s, 'emperor')) (by.daishogun = by.daishogun || []).push('emperor');
    return by;
  };
  function pickMain(s) {
    var by = E.coursesOpen(s), cs = Object.keys(by);
    if (!cs.length) return 'beef';
    var list = by[cs[pickWeighted(s, cs.map(function (k) { return D.courses[k].w; }))]];
    return list[Math.floor(rand(s) * list.length)];
  }
  // 出せるドリンク：水・ビールはいつも。日本酒・ワインは酒棚・ワインセラーを買ってから
  E.drinksOpen = function (s) {
    return Object.keys(D.drinks).filter(function (d) { return s.stations.some(function (st) { return D.stations[st.type].provides === d; }); });
  };
  E.courseOf = function (gu) { return D.courses[gu.order.course || (D.meats[gu.order.main] || D.meats.beef).course]; };
  // ひとりの注文が全部そろったか（肉・前菜・ご飯・ドリンク）
  function guestDone(gu) {
    return gu.got.main && (!gu.order.rice || gu.got.rice) && (gu.got.apps || 0) >= (gu.order.apps || 0) && (!gu.order.drink || gu.got.drink);
  }
  E.guestDone = guestDone;
  E.meatName = function (m) { return (D.meats[m] || D.meats.beef).name; };
  // 部位のショーケースをそろえる（はじめの神戸牛ショーケースはサーロインに。増えた部位は届く）
  function ensureCuts(s) {
    if (!E.cutMode(s)) return [];
    var cuts = E.cutsOpen(s), added = [];
    s.stations.forEach(function (st) { if (st.type === 'showcase') st.type = 'sc_' + cuts[0]; });
    cuts.forEach(function (id) {
      var type = 'sc_' + id;
      if (s.stations.some(function (st) { return st.type === type; })) return;
      if (deliver(s, type)) added.push(id);
    });
    return added;
  }
  E.ensureCuts = ensureCuts;
  E.dayDuration = function (day) { return D.day.serviceBase + D.day.servicePerDay * (day - 1); };
  E.donenessUnlocked = function (day) {
    var best = D.doneness.unlock[1];
    Object.keys(D.doneness.unlock).forEach(function (k) { if (day >= +k) best = D.doneness.unlock[k]; });
    return best;
  };
  // 評判が高い店ほど、お客様は待ってくれる
  E.repPatience = function (rep) {
    var m = 1 + (rep - D.rating.repStart) * D.demand.repPatienceK;
    return Math.max(D.demand.repPatienceMin, Math.min(D.demand.repPatienceMax, m));
  };
  function patienceMult(s) {
    var m = s.stats && s.stats.repBefore != null ? E.repPatience(s.stats.repBefore) : 1;
    s.cards.forEach(function (id) { var c = cardDef(id); if (c && c.patienceMult) m *= c.patienceMult; });
    return m * ((D.difficulties[s.difficulty] || {}).patience || 1);   // 難易度ごとの待ってくれる長さ
  }

  function buildSpawns(s) {
    var n = E.groupCount(s);
    var win = s.window;
    var rush = cardOn(s, 'rush');
    var resv = s.flags.reservation;
    var jitter = resv ? 0.12 : D.demand.jitter;
    var times = [];
    for (var i = 0; i < n; i++) {
      var u = (i + 0.15) / n + jitter * (rand(s) - 0.5) / Math.max(1, n) * 2.2;
      if (rush) {
        // 2つの山（0.22 と 0.62 付近）。予約台帳があると半分ならす
        var peak = (i % 2 === 0) ? 0.22 : 0.62;
        var r = peak + (rand(s) - 0.5) * 0.16;
        var k = resv ? 0.45 : 0.85;
        u = u * (1 - k) + r * k;
      }
      u = Math.max(0, Math.min(1, u));
      times.push(4 + u * (win - 4));
    }
    times.sort(function (a, b) { return a - b; });
    var weights = D.demand.sizeWeights;
    if (cardOn(s, 'inbound')) weights = cardDef('inbound').sizeWeights;
    var dones = E.donenessUnlocked(s.day);
    s.spawns = times.map(function (t) {
      var size = pickWeighted(s, weights);
      if (size < 1) size = 1;
      var anniv = cardOn(s, 'anniversary') && rand(s) < cardDef('anniversary').annivP;
      var halal = cardOn(s, 'halal') && rand(s) < cardDef('halal').halalP;
      var guests = [];
      var drinks = E.drinksOpen(s);
      for (var g = 0; g < size; g++) {
        var main = halal ? 'halal' : pickMain(s);
        var course = D.meats[main].course;
        var drink = halal ? 'water' : (drinks.length ? drinks[pickWeighted(s, drinks.map(function (d) { return D.drinks[d].w; }))] : null);
        var done = dones[pickWeighted(s, dones.map(function (d) { return D.doneness.weights[d]; }))];
        var rice = cardOn(s, 'garlic') && rand(s) < cardDef('garlic').riceP;
        guests.push({ order: { main: main, done: done, rice: rice, course: course, apps: D.courses[course].apps, drink: drink },
          got: { main: false, rice: false, apps: 0, drink: false }, wrong: false, look: Math.floor(rand(s) * 6) });
      }
      return { t: t, size: size, anniv: anniv, halal: halal, guests: guests };
    });
  }

  function newStats() {
    return { revenue: 0, cost: 0, loss: 0, labor: 0, fixed: 0, tips: 0, guests: 0, groups: 0, groupsTotal: 0,
      complaints: 0, lostGroups: 0, lostSales: 0, ratings: [], reviewsGood: 0, reviewsBad: 0, mc: 0, burnt: 0, wrong: 0, mains: 0,
      plateOutSec: 0, dirtyBlockSec: 0, foodWaitSec: 0, annivMissed: 0, lossItems: 0 };
  }

  // 開店。届かない設備があれば理由を返して開店しない
  E.checkLayout = function (s) {
    var p = s.players[0];
    if (p.hold && p.hold.k === 'station') return ['持っている設備を置いてから開店しましょう'];
    var reach = reachable(s, Math.floor(p.x), Math.floor(p.y));
    var problems = [];
    var needTypes = E.cutMode(s) ? E.cutsOpen(s).map(function (id) { return 'sc_' + id; }).concat(['rack', 'sink']) : ['showcase', 'rack', 'sink'];
    needTypes.forEach(function (t) {
      var ok = s.stations.some(function (st) { return st.type === t && stationReachable(s, st, reach); });
      if (!ok) problems.push(D.stations[t].name + 'に手が届きません');
    });
    s.counters.forEach(function (c) {
      if (!c.unlocked) return;
      for (var i = 0; i < c.seats; i++) {
        if (!reach[(4) * MW + c.x0 + i]) { problems.push('鉄板カウンター' + c.id + 'の前がふさがっています'); break; }
      }
    });
    return problems;
  };
  function reachable(s, sx, sy) {
    var seen = {}; var q = [[sx, sy]]; seen[sy * MW + sx] = true;
    while (q.length) {
      var c = q.shift();
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        var nx = c[0] + d[0], ny = c[1] + d[1], k = ny * MW + nx;
        if (!seen[k] && !isSolid(s, nx, ny)) { seen[k] = true; q.push([nx, ny]); }
      });
    }
    return seen;
  }
  E.reachable = reachable;
  function stationReachable(s, st, reach) {
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(function (d) { return reach[(st.y + d[1]) * MW + st.x + d[0]]; });
  }

  E.beginService = function (s) {
    s.morning = E.snapshot(s); // やり直しは、決めた配置のまま開店前に戻る
    s.phase = 'service';
    s.t = 0;
    s.dur = E.dayDuration(s.day);
    s.window = s.dur * D.day.spawnWindow;
    s.stats = newStats();
    s.stats.repBefore = s.rep;
    s.groups = []; s.queue = [];
    buildSpawns(s);
    s.stats.groupsTotal = s.spawns.length;
    var p = s.players[0];
    if (p.hold && p.hold.k === 'station') p.hold = null;
    fx(s, { t: 'open' });
  };

  // ---------- 調理の判定 ----------
  function thresholds(m) {
    var b = D.doneness.beef, k = (D.meats[m] && D.meats[m].cook) || 1;
    return { rare: b.rare * k, medium: b.medium * k, well: b.well * k, wellEnd: b.wellEnd * k, burn: b.burn * k };
  }
  E.thresholds = thresholds;
  function classify(item) {
    if (!item) return null;
    if (item.k === 'rice') return item.t >= D.rice.burn ? 'burnt' : (item.t >= D.rice.ready ? 'ok' : 'raw');
    if (item.k !== 'steak') return null;
    var th = thresholds(item.m);
    if (item.t >= th.burn) return 'burnt';
    if (item.t >= th.well) return 'well';
    if (item.t >= th.medium) return 'medium';
    if (item.t >= th.rare) return 'rare';
    return 'raw';
  }
  E.classify = classify;
  // ドリンクは種類を混ぜて持てる（水とビールを一緒に。本人指定 2026-10-28）。ds＝持っている順の一覧。d・n は先頭と杯数（古い読み手のため）
  function drinkList(h) { if (h.ds) return h.ds; var a = []; for (var i = 0; i < (h.n || 1); i++) a.push(h.d); return a; }
  E.drinkList = drinkList;
  function setDrinks(p, ds) { p.hold = ds.length ? { k: 'drink', ds: ds, d: ds[0], n: ds.length } : null; }
  // 持てる数：お盆（夜の店で買う）があると、ご飯4つ・ドリンク6杯まで
  E.carryMax = function (s, k) {
    var tray = s.flags && s.flags.tray;
    if (k === 'drink') return tray ? D.player.trayDrinkMax : D.player.steakCarryMax;
    if (k === 'rice') return tray ? D.player.trayRiceMax : 1;
    return D.player.steakCarryMax;
  };
  function itemCost(item) {
    if (!item) return 0;
    if (item.k === 'steak') return D.money.cost[item.m] * (item.n || 1);
    if (item.k === 'rice') return D.money.cost.rice * (item.n || 1);
    if (item.k === 'drink') return drinkList(item).reduce(function (a, d) { return a + D.money.cost[d]; }, 0);
    if (item.k === 'app') return D.money.cost.app;
    if (item.k === 'apps') return D.money.cost.app * (item.n || 1);
    return 0;
  }
  E.itemCost = itemCost;
  function wrongQuestion(st) {
    var d = st.wrongDone || 0, p = st.wrongPart || 0;
    if (p && !d) return '頼まれたのと違う部位の肉を出したのが' + p + '枚ありました。その肉を、どのお客様の分だと思って焼いていましたか？';
    if (d && !p) return '注文と違う焼き加減で出したのが' + d + '枚ありました。焼き上がりは、何を見て判断していましたか？';
    return '注文と違う焼き加減が' + d + '枚、頼まれたのと違う部位が' + p + '枚ありました。出す肉は、何を見て決めていましたか？';
  }
  function addLoss(s, item) {
    var c = itemCost(item);
    if (c > 0 && s.stats) { s.stats.loss += c; s.stats.lossItems++; }
  }

  // ---------- 狙い（向いている先） ----------
  var DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  function targetAt(s, x, y) {
    var st = stationAt(s, x, y);
    if (st) return { k: 'station', st: st, x: x, y: y };
    var cs = counterAtSlot(s, x, y);
    if (cs && cs.c.unlocked) return { k: 'slot', c: cs.c, i: cs.i, x: x, y: y };
    return null;
  }
  E.getTarget = function (s, p, forPlace) {
    var tx = Math.floor(p.x), ty = Math.floor(p.y);
    var fxv = p.fx, fyv = p.fy;
    if (s.phase === 'prep' && p.hold && p.hold.k === 'station') {
      var nx = tx + fxv, ny = ty + fyv;
      if (!isFloor(nx, ny) || stationAt(s, nx, ny)) return { k: 'blocked', x: nx, y: ny, why: 'occupied' };
      // 置く前に、閉じ込め・通れない場所ができないか試す（置けないマスは赤枠で見せる）
      var before = layoutProblems(s, p);
      var tmp = { type: p.hold.st.type, x: nx, y: ny };
      s.stations.push(tmp);
      var worse = layoutProblems(s, p) > before;
      s.stations.pop();
      if (worse) return { k: 'blocked', x: nx, y: ny, why: 'trap' };
      return { k: 'floor', x: nx, y: ny };
    }
    var front = targetAt(s, tx + fxv, ty + fyv);
    if (front) return front;
    // 補正：正面に何もなければ左右を見る（後ろは見ない）
    var best = null, bestScore = -9;
    var ox = p.x - (tx + 0.5), oy = p.y - (ty + 0.5);
    DIRS.forEach(function (d) {
      if (d[0] === -fxv && d[1] === -fyv) return;
      if (d[0] === fxv && d[1] === fyv) return;
      var t = targetAt(s, tx + d[0], ty + d[1]);
      if (!t) return;
      var score = d[0] * ox + d[1] * oy;
      if (score > bestScore) { bestScore = score; best = t; }
    });
    return best;
  };

  // ---------- 手に持てるか ----------
  function cleanPlatesHeld(p) { return (p.hold && p.hold.k === 'plates' && !p.hold.dirty) ? p.hold.n : 0; }
  function addPlatesToHand(p, n, dirty) {
    var cap = D.player.plateCarryMax;
    if (!p.hold) { var k = Math.min(n, cap); p.hold = { k: 'plates', n: k, dirty: dirty }; return k; }
    if (p.hold.k === 'plates' && p.hold.dirty === dirty) { var add = Math.min(n, cap - p.hold.n); p.hold.n += add; return add; }
    return 0;
  }
  function usePlate(p) { p.hold.n--; if (p.hold.n <= 0) p.hold = null; }

  E.cleanPlatesAvailable = function (s) {
    var n = 0;
    s.stations.forEach(function (st) {
      if (st.type === 'rack') n += st.plates;
      if (st.type === 'sink' || st.type === 'washer') n += st.clean;
      if (st.item && st.item.k === 'plates' && !st.item.dirty && st.type !== 'board') n += st.item.n;   // まな板の皿は前菜用
      if (st.item && st.item.k === 'dish') n += (st.item.n || 1) - 1;
    });
    s.players.forEach(function (p) { n += cleanPlatesHeld(p); if (p.hold && p.hold.k === 'dish') n += (p.hold.n || 1) - 1; });
    return n;
  };

  // ---------- つかむ・置く ----------
  E.primary = function (s, p) {
    if (s.phase === 'prep') return prepPrimary(s, p);
    if (s.phase !== 'service') return;
    var tg = E.getTarget(s, p);
    if (!tg) return;
    if (tg.k === 'station') return stationPrimary(s, p, tg.st);
    if (tg.k === 'slot') return slotPrimary(s, p, tg.c, tg.i);
  };

  function prepPrimary(s, p) {
    var tg = E.getTarget(s, p, true);
    if (p.hold && p.hold.k === 'station') {
      if (tg && tg.k === 'floor') {
        var before = layoutProblems(s, p);
        var st = p.hold.st; st.x = tg.x; st.y = tg.y;
        s.stations.push(st);
        var saved = s.players.map(function (q) { return [q.x, q.y]; });
        s.players.forEach(function (q) { depenetrate(s, q); });
        if (layoutProblems(s, p) > before) {
          // 通れない場所ができる置き方はしない（元に戻す）
          s.stations.pop();
          s.players.forEach(function (q, i) { q.x = saved[i][0]; q.y = saved[i][1]; });
          toast(s, 'ここに置くと、通れない場所ができます', 'warn');
          return;
        }
        p.hold = null;
        fx(s, { t: 'place', x: tg.x + 0.5, y: tg.y + 0.5 });
      } else if (tg && tg.why === 'trap') {
        toast(s, 'ここに置くと、通れない場所ができます', 'warn');
      } else {
        toast(s, 'ここには置けません。空いている床の方を向きましょう', 'warn');
      }
      return;
    }
    if (tg && tg.k === 'station') {
      s.stations.splice(s.stations.indexOf(tg.st), 1);
      p.hold = { k: 'station', st: tg.st };
      fx(s, { t: 'pick', x: tg.x + 0.5, y: tg.y + 0.5 });
    } else if (tg && tg.k === 'slot') {
      toast(s, '鉄板カウンターは動かせません', 'info');
    }
  }

  function stationPrimary(s, p, st) {
    var h = p.hold, def = D.stations[st.type];
    var px = st.x + 0.5, py = st.y + 0.5;
    // 食材の箱
    if (def.provides) {
      var kind = def.provides;
      // 肉は切り分けたものが入っている：つかむ＝1枚ずつ取る（4枚まで重ねて持てる）。戻すのは作業（長押し）。皿棚と同じ
      if (!h) {
        var item = (kind === 'rice') ? { k: 'rice', t: 0, n: 1 } : D.drinks[kind] ? { k: 'drink', ds: [kind], d: kind, n: 1 } : { k: 'steak', m: kind, t: 0, n: 1 };
        p.hold = item;
        s.stats.cost += itemCost(item);
        fx(s, { t: 'pick', x: px, y: py });
        return;
      }
      // ドリンクは種類を混ぜて重ねて持てる（4杯まで。お盆があれば6杯）
      if (h.k === 'drink' && D.drinks[kind]) {
        var dl = drinkList(h), dmax = E.carryMax(s, 'drink');
        if (dl.length >= dmax) return toast(s, 'これ以上は持てません（' + dmax + '杯まで' + (s.flags.tray ? '' : '。お盆があれば' + D.player.trayDrinkMax + '杯') + '）。戻すときは作業（長押し）', 'info');
        setDrinks(p, dl.concat([kind])); s.stats.cost += D.money.cost[kind];
        fx(s, { t: 'pick', x: px, y: py });
        return;
      }
      // 肉は、続けて押すと4つまで重ねて持てる
      if (h.k === 'steak' && h.m === kind && h.t === 0) {
        if ((h.n || 1) >= D.player.steakCarryMax) return toast(s, 'これ以上は持てません（' + D.player.steakCarryMax + 'つまで）。戻すときは作業（長押し）', 'info');
        h.n = (h.n || 1) + 1; s.stats.cost += D.money.cost[kind];
        fx(s, { t: 'pick', x: px, y: py });
        return;
      }
      var same = (h.k === 'rice' && kind === 'rice' && h.t === 0);
      // ご飯：お盆があれば4つまで重ねて持てる。お盆がなければ、もう一度押すと戻す（前と同じ）
      if (same && E.carryMax(s, 'rice') > 1) {
        if ((h.n || 1) >= E.carryMax(s, 'rice')) return toast(s, 'これ以上は持てません（' + E.carryMax(s, 'rice') + 'つまで）。戻すときは作業（長押し）', 'info');
        h.n = (h.n || 1) + 1; s.stats.cost += D.money.cost.rice;
        fx(s, { t: 'pick', x: px, y: py });
        return;
      }
      if (same) { s.stats.cost -= itemCost(h); p.hold = null; fx(s, { t: 'place', x: px, y: py }); return; }
      if (h.k === 'steak' && h.t === 0 && D.meats[kind]) return toast(s, E.meatName(h.m) + 'を持っています。焼くか、' + E.meatName(h.m) + 'のショーケースへ戻しましょう', 'info');
      return toast(s, '手がふさがっています', 'info');
    }
    switch (st.type) {
      case 'board':
        // まな板＝前菜を作る場所：きれいな皿を並べる（4枚まで）→ 作業（長押し）1回でまとめて盛る → 重ねて持って、1皿ずつ出す
        if (h && h.k === 'plates' && !h.dirty && (!st.item || st.item.k === 'plates')) {
          var have = st.item ? st.item.n : 0, put = Math.min(h.n, D.work.appMax - have);
          if (put <= 0) return toast(s, 'まな板に並べられるのは' + D.work.appMax + '皿までです。作業（長押し）で前菜を盛りましょう', 'info');
          st.item = { k: 'plates', n: have + put, dirty: false }; st.appT = 0; h.n -= put; if (h.n <= 0) p.hold = null;
          fx(s, { t: 'place', x: px, y: py });
          return;
        }
        if (!st.item && h) return toast(s, 'まな板では前菜を作ります。きれいな皿を置きましょう', 'info');
        if (st.item && !h) {
          p.hold = st.item; st.item = null; st.appT = 0;
          fx(s, { t: 'pick', x: px, y: py });
          return;
        }
        if (st.item && st.item.k === 'apps') return toast(s, '手を空けてから前菜を取りましょう', 'info');
        if (st.item && st.item.k === 'plates') return toast(s, '作業（長押し）で前菜を盛ります', 'info');
        return toast(s, 'まな板がふさがっています', 'info');
      case 'bench':
        if (h && !st.item) {
          st.item = h; p.hold = null;
          fx(s, { t: 'place', x: px, y: py });
          return;
        }
        // 焼く前の肉どうしは重ねて置ける（4枚まで）
        if (h && st.item && h.k === 'steak' && st.item.k === 'steak' && h.m === st.item.m && h.t === 0 && st.item.t === 0) {
          var room2 = 4 - (st.item.n || 1);
          if (room2 <= 0) return toast(s, 'これ以上は重ねられません', 'info');
          var mv = Math.min(room2, h.n || 1);
          st.item.n = (st.item.n || 1) + mv; h.n = (h.n || 1) - mv;
          if (h.n <= 0) p.hold = null;
          fx(s, { t: 'place', x: px, y: py });
          return;
        }
        if (h && st.item && h.k === 'plates' && st.item.k === 'plates' && h.dirty === st.item.dirty) {
          var moved = addPlatesToHand(p, st.item.n, st.item.dirty);
          st.item.n -= moved; if (st.item.n <= 0) st.item = null;
          fx(s, { t: 'pick', x: px, y: py });
          return;
        }
        if (!h && st.item) { p.hold = st.item; st.item = null; fx(s, { t: 'pick', x: px, y: py }); return; }
        if (h) return toast(s, '台がふさがっています', 'info');
        return;
      case 'rack':
        // つかむ＝押すたびに1枚ずつ取る（6枚まで重ねて持てる）。持っている皿を戻すのは作業（長押し）
        if (h && h.k === 'plates' && h.dirty) return toast(s, '汚れた皿は洗い場へ', 'warn');
        if (h && h.k === 'dish') return toast(s, '料理がのっています。お客様へ（いらなければゴミ箱へ）', 'info');
        if (h && h.k !== 'plates') return toast(s, '手がふさがっています', 'info');
        // 続けて押しても皿が戻らないように、戻すのは作業（長押し）だけ
        if (st.plates <= 0) return toast(s, h ? '皿棚は空です（持っている皿を戻すときは作業・長押し）' : '皿棚が空です。洗い場で洗いましょう', h ? 'info' : 'warn');
        if (h && h.n >= D.player.plateCarryMax) return toast(s, 'これ以上は持てません（' + D.player.plateCarryMax + '枚まで）。戻すときは作業（長押し）', 'info');
        addPlatesToHand(p, 1, false); st.plates--; fx(s, { t: 'pick', x: px, y: py });
        return;
      case 'sink':
      case 'washer':
        if (h && h.k === 'plates' && h.dirty) {
          var room = st.type === 'washer' ? Math.max(0, D.washerCap - st.dirty) : 99;
          var put = Math.min(room, h.n);
          if (put <= 0) return toast(s, '食洗機がいっぱいです', 'warn');
          st.dirty += put; h.n -= put; if (h.n <= 0) p.hold = null;
          fx(s, { t: 'place', x: px, y: py });
          return;
        }
        if (h && h.k === 'dish') return toast(s, '料理がのっています。お客様へ（いらなければゴミ箱へ）', 'info');
        if (h && h.k !== 'plates') return toast(s, '手がふさがっています', 'info');
        if (h) {
          // きれいな皿を持っている：取れるならもう1枚（戻すのは作業・長押し）
          if (st.clean > 0 && h.n < D.player.plateCarryMax) { addPlatesToHand(p, 1, false); st.clean--; fx(s, { t: 'pick', x: px, y: py }); return; }
          if (st.clean > 0) return toast(s, 'これ以上は持てません（' + D.player.plateCarryMax + '枚まで）。戻すときは作業（長押し）', 'info');
          return toast(s, 'きれいな皿はもうありません（持っている皿を戻すときは作業・長押し）', 'info');
        }
        if (st.clean > 0) { addPlatesToHand(p, 1, false); st.clean--; fx(s, { t: 'pick', x: px, y: py }); return; }
        if (st.dirty > 0) return toast(s, st.type === 'sink' ? '作業（長押し）で洗います' : '自動で洗っています', 'info');
        return;
      case 'trash':
        if (!h) return;
        if (h.k === 'plates') return toast(s, '皿は捨てられません', 'info');
        if (h.k === 'apps') {   // 前菜だけ捨てて、皿は手に残る
          addLoss(s, h); fx(s, { t: 'trash', x: px, y: py, cost: itemCost(h) });
          p.hold = { k: 'plates', n: h.n || 1, dirty: false };
          return;
        }
        if (h.k === 'dish') {
          if (classify(h.food) === 'burnt') s.stats.burnt++;
          addLoss(s, h.food);
          fx(s, { t: 'trash', x: px, y: py, cost: itemCost(h.food) });
          p.hold = { k: 'plates', n: h.n || 1, dirty: false };
          return;
        }
        if (classify(h) === 'burnt') s.stats.burnt++;
        addLoss(s, h); p.hold = null;
        fx(s, { t: 'trash', x: px, y: py, cost: itemCost(h) });
        return;
    }
  }

  // カウンターで待っているお客様（相席なら複数の組）。idx は席の番号（組の先頭の席 off ＋ 組の中の番号）
  function seatedGuests(s, c) {
    var out = [];
    groupsAt(s, c).forEach(function (g) { if (g.state === 'waiting') g.guests.forEach(function (gu, j) { out.push({ gu: gu, idx: (g.off || 0) + j, g: g }); }); });
    return out;
  }
  function guestsWanting(s, c, item) {
    return seatedGuests(s, c).filter(function (o) {
      if (item.k === 'steak') return o.gu.order.main === item.m && !o.gu.got.main;
      if (item.k === 'rice') return o.gu.order.rice && !o.gu.got.rice;
      if (item.k === 'app' || item.k === 'apps') return (o.gu.got.apps || 0) < (o.gu.order.apps || 0);
      if (item.k === 'drink') return drinkList(item).indexOf(o.gu.order.drink) >= 0 && !o.gu.got.drink;
      return false;
    });
  }
  E.guestsWanting = guestsWanting;

  // 出せる相手を探す（同じ種類 → 上の肉を通常のお客様へ「サービス」→ 下の肉をエンペラーのお客様へ「取り違え」）
  // ハラルのお客様には、ハラル牛しか出さない。部位が違う（サーロインのご注文にフィレ）も取り違え
  function rankOf(m) { return (D.meats[m] || D.meats.beef).rank; }
  function substOf(have, want) {
    var a = rankOf(have), b = rankOf(want);
    if (a !== b) return a > b ? 'up' : 'down';
    return have === 'halal' ? 'up' : 'down';
  }
  function servableGuests(s, c, item) {
    if (!item) return [];
    var out = [];
    seatedGuests(s, c).forEach(function (o) {
      var gu = o.gu, idx = o.idx, g = o.g;
      if (item.k === 'steak') {
        if (gu.got.main) return;
        var want = gu.order.main, have = item.m;
        if (want === have) out.push({ gu: gu, idx: idx, g: g, subst: null });
        else if (want === 'halal') return;
        else out.push({ gu: gu, idx: idx, g: g, subst: substOf(have, want) });
      } else if (item.k === 'rice') { if (gu.order.rice && !gu.got.rice) out.push({ gu: gu, idx: idx, g: g, subst: null }); }
      else if (item.k === 'app' || item.k === 'apps') { if ((gu.got.apps || 0) < (gu.order.apps || 0)) out.push({ gu: gu, idx: idx, g: g, subst: null }); }
      else if (item.k === 'drink') { if (gu.order.drink && drinkList(item).indexOf(gu.order.drink) >= 0 && !gu.got.drink) out.push({ gu: gu, idx: idx, g: g, subst: null }); }
    });
    return out;
  }
  E.servableGuests = servableGuests;
  function pickGuest(list, item, i) {
    var cl = classify(item);
    var tiers = [null, 'up', 'down'];
    for (var t = 0; t < tiers.length; t++) {
      var cand = list.filter(function (o) { return o.subst === tiers[t]; });
      if (!cand.length) continue;
      cand.sort(function (a, b) {
        var da = (item.k === 'steak' && a.gu.order.done === cl) ? 0 : 1, db = (item.k === 'steak' && b.gu.order.done === cl) ? 0 : 1;
        return (da - db) || (Math.abs(a.idx - i) - Math.abs(b.idx - i));
      });
      return cand[0];
    }
    return null;
  }
  // ほかの鉄板で、同じ肉（代わりではない）を頼んだお客様がいる鉄板
  function whereExact(s, item, except) {
    var hit = null;
    s.counters.forEach(function (c) {
      if (hit || !c.unlocked || c === except) return;
      if (servableGuests(s, c, item).some(function (o) { return o.subst === null; })) hit = c.id;
    });
    return hit;
  }
  E.whereExact = whereExact;
  // ほかの鉄板で、これを出せるお客様（同じ種類を優先）
  function whereServable(s, item, except) {
    var best = null;
    s.counters.forEach(function (c) {
      if (!c.unlocked || c === except) return;
      var list = servableGuests(s, c, item);
      if (!list.length) return;
      var exact = list.some(function (o) { return o.subst === null; });
      if (!best || (exact && !best.exact)) best = { id: c.id, exact: exact };
    });
    return best ? best.id : null;
  }
  E.whereServable = whereServable;
  function foodName(item) {
    if (!item) return '';
    if (item.k === 'steak') return E.meatName(item.m);
    if (item.k === 'rice') return 'ご飯';
    if (item.k === 'app' || item.k === 'apps') return '前菜';
    if (item.k === 'drink') return D.drinks[item.d].name;
    return '';
  }
  E.foodName = foodName;
  // ここで出せない理由（答えを具体的に返す）
  function whyNot(s, c, item) {
    var gs = groupsAt(s, c), has = function (st) { return gs.some(function (g) { return g.state === st; }); };
    var waiting = gs.filter(function (g) { return g.state === 'waiting'; });
    var where = whereServable(s, item, c);
    if (!waiting.length && has('ordering')) return 'このお客様は、まだ注文を決めているところです';
    if (!waiting.length && has('walkIn')) return 'お客様が席に向かっているところです';
    if (item.k === 'steak' && item.m !== 'halal' && waiting.some(function (g) { return g.guests.some(function (gu) { return !gu.got.main && gu.order.main === 'halal'; }); }))
      return 'ハラルのお客様には、ハラル牛をお出しします';
    if (where) return foodName(item) + 'は、鉄板' + where + 'のお客様の分です';
    if (!waiting.length && has('eating')) return 'このお客様には、もう全部お出ししました';
    return foodName(item) + 'を待っているお客様はいません';
  }
  E.whyNot = whyNot;

  // noPlate：皿を使わずに出した（ドリンク・手に持ったご飯）。皿を使ったものだけ、席に皿が残る
  function serveTo(s, c, o, food, px, noPlate) {
    var gu = o.gu, cl = classify(food);
    if (food.k === 'steak') {
      gu.got.main = true; s.stats.mains++;
      gu.servedMain = food.m; gu.subst = o.subst; gu.servedDone = cl;
      // 取り違えは2種類に分けて数える（監査 F03）：焼き加減ちがい（wrongDone）と、下の肉・別の部位を出した（wrongPart）。wrong はその合計
      var wDone = gu.order.done !== cl, wPart = o.subst === 'down', wrong = wDone || wPart;
      if (wrong) { gu.wrong = true; s.stats.wrong++; }
      if (wDone) s.stats.wrongDone = (s.stats.wrongDone || 0) + 1;
      if (wPart) s.stats.wrongPart = (s.stats.wrongPart || 0) + 1;
      if (o.subst) s.stats.mixups = (s.stats.mixups || 0) + 1;
      if (o.subst === 'up') {
        var diff = D.money.cost[food.m] - D.money.cost[gu.order.main];
        if (diff > 0) { s.stats.loss += diff; s.stats.lossItems++; }
      }
      afterServe(s, c, o.idx, !wrong, px, cl, gu.order.done, o.subst, food.m, gu.order.main);
    } else {
      if (food.k === 'rice') gu.got.rice = true;
      else if (food.k === 'app') { gu.got.apps = (gu.got.apps || 0) + 1; (gu.appAt = gu.appAt || []).push(s.t); }
      else if (food.k === 'drink') gu.got.drink = true;
      afterServe(s, c, o.idx, true, px, null, null, null, food.k === 'drink' ? food.d : food.k);
    }
    if (food.k !== 'drink' && !noPlate) gu.dishes = (gu.dishes || 0) + 1;
  }

  function slotPrimary(s, p, c, i) {
    var h = p.hold, slot = c.slots[i];
    var px = c.x0 + i + 0.5, py = 3.5;
    var dirtyTotal = c.dirty.reduce(function (a, b) { return a + b; }, 0);
    // 前菜（重ねて持っていれば、1皿ずつ出す）
    if (h && h.k === 'apps') {
      var ao = pickGuest(servableGuests(s, c, h), h, i);
      if (!ao) return toast(s, whyNot(s, c, h), 'info');
      if ((h.n || 1) > 1) h.n--; else p.hold = null;
      serveTo(s, c, ao, { k: 'app' }, px);
      return;
    }
    // ドリンク（重ねて持っていれば、そのお客様の頼んだ1杯を出す。種類が混ざっていてもよい）
    if (h && h.k === 'drink') {
      var so = pickGuest(servableGuests(s, c, h), h, i);
      if (!so) return toast(s, whyNot(s, c, h), 'info');
      var dl2 = drinkList(h).slice(), dd = so.gu.order.drink;
      dl2.splice(dl2.indexOf(dd), 1); setDrinks(p, dl2);
      serveTo(s, c, so, { k: 'drink', d: dd, ds: [dd], n: 1 }, px);
      return;
    }
    // 焼き上がったガーリックライス：手に持ったまま出せる（2026-10-28 本人の指摘「出来上がっても提供できない」）
    if (h && h.k === 'rice' && classify(h) === 'ok') {
      var ro = pickGuest(servableGuests(s, c, h), h, i);
      if (ro) { var one = { k: 'rice', t: h.t, n: 1 }; if ((h.n || 1) > 1) h.n--; else p.hold = null; serveTo(s, c, ro, one, px, true); return; }
      // お盆があれば、焼き上がったご飯を重ねて持てる（4つまで）
      if (slot && slot.k === 'rice' && classify(slot) === 'ok' && (h.n || 1) < E.carryMax(s, 'rice')) {
        h.n = (h.n || 1) + 1; c.slots[i] = null; fx(s, { t: 'pick', x: px, y: py }); return;
      }
      if (slot || c.needsScrape) return toast(s, whyNot(s, c, h), 'info');   // 空いた鉄板がなければ理由だけ
    }
    if (h && h.k === 'rice' && classify(h) === 'burnt') return toast(s, '焦げています。ゴミ箱へ', 'warn');
    // 生の肉・ご飯を焼く
    if (h && (h.k === 'steak' || h.k === 'rice')) {
      if (slot) return toast(s, 'この鉄板は使用中です', 'info');
      if (c.needsScrape) return toast(s, '先に鉄板を掃除しましょう（作業・長押し）', 'warn');
      if (h.n > 1) { c.slots[i] = { k: h.k, m: h.m, t: h.t, n: 1 }; h.n--; }
      else { h.n = 1; c.slots[i] = h; p.hold = null; }
      fx(s, { t: 'sizzle', x: px, y: py });
      return;
    }
    // 皿を持って鉄板へ ＝ 盛って出す（ここのお客様の分でなければ、皿に盛って運べる）
    if (h && h.k === 'plates' && !h.dirty) {
      if (slot) {
        var cl = classify(slot);
        if (cl === 'raw') return toast(s, 'まだ生です', 'info');
        if (cl === 'burnt') return toast(s, '焦げています。ゴミ箱へ', 'warn');
        // 出す相手の順番（監査 F01 2026-10-28）：①ここに同じ肉を頼んだ人 → 出す ②ほかの鉄板に同じ肉を頼んだ人 → 皿に盛って運ぶ
        //  ③どこにもいない → ここで代わりに出す（サービス／取り違え）。①より先に代わりを出すと、運ぶつもりの肉が取り違えになった
        var here = servableGuests(s, c, slot);
        var pick = pickGuest(here.filter(function (o) { return o.subst === null; }), slot, i);
        if (pick) { c.slots[i] = null; usePlate(p); serveTo(s, c, pick, slot, px); return; }
        var far = whereExact(s, slot, c);
        if (far) {
          p.hold = { k: 'dish', food: slot, n: h.n };
          c.slots[i] = null;
          fx(s, { t: 'pick', x: px, y: py });
          return toast(s, foodName(slot) + 'をお皿に盛りました。鉄板' + far + 'のお客様へ運びましょう', 'info');
        }
        pick = pickGuest(here, slot, i);
        if (pick) { c.slots[i] = null; usePlate(p); serveTo(s, c, pick, slot, px); return; }
        var where = whereServable(s, slot, c);
        if (where) {
          p.hold = { k: 'dish', food: slot, n: h.n };
          c.slots[i] = null;
          fx(s, { t: 'pick', x: px, y: py });
          return toast(s, foodName(slot) + 'をお皿に盛りました。鉄板' + where + 'のお客様へ運びましょう', 'info');
        }
        return toast(s, whyNot(s, c, slot), 'info');
      }
      if (dirtyTotal > 0) return toast(s, '汚れた皿は、手を空けてから回収', 'info');
      return;
    }
    // 料理をのせた皿を出す（出せなければ、空いた鉄板に戻せる）
    if (h && h.k === 'dish') {
      // 同じ肉を頼んだ人がここにいなくて、ほかの鉄板にいるなら、ここでは代わりに出さない（運ぶ途中で取り違えにしない）
      var dl = servableGuests(s, c, h.food), dExact = dl.filter(function (o) { return o.subst === null; });
      var dFar = !dExact.length && whereExact(s, h.food, c);
      var dp = dFar ? null : pickGuest(dl, h.food, i);
      if (dp) {
        var food = h.food, rest = (h.n || 1) - 1;
        p.hold = rest > 0 ? { k: 'plates', n: rest, dirty: false } : null;
        serveTo(s, c, dp, food, px);
        return;
      }
      if (!slot && !c.needsScrape) {
        c.slots[i] = h.food; p.hold = { k: 'plates', n: h.n || 1, dirty: false };
        fx(s, { t: 'sizzle', x: px, y: py });
        return toast(s, '鉄板に戻しました（' + (dFar ? '鉄板' + dFar + 'のお客様の分です' : whyNot(s, c, h.food)) + '）', 'info');
      }
      return toast(s, dFar ? foodName(h.food) + 'は鉄板' + dFar + 'のお客様の分です' : whyNot(s, c, h.food), 'info');
    }
    // 汚れた皿を回収
    if ((!h || (h.k === 'plates' && h.dirty)) && dirtyTotal > 0) {
      var took = 0;
      for (var k = 0; k < c.seats; k++) {
        if (c.dirty[k] > 0) { var got = addPlatesToHand(p, c.dirty[k], true); c.dirty[k] -= got; took += got; }
      }
      if (!took) return toast(s, 'これ以上は持てません（' + D.player.plateCarryMax + '枚まで）。先に洗い場へ', 'warn');
      fx(s, { t: 'pick', x: px, y: py });
      return;
    }
    // 焼き上がったガーリックライスは、手ぶらでもそのままお出しする（このカウンターに頼んだ人がいれば）
    if (!h && slot && slot.k === 'rice' && classify(slot) === 'ok') {
      var rs = pickGuest(servableGuests(s, c, slot), slot, i);
      if (rs) { c.slots[i] = null; serveTo(s, c, rs, slot, px, true); return; }
    }
    if (!h && slot) { p.hold = slot; c.slots[i] = null; fx(s, { t: 'pick', x: px, y: py }); return; }
  }

  // 前菜は食べ終えたら下げる：出してから appEatSec 秒で、その席の汚れた皿になる（皿がテーブルに止まって足りなくなるのを防ぐ。実店舗と同じ）
  function clearApps(s, g, c) {
    if (!c) return;
    g.guests.forEach(function (gu, i) {
      if (!gu.appAt || !gu.appAt.length || s.t - gu.appAt[0] < D.guests.appEatSec) return;
      gu.appAt.shift(); gu.dishes = Math.max(0, (gu.dishes || 0) - 1); c.dirty[(g.off || 0) + i] += 1;
    });
  }
  function afterServe(s, c, idx, good, px, done, want, subst, have, wantMain) {
    var g = groupAtSeat(s, c, idx);
    g.patience = Math.min(g.pMax, g.patience + g.pMax * D.guests.refillOnServe);
    g.lastServeRatio = g.patience / g.pMax;
    fx(s, { t: 'serve', x: px, y: 2.6, good: good, done: done, want: want, seat: c.x0 + idx, subst: subst || null, have: have, wantMain: wantMain, wait: g.orderAt != null ? Math.round((s.t - g.orderAt) * 10) / 10 : null });
    var complete = g.guests.every(guestDone);
    if (complete && g.state === 'waiting') { g.state = 'eating'; g.t = D.guests.eatSec; }
  }

  // ---------- 作業（長押し） ----------
  E.workable = function (s, p) {
    if (s.phase !== 'service') return null;
    var tg = E.getTarget(s, p);
    if (!tg) return null;
    if (tg.k === 'station') {
      var st = tg.st;
      // 焼く前の肉・ドリンクを、同じ種類のショーケース・サーバーへ戻す
      var prov = D.stations[st.type].provides;
      var back = p.hold && ((p.hold.k === 'steak' && p.hold.t === 0 && p.hold.m) || (p.hold.k === 'drink' && drinkList(p.hold).indexOf(prov) >= 0 && prov) || (p.hold.k === 'rice' && p.hold.t === 0 && 'rice'));
      if (back && prov === back) return { kind: 'returnMeat', st: st, need: D.work.returnPlates, prog: st.takeT || 0 };
      // まな板の皿 → 前菜
      if (st.type === 'board' && st.item && st.item.k === 'plates') return { kind: 'app', st: st, need: D.work.app + D.work.appPer * ((st.item.n || 1) - 1), prog: st.appT || 0 };
      if (st.type === 'sink' && st.dirty > 0) return { kind: 'wash', st: st, need: D.work.wash, prog: st.washT };
      var plateHome = st.type === 'rack' || st.type === 'sink' || st.type === 'washer';
      if (plateHome && p.hold && p.hold.k === 'plates' && !p.hold.dirty) return { kind: 'returnPlates', st: st, need: D.work.returnPlates, prog: st.takeT || 0 };
      return null;
    }
    // 思い出づくり：前の席の組（相席なら、その席の組。空いた席なら近い組）
    var c = tg.c, cand = groupsAt(s, c).filter(function (x) { return (x.state === 'waiting' || x.state === 'eating') && !x.mc; });
    cand.sort(function (a, b) { var da = Math.abs((a.off || 0) + (a.size - 1) / 2 - tg.i), db = Math.abs((b.off || 0) + (b.size - 1) / 2 - tg.i); return da - db; });
    var g = cand[0] || null;
    if (g) return { kind: 'mc', c: c, g: g, need: E.mcNeed(g), prog: g.mcT, stage: E.mcStage(g) };
    if (counterEmpty(c) && c.needsScrape) return { kind: 'scrape', c: c, need: D.work.scrape, prog: c.scrapeT };
    return null;
  };

  E.work = function (s, p, dt) {
    var w = E.workable(s, p);
    p.workOn = w ? w.kind : null;
    if (!w) return;
    if (w.kind === 'app') {
      w.st.appT = (w.st.appT || 0) + dt;
      if (w.st.appT >= w.need) {
        var na = w.st.item.n || 1;
        w.st.appT = 0; w.st.item = { k: 'apps', n: na }; s.stats.cost += D.money.cost.app * na;
        fx(s, { t: 'appDone', x: w.st.x + 0.5, y: w.st.y + 0.5 });
      }
    } else if (w.kind === 'returnMeat') {
      w.st.takeT = (w.st.takeT || 0) + dt;
      if (w.st.takeT >= w.need) {
        w.st.takeT = 0;
        // ドリンクが混ざっていれば、このサーバーの種類だけを戻す
        var pv = D.stations[w.st.type].provides;
        if (p.hold.k === 'drink') { var keep = drinkList(p.hold).filter(function (d) { return d !== pv; }); s.stats.cost -= (drinkList(p.hold).length - keep.length) * D.money.cost[pv]; setDrinks(p, keep); }
        else { s.stats.cost -= itemCost(p.hold); p.hold = null; }
        fx(s, { t: 'place', x: w.st.x + 0.5, y: w.st.y + 0.5 });
      }
    } else if (w.kind === 'wash') {
      w.st.washT += dt;
      if (w.st.washT >= w.need) { w.st.washT = 0; w.st.dirty--; w.st.clean++; fx(s, { t: 'washDone', x: w.st.x + 0.5, y: w.st.y + 0.5 }); }
    } else if (w.kind === 'mc') {
      w.g.mcT += dt; w.g.mcAt = s.t;
      if (w.g.mcT >= w.need) finishMc(s, w.g, w.c, p.staff ? 'staff' : 'player');
    } else if (w.kind === 'returnPlates') {
      w.st.takeT = (w.st.takeT || 0) + dt;
      if (w.st.takeT >= w.need) {
        w.st.takeT = 0;
        if (w.st.type === 'rack') w.st.plates += p.hold.n; else w.st.clean += p.hold.n;
        p.hold = null;
        fx(s, { t: 'place', x: w.st.x + 0.5, y: w.st.y + 0.5 });
      }
    } else if (w.kind === 'scrape') {
      w.c.scrapeT += dt;
      if (w.c.scrapeT >= w.need) { w.c.scrapeT = 0; w.c.needsScrape = false; fx(s, { t: 'scrapeDone', x: w.c.x0 + w.c.seats / 2, y: 3.5 }); }
    }
  };

  // 思い出づくりの頃合い：肉を何人分お出ししたか（全員分お出しした後＝最後の肉のフランベが、いちばん喜ばれる）
  E.mcStage = function (g) {
    var n = g.guests.filter(function (gu) { return gu.got.main; }).length;
    return n === 0 ? 'early' : n < g.guests.length ? 'mid' : 'last';
  };
  E.mcNeed = function (g) { return D.rating.mcStage[E.mcStage(g)].need; };
  function finishMc(s, g, c, by) {
    var stage = E.mcStage(g);
    g.mc = true; g.mcT = 0; g.mcStage = stage; s.stats.mc++;
    s.stats.mcStages = s.stats.mcStages || { early: 0, mid: 0, last: 0 };
    s.stats.mcStages[stage]++;
    fx(s, { t: 'mc', x: c.x0 + (g.off || 0) + g.size / 2, y: 2.4, by: by, anniv: g.anniv, stage: stage });
  }

  // ---------- 1ステップ ----------
  // inputs: [{mx, my, grab, work}]  grab は押した瞬間だけ true
  E.step = function (s, dt, inputs) {
    if (s.phase !== 'service' && s.phase !== 'prep') return;
    // スタッフの入力は Bot が作る（どこから E.step を呼んでも、スタッフは自分で動く）
    inputs = inputs || [];
    if (s.phase === 'service' && s.players.length > inputs.length && WK.Bot && WK.Bot.staffInputs) inputs = inputs.concat(WK.Bot.staffInputs(s, dt, inputs.length));
    for (var pi = 0; pi < s.players.length; pi++) {
      var p = s.players[pi], inp = (inputs && inputs[pi]) || {};
      movePlayer(s, p, inp, dt);
      if (inp.grab) E.primary(s, p);
      if (inp.work && s.phase === 'service') E.work(s, p, dt); else p.workOn = null;
    }
    if (s.phase !== 'service') return;
    s.t += dt;
    cook(s, dt);
    spawnTick(s);
    groupsTick(s, dt);
    staffTick(s, dt);
    statsTick(s, dt);
    if (s.stats.complaints >= D.day.complaintLimit) return failDay(s);
    if (s.t >= s.window && s.spawns.length === 0 && s.groups.length === 0) closeDay(s);
  };

  // 体が設備や壁にめり込んでいたら押し出す（どんな置き方をしても動けなくならないように）
  function depenetrate(s, p) {
    var r = D.player.radius;
    for (var it = 0; it < 6; it++) {
      var moved = false;
      var x0 = Math.floor(p.x - r), x1 = Math.floor(p.x + r), y0 = Math.floor(p.y - r), y1 = Math.floor(p.y + r);
      for (var ty = y0; ty <= y1; ty++) for (var tx = x0; tx <= x1; tx++) {
        if (!isSolid(s, tx, ty)) continue;
        var cx = Math.max(tx, Math.min(p.x, tx + 1)), cy = Math.max(ty, Math.min(p.y, ty + 1));
        var dx = p.x - cx, dy = p.y - cy, d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;
        if (d2 > 1e-10) { var d = Math.sqrt(d2), push = r - d + 0.002; p.x += dx / d * push; p.y += dy / d * push; }
        else { var f = nearestFree(s, tx, ty); if (f) { p.x = f[0] + 0.5; p.y = f[1] + 0.5; } }
        moved = true;
      }
      if (!moved) return;
    }
    if (collides(s, p.x, p.y, r)) {
      var t = nearestFree(s, Math.floor(p.x), Math.floor(p.y));
      if (t) { p.x = t[0] + 0.5; p.y = t[1] + 0.5; }
    }
  }
  E.depenetrate = depenetrate;

  function layoutProblems(s, p) {
    var tx = Math.floor(p.x), ty = Math.floor(p.y);
    if (isSolid(s, tx, ty)) return 999;
    var reach = reachable(s, tx, ty), n = 0;
    s.stations.forEach(function (st) { if (!stationReachable(s, st, reach)) n++; });
    s.counters.forEach(function (c) {
      if (!c.unlocked) return;
      for (var i = 0; i < c.seats; i++) if (!reach[4 * MW + c.x0 + i]) n++;
    });
    return n;
  }
  E.layoutProblems = layoutProblems;

  function movePlayer(s, p, inp, dt) {
    if (collides(s, p.x, p.y, D.player.radius)) depenetrate(s, p);
    var mx = inp.mx || 0, my = inp.my || 0;
    var len = Math.sqrt(mx * mx + my * my);
    p.moving = len > 0.15;
    if (!p.moving) return;
    if (len > 1) { mx /= len; my /= len; }
    if (Math.abs(mx) > Math.abs(my)) { p.fx = mx > 0 ? 1 : -1; p.fy = 0; } else { p.fx = 0; p.fy = my > 0 ? 1 : -1; }
    var sp = D.player.speed * (s.flags.sneakers ? 1.15 : 1) * (p.staff ? D.staff[p.role].speed : 1) * dt;
    var r = D.player.radius;
    var nx = p.x + mx * sp;
    if (!collides(s, nx, p.y, r)) p.x = nx;
    else if (Math.abs(mx) > Math.abs(my)) cornerAssist(s, p, mx > 0 ? 1 : -1, 0, sp);
    var ny = p.y + my * sp;
    if (!collides(s, p.x, ny, r)) p.y = ny;
    else if (Math.abs(my) > Math.abs(mx)) cornerAssist(s, p, 0, my > 0 ? 1 : -1, sp);
    p.bob += dt * 10;
  }
  // 曲がり角の手助け：まっすぐ進めないとき、すぐ横に通れる1マスの道があれば、その道の真ん中へ体を寄せる
  // （設備と設備のあいだの1マスは、体の中心が真ん中±0.2に入らないと通れない。キーだけで歩くと角に引っかかった）
  var ASSIST = 0.6;   // 道の真ん中からこの距離までなら寄せる（正面の設備に向かっているときは寄せない）
  function cornerAssist(s, p, dx, dy, sp) {
    var r = D.player.radius;
    var along = dx ? p.x : p.y, side = dx ? p.y : p.x;
    var ahead = Math.floor(along + (dx || dy) * (r + sp + 0.01));
    var base = Math.floor(side), best = null;
    for (var k = base - 1; k <= base + 1; k++) {
      var d = k + 0.5 - side;
      if (Math.abs(d) > ASSIST || Math.abs(d) < 1e-6) continue;
      if (isSolid(s, dx ? ahead : k, dx ? k : ahead)) continue;
      if (best === null || Math.abs(d) < Math.abs(best)) best = d;
    }
    if (best === null) return;
    var step = (best > 0 ? 1 : -1) * Math.min(sp, Math.abs(best));
    var tx = dx ? p.x : p.x + step, ty = dx ? p.y + step : p.y;
    if (!collides(s, tx, ty, r)) { p.x = tx; p.y = ty; }
  }
  function collides(s, x, y, r) {
    var x0 = Math.floor(x - r), x1 = Math.floor(x + r), y0 = Math.floor(y - r), y1 = Math.floor(y + r);
    for (var ty = y0; ty <= y1; ty++) for (var tx = x0; tx <= x1; tx++) {
      if (!isSolid(s, tx, ty)) continue;
      var cx = Math.max(tx, Math.min(x, tx + 1)), cy = Math.max(ty, Math.min(y, ty + 1));
      var dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy < r * r) return true;
    }
    return false;
  }
  E.collides = collides;

  // 焼ける速さ＝難易度 × 高火力鉄板（古い保存データは難易度なし＝ノーマル）
  function heat(s) {
    var d = D.difficulties[s.difficulty] || D.difficulties[D.defaultDifficulty];
    return d.cook * (s.flags.highHeat ? D.highHeatMult : 1);
  }
  E.heat = heat;
  function cook(s, dt) {
    var k = heat(s);
    s.counters.forEach(function (c) {
      c.slots.forEach(function (it, i) {
        if (!it || (it.k !== 'steak' && it.k !== 'rice')) return;
        var before = classify(it);
        it.t += dt * k;
        var after = classify(it);
        if (after !== before) fx(s, { t: 'doneness', x: c.x0 + i + 0.5, y: 3.5, d: after });
      });
    });
  }

  // ---------- 相席（2026-10-28 本人指定）：席ごとに座っている組を持つ ----------
  function seatGroupOf(c) { if (!c.seatGroup) c.seatGroup = new Array(c.seats).fill(null); return c.seatGroup; }
  function groupsAt(s, c) {
    var ids = [];
    seatGroupOf(c).forEach(function (id) { if (id && ids.indexOf(id) < 0) ids.push(id); });
    return ids.map(function (id) { return groupById(s, id); }).filter(Boolean);
  }
  function groupAtSeat(s, c, i) { var id = seatGroupOf(c)[i]; return id ? groupById(s, id) : null; }
  function counterEmpty(c) { return seatGroupOf(c).every(function (id) { return !id; }); }
  E.groupsAt = groupsAt; E.groupAtSeat = groupAtSeat; E.counterEmpty = counterEmpty;
  // 人数分の空いた席が並んでいるところ（汚れた皿がなく、掃除待ちでない）。先に座っている組の隣を優先（4人席を残す）
  function findSeats(s, size) {
    var best = null;
    s.counters.forEach(function (c) {
      if (!c.unlocked || c.needsScrape) return;
      var sg = seatGroupOf(c);
      for (var off = 0; off + size <= c.seats; off++) {
        var ok = true;
        for (var j = 0; j < size; j++) if (sg[off + j] || c.dirty[off + j] > 0) { ok = false; break; }
        if (!ok) continue;
        var left = sg.filter(function (id) { return !id; }).length - size;   // 座ったあとに残る空き席（少ないほど詰まっている）
        if (!best || left < best.left) best = { c: c, off: off, left: left };
        break;
      }
    });
    return best;
  }
  E.findSeats = findSeats;
  function seatAt(s, g, c, off) {
    var sg = seatGroupOf(c);
    g.counter = c.id; g.off = off;
    for (var j = 0; j < g.size; j++) sg[off + j] = g.id;
  }
  E.seatAt = seatAt;
  E.freeCounter = function (s) { var f = findSeats(s, 1); return f ? f.c : null; };

  function spawnTick(s) {
    while (s.spawns.length && s.spawns[0].t <= s.t) {
      var sp = s.spawns.shift();
      var pm = patienceMult(s);
      var g = { id: s.nextId++, size: sp.size, guests: sp.guests, anniv: sp.anniv, halal: sp.halal,
        state: 'queue', t: 0, px: D.door.x + 0.5, py: D.door.y + 0.5,
        patience: D.guests.queuePatience * pm, pMax: D.guests.queuePatience * pm,
        counter: null, mc: false, mcT: 0, mcAt: 0, care: 0, lastServeRatio: 1, waitFood: 0 };
      s.groups.push(g); s.queue.push(g.id);
      fx(s, { t: 'arrive', x: g.px, y: g.py });
    }
    // 空いた席へ案内（相席あり）。人数分の席がなければ外で待つ。先頭の組が座れなくても、後ろの組が座れるなら先に案内する
    for (var qi = 0; qi < s.queue.length;) {
      var gg = groupById(s, s.queue[qi]);
      if (!gg) { s.queue.splice(qi, 1); continue; }
      var at = findSeats(s, gg.size);
      if (!at) { qi++; continue; }
      s.queue.splice(qi, 1);
      gg.state = 'walkIn'; seatAt(s, gg, at.c, at.off);
      gg.tx = at.c.x0 + at.off + gg.size / 2;
    }
  }
  function groupById(s, id) { for (var i = 0; i < s.groups.length; i++) if (s.groups[i].id === id) return s.groups[i]; return null; }
  E.groupById = groupById;
  function counterById(s, id) { for (var i = 0; i < s.counters.length; i++) if (s.counters[i].id === id) return s.counters[i]; return null; }
  E.counterById = counterById;
  E.groupOf = function (s, c) { return groupsAt(s, c)[0] || null; };

  // 関わった時間：組の前（鉄板の内側の1列）に立っていた秒数。スタッフは半分に数える
  function careTick(s, g, c, dt) {
    if (!c) return;
    var x0 = c.x0 + (g.off || 0) - 0.2, x1 = c.x0 + (g.off || 0) + g.size + 0.2;
    var k = 0;
    s.players.forEach(function (p) { if (p.y < 5.3 && p.x >= x0 && p.x <= x1) k = Math.max(k, p.staff ? D.rating.care.staffK : 1); });
    g.care = (g.care || 0) + k * dt;
  }
  E.careFrac = function (g) { var C = D.rating.care; return Math.min(1, (g.care || 0) / (C.full + C.perGuest * g.size)); };

  function groupsTick(s, dt) {
    var pm = patienceMult(s);
    for (var gi = s.groups.length - 1; gi >= 0; gi--) {
      var g = s.groups[gi];
      var c = g.counter ? counterById(s, g.counter) : null;
      switch (g.state) {
        case 'queue':
          g.patience -= dt;
          if (g.patience <= 0) giveUp(s, g);
          break;
        case 'walkIn':
          g.px += Math.sign(g.tx - g.px) * Math.min(Math.abs(g.tx - g.px), D.guests.walkSpeed * dt);
          g.py = D.door.y + 0.5;
          if (Math.abs(g.tx - g.px) < 0.01) {
            g.state = 'ordering'; g.t = D.guests.orderSec;
            g.pMax = (D.guests.patienceBase + D.guests.patiencePerGuest * g.size) * pm;
            g.patience = g.pMax;
          }
          break;
        case 'ordering':
          g.t -= dt;
          if (g.t <= 0) { g.state = 'waiting'; g.orderAt = s.t; fx(s, { t: 'order', x: g.px, y: 2.2 }); }
          break;
        case 'waiting':
          g.patience -= dt; g.waitFood += dt;
          clearApps(s, g, c);
          careTick(s, g, c, dt);
          if (g.patience <= 0) leaveAngry(s, g, c);
          break;
        case 'eating':
          g.t -= dt;
          clearApps(s, g, c);
          careTick(s, g, c, dt);
          // 思い出づくりの途中なら、撮り終わるまで待ってくださる
          if (g.t <= 0 && !(g.mcT > 0 && s.t - (g.mcAt || 0) < 0.25)) pay(s, g, c);
          break;
        case 'leaving':
          var door = D.door.x + 0.5, toDoor = door - g.px;   // 入口へ歩いて帰る（入口は左右どちらでも）
          g.px += Math.sign(toDoor) * Math.min(Math.abs(toDoor), D.guests.walkSpeed * 1.2 * dt);
          g.py = D.door.y + 0.5;
          if (Math.abs(door - g.px) < 0.01) s.groups.splice(gi, 1);
          break;
      }
    }
  }

  // 帰った組の席は空く（皿は汚れた皿として残る）。鉄板の掃除は、カウンターが空になったときにまとめて
  function vacate(s, g, c) {
    if (!c) return;
    var off = g.off || 0, sg = seatGroupOf(c);
    g.guests.forEach(function (gu, i) { c.dirty[off + i] += (gu.dishes || 0); if (sg[off + i] === g.id) sg[off + i] = null; });
    if (counterEmpty(c)) { c.needsScrape = true; c.scrapeT = 0; }
  }

  function leaveAngry(s, g, c) {
    s.stats.complaints++;
    s.stats.ratings.push(1);
    if (rand(s) < D.rating.badReviewP) { s.stats.reviewsBad++; review(s, 1); }
    var qi = s.queue.indexOf(g.id); if (qi >= 0) s.queue.splice(qi, 1);
    vacate(s, g, c);
    g.state = 'leaving'; g.angry = true;
    if (c) s.stats.complaintFood = (s.stats.complaintFood || 0) + 1; else s.stats.complaintQueue = (s.stats.complaintQueue || 0) + 1;
    fx(s, { t: 'complaint', x: g.px, y: 2.2, n: s.stats.complaints, reason: c ? 'food' : 'queue' });
  }

  // 入口で待ち切れずに帰った組：クレームではなく機会損失として数える
  function giveUp(s, g) {
    var P = D.money.price, est = 0;
    g.guests.forEach(function (gu) { est += P[gu.order.main] + (gu.order.rice ? P.rice : 0) + (gu.order.drink ? P[gu.order.drink] : 0); });
    s.stats.lostGroups++; s.stats.lostSales += est;
    if (rand(s) < D.rating.lostReviewP) review(s, 3);
    var qi = s.queue.indexOf(g.id); if (qi >= 0) s.queue.splice(qi, 1);
    g.state = 'leaving'; g.lost = true;
    fx(s, { t: 'lost', x: g.px, y: g.py, amount: est });
  }

  function review(s, r) { s.rep += (r - s.rep) / D.rating.repStep; }

  E.groupScore = function (g) {
    var R = D.rating, sc = R.base;
    var ms = g.mc ? R.mcStage[g.mcStage || 'last'] : null;
    if (ms) sc += ms.bonus;   // 食事の前に撮った思い出は、まだ何も食べていないので★に足さない
    var wrong = g.guests.filter(function (gu) { return gu.wrong; }).length;
    sc -= Math.min(R.wrongMax, wrong * R.wrongPenalty);
    if (g.lastServeRatio < R.waitVeryLow) sc -= 2; else if (g.lastServeRatio < R.waitLow) sc -= 1;
    if (g.anniv) sc += ms ? (ms.bonus ? R.annivMcBonus : 0) : -R.annivMissPenalty;
    return Math.max(1, Math.min(5, sc));
  };

  function pay(s, g, c) {
    var P = D.money.price, R = D.rating;
    var amount = 0;
    g.guests.forEach(function (gu) {
      // 下の肉でお出しした場合は、お出しした肉の値段をいただく
      amount += gu.subst === 'down' ? P[gu.servedMain] : P[gu.order.main];
      if (gu.order.rice) amount += P.rice;
      if (gu.order.drink) amount += P[gu.order.drink];
    });
    var score = E.groupScore(g);
    s.stats.revenue += amount; s.stats.guests += g.size; s.stats.groups++;
    s.stats.ratings.push(score);
    if (g.anniv && !g.mc) s.stats.annivMissed++;
    // チップ：★4以上で、関わった時間が長いほどもらいやすく、思い出が後ろ（最後の肉）ほど多い
    var tip = 0, ms = g.mc ? R.mcStage[g.mcStage || 'last'] : null, cf = E.careFrac(g);
    if (score >= 4 && rand(s) < R.care.tipPBase + (1 - R.care.tipPBase) * cf) {
      var mult = (ms ? ms.tip : 0.2) * (0.5 + cf) * (g.anniv && ms && ms.bonus ? 2 : 1) * (0.8 + 0.4 * rand(s));
      tip = Math.round(R.tipUnit * g.size * mult / 500) * 500;
      s.stats.tips += tip;
    }
    // 口コミ：最後の肉のフランベで撮った思い出は、写真つきで書かれやすく、評判に2回ぶん効く
    var wrote = 0, photo = false;
    if (score >= 5 && rand(s) < R.reviewP5 + (ms ? ms.reviewAdd : 0)) {
      s.stats.reviewsGood++; review(s, 5); wrote = 5;
      if (ms && ms.photo) { review(s, 5); photo = true; s.stats.photoReviews = (s.stats.photoReviews || 0) + 1; }
    }
    else if (score === 4 && rand(s) < R.reviewP4) { review(s, 4); wrote = 4; }
    else if (score <= 2 && rand(s) < R.badReviewP) { s.stats.reviewsBad++; review(s, score); wrote = score; }
    vacate(s, g, c);
    g.state = 'leaving';
    fx(s, { t: 'pay', x: g.px, y: 2.2, amount: amount, score: score, tip: tip, review: wrote, photo: photo });
  }

  function beefShort(s, m) {
    m = m || 'beef';
    var need = 0, pipe = 0;
    s.groups.forEach(function (g) { if (g.state === 'waiting') g.guests.forEach(function (gu) { if (gu.order.main === m && !gu.got.main) need++; }); });
    var count = function (it) {
      if (!it || it.m !== m) return;
      if (it.k === 'steak' && classify(it) !== 'burnt') pipe += (it.n || 1);
    };
    s.counters.forEach(function (c) { c.slots.forEach(count); });
    s.stations.forEach(function (st) { count(st.item); });
    s.players.forEach(function (p) { count(p.hold); });
    return need - pipe;
  }
  E.beefShort = beefShort;
  // 前菜の足りない数（注文の残り − まな板に並べた皿・盛った前菜・持っている前菜）
  function appsShort(s) {
    var need = 0, pipe = 0;
    s.groups.forEach(function (g) { if (g.state === 'waiting') g.guests.forEach(function (gu) { need += Math.max(0, (gu.order.apps || 0) - (gu.got.apps || 0)); }); });
    s.stations.forEach(function (st) { if (st.item && (st.item.k === 'apps' || (st.type === 'board' && st.item.k === 'plates'))) pipe += st.item.n || 1; });
    s.players.forEach(function (p) { if (p.hold && p.hold.k === 'apps') pipe += p.hold.n || 1; });
    return need - pipe;
  }
  E.appsShort = appsShort;

  // 食洗機は自動で洗う（スタッフは厨房を歩く料理人になった。staffTick に残るのは機械だけ）
  function staffTick(s, dt) {
    s.stations.forEach(function (st) {
      if (st.type === 'washer' && st.dirty > 0) {
        st.washT += dt;
        if (st.washT >= D.washerSec) { st.washT = 0; st.dirty--; st.clean++; }
      }
    });
  }

  function statsTick(s, dt) {
    var st = s.stats;
    var a = activity(s.players[0]), use = st.timeUse || (st.timeUse = {});
    use[a] = (use[a] || 0) + dt;
    var waitingFood = s.groups.filter(function (g) { return g.state === 'waiting'; });
    if (waitingFood.length) {
      st.foodWaitSec += dt * waitingFood.length;
      var needPlate = waitingFood.some(function (g) { return g.guests.some(function (gu) { return !gu.got.main || (gu.order.rice && !gu.got.rice) || (gu.got.apps || 0) < (gu.order.apps || 0); }); });
      var out = needPlate && E.cleanPlatesAvailable(s) === 0;
      if (out) { st.plateOutSec += dt; var po = st.plateOutUse || (st.plateOutUse = {}); po[a] = (po[a] || 0) + dt; }
      if (out && !st.poOn) logEv(s, { t: 'plateOut', raw: true, dirty: s.stations.reduce(function (n, x) { return n + (x.dirty || 0); }, 0) + s.counters.reduce(function (n, c) { return n + c.dirty.reduce(function (m, d) { return m + d; }, 0); }, 0) });
      st.poOn = out;
    }
    if (s.queue.length) {
      var dirtyBlock = s.counters.some(function (c) { return c.unlocked && counterEmpty(c) && (c.needsScrape || c.dirty.some(function (d) { return d > 0; })); });
      if (dirtyBlock) { st.dirtyBlockSec += dt; var du = st.dirtyUse || (st.dirtyUse = {}); du[a] = (du[a] || 0) + dt; }
      if (dirtyBlock && !st.dbOn) logEv(s, { t: 'dirtyBlock', raw: true });
      st.dbOn = dirtyBlock;
    }
  }

  // ---------- 閉店・失敗 ----------
  function collectLeftovers(s) {
    var take = function (it) {
      if (!it) return;
      // 焦げは、捨てても鉄板に残したまま閉店しても同じに数える（監査 F04：放置すると数えず、片付けた方が損だった）
      var burntOf = function (x) { return x && (x.k === 'steak' || x.k === 'rice') && classify(x) === 'burnt' ? (x.n || 1) : 0; };
      s.stats.burnt += burntOf(it) + (it.k === 'dish' ? burntOf(it.food) : 0);
      if (it.k === 'steak' && it.t === 0) s.stats.cost -= itemCost(it);   // 焼く前の肉はショーケースへ戻す
      else if (it.k === 'steak' || it.k === 'rice') addLoss(s, it);
      else if (it.k === 'dish') addLoss(s, it.food);
      else if (it.k === 'apps') addLoss(s, it);
      else if (it.k === 'drink') s.stats.cost -= itemCost(it); // 戻す（注ぐ前）
    };
    s.stations.forEach(function (st) {
      take(st.item); st.item = null;
    });
    s.counters.forEach(function (c) { c.slots.forEach(function (it) { take(it); }); c.slots = c.slots.map(function () { return null; }); });
    s.players.forEach(function (p) { if (p.hold && p.hold.k !== 'plates') take(p.hold); p.hold = null; });
  }

  function finishStats(s) {
    var st = s.stats;
    st.fixed = D.money.fixedPerDay;
    st.labor = 0;
    Object.keys(s.staff).forEach(function (k) { if (s.staff[k]) st.labor += D.staff[k].wage; });
    st.profit = st.revenue - st.cost - st.labor - st.fixed;
    st.avgRating = st.ratings.length ? st.ratings.reduce(function (a, b) { return a + b; }, 0) / st.ratings.length : 0;
    st.repAfter = s.rep;
    st.day = s.day;
    st.bottleneck = E.bottleneck(st);
    st.dur = s.dur || E.dayDuration(s.day);
    st.heat = heat(s);
    st.reflection = E.reflection(st, s.history[s.history.length - 1] || null);
  }

  function closeDay(s) {
    collectLeftovers(s);
    finishStats(s);
    s.cash += s.stats.profit;
    s.staffDays += Object.keys(s.staff).filter(function (k) { return s.staff[k]; }).length;
    s.history.push(summary(s.stats));
    s.report = s.stats;
    s.phase = 'report';
    fx(s, { t: 'close' });
  }
  function failDay(s) {
    collectLeftovers(s);
    finishStats(s);
    s.report = s.stats;
    s.phase = 'failed';
    fx(s, { t: 'fail' });
  }
  function summary(st) {
    return { day: st.day, revenue: st.revenue, cost: st.cost, loss: st.loss, labor: st.labor, fixed: st.fixed, profit: st.profit,
      tips: st.tips, guests: st.guests, groups: st.groups, complaints: st.complaints, lostGroups: st.lostGroups, lostSales: st.lostSales, avgRating: st.avgRating,
      reviewsGood: st.reviewsGood, reviewsBad: st.reviewsBad, mc: st.mc, mcLast: (st.mcStages || {}).last || 0, photoReviews: st.photoReviews || 0, burnt: st.burnt, wrong: st.wrong, wrongDone: st.wrongDone || 0, wrongPart: st.wrongPart || 0, mains: st.mains, mixups: st.mixups || 0,
      plateOutSec: st.plateOutSec, dirtyBlockSec: st.dirtyBlockSec, annivMissed: st.annivMissed, rep: st.repAfter,
      focus: st.bottleneck ? st.bottleneck.id : null };
  }

  // その日いちばんの「つまり」を問いにして返す（答えは言わない）
  E.bottleneck = function (st) {
    var yen = function (n) { return Math.round(n).toLocaleString('ja-JP') + '円'; };
    var mcRate = st.groups ? st.mc / Math.max(1, st.groups) : 0;
    var c = [
      { id: 'plates', score: st.plateOutSec, concept: 'ボトルネック',
        q: 'お客様が料理を待っているのに、きれいな皿が1枚もなかった時間が' + Math.round(st.plateOutSec) + '秒ありました。洗い場と皿棚は、鉄板からどれくらい離れていましたか？' },
      { id: 'dirty', score: st.dirtyBlockSec, concept: '回転率',
        q: 'お客様が入口で待っている間、汚れたままの鉄板が' + Math.round(st.dirtyBlockSec) + '秒ありました。片付けを後回しにしたのは、何をしていた時でしたか？' },
      { id: 'lost', score: st.lostGroups * 8, concept: '機会損失',
        q: '入口で待ち切れずに帰ったお客様が' + st.lostGroups + '組、約' + yen(st.lostSales) + 'ぶんでした。席が空くのを遅らせたのは、何でしたか？' },
      { id: 'burnt', score: st.burnt * 5, concept: 'ロス',
        q: '焦げた肉が' + st.burnt + '枚、' + yen(st.loss) + 'ぶんのロスでした。焼いている間、あなたはどこにいましたか？' },
      // 理由はゲームが決めつけない（監査 F03：部位の取り違えを「焼き加減」と言い、「急いだ理由」を前提にしていた）
      { id: 'wrong', score: st.wrong * 4, concept: '品質', q: wrongQuestion(st) }
    ].sort(function (a, b) { return b.score - a.score; });
    if (c[0].score >= 6) return c[0];
    if (st.groups && mcRate < 0.5) return { id: 'memory', score: 0, concept: '体験価値',
      q: '思い出づくりができたのは' + st.groups + '組中' + st.mc + '組でした。ほかの組のお客様は、何を持ち帰ったでしょう？' };
    return { id: 'delegate', score: 0, concept: '委任',
      q: '大きなつまりはありませんでした。お客様が増えたとき、最初に手放す作業はどれですか？' };
  };

  // ---------- 日報のふりかえり：手順 → 結果 → 問い ----------
  // その日いちばんの「つまり」について、記録から「どの手順が、どの結果につながったか」を並べ、本人に問いを返す。
  // 答え（こうすべき）は書かない。問いのあとに概念の名前を渡す（EDU：体験 → なぜ？ → 気づき → 理論）
  var ACT_LABEL = { returnMeat: '肉・ドリンクを戻す', app: '前菜を作る', wash: '皿を洗う', scrape: '鉄板の掃除', mc: '思い出づくり', returnPlates: '皿を棚に戻す',
    'carry:dirty': '下げた皿を運ぶ', 'carry:plates': 'きれいな皿を運ぶ', 'carry:steak': '肉を運ぶ', 'carry:dish': '料理を運ぶ',
    'carry:rice': 'ご飯を運ぶ', 'carry:drink': 'ドリンクを運ぶ', 'carry:station': '設備を動かす',
    walk: '手ぶらで移動', idle: '立ち止まる' };
  // 時間の使い方の帯（日報に出す）
  var USE_GROUPS = [
    { id: 'carry', label: '運ぶ', keys: ['carry:steak', 'carry:dish', 'carry:plates', 'carry:rice', 'carry:drink', 'returnMeat'] },
    { id: 'app', label: '前菜', keys: ['app'] },
    { id: 'wash', label: '洗う', keys: ['wash', 'returnPlates'] },
    { id: 'clear', label: '片付け', keys: ['scrape', 'carry:dirty'] },
    { id: 'mc', label: '思い出づくり', keys: ['mc'] },
    { id: 'walk', label: '移動', keys: ['walk', 'carry:station'] },
    { id: 'idle', label: '立ち止まる', keys: ['idle'] }
  ];
  E.reflection = function (st, prev) {
    var L = st.log || [], use = st.timeUse || {}, dur = st.dur || 180, b = st.bottleneck || E.bottleneck(st);
    var DN = D.doneness.name;
    var clock = function (t) { var h = D.day.clockStart + (D.day.clockEnd - D.day.clockStart) * Math.min(1, t / dur), hh = Math.floor(h), mm = Math.floor((h - hh) * 60); return hh + ':' + (mm < 10 ? '0' : '') + mm; };
    var sec = function (n) { return Math.round(n) + '秒'; };
    var yen = function (n) { return Math.round(n).toLocaleString('ja-JP') + '円'; };
    var lab = function (a) { return ACT_LABEL[a] || a; };
    var total = Object.keys(use).reduce(function (a, k) { return a + use[k]; }, 0) || 1;
    var pct = function (n) { return Math.round(n / total * 100) + '%'; };
    var ranked = function (obj, skip) { return Object.keys(obj || {}).filter(function (k) { return !skip || skip.indexOf(k) < 0; }).map(function (k) { return [k, obj[k]]; }).sort(function (x, y) { return y[1] - x[1]; }); };
    var work = ranked(use, ['walk', 'idle', 'carry:station']), topWork = work[0];
    var serves = L.filter(function (e) { return e.k === 'serve' && e.wait != null; });
    var waits = serves.map(function (e) { return e.wait; });
    var avgWait = waits.length ? waits.reduce(function (a, x) { return a + x; }, 0) / waits.length : 0;
    var maxWait = waits.length ? Math.max.apply(null, waits) : 0;
    var lastBefore = function (k, x, t) { var hit = null; L.forEach(function (e) { if (e.k === k && e.t <= t && (x == null || Math.abs(e.x - x) < 0.01)) hit = e; }); return hit; };
    var most = function (arr, key) { var c = {}; arr.forEach(function (e) { var v = key(e); c[v] = (c[v] || 0) + 1; }); var r = ranked(c)[0]; return r ? { v: r[0], n: r[1] } : null; };
    var vsPrev = function (cur, key, unit) { if (!prev || prev[key] == null) return ''; return '（昨日 ' + (unit === '秒' ? Math.round(prev[key]) + '秒' : prev[key] + unit) + '）'; };
    var timeUse = USE_GROUPS.map(function (g) { var v = g.keys.reduce(function (a, k) { return a + (use[k] || 0); }, 0); return { id: g.id, label: g.label, sec: v, share: v / total }; }).filter(function (g) { return g.sec > 0.5; });
    var R = { id: b.id, concept: b.concept, steps: [], result: '', q: b.q, next: '', timeUse: timeUse, avgWait: avgWait };
    var useLine = function (obj) { return ranked(obj).slice(0, 2).map(function (x) { return '「' + lab(x[0]) + '」' + sec(x[1]); }).join('、'); };

    if (b.id === 'burnt') {
      var burns = L.filter(function (e) { return e.k === 'doneness' && e.d === 'burnt'; });
      if (burns.length) {
        var f = burns[0], put = lastBefore('sizzle', f.x, f.t), why = most(burns, function (e) { return e.a; });
        if (put) R.steps.push({ t: clock(put.t), text: '鉄板に肉を置く（鉄板の上は' + put.on + '枚）' });
        R.steps.push({ t: clock(f.t), text: 'そのとき、あなたは「' + lab(f.a) + '」の最中' });
        R.steps.push({ t: clock(f.t), text: '肉が焦げる' + (put ? '（置いてから' + sec(f.t - put.t) + '）' : '') });
        R.result = '焦げ ' + st.burnt + '枚・ロス ' + yen(st.loss) + vsPrev(st.burnt, 'burnt', '枚') + '。焦げた' + burns.length + '枚のうち' + why.n + '枚は「' + lab(why.v) + '」の最中でした';
        R.q = '肉が焼き上がるまでの間に「' + lab(why.v) + '」を選んだのは、何を先に片付けたかったからですか？';
        R.next = '同じ場面がもう一度来たら、鉄板を離れる前に何を決めておきますか？';
      }
    } else if (b.id === 'wrong') {
      var W = L.filter(function (e) { return e.k === 'serve' && e.good === false && !e.subst; });
      var WP = L.filter(function (e) { return e.k === 'serve' && e.subst === 'down'; });
      if (!W.length && WP.length) {
        // 部位（肉の種類）の取り違えだけ：どの肉を、どの注文に出したか
        var wp = WP[0], pp = most(WP, function (e) { return e.wantMain + '>' + e.have; }), ps = pp.v.split('>');
        R.steps.push({ t: clock(wp.t), text: E.meatName(wp.wantMain) + 'のご注文に、' + E.meatName(wp.have) + 'を出す' });
        R.result = '部位の取り違え ' + (st.wrongPart || WP.length) + '枚。いちばん多かったのは「' + E.meatName(ps[0]) + 'のご注文に' + E.meatName(ps[1]) + '」で' + pp.n + '枚でした';
        R.q = b.q;
        R.next = '焼く前に「どのお客様の肉か」を確かめる合図を1つ決めるとしたら、何にしますか？';
      }
      if (W.length) {
        var w = W[0], grill = lastBefore('sizzle', w.x, w.t), pair = most(W, function (e) { return e.want + '>' + e.done; });
        var pw = pair.v.split('>');
        if (grill) R.steps.push({ t: clock(grill.t), text: '鉄板に肉を置く（鉄板の上は' + grill.on + '枚）' });
        R.steps.push({ t: clock(w.t), text: (DN[w.want] || w.want) + 'のご注文に、' + (DN[w.done] || w.done) + 'で出す' + (grill ? '（焼いた時間 ' + sec(w.t - grill.t) + '）' : '') });
        var bt = D.doneness.beef, k = st.heat || 1, lo = { rare: bt.rare, medium: bt.medium, well: bt.well }[w.want], hi = { rare: bt.medium, medium: bt.well, well: bt.wellEnd }[w.want];
        if (grill && lo) R.steps.push({ t: '', text: (DN[w.want] || w.want) + 'になるのは、置いてから約' + Math.round(lo / k) + '〜' + Math.round(hi / k) + '秒。この肉は' + sec(w.t - grill.t) + '（' + (w.t - grill.t > hi / k ? '長かった' : '短かった') + '）' });
        R.result = '焼き加減ちがい ' + (st.wrongDone != null ? st.wrongDone : st.wrong) + '枚' + (st.wrongPart ? '（ほかに部位の取り違え ' + st.wrongPart + '枚）' : '') + '。いちばん多かったのは「' + (DN[pw[0]] || pw[0]) + 'のご注文に' + (DN[pw[1]] || pw[1]) + '」で' + pair.n + '枚でした';
        R.q = '「' + (DN[pw[0]] || pw[0]) + 'になった」と判断したのは、鉄板の何を見たときですか？';
        R.next = '焼き上がりを確かめる「見るタイミング」を1つ決めるとしたら、いつにしますか？';
      }
    } else if (b.id === 'plates') {
      var washes = L.filter(function (e) { return e.k === 'washDone'; }).length;
      var po0 = L.filter(function (e) { return e.k === 'plateOut'; })[0];
      if (po0) {
        var wd = L.filter(function (e) { return e.k === 'washDone' && e.t >= po0.t; })[0];
        R.steps.push({ t: clock(po0.t), text: 'きれいな皿が0枚になる（汚れた皿は' + po0.dirty + '枚あった）' });
        R.steps.push({ t: clock(po0.t), text: 'そのとき、あなたは「' + lab(po0.a) + '」' });
        if (wd) R.steps.push({ t: clock(wd.t), text: '1枚目が洗い上がる（' + sec(wd.t - po0.t) + '後）' });
      }
      R.steps.push({ t: '', text: '皿がなかった時間は合計 ' + sec(st.plateOutSec) + vsPrev(st.plateOutSec, 'plateOutSec', '秒') + '。その間のあなた：' + useLine(st.plateOutUse) });
      R.steps.push({ t: '', text: '今日洗った皿：' + washes + '枚（洗うのに ' + sec((use.wash || 0)) + '）' });
      R.result = '注文から料理が出るまで、平均 ' + sec(avgWait) + '（いちばん長い時 ' + sec(maxWait) + '）';
      R.q = '皿が尽きる前に、洗い場へ向かう合図はどこにありましたか？';
      R.next = '明日、「◯◯したら洗う」と1つ決めるなら、◯◯に何を入れますか？';
    } else if (b.id === 'dirty') {
      var scr = L.filter(function (e) { return e.k === 'scrapeDone'; }).length;
      var db0 = L.filter(function (e) { return e.k === 'dirtyBlock'; })[0];
      if (db0) {
        var sd = L.filter(function (e) { return e.k === 'scrapeDone' && e.t >= db0.t; })[0];
        R.steps.push({ t: clock(db0.t), text: '入口にお客様。片付いていない鉄板がある' });
        R.steps.push({ t: clock(db0.t), text: 'そのとき、あなたは「' + lab(db0.a) + '」' });
        if (sd) R.steps.push({ t: clock(sd.t), text: '鉄板の掃除が終わる（' + sec(sd.t - db0.t) + '後）' });
      }
      R.steps.push({ t: '', text: '片付いていない鉄板があった時間は合計 ' + sec(st.dirtyBlockSec) + vsPrev(st.dirtyBlockSec, 'dirtyBlockSec', '秒') + '。その間のあなた：' + useLine(st.dirtyUse) });
      R.steps.push({ t: '', text: '鉄板の掃除：' + scr + '回（掃除に ' + sec(use.scrape || 0) + '）' });
      R.result = st.lostGroups ? '入れずに帰ったお客様 ' + st.lostGroups + '組（約' + yen(st.lostSales) + '）' : '入口のお客様の待ち時間が延びました';
      R.q = 'お客様が席を立ってから片付けを始めるまで、何をしていましたか？';
      R.next = '次のお客様をお通しするための「片付けの合図」を決めるなら、何にしますか？';
    } else if (b.id === 'lost') {
      R.steps.push({ t: '', text: '注文から料理が出るまで：平均 ' + sec(avgWait) + '（いちばん長い時 ' + sec(maxWait) + '）' });
      if (topWork) R.steps.push({ t: '', text: 'いちばん時間を使った作業：「' + lab(topWork[0]) + '」' + sec(topWork[1]) + '（全体の' + pct(topWork[1]) + '）' });
      R.steps.push({ t: '', text: '席が空くまでの流れ：注文 → 料理が届く → 食事 → 片付け' });
      R.result = '入れずに帰ったお客様 ' + st.lostGroups + '組（約' + yen(st.lostSales) + '）' + vsPrev(st.lostGroups, 'lostGroups', '組');
      R.q = '1組が席にいる時間のうち、あなたの動きで短くできたのはどの部分ですか？';
      R.next = '明日の最初の30分で、席を早く空けるために試すことを1つ決めるなら？';
    } else if (b.id === 'memory') {
      R.steps.push({ t: '', text: '思い出づくり：' + st.groups + '組中 ' + st.mc + '組' + vsPrev(st.mc, 'mc', '組') });
      var ms = st.mcStages || {};
      if (st.mc) R.steps.push({ t: '', text: '撮った頃合い：最後の肉 ' + (ms.last || 0) + '組・食事の途中 ' + (ms.mid || 0) + '組・食事の前 ' + (ms.early || 0) + '組' });
      R.steps.push({ t: '', text: '思い出づくりに使った時間：' + sec(use.mc || 0) + '（全体の' + pct(use.mc || 0) + '）' });
      if (topWork) R.steps.push({ t: '', text: 'いちばん時間を使った作業：「' + lab(topWork[0]) + '」' + sec(topWork[1]) });
      R.result = '★の平均 ' + (st.avgRating ? st.avgRating.toFixed(1) : '—') + '・TIP ' + yen(st.tips);
      R.q = topWork ? '「' + lab(topWork[0]) + '」の時間を少し削って思い出づくりに回すとしたら、どの場面ですか？' : b.q;
      R.next = '思い出づくりがいちばん喜ばれるのは、食事のどのタイミングだと思いますか？';
    } else {
      R.steps.push({ t: '', text: '注文から料理が出るまで：平均 ' + sec(avgWait) });
      R.steps.push({ t: '', text: '時間の使い方：' + work.slice(0, 3).map(function (x) { return '「' + lab(x[0]) + '」' + pct(x[1]); }).join('、') });
      R.result = '★の平均 ' + (st.avgRating ? st.avgRating.toFixed(1) : '—') + '・大きなつまりはありませんでした';
      if (topWork) R.q = '今日いちばん時間を使った「' + lab(topWork[0]) + '」は、あなたでなくてもできますか？';
      R.next = '任せられたとしたら、空いた時間で何をしますか？';
    }
    if (!R.steps.length) R.steps.push({ t: '', text: b.q });
    // 昨日と同じ「つまり」なら、同じ問いを繰り返さず、昨日決めたことを振り返る問いにする
    if (prev && prev.focus === 'delegate' && b.id === 'delegate' && topWork) {
      R.q = '2日続けて大きなつまりはありませんでした。「' + lab(topWork[0]) + '」を誰かに任せたら、あなたは店のどこに立っていたいですか？';
      R.next = 'その場所に立つと、お客様の何が見えるようになりますか？';
    }
    if (prev && prev.focus === b.id && b.id !== 'delegate') {
      var chg = { burnt: ['焦げ', prev.burnt, st.burnt, '枚'], wrong: ['焼き加減・部位ちがい', prev.wrong, st.wrong, '枚'], plates: ['皿がなかった時間', Math.round(prev.plateOutSec), Math.round(st.plateOutSec), '秒'],
        dirty: ['片付いていない時間', Math.round(prev.dirtyBlockSec), Math.round(st.dirtyBlockSec), '秒'], lost: ['入れずに帰った組', prev.lostGroups, st.lostGroups, '組'], memory: ['思い出づくり', prev.mc, st.mc, '組'] }[b.id];
      if (chg) {
        var better = b.id === 'memory' ? chg[2] > chg[1] : chg[2] < chg[1];
        R.q = '昨日も同じところでつまりました（' + chg[0] + ' ' + chg[1] + chg[3] + ' → ' + chg[2] + chg[3] + '）。' +
          (better ? '良くなった分、手順の何を変えましたか？' : '昨日決めたことは、今日どの場面で使えましたか？ 使えなかったなら、何が邪魔をしましたか？');
        R.next = better ? 'その変え方を、明日は別の作業にも使えますか？' : '明日は、その邪魔を避けるために何を先にしますか？';
      }
    }
    return R;
  };

  // ---------- 夜：カード・買い出し ----------
  E.afterReport = function (s) {
    if (s.day >= D.day.total) { s.phase = 'result'; return; }
    if (D.day.cardDays.indexOf(s.day) >= 0 && E.genCards(s).length) { s.phase = 'card'; return; }
    E.openShop(s);
  };

  E.genCards = function (s) {
    var left = D.cards.filter(function (c) { return s.cards.indexOf(c.id) < 0; });
    var dish = left.filter(function (c) { return c.kind === 'dish'; });
    var guest = left.filter(function (c) { return c.kind === 'guest'; });
    var pair = [];
    var take = function (arr) { if (!arr.length) return null; var i = Math.floor(rand(s) * arr.length); return arr.splice(i, 1)[0]; };
    var a = take(dish) || take(guest), b = take(guest) || take(dish);
    if (a) pair.push(a.id); if (b) pair.push(b.id);
    s.cardPair = pair;
    return pair;
  };
  E.pickCard = function (s, id) {
    if (s.phase !== 'card' || s.cardPair.indexOf(id) < 0) return false;
    s.cards.push(id);
    var c = cardDef(id);
    if (c.station) deliver(s, c.station);
    fx(s, { t: 'card', id: id });
    E.openShop(s);
    return true;
  };

  // 届いた設備は、ほかの設備と鉄板の前をふさがない最初の空きマスに置く
  function layoutOk(s) {
    // 鉄板の前から調べる（左上の隅から調べると、隅に囲われた小部屋を「店の床」と取り違える。左右反転で隅が床になった 2026-10-27）
    var start = null;
    s.counters.forEach(function (c) {
      if (!c.unlocked || start) return;
      for (var i = 0; i < c.seats; i++) if (!isSolid(s, c.x0 + i, 4)) { start = [c.x0 + i, 4]; break; }
    });
    for (var y = 4; y < MH && !start; y++) for (var x = 0; x < MW; x++) if (!isSolid(s, x, y)) { start = [x, y]; break; }
    if (!start) return false;
    var reach = reachable(s, start[0], start[1]);
    var okSt = s.stations.every(function (st) { return stationReachable(s, st, reach); });
    var okC = s.counters.every(function (c) {
      if (!c.unlocked) return true;
      for (var i = 0; i < c.seats; i++) if (!reach[4 * MW + c.x0 + i]) return false;
      return true;
    });
    return okSt && okC;
  }
  E.layoutOk = layoutOk;
  function deliver(s, type) {
    var cands = D.deliverySpots.slice();
    for (var yy = MH - 2; yy >= 5; yy--) for (var xx = 1; xx < MW; xx++) cands.push([xx, yy]);
    for (var i = 0; i < cands.length; i++) {
      var x = cands[i][0], y = cands[i][1];
      if (!isFloor(x, y) || stationAt(s, x, y)) continue;
      var st = newStation(s, type, x, y);
      s.stations.push(st);
      // 人（自分・スタッフ）が立っている床には届けない（夜の買い物中に体がめり込んだ 2026-10-28）
      var onBody = s.players.some(function (p) { return collides(s, p.x, p.y, D.player.radius); });
      if (!onBody && layoutOk(s)) { st.isNew = true; return true; }
      s.stations.pop();
    }
    return false;
  }
  E.deliver = deliver;

  // 最初からある設備も上限に数える（作業台は最大5台、など）
  function ownedCount(s, item) {
    if (item.station) return s.stations.filter(function (st) { return st.type === item.station; }).length;
    return s.bought[item.id] || 0;
  }
  function shopItem(id) { for (var i = 0; i < D.shop.items.length; i++) if (D.shop.items[i].id === id) return D.shop.items[i]; return null; }
  E.shopItem = shopItem;
  function available(s, item) {
    if (item.id === 'counter') return s.counters.some(function (c) { return !c.unlocked; }) &&
      Object.keys(s.staff).filter(function (k) { return s.staff[k]; }).length >= (item.staffNeed || 0);   // 増設は人を雇ってから
    if (item.id === 'sneakers' || item.id === 'highHeat' || item.id === 'reservation') return !s.flags[item.id];
    if (item.id === 'showcase' && E.cutMode(s)) return false;
    if (item.fromDay && s.day < item.fromDay) return false;   // 部位の店では、部位ごとのショーケースが届く
    return ownedCount(s, item) < item.max;
  }

  E.openShop = function (s) {
    s.phase = 'shop';
    s.rerolls = 0;
    genOffers(s, s.day === 1 ? D.shop.firstNight : ((D.shop.fixedNights || {})[s.day] || null));
  };
  function genOffers(s, fixed) {
    var pool = D.shop.items.filter(function (it) { return available(s, it); });
    var out = [];
    if (fixed) fixed.forEach(function (id) { var it = shopItem(id); if (it && available(s, it)) out.push(id); });
    var rest = pool.filter(function (it) { return out.indexOf(it.id) < 0; });
    while (out.length < D.shop.offers && rest.length) {
      var i = pickWeighted(s, rest.map(function (it) { return it.w; }));
      out.push(rest.splice(i, 1)[0].id);
    }
    s.offers = out.map(function (id) { return { id: id, sold: false }; });
  }
  E.rerollCost = function (s) { return D.shop.rerollBase + D.shop.rerollStep * s.rerolls; };
  E.reroll = function (s) {
    var c = E.rerollCost(s);
    if (s.cash < c) return false;
    s.cash -= c; s.rerolls++;
    genOffers(s, null);
    return true;
  };
  E.buy = function (s, idx) {
    var o = s.offers[idx]; if (!o || o.sold) return false;
    var it = shopItem(o.id);
    if (s.cash < it.price || !available(s, it)) return false;
    s.cash -= it.price; o.sold = true;
    s.bought[it.id] = (s.bought[it.id] || 0) + 1;
    if (it.id === 'plates') s.platesTotal += 2;
    else if (it.station) deliver(s, it.station);
    else if (it.id === 'counter') { var c = s.counters.filter(function (c) { return !c.unlocked; })[0]; if (c) c.unlocked = true; s.platesTotal += it.plates || 0; }   // 席の分の皿もつく
    else s.flags[it.id] = true;
    fx(s, { t: 'buy', id: it.id });
    return true;
  };
  E.staffUnlocked = function (s) { return s.day + 1 >= D.day.staffFromDay; };
  E.setStaff = function (s, id, on) {
    if (!E.staffUnlocked(s) || !D.staff[id]) return false;
    s.staff[id] = !!on;
    // 焼き担当とキッチン担当は、どちらか1人だけ（雇うと、もう片方とは入れ替え）
    if (on && D.staff[id].slot) Object.keys(D.staff).forEach(function (o) { if (o !== id && D.staff[o].slot === D.staff[id].slot) s.staff[o] = false; });
    return true;
  };
  E.nextDay = function (s) {
    if (s.phase !== 'shop') return;
    s.day++;
    E.startPrep(s);
  };

  // ---------- 最終評価 ----------
  E.finalScore = function (s) {
    var h = s.history, T = D.axisTargets;
    var sum = function (k) { return h.reduce(function (a, d) { return a + (d[k] || 0); }, 0); };
    var profit = sum('profit'), guests = sum('guests'), mains = sum('mains'), wrong = sum('wrong');
    var cost = sum('cost'), loss = sum('loss'), groups = sum('groups'), mc = sum('mc'), burnt = sum('burnt');
    var ratings = h.filter(function (d) { return d.avgRating; });
    var avgR = ratings.length ? ratings.reduce(function (a, d) { return a + d.avgRating; }, 0) / ratings.length : 0;
    var clamp = function (v) { return Math.max(0, Math.min(100, Math.round(v))); };
    var sys = s.staffDays * 3 + (s.stations.some(function (st) { return st.type === 'washer'; }) ? 15 : 0) + (s.flags.reservation ? 15 : 0) + (s.flags.highHeat ? 8 : 0);
    var axes = {
      profit: clamp(profit / T.profit * 100),
      turnover: clamp(guests / Math.max(1, h.length) / T.guestsPerDay * 100),
      precision: clamp(mains ? 100 - (wrong + burnt) / mains / T.errorRateBad * 100 : 0),
      memory: clamp((avgR - T.memoryBase) / (5 - T.memoryBase) * 60 + (groups ? mc / groups : 0) * 40),
      loss: clamp(100 - (cost ? loss / cost : 0) / T.lossRateBad * 100),
      system: clamp(sys)
    };
    var top = Object.keys(axes).sort(function (a, b) { return axes[b] - axes[a]; })[0];
    var style = D.styles[top];
    // スタッフを一度も雇わずに回した → 鏡として「ひとりで背負う」を返す
    if (s.staffDays === 0 && axes.turnover >= 50) style = D.styles.solo;
    return { axes: axes, style: style, profit: profit, guests: guests, tips: sum('tips'), reviews: sum('reviewsGood'), days: h.length, retries: s.retries };
  };
})(WK);

if (typeof module !== 'undefined') module.exports = WK;
