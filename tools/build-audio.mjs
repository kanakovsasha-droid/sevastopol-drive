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
  332636: { file: '332/332636_3459679-hq.mp3', author: 'Superhollyward', title: 'Muscle car sounds.mp3', license: 'CC0 1.0' },
  797835: { file: '797/797835_15956618-hq.mp3', author: 'modusmogulus', title: 'Car Antilag (No cleanup, 32float)', license: 'CC0 1.0' },
  675723: { file: '675/675723_2524442-hq.mp3', author: 'craigsmith', title: 'S41-25 Car backfires; reverberant.wav', license: 'CC0 1.0' },
  105351: { file: '105/105351_1553758-hq.mp3', author: 'CeebFrack', title: 'BACKFIRE.ogg', license: 'CC0 1.0' },
  71739: { file: '71/71739_995351-hq.mp3', author: 'audible-edge', title: 'Chrysler LHS tire squeal 04 (04-25-2009).wav', license: 'CC0 1.0' },
};

// Петли мотора: [имя, источник, начало, конец]. Все из одной записи (V8 маслкар
// крупным планом), чтобы тембр не прыгал при переходе от петли к петле.
// Обороты петли считаются по частоте вспышек (4 на оборот у V8).
const LOOPS = [
  ['eng_idle', 332636, 1.50, 3.25],
  ['eng_low', 332636, 45.5, 49.0],
  ['eng_mid', 332636, 78.5, 84.5],
  ['eng_high', 332636, 9.0, 11.0],
  ['eng_hi2', 332636, 30.5, 33.0],
  ['eng_top', 332636, 86.9, 88.2],
  ['tyre_squeal', 71739, 5.0, 6.6],
];
// Свист в записи холостых: два узких постоянных тона 431 и 646 Гц (похоже на
// ремень или генератор той машины; в игре петля играет на 0.92 своей высоты —
// 396 и 592 Гц). Владелец послушал и попросил убрать — режем узкими режекторами,
// соседний спектр не трогаем. В остальных петлях узких тонов, кроме гармоник
// самого мотора, нет (проверено спектром).
const NOTCH = { eng_idle: [431, 646] };

// Разовые: хлопки и выстрелы в выхлопе [имя, источник, начало, длительность]
const SHOTS = [
  ['pop_1', 797835, 1.38, 0.22], ['pop_2', 797835, 1.55, 0.22], ['pop_3', 797835, 1.95, 0.22],
  ['pop_4', 797835, 2.15, 0.22], ['pop_5', 797835, 5.25, 0.24], ['pop_6', 797835, 7.08, 0.22],
  ['bang_1', 675723, 5.80, 0.55], ['bang_2', 105351, 0.02, 0.40], ['bang_3', 675723, 3.97, 0.5],
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

// Основная частота: пик спектра 25–700 Гц, медиана по окнам. ДПФ прямо,
// окна короткие — секунды счёта.
function pitch(x) {
  const N = 4096, est = [];
  for (let s = 0; s + N <= x.length; s += N >> 1) {
    let best = 0, bf = 0;
    for (let f = 25; f <= 700; f += 0.5) {
      let re = 0, im = 0;
      for (let i = 0; i < N; i += 2) {
        const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N), a = 2 * Math.PI * f * i / SR;
        re += x[s + i] * w * Math.cos(a); im += x[s + i] * w * Math.sin(a);
      }
      const m = re * re + im * im;
      if (m > best) { best = m; bf = f; }
    }
    est.push(bf);
  }
  est.sort((a, b) => a - b);
  return est[est.length >> 1];
}

mkdirSync(OUT, { recursive: true });
const manifest = { sr: SR, loops: {}, shots: [] };
// Режектор RBJ, прогон вперёд и назад: фаза не сдвигается, глубина удвоена
function notch(x, f0, Q = 25) {
  const w = 2 * Math.PI * f0 / SR, al = Math.sin(w) / (2 * Q), c = Math.cos(w), a0 = 1 + al;
  const b0 = 1 / a0, b1 = -2 * c / a0, b2 = 1 / a0, a1 = -2 * c / a0, a2 = (1 - al) / a0;
  const pass = (src) => {
    const y = new Float32Array(src.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < src.length; i++) { const v = b0 * src[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = src[i]; y2 = y1; y1 = v; y[i] = v; }
    return y;
  };
  return pass(pass(x).reverse()).reverse();
}

for (const [name, id, a, b] of LOOPS) {
  let x = decode(fetchSrc(id), a, b - a);
  for (const f of NOTCH[name] || []) x = notch(x, f);
  // бесшовная петля: последние X отсчётов наложены на первые
  const X = Math.floor(SR * 0.12), L = x.length - X;
  const y = new Float32Array(L);
  for (let i = 0; i < L; i++) y[i] = x[i];
  for (let i = 0; i < X; i++) {
    const t = i / X;
    y[i] = x[i] * Math.sin(t * Math.PI / 2) + x[L + i] * Math.cos(t * Math.PI / 2);
  }
  // Выровнять огибающую: в записи мотор «гуляет» — провалы на 4–7 дБ внутри
  // петли (обороты и газ у оригинала не постоянные). Прокрученные по кругу на
  // ровном ходу, они звучали как переключения, которых нет. Делим на плавную
  // огибающую (RMS по 0.09 с, по кругу — шов петли не трогаем) в степени 0.9.
  if (name.startsWith('eng')) {
    const W = Math.floor(SR * 0.045), e = new Float32Array(L);
    let acc = 0;
    for (let i = -W; i <= W; i++) acc += y[(i + L) % L] ** 2;
    for (let i = 0; i < L; i++) {
      e[i] = Math.sqrt(acc / (2 * W + 1));
      acc += y[(i + W + 1) % L] ** 2 - y[(i - W + L) % L] ** 2;
    }
    const m = rms(y);
    for (let i = 0; i < L; i++) y[i] *= Math.min(2, Math.max(0.5, Math.pow(m / Math.max(e[i], 1e-6), 0.9)));
  }
  const k = 0.18 / rms(y);                    // все петли — к одной громкости
  for (let i = 0; i < L; i++) y[i] *= k;
  writeFileSync(`${OUT}/${name}.wav`, wav(y));
  const f = name.startsWith('eng') ? pitch(y) : 0;
  manifest.loops[name] = { src: id, hz: f, rpm: Math.round(f * 15), sec: +(L / SR).toFixed(2) };
  console.log(name, `${(L / SR).toFixed(2)} с`, f ? `${f} Гц ≈ ${Math.round(f * 15)} об/мин` : '');
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
writeFileSync(`${OUT}/sounds.json`, JSON.stringify(manifest, null, 1));
