import * as THREE from 'three';
import { PolyGrid } from './worldgen.js?v=4920fe70';

// Оборудование детских площадок и машины на парковках. Места берутся из OSM
// (data/areas.json -> world.areas): качели и горки ставим только там, где в
// карте действительно отмечена playground, машины — только в размеченные
// ряды настоящих парковок. Ничего не выдумано, разброс детерминированный.

const s2l = v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
const rng = seed => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

function merge(parts) {
  let nv = 0, ni = 0;
  for (const { geo } of parts) {
    nv += geo.attributes.position.count;
    ni += geo.index ? geo.index.count : geo.attributes.position.count;
  }
  const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), C = new Uint8Array(nv * 3);
  const I = new Uint32Array(ni);
  let vo = 0, io = 0;
  for (const { geo, color } of parts) {
    P.set(geo.attributes.position.array, vo * 3);
    N.set(geo.attributes.normal.array, vo * 3);
    const n = geo.attributes.position.count;
    for (let i = 0; i < n; i++)
      for (let k = 0; k < 3; k++) C[(vo + i) * 3 + k] = Math.round(255 * s2l(color[k]));
    if (geo.index) for (let i = 0; i < geo.index.count; i++) I[io++] = geo.index.array[i] + vo;
    else for (let i = 0; i < n; i++) I[io++] = i + vo;
    vo += n;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.BufferAttribute(C, 3, true));
  g.setIndex(new THREE.BufferAttribute(I, 1));
  return g;
}

const STEEL = [0.42, 0.44, 0.47];
const BLUE  = [0.16, 0.33, 0.56];
const RED   = [0.68, 0.22, 0.16];
const YELL  = [0.82, 0.64, 0.15];
const GREEN = [0.22, 0.45, 0.28];
const WOOD  = [0.48, 0.34, 0.21];
const SAND  = [0.80, 0.72, 0.55];

// ---- качели: П-образная рама и два сиденья на подвесах
function swingGeo() {
  const parts = [];
  const H = 2.3, W = 3.0;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.CylinderGeometry(0.055, 0.065, H, 6);
      leg.rotateX(sz * 0.19);
      leg.translate(sx * W / 2, H / 2, sz * 0.42);
      parts.push({ geo: leg, color: BLUE });
    }
  }
  const bar = new THREE.CylinderGeometry(0.06, 0.06, W + 0.2, 8);
  bar.rotateZ(Math.PI / 2); bar.translate(0, H, 0);
  parts.push({ geo: bar, color: BLUE });
  for (const sx of [-0.72, 0.72]) {
    for (const dz of [-0.16, 0.16]) {
      const rope = new THREE.CylinderGeometry(0.018, 0.018, 1.45, 4);
      rope.translate(sx, H - 0.72, dz);
      parts.push({ geo: rope, color: STEEL });
    }
    const seat = new THREE.BoxGeometry(0.46, 0.06, 0.20);
    seat.translate(sx, H - 1.45, 0);
    parts.push({ geo: seat, color: RED });
  }
  return merge(parts);
}

// ---- горка: лесенка, площадка с бортиками и жёлтый скат
function slideGeo() {
  const parts = [];
  const H = 1.75;
  const deck = new THREE.BoxGeometry(1.0, 0.10, 1.0);
  deck.translate(0, H, 0);
  parts.push({ geo: deck, color: WOOD });
  for (const [sx, sz] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) {
    const leg = new THREE.CylinderGeometry(0.05, 0.055, H, 6);
    leg.translate(sx, H / 2, sz);
    parts.push({ geo: leg, color: BLUE });
  }
  // крыша домиком
  const roof = new THREE.ConeGeometry(0.95, 0.55, 4);
  roof.rotateY(Math.PI / 4);
  roof.translate(0, H + 1.35, 0);
  parts.push({ geo: roof, color: RED });
  for (const sx of [-0.45, 0.45]) {
    const post = new THREE.CylinderGeometry(0.04, 0.04, 1.1, 5);
    post.translate(sx, H + 0.6, -0.45);
    parts.push({ geo: post, color: BLUE });
  }
  // скат
  const L = 2.45;
  const chute = new THREE.BoxGeometry(0.62, 0.07, L);
  chute.rotateX(-Math.atan2(H - 0.15, L * 0.92));
  chute.translate(0, H / 2 + 0.12, 0.5 + L * 0.46);
  parts.push({ geo: chute, color: YELL });
  for (const sx of [-0.33, 0.33]) {
    const rail = new THREE.BoxGeometry(0.07, 0.20, L);
    rail.rotateX(-Math.atan2(H - 0.15, L * 0.92));
    rail.translate(sx, H / 2 + 0.22, 0.5 + L * 0.46);
    parts.push({ geo: rail, color: YELL });
  }
  // лесенка сзади
  for (let i = 0; i < 4; i++) {
    const st = new THREE.BoxGeometry(0.62, 0.06, 0.16);
    st.translate(0, 0.34 + i * 0.42, -0.55 - i * 0.13);
    parts.push({ geo: st, color: STEEL });
  }
  return merge(parts);
}

// ---- песочница с бортом и грибком
function sandboxGeo() {
  const parts = [];
  const R = 1.5;
  const sand = new THREE.BoxGeometry(R * 2, 0.10, R * 2);
  sand.translate(0, 0.16, 0);
  parts.push({ geo: sand, color: SAND });
  for (const [dx, dz, w, d] of [[0, -R, R * 2 + 0.3, 0.3], [0, R, R * 2 + 0.3, 0.3],
                                [-R, 0, 0.3, R * 2], [R, 0, 0.3, R * 2]]) {
    const b = new THREE.BoxGeometry(w, 0.30, d);
    b.translate(dx, 0.15, dz);
    parts.push({ geo: b, color: GREEN });
  }
  return merge(parts);
}

