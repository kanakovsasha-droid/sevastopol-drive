// Сборка звуков машины из записей Freesound (только CC0 и CC BY).
//
// Зачем скрипт, а не вручную нарезанные файлы: петли и разовые звуки режутся
// по точным временам, и их надо уметь пересобрать — поменять кусок, громкость
// или добавить запись, не вспоминая, что откуда взято. Источники и лицензии —
// в SOURCES ниже и в data/audio/ATTRIBUTION.md.
//
// Берём превью (mp3 128 кбит/с) — их Freesound отдаёт без входа. Выход — WAV
// 22 050 Гц моно 16 бит: mp3 и ogg на стыке петли дают щелчок (задержка
// кодера), а WAV склеивается без шва. Петли получаются бесшовными: хвост
// куска наложен на его начало с равномощным переходом.
//
//   node tools/build-audio.mjs            # скачать недостающее и собрать data/audio/
//
// Нужен ffmpeg в PATH (только для разбора mp3).

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const CACHE = '.cache/audio-src';
const OUT = 'data/audio';
const SR = 22050;

// id → превью, автор, название, лицензия
export const SOURCES = {
  797835: { file: '797/797835_15956618-hq.mp3', author: 'modusmogulus', title: 'Car Antilag (No cleanup, 32float)', license: 'CC0 1.0' },
  675723: { file: '675/675723_2524442-hq.mp3', author: 'craigsmith', title: 'S41-25 Car backfires; reverberant.wav', license: 'CC0 1.0' },
  105351: { file: '105/105351_1553758-hq.mp3', author: 'CeebFrack', title: 'BACKFIRE.ogg', license: 'CC0 1.0' },
  71739: { file: '71/71739_995351-hq.mp3', author: 'audible-edge', title: 'Chrysler LHS tire squeal 04 (04-25-2009).wav', license: 'CC0 1.0' },
  205504: { file: '205/205504_1970026-hq.mp3', author: 'VacekH', title: 'mustang 1.wav', license: 'CC0 1.0' },
  205511: { file: '205/205511_1970026-hq.mp3', author: 'VacekH', title: 'mustang 9.wav', license: 'CC0 1.0' },
  455925: { file: '455/455925_8138660-hq.mp3', author: 'noiseloop', title: 'Starting of Ford V8 5 Liter engine', license: 'CC BY 3.0' },
};

// Петли мотора — Ford Mustang Shelby GT500 (VacekH, CC0): холостые и разгон
// под нагрузкой одной машины, одним микрофоном. Владелец выбрал её из четырёх
// кандидатов. Схема — как у GTA: одна петля «под нагрузкой» на все обороты
// (высота строго rpm / обороты записи) и петля холостых у самого низа.
// [имя, источник, начало, конец, гармоника для слежения [от, до] Гц, какой
// это порядок вспышек, сглаживание трека, с]
// Обороты записи гуляют (разгон: вспышки 207→284 Гц за 1.7 с; холостые
// 836…876), а петля, прокрученная по кругу, должна звучать на ОДНОЙ высоте —
// иначе на её шве тон прыгает, и на ровных оборотах это слышно как
// переключение раз в оборот петли (так звучал мод w212v4 на сбросе). Поэтому
// ведём гармонику по времени и читаем запись с переменной скоростью: высота
// становится постоянной.
const V8 = [
  // холостые НЕ выпрямляем (сглаживание на весь кусок = один общий сдвиг):
  // их живое плавание ±2% размывает линии вспышек — выпрямленные, они
  // звучали ровным гулом (линия 120 Гц выступала на 32 дБ). Начало и конец
  // куска — на одних оборотах, шов не прыгает.
  ['v8_idle', 205504, 6.2, 12.6, [104, 120], 2, 100],
  // ровный ход ~2750 об/мин 6 с подряд — основа на всех оборотах: обороты в
  // записи почти не меняются, поэтому тембр по петле ровный и шов не слышен
  ['v8_cruise', 205511, 26.6, 32.6, [176, 190], 1, 0.06, true],
  // Отдельной петли «под газом» нет: и выпрямленный разгон (205508), и
  // «перегазовка» (205504, 18–21 с) плыли по тембру за круг — бас и верха на
  // 7 дБ, на скорости это звучало как лишнее переключение раз в круг. Газ
  // теперь — тот же ровный ход через перегруз в engine-audio.js.
];
const LOOPS = [
  ['tyre_squeal', 71739, 5.0, 6.6],
];

