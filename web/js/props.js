import * as THREE from 'three';
import { PolyGrid } from './worldgen.js?v=59cbda35';

// Уличное наполнение. По панорамам Севастополя видно, что улицу делают не дома,
// а то, что вдоль неё: платаны в тротуаре, сплошной ряд машин у бордюра,
// фонари. Без этого любой город остаётся набором коробок.
//
// Главная жалоба на прежнюю версию — «квадратно, как в роблоксе». Виноваты были
// не дома: деревьев в кадре десятки, и все они были ОДНИМ многогранником на
// палке — одинаковой формы, высоты и цвета. Глаз ловит повтор мгновенно.
// Лечится это не детализацией (двадцать тысяч деревьев её не выдержат), а
// разнообразием: семь пород с разными силуэтами, крона из нескольких
// несовпадающих комов, разброс размеров и наклон ствола.

const s2l = v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
const rng = seed => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

// Порода должна быть ФУНКЦИЕЙ МЕСТА, а не порядка генерации: иначе достаточно
// поменять что-нибудь выше по коду — и весь лес пересаживается заново.
// Дешёвый целочисленный хеш по координатам, стабильный до сантиметра.
function hash2(x, z) {
  let h = Math.imul((x * 16) | 0, 374761393) ^ Math.imul((z * 16) | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function mergeParts(parts) {
  let nv = 0, ni = 0;
  for (const { geo } of parts) {
    nv += geo.attributes.position.count;
    ni += geo.index ? geo.index.count : geo.attributes.position.count;
  }
  const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), C = new Uint8Array(nv * 3);
  const I = new Uint32Array(ni);
  let vo = 0, io = 0;
  for (const { geo, color } of parts) {
    const pa = geo.attributes.position.array, na = geo.attributes.normal.array;
    P.set(pa, vo * 3); N.set(na, vo * 3);
    const n = geo.attributes.position.count;
    for (let i = 0; i < n; i++)
      for (let k = 0; k < 3; k++) C[(vo + i) * 3 + k] = Math.round(255 * s2l(color[k]));
    if (geo.index) for (let i = 0; i < geo.index.count; i++) I[io++] = geo.index.array[i] + vo;
    else for (let i = 0; i < n; i++) I[io++] = i + vo;
    vo += n;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.BufferAttribute(C, 3, true));
  g.setIndex(new THREE.BufferAttribute(I, 1));
  return g;
}

// ------------------------------------------------------------- заготовки

// Ствол — ОТКРЫТЫЙ цилиндр. Нижний торец сидит в земле, верхний закрыт кроной,
// то есть крышки не видно никогда, а это треть треугольников на каждом из
// двадцати пяти тысяч стволов. Освободившийся бюджет уходит на кроны.
// Стволы намеренно длиннее видимой части и уходят внутрь кроны: у икосаэдра
// грань лежит на 0.8 радиуса от центра, и ком, «касающийся» верха ствола по
// радиусу, на деле висит над ним — вблизи крона отрывается от дерева.
// Продлить ствол вверх дешевле (нисколько), чем подгонять высоты комов.
function trunkGeo(rTop, rBot, h, seg = 5) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, true);
  g.translate(0, h / 2, 0);
  return g;
}

// Ком листвы. Один икосаэдр читается именно как кристалл — на это и жалуются.
// Спасает не подробность, а НЕСОВПАДЕНИЕ граней: ком сплющивается по своим осям
// и поворачивается на свой угол, поэтому у двух соседних комов рёбра нигде не
// продолжают друг друга, и вместо огранки получается рыхлая масса. Цена та же —
// двадцать треугольников на ком.
// ВАЖЕН ПОРЯДОК: сначала повернуть, потом сплющить. Наоборот — поворот вокруг Z
// на 60–100° кладёт уже вытянутый ком набок, и свеча тополя рассыпается на три
// летящие в стороны линзы. Именно так и выглядели кипарисы, пока порядок был
// обратным.
function blobGeo(r, x, y, z, sx, sy, sz, rot) {
  const g = new THREE.IcosahedronGeometry(r, 0);
  g.rotateY(rot);
  g.rotateZ(rot * 0.41);
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  return g;
}