// ---- карусель
function carouselGeo() {
  const parts = [];
  const disc = new THREE.CylinderGeometry(1.25, 1.25, 0.10, 12);
  disc.translate(0, 0.34, 0);
  parts.push({ geo: disc, color: BLUE });
  const post = new THREE.CylinderGeometry(0.09, 0.11, 0.9, 8);
  post.translate(0, 0.45, 0);
  parts.push({ geo: post, color: STEEL });
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2;
    const arm = new THREE.CylinderGeometry(0.035, 0.035, 1.2, 5);
    arm.rotateZ(Math.PI / 2); arm.rotateY(-a);
    arm.translate(Math.cos(a) * 0.6, 0.86, Math.sin(a) * 0.6);
    parts.push({ geo: arm, color: YELL });
  }
  const ring = new THREE.TorusGeometry(1.15, 0.04, 5, 14);
  ring.rotateX(Math.PI / 2); ring.translate(0, 0.86, 0);
  parts.push({ geo: ring, color: YELL });
  return merge(parts);
}

// ---- машина: тот же лофт-кузов, что у игрока, только упрощённый.
// Коробкой припаркованные машины выглядели хуже всего на парковке.
function carGeo(paint) {
  const parts = [];
  const DARKC = [0.09, 0.10, 0.11];
  const S = [
    [ 2.30, 0.60, 0.78, 0.42, 0.84],
    [ 2.10, 0.72, 0.88, 0.30, 0.92],
    [ 1.45, 0.84, 0.93, 0.24, 1.00],
    [ 0.20, 0.86, 0.94, 0.23, 1.03],
    [-1.20, 0.85, 0.93, 0.24, 1.02],
    [-2.05, 0.72, 0.86, 0.31, 0.96],
    [-2.28, 0.58, 0.76, 0.43, 0.88],
  ];
  const P = [], I = [];
  const rings = S.map(([z, wl, ws, y0, y1]) => {
    const ym = y0 + (y1 - y0) * 0.62;
    return [[0, y0, z], [-wl, y0 + 0.05, z], [-ws, ym, z], [-ws * 0.93, y1, z],
            [0, y1 + 0.02, z], [ws * 0.93, y1, z], [ws, ym, z], [wl, y0 + 0.05, z]];
  });
  for (const r of rings) for (const v of r) P.push(v[0], v[1], v[2]);
  for (let i = 0; i < rings.length - 1; i++) {
    const a = i * 8, b = (i + 1) * 8;
    for (let k = 0; k < 8; k++) {
      const k2 = (k + 1) % 8;
      I.push(a + k, b + k, a + k2, a + k2, b + k, b + k2);
    }
  }
  const cap = (idx, flip) => {
    const o = idx * 8;
    for (let k = 1; k < 7; k++) { if (flip) I.push(o, o + k + 1, o + k); else I.push(o, o + k, o + k + 1); }
  };
  cap(0, false); cap(rings.length - 1, true);
  // знаковый объём: отрицательный — обход вывернут, кузов виден насквозь
  let vol = 0;
  for (let i = 0; i < I.length; i += 3) {
    const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3;
    vol += (P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1])
          - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c])
          + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c])) / 6;
  }
  if (vol < 0) for (let i = 0; i < I.length; i += 3) { const t = I[i + 1]; I[i + 1] = I[i + 2]; I[i + 2] = t; }
  const bodyGeo = new THREE.BufferGeometry();
  bodyGeo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  bodyGeo.setIndex(I);
  bodyGeo.computeVertexNormals();
  parts.push({ geo: bodyGeo, color: paint });

  // теплица
  const C = [[1.00, 0.58, 1.04], [0.45, 0.74, 1.34], [-0.75, 0.78, 1.40], [-1.65, 0.60, 1.10]];
  const CP = [], CI = [];
  for (const [z, w, y] of C) CP.push(-w, 1.00, z, -w * 0.97, y, z, w * 0.97, y, z, w, 1.00, z);
  for (let i = 0; i < C.length - 1; i++) {
    const a = i * 4, b = (i + 1) * 4;
    for (let k = 0; k < 3; k++) CI.push(a + k, b + k, a + k + 1, a + k + 1, b + k, b + k + 1);
  }
  for (let i = CI.length - 3; i >= 0; i -= 3) CI.push(CI[i], CI[i + 2], CI[i + 1]);
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.Float32BufferAttribute(CP, 3));
  cg.setIndex(CI); cg.computeVertexNormals();
  parts.push({ geo: cg, color: [0.15, 0.19, 0.23] });
  const roof = new THREE.BoxGeometry(1.40, 0.06, 1.25);
  roof.translate(0, 1.41, -0.20);
  parts.push({ geo: roof, color: paint });

  const wheel = new THREE.CylinderGeometry(0.33, 0.33, 0.25, 10);
  wheel.rotateZ(Math.PI / 2);
  for (const [x, z] of [[0.80, 1.38], [-0.80, 1.38], [0.80, -1.36], [-0.80, -1.36]]) {
    const w = wheel.clone(); w.translate(x, 0.33, z);
    parts.push({ geo: w, color: DARKC });
  }
  const gr = new THREE.BoxGeometry(1.05, 0.28, 0.08);
  gr.translate(0, 0.62, 2.28); parts.push({ geo: gr, color: DARKC });
  for (const sx of [-1, 1]) {
    const hl = new THREE.BoxGeometry(0.38, 0.13, 0.08);
    hl.translate(sx * 0.52, 0.76, 2.24);
    parts.push({ geo: hl, color: [0.82, 0.86, 0.90] });
    const tl = new THREE.BoxGeometry(0.42, 0.12, 0.08);
    tl.translate(sx * 0.50, 0.82, -2.24);
    parts.push({ geo: tl, color: [0.55, 0.10, 0.09] });
  }
  return merge(parts);
}

const PAINTS = [
  [0.72, 0.72, 0.74], [0.13, 0.14, 0.16], [0.58, 0.09, 0.09], [0.11, 0.24, 0.46],
  [0.36, 0.38, 0.40], [0.82, 0.82, 0.80], [0.16, 0.36, 0.24], [0.60, 0.45, 0.14],
];

// habr: точка внутри многоугольника
function inPoly(px, pz, p) {
  let c = false;
  for (let i = 0, j = p.length / 2 - 1; i < p.length / 2; j = i++) {
    const xi = p[i * 2], zi = p[i * 2 + 1], xj = p[j * 2], zj = p[j * 2 + 1];
    if ((zi > pz) !== (zj > pz) && px < (xj - xi) * (pz - zi) / (zj - zi) + xi) c = !c;
  }
  return c;
}

