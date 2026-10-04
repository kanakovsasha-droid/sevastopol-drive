import * as THREE from 'three';
import { PolyGrid } from './worldgen.js?v=88d8594b';
import { plantFlora, crownRadius, ST } from './flora.js?v=88d8594b';
import { streetOwnsRoad } from './street.js?v=88d8594b';

// Уличное наполнение. По панорамам Севастополя видно, что улицу делают не дома,
// а то, что вдоль неё: платаны в тротуаре, сплошной ряд машин у бордюра,
// фонари. Без этого любой город остаётся набором коробок.
//
// Главная жалоба на прежнюю версию — «квадратно, как в роблоксе». Виноваты были
// не дома: деревьев в кадре десятки, и все они были ОДНИМ многогранником на
// палке — одинаковой формы, высоты и цвета. Глаз ловит повтор мгновенно.
// Лечится это не детализацией (двадцать тысяч деревьев её не выдержат), а
// разнообразием: девять пород с разными силуэтами, разброс размеров и наклон
// ствола. Сами деревья, их ступени подробности и отрисовка — в flora.js;
// здесь только КУДА и ЧТО сажать.

const s2l = v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);

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

// Металл и стекло фонарей — в sRGB, mergeParts переводит их в линейное.
// Деревья, кусты и изгороди переехали в flora.js.
const METAL = [0.318, 0.325, 0.325], GLASS = [0.647, 0.639, 0.612];

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

const LAMP_GEO = { street: lampStreetGeo, park: lampParkGeo, twin: lampTwinGeo };

// Улицу сажают ОДНОЙ породой — и в жизни, и здесь: в квартале оказывается
// три-четыре породы, а не все девять. По фото проспекта Нахимова и Большой
// Морской: на проспектах платан и каштан, на улицах — софора и робиния.
const SET_AVENUE = ['platan', 'platan', 'chestnut', 'acacia', 'poplar'];
const SET_STREET = ['acacia', 'chestnut', 'platan', 'acacia', 'olive'];
const SET_PROM   = ['platan', 'cypress', 'chestnut', 'acacia', 'olive'];   // пешеходные улицы и набережные
const SET_GREEN = {
  wood:  ['pine', 'pine', 'acacia', 'chestnut'],
  park:  ['platan', 'chestnut', 'acacia', 'cypress', 'pine', 'spruce', 'thuja', 'poplar'],
  scrub: ['olive', 'pine', 'olive', 'acacia', 'thuja'],
  grass: ['platan', 'acacia', 'thuja', 'cypress', 'olive'],
};
// узкое место между тротуаром и стеной: сюда влезает только «свеча»
const NARROW = ['cypress', 'thuja', 'poplar'];

const LST = 8;   // фонари: x, y, z, размер вширь, размер ввысь, поворот, наклон, азимут наклона
const CAP_BUSH = 4000, CAP_HEDGE = 3000;   // потолок на квартал

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

