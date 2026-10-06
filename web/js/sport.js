import * as THREE from 'three';

// Стадионы, поля, корты и спортплощадки. Данные — data/sport.json (его пишет
// tools/build-sport.mjs из чанков, высот и ручных правок data/sport-hand.json).
//
// Здесь три вещи:
//   * installFlats — рельеф под полем срезается и подсыпается до одной
//     отметки. Terrarium меряет ПОВЕРХНОСТЬ: деревья вокруг поля и сама
//     трибуна делают из стадиона холм с перепадом в шесть метров, и любое
//     полотно на нём либо горбится, либо висит плитой со стенкой по краю.
//   * resolveAreas — что рисовать на каждой площадке: класс (футбол, теннис,
//     баскетбол…), покрытие из OSM, дубли на выброс, внутренний контур
//     беговой дорожки; овал старого стадиона раскладывается на кольцо и поле.
//   * buildSport — ворота, кольца, сетки, ограды, трибуны и мачты.

let SPORT = { flats: [], areas: {}, stands: [], masts: [], skip: [] };
export const sportData = () => SPORT;

export async function loadSport(V = '') {
  try {
    const r = await fetch(`../data/sport.json${V ? '?v=' + V : ''}`);
    if (r.ok) SPORT = await r.json();
  } catch { /* без файла площадки рисуются как раньше, по рельефу */ }
  SPORT.areas ||= {}; SPORT.flats ||= []; SPORT.stands ||= []; SPORT.masts ||= []; SPORT.skip ||= [];
  return SPORT;
}

// ---------------------------------------------------------------- геометрия
export function inPoly(x, z, p) {
  let c = false;
  for (let i = 0, j = p.length / 2 - 1; i < p.length / 2; j = i++) {
    const xi = p[i * 2], zi = p[i * 2 + 1], xj = p[j * 2], zj = p[j * 2 + 1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
  }
  return c;
}
// расстояние до ближайшего ребра контура
export function edgeDist(x, z, p) {
  let best = Infinity;
  const n = p.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ax = p[j * 2], az = p[j * 2 + 1], vx = p[i * 2] - ax, vz = p[i * 2 + 1] - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz || 1)));
    const d = Math.hypot(x - ax - t * vx, z - az - t * vz);
    if (d < best) best = d;
  }
  return best;
}
const bboxOf = p => {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < p.length; i += 2) {
    if (p[i] < x0) x0 = p[i]; if (p[i] > x1) x1 = p[i];
    if (p[i + 1] < z0) z0 = p[i + 1]; if (p[i + 1] > z1) z1 = p[i + 1];
  }
  return [x0, z0, x1, z1];
};

// ---------------------------------------------------------------- ровные площадки
// Полностью ровно — сам контур и полоса M за ним (кромка клетки рельефа 9 м
// иначе задирала бы край поля); дальше на F метрах грунт плавно уходит к
// своей высоте — откос, как у настоящей подсыпки.
const FLAT_M = 2.5, FLAT_F = 10, FLAT_CELL = 128;
export function installFlats(terrain) {
  const flats = SPORT.flats || [];
  if (!flats.length || terrain.__flats) return 0;
  const grid = new Map();
  for (const f of flats) {
    const b = bboxOf(f.poly), r = FLAT_M + FLAT_F;
    f.bb = [b[0] - r, b[1] - r, b[2] + r, b[3] + r];
    for (let i = Math.floor(f.bb[0] / FLAT_CELL); i <= Math.floor(f.bb[2] / FLAT_CELL); i++)
      for (let j = Math.floor(f.bb[1] / FLAT_CELL); j <= Math.floor(f.bb[3] / FLAT_CELL); j++) {
        const k = i * 100003 + j;
        let a = grid.get(k); if (!a) grid.set(k, a = []);
        a.push(f);
      }
  }
  const raw = terrain.heightAt.bind(terrain);
  // Подменяем выборку у ЭТОГО экземпляра: на heightAt стоят и квадраты земли,
  // и профили дорог, и сбор far-слоя — все увидят одну и ту же площадку.
  terrain.heightAt = (x, z) => {
    const h = raw(x, z);
    const c = grid.get(Math.floor(x / FLAT_CELL) * 100003 + Math.floor(z / FLAT_CELL));
    if (!c) return h;
    let w = 0, target = h;
    for (const f of c) {
      const b = f.bb;
      if (x < b[0] || x > b[2] || z < b[1] || z > b[3]) continue;
      let k;
      if (inPoly(x, z, f.poly)) k = 1;
      else {
        const d = edgeDist(x, z, f.poly);
        if (d <= FLAT_M) k = 1;
        else if (d >= FLAT_M + FLAT_F) continue;
        else { const t = (d - FLAT_M) / FLAT_F; k = 1 - t * t * (3 - 2 * t); }
      }
      if (k > w) { w = k; target = f.h; }
      if (w >= 1) break;
    }
    return w > 0 ? h + (target - h) * w : h;
  };
  terrain.__flats = flats.length;
  return flats.length;
}

