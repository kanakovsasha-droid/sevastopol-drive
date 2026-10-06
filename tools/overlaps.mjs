// Дома в домах и дома на дороге — по всей карте.
//   node tools/overlaps.mjs            — только отчёт (числом и худшими местами)
//   node tools/overlaps.mjs --list     — все найденные места и правки
//   node tools/overlaps.mjs --write    — записать правки в data/overlaps.json,
//                                        world.json и чанки (с far.json)
//
// Берёт дома из data/chunks/*.json (каждый id один раз), выкидывает снятые
// моделями (hide, skip памятных зданий, skip спортплощадок) и меряет:
//   * пересечение контуров домов между собой (площадь, доля меньшего);
//   * заход дома на проезжую часть улиц классов 0–2 (полоса шириной w
//     дороги OSM вокруг оси; мосты, тоннели и уровни l не в счёт).
// Площади — подсчётом точек сетки (шаг от 0,25 до 1 м по размеру дома).
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url).pathname;
const LIST = process.argv.includes('--list');
export const BB_MIN = 1, ROAD_MIN = 0.3;   // м² пересечения домов; м захода на полотно

// ---------------------------------------------------------------- геометрия
export function inPoly(p, x, z) {
  let c = false;
  const n = p.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = p[i * 2], zi = p[i * 2 + 1], xj = p[j * 2], zj = p[j * 2 + 1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
  }
  return c;
}
export const polyArea = p => {
  let s = 0;
  const n = p.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) s += p[j * 2] * p[i * 2 + 1] - p[i * 2] * p[j * 2 + 1];
  return Math.abs(s) / 2;
};
export function bbox(p) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < p.length; i += 2) {
    if (p[i] < x0) x0 = p[i]; if (p[i] > x1) x1 = p[i];
    if (p[i + 1] < z0) z0 = p[i + 1]; if (p[i + 1] > z1) z1 = p[i + 1];
  }
  return [x0, z0, x1, z1];
}
const inB = (b, x, z) => inPoly(b.poly, x, z) && !(b.holes || []).some(h => inPoly(h, x, z));
// точки сетки внутри дома: [x, z, …] и площадь ячейки
export function samples(b, step) {
  const [x0, z0, x1, z1] = b.bb;
  const out = [];
  for (let z = z0 + step / 2; z < z1; z += step)
    for (let x = x0 + step / 2; x < x1; x += step) if (inB(b, x, z)) out.push(x, z);
  return out;
}
const stepOf = a => Math.min(1, Math.max(0.25, Math.sqrt(a) / 30));


// Расстояние до оси улицы без торцов: дворовый проезд часто упирается в дом
// (ворота гаража), и полукруг на конце оси выгрыз бы в стене нишу. В изломе
// посередине оси торец есть — там полотно рисуется скруглением.
// Возвращает [d, nx, nz] — расстояние и единичный вектор от оси к точке.
export function axisDist(r, x, z) {
  const p = r.pts, last = p.length / 2 - 2;
  let bd = Infinity, bx = 0, bz = 0;
  for (let q = 0; q <= last; q++) {
    const ax = p[q * 2], az = p[q * 2 + 1], dx = p[q * 2 + 2] - ax, dz = p[q * 2 + 3] - az, L = dx * dx + dz * dz;
    let t = L ? ((x - ax) * dx + (z - az) * dz) / L : 0;
    if ((t < 0 && q === 0) || (t > 1 && q === last)) continue;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = x - ax - t * dx, ez = z - az - t * dz, d = Math.hypot(ex, ez);
    if (d < bd) { bd = d; bx = d ? ex / d : -dz; bz = d ? ez / d : dx; }
  }
  const n = Math.hypot(bx, bz) || 1;
  return [bd, bx / n, bz / n];
}

