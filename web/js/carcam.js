import * as THREE from 'three';

// Камеры за рулём: виды как в Forza и GTA плюс настройки.
//
//   Погоня · Ближе · Дрифт · Издалека — камера на орбите вокруг машины;
//   С капота · Из салона — от первого лица, голова водителя сидит в кузове.
//
// Возврат за корму. Раньше его не было вовсе: на поворотах обзор «уплывал»
// сам — подкрутка шла всегда и тянула камеру даже из-под мыши. Теперь три
// варианта (настройки → Камера):
//   • «как в GTA» — мышь или правый стик ставят камеру куда угодно, а через
//     ~1.5 с без них на ходу она мягко уходит за машину;
//   • «как в Forza» — камера всегда за машиной, обзор работает, пока держишь
//     стик или двигаешь мышь, и сразу возвращается;
//   • «не возвращать» — как было: только клавиша V.
// Дрифт-камера смотрит не вдоль кузова, а вдоль скорости: в заносе машину
// видно боком, как в Forza, а не камера крутится вместе с кормой.

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const wrapPi = a => Math.atan2(Math.sin(a), Math.cos(a));
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* приватное окно */ } },
};
const KEY = 'sev.cam';

// back — сколько метров за целью, aim — высота цели над дорогой,
// pitch — подъём камеры по умолчанию. fp — от первого лица: eye — точка
// глаза в осях машины (x — влево, y — вверх, z — вперёд).
export const VIEWS = [
  { id: 'chase', name: 'Погоня', back: 6.8, aim: 1.50, pitch: 0.20 },
  { id: 'near',  name: 'Ближе',  back: 4.7, aim: 1.35, pitch: 0.18 },
  { id: 'drift', name: 'Дрифт',  back: 7.6, aim: 1.40, pitch: 0.16, drift: true },
  { id: 'hood',  name: 'С капота', fp: true, eye: [0, 1.30, 0.55], fov: 68 },
  { id: 'cabin', name: 'Из салона', fp: true, eye: [0.36, 1.14, -0.18], fov: 72, cabin: true },
  { id: 'far',   name: 'Издалека', back: 12.5, aim: 1.80, pitch: 0.30 },
];
export const FOLLOW = { gta: 'Как в GTA', forza: 'Как в Forza', off: 'Не возвращать' };

const PITCH_MIN = -0.35, PITCH_MAX = 1.31;

export class CarCam {
  constructor({ terrain, collider }) {
    this.terrain = terrain; this.collider = collider;
    const s = JSON.parse(ls.get(KEY) || '{}');
    this.cfg = {
      follow: FOLLOW[s.follow] ? s.follow : 'gta',
      delay: s.delay ?? 1.5,       // через сколько секунд без мыши камера уходит за машину
      stiff: s.stiff ?? 3.0,       // как быстро догоняет (1/с)
      fov: s.fov ?? 62,            // угол обзора снаружи
      fpFov: s.fpFov ?? 72,        // от первого лица
      speedFov: s.speedFov ?? true,// на скорости угол шире — ощущение скорости
      dist: s.dist ?? 1,           // множитель расстояния
      height: s.height ?? 0,       // поднять/опустить, метры
      lean: s.lean ?? true,        // из салона: взгляд в поворот
      shake: s.shake ?? true,
    };
    this.view = clamp(+s.view || 0, 0, VIEWS.length - 1);
    this.yaw = 0; this.pitch = VIEWS[this.view].pitch ?? 0.2;   // орбита, мировые углы
    this.lookYaw = 0; this.lookPitch = 0;                       // от первого лица — относительно кузова
    this.zoom = 1;
    this.idle = 99;                                             // секунд без мыши и стика
    this.velYaw = null;
    this.pos = new THREE.Vector3(); this.look = new THREE.Vector3();
    this.first = true;
    this._q = new THREE.Quaternion(); this._e = new THREE.Euler(0, 0, 0, 'YXZ');
    this._v = new THREE.Vector3(); this._aim = new THREE.Vector3(); this._want = new THREE.Vector3();
  }

