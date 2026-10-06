import * as THREE from 'three';

// Пешеходы: простые фигуры гуляют по тротуарам и дорожкам вокруг игрока.
//
// Где ходят — только там, где в данных OSM есть путь:
//  · тротуары проезжих улиц — те же, что рисует buildRoads (worldgen.js,
//    walkRoad: класс до второго от 3 м, проезд от 6 м, не мост и не тоннель):
//    линия посередине тротуара, по обе стороны осевой;
//  · пешеходные улицы, бульвары, дорожки парков и скверов (c = 4) — по осевой.
// Тротуар обрывается там, где упирается в проезжую часть соседней улицы
// (перекрёсток) или в стену дома: пешеход там разворачивается. Дорожки
// продолжаются на другую дорожку в общем узле OSM, как улицы у трафика.
//
// От машины игрока отходят: если она едет на пешехода или стоит вплотную,
// он отбегает вбок от её пути и потом возвращается на свою линию. Пешком
// игрока обходят на шаг в сторону.
//
// Модель — коробки: ноги, туловище, руки, голова, волосы; один InstancedMesh
// (один вызов отрисовки и тени). Шаг — в вершинном шейдере: ноги и руки
// качаются вокруг бедра и плеча по фазе экземпляра. Цвет верха, низа и
// волос — атрибутами экземпляра, кожа и обувь — в вершинах.
//
// ?peds=0 — выключить, ?peds=60 — сколько держать вокруг (до 90).

const P = new URLSearchParams(location.search);
const WANT = P.has('peds') ? Math.max(0, Math.min(90, +P.get('peds') || 0)) : 45;

const R_SPAWN = 260;          // дальше — не рождаем
const R_DROP = 330;           // дальше — убираем
const R_SPAWN_MIN = 70;       // ближе — не рождаем, чтобы не возникали на глазах
const SIDE_OFF = 1.25;        // от кромки полотна до середины тротуара (тротуар 2.6 м)
const WALK_Y = 0.20;          // верх тротуара над полотном (KERB_H + 0.03 в buildRoads)
const PATH_Y = 0.12;          // дорожка лежит чуть ниже полотна улицы
const LOOK = 1.6;             // на сколько вперёд щупаем, свободно ли

// тротуар у этой улицы рисуется (как walkRoad в buildRoads)
const sideRoad = r => r && !r.br && !r.tn && (r.c <= 2 ? r.w >= 3 : r.c === 3 && r.w >= 6);
// пешеходная улица или дорожка
const footRoad = r => r && r.c === 4 && !r.br && !r.tn;
const carRoad = r => r && r.c <= 3;
const vkey = (x, z) => Math.round(x * 10) + ',' + Math.round(z * 10);
const wrapPi = a => a - Math.round(a / (2 * Math.PI)) * 2 * Math.PI;

