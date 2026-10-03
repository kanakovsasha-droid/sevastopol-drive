// Звук E63 S: V8 битурбо 4.0, синтезом в WebAudio — без сэмплов и без
// зависимостей.
//
// Главный поток только раз в кадр ставит цели параметрам (обороты, газ,
// скольжение) через setTargetAtTime — всё, что звучит, считают узлы
// WebAudio в своём потоке. Резких присвоений нет нигде: каждый параметр
// подтягивается с постоянной времени, а разовые звуки (хлопки, блоу-офф,
// кик переключения) идут со своей огибающей от нуля, — щелчков нет.
//
// Один и тот же граф работает и вживую (AudioContext), и офлайн
// (OfflineAudioContext — так стенд пишет WAV): set(state, t) принимает время.

// ---- форма волны мотора: один ЦИКЛ (два оборота коленвала) V8 с плоским
// крестом. Порядок работы 1-5-4-8-6-3-7-2, вспышка каждые 90°, но каждый ряд
// выхлопа получает импульсы неравномерно (180-270-180-90°) — отсюда басовитое
// «бубнение» кроссплейн-V8. Импульсы цилиндров чуть разные по силе: на
// холостых это слышно как неровность, на высоких сливается в рёв.
function v8Wave(ctx) {
  const N = 2048, H = 96;
  const order = [1, 5, 4, 8, 6, 3, 7, 2];
  const bankA = new Set([1, 2, 3, 4]);
  const spread = [1.0, 0.86, 1.1, 0.93, 1.05, 0.9, 1.12, 0.97];   // разброс по цилиндрам
  const x = new Float64Array(N);
  for (let k = 0; k < 8; k++) {
    const cyl = order[k];
    const at = k * 90;                                     // градусы коленвала
    const tau = bankA.has(cyl) ? 11 : 14;                  // ряды звучат по-разному
    const amp = spread[cyl - 1] * (bankA.has(cyl) ? 1 : 0.85);
    for (let i = 0; i < N; i++) {
      let ph = i / N * 720 - at;
      if (ph < 0) ph += 720;
      const u = ph / tau;
      x[i] += amp * u * Math.exp(1 - u);                   // альфа-импульс
    }
  }
  const re = new Float32Array(H + 1), im = new Float32Array(H + 1);
  for (let h = 1; h <= H; h++) {
    let a = 0, b = 0;
    for (let i = 0; i < N; i++) {
      const w = 2 * Math.PI * h * i / N;
      a += x[i] * Math.cos(w); b += x[i] * Math.sin(w);
    }
    // верхние гармоники приглушаем: иначе на отсечке «пила» режет уши
    const roll = 1 / (1 + (h / 48) ** 2);
    re[h] = a / N * roll; im[h] = b / N * roll;
  }
  return ctx.createPeriodicWave(re, im);
}

function noiseBuffer(ctx, sec, color = 'white') {
  const n = Math.floor(ctx.sampleRate * sec);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (color === 'brown') { b = (b + 0.02 * w) / 1.02; d[i] = b * 3.5; } else d[i] = w;
  }
  return buf;
}

// Хлопок в выхлопе: удар низом плюс треск — короткие случайные искры.
function popBuffer(ctx, big) {
  const sec = big ? 0.22 : 0.12, sr = ctx.sampleRate, n = Math.floor(sr * sec);
  const buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
  const f0 = big ? 62 : 85;
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = Math.min(1, t / 0.0015) * Math.exp(-t / (big ? 0.045 : 0.025));
    const thump = Math.sin(2 * Math.PI * f0 * t * (1 - t * 2)) * env;
    // треск: редкие искры поверх затухающего шума
    const spark = Math.random() < 0.02 ? (Math.random() * 2 - 1) * 2.5 : 0;
    lp += ((Math.random() * 2 - 1) - lp) * 0.35;
    const crack = (lp * 0.8 + spark) * Math.exp(-t / (big ? 0.06 : 0.035));
    d[i] = thump * 0.9 + crack * 0.55;
  }
  return buf;
}

export class E63Sound {
  constructor(ctx, dest = ctx.destination) {
    this.ctx = ctx;
    const g = (v = 0) => { const n = ctx.createGain(); n.gain.value = v; return n; };
    const flt = (type, f, q = 0.7) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; return n; };

    // ---- общий выход: громкость, «салон» (фильтр), компрессор от перегруза
    this.master = g(0);
    this.cabin = flt('lowpass', 12000, 0.5);
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.ratio.value = 4;
    this.comp.attack.value = 0.002; this.comp.release.value = 0.18;
    // после компрессора — запас: хлопок короче его атаки и иначе бьёт в потолок
    this.out = g(0.8);
    this.master.connect(this.cabin).connect(this.comp).connect(this.out).connect(dest);

