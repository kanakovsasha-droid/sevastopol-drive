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
import { gateOf, gateCut } from '../web/js/passage.js';

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

// ---- подсказки OSM (tools/fetch-series-osm.mjs): участки и теги домов
let HINT = { land: [], b: {} };
try { HINT = JSON.parse(readFileSync(join(ROOT, 'data/series-osm.json'), 'utf8')); } catch { console.log('нет data/series-osm.json — без участков'); }
const LCELL = 200, lgrid = new Map();
for (const [kind, p] of HINT.land) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); z0 = Math.min(z0, p[i + 1]); z1 = Math.max(z1, p[i + 1]); }
  const rec = { kind, p, x0, x1, z0, z1 };
  for (let gx = Math.floor(x0 / LCELL); gx <= Math.floor(x1 / LCELL); gx++)
    for (let gz = Math.floor(z0 / LCELL); gz <= Math.floor(z1 / LCELL); gz++) {
      const k = gx + ',' + gz;
      if (!lgrid.has(k)) lgrid.set(k, []);
      lgrid.get(k).push(rec);
    }
}
// виды участков, внутри которых лежит точка
function landAt(x, z) {
  const out = new Set();
  for (const r of lgrid.get(Math.floor(x / LCELL) + ',' + Math.floor(z / LCELL)) || [])
    if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1 && inPoly(x, z, r.p)) out.add(r.kind);
  return out;
}
const NOT_HOME = new Set(['ind', 'mil', 'gar', 'inst', 'com']);
// назначение дома из тегов, при котором он не жилой типовой
// (кафе или аптека в доме — amenity без вида — дом жилым быть не мешает)
const NOT_HOME_USE = /^(hospital|clinic|school|kindergarten|university|college|prison|office|tourism)$/;

const RESIDENTIAL = /^(apartments|residential|dormitory|yes)?$/;
const out = {}, count = { k: 0, s: 0, p: 0 }, why = {};
const note = k => { why[k] = (why[k] || 0) + 1; };

// Пятиэтажки без тега этажности. В OSM этажность есть у каждого пятого дома,
// у остальных высота угадана по пятну и соседям — и половина хрущёвок города
// оставалась коробками. Хрущёвку выдаёт форма: прямоугольная пластина
// 9.5–14.5 м глубиной и от 24 м длиной (секции по 14–16 м), и то, что она
// стоит НЕ ОДНА — микрорайон: рядом такие же пластины. Цех такой формы
// стоит в промзоне (участок OSM), школа и больница — на своей территории.
// Таким домам ставим высоту пятиэтажки (поле h в series.json).
const K_H = 16.6;        // 5 этажей по 3.2 м и цоколь — сетка шейдера даёт ровно 5
const slabs = [];        // все пластины города — для поиска соседей-клонов
const info = new Map();
for (const b of houses.values()) {
  const poly = b.poly, n = poly.length / 2;
  if (n < 4) continue;
  const area = Math.abs(areaOf(poly));
  const box = obb(poly);
  if (!box) continue;
  const L = Math.max(box.du, box.dv), W = Math.min(box.du, box.dv);
  let cx = 0, cz = 0;
  for (let i = 0; i < n; i++) { cx += poly[i * 2]; cz += poly[i * 2 + 1]; }
  cx /= n; cz /= n;
  const r = { area, box, rect: area / box.area, L, W, cx, cz };
  info.set(b.id, r);
  if (r.rect >= 0.85 && W >= 9 && W <= 15 && L >= 22 && L <= 160 && RESIDENTIAL.test(b.t || '') && !b.school && !b.temple)
    slabs.push(r);
}
const SCELL = 160, sgrid = new Map();
for (const r of slabs) {
  const k = Math.floor(r.cx / SCELL) + ',' + Math.floor(r.cz / SCELL);
  if (!sgrid.has(k)) sgrid.set(k, []);
  sgrid.get(k).push(r);
}
function clones(r) {
  let c = 0;
  const gx = Math.floor(r.cx / SCELL), gz = Math.floor(r.cz / SCELL);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++)
    for (const q of sgrid.get((gx + i) + ',' + (gz + j)) || [])
      if (q !== r && Math.abs(q.W - r.W) < 2.2 && Math.hypot(q.cx - r.cx, q.cz - r.cz) < 170) c++;
  return c;
}

