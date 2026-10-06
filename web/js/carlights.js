import * as THREE from 'three';
import { ENV } from './env.js?v=86fd2580';

// Свет машины: выкл · габариты · ближний · дальний · авто (клавиша L).
//
// Светят сами детали модели — фары и фонари. Какие именно, задано ЯВНЫМ
// списком имён материалов (LAMPS ниже), положение в кузове — только проверка.
// Раньше светящиеся материалы искались «по положению» среди всех, у кого есть
// emissive, а emissiveIntensity у MeshStandardMaterial по умолчанию 1 — то
// есть «лампой» оказывался любой материал у носа или кормы: решётка, бампер,
// хром, диффузор и насадки выхлопа загорались белым, а сами фары (под общим
// с окнами стеклом) — едва-едва.
//
// У E63 W213 фары и фонари разложены по своим материалам в
// models/e63/prep.py (у автора стекло фары было общим с окнами, линза
// ближнего — в одном материале с ДХО, третий стоп — с задними полосами).
//
// Свет фар на дороге — ОДИН прожектор между фарами: два стоили бы вдвое на
// каждом пикселе города, а пятна на асфальте всё равно сливаются. Прожектор
// стоит в сцене всегда, при выключенных фарах — с нулевой силой: добавить или
// убрать источник света — пересборка шейдеров всего города, секундный стоп.
//
// Форму луча задаёт не конус, а проецируемая текстура (spot.map, «маска
// фары»): у круглого конуса нет ни резкой верхней границы, ни распределения
// силы света, и пятно ложится у самого бампера. В текстуре — светораспределение
// как у настоящей фары по правилам ЕЭК: ближний обрезан горизонтальной линией
// чуть ниже горизонта (асфальт освещён метров на 45–50) с подъёмом 15° вправо
// — к обочине своей стороны; сила света растёт к линии отсечки, чтобы дальний
// край дороги не тонул (освещённость земли падает как куб расстояния). Дальний
// — узкий яркий пучок вдоль горизонта поверх ближнего, на 100–150 м. Затухание
// физическое (1/r²). Текстура у прожектора есть всегда, меняется только какая —
// иначе снова пересборка шейдеров.
//
// Мокрый асфальт: блики от фар считает шейдер дороги (materials.js) по
// ENV.uHead* — положению фар, их силе и той же маске луча.
//
// Заодно приглушаем отражения на кузове: карта окружения у машины дневная,
// и ночью лак светился бы полуденным небом.

export const LIGHT_MODES = ['auto', 'off', 'parking', 'low', 'high'];
export const LIGHT_NAMES = { auto: 'авто', off: 'выключены', parking: 'габариты', low: 'ближний свет', high: 'дальний свет' };

// Роль каждой светящейся детали. Всё, чего нет в списке, не светится никогда.
//   drl — светодиодные полосы ДХО (они же габариты спереди)
//   lens — линзы ближнего, high — блок дальнего, headGlass — стекло фары
//   tail — задние габариты (они же стоп ярче), tailInner / tailGlass —
//   красный рассеиватель и наружное стекло фонаря, stop3 — третий стоп,
//   reverse / reverseGlass — секция заднего хода
export const LAMPS = {
  // W213 — имена из models/e63/prep.py
  lamp_drl: 'drl', lamp_drl_guide: 'drl', lamp_lens: 'lens', lamp_high: 'high',
  lamp_glass_front: 'headGlass',
  lamp_tail: 'tail', lamp_tail_inner: 'tailInner', lamp_tail_glass: 'tailGlass',
  lamp_stop3: 'stop3', lamp_reverse: 'reverse', lamp_reverse_glass: 'reverseGlass',
  // W212 (data/models/w212.glb) — имена автора модели
  'Material.006': 'drl', 'Material.007': 'drl',          // светодиодные полосы в бампере
  Projector_Lights: 'lens', M_0132_LightGray: 'high',
  'Material.002': 'headGlass', 'Material.004': 'headGlass',
  Color_A06: 'tail', Color_A21: 'tailInner', Taillight_Glass: 'tailGlass',
  Material: 'reverse', 'Material.015': 'reverse',
};
const FRONT = new Set(['drl', 'lens', 'high', 'headGlass']);
// цвет свечения: ДХО — холодный светодиод, линзы — чуть теплее, сзади красный
const COLOR = {
  drl: 0xeef4ff, lens: 0xfff6ea, high: 0xf4f8ff, headGlass: 0xf4f8ff,
  tail: 0xff0a00, tailInner: 0xff0a00, tailGlass: 0xff1000, stop3: 0xff0a00,
  reverse: 0xfffaf2, reverseGlass: 0xfffaf2,
};

