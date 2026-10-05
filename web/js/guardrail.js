import * as THREE from 'three';

// Отбойники и ограждения трассы Севастополь — Ялта.
//
// Трасса — дороги первых двух классов (c ≤ 1), лежащие на осевой из
// data/route-yalta.json (та же реальная геометрия OSM, что режет коридор
// чанков). Ограждений шоссе в OSM почти нет (в данных — пять guard_rail на
// весь город), поэтому место отбойника выводим из самой дороги и рельефа:
//   • внешняя кромка поворота радиусом меньше CURVE_R;
//   • кромка над обрывом: земля за обочиной ниже полотна на DROP1 м в 8 м
//     от кромки или на DROP2 м в 16 м.
// Не ставим у примыканий (перекрёсток, съезд, соседняя улица ближе NEAR м),
// в посёлках (дом ближе 15 м) и на мостах — там вместо стали бетонные блоки «Нью-Джерси» по
// обеим кромкам. На прямых без отбойника — сигнальные столбики С1 со
// светоотражателями: раз в 50 м, в повороте — чаще.
//
// Всё инстансами: на квадрат до трёх сеток (звено отбойника со стойкой,
// блоки, столбики).
// Отбойник и блоки толкают машину — тонкими контурами в общий Collider.
// Строится только то, что лежит в СВОЁМ квадрате чанка: длинная дорога
// приходит в каждый квадрат целиком, а ставить её ограждение надо один раз.

const STEP = 4;               // шаг выборки вдоль дороги и длина звена балки, м
const CURVE_R = 230;          // поворот круче этого радиуса — отбойник снаружи
const DROP1 = 2.5, DROP2 = 4.5;
const NEAR = 6;               // зазор до кромки чужой дороги, м
const ROUTE_NEAR = 90;        // дорога трассы — не дальше этого от осевой
const MIN_RUN = 6;            // короче 24 м отбойник не ставим
const GAP = 3;                // дыры до 12 м зашиваем
const GROW = 3;               // заход за поворот/обрыв — по 12 м с концов

const STEEL = [0.66, 0.68, 0.68], POST = [0.42, 0.43, 0.44], CONCRETE = [0.74, 0.73, 0.70];
const WHITE = [0.92, 0.92, 0.90], BLACK = [0.06, 0.06, 0.06], RED = [0.80, 0.08, 0.06];

// ---- осевая трассы
// Проекция — копия tools/config.mjs (там источник истины, как и в terrain.js):
// масштаб долготы по широте точки.
const RAD = Math.PI / 180, O_LAT = 44.6166, O_LON = 33.5254;
const M_LAT = 111132.92 - 559.82 * Math.cos(2 * O_LAT * RAD) + 1.175 * Math.cos(4 * O_LAT * RAD);
const mLon = lat => 111412.84 * Math.cos(lat * RAD) - 93.5 * Math.cos(3 * lat * RAD);
const RCELL = 200;
let ROUTE = null;             // клетка 200 м → [x, z, …]

export async function loadGuardrail(v) {
  const d = await fetch(`../data/route-yalta.json${v ? '?v=' + v : ''}`)
    .then(r => r.ok ? r.json() : null).catch(() => null);
  ROUTE = new Map();
  for (const [lat, lon] of (d && d.pts) || []) {
    const x = (lon - O_LON) * mLon(lat), z = -(lat - O_LAT) * M_LAT;
    const k = Math.floor(x / RCELL) + ',' + Math.floor(z / RCELL);
    (ROUTE.get(k) || ROUTE.set(k, []).get(k)).push(x, z);
  }
}

function routeDist(x, z) {
  const cx = Math.floor(x / RCELL), cz = Math.floor(z / RCELL);
  let b = Infinity;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const a = ROUTE.get((cx + i) + ',' + (cz + j));
    if (a) for (let k = 0; k < a.length; k += 2) b = Math.min(b, Math.hypot(x - a[k], z - a[k + 1]));
  }
  return b;
}

// дорога трассы: класс ≤ 1 и не меньше 80% вершин у осевой
function onRoute(r) {
  if (r.c > 1 || r.tn || !r.pts || r.pts.length < 4) return false;
  const p = r.pts, n = p.length / 2;
  let ok = 0;
  for (let i = 0; i < p.length; i += 2) if (routeDist(p[i], p[i + 1]) < ROUTE_NEAR) ok++;
  return ok >= n * 0.8;
}

