// Заезды на время: маршруты по графу дорог OSM → data/races.json.
//
//   node tools/build-races.mjs            собрать и записать
//   node tools/build-races.mjs --dry      только напечатать, по каким улицам идёт каждый
//
// Маршрут НЕ рисуется на глаз: опорные точки — места из data/poi.json (площади,
// смотровые, памятники), между ними — кратчайший путь по проезжим дорогам
// data/world.json (c ≤ 3, с учётом одностороннего движения). Улицы, по которым
// заезд «должен» идти (Ленина, Большая Морская, Фиолентовское, Южнобережное
// шоссе), получают скидку в цене пути — так кольцо идёт по кольцу, а не
// дворами. По пути — чекпоинты-арки с равным шагом, ширина — по полотну.
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url).pathname;
const DRY = process.argv.includes('--dry');
const W = JSON.parse(readFileSync(ROOT + 'data/world.json', 'utf8'));
const POI = JSON.parse(readFileSync(ROOT + 'data/poi.json', 'utf8'));
const poi = (name, kind) => {
  const p = POI.find(q => q.name === name && (!kind || q.kind === kind));
  if (!p) throw new Error('нет в poi.json: ' + name);
  return [p.x, p.z, name];
};

// Опорные точки — из poi.json по имени; там, где места в списке нет, — точка
// на самой улице (берётся середина её звеньев около указанной, см. onStreet).
const RACES = [
  {
    id: 'center', name: 'Круг по центру',
    note: 'Центральное кольцо: пл. Нахимова → пр. Нахимова → пл. Лазарева → Большая Морская → пл. Ушакова → Ленина',
    loop: true, step: 230,
    prefer: ['улица Ленина', 'Большая Морская улица', 'проспект Нахимова', 'площадь Нахимова', 'площадь Ушакова', 'площадь Лазарева'],
    via: () => [[0, 0, 'площадь Нахимова (начало координат, config.mjs)'], onStreet('проспект Нахимова', -200, 230),
                onStreet('Большая Морская улица', -260, 1000), poi('Ушакова площадь', 'square'), onStreet('улица Ленина', 150, 900)],
  },
  {
    id: 'fiolent', name: 'Фиолентовское шоссе',
    note: 'От начала Фиолентовского шоссе до мыса Фиолент',
    step: 600,
    prefer: ['Фиолентовское шоссе'],
    via: () => [streetEnd('Фиолентовское шоссе', 'near', [0, 0]), poi('Фиолент', 'poi')],
  },
  {
    id: 'balaklava', name: 'В Балаклаву',
    note: 'Пл. Ушакова → Балаклава (администрация района)',
    step: 700,
    prefer: [],
    via: () => [poi('Ушакова площадь', 'square'), poi('Администрация Балаклавского района', 'townhall')],
  },
  {
    id: 'yalta', name: 'Севастополь → Ялта',
    note: 'От развязки «Ялтинское кольцо» по Южнобережному шоссе до Ялты',
    step: 1500,
    prefer: ['Южнобережное шоссе'],
    via: () => [onStreet('Ялтинское кольцо', 5140, 8233), poi('Городам-побратимам Ялты', 'historic')],
  },
];

// ---------------------------------------------------------------- граф
const KEY = (x, z) => Math.round(x * 10) + ',' + Math.round(z * 10);
const nodes = new Map();             // ключ → номер
const NX = [], NZ = [];
const adj = [];                      // номер → [куда, длина, дорога]
const node = (x, z) => {
  const k = KEY(x, z);
  let i = nodes.get(k);
  if (i === undefined) { i = NX.length; nodes.set(k, i); NX.push(x); NZ.push(z); adj.push([]); }
  return i;
};
const ROADS = W.roads.filter(r => r.c <= 3 && r.pts.length >= 4);
for (const r of ROADS) {
  const p = r.pts;
  for (let i = 0; i + 3 < p.length; i += 2) {
    const a = node(p[i], p[i + 1]), b = node(p[i + 2], p[i + 3]);
    if (a === b) continue;
    const len = Math.hypot(p[i + 2] - p[i], p[i + 3] - p[i + 1]);
    adj[a].push(b, len, r);
    if (!r.ow) adj[b].push(a, len, r);
  }
}

const streetPts = name => {
  const out = [];
  for (const r of ROADS) if (r.n === name) for (let i = 0; i < r.pts.length; i += 2) out.push([r.pts[i], r.pts[i + 1]]);
  if (!out.length) throw new Error('нет улицы: ' + name);
  return out;
};
// точка улицы, ближайшая к (x, z) — чтобы выбрать нужную «Ленина» из нескольких
function onStreet(name, x, z) {
  let best = null, bd = Infinity;
  for (const [px, pz] of streetPts(name)) { const d = Math.hypot(px - x, pz - z); if (d < bd) { bd = d; best = [px, pz, name]; } }
  if (bd > 600) throw new Error(`улица ${name} далеко от (${x}, ${z}): ${bd | 0} м`);
  return best;
}
// конец улицы, ближайший к точке — начало шоссе со стороны города
function streetEnd(name, _, [x, z]) {
  let best = null, bd = Infinity;
  for (const r of ROADS) if (r.n === name) for (const i of [0, r.pts.length - 2]) {
    const d = Math.hypot(r.pts[i] - x, r.pts[i + 1] - z);
    if (d < bd) { bd = d; best = [r.pts[i], r.pts[i + 1], name + ' (начало)']; }
  }
  return best;
}

