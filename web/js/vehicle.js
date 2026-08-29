import * as THREE from 'three';

// Модель машины. Раньше это был кинематический «велосипед»: угол руля прямо
// задавал скорость поворота, а занос был отдельной затухающей добавкой. Машина
// ехала как по рельсам, а на пределе срывалась рывком — управлять этим нельзя.
// Теперь считаем силы на шинах через углы увода: у каждой оси своя жёсткость
// и свой предел сцепления, а поворот рождается моментом от этих сил. Отсюда
// сами собой берутся снос передка, занос задка, ручник и вес в торможении.

const M      = 1380;      // масса, кг
const IZ     = 1950;      // момент инерции по рысканью
const A_AX   = 1.22;      // от центра тяжести до передней оси
const B_AX   = 1.43;      // до задней
const WHEELBASE = A_AX + B_AX;
const CF     = 84000;     // жёсткость увода передней оси, Н/рад
const CR     = 112000;     // задней — больше, иначе машина вечно в заносе
const MU     = 1.46;      // сцепление сухого асфальта
const MU_HB  = 0.42;      // задняя ось на ручнике
const P_MAX  = 215000;    // мощность, Вт
const F_MAX  = 17000;     // тяга на низах, Н
const F_BRK  = 16500;     // тормоза
const F_REV  = 6000;      // задний ход
const V_REV  = 12;        // предел заднего хода, м/с
const DRAG   = 0.62;      // аэродинамика, Н/(м/с)^2
const ROLL   = 215;       // сопротивление качению, Н
const MAX_STEER = 0.58;
const STEER_RATE = 3.4;   // как быстро доворачивается руль, рад/с
const SUB    = 1 / 240;   // шаг интегрирования

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

export class Car {
  constructor(terrain, collider) {
    this.terrain = terrain;
    this.collider = collider;
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.vLong = 0;      // вдоль корпуса, м/с
    this.vLat = 0;       // влево от корпуса, м/с
    this.yawRate = 0;
    this.steer = 0;      // текущий угол руля
    this.pitch = 0;
    this.roll = 0;
    this.wheelSpin = 0;
    this.steerVis = 0;
    this.crash = 0;
    this.slip = 0;       // насколько сорваны задние шины — для звука и следа
    this.inWater = false;
  }

  reset(x, z, yaw = 0) {
    this.pos.set(x, this.terrain.driveHeightAt(x, z), z);
    this.yaw = yaw;
    this.vLong = 0; this.vLat = 0; this.yawRate = 0;
    this.steer = 0; this.crash = 0;
  }

  get speed() { return Math.hypot(this.vLong, this.vLat); }
  get kmh() { return this.vLong * 3.6; }
  get forward() { return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }

  update(dt, input) {
    dt = Math.min(dt, 1 / 25);
    const t = this.terrain;
    this.inWater = t.driveHeightAt(this.pos.x, this.pos.z) < 0.35;

    // уклон под колёсами — продольная составляющая тяжести
    const fx0 = Math.sin(this.yaw), fz0 = Math.cos(this.yaw);
    const hF = t.driveHeightAt(this.pos.x + fx0 * 1.35, this.pos.z + fz0 * 1.35);
    const hR = t.driveHeightAt(this.pos.x - fx0 * 1.35, this.pos.z - fz0 * 1.35);
    const slopeAcc = -9.81 * clamp((hF - hR) / 2.7, -0.8, 0.8);

    // руль доворачивается за конечное время и на скорости зажимается
    const vAbs = Math.abs(this.vLong);
    const lock = MAX_STEER * (0.24 + 0.76 / (1 + vAbs * vAbs / 260));
    const want = clamp(input.steer, -1, 1) * lock;
    const dSteer = clamp(want - this.steer, -STEER_RATE * dt, STEER_RATE * dt);
    this.steer += dSteer;
    this.steerVis += (this.steer / MAX_STEER - this.steerVis) * Math.min(1, dt * 12);

    const n = Math.max(1, Math.min(12, Math.ceil(dt / SUB)));
    const h = dt / n;
    for (let k = 0; k < n; k++) this._step(h, input, slopeAcc);

    // положение
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const lx = Math.cos(this.yaw), lz = -Math.sin(this.yaw);      // влево
    this.pos.x += (fx * this.vLong + lx * this.vLat) * dt;
    this.pos.z += (fz * this.vLong + lz * this.vLat) * dt;

    this._collide(fx, fz, lx, lz);
    this._settle(fx, fz, lx, lz, dt);
    this.wheelSpin += this.vLong * dt / 0.33;
    this.crash *= Math.exp(-dt * 4);
  }

