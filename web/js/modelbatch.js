import * as THREE from 'three';
import { mergeGeometries } from '../lib/BufferGeometryUtils.js';

// Склейка памятной модели (data/models/*.glb) в две сетки — меньше вызовов
// отрисовки.
//
// Модели собраны в Blender по сетке на материал: стена, вторая стена, камень,
// карниз, кровля, стекло, металл — до десяти сеток на здание, и каждая —
// вызов в кадре и ещё один в карте теней. Картинок у них нет, все материалы
// непрозрачные и отличаются только цветом, шероховатостью и тем, светится ли
// штукатурка (подсветка 0.2 цвета, см. landmarks.js). Всё это переносим в
// вершины: цвет — в color, шероховатость — в aRough, долю подсветки — в aEmit.
// Остаются две сетки: то, что бросает тень, и то, что не бросает (карнизы,
// стекло, металл — как и раньше). Материал один на все модели — и программа
// шейдера одна.
//
// Модель, где есть хоть что-то иное (картинка, прозрачность, цвет вершин,
// физический материал — у кедров), оставляем как есть.

let MAT = null;
function material() {
  if (MAT) return MAT;
  MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide });
  MAT.name = 'склейка модели';
  MAT.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aRough;\nattribute float aEmit;\nvarying float vRough;\nvarying float vEmit;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRough = aRough;\nvEmit = aEmit;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vRough;\nvarying float vEmit;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vRough;')
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance = vColor.rgb * vEmit;');
  };
  MAT.customProgramCacheKey = () => 'model-batch-1';
  // Материал общий на все модели города. Выгрузка квартала (main.js,
  // drainJunk) освобождает материалы его сеток — этот освобождать нельзя:
  // программу пришлось бы собирать заново для всех остальных моделей.
  MAT.dispose = () => {};
  return MAT;
}

const plain = m => m && m.type === 'MeshStandardMaterial' && !m.map && !m.vertexColors && !m.transparent &&
  !m.normalMap && !m.roughnessMap && !m.metalnessMap && !m.emissiveMap && !m.aoMap && m.metalness === 0 && m.opacity === 1;

export function batchModel(root) {
  root.updateMatrixWorld(true);
  const meshes = [];
  let ok = true;
  root.traverse(o => {
    if (!o.isMesh) return;
    if (Array.isArray(o.material) || !plain(o.material) || o.isSkinnedMesh || o.isInstancedMesh) ok = false;
    meshes.push(o);
  });
  if (!ok || meshes.length < 2) return root;
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const parts = { cast: [], free: [] };
  for (const o of meshes) {
    const m = o.material, src = o.geometry;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', src.attributes.position.clone());
    if (src.index) g.setIndex(src.index.clone());
    if (src.attributes.normal) g.setAttribute('normal', src.attributes.normal.clone());
    else g.computeVertexNormals();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    const n = g.attributes.position.count;
    const C = new Float32Array(n * 3), R = new Float32Array(n), E = new Float32Array(n);
    // подсветка — emissive·intensity в долях цвета (landmarks.js: копия цвета × 0.2)
    const emit = m.emissive && m.color.r + m.color.g + m.color.b > 0
      ? m.emissiveIntensity * (m.emissive.r + m.emissive.g + m.emissive.b) / (m.color.r + m.color.g + m.color.b) : 0;
    for (let i = 0; i < n; i++) {
      C[i * 3] = m.color.r; C[i * 3 + 1] = m.color.g; C[i * 3 + 2] = m.color.b;
      R[i] = m.roughness; E[i] = emit;
    }
    g.setAttribute('color', new THREE.BufferAttribute(C, 3));
    g.setAttribute('aRough', new THREE.BufferAttribute(R, 1));
    g.setAttribute('aEmit', new THREE.BufferAttribute(E, 1));
    (o.castShadow ? parts.cast : parts.free).push(g);
  }
  // склейке нужны либо все индексированные, либо ни одной
  for (const k in parts) if (parts[k].some(g => !g.index)) parts[k] = parts[k].map(g => g.index ? g.toNonIndexed() : g);
  const out = new THREE.Group();
  out.name = root.name;
  out.position.copy(root.position); out.quaternion.copy(root.quaternion); out.scale.copy(root.scale);
  for (const [k, list] of Object.entries(parts)) {
    if (!list.length) continue;
    const geo = mergeGeometries(list, false);
    for (const g of list) g.dispose();
    if (!geo) return root;
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, material());
    mesh.name = (root.name || 'модель') + (k === 'cast' ? ':масса' : ':детали');
    mesh.castShadow = k === 'cast';
    mesh.receiveShadow = true;
    out.add(mesh);
  }
  return out;
}