// Разовые: хлопки и выстрелы в выхлопе [имя, источник, начало, длительность]
const SHOTS = [
  ['pop_1', 797835, 1.38, 0.22], ['pop_2', 797835, 1.55, 0.22], ['pop_3', 797835, 1.95, 0.22],
  ['pop_4', 797835, 2.15, 0.22], ['pop_5', 797835, 5.25, 0.24], ['pop_6', 797835, 7.08, 0.22],
  ['bang_1', 675723, 5.80, 0.55], ['bang_2', 105351, 0.02, 0.40], ['bang_3', 675723, 3.97, 0.5],
];
// Стартер: прокрутка Ford 5.0 V8 до схватывания (в наборе VacekH запуска
// нет — там только проезды и езда). Ровно 0.6 с — столько крутит стартер в
// игре; схватывание и рык дальше играют петли Mustang по оборотам.
// [имя, источник, начало, длительность, нарастание, спад (с)]
const ONESHOTS = [
  ['starter', 455925, 0.30, 0.62, 0.03, 0.05],
];

function fetchSrc(id) {
  const s = SOURCES[id], path = `${CACHE}/${id}.mp3`;
  if (!existsSync(path)) {
    mkdirSync(CACHE, { recursive: true });
    execFileSync('curl', ['-sfL', '-A', 'Mozilla/5.0', '-o', path, `https://cdn.freesound.org/previews/${s.file}`]);
  }
  return path;
}

function decode(path, start, dur) {
  const b = execFileSync('ffmpeg', ['-v', 'quiet', '-ss', String(start), '-t', String(dur), '-i', path,
    '-ac', '1', '-ar', String(SR), '-af', 'highpass=f=22', '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  return Float32Array.from(new Float32Array(b.buffer, b.byteOffset, b.length / 4));
}

function wav(x) {
  const n = x.length, ab = new ArrayBuffer(44 + n * 2), dv = new DataView(ab);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, SR, true); dv.setUint32(28, SR * 2, true);
  dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) dv.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x[i])) * 32767, true);
  return Buffer.from(ab);
}

const rms = x => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);

mkdirSync(OUT, { recursive: true });
const manifest = { sr: SR, loops: {}, shots: [] };
// Бесшовная петля: последние X отсчётов наложены на первые
function seamless(x, X) {
  const L = x.length - X, y = new Float32Array(L);
  for (let i = 0; i < L; i++) y[i] = x[i];
  for (let i = 0; i < X; i++) {
    const t = i / X;
    y[i] = x[i] * Math.sin(t * Math.PI / 2) + x[L + i] * Math.cos(t * Math.PI / 2);
  }
  return y;
}

// Выровнять огибающую: делим на плавную огибающую (RMS по 2W, по кругу —
// шов петли не трогаем) в степени pw. Окно длиннее цикла мотора, так что
// неровность вспышек остаётся, уходят только «провалы» газа в записи.
function flattenEnv(y, win = 0.09, pw = 0.9) {
  const L = y.length, W = Math.floor(SR * win / 2), e = new Float32Array(L);
  let acc = 0;
  for (let i = -W; i <= W; i++) acc += y[(i + L) % L] ** 2;
  for (let i = 0; i < L; i++) {
    e[i] = Math.sqrt(acc / (2 * W + 1));
    acc += y[(i + W + 1) % L] ** 2 - y[(i - W + L) % L] ** 2;
  }
  const m = rms(y);
  for (let i = 0; i < L; i++) y[i] *= Math.min(2, Math.max(0.5, Math.pow(m / Math.max(e[i], 1e-6), pw)));
  return y;
}

