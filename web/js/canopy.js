import * as THREE from 'three';
import { buildFuelSigns } from './fuel.js?v=e287a336';

// Навесы: OSM building=roof. Это крыша без стен — навес АЗС, рынка, стоянки,
// крыльца. Раньше они шли общим сборщиком домов, а этажность им подбиралась
// по соседям: навес АЗС у «Атана» на Руднева вырастал пятиэтажкой 17.7 м
// прямо на проезде. Здесь навес — тонкая плита на столбах, под ней проезд.
// В индекс стен идут только столбы (canopyWalls), сама плита машину не держит.

export const isCanopy = b => b && b.t === 'roof';

// Высота низа плиты над землёй. В OSM у навесов высоты почти нет; если есть
// (из тега height / levels) и она правдоподобна для навеса — берём её, иначе
// по размеру: козырёк крыльца, навес стоянки, навес АЗС (под ним фура).
export function canopyHeight(b, area) {
  if (b.lv && b.h >= 2.6 && b.h <= 8) return b.h;
  if (area < 40) return 2.8;
  if (area < 150) return 3.6;
  return 5.0;
}

const SLAB = 0.45;                 // толщина плиты с фризом
const POST = 0.36;                 // сечение столба
const POST_STEP = 9;               // шаг столбов вдоль навеса

function polyArea(p) {
  let a = 0;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) a += (p[j] - p[i]) * (p[j + 1] + p[i + 1]);
  return a / 2;
}
function inside(x, z, p) {
  let c = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], zi = p[i + 1], xj = p[j], zj = p[j + 1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
  }
  return c;
}
// Расстояние от точки до контура — столб не ставим вплотную к краю плиты
function edgeDist(x, z, p) {
  let best = Infinity;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const ax = p[j], az = p[j + 1], vx = p[i] - ax, vz = p[i + 1] - az;
    const l2 = vx * vx + vz * vz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2));
    best = Math.min(best, Math.hypot(x - ax - t * vx, z - az - t * vz));
  }
  return best;
}
// Наименьший охватывающий прямоугольник по рёбрам контура
function obb(p) {
  const n = p.length / 2;
  let best = null;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = p[j * 2] - p[i * 2], dz = p[j * 2 + 1] - p[i * 2 + 1], l = Math.hypot(dx, dz);
    if (l < 0.5) continue;
    const ux = dx / l, uz = dz / l;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let k = 0; k < n; k++) {
      const u = p[k * 2] * ux + p[k * 2 + 1] * uz, v = -p[k * 2] * uz + p[k * 2 + 1] * ux;
      if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v;
    }
    const ar = (u1 - u0) * (v1 - v0);
    if (!best || ar < best.ar) best = { ar, ux, uz, u0, u1, v0, v1 };
  }
  if (!best) return null;
  // длинная ось — u
  if (best.v1 - best.v0 > best.u1 - best.u0) {
    const { ux, uz, u0, u1, v0, v1 } = best;
    return { ux: -uz, uz: ux, u0: v0, u1: v1, v0: -u1, v1: -u0 };
  }
  return best;
}

// Столбы навеса: рядами вдоль длинной оси (один ряд по середине, у широкого
// навеса — два), с шагом не больше POST_STEP. Только там, где точка внутри
// контура и не ближе 0.6 м к его краю (у вогнутых контуров ряд рвётся).
function posts(b) {
  if (b.__posts) return b.__posts;
  const p = b.poly, o = obb(p), out = [];
  if (o) {
    const L = o.u1 - o.u0, D = o.v1 - o.v0;
    const rows = D > 13 ? [o.v0 + D * 0.25, o.v0 + D * 0.75] : [(o.v0 + o.v1) / 2];
    const inset = Math.min(1.2, L * 0.2);
    const k = Math.max(1, Math.ceil((L - 2 * inset) / POST_STEP));
    for (const v of rows) for (let i = 0; i <= k; i++) {
      const u = L - 2 * inset < 1 ? (o.u0 + o.u1) / 2 : o.u0 + inset + (L - 2 * inset) * i / k;
      const x = u * o.ux - v * o.uz, z = u * o.uz + v * o.ux;
      if (!inside(x, z, p) || edgeDist(x, z, p) < 0.6) continue;
      if (out.some(q => Math.hypot(q[0] - x, q[1] - z) < 2)) continue;
      out.push([x, z, o.ux, o.uz]);
    }
    if (!out.length) {                       // крошечный или кривой контур: один столб в середине
      let cx = 0, cz = 0;
      for (let i = 0; i < p.length; i += 2) { cx += p[i]; cz += p[i + 1]; }
      cx /= p.length / 2; cz /= p.length / 2;
      if (inside(cx, cz, p)) out.push([cx, cz, o.ux, o.uz]);
    }
  }
  return (b.__posts = out);
}

