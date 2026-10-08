import * as THREE from 'three';
import { SEA_FLOOR } from './terrain.js?v=2628e755';
import { buildingMaterial, roadMaterial, terrainMaterial, waterMaterial, areaMaterial } from './materials.js?v=2628e755';
import { buildCoverage } from './coverage.js?v=2628e755';
import { roadFieldGen, traceContours, simplifyChain, KERB_ISO } from './roadfield.js?v=2628e755';
import { ROAD_LEVELS, levelWeight, levelAt, junctionPlaneAt, hasLevels, yardRoadsIn, isBridge, bridgeLevelAt, centerWeight } from './roadlevels.js?v=2628e755';
import { openGround, platformsGen, applySiteCuts, modelLevels, terracesGen } from './platforms.js?v=2628e755';
import { resolveAreas, sportSkipIds } from './sport.js?v=2628e755';
import { planParking, roadSegIndex } from './parking.js?v=2628e755';
import { seriesOf, seriesWall, seriesExtras } from './series.js?v=2628e755';
import { gateOf, gateCut, gateWall, gateLining } from './passage.js?v=2628e755';
import { castleExtras } from './castle.js?v=2628e755';
import { wallColor, roofColor } from './palette.js?v=2628e755';
import { pathDupIndex, densePath } from './pathdup.js?v=2628e755';
import { applyFieldFlats, fieldLevel } from './fields.js?v=2628e755';

// Three трактует Uint8-вершинные цвета как ЛИНЕЙНЫЕ, а палитра подобрана в sRGB.
// Без перевода город выцветает в молоко.
const s2l = v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
const enc = v => Math.round(255 * s2l(Math.max(0, Math.min(1, v))));
const rng = seed => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

function polyArea(p) {
  let a = 0;
  for (let i = 0, n = p.length / 2; i < n; i++) {
    const j = (i + 1) % n;
    a += p[i * 2] * p[j * 2 + 1] - p[j * 2] * p[i * 2 + 1];
  }
  return Math.abs(a / 2);
}
function bbox(p) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < p.length; i += 2) {
    if (p[i] < x0) x0 = p[i]; if (p[i] > x1) x1 = p[i];
    if (p[i + 1] < z0) z0 = p[i + 1]; if (p[i + 1] > z1) z1 = p[i + 1];
  }
  return [x0, z0, x1, z1];
}
export function pointInPoly(px, pz, p) {
  let inside = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], zi = p[i + 1], xj = p[j], zj = p[j + 1];
    if ((zi > pz) !== (zj > pz) && px < (xj - xi) * (pz - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export class PolyGrid {
  constructor(items, cell = 120) {
    this.cell = cell; this.map = new Map(); this.items = items;
    items.forEach((it, idx) => {
      const b = bbox(it.poly); it._bb = b;
      for (let cx = Math.floor(b[0] / cell); cx <= Math.floor(b[2] / cell); cx++)
        for (let cz = Math.floor(b[1] / cell); cz <= Math.floor(b[3] / cell); cz++) {
          const k = cx * 100003 + cz;
          let a = this.map.get(k); if (!a) this.map.set(k, a = []);
          a.push(idx);
        }
    });
  }
  find(x, z) {
    const c = this.map.get(Math.floor(x / this.cell) * 100003 + Math.floor(z / this.cell));
    if (!c) return null;
    for (const i of c) {
      const it = this.items[i], b = it._bb;
      if (x < b[0] || x > b[2] || z < b[1] || z > b[3]) continue;
      if (!pointInPoly(x, z, it.poly)) continue;
      if (it.holes?.some(h => pointInPoly(x, z, h))) continue;
      return it;
    }
    return null;
  }
}

// ---------------------------------------------------------------- палитра
// Стены и кровли жилых домов красит palette.js (по типу дома и району).
// рынок: белёные ролеты и профнастил, тенты цветные
const MARKET_WALLS = [[0.878, 0.871, 0.855], [0.827, 0.831, 0.827], [0.906, 0.894, 0.867], [0.784, 0.796, 0.796]];
const MARKET_ROOF = [0.812, 0.831, 0.843];
const hexRGB = h => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
// гаражный кооператив: побелка и блоки по стенам, крашеная жесть на воротах
const GAR_WALL = [[0.792, 0.776, 0.729], [0.729, 0.714, 0.678], [0.851, 0.835, 0.788],
                  [0.686, 0.678, 0.655], [0.812, 0.769, 0.686], [0.749, 0.741, 0.722]];
const GAR_DOOR = [[0.325, 0.376, 0.427], [0.286, 0.361, 0.310], [0.451, 0.318, 0.259],
                  [0.404, 0.408, 0.396], [0.263, 0.310, 0.396], [0.514, 0.427, 0.290],
                  [0.573, 0.529, 0.427], [0.353, 0.333, 0.310]];
const GAR_ROOF = [[0.435, 0.443, 0.435], [0.388, 0.373, 0.353], [0.478, 0.470, 0.443],
                  [0.361, 0.388, 0.392], [0.502, 0.427, 0.353]];
const AWNINGS = [[0.729, 0.180, 0.161], [0.847, 0.639, 0.180], [0.243, 0.365, 0.561], [0.216, 0.396, 0.267]];
const ROAD_COLORS = [
  // Все проезжие классы — ОДИН асфальт. Разные оттенки делали видимым каждое
  // наложение полотен на перекрёстке: в жизни асфальт там один и тот же.
  [0.267, 0.263, 0.267], [0.267, 0.263, 0.267], [0.267, 0.263, 0.267],
  [0.267, 0.263, 0.267], [0.616, 0.561, 0.494],
  [0.729, 0.710, 0.675],   // 5 — тротуар
  [0.784, 0.769, 0.741],   // 6 — бордюрный камень
];
// Двор и отсыпка между домами. Светлее асфальта — иначе улица сливается с фоном
// и дорога перестаёт читаться как дорога.
const URBAN = [0.478, 0.459, 0.427];

// ---------------------------------------------------------------- маска города
// Земля в городе не трава. Растеризуем дороги и пятна домов в маску,
// размываем и по ней смешиваем травяной цвет с асфальтово-серым.
// Растр считается на окно ОДНОГО квадрата земли, поэтому размытие раздельное
// (сначала по строкам, потом по столбцам): результат тот же, что у прежнего
// прохода 5×5, а работы вместо двадцати пяти отсчётов на клетку — десять.
function* urbanMaskGen(world, x0, z0, x1, z1, res = 4) {
  const W = Math.ceil((x1 - x0) / res), H = Math.ceil((z1 - z0) / res);
  const m = new Uint8Array(W * H);
  const disc = (x, z, r) => {
    const cx = (x - x0) / res, cz = (z - z0) / res, cr = r / res;
    const i0 = Math.max(0, Math.floor(cx - cr)), i1 = Math.min(W - 1, Math.ceil(cx + cr));
    const j0 = Math.max(0, Math.floor(cz - cr)), j1 = Math.min(H - 1, Math.ceil(cz + cr));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++)
        if ((i - cx) ** 2 + (j - cz) ** 2 <= cr * cr) m[j * W + i] = 255;
  };
  let work = 0;
  for (const r of world.roads) {
    const rad = r.w / 2 + (r.c <= 3 ? 6 : 2.5);
    const p = r.pts;
    for (let i = 0; i < p.length / 2 - 1; i++) {
      const ax = p[i * 2], az = p[i * 2 + 1], bx = p[i * 2 + 2], bz = p[i * 2 + 3];
      const len = Math.hypot(bx - ax, bz - az);
      const steps = Math.max(1, Math.ceil(len / (res * 0.7)));
      for (let s = 0; s <= steps; s++) disc(ax + (bx - ax) * s / steps, az + (bz - az) * s / steps, rad);
      work += steps;
    }
    if (work > 600) { work = 0; yield; }
  }
  for (const b of world.buildings) {
    const bb = bbox(b.poly);
    const i0 = Math.max(0, Math.floor((bb[0] - x0 - 4) / res)), i1 = Math.min(W - 1, Math.ceil((bb[2] - x0 + 4) / res));
    const j0 = Math.max(0, Math.floor((bb[1] - z0 - 4) / res)), j1 = Math.min(H - 1, Math.ceil((bb[3] - z0 + 4) / res));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) m[j * W + i] = 255;
    if (++work > 400) { work = 0; yield; }
  }
  if (!world.roads.length && !world.buildings.length) return { m, W, H, x0, z0, res };
  // два прохода размытия — чтобы город переходил в склоны, а не обрывался
  let a = m, b = new Uint8Array(W * H);
  // Считаем бегущей суммой: окно 5×5 — это среднее по прямоугольнику, и
  // пересчитывать его целиком на каждую клетку незачем.
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 0; j < H; j++) {
      const row = j * W;
      let s = 0, cnt = 0;
      for (let i = 0; i < Math.min(3, W); i++) { s += a[row + i]; cnt++; }
      for (let i = 0; i < W; i++) {
        b[row + i] = s / cnt;
        const add = i + 3, del = i - 2;
        if (add < W) { s += a[row + add]; cnt++; }
        if (del >= 0) { s -= a[row + del]; cnt--; }
      }
    }
    yield;
    for (let i = 0; i < W; i++) {
      let s = 0, cnt = 0;
      for (let j = 0; j < Math.min(3, H); j++) { s += b[j * W + i]; cnt++; }
      for (let j = 0; j < H; j++) {
        a[j * W + i] = s / cnt;
        const add = j + 3, del = j - 2;
        if (add < H) { s += b[add * W + i]; cnt++; }
        if (del >= 0) { s -= b[del * W + i]; cnt--; }
      }
    }
    yield;
  }
  return { m: a, W, H, x0, z0, res };
}
function sampleMask(mk, x, z) {
  const i = Math.round((x - mk.x0) / mk.res), j = Math.round((z - mk.z0) / mk.res);
  if (i < 0 || j < 0 || i >= mk.W || j >= mk.H) return 0;
  return mk.m[j * mk.W + i] / 255;
}

// Осевые линии в OSM обрываются на перекрёстке, и между полотнами остаётся
// дыра, сквозь которую светит рельеф. Вытягиваем концы на полширины — соседние
// дороги перекрываются и стык закрывается.
function extendEnds(pts, d) {
  const p = Array.from(pts), n = p.length / 2;
  if (n < 2) return p;
  let dx = p[2] - p[0], dz = p[3] - p[1], l = Math.hypot(dx, dz) || 1;
  p[0] -= dx / l * d; p[1] -= dz / l * d;
  dx = p[(n - 1) * 2] - p[(n - 2) * 2]; dz = p[(n - 1) * 2 + 1] - p[(n - 2) * 2 + 1];
  l = Math.hypot(dx, dz) || 1;
  p[(n - 1) * 2] += dx / l * d; p[(n - 1) * 2 + 1] += dz / l * d;
  return p;
}

// ------------------------------------------------------- дома вон из рельефа
// SRTM и Copernicus меряют ВЕРХ поверхности, а не землю: крыши и кроны входят
// в «рельеф». Поэтому в городе появляются холмы ровно там, где стоят кварталы,
// и площадь с перепадом в 17 метров. Вырезаем пятна застройки и заращиваем
// дыры от окружающей земли — это стандартный переход от модели поверхности
// к модели рельефа.
function* removeBuildingsGen(heights, nx, x0, z0, dx, dz, buildings) {
  const N = nx * nx;
  const mask = new Uint8Array(N);
  const grid = new PolyGrid(buildings, 90);
  let masked = 0;
  for (let j = 0; j < nx; j++) {
    const z = z0 + j * dz;
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * dx;
      if (grid.find(x, z)) { mask[j * nx + i] = 1; masked++; }
    }
  }
  if (!masked) return 0;

  // расширяем маску на одну ячейку: край крыши тоже завышен
  const wide = Uint8Array.from(mask);
  for (let j = 1; j < nx - 1; j++)
    for (let i = 1; i < nx - 1; i++)
      if (!mask[j * nx + i] &&
          (mask[(j - 1) * nx + i] || mask[(j + 1) * nx + i] ||
           mask[j * nx + i - 1] || mask[j * nx + i + 1])) wide[j * nx + i] = 1;

  yield;
  // затравка: наращиваем известные значения внутрь пятна
  const known = Uint8Array.from(wide, v => v ? 0 : 1);
  for (let pass = 0; pass < 24; pass++) {
    let changed = 0;
    for (let j = 1; j < nx - 1; j++)
      for (let i = 1; i < nx - 1; i++) {
        const k = j * nx + i;
        if (known[k]) continue;
        let s = 0, c = 0;
        for (const o of [-1, 1, -nx, nx]) if (known[k + o]) { s += heights[k + o]; c++; }
        if (c) { heights[k] = s / c; known[k] = 2; changed++; }
      }
    for (let k = 0; k < N; k++) if (known[k] === 2) known[k] = 1;
    if (!changed) break;
    if ((pass & 7) === 7) yield;
  }
  yield;

  // релаксация: поверхность внутри пятна становится гладким продолжением земли
  const tmp = new Float32Array(heights);
  for (let pass = 0; pass < 60; pass++) {
    for (let j = 1; j < nx - 1; j++)
      for (let i = 1; i < nx - 1; i++) {
        const k = j * nx + i;
        if (!wide[k]) continue;
        tmp[k] = (heights[k - 1] + heights[k + 1] + heights[k - nx] + heights[k + nx]) * 0.25;
      }
    for (let k = 0; k < N; k++) if (wide[k]) heights[k] = tmp[k];
    if ((pass & 7) === 7) yield;
  }
  return masked;
}

// ---------------------------------------------------------------- коридор дорог
// Полотно, посаженное прямо на DEM, повторяет каждую кочку — ехать по такому
// нельзя, и выглядит как стиральная доска. Считаем сглаженный профиль вдоль
// осевой и ВДАВЛИВАЕМ под него рельеф: дорога ложится ровно, грунт подходит к ней плавно.
//
// Земля режется на квадраты 1024 м, и коридор считается СВОЙ на каждый — то
// есть улица, идущая через шов, считается дважды, у обоих соседей. Профиль
// обязан выйти одинаковым до сантиметра, иначе полотно встанет на шве
// ступенькой. Отсюда три правила:
//   * профиль считается по ВСЕЙ осевой целиком, а не по куску внутри квадрата;
//   * считается по СЫРЫМ высотам (terrain.heightAt), а не по нарисованной
//     сетке — сетка у каждого квадрата своя, и профиль поехал бы за ней;
//   * в расчёт берутся не только улицы окна, но и все, что сходятся с ними в
//     общих узлах: сведение концов в узле обязано видеть одну и ту же компанию
//     у обоих соседей (иначе поправка узла разойдётся на метр).
// Готовый профиль кладём в кэш по id дороги — второй сосед берёт тот же самый.

const STEP = 4;                 // шаг ресемплинга осевой, м
const PROFILES = globalThis.__PROF = new Map();

// Профиль одной улицы: равномерный ресемплинг + сглаживание с возвратом к земле.
// full — все отсчёты попали в загруженные ДЕТАЛЬНЫЕ высоты. Пока это не так,
// профиль считается временным и пересчитывается: на трассе разница между
// грубой и детальной сеткой доходит до восемнадцати метров, и замороженный
// «грубый» профиль навсегда закопал бы полотно в склон.
function roadProfile(terrain, r) {
  const id = r.id;
  if (id !== undefined) {
    const got = PROFILES.get(id);
    if (got !== undefined && (got === null || got.full)) return got;
  }
  // концы вытягиваем так же, как при построении полотна, иначе за перекрёстком
  // дорога сходит с коридора и падает на сырой рельеф
  const p = extendEnds(r.pts, Math.min(r.w / 2, 5));
  // равномерный ресемплинг: узлы OSM стоят как попало
  const sx = [], sz = [];
  let carry = 0;
  for (let i = 0; i < p.length / 2 - 1; i++) {
    const ax = p[i * 2], az = p[i * 2 + 1];
    const dx = p[i * 2 + 2] - ax, dz = p[i * 2 + 3] - az;
    const len = Math.hypot(dx, dz);
    if (len < 1e-3) continue;
    for (let t = carry; t < len; t += STEP) { sx.push(ax + dx * t / len); sz.push(az + dz * t / len); }
    carry = Math.max(0, carry + Math.ceil((len - carry) / STEP) * STEP - len);
  }
  sx.push(p[p.length - 2]); sz.push(p[p.length - 1]);
  const n = sx.length;
  if (n < 2) { if (id !== undefined) PROFILES.set(id, null); return null; }

  const h = new Float32Array(n);
  let full = true;
  for (let i = 0; i < n; i++) {
    h[i] = terrain.heightAt(sx[i], sz[i]);
    if (full && terrain.hasDetail && !terrain.hasDetail(sx[i], sz[i])) full = false;
  }
  // ОТКУДА БРАЛИСЬ «БУГРЫ». Высоты — модель поверхности (SRTM/Copernicus):
  // крыши и кроны в неё входят, и вдоль улицы между домами профиль ходил
  // волной в метр-два. Прежний фильтр сглаживал на ~12 м и затем мягко
  // возвращал профиль к СЫРОЙ земле — вместе с её буграми: на Большой
  // Морской уклон гулял от −13% до +6% на десятках метров при том, что в
  // жизни там ровный подъём.
  //
  // Теперь по шагам:
  //   1. «Открытие» (минимум, затем максимум по ±12 м): срезает положительные
  //      выбросы уже 24 м — дом или дерево, попавшие в отсчёт, — и не трогает
  //      настоящий рельеф, который шире.
  //   2. Опора для возврата к земле — то же открытие, слегка сглаженное:
  //      если возвращать к ступенчатой опоре, ступени вернутся в профиль.
  //   3. Сглаживание на ~±35 м (σ ≈ 14 м), ограничение уклона, мягкий
  //      возврат к опоре в пределах выемки 2 м и насыпи 1.3 м — и в конце
  //      ещё сглаживание, а не обрезка: изломы больше не возвращаются.
  const raw = Float32Array.from(h);
  const tmp = new Float32Array(n);
  const R = 3;                                   // ±3 отсчёта = ±12 м
  for (let i = 0; i < n; i++) {
    let m = Infinity;
    for (let k = Math.max(0, i - R); k <= Math.min(n - 1, i + R); k++) if (raw[k] < m) m = raw[k];
    tmp[i] = m;
  }
  for (let i = 0; i < n; i++) {
    let m = -Infinity;
    for (let k = Math.max(0, i - R); k <= Math.min(n - 1, i + R); k++) if (tmp[k] > m) m = tmp[k];
    h[i] = m;
  }
  const smooth = (arr, passes) => {
    for (let pass = 0; pass < passes; pass++) {
      for (let i = 0; i < n; i++) {
        const a = arr[Math.max(0, i - 1)], b = arr[i], c = arr[Math.min(n - 1, i + 1)];
        tmp[i] = (a + 2 * b + c) / 4;
      }
      arr.set(tmp);
    }
  };
  const base = Float32Array.from(h);
  smooth(base, 6);                               // σ ≈ 7 м: опора без ступеней
  const MAX_CUT = 2.0, MAX_FILL = 1.3;
  const soft = () => {
    for (let i = 0; i < n; i++) {
      const d = h[i] - base[i];
      const lim = d < 0 ? MAX_CUT : MAX_FILL;
      h[i] = base[i] + lim * Math.tanh(d / lim);
    }
  };
  // Ограничение уклона. Замер показал участки в 25% — это стена, а не улица.
  // 18.5% оставляем: спуск по Очаковцеву и подобные в Севастополе реальны,
  // а четверть уклона берётся только из скачка в данных высот.
  const MAXG = 0.185;
  const limitGrade = () => {
    const lim = STEP * MAXG;
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 1; i < n; i++) {
        const d = h[i] - h[i - 1];
        if (d > lim) h[i] = h[i - 1] + lim; else if (d < -lim) h[i] = h[i - 1] - lim;
      }
      for (let i = n - 2; i >= 0; i--) {
        const d = h[i] - h[i + 1];
        if (d > lim) h[i] = h[i + 1] + lim; else if (d < -lim) h[i] = h[i + 1] - lim;
      }
    }
  };
  smooth(h, 24); soft(); limitGrade(); smooth(h, 12); soft(); limitGrade(); smooth(h, 6); soft(); smooth(h, 3);
  // Последняя проверка на кривизну: где профиль всё ещё ломается круче
  // 2 пунктов уклона на шаг, сглаживаем это место точечно.
  for (let pass = 0; pass < 8; pass++) {
    let worst = 0;
    for (let i = 1; i < n - 1; i++) {
      const c = h[i - 1] - 2 * h[i] + h[i + 1];   // вторая разность = перелом
      if (Math.abs(c) > 0.02 * STEP) {
        h[i] += c * 0.5;
        worst = Math.max(worst, Math.abs(c));
      }
    }
    if (worst < 0.02 * STEP) break;
  }
  // ДОРОГИ ПЕРВИЧНЫ (roadlevels.js): в центре профиль — отметки, посчитанные
  // по графу улиц, а снятый с рельефа остаётся только за краем квадрата.
  if (ROAD_LEVELS && id !== undefined && hasLevels(id)) {
    let any = false;
    for (let i = 0; i < n; i++) {
      const w = levelWeight(sx[i], sz[i]);
      if (w <= 0) continue;
      const lv = levelAt(id, r.pts, sx[i], sz[i]);
      if (lv === null) continue;
      h[i] = h[i] * (1 - w) + lv * w;
      if (w >= 1) any = true;
    }
    if (any && !full) {
      // целиком в квадрате — детальный рельеф профилю не нужен
      let all = true;
      for (let i = 0; i < n && all; i++) if (levelWeight(sx[i], sz[i]) < 1) all = false;
      if (all) full = true;
    }
  }
  // Ключ узла берём по ИСХОДНЫМ концам улицы из OSM, а не по растянутым:
  // extendEnds добавляет до пяти метров, и растянутые концы соседних улиц
  // между собой не совпадают — свести их не удавалось.
  const findNear = (px, pz) => {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < n; i++) {
      const d = (sx[i] - px) ** 2 + (sz[i] - pz) ** 2;
      if (d < bd) { bd = d; bi = i; }
    }
    return bi;
  };
  const pr = {
    sx, sz, h, n, full,
    iA: findNear(r.pts[0], r.pts[1]),
    iB: findNear(r.pts[r.pts.length - 2], r.pts[r.pts.length - 1]),
    ax: r.pts[0], az: r.pts[1],
    bx: r.pts[r.pts.length - 2], bz: r.pts[r.pts.length - 1],
  };
  if (id !== undefined) PROFILES.set(id, pr);
  return pr;
}

// Ключ узла: концы соседних улиц в OSM стоят не идеально в одной точке.
const nodeKey = (x, z) => Math.round(x / 3) + ',' + Math.round(z / 3);

// Растр коридора на окно одного квадрата земли. Генератор: сборка идёт по
// кусочкам, менеджер решает, когда остановиться до следующего кадра.
function* roadCorridorGen(world, terrain, ax0, az0, x1, z1, keep, res = 5) {
  // Растр обязан лежать на ОБЩЕЙ для всего мира решётке. Квадраты отстоят друг
  // от друга на 1024 м, а ячейка коридора — 5 м: 1024 на 5 не делится, и у
  // соседа сетка оказывалась сдвинутой на 0.8 ячейки. Выборка билинейная, но
  // вес коридора на кромке полотна меняется резко, и от сдвига высота на шве
  // расходилась на метры — 7% точек шва больше четверти метра.
  const x0 = Math.floor(ax0 / res) * res, z0 = Math.floor(az0 / res) * res;
  const W = Math.ceil((x1 - x0) / res) + 1, H = Math.ceil((z1 - z0) / res) + 1;
  let tgt = null, wgt = null, cap = null;
  // Плоская зона обязана быть шире ДИАГОНАЛИ ячейки рельефа (9.14·√2 ≈ 12.9 м):
  // высота в точке берётся из четырёх углов ячейки, и угол по диагонали,
  // не попавший в плоскую зону, поднимает поверхность над кромкой полотна.
  // Плюс потолок: рядом с дорогой рельеф не имеет права быть выше её больше,
  // чем на пологий откос — иначе на склоне он просто накрывает улицу.
  const FLAT = 13.0, FEATHER = 14.0, CAP_SLOPE = 0.55;

  lap('к:профили');
  const profiles = [];
  let work = 0, any = false;
  for (const r of world.roads) {
    // Мосты на грунт не сажаем. Тоннели тоже — кроме тоннелей магистралей
    // (Меласский на трассе, галерея): без коридора трасса шла поверх горы
    // по сырому рельефу с уклоном 25%. Теперь там выемка по отметкам графа.
    if (r.c > 3 || r.br || isBridge(r.id) || (r.tn && r.c > 1)) continue;
    const pr = roadProfile(terrain, r);
    if (!pr) continue;
    // Пересекает ли улица окно. Не пересекает — она в списке только ради
    // общего узла: её высота нужна, чтобы свести концы, а рисовать нечего.
    const p = r.pts;
    let ax = Infinity, az = Infinity, bx = -Infinity, bz = -Infinity;
    for (let i = 0; i < p.length; i += 2) {
      if (p[i] < ax) ax = p[i]; if (p[i] > bx) bx = p[i];
      if (p[i + 1] < az) az = p[i + 1]; if (p[i + 1] > bz) bz = p[i + 1];
    }
    const draw = bx > x0 - 40 && ax < x1 + 40 && bz > z0 - 40 && az < z1 + 40;
    if (draw) any = true;
    // копия профиля: сведение узлов правит её, а кэш обязан остаться сырым
    // lv — профиль целиком из отметок графа (roadlevels.js): они уже сведены
    // в узлах, на примыканиях и между проезжими частями, и поправки ниже,
    // писанные для профилей, снятых с рельефа, их только портили — на
    // развязке трассы коридор вставал на 2.7 м выше отметок (48376, 15200).
    // В квадрате центра — как было (centerWeight): поправки и там, где отметки.
    let inC = false;
    for (let i = 0; i < pr.n && !inC; i += 4) if (centerWeight(pr.sx[i], pr.sz[i]) >= 0.5) inC = true;
    profiles.push({ pr, draw, h: Float32Array.from(pr.h), w: r.w, c: r.c, rank: r.__rank || 0, lv: !inC && !!(ROAD_LEVELS && r.id !== undefined && hasLevels(r.id)) });
    if ((work += pr.n) > 2500) { work = 0; yield; }
  }

  if (!any) return null;      // за окном нет ни одной улицы — вдавливать нечего
  lap('к:узлы');
  tgt = new Float32Array(W * H); wgt = new Float32Array(W * H);
  cap = new Float32Array(W * H).fill(Infinity);
  const dmin = new Float32Array(W * H).fill(Infinity);
  const cown = new Int32Array(W * H).fill(-1);
  // Уровень ячейки: 2 — сама проезжая часть улицы (полуширина + 2 м),
  // 1 — её плоская зона, 0 — откос. Плоская зона тянется на 13 м за
  // кромку, и у двух соседних улиц на разной высоте плато одной накрывало
  // проезжую часть другой: ячейку отдавали тому, кто нарисован первым, и
  // вторая улица наследовала чужую высоту — перекос поперёк до 16%
  // (Троллейбусный спуск у 240, 1220). Своя проезжая часть важнее чужого плато.
  const lvl = new Uint8Array(W * H);

  // ---- СТЫКИ. Профиль каждой улицы сглаживался сам по себе, и в общем узле
  // они расходились: на спуске Котовского это давало перелом в 13 пунктов на
  // пятиметровый шаг — машину подбрасывало ровно на переходе с улицы на улицу.
  // Сводим концы к ОДНОЙ отметке: считаем среднее по всем улицам узла и
  // растягиваем поправку вдоль улицы, чтобы середина не дёрнулась.
  {
    const node = new Map();
    for (const q of profiles) {
      const pr = q.pr;
      for (const [x, z, hh] of [[pr.ax, pr.az, pr.h[pr.iA]], [pr.bx, pr.bz, pr.h[pr.iB]]]) {
        const k = nodeKey(x, z);
        const e = node.get(k) || node.set(k, { s: 0, c: 0 }).get(k);
        e.s += hh; e.c++;
      }
    }
    for (const q of profiles) {
      if (q.lv) continue;
      const pr = q.pr;
      const a = node.get(nodeKey(pr.ax, pr.az));
      const b = node.get(nodeKey(pr.bx, pr.bz));
      const dA = a && a.c > 1 ? a.s / a.c - pr.h[pr.iA] : 0;
      const dB = b && b.c > 1 ? b.s / b.c - pr.h[pr.iB] : 0;
      if (Math.abs(dA) < 0.02 && Math.abs(dB) < 0.02) continue;
      // поправка не должна ломать саму улицу: больше метра не двигаем
      const cA = Math.max(-1, Math.min(1, dA)), cB = Math.max(-1, Math.min(1, dB));
      // Поправку гасим на 60 м от узла. Раньше она тянулась линейно через
      // всю улицу, и у длинной (проспект в пять километров) сдвиг одного
      // конца разводил по высоте её с соседней проезжей частью посередине.
      for (let i = 0; i < pr.n; i++) {
        const fa = Math.max(0, 1 - Math.abs(i - pr.iA) * STEP / 60), fb = Math.max(0, 1 - Math.abs(i - pr.iB) * STEP / 60);
        q.h[i] += cA * fa * fa * (3 - 2 * fa) + cB * fb * fb * (3 - 2 * fb);
      }
    }
  }
  // ---- ДВЕ ПРОЕЗЖИЕ ЧАСТИ ОДНОЙ УЛИЦЫ. Проспект с разделителем в OSM —
  // две осевые в десятке метров, и профиль каждой сглаживался сам по себе:
  // на ровном месте одна выходила на 0.8 м выше другой, и между ними полотно
  // вставало с перекосом 7–8% (проспект Острякова у −290, 5030). Параллельные
  // магистрали, стоящие ближе полусуммы ширин плюс шесть метров, сводим к
  // общей отметке — если расходятся не больше чем на два метра (больше
  // — это уже настоящий уступ с подпорной стенкой между полосами).
  {
    const CG = 10, sg = new Map();
    profiles.forEach((q, qi) => {
      if (q.c > 1 || q.w < 7) return;
      const { sx, sz, n } = q.pr;
      for (let i = 0; i < n; i++) {
        const k = Math.floor(sx[i] / CG) * 100003 + Math.floor(sz[i] / CG);
        let a = sg.get(k); if (!a) sg.set(k, a = []);
        a.push(qi, i);
      }
    });
    const dirAt = (pr, i) => {
      const a = Math.max(0, i - 1), b2 = Math.min(pr.n - 1, i + 1);
      const dx = pr.sx[b2] - pr.sx[a], dz = pr.sz[b2] - pr.sz[a], l = Math.hypot(dx, dz) || 1;
      return [dx / l, dz / l];
    };
    const adj = profiles.map(q => q.c <= 1 && q.w >= 7 && !q.lv ? new Float32Array(q.h.length) : null);
    profiles.forEach((q, qi) => {
      if (!adj[qi]) return;
      const { sx, sz, n } = q.pr;
      for (let i = 0; i < n; i++) {
        const [ux, uz] = dirAt(q.pr, i);
        let best = -1, bi = -1, bd = Infinity;
        for (let cx = Math.floor(sx[i] / CG) - 2; cx <= Math.floor(sx[i] / CG) + 2; cx++)
          for (let cz = Math.floor(sz[i] / CG) - 2; cz <= Math.floor(sz[i] / CG) + 2; cz++) {
            const a = sg.get(cx * 100003 + cz);
            if (!a) continue;
            for (let t = 0; t < a.length; t += 2) {
              if (a[t] === qi) continue;
              const o = profiles[a[t]], j = a[t + 1];
              const d = Math.hypot(o.pr.sx[j] - sx[i], o.pr.sz[j] - sz[i]);
              if (d > (q.w + o.w) / 2 + 6 || d >= bd) continue;
              const [vx, vz] = dirAt(o.pr, j);
              if (Math.abs(ux * vx + uz * vz) < 0.94) continue;      // не параллельна
              bd = d; best = a[t]; bi = j;
            }
          }
        if (best < 0) continue;
        const dh = profiles[best].h[bi] - q.h[i];
        if (Math.abs(dh) < 2) adj[qi][i] = dh / 2;
      }
    });
    // поправку сглаживаем вдоль улицы, чтобы на краю парного участка не было ступени
    profiles.forEach((q, qi) => {
      const a = adj[qi]; if (!a) return;
      const n = a.length, t = new Float32Array(n);
      for (let pass = 0; pass < 6; pass++) {
        for (let i = 0; i < n; i++) t[i] = (a[Math.max(0, i - 1)] + 2 * a[i] + a[Math.min(n - 1, i + 1)]) / 4;
        a.set(t);
      }
      for (let i = 0; i < n; i++) q.h[i] += a[i];
    });
  }

  // ---- ПРИМЫКАНИЯ. Улица, упирающаяся в более широкую, которая идёт
  // НАСКВОЗЬ, в общем узле её не находит (у той там не конец, а середина),
  // и подходила к ней на своей высоте. На перекрёстке высоту задаёт широкая
  // (см. растр ниже), и на стыке выходила ступенька, размазанная на десять
  // метров, — удар на скорости. Конец узкой улицы подводим к профилю
  // широкой в точке примыкания.
  {
    const CG = 8, sg = new Map();
    profiles.forEach((q, qi) => {
      const { sx, sz, n } = q.pr;
      for (let i = 0; i < n; i++) {
        const k = Math.floor(sx[i] / CG) * 100003 + Math.floor(sz[i] / CG);
        let a = sg.get(k); if (!a) sg.set(k, a = []);
        a.push(qi, i);
      }
    });
    const wideAt = (x, z, w0) => {
      let best = null, bd = Infinity;
      for (let cx = Math.floor(x / CG) - 1; cx <= Math.floor(x / CG) + 1; cx++)
        for (let cz = Math.floor(z / CG) - 1; cz <= Math.floor(z / CG) + 1; cz++) {
          const a = sg.get(cx * 100003 + cz);
          if (!a) continue;
          for (let t = 0; t < a.length; t += 2) {
            const o = profiles[a[t]];
            // Шире — главнее. Равная по ширине тоже главнее, если идёт через
            // узел насквозь (у неё тут середина, а не конец): на Т-образном
            // перекрёстке склона примыкающая улица подходила на своей
            // отметке, и между ними вставал обрыв в 40–50% (50, 4310).
            const j0 = a[t + 1];
            if (o.w <= w0 + 0.5 && !(o.w >= w0 - 0.01 && j0 > 3 && j0 < o.pr.n - 4)) continue;
            const d = (o.pr.sx[a[t + 1]] - x) ** 2 + (o.pr.sz[a[t + 1]] - z) ** 2;
            if (d < bd && d < (o.w / 2 + 1.5) ** 2) { bd = d; best = o.h[a[t + 1]]; }
          }
        }
      return best;
    };
    for (const q of profiles) {
      if (q.lv) continue;
      const pr = q.pr;
      const hA = wideAt(pr.ax, pr.az, q.w), hB = wideAt(pr.bx, pr.bz, q.w);
      const dA = hA === null ? 0 : Math.max(-2, Math.min(2, hA - q.h[pr.iA]));
      const dB = hB === null ? 0 : Math.max(-2, Math.min(2, hB - q.h[pr.iB]));
      if (Math.abs(dA) < 0.02 && Math.abs(dB) < 0.02) continue;
      // поправку гасим на 40 м от конца, а не тянем через всю улицу
      let accA = 0, accB = 0;
      const L = new Float32Array(pr.n);
      for (let i = 1; i < pr.n; i++) L[i] = L[i - 1] + Math.hypot(pr.sx[i] - pr.sx[i - 1], pr.sz[i] - pr.sz[i - 1]);
      for (let i = 0; i < pr.n; i++) {
        const fa = Math.max(0, 1 - Math.abs(L[i] - L[pr.iA]) / 40), fb = Math.max(0, 1 - Math.abs(L[i] - L[pr.iB]) / 40);
        const sa = fa * fa * (3 - 2 * fa), sb = fb * fb * (3 - 2 * fb);
        q.h[i] += dA * sa + dB * sb;
      }
    }
  }
  yield;

  lap('к:растр');
  // Широкая улица главнее: на перекрёстке высоту задаёт она, а узкая к ней
  // подходит. При равной ширине — постоянный номер из far.json (см. выше).
  profiles.sort((a, b) => b.w - a.w || a.rank - b.rank);
  for (let qi = 0; qi < profiles.length; qi++) {
    const q = profiles[qi];
    if (!q.draw) continue;
    const { sx, sz, n } = q.pr, h = q.h;
    const inner = q.w / 2 + FLAT, rad = inner + FEATHER;
    // Корень и hypot тут — самое дорогое место всей сборки квадрата: на плотном
    // квартале это под два миллиона отсчётов. Внутри плоской зоны расстояние
    // не нужно вовсе, снаружи считаем обычным sqrt по квадратам.
    // Ядро — проезжая часть плюс ячейка растра: выборка билинейная, и
    // соседняя ячейка чужого плато, попавшая в интерполяцию у самой кромки,
    // роняла край полотна на метры (Красный спуск над Троллейбусным, 175, 1540).
    const rad2 = rad * rad, inner2 = inner * inner, core2 = (q.w / 2 + 2 + res) ** 2;
    for (let i = 0; i < n; i++) {
      // Касательная и уклон в отсчёте: высоту ячейки продолжаем от него по
      // уклону, а не берём ступенькой.
      const ia = Math.max(0, i - 1), ib = Math.min(n - 1, i + 1);
      const tx = sx[ib] - sx[ia], tz = sz[ib] - sz[ia], tl = Math.hypot(tx, tz) || 1;
      // Последний отсчёт ресемплинга может стоять в сантиметре от
      // предпоследнего: уклон по такой базе — деление на ноль, и ячейки
      // проспекта Острякова получали отметку в 690 м. База не короче 1 м,
      // уклон не круче 30%.
      const ux = tx / tl, uz = tz / tl;
      const gr = tl < 1 ? 0 : Math.max(-0.3, Math.min(0.3, (h[ib] - h[ia]) / tl));
      // отсчёты, чей круг не задевает окно, пропускаем сразу: длинная улица
      // лежит в окне куском, а точек у неё тысячи
      if (sx[i] < x0 - rad || sx[i] > x1 + rad || sz[i] < z0 - rad || sz[i] > z1 + rad) continue;
      const cx = (sx[i] - x0) / res, cz = (sz[i] - z0) / res, cr = rad / res;
      const i0 = Math.max(0, Math.floor(cx - cr)), i1 = Math.min(W - 1, Math.ceil(cx + cr));
      const j0 = Math.max(0, Math.floor(cz - cr)), j1 = Math.min(H - 1, Math.ceil(cz + cr));
      for (let j = j0; j <= j1; j++)
        for (let k = i0; k <= i1; k++) {
          const ddx = (k - cx) * res, ddz = (j - cz) * res;
          const d2 = ddx * ddx + ddz * ddz;
          if (d2 > rad2) continue;
          const d = d2 <= inner2 ? 0 : Math.sqrt(d2);
          const w = d === 0 ? 1 : Math.max(0, 1 - (d - inner) / FEATHER);
          const idx = j * W + k;
          // Потолок ОБЯЗАН считаться по той же улице, что задала высоту ячейки.
          // Минимум по всем дорогам в радиусе продавливал грунт под нижней улицей,
          // и соседняя верхняя оставалась висеть в воздухе на несколько метров.
          // При равном весе (вся плоская зона — вес 1) побеждает БЛИЖАЙШИЙ
          // отсчёт той же улицы. Раньше побеждал первый по порядку, а он отстоял от ячейки
          // вдоль улицы на 15–17 м: на уклоне 6% это метр запаздывания, разный
          // у оси и у кромки, — полотно перекашивало поперёк, а на стыке двух
          // улиц высота прыгала в зависимости от того, кто нарисован первым.
          // При равном весе чужая (младшая) улица ячейку не перехватывает.
          const lv = d2 <= core2 ? 2 : w >= 1 ? 1 : 0;
          if (lv > lvl[idx] || (lv === lvl[idx] && (w > wgt[idx] || (w === wgt[idx] && cown[idx] === qi && d2 < dmin[idx])))) {
            wgt[idx] = w; dmin[idx] = d2; cown[idx] = qi; lvl[idx] = lv;
            const ht = h[i] + gr * Math.max(-STEP, Math.min(STEP, ddx * ux + ddz * uz));
            tgt[idx] = ht;
            cap[idx] = ht + Math.max(0, d - inner) * CAP_SLOPE;
          }
        }
    }
    if ((work += n) > 900) { work = 0; yield; }
  }

  // Перекрёстки центра — на своей плоскости (roadlevels.js): поверхность
  // узла, склеенная из плато разных улиц, плоскостью не была, и полотна
  // узла ложились хордами на разной высоте — ступеньки под колесом.
  if (ROAD_LEVELS) for (let j = 0; j < H; j++)
    for (let k = 0; k < W; k++) {
      const idx = j * W + k;
      if (wgt[idx] <= 0) continue;
      const x = x0 + k * res, z = z0 + j * res;
      const lw = levelWeight(x, z);
      if (lw <= 0) continue;
      const jp = junctionPlaneAt(x, z);
      if (!jp) continue;
      const w = jp.w * lw;
      tgt[idx] += (jp.h - tgt[idx]) * w;
      if (cap[idx] < tgt[idx]) cap[idx] = tgt[idx];
      if (w > 0.999) lvl[idx] = 2;
    }

  // Дальше работаем только по занятым ячейкам: в окне квадрата их около
  // десятой части, а проходов по полю шесть десятков.
  const cells = [];
  for (let i = 0; i < W * H; i++) if (wgt[i] > 0) cells.push(i);
  if (!cells.length) return { tgt, wgt, cap, core: lvl, W, H, x0, z0, res };
  yield;

  // Соседние улицы спорят за одни ячейки, и жёсткий выбор одной из них рвёт
  // поверхность обрывом на ровном месте — «рельеф, которого не бывает».
  // Размываем ЦЕЛЕВУЮ ВЫСОТУ с весом: внутри одной улицы значения одинаковые
  // и плоскость сохраняется, а на стыке двух высот получается плавный переход.
  lap('к:сглаживание');
  const sm = new Float32Array(W * H);
  // Старшинство улицы: полотно старшей улицы не размывается к плато младшей
  // (дворовый проезд на склоне рядом с трассой тянул её край на полметра),
  // и к полотну соседней улицы, лежащему выше или ниже на 3 м и больше.
  const rkq = profiles.map(q => q.c * 100 - q.w);
  // ячейки квадрата центра: там старшинства нет — как было (roads3)
  const cen = new Uint8Array(W * H);
  for (const idx of cells) cen[idx] = centerWeight(x0 + (idx % W) * res, z0 + ((idx / W) | 0) * res) >= 0.5 ? 1 : 0;
  for (let pass = 0; pass < 2; pass++) {
    sm.set(tgt);
    for (const idx of cells) {
      const i = idx % W, j = (idx / W) | 0;
      const own = cown[idx], core = lvl[idx] === 2 && own >= 0;
      let sh = 0, sw = 0;
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          const jj = j + dj, ii = i + di;
          if (jj < 0 || ii < 0 || jj >= H || ii >= W) continue;
          const k = jj * W + ii;
          if (wgt[k] <= 0) continue;
          if (core && !cen[idx] && cown[k] !== own && cown[k] >= 0 && (rkq[cown[k]] > rkq[own] + 1e-6 || Math.abs(tgt[k] - tgt[idx]) > 3)) continue;
          const bw = (di === 0 && dj === 0) ? 4 : (di === 0 || dj === 0) ? 2 : 1;
          sh += tgt[k] * wgt[k] * bw; sw += wgt[k] * bw;
        }
      sm[idx] = sw > 0 ? sh / sw : tgt[idx];
    }
    tgt.set(sm);
    yield;
  }
  // Ограничение уклона ПО ВСЕМУ ПОЛЮ, а не по профилю каждой улицы отдельно.
  // Соседняя крутая улочка занимает ячейку своей высотой, и профиль соседа
  // скачет на её значение: замер давал 69% уклона там, где его быть не может.
  // Разводим соседние ячейки навстречу друг другу, пока перепад не уложится
  // в 15% — реальные севастопольские спуски столько и имеют.
  lap('к:уклон');
  // Пары соседних занятых ячеек считаем ОДИН раз: проходов шесть десятков, и
  // на каждом заново выяснять, есть ли сосед, — это и есть самая дорогая часть
  // сборки квадрата. Порядок пар тот же, что был у обхода поля (строка за
  // строкой, сначала вправо, потом вниз), иначе результат разойдётся с прежним.
  const ea = [], eb = [];
  for (const a of cells) {
    const i = a % W, j = (a / W) | 0;
    if (i < W - 1 && wgt[a + 1] > 0) { ea.push(a); eb.push(a + 1); }
    if (j < H - 1 && wgt[a + W] > 0) { ea.push(a); eb.push(a + W); }
  }
  const EA = Int32Array.from(ea), EB = Int32Array.from(eb), EN = EA.length;
  const LIM = res * 0.185;
  // Двигаем пару НЕ поровну, а по весу: ячейка плато улицы (вес 1) почти
  // не уступает, уступает откос (вес у кромки к нулю). Поровну откос
  // соседней улицы, идущей по склону выше, за шестьдесят проходов втягивал
  // плато вверх: Стрелецкий спуск поднимался на два метра над своим
  // профилем и вставал поперёк с перекосом в 23%.
  // Плато (вес 1) двигаем только навстречу другому плато — это перекрёсток,
  // там улицы и правда сводятся. Против откоса плато не уступает вовсе: если
  // откоса не хватает, чтобы уложиться в уклон, между улицами остаётся
  // крутой склон (подпорная стенка), а не выпученная улица. Генерала Крейзера
  // в 30 м выше Стрелецкого спуска поднимала его плато на 2.4 метра.
  // Кто кому уступает. Старший уровень (проезжая часть > плато > откос)
  // не двигается вовсе — уступает младший; равные делят поровну, откосы — по
  // весу. Иначе даже малая подвижность плато за шестьдесят проходов копила
  // десятки метров: проспект Острякова поднимало на 33 м над землёй.
  const give = new Float32Array(EN);
  for (let e = 0; e < EN; e++) {
    const a = EA[e], b2 = EB[e], la = lvl[a], lb = lvl[b2];
    if (la !== lb) { give[e] = la > lb ? 0 : 1; continue; }
    // Плато и полотно разных улиц: уступает младшая (класс, потом ширина).
    // Поровну дворовый проезд на склоне в 14 м выше трассы за шестьдесят
    // проходов поднимал её полотно на 2.7 м (ЮБК у 48375, 15200).
    if (la > 0) {
      const oa = cown[a], ob = cown[b2];
      if (oa >= 0 && ob >= 0 && oa !== ob && !cen[a]) {
        // Два полотна разных улиц на разной высоте (проезжие части трассы на
        // склоне ЮБК в 8 м друг от друга и в 6 м по высоте) — между ними
        // подпорная стенка, а не общий уклон: сводить их — значит гнуть обе.
        // Порог 3 м: меньший перепад — это стык улиц в узле, его сводим.
        if (la === 2 && Math.abs(tgt[a] - tgt[b2]) > 3) { give[e] = -1; continue; }
        const A = profiles[oa], B = profiles[ob];
        const ra = A.c * 100 - A.w, rb = B.c * 100 - B.w;
        give[e] = ra < rb - 1e-6 ? 0 : rb < ra - 1e-6 ? 1 : 0.5;
      } else give[e] = 0.5;
      continue;
    }
    const fa = 1.05 - Math.min(1, wgt[a]), fb = 1.05 - Math.min(1, wgt[b2]);
    give[e] = fa / (fa + fb);
  }
  for (let pass = 0; pass < 60; pass++) {
    let fixed = 0;
    for (let e = 0; e < EN; e++) {
      if (give[e] < 0) continue;
      const a = EA[e], b2 = EB[e];
      const d = tgt[a] - tgt[b2];
      if (d > LIM) { const ex = d - LIM; tgt[a] -= ex * give[e]; tgt[b2] += ex * (1 - give[e]); fixed++; }
      else if (d < -LIM) { const ex = -d - LIM; tgt[a] += ex * give[e]; tgt[b2] -= ex * (1 - give[e]); fixed++; }
    }
    if (!fixed) break;
    if ((pass & 1) === 1) yield;
  }

  // потолок пересчитываем по сглаженной высоте, иначе он режет её же
  for (const i of cells) if (cap[i] < tgt[i]) cap[i] = tgt[i];

  // core — ячейки самой проезжей части: по ним земля потом подтягивается к
  // полотну (buildTerrainTile), что бы с ней ни делали площадки и срезы.
  for (let i = 0; i < W * H; i++) lvl[i] = lvl[i] === 2 ? 1 : 0;
  return crop({ tgt, wgt, cap, core: lvl, W, H, x0, z0, res }, keep);
}

