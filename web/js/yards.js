import * as THREE from 'three';

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

// ---- машина: кузов, крыша, стёкла, колёса
function carGeo(paint) {
  const parts = [];
  const body = new THREE.BoxGeometry(1.78, 0.62, 4.15);
  body.translate(0, 0.72, 0);
  const skirt = new THREE.BoxGeometry(1.70, 0.26, 3.95);
  skirt.translate(0, 0.44, 0);
  const cabin = new THREE.BoxGeometry(1.58, 0.54, 2.05);
  cabin.translate(0, 1.28, -0.14);
  const roof = new THREE.BoxGeometry(1.46, 0.09, 1.80);
  roof.translate(0, 1.58, -0.16);
  parts.push({ geo: body, color: paint }, { geo: skirt, color: [0.11, 0.12, 0.13] },
              { geo: cabin, color: [0.17, 0.23, 0.27] }, { geo: roof, color: paint });
  const wheel = new THREE.CylinderGeometry(0.33, 0.33, 0.24, 10);
  wheel.rotateZ(Math.PI / 2);
  for (const [x, z] of [[0.82, 1.32], [-0.82, 1.32], [0.82, -1.28], [-0.82, -1.28]]) {
    const w = wheel.clone(); w.translate(x, 0.33, z);
    parts.push({ geo: w, color: [0.10, 0.10, 0.11] });
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
  const H = (x, z) => terrain.gridHeightAt(x, z);
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
      pv.set(p.x, H(p.x, p.z) + 0.20, p.z);
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
          if (inPoly(x, z, a.poly)) spots.push({ x, z, a: ang + (rand() - 0.5) * 0.5 });
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
      for (let v = 2.65; v < f.L; v += 16.6) {
        for (const vv of [v, v + 7.95]) {
          if (vv > f.L - 1.5) continue;
          for (let u = 1.25; u < f.W; u += 2.5) {
            if (rand() > 0.42) continue;
            const [x, z] = f.at(u, vv);
            if (!inPoly(x, z, a.poly)) continue;
            const c = (Math.floor(u * 7 + vv * 3) >>> 0) % PAINTS.length;
            carsBy[c].push({ x, z, a: ang + (vv > v ? Math.PI : 0) });
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
      pv.set(p.x, H(p.x, p.z) + 0.22, p.z);
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
  const H = (x, z) => terrain.gridHeightAt(x, z);
  const parts = [];
  const stats = {};
  const bump = k => { stats[k] = (stats[k] || 0) + 1; };

  const P = world.places || {};

  // ---- мост-путепровод: плита на опорах, тумбы и решётчатые перила
  for (const s of P.structures || []) {
    if (s.k !== 'bridge') continue;
    const [x0, z0] = s.from, [x1, z1] = s.to;
    const L = Math.hypot(x1 - x0, z1 - z0) || 1;
    const ux = (x1 - x0) / L, uz = (z1 - z0) / L;
    const ang = Math.atan2(ux, uz);
    const w = s.w, deck = s.deck;
    const col = hexTo(s.color);
    const gy = Math.min(H(x0, z0), H(x1, z1));
    const yDeck = gy + deck;
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    // плита пролётного строения с балками снизу
    const slab = new THREE.BoxGeometry(w, 0.55, L);
    slab.rotateY(ang); slab.translate(mx, yDeck, mz);
    parts.push({ geo: slab, color: col });
    for (let i = 0; i < 5; i++) {
      const off = (i / 4 - 0.5) * (w - 2.2);
      const beam = new THREE.BoxGeometry(0.55, 1.15, L);
      beam.rotateY(ang);
      beam.translate(mx - uz * off, yDeck - 0.85, mz + ux * off);
      parts.push({ geo: beam, color: CONCRETE_D });
    }
    // устои по краям и промежуточные опоры по числу пролётов
    const spans = Math.max(1, s.spans | 0);
    for (let i = 0; i <= spans; i++) {
      const t = i / spans;
      const px = x0 + (x1 - x0) * t, pz = z0 + (z1 - z0) * t;
      const g0 = H(px, pz);
      const hgt = Math.max(1.0, yDeck - 1.4 - g0);
      const isEnd = i === 0 || i === spans;
      const pw = isEnd ? w + 1.2 : w * 0.9;
      const pd = isEnd ? 3.0 : Math.max(1.2, s.pier);
      const pier = new THREE.BoxGeometry(pw, hgt, pd);
      pier.rotateY(ang);
      pier.translate(px, g0 + hgt / 2, pz);
      parts.push({ geo: pier, color: isEnd ? CONCRETE_D : CONCRETE });
      if (!isEnd) {                       // ригель поверх промежуточной опоры
        const cap = new THREE.BoxGeometry(w * 0.95, 0.8, pd + 1.4);
        cap.rotateY(ang);
        cap.translate(px, g0 + hgt + 0.4, pz);
        parts.push({ geo: cap, color: CONCRETE_D });
      }
    }
    // бортик и решётчатое ограждение по обеим кромкам
    for (const sg of [-1, 1]) {
      const off = sg * (w / 2 - 0.25);
      const kerb = new THREE.BoxGeometry(0.5, 0.42, L);
      kerb.rotateY(ang);
      kerb.translate(mx - uz * off, yDeck + 0.48, mz + ux * off);
      parts.push({ geo: kerb, color: CONCRETE_D });
      const nPost = Math.max(2, Math.round(L / 2.4));
      for (let i = 0; i <= nPost; i++) {
        const t = i / nPost;
        const px = x0 + (x1 - x0) * t - uz * off, pz = z0 + (z1 - z0) * t + ux * off;
        const post = new THREE.BoxGeometry(0.09, s.railH, 0.09);
        post.rotateY(ang); post.translate(px, yDeck + 0.69 + s.railH / 2, pz);
        parts.push({ geo: post, color: RAIL_STEEL });
      }
      for (const yy of [0.2, s.railH - 0.06]) {       // верхний и нижний пояс
        const rail = new THREE.BoxGeometry(0.07, 0.09, L);
        rail.rotateY(ang);
        rail.translate(mx - uz * off, yDeck + 0.69 + yy, mz + ux * off);
        parts.push({ geo: rail, color: RAIL_STEEL });
      }
      // редкая решётка между поясами
      const nBar = Math.max(2, Math.round(L / 0.9));
      for (let i = 0; i <= nBar; i++) {
        const t = i / nBar;
        const px = x0 + (x1 - x0) * t - uz * off, pz = z0 + (z1 - z0) * t + ux * off;
        const bar = new THREE.BoxGeometry(0.04, s.railH - 0.3, 0.04);
        bar.rotateY(ang); bar.translate(px, yDeck + 0.84 + (s.railH - 0.3) / 2, pz);
        parts.push({ geo: bar, color: RAIL_STEEL });
      }
    }
    // разделительный барьер посередине
    const barr = new THREE.BoxGeometry(0.35, 0.75, L);
    barr.rotateY(ang); barr.translate(mx, yDeck + 0.65, mz);
    parts.push({ geo: barr, color: RAIL_STEEL });
    bump('мостов');
  }

  // ---- платформы с навесами
  for (const s of P.structures || []) {
    if (s.k !== 'platform') continue;
    const [x0, z0] = s.from, [x1, z1] = s.to;
    const L = Math.hypot(x1 - x0, z1 - z0) || 1;
    const ux = (x1 - x0) / L, uz = (z1 - z0) / L;
    const ang = Math.atan2(ux, uz);
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    const gy = (H(x0, z0) + H(x1, z1)) / 2;
    const deck = new THREE.BoxGeometry(s.w, s.h, L);
    deck.rotateY(ang); deck.translate(mx, gy + s.h / 2, mz);
    parts.push({ geo: deck, color: CONCRETE });
    // жёлтая линия безопасности по кромкам
    for (const sg of [-1, 1]) {
      const off = sg * (s.w / 2 - 0.55);
      const line = new THREE.BoxGeometry(0.35, 0.03, L);
      line.rotateY(ang);
      line.translate(mx - uz * off, gy + s.h + 0.02, mz + ux * off);
      parts.push({ geo: line, color: [0.78, 0.62, 0.13] });
    }
    if (s.canopy) {
      const ch = s.canopyH;
      const nCol = Math.max(2, Math.round(L / 9));
      for (let i = 0; i <= nCol; i++) {
        const t = i / nCol;
        const px = x0 + (x1 - x0) * t, pz = z0 + (z1 - z0) * t;
        const c = new THREE.CylinderGeometry(0.14, 0.16, ch, 10);
        c.translate(px, gy + s.h + ch / 2, pz);
        parts.push({ geo: c, color: [0.15, 0.31, 0.52] });
      }
      const roofW = s.w + 1.6;
      const roof = new THREE.BoxGeometry(roofW, 0.22, L);
      roof.rotateY(ang); roof.translate(mx, gy + s.h + ch + 0.11, mz);
      parts.push({ geo: roof, color: [0.22, 0.27, 0.33] });
      for (const sg of [-1, 1]) {          // подзоры по кромке навеса
        const off = sg * roofW / 2;
        const fas = new THREE.BoxGeometry(0.16, 0.42, L);
        fas.rotateY(ang);
        fas.translate(mx - uz * off, gy + s.h + ch - 0.10, mz + ux * off);
        parts.push({ geo: fas, color: [0.15, 0.31, 0.52] });
      }
    }
    bump('платформ');
  }

  // ---- составы: вагоны коробками по оси пути
  for (const t of P.trains || []) {
    const [x0, z0] = t.from, [x1, z1] = t.to;
    const L = Math.hypot(x1 - x0, z1 - z0) || 1;
    const ux = (x1 - x0) / L, uz = (z1 - z0) / L;
    const ang = Math.atan2(ux, uz);
    const body = hexTo(t.body), roofC = hexTo(t.roof);
    const n = Math.max(1, t.cars | 0);
    const step = Math.min(t.len + 1.2, L / n);
    const gy = (H(x0, z0) + H(x1, z1)) / 2;
    for (let i = 0; i < n; i++) {
      const c = (i + 0.5) * step;
      if (c > L) break;
      const px = x0 + ux * c, pz = z0 + uz * c;
      const car = new THREE.BoxGeometry(t.w, t.h - 1.0, Math.min(t.len, step - 0.8));
      car.rotateY(ang); car.translate(px, gy + 1.05 + (t.h - 1.0) / 2, pz);
      parts.push({ geo: car, color: body });
      const rf = new THREE.BoxGeometry(t.w - 0.35, 0.35, Math.min(t.len, step - 0.8) - 0.5);
      rf.rotateY(ang); rf.translate(px, gy + 1.05 + (t.h - 1.0) + 0.16, pz);
      parts.push({ geo: rf, color: roofC });
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
    const g0 = H(cx, cz);
    const rows = 8, depth = 13.1;
    for (let i = 0; i < rows; i++) {
      const d = depth * (i / rows) - depth / 2;
      const step = new THREE.BoxGeometry(bl, 0.45, depth / rows + 0.05);
      step.rotateY(ang);
      step.translate(cx - bz * d, g0 + 0.3 + i * 0.42, cz + bx * d);
      parts.push({ geo: step, color: i % 2 ? CONCRETE : CONCRETE_D });
      const seat = new THREE.BoxGeometry(bl - 0.6, 0.10, 0.42);
      seat.rotateY(ang);
      seat.translate(cx - bz * (d + 0.25), g0 + 0.55 + i * 0.42, cz + bx * (d + 0.25));
      parts.push({ geo: seat, color: [0.15, 0.33, 0.55] });
    }
    bump('трибун');
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

  if (!parts.length) { group.userData.stats = stats; return group; }
  const mesh = new THREE.Mesh(merge(parts), new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.80, metalness: 0.08,
  }));
  mesh.castShadow = true; mesh.receiveShadow = true;
  group.add(mesh);
  group.userData.stats = stats;
  return group;
}