// Дом, который в OSM лежит на месте трибуны (и рисовался пятиэтажкой), —
// трибуна построит себя сама.
export const sportSkipIds = () => SPORT.skip || [];

// ---------------------------------------------------------------- площадки чанка
// Возвращает список того, что рисовать: дубли выброшены, овал старого
// стадиона заменён кольцом и полем. На каждой площадке — a.__s с классом.
export function resolveAreas(areas) {
  const M = SPORT.areas || {};
  const out = [];
  for (const a of areas || []) {
    const m = M[a.id];
    if (!m) { out.push(a); continue; }
    if (m.drop) continue;
    if (m.replace) {
      for (const r of m.replace) {
        r.__s = { as: r.as, surface: r.surface };
        out.push(r);
      }
      continue;
    }
    a.__s = m;
    out.push(a);
  }
  return out;
}

// ---------------------------------------------------------------- размеры полей
// Одна и та же разметка нужна шейдеру (линии) и сюда (ворота, кольца, сетки) —
// формулы держим одинаковыми с areaMaterial в materials.js.
export function fieldFrame(f) {
  // f — рамка площадки { ox, oz, ux, uz, W, L }; длинная ось — x поля
  const alongU = f.W >= f.L;
  const FL = Math.max(f.W, f.L), FW = Math.min(f.W, f.L);
  // единичные векторы длины и ширины поля в мире
  const lx = alongU ? f.ux : -f.uz, lz = alongU ? f.uz : f.ux;
  const wx = alongU ? -f.uz : f.ux, wz = alongU ? f.ux : f.uz;
  // мировая точка по координатам поля (x вдоль, y поперёк от угла рамки)
  const at = alongU
    ? (x, y) => [f.ox + x * f.ux - y * f.uz, f.oz + x * f.uz + y * f.ux]
    : (x, y) => [f.ox + y * f.ux - x * f.uz, f.oz + y * f.uz + x * f.ux];
  return { FL, FW, lx, lz, wx, wz, at };
}
export const footballMargin = FL => (FL >= 80 ? 1.5 : 0.8);

// ---------------------------------------------------------------- геометрия снаряжения
const s2l = v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
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
    const c0 = Math.round(255 * s2l(color[0])), c1 = Math.round(255 * s2l(color[1])), c2 = Math.round(255 * s2l(color[2]));
    for (let i = 0; i < n; i++) { C[(vo + i) * 3] = c0; C[(vo + i) * 3 + 1] = c1; C[(vo + i) * 3 + 2] = c2; }
    if (geo.index) for (let i = 0; i < geo.index.count; i++) I[io++] = geo.index.array[i] + vo;
    else for (let i = 0; i < n; i++) I[io++] = i + vo;
    vo += n;
    geo.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.BufferAttribute(C, 3, true));
  g.setIndex(new THREE.BufferAttribute(I, 1));
  return g;
}
const hex = h => { const v = parseInt(String(h || '#999999').slice(1), 16); return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]; };
const WHITE = [0.92, 0.92, 0.90], STEEL = [0.45, 0.47, 0.50], DARK = [0.16, 0.17, 0.18];
const CONC = [0.70, 0.69, 0.66], CONC_D = [0.56, 0.55, 0.52];
const box = (w, h, d, x, y, z, color, parts) => {
  const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); parts.push({ geo: g, color });
};

