// ДОРОГИ ПЕРВИЧНЫ: отметки улиц центра по графу улиц, а не по рельефу.
//
// Рельеф у нас — модель ПОВЕРХНОСТИ (SRTM/Copernicus, 30 м): крыши и кроны
// входят в неё, и профиль улицы, снятый с неё и сглаженный, всё равно
// ходил буграми, ступенями на стыках и перекосами на перекрёстках. В центре
// (квадрат 3×3 км) делаем наоборот: сначала считаем отметки дорог как
// инженер — по графу улиц, с ограничением уклона и одной отметкой на узел, —
// а землю потом подгоняем к ним (коридор в buildTerrainTile делает это сам).
//
//   1. Граф: осевые проезжих улиц (класс ≤ 3, без мостов и тоннелей),
//      уплотнённые до шага 8 м. Общие узлы OSM — общие вершины; все узлы
//      внутри пятна небольшого перекрёстка — ОДНА вершина (одна отметка).
//      Две проезжие части одной магистрали связываются поперечными рёбрами.
//   2. Земля в вершине — робастно: 25-й процентиль высот в круге 14 м,
//      без точек внутри домов (крыши) — так срезаются кроны и кровли.
//   3. Решатель: экранированное сглаживание по графу (данные с весом,
//      растущим при уходе от земли больше чем на 2 м) чередуется с
//      проекцией на ограничение уклона ребра: магистраль ≤ 6%, улица ≤ 9%,
//      а там, где сам склон (сглаженный на ~70 м) круче, — по склону, но не
//      круче 18%.
//   4. На выходе — для каждой улицы отметки по длине (шаг 8 м), рантайм
//      (roadProfile в worldgen.js) берёт профиль отсюда и плавно сводит его
//      к прежнему на 200 м за краем квадрата.
//
//   node tools/build-road-levels.mjs        → data/road-levels.json
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const BOX = { x0: -1800, x1: 1200, z0: -300, z1: 2700 };
const MARGIN = 320;                      // считаем и с запасом за краем
const STEP = 8;
const RAD = Math.PI / 180;