// ---- соседи: улицы и дома в сетке, чтобы проверка точки стоила O(1)
function segGrid(roads, cell) {
  const map = new Map();
  for (const r of roads) {
    if (r.c > 3 || !r.pts) continue;
    const p = r.pts;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const pad = r.w / 2 + NEAR;
      const x0 = Math.floor((Math.min(p[i], p[i + 2]) - pad) / cell), x1 = Math.floor((Math.max(p[i], p[i + 2]) + pad) / cell);
      const z0 = Math.floor((Math.min(p[i + 1], p[i + 3]) - pad) / cell), z1 = Math.floor((Math.max(p[i + 1], p[i + 3]) + pad) / cell);
      for (let a = x0; a <= x1; a++) for (let b = z0; b <= z1; b++) {
        const k = a * 100003 + b;
        (map.get(k) || map.set(k, []).get(k)).push(r, i);
      }
    }
  }
  // Чужая улица ближе её кромки + NEAR. Продолжение той же трассы (OSM режет
  // шоссе на сотни путей) чужим не считаем: оно идёт параллельно (tx, tz) и
  // точка стоит от его осевой на свой же вынос off. С tx = 0 — любая улица.
  // skipBr — мосты не в счёт (проверка «под мостом проходит улица»).
  return (x, z, self, tx = 0, tz = 0, off = 0, skipBr = false) => {
    const l = map.get(Math.floor(x / cell) * 100003 + Math.floor(z / cell));
    if (!l) return false;
    for (let k = 0; k < l.length; k += 2) {
      const r = l[k];
      if (r === self || (skipBr && (r.br || r.tn))) continue;
      const p = r.pts, i = l[k + 1];
      const ax = p[i], az = p[i + 1], vx = p[i + 2] - ax, vz = p[i + 3] - az;
      const vv = vx * vx + vz * vz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / vv));
      const dist = Math.hypot(x - ax - t * vx, z - az - t * vz);
      if (dist >= r.w / 2 + NEAR) continue;
      if (tx || tz) {
        if (r.c <= 1 && Math.abs(tx * vx + tz * vz) / Math.sqrt(vv) > 0.95 && Math.abs(dist - off) < 1.5) continue;
      }
      return true;
    }
    return false;
  };
}

function inPoly(p, x, z) {
  let inside = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], zi = p[i + 1], xj = p[j], zj = p[j + 1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// точка в доме или ближе pad к его рамке
function houseGrid(buildings, cell) {
  const map = new Map();
  for (const b of buildings || []) {
    const p = b.poly;
    if (!p || p.length < 6) continue;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < p.length; i += 2) {
      x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); z0 = Math.min(z0, p[i + 1]); z1 = Math.max(z1, p[i + 1]);
    }
    const box = { p, x0, x1, z0, z1 };
    for (let a = Math.floor((x0 - 20) / cell); a <= Math.floor((x1 + 20) / cell); a++)
      for (let c = Math.floor((z0 - 20) / cell); c <= Math.floor((z1 + 20) / cell); c++) {
        const k = a * 100003 + c;
        (map.get(k) || map.set(k, []).get(k)).push(box);
      }
  }
  return (x, z, pad) => {
    const l = map.get(Math.floor(x / cell) * 100003 + Math.floor(z / cell));
    if (!l) return false;
    for (const b of l) {
      if (x < b.x0 - pad || x > b.x1 + pad || z < b.z0 - pad || z > b.z1 + pad) continue;
      if (pad > 0 || inPoly(b.p, x, z)) return true;
    }
    return false;
  };
}

// ломаная → точки через STEP м
function densify(p) {
  const out = [];
  for (let i = 0; i + 3 < p.length; i += 2) {
    const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3];
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / STEP));
    for (let k = 0; k < n; k++) out.push(ax + (bx - ax) * k / n, az + (bz - az) * k / n);
  }
  out.push(p[p.length - 2], p[p.length - 1]);
  return out;
}

