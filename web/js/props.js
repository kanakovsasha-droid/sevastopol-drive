import * as THREE from 'three';
import { PolyGrid } from './worldgen.js';

// Уличное наполнение. По панорамам Севастополя видно, что улицу делают не дома,
// а то, что вдоль неё: платаны в тротуаре, сплошной ряд машин у бордюра,
// фонари. Без этого любой город остаётся набором коробок.

const s2l = v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
const rng = seed => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

function mergeParts(parts) {
  let nv = 0, ni = 0;
  for (const { geo } of parts) {
    nv += geo.attributes.position.count;
    ni += geo.index ? geo.index.count : geo.attributes.position.count;
  }
  const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), C = new Uint8Array(nv * 3);
  const I = new Uint32Array(ni);
  let vo = 0, io = 0;
  for (const { geo, color } of parts) {
    const pa = geo.attributes.position.array, na = geo.attributes.normal.array;
    P.set(pa, vo * 3); N.set(na, vo * 3);
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

// Платан: ствол и три перекрывающихся кома кроны — силуэт живее одного шара.
function broadleafGeo() {
  const trunk = new THREE.CylinderGeometry(0.16, 0.29, 4.6, 6); trunk.translate(0, 2.3, 0);
  const b1 = new THREE.IcosahedronGeometry(1.70, 0); b1.translate(0, 6.0, 0);
  const b2 = new THREE.IcosahedronGeometry(1.25, 0); b2.translate(1.05, 5.3, 0.40);
  const b3 = new THREE.IcosahedronGeometry(1.15, 0); b3.translate(-0.85, 5.6, -0.7);
  return mergeParts([
    { geo: trunk, color: [0.345, 0.286, 0.220] },
    { geo: b1, color: [0.255, 0.376, 0.196] },
    { geo: b2, color: [0.290, 0.408, 0.216] },
    { geo: b3, color: [0.224, 0.337, 0.176] },
  ]);
}

// Кипарис — крымская вертикаль, на бульварах и в парках их много.
function cypressGeo() {
  const trunk = new THREE.CylinderGeometry(0.13, 0.20, 1.2, 5); trunk.translate(0, 0.6, 0);
  const cone = new THREE.ConeGeometry(0.80, 5.4, 7, 3); cone.translate(0, 3.5, 0);
  return mergeParts([
    { geo: trunk, color: [0.318, 0.263, 0.204] },
    { geo: cone, color: [0.157, 0.271, 0.169] },
  ]);
}

function carGeo() {
  const parts = [];
  const body = new THREE.BoxGeometry(1.72, 0.56, 4.05); body.translate(0, 0.78, 0);
  const hood = new THREE.BoxGeometry(1.60, 0.22, 1.25); hood.translate(0, 1.14, 1.30);
  const cabin = new THREE.BoxGeometry(1.52, 0.50, 1.95); cabin.translate(0, 1.30, -0.25);
  const skirt = new THREE.BoxGeometry(1.62, 0.26, 3.85); skirt.translate(0, 0.46, 0);
  parts.push({ geo: skirt, color: [0.07, 0.07, 0.08] });
  parts.push({ geo: body, color: [1, 1, 1] });          // красится через instanceColor
  parts.push({ geo: hood, color: [1, 1, 1] });
  parts.push({ geo: cabin, color: [0.13, 0.17, 0.20] });
  const wheel = new THREE.CylinderGeometry(0.32, 0.32, 0.22, 10);
  wheel.rotateZ(Math.PI / 2);
  for (const [x, z] of [[0.80, 1.28], [-0.80, 1.28], [0.80, -1.26], [-0.80, -1.26]]) {
    const w = wheel.clone(); w.translate(x, 0.32, z);
    parts.push({ geo: w, color: [0.055, 0.055, 0.060] });
  }
  return mergeParts(parts);
}

function lampGeo() {
  const pole = new THREE.CylinderGeometry(0.09, 0.13, 8.2, 6); pole.translate(0, 4.1, 0);
  const arm = new THREE.BoxGeometry(0.10, 0.10, 1.5); arm.translate(0, 8.0, 0.7);
  const head = new THREE.BoxGeometry(0.34, 0.16, 0.72); head.translate(0, 7.9, 1.35);
  return mergeParts([
    { geo: pole, color: [0.318, 0.325, 0.325] },
    { geo: arm, color: [0.318, 0.325, 0.325] },
    { geo: head, color: [0.647, 0.639, 0.612] },
  ]);
}

function inst(geo, count, colored) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, flatShading: true });
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, count));
  m.castShadow = true;
  if (colored) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, count) * 3), 3);
  return m;
}

