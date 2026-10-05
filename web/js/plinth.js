// Цоколь под готовой моделью здания (стиль 'model' в landmarks.json).
//
// Ноль модели — тротуар у её точки (ox, oz), ниже нуля у модели свой цоколь
// метра на три. На улице, которая уходит под уклон вдоль дома, земля у
// нижнего угла оказывается ниже этого цоколя — и дом висел над склоном
// (гостиница «Севастополь» на Айвазовского — до 7.7 м). У рядовых домов
// цоколь строится до земли сам (buildBuildings); моделям достраиваем его
// здесь: каменная стенка по контуру дома из OSM (тот, что модель заменяет,
// поле skip), от нижней кромки модели до земли.
import * as THREE from 'three';

const TOP = -0.5;        // верх стенки — под нулём модели (дальше её собственный цоколь)
const INSET = 0.4;       // контур OSM чуть внутрь: стенка не выступает из-под фасада
const STONE = [0.56, 0.54, 0.50];

export function buildModelPlinths(defs, buildings, terrain) {
  const group = new THREE.Group();
  group.name = 'цоколи моделей';
  const P = [], C = [], I = [];
  let made = 0;
  for (const d of defs || []) {
    if (d.style !== 'model' || !d.skip || d.ox === undefined) continue;
    const y0 = d.y ?? terrain.gridHeightAt(d.ox, d.oz);
    for (const b of buildings || []) {
      if (!d.skip.includes(b.id) || !b.poly || b.poly.length < 6) continue;
      const p = b.poly, n = p.length / 2;
      let cx = 0, cz = 0; for (let i = 0; i < n; i++) { cx += p[i * 2]; cz += p[i * 2 + 1]; } cx /= n; cz /= n;
      const pt = i => { const x = p[i * 2], z = p[i * 2 + 1], dx = cx - x, dz = cz - z, l = Math.hypot(dx, dz) || 1;
        return [x + dx / l * INSET, z + dz / l * INSET]; };
      for (let i = 0; i < n; i++) {
        const [ax, az] = pt(i), [bx, bz] = pt((i + 1) % n);
        const L = Math.hypot(bx - ax, bz - az);
        if (L < 0.2) continue;
        const k = Math.max(1, Math.ceil(L / 2));
        let prev = null;
        for (let s = 0; s <= k; s++) {
          const x = ax + (bx - ax) * s / k, z = az + (bz - az) * s / k;
          const top = y0 + TOP, bot = Math.min(top, terrain.gridHeightAt(x, z) - 0.5);
          const v = P.length / 3;
          P.push(x, top, z, x, bot, z);
          for (let q = 0; q < 2; q++) C.push(STONE[0], STONE[1], STONE[2]);
          // стенку рисуем, только где под моделью и правда пусто
          if (prev !== null && (bot < top - 0.1 || prev.low)) I.push(prev.v, prev.v + 1, v, v, prev.v + 1, v + 1);
          prev = { v, low: bot < top - 0.1 };
        }
        made++;
      }
    }
  }
  if (!I.length) return group;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  geo.setIndex(I);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }));
  // тень стенка не отбрасывает: двусторонняя, она затеняла сама себя полосами
  m.receiveShadow = true;
  group.add(m);
  group.userData.edges = made;
  return group;
}

// ---- Цоколь памятника по собственному пятну модели ----
//
// У памятников контура в OSM нет, а ноль модели — земля у одной точки (ox,
// oz). На склоне нижний край постамента у «Комсомольцам», Екатерины,
// «Солдата и Матроса», фонтана бульвара висел над землёй на 1.7–2 м; у
// Графской то же с лестницей к воде — её нет в контуре OSM (там только
// пропилеи), и стенка buildModelPlinths её не достаёт. Достраиваем стенку
// по выпуклой оболочке низа модели (вершины ниже LOW над нулём, как пятно
// в tools/model-pads.mjs): верх — низ модели над этой точкой, низ — земля.
// Где под моделью и так земля, где оболочка проходит по пустому (над точкой
// нет ни одного треугольника модели) — ничего не ставим. Считаем, когда приехала
// модель: вершины её дальней ступени (lod) лежат в тех же местах.

const LOW = 1.5;          // «низ» модели: вершины ниже этого над нулём
const SK_INSET = 0.15;    // стенка чуть внутрь пятна: не выступает из-под камня
const SK_STEP = 1.0;
const CELL = 0.5;
let SK_MAT = null;

// Модели, которым стенка не нужна: дерево (стенка вокруг ствола), мостик
// (стенка закрыла бы пролёт), корабли в воде (высота задана y).
const NO_SKIRT = new Set(['drakon_most.glb', 'cedar_lazarev.glb', 'tree_ushakov.glb']);
// Модели зданий, у которых часть модели вне контура OSM: Графская — лестница.
const SKIRT_TOO = new Set(['grafskaya.glb']);

export function wantsSkirt(d) {
  if (d.style !== 'model' || d.y !== undefined || NO_SKIRT.has(d.file)) return false;
  return !(d.skip && d.skip.length) || SKIRT_TOO.has(d.file);
}

function hull(pts) {
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of pts) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  lo.pop(); up.pop();
  return lo.concat(up);
}