  _step(h, input, slopeAcc) {
    const vx = this.vLong, vy = this.vLat, r = this.yawRate;
    const d = this.steer;

    // Перенос веса: под тягой грузится задняя ось, под тормозом — передняя.
    // Отсюда «клюёт носом» в оттормаживании и лучше держит задок под газом.
    const axPrev = this._ax || 0;
    const load = clamp(axPrev * 0.055, -0.32, 0.32);
    const Nf = M * 9.81 * (B_AX / WHEELBASE - load);
    const Nr = M * 9.81 * (A_AX / WHEELBASE + load);

    // углы увода. На малой скорости знаменатель зажимаем, иначе на месте
    // формула взрывается и машину крутит на стоянке.
    const vsafe = Math.max(2.2, Math.abs(vx));
    const af = Math.atan2(vy + A_AX * r, vsafe) - d * Math.sign(vx >= 0 ? 1 : -1);
    const ar = Math.atan2(vy - B_AX * r, vsafe);

    const muF = this.inWater ? 0.35 : MU;
    const muR = (input.handbrake ? MU_HB : MU) * (this.inWater ? 0.28 : 1);
    const capF = muF * Nf, capR = muR * Nr;
    let Fyf = clamp(-CF * af, -capF, capF);
    let Fyr = clamp(-CR * ar, -capR, capR);
    this.slip = Math.min(1, Math.abs(-CR * ar) / Math.max(1, capR));

    // продольная сила
    let Fx = 0;
    if (input.throttle > 0) {
      const byPower = P_MAX / Math.max(4, Math.abs(vx));
      Fx = input.throttle * Math.min(F_MAX, byPower);
    } else if (input.throttle < 0) {
      Fx = vx > 0.6 ? -F_BRK : Math.max(-F_REV, -F_REV * (1 - Math.abs(vx) / V_REV));
    }
    if (input.handbrake) Fx -= Math.sign(vx) * F_BRK * 0.45;
    Fx -= Math.sign(vx) * ROLL + DRAG * vx * Math.abs(vx);
    if (this.inWater) Fx -= vx * M * 2.4;

    // круг сцепления: чем сильнее тянем, тем меньше остаётся на боковую
    const gripLeft = Math.max(0, 1 - (Math.abs(Fx) / (muR * Nr)) ** 2);
    Fyr *= 0.35 + 0.65 * Math.sqrt(gripLeft);

    const ax = Fx / M + slopeAcc + r * vy;
    const ay = (Fyf * Math.cos(d) + Fyr) / M - r * vx;
    const ar2 = (A_AX * Fyf * Math.cos(d) - B_AX * Fyr) / IZ;

    this._ax = ax;
    this.vLong = vx + ax * h;
    this.vLat = clamp(vy + ay * h, -18, 18);
    // Гаситель рыскания: без него машина на пределе уходила в бесконечную
    // карусель и вернуть её было нечем. Пока вращение близко к тому, что
    // задаёт руль, не вмешиваемся — занос остаётся управляемым.
    let rn = r + ar2 * h;
    const rWant = (vx / WHEELBASE) * Math.tan(d);
    const over = Math.abs(rn) - (Math.abs(rWant) * 1.35 + 0.30);
    if (over > 0) rn -= Math.sign(rn) * Math.min(Math.abs(rn), over * 6.5 * h);
    this.yawRate = clamp(rn, -2.6, 2.6);
    this.yaw += this.yawRate * h;

    // на почти нулевой скорости гасим болтанку
    if (Math.abs(this.vLong) < 0.22 && input.throttle === 0) {
      this.vLong = 0; this.vLat *= 0.5; this.yawRate *= 0.5;
    }
    if (this.inWater) this.vLong = clamp(this.vLong, -2.5, 2.5);
  }

