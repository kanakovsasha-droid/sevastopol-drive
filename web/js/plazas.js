import * as THREE from 'three';
import { pavingBuffer, pavingMesh } from './paving.js?v=90d69937';
import { plantFlora } from './flora.js?v=90d69937';

// Мощёные площадки перед домами (data/plazas.json): у OSM их нет ни контуром,
// ни мебелью, а на панорамах там плитка до фасадов, кадки с деревьями, летняя
// терраса кафе. Первая — перед пр. Нахимова, 12 на пл. Лазарева (п. 38,
// tools/lazareva-plaza.mjs).
//
// Площадка — четырёхугольник quad (обход: у стены от u0 к u1, затем кромка у
// тротуара назад), плитка кладётся сеткой ~1.5 м тем же шейдером дорог, что
// и paving.js, — по рельефу, с обходом асфальта. Мебель площадки — одна общая
// сетка на цветах вершин (один вызов отрисовки), платаны в кадках — flora.js.
// Строит площадку один квадрат — тот, в чьих границах её первая вершина.

let PLAZAS = [];

export async function loadPlazas(v) {
  PLAZAS = await fetch(`../data/plazas.json${v ? '?v=' + v : ''}`)
    .then(r => r.ok ? r.json() : []).catch(() => []);
  return PLAZAS;
}

const inQuad = (q, x, z) => {
  let c = false;
  for (let i = 0, j = q.length - 2; i < q.length; j = i, i += 2) {
    const xi = q[i], zi = q[i + 1], xj = q[j], zj = q[j + 1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
  }
  return c;
};

// На площадке не сажать уличные деревья и кусты props.js: у неё свои кадки.
export function plazaBlocker(prev) {
  if (!PLAZAS.length) return prev;
  const np = prev || (() => false);
  return (x, z) => np(x, z) || PLAZAS.some(p => inQuad(p.quad, x, z));
}

const s2l = v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
const lin = c => c.map(s2l);

// Сетка мебели: боксы, цилиндры и полукупола маркиз в мировых осях,
// цвет — на вершине (линейный).
function Mesher() {
  const P = [], N = [], C = [];
  const v3 = new THREE.Vector3(), n3 = new THREE.Vector3();
  const tri = (m, a, b, c, col) => {
    const pa = a.clone().applyMatrix4(m), pb = b.clone().applyMatrix4(m), pc = c.clone().applyMatrix4(m);
    n3.subVectors(pc, pb).cross(v3.subVectors(pa, pb)).normalize();
    for (const p of [pa, pb, pc]) { P.push(p.x, p.y, p.z); N.push(n3.x, n3.y, n3.z); C.push(...col); }
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  // m — матрица объекта; бокс по центру (cx, cy, cz) локально, размеры sx, sy, sz
  const box = (m, cx, cy, cz, sx, sy, sz, col, bottom = false) => {
    const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
    const q = (a, b, c, d) => { tri(m, a, b, c, col); tri(m, a, c, d, col); };
    q(V(x0, y1, z0), V(x0, y1, z1), V(x1, y1, z1), V(x1, y1, z0));     // верх
    if (bottom) q(V(x0, y0, z0), V(x1, y0, z0), V(x1, y0, z1), V(x0, y0, z1));
    q(V(x0, y0, z1), V(x1, y0, z1), V(x1, y1, z1), V(x0, y1, z1));     // +z
    q(V(x1, y0, z0), V(x0, y0, z0), V(x0, y1, z0), V(x1, y1, z0));     // −z
    q(V(x1, y0, z1), V(x1, y0, z0), V(x1, y1, z0), V(x1, y1, z1));     // +x
    q(V(x0, y0, z0), V(x0, y0, z1), V(x0, y1, z1), V(x0, y1, z0));     // −x
  };
  const cyl = (m, cx, cz, y0, y1, r, col, seg = 8, cap = true) => {
    for (let i = 0; i < seg; i++) {
      const a = i / seg * Math.PI * 2, b = (i + 1) / seg * Math.PI * 2;
      const ax = cx + Math.cos(a) * r, az = cz + Math.sin(a) * r, bx = cx + Math.cos(b) * r, bz = cz + Math.sin(b) * r;
      tri(m, V(ax, y0, az), V(ax, y1, az), V(bx, y1, bz), col);
      tri(m, V(ax, y0, az), V(bx, y1, bz), V(bx, y0, bz), col);
      if (cap) tri(m, V(cx, y1, cz), V(bx, y1, bz), V(ax, y1, az), col);
    }
  };
  // Маркиза-полукупол: четверть эллипсоида у стены — верх на стене, кромка
  // полукругом внизу на вылете dep. Локально: стена — плоскость z = 0, +z наружу.
  // Видна и снизу — каждая грань в два обхода.
  const dome = (m, w, dep, h, col, colIn) => {
    const NT = 8, NP = 4, pt = (t, p) => V(Math.cos(t) * Math.sin(p) * w / 2, h * Math.cos(p), Math.sin(t) * Math.sin(p) * dep);
    for (let i = 0; i < NT; i++) for (let j = 0; j < NP; j++) {
      const t0 = Math.PI * i / NT, t1 = Math.PI * (i + 1) / NT, p0 = Math.PI / 2 * j / NP, p1 = Math.PI / 2 * (j + 1) / NP;
      const a = pt(t0, p0), b = pt(t1, p0), c = pt(t1, p1), d = pt(t0, p1);
      tri(m, a, c, b, col); tri(m, a, d, c, col);
      tri(m, a, b, c, colIn); tri(m, a, c, d, colIn);
    }
    // фестон по кромке — полоска ткани вниз
    for (let i = 0; i < NT; i++) {
      const t0 = Math.PI * i / NT, t1 = Math.PI * (i + 1) / NT;
      const a = pt(t0, Math.PI / 2), b = pt(t1, Math.PI / 2);
      const a2 = a.clone().setY(-0.22), b2 = b.clone().setY(-0.22);
      tri(m, a, b2, b, col); tri(m, a, a2, b2, col);
      tri(m, a, b, b2, colIn); tri(m, a, b2, a2, colIn);
    }
  };
  const mesh = name => {
    if (!P.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.05 }));
    m.name = name; m.castShadow = true; m.receiveShadow = true;
    return m;
  };
  return { box, cyl, dome, mesh, tris: () => P.length / 9 };
}

