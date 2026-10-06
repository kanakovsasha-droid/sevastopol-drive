// Ровные спортполя на НАРИСОВАННОЙ земле.
//
// installFlats (sport.js) срезает и подсыпает рельеф под полем — но только
// в heightAt. Квадрат земли (buildTerrainTile) после выборки высот ещё
// «открывает» поле (openGround), сносит дома, вдавливает дороги и кладёт
// террасы скверов. На склоне подсыпанная площадка для открытия — горб, и он
// уходил: у Гимназии №1 (−245, 828) сетка под полем лежала на 7 м ниже
// отметки, полотно поля повторяло её волнами.
//
// Поэтому в самом конце (после террас, площадок домов и срезов) узлы сетки
// под полями ставим на отметку площадки ещё раз. Откос площадки дома поле
// забирает себе (у поля 2 гимназии он стягивал край на 4.5 м вниз), но
// землю у самых стен (HOUSE м) оставляет дому — иначе дом повиснет. Ровно — сам контур и полоса FULL за ним: узел
// на диагонали ячейки (9.14 · √2 ≈ 13 м) ещё держит треугольник, в который
// попадает край поля. Дальше на FEATHER метрах — откос к тому, что было.
// За контуром землю только СРЕЗАЕМ (склон выше поля): подсыпка за кромкой
// у дороги вставала горбом, а перепад вниз и так закрывает стенка.
// Улицу не трогаем: на полотне дороги (core коридора) вес гаснет — дороги
// первичны. Плоскую зону коридора за кромкой (13 м) поле забирает себе:
// поле у Гимназии стоит вплотную к спуску Шестакова, и зона коридора
// накрывала его целиком.
// Считается только по положению узла и его же высоте — шов двух квадратов
// получает одно и то же.
import * as THREE from 'three';
import { sportData, inPoly, edgeDist } from './sport.js?v=2628e755';

const FULL = 13, FEATHER = 9;
const HOUSE = 6, HOUSE_F = 4;     // у стены — дому, дальше за 4 м — полю
const CELL = 128;
let IDX = null, IDX_SRC = null;

function index() {
  const flats = sportData().flats || [];
  if (IDX && IDX_SRC === flats) return IDX;
  IDX = new Map(); IDX_SRC = flats;
  const R = FULL + FEATHER;
  for (const f of flats) {
    const p = f.poly;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < p.length; i += 2) {
      if (p[i] < x0) x0 = p[i]; if (p[i] > x1) x1 = p[i];
      if (p[i + 1] < z0) z0 = p[i + 1]; if (p[i + 1] > z1) z1 = p[i + 1];
    }
    f.gb = [x0 - R, z0 - R, x1 + R, z1 + R];
    for (let j = Math.floor(f.gb[1] / CELL); j <= Math.floor(f.gb[3] / CELL); j++)
      for (let i = Math.floor(f.gb[0] / CELL); i <= Math.floor(f.gb[2] / CELL); i++) {
        const k = i + '_' + j;
        let a = IDX.get(k);
        if (!a) IDX.set(k, a = []);
        a.push(f);
      }
  }
  return IDX;
}

