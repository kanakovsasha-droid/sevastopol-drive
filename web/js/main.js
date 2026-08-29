import * as THREE from 'three';
import { Terrain, SEA_FLOOR } from './terrain.js?v=7463a26d';
import { buildTerrain, buildRoads, buildBuildings, buildWater } from './worldgen.js?v=7463a26d';
import { buildStreetProps } from './props.js?v=7463a26d';
import { buildFurniture } from './furniture.js?v=7463a26d';
import { buildLandmarks } from './landmarks.js?v=7463a26d';
import { buildSigns } from './signs.js?v=7463a26d';
import { audit } from './audit.js?v=7463a26d';
import { buildMap, drawMini, drawFull } from './minimap.js?v=7463a26d';
import { Collider, RoadIndex } from './collision.js?v=7463a26d';
import { Car, createCarMesh } from './vehicle.js?v=7463a26d';

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
const SUN = new THREE.Vector3(-0.48, 0.70, 0.53).normalize();
const HORIZON = new THREE.Color(0x9fb4bf);

let renderer, scene, camera, sun, sky;
let water = null;
let terrain, world, furniture, landmarkDefs = [], collider, roads, carMesh, car;
let cityMap = null, miniCtx = null, mapCtx = null, mapOpen = false, miniOn = true;
let mode = 'car';                              // 'car' | 'walk'
const walk = { x: 0, z: 0, yaw: 0, pitch: 0, vy: 0 };
const cam = { yaw: 0, pitch: 0, mode: 0, dist: 1, pos: new THREE.Vector3(), look: new THREE.Vector3() };
const CAM_MODES = ['за машиной', 'ближе', 'с капота', 'сверху'];
const keys = new Set();
let pointerLocked = false;

// ------------------------------------------------------------------ загрузка
async function boot() {
  try {
    await step('качаю город…', 6);
    const loaded = await Terrain.load('..');
    world = loaded.world; terrain = loaded.terrain;
    furniture = await fetch('../data/furniture.json?v=7463a26d').then(r => r.json());
    landmarkDefs = await fetch('../data/landmarks.json?v=7463a26d').then(r => r.json()).catch(() => []);

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
    $('load').classList.add('done');
    setTimeout(() => $('load').remove(), 600);
    requestAnimationFrame(loop);
  } catch (e) {
    $('step').textContent = 'не взлетело';
    $('err').textContent = (e && e.stack) || String(e);
    console.error(e);
  }
}

// ------------------------------------------------------------------ сцена
function initScene() {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;  // PCFSoft выпилен в r185
  document.body.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(HORIZON.getHex(), 0.000165);

  camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.4, 40000);
  camera.position.set(0, 40, 40);

  // небо: градиент + солнечный ореол; крымский полдень с дымкой над бухтой
  sky = new THREE.Mesh(
    new THREE.SphereGeometry(18000, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        zenith:  { value: new THREE.Color(0x1d4f86) },
        horizon: { value: HORIZON.clone() },
        sunDir:  { value: SUN.clone() },
      },
      vertexShader: `
        varying vec3 vDir;
        void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 zenith, horizon, sunDir;
        varying vec3 vDir;
        void main(){
          vec3 d = normalize(vDir);
          float h = clamp(d.y, 0.0, 1.0);
          vec3 col = mix(horizon, zenith, pow(h, 0.52));
          float c = max(dot(d, sunDir), 0.0);
          col += vec3(1.0, 0.93, 0.80) * (pow(c, 340.0) * 9.0 + pow(c, 7.0) * 0.30);
          col = mix(horizon * 0.88, col, smoothstep(-0.10, 0.05, d.y));
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  );
  sky.frustumCulled = false;
  scene.add(sky);

  scene.add(new THREE.HemisphereLight(0x9fc4e8, 0x8a7d66, 1.05));
  sun = new THREE.DirectionalLight(0xfff2dc, 3.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const c = sun.shadow.camera;
  c.left = -230; c.right = 230; c.top = 230; c.bottom = -230; c.near = 10; c.far = 1200;
  c.updateProjectionMatrix();   // без этого камера остаётся 10×10 м и вся сцена в тени
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.6;
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
  cam.yaw = 0; cam.pitch = 0;
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
    if (k === 'KeyV') { cam.yaw = 0; cam.pitch = 0; cam.dist = 1; }   // сбросить обзор
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
      // как в GTA: обзор остаётся там, куда его отвели, сам не отскакивает
      cam.yaw -= e.movementX * 0.0030;
      cam.pitch = clamp(cam.pitch - e.movementY * 0.0024, -0.75, 1.05);
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
  const yaw = car.yaw + cam.yaw;
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const conf = [
    { back: 7.4, up: 3.0, ahead: 7 },
    { back: 4.6, up: 2.0, ahead: 6 },
    { back: -0.6, up: 1.55, ahead: 12 },
    { back: 13, up: 9.5, ahead: 6 },
  ][cam.mode];

  const speedPull = clamp(Math.abs(car.vLong) / 55, 0, 1);
  const back = conf.back * (1 + speedPull * 0.22) * cam.dist;
  // Мышь по вертикали ПОДНИМАЛА камеру, а не вращала обзор: она просто
  // прибавлялась к высоте. Теперь камера ходит по сфере вокруг машины —
  // вверх уводит её выше и назад, вниз прижимает к дороге, как в GTA.
  // Камера держится на ОДНОЙ высоте за машиной. Мышь по вертикали не двигает
  // её вверх-вниз (от этого обзор ездил лифтом), а только наклоняет взгляд.
  let want = new THREE.Vector3(
    car.pos.x - fx * back,
    car.pos.y + conf.up,
    car.pos.z - fz * back,
  );
  const ground = terrain.gridHeightAt(want.x, want.z) + 1.4;
  if (want.y < ground) want.y = ground;

  const k = cam.mode === 2 ? 1 : 1 - Math.exp(-dt * 7.5);
  cam.pos.lerp(want, k);
  // Цель взгляда держим на машине: наклон уже увёл саму камеру по сфере,
  // а раньше он вдобавок задирал и точку взгляда — обзор уезжал вдвойне.
  const pit = clamp(cam.pitch, -0.55, 0.85);
  const look = new THREE.Vector3(
    car.pos.x + fx * conf.ahead,
    car.pos.y + 1.2 + pit * conf.ahead * 1.6,   // наклон уводит только прицел
    car.pos.z + fz * conf.ahead,
  );
  cam.look.lerp(look, 1 - Math.exp(-dt * 9));

  camera.position.copy(cam.pos);
  if (car.crash > 0.02) {                    // тряска от удара
    const s = car.crash * 0.35;
    camera.position.x += (Math.random() - 0.5) * s;
    camera.position.y += (Math.random() - 0.5) * s;
  }
  camera.lookAt(cam.look);
  camera.rotateZ(-car.roll * 0.25);
  // руль не крутит камеру, но лёгкий крен в повороте оживляет езду
  if (cam.mode !== 3) camera.rotateZ(-car.steerVis * clamp(car.vLong / 30, -1, 1) * 0.10);
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
