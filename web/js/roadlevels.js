// Отметки улиц, посчитанные по графу улиц (tools/build-road-levels.mjs).
// Дороги ПЕРВИЧНЫ по всей карте: профиль улицы берётся отсюда, а земля
// подгоняется к нему коридором (roadCorridorGen в worldgen.js). Улица без
// отметок (тропа, проезд, чей квадрат не приехал) живёт по-старому — по
// профилю, снятому с рельефа.
//
// Два источника:
//   • data/road-levels.json — улицы дальнего слоя (far.json) и плоскости
//     перекрёстков, ждём на загрузке модуля (top-level await): roadProfile
//     синхронный, и данные к первой сборке квадрата обязаны быть на месте;
//   • data/road-levels/<cx>_<cz>.json — дворовые проезды вне far.json, с
//     осевой: квадрат земли просит их у своих девяти квадратов перед сборкой
//     (levelsReady), коридор берёт их как обычные улицы (yardRoadsIn).
//
// Формат отметок: по длине осевой с шагом step м, сантиметры, первая —
// сама, дальше разности.
const v = (() => { try { return new URL(import.meta.url).searchParams.get('v') || ''; } catch { return ''; } })();
const q = v ? '?v=' + v : '';
const base = new URL('../../data/', import.meta.url);
let L = null;
try {
  const r = await fetch(new URL('road-levels.json' + q, base));
  if (r.ok) L = await r.json();
} catch { L = null; }

const decode = enc => {
  const h = new Float32Array(enc.length);
  let acc = 0;
  for (let i = 0; i < enc.length; i++) { acc += enc[i]; h[i] = acc / 100; }
  return h;
};
const STEP = (L && L.step) || 8;
const LV = new Map();               // id → Float32Array отметок
if (L) for (const id in L.roads) LV.set(id, decode(L.roads[id]));
if (L) L.roads = null;              // разжатое лежит в LV

export const ROAD_LEVELS = L;
export const hasLevels = id => LV.has(id);

// Вес первичного профиля в точке. Отметки теперь на всю карту: 1 везде,
// где они есть. Старый файл с квадратом (box) — 1 в квадрате, к нулю на ramp
// метрах за краем.
export function levelWeight(x, z) {
  if (!L) return 0;
  const b = L.box;
  if (!b) return 1;
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
  const h = LV.get(id);
  if (!h) return null;
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
  const m = h.length;
  if (m === 1) return h[0];
  // отсчёты: 0, step, 2·step, … и последний — в самом конце осевой (acc)
  const sOf = i => i < m - 1 ? i * STEP : acc;
  if (bs <= 0) return h[0] + (h[1] - h[0]) / Math.max(0.5, sOf(1)) * bs;
  if (bs >= acc) return h[m - 1] + (h[m - 1] - h[m - 2]) / Math.max(0.5, acc - sOf(m - 2)) * (bs - acc);
  const lo = Math.min(m - 2, Math.floor(bs / STEP)), hi = lo + 1;
  const t = (bs - sOf(lo)) / Math.max(1e-6, sOf(hi) - sOf(lo));
  // кубическая эрмитова кривая по соседним отметкам — без изломов в узлах
  const h0 = h[Math.max(0, lo - 1)], h1 = h[lo], h2 = h[hi], h3 = h[Math.min(m - 1, hi + 1)];
  const m1 = (h2 - h0) / 2, m2 = (h3 - h1) / 2, t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * h1 + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * h2 + (t3 - t2) * m2;
}

