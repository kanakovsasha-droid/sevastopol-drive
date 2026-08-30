// Контур здания из OSM в местных метрах: рёбра с длинами и азимутами.
// Нужен, чтобы задавать главный фасад ОТРЕЗКОМ, а не на глаз.
// Запуск: node tools/contour.mjs <wayId | x z радиус>
import { readFileSync } from 'node:fs';
import { project } from './config.mjs';
const raw = JSON.parse(readFileSync(new URL('../data/osm-raw.json', import.meta.url).pathname, 'utf8'));
const nodes = new Map();
for (const e of raw.elements) if (e.type === 'node') nodes.set(e.id, e);
const pts = w => (w.nodes || []).map(i => nodes.get(i)).filter(Boolean).map(n => project(n.lat, n.lon));
const area = p => { let a = 0; for (let i = 0; i < p.length; i++) { const j = (i + 1) % p.length; a += p[i].x * p[j].z - p[j].x * p[i].z; } return Math.abs(a) / 2; };
const cen = p => { let x = 0, z = 0; for (const q of p) { x += q.x; z += q.z; } return { x: x / p.length, z: z / p.length }; };
const [a1, a2, a3] = process.argv.slice(2);
if (a2 === undefined) {
  const id = Number(a1);
  const w = raw.elements.find(e => e.type === 'way' && e.id === id);
  if (!w) { console.log('нет такого way'); process.exit(1); }
  const p = pts(w), c = cen(p);
  console.log('way', id, JSON.stringify(w.tags));
  console.log('площадь', Math.round(area(p)), 'м²  центр', c.x.toFixed(1), c.z.toFixed(1));
  for (let i = 0; i < p.length - 1; i++) {
    const A = p[i], B = p[i + 1];
    const L = Math.hypot(B.x - A.x, B.z - A.z);
    if (L < 0.2) continue;
    // наружная нормаль: от центра контура
    let nx = -(B.z - A.z) / L, nz = (B.x - A.x) / L;
    const mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2;
    if (nx * (c.x - mx) + nz * (c.z - mz) > 0) { nx = -nx; nz = -nz; }
    const dir = Math.abs(nz) > Math.abs(nx) ? (nz < 0 ? 'на север' : 'на юг') : (nx > 0 ? 'на восток' : 'на запад');
    console.log(`  ребро ${i}: [${A.x.toFixed(1)}, ${A.z.toFixed(1)}, ${B.x.toFixed(1)}, ${B.z.toFixed(1)}]  длина ${L.toFixed(1)} м  смотрит ${dir}`);
  }
} else {
  const [x, z, r] = [Number(a1), Number(a2), Number(a3 || 80)];
  for (const e of raw.elements) {
    if (e.type !== 'way' || !e.tags?.building) continue;
    const p = pts(e); if (p.length < 3) continue;
    const c = cen(p); if (Math.hypot(c.x - x, c.z - z) > r) continue;
    console.log(e.id, Math.round(area(p)) + 'м²', `c(${c.x.toFixed(0)},${c.z.toFixed(0)})`, JSON.stringify(e.tags).slice(0, 160));
  }
}
