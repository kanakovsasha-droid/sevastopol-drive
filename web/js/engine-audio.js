// Звук E63 S. Основной голос мотора — записи настоящего V8 (data/audio,
// собираются tools/build-audio.mjs из Freesound, CC0): набор петель на разных
// оборотах, кроссфейд между двумя ближайшими и подстройка высоты под обороты
// физики. Хлопки и выстрелы — записями со случайным выбором, визг шин —
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

// Огибающая вспышек V8 для 900 об/мин: 60 вспышек в секунду, порядок
// 1-5-4-8-6-3-7-2, ряды по-разному громкие, у каждого цилиндра своё смещение,
// и каждая вспышка ещё случайна на ±35%. Нулевое среднее: это добавка к
// громкости, а не сама громкость. 6 секунд — повтор на слух не ловится.
function burbleEnvelope(ctx, pulses = false) {
  const sr = ctx.sampleRate, sec = 6, n = sr * sec, buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
  const order = [1, 5, 4, 8, 6, 3, 7, 2], bankA = new Set([1, 2, 3, 4]);
  const bias = [0.12, -0.08, 0.05, -0.15, 0.1, -0.05, 0.14, -0.1];
  const per = sr / 60;                                      // отсчётов на вспышку
  let rnd = 12345;
  const rand = () => { rnd = (rnd * 1103515245 + 12345) & 0x7fffffff; return rnd / 0x7fffffff; };
  for (let k = 0; k * per < n; k++) {
    const cyl = order[k % 8];
    const a = (bankA.has(cyl) ? 0.18 : -0.18) + bias[cyl - 1] + (rand() - 0.5) * 0.7;
    const s0 = Math.floor(k * per), s1 = Math.min(n, Math.floor((k + 1) * per));
    if (pulses) {
      // импульс выхлопа: резкий фронт, затухание; сила — от 0.3 до 1
      const amp = Math.max(0.3, Math.min(1, 0.65 + a));
      for (let i = s0; i < s1; i++) { const u = (i - s0) / (s1 - s0); d[i] = amp * Math.min(1, u * 4) * Math.exp(-u * 2.5); }
    } else for (let i = s0; i < s1; i++) d[i] = a * Math.sin(Math.PI * (i - s0) / (s1 - s0));
  }
  if (pulses) return buf;
  let m = 0; for (let i = 0; i < n; i++) m += d[i]; m /= n;
  for (let i = 0; i < n; i++) d[i] -= m;
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
  // bufs: { eng_idle_v2: AudioBuffer, …, pop_1…, bang_1…, tyre_squeal }, meta —
  // sounds.json (обороты каждой петли).
  useSamples(bufs, meta) {
    const ctx = this.ctx, t0 = ctx.currentTime;
    const g = (v = 0) => { const n = ctx.createGain(); n.gain.value = v; return n; };
    // общий путь петель: сброс газа — темнее (фильтр), низ — подчёркнут полкой
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 9000; lp.Q.value = 0.6;
    const shelf = ctx.createBiquadFilter(); shelf.type = 'lowshelf'; shelf.frequency.value = 180; shelf.gain.value = 8;
    const bus = g(0);
    // V8-«рокот»: громкость петель качается на полупорядке вспышек (rpm/30) —
    // у кроссплейн-V8 ряды вспыхивают неравномерно, отсюда бас-рябь. Без неё
    // разогнанная петля на высоких звучала гладко, как V12.
    const ripple = g(1), rippleOsc = ctx.createOscillator(), rippleDepth = g(0);
    rippleOsc.frequency.value = 30; rippleOsc.connect(rippleDepth).connect(ripple.gain); rippleOsc.start(t0);
    // и второй ФНЧ подряд: один срез 12 дБ/окт оставлял на отсечке 4–16 кГц
    // пятую часть энергии — тот самый визг
    const lp2 = ctx.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 9000; lp2.Q.value = 0.5;
    lp.connect(lp2).connect(ripple).connect(shelf).connect(bus).connect(this.master);
    // «Бульканье» V8 на холостых. Запись холостых в игре звучала почти чистым
    // синусом 60 Гц (частота вспышек на 900): в живой записи владельца линия
    // 60.1 Гц выступала над соседним спектром на 25 дБ — «однотонный вой».
    // Настоящий кроссплейн-V8 на холостых не тональный: вспышки неровные по
    // цилиндрам и рядам. Громкость петель модулируем огибающей вспышек со
    // случайной силой каждой — линия 60 Гц размазывается в шум вокруг неё,
    // а неравенство рядов даёт качание на частоте цикла (rpm/120).
    const burble = g(1), burbleDepth = g(0);
    const burbleSrc = ctx.createBufferSource(); burbleSrc.buffer = burbleEnvelope(ctx); burbleSrc.loop = true;
    burbleSrc.connect(burbleDepth).connect(burble.gain); burbleSrc.start(t0);
    // сама линия вспышек на холостых приглушена (полка −14 дБ на rpm/15) —
    // модуляция её только размазывает, а гасит — вот это
    const fireCut = ctx.createBiquadFilter(); fireCut.type = 'peaking'; fireCut.frequency.value = 60; fireCut.Q.value = 3; fireCut.gain.value = 0;
    burble.connect(fireCut).connect(lp);
    // Выхлопные импульсы: низкий бурый шум, «нарезанный» вспышками со
    // случайной силой — ритм 60 Гц есть, чистого тона нет. Так и звучит выхлоп.
    const pulseLP = ctx.createBiquadFilter(); pulseLP.type = 'lowpass'; pulseLP.frequency.value = 170; pulseLP.Q.value = 0.6;
    const pulseAM = g(0), pulse = g(0), pulseNz = ctx.createBufferSource();
    pulseNz.buffer = this.noise3.buffer; pulseNz.loop = true; pulseNz.loopStart = 0.5;
    const pulseEnv = ctx.createBufferSource(); pulseEnv.buffer = burbleEnvelope(ctx, true); pulseEnv.loop = true;
    pulseNz.connect(pulseLP).connect(pulseAM).connect(pulse).connect(this.master);
    pulseEnv.connect(pulseAM.gain);
    pulseNz.start(t0); pulseEnv.start(t0);
    // механика и выхлоп широкой полосой 200–1000 Гц, той же огибающей —
    // чтобы холостые не были одной нотой
    const mechBP = ctx.createBiquadFilter(); mechBP.type = 'bandpass'; mechBP.frequency.value = 420; mechBP.Q.value = 0.5;
    const mech = g(0), mechSrc = ctx.createBufferSource();
    mechSrc.buffer = this.noise.buffer; mechSrc.loop = true; mechSrc.loopStart = 0.3;
    mechSrc.connect(mechBP).connect(mech).connect(burble); mechSrc.start(t0);
    const loops = Object.entries(meta.loops).filter(([n]) => n.startsWith('eng_') && bufs[n])
      .map(([n, m]) => {
        const src = ctx.createBufferSource(); src.buffer = bufs[n]; src.loop = true;
        const gg = g(0);
        // Режекторы на свист записи (sounds.json → notch, частоты в самом
        // файле): частота идёт за playbackRate, так что свист не вернётся ни
        // на каких оборотах. В файле он уже вырезан — это вторая страховка.
        const notches = (m.notch || []).map(f0 => {
          const nf = ctx.createBiquadFilter(); nf.type = 'notch'; nf.frequency.value = f0; nf.Q.value = 30;
          return { f0, nf };
        });
        let head = src;
        for (const q of notches) head = head.connect(q.nf);
        head.connect(gg).connect(burble);
        // петли запускаем вразбег — иначе одинаковые фазы складываются в «эхо»
        src.start(t0, Math.random() * bufs[n].duration);
        return { name: n, rpm: m.rpm, src, g: gg, notches };
      }).sort((a, b) => a.rpm - b.rpm);
    let squeal = null;
    if (bufs.tyre_squeal) {
      const src = ctx.createBufferSource(); src.buffer = bufs.tyre_squeal; src.loop = true;
      const gg = g(0); src.connect(gg).connect(this.master); src.start(t0);
      squeal = { src, g: gg };
    }
    const pick = pre => Object.keys(bufs).filter(k => k.startsWith(pre)).map(k => bufs[k]);
    this._dropSamples(t0);
    // Низ — из самой записи: та же смесь петель через ФНЧ 150 Гц отдельным
    // голосом. Синус на полупорядке вспышек, который подпирал низ раньше,
    // биением с такой же гармоникой петли давал на холостых медленный «вой».
    const lowLP = ctx.createBiquadFilter(); lowLP.type = 'lowpass'; lowLP.frequency.value = 150; lowLP.Q.value = 0.7;
    const low = g(0);
    lp.connect(lowLP).connect(low).connect(this.master);
    this.smp = { loops, lp, lp2, bus, squeal, low, ripple, rippleOsc, rippleDepth, burbleSrc, burbleDepth, mech, fireCut, pulse, pulseEnv,
      pops: pick('pop_'), bangs: pick('bang_'), mix: 0, t0 };
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

  // Хлопки и треск на сбросе — из пакета мода (w212-tuning), а голос мотора
  // остаётся открытый: так понравилось владельцу. Только локально.
  usePops(bufs) { this.extPops = bufs && bufs.decel ? { decel: bufs.decel, bonus: bufs.bonus || bufs.decel } : null; }

  _pop(big, t, gain, rate) {
    const S0 = this.smp;
    const S = S0 && S0.kind === 'mod' ? S0 : (this.extPops ? { kind: 'mod', ...this.extPops } : S0);
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
      if (thr > 0.3) {
        st.dipUntil = t + 0.07;
        this._pop(false, t + 0.06, 0.4 * thr, 0.9);
        this.log && this.log.push([t, 'переключение']);
      }
    }
    const dip = t < (st.dipUntil || 0) ? 0.35 : 1;
    // записи: доля их голоса нарастает за полсекунды после загрузки
    const S = this.smp;
    if (S) S.mix = Math.min(1, (t - S.t0) / 0.5);
    const syn = S ? 1 - S.mix : 1;
    const engV = (0.20 + 0.42 * r) * (0.45 + 0.55 * load) + 0.06;
    P(this.engGain.gain, engV * (cut ? 0.55 : 1) * dip * syn, cut || dip < 1 ? 0.008 : 0.025);
    // бас: синус на полупорядке вспышек (кроссплейн-V8 «бубнит» на rpm/30) —
    // он остаётся и при записях: на высоких оборотах вспышки уходят за 300 Гц,
    // а низ должен давить в любой момент
    if (S) P(this.sub.frequency, rpm / 30, 0.012);
    // у записей низ свой (smp.low) — синус оставлен только синтезу
    P(this.subGain.gain, S ? (0.10 + 0.25 * load) * (1 - r * 0.6) * syn
      : (0.10 + 0.25 * load) * (1 - r * 0.6), 0.04);
    if (S && S.kind === 'mod') P(this.subGain.gain, 0, 0.05);
    P(this.intakeBP.frequency, 500 + rpm * 0.35, 0.05);
    P(this.intakeGain.gain, (0.012 + 0.07 * load * r) * syn, 0.04);
    if (S && S.kind === 'mod') {
      // высота — строго от оборотов, без переходов между петлями
      for (const lp of S.loops) {
        P(lp.src.playbackRate, rpm / lp.rpm, 0.012);
        P(lp.g.gain, lp.role === 'load' ? 1 : 0.25 + 0.75 * load, 0.03);
      }
      // газ — открыто и громко, сброс — тише и под фильтром НЧ
      const vol = 0.38 * (0.65 + 0.35 * load) * (cut ? 0.35 : 1) * dip * S.mix;
      P(S.bus.gain, vol, cut || dip < 1 ? 0.008 : 0.04);
      // как у открытого набора: верха растут с оборотами медленно, на отсечке —
      // не выше 3 кГц (петля мода на 7000 разогнана втрое — без этого визг)
      P(S.lp.frequency, load > 0.15 ? Math.min(3000, 900 + rpm * 0.3 + 600 * load) : 700 + 1200 * load / 0.15, 0.05);
    } else if (S) {
      // две ближайшие по оборотам петли, равномощный переход по логарифму
      // оборотов; высота — отношение оборотов к оборотам записи
      const L = S.loops;
      let i = 0;
      while (i < L.length - 2 && rpm > L[i + 1].rpm) i++;
      const a = L[i], b = L[i + 1] || a;
      const k = b === a ? 0 : Math.min(1, Math.max(0, Math.log(rpm / a.rpm) / Math.log(b.rpm / a.rpm)));
      for (const lp of L) {
        const w = lp === a ? Math.cos(k * Math.PI / 2) : lp === b ? Math.sin(k * Math.PI / 2) : 0;
        P(lp.g.gain, w, 0.03);
        const rate = Math.min(2.2, Math.max(0.45, rpm / lp.rpm));
        P(lp.src.playbackRate, rate, 0.012);
        if (lp.notches) for (const q of lp.notches) P(q.nf.frequency, q.f0 * rate, 0.012);
      }
      // Газ — громче и открытее, сброс — тише и глуше. Берём сглаженный газ
      // (0.25 с): на ровном ходу клавиша W щёлкает 0↔1, и громкость с фильтром
      // прыгали за ней — на слух это были «провалы», похожие на переключения.
      const vol = 1.5 * (0.45 + 0.35 * r) * (0.55 + 0.45 * st.loadS) * (cut ? 0.4 : 1) * dip * S.mix;
      P(S.bus.gain, vol, cut || dip < 1 ? 0.008 : 0.05);
      // Тембр: срез растёт с оборотами МЕДЛЕННО — на отсечке не выше 2.5 кГц
      // (газ добавляет «открытости» до +600 Гц, на сбросе глуше).
      const cutHz = Math.min(2500, 700 + rpm * 0.22 + 600 * st.loadS);
      P(S.lp.frequency, cutHz, 0.06);
      if (S.lp2) P(S.lp2.frequency, cutHz * 1.25, 0.06);
      if (S.ripple) {
        P(S.rippleOsc.frequency, rpm / 30, 0.012);
        const d = 0.12 + 0.22 * r;                        // глубже на высоких
        P(S.rippleDepth.gain, d, 0.05);
        P(S.ripple.gain, 1 - d, 0.05);
      }
      // низ: отдельным голосом на всех оборотах, на высоких — чуть меньше
      // На холостых — втрое слабее: этот голос и поднимал чистую 60 Гц
      const lowIdle = 0.45 + 0.55 * Math.min(1, Math.max(0, (rpm - 900) / 1300));
      P(S.low.gain, 1.4 * lowIdle * (1 - 0.2 * r) * (0.75 + 0.25 * st.loadS) * dip * S.mix, 0.06);
      if (S.burbleSrc) {
        P(S.burbleSrc.playbackRate, rpm / 900, 0.012);          // огибающая записана для 900
        // только у холостых: к 1600 об/мин всё «бульканье» уходит, иначе на
        // ровном ходу его качание громкости звучало как переключения
        const idle = 1 - Math.min(1, Math.max(0, (rpm - 950) / 650));
        P(S.burbleDepth.gain, (0.18 + 0.5 * idle) * (1 - 0.4 * st.loadS), 0.06);
        P(S.mech.gain, (0.1 + 0.05 * st.loadS) * (0.4 + 0.6 * idle) * S.mix, 0.06);
        P(S.fireCut.frequency, rpm / 15, 0.012);
        P(S.fireCut.gain, -18 * idle, 0.06);
        P(S.pulseEnv.playbackRate, rpm / 900, 0.012);
        P(S.pulse.gain, 4.5 * idle * (0.7 + 0.3 * st.loadS) * dip * S.mix, 0.06);
      }
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
    if (st.armed && thr < 0.15) {
      st.armed = false;
      if (rpm > 3000) {
        this.log && this.log.push([t, 'сброс: хлопки']);
        st.popUntil = t + 0.5 + rpm / 7000 * 1.1;
        st.nextPop = t + 0.04;
        this._pop(true, t + 0.03, 0.85, 0.95 + Math.random() * 0.1);
      }
    }
    if (thr > 0.2) st.popUntil = 0;
    while (thr < 0.15 && t < st.popUntil && st.nextPop < t + 0.05) {
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