// ---------------------------------------------------------------- рельеф
const TI = JSON.parse(readFileSync(ROOT + 'data/terrain/index.json'));
const meta = TI.meta, D = TI.detail, unit = D.unit ?? 0.1;
const n2 = 2 ** D.zoom * D.tileSize;
const tiles = new Map();
for (const e of TI.chunks) tiles.set(e.tx + '_' + e.tz, { ...e, ox: e.px0 - D.px0, oy: e.py0 - D.py0, data: undefined });
const pix = (x, z) => {
  const lat = meta.origin.lat - z / meta.scale.mPerDegLat, r = lat * RAD;
  const mLon = 111412.84 * Math.cos(r) - 93.5 * Math.cos(3 * r);
  const lon = meta.origin.lon + x / mLon;
  return [(lon + 180) / 360 * n2 - D.px0, (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n2 - D.py0];
};
const raw = (x, z) => {
  const t = tiles.get(Math.floor(x / TI.chunk) + '_' + Math.floor(z / TI.chunk));
  if (!t) return null;
  if (t.data === undefined) {
    try { const b = readFileSync(`${ROOT}data/terrain/${t.tx}_${t.tz}.bin`); t.data = new Int16Array(b.buffer, b.byteOffset, b.length / 2); }
    catch { t.data = null; }
  }
  if (!t.data) return null;
  const [px, py] = pix(x, z), lx = px - t.ox, ly = py - t.oy;
  const x0 = Math.floor(lx), y0 = Math.floor(ly);
  if (x0 < 0 || y0 < 0 || x0 >= t.w - 1 || y0 >= t.h - 1) return null;
  const fx = lx - x0, fy = ly - y0, h = t.data, W = t.w, i = y0 * W + x0;
  return ((h[i] * (1 - fx) + h[i + 1] * fx) * (1 - fy) + (h[i + W] * (1 - fx) + h[i + W + 1] * fx) * fy) * unit;
};

// ---------------------------------------------------------------- данные
const idx = JSON.parse(readFileSync(ROOT + 'data/chunks/index.json'));
const roads = new Map(), bld = new Map(), juncs = new Map();
const X0 = BOX.x0 - MARGIN, X1 = BOX.x1 + MARGIN, Z0 = BOX.z0 - MARGIN, Z1 = BOX.z1 + MARGIN;
for (const c of idx.chunks) {
  if ((c.cx + 1) * 1024 < X0 - 200 || c.cx * 1024 > X1 + 200 || (c.cz + 1) * 1024 < Z0 - 200 || c.cz * 1024 > Z1 + 200) continue;
  let d; try { d = JSON.parse(readFileSync(`${ROOT}data/chunks/${c.cx}_${c.cz}.json`)); } catch { continue; }
  for (const r of d.roads || []) if (!roads.has(r.id)) roads.set(r.id, r);
  for (const b of d.buildings || []) if (!bld.has(b.id)) bld.set(b.id, b);
  for (const j of d.junctions || []) if (!juncs.has(j.id)) juncs.set(j.id, j);
}
const inPoly = (x, z, p) => {
  let c = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], zi = p[i + 1], xj = p[j], zj = p[j + 1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
  }
  return c;
};
// сетка домов
const BG = 40, bgrid = new Map();
for (const b of bld.values()) {
  const p = b.poly; let a = Infinity, bz = Infinity, c = -Infinity, dz = -Infinity;
  for (let i = 0; i < p.length; i += 2) { a = Math.min(a, p[i]); c = Math.max(c, p[i]); bz = Math.min(bz, p[i + 1]); dz = Math.max(dz, p[i + 1]); }
  if (c < X0 - 50 || a > X1 + 50 || dz < Z0 - 50 || bz > Z1 + 50) continue;
  b.bb = [a, bz, c, dz];
  for (let i = Math.floor(a / BG); i <= Math.floor(c / BG); i++)
    for (let j = Math.floor(bz / BG); j <= Math.floor(dz / BG); j++) {
      const k = i * 100003 + j; let l = bgrid.get(k); if (!l) bgrid.set(k, l = []); l.push(b);
    }
}
const inHouse = (x, z) => {
  const l = bgrid.get(Math.floor(x / BG) * 100003 + Math.floor(z / BG));
  if (l) for (const b of l) {
    const q = b.bb; if (x < q[0] || x > q[2] || z < q[1] || z > q[3]) continue;
    if (inPoly(x, z, b.poly)) return true;
  }
  return false;
};
// Земля в точке: 25-й процентиль в круге 14 м мимо домов.
const ground = (x, z) => {
  for (const R of [14, 26]) {
    const hs = [];
    for (let dx = -R; dx <= R; dx += 3.5)
      for (let dz = -R; dz <= R; dz += 3.5) {
        if (dx * dx + dz * dz > R * R) continue;
        const px = x + dx, pz = z + dz;
        if (inHouse(px, pz)) continue;
        const h = raw(px, pz); if (h !== null) hs.push(h);
      }
    if (hs.length >= 8) { hs.sort((a, b) => a - b); return Math.max(0.6, hs[Math.floor(hs.length * 0.25)]); }
  }
  const h = raw(x, z); return h === null ? null : Math.max(0.6, h);
};

// ---------------------------------------------------------------- граф
const use = [...roads.values()].filter(r => r.c <= 3 && !r.br && !r.tn && r.pts.length >= 4 && r.pts.some((v, i) =>
  i % 2 === 0 && v > X0 && v < X1 && r.pts[i + 1] > Z0 && r.pts[i + 1] < Z1));
