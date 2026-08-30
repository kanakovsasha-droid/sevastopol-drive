import * as THREE from 'three';
import { Terrain, SEA_FLOOR } from './terrain.js?v=b1760f30';
import { buildTerrain, buildRoads, buildBuildings, buildWater } from './worldgen.js?v=b1760f30';
import { buildStreetProps } from './props.js?v=b1760f30';
import { buildFurniture } from './furniture.js?v=b1760f30';
import { buildLandmarks } from './landmarks.js?v=b1760f30';
import { buildSigns } from './signs.js?v=b1760f30';
import { audit } from './audit.js?v=b1760f30';
import { buildMap, drawMini, drawFull } from './minimap.js?v=b1760f30';
import { Collider, RoadIndex } from './collision.js?v=b1760f30';
import { Car, createCarMesh } from './vehicle.js?v=b1760f30';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

// Пауза, чтобы полоса загрузки успела перерисоваться между этапами.
// Через таймер тоже — в фоновой вкладке requestAnimationFrame не вызывается,
// и сборка мира иначе просто зависает.
const step = (text, pct) => {
  $('step').textContent = text;
  $('barfill').style.width = pct + '%';
  return new Promise(r => {
    let done = false;
    const fire = () => { if (!done) { done = true; r(); } };
    requestAnimationFrame(() => requestAnimationFrame(fire));
    setTimeout(fire, 40);
  });
};

// Точки взяты из OSM (tools/fetch-poi.mjs), а не на глаз.
const PLACES = [
  ['Отель «Севастополь»',    -379,   367],
  ['Кедр на пл. Лазарева',   -421,   570],
  ['Остановка пл. Лазарева', -398,   484],
  ["McDonald's (Мир Бургер)", -468,   539],
  ['Площадь Нахимова',        0,     0],
  ['Графская пристань',       138,  -94],
  ['Приморский бульвар',     -144,  -41],
  ['Артбухта',               -503,   270],
  ['Театр Луначарского',     -283,   272],
  ['Площадь Ушакова',        -103,  1684],
  ['Площадь Восставших',     -820,  1637],
  ['Панорама обороны 1854',  -166,  2346],
  ['Вокзал «Севастополь»',    276,  2377],
  ['Малахов курган',         1785,  1342],
  ['Ластовая площадь',       1170,   365],
  ['Ушакова балка',          2181,   185],
];

const SPAWN = { x: -398, z: 484 };   // остановка «площадь Лазарева»

// Солнце южного дня, но НЕ в зените. Было 44° над горизонтом — при такой высоте
// тени короткие, прячутся под самими домами и объём улицы не читается. 37°
// (вторая половина дня) даёт тень длиной с высоту дома: фасады делятся на
// освещённый и теневой, и коробки перестают быть плоскими наклейками.
const SUN = new THREE.Vector3(-0.58, 0.61, 0.54).normalize();

// Три уровня неба. Зенит — насыщенная синь, HORIZON — голубая дымка над бухтой,
// HAZE — тёплая полоса у самой земли: над нагретым камнем воздух всегда желтее,
// и именно этот тёплый низ отличает южный полдень от «серого купола».
const ZENITH  = new THREE.Color(0x2a68b4);
const HORIZON = new THREE.Color(0xa6c3d8);
const HAZE    = new THREE.Color(0xd3d3c8);

// Цвет тумана = то, во что упирается взгляд у горизонта. Небо над далёким
// берегом чуть синее самой кромки, поэтому берём смесь, а не чистый HAZE:
// иначе даль выбеливается в молоко и город пропадает целиком.
const FOG = HORIZON.clone().lerp(HAZE, 0.45);