// Футбольные ворота 7.32 × 2.44, глубина 2 м. Ось ворот — +z (в поле),
// низ на нуле. Стойки, перекладина, рама сетки сзади.
function goalGeo() {
  const p = [];
  const W = 7.32, H = 2.44, D = 2.0, t = 0.12;
  box(t, H, t, -W / 2 - t / 2, H / 2, 0, WHITE, p);
  box(t, H, t, W / 2 + t / 2, H / 2, 0, WHITE, p);
  box(W + 2 * t, t, t, 0, H + t / 2, 0, WHITE, p);
  // рама сетки: верхние откосы, задняя планка, нижние трубы
  for (const sx of [-1, 1]) {
    const g = new THREE.BoxGeometry(0.04, 0.04, Math.hypot(D * 0.6, 0.6));
    g.rotateX(-Math.atan2(0.6, D * 0.6)); g.translate(sx * W / 2, H - 0.3, -D * 0.3);
    p.push({ geo: g, color: STEEL });
    box(0.04, 0.04, D, sx * W / 2, 0.02, -D / 2, STEEL, p);
    box(0.04, H - 0.6, 0.04, sx * W / 2, (H - 0.6) / 2, -D, STEEL, p);
  }
  box(W, 0.04, 0.04, 0, H - 0.6, -D * 0.6, STEEL, p);
  box(W, 0.04, 0.04, 0, 0.02, -D, STEEL, p);
  // сетка — полупрозрачной её не сделать в общем материале, ставим редкую
  // решётку из тонких нитей: издали читается сеткой, вблизи — сеткой и есть
  for (let k = 1; k < 10; k++) box(0.015, H - 0.6, 0.015, -W / 2 + W * k / 10, (H - 0.6) / 2, -D, [0.85, 0.85, 0.83], p);
  for (let k = 1; k < 4; k++) box(W, 0.015, 0.015, 0, (H - 0.6) * k / 4, -D, [0.85, 0.85, 0.83], p);
  return merge(p);
}
// Баскетбольная стойка: щит 1.8 × 1.05 над кольцом 3.05 м. Кольцо смотрит в +z,
// основание стойки — на 1.6 м позади щита (за лицевой линией).
function hoopGeo() {
  const p = [];
  box(0.16, 3.6, 0.16, 0, 1.8, -1.6, [0.20, 0.33, 0.55], p);
  const arm = new THREE.BoxGeometry(0.10, 0.10, 1.5); arm.translate(0, 3.35, -0.85); p.push({ geo: arm, color: [0.20, 0.33, 0.55] });
  box(1.8, 1.05, 0.05, 0, 3.4, -0.08, WHITE, p);
  box(0.59, 0.45, 0.055, 0, 3.27, -0.06, [0.75, 0.25, 0.15], p);
  box(0.53, 0.39, 0.06, 0, 3.27, -0.06, WHITE, p);
  const rim = new THREE.TorusGeometry(0.23, 0.018, 4, 14);
  rim.rotateX(Math.PI / 2); rim.translate(0, 3.05, 0.2);
  p.push({ geo: rim, color: [0.85, 0.35, 0.10] });
  return merge(p);
}
// Сиденье трибуны: чаша и спинка, ширина 0.45 м. Лицом в +z.
// Сидений на трибуне — тысячи, поэтому только видимые грани: верх и торец
// чаши, лицо и верх спинки — восемь треугольников вместо тридцати шести.
// Сзади их закрывает следующий ряд и задняя стенка.
function seatGeo() {
  const w = 0.22;
  const P = [], N = [], I = [];
  const quad = (a, b, c, d, n) => {
    const o = P.length / 3;
    for (const v of [a, b, c, d]) { P.push(...v); N.push(...n); }
    I.push(o, o + 1, o + 2, o, o + 2, o + 3);
  };
  quad([-w, 0.44, 0.21], [w, 0.44, 0.21], [w, 0.44, -0.17], [-w, 0.44, -0.17], [0, 1, 0]);      // чаша
  quad([-w, 0.36, 0.21], [w, 0.36, 0.21], [w, 0.44, 0.21], [-w, 0.44, 0.21], [0, 0, 1]);       // её торец
  quad([-w, 0.44, -0.15], [w, 0.44, -0.15], [w, 0.80, -0.19], [-w, 0.80, -0.19], [0, 0.1, 1]); // спинка
  quad([-w, 0.80, -0.19], [w, 0.80, -0.19], [w, 0.80, -0.23], [-w, 0.80, -0.23], [0, 1, 0]);  // её верх
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N.map((v, i) => v), 3));
  g.setIndex(I);
  g.computeVertexNormals();
  return merge([{ geo: g, color: [1, 1, 1] }]);
}