// ---------------------------------------------------------------- данные
export function loadCity() {
  const dir = ROOT + 'data/chunks/';
  const byId = new Map(), hidden = new Set(), roads = new Map();
  for (const f of readdirSync(dir)) {
    if (!/^-?\d+_-?\d+\.json$/.test(f)) continue;
    const c = JSON.parse(readFileSync(dir + f, 'utf8'));
    for (const b of c.buildings || []) {
      if (b.hide) hidden.add(b.id);
      if (!byId.has(b.id)) byId.set(b.id, { ...b, chunks: [f] });
      else byId.get(b.id).chunks.push(f);
    }
    for (const r of c.roads || []) if (!roads.has(r.id)) roads.set(r.id, r);
  }
  const skip = new Set(hidden);
  for (const l of JSON.parse(readFileSync(ROOT + 'data/landmarks.json', 'utf8'))) for (const id of l.skip || []) skip.add(id);
  try { for (const id of JSON.parse(readFileSync(ROOT + 'data/sport.json', 'utf8')).skip || []) skip.add(id); } catch { /* нет файла */ }
  const series = new Set(Object.keys(JSON.parse(readFileSync(ROOT + 'data/series.json', 'utf8')).b || {}));
  const blds = [];
  for (const b of byId.values()) {
    if (skip.has(b.id) || !b.poly || b.poly.length < 6) continue;
    b.bb = bbox(b.poly);
    b.area = polyArea(b.poly);
    b.ser = b.ser || series.has(b.id);
    blds.push(b);
  }
  return { blds, roads: [...roads.values()], skip };
}

// сетка 64 м по рамкам
export function grid(items, bbOf, C = 64) {
  const g = new Map();
  items.forEach((it, i) => {
    const [x0, z0, x1, z1] = bbOf(it);
    for (let gx = Math.floor(x0 / C); gx <= Math.floor(x1 / C); gx++)
      for (let gz = Math.floor(z0 / C); gz <= Math.floor(z1 / C); gz++) {
        const k = gx + ',' + gz;
        if (!g.has(k)) g.set(k, []);
        g.get(k).push(i);
      }
  });
  return { near(bb) {
    const s = new Set();
    for (let gx = Math.floor(bb[0] / C); gx <= Math.floor(bb[2] / C); gx++)
      for (let gz = Math.floor(bb[1] / C); gz <= Math.floor(bb[3] / C); gz++) for (const i of g.get(gx + ',' + gz) || []) s.add(i);
    return s;
  } };
}

// ---------------------------------------------------------------- дома в домах
export function houseOverlaps(blds) {
  const G = grid(blds, b => b.bb);
  const out = [];
  blds.forEach((a, i) => {
    for (const j of G.near(a.bb)) {
      if (j <= i) continue;
      const b = blds[j];
      if (a.bb[2] <= b.bb[0] || b.bb[2] <= a.bb[0] || a.bb[3] <= b.bb[1] || b.bb[3] <= a.bb[1]) continue;
      // считаем по меньшему: его точки внутри большего
      const [s, l] = a.area <= b.area ? [a, b] : [b, a];
      const st = stepOf(s.area);
      const pts = s.__pts?.st === st ? s.__pts.p : (s.__pts = { st, p: samples(s, st) }).p;
      let n = 0;
      for (let k = 0; k < pts.length; k += 2) {
        const x = pts[k], z = pts[k + 1];
        if (x > l.bb[0] && x < l.bb[2] && z > l.bb[1] && z < l.bb[3] && inB(l, x, z)) n++;
      }
      const inter = n * st * st;
      if (inter < BB_MIN) continue;
      out.push({ s, l, inter, share: inter / s.area });
    }
  });
  return out;
}

