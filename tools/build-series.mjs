// Типовые дома: какие дома города — хрущёвки, сталинки и девятиэтажки.
//
//   node tools/build-series.mjs        → data/series.json
//
// Серий в OSM нет (building:series не стоит ни у одного дома), поэтому серию
// узнаём по тому, что в данных есть: этажность из тегов OSM и пятно застройки.
//  - девятиэтажка (p): 9–17 этажей ПО ТЕГУ, пятно почти прямоугольное —
//    пластина 10–16 м глубиной или точечная башня до 26 м;
//  - хрущёвка (k): 4–5 этажей ПО ТЕГУ, прямоугольная пластина 9–14 м глубиной
//    и от 24 м длиной — так стоят 1-447 и 1-464, других пятиэтажек такой
//    формы массово не строили;
//  - сталинка (s): Центральный холм внутри Кольца (пр. Нахимова — пл. Лазарева
//    — Большая Морская — пл. Ушакова — Ленина) и фронт улиц Кольца снаружи:
//    центр отстроен после войны целиком, 1944–1957. Тут этажность может быть
//    и оценённой — меняется только фасад, высота дома остаётся прежней.
// Дома без тега этажности хрущёвкой и девятиэтажкой не делаем: высота у них
// угадана, а «пятиэтажка», у которой на деле три этажа, — враньё.
//
// Вход в подъезды: в OSM их точек у нас нет, а у типового дома подъезды
// почти всегда со двора. Берём длинную сторону, которая ДАЛЬШЕ от ближайшей
// улицы (класс ≤ 2): улица — с одной стороны дома, двор — с другой.
//
// Формат: { v, ring: [x,z,...], b: { <id дома>: [серия, ребро входа] } },
// ребро — индекс вершины контура, с которой начинается стена с подъездами
// (контуры в чанках уже обходятся против часовой), −1 — входа нет.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'data/chunks');

const houses = new Map(), roads = new Map();
for (const f of readdirSync(DIR)) {
  if (!/^-?\d+_-?\d+\.json$/.test(f)) continue;
  const c = JSON.parse(readFileSync(join(DIR, f), 'utf8'));
  for (const b of c.buildings || []) if (!houses.has(b.id)) houses.set(b.id, b);
  for (const r of c.roads || []) if (!roads.has(r.id)) roads.set(r.id, r);
}

function areaOf(p) {
  let a = 0;
  for (let i = 0, n = p.length / 2; i < n; i++) {
    const j = (i + 1) % n;
    a += p[i * 2] * p[j * 2 + 1] - p[j * 2] * p[i * 2 + 1];
  }
  return a / 2;
}
// минимальная охватывающая рамка по направлениям рёбер (как obb в worldgen.js)
function obb(poly) {
  const n = poly.length / 2;
  let best = null;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = poly[j * 2] - poly[i * 2], dz = poly[j * 2 + 1] - poly[i * 2 + 1];
    const l = Math.hypot(dx, dz);
    if (l < 0.4) continue;
    const ux = dx / l, uz = dz / l;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let k = 0; k < n; k++) {
      const x = poly[k * 2], z = poly[k * 2 + 1];
      const u = x * ux + z * uz, v = -x * uz + z * ux;
      if (u < u0) u0 = u; if (u > u1) u1 = u;
      if (v < v0) v0 = v; if (v > v1) v1 = v;
    }
    const a = (u1 - u0) * (v1 - v0);
    if (!best || a < best.area) best = { area: a, ux, uz, du: u1 - u0, dv: v1 - v0 };
  }
  return best;
}
function inPoly(x, z, p) {
  let ins = false;
  for (let i = 0, n = p.length / 2, j = n - 1; i < n; j = i++) {
    const xi = p[i * 2], zi = p[i * 2 + 1], xj = p[j * 2], zj = p[j * 2 + 1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) ins = !ins;
  }
  return ins;
}
function segDist(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
  const t = L2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)) : 0;
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
}

// ---- улицы: сетка 100 м для поиска ближайшей
const CELL = 100, grid = new Map();
for (const r of roads.values()) {
  if (r.c > 2 || r.tn) continue;
  for (let i = 0; i + 3 < r.pts.length; i += 2) {
    const s = [r.pts[i], r.pts[i + 1], r.pts[i + 2], r.pts[i + 3]];
    const x0 = Math.floor(Math.min(s[0], s[2]) / CELL), x1 = Math.floor(Math.max(s[0], s[2]) / CELL);
    const z0 = Math.floor(Math.min(s[1], s[3]) / CELL), z1 = Math.floor(Math.max(s[1], s[3]) / CELL);
    for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) {
      const k = gx + ',' + gz;
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(s);
    }
  }
}
function roadDist(x, z) {
  const gx = Math.floor(x / CELL), gz = Math.floor(z / CELL);
  let d = 300;
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++)
    for (const s of grid.get((gx + i) + ',' + (gz + j)) || []) d = Math.min(d, segDist(x, z, ...s));
  return d;
}