// src — сцена модели (её оси = оси мира со сдвигом в holder), pos — где стоит
// ноль модели. Возвращает сетку в осях holder или null, если не висит нигде.
export function buildMonumentSkirt(src, pos, terrain) {
  src.updateMatrixWorld(true);
  // треугольники модели в её осях, разложенные по клеткам CELL×CELL
  const T = [], cells = new Map(), low = new Map(), v = new THREE.Vector3();
  src.traverse(o => {
    if (!o.isMesh || !o.geometry.attributes.position) return;
    const pa = o.geometry.attributes.position, ix = o.geometry.index;
    const n = ix ? ix.count : pa.count;
    const at = new Float32Array(pa.count * 3);
    for (let i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld);
      at[i * 3] = v.x; at[i * 3 + 1] = v.y; at[i * 3 + 2] = v.z;
      if (v.y < LOW) { const k = Math.round(v.x / CELL) + ',' + Math.round(v.z / CELL);
        if (!low.has(k)) low.set(k, [Math.round(v.x / CELL) * CELL, Math.round(v.z / CELL) * CELL]); }
    }
    for (let t = 0; t < n; t += 3) {
      const q = [0, 1, 2].map(j => (ix ? ix.getX(t + j) : t + j) * 3);
      const tri = q.flatMap(j => [at[j], at[j + 1], at[j + 2]]);
      const ti = T.push(tri) - 1;
      const x0 = Math.floor(Math.min(tri[0], tri[3], tri[6]) / CELL), x1 = Math.floor(Math.max(tri[0], tri[3], tri[6]) / CELL);
      const z0 = Math.floor(Math.min(tri[2], tri[5], tri[8]) / CELL), z1 = Math.floor(Math.max(tri[2], tri[5], tri[8]) / CELL);
      if ((x1 - x0 + 1) * (z1 - z0 + 1) > 4000) continue;   // стенка-полотно в пол-квартала не нужна
      for (let a = x0; a <= x1; a++) for (let c = z0; c <= z1; c++) {
        const k = a + ',' + c; let l = cells.get(k); if (!l) cells.set(k, l = []); l.push(ti);
      }
    }
  });
  if (low.size < 3) return null;
  const H = hull([...low.values()]);
  if (H.length < 3) return null;
  // низ модели над точкой: самый нижний треугольник, который её накрывает
  // (по вершинам не выйдет: у плоской грани вершины только по углам)
  const under = (x, z) => {
    const l = cells.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL));
    let m = Infinity;
    if (l) for (const ti of l) {
      const t = T[ti];
      const ax = t[0], az = t[2], bx = t[3] - ax, bz = t[5] - az, cx = t[6] - ax, cz = t[8] - az;
      const d = bx * cz - bz * cx;
      if (Math.abs(d) < 1e-9) continue;          // стенка, видна ребром
      const px = x - ax, pz = z - az;
      const u = (px * cz - pz * cx) / d, w = (bx * pz - bz * px) / d;
      if (u < -1e-4 || w < -1e-4 || u + w > 1 + 1e-4) continue;
      const y = t[1] + (t[4] - t[1]) * u + (t[7] - t[1]) * w;
      if (y < m) m = y;
    }
    return m;
  };
  let cx = 0, cz = 0; for (const p of H) { cx += p[0]; cz += p[1]; } cx /= H.length; cz /= H.length;
  const P = [], I = [];
  let hang = 0;
  for (let i = 0; i < H.length; i++) {
    const pin = p => { const dx = cx - p[0], dz = cz - p[1], l = Math.hypot(dx, dz) || 1; return [p[0] + dx / l * SK_INSET, p[1] + dz / l * SK_INSET]; };
    const [ax, az] = pin(H[i]), [bx, bz] = pin(H[(i + 1) % H.length]);
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 0.2) continue;
    const k = Math.max(1, Math.ceil(L / SK_STEP));
    let prev = null;
    for (let s = 0; s <= k; s++) {
      const x = ax + (bx - ax) * s / k, z = az + (bz - az) * s / k;
      const u = under(x, z);
      // над точкой только карниз или крона (у Графской — антаблемент) — не цоколь
      if (u > LOW) { prev = null; continue; }
      const g = terrain.gridHeightAt(pos.x + x, pos.z + z) - pos.y;
      const top = u + 0.05, bot = Math.min(top, g - 0.5);
      const isLow = top - g > 0.1;
      if (isLow) hang = Math.max(hang, top - g);
      const vi = P.length / 3;
      P.push(x, top, z, x, bot, z);
      if (prev && (isLow || prev.low)) I.push(prev.v, prev.v + 1, vi, vi, prev.v + 1, vi + 1);
      prev = { v: vi, low: isLow };
    }
  }
  if (!I.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setIndex(I);
  geo.computeVertexNormals();
  SK_MAT ||= new THREE.MeshStandardMaterial({ color: new THREE.Color(...STONE), roughness: 0.9, side: THREE.DoubleSide });
  const m = new THREE.Mesh(geo, SK_MAT);
  m.name = 'цоколь памятника';
  m.receiveShadow = true;
  m.userData.hang = +hang.toFixed(2);
  return m;
}