  save() { ls.set(KEY, JSON.stringify({ ...this.cfg, view: this.view })); }
  get v() { return VIEWS[this.view]; }
  get inside() { return !!this.v.cabin; }
  get name() { return this.v.name; }

  next() { this.setView((this.view + 1) % VIEWS.length); }
  setView(i) {
    this.view = clamp(i, 0, VIEWS.length - 1);
    this.lookYaw = 0; this.lookPitch = 0;
    if (!this.v.fp) this.pitch = this.v.pitch;
    this.first = true;
    this.save();
  }
  // V — камера за корму
  reset(car) { this.yaw = car.yaw; this.pitch = this.v.pitch ?? 0.2; this.lookYaw = 0; this.lookPitch = 0; this.zoom = 1; this.idle = 99; }
  // поставить сразу за машиной (спавн, прыжок)
  snap(car) { this.reset(car); this.first = true; }
  wheel(dy) { this.zoom = clamp(this.zoom + dy * 0.012, 0.45, 3.2); }

  // Мышь и правый стик: смещение «в пикселях мыши».
  lookBy(dx, dy, sens) {
    this.idle = 0;
    if (this.v.fp) {
      this.lookYaw = clamp(this.lookYaw - dx * sens, -2.4, 2.4);
      this.lookPitch = clamp(this.lookPitch - dy * sens, -0.9, 0.7);
    } else {
      this.yaw = wrapPi(this.yaw - dx * sens);
      this.pitch = clamp(this.pitch + dy * sens, PITCH_MIN, PITCH_MAX);
    }
  }

  // Насколько сейчас тянуть камеру за машину, 1/с (0 — не тянуть).
  _pull(speed) {
    const c = this.cfg;
    if (c.follow === 'off') return 0;
    if (c.follow === 'forza') return this.idle < 0.25 ? 0 : c.stiff * 1.6;
    // GTA: ждём паузу, потом плавно набираем силу; стоя на месте — не трогаем
    if (this.idle < c.delay || speed < 1.5) return 0;
    return c.stiff * clamp((this.idle - c.delay) / 0.8, 0, 1) * clamp(speed / 6, 0.3, 1);
  }