// Стены для индекса столкновений: только столбы навесов квартала
export function canopyWalls(world, skip) {
  const out = [];
  (world.buildings || []).forEach((b, i) => {
    if (!isCanopy(b) || b.hide || (skip && skip.has(i))) return;
    const h = POST / 2;
    for (const [x, z, ux, uz] of posts(b)) {
      const c = (a, d) => [x + ux * a - uz * d, z + uz * a + ux * d];
      out.push({ poly: [...c(-h, -h), ...c(h, -h), ...c(h, h), ...c(-h, h)] });
    }
  });
  return out;
}

const TOP = [0.42, 0.43, 0.44], FASCIA = [0.86, 0.87, 0.86], SOFFIT = [0.80, 0.80, 0.78], STEEL = [0.55, 0.56, 0.58];

// Все навесы квартала одной сеткой (цвет в вершинах).
export function buildCanopies(world, terrain, skip) {
  const P = [], N = [], C = [];
  const tri = (a, b, c, n, col) => {
    P.push(...a, ...b, ...c);
    for (let k = 0; k < 3; k++) { N.push(...n); C.push(...col); }
  };
  const quad = (a, b, c, d, n, col) => { tri(a, b, c, n, col); tri(a, c, d, n, col); };
  let n = 0;
  (world.buildings || []).forEach((b, bi) => {
    if (!isCanopy(b) || b.hide || (skip && skip.has(bi))) return;
    const p = b.poly, m = p.length / 2;
    if (m < 3) return;
    const ar = Math.abs(polyArea(p));
    // Плита ровная: низ — над самой высокой точкой земли под контуром
    let gmax = -Infinity, gmin = Infinity;
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m, ax = p[i * 2], az = p[i * 2 + 1];
      const ex = p[j * 2] - ax, ez = p[j * 2 + 1] - az;
      const k = Math.max(1, Math.ceil(Math.hypot(ex, ez) / 3));
      for (let s = 0; s < k; s++) {
        const h = terrain.gridHeightAt(ax + ex * s / k, az + ez * s / k);
        if (h > gmax) gmax = h; if (h < gmin) gmin = h;
      }
    }
    if (!isFinite(gmax)) return;
    const y0 = gmax + canopyHeight(b, ar), y1 = y0 + SLAB;
    // обход против часовой (в плане x-z при взгляде сверху) — для нормалей
    const ccw = polyArea(p) > 0;
    const pts = [];
    for (let i = 0; i < m; i++) pts.push(new THREE.Vector2(p[i * 2], p[i * 2 + 1]));
    const tris = THREE.ShapeUtils.triangulateShape(pts, []);
    for (const [a, bb, c] of tris) {
      const A = pts[a], B = pts[bb], Cc = pts[c];
      // верх: нормаль вверх, обход — по часовой в x-z (y вверх, z на юг)
      const cr = (B.x - A.x) * (Cc.y - A.y) - (B.y - A.y) * (Cc.x - A.x);
      const [u, v] = cr < 0 ? [B, Cc] : [Cc, B];
      tri([A.x, y1, A.y], [u.x, y1, u.y], [v.x, y1, v.y], [0, 1, 0], TOP);
      tri([A.x, y0, A.y], [v.x, y0, v.y], [u.x, y0, u.y], [0, -1, 0], SOFFIT);
    }
    // фриз по контуру
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      const ax = p[i * 2], az = p[i * 2 + 1], bx = p[j * 2], bz = p[j * 2 + 1];
      const l = Math.hypot(bx - ax, bz - az);
      if (l < 0.05) continue;
      let nx = (bz - az) / l, nz = -(bx - ax) / l;
      if (!ccw) { nx = -nx; nz = -nz; }
      // проверка наружу: точка чуть за серединой ребра вне контура
      if (inside((ax + bx) / 2 + nx * 0.2, (az + bz) / 2 + nz * 0.2, p)) { nx = -nx; nz = -nz; }
      const out = nx * (bz - az) - nz * (bx - ax) > 0;      // порядок вершин, чтобы лицо смотрело наружу
      const [sx, sz, ex2, ez2] = out ? [bx, bz, ax, az] : [ax, az, bx, bz];
      quad([sx, y0, sz], [ex2, y0, ez2], [ex2, y1, ez2], [sx, y1, sz], [nx, 0, nz], FASCIA);
    }
    // столбы
    const h = POST / 2;
    for (const [x, z, ux, uz] of posts(b)) {
      const g = terrain.gridHeightAt(x, z) - 0.3;
      const c = (a, d) => [x + ux * a - uz * d, z + uz * a + ux * d];
      const cs = [c(-h, -h), c(h, -h), c(h, h), c(-h, h)];
      for (let k = 0; k < 4; k++) {
        const [ax, az] = cs[k], [bx, bz] = cs[(k + 1) % 4];
        const mx = (ax + bx) / 2 - x, mz = (az + bz) / 2 - z, ml = Math.hypot(mx, mz) || 1;
        const nx = mx / ml, nz = mz / ml;
        const out = nx * (bz - az) - nz * (bx - ax) > 0;
        const [sx, sz, ex2, ez2] = out ? [bx, bz, ax, az] : [ax, az, bx, bz];
        quad([sx, g, sz], [ex2, g, ez2], [ex2, y0, ez2], [sx, y0, sz], [nx, 0, nz], STEEL);
      }
    }
    n++;
  });
  const group = new THREE.Group();
  group.name = 'навесы';
  group.userData.stats = { навесов: n };
  if (!n) return group;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, canopyMaterial());
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.name = 'навесы';
  group.add(mesh);
  return group;
}
let MAT = null;
function canopyMaterial() {
  return MAT || (MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.1, side: THREE.DoubleSide }));
}

