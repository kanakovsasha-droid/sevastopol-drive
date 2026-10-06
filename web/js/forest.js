import { plantFlora, hash2, ST } from './flora.js?v=2628e755';

// Леса и посадки вне центра: большие контуры OSM natural=wood / landuse=forest
// (в мире — зелень вида wood) вдоль трассы на Ялту, на Сапун-горе, у Инкермана.
//
// Что было не так: props.js сажает зелень по плотности, но не больше 1400
// деревьев на ВЕСЬ контур. Для сквера это потолок сверху, а лес в 3 км² у
// Инкермана получал одно дерево на 2300 м² — редкие шарики на голом склоне,
// «лес» читался пустырём.
//
// Что здесь:
//  • лес сажается полной плотностью, но КУРТИНАМИ: плотность задаёт плавный
//    шум с шагом ~150 м — густые рощи, между ними редколесье и поляны. Ровная
//    россыпь по всему массиву читалась бы посадкой по линейке;
//  • порода — куртиной (ячейка 90 м), как и в props.js; по краям рощ —
//    подлесок из кустов;
//  • своя дальность подробности (flora.js, plantFlora с rng): ближняя модель
//    до 70 м, упрощённая до 280 м, дальше импостор в два треугольника. Лес
//    вдоль трассы — тысячи деревьев в кадре, и с городскими 150/600 м они
//    стоили бы полмиллиона треугольников;
//  • не на дорогах, дорожках, путях и не в домах — те же проверки, что у
//    props.js (кромка по осевым всей сети квадрата, растр покрытия, дома);
//  • потолок на квартал, прореживание равномерное по всему списку.
// Всё — функция места (hash2 от мировых координат): соседние квадраты
// засаживают общий массив одинаково, каждый свою часть, без шва.
//
// В центре таких контуров нет (ближайший — в 4.3 км от площади Нахимова),
// поэтому городские кварталы этот модуль не трогает вовсе.

export const FOREST_AREA = 1400 * 105;   // м²: с этого размера props.js прореживал лес
const DENS = 115;                        // м² на дерево в среднем по массиву
const CELL = Math.sqrt(DENS / 2);        // ячейка вдвое мельче, жребий — по плотности
const BCELL = CELL * 2.2;                // подлесок
const CAP_TREE = 9000, CAP_BUSH = 1200;  // потолок на квартал
const RNG = [70, 280];                   // ближний и средний план, м
// Те же породы, что у props.js для wood: в OSM у лесов вида почти нет
// (leaf_type у 5 контуров из 50), выдумывать дуб и граб не будем.
const SET = ['pine', 'pine', 'acacia', 'chestnut'];
const SPECIES = [...new Set(SET)];

export const isForest = (g, area) => g.kind === 'wood' && area >= FOREST_AREA;

// Плавный шум по решётке шагом S: билинейно между хешами узлов.
function vnoise(x, z, S, seed) {
  const fx = x / S, fz = z / S, i = Math.floor(fx), j = Math.floor(fz);
  let u = fx - i, v = fz - j;
  u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
  const h = (a, b) => hash2(a * 1.618 + seed, b * 2.414 - seed);
  return (h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - v) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * v;
}
// Густота леса в точке, 0…1: роща — около 1, поляна — 0.
export function forestDensity(x, z) {
  const n = vnoise(x, z, 150, 3.1) * 0.65 + vnoise(x, z, 55, 7.7) * 0.35;
  const t = Math.min(1, Math.max(0, (n - 0.30) / 0.36));
  return t * t * (3 - 2 * t);
}

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