// главная ось площадки — та же, что у разметки: вдоль самой длинной стороны
function frame(poly) {
  const n = poly.length / 2;
  let best = null;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = poly[j * 2] - poly[i * 2], dz = poly[j * 2 + 1] - poly[i * 2 + 1];
    const l = Math.hypot(dx, dz);
    if (l < 1e-6) continue;
    const ux = dx / l, uz = dz / l;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let k = 0; k < n; k++) {
      const x = poly[k * 2], z = poly[k * 2 + 1];
      const u = x * ux + z * uz, v = -x * uz + z * ux;
      if (u < u0) u0 = u; if (u > u1) u1 = u;
      if (v < v0) v0 = v; if (v > v1) v1 = v;
    }
    const a = (u1 - u0) * (v1 - v0);
    if (!best || a < best.a) best = { a, ux, uz, u0, u1, v0, v1 };
  }
  if (!best) return null;
  const { ux, uz, u0, v0 } = best;
  return {
    ux, uz, W: best.u1 - u0, L: best.v1 - v0,
    at: (u, v) => [u0 * ux - v0 * uz + u * ux - v * uz, u0 * uz + v0 * ux + u * uz + v * ux],
  };
}

export function buildYards(world, terrain) {
  const group = new THREE.Group();
  group.name = 'yards';
  // Парковку из OSM обводят щедро: местами она заходит на проезжую часть и
  // на дома. Машины и качели туда не ставим.
  const COV = world.__coverage;
  const onAsphalt = COV ? (x, z) => COV.onRoad(x, z) : () => false;
  // Машины и качели должны стоять НА полотне площадки, а не по рельефу:
  // полотно лежит на 13–38 см выше земли, и машины тонули под парковкой.
  const AL = world.__areaLift || (() => 0);
  const H = (x, z) => terrain.gridHeightAt(x, z) + AL(x, z);
  const rand = rng(90210);
  const mat = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.08 });
  const stats = { качелей: 0, горок: 0, песочниц: 0, каруселей: 0, машин: 0 };

  const place = (geo, list, kind) => {
    if (!list.length) return;
    const m = new THREE.InstancedMesh(geo, mat(), list.length);
    m.castShadow = true; m.receiveShadow = true;
    const mx = new THREE.Matrix4(), q = new THREE.Quaternion(),
          up = new THREE.Vector3(0, 1, 0), pv = new THREE.Vector3(), sv = new THREE.Vector3(1, 1, 1);
    list.forEach((p, i) => {
      pv.set(p.x, H(p.x, p.z) + 0.02, p.z);
      q.setFromAxisAngle(up, p.a);
      m.setMatrixAt(i, mx.compose(pv, q, sv));
    });
    m.instanceMatrix.needsUpdate = true;
    group.add(m);
    stats[kind] = list.length;
  };

  const swings = [], slides = [], boxes = [], rides = [];
  const carsBy = PAINTS.map(() => []);

  for (const a of world.areas || []) {
    const f = frame(a.poly);
    if (!f) continue;
    const ang = Math.atan2(f.ux, f.uz);

    if (a.k === 'playground') {
      // Ставим по сетке в габаритной рамке и проверяем, что точка ВНУТРИ
      // контура: площадки в OSM бывают буквой Г.
      const spots = [];
      const stepU = Math.max(3.5, f.W / 3), stepV = Math.max(3.5, f.L / 3);
      for (let u = stepU * 0.5; u < f.W; u += stepU)
        for (let v = stepV * 0.5; v < f.L; v += stepV) {
          const [x, z] = f.at(u, v);
          if (inPoly(x, z, a.poly) && !onAsphalt(x, z)) spots.push({ x, z, a: ang + (rand() - 0.5) * 0.5 });
        }
      spots.forEach((s, i) => {
        const k = i % 4;
        if (k === 0) swings.push(s); else if (k === 1) slides.push(s);
        else if (k === 2) boxes.push(s); else rides.push(s);
      });
      continue;
    }

    if (a.k === 'parking') {
      // Ряды те же, что рисует шейдер: полоса 5.3 м, проезд 6 м, место 2.5 м.
      // Занимаем примерно каждое третье место — пустая парковка выглядит мёртво.
      // Ряды: шейдер кладёт места в полосах v 0..5.3 и 10.6..15.9 при периоде
      // 16.6. Центры этих полос — 2.65 и 13.25. Я брал v + 7.95, и весь второй
      // ряд (461 машина) вставал на кромку и наполовину торчал в проезд.
      for (let v = 2.65; v < f.L; v += 16.6) {
        for (const vv of [v, v + 10.6]) {
          if (vv > f.L - 1.5) continue;
          // Штрих между местами шейдер рисует при fract(u/2.5) == 0.5, то есть
          // на u = 1.25 + 2.5k. Я ставил машины ровно туда же — 1102 из 1172
          // стояли центром НА разделительной линии, занимая по половине двух
          // соседних мест. Центр места — на 2.5k.
          for (let u = 2.5; u < f.W; u += 2.5) {
            if (rand() > 0.42) continue;
            const [x, z] = f.at(u, vv);
            // Треугольник полотна выбрасывается, если ХОТЬ ОДНА из семи проб
            // попала на дорогу, а машина проверяла только свой центр — и 158
            // машин зависали на 32 см над голой землёй в дырах полотна.
            // Проверяем те же семь точек вокруг машины.
            if (!inPoly(x, z, a.poly)) continue;
            let hole = false;
            for (const [ox2, oz2] of [[0, 0], [-1.2, 0], [1.2, 0], [0, -2.4], [0, 2.4], [-1.2, -2.4], [1.2, 2.4]]) {
              const qx = x + f.ux * ox2 - f.uz * oz2, qz = z + f.uz * ox2 + f.ux * oz2;
              if (onAsphalt(qx, qz) || !inPoly(qx, qz, a.poly)) { hole = true; break; }
            }
            if (hole) continue;
            const c = (Math.floor(u * 7 + vv * 3) >>> 0) % PAINTS.length;
            // Машина стоит НОСОМ вдоль места, то есть поперёк ряда: длина
            // места 5.3 м идёт по оси v, а ширина 2.5 м по u. Раньше кузов
            // разворачивался вдоль u и машины лежали поперёк разметки.
            carsBy[c].push({ x, z, a: ang + Math.PI / 2 + (vv > v ? Math.PI : 0) });
          }
        }
      }
    }
  }

  place(swingGeo(), swings, 'качелей');
  place(slideGeo(), slides, 'горок');
  place(sandboxGeo(), boxes, 'песочниц');
  place(carouselGeo(), rides, 'каруселей');
  let cars = 0;
  carsBy.forEach((list, i) => {
    if (!list.length) return;
    cars += list.length;
    const m = new THREE.InstancedMesh(carGeo(PAINTS[i]), mat(), list.length);
    m.castShadow = true;
    const mx = new THREE.Matrix4(), q = new THREE.Quaternion(),
          up = new THREE.Vector3(0, 1, 0), pv = new THREE.Vector3(), sv = new THREE.Vector3(1, 1, 1);
    list.forEach((p, k) => {
      pv.set(p.x, H(p.x, p.z) + 0.02, p.z);
      q.setFromAxisAngle(up, p.a);
      m.setMatrixAt(k, mx.compose(pv, q, sv));
    });
    m.instanceMatrix.needsUpdate = true;
    group.add(m);
  });
  stats['машин'] = cars;
  group.userData.stats = stats;
  return group;
}

