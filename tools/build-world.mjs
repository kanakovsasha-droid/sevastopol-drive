import { readFileSync, writeFileSync } from 'node:fs';
import { BBOX, ORIGIN, project, SCALE, DEM_ZOOM } from './config.mjs';

const DIR = new URL('../data/', import.meta.url).pathname;
const osm = JSON.parse(readFileSync(DIR + 'osm-raw.json', 'utf8'));

// Описания домов, осмотренных вручную. Работа накапливается между сессиями:
// один раз посмотрел дом — он навсегда описан здесь, а не заново каждый заход.
let HOUSES = [];
try { HOUSES = JSON.parse(readFileSync(DIR + 'houses.json', 'utf8')); } catch { /* файла может не быть */ }
let ZONES = [];
try { ZONES = JSON.parse(readFileSync(DIR + 'zones.json', 'utf8')); } catch { /* файла может не быть */ }

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

const world = { roads: [], buildings: [], water: [], green: [], rail: [] };
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
    const lanes = parseFloat(t.lanes);
    if (isFinite(lanes) && lanes >= 1 && lanes <= 12) width = Math.max(width, lanes * 3.3);
    const wt = parseFloat(t.width);
    if (isFinite(wt) && wt > 1 && wt < 40) width = wt;
    world.roads.push({
      c: spec.cls, w: R1(width), pts,
      ...(t.name ? { n: t.name } : {}),
      ...(t.bridge ? { br: 1 } : {}),
      ...(t.tunnel ? { tn: 1 } : {}),
      ...(t.oneway === 'yes' ? { ow: 1 } : {}),
    });
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
    let h = parseH(t) ?? estimateHeight(t, p, aM);
    // даже теги OSM бывают ошибочны: 48 м на пятне 750 м² — опечатка, не дом
    h = Math.min(h, maxFloorsForArea(aM) * FLOOR * 1.35 + 2);
    const nm = t['name:ru'] || t.name;
    world.buildings.push({
      h: R1(h), poly: p,
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
    const lanes = parseFloat(t.lanes);
    if (isFinite(lanes) && lanes >= 1 && lanes <= 12) width = Math.max(width, lanes * 3.3);
    for (let i = 0; i < w.nodes.length; i++) {
      const id = w.nodes[i];
      let u = use.get(id);
      if (!u) use.set(id, u = { ways: [], maxW: 0 });
      u.ways.push({ w, i, width });
      if (width > u.maxW) u.maxW = width;
    }
  }

  const junctions = [], crossings = [];
  for (const [id, u] of use) {
    if (u.ways.length < 2) continue;
    const distinct = new Set(u.ways.map(o => o.w.id));
    if (distinct.size < 2) continue;            // самопересечение одной улицы не перекрёсток
    const n = nodes.get(id);
    if (!n) continue;
    const p = project(n.lat, n.lon);
    const r = u.maxW / 2 + 1.2;
    junctions.push({ x: R1(p.x), z: R1(p.z), r: R1(r) });

    // зебра на каждом подходе, за пределами пятна перекрёстка
    const seen = new Set();
    for (const o of u.ways) {
      if (seen.has(o.w.id)) continue;
      seen.add(o.w.id);
      const j = o.i > 0 ? o.i - 1 : o.i + 1;
      const nb = nodes.get(o.w.nodes[j]);
      if (!nb) continue;
      const q = project(nb.lat, nb.lon);
      let dx = q.x - p.x, dz = q.z - p.z;
      const l = Math.hypot(dx, dz);
      if (l < 6) continue;                       // слишком короткий подход
      dx /= l; dz /= l;
      const off = r + 2.2;
      crossings.push({
        x: R1(p.x + dx * off), z: R1(p.z + dz * off),
        a: Math.round(Math.atan2(dx, dz) * 1000) / 1000,
        w: R1(o.width), d: 3.4,
      });
    }
  }
  // Один перекрёсток в OSM — это несколько общих узлов в паре метров друг от
  // друга. Каждый плодил свой круг асфальта и свой веер зебр, и всё это ложилось
  // внахлёст. Склеиваем узлы в кластеры и оставляем по одному пятну на кластер.
  const CLUSTER = 14;
  junctions.sort((a, b) => b.r - a.r);
  const jgrid = new Map(), keptJ = [];
  const cellKey = (x, z) => Math.floor(x / CLUSTER) + ',' + Math.floor(z / CLUSTER);
  for (const j of junctions) {
    let dup = false;
    for (let cx = -1; cx <= 1 && !dup; cx++)
      for (let cz = -1; cz <= 1 && !dup; cz++) {
        const list = jgrid.get(cellKey(j.x + cx * CLUSTER, j.z + cz * CLUSTER));
        if (!list) continue;
        for (const o of list)
          if ((o.x - j.x) ** 2 + (o.z - j.z) ** 2 < CLUSTER * CLUSTER) { dup = true; break; }
      }
    if (dup) continue;
    keptJ.push(j);
    const k = cellKey(j.x, j.z);
    (jgrid.get(k) || jgrid.set(k, []).get(k)).push(j);
  }

  // Зебры: не ближе 11 м друг к другу и только у оставшихся перекрёстков.
  const CROSS_MIN = 11;
  const cgrid = new Map(), keptC = [];
  for (const c of crossings) {
    let near = false;
    for (let cx = -1; cx <= 1 && !near; cx++)
      for (let cz = -1; cz <= 1 && !near; cz++) {
        const list = cgrid.get(Math.floor(c.x / CROSS_MIN) + cx + ',' + (Math.floor(c.z / CROSS_MIN) + cz));
        if (!list) continue;
        for (const o of list)
          if ((o.x - c.x) ** 2 + (o.z - c.z) ** 2 < CROSS_MIN * CROSS_MIN) { near = true; break; }
      }
    if (near) continue;
    // зебра нужна только там, где остался перекрёсток
    let hasJ = false;
    for (const j of keptJ) {
      if ((j.x - c.x) ** 2 + (j.z - c.z) ** 2 < 900) { hasJ = true; break; }
    }
    if (!hasJ) continue;
    keptC.push(c);
    const k = Math.floor(c.x / CROSS_MIN) + ',' + Math.floor(c.z / CROSS_MIN);
    (cgrid.get(k) || cgrid.set(k, []).get(k)).push(c);
  }

  console.log(`  узлов-перекрёстков ${junctions.length} → кластеров ${keptJ.length}`);
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
    if (h.addr) b.n = h.addr;
    if (h.roof) b.rs = h.roof;
    if (h.roofColor) b.rc = h.roofColor;
    if (h.wallColor) b.wc = h.wallColor;
    if (h.porch) b.porch = 1;
    if (h.chimney) b.chim = h.chimney;
    b.hand = 1;
    applied++;
  }
  world.handChecked = applied;
  console.log(`описаний домов применено ${applied} из ${HOUSES.length}`);
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
console.log(`перекрёстки ${world.junctions.length}, зебр ${world.crossings.length}`);
console.log(`зданий с именами ${world.buildings.filter(b => b.n).length}`);
console.log(`мир        ${(size / 1e6).toFixed(1)} МБ, размер ${((se.x - nw.x) / 1000).toFixed(1)}x${((se.z - nw.z) / 1000).toFixed(1)} км`);