// Считаем коридор с запасом за краем квадрата (иначе сглаживание и ограничение
// уклона у соседа сойдутся к другим значениям, и на шве будет ступенька), а
// ХРАНИМ только сам квадрат: по коридору потом ездит машина и садятся дороги,
// и полный растр с запасом — это лишний мегабайт на квадрат, полсотни на круг.
function crop(c, keep) {
  if (!keep) return c;
  const res = c.res;
  const i0 = Math.max(0, Math.floor((keep[0] - c.x0) / res) - 2);
  const j0 = Math.max(0, Math.floor((keep[1] - c.z0) / res) - 2);
  const i1 = Math.min(c.W - 1, Math.ceil((keep[2] - c.x0) / res) + 2);
  const j1 = Math.min(c.H - 1, Math.ceil((keep[3] - c.z0) / res) + 2);
  const W = i1 - i0 + 1, H = j1 - j0 + 1;
  if (W >= c.W && H >= c.H) return c;
  const out = {
    tgt: new Float32Array(W * H), wgt: new Float32Array(W * H),
    cap: new Float32Array(W * H), core: c.core ? new Uint8Array(W * H) : null, W, H, res,
    x0: c.x0 + i0 * res, z0: c.z0 + j0 * res,
  };
  for (let j = 0; j < H; j++) {
    const a = (j + j0) * c.W + i0, b = j * W;
    out.tgt.set(c.tgt.subarray(a, a + W), b);
    out.wgt.set(c.wgt.subarray(a, a + W), b);
    out.cap.set(c.cap.subarray(a, a + W), b);
    if (c.core) out.core.set(c.core.subarray(a, a + W), b);
  }
  return out;
}

// Билинейная выборка коридора. Выборка «по ближайшей ячейке» даёт ступеньки
// по 5 м, а рельеф интерполируется плавно — на уклоне дорога квантуется
// и половину длины оказывается ниже поверхности. Высоту усредняем с весом,
// иначе пустые ячейки (tgt = 0) утянут результат в ноль.
export function sampleCorridor(c, x, z) {
  if (!c) return null;
  const gx = (x - c.x0) / c.res, gz = (z - c.z0) / c.res;
  const i = Math.floor(gx), j = Math.floor(gz);
  if (i < 0 || j < 0 || i >= c.W - 1 || j >= c.H - 1) return null;
  const fx = gx - i, fz = gz - j;
  let sw = 0, sh = 0, wsum = 0, cap = Infinity, core = 0;
  for (let dj = 0; dj < 2; dj++)
    for (let di = 0; di < 2; di++) {
      const bw = (di ? fx : 1 - fx) * (dj ? fz : 1 - fz);
      const k = (j + dj) * c.W + (i + di);
      const w = c.wgt[k];
      sw += w * bw;
      if (w > 0) { sh += c.tgt[k] * w * bw; wsum += w * bw; }
      if (c.cap[k] < cap) cap = c.cap[k];
      if (c.core && c.core[k]) core += bw;
    }
  if (wsum <= 0) return { h: 0, w: 0, cap, core };
  return { h: sh / wsum, w: sw, cap, core };
}

// ------------------------------------------------------------------ море
// SRTM снят с шагом 30 м и засыпает бухты: Артиллерийская и Хрустальный пляж
// оказывались сушей. Берег в OSM есть (natural=coastline), но направление
// линий тут непоследовательное, и правило «суша слева» врёт. Поэтому не
// доверяем обходу вовсе: растеризуем берег как барьер и заливаем воду от
// открытого моря.
//
// СВЯЗНОСТЬ считается один раз на весь мир по грубой сетке (54 м/пиксель) —
// и только она. Внутри квадрата 1024 м заливать неоткуда: в Южной бухте нет
// ни одной клетки открытого моря, с которой можно начать, и бухта осталась бы
// зелёным островом. Глобальная маска даёт затравку ВНУТРИ воды, а точную
// кромку по-прежнему рисует мелкая заливка своим барьером берега.
export function coarseSeaMask(terrain, far) {
  const g = terrain.coarse;
  if (!g) return null;
  const W = g.w, H = g.h;
  const wall = new Uint8Array(W * H);
  const px = (x, z) => terrain.toPixel(x, z, g.n2, g.px0, g.py0);
  // Барьер тонкий, в одну клетку: на 54 метрах кайма в 3×3, как у мелкой
  // маски, запечатала бы Южную бухту целиком. Заливка идёт по четырём
  // сторонам, а цепочка клеток связна по диагонали — сквозь такую стену вода не течёт.
  const mark = (a, b) => {
    const i = Math.round(a), j = Math.round(b);
    if (i >= 0 && j >= 0 && i < W && j < H) wall[j * W + i] = 1;
  };
  const line = pts => {
    for (let k = 0; k + 3 < pts.length; k += 2) {
      const [ax, ay] = px(pts[k], pts[k + 1]);
      const [bx, by] = px(pts[k + 2], pts[k + 3]);
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.4));
      for (let t = 0; t <= n; t++) mark(ax + (bx - ax) * t / n, ay + (by - ay) * t / n);
    }
  };
  for (const ln of far.coast || []) line(ln.pts);
  // Дома и проезжие улицы стоят на СУШЕ по определению — второй барьер,
  // чтобы заливка второго прохода (потолок 26 м) не ушла в низины города.
  for (const r of far.roads || []) if (!(r.c > 3 || r.br || r.tn)) line(r.pts);
  for (const b of far.buildings || []) {
    const p = b.poly;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let k = 0; k < p.length; k += 2) {
      if (p[k] < x0) x0 = p[k]; if (p[k] > x1) x1 = p[k];
      if (p[k + 1] < z0) z0 = p[k + 1]; if (p[k + 1] > z1) z1 = p[k + 1];
    }
    const [ax, ay] = px(x0, z0), [bx, by] = px(x1, z1);
    for (let j = Math.round(Math.min(ay, by)); j <= Math.round(Math.max(ay, by)); j++)
      for (let i = Math.round(Math.min(ax, bx)); i <= Math.round(Math.max(ax, bx)); i++) mark(i, j);
  }

  const dist = new Int32Array(W * H).fill(-1);
  const q = new Int32Array(W * H);
  let qh = 0, qt = 0;
  const dem = i => g.data[i] * g.unit;
  // Затравка — клетки открытого моря по краю охвата. Порог был −1.5 м: в
  // старом монолите море в тайлах уходило на −2400. В нынешней грубой сетке
  // (Int16, дециметры) открытое море записано НУЛЁМ — по краю охвата ни одной
  // клетки ниже −1 м, заливке не с чего было начаться, и маска моря выходила
  // пустой целиком: Южная бухта, Артбухта и всё побережье лежали песчаным
  // пляжем на +0.32 м. Суша на краю охвата — горы и склоны, нуля там нет.
  const seed = c => { if (!wall[c] && dist[c] < 0 && dem(c) <= 0.05) { dist[c] = 0; q[qt++] = c; } };
  for (let i = 0; i < W; i++) { seed(i); seed((H - 1) * W + i); }
  for (let j = 0; j < H; j++) { seed(j * W); seed(j * W + W - 1); }
  const flood = limit => {
    const push = n => { if (!wall[n] && dist[n] < 0 && dem(n) <= limit) { dist[n] = 1; q[qt++] = n; } };
    while (qh < qt) {
      const c = q[qh++], i = c % W, j = (c / W) | 0;
      if (i > 0) push(c - 1);
      if (i < W - 1) push(c + 1);
      if (j > 0) push(c - W);
      if (j < H - 1) push(c + W);
    }
  };
  flood(5.5);           // открытое море и явные акватории
  qh = 0; flood(26);    // засыпанные SRTM бухты — но только от уже залитого
  const sea = new Uint8Array(W * H);
  let cells = 0;
  for (let c = 0; c < sea.length; c++) if (dist[c] >= 0) { sea[c] = 1; cells++; }
  // Затравка для мелкой заливки — вода, ужатая на клетку внутрь: клетка на
  // кромке наполовину суша, и мелкая заливка от неё ушла бы на берег.
  const seedMask = new Uint8Array(W * H);
  for (let j = 1; j < H - 1; j++)
    for (let i = 1; i < W - 1; i++) {
      const c = j * W + i;
      if (sea[c] && sea[c - 1] && sea[c + 1] && sea[c - W] && sea[c + W]) seedMask[c] = 1;
    }
  const at = (m, x, z) => {
    const [a, b] = px(x, z);
    const i = Math.round(a), j = Math.round(b);
    return i >= 0 && j >= 0 && i < W && j < H ? m[j * W + i] : 0;
  };
  return {
    W, H, cells,
    sea: (x, z) => at(sea, x, z),
    seeded: (x, z) => at(seedMask, x, z),
  };
}

// Мелкая маска моря на окно одного квадрата земли: точная кромка берега,
// затравка — из глобальной маски. Заодно копим расстояние от затравки —
// по нему делаем отмель (её всё равно не видно под непрозрачной водой,
// но берег обязан уходить вниз, а не обрываться стеной).
function* seaMaskGen(world, terrain, x0, z0, x1, z1, coarse, res = 8) {
  const lines = world.coast || [];
  const W = Math.ceil((x1 - x0) / res), H = Math.ceil((z1 - z0) / res);
  const wall = new Uint8Array(W * H);
  const idx = (i, j) => j * W + i;
  const mark = (x, z) => {
    const i = Math.round((x - x0) / res), j = Math.round((z - z0) / res);
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        const a = i + di, b = j + dj;
        if (a >= 0 && b >= 0 && a < W && b < H) wall[idx(a, b)] = 1;
      }
  };
  // ВТОРОЙ БАРЬЕР: дома и проезжие улицы. Они по определению стоят на СУШЕ,
  // и заливка не имеет права через них проходить. Без этого второй проход с
  // высоким потолком съедал землю между домами на Корабельной стороне, и
  // кварталы оставались на тонких косах посреди воды.
  for (const b of world.buildings || []) {
    const p2 = b.poly;
    let bx0 = Infinity, bz0 = Infinity, bx1 = -Infinity, bz1 = -Infinity;
    for (let k = 0; k < p2.length; k += 2) {
      bx0 = Math.min(bx0, p2[k]); bx1 = Math.max(bx1, p2[k]);
      bz0 = Math.min(bz0, p2[k + 1]); bz1 = Math.max(bz1, p2[k + 1]);
    }
    for (let x = bx0 - res; x <= bx1 + res; x += res)
      for (let z = bz0 - res; z <= bz1 + res; z += res) {
        const i = Math.round((x - x0) / res), j = Math.round((z - z0) / res);
        if (i >= 0 && j >= 0 && i < W && j < H) wall[idx(i, j)] = 1;
      }
  }
  for (const r of world.roads || []) {
    if (r.c > 3 || r.br || r.tn) continue;
    const p2 = r.pts;
    for (let k = 0; k + 3 < p2.length; k += 2) {
      const L = Math.hypot(p2[k + 2] - p2[k], p2[k + 3] - p2[k + 1]);
      const n = Math.max(1, Math.ceil(L / (res * 0.6)));
      for (let t = 0; t <= n; t++) {
        const x = p2[k] + (p2[k + 2] - p2[k]) * t / n;
        const z = p2[k + 1] + (p2[k + 3] - p2[k + 1]) * t / n;
        const i = Math.round((x - x0) / res), j = Math.round((z - z0) / res);
        if (i >= 0 && j >= 0 && i < W && j < H) wall[idx(i, j)] = 1;
      }
    }
  }
  yield;

  // Островок — замкнутое кольцо берега в пару десятков метров — метим без
  // каймы, одной клеткой, а скалу меньше клетки с каймой (ROCK) не метим
  // вовсе: на сетке 8 м её всё равно не нарисовать. Кайма 3×3 раздувала
  // скалу Памятника затопленным кораблям (кольцо 17 м) до 40 м и смыкала её
  // с каймой набережной в 15–20 м от неё: протока не заливалась, набережная
  // опускала её к +0.5 м, и памятник стоял на песчаном мысу. Скала у
  // памятника — часть модели, она уходит под воду сама. Сквозь цепочку
  // клеток, связную по диагонали, заливка по четырём сторонам не течёт —
  // без каймы островок воду не пропустит.
  const mark1 = (x, z) => {
    const i = Math.round((x - x0) / res), j = Math.round((z - z0) / res);
    if (i >= 0 && j >= 0 && i < W && j < H) wall[idx(i, j)] = 1;
  };
  const ISLET = 60, ROCK = res * 3;
  let segs = 0;
  for (const ln of lines) {
    const p = ln.pts;
    let lx0 = Infinity, lz0 = Infinity, lx1 = -Infinity, lz1 = -Infinity;
    for (let k = 0; k < p.length; k += 2) {
      lx0 = Math.min(lx0, p[k]); lx1 = Math.max(lx1, p[k]);
      lz0 = Math.min(lz0, p[k + 1]); lz1 = Math.max(lz1, p[k + 1]);
    }
    const ring = p.length >= 8 && Math.hypot(p[0] - p[p.length - 2], p[1] - p[p.length - 1]) < 0.5;
    const size = Math.max(lx1 - lx0, lz1 - lz0);
    if (ring && size < ROCK) continue;
    const put = ring && size < ISLET ? mark1 : mark;
    for (let k = 0; k + 3 < p.length; k += 2) {
      const ax = p[k], az = p[k + 1], bx = p[k + 2], bz = p[k + 3];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 0.01) continue;
      segs++;
      const n = Math.max(1, Math.ceil(L / (res * 0.4)));
      for (let t = 0; t <= n; t++) put(ax + (bx - ax) * t / n, az + (bz - az) * t / n);
    }
  }
  yield;

  const dist = new Int16Array(W * H).fill(-1);
  const q = new Int32Array(W * H);
  let qh = 0, qt = 0;
  // Порог первого прохода. Засыпанные SRTM бухты лежат в паре метров,
  // а центр стоит на холмах в 20–60 м, так что он их надёжно разделяет.
  const LIMIT = 5.5;
  const dem = new Float32Array(W * H);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) dem[idx(i, j)] = terrain.heightAt(x0 + i * res, z0 + j * res);
    if ((j & 31) === 31) yield;
  }
  const seed = c => { if (!wall[c] && dist[c] < 0) { dist[c] = 0; q[qt++] = c; } };
  // Затравка ИЗНУТРИ по глобальной маске: только так вода попадает в бухту,
  // целиком лежащую внутри одного квадрата, — клетки открытого моря там нет.
  if (coarse) {
    for (let j = 0; j < H; j++)
      for (let i = 0; i < W; i++) {
        const c = idx(i, j);
        if (dist[c] >= 0 || wall[c] || dem[c] > 26) continue;
        if (coarse.seeded(x0 + i * res, z0 + j * res)) seed(c);
      }
  } else {
    // без глобальной маски — по-старому, от открытого моря по краю окна
    for (let i = 0; i < W; i++) {
      if (dem[idx(i, 0)] <= -1.5) seed(idx(i, 0));
      if (dem[idx(i, H - 1)] <= -1.5) seed(idx(i, H - 1));
    }
    for (let j = 0; j < H; j++) {
      if (dem[idx(0, j)] <= -1.5) seed(idx(0, j));
      if (dem[idx(W - 1, j)] <= -1.5) seed(idx(W - 1, j));
    }
  }
  yield;

  const LIMIT2 = 26;
  // Заливка не уходит дальше REACH клеток от затравки. Это не экономия, а
  // условие ОДИНАКОВОГО ответа у соседей по шву: окно квадрата обрезано, пути
  // заливки в нём и у соседа разные, и берег на шве расходился на метры —
  // замер давал 1.8 м в среднем и 32 м в худшем месте. Затравка стоит в каждой
  // клетке грубой маски (54 м), поэтому вода всё равно доходит куда надо, а
  // ответ теперь зависит только от окрестности в 240 м — она у обоих соседей
  // одна и та же (запас растра pad больше).
  const REACH = 30;
  // Генератор: заливка квадрата у берега — до сорока миллисекунд подряд,
  // это заметный рывок кадра. Отдаём управление каждые 16 тысяч клеток.
  let steps = 0;
  const run = function* (limit) {
    while (qh < qt) {
      if ((++steps & 16383) === 0) yield;
      const c = q[qh++];
      const i = c % W, j = (c / W) | 0, d = dist[c];
      if (d >= REACH) continue;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= W || b >= H) continue;
        const n = idx(a, b);
        if (wall[n] || dist[n] >= 0 || dem[n] > limit) continue;
        dist[n] = d + 1; q[qt++] = n;
      }
    }
  };
  yield* run(LIMIT);
  // ВТОРОЙ ПРОХОД. Порога в 5.5 м мало: SRTM — модель ПОВЕРХНОСТИ, и узкие
  // бухты она засыпает выше. Идём вторым проходом с потолком 26 м, но СТРОГО
  // от уже залитых клеток и по-прежнему упираясь в барьер берега.
  qh = 0;
  yield* run(LIMIT2);

  let cells = 0;
  for (let c = 0; c < dist.length; c++) if (dist[c] >= 0) cells++;
  yield;

  // Барьер шириной в клетку сам по себе водой не считается — но у самой кромки
  // вода должна доходить до берега, иначе вдоль всего побережья идёт сухая
  // полоска в восемь метров. Помечаем стеночные клетки, у которых сосед — вода.
  const shore = new Uint8Array(W * H);
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const c = idx(i, j);
      if (!wall[c]) continue;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= W || b >= H) continue;
        if (dist[idx(a, b)] >= 0) { shore[c] = 1; break; }
      }
    }

  // Глубину считаем от БЕРЕГА, а не от затравки. Затравка стоит в каждой
  // клетке грубой маски, то есть почти везде внутри бухты, и «расстояние от
  // затравки» там ноль: вся Южная бухта выходила отмелью на −0.35 м. Дно в
  // треть метра под плоскостью воды на полкилометра от камеры проигрывает ей
  // в буфере глубины, и залив рисовался песчаной плитой со стенкой в воду.
  // Расстояние до суши — волной от сухих клеток, не дальше DL клеток: ответ
  // зависит только от окрестности в 160 м, у соседей по шву он один и тот же.
  const DL = 20;
  const dland = new Uint8Array(W * H).fill(DL);
  {
    let qa = 0, qb = 0;
    for (let c = 0; c < W * H; c++) if (dist[c] < 0) { dland[c] = 0; q[qb++] = c; }
    while (qa < qb) {
      const c = q[qa++], i = c % W, j = (c / W) | 0, d = dland[c] + 1;
      if (d >= DL) continue;
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          const a = i + di, b = j + dj;
          if (a < 0 || b < 0 || a >= W || b >= H) continue;
          const n = b * W + a;
          if (dland[n] > d) { dland[n] = d; q[qb++] = n; }
        }
      if ((qa & 32767) === 0) yield;
    }
  }

  // глубина: у берега почти ноль, через клетку — полтора метра, дальше глубже
  const depthAt = (x, z) => {
    const i = Math.round((x - x0) / res), j = Math.round((z - z0) / res);
    if (i < 0 || j < 0 || i >= W || j >= H) return null;
    const c = idx(i, j);
    if (shore[c]) return 0.35;
    if (dist[c] < 0) return null;                 // суша
    return 0.35 + Math.min(7.5, (dland[c] - 0.5) * res * 0.15);
  };
  return { depthAt, cells, segs, res, W, H };
}

// ---------------------------------------------------------------- рельеф
// Земля нарезана по тем же квадратам 1024 м, что и город: квадрат земли
// строится вместе с кварталом над ним и выгружается вместе с ним. Раньше это
// был ОДИН меш на окно ±3 км, который целиком перекладывался каждую пару
// километров пути — полторы секунды в одном кадре, тот самый фриз на переезде.
//
// Сборка — генератор: менеджер крутит его по несколько миллисекунд в кадре.
// Швы между соседями держатся на трёх вещах:
//   * растры (маска города, коридор дорог, море) считаются с запасом pad за
//     краем квадрата, чтобы сглаживание и релаксация успели сойтись к тем же
//     значениям, что у соседа;
//   * профиль дороги общий для обоих соседей (кэш в roadProfile);
//   * сетка высот берётся с каймой в одну ячейку — по ней считаются нормали,
//     иначе на шве видна складка освещения;
//   * плюс юбка по периметру: закрывает щель, если высоты всё же разошлись
//     на сантиметры.
const mesh_stats = {};
let TILE_MAT = null;
// Разбивка сборки квадрата по этапам: без неё непонятно, что именно стоит
// те самые миллисекунды. Копится по всем квадратам, смотреть в G.tileProf.
// Время меряет менеджер: генератор рвётся на кусочки по кадрам, и обычный
// секундомер внутри него считал бы заодно всё, что нарисовалось между шагами.
// Здесь только имя текущего этапа.
export const tileProf = { cur: '', worst: {} };
const lap = name => { tileProf.cur = name; };
const GREEN_COL = {
  park:  [0.353, 0.443, 0.247], grass: [0.427, 0.478, 0.271],
  wood:  [0.235, 0.325, 0.192], scrub: [0.435, 0.451, 0.294],
  pitch: [0.318, 0.443, 0.259], sand:  [0.827, 0.769, 0.616],
  yard:  [0.396, 0.388, 0.373],
};
const ROCK = [0.686, 0.643, 0.553];

// Разложить far-слой по квадратам: каждый растр берёт из него только то, что
// попало в своё окно. Линейный перебор 13 тысяч домов на каждый квадрат —
// это полсекунды на круг, а бакеты стоят два десятка миллисекунд один раз.
export class FarIndex {
  constructor(far, cell = 1024) {
    this.cell = cell;
    this.b = new Map();
    this.nodes = new Map();       // узел дороги → улицы, которые в нём сходятся
    const put = (kind, o, x0, z0, x1, z1) => {
      const c = cell;
      for (let j = Math.floor(z0 / c); j <= Math.floor(z1 / c); j++)
        for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++) {
          const k = i + '_' + j;
          let e = this.b.get(k);
          if (!e) this.b.set(k, e = { buildings: [], roads: [], green: [], coast: [] });
          e[kind].push(o);
        }
    };
    const bb = p => {
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (let i = 0; i < p.length; i += 2) {
        if (p[i] < x0) x0 = p[i]; if (p[i] > x1) x1 = p[i];
        if (p[i + 1] < z0) z0 = p[i + 1]; if (p[i + 1] > z1) z1 = p[i + 1];
      }
      return [x0, z0, x1, z1];
    };
    for (const o of far.buildings || []) put('buildings', o, ...bb(o.poly));
    for (const o of far.green || []) put('green', o, ...bb(o.poly));
    for (const o of far.coast || []) put('coast', o, ...bb(o.pts));
    // Порядок улиц — как в far.json. За ячейку коридора спорят несколько улиц,
    // и при равном весе побеждает ПЕРВАЯ; у соседнего квадрата список
    // собирается из других бакетов и в другом порядке, и на шве побеждала
    // другая улица — до четырёх метров разницы там, где рядом идут две дороги
    // на разной высоте. Нумеруем раз и навсегда.
    let rank = 0;
    for (const o of far.roads || []) {
      o.__rank = rank++;
      put('roads', o, ...bb(o.pts));
      const p = o.pts;
      for (const [x, z] of [[p[0], p[1]], [p[p.length - 2], p[p.length - 1]]]) {
        const k = nodeKey(x, z);
        let e = this.nodes.get(k);
        if (!e) this.nodes.set(k, e = []);
        e.push(o);
      }
    }
  }

  // Всё, что пересекает окно. Объект лежит в нескольких бакетах — дедуплицируем.
  around(x0, z0, x1, z1) {
    const c = this.cell;
    const out = { buildings: [], roads: [], green: [], coast: [] };
    const seen = new Set();
    for (let j = Math.floor(z0 / c); j <= Math.floor(z1 / c); j++)
      for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++) {
        const e = this.b.get(i + '_' + j);
        if (!e) continue;
        for (const kind of ['buildings', 'roads', 'green', 'coast']) {
          for (const o of e[kind]) {
            if (seen.has(o)) continue;
            seen.add(o);
            out[kind].push(o);
          }
        }
      }
    return out;
  }

  // Улицы окна ПЛЮС все, что сходятся с ними в общих узлах: сведение концов
  // в узле обязано увидеть одну и ту же компанию у обоих соседей по шву,
  // иначе поправка узла разъедется и полотно встанет ступенькой.
  roadsWithJunctions(roads) {
    const out = new Set(roads);
    for (const r of roads) {
      const p = r.pts;
      for (const [x, z] of [[p[0], p[1]], [p[p.length - 2], p[p.length - 1]]])
        for (const o of this.nodes.get(nodeKey(x, z)) || []) out.add(o);
    }
    return [...out];
  }
}