// ---------------------------------------------------------------- маска фары
// Ось прожектора опущена на PITCH от горизонта машины, полуугол конуса ANGLE:
// верх конуса — выше горизонта (дальний), по бокам на горизонте — ±45°.
const ANGLE = 0.80, PITCH = 0.10;
const LAMP_H = 0.5;                       // высота прожектора в кузове, м
const ROAD_H = 0.55;                      // он же над асфальтом (кузов на 5 см выше точки дороги, замерено)
const D = Math.PI / 180;
const CUT = -Math.atan(ROAD_H / 46);      // отсечка ближнего: асфальт до ~46 м
const BW = 256, BH = 1024;
const BEAM_I = 2.4e5;                     // сила света в максимуме маски ближнего, кд                // по высоте мельче: отсечка — доли градуса

// Сила света ближнего в направлении (e — угол места, a — азимут, вправо +), 0..1.
function lowBeam(e, a) {
  // слева (встречная полоса) отсечка ровная, справа поднимается под 15° на 1°
  const cut = CUT + Math.min(Math.max(a, 0), 3.7 * D) * Math.tan(15 * D);
  const edge = smoothstep(cut + 0.07 * D, cut - 0.07 * D, e);
  // по высоте: точка дороги, куда смотрит луч, — d = h / tg(−e); силу растим
  // к отсечке ~ d^2.2, иначе освещённость (∝ I·h/d³) у бампера в сотни раз
  // больше, чем на 40 м
  // ближе 3 м асфальт закрыт капотом и бампером — там луча нет, иначе под
  // носом машины горело бы белое пятно
  const d = e < -0.02 * D ? ROAD_H / Math.tan(-e) : 1e3;
  const v = Math.min(1, Math.max(0.004, Math.pow(d / 46, 2.2))) * smoothstep(2.5, 7, d);
  // по ширине: вправо шире (обочина, пешеходы), влево уже (не слепить встречных)
  const wide = Math.exp(-((a / ((a < 0 ? 24 : 32) * D)) ** 2));
  const hot = Math.exp(-(((a - 2 * D) / (9 * D)) ** 2));    // пятно чуть правее оси
  // над отсечкой — слабый рассеянный свет (знаки, кроны), как у живой фары
  return edge * v * wide * (0.55 + 0.45 * hot) + 0.006 * wide * (1 - edge);
}
// Дальний поверх ближнего: узкий пучок вдоль горизонта. По высоте — тот же
// приём, что у ближнего: сила растёт с дальностью точки дороги до ~110 м,
// иначе он выжег бы асфальт в двадцати метрах; выше горизонта гаснет за 1.5°.
function highBeam(e, a) {
  const d = e < -0.02 * D ? ROAD_H / Math.tan(-e) : 1e3;
  const vert = Math.pow(Math.min(d, 110) / 110, 2.4) * smoothstep(2.5, 7, d)
             * (e > 0 ? Math.exp(-((e / (1.5 * D)) ** 2)) : 1);
  return 12 * vert * (Math.exp(-((a / (8 * D)) ** 2)) + 0.18 * Math.exp(-((a / (20 * D)) ** 2)));
}
function smoothstep(e0, e1, x) { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }

// Текстура в осях камеры прожектора (её строит SpotLightShadow): u — вправо
// по ходу, v — вверх, перспектива с полууглом ANGLE, ось опущена на PITCH.
function beamTexture(high) {
  const data = new Uint16Array(BW * BH * 4), t = Math.tan(ANGLE);
  const cp = Math.cos(PITCH), sp = Math.sin(PITCH);
  for (let j = 0; j < BH; j++) {
    const y = ((j + 0.5) / BH * 2 - 1) * t;
    const vert = y * cp - sp, fwd = y * sp + cp;
    for (let i = 0; i < BW; i++) {
      const lat = ((i + 0.5) / BW * 2 - 1) * t;
      const e = Math.atan2(vert, Math.hypot(fwd, lat)), a = Math.atan2(lat, fwd);
      const I = lowBeam(e, a) + (high ? highBeam(e, a) : 0);
      const h = THREE.DataUtils.toHalfFloat(I), k = (j * BW + i) * 4;
      data[k] = data[k + 1] = data[k + 2] = h; data[k + 3] = 0x3c00;
    }
  }
  const tex = new THREE.DataTexture(data, BW, BH, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* приватное окно */ } },
};

