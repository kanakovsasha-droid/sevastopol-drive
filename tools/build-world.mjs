import { readFileSync, writeFileSync } from 'node:fs';
import { BBOX, ORIGIN, project, SCALE, DEM_ZOOM } from './config.mjs';

const DIR = new URL('../data/', import.meta.url).pathname;
const osm = JSON.parse(readFileSync(DIR + 'osm-raw.json', 'utf8'));

// Описания домов, осмотренных вручную. Работа накапливается между сессиями:
// один раз посмотрел дом — он навсегда описан здесь, а не заново каждый заход.
let HOUSES = [];
try { HOUSES = JSON.parse(readFileSync(DIR + 'houses.json', 'utf8')); } catch { /* файла может не быть */ }
let ZONES = [], SHOPS = [];
try { ZONES = JSON.parse(readFileSync(DIR + 'zones.json', 'utf8')); } catch { /* файла может не быть */ }
let STREETS = {};
try { STREETS = JSON.parse(readFileSync(DIR + 'streets.json', 'utf8')); } catch { /* файла может не быть */ }

// Полоса городской улицы по ГОСТ 33150 — 3.5 м. На 3.3 четырёхполосная
// Большая Морская выходила уже трёхполосной по факту, и разметка врала.
const LANE_W = 3.5;
// Полосность: сначала ручное переопределение по имени, потом тег OSM.
function laneCount(t) {
  const o = STREETS[t['name:ru'] || t.name];
  if (o && isFinite(o.lanes)) return o.lanes;
  const n = parseFloat(t.lanes);
  return (isFinite(n) && n >= 1 && n <= 12) ? n : 0;
}
function twoWay(t) {
  const o = STREETS[t['name:ru'] || t.name];
  if (o && o.twoway !== undefined) return !!o.twoway;
  return t.oneway !== 'yes';
}
try { SHOPS = JSON.parse(readFileSync(DIR + 'shops.json', 'utf8')); } catch { /* файла может не быть */ }

// ---------- классы дорог: ширина в метрах + категория для материала ----------
const ROADS = {
  motorway:      { w: 14,  cls: 0 }, motorway_link: { w: 8,   cls: 0 },
  trunk:         { w: 12,  cls: 0 }, trunk_link:    { w: 7,   cls: 0 },
  primary:       { w: 11,  cls: 1 }, primary_link:  { w: 7,   cls: 1 },
  secondary:     { w: 9,   cls: 1 }, secondary_link:{ w: 6,   cls: 1 },
  tertiary:      { w: 8,   cls: 2 }, tertiary_link: { w: 6,   cls: 2 },
  residential:   { w: 7,   cls: 2 }, unclassified:  { w: 6,   cls: 2 },
  living_street: { w: 6,   cls: 2 }, service:       { w: 4,   cls: 3 },
  pedestrian:    { w: 6,   cls: 4 }, footway:       { w: 2.5, cls: 4 },
  path:          { w: 2,   cls: 4 }, steps:         { w: 2,   cls: 4 },
  cycleway:      { w: 2.5, cls: 4 }, track:         { w: 3,   cls: 4 },
};

// ---------- этажность ----------
// В OSM её нет у 58% домов центра. Ставить всем одинаковые 12 м нельзя —
// город превращается в поле одинаковых коробок. Оцениваем по типу и пятну застройки,
// с детерминированным разбросом (от координат), чтобы силуэт квартала жил.
const FLOOR = 3.15;
const FIXED_H = {            // объекты, у которых этажность не гадаем
  garage: 2.9, garages: 3.0, shed: 2.7, hut: 2.7, roof: 3.4, kiosk: 3.0,
  carport: 2.8, greenhouse: 3.0, toilets: 3.0, container: 2.9,
};
const TYPE_FLOORS = {        // типовая этажность, если тип известен
  house: [1, 2, 2], detached: [1, 2], bungalow: [1], terrace: [2, 3],
  apartments: [5, 5, 5, 9, 4], residential: [4, 5, 5, 9],
  commercial: [2, 3, 4], retail: [1, 2, 2], industrial: [1, 2],
  warehouse: [1, 2], office: [4, 5, 7], school: [3, 4],
  university: [4, 5], hospital: [4, 5, 7], hotel: [4, 5, 8],
  church: [1], chapel: [1], civic: [3, 4], government: [4, 5],
  train_station: [2, 3], sports_hall: [1], service: [1],
};