  // Столкновения. Раньше скорость просто множилась на коэффициент — машина
  // липла к стене и теряла ход вдоль неё. Теперь гасим только составляющую
  // ПО НОРМАЛИ, вдоль стены оставляем скольжение и добавляем момент отскока.
  _collide(fx, fz, lx, lz) {
    let impact = 0;
    for (const s of [1.55, 0, -1.55]) {
      const probe = new THREE.Vector3(this.pos.x + fx * s, 0, this.pos.z + fz * s);
      const hit = this.collider.resolve(probe, 0.98);
      if (!hit) continue;
      this.pos.x = probe.x - fx * s;
      this.pos.z = probe.z - fz * s;
      // мировая скорость -> нормаль
      const wx = fx * this.vLong + lx * this.vLat;
      const wz = fz * this.vLong + lz * this.vLat;
      const vn = wx * hit.nx + wz * hit.nz;
      if (vn < 0) {
        impact = Math.max(impact, -vn);
        const rest = 0.22;                       // немного отскока
        const nx2 = wx - vn * (1 + rest) * hit.nx;
        const nz2 = wz - vn * (1 + rest) * hit.nz;
        const slide = 0.86;                      // трение о стену вдоль неё
        this.vLong = (nx2 * fx + nz2 * fz) * slide;
        this.vLat = (nx2 * lx + nz2 * lz) * slide;
        // удар в угол разворачивает кузов
        this.yawRate = clamp(this.yawRate + (s > 0 ? -1 : s < 0 ? 1 : 0)
          * (hit.nx * lx + hit.nz * lz) * vn * 0.10, -2.6, 2.6);
      }
    }
    if (impact > 3) this.crash = Math.min(1, impact / 20);
  }

  // Посадка по четырём колёсам: одна точка давала провал кузова и рывки крена.
  _settle(fx, fz, lx, lz, dt) {
    const t = this.terrain;
    const WB = 1.32, TR = 0.86;
    let sum = 0; const wh = [];
    for (const [a, b] of [[WB, TR], [WB, -TR], [-WB, TR], [-WB, -TR]]) {
      const wx = this.pos.x + fx * a + lx * b, wz = this.pos.z + fz * a + lz * b;
      const hh = t.driveHeightAt(wx, wz);
      wh.push(hh); sum += hh;
    }
    // подвеска: кузов идёт к опоре не мгновенно, иначе на бордюрах трясёт
    const want = sum / 4;
    this.pos.y += (want - this.pos.y) * Math.min(1, dt * 14);
    const tp = Math.atan2((wh[0] + wh[1]) / 2 - (wh[2] + wh[3]) / 2, WB * 2);
    const tr = Math.atan2((wh[0] + wh[2]) / 2 - (wh[1] + wh[3]) / 2, TR * 2);
    // клевок и крен от собственных ускорений — машина «живая» в поворотах
    const dyn = clamp((this._ax || 0) * 0.006, -0.06, 0.06);
    const rollDyn = clamp(this.yawRate * this.vLong * 0.0042, -0.09, 0.09);
    this.pitch += (tp + dyn - this.pitch) * Math.min(1, dt * 9);
    this.roll += (tr + rollDyn - this.roll) * Math.min(1, dt * 9);
  }
}

export function createCarMesh() {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: 0x93342a, roughness: 0.38, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.65, metalness: 0.2 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x2b3a44, roughness: 0.12, metalness: 0.6 });
  const lamp = new THREE.MeshStandardMaterial({ color: 0xfff2cc, emissive: 0xffe9b0, emissiveIntensity: 0.7, roughness: 0.3 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.66, 4.25), paint);
  body.position.y = 0.72;
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.28, 4.0), dark);
  skirt.position.y = 0.42;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.56, 2.15), glass);
  cabin.position.set(0, 1.31, -0.12);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 1.9), paint);
  roof.position.set(0, 1.62, -0.15);

  for (const m of [body, skirt, cabin, roof]) { m.castShadow = true; g.add(m); }

  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 16);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const [x, z] of [[0.84, 1.35], [-0.84, 1.35], [0.84, -1.3], [-0.84, -1.3]]) {
    const w = new THREE.Mesh(wheelGeo, dark);
    w.position.set(x, 0.34, z);
    w.castShadow = true;
    g.add(w); wheels.push(w);
  }
  for (const x of [-0.58, 0.58]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), lamp);
    l.position.set(x, 0.78, 2.14);
    g.add(l);
  }
  g.userData.wheels = wheels;
  return g;
}
