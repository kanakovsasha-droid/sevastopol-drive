import * as THREE from 'three';
import { ENV } from './env.js?v=86fd2580';
import { LIGHTS, lightState } from './trafficlights.js?v=86fd2580';

// Трафик: машины-боты по главным улицам вокруг игрока.
//
// Сеть — те же улицы OSM, что лежат в индексе дорог (collision.js →
// RoadIndex): проезжие с классом до третьего (c ≤ 3), без тоннелей и
// парковочных проездов. Перекрёсток — общая вершина двух улиц: OSM ставит
// туда один узел, и точки совпадают до сантиметра. На перекрёстке бот чаще
// едет прямо, иногда сворачивает; в тупике — исчезает и появляется заново.
//
// Едут по правой полосе (у односторонней — по своей), держат дистанцию,
// стоят на красном и жёлтом у светофоров (trafficlights.js), объезжают
// стоящего игрока. Столкновение с игроком — толчок: машину игрока отбрасывает
// импульсом, бот на пару секунд встаёт.
//
// Модели — простые: седан, хэтчбек, микроавтобус, коробками в один меш на
// вид (InstancedMesh, три вызова отрисовки), цвет — экземпляром, фары и
// задние огни ночью светятся (ENV.uNight).
//
// ?traffic=0 — выключить, ?traffic=40 — сколько машин держать вокруг.

const P = new URLSearchParams(location.search);
const WANT = P.has('traffic') ? Math.max(0, Math.min(60, +P.get('traffic') || 0)) : 30;

const R_SPAWN = 380;         // дальше — не рождаем
const R_DROP = 480;          // дальше — убираем
const R_SPAWN_MIN = 150;     // ближе — не рождаем, чтобы не возникали на глазах
const HALF = 2.1;            // полудлина бота для дистанции, м
const ACC = 2.2, DEC = 5.5;  // разгон и торможение, м/с²
const VMAX = { 1: 14, 2: 12.5, 3: 11 };     // ~50/45/40 км/ч по классу улицы
const COLORS = [0xe9e9e6, 0xe9e9e6, 0xb9bcc0, 0xb9bcc0, 0x24272b, 0x24272b, 0x5a5e63,
  0x1f3a63, 0x7d1b1b, 0xb3a68a, 0x2f4a36, 0x8a8f96, 0x9a2f1d, 0xd8d2c0];

const drivable = r => r && r.c <= 3 && r.w >= 5 && !r.tn && !r.pk && r.pts && r.pts.length >= 4;
const vkey = (x, z) => Math.round(x * 10) + ',' + Math.round(z * 10);
const wrapPi = a => a - Math.round(a / (2 * Math.PI)) * 2 * Math.PI;

