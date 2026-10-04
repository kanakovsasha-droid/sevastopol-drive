import * as THREE from 'three';

// Школы центра (data/schools.json) — типовой проект поверх контура OSM.
// Массу, школьный фасад (ленты окон) и плоскую кровлю уже даёт buildBuildings
// по b.school. Здесь то, чем типовая школа 1950–80-х узнаётся с улицы и чего у
// коробки нет: парапет по краю плоской кровли и крыльцо — ступени, площадка,
// бетонный козырёк на двух столбах, двустворчатая дверь. Вход ставим на
// стену к ближайшей улице (настоящего положения входа в OSM нет). Номер
// школы — табличкой над козырьком, только там, где он подтверждён.

let SCHOOLS = new Map();

export async function loadSchools(v) {
  const d = await fetch(`../data/schools.json${v ? '?v=' + v : ''}`)
    .then(r => r.ok ? r.json() : null).catch(() => null);
  SCHOOLS = new Map(((d && d.items) || []).map(s => [s.id, s]));
  return SCHOOLS;
}

const CONCRETE = [0.74, 0.73, 0.70], STEP = [0.62, 0.61, 0.59], DOOR = [0.10, 0.065, 0.045],
      COPING = [0.80, 0.79, 0.76];

// расстояние от точки до ближайшей улицы (не тротуара) квадрата
function roadDist(roads, x, z) {
  let best = Infinity;
  for (const r of roads) {
    if (r.c > 3 || r.tn) continue;
    const p = r.pts;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = p[i], az = p[i + 1], vx = p[i + 2] - ax, vz = p[i + 3] - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz || 1)));
      const d = Math.hypot(x - ax - t * vx, z - az - t * vz) - r.w / 2;
      if (d < best) best = d;
    }
  }
  return best;
}

// Табличку с номером и стену входа — до сборки вывесок (signs.js читает b.sg, b.sw).
export function prepSchools(w) {
  for (const b of w.buildings) {
    const s = SCHOOLS.get(b.id);
    if (!s || b.hand) continue;
    const e = entranceEdge(b, w.roads);
    if (!e) continue;
    b.__door = e;
    if (s.n && !(b.sg || []).length) { b.sg = [{ n: s.n, c: 'school' }]; b.sw = [e.ax, e.az, e.bx, e.bz]; }
  }
}

function entranceEdge(b, roads) {
  const p = b.poly, n = p.length / 2;
  let a2 = 0;
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; a2 += p[i * 2] * p[j * 2 + 1] - p[j * 2] * p[i * 2 + 1]; }
  const sgn = a2 > 0 ? 1 : -1;
  let best = null;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = p[i * 2], az = p[i * 2 + 1], bx = p[j * 2], bz = p[j * 2 + 1];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 9) continue;
    const ux = (bx - ax) / L, uz = (bz - az) / L;
    // наружная нормаль: при обходе против часовой (a2 > 0 в осях x,z) — (uz, −ux)
    const nx = uz * sgn, nz = -ux * sgn;
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    const d = roadDist(roads, mx + nx * 3, mz + nz * 3) - L * 0.05;   // при равенстве — длинная стена
    if (!best || d < best.d) best = { d, ax, az, bx, bz, ux, uz, nx, nz, mx, mz, L };
  }
  return best;
}

