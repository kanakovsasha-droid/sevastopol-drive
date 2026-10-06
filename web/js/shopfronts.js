import * as THREE from 'three';
import { ENV } from './env.js?v=b4c97018';

// Витрины и маркизы под вывесками (signs.js). Владелец: «город сероватый,
// скучновато, однотипно» — первый этаж под заведением из OSM получает
// витрину вместо нарисованных окон, у кафе и ресторанов — полосатую маркизу.
// Ставим только там, где висит вывеска из data/shops.json: ничего не
// выдумано, просто у магазина есть витрина. Весь квартал — одна сетка с
// цветами вершин, один вызов отрисовки; ночью витрина светится (uNight).
// Низ — отметка первого этажа дома, как у окон в шейдере фасада.

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
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.1,
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
// ширина w, высота h, направление стены (dx, dz), наружу (nx, nz), s = {n, c},
// floor — отметка первого этажа, hand — именная табличка (без витрины).
// colorOf(s) — [фон, текст] вывески, чтобы маркиза была в цвет заведения.
export function buildShopfronts(items, colorOf) {
  const P = [], C = [], G = [], I = [];
  const spots = [];                                // для отладки и снимков: где стоят витрины
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
    // от отметки первого этажа дома (signs.js, floor): ниже — цоколь
    const fl = o.floor;
    const top = o.y - o.h / 2 - 0.18;              // под вывеской
    const bot = fl + 0.28;
    if (top - bot < 1.6) continue;                 // низкий первый этаж — витрина не влезает

    // рама: чуть шире стекла
    const fw = half + 0.12;
    quad(pt(-fw, fl + 0.12, 0.07), pt(fw, fl + 0.12, 0.07), pt(fw, top + 0.12, 0.07), pt(-fw, top + 0.12, 0.07),
         FRAME, [0, 0]);
    // стекло: внизу темнее (прилавок, тень), вверху светлее (лампы зала)
    quad(pt(-half, bot, 0.10), pt(half, bot, 0.10), pt(half, top, 0.10), pt(-half, top, 0.10),
         [0.025, 0.03, 0.035], [0.05, 0.40], [0.13, 0.16, 0.19]);
    // импосты через ~1.8 м и фрамуга под вывеской
    const nm = Math.max(0, Math.round(o.w / 1.8) - 1);
    for (let k = 1; k <= nm; k++) {
      const t = -half + o.w * k / (nm + 1);
      quad(pt(t - 0.04, bot, 0.12), pt(t + 0.04, bot, 0.12), pt(t + 0.04, top, 0.12), pt(t - 0.04, top, 0.12),
           FRAME, [0, 0]);
    }
    const tr = top - 0.42;
    quad(pt(-half, tr - 0.04, 0.12), pt(half, tr - 0.04, 0.12), pt(half, tr + 0.04, 0.12), pt(-half, tr + 0.04, 0.12),
         FRAME, [0, 0]);

    spots.push({ x: o.cx, z: o.cz, y: fl, nx: o.nx, nz: o.nz, n: o.s.n, awn: AWNING.has(o.s.c) });
    if (!AWNING.has(o.s.c)) continue;
    // маркиза: от стены над витриной наружу и вниз, полосами в цвет вывески
    const ground = fl;
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
  mesh.userData.spots = spots;
  mesh.receiveShadow = true;
  return mesh;
}