// ------------------------------------------------------------------ модели
const s2l = v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
function merge(parts) {
  let nv = 0, ni = 0;
  for (const { geo } of parts) { nv += geo.attributes.position.count; ni += geo.index.count; }
  const Pp = new Float32Array(nv * 3), N = new Float32Array(nv * 3), Cc = new Float32Array(nv * 3), Gl = new Float32Array(nv);
  const I = new Uint16Array(ni);
  let vo = 0, io = 0;
  for (const { geo, color, glow = 0 } of parts) {
    const n = geo.attributes.position.count;
    Pp.set(geo.attributes.position.array, vo * 3); N.set(geo.attributes.normal.array, vo * 3);
    const lc = color.map(s2l);
    for (let i = 0; i < n; i++) { Cc.set(lc, (vo + i) * 3); Gl[vo + i] = glow; }
    for (let i = 0; i < geo.index.count; i++) I[io++] = geo.index.array[i] + vo;
    vo += n;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(Pp, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.BufferAttribute(Cc, 3));
  g.setAttribute('aGlow', new THREE.BufferAttribute(Gl, 1));
  g.setIndex(new THREE.BufferAttribute(I, 1));
  return g;
}

const PAINT = [1, 1, 1];            // окрашивается цветом экземпляра
const GLASS = [0.16, 0.18, 0.2];
const TYRE = [0.07, 0.07, 0.07];
const TRIM = [0.25, 0.25, 0.25];

// Кузов вдоль +z (перёд), низ колёс — y = 0. len — длина, w — ширина,
// h0/h1 — низ и верх кузова, cab — [низ, верх, перёд, зад] кабины.
function carGeo({ len, w, h1, cab, roof = true, rw = 0.32 }) {
  const parts = [];
  const box = (sx, sy, sz, x, y, z, color, glow) => {
    const b = new THREE.BoxGeometry(sx, sy, sz); b.translate(x, y, z);
    parts.push({ geo: b, color, glow });
  };
  const h0 = 0.28;
  box(w, h1 - h0, len, 0, (h0 + h1) / 2, 0, PAINT);
  const [c0, c1, cf, cb] = cab;
  box(w - 0.12, c1 - c0, cf - cb, 0, (c0 + c1) / 2, (cf + cb) / 2, GLASS);
  if (roof) box(w - 0.1, 0.06, cf - cb - 0.25, 0, c1 + 0.03, (cf + cb) / 2 - 0.05, PAINT);
  // бамперы
  box(w + 0.02, 0.18, 0.12, 0, h0 + 0.12, len / 2 + 0.02, TRIM);
  box(w + 0.02, 0.18, 0.12, 0, h0 + 0.12, -len / 2 - 0.02, TRIM);
  // фары и задние огни
  for (const sx of [-1, 1]) {
    box(0.34, 0.12, 0.04, sx * (w / 2 - 0.26), h1 - 0.18, len / 2 + 0.01, [0.95, 0.95, 0.88], 1);
    box(0.30, 0.12, 0.04, sx * (w / 2 - 0.22), h1 - 0.16, -len / 2 - 0.01, [0.55, 0.05, 0.04], 2);
  }
  const base = len * 0.31;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const t = new THREE.CylinderGeometry(rw, rw, 0.22, 10);
    t.rotateZ(Math.PI / 2); t.translate(sx * (w / 2 - 0.12), rw, sz * base);
    parts.push({ geo: t, color: TYRE });
  }
  return merge(parts);
}

const KINDS = [
  { name: 'седан', share: 0.5, geo: () => carGeo({ len: 4.5, w: 1.78, h1: 0.95, cab: [0.95, 1.42, 0.85, -1.35] }) },
  { name: 'хэтчбек', share: 0.35, geo: () => carGeo({ len: 3.95, w: 1.72, h1: 0.95, cab: [0.95, 1.48, 0.7, -1.8] }) },
  { name: 'микроавтобус', share: 0.15, geo: () => carGeo({ len: 5.4, w: 2.0, h1: 1.25, cab: [1.25, 2.15, 2.1, -2.55], rw: 0.36 }) },
];

