import * as THREE from 'three';
import { mergeGeometries } from '../lib/BufferGeometryUtils.js';
import { LAMPS } from './carlights.js';

// Атлас материалов машины: у E63 в файле 92 сетки и 85 материалов — каждая
// своим вызовом отрисовки, а машина в кадре всегда. Здесь все непрозрачные
// детали одного узла (кузов, каждое колесо) сливаются в ОДНУ сетку с ОДНИМ
// материалом.
//
// Как: картинки материалов — слоями одного массива текстур (sampler2DArray,
// 512×512 на слой). Обычный атлас-лист тут не годится: у половины деталей
// UV уходят за 0..1 до ±80 — текстура повторяется, а в листе повтор залез бы
// в соседнюю картинку. У слоя массива повтор свой. Что у материала было
// своего, едет в вершины: цвет (baseColorFactor), номер слоя (−1 — без
// картинки), шероховатость и металл.
//
// Не трогаем (остаются своими сетками): прозрачное (стёкла), светопропускание
// и клиркоут, всё светящееся, фары и фонари — материалы из списка LAMPS
// в carlights.js (он зажигает их по имени, каждому свой цвет и силу; у W212
// среди них и непрозрачные: Color_A06, M_0132_LightGray…), спидометр (своё
// смещение картинки), с картами нормалей/шероховатости — у E63 таких нет.
// Бамперы, решётка и прочее у носа и кормы теперь сливаются: лампами они
// больше не считаются. Односторонние и
// двусторонние детали (у W212 все двусторонние) сливаются порознь.

const SIDE_KEY = { [THREE.FrontSide]: 'f', [THREE.DoubleSide]: 'd' };

const LAYER = 512;
const KEEP = /speed/i;

function mergeable(o) {
  if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || Array.isArray(o.material)) return false;
  const m = o.material, g = o.geometry;
  if (!m.isMeshStandardMaterial || LAMPS[m.name] || KEEP.test(m.name || '')) return false;
  if (m.transparent || m.opacity < 1 || m.alphaTest > 0 || m.side === THREE.BackSide) return false;
  if (m.transmission > 0 || m.clearcoat > 0 || m.sheen > 0 || m.iridescence > 0) return false;
  if (m.emissiveMap || (m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0)) return false;
  if (m.normalMap || m.roughnessMap || m.metalnessMap || m.aoMap || m.alphaMap || m.lightMap || m.bumpMap || m.displacementMap) return false;
  const t = m.map;
  if (t && (t.channel !== 0 || t.offset.x || t.offset.y || t.repeat.x !== 1 || t.repeat.y !== 1 || t.rotation)) return false;
  if (!g.attributes.position || !g.attributes.normal || g.morphAttributes.position) return false;
  return true;
}

// Слои массива: картинка → номер. Всё рисуем в 512×512 (мелкие растягиваем,
// крупные 1024 ужимаем — на машине в кадре разницы нет, а видеопамяти втрое
// меньше, чем у полусотни отдельных картинок с мипами).
function buildArray(images) {
  // без картинок (W212) — один белый пиксель: пустой массив WebGL не примет
  const S = images.length ? LAYER : 1, n = Math.max(1, images.length);
  const data = new Uint8Array(S * S * 4 * n).fill(255);
  if (images.length) {
    const cv = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(S, S)
      : Object.assign(document.createElement('canvas'), { width: S, height: S });
    const g = cv.getContext('2d', { willReadFrequently: true });
    images.forEach((img, i) => {
      g.clearRect(0, 0, S, S);
      g.drawImage(img, 0, 0, S, S);
      data.set(g.getImageData(0, 0, S, S).data, i * S * S * 4);
    });
  }
  const tex = new THREE.DataArrayTexture(data, S, S, n);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function atlasMaterial(arr, env, envI, side) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, envMap: env || null, envMapIntensity: envI, side });
  mat.name = 'car-atlas';
  mat.customProgramCacheKey = () => 'car-atlas';
  mat.onBeforeCompile = sh => {
    sh.uniforms.uCarArr = { value: arr };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aLayer;
attribute vec2 aRM;
flat varying float vLayer;
varying vec2 vRM;
varying vec2 vAUv;`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>
vLayer = aLayer; vRM = aRM; vAUv = uv;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform highp sampler2DArray uCarArr;
flat varying float vLayer;
varying vec2 vRM;
varying vec2 vAUv;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
if (vLayer > -0.5) diffuseColor *= texture(uCarArr, vec3(vAUv, vLayer));`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vRM.x;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vRM.y;');
  };
  return mat;
}