// Кора и листва — в sRGB, mergeParts переводит их в линейное пространство.
// Цвет породы важнее её формы: ряд одинаково-зелёных силуэтов всё равно
// выглядит штампованным.
// Кора светлее примерно вдвое, чем кажется на глаз, но выше определённой
// светлоты ствол перестаёт читаться как дерево и становится бетонным столбом —
// проверено на набережной, где платаны стоят у самой дорожки. Поэтому даже у
// платана и оливы держим в коре тёплый оливковый уклон, а не чистый серый.
const BARK = {
  platan:   [0.455, 0.425, 0.335],   // платан узнают по светлой пятнистой коре
  chestnut: [0.300, 0.250, 0.190],
  acacia:   [0.385, 0.340, 0.275],
  poplar:   [0.395, 0.385, 0.340],
  cypress:  [0.350, 0.280, 0.215],
  pine:     [0.455, 0.315, 0.215],   // крымская сосна — рыжий ствол
  olive:    [0.425, 0.405, 0.345],
};
const LEAF = {
  platan:   [[0.345, 0.455, 0.235], [0.400, 0.505, 0.270], [0.295, 0.405, 0.205]],
  chestnut: [[0.205, 0.340, 0.160], [0.245, 0.390, 0.185], [0.175, 0.300, 0.140]],
  acacia:   [[0.450, 0.525, 0.270], [0.505, 0.575, 0.310], [0.410, 0.480, 0.245]],
  poplar:   [[0.290, 0.420, 0.200], [0.330, 0.470, 0.230], [0.255, 0.375, 0.180]],
  // хвоя кипариса почти чёрная, но взятая «как в жизни» она проваливается в
  // силуэт и на набережной читается дырой в кадре — держим на ступень светлее
  cypress:  [[0.170, 0.290, 0.185], [0.205, 0.335, 0.215], [0.145, 0.250, 0.160]],
  pine:     [[0.170, 0.295, 0.200], [0.205, 0.335, 0.225], [0.140, 0.255, 0.175]],
  olive:    [[0.420, 0.470, 0.340], [0.470, 0.520, 0.390], [0.375, 0.425, 0.305]],
  bush:     [[0.265, 0.400, 0.200], [0.310, 0.445, 0.235]],
  hedge:    [0.215, 0.360, 0.180],
};
const METAL = [0.318, 0.325, 0.325], GLASS = [0.647, 0.639, 0.612];

// ------------------------------------------------------------- породы
// Семь пород центра Севастополя. У каждой свой силуэт (шар, купол, свеча,
// зонт), своя высота и свой цвет — этого хватает, чтобы ряд вдоль улицы
// перестал читаться как копипаста.

// Платан восточный — главное дерево приморских проспектов: высокий, крона
// раскидистая и разлапистая, кора светлая.
function platanGeo() {
  return mergeParts([
    { geo: trunkGeo(0.21, 0.35, 6.0, 6), color: BARK.platan },
    { geo: blobGeo(2.10, 0.00, 7.00, 0.00, 1.00, 0.82, 1.00, 0.00), color: LEAF.platan[0] },
    { geo: blobGeo(1.55, 1.55, 6.10, 0.45, 1.05, 0.80, 1.05, 1.90), color: LEAF.platan[1] },
    { geo: blobGeo(1.45, -1.35, 6.20, -0.95, 1.00, 0.85, 1.00, 3.40), color: LEAF.platan[2] },
    { geo: blobGeo(1.20, 0.30, 8.40, -0.35, 1.00, 0.78, 1.00, 5.10), color: LEAF.platan[1] },
  ]);
}

// Каштан конский — плотный тёмный купол на коротком стволе; дворы и скверы.
function chestnutGeo() {
  return mergeParts([
    { geo: trunkGeo(0.19, 0.31, 4.4, 5), color: BARK.chestnut },
    { geo: blobGeo(2.05, 0.00, 5.20, 0.00, 1.00, 0.92, 1.00, 0.70), color: LEAF.chestnut[0] },
    { geo: blobGeo(1.60, 1.15, 6.50, -0.55, 0.95, 0.82, 0.95, 2.60), color: LEAF.chestnut[1] },
    { geo: blobGeo(1.45, -1.05, 6.20, 0.80, 1.00, 0.80, 1.00, 4.30), color: LEAF.chestnut[2] },
  ]);
}

// Акация (робиния) — ажурный зонт на тонком голом стволе, листва светлая,
// почти жёлтая. Даёт в ряду светлое пятно там, где всё остальное тёмное.
function acaciaGeo() {
  return mergeParts([
    { geo: trunkGeo(0.13, 0.22, 5.5, 5), color: BARK.acacia },
    { geo: blobGeo(1.85, 0.10, 5.40, 0.00, 1.00, 0.48, 1.00, 1.20), color: LEAF.acacia[0] },
    { geo: blobGeo(1.30, -1.15, 5.90, 0.55, 1.00, 0.50, 1.00, 3.10), color: LEAF.acacia[1] },
    { geo: blobGeo(1.15, 1.25, 5.75, -0.40, 1.00, 0.52, 1.00, 5.50), color: LEAF.acacia[2] },
  ]);
}

