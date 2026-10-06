import * as THREE from 'three';
import { lampGlow, registerLamps } from './env.js?v=8c71f0ed';
import { plantFlora, ST } from './flora.js?v=8c71f0ed';
import { roadMaterial } from './materials.js?v=8c71f0ed';

// Большая Морская — витрина города. Всё, что делает её улицей, а не дорогой
// между коробками: ряды молодых софор в газонной полосе у бордюра, стриженые
// кусты в полосе, чугунные фонари с двумя фонарями, скамейки с урнами,
// остановки параллельно дороге и плитка от бордюра до самых фасадов.
//
// Расстановка ручная, в data/street-bm.json: станция s (метры вдоль осевой
// по ходу движения) и сторона — W справа по ходу, E слева. Здесь из станций
// получаются точки мира, и каждый квадрат ставит то, что лежит в его границах.
// Посадки OSM-правилами (props.js) и OSM-мебель, которую заменяет этот файл,
// на улице отключаются — см. streetOwnsRoad и streetFurniture.

let S = null;
export async function loadStreet(V = '') {
  try {
    const r = await fetch(`../data/street-bm.json${V ? '?v=' + V : ''}`);
    if (r.ok) S = await r.json();
  } catch { /* без файла улица остаётся как её сажает props.js */ }
  if (S) prepAxis();
  return S;
}

// Улицу целиком ведёт этот модуль: props.js на ней не сажает и не ставит фонари.
export const streetOwnsRoad = r => !!(S && r.n === S.name);

// OSM-точки, которые этот файл заменяет или убирает.
export function streetFurniture(points) {
  if (!S || !S.removeFurniture) return points;
  const drop = new Set(S.removeFurniture.ids);
  return points.filter(p => !drop.has(p.id));
}

// ------------------------------------------------------------------ осевая
let AX = null;          // [{ax, az, ux, uz, L, s}]
let LEN = 0;
function prepAxis() {
  const p = S.axis;
  AX = [];
  LEN = 0;
  for (let i = 0; i + 3 < p.length; i += 2) {
    const dx = p[i + 2] - p[i], dz = p[i + 3] - p[i + 1], L = Math.hypot(dx, dz);
    AX.push({ ax: p[i], az: p[i + 1], ux: dx / L, uz: dz / L, L, s: LEN });
    LEN += L;
  }
}
// Точка на станции s со сдвигом d вправо по ходу (вправо = на запад). На
// изломе осевой направление берём сглаженным по ±3 м: иначе ряд деревьев
// на углу рвётся клином.
function at(s, d) {
  let k = 0;
  while (k < AX.length - 1 && s > AX[k].s + AX[k].L) k++;
  const g = AX[k], t = s - g.s;
  const x = g.ax + g.ux * t, z = g.az + g.uz * t;
  const dir = s2 => { let j = 0; while (j < AX.length - 1 && s2 > AX[j].s + AX[j].L) j++; return AX[j]; };
  const a = dir(s - 3), b = dir(s + 3);
  let ux = a.ux + b.ux, uz = a.uz + b.uz;
  const l = Math.hypot(ux, uz); ux /= l; uz /= l;
  return { x: x - uz * d, z: z + ux * d, ux, uz, nx: -uz, nz: ux };
}
// станция и сдвиг точки мира (для зебр и перекрёстков)
function project(x, z) {
  let best = { dd: Infinity, s: 0, d: 0 };
  for (const g of AX) {
    let t = (x - g.ax) * g.ux + (z - g.az) * g.uz;
    t = t < 0 ? 0 : t > g.L ? g.L : t;
    const px = g.ax + g.ux * t, pz = g.az + g.uz * t;
    const dd = Math.hypot(x - px, z - pz);
    if (dd < best.dd) best = { dd, s: g.s + t, d: (x - px) * -g.uz + (z - pz) * g.ux };
  }
  return best;
}

// ------------------------------------------------------------------ заготовки
const s2l = v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
function merge(parts) {
  let nv = 0, ni = 0;
  for (const { geo } of parts) {
    nv += geo.attributes.position.count;
    ni += geo.index ? geo.index.count : geo.attributes.position.count;
  }
  const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), C = new Float32Array(nv * 3);
  const I = new Uint32Array(ni);
  let vo = 0, io = 0;
  for (const { geo, color } of parts) {
    P.set(geo.attributes.position.array, vo * 3);
    N.set(geo.attributes.normal.array, vo * 3);
    const n = geo.attributes.position.count;
    const lc = color.map(s2l);
    for (let i = 0; i < n; i++) C.set(lc, (vo + i) * 3);
    if (geo.index) for (let i = 0; i < geo.index.count; i++) I[io++] = geo.index.array[i] + vo;
    else for (let i = 0; i < n; i++) I[io++] = i + vo;
    vo += n;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.BufferAttribute(C, 3));
  g.setIndex(new THREE.BufferAttribute(I, 1));
  g.computeBoundingSphere();
  return g;
}
const box = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
const cyl = (r0, r1, h, seg, x, y, z) => { const g = new THREE.CylinderGeometry(r0, r1, h, seg); g.translate(x, y, z); return g; };

