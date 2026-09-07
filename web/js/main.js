import * as THREE from 'three';
import { Terrain, SEA_FLOOR } from './terrain.js?v=8ca68630';
import { buildTerrainTile, FarIndex, coarseSeaMask, tileProf, buildRoads, buildBuildings, buildWater, buildAreas } from './worldgen.js?v=8ca68630';
import { buildStreetProps } from './props.js?v=8ca68630';
import { buildYards, buildStructures } from './yards.js?v=8ca68630';
import { buildFurniture } from './furniture.js?v=8ca68630';
import { buildLandmarks } from './landmarks.js?v=8ca68630';
import { buildSigns } from './signs.js?v=8ca68630';
import { audit } from './audit.js?v=8ca68630';
import { buildMap, drawMini, drawFull, mapUnproject } from './minimap.js?v=8ca68630';
import { ChunkManager } from './chunks.js?v=8ca68630';
import { Collider, RoadIndex } from './collision.js?v=8ca68630';
import { Car, createCarMesh } from './vehicle.js?v=8ca68630';

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
let terrain, far = null, landmarkDefs = [], collider, roads, carMesh, car;
let cityMap = null, miniCtx = null, mapCtx = null, mapOpen = false, miniOn = true;
let mapZoom = 1;                               // 1 — весь мир, больше — вокруг игрока
// --- потоковая загрузка --------------------------------------------------
let chunks = null;                             // ChunkManager
const farCells = new Map();                    // ключ чанка → силуэт дальнего слоя
const deckParts = new Map();                   // ключ пачки → полотно мостов этого чанка
const skipIds = new Set();                     // дома, отданные памятным зданиям целиком
let ground = null;                             // квадраты земли (TerrainTiles)
let farIndex = null;                           // far-слой, разложенный по квадратам
let wantJump = null;                           // отложенная доводка до дороги после прыжка
let mode = 'car';                              // 'car' | 'walk' | 'fly'
// Свободный полёт: камера сама по себе, без машины и без рельефа под ногами.
// Скорость держим в метрах в секунду и крутим колесом — над городом хочется
// лететь быстро, а у фасада подходить медленно.
const fly = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, speed: 40, vx: 0, vy: 0, vz: 0 };
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
// Инверсия вертикали — дело вкуса, а не правильности: замер показывает, что
// по умолчанию мышь вверх поднимает взгляд во всех трёх режимах. Кому привычно
// наоборот — клавиша I, и выбор запоминается между заходами.
let invertY = false;
try { invertY = localStorage.getItem('sev.invertY') === '1'; } catch { /* приватный режим */ }
const mouseY = dy => (invertY ? -dy : dy);
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
    const T0 = performance.now();
    let TP = T0;
    const lap = n => { const t = performance.now(); console.log(`  ${n}: ${(t - TP).toFixed(0)} мс`); TP = t; };
    const V = document.querySelector('meta[name="build"]')?.content || '';
    const P = new URLSearchParams(location.search);

    // Папку с нарезкой можно подменить (?chunks=chunks-tmp) — удобно проверять
    // новую нарезку, не трогая боевую. Радиусы тоже: на медленной машине
    // ?radius=1600 заметно легче.
    await step('беру манифест…', 5);
    chunks = new ChunkManager(`../data/${P.get('chunks') || 'chunks'}`, {
      v: V,
      radius: +P.get('radius') || 2600,
      keep: +P.get('keep') || 3600,
    });
    const info = await chunks.init();
    lap('манифест и far.json');
    far = info.far;
    const meta = info.meta || far.meta;
    far.meta = far.meta || meta;

    await step('загружаю высоты…', 14);
    terrain = await loadTerrain(meta, V);
    lap('высоты');
    // Для меню «куда поехать» и подписей на карте нужен ПОЛНЫЙ список — он
    // маленький (имя и точка), сами здания приезжают со своими чанками.
    landmarkDefs = far.landmarks
      || await fetch(`../data/landmarks.json${V ? '?v=' + V : ''}`).then(r => r.json()).catch(() => []);

    await step('строю рельеф…', 26);
    initScene();
    // far-слой раскладываем по квадратам один раз: каждый квадрат земли берёт
    // из него только своё окно, а линейный перебор 13 тысяч домов на квадрат
    // стоил бы полсекунды на круг.
    farIndex = new FarIndex(far, 1024);
    // Связность моря — на весь мир и один раз, по грубой сетке. Внутри
    // квадрата 1024 м заливать неоткуда: в Южной бухте нет ни одной клетки
    // открытого моря, и бухта осталась бы зелёным островом.
    terrain.setSeaMask(coarseSeaMask(terrain, far));
    lap('связность моря');
    ground = new TerrainTiles();
    // Ждём только землю ПОД машиной и вплотную к ней: остальное дорисуется
    // на ходу, по кусочку в кадр. Раньше здесь строилось окно ±3 км целиком —
    // полторы секунды и семь десятков файлов высот до первого кадра.
    await warmGround(SPAWN.x, SPAWN.z);
    lap('земля под машиной');

    // Коллизии и индекс улиц теперь пополняемые: пусто на старте, дома и
    // дороги приезжают вместе со своими чанками.
    collider = new Collider();
    roads = new RoadIndex();

    await step('ставлю дальний силуэт…', 46);
    buildFarCity();
    lap('дальний силуэт');

    await step('черчу карту города…', 60);
    cityMap = buildMap(far, terrain);
    lap('карта');
    miniCtx = $('mini').getContext('2d');
    mapCtx = $('mapcv').getContext('2d');

    car = new Car(terrain, collider);
    carMesh = createCarMesh();
    scene.add(carMesh);
    car.reset(SPAWN.x, SPAWN.z, 0);
    walk.x = SPAWN.x; walk.z = SPAWN.z;

    chunks.onBuild = buildChunk;
    chunks.onDrop = dropChunk;
    chunks.canBuild = chunkTerrainReady;
    chunks.prof = chunkProf;

    // Ждём ТОЛЬКО квадрат под колёсами и его соседей по кресту: без них
    // машину некуда ставить. Остальной город догрузится на ходу.
    await step('поднимаю квартал вокруг…', 72);
    await warmup(SPAWN.x, SPAWN.z, 4000);
    lap('первый квартал');
    respawn(SPAWN.x, SPAWN.z);
    walk.x = car.pos.x; walk.z = car.pos.z;

    await step('поехали', 100);
    buildMenu();
    bindInput();
    const el = document.createElement('span');
    el.id = 'chunkstat';
    $('stat').appendChild(document.createElement('br'));
    $('stat').appendChild(el);

    window.G = { THREE, scene, camera, renderer, car, far, world: far, terrain, collider, roads, chunks, ground,
                 get info() { return renderer.info; }, walk, cam, get mode() { return mode; } };
    window.G.audit = () => audit(window.G);
    window.G.fly = fly;
    window.G.walk = walk;
    window.G.setInvertY = v => { invertY = !!v; };
    window.G.ground = ground;
    window.G.tileProf = tileProf;
    window.G.chunkProf = chunkProf;
    window.G.counts = counts;
    window.G.jumpTo = jumpTo;             // переехать и встать на дорогу, когда приедет чанк
    window.G.boot = Math.round(performance.now() - T0);
    console.log(`до старта ${window.G.boot} мс, чанков в манифесте ${chunks.cells.size}`);
    $('load').classList.add('done');
    setTimeout(() => $('load').remove(), 600);
    requestAnimationFrame(loop);
  } catch (e) {
    $('step').textContent = 'не взлетело';
    $('err').textContent = (e && e.stack) || String(e);
    console.error(e);
  }
}