// ---------------------------------------------------------------- сооружения
// Мост-путепровод, платформы с навесами, составы, трибуна, часовня и фонтаны.
// Все размеры сняты агентами по панорамам и спутнику (data/places.json).
const CONCRETE = [0.686, 0.671, 0.635];
const CONCRETE_D = [0.541, 0.529, 0.498];
const RAIL_STEEL = [0.48, 0.48, 0.50];
const WATER_C = [0.216, 0.416, 0.478];

const hexTo = h => {
  const v = parseInt(String(h || '#999999').slice(1), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
};

export function buildStructures(world, terrain) {
  const group = new THREE.Group();
  group.name = 'structures';
  // контуры домов: сооружения не должны въезжать в жилые дома
  let BUILD = null;
  try { BUILD = new PolyGrid(world.buildings.map(b => ({ poly: b.poly, holes: b.holes })), 80); } catch { BUILD = null; }
  const AL2 = world.__areaLift || (() => 0);
  const H = (x, z) => terrain.gridHeightAt(x, z) + AL2(x, z);
  const parts = [];
  const stats = {};
  const bump = k => { stats[k] = (stats[k] || 0) + 1; };

  const P = world.places || {};

  // ---- мосты: опоры, балки и перила под ПОДНЯТЫМ полотном
  // Полотно поднимает worldgen (по цепочке участков с тегом bridge), а сюда
  // приходит готовая линия: x, z, отметка полотна и отметка земли под ним.
  // Опоры ставим там, где просвет больше метра, — на насыпи они не нужны.
  for (const d of world.__bridges || []) {
    const p = d.pts, m = p.length / 4;
    if (m < 2) continue;
    const w = d.w;
    let any = false;
    for (let i = 0; i < m - 1; i++) {
      const ax = p[i * 4], az = p[i * 4 + 1], ay = p[i * 4 + 2], ag = p[i * 4 + 3];
      const bx = p[i * 4 + 4], bz = p[i * 4 + 5], by = p[i * 4 + 6], bg = p[i * 4 + 7];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 0.5) continue;
      const ux = (bx - ax) / L, uz = (bz - az) / L;
      const ang = Math.atan2(ux, uz);
      const mx = (ax + bx) / 2, mz = (az + bz) / 2, my = (ay + by) / 2, mg = (ag + bg) / 2;
      const clear = my - mg;
      // Плита, бортики и перила строились ГОРИЗОНТАЛЬНЫМИ коробками на средней
      // отметке участка: на подъёме плита вылезала поверх асфальта клиньями,
      // на спуске уходила под него, и мост читался лоскутным одеялом. Наклон
      // считаем по самому полотну и поворачиваем всё вдоль него.
      const pitch = Math.atan2(by - ay, L);
      const Ls = Math.hypot(L, by - ay) + 0.6;      // длина по скату, с нахлёстом
      const tilt = (geo, dy) => {
        geo.rotateX(-pitch); geo.rotateY(ang);
        geo.translate(mx, my + dy, mz);
        return geo;
      };
      parts.push({ geo: tilt(new THREE.BoxGeometry(w + 0.7, 0.55, Ls), -0.12), color: CONCRETE });
      if (clear > 1.0) {
        any = true;
        // продольные балки
        for (const off of [-w * 0.3, 0, w * 0.3]) {
          const beam = new THREE.BoxGeometry(0.5, Math.min(1.1, clear * 0.5), Ls);
          beam.rotateX(-pitch); beam.rotateY(ang);
          beam.translate(mx + uz * off, my - 0.9, mz - ux * off);
          parts.push({ geo: beam, color: CONCRETE_D });
        }
        // перила по кромкам
        for (const sg of [-1, 1]) {
          const off = sg * (w / 2 + 0.2);
          const nPost = Math.max(2, Math.round(L / 2.2));
          for (let k = 0; k <= nPost; k++) {
            const t = k / nPost;
            const px = ax + (bx - ax) * t + uz * off, pz = az + (bz - az) * t - ux * off;
            const py = ay + (by - ay) * t;
            const post = new THREE.BoxGeometry(0.08, 1.05, 0.08);
            post.rotateY(ang); post.translate(px, py + 0.66, pz);
            parts.push({ geo: post, color: RAIL_STEEL });
          }
          for (const yy of [0.28, 1.05]) {
            const rail = new THREE.BoxGeometry(0.07, 0.08, Ls);
            rail.rotateX(-pitch); rail.rotateY(ang);
            rail.translate(mx + uz * off, my + 0.14 + yy, mz - ux * off);
            parts.push({ geo: rail, color: RAIL_STEEL });
          }
          const kerb = new THREE.BoxGeometry(0.35, 0.36, Ls);
          kerb.rotateX(-pitch); kerb.rotateY(ang);
          kerb.translate(mx + uz * (sg * (w / 2 - 0.1)), my + 0.32, mz - ux * (sg * (w / 2 - 0.1)));
          parts.push({ geo: kerb, color: CONCRETE_D });
        }
      }
      // опора: раз в четыре пролёта и только там, где высоко
      if (clear > 2.0 && (i % 2 === 1 || m <= 3)) {
        const hgt = clear - 1.5;
        const pier = new THREE.BoxGeometry(w * 0.55, hgt, 1.6);
        pier.rotateY(ang); pier.translate(mx, mg + hgt / 2, mz);
        parts.push({ geo: pier, color: CONCRETE });
        const cap = new THREE.BoxGeometry(w * 0.9, 0.7, 2.6);
        cap.rotateY(ang); cap.translate(mx, mg + hgt + 0.35, mz);
        parts.push({ geo: cap, color: CONCRETE_D });
      }
    }
    if (any) bump('мостов');
  }

  // ---- платформы с навесами
  for (const s of P.structures || []) {
    if (s.k !== 'platform') continue;
    const [x0, z0] = s.from, [x1, z1] = s.to;
    const L = Math.hypot(x1 - x0, z1 - z0) || 1;
    const ux = (x1 - x0) / L, uz = (z1 - z0) / L;
    const ang = Math.atan2(ux, uz);
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    // Платформа шла ОДНОЙ усреднённой отметкой на всю длину: на склоне один
    // её конец уходил под землю на 3.9 м, другой висел. Режем на звенья по
    // 8 м и каждое сажаем на свою землю.
    const SEGL = 8;
    const nSeg = Math.max(1, Math.round(L / SEGL));
    for (let k = 0; k < nSeg; k++) {
      const t0 = k / nSeg, t1 = (k + 1) / nSeg;
      const sx0 = x0 + (x1 - x0) * t0, sz0 = z0 + (z1 - z0) * t0;
      const sx1 = x0 + (x1 - x0) * t1, sz1 = z0 + (z1 - z0) * t1;
      const gy2 = (H(sx0, sz0) + H(sx1, sz1)) / 2;
      const seg = new THREE.BoxGeometry(s.w, s.h + 0.35, L / nSeg + 0.05);
      seg.rotateY(ang);
      seg.translate((sx0 + sx1) / 2, gy2 + (s.h + 0.35) / 2 - 0.35, (sz0 + sz1) / 2);
      parts.push({ geo: seg, color: CONCRETE });
    }
    const gy = (H(x0, z0) + H(x1, z1)) / 2;
    // жёлтая линия безопасности по кромкам
    for (const sg of [-1, 1]) {
      const off = sg * (s.w / 2 - 0.55);
      for (let k = 0; k < nSeg; k++) {
        const t0 = k / nSeg, t1 = (k + 1) / nSeg;
        const sx0 = x0 + (x1 - x0) * t0, sz0 = z0 + (z1 - z0) * t0;
        const sx1 = x0 + (x1 - x0) * t1, sz1 = z0 + (z1 - z0) * t1;
        const gy2 = (H(sx0, sz0) + H(sx1, sz1)) / 2;
        const line = new THREE.BoxGeometry(0.35, 0.03, L / nSeg);
        line.rotateY(ang);
        line.translate((sx0 + sx1) / 2 - uz * off, gy2 + s.h + 0.02, (sz0 + sz1) / 2 + ux * off);
        parts.push({ geo: line, color: [0.78, 0.62, 0.13] });
      }
    }
    if (s.canopy) {
      const ch = s.canopyH;
      const nCol = Math.max(2, Math.round(L / 9));
      for (let i = 0; i <= nCol; i++) {
        const t = i / nCol;
        const px = x0 + (x1 - x0) * t, pz = z0 + (z1 - z0) * t;
        const gyC = H(px, pz);
        const yTopCol = Math.max(H(x0, z0), H(x1, z1)) + s.h + ch;
        const hCol = Math.max(1.5, yTopCol - gyC - s.h);
        const c = new THREE.CylinderGeometry(0.14, 0.16, hCol, 10);
        c.translate(px, gyC + s.h + hCol / 2, pz);
        parts.push({ geo: c, color: [0.15, 0.31, 0.52] });
      }
      // Навес горизонтальный: по звеньям он шёл пилой со щелями на стыках.
      // Одна плита на всю платформу, на отметке самого высокого её конца.
      const roofW = s.w + 1.6;
      const yTopC = Math.max(H(x0, z0), H(x1, z1)) + s.h + ch;
      const roof = new THREE.BoxGeometry(roofW, 0.22, L);
      roof.rotateY(ang); roof.translate(mx, yTopC + 0.11, mz);
      parts.push({ geo: roof, color: [0.22, 0.27, 0.33] });
      for (const sg of [-1, 1]) {
        const off = sg * roofW / 2;
        const fas = new THREE.BoxGeometry(0.16, 0.40, L);
        fas.rotateY(ang);
        fas.translate(mx - uz * off, yTopC - 0.09, mz + ux * off);
        parts.push({ geo: fas, color: [0.15, 0.31, 0.52] });
      }

    }
    bump('платформ');
  }

  // ---- надземный пешеходный переход: настил на ногах, а не стена
  for (const s2 of P.structures || []) {
    if (s2.k !== 'overbridge') continue;
    const [x0, z0] = s2.from, [x1, z1] = s2.to;
    const L = Math.hypot(x1 - x0, z1 - z0) || 1;
    const ux = (x1 - x0) / L, uz = (z1 - z0) / L;
    const ang = Math.atan2(ux, uz);
    const y = Math.max(H(x0, z0), H(x1, z1)) + s2.deck;
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    const deck = new THREE.BoxGeometry(s2.w, 0.35, L);
    deck.rotateY(ang); deck.translate(mx, y, mz);
    parts.push({ geo: deck, color: CONCRETE });
    const nLeg = Math.max(2, Math.round(L / 12));
    for (let i = 0; i <= nLeg; i++) {
      const t = i / nLeg;
      const px = x0 + (x1 - x0) * t, pz = z0 + (z1 - z0) * t;
      const g0 = H(px, pz);
      const hgt = Math.max(1.0, y - 0.2 - g0);
      for (const sg of [-1, 1]) {
        const leg = new THREE.BoxGeometry(0.4, hgt, 0.4);
        leg.rotateY(ang);
        leg.translate(px - uz * sg * (s2.w / 2 - 0.3), g0 + hgt / 2, pz + ux * sg * (s2.w / 2 - 0.3));
        parts.push({ geo: leg, color: CONCRETE_D });
      }
    }
    for (const sg of [-1, 1]) {
      const off = sg * (s2.w / 2 + 0.05);
      const rail = new THREE.BoxGeometry(0.08, 1.15, L);
      rail.rotateY(ang);
      rail.translate(mx - uz * off, y + 0.75, mz + ux * off);
      parts.push({ geo: rail, color: RAIL_STEEL });
    }
    bump('переходов');
  }

  // ---- составы. Ось состава из отчёта — прикидка; сажаем его на НАСТОЯЩУЮ
  // линию пути из OSM (world.rails): ищем ближайший рельсовый отрезок к
  // середине состава и берём его направление. Иначе вагоны стоят наискось
  // к путям и торчат из платформы.
  const snapToRail = (mx, mz) => {
    let best = null, bd = 40;
    for (const r of world.rail || []) {
      const q = r.pts || r;
      for (let i = 0; i < q.length - 2; i += 2) {
        const ax = q[i], az = q[i + 1], bx2 = q[i + 2], bz2 = q[i + 3];
        const vx = bx2 - ax, vz = bz2 - az;
        const vv = vx * vx + vz * vz || 1;
        const tt = Math.max(0, Math.min(1, ((mx - ax) * vx + (mz - az) * vz) / vv));
        const px = ax + vx * tt, pz = az + vz * tt;
        const d = Math.hypot(mx - px, mz - pz);
        if (d < bd) { bd = d; best = { px, pz, ux: vx / Math.sqrt(vv), uz: vz / Math.sqrt(vv) }; }
      }
    }
    return best;
  };

  for (const t of P.trains || []) {
    let [x0, z0] = t.from; let [x1, z1] = t.to;
    {
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      const snap = snapToRail(mx, mz);
      if (snap) {
        const half = Math.hypot(x1 - x0, z1 - z0) / 2;
        x0 = snap.px - snap.ux * half; z0 = snap.pz - snap.uz * half;
        x1 = snap.px + snap.ux * half; z1 = snap.pz + snap.uz * half;
      }
    }
    const L = Math.hypot(x1 - x0, z1 - z0) || 1;
    const ux = (x1 - x0) / L, uz = (z1 - z0) / L;
    const ang = Math.atan2(ux, uz);
    const body = hexTo(t.body), roofC = hexTo(t.roof);
    const n = Math.max(1, t.cars | 0);
    const step = Math.min(t.len + 1.2, L / n);
    for (let i = 0; i < n; i++) {
      const c = (i + 0.5) * step;
      if (c > L) break;
      const px = x0 + ux * c, pz = z0 + uz * c;
      // Вагон стоит на СВОЕЙ земле. Раньше у всего состава была одна средняя
      // отметка на сто метров: тележки уходили под рельс на три метра, а
      // кузова резало навесом платформы.
      const gy = H(px, pz);
      const car = new THREE.BoxGeometry(t.w, t.h - 1.0, Math.min(t.len, step - 0.8));
      car.rotateY(ang); car.translate(px, gy + 1.05 + (t.h - 1.0) / 2, pz);
      parts.push({ geo: car, color: body });
      const rf = new THREE.BoxGeometry(t.w - 0.35, 0.35, Math.min(t.len, step - 0.8) - 0.5);
      rf.rotateY(ang); rf.translate(px, gy + 1.05 + (t.h - 1.0) + 0.16, pz);
      parts.push({ geo: rf, color: roofC });
      // полоса окон по борту и двери: без них вагон читался синим брусом
      const carL = Math.min(t.len, step - 0.8);
      const win = new THREE.BoxGeometry(t.w + 0.03, 0.95, carL - 2.4);
      win.rotateY(ang); win.translate(px, gy + 1.05 + (t.h - 1.0) * 0.68, pz);
      parts.push({ geo: win, color: [0.086, 0.106, 0.129] });
      for (const dt of [-0.28, 0.28]) {
        const dr = new THREE.BoxGeometry(t.w + 0.05, (t.h - 1.0) * 0.86, 1.25);
        dr.rotateY(ang);
        dr.translate(px + ux * carL * dt, gy + 1.05 + (t.h - 1.0) * 0.47, pz + uz * carL * dt);
        parts.push({ geo: dr, color: [0.129, 0.161, 0.192] });
      }
      // юбка между тележками
      const skirt = new THREE.BoxGeometry(t.w - 0.5, 0.55, carL - 1.0);
      skirt.rotateY(ang); skirt.translate(px, gy + 0.9, pz);
      parts.push({ geo: skirt, color: [0.11, 0.12, 0.13] });
      // тележки и белая полоса по низу борта
      for (const sg of [-1, 1]) {
        const bog = new THREE.BoxGeometry(t.w - 0.6, 0.5, 2.6);
        bog.rotateY(ang);
        bog.translate(px + ux * sg * (step * 0.28), gy + 0.62, pz + uz * sg * (step * 0.28));
        parts.push({ geo: bog, color: [0.13, 0.13, 0.14] });
      }
      const stripe = new THREE.BoxGeometry(t.w + 0.04, 0.22, Math.min(t.len, step - 0.8) - 0.2);
      stripe.rotateY(ang); stripe.translate(px, gy + 1.35, pz);
      parts.push({ geo: stripe, color: [0.86, 0.86, 0.84] });
    }
    bump('составов');
  }

  // ---- трибуна стадиона: наклонные ряды
  for (const s of P.structures || []) {
    if (s.k !== 'stands' || !s.poly) continue;
    const q = s.poly, n = q.length / 2;
    let cx = 0, cz = 0;
    for (let i = 0; i < n; i++) { cx += q[i * 2]; cz += q[i * 2 + 1]; }
    cx /= n; cz /= n;
    // длинная сторона прямоугольника трибуны
    let bx = 0, bz = 0, bl = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const dx = q[j * 2] - q[i * 2], dz = q[j * 2 + 1] - q[i * 2 + 1];
      const l = Math.hypot(dx, dz);
      if (l > bl) { bl = l; bx = dx / l; bz = dz / l; }
    }
    const ang = Math.atan2(bx, bz);
    // Трибуна строилась на ОДНОЙ отметке центра: на склоне вся полоса
    // повисала — с воздуха она читалась как кусок дороги, летящий над полем.
    // Режем на звенья по 10 м вдоль трибуны, каждое на своей земле, и
    // пропускаем звенья, попавшие внутрь дома: контур трибуны из отчёта
    // наложен на жилую пятиэтажку.
    const rows = 8, depth = 13.1;
    const nS = Math.max(1, Math.round(bl / 10));
    const segL = bl / nS;
    let drawnS = 0;
    for (let k = 0; k < nS; k++) {
      const t = (k + 0.5) / nS - 0.5;
      const sxc = cx + bx * bl * t, szc = cz + bz * bl * t;
      if (BUILD && BUILD.find(sxc, szc)) continue;      // тут стоит дом
      const g0 = H(sxc, szc);
      for (let i = 0; i < rows; i++) {
        const d = depth * (i / rows) - depth / 2;
        const step = new THREE.BoxGeometry(segL + 0.05, 0.45, depth / rows + 0.05);
        step.rotateY(ang);
        step.translate(sxc - bz * d, g0 + 0.3 + i * 0.42, szc + bx * d);
        parts.push({ geo: step, color: i % 2 ? CONCRETE : CONCRETE_D });
        const seat = new THREE.BoxGeometry(segL - 0.5, 0.10, 0.42);
        seat.rotateY(ang);
        seat.translate(sxc - bz * (d + 0.25), g0 + 0.55 + i * 0.42, szc + bx * (d + 0.25));
        parts.push({ geo: seat, color: [0.15, 0.33, 0.55] });
      }
      drawnS++;
    }
    if (drawnS) bump('трибун');
  }

  // ---- часовня на кладбище
  for (const s of P.structures || []) {
    if (s.k !== 'chapel') continue;
    const g0 = H(s.x, s.z);
    const body = new THREE.BoxGeometry(s.w, s.h, s.d);
    body.translate(s.x, g0 + s.h / 2, s.z);
    parts.push({ geo: body, color: [0.851, 0.827, 0.769] });
    const dome = new THREE.SphereGeometry(s.w * 0.42, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    dome.scale(1, 0.72, 1); dome.translate(s.x, g0 + s.h, s.z);
    parts.push({ geo: dome, color: [0.42, 0.44, 0.46] });
    const cr = new THREE.BoxGeometry(0.08, 1.1, 0.08);
    cr.translate(s.x, g0 + s.h + s.w * 0.30 + 0.55, s.z);
    parts.push({ geo: cr, color: [0.85, 0.70, 0.20] });
    const cb = new THREE.BoxGeometry(0.5, 0.08, 0.08);
    cb.translate(s.x, g0 + s.h + s.w * 0.30 + 0.75, s.z);
    parts.push({ geo: cb, color: [0.85, 0.70, 0.20] });
    bump('часовен');
  }

  // ---- фонтаны и лестницы парков
  for (const f of P.features || []) {
    if (f.k === 'fountain') {
      const R = Math.max(3, (f.r || f.d || 12) / (f.r ? 1 : 2));
      const g0 = H(f.x, f.z);
      const rim = new THREE.CylinderGeometry(R, R, 0.55, 24);
      rim.translate(f.x, g0 + 0.28, f.z);
      parts.push({ geo: rim, color: CONCRETE });
      const water = new THREE.CylinderGeometry(R - 0.45, R - 0.45, 0.5, 24);
      water.translate(f.x, g0 + 0.34, f.z);
      parts.push({ geo: water, color: WATER_C });
      const cup = new THREE.CylinderGeometry(R * 0.22, R * 0.30, 0.9, 12);
      cup.translate(f.x, g0 + 0.9, f.z);
      parts.push({ geo: cup, color: CONCRETE_D });
      const jet = new THREE.CylinderGeometry(0.06, 0.12, 2.4, 8);
      jet.translate(f.x, g0 + 2.3, f.z);
      parts.push({ geo: jet, color: [0.78, 0.86, 0.90] });
      bump('фонтанов');
    }
  }

  // ---- АЗС: навес на колоннах, колонки под ним, касса и стела с ценами
  // Точки из OSM (amenity=fuel). Навес разворачиваем вдоль ближайшей улицы,
  // чтобы заезд был с дороги, а не в бок.
  for (const f of world.fuel || []) {
    // Разворот и габарит берём из КОНТУРА OSM, если он есть: раньше навес
    // ставился «в пяти метрах от точки» под углом к ближайшей улице и вставал
    // вкривь, а на склоне повисал в воздухе. Площадку АЗС теперь ровняет
    // buildAreas, и H здесь уже возвращает её отметку.
    let ang = 0, CW = 14, CD = 9;
    let cx0 = f.x, cz0 = f.z;
    if (f.poly && f.poly.length >= 8) {
      const q = f.poly, n = q.length / 2;
      let best = null;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const dx = q[j * 2] - q[i * 2], dz = q[j * 2 + 1] - q[i * 2 + 1];
        const l = Math.hypot(dx, dz);
        if (l < 1e-6) continue;
        const px = dx / l, pz = dz / l;
        let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
        for (let k = 0; k < n; k++) {
          const u = q[k * 2] * px + q[k * 2 + 1] * pz, v = -q[k * 2] * pz + q[k * 2 + 1] * px;
          if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v;
        }
        const ar = (u1 - u0) * (v1 - v0);
        if (!best || ar < best.ar) best = { ar, px, pz, u0, u1, v0, v1 };
      }
      if (best) {
        ang = Math.atan2(best.px, best.pz);
        CW = Math.max(9, Math.min(26, (best.u1 - best.u0) * 0.72));
        CD = Math.max(7, Math.min(16, (best.v1 - best.v0) * 0.50));
        const cu = (best.u0 + best.u1) / 2, cv = best.v0 + (best.v1 - best.v0) * 0.36;
        cx0 = cu * best.px - cv * best.pz;
        cz0 = cu * best.pz + cv * best.px;
      }
    } else {
      // только точка: разворачиваем к ближайшей проезжей улице
      let bd = 1e9;
      for (const r of world.roads || []) {
        if (r.c > 2) continue;
        const q = r.pts;
        for (let i = 0; i < q.length - 2; i += 2) {
          const ax = q[i], az = q[i + 1], bx2 = q[i + 2], bz2 = q[i + 3];
          const vx = bx2 - ax, vz = bz2 - az;
          const t = Math.max(0, Math.min(1, ((f.x - ax) * vx + (f.z - az) * vz) / (vx * vx + vz * vz || 1)));
          const d = Math.hypot(f.x - ax - t * vx, f.z - az - t * vz);
          if (d < bd) { bd = d; ang = Math.atan2(vx, vz); }
        }
      }
    }
    const CH = 5.2;
    const ux = Math.sin(ang), uz = Math.cos(ang);
    const nx = -uz, nz = ux;
    // ВСЯ станция стоит на ОДНОЙ отметке — по центру площадки, иначе колонны
    // навеса режет склоном и он висит углом в воздухе
    const g0 = H(cx0, cz0);
    const canopy = new THREE.BoxGeometry(CW, 0.75, CD);
    canopy.rotateY(ang); canopy.translate(cx0, g0 + CH, cz0);
    parts.push({ geo: canopy, color: [0.90, 0.90, 0.88] });
    const band = new THREE.BoxGeometry(CW + 0.3, 0.45, CD + 0.3);
    band.rotateY(ang); band.translate(cx0, g0 + CH - 0.42, cz0);
    parts.push({ geo: band, color: [0.16, 0.36, 0.24] });   // зелёный подзор
    for (const su of [-1, 1]) for (const sv of [-1, 1]) {
      const px = cx0 + ux * su * (CW / 2 - 1.6) + nx * sv * (CD / 2 - 1.4);
      const pz = cz0 + uz * su * (CW / 2 - 1.6) + nz * sv * (CD / 2 - 1.4);
      const col = new THREE.BoxGeometry(0.55, CH, 0.55);
      col.rotateY(ang); col.translate(px, g0 + CH / 2, pz);
      parts.push({ geo: col, color: [0.86, 0.86, 0.84] });
    }
    // два островка с колонками
    for (const su of [-1, 1]) {
      const ix = cx0 + ux * su * 4.2, iz = cz0 + uz * su * 4.2;
      const isl = new THREE.BoxGeometry(2.4, 0.22, CD - 3.0);
      isl.rotateY(ang); isl.translate(ix, g0 + 0.11, iz);
      parts.push({ geo: isl, color: [0.62, 0.61, 0.58] });
      for (const sv of [-1, 1]) {
        const px = ix + nx * sv * 1.9, pz = iz + nz * sv * 1.9;
        const pump = new THREE.BoxGeometry(0.75, 1.75, 1.15);
        pump.rotateY(ang); pump.translate(px, g0 + 1.10, pz);
        parts.push({ geo: pump, color: [0.88, 0.88, 0.86] });
        const disp = new THREE.BoxGeometry(0.12, 0.55, 0.85);
        disp.rotateY(ang);
        disp.translate(px + ux * su * 0.42, g0 + 1.45, pz);
        parts.push({ geo: disp, color: [0.13, 0.14, 0.16] });
        const top = new THREE.BoxGeometry(0.80, 0.30, 1.20);
        top.rotateY(ang); top.translate(px, g0 + 2.10, pz);
        parts.push({ geo: top, color: [0.16, 0.36, 0.24] });
      }
    }
    // касса-магазин за навесом
    const sx = cx0 + nx * (CD / 2 + 4.5), sz = cz0 + nz * (CD / 2 + 4.5);   // касса на той же отметке
    const shop = new THREE.BoxGeometry(9.5, 3.6, 6.0);
    shop.rotateY(ang); shop.translate(sx, g0 + 1.8, sz);
    parts.push({ geo: shop, color: [0.90, 0.89, 0.85] });
    const par = new THREE.BoxGeometry(10.1, 0.55, 6.6);
    par.rotateY(ang); par.translate(sx, g0 + 3.75, sz);
    parts.push({ geo: par, color: [0.16, 0.36, 0.24] });
    const win = new THREE.BoxGeometry(7.8, 1.9, 0.12);
    win.rotateY(ang);
    win.translate(sx - nx * 3.06, g0 + 1.95, sz - nz * 3.06);
    parts.push({ geo: win, color: [0.18, 0.28, 0.32] });
    // стела с ценами у дороги
    const tx = f.x - nx * 6.5 + ux * (CW / 2 + 1.5), tz = f.z - nz * 6.5 + uz * (CW / 2 + 1.5);
    const pole = new THREE.BoxGeometry(0.45, 5.4, 0.45);
    pole.rotateY(ang); pole.translate(tx, g0 + 2.7, tz);
    parts.push({ geo: pole, color: [0.72, 0.72, 0.70] });
    const board = new THREE.BoxGeometry(2.5, 3.0, 0.30);
    board.rotateY(ang); board.translate(tx, g0 + 5.6, tz);
    parts.push({ geo: board, color: [0.16, 0.36, 0.24] });
    for (let i = 0; i < 3; i++) {
      const row = new THREE.BoxGeometry(2.0, 0.5, 0.36);
      row.rotateY(ang); row.translate(tx, g0 + 6.6 - i * 0.85, tz);
      parts.push({ geo: row, color: [0.92, 0.92, 0.88] });
    }
    bump('АЗС');
  }

  if (!parts.length) { group.userData.stats = stats; return group; }
  const mesh = new THREE.Mesh(merge(parts), new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.80, metalness: 0.08,
  }));
  mesh.castShadow = true; mesh.receiveShadow = true;
  group.add(mesh);
  group.userData.stats = stats;
  return group;
}
