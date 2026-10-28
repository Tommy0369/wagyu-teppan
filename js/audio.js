/* 和牛の刀 鉄板十五日 — AUDIO
 * 音はすべて WebAudio で合成する（音声ファイルなし・オフラインで動く）。
 * 同じ意味の音は常に同じ。よく鳴る音はピッチを少し揺らす。
 */
var WK = (typeof WK !== 'undefined') ? WK : {};

(function (WK) {
  'use strict';
  var A = WK.Audio = { on: true, ctx: null, master: null, sizzle: null, sizzleGain: null };

  A.init = function () {
    // 電話などのあと、iPhone では 'interrupted' になることがある → 動いていなければ起こす
    if (A.ctx) { if (A.ctx.state !== 'running' && A.ctx.resume) A.ctx.resume().catch(function () {}); return; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    A.ctx = new AC();
    A.master = A.ctx.createGain(); A.master.gain.value = A.on ? 0.55 : 0; A.master.connect(A.ctx.destination);
    // 鉄板のジュー（ノイズを帯域で絞って常時流し、焼いている枚数で音量を変える）
    var len = A.ctx.sampleRate * 2, buf = A.ctx.createBuffer(1, len, A.ctx.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (0.6 + 0.4 * Math.random());
    var src = A.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    var bp = A.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 5200; bp.Q.value = 0.7;
    var hp = A.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800;
    A.sizzleGain = A.ctx.createGain(); A.sizzleGain.gain.value = 0;
    src.connect(bp); bp.connect(hp); hp.connect(A.sizzleGain); A.sizzleGain.connect(A.master);
    src.start();
    A.noiseBuf = buf;
  };
  A.setOn = function (on) {
    A.on = on;
    if (A.master) A.master.gain.setTargetAtTime(on ? 0.55 : 0, A.ctx.currentTime, 0.05);
  };
  A.setSizzle = function (n) {
    if (!A.ctx || !A.sizzleGain) return;
    A.sizzleGain.gain.setTargetAtTime(Math.min(0.16, n * 0.035), A.ctx.currentTime, 0.15);
  };

  function tone(freq, dur, type, vol, when, slide) {
    if (!A.ctx || !A.on) return;
    var t = A.ctx.currentTime + (when || 0);
    var o = A.ctx.createOscillator(), g = A.ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(A.master); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, freq, q, vol, when, type) {
    if (!A.ctx || !A.on || !A.noiseBuf) return;
    var t = A.ctx.currentTime + (when || 0);
    var s = A.ctx.createBufferSource(); s.buffer = A.noiseBuf;
    var f = A.ctx.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1;
    var g = A.ctx.createGain(); g.gain.setValueAtTime(vol || 0.2, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(A.master); s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }
  function vary(x) { return x * (0.95 + Math.random() * 0.1); }

  A.play = function (name, opt) {
    if (!A.ctx || !A.on) return;
    switch (name) {
      case 'pick': tone(vary(640), 0.05, 'triangle', 0.12); break;
      case 'place': tone(vary(240), 0.07, 'triangle', 0.16); noise(0.04, 900, 1.5, 0.05); break;
      case 'chop': noise(0.035, vary(2600), 2, 0.16); tone(vary(180), 0.03, 'square', 0.04); break;
      case 'flambe': noise(0.32, vary(700), 0.7, 0.14); noise(0.22, vary(2400), 1.2, 0.06, 0.04); break;   // ぼっ（火が上がる）
      case 'cutDone': tone(520, 0.06, 'triangle', 0.12); tone(780, 0.08, 'triangle', 0.1, 0.05); break;
      case 'sizzle': noise(0.35, 6000, 0.6, 0.12, 0, 'highpass'); break;
      case 'wash': noise(0.12, vary(1200), 3, 0.08); break;
      case 'washDone': tone(vary(1400), 0.05, 'sine', 0.07); break;
      case 'scrape': noise(0.08, vary(3200), 4, 0.07); break;
      case 'serve': tone(880, 0.16, 'sine', 0.16); tone(1320, 0.22, 'sine', 0.1, 0.06); break;
      case 'serveWrong': tone(440, 0.12, 'triangle', 0.12); tone(392, 0.16, 'triangle', 0.1, 0.08); break;
      case 'pay': tone(1568, 0.06, 'square', 0.05); tone(2093, 0.12, 'square', 0.05, 0.06); noise(0.08, 5000, 2, 0.04, 0.02); break;
      case 'tip': tone(1760, 0.09, 'sine', 0.1, 0.12); tone(2349, 0.16, 'sine', 0.08, 0.2); break;
      case 'mc': noise(0.03, 3000, 3, 0.14); [784, 988, 1175, 1568].forEach(function (f, i) { tone(f, 0.18, 'sine', 0.07, 0.05 + i * 0.07); }); break;
      case 'arrive': tone(1046, 0.1, 'sine', 0.06); tone(784, 0.14, 'sine', 0.05, 0.08); break;
      case 'order': tone(660, 0.05, 'sine', 0.06); break;
      case 'warn': tone(330, 0.08, 'triangle', 0.06); break;
      case 'complaint': tone(150, 0.4, 'sawtooth', 0.12, 0, 0.6); break;
      case 'lost': tone(300, 0.2, 'triangle', 0.07, 0, 0.7); break;
      case 'burnt': noise(0.4, 400, 0.8, 0.12, 0, 'lowpass'); break;
      case 'trash': noise(0.12, 700, 1, 0.1, 0, 'lowpass'); break;
      case 'open': tone(98, 0.5, 'sine', 0.3, 0, 0.5); noise(0.18, 200, 1, 0.2, 0, 'lowpass'); tone(98, 0.4, 'sine', 0.22, 0.32, 0.5); break;
      case 'close': [523, 659, 784, 1046].forEach(function (f, i) { tone(f, 0.3, 'sine', 0.09, i * 0.09); }); break;
      case 'fail': [392, 330, 262].forEach(function (f, i) { tone(f, 0.35, 'triangle', 0.1, i * 0.14); }); break;
      case 'buy': tone(988, 0.08, 'square', 0.05); tone(1319, 0.12, 'square', 0.05, 0.07); break;
      case 'card': [659, 880, 1319].forEach(function (f, i) { tone(f, 0.25, 'sine', 0.08, i * 0.06); }); break;
      case 'ui': tone(vary(720), 0.035, 'sine', 0.06); break;
      case 'deny': tone(200, 0.08, 'square', 0.05); break;
    }
  };
})(WK);