// флаги → отрезки [i0, i1]: зашить дыры, нарастить концы, выкинуть короткие
function runs(f) {
  const n = f.length, g = Uint8Array.from(f);
  for (let i = 0; i < n; i++) if (f[i]) for (let k = Math.max(0, i - GROW); k <= Math.min(n - 1, i + GROW); k++) g[k] = 1;
  const out = [];
  let s = -1;
  for (let i = 0; i <= n; i++) {
    if (i < n && g[i]) { if (s < 0) s = i; continue; }
    if (s >= 0) {
      const last = out[out.length - 1];
      if (last && s - last[1] <= GAP) last[1] = i - 1; else out.push([s, i - 1]);
      s = -1;
    }
  }
  return out.filter(([a, b]) => b - a >= MIN_RUN);
}

// До сборки сооружений: решает, где что стоит, и отдаёт стены для Collider.
// Мостам трассы ставит метку blocks — перила и бортик моста (yards.js) там не
// рисуются, вместо них бетонные блоки.
export function prepGuardrail(w, terrain, d, S) {
  w.__rails = null;
  if (!ROUTE || !ROUTE.size || (w.roads.ctx && w.roads.ctx.orphan)) return [];
  const mine = w.roads.filter(onRoute);
  const bridges = (w.__bridges || []).filter(b => b.w >= 6 && b.pts.length >= 8 &&
    routeDist((b.pts[0] + b.pts[b.pts.length - 4]) / 2, (b.pts[1] + b.pts[b.pts.length - 3]) / 2) < ROUTE_NEAR);
  if (!mine.length && !bridges.length) return [];

  const x0 = d.cx * S, z0 = d.cz * S;
  const own = (x, z) => x >= x0 && x < x0 + S && z >= z0 && z < z0 + S;
  const nearRoad = segGrid(w.roads, 32);
  const house = houseGrid(w.allBuildings || w.buildings, 32);
  const jn = (w.junctions || []).filter(j => j.x > x0 - 100 && j.x < x0 + S + 100 && j.z > z0 - 100 && j.z < z0 + S + 100);
  const atJunction = (x, z) => jn.some(j => Math.hypot(x - j.x, z - j.z) < (j.r || 8) + NEAR);
  const H = (x, z) => terrain.driveHeightAt(x, z), G = (x, z) => terrain.gridHeightAt(x, z);

  const rails = [], posts = [], walls = [];
  const stat = { curve: 0, drop: 0 };

  for (const r of mine) {
    if (r.br) continue;                            // мост — блоками ниже
    const q = densify(r.pts), n = q.length / 2;
    if (n < MIN_RUN + 2) continue;
    const hw = r.w / 2;
    // касательная, нормаль (вправо по ходу) и кривизна через ±5 точек (±20 м)
    const T = new Float32Array(n * 2), K = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      const tx = q[b * 2] - q[a * 2], tz = q[b * 2 + 1] - q[a * 2 + 1], l = Math.hypot(tx, tz) || 1;
      T[i * 2] = tx / l; T[i * 2 + 1] = tz / l;
    }
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 5), b = Math.min(n - 1, i + 5);
      if (b - a < 6) continue;
      const da = Math.atan2(T[b * 2], T[b * 2 + 1]) - Math.atan2(T[a * 2], T[a * 2 + 1]);
      const dth = Math.atan2(Math.sin(da), Math.cos(da));
      K[i] = dth / ((b - a) * STEP);               // > 0 — поворот к нормали sg = 1
    }
    for (const sg of [1, -1]) {
      // нормаль (tz, −tx) смотрит вправо по ходу; sg = −1 — левая кромка
      const want = new Uint8Array(n), bad = new Uint8Array(n), why = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        const px = q[i * 2], pz = q[i * 2 + 1];
        const nx = T[i * 2 + 1] * sg, nz = -T[i * 2] * sg;
        const ex = px + nx * (hw + 0.6), ez = pz + nz * (hw + 0.6);
        // чужая улица, перекрёсток, дом рядом — здесь не ставим совсем
        if (nearRoad(ex, ez, r, T[i * 2], T[i * 2 + 1], hw + 0.6) || atJunction(ex, ez)) { bad[i] = 1; continue; }
        // в посёлке (дом ближе 15 м) — тротуар и заборы, отбойника нет
        if (house(ex, ez, 15)) { bad[i] = 1; continue; }
        // внешняя кромка: K > 0 — дорога заворачивает к нормали sg = 1
        // (центр поворота с её стороны), снаружи тогда кромка sg = −1
        const outer = Math.abs(K[i]) > 1 / CURVE_R && Math.sign(K[i]) === -sg;
        const hc = H(px, pz);
        const drop = hc - G(px + nx * (hw + 8), pz + nz * (hw + 8)) > DROP1 ||
                     hc - G(px + nx * (hw + 16), pz + nz * (hw + 16)) > DROP2;
        if (outer || drop) { want[i] = 1; why[i] = drop ? 2 : 1; }
      }
      const rr = runs(want).map(([a, b]) => {
        // наращённый конец не должен залезать в запретное
        while (a <= b && bad[a]) a++;
        while (b >= a && bad[b]) b--;
        return [a, b];
      }).filter(([a, b]) => b - a >= MIN_RUN);
      const has = new Uint8Array(n);
      for (const [a, b] of rr) {
        let wall = null, wn = [0, 0];
        for (let i = a; i <= b; i++) {
          has[i] = 1;
          if (bad[i]) { wall = null; continue; }
          const px = q[i * 2], pz = q[i * 2 + 1];
          const nx = T[i * 2 + 1] * sg, nz = -T[i * 2] * sg;
          const off = hw + 0.5;
          const x = px + nx * off, z = pz + nz * off;
          const y = H(px + nx * (hw - 0.2), pz + nz * (hw - 0.2));
          if (i < b && !bad[i + 1] && own(x, z)) {
            const qx = q[i * 2 + 2] + T[i * 2 + 3] * sg * off, qz = q[i * 2 + 3] - T[i * 2 + 2] * sg * off;
            const qy = H(q[i * 2 + 2] + T[i * 2 + 3] * sg * (hw - 0.2), q[i * 2 + 3] - T[i * 2 + 2] * sg * (hw - 0.2));
            rails.push(x, y, z, qx, qy, qz, -nx, -nz);
            if (why[i] === 2) stat.drop++; else stat.curve++;
          }
          // стена — по своему квадрату, кусками
          wn = [nx, nz];
          if (own(x, z)) { (wall ||= []).push(x, z); } else if (wall) { pushWall(walls, wall, nx, nz); wall = null; }
          if (wall && (i === b || bad[i + 1])) { pushWall(walls, wall, nx, nz); wall = null; }
        }
        if (wall) pushWall(walls, wall, wn[0], wn[1]);
      }
      // столбики там, где отбойника нет: раз в 50 м, в повороте — раз в 16 м
      let last = -999;
      for (let i = 0; i < n; i++) {
        if (has[i] || bad[i]) continue;
        const curve = Math.abs(K[i]) > 1 / 600;
        if ((i - last) * STEP < (curve ? 16 : 50)) continue;
        const px = q[i * 2], pz = q[i * 2 + 1];
        const nx = T[i * 2 + 1] * sg, nz = -T[i * 2] * sg;
        const x = px + nx * (hw + 1.0), z = pz + nz * (hw + 1.0);
        last = i;
        if (own(x, z)) posts.push(x, G(x, z), z, -nx, -nz);
      }
    }
  }

  // мосты трассы: бетонные блоки по обеим кромкам полотна. Стена — только
  // там, где под мостом не проходит другая улица (Collider плоский).
  const blocks = [];
  for (const b of bridges) {
    const p = b.pts, m = p.length / 4;
    let any = false;
    for (const sg of [1, -1]) {
      let wall = null, wn = [0, 0];
      for (let i = 0; i < m - 1; i++) {
        const ax = p[i * 4], az = p[i * 4 + 1], ay = p[i * 4 + 2];
        const bx = p[i * 4 + 4], bz = p[i * 4 + 5], by = p[i * 4 + 6];
        const L = Math.hypot(bx - ax, bz - az);
        if (L < 0.5) continue;
        const ux = (bx - ax) / L, uz = (bz - az) / L, nx = uz * sg, nz = -ux * sg;
        const off = b.w / 2 + 0.05;
        const k = Math.max(1, Math.round(L / 2));
        for (let j = 0; j < k; j++) {
          const t0 = j / k, t1 = (j + 1) / k;
          const x = ax + (bx - ax) * t0 + nx * off, z = az + (bz - az) * t0 + nz * off;
          const x1 = ax + (bx - ax) * t1 + nx * off, z1 = az + (bz - az) * t1 + nz * off;
          blocks.push(x, ay + (by - ay) * t0, z, x1, ay + (by - ay) * t1, z1, -nx, -nz);
          any = true;
          if (!nearRoad(x, z, null, 0, 0, 0, true)) (wall ||= []).push(x, z);
          else if (wall) { pushWall(walls, wall, nx, nz); wall = null; }
          wn = [nx, nz];
        }
      }
      if (wall) pushWall(walls, wall, wn[0], wn[1]);
    }
    if (any) b.blocks = true;
  }

  w.__rails = { rails, posts, blocks, stat };
  return walls;
}