// стабильный псевдослучай от координат — один и тот же дом всегда одинаковый
function hashAt(x, z) {
  let h = Math.imul(Math.round(x * 8) | 0, 0x27d4eb2d) ^ Math.imul(Math.round(z * 8) | 0, 0x165667b1);
  h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

// Плавное поле «этажности района» с шагом 170 м. Без него соседи по кварталу
// бросают кубик независимо и рядом с пятиэтажкой встаёт одноэтажка —
// улица рассыпается. Реальный город растёт кварталами.
const CELL = 170;
function districtAt(x, z) {
  const gx = x / CELL, gz = z / CELL;
  const ix = Math.floor(gx), iz = Math.floor(gz);
  const fx = gx - ix, fz = gz - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);   // сглаживание
  const v = (a, b) => hashAt(a * CELL, b * CELL);
  return (v(ix, iz) * (1 - sx) + v(ix + 1, iz) * sx) * (1 - sz)
       + (v(ix, iz + 1) * (1 - sx) + v(ix + 1, iz + 1) * sx) * sz;
}

// Сколько этажей вообще может стоять на таком пятне. Ларёк в 40 м² не бывает
// трёхэтажным, а на 150 м² не строят девятиэтажку — она бы не влезла по нормам.
function maxFloorsForArea(a) {
  if (a < 45) return 1;
  if (a < 90) return 2;
  if (a < 160) return 3;
  if (a < 260) return 4;
  if (a < 420) return 5;
  if (a < 900) return 9;
  if (a < 1600) return 12;
  return 16;
}

function estimateHeight(tags, poly, areaM2) {
  const t = tags.building || tags['building:part'] || 'yes';
  if (FIXED_H[t]) return FIXED_H[t];
  const r = hashAt(poly[0], poly[1]);
  // выбор ведёт район, собственный кубик дома только слегка сдвигает
  const d = districtAt(poly[0], poly[1]);
  const k = Math.min(0.999, 0.72 * d + 0.28 * r);
  let floors;
  const table = TYPE_FLOORS[t];
  if (table) floors = table[(k * table.length) | 0];
  else if (areaM2 < 45) floors = 1;                       // сарай, будка
  else if (areaM2 < 110) floors = k < 0.62 ? 1 : 2;       // частный сектор на склонах
  else if (areaM2 < 260) floors = 2 + ((k * 3) | 0);      // 2–4
  else if (areaM2 < 800) floors = [3, 4, 5, 5, 5, 9][(k * 6) | 0];  // сталинки и хрущёвки центра
  else floors = [3, 4, 5, 5, 9, 12][(k * 6) | 0];         // крупные корпуса
  // Потолок по пятну застройки. Без него оценщик ставил 48 м на 748 м²
  // и 19 м на 177 м²: на рынке у площади Восставших вырастали башни
  // там, где стоят одноэтажные ларьки.
  floors = Math.min(floors, maxFloorsForArea(areaM2));
  // разброс по высоте этажа: старый фонд выше нового
  const fh = FLOOR * (0.94 + hashAt(poly[2] || 0, poly[3] || 0) * 0.22);
  return Math.round((floors * fh + 1.1) * 10) / 10;
}

const nodes = new Map();
const ways = new Map();
const rels = [];
for (const e of osm.elements) {
  if (e.type === 'node') nodes.set(e.id, e);
  else if (e.type === 'way') ways.set(e.id, e);
  else if (e.type === 'relation') rels.push(e);
}

const R1 = v => Math.round(v * 10) / 10;

function ring(way) {
  if (!way?.nodes) return null;
  const pts = [];
  for (const id of way.nodes) {
    const n = nodes.get(id);
    if (!n) return null;
    const p = project(n.lat, n.lon);
    pts.push(R1(p.x), R1(p.z));
  }
  return pts.length >= 4 ? pts : null;
}

function area(pts) {
  let a = 0;
  for (let i = 0, n = pts.length / 2; i < n; i++) {
    const j = (i + 1) % n;
    a += pts[i * 2] * pts[j * 2 + 1] - pts[j * 2] * pts[i * 2 + 1];
  }
  return a / 2;
}

function parseH(tags) {
  if (!tags) return null;
  if (tags.height) {
    const v = parseFloat(String(tags.height).replace(',', '.'));
    if (isFinite(v) && v > 1 && v < 400) return v;
  }
  const lv = tags['building:levels'];
  if (lv) {
    const v = parseFloat(String(lv).replace(',', '.'));
    if (isFinite(v) && v >= 1 && v < 100) return v * 3.2 + 1.2;
  }
  return null;
}