export function buildSchools(w, terrain, skip) {
  const group = new THREE.Group();
  group.name = 'школы';
  const B = w.meta && w.meta.bounds;
  const mine = (x, z) => !B || (x >= B.minX + 260 && x < B.maxX - 260 && z >= B.minZ + 260 && z < B.maxZ - 260);
  const P = [], C = [];
  const G = (x, z) => terrain.gridHeightAt(x, z);
  // брус по рамке (ось u вдоль стены, n наружу): u0..u1, n0..n1, y0..y1
  const box = (f, u0, u1, n0, n1, y0, y1, col) => {
    const q = (u, nn, y) => [f.ox + f.ux * u + f.nx * nn, y, f.oz + f.uz * u + f.nz * nn];
    const c = [q(u0, n0, y0), q(u1, n0, y0), q(u1, n1, y0), q(u0, n1, y0),
               q(u0, n0, y1), q(u1, n0, y1), q(u1, n1, y1), q(u0, n1, y1)];
    for (const [a, b2, c2, d] of [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [4, 5, 6, 7]])
      for (const k of [a, b2, c2, a, c2, d]) { P.push(...c[k]); C.push(...col); }
  };
  w.buildings.forEach((b, bi) => {
    if (!SCHOOLS.has(b.id) || b.hand || (skip && skip.has(bi)) || !b.__door) return;
    const p = b.poly, n = p.length / 2;
    if (!mine(p[0], p[1])) return;
    // отметки — как в buildBuildings: пол по самой высокой точке земли у стен
    let gmax = -Infinity;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ax = p[i * 2], az = p[i * 2 + 1], ex = p[j * 2] - ax, ez = p[j * 2 + 1] - az;
      const k = Math.max(1, Math.ceil(Math.hypot(ex, ez) / 2));
      for (let s = 0; s < k; s++) gmax = Math.max(gmax, G(ax + ex * s / k, az + ez * s / k));
    }
    const yFloor = gmax, yTop = gmax + b.h;
    // парапет: по каждой стене, внутрь от её плоскости
    let a2 = 0;
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; a2 += p[i * 2] * p[j * 2 + 1] - p[j * 2] * p[i * 2 + 1]; }
    const sgn = a2 > 0 ? 1 : -1;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = p[i * 2], az = p[i * 2 + 1], L = Math.hypot(p[j * 2] - ax, p[j * 2 + 1] - az);
      if (L < 0.5) continue;
      const ux = (p[j * 2] - ax) / L, uz = (p[j * 2 + 1] - az) / L;
      const f = { ox: ax, oz: az, ux, uz, nx: uz * sgn, nz: -ux * sgn };
      box(f, -0.02, L + 0.02, -0.32, 0.04, yTop - 0.05, yTop + 0.55, CONCRETE);
      box(f, -0.05, L + 0.05, -0.36, 0.08, yTop + 0.55, yTop + 0.65, COPING);
    }
    // крыльцо посередине стены входа
    const e = b.__door;
    const f = { ox: e.mx, oz: e.mz, ux: e.ux, uz: e.uz, nx: e.nx, nz: e.nz };
    const W2 = 2.4, D = 2.0;
    box(f, -1.1, 1.1, -0.05, 0.08, yFloor, yFloor + 2.6, DOOR);                     // дверь
    box(f, -1.25, 1.25, -0.02, 0.1, yFloor + 2.6, yFloor + 2.75, CONCRETE);          // перемычка
    box(f, -W2 - 0.2, W2 + 0.2, 0, D + 0.4, yFloor + 3.1, yFloor + 3.32, CONCRETE);  // козырёк
    for (const s of [-W2, W2]) box(f, s - 0.14, s + 0.14, D + 0.06, D + 0.34, yFloor - 0.3, yFloor + 3.1, CONCRETE);
    // площадка и ступени до земли перед крыльцом
    box(f, -W2, W2, 0, D, yFloor - 0.6, yFloor, STEP);
    const drop = yFloor - G(e.mx + e.nx * (D + 1), e.mz + e.nz * (D + 1));
    const k = Math.max(0, Math.min(14, Math.round(drop / 0.16)));
    for (let s = 0; s < k; s++) {
      const y = yFloor - (s + 1) * drop / (k + 0.0001);
      box(f, -W2 + 0.3, W2 - 0.3, D + s * 0.3, D + (s + 1) * 0.3, y - 0.4, y + drop / (k + 0.0001), STEP);
    }
  });
  if (P.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide, shadowSide: THREE.BackSide }));
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  }
  return group;
}