export function* buildTerrainTile(terrain, index, opts) {
  const size = opts.size ?? 1024;
  const seg = opts.segments ?? 112;          // 9.14 м на ячейку — как было у окна
  // Запас растров за краем квадрата: сглаживание и ограничение уклона в
  // коридоре дорог расходятся на 300 м, и всё это должно попасть в окно ОБОИХ
  // соседей по шву — иначе высота на шве разъедется.
  const pad = opts.pad ?? 380;
  const cx = opts.cx, cz = opts.cz;
  const key = opts.key ?? (cx + '_' + cz);
  const bx0 = cx * size, bz0 = cz * size;
  const x0 = bx0 - pad, x1 = bx0 + size + pad;
  const z0 = bz0 - pad, z1 = bz0 + size + pad;
  const step = size / seg;
  // Кайма в одну ячейку с каждой стороны: по ней считаются нормали на краю
  // квадрата. Без неё на шве двух квадратов видна складка освещения — та же
  // причина, по которой кайма есть у файлов высот (docs/CHUNKS.md).
  const n = seg + 3;
  const gx0 = bx0 - step, gz0 = bz0 - step;

  const near = index.around(x0, z0, x1, z1);
  const world = { roads: near.roads, buildings: near.buildings, green: near.green, coast: near.coast };

  lap('маска города');
  const mask = yield* urbanMaskGen(world, x0, z0, x1, z1);
  // Запасная полоса узлов вокруг квадрата: по ней считаются отметки площадок
  // домов на краю и уклон для раскраски. E узлов — 55 м: дом крупнее этого,
  // лежащий на шве, посчитает отметку по своей части контура (а сосед возьмёт
  // её же из кэша, см. platforms.js).
  const E = 6, ne = n + 2 * E;
  const ex0 = gx0 - E * step, ez0 = gz0 - E * step;
  lap('коридор дорог');
  // Дворовые проезды вне far.json (roadlevels.js) — в коридор вместе с
  // улицами дальнего слоя: без коридора колесо ехало по сырому рельефу.
  const corrRoads = index.roadsWithJunctions(near.roads);
  {
    const have = new Set(corrRoads.map(r => r.id));
    for (const r of yardRoadsIn(x0, z0, x1, z1)) if (!have.has(r.id)) corrRoads.push(r);
  }
  const corrWide = yield* roadCorridorGen(
    { roads: corrRoads }, terrain, x0, z0, x1, z1,
    [ex0, ez0, ex0 + (ne - 1) * step, ez0 + (ne - 1) * step]);
  // Храним только сам квадрат с каймой: по нему ездит машина и садятся дороги.
  const corr = corrWide && crop(corrWide, [gx0, gz0, bx0 + size + step, bz0 + size + step]);
  lap('высоты');
  terrain.setSampler(sampleCorridor);
  const corrAt = (x, z) => sampleCorridor(corrWide, x, z);
  const greens = new PolyGrid(world.green);

  // Сырые высоты + снос застройки. Делаем ДО коридора дорог: иначе профиль улиц
  // считается по крышам соседних домов и уезжает вверх.
  //
  // Снос считаем на сетке ШИРЕ квадрата, с каймой M ячеек. Заращивание ямы от
  // дома — это релаксация внутри его пятна, и её край упирается в границу
  // сетки: у дома на шве сетка обрывается по-разному у двух соседей, и высота
  // расходилась до двух метров. С каймой в 180 м пятно целиком внутри обеих.
  const M = 20, nb = seg + 1 + 2 * M;
  const wx0 = bx0 - M * step, wz0 = bz0 - M * step;
  const wide = new Float32Array(nb * nb);
  for (let j = 0; j < nb; j++) {
    const z = wz0 + j * step;
    for (let i = 0; i < nb; i++) wide[j * nb + i] = terrain.heightAt(wx0 + i * step, z);
    if ((j & 15) === 15) yield;
  }
  lap('снос домов');
  // Мелкая застройка и кроны: в far-слое только крупные пятна, остальное
  // снимаем открытием поля (см. platforms.js) — до заращивания крупных.
  openGround(wide, nb, 2);
  yield;
  const cut = yield* removeBuildingsGen(wide, nb, wx0, wz0, step, step, world.buildings);
  // из широкой сетки берём квадрат с запасной полосой E узлов
  const ext = new Float32Array(ne * ne);
  for (let j = 0; j < ne; j++) {
    const a = (j + M - 1 - E) * nb + M - 1 - E;
    ext.set(wide.subarray(a, a + ne), j * ne);
  }
  lap('море');

  // Море вырезаем ДО коридора дорог: иначе набережная считает профиль по
  // засыпанной бухте. Суше у самой воды даём небольшой запас над уровнем —
  // иначе полотно воды спорит за глубину с плоским берегом и мерцает.
  // Есть ли в квадрате вода вообще. Берега в окне нет — смотрим глобальную
  // маску по углам и центру: открытое море берегом не описано, а вырезать его
  // всё равно надо. Сухих квадратов большинство, и заливка им ни к чему.
  let wet = world.coast.length > 0;
  if (!wet && opts.sea)
    for (const [px, pz] of [[0.5, 0.5], [0, 0], [1, 0], [0, 1], [1, 1]])
      if (opts.sea.sea(bx0 + px * size, bz0 + pz * size)) { wet = true; break; }
  const sea = wet ? yield* seaMaskGen(world, terrain, x0, z0, x1, z1, opts.sea) : null;
  lap('цвет и дороги');
  let carved = 0;
  for (let j = 0; j < ne; j++)
    for (let i = 0; i < ne; i++) {
      const k = j * ne + i;
      const d = sea && sea.depthAt(ex0 + i * step, ez0 + j * step);
      if (d == null) { if (ext[k] < 0.32) ext[k] = 0.32; continue; }
      const want = -d;
      if (ext[k] > want) { ext[k] = want; carved++; }
    }
  yield;

  // ---- набережные. DSM размазывает уступ берега на несколько пикселей по
  // 7 м: у Графской пристани газон спускался к воде полого на сотню метров, и
  // лестница со львами оказалась под землёй, хотя в натуре набережная — это
  // +0.5 м у самой воды. Низкий берег (ниже 8 м — не скалы Фиолента) у линии
  // берега из OSM опускаем к отметке набережной: 7 м ровной полосы, дальше
  // подъём 30% к своей земле. Решают только линия берега и маска моря рядом
  // с узлом — шов не разъедется.
  let quay = 0;
  const qmask = new Uint8Array(ne * ne);     // набережная: красим камнем, не песком
  if (sea && world.coast.length) {
    const QR = 30, BC = 32, buckets = new Map();
    for (const ln of world.coast) {
      const p = ln.pts;
      for (let t = 0; t + 3 < p.length; t += 2) {
        const ax = p[t], az = p[t + 1], bx = p[t + 2], bz = p[t + 3];
        if (Math.max(ax, bx) < ex0 - QR || Math.min(ax, bx) > ex0 + ne * step + QR ||
            Math.max(az, bz) < ez0 - QR || Math.min(az, bz) > ez0 + ne * step + QR) continue;
        for (let cj = Math.floor((Math.min(az, bz) - QR) / BC); cj <= Math.floor((Math.max(az, bz) + QR) / BC); cj++)
          for (let ci = Math.floor((Math.min(ax, bx) - QR) / BC); ci <= Math.floor((Math.max(ax, bx) + QR) / BC); ci++) {
            const kk = ci + ',' + cj;
            let e = buckets.get(kk);
            if (!e) buckets.set(kk, e = []);
            e.push(ax, az, bx, bz);
          }
      }
    }
    for (let j = 0; j < ne; j++) {
      for (let i = 0; i < ne; i++) {
        const k = j * ne + i;
        const h = ext[k];
        if (h >= 8 || h <= 0.5) continue;
        const x = ex0 + i * step, z = ez0 + j * step;
        const e = buckets.get(Math.floor(x / BC) + ',' + Math.floor(z / BC));
        if (!e || sea.depthAt(x, z) != null) continue;
        let d2 = QR * QR;
        for (let t = 0; t < e.length; t += 4) {
          const ax = e[t], az = e[t + 1], vx = e[t + 2] - ax, vz = e[t + 3] - az;
          const L2 = vx * vx + vz * vz;
          let u = L2 > 0 ? ((x - ax) * vx + (z - az) * vz) / L2 : 0;
          u = u < 0 ? 0 : u > 1 ? 1 : u;
          const dx = ax + vx * u - x, dz = az + vz * u - z, dd = dx * dx + dz * dz;
          if (dd < d2) d2 = dd;
        }
        if (d2 >= QR * QR) continue;
        const want = 0.5 + Math.max(0, Math.sqrt(d2) - 7) * 0.3;
        if (h > want) { ext[k] = want; quay++; if (d2 < 15 * 15) qmask[k] = 1; }
      }
      if ((j & 15) === 15) yield;
    }
  }

  // ---- вдавливание под дороги
  const cwE = new Float32Array(ne * ne), capE = new Float32Array(ne * ne).fill(Infinity);
  for (let j = 0; j < ne; j++) {
    for (let i = 0; i < ne; i++) {
      const k = j * ne + i;
      const cr = corrAt(ex0 + i * step, ez0 + j * step);
      if (!cr) continue;
      let h = ext[k];
      if (cr.w > 0) h = h * (1 - cr.w) + cr.h * cr.w;   // рельеф подстраивается под дорогу
      if (h > cr.cap) h = cr.cap;                        // и не смеет над ней нависать
      ext[k] = h;
      cwE[k] = Math.min(1, cr.w); capE[k] = cr.cap;
    }
    if ((j & 15) === 15) yield;
  }

  // ---- террасы под скверами и площадями, потом площадки под домами
  lap('площадки домов');
  const keepT = [gx0 - 0.01, gz0 - 0.01, gx0 + (n - 1) * step + 0.01, gz0 + (n - 1) * step + 0.01];
  const terr = yield* terracesGen(ext, ne, ex0, ez0, step, cwE, capE, opts.terraces, keepT, near.roads);
  const mlev = modelLevels(opts.models, world.buildings, ext, ne, ex0, ez0, step);
  const plat = yield* platformsGen(ext, ne, ex0, ez0, step, cwE, capE, world.buildings,
                                   [gx0 - 0.01, gz0 - 0.01, gx0 + (n - 1) * step + 0.01, gz0 + (n - 1) * step + 0.01], mlev);
  applySiteCuts(ext, ne, ex0, ez0, step);
  // спортполя — снова на свою отметку: открытие, террасы и откосы площадок
  // домов их сминали (fields.js)
  applyFieldFlats(ext, ne, ex0, ez0, step, corrAt, world.buildings);
  // ДОРОГИ ПЕРВИЧНЫ (roadlevels.js): под самой проезжей частью центра земля
  // не ниже полотна, что бы с ней ни сделали площадки домов, террасы и
  // срезы. Срезанная под площадку земля у кромки опускала профиль езды на
  // метры (он не смеет висеть выше земли больше чем на 1.1 м) — и колесо
  // проваливалось сквозь нарисованный асфальт (ул. у −250, 937).
  for (let j = 0; j < ne; j++)
    for (let i = 0; i < ne; i++) {
      const x = ex0 + i * step, z = ez0 + j * step;
      if (levelWeight(x, z) <= 0) continue;
      const cr = corrAt(x, z);
      if (!cr || cr.core < 0.5) continue;
      const k = j * ne + i;
      if (ext[k] < cr.h - 0.02) ext[k] = cr.h - 0.02;
    }
  // ТРЕУГОЛЬНИК НАД ПОЛОТНОМ. Узлы сетки стоят ровно на коридоре, но клетка
  // 9 м, а на развязках две проезжие части на разной высоте идут в 10–20 м
  // друг от друга (7-й км: съезд в выемке под путепроводом на 146.7 м, рядом
  // Городское шоссе на 149–150 м). Треугольник между ними ложится на нижнее
  // полотно наклонной крышей до 0.33 м, а профиль езды не смеет быть ниже
  // нарисованной земли — колесо и асфальт шли по треугольникам: бугор на
  // каждой клетке. Опускаем узлы, которые задирают треугольник над полотном
  // (пробы по 4 на ребро клетки, только над проезжей частью с отметками).
  // Узел, на котором лежит своя проезжая часть, — не ниже, чем ей разрешён
  // запас над землёй (groundDriveHeightAt: 0.15 + 0.95·core), с полями.
  lap('треугольники над полотном');
  {
    const SUB = 4, NS = SUB * SUB, low = new Float32Array(ne * ne);
    const cap0 = new Float32Array(ne * ne).fill(-1);
    const capOf = k => {
      if (cap0[k] < 0) {
        const cr = corrAt(ex0 + (k % ne) * step, ez0 + Math.floor(k / ne) * step);
        cap0[k] = !cr || cr.w <= 0.6 || cr.core < 0.5 ? 0.6 : Math.max(0, 0.95 * Math.min(1, cr.core) - 0.05);
      }
      return cap0[k];
    };
    // пробы коридора клетки — один раз: высота полотна или NaN (не проезжая часть)
    const probe = new Map();
    const probesOf = (i, j) => {
      const ck = j * ne + i;
      let P = probe.get(ck);
      if (P) return P;
      P = new Float32Array(NS);
      for (let b = 0; b < SUB; b++)
        for (let a = 0; a < SUB; a++) {
          const x = ex0 + (i + (a + 0.5) / SUB) * step, z = ez0 + (j + (b + 0.5) / SUB) * step;
          const cr = levelWeight(x, z) > 0 ? corrAt(x, z) : null;
          P[b * SUB + a] = cr && cr.w >= 0.99 && cr.core >= 0.5 ? cr.h : NaN;
        }
      probe.set(ck, P);
      return P;
    };
    let dirty = null;                         // клетки у сдвинутых узлов — на следующий проход
    for (let pass = 0; pass < 3; pass++) {
      const next = new Uint8Array((ne - 1) * (ne - 1));
      let moved = 0;
      for (let j = 0; j < ne - 1; j++) {
        for (let i = 0; i < ne - 1; i++) {
          if (dirty && !dirty[j * (ne - 1) + i]) continue;
          const ka = j * ne + i, kb = ka + 1, kc = ka + ne, kd = kc + 1;
          // плато коридора (вес 1) шире проезжей части на 13 м: проезжая часть
          // в клетке — значит, хоть один её узел на плато
          if (cwE[ka] < 0.99 && cwE[kb] < 0.99 && cwE[kc] < 0.99 && cwE[kd] < 0.99) continue;
          const hmin = Math.min(ext[ka], ext[kb], ext[kc], ext[kd]), hmax = Math.max(ext[ka], ext[kb], ext[kc], ext[kd]);
          if (hmax - hmin < 0.3) continue;            // ровная клетка: треугольник и коридор совпадают
          const P = probesOf(i, j);
          for (let q0 = 0; q0 < NS; q0++) {
            const ch = P[q0];
            if (ch !== ch) continue;
            const fx = ((q0 % SUB) + 0.5) / SUB, fz = (Math.floor(q0 / SUB) + 0.5) / SUB;
            // вершины и барицентрические веса — как в gridHeightAt (диагональ b–c)
            const V = fx + fz < 1 ? [ka, 1 - fx - fz, kb, fx, kc, fz] : [kd, fx + fz - 1, kb, 1 - fz, kc, 1 - fx];
            const over = ext[V[0]] * V[1] + ext[V[2]] * V[3] + ext[V[4]] * V[5] - ch - 0.03;
            if (over <= 0) continue;
            let bh = 0;
            for (let q = 0; q < 6; q += 2) if (ext[V[q]] > ch && low[V[q]] < capOf(V[q])) bh += V[q + 1];
            if (bh < 0.05) continue;
            for (let q = 0; q < 6; q += 2) {
              const v = V[q];
              if (ext[v] <= ch) continue;
              const d = Math.min(ext[v] - ch, over / bh, capOf(v) - low[v]);
              if (d > 0.005) {
                ext[v] -= d; low[v] += d; moved++;
                const vi = v % ne, vj = Math.floor(v / ne);
                for (let dj = -1; dj <= 0; dj++)
                  for (let di = -1; di <= 0; di++) {
                    const ci = vi + di, cj = vj + dj;
                    if (ci >= 0 && cj >= 0 && ci < ne - 1 && cj < ne - 1) next[cj * (ne - 1) + ci] = 1;
                  }
              }
            }
          }
        }
        if ((j & 31) === 31) yield;
      }
      if (!moved) break;
      dirty = next;
    }
  }
  lap('цвет и дороги');

  const heights = new Float32Array(n * n);
  for (let j = 0; j < n; j++) heights.set(ext.subarray((j + E) * ne + E, (j + E) * ne + E + n), j * n);

  // ---- цвет
  // Застроенность сглаживаем по площади ячейки (шатёр 3×3 отсчёта на ±6 м):
  // поле вдоль узкой дорожки или кромки коридора уже девятиметровой ячейки,
  // и по одному отсчёту в вершине серое пятно ложилось на сетку зубьями —
  // треугольниками по 9 м. Так же и зелень: доля попадания, а не да/нет.
  const TAP = [-6, 0, 6], TW = [0.25, 0.5, 0.25];
  const col = new Uint8Array(n * n * 3);
  const ter = new Uint8Array(n * n * 2);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i, kE = (j + E) * ne + i + E;
      const x = gx0 + i * step, z = gz0 + j * step;
      const h = heights[k];

      // крутизна — по ГОТОВОЙ земле, а не по сырой поверхности: по сырой
      // край крыши давал «скалу» посреди двора
      const hx = (ext[kE + 1] - ext[kE - 1]) / (2 * step), hz = (ext[kE + ne] - ext[kE - ne]) / (2 * step);
      const slope = Math.atan(Math.hypot(hx, hz));
      const rock = Math.min(1, Math.max(0, (slope - 0.32) / 0.42));
      let c;
      if (h < 1.2) c = [0.741, 0.694, 0.573];
      else {
        const dry = Math.min(1, Math.max(0, (h - 20) / 130));
        c = [0.400 + dry * 0.135, 0.451 + dry * 0.075, 0.286 + dry * 0.090];
      }
      let u = 0, gsum = 0, gk = null;
      for (let b = 0; b < 3; b++)
        for (let a = 0; a < 3; a++) {
          const wt = TW[a] * TW[b], sx = x + TAP[a], sz = z + TAP[b];
          let v = sampleMask(mask, sx, sz);
          const cr = corrAt(sx, sz);
          if (cr && cr.w > v) v = Math.min(1, cr.w);       // обочина дороги тоже город, не луг
          u += v * wt;
          const g = greens.find(sx, sz);
          if (g) { gsum += wt; if (!gk || (a === 1 && b === 1)) gk = g; }
        }
      // у воды песок только на диком берегу: опущенная набережная в городе —
      // камень, а не пляж (иначе вдоль Графской лежала полоса песка)
      const qn = qmask[kE] || qmask[kE - 1] || qmask[kE + 1] || qmask[kE - ne] || qmask[kE + ne];
      // город — если в сорока метрах есть застройка или улица
      if (qn && u < 0.85 && (u > 0.05 || sampleMask(mask, x - 40, z) > 0.2 || sampleMask(mask, x + 40, z) > 0.2 ||
                             sampleMask(mask, x, z - 40) > 0.2 || sampleMask(mask, x, z + 40) > 0.2)) u = 0.85;
      // у воды песок только на диком берегу: набережная в городе — камень
      if (u > 0.01 && (h >= 0.3 || qn)) c = [
        c[0] + (URBAN[0] - c[0]) * u, c[1] + (URBAN[1] - c[1]) * u, c[2] + (URBAN[2] - c[2]) * u,
      ];
      if (gk && h >= 1.2) {
        const gc = GREEN_COL[gk.kind] || GREEN_COL.grass, f = 0.88 * gsum;
        c = [c[0] + (gc[0] - c[0]) * f, c[1] + (gc[1] - c[1]) * f, c[2] + (gc[2] - c[2]) * f];
      }
      c = [c[0] + (ROCK[0] - c[0]) * rock, c[1] + (ROCK[1] - c[1]) * rock, c[2] + (ROCK[2] - c[2]) * rock];
      col[k * 3] = enc(c[0]); col[k * 3 + 1] = enc(c[1]); col[k * 3 + 2] = enc(c[2]);
      ter[k * 2] = Math.round(255 * u);
      ter[k * 2 + 1] = Math.round(255 * rock);
    }
    if ((j & 3) === 3) yield;
  }

  lap('геометрия');
  // Сетку отдаём terrain СРАЗУ: по ней сядут дороги, дома и деревья квадрата.
  terrain.setSurface(key, { x0: gx0, z0: gz0, dx: step, dz: step, nx: n, h: heights }, corr);

  // ---- геометрия. Вершины только внутренние (кайма нужна была для нормалей),
  // по краям — вертикальная юбка на 3 м вниз.
  const S = seg + 1;
  const V = S * S, SK = 4 * S;
  const pos = new Float32Array((V + SK) * 3);
  const nor = new Float32Array((V + SK) * 3);
  const cl = new Uint8Array((V + SK) * 3);
  const tr = new Uint8Array((V + SK) * 2);
  for (let j = 0; j <= seg; j++) {
    for (let i = 0; i <= seg; i++) {
      const k = (j + 1) * n + (i + 1), v = j * S + i;
      pos[v * 3] = bx0 + (i * size) / seg;
      pos[v * 3 + 1] = heights[k];
      pos[v * 3 + 2] = bz0 + (j * size) / seg;
      // Нормаль центральными разностями по сетке С КАЙМОЙ: у соседа за швом
      // те же четыре узла, и освещение через шов идёт непрерывно.
      const hx = heights[k + 1] - heights[k - 1], hz = heights[k + n] - heights[k - n];
      const len = Math.hypot(hx, 2 * step, hz);
      nor[v * 3] = -hx / len; nor[v * 3 + 1] = 2 * step / len; nor[v * 3 + 2] = -hz / len;
      cl[v * 3] = col[k * 3]; cl[v * 3 + 1] = col[k * 3 + 1]; cl[v * 3 + 2] = col[k * 3 + 2];
      tr[v * 2] = ter[k * 2]; tr[v * 2 + 1] = ter[k * 2 + 1];
    }
    if ((j & 31) === 31) yield;
  }

  const tris = seg * seg * 2 + 4 * seg * 2;
  const idx = new Uint16Array(tris * 3);
  let m = 0;
  for (let j = 0; j < seg; j++)
    for (let i = 0; i < seg; i++) {
      const a = j * S + i, b2 = a + 1, c2 = a + S, d = c2 + 1;
      idx[m++] = a; idx[m++] = c2; idx[m++] = b2;
      idx[m++] = b2; idx[m++] = c2; idx[m++] = d;
    }
  // Юбка: сторона обходится в том порядке, при котором треугольники смотрят
  // НАРУЖУ квадрата (север и восток — по возрастанию, юг и запад — обратно).
  const SKIRT = 3;
  let sv = V;
  const side = (get, fwd) => {
    const top = [];
    for (let t = 0; t <= seg; t++) top.push(get(fwd ? t : seg - t));
    for (let t = 0; t <= seg; t++) {
      const a = top[t], v = sv + t;
      pos[v * 3] = pos[a * 3]; pos[v * 3 + 1] = pos[a * 3 + 1] - SKIRT; pos[v * 3 + 2] = pos[a * 3 + 2];
      nor[v * 3] = nor[a * 3]; nor[v * 3 + 1] = nor[a * 3 + 1]; nor[v * 3 + 2] = nor[a * 3 + 2];
      cl[v * 3] = cl[a * 3]; cl[v * 3 + 1] = cl[a * 3 + 1]; cl[v * 3 + 2] = cl[a * 3 + 2];
      tr[v * 2] = tr[a * 2]; tr[v * 2 + 1] = tr[a * 2 + 1];
    }
    for (let t = 0; t < seg; t++) {
      const a = top[t], b = top[t + 1], c = sv + t, d = sv + t + 1;
      idx[m++] = a; idx[m++] = b; idx[m++] = c;
      idx[m++] = b; idx[m++] = d; idx[m++] = c;
    }
    sv += S;
  };
  side(t => t, true);                       // север (j = 0), наружу −z
  side(t => seg * S + t, false);            // юг    (j = seg), наружу +z
  side(t => t * S + seg, true);             // восток (i = seg), наружу +x
  side(t => t * S, false);                  // запад  (i = 0), наружу −x

  lap('сборка');
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(cl, 3, true));
  geo.setAttribute('aTer', new THREE.BufferAttribute(tr, 2, true));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();

  mesh_stats.cut = cut;
  mesh_stats.plat = plat;
  mesh_stats.terr = terr;
  mesh_stats.sea = sea ? { клеток: sea.cells, сегментовБерега: sea.segs, вершинВрезано: carved, набережная: quay } : null;
  const mesh = new THREE.Mesh(geo, TILE_MAT || (TILE_MAT = terrainMaterial()));
  mesh.name = 'земля ' + key;
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  mesh.userData.key = key;
  return mesh;
}

// ---------------------------------------------------------------- ленты
// Единичные нормали в узлах + коэффициент митры: на изломе точку надо отодвинуть
// на 1/cos(θ/2), а длина суммы двух единичных нормалей как раз 2·cos(θ/2).
function miters(pts) {
  const n = pts.length / 2;
  const NX = new Float64Array(n), NZ = new Float64Array(n), S = new Float64Array(n), D = new Float64Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    let nx = 0, nz = 0, cnt = 0;
    if (i > 0) {
      const dx = pts[i * 2] - pts[i * 2 - 2], dz = pts[i * 2 + 1] - pts[i * 2 - 1];
      const l = Math.hypot(dx, dz);
      if (l > 1e-6) { nx += -dz / l; nz += dx / l; cnt++; acc += l; }
    }
    D[i] = acc;
    if (i < n - 1) {
      const dx = pts[i * 2 + 2] - pts[i * 2], dz = pts[i * 2 + 3] - pts[i * 2 + 1];
      const l = Math.hypot(dx, dz);
      if (l > 1e-6) { nx += -dz / l; nz += dx / l; cnt++; }
    }
    let len = Math.hypot(nx, nz);
    if (cnt === 0 || len < 1e-6) { nx = 1; nz = 0; len = 1; cnt = 1; }
    NX[i] = nx / len; NZ[i] = nz / len;
    // На остром изломе множитель уходит в бесконечность. Тройка была слишком
    // щедрой: тротуар смещён на 7.6 м, и втрое — это клин на 23 м поперёк улицы.
    // 1.6 покрывает повороты до ~ 51°, острее — срезаем угол (незаметный зазор
    // вместо клина через всю дорогу).
    S[i] = Math.min(1.6, cnt / len);
  }
  return { NX, NZ, S, D, n };
}

// Осевые линии в OSM обрываются на перекрёстке, и между полотнами остаётся
// дыра, сквозь которую светит грунт. Вытягиваем концы на полширины — соседние
// дороги перекрываются и стык закрывается.

// Узлы OSM стоят в 50–100 м друг от друга. Полотно между ними — прямая в
// пространстве, а рельеф под ней проваливается: посреди пролёта дорога уходит
// в воздух на метры. Уплотняем до шага в 6 м, чтобы поверхность шла за землёй.
function densify(pts, step = 6) {
  const out = [];
  const n = pts.length / 2;
  for (let i = 0; i < n - 1; i++) {
    const ax = pts[i * 2], az = pts[i * 2 + 1];
    const dx = pts[i * 2 + 2] - ax, dz = pts[i * 2 + 3] - az;
    const len = Math.hypot(dx, dz);
    // шаг может зависеть от места: функция от концов пролёта
    const st = typeof step === 'function' ? step(ax, az, ax + dx, az + dz) : step;
    const k = Math.max(1, Math.ceil(len / st));
    for (let j = 0; j < k; j++) out.push(ax + dx * j / k, az + dz * j / k);
  }
  out.push(pts[(n - 1) * 2], pts[(n - 1) * 2 + 1]);
  return out;
}