// ---------- сборка колец мультиполигонов (relation type=multipolygon) ----------
function assemble(memberWays) {
  // склеиваем незамкнутые куски в кольца по общим концам
  const segs = memberWays.map(w => w.nodes?.slice()).filter(Boolean);
  const out = [];
  while (segs.length) {
    let cur = segs.pop();
    let guard = 0;
    while (cur[0] !== cur[cur.length - 1] && guard++ < 500) {
      const tail = cur[cur.length - 1];
      let hit = -1;
      for (let i = 0; i < segs.length; i++) {
        if (segs[i][0] === tail) { cur = cur.concat(segs[i].slice(1)); hit = i; break; }
        if (segs[i][segs[i].length - 1] === tail) { cur = cur.concat(segs[i].slice(0, -1).reverse()); hit = i; break; }
      }
      if (hit < 0) break;
      segs.splice(hit, 1);
    }
    if (cur[0] === cur[cur.length - 1] && cur.length >= 4) {
      const r = ring({ nodes: cur });
      if (r) out.push(r);
    }
  }
  return out;
}

const world = { roads: [], buildings: [], water: [], green: [], rail: [], coast: [] };
const usedInRel = new Set();

for (const rel of rels) {
  const t = rel.tags || {};
  const outers = [], inners = [];
  for (const m of rel.members || []) {
    if (m.type !== 'way') continue;
    const w = ways.get(m.ref);
    if (!w) continue;
    usedInRel.add(m.ref);
    (m.role === 'inner' ? inners : outers).push(w);
  }
  const outRings = assemble(outers);
  const inRings = assemble(inners);
  if (!outRings.length) continue;
  if (t.building) {
    for (const p of outRings) {
      const h = parseH(t) ?? estimateHeight(t, p, Math.abs(area(p)));
      const nm = t['name:ru'] || t.name;
      world.buildings.push({
        h: R1(h), poly: p, holes: inRings.length ? inRings : undefined,
        ...(nm ? { n: nm } : {}),
        ...(t.building && t.building !== 'yes' ? { t: t.building } : {}),
      });
    }
  } else if (t.natural === 'water') {
    for (const p of outRings) world.water.push({ poly: p, holes: inRings.length ? inRings : undefined });
  } else if (t.leisure === 'park') {
    for (const p of outRings) world.green.push({ kind: 'park', poly: p, holes: inRings.length ? inRings : undefined });
  }
}

const GREEN = {
  park: 'park', garden: 'park', grass: 'grass', village_green: 'grass',
  meadow: 'grass', forest: 'wood', wood: 'wood', scrub: 'scrub',
  cemetery: 'grass', recreation_ground: 'grass', allotments: 'grass',
  pitch: 'pitch', playground: 'pitch', stadium: 'pitch',
  beach: 'sand', sand: 'sand',
};

for (const w of ways.values()) {
  const t = w.tags || {};
  if (t.highway && ROADS[t.highway]) {
    const pts = ring(w);
    if (!pts) continue;
    const spec = ROADS[t.highway];
    let width = spec.w;
    const lanes = laneCount(t);
    if (lanes) width = Math.max(width, lanes * LANE_W);
    const wt = parseFloat(t.width);
    if (isFinite(wt) && wt > 1 && wt < 40) width = wt;
    world.roads.push({
      c: spec.cls, w: R1(width), pts,
      ...(t.name ? { n: t.name } : {}),
      ...(t.bridge ? { br: 1 } : {}),
      ...(t.tunnel ? { tn: 1 } : {}),
      ...(twoWay(t) ? {} : { ow: 1 }),
      ...(lanes ? { l: lanes } : {}),
      ...(STREETS[t['name:ru'] || t.name]?.bus ? { bus: 1 } : {}),
      ...(STREETS[t['name:ru'] || t.name]?.parking ? { pk: 1 } : {}),
    });
    continue;
  }
  if (t.natural === 'coastline') {
    // Линия берега из OSM. По соглашению OSM суша слева по ходу линии, море
    // справа — этого хватает, чтобы вырезать бухты: SRTM с шагом 30 м их
    // засыпает, и Артбухта с Хрустальным пляжем оказывались сушей.
    const p = ring(w);
    if (p && p.length >= 4) (world.coast = world.coast || []).push({ pts: p });
    continue;
  }
  if (t.railway) { const p = ring(w); if (p) world.rail.push({ pts: p }); continue; }
  if (usedInRel.has(w.id)) continue;
  const closed = w.nodes && w.nodes[0] === w.nodes[w.nodes.length - 1];
  if (!closed) continue;
  const p = ring(w);
  if (!p) continue;
  if (t.building || t['building:part']) {
    const aM = Math.abs(area(p));
    const hTag = parseH(t);
    let h = hTag ?? estimateHeight(t, p, aM);
    // даже теги OSM бывают ошибочны: 48 м на пятне 750 м² — опечатка, не дом
    h = Math.min(h, maxFloorsForArea(aM) * FLOOR * 1.35 + 2);
    const nm = t['name:ru'] || t.name;
    world.buildings.push({
      h: R1(h), poly: p,
      ...(hTag != null ? { lv: 1 } : {}),
      ...(nm ? { n: nm } : {}),
      ...(t.building && t.building !== 'yes' ? { t: t.building } : {}),
      ...(t['roof:shape'] ? { rs: t['roof:shape'] } : {}),
    });
  } else if (t.natural === 'water' || t.waterway === 'riverbank') {
    world.water.push({ poly: p });
  } else {
    const kind = GREEN[t.leisure] || GREEN[t.landuse] || GREEN[t.natural];
    if (kind) world.green.push({ kind, poly: p });
  }
}

