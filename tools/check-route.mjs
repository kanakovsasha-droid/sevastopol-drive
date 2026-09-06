// Можно ли реально доехать? Приёмка дорожной сети.
//
// Карта, собранная из плиток и нарезанная на чанки, легко разваливается там,
// где этого не видно глазами: дорога обрывается на шве плитки Overpass, кусок
// коридора не доехал, ЮБК держится на одном мосту, который отфильтровался по
// тегу. Проверяется это только одним способом — построить граф и поискать путь.
//
//   node tools/check-route.mjs             # по data/world.json
//   node tools/check-route.mjs --chunks    # по нарезке data/chunks
//
// Код возврата ненулевой, если хоть один обязательный маршрут не проходит.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { project } from './config.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const useChunks = process.argv.includes('--chunks');

// Куда обязаны быть дороги. Координаты — из OSM, не на глаз: первым заходом
// я подписал именем «мыс Херсонес» городище Херсонес Таврический, а это разные
// места в семи километрах друг от друга.
const TARGETS = [
  ['площадь Нахимова',  44.6166, 33.5254],
  ['Северная сторона',  44.6389, 33.5364],
  ['Инкерман',          44.6156, 33.6089],
  ['Балаклава',         44.5028, 33.5997],
  ['Херсонес городище', 44.6117, 33.4930],
  ['мыс Херсонес',      44.5872, 33.3809],
  ['Форос',             44.3986, 33.7889],
  ['Симеиз',            44.4056, 34.0003],
  ['Алупка',            44.4189, 34.0489],
  ['Ялта',              44.4952, 34.1663],
];

// Узел графа — точка дороги, округлённая до сетки. Допуск нужен: у соседних
// way общая вершина совпадает до знака, но после проекции и записи в JSON
// последний разряд гуляет, и строгое сравнение рвёт сеть на ровном месте.
const SNAP = 4;                       // метры
const key = (x, z) => Math.round(x / SNAP) + ',' + Math.round(z / SNAP);

function loadRoads() {
  if (!useChunks) {
    const w = JSON.parse(readFileSync(ROOT + 'data/world.json', 'utf8'));
    return w.roads;
  }
  const dir = ROOT + 'data/chunks/';
  const idx = JSON.parse(readFileSync(dir + 'index.json', 'utf8'));
  const seen = new Set(), roads = [];
  for (const c of idx.chunks) {
    const f = dir + c.cx + '_' + c.cz + '.json';
    if (!existsSync(f)) continue;
    for (const r of JSON.parse(readFileSync(f, 'utf8')).roads || []) {
      // дорога лежит в каждом чанке, который пересекает — берём один раз
      if (r.id && seen.has(r.id)) continue;
      if (r.id) seen.add(r.id);
      roads.push(r);
    }
  }
  return roads;
}

function buildGraph(roads) {
  const adj = new Map();
  const link = (a, b, d) => {
    let s = adj.get(a);
    if (!s) adj.set(a, s = []);
    s.push([b, d]);
  };
  let segments = 0;
  for (const r of roads) {
    const p = r.pts;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3];
      const ka = key(ax, az), kb = key(bx, bz);
      if (ka === kb) continue;
      const d = Math.hypot(bx - ax, bz - az);
      link(ka, kb, d); link(kb, ka, d);
      segments++;
    }
  }
  return { adj, segments };
}

// Узлы графа рядом с точкой. Возвращаем НЕ один ближайший, а всех кандидатов
// в радиусе: у цели часто стоит обрывок сети в пару сотен узлов — тупик во
// дворе, кусок отдельной парковки, — и проверка по одному ближайшему узлу
// объявляла «сеть разорвана» там, где до города метров двести и он достижим.
// На Инкермане я на это попался.
function nodesNear(adj, x, z, radius = 400) {
  const CELL = 200;
  if (!nodesNear.grid || nodesNear.grid.adj !== adj) {
    const g = new Map();
    for (const k of adj.keys()) {
      const [a, b] = k.split(',').map(Number);
      const gk = Math.floor(a * SNAP / CELL) + ',' + Math.floor(b * SNAP / CELL);
      let arr = g.get(gk);
      if (!arr) g.set(gk, arr = []);
      arr.push([k, a * SNAP, b * SNAP]);
    }
    nodesNear.grid = { adj, g };
  }
  const { g } = nodesNear.grid;
  const R = Math.ceil(radius / CELL);
  const gx = Math.floor(x / CELL), gz = Math.floor(z / CELL);
  const out = [];
  for (let i = -R; i <= R; i++) {
    for (let j = -R; j <= R; j++) {
      const arr = g.get((gx + i) + ',' + (gz + j));
      if (!arr) continue;
      for (const [k, px, pz] of arr) {
        const d = Math.hypot(px - x, pz - z);
        if (d <= radius) out.push([k, d]);
      }
    }
  }
  return out.sort((a, b) => a[1] - b[1]);
}

