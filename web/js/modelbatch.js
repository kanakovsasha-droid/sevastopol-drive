import * as THREE from 'three';
import { mergeGeometries } from '../lib/BufferGeometryUtils.js?v=10448e16';

// Склейка модели здания (data/models/*.glb) в две сетки при загрузке.
//
// Модели собраны из словаря COL (models/kit.py): по сетке на материал —
// wall, wall2, roof, stone, trim, glass… — 5–10 сеток на дом, и каждая —
// вызов отрисовки в кадре, а бросающие тень — ещё один в карте теней. Волна
// с четырьмя новыми зданиями дала +20% вызовов (docs/handoff/cloud-models.md).
//
// Материалы у моделей одного вида: непрозрачные, без картинок, металл 0,
// двусторонние — различаются только цветом и шероховатостью. Плюс подсветка
// теневой стороны (emissive = 0.2 цвета), которую landmarks.js ставил всем,
// кроме glass/metal/leaf/bark. Всё это переносим в вершины: цвет — в color,
// шероховатость и долю подсветки — в атрибут mat, а шейдер общего
// материала берёт их оттуда вместо uniform-ов. Вид тот же, а сеток две:
// бросающая тень масса и мелочь без тени (наличники, металл, дерево, стёкла).
// Материал один на все модели — одна программа шейдера на весь город.

export const EMIT = 0.2;
const NO_EMIT = /^(glass|metal|leaf|bark)$/;
const NO_SHADOW = /trim$|metal|wood|glass/;

let shared = null;
function material() {
  if (shared) return shared;
  shared = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, metalness: 0 });
  shared.name = 'модели:склейка';
  shared.onBeforeCompile = s => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 mat;\nvarying vec2 vMat;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMat = mat;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vMat;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vMat.x;')
      .replace('vec3 totalEmissiveRadiance = emissive;', 'vec3 totalEmissiveRadiance = vColor.rgb * vMat.y;');
  };
  shared.customProgramCacheKey = () => 'model-batch-1';
  // Материал общий на все модели города. Выгрузка квартала (main.js,
  // drainJunk) освобождает материалы его сеток — этот освобождать нельзя:
  // программу пришлось бы собирать заново для всех остальных моделей
  // (из cloud/perf).
  shared.dispose = () => {};
  return shared;
}

// Можно ли склеить: только «наши» материалы — без картинок, непрозрачные.
const plain = m => m && m.isMeshStandardMaterial && !m.map && !m.transparent && !m.emissiveMap
  && !m.normalMap && !m.roughnessMap && !m.metalnessMap && !m.alphaMap && !m.aoMap && m.metalness === 0;

export function batchModel(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const meshes = [];
  root.traverse(o => { if (o.isMesh) meshes.push(o); });
  const groups = { cast: [], flat: [] };
  const keep = [];
  for (const o of meshes) {
    const m = o.material;
    if (Array.isArray(m) || !plain(m)) { keep.push(o); continue; }
    let g = o.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    for (const a of Object.keys(g.attributes)) if (a !== 'position' && a !== 'normal') g.deleteAttribute(a);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (g.index) g = g.toNonIndexed();
    g.morphAttributes = {};
    const n = g.attributes.position.count;
    const C = new Float32Array(n * 3), M = new Float32Array(n * 2);
    const e = NO_EMIT.test(m.name) ? 0 : EMIT;
    for (let i = 0; i < n; i++) {
      C[i * 3] = m.color.r; C[i * 3 + 1] = m.color.g; C[i * 3 + 2] = m.color.b;
      M[i * 2] = m.roughness; M[i * 2 + 1] = e;
    }
    g.setAttribute('color', new THREE.BufferAttribute(C, 3));
    g.setAttribute('mat', new THREE.BufferAttribute(M, 2));
    (NO_SHADOW.test(m.name) ? groups.flat : groups.cast).push(g);
  }
  const out = new THREE.Group();
  out.name = root.name;
  for (const [k, list] of Object.entries(groups)) {
    if (!list.length) continue;
    const geo = mergeGeometries(list, false);
    for (const g of list) g.dispose();
    if (!geo) continue;
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, material());
    mesh.name = 'склейка:' + k;
    mesh.castShadow = k === 'cast';
    mesh.receiveShadow = true;
    out.add(mesh);
  }
  // всё, что склеить нельзя (картинки, прозрачное), — как было
  for (const o of keep) {
    const c = o.clone();
    new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld).decompose(c.position, c.quaternion, c.scale);
    const m = c.material;
    if (!Array.isArray(m)) {
      c.castShadow = !NO_SHADOW.test(m.name);
      if (m.emissive && !NO_EMIT.test(m.name)) { m.emissive.copy(m.color); m.emissiveIntensity = EMIT; }
    }
    c.receiveShadow = true;
    out.add(c);
  }
  return { root: out, before: meshes.length, after: out.children.length };
}