// Цвета (sRGB), сняты с панорам 2020: чугун почти чёрный, рейки скамеек —
// тёмный орех, гранит бордюрного камня полосы светлый.
const IRON = [0.09, 0.10, 0.11], WOOD = [0.36, 0.22, 0.13], LAMPGLASS = [0.93, 0.89, 0.74];

// Скамейка: пять реек сиденья, три спинки, две литые боковины. Лицом в +z.
function benchGeo() {
  const parts = [];
  for (let i = 0; i < 5; i++) parts.push({ geo: box(1.8, 0.035, 0.075, 0, 0.45, 0.17 - i * 0.095), color: WOOD });
  for (let i = 0; i < 3; i++) {
    const g = box(1.8, 0.075, 0.03, 0, 0.62 + i * 0.12, 0);
    g.rotateX(-0.22); g.translate(0, 0.02, -0.29);
    parts.push({ geo: g, color: WOOD });
  }
  for (const x of [-0.72, 0.72]) {
    parts.push({ geo: box(0.07, 0.43, 0.08, x, 0.215, 0.18), color: IRON });     // передняя нога
    parts.push({ geo: box(0.07, 0.86, 0.08, x, 0.43, -0.22), color: IRON });     // задняя стойка
    parts.push({ geo: box(0.06, 0.05, 0.52, x, 0.42, -0.02), color: IRON });     // царга
    const arm = box(0.06, 0.05, 0.42, x, 0.66, 0.0); parts.push({ geo: arm, color: IRON });  // подлокотник
  }
  return merge(parts);
}

// Урна-вазон: литая чаша на ножке.
function urnGeo() {
  const prof = [[0, 0], [0.17, 0], [0.17, 0.05], [0.07, 0.10], [0.07, 0.24], [0.15, 0.30], [0.22, 0.44],
    [0.24, 0.70], [0.26, 0.74], [0.23, 0.74], [0.21, 0.50], [0.0, 0.50]].map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(prof, 10);
  g.computeVertexNormals();
  return merge([{ geo: g, color: [0.12, 0.13, 0.13] }]);
}

// Велопарковка: ряд гнутых дуг на общей полосе, вдоль локального x.
function bikeGeo(n) {
  const parts = [];
  const span = (n - 1) * 0.75;
  parts.push({ geo: box(span + 0.5, 0.04, 0.10, 0, 0.02, 0), color: [0.35, 0.36, 0.37] });
  for (let i = 0; i < n; i++) {
    const x = -span / 2 + i * 0.75;
    const arc = new THREE.TorusGeometry(0.32, 0.024, 5, 10, Math.PI);
    arc.translate(0, 0.52, 0); arc.rotateY(Math.PI / 2); arc.translate(x, 0, 0);
    parts.push({ geo: arc, color: [0.55, 0.57, 0.58] });
    for (const z of [-0.32, 0.32]) parts.push({ geo: cyl(0.024, 0.024, 0.52, 5, x, 0.26, z), color: [0.55, 0.57, 0.58] });
  }
  return merge(parts);
}

// Чугунный фонарь Большой Морской: тумба-постамент, стройная колонна с
// кольцами, наверху две лиры-кронштейна вдоль улицы с подвесными фонарями и
// навершие. Фонари — вдоль локального x, колонна в нуле.
function lampGeo() {
  const parts = [];
  const prof = [[0, 0], [0.30, 0], [0.30, 0.12], [0.24, 0.18], [0.22, 0.75], [0.26, 0.82], [0.26, 0.9],
    [0.16, 0.98], [0.13, 1.25], [0.11, 1.30], [0, 1.30]].map(([r, y]) => new THREE.Vector2(r, y));
  const base = new THREE.LatheGeometry(prof, 10); base.computeVertexNormals();
  parts.push({ geo: base, color: IRON });
  parts.push({ geo: cyl(0.075, 0.10, 3.8, 8, 0, 1.3 + 1.9, 0), color: IRON });
  for (const y of [1.55, 2.6, 4.9]) parts.push({ geo: cyl(0.12, 0.12, 0.08, 10, 0, y, 0), color: IRON });
  parts.push({ geo: cyl(0.06, 0.075, 0.6, 8, 0, 5.4, 0), color: IRON });
  // лиры: полукольцо вверх и завиток вниз, по обе стороны
  for (const sx of [-1, 1]) {
    const arc = new THREE.TorusGeometry(0.42, 0.03, 5, 12, Math.PI * 0.9);
    if (sx < 0) arc.rotateY(Math.PI);           // зеркально: дуга уходит влево
    arc.translate(sx * 0.42, 5.1, 0);
    parts.push({ geo: arc, color: IRON });
    const curl = new THREE.TorusGeometry(0.14, 0.022, 4, 10, Math.PI * 1.4);
    curl.translate(sx * 0.62, 4.98, 0);
    parts.push({ geo: curl, color: IRON });
    // подвес и фонарь: шестигранник с крышкой и светлым стеклом
    const lx = sx * 0.84;
    parts.push({ geo: cyl(0.012, 0.012, 0.3, 4, lx, 4.98, 0), color: IRON });
    parts.push({ geo: cyl(0.05, 0.20, 0.16, 6, lx, 4.78, 0), color: IRON });
    parts.push({ geo: cyl(0.17, 0.12, 0.42, 6, lx, 4.49, 0), color: LAMPGLASS });
    parts.push({ geo: cyl(0.06, 0.03, 0.1, 6, lx, 4.23, 0), color: IRON });
  }
  // навершие
  const top = new THREE.ConeGeometry(0.07, 0.35, 6); top.translate(0, 5.85, 0);
  parts.push({ geo: top, color: IRON });
  parts.push({ geo: new THREE.SphereGeometry(0.07, 6, 4).translate(0, 5.68, 0), color: IRON });
  return merge(parts);
}