// ---------------------------------------------------------------- дома на дороге
// асфальт рисуется у улиц классов 0–2 и у проездов (3) от 4 м (worldgen.js)
export const carriage = r => (r.c <= 2 || (r.c === 3 && r.w >= 4)) && !r.br && !r.tn && !r.l;
// ось улицы проходит сквозь дом — арка, проезд под домом или кривая ось: не трогаем
export function through(b, r) {
  const p = r.pts;
  for (let q = 0; q + 3 < p.length; q += 2) {
    const L = Math.hypot(p[q + 2] - p[q], p[q + 3] - p[q + 1]), n = Math.max(1, Math.ceil(L / 0.5));
    for (let k = 0; k <= n; k++) {
      const x = p[q] + (p[q + 2] - p[q]) * k / n, z = p[q + 1] + (p[q + 3] - p[q + 1]) * k / n;
      if (x > b.bb[0] && x < b.bb[2] && z > b.bb[1] && z < b.bb[3] && inPoly(b.poly, x, z)) return true;
    }
  }
  return false;
}
export function houseOnRoad(blds, roads) {
  const rs = roads.filter(carriage).map(r => ({ r, bb: (() => { const b = bbox(r.pts); return [b[0] - r.w, b[1] - r.w, b[2] + r.w, b[3] + r.w]; })() }));
  const G = grid(rs, x => x.bb);
  const out = [];
  for (const b of blds) {
    const near = [...G.near(b.bb)].map(i => rs[i]).filter(x => !(x.bb[2] <= b.bb[0] || b.bb[2] <= x.bb[0] || x.bb[3] <= b.bb[1] || b.bb[3] <= x.bb[1]));
    if (!near.length) continue;
    const st = stepOf(b.area);
    const pts = samples(b, st);
    for (const { r } of near) {
      const hw = r.w / 2;
      let n = 0, deep = 0;
      for (let k = 0; k < pts.length; k += 2) {
        const [d] = axisDist(r, pts[k], pts[k + 1]);
        if (d < hw) { n++; deep = Math.max(deep, hw - d); }
      }
      if (deep < ROAD_MIN) continue;
      out.push({ b, r, inter: n * st * st, deep, thru: through(b, r) });
    }
  }
  return out;
}

// ---------------------------------------------------------------- подрезка
// Вершины контура, зашедшие на полотно, отодвигаются по нормали к оси на
// кромку (полуширина + 5 см). Рёбра, пересекающие полотно, сначала
// дробятся по 1 м, лишние точки после сдвига снимаются, если легли на прямую.
const R1 = v => Math.round(v * 10) / 10;
function pushPoly(poly, rs) {
  const inStrip = (x, z) => rs.some(r => axisDist(r, x, z)[0] < r.w / 2);
  const n = poly.length / 2 - 1;             // контур замкнут: последняя = первая
  const pts = [];
  for (let i = 0; i < n; i++) {
    const ax = poly[i * 2], az = poly[i * 2 + 1], bx = poly[i * 2 + 2], bz = poly[i * 2 + 3];
    pts.push({ x: ax, z: az, own: 1 });
    const L = Math.hypot(bx - ax, bz - az), m = Math.floor(L);
    let hit = false;
    for (let k = 1; k < m * 4 && !hit; k++) hit = inStrip(ax + (bx - ax) * k / (m * 4), az + (bz - az) * k / (m * 4));
    if (hit) for (let k = 1; k < m; k++) pts.push({ x: ax + (bx - ax) * k / m, z: az + (bz - az) * k / m, own: 0 });
  }
  let moved = 0;
  for (const p of pts) {
    for (let it = 0; it < 4; it++) {
      let worst = null;
      for (const r of rs) {
        const [d, nx, nz] = axisDist(r, p.x, p.z), need = r.w / 2 + 0.05 - d;
        if (need > 0 && (!worst || need > worst[0])) worst = [need, nx, nz];
      }
      if (!worst) break;
      p.x += worst[1] * worst[0]; p.z += worst[2] * worst[0]; p.mv = 1; moved++;
    }
  }
  if (!moved) return null;
  // снять добавленные точки, не давшие излома, и совпавшие соседние
  let out = pts.map(p => ({ ...p, x: R1(p.x), z: R1(p.z) }));
  for (let changed = true; changed;) {
    changed = false;
    for (let i = 0; i < out.length && out.length > 3; i++) {
      const a = out[(i + out.length - 1) % out.length], p = out[i], b = out[(i + 1) % out.length];
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      const dev = L ? Math.abs((b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x)) / L : 0;
      const same = Math.hypot(p.x - a.x, p.z - a.z) < 0.15;
      if (same || (!p.own && dev < 0.15) || (p.mv && dev < 0.05)) { out.splice(i, 1); changed = true; i--; }
    }
  }
  const res = [];
  for (const p of out) res.push(p.x, p.z);
  res.push(res[0], res[1]);
  return res;
}
function selfCross(p) {
  const n = p.length / 2 - 1;
  const X = (ax, az, bx, bz, cx, cz) => (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    const [ax, az, bx, bz] = [p[i * 2], p[i * 2 + 1], p[i * 2 + 2], p[i * 2 + 3]];
    const [cx, cz, dx, dz] = [p[j * 2], p[j * 2 + 1], p[j * 2 + 2], p[j * 2 + 3]];
    if (X(ax, az, bx, bz, cx, cz) * X(ax, az, bx, bz, dx, dz) < 0 && X(cx, cz, dx, dz, ax, az) * X(cx, cz, dx, dz, bx, bz) < 0) return true;
  }
  return false;
}