// ------------------------------------------------------------------ места
// Места, описанные руками по Overpass и спутнику. Ключ — OSM id дома (он
// стабилен при пересборке данных), поэтому правка не затирается перебором
// чанков: она применяется в рантайме к тому, что пришло.
//
// Руднева 44 (−3090, 2763): АЗС «АТАН Россия №65» и при ней «Eaty» (Ети) —
// крымская замена «Макдоналдса», с окном выдачи для машин (OSM: amenity=
// fast_food, drive_through=yes, узел 4127363589). Павильон w93726784 —
// одноэтажный, общий для магазина АЗС и «Eaty»; навес w198921869 — над
// заправкой (его заменяет модель АТАН, fuel.js). Проезды — service из OSM:
// заезд с Вакуленчука (w111661374) под навес (w111661372) и выезд на
// Руднева (w458300481), петля драйва вокруг павильона (w458300480), заезд с
// юга (w476326066).
const EATY = { band: [0.85, 0.16, 0.12], board: [0.85, 0.16, 0.12], text: [1, 0.97, 0.9] };
const ATAN = { band: [0.98, 0.80, 0.10], board: [0.98, 0.80, 0.10], text: [0.06, 0.45, 0.22] };
const SITES = {
  w93726784: { h: 4.6, rs: 'flat', fx: 'glass', wc: '#e8e4dc', rc: '#5d5f62', sg: null, fascia: EATY,
               signs: [{ text: 'EATY', col: EATY }, { text: 'ATAN', col: ATAN }],
               // окно выдачи — на западной стене, к петле драйва
               drive: { lane: 'w458300480', window: [-3104.0, 2763.0], text: 'EATY DRIVE' } },
};