// Сливает непрозрачные детали внутри root. Возвращает { before, after } —
// сколько сеток было и стало.
export function atlasCarModel(root) {
  root.updateMatrixWorld(true);
  // группа — узел (кузов, колесо) и сторона
  const byParent = new Map();
  let before = 0;
  root.traverse(o => {
    if (o.isMesh) before++;
    if (!mergeable(o)) return;
    const k = o.parent.uuid + SIDE_KEY[o.material.side];
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k).push(o);
  });
  const imgIdx = new Map(), images = [];
  for (const list of byParent.values()) for (const o of list) {
    const img = o.material.map?.image;
    if (img && !imgIdx.has(img)) { imgIdx.set(img, images.length); images.push(img); }
  }
  if (!byParent.size) return { before, after: before };
  const arr = buildArray(images);
  const first = byParent.values().next().value[0].material;
  const mats = {};
  const matFor = side => mats[side] ||= atlasMaterial(arr, first.envMap, first.envMapIntensity ?? 1, side);

  const inv = new THREE.Matrix4(), m4 = new THREE.Matrix4();
  const dropped = new Set();
  for (const list of byParent.values()) {
    if (list.length < 2 && !list[0].material.map) continue;    // одной детали без картинки сливать нечего
    const parent = list[0].parent;
    inv.copy(parent.matrixWorld).invert();
    const geos = list.map(o => {
      const src = o.geometry, m = o.material;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', src.attributes.position.clone());
      g.setAttribute('normal', src.attributes.normal.clone());
      const n = src.attributes.position.count;
      g.setAttribute('uv', src.attributes.uv ? src.attributes.uv.clone() : new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
      const col = new Float32Array(n * 3), lay = new Float32Array(n), rm = new Float32Array(n * 2);
      const L = m.map?.image && imgIdx.has(m.map.image) ? imgIdx.get(m.map.image) : -1;
      for (let i = 0; i < n; i++) {
        col[i * 3] = m.color.r; col[i * 3 + 1] = m.color.g; col[i * 3 + 2] = m.color.b;
        lay[i] = L; rm[i * 2] = m.roughness; rm[i * 2 + 1] = m.metalness;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setAttribute('aLayer', new THREE.BufferAttribute(lay, 1));
      g.setAttribute('aRM', new THREE.BufferAttribute(rm, 2));
      if (src.index) g.setIndex(src.index.clone());
      else g.setIndex([...Array(n).keys()]);
      g.applyMatrix4(m4.multiplyMatrices(inv, o.matrixWorld));
      return g;
    });
    const geo = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!geo) continue;
    geo.computeBoundingBox(); geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, matFor(list[0].material.side));
    mesh.name = (parent.name || 'car') + ': атлас';
    mesh.castShadow = list.some(o => o.castShadow);
    mesh.receiveShadow = list.some(o => o.receiveShadow);
    parent.add(mesh);
    for (const o of list) { o.removeFromParent(); o.geometry.dispose(); dropped.add(o.material); }
  }
  // картинки слитых материалов больше не нужны (они в массиве), если их не
  // держит оставшийся материал
  const kept = new Set(), keptImg = new Set();
  root.traverse(o => {
    if (o.isMesh) for (const m of [].concat(o.material)) for (const v of Object.values(m)) if (v?.isTexture) { kept.add(v); keptImg.add(v.image); }
  });
  for (const m of dropped) {
    if (m.map && !kept.has(m.map)) { if (!keptImg.has(m.map.image)) m.map.image?.close?.(); m.map.dispose(); }
    m.dispose();
  }
  let after = 0;
  root.traverse(o => { if (o.isMesh) after++; });
  root.userData.atlas = { before, after, layers: images.length };
  return root.userData.atlas;
}