const COL = {
  rim: lin([0.80, 0.79, 0.76]), soil: lin([0.26, 0.20, 0.15]),
  red: lin([0.72, 0.10, 0.09]), redIn: lin([0.55, 0.09, 0.08]),
  metal: lin([0.22, 0.22, 0.23]), top: lin([0.86, 0.85, 0.82]), chair: lin([0.36, 0.25, 0.17]),
  frame: lin([0.30, 0.31, 0.33]), panel: lin([0.88, 0.90, 0.92]),
};

// world — квадрат, onRoad — поле кромки асфальта (props.js).
export function buildPlazas(world, terrain, onRoad) {
  const group = new THREE.Group();
  group.name = 'plazas';
  const ctx = world.roads && world.roads.ctx;
  if (!PLAZAS.length || !ctx || ctx.orphan || ctx.x1 === undefined) return group;
  const own = (x, z) => x >= ctx.x0 && x < ctx.x1 && z >= ctx.z0 && z < ctx.z1;
  const asphalt = (x, z) => !!(onRoad && onRoad(x, z));
  // отметка плитки — как у paving.js: полотно дороги с предохранителем, не ниже земли
  const H = (x, z) => {
    const g = terrain.gridHeightAt(x, z), d = terrain.driveHeightAt(x, z);
    return Math.max(d < g - 1.7 ? g - 1.7 : d > g + 1.1 ? g + 1.1 : d, g);
  };
  const Y = (x, z) => H(x, z) + 0.19;
  const buf = pavingBuffer(), M = Mesher(), trees = { platan: [] };
  const mat = new THREE.Matrix4(), q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  const place = (x, y, z, a) => mat.compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(UP, a), one).clone();
  const stats = { plazas: 0, cells: 0 };

  for (const pl of PLAZAS) {
    const Q = pl.quad;
    if (!own(Q[0], Q[1])) continue;
    stats.plazas++;
    // ---- плитка: билинейная сетка по четырёхугольнику
    const len = (i, j) => Math.hypot(Q[j] - Q[i], Q[j + 1] - Q[i + 1]);
    const nu = Math.max(1, Math.ceil(Math.max(len(0, 2), len(6, 4)) / 1.5));
    const nd = Math.max(1, Math.ceil(Math.max(len(0, 6), len(2, 4)) / 1.5));
    const pt = (i, j) => {
      const s = i / nu, t = j / nd;
      const ax = Q[0] + (Q[2] - Q[0]) * s, az = Q[1] + (Q[3] - Q[1]) * s;
      const bx = Q[6] + (Q[4] - Q[6]) * s, bz = Q[7] + (Q[5] - Q[7]) * s;
      return [ax + (bx - ax) * t, az + (bz - az) * t];
    };
    const TILE = (pl.tile || [0.78, 0.77, 0.74]).map(s2l).map(v => Math.round(v * 255));
    const { P, R, K, CC, I } = buf;
    const idx = new Map();
    const vert = (i, j) => {
      const k = i * 10007 + j;
      if (idx.has(k)) return idx.get(k);
      const [x, z] = pt(i, j);
      P.push(x, Y(x, z), z); R.push(x, z, 2, 0); K.push(4); CC.push(...TILE);
      idx.set(k, P.length / 3 - 1);
      return P.length / 3 - 1;
    };
    // обход quad против часовой в плане (x — восток, z — юг): лицом вверх
    const ccw = ((Q[2] - Q[0]) * (Q[7] - Q[1]) - (Q[3] - Q[1]) * (Q[6] - Q[0])) < 0;
    for (let i = 0; i < nu; i++) for (let j = 0; j < nd; j++) {
      const c = [pt(i, j), pt(i + 1, j), pt(i + 1, j + 1), pt(i, j + 1)];
      const cx = (c[0][0] + c[2][0]) / 2, cz = (c[0][1] + c[2][1]) / 2;
      if (asphalt(cx, cz) || c.some(([x, z]) => asphalt(x, z))) continue;
      const a = vert(i, j), b = vert(i + 1, j), cc = vert(i + 1, j + 1), d = vert(i, j + 1);
      if (ccw) I.push(a, b, cc, a, cc, d); else I.push(a, cc, b, a, d, cc);
      buf.quads++; stats.cells++;
    }

    // ---- кадки-клумбы: бортовой камень, земля, платан
    for (const p of pl.planters || []) {
      const y = Y(p.x, p.z), m = place(p.x, y, p.z, p.a);
      const t = 0.18;
      M.box(m, 0, p.h / 2, (p.l - t) / 2, p.w, p.h, t, COL.rim);
      M.box(m, 0, p.h / 2, -(p.l - t) / 2, p.w, p.h, t, COL.rim);
      M.box(m, (p.w - t) / 2, p.h / 2, 0, t, p.h, p.l - 2 * t, COL.rim);
      M.box(m, -(p.w - t) / 2, p.h / 2, 0, t, p.h, p.l - 2 * t, COL.rim);
      M.box(m, 0, p.h - 0.08, 0, p.w - 2 * t, 0.02, p.l - 2 * t, COL.soil);
      if (p.tree && trees[p.tree]) {
        const h = (Math.sin(p.x * 12.9898 + p.z * 78.233) * 43758.5453) % 1;
        trees[p.tree].push(p.x, y + p.h - 0.08, p.z, 0.58 + Math.abs(h) * 0.1, 0.68 + Math.abs(h) * 0.1,
          Math.abs(h) * 6.283, 0, 0, 0);
      }
    }
    // ---- маркизы-полукупола над витринами: верх на стене
    for (const p of pl.awnings || []) {
      const y = Y(p.x, p.z);
      M.dome(place(p.x, y + p.top - p.h, p.z, p.a), p.w, p.dep, p.h, COL.red, COL.redIn);
    }
    // ---- столики террасы: круглая столешница на ножке, два стула друг напротив друга
    for (const p of pl.tables || []) {
      const y = Y(p.x, p.z), m = place(p.x, y, p.z, p.a);
      M.cyl(m, 0, 0, 0, 0.03, 0.22, COL.metal, 6);
      M.cyl(m, 0, 0, 0.03, 0.72, 0.035, COL.metal, 6, false);
      M.cyl(m, 0, 0, 0.72, 0.75, 0.36, COL.top, 10);
      for (const s of [-1, 1]) {
        const mc = place(p.x, y, p.z, p.a + (s < 0 ? Math.PI : 0)), z0 = 0.62;
        M.box(mc, 0, 0.45, z0, 0.42, 0.04, 0.42, COL.chair);
        M.box(mc, 0, 0.68, z0 + 0.2, 0.42, 0.44, 0.04, COL.chair);
        for (const [lx, lz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]])
          M.box(mc, lx, 0.215, z0 + lz, 0.03, 0.43, 0.03, COL.metal);
      }
    }
    // ---- урны
    for (const p of pl.bins || []) {
      const y = Y(p.x, p.z), m = place(p.x, y, p.z, 0);
      M.cyl(m, 0, 0, 0, 0.8, 0.22, lin(p.c || [0.4, 0.4, 0.4]), 10);
      M.cyl(m, 0, 0, 0.8, 0.84, 0.24, COL.metal, 10);
    }
    // ---- тумба сити-формата: световой короб на ноге, панели с двух сторон
    for (const p of pl.stands || []) {
      const y = Y(p.x, p.z), m = place(p.x, y, p.z, p.a);
      M.box(m, 0, 0.25, 0, 0.25, 0.5, 0.18, COL.frame);
      M.box(m, 0, 1.45, 0, 1.36, 1.9, 0.22, COL.frame);
      M.box(m, 0, 1.45, 0.115, 1.2, 1.74, 0.01, COL.panel);
      M.box(m, 0, 1.45, -0.115, 1.2, 1.74, 0.01, COL.panel);
    }
  }
  if (!stats.plazas) return group;
  const pm = pavingMesh(buf, 'plazas:paving');
  if (pm) group.add(pm);
  const fm = M.mesh('plazas:furniture');
  if (fm) group.add(fm);
  if (trees.platan.length) plantFlora(group, trees);
  stats.tris = M.tris();
  group.userData.stats = stats;
  return group;
}