// нормализуем обход колец против часовой (для триангуляции в браузере)
for (const b of world.buildings) if (area(b.poly) < 0) reverse(b.poly);
function reverse(p) {
  for (let i = 0, j = p.length - 2; i < j; i += 2, j -= 2) {
    [p[i], p[j]] = [p[j], p[i]];
    [p[i + 1], p[j + 1]] = [p[j + 1], p[i + 1]];
  }
}

// ---------- перекрёстки ----------
// Осевые линии обрываются в общем узле, и между полотнами остаётся дыра,
// сквозь которую светит грунт. Собираем узлы, общие для нескольких улиц,
// чтобы залить их сплошным асфальтом и разложить зебры на подходах.
{
  const use = new Map();   // id узла → { ways: [], maxW }
  for (const w of ways.values()) {
    const t = w.tags || {};
    const spec = ROADS[t.highway];
    if (!spec || spec.cls === 4) continue;      // пешеходные дорожки перекрёстков не делают
    let width = spec.w;
    const lanes = laneCount(t);
    if (lanes) width = Math.max(width, lanes * LANE_W);
    for (let i = 0; i < w.nodes.length; i++) {
      const id = w.nodes[i];
      let u = use.get(id);
      if (!u) use.set(id, u = { ways: [], maxW: 0 });
      u.ways.push({ w, i, width });
      if (width > u.maxW) u.maxW = width;
    }
  }

  // Узел-перекрёсток: точка, где сходятся хотя бы две РАЗНЫЕ улицы.
  const jn = [];
  for (const [id, u] of use) {
    if (u.ways.length < 2) continue;
    const distinct = new Set(u.ways.map(o => o.w.id));
    if (distinct.size < 2) continue;            // самопересечение одной улицы не перекрёсток
    const n = nodes.get(id);
    if (!n) continue;
    const p = project(n.lat, n.lon);
    jn.push({ id, x: p.x, z: p.z, r: u.maxW / 2 + 1.2, ways: u.ways });
  }

  // Один перекрёсток в OSM — это горсть узлов в паре метров друг от друга, а
  // площадь (Ушакова, Лазарева) — полтора десятка узлов на семьдесят метров.
  // Раньше отсюда выживал один узел на 14 м, и на площади оставалось шесть
  // независимых кругов асфальта: они спорили друг с другом за глубину
  // («ступени») и вокруг каждого расходился свой веер зебр под своим углом.
  // Теперь узлы сливаются в СВЯЗНЫЕ кластеры (объединяем, когда пятна почти
  // касаются), и на кластер приходится ровно одно пятно — выпуклая оболочка
  // всех его кругов. Зебры раскладываются по кластеру, а не по узлу: по одной
  // на каждый выход улицы наружу, уже за краем пятна.
  const GAP = 10;                        // зазор, при котором пятна ещё считаем одним
  const par = jn.map((_, i) => i);
  const find = a => { while (par[a] !== a) a = par[a] = par[par[a]]; return a; };
  const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) par[b] = a; };
  {
    const CG = 30, g = new Map();        // максимум связи = r+r+GAP ≈ 27 < 30
    jn.forEach((j, i) => {
      const k = Math.floor(j.x / CG) + ',' + Math.floor(j.z / CG);
      let a = g.get(k); if (!a) g.set(k, a = []);
      a.push(i);
    });
    jn.forEach((j, i) => {
      for (let cx = -1; cx <= 1; cx++)
        for (let cz = -1; cz <= 1; cz++) {
          const a = g.get((Math.floor(j.x / CG) + cx) + ',' + (Math.floor(j.z / CG) + cz));
          if (!a) continue;
          for (const o of a) {
            if (o <= i) continue;
            const q = jn[o], lim = j.r + q.r + GAP;
            if ((q.x - j.x) ** 2 + (q.z - j.z) ** 2 < lim * lim) uni(i, o);
          }
        }
    });
  }
  const groups = new Map();
  jn.forEach((j, i) => {
    const k = find(i);
    let a = groups.get(k); if (!a) groups.set(k, a = []);
    a.push(j);
  });

  // Выпуклая оболочка (обход Эндрю). Пятно кластера — оболочка контуров всех
  // его кругов: круг вокруг центра тяжести накрыл бы тротуары и газон между
  // перекрёстками, а оболочка обтягивает ровно занятое место.
  const hull = (pts) => {
    const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const build = (src) => {
      const h = [];
      for (const q of src) {
        while (h.length >= 2 && cr(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop();
        h.push(q);
      }
      h.pop(); return h;
    };
    return build(p).concat(build(p.reverse()));
  };

  const keptJ = [];
  let airy = 0;
  for (const g0 of groups.values()) {
    // Оболочка обтягивает круги, но если они выстроились кольцом (площадь с
    // газоном в середине), она накроет и середину. Такие кластеры не склеиваем:
    // лучше два честных пятна, чем асфальт поверх сквера.
    const parts = [g0];
    if (g0.length > 1) {
      const samp0 = [];
      let disks = 0;
      for (const j of g0) {
        disks += Math.PI * j.r * j.r;
        for (let k = 0; k < 14; k++) {
          const a = k / 14 * Math.PI * 2;
          samp0.push([j.x + Math.cos(a) * j.r, j.z + Math.sin(a) * j.r]);
        }
      }
      const h0 = hull(samp0);
      let A0 = 0;
      for (let i = 0; i < h0.length; i++) {
        const q = h0[(i + 1) % h0.length];
        A0 += h0[i][0] * q[1] - q[0] * h0[i][1];
      }
      if (Math.abs(A0 / 2) > 2.6 * disks) { airy++; parts.length = 0; for (const j of g0) parts.push([j]); }
    }
    for (const g of parts) {
      let sx = 0, sz = 0;
      const samp = [];
      for (const j of g) {
        sx += j.x; sz += j.z;
        for (let k = 0; k < 14; k++) {
          const a = k / 14 * Math.PI * 2;
          samp.push([j.x + Math.cos(a) * j.r, j.z + Math.sin(a) * j.r]);
        }
      }
      const cx = sx / g.length, cz = sz / g.length;
      let R = 0;
      for (const j of g) R = Math.max(R, Math.hypot(j.x - cx, j.z - cz) + j.r);
      const rec = { x: R1(cx), z: R1(cz), r: R1(R) };
      if (g.length > 1) {
        // Обход приводим к положительной площади: worldgen считает «наружу» по
        // левой нормали ребра и без единого обхода вывернул бы пятно наизнанку.
        const h = hull(samp);
        let A = 0;
        for (let i = 0; i < h.length; i++) {
          const q = h[(i + 1) % h.length];
          A += h[i][0] * q[1] - q[0] * h[i][1];
        }
        if (A < 0) h.reverse();
        rec.poly = h.flatMap(q => [R1(q[0]), R1(q[1])]);
      }
      rec.__g = g;
      keptJ.push(rec);
    }
  }

  // ---------- зебры ----------
  // Точка вне пятна кластера? Для круга — по радиусу, для оболочки — по
  // максимуму выноса за её рёбра (контур выпуклый, этого достаточно).
  const outside = (j, x, z, m) => {
    if (!j.poly) return (x - j.x) ** 2 + (z - j.z) ** 2 > (j.r + m) ** 2;
    const p = j.poly, n = p.length / 2;
    let far = -1e9;
    for (let i = 0; i < n; i++) {
      const k = (i + 1) % n;
      const ax = p[i * 2], az = p[i * 2 + 1];
      const ex = p[k * 2] - ax, ez = p[k * 2 + 1] - az;
      const L = Math.hypot(ex, ez) || 1;
      const d = ((x - ax) * ez - (z - az) * ex) / L;
      if (d > far) far = d;
    }
    return far > m;
  };

  const crossings = [];
  for (const j of keptJ) {
    const ids = new Set(j.__g.map(o => o.id));
    // по каждой улице кластера — её крайние узлы внутри пятна
    const byWay = new Map();
    for (const o of j.__g) for (const wo of o.ways) {
      let e = byWay.get(wo.w.id);
      if (!e) byWay.set(wo.w.id, e = { w: wo.w, width: wo.width, lo: wo.i, hi: wo.i });
      if (wo.i < e.lo) e.lo = wo.i;
      if (wo.i > e.hi) e.hi = wo.i;
      if (wo.width > e.width) e.width = wo.width;
    }
    for (const e of byWay.values()) {
      // Зебра — принадлежность улицы, а не выезда со двора: на каждом
      // служебном проезде она только сорит полосами поперёк перекрёстка.
      if (e.width < 5.5) continue;
      // два выхода: назад от первого узла кластера и вперёд от последнего
      for (const [from, dir] of [[e.lo, -1], [e.hi, 1]]) {
        let px = null, pz = null, ax = 0, az = 0, run = 0;
        for (let i = from; i + dir >= 0 && i + dir < e.w.nodes.length; i += dir) {
          const n0 = nodes.get(e.w.nodes[i]), n1 = nodes.get(e.w.nodes[i + dir]);
          if (!n0 || !n1) break;
          if (i !== from && ids.has(e.w.nodes[i])) break;   // вернулись в пятно
          const p0 = project(n0.lat, n0.lon), p1 = project(n1.lat, n1.lon);
          const dx = p1.x - p0.x, dz = p1.z - p0.z, L = Math.hypot(dx, dz);
          if (L < 0.5) continue;
          const steps = Math.ceil(L);
          for (let s = 1; s <= steps; s++) {
            const x = p0.x + dx * s / steps, z = p0.z + dz * s / steps;
            run += L / steps;
            if (outside(j, x, z, 2.4)) { px = x; pz = z; ax = dx / L; az = dz / L; break; }
          }
          if (px !== null) break;
          if (run > 60) break;                              // подход бесконечно не тянем
        }
        // 1.7 м — половина глубины зебры: полоса не должна лизать край пятна
        if (px === null || run < 5) continue;
        crossings.push({
          x: R1(px + ax * 1.7), z: R1(pz + az * 1.7),
          a: Math.round(Math.atan2(ax, az) * 1000) / 1000,
          w: R1(e.width), d: 3.4,
        });
      }
    }
  }

  // Зебры: не ближе 11 м друг к другу и ни одна не внутри пятна перекрёстка.
  const CROSS_MIN = 11;
  const cgrid = new Map(), keptC = [];
  const jgrid = new Map();
  for (const j of keptJ) {
    const R = j.r + 6;
    for (let cx = Math.floor((j.x - R) / 40); cx <= Math.floor((j.x + R) / 40); cx++)
      for (let cz = Math.floor((j.z - R) / 40); cz <= Math.floor((j.z + R) / 40); cz++) {
        const k = cx + ',' + cz;
        let a = jgrid.get(k); if (!a) jgrid.set(k, a = []);
        a.push(j);
      }
  }
  for (const c of crossings) {
    let near = false;
    for (let cx = -1; cx <= 1 && !near; cx++)
      for (let cz = -1; cz <= 1 && !near; cz++) {
        const list = cgrid.get((Math.floor(c.x / CROSS_MIN) + cx) + ',' + (Math.floor(c.z / CROSS_MIN) + cz));
        if (!list) continue;
        for (const o of list)
          if ((o.x - c.x) ** 2 + (o.z - c.z) ** 2 < CROSS_MIN * CROSS_MIN) { near = true; break; }
      }
    if (near) continue;
    // зебра лежит НА ПОДХОДЕ: внутри пятна ей делать нечего
    const jl = jgrid.get(Math.floor(c.x / 40) + ',' + Math.floor(c.z / 40)) || [];
    let inJ = false;
    for (const j of jl) if (!outside(j, c.x, c.z, 1.0)) { inJ = true; break; }
    if (inJ) continue;
    keptC.push(c);
    const k = Math.floor(c.x / CROSS_MIN) + ',' + Math.floor(c.z / CROSS_MIN);
    (cgrid.get(k) || cgrid.set(k, []).get(k)).push(c);
  }

  let poly = 0, big = 0;
  for (const j of keptJ) { if (j.poly) poly++; if (j.r > 20) big++; delete j.__g; }
  console.log(`  узлов-перекрёстков ${jn.length} → кластеров ${keptJ.length} (из них склеенных ${poly}, крупнее 20 м ${big}, рассыпано как «кольцо» ${airy})`);
  console.log(`  зебр ${crossings.length} → после чистки ${keptC.length}`);
  world.junctions = keptJ;
  world.crossings = keptC;
}

// ---------- размеченные вручную зоны (рынок, гаражи) ----------
// Оценщик высоты считает по площади пятна и «этажности района»: ряд рынка
// в 400 м² он честно тянет на пять этажей. Никакой тег OSM это не поправит —
// у ларьков вообще нет тегов. Поэтому обведённые по спутнику куски города
// получают этажность и вид руками.
{
  const inside = (x, z, p) => {
    let c = false;
    for (let i = 0, j = p.length / 2 - 1; i < p.length / 2; j = i++) {
      const xi = p[i * 2], zi = p[i * 2 + 1], xj = p[j * 2], zj = p[j * 2 + 1];
      if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
    }
    return c;
  };
  for (const zn of ZONES) {
    let hit = 0;
    for (const b of world.buildings) {
      const p = b.poly, n = p.length / 2;
      let cx = 0, cz = 0;
      for (let k = 0; k < n; k++) { cx += p[k * 2]; cz += p[k * 2 + 1]; }
      cx /= n; cz /= n;
      if (!inside(cx, cz, zn.poly)) continue;
      hit++;
      if (zn.kind) b.k = zn.kind;
      if (zn.floors) {
        // высота гуляет в пределах полуметра, иначе ряды сливаются в одну плиту
        const r = hashAt(p[0], p[1]);
        b.h = R1(zn.floors * 3.2 + 0.6 + r * 0.9);
      }
      b.zone = 1;
    }
    console.log(`зона «${zn.name}»: ${hit} контуров`);
  }
  world.zones = ZONES.map(z => ({ name: z.name, kind: z.kind, poly: z.poly }));
  // площадка зоны — не газон: асфальт и бетон между рядами
  for (const zn of ZONES) if (zn.kind === 'market') world.green.push({ kind: 'yard', poly: zn.poly });
}

// ---------- накладываем описания осмотренных домов ----------
{
  let applied = 0;
  for (const h of HOUSES) {
    let bi = -1, bd = Infinity;
    world.buildings.forEach((b, i) => {
      const p = b.poly, n = p.length / 2;
      let cx = 0, cz = 0;
      for (let k = 0; k < n; k++) { cx += p[k * 2]; cz += p[k * 2 + 1]; }
      const d = Math.hypot(cx / n - h.x, cz / n - h.z);
      if (d < bd) { bd = d; bi = i; }
    });
    if (bi < 0 || bd > 45) { console.log(`  ! не нашёл контур для ${h.addr} (ближайший в ${bd.toFixed(0)} м)`); continue; }
    const b = world.buildings[bi];
    if (h.floors) b.h = R1(h.floors * 3.2 + 1.1);
    if (h.height) b.h = R1(h.height);
    if (h.grandOrder) b.go = 1;
    if (h.arch) b.arch = 1;
    if (h.signWall) b.sw = h.signWall;
    if (h.sign) { b.sg = b.sg || []; b.sg.unshift({ n: h.sign, c: h.signKind || 'civic' }); }
    if (h.addr) b.n = h.addr;
    if (h.roof) b.rs = h.roof;
    if (h.roofColor) b.rc = h.roofColor;
    if (h.wallColor) b.wc = h.wallColor;
    if (h.fx) b.fx = h.fx;                 // витражный фасад назначен вручную
    if (h.porch) b.porch = 1;
    if (h.chimney) b.chim = h.chimney;
    b.hand = 1;
    applied++;
  }
  world.handChecked = applied;
  console.log(`описаний домов применено ${applied} из ${HOUSES.length}`);
}

// ---------- вывески: сажаем заведения OSM на их дома ----------
// Без этого весь центр — безымянные коробки. Названия не выдуманы:
// магазины, кафе, кинотеатры и ТЦ взяты из OSM (tools/fetch-shops.mjs).
{
  const inside = (x, z, p) => {
    let c = false;
    for (let i = 0, j = p.length / 2 - 1; i < p.length / 2; j = i++) {
      const xi = p[i * 2], zi = p[i * 2 + 1], xj = p[j * 2], zj = p[j * 2 + 1];
      if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
    }
    return c;
  };
  // сетка по 80 м, иначе 909 × 10201 перебором
  const CELL = 80, grid = new Map();
  const key = (x, z) => Math.floor(x / CELL) + ',' + Math.floor(z / CELL);
  world.buildings.forEach((b, i) => {
    const p = b.poly, n = p.length / 2;
    let cx = 0, cz = 0, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let k = 0; k < n; k++) {
      const x = p[k * 2], z = p[k * 2 + 1];
      cx += x; cz += z;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    b.__c = [cx / n, cz / n];
    for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++)
      for (let gz = Math.floor(z0 / CELL); gz <= Math.floor(z1 / CELL); gz++) {
        const k = gx + ',' + gz;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(i);
      }
  });

  let placed = 0, orphan = 0;
  for (const s of SHOPS) {
    let hit = -1, bd = Infinity;
    for (let gx = -1; gx <= 1; gx++)
      for (let gz = -1; gz <= 1; gz++) {
        const list = grid.get(key(s.x + gx * CELL, s.z + gz * CELL));
        if (!list) continue;
        for (const i of list) {
          const b = world.buildings[i];
          if (inside(s.x, s.z, b.poly)) { hit = i; bd = 0; }
          else if (bd > 0) {
            const d = Math.hypot(b.__c[0] - s.x, b.__c[1] - s.z);
            if (d < bd && d < 26) { bd = d; hit = i; }
          }
        }
        if (bd === 0) break;
      }
    if (hit < 0) { orphan++; continue; }
    const b = world.buildings[hit];
    if (!b.sg) b.sg = [];
    if (b.sg.length >= 3) continue;                // на фасад больше трёх не лезет
    if (b.sg.some(o => o.n === s.n)) continue;
    b.sg.push({ n: s.n, c: s.c });
    placed++;
  }
  // ТЦ, кинотеатры и универмаги — не такие же коробки, как жильё вокруг:
  // им положен витражный фасад, иначе «Плаза» неотличима от хрущёвки.
  let glass = 0;
  for (const b of world.buildings) {
    const big = b.poly.length >= 8;
    const kind = (b.sg || []).some(o => o.c === 'mall' || o.c === 'cinema');
    const byTag = /^(retail|commercial|supermarket|department_store|mall)$/.test(b.t || '');
    // Дом, описанный руками, автоматике не отдаём: «Победа» и «Украина» по
    // тегам проходят как кинотеатры, и штукатурка сталинского портика
    // подменялась стеклопакетами.
    if (b.hand) continue;
    if (big && (kind || byTag) && b.h >= 5) { b.fx = 'glass'; glass++; }
  }
  console.log(`витражных фасадов ${glass}`);
  for (const b of world.buildings) delete b.__c;
  console.log(`вывесок размещено ${placed}, без дома ${orphan}`);
}