// небольшие перекрёстки — одна вершина
const JC = 30, jgrid = new Map();
for (const j of juncs.values()) {
  if (j.r > 16) continue;
  const k = Math.floor(j.x / JC) * 100003 + Math.floor(j.z / JC);
  let l = jgrid.get(k); if (!l) jgrid.set(k, l = []); l.push(j);
}
const junctionOf = (x, z) => {
  for (let i = Math.floor(x / JC) - 1; i <= Math.floor(x / JC) + 1; i++)
    for (let jj = Math.floor(z / JC) - 1; jj <= Math.floor(z / JC) + 1; jj++)
      for (const j of jgrid.get(i * 100003 + jj) || []) {
        if (j.poly ? inPoly(x, z, j.poly) : Math.hypot(x - j.x, z - j.z) < j.r) return j.id;
      }
  return null;
};
const nodeId = new Map(), NX = [], NZ = [], NC = [];
const node = (x, z, osm) => {
  let key = null;
  if (osm) { const jid = junctionOf(x, z); key = jid ? 'J' + jid : 'P' + Math.round(x * 2) + ',' + Math.round(z * 2); }
  if (key && nodeId.has(key)) { const id = nodeId.get(key); NX[id] += x; NZ[id] += z; NC[id]++; return id; }
  const id = NX.length; NX.push(x); NZ.push(z); NC.push(1);
  if (key) nodeId.set(key, id);
  return id;
};
const edges = [];        // [a, b, len, base, kind]  kind 0 — вдоль улицы, 1 — между проезжими частями
const chains = [];       // по улице: вершины и длины дуги
for (const r of use) {
  const p = r.pts, ids = [], ss = [];
  let s = 0, prev = null;
  for (let k = 0; k < p.length / 2; k++) {
    const x = p[k * 2], z = p[k * 2 + 1];
    if (k > 0) {
      const px = p[k * 2 - 2], pz = p[k * 2 - 1], L = Math.hypot(x - px, z - pz);
      const m = Math.max(1, Math.ceil(L / STEP));
      for (let q = 1; q < m; q++) {
        const id = node(px + (x - px) * q / m, pz + (z - pz) * q / m, false);
        ids.push(id); ss.push(s + L * q / m);
      }
      s += L;
    }
    ids.push(node(x, z, true)); ss.push(s);
  }
  const base = r.c <= 1 && r.w >= 10 ? 0.06 : 0.09;
  for (let k = 1; k < ids.length; k++) if (ids[k] !== ids[k - 1]) edges.push([ids[k - 1], ids[k], Math.max(0.5, ss[k] - ss[k - 1]), base, 0]);
  chains.push({ r, ids, ss });
}
const N = NX.length;
for (let i = 0; i < N; i++) { NX[i] /= NC[i]; NZ[i] /= NC[i]; }
// две проезжие части магистрали: поперечные связи
{
  const G = 12, g = new Map();
  chains.forEach((c, ci) => { if (c.r.c > 1 || c.r.w < 7) return;
    for (const id of c.ids) { const k = Math.floor(NX[id] / G) * 100003 + Math.floor(NZ[id] / G); let l = g.get(k); if (!l) g.set(k, l = []); l.push(ci, id); } });
  const seen = new Set();
  chains.forEach((c, ci) => {
    if (c.r.c > 1 || c.r.w < 7) return;
    for (const id of c.ids) {
      let best = -1, bd = Infinity;
      for (let i = Math.floor(NX[id] / G) - 2; i <= Math.floor(NX[id] / G) + 2; i++)
        for (let j = Math.floor(NZ[id] / G) - 2; j <= Math.floor(NZ[id] / G) + 2; j++) {
          const l = g.get(i * 100003 + j); if (!l) continue;
          for (let t = 0; t < l.length; t += 2) {
            const o = chains[l[t]]; if (l[t] === ci || o.r === c.r) continue;
            const d = Math.hypot(NX[l[t + 1]] - NX[id], NZ[l[t + 1]] - NZ[id]);
            if (d < bd && d > 4 && d < (c.r.w + o.r.w) / 2 + 6) { bd = d; best = l[t + 1]; }
          }
        }
      if (best < 0) continue;
      const k = Math.min(id, best) + ',' + Math.max(id, best);
      if (seen.has(k)) continue; seen.add(k);
      edges.push([id, best, bd, 0.02, 1]);      // проезжие части почти на одной отметке
    }
  });
}
console.log(`улиц ${use.length}, вершин ${N}, рёбер ${edges.length}`);

