/* 和牛の刀 鉄板十五日 — DATA
 * バランス数値はすべてここに置く。ロジックに数値を書かない。
 * 金額はゲーム用の仮の数字（実店舗の価格ではない）。
 */
var WK = (typeof WK !== 'undefined') ? WK : {};

WK.DATA = {
  saveVersion: 1,
  title: '和牛の刀 鉄板十五日',

  // 西新宿店：鉄板側（厨房）から見ると、入口は右にある。下の地図と座標は「入口が左」で書き、mirror で左右をまとめて反転する
  mirror: true,

  // 15×10 マス。# 壁 / D 入口 / h ホール通路 / w 待合 / S 席 / T 鉄板 / | 仕切り / p 植栽 / k 厨房の床
  map: [
    '###############',
    'Dhhhhhhhhhhhhhh',
    'wSSSSpSSSSpSSSS',
    'wTTTT|TTTT|TTTT',
    '#kkkkkkkkkkkkkk',
    '#kkkkkkkkkkkkkk',
    '#kkkkkkkkkkkkkk',
    '#kkkkkkkkkkkkkk',
    '#kkkkkkkkkkkkkk',
    '###############'
  ],
  counters: [
    { id: 'A', x0: 1, seats: 4, unlocked: true },
    { id: 'B', x0: 6, seats: 4, unlocked: true },
    { id: 'C', x0: 11, seats: 4, unlocked: false }
  ],
  door: { x: 0, y: 1 },
  waitSpots: [{ x: 0, y: 2 }, { x: 0, y: 3 }],
  playerStart: { x: 7.5, y: 6.5 },

  // 最初の厨房（わざと少し遠い。配置を直すと速くなる）
  startStations: [
    { type: 'showcase', x: 1, y: 8 },
    { type: 'board', x: 2, y: 8 },
    { type: 'bench', x: 3, y: 8 },
    { type: 'water', x: 5, y: 8 },
    { type: 'beer', x: 6, y: 8 },
    { type: 'rack', x: 7, y: 8 },
    { type: 'sink', x: 12, y: 8 },
    { type: 'trash', x: 14, y: 8 },
    { type: 'bench', x: 14, y: 6 }
  ],
  startPlates: 10,   // コースの前菜で皿が増えるので6→10（2026-10-27）
  // 買った設備・届いた設備を置く候補（空いている最初のマス）
  deliverySpots: [
    [1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7], [8, 7], [9, 7], [10, 7], [11, 7],
    [1, 6], [2, 6], [3, 6], [11, 6], [12, 6], [13, 6], [4, 8], [5, 8], [6, 8], [8, 8], [9, 8], [10, 8], [11, 8], [13, 8]
  ],

  stations: {
    showcase: { name: '神戸牛ショーケース', short: '神戸牛', label: '神戸牛', provides: 'beef' },
    eshowcase: { name: 'エンペラーショーケース', short: 'エンペラー', label: 'エンペラー', provides: 'emperor' },
    hshowcase: { name: 'ハラル牛ショーケース', short: 'ハラル牛', label: 'ハラル', provides: 'halal' },
    rice: { name: '炊飯器', short: 'ご飯', label: '炊飯器', provides: 'rice' },
    // ドリンク：水・ビールは最初から。日本酒（酒棚）・ワイン（ワインセラー）は夜の店で買う
    water: { name: 'ウォーターサーバー', short: '水', label: '水', provides: 'water' },
    beer: { name: 'ビールサーバー', short: 'ビール', label: 'ビール', provides: 'beer' },
    sake: { name: '酒棚', short: '日本酒', label: '日本酒', provides: 'sake' },
    wine: { name: 'ワインセラー', short: 'ワイン', label: 'ワイン', provides: 'wine' },
    board: { name: 'まな板', short: 'まな板', label: 'まな板' },
    bench: { name: '作業台', short: '作業台', label: '作業台' },
    rack: { name: '皿棚', short: '皿棚', label: '皿棚' },
    sink: { name: '洗い場', short: '洗い場', label: '洗い場' },
    washer: { name: '食洗機', short: '食洗機', label: '食洗機' },
    trash: { name: 'ゴミ箱', short: 'ゴミ箱', label: 'ゴミ箱' }
  },

  player: { speed: 4.4, radius: 0.3, plateCarryMax: 6, steakCarryMax: 4 },

  day: {
    total: 15,
    serviceBase: 150, servicePerDay: 4, // 実時間（秒）
    spawnWindow: 0.78,
    clockStart: 17, clockEnd: 22,
    cardDays: [3, 6, 9, 12],
    staffFromDay: 4,
    complaintLimit: 3
  },

  demand: {
    baseGroups: 4, perDay: 0.42,
    sizeWeights: [0, 0.12, 0.5, 0.22, 0.16], // 0〜4名
    repMultK: 0.12, repMultMin: 0.9, repMultMax: 1.12,
    repPatienceK: 0.2, repPatienceMin: 0.85, repPatienceMax: 1.15,
    jitter: 0.45 // 来店間隔の揺らぎ（0 で等間隔）
  },

  guests: {
    queuePatience: 40,
    patienceBase: 36, patiencePerGuest: 10,
    refillOnServe: 0.18,
    orderSec: 1.4, eatSec: 6, appEatSec: 8,
    walkSpeed: 3.2, lowRatio: 0.35
  },

  // 焼き加減（鉄板に置いてからの秒数）
  doneness: {
    order: ['rare', 'medium', 'well'],
    name: { raw: '生', rare: 'レア', medium: 'ミディアム', well: 'ウェルダン', burnt: '焦げ' },
    short: { raw: '生', rare: 'レア', medium: 'ミディ', well: 'ウェル', burnt: '焦げ' },
    beef: { rare: 4, medium: 7, well: 10, wellEnd: 13, burn: 14 },
    unlock: { 1: ['medium'], 2: ['rare', 'medium'], 4: ['rare', 'medium', 'well'] },
    weights: { rare: 0.3, medium: 0.45, well: 0.25 }
  },
  rice: { ready: 4, burn: 13 },
  highHeatMult: 1.33,
  // 難易度＝肉の焼けるスピード（v1 の速さを 1.0 とした倍率）。ノーマルは v1 より5%遅い
  difficulties: {
    // 部位はどの難易度も同じ（侍コースの3種 → 6日目から将軍コースの2種）。鬼ムズだけ11日目から大将軍コースの皇帝2種（本人指定 2026-10-27）
    // patience：お客様が待ってくれる長さの倍率（席・入口とも）。相席で同時に座る組が増えたので測り直した（2026-10-28、D-034）
    easy: { name: 'イージー', cook: 0.80, patience: 1.25, desc: '肉がゆっくり焼け、お客様も長く待ってくれる。焼き加減を合わせやすい',
      cuts: [[1, ['sirloin', 'bekkaku', 'wasaro']], [6, ['chateau', 'filet']]] },
    normal: { name: 'ノーマル', cook: 0.95, patience: 1.2, desc: 'ふつうの速さ',
      cuts: [[1, ['sirloin', 'bekkaku', 'wasaro']], [6, ['chateau', 'filet']]] },
    hard: { name: 'ハード', cook: 1.10, patience: 0.95, desc: '肉が速く焼ける（ノーマルより約16%速い）。お客様は少し待てない',
      cuts: [[1, ['sirloin', 'bekkaku', 'wasaro']], [6, ['chateau', 'filet']]] },
    oni: { name: '鬼ムズ', cook: 1.10, patience: 0.88, desc: 'ハードより待てないお客様。11日目から皇帝ロイン・皇帝ブリアンも入り、7種を焼き分ける',
      cuts: [[1, ['sirloin', 'bekkaku', 'wasaro']], [6, ['chateau', 'filet']], [11, ['kotei_loin', 'kotei_brian']]] }
  },
  difficultyOrder: ['easy', 'normal', 'hard', 'oni'],
  defaultDifficulty: 'normal',

  // コース（本人指定 2026-10-27）：コースで肉の系統が決まる。前菜はまな板で作る（皿を置いて作業・長押し）。値段はゲーム用の仮の数字
  //  侍＝サーロイン系、将軍＝ヒレ系（6日目から）、大将軍＝皇帝・エンペラー（エンペラーのカード、または鬼ムズの11日目から）
  courses: {
    samurai: { name: '侍コース', short: '侍', apps: 1, price: 15000, w: 0.55, color: '#b8323a' },
    shogun: { name: '将軍コース', short: '将軍', apps: 2, price: 22000, w: 0.3, color: '#2f5d9e' },
    daishogun: { name: '大将軍コース', short: '大将軍', apps: 2, price: 30000, w: 0.25, color: '#c9a45c' }
  },
  // ドリンク（ひとり1杯）。水は無料、ビールは安い → 日本酒・ワインを入れると売上が上がる。w：頼まれやすさ（出せるものの中で割る）
  drinks: {
    water: { name: '水', abbr: '水', price: 0, cost: 0, w: 0.35, color: '#96ceee' },
    beer: { name: 'ビール', abbr: 'ビール', price: 800, cost: 350, w: 0.65, color: '#f6ba34' },
    sake: { name: '日本酒', abbr: '日本酒', price: 4500, cost: 1200, w: 0.45, color: '#e8e2d6' },
    wine: { name: 'ワイン', abbr: 'ワイン', price: 5500, cost: 1800, w: 0.45, color: '#a81c3a' }
  },

  // 肉の種類。rank：上の肉を下の注文へ＝サービス（差額はロス）、下を上へ＝取り違え。同じ rank で種類が違う（部位違い）も取り違え
  //  course：その肉のコース（値段はコースの値段）。costv：原価（なければ神戸牛と同じ）
  //  cook：焼ける時間の倍率（大きいほどゆっくり）。part：ハード・鬼ムズの部位（部位ごとのショーケースがある）
  //  肉は切り分けたものがショーケースに入っている（まな板で切る工程はない。実店舗に合わせた 2026-10-27）
  //  ハード・鬼ムズの部位（sirloin〜kotei_brian）は、難易度の cuts で日ごとに増える。値段はゲーム用の仮の数字（神戸牛と同じ）
  //  ヒレ系（シャトー・フィレ・皇帝ブリアン）は厚いので、焼き時間を1.15倍にしている（仮説。遊んで決める）
  meats: {
    beef: { name: '神戸牛', abbr: '', rank: 1, course: 'samurai' },
    emperor: { name: 'エンペラー', abbr: 'エンペラー', rank: 3, cook: 1.2, color: '#c9a45c', course: 'daishogun', costv: 9000 },
    halal: { name: 'ハラル牛', abbr: 'ハラル', rank: 1, color: '#5fbf8a', course: 'samurai', costv: 6500 },
    sirloin: { name: 'サーロイン', abbr: 'サーロ', rank: 1, part: true, color: '#e0584a', course: 'samurai' },
    bekkaku: { name: '別格', abbr: '別格', rank: 1, part: true, color: '#9a6ae0', course: 'samurai' },
    wasaro: { name: '和サーロ', abbr: '和サーロ', rank: 1, part: true, color: '#f0a03a', course: 'samurai' },
    chateau: { name: 'シャトー', abbr: 'シャトー', rank: 2, part: true, cook: 1.15, color: '#4a96e6', course: 'shogun', costv: 7000 },
    filet: { name: 'フィレ', abbr: 'フィレ', rank: 2, part: true, cook: 1.15, color: '#e870b0', course: 'shogun', costv: 7000 },
    kotei_loin: { name: '皇帝ロイン', abbr: '皇ロイン', rank: 3, part: true, color: '#2fbfb5', course: 'daishogun', costv: 9000 },
    kotei_brian: { name: '皇帝ブリアン', abbr: '皇ブリ', rank: 3, part: true, cook: 1.15, color: '#eeeae2', course: 'daishogun', costv: 9000 }
  },

  work: { wash: 0.75, scrape: 1.4, mc: 1.3, returnPlates: 0.3, app: 0.8, appPer: 0.25, appMax: 4 },   // 前菜：皿を並べて長押し1回でまとめて盛る（0.8秒＋1皿ごとに0.25秒、4皿まで）

  money: {
    startCash: 50000,
    fixedPerDay: 40000,
    // 肉の値段＝その肉のコースの値段（下の反転の後で入れる）。app＝前菜1品の原価
    price: { rice: 2500 },
    cost: { beef: 5000, rice: 400, app: 800 }
  },

  rating: {
    base: 4, mcBonus: 1, wrongPenalty: 1, wrongMax: 2,
    waitLow: 0.35, waitVeryLow: 0.15,
    annivMcBonus: 1, annivMissPenalty: 2,
    reviewP5: 0.6, reviewP4: 0.15, badReviewP: 0.5, lostReviewP: 0.3,
    repStart: 4.0, repStep: 12,
    tipUnit: 1000,
    // 思い出づくりは、いつ撮るかで値打ちが変わる（本人指定 2026-10-28「肉をお出しして、最後の肉でフランベして思い出を取るのが和牛の刀の通常」）
    //  stage：その組に肉を何人分お出ししたか。early＝まだ0人／mid＝途中／last＝全員分お出しした後（最後の肉のフランベ）
    //  need：長押しの秒数（早いほど撮りづらい）。bonus：★に足す。tip：チップの倍率。photo：写真つき口コミになりやすい（評判に2回ぶん効く）
    mcStage: {
      early: { name: '食事の前', need: 2.4, bonus: 0, tip: 0.3, reviewAdd: 0 },
      mid: { name: '食事の途中', need: 1.7, bonus: 1, tip: 0.8, reviewAdd: 0 },
      last: { name: '最後の肉', need: 1.3, bonus: 1, tip: 1.6, reviewAdd: 0.25, photo: true }
    },
    // 関わった時間：組の前（鉄板の内側の1列）に立っていた秒数。スタッフは半分に数える。full 秒（＋1人ごとに perGuest 秒）で満点
    //  チップをもらえる確率＝tipPBase＋（1−tipPBase）×満点への割合。チップの額は（0.5＋満点への割合）倍
    care: { full: 10, perGuest: 3, staffK: 0.5, tipPBase: 0.25 }
  },

  staff: {
    // スタッフは自分と同じ料理人。厨房の中を歩いて、自分と同じ操作で働く（本人指定 2026-10-27）。担当の仕事だけをする
    //  焼き担当とキッチン担当は、どちらか1人だけ（slot が同じ）。両方いると、自分の仕事がほとんど残らない（本人指定 2026-10-28）
    //  speed：歩く速さの倍率（自分＝1。0.85→0.83 本人指定 2026-10-28「スタッフが何でもやってしまう」）。react：次の判断までの間（秒）。short：頭の上の札
    grill: { name: '焼き担当', short: '焼き', color: '#d0503a', wage: 25000, speed: 0.83, react: 0.25, slot: 'cook', desc: '肉を取って焼き、皿に盛ってお出しする（ご飯も）。手が空いたら鉄板の掃除と洗い物' },
    kitchen: { name: 'キッチン担当', short: 'キッチン', color: '#3f8f5a', wage: 20000, speed: 0.83, react: 0.25, slot: 'cook', desc: '前菜・ドリンク・皿洗い・汚れた皿の回収・鉄板の掃除' },
    mc: { name: 'MC担当', short: 'MC', color: '#c9a45c', wage: 25000, speed: 0.83, react: 0.3, desc: '最後の肉をお出しした組に、フランベで思い出づくり（記念日の組を先に）' }
  },
  washerSec: 1.6, washerCap: 8,

  shop: {
    offers: 3, rerollBase: 10000, rerollStep: 5000,
    items: [
      { id: 'plates', name: '追加の皿', price: 20000, desc: '皿が2枚増える', max: 99, w: 3 },
      { id: 'bench', name: '作業台', price: 15000, desc: '何でも1つ置ける台', station: 'bench', max: 5, w: 2 },
      { id: 'sink', name: '洗い場', price: 80000, desc: '洗う場所を増やす', station: 'sink', max: 2, w: 2 },
      { id: 'washer', name: '食洗機', price: 220000, desc: '入れた皿を自動で洗う（1枚1.6秒・最大8枚）', station: 'washer', max: 1, w: 2 },
      { id: 'sneakers', name: 'スニーカー', price: 60000, desc: '移動が15%速くなる', max: 1, w: 1.5 },
      { id: 'highHeat', name: '高火力鉄板', price: 150000, desc: '焼く速さ×1.33。ちょうどいい時間も短くなる', max: 1, w: 1 },
      { id: 'reservation', name: '予約台帳', price: 90000, desc: '来店の山をならす', max: 1, w: 1.5 },
      { id: 'counter', name: '鉄板カウンター増設', price: 250000, desc: '4席のカウンターが1つ増え、皿も4枚つく（スタッフを2人以上雇うと並ぶ。ひとりでは回らないため）', max: 1, w: 1.5, staffNeed: 2, plates: 4 },
      { id: 'showcase', name: '神戸牛ショーケース', price: 60000, desc: '肉を取る場所を増やす', station: 'showcase', max: 2, w: 1 },
      { id: 'board', name: 'まな板', price: 30000, desc: '前菜を作る場所を増やす', station: 'board', max: 3, w: 2 },
      // 次のステップ：3日目の夜から並ぶ投資。買うと、ビールの代わりに日本酒・ワインを頼むお客様が出る
      { id: 'sakeShelf', name: '酒棚（日本酒）', price: 60000, desc: 'お客様が日本酒（4,500円）を頼むようになる。ビール（800円）より大きく売上が上がる', station: 'sake', max: 1, w: 2, fromDay: 3 },
      { id: 'wineCellar', name: 'ワインセラー', price: 80000, desc: 'お客様がワイン（5,500円）を頼むようになる。ビール（800円）より大きく売上が上がる', station: 'wine', max: 1, w: 2, fromDay: 3 }
    ],
    firstNight: ['plates', 'bench', 'sink'],
    // この日の夜は必ず並べる（次のステップを見せる）
    fixedNights: { 3: ['sakeShelf', 'wineCellar'] }
  },

  cards: [
    { id: 'garlic', kind: 'dish', name: 'ガーリックライス', good: '35%のお客様が追加で頼む（＋2,500円）', hard: '皿が2倍要る。炊飯器が届く', station: 'rice', riceP: 0.35 },
    { id: 'emperor', kind: 'dish', name: '大将軍コース', good: '大将軍コース（エンペラー・1人3万円）が始まる', hard: 'エンペラーは焼き時間が長い。前菜2品。焦がすと痛い', station: 'eshowcase' },
    { id: 'halal', kind: 'guest', name: 'ハラルのお客様', good: '組数＋10%', hard: '20%の組はハラル牛が必要。酒は出せない', station: 'hshowcase', halalP: 0.2, groupMult: 1.1 },
    { id: 'inbound', kind: 'guest', name: 'インバウンド団体', good: '組数＋10%', hard: '3〜4名の組が増える', groupMult: 1.1, sizeWeights: [0, 0.05, 0.35, 0.3, 0.3] },
    { id: 'anniversary', kind: 'guest', name: '記念日のお客様', good: 'TIPと口コミが大きい', hard: '25%の組は思い出づくりをしないと★−2', annivP: 0.25 },
    { id: 'rush', kind: 'guest', name: 'ホテル送客ラッシュ', good: '組数＋20%', hard: '2回の大きな山が来る', groupMult: 1.2, rush: true },
    { id: 'impatient', kind: 'guest', name: 'せっかちなお客様', good: '組数＋15%', hard: '待てる時間−18%', groupMult: 1.15, patienceMult: 0.82 }
  ],

  // 店長スタイル（6軸）
  axes: [
    { id: 'profit', name: '利益' },
    { id: 'turnover', name: '回転' },
    { id: 'precision', name: '焼きの精度' },
    { id: 'memory', name: '思い出' },
    { id: 'loss', name: 'ロスの少なさ' },
    { id: 'system', name: '仕組み' }
  ],
  axisTargets: { profit: 3200000, guestsPerDay: 24, lossRateBad: 0.15, errorRateBad: 0.2, memoryBase: 3 },
  styles: {
    profit: { name: '数字の侍', line: '利益を最後まで積み上げた。次は、その利益で何を任せるか。' },
    turnover: { name: '回転の鬼', line: 'とにかく多くのお客様を通した。思い出は残せただろうか。' },
    precision: { name: '焼きの職人', line: '注文どおりに焼き切った。その腕を、ほかの人にも渡せるか。' },
    memory: { name: 'メモリークリエイター', line: 'お客様に思い出を残した。それを毎日続けられる仕組みはあるか。' },
    loss: { name: '原価の番人', line: 'ほとんど無駄を出さなかった。攻める日はあったか。' },
    system: { name: '任せる店長', line: '人と仕組みに任せて回した。自分の時間は何に使ったか。' },
    solo: { name: 'ひとりで背負う店長', line: 'ほぼ全部を自分で回した。あなたが倒れたら、この店はどうなるか。' }
  },
  finalQuestions: [
    'あなたがいなくても、この店は回りますか？',
    'いちばん時間を使った作業は、あなたにしかできない仕事でしたか？',
    'お客様が持ち帰ったのは、焼き加減でしたか。それとも、思い出でしたか？'
  ]
};