// Тонкая стенка по ломаной: туда по линии, обратно со сдвигом наружу на 0.3 м.
// Collider берёт замкнутые контуры; машина упирается во внутреннюю сторону.
function pushWall(walls, line, nx, nz) {
  if (line.length < 4) return;
  // наружу — по нормали последней точки (повороты пологие, хватает)
  const n = line.length / 2, poly = line.slice();
  for (let i = n - 1; i >= 0; i--) poly.push(line[i * 2] + nx * 0.3, line[i * 2 + 1] + nz * 0.3);
  walls.push({ poly });
}

// ---- геометрия
// Своя сборка из граней без донышек и торцов: звеньев на квадрат сотни, и
// каждый лишний треугольник множится на них (бюджет задачи — +5%).
const s2l = v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);

class Faces {
  constructor() { this.p = []; this.n = []; this.c = []; }
  // четырёхугольник a-b-c-d; лицом туда, куда смотрит hint
  quad(a, b, c, d, hint, col) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) { [b, d] = [d, b]; nx = -nx; ny = -ny; nz = -nz; }
    const l = Math.hypot(nx, ny, nz) || 1, lc = col.map(s2l);
    for (const v of [a, b, c, a, c, d]) { this.p.push(...v); this.n.push(nx / l, ny / l, nz / l); this.c.push(...lc); }
  }
  // брус без дна: x0..x1, y0..y1, z0..z1
  box(x0, x1, y0, y1, z0, z1, col, top = true) {
    this.quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [1, 0, 0], col);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], col);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], col);
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1], col);
    if (top) this.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0], col);
  }
  // профиль (x, y), вытянутый по z от 0 до len; грани наружу от центра (cx, cy)
  sweep(prof, len, cx, cy, col, closed = false) {
    const m = prof.length;
    for (let k = 0; k < (closed ? m : m - 1); k++) {
      const [x0, y0] = prof[k], [x1, y1] = prof[(k + 1) % m];
      const hint = [(x0 + x1) / 2 - cx, (y0 + y1) / 2 - cy, 0];
      this.quad([x0, y0, 0], [x1, y1, 0], [x1, y1, len], [x0, y0, len], hint, col);
    }
  }
  geo() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    return g;
  }
}

