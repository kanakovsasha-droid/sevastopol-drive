import * as THREE from 'three';

// Фары, габариты и стоп-сигналы — ночью и в сумерках.
//
// Свет фар — ОДИН прожектор между фарами: два стоили бы вдвое на каждом
// пикселе города, а на асфальте пятна всё равно сливаются в одно. Прожектор
// стоит в сцене всегда, днём с нулевой силой: добавить или убрать источник
// света — значит пересобрать шейдеры всего города, это секундный стоп-кадр.
//
// Сами фонари машины — ореолы-спрайты поверх кузова: белые спереди, красные
// сзади, при торможении красные разгораются. Модель машины меняется (гараж),
// поэтому ореолы не вешаем на неё, а каждый кадр ставим по её матрице.
//
// Заодно приглушаем отражения на кузове: карта окружения у машины дневная,
// и ночью лак светился бы полуденным небом.

function haloTexture() {
  const S = 64, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.18, 'rgba(255,255,255,0.85)');
  gr.addColorStop(0.45, 'rgba(255,255,255,0.22)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Точки фонарей в осях машины: x — влево, y — вверх, z — вперёд (так стоит
// модель W213: длина ~5 м, ширина ~1.9 м).
const HEAD = [[0.68, 0.72, 2.38], [-0.68, 0.72, 2.38]];
const TAIL = [[0.70, 0.92, -2.47], [-0.70, 0.92, -2.47]];

export class CarLights {
  constructor(scene) {
    this.scene = scene;
    const spot = new THREE.SpotLight(0xfff0d8, 0, 95, 0.50, 0.6, 1.1);
    spot.castShadow = false;
    this.target = new THREE.Object3D();
    spot.target = this.target;
    scene.add(spot, this.target);
    this.spot = spot;

    const tex = haloTexture();
    const mk = (color, size) => {
      const m = new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      const s = new THREE.Sprite(m);
      s.scale.setScalar(size);
      s.renderOrder = 5;
      s.visible = false;
      scene.add(s);
      return s;
    };
    this.heads = HEAD.map(() => mk(0xfff6e8, 0.9));
    this.tails = TAIL.map(() => mk(0xff2010, 0.55));
    this.mesh = null;
    this.mats = [];
    this.on = 0;          // плавно, фары не щёлкают
    this.brake = 0;
    this._v = new THREE.Vector3();
    this._f = new THREE.Vector3();
  }

  // Новая модель машины — собрать её материалы с картой окружения.
  _adopt(mesh) {
    this.mesh = mesh;
    this.mats = [];
    mesh.traverse(o => {
      if (!o.isMesh) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (!m || !m.envMap) continue;
        if (m.userData.envBase == null) m.userData.envBase = m.envMapIntensity ?? 1;
        this.mats.push(m);
      }
    });
  }

  // night — 0..1 из env.js, day — сколько дневного света (для отражений),
  // shown — видно ли машину (пешком далеко, в полёте — всё равно светит).
  update(dt, mesh, car, night, day) {
    if (mesh !== this.mesh) this._adopt(mesh);
    const k = 1 - Math.exp(-dt * 4);
    this.on += ((night > 0.25 ? 1 : 0) - this.on) * k;
    const braking = (car._brake || 0) > 0.15 && Math.abs(car.vLong || 0) > 0.3;
    this.brake += ((braking ? 1 : 0) - this.brake) * (1 - Math.exp(-dt * 14));

    for (const m of this.mats) m.envMapIntensity = m.userData.envBase * (0.12 + 0.88 * day);

    const on = this.on;
    mesh.updateMatrixWorld();
    const M = mesh.matrixWorld;
    // прожектор: из-под фар вперёд и чуть вниз, на 25 м по дороге
    this.spot.intensity = on * 150;
    this.spot.position.set(0, 0.7, 2.3).applyMatrix4(M);
    this.target.position.set(0, -0.6, 24).applyMatrix4(M);
    this.target.updateMatrixWorld();

    const vis = on > 0.02;
    HEAD.forEach((p, i) => {
      const s = this.heads[i];
      s.visible = vis;
      if (!vis) return;
      s.position.set(p[0], p[1], p[2]).applyMatrix4(M);
      s.material.opacity = on;
    });
    // задние: габариты ночью, стоп-сигналы — всегда, когда тормозим
    const tail = Math.max(on * 0.55, this.brake);
    TAIL.forEach((p, i) => {
      const s = this.tails[i];
      s.visible = tail > 0.02;
      if (!s.visible) return;
      s.position.set(p[0], p[1], p[2]).applyMatrix4(M);
      s.material.opacity = tail * (night > 0.25 ? 1 : 0.5);
      s.scale.setScalar(0.5 + 0.3 * this.brake);
    });
  }
}
