import * as THREE from 'three';
import { ENV } from './env.js';

// Светофоры: модель как в Севастополе и работающий цикл огней.
//
// Модель — серая стойка, на ней транспортная головка Т.1: жёлтый корпус,
// три секции (красный, жёлтый, зелёный) с козырьками, чёрный экран вокруг.
// Лицом (+z) — навстречу своей полосе; ставит furniture.js: точка OSM
// на осевой → столб у бордюра с каждой стороны дороги (одностороннюю — с
// той, куда идёт поток).
//
// Цикл — как у нас: зелёный → мигающий зелёный (3 с) → жёлтый (3 с) →
// красный → красный с жёлтым (2 с) → зелёный. Перекрёсток делится на два
// направления по углу головки (вдоль и поперёк), у них цикл в противофазе;
// у разных перекрёстков — свой сдвиг по месту. Огни считает шейдер по
// игровым часам (ENV.uTime), на паузе цикл стоит. Фаза едет в красном
// канале цвета экземпляра (instanceColor), сама геометрия общая.

const C = 46;                       // длина цикла, с
const GREEN = 20, BLINK = 3, YELLOW = 3, RY = 2;

const BODY = [0.93, 0.70, 0.08];    // жёлтый корпус (sRGB)
const SCREEN = [0.05, 0.05, 0.055]; // чёрный экран и козырьки
const POLE = [0.42, 0.43, 0.44];
const LENS = [[0.78, 0.10, 0.08], [0.95, 0.62, 0.06], [0.10, 0.75, 0.32]];

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

let GEO = null;
export function trafficGeo() {
  if (GEO) return GEO;
  const parts = [];
  const pole = new THREE.CylinderGeometry(0.055, 0.075, 3.9, 8); pole.translate(0, 1.95, 0);
  parts.push({ geo: pole, color: POLE });
  const cap = new THREE.SphereGeometry(0.06, 6, 4); cap.translate(0, 3.9, 0);
  parts.push({ geo: cap, color: POLE });
  // головка на кронштейне у стойки, низ ~2.5 м, лицом в +z
  const HY = 3.05, HZ = 0.17;
  const screen = new THREE.BoxGeometry(0.50, 1.18, 0.03); screen.translate(0, HY, HZ - 0.10);
  parts.push({ geo: screen, color: SCREEN });
  const body = new THREE.BoxGeometry(0.30, 1.00, 0.22); body.translate(0, HY, HZ);
  parts.push({ geo: body, color: BODY });
  const brk = new THREE.BoxGeometry(0.08, 0.08, 0.16); brk.translate(0, HY + 0.35, 0.06);
  const brk2 = brk.clone(); brk2.translate(0, -0.70, 0);
  parts.push({ geo: brk, color: POLE }, { geo: brk2, color: POLE });
  LENS.forEach((c, i) => {
    const y = HY + 0.31 - i * 0.31;
    const l = new THREE.CylinderGeometry(0.105, 0.105, 0.03, 14);
    l.rotateX(Math.PI / 2); l.translate(0, y, HZ + 0.115);
    parts.push({ geo: l, color: c, lens: i + 1 });
    // козырёк: полутруба над линзой
    const v = new THREE.CylinderGeometry(0.125, 0.125, 0.16, 10, 1, true, -Math.PI / 2, Math.PI);
    v.rotateX(Math.PI / 2); v.translate(0, y, HZ + 0.19);
    parts.push({ geo: v, color: SCREEN });
  });
  return (GEO = merge(parts));
}

let MAT = null;
export function trafficMaterial() {
  if (MAT) return MAT;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide });
  m.customProgramCacheKey = () => 'traffic-1';
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

// list — [{x, z, a}], y(x, z) — высота земли. Фаза: направление по углу
// головки (вдоль/поперёк — противофаза) + сдвиг перекрёстка по месту.
export function buildTrafficLights(list, y) {
  const mesh = new THREE.InstancedMesh(trafficGeo(), trafficMaterial(), list.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1), col = new THREE.Color();
  list.forEach((r, i) => {
    p.set(r.x, y(r.x, r.z), r.z);
    q.setFromAxisAngle(up, r.a);
    mesh.setMatrixAt(i, m4.compose(p, q, s));
    // ось головки по модулю π: 0 — «вдоль», π/2 — «поперёк»
    const ax = ((r.a % Math.PI) + Math.PI) % Math.PI;
    const cross = Math.abs(ax - Math.PI / 2) < Math.PI / 4 ? 1 : 0;
    // сдвиг перекрёстка: клетка 60 м — головки одного узла в одной клетке
    const cx = Math.floor(r.x / 60), cz = Math.floor(r.z / 60);
    const jn = ((cx * 73856093) ^ (cz * 19349663)) >>> 0;
    const phase = (jn % 1000) / 1000 * C + cross * (GREEN + YELLOW);
    mesh.setColorAt(i, col.setRGB(phase, 0, 0));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = true;
  mesh.name = 'светофоры';
  return mesh;
}