// Павильон остановки как на «Кинотеатре Победа»: тёмный каркас, плоская
// кровля с полосой названия, стеклянные задняя и боковые стенки, лайтбокс
// с рекламой в торце, скамья. Открыт в +z (к проезжей части), длина по x.
const SH_L = 4.6, SH_D = 1.7, SH_H = 2.55;
function shelterFrameGeo() {
  const parts = [], F = [0.20, 0.21, 0.22];
  for (const x of [-SH_L / 2, SH_L / 2]) for (const z of [-SH_D / 2 + 0.05, SH_D / 2 - 0.15])
    parts.push({ geo: box(0.08, SH_H, 0.08, x, SH_H / 2, z), color: F });
  parts.push({ geo: box(SH_L + 0.35, 0.16, SH_D + 0.25, 0, SH_H + 0.08, 0), color: F });       // кровля
  parts.push({ geo: box(SH_L + 0.36, 0.30, 0.04, 0, SH_H - 0.05, SH_D / 2 + 0.11), color: [0.12, 0.13, 0.14] }); // полоса под название
  parts.push({ geo: box(SH_L, 0.06, 0.05, 0, 0.1, -SH_D / 2 + 0.05), color: F });
  parts.push({ geo: box(3.0, 0.06, 0.42, -0.4, 0.46, -SH_D / 2 + 0.32), color: [0.42, 0.42, 0.40] });  // скамья
  for (const x of [-1.6, 0.8]) parts.push({ geo: box(0.06, 0.44, 0.36, x, 0.22, -SH_D / 2 + 0.32), color: F });
  // лайтбокс в торце: светлая рекламная плоскость в раме
  parts.push({ geo: box(0.16, 1.85, 1.25, SH_L / 2 - 0.02, 1.15, -0.1), color: F });
  parts.push({ geo: box(0.17, 1.65, 1.08, SH_L / 2 - 0.02, 1.15, -0.1), color: [0.86, 0.80, 0.62] });
  return merge(parts);
}
function shelterGlassGeo() {
  return merge([
    { geo: box(SH_L - 0.1, 2.05, 0.02, 0, 1.25, -SH_D / 2 + 0.05), color: [0.70, 0.78, 0.80] },
    { geo: box(0.02, 2.05, SH_D - 0.3, -SH_L / 2, 1.25, -0.05), color: [0.70, 0.78, 0.80] },
  ]);
}
function stopSign(names) {
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 64 * names.length;
  const g = cv.getContext('2d');
  names.forEach((n, i) => {
    g.fillStyle = '#16191c'; g.fillRect(0, i * 64, 1024, 64);
    g.fillStyle = '#f4f2ea'; g.textAlign = 'center'; g.textBaseline = 'middle';
    let size = 40;
    do { g.font = `600 ${size}px -apple-system, "Helvetica Neue", Arial`; size -= 2; }
    while (g.measureText(n).width > 960 && size > 14);
    g.fillText(n, 512, i * 64 + 33);
  });
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// Приствольная решётка 1.4 × 1.4 м: рама, кольцо у ствола и прутья лучами.
function grateGeo() {
  const parts = [], C = [0.13, 0.13, 0.13];
  for (const [w, d, x, z] of [[1.4, 0.08, 0, 0.66], [1.4, 0.08, 0, -0.66], [0.08, 1.4, 0.66, 0], [0.08, 1.4, -0.66, 0]])
    parts.push({ geo: box(w, 0.03, d, x, 0.015, z), color: C });
  const ring = new THREE.TorusGeometry(0.34, 0.03, 4, 16); ring.rotateX(Math.PI / 2); ring.translate(0, 0.02, 0);
  parts.push({ geo: ring, color: C });
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2, g = box(0.035, 0.025, 0.3, 0, 0.015, 0.52);
    g.rotateY(a); parts.push({ geo: g, color: C });
  }
  parts.push({ geo: box(1.3, 0.005, 1.3, 0, 0.004, 0), color: [0.22, 0.18, 0.14] });   // земля под решёткой
  return merge(parts);
}