export class CarLights {
  constructor(scene) {
    this.scene = scene;
    const spot = new THREE.SpotLight(0xfff0d8, 0, 120, ANGLE, 0.1, 2);
    spot.castShadow = false;
    this.beams = [beamTexture(false), beamTexture(true)];
    spot.map = this.beams[0];
    spot.shadow.camera.near = 0.05;          // ближе — маска не действует, бампер вспыхнул бы
    spot.shadow.camera.updateProjectionMatrix();
    ENV.uHeadMap.value = spot.map;
    ENV.uHeadMat.value = spot.shadow.matrix;  // та же матрица, что у маски прожектора
    this.target = new THREE.Object3D();
    spot.target = this.target;
    scene.add(spot, this.target);
    this.spot = spot;
    this.mode = LIGHT_MODES.includes(ls.get('sev.lights')) ? ls.get('sev.lights') : 'auto';
    this.mesh = null;
    this._v = new THREE.Vector3();
    this.lens = new THREE.Vector3(0.72, 0.68, 2.3);   // правая линза ближнего в кузове (уточняет _adopt)
    this.env = []; this.lamps = [];
    this.on = 0; this.high = 0; this.park = 0; this.drl = 0; this.brake = 0; this.back = 0;
  }

  next() {
    this.mode = LIGHT_MODES[(LIGHT_MODES.indexOf(this.mode) + 1) % LIGHT_MODES.length];
    ls.set('sev.lights', this.mode);
    return LIGHT_NAMES[this.mode];
  }

