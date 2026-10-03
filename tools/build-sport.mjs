// Спортивные площадки поверх чанков: node tools/build-sport.mjs
//
// Пишет data/sport.json — его читает web/js/sport.js при старте игры.
// Что в нём:
//   * flats — ровные площадки под полями, кортами и беговыми дорожками: контур
//     и отметка. По ним рельеф СРЕЗАЕТСЯ и ПОДСЫПАЕТСЯ (installFlats), а
//     площадка ложится на землю, а не плитой над ней. Отметку считаем здесь, по
//     детальным высотам, один раз: в игре детальный тайл может ещё не приехать,
//     а отметка обязана быть одной и той же у обоих соседей по шву.
//   * areas — что рисовать на каждой площадке (класс, покрытие из OSM, дубли
//     на выброс, внутренний контур беговой дорожки, ограда).
//   * stands, masts, skip — ручные правки из data/sport-hand.json как есть.
//
// Входы: data/chunks/*.json (площадки), data/areas.json (теги surface,
// которых в чанках нет), data/terrain/ (высоты), data/sport-hand.json.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { Terrain } from '../web/js/terrain.js';

const DIR = new URL('../data/', import.meta.url).pathname;
const R1 = v => Math.round(v * 10) / 10;

// ---------------------------------------------------------------- геометрия
const ring = p => {                       // без замыкающей точки
  const n = p.length / 2;
  if (n > 1 && p[0] === p[(n - 1) * 2] && p[1] === p[(n - 1) * 2 + 1]) return p.slice(0, -2);
  return p.slice();
};
const inPoly = (x, z, p) => {
  let c = false;
  for (let i = 0, j = p.length / 2 - 1; i < p.length / 2; j = i++) {
    const xi = p[i * 2], zi = p[i * 2 + 1], xj = p[j * 2], zj = p[j * 2 + 1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
  }
  return c;
};
const areaOf = p => {
  let A = 0; const n = p.length / 2;
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; A += p[i * 2] * p[j * 2 + 1] - p[j * 2] * p[i * 2 + 1]; }
  return A / 2;
};
const bbox = p => {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < p.length; i += 2) {
    x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); z0 = Math.min(z0, p[i + 1]); z1 = Math.max(z1, p[i + 1]);
  }
  return [x0, z0, x1, z1];
};
// габаритная рамка минимальной площади (та же, что obbOf в worldgen)
function obb(poly) {
  const n = poly.length / 2;
  let best = null;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = poly[j * 2] - poly[i * 2], dz = poly[j * 2 + 1] - poly[i * 2 + 1];
    const l = Math.hypot(dx, dz);
    if (l < 1e-6) continue;
    const ux = dx / l, uz = dz / l;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let k = 0; k < n; k++) {
      const u = poly[k * 2] * ux + poly[k * 2 + 1] * uz, v = -poly[k * 2] * uz + poly[k * 2 + 1] * ux;
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    const a = (u1 - u0) * (v1 - v0);
    if (!best || a < best.a) best = { a, ux, uz, u0, u1, v0, v1 };
  }
  return best;
}
// Сдвиг контура внутрь на d по биссектрисам. Годится для выпуклых и почти
// выпуклых контуров (овалы стадионов); если вышло криво — null.
function inset(p, d) {
  const n = p.length / 2;
  const s = Math.sign(areaOf(p)) || 1;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i + n - 1) % n, b = (i + 1) % n;
    const e1x = p[i * 2] - p[a * 2], e1z = p[i * 2 + 1] - p[a * 2 + 1];
    const e2x = p[b * 2] - p[i * 2], e2z = p[b * 2 + 1] - p[i * 2 + 1];
    const l1 = Math.hypot(e1x, e1z) || 1, l2 = Math.hypot(e2x, e2z) || 1;
    // внутренняя нормаль: при обходе против часовой (s > 0) — слева
    const n1x = -e1z / l1 * s, n1z = e1x / l1 * s, n2x = -e2z / l2 * s, n2z = e2x / l2 * s;
    let bx = n1x + n2x, bz = n1z + n2z;
    const bl = Math.hypot(bx, bz);
    if (bl < 1e-6) return null;
    bx /= bl; bz /= bl;
    const k = Math.min(3, 1 / Math.max(0.3, bx * n1x + bz * n1z));
    out.push(R1(p[i * 2] + bx * d * k), R1(p[i * 2 + 1] + bz * d * k));
  }
  const a0 = Math.abs(areaOf(p)), a1 = Math.abs(areaOf(out));
  if (Math.sign(areaOf(out)) !== s || a1 < a0 * 0.15) return null;
  for (let i = 0; i < out.length; i += 2) if (!inPoly(out[i], out[i + 1], p)) return null;
  return out;
}
// точки сетки внутри контура
function samples(p, step) {
  const [x0, z0, x1, z1] = bbox(p), out = [];
  for (let z = z0 + step / 2; z < z1; z += step)
    for (let x = x0 + step / 2; x < x1; x += step) if (inPoly(x, z, p)) out.push(x, z);
  return out;
}