// Дейкстра. A* тут не нужен: граф укладывается в память, а запусков единицы.
function shortestPath(adj, from, targets) {
  const goal = targets instanceof Set ? targets : new Set([targets]);
  const dist = new Map([[from, 0]]);
  const heap = [[0, from]];
  const pop = () => {
    let bi = 0;
    for (let i = 1; i < heap.length; i++) if (heap[i][0] < heap[bi][0]) bi = i;
    return heap.splice(bi, 1)[0];
  };
  while (heap.length) {
    const [d, node] = pop();
    if (goal.has(node)) return d;
    if (d > (dist.get(node) ?? Infinity)) continue;
    for (const [nb, w] of adj.get(node) || []) {
      const nd = d + w;
      if (nd < (dist.get(nb) ?? Infinity)) { dist.set(nb, nd); heap.push([nd, nb]); }
    }
  }
  return Infinity;
}

// Размер связных кусков сети: если крупнейший держит меньше 90% узлов,
// карта распалась на острова, даже когда контрольные маршруты прошли.
function components(adj) {
  const seen = new Set(), sizes = [];
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    let n = 0;
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const v = stack.pop(); n++;
      for (const [nb] of adj.get(v) || []) if (!seen.has(nb)) { seen.add(nb); stack.push(nb); }
    }
    sizes.push(n);
  }
  return sizes.sort((a, b) => b - a);
}

const roads = loadRoads();
const { adj, segments } = buildGraph(roads);
console.log(`источник: ${useChunks ? 'нарезка data/chunks' : 'data/world.json'}`);
console.log(`дорог ${roads.length.toLocaleString('ru')}, отрезков ${segments.toLocaleString('ru')}, узлов ${adj.size.toLocaleString('ru')}`);

const comp = components(adj);
const big = comp[0] / adj.size;
console.log(`связных кусков ${comp.length}, крупнейший держит ${(big * 100).toFixed(1)}% узлов`
  + (comp.length > 1 ? ` (следующие: ${comp.slice(1, 5).join(', ')})` : ''));

const start = TARGETS[0];
const sp = project(start[1], start[2]);
const startCands = nodesNear(adj, sp.x, sp.z, 200);
if (!startCands.length) { console.error('НЕ НАЙДЕН стартовый узел у площади Нахимова'); process.exit(1); }
const [startNode, sd] = startCands[0];
console.log(`старт: ${start[0]}, ближайшая дорога в ${sd.toFixed(0)} м\n`);

let bad = 0;
for (const [name, lat, lon] of TARGETS.slice(1)) {
  const p = project(lat, lon);
  const cands = nodesNear(adj, p.x, p.z, 500);
  if (!cands.length) { console.log(`  ✗ ${name.padEnd(18)} дорог рядом нет вообще`); bad++; continue; }
  const len = shortestPath(adj, startNode, new Set(cands.map(c => c[0])));
  const air = Math.hypot(p.x - sp.x, p.z - sp.z);
  if (!isFinite(len)) {
    console.log(`  ✗ ${name.padEnd(18)} дороги есть (${cands.length} узлов в 500 м), но пути нет — сеть разорвана`);
    bad++; continue;
  }
  const detour = len / air;
  const flag = detour > 2.6 ? '?' : '✓';
  if (flag === '?') bad++;
  console.log(`  ${flag} ${name.padEnd(18)} ${(len / 1000).toFixed(1).padStart(5)} км по дорогам`
    + ` (напрямую ${(air / 1000).toFixed(1)} км, крюк ×${detour.toFixed(2)})`);
}

console.log(bad ? `\nпровалов: ${bad}` : '\nвсе маршруты проходят');
process.exit(bad ? 1 : 0);