// ------------------------------------------------------------------ земля
// Земля нарезана по тем же квадратам 1024 м, что и город: квадрат земли
// строится вместе с кварталом над ним и выгружается вместе с ним. Раньше это
// был ОДИН меш на окно ±3 км, который перекладывался целиком каждую пару
// километров пути, — полторы секунды в одном кадре, тот самый фриз на переезде.
const P0 = new URLSearchParams(location.search);
const GROUND_RADIUS = +P0.get('ground') || 3000;  // на сколько вокруг игрока держим землю
const GROUND_KEEP = GROUND_RADIUS + 700;          // дальше — выгружаем (гистерезис)
// Запас растров за краем квадрата. Не украшение: ограничение уклона в коридоре
// дорог расходится на 300 м, и всё, что ближе этого к шву, обязано попасть в
// окно ОБОИХ соседей — иначе улица за краем окна двигает высоту только у
// одного из них, и на шве получается ступенька.
const GROUND_PAD = 380;
// Детальные высоты держим чуть шире земли: растры квадрата смотрят за его край.
const DETAIL_KEEP = GROUND_KEEP + 900;

class TerrainTiles {
  constructor() {
    this.size = chunks.chunk;
    this.mesh = new Map();      // ключ → меш
    this.job = null;            // квадрат, который собирается прямо сейчас
    this.asked = new Set();     // за высотами под квадратом уже сходили
    this.stats = { built: 0, dropped: 0, ms: 0, worstMs: 0 };
    this.want = 0;              // сколько квадратов ещё не построено
  }
  keyAt(x, z) { return Math.floor(x / this.size) + '_' + Math.floor(z / this.size); }
  has(key) { return this.mesh.has(key); }
  get pending() { return this.want + (this.job ? 1 : 0); }

  // расстояние от точки до квадрата (0 — точка внутри)
  _dist(i, j, x, z) {
    const S = this.size, x0 = i * S, z0 = j * S;
    const dx = x < x0 ? x0 - x : x > x0 + S ? x - x0 - S : 0;
    const dz = z < z0 ? z0 - z : z > z0 + S ? z - z0 - S : 0;
    return Math.hypot(dx, dz);
  }

  update(x, z, budget, radius = GROUND_RADIUS) {
    const t0 = performance.now();
    if (this.job) this._step(t0, budget);
    if (this.job) return;                       // квадрат ещё собирается
    this._dropFar(x, z);

    const S = this.size, R = radius, b = far.meta.bounds;
    const list = [];
    for (let j = Math.floor((z - R) / S); j <= Math.floor((z + R) / S); j++)
      for (let i = Math.floor((x - R) / S); i <= Math.floor((x + R) / S); i++) {
        const key = i + '_' + j;
        if (this.mesh.has(key)) continue;
        // за границами мира земли нет — там и высот нет
        if ((i + 1) * S < b.minX || i * S > b.maxX || (j + 1) * S < b.minZ || j * S > b.maxZ) continue;
        const d = this._dist(i, j, x, z);
        if (d > R) continue;
        list.push({ i, j, key, d });
      }
    this.want = list.length;
    if (!list.length) return;
    list.sort((a, c) => a.d - c.d);

    // Высоты просим с опережением, но не за все сразу: сорок файлов одним
    // залпом на старте — это те самые секунды до первого кадра.
    let asked = 0, pick = null;
    for (const c of list) {
      const x0 = c.i * S - GROUND_PAD, z0 = c.j * S - GROUND_PAD;
      const x1 = (c.i + 1) * S + GROUND_PAD, z1 = (c.j + 1) * S + GROUND_PAD;
      if (!this.asked.has(c.key)) {
        if (asked >= 4) { if (pick) break; else continue; }
        this.asked.add(c.key);
        asked++;
        terrain.ensureRect(x0, z0, x1, z1);
      }
      // Пока детальные высоты под квадратом не приехали, собирать нельзя:
      // всё сядет по грубой сетке, а это промах до восемнадцати метров.
      if (!pick && terrain.detailReady(x0, z0, x1, z1)) pick = c;
      if (pick && asked >= 4) break;
    }
    if (!pick) return;
    this.job = {
      key: pick.key, ms: 0, cell: { i: pick.i, j: pick.j },
      gen: buildTerrainTile(terrain, farIndex, {
        cx: pick.i, cz: pick.j, key: pick.key, size: S, pad: GROUND_PAD,
        sea: terrain.sea,
      }),
    };
    this._step(t0, budget);
  }