// ближайший узел графа, у которого есть выезд (отсекает тупые обрывки)
function nearestNode(x, z) {
  let bi = -1, bd = Infinity;
  for (let i = 0; i < NX.length; i++) {
    if (adj[i].length < 6) continue;           // хотя бы два ребра — не огрызок
    const d = (NX[i] - x) ** 2 + (NZ[i] - z) ** 2;
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}

// Цена: главные дороги дешевле, дворы дороже; «свои» улицы заезда — вдвое
const CLS = [1, 1.05, 1.25, 1.8];
function route(a, b, prefer) {
  const N = NX.length;
  const dist = new Float64Array(N).fill(Infinity), from = new Int32Array(N).fill(-1);
  const via = new Array(N);
  // двоичная куча
  const hk = [], hv = [];
  const push = (k, v) => {
    hk.push(k); hv.push(v);
    let i = hk.length - 1;
    while (i) { const p = (i - 1) >> 1; if (hk[p] <= hk[i]) break; [hk[p], hk[i]] = [hk[i], hk[p]]; [hv[p], hv[i]] = [hv[i], hv[p]]; i = p; }
  };
  const pop = () => {
    const v = hv[0], k = hk[0];
    const lk = hk.pop(), lv = hv.pop();
    if (hk.length) {
      hk[0] = lk; hv[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < hk.length && hk[l] < hk[m]) m = l;
        if (r < hk.length && hk[r] < hk[m]) m = r;
        if (m === i) break;
        [hk[m], hk[i]] = [hk[i], hk[m]]; [hv[m], hv[i]] = [hv[i], hv[m]]; i = m;
      }
    }
    return [k, v];
  };
  dist[a] = 0; push(0, a);
  while (hk.length) {
    const [d, u] = pop();
    if (d > dist[u]) continue;
    if (u === b) break;
    const e = adj[u];
    for (let j = 0; j < e.length; j += 3) {
      const r = e[j + 2];
      const w = e[j + 1] * CLS[r.c] * (prefer.includes(r.n) ? 0.5 : 1);
      const nd = d + w, v = e[j];
      if (nd < dist[v]) { dist[v] = nd; from[v] = u; via[v] = r; push(nd, v); }
    }
  }
  if (from[b] < 0 && a !== b) return null;
  const path = [];
  for (let v = b; v !== -1; v = from[v]) path.push(v);
  path.reverse();
  return path.map((v, i) => ({ x: NX[v], z: NZ[v], r: via[v] || (path[i + 1] !== undefined ? via[path[i + 1]] : null) }));
}

// ---------------------------------------------------------------- сборка
const out = { _: 'Заезды на время: маршруты — кратчайший путь по дорогам OSM (data/world.json) между местами из data/poi.json; собрано tools/build-races.mjs', src: 'OpenStreetMap, ODbL', races: [] };
for (const R of RACES) {
  const via = R.via();
  if (R.loop) via.push(via[0]);
  let path = [];
  for (let i = 0; i + 1 < via.length; i++) {
    const a = nearestNode(via[i][0], via[i][1]), b = nearestNode(via[i + 1][0], via[i + 1][1]);
    const seg = route(a, b, R.prefer);
    if (!seg) throw new Error(`${R.id}: нет пути ${via[i][2]} → ${via[i + 1][2]}`);
    path = path.concat(path.length ? seg.slice(1) : seg);
  }
  // длины по пути
  const s = [0];
  for (let i = 1; i < path.length; i++) s.push(s[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z));
  const L = s[s.length - 1];
  // какие улицы и сколько по ним
  const streets = [];
  for (let i = 1; i < path.length; i++) {
    const n = path[i].r?.n || '(без имени, c' + path[i].r?.c + ')';
    const d = s[i] - s[i - 1];
    if (streets.length && streets[streets.length - 1][0] === n) streets[streets.length - 1][1] += d; else streets.push([n, d]);
  }
  // чекпоинты: равный шаг, последний — финиш; на кольце финиш = старт
  const nG = Math.max(3, Math.round(L / R.step));
  const at = t => {
    let i = 1; while (i < s.length - 1 && s[i] < t) i++;
    const k = (t - s[i - 1]) / Math.max(1e-6, s[i] - s[i - 1]);
    const a = path[i - 1], b = path[i];
    return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, yaw: Math.atan2(b.x - a.x, b.z - a.z), w: b.r?.w || a.r?.w || 6 };
  };
  const gates = [];
  for (let g = 0; g <= nG; g++) {
    // старт — в 25 м от начала: машину ставим на начало, арку проезжаем с хода
    const t = g === 0 ? Math.min(25, L * 0.05) : g === nG ? L - 2 : (L * g) / nG;
    const p = at(t);
    gates.push([+p.x.toFixed(1), +p.z.toFixed(1), +p.yaw.toFixed(3), Math.max(8, Math.min(22, p.w + 4))]);
  }
  const st = at(0);
  // путь для карты и стрелки — прорежённый до ~20 м
  const line = [];
  let lastS = -1e9;
  for (let i = 0; i < path.length; i++) if (s[i] - lastS >= 20 || i === path.length - 1) { line.push(+path[i].x.toFixed(1), +path[i].z.toFixed(1)); lastS = s[i]; }
  const race = { id: R.id, name: R.name, note: R.note, loop: !!R.loop, len: Math.round(L),
                 start: [+st.x.toFixed(1), +st.z.toFixed(1), +st.yaw.toFixed(3)], gates, line };
  out.races.push(race);
  console.log(`${R.name}: ${(L / 1000).toFixed(2)} км, ${gates.length} арок`);
  for (const [n, d] of streets) if (d > 40 || DRY) console.log(`   ${n.padEnd(40)} ${d.toFixed(0)} м`);
}
if (!DRY) {
  writeFileSync(ROOT + 'data/races.json', JSON.stringify(out));
  console.log('→ data/races.json');
}
