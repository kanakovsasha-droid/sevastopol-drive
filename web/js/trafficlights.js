import * as THREE from 'three';
import { ENV } from './env.js?v=0021fa2c';

// Светофоры: модель как в Севастополе, расстановка по подходам перекрёстка и
// работающий цикл огней.
//
// Модель — серая стойка, на ней транспортная головка Т.1: жёлтый корпус,
// три секции (красный, жёлтый, зелёный) с козырьками, чёрный экран вокруг.
// На широких улицах (полотно от 12 м) — стойка с консолью: вторая головка
// висит над своими полосами. Лицом (+z) — навстречу своему потоку.
//
// Цикл — как у нас: зелёный → мигающий зелёный (3 с) → жёлтый (3 с) →
// красный → красный с жёлтым (2 с) → зелёный. Головки перекрёстка делятся
// на два направления (вдоль и поперёк его первой улицы), у них цикл в
// противофазе; у разных перекрёстков — свой сдвиг. Огни считает шейдер по
// игровым часам (ENV.uTime), на паузе цикл стоит. Фаза едет в красном
// канале цвета экземпляра (instanceColor), геометрия и материал общие.

const C = 46;                       // длина цикла, с
const GREEN = 20, BLINK = 3, YELLOW = 3, RY = 2;

const BODY = [0.93, 0.70, 0.08];    // жёлтый корпус (sRGB)
const SCREEN = [0.05, 0.05, 0.055]; // чёрный экран и козырьки
const POLE = [0.42, 0.43, 0.44];
const LENS = [[0.78, 0.10, 0.08], [0.95, 0.62, 0.06], [0.10, 0.75, 0.32]];

const WIDE = 12;                    // с этой ширины полотна — консоль над полосами
const REACH = 4.4;                  // вынос головки на консоли от стойки, м

const s2l = v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);

function merge(parts) {
  let nv = 0, ni = 0;
  for (const { geo } of parts) { nv += geo.attributes.position.count; ni += geo.index ? geo.index.count : geo.attributes.position.count; }
  const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), Cc = new Float32Array(nv * 3), L = new Float32Array(nv);
  const I = new Uint32Array(ni);
  let vo = 0, io = 0;
  for (const { geo, color, lens = 0 } of parts) {
    const n = geo.attributes.position.count;
    P.set(geo.attributes.position.array, vo * 3); N.set(geo.attributes.normal.array, vo * 3);
    const lc = color.map(s2l);
    for (let i = 0; i < n; i++) { Cc.set(lc, (vo + i) * 3); L[vo + i] = lens; }
    if (geo.index) for (let i = 0; i < geo.index.count; i++) I[io++] = geo.index.array[i] + vo;
    else for (let i = 0; i < n; i++) I[io++] = i + vo;
    vo += n;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.BufferAttribute(Cc, 3));
  g.setAttribute('aLens', new THREE.BufferAttribute(L, 1));
  g.setIndex(new THREE.BufferAttribute(I, 1));
  return g;
}

// головка Т.1 с центром в (x, y), лицом в +z; z — где стоит задняя стенка
function head(parts, x, y, z) {
  const HZ = z + 0.11;
  const screen = new THREE.BoxGeometry(0.50, 1.18, 0.03); screen.translate(x, y, HZ - 0.10);
  parts.push({ geo: screen, color: SCREEN });
  const body = new THREE.BoxGeometry(0.30, 1.00, 0.22); body.translate(x, y, HZ);
  parts.push({ geo: body, color: BODY });
  LENS.forEach((c, i) => {
    const ly = y + 0.31 - i * 0.31;
    const l = new THREE.CylinderGeometry(0.105, 0.105, 0.03, 14);
    l.rotateX(Math.PI / 2); l.translate(x, ly, HZ + 0.115);
    parts.push({ geo: l, color: c, lens: i + 1 });
    // козырёк: полутруба над линзой
    const v = new THREE.CylinderGeometry(0.125, 0.125, 0.16, 10, 1, true, -Math.PI / 2, Math.PI);
    v.rotateX(Math.PI / 2); v.translate(x, ly, HZ + 0.19);
    parts.push({ geo: v, color: SCREEN });
  });
}