// ГЕНЕРАТОР: сборка полотна — самый тяжёлый этап квартала (до 76 мс на плотном
// центре), и целиком в одном кадре она не помещается. Управление возвращается
// менеджеру каждые несколько улиц, тот решает, продолжать сейчас или в
// следующем кадре.
export function* buildRoads(world, terrain, chunk = 500) {
  const chunks = new Map();
  // Корзина меша — по точке, ПРИЖАТОЙ к своему квадрату: полотно кладётся
  // только в его границах, а улица, начавшаяся у соседа, заводила бы по
  // лишнему мешу (и вызову отрисовки) на каждый соседний квадрат.
  const sq0 = world.roads.ctx && !world.roads.ctx.orphan ? world.roads.ctx : null;
  const bucket = (x, z) => {
    if (sq0) {
      x = Math.min(sq0.x1 - 1, Math.max(sq0.x0, x));
      z = Math.min(sq0.z1 - 1, Math.max(sq0.z0, z));
    }
    const k = Math.floor(x / chunk) + ',' + Math.floor(z / chunk);
    let c = chunks.get(k);
    if (!c) chunks.set(k, c = { P: [], C: [], R: [], K: [], O: [], S: [], I: [], JI: [], JV: [], base: 0 });
    return c;
  };
  // Последний рубеж. Какая бы причина ни развела профиль дороги и рельеф,
  // полотно не имеет права ни утонуть, ни повиснуть больше чем на 1.2 м:
  // иначе получаются балки в воздухе и куски улиц под землёй.
  // Полотно обязано лежать НА ТОЙ ЖЕ поверхности, по которой едут колёса.
  // Порог тот же, что в terrain.groundDriveHeightAt: 0.35 м было меньше
  // собственных выемки и насыпи коридора, и профиль возвращался к сырому
  // рельефу — отсюда прыжки на спуске Котовского.
  // Пешеходной дорожке — видимая земля, а не профиль езды. Профиль у
  // улицы — это её плато коридора шириной до 27 м, и дорожка, идущая рядом
  // со склоном, висела над газоном на полметра или ныряла под него (у
  // библиотеки Толстого — триста проб из шести тысяч). Под улицей она всё
  // равно скрыта асфальтом: лежит ниже него.
  const GROUND0 = (x, z) => terrain.gridHeightAt(x, z);
  const H0 = (x, z) => {
    const g = terrain.gridHeightAt(x, z);
    const d = terrain.driveHeightAt(x, z);
    return d < g - 1.7 ? g - 1.7 : d > g + 1.1 ? g + 1.1 : d;
  };
  // ПАРУСА НА ШВАХ. Пролёт рисует тот квадрат, где его середина, но конец
  // пролёта заходит к соседу на несколько метров. Земли соседа к этому
  // моменту может ещё не быть, и высота там берётся из грубой сетки, а то и
  // из сырой модели поверхности с крышами: вершина подлетала на метр, и над
  // асфальтом вставал наклонный «парус», а под ним тёмный клин — по каждому
  // шву квадратов. За границей квадрата высоту не спрашиваем: продолжаем её
  // от ближайшей точки внутри по уклону.
  // Земля своего квадрата построена с каймой в одну клетку (9 м) — и сетка,
  // и коридор дорог. Точку чуть за швом спрашиваем у НЕЁ: соседа может не
  // быть, а своя кайма считана по той же общей решётке и с ним совпадает.
  // Дальше каймы — продолжаем от ближайшей точки внутри по уклону.
  const ownSurf = sq0 && terrain.surf ? terrain.surf.get(Math.round(sq0.x0 / (sq0.x1 - sq0.x0)) + '_' + Math.round(sq0.z0 / (sq0.z1 - sq0.z0))) : null;
  const viaOwn = f => (x, z) => {
    const keep = terrain.surfaceAt;
    terrain.surfaceAt = () => ownSurf;
    try { return f(x, z); } finally { terrain.surfaceAt = keep; }
  };
  const KAIMA = ownSurf && ownSurf.grid ? ownSurf.grid.dx * 0.95 : 0;
  const outwards = f => sq0 ? (x, z) => {
    if (x >= sq0.x0 && x < sq0.x1 && z >= sq0.z0 && z < sq0.z1) return f(x, z);
    if (KAIMA && x > sq0.x0 - KAIMA && x < sq0.x1 + KAIMA && z > sq0.z0 - KAIMA && z < sq0.z1 + KAIMA) return viaOwn(f)(x, z);
    const cx = Math.min(sq0.x1 - 0.05, Math.max(sq0.x0 + 0.05, x));
    const cz = Math.min(sq0.z1 - 0.05, Math.max(sq0.z0 + 0.05, z));
    const d = Math.hypot(x - cx, z - cz), h1 = f(cx, cz);
    if (d < 1e-3) return h1;
    const ux = (x - cx) / d, uz = (z - cz) / d;
    const h2 = f(cx - ux * 2, cz - uz * 2);
    return h1 + (h1 - h2) / 2 * Math.min(d, 8);
  } : f;
  const GROUND = outwards(GROUND0);
  const H = outwards(H0);

  // Где полотно приподнято поправкой на провисание (до 40 см) — по клеткам
  // 4 м. Зебра лежала на постоянных 5.5 см над землёй, и приподнятая лента
  // соседнего пролёта резала её пополам: полосы «двоились» со сдвигом.
  const UPC = 4, upGrid = new Map();
  const upNear = (x0, z0, x1, z1) => {
    let m = 0;
    for (let cx = Math.floor(Math.min(x0, x1) / UPC) - 1; cx <= Math.floor(Math.max(x0, x1) / UPC) + 1; cx++)
      for (let cz = Math.floor(Math.min(z0, z1) / UPC) - 1; cz <= Math.floor(Math.max(z0, z1) / UPC) + 1; cz++) {
        const v = upGrid.get(cx * 100003 + cz);
        if (v > m) m = v;
      }
    return m;
  };
  // Полоса между двумя смещениями от осевой. lift — над поверхностью.
  // Индекс перекрёстков: внутри их пятна тротуар и бордюр не строим,
  // иначе бордюры сходящихся улиц лезут друг на друга поперёк проезжей части.
  const jcell = 40, jmap = new Map();
  for (const j of world.junctions || []) {
    const R = j.r + 2.5;
    for (let cx = Math.floor((j.x - R) / jcell); cx <= Math.floor((j.x + R) / jcell); cx++)
      for (let cz = Math.floor((j.z - R) / jcell); cz <= Math.floor((j.z + R) / jcell); cz++) {
        const k = cx * 100003 + cz;
        let a = jmap.get(k); if (!a) jmap.set(k, a = []);
        a.push(j);
      }
  }
  // Тротуар должен обрываться у угла квартала, а не заезжать на перекрёсток:
  // сходящиеся полосы там наползают друг на друга бледными клиньями.
  // Вынос точки за выпуклый контур: контур выпуклый, поэтому хватает максимума
  // по рёбрам. Обход в данных приведён к положительной площади, наружная
  // нормаль ребра (ex,ez) — это (ez,-ex).
  const polyOut = (p, x, z) => {
    const n = p.length / 2;
    let far = -1e9;
    for (let i = 0; i < n; i++) {
      const k = (i + 1) % n;
      const ax = p[i * 2], az = p[i * 2 + 1];
      const ex = p[k * 2] - ax, ez = p[k * 2 + 1] - az;
      const L = Math.hypot(ex, ez) || 1;
      const d = ((x - ax) * ez - (z - az) * ex) / L;
      if (d > far) far = d;
    }
    return far;
  };
  const inJunction = (x, z, extra = 0) => {
    const a = jmap.get(Math.floor(x / jcell) * 100003 + Math.floor(z / jcell));
    if (!a) return false;
    for (const j of a) {
      const R = j.r + 1.6 + extra;
      if ((x - j.x) ** 2 + (z - j.z) ** 2 >= R * R) continue;
      // У склеенного кластера r — радиус описанной окружности, и по нему
      // тротуары исчезали на полквартала. Меряем по самому пятну.
      if (j.poly && polyOut(j.poly, x, z) > 1.6 + extra) continue;
      return true;
    }
    return false;
  };
  const midSkip = (pts, i, extra = 0) =>
    inJunction((pts[i * 2] + pts[i * 2 + 2]) / 2, (pts[i * 2 + 1] + pts[i * 2 + 3]) / 2, extra);

  // Полосность в атрибут: модуль — сколько полос, минус — движение в обе
  // стороны (по осевой ляжет двойная сплошная). Ноль — размечать нечего.
  // Без явного числа шейдер делил ширину на 3.5 и на девятиметровой улице
  // без тега lanes рисовал три полосы вместо двух.
  // Целая часть — число полос, десятая — флаги (1 автобусная справа,
  // 2 парковочная слева, 3 обе), знак — минус у двустороннего движения.
  const laneEnc = r => {
    let n = r.l | 0;
    if (!n) n = r.w >= 11 ? 4 : r.w >= 5.2 ? 2 : 0;
    if (n < 2 || r.c > 2) return 0;
    const v = n + ((r.bus ? 1 : 0) + (r.pk ? 2 : 0)) * 0.1;
    return r.ow ? v : -v;
  };

  // offA/offB — либо число (постоянная полуширина), либо массив на вершину:
  // проезжая часть ужимается там, где под неё лезет соседняя улица.
  // ГДЕ АСФАЛЬТ УЖЕ ЛЁГ. Каждый треугольник полотна, фартука и подложки
  // отмечаем в растре поля (клетка 1 м). В конце всё, что по полю — асфальт,
  // а по этому растру не накрыто ничем, заливаем подложкой: какой бы ни была
  // причина дыры (обрезка по приоритету, перекрученный пролёт), до земли
  // сквозь перекрёсток больше не светит.
  let asphCov = null;
  const markTri = (ch, a, b, c) => {
    if (!asphCov) return;
    const P = ch.P, ox = FLD.ox, oz = FLD.oz, W = FLD.W;
    const x1 = P[a * 3] - ox, z1 = P[a * 3 + 2] - oz, x2 = P[b * 3] - ox, z2 = P[b * 3 + 2] - oz;
    const x3 = P[c * 3] - ox, z3 = P[c * 3 + 2] - oz;
    const i0 = Math.max(0, Math.floor(Math.min(x1, x2, x3))), i1 = Math.min(W - 1, Math.ceil(Math.max(x1, x2, x3)));
    const j0 = Math.max(0, Math.floor(Math.min(z1, z2, z3))), j1 = Math.min(FLD.H - 1, Math.ceil(Math.max(z1, z2, z3)));
    if ((i1 - i0) * (j1 - j0) > 4000) return;           // вырожденный гигант — не наш случай
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++)
        if (inTri(i + 0.5, j + 0.5, x1, z1, x2, z2, x3, z3)) asphCov[j * W + i] = 1;
  };
  // jn — расстояние от вершины до пятна ближайшего настоящего перекрёстка:
  // по нему шейдер обрывает разметку ровной чертой поперёк улицы.
  const strip = (ch, pts, mt, offA, offB, lift, cls, uW, skipJ, skipFn, own = -1, lanes = 0, surf = 0, hFn = H, jn = null) => {
    const col = ROAD_COLORS[cls];
    const start = ch.base;
    // Какие пролёты рисуются — считаем ОДИН раз: проверка дорогая, а нужна
    // трижды. Вершину, не нужную ни одному пролёту, на рельеф не сажаем
    // (длинная улица через полгорода приходит в каждый свой квадрат, а
    // рисуется в нём куском), — её потом выкинет сжатие геометрии.
    const drawSp = new Uint8Array(Math.max(1, mt.n - 1));
    for (let i = 0; i < mt.n - 1; i++)
      drawSp[i] = (skipJ && midSkip(pts, i, 5.5)) || (skipFn && skipFn(i)) ? 0 : 1;
    const needV = i => (i > 0 && drawSp[i - 1]) || (i < mt.n - 1 && drawSp[i]);
    // Колонок вершин поперёк: у проезжей части от 8.5 м — три (и ось). Полотно
    // шириной 10 м одним четырёхугольником ложилось хордой на 4–12 см мимо
    // поверхности на перекрёстке (там она седловая), и колесо, переезжая с
    // полотна на полотно, ловило ступеньку; ось вдвое уменьшает пролёт.
    const CC = cls <= 3 && uW >= 8.5 ? 3 : 2;
    const aArr = typeof offA === 'number' ? null : offA;
    const bArr = typeof offB === 'number' ? null : offB;
    for (let i = 0; i < mt.n; i++) {
      // Асфальту разнотон по вершинам не даём: у каждой улицы он свой, и на
      // стыке двух полотен яркость прыгала ступенькой — тот самый «шов».
      // Фактуру асфальта шейдер считает по мировым координатам, одну на всех.
      const t = cls <= 3 ? 1 : 0.94 + 0.12 * (((i * 2654435761) >>> 8) & 255) / 255;
      const oA = aArr ? aArr[i] : offA, oB = bArr ? bArr[i] : offB;
      for (let s = 0; s < CC; s++) {
        if (jn) { ch.JI.push(ch.base + i * CC + s); ch.JV.push(jn[i]); }
        const off = oA + (oB - oA) * s / (CC - 1);
        const x = pts[i * 2] + mt.NX[i] * off * mt.S[i];
        const z = pts[i * 2 + 1] + mt.NZ[i] * off * mt.S[i];
        ch.P.push(x, needV(i) ? hFn(x, z) + lift : 0, z);
        ch.C.push(enc(col[0] * t), enc(col[1] * t), enc(col[2] * t));
        // Разметку шейдер кладёт по aRoad.x·ширина/2 = метры от осевой. У
        // ужатого полотна кромка уже не на ±полуширине, и постоянные ∓1
        // утащили бы осевую линию в геометрический центр обрезка. Пишем
        // настоящую долю — разметка остаётся привязанной к оси улицы.
        ch.R.push(aArr ? off / (uW * 0.5) : -1 + 2 * s / (CC - 1), mt.D[i], uW, lanes);
        // Дробные 0.4 в классе — «до перекрёстка меньше 14 м». По ПДД пунктир
        // 1.5 перед перекрёстком сменяется сплошной 1.1: перестраиваться там
        // нельзя. Все пороги классов стоят на .5, поэтому добавка безопасна.
        // Признак «у перекрёстка» лежал в дробной части класса. Атрибут
        // ИНТЕРПОЛИРУЕТСЯ вдоль пролёта: если хоть один конец помечен, порог
        // срабатывал почти на всей длине — и разделители по всему городу
        // становились сплошными, пунктира не оставалось вовсе. Убрано.
        ch.K.push(cls);
        ch.O.push(own); ch.S.push(surf);
      }
    }
    // ПРОВИСАНИЕ ПОЛОТНА. Пролёт дороги — плоский четырёхугольник по четырём
    // углам, а земля под ним склеена из треугольников сетки в девять метров.
    // Отметки в самих углах совпадают, но между ними поверхность выпуклая — на
    // гребне она выходит ВЫШЕ хорды, и полотно тонет в грунте на десятки
    // сантиметров: подъёма в 14 см на это не хватает.
    // Щупаем землю посреди пролёта и приподнимаем его углы ровно настолько,
    // чтобы асфальт остался сверху. Там, где рельеф вдавлен коридором (и под
    // мостом, где hFn — палуба), поправка выходит нулевой сама собой.
    const lo = start * 3 + 1;                       // индекс Y первой вершины
    const at = k => ch.P[lo + k * 3];
    const px = k => ch.P[lo + k * 3 - 1], pz = k => ch.P[lo + k * 3 + 1];
    const up = new Float32Array(mt.n);
    for (let i = 0; i < mt.n - 1; i++) {
      if (!drawSp[i]) continue;
      const a = i * CC, b = a + CC - 1, c = a + CC, d = c + CC - 1;
      let need = 0;
      // Пять проб: середины четырёх сторон и центр. Углы не щупаем — они и
      // так стоят ровно на земле. u — вдоль пролёта, v — поперёк полотна.
      for (const [u, v] of [[0, 0.5], [1, 0.5], [0.5, 0], [0.5, 1], [0.5, 0.5]]) {
        const ax = px(a) + (px(c) - px(a)) * u, az = pz(a) + (pz(c) - pz(a)) * u;
        const bx = px(b) + (px(d) - px(b)) * u, bz = pz(b) + (pz(d) - pz(b)) * u;
        const ay = at(a) + (at(c) - at(a)) * u, by = at(b) + (at(d) - at(b)) * u;
        const mx = ax + (bx - ax) * v, mz = az + (bz - az) * v, my = ay + (by - ay) * v;
        // Мерим по НАРИСОВАННОЙ земле, а не по профилю езды. Профиль у
        // перекрёстка на склоне вогнутый, и хорда пролёта поперёк улицы
        // проходила под ним — полотно приподнималось на 30–40 см там, где
        // земля его и не протыкала, и у узла вставала ступень, на которой
        // подбрасывало машину (колёса теперь едут по самому полотну).
        const g = GROUND(mx, mz) + 0.03 - my;
        if (g > need) need = g;
      }
      // Потолок поправки. На замерах хватало 30 см, и больше нам не нужно:
      // одиночный выброс высоты не должен вздёргивать полотно над бордюром
      // (тот живёт на своих 17 см и о поправке не знает).
      if (need > 0.3) need = 0.3;
      if (need > 0.005) {
        if (need > up[i]) up[i] = need;
        if (need > up[i + 1]) up[i + 1] = need;
      }
    }
    // Поправка — не горб. Колёса едут по самому полотну, и вздёрнутые на
    // 40 см углы одного пролёта давали на перекрёстке вспученный асфальт
    // (Большая Морская у −410, 517: 45 см на 10 м, отрыв колёс на 80 км/ч),
    // а соседняя улица в том же узле лежала ниже — ступень. Теперь:
    //   * на проезжей части у перекрёстка и 12 м подхода поправки нет: все полотна
    //     узла лежат на одной поверхности коридора, без ступеней между ними;
    //   * в остальном подъём раскатывается пандусом не круче 3 см на вершину
    //     (шаг 6 м) — изгиб профиля вместо горба.
    if (cls <= 3) for (let i = 0; i < mt.n; i++)
      if (up[i] && (junctionDist(px(i * CC), pz(i * CC)) < 12 || levelWeight(px(i * CC), pz(i * CC)) > 0.5)) up[i] = 0;
    // В центре дороги первичны (roadlevels.js): земля под полотном и на 13 м
    // вокруг лежит ровно на его профиле, протыкать его нечему, — и поправка
    // там только поднимала полотно на 30 см над колеёй соседнего (Красный
    // спуск у 160, 1550: ступенька 29 см).
    // Пешеходная дорожка на проезжей части не поднимается вовсе: поднятая
    // поправкой, она вылезала поверх асфальта светлой полосой поперёк улицы
    // (пл. Лазарева у «Мир Бургера»).
    if (cls === 4 && FLD) for (let i = 0; i < mt.n; i++)
      if (up[i] && (FLD.at(px(i * CC), pz(i * CC)) < 0.6 || FLD.at(px(i * CC + CC - 1), pz(i * CC + CC - 1)) < 0.6)) up[i] = 0;
    // пандус — только у проезжей части: дорожке и тротуару он поднимал
    // над газоном десяток вершин вокруг одной приподнятой
    for (let pass = 0; pass < (cls <= 3 ? 2 : 0); pass++) {
      for (let i = 1; i < mt.n; i++) if (up[i - 1] - 0.03 > up[i]) up[i] = up[i - 1] - 0.03;
      for (let i = mt.n - 2; i >= 0; i--) if (up[i + 1] - 0.03 > up[i]) up[i] = up[i + 1] - 0.03;
    }
    if (cls <= 3) for (let i = 0; i < mt.n; i++)
      if (up[i] && (junctionDist(px(i * CC), pz(i * CC)) < 12 || levelWeight(px(i * CC), pz(i * CC)) > 0.5)) up[i] = 0;
    for (let i = 0; i < mt.n; i++) {
      if (!up[i]) continue;
      for (let q = 0; q < CC; q++) ch.P[lo + (i * CC + q) * 3] += up[i];
      // запоминаем, где полотно приподнято: зебра должна лечь ВЫШЕ него
      if (cls <= 3) for (const v of [i * CC, i * CC + CC - 1]) {
        const k = Math.floor(px(v) / UPC) * 100003 + Math.floor(pz(v) / UPC);
        if (!(upGrid.get(k) >= up[i])) upGrid.set(k, up[i]);
      }
    }

    // Обход даёт нормаль вверх ТОЛЬКО при таком порядке: offA левее offB,
    // а нормаль митры смотрит против оси. Обратный порядок кладёт полосу лицом в землю.
    for (let i = 0; i < mt.n - 1; i++) {
      if (!drawSp[i]) continue;
      for (let q = 0; q < CC - 1; q++) {
        const a = start + i * CC + q, b = a + 1, c = a + CC, d = c + 1;
        ch.I.push(a, b, c, b, d, c);
        if (cls <= 3) { markTri(ch, a, b, c); markTri(ch, b, d, c); }
      }
    }
    ch.base += mt.n * CC;
  };

  // Вертикальная грань бордюра вдоль одного смещения.
  // oneSide — только грань, смотрящую на проезжую часть (кромка из поля
  // ориентирована: нормаль митры смотрит от асфальта). Вторая грань там
  // всегда спрятана под тротуаром или газоном и только удваивала треугольники.
  const kerb = (ch, pts, mt, off, yLow, yHigh, skipFn, own = -1, skipJ = true, oneSide = false) => {
    const col = ROAD_COLORS[6];
    const start = ch.base;
    for (let i = 0; i < mt.n; i++) {
      const x = pts[i * 2] + mt.NX[i] * off * mt.S[i];
      const z = pts[i * 2 + 1] + mt.NZ[i] * off * mt.S[i];
      const g = H(x, z);
      for (const y of [g + yLow, g + yHigh]) {
        ch.P.push(x, y, z);
        ch.C.push(enc(col[0]), enc(col[1]), enc(col[2]));
        ch.R.push(0, mt.D[i], 0.3, 0); ch.S.push(0);
        ch.K.push(6); ch.O.push(own);
      }
    }
    for (let i = 0; i < mt.n - 1; i++) {
      if (skipJ && midSkip(pts, i, 4.0)) continue;
      if (skipFn && skipFn(i)) continue;
      const a = start + i * 2, b = a + 1, c = a + 2, d = a + 3;
      ch.I.push(a, b, c, b, d, c);
      if (!oneSide) ch.I.push(a, c, b, b, c, d);   // двусторонний: бордюр видно с обеих сторон
    }
    ch.base += mt.n * 2;
  };

  const SIDEWALK = 2.6, KERB_H = 0.17, ROAD_Y = 0.14;
  const drawn = new Set();
  let zebras = 0, holes = 0;

  // ПОЛОТНО — ПРИНАДЛЕЖНОСТЬ КВАДРАТА, А НЕ УЛИЦЫ. Раньше улица строилась
  // целиком тем чанком, который приехал первым, — и та её часть, что лежит в
  // соседнем квадрате, садилась на высоты, которых там ещё не было (грубая
  // сетка в 54 м). На склонах полотно уходило под землю на полметра, и
  // сквозь улицу светил грунт — по всему городу, у каждого шва чанков. Теперь
  // каждый чанк кладёт пролёты ВСЕХ своих улиц, но только в своих границах,
  // где рельеф под ним гарантированно детальный. Заодно приоритеты обрезки,
  // растр покрытия и кромка видят всю сеть, а не только «свои» улицы.
  const ctx0 = world.roads.ctx || null;
  const ORPH = !!(ctx0 && ctx0.orphan);       // пачка сирот: полотно уже лежит у соседей
  const ctx = ORPH ? null : ctx0;
  const ALL = ctx ? ctx.all : world.roads;
  const inSq = (x, z) => !ctx || (x >= ctx.x0 && x < ctx.x1 && z >= ctx.z0 && z < ctx.z1);
  const spanIn = (p, i) => inSq((p[i * 2] + p[i * 2 + 2]) / 2, (p[i * 2 + 1] + p[i * 2 + 3]) / 2);
  // Вершина, которая может понадобиться пролёту этого квадрата: длинная улица
  // через полгорода приходит в каждый свой чанк, и резать её по всей длине
  // в каждом — пустая работа. Запас 8 м больше шага ресемплинга (6 м).
  const vNear = (x, z) => !ctx || (x > ctx.x0 - 8 && x < ctx.x1 + 8 && z > ctx.z0 - 8 && z < ctx.z1 + 8);
  const wIdx = new Map(world.roads.map((r, i) => [r, i]));

  // Единый растр покрытия: им же пользуются расстановка деревьев и аудит.
  yield;
  const COV = world.__coverage || (world.__coverage = buildCoverage(ctx ? { meta: world.meta, roads: ALL } : world));
  yield;
  const cellOf = COV.cell;
  const cover = COV.owner, coverW = COV.width;
  const covered = COV.share;
  const onOtherRoad = (x, z, own) => COV.onOther(x, z, own);
  // ------------------------------------------------- кромка проезжей части
  // Поле расстояний до асфальта по ВСЕМ улицам квадрата (см. roadfield.js).
  // Из него берутся: линия бордюра, тротуары, островки, обрезка торцов
  // полотен и ширина зебр. Контекст приезжает от менеджера чанков; у пачки
  // сирот его нет — там перекладывается только само полотно, а кромка
  // остаётся той, что построил хозяин квадрата.
  // Мост и тоннель в поле только у самых концов — там они стыкуются с
  // улицей на земле, и кромка должна их обойти, а не перегородить проезд.
  // Концы цепочки — узлы, куда приходит ровно один мостовой (тоннельный) кусок.
  const decoEnds = [];
  {
    const key = (x, z) => Math.round(x * 2) + ',' + Math.round(z * 2);
    const deg = new Map(), at = new Map();
    for (const r of ALL) {
      if (!(r.br || r.tn) || r.pts.length < 4) continue;
      const p = r.pts, n = p.length / 2;
      for (const e of [0, n - 1]) {
        const k = (r.br ? 'b' : 't') + key(p[e * 2], p[e * 2 + 1]);
        deg.set(k, (deg.get(k) || 0) + 1); at.set(k, [p[e * 2], p[e * 2 + 1]]);
      }
    }
    for (const [k, d] of deg) if (d === 1) decoEnds.push(at.get(k));
  }
  const keepPiece = (r, x, z) => {
    if (!r.br && !r.tn) return true;
    for (const [ex, ez] of decoEnds) if ((ex - x) ** 2 + (ez - z) ** 2 < 144) return true;
    return false;
  };
  const FLD = ctx ? yield* roadFieldGen(ALL, ctx.x0, ctx.z0, ctx.x1, ctx.z1, keepPiece) : null;
  if (FLD) asphCov = new Uint8Array(FLD.W * FLD.H);
  // «НА АСФАЛЬТЕ ЛИ ТОЧКА» для деревьев, фонарей, мебели и дворов — по той же
  // кромке, по которой асфальт РИСУЕТСЯ. Растр покрытия знает только полосу
  // полуширины вокруг осевой, а нарисованный асфальт шире: скругления углов,
  // перекрёстки, подложки. Куст, прошедший проверку растра, стоял посреди
  // Большой Морской (−260, 1182). Запас 0.3 м за бордюр — сам камень тоже.
  if (FLD && !COV.__fld) {
    const byAxis = COV.onRoad;
    // За пределами поля (сад или сквер соседнего квадрата, чьи посадки
    // достались этой сборке) — растр с запасом: щупаем ещё на 1.3 м вокруг.
    const wide = (x, z) => byAxis(x, z) || byAxis(x + 1.3, z) || byAxis(x - 1.3, z)
                        || byAxis(x, z + 1.3) || byAxis(x, z - 1.3);
    COV.onRoad = (x, z) => FLD.has(x, z) ? FLD.at(x, z) < 0.3 : wide(x, z);
    COV.__fld = true;
  }
  yield;

  // Осевые всех проезжих улиц в сетке: «какая улица под этой точкой и куда
  // она идёт». Нужна зебрам (встать поперёк СВОЕЙ улицы) и перекрёсткам
  // (сосчитать, сколько улиц в них сходится).
  const SGC = 32, sgrid = new Map();
  ALL.forEach((r, ri) => {
    if (r.c > 3 || r.w < 5 || r.pts.length < 4) return;
    const p = r.pts;
    for (let k = 0; k < p.length / 2 - 1; k++) {
      const cx0 = Math.floor((Math.min(p[k * 2], p[k * 2 + 2]) - 6) / SGC);
      const cx1 = Math.floor((Math.max(p[k * 2], p[k * 2 + 2]) + 6) / SGC);
      const cz0 = Math.floor((Math.min(p[k * 2 + 1], p[k * 2 + 3]) - 6) / SGC);
      const cz1 = Math.floor((Math.max(p[k * 2 + 1], p[k * 2 + 3]) + 6) / SGC);
      for (let cx = cx0; cx <= cx1; cx++)
        for (let cz = cz0; cz <= cz1; cz++) {
          const key = cx * 100003 + cz;
          let a = sgrid.get(key); if (!a) sgrid.set(key, a = []);
          a.push(ri, k);
        }
    }
  });
  // Ближайший пролёт осевой в пределах maxD (не больше 6 м — запас сетки).
  const nearestSeg = (x, z, maxD) => {
    const a = sgrid.get(Math.floor(x / SGC) * 100003 + Math.floor(z / SGC));
    if (!a) return null;
    let best = null, bd = maxD;
    for (let q = 0; q < a.length; q += 2) {
      const r = ALL[a[q]], k = a[q + 1], p = r.pts;
      const ax = p[k * 2], az = p[k * 2 + 1];
      const dx = p[k * 2 + 2] - ax, dz = p[k * 2 + 3] - az;
      const L2 = dx * dx + dz * dz;
      if (L2 < 0.01) continue;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
      const qx = ax + dx * t, qz = az + dz * t;
      const d = Math.hypot(x - qx, z - qz);
      if (d < bd) { bd = d; const L = Math.sqrt(L2); best = { r, k, t, qx, qz, ux: dx / L, uz: dz / L, d }; }
    }
    return best;
  };
  // Направление осевой на расстоянии dist (со знаком) вдоль улицы от пролёта k.
  const headingAt = (p, k, t, dist) => {
    const n = p.length / 2;
    let left = Math.abs(dist), i = k;
    const dir = dist < 0 ? -1 : 1;
    let segL = Math.hypot(p[i * 2 + 2] - p[i * 2], p[i * 2 + 3] - p[i * 2 + 1]);
    left -= dir > 0 ? segL * (1 - t) : segL * t;
    while (left > 0 && i + dir >= 0 && i + dir < n - 1) {
      i += dir;
      segL = Math.hypot(p[i * 2 + 2] - p[i * 2], p[i * 2 + 3] - p[i * 2 + 1]);
      left -= segL;
    }
    const L = segL || 1;
    return [(p[i * 2 + 2] - p[i * 2]) / L, (p[i * 2 + 3] - p[i * 2 + 1]) / L];
  };

  // КОЛЬЦА. Тега «круговое движение» в данных нет, а знать надо: через
  // круговую проезжую часть пешеходов не пускают, и зебра на ней — ошибка.
  // Кольцо узнаём по форме: цепочка односторонних улиц, которая, если ехать
  // по ходу, возвращается в свою же точку короче чем за 260 м. Квартал с
  // односторонним объездом длиннее, разворотная петля на бульваре — короче,
  // и зебра на ней тоже ни к чему.
  const ring = new Set();
  {
    const key = (x, z) => Math.round(x * 2) * 200003 + Math.round(z * 2);
    const from = new Map(), len = new Map();
    ALL.forEach((r, ri) => {
      if (!r.ow || r.c > 3 || r.pts.length < 4) return;
      const p = r.pts, k = key(p[0], p[1]);
      (from.get(k) || from.set(k, []).get(k)).push(ri);
      let L = 0;
      for (let i = 0; i < p.length - 2; i += 2) L += Math.hypot(p[i + 2] - p[i], p[i + 3] - p[i + 1]);
      len.set(ri, L);
    });
    const path = [];
    const go = (ri, home, left, depth) => {
      const p = ALL[ri].pts;
      left -= len.get(ri);
      if (left < 0 || depth > 12) return false;
      path.push(ri);
      const k = key(p[p.length - 2], p[p.length - 1]);
      if (k === home) return true;
      for (const nx of from.get(k) || []) if (!path.includes(nx) && go(nx, home, left, depth + 1)) return true;
      path.pop();
      return false;
    };
    for (const ri of len.keys()) {
      if (ring.has(ri)) continue;
      path.length = 0;
      const p = ALL[ri].pts;
      if (go(ri, key(p[0], p[1]), 260, 0)) for (const q of path) ring.add(ALL[q]);
    }
  }

  // НАСТОЯЩИЕ перекрёстки — где сходятся хотя бы три «руки» проезжих улиц.
  // В данных узлом считается и выезд со двора, и перед каждым таким выездом
  // рвать осевую незачем. Улица, проходящая насквозь, даёт две руки,
  // упирающаяся торцом — одну; проезды уже пяти метров не в счёт.
  const jreal = new Map(), JRC = 40;
  for (const j of world.junctions || []) {
    const seenR = new Set();
    let arms = 0;
    const R = j.r + 2;
    for (let cx = Math.floor((j.x - R) / SGC); cx <= Math.floor((j.x + R) / SGC); cx++)
      for (let cz = Math.floor((j.z - R) / SGC); cz <= Math.floor((j.z + R) / SGC); cz++) {
        const a = sgrid.get(cx * 100003 + cz);
        if (!a) continue;
        for (let q = 0; q < a.length; q += 2) {
          if (seenR.has(a[q])) continue;
          const p = ALL[a[q]].pts, n = p.length / 2;
          // ближайшая к центру узла точка всей осевой
          let bd = 1e9, bx = 0, bz = 0;
          for (let k = 0; k < n - 1; k++) {
            const ax = p[k * 2], az = p[k * 2 + 1];
            const dx = p[k * 2 + 2] - ax, dz = p[k * 2 + 3] - az;
            const L2 = dx * dx + dz * dz || 1;
            const t = Math.max(0, Math.min(1, ((j.x - ax) * dx + (j.z - az) * dz) / L2));
            const d = Math.hypot(j.x - ax - dx * t, j.z - az - dz * t);
            if (d < bd) { bd = d; bx = ax + dx * t; bz = az + dz * t; }
          }
          if (j.poly ? polyOut(j.poly, bx, bz) > 0.5 : bd > j.r) continue;
          seenR.add(a[q]);
          const end = Math.hypot(bx - p[0], bz - p[1]) < 2.5
                   || Math.hypot(bx - p[n * 2 - 2], bz - p[n * 2 - 1]) < 2.5;
          arms += end ? 1 : 2;
        }
      }
    if (arms < 3) continue;
    const RR = j.r + 18;
    for (let cx = Math.floor((j.x - RR) / JRC); cx <= Math.floor((j.x + RR) / JRC); cx++)
      for (let cz = Math.floor((j.z - RR) / JRC); cz <= Math.floor((j.z + RR) / JRC); cz++) {
        const key = cx * 100003 + cz;
        let a = jreal.get(key); if (!a) jreal.set(key, a = []);
        a.push(j);
      }
  }
  // Сколько метров от точки до пятна ближайшего настоящего перекрёстка
  // (отрицательное — внутри). Для выпуклого пятна вынос за рёбра вдоль улицы
  // растёт линейно, так что между вершинами полотна он интерполируется честно
  // и разметка обрывается ровно поперёк.
  const JFAR = 60;
  const junctionDist = (x, z) => {
    const a = jreal.get(Math.floor(x / JRC) * 100003 + Math.floor(z / JRC));
    let best = JFAR;
    if (a) for (const j of a) {
      const d = j.poly ? polyOut(j.poly, x, z) : Math.hypot(x - j.x, z - j.z) - j.r;
      if (d < best) best = d;
    }
    return best;
  };
  const nearestJunction = (x, z) => {
    const a = jreal.get(Math.floor(x / JRC) * 100003 + Math.floor(z / JRC));
    let best = null, bd = 1e9;
    if (a) for (const j of a) {
      const d = j.poly ? polyOut(j.poly, x, z) : Math.hypot(x - j.x, z - j.z) - j.r;
      if (d < bd) { bd = d; best = j; }
    }
    return bd < 16 ? best : null;
  };
  yield;

  // ---------------------------------------------------- обрезка полотен
  // Осевые линии OSM у крупных улиц идут парой (по проезжей части в каждую
  // сторону), и полотна перекрывались лентой в один-три метра. Прежний фильтр
  // умел только одно — выбросить пролёт целиком, а это либо нахлёст, либо
  // проплешина. Считаем каждой вершине СВОЮ полуширину: полотно ужимается
  // ровно до кромки соседа, у которого приоритет выше.
  //
  // Приоритет — ширина, при равной ширине порядок в данных. Тот же ключ, что
  // у растра покрытия: если бы двое уступали друг другу, на их общем месте
  // осталась бы дыра. Мосты и тоннели не участвуют вовсе — они идут над (или
  // под) чужим полотном, и обрезать там нечего.
  // На столько заезжаем под соседа: шов вместо щели. Меньше — меньше остаточного
  // нахлёста, но точность двоичного поиска ниже 8 см опускать нельзя, иначе
  // вместо шва получится волосяная щель.
  const LANE_EPS = 0.15;
  // Концы проезжих улиц по узлам: кто ещё сходится в этой точке.
  const endKey = (x, z) => Math.round(x * 2) * 200003 + Math.round(z * 2);
  const ends = new Map();
  for (const r of ALL) {
    if (r.c > 3 || r.pts.length < 4 || r.br || r.tn) continue;
    const p = r.pts, n = p.length / 2;
    for (const e of [0, n - 1]) {
      const k = endKey(p[e * 2], p[e * 2 + 1]);
      let a = ends.get(k); if (!a) ends.set(k, a = []);
      a.push({ r, e });
    }
  }
  // Продолжение: в узле ровно одна другая проезжая улица той же ширины,
  // и идёт она почти по прямой (поворот меньше 35°). Возвращает нормаль
  // соседа в этом узле, развёрнутую по ходу нашей улицы, или null.
  const contOf = (r, end) => {
    const p = r.pts, n = p.length / 2, e = end ? n - 1 : 0;
    const a = ends.get(endKey(p[e * 2], p[e * 2 + 1]));
    if (!a || a.length !== 2) return null;
    const o = a[0].r === r ? a[1] : a[0];
    if (o.r === r || Math.abs(o.r.w - r.w) > 0.6) return null;
    // своё направление «в узел» и соседское «из узла»
    const i1 = end ? e - 1 : 1;
    let dx = end ? p[e * 2] - p[i1 * 2] : p[0] - p[2], dz = end ? p[e * 2 + 1] - p[i1 * 2 + 1] : p[1] - p[3];
    const q = o.r.pts, m = q.length / 2;
    let ox = o.e === 0 ? q[2] - q[0] : q[(m - 2) * 2] - q[(m - 1) * 2];
    let oz = o.e === 0 ? q[3] - q[1] : q[(m - 2) * 2 + 1] - q[(m - 1) * 2 + 1];
    const l1 = Math.hypot(dx, dz), l2 = Math.hypot(ox, oz);
    if (l1 < 0.1 || l2 < 0.1) return null;
    dx /= l1; dz /= l1; ox /= l2; oz /= l2;
    if (dx * ox + dz * oz < 0.82) return null;           // круче 35°
    // Нормаль митры у нас — (−dz, dx) по ходу точек. У начала улицы «в узел»
    // смотрит против хода, поэтому соседское направление тоже разворачиваем.
    const sx = end ? ox : -ox, sz = end ? oz : -oz;
    return { nx: -sz, nz: sx };
  };
  const lanes = [];        // индекс в массиве = приоритет, меньше — главнее
  yield;
  const laneOf = new Map();
  for (const o of ALL.map((r, i) => ({ r, i }))
       .filter(o => o.r.c <= 3 && o.r.pts.length >= 4 && !o.r.br && !o.r.tn
                    // Уступать можно только тому, кто и правда ляжет на землю.
                    // Улица, целиком накрытая более широкой, не рисуется вовсе —
                    // и обрезанный по ней сосед оставлял проплешину.
                    && (covered.get(o.i) ?? 0) <= 0.75)
       .sort((a, b2) => b2.r.w - a.r.w || a.i - b2.i)) {
    const hw = o.r.w / 2;
    // ПРОДОЛЖЕНИЕ УЛИЦЫ. Вытяжка концов на полширины закрывает щель на
    // перекрёстке, но там, где улица просто продолжается другим куском OSM
    // (сменилось покрытие, полосность, имя), она клала асфальт на пять метров
    // поверх брусчатки соседа с косым торцом — «кривой переход» на Шмидта
    // (−479, 1772). На таком стыке концы не вытягиваем, а режем оба куска
    // по общей биссектрисе: шов прямой, без щели и без нахлёста.
    const cA = contOf(o.r, 0), cB = contOf(o.r, 1);
    const e0 = extendEnds(o.r.pts, Math.min(hw, 5));
    if (cA) { e0[0] = o.r.pts[0]; e0[1] = o.r.pts[1]; }
    if (cB) { const k = o.r.pts.length; e0[k - 2] = o.r.pts[k - 2]; e0[k - 1] = o.r.pts[k - 1]; }
    // У перекрёстка вершины полотна чаще — через 3 м. Полотна узла
    // накладываются друг на друга, и хорды шестиметровых пролётов разных улиц
    // по выпуклой поверхности расходились на 5–12 см: колесо, переезжая с
    // одного на другое, получало ступеньку (пл. Лазарева у «Мир Бургера»).
    // Дворовый проезд коридора не имеет и лежит прямо на сетке рельефа с её
    // изломами через 9 м и стенками площадок домов — ему тоже 3 м.
    const ext = densify(e0, (ax, az, bx, bz) => o.r.c >= 3 || junctionDist((ax + bx) / 2, (az + bz) / 2) < 14 ? 3 : 6);
    // Митры считаем здесь и переиспользуем при отрисовке: сосед должен мерить
    // по ТОМУ ЖЕ полотну, которое потом ляжет на землю.
    const mt0 = miters(ext);
    for (const [c, vi] of [[cA, 0], [cB, mt0.n - 1]]) {
      if (!c) continue;
      // нормаль конца — средняя своей и соседской, длина — по углу между ними
      let nx = mt0.NX[vi] + c.nx, nz = mt0.NZ[vi] + c.nz;
      const l = Math.hypot(nx, nz);
      if (l < 1e-3) continue;
      mt0.NX[vi] = nx / l; mt0.NZ[vi] = nz / l; mt0.S[vi] = Math.min(1.6, 2 / l);
    }
    const lane = { hw, ext, mt: mt0, rank: lanes.length, cA: !!cA, cB: !!cB };
    laneOf.set(o.i, lane);
    lanes.push(lane);
  }
  // Сегменты кладём в сетку УЖЕ раздутыми на свою полуширину: тогда запрос
  // точки смотрит ровно одну ячейку, без обхода соседних.
  const LG = 20, lgrid = new Map();
  for (let li = 0; li < lanes.length; li++) {
    // 1.6 — потолок множителя митры: на изломе полотно раздувает именно во столько
    const p = lanes[li].ext, pad = lanes[li].hw * 1.6 + 0.5;
    for (let s = 0; s < p.length / 2 - 1; s++) {
      const cx0 = Math.floor((Math.min(p[s * 2], p[s * 2 + 2]) - pad) / LG);
      const cx1 = Math.floor((Math.max(p[s * 2], p[s * 2 + 2]) + pad) / LG);
      const cz0 = Math.floor((Math.min(p[s * 2 + 1], p[s * 2 + 3]) - pad) / LG);
      const cz1 = Math.floor((Math.max(p[s * 2 + 1], p[s * 2 + 3]) + pad) / LG);
      for (let cx = cx0; cx <= cx1; cx++)
        for (let cz = cz0; cz <= cz1; cz++) {
          const k = cx * 100003 + cz;
          let a = lgrid.get(k); if (!a) lgrid.set(k, a = []);
          a.push(li, s);
        }
    }
  }
  // Точка глубже чем на LANE_EPS внутри полотна более приоритетной улицы?
  // Меряем по НАСТОЯЩЕМУ квадру пролёта, а не по «трубе радиусом в полуширину»:
  // на изломе митра раздувает полотно до 1.6 полуширины, и труба недобирала
  // как раз углы кварталов — там и оставался весь остаток нахлёста.
  // Точка внутри треугольника: знаки трёх векторных произведений совпадают.
  // Обход квадра может оказаться любым, поэтому годятся оба знака.
  const inTri = (x, z, ax, az, bx, bz, cx, cz) => {
    const d1 = (x - bx) * (az - bz) - (ax - bx) * (z - bz);
    const d2 = (x - cx) * (bz - cz) - (bx - cx) * (z - cz);
    const d3 = (x - ax) * (cz - az) - (cx - ax) * (z - az);
    return !(((d1 < 0) || (d2 < 0) || (d3 < 0)) && ((d1 > 0) || (d2 > 0) || (d3 > 0)));
  };
  const blocked = (x, z, rank) => {
    const a = lgrid.get(Math.floor(x / LG) * 100003 + Math.floor(z / LG));
    if (!a) return false;
    for (let t = 0; t < a.length; t += 2) {
      const li = a[t];
      if (li >= rank) continue;                 // равный или младший не помеха
      const L = lanes[li], s = a[t + 1], p = L.ext, mt = L.mt;
      const w0 = L.hw - LANE_EPS;               // ужимаем на допуск шва
      if (w0 <= 0) continue;
      const o0 = w0 * mt.S[s], o1 = w0 * mt.S[s + 1];
      const ax = p[s * 2] + mt.NX[s] * o0, az = p[s * 2 + 1] + mt.NZ[s] * o0;
      const bx = p[s * 2] - mt.NX[s] * o0, bz = p[s * 2 + 1] - mt.NZ[s] * o0;
      const cx = p[s * 2 + 2] + mt.NX[s + 1] * o1, cz = p[s * 2 + 3] + mt.NZ[s + 1] * o1;
      const dx = p[s * 2 + 2] - mt.NX[s + 1] * o1, dz = p[s * 2 + 3] - mt.NZ[s + 1] * o1;
      if (inTri(x, z, ax, az, bx, bz, cx, cz) || inTri(x, z, bx, bz, dx, dz, cx, cz)) return true;
      // Кругляш в узлах — запас поверх квадра. Он нужен по двум причинам.
      // Первая: на изломе круче ~51° множитель митры упирается в потолок и
      // внешний угол полотна срезается. Вторая важнее: уступаем мы ПО ВЕРШИНАМ,
      // а между ними у полосы прямая кромка — и если в пролёт вдаётся угол
      // чужого полотна, вершины его обходят, а кромка режет насквозь. Запас в
      // полуширину вокруг узлов эти углы и закрывает.
      // На стыке-продолжении кругляша нет: там шов прямой по биссектрисе, и
      // круг выгрызал бы из соседа полукруглую выемку до земли.
      const w2 = w0 * w0;
      if (!(s === 0 && L.cA) && (x - p[s * 2]) ** 2 + (z - p[s * 2 + 1]) ** 2 < w2) return true;
      if (!(s + 2 === p.length / 2 && L.cB) && (x - p[s * 2 + 2]) ** 2 + (z - p[s * 2 + 3]) ** 2 < w2) return true;
    }
    return false;
  };
  // Полуширины на каждую вершину: слева (отрицательные) и справа.
  // Контуры домов. В OSM 0.51% проб по проезжей части попадают ВНУТРЬ здания:
  // гаражи и частные дома вплотную к проезду, а кое-где просто неточный обвод.
  // Полотно там резать обязательно — иначе асфальт въезжает в стену и дом
  // выглядит «съехавшим на дорогу».
  yield;
  const bldGrid = new PolyGrid(world.buildings.map(b => ({ poly: b.poly, holes: b.holes })), 70);
  yield;
  const inBuilding = (x, z) => !!bldGrid.find(x, z);

  // Полуширина, ужатая контуром дома. Мосты и тоннели не трогаем: там дорога
  // законно проходит сквозь габарит.
  const clipByBuildings = (pts, mt, hw) => {
    const offL = new Float64Array(mt.n), offR = new Float64Array(mt.n);
    let touched = false;
    for (let i = 0; i < mt.n; i++) {
      const bx = pts[i * 2], bz = pts[i * 2 + 1];
      if (!vNear(bx, bz)) { offL[i] = -hw; offR[i] = hw; continue; }
      const nx = mt.NX[i] * mt.S[i], nz = mt.NZ[i] * mt.S[i];
      for (const sg of [1, -1]) {
        let v = hw;
        if (inBuilding(bx + nx * sg * hw, bz + nz * sg * hw)) {
          touched = true;
          if (inBuilding(bx, bz)) v = hw;        // ось внутри дома — обвод врёт, не режем
          else {
            let lo = 0, hi = hw;
            for (let k = 0; k < 8; k++) {
              const m = (lo + hi) / 2;
              if (inBuilding(bx + nx * sg * m, bz + nz * sg * m)) hi = m; else lo = m;
            }
            v = Math.max(0.6, lo - 0.15);        // 15 см зазора до стены
          }
        }
        if (sg > 0) offR[i] = v; else offL[i] = -v;
      }
    }
    return touched ? { offL, offR } : null;
  };

  // МОСТЫ. Полотно с тегом bridge рисовалось прямо по рельефу, и путепровод
  // у вокзала лежал на дне выемки, а моя надстройка висела над ним отдельно —
  // «мост не соединён с дорогой». Собираем связные цепочки мостовых участков
  // (в OSM один путепровод разбит на семь кусков), берём отметки земли на
  // ДВУХ КРАЯХ всей цепочки и натягиваем полотно между ними прямой. Тогда
  // середина висит над выемкой, а концы садятся на обычную улицу.
  const bridgeH = new Map();          // индекс дороги -> функция высоты
  const bridgeDecks = [];             // для опор и перил
  {
    const key = (x, z) => Math.round(x * 4) + ',' + Math.round(z * 4);
    const idxs = [];
    ALL.forEach((r, i) => { if (r.br && r.c <= 3 && r.pts.length >= 4) idxs.push(i); });
    const node = new Map();
    for (const i of idxs) {
      const p = ALL[i].pts;
      for (const k of [key(p[0], p[1]), key(p[p.length - 2], p[p.length - 1])])
        (node.get(k) || node.set(k, []).get(k)).push(i);
    }
    const seen = new Set();
    for (const start of idxs) {
      if (seen.has(start)) continue;
      const chain = [], stack = [start];
      seen.add(start);
      while (stack.length) {
        const i = stack.pop(); chain.push(i);
        const p = ALL[i].pts;
        for (const k of [key(p[0], p[1]), key(p[p.length - 2], p[p.length - 1])])
          for (const j of node.get(k) || []) if (!seen.has(j)) { seen.add(j); stack.push(j); }
      }
      // концы цепочки — узлы, куда приходит ровно один участок
      const deg = new Map();
      for (const i of chain) {
        const p = ALL[i].pts;
        for (const k of [key(p[0], p[1]), key(p[p.length - 2], p[p.length - 1])])
          deg.set(k, (deg.get(k) || 0) + 1);
      }
      const ends = [];
      for (const i of chain) {
        const p = ALL[i].pts;
        for (const [k, x, z] of [[key(p[0], p[1]), p[0], p[1]],
                                 [key(p[p.length - 2], p[p.length - 1]), p[p.length - 2], p[p.length - 1]]])
          if (deg.get(k) === 1) ends.push([x, z]);
      }
      // если концов не нашлось (кольцо) — берём самые далёкие вершины
      let A = ends[0], B = ends[ends.length - 1];
      if (!A || !B || ends.length < 2) {
        const all = [];
        for (const i of chain) { const p = ALL[i].pts;
          for (let k = 0; k < p.length; k += 2) all.push([p[k], p[k + 1]]); }
        let bd = -1;
        for (let a = 0; a < all.length; a++) for (let b = a + 1; b < all.length; b++) {
          const d = Math.hypot(all[a][0] - all[b][0], all[a][1] - all[b][1]);
          if (d > bd) { bd = d; A = all[a]; B = all[b]; }
        }
      }
      if (!A || !B) continue;
      const yA = H(A[0], A[1]), yB = H(B[0], B[1]);
      const vx = B[0] - A[0], vz = B[1] - A[1];
      const vv = vx * vx + vz * vz || 1;
      const fn = (x, z) => {
        const t = Math.max(0, Math.min(1, ((x - A[0]) * vx + (z - A[1]) * vz) / vv));
        return yA + (yB - yA) * t;
      };
      // Мост с отметками графа (roadlevels.js) — полотно по ним: решатель
      // натянул его между устоями вместе с подходами, без излома на торцах.
      // Прямая между отметками концов давала перелом там, где подход идёт
      // на уклоне (трасса у 51466, 11403).
      const fnOf = r => (bridgeLevelAt(r.id, r.pts[0], r.pts[1]) === null ? fn
        : (x, z) => { const h = bridgeLevelAt(r.id, x, z); return h === null ? fn(x, z) : h; });
      for (const i of chain) bridgeH.set(i, fnOf(ALL[i]));
      // полотно для опор и перил
      for (const i of chain) {
        const r = ALL[i];
        bridgeDecks.push({ pts: r.pts, w: r.w, hFn: bridgeH.get(i), own: wIdx.has(r) });
      }
    }
  }
  yield;
  // ПОЛОТНО МОСТА В ПРОФИЛЬ ВОЖДЕНИЯ. Коридор строится только по дорогам,
  // лежащим на грунте (мосты там явно пропущены), поэтому машина ехала по дну
  // выемки в трёх метрах ПОД мостом — «проваливаюсь под него». Отдаём в
  // terrain отдельное поле: где есть мостовое полотно, колёса опираются на
  // него, а у самых торцов вес плавно уходит к обычной улице.
  {
    const CELL = 8;
    const grid = new Map();
    const segs = [];
    for (const d of bridgeDecks) {
      const p2 = d.pts;
      for (let i = 0; i < p2.length - 2; i += 2) {
        const ax = p2[i], az = p2[i + 1], bx = p2[i + 2], bz = p2[i + 3];
        const vx = bx - ax, vz = bz - az;
        const vv = vx * vx + vz * vz;
        if (vv < 0.04) continue;
        const seg = { ax, az, vx, vz, vv, hw: d.w / 2 + 1.0, hFn: d.hFn };
        const id = segs.push(seg) - 1;
        const r = seg.hw + CELL;
        const x0 = Math.min(ax, bx) - r, x1 = Math.max(ax, bx) + r;
        const z0 = Math.min(az, bz) - r, z1 = Math.max(az, bz) + r;
        for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++)
          for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
            const k = cx * 100003 + cz;
            (grid.get(k) || grid.set(k, []).get(k)).push(id);
          }
      }
    }
    terrain.setDeck(segs.length ? (x, z) => {
      const a = grid.get(Math.floor(x / CELL) * 100003 + Math.floor(z / CELL));
      if (!a) return null;
      // Берём САМОЕ ВЫСОКОЕ полотно, но вес — лучший среди тех, что на этой же
      // высоте. Иначе точка посреди широкого моста получала вес от соседнего
      // узкого пролёта, попавшего на неё краем, и колёса проваливались.
      let bestH = -Infinity, bestW = 0;
      for (const id of a) {
        const sg = segs[id];
        const t = Math.max(0, Math.min(1, ((x - sg.ax) * sg.vx + (z - sg.az) * sg.vz) / sg.vv));
        const px = sg.ax + sg.vx * t, pz = sg.az + sg.vz * t;
        const d = Math.hypot(x - px, z - pz);
        if (d > sg.hw) continue;
        const w = Math.min(1, (sg.hw - d) / 1.2);
        const h = sg.hFn(px, pz);
        if (h > bestH + 0.5) { bestH = h; bestW = w; }
        else if (h > bestH - 0.5) { if (h > bestH) bestH = h; if (w > bestW) bestW = w; }
      }
      return bestH === -Infinity ? null : { h: bestH, w: bestW };
    } : null);
  }

  // отдаём наружу: опоры и перила строит модуль сооружений
  // Опоры и перила — только мостам, доставшимся этой сборке: улицы теперь
  // видны всем квадратам, а сооружение должно встать один раз.
  world.__bridges = bridgeDecks.filter(d => d.own).map(d => {
    const p = d.pts, out = [];
    for (let i = 0; i < p.length; i += 2) out.push(p[i], p[i + 1], d.hFn(p[i], p[i + 1]), H(p[i], p[i + 1]));
    return { w: d.w, pts: out };
  });

  const clipOffsets = (pts, mt, hw, rank) => {
    const offL = new Float64Array(mt.n), offR = new Float64Array(mt.n);
    for (let i = 0; i < mt.n; i++) {
      const bx = pts[i * 2], bz = pts[i * 2 + 1];
      if (!vNear(bx, bz)) { offL[i] = -hw; offR[i] = hw; continue; }
      const nx = mt.NX[i] * mt.S[i], nz = mt.NZ[i] * mt.S[i];
      let axis = -1;                            // ленивая проверка самой осевой
      for (const sg of [1, -1]) {
        let v = hw;
        if (blocked(bx + nx * sg * hw, bz + nz * sg * hw, rank)) {
          if (axis < 0) axis = blocked(bx, bz, rank) ? 1 : 0;
          if (axis) v = 0;                      // и ось под соседом — полотна тут нет
          else {
            let lo = 0, hi = hw;
            for (let k = 0; k < 8; k++) {
              const m = (lo + hi) / 2;
              if (blocked(bx + nx * sg * m, bz + nz * sg * m, rank)) hi = m; else lo = m;
            }
            v = lo;
          }
        }
        if (sg > 0) offR[i] = v; else offL[i] = -v;
      }
    }
    return { offL, offR };
  };

  // Тротуары в растр покрытия не входят, а пешеходные дорожки OSM идут ровно
  // по ним — и ложились сверху вторым слоем светлой плитки. Заводим второй
  // растр: проезжие улицы рисуем первыми и попутно метим свои тротуары,
  // пешеходные дорожки идут следом и уступают.
  const walkOwn = new Int32Array(COV.W * COV.H).fill(-1);
  const claimWalk = (x, z, own) => { const c = cellOf(x, z); if (c >= 0 && walkOwn[c] < 0) walkOwn[c] = own; };
  // С направлением пролёта (dx, dz) чужая дорожка мешает, только если идёт
  // ВДОЛЬ (до 25°): поперечная или косая развилка аллей выбивала пролёт целиком, а
  // сама закрывала лишь свою ширину — дыра до газона по обе стороны от неё
  // (Комсомольский парк; раньше её прятал второй слой аллей places).
  const onWalkOther = (x, z, own, dx = 0, dz = 0) => {
    const c = cellOf(x, z);
    if (!(c >= 0 && walkOwn[c] >= 0 && walkOwn[c] !== own)) return false;
    const dl = Math.hypot(dx, dz), o = ALL[walkOwn[c]];
    if (dl < 1e-6 || !o) return true;
    const q = o.pts;
    let bd = Infinity, cos = 1;
    for (let t = 0; t + 3 < q.length; t += 2) {
      const ax = q[t], az = q[t + 1], vx = q[t + 2] - ax, vz = q[t + 3] - az, L2 = vx * vx + vz * vz;
      if (L2 < 1e-9) continue;
      let u = ((x - ax) * vx + (z - az) * vz) / L2;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const d = Math.hypot(ax + vx * u - x, az + vz * u - z);
      if (d < bd) { bd = d; cos = Math.abs(vx * dx + vz * dz) / (Math.sqrt(L2) * dl); }
    }
    return cos > 0.9;
  };
  // Тротуар теперь идёт вдоль общей кромки, и «занято ли место тротуаром»
  // отвечает само поле: полоса от бордюра наружу у улицы, которой он положен.
  // Тротуар положен любой городской улице (класс до 2), даже узкой в данных:
  // узкие улочки старого центра без него читались грунтовками. Проезду
  // (класс 3) — только широкому, дворовые выезды обходимся без него.
  const walkRoad = ri => { const r = ALL[ri]; return !!r && !r.br && !r.tn && (r.c <= 2 ? r.w >= 3 : r.c === 3 && r.w >= 6); };
  const onSidewalk = (x, z) => {
    if (!FLD) return false;
    const f = FLD.at(x, z);
    return f > KERB_ISO && f < SIDEWALK + KERB_ISO + 0.3 && walkRoad(FLD.own(x, z));
  };
  // Парковка и площадка АЗС лежат под дорогой на 9.5 см, дорожка — на
  // 11.5: два сантиметра, и издали они дрались за глубину пятнами (Термы
  // Наутико, −1218, 1456). Пролёт дорожки поперёк парковки не рисуем — там
  // и так асфальт.
  const LOT = new PolyGrid((world.areas || []).filter(a => (a.k === 'parking' || a.k === 'fuel' || a.k === 'market') && a.poly && a.poly.length >= 6)
    .map(a => ({ poly: a.poly })), 80);
  const onLot = (x, z) => !!LOT.find(x, z);
  const order = (ORPH ? [] : ALL).map((r, i) => ({ r, i })).sort((a, b2) => (a.r.c > 3 ? 1 : 0) - (b2.r.c > 3 ? 1 : 0));

  let work = 0;
  for (const { r, i: ri } of order) {
    // Работа — по вершинам в окне квадрата: длинная улица снаружи почти бесплатна.
    let wv = 0;
    for (let i = 0; i < r.pts.length; i += 2) if (vNear(r.pts[i], r.pts[i + 1])) wv++;
    if ((work += 2 + wv) > 700) { work = 0; yield; }
    if (r.pts.length < 4) continue;
    // узкий проезд, целиком лежащий на широкой улице, не рисуем вовсе
    if (r.c <= 3 && r.w >= 4 && (covered.get(ri) ?? 0) > 0.75) continue;
    if (wIdx.has(r)) drawn.add(wIdx.get(r));
    const ch = bucket(r.pts[0], r.pts[1]);
    const hw = r.w / 2;
    const lane = laneOf.get(ri);
    // Дорожка идёт по земле, а у земли треугольники в 9 м: на шаге 6 м хорда
    // дорожки на склоне то висела над перегибом, то уходила под него. 4 м.
    const ext = lane ? lane.ext : densify(extendEnds(r.pts, Math.min(hw, 5)), r.c === 4 ? 4 : 6);
    // широкая улица лежит чуть выше узкой: там, где полотна всё же перекрылись,
    // это снимает мерцание вместо случайной борьбы за глубину
    // Пешеходная дорожка — НИЖЕ асфальта и тротуара: где она в данных
    // пересекает проезжую часть (а это каждый переход, и не всегда в своём
    // чанке, где мы можем это проверить), асфальт её просто накрывает, а не
    // она ложится светлой полосой поперёк улицы. Над землёй и газоном видна.
    // Мост: палуба сооружения (structures) стоит на ~17 см над осью — на
    // сантиметр выше полотна, и с высоты асфальт тонул в ней рваными
    // светлыми пятнами. Кладём полотно моста на 12 см выше.
    const lift = r.c === 4 ? ROAD_Y - 0.025 : ROAD_Y + r.w * 0.0016 + (r.br ? 0.12 : 0);
    const mtR = lane ? lane.mt : miters(ext);
    // Проезжей части режем полуширину по вершинам; пешеходной дорожке — нет,
    // она в приоритетах не участвует и уступает целыми пролётами.
    let cut = lane ? clipOffsets(ext, mtR, hw, lane.rank) : null;
    // Поверх приоритета улиц режем ещё и по домам: берём наименьшую из двух
    // полуширин на каждой вершине.
    if (r.c <= 3 && !r.br && !r.tn) {
      const bc = clipByBuildings(ext, mtR, hw);
      if (bc) {
        if (!cut) cut = bc;
        else for (let i = 0; i < mtR.n; i++) {
          if (bc.offR[i] < cut.offR[i]) cut.offR[i] = bc.offR[i];
          if (bc.offL[i] > cut.offL[i]) cut.offL[i] = bc.offL[i];
        }
      }
    }
    // Торец полотна — прямоугольник, вытянутый за узел на полуширину, и на
    // косом примыкании его угол вылезал за дальнюю кромку главной улицы
    // рубленым клином. Ужимаем каждую вершину до расчётной кромки асфальта:
    // всё, что за ней, — не дорога. За пределами решётки не режем: там поля нет.
    if (FLD && r.c <= 3 && !r.br && !r.tn) {
      if (!cut) cut = { offL: new Float64Array(mtR.n).fill(-hw), offR: new Float64Array(mtR.n).fill(hw) };
      for (let i = 0; i < mtR.n; i++) {
        const bx = ext[i * 2], bz = ext[i * 2 + 1];
        if (!FLD.has(bx, bz) || !vNear(bx, bz)) continue;
        const nx = mtR.NX[i] * mtR.S[i], nz = mtR.NZ[i] * mtR.S[i];
        let axis = -1;
        for (const sg of [1, -1]) {
          let v = sg > 0 ? cut.offR[i] : -cut.offL[i];
          if (v <= 0 || FLD.at(bx + nx * sg * v, bz + nz * sg * v) <= 0.12) continue;
          if (axis < 0) axis = FLD.at(bx, bz) > 0.12 ? 1 : 0;
          if (axis) v = 0;
          else {
            let lo = 0, hi = v;
            for (let k = 0; k < 7; k++) {
              const m = (lo + hi) / 2;
              if (FLD.at(bx + nx * sg * m, bz + nz * sg * m) > 0.1) hi = m; else lo = m;
            }
            v = lo;
          }
          if (sg > 0) cut.offR[i] = v; else cut.offL[i] = -v;
        }
      }
    }
    // Разметке — расстояние до перекрёстка в каждой вершине осевой.
    const lanesR = laneEnc(r);
    let jn = null;
    if (lanesR && r.c <= 2) {
      jn = new Float32Array(mtR.n);
      // На кольце разметка не обрывается у каждого съезда — иначе её там нет
      // вовсе: съезды стоят через 20–40 м. Шейдеру метим кольцо добавкой
      // 1000, и он рвёт только наружную краевую линию напротив съезда.
      const rb = ring.has(r) ? 1000 : 0;
      for (let i = 0; i < mtR.n; i++) jn[i] = rb + junctionDist(ext[i * 2], ext[i * 2 + 1]);
    }
    // Пешеходная дорожка декоративна: под ней и так либо асфальт улицы, либо
    // плитка тротуара. Проверять одну середину пролёта было мало — шестиметровая
    // pedestrian ложилась на тротуар боками. Смотрим весь квад, и если задета
    // хоть одна проба — пролёт не рисуем. Дыр это не делает: дорожки в растр
    // покрытия не входят, а под снятым куском лежит то, что его перекрыло.
    let keep4 = null;
    if (r.c === 4) {
      keep4 = new Uint8Array(Math.max(1, mtR.n));
      const hq = Math.max(0.9, hw);
      for (let i = 0; i < mtR.n - 1; i++) {
        let hit = false;
        for (const s2 of [0, 0.5, 1]) {
          const bx = ext[i * 2] + (ext[i * 2 + 2] - ext[i * 2]) * s2;
          const bz = ext[i * 2 + 1] + (ext[i * 2 + 3] - ext[i * 2 + 1]) * s2;
          const nx = mtR.NX[i] + (mtR.NX[i + 1] - mtR.NX[i]) * s2;
          const nz = mtR.NZ[i] + (mtR.NZ[i + 1] - mtR.NZ[i]) * s2;
          const sc = mtR.S[i] + (mtR.S[i + 1] - mtR.S[i]) * s2;
          for (const t of [-1, -0.5, 0, 0.5, 1]) {
            const o = t * hq * sc;
            const qx = bx + nx * o, qz = bz + nz * o;
            if (onOtherRoad(qx, qz, ri) || onWalkOther(qx, qz, ri, ext[i * 2 + 2] - ext[i * 2], ext[i * 2 + 3] - ext[i * 2 + 1]) || onSidewalk(qx, qz) || onLot(qx, qz)
                || (FLD && FLD.at(qx, qz) < -0.4)) { hit = true; break; }
          }
          if (hit) break;
        }
        // ДУБЛЬ ТРОТУАРА. В OSM тротуар часто нарисован отдельной линией в паре
        // метров от проезжей части. Наш тротуар идёт от бордюра сам, и такая
        // дорожка ложилась рядом с ним второй лентой: узкой полосой у одного
        // конца и широкой у другого — «кривой переход» брусчатки на Шмидта у
        // костёла. Пролёт, идущий вдоль кромки и в пределах её тротуара с
        // запасом в свою ширину, не рисуем — его место занимает тротуар.
        if (!hit && FLD) {
          const mx = (ext[i * 2] + ext[i * 2 + 2]) / 2, mz = (ext[i * 2 + 1] + ext[i * 2 + 3]) / 2;
          const f = FLD.at(mx, mz);
          if (f < SIDEWALK + hq + 1.2 && walkRoad(FLD.own(mx, mz))) {
            const gx = FLD.at(mx + 0.5, mz) - FLD.at(mx - 0.5, mz), gz = FLD.at(mx, mz + 0.5) - FLD.at(mx, mz - 0.5);
            const dx = ext[i * 2 + 2] - ext[i * 2], dz = ext[i * 2 + 3] - ext[i * 2 + 1];
            const gl = Math.hypot(gx, gz), dl = Math.hypot(dx, dz);
            if (gl > 0.3 && dl > 0.1 && Math.abs(gx * dx + gz * dz) / (gl * dl) < 0.45) hit = true;
          }
        }
        keep4[i] = hit ? 0 : 1;
      }
    }
    strip(ch, ext, mtR, cut ? cut.offL : -hw, cut ? cut.offR : hw, lift, r.c, r.w, false, i => {
      if (!spanIn(ext, i)) return true;           // пролёт соседнего квадрата
      if (r.c === 4) return !keep4[i];
      if (r.c > 3 || r.w < 4) return false;
      // от обрезанного досуха пролёта остаются только вырожденные треугольники
      if (cut && cut.offR[i] - cut.offL[i] < 0.25 && cut.offR[i + 1] - cut.offL[i + 1] < 0.25) return true;
      // У полотна с приоритетом нахлёст уже срезан по вершинам, а выкидывать
      // пролёт целиком по растру покрытия нельзя: растр говорит «тут чужая
      // улица», но та улица сама могла быть ужата здесь кем-то третьим — и
      // посреди перекрёстка оставалась треугольная дыра до земли.
      if (lane && FLD) return false;
      // Мост идёт НАД чужим полотном: растр покрытия под ним занят улицей
      // внизу, и пролёты путепровода выкидывались — палуба зияла рваными
      // дырами ровно над каждой улицей, которую он перекрывает.
      if (r.br || r.tn) return false;
      const pts3 = [0.15, 0.5, 0.85].map(s2 => [
        ext[i * 2] + (ext[i * 2 + 2] - ext[i * 2]) * s2,
        ext[i * 2 + 1] + (ext[i * 2 + 3] - ext[i * 2 + 1]) * s2]);
      // Раньше требовалась именно БОЛЕЕ ШИРОКАЯ улица, и две равные по ширине
      // рисовались обе внахлёст. Растр уже решил, чья это земля, — этого хватает.
      for (const [bx, bz] of pts3) if (!onOtherRoad(bx, bz, ri)) return false;
      return true;      // кусок целиком на чужой проезжей части
    }, ri, lanesR, r.sf || 0, r.c === 4 && !r.br ? GROUND : (bridgeH.get(ri) || H), jn);
    if (r.c === 4) {
      // Дорожка метит свою полосу, чтобы параллельная соседка не легла сверху.
      // Метим ТОЛЬКО нарисованное: раньше снятый пролёт всё равно занимал
      // клетки и выбивал из них соседнюю дорожку — на месте обоих был газон.
      // Шаг вдоль был в целый пролёт (6 м) при клетке в 2 м — половина полосы
      // оставалась не помеченной, и нахлёст проходил насквозь.
      const w2 = Math.max(1.2, hw);
      for (let i = 0; i < mtR.n - 1; i++) {
        if (!keep4[i] || !spanIn(ext, i)) continue;
        const dx2 = ext[i * 2 + 2] - ext[i * 2], dz2 = ext[i * 2 + 3] - ext[i * 2 + 1];
        const l2 = Math.hypot(dx2, dz2) || 1;
        const steps = Math.max(1, Math.ceil(l2 / 1.2));
        for (let k = 0; k <= steps; k++) {
          const bx = ext[i * 2] + dx2 * k / steps, bz = ext[i * 2 + 1] + dz2 * k / steps;
          for (let o = -w2; o <= w2 + 1e-6; o += 0.7)
            claimWalk(bx + (-dz2 / l2) * o, bz + (dx2 / l2) * o, ri);
        }
      }
    }
  }
  // ------------------------------------------------ бордюр, тротуар, островки
  // Всё это строится вдоль ОДНОЙ линии — кромки асфальта из поля расстояний.
  // Линия замкнута вокруг квартала сама собой, поэтому тротуар огибает угол
  // без обрыва, а островок посреди площади получает бордюр по всему контуру.
  if (FLD) {
    yield;
    const chains = yield* traceContours(FLD, ctx.x0, ctx.z0, ctx.x1, ctx.z1, KERB_ISO);
    yield;
    const LAWN = [0.345, 0.431, 0.235];
    const greenGrid = new PolyGrid((world.green || []).filter(g => g.poly && g.poly.length >= 6).map(g => ({ poly: g.poly })), 80);
    const TOP = KERB_H + 0.03;
    // Заливка многоугольника с дроблением: крупный треугольник лёг бы хордой
    // поверх рельефа и утонул в нём посередине.
    const fillPoly = (ch, loop, lift, cls, col) => {
      const n = loop.length / 2;
      const v2 = [];
      for (let i = 0; i < n; i++) v2.push(new THREE.Vector2(loop[i * 2], loop[i * 2 + 1]));
      const tris = THREE.ShapeUtils.triangulateShape(v2, []);
      const idx = new Map();
      const vert = (x, z) => {
        const key = Math.round(x * 50) * 4000037 + Math.round(z * 50);
        let k = idx.get(key);
        if (k === undefined) {
          k = ch.base++;
          idx.set(key, k);
          ch.P.push(x, H(x, z) + lift, z);
          ch.C.push(enc(col[0]), enc(col[1]), enc(col[2]));
          // плитке — мировые метры: рисунок не зависит от того, как легли треугольники
          ch.R.push(x, z, 2, 0); ch.K.push(cls); ch.O.push(-1); ch.S.push(0);
        }
        return k;
      };
      const stack = [];
      for (const t of tris)
        stack.push([loop[t[0] * 2], loop[t[0] * 2 + 1], loop[t[1] * 2], loop[t[1] * 2 + 1], loop[t[2] * 2], loop[t[2] * 2 + 1]]);
      while (stack.length) {
        const q = stack.pop();
        const la = (q[2] - q[0]) ** 2 + (q[3] - q[1]) ** 2;
        const lb = (q[4] - q[2]) ** 2 + (q[5] - q[3]) ** 2;
        const lc = (q[0] - q[4]) ** 2 + (q[1] - q[5]) ** 2;
        const lm = Math.max(la, lb, lc);
        if (lm > 49) {
          // делим самую длинную сторону пополам
          const o = lm === la ? 0 : lm === lb ? 2 : 4;
          const ax = q[o], az = q[o + 1], bx = q[(o + 2) % 6], bz = q[(o + 3) % 6];
          const cx = q[(o + 4) % 6], cz = q[(o + 5) % 6];
          const mx = (ax + bx) / 2, mz = (az + bz) / 2;
          stack.push([ax, az, mx, mz, cx, cz], [mx, mz, bx, bz, cx, cz]);
          continue;
        }
        const up = (q[3] - q[1]) * (q[4] - q[0]) - (q[2] - q[0]) * (q[5] - q[1]) > 0;
        const a = vert(q[0], q[1]), b = vert(q[2], q[3]), c = vert(q[4], q[5]);
        if (up) ch.I.push(a, b, c); else ch.I.push(a, c, b);
      }
    };
    const insideAny = (loop, bb) => {
      for (const list of [world.buildings, world.areas])
        for (const o of list || []) {
          const q = o.poly;
          if (!q || q[0] < bb[0] || q[0] > bb[2] || q[1] < bb[1] || q[1] > bb[3]) continue;
          if (pointInPoly(q[0], q[1], loop)) return true;
        }
      return false;
    };

    let cwork = 0;
    for (const chn of chains) {
      if ((cwork += chn.pts.length) > 3000) { cwork = 0; yield; }
      let sp = simplifyChain(chn.pts, chn.closed);
      let n = sp.length / 2;
      if (n < 2 || (chn.closed && n < 3)) continue;
      let area = 0, per = 0;
      if (chn.closed) {
        for (let i = 0; i < n; i++) {
          const k = (i + 1) % n;
          area += sp[i * 2] * sp[k * 2 + 1] - sp[k * 2] * sp[i * 2 + 1];
          per += Math.hypot(sp[k * 2] - sp[i * 2], sp[k * 2 + 1] - sp[i * 2 + 1]);
        }
        area /= 2;
        if (per < 5) continue;                      // соринка растра
        // Шов замкнутой цепочки ставим в середину самой длинной стороны: там
        // кромка прямая, и нормали начала и конца совпадают.
        let bi = 0, bl = -1;
        for (let i = 0; i < n; i++) {
          const k = (i + 1) % n;
          const l = Math.hypot(sp[k * 2] - sp[i * 2], sp[k * 2 + 1] - sp[i * 2 + 1]);
          if (l > bl) { bl = l; bi = i; }
        }
        const k0 = (bi + 1) % n;
        const mx = (sp[bi * 2] + sp[k0 * 2]) / 2, mz = (sp[bi * 2 + 1] + sp[k0 * 2 + 1]) / 2;
        const rot = [mx, mz];
        for (let q = 0; q < n; q++) { const i = (k0 + q) % n; rot.push(sp[i * 2], sp[i * 2 + 1]); }
        rot.push(mx, mz);
        sp = rot; n = sp.length / 2;
      }
      // АСФАЛЬТОВЫЙ ФАРТУК. Полотно улицы — ломаная с вершинами через 6 м, а
      // бордюр — гладкая линия поля. На изгибе хорда полотна отходила от
      // бордюра, и между ними светила земля зубцами. Под всеми полотнами
      // вдоль каждой кромки кладём полосу асфальта шириной 1.6 м внутрь:
      // фактура мировая, и там, где она видна, шва нет.
      // Покрытие фартука — как у улицы, чья это кромка: у бетонки и
      // брусчатки асфальтовая полоса по краям читалась тёмной каймой.
      {
        const m = sp.length / 2;
        const sfOf = i => {
          const dx = sp[i * 2 + 2] - sp[i * 2], dz = sp[i * 2 + 3] - sp[i * 2 + 1];
          const L = Math.hypot(dx, dz) || 1;
          const r = ALL[FLD.own((sp[i * 2] + sp[i * 2 + 2]) / 2 + dz / L * 0.5, (sp[i * 2 + 1] + sp[i * 2 + 3]) / 2 - dx / L * 0.5)];
          return r ? r.sf || 0 : 0;
        };
        // На прямой полотно и так доходит до бордюра (его кромка — та же
        // прямая). Хорда отходит только на изгибе, а изгиб в упрощённой
        // кромке — это короткие стороны. Фартук кладём только там: по всей
        // длине кромок города он стоил треть всех треугольников дорог.
        const curvy = i => Math.hypot(sp[i * 2 + 2] - sp[i * 2], sp[i * 2 + 3] - sp[i * 2 + 1]) < 9;
        for (let i = 0; i < m - 1;) {
          if (!curvy(i)) { i++; continue; }
          const sf = sfOf(i);
          let j = i + 1;
          while (j < m - 1 && curvy(j) && sfOf(j) === sf) j++;
          const run = sp.slice(i * 2, j * 2 + 2);
          i = j;
          const dp2 = densify(run), mt2 = miters(dp2);
          strip(bucket(dp2[0], dp2[1]), dp2, mt2, -1.6, 0, ROAD_Y - 0.015, 1, 3.2, false, null, -1, 0, sf);
        }
      }
      // Чья это кромка: смотрим на полметра ВНУТРЬ асфальта от середины
      // стороны. Бордюр с тротуаром положены улице, а не дворовому проезду.
      const on = new Uint8Array(n - 1);
      let onLen = 0, allLen = 0;
      for (let i = 0; i < n - 1; i++) {
        const dx = sp[i * 2 + 2] - sp[i * 2], dz = sp[i * 2 + 3] - sp[i * 2 + 1];
        const L = Math.hypot(dx, dz) || 1;
        const mx = (sp[i * 2] + sp[i * 2 + 2]) / 2 + dz / L * 0.5;
        const mz = (sp[i * 2 + 1] + sp[i * 2 + 3]) / 2 - dx / L * 0.5;
        on[i] = walkRoad(FLD.own(mx, mz)) ? 1 : 0;
        allLen += L; if (on[i]) onLen += L;
      }
      if (!onLen) continue;

      // ОСТРОВОК: замкнутая кромка, внутри которой не асфальт, небольшая, без
      // домов и площадок, и вокруг — улицы, а не дворовые проезды. Центр
      // кольца, треугольник между съездами, разделитель у светофора. Раньше
      // это была та же голая земля, что на пустыре.
      // Щель тоньше метра между двумя почти касающимися полотнами — это не
      // островок, а недоразумение растра: заливаем асфальтом, без бордюра.
      if (chn.closed && area > 0 && 2 * area / per < 0.9) {
        fillPoly(bucket(sp[0], sp[1]), sp.slice(0, sp.length - 2), ROAD_Y - 0.015, 1, ROAD_COLORS[1]);
        continue;
      }
      if (chn.closed && area > 0 && area < 3500 && onLen > allLen * 0.7) {
        let bb = [1e9, 1e9, -1e9, -1e9];
        for (let i = 0; i < n; i++) {
          bb[0] = Math.min(bb[0], sp[i * 2]); bb[1] = Math.min(bb[1], sp[i * 2 + 1]);
          bb[2] = Math.max(bb[2], sp[i * 2]); bb[3] = Math.max(bb[3], sp[i * 2 + 1]);
        }
        if (!insideAny(sp, bb)) {
          const dpts = densify(sp);
          const mt = miters(dpts);
          const ch = bucket(dpts[0], dpts[1]);
          kerb(ch, dpts, mt, 0, ROAD_Y - 0.04, TOP, null, -1, false, true);
          // Как в натуре: островок-разделитель на въезде (до 300 м²) мощён
          // плиткой целиком, крупный — газон в каменной кромке, а центр
          // кольца ещё и обходит светлая дорожка в пару метров.
          // Зелень в данных (сквер, газон) важнее размера: такой островок —
          // газон, даже маленький. Иначе зелёный треугольник OSM мостился.
          let gx = 0, gz = 0;
          for (let i = 0; i < n - 1; i++) { gx += sp[i * 2]; gz += sp[i * 2 + 1]; }
          gx /= n - 1; gz /= n - 1;
          const greenIn = !!greenGrid.find(gx, gz) && pointInPoly(gx, gz, sp);
          const wide = (area > 300 || (greenIn && area > 25)) && 2 * area / per > 1.7;
          const BAND = !wide ? 0 : area > 1000 ? 1.8 : 0.32;
          // массивы смещений — чтобы шейдер получил метры от бордюра (камень по кромке)
          if (BAND > 1) strip(ch, dpts, mt, new Float64Array(mt.n), new Float64Array(mt.n).fill(BAND), TOP, 5, SIDEWALK, false, null);
          else if (wide) strip(ch, dpts, mt, 0, BAND, TOP, 6, 0.3, false, null);
          const inner = [];
          for (let i = 0; i < mt.n - 1; i++)
            inner.push(dpts[i * 2] + mt.NX[i] * mt.S[i] * BAND, dpts[i * 2 + 1] + mt.NZ[i] * mt.S[i] * BAND);
          // газон ниже пешеходных дорожек: аллеи через сквер видны поверх
          if (wide) fillPoly(ch, inner, ROAD_Y - 0.09, 9, LAWN);
          else fillPoly(ch, inner, TOP, 4, ROAD_COLORS[5]);
          continue;
        }
      }

      // Обычная кромка: режем на непрерывные участки, которым положен тротуар.
      for (let i = 0; i < n - 1;) {
        if (!on[i]) { i++; continue; }
        let j = i;
        while (j < n - 1 && on[j]) j++;
        const run = sp.slice(i * 2, j * 2 + 2);
        i = j;
        let rl = 0;
        for (let q = 0; q < run.length / 2 - 1; q++)
          rl += Math.hypot(run[q * 2 + 2] - run[q * 2], run[q * 2 + 3] - run[q * 2 + 1]);
        if (rl < 1.5) continue;
        const dpts = densify(run);
        const mt = miters(dpts);
        // Ширина тротуара в каждой вершине. Полные 2.6 м он получает, только
        // если есть куда: на узком разделителе встречные тротуары сходятся
        // посередине, а в стену дома полоса не заходит.
        const wd = new Float64Array(mt.n), zero = new Float64Array(mt.n);
        for (let q = 0; q < mt.n; q++) {
          const px = dpts[q * 2], pz = dpts[q * 2 + 1];
          const nx = mt.NX[q] * mt.S[q], nz = mt.NZ[q] * mt.S[q];
          let w = 0;
          // у узкой улочки и тротуар узкий — 1.7 м, как в старом центре
          const ow = ALL[FLD.own(px - nx * 0.6, pz - nz * 0.6)];
          const maxW = ow && ow.w < 5 ? 1.7 : SIDEWALK;
          for (let t = 0.4; t <= maxW + 1e-6; t += 0.44) {
            // поле в точке меньше, чем наш отступ, — значит, чужая кромка ближе своей
            if (FLD.at(px + nx * t, pz + nz * t) < t + KERB_ISO - 0.25) break;
            w = t;
          }
          while (w > 0.5 && (inBuilding(px + nx * w, pz + nz * w) || inBuilding(px + nx * w * 0.5, pz + nz * w * 0.5))) w -= 0.7;
          wd[q] = w > 0.5 ? w : 0;
        }
        // Ширина ступеньками по 0.44 м давала пилу по внешнему краю тротуара.
        // Сглаживаем, но не шире найденного: предел — чужая кромка или стена.
        for (let pass = 0; pass < 2; pass++)
          for (let q = 1; q < mt.n - 1; q++)
            if (wd[q] > 0) wd[q] = Math.min(wd[q], (wd[q - 1] + 2 * wd[q] + wd[q + 1]) / 4 + 0.05);
        const ch = bucket(dpts[0], dpts[1]);
        strip(ch, dpts, mt, zero, wd, TOP, 5, SIDEWALK, false, q => wd[q] < 0.1 && wd[q + 1] < 0.1);
        kerb(ch, dpts, mt, 0, ROAD_Y - 0.04, TOP, null, -1, false, true);
      }
    }
    yield;
  }

  // РЕЛЬСЫ. Подъём 5 см меньше ошибки триангуляции рельефа: сетка 8.67 м, и
  // земля протыкала полотно пути — 57 007 м² конфликта по замеру, худшее
  // место города. Поднимаем на ту же высоту, что и улицы, и кладём сверху
  // шпалы с двумя нитками рельса: полоса щебня одна была не похожа на путь.
  yield;
  for (const r of world.rail) {
    if (r.pts.length < 4) continue;
    const dp = densify(r.pts);
    const mt = miters(dp);
    const chR = bucket(r.pts[0], r.pts[1]);
    strip(chR, dp, mt, -1.9, 1.9, ROAD_Y + 0.02, 3, 3.8);          // балласт
    // шпалы поперёк, шаг 0.62 м
    for (let i = 0; i < mt.n - 1; i++) {
      const ax = dp[i * 2], az = dp[i * 2 + 1];
      const bx = dp[i * 2 + 2], bz = dp[i * 2 + 3];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 0.2) continue;
      const ux = (bx - ax) / L, uz = (bz - az) / L, nx = -uz, nz = ux;
      for (let t = 0; t < L; t += 0.62) {
        const px = ax + ux * t, pz = az + uz * t;
        const y = H(px, pz) + ROAD_Y + 0.045;
        const st = chR.base;
        for (const [su, sv] of [[-0.13, -1.35], [0.13, -1.35], [0.13, 1.35], [-0.13, 1.35]]) {
          chR.P.push(px + ux * su + nx * sv, y, pz + uz * su + nz * sv);
          chR.C.push(enc(0.204), enc(0.161), enc(0.118));
          chR.R.push(0, 0, 0.5, 0); chR.K.push(3); chR.O.push(-1); chR.S.push(0);
        }
        chR.I.push(st, st + 1, st + 2, st, st + 2, st + 3);
        chR.base += 4;
      }
      // две нитки рельса
      for (const sv of [-0.7175, 0.7175]) {
        const st = chR.base;
        for (const [qx, qz] of [[ax, az], [bx, bz]]) {
          for (const w2 of [-0.035, 0.035]) {
            chR.P.push(qx + nx * (sv + w2), H(qx, qz) + ROAD_Y + 0.085, qz + nz * (sv + w2));
            chR.C.push(enc(0.404), enc(0.376), enc(0.353));
            chR.R.push(0, 0, 0.5, 0); chR.K.push(3); chR.O.push(-1); chR.S.push(0);
          }
        }
        chR.I.push(st, st + 1, st + 2, st + 1, st + 3, st + 2);
        chR.base += 4;
      }
    }
  }

  // ПОДЛОЖКА ПЕРЕКРЁСТКА. Раньше это было «пятно»: выпуклая оболочка узла,
  // положенная ПОВЕРХ полотен. Оболочка шире самих улиц — её углы торчали
  // многоугольной заплатой на газон, а полотна, приподнятые поправкой на
  // провисание, протыкали её снизу обрывками своей разметки.
  // Теперь наоборот: полотна сверху, а под ними — веер, который только
  // закрывает возможную щель между торцами. Лучи веера упираются в кромку
  // асфальта, так что за бордюр он не выходит. Тон у него тот же, что у
  // полотна (один асфальт на всех), и там, где он виден, шва нет.
  // Рисует его тот квадрат, в котором лежит центр узла: перекрёстки
  // приезжают в каждый чанк, и на шве их было бы два.
  if (FLD) for (const j of world.junctions || []) {
    if (j.x < ctx.x0 || j.x >= ctx.x1 || j.z < ctx.z0 || j.z >= ctx.z1) continue;
    if (FLD.at(j.x, j.z) > -0.3) continue;              // центр не на асфальте
    const ch = bucket(j.x, j.z);
    const col = ROAD_COLORS[1];
    const start = ch.base;
    const SEG = 16, ring = [];
    let reach = 0;
    for (let k = 0; k < SEG; k++) {
      const a = k / SEG * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
      let rr = 0;
      for (let t = 0.7; t <= j.r + 1; t += 0.7) {
        const x = j.x + dx * t, z = j.z + dz * t;
        if (FLD.at(x, z) > -0.05) break;
        if (j.poly ? polyOut(j.poly, x, z) > 0 : t > j.r) break;
        rr = t;
      }
      if (rr > reach) reach = rr;
      ring.push([j.x + dx * rr, j.z + dz * rr]);
    }
    if (reach < 1.4) continue;
    const lift = ROAD_Y - 0.015;
    ch.P.push(j.x, H(j.x, j.z) + lift, j.z);
    ch.C.push(enc(col[0]), enc(col[1]), enc(col[2]));
    ch.R.push(0, 0, 6, 0); ch.K.push(1); ch.O.push(-1); ch.S.push(0);
    for (const [x, z] of ring) {
      ch.P.push(x, H(x, z) + lift, z);
      ch.C.push(enc(col[0]), enc(col[1]), enc(col[2]));
      ch.R.push(0, 0, 6, 0); ch.K.push(1); ch.O.push(-1); ch.S.push(0);
    }
    for (let k = 0; k < SEG; k++)
    { ch.I.push(start, start + 1 + (k + 1) % SEG, start + 1 + k);
      markTri(ch, start, start + 1 + (k + 1) % SEG, start + 1 + k); }
    ch.base += SEG + 1;
  }

  // Заливка дыр (см. asphCov). Клетка — дыра, если все четыре её угла по
  // полю на асфальте, а ни один треугольник её центр не накрыл. Подряд
  // идущие дыры строки сливаем в одну полосу и раздуваем на полметра —
  // под полотном это не видно, а щелей по краю не остаётся.
  if (FLD) {
    yield;
    const { F, W, ox, oz } = FLD;
    const i0 = ctx.x0 - ox, i1 = ctx.x1 - ox, j0 = ctx.z0 - oz, j1 = ctx.z1 - oz;
    const col = ROAD_COLORS[1], lift = ROAD_Y - 0.015;
    // Один проход по квадрату собирает затравки; дальше работаем только с
    // ними и с теми строками, где они есть, — полных проходов по миллиону
    // клеток было три, и заливка стоила дороже самого полотна.
    const hole = c => !asphCov[c] && F[c] < -0.2 && F[c + 1] < -0.2 && F[c + W] < -0.2 && F[c + W + 1] < -0.2;
    const seeds = [];
    for (let j = j0; j < j1; j++) {
      if ((j & 255) === 255) yield;
      for (let c = j * W + i0, ce = j * W + i1; c < ce; c++) if (hole(c)) seeds.push(c);
    }
    if (seeds.length) {
      // Клетку с накрытым центром треугольник мог задеть только краем: вокруг
      // найденной дыры прихватываем ещё по две клетки асфальта во все стороны.
      const hm = new Uint8Array(W * FLD.H);
      const rlo = new Int32Array(FLD.H).fill(1 << 30), rhi = new Int32Array(FLD.H).fill(-1);
      for (const c0 of seeds) {
        const i = c0 % W, j = (c0 / W) | 0;
        for (let dj = -2; dj <= 2; dj++)
          for (let di = -2; di <= 2; di++) {
            const ii = i + di, jj = j + dj;
            if (ii < i0 || jj < j0 || ii >= i1 || jj >= j1) continue;
            const c = jj * W + ii;
            if (hm[c] || !(F[c] < -0.05 && F[c + 1] < -0.05 && F[c + W] < -0.05 && F[c + W + 1] < -0.05)) continue;
            hm[c] = 1;
            if (ii < rlo[jj]) rlo[jj] = ii;
            if (ii > rhi[jj]) rhi[jj] = ii;
          }
      }
      for (let j = j0; j < j1; j++) {
        if (rhi[j] < 0) continue;
        for (let i = rlo[j]; i <= rhi[j]; i++) {
          if (!hm[j * W + i]) continue;
          let e = i;
          while (e + 1 <= rhi[j] && e - i < 40 && hm[j * W + e + 1]) e++;
          const xa = ox + i - 0.5, xb = ox + e + 1.5, za = oz + j - 0.5, zb = oz + j + 1.5;
          const ch = bucket(xa, za), st = ch.base;
          for (const [x, z] of [[xa, za], [xb, za], [xa, zb], [xb, zb]]) {
            ch.P.push(x, H(x, z) + lift, z);
            ch.C.push(enc(col[0]), enc(col[1]), enc(col[2]));
            ch.R.push(0, 0, 6, 0); ch.K.push(1); ch.O.push(-1); ch.S.push(0);
          }
          ch.I.push(st, st + 2, st + 1, st + 1, st + 2, st + 3);
          ch.base += 4;
          holes++;
          i = e;
        }
      }
    }
  }

  // Порядок высот (между соседними слоями не меньше 2 см):
  //   газон островка   ROAD_Y − 0.09           (0.050)
  //   пешеходная дорожка ROAD_Y − 0.025        (0.115) — над парковкой (0.095), под асфальтом
  //   подложки асфальта ROAD_Y − 0.015         (0.125) — узел, фартук, дыры
  //   полотно улицы    ROAD_Y + ширина*0.0016  (0.146 .. 0.162)
  //   зебра, стоп-линия ROAD_Y + 0.055         (0.195)
  //   тротуар, бордюр  KERB_H + 0.03           (0.200)

  // ЗЕБРЫ И СТОП-ЛИНИИ. Зебра в данных — точка и угол, снятый с того пролёта
  // OSM, где её поставил сборщик. Этого мало: угол брался с короткого
  // пролёта у самого узла, ширина — с тега, и зебра ложилась наискось,
  // вылезала на тротуар или повисала на островке. Теперь ищем улицу под
  // зеброй, ставим строго поперёк ЕЁ оси и тянем от бордюра до бордюра по
  // расчётной кромке асфальта.
  // Зебры — как и полотно: каждый квадрат кладёт те, что в его границах.
  for (const c of (ctx ? ctx.crossings : ORPH ? [] : world.crossings) || []) {
    if (!inSq(c.x, c.z)) continue;
    let ux = Math.sin(c.a), uz = Math.cos(c.a);        // вдоль улицы
    let x0 = c.x, z0 = c.z, half = c.w * 0.5, rd = null;
    const ns = nearestSeg(c.x, c.z, 5);
    if (ns) {
      rd = ns.r; ux = ns.ux; uz = ns.uz; x0 = ns.qx; z0 = ns.qz; half = rd.w * 0.5;
      if (ring.has(rd)) continue;                      // на кольце зебр не бывает
      // И на крутой дуге съезда тоже.
      // Меряем на ±6 м и до 40°: на 24 м и 30° выкидывались зебры на всех
      // подходах к кольцу — подход к нему всегда дугой, а сама зебра на прямой.
      const h0 = headingAt(rd.pts, ns.k, ns.t, -6), h1 = headingAt(rd.pts, ns.k, ns.t, 6);
      if (h0[0] * h1[0] + h0[1] * h1[1] < 0.766) continue;      // круче 40°
    }
    const nx = -uz, nz = ux;                            // поперёк
    let eL = 0, eR = 0;
    if (FLD && FLD.has(x0, z0)) {
      if (FLD.at(x0, z0) > KERB_ISO) continue;         // под зеброй нет асфальта
      for (let t = 0.2; t <= half + 1e-6; t += 0.2) {
        if (FLD.at(x0 - nx * t, z0 - nz * t) > KERB_ISO - 0.08) break; eL = t;
      }
      for (let t = 0.2; t <= half + 1e-6; t += 0.2) {
        if (FLD.at(x0 + nx * t, z0 + nz * t) > KERB_ISO - 0.08) break; eR = t;
      }
    } else {
      // вне решётки поля (улица ушла в соседний квадрат) — по растру покрытия
      const onAsp = (x, z) => { const k = cellOf(x, z); return k >= 0 && cover[k] >= 0; };
      if (!onAsp(x0, z0)) continue;
      for (let t = 0.1; t <= half; t += 0.25) { if (onAsp(x0 - nx * t, z0 - nz * t)) eL = t; else break; }
      for (let t = 0.1; t <= half; t += 0.25) { if (onAsp(x0 + nx * t, z0 + nz * t)) eR = t; else break; }
      eL = Math.max(0, eL - 0.12); eR = Math.max(0, eR - 0.12);
    }
    if (eL + eR < 3.2) continue;                        // обрубок — не переход
    const ch = bucket(x0, z0);
    const col = ROAD_COLORS[1];
    const hd = c.d / 2, W2 = eL + eR;
    // Прямоугольник поперёк улицы: вдоль от a0 до a1, поперёк от b0 до b1.
    const quad = (a0, a1, b0, b1, cls) => {
      const st = ch.base;
      const xa = x0 + ux * a0 + nx * b0, za = z0 + uz * a0 + nz * b0;
      const xb = x0 + ux * a1 + nx * b1, zb = z0 + uz * a1 + nz * b1;
      const xc = x0 + ux * a0 + nx * b1, zc = z0 + uz * a0 + nz * b1;
      const xd = x0 + ux * a1 + nx * b0, zd = z0 + uz * a1 + nz * b0;
      const lift2 = upNear(Math.min(xa, xb, xc, xd), Math.min(za, zb, zc, zd),
                           Math.max(xa, xb, xc, xd), Math.max(za, zb, zc, zd));
      for (const a of [a0, a1])
        for (const b of [b0, b1]) {
          const x = x0 + ux * a + nx * b, z = z0 + uz * a + nz * b;
          // Запас над САМЫМ высоким полотном города: 14 м * 0.0016 = 2.2 см,
          // кладём 5.5 см — иначе переход ныряет под широкий асфальт.
          ch.P.push(x, H(x, z) + ROAD_Y + 0.055 + lift2, z);
          ch.C.push(enc(col[0]), enc(col[1]), enc(col[2]));
          ch.R.push(b / (W2 * 0.5), a, W2, 0); ch.K.push(cls); ch.O.push(-1); ch.S.push(0);
        }
      ch.I.push(st, st + 1, st + 2, st + 1, st + 3, st + 2);
      ch.base += 4;
    };
    quad(-hd, hd, -eL, eR, 7);
    zebras++;
    // Стоп-линия — перед зеброй со стороны подъезжающих, на их половине
    // проезжей части, и только у пересечения проезжих улиц.
    const j = rd ? nearestJunction(x0, z0) : null;
    if (j && (j.mw || 0) >= 8 && rd.w >= 6) {
      const dj = (j.x - x0) * ux + (j.z - z0) * uz > 0 ? 1 : -1;   // к узлу — вдоль оси или против
      let b0 = 0, b1 = 0;
      if (rd.ow) { if (dj > 0) { b0 = -eL; b1 = eR; } }            // односторонняя: едут по ходу точек
      else if (dj > 0) { b0 = 0.15; b1 = eR; }                     // правая сторона по ходу к узлу
      else { b0 = -eL; b1 = -0.15; }
      if (b1 - b0 > 2) {
        const a = -dj * (hd + 1.0);
        quad(a - 0.2, a + 0.2, b0, b1, 8);
      }
    }
  }

  // «УСТУПИ ДОРОГУ» на въездах в кольцо: поперечная линия зубцами (1.13)
  // там, где улица упирается в круговую проезжую часть. Ставим у самой
  // кромки кольца, на полосе въезжающих.
  if (FLD) {
    const ringNear = (x, z) => {
      const a = sgrid.get(Math.floor(x / SGC) * 100003 + Math.floor(z / SGC));
      let best = 1e9, bw = 0;
      if (a) for (let q = 0; q < a.length; q += 2) {
        const r = ALL[a[q]];
        if (!ring.has(r)) continue;
        const p = r.pts, k = a[q + 1];
        const ax = p[k * 2], az = p[k * 2 + 1], dx = p[k * 2 + 2] - ax, dz = p[k * 2 + 3] - az;
        const L2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
        const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
        if (d - r.w / 2 < best) { best = d - r.w / 2; bw = r.w; }
      }
      return best;
    };
    for (const r of ALL) {
      if (r.c > 3 || r.w < 5 || r.pts.length < 4 || ring.has(r) || r.br || r.tn) continue;
      const p = r.pts, n = p.length / 2;
      for (const end of [n - 1, 0]) {
        if (r.ow && end === 0) continue;                 // односторонняя въезжает концом
        const ex = p[end * 2], ez = p[end * 2 + 1];
        if (ex < ctx.x0 || ex >= ctx.x1 || ez < ctx.z0 || ez >= ctx.z1) continue;
        if (ringNear(ex, ez) > 1.0) continue;
        // идём от конца назад, пока не выйдем за кромку кольца на 0.9 м
        const dir = end === 0 ? 1 : -1;
        let px = ex, pz = ez, ux = 0, uz = 0, ok = false, run = 0;
        for (let i = end; i + dir >= 0 && i + dir < n && run < 30; i += dir) {
          const qx = p[(i + dir) * 2], qz = p[(i + dir) * 2 + 1];
          const L = Math.hypot(qx - p[i * 2], qz - p[i * 2 + 1]);
          if (L < 0.1) continue;
          ux = (p[i * 2] - qx) / L; uz = (p[i * 2 + 1] - qz) / L;   // к кольцу
          for (let t = 0; t <= L; t += 0.5) {
            px = p[i * 2] - ux * t; pz = p[i * 2 + 1] - uz * t; run += 0.5;
            if (ringNear(px, pz) > 0.9) { ok = true; break; }
          }
          if (ok) break;
        }
        if (!ok || !FLD.has(px, pz) || FLD.at(px, pz) > KERB_ISO) continue;
        const nx = -uz, nz = ux, half = r.w / 2;
        let eL = 0, eR = 0;
        for (let t = 0.2; t <= half + 1e-6; t += 0.2) { if (FLD.at(px - nx * t, pz - nz * t) > KERB_ISO - 0.08) break; eL = t; }
        for (let t = 0.2; t <= half + 1e-6; t += 0.2) { if (FLD.at(px + nx * t, pz + nz * t) > KERB_ISO - 0.08) break; eR = t; }
        // правая сторона по ходу к кольцу — +n (см. стоп-линию)
        const b0 = r.ow ? -eL : 0.15, b1 = eR;
        if (b1 - b0 < 2) continue;
        const ch = bucket(px, pz), col = ROAD_COLORS[1], st = ch.base, Wm = 2 * Math.max(-b0, b1);
        const cs = [];
        for (const a of [-0.3, 0.3]) for (const b of [b0, b1]) cs.push([px + ux * a + nx * b, pz + uz * a + nz * b, a, b]);
        const lift2 = upNear(Math.min(...cs.map(c => c[0])), Math.min(...cs.map(c => c[1])),
                             Math.max(...cs.map(c => c[0])), Math.max(...cs.map(c => c[1])));
        for (const [x, z, a, b] of cs) {
          ch.P.push(x, H(x, z) + ROAD_Y + 0.055 + lift2, z);
          ch.C.push(enc(col[0]), enc(col[1]), enc(col[2]));
          ch.R.push(b / (Wm * 0.5), a, Wm, 0); ch.K.push(10); ch.O.push(-1); ch.S.push(0);
        }
        ch.I.push(st, st + 1, st + 2, st + 1, st + 3, st + 2);
        ch.base += 4;
      }
    }
  }

  yield;
  const group = new THREE.Group();
  group.name = 'roads';
  group.userData.drawn = drawn;      // какие улицы реально попали в геометрию
  group.userData.coverage = COV;     // тот же растр отдаём аудиту
  group.userData.zebras = zebras;    // и сколько зебр легло на асфальт
  group.userData.holes = holes;      // сколько дыр в асфальте залито подложкой
  const mat = roadMaterial();
  let made = 0;
  for (const ch of chunks.values()) {
    if (!ch.I.length) continue;
    if ((made += ch.I.length) > 60000) { made = 0; yield; }
    // Выкидываем вершины, на которые не ссылается ни один треугольник: у
    // каждой улицы пишутся все вершины подряд, а рисуются только пролёты
    // своего квадрата (и не снятые обрезкой). Без этого вершин было вдвое.
    {
      const n = ch.base, map = new Int32Array(n).fill(-1);
      let m = 0;
      for (const v of ch.I) if (map[v] < 0) map[v] = m++;
      if (m < n) {
        const sq = (A, k) => { const out = new Array(m * k); for (let v = 0; v < n; v++) { const t = map[v]; if (t < 0) continue; for (let c = 0; c < k; c++) out[t * k + c] = A[v * k + c]; } return out; };
        ch.P = sq(ch.P, 3); ch.C = sq(ch.C, 3); ch.R = sq(ch.R, 4); ch.K = sq(ch.K, 1); ch.S = sq(ch.S, 1); ch.O = sq(ch.O, 1);
        for (let k = 0; k < ch.JI.length; k++) ch.JI[k] = map[ch.JI[k]];
        for (let k = 0; k < ch.I.length; k++) ch.I[k] = map[ch.I[k]];
        ch.base = m;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(ch.P, 3));
    geo.setAttribute('color', new THREE.Uint8BufferAttribute(ch.C, 3, true));
    geo.setAttribute('aRoad', new THREE.Float32BufferAttribute(ch.R, 4));
    geo.setAttribute('aCls', new THREE.Float32BufferAttribute(ch.K, 1));
    geo.setAttribute('aSurf', new THREE.Float32BufferAttribute(ch.S, 1));
    geo.setAttribute('aOwn', new THREE.Float32BufferAttribute(ch.O, 1));
    // расстояние до перекрёстка есть только у вершин полотна; остальным — «далеко»
    const jn = new Float32Array(ch.base).fill(JFAR);
    for (let k = 0; k < ch.JI.length; k++) if (ch.JI[k] >= 0) jn[ch.JI[k]] = ch.JV[k];
    geo.setAttribute('aJn', new THREE.BufferAttribute(jn, 1));
    // ВЫВЕРНУТЫЕ ТРЕУГОЛЬНИКИ. На остром изломе кромки лента (тротуар,
    // фартук, газон) складывается «бабочкой», а у шпал и заливки свой обход.
    // Материал двусторонний, и сам треугольник виден, но нормали вершин
    // усреднялись с перевёрнутыми соседями — выходили почти горизонтальные,
    // и на полотне чернели клинья. Всё плоское разворачиваем лицом вверх;
    // вертикальные грани бордюра (класс 6) не трогаем.
    for (let t = 0; t < ch.I.length; t += 3) {
      const a = ch.I[t] * 3, b2 = ch.I[t + 1] * 3, c = ch.I[t + 2] * 3;
      if (ch.K[ch.I[t]] === 6) continue;
      const ny = (ch.P[b2 + 2] - ch.P[a + 2]) * (ch.P[c] - ch.P[a]) - (ch.P[b2] - ch.P[a]) * (ch.P[c + 2] - ch.P[a + 2]);
      if (ny < 0) { const q = ch.I[t + 1]; ch.I[t + 1] = ch.I[t + 2]; ch.I[t + 2] = q; }
    }
    geo.setIndex(ch.I);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    group.add(m);
  }
  return group;
}