  // Новая модель машины — разобрать её материалы: отражения и фонари по списку.
  _adopt(mesh) {
    this.mesh = mesh;
    this.env = []; this.lamps = [];
    const box = new THREE.Box3(), c = new THREE.Vector3();
    mesh.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
    const seen = new Set();
    let named = false;
    const found = [];
    mesh.traverse(o => {
      if (!o.isMesh) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (!m) continue;
        if (m.envMap && !seen.has(m)) {
          if (m.userData.envBase == null) m.userData.envBase = m.envMapIntensity ?? 1;
          this.env.push(m);
        }
        seen.add(m);
        if (!m.emissive) continue;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        box.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld).applyMatrix4(inv);
        const z = box.getCenter(c).z;
        if (LAMPS[m.name]) named = true;
        found.push({ m, role: LAMPS[m.name], z, box: box.clone() });
      }
    });
    // Коробочная запасная модель (createCarMesh): у неё имён нет, фонари —
    // материалы с ненулевым свечением; спереди белые, сзади красные.
    if (!named) for (const f of found)
      if (f.m.emissive.getHex() !== 0 && Math.abs(f.z) > 1.2) f.role = f.z > 0 ? 'drl' : 'tail';
    const done = new Set();
    for (const { m, role, z } of found) {
      if (!role || done.has(m)) continue;
      done.add(m);
      // проверка местом: передние детали — у носа, задние — у кормы
      if (FRONT.has(role) ? z < 1.2 : z > -1.2) { console.warn('свет машины: ' + m.name + ' не там, где ждали', z); continue; }
      if (!m.userData.lamp) m.userData.lamp = { col: new THREE.Color(COLOR[role]), op: m.opacity };
      this.lamps.push({ m, role });
    }
    // где линзы ближнего — оттуда на мокром асфальте тянутся блики фар
    const lb = new THREE.Box3();
    for (const f of found) if (f.role === 'lens' && this.lamps.some(l => l.m === f.m)) lb.union(f.box);
    if (!lb.isEmpty()) this.lens.set(Math.max(Math.abs(lb.min.x), Math.abs(lb.max.x)) * 0.85, (lb.min.y + lb.max.y) / 2, lb.max.z);
  }

  // night — 0..1 из env.js, day — сколько дневного света (для отражений),
  // engine — заведён ли мотор (без него горят только габариты, если включены).
  update(dt, mesh, car, night, day) {
    if (mesh !== this.mesh) this._adopt(mesh);
    const k = 1 - Math.exp(-dt * 6), kf = 1 - Math.exp(-dt * 14);
    const engine = car.engine !== 'off';
    // авто: ночью ближний, днём только ДХО; заглушенный — всё гаснет
    const mode = this.mode === 'auto' ? (night > 0.25 ? 'low' : engine ? 'drl' : 'off') : this.mode;
    const lit = mode === 'parking' || mode === 'low' || mode === 'high';
    const wantOn = engine && (mode === 'low' || mode === 'high') ? 1 : 0;
    const wantHigh = engine && mode === 'high' ? 1 : 0;
    // ДХО горят с мотором всегда, кроме «выкл»; без мотора — как габариты, тусклее
    const wantDrl = mode === 'off' ? 0 : engine ? 1 : lit ? 0.45 : 0;
    this.on += (wantOn - this.on) * k;
    this.high += (wantHigh - this.high) * k;
    this.park += ((lit ? 1 : 0) - this.park) * k;
    this.drl += (wantDrl - this.drl) * k;
    const braking = engine && (car._brake || 0) > 0.15;
    this.brake += ((braking ? 1 : 0) - this.brake) * kf;
    const reverse = engine && car.gear < 0 && (car.mode ?? 'D') === 'D';
    this.back += ((reverse ? 1 : 0) - this.back) * kf;
    this.mode_ = mode;

    for (const m of this.env) m.envMapIntensity = m.userData.envBase * (0.12 + 0.88 * day);

    // Яркость — emissiveIntensity при цвете из COLOR. Красному много не
    // дать: тональная кривая (Neutral) всё, что ярче ~1, разбеливает, и стоп
    // выходит розовым. Поэтому габариты сзади — тёмно-красные (~0.5), стоп —
    // на краю (~1.6) и загорается ещё весь рассеиватель фонаря. ДХО и линзы
    // белые, им можно ярче: днём свечению надо перебить солнце на стекле.
    // стоп днём ярче: на солнце красное стекло и так светлое
    const P = this.park, B = this.brake * (1 + 0.6 * (1 - night));
    const tail = P * (0.30 + 0.25 * night);
    const lv = {
      drl: 5 * this.drl,
      lens: 4 * this.on + 2 * this.high,
      high: 9 * this.high,
      headGlass: 0.8 * this.on + 0.3 * this.high,
      tail: tail + 1.4 * B,
      tailInner: 0.25 * tail + 0.9 * B,
      tailGlass: 0.10 * tail + 0.35 * B,
      stop3: 1.8 * B,
      reverse: 2.5 * this.back,
      reverseGlass: 1.5 * this.back,
    };
    for (const { m, role } of this.lamps) {
      const L = m.userData.lamp;
      m.emissive.copy(L.col);
      m.emissiveIntensity = lv[role];
      // у прозрачного стекла свечение тоже умножается на непрозрачность (у
      // стекла фонаря она 0.1–0.25) — горящее стекло делаем плотнее; стекло
      // фары не трогаем: оно над линзами, плотное — молочное
      if (m.transparent && role !== 'headGlass') m.opacity = Math.max(L.op, Math.min(0.85, 0.3 * lv[role]));
    }

    // прожектор: из-под фар вперёд, ось опущена на PITCH; форма — маска луча.
    // Дальний — другая маска (ближний + пучок): у живой фары он включается
    // сразу, плавно растёт только сила.
    mesh.updateMatrixWorld();
    const M = mesh.matrixWorld;
    this.spot.map = this.beams[this.high > 0.5 ? 1 : 0];
    this.spot.intensity = this.on * BEAM_I;
    this.spot.distance = 120 + 140 * this.high;
    this.spot.position.set(0, LAMP_H, 2.55).applyMatrix4(M);   // перед бампером, ниже капота: иначе блик на лаке
    this.target.position.set(0, LAMP_H - 20 * Math.tan(PITCH), 22.55).applyMatrix4(M);
    // для бликов на мокром асфальте: прожектор, его сила и маска, обе линзы
    const sp = this.spot.position;
    ENV.uHead.value.set(sp.x, sp.y, sp.z, this.spot.intensity);
    ENV.uHeadMap.value = this.spot.map;
    const v = this._v.copy(this.lens).applyMatrix4(M);
    ENV.uHeadR.value.set(v.x, v.y, v.z, this.on);
    v.set(-this.lens.x, this.lens.y, this.lens.z).applyMatrix4(M);
    ENV.uHeadL.value.set(v.x, v.y, v.z, this.on);
    v.set(0, 0, 1).transformDirection(M);
    ENV.uHeadDir.value.set(v.x, v.y, v.z, 0);
    this.target.updateMatrixWorld();
  }
}