const GEO = {};
// 'pole' — стойка 3.9 м с головкой на кронштейне (низ ~2.5 м);
// 'arm' — стойка 6.3 м, та же головка внизу и консоль вдоль +x с второй
// головкой над полосой (низ ~4.9 м — под ней проходит фура).
export function trafficGeo(kind = 'pole') {
  if (GEO[kind]) return GEO[kind];
  const parts = [];
  const tall = kind === 'arm' ? 6.3 : 3.9;
  const pole = new THREE.CylinderGeometry(0.055, 0.08, tall, 8); pole.translate(0, tall / 2, 0);
  const cap = new THREE.SphereGeometry(0.06, 6, 4); cap.translate(0, tall, 0);
  parts.push({ geo: pole, color: POLE }, { geo: cap, color: POLE });
  const HY = 3.05;
  const brk = new THREE.BoxGeometry(0.08, 0.08, 0.16); brk.translate(0, HY + 0.35, 0.06);
  const brk2 = brk.clone(); brk2.translate(0, -0.70, 0);
  parts.push({ geo: brk, color: POLE }, { geo: brk2, color: POLE });
  head(parts, 0, HY, 0.06);
  if (kind === 'arm') {
    const AY = 6.0;
    const arm = new THREE.CylinderGeometry(0.045, 0.06, REACH + 0.6, 6);
    arm.rotateZ(Math.PI / 2); arm.translate((REACH + 0.6) / 2, AY, 0);
    // раскос под консолью — без него вынос в четыре метра выглядит соломинкой
    const L = Math.hypot(1.6, 0.7);
    const brace = new THREE.CylinderGeometry(0.03, 0.03, L, 5);
    brace.rotateZ(-Math.atan2(1.6, 0.7)); brace.translate(0.8, AY - 0.35, 0);
    const hang = new THREE.BoxGeometry(0.06, 0.25, 0.06); hang.translate(REACH, AY - 0.12, 0);
    parts.push({ geo: arm, color: POLE }, { geo: brace, color: POLE }, { geo: hang, color: POLE });
    head(parts, REACH, AY - 0.75, -0.11);
  }
  return (GEO[kind] = merge(parts));
}

let MAT = null;
export function trafficMaterial() {
  if (MAT) return MAT;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide });
  m.customProgramCacheKey = () => 'traffic-2';
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = ENV.uTime; sh.uniforms.uNight = ENV.uNight;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aLens;\nvarying float vLens;\nvarying float vPhase;')
      // фаза — в красном канале цвета экземпляра; сам цвет не трогаем
      .replace('#include <color_vertex>', `
        vColor = vec4(color, 1.0);
        vLens = aLens;
        vPhase = 0.0;
        #ifdef USE_INSTANCING_COLOR
          vPhase = instanceColor.r;
        #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uNight;\nvarying float vLens;\nvarying float vPhase;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if (vLens > 0.5) {
          float t = mod(uTime + vPhase, ${C.toFixed(1)});
          float g = step(t, ${GREEN.toFixed(1)});
          // последние секунды зелёного — мигает
          float blink = step(${(GREEN - BLINK).toFixed(1)}, t) * step(0.5, fract(t));
          g *= 1.0 - blink;
          float y = step(${GREEN.toFixed(1)}, t) * step(t, ${(GREEN + YELLOW).toFixed(1)});
          float r = step(${(GREEN + YELLOW).toFixed(1)}, t);
          float ry = step(${(C - RY).toFixed(1)}, t);          // красный с жёлтым перед зелёным
          float on = vLens < 1.5 ? r : vLens < 2.5 ? max(y, ry) : g;
          vec3 lc = vLens < 1.5 ? vec3(1.0, 0.08, 0.04) : vLens < 2.5 ? vec3(1.0, 0.55, 0.02) : vec3(0.15, 1.0, 0.45);
          totalEmissiveRadiance += lc * on * (2.2 + 4.0 * uNight);
          diffuseColor.rgb *= 0.25 + 0.75 * on;               // погасшая линза — тёмное стекло
        }`);
  };
  return (MAT = m);
}