// Тополь пирамидальный — вертикаль вдоль трасс и дворовых проездов. Ровно та
// форма, которой не хватало: рядом с шарами свеча сразу ломает ритм.
// Свечу набираем стопкой умеренно вытянутых комов: если растянуть один ком в
// три раза, у икосаэдра вылезают острые полюса — получается сталагмит, не крона.
// Центры комов сдвинуты плотнее, чем кажется нужным: у икосаэдра грань лежит на
// 0.8 радиуса от центра, и «соприкасающиеся» по радиусу комы на деле висят
// друг над другом с просветом.
function poplarGeo() {
  return mergeParts([
    { geo: trunkGeo(0.14, 0.24, 3.4, 5), color: BARK.poplar },
    { geo: blobGeo(1.05, 0.00, 4.00, 0.00, 1.00, 2.00, 1.00, 0.40), color: LEAF.poplar[0] },
    { geo: blobGeo(0.92, 0.12, 6.60, -0.10, 1.00, 1.90, 1.00, 2.20), color: LEAF.poplar[1] },
    { geo: blobGeo(0.62, -0.05, 8.70, 0.06, 1.00, 1.85, 1.00, 4.00), color: LEAF.poplar[2] },
  ]);
}

// Кипарис — примета приморской части: узкая почти чёрная колонна. Три
// перекрывающихся кома вместо одного вытянутого: острые полюса растянутого
// икосаэдра читались именно как кристалл, на что и жаловались.
function cypressGeo() {
  return mergeParts([
    { geo: trunkGeo(0.12, 0.19, 2.4, 5), color: BARK.cypress },
    { geo: blobGeo(0.86, 0.00, 2.50, 0.00, 1.00, 1.90, 1.00, 0.90), color: LEAF.cypress[0] },
    { geo: blobGeo(0.76, 0.06, 4.60, -0.05, 1.00, 1.95, 1.00, 2.60), color: LEAF.cypress[1] },
    { geo: blobGeo(0.52, -0.04, 6.40, 0.04, 1.00, 1.90, 1.00, 4.40), color: LEAF.cypress[2] },
  ]);
}

// Сосна крымская — высокий рыжий ствол и плоская зонтичная крона. Ствол кривой
// нарочно: у сосны он прямым не бывает, и в роще это видно сразу.
function pineGeo() {
  const t = trunkGeo(0.16, 0.30, 6.6, 5);
  t.rotateZ(0.05);
  return mergeParts([
    { geo: t, color: BARK.pine },
    { geo: blobGeo(2.10, 0.25, 6.50, 0.00, 1.00, 0.40, 1.00, 1.50), color: LEAF.pine[0] },
    { geo: blobGeo(1.45, -1.10, 7.30, 0.65, 1.00, 0.42, 1.00, 3.60), color: LEAF.pine[1] },
    { geo: blobGeo(1.10, 1.05, 7.60, -0.55, 1.00, 0.45, 1.00, 5.20), color: LEAF.pine[2] },
  ]);
}

// Олива — низкая и кривая, листва серо-серебристая. Работает как масштабная
// метка: рядом с ней платан наконец выглядит большим.
function oliveGeo() {
  const t = trunkGeo(0.17, 0.26, 2.7, 5);
  t.rotateZ(-0.12);
  return mergeParts([
    { geo: t, color: BARK.olive },
    { geo: blobGeo(1.35, -0.15, 2.90, 0.00, 1.00, 0.85, 1.00, 0.60), color: LEAF.olive[0] },
    { geo: blobGeo(1.00, 0.85, 3.40, 0.35, 1.00, 0.80, 1.00, 2.80), color: LEAF.olive[1] },
    { geo: blobGeo(0.80, -0.75, 3.80, -0.55, 1.00, 0.82, 1.00, 4.60), color: LEAF.olive[2] },
  ]);
}

// Куст — два кома, нижний шире: масса у земли, а не шарик на палочке.
function bushGeo() {
  return mergeParts([
    { geo: blobGeo(0.85, 0.00, 0.60, 0.00, 1.10, 0.70, 1.10, 0.50), color: LEAF.bush[0] },
    { geo: blobGeo(0.60, 0.35, 0.98, -0.20, 1.00, 0.75, 1.00, 2.70), color: LEAF.bush[1] },
  ]);
}