// Арка-проезд под домом: улица OSM с tunnel (building_passage) проходит
// сквозь корпус. Середина проёма — точка входа на ближней к улице стене.
const tunnels = [...roads.values()].filter(r => r.tn).concat((HINT.pass || []).map(pts => ({ pts })));
// Контур без лишних вершин: проезд в OSM обычно упирается в точку контура
// посреди прямой стены, и стена в этом месте разбита надвое — проём тогда
// ложится на стык двух рёбер. Убираем вершины с изломом меньше 8°.
function simplify(src) {
  let p = src.slice();
  let n = p.length / 2;
  if (n > 3 && Math.hypot(p[0] - p[n * 2 - 2], p[1] - p[n * 2 - 1]) < 0.05) { p.length -= 2; n--; }
  for (let again = true; again && n > 3;) {
    again = false;
    for (let i = 0; i < n; i++) {
      const a = (i + n - 1) % n, c = (i + 1) % n;
      const ux = p[i * 2] - p[a * 2], uz = p[i * 2 + 1] - p[a * 2 + 1], vx = p[c * 2] - p[i * 2], vz = p[c * 2 + 1] - p[i * 2 + 1];
      const lu = Math.hypot(ux, uz), lv = Math.hypot(vx, vz);
      if (lu < 0.05 || lv < 0.05 || Math.abs(ux * vz - uz * vx) / (lu * lv) < 0.14 && (ux * vx + uz * vz) > 0) {
        p.splice(i * 2, 2); n--; again = true; break;
      }
    }
  }
  return p;
}

function passageOf(b, r) {
  const p = simplify(b.poly), n = p.length / 2;
  for (const t of tunnels) {
    const q = t.pts;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < q.length; i += 2) { x0 = Math.min(x0, q[i]); x1 = Math.max(x1, q[i]); z0 = Math.min(z0, q[i + 1]); z1 = Math.max(z1, q[i + 1]); }
    if (x1 < r.cx - r.L || x0 > r.cx + r.L || z1 < r.cz - r.L || z0 > r.cz + r.L) continue;
    const hits = [];
    for (let s = 0; s + 3 < q.length; s += 2) {
      // концы осевой часто лежат ровно на стене — тянем отрезок на 3 м наружу
      let ax = q[s], az = q[s + 1], ux = q[s + 2] - ax, uz = q[s + 3] - az;
      const ul = Math.hypot(ux, uz) || 1;
      const ex0 = s === 0 ? 3 : 0, ex1 = s + 4 >= q.length ? 3 : 0;
      ax -= ux / ul * ex0; az -= uz / ul * ex0;
      ux += ux / ul * (ex0 + ex1); uz += uz / ul * (ex0 + ex1);
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ex = p[j * 2] - p[i * 2], ez = p[j * 2 + 1] - p[i * 2 + 1];
        const den = ux * ez - uz * ex;
        if (Math.abs(den) < 1e-9) continue;
        const wx = p[i * 2] - ax, wz = p[i * 2 + 1] - az;
        const tt = (wx * ez - wz * ex) / den, ss = (wx * uz - wz * ux) / den;
        if (tt >= 0 && tt <= 1 && ss >= 0 && ss <= 1 && !hits.some(h => Math.hypot(h[0] - ax - ux * tt, h[1] - az - uz * tt) < 0.5)) hits.push([ax + ux * tt, az + uz * tt, roadDist(ax + ux * tt, az + uz * tt)]);
      }
    }
    // ровно вход и выход, проезд 6–30 м (сквозь корпус, а не по углу) — арка
    const dh = hits.length === 2 ? Math.hypot(hits[0][0] - hits[1][0], hits[0][1] - hits[1][1]) : 0;
    if (dh < 6 || dh > 30) continue;
    const h = hits[0][2] <= hits[1][2] ? hits[0] : hits[1];
    const gate = [Math.round(h[0] * 10) / 10, Math.round(h[1] * 10) / 10, 3.6, 3.9];
    // проверка тем же разбором, что в игре: обе стены рвутся целым проёмом,
    // иначе (проезд у угла, по вершине контура) арку не ставим
    const tb = { poly: p, gate }, g = gateOf(tb);
    if (!g) continue;
    const wallCut = i => { const j = (i + 1) % n, l = Math.hypot(p[j * 2] - p[i * 2], p[j * 2 + 1] - p[i * 2 + 1]);
      return gateCut(g, i, p[i * 2], p[i * 2 + 1], p[j * 2], p[j * 2 + 1], l); };
    if (!wallCut(g.e) || !wallCut(g.x)) continue;
    return { gate, poly: p };
  }
  return null;
}