// Минимальный охватывающий прямоугольник. У оптимального одна сторона всегда
// лежит на ребре контура — поэтому достаточно перебрать рёбра.
function obb(poly) {
  const n = poly.length / 2;
  let best = null;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = poly[j * 2] - poly[i * 2], dz = poly[j * 2 + 1] - poly[i * 2 + 1];
    const l = Math.hypot(dx, dz);
    if (l < 0.4) continue;
    const ux = dx / l, uz = dz / l;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let k = 0; k < n; k++) {
      const x = poly[k * 2], z = poly[k * 2 + 1];
      const u = x * ux + z * uz, v = -x * uz + z * ux;
      if (u < u0) u0 = u; if (u > u1) u1 = u;
      if (v < v0) v0 = v; if (v > v1) v1 = v;
    }
    const a = (u1 - u0) * (v1 - v0);
    if (!best || a < best.area) best = { area: a, ux, uz, u0, u1, v0, v1 };
  }
  return best;
}

// Контур, сдвинутый по биссектрисам на d внутрь (d>0) или наружу (d<0).
// Каждая точка уезжает так, чтобы РАССТОЯНИЕ до обоих смежных рёбер стало
// ровно |d| — иначе на углу между соседними скатами остаётся открытый клин.
function offsetPoly(p, d) {
  const n = p.length / 2;
  if (n < 3) return null;
  const out = new Array(n * 2);
  for (let i = 0; i < n; i++) {
    const h = (i - 1 + n) % n, j = (i + 1) % n;
    const e1x = p[i * 2] - p[h * 2], e1z = p[i * 2 + 1] - p[h * 2 + 1];
    const e2x = p[j * 2] - p[i * 2], e2z = p[j * 2 + 1] - p[i * 2 + 1];
    const l1 = Math.hypot(e1x, e1z) || 1, l2 = Math.hypot(e2x, e2z) || 1;
    // контур OSM обходится против часовой, внутренняя нормаль ребра — (-dz, dx)
    const n1x = -e1z / l1, n1z = e1x / l1, n2x = -e2z / l2, n2z = e2x / l2;
    let mx = n1x + n2x, mz = n1z + n2z;
    const ml = Math.hypot(mx, mz);
    if (ml < 0.2) return null;          // разворот на 180°: биссектрисы нет
    mx /= ml; mz /= ml;
    // на игле биссектриса уходит в бесконечность — режем вынос
    const k = Math.min(2.4, 1 / Math.max(0.42, mx * n1x + mz * n1z));
    out[i * 2] = p[i * 2] + mx * d * k;
    out[i * 2 + 1] = p[i * 2 + 1] + mz * d * k;
  }
  return out;
}
// Знаковая площадь: у вывернутого сжатием контура она падает и уходит в минус.
function signedArea(p) {
  let a = 0;
  for (let i = 0, n = p.length / 2; i < n; i++) {
    const j = (i + 1) % n;
    a += p[i * 2] * p[j * 2 + 1] - p[j * 2] * p[i * 2 + 1];
  }
  return a / 2;
}
// Полуглубина корпуса: насколько контур сжимается, пока не схлопнется.
// Именно от неё зависит ширина ската: у узкого крыла скаты должны сойтись
// в конёк, у широкого — оставить палубу, одна цифра на все дома тут врёт.
function corpsHalfDepth(p, a0) {
  let best = 0, prev = a0;
  for (let d = 0.5; d <= 9; d += 0.5) {
    const q = offsetPoly(p, d);
    if (!q) break;
    const a = signedArea(q);
    if (a <= a0 * 0.015 || a >= prev) break;   // схлопнулся или вывернулся
    prev = a; best = d;
  }
  return best;
}

