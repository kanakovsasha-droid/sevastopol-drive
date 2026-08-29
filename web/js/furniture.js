import * as THREE from 'three';

// Настоящие объекты из OSM: остановки с их именами, скамейки, урны, светофоры,
// киоски, заборы и подпорные стены. Ничего не выдумано — координаты как в карте.

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

const STEEL = [0.29, 0.30, 0.31];
const DARK = [0.13, 0.14, 0.15];
const GLASSY = [0.42, 0.50, 0.54];

// павильон остановки: стойки, стенка, козырёк
function shelterGeo() {
  const parts = [];
  for (const x of [-1.85, -0.6, 0.6, 1.85]) {
    const p = new THREE.BoxGeometry(0.09, 2.45, 0.09); p.translate(x, 1.22, -1.05);
    parts.push({ geo: p, color: STEEL });
  }
  const back = new THREE.BoxGeometry(4.0, 1.95, 0.06); back.translate(0, 1.30, -1.12);
  parts.push({ geo: back, color: GLASSY });
  const roof = new THREE.BoxGeometry(4.3, 0.11, 1.55); roof.translate(0, 2.50, -0.55);
  parts.push({ geo: roof, color: STEEL });
  const seat = new THREE.BoxGeometry(3.4, 0.07, 0.42); seat.translate(0, 0.46, -0.88);
  parts.push({ geo: seat, color: [0.42, 0.30, 0.19] });
  return merge(parts);
}

function benchGeo() {
  const parts = [];
  const seat = new THREE.BoxGeometry(1.75, 0.07, 0.46); seat.translate(0, 0.44, 0);
  const back = new THREE.BoxGeometry(1.75, 0.34, 0.06); back.translate(0, 0.74, -0.21);
  parts.push({ geo: seat, color: [0.44, 0.31, 0.20] }, { geo: back, color: [0.44, 0.31, 0.20] });
  for (const x of [-0.72, 0.72]) {
    const l = new THREE.BoxGeometry(0.07, 0.44, 0.42); l.translate(x, 0.22, 0);
    parts.push({ geo: l, color: DARK });
  }
  return merge(parts);
}

function binGeo() {
  const b = new THREE.CylinderGeometry(0.24, 0.20, 0.72, 8); b.translate(0, 0.36, 0);
  const p = new THREE.CylinderGeometry(0.045, 0.045, 0.95, 5); p.translate(0, 0.47, -0.28);
  return merge([{ geo: b, color: [0.24, 0.28, 0.24] }, { geo: p, color: DARK }]);
}

function trafficGeo() {
  const parts = [];
  const pole = new THREE.CylinderGeometry(0.07, 0.09, 3.3, 6); pole.translate(0, 1.65, 0);
  const head = new THREE.BoxGeometry(0.30, 0.86, 0.24); head.translate(0, 3.55, 0);
  parts.push({ geo: pole, color: DARK }, { geo: head, color: [0.10, 0.11, 0.12] });
  const cols = [[0.62, 0.13, 0.10], [0.62, 0.52, 0.13], [0.16, 0.50, 0.22]];
  cols.forEach((c, i) => {
    const l = new THREE.CylinderGeometry(0.085, 0.085, 0.05, 8);
    l.rotateX(Math.PI / 2); l.translate(0, 3.83 - i * 0.28, 0.13);
    parts.push({ geo: l, color: c });
  });
  return merge(parts);
}

function kioskGeo() {
  const parts = [];
  const body = new THREE.BoxGeometry(2.3, 2.5, 1.9); body.translate(0, 1.25, 0);
  const roof = new THREE.BoxGeometry(2.55, 0.12, 2.15); roof.translate(0, 2.56, 0);
  const win = new THREE.BoxGeometry(1.7, 0.95, 0.05); win.translate(0, 1.65, 0.96);
  parts.push({ geo: body, color: [0.70, 0.67, 0.60] },
              { geo: roof, color: [0.36, 0.24, 0.20] },
              { geo: win, color: [0.16, 0.22, 0.25] });
  return merge(parts);
}

function poleGeo(h, r, color) {
  const p = new THREE.CylinderGeometry(r, r * 1.25, h, 6); p.translate(0, h / 2, 0);
  return merge([{ geo: p, color }]);
}