// Решётчатая мачта (как у бывшего стадиона «Чайка»): четыре пояса с
// раскосами, сужаются кверху, наверху рама с прожекторами, повёрнутая на
// поле; внизу бетонный фундамент. Сурик по стали.
function latticeMast(m, g0, out) {
  const H = m.h || 30, wB = 3.0, wT = 1.4;
  const yaw = Math.atan2((m.aim || [m.x + 1, m.z])[0] - m.x, (m.aim || [m.x, m.z + 1])[1] - m.z);
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  const W = (lx, y, lz) => [m.x + lx * cs + lz * sn, g0 + y, m.z - lx * sn + lz * cs];
  const STEELC = [0.40, 0.31, 0.26], STEELD = [0.30, 0.25, 0.22];
  const p = [];
  const bar = (A, B, r, col) => {
    const dx = B[0] - A[0], dy = B[1] - A[1], dz = B[2] - A[2];
    const L = Math.hypot(dx, dy, dz);
    if (L < 0.05) return;
    const g = new THREE.BoxGeometry(r, r, L);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(dx / L, dy / L, dz / L));
    g.applyQuaternion(q);
    g.translate((A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2);
    p.push({ geo: g, color: col });
  };
  const at = (cx, cz, y) => { const w = (wB + (wT - wB) * y / H) / 2; return W(cx * w, y, cz * w); };
  const C4 = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [cx, cz] of C4) bar(at(cx, cz, 0), at(cx, cz, H), 0.20, STEELC);
  const np = Math.round(H / 2.8);
  for (let k = 0; k < np; k++) {
    const ya = k * H / np, yb = (k + 1) * H / np;
    for (let e = 0; e < 4; e++) {
      const a = C4[e], b = C4[(e + 1) % 4];
      bar(at(a[0], a[1], yb), at(b[0], b[1], yb), 0.09, STEELD);
      const [u, v] = k % 2 ? [a, b] : [b, a];
      bar(at(u[0], u[1], ya), at(v[0], v[1], yb), 0.08, STEELD);
    }
  }
  // фундамент
  {
    const g = new THREE.BoxGeometry(wB + 1.2, 1.2, wB + 1.2);
    g.rotateY(yaw); g.translate(m.x, g0 + 0.1, m.z);
    p.push({ geo: g, color: [0.66, 0.65, 0.62] });
  }
  // рама с прожекторами: 3 × 6, лицом к полю (+z рамы — на «aim»)
  const RW = 4.6, top = H;
  for (let r = 0; r < 3; r++) {
    const yy = top + 0.6 + r * 1.1;
    const beam = new THREE.BoxGeometry(RW, 0.14, 0.24);
    beam.rotateY(yaw); const c = W(0, yy, 0.5); beam.translate(c[0], c[1], c[2]);
    p.push({ geo: beam, color: STEELD });
    for (let k = 0; k < 6; k++) {
      const lx = -RW / 2 + RW * (k + 0.5) / 6;
      const lamp = new THREE.BoxGeometry(0.62, 0.66, 0.36);
      lamp.rotateX(-0.35); lamp.rotateY(yaw);
      const q = W(lx, yy + 0.32, 0.75); lamp.translate(q[0], q[1], q[2]);
      p.push({ geo: lamp, color: [0.70, 0.70, 0.67] });
      const gl = new THREE.BoxGeometry(0.52, 0.54, 0.04);
      gl.rotateX(-0.35); gl.rotateY(yaw);
      const q2 = W(lx, yy + 0.37, 0.95); gl.translate(q2[0], q2[1], q2[2]);
      p.push({ geo: gl, color: [0.92, 0.93, 0.88] });
    }
  }
  for (const sx of [-1, 1]) bar(W(sx * RW / 2, top - 0.2, 0.5), W(sx * RW / 2, top + 3.4, 0.5), 0.16, STEELD);
  out.push({ geo: merge(p), color: [1, 1, 1], keep: true });
}

// Памятные здания, которые заменены здешними (мачты «Чайки» были поставлены
// по направлению с улицы, а не по обмеру — стояли посреди павильона).
export const landmarkHidden = name => (SPORT.hideLandmarks || []).includes(name);

// ---------------------------------------------------------------- сборка
const SPORT_MAT = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.15 });

