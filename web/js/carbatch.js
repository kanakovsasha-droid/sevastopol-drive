import * as THREE from 'three';
import { mergeGeometries } from '../lib/BufferGeometryUtils.js?v=2df4b869';

// Склейка модели машины по материалам — меньше вызовов отрисовки.
//
// В e63.glb кузов — 92 сетки, по одной на материал, и каждая — отдельный
// вызов в кадре и ещё один в карте теней. Разбор картинок показал, что
// склеивать есть что:
//  • ~20 картинок цвета — сплошная заливка (чёрная, тёмно-серая): им не
//    нужна текстура, хватит цвета материала;
//  • одна и та же картинка загружена по копии на материал (фары — 11 копий
//    одной 1024×1024): сводим к одной текстуре — меньше видеопамяти, и
//    материалы становятся одинаковыми;
//  • после этого у десятков материалов одни и те же шероховатость, металл,
//    прозрачность и картинка — отличаются только цветом. Такие сетки
//    сливаем в одну, а цвет переносим в вершины.
// Не трогаем то, по чему работает свет машины (фары, фонари, стёкла,
// спидометр — carlights.js ищет их по имени материала) и прозрачное.

const KEEP = /light|glass|red_glass|speed|salon0111|tr0021/i;
const cv = typeof document !== 'undefined' ? document.createElement('canvas') : null;
if (cv) cv.width = cv.height = 32;

// Сводка картинки по уменьшенной копии 32×32: средний цвет, разброс и отпечаток.
function probe(img, cache) {
  if (cache.has(img)) return cache.get(img);
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.clearRect(0, 0, 32, 32);
  g.drawImage(img, 0, 0, 32, 32);
  const d = g.getImageData(0, 0, 32, 32).data;
  const s = [0, 0, 0], s2 = [0, 0, 0];
  let h = 2166136261;
  for (let i = 0; i < d.length; i += 4) {
    for (let k = 0; k < 3; k++) { s[k] += d[i + k]; s2[k] += d[i + k] * d[i + k]; }
    h = Math.imul(h ^ (d[i] >> 2) ^ ((d[i + 1] >> 2) << 6) ^ ((d[i + 2] >> 2) << 12), 16777619);
  }
  const n = d.length / 4;
  const mean = s.map(v => v / n);
  const sd = Math.max(...s2.map((v, k) => Math.sqrt(Math.max(0, v / n - mean[k] ** 2))));
  const r = { mean, sd, key: `${img.width}x${img.height}:${h >>> 0}` };
  cache.set(img, r);
  return r;
}

export function batchCar(root) {
  if (!cv) return { before: 0, after: 0 };
  const wheels = new Set(root.userData.wheels || []);
  const body = root.children.find(o => !wheels.has(o));
  if (!body) return { before: 0, after: 0 };
  body.updateMatrixWorld(true);
  const cache = new Map(), shared = new Map();
  const meshes = [];
  body.traverse(o => { if (o.isMesh && !Array.isArray(o.material)) meshes.push(o); });
  const before = meshes.length;
  let flat = 0, dedup = 0;

  // 1–2. однотонные картинки → цвет; одинаковые → одна текстура
  for (const o of meshes) {
    const m = o.material;
    if (!m.map || !m.map.image || KEEP.test(m.name)) continue;
    const p = probe(m.map.image, cache);
    if (p.sd <= 1.5) {
      m.color.multiply(new THREE.Color().setRGB(p.mean[0] / 255, p.mean[1] / 255, p.mean[2] / 255, THREE.SRGBColorSpace));
      m.map = null; m.needsUpdate = true; flat++;
    } else if (shared.has(p.key)) {
      if (shared.get(p.key) !== m.map) { m.map = shared.get(p.key); m.needsUpdate = true; dedup++; }
    } else shared.set(p.key, m.map);
  }

  // 3. группы одинаковых материалов (кроме цвета)
  const groups = new Map();
  for (const o of meshes) {
    const m = o.material;
    if (KEEP.test(m.name) || m.transparent || m.isMeshPhysicalMaterial || m.emissiveMap || m.normalMap
        || m.roughnessMap || m.metalnessMap || m.alphaMap || m.aoMap) continue;
    const key = [m.type, m.map ? m.map.uuid : '-', m.side, m.roughness.toFixed(3), m.metalness.toFixed(3),
      m.emissive.getHexString(), m.emissiveIntensity, m.envMap ? m.envMap.uuid : '-', m.envMapIntensity, m.alphaTest].join('|');
    let g = groups.get(key); if (!g) groups.set(key, g = []);
    g.push(o);
  }
  const inv = new THREE.Matrix4().copy(body.matrixWorld).invert();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const hasMap = !!list[0].material.map;
    const geos = [];
    for (const o of list) {
      let g = o.geometry.clone();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      for (const a of Object.keys(g.attributes)) if (a !== 'position' && a !== 'normal' && !(hasMap && a === 'uv')) g.deleteAttribute(a);
      if (!g.attributes.normal) g.computeVertexNormals();
      if (hasMap && !g.attributes.uv) { g.dispose(); g = null; break; }
      if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
      const c = o.material.color, n = g.attributes.position.count, C = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { C[i * 3] = c.r; C[i * 3 + 1] = c.g; C[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(C, 3));
      g.morphAttributes = {};
      geos.push(g);
    }
    if (geos.length !== list.length) continue;
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    const mat = list[0].material.clone();
    mat.vertexColors = true; mat.color.set(0xffffff);
    mat.name = 'склейка:' + list[0].material.name;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = mat.name;
    mesh.castShadow = list.some(o => o.castShadow); mesh.receiveShadow = true;
    body.add(mesh);
    for (const o of list) { o.removeFromParent(); o.geometry.dispose(); }
  }
  let after = 0;
  body.traverse(o => { if (o.isMesh) after++; });
  return { before, after, flat, dedup };
}