// ------------------------------------------------------- гаражный кооператив
// В OSM кооператив обведён РЯДАМИ: один контур — целая линия боксов, иногда
// с изломом. Выдавленный как есть, он даёт глухую плиту в 80 м длиной.
// Режем контур поперёк сканирующей линией и ставим отдельные боксы: у каждого
// свои ворота, своя земля под ногами и своя высота — на склоне ряд ступенькой.
function garageBoxes(poly, terrain, pushV, rnd) {
  const box = obb(poly);
  if (!box) return 0;

  // Сканируем вдоль обеих осей рамки и берём ту, где полосы поперёк короче:
  // у ряда это его глубина, ~6 м, а не длина в 80.
  const spansAt = (ax, az, s) => {
    const n = poly.length / 2, hits = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const x1 = poly[i * 2], z1 = poly[i * 2 + 1];
      const x2 = poly[j * 2], z2 = poly[j * 2 + 1];
      const s1 = x1 * ax + z1 * az, s2 = x2 * ax + z2 * az;
      if ((s1 > s) === (s2 > s)) continue;
      const t = (s - s1) / (s2 - s1);
      hits.push((-x1 * az + z1 * ax) + t * ((-x2 * az + z2 * ax) - (-x1 * az + z1 * ax)));
    }
    hits.sort((a, b) => a - b);
    const out = [];
    for (let i = 0; i + 1 < hits.length; i += 2) out.push([hits[i], hits[i + 1]]);
    return out;
  };
  const axes = [
    { ax: box.ux, az: box.uz, a0: box.u0, a1: box.u1 },
    { ax: -box.uz, az: box.ux, a0: box.v0, a1: box.v1 },
  ];
  for (const A of axes) {
    const w = [];
    for (let k = 1; k <= 9; k++) {
      const s = A.a0 + (A.a1 - A.a0) * k / 10;
      for (const [p0, p1] of spansAt(A.ax, A.az, s)) w.push(p1 - p0);
    }
    w.sort((a, b) => a - b);
    A.med = w.length ? w[w.length >> 1] : Infinity;
  }
  const A = axes[0].med <= axes[1].med ? axes[0] : axes[1];
  if (!isFinite(A.med)) return 0;

  const STEP = 3.45;                          // ширина бокса
  const len = A.a1 - A.a0;
  const nS = Math.max(1, Math.round(len / STEP));
  const step = len / nS;
  const XZ = (s, p) => [s * A.ax - p * A.az, s * A.az + p * A.ax];

  const wall = GAR_WALL[(rnd() * GAR_WALL.length) | 0];
  const roofC = GAR_ROOF[(rnd() * GAR_ROOF.length) | 0];
  let hBase = 2.55 + rnd() * 0.45;
  let runLeft = 3 + ((rnd() * 5) | 0);
  let made = 0;

  for (let i = 0; i < nS; i++) {
    const s0 = A.a0 + i * step, s1 = s0 + step, sm = (s0 + s1) / 2;
    if (--runLeft <= 0) {                     // ряд идёт ступенями по склону
      hBase = Math.max(2.35, Math.min(3.25, hBase + (rnd() - 0.5) * 0.5));
      runLeft = 3 + ((rnd() * 5) | 0);
    }
    for (const [q0, q1] of spansAt(A.ax, A.az, sm)) {
      const D = q1 - q0;
      if (D < 2.4) continue;
      const nr = Math.max(1, Math.round(D / 6.4));
      const rd = D / nr;
      for (let r = 0; r < nr; r++) {
        const p0 = q0 + r * rd, p1 = p0 + rd;
        const c = XZ(sm, (p0 + p1) / 2);
        const g = terrain.gridHeightAt(c[0], c[1]);
        const H = hBase + (rnd() - 0.5) * 0.10;
        const yb = g - 0.9, yt = g + H;
        const Hb = yt - yb;
        const door = GAR_DOOR[(rnd() * GAR_DOOR.length) | 0];
        const tint = 0.94 + rnd() * 0.12;
        const wc = [Math.min(1, wall[0] * tint), Math.min(1, wall[1] * tint), Math.min(1, wall[2] * tint)];

        // четыре стены; поперечные (шириной STEP) — с воротами
        // Лицевую сторону грани задаёт ПОРЯДОК ОБХОДА, а не записанная нормаль.
        // Я передавал вершины «как получилось» и лишь иногда менял их местами
        // вручную — часть стенок бокса уходила изнанкой наружу и отсекалась,
        // в ряду появлялись сквозные пустоты. Теперь грань знает, куда ей
        // смотреть, и обход разворачивается сам.
        const quad = (P1, P2, P3, P4, col, kind, uv, ox, oz) => {
          const e1 = [P2[0] - P1[0], P2[1] - P1[1], P2[2] - P1[2]];
          const e2 = [P3[0] - P1[0], P3[1] - P1[1], P3[2] - P1[2]];
          let nx = e1[1] * e2[2] - e1[2] * e2[1];
          let ny = e1[2] * e2[0] - e1[0] * e2[2];
          let nz = e1[0] * e2[1] - e1[1] * e2[0];
          const ln = Math.hypot(nx, ny, nz) || 1;
          nx /= ln; ny /= ln; nz /= ln;
          let V = [P1, P2, P3, P1, P3, P4], T = [uv[0], uv[1], uv[2], uv[0], uv[2], uv[3]];
          if (ox !== undefined && nx * ox + nz * oz < 0) {
            nx = -nx; ny = -ny; nz = -nz;
            V = [P1, P3, P2, P1, P4, P3]; T = [uv[0], uv[2], uv[1], uv[0], uv[3], uv[2]];
          }
          for (let k = 0; k < 6; k++)
            pushV(V[k][0], V[k][1], V[k][2], nx, ny, nz, col, T[k][0], T[k][1], Hb, kind);
        };
        const P = (s, p, y) => { const q = XZ(s, p); return [q[0], y, q[1]]; };

        // торцы с воротами: наружу смотрят обе стороны бокса
        // Ось p идёт по (-az, ax): у грани при p1 наружу смотрит она, у p0 — обратная
        for (const [pf, sg] of [[p0, -1], [p1, 1]]) {
          const Aq = P(s0, pf, yb), Bq = P(s1, pf, yb);
          const Cq = P(s1, pf, yt), Dq = P(s0, pf, yt);
          quad(Aq, Bq, Cq, Dq, door, 8, [[0, 0], [1, 0], [1, Hb], [0, Hb]],
               -A.az * sg, A.ax * sg);
        }
        // боковые (общие) стены — глухие блоки
        // Ось s идёт по (ax, az): у грани при s1 наружу смотрит она, у s0 — обратная
        for (const [sf, sg] of [[s0, -1], [s1, 1]]) {
          const Aq = P(sf, p0, yb), Bq = P(sf, p1, yb);
          const Cq = P(sf, p1, yt), Dq = P(sf, p0, yt);
          quad(Aq, Bq, Cq, Dq, wc, 9, [[0, 0], [rd, 0], [rd, Hb], [0, Hb]],
               A.ax * sg, A.az * sg);
        }
        // пологая двускатная кровля из профнастила, конёк вдоль ряда
        const O = 0.16, hr = 0.32;
        const pm = (p0 + p1) / 2;
        for (const [pa, pb] of [[p0 - O, pm], [p1 + O, pm]]) {
          const ya = yt, yy = yt + hr;
          const Aq = P(s0 - O, pa, ya), Bq = P(s1 + O, pa, ya);
          const Cq = P(s1 + O, pb, yy), Dq = P(s0 - O, pb, yy);
          const uv = [[s0, pa], [s1, pa], [s1, pb], [s0, pb]];
          const e1 = [Bq[0] - Aq[0], 0, Bq[2] - Aq[2]];
          const e2 = [Cq[0] - Aq[0], yy - ya, Cq[2] - Aq[2]];
          let nx = e1[1] * e2[2] - e1[2] * e2[1];
          let ny = e1[2] * e2[0] - e1[0] * e2[2];
          let nz = e1[0] * e2[1] - e1[1] * e2[0];
          const ln = Math.hypot(nx, ny, nz) || 1;
          nx /= ln; ny /= ln; nz /= ln;
          let flip = false;
          if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; flip = true; }
          const V = flip ? [Aq, Cq, Bq, Aq, Dq, Cq] : [Aq, Bq, Cq, Aq, Cq, Dq];
          const T = flip ? [uv[0], uv[2], uv[1], uv[0], uv[3], uv[2]]
                         : [uv[0], uv[1], uv[2], uv[0], uv[2], uv[3]];
          for (let k = 0; k < 6; k++)
            pushV(V[k][0], V[k][1], V[k][2], nx, ny, nz, roofC, T[k][0], T[k][1], Hb, 5);
        }
        made++;
      }
    }
  }
  return made;
}

