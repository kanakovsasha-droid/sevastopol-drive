// Звук E63 S. Основной голос мотора — записи настоящего V8 (data/audio,
// собираются tools/build-audio.mjs из Freesound, CC0): Ford Mustang GT500 —
// петля «под нагрузкой» на все обороты и петля холостых у самого низа. Высота
// у обеих — строго обороты / обороты записи, без переходов между петлями по
// порогам. Хлопки и выстрелы — записями со случайным выбором, визг шин —
// записью по скольжению. Синтез ниже — запасной голос на те секунды, пока
// записи грузятся (и если не загрузились): владельцу он показался писклявым.
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

// «Тук» при глушении: мотор встал — кузов качнулся на опорах. Низкий
// глухой удар 45 Гц с быстрым затуханием и чуть шума под ФНЧ — без тона.
function thumpBuffer(ctx) {
  const sr = ctx.sampleRate, n = Math.floor(sr * 0.25), buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
  let a = 0, b = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr, env = Math.min(1, t / 0.006) * Math.exp(-t / 0.05);
    // шум через два ФНЧ ~120 Гц — только «тело» удара, без шипения
    a += ((Math.random() * 2 - 1) - a) * 0.016; b += (a - b) * 0.016;
    d[i] = (Math.sin(2 * Math.PI * 45 * t * (1 - t * 0.8)) * 0.8 + b * 6) * env;
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

// Выпрямить петлю с плавно растущим тоном: частота в записи идёт линейно от
// f0 до f1, читаем источник со скоростью fm / f(t) — на выходе частота fm
// постоянна (fm — средняя, длина почти не меняется).
function flatten(ctx, buf, f0, f1) {
  if (!f0 || !f1 || Math.abs(f1 - f0) < 0.5) return buf;
  const a = buf.getChannelData(0), n = a.length, fm = (f0 + f1) / 2;
  const out = [];
  for (let t = 0; t < n - 1;) {
    const i = Math.floor(t), u = t - i;
    out.push(a[i] * (1 - u) + a[i + 1] * u);
    t += fm / (f0 + (f1 - f0) * t / n);
  }
  const b = ctx.createBuffer(1, out.length, buf.sampleRate);
  b.getChannelData(0).set(out);
  return b;
}

// Петля без шва: хвост записи наложен на её начало с равномощным переходом.
// Петли модов обрезаны как попало — на стыке скачок до 0.35 полной шкалы.
function seamless(ctx, buf, xf) {
  const X = Math.min(Math.floor(buf.sampleRate * xf), Math.floor(buf.length / 3));
  const L = buf.length - X;
  const out = ctx.createBuffer(1, L, buf.sampleRate);
  const a = buf.getChannelData(0), o = out.getChannelData(0);
  o.set(a.subarray(0, L));
  for (let i = 0; i < X; i++) {
    const t = i / X;
    o[i] = a[i] * Math.sin(t * Math.PI / 2) + a[L + i] * Math.cos(t * Math.PI / 2);
  }
  return out;
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

    // ---- турбины: свиста НЕТ. Был чистый синус 7.5–8.1 кГц по наддуву — мимо
    // всех фильтров, и на разгоне он звучал «электромотором»; владелец
    // попросил убрать совсем. Остался блоу-офф: шипение клапана при сбросе
    // газа под наддувом — шум, не тон; и он под ФНЧ 4 кГц, чтобы не пищал.
    this.bovBP = flt('bandpass', 2300, 1.4);
    this.bovLP = flt('lowpass', 4000, 0.6);
    this.bovGain = g(0);
    const nz2 = ctx.createBufferSource(); nz2.buffer = nz.buffer; nz2.loop = true; nz2.loopStart = 0.7;
    nz2.connect(this.bovBP).connect(this.bovLP).connect(this.bovGain).connect(this.master);
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
    for (const o of [this.oscA, this.oscB, this.wob, this.sub, nz, nz2, this.squeal, this.vib, nz3]) o.start(t0);
  }

  _curve(k) {
    const n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); }
    return c;
  }

  // Записи приехали: строим второй голос мотора и плавно отдаём ему звук.
  // bufs: { v8_idle, v8_load, pop_1…, bang_1…, tyre_squeal }, meta —
  // sounds.json (обороты записи каждой петли).
  //
  // Схема как у GTA: высота у каждой петли — строго rpm / обороты её
  // записи, и переходов между петлями по порогам оборотов нет. Основа на
  // всех оборотах — ровный ход GT500 (~2740 об/мин, 6 с почти без дрейфа),
  // у самого низа к ней примешаны холостые (841), под газом — разгон в пол
  // (выпрямлен до ровных 3653). Все петли в любой момент звучат на одной и
  // той же высоте, так что их смесь — это тембр, а не ступенька тона. Прежний набор из шести петель переходил между ними по оборотам, и
  // каждая петля внутри «плыла» по высоте — отсюда были фантомные переключения.
  useSamples(bufs, meta) {
    const ctx = this.ctx, t0 = ctx.currentTime;
    const g = (v = 0) => { const n = ctx.createGain(); n.gain.value = v; return n; };
    const flt = (type, f, q = 0.7, gain = 0) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; n.gain.value = gain; return n; };
    // общий путь: два ФНЧ подряд (сброс газа — темнее), полка на низ («бас AMG»)
    const lp = flt('lowpass', 2000, 0.6), lp2 = flt('lowpass', 2500, 0.5);
    const shelf = flt('lowshelf', 160, 0.7, 6);
    // На холостых линия вспышек (rpm/15 ≈ 60 Гц) и её 2-я и 3-я гармоники в
    // записи выступают на 16–32 дБ — на слух это ровный гул. Приглушаем их
    // широкими «колоколами» только у холостых: бубнёж полупорядков остаётся.
    const fireCut = flt('peaking', 60, 5, 0), fireCut2 = flt('peaking', 120, 7, 0), fireCut3 = flt('peaking', 180, 8, 0);
    const bus = g(0);
    lp.connect(lp2).connect(fireCut).connect(fireCut2).connect(fireCut3).connect(shelf).connect(bus).connect(this.master);
    const loops = ['v8_idle', 'v8_cruise', 'v8_load'].filter(n => bufs[n] && meta.loops[n]).map(n => {
      const src = ctx.createBufferSource(); src.buffer = bufs[n]; src.loop = true;
      const gg = g(0); src.connect(gg).connect(lp);
      const off = Math.random() * bufs[n].duration;
      src.start(t0, off);
      // t0 и off — чтобы стенд мог посчитать, где сейчас шов петли
      return { name: n, rpm: meta.loops[n].rpm, src, g: gg, t0, off, len: bufs[n].duration };
    });
    let squeal = null;
    if (bufs.tyre_squeal) {
      const src = ctx.createBufferSource(); src.buffer = bufs.tyre_squeal; src.loop = true;
      const gg = g(0); src.connect(gg).connect(this.master); src.start(t0);
      squeal = { src, g: gg };
    }
    const pick = pre => Object.keys(bufs).filter(k => k.startsWith(pre)).map(k => bufs[k]);
    this._dropSamples(t0);
    // Низ — из самой записи: та же смесь петель через ФНЧ 150 Гц отдельным
    // голосом, подпирает бас на средних и высоких оборотах.
    const lowLP = flt('lowpass', 150, 0.7), low = g(0);
    fireCut3.connect(lowLP).connect(low).connect(this.master);
    // Отстрелы на сбросе — по-AMG: не хлопки-петарды, а глухое бульканье и
    // треск в выхлопе. «Бульк» — короткий всплеск низкого рокота того же
    // мотора (петля ровного хода, её густой низ 40–250 Гц) через ФНЧ
    // 160–360 Гц: звук из той же записи, поэтому он в одном миксе с мотором.
    // Высота всплеска от оборотов не зависит — вспышка в выхлопе низкая и
    // глухая на любых. Треск — редкие искры шума 1–3 кГц, тихо. Оба идут
    // через ту же полку и шину, что и мотор: громкость шины на сбросе — и их.
    let burble = null;
    const bsrc = bufs.v8_cruise || bufs.v8_load;
    if (bsrc) {
      const src = ctx.createBufferSource(); src.buffer = bsrc; src.loop = true; src.playbackRate.value = 0.9;
      const lpB = flt('lowpass', 260, 1.2), hpB = flt('highpass', 38, 0.7), gB = g(0);
      src.connect(lpB).connect(hpB).connect(gB).connect(shelf);
      src.start(t0, Math.random() * bsrc.duration);
      const nz = ctx.createBufferSource(); nz.buffer = this.noise.buffer; nz.loop = true; nz.loopStart = 1.1;
      const bpC = flt('bandpass', 1700, 0.9), lpC = flt('lowpass', 3200, 0.6), gC = g(0);
      nz.connect(bpC).connect(lpC).connect(gC).connect(shelf); nz.start(t0);
      burble = { src, lp: lpB, g: gB, crack: gC, crackBP: bpC, until: 0, last: -9 };
    }
    this.smp = { kind: 'v8', loops, lp, lp2, fireCut, fireCut2, fireCut3, bus, squeal, low, burble,
      pops: pick('pop_'), bangs: pick('bang_'), starter: bufs.starter, mix: 0, t0 };
    this.st.rpmS = this.st.rpm || 900;
  }

  // Звуковой пакет из мода (только локальная игра, см. carfx.js) — ровно как
  // играет GTA/MTA, без самодеятельности:
  //   • ОДНА петля мотора (банк B, sound_001), высота строго от оборотов:
  //     playbackRate = rpm / rpmRef. Никаких переходов между петлями по
  //     оборотам — именно они звучали как переключения, которых не было;
  //   • петля выхлопа (банк A, sound_002) поверх, громкость — от газа;
  //   • сброс газа — та же пара петель тише и под фильтром НЧ, плюс треск
  //     и хлопки из их записей (sound_003 и «бонус»);
  //   • переключение — только по событию коробки (shiftCount из физики).
  // В записи петли мотора обороты плавно растут (частота вспышек 46→57 Гц у
  // w213): прокрученная по кругу, она на стыке «роняла» тон на 20% каждые
  // 3.6 с — тоже как переключение. Поэтому при загрузке петля выпрямляется:
  // читаем её с переменной скоростью, чтобы частота стала постоянной.
  // bufs: { load, exhaust, decel, bonus? }; ref: { load: [f0, f1, rpm], exhaust: rpm }.
  useModPack(bufs, ref, name = '') {
    const ctx = this.ctx, t0 = ctx.currentTime;
    this._dropSamples(t0);
    const g = (v = 0) => { const n = ctx.createGain(); n.gain.value = v; return n; };
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 9000; lp.Q.value = 0.5;
    const shelf = ctx.createBiquadFilter(); shelf.type = 'lowshelf'; shelf.frequency.value = 180; shelf.gain.value = 6;
    const bus = g(0);
    lp.connect(shelf).connect(bus).connect(this.master);
    const loop = (buf, rpm, role) => {
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const gg = g(0); src.connect(gg).connect(lp);
      src.start(t0, Math.random() * buf.duration);
      return { role, rpm, src, g: gg };
    };
    const [f0, f1, rpmRef] = ref.load;
    const loops = [loop(seamless(ctx, flatten(ctx, bufs.load, f0, f1), 0.08), rpmRef, 'load')];
    if (bufs.exhaust) loops.push(loop(seamless(ctx, bufs.exhaust, 0.05), ref.exhaust, 'exhaust'));
    let squeal = null;                                    // визг шин — запись из открытого набора
    if (bufs.squeal) {
      const src = ctx.createBufferSource(); src.buffer = bufs.squeal; src.loop = true;
      const gg = g(0); src.connect(gg).connect(this.master); src.start(t0);
      squeal = { src, g: gg };
    }
    this.smp = { kind: 'mod', name, loops, lp, bus, squeal, decel: bufs.decel, bonus: bufs.bonus || bufs.decel, mix: 0, t0 };
  }

  _dropSamples(t) {
    const S = this.smp;
    if (!S) return;
    S.bus.gain.setTargetAtTime(0, t, 0.05);
    for (const l of S.loops) l.src.stop(t + 0.4);
    if (S.squeal) { S.squeal.g.gain.setTargetAtTime(0, t, 0.05); S.squeal.src.stop(t + 0.4); }
  }

  _pop(big, t, gain, rate) {
    // У открытого звука хлопки — только свои записи (CC0), как и на сайте.
    // Сброс оборотов из мода w212 сюда больше не подмешиваем: это запись
    // падающего тона на своей высоте — поверх петли она звучала ступенькой.
    const S = this.smp;
    if (S && S.kind === 'mod') {
      // сброс газа — запись сброса оборотов с треском; дальше — короткие
      // куски «бонуса» в случайных местах
      if (big && S.decel) this._shot(S.decel, t, gain * 0.9, rate);
      else if (S.bonus) this._shot(S.bonus, t, gain * 0.8, rate, Math.random() * Math.max(0, S.bonus.duration - 0.2), 0.16);
      return;
    }
    const list = S && (big ? S.bangs : S.pops);
    if (list && list.length) {
      this._shot(list[Math.floor(Math.random() * list.length)], t, gain * (big ? 0.9 : 1.1), rate);
    } else this._shot(big ? this.popBig : this.popSmall, t, gain, rate);
  }

  // Отстрелы открытого V8 на сбросе газа. Не на каждый сброс: только с
  // высоких оборотов (от 4500), с вероятностью ~70% и не чаще раза в 1.5 с.
  // Серия — случайные 3–8 «бульков» с разными паузами (60–210 мс), силой и
  // глухостью; к концу серии в среднем слабее. Треск — у части бульков.
  // Газ вернули — серия обрывается.
  _overrun(B, t, thr, rpm) {
    const st = this.st;
    if (thr > 0.2 && B.until > t) {
      B.until = 0;
      for (const p of [B.g.gain, B.crack.gain]) { p.cancelScheduledValues(t); p.setTargetAtTime(0, t, 0.02); }
    }
    // обороты в момент, когда газ только начали отпускать: газ сглажен и
    // уходит в ноль за доли секунды, а в нейтрали обороты за это время уже
    // падают на тысячи
    if (thr > 0.5) st.liftRpm = 0;
    else if (st.armed && !st.liftRpm) st.liftRpm = rpm;
    if (!(st.armed && thr < 0.15)) return;
    st.armed = false;
    if (Math.max(rpm, st.liftRpm || 0) < 4500 || t - B.last < 1.5 || Math.random() > 0.7) return;
    B.last = t;
    this._burbles(B, t + 0.07 + Math.random() * 0.12, 3 + Math.floor(Math.random() * 6), 1);
  }

  // Серия «бульков» с момента at: n штук, сила k (1 — сброс с высоких).
  _burbles(B, at, n, k) {
    const t = this.ctx.currentTime;
    const g = B.g.gain, c = B.crack.gain;
    g.cancelScheduledValues(t); c.cancelScheduledValues(t);
    for (let i = 0; i < n; i++) {
      const a = k * (0.35 + 0.65 * Math.random()) * (1 - 0.45 * i / n);
      const hold = 0.02 + Math.random() * 0.05;
      B.lp.frequency.setTargetAtTime(160 + Math.random() * 200, at - 0.004, 0.003);
      B.src.playbackRate.setTargetAtTime(0.75 + Math.random() * 0.35, at - 0.004, 0.003);
      g.setTargetAtTime(3.2 * a, at, 0.004);
      g.setTargetAtTime(0, at + hold, 0.03 + Math.random() * 0.03);
      if (Math.random() < 0.55) {
        const ct = at + Math.random() * 0.02;
        B.crackBP.frequency.setTargetAtTime(1100 + Math.random() * 1600, ct - 0.003, 0.002);
        c.setTargetAtTime(0.7 * a * (0.5 + Math.random()), ct, 0.0015);
        c.setTargetAtTime(0, ct + 0.004 + Math.random() * 0.01, 0.008);
      }
      this.shots++;
      this.log && this.log.push([at, 'бульк']);
      at += 0.06 + Math.random() * Math.random() * 0.15;
    }
    B.until = at + 0.2;
  }

  _shot(buf, t, gain, rate = 1, offset = 0, dur = 0) {
    const ctx = this.ctx, s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = buf; s.playbackRate.value = rate; g.gain.value = gain;
    s.connect(g).connect(this.popBus);
    if (dur > 0) {
      // кусок из середины записи: огибающая от нуля и в ноль — без щелчков
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain, t + 0.006);
      g.gain.setValueAtTime(gain, t + dur * 0.5);
      g.gain.linearRampToValueAtTime(0, t + dur);
      s.start(t, offset, dur + 0.01);
    } else s.start(t);
    this.shots++;
    s.onended = () => { s.disconnect(); g.disconnect(); };
  }

  // Состояние машины → цели параметров. t — время контекста, когда это должно
  // прозвучать. s: rpm, throttle (0..1), limiter, shiftCount, boost, skid
  // (м/с скольжения пятна, худшее колесо), burnout, inside, dist (м до камеры).
  set(s, t) {
    const P = (param, v, tc = 0.03) => param.setTargetAtTime(v, t, tc);
    const st = this.st;
    const dtA = Math.min(0.1, Math.max(0, t - st.lastT));
    st.loadS = (st.loadS || 0) + ((s.throttle || 0) - (st.loadS || 0)) * Math.min(1, dtA / 0.25);
    const rpm = Math.max(500, s.rpm || 900), thr = s.throttle || 0;
    // Зажигание: 'on' | 'start' (стартер, потом схватывание) | 'off'
    const eng = s.engine || 'on';
    if (eng !== (st.eng || 'on')) {
      const was = st.eng || 'on';
      st.eng = eng;
      if (eng === 'start') {
        st.caught = false;
        const sb = this.smp && this.smp.starter;
        if (sb) this._shot(sb, t, 0.9);
        this.log && this.log.push([t, 'стартер']);
      } else if (eng === 'off' && was !== 'off') {
        // глушим: обороты сходят на нет за ~0.3 с, потом тихий «тук»
        st.offT = t;
        const B = this.smp && this.smp.burble;
        if (B) { B.until = 0; for (const q of [B.g.gain, B.crack.gain]) { q.cancelScheduledValues(t); q.setTargetAtTime(0, t, 0.02); } }
        this._shot(this.thump || (this.thump = thumpBuffer(this.ctx)), t + 0.3, 0.3);
        this.log && this.log.push([t + 0.3, 'тук']);
      }
    }
    // схватывание: обороты пошли вверх со стартерных — громкий рык
    if (eng === 'start' && !st.caught && (s.rpm || 0) > 500) {
      st.caught = true; st.roarUntil = t + 0.8;
      const B = this.smp && this.smp.burble;
      if (B) this._burbles(B, t + 0.25, 2, 0.35);
      this.log && this.log.push([t, 'схватил']);
    }
    const engOn = eng === 'on' || (eng === 'start' && st.caught);
    const fc = rpm / 120;                                   // частота цикла
    const r = Math.min(1, (rpm - 800) / 6200);              // доля оборотов
    const cut = s.limiter ? 1 : 0;
    // нагрузка: газ, а на отсечке и в разрыве переключения — провал
    const shifting = (s.shiftCount || 0) !== st.shift;
    const load = thr * (1 - 0.75 * cut);

    P(this.oscA.frequency, fc, 0.012);
    P(this.oscB.frequency, fc * 1.0035, 0.012);
    if (!this.smp) P(this.sub.frequency, rpm / 15, 0.012);
    // неровность холостых: плавание на 1.5% только внизу
    P(this.wobDepth.gain, fc * 0.015 * Math.max(0, 1 - r * 3), 0.2);
    P(this.preDrive.gain, 0.6 + load * 1.6, 0.03);
    // тембр: под газом и на оборотах — ярче
    P(this.engLP.frequency, 240 + rpm * 0.22 + load * (900 + rpm * 0.35), cut ? 0.006 : 0.03);
    // переключение: провал на разрыв тяги, потом подхват с «киком»
    // Переключение — ТОЛЬКО по событию коробки и коротко: провал на разрыв
    // тяги (70 мс) и под газом — один щелчок выхлопа при подхвате.
    if (shifting) {
      st.shift = s.shiftCount || 0;
      const B = this.smp && this.smp.burble;
      if (thr > 0.3) {
        st.dipUntil = t + 0.07;
        // у открытого V8 — один глухой «бульк» на подхвате, не щелчок
        if (B) this._burbles(B, t + 0.06, 1, 0.5 * thr);
        else this._pop(false, t + 0.06, 0.4 * thr, 0.9);
        this.log && this.log.push([t, 'переключение']);
      } else if (B && st.eng !== 'off' && thr < 0.1 && s.gear > 0 && s.gear < (st.gear || 99) && rpm > 1200) {
        // дауншифт без газа (физика сама поднимает обороты за ~0.15 с) —
        // перегазовка: короткий «газ» по тембру и пара бульков следом
        st.blipUntil = t + 0.3;
        this._burbles(B, t + 0.12, 2 + Math.floor(Math.random() * 3), 0.6);
        this.log && this.log.push([t, 'дауншифт: перегазовка']);
      }
    }
    st.gear = s.gear;
    const dip = t < (st.dipUntil || 0) ? 0.35 : 1;
    // записи: доля их голоса нарастает за полсекунды после загрузки
    const S = this.smp;
    if (S) S.mix = Math.min(1, (t - S.t0) / 0.5);
    const syn = S ? 1 - S.mix : 1;
    const engV = (0.20 + 0.42 * r) * (0.45 + 0.55 * load) + 0.06;
    P(this.engGain.gain, engV * (cut ? 0.55 : 1) * dip * syn * (engOn ? 1 : 0), cut || dip < 1 ? 0.008 : 0.025);
    // бас: синус на полупорядке вспышек (кроссплейн-V8 «бубнит» на rpm/30) —
    // он остаётся и при записях: на высоких оборотах вспышки уходят за 300 Гц,
    // а низ должен давить в любой момент
    if (S) P(this.sub.frequency, rpm / 30, 0.012);
    // у записей низ свой (smp.low) — синус оставлен только синтезу
    P(this.subGain.gain, S ? (0.10 + 0.25 * load) * (1 - r * 0.6) * syn
      : (0.10 + 0.25 * load) * (1 - r * 0.6), 0.04);
    if ((S && S.kind === 'mod') || !engOn) P(this.subGain.gain, 0, 0.05);
    P(this.intakeBP.frequency, 500 + rpm * 0.35, 0.05);
    P(this.intakeGain.gain, (0.012 + 0.07 * load * r) * syn, 0.04);
    if (S && S.kind === 'mod') {
      // высота — строго от оборотов, без переходов между петлями
      for (const lp of S.loops) {
        P(lp.src.playbackRate, rpm / lp.rpm, 0.012);
        P(lp.g.gain, lp.role === 'load' ? 1 : 0.25 + 0.75 * load, 0.03);
      }
      // газ — открыто и громко, сброс — тише и под фильтром НЧ
      const vol = 0.38 * (0.65 + 0.35 * load) * (cut ? 0.35 : 1) * dip * S.mix * (engOn ? 1 : 0);
      P(S.bus.gain, vol, !engOn ? 0.08 : cut || dip < 1 ? 0.008 : 0.04);
      // как у открытого набора: верха растут с оборотами медленно, на отсечке —
      // не выше 3 кГц (петля мода на 7000 разогнана втрое — без этого визг)
      P(S.lp.frequency, load > 0.15 ? Math.min(3000, 900 + rpm * 0.3 + 600 * load) : 700 + 1200 * load / 0.15, 0.05);
    } else if (S) {
      // Обороты для звука. Вниз и вверх под газом — за физикой сразу (так и
      // звучит настоящее переключение). Рывок ВВЕРХ без газа — дауншифт
      // накатом или подскок колёс на кочке — догоняем плавно (0.35 с): на
      // сбросе тон должен только плавно падать, без ступенек.
      // Обороты физики уже без рывков от колёс (инерция маховика); подъём без
      // газа и вне перегазовки звук ещё дополнительно сглаживает (0.12 с).
      const up = rpm > st.rpmS, coast = st.loadS < 0.15 && thr < 0.1;
      // заглушили — тон сходит вниз за ~0.3 с (под затухание); схватывание — сразу
      const rIn = eng === 'off' ? 300 : eng === 'start' ? Math.max(250, s.rpm || 0) : rpm;
      const tau = eng === 'off' ? 0.15 : eng === 'start' ? 0.02 : up && coast && !(t < (st.blipUntil || 0)) ? 0.12 : 0.025;
      st.rpmS += (rIn - st.rpmS) * Math.min(1, dtA / tau);
      const rs = st.rpmS;
      // Смесь тембров (высота у всех петель одна и та же — rs / обороты
      // записи): холостые — по логарифму оборотов 950→1700, выше — ровный
      // ход, а под газом к нему примешан разгон в пол (по сглаженному газу,
      // не по оборотам — порогов по оборотам нет вовсе).
      const k = Math.min(1, Math.max(0, Math.log(rs / 950) / Math.log(1700 / 950)));
      const on = Math.sin(k * Math.PI / 2), ld = Math.min(1, st.loadS);
      const W = { v8_idle: Math.cos(k * Math.PI / 2), v8_cruise: on * Math.cos(ld * Math.PI / 2 * 0.7), v8_load: on * Math.sin(ld * Math.PI / 2) };
      // Холостые живые: обороты чуть «плавают» случайно (±2.5%, как в самой
      // записи холостых — там 53.7…58.7 Гц; новая цель
      // каждые 0.12–0.42 с, сглажено). Ровно стоящая высота давала на
      // холостых чистые линии 60/120/180 Гц — тот самый гул. Выше 1400 — ноль.
      const idle = 1 - Math.min(1, Math.max(0, (rs - 1000) / 400));
      if (engOn && t > (st.wT || 0)) { st.wT = t + 0.12 + Math.random() * 0.3; st.wGoal = Math.random() * 2 - 1; }
      st.wv = (st.wv || 0) + ((st.wGoal || 0) - (st.wv || 0)) * Math.min(1, dtA / 0.18);
      const rsw = rs * (1 + 0.025 * idle * st.wv);
      for (const l of S.loops) {
        const w = W[l.name] || 0;
        P(l.g.gain, w, 0.05);
        P(l.src.playbackRate, rsw / l.rpm, 0.02);
      }
      const rr = Math.min(1, Math.max(0, (rs - 800) / 6200));
      // перегазовка: на 0.3 с звук «под газом» (громче, открытее)
      const roar = t < (st.roarUntil || 0) ? (st.roarUntil - t) / 0.8 : 0;
      const lS = Math.max(t < (st.blipUntil || 0) ? Math.max(st.loadS, 0.55) : st.loadS, 0.7 * roar);
      // мотор молчит: заглушен (затухание ~0.1 с, к 0.6 с — совсем ноль) или
      // ещё крутит стартер; схватил — сразу громко, с рыком
      const off = eng === 'off' || (eng === 'start' && !st.caught);
      const engF = off ? 0 : 1 + 0.2 * roar;
      const engTc = eng === 'off' ? (t - (st.offT || 0) > 0.6 ? 0.01 : 0.1) : 0.015;
      // Газ — громче и открытее, сброс — тише и глуше. Газ сглаженный (0.25 с):
      // клавиша W щёлкает 0↔1, и громкость не должна прыгать за ней.
      const vol = 1.45 * (0.5 + 0.3 * rr) * (0.55 + 0.45 * lS) * (cut ? 0.4 : 1) * dip * S.mix;
      P(S.bus.gain, vol * engF, off || roar > 0 ? engTc : cut || dip < 1 ? 0.008 : 0.05);
      // Тембр: срез растёт с оборотами медленно, на отсечке не выше 2.6 кГц.
      // Верха записи выше — шипение и механика, им в «басовитом» звуке не место.
      const cutHz = Math.min(2600, 650 + rs * 0.2 + 700 * lS);
      P(S.lp.frequency, cutHz, 0.06);
      P(S.lp2.frequency, cutHz * 1.25, 0.06);
      // холостые: гасим линию вспышек и её 2-ю и 3-ю гармоники (к 1400 — ноль)
      P(S.fireCut.frequency, rs / 15, 0.02);
      P(S.fireCut2.frequency, rs / 7.5, 0.02);
      P(S.fireCut3.frequency, rs / 5, 0.02);
      P(S.fireCut.gain, -14 * idle, 0.08);
      P(S.fireCut2.gain, -20 * idle, 0.08);
      P(S.fireCut3.gain, -18 * idle, 0.08);
      // низ: на холостых слабее (там и так всё — низ), на средних — полный
      const lowW = 0.35 + 0.65 * Math.min(1, Math.max(0, (rs - 1000) / 1500));
      P(S.low.gain, 1.2 * lowW * (1 - 0.25 * rr) * (0.7 + 0.3 * st.loadS) * dip * S.mix * engF, off || roar > 0 ? engTc : 0.06);
    }

    // блоу-офф: сброс газа под наддувом
    const boost = s.boost || 0;
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
    if (S && S.kind === 'v8') {
      if (S.burble && eng === 'on') this._overrun(S.burble, t, thr, st.rpmS);
    } else if (st.armed && thr < 0.15) {
      st.armed = false;
      if (rpm > 3000) {
        this.log && this.log.push([t, 'сброс: хлопки']);
        st.popUntil = t + 0.5 + rpm / 7000 * 1.1;
        st.nextPop = t + 0.04;
        this._pop(true, t + 0.03, 0.85, 0.95 + Math.random() * 0.1);
      }
    }
    if (thr > 0.2) st.popUntil = 0;
    while (!(S && S.kind === 'v8') && thr < 0.15 && t < st.popUntil && st.nextPop < t + 0.05) {
      const big = Math.random() < 0.18;
      const left = (st.popUntil - st.nextPop) / 1.5;
      this._pop(big, Math.max(t, st.nextPop),
        (big ? 0.6 : 0.35) * (0.4 + Math.min(1, left)) * (0.6 + Math.random() * 0.4), 0.85 + Math.random() * 0.35);
      st.nextPop += 0.035 + Math.random() * Math.random() * 0.22;
    }
    st.thr = thr;

    // шины: визг растёт со скольжением пятна (2–12 м/с), бёрнаут — ещё шорох
    const skid = Math.max(0, Math.min(1, ((s.skid || 0) - 2) / 10));
    P(this.squealGain.gain, 0.05 * skid * skid * syn, 0.05);
    if (S && S.squeal) {
      P(S.squeal.g.gain, 0.5 * skid * skid * S.mix, 0.05);
      P(S.squeal.src.playbackRate, 0.9 + skid * 0.2 - (s.burnout ? 0.1 : 0), 0.1);
    }
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
