// Отметки улиц центра, посчитанные по графу улиц (tools/build-road-levels.mjs).
// Дороги в центре ПЕРВИЧНЫ: профиль улицы берётся отсюда, а земля подгоняется
// к нему коридором (roadCorridorGen в worldgen.js). За краем квадрата профиль
// плавно, на ramp метрах, сводится к прежнему — снятому с рельефа.
//
// Модуль ждёт файл на загрузке (top-level await): roadProfile синхронный, и
// данные к первой сборке квадрата обязаны быть на месте. Нет файла — живём
// по-старому.
const v = (() => { try { return new URL(import.meta.url).searchParams.get('v') || ''; } catch { return ''; } })();
let L = null;
try {
  const r = await fetch(new URL('../../data/road-levels.json' + (v ? '?v=' + v : ''), import.meta.url));
  if (r.ok) L = await r.json();
} catch { L = null; }

export const ROAD_LEVELS = L;

// Вес первичного профиля в точке: 1 в квадрате, к нулю на ramp метрах за краем.
export function levelWeight(x, z) {
  if (!L) return 0;
  const b = L.box;
  const dx = Math.max(b.x0 - x, 0, x - b.x1), dz = Math.max(b.z0 - z, 0, z - b.z1);
  const d = Math.hypot(dx, dz);
  if (d <= 0) return 1;
  const t = Math.max(0, 1 - d / L.ramp);
  return t * t * (3 - 2 * t);
}

// Отметка улицы id в точке (x, z): проекция на осевую pts, интерполяция по
// длине. За концами — продолжение по последнему уклону (концы вытянуты при
// построении полотна).
export function levelAt(id, pts, x, z) {
  const e = L && L.roads[id];
  if (!e) return null;
  let best = Infinity, bs = 0, acc = 0;
  const n = pts.length / 2;
  for (let k = 0; k < n - 1; k++) {
    const ax = pts[k * 2], az = pts[k * 2 + 1], dx = pts[k * 2 + 2] - ax, dz = pts[k * 2 + 3] - az;
    const L2 = dx * dx + dz * dz, len = Math.sqrt(L2);
    let t = L2 ? ((x - ax) * dx + (z - az) * dz) / L2 : 0;
    // за концами осевой позволяем выйти: это вытянутые концы
    if (k > 0) t = Math.max(0, t);
    if (k < n - 2) t = Math.min(1, t);
    const qx = ax + dx * t, qz = az + dz * t, d = (x - qx) ** 2 + (z - qz) ** 2;
    if (d < best) { best = d; bs = acc + t * len; }
    acc += len;
  }
  const s = e.s, h = e.h, m = s.length;
  if (m === 1) return h[0];
  if (bs <= s[0]) return h[0] + (h[1] - h[0]) / Math.max(0.5, s[1] - s[0]) * (bs - s[0]);
  if (bs >= s[m - 1]) return h[m - 1] + (h[m - 1] - h[m - 2]) / Math.max(0.5, s[m - 1] - s[m - 2]) * (bs - s[m - 1]);
  let lo = 0, hi = m - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (s[mid] <= bs) lo = mid; else hi = mid; }
  const t = (bs - s[lo]) / Math.max(1e-6, s[hi] - s[lo]);
  // кубическая эрмитова кривая по соседним отметкам — без изломов в узлах
  const h0 = h[Math.max(0, lo - 1)], h1 = h[lo], h2 = h[hi], h3 = h[Math.min(m - 1, hi + 1)];
  const m1 = (h2 - h0) / 2, m2 = (h3 - h1) / 2, t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * h1 + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * h2 + (t3 - t2) * m2;
}