// Живая изгородь — стриженый брус: в жизни она и есть параллелепипед, поэтому
// здесь «квадратность» не вредит, а читается как уход за газоном.
// Двенадцать треугольников на секцию — можно ставить километрами.
function hedgeGeo() {
  const g = new THREE.BoxGeometry(3.0, 0.95, 0.72);
  g.translate(0, 0.47, 0);
  return mergeParts([{ geo: g, color: LEAF.hedge }]);
}

// ------------------------------------------------------------- фонари
// Один тип фонаря на весь город — второй источник «одинаковости» после деревьев.
// Три типа по классу дороги: проспект / улица / бульвар и проезд.

// Консольный на изогнутой мачте — стандарт проезжей улицы.
function lampStreetGeo() {
  const pole = trunkGeo(0.09, 0.14, 8.0, 6);
  const bend = new THREE.BoxGeometry(0.10, 0.10, 1.05); bend.rotateX(-0.55); bend.translate(0, 8.22, 0.44);
  const arm = new THREE.BoxGeometry(0.10, 0.10, 0.90); arm.translate(0, 8.50, 1.22);
  const head = new THREE.BoxGeometry(0.32, 0.15, 0.72); head.translate(0, 8.38, 1.76);
  return mergeParts([
    { geo: pole, color: METAL }, { geo: bend, color: METAL },
    { geo: arm, color: METAL }, { geo: head, color: GLASS },
  ]);
}

// Парковый шар на низком столбе — бульвары, скверы, дворовые проезды.
// На набережной такой фонарь делает больше для узнаваемости, чем ещё один дом.
function lampParkGeo() {
  const pole = trunkGeo(0.07, 0.11, 4.0, 6);
  const foot = trunkGeo(0.17, 0.23, 0.55, 6);
  const ball = new THREE.IcosahedronGeometry(0.30, 0); ball.translate(0, 4.22, 0);
  return mergeParts([
    { geo: foot, color: METAL }, { geo: pole, color: METAL }, { geo: ball, color: GLASS },
  ]);
}

// Двойной — на проспектах и площадях: одна консоль над проезжей частью,
// вторая над тротуаром.
function lampTwinGeo() {
  const parts = [{ geo: trunkGeo(0.10, 0.16, 8.6, 6), color: METAL }];
  for (const s of [1, -1]) {
    const bend = new THREE.BoxGeometry(0.09, 0.09, 1.05);
    bend.rotateX(-0.55 * s); bend.translate(0, 8.80, 0.44 * s);
    const head = new THREE.BoxGeometry(0.30, 0.14, 0.68); head.translate(0, 9.00, 1.16 * s);
    parts.push({ geo: bend, color: METAL }, { geo: head, color: GLASS });
  }
  return mergeParts(parts);
}

function inst(geo, count, colored) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, flatShading: true });
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, count));
  m.castShadow = true;
  if (colored) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, count) * 3), 3);
  return m;
}

const CAR_PAINT = [
  [0.78, 0.78, 0.79], [0.16, 0.17, 0.19], [0.55, 0.56, 0.58], [0.86, 0.86, 0.85],
  [0.42, 0.13, 0.12], [0.13, 0.22, 0.38], [0.24, 0.30, 0.26], [0.68, 0.62, 0.50],
  [0.30, 0.31, 0.33], [0.72, 0.71, 0.68], [0.11, 0.30, 0.36], [0.60, 0.35, 0.14],
];

const TREE_GEO = {
  platan: platanGeo, chestnut: chestnutGeo, acacia: acaciaGeo,
  poplar: poplarGeo, cypress: cypressGeo, pine: pineGeo, olive: oliveGeo,
};
const LAMP_GEO = { street: lampStreetGeo, park: lampParkGeo, twin: lampTwinGeo };

// Улицу сажают ОДНОЙ породой — и в жизни, и здесь. Это и правдоподобнее, и
// дешевле: в одном чанке 400 м оказывается три-четыре породы, а не все семь,
// то есть InstancedMesh-ей (и вызовов отрисовки) не становится вшестеро больше.
const SET_AVENUE = ['platan', 'platan', 'chestnut', 'poplar', 'acacia'];
const SET_STREET = ['chestnut', 'acacia', 'platan', 'poplar', 'olive'];
const SET_PROM   = ['platan', 'cypress', 'chestnut', 'olive'];   // пешеходные улицы и набережные
const SET_GREEN = {
  wood:  ['pine', 'pine', 'platan', 'chestnut'],
  park:  ['platan', 'chestnut', 'cypress', 'pine', 'poplar', 'olive'],
  scrub: ['olive', 'pine', 'olive', 'acacia'],
  grass: ['platan', 'acacia', 'olive', 'cypress'],
};