    // ---- мотор: два генератора одной формы с расстройкой в 0.35% — медленные
    // биения дают неровность холостых; плюс медленное «плавание» оборотов
    const wave = v8Wave(ctx);
    this.oscA = ctx.createOscillator(); this.oscA.setPeriodicWave(wave);
    this.oscB = ctx.createOscillator(); this.oscB.setPeriodicWave(wave);
    this.oscA.frequency.value = 7.5; this.oscB.frequency.value = 7.53;
    this.wob = ctx.createOscillator(); this.wob.frequency.value = 1.7;
    this.wobDepth = g(0);
    this.wob.connect(this.wobDepth); this.wobDepth.connect(this.oscA.frequency); this.wobDepth.connect(this.oscB.frequency);
    const mixA = g(0.8), mixB = g(0.45);
    this.oscA.connect(mixA); this.oscB.connect(mixB);
    this.drive = ctx.createWaveShaper();                  // нагрузка = жёстче
    this.drive.curve = this._curve(2.2); this.drive.oversample = '2x';
    this.preDrive = g(1);
    mixA.connect(this.preDrive); mixB.connect(this.preDrive);
    this.preDrive.connect(this.drive);
    this.engLP = flt('lowpass', 600, 0.9);
    this.engGain = g(0);
    this.drive.connect(this.engLP).connect(this.engGain).connect(this.master);
    // бас вспышек: синус на частоте зажигания (4 на оборот)
    this.sub = ctx.createOscillator(); this.sub.type = 'sine';
    this.subGain = g(0);
    this.sub.connect(this.subGain).connect(this.master);

    // ---- шум впуска и механики
    const nz = ctx.createBufferSource(); nz.buffer = noiseBuffer(ctx, 2); nz.loop = true;
    this.intakeBP = flt('bandpass', 800, 0.8);
    this.intakeGain = g(0);
    nz.connect(this.intakeBP).connect(this.intakeGain).connect(this.master);
    this.noise = nz;

    // ---- турбины: тихий свист по наддуву
    this.turbo = ctx.createOscillator(); this.turbo.type = 'sine'; this.turbo.frequency.value = 2500;
    this.turboGain = g(0);
    this.turbo.connect(this.turboGain).connect(this.master);
    // блоу-офф: шипение клапана при сбросе газа под наддувом
    this.bovBP = flt('bandpass', 2300, 1.4);
    this.bovGain = g(0);
    const nz2 = ctx.createBufferSource(); nz2.buffer = nz.buffer; nz2.loop = true; nz2.loopStart = 0.7;
    nz2.connect(this.bovBP).connect(this.bovGain).connect(this.master);
    this.noise2 = nz2;

    // ---- шины: визг (тон с вибрато) и шорох скольжения
    this.squeal = ctx.createOscillator(); this.squeal.type = 'sawtooth'; this.squeal.frequency.value = 980;
    this.vib = ctx.createOscillator(); this.vib.frequency.value = 7.3;
    const vibD = g(28); this.vib.connect(vibD).connect(this.squeal.frequency);
    this.squealBP = flt('bandpass', 1150, 5);
    this.squealGain = g(0);
    this.squeal.connect(this.squealBP).connect(this.squealGain).connect(this.master);
    const nz3 = ctx.createBufferSource(); nz3.buffer = noiseBuffer(ctx, 2, 'brown'); nz3.loop = true;
    this.scrubLP = flt('lowpass', 900, 0.6);
    this.scrubGain = g(0);
    nz3.connect(this.scrubLP).connect(this.scrubGain).connect(this.master);
    this.noise3 = nz3;

    // ---- хлопки: готовые буферы, играются разово
    this.popBig = popBuffer(ctx, true); this.popSmall = popBuffer(ctx, false);
    this.popBus = g(0.55);
    this.popBus.connect(this.master);