// ---------------------------------------------------------------- расстановка
// Узел OSM highway=traffic_signals лежит на осевой: посреди перекрёстка или
// на подходе к нему. Светофор нужен каждому потоку, который в узел въезжает:
// берём все проезжие улицы через узел, у каждой — оба плеча (у односторонней
// — только то, откуда едут), и на каждом ставим стойку у ПРАВОГО бордюра
// перед перекрёстком, головкой навстречу потоку. Место — первое от узла,
// где стойка уже не на асфальте поперечной улицы и не в доме.
//
// Узлы одного перекрёстка (их в OSM часто ставят на каждый подход, а у
// разделённых проспектов — на каждую проезжую часть) собираем в кучку по
// 35 м: у кучки общий сдвиг цикла и общая ось «вдоль / поперёк».
//
// points — узлы OSM; roads — индекс дорог; drive(r) — проезжая ли;
// clear(x, z, a) — влезает ли стойка. Возвращает [{x, z, a, k, flip, phase}].
export function placeTrafficLights(points, roads, drive, clear) {
  const out = [];
  if (!points?.length) return out;

  // кучки узлов одного перекрёстка
  const groups = [];
  for (const p of points) {
    const g = groups.find(g => g.some(q => Math.hypot(q.x - p.x, q.z - p.z) < 35));
    if (g) g.push(p); else groups.push([p]);
  }

  for (const g of groups) {
    // сдвиг цикла — по узлу кучки с наименьшим x: он один и тот же в любом
    // квартале, который эту кучку видит
    const key = g.reduce((a, b) => (b.x < a.x ? b : a));
    const jn = ((Math.round(key.x) * 73856093) ^ (Math.round(key.z) * 19349663)) >>> 0;
    const base = (jn % 1000) / 1000 * C;
    let ref = null;                      // ось перекрёстка: угол первой головки

    for (const p of g) {
      const seen = new Set();
      for (let n = 0; n < 4; n++) {
        const h = roads.nearest(p.x, p.z, 10, r => drive(r) && !seen.has(r));
        if (!h) break;
        const road = h.road;
        seen.add(road);
        // gs — плечо: +1 по ходу точек улицы, −1 против. Поток на плече gs
        // едет к узлу (направление −gs), его правый бордюр — сторона −gs.
        for (const gs of [1, -1]) {
          if (road.ow && gs > 0) continue;           // односторонняя: едут по ходу точек
          const r = approach(roads, road, h, gs, clear);
          if (!r) continue;
          if (out.some(o => Math.hypot(o.x - r.x, o.z - r.z) < 8 && Math.cos(o.a - r.a) > 0.7)) continue;
          if (ref === null) ref = r.a;
          const cross = Math.abs(Math.cos(r.a - ref)) < Math.SQRT1_2 ? 1 : 0;
          r.phase = (base + cross * (GREEN + YELLOW)) % C;
          out.push(r);
        }
      }
    }
  }
  return out;
}

// Стойка на плече gs улицы road (h — точка узла на её осевой).
function approach(roads, road, h, gs, clear) {
  // плечо должно быть: улица, кончающаяся в узле, второго плеча не имеет
  const tip = roads.nearest(h.x + h.dirX * gs * 8, h.z + h.dirZ * gs * 8, 3, r => r === road);
  if (!tip) return null;
  const s = -gs;
  for (let t = 3; t <= 30; t += 1.5) {
    // садимся на ту же осевую на каждом шаге: на повороте нормаль другая
    const q = roads.nearest(h.x + h.dirX * gs * t, h.z + h.dirZ * gs * t, 6, r => r === road);
    if (!q) return null;
    const nx = -q.dirZ, nz = q.dirX;
    const a = Math.atan2(gs * q.dirX, gs * q.dirZ);
    for (let extra = 0; extra <= 1.6; extra += 0.8) {
      const d = road.w / 2 + 0.9 + extra;
      const x = q.x + nx * s * d, z = q.z + nz * s * d;
      if (!clear(x, z, a)) continue;
      const wide = road.w >= WIDE;
      // консоль собрана вдоль локального +x; он в мире — (cos a, −sin a).
      // Если он смотрит от дороги, а не на неё — отражаем экземпляр.
      const flip = wide && (Math.cos(a) * -nx * s + -Math.sin(a) * -nz * s) < 0;
      return { x, z, a, k: wide ? 'arm' : 'pole', flip };
    }
  }
  return null;
}

// list — из placeTrafficLights, y(x, z) — высота земли. Меш на каждый вид.
export function buildTrafficLights(list, y) {
  const group = new THREE.Group();
  group.name = 'светофоры';
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const p = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color();
  for (const kind of ['pole', 'arm']) {
    const items = list.filter(r => r.k === kind);
    if (!items.length) continue;
    const mesh = new THREE.InstancedMesh(trafficGeo(kind), trafficMaterial(), items.length);
    items.forEach((r, i) => {
      p.set(r.x, y(r.x, r.z), r.z);
      q.setFromAxisAngle(up, r.a);
      s.set(r.flip ? -1 : 1, 1, 1);
      mesh.setMatrixAt(i, m4.compose(p, q, s));
      mesh.setColorAt(i, col.setRGB(r.phase, 0, 0));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = true;
    group.add(mesh);
  }
  return group;
}