  _step(t0, budget) {
    const j = this.job;
    for (;;) {
      let r;
      const tp = performance.now();
      try { r = j.gen.next(); }
      catch (e) { console.error('земля', j.key, 'не собралась:', e); r = { done: true, value: null }; }
      const dms = performance.now() - tp;
      tileProf[tileProf.cur] = (tileProf[tileProf.cur] || 0) + dms;
      if (dms > (tileProf.worst[tileProf.cur] || 0)) tileProf.worst[tileProf.cur] = Math.round(dms);
      if (r.done) {
        const ms = j.ms + (performance.now() - t0);
        if (r.value) {
          r.value.userData.cell = j.cell;
          scene.add(r.value);
          this.mesh.set(j.key, r.value);
        }
        this.job = null;
        this.stats.built++; this.stats.ms += ms;
        if (ms > this.stats.worstMs) this.stats.worstMs = ms;
        return;
      }
      if (performance.now() - t0 >= budget) { j.ms += performance.now() - t0; return; }
    }
  }

  // По паре за кадр: после прыжка через полкарты разом устаревают все сорок
  // квадратов, и сорок geometry.dispose() в одном кадре — это видимая пауза.
  _dropFar(x, z, n = 2) {
    for (const [key, m] of this.mesh) {
      const { i, j } = m.userData.cell;
      if (this._dist(i, j, x, z) <= GROUND_KEEP) continue;
      scene.remove(m);
      m.geometry.dispose();                 // материал общий на все квадраты, его не трогаем
      this.mesh.delete(key);
      this.asked.delete(key);
      terrain.dropSurface(key);
      this.stats.dropped++;
      if (--n <= 0) return;
    }
  }
}

// Земля ПОД МАШИНОЙ к первому кадру — и только она. Соседние квадраты доедут
// за первые доли секунды, по кусочку в кадр; ждать их — это лишние файлы
// высот и лишняя секунда на экране загрузки.
async function warmGround(x, z, ms = 2500) {
  const t0 = performance.now();
  const key = ground.keyAt(x, z);
  let tick = 0;
  while (performance.now() - t0 < ms) {
    // Радиус на старте маленький нарочно: за высотами ходит каждый квадрат
    // сам, и полный круг в три километра — это семь десятков файлов до
    // первого кадра.
    ground.update(x, z, 30, 200);
    if (ground.has(key)) break;
    // Ждём КОРОТКО: step() держит два кадра ради полосы загрузки, и на
    // десяти оборотах это треть секунды чистого ожидания.
    if ((tick++ & 7) === 7) await step('строю рельеф…', 26 + Math.min(18, (performance.now() - t0) / ms * 18));
    else await new Promise(r => setTimeout(r, 0));
  }
}

// Готов ли рельеф под квадратом города. Всё, что строит buildChunk — полотно
// дорог, дома, деревья, — сажается по высотам ОДИН раз и потом не двигается.
// Земля под квадратом строится РАНЬШЕ него и по тем же границам: нет земли —
// нет и квартала, иначе дороги и дома сядут по сырому DEM мимо коридора.
// Плюс детальные высоты: собрать квадрат по грубой сетке coarse — это промах
// до восемнадцати метров, отсюда весь баг «на трассе не видно дороги».
// PAD тот же, что берёт buildChunk под свои растры, плюс запас на деревья
// и тротуары, которые щупают землю чуть за краем квадрата.
function chunkTerrainReady(key, cell) {
  if (!ground.has(key)) return false;
  const S = chunks.chunk, P = 300;
  const x0 = cell.cx * S - P, z0 = cell.cz * S - P;
  const x1 = (cell.cx + 1) * S + P, z1 = (cell.cz + 1) * S + P;
  return !terrain.detailReady || terrain.detailReady(x0, z0, x1, z1);
}

// Высоты. Чанковый рельеф, если он выложен: heightAt отвечает всегда (грубо по
// coarse.bin), а детальные квадраты подтягивает ensure(). world.json не читаем
// ВООБЩЕ: два мегабайта разбора в главном потоке — это и есть та секунда,
// которой не хватало.
async function loadTerrain(meta, v) {
  const q = v ? '?v=' + v : '';
  if (typeof Terrain.loadChunked === 'function') {
    try {
      // keep заметно больше того, что просим: за высотами ходит каждый квадрат
      // земли отдельно, и при тесном пороге тайлы вымывались бы и качались по
      // второму разу.
      const t = await Terrain.loadChunked('..', { radius: GROUND_RADIUS, keep: DETAIL_KEEP });
      t.meta = meta;                  // мир и рельеф — в одной системе координат
      return t;
    } catch (e) {
      console.warn('чанкового рельефа нет, беру старый одним куском:', e.message);
    }
  }
  const [dem, bin] = await Promise.all([
    fetch(`../data/terrain.json${q}`).then(r => r.json()),
    fetch(`../data/terrain.bin${q}`).then(r => r.arrayBuffer()),
  ]);
  return new Terrain(meta, dem, new Float32Array(bin));
}