// ---------------------------------------------------------------- данные
const hand = JSON.parse(readFileSync(DIR + 'sport-hand.json', 'utf8'));
const tags = new Map();          // контур → { sport, surface } из data/areas.json
try {
  const A = JSON.parse(readFileSync(DIR + 'areas.json', 'utf8'));
  for (const s of A.sport || []) tags.set(s.poly.map(R1).join(','), s);
} catch { /* без тегов покрытия обойдёмся видом спорта */ }

const areas = new Map();
for (const f of readdirSync(DIR + 'chunks')) {
  if (!/^-?\d+_-?\d+\.json$/.test(f)) continue;
  const d = JSON.parse(readFileSync(DIR + 'chunks/' + f, 'utf8'));
  for (const a of d.areas || []) if (!areas.has(a.id)) areas.set(a.id, a);
}

// ---------------------------------------------------------------- классы
// Класс — что рисовать: покрытие, разметку, ворота, сетку и ограду.
const FIELD_LIKE = new Set(['football', 'tennis', 'basketball', 'volleyball', 'multi', 'beach', 'skate', 'plaza']);
function classify(a, o) {
  if (a.k === 'track') return 'track';
  if (a.k === 'football') return 'football';
  if (a.k !== 'pitch') return null;
  const sp = (a.sp || '').toLowerCase();
  const L = Math.max(o.u1 - o.u0, o.v1 - o.v0);
  if (/beachvolley/.test(sp)) return 'beach';
  if (/^(soccer|football)$/.test(sp)) return L >= 50 ? 'football' : 'multi';
  if (/tennis/.test(sp) && !/table/.test(sp)) return 'tennis';
  if (/^(basketball|баскетбол)$/.test(sp)) return 'basketball';
  if (/^volleyball$/.test(sp)) return 'volleyball';
  if (/skate/.test(sp)) return 'skate';
  if (/chess|table_tennis/.test(sp)) return 'plaza';
  if (!sp) return L >= 60 ? 'football' : 'multi';
  return 'multi';
}

const meta = {};
const fieldList = [];
for (const a of areas.values()) {
  if (!['track', 'football', 'pitch'].includes(a.k)) continue;
  const p = ring(a.poly);
  if (p.length < 6) continue;
  const o = obb(p);
  if (!o) continue;
  const h = hand.areas?.[a.id] || {};
  const t = tags.get(a.poly.map(R1).join(','));
  const m = { as: h.as || classify(a, o) };
  if (!m.as) continue;
  const surface = h.surface || t?.surface;
  if (surface) m.surface = surface;
  if (h.drop) m.drop = true;
  if (h.holeFill) m.holeFill = h.holeFill;
  if (h.fence) m.fence = h.fence;
  const W = o.u1 - o.u0, L = o.v1 - o.v0;
  // Беговая дорожка в OSM — почти всегда сплошной контур без середины: залитая
  // тартаном целиком, она красила и поле. Внутреннюю кромку отводим на 7.5 м
  // (шесть дорожек по 1.22 и запас), если овал для этого достаточно велик.
  if (m.as === 'track' && !a.hole && Math.min(W, L) >= 40) {
    const hole = inset(p, 7.5);
    if (hole) m.hole = hole;
  }
  // Старый стадион без разметки в OSM: одно пятно «pitch» овалом. Раскладываем
  // его на гаревое кольцо и поле внутри.
  if (m.as === 'oval') {
    const rw = h.ring || 7.5;
    const hole = inset(p, rw);
    if (hole) {
      const oi = obb(hole);
      const Wi = Math.min(oi.u1 - oi.u0, oi.v1 - oi.v0), Li = Math.max(oi.u1 - oi.u0, oi.v1 - oi.v0);
      const fw = Math.min(68, Wi * 0.72);
      const R = Wi / 2;
      const fl = Math.min(105, (Li - Wi) + 2 * Math.sqrt(Math.max(0, R * R - fw * fw / 4)) - 3);
      // ось поля — вдоль длинной стороны внутреннего овала
      let ax = oi.ux, az = oi.uz;
      if (oi.v1 - oi.v0 > oi.u1 - oi.u0) { ax = -oi.uz; az = oi.ux; }
      const cu = (oi.u0 + oi.u1) / 2, cv = (oi.v0 + oi.v1) / 2;
      const cx = cu * oi.ux - cv * oi.uz, cz = cu * oi.uz + cv * oi.ux;
      const nx = -az, nz = ax;
      const rect = [];
      for (const [s, q] of [[-1, -1], [1, -1], [1, 1], [-1, 1]])
        rect.push(R1(cx + ax * s * fl / 2 + nx * q * fw / 2), R1(cz + az * s * fl / 2 + nz * q * fw / 2));
      m.replace = [
        { id: a.id + ':ring', k: 'track', poly: p, hole, as: 'track', surface: m.surface || 'cinder' },
        { id: a.id + ':field', k: 'football', poly: rect, as: 'football', surface: 'grass' },
      ];
    } else m.as = 'football';
  }
  meta[a.id] = m;
  if (FIELD_LIKE.has(m.as) && !m.drop) fieldList.push({ a, p, area: Math.abs(areaOf(p)) });
}