// 左右反転（mirror）：地図・カウンター・入口・待つ場所・最初の設備・届く設備の置き場所・始まりの位置をまとめて反転する
// マスの x は W-1-x、マスの中心などの連続の x は W-x、カウンターは左端 x0 を W-x0-席数 にする
(function (D) {
  var W = D.map[0].length;
  D.mirrorX = function (x) { return D.mirror ? W - 1 - x : x; };
  Object.keys(D.drinks).forEach(function (d) { D.money.price[d] = D.drinks[d].price; D.money.cost[d] = D.drinks[d].cost; });
  // 部位ごとのショーケース（sc_部位）と値段。値段の指定がなければ神戸牛と同じ
  Object.keys(D.meats).forEach(function (id) {
    var m = D.meats[id];
    D.money.price[id] = D.courses[m.course].price;   // 肉の値段＝コースの値段
    if (D.money.cost[id] == null) D.money.cost[id] = m.costv || D.money.cost.beef;
    if (!m.part) return;
    D.stations['sc_' + id] = { name: m.name + 'ショーケース', short: m.name, label: m.abbr, provides: id, part: true };
  });
  if (!D.mirror) return;
  D.map = D.map.map(function (r) { return r.split('').reverse().join(''); });
  D.counters.forEach(function (c) { c.x0 = W - c.x0 - c.seats; });
  D.door.x = W - 1 - D.door.x;
  D.waitSpots.forEach(function (p) { p.x = W - 1 - p.x; });
  D.playerStart.x = W - D.playerStart.x;
  D.startStations.forEach(function (st) { st.x = W - 1 - st.x; });
  D.deliverySpots.forEach(function (sp) { sp[0] = W - 1 - sp[0]; });   // 届いた設備の置き場所も（2026-10-27 反転し忘れ）
})(WK.DATA);

if (typeof module !== 'undefined') module.exports = WK;