// ------------------------------------------------------------------ модель
const s2l = v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
const SKIN = [0.80, 0.62, 0.50];
const SHOE = [0.10, 0.09, 0.09];
// part: 0 — цвет вершины, 1 — верх (aTop), 2 — низ (aBot), 3 — волосы (aHair)
// limb: 1/2 — левая/правая нога, 3/4 — левая/правая рука
function pedGeo() {
  const parts = [];
  const box = (sx, sy, sz, x, y, z, part, color = [1, 1, 1], limb = 0) => {
    const b = new THREE.BoxGeometry(sx, sy, sz); b.translate(x, y, z);
    parts.push({ geo: b, part, color, limb });
  };
  for (const [s, limb] of [[-1, 1], [1, 2]]) {
    box(0.15, 0.84, 0.17, s * 0.1, 0.5, 0, 2, undefined, limb);            // нога
    box(0.14, 0.08, 0.27, s * 0.1, 0.04, 0.04, 0, SHOE, limb);             // ботинок
  }
  box(0.40, 0.58, 0.23, 0, 1.18, 0, 1);                                    // туловище
  box(0.13, 0.08, 0.12, 0, 1.50, 0, 0, SKIN);                              // шея
  box(0.20, 0.23, 0.22, 0, 1.63, 0.01, 0, SKIN);                           // голова
  box(0.22, 0.08, 0.24, 0, 1.76, -0.01, 3);                                // волосы сверху
  box(0.22, 0.13, 0.06, 0, 1.68, -0.11, 3);                                // и сзади
  for (const [s, limb] of [[-1, 3], [1, 4]]) {
    box(0.10, 0.52, 0.12, s * 0.255, 1.18, 0, 1, undefined, limb);          // рукав
    box(0.08, 0.10, 0.09, s * 0.255, 0.88, 0, 0, SKIN, limb);               // кисть
  }
  let nv = 0, ni = 0;
  for (const { geo } of parts) { nv += geo.attributes.position.count; ni += geo.index.count; }
  const Pp = new Float32Array(nv * 3), N = new Float32Array(nv * 3), Cc = new Float32Array(nv * 3);
  const Pt = new Float32Array(nv), Lb = new Float32Array(nv), I = new Uint16Array(ni);
  let vo = 0, io = 0;
  for (const { geo, part, color, limb } of parts) {
    const n = geo.attributes.position.count;
    Pp.set(geo.attributes.position.array, vo * 3); N.set(geo.attributes.normal.array, vo * 3);
    const lc = color.map(s2l);
    for (let i = 0; i < n; i++) { Cc.set(lc, (vo + i) * 3); Pt[vo + i] = part; Lb[vo + i] = limb; }
    for (let i = 0; i < geo.index.count; i++) I[io++] = geo.index.array[i] + vo;
    vo += n;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(Pp, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.BufferAttribute(Cc, 3));
  g.setAttribute('aPart', new THREE.BufferAttribute(Pt, 1));
  g.setAttribute('aLimb', new THREE.BufferAttribute(Lb, 1));
  g.setIndex(new THREE.BufferAttribute(I, 1));
  return g;
}

// Качание ног и рук: поворот вокруг бедра (0.92 м) и плеча (1.42 м) по оси x.
// Один и тот же кусок — в основном материале и в материале тени.
const SWING = `
  {
    float sw = sin(aWalk.x) * aWalk.y;
    if (aLimb > 0.5) {
      bool arm = aLimb > 2.5;
      float s = (mod(aLimb, 2.0) > 0.5 ? 1.0 : -1.0) * (arm ? -0.75 : 1.0);
      float a = sw * s;
      float py = arm ? 1.42 : 0.92;
      float ca = cos(a), sa = sin(a);
      float qy = transformed.y - py, qz = transformed.z;
      transformed.y = py + qy * ca - qz * sa;
      transformed.z = qy * sa + qz * ca;
    }
  }`;

function patch(sh, colors) {
  let v = sh.vertexShader
    .replace('#include <common>', `#include <common>
attribute float aPart;
attribute float aLimb;
attribute vec4 aWalk;
attribute vec3 aTop;
attribute vec3 aBot;
attribute vec3 aHair;`)
    .replace('#include <begin_vertex>', '#include <begin_vertex>' + SWING);
  if (colors) v = v.replace('#include <color_vertex>', `#include <color_vertex>
  if (aPart > 0.5) vColor.rgb = aPart < 1.5 ? aTop : aPart < 2.5 ? aBot : aHair;`);
  sh.vertexShader = v;
}

let MAT = null, DEPTH = null;
function materials() {
  if (MAT) return [MAT, DEPTH];
  MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
  MAT.customProgramCacheKey = () => 'peds-1';
  MAT.onBeforeCompile = sh => patch(sh, true);
  // тень тоже шагает
  DEPTH = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  DEPTH.customProgramCacheKey = () => 'peds-depth-1';
  DEPTH.onBeforeCompile = sh => patch(sh, false);
  return [MAT, DEPTH];
}

// Одежда — спокойная городская: тёмное, синее, серое, бежевое, немного яркого
const TOPS = [0x2b2d31, 0x2b2d31, 0x3b4a63, 0x1f2f4a, 0x7a7d82, 0xd9d6cc, 0xefefea, 0x8b2a2a,
  0x5d6b4a, 0xb68a5a, 0x6a3f63, 0x2f5c6e, 0xc9b28c, 0x9c4a2a, 0x444a40];
const BOTS = [0x23262c, 0x23262c, 0x2c3a55, 0x2c3a55, 0x3e4147, 0x5b5348, 0x7b6f5c, 0x15161a, 0x4a4f5a];
const HAIR = [0x1d1612, 0x2e2018, 0x4a3324, 0x6b4a2e, 0x8a6a45, 0xb79a6b, 0x9a9a98, 0xcfcfcc];
const pick = a => a[Math.floor(Math.random() * a.length)];
const lin = hex => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };   // Color уже линейный