// Дубли: одно и то же поле, обведённое в OSM дважды (или и в OSM, и обмером
// агента). Два полотна на одной отметке дерутся за глубину — разметка шла
// пунктиром. Оставляем обмеренное, затем с видом спорта, затем большее.
let dupes = 0;
fieldList.sort((p, q) => q.area - p.area);
for (let i = 0; i < fieldList.length; i++) {
  const A = fieldList[i];
  if (meta[A.a.id].drop) continue;
  const ba = bbox(A.p);
  for (let j = i + 1; j < fieldList.length; j++) {
    const B = fieldList[j];
    if (meta[B.a.id].drop) continue;
    if (B.area < A.area * 0.6) continue;
    const bb = bbox(B.p);
    if (bb[0] > ba[2] || bb[2] < ba[0] || bb[1] > ba[3] || bb[3] < ba[1]) continue;
    const s = samples(B.p, 2);
    let hit = 0;
    for (let k = 0; k < s.length; k += 2) if (inPoly(s[k], s[k + 1], A.p)) hit++;
    if (!s.length || hit / (s.length / 2) < 0.6) continue;
    const rank = o => (o.a.id.startsWith('pa@') ? 4 : 0) + (o.a.sp ? 2 : 0);
    const loser = rank(B) > rank(A) ? A : B;
    meta[loser.a.id].drop = true;
    dupes++;
    if (loser === A) break;
  }
}

// ---------------------------------------------------------------- отметки
const tindex = JSON.parse(readFileSync(DIR + 'terrain/index.json', 'utf8'));
const coarse = readFileSync(DIR + 'terrain/' + tindex.coarse.file);
const terrain = Terrain.chunked(tindex, coarse.buffer.slice(coarse.byteOffset, coarse.byteOffset + coarse.byteLength),
  (tx, tz) => { try { const b = readFileSync(`${DIR}terrain/${tx}_${tz}.bin`); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); } catch { return null; } });

// Ровняем поля, корты и дорожки; площадки слипшиеся (дорожка вокруг поля, два
// корта бок о бок) получают ОДНУ отметку, иначе между ними встала бы ступень.
const flatItems = [];
for (const a of areas.values()) {
  const m = meta[a.id];
  if (!m || m.drop) continue;
  const p = ring(a.poly);
  if (Math.abs(areaOf(p)) < 120) continue;
  flatItems.push({ id: a.id, p, bb: bbox(p) });
}
const parent = flatItems.map((_, i) => i);
const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
for (let i = 0; i < flatItems.length; i++)
  for (let j = i + 1; j < flatItems.length; j++) {
    const A = flatItems[i], B = flatItems[j];
    const g = 3;
    if (B.bb[0] > A.bb[2] + g || B.bb[2] < A.bb[0] - g || B.bb[1] > A.bb[3] + g || B.bb[3] < A.bb[1] - g) continue;
    let touch = false;
    for (let k = 0; k < B.p.length && !touch; k += 2) if (inPoly(B.p[k], B.p[k + 1], A.p)) touch = true;
    for (let k = 0; k < A.p.length && !touch; k += 2) if (inPoly(A.p[k], A.p[k + 1], B.p)) touch = true;
    if (touch) parent[find(i)] = find(j);
  }
const groups = new Map();
flatItems.forEach((it, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(it); });

const flats = [];
let steep = 0;
for (const g of groups.values()) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const it of g) { x0 = Math.min(x0, it.bb[0]); z0 = Math.min(z0, it.bb[1]); x1 = Math.max(x1, it.bb[2]); z1 = Math.max(z1, it.bb[3]); }
  await terrain.ensureRect(x0 - 20, z0 - 20, x1 + 20, z1 + 20);
  const hs = [];
  for (const it of g) {
    const s = samples(it.p, 3);
    for (let k = 0; k < s.length; k += 2) hs.push(terrain.heightAt(s[k], s[k + 1]));
  }
  if (hs.length < 4) continue;
  hs.sort((a, b) => a - b);
  const q = f => hs[Math.min(hs.length - 1, Math.floor(hs.length * f))];
  // На крутом склоне площадку не ровняем: срез в десять метров под кортом —
  // это уже не подсыпка, а карьер. Пусть лежит по рельефу.
  if (q(0.9) - q(0.1) > 9 || q(0.5) < 0.6) { steep++; continue; }
  const h = Math.round(q(0.5) * 100) / 100;
  for (const it of g) flats.push({ id: it.id, poly: it.p, h });
}