// ------------------------------------------------------------------ дальний слой
// Силуэт города за радиусом детальной загрузки: коробки домов по контуру с
// высотой и плоские ленты магистралей. Разложен по тем же квадратам, что и
// чанки, — приехал детальный квадрат, силуэт под ним гаснет.
function buildFarCity() {
  const S = chunks.chunk;
  const cellOf = (x, z) => Math.floor(x / S) + '_' + Math.floor(z / S);
  const acc = new Map();       // ключ квадрата → { P, N, C }
  const at = key => {
    let a = acc.get(key);
    if (!a) acc.set(key, a = { P: [], N: [], C: [] });
    return a;
  };
  const push = (a, x, y, z, nx, ny, nz, c) => {
    a.P.push(x, y, z); a.N.push(nx, ny, nz); a.C.push(c[0], c[1], c[2]);
  };
  // Цвета берём близкими к тому, что строит детальный слой: серые коробки
  // рядом с терракотовыми крышами читались как отдельный «другой город»,
  // и граница детальной загрузки бросалась в глаза сменой цвета.
  const WALL = [0.74, 0.70, 0.62], ROOF = [0.55, 0.33, 0.24], ROAD = [0.34, 0.33, 0.32];

  for (const b of far.buildings || []) {
    const p = b.poly;
    let n = p.length / 2;
    // контур в данных замкнут — последняя точка повторяет первую
    if (n > 2 && p[0] === p[(n - 1) * 2] && p[1] === p[(n - 1) * 2 + 1]) n--;
    if (n < 3) continue;
    let sx = 0, sz = 0;
    for (let i = 0; i < n; i++) { sx += p[i * 2]; sz += p[i * 2 + 1]; }
    sx /= n; sz /= n;
    const a = at(cellOf(sx, sz));
    const y0 = terrain.gridHeightAt(sx, sz) - 1.2;
    const y1 = y0 + (b.h || 9) + 1.2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = p[i * 2], az = p[i * 2 + 1], bx = p[j * 2], bz = p[j * 2 + 1];
      const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1;
      const nx = dz / l, nz = -dx / l;
      push(a, ax, y0, az, nx, 0, nz, WALL); push(a, bx, y1, bz, nx, 0, nz, WALL);
      push(a, bx, y0, bz, nx, 0, nz, WALL);
      push(a, ax, y0, az, nx, 0, nz, WALL); push(a, ax, y1, az, nx, 0, nz, WALL);
      push(a, bx, y1, bz, nx, 0, nz, WALL);
    }
    // крыша веером от центра: контуры домов невыпуклые редко, а издали
    // разница не видна — зато втрое дешевле триангуляции
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      push(a, sx, y1, sz, 0, 1, 0, ROOF);
      push(a, p[j * 2], y1, p[j * 2 + 1], 0, 1, 0, ROOF);
      push(a, p[i * 2], y1, p[i * 2 + 1], 0, 1, 0, ROOF);
    }
  }
  // магистрали: каждое звено кладём в СВОЙ квадрат, иначе длинная улица
  // погаснет целиком, стоило приехать одному детальному чанку
  for (const r of far.roads || []) {
    if (r.c > 2) continue;
    const p = r.pts, hw = (r.w || 7) / 2;
    for (let i = 0; i < p.length / 2 - 1; i++) {
      const ax = p[i * 2], az = p[i * 2 + 1], bx = p[i * 2 + 2], bz = p[i * 2 + 3];
      const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz);
      if (l < 0.5) continue;
      const nx = dz / l * hw, nz = -dx / l * hw;
      const a = at(cellOf((ax + bx) / 2, (az + bz) / 2));
      const y = (x, z) => terrain.gridHeightAt(x, z) + 0.12;
      const q = [[ax - nx, az - nz], [ax + nx, az + nz], [bx + nx, bz + nz], [bx - nx, bz - nz]];
      for (const t of [[0, 2, 1], [0, 3, 2]])
        for (const k of t) push(a, q[k][0], y(q[k][0], q[k][1]), q[k][1], 0, 1, 0, ROAD);
    }
  }

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const root = new THREE.Group();
  root.name = 'дальний силуэт';
  let verts = 0;
  for (const [key, a] of acc) {
    if (!a.P.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(a.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(a.N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(a.C, 3));
    const m = new THREE.Mesh(g, mat);
    m.frustumCulled = true;
    m.matrixAutoUpdate = false;
    root.add(m);
    farCells.set(key, m);
    verts += a.P.length / 3;
  }
  scene.add(root);
  console.log(`дальний силуэт: ${farCells.size} квадратов, ${verts.toLocaleString('ru')} вершин`);
}

// ------------------------------------------------------------------ чанк
// Сборка одного квадрата. Всё то же самое, что раньше делал boot для всего
// города разом, но над данными ОДНОГО чанка: сборщики принимают объект в форме
// world, и им безразлично, весь это город или его двадцатая часть.
const PROF = new URLSearchParams(location.search).has('prof');
// Сколько всего наставлено по всем загруженным чанкам — для сравнения с тем,
// что давала сборка всего города разом (G.counts).
const counts = {};

// Куда уходит время сборки квартала. Считает МЕНЕДЖЕР: генератор рвётся на
// кусочки по кадрам, и секундомер внутри него мерил бы заодно всё, что
// нарисовалось между шагами. Здесь только имя текущего этапа; сумма и худший
// шаг — в G.chunkProf.
export const chunkProf = { cur: '', worst: {} };
const at = n => { chunkProf.cur = n; };

const fill = (src, keys) => {
  const out = {};
  for (const k of keys) out[k] = (src && src[k]) || [];
  return out;
};

// Это ГЕНЕРАТОР: после каждого этапа управление возвращается менеджеру, и тот
// решает, доделывать в этом кадре или в следующем.
function* buildChunk(d, key) {
  const S = chunks.chunk, PAD = 260;
  const w = {
    // Границы — квадрат чанка с запасом: по ним сборщик дорог заводит растр
    // покрытия. Границы всего мира сюда подставлять нельзя, это растр на
    // полсотни километров.
    meta: { ...far.meta, bounds: {
      minX: d.cx * S - PAD, maxX: (d.cx + 1) * S + PAD,
      minZ: d.cz * S - PAD, maxZ: (d.cz + 1) * S + PAD } },
    roads: d.roads || [], buildings: d.buildings || [], areas: d.areas || [],
    green: d.green || [], water: d.water || [], rail: d.rail || [],
    coast: d.coast || [], junctions: d.junctions || [], crossings: d.crossings || [],
    fuel: d.fuel || [], zones: d.zones || [],
    // Пачка сирот (объекты выгружаемого чанка, что лежат ещё и у соседа)
    // приходит НЕПОЛНОЙ — только с теми полями, где сироты нашлись. Сборщики
    // на это не рассчитаны и падают на первом же отсутствующем массиве.
    places: fill(d.places, ['paths', 'trees', 'features', 'fences', 'structures', 'trains']),
  };
  const furniture = fill(d.furniture, ['points', 'barriers']);
  const part = d.key || key;
  // ?prof=1 — разбивка сборки по этапам: без неё непонятно, что именно
  // стоит те самые полтораста миллисекунд на плотном квартале.
  const prof = PROF ? [] : null;
  let pt = performance.now();
  // Считаем ЧИСТОЕ время этапа: после каждого yield менеджер успевает нарисовать
  // кадр (а то и не один), и секундомер, не сбрасываемый на возврате, приписывал
  // этапу всю эту чужую работу — «площадки 3332 мс» на пустом месте.
  const lap = n => { if (prof) prof.push(n + ' ' + (performance.now() - pt).toFixed(0)); };
  const g = new THREE.Group();
  g.name = 'чанк ' + part;
  g.userData.part = part;
  scene.add(g);
  const fc = farCells.get(key);
  if (fc) fc.visible = false;       // под детальным кварталом силуэт не нужен
  // Группу отдаём менеджеру СРАЗУ, первым же yield: если сборка развалится на
  // середине, он всё равно будет знать, что снимать со сцены и из индексов.
  yield g;
  pt = performance.now();

  at('дороги');
  const rg = yield* buildRoads(w, terrain);
  rg.userData.coverage = null;      // растр покрытия нужен только на сборке
  g.add(rg);
  // Полотно мостов сборщик дорог ставит в terrain целиком, затирая чужое.
  // Забираем своё и собираем общее из всех загруженных квадратов.
  deckParts.set(part, terrain.deck || null);
  installDeck();
  // Стены и улицы в индексы кладём В ТОМ ЖЕ шаге, что и геометрию дорог, до
  // первой паузы: дом, который уже видно, обязан и толкать машину.
  roads.add(part, w.roads);
  collider.add(part, w.buildings);
  lap('дороги');
  yield; pt = performance.now();

  at('площадки');
  g.add(yield* buildAreas(w, terrain));
  lap('площадки');
  yield; pt = performance.now();
  at('дворы');
  g.add(buildYards(w, terrain));
  lap('дворы');
  yield; pt = performance.now();
  at('сооружения');
  g.add(buildStructures(w, terrain));
  lap('сооружения');
  yield; pt = performance.now();

  const defs = d.landmarks || [];
  at('памятные');
  const lm = buildLandmarks(w, terrain, defs, roads);
  g.add(lm);
  lap('памятные');
  yield; pt = performance.now();
  // Дом, отданный памятному зданию, не должен рисоваться ещё и рядовым.
  // Список ведём по id: соседний чанк, где тот же дом лежит копией, обязан
  // его пропустить — иначе сквозь Панораму торчат обычные этажи.
  const skip = new Set(lm.userData.skip);
  w.buildings.forEach((b, i) => { if (b.id && skipIds.has(b.id)) skip.add(i); });
  for (const i of skip) { const b = w.buildings[i]; if (b && b.id) skipIds.add(b.id); }
  at('дома');
  g.add(yield* buildBuildings(w, terrain, 500, skip));
  lap('дома');
  yield; pt = performance.now();

  at('деревья');
  const props = buildStreetProps(w, terrain, roads);
  g.add(props);
  for (const [k, v] of Object.entries(props.userData.counts || {})) counts[k] = (counts[k] || 0) + v;
  lap('деревья');
  yield; pt = performance.now();
  at('мебель');
  const furn = buildFurniture(furniture, terrain, roads,
                              props.userData.onRoad,
                              defs.filter(x => x.clear).map(x => ({ x: x.x, z: x.z, r: x.clear })),
                              d.allBuildings || w.buildings);
  castShadows(furn);
  g.add(furn);
  lap('мебель');
  yield; pt = performance.now();
  at('вывески');
  g.add(buildSigns(w, terrain, roads));
  lap('вывески');

  if (prof) console.log('чанк ' + part + ': ' + prof.join(' · ') + ' мс');
}

// Выгрузка. Геометрию освобождаем обязательно — без dispose видеопамять
// растёт с каждым проездом. Материалы каждый сборщик создаёт свои, на чанк,
// поэтому их тоже освобождаем; общие (рельеф, вода, силуэт) сюда не попадают.
//
// Но НЕ сразу: dispose каждой геометрии и каждой текстуры — это отдельный
// вызов драйверу, и плотный квартал их отдаёт под сотню. После прыжка через
// полкарты устаревают все тридцать кварталов разом, и на этом кадр вставал на
// сотню миллисекунд. Со сцены снимаем сейчас же, а освобождаем по кусочку.
const junk = [];
function drainJunk(ms = 2) {
  const t0 = performance.now();
  const seen = junk.seen || (junk.seen = new Set());
  while (junk.length && performance.now() - t0 < ms) {
    const o = junk.pop();
    o.geometry?.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (seen.has(m)) continue;
      seen.add(m);
      // Вывески магазинов и указатели — это CanvasTexture, и material.dispose()
      // их НЕ трогает: за десять проездов по городу набегает под сотню
      // неубираемых картинок в видеопамяти.
      for (const k in m) { const v = m[k]; if (v && v.isTexture) v.dispose(); }
      m.dispose();
    }
  }
  if (!junk.length) seen.clear();
}