// Расстояние до кромки проезжей части, дорожки и путей — по ОСЕВЫМ ВСЕЙ сети
// квадрата (world.roads.ctx.all), а не по растру покрытия.
//
// Растр строится из улиц, которые достались ЭТОЙ сборке. Улица на шве двух
// квадратов принадлежит тому, кто собрался первым, и у соседа её в растре нет:
// его посадки садились прямо на чужой асфальт. Так и стоял куст посреди
// Большой Морской (−260, 1182): улица лежит в квадратах −1_0 и −1_1, а
// посадка второго квадрата о ней не знала. Осевые всей сети квадрата приходят
// контекстом от менеджера чанков — их и меряем.
function clearance(world) {
  const ctx = world.roads.ctx;
  const all = ctx ? ctx.all : world.roads;
  const SEG = [];      // ax, az, bx, bz, полуширина, класс (0 — проезжая, 1 — дорожка, 2 — пути)
  const add = (p, hw, cls) => {
    for (let i = 0; i + 3 < p.length; i += 2) SEG.push(p[i], p[i + 1], p[i + 2], p[i + 3], hw, cls);
  };
  for (const r of all) {
    if (!r.pts || r.pts.length < 4 || r.tn) continue;
    if (r.c <= 3) add(r.pts, r.w / 2, 0);
    else add(r.pts, Math.max(0.9, r.w / 2), 1);
  }
  for (const pa of (world.places && world.places.paths) || []) add(pa.pts, Math.max(0.9, (pa.w || 3) / 2), 1);
  for (const rl of world.rail || []) add(rl.pts, 1.7, 2);
  const C = 16, grid = new Map();
  const n = SEG.length / 6;
  for (let s = 0; s < n; s++) {
    const o = s * 6, pad = SEG[o + 4];
    const x0 = Math.floor((Math.min(SEG[o], SEG[o + 2]) - pad) / C), x1 = Math.floor((Math.max(SEG[o], SEG[o + 2]) + pad) / C);
    const z0 = Math.floor((Math.min(SEG[o + 1], SEG[o + 3]) - pad) / C), z1 = Math.floor((Math.max(SEG[o + 1], SEG[o + 3]) + pad) / C);
    for (let cx = x0; cx <= x1; cx++)
      for (let cz = z0; cz <= z1; cz++) {
        const k = cx * 100003 + cz;
        let a = grid.get(k); if (!a) grid.set(k, a = []);
        a.push(s);
      }
  }
  const FAR = C;
  const out = [FAR, FAR, FAR];
  // до кромки каждого класса, не дальше 16 м
  return (x, z) => {
    out[0] = out[1] = out[2] = FAR;
    const cx = Math.floor(x / C), cz = Math.floor(z / C);
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++) {
        const a = grid.get((cx + i) * 100003 + cz + j);
        if (!a) continue;
        for (const s of a) {
          const o = s * 6;
          const ax = SEG[o], az = SEG[o + 1], dx = SEG[o + 2] - ax, dz = SEG[o + 3] - az;
          const L2 = dx * dx + dz * dz || 1e-9;
          let t = ((x - ax) * dx + (z - az) * dz) / L2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const d = Math.hypot(x - ax - dx * t, z - az - dz * t) - SEG[o + 4];
          const c = SEG[o + 5];
          if (d < out[c]) out[c] = d;
        }
      }
    return out;
  };
}

// Хеш строки (id улицы): порода улицы не должна зависеть от того, каким по
// счёту улица лежит в файле квадрата — у соседа она лежит под другим номером.
function strHash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

// Расстояние до ближайшей стены — по рёбрам контуров домов в сетке 8 м. Один
// запрос вместо двух десятков проб «внутри дома или нет».
function wallField(items) {
  const C = 8, grid = new Map(), SEG = [];
  for (const b of items) {
    const p = b.poly;
    for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) SEG.push(p[j], p[j + 1], p[i], p[i + 1]);
  }
  const n = SEG.length / 4;
  for (let s = 0; s < n; s++) {
    const o = s * 4;
    const x0 = Math.floor(Math.min(SEG[o], SEG[o + 2]) / C), x1 = Math.floor(Math.max(SEG[o], SEG[o + 2]) / C);
    const z0 = Math.floor(Math.min(SEG[o + 1], SEG[o + 3]) / C), z1 = Math.floor(Math.max(SEG[o + 1], SEG[o + 3]) / C);
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > 400) continue;      // испорченный контур
    for (let cx = x0; cx <= x1; cx++)
      for (let cz = z0; cz <= z1; cz++) {
        const k = cx * 100003 + cz;
        let a = grid.get(k); if (!a) grid.set(k, a = []);
        a.push(s);
      }
  }
  // До ближайшего ребра, не дальше cap (≤ 8 м): смотрим только те клетки,
  // что задевает круг радиуса cap, — у изгороди это одна клетка, а не девять.
  return (x, z, cap = C) => {
    let best = cap;
    const i0 = Math.floor((x - cap) / C), i1 = Math.floor((x + cap) / C);
    const j0 = Math.floor((z - cap) / C), j1 = Math.floor((z + cap) / C);
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) {
        const a = grid.get(i * 100003 + j);
        if (!a) continue;
        for (const s of a) {
          const o = s * 4;
          const ax = SEG[o], az = SEG[o + 1], dx = SEG[o + 2] - ax, dz = SEG[o + 3] - az;
          const L2 = dx * dx + dz * dz || 1e-9;
          let t = ((x - ax) * dx + (z - az) * dz) / L2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const ex = x - ax - dx * t, ez = z - az - dz * t;
          const d2 = ex * ex + ez * ez;
          if (d2 < best * best) best = Math.sqrt(d2);
        }
      }
    return best;
  };
}