// заготовки общие на все квадраты: строим один раз
let GEO = null;
function geos() {
  if (GEO) return GEO;
  GEO = { bench: benchGeo(), urn: urnGeo(), grate: grateGeo(), lamp: lampGeo(), frame: shelterFrameGeo(), glass: shelterGlassGeo(), bike: {} };
  for (const k in GEO) if (GEO[k].isBufferGeometry) GEO[k].userData.shared = true;
  return GEO;
}

// ------------------------------------------------------------------ сборка
// world — квадрат (у него roads.ctx с границами и общей сетью), onRoad — поле
// кромки асфальта из props.js, buildings — все дома квадрата с соседскими.
export function buildStreet(world, terrain, onRoad, buildings) {
  const group = new THREE.Group();
  group.name = 'street-bm';
  const stats = {};
  group.userData.stats = stats;
  const ctx = world.roads && world.roads.ctx;
  if (!S || !AX || !ctx || ctx.x1 === undefined) return group;
  const inSq = (x, z) => x >= ctx.x0 && x < ctx.x1 && z >= ctx.z0 && z < ctx.z1;
  // улица вообще не задевает квадрат — выходим сразу
  {
    let hit = false;
    for (let s = 0; s <= LEN && !hit; s += 10) for (const d of [-20, 20]) { const p = at(s, d); if (inSq(p.x, p.z)) hit = true; }
    if (!hit) return group;
  }
  const asphalt = (x, z) => !!(onRoad && onRoad(x, z));
  // Высота тротуара — та же, по которой buildRoads кладёт плитку: профиль
  // дороги с предохранителем, плюс бордюр KERB_H + 0.03.
  const H = (x, z) => {
    const g = terrain.gridHeightAt(x, z), d = terrain.driveHeightAt(x, z);
    return d < g - 1.7 ? g - 1.7 : d > g + 1.1 ? g + 1.1 : d;
  };
  const WALK = 0.20;
  const walkY = (x, z) => H(x, z) + WALK;

  // ---- дома: расстояние до фасада лучом и «внутри дома»
  const SEG = [], C = 8, grid = new Map();
  for (const b of buildings || []) {
    const p = b.poly;
    for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
      const o = SEG.length;
      SEG.push(p[j], p[j + 1], p[i], p[i + 1]);
      const x0 = Math.floor(Math.min(p[j], p[i]) / C), x1 = Math.floor(Math.max(p[j], p[i]) / C);
      const z0 = Math.floor(Math.min(p[j + 1], p[i + 1]) / C), z1 = Math.floor(Math.max(p[j + 1], p[i + 1]) / C);
      if ((x1 - x0 + 1) * (z1 - z0 + 1) > 400) continue;
      for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
        const k = cx * 100003 + cz;
        (grid.get(k) || grid.set(k, []).get(k)).push(o);
      }
    }
  }
  // луч из (x, z) по (nx, nz): до первой стены, не дальше max
  const facade = (x, z, nx, nz, max) => {
    let best = max;
    const seen = new Set();
    for (let t = 0; t <= max + C; t += C / 2) {
      const cx = Math.floor((x + nx * t) / C), cz = Math.floor((z + nz * t) / C);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        const a = grid.get((cx + i) * 100003 + cz + j);
        if (!a) continue;
        for (const o of a) {
          if (seen.has(o)) continue;
          seen.add(o);
          const ax = SEG[o], az = SEG[o + 1], ex = SEG[o + 2] - ax, ez = SEG[o + 3] - az;
          const den = nx * ez - nz * ex;
          if (Math.abs(den) < 1e-9) continue;
          const tt = ((ax - x) * ez - (az - z) * ex) / den;
          const u = ((ax - x) * nz - (az - z) * nx) / den;
          if (tt > 0 && u >= 0 && u <= 1 && tt < best) best = tt;
        }
      }
      if (best < t) break;
    }
    return best;
  };
  const green = (ctx.green || world.green || []).filter(gp => gp.poly && gp.poly.length >= 6);
  const inPoly = (p, x, z) => {
    let c = false;
    for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
      const xi = p[i], zi = p[i + 1], xj = p[j], zj = p[j + 1];
      if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
    }
    return c;
  };
  const inGreen = (x, z) => green.some(gp => inPoly(gp.poly, x, z));
  const noPlant = world.__noPlant || (() => false);

  // ---- запретные участки вдоль улицы: зебры, остановки, перекрёстки
  const hw = S.hw;
  const busy = { W: [], E: [] };
  for (const c of ctx.crossings || []) {
    const pr = project(c.x, c.z);
    if (pr.dd < hw + 4) for (const sd of ['W', 'E']) busy[sd].push([pr.s - 3.2, pr.s + 3.2]);
  }
  for (const st of S.stops || []) busy[st.side].push([st.s - 4.5, st.s + 4.5]);
  const isBusy = (side, s) => busy[side].some(([a, b]) => s >= a && s <= b);
  const sideSign = side => side === 'W' ? 1 : -1;

  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), SC = new THREE.Vector3(1, 1, 1), UP = new THREE.Vector3(0, 1, 0);
  // ночью стекло фонарей светится (env.js)
  const MAT = lampGlow(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.12 }), LAMPGLASS, 'street-lamp');
  const inst = (name, geo, list, mat = MAT, shadow = true) => {
    if (!list.length) return null;
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((r, i) => {
      V.set(r.x, r.y, r.z); Q.setFromAxisAngle(UP, r.a);
      m.setMatrixAt(i, M4.compose(V, Q, SC));
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
    m.castShadow = shadow; m.receiveShadow = true;
    m.name = 'street:' + name;
    group.add(m);
    stats[name] = list.length;
    return m;
  };
  // угол, при котором локальный +z смотрит в (vx, vz)
  const yaw = (vx, vz) => Math.atan2(vx, vz);

  // ---- деревья
  const sets = { acacia: [], hedge: [], box: [], shrub: [] };
  const TD = S.trees.d;
  const hash = (x, z) => { let h = Math.imul((x * 16) | 0, 374761393) ^ Math.imul((z * 16) | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const planted = { W: [], E: [] };
  let skipped = 0;
  for (const side of ['W', 'E']) {
    for (const s of S.trees[side]) {
      const p = at(s, sideSign(side) * TD);
      if (isBusy(side, s)) { skipped++; continue; }
      // ствол — не на асфальте поперечной улицы и не в доме
      if (asphalt(p.x, p.z) || asphalt(p.x - p.nx * sideSign(side) * 0.6, p.z - p.nz * sideSign(side) * 0.6) || facade(p.x, p.z, p.nx * sideSign(side), p.nz * sideSign(side), 2) < 1.2) { skipped++; continue; }
      planted[side].push(s);
      if (!inSq(p.x, p.z)) continue;
      const w = 0.50 + hash(p.x, p.z) * 0.14, h = 0.62 + hash(p.z, p.x) * 0.14;
      sets[S.trees.species].push(p.x, walkY(p.x, p.z) + 0.02, p.z, w, h, hash(p.x * 3, p.z) * 6.283,
        (hash(p.x * 0.9, p.z * 0.9) - 0.5) * 0.05, hash(p.z * 0.6, p.x * 0.6) * 6.283, 0);
    }
  }
  stats['деревья не сели'] = skipped;

  // ---- газонная полоса: бортовой камень, земля, стриженые кусты
  const BP = [], BC = [], BI = [];
  const RIM = s2lC([0.80, 0.79, 0.76]), SOIL = s2lC([0.25, 0.20, 0.15]);
  function s2lC(c) { return c.map(s2l); }
  // прямоугольник полосы между станциями sa..sb на сдвигах da..db, высоты y0..y1 над тротуаром
  const slab = (sa, sb, da, db, y0, y1, col) => {
    const n = Math.max(1, Math.ceil((sb - sa) / 2.5));
    const base = BP.length / 3;
    for (let i = 0; i <= n; i++) {
      const s = sa + (sb - sa) * i / n;
      for (const d of [da, db]) {
        const p = at(s, d), y = walkY(p.x, p.z);
        BP.push(p.x, y + y0, p.z, p.x, y + y1, p.z);
        BC.push(...col, ...col);
      }
    }
    // вершины: на станцию 4 штуки: [da низ, da верх, db низ, db верх]
    for (let i = 0; i < n; i++) {
      const a = base + i * 4, b = a + 4;
      BI.push(a + 1, b + 1, b + 3, a + 1, b + 3, a + 3);          // верх
      BI.push(a, b, b + 1, a, b + 1, a + 1);                      // бок da
      BI.push(a + 2, a + 3, b + 3, a + 2, b + 3, b + 2);          // бок db
    }
    // торцы
    for (const [a, flip] of [[base, true], [base + n * 4, false]]) {
      if (flip) BI.push(a, a + 1, a + 3, a, a + 3, a + 2);
      else BI.push(a, a + 3, a + 1, a, a + 2, a + 3);
    }
  };
  let beds = 0;
  const covered = { W: [], E: [] };       // участки полос: деревьям вне них — решётка
  for (const side of ['W', 'E']) {
    const sg = sideSign(side);
    const trees = planted[side];
    const no = (S.noBeds && S.noBeds[side]) || [];
    // полоса тянется от дерева к дереву, рвётся на длинном промежутке, на
    // зебре и остановке, на въезде поперёк неё и каждые maxRun метров
    const runs = [];
    let cur = null;
    for (const s of trees) {
      if (no.some(([a, b]) => s >= a && s <= b)) { if (cur) runs.push(cur); cur = null; continue; }
      if (cur && s - cur[1] <= S.beds.joinTrees) cur[1] = s;
      else { if (cur) runs.push(cur); cur = [s, s]; }
    }
    if (cur) runs.push(cur);
    for (const [r0, r1] of runs) {
      let a = r0 - 2.6, b = r1 + 2.6;
      // режем на куски не длиннее maxRun с проходом между ними
      const k = Math.max(1, Math.round((b - a) / S.beds.maxRun));
      const L = (b - a - (k - 1) * S.beds.gap) / k;
      for (let i = 0; i < k; i++) {
        const sa = a + i * (L + S.beds.gap), sb = sa + L;
        // участок дробим по 1 м и выкидываем куски на асфальте, зебре, в доме
        let ok0 = null;
        const flush = (e) => {
          if (ok0 === null) return;
          if (e - ok0 >= 2.0) emitBed(side, sg, ok0, e);
          ok0 = null;
        };
        for (let s = sa; s <= sb + 1e-6; s += 1.0) {
          const p0 = at(s, sg * S.beds.d0), p1 = at(s, sg * S.beds.d1);
          const bad = isBusy(side, s) || asphalt(p0.x, p0.z) || asphalt(p1.x, p1.z)
            || facade(p0.x, p0.z, p0.nx * sg, p0.nz * sg, 2.5) < 2.0;
          if (bad) flush(s - 0.5);
          else if (ok0 === null) ok0 = s;
        }
        flush(sb);
      }
    }
  }
  function emitBed(side, sg, sa, sb) {
    covered[side].push([sa, sb]);
    const mid = at((sa + sb) / 2, sg * (S.beds.d0 + S.beds.d1) / 2);
    if (!inSq(mid.x, mid.z)) return;
    beds++;
    const d0 = sg * S.beds.d0, d1 = sg * S.beds.d1, da = Math.min(d0, d1), db = Math.max(d0, d1);
    // бортовой камень 10 см по периметру и земля чуть ниже его верха
    slab(sa, sb, da, da + 0.1, -0.05, 0.12, RIM);
    slab(sa, sb, db - 0.1, db, -0.05, 0.12, RIM);
    slab(sa, sa + 0.1, da + 0.1, db - 0.1, -0.05, 0.12, RIM);
    slab(sb - 0.1, sb, da + 0.1, db - 0.1, -0.05, 0.12, RIM);
    slab(sa + 0.1, sb - 0.1, da + 0.1, db - 0.1, -0.05, 0.07, SOIL);
    // Стриженые кусты: лента по середине полосы с окнами вокруг стволов.
    const trees = planted[side];
    const dm = sg * (S.beds.d0 + S.beds.d1) / 2;
    let s = sa + 0.5;
    while (s < sb - 0.6) {
      const near = trees.find(t => Math.abs(t - s) < 0.95);
      // окно у ствола: прыгаем за него (сравнение строгое, а 0.95 в плавающей
      // точке даёт 0.94999 — без запаса цикл застревал на одном стволе)
      if (near !== undefined) { s = Math.max(s, near) + 0.97; continue; }
      const nextT = trees.find(t => t > s && t < s + 2.2);
      const e = Math.min(sb - 0.5, s + 1.9, nextT !== undefined ? nextT - 0.95 : Infinity);
      if (e - s >= 0.6) {
        const sm = (s + e) / 2, p = at(sm, dm);
        sets.hedge.push(p.x, walkY(p.x, p.z) + 0.05, p.z, (e - s) / 2.0, 0.58 + hash(p.x, p.z) * 0.08,
          Math.atan2(-p.uz, p.ux), 0, 0, 0);
      }
      s = e + 0.02;
    }
    // у ствола — по шару самшита с двух сторон
    for (const t of trees) {
      if (t < sa || t > sb) continue;
      for (const o of [-0.62, 0.62]) {
        const p = at(t + o, dm);
        sets.box.push(p.x, walkY(p.x, p.z) + 0.04, p.z, 0.5, 0.62, hash(p.x, p.z) * 6.283, 0, 0, 0);
      }
    }
  }
  if (BI.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(BP, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(BC, 3));
    g.setIndex(BI);
    g.computeVertexNormals();
    // обход граней у полосы зависит от стороны улицы — рисуем обе стороны,
    // нормали берёт flatShading по самой грани
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true, side: THREE.DoubleSide }));
    m.receiveShadow = true; m.castShadow = true; m.name = 'street:beds';
    group.add(m);
  }
  stats['газонные полосы'] = beds;
  // Дерево вне полосы (площадка у «Победы», проходы) стоит в чугунной
  // приствольной решётке, как у остановки на панораме, а не голым стволом из плитки.
  const grates = [];
  for (const side of ['W', 'E']) for (const t of planted[side]) {
    if (covered[side].some(([a, b]) => t >= a - 0.5 && t <= b + 0.5)) continue;
    const p = at(t, sideSign(side) * TD);
    if (inSq(p.x, p.z)) grates.push({ x: p.x, y: walkY(p.x, p.z) + 0.005, z: p.z, a: Math.atan2(p.ux, p.uz) });
  }
  for (const k in sets) if (!sets[k].length) delete sets[k];
  stats['кусты'] = ((sets.hedge || []).length + (sets.box || []).length) / ST;
  plantFlora(group, sets);

  // ---- плитка от тротуара до фасадов
  {
    const P = [], R = [], K = [], CC = [], I = [];
    const TILE = [0.729, 0.710, 0.675].map(s2l).map(v => Math.round(v * 255));
    const IN = hw + 2.35;          // под край тротуара buildRoads (он кончается на кромке + 2.6)
    let quads = 0;
    for (const side of ['W', 'E']) {
      const sg = sideSign(side);
      let prev = null;
      for (let s = 0; s <= LEN; s += 2) {
        const p = at(s, sg * IN);
        const nx = p.nx * sg, nz = p.nz * sg;
        const f = facade(p.x, p.z, nx, nz, 24);
        const st = (f >= 24 || f < 0.5) ? null : { s, p, nx, nz, f: f + 0.15 };
        if (prev && st && Math.abs(prev.f - st.f) < 4) {
          const cx = (prev.p.x + st.p.x) / 2 + (nx * (prev.f + st.f) / 4), cz = (prev.p.z + st.p.z) / 2 + (nz * (prev.f + st.f) / 4);
          const corners = [[prev.p.x, prev.p.z], [st.p.x, st.p.z],
            [prev.p.x + prev.nx * prev.f, prev.p.z + prev.nz * prev.f], [st.p.x + st.nx * st.f, st.p.z + st.nz * st.f]];
          const bad = !inSq(cx, cz) || corners.some(([x, z]) => asphalt(x, z)) || asphalt(cx, cz)
            || noPlant(cx, cz) || inGreen(cx, cz);
          if (!bad) {
            // поперёк дробим по ~2 м, чтобы плитка шла по рельефу
            const n = Math.max(1, Math.ceil(Math.max(prev.f, st.f) / 2));
            const base = P.length / 3;
            for (let i = 0; i <= n; i++) for (const q of [prev, st]) {
              const t = q.f * i / n;
              const x = q.p.x + q.nx * t, z = q.p.z + q.nz * t;
              const y = i === 0 ? H(x, z) + 0.19 : Math.max(H(x, z), terrain.gridHeightAt(x, z)) + 0.19;
              P.push(x, y, z); R.push(x, z, 2, 0); K.push(4); CC.push(...TILE);
            }
            // лицом вверх: материал двусторонний, и изнанка освещалась бы
            // снизу, «землёй» неба — плитка правой стороны выходила бурой
            for (let i = 0; i < n; i++) {
              const a = base + i * 2, b = a + 2;
              if (sg > 0) I.push(a, b + 1, a + 1, a, b, b + 1);
              else I.push(a, a + 1, b + 1, a, b + 1, b);
            }
            quads++;
          }
        }
        prev = st;
      }
    }
    if (I.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      g.setAttribute('color', new THREE.Uint8BufferAttribute(CC, 3, true));
      g.setAttribute('aRoad', new THREE.Float32BufferAttribute(R, 4));
      g.setAttribute('aCls', new THREE.Float32BufferAttribute(K, 1));
      g.setAttribute('aSurf', new THREE.Float32BufferAttribute(new Float32Array(K.length), 1));
      g.setAttribute('aJn', new THREE.Float32BufferAttribute(new Float32Array(K.length).fill(60), 1));
      g.setIndex(I);
      // плитка почти плоская, а обход у сторон улицы разный: нормаль — вверх
      const NN = new Float32Array(P.length);
      for (let i = 1; i < NN.length; i += 3) NN[i] = 1;
      g.setAttribute('normal', new THREE.BufferAttribute(NN, 3));
      const m = new THREE.Mesh(g, roadMaterial());
      m.receiveShadow = true; m.name = 'street:paving';
      group.add(m);
    }
    stats['плитка до фасадов, участков'] = quads;
  }

  // ---- скамейки и урны: у полосы лицом к домам
  const G = geos();
  const benches = [], urns = [];
  for (const side of ['W', 'E']) {
    const sg = sideSign(side);
    for (const s of S.benches[side] || []) {
      if (isBusy(side, s)) continue;
      // не на стволе: сдвигаем в середину между деревьями
      const tr = planted[side];
      let ss = s;
      const near = tr.find(t => Math.abs(t - ss) < 1.4);
      if (near !== undefined) {
        const nb = tr.filter(t => Math.abs(t - near) < 12 && t !== near).sort((a, b) => Math.abs(a - ss) - Math.abs(b - ss))[0];
        ss = nb !== undefined ? (near + nb) / 2 : near + 2;
      }
      const p = at(ss, sg * S.benches.d);
      if (!inSq(p.x, p.z) || asphalt(p.x, p.z)) continue;
      const nx = p.nx * sg, nz = p.nz * sg;
      if (facade(p.x, p.z, nx, nz, 4) < 2.6) continue;        // нет прохода перед скамейкой
      benches.push({ x: p.x, y: walkY(p.x, p.z), z: p.z, a: yaw(nx, nz) });
      const u = at(ss + 1.35, sg * (S.benches.d - 0.1));
      urns.push({ x: u.x, y: walkY(u.x, u.z), z: u.z, a: 0 });
    }
  }
  inst('скамейки', G.bench, benches);
  inst('решётки', G.grate, grates, MAT, false);
  inst('урны', G.urn, urns);

  // ---- велопарковки
  for (const bk of S.bikes || []) {
    const sg = sideSign(bk.side), p = at(bk.s, sg * 10.2);
    if (!inSq(p.x, p.z)) continue;
    const geo = G.bike[bk.n] || (G.bike[bk.n] = Object.assign(bikeGeo(bk.n), {}));
    geo.userData.shared = true;
    inst('велопарковки', geo, [{ x: p.x, y: walkY(p.x, p.z), z: p.z, a: yaw(p.ux, p.uz) - Math.PI / 2 }]);
  }

  // ---- фонари: по линии полосы, между деревьями
  const lamps = [];
  for (const side of ['W', 'E']) {
    const sg = sideSign(side), tr = planted[side];
    for (let s = S.lamps[side + '0']; s <= LEN; s += S.lamps.step) {
      let ss = s;
      const near = tr.find(t => Math.abs(t - ss) < 1.6);
      if (near !== undefined) {
        const nb = tr.filter(t => t !== near && Math.abs(t - near) < 12).sort((a, b) => Math.abs(a - ss) - Math.abs(b - ss))[0];
        ss = nb !== undefined ? (near + nb) / 2 : near + 2.2;
      }
      if (isBusy(side, ss)) continue;
      const p = at(ss, sg * S.lamps.d);
      if (!inSq(p.x, p.z) || asphalt(p.x, p.z)) continue;
      // лиры — вдоль улицы: локальный x по ходу
      lamps.push({ x: p.x, y: walkY(p.x, p.z), z: p.z, a: yaw(p.ux, p.uz) - Math.PI / 2 });
    }
  }
  const lampMesh = inst('фонари', G.lamp, lamps);
  if (lampMesh) { lampMesh.userData.far = 450; registerLamps(lampMesh, [[0.84, 4.35, 0], [-0.84, 4.35, 0]]); }

  // ---- остановки: у бордюра, параллельно дороге, открыты к проезжей части
  const stops = [];
  for (const st of S.stops || []) {
    const sg = sideSign(st.side), p = at(st.s, sg * (hw + 0.55 + SH_D / 2 + 0.6));
    if (!inSq(p.x, p.z)) continue;
    // к дороге смотрит открытая сторона: локальный +z — на осевую
    stops.push({ x: p.x, y: walkY(p.x, p.z), z: p.z, a: yaw(-p.nx * sg, -p.nz * sg), name: st.name });
  }
  if (stops.length) {
    inst('остановки', G.frame, stops);
    inst('остановки: стекло', G.glass, stops, new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.08, metalness: 0.0, transparent: true, opacity: 0.32, depthWrite: false,
    }), false);
    // названия на полосе под кровлей
    const tex = stopSign(stops.map(s => s.name));
    const P2 = [], U2 = [], N2 = [], I2 = [];
    stops.forEach((st, i) => {
      const ca = Math.cos(st.a), sa = Math.sin(st.a);
      const loc = (lx, ly, lz) => [st.x + lx * ca + lz * sa, st.y + ly, st.z - lx * sa + lz * ca];
      const z = SH_D / 2 + 0.135, W = SH_L * 0.92, y0 = SH_H - 0.17, y1 = SH_H + 0.07;
      const b = P2.length / 3;
      for (const [lx, ly, u, v] of [[-W / 2, y0, 0, 1 - (i + 1) / stops.length], [W / 2, y0, 1, 1 - (i + 1) / stops.length],
        [W / 2, y1, 1, 1 - i / stops.length], [-W / 2, y1, 0, 1 - i / stops.length]]) {
        P2.push(...loc(lx, ly, z)); U2.push(u, v); N2.push(sa, 0, ca);
      }
      I2.push(b, b + 1, b + 2, b, b + 2, b + 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P2, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U2, 2));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N2, 3));
    g.setIndex(I2);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }));
    m.name = 'street:stop-names';
    group.add(m);
  }
  return group;
}