// ---------------------------------------------------------------- трибуны из OSM
// building=grandstand в чанках приходит как t: 'grandstand' и рисовался
// обычным домом с окнами и черепичной крышей. Ставим вместо него трибуну по
// его же контуру: передняя кромка — длинная сторона, обращённая к ближайшему
// полю, ряды поднимаются от неё назад.
const autoStands = [], autoSkip = [];
{
  const fields = [];
  for (const a of areas.values()) {
    const m = meta[a.id];
    if (!m || m.drop || !['football', 'track', 'multi'].includes(m.as)) continue;
    const p = ring(a.poly);
    let cx = 0, cz = 0;
    for (let i = 0; i < p.length; i += 2) { cx += p[i]; cz += p[i + 1]; }
    fields.push([cx / (p.length / 2), cz / (p.length / 2)]);
  }
  const seenB = new Set();
  for (const f of readdirSync(DIR + 'chunks')) {
    if (!/^-?\d+_-?\d+\.json$/.test(f)) continue;
    const d = JSON.parse(readFileSync(DIR + 'chunks/' + f, 'utf8'));
    for (const b of d.buildings || []) {
      if (b.t !== 'grandstand' || seenB.has(b.id)) continue;
      seenB.add(b.id);
      const p = ring(b.poly);
      const o = obb(p);
      if (!o) continue;
      const cu = (o.u0 + o.u1) / 2, cv = (o.v0 + o.v1) / 2;
      const cx = cu * o.ux - cv * o.uz, cz = cu * o.uz + cv * o.ux;
      let best = null, bd = 140;
      for (const [fx, fz] of fields) { const dd = Math.hypot(fx - cx, fz - cz); if (dd < bd) { bd = dd; best = [fx, fz]; } }
      if (!best) continue;
      // длинная ось рамки и две длинные стороны
      const W = o.u1 - o.u0, Lr = o.v1 - o.v0;
      const at = (u, v) => [u * o.ux - v * o.uz, u * o.uz + v * o.ux];
      let sides, depth;
      if (W >= Lr) { sides = [[at(o.u0, o.v0), at(o.u1, o.v0)], [at(o.u0, o.v1), at(o.u1, o.v1)]]; depth = Lr; }
      else { sides = [[at(o.u0, o.v0), at(o.u0, o.v1)], [at(o.u1, o.v0), at(o.u1, o.v1)]]; depth = W; }
      const dist = s => Math.hypot((s[0][0] + s[1][0]) / 2 - best[0], (s[0][1] + s[1][1]) / 2 - best[1]);
      const front = dist(sides[0]) < dist(sides[1]) ? sides[0] : sides[1];
      autoStands.push({
        name: 'трибуна ' + b.id, front: [R1(front[0][0]), R1(front[0][1]), R1(front[1][0]), R1(front[1][1])],
        aim: [R1(best[0]), R1(best[1])], depth: R1(depth),
        rows: Math.max(4, Math.min(20, Math.round((depth - 2.2) / 0.85))),
        roof: depth >= 8, from: b.id,
      });
      autoSkip.push(b.id);
    }
  }
}
const handFrom = new Set((hand.stands || []).map(s => s.from).filter(Boolean));

const out = {
  v: 1,
  flats,
  areas: meta,
  stands: [...(hand.stands || []), ...autoStands.filter(s => !handFrom.has(s.from))],
  masts: hand.masts || [],
  hideLandmarks: hand.hideLandmarks || [],
  skip: [...new Set([...(hand.skip || []), ...autoSkip])],
};
writeFileSync(DIR + 'sport.json', JSON.stringify(out));
const cls = {};
for (const m of Object.values(meta)) if (!m.drop) cls[m.as] = (cls[m.as] || 0) + 1;
console.log(`площадок ${Object.keys(meta).length}: ` + Object.entries(cls).map(([k, v]) => k + ' ' + v).join(', '));
console.log(`дублей ${dupes}, ровных ${flats.length} (групп ${groups.size}, крутых без выравнивания ${steep})`);
console.log(`трибун ${out.stands.length}, мачт ${out.masts.length}, домов на снос ${out.skip.length}`);