// ---------- школы: один узнаваемый тип ----------
// Школа в OSM — просто building=school без этажности, и оценщик разносил их
// от 7 до 32 м: одна выглядела бараком, другая башней. Типовая советская школа
// — три этажа с широкими окнами; приводим к этому и вешаем табличку с номером.
{
  let n = 0, named = 0;
  for (const b of world.buildings) {
    if (!/^(school|college|kindergarten|university)$/.test(b.t || '')) continue;
    if (b.hand) continue;                       // осмотренные руками не трогаем
    b.school = 1;
    const kg = b.t === 'kindergarten';
    if (!b.lv) b.h = R1((kg ? 2 : 3) * 3.9 + 1.0 + hashAt(b.poly[0], b.poly[1]) * 0.8);
    n++;
    if (b.n && !(b.sg || []).length) { b.sg = [{ n: b.n, c: 'school' }]; named++; }
  }
  console.log(`школьных корпусов ${n}, с табличкой ${named}`);
}

// ---------- храмы: камень, а не штукатурка с балконами ----------
{
  let n = 0;
  for (const b of world.buildings) {
    if (!/^(church|cathedral|chapel|mosque|synagogue|temple)$/.test(b.t || '')) continue;
    b.temple = 1;
    if (b.n && !(b.sg || []).length) b.sg = [{ n: b.n, c: 'church' }];
    n++;
  }
  console.log(`культовых зданий ${n}`);
}

