import * as THREE from 'three';

// Модель машины. Была попытка считать силы на шинах через углы увода — она
// давала «честный» занос, но ездить стало нельзя: машину срывало в вращение
// на обычном повороте. Вернулись к первой модели — кинематический велосипед:
// угол руля напрямую задаёт скорость поворота, а занос живёт отдельной
// затухающей добавкой. Машина всегда едет туда, куда смотрит нос, срыв даёт
// только ручник. Всё, что нарабатывалось после (посадка на четыре колеса,
// подвеска, полёт, скольжение вдоль стены, высота полотна), оставлено.

const WHEELBASE = 2.65;
const MAX_STEER = 0.62;
// Тяга и сопротивление подобраны так, чтобы равновесие наступало около
// 58 м/с — это ~210 км/ч.
const ENGINE = 18.5;
const REVERSE = 7.0;
const BRAKE = 24;
const DRAG_AIR = 0.0019;
const DRAG_ROLL = 0.11;
const GRIP = 6.2;             // как быстро гаснет занос
const GRIP_HANDBRAKE = 1.1;   // с ручником задок живёт своей жизнью
// Полотно дороги рисуется на 0.14 м ВЫШЕ рельефа (ROAD_Y в worldgen), а колёса
// опрашивали голый рельеф — машина проваливалась в асфальт, а на переломах
// профиля кузов не совпадал с дорогой и повисал.
const ROAD_LIFT = 0.145;

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
    this.wheelDrop = [0, 0, 0, 0];   // ход подвески по каждому колесу
    this.vy = 0;         // вертикальная скорость: прыжки и съезды с бордюра
    this.airborne = false;
    this.inWater = false;
  }

  reset(x, z, yaw = 0) {
    this.pos.set(x, this.terrain.driveHeightAt(x, z) + ROAD_LIFT, z);
    this.yaw = yaw;
    this.vLong = 0; this.vLat = 0; this.yawRate = 0;
    this.steer = 0; this.crash = 0; this.vy = 0; this.airborne = false;
  }

  get speed() { return Math.hypot(this.vLong, this.vLat); }
  get kmh() { return this.vLong * 3.6; }
  get forward() { return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }

  update(dt, input) {
    dt = Math.min(dt, 1 / 25);
    const t = this.terrain;
    this.inWater = t.driveHeightAt(this.pos.x, this.pos.z) < 0.35;

    // уклон под колёсами: разница высот спереди и сзади
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const hF = t.driveHeightAt(this.pos.x + fx * 1.35, this.pos.z + fz * 1.35);
    const hR = t.driveHeightAt(this.pos.x - fx * 1.35, this.pos.z - fz * 1.35);
    const slopeAcc = -9.81 * clamp((hF - hR) / 2.7, -0.8, 0.8);

    // ---- продольная динамика
    let acc = 0;
    if (!this.airborne) {
      if (input.throttle > 0) acc += ENGINE * input.throttle * (1 - Math.min(0.72, Math.abs(this.vLong) / 82));
      if (input.throttle < 0) acc += this.vLong > 0.5 ? -BRAKE : REVERSE * input.throttle;
      if (input.handbrake) acc -= Math.sign(this.vLong) * BRAKE * 0.55;
    }
    acc += slopeAcc;
    acc -= DRAG_AIR * this.vLong * Math.abs(this.vLong) + DRAG_ROLL * this.vLong;
    if (this.inWater) acc -= this.vLong * 3.2;
    this._ax = acc;

    this.vLong += acc * dt;
    if (input.throttle === 0 && !input.handbrake && Math.abs(this.vLong) < 0.25) this.vLong = 0;
    if (this.inWater) this.vLong = clamp(this.vLong, -2.5, 2.5);

    // ---- руль: на скорости выкручивается меньше, иначе машина «ломается»
    const steerMax = MAX_STEER * (1 - 0.72 * Math.min(1, Math.abs(this.vLong) / 52));
    const steer = clamp(input.steer, -1, 1) * steerMax;
    this.steer = steer;
    this.steerVis += (steer - this.steerVis) * Math.min(1, dt * 11);

    // ---- поворот. Скорость рыскания задаёт РУЛЬ, а не момент сил на осях:
    // именно поэтому машина никогда не уходит в неуправляемое вращение.
    const yawRate = this.airborne ? this.yawRate * 0.98 : (this.vLong / WHEELBASE) * Math.tan(steer);
    this.yawRate = yawRate;
    this.yaw += yawRate * dt;

    // ---- занос: инерция тянет наружу поворота, шины сопротивляются
    const grip = input.handbrake ? GRIP_HANDBRAKE : GRIP;
    this.vLat += -yawRate * this.vLong * dt;
    this.vLat *= Math.exp(-grip * dt);
    this.vLat = clamp(this.vLat, -14, 14);

    const lx = Math.cos(this.yaw), lz = -Math.sin(this.yaw);      // влево
    this.pos.x += (fx * this.vLong + lx * this.vLat) * dt;
    this.pos.z += (fz * this.vLong + lz * this.vLat) * dt;

    this._collide(fx, fz, lx, lz);
    this._settle(fx, fz, lx, lz, dt);
    this.wheelSpin += this.vLong * dt / 0.33;
    this.crash *= Math.exp(-dt * 4);
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
      const hh = t.driveHeightAt(wx, wz) + ROAD_LIFT;
      wh.push(hh); sum += hh;
    }
    // Полёт. Раньше высота просто присваивалась по земле: сойдя с бордюра или
    // с обрыва, машина мгновенно телепортировалась вниз, а на трамплине
    // втыкалась в склон. Теперь есть вертикальная скорость: пока опора ниже
    // кузова, машина падает по тяжести; коснувшись — садится и гасит удар.
    const groundY = sum / 4;
    if (this.pos.y > groundY + 0.06) {
      this.airborne = true;
      this.vy -= 9.81 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= groundY) { this.pos.y = groundY; this.vy = 0; this.airborne = false; }
    } else {
      if (this.airborne && this.vy < -4) this.crash = Math.min(1, -this.vy / 16);
      this.pos.y = groundY; this.vy = 0; this.airborne = false;
    }
    // Знак: rotateX(+) в Three ОПУСКАЕТ нос (точка при z>0 уходит вниз на
    // -z*sin). Раньше сюда клали угол как есть, и на подъёме машина клевала
    // носом вниз, а на спуске задирала — колёса отрывались на любом уклоне.
    const tp = -Math.atan2((wh[0] + wh[1]) / 2 - (wh[2] + wh[3]) / 2, WB * 2);
    const tr = Math.atan2((wh[0] + wh[2]) / 2 - (wh[1] + wh[3]) / 2, TR * 2);
    // лёгкий клевок и крен от собственных ускорений, но так, чтобы кузов
    // не заваливало: ограничение в пару градусов
    const dyn = clamp((this._ax || 0) * 0.0035, -0.030, 0.030);
    const rollDyn = clamp(this.yawRate * this.vLong * 0.0022, -0.045, 0.045);
    // Наклон должен догонять землю почти мгновенно: при медленном сглаживании
    // кузов не успевал за переломом профиля, и колёса отрывались на треть метра.
    this.pitch += (clamp(tp, -0.45, 0.45) + dyn - this.pitch) * Math.min(1, dt * 26);
    this.roll += (clamp(tr, -0.35, 0.35) + rollDyn - this.roll) * Math.min(1, dt * 26);

    // НЕЗАВИСИМАЯ ПОДВЕСКА. Кузов — жёсткая плита, а земля под четырьмя точками
    // почти никогда не плоская: на седловине два колеса неизбежно повисают,
    // сколько ни подбирай высоту и наклон. Поэтому колёса ходят вертикально
    // сами: считаем, где оказалось колесо по плоскости кузова, и опускаем его
    // до земли. Ход ограничен, иначе на бордюре колесо уедет внутрь арки.
    const sp = Math.sin(this.pitch), sr = Math.sin(this.roll);
    for (let i = 0; i < 4; i++) {
      const a = i < 2 ? WB : -WB, b = (i % 2 === 0) ? TR : -TR;
      const planeY = this.pos.y - sp * a + sr * b;
      const want2 = wh[i] - planeY;                       // сколько не хватает до земли
      const tgt = clamp(want2, -0.40, 0.40);   // ход подвески
      this.wheelDrop[i] += (tgt - this.wheelDrop[i]) * Math.min(1, dt * 22);
    }
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