export function buildStreetProps(world, terrain, roadIndex, allBuildings = null) {
  const group = new THREE.Group();
  group.name = 'props';
  // «На асфальте ли точка» — по той же кромке, по которой асфальт рисуется
  // (buildRoads подменяет растр покрытия полем кромки, +0.3 м на бордюр). Это
  // источник истины; мои расстояния до осевых (clearance) — запас сверху: от
  // кромки до ствола, до дорожки, до путей. Ими же пользуется мебель.
  const COV = world.__coverage;
  const onRoad = (x, z) => COV.onRoad(x, z);
  group.userData.onRoad = onRoad;
  group.userData.counts = {};

  // Посадки — принадлежность МЕСТА, а не улицы или парка: квадрат сажает
  // вдоль всех улиц своего файла и во всей своей зелени, но только внутри
  // своих границ. Раньше улица на шве засаживалась целиком тем, кто её
  // построил, — и за чужой границей деревья садились вслепую, ничего не зная
  // о тамошних улицах. У пачки сирот границ нет: всё, что лежит в живом
  // соседе, он посадил сам, а выгруженный квадрат сажать незачем.
  const ctx = world.roads.ctx;
  if (!ctx || !ctx.all || ctx.x1 === undefined) return group;
  const { x0: SX0, z0: SZ0, x1: SX1, z1: SZ1 } = ctx;
  const inSq = (x, z) => x >= SX0 && x < SX1 && z >= SZ0 && z < SZ1;

  // Дома — ВСЕ дома квадрата, включая доставшиеся соседу: иначе дерево у шва
  // вырастало сквозь стену дома, который построил соседний квадрат.
  const blds = allBuildings && allBuildings.length ? allBuildings : world.buildings;
  const buildings = new PolyGrid(blds, 40);
  const wall = wallField(blds);
  const edge = clearance(world);
  const H = (x, z) => terrain.gridHeightAt(x, z);
  // Тротуар РИСУЕТСЯ на 20 см выше рельефа (KERB_H + 0.03 в worldgen), а
  // уличные посадки садились в голый рельеф да ещё утапливались на четверть
  // метра — ствол оказывался на 45 см ниже плитки и торчал из неё без
  // основания. У проезжих улиц с тротуаром сажаем на отметку тротуара.
  const WALK_TOP = 0.20;

  const sets = {};
  const put = (k, ...v) => (sets[k] || (sets[k] = [])).push(...v);
  const lampBins = { street: [], park: [], twin: [] };

  // ни в доме, ни на площадке: парковку и поле размечает buildAreas
  const noPlant = world.__noPlant || (() => false);
  const free = (x, z) => H(x, z) > 1.2 && !noPlant(x, z) && !buildings.find(x, z);
  // Посадка с ограничением по месту: крона не больше, чем пускает стена (с
  // запасом в 1.8 м — в узкой улице ветви и в жизни упираются в фасад),
  // а совсем впритык — «свеча».
  const pushTree = (sp, x, y, z, big, flags) => {
    let w = 0.70 + hash2(x * 1.7, z * 1.7) * (big ? 0.62 : 0.45);
    const rm = wall(x, z, Math.min(8, crownRadius(sp) * w));
    if (rm < 1.0) return false;
    if (crownRadius(sp) * w > rm + 1.8) {
      if (rm < 1.6 && !NARROW.includes(sp)) sp = NARROW[Math.floor(hash2(z, x * 3) * NARROW.length)];
      w = Math.min(w, Math.max(0.55, (rm + 1.8) / crownRadius(sp)));
    }
    const h = w * (0.86 + hash2(z * 2.3, x * 2.3) * 0.36);
    put(sp, x, y, z, w, h,
      hash2(x, z) * 6.283,                             // поворот кроны
      (hash2(x * 0.9, z * 0.9) - 0.5) * 0.075,         // наклон ствола, ±2°
      hash2(z * 0.6, x * 0.6) * 6.283,                 // куда наклонён
      flags);
    return true;
  };
  const pushBush = (kind, x, y, z) => {
    const w = 0.62 + hash2(x * 3.3, z * 3.3) * 0.75;
    put(kind, x, y, z, w, w * (0.75 + hash2(z * 4.1, x * 4.1) * 0.5), hash2(x * 2.2, z * 2.2) * 6.283, 0, 0, 0);
  };
  // Куст по месту: у моря олеандр, на бульваре стриженый самшит, иначе рыхлый.
  const bushKind = (x, z, h, prom) => {
    const r = hash2(x * 4.7, z * 4.7);
    if (h < 30 && r < 0.3) return 'oleander';
    if (prom && r < 0.7) return 'box';
    return r < 0.82 ? 'shrub' : 'box';
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

  let rejected = 0;
  for (const r of ctx.all) {
    const walkway = r.c === 4 && r.w >= 4;    // пешеходная улица: бульвары и набережные
    if (!walkway && (r.c > 3 || r.w < 5 || r.br || r.tn)) continue;
    if (streetOwnsRoad(r)) continue;          // Большую Морскую сажает street.js по натуре
    const p = r.pts, hw = r.w / 2;
    if (!p || p.length < 4) continue;
    // улица целиком мимо квадрата (с запасом на отступ посадок) — пропускаем
    let bx0 = Infinity, bz0 = Infinity, bx1 = -Infinity, bz1 = -Infinity;
    for (let i = 0; i < p.length; i += 2) {
      bx0 = Math.min(bx0, p[i]); bx1 = Math.max(bx1, p[i]); bz0 = Math.min(bz0, p[i + 1]); bz1 = Math.max(bz1, p[i + 1]);
    }
    if (bx1 < SX0 - 20 || bx0 > SX1 + 20 || bz1 < SZ0 - 20 || bz0 > SZ1 + 20) continue;
    const seed = strHash(String(r.id ?? p[0] + ',' + p[1]));
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
            if (!inSq(x, z) || !free(x, z)) continue;
            const e = edge(x, z);
            // ствол — не ближе метра к любой проезжей части (в том числе к
            // поперечной на перекрёстке), не на дорожке и не на путях
            if (e[0] < 1.0 || e[1] < 0.4 || e[2] < 1.2 || onRoad(x, z)) { rejected++; continue; }
            // жребий — от места, а не от порядка обхода
            const lot = hash2(x * 2.9 + 11, z * 2.9 - 5);
            if (lot < 0.70) {
              // Кипарис и сосна — примета приморской части: на бульварах у бухты
              // их ряды, а в верхнем городе почти нет. Долю привязываем к высоте.
              const h = H(x, z);
              const seaside = h < 24 ? 0.26 : h < 45 ? 0.10 : 0.03;
              const sp = hash2(x * 5.5, z * 5.5) < seaside
                ? (hash2(x, z * 2) < 0.72 ? 'cypress' : 'pine')
                : pickStreet(set, seed, x, z);
              // уличные стволы в Севастополе белят почти поголовно
              pushTree(sp, x, h + walkTop - 0.10, z, true, hash2(x * 7, z * 7) < 0.9 ? 1 : 0);
            } else if (lot < 0.80 && e[0] > 1.4 && e[1] > 0.9 && !onRoad(x + 0.8, z) && !onRoad(x - 0.8, z) && !onRoad(x, z + 0.8) && !onRoad(x, z - 0.8)) {
              // там, где дерева не вышло, остаётся приствольный газон с кустом:
              // ряд перестаёт быть пунктиром из одинаковых промежутков
              const h = H(x, z);
              pushBush(bushKind(x, z, h, walkway), x, h + walkTop - 0.04, z);
            }
          }
          // фонарь
          if (Math.abs(d % stepL - (side > 0 ? stepL * 0.26 : stepL * 0.74)) < 0.5) {
            const x = cx + nx * side * offL, z = cz + nz * side * offL;
            if (inSq(x, z) && free(x, z) && edge(x, z)[0] > 0.3 && !onRoad(x, z))
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
    'софора': 'acacia', 'тополь': 'poplar', 'кипарис': 'cypress', 'туя': 'thuja',
    'можжевельник': 'thuja', 'сосна': 'pine', 'сосна крымская': 'pine', 'ель': 'spruce', 'кедр': 'pine',
    'олива': 'olive', 'маслина': 'olive', 'миндаль': 'olive', 'сирень': 'olive',
    'багряник': 'olive', 'фисташка': 'olive', 'фисташка туполистая': 'olive',
    'клён': 'platan', 'липа': 'platan', 'дуб': 'platan', 'ясень': 'platan',
  };
  let measured = 0, onAsphalt = 0;
  const mtrees = (ctx.trees || (world.places && world.places.trees) || []).filter(t => inSq(t.x, t.z));
  for (const t of mtrees) {
    // Обмер снят по спутнику, а полотно у меня своей ширины: часть посадок
    // попадает на асфальт. Такие не сажаем — дерево посреди дороги хуже,
    // чем отсутствующее дерево. На дорожке (крона над аллеей снята центром
    // на её оси) — тоже.
    const e = edge(t.x, t.z);
    if (e[0] < 0.6 || e[1] < -0.2 || e[2] < 1.0 || onRoad(t.x, t.z) || noPlant(t.x, t.z) || buildings.find(t.x, t.z)) { onAsphalt++; continue; }
    const key = (t.sp || '').toLowerCase();
    const sp = SPEC_MAP[key] || (key.includes('кипар') ? 'cypress' : key.includes('сосн') ? 'pine' : 'platan');
    // размер берём ИЗ ОБМЕРА, а не из хеша: у бульвара кроны до 9 м
    // ширина кроны — из обмера, но не шире полутора высот: иначе старая
    // робиния бульвара расплющивалась в зонтик саванны
    const h = Math.max(0.55, (t.h || 9) / 11.0);
    const w = Math.min(h * 1.35, Math.max(0.55, (t.r || 3.5) / (crownRadius(sp) * 1.25)));
    put(sp, t.x, H(t.x, t.z) - 0.25, t.z, w, h,
      hash2(t.x, t.z) * 6.283,
      (hash2(t.x * 0.9, t.z * 0.9) - 0.5) * 0.075,
      hash2(t.z * 0.6, t.x * 0.6) * 6.283,
      hash2(t.x * 7, t.z * 7) < 0.6 ? 1 : 0);
    measured++;
  }

  // Где посадки СНЯТЫ по спутнику, сыпать сверху ещё и по плотности нельзя:
  // Комсомольский парк зарастал вдвое и переставал просматриваться, а кадр
  // проседал. Считаем обмеренные деревья по клеткам 40 м и в занятых клетках
  // плотность отключаем.
  const measuredCell = new Set();
  for (const t of mtrees) measuredCell.add(Math.floor(t.x / 40) * 100003 + Math.floor(t.z / 40));
  const hasMeasured = (x, z) => measuredCell.has(Math.floor(x / 40) * 100003 + Math.floor(z / 40));

  const hedges = [];
  let bushes = 0;
  // деревья в парках и на склонах — там, где OSM отметил зелень
  for (const g of (ctx.green || world.green)) {
    const dens = { wood: 105, park: 130, scrub: 260, grass: 620 }[g.kind];
    const q = g.poly;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity, a = 0;
    for (let i = 0; i < q.length; i += 2) {
      x0 = Math.min(x0, q[i]); x1 = Math.max(x1, q[i]);
      z0 = Math.min(z0, q[i + 1]); z1 = Math.max(z1, q[i + 1]);
    }
    if (x1 < SX0 || x0 >= SX1 || z1 < SZ0 || z0 >= SZ1) continue;
    for (let i = 0, n = q.length / 2; i < n; i++) {
      const j = (i + 1) % n;
      a += q[i * 2] * q[j * 2 + 1] - q[j * 2] * q[i * 2 + 1];
    }
    const area = Math.abs(a / 2);

    // ЖИВАЯ ИЗГОРОДЬ по кромке газона и сквера — там, где газон выходит к
    // улице или аллее (у стены дома её не стригут). Раньше это была россыпь
    // брусков через один с пропусками «на калитки» — читалось кубиками.
    // Теперь сплошная лента: кромку режем на секции по ~2 м, секции стоят
    // встык, рвутся только там, где лента упёрлась в асфальт, дорожку или
    // дом, и на редких калитках. Высота одна на всю сторону газона: её
    // стригут разом.
    // У спортплощадки своя ограда (sport.js): изгородь по её зелени стояла
    // кустами посреди беговой дорожки и висела над полем.
    if (g.kind === 'park' || g.kind === 'grass') {
      for (let i = 0, n = q.length / 2; i < n; i++) {
        const j = (i + 1) % n;
        const ax = q[i * 2], az = q[i * 2 + 1];
        const dx = q[j * 2] - ax, dz = q[j * 2 + 1] - az, L = Math.hypot(dx, dz);
        if (L < 5) continue;
        if (Math.max(ax, ax + dx) < SX0 - 1 || Math.min(ax, ax + dx) > SX1 + 1 ||
            Math.max(az, az + dz) < SZ0 - 1 || Math.min(az, az + dz) > SZ1 + 1) continue;
        const ux = dx / L, uz = dz / L;
        // нормаль внутрь полигона: снаружи изгородь встала бы поперёк тротуара
        let hx = -uz, hz = ux;
        const mx = ax + dx * 0.5, mz = az + dz * 0.5;
        if (!pointIn(q, mx + hx * 1.4, mz + hz * 1.4)) { hx = -hx; hz = -hz; }
        const hh = 0.82 + hash2(mx, mz) * 0.3;
        // секции: k штук равной длины около 2 м
        const t0 = 0.9, span = L - 1.8, k = Math.max(1, Math.round(span / 2.0)), sl = span / k;
        // секции копим лентой и сбрасываем, только если в ленте их две и
        // больше: одинокий брусок посреди газона — это опять «кубик»
        let run = [];
        const flush = () => { if (run.length >= 2) for (const r of run) hedges.push(...r); run = []; };
        for (let s = 0; s < k; s++) {
          const ta = t0 + s * sl, tb = ta + sl, tm = (ta + tb) / 2;
          const x = ax + ux * tm + hx * 0.9, z = az + uz * tm + hz * 0.9;
          if (!inSq(x, z)) { flush(); continue; }
          // калитка в длинной ленте — раз в 24 м
          if (k > 8 && s % 12 === 6) { flush(); continue; }
          // у улицы или аллеи — да, посреди квартала у стены — нет
          let e = edge(x, z);
          if (e[0] > 12 && e[1] > 6) { flush(); continue; }
          // концы секции — не на асфальте, не на дорожке, не в стене
          let ok = !noPlant(x, z) && !buildings.find(x, z);
          for (const tt of [ta, tb]) {
            if (!ok) break;
            const px = ax + ux * tt + hx * 0.9, pz = az + uz * tt + hz * 0.9;
            e = edge(px, pz);
            if (e[0] < 0.7 || e[1] < 0.45 || e[2] < 1.5 || wall(px, pz, 0.6) < 0.6 || onRoad(px, pz)) ok = false;
          }
          if (!ok) { flush(); continue; }
          const ya = H(ax + ux * ta + hx * 0.9, az + uz * ta + hz * 0.9), yb = H(ax + ux * tb + hx * 0.9, az + uz * tb + hz * 0.9);
          // секцию наклоняем по склону вдоль ленты, чтобы не висела концом
          run.push([x, (ya + yb) / 2 - 0.06, z, sl / 2.0, hh, Math.atan2(-uz, ux),
            Math.atan2(yb - ya, sl), Math.atan2(ux, -uz), 0]);
        }
        flush();
      }
    }

    if (!dens) continue;
    // Деревья — по дрожащей сетке с шагом под плотность: у каждой ячейки
    // одна попытка, место и жребий — от координат. Так соседние квадраты
    // засаживают общий парк одинаково, каждый — свою часть, без стыка и без
    // двойных деревьев. Большие массивы прореживаем, как и раньше: не больше
    // 1400 деревьев на полигон.
    const want = area / dens;
    const thin = want > 1400 ? 1400 / want : 1;
    // ячейка вдвое мельче, жребий — один к двум: ровная сетка в роще читалась
    // строем, а так стволы стоят то кучнее, то реже
    const cell = Math.sqrt(dens / 2);
    const gset = SET_GREEN[g.kind];
    // в парке стволы белят у аллей, в лесу и на склонах — нет
    const ww = g.kind === 'park' ? 0.5 : g.kind === 'grass' ? 0.4 : 0;
    const gi0 = Math.floor(Math.max(x0, SX0) / cell), gi1 = Math.floor(Math.min(x1, SX1 - 1e-6) / cell);
    const gj0 = Math.floor(Math.max(z0, SZ0) / cell), gj1 = Math.floor(Math.min(z1, SZ1 - 1e-6) / cell);
    const bcell = cell * Math.SQRT2;            // кустов вдвое меньше деревьев
    for (let gi = gi0; gi <= gi1; gi++)
      for (let gj = gj0; gj <= gj1; gj++) {
        if (hash2(gi * 3.7 + 1, gj * 5.3 + 2) > thin * 0.5) continue;
        const x = (gi + hash2(gi * 1.31, gj * 7.7)) * cell;
        const z = (gj + hash2(gj * 2.17, gi * 3.9)) * cell;
        if (!inSq(x, z) || hasMeasured(x, z) || H(x, z) < 1.4 || !pointIn(q, x, z)) continue;
        const e = edge(x, z);
        if (e[0] < 2.5 || e[1] < 0.8 || e[2] < 2.5 || onRoad(x, z) || !free(x, z)) continue;
        // В роще деревья одной породы стоят куртинами, а не вперемешку: породу
        // задаёт крупная ячейка 90 м, внутри неё лес однородный.
        const cellSeed = hash2(Math.floor(x / 90) * 90, Math.floor(z / 90) * 90);
        const sp = hash2(x * 3.1, z * 3.1) < 0.18
          ? gset[Math.floor(hash2(z, x) * gset.length)]
          : gset[Math.floor(cellSeed * gset.length)];
        pushTree(sp, x, H(x, z) - 0.25, z, true, hash2(x * 7, z * 7) < ww && e[1] < 6 ? 1 : 0);
      }
    // подлесок: кустов вдвое меньше деревьев, но они закрывают стык кроны с землёй
    const bi0 = Math.floor(Math.max(x0, SX0) / bcell), bi1 = Math.floor(Math.min(x1, SX1 - 1e-6) / bcell);
    const bj0 = Math.floor(Math.max(z0, SZ0) / bcell), bj1 = Math.floor(Math.min(z1, SZ1 - 1e-6) / bcell);
    for (let gi = bi0; gi <= bi1; gi++)
      for (let gj = bj0; gj <= bj1; gj++) {
        if (hash2(gi * 2.9 + 7, gj * 4.1 + 3) > thin * 0.5) continue;
        const x = (gi + hash2(gi * 5.1 + 3, gj * 1.9)) * bcell;
        const z = (gj + hash2(gj * 6.3 + 1, gi * 2.3)) * bcell;
        if (!inSq(x, z) || hasMeasured(x, z) || H(x, z) < 1.4 || !pointIn(q, x, z)) continue;
        const e = edge(x, z);
        if (e[0] < 1.8 || e[1] < 0.9 || e[2] < 2.0 || onRoad(x, z) || !free(x, z)) continue;
        const kind = g.kind === 'park' || g.kind === 'grass' ? bushKind(x, z, H(x, z), g.kind === 'park') : 'shrub';
        pushBush(kind, x, H(x, z) - 0.1, z);
      }
  }
  // Потолок кустов — на все виды вместе, пропорционально.
  for (const k of ['shrub', 'oleander', 'box']) {
    if (!sets[k]) continue;
    sets[k] = trim(sets[k], Math.round(CAP_BUSH * (k === 'shrub' ? 0.6 : 0.2)));
    bushes += sets[k].length / ST;
  }
  sets.hedge = trim(hedges, CAP_HEDGE);

  const counts = {};
  let nT = 0;
  for (const k in sets) counts[k] = sets[k].length / ST;
  for (const k of ['platan', 'chestnut', 'acacia', 'poplar', 'pine', 'olive', 'cypress', 'thuja', 'spruce']) nT += counts[k] || 0;
  plantFlora(group, sets);

  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(),
        sv = new THREE.Vector3(), pv = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  // Материал один на все фонари: у него общая программа шейдера.
  const MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
  // Один InstancedMesh на весь город никогда не отсекается по пирамиде видимости.
  // Раскладываем по квадратам 400 м — рисуется только то, что рядом; редкое
  // режем крупнее, чтобы не плодить вызовы отрисовки на трёх фонарях.
  const CHUNK = 400;
  const chunkFor = n => n >= 6000 ? CHUNK : n >= 2000 ? CHUNK * 1.5 : CHUNK * 2;
  // far — дальше этого (м от края куска) предмет не рисуется: main.js гасит
  // такие куски по расстоянию до камеры. Фонарь за полкилометра — доли
  // пикселя, а вызов отрисовки стоит как за целый. У деревьев, кустов и
  // изгородей свои дальности — в flora.js.
  const place = (geoFn, arr, far = 0) => {
    const n = arr.length / LST;
    if (!n) return 0;
    const cs = chunkFor(n);
    const buckets = new Map();
    for (let i = 0; i < n; i++) {
      const k = Math.floor(arr[i * LST] / cs) + ',' + Math.floor(arr[i * LST + 2] / cs);
      let b = buckets.get(k); if (!b) buckets.set(k, b = []);
      b.push(i);
    }
    const geo = geoFn();
    for (const idxs of buckets.values()) {
      const mesh = new THREE.InstancedMesh(geo, MAT, idxs.length);
      if (far) mesh.userData.far = far;
      idxs.forEach((i, k) => {
        const o = i * LST;
        pv.set(arr[o], arr[o + 1], arr[o + 2]);
        sv.set(arr[o + 3], arr[o + 4], arr[o + 3]);
        q4.setFromAxisAngle(up, arr[o + 5]);
        mesh.setMatrixAt(k, m4.compose(pv, q4, sv));
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
    return n;
  };
  let nL = 0;
  for (const k in LAMP_GEO) nL += place(LAMP_GEO[k], lampBins[k], 400);

  group.userData.counts = { деревья: nT, 'из них обмеренных': measured, 'снято с асфальта': onAsphalt,
                            'не сели у дороги': rejected, кусты: bushes, изгороди: counts.hedge || 0, фонари: nL };
  group.userData.species = counts;
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
