import * as THREE from 'three';

const WHEELBASE = 2.65;
const MAX_STEER = 0.62;
// Тяга и сопротивление подобраны так, чтобы равновесие наступало около
// 58 м/с — это ~210 км/ч. Разгон заметно резче прежнего.
const ENGINE = 18.5;
const REVERSE = 7.0;
const BRAKE = 24;
const DRAG_AIR = 0.0019;
const DRAG_ROLL = 0.11;
const GRIP = 6.2;
const GRIP_HANDBRAKE = 1.1;

export class Car {
  constructor(terrain, collider) {
    this.terrain = terrain;
    this.collider = collider;
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.vLong = 0;      // скорость вдоль корпуса, м/с
    this.vLat = 0;       // занос
    this.pitch = 0;
    this.roll = 0;
    this.wheelSpin = 0;
    this.steerVis = 0;
    this.crash = 0;      // затухающий «удар» для тряски камеры
    this.inWater = false;
  }

  reset(x, z, yaw = 0) {
    this.pos.set(x, this.terrain.driveHeightAt(x, z), z);
    this.yaw = yaw; this.vLong = 0; this.vLat = 0; this.crash = 0;
  }

  get speed() { return Math.hypot(this.vLong, this.vLat); }
  get kmh() { return this.vLong * 3.6; }
  get forward() { return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }

  update(dt, input) {
    dt = Math.min(dt, 1 / 30);
    const t = this.terrain;

    // уклон под колёсами: разница высот спереди и сзади
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const hF = t.driveHeightAt(this.pos.x + fx * 1.35, this.pos.z + fz * 1.35);
    const hR = t.driveHeightAt(this.pos.x - fx * 1.35, this.pos.z - fz * 1.35);
    const sinPitch = Math.max(-0.8, Math.min(0.8, (hF - hR) / 2.7));
    const slopeAcc = -9.81 * sinPitch;

    this.inWater = t.driveHeightAt(this.pos.x, this.pos.z) < 0.35;

    // продольная динамика
    let acc = 0;
    if (input.throttle > 0) acc += ENGINE * input.throttle * (1 - Math.min(0.72, Math.abs(this.vLong) / 82));
    if (input.throttle < 0) {
      acc += this.vLong > 0.5 ? -BRAKE : REVERSE * input.throttle;
    }
    if (input.handbrake) acc -= Math.sign(this.vLong) * BRAKE * 0.55;
    acc += slopeAcc;
    acc -= DRAG_AIR * this.vLong * Math.abs(this.vLong) + DRAG_ROLL * this.vLong;
    if (this.inWater) acc -= this.vLong * 3.2;

    this.vLong += acc * dt;
    if (input.throttle === 0 && !input.handbrake && Math.abs(this.vLong) < 0.25) this.vLong = 0;
    if (this.inWater) this.vLong = Math.max(-2.5, Math.min(2.5, this.vLong));

    // руль: на скорости выкручивается меньше, иначе машина «ломается» в поворотах
    const steerMax = MAX_STEER * (1 - 0.72 * Math.min(1, Math.abs(this.vLong) / 52));
    const steer = input.steer * steerMax;
    this.steerVis += (steer - this.steerVis) * Math.min(1, dt * 11);

    const yawRate = (this.vLong / WHEELBASE) * Math.tan(steer);
    this.yaw += yawRate * dt;

    // занос: инерция тянет наружу поворота, шины сопротивляются
    const grip = input.handbrake ? GRIP_HANDBRAKE : GRIP;
    this.vLat += -yawRate * this.vLong * dt;
    this.vLat *= Math.exp(-grip * dt);
    this.vLat = Math.max(-14, Math.min(14, this.vLat));

    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    this.pos.x += (fx * this.vLong + rx * this.vLat) * dt;
    this.pos.z += (fz * this.vLong + rz * this.vLat) * dt;

    // столкновения: три окружности вдоль корпуса — двумя углы пролезали сквозь стены
    let impact = 0;
    for (const s of [1.55, 0, -1.55]) {
      const probe = new THREE.Vector3(this.pos.x + fx * s, 0, this.pos.z + fz * s);
      const hit = this.collider.resolve(probe, 0.98);
      if (hit) {
        this.pos.x = probe.x - fx * s;
        this.pos.z = probe.z - fz * s;
        const vn = fx * hit.nx + fz * hit.nz;     // насколько удар в лоб
        impact = Math.max(impact, Math.abs(this.vLong) * Math.abs(vn));
        this.vLong *= vn * this.vLong < 0 ? -0.18 : 0.55;
        this.vLat *= 0.4;
      }
    }
    if (impact > 3) this.crash = Math.min(1, impact / 22);
    this.crash *= Math.exp(-dt * 4);

    // Посадка по четырём колёсам, а не по одной точке: на бордюре и уклоне
    // одна точка даёт провал кузова и рывки крена.
    const WB = 1.32, TR = 0.86;
    let sum = 0;
    const wh = [];
    for (const [a, b] of [[WB, TR], [WB, -TR], [-WB, TR], [-WB, -TR]]) {
      const wx = this.pos.x + fx * a + rx * b, wz = this.pos.z + fz * a + rz * b;
      const h = t.driveHeightAt(wx, wz);
      wh.push(h); sum += h;
    }
    this.pos.y = sum / 4;
    const targetPitch = Math.atan2((wh[0] + wh[1]) / 2 - (wh[2] + wh[3]) / 2, WB * 2);
    const targetRoll = Math.atan2((wh[0] + wh[2]) / 2 - (wh[1] + wh[3]) / 2, TR * 2);
    this.pitch += (targetPitch - this.pitch) * Math.min(1, dt * 9);
    this.roll += (targetRoll - this.roll) * Math.min(1, dt * 9);

    this.wheelSpin += this.vLong * dt / 0.33;
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