    this.st = { thr: 0, rpm: 900, shift: 0, popUntil: 0, nextPop: 0, boost: 0, bovT: -9, lastT: 0 };
    this.volume = 0.9;
    this.shots = 0;                    // счётчик разовых звуков — для стенда
    this.on = true;
    const t0 = ctx.currentTime;
    for (const o of [this.oscA, this.oscB, this.wob, this.sub, nz, nz2, this.turbo, this.squeal, this.vib, nz3]) o.start(t0);
  }

  _curve(k) {
    const n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); }
    return c;
  }

  _shot(buf, t, gain, rate = 1) {
    const ctx = this.ctx, s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = buf; s.playbackRate.value = rate; g.gain.value = gain;
    s.connect(g).connect(this.popBus);
    s.start(t);
    this.shots++;
    s.onended = () => { s.disconnect(); g.disconnect(); };
  }

  // Состояние машины → цели параметров. t — время контекста, когда это должно
  // прозвучать. s: rpm, throttle (0..1), limiter, shiftCount, boost, skid
  // (м/с скольжения пятна, худшее колесо), burnout, inside, dist (м до камеры).
  set(s, t) {
    const P = (param, v, tc = 0.03) => param.setTargetAtTime(v, t, tc);
    const st = this.st;
    const rpm = Math.max(500, s.rpm || 900), thr = s.throttle || 0;
    const fc = rpm / 120;                                   // частота цикла
    const r = Math.min(1, (rpm - 800) / 6200);              // доля оборотов
    const cut = s.limiter ? 1 : 0;
    // нагрузка: газ, а на отсечке и в разрыве переключения — провал
    const shifting = (s.shiftCount || 0) !== st.shift;
    const load = thr * (1 - 0.75 * cut);

    P(this.oscA.frequency, fc, 0.012);
    P(this.oscB.frequency, fc * 1.0035, 0.012);
    P(this.sub.frequency, rpm / 15, 0.012);
    // неровность холостых: плавание на 1.5% только внизу
    P(this.wobDepth.gain, fc * 0.015 * Math.max(0, 1 - r * 3), 0.2);
    P(this.preDrive.gain, 0.6 + load * 1.6, 0.03);
    // тембр: под газом и на оборотах — ярче
    P(this.engLP.frequency, 240 + rpm * 0.22 + load * (900 + rpm * 0.35), cut ? 0.006 : 0.03);
    // переключение: провал на разрыв тяги, потом подхват с «киком»
    if (shifting) {
      st.shift = s.shiftCount || 0;
      if (thr > 0.5) {
        st.dipUntil = t + 0.11;
        this._shot(this.popSmall, t + 0.1, 0.5 * thr, 0.9);
      }
    }
    const dip = t < (st.dipUntil || 0) ? 0.35 : 1;
    const engV = (0.20 + 0.42 * r) * (0.45 + 0.55 * load) + 0.06;
    P(this.engGain.gain, engV * (cut ? 0.55 : 1) * dip, cut || dip < 1 ? 0.008 : 0.025);
    P(this.subGain.gain, (0.10 + 0.25 * load) * (1 - r * 0.6), 0.04);
    P(this.intakeBP.frequency, 500 + rpm * 0.35, 0.05);
    P(this.intakeGain.gain, 0.012 + 0.07 * load * r, 0.04);

    // турбины
    const boost = s.boost || 0;
    P(this.turbo.frequency, 2400 + boost * 4200 + r * 1500, 0.08);
    P(this.turboGain.gain, 0.006 * boost, 0.08);
    if (st.boost - boost > 0.25 && t - st.bovT > 0.8) {           // сброс под наддувом
      st.bovT = t;
      const gg = this.bovGain.gain;
      gg.cancelScheduledValues(t);
      gg.setTargetAtTime(0.05 * st.boost, t, 0.01);
      gg.setTargetAtTime(0, t + 0.06, 0.12);
    }
    st.boost = st.boost * 0.9 + boost * 0.1;

    // хлопки и потрескивания на сбросе газа с оборотов
    // газ сглажен физикой и падает за несколько кадров, поэтому ловим не
    // «прошлый кадр был под газом», а взведённый флаг
    if (thr > 0.5) st.armed = true;
    if (st.armed && thr < 0.15) {
      st.armed = false;
      if (rpm > 3000) {
        st.popUntil = t + 0.5 + rpm / 7000 * 1.1;
        st.nextPop = t + 0.04;
        this._shot(this.popBig, t + 0.03, 0.85, 0.95 + Math.random() * 0.1);
      }
    }
    if (thr > 0.2) st.popUntil = 0;
    while (thr < 0.15 && t < st.popUntil && st.nextPop < t + 0.05) {
      const big = Math.random() < 0.18;
      const left = (st.popUntil - st.nextPop) / 1.5;
      this._shot(big ? this.popBig : this.popSmall, Math.max(t, st.nextPop),
        (big ? 0.6 : 0.35) * (0.4 + Math.min(1, left)) * (0.6 + Math.random() * 0.4), 0.85 + Math.random() * 0.35);
      st.nextPop += 0.035 + Math.random() * Math.random() * 0.22;
    }
    st.thr = thr;

    // шины: визг растёт со скольжением пятна (2–12 м/с), бёрнаут — ещё шорох
    const skid = Math.max(0, Math.min(1, ((s.skid || 0) - 2) / 10));
    P(this.squealGain.gain, 0.05 * skid * skid, 0.05);
    P(this.squeal.frequency, 900 + skid * 250 + (s.burnout ? -120 : 0), 0.1);
    P(this.scrubGain.gain, 0.16 * skid + (s.burnout ? 0.12 : 0), 0.06);
    P(this.scrubLP.frequency, 500 + skid * 900, 0.1);

    // слушатель: снаружи — по расстоянию, в салоне — глуше и ближе
    const inside = !!s.inside;
    const dist = s.dist || 6;
    const vol = this.on ? this.volume * (inside ? 0.7 : 1 / (1 + Math.max(0, dist - 5) / 9)) : 0;
    P(this.master.gain, vol, 0.08);
    P(this.cabin.frequency, inside ? 1700 : 12000, 0.1);
    st.lastT = t;
  }
}
