import * as THREE from 'three';

// Дым из-под колёс: бёрнаут, пробуксовка, занос. Одна инстанс-сетка на все
// клубы — один вызов отрисовки, сколько бы их ни было. Клуб всегда смотрит
// в камеру: разворот считается в вершинном шейдере, процессор только двигает
// центры и раздаёт размер и прозрачность.

const MAX = 360;

function puffTexture() {
  const S = 64, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, S, S);
  // неровный край: несколько пятен поверх, иначе клуб — идеальный шар
  for (let i = 0; i < 14; i++) {
    const x = S / 2 + (Math.random() - 0.5) * S * 0.5, y = S / 2 + (Math.random() - 0.5) * S * 0.5;
    const r = S * (0.12 + Math.random() * 0.14);
    const gg = c.createRadialGradient(x, y, 0, x, y, r);
    gg.addColorStop(0, 'rgba(255,255,255,0.35)'); gg.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gg; c.fillRect(0, 0, S, S);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class TireSmoke {
  constructor(scene) {
    const geo = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(1, 1);
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    geo.setAttribute('uv', base.getAttribute('uv'));
    this.pos = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.alpha = new Float32Array(MAX);
    this.rot = new Float32Array(MAX);
    this.aPos = new THREE.InstancedBufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.InstancedBufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.InstancedBufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    this.aRot = new THREE.InstancedBufferAttribute(this.rot, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aPos', this.aPos);
    geo.setAttribute('aSize', this.aSize);
    geo.setAttribute('aAlpha', this.aAlpha);
    geo.setAttribute('aRot', this.aRot);
    geo.instanceCount = MAX;
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: puffTexture() }, tint: { value: new THREE.Color(0.86, 0.86, 0.85) } },
      vertexShader: `
        attribute vec3 aPos; attribute float aSize; attribute float aAlpha; attribute float aRot;
        varying vec2 vUv; varying float vA;
        void main() {
          vUv = uv; vA = aAlpha;
          vec4 mv = modelViewMatrix * vec4(aPos, 1.0);
          float c = cos(aRot), s = sin(aRot);
          vec2 q = vec2(c * position.x - s * position.y, s * position.x + c * position.y);
          mv.xy += q * aSize;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D map; uniform vec3 tint;
        varying vec2 vUv; varying float vA;
        void main() {
          float a = texture2D(map, vUv).a * vA;
          if (a < 0.004) discard;
          gl_FragColor = vec4(tint, a);
        }`,
      transparent: true, depthWrite: false,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
    // частицы: скорость, возраст, срок, начальный размер, рост, прозрачность
    this.vel = new Float32Array(MAX * 3);
    this.age = new Float32Array(MAX).fill(1e9);
    this.life = new Float32Array(MAX).fill(1);
    this.s0 = new Float32Array(MAX);
    this.grow = new Float32Array(MAX);
    this.a0 = new Float32Array(MAX);
    this.spin = new Float32Array(MAX);
    this.next = 0;
    this.carry = [0, 0, 0, 0];
  }

  emit(x, y, z, vx, vy, vz, k) {
    const i = this.next; this.next = (this.next + 1) % MAX;
    const j = (Math.random() - 0.5) * 0.4;
    this.pos[i * 3] = x + j; this.pos[i * 3 + 1] = y + 0.12; this.pos[i * 3 + 2] = z - j;
    this.vel[i * 3] = vx + (Math.random() - 0.5) * 1.6;
    this.vel[i * 3 + 1] = vy + 0.5 + Math.random() * 0.7;
    this.vel[i * 3 + 2] = vz + (Math.random() - 0.5) * 1.6;
    this.age[i] = 0;
    this.life[i] = 1.8 + Math.random() * 1.6;
    this.s0[i] = 0.5 + Math.random() * 0.3;
    this.grow[i] = 1.3 + Math.random() * 0.9;
    this.a0[i] = (0.22 + Math.random() * 0.14) * Math.min(1, 0.5 + k);
    this.rot[i] = Math.random() * 6.28;
    this.spin[i] = (Math.random() - 0.5) * 0.8;
  }

  // car: физика (slipVel, contact, _fz, скорость); dt — кадр
  update(dt, car) {
    dt = Math.min(dt, 0.1);
    if (car) {
      const v = car._v || [0, 0, 0];
      for (let w = 0; w < 4; w++) {
        if (!(car._fz && car._fz[w] > 0)) continue;
        const sv = car.slipVel[w];
        // дымит, когда пятно скользит быстрее 4 м/с; бёрнаут — гуще всего
        const k = Math.min(1.5, Math.max(0, (sv - 4) / 9));
        if (k <= 0) continue;
        this.carry[w] += dt * k * (car.burnout ? 38 : 26);
        const c = car.contact[w];
        while (this.carry[w] >= 1) {
          this.carry[w] -= 1;
          // клуб уносится с машиной лишь отчасти — шлейф остаётся позади
          this.emit(c[0], c[1], c[2], v[0] * 0.25, 0, v[2] * 0.25, k);
        }
      }
    }
    for (let i = 0; i < MAX; i++) {
      const a = this.age[i] += dt;
      if (a >= this.life[i]) { this.alpha[i] = 0; this.size[i] = 0; continue; }
      const u = a / this.life[i];
      const drag = Math.exp(-dt * 1.6);
      this.vel[i * 3] *= drag; this.vel[i * 3 + 2] *= drag;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * Math.exp(-dt * 0.9) + 0.25 * dt;   // тёплый дым поднимается
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = this.s0[i] + this.grow[i] * Math.sqrt(a) * 1.6;
      this.alpha[i] = this.a0[i] * Math.min(1, a / 0.12) * (1 - u) * (1 - u);
      this.rot[i] += this.spin[i] * dt;
    }
    this.aPos.needsUpdate = true; this.aSize.needsUpdate = true;
    this.aAlpha.needsUpdate = true; this.aRot.needsUpdate = true;
  }
}