// world.__areasDraw и a.__f / a.__lift кладёт buildAreas: рамка и подъём
// полотна те же, что у разметки.
export function buildSport(world, terrain) {
  const group = new THREE.Group();
  group.name = 'sport';
  const stats = { ворот: 0, колец: 0, сеток: 0, 'ограды, м': 0, трибун: 0, сидений: 0, мачт: 0 };
  const parts = [];            // всё неповторяющееся — одной сеткой
  const fenceP = [], fenceI = [];
  const goals = [], hoops = [], seats = [], posts = [];
  const COV = world.__coverage;
  const onRoad = COV ? (x, z) => COV.onRoad(x, z) : () => false;
  const G = (x, z) => terrain.gridHeightAt(x, z);
  // поле на ровной площадке рисуется на её отметке (fields.js) — снаряжение тоже
  const top = (a, x, z) => (a.__flatY ?? G(x, z)) + (a.__lift || 0.2);
  const B = world.meta && world.meta.bounds;
  // Чанк строит только то, что стоит в его квадрате (без запаса в 260 м),
  // иначе трибуну на шве построили бы оба соседа.
  const mine = (x, z) => !B || (x >= B.minX + 260 && x < B.maxX - 260 && z >= B.minZ + 260 && z < B.maxZ - 260);
  const blds = world.__buildGrid;

  // ограда по контуру: стойки и верхняя труба в общую сетку, полотно рабицы —
  // отдельной полупрозрачной сеткой
  let lev = null;
  const fence = (poly, h, inset = 0.25) => {
    const n = poly.length / 2;
    let closed = n;
    if (poly[0] === poly[(n - 1) * 2] && poly[1] === poly[(n - 1) * 2 + 1]) closed = n - 1;
    for (let i = 0; i < closed; i++) {
      const j = (i + 1) % closed;
      const ax = poly[i * 2], az = poly[i * 2 + 1], bx = poly[j * 2], bz = poly[j * 2 + 1];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 0.5) continue;
      const ux = (bx - ax) / L, uz = (bz - az) / L;
      const k = Math.max(1, Math.round(L / 3.0));
      for (let s = 0; s < k; s++) {
        const t0 = s / k, t1 = (s + 1) / k;
        const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0, x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
        const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
        // через проезжую часть и сквозь дом ограду не ведём
        if (onRoad(mx, mz) || (blds && blds.find(mx, mz))) continue;
        const g0 = lev ?? G(x0, z0), g1 = lev ?? G(x1, z1);
        const q = fenceP.length / 3;
        fenceP.push(x0, g0, z0, x1, g1, z1, x1, g1 + h, z1, x0, g0 + h, z0);
        fenceI.push(q, q + 1, q + 2, q, q + 2, q + 3);
        stats['ограды, м'] += L / k;
        // стойки — экземплярами: отдельной коробкой на каждые три метра
        // ограда весила больше, чем все поля квартала
        posts.push({ x: x0, z: z0, y: g0, h: h + 0.1 });
        void ux; void uz;
      }
    }
    void inset;
  };

  for (const a of world.__areasDraw || []) {
    const s = a.__s, f = a.__f;
    if (!s || !f) continue;
    lev = a.__flatY ?? null;        // ограда ровного поля — на его отметке
    const F = fieldFrame(f);
    const { FL, FW, lx, lz, wx, wz, at } = F;
    const ang = (dx, dz) => Math.atan2(dx, dz);
    const place = (list, x, y, dirx, dirz, sc = 1) => {
      const [px, pz] = at(x, y);
      list.push({ x: px, z: pz, y: top(a, px, pz), a: ang(dirx, dirz), s: sc });
    };
    if (s.as === 'football') {
      const m = footballMargin(FL);
      const sc = Math.max(0.42, Math.min(1, (FL - 2 * m) / 100));
      place(goals, m - 0.06, FW / 2, -lx, -lz, sc);            // ворота смотрят в поле
      place(goals, FL - m + 0.06, FW / 2, lx, lz, sc);
      // ворота разворачиваем лицом в поле: ось ворот +z → направление в поле
      goals[goals.length - 2].a = ang(lx, lz);
      goals[goals.length - 1].a = ang(-lx, -lz);
      stats.ворот += 2;
      if (FL < 70 && a.k !== 'track') { fence(a.poly, 4.0); }
    } else if (s.as === 'multi') {
      const sc = Math.max(0.4, Math.min(0.41, 3 / 7.32));
      goals.push(...[[0.5 - 0.05, lx, lz], [FL - 0.5 + 0.05, -lx, -lz]].map(([x, dx, dz]) => {
        const [px, pz] = at(x, FW / 2);
        return { x: px, z: pz, y: top(a, px, pz), a: ang(dx, dz), s: sc };
      }));
      stats.ворот += 2;
      if (/basket/.test(a.sp || '')) {
        for (const [x, dx, dz] of [[1.2, lx, lz], [FL - 1.2, -lx, -lz]]) {
          const [px, pz] = at(x, FW / 2);
          hoops.push({ x: px, z: pz, y: top(a, px, pz), a: ang(dx, dz), s: 1 });
        }
        stats.колец += 2;
      }
      fence(a.poly, 3.0);
    } else if (s.as === 'basketball') {
      // те же размеры, что у разметки в шейдере: площадка 28 × 15 по центру
      // контура, ужатая, если контур меньше; кольцо в 1.575 от лицевой
      const sc = Math.max(0.4, Math.min(1, (FL - 1) / 28, (FW - 1) / 15));
      const end = FL / 2 - 14 * sc;
      for (const [x, dx, dz] of [[end + 1.575 * sc - 0.2, lx, lz], [FL - end - 1.575 * sc + 0.2, -lx, -lz]]) {
        const [px, pz] = at(x, FW / 2);
        hoops.push({ x: px, z: pz, y: top(a, px, pz), a: ang(dx, dz), s: 1 });
      }
      stats.колец += 2;
      fence(a.poly, 3.0);
    } else if (s.as === 'tennis' || s.as === 'volleyball' || s.as === 'beach') {
      // сетка поперёк середины, стойки за боковыми линиями
      const tennis = s.as === 'tennis';
      const half = tennis ? Math.min(FW / 2 - 0.3, 6.4) : Math.min(FW / 2 - 0.3, 5.5);
      const hNet = tennis ? 0.914 : 2.43, band = tennis ? 0.9 : 1.0;
      const [cx, cz] = at(FL / 2, FW / 2);
      const y0 = top(a, cx, cz);
      const netA = ang(wx, wz);
      for (const sg of [-1, 1]) {
        const px = cx + wx * sg * half, pz = cz + wz * sg * half;
        box(0.08, hNet + 0.15, 0.08, px, y0 + (hNet + 0.15) / 2, pz, tennis ? [0.20, 0.33, 0.25] : STEEL, parts);
      }
      const net = new THREE.BoxGeometry(half * 2, band, 0.02);
      net.rotateY(netA + Math.PI / 2);
      net.translate(cx, y0 + hNet - band / 2, cz);
      parts.push({ geo: net, color: [0.24, 0.25, 0.26] });
      const tape = new THREE.BoxGeometry(half * 2, 0.06, 0.03);
      tape.rotateY(netA + Math.PI / 2);
      tape.translate(cx, y0 + hNet, cz);
      parts.push({ geo: tape, color: WHITE });
      stats.сеток++;
      if (tennis) fence(a.poly, 3.6);
      else if (s.as === 'volleyball') fence(a.poly, 2.2);
    } else if (s.as === 'track' && s.fence) {
      fence(a.poly, s.fence);
    }
  }

  // ---- трибуны (ручные): ряды ступенями от земли, сиденья, задняя стенка, навес
  for (const st of SPORT.stands || []) {
    const [ax, az, bx, bz] = st.front;
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    if (!mine(mx, mz)) continue;
    const L = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / L, uz = (bz - az) / L;
    // назад — от поля: поле там, куда смотрит «aim», или к ближайшей ровной площадке
    let nx = -uz, nz = ux;
    const aim = st.aim || [mx - nx, mz - nz];
    if ((aim[0] - mx) * nx + (aim[1] - mz) * nz > 0) { nx = -nx; nz = -nz; }
    const D = st.depth || 12, R = st.rows || 10;
    const tread = (D - 2.2) / R, rise = 0.42;
    // отметка трибуны — по самой низкой земле под передней кромкой: ступени
    // уходят в грунт, а не висят
    let g0 = Infinity, gMin = Infinity;
    for (let t = 0; t <= 1.0001; t += 0.1) {
      const fx = ax + (bx - ax) * t, fz = az + (bz - az) * t;
      g0 = Math.min(g0, G(fx, fz));
      gMin = Math.min(gMin, G(fx + nx * D, fz + nz * D), G(fx, fz));
    }
    const base = gMin - 0.6;
    const yaw = Math.atan2(-nx, -nz);          // лицом к полю
    const SEAT = hex(st.seat || '#2f5d8f');
    // парапет перед первым рядом
    {
      const g = new THREE.BoxGeometry(L, 1.1 + (g0 - base), 0.25);
      g.rotateY(Math.atan2(ux, uz) + Math.PI / 2);
      g.translate(mx + nx * 0.8, base + (1.1 + g0 - base) / 2, mz + nz * 0.8);
      parts.push({ geo: g, color: CONC });
    }
    for (let i = 0; i < R; i++) {
      const d0 = 1.0 + i * tread, yTop = g0 + 0.6 + i * rise;
      const g = new THREE.BoxGeometry(L, yTop - base, tread + 0.02);
      g.rotateY(Math.atan2(ux, uz) + Math.PI / 2);
      g.translate(mx + nx * (d0 + tread / 2), base + (yTop - base) / 2, mz + nz * (d0 + tread / 2));
      parts.push({ geo: g, color: i % 2 ? CONC : CONC_D });
      // сиденья с проходами каждые 12 мест
      const nSeat = Math.floor(L / 0.5);
      for (let k = 0; k < nSeat; k++) {
        if (k % 13 === 12) continue;
        const t = (k + 0.5) / nSeat;
        const sx = ax + (bx - ax) * t + nx * (d0 + tread * 0.55), sz = az + (bz - az) * t + nz * (d0 + tread * 0.55);
        seats.push({ x: sx, z: sz, y: yTop, a: yaw, s: 1, c: SEAT });
      }
    }
    const yBack = g0 + 0.6 + R * rise;
    // задняя стенка и площадка за последним рядом
    {
      const d1 = 1.0 + R * tread;
      const g = new THREE.BoxGeometry(L, yBack - base + 0.1, D - d1);
      g.rotateY(Math.atan2(ux, uz) + Math.PI / 2);
      g.translate(mx + nx * (d1 + (D - d1) / 2), base + (yBack - base + 0.1) / 2, mz + nz * (d1 + (D - d1) / 2));
      parts.push({ geo: g, color: CONC });
      const w = new THREE.BoxGeometry(L, 2.4, 0.3);
      w.rotateY(Math.atan2(ux, uz) + Math.PI / 2);
      w.translate(mx + nx * (D - 0.15), yBack + 1.2, mz + nz * (D - 0.15));
      parts.push({ geo: w, color: [0.86, 0.85, 0.80] });
    }
    if (st.roof) {
      // навес на стойках по задней кромке, консолью над рядами
      const yR = yBack + 3.6;
      const nCol = Math.max(2, Math.round(L / 8));
      for (let k = 0; k <= nCol; k++) {
        const t = k / nCol;
        const px = ax + (bx - ax) * t + nx * (D - 0.4), pz = az + (bz - az) * t + nz * (D - 0.4);
        box(0.35, yR - yBack, 0.35, px, yBack + (yR - yBack) / 2, pz, STEEL, parts);
      }
      const roofD = D - 0.5;
      const g = new THREE.BoxGeometry(L + 0.6, 0.22, roofD);
      g.rotateX(0.10);                         // уклон к задней стенке
      g.rotateY(Math.atan2(ux, uz) + Math.PI / 2);
      // после поворота «вперёд» по x бокса — это −n; сдвигаем центр
      g.translate(mx + nx * (D - roofD / 2), yR + 0.2, mz + nz * (D - roofD / 2));
      parts.push({ geo: g, color: hex(st.roofColor || '#b8432f') });
      // рёбра навеса
      const nr = Math.max(4, Math.round(L / 6));
      for (let k = 0; k <= nr; k++) {
        const t = k / nr;
        const px = ax + (bx - ax) * t + nx * (D - roofD / 2), pz = az + (bz - az) * t + nz * (D - roofD / 2);
        const rb = new THREE.BoxGeometry(0.18, 0.45, roofD);
        rb.rotateY(Math.atan2(nx, nz));
        rb.translate(px, yR - 0.05, pz);
        parts.push({ geo: rb, color: STEEL });
      }
    }
    stats.трибун++;
  }

  // ---- прожекторные мачты (ручные): ствол на фундаменте и рама с прожекторами
  for (const m of SPORT.masts || []) {
    if (!mine(m.x, m.z)) continue;
    if (m.style === 'lattice') { latticeMast(m, G(m.x, m.z), parts); stats.мачт++; continue; }
    const g0 = G(m.x, m.z), H = m.h || 25;
    box(2.2, 1.0, 2.2, m.x, g0 + 0.2, m.z, CONC, parts);
    const pole = new THREE.CylinderGeometry(0.28, 0.55, H, 8);
    pole.translate(m.x, g0 + 0.7 + H / 2, m.z);
    parts.push({ geo: pole, color: [0.50, 0.52, 0.54] });
    const aim = m.aim || [m.x + 1, m.z];
    const yaw = Math.atan2(aim[0] - m.x, aim[1] - m.z);
    const head = new THREE.Group();
    const hp = [];
    box(4.2, 0.14, 0.2, 0, 0, 0, STEEL, hp);
    box(4.2, 0.14, 0.2, 0, 2.6, 0, STEEL, hp);
    for (const sx of [-2.1, 2.1]) box(0.14, 2.74, 0.2, sx, 1.3, 0, STEEL, hp);
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 5; c++) {
        const g = new THREE.BoxGeometry(0.62, 0.62, 0.32);
        g.rotateX(0.35);
        g.translate(-1.68 + c * 0.84, 0.45 + r * 0.85, 0.28);
        hp.push({ geo: g, color: [0.80, 0.82, 0.80] });
      }
    const hg = merge(hp);
    hg.rotateY(yaw);
    hg.translate(m.x, g0 + 0.7 + H, m.z);
    void head;
    parts.push({ geo: hg, color: [1, 1, 1], keep: true });
    stats.мачт++;
  }

  // мачта уже раскрашена — merge перекрасил бы её в белый; собираем отдельно
  const keep = parts.filter(p => p.keep), plain = parts.filter(p => !p.keep);
  if (plain.length) {
    const mesh = new THREE.Mesh(merge(plain), SPORT_MAT());
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
  }
  for (const k of keep) {
    const mesh = new THREE.Mesh(k.geo, SPORT_MAT());
    mesh.castShadow = true;
    group.add(mesh);
  }
  if (fenceP.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(fenceP, 3));
    g.setIndex(fenceI);
    g.computeVertexNormals();
    // рабица: издали это лёгкая серо-зелёная вуаль, а не стена
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
      color: 0x8a958d, roughness: 0.8, metalness: 0.3, transparent: true, opacity: 0.2,
      side: THREE.DoubleSide, depthWrite: false,
    }));
    mesh.name = 'рабица';
    group.add(mesh);
  }
  const inst = (geo, list, cast, colored) => {
    if (!list.length) { geo.dispose(); return; }
    const m = new THREE.InstancedMesh(geo, SPORT_MAT(), list.length);
    const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0),
          pv = new THREE.Vector3(), sv = new THREE.Vector3(), col = new THREE.Color();
    list.forEach((p, i) => {
      pv.set(p.x, p.y, p.z); q.setFromAxisAngle(up, p.a); sv.set(p.s, p.s, p.s);
      m.setMatrixAt(i, mx.compose(pv, q, sv));
      if (colored) m.setColorAt(i, col.setRGB(s2l(p.c[0]), s2l(p.c[1]), s2l(p.c[2])));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
    m.castShadow = cast; m.receiveShadow = true;
    group.add(m);
  };
  if (posts.length) {
    const pg = new THREE.BoxGeometry(0.07, 1, 0.07);
    pg.translate(0, 0.5, 0);
    const m = new THREE.InstancedMesh(pg, new THREE.MeshStandardMaterial({ color: 0x3d4a42, roughness: 0.6, metalness: 0.4 }), posts.length);
    const mx = new THREE.Matrix4();
    posts.forEach((p, i) => m.setMatrixAt(i, mx.makeScale(1, p.h, 1).setPosition(p.x, p.y, p.z)));
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
    group.add(m);
  }
  inst(goalGeo(), goals, true, false);
  inst(hoopGeo(), hoops, true, false);
  inst(seatGeo(), seats, false, true);
  stats.сидений = seats.length;
  group.userData.stats = stats;
  return group;
}
