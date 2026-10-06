import * as THREE from 'three';
import { ENV } from './env.js?v=8c71f0ed';

// Витрины и маркизы под вывесками (signs.js). Владелец: «город сероватый,
// скучновато, однотипно» — первый этаж под заведением из OSM получает
// витрину вместо нарисованных окон, у кафе и ресторанов — полосатую маркизу.
// Ставим только там, где висит вывеска из data/shops.json: ничего не
// выдумано, просто у магазина есть витрина. Весь квартал — одна сетка с
// цветами вершин, один вызов отрисовки; ночью витрина светится (uNight).

// где бывает витрина: торговля, общепит, аптека, банк, спорт
const VITRINE = new Set(['shop', 'food', 'food_shop', 'pharmacy', 'bank', 'sport']);
// где маркиза: кафе, рестораны, бары (категория food из fetch-shops.mjs)
const AWNING = new Set(['food']);

const FRAME = [0.16, 0.165, 0.17];        // анодированный алюминий, тёмный
const CREAM = [0.93, 0.89, 0.80];         // светлая полоса маркизы

function hex(c) {
  const v = new THREE.Color(c).convertSRGBToLinear();
  return [v.r, v.g, v.b];
}

function material() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.05,
                                              side: THREE.DoubleSide });
  m.customProgramCacheKey = () => 'shopfront';
  m.onBeforeCompile = sh => {
    sh.uniforms.uNight = ENV.uNight;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aGlow;\nvarying vec2 vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;\nvarying vec2 vGlow;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        // витрина: днём чуть видно освещённый зал, ночью горит тёплым
        totalEmissiveRadiance += vec3(1.0, 0.86, 0.66) * (vGlow.x + vGlow.y * uNight);`);
  };
  return m;
}
let MAT = null;

// items — то, что расставил signs.js: центр вывески на стене (cx, cz, y),
// ширина w, высота h, направление стены (dx, dz), наружу (nx, nz), s = {n, c}.
// colorOf(s) — [фон, текст] вывески, чтобы маркиза была в цвет заведения.
export function buildShopfronts(items, terrain, colorOf) {
  const P = [], C = [], G = [], I = [];
  let v = 0;
  // квад по четырём точкам [x, y, z], обход — лицом наружу (по нормали)
  const quad = (a, b, c, d, col, glow, colTop) => {
    P.push(...a, ...b, ...c, ...d);
    const ct = colTop || col;
    C.push(...col, ...col, ...ct, ...ct);
    for (let q = 0; q < 4; q++) G.push(glow[0], glow[1]);
    I.push(v, v + 2, v + 1, v, v + 3, v + 2);
    v += 4;
  };

  for (const o of items) {
    if (o.hand || !VITRINE.has(o.s.c)) continue;
    const { dx, dz, nx, nz } = o;
    // точка на стене: t — вдоль стены от центра вывески, off — от стены наружу
    const pt = (t, y, off) => [o.cx + dx * t + nx * off, y, o.cz + dz * t + nz * off];
    const half = o.w / 2;
    const gA = terrain.gridHeightAt(o.cx - dx * half, o.cz - dz * half);
    const gB = terrain.gridHeightAt(o.cx + dx * half, o.cz + dz * half);
    const top = o.y - o.h / 2 - 0.18;              // под вывеской
    const bA = gA + 0.28, bB = gB + 0.28;          // низ по рельефу у каждого края
    if (top - Math.max(bA, bB) < 1.6) continue;    // на крутом склоне витрина не влезает

    // рама: чуть шире стекла
    const fw = half + 0.12;
    const fA = terrain.gridHeightAt(o.cx - dx * fw, o.cz - dz * fw) + 0.12;
    const fB = terrain.gridHeightAt(o.cx + dx * fw, o.cz + dz * fw) + 0.12;
    quad(pt(-fw, fA, 0.07), pt(fw, fB, 0.07), pt(fw, top + 0.12, 0.07), pt(-fw, top + 0.12, 0.07),
         FRAME, [0, 0]);
    // стекло: внизу темнее (прилавок, тень), вверху светлее (лампы зала)
    quad(pt(-half, bA, 0.10), pt(half, bB, 0.10), pt(half, top, 0.10), pt(-half, top, 0.10),
         [0.05, 0.055, 0.06], [0.03, 0.55], [0.20, 0.21, 0.20]);
    // импосты через ~1.8 м и фрамуга под вывеской
    const nm = Math.max(0, Math.round(o.w / 1.8) - 1);
    for (let k = 1; k <= nm; k++) {
      const t = -half + o.w * k / (nm + 1);
      const g = terrain.gridHeightAt(o.cx + dx * t, o.cz + dz * t) + 0.28;
      quad(pt(t - 0.04, g, 0.12), pt(t + 0.04, g, 0.12), pt(t + 0.04, top, 0.12), pt(t - 0.04, top, 0.12),
           FRAME, [0, 0]);
    }
    const tr = top - 0.42;
    quad(pt(-half, tr - 0.04, 0.12), pt(half, tr - 0.04, 0.12), pt(half, tr + 0.04, 0.12), pt(-half, tr + 0.04, 0.12),
         FRAME, [0, 0]);

    if (!AWNING.has(o.s.c)) continue;
    // маркиза: от стены над витриной наружу и вниз, полосами в цвет вывески
    const ground = Math.max(gA, gB);
    const yw = top + 0.14;                          // крепление к стене
    const out = 1.25;
    let drop = 0.55;
    if (yw - drop - 0.28 < ground + 2.15) drop = Math.max(0.15, yw - 0.28 - ground - 2.15);
    if (yw - drop - 0.28 < ground + 2.0) continue;  // низко — проходу мешает, не ставим
    const yf = yw - drop;
    const col = hex((colorOf(o.s) || ['#7a1d16'])[0]);
    const n = Math.max(2, Math.round(o.w / 0.5));
    for (let k = 0; k < n; k++) {
      const t0 = -half + o.w * k / n, t1 = -half + o.w * (k + 1) / n;
      const c = k % 2 ? CREAM : col;
      quad(pt(t0, yf, out), pt(t1, yf, out), pt(t1, yw, 0.06), pt(t0, yw, 0.06), c, [0, 0]);
      quad(pt(t0, yf - 0.28, out), pt(t1, yf - 0.28, out), pt(t1, yf, out), pt(t0, yf, out), c, [0, 0]);
    }
    // боковины-треугольники (вырожденный квад, материал двусторонний)
    for (const t of [-half, half])
      quad(pt(t, yf - 0.28, out), pt(t, yw, 0.06), pt(t, yw, 0.06), pt(t, yf, out), col, [0, 0]);
  }
  if (!v) return null;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  geo.setAttribute('aGlow', new THREE.Float32BufferAttribute(G, 2));
  geo.setIndex(I);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  MAT = MAT || material();
  const mesh = new THREE.Mesh(geo, MAT);
  mesh.name = 'витрины';
  mesh.receiveShadow = true;
  return mesh;
}