  update(dt, camera, car) {
    this.idle += dt;
    const v = this.v, c = this.cfg;
    const speed = Math.hypot(car.vLong, car.vLat);
    // направление скорости в мире: вперёд (sin, cos), влево (cos, −sin)
    const sy = Math.sin(car.yaw), cy = Math.cos(car.yaw);
    const vx = sy * car.vLong + cy * car.vLat, vz = cy * car.vLong - sy * car.vLat;
    const vy = speed > 0.5 ? Math.atan2(vx, vz) : car.yaw;
    this.velYaw = this.velYaw == null ? vy : this.velYaw + wrapPi(vy - this.velYaw) * (1 - Math.exp(-dt * 6));

    // угол обзора: на скорости чуть шире
    const kmh = Math.abs(car.vLong) * 3.6;
    const fov = (v.fp ? c.fpFov : c.fov) + (c.speedFov ? 9 * clamp((kmh - 40) / 200, 0, 1) : 0);
    const near = v.fp ? 0.1 : 0.4;
    if (Math.abs(camera.fov - fov) > 0.05 || camera.near !== near) {
      camera.fov += (fov - camera.fov) * (this.first ? 1 : 1 - Math.exp(-dt * 3));
      camera.near = near;
      camera.updateProjectionMatrix();
    }

    if (v.fp) return this._fp(dt, camera, car);

    // ---- возврат за машину
    let target = car.yaw;
    if (v.drift && speed > 4 && car.vLong > 0) {
      // смотрим вдоль скорости, но не дальше 75° от кузова — иначе в развороте
      // машина уходит из кадра
      const d = clamp(wrapPi(this.velYaw - car.yaw), -1.3, 1.3);
      target = car.yaw + d * 0.85;
    }
    if (this.first) { this.yaw = target; }
    const pull = this._pull(speed);
    if (pull > 0) {
      const k = 1 - Math.exp(-dt * pull);
      this.yaw = wrapPi(this.yaw + wrapPi(target - this.yaw) * k);
      this.pitch += ((v.pitch ?? 0.2) - this.pitch) * k * 0.6;
    }
    this.pitch = clamp(this.pitch, PITCH_MIN, PITCH_MAX);

    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const aim = this._aim.set(car.pos.x, car.pos.y + v.aim + c.height * 0.5, car.pos.z);
    const speedPull = clamp(Math.abs(car.vLong) / 55, 0, 1);
    const R = v.back * (1 + speedPull * 0.18) * this.zoom * c.dist;
    const want = this._want.set(aim.x - fx * R * cp, aim.y + R * sp + c.height * 0.5, aim.z - fz * R * cp);
    // земля и стены: подтягиваем камеру к цели, пока не выйдет из препятствия
    const T = this.terrain;
    want.y = Math.max(want.y, T.gridHeightAt(want.x, want.z) + 0.9);
    for (let i = 0; i < 3; i++) {
      const probe = this._v.set(want.x, 0, want.z);
      if (!this.collider.resolve(probe, 0.6)) break;
      want.lerp(aim, 0.32);
      want.y = Math.max(want.y, T.gridHeightAt(want.x, want.z) + 0.9);
    }
    // Сглаживаем только положение: цель точная, мышь двигает картинку один в один.
    const k = this.first ? 1 : 1 - Math.exp(-dt * 11);
    this.pos.lerp(want, k);
    this.first = false;
    camera.position.copy(this.pos);
    if (c.shake && car.crash > 0.02) {
      const s = car.crash * 0.35;
      camera.position.x += (Math.random() - 0.5) * s;
      camera.position.y += (Math.random() - 0.5) * s;
    }
    camera.up.set(0, 1, 0);          // крена нет: горизонт всегда ровный
    camera.lookAt(aim);
  }

  // От первого лица: голова в кузове, вертится и кренится вместе с ним
  // (крен — вполовину, иначе укачивает), взгляд можно отвести мышью.
  _fp(dt, camera, car) {
    const v = this.v, c = this.cfg;
    // возврат взгляда вперёд — по тем же правилам, но быстрее
    const pull = c.follow === 'off' ? 0 : c.follow === 'forza' ? (this.idle < 0.25 ? 0 : 6) : (this.idle < c.delay ? 0 : 4);
    if (pull) {
      const k = 1 - Math.exp(-dt * pull);
      this.lookYaw += (0 - this.lookYaw) * k;
      this.lookPitch += (0 - this.lookPitch) * k;
    }
    // из салона голова чуть смотрит в поворот (как в жизни — на апекс)
    const lean = v.cabin && c.lean ? clamp((car.yawRate || 0) * 0.28, -0.32, 0.32) : 0;
    this._lean = (this._lean || 0) + (lean - (this._lean || 0)) * (1 - Math.exp(-dt * 4));

    this._e.set(car.pitch, car.yaw, car.roll * 0.5, 'YXZ');
    this._q.setFromEuler(this._e);
    const eye = this._v.set(v.eye[0], v.eye[1] + c.height * 0.3, v.eye[2]).applyQuaternion(this._q).add(car.pos);
    camera.position.copy(eye);
    if (c.shake && car.crash > 0.02) {
      const s = car.crash * 0.08;
      camera.position.x += (Math.random() - 0.5) * s;
      camera.position.y += (Math.random() - 0.5) * s;
    }
    // камера Three смотрит вдоль −Z, машина — вдоль +Z: разворот на π
    camera.quaternion.copy(this._q);
    camera.rotateY(Math.PI + this.lookYaw + this._lean);
    camera.rotateX(this.lookPitch - 0.04);
    this.pos.copy(camera.position);
    this.yaw = car.yaw;              // выйдем в орбиту — окажемся за кормой
    this.first = false;
  }
}