// ---------------------------------------------------------------- план правок
// Кого из пары оставить: осмотренный руками, серия, с именем/вывеской, школа,
// с типом; дальше — больший.
const rank = b => (b.hand ? 100 : 0) + (b.ser ? 50 : 0) + (b.sg ? 10 : 0) + (b.n ? 10 : 0) + (b.school ? 5 : 0) + (b.t ? 2 : 0);
const keepOf = (a, b) => (rank(a) - rank(b) || a.area - b.area || b.h - a.h) >= 0 ? [a, b] : [b, a];
const locked = b => b.hand || b.ser;

export function plan(blds, roads) {
  const drop = new Map(), give = new Map(), poly = new Map(), left = { part: [], road: [] };
  const why = { dup: 0, inner: 0, outer: 0, tower: 0 };
  const giveTo = (to, from) => {
    const g = give.get(to.id) || {};
    if (from.n && !to.n && !g.n) g.n = from.n;
    if (from.sg) g.sg = [...(g.sg || []), ...from.sg.filter(s => !(to.sg || []).some(t => t.n === s.n))];
    if (from.school && !to.school) g.school = from.school;
    if (Object.keys(g).length && (g.n || g.sg?.length || g.school)) give.set(to.id, g);
  };
  const kill = (b, to, w) => { if (drop.has(b.id) || locked(b)) return false; drop.set(b.id, w); if (to) giveTo(to, b); why[w]++; return true; };
  const hh = houseOverlaps(blds);
  // 1) двойники: одно пятно нарисовано дважды
  for (const o of hh) {
    if (o.share > 0.8 && o.s.area / o.l.area > 0.8 && !drop.has(o.s.id) && !drop.has(o.l.id)) {
      const [k, d] = keepOf(o.s, o.l);
      kill(d, k, 'dup');
    }
  }
  // 2) внутри большего
  const inner = new Map();
  for (const o of hh) {
    if (o.share <= 0.5 || drop.has(o.s.id) || drop.has(o.l.id)) continue;
    if (!inner.has(o.l.id)) inner.set(o.l.id, { L: o.l, S: [] });
    inner.get(o.l.id).S.push(o);
  }
  for (const { L, S } of inner.values()) {
    const cover = S.reduce((s, o) => s + o.inter, 0) / L.area;
    // (если корпуса не ниже обвода: иначе обвод — сам высокий дом, а внутри
    // спрятаны низкие части, их и снимаем ниже)
    if (S.length >= 2 && cover >= 0.7 && !locked(L) && Math.max(...S.map(o => o.s.h)) >= L.h - 1) {
      // большой контур — обвод комплекса, внутри нарисованы сами корпуса
      const big = S.map(o => o.s).sort((a, b) => b.area - a.area)[0];
      kill(L, big, 'outer');
      continue;
    }
    for (const o of S) {
      if (o.s.h > L.h + 1) { why.tower++; continue; }    // корпус выше — башня над крышей, так и задумано
      kill(o.s, L, 'inner');
    }
  }
  for (const o of hh) if (o.share <= 0.5 && !drop.has(o.s.id) && !drop.has(o.l.id)) left.part.push(o);

  // 3) дом на дороге
  const hr = houseOnRoad(blds.filter(b => !drop.has(b.id)), roads);
  const byB = new Map();
  for (const o of hr) {
    if (!byB.has(o.b.id)) byB.set(o.b.id, { b: o.b, rs: [], thru: [] });
    (o.thru ? byB.get(o.b.id).thru : byB.get(o.b.id).rs).push(o);
  }
  const roadWhy = { cut: 0, thru: 0, locked: 0, roof: 0, holes: 0, big: 0, bad: 0 };
  for (const { b, rs, thru } of byB.values()) {
    if (thru.length) { roadWhy.thru++; left.road.push({ ...thru[0], w: 'ось' }); }
    if (!rs.length) continue;
    const no = w => { roadWhy[w]++; left.road.push({ ...rs[0], w }); };
    if (locked(b)) { no('locked'); continue; }
    if (b.t === 'roof' || b.t === 'carport') { no('roof'); continue; }   // навес: проезд под ним и есть
    if (b.holes) { no('holes'); continue; }
    const np = pushPoly(b.poly, rs.map(o => o.r));
    if (!np) continue;
    const a1 = polyArea(np);
    if (a1 < b.area * 0.6 || np.length < 8) { no('big'); continue; }
    if (a1 > b.area + 0.5) { no('bad'); continue; }
    if (selfCross(np)) { no('bad'); continue; }
    poly.set(b.id, { poly: np, a0: +b.area.toFixed(1) });
    roadWhy.cut++;
  }
  return { drop, give, poly, why, roadWhy, left, nHH: hh.length, nHR: byB.size };
}