const ST = 8;   // x, y, z, размер вширь, размер ввысь, поворот, наклон, азимут наклона
const CAP_BUSH = 4000, CAP_HEDGE = 2800;   // потолок прироста: всего объектов +25%, не больше трети

// Прореживание до потолка. Лишнее не отбрасываем «как пойдёт»: перебор идёт по
// полигонам подряд, и обрыв по счётчику озеленил бы первые парки и оставил
// голыми все остальные. Берём каждый k-й по всему списку.
function trim(arr, cap) {
  const n = arr.length / ST;
  if (n <= cap) return arr;
  const out = [], k = n / cap;
  for (let i = 0; i < cap; i++) {
    const j = Math.floor(i * k) * ST;
    for (let m = 0; m < ST; m++) out.push(arr[j + m]);
  }
  return out;
}

export function buildStreetProps(world, terrain, roadIndex) {
  const buildings = new PolyGrid(world.buildings, 90);

  // Тот же самый растр, что у дорог и аудита — строится один раз на мир.
  const COV = world.__coverage;
  const onRoad = (x, z) => COV.onRoad(x, z);
  const rand = rng(4242);
  const H = (x, z) => terrain.gridHeightAt(x, z);
  // Тротуар РИСУЕТСЯ на 20 см выше рельефа (KERB_H + 0.03 в worldgen), а
  // уличные посадки садились в голый рельеф да ещё утапливались на четверть
  // метра — ствол оказывался на 45 см ниже плитки и торчал из неё без
  // основания. У проезжих улиц с тротуаром сажаем на отметку тротуара.
  const WALK_TOP = 0.20;

  // По корзине на породу: одна порода — одна геометрия — свои InstancedMesh.
  const bins = {}; for (const k in TREE_GEO) bins[k] = [];
  const lampBins = { street: [], park: [], twin: [] };
  let bushes = [], hedges = [];

  const free = (x, z) => H(x, z) > 1.2 && !buildings.find(x, z);
  // Дерево или фонарь не должны встать на пересекающую улицу: осевые в OSM
  // пересекаются, и точка «в тротуаре» своей улицы легко оказывается на чужой проезжей части.
  // на проезжей части не место ни дереву, ни фонарю — чья бы улица ни была
  const onOtherRoad = (x, z) => onRoad(x, z);

  // Разброс размеров и наклон. Молодое дерево тонкое и вытянутое, старое
  // раскидистое; наклон в пару градусов важнее, чем кажется — строй идеальных
  // вертикалей выдаёт расстановку по формуле сильнее, чем сама форма кроны.
  const pushTree = (list, x, y, z, big) => {
    const w = 0.70 + hash2(x * 1.7, z * 1.7) * (big ? 0.62 : 0.45);
    const h = w * (0.86 + hash2(z * 2.3, x * 2.3) * 0.36);
    list.push(x, y, z, w, h,
      hash2(x, z) * 6.283,                             // поворот кроны
      (hash2(x * 0.9, z * 0.9) - 0.5) * 0.075,         // наклон ствола, ±2°
      hash2(z * 0.6, x * 0.6) * 6.283);                // куда наклонён
  };
  const pushBush = (x, y, z) => {
    const w = 0.62 + hash2(x * 3.3, z * 3.3) * 0.75;
    bushes.push(x, y, z, w, w * (0.75 + hash2(z * 4.1, x * 4.1) * 0.5),
      hash2(x * 2.2, z * 2.2) * 6.283, 0, 0);
  };

  // Порода уличного дерева: её задаёт УЛИЦА, а не отдельное дерево. Небольшая
  // доля подсадок другой породы — чтобы ряд не выглядел вычисленным.
  const pickStreet = (set, seed, x, z) =>
    hash2(x * 3.1, z * 3.1) < 0.14
      ? set[Math.floor(hash2(z, x) * set.length)]
      : set[Math.floor(seed * set.length)];

  // Тип фонаря по классу дороги: проспект — двойной, обычная улица —
  // консольный, проезд — парковый шар.
  const lampFor = r => (r.c <= 1 && r.w >= 10) ? 'twin' : (r.c <= 2 && r.w >= 7) ? 'street' : 'park';

  for (let ri = 0; ri < world.roads.length; ri++) {
    const r = world.roads[ri];
    const walkway = r.c === 4 && r.w >= 4;    // пешеходная улица: бульвары и набережные
    if (!walkway && (r.c > 3 || r.w < 5 || r.br || r.tn)) continue;
    const p = r.pts, hw = r.w / 2;
    const seed = hash2(ri * 131 + 7, ri * 17 + r.w * 37);
    const set = walkway ? SET_PROM : r.w >= 10 ? SET_AVENUE : SET_STREET;
    const lk = walkway ? 'park' : lampFor(r);
    // на бульваре деревья и фонари стоят чаще и ближе, чем на проезжей улице
    const stepT = walkway ? 9.0 : 11.5, stepL = walkway ? 22.0 : 31.0;
    // тротуар строится только у проезжих улиц шириной от 5 м; у пешеходной
    // улицы его нет, и там посадки остаются на рельефе
    const walkTop = walkway ? 0 : WALK_TOP;
    const offT = walkway ? hw + 1.1 : hw + 1.8, offL = walkway ? hw + 0.9 : hw + 0.85;
    // идём вдоль осевой равномерным шагом, а не по узлам OSM: они стоят как попало
    let carry = 0, dist = 0;
    for (let i = 0; i < p.length / 2 - 1; i++) {
      const ax = p[i * 2], az = p[i * 2 + 1];
      const dx = p[i * 2 + 2] - ax, dz = p[i * 2 + 3] - az;
      const len = Math.hypot(dx, dz);
      if (len < 0.2) continue;
      const ux = dx / len, uz = dz / len;
      const nx = -uz, nz = ux;
      for (let t = carry; t < len; t += 1.0) {
        const cx = ax + ux * t, cz = az + uz * t;
        const d = dist + t;
        for (const side of [1, -1]) {
          // дерево в тротуаре
          if (Math.abs(d % stepT - (side > 0 ? 0 : stepT * 0.5)) < 0.5) {
            const x = cx + nx * side * offT, z = cz + nz * side * offT;
            if (free(x, z) && !onOtherRoad(x, z)) {
              if (rand() < 0.70) {
                // Кипарис и сосна — примета приморской части: на бульварах у бухты
                // их ряды, а в верхнем городе почти нет. Долю привязываем к высоте.
                const h = H(x, z);
                const seaside = h < 24 ? 0.26 : h < 45 ? 0.10 : 0.03;
                const sp = hash2(x * 5.5, z * 5.5) < seaside
                  ? (hash2(x, z * 2) < 0.72 ? 'cypress' : 'pine')
                  : pickStreet(set, seed, x, z);
                pushTree(bins[sp], x, h + walkTop - 0.10, z, true);
              } else if (rand() < 0.34) {
                // там, где дерева не вышло, остаётся приствольный газон с кустом:
                // ряд перестаёт быть пунктиром из одинаковых промежутков
                pushBush(x, H(x, z) + walkTop - 0.04, z);
              }
            }
          }
          // фонарь
          if (Math.abs(d % stepL - (side > 0 ? stepL * 0.26 : stepL * 0.74)) < 0.5) {
            const x = cx + nx * side * offL, z = cz + nz * side * offL;
            if (free(x, z) && !onOtherRoad(x, z))
              lampBins[lk].push(x, H(x, z) + walkTop, z, 1, 1, Math.atan2(-nx * side, -nz * side), 0, 0);
          }

        }
      }
      carry = (carry + Math.ceil((len - carry) / 1.0) * 1.0) - len;
      if (carry < 0) carry = 0;
      dist += len;
    }
  }

  // ОБМЕРЕННЫЕ ДЕРЕВЬЯ. Агенты сняли посадки Исторического бульвара,
  // Комсомольского парка и двух кладбищ по спутнику: 1283 дерева, у каждого
  // своя координата, порода и радиус кроны. Эти сажаем ПЕРВЫМИ и по факту,
  // а не по плотности — там, где реально стоят.
  const SPEC_MAP = {
    'платан': 'platan', 'платан восточный': 'platan', 'каштан': 'chestnut',
    'конский каштан': 'chestnut', 'акация': 'acacia', 'робиния': 'acacia',
    'софора': 'acacia', 'тополь': 'poplar', 'кипарис': 'cypress', 'туя': 'cypress',
    'сосна': 'pine', 'сосна крымская': 'pine', 'ель': 'pine', 'кедр': 'pine',
    'олива': 'olive', 'маслина': 'olive', 'миндаль': 'olive', 'сирень': 'olive',
    'багряник': 'olive', 'фисташка': 'olive', 'фисташка туполистая': 'olive',
    'клён': 'platan', 'липа': 'platan', 'дуб': 'platan', 'ясень': 'platan',
  };
  let measured = 0, onAsphalt = 0;
  for (const t of (world.places && world.places.trees) || []) {
    // Обмер снят по спутнику, а полотно у меня своей ширины: часть посадок
    // попадает на асфальт. Такие не сажаем — дерево посреди дороги хуже,
    // чем отсутствующее дерево.
    if (onRoad(t.x, t.z)) { onAsphalt++; continue; }
    const key = (t.sp || '').toLowerCase();
    const sp = SPEC_MAP[key] || (key.includes('кипар') ? 'cypress' : key.includes('сосн') ? 'pine' : 'platan');
    const list = bins[sp] || bins.platan;
    // размер берём ИЗ ОБМЕРА, а не из хеша: у бульвара кроны до 9 м
    const w = Math.max(0.55, (t.r || 3.5) / 5.0);
    const h = Math.max(0.55, (t.h || 9) / 11.0);
    list.push(t.x, H(t.x, t.z) - 0.25, t.z, w, h,
      hash2(t.x, t.z) * 6.283,
      (hash2(t.x * 0.9, t.z * 0.9) - 0.5) * 0.075,
      hash2(t.z * 0.6, t.x * 0.6) * 6.283);
    measured++;
  }
  // счётчик отдадим в userData ниже

  // Где посадки СНЯТЫ по спутнику, сыпать сверху ещё и по плотности нельзя:
  // Комсомольский парк зарастал вдвое и переставал просматриваться, а кадр
  // проседал. Считаем обмеренные деревья по клеткам 40 м и в занятых клетках
  // плотность отключаем.
  const measuredCell = new Set();
  for (const t of (world.places && world.places.trees) || [])
    measuredCell.add(Math.floor(t.x / 40) * 100003 + Math.floor(t.z / 40));
  const hasMeasured = (x, z) => measuredCell.has(Math.floor(x / 40) * 100003 + Math.floor(z / 40));

  // деревья в парках и на склонах — там, где OSM отметил зелень
  for (const g of world.green) {
    const dens = { wood: 105, park: 130, scrub: 260, grass: 620 }[g.kind];
    const q = g.poly;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity, a = 0;
    for (let i = 0; i < q.length; i += 2) {
      x0 = Math.min(x0, q[i]); x1 = Math.max(x1, q[i]);
      z0 = Math.min(z0, q[i + 1]); z1 = Math.max(z1, q[i + 1]);
    }
    for (let i = 0, n = q.length / 2; i < n; i++) {
      const j = (i + 1) % n;
      a += q[i * 2] * q[j * 2 + 1] - q[j * 2] * q[i * 2 + 1];
    }
    const area = Math.abs(a / 2);

    // Живая изгородь по кромке газона, спортплощадки и сквера. Именно кромка
    // объясняет глазу, где кончается газон и начинается тротуар: без неё
    // зелёное пятно просто упирается в серое.
    if (g.kind === 'park' || g.kind === 'grass' || g.kind === 'pitch') {
      for (let i = 0, n = q.length / 2; i < n; i++) {
        const j = (i + 1) % n;
        const ax = q[i * 2], az = q[i * 2 + 1];
        const dx = q[j * 2] - ax, dz = q[j * 2 + 1] - az, L = Math.hypot(dx, dz);
        if (L < 6) continue;
        const ux = dx / L, uz = dz / L;
        // нормаль внутрь полигона: снаружи изгородь встала бы поперёк тротуара
        let hx = -uz, hz = ux;
        const mx = ax + dx * 0.5, mz = az + dz * 0.5;
        if (!pointIn(q, mx + hx * 1.4, mz + hz * 1.4)) { hx = -hx; hz = -hz; }
        for (let t = 2.2; t < L - 2.2; t += 3.4) {
          const x = ax + ux * t + hx * 1.1, z = az + uz * t + hz * 1.1;
          // изгородь не сплошная: калитки, проходы, вытоптанные места
          if (hash2(x * 0.7, z * 0.7) > 0.62) continue;
          if (!free(x, z) || onRoad(x, z)) continue;
          hedges.push(x, H(x, z) - 0.08, z, 1, 0.82 + hash2(x, z) * 0.36,
            Math.atan2(-uz, ux), 0, 0);
        }
      }
    }

    if (!dens) continue;
    const want = Math.min(1400, Math.floor(area / dens));
    const gset = SET_GREEN[g.kind];
    let placed = 0, tries = 0;
    while (placed < want && tries++ < want * 12) {
      const x = x0 + rand() * (x1 - x0), z = z0 + rand() * (z1 - z0);
      if (!pointIn(q, x, z) || H(x, z) < 1.4 || onRoad(x, z) || hasMeasured(x, z)) continue;
      // В роще деревья одной породы стоят куртинами, а не вперемешку: породу
      // задаёт крупная ячейка 90 м, внутри неё лес однородный.
      const cellSeed = hash2(Math.floor(x / 90) * 90, Math.floor(z / 90) * 90);
      const sp = hash2(x * 3.1, z * 3.1) < 0.18
        ? gset[Math.floor(hash2(z, x) * gset.length)]
        : gset[Math.floor(cellSeed * gset.length)];
      pushTree(bins[sp], x, H(x, z) - 0.25, z, true);
      placed++;
    }
    // подлесок: кустов вдвое меньше деревьев, но они закрывают стык кроны с землёй
    const wantB = Math.floor(want * 0.5);
    let pb = 0; tries = 0;
    while (pb < wantB && tries++ < wantB * 12) {
      const x = x0 + rand() * (x1 - x0), z = z0 + rand() * (z1 - z0);
      if (!pointIn(q, x, z) || H(x, z) < 1.4 || onRoad(x, z) || hasMeasured(x, z)) continue;
      pushBush(x, H(x, z) - 0.1, z);
      pb++;
    }
  }

  bushes = trim(bushes, CAP_BUSH);
  hedges = trim(hedges, CAP_HEDGE);

  const group = new THREE.Group();
  group.name = 'props';
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), qt = new THREE.Quaternion(),
        sv = new THREE.Vector3(), pv = new THREE.Vector3(),
        up = new THREE.Vector3(0, 1, 0), ax = new THREE.Vector3();

  // Материал один на всё уличное наполнение: у него общая программа шейдера,
  // и деревья, кусты и фонари не заставляют GPU переключать состояние.
  const MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });

  // Один InstancedMesh на весь город никогда не отсекается по пирамиде видимости:
  // GPU обрабатывает все двадцать тысяч деревьев, даже если в кадре три.
  // Раскладываем по квадратам 400 м — рисуется только то, что рядом.
  //
  // Размер куска подбираем под плотность вида. Мелкая нарезка хороша для того,
  // чего много: отсекается почти всё лишнее. Но у редкой породы в куске 400 м
  // оказывается три дерева, а вызов отрисовки стоит столько же, что и на
  // трёхстах — семь пород вместо одной удвоили бы число вызовов при том же
  // числе треугольников. Поэтому редкое режем крупнее: лишних треугольников это
  // добавляет мало (их и так мало), а вызовов экономит вдвое.
  const CHUNK = 400;
  const chunkFor = n => n >= 6000 ? CHUNK : n >= 2000 ? CHUNK * 1.5 : CHUNK * 2;
  const place = (geoFn, arr, cast) => {
    const n = arr.length / ST;
    if (!n) return 0;
    const cs = chunkFor(n);
    const buckets = new Map();
    for (let i = 0; i < n; i++) {
      const k = Math.floor(arr[i * ST] / cs) + ',' + Math.floor(arr[i * ST + 2] / cs);
      let b = buckets.get(k); if (!b) buckets.set(k, b = []);
      b.push(i);
    }
    const geo = geoFn();
    for (const idxs of buckets.values()) {
      const mesh = new THREE.InstancedMesh(geo, MAT, idxs.length);
      mesh.castShadow = cast;
      idxs.forEach((i, k) => {
        const o = i * ST;
        pv.set(arr[o], arr[o + 1], arr[o + 2]);
        sv.set(arr[o + 3], arr[o + 4], arr[o + 3]);
        q4.setFromAxisAngle(up, arr[o + 5]);
        const tilt = arr[o + 6];
        if (tilt) {
          ax.set(Math.cos(arr[o + 7]), 0, Math.sin(arr[o + 7]));
          q4.premultiply(qt.setFromAxisAngle(ax, tilt));
        }
        mesh.setMatrixAt(k, m4.compose(pv, q4, sv));
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
    return n;
  };

  // тени от деревьев и фонарей стоят дороже, чем дают: удваивают проход теней
  let nT = 0;
  const byKind = {};
  for (const k in TREE_GEO) { const c = place(TREE_GEO[k], bins[k], false); byKind[k] = c; nT += c; }
  const nB = place(bushGeo, bushes, false);
  const nH = place(hedgeGeo, hedges, false);
  let nL = 0;
  for (const k in LAMP_GEO) nL += place(LAMP_GEO[k], lampBins[k], false);

  group.userData.counts = { деревья: nT, 'из них обмеренных': measured, 'снято с асфальта': onAsphalt, кусты: nB, изгороди: nH, фонари: nL, чанков: group.children.length };
  group.userData.species = byKind;
  group.userData.onRoad = onRoad;   // тем же растром пользуется уличная мебель
  return group;
}

function pointIn(p, px, pz) {
  let inside = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], zi = p[i + 1], xj = p[j], zj = p[j + 1];
    if ((zi > pz) !== (zj > pz) && px < (xj - xi) * (pz - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
