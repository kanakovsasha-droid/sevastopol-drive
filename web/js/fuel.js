import * as THREE from 'three';
import { GLTFLoader } from '../lib/GLTFLoader.js?v=e53617c3';
import { ENV, registerLamps } from './env.js?v=e53617c3';

// АЗС: какая это сеть, и модель сети из Blender (models/azs_<сеть>/build.py →
// data/models/azs_<сеть>.glb) на месте заправки из OSM.
//
// В данных (world.fuel) имя пишут как попало: «Атан», «ATAN Россия №84»,
// «АТАН», «TES», «ТЭС», «Tes», «ТES» (латинская T + кириллица)… Сводим к сети
// по образцу. Вид и цвета сетей сняты с панорам Яндекса (refs/fuel_brands.md):
// АТАН — жёлтый фриз, зелёные буквы ATAN, жёлтая арка над навесом;
// ТЭС — фиолетовый фриз с зелёной кромкой, зелёные ТРК, фиолетовый пилон-стела;
// СНП — синий фриз, серебристые опоры; ТНК — синий фриз, красные опоры.
// Сети без фото (WOG, CRS, Баррель, Татнефть, Formula, RS, газовые) и
// неузнанные — нейтральная модель azs_generic, имя из OSM — надписью на фризе.
// Цены на стелах моделей — с панорамы ТЭС 2020 г. (своих данных о ценах нет).

export const BRANDS = [
  { id: 'atan',  re: /^(атан|atan)/i,                    sign: 'АТАН',  model: 'azs_atan' },
  { id: 'tes',   re: /^(t|т)(e|э|е)s$|^(т|t)(э|e|е)(с|s)$/i, sign: 'ТЭС', model: 'azs_tes' },
  { id: 'snp',   re: /снп/i,                              sign: 'СНП',   model: 'azs_snp' },
  { id: 'tnk',   re: /^тнк/i,                             sign: 'ТНК',   model: 'azs_tnk' },
  { id: 'wog',   re: /^wog$/i,                            sign: 'WOG' },
  { id: 'tatn',  re: /^татнефть/i,                        sign: 'Татнефть' },
  { id: 'crs',   re: /^crs$/i,                            sign: 'CRS' },
  { id: 'barr',  re: /баррель/i,                          sign: 'Баррель' },
  { id: 'form',  re: /^formula$/i,                        sign: 'Formula' },
  { id: 'rs',    re: /^rs$/i,                             sign: 'RS' },
  { id: 'gas',   re: /пропан|метан|агзс|агнкс|газов/i,    sign: 'ГАЗ' },
];
// АГНКС СНП — газовая: модель с синим фризом СНП ей не подходит
const GAS = /пропан|метан|агзс|агнкс|газов/i;

// Цвета надписи на фризе нейтральной АЗС (атлас вывесок)
export const DEFAULT_COL = { band: [0.42, 0.45, 0.48], board: [0.42, 0.45, 0.48], text: [0.97, 0.97, 0.96] };

// Сеть станции f (world.fuel): сначала по имени (оно свежее — тег brand
// нередко остался от прежнего хозяина: «Атан» с brand=ТНК), потом по brand.
export function brandOf(f) {
  for (const s of [f?.n, f?.b]) {
    const n = String(s || '').trim();
    if (n) for (const b of BRANDS) if (b.re.test(n)) return b;
  }
  return null;
}

// Подпись станции: имя сети, а если сеть не узнали — имя из OSM как есть
// (короткое), иначе ничего.
export function signOf(f) {
  const b = brandOf(f);
  if (b) return b.sign;
  const n = String(f?.n || '').trim();
  return n && n.length <= 14 ? n : '';
}