// звено отбойника на STEP м (растягивается по z): балка «волна» лицом к
// дороге (+x, лицо на x = 0) и стойка позади неё посередине звена —
// 18 треугольников
function railGeo() {
  const f = new Faces();
  f.sweep([[0, 0.44], [0.06, 0.50], [0.025, 0.595], [0.06, 0.69], [0, 0.75]], STEP, -1, 0.6, STEEL);
  f.quad([-0.03, 0.44, 0], [-0.03, 0.44, STEP], [-0.03, 0.75, STEP], [-0.03, 0.75, 0], [-1, 0, 0], STEEL);
  // стойка от −1.07 (в грунте откоса) до 0.72, без торцов
  const z = STEP / 2;
  f.box(-0.13, -0.03, -1.07, 0.72, z - 0.05, z + 0.05, POST, false);
  return f.geo();
}
// «Нью-Джерси»: основание 0.6 м, высота 0.81 м, звено 1.95 м (по z от 0)
function blockGeo() {
  const f = new Faces();
  const P = [[0.3, -0.05], [0.3, 0.08], [0.2, 0.33], [0.08, 0.81], [-0.08, 0.81], [-0.2, 0.33], [-0.3, 0.08], [-0.3, -0.05]];
  f.sweep(P, 1.95, 0, 0.3, CONCRETE);
  // торцы: блоки стоят с зазором, их видно
  for (const z of [0, 1.95]) {
    const h = [0, 0, z ? 1 : -1];
    f.quad([0.3, -0.05, z], [0.3, 0.08, z], [-0.3, 0.08, z], [-0.3, -0.05, z], h, CONCRETE);
    f.quad([0.3, 0.08, z], [0.2, 0.33, z], [-0.2, 0.33, z], [-0.3, 0.08, z], h, CONCRETE);
    f.quad([0.2, 0.33, z], [0.08, 0.81, z], [-0.08, 0.81, z], [-0.2, 0.33, z], h, CONCRETE);
  }
  return f.geo();
}
// столбик С1: белый, чёрная полоса наверху, красный светоотражатель к дороге (+x)
function delinGeo() {
  const f = new Faces();
  f.box(-0.05, 0.05, -0.25, 0.82, -0.06, 0.06, WHITE, false);
  f.box(-0.05, 0.05, 0.82, 1.07, -0.06, 0.06, BLACK, false);
  f.box(-0.05, 0.05, 1.07, 1.2, -0.06, 0.06, WHITE);
  f.quad([0.052, 0.87, -0.03], [0.052, 0.87, 0.03], [0.052, 1.02, 0.03], [0.052, 1.02, -0.03], [1, 0, 0], RED);
  return f.geo();
}