let renderer, scene, camera, sun, sky;
let water = null;
let terrain, world, furniture, landmarkDefs = [], collider, roads, carMesh, car;
let cityMap = null, miniCtx = null, mapCtx = null, mapOpen = false, miniOn = true;
let mode = 'car';                              // 'car' | 'walk'
const walk = { x: 0, z: 0, yaw: 0, pitch: 0, vy: 0 };
// Орбитальная камера. ГЛАВНОЕ: yaw здесь — угол В МИРЕ, а не относительно
// кузова. Раньше он был относительным (camYaw + carYaw), и любой поворот руля
// утаскивал за собой весь обзор: мышь ставила камеру сбоку, машина входила в
// поворот — и вид уезжал сам. Плюс к этому камера «подкручивалась» за кормой на
// ходу. Ни того, ни другого больше нет: камера стоит там, куда её отвела мышь,
// и трогается только мышью. Вернуть её за корму — клавиша V.
const cam = {
  yaw: 0,          // куда смотрит камера по горизонту, радианы, ось Y мира
  pitch: 0.24,     // подъём камеры над целью по дуге, радианы
  mode: 0, dist: 1,
  pos: new THREE.Vector3(), look: new THREE.Vector3(),
};
const CAM_SENS = 0.0026;       // одна чувствительность на обе оси
const PITCH_MIN = -0.35;       // −20°: камера ниже цели, смотрим снизу вверх
const PITCH_MAX = 1.31;        // +75°: почти отвес, но не через зенит
// кратчайшая разница углов: без неё доводка на границе ±π едет длинным путём
const wrapPi = a => Math.atan2(Math.sin(a), Math.cos(a));
const CAM_MODES = ['за машиной', 'ближе', 'с капота', 'сверху'];
const keys = new Set();
let pointerLocked = false;

// ------------------------------------------------------------------ загрузка
async function boot() {
  try {
    await step('качаю город…', 6);
    const loaded = await Terrain.load('..');
    world = loaded.world; terrain = loaded.terrain;
    furniture = await fetch('../data/furniture.json?v=b1760f30').then(r => r.json());
    landmarkDefs = await fetch('../data/landmarks.json?v=b1760f30').then(r => r.json()).catch(() => []);

    await step('строю рельеф…', 20);
    initScene();
    const terrainMesh = buildTerrain(terrain, world);
    scene.add(terrainMesh);

    await step('раскладываю улицы…', 42);
    scene.add(buildRoads(world, terrain));

    await step(`поднимаю ${world.buildings.length.toLocaleString('ru')} домов…`, 58);
    const bld = buildBuildings(world, terrain);
    scene.add(bld);

    await step('готовлю столкновения…', 74);
    collider = new Collider(world.buildings);
    roads = new RoadIndex(world.roads);

    await step('сажаю деревья…', 82);
    const props = buildStreetProps(world, terrain, roads);
    scene.add(props);

    await step('ставлю остановки, скамейки и ограждения…', 90);
    const clearZones = landmarkDefs.filter(d => d.clear).map(d => ({ x: d.x, z: d.z, r: d.clear }));
    const furn = buildFurniture(furniture, terrain, roads, props.userData.onRoad, clearZones);
    scene.add(furn);

    // Деревья, фонари и остановки ставились без castShadow, и улица оставалась
    // ровным серым полотном — главная причина «роблокса» на уровне глаз.
    // В карту теней они идут только по глубине, поэтому счёт по треугольникам
    // растёт на 5–8%, а картинка получает пятнистую тень листвы на асфальте.
    castShadows(props);
    castShadows(furn);

    await step('черчу карту города…', 94);
    cityMap = buildMap(world, terrain);
    miniCtx = $('mini').getContext('2d');
    mapCtx = $('mapcv').getContext('2d');

    await step('вешаю вывески…', 95);
    const sg = buildSigns(world, terrain, roads);
    scene.add(sg);

    await step('строю памятные здания…', 96);
    const lm = buildLandmarks(world, terrain, landmarkDefs, roads);
    scene.add(lm);
    console.log('памятные здания:', lm.userData.stats);
    console.log('вывесок на фасадах:', sg.userData.count);

    car = new Car(terrain, collider);
    carMesh = createCarMesh();
    scene.add(carMesh);
    // старт — остановка «площадь Лазарева», Черноморка. respawn сам поставит
    // машину на ближайшую проезжую часть и развернёт по ходу движения.
    respawn(SPAWN.x, SPAWN.z);
    walk.x = car.pos.x; walk.z = car.pos.z;

    await step('поехали', 100);
    buildMenu();
    bindInput();
    const pc = props.userData.counts;
    console.log('улица:', pc, 'объекты OSM:', furn.userData.stats);
    $('stat').dataset.info = `${bld.userData.verts.toLocaleString('ru')} вершин · `
      + Object.entries(pc).map(([k, v]) => `${v} ${k}`).join(' · ');
    // ручка для замеров из консоли
    window.G = { THREE, scene, camera, renderer, car, world, terrain, collider, roads,
                 get info() { return renderer.info; }, walk, cam, get mode() { return mode; } };
    window.G.audit = () => audit(window.G);
    window.G.lm = lm.userData.stats;      // отчёт по достопримечательностям
    $('load').classList.add('done');
    setTimeout(() => $('load').remove(), 600);
    requestAnimationFrame(loop);
  } catch (e) {
    $('step').textContent = 'не взлетело';
    $('err').textContent = (e && e.stack) || String(e);
    console.error(e);
  }
}

