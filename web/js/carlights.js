import * as THREE from 'three';

// Свет машины: выкл · габариты · ближний · дальний · авто (клавиша L).
//
// Светят сами стёкла модели. У E63 фары, задние фонари и их лампы — свои
// материалы (Mesheslights…): переднюю и заднюю группу находим по положению
// в кузове, им и задаём свечение. Раньше поверх стояли спрайты-ореолы —
// они висели в воздухе «пучками», от них отказались.
//
// Свет фар на дороге — ОДИН прожектор между фарами: два стоили бы вдвое на
// каждом пикселе города, а пятна на асфальте всё равно сливаются. Прожектор
// стоит в сцене всегда, при выключенных фарах — с нулевой силой: добавить или
// убрать источник света — пересборка шейдеров всего города, секундный стоп.
//
// Заодно приглушаем отражения на кузове: карта окружения у машины дневная,
// и ночью лак светился бы полуденным небом.

export const LIGHT_MODES = ['auto', 'off', 'parking', 'low', 'high'];
export const LIGHT_NAMES = { auto: 'авто', off: 'выключены', parking: 'габариты', low: 'ближний свет', high: 'дальний свет' };

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* приватное окно */ } },
};

export class CarLights {
  constructor(scene) {
    this.scene = scene;
    const spot = new THREE.SpotLight(0xfff0d8, 0, 95, 0.50, 0.6, 1.1);
    spot.castShadow = false;
    this.target = new THREE.Object3D();
    spot.target = this.target;
    scene.add(spot, this.target);
    this.spot = spot;
    this.mode = LIGHT_MODES.includes(ls.get('sev.lights')) ? ls.get('sev.lights') : 'auto';
    this.mesh = null;
    this.env = []; this.front = []; this.rear = [];
    this.on = 0; this.high = 0; this.park = 0; this.brake = 0;
  }

  next() {
    this.mode = LIGHT_MODES[(LIGHT_MODES.indexOf(this.mode) + 1) % LIGHT_MODES.length];
    ls.set('sev.lights', this.mode);
    return LIGHT_NAMES[this.mode];
  }

  // Новая модель машины — разобрать её материалы: отражения, передние и
  // задние фонари. Материалы клонируем: у коробочной модели и у E63 они
  // свои, но лучше не трогать то, что может быть общим.
  _adopt(mesh) {
    this.mesh = mesh;
    this.env = []; this.front = []; this.rear = [];
    const box = new THREE.Box3(), c = new THREE.Vector3();
    mesh.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
    mesh.traverse(o => {
      if (!o.isMesh) return;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) {
        if (!m) continue;
        if (m.envMap) {
          if (m.userData.envBase == null) m.userData.envBase = m.envMapIntensity ?? 1;
          this.env.push(m);
        }
        const name = m.name || '';
        // E63: лампы и стёкла фонарей; коробочная модель — светлый и красный «лампы»
        const isLamp = /lights|Red_Glass/i.test(name) || (m.emissive && m.emissiveIntensity >= 0.5 && !/speed/i.test(name));
        if (!isLamp || !m.emissive) continue;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        box.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld).applyMatrix4(inv);
        box.getCenter(c);
        if (Math.abs(c.z) < 1.6) continue;              // зеркала, салон — не фонари
        const rear = c.z < 0;
        const red = rear && (/Red|01011/i.test(name) || m.color.r > m.color.g * 1.5 || m.emissive.r > m.emissive.g * 1.5);
        m.userData.lamp = { base: m.emissive.clone(), baseI: m.emissiveIntensity, map: !!m.emissiveMap };
        // у стекла без своей картинки свечения задаём цвет сами
        // (сзади не красное — фонари заднего хода: горят только на задней)
        if (!m.emissiveMap) m.userData.lamp.col = new THREE.Color(rear ? (red ? 0xff1a0a : 0xfff8f0) : 0xfff4e6);
        (rear ? this.rear : this.front).push({ m, red });
      }
    });
  }

  // night — 0..1 из env.js, day — сколько дневного света (для отражений),
  // engine — заведён ли мотор (без него горят только габариты, если включены).
  update(dt, mesh, car, night, day) {
    if (mesh !== this.mesh) this._adopt(mesh);
    const k = 1 - Math.exp(-dt * 6);
    const engine = car.engine !== 'off';
    const mode = this.mode === 'auto' ? (night > 0.25 ? 'low' : engine ? 'drl' : 'off') : this.mode;
    const wantOn = engine && (mode === 'low' || mode === 'high') ? 1 : 0;
    const wantHigh = engine && mode === 'high' ? 1 : 0;
    const wantPark = mode === 'off' ? 0 : mode === 'drl' ? 0.35 : 1;
    this.on += (wantOn - this.on) * k;
    this.high += (wantHigh - this.high) * k;
    this.park += (wantPark - this.park) * k;
    const braking = engine && (car._brake || 0) > 0.15 && Math.abs(car.vLong || 0) > 0.3;
    this.brake += ((braking ? 1 : 0) - this.brake) * (1 - Math.exp(-dt * 14));
    this.mode_ = mode;

    for (const m of this.env) m.envMapIntensity = m.userData.envBase * (0.12 + 0.88 * day);

    // стёкла: спереди — дневные ходовые / габариты, ярче с фарами; сзади —
    // габариты, стоп-сигнал заметно ярче
    const front = 0.12 + 0.55 * this.park + 0.6 * this.on + 0.3 * this.high;
    const rear = 0.10 * this.park + 0.45 * this.park * Math.min(1, night * 2 + 0.3) + 0.9 * this.brake;
    for (const { m } of this.front) this._lamp(m, front);
    const back = engine && car.gear < 0 ? 0.8 : 0;
    for (const { m, red } of this.rear) this._lamp(m, red ? rear : back);

    // прожектор: из-под фар вперёд и чуть вниз; дальний — дальше и уже
    mesh.updateMatrixWorld();
    const M = mesh.matrixWorld;
    this.spot.intensity = this.on * (150 + 260 * this.high);
    this.spot.distance = 95 + 90 * this.high;
    this.spot.angle = 0.50 - 0.08 * this.high;
    this.spot.position.set(0, 0.5, 2.55).applyMatrix4(M);   // ниже капота: иначе блик на лаке
    this.target.position.set(0, -0.6 + 0.5 * this.high, 24 + 30 * this.high).applyMatrix4(M);
    this.target.updateMatrixWorld();
  }

  // 0 — погашено, 1 — полный свет (как задумал автор модели)
  _lamp(m, x) {
    const L = m.userData.lamp;
    if (L.col) { m.emissive.copy(L.col); m.emissiveIntensity = 3.0 * x; }
    else { m.emissive.copy(L.base); m.emissiveIntensity = Math.max(L.baseI, 1) * x; }
  }
}