// h — сетка ne×ne с началом (ox, oz) и шагом step; corrAt(x, z) — выборка
// коридора дорог ({ core } — доля проезжей части); buildings — дома квадрата
// ({ poly }). Возвращает число тронутых узлов.
export function applyFieldFlats(h, ne, ox, oz, step, corrAt, buildings = []) {
  const ix = index();
  if (!ix.size) return 0;
  const x1 = ox + (ne - 1) * step, z1 = oz + (ne - 1) * step;
  const seen = new Set(), list = [];
  for (let j = Math.floor(oz / CELL); j <= Math.floor(z1 / CELL); j++)
    for (let i = Math.floor(ox / CELL); i <= Math.floor(x1 / CELL); i++)
      for (const f of ix.get(i + '_' + j) || [])
        if (!seen.has(f)) { seen.add(f); list.push(f); }
  if (!list.length) return 0;
  // дома рядом с полями: их пятна, рамки
  const R = FULL + FEATHER + HOUSE + HOUSE_F;
  const houses = [];
  for (const b of buildings) {
    const p = b.poly;
    if (!p || p.length < 6) continue;
    let bx0 = Infinity, bz0 = Infinity, bx1 = -Infinity, bz1 = -Infinity;
    for (let i = 0; i < p.length; i += 2) {
      if (p[i] < bx0) bx0 = p[i]; if (p[i] > bx1) bx1 = p[i];
      if (p[i + 1] < bz0) bz0 = p[i + 1]; if (p[i + 1] > bz1) bz1 = p[i + 1];
    }
    if (!list.some(f => bx1 + R > f.gb[0] && bx0 - R < f.gb[2] && bz1 + R > f.gb[1] && bz0 - R < f.gb[3])) continue;
    houses.push({ p, bb: [bx0 - HOUSE - HOUSE_F, bz0 - HOUSE - HOUSE_F, bx1 + HOUSE + HOUSE_F, bz1 + HOUSE + HOUSE_F] });
  }
  // по узлу — самый сильный вес и его отметка (как в installFlats)
  const W = new Float32Array(ne * ne), T = new Float32Array(ne * ne);
  const IN = new Uint8Array(ne * ne);     // узел внутри контура: и срез, и подсыпка
  for (const f of list) {
    const b = f.gb;
    const i0 = Math.max(0, Math.ceil((b[0] - ox) / step)), i1 = Math.min(ne - 1, Math.floor((b[2] - ox) / step));
    const j0 = Math.max(0, Math.ceil((b[1] - oz) / step)), j1 = Math.min(ne - 1, Math.floor((b[3] - oz) / step));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const x = ox + i * step, z = oz + j * step;
        let k;
        const inside = inPoly(x, z, f.poly);
        if (inside) k = 1;
        else {
          const d = edgeDist(x, z, f.poly);
          if (d <= FULL) k = 1;
          else if (d >= FULL + FEATHER) continue;
          else { const t = (d - FULL) / FEATHER; k = 1 - t * t * (3 - 2 * t); }
        }
        const n = j * ne + i;
        if (inside) IN[n] = 1;
        if (k > W[n]) { W[n] = k; T[n] = f.h; }
      }
  }
  let hit = 0;
  for (let n = 0; n < W.length; n++) {
    let k = W[n];
    if (!k) continue;
    if (!IN[n] && h[n] <= T[n]) continue;
    const x = ox + (n % ne) * step, z = oz + Math.floor(n / ne) * step;
    const cr = corrAt && corrAt(x, z);
    if (cr && cr.core) k *= 1 - Math.min(1, cr.core);
    if (k <= 0) continue;
    for (const b of houses) {
      if (x < b.bb[0] || x > b.bb[2] || z < b.bb[1] || z > b.bb[3]) continue;
      const d = inPoly(x, z, b.p) ? 0 : edgeDist(x, z, b.p);
      if (d <= HOUSE) { k = 0; break; }
      if (d < HOUSE + HOUSE_F) { const t = (d - HOUSE) / HOUSE_F; k *= t * t * (3 - 2 * t); }
    }
    if (k <= 0) continue;
    h[n] += (T[n] - h[n]) * k;
    hit++;
  }
  return hit;
}

// Отметка площадки по id контура или null. Полотно поля рисуется на ней
// ровно (как навес АЗС), а не по сетке: край поля между узлами сетки иначе
// провисал бы к откосу. У стадиона, разложенного на кольцо и поле
// (id:ring, id:field), отметка общая — исходного контура.
let LEV = null, LEV_SRC = null;
export function fieldLevel(id) {
  const flats = sportData().flats || [];
  if (!LEV || LEV_SRC !== flats) { LEV = new Map(flats.map(f => [f.id, f.h])); LEV_SRC = flats; }
  if (!id) return null;
  const v = LEV.get(id) ?? LEV.get(String(id).replace(/:(ring|field)$/, ''));
  return v ?? null;
}

// ---------------------------------------------------------------- подпорные стенки
// Поле рисуется ровно, а земля у кромки бывает ниже: у дороги сетку держит
// коридор (его зона — 13 м за асфальтом, узлы там трогать нельзя — уедет
// полотно улицы), на крутом откосе девятиметровый треугольник не успевает
// подняться. Там, где поле выше нарисованной земли, по кромке ставим стенку
// от полотна до земли — как настоящая подпорная стенка площадки на склоне.
// Одна сетка на квадрат, цвета вершин.
const WALL_MIN = 0.25;   // ниже — хватает откоса, стенка не нужна
const WALL_T = 0.35;     // толщина
const WALL_STEP = 2;     // м на кусок стенки
const s2l = v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
const STONE = [0.66, 0.64, 0.60].map(v => Math.round(255 * s2l(v)));
const STONE_TOP = [0.74, 0.73, 0.70].map(v => Math.round(255 * s2l(v)));