const CAR_PAINT = [
  [0.78, 0.78, 0.79], [0.16, 0.17, 0.19], [0.55, 0.56, 0.58], [0.86, 0.86, 0.85],
  [0.42, 0.13, 0.12], [0.13, 0.22, 0.38], [0.24, 0.30, 0.26], [0.68, 0.62, 0.50],
  [0.30, 0.31, 0.33], [0.72, 0.71, 0.68], [0.11, 0.30, 0.36], [0.60, 0.35, 0.14],
];

export function buildStreetProps(world, terrain, roadIndex) {
  const buildings = new PolyGrid(world.buildings, 90);

  // Тот же самый растр, что у дорог и аудита — строится один раз на мир.
  const COV = world.__coverage;
  const onRoad = (x, z) => COV.onRoad(x, z);
  const rand = rng(4242);
  const H = (x, z) => terrain.gridHeightAt(x, z);

  const trees = [], cyps = [], cars = [], lamps = [];
  const free = (x, z) => H(x, z) > 1.2 && !buildings.find(x, z);
  // Дерево или фонарь не должны встать на пересекающую улицу: осевые в OSM
  // пересекаются, и точка «в тротуаре» своей улицы легко оказывается на чужой проезжей части.
  // на проезжей части не место ни дереву, ни фонарю — чья бы улица ни была
  const onOtherRoad = (x, z) => onRoad(x, z);

  for (const r of world.roads) {
    if (r.c > 3 || r.w < 5 || r.br || r.tn) continue;
    const p = r.pts, hw = r.w / 2;
    // идём вдоль осевой равномерным шагом, а не по узлам OSM: они стоят как попало
    let carry = 0, dist = 0;
    for (let i = 0; i < p.length / 2 - 1; i++) {
      const ax = p[i * 2], az = p[i * 2 + 1];
      const dx = p[i * 2 + 2] - ax, dz = p[i * 2 + 3] - az;
      const len = Math.hypot(dx, dz);
      if (len < 0.2) continue;
      const ux = dx / len, uz = dz / len;
      const nx = -uz, nz = ux;
      for (let t = carry; t < len; t += 1.0) {
        const cx = ax + ux * t, cz = az + uz * t;
        const d = dist + t;
        for (const side of [1, -1]) {
          // дерево в тротуаре
          if (Math.abs(d % 11.5 - (side > 0 ? 0 : 5.7)) < 0.5) {
            const x = cx + nx * side * (hw + 1.8), z = cz + nz * side * (hw + 1.8);
            if (free(x, z) && !onOtherRoad(x, z) && rand() < 0.70) {
              // Кипарис — примета приморской части: на бульварах у бухты их ряды,
              // а в верхнем городе почти нет. Привязываем долю к высоте над морем.
              const h = H(x, z);
              const seaside = h < 24 ? 0.26 : h < 45 ? 0.10 : 0.03;
              const list = rand() < seaside ? cyps : trees;
              list.push(x, h - 0.25, z, 0.70 + rand() * 0.45, rand() * 6.283);
            }
          }
          // фонарь
          if (Math.abs(d % 31.0 - (side > 0 ? 8 : 23)) < 0.5) {
            const x = cx + nx * side * (hw + 0.85), z = cz + nz * side * (hw + 0.85);
            if (free(x, z) && !onOtherRoad(x, z))
              lamps.push(x, H(x, z), z, 1, Math.atan2(-nx * side, -nz * side));
          }

        }
      }
      carry = (carry + Math.ceil((len - carry) / 1.0) * 1.0) - len;
      if (carry < 0) carry = 0;
      dist += len;
    }
  }

  // деревья в парках и на склонах — там, где OSM отметил зелень
  for (const g of world.green) {
    const dens = { wood: 105, park: 130, scrub: 260, grass: 620 }[g.kind];
    if (!dens) continue;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity, a = 0;
    const q = g.poly;
    for (let i = 0; i < q.length; i += 2) {
      x0 = Math.min(x0, q[i]); x1 = Math.max(x1, q[i]);
      z0 = Math.min(z0, q[i + 1]); z1 = Math.max(z1, q[i + 1]);
    }
    for (let i = 0, n = q.length / 2; i < n; i++) {
      const j = (i + 1) % n;
      a += q[i * 2] * q[j * 2 + 1] - q[j * 2] * q[i * 2 + 1];
    }
    const want = Math.min(1400, Math.floor(Math.abs(a / 2) / dens));
    let placed = 0, tries = 0;
    while (placed < want && tries++ < want * 12) {
      const x = x0 + rand() * (x1 - x0), z = z0 + rand() * (z1 - z0);
      if (!pointIn(q, x, z) || H(x, z) < 1.4 || onRoad(x, z)) continue;
      const list = ((g.kind === 'park' || g.kind === 'grass') && rand() < 0.42) ? cyps : trees;
      list.push(x, H(x, z) - 0.25, z, 0.68 + rand() * 0.62, rand() * 6.283);
      placed++;
    }
  }

  const group = new THREE.Group();
  group.name = 'props';
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(),
        sv = new THREE.Vector3(), pv = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);

  // Один InstancedMesh на весь город никогда не отсекается по пирамиде видимости:
  // GPU обрабатывает все двадцать тысяч деревьев, даже если в кадре три.
  // Раскладываем по квадратам 400 м — рисуется только то, что рядом.
  const CHUNK = 400;
  const place = (geoFn, arr, stride, cast) => {
    const buckets = new Map();
    const n = arr.length / stride;
    for (let i = 0; i < n; i++) {
      const k = Math.floor(arr[i * stride] / CHUNK) + ',' + Math.floor(arr[i * stride + 2] / CHUNK);
      let b = buckets.get(k); if (!b) buckets.set(k, b = []);
      b.push(i);
    }
    if (!n) return 0;
    const geo = geoFn();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
    for (const idxs of buckets.values()) {
      const mesh = new THREE.InstancedMesh(geo, mat, idxs.length);
      mesh.castShadow = cast;
      idxs.forEach((i, k) => {
        const sc = arr[i * stride + 3];
        pv.set(arr[i * stride], arr[i * stride + 1], arr[i * stride + 2]);
        q4.setFromAxisAngle(up, arr[i * stride + 4]);
        sv.set(sc, sc * (0.9 + (i % 7) * 0.035), sc);
        mesh.setMatrixAt(k, m4.compose(pv, q4, sv));
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
    return n;
  };

  // тени от деревьев и фонарей стоят дороже, чем дают: удваивают проход теней
  const nT = place(broadleafGeo, trees, 5, false);
  const nC = place(cypressGeo, cyps, 5, false);
  const nL = place(lampGeo, lamps, 5, false);
  group.userData.counts = { деревья: nT, кипарисы: nC, фонари: nL, чанков: group.children.length };
  group.userData.onRoad = onRoad;   // тем же растром пользуется уличная мебель
  return group;
}

function pointIn(p, px, pz) {
  let inside = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], zi = p[i + 1], xj = p[j], zj = p[j + 1];
    if ((zi > pz) !== (zj > pz) && px < (xj - xi) * (pz - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