// Виды топлива из тегов fuel:* или по имени газовой заправки. Иначе пусто.
const FUEL_SIGN = { octane_92: 'АИ-92', octane_95: 'АИ-95', octane_98: 'АИ-98', octane_100: 'АИ-100', diesel: 'ДТ', lpg: 'ПРОПАН', cng: 'МЕТАН' };
export function fuelLines(f) {
  if (f?.fu?.length) return f.fu.map(k => FUEL_SIGN[k]).filter(Boolean).slice(0, 4);
  const n = String(f?.n || '');
  if (/метан|агнкс/i.test(n)) return ['МЕТАН'];
  if (/пропан|агзс/i.test(n)) return ['ПРОПАН'];
  return [];
}

// ---------------------------------------------------------------- модель
// Модель сети: все меши GLB склеены в один (цвет материала — в цвет вершин),
// павильон — отдельным мешем (его прячем, если на месте стоит дом). Так
// одна АЗС — 2 вызова отрисовки модели + площадка + пятно света.
// Свечение по материалу: [днём, ночью, доля тёплого белого вместо цвета].
const GLOW = {
  lamp: [0.0, 2.6, 1], soffit: [0.0, 0.45, 0.6], stela_led: [0.55, 1.1, 0],
  brand: [0, 0.35, 0], brand2: [0, 0.35, 0], logo_txt: [0, 0.6, 0], logo_a: [0, 0.5, 0], logo_b: [0, 0.5, 0],
  stela: [0, 0.25, 0], stela2: [0, 0.4, 0], stela_txt: [0, 0.6, 0], stela_txt2: [0, 0.6, 0], stela_lab: [0.3, 0.8, 0],
  shop_band: [0, 0.35, 0], shop_txt: [0, 0.6, 0], shop_glass: [0, 0.75, 1], screen: [0, 0.2, 1],
};
const LOD_FAR = 170;          // дальше — масса из .lod.glb
const MODELS = new Map();

function stationMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.05 });
  m.customProgramCacheKey = () => 'azs';
  m.onBeforeCompile = sh => {
    sh.uniforms.uNight = ENV.uNight;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aGlow;\nvarying vec3 vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;\nvarying vec3 vGlow;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          // подсветка тени (как у моделей зданий) + свет сети: табло днём,
          // фриз, светильники и витрина ночью
          vec3 gc = mix(vColor.rgb, vec3(1.0, 0.88, 0.70), vGlow.z);
          totalEmissiveRadiance += vColor.rgb * 0.14 + gc * (vGlow.x + vGlow.y * uNight);
        }`);
  };
  return m;
}
const MAT = stationMaterial();

function bake(scene) {
  scene.updateMatrixWorld(true);
  const parts = { main: [], shop: [] };
  scene.traverse(o => {
    if (!o.isMesh) return;
    const key = o.material.name;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    (key.startsWith('shop_') ? parts.shop : parts.main).push({ g, c: o.material.color, gl: GLOW[key] || [0, 0, 0] });
  });
  const out = {};
  for (const [k, list] of Object.entries(parts)) {
    if (!list.length) continue;
    let n = 0;
    for (const p of list) n += p.g.attributes.position.count;
    const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3), A = new Float32Array(n * 3);
    let o = 0;
    for (const { g, c, gl } of list) {
      const m = g.attributes.position.count;
      P.set(g.attributes.position.array, o * 3);
      N.set(g.attributes.normal.array, o * 3);
      for (let i = 0; i < m; i++) {
        C[(o + i) * 3] = c.r; C[(o + i) * 3 + 1] = c.g; C[(o + i) * 3 + 2] = c.b;
        A[(o + i) * 3] = gl[0]; A[(o + i) * 3 + 1] = gl[1]; A[(o + i) * 3 + 2] = gl[2];
      }
      o += m;
      g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
    geo.setAttribute('aGlow', new THREE.BufferAttribute(A, 3));
    geo.computeBoundingSphere();
    out[k] = geo;
  }
  return out;
}

function loadModel(name) {
  let p = MODELS.get(name);
  if (!p) {
    const v = document.querySelector('meta[name="build"]')?.content || '';
    const get = f => new GLTFLoader().loadAsync(`../data/models/${f}${v ? '?v=' + v : ''}`).then(g => bake(g.scene));
    p = Promise.all([get(name + '.glb'), get(name + '.lod.glb')]).then(([full, low]) => ({ full, low }));
    MODELS.set(name, p);
  }
  return p;
}

function levelOf(geos, hideShop) {
  const g = new THREE.Group();
  for (const [k, geo] of Object.entries(geos)) {
    if (k === 'shop' && hideShop) continue;
    const m = new THREE.Mesh(geo, MAT);
    m.castShadow = true; m.receiveShadow = true;
    m.name = 'АЗС: ' + (k === 'shop' ? 'павильон' : 'навес');
    g.add(m);
  }
  return g;
}

// ---------------------------------------------------------------- площадка
// Бетонные плиты 3×3 м со швами — одна текстура на все АЗС.
let PAD_MAT = null;
function padMaterial() {
  if (PAD_MAT) return PAD_MAT;
  const S = 256, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = '#b9b6ae'; g.fillRect(0, 0, S, S);
  // пятна и неровный тон плит
  let seed = 7;
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const t = 170 + Math.round(r() * 22);
    g.fillStyle = `rgb(${t},${t - 3},${t - 10})`;
    g.fillRect(i * 64 + 1, j * 64 + 1, 62, 62);
  }
  for (let k = 0; k < 160; k++) {
    g.fillStyle = `rgba(60,58,54,${0.04 + r() * 0.06})`;
    g.beginPath(); g.arc(r() * S, r() * S, 2 + r() * 9, 0, 7); g.fill();
  }
  g.fillStyle = '#6d6a64';                        // швы
  for (let i = 0; i <= 4; i++) { g.fillRect(i * 64 - 1, 0, 2, S); g.fillRect(0, i * 64 - 1, S, 2); }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  PAD_MAT = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  return PAD_MAT;
}

// Пятно света под навесом ночью — прозрачный квадрат, яркость по uNight.
let POOL_MAT = null;
function poolMaterial() {
  if (POOL_MAT) return POOL_MAT;
  const S = 128, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, S * 0.1, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,240,215,1)'); gr.addColorStop(0.55, 'rgba(255,236,205,0.55)'); gr.addColorStop(1, 'rgba(255,230,200,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  POOL_MAT = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  return POOL_MAT;
}

// ---------------------------------------------------------------- место
// Площадь многоугольника (плоский массив x, z)
function area(p) {
  let a = 0;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) a += (p[j] - p[i]) * (p[j + 1] + p[i + 1]);
  return Math.abs(a / 2);
}
function inside(x, z, p) {
  let c = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], zi = p[i + 1], xj = p[j], zj = p[j + 1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
  }
  return c;
}
// Ближайшая проезжая улица: точка на ней и направление
function nearestRoad(world, x, z) {
  let best = null;
  for (const pass of [2, 9]) {
    for (const r of world.roads || []) {
      if (r.c > pass) continue;
      const q = r.pts;
      for (let i = 0; i < q.length - 2; i += 2) {
        const ax = q[i], az = q[i + 1], vx = q[i + 2] - ax, vz = q[i + 3] - az;
        const l2 = vx * vx + vz * vz || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2));
        const px = ax + t * vx, pz = az + t * vz, d = Math.hypot(x - px, z - pz);
        if (!best || d < best.d) { const l = Math.sqrt(l2); best = { d, px, pz, tx: vx / l, tz: vz / l }; }
      }
    }
    if (best && best.d < 60) break;
  }
  return best;
}

// Где и как стоит модель: начало (середина навеса), поворот (локальный +z
// модели — к улице), масштаб. Модель: навес 16,6 × 10,6 м, стела на +7,6 м к
// улице, павильон до −15 м от неё.
const FRONT = 7.9, BACK = 15.2;
function plan(f, world) {
  let cx = f.x, cz = f.z, ax = 1, az = 0, L = 22, D = 0;
  const p = f.poly && f.poly.length >= 8 ? f.poly : null;
  let obb = null;
  if (p) {
    const n = p.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const dx = p[j * 2] - p[i * 2], dz = p[j * 2 + 1] - p[i * 2 + 1], l = Math.hypot(dx, dz);
      if (l < 0.5) continue;
      const ux = dx / l, uz = dz / l;
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for (let k = 0; k < n; k++) {
        const u = p[k * 2] * ux + p[k * 2 + 1] * uz, v = -p[k * 2] * uz + p[k * 2 + 1] * ux;
        if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v;
      }
      const ar = (u1 - u0) * (v1 - v0);
      if (!obb || ar < obb.ar) obb = { ar, ux, uz, u0, u1, v0, v1 };
    }
  }
  if (obb) {
    const cu = (obb.u0 + obb.u1) / 2, cv = (obb.v0 + obb.v1) / 2;
    cx = cu * obb.ux - cv * obb.uz; cz = cu * obb.uz + cv * obb.ux;
  }
  const road = nearestRoad(world, cx, cz);
  // навес — вдоль улицы: из двух осей контура берём ту, что ближе к ней
  if (obb) {
    const a1 = [obb.ux, obb.uz, obb.u1 - obb.u0, obb.v1 - obb.v0], a2 = [-obb.uz, obb.ux, obb.v1 - obb.v0, obb.u1 - obb.u0];
    const pick = !road ? (a1[2] >= a2[2] ? a1 : a2) : (Math.abs(a1[0] * road.tx + a1[1] * road.tz) >= Math.abs(a2[0] * road.tx + a2[1] * road.tz) ? a1 : a2);
    [ax, az, L, D] = pick;
  } else if (road) { ax = road.tx; az = road.tz; }
  // нормаль к улице
  let nx = -az, nz = ax;
  if (road && (road.px - cx) * nx + (road.pz - cz) * nz < 0) { nx = -nx; nz = -nz; }
  // масштаб по контуру: навес короче площадки, модель глубиной FRONT+BACK
  // контур — сам навес (f.__canopy): навес модели — по нему, середина в середину
  const s = !obb ? 1 : f.__canopy ? Math.max(0.8, Math.min(1.3, L / 16.6))
    : Math.max(0.75, Math.min(1.15, Math.min(L / 22, D / (FRONT + BACK) * 1.25)));
  // по нормали: стела — у края площадки со стороны улицы; если площадка
  // мелкая, ставим модель серединой глубины в середину контура
  let off = (BACK - FRONT) / 2 * s;                          // середина глубины модели
  if (f.__canopy) off = 0;
  else if (obb && D > (FRONT + BACK) * s + 8) off = D / 2 - FRONT * s - 4;   // 4 м до края: контур OSM доходит до бордюра
  else if (!obb && road) off = Math.min(off, Math.max(0, road.d - FRONT * s - 3));
  cx += nx * off; cz += nz * off;
  return { cx, cz, rot: Math.atan2(nx, nz), s, nx, nz };
}

// Дома из OSM на площадке АЗС — это операторская и навес, которые OSM рисует
// коробками со случайной высотой (бежевые блоки по 12–19 м). Модель приносит
// свои: такие дома (до 420 м², или сам контур АЗС, если в OSM он и есть навес)
// снимаем — main.js пропускает дома с hide, а в индекс стен их не кладёт.
function hideStationBoxes(f, world) {
  if (!f.poly || f.poly.length < 8) return;
  const SA = area(f.poly);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < f.poly.length; i += 2) {
    x0 = Math.min(x0, f.poly[i]); x1 = Math.max(x1, f.poly[i]);
    z0 = Math.min(z0, f.poly[i + 1]); z1 = Math.max(z1, f.poly[i + 1]);
  }
  for (const b of world.buildings || []) {
    const q = b.poly;
    if (!q || b.hide) continue;
    let cx = 0, cz = 0;
    for (let i = 0; i < q.length; i += 2) { cx += q[i]; cz += q[i + 1]; }
    cx /= q.length / 2; cz /= q.length / 2;
    if (cx < x0 - 25 || cx > x1 + 25 || cz < z0 - 25 || cz > z1 + 25) continue;
    const a = area(q);
    if (!inside(cx, cz, f.poly)) {
      // пристроенная к контуру АЗС будка-операторская (общие вершины) — тоже
      // коробка OSM со случайной высотой
      let shared = 0;
      for (let i = 0; i < q.length; i += 2)
        for (let k = 0; k < f.poly.length; k += 2)
          if (Math.abs(q[i] - f.poly[k]) < 0.3 && Math.abs(q[i + 1] - f.poly[k + 1]) < 0.3) { shared++; break; }
      if (shared >= 2 && a <= 250) { b.hide = true; b.fuelBox = true; }
      continue;
    }
    // контур АЗС совпадает с домом — значит, в OSM нарисован сам навес
    if (a >= 0.8 * SA) { b.hide = true; b.fuelBox = true; f.__canopy = true; }
    else if (a <= 420) { b.hide = true; b.fuelBox = true; }
  }
}
// Павильон модели прячем, если на его месте остался дом из OSM
function shopBlocked(world, x, z) {
  for (const b of world.buildings || []) {
    if (b.hide) continue;
    const q = b.poly;
    if (!q) continue;
    if (Math.abs(q[0] - x) > 60 || Math.abs(q[1] - z) > 60) continue;
    if (inside(x, z, q)) return true;
    let cx = 0, cz = 0;
    for (let i = 0; i < q.length; i += 2) { cx += q[i]; cz += q[i + 1]; }
    cx /= q.length / 2; cz /= q.length / 2;
    if (Math.hypot(cx - x, cz - z) < 8) return true;
  }
  return false;
}

// Подготовка АЗС квартала — ДО индекса стен (main.js, этап «дороги»):
// место и поворот моделей, дома-коробки на площадках снимаются (hide, и в
// индекс стен они не идут — помечены fuelBox), а стены павильона, опоры
// навеса и стела моделей возвращаются списком контуров для индекса стен.
export function prepFuel(world) {
  const walls = [];
  for (const f of world.fuel || []) hideStationBoxes(f, world);
  for (const f of world.fuel || []) {
    const P = plan(f, world);
    const c = Math.cos(P.rot), s = Math.sin(P.rot);
    const W = (lx, lz) => [P.cx + P.s * (lx * c + lz * s), P.cz + P.s * (-lx * s + lz * c)];
    const rect = (x0, x1, z0, z1) => ({ poly: [...W(x0, z0), ...W(x1, z0), ...W(x1, z1), ...W(x0, z1)] });
    const [shx, shz] = W(0, -11.9);
    const hideShop = shopBlocked(world, shx, shz);
    f.__fuel = { P, W, hideShop };
    if (!hideShop) walls.push(rect(-5.95, 5.95, -15.15, -8.6));
    for (const x of [-4.6, 4.6]) for (const z of [-2.7, 2.7]) walls.push(rect(x - 0.34, x + 0.34, z - 0.34, z + 0.34));
    walls.push(rect(11.4 - 1.0, 11.4 + 1.0, 7.6 - 0.3, 7.6 + 0.3));
  }
  return walls;
}

// ---------------------------------------------------------------- сборка
// Все АЗС квартала: модели сетей (приезжают асинхронно), площадки, пятна
// света и надписи нейтральных АЗС. H(x, z) — отметка площадки.
export function buildFuelStations(world, H) {
  const group = new THREE.Group();
  group.name = 'АЗС';
  const signs = [];
  let n = 0;
  if (world.fuel?.length && !world.fuel[0].__fuel) prepFuel(world);
  for (const f of world.fuel || []) {
    const b = brandOf(f);
    const name = b?.model && !(b.id === 'snp' && GAS.test(f.n || '')) ? b.model : 'azs_generic';
    const { P, W, hideShop } = f.__fuel;
    const g0 = H(P.cx, P.cz);
    const holder = new THREE.Group();
    holder.name = 'АЗС ' + (f.n || '');
    holder.position.set(P.cx, g0, P.cz);
    holder.rotation.y = P.rot;
    holder.scale.setScalar(P.s);
    group.add(holder);
    // площадка из бетонных плит: от стелы до задней стены павильона
    const pad = new THREE.Mesh(padGeo(), padMaterial());
    pad.receiveShadow = true; pad.name = 'АЗС: площадка';
    holder.add(pad);
    // ночной свет: пятно на площадке и 4 «фонаря» для шейдеров асфальта
    const pool = new THREE.InstancedMesh(poolGeo(), poolMaterial(), 1);
    pool.setMatrixAt(0, new THREE.Matrix4());
    pool.name = 'АЗС: свет навеса';
    pool.onBeforeRender = () => { POOL_MAT.opacity = 0.42 * ENV.uNight.value; };
    holder.add(pool);
    registerLamps(pool, [[-5, 4.8, -2.6], [5, 4.8, -2.6], [-5, 4.8, 2.6], [5, 4.8, 2.6]]);
    loadModel(name).then(m => {
      const lod = new THREE.LOD();
      lod.addLevel(levelOf(m.full, hideShop), 0);
      lod.addLevel(levelOf(m.low, hideShop), LOD_FAR / P.s);
      holder.add(lod);
    }).catch(e => console.warn('модель АЗС не загрузилась:', name, e));
    // нейтральной АЗС — имя из OSM на фризе (атлас вывесок)
    const sign = name === 'azs_generic' ? signOf(f) : '';
    if (sign) for (const sd of [1, -1]) {
      const [x, z] = W(0, sd * 5.33);
      signs.push({ text: sign, col: DEFAULT_COL, w: Math.min(8, 7 * P.s), h: 0.62 * P.s,
        x, y: g0 + 5.45 * P.s, z, ang: sd > 0 ? P.rot : P.rot + Math.PI });
    }
    n++;
  }
  const sm = buildFuelSigns(signs);
  if (sm) group.add(sm);
  group.userData.stats = { АЗС: n };
  return group;
}

let PAD_GEO = null, POOL_GEO = null;
function padGeo() {
  if (PAD_GEO) return PAD_GEO;
  // локальные оси модели: x вдоль навеса, +z к улице; плиты по 3 м (текстура —
  // 4 × 4 плиты на 12 м). По краям — откос до −3 м: на склоне площадка
  // стоит помостом, а не висит плитой.
  const x0 = -13, x1 = 13, z0 = -BACK - 1, z1 = FRONT - 0.6, y = 0.06, yb = -3;
  const P = [], N = [], U = [], I = [];
  const quad = (a, b, c, d, n, uv) => {
    const k = P.length / 3;
    P.push(...a, ...b, ...c, ...d); for (let i = 0; i < 4; i++) N.push(...n); U.push(...uv);
    I.push(k, k + 1, k + 2, k, k + 2, k + 3);
  };
  quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0],
    [x0 / 12, z1 / 12, x1 / 12, z1 / 12, x1 / 12, z0 / 12, x0 / 12, z0 / 12]);
  const side = (ax, az, bx, bz, nx, nz) => quad([ax, yb, az], [bx, yb, bz], [bx, y, bz], [ax, y, az], [nx, 0, nz],
    [0, yb / 12, Math.hypot(bx - ax, bz - az) / 12, yb / 12, Math.hypot(bx - ax, bz - az) / 12, 0, 0, 0]);
  side(x0, z1, x1, z1, 0, 1); side(x1, z0, x0, z0, 0, -1); side(x1, z1, x1, z0, 1, 0); side(x0, z0, x0, z1, -1, 0);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(I);
  return (PAD_GEO = g);
}
function poolGeo() {
  if (POOL_GEO) return POOL_GEO;
  const g = new THREE.PlaneGeometry(24, 16);
  g.rotateX(-Math.PI / 2); g.translate(0, 0.09, 0);
  return (POOL_GEO = g);
}

// Вывески одного квартала: все надписи — в один атлас, все щиты — одна сетка.
// items: { text, lines?, x, y, z, ang, w, h, col } — щит лицом в направлении ang
// (как BoxGeometry.rotateY(ang): лицо — локальный +z).
export function buildFuelSigns(items) {
  if (!items.length) return null;
  // Ячейка атласа — в пропорциях щита (иначе надпись на почти квадратной
  // стеле сплющена, а на длинном фризе растянута). Одинаковые щиты (две
  // стороны навеса, две стороны стелы) делят одну ячейку.
  const CW = 384, cells = new Map();
  let H = 0;
  for (const it of items) {
    const key = JSON.stringify([it.text, it.lines, it.col, it.w, it.h]);
    let c = cells.get(key);
    if (!c) {
      c = { it, h: Math.max(24, Math.min(512, Math.round(CW * it.h / it.w))) };
      c.y = H; H += c.h; cells.set(key, c);
    }
    it.cell = c;
  }
  // Высота холста не больше 8192: если щитов много — всё мельче
  const k = Math.min(1, 8192 / H);
  const cv = document.createElement('canvas');
  cv.width = Math.round(CW * k); cv.height = Math.ceil(H * k);
  const g = cv.getContext('2d');
  g.scale(k, k);
  const css = a => `rgb(${a.map(v => Math.round(v * 255)).join(',')})`;
  const fit = (text, size, maxW, w8 = 800) => {
    do { g.font = `${w8} ${size}px -apple-system, Arial`; size -= 2; } while (g.measureText(text).width > maxW && size > 8);
  };
  for (const { it, y: y0, h: CH } of cells.values()) {
    const c = it.col || DEFAULT_COL;
    g.fillStyle = css(c.board); g.fillRect(0, y0, CW, CH);
    g.fillStyle = css(c.text);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (it.lines) {
      // стела: имя сети, под ним виды топлива столбиком; видов не знаем —
      // три пустые строки табло
      const L = it.lines.length ? it.lines : [null, null, null], h = CH / (L.length + (it.text ? 1.4 : 0));
      let y = y0;
      if (it.text) { fit(it.text, Math.round(h * 0.95), CW * 0.9); g.fillText(it.text, CW / 2, y + h * 0.7); y += h * 1.4; }
      for (const l of L) {
        if (l) { fit(l, Math.round(h * 0.6), CW * 0.85, 700); g.fillText(l, CW / 2, y + h / 2); }
        else g.fillRect(CW * 0.1, y + h * 0.22, CW * 0.8, h * 0.56);
        y += h;
      }
    } else {
      fit(it.text, Math.round(CH * 0.78), CW * 0.9);
      g.fillText(it.text, CW / 2, y0 + CH / 2 + CH * 0.04);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const P = [], N = [], U = [], I = [];
  for (const it of items) {
    const ux = Math.cos(it.ang), uz = -Math.sin(it.ang);     // локальный +x после rotateY(ang)
    const fx = Math.sin(it.ang), fz = Math.cos(it.ang);      // лицо — локальный +z
    const hw = it.w / 2, hh = it.h / 2, v0 = 1 - (it.cell.y + it.cell.h) / H, v1 = 1 - it.cell.y / H;
    const b = P.length / 3;
    for (const [sx, sy, u, v] of [[-1, -1, 0, v0], [1, -1, 1, v0], [1, 1, 1, v1], [-1, 1, 0, v1]]) {
      P.push(it.x + ux * hw * sx, it.y + hh * sy, it.z + uz * hw * sx);
      N.push(fx, 0, fz); U.push(u, v);
    }
    I.push(b, b + 1, b + 2, b, b + 2, b + 3);
    delete it.cell;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  geo.setIndex(I);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.12 }));
  mesh.name = 'АЗС: вывески';
  return mesh;
}