// ---------------------------------------------------------------- проезды
// Квадраты с дворовыми проездами (список — в road-levels.json, чтобы не
// ходить за 404). Загруженный квадрат держим: они маленькие.
const YARD = new Set((L && L.yards) || []);
const yards = new Map();            // ключ → массив улиц | промис
const yardKey = (cx, cz) => cx + '_' + cz;
function loadYard(k) {
  if (yards.has(k)) return;
  if (!YARD.has(k)) { yards.set(k, []); return; }
  yards.set(k, fetch(new URL('road-levels/' + k + '.json' + q, base))
    .then(r => (r.ok ? r.json() : { roads: [] }))
    .catch(() => ({ roads: [] }))
    .then(d => {
      const list = [];
      for (const o of d.roads || []) {
        if (!LV.has(o.id)) LV.set(o.id, decode(o.lv));
        // постоянный номер за всеми улицами far.json — при равном весе в
        // коридоре побеждает младший номер, у соседей по шву одинаково
        list.push({ id: o.id, c: o.c, w: o.w, pts: o.pts, __rank: 1e7 + o.rk });
      }
      yards.set(k, list);
    }));
}
const cellsOf = (x0, z0, x1, z1) => {
  const out = [];
  for (let j = Math.floor(z0 / 1024); j <= Math.floor(z1 / 1024); j++)
    for (let i = Math.floor(x0 / 1024); i <= Math.floor(x1 / 1024); i++) out.push(yardKey(i, j));
  return out;
};
// Приехали ли проезды для прямоугольника; не приехали — запросить.
export function levelsReady(x0, z0, x1, z1) {
  if (!L) return true;
  let ok = true;
  for (const k of cellsOf(x0, z0, x1, z1)) {
    loadYard(k);
    if (!Array.isArray(yards.get(k))) ok = false;
  }
  return ok;
}
// Проезды, задевающие прямоугольник (без повторов; порядок — по номеру).
export function yardRoadsIn(x0, z0, x1, z1) {
  const seen = new Set(), out = [];
  for (const k of cellsOf(x0, z0, x1, z1)) {
    const l = yards.get(k);
    if (!Array.isArray(l)) continue;
    for (const r of l) {
      if (seen.has(r.id)) continue;
      const p = r.pts;
      let hit = false;
      for (let i = 0; i < p.length && !hit; i += 2) hit = p[i] > x0 - 40 && p[i] < x1 + 40 && p[i + 1] > z0 - 40 && p[i + 1] < z1 + 40;
      if (!hit) continue;
      seen.add(r.id); out.push(r);
    }
  }
  out.sort((a, b) => a.__rank - b.__rank);
  return out;
}

// ---------------------------------------------------------------- перекрёстки
// Плоскость каждого перекрёстка (см. tools/build-road-levels.mjs): в пятне
// узла (и 2 м вокруг) коридор лежит ровно на ней, дальше на 8 м плавно
// переходит в профили улиц. Возвращает { h, w } или null.
// В файле: x, z, r — дециметры, a — сантиметры, bx, bz — 1e-4, пятно —
// дециметры от центра; здесь — метры, как раньше.
const JG = 40, jgrid = new Map();
if (L && L.junctions) {
  L.junctions = L.junctions.map(j => {
    if (L.v !== 2) return j;
    const x = j[0] / 10, z = j[1] / 10;
    return [x, z, j[2] / 10, j[3] / 100, j[4] / 1e4, j[5] / 1e4, j[6] ? j[6].map((v, k) => v / 10 + (k % 2 ? z : x)) : null];
  });
  for (const j of L.junctions) {
    const R = j[2] + 12;
    for (let i = Math.floor((j[0] - R) / JG); i <= Math.floor((j[0] + R) / JG); i++)
      for (let k = Math.floor((j[1] - R) / JG); k <= Math.floor((j[1] + R) / JG); k++) {
        const key = i * 100003 + k; let a = jgrid.get(key); if (!a) jgrid.set(key, a = []); a.push(j);
      }
  }
}
// вынос точки за выпуклое пятно (в данных обход положительный); без пятна — круг
const outOf = (j, x, z) => {
  const p = j[6];
  if (!p) return Math.hypot(x - j[0], z - j[1]) - j[2];
  const n = p.length / 2;
  let far = -1e9;
  for (let i = 0; i < n; i++) {
    const k = (i + 1) % n, ax = p[i * 2], az = p[i * 2 + 1], ex = p[k * 2] - ax, ez = p[k * 2 + 1] - az;
    const d = ((x - ax) * ez - (z - az) * ex) / (Math.hypot(ex, ez) || 1);
    if (d > far) far = d;
  }
  return far;
};
export function junctionPlaneAt(x, z) {
  const a = jgrid.get(Math.floor(x / JG) * 100003 + Math.floor(z / JG));
  if (!a) return null;
  let best = null, bw = 0;
  for (const j of a) {
    const d = outOf(j, x, z);
    if (d > 10) continue;
    const t = d <= 2 ? 1 : 1 - (d - 2) / 8;
    const w = t * t * (3 - 2 * t);
    if (w > bw) { bw = w; best = j; }
  }
  if (!best) return null;
  return { h: best[3] + best[4] * (x - best[0]) + best[5] * (z - best[1]), w: bw };
}
