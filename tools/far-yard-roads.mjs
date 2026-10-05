// Дворовые проезды центра — в дальний слой (data/chunks/far.json).
//   node tools/far-yard-roads.mjs
//
// Зачем. Коридор земли под дорогами (roadCorridorGen в buildTerrainTile)
// строится по улицам ДАЛЬНЕГО слоя — он одинаков у соседних квадратов, и шов
// не расходится. Но в far.json лежат только улицы классов 0–2: дворовые и
// служебные проезды (класс 3, ширина 4 м) в коридор не попадали вовсе. Под
// ними колесо ехало по сырому рельефу — с крышами, срезанными «открытием», и
// площадками домов: горбы и ступени до 25–40% на четырёх метрах (замер
// tools/check-road-profile.mjs: −311, 466 у Большой Морской; 408, 2088). Хотя
// отметки для этих проездов решатель считает (build-road-levels.mjs, класс ≤ 3),
// применить их было не к чему.
//
// Берём проезды класса 3 (без мостов и тоннелей) из чанков, задевающих
// квадрат отметок (road-levels.json, box + 320 м), и дописываем в far.json те,
// которых там ещё нет. Куски одной улицы из соседних чанков («id:0», «id:1»)
// склеиваем по стыку, как в build-road-levels. Повторный запуск ничего не
// дублирует.
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const FAR = ROOT + 'data/chunks/far.json';
const far = JSON.parse(readFileSync(FAR, 'utf8'));
const lv = JSON.parse(readFileSync(ROOT + 'data/road-levels.json', 'utf8'));
const M = 320, B = lv.box;
const X0 = B.x0 - M, X1 = B.x1 + M, Z0 = B.z0 - M, Z1 = B.z1 + M;
const have = new Set(far.roads.map(r => r.id.split(':')[0]));

const idx = JSON.parse(readFileSync(ROOT + 'data/chunks/index.json', 'utf8'));
const parts = new Map();          // базовый id → [{ k, r }]
for (const c of idx.chunks) {
  if ((c.cx + 1) * 1024 < X0 || c.cx * 1024 > X1 || (c.cz + 1) * 1024 < Z0 || c.cz * 1024 > Z1) continue;
  let d; try { d = JSON.parse(readFileSync(`${ROOT}data/chunks/${c.cx}_${c.cz}.json`, 'utf8')); } catch { continue; }
  for (const r of d.roads || []) {
    if (r.c !== 3 || r.br || r.tn || !r.pts || r.pts.length < 4) continue;
    const p = r.pts;
    let inside = false;
    for (let i = 0; i < p.length && !inside; i += 2) inside = p[i] > X0 && p[i] < X1 && p[i + 1] > Z0 && p[i + 1] < Z1;
    if (!inside) continue;
    const m = /^(.*):(\d+)$/.exec(r.id), base = m ? m[1] : r.id, k = m ? +m[2] : -1;
    if (have.has(base)) continue;
    const l = parts.get(base) || parts.set(base, []).get(base);
    if (!l.some(q => q.k === k)) l.push({ k, r });
  }
}
let added = 0, pts = 0;
for (const [base, l] of parts) {
  l.sort((a, b) => a.k - b.k);
  // склеиваем куски по стыку; не сходятся — пишем по отдельности с их id
  const glued = [];
  let cur = null;
  for (const { r } of l) {
    const p = r.pts;
    if (cur && Math.hypot(p[0] - cur.pts[cur.pts.length - 2], p[1] - cur.pts[cur.pts.length - 1]) < 0.5) {
      cur.pts = cur.pts.concat(p.slice(2));
    } else {
      cur = { ...r, id: l.length > 1 ? r.id : base, pts: p.slice() };
      glued.push(cur);
    }
  }
  if (glued.length === 1) glued[0].id = base;
  for (const g of glued) { far.roads.push(g); added++; pts += g.pts.length / 2; }
}
writeFileSync(FAR, JSON.stringify(far));
console.log(`дописано проездов ${added}, точек ${pts}; улиц в far.json теперь ${far.roads.length}`);