// ---------------------------------------------------------------- здания
// skip — индексы зданий, которые целиком берёт на себя модуль
// достопримечательностей. Раньше этот список собирался, но никем не читался:
// круглый зал Панорамы строился поверх обычного дома из OSM, и сквозь ротонду
// торчали его этажи с рядовыми окнами.
// ГЕНЕРАТОР: дома плотного квартала — до 37 мс в одном шаге. Возвращаем
// управление менеджеру каждые несколько десятков домов.
export function* buildBuildings(world, terrain, chunk = 500, skip = null) {
  // Контуры всех домов квадрата — тентам рынка: не заходить в соседа.
  let mktGrid = null;
  const MKT_GRID = { find: (x, z) => (mktGrid ||= new PolyGrid((world.allBuildings || world.buildings).map(b => ({ poly: b.poly })), 60)).find(x, z) };
  const chunks = new Map();
  const bucket = (x, z) => {
    const k = Math.floor(x / chunk) + ',' + Math.floor(z / chunk);
    let c = chunks.get(k);
    if (!c) chunks.set(k, c = { P: [], N: [], C: [], W: [], K: [] });
    return c;
  };
  const rand = rng(20260828);
  // Доля скатных кровель — единственный способ увидеть регресс «дом снова стал
  // коробкой» числом, а не глазами: лежит в userData меша.
  const stats = { total: 0, pitched: 0, hip: 0, skirt: 0, flat: 0 };
  let cur = null;
  const pushV = (x, y, z, nx, ny, nz, c, wu, wv, wh, kind) => {
    cur.P.push(x, y, z); cur.N.push(nx, ny, nz);
    cur.C.push(enc(c[0]), enc(c[1]), enc(c[2]));
    cur.W.push(wu, wv, wh); cur.K.push(kind);
  };

  // Коробка с крышкой: труба и конёк. Крышку кладём всегда — открытый сверху
  // параллелепипед на кровле просвечивает насквозь ровно так же, как дыра.
  // (ax,az) — направление длинной полуоси ha, поперёк неё полуось hb.
  const boxSolid = (cx, cz, ha, hb, y0, y1, col, kind, ax, az, Hb) => {
    const bx = -az, bz = ax;
    const c = [
      [cx - ax * ha - bx * hb, cz - az * ha - bz * hb],
      [cx + ax * ha - bx * hb, cz + az * ha - bz * hb],
      [cx + ax * ha + bx * hb, cz + az * ha + bz * hb],
      [cx - ax * ha + bx * hb, cz - az * ha + bz * hb],
    ];
    for (let i = 0; i < 4; i++) {
      const A = c[i], B = c[(i + 1) % 4];
      const dx = B[0] - A[0], dz = B[1] - A[1], l = Math.hypot(dx, dz) || 1;
      const nx = dz / l, nz = -dx / l;
      pushV(A[0], y0, A[1], nx, 0, nz, col, 0, 0, Hb, kind);
      pushV(B[0], y1, B[1], nx, 0, nz, col, l, y1 - y0, Hb, kind);
      pushV(B[0], y0, B[1], nx, 0, nz, col, l, 0, Hb, kind);
      pushV(A[0], y0, A[1], nx, 0, nz, col, 0, 0, Hb, kind);
      pushV(A[0], y1, A[1], nx, 0, nz, col, 0, y1 - y0, Hb, kind);
      pushV(B[0], y1, B[1], nx, 0, nz, col, l, y1 - y0, Hb, kind);
    }
    // обход угловых точек против часовой; вверх грань смотрит при обратном
    for (const t of [[c[0], c[2], c[1]], [c[0], c[3], c[2]]])
      for (const q of t) pushV(q[0], y1, q[1], 0, 1, 0, col, q[0], q[1], Hb, kind);
  };

  // Конёк — брус по линии стыка скатов. Без него кровля обрывается ребром
  // и издали читается как срезанный клин, а не как крыша.
  const ridgeBar = (A, B, y, col, Hb) => {
    const dx = B[0] - A[0], dz = B[1] - A[1], l = Math.hypot(dx, dz);
    if (l < 2.2) return;                 // на коротком ребре брус не читается
    // Концы вытянуты на полуширину, чтобы на углах брусья сошлись без щели.
    // Брус низкий: при высоте больше ~12 см его теневой бок читается с крыши
    // как чёрная щель в кровле, а не как конёк.
    boxSolid((A[0] + B[0]) / 2, (A[1] + B[1]) / 2, l / 2 + 0.15, 0.15,
             y - 0.05, y + 0.11, col, 1, dx / l, dz / l, Hb);
  };

  let work = 0;
  for (let bi = 0; bi < world.buildings.length; bi++) {
    const b = world.buildings[bi];
    if (skip && skip.has(bi)) continue;
    const poly = b.poly, n = poly.length / 2;
    if (n < 3) continue;
    if ((work += n + 10) > 240) { work = 0; yield; }

    // Земля вдоль стен — не только в углах. Треугольник рельефа — девять
    // метров, и между углами длинной стены грунт уходил ниже самого низкого
    // угла: стена рыночного ряда висела над землёй ровной кромкой. Шаг 2 м.
    let gmin = Infinity, gmax = -Infinity;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = poly[i * 2], az = poly[i * 2 + 1];
      const ex = poly[j * 2] - ax, ez = poly[j * 2 + 1] - az;
      const k = Math.max(1, Math.ceil(Math.hypot(ex, ez) / 2));
      for (let s = 0; s < k; s++) {
        const h = terrain.gridHeightAt(ax + ex * s / k, az + ez * s / k);
        if (h < gmin) gmin = h; if (h > gmax) gmax = h;
      }
      work += k >> 2;                        // выборка по стенам — тоже работа шага
    }
    if (gmax <= SEA_FLOOR + 0.5) continue;   // мусор в данных: контур целиком в море
    // Отметка первого этажа — САМАЯ ВЫСОКАЯ точка земли у стен. Раньше окна
    // считались от подошвы под нижним углом, и на склоне верхняя стена
    // уходила в грунт по подоконники: дом «в горе». Теперь этажи начинаются
    // над землёй везде, а всё, что ниже отметки, — каменный цоколь (в шейдере
    // это отрицательная координата по высоте), видимый с нижней стороны.
    const yFloor = gmax;
    const yBase = gmin - 0.6;
    const yTop = yFloor + b.h;
    const Hb = yTop - yFloor;
    const wb = yBase - yFloor;               // подошва в координатах стены: ≤ −0.6
    cur = bucket(poly[0], poly[1]);

    // гаражи разбираем на боксы: контур OSM — это ряд, а не один дом
    if (/^garage/.test(b.t || '')) {
      if (garageBoxes(poly, terrain, pushV, rand) > 0) continue;
    }

    const area = polyArea(poly);
    const market = b.k === 'market';
    const wantHip = b.rs === 'hipped';
    // цвет стен — по типу дома и району (palette.js); кубик rand бросаем как
    // раньше, чтобы не сдвинуть кровли и оттенки следующих домов
    const wall = b.wc ? hexRGB(b.wc)
               : market ? MARKET_WALLS[(rand() * MARKET_WALLS.length) | 0]
                        : (rand(), wallColor(b));
    // Черепица в центре Севастополя лежит не только на маленьких домах:
    // послевоенный квартал — это 5–7 этажей и корпуса в пол-квартала, и они
    // тоже под скатом. Прежний порог (18 м / 900 м²) оставлял 700+ крупных,
    // но невысоких домов плоскими — квартал вырождался в поле коробок.
    // Школы, храмы, рынок и витражные корпуса не трогаем: у них своя кровля.
    // типовой дом (series.js): свой фасад, цвет и сетка пролётов на стенах
    const ser = seriesOf(b);
    // Хрущёвка и сталинка — всегда под скатом (шифер / черепица), как
    // Толстого, 4А. Кубик rand бросаем как раньше: порядок бросков держит
    // кровли и цвета соседей.
    const pitched = (market || wantHip ||
      (b.fx !== 'glass' && !b.school && !b.temple && b.rs !== 'flat' &&
       b.h <= 22 && area <= 2200 && n >= 4 && rand() < 0.92)) ||
      (!!ser && !!ser.roof && b.rs !== 'flat' && b.h <= 22 && n >= 4);
    const flatRoof = !pitched;
    stats.total++; if (pitched) stats.pitched++;
    let roof = b.rc ? hexRGB(b.rc)
      : market ? MARKET_ROOF
      : (rand(), roofColor(b, flatRoof));
    if (ser && ser.roof && pitched && !b.rc) roof = ser.roof;
    const tint = 0.93 + rand() * 0.15;
    const wc0 = ser ? ser.color : wall;
    const w = [Math.min(1, wc0[0] * tint), Math.min(1, wc0[1] * tint), Math.min(1, wc0[2] * tint)];
    // гараж, сарай, будка — окон не рисуем
    const wallKind = market ? 4 : b.temple ? 13 : b.school ? 12
      : b.fx === 'glass' ? 10 : b.arch ? 11 : b.go ? 7
      : (b.h < 4.2 || area < 38) ? 2 : 0;
    const roofKind = flatRoof ? 3 : 1;

    const gate = gateOf(b), gh = (x, z) => terrain.gridHeightAt(x, z);
    let u = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = poly[i * 2], az = poly[i * 2 + 1];
      const bx = poly[j * 2], bz = poly[j * 2 + 1];
      const dx = bx - ax, dz = bz - az;
      const l = Math.hypot(dx, dz);
      if (l < 0.15) continue;
      const nx = dz / l, nz = -dx / l;
      let u0 = u, u1 = u + l, wk = wallKind;
      u = u1;
      if (ser) ({ kind: wk, u0, u1 } = seriesWall(ser, i, ax, az, bx, bz, l));
      // арка-проезд (passage.js): стена рвётся проёмом
      const cut = gate && gateCut(gate, i, ax, az, bx, bz, l);
      if (cut) {
        gateWall(gate, cut, ax, az, bx, bz, l, u0, u1, yFloor, yTop, Hb, nx, nz, w, wk, pushV, (ax, az, bx, bz, u0, u1) => {
          pushV(ax, yBase, az, nx, 0, nz, w, u0, wb, Hb, wk);
          pushV(bx, yTop, bz, nx, 0, nz, w, u1, Hb, Hb, wk);
          pushV(bx, yBase, bz, nx, 0, nz, w, u1, wb, Hb, wk);
          pushV(ax, yBase, az, nx, 0, nz, w, u0, wb, Hb, wk);
          pushV(ax, yTop, az, nx, 0, nz, w, u0, Hb, Hb, wk);
          pushV(bx, yTop, bz, nx, 0, nz, w, u1, Hb, Hb, wk);
        }, gh);
        continue;
      }
      // Обход ПО нормали: при обратном порядке стена отсекается как задняя грань,
      // и снаружи видно нутро дома вместо ближних стен.
      pushV(ax, yBase, az, nx, 0, nz, w, u0, wb, Hb, wk);
      pushV(bx, yTop, bz, nx, 0, nz, w, u1, Hb, Hb, wk);
      pushV(bx, yBase, bz, nx, 0, nz, w, u1, wb, Hb, wk);
      pushV(ax, yBase, az, nx, 0, nz, w, u0, wb, Hb, wk);
      pushV(ax, yTop, az, nx, 0, nz, w, u0, Hb, Hb, wk);
      pushV(bx, yTop, bz, nx, 0, nz, w, u1, Hb, Hb, wk);
    }
    if (ser) { seriesExtras(ser, yFloor, yTop, w, Hb, boxSolid, yBase); stats.series = (stats.series || 0) + 1; }
    if (gate) gateLining(gate, w, pushV, gh, Hb);
    if (b.castle) castleExtras(b, yBase, yFloor, yTop, w, roof, Hb, boxSolid, pushV);   // «замок» (castle.js)

    // Рыночный ряд: длинный сарай под двускатной ребристой кровлей, по бокам
    // тент над проходом. Вальма из общего кода тут не годится — ряд узкий
    // и длинный, у него конёк во всю длину, а не четыре ската.
    // Рыночный ряд строим своей кровлей только у прямоугольного пятна: у
    // Г-образного или скошенного рамка выходит далеко за стены, и кровля с
    // тентами накрывала соседний павильон и корпус ДЮСШ «Чайка» — «павильон
    // входит в дом». Такие ряды кроет общая юбка по контуру ниже.
    const mbox = market ? obb(poly) : null;
    if (mbox && area / mbox.area >= 0.9) {
      const box = mbox;
      if (box) {
        const { ux, uz } = box;
        const toXZ = (u, v) => [u * ux - v * uz, u * uz + v * ux];
        const along = (box.u1 - box.u0) >= (box.v1 - box.v0);
        const EAVE = 0.55;
        const a0 = (along ? box.u0 : box.v0) - 0.2, a1 = (along ? box.u1 : box.v1) + 0.2;
        const c0 = (along ? box.v0 : box.u0) - EAVE, c1 = (along ? box.v1 : box.u1) + EAVE;
        const cMid = (c0 + c1) / 2;
        const P = (a, c) => along ? toXZ(a, c) : toXZ(c, a);
        const eaveY = yTop, ridgeY = yTop + Math.min(1.15, (c1 - c0) * 0.15);

        const quad = (A, ay, B, by, C, cy, D, dy, kind, col, uv) => {
          const tri = (p1, y1, p2, y2, p3, y3, t1, t2, t3) => {
            const e1 = [p2[0] - p1[0], y2 - y1, p2[1] - p1[1]];
            const e2 = [p3[0] - p1[0], y3 - y1, p3[1] - p1[1]];
            let nx = e1[1] * e2[2] - e1[2] * e2[1];
            let ny = e1[2] * e2[0] - e1[0] * e2[2];
            let nz = e1[0] * e2[1] - e1[1] * e2[0];
            const ln = Math.hypot(nx, ny, nz) || 1;
            nx /= ln; ny /= ln; nz /= ln;
            let flip = false;
            if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; flip = true; }
            const V = flip ? [[p3, y3, t3], [p2, y2, t2], [p1, y1, t1]]
                           : [[p1, y1, t1], [p2, y2, t2], [p3, y3, t3]];
            for (const [q, qy, qt] of V)
              pushV(q[0], qy, q[1], nx, ny, nz, col, qt[0], qt[1], Hb, kind);
          };
          tri(A, ay, B, by, C, cy, uv[0], uv[1], uv[2]);
          tri(A, ay, C, cy, D, dy, uv[0], uv[2], uv[3]);
        };

        // два ската
        for (const side of [-1, 1]) {
          const cE = side < 0 ? c0 : c1;
          const A = P(a0, cE), B = P(a1, cE), C = P(a1, cMid), D = P(a0, cMid);
          quad(A, eaveY, B, eaveY, C, ridgeY, D, ridgeY, 5, roof,
               [[a0, cE], [a1, cE], [a1, cMid], [a0, cMid]]);
        }
        // софит под свесом ряда
        {
          const A = P(a0, c0), B = P(a1, c0), C = P(a1, c1), D = P(a0, c1);
          const soff = (p1, p2, p3) => {
            const e1 = [p2[0] - p1[0], 0, p2[1] - p1[1]];
            const e2 = [p3[0] - p1[0], 0, p3[1] - p1[1]];
            const ny = e1[2] * e2[0] - e1[0] * e2[2];
            const V = ny > 0 ? [p1, p3, p2] : [p1, p2, p3];
            for (const q of V) pushV(q[0], yTop - 0.02, q[1], 0, -1, 0, roof, q[0], q[1], Hb, 5);
          };
          soff(A, B, C); soff(A, C, D);
        }
        // фронтоны: треугольник между стеной и коньком
        for (const aE of [a0, a1]) {
          const L = P(aE, c0), R = P(aE, c1), T = P(aE, cMid);
          const e1 = [R[0] - L[0], 0, R[1] - L[1]];
          const e2 = [T[0] - L[0], ridgeY - eaveY, T[1] - L[1]];
          let nx = e1[1] * e2[2] - e1[2] * e2[1];
          let ny = e1[2] * e2[0] - e1[0] * e2[2];
          let nz = e1[0] * e2[1] - e1[1] * e2[0];
          const ln = Math.hypot(nx, ny, nz) || 1;
          nx /= ln; ny /= ln; nz /= ln;
          const flip = (aE === a0) ? -1 : 1;
          for (const sgn of [1, -1]) {   // фронтон виден с обеих сторон
            const o = sgn * flip;
            pushV(L[0], eaveY, L[1], nx * o, ny * o, nz * o, wall, 0, 0, Hb, 2);
            if (o > 0) {
              pushV(R[0], eaveY, R[1], nx * o, ny * o, nz * o, wall, c1 - c0, 0, Hb, 2);
              pushV(T[0], ridgeY, T[1], nx * o, ny * o, nz * o, wall, (c1 - c0) / 2, ridgeY - eaveY, Hb, 2);
            } else {
              pushV(T[0], ridgeY, T[1], nx * o, ny * o, nz * o, wall, (c1 - c0) / 2, ridgeY - eaveY, Hb, 2);
              pushV(R[0], eaveY, R[1], nx * o, ny * o, nz * o, wall, c1 - c0, 0, Hb, 2);
            }
          }
        }
        // тент над проходом с обеих длинных сторон
        const awn = AWNINGS[(rand() * AWNINGS.length) | 0];
        const yA = yTop - 1.45;          // тент ниже полосы вывесок
        for (const side of [-1, 1]) {
          const cW = side < 0 ? c0 + EAVE : c1 - EAVE;     // у самой стены
          const cO = cW + side * 1.65;                      // вынос наружу
          const A = P(a0 + 0.4, cW), B = P(a1 - 0.4, cW);
          const C = P(a1 - 0.4, cO), D = P(a0 + 0.4, cO);
          // тент не заводим в соседний дом или павильон: ряды стоят впритык
          let blocked = false;
          for (let t = 0; t <= 1.0001 && !blocked; t += 0.125) {
            const q = P(a0 + 0.4 + (a1 - a0 - 0.8) * t, cO);
            const q2 = P(a0 + 0.4 + (a1 - a0 - 0.8) * t, cW + side * 0.9);
            for (const [qx, qz] of [q, q2]) {
              const hitB = MKT_GRID.find(qx, qz);
              if (hitB && hitB.poly !== poly) { blocked = true; break; }
            }
          }
          if (blocked) continue;
          quad(A, yA, B, yA, C, yA - 0.42, D, yA - 0.42, 6, awn,
               [[a0, 0], [a1, 0], [a1, 1.7], [a0, 1.7]]);
        }
        continue;
      }
    }

    // Двор внутри контура (b.holes) кровлей не закрываем: сквозной колодец —
    // примета севастопольского квартала, скат по внешнему контуру его затянет.
    const roofable = pitched && !(b.holes && b.holes.length);

    // Труба: 1–3 на дом по величине пятна. Скатная кровля без труб издали
    // читается как палатка, силуэт квартала держится именно на них.
    const chimneys = (spots, yDeck, ax, az) => {
      const cc = [w[0] * 0.80, w[1] * 0.74, w[2] * 0.70];
      for (const [cx, cz] of spots) {
        const s = 0.32 + rand() * 0.16;
        const ht = 1.05 + rand() * 0.85;
        // низ утоплен в кровлю: труба стоит на скате, а он наклонный
        boxSolid(cx, cz, s, s * 0.78, yDeck - 0.6, yDeck + ht, cc, 2, ax, az, Hb);
        boxSolid(cx, cz, s + 0.11, s * 0.78 + 0.11, yDeck + ht - 0.14, yDeck + ht + 0.04,
                 roof, 3, ax, az, Hb);
      }
    };
    const nChim = area < 210 ? 1 : area < 900 ? 2 : 3;

    // Вальма по охватывающему прямоугольнику даёт честный конёк только на
    // почти прямоугольном пятне: у скошенного или Г-образного она разворачи-
    // вается относительно стен и висит углом над двором. Поэтому здесь —
    // только мелкие простые дома, всё остальное кроет «юбка» по контуру ниже.
    const box = roofable ? obb(poly) : null;
    if (box && area / box.area > 0.90 && area < 620) {
      const EAVE = 0.42;
      const { ux, uz } = box;
      const u0 = box.u0 - EAVE, u1 = box.u1 + EAVE;
      const v0 = box.v0 - EAVE, v1 = box.v1 + EAVE;
      const W = v1 - v0, L = u1 - u0;
      const along = L >= W;
      const short = Math.min(W, L), long = Math.max(W, L);
      const hr = Math.min(3.4, short * 0.32);
      // (a,b) — вдоль конька, (c,d) — поперёк
      const toXZ = (u, v) => [u * ux - v * uz, u * uz + v * ux];
      const aLo = along ? u0 : v0, aHi = along ? u1 : v1;
      const cMid = along ? (v0 + v1) / 2 : (u0 + u1) / 2;
      const cLo = along ? v0 : u0, cHi = along ? v1 : u1;
      const inset = Math.min(short / 2, long / 2 - 0.01);
      const P = (a, c) => along ? toXZ(a, c) : toXZ(c, a);
      const eaveY = yTop, ridgeY = yTop + hr;
      const c1 = P(aLo, cLo), c2 = P(aHi, cLo), c3 = P(aHi, cHi), c4 = P(aLo, cHi);
      const r1 = P(aLo + inset, cMid), r2 = P(aHi - inset, cMid);
      const tri = (A, ay, B, by, C, cy) => {
        const e1 = [B[0] - A[0], by - ay, B[1] - A[1]];
        const e2 = [C[0] - A[0], cy - ay, C[1] - A[1]];
        let nx = e1[1] * e2[2] - e1[2] * e2[1];
        let ny = e1[2] * e2[0] - e1[0] * e2[2];
        let nz = e1[0] * e2[1] - e1[1] * e2[0];
        const ln = Math.hypot(nx, ny, nz) || 1;
        nx /= ln; ny /= ln; nz /= ln;
        // Развернуть НОРМАЛЬ мало: лицевую сторону задаёт порядок обхода.
        // Пока переворачивали только нормаль, половина скатов уходила изнанкой
        // наружу и отсекалась — в кровлях зияли дыры.
        let flip = false;
        if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; flip = true; }
        const V = flip ? [[C, cy], [B, by], [A, ay]] : [[A, ay], [B, by], [C, cy]];
        for (const [q, qy] of V)
          pushV(q[0], qy, q[1], nx, ny, nz, roof, q[0], q[1], Hb, 1);
      };
      // два ската-трапеции и две вальмы
      tri(c1, eaveY, c2, eaveY, r2, ridgeY); tri(c1, eaveY, r2, ridgeY, r1, ridgeY);
      tri(c3, eaveY, c4, eaveY, r1, ridgeY); tri(c3, eaveY, r1, ridgeY, r2, ridgeY);
      tri(c4, eaveY, c1, eaveY, r1, ridgeY);
      tri(c2, eaveY, c3, eaveY, r2, ridgeY);
      // Софит: свес кровли был односторонним, и снизу — с горки, из окна,
      // из-под карниза — кровля просвечивала насквозь. Закрываем низ плитой.
      {
        const soff = (A, B, C) => {
          const e1 = [B[0] - A[0], 0, B[1] - A[1]];
          const e2 = [C[0] - A[0], 0, C[1] - A[1]];
          const ny = e1[2] * e2[0] - e1[0] * e2[2];
          const V = ny > 0 ? [A, C, B] : [A, B, C];
          for (const q of V) pushV(q[0], eaveY - 0.02, q[1], 0, -1, 0, roof, q[0], q[1], Hb, 1);
        };
        soff(c1, c2, c3); soff(c1, c3, c4);
      }
      ridgeBar(r1, r2, ridgeY, roof, Hb);
      {
        const dx = r2[0] - r1[0], dz = r2[1] - r1[1], dl = Math.hypot(dx, dz);
        const ax = dl > 0.2 ? dx / dl : 1, az = dl > 0.2 ? dz / dl : 0;
        const spots = [];
        for (let k = 0; k < nChim; k++) {
          const t = (k + 0.7 + rand() * 0.6) / (nChim + 0.4);
          spots.push([r1[0] + dx * t, r1[1] + dz * t]);
        }
        chimneys(spots, ridgeY, ax, az);
      }
      stats.hip++;
      continue;
    }

    // «Юбка» по контуру — основной способ скатной кровли. Скат идёт вдоль
    // КАЖДОЙ стены внутрь, а середину закрывает палуба по коньку: у Г-образного
    // корпуса и у скошенного пятна такая кровля садится на стены, а не висит
    // углом над двором, как вальма по габаритной рамке.
    if (roofable) {
      // Контуры OSM замкнуты дублем первой точки, а рядом попадаются вершины
      // в паре сантиметров: биссектриса на нулевом ребре уводит скат в стену.
      const poly2 = [];
      for (let i = 0; i < n; i++) {
        const x = poly[i * 2], z = poly[i * 2 + 1];
        const m = poly2.length;
        if (m >= 2 && Math.hypot(x - poly2[m - 2], z - poly2[m - 1]) < 0.2) continue;
        poly2.push(x, z);
      }
      if (poly2.length >= 6 &&
          Math.hypot(poly2[0] - poly2[poly2.length - 2], poly2[1] - poly2[poly2.length - 1]) < 0.2)
        poly2.length -= 2;
      const n2 = poly2.length / 2;
      // Ширина ската — от глубины корпуса, а не от площади: узкое крыло
      // должно сойтись в конёк (палуба вырождается в ленту), широкий корпус —
      // оставить палубу. Одна цифра на все дома давала на флигелях плоский стол.
      const half = n2 >= 4 ? corpsHalfDepth(poly2, area) : 0;
      // У S- и Г-образного корпуса сжатый контур на изломах перехлёстывается
      // сам с собой: earcut такой многоугольник не дотриангулирует, палуба
      // выходит дырявой. Поэтому ширину ската подбираем — берём первую, при
      // которой палуба закрывается полностью (n-2 треугольника) и не вылезает
      // за стены. Не подошла ни одна — дом уходит на плоскую кровлю.
      let inner = null, deck = null, cIn = null, RW = 0;
      for (const f of [0.92, 0.62, 0.4, 0.25]) {
        const rw = Math.min(4.2, half * f);
        if (rw < 0.8) break;
        const q = offsetPoly(poly2, rw);
        if (!q || signedArea(q) <= 0.4) continue;
        let ok = true;
        for (let i = 0; ok && i < n2; i++) ok = pointInPoly(q[i * 2], q[i * 2 + 1], poly2);
        if (!ok) continue;
        const pts = [];
        for (let i = 0; i < n2; i++) pts.push(new THREE.Vector2(q[i * 2], q[i * 2 + 1]));
        let tri = [];
        try { tri = THREE.ShapeUtils.triangulateShape(pts, []); } catch { tri = []; }
        if (tri.length !== n2 - 2) continue;
        inner = q; deck = tri; cIn = pts; RW = rw; break;
      }
      const RH = Math.min(2.3, Math.max(0.9, RW * 0.62));
      const outer = inner ? offsetPoly(poly2, -0.45) : null;   // свес наружу
      if (inner && outer) {
        const eaveY = yTop, ridgeY = yTop + RH;
        for (let i = 0; i < n2; i++) {
          const j = (i + 1) % n2;
          const A = [outer[i * 2], outer[i * 2 + 1]], B = [outer[j * 2], outer[j * 2 + 1]];
          const C = [inner[j * 2], inner[j * 2 + 1]], D = [inner[i * 2], inner[i * 2 + 1]];
          const tri = (p1, y1, p2, y2, p3, y3) => {
            const u1 = [p2[0] - p1[0], y2 - y1, p2[1] - p1[1]];
            const u2 = [p3[0] - p1[0], y3 - y1, p3[1] - p1[1]];
            let nx = u1[1] * u2[2] - u1[2] * u2[1];
            let ny = u1[2] * u2[0] - u1[0] * u2[2];
            let nz = u1[0] * u2[1] - u1[1] * u2[0];
            const ln = Math.hypot(nx, ny, nz) || 1;
            nx /= ln; ny /= ln; nz /= ln;
            let flip = false;
            if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; flip = true; }
            const V = flip ? [[p3, y3], [p2, y2], [p1, y1]] : [[p1, y1], [p2, y2], [p3, y3]];
            for (const [q, qy] of V)
              pushV(q[0], qy, q[1], nx, ny, nz, roof, q[0], q[1], Hb, 1);
          };
          // Свес считаем тем же смещением по биссектрисам, что и палубу:
          // при независимом сдвиге каждой стены на углах оставался открытый
          // клин между соседними скатами — снизу в него было видно небо.
          tri(A, eaveY, B, eaveY, C, ridgeY);
          tri(A, eaveY, C, ridgeY, D, ridgeY);
          // Софит: свес односторонний, снизу кровля просвечивала насквозь.
          const P0 = [poly2[i * 2], poly2[i * 2 + 1]], P1 = [poly2[j * 2], poly2[j * 2 + 1]];
          const soff = (p, q, r) => {
            const e1 = [q[0] - p[0], 0, q[1] - p[1]];
            const e2 = [r[0] - p[0], 0, r[1] - p[1]];
            const ny = e1[2] * e2[0] - e1[0] * e2[2];
            const V = ny > 0 ? [p, r, q] : [p, q, r];
            for (const t of V) pushV(t[0], eaveY - 0.02, t[1], 0, -1, 0, roof, t[0], t[1], Hb, 1);
          };
          soff(P0, P1, B); soff(P0, B, A);
          ridgeBar(D, C, ridgeY, roof, Hb);
        }
        for (const f of deck) {
          const p0 = cIn[f[0]], p1 = cIn[f[1]], p2 = cIn[f[2]];
          if (!p0 || !p1 || !p2) continue;
          const cr = (p1.x - p0.x) * (p2.y - p0.y) - (p1.y - p0.y) * (p2.x - p0.x);
          const t = cr > 0 ? [p0, p2, p1] : [p0, p1, p2];
          for (const q of t) pushV(q.x, ridgeY, q.y, 0, 1, 0, roof, q.x, q.y, Hb, 1);
        }
        // Трубы ставим на палубу: точки берём с самих её рёбер, чтобы попасть
        // на кровлю и у ленточной палубы узкого крыла, где выборка по bbox мажет.
        {
          let e0 = 0, eL = -1;
          for (let i = 0; i < n2; i++) {
            const j = (i + 1) % n2;
            const l = Math.hypot(inner[j * 2] - inner[i * 2], inner[j * 2 + 1] - inner[i * 2 + 1]);
            if (l > eL) { eL = l; e0 = i; }
          }
          const j0 = (e0 + 1) % n2;
          const dx = inner[j0 * 2] - inner[e0 * 2], dz = inner[j0 * 2 + 1] - inner[e0 * 2 + 1];
          const dl = Math.hypot(dx, dz) || 1;
          const spots = [];
          for (let k = 0; k < nChim; k++) {
            const t = (k + 0.7 + rand() * 0.6) / (nChim + 0.4);
            spots.push([inner[e0 * 2] + dx * t, inner[e0 * 2 + 1] + dz * t]);
          }
          chimneys(spots, ridgeY, dx / dl, dz / dl);
        }
        stats.skirt++;
        continue;
      }
    }

    const contour = [];
    for (let i = 0; i < n; i++) contour.push(new THREE.Vector2(poly[i * 2], poly[i * 2 + 1]));
    const holes = (b.holes || []).map(h => {
      const a = [];
      for (let i = 0; i < h.length; i += 2) a.push(new THREE.Vector2(h[i], h[i + 1]));
      return a;
    });
    let faces;
    try { faces = THREE.ShapeUtils.triangulateShape(contour, holes); } catch { faces = []; }
    const all = contour.concat(...holes);
    for (const f of faces) {
      const p0 = all[f[0]], p1 = all[f[1]], p2 = all[f[2]];
      if (!p0 || !p1 || !p2) continue;
      const cross = (p1.x - p0.x) * (p2.y - p0.y) - (p1.y - p0.y) * (p2.x - p0.x);
      const t = cross > 0 ? [p0, p2, p1] : [p0, p1, p2];
      // для кровли в атрибут кладём мировые координаты — по ним рисуется черепица
      for (const q of t) pushV(q.x, yTop, q.y, 0, 1, 0, roof, q.x, q.y, Hb, roofKind);
    }
    stats.flat++;
  }

  yield;
  const group = new THREE.Group();
  group.name = 'buildings';
  const mat = buildingMaterial();
  let verts = 0, made = 0;
  for (const ch of chunks.values()) {
    if (!ch.P.length) continue;
    if ((made += ch.P.length) > 90000) { made = 0; yield; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(ch.P, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(ch.N, 3));
    geo.setAttribute('color', new THREE.Uint8BufferAttribute(ch.C, 3, true));
    geo.setAttribute('aWall', new THREE.Float32BufferAttribute(ch.W, 3));
    geo.setAttribute('aKind', new THREE.Float32BufferAttribute(ch.K, 1));
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
    verts += ch.P.length / 3;
  }
  group.userData.verts = verts;
  group.userData.roofStats = stats;
  return group;
}