function dropChunk(g, key) {
  scene.remove(g);
  g.traverse(o => { if (o.geometry || o.material) junk.push(o); });
  const part = g.userData.part;
  roads.remove(part);
  collider.remove(part);
  if (deckParts.delete(part)) installDeck();
  const fc = farCells.get(key);
  if (fc) fc.visible = true;
}

// Мосты всех загруженных чанков одним полем: полотно ищем по всем частям и
// берём самое высокое. Пока чанк не приехал, моста над этим местом просто нет.
function installDeck() {
  const parts = [...deckParts.values()].filter(Boolean);
  if (!parts.length) { terrain.setDeck(null); return; }
  terrain.setDeck(parts.length === 1 ? parts[0] : (x, z) => {
    let best = null;
    for (const f of parts) {
      const v = f(x, z);
      if (v && (!best || v.h > best.h)) best = v;
    }
    return best;
  });
}

// Ждём, пока приедет и соберётся квадрат под игроком (и то, что успеет вместе
// с ним). Дольше timeout не ждём: пустая земля лучше вечного экрана загрузки.
async function warmup(x, z, timeout = 4000) {
  const key = chunks.keyAt(x, z);
  const t0 = performance.now();
  // Пока идёт загрузка, просим ТОЛЬКО ближний круг: полный радиус — это три
  // десятка файлов до первого кадра, а нужен из них один, под колёсами.
  const full = chunks.radius;
  chunks.radius = 1300;
  let tick = 0;
  while (performance.now() - t0 < timeout) {
    chunks.update(x, z);
    if (chunks.has(key)) break;                                  // под колёсами есть улица
    if (!chunks.cells.has(key) && !chunks.pending) break;         // здесь просто пусто
    if ((tick++ & 7) === 7) {
      const pct = 72 + Math.min(26, (performance.now() - t0) / timeout * 26);
      await step(`поднимаю квартал вокруг… ${chunks.loaded}`, pct);
    } else await new Promise(r => setTimeout(r, 0));
  }
  chunks.radius = full;
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
  // АДАПТИВНОЕ РАЗРЕШЕНИЕ. На ретине devicePixelRatio = 2, и полноэкранный
  // холст выходит примерно в 12 мегапикселей против двух на обычном мониторе
  // 1920x1080 — вшестеро больше работы на пиксель. На десктопе с дискретной
  // видеокартой это незаметно (144 кадра), на встроенной графике ноутбука
  // превращается в 22. Стартуем с половины и поднимаемся сами, если кадр
  // укладывается; проседает — опускаемся. Ниже 1.0 не уходим: буквы HUD и
  // разметка на асфальте расплываются.
  const PR_MAX = Math.min(devicePixelRatio, 2);
  let prNow = Math.min(PR_MAX, 1.25);
  renderer.setPixelRatio(prNow);
  window.__setPR = v => {
    const nv = Math.max(0.85, Math.min(PR_MAX, v));
    if (Math.abs(nv - prNow) < 0.02) return;
    prNow = nv;
    renderer.setPixelRatio(prNow);
    renderer.setSize(innerWidth, innerHeight);
  };
  window.__getPR = () => prNow;
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
  // PCFSoft берёт девять выборок на пиксель вместо четырёх. На этой сцене
  // разница видна только под лупой, а кадр дешевеет заметно.
  renderer.shadowMap.type = THREE.PCFShadowMap;
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
  sun.shadow.mapSize.set(1536, 1536);   // 370 м / 1536 = 0.24 м на тексель
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

// Прыжок через полгорода. Дороги той точки ещё не загружены, и snapToRoad
// честно ответит «улиц нет» — поэтому переносим сразу, а на проезжую часть
// доводим, когда приедет квадрат. Ждать чанк на чёрном экране хуже, чем
// секунду постоять на газоне.
function jumpTo(x, z) {
  if (mode === 'car') { car.reset(x, z, car.yaw); cam.carYaw = car.yaw; }
  else { walk.x = x; walk.z = z; }
  chunks.update(x, z);
  // Землю в новой точке очередь квадратов подхватит в ближайших кадрах сама:
  // она считается от игрока. Перекладывать окно, как раньше, больше не надо —
  // вместе с ним ушли и полторы секунды на прыжок.
  ground.update(x, z, 4);
  wantJump = { x, z, t: performance.now() };
}

function settleJump() {
  if (!wantJump) return;
  const key = chunks.keyAt(wantJump.x, wantJump.z);
  const here = chunks.has(key) || !chunks.cells.has(key);
  if (!here && performance.now() - wantJump.t < 9000) return;
  const s = snapToRoad(wantJump.x, wantJump.z);
  if (mode === 'car') {
    car.reset(s.x, s.z, s.yaw);
    cam.yaw = s.yaw; cam.pitch = 0.24; cam.carYaw = s.yaw;
  } else { walk.x = s.x; walk.z = s.z; }
  wantJump = null;
}

// ------------------------------------------------------------------ ввод
function bindInput() {
  addEventListener('keydown', e => {
    if (e.repeat) return;
    const k = e.code;
    keys.add(k);
    if (k === 'KeyE') toggleMode();
    if (k === 'KeyF') toggleFly();
    if (k === 'KeyI') {
      invertY = !invertY;
      try { localStorage.setItem('sev.invertY', invertY ? '1' : '0'); } catch { /* приватный режим */ }
      $('mode').textContent = invertY ? 'Мышь: инверсия' : 'Мышь: обычная';
      clearTimeout(window.__invT);
      window.__invT = setTimeout(() => {
        $('mode').textContent = mode === 'fly' ? 'Полёт' : mode === 'walk' ? 'Пешком' : 'За рулём';
      }, 1400);
    }
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
    if (mapOpen) {
      mapZoom = clamp(mapZoom * (e.deltaY > 0 ? 0.8 : 1.25), 1, 40);
      drawMap();
      e.preventDefault();
      return;
    }
    if (mode === 'fly') fly.speed = clamp(fly.speed * (e.deltaY > 0 ? 0.86 : 1.16), 3, 900);
    else cam.dist = clamp(cam.dist + e.deltaY * 0.012, 0.45, 3.2);
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
    if (mode === 'fly') {
      fly.yaw -= e.movementX * 0.0022;
      fly.pitch = clamp(fly.pitch - mouseY(e.movementY) * 0.0022, -1.52, 1.52);
    } else if (mode === 'walk') {
      walk.yaw -= e.movementX * 0.0022;
      walk.pitch = clamp(walk.pitch - mouseY(e.movementY) * 0.0022, -1.35, 1.35);
    } else {
      // Шаг 2-3 спецификации: смещение мыши × чувствительность → углы.
      // X крутит вокруг мировой оси Y, Y наклоняет по дуге.
      // Знак Y: мышь вперёд (movementY < 0) должна ПОДНИМАТЬ взгляд, то есть
      // опускать камеру по дуге — значит pitch убывает. Отсюда плюс.
      cam.yaw = wrapPi(cam.yaw - e.movementX * CAM_SENS);
      cam.pitch = clamp(cam.pitch + mouseY(e.movementY) * CAM_SENS, PITCH_MIN, PITCH_MAX);
    }
  });
}

// клик по карте — переехать в эту точку
function mapClick(e) {
  if (!mapOpen || !cityMap) return;
  const cv = $('mapcv'), r = cv.getBoundingClientRect();
  const sx = (e.clientX - r.left) * cv.width / r.width;
  const sy = (e.clientY - r.top) * cv.height / r.height;
  // Преобразование берём у самой карты: масштаб теперь не постоянный —
  // на полном мире он один, при приближении колесом другой.
  const w = mapUnproject(cityMap, sx, sy);
  if (!w) return;
  jumpTo(w.x, w.z);
  toggleMap();
}

// Полноэкранная карта. Мир — полоса 50 × 24 км, и «вписать всё в экран»
// означает город размером с ноготь. Поэтому открываем её ВОКРУГ ИГРОКА в
// читаемом масштабе (примерно 7 км поперёк экрана), а общий план — колесом
// на себя до упора: там zoom = 1 и виден весь охват целиком.
const MAP_SPAN = 7000;                 // метров поперёк экрана при открытии
function toggleMap() {
  mapOpen = !mapOpen;
  $('mapfull').classList.toggle('on', mapOpen);
  if (mapOpen) {
    document.exitPointerLock?.();
    const cv = $('mapcv');
    cv.width = Math.round(innerWidth * 0.96);
    cv.height = Math.round(innerHeight * 0.92);
    const fit = Math.min(cv.width / cityMap.W, cv.height / cityMap.H) * 0.94;
    mapZoom = clamp(cv.width / (MAP_SPAN * cityMap.px) / fit, 1, 40);
    drawMap();
  }
}

function drawMap() {
  if (!mapOpen || !cityMap) return;
  const cv = $('mapcv');
  const px = mode === 'car' ? car.pos.x : mode === 'fly' ? fly.x : walk.x;
  const pz = mode === 'car' ? car.pos.z : mode === 'fly' ? fly.z : walk.z;
  const yaw = mode === 'car' ? car.yaw : mode === 'fly' ? fly.yaw : walk.yaw;
  const marks = landmarkDefs.map(d => ({ name: d.name, x: d.x, z: d.z }))
    .concat(PLACES.slice(0, 6).map(([n, x, z]) => ({ name: n, x, z })));
  drawFull(cv.getContext('2d'), cityMap, cv.width, cv.height, px, pz, yaw, marks, mapZoom);
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
      jumpTo(x, z);
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

// ------------------------------------------------------------------ полёт
function toggleFly() {
  if (mode === 'fly') {                       // возвращаемся туда, откуда взлетели
    mode = fly.from || 'car';
    document.body.classList.toggle('walk', mode === 'walk');
    document.body.classList.remove('fly');
    $('mode').textContent = mode === 'walk' ? 'Пешком' : 'За рулём';
    return;
  }
  fly.from = mode;
  // стартуем оттуда, где стоит камера сейчас, и смотрим туда же
  fly.x = camera.position.x; fly.y = camera.position.y; fly.z = camera.position.z;
  const d = new THREE.Vector3();
  camera.getWorldDirection(d);
  fly.yaw = Math.atan2(-d.x, -d.z) + Math.PI;   // мир смотрит в +(sin, cos)
  fly.pitch = Math.asin(clamp(d.y, -1, 1));
  fly.vx = fly.vy = fly.vz = 0;
  mode = 'fly';
  document.body.classList.remove('walk');
  document.body.classList.add('fly');
  $('mode').textContent = 'Полёт';
}

function updateFly(dt) {
  const boost = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 4 : 1;
  const slow = keys.has('AltLeft') || keys.has('AltRight') ? 0.22 : 1;   // Alt — медленно
  const sp = fly.speed * boost * slow;
  // W и S несут СТРОГО ГОРИЗОНТАЛЬНО, наклон взгляда на высоту не влияет:
  // иначе, чтобы лететь прямо, приходится держать взгляд ровно по горизонту, а
  // стоит посмотреть на город внизу — и снижаешься. Высота только на Space и Q.
  const fx = Math.sin(fly.yaw), fy = 0, fz = Math.cos(fly.yaw);
  const rx = -Math.cos(fly.yaw), rz = Math.sin(fly.yaw);      // вправо
  let ax = 0, ay = 0, az = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) { ax += fx; ay += fy; az += fz; }
  if (keys.has('KeyS') || keys.has('ArrowDown')) { ax -= fx; ay -= fy; az -= fz; }
  if (keys.has('KeyD') || keys.has('ArrowRight')) { ax += rx; az += rz; }
  if (keys.has('KeyA') || keys.has('ArrowLeft')) { ax -= rx; az -= rz; }
  if (keys.has('Space')) ay += 1;
  if (keys.has('KeyQ') || keys.has('ControlLeft') || keys.has('ControlRight')) ay -= 1;
  const l = Math.hypot(ax, ay, az);
  if (l > 0) { ax /= l; ay /= l; az /= l; }
  // разгон и торможение мягкие: рывками летать неприятно
  const k = 1 - Math.exp(-dt * 7);
  fly.vx += (ax * sp - fly.vx) * k;
  fly.vy += (ay * sp - fly.vy) * k;
  fly.vz += (az * sp - fly.vz) * k;
  fly.x += fly.vx * dt; fly.y += fly.vy * dt; fly.z += fly.vz * dt;
  // ниже земли не проваливаемся, выше пяти километров не уходим
  const g = terrain.gridHeightAt(fly.x, fly.z) + 1.2;
  if (fly.y < g) { fly.y = g; if (fly.vy < 0) fly.vy = 0; }
  if (fly.y > 5000) fly.y = 5000;
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
  if (mode === 'fly') {
    camera.position.set(fly.x, fly.y, fly.z);
    camera.rotation.set(0, 0, 0);
    camera.rotateY(fly.yaw + Math.PI);
    camera.rotateX(fly.pitch);   // тот же знак, что и пешком
    return;
  }
  if (mode === 'walk') {
    const eye = terrain.gridHeightAt(walk.x, walk.z) + 1.68;
    camera.position.set(walk.x, eye, walk.z);
    camera.rotation.set(0, 0, 0);
    // Камера Three смотрит вдоль -Z, а «вперёд» в этом мире — +(sin, cos):
    // так едет машина, так же считается направление на миникарте. Без разворота
    // на пол-оборота W уводил назад, и стрелка на карте смотрела в затылок.
    camera.rotateY(walk.yaw + Math.PI);
    // Знак ПЛЮС. Когда-то я решил, что разворот на пол-оборота по Y переворачивает
    // и локальную ось X, и поставил минус — от этого мышь вверх опускала взгляд.
    // Проверка векторами: после rotateY(a) локальная ось X = (cos a, 0, −sin a),
    // взгляд = (−sin a, 0, −cos a), их векторное произведение = (0, 1, 0) при
    // ЛЮБОМ a. Значит rotateX(+b) поднимает взгляд всегда, а разворот по Y на
    // это не влияет.
    camera.rotateX(walk.pitch);
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
    // (имя не ground: так теперь зовётся сам набор квадратов земли)
    const floorY = terrain.gridHeightAt(want.x, want.z) + 0.9;
    if (want.y < floorY) want.y = floorY;
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
// Регулятор разрешения: держим кадр около 60. Считаем по среднему за секунду,
// чтобы одиночная просадка на загрузке чанка не дёргала картинку.
let prAcc = 0, prN = 0, prCool = 0, prBest = 0;
function tunePixelRatio(dt) {
  if (!window.__setPR) return;
  prAcc += dt; prN++;
  prCool -= dt;
  if (prAcc < 1.0) return;
  const fps = prN / prAcc;
  prAcc = 0; prN = 0;
  if (prCool > 0) return;
  const pr = window.__getPR();
  // Порог «поднимать» нельзя ставить по абсолютному числу кадров: на мониторе
  // 60 Гц кадр упирается в развёртку и выше 60 не поднимется никогда, даже
  // если видеокарта простаивает. Смотрим на ЗАПАС: если держим почти столько
  // же, сколько лучший результат за сеанс, значит упёрлись в развёртку и можно
  // рисовать честнее.
  if (fps > prBest) prBest = fps;
  if (fps < prBest * 0.72 && pr > 0.86) { window.__setPR(pr - 0.2); prCool = 2.5; }
  else if (fps > prBest * 0.96 && pr < 2) { window.__setPR(pr + 0.15); prCool = 3; }
}

function updateHUD(dt) {
  tunePixelRatio(dt);
  fpsAcc += dt; fpsN++;
  hudT += dt;
  if (hudT < 0.12) return;
  hudT = 0;

  const px = mode === 'car' ? car.pos.x : mode === 'fly' ? fly.x : walk.x;
  const pz = mode === 'car' ? car.pos.z : mode === 'fly' ? fly.z : walk.z;

  const hit = roads.nearest(px, pz, mode === 'car' ? 22 : mode === 'fly' ? 40 : 14);
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
  // В полёте показываем ВЫСОТУ КАМЕРЫ, а не землю под ней: на 347 метрах
  // строка «20 м над морем» смотрелась издевательством.
  $('alt').textContent = mode === 'fly'
    ? fly.y.toFixed(0) + ' м высота'
    : terrain.gridHeightAt(px, pz).toFixed(0) + ' м над морем';

  const near = Math.hypot(walk.x - car.pos.x, walk.z - car.pos.z) < 4.5;
  $('prompt').classList.toggle('on', mode === 'walk' && near);

  const cs = $('chunkstat');
  if (cs) {
    const mb = performance.memory ? ` · ${(performance.memory.usedJSHeapSize / 1048576).toFixed(0)} МБ` : '';
    cs.textContent = `${chunks.loaded} чанк. ${chunks.pending ? '(+' + chunks.pending + ')' : ''}`
      + ` · земля ${ground.mesh.size}${ground.pending ? ' (+' + ground.pending + ')' : ''}`
      + ` · ${(renderer.info.render.triangles / 1000).toFixed(0)}k тр${mb}`;
  }

  if (miniOn && miniCtx && cityMap) {
    const yaw = mode === 'car' ? car.yaw : walk.yaw;
    drawMini(miniCtx, cityMap, px, pz, yaw, 200, 320);
  }
  if (mapOpen) drawMap();
}

// ------------------------------------------------------------------ цикл
let prev = performance.now();
let lastPruneX = Infinity, lastPruneZ = Infinity;
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
  } else if (mode === 'fly') {
    if (!$('menu').classList.contains('on')) updateFly(dt);
  } else if (!$('menu').classList.contains('on')) {
    updateWalk(dt);
  }

  // ---- поток мира. Считаем от того, за кем сейчас идёт камера: пешком и в
  // полёте город обязан грузиться так же, как за рулём.
  const sx = mode === 'car' ? car.pos.x : mode === 'fly' ? fly.x : walk.x;
  const sz = mode === 'car' ? car.pos.z : mode === 'fly' ? fly.z : walk.z;
  // Бюджет кадра делим: сперва земля (по ней сядет всё остальное), потом
  // кварталы. Пока земли под ногами нет — старт, прыжок через полкарты —
  // даём больше: несколько кадров по 35 мс лучше, чем дыра под машиной.
  drainJunk(2);
  const tGround = performance.now();
  // Бюджет на достройку мира — ДОЛЯ кадра, а не константа. На быстрой машине
  // это десяток миллисекунд, и кадр остаётся шестидесятым; на медленной (или
  // в headless, где кадр и так по сто миллисекунд) — до трети секунды, иначе
  // круг в три километра заполняется полминуты. Земля идёт первой: по ней
  // садится всё остальное. Пока земли под ногами нет вовсе (старт, прыжок
  // через полкарты) — отдаём ей почти весь бюджет.
  const budget = clamp(dt * 300, 8, 24);
  ground.update(sx, sz, budget * (ground.has(ground.keyAt(sx, sz)) ? 0.5 : 0.8));
  chunks.msBudget = Math.max(3, budget - (performance.now() - tGround));
  chunks.update(sx, sz);
  settleJump();
  // Детальные высоты под собой квадраты земли просят сами; здесь только
  // выгружаем дальние, иначе за поездку через город наберётся весь охват.
  if (terrain.prune && Math.hypot(sx - lastPruneX, sz - lastPruneZ) > 320) {
    lastPruneX = sx; lastPruneZ = sz;
    terrain.prune(sx, sz, DETAIL_KEEP);
  }

  carMesh.position.copy(car.pos);
  carMesh.rotation.set(0, 0, 0);
  carMesh.rotateY(car.yaw);
  carMesh.rotateX(car.pitch);
  carMesh.rotateZ(car.roll);
  // колёса ходят вертикально каждое своё — кузов плитой земле не следует
  const ws = carMesh.userData.wheels;
  if (ws) for (let i = 0; i < ws.length && i < 4; i++) ws[i].position.y = 0.355 + car.wheelDrop[i];
  const w = carMesh.userData.wheels;
  for (let i = 0; i < 4; i++) {
    w[i].rotation.set(0, i < 2 ? car.steerVis : 0, 0);
    w[i].rotateX(car.wheelSpin);
  }

  // тень едет за игроком, иначе карты теней не хватит на 5 км
  const t = mode === 'car' ? car.pos
    : mode === 'fly' ? new THREE.Vector3(fly.x, terrain.gridHeightAt(fly.x, fly.z), fly.z)
    : new THREE.Vector3(walk.x, terrain.gridHeightAt(walk.x, walk.z), walk.z);
  sun.target.position.copy(t);
  sun.position.copy(t).addScaledVector(SUN, 420);
  sky.position.copy(camera.position);

  updateCamera(dt);
  updateHUD(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

boot();