// ---------------------------------------------------------------- запись
// data/overlaps.json — правки по id OSM. Их же применяет build-world.mjs при
// полной пересборке (контур — только если пятно OSM не изменилось, a0).
export function applyTo(list, fx, far = false) {
  let n = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    const b = list[i];
    if (fx.drop[b.id]) { list.splice(i, 1); n++; continue; }
    const p = fx.poly[b.id];
    if (p && Math.abs(polyArea(b.poly) - p.a0) <= Math.max(1, p.a0 * 0.01)) { b.poly = p.poly; n++; }
    const g = !far && fx.give[b.id];
    if (g) {
      if (g.n && !b.n) b.n = g.n;
      if (g.sg) b.sg = [...(b.sg || []), ...g.sg.filter(s => !(b.sg || []).some(t => t.n === s.n))];
      if (g.school && !b.school) b.school = g.school;
      n++;
    }
  }
  return n;
}

// ---------------------------------------------------------------- отчёт
const isMain = process.argv[1] && new URL(import.meta.url).pathname === process.argv[1];
if (isMain) {
  const WRITE = process.argv.includes('--write');
  const { blds, roads } = loadCity();
  const c = b => { const [x0, z0, x1, z1] = b.bb; return `${((x0 + x1) / 2).toFixed(0)},${((z0 + z1) / 2).toFixed(0)}`; };
  const tag = b => `${b.id}${b.n ? ' «' + b.n + '»' : ''}${b.t ? ' ' + b.t : ''} ${b.area.toFixed(0)}м² ${b.h}м${b.ser ? ' серия' : ''}${b.hand ? ' hand' : ''}`;
  console.log(`домов на карте: ${blds.length}`);
  const P = plan(blds, roads);
  console.log(`дом в доме: ${P.nHH} пар (≥ ${BB_MIN} м²); снять: двойник ${P.why.dup}, внутри большего ${P.why.inner}, обвод комплекса ${P.why.outer}; башня над корпусом (оставлена) ${P.why.tower}; частично, не тронуто ${P.left.part.length}`);
  console.log(`дом на дороге: ${P.nHR} домов (заход ≥ ${ROAD_MIN} м); подрезано ${P.roadWhy.cut}; ось сквозь дом (арка, не тронуто) ${P.roadWhy.thru}; не тронуто: руками/серия ${P.roadWhy.locked}, навес ${P.roadWhy.roof}, с дырами ${P.roadWhy.holes}, срез > 40% ${P.roadWhy.big}, контур ломается ${P.roadWhy.bad}`);
  const N = LIST ? 1e9 : 15;
  if (P.left.part.length) console.log('частичные пересечения:');
  for (const o of P.left.part.sort((a, b) => b.inter - a.inter).slice(0, N))
    console.log(`  ${o.inter.toFixed(1).padStart(7)} м² ${(o.share * 100).toFixed(0).padStart(3)}%  at=${c(o.s)}  ${tag(o.s)}  ∩  ${tag(o.l)}`);
  if (P.left.road.length) console.log('на дороге, не тронуто:');
  for (const o of P.left.road.sort((a, b) => b.deep - a.deep).slice(0, N))
    console.log(`  [${o.w}] ${o.deep.toFixed(1).padStart(5)} м  at=${c(o.b)}  ${tag(o.b)}  на ${o.r.id} «${o.r.n || ''}» c${o.r.c} w${o.r.w}`);
  if (LIST) {
    const byId = new Map(blds.map(b => [b.id, b]));
    for (const [id, w] of P.drop) console.log(`  снять [${w}] at=${c(byId.get(id))} ${tag(byId.get(id))}`);
    for (const [id, p] of P.poly) console.log(`  подрезать at=${c(byId.get(id))} ${tag(byId.get(id))} → ${polyArea(p.poly).toFixed(0)} м²`);
  }
  if (WRITE) {
    const F = ROOT + 'data/overlaps.json';
    let fx = { drop: {}, poly: {}, give: {} };
    try { fx = JSON.parse(readFileSync(F, 'utf8')); } catch { /* первый прогон */ }
    for (const [id, w] of P.drop) fx.drop[id] = w;
    // повторный прогон дорезает уже подрезанный контур: a0 остаётся от пятна OSM
    for (const [id, p] of P.poly) fx.poly[id] = { ...p, a0: fx.poly[id]?.a0 ?? p.a0 };
    for (const [id, g] of P.give) fx.give[id] = { ...(fx.give[id] || {}), ...g };
    fx.note = 'tools/overlaps.mjs: drop — снять дом (dup двойник, inner внутри большего, outer обвод комплекса); poly — контур, отодвинутый с проезжей части (a0 — площадь исходного пятна OSM); give — имя и вывески снятого дома его соседу';
    writeFileSync(F, JSON.stringify(fx));
    const sub = { drop: Object.fromEntries(P.drop), poly: Object.fromEntries(P.poly), give: Object.fromEntries(P.give) };
    const W = JSON.parse(readFileSync(ROOT + 'data/world.json', 'utf8'));
    console.log(`world.json: правок ${applyTo(W.buildings, sub)}`);
    writeFileSync(ROOT + 'data/world.json', JSON.stringify(W));
    let nc = 0;
    for (const f of readdirSync(ROOT + 'data/chunks')) {
      if (!f.endsWith('.json') || f === 'index.json') continue;
      const d = JSON.parse(readFileSync(ROOT + 'data/chunks/' + f, 'utf8'));
      if (!Array.isArray(d.buildings)) continue;
      if (applyTo(d.buildings, sub, f === 'far.json')) { writeFileSync(ROOT + 'data/chunks/' + f, JSON.stringify(d)); nc++; }
    }
    console.log(`чанков переписано: ${nc}`);
  }
}