// Тот же выравниватель, но по трём полосам порознь (до 250, 250–700, выше
// 700 Гц): у записи «перегазовки» общий уровень ровный, а бас и верха за круг
// петли плывут на 7 дБ во встречных направлениях — в игре (там верха срезаны,
// а бас подчёркнут) это слышалось как волна громкости раз в круг, на скорости
// — как ещё одно переключение. Полосы — фильтры Баттерворта вперёд-назад: без
// сдвига фазы, и сумма полос равна исходному сигналу.
function biquad(x, type, f0, Q = Math.SQRT1_2) {
  const w = 2 * Math.PI * f0 / SR, al = Math.sin(w) / (2 * Q), c = Math.cos(w), a0 = 1 + al;
  const lp = type === 'lp';
  const b0 = (lp ? (1 - c) / 2 : (1 + c) / 2) / a0, b1 = (lp ? 1 - c : -(1 + c)) / a0, b2 = b0, a1 = -2 * c / a0, a2 = (1 - al) / a0;
  const run = src => { const y = new Float32Array(src.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < src.length; i++) { const v = b0 * src[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = src[i]; y2 = y1; y1 = v; y[i] = v; } return y; };
  // по кругу: петля бесшовная, хвост фильтра переносим через шов (три прохода — берём средний)
  const L = x.length, ext = new Float32Array(L * 3); ext.set(x, 0); ext.set(x, L); ext.set(x, 2 * L);
  return run(run(ext).reverse()).reverse().subarray(L, 2 * L);
}
function flattenBands(y, win, pw) {
  const low = biquad(y, 'lp', 250), rest = biquad(y, 'hp', 250);
  const mid = biquad(rest, 'lp', 700), high = biquad(rest, 'hp', 700);
  const out = new Float32Array(y.length);
  for (const band of [low, mid, high]) { const b = Float32Array.from(band); flattenEnv(b, win, pw); for (let i = 0; i < y.length; i++) out[i] += b[i]; }
  return out;
}

// Частота одной гармоники по времени: в каждом окне — пик в ±5% от прошлого
// значения (первое окно — в полосе band). Точность ~0.1 Гц: шаг поиска 0.05.
function follow(x, band, hop = 0.01, win = 2048, fixed = false) {
  const H = Math.round(hop * SR), out = [];
  const cw = new Float32Array(win);
  for (let i = 0; i < win; i++) cw[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / win);
  let prev = 0;
  for (let s = 0; s + win <= x.length; s += H) {
    // fixed — обороты в куске ровные: ищем только в полосе band, трек не «уплывёт» на соседнюю гармонику
    const a = prev && !fixed ? prev * 0.95 : band[0], b = prev && !fixed ? prev * 1.05 : band[1];
    let best = -1, bf = a;
    for (let f = a; f <= b; f += 0.05) {
      const w = 2 * Math.PI * f / SR; let re = 0, im = 0;
      for (let i = 0; i < win; i += 2) { const v = x[s + i] * cw[i]; re += v * Math.cos(w * i); im += v * Math.sin(w * i); }
      const m = re * re + im * im;
      if (m > best) { best = m; bf = f; }
    }
    prev = bf;
    out.push([(s + win / 2) / SR, bf]);
  }
  return out;
}
const median = a => [...a].sort((p, q) => p - q)[a.length >> 1];
function smoothTrack(tr, sec, hop = 0.01) {
  // медиана 7 (убрать выбросы), затем скользящее среднее ±sec/2
  const m = tr.map((_, i) => median(tr.slice(Math.max(0, i - 3), i + 4).map(q => q[1])));
  const R = Math.max(1, Math.round(sec / hop / 2));
  return tr.map(([t], i) => {
    let s = 0, n = 0;
    for (let j = Math.max(0, i - R); j <= Math.min(m.length - 1, i + R); j++) { s += m[j]; n++; }
    return [t, s / n];
  });
}
// Читаем запись со скоростью ft / f(τ) — тон гармоники становится ровно ft.
function retime(x, tr, ft) {
  const fAt = t => {
    if (t <= tr[0][0]) return tr[0][1];
    if (t >= tr[tr.length - 1][0]) return tr[tr.length - 1][1];
    let lo = 0, hi = tr.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tr[m][0] <= t) lo = m; else hi = m; }
    const u = (t - tr[lo][0]) / (tr[hi][0] - tr[lo][0]);
    return tr[lo][1] * (1 - u) + tr[hi][1] * u;
  };
  const y = [];
  for (let t = 0; t < x.length - 3;) {
    const j = Math.floor(t), u = t - j;
    const p0 = x[Math.max(0, j - 1)], p1 = x[j], p2 = x[j + 1], p3 = x[j + 2];
    y.push(p1 + 0.5 * u * (p2 - p0 + u * (2 * p0 - 5 * p1 + 4 * p2 - p3 + u * (3 * (p1 - p2) + p3 - p0))));
    t += ft / fAt(t / SR);
  }
  return Float32Array.from(y);
}
const geo = a => Math.exp(a.reduce((s, v) => s + Math.log(v), 0) / a.length);