// ---------------------------------------------------------------- вывески
// Имена остановок пишем в один атлас и раздаём строки табличкам:
// 117 отдельных текстур — это 117 лишних вызовов отрисовки.
function nameAtlas(names) {
  const COLS = 2, ROWS = Math.ceil(names.length / COLS);
  const CW = 1024, CH = 48;
  const cv = document.createElement('canvas');
  cv.width = CW * COLS; cv.height = CH * ROWS;
  const g = cv.getContext('2d');
  g.fillStyle = '#12325e'; g.fillRect(0, 0, cv.width, cv.height);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  names.forEach((n, i) => {
    const cx = (i % COLS) * CW, cy = Math.floor(i / COLS) * CH;
    g.fillStyle = '#12325e'; g.fillRect(cx, cy, CW, CH);
    g.fillStyle = '#ffffff';
    let size = 30;
    do { g.font = `600 ${size}px -apple-system, "Helvetica Neue", Arial`; size -= 2; }
    while (g.measureText(n).width > CW - 36 && size > 12);
    g.fillText(n, cx + CW / 2, cy + CH / 2 + 1);
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { tex, COLS, ROWS };
}

export function buildFurniture(furniture, terrain, roadIndex, onRoad, clearZones = []) {
  const group = new THREE.Group();
  group.name = 'furniture';
  const rand = rng(31337);
  const H = (x, z) => terrain.driveHeightAt(x, z);
  const stats = {};

  const byKind = {};
  for (const p of furniture.points) (byKind[p.k] ||= []).push(p);

  const mat = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.1 });

  // ставим объект лицом к ближайшей дороге — иначе остановки смотрят в стену
  const facing = (x, z) => {
    const hit = roadIndex.nearest(x, z, 40);
    if (!hit) return rand() * 6.283;
    return Math.atan2(hit.x - x, hit.z - z);
  };

  // Светофор в OSM отмечен узлом на пересечении осевых, то есть ровно посреди
  // перекрёстка. В жизни он стоит у бордюра — отодвигаем его с проезжей части.
  const offRoad = (p) => {
    if (!onRoad || !onRoad(p.x, p.z)) return p;
    for (let r = 3; r <= 18; r += 1.5)
      for (let a = 0; a < 12; a++) {
        const t = a / 12 * Math.PI * 2;
        const x = p.x + Math.cos(t) * r, z = p.z + Math.sin(t) * r;
        if (!onRoad(x, z)) return { ...p, x, z };
      }
    return p;
  };

  const put = (kind, geo, list, orient, shift) => {
    if (!list?.length) return;
    const m = new THREE.InstancedMesh(geo, mat(), list.length);
    m.castShadow = true;
    const mx = new THREE.Matrix4(), q = new THREE.Quaternion(),
          up = new THREE.Vector3(0, 1, 0), pv = new THREE.Vector3(), sv = new THREE.Vector3(1, 1, 1);
    list.forEach((p0, i) => {
      const p = shift ? offRoad(p0) : p0;
      pv.set(p.x, H(p.x, p.z), p.z);
      q.setFromAxisAngle(up, orient ? facing(p.x, p.z) : rand() * 6.283);
      m.setMatrixAt(i, mx.compose(pv, q, sv));
    });
    m.instanceMatrix.needsUpdate = true;
    group.add(m);
    stats[kind] = list.length;
  };

  put('остановки', shelterGeo(), byKind.bus_stop, true, true);
  put('скамейки', benchGeo(), byKind.bench, true);
  put('урны', binGeo(), byKind.bin, false);
  put('светофоры', trafficGeo(), byKind.traffic_light, true, true);
  put('киоски', kioskGeo(), byKind.kiosk, true, true);
  put('павильоны', shelterGeo(), byKind.shelter, true);
  put('почта', binGeo(), byKind.postbox, false);
  put('флагштоки', poleGeo(8.5, 0.09, [0.78, 0.78, 0.76]), byKind.flagpole, false);
  put('фонари OSM', poleGeo(7.5, 0.10, STEEL), byKind.lamp, false, true);

  // ---------------- таблички с именами остановок ----------------
  const named = (byKind.bus_stop || []).filter(p => p.n);
  if (named.length) {
    const { tex, COLS, ROWS } = nameAtlas(named.map(p => p.n));
    const P = [], N = [], U = [], I = [];
    const W = 2.6, Hh = 0.42, Y = 2.85;
    named.forEach((p, i) => {
      const a = facing(p.x, p.z);
      const ux = Math.cos(a), uz = -Math.sin(a);       // вдоль таблички
      const y = H(p.x, p.z) + Y;
      const base = P.length / 3;
      const cu = (i % COLS) / COLS, cv = 1 - Math.floor(i / COLS) / ROWS;
      for (const [sx, sy] of [[-1, 0], [1, 0], [1, 1], [-1, 1]]) {
        P.push(p.x + ux * W / 2 * sx, y + Hh * sy, p.z + uz * W / 2 * sx);
        N.push(Math.sin(a), 0, Math.cos(a));
        U.push(cu + (sx > 0 ? 1 / COLS : 0), cv - (sy ? 0 : 1 / ROWS));
      }
      I.push(base, base + 1, base + 2, base, base + 2, base + 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.setIndex(I);
    const signs = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide,
    }));
    signs.name = 'stop-names';
    group.add(signs);
    stats['таблички'] = named.length;
  }

  // ---------------- заборы и подпорные стены ----------------
  const SPEC = {
    fence:          { h: 1.55, t: 0.06, c: [0.30, 0.33, 0.31] },
    wall:           { h: 2.05, t: 0.30, c: [0.71, 0.67, 0.59] },
    city_wall:      { h: 3.20, t: 0.55, c: [0.68, 0.64, 0.56] },
    retaining_wall: { h: 2.35, t: 0.45, c: [0.66, 0.62, 0.55] },
    hedge:          { h: 1.25, t: 0.55, c: [0.24, 0.35, 0.19] },
    handrail:       { h: 1.00, t: 0.05, c: [0.38, 0.40, 0.40] },
    guard_rail:     { h: 0.78, t: 0.08, c: [0.62, 0.62, 0.60] },
  };
  const BP = [], BN = [], BC = [], BI = [];
  let bn = 0;
  // Подпорные стены OSM идут и там, где мы поставили лестницу собора: забор
  // перерезал марш поперёк. Вокруг таких мест их не строим.
  const inClear = (x, z) => clearZones.some(c => (x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r);
  for (const b of furniture.barriers) {
    const sp = SPEC[b.k];
    if (!sp) continue;
    const p = b.pts;
    for (let i = 0; i < p.length / 2 - 1; i++) {
      const ax = p[i * 2], az = p[i * 2 + 1], bx = p[i * 2 + 2], bz = p[i * 2 + 3];
      const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
      if (L < 0.4 || L > 120) continue;
      // дробим длинные пролёты, иначе стена уезжает от земли посреди участка
      const steps = Math.max(1, Math.ceil(L / 5));
      for (let s = 0; s < steps; s++) {
        const t0 = s / steps, t1 = (s + 1) / steps;
        const x0 = ax + dx * t0, z0 = az + dz * t0, x1 = ax + dx * t1, z1 = az + dz * t1;
        if (inClear((x0 + x1) / 2, (z0 + z1) / 2)) continue;
        const nx = -dz / L * sp.t / 2, nz = dx / L * sp.t / 2;
        const g0 = terrain.gridHeightAt(x0, z0), g1 = terrain.gridHeightAt(x1, z1);
        const q = [
          [x0 + nx, g0, z0 + nz], [x1 + nx, g1, z1 + nz],
          [x1 - nx, g1, z1 - nz], [x0 - nx, g0, z0 - nz],
        ];
        const base = bn;
        for (const [vx, vy, vz] of q) { BP.push(vx, vy - 0.25, vz); BN.push(0, 1, 0); BC.push(...sp.c); bn++; }
        for (const [vx, vy, vz] of q) { BP.push(vx, vy + sp.h, vz); BN.push(0, 1, 0); BC.push(...sp.c); bn++; }
        for (let e = 0; e < 4; e++) {
          const a0 = base + e, a1 = base + (e + 1) % 4;
          BI.push(a0, a1, a1 + 4, a0, a1 + 4, a0 + 4);
        }
        BI.push(base + 4, base + 5, base + 6, base + 4, base + 6, base + 7);
      }
    }
  }
  if (BI.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(BP, 3));
    g.setAttribute('color', new THREE.Uint8BufferAttribute(BC.map(v => Math.round(255 * s2l(v))), 3, true));
    g.setIndex(BI);
    g.computeVertexNormals();
    const walls = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94 }));
    walls.castShadow = true; walls.receiveShadow = true; walls.name = 'barriers';
    group.add(walls);
    stats['заборы и стены'] = furniture.barriers.length;
  }

  group.userData.stats = stats;
  return group;
}