// ---------------------------------------------------------------- земля
const G0 = new Float32Array(N);
for (let i = 0; i < N; i++) { const g = ground(NX[i], NZ[i]); G0[i] = g === null ? 1 : g; }
console.log('земля посчитана');
// соседи
const nb = Array.from({ length: N }, () => []);
for (const [a, b, len, , kind] of edges) { nb[a].push(b, kind ? 1 : 1); nb[b].push(a, kind ? 1 : 1); }
// склон, сглаженный на ~70 м: по нему решаем, где улица и правда крутая
const GS = Float32Array.from(G0), T = new Float32Array(N);
for (let it = 0; it < 70; it++) {
  for (let i = 0; i < N; i++) { let s = GS[i] * 2, w = 2; const l = nb[i]; for (let k = 0; k < l.length; k += 2) { s += GS[l[k]]; w++; } T[i] = s / w; }
  GS.set(T);
}
for (const e of edges) {
  if (e[4]) continue;
  const slope = Math.abs(GS[e[0]] - GS[e[1]]) / e[2];
  e[3] = Math.min(0.18, Math.max(e[3], slope * 1.15 + 0.01));
}

// ---------------------------------------------------------------- решатель
const Hh = Float32Array.from(G0);
const WD = 0.035;
const project = () => {
  for (let pass = 0; pass < 3; pass++)
    for (const [a, b, len, g] of edges) {
      const d = Hh[a] - Hh[b], lim = g * len;
      if (d > lim) { const ex = (d - lim) / 2; Hh[a] -= ex; Hh[b] += ex; }
      else if (d < -lim) { const ex = (-d - lim) / 2; Hh[a] += ex; Hh[b] -= ex; }
    }
};
for (let it = 0; it < 900; it++) {
  for (let i = 0; i < N; i++) {
    const dev = (Hh[i] - G0[i]) / 2;
    const wd = WD * (1 + dev * dev);
    let s = 0, w = 0; const l = nb[i];
    for (let k = 0; k < l.length; k += 2) { s += Hh[l[k]]; w += 1; }
    T[i] = w ? (wd * G0[i] + s) / (wd + w) : G0[i];
  }
  // Якоби с релаксацией
  for (let i = 0; i < N; i++) Hh[i] = Hh[i] * 0.3 + T[i] * 0.7;
  if (it % 3 === 0) project();
}
for (let k = 0; k < 40; k++) project();
// итог: отклонение от земли и уклоны
{
  let maxDev = 0, over = 0;
  for (let i = 0; i < N; i++) { const d = Math.abs(Hh[i] - G0[i]); if (d > maxDev) maxDev = d; if (d > 2) over++; }
  let gmax = 0, bad = 0, ex = [];
  for (const [a, b, len, g, kind] of edges) { const gr = Math.abs(Hh[a] - Hh[b]) / len; gmax = Math.max(gmax, gr); if (gr > g + 0.01) { bad++; if (ex.length < 6) ex.push([NX[a].toFixed(0), NZ[a].toFixed(0), (gr * 100).toFixed(0) + '%', (g * 100).toFixed(0) + '%', len.toFixed(1), kind].join(' ')); } }
  console.log('рёбер круче своего предела', bad, ex.join(' | '));
  console.log(`отклонение от земли: макс ${maxDev.toFixed(2)} м, больше 2 м — ${over} из ${N}; уклон макс ${(gmax * 100).toFixed(1)}%`);
}

// ---------------------------------------------------------------- выход
const out = { _: 'Отметки улиц центра по графу (tools/build-road-levels.mjs). s — метры от начала осевой, h — отметка.',
  box: BOX, ramp: 200, roads: {} };
for (const c of chains) {
  const s = [], h = [];
  for (let k = 0; k < c.ids.length; k++) { s.push(Math.round(c.ss[k] * 10) / 10); h.push(Math.round(Hh[c.ids[k]] * 100) / 100); }
  out.roads[c.r.id] = { s, h };
}
writeFileSync(ROOT + 'data/road-levels.json', JSON.stringify(out));
console.log('записано data/road-levels.json', (JSON.stringify(out).length / 1e6).toFixed(2), 'МБ');
