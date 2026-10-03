// Террасы под скверами, парками и площадями: data/terraces.json.
//
// Рельеф — модель поверхности, и на склонах она не знает, что сквер у
// библиотеки Толстого или Матросский бульвар — ровные площадки на подпорных
// стенках. Квадрат земли выравнивает такие места (web/js/platforms.js,
// terracesGen), но строится он из far-слоя, где мелкой зелени нет, и раньше,
// чем приедет чанк города. Поэтому контуры собираем заранее в маленький файл:
//   * парки и скверы — зелень вида park из data/chunks (leisure=park/garden);
//   * площади (place=square) и пешеходные площади (highway=pedestrian, замкнутые)
//     — из data/osm-raw.json, в чанки они не попадают.
//
//   node tools/build-terraces.mjs
//
// Формат: { v, items: [{ id, k: 'park'|'square', poly: [x,z,…] (0.5 м), a: м² }] }

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { project } from './config.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const area = p => {
  let a = 0;
  const n = p.length / 2;
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; a += p[i * 2] * p[j * 2 + 1] - p[j * 2] * p[i * 2 + 1]; }
  return Math.abs(a) / 2;
};
const round = p => p.map(v => Math.round(v * 2) / 2);
const MIN_AREA = 250;           // клумбы и газончики у подъезда не террасируем

const items = new Map();
const put = (id, k, poly) => {
  if (!poly || poly.length < 8) return;
  // замкнутый контур OSM повторяет первую точку — убираем дубль
  const n = poly.length;
  if (poly[0] === poly[n - 2] && poly[1] === poly[n - 1]) poly = poly.slice(0, n - 2);
  const a = area(poly);
  if (a < MIN_AREA) return;
  const prev = items.get(id);
  if (prev && prev.k === 'square') return;      // площадь важнее вида зелени
  items.set(id, { id, k, poly: round(poly), a: Math.round(a) });
};

// ---- парки и скверы из чанков
const dir = ROOT + 'data/chunks/';
const idx = JSON.parse(readFileSync(dir + 'index.json', 'utf8'));
for (const c of idx.chunks) {
  const f = dir + c.cx + '_' + c.cz + '.json';
  if (!existsSync(f)) continue;
  for (const g of JSON.parse(readFileSync(f, 'utf8')).green || [])
    if (g.kind === 'park' && g.id && !items.has(g.id)) put(g.id, 'park', g.poly);
}

// ---- площади и пешеходные зоны из сырого OSM
const raw = JSON.parse(readFileSync(ROOT + 'data/osm-raw.json', 'utf8')).elements;
const nodes = new Map();
for (const e of raw) if (e.type === 'node') nodes.set(e.id, e);
for (const e of raw) {
  if (e.type !== 'way' || !e.tags || !e.nodes) continue;
  const t = e.tags;
  const square = t.place === 'square';
  const ped = (t.highway === 'pedestrian' || t['area:highway'] === 'pedestrian') && e.nodes[0] === e.nodes[e.nodes.length - 1];
  if (!square && !ped) continue;
  const poly = [];
  for (const id of e.nodes) {
    const n = nodes.get(id);
    if (!n) { poly.length = 0; break; }
    const { x, z } = project(n.lat, n.lon);
    poly.push(x, z);
  }
  put('w' + e.id, 'square', poly);
}

const list = [...items.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
const out = { v: 1, items: list };
writeFileSync(ROOT + 'data/terraces.json', JSON.stringify(out));
const by = {};
for (const it of list) by[it.k] = (by[it.k] || 0) + 1;
console.log(`террас ${list.length}:`, by, `${(JSON.stringify(out).length / 1024).toFixed(0)} КБ`);