export function buildFieldWalls(world, terrain) {
  const P = [], N = [], C = [], I = [];
  const COV = world.__coverage;
  const onRoad = COV ? (x, z) => COV.onRoad(x, z) : () => false;
  const G = (x, z) => terrain.gridHeightAt(x, z);
  const B = world.meta && world.meta.bounds;
  // как у снаряжения: стенку ставит только свой квадрат, без каймы 260 м
  const mine = (x, z) => !B || (x >= B.minX + 260 && x < B.maxX - 260 && z >= B.minZ + 260 && z < B.maxZ - 260);
  const quad = (a, b, c, d, nx, ny, nz, col) => {
    const q = P.length / 3;
    for (const v of [a, b, c, d]) { P.push(v[0], v[1], v[2]); N.push(nx, ny, nz); C.push(col[0], col[1], col[2]); }
    I.push(q, q + 1, q + 2, q, q + 2, q + 3);
  };
  const levels = new Map();       // отметки соседних полей: на стыке стенку не ставим
  for (const a of world.__areasDraw || []) if (a.__flatY != null) levels.set(a, a.__flatY + (a.__lift || 0));
  let metres = 0;
  for (const [a, top] of levels) {
    const p = a.poly;
    let n = p.length / 2;
    if (n > 1 && p[0] === p[(n - 1) * 2] && p[1] === p[(n - 1) * 2 + 1]) n--;
    if (n < 3) continue;
    let A = 0;
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; A += p[i * 2] * p[j * 2 + 1] - p[j * 2] * p[i * 2 + 1]; }
    const sg = A > 0 ? 1 : -1;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = p[i * 2], az = p[i * 2 + 1], bx = p[j * 2], bz = p[j * 2 + 1];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 0.5) continue;
      const ux = (bx - ax) / L, uz = (bz - az) / L;
      // наружу: при A > 0 (квадрат (0,0)→(1,0)→(1,1)) наружу у первого
      // ребра — к z < 0
      const ox = uz * sg, oz = -ux * sg;
      const k = Math.max(1, Math.round(L / WALL_STEP));
      for (let s = 0; s < k; s++) {
        const x0 = ax + (bx - ax) * s / k, z0 = az + (bz - az) * s / k;
        const x1 = ax + (bx - ax) * (s + 1) / k, z1 = az + (bz - az) * (s + 1) / k;
        const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
        if (!mine(mx, mz) || onRoad(mx + ox * 0.5, mz + oz * 0.5)) continue;
        // соседнее поле на той же или большей отметке — стенка не нужна
        let shared = false;
        for (const [b, tb] of levels) {
          if (b === a || tb < top - WALL_MIN) continue;
          if (inPoly(mx + ox * 0.6, mz + oz * 0.6, b.poly)) { shared = true; break; }
        }
        if (shared) continue;
        // земля снаружи стенки, у её подошвы
        const g0 = G(x0 + ox * WALL_T, z0 + oz * WALL_T), g1 = G(x1 + ox * WALL_T, z1 + oz * WALL_T);
        if (top - g0 < WALL_MIN && top - g1 < WALL_MIN) continue;
        const y0 = Math.min(g0, top) - 0.3, y1 = Math.min(g1, top) - 0.3, yt = top + 0.12;
        const X0 = x0 + ox * WALL_T, Z0 = z0 + oz * WALL_T, X1 = x1 + ox * WALL_T, Z1 = z1 + oz * WALL_T;
        // лицевая грань наружу и верх
        quad([X0, y0, Z0], [X1, y1, Z1], [X1, yt, Z1], [X0, yt, Z0], ox, 0, oz, STONE);
        quad([X0, yt, Z0], [X1, yt, Z1], [x1, yt, z1], [x0, yt, z0], 0, 1, 0, STONE_TOP);
        metres += L / k;
      }
    }
  }
  const g = new THREE.BufferGeometry();
  if (P.length) {
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('color', new THREE.Uint8BufferAttribute(C, 3, true));
    g.setIndex(I);
  }
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }));
  mesh.name = 'field-walls';
  mesh.visible = P.length > 0;
  mesh.castShadow = false; mesh.receiveShadow = true;
  mesh.userData.metres = Math.round(metres);
  return mesh;
}