let lv0k = 0, outS = 0, gates = 0;
for (const b of houses.values()) {
  // серия, названная руками (houses.json → ser), — без проверок формы:
  // владелец знает дом лучше, чем пятно OSM
  const forced = !b.hide && /^[ksp]$/.test(b.ser || '') ? b.ser : null;
  // памятные, вручную раскрашенные и особые дома остаются как есть
  if (!forced && (b.hand || b.hide || b.go || b.fx || b.arch || b.temple || b.school || b.wc)) continue;
  if (!forced && !RESIDENTIAL.test(b.t || '')) continue;
  const r = info.get(b.id);
  if (!r) continue;
  let poly = b.poly, n = poly.length / 2;
  const { area, box, rect, L, W, cx: cxm, cz: czm } = r;
  const fl = b.lv ? Math.round((b.h - 1.2) / 3.2) : Math.round((b.h - 1.1) / 3.25);
  const center = ring.length && (inPoly(cxm, czm, ring) || ringDist(cxm, czm) < RING_FRONT);
  const tag = HINT.b[b.id] || {};
  const land = landAt(cxm, czm);
  const yr = tag.y || 0;
  // не жильё: цех, больница, школа, военная часть, гаражи, торговый центр
  const foreign = !forced && (NOT_HOME_USE.test(tag.u || '') ||
    ([...land].some(k => NOT_HOME.has(k) && !(center && k === 'com')) && !(b.lv && /^(apartments|residential)$/.test(b.t || ''))));
  if (foreign) { note('не жильё по OSM'); continue; }

  let code = null, h = 0;
  const yrOk = (a, z) => !yr || (yr >= a && yr <= z);
  if (forced) {
    code = forced;
  } else if (center) {
    if (fl >= 2 && fl <= 7 && area >= (fl === 2 ? 200 : 150) && yrOk(1944, 1962)) code = 's';
  } else if (b.lv && fl >= 9 && fl <= 17 && rect >= 0.80 && W >= 10 && W <= 26 && L >= 15 && area >= 250 && yrOk(1964, 1995)) {
    code = 'p';
  } else if (b.lv && fl >= 4 && fl <= 5 && rect >= 0.85 && W >= 9 && W <= 15 && L >= 22 && yrOk(1955, 1985)) {
    code = 'k';
  } else if (!b.lv && fl >= 3 && rect >= 0.88 && W >= 9.5 && W <= 14.5 && L >= 24 && L <= 130 && yrOk(1955, 1985) &&
             (land.has('res') || /^(apartments|residential)$/.test(b.t || '') || clones(r) >= 2)) {
    code = 'k'; h = K_H; lv0k++;
  } else if (fl >= 2 && fl <= 4 && rect >= 0.75 && area >= 200 && L >= 15 && yrOk(1944, 1962) &&
             ((b.lv && /^(apartments|residential)$/.test(b.t || '')) || b.rs === 'hipped' || (yr && yr <= 1960))) {
    // послевоенные 2–4-этажки вне центра (Корабельная, Северная, Острякова):
    // тот же камень и штукатурка, что у сталинок холма
    code = 's'; outS++;
  }
  if (!code) continue;

  // арка по OSM (tunnel=building_passage), если своей (houses.json) нет.
  // С аркой дом идёт упрощённым контуром (series.json, шестое поле) —
  // ребро подъездов считаем уже по нему.
  const pg = !b.gate ? passageOf(b, r) : null;
  const gate = pg ? pg.gate : null;
  if (pg) { gates++; poly = pg.poly; n = poly.length / 2; }
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
  // [серия, ребро входа, подъездов (руками, 0 — сам), высота (0 — своя), арка, контур]
  const e = [code, edge];
  if (b.ent || h || gate) e.push(b.ent || 0);
  if (h || gate) e.push(h);
  if (gate) e.push(gate, poly);
  out[b.id] = e;
  count[code]++;
}

const doc = { v: 2, note: 'tools/build-series.mjs: k — хрущёвка, s — сталинка, p — девятиэтажка; [серия, ребро входа, подъездов, высота, арка, контур под арку]', count, ring, b: out };
writeFileSync(join(ROOT, 'data/series.json'), JSON.stringify(doc));
console.log('серии:', count, 'точек Кольца:', ring.length / 2, '| пятиэтажек без тега:', lv0k, '| сталинок вне центра:', outS, '| арок по OSM:', gates, '| отсеяно:', why);