const nw = project(BBOX.north, BBOX.west), se = project(BBOX.south, BBOX.east);
world.meta = {
  origin: ORIGIN,
  bbox: BBOX,
  scale: SCALE,          // метров на градус — чтобы браузер считал ровно так же
  demZoom: DEM_ZOOM,
  bounds: { minX: R1(nw.x), maxX: R1(se.x), minZ: R1(nw.z), maxZ: R1(se.z) },
};

writeFileSync(DIR + 'world.json', JSON.stringify(world));
const size = readFileSync(DIR + 'world.json').length;

const byCls = [0, 0, 0, 0, 0];
for (const r of world.roads) byCls[r.c]++;
let hSum = 0; for (const b of world.buildings) hSum += b.h;
console.log(`дорог      ${world.roads.length}  (магистрали ${byCls[0]}, главные ${byCls[1]}, улицы ${byCls[2]}, проезды ${byCls[3]}, пешеходные ${byCls[4]})`);
console.log(`зданий     ${world.buildings.length}  средняя высота ${(hSum / world.buildings.length).toFixed(1)} м`);
console.log(`зелень     ${world.green.length}`);
console.log(`вода       ${world.water.length}`);
console.log(`рельсы     ${world.rail.length}`);
console.log(`линий берега ${(world.coast || []).length}, узлов ${(world.coast || []).reduce((a, c) => a + c.pts.length / 2, 0)}`);
console.log(`перекрёстки ${world.junctions.length}, зебр ${world.crossings.length}`);
console.log(`зданий с именами ${world.buildings.filter(b => b.n).length}`);
console.log(`мир        ${(size / 1e6).toFixed(1)} МБ, размер ${((se.x - nw.x) / 1000).toFixed(1)}x${((se.z - nw.z) / 1000).toFixed(1)} км`);
