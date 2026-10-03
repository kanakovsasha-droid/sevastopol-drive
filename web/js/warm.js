import * as THREE from 'three';

// Прогрев шейдеров: собрать программы для нового куска мира ДО того, как он
// попадёт в кадр.
//
// Three собирает программу шейдера лениво — в том кадре, где материал впервые
// рисуется. На Metal (Chrome на маке) холодная сборка одной программы стоит
// 150–600 мс, и ровно это было главными залипаниями: квартал с кладбищем,
// первый взгляд на модель здания, подъём над городом (новый вариант тени).
// compileAsync отдаёт сборку драйверу с KHR_parallel_shader_compile: программы
// собираются в фоне, а главный поток не ждёт; кусок мира показываем, когда
// всё готово.
//
// Тени отдельно: карта теней рисует предметы СВОИМ материалом глубины, и
// compile() его не видит. Его вариант зависит от предмета (инстансинг, цвет
// инстансов, сторона, атрибуты геометрии), поэтому на каждый новый вариант
// строим заместителя с тем же материалом глубины и собираем его программу
// «как в проходе теней» — с картой теней в качестве цели отрисовки: от неё
// зависят цветовое пространство и тональная коррекция в ключе программы.

const SHADOW_SIDE = { [THREE.FrontSide]: THREE.BackSide, [THREE.BackSide]: THREE.FrontSide, [THREE.DoubleSide]: THREE.DoubleSide };
const keep = [];
const seenDepth = new Set();           // варианты глубины, уже отданные на сборку
const seenMain = new Set();            // материал + вид предмета + версия материала

// Подпись геометрии для ключа программы: от неё зависят вершинные цвета,
// нормали, вторые UV и касательные.
const geoSig = g => {
  const a = g.attributes;
  return (a.normal ? 'n' : '') + (a.color ? 'c' + a.color.itemSize : '') + (a.uv1 ? 'u1' : '')
    + (a.uv2 ? 'u2' : '') + (a.uv3 ? 'u3' : '') + (a.tangent ? 't' : '')
    + (g.morphAttributes.position ? 'm' : '');
};

// Заместитель предмета для compile(): та же геометрия, тот же «вид» предмета
// (инстансинг и цвет инстансов входят в ключ программы).
function proxyOf(o, mat) {
  if (o.isInstancedMesh) {
    const p = new THREE.InstancedMesh(o.geometry, mat, 1);
    p.instanceColor = o.instanceColor;
    return p;
  }
  if (o.isPoints) return new THREE.Points(o.geometry, mat);
  if (o.isLineSegments) return new THREE.LineSegments(o.geometry, mat);
  if (o.isLine) return new THREE.Line(o.geometry, mat);
  if (o.isSprite) return new THREE.Sprite(mat);
  return new THREE.Mesh(o.geometry, mat);
}

// Ровно то, что проход теней переносит с материала предмета на свой материал
// глубины (WebGLShadowMap.getDepthMaterial): карта цвета попадает туда ВСЕГДА,
// даже без выреза по альфе, и меняет ключ программы.
function depthFor(m) {
  const d = new THREE.MeshDepthMaterial();
  d.side = m.shadowSide !== null && m.shadowSide !== undefined ? m.shadowSide : SHADOW_SIDE[m.side];
  d.map = m.map || null;
  d.alphaMap = m.alphaMap || null;
  d.alphaTest = m.alphaToCoverage === true ? 0.5 : m.alphaTest;
  d.displacementMap = m.displacementMap || null;
  d.displacementScale = m.displacementScale ?? 1;
  d.wireframe = m.wireframe;
  return d;
}
const depthSig = m => (m.shadowSide ?? SHADOW_SIDE[m.side]) + (m.map ? 'm' : '') + (m.alphaMap ? 'a' : '')
  + (m.alphaTest > 0 || m.alphaToCoverage ? 't' : '') + (m.displacementMap ? 'd' : '') + (m.wireframe ? 'w' : '');

// Собрать программы для всего, что лежит в root. Возвращает Promise, который
// выполнится, когда всё можно рисовать без ожидания сборки. Дубликаты
// отсекаются: материал, уже собранный однажды, второй раз не трогаем — в
// квартале сотни предметов на десятке материалов, и полный compile() по ним
// сам стоил бы десяток миллисекунд.
export function precompile(renderer, scene, camera, root, light = null) {
  const main = new THREE.Group(), depth = new THREE.Group();
  const keys = new Set();
  root.traverse(o => {
    if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite) || !o.material) return;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    const kind = (o.isInstancedMesh ? 'i' + (o.instanceColor ? 'c' : '') : o.type) + geoSig(o.geometry);
    for (const m of ms) {
      const k = m.uuid + kind + '|' + m.version;
      if (!keys.has(k) && !seenMain.has(k)) {
        keys.add(k);
        main.add(proxyOf(o, m));
      }
      // без карты теней (до первого кадра) вариант глубины не собрать —
      // и не помечаем его собранным, его подхватит следующий вызов
      if (light && light.shadow.map && o.castShadow && o.isMesh) {
        const dk = kind + '|' + depthSig(m);
        if (!seenDepth.has(dk)) { seenDepth.add(dk); depth.add(proxyOf(o, depthFor(m))); }
      }
    }
  });
  const waits = [];
  if (main.children.length) {
    waits.push(...renderer.compile(main, camera, scene));
    for (const k of keys) seenMain.add(k);
  }
  if (depth.children.length) {
    // Как в проходе теней: цель — карта теней (от неё цветовое пространство
    // и тональная коррекция в ключе), сцена без тумана (тени рисуются с
    // пустой сценой, и туман тоже входит в ключ), а свет — тот же, что в кадре.
    const prev = renderer.getRenderTarget(), fog = scene.fog;
    renderer.setRenderTarget(light.shadow.map);
    scene.fog = null;
    try { waits.push(...renderer.compile(depth, light.shadow.camera, scene)); }
    finally { renderer.setRenderTarget(prev); scene.fog = fog; }
  }
  // Материалы заместителей глубины НЕ освобождаем: dispose() отпустил бы
  // программу, пока проход теней её ещё ни разу не взял, — и она бы умерла,
  // не дожив до дела. Их единицы на всю игру.
  for (const p of depth.children) keep.push(p.material);
  return waitReady(renderer, waits);
}

// Ждём, пока драйвер доложит, что программы собраны. Опрос не блокирует:
// с KHR_parallel_shader_compile isReady() спрашивает статус без ожидания.
export function waitReady(renderer, materials) {
  const left = new Set(materials);
  if (!left.size) return Promise.resolve();
  return new Promise(resolve => {
    const check = () => {
      for (const m of left) {
        const p = renderer.properties.get(m).currentProgram;
        if (!p || p.isReady()) left.delete(m);
      }
      if (!left.size) resolve();
      else setTimeout(check, 16);
    };
    check();
  });
}