const _m = new THREE.Matrix4(), _X = new THREE.Vector3(), _Y = new THREE.Vector3(), _Z = new THREE.Vector3(),
      _P = new THREE.Vector3(), _S = new THREE.Vector3(), _Q = new THREE.Quaternion();

// звено от a к b: z — вдоль (с уклоном), x — к дороге (ix, iz), y — вверх
function linkMatrix(ax, ay, az, bx, by, bz, ix, iz, len) {
  _Z.set(bx - ax, by - ay, bz - az);
  const L = _Z.length() || 1;
  _Z.divideScalar(L);
  _X.set(ix, 0, iz);
  _Y.crossVectors(_Z, _X);
  if (_Y.y < 0) {                                 // идём от b к a, чтобы y смотрел вверх
    _Z.negate(); _Y.crossVectors(_Z, _X);
    [ax, ay, az] = [bx, by, bz];
  }
  _Y.normalize();
  _X.crossVectors(_Y, _Z);                         // нормаль на звене не строго поперёк
  _m.makeBasis(_X, _Y, _Z);
  _m.scale(_S.set(1, 1, len ? L / len : L));
  _m.setPosition(ax, ay, az);
  return _m;
}
function standMatrix(x, y, z, ix, iz) {
  _Q.setFromAxisAngle(_Y.set(0, 1, 0), Math.atan2(ix, iz) - Math.PI / 2);
  return _m.compose(_P.set(x, y, z), _Q, _S.set(1, 1, 1));
}

function inst(geo, mat, n, name, fill) {
  const m = new THREE.InstancedMesh(geo, mat, n);
  m.name = name;
  for (let i = 0; i < n; i++) m.setMatrixAt(i, fill(i));
  m.instanceMatrix.needsUpdate = true;
  m.computeBoundingSphere();
  m.receiveShadow = true;
  return m;
}

export function buildGuardrail(w) {
  const g = new THREE.Group();
  g.name = 'отбойники';
  const R = w.__rails;
  if (!R) return g;
  const metal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2 });
  const plain = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.0 });
  const { rails, posts, blocks } = R;
  const nr = rails.length / 8;
  // тень от тонкой стали не видна, а проход в карту теней — лишний вызов
  if (nr) g.add(inst(railGeo(), metal, nr, 'отбойник', i => {
    const r = rails.slice(i * 8, i * 8 + 8);
    return linkMatrix(r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], STEP);
  }));
  const nb = blocks.length / 8;
  if (nb) {
    const bl = inst(blockGeo(), plain, nb, 'блоки на мосту', i => {
      const r = blocks.slice(i * 8, i * 8 + 8);
      return linkMatrix(r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], 2);
    });
    bl.castShadow = true;
    g.add(bl);
  }
  const np = posts.length / 5;
  if (np) {
    const d = inst(delinGeo(), plain, np, 'сигнальные столбики', i =>
      standMatrix(posts[i * 5], posts[i * 5 + 1], posts[i * 5 + 2], posts[i * 5 + 3], posts[i * 5 + 4]));
    d.userData.far = 400;
    g.add(d);
  }
  g.userData.counts = { отбойник: nr, блоки: nb, столбики: np };
  return g;
}