// ------------------------------------------------------------------ пешеходы
export class Peds {
  // roads — RoadIndex, collider — стены домов, terrain — высота полотна,
  // car() — машина игрока, walker() — {x, z} игрока пешком или null.
  constructor({ scene, terrain, roads, collider, car, walker }) {
    this.terrain = terrain; this.roads = roads; this.collider = collider;
    this.car = car; this.walker = walker;
    this.enabled = WANT > 0;
    this.peds = [];
    this.sig = ''; this.rebuildT = 0;
    this.list = []; this.cum = []; this.total = 0; this.vtx = new Map();
    this.stat = { spawned: 0, turned: 0, dodged: 0 };
    const geo = pedGeo();
    const n = Math.max(1, WANT);
    this.aWalk = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    this.aTop = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    this.aBot = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    this.aHair = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    for (const a of [this.aWalk, this.aTop, this.aBot, this.aHair]) a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aWalk', this.aWalk);
    geo.setAttribute('aTop', this.aTop);
    geo.setAttribute('aBot', this.aBot);
    geo.setAttribute('aHair', this.aHair);
    const [mat, depth] = materials();
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.customDepthMaterial = depth;
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;     // фигуры ходят — общая сфера устаревает
    this.mesh.castShadow = true;
    this.mesh.name = 'пешеходы';
    scene.add(this.mesh);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler();
    this._p = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1);
    this._pt = new THREE.Vector3();
  }

  get stats() {
    const st = { peds: this.peds.length, paths: this.list.length, ...this.stat, dodging: 0, standing: 0 };
    for (const p of this.peds) { if (p.dodge > 0) st.dodging++; if (p.wait > 0) st.standing++; }
    return st;
  }

  // Сеть путей пересобираем, когда в индексе дорог что-то приехало или уехало
  _network() {
    const R = this.roads;
    const sig = R.parts.size + ':' + R.roads.length + ':' + R.free.length;
    if (sig === this.sig || this.rebuildT > 0) return;
    this.sig = sig; this.rebuildT = 2;
    const list = [], cum = [], vtx = new Map(), seen = new Set();
    let total = 0;
    for (const r of R.roads) {
      if (!r || seen.has(r.id) || !r.pts || r.pts.length < 4) continue;
      const side = sideRoad(r), foot = footRoad(r);
      if (!side && !foot) continue;
      seen.add(r.id);
      const p = r.pts, n = p.length / 2;
      let len = 0;
      for (let j = 1; j < n; j++) len += Math.hypot(p[j * 2] - p[j * 2 - 2], p[j * 2 + 1] - p[j * 2 - 1]);
      if (foot) for (let j = 0; j < n; j++) {
        const k = vkey(p[j * 2], p[j * 2 + 1]);
        let a = vtx.get(k); if (!a) vtx.set(k, a = []);
        a.push(r, j);
      }
      // у улицы два тротуара — вдвое больше места для пешеходов
      total += side ? len * 2 : len;
      list.push(r); cum.push(total);
    }
    this.list = list; this.cum = cum; this.total = total; this.vtx = vtx;
  }

  // Свободна ли точка для пешехода: не в доме, не на проезжей части
  // (кроме своей улицы, если идём по её дорожке, — её и так нет)
  _free(x, z, own) {
    const pt = this._pt.set(x, 0, z);
    if (this.collider.resolve(pt, 0.3)) return false;
    const near = this.roads.nearest(x, z, 14, r => carRoad(r) && (!own || r.id !== own.id));
    if (near && near.dist < near.road.w / 2 + 0.3) return false;
    // на своей улице — не на полотне (тротуар узкой улицы не залезает внутрь)
    if (own && carRoad(own)) {
      const me = this.roads.nearest(x, z, 14, r => r.id === own.id);
      if (me && me.dist < own.w / 2 + 0.2) return false;
    }
    return true;
  }

  // Точка на пути: звено from→from+dir, s метров от его начала, смещение off вправо
  _seg(p) {
    const q = p.r.pts, a = p.from, c = p.from + p.dir;
    p.ax = q[a * 2]; p.az = q[a * 2 + 1];
    const dx = q[c * 2] - p.ax, dz = q[c * 2 + 1] - p.az;
    p.len = Math.hypot(dx, dz) || 0.01;
    p.ux = dx / p.len; p.uz = dz / p.len;
  }

  _at(p, s, extra = 0) {
    const rx = -p.uz, rz = p.ux;
    const o = p.off + extra;
    return [p.ax + p.ux * s + rx * o, p.az + p.uz * s + rz * o];
  }

  _spawn(px, pz, rMin) {
    if (!this.total) return false;
    for (let tries = 0; tries < 14; tries++) {
      const u = Math.random() * this.total;
      let lo = 0, hi = this.cum.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (this.cum[mid] < u) lo = mid + 1; else hi = mid; }
      const r = this.list[lo], q = r.pts, n = q.length / 2;
      const i = Math.floor(Math.random() * (n - 1));
      const ax = q[i * 2], az = q[i * 2 + 1];
      const len = Math.hypot(q[i * 2 + 2] - ax, q[i * 2 + 3] - az);
      if (len < 2) continue;
      const t = Math.random();
      const cx = ax + (q[i * 2 + 2] - ax) * t, cz = az + (q[i * 2 + 3] - az) * t;
      const d = Math.hypot(cx - px, cz - pz);
      if (d < rMin || d > R_SPAWN) continue;
      const dir = Math.random() < 0.5 ? 1 : -1;
      const foot = !sideRoad(r);
      // смещение вправо по ходу: тротуар — правый или левый (идём по любому),
      // дорожка — по своей половине, если она шире двух метров
      const half = foot ? Math.max(0, r.w / 2 - 0.4) : 0;
      const off = foot ? (Math.random() * 2 - 1) * Math.min(half, 1.2)
        : (Math.random() < 0.5 ? 1 : -1) * (r.w / 2 + SIDE_OFF + (Math.random() - 0.5) * 0.9);
      const p = {
        r, foot, dir, from: dir > 0 ? i : i + 1, s: 0, off,
        x: 0, z: 0, y: 0, yaw: 0, shift: 0, dodge: 0, dodgeTo: 0,
        v: 1.15 + Math.random() * 0.45, vmax: 0, wait: 0, phase: Math.random() * 6.28,
        h: 0.9 + Math.random() * 0.17, wd: 0.92 + Math.random() * 0.18, checkS: 0,
        top: lin(pick(TOPS)), bot: lin(pick(BOTS)), hair: lin(Math.random() < 0.12 ? HAIR[6 + (Math.random() * 2 | 0)] : pick(HAIR)),
      };
      p.vmax = p.v;
      this._seg(p);
      p.s = dir > 0 ? t * p.len : (1 - t) * p.len;
      const [x, z] = this._at(p, p.s);
      if (!this._free(x, z, foot ? null : r)) continue;
      if (this.peds.some(o => Math.hypot(o.x - x, o.z - z) < 3)) continue;
      p.x = x; p.z = z; p.yaw = Math.atan2(p.ux, p.uz);
      p.checkS = p.s;
      this.peds.push(p);
      this.stat.spawned++;
      return true;
    }
    return false;
  }

  // Развернуться на месте и немного постоять
  _turn(p) {
    const q = p.r.pts, n = q.length / 2;
    const end = p.from + p.dir;
    p.dir = -p.dir;
    p.from = end;
    if (p.from < 0 || p.from >= n || p.from + p.dir < 0 || p.from + p.dir >= n) { p.dead = true; return; }
    const s = p.len - p.s;
    this._seg(p);
    p.s = Math.max(0, Math.min(p.len, s));
    p.off = -p.off;                    // тот же тротуар: справа по новому ходу — это бывший левый
    p.checkS = p.s;
    p.wait = 0.4 + Math.random() * 1.6;
    this.stat.turned++;
  }

  // Конец звена: дальше по той же линии, а у дорожки — и на соседнюю дорожку
  _next(p) {
    const q = p.r.pts, n = q.length / 2, at = p.from + p.dir;
    const cands = [];
    if (at + p.dir >= 0 && at + p.dir < n) cands.push({ r: p.r, from: at, dir: p.dir, cos: 1 });
    if (p.foot) {
      const list = this.vtx.get(vkey(q[at * 2], q[at * 2 + 1]));
      if (list) for (let k = 0; k < list.length; k += 2) {
        const r2 = list[k], j = list[k + 1];
        if (r2 === p.r) continue;
        const n2 = r2.pts.length / 2;
        for (const d2 of [1, -1]) {
          const kk = j + d2;
          if (kk < 0 || kk >= n2) continue;
          const dx = r2.pts[kk * 2] - r2.pts[j * 2], dz = r2.pts[kk * 2 + 1] - r2.pts[j * 2 + 1];
          const l = Math.hypot(dx, dz) || 1;
          const cos = (dx * p.ux + dz * p.uz) / l;
          if (cos > -0.5) cands.push({ r: r2, from: j, dir: d2, cos });
        }
      }
    }
    if (!cands.length) return null;
    // на развилке — то прямо, то в сторону
    return cands.length === 1 || Math.random() < 0.5 ? cands.reduce((a, c) => (c.cos > a.cos ? c : a)) : pick(cands);
  }

  // Угроза от машины игрока: куда отбежать (знак вбок от её пути) или 0
  _threat(p, car, cv) {
    const dx = p.x - car.pos.x, dz = p.z - car.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 16) return 0;
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    const along = dx * fx + dz * fz, across = dx * fz - dz * fx;   // across > 0 — справа от машины
    // стоит вплотную — отойти от кузова
    if (d < 3.4) return { sx: dx / (d || 1), sz: dz / (d || 1), run: Math.abs(cv) > 0.5 };
    if (Math.abs(cv) < 0.8) return 0;
    // едет на него: в коридоре своей ширины в пределах ~2 с хода
    const ahead = cv > 0 ? along : -along;
    if (ahead > 0 && ahead < Math.abs(cv) * 2.2 + 3 && Math.abs(across) < 2.6) {
      const s = across >= 0 ? 1 : -1;
      return { sx: fz * s, sz: -fx * s, run: true };
    }
    return 0;
  }

  _place(p, k) {
    const rx = -p.uz, rz = p.ux;
    const tx = p.ax + p.ux * p.s + rx * p.off, tz = p.az + p.uz * p.s + rz * p.off;
    // сглаживание на изломах тротуара; отскок от машины — поверх
    p.bx = (p.bx ?? tx) + (tx - (p.bx ?? tx)) * k;
    p.bz = (p.bz ?? tz) + (tz - (p.bz ?? tz)) * k;
    p.x = p.bx + (p.ox || 0); p.z = p.bz + (p.oz || 0);
    const T = this.terrain;
    p.y = T.driveHeightAt(p.x, p.z) + (p.foot ? PATH_Y : WALK_Y);
  }

  update(dt, px, pz) {
    if (!this.enabled) return;
    dt = Math.min(dt, 0.1);
    this.rebuildT -= dt;
    this._network();
    this.peds = this.peds.filter(p => !p.dead && Math.hypot(p.x - px, p.z - pz) < R_DROP);
    const first = this.peds.length < WANT / 2;
    for (let n = 0; n < (first ? 8 : 1) && this.peds.length < WANT; n++)
      if (!this._spawn(px, pz, first ? 12 : R_SPAWN_MIN)) break;

    const car = this.car?.();
    const cv = car ? car.vLong || 0 : 0;
    const wk = this.walker?.();
    const k = 1 - Math.exp(-dt * 8);
    for (const p of this.peds) {
      // ---- машина: отбежать вбок от её пути
      const th = car ? this._threat(p, car, cv) : 0;
      if (th) {
        if (!(p.dodge > 0)) this.stat.dodged++;
        p.dodge = 1.6;
        p.dvx = th.sx; p.dvz = th.sz;
        p.run = th.run;
      }
      // пешком: игрока обходят на полшага в сторону
      let sideStep = 0;
      if (wk) {
        const dx = wk.x - p.x, dz = wk.z - p.z, d = Math.hypot(dx, dz);
        if (d < 2.5) sideStep = (dx * -p.uz * p.dir + dz * p.ux * p.dir) > 0 ? -1 : 1;
      }
      if (p.dodge > 0) {
        p.dodge -= dt;
        const sp = p.run ? 4.2 : 1.8;
        const nx = (p.ox || 0) + p.dvx * sp * dt, nz = (p.oz || 0) + p.dvz * sp * dt;
        const pt = this._pt.set(p.bx + nx, 0, p.bz + nz);
        this.collider.resolve(pt, 0.3);              // к стене прижаться можно, сквозь — нет
        const ox = pt.x - p.bx, oz = pt.z - p.bz, ol = Math.hypot(ox, oz);
        const lim = 4.5;
        p.ox = ol > lim ? ox * lim / ol : ox; p.oz = ol > lim ? oz * lim / ol : oz;
        p.yaw += wrapPi(Math.atan2(p.dvx, p.dvz) - p.yaw) * Math.min(1, dt * 10);
        p.phase += dt * sp * 4.2;
        p.amp = Math.min(0.7, 0.25 + sp * 0.1);
        this._place(p, k);
        continue;
      }
      // возвращаемся на свою линию
      if (p.ox || p.oz) {
        const ol = Math.hypot(p.ox, p.oz), back = Math.min(ol, 1.3 * dt);
        if (ol < 0.05) { p.ox = 0; p.oz = 0; } else { p.ox -= p.ox / ol * back; p.oz -= p.oz / ol * back; }
      }
      p.shift = (p.shift || 0) + ((sideStep ? sideStep * 0.9 : 0) - (p.shift || 0)) * Math.min(1, dt * 3);

      if (p.wait > 0) {
        p.wait -= dt;
        p.amp = (p.amp || 0) * (1 - Math.min(1, dt * 6));
      } else {
        p.s += p.v * dt;
        p.phase += dt * p.v * 4.6;
        p.amp = 0.42;
        // впереди обрыв тротуара (поперечная улица, стена) — разворот
        if (p.s - p.checkS > 0.8) {
          p.checkS = p.s;
          const [lx, lz] = this._at(p, Math.min(p.s + LOOK, p.len + LOOK));
          if (!this._free(lx, lz, p.foot ? null : p.r)) { this._turn(p); if (p.dead) continue; }
        }
        if (p.s >= p.len) {
          const nx = this._next(p);
          if (!nx) { this._turn(p); if (p.dead) continue; }
          else {
            const rest = p.s - p.len;
            const was = p.r;
            p.r = nx.r; p.from = nx.from; p.dir = nx.dir;
            if (p.r !== was) { p.foot = true; p.off = Math.sign(p.off) * Math.min(Math.abs(p.off), Math.max(0, p.r.w / 2 - 0.4)); }
            this._seg(p); p.s = rest; p.checkS = rest;
          }
        } else if (Math.random() < dt * 0.012) {
          // иногда останавливаются и поворачивают обратно
          this._turn(p);
          if (p.dead) continue;
        }
      }
      // боковой шаг — сдвиг смещения на время
      const off0 = p.off;
      p.off += p.shift;
      this._place(p, k);
      p.off = off0;
      const yaw = Math.atan2(p.ux, p.uz);
      p.yaw += wrapPi(yaw - p.yaw) * Math.min(1, dt * 6);
    }

    // ---- в меш
    const m = this.mesh, mt = this._m, q = this._q, e = this._e, pos = this._p, sc = this._s;
    const W = this.aWalk.array, Tp = this.aTop.array, Bt = this.aBot.array, Hr = this.aHair.array;
    let i = 0;
    for (const p of this.peds) {
      // лёгкое покачивание вверх-вниз на шаге
      const bob = Math.abs(Math.sin(p.phase)) * 0.03 * (p.amp || 0) / 0.42;
      pos.set(p.x, p.y + bob, p.z);
      e.set(0, p.yaw, 0); q.setFromEuler(e);
      sc.set(p.wd * p.h, p.h, p.h);
      mt.compose(pos, q, sc);
      m.setMatrixAt(i, mt);
      W[i * 4] = p.phase; W[i * 4 + 1] = p.amp || 0;
      Tp.set(p.top, i * 3); Bt.set(p.bot, i * 3); Hr.set(p.hair, i * 3);
      i++;
    }
    m.count = i;
    m.instanceMatrix.needsUpdate = true;
    for (const a of [this.aWalk, this.aTop, this.aBot, this.aHair]) {
      a.needsUpdate = true;
      a.clearUpdateRanges(); a.addUpdateRange(0, i * a.itemSize);
    }
  }
}