let MAT = null;
function material() {
  if (MAT) return MAT;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.35 });
  m.customProgramCacheKey = () => 'traffic-cars-1';
  m.onBeforeCompile = sh => {
    sh.uniforms.uNight = ENV.uNight;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying float vGlow;')
      .replace('#include <color_vertex>', '#include <color_vertex>\nvGlow = aGlow;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;\nvarying float vGlow;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if (vGlow > 0.5) {
          // огни не красятся цветом кузова
          vec3 lc = vGlow < 1.5 ? vec3(1.0, 0.95, 0.82) : vec3(0.9, 0.04, 0.02);
          diffuseColor.rgb = lc * 0.6;
          totalEmissiveRadiance += lc * (0.15 + 2.6 * uNight);
        }`);
  };
  return (MAT = m);
}

// ------------------------------------------------------------------ трафик
export class Traffic {
  // roads — RoadIndex, terrain — для высоты полотна (driveHeightAt),
  // car() — машина игрока (её вектор скорости _v и положение _p правим при ударе).
  constructor({ scene, terrain, roads, car }) {
    this.terrain = terrain; this.roads = roads; this.car = car;
    this.bots = [];
    this.sig = '';
    this.rebuildT = 0;
    this.vtx = new Map();
    this.list = []; this.cum = []; this.total = 0;
    this.lights = [];
    this.lightT = 0;
    this.enabled = WANT > 0;
    this.group = new THREE.Group();
    this.group.name = 'трафик';
    this.meshes = KINDS.map(k => {
      const m = new THREE.InstancedMesh(k.geo(), material(), Math.max(1, WANT));
      m.count = 0;
      m.frustumCulled = false;       // экземпляры ездят — общая сфера устаревает каждый кадр
      m.castShadow = true;
      m.name = 'трафик: ' + k.name;
      m.setColorAt(0, new THREE.Color());
      this.group.add(m);
      return m;
    });
    scene.add(this.group);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(0, 0, 0, 'YXZ');
    this._p = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1); this._c = new THREE.Color();
  }

  get stats() {
    const st = { bots: this.bots.length, roads: this.list.length, lights: this.lights.length, stopped: 0 };
    for (const b of this.bots) if (b.v < 0.3) { st.stopped++; if (b.wait) st[b.wait] = (st[b.wait] || 0) + 1; }
    return st;
  }

  // Сеть улиц пересобираем, когда в индексе дорог что-то приехало или уехало.
  _network() {
    const R = this.roads;
    const sig = R.parts.size + ':' + R.roads.length + ':' + R.free.length;
    if (sig === this.sig || this.rebuildT > 0) return;
    this.sig = sig; this.rebuildT = 1.5;
    const vtx = new Map(), list = [], cum = [];
    let total = 0;
    const seen = new Set();
    for (const r of R.roads) {
      if (!drivable(r) || seen.has(r.id)) continue;   // одна улица лежит в нескольких кварталах
      seen.add(r.id);
      list.push(r);
      const p = r.pts, n = p.length / 2;
      let len = 0;
      for (let j = 0; j < n; j++) {
        const k = vkey(p[j * 2], p[j * 2 + 1]);
        let a = vtx.get(k); if (!a) vtx.set(k, a = []);
        a.push(r, j);
        if (j) len += Math.hypot(p[j * 2] - p[j * 2 - 2], p[j * 2 + 1] - p[j * 2 - 1]);
      }
      total += len; cum.push(total);
    }
    this.vtx = vtx; this.list = list; this.cum = cum; this.total = total;
  }

  // Светофоры рядом с игроком (их ставят кварталы в LIGHTS)
  _lights(px, pz) {
    const out = [];
    for (const [k, l] of LIGHTS) {
      const d = Math.hypot(l.x - px, l.z - pz);
      if (d > 1500) LIGHTS.delete(k);
      else if (d < R_DROP + 60) out.push(l);
    }
    this.lights = out;
  }

  // ----------------------------------------------------------- рождение
  _lane(r) {
    // смещение от осевой вправо по ходу: у двусторонней — середина своей
    // половины, у широкой — одна из двух полос; у односторонней — любая полоса
    const w = r.w;
    if (r.ow) return w >= 9 ? (Math.random() < 0.5 ? -1 : 1) * w / 4 : 0;
    if (w >= 13) return Math.random() < 0.5 ? w / 8 + 0.2 : w * 3 / 8 - 0.4;
    return Math.min(w / 4, w / 2 - 1.1);
  }

  _spawn(px, pz, rMin) {
    if (!this.total) return false;
    for (let tries = 0; tries < 12; tries++) {
      const u = Math.random() * this.total;
      let lo = 0, hi = this.cum.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (this.cum[mid] < u) lo = mid + 1; else hi = mid; }
      const r = this.list[lo], p = r.pts, n = p.length / 2;
      const i = Math.floor(Math.random() * (n - 1));
      const ax = p[i * 2], az = p[i * 2 + 1], bx = p[i * 2 + 2], bz = p[i * 2 + 3];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 2) continue;
      const t = Math.random();
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      const d = Math.hypot(x - px, z - pz);
      if (d < rMin || d > R_SPAWN) continue;
      if (this.bots.some(b => Math.hypot(b.x - x, b.z - z) < 14)) continue;
      const dir = r.ow || Math.random() < 0.5 ? 1 : -1;
      const from = dir > 0 ? i : i + 1;
      const kind = (() => { let k = Math.random(); for (let j = 0; j < KINDS.length; j++) { k -= KINDS[j].share; if (k < 0) return j; } return 0; })();
      const b = {
        r, from, dir, s: dir > 0 ? t * len : (1 - t) * len, len: 0,
        off: this._lane(r), shift: 0, shiftTo: 0,
        v: (VMAX[r.c] || 11) * (0.6 + 0.3 * Math.random()), vmax: (VMAX[r.c] || 11) * (0.85 + 0.25 * Math.random()),
        kind, color: COLORS[Math.floor(Math.random() * COLORS.length)],
        x, z, y: 0, yaw: 0, pitch: 0, hx: 0, hz: 1,
        next: null, stun: 0, stuck: 0, ghost: 0, fresh: true,
      };
      this._seg(b);
      this._place(b, 1);
      this.bots.push(b);
      return true;
    }
    return false;
  }

  // Звено, по которому едет бот: от вершины from к from + dir
  _seg(b) {
    const p = b.r.pts, a = b.from, c = b.from + b.dir;
    b.ax = p[a * 2]; b.az = p[a * 2 + 1];
    const dx = p[c * 2] - b.ax, dz = p[c * 2 + 1] - b.az;
    b.len = Math.hypot(dx, dz) || 0.01;
    b.ux = dx / b.len; b.uz = dz / b.len;
  }

  // Куда ехать с конца текущего звена. null — тупик.
  _choose(b) {
    const r = b.r, p = r.pts, n = p.length / 2, at = b.from + b.dir;
    const cands = [];
    const add = (r2, j, d2) => {
      const k = j + d2;
      if (k < 0 || k >= n2(r2)) return;
      const dx = r2.pts[k * 2] - r2.pts[j * 2], dz = r2.pts[k * 2 + 1] - r2.pts[j * 2 + 1];
      const l = Math.hypot(dx, dz) || 1;
      const cos = (dx * b.ux + dz * b.uz) / l;
      if (cos < -0.35) return;                       // разворот и острый угол — нет
      cands.push({ r: r2, from: j, dir: d2, cos, same: r2 === r });
    };
    const n2 = q => q.pts.length / 2;
    if (at + b.dir >= 0 && at + b.dir < n) add(r, at, b.dir);
    const list = this.vtx.get(vkey(p[at * 2], p[at * 2 + 1]));
    if (list) for (let k = 0; k < list.length; k += 2) {
      const r2 = list[k], j = list[k + 1];
      if (r2 === r) continue;
      add(r2, j, 1);
      if (!r2.ow) add(r2, j, -1);
    }
    if (!cands.length) return null;
    // прямо — чаще: та же улица дальше или самое прямое продолжение
    const straight = cands.reduce((a, c) => (c.cos > a.cos ? c : a));
    if (cands.length === 1 || (straight.cos > 0.9 && Math.random() < 0.7)) return straight;
    let sum = 0;
    for (const c of cands) sum += c.w = 0.4 + Math.max(0, c.cos);
    let u = Math.random() * sum;
    for (const c of cands) { u -= c.w; if (u <= 0) return c; }
    return straight;
  }

  // Положение на улице: метры от её первой точки
  _arc(b) {
    const r = b.r;
    if (!r._cum) {
      const p = r.pts, n = p.length / 2, c = new Float32Array(n);
      for (let j = 1; j < n; j++) c[j] = c[j - 1] + Math.hypot(p[j * 2] - p[j * 2 - 2], p[j * 2 + 1] - p[j * 2 - 1]);
      r._cum = c;
    }
    return r._cum[b.from] + b.dir * b.s;
  }

  // Мировое положение по звену и смещению. k — доля сглаживания.
  _place(b, k) {
    const rx = -b.uz, rz = b.ux;                     // вправо по ходу (x — восток, z — юг)
    const off = b.off + b.shift;
    const tx = b.ax + b.ux * b.s + rx * off, tz = b.az + b.uz * b.s + rz * off;
    b.x += (tx - b.x) * k; b.z += (tz - b.z) * k;
    const yaw = Math.atan2(b.ux, b.uz);
    b.yaw += wrapPi(yaw - b.yaw) * k;
    b.hx = Math.sin(b.yaw); b.hz = Math.cos(b.yaw);
    const T = this.terrain;
    const hf = T.driveHeightAt(b.x + b.hx * 1.5, b.z + b.hz * 1.5);
    const hb = T.driveHeightAt(b.x - b.hx * 1.5, b.z - b.hz * 1.5);
    b.y = (hf + hb) / 2;
    b.pitch = Math.atan2(hf - hb, 3);
  }

  // ----------------------------------------------------------- кадр
  update(dt, px, pz, driving) {
    if (!this.enabled) return;
    this.rebuildT -= dt;
    this._network();
    if ((this.lightT -= dt) <= 0) { this.lightT = 0.5; this._lights(px, pz); }

    // убрать дальних и застрявших в тупике
    this.bots = this.bots.filter(b => !b.dead && Math.hypot(b.x - px, b.z - pz) < R_DROP);
    // добрать до нужного числа: на старте — сразу и поближе, потом по одной
    const first = this.bots.length < WANT / 2;
    for (let n = 0; n < (first ? 6 : 1) && this.bots.length < WANT; n++)
      if (!this._spawn(px, pz, first ? 40 : R_SPAWN_MIN)) break;

    // игрок — препятствие всегда (и пустая машина, пока ходим пешком или
    // летаем), а толкается только за рулём
    const car = this.car();
    const pvx = car ? car._v[0] : 0, pvz = car ? car._v[2] : 0;
    const pSpeed = Math.hypot(pvx, pvz);

    for (const b of this.bots) {
      let target = b.vmax;
      b.wait = '';
      // поворот впереди — сбросить скорость заранее
      const left = b.len - b.s;
      if (left < 22 && !b.next) b.next = this._choose(b) || { dead: true };
      if (b.next && !b.next.dead && left < 22 && b.next.cos < 0.85)
        target = Math.min(target, 4.5 + 6 * Math.max(0, b.next.cos) + left * 0.3);

      // препятствия впереди: боты и игрок
      let gap = Infinity, playerAhead = false;
      const rx = -b.hz, rz = b.hx;
      const look = (ox, oz, ohx, ohz, isPlayer) => {
        const dx = ox - b.x, dz = oz - b.z;
        const ahead = dx * b.hx + dz * b.hz;
        if (ahead <= 0 || ahead > 40) return;
        const lat = Math.abs(dx * rx + dz * rz);
        if (lat > 2.0) return;
        if (!isPlayer) {
          const dot = ohx * b.hx + ohz * b.hz;
          // поперёк едущего на перекрёстке не ждём бесконечно — только вплотную
          if (dot < 0.3 && ahead > 7) return;
          // слияние под углом: каждый видит другого впереди и оба встают.
          // Уступает тот, кто дальше от точки встречи: если мы впереди
          // соседа сильнее, чем он впереди нас, — едем
          if (dot > 0.3 && -(dx * ohx + dz * ohz) > ahead) return;
          // застрявший перестаёт замечать только поперечных, попутных — никогда
          if (b.ghost > 0 && dot < 0.7) return;
        }
        const g = ahead - 2 * HALF;
        if (g < gap) { gap = g; playerAhead = isPlayer; }
      };
      const pos = this._arc(b);
      for (const o of this.bots) {
        if (o === b) continue;
        // попутный на той же улице — по длине пути, а не по прямой: на
        // повороте передний уходит вбок от курса и прямой взгляд его теряет
        if (o.r === b.r && o.dir === b.dir && Math.abs(o.off + o.shift - b.off - b.shift) < 2) {
          const along = (this._arc(o) - pos) * b.dir;
          if (along > 0 && along < 40) { if (along - 2 * HALF < gap) { gap = along - 2 * HALF; playerAhead = false; } continue; }
          if (along <= 0 && along > -40) continue;
        }
        // уже свернул туда, куда собираемся мы: путь — остаток звена и его ход по новой улице
        const nx = b.next;
        if (nx && !nx.dead && o.r === nx.r && o.dir === nx.dir) {
          const cum = o.r._cum || (this._arc(o), o.r._cum);
          const along = (b.len - b.s) + (this._arc(o) - cum[nx.from]) * nx.dir;
          if (along > 0 && along < 40) { if (along - 2 * HALF < gap) { gap = along - 2 * HALF; playerAhead = false; } continue; }
        }
        look(o.x, o.z, o.hx, o.hz, false);
      }
      if (car) look(car.pos.x, car.pos.z, Math.sin(car.yaw), Math.cos(car.yaw), true);
      if (gap < Infinity && (gap - 2.5) * 0.7 < target) { target = Math.max(0, (gap - 2.5) * 0.7); b.wait = playerAhead ? 'игрок' : 'бот'; }

      // объезд игрока: стоит или ползёт перед нами — обходим в 2.7 м от его
      // середины, слева (на двусторонней — по встречной) или справа, где
      // влезает в полотно; не влезает нигде — ждём. Проехали — назад в полосу.
      if (car) {
        const dx = car.pos.x - b.x, dz = car.pos.z - b.z;
        const ahead = dx * b.hx + dz * b.hz, lat = dx * rx + dz * rz;
        if (playerAhead && pSpeed < 2 && ahead < 18 && (b.shiftTo === 0 || b.v < 0.3)) {
          const now = b.off + b.shift, edge = b.r.w / 2 - 1.0;
          const lo = -edge, hi = edge;
          const opts = [now + lat - 2.7, now + lat + 2.7].filter(o => o >= lo && o <= hi);
          if (opts.length) {
            const o = opts.reduce((a, c) => (Math.abs(c - b.off) < Math.abs(a - b.off) ? c : a));
            b.shiftTo = o - b.off;
          }
        } else if (b.shiftTo !== 0 && (ahead < -5 || ahead > 30)) b.shiftTo = 0;
      }
      if (b.shift !== b.shiftTo) {
        const st = 1.4 * dt;
        b.shift = Math.abs(b.shiftTo - b.shift) < st ? b.shiftTo : b.shift + Math.sign(b.shiftTo - b.shift) * st;
        if (b.shiftTo) target = Math.min(target, 5);
      }

      // светофор: головка впереди у своей полосы, смотрит навстречу
      for (const l of this.lights) {
        const dx = l.x - b.x, dz = l.z - b.z;
        const ahead = dx * b.hx + dz * b.hz;
        if (ahead < 1 || ahead > 45) continue;
        if (Math.abs(dx * rx + dz * rz) > b.r.w / 2 + 5) continue;
        if (Math.sin(l.a) * b.hx + Math.cos(l.a) * b.hz > -0.8) continue;
        const st = lightState(l.phase);
        if (st === 'go') continue;
        const stopD = ahead - 1.5;
        // на жёлтом, если уже не остановиться, — проезжаем
        if (st === 'amber' && b.v * b.v / (2 * DEC) > stopD) continue;
        const tl = Math.max(0, stopD * 0.6 - 0.5);
        if (tl < target) { target = tl; b.wait = 'светофор'; }
      }

      if (b.stun > 0) { b.stun -= dt; target = 0; }
      b.v = b.v < target ? Math.min(target, b.v + ACC * dt) : Math.max(target, b.v - DEC * 1.6 * dt);
      // стоит долго не на светофоре (взаимная блокировка на перекрёстке) — на
      // три секунды перестаём замечать других ботов
      b.stuck = b.v < 0.2 && gap < 6 && !playerAhead ? b.stuck + dt : 0;
      if (b.stuck > 6) { b.ghost = 3; b.stuck = 0; }
      if (b.ghost > 0) b.ghost -= dt;

      // ход по звеньям
      b.s += b.v * dt;
      let guard = 8;
      while (b.s >= b.len && guard--) {
        const nx = b.next || this._choose(b);
        b.next = null;
        if (!nx || nx.dead) { b.dead = true; break; }
        b.s -= b.len;
        if (nx.r !== b.r) b.off = nx.r.ow === b.r.ow && nx.r.w === b.r.w ? b.off : this._lane(nx.r);
        b.r = nx.r; b.from = nx.from; b.dir = nx.dir;
        this._seg(b);
      }
      this._place(b, b.fresh ? 1 : Math.min(1, dt * 7));
      b.fresh = false;
    }

    if (driving) this._hit(car);
    this._draw();
  }

  // Удар с игроком: два круга вдоль кузова у каждого. Импульс — по нормали
  // касания, как у физики со стенами, только стена — бот весом в тонну.
  _hit(car) {
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    const v = car._v, p = car._p;
    for (const b of this.bots) {
      if (Math.abs(b.x - car.pos.x) > 7 || Math.abs(b.z - car.pos.z) > 7) continue;
      if (Math.abs(b.y - car.pos.y) > 2.5) continue;    // мост над улицей
      let best = null;
      for (const s of [1.45, -1.45]) for (const q of [1.3, -1.3]) {
        const cx = car.pos.x + fx * s, cz = car.pos.z + fz * s;
        const bx = b.x + b.hx * q, bz = b.z + b.hz * q;
        const dx = cx - bx, dz = cz - bz, d = Math.hypot(dx, dz);
        const depth = 1.95 - d;
        if (depth > 0 && (!best || depth > best.depth)) best = { nx: dx / (d || 1), nz: dz / (d || 1), depth };
      }
      if (!best) continue;
      const { nx, nz, depth } = best;
      // разводим: машину игрока — на 60 %, бота — смещением полосы
      p[0] += nx * depth * 0.6; p[2] += nz * depth * 0.6;
      b.shift -= (nx * -b.hz + nz * b.hx) * depth * 0.4;
      b.shiftTo = b.shift;
      const vb = b.v;
      const vn = (v[0] - b.hx * vb) * nx + (v[2] - b.hz * vb) * nz;
      if (vn < 0) {
        const k = -(1 + 0.25) * vn * (1300 / (1300 + 2000));
        v[0] += nx * k; v[2] += nz * k;
        if (-vn > 3) car.crash = Math.max(car.crash || 0, Math.min(1, -vn / 20));
        b.v = 0; b.stun = 2.5;
      }
    }
  }

  _draw() {
    const cnt = this.meshes.map(() => 0);
    const { _m: m4, _q: q, _e: e, _p: pos, _s: sc, _c: col } = this;
    for (const b of this.bots) {
      const k = b.kind, mesh = this.meshes[k], i = cnt[k]++;
      if (i >= mesh.instanceMatrix.count) continue;
      pos.set(b.x, b.y, b.z);
      e.set(-b.pitch, b.yaw, 0);
      q.setFromEuler(e);
      mesh.setMatrixAt(i, m4.compose(pos, q, sc));
      mesh.setColorAt(i, col.setHex(b.color));
    }
    this.meshes.forEach((mesh, k) => {
      mesh.count = Math.min(cnt[k], mesh.instanceMatrix.count);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
  }
}