// Включить отбрасывание тени у пачек InstancedMesh. receiveShadow им не даём:
// это тысячи мелких предметов, тень НА них почти не видна, а лишний семпл
// карты теней в их шейдере — уже заметные проценты кадра.
function castShadows(root) {
  root.traverse(o => { if (o.isInstancedMesh) o.castShadow = true; });
}

// ------------------------------------------------------------------ сцена
function initScene() {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  // Все материалы считаются в линейном пространстве, на экран уходит sRGB.
  // Пишем явно: если сюда попадёт LinearSRGB, картинка станет блёклой и «мыльной»,
  // а искать причину в шейдерах домов можно долго.
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Было ACESFilmic при экспозиции 1.12. ACES обесцвечивает всё, что ярче
  // середины, и сводит его к белому: небо, штукатурка и тротуар слипались в
  // одну молочную массу, а тени он же заваливал в чёрное. Neutral (Khronos PBR
  // Neutral) держит цвет до самых светов и имеет мягкий подъём в тенях —
  // черепица остаётся терракотовой, а тень под домом синеет от неба, а не
  // проваливается в дыру. Экспозиция 1.0: с Neutral запаса светов больше.
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  // PCFSoft в r185 на месте (проверено по three.core.js) — берём его вместо
  // PCFShadowMap: край тени размывается по нескольким отсчётам и не лесенкой.
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  // Воздушная перспектива. Было 0.000165 — на 2 км это 10% тумана, то есть
  // дальний берег оставался таким же насыщенным, как дом в двадцати метрах,
  // и глубины в кадре не возникало. 0.00031 даёт ~28% на 2 км и ~50% на 3 км:
  // город на том берегу бухты ещё читается, но уже отодвинут.
  scene.fog = new THREE.FogExp2(FOG.getHex(), 0.00031);

  camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.4, 40000);
  camera.position.set(0, 40, 40);

  // Небо: три пояса (зенит — дымка — тёплый низ) плюс солнечный ореол.
  // Из машины видно в основном нижнюю треть купола, поэтому важна не столько
  // синь зенита, сколько то, как она сходит к горизонту.
  sky = new THREE.Mesh(
    new THREE.SphereGeometry(18000, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        zenith:  { value: ZENITH.clone() },
        horizon: { value: HORIZON.clone() },
        haze:    { value: HAZE.clone() },
        sunDir:  { value: SUN.clone() },
      },
      vertexShader: `
        varying vec3 vDir;
        void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 zenith, horizon, haze, sunDir;
        varying vec3 vDir;
        void main(){
          vec3 d = normalize(vDir);
          float h = clamp(d.y, 0.0, 1.0);
          // Показатель < 1 растягивает синеву вниз: было 0.52, при езде синь
          // начиналась где-то над крышами, а над улицей висел ровный серый лист.
          vec3 col = mix(horizon, zenith, pow(h, 0.40));
          // Тёплая полоса дымки в нижних ~8°: у моря на юге низ неба всегда
          // светлее и желтее, и именно она отделяет дальний берег от воды.
          col = mix(haze, col, smoothstep(-0.015, 0.145, d.y));
          // Солнечный диск + широкий ореол вокруг него. Ореол сажаем на
          // яркость неба, а не поверх дымки, иначе низ выгорает в белое пятно.
          float c = max(dot(d, sunDir), 0.0);
          col += vec3(1.0, 0.92, 0.76) * (pow(c, 380.0) * 8.0 + pow(c, 6.0) * 0.26)
                 * smoothstep(-0.02, 0.10, d.y);
          // Ниже линии горизонта (видно с высоких точек) — та же дымка, но глуше.
          col = mix(haze * 0.86, col, smoothstep(-0.09, 0.0, d.y));
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  );
  sky.frustumCulled = false;
  scene.add(sky);

  // Полусферический свет — то, чем «залита» теневая сторона. Сверху небо,
  // снизу отражение от известняка набережных и от воды бухты.
  // Было 1.05 ровной заливкой: она перебивала солнце, и разница между
  // освещённой и теневой стеной почти пропадала — отсюда пластик. 0.85 хватает,
  // чтобы тени не были чёрными дырами, но солнце снова главнее неба.
  scene.add(new THREE.HemisphereLight(0x8fb9e6, 0x6d6450, 0.85));

  // Солнце тёплое, но не оранжевое: юг, вторая половина дня, воздух чистый.
  sun = new THREE.DirectionalLight(0xffeccd, 3.15);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const c = sun.shadow.camera;
  // Квадрат 370×370 м на карте 2048² — это 0.18 м на тексель (было 0.22).
  // Тень фонаря и дерева перестаёт разваливаться на ступеньки, а край
  // квадрата остаётся достаточно далеко, чтобы обрыв прятался за туманом.
  c.left = -185; c.right = 185; c.top = 185; c.bottom = -185;
  // Диапазон глубины режем по делу: солнце стоит в 420 м от игрока, дальше
  // ±290 м даёт рельеф и высота домов. Было near 10 / far 1200 — на такой
  // диапазон shadow.bias 0.0008 превращался почти в метр смещения, и тени
  // отрывались от предметов.
  c.near = 80; c.far = 820;
  c.updateProjectionMatrix();   // без этого камера остаётся 10×10 м и вся сцена в тени
  sun.shadow.bias = -0.00012;   // ≈ 9 см при диапазоне 740 м
  sun.shadow.normalBias = 0.22; // около полутора текселей — снимает акне на склонах
  scene.add(sun, sun.target);

  water = buildWater();
  scene.add(water);
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
}

// ------------------------------------------------------------------ спавн
function snapToRoad(x, z) {
  // ставим на проезжую часть, а не на тротуар и не внутрь дома
  const hit = roads.nearest(x, z, 220, r => r.c <= 3)
           || roads.nearest(x, z, 400);
  if (!hit) return { x, z, yaw: 0 };
  return { x: hit.x, z: hit.z, yaw: Math.atan2(hit.dirX, hit.dirZ) };
}
function respawn(x, z) {
  const s = snapToRoad(x, z);
  car.reset(s.x, s.z, s.yaw);
  cam.yaw = car.yaw; cam.pitch = 0.24; cam.carYaw = car.yaw;
}

// ------------------------------------------------------------------ ввод
function bindInput() {
  addEventListener('keydown', e => {
    if (e.repeat) return;
    const k = e.code;
    keys.add(k);
    if (k === 'KeyE') toggleMode();
    if (k === 'KeyC') { cam.mode = (cam.mode + 1) % CAM_MODES.length; }
    if (k === 'KeyM') { const m = $('menu'); m.classList.toggle('on'); if (m.classList.contains('on')) document.exitPointerLock?.(); }
    if (k === 'KeyR' && mode === 'car') respawn(car.pos.x, car.pos.z);
    if (k === 'KeyV') { cam.yaw = car.yaw; cam.pitch = 0.24; cam.dist = 1; }   // вернуть камеру за корму
    if (k === 'KeyN') { miniOn = !miniOn; document.body.classList.toggle('nomap', !miniOn); }
    if (k === 'KeyH') document.body.classList.toggle('nohud');
    if (k === 'Tab') { toggleMap(); e.preventDefault(); }
    if (k === 'Escape') { $('menu').classList.remove('on'); if (mapOpen) toggleMap(); }
    if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab'].includes(k)) e.preventDefault();
  });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('wheel', e => {
    cam.dist = clamp(cam.dist + e.deltaY * 0.012, 0.45, 3.2);
    e.preventDefault();
  }, { passive: false });
  addEventListener('blur', () => keys.clear());

  $('mapcv').addEventListener('click', mapClick);
  renderer.domElement.addEventListener('click', () => {
    if (!$('menu').classList.contains('on')) renderer.domElement.requestPointerLock();
  });
  document.addEventListener('pointerlockchange', () => {
    pointerLocked = document.pointerLockElement === renderer.domElement;
  });
  addEventListener('mousemove', e => {
    if (!pointerLocked) return;
    if (mode === 'walk') {
      walk.yaw -= e.movementX * 0.0022;
      walk.pitch = clamp(walk.pitch - e.movementY * 0.0022, -1.35, 1.35);
    } else {
      // Шаг 2-3 спецификации: смещение мыши × чувствительность → углы.
      // X крутит вокруг мировой оси Y, Y наклоняет по дуге.
      // Знак Y: мышь вперёд (movementY < 0) должна ПОДНИМАТЬ взгляд, то есть
      // опускать камеру по дуге — значит pitch убывает. Отсюда плюс.
      cam.yaw = wrapPi(cam.yaw - e.movementX * CAM_SENS);
      cam.pitch = clamp(cam.pitch + e.movementY * CAM_SENS, PITCH_MIN, PITCH_MAX);
    }
  });
}

// клик по карте — переехать в эту точку
function mapClick(e) {
  if (!mapOpen || !cityMap) return;
  const cv = $('mapcv'), r = cv.getBoundingClientRect();
  const sx = (e.clientX - r.left) * cv.width / r.width;
  const sy = (e.clientY - r.top) * cv.height / r.height;
  const k = Math.min(cv.width / cityMap.W, cv.height / cityMap.H) * 0.94;
  const ox = (cv.width - cityMap.W * k) / 2, oy = (cv.height - cityMap.H * k) / 2;
  const PX = 0.42;
  const x = (sx - ox) / k / PX + cityMap.minX;
  const z = (sy - oy) / k / PX + cityMap.minZ;
  if (mode === 'car') respawn(x, z);
  else { const s = snapToRoad(x, z); walk.x = s.x; walk.z = s.z; }
  toggleMap();
}

function toggleMap() {
  mapOpen = !mapOpen;
  $('mapfull').classList.toggle('on', mapOpen);
  if (mapOpen) {
    document.exitPointerLock?.();
    const cv = $('mapcv');
    const k = Math.min(innerWidth * 0.96 / cityMap.W, innerHeight * 0.92 / cityMap.H);
    cv.width = Math.round(cityMap.W * k);
    cv.height = Math.round(cityMap.H * k);
    drawMap();
  }
}

function drawMap() {
  if (!mapOpen || !cityMap) return;
  const cv = $('mapcv');
  const px = mode === 'car' ? car.pos.x : walk.x;
  const pz = mode === 'car' ? car.pos.z : walk.z;
  const yaw = mode === 'car' ? car.yaw : walk.yaw;
  const marks = landmarkDefs.map(d => ({ name: d.name, x: d.x, z: d.z }))
    .concat(PLACES.slice(0, 6).map(([n, x, z]) => ({ name: n, x, z })));
  drawFull(cv.getContext('2d'), cityMap, cv.width, cv.height, px, pz, yaw, marks);
}

function buildMenu() {
  const box = $('jumps');
  const list = PLACES.slice();
  for (const d of landmarkDefs) if (!list.some(p => p[0] === d.name)) list.unshift([d.name, d.x, d.z]);
  for (const [name, x, z] of list) {
    const b = document.createElement('button');
    b.className = 'jump';
    const h = terrain.heightAt(x, z);
    b.innerHTML = `<span>${name}</span><small>${h.toFixed(0)} м над морем</small>`;
    b.onclick = () => {
      if (mode === 'car') respawn(x, z);
      else { const s = snapToRoad(x, z); walk.x = s.x; walk.z = s.z; }
      $('menu').classList.remove('on');
    };
    box.appendChild(b);
  }
}

function toggleMode() {
  if (mode === 'car') {
    mode = 'walk';
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    walk.x = car.pos.x - fz * 2.2;      // выходим вбок, а не в стену
    walk.z = car.pos.z + fx * 2.2;
    walk.yaw = car.yaw;                 // выходим и смотрим туда же, куда ехали
    walk.pitch = 0;
    document.body.classList.add('walk');
    $('mode').textContent = 'Пешком';
  } else {
    const d = Math.hypot(walk.x - car.pos.x, walk.z - car.pos.z);
    if (d > 4.5) return;                // до машины надо дойти
    mode = 'car';
    document.body.classList.remove('walk');
    $('mode').textContent = 'За рулём';
  }
}

// ------------------------------------------------------------------ пешком
function updateWalk(dt) {
  const run = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const sp = run ? 5.6 : 2.1;
  let fx = 0, fz = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) fz += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) fz -= 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) fx -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) fx += 1;
  const l = Math.hypot(fx, fz);
  if (l > 0) {
    fx /= l; fz /= l;
    const s = Math.sin(walk.yaw), c = Math.cos(walk.yaw);
    // «Вправо» при взгляде (sin, cos) и оси Y вверх — это (-cos, sin).
    // Со старым (cos, -sin) клавиша D уводила влево.
    let dx = (fz * s - fx * c) * sp * dt;
    let dz = (fz * c + fx * s) * sp * dt;
    const nx = walk.x + dx, nz = walk.z + dz;
    if (terrain.gridHeightAt(nx, nz) > -0.6) { walk.x = nx; walk.z = nz; }  // в бухту не заходим
  }
  const p = new THREE.Vector3(walk.x, 0, walk.z);
  collider.resolve(p, 0.45);
  walk.x = p.x; walk.z = p.z;
}

// ------------------------------------------------------------------ камера
function updateCamera(dt) {
  if (mode === 'walk') {
    const eye = terrain.gridHeightAt(walk.x, walk.z) + 1.68;
    camera.position.set(walk.x, eye, walk.z);
    camera.rotation.set(0, 0, 0);
    // Камера Three смотрит вдоль -Z, а «вперёд» в этом мире — +(sin, cos):
    // так едет машина, так же считается направление на миникарте. Без разворота
    // на пол-оборота W уводил назад, и стрелка на карте смотрела в затылок.
    camera.rotateY(walk.yaw + Math.PI);
    // Разворот на пол-оборота развернул и локальную ось X, поэтому наклон
    // пошёл в обратную сторону: мышь вверх опускала взгляд. Меняем знак.
    camera.rotateX(-walk.pitch);
    return;
  }
  // ------------------------------------------------------- камера как в GTA
  // Орбита: камера всегда на сфере радиуса dist вокруг точки привязки (крыша
  // машины) и всегда смотрит строго в эту точку. Мышь меняет только два угла
  // сферы, положение считается из них — поэтому горизонт не пляшет и крена нет.
  //
  //   позиция = цель + R · ( −sin(yaw)·cos(pitch),  sin(pitch),  −cos(yaw)·cos(pitch) )
  //
  // Минус перед sin/cos yaw — потому что yaw задаёт направление ВЗГЛЯДА, а
  // камера стоит на противоположном конце радиуса. cos(pitch) сжимает
  // горизонтальный вынос при подъёме: на 75° камера почти над машиной.
  const conf = [
    { back: 7.6, aim: 1.55 },
    { back: 5.0, aim: 1.40 },
    { back: -0.35, aim: 1.20 },   // из салона
    { back: 13.5, aim: 1.80 },
  ][cam.mode];

  // Автодоводки за корму НЕТ. Камера стоит там, куда её отвела мышь, и сама
  // никуда не едет: на ходу она «подкручивалась» за кузовом, и на каждом
  // повороте руля обзор уплывал сам собой — смотреть было невозможно.
  // Вернуть камеру за корму — клавиша V.
  // Исключение — вид из салона: там камера сидит в голове водителя, и голова
  // обязана поворачиваться вместе с кузовом. Прибавляем ровно то, на сколько
  // за кадр повернулась машина, — мышью наведённое смещение при этом цело.
  if (cam.carYaw === undefined) cam.carYaw = car.yaw;
  if (cam.mode === 2) cam.yaw = wrapPi(cam.yaw + wrapPi(car.yaw - cam.carYaw));
  cam.carYaw = car.yaw;

  const yaw = cam.yaw;
  cam.pitch = clamp(cam.pitch, PITCH_MIN, PITCH_MAX);   // зажимаем само хранимое значение
  const pit = cam.pitch;
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const cp = Math.cos(pit), sp2 = Math.sin(pit);

  // точка привязки — над машиной, а не в её центре: иначе кузов закрывает пол-экрана
  const aim = new THREE.Vector3(car.pos.x, car.pos.y + conf.aim, car.pos.z);

  let want;
  if (cam.mode === 2) {
    // из салона: камера в голове водителя, радиус нулевой, наклон отдаём взгляду
    want = new THREE.Vector3(car.pos.x - fx * conf.back, car.pos.y + conf.aim, car.pos.z - fz * conf.back);
    aim.set(want.x + fx * 10 * cp, want.y + 10 * -sp2 + 0.6, want.z + fz * 10 * cp);
  } else {
    const speedPull = clamp(Math.abs(car.vLong) / 55, 0, 1);
    const R = conf.back * (1 + speedPull * 0.20) * cam.dist;
    want = new THREE.Vector3(
      aim.x - fx * R * cp,
      aim.y + R * sp2,
      aim.z - fz * R * cp,
    );
    // Земля и стены. Радиус не рвём рывком: подтягиваем камеру по прямой к
    // цели, пока не выйдет из препятствия — так делает и оригинал.
    const ground = terrain.gridHeightAt(want.x, want.z) + 0.9;
    if (want.y < ground) want.y = ground;
    for (let k = 0; k < 3; k++) {
      const probe = new THREE.Vector3(want.x, 0, want.z);
      if (!collider.resolve(probe, 0.6)) break;
      want.lerp(aim, 0.32);
      want.y = Math.max(want.y, terrain.gridHeightAt(want.x, want.z) + 0.9);
    }
  }

  // Сглаживаем только ПОЛОЖЕНИЕ: цель берём точную, поэтому мышь двигает
  // картинку один в один, а неровности дороги камера всё равно съедает.
  const k = cam.mode === 2 ? 1 : 1 - Math.exp(-dt * 11);
  cam.pos.lerp(want, k);
  cam.look.copy(aim);

  camera.position.copy(cam.pos);
  if (car.crash > 0.02) {                    // тряска от удара
    const s = car.crash * 0.35;
    camera.position.x += (Math.random() - 0.5) * s;
    camera.position.y += (Math.random() - 0.5) * s;
  }
  // Шаг 5 спецификации: крена нет вообще. up жёстко в мировой зенит, и lookAt
  // строит базис от него — горизонт всегда параллелен нижней кромке экрана,
  // что бы ни делал кузов.
  camera.up.set(0, 1, 0);
  camera.lookAt(cam.look);
}

// ------------------------------------------------------------------ HUD
let fpsAcc = 0, fpsN = 0, hudT = 0, lastStreet = null;
function updateHUD(dt) {
  fpsAcc += dt; fpsN++;
  hudT += dt;
  if (hudT < 0.12) return;
  hudT = 0;

  const px = mode === 'car' ? car.pos.x : walk.x;
  const pz = mode === 'car' ? car.pos.z : walk.z;

  const hit = roads.nearest(px, pz, mode === 'car' ? 22 : 14);
  const name = hit?.road?.n || null;
  if (name !== lastStreet) {
    lastStreet = name;
    const el = $('street');
    el.textContent = name || 'без названия';
    el.classList.toggle('none', !name);
  }

  const kmh = mode === 'car' ? car.kmh : 0;
  const el = $('kmh');
  el.textContent = Math.abs(Math.round(kmh));
  el.classList.toggle('rev', kmh < -0.5);
  $('gaugefill').style.width = clamp(Math.abs(kmh) / 215 * 100, 0, 100) + '%';

  $('fps').textContent = Math.round(fpsN / fpsAcc) + ' fps';
  fpsAcc = 0; fpsN = 0;
  $('coord').textContent = `${px > 0 ? '+' : ''}${px.toFixed(0)}, ${pz > 0 ? '+' : ''}${pz.toFixed(0)} м`;
  $('alt').textContent = terrain.gridHeightAt(px, pz).toFixed(0) + ' м над морем';

  const near = Math.hypot(walk.x - car.pos.x, walk.z - car.pos.z) < 4.5;
  $('prompt').classList.toggle('on', mode === 'walk' && near);

  if (miniOn && miniCtx && cityMap) {
    const yaw = mode === 'car' ? car.yaw : walk.yaw;
    drawMini(miniCtx, cityMap, px, pz, yaw, 200, 320);
  }
  if (mapOpen) drawMap();
}

// ------------------------------------------------------------------ цикл
let prev = performance.now();
function loop(now) {
  const dt = Math.min((now - prev) / 1000, 0.1);
  prev = now;
  const wu = water?.material?.userData?.uniforms;
  if (wu) wu.uTime.value = now / 1000;

  if (mode === 'car') {
    const menuOpen = $('menu').classList.contains('on');
    car.update(dt, {
      throttle: menuOpen ? 0 : (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0),
      steer: menuOpen ? 0 : (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0),
      handbrake: !menuOpen && keys.has('Space'),
    });
  } else if (!$('menu').classList.contains('on')) {
    updateWalk(dt);
  }

  carMesh.position.copy(car.pos);
  carMesh.rotation.set(0, 0, 0);
  carMesh.rotateY(car.yaw);
  carMesh.rotateX(car.pitch);
  carMesh.rotateZ(car.roll);
  // колёса ходят вертикально каждое своё — кузов плитой земле не следует
  const ws = carMesh.userData.wheels;
  if (ws) for (let i = 0; i < ws.length && i < 4; i++) ws[i].position.y = 0.34 + car.wheelDrop[i];
  const w = carMesh.userData.wheels;
  for (let i = 0; i < 4; i++) {
    w[i].rotation.set(0, i < 2 ? car.steerVis : 0, 0);
    w[i].rotateX(car.wheelSpin);
  }

  // тень едет за игроком, иначе карты теней не хватит на 5 км
  const t = mode === 'car' ? car.pos : new THREE.Vector3(walk.x, terrain.gridHeightAt(walk.x, walk.z), walk.z);
  sun.target.position.copy(t);
  sun.position.copy(t).addScaledVector(SUN, 420);
  sky.position.copy(camera.position);

  updateCamera(dt);
  updateHUD(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

boot();