// До индекса стен и до АЗС (shopBlocked в fuel.js смотрит на этот дом)
export function prepSites(world) {
  for (const b of world.buildings || []) {
    const s = b.id && SITES[b.id];
    if (!s) continue;
    if (s.h) b.h = s.h;
    if (s.rs) b.rs = s.rs;
    if (s.fx) b.fx = s.fx;
    if (s.wc) b.wc = s.wc;
    if (s.rc) b.rc = s.rc;
    if (s.sg === null) delete b.sg;          // свои вывески — фирменные, ниже
    b.site = s;
  }
}

// Фирменный фриз, вывески и окно драйва
export function buildSites(world, terrain, skip) {
  const group = new THREE.Group();
  group.name = 'места';
  const P = [], N = [], C = [], signs = [], AP = [];
  const quad = (a, b, c, d, n, col) => {
    for (const q of [a, b, c, a, c, d]) { P.push(...q); N.push(...n); C.push(...col); }
  };
  const arrowQuad = (a, b, c, d) => { for (const q of [a, b, c, a, c, d]) AP.push(...q); };
  (world.buildings || []).forEach((b, bi) => {
    const s = b.site;
    if (!s || b.hide || (skip && skip.has(bi))) return;
    const p = b.poly, m = p.length / 2;
    let gmax = -Infinity;
    for (let i = 0; i < m; i++) gmax = Math.max(gmax, terrain.gridHeightAt(p[i * 2], p[i * 2 + 1]));
    const top = gmax + b.h, ccw = polyArea(p) > 0;
    // фриз: полоса 1.1 м под карнизом, на 0.12 м наружу
    const edges = [];
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      const ax = p[i * 2], az = p[i * 2 + 1], bx = p[j * 2], bz = p[j * 2 + 1];
      const l = Math.hypot(bx - ax, bz - az);
      if (l < 0.05) continue;
      let nx = (bz - az) / l, nz = -(bx - ax) / l;
      if (!ccw) { nx = -nx; nz = -nz; }
      if (inside((ax + bx) / 2 + nx * 0.2, (az + bz) / 2 + nz * 0.2, p)) { nx = -nx; nz = -nz; }
      const o = 0.12, A = [ax + nx * o, az + nz * o], B = [bx + nx * o, bz + nz * o];
      const out = nx * (B[1] - A[1]) - nz * (B[0] - A[0]) > 0;
      const [S, E] = out ? [B, A] : [A, B];
      quad([S[0], top - 1.1, S[1]], [E[0], top - 1.1, E[1]], [E[0], top + 0.25, E[1]], [S[0], top + 0.25, S[1]], [nx, 0, nz], s.fascia.band);
      edges.push({ ax, az, bx, bz, l, nx, nz });
    }
    // вывески — на самых длинных рёбрах, смотрящих в разные стороны
    edges.sort((a, c) => c.l - a.l);
    const used = [];
    let k = 0;
    for (const e of edges) {
      if (k >= s.signs.length * 2) break;
      if (used.some(u => u.nx * e.nx + u.nz * e.nz > 0.5)) continue;
      used.push(e);
      const sg = s.signs[k % s.signs.length];
      const w = Math.min(6, e.l * 0.8);
      signs.push({ text: sg.text, col: sg.col, w, h: 0.95,
        x: (e.ax + e.bx) / 2 + e.nx * 0.2, y: top - 0.42, z: (e.az + e.bz) / 2 + e.nz * 0.2,
        ang: Math.atan2(e.nx, e.nz) });
      k++;
    }
    // окно драйва: тёмное стекло с козырьком и вывеской над ним
    if (s.drive) {
      const [wx, wz] = s.drive.window;
      let best = null;
      for (const e of edges) {
        const vx = e.bx - e.ax, vz = e.bz - e.az, l2 = vx * vx + vz * vz;
        const t = Math.max(0, Math.min(1, ((wx - e.ax) * vx + (wz - e.az) * vz) / l2));
        const d = Math.hypot(e.ax + vx * t - wx, e.az + vz * t - wz);
        if (!best || d < best.d) best = { e, t, d };
      }
      if (best) {
        const { e, t } = best;
        const ux = (e.bx - e.ax) / e.l, uz = (e.bz - e.az) / e.l;
        const cx = e.ax + (e.bx - e.ax) * t + e.nx * 0.08, cz = e.az + (e.bz - e.az) * t + e.nz * 0.08;
        const hw = 0.9;
        const A = [cx - ux * hw, cz - uz * hw], B = [cx + ux * hw, cz + uz * hw];
        const out = e.nx * (B[1] - A[1]) - e.nz * (B[0] - A[0]) > 0;
        const [S, E] = out ? [B, A] : [A, B];
        quad([S[0], gmax + 0.9, S[1]], [E[0], gmax + 0.9, E[1]], [E[0], gmax + 2.2, E[1]], [S[0], gmax + 2.2, S[1]], [e.nx, 0, e.nz], [0.08, 0.10, 0.12]);
        // козырёк 1.2 м
        const o = 1.2, y = gmax + 2.5;
        const S2 = [S[0] + e.nx * o, S[1] + e.nz * o], E2 = [E[0] + e.nx * o, E[1] + e.nz * o];
        quad([S[0], y, S[1]], [S2[0], y, S2[1]], [E2[0], y, E2[1]], [E[0], y, E[1]], [0, 1, 0], s.fascia.band);
        quad([E[0], y - 0.02, E[1]], [E2[0], y - 0.02, E2[1]], [S2[0], y - 0.02, S2[1]], [S[0], y - 0.02, S[1]], [0, -1, 0], [0.9, 0.9, 0.88]);
        signs.push({ text: s.drive.text, col: s.fascia, w: 2.6, h: 0.42,
          x: cx + e.nx * 0.12, y: gmax + 3.0, z: cz + e.nz * 0.12, ang: Math.atan2(e.nx, e.nz) });
      }
    }
    // стрелки на петле драйва
    if (s.drive?.lane) {
      const r = (world.roads || []).find(q => q.id === s.drive.lane);
      if (r) laneArrows(r.pts, terrain, arrowQuad);
    }
  });
  if (P.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.name = 'места: фриз и драйв';
    group.add(mesh);
  }
  if (AP.length) {
    // разметка лежит на полотне: смещение глубины сильнее, чем у дорог
    // (materials.js, −4/−6), иначе полотно её перекрывает
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(AP, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.8, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -10 }));
    mesh.receiveShadow = true;
    mesh.name = 'места: стрелки драйва';
    group.add(mesh);
  }
  const sm = buildFuelSigns(signs);
  if (sm) { sm.name = 'места: вывески'; group.add(sm); }
  return group;
}

// Белые стрелки по ходу одностороннего проезда: первая через 7 м, дальше каждые 14 м.
// Полотно рисуется на 0.14 над профилем езды (ROAD_Y в worldgen.js), стрелки — на 3 см выше.
function laneArrows(pts, terrain, quad) {
  let next = 7, run = 0;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const ax = pts[i], az = pts[i + 1], bx = pts[i + 2], bz = pts[i + 3];
    const l = Math.hypot(bx - ax, bz - az);
    if (l < 0.01) continue;
    const ux = (bx - ax) / l, uz = (bz - az) / l, vx = -uz, vz = ux;
    while (next <= run + l - 1.6) {
      const d = next - run;
      if (d >= 1.6) {
        const x = ax + ux * d, z = az + uz * d;
        const P = (a, b) => { const qx = x + ux * a + vx * b, qz = z + uz * a + vz * b; return [qx, terrain.driveHeightAt(qx, qz) + 0.18, qz]; };
        quad(P(-1.6, -0.15), P(-1.6, 0.15), P(0.5, 0.15), P(0.5, -0.15));
        quad(P(0.4, -0.6), P(0.4, 0.6), P(1.6, 0.02), P(1.6, -0.02));
      }
      next += 14;
    }
    run += l;
  }
}