for (const [name, id, a, b, band, order, sm, fixed] of V8) {
  const x = decode(fetchSrc(id), a, b - a);
  const raw = follow(x, band, 0.01, 2048, fixed);
  const tr = smoothTrack(raw, sm);
  const ft = geo(tr.map(q => q[1]));                   // ровная высота — средняя по треку
  let y = retime(x, tr, ft);
  // Длина петли — целое число циклов мотора (2 оборота): на шве фаза вспышек
  // совпадает, переход не «спотыкается».
  const fire = ft / order, cyc = SR * 8 / fire;        // отсчётов в цикле (8 вспышек)
  const X = Math.round(SR * 0.1);
  const n = Math.floor((y.length - X) / cyc) * cyc;
  y = seamless(y.subarray(0, Math.round(n) + X), X);
  if (name === 'v8_idle') flattenEnv(y, 0.09, 0.6);
  else y = flattenBands(y, 0.09, 0.9);
  const k = 0.18 / rms(y);
  for (let i = 0; i < y.length; i++) y[i] *= k;
  writeFileSync(`${OUT}/${name}.wav`, wav(y));
  // проверка: тот же трек по готовой петле — разброс высоты
  const chk = smoothTrack(follow(y, [ft * 0.97, ft * 1.03], 0.01, 2048, true), 0.05).map(q => q[1]);
  const dev = Math.max(...chk.map(f => Math.abs(f / ft - 1))) * 100;
  const rpm = Math.round(fire * 15);
  manifest.loops[name] = { src: id, hz: +fire.toFixed(2), rpm, sec: +(y.length / SR).toFixed(3) };
  console.log(name, `${(y.length / SR).toFixed(2)} с`, `вспышки ${fire.toFixed(2)} Гц ≈ ${rpm} об/мин`,
    `исходный трек ${Math.min(...raw.map(q => q[1] / order)).toFixed(1)}…${Math.max(...raw.map(q => q[1] / order)).toFixed(1)} Гц`,
    `в петле отклонение ≤ ${dev.toFixed(2)}%`);
}
for (const [name, id, a, b] of LOOPS) {
  const x = decode(fetchSrc(id), a, b - a);
  const y = seamless(x, Math.floor(SR * 0.12));
  const k = 0.18 / rms(y);
  for (let i = 0; i < y.length; i++) y[i] *= k;
  writeFileSync(`${OUT}/${name}.wav`, wav(y));
  manifest.loops[name] = { src: id, hz: 0, rpm: 0, sec: +(y.length / SR).toFixed(2) };
  console.log(name, `${(y.length / SR).toFixed(2)} с`);
}
for (const [name, id, a, d] of SHOTS) {
  const x = decode(fetchSrc(id), a, d);
  let pk = 0; for (const v of x) pk = Math.max(pk, Math.abs(v));
  const n = x.length, fi = Math.floor(SR * 0.004), fo = Math.floor(n * 0.5);
  for (let i = 0; i < n; i++) {
    let g = 0.9 / pk;
    if (i < fi) g *= i / fi;
    if (i > n - fo) g *= Math.pow((n - i) / fo, 2);
    x[i] *= g;
  }
  writeFileSync(`${OUT}/${name}.wav`, wav(x));
  manifest.shots.push(name);
  console.log(name, `${d} с`);
}
for (const [name, id, a, d, fin, fout] of ONESHOTS) {
  const x = decode(fetchSrc(id), a, d);
  const k = 0.18 / rms(x), n = x.length, fi = Math.floor(SR * fin), fo = Math.floor(SR * fout);
  for (let i = 0; i < n; i++) x[i] *= k * Math.min(1, i / fi, (n - i) / fo);
  writeFileSync(`${OUT}/${name}.wav`, wav(x));
  manifest.shots.push(name);
  console.log(name, `${d} с`);
}
writeFileSync(`${OUT}/sounds.json`, JSON.stringify(manifest, null, 1));