// ---------------------------------------------------------------- вода
export function buildWater() {
  const geo = new THREE.PlaneGeometry(60000, 60000, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, waterMaterial());
  mesh.position.y = 0;
  mesh.name = 'water';
  mesh.renderOrder = -1;
  return mesh;
}

// ---------------------------------------------------------------- деревья
export function buildTrees(world, terrain, limit = 40000) {
  const trunk = new THREE.CylinderGeometry(0.16, 0.30, 2.4, 5);
  trunk.translate(0, 1.2, 0);
  const crown = new THREE.IcosahedronGeometry(1, 1);
  crown.scale(1, 1.22, 1); crown.translate(0, 3.3, 0);

  const pa = trunk.attributes.position.array, na = trunk.attributes.normal.array;
  const pb = crown.attributes.position.array, nb = crown.attributes.normal.array;
  const P = new Float32Array(pa.length + pb.length); P.set(pa); P.set(pb, pa.length);
  const N = new Float32Array(na.length + nb.length); N.set(na); N.set(nb, na.length);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  const ia = trunk.index ? Array.from(trunk.index.array) : [...P.keys()].slice(0, pa.length / 3);
  const ib = crown.index ? Array.from(crown.index.array) : null;
  if (ib) geo.setIndex(ia.concat(ib.map(i => i + pa.length / 3)));
  const C = new Uint8Array(P.length);
  const nTrunk = pa.length / 3;
  for (let i = 0; i < P.length / 3; i++) {
    const c = i < nTrunk ? [0.322, 0.247, 0.176] : [0.243, 0.365, 0.192];
    C[i * 3] = enc(c[0]); C[i * 3 + 1] = enc(c[1]); C[i * 3 + 2] = enc(c[2]);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(C, 3, true));

  const spots = [];
  const rand = rng(777);
  const DENSITY = { wood: 95, scrub: 240, park: 165, grass: 520, pitch: 0, sand: 0, yard: 0 };
  for (const g of world.green) {
    const d = DENSITY[g.kind] ?? 0;
    if (!d) continue;
    const want = Math.min(1600, Math.floor(polyArea(g.poly) / d));
    if (want < 1) continue;
    const [x0, z0, x1, z1] = bbox(g.poly);
    let placed = 0, tries = 0;
    while (placed < want && tries++ < want * 14) {
      const x = x0 + rand() * (x1 - x0), z = z0 + rand() * (z1 - z0);
      if (!pointInPoly(x, z, g.poly)) continue;
      const h = terrain.gridHeightAt(x, z);
      if (h < 1.5) continue;
      spots.push(x, h - 0.3, z, 0.62 + rand() * 1.05, rand() * 6.283);
      placed++;
      if (spots.length / 5 >= limit) break;
    }
    if (spots.length / 5 >= limit) break;
  }

  const count = spots.length / 5;
  const mesh = new THREE.InstancedMesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }),
    Math.max(1, count),
  );
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const axis = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < count; i++) {
    const sc = spots[i * 5 + 3];
    p.set(spots[i * 5], spots[i * 5 + 1], spots[i * 5 + 2]);
    q.setFromAxisAngle(axis, spots[i * 5 + 4]);
    s.set(sc * 1.5, sc * 1.7, sc * 1.5);
    mesh.setMatrixAt(i, m.compose(p, q, s));
  }
  mesh.count = count;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.name = 'trees';
  return { mesh, count };
}

// ---------------------------------------------------------------- площадки
// Парковки, футбольные поля, беговые дорожки, корты, детские площадки и
// кладбища. Всё из OSM (data/areas.json → чанки) плюс ручные правки
// data/sport-hand.json, сведённые в data/sport.json (см. web/js/sport.js).
//
// Полотно ЛЕЖИТ НА ЗЕМЛЕ: каждая вершина садится на нарисованную сетку
// рельефа. Раньше беговой овал, парковки и АЗС выравнивались одной отметкой
// по контуру, и на склоне полотно с одной стороны висело плитой со стенкой, с
// другой — уходило под траву вместе с машинами. Ровными поля и корты делает
// теперь сам рельеф: под ними он срезан и подсыпан (installFlats), и полотно,
// посаженное на него, ровное само собой.
//
// В атрибут пишем локальные метры от габаритной рамки — по ним шейдер кладёт
// линии поля, корта и дорожек. Разметка парковки — геометрией: штрихи только
// у тех мест, что реально помещаются (web/js/parking.js), и машины встают
// ровно в них.
// ГЕНЕРАТОР: на большом спортивном ядре или кладбище триангуляция стоит
// десятки миллисекунд — возвращаем управление менеджеру между площадками.
export function* buildAreas(world, terrain) {
  // Растр покрытия построен в buildRoads и лежит в мире: по нему проверяем,
  // не накрыла ли площадка проезжую часть.
  const COVA = world.__coverage;
  const onAsphalt = COVA ? (x, z) => COVA.onRoad(x, z) : () => false;
  // Высоту берём тем же способом, что и дороги: по нарисованным треугольникам
  // сетки рельефа, а не по сырым высотам.
  const H = (x, z) => terrain.gridHeightAt(x, z);
  // Площадки в OSM ЛЕЖАТ ДРУГ НА ДРУГЕ: беговая дорожка вокруг поля, поле на
  // спортядре. Разводим по слоям: чем «главнее» площадка, тем выше она лежит.
  // Поле выше дорожки: внутренняя кромка дорожки в OSM и контур поля
  // расходятся на метр-другой, и тартан с белыми линиями ложился на газон.
  // Парковка и АЗС — ПОД дорогой (слой −1): улица и тротуар рисуются поверх.
  const LAYER = { parking: -1, fuel: -1, market: -1, cemetery: 0, track: 1, sport: 3, playground: 6, path: 7 };
  const LIFT0 = 0.13;
  const liftOf = new Map();
  // Код вида для шейдера (areaMaterial): 0 парковка, 1 футбол, 3 дорожка,
  // 4 детская, 5 гладкое (бордюр), 6 кладбище, 7 аллея, 8 АЗС, 9 теннис,
  // 10 баскетбол, 11 волейбол, 12 мини-футбол и универсальная, 13 пляжный
  // волейбол, 14 бетон (скейт-парк, шахматы), 15 краска (разметка геометрией).
  const KIND = { parking: 0, football: 1, track: 3, playground: 4, plain: 5, cemetery: 6, path: 7, fuel: 8,
    tennis: 9, basketball: 10, volleyball: 11, multi: 12, beach: 13, skate: 14, plaza: 14, market: 14, paint: 15 };
  // Покрытие из OSM (surface=*): 1 трава, 2 искусственный газон, 3 резина и
  // тартан, 4 асфальт, 5 грунт-корт (clay), 6 песок, 7 грунт, 8 гаревое, 9 бетон.
  const SURF = { grass: 1, artificial_turf: 2, tartan: 3, rubber: 3, acrylic: 3, asphalt: 4, concrete: 9,
    paving_stones: 9, clay: 5, sand: 6, ground: 7, dirt: 7, gravel: 7, unpaved: 7, compacted: 7, fine_gravel: 7,
    earth: 7, cinder: 8 };
  // Цвет полотна по виду и покрытию; разметку и узоры кладёт шейдер.
  const BASE = {
    parking: [0.168, 0.166, 0.172], fuel: [0.176, 0.176, 0.184], cemetery: [0.318, 0.361, 0.243],
    path: [0.573, 0.549, 0.494], playground: [0.400, 0.243, 0.196], plain: [0.267, 0.286, 0.243],
    football: [0.196, 0.380, 0.165], track: [0.580, 0.255, 0.196], tennis: [0.196, 0.400, 0.290],
    basketball: [0.545, 0.247, 0.188], volleyball: [0.220, 0.400, 0.310], multi: [0.180, 0.420, 0.220],
    beach: [0.760, 0.680, 0.500], skate: [0.600, 0.590, 0.560], plaza: [0.600, 0.590, 0.560],
    market: [0.440, 0.430, 0.405],
  };
  const BY_SURF = {
    2: [0.165, 0.440, 0.205], 3: [0.560, 0.250, 0.190], 4: [0.300, 0.300, 0.310], 5: [0.690, 0.370, 0.230],
    6: [0.760, 0.680, 0.500], 7: [0.470, 0.400, 0.300], 8: [0.480, 0.300, 0.235],   // гарь: красно-бурая крошка 9: [0.600, 0.590, 0.560],
  };
  const P = [], C = [], U = [], K = [], S = [], I = [];
  let base = 0, drawn = 0, work = 0, stalls = 0;

  // Что рисовать: дубли выброшены, овал старого стадиона разложен на кольцо
  // и поле. Тот же список берут машины (yards) и снаряжение (sport).
  const list = resolveAreas(world.areas);
  // Рынок (зона из data/zones.json) стоит не на буром грунте, а на бетоне и
  // асфальте между рядами — как на спутнике. Ряды встают поверх.
  for (const z of world.zones || [])
    if (z.kind === 'market' && z.poly && z.poly.length >= 6) list.push({ id: 'zone:' + z.name, k: 'market', poly: z.poly });
  world.__areasDraw = list;
  // Дома квадрата ДО дедупликации: дом на шве принадлежит соседу, а парковку
  // и ограду всё равно надо проверять по нему.
  // Дом, отданный трибуне (sport-hand.json → skip), не рисуется — и мешать
  // площадкам не должен.
  const gone = new Set(sportSkipIds());
  const BLD = new PolyGrid((world.allBuildings || world.buildings).filter(b => !gone.has(b.id))
    .map(b => ({ poly: b.poly, holes: b.holes })), 60);
  world.__buildGrid = BLD;
  const allRoads = (world.roads && world.roads.ctx && world.roads.ctx.all) || world.roads;
  const pl = world.places || {};
  const segs = roadSegIndex(allRoads, pl.paths);
  const treeXZ = [];
  for (const t of pl.trees || []) treeXZ.push(t.x, t.z);
  const blockers = list.filter(a => a.k !== 'parking' && a.k !== 'fuel' && a.k !== 'cemetery' && a.k !== 'market').map(a => a.poly);
  // Деревьям, кустам и изгородям на асфальте парковки и на поле не место:
  // посадки сыплются по зелени OSM и вдоль улиц и знать не знают о площадках.
  {
    const hard = list.filter(a => a.k !== 'cemetery').map(a => ({ poly: a.poly }));
    const grid = hard.length ? new PolyGrid(hard, 60) : null;
    world.__noPlant = grid ? (x, z) => !!grid.find(x, z) : () => false;
  }

  // Штрих разметки — лентой по земле: длинную линию по торцам ряда режем на
  // пятиметровые звенья, иначе на склоне её середина уходит под асфальт.
  const paint = (ax, az, bx, bz, w, lift) => {
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 0.05) return;
    const px = -(bz - az) / L * w / 2, pz = (bx - ax) / L * w / 2;
    const k = Math.max(1, Math.ceil(L / 5));
    const q = base;
    for (let i = 0; i <= k; i++) {
      const cx = ax + (bx - ax) * i / k, cz = az + (bz - az) * i / k;
      for (const sg of [-1, 1]) {
        const x = cx + px * sg, z = cz + pz * sg;
        P.push(x, H(x, z) + lift, z);
        C.push(enc(0.80), enc(0.80), enc(0.76));
        U.push(x, z, 0, 0);
        K.push(KIND.paint); S.push(0);
        base++;
      }
    }
    // обход к нормали вверх: у (v0, v1, v2) нормаль по y = 2(p.z·d.x − p.x·d.z)
    const up = (bx - ax) * pz - (bz - az) * px > 0;
    for (let i = 0; i < k; i++) {
      const v0 = q + i * 2, v1 = v0 + 1, v2 = v0 + 2, v3 = v0 + 3;
      if (up) I.push(v0, v1, v2, v1, v3, v2); else I.push(v0, v2, v1, v1, v2, v3);
    }
  };

  for (const a of list) {
    const n = a.poly.length / 2;
    if ((work += n + 12) > 40) { work = 0; yield; }
    if (n < 3) continue;
    // габаритная рамка по главной оси: локальные оси для разметки
    const box = obbOf(a.poly);
    if (!box) continue;
    const { ox, oz, ux, uz, W, L } = box;
    // Рамка одна на всех: разметка, места парковки, ворота и сетки. Считанная
    // дважды независимо, на почти квадратном контуре она выбирала разные
    // стороны, и машины вставали поперёк своих же мест.
    a.__f = { ox, oz, ux, uz, W, L };
    const s = a.__s || null;
    const cls = s ? s.as : (a.k === 'pitch' ? 'multi' : a.k);
    const kind = KIND[cls] ?? KIND.plain;
    const surf = s && s.surface ? (SURF[s.surface] || 0) : (cls === 'track' && a.id && a.id.includes(':ring') ? 8 : 0);
    const col = (surf && cls !== 'tennis' && cls !== 'basketball' && BY_SURF[surf]) || BASE[cls] || BASE.plain;
    const layer = LAYER[a.k === 'pitch' || a.k === 'football' ? 'sport' : a.k] ?? 3;
    const LIFT = LIFT0 + layer * 0.035;
    a.__lift = LIFT;
    liftOf.set(a, LIFT);
    // На дороге площадке делать нечего — кроме кладбища, где растр покрытия
    // и так пуст. Под дорогой лежащие площадки (парковки) не режем — их и не
    // видно под ней.
    const skipOnRoad = a.k !== 'cemetery' && layer >= 0;
    // АЗС по-прежнему ровная: навес и колонки стоят на одной отметке.
    let flatY = null;
    if (a.k === 'fuel') {
      const hs = [];
      for (let i = 0; i < n; i++) hs.push(H(a.poly[i * 2], a.poly[i * 2 + 1]));
      hs.sort((p, q) => p - q);
      flatY = hs[Math.min(hs.length - 1, Math.round(hs.length * 0.4))];
      liftOf.set(a, { flat: flatY, lift: LIFT });
    } else if (layer > 0 && (flatY = fieldLevel(a.id)) !== null) {
      // поле на ровной площадке (fields.js) — ровно на её отметке
      liftOf.set(a, { flat: flatY, lift: LIFT });
      a.__flatY = flatY;
    }

    // Контур way в OSM замкнут: последняя точка совпадает с первой. Оставлять
    // её нельзя — earcut на задвоенной вершине сыпется и оставляет в полотне
    // рваные дыры.
    const pts = [];
    let last = n;
    if (Math.abs(a.poly[0] - a.poly[(n - 1) * 2]) < 1e-6 &&
        Math.abs(a.poly[1] - a.poly[(n - 1) * 2 + 1]) < 1e-6) last = n - 1;
    for (let i = 0; i < last; i++) {
      const x = a.poly[i * 2], z = a.poly[i * 2 + 1];
      if (pts.length && Math.abs(pts[pts.length - 1].x - x) < 1e-6
                     && Math.abs(pts[pts.length - 1].y - z) < 1e-6) continue;
      pts.push(new THREE.Vector2(x, z));
    }
    if (pts.length < 3) continue;
    // Внутренний контур беговой дорожки: середина — поле, а не тартан. Если
    // в OSM его нет, его отводит tools/build-sport.mjs.
    const holeSrc = a.hole || (s && s.hole) || null;
    const holes = [];
    if (holeSrc && holeSrc.length >= 6) {
      const hp = [];
      const hn = holeSrc.length / 2;
      let hlast = hn;
      if (Math.abs(holeSrc[0] - holeSrc[(hn - 1) * 2]) < 1e-6 &&
          Math.abs(holeSrc[1] - holeSrc[(hn - 1) * 2 + 1]) < 1e-6) hlast = hn - 1;
      for (let i = 0; i < hlast; i++) {
        const x = holeSrc[i * 2], z = holeSrc[i * 2 + 1];
        if (hp.length && Math.abs(hp[hp.length - 1].x - x) < 1e-6
                      && Math.abs(hp[hp.length - 1].y - z) < 1e-6) continue;
        hp.push(new THREE.Vector2(x, z));
      }
      if (hp.length >= 3) holes.push(hp);
    }
    // Сегменты внутри овала у торцов поля на настоящих стадионах — тот же
    // тартан (сектора для прыжков), а не трава: тогда середину не вырезаем,
    // поле просто ложится сверху слоем выше.
    const fillHole = !!(s && s.holeFill);
    let tri;
    try { tri = THREE.ShapeUtils.triangulateShape(pts, fillHole ? [] : holes); } catch { tri = []; }
    if (!tri.length) continue;
    const all = holes.length && !fillHole ? pts.concat(...holes) : pts;

    // Для кольца поперечную координату считаем как расстояние до ВНУТРЕННЕЙ
    // кромки: линии дорожек идут вдоль овала. Внутри кромки — со знаком минус:
    // там дорожек нет.
    const holeFlat = holes.map(hp => hp.flatMap(p => [p.x, p.y]));
    const ringDist = holes.length ? (x, z) => {
      let best = Infinity;
      for (const hp of holes) {
        for (let i = 0; i < hp.length; i++) {
          const A2 = hp[i], B2 = hp[(i + 1) % hp.length];
          const vx = B2.x - A2.x, vz = B2.y - A2.y;
          const t = Math.max(0, Math.min(1, ((x - A2.x) * vx + (z - A2.y) * vz) / (vx * vx + vz * vz || 1)));
          const d = Math.hypot(x - A2.x - t * vx, z - A2.y - t * vz);
          if (d < best) best = d;
        }
      }
      for (const hf of holeFlat) if (pointInPoly(x, z, hf)) return -best;
      return best;
    } : null;
    // у прямой дорожки без середины линии идут вдоль длинной стороны
    const straightLane = cls === 'track' && !ringDist;

    const push = (x, z) => {
      const dx = x - ox, dz = z - oz;
      const lu = dx * ux + dz * uz, lv = -dx * uz + dz * ux;
      P.push(x, (flatY !== null ? flatY : H(x, z)) + LIFT, z);
      C.push(enc(col[0]), enc(col[1]), enc(col[2]));
      if (ringDist) U.push(lu, ringDist(x, z), W, L);
      else if (straightLane) U.push(W >= L ? lu : lv, W >= L ? lv : lu, Math.max(W, L), Math.min(W, L));
      else U.push(lu, lv, W, L);
      K.push(kind); S.push(surf);
      return base++;
    };
    // Дробим треугольник, пока он не ляжет на рельеф: сетка земли — 9 м
    // клетками, и крупный треугольник на склоне провисал бы над травой или
    // уходил под неё. На ровной (срезанной под поле) земле дробить незачем —
    // проверяем, лежат ли середины сторон и центр на плоскости углов.
    // Возле дороги мельчим, пока не отделим асфальт: семь проб, все на
    // асфальте — кусок выбросить, ни одной — рисовать как есть.
    const probes = (A, B, Cc) => [A, B, Cc,
      [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2],
      [(B[0] + Cc[0]) / 2, (B[1] + Cc[1]) / 2],
      [(Cc[0] + A[0]) / 2, (Cc[1] + A[1]) / 2],
      [(A[0] + B[0] + Cc[0]) / 3, (A[1] + B[1] + Cc[1]) / 3]];
    const bent = (A, B, Cc, tol) => {
      if (flatY !== null) return false;
      const ha = H(A[0], A[1]), hb = H(B[0], B[1]), hc = H(Cc[0], Cc[1]);
      const chk = (x, z, h) => Math.abs(H(x, z) - h);
      const dev = Math.max(
        chk((A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (ha + hb) / 2),
        chk((B[0] + Cc[0]) / 2, (B[1] + Cc[1]) / 2, (hb + hc) / 2),
        chk((Cc[0] + A[0]) / 2, (Cc[1] + A[1]) / 2, (hc + ha) / 2),
        chk((A[0] + B[0] + Cc[0]) / 3, (A[1] + B[1] + Cc[1]) / 3, (ha + hb + hc) / 3));
      return dev > tol;
    };
    // Дробление идёт СВОИМ стеком, а не рекурсией: из рекурсии управление
    // менеджеру не вернёшь.
    const d2 = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
    const stack = [];
    for (const f of tri) {
      const A = [all[f[0]].x, all[f[0]].y], B = [all[f[1]].x, all[f[1]].y], Cc = [all[f[2]].x, all[f[2]].y];
      const cross = (B[0] - A[0]) * (Cc[1] - A[1]) - (B[1] - A[1]) * (Cc[0] - A[0]);
      stack.push(cross > 0 ? [A, Cc, B, 0] : [A, B, Cc, 0]);
    }
    let made = 0;
    while (stack.length) {
      const [A, B, Cc, depth] = stack.pop();
      const maxE = Math.max(d2(A, B), d2(B, Cc), d2(Cc, A));
      // Дом на площадке — ошибка наложения контуров OSM (угол дома на
      // футбольном поле, разметка уходит под стену): такие куски выбрасываем
      // так же, как куски на проезжей части.
      let hit = 0;
      if (skipOnRoad) {
        for (const q of probes(A, B, Cc)) if (onAsphalt(q[0], q[1]) || BLD.find(q[0], q[1])) hit++;
        if (hit === 7) continue;                     // целиком на дороге или в доме
      }
      // крупный треугольник может накрыть узел сетки целиком — ему допуск строже
      // Парковке допуск шире: она лежит ПОД дорогами и машинами, а вершин у
      // неё больше, чем у всех полей квартала вместе взятых.
      const loose = a.k === 'parking';
      const needTerrain = flatY === null && maxE > (loose ? 4 : 2.5) &&
        bent(A, B, Cc, maxE > 9.5 ? (loose ? 0.03 : 0.005) : (loose ? 0.07 : 0.03));
      const needEdge = hit > 0 && maxE > 1.2;        // кромка дороги рядом
      if (depth < 8 && (needTerrain || needEdge)) {
        const mAB = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
        const mBC = [(B[0] + Cc[0]) / 2, (B[1] + Cc[1]) / 2];
        const mCA = [(Cc[0] + A[0]) / 2, (Cc[1] + A[1]) / 2];
        stack.push([A, mAB, mCA, depth + 1], [mAB, B, mBC, depth + 1],
                   [mCA, mBC, Cc, depth + 1], [mAB, mBC, mCA, depth + 1]);
        continue;
      }
      if (skipOnRoad && hit >= 4) continue;          // больше половины на дороге
      const i0 = push(A[0], A[1]), i1 = push(B[0], B[1]), i2 = push(Cc[0], Cc[1]);
      I.push(i0, i1, i2);
      if ((++made & 511) === 511) yield;
    }

    // Бордюр по кромке площадки: полотно лежит на 13–38 см выше земли, и
    // без бортика с уровня глаз под краем видно траву. Раньше стенка
    // строилась с обеими сторонами на ОДНИХ вершинах — нормали гасили друг
    // друга, и она выходила чёрной («глухая чёрная стенка» у поля). Теперь у
    // каждой стороны свои вершины. Парковке, АЗС, кладбищу и аллее бортик не
    // нужен: они лежат почти вровень с землёй.
    if (a.k !== 'parking' && a.k !== 'fuel' && a.k !== 'cemetery' && a.k !== 'market') {
      const WALL = [0.616, 0.604, 0.573];
      const rings = [pts, ...(fillHole ? [] : holes)];
      // обход контура: знак площади в осях (x, z); у дыры — наоборот
      const outward = ring => {
        let A2 = 0;
        for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; A2 += p.x * q.y - q.x * p.y; }
        return (A2 > 0) === (ring === pts);
      };
      for (const ring of rings) {
        for (let i = 0; i < ring.length; i++) {
          const A = ring[i], B = ring[(i + 1) % ring.length];
          const L2 = Math.hypot(B.x - A.x, B.y - A.y);
          // длинную сторону режем, чтобы бортик шёл по рельефу
          const k = Math.max(1, Math.ceil(L2 / 9));
          for (let s2 = 0; s2 < k; s2++) {
            const ax = A.x + (B.x - A.x) * s2 / k, az = A.y + (B.y - A.y) * s2 / k;
            const bx = A.x + (B.x - A.x) * (s2 + 1) / k, bz = A.y + (B.y - A.y) * (s2 + 1) / k;
            if (skipOnRoad && (onAsphalt((ax + bx) / 2, (az + bz) / 2) || BLD.find((ax + bx) / 2, (az + bz) / 2))) continue;
            const gA = H(ax, az), gB = H(bx, bz);
            const tA = gA + LIFT, tB = gB + LIFT;
            const q0 = base;
            for (const [vx, vz, vy] of [[ax, az, tA], [bx, bz, tB], [bx, bz, gB - 0.15], [ax, az, gA - 0.15]]) {
              P.push(vx, vy, vz);
              C.push(enc(WALL[0]), enc(WALL[1]), enc(WALL[2]));
              U.push(0, 0, 1, 1);
              K.push(KIND.plain); S.push(0);
              base++;
            }
            // лицом наружу: у внешнего контура — от площадки, у внутреннего
            // (кромка беговой дорожки) — к полю
            if (outward(ring)) I.push(q0, q0 + 1, q0 + 2, q0, q0 + 2, q0 + 3);
            else I.push(q0, q0 + 2, q0 + 1, q0, q0 + 3, q0 + 2);
          }
        }
      }
    }

    // Парковка: места и их разметка
    if (a.k === 'parking') {
      const st = planParking(a, { segs, buildings: BLD, trees: treeXZ, blockers });
      a.__stalls = st;
      stalls += st.length;
      const seen = new Set();
      const key = (x, z) => Math.round(x * 3) + ',' + Math.round(z * 3);
      const lift = LIFT + 0.02;
      let run = null;
      for (const m of st) {
        const q = m.q;
        // боковые штрихи общие у соседних мест — не дублируем
        for (const [p0, p1] of [[q[0], q[3]], [q[1], q[2]]]) {
          const k = key((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2);
          if (seen.has(k)) continue;
          seen.add(k);
          paint(p0[0], p0[1], p1[0], p1[1], 0.14, lift);
        }
        // линия по торцам: у мест одного ряда — одной полосой
        if (run && Math.hypot(run.ex - q[3][0], run.ez - q[3][1]) < 0.05) { run.ex = q[2][0]; run.ez = q[2][1]; }
        else { if (run) paint(run.sx, run.sz, run.ex, run.ez, 0.14, lift); run = { sx: q[3][0], sz: q[3][1], ex: q[2][0], ez: q[2][1] }; }
      }
      if (run) paint(run.sx, run.sz, run.ex, run.ez, 0.14, lift);
      if ((work += st.length) > 60) { work = 0; yield; }
    }
    drawn++;
  }

  yield;
  // ---- аллеи парков: лента заданной ширины по обмеренной оси ----
  // Ось снята агентом по спутнику, ширина из отчёта. Ленту строим сами:
  // на каждой вершине берём биссектрису двух соседних отрезков, иначе на
  // повороте аллея рвётся или наезжает сама на себя.
  {
    const LIFT = LIFT0 + 7 * 0.035;
    // Пролёты, которые уже рисует дорожка OSM или полотно, выкидываем, а
    // остаток сгущаем до 4 м (pathdup.js): иначе вторая лента висела над землёй.
    const DUP = (pl.paths || []).length ? pathDupIndex(allRoads) : null;
    for (const pa of pl.paths || []) {
      const hw = Math.max(0.9, (pa.w || 3) / 2);
      for (const q of densePath(pa.pts, hw, DUP)) {
        const m = q.length / 2;
        if (m < 2) continue;
        const kind = KIND.path;
        const col = pa.s === 'ground' ? [0.412, 0.353, 0.271] : BASE.path;
        let prev = null, along = 0;
        if ((work += m) > 400) { work = 0; yield; }
        for (let i = 0; i < m; i++) {
          let nx = 0, nz = 0, cnt = 0;
          if (i > 0) {
            const dx = q[i * 2] - q[i * 2 - 2], dz = q[i * 2 + 1] - q[i * 2 - 1];
            const l = Math.hypot(dx, dz);
            if (l > 1e-6) { nx += -dz / l; nz += dx / l; cnt++; along += l; }
          }
          if (i < m - 1) {
            const dx = q[i * 2 + 2] - q[i * 2], dz = q[i * 2 + 3] - q[i * 2 + 1];
            const l = Math.hypot(dx, dz);
            if (l > 1e-6) { nx += -dz / l; nz += dx / l; cnt++; }
          }
          let len = Math.hypot(nx, nz);
          if (!cnt || len < 1e-6) { nx = 1; nz = 0; len = 1; cnt = 1; }
          const sc = Math.min(1.6, cnt / len);
          nx /= len; nz /= len;
          const cur = [];
          for (const sg of [-1, 1]) {
            const x = q[i * 2] + nx * sg * hw * sc, z = q[i * 2 + 1] + nz * sg * hw * sc;
            P.push(x, H(x, z) + LIFT, z);
            C.push(enc(col[0]), enc(col[1]), enc(col[2]));
            U.push(along, sg * hw, hw * 2, 0);
            K.push(kind); S.push(0);
            cur.push(base++);
          }
          if (prev) I.push(prev[0], prev[1], cur[0], prev[1], cur[1], cur[0]);
          prev = cur;
        }
        drawn++;
      }
    }
  }

  yield;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('color', new THREE.Uint8BufferAttribute(C, 3, true));
  geo.setAttribute('aArea', new THREE.Float32BufferAttribute(U, 4));
  geo.setAttribute('aAKind', new THREE.Float32BufferAttribute(K, 1));
  geo.setAttribute('aASurf', new THREE.Float32BufferAttribute(S, 1));
  geo.setIndex(I);
  geo.computeVertexNormals();
  // Кому ставить объекты НА площадку, а не под неё: подъём полотна над
  // нарисованной землёй (у АЗС — над её ровной отметкой). Берём самую
  // верхнюю площадку в точке.
  world.__areaLift = (x, z) => {
    let best = null;
    for (const [a, v] of liftOf) {
      const lift = typeof v === 'number' ? v : v.lift;
      if (best !== null && lift <= best) continue;
      if (!pointInPoly(x, z, a.poly)) continue;
      best = typeof v === 'number' ? v : v.flat + v.lift - terrain.gridHeightAt(x, z);
    }
    return best ?? 0;
  };

  const mesh = new THREE.Mesh(geo, areaMaterial());
  mesh.name = 'areas';
  mesh.receiveShadow = true;
  mesh.userData.count = drawn;
  mesh.userData.stalls = stalls;
  return mesh;
}

// габаритная рамка многоугольника по вращающимся штангенциркулям
function obbOf(poly) {
  const n = poly.length / 2;
  let best = null;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = poly[j * 2] - poly[i * 2], dz = poly[j * 2 + 1] - poly[i * 2 + 1];
    const l = Math.hypot(dx, dz);
    if (l < 1e-6) continue;
    const ux = dx / l, uz = dz / l;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let k = 0; k < n; k++) {
      const x = poly[k * 2], z = poly[k * 2 + 1];
      const u = x * ux + z * uz, v = -x * uz + z * ux;
      if (u < u0) u0 = u; if (u > u1) u1 = u;
      if (v < v0) v0 = v; if (v > v1) v1 = v;
    }
    const area = (u1 - u0) * (v1 - v0);
    if (!best || area < best.area) best = { area, ux, uz, u0, u1, v0, v1 };
  }
  if (!best) return null;
  const { ux, uz, u0, u1, v0, v1 } = best;
  // начало локальных осей — угол рамки, в мировых координатах
  const ox = u0 * ux - v0 * uz, oz = u0 * uz + v0 * ux;
  return { ox, oz, ux, uz, W: u1 - u0, L: v1 - v0 };
}