// Сажалка на квартал. t — проверки места из props.js:
// { SX0, SZ0, SX1, SZ1, inSq, H, pointIn, edge, onRoad, free, hasMeasured }.
export function forestPlanter(t) {
  const sets = {};
  const put = (k, ...v) => (sets[k] || (sets[k] = [])).push(...v);
  let trees = 0, bushes = 0;
  const ok = (q, x, z, er, ep) => {
    if (!t.inSq(x, z) || t.hasMeasured(x, z) || t.H(x, z) < 1.4 || !t.pointIn(q, x, z)) return false;
    const e = t.edge(x, z);
    return e[0] >= er && e[1] >= ep && e[2] >= er && !t.onRoad(x, z) && t.free(x, z);
  };
  return {
    // контур q с габаритами x0…x1, z0…z1
    add(q, x0, z0, x1, z1) {
      const gi0 = Math.floor(Math.max(x0, t.SX0) / CELL), gi1 = Math.floor(Math.min(x1, t.SX1 - 1e-6) / CELL);
      const gj0 = Math.floor(Math.max(z0, t.SZ0) / CELL), gj1 = Math.floor(Math.min(z1, t.SZ1 - 1e-6) / CELL);
      for (let gi = gi0; gi <= gi1; gi++)
        for (let gj = gj0; gj <= gj1; gj++) {
          const x = (gi + hash2(gi * 1.31 + 11, gj * 7.7)) * CELL;
          const z = (gj + hash2(gj * 2.17 + 5, gi * 3.9)) * CELL;
          // жребий по густоте: в роще почти каждая ячейка, на поляне — ни одной;
          // редкие одиночки на поляне оставляем (8 %), лес не обрывается стеной
          const d = forestDensity(x, z);
          if (hash2(gi * 3.7 + 9, gj * 5.3 + 4) > 0.08 + d * 0.84) continue;
          if (!ok(q, x, z, 3.0, 1.2)) continue;
          const cellSeed = hash2(Math.floor(x / 90) * 90 + 0.5, Math.floor(z / 90) * 90 + 0.5);
          const sp = hash2(x * 3.1, z * 3.1) < 0.15
            ? SET[Math.floor(hash2(z, x) * SET.length)]
            : SET[Math.floor(cellSeed * SET.length)];
          // в густой роще деревья тянутся вверх и уже, на опушке — раскидистые
          const w = (0.66 + hash2(x * 1.7, z * 1.7) * 0.55) * (1.08 - d * 0.18);
          const h = w * (0.9 + hash2(z * 2.3, x * 2.3) * 0.32) * (0.95 + d * 0.2);
          put(sp, x, t.H(x, z) - 0.25, z, w, h,
            hash2(x, z) * 6.283,
            (hash2(x * 0.9, z * 0.9) - 0.5) * 0.09,
            hash2(z * 0.6, x * 0.6) * 6.283, 0);
          trees++;
        }
      // подлесок — на опушках рощ (густота 0.2…0.7), в глубине рощи и на
      // поляне его не видно или нет
      const bi0 = Math.floor(Math.max(x0, t.SX0) / BCELL), bi1 = Math.floor(Math.min(x1, t.SX1 - 1e-6) / BCELL);
      const bj0 = Math.floor(Math.max(z0, t.SZ0) / BCELL), bj1 = Math.floor(Math.min(z1, t.SZ1 - 1e-6) / BCELL);
      for (let gi = bi0; gi <= bi1; gi++)
        for (let gj = bj0; gj <= bj1; gj++) {
          const x = (gi + hash2(gi * 5.1 + 3, gj * 1.9 + 8)) * BCELL;
          const z = (gj + hash2(gj * 6.3 + 1, gi * 2.3 + 6)) * BCELL;
          const d = forestDensity(x, z);
          if (d < 0.2 || d > 0.7 || hash2(gi * 2.9 + 7, gj * 4.1 + 13) > 0.6) continue;
          if (!ok(q, x, z, 2.0, 0.9)) continue;
          put('shrub', x, t.H(x, z) - 0.1, z, 0.7 + hash2(x * 3.3, z * 3.3) * 0.8, 0.6 + hash2(z * 3.3, x * 3.3) * 0.6,
            hash2(x * 4.1, z * 4.1) * 6.283, 0, 0, 0);
          bushes++;
        }
    },
    // Посадить накопленное в группу квартала. Возвращает счёт для G.counts.
    plant(group) {
      if (!trees && !bushes) return null;
      let n = 0;
      for (const k in sets) n += sets[k].length / ST;
      // потолок: деревья — на все породы вместе, пропорционально
      const tn = n - bushes;
      if (tn > CAP_TREE) for (const k of SPECIES) if (sets[k]) sets[k] = trim(sets[k], Math.round(CAP_TREE * sets[k].length / ST / tn));
      if (sets.shrub) sets.shrub = trim(sets.shrub, CAP_BUSH);
      plantFlora(group, sets, RNG);
      const c = { forest: 0, 'forest-bush': sets.shrub ? sets.shrub.length / ST : 0 };
      for (const k of SPECIES) if (sets[k]) c.forest += sets[k].length / ST;
      return c;
    },
  };
}