// ---- Кольцо Центрального холма: осевые улиц Кольца из OSM в окне центра.
const RING_STREETS = /^(проспект Нахимова|площадь Лазарева|Большая Морская улица|площадь Ушакова|улица Ленина|площадь Нахимова)$/;
const ringPts = [];
for (const r of roads.values()) {
  if (!r.n || !RING_STREETS.test(r.n)) continue;
  for (let i = 0; i < r.pts.length; i += 2) {
    const x = r.pts[i], z = r.pts[i + 1];
    if (x > -600 && x < 300 && z > -100 && z < 1900) ringPts.push([x, z]);
  }
}
// Кольцо — овал вокруг холма, его улицы выпуклы наружу: контур — выпуклая
// оболочка точек осевых (по углу от центра площади дают зигзаг: у пл. Лазарева
// и Ушакова осевые идут в несколько ниток).
let ring = [];
if (ringPts.length > 20) {
  const P = ringPts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of P.reverse()) { while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
  for (const [x, z] of lo.slice(0, -1).concat(hi.slice(0, -1))) ring.push(Math.round(x * 10) / 10, Math.round(z * 10) / 10);
}
const RING_FRONT = 45;   // фронт застройки Кольца с внешней стороны, м
function ringDist(x, z) {
  let d = Infinity;
  for (let i = 0, n = ring.length / 2; i < n; i++) {
    const j = (i + 1) % n;
    d = Math.min(d, segDist(x, z, ring[i * 2], ring[i * 2 + 1], ring[j * 2], ring[j * 2 + 1]));
  }
  return d;
}

const RESIDENTIAL = /^(apartments|residential|dormitory|yes)?$/;
const out = {}, count = { k: 0, s: 0, p: 0 };

for (const b of houses.values()) {
  // серия, названная руками (houses.json → ser), — без проверок формы:
  // владелец знает дом лучше, чем пятно OSM
  const forced = !b.hide && /^[ksp]$/.test(b.ser || '') ? b.ser : null;
  // памятные, вручную раскрашенные и особые дома остаются как есть
  if (!forced && (b.hand || b.hide || b.go || b.fx || b.arch || b.temple || b.school || b.wc)) continue;
  if (!forced && !RESIDENTIAL.test(b.t || '')) continue;
  const poly = b.poly, n = poly.length / 2;
  if (n < 4) continue;
  const area = Math.abs(areaOf(poly));
  const box = obb(poly);
  if (!box) continue;
  const rect = area / box.area;
  const L = Math.max(box.du, box.dv), W = Math.min(box.du, box.dv);
  const fl = b.lv ? Math.round((b.h - 1.2) / 3.2) : Math.round((b.h - 1.1) / 3.25);
  let cxm = 0, czm = 0;
  for (let i = 0; i < n; i++) { cxm += poly[i * 2]; czm += poly[i * 2 + 1]; }
  cxm /= n; czm /= n;
  const center = ring.length && (inPoly(cxm, czm, ring) || ringDist(cxm, czm) < RING_FRONT);

  let code = null;
  if (forced) {
    code = forced;
  } else if (center) {
    if (fl >= 3 && fl <= 7 && area >= 150) code = 's';
  } else if (b.lv && fl >= 9 && fl <= 17 && rect >= 0.85 && W >= 10 && W <= 26 && L >= 15 && area >= 250) {
    code = 'p';
  } else if (b.lv && fl >= 4 && fl <= 5 && rect >= 0.88 && W >= 9 && W <= 14 && L >= 24) {
    code = 'k';
  }
  if (!code) continue;

  // стена с подъездами: длинная сторона, обращённая во двор
  let edge = -1;
  if (code !== 's') {
    const ax = box.du >= box.dv ? box.ux : -box.uz, az = box.du >= box.dv ? box.uz : box.ux;
    const sides = { [-1]: null, [1]: null };
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const dx = poly[j * 2] - poly[i * 2], dz = poly[j * 2 + 1] - poly[i * 2 + 1];
      const l = Math.hypot(dx, dz);
      if (l < Math.max(6, L * 0.45) || Math.abs((dx * ax + dz * az) / l) < 0.95) continue;
      const nx = dz / l, nz = -dx / l;              // наружу (контур против часовой)
      const sg = (nx * -az + nz * ax) > 0 ? 1 : -1;
      if (!sides[sg] || l > sides[sg].l) sides[sg] = { i, l, mx: (poly[i * 2] + poly[j * 2]) / 2, mz: (poly[i * 2 + 1] + poly[j * 2 + 1]) / 2, nx, nz };
    }
    let best = -Infinity;
    for (const s of [sides[-1], sides[1]]) {
      if (!s) continue;
      const d = roadDist(s.mx + s.nx * 12, s.mz + s.nz * 12);
      if (d > best) { best = d; edge = s.i; }
    }
  }
  out[b.id] = [code, edge];
  count[code]++;
}

const doc = { v: 1, note: 'tools/build-series.mjs: k — хрущёвка, s — сталинка, p — девятиэтажка; [серия, ребро входа]', count, ring, b: out };
writeFileSync(join(ROOT, 'data/series.json'), JSON.stringify(doc));
console.log('серии:', count, 'точек Кольца:', ring.length / 2);
