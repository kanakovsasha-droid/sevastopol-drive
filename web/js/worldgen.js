import * as THREE from 'three';
import { SEA_FLOOR } from './terrain.js?v=fcd256a8';
import { buildingMaterial, roadMaterial, terrainMaterial, waterMaterial, areaMaterial } from './materials.js?v=fcd256a8';
import { buildCoverage } from './coverage.js?v=fcd256a8';

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
// Севастополь сложен из инкерманского известняка: стены кремовые и охристые,
// крыши — терракота и шифер. Серых коробок здесь нет.
const WALLS = [
  [0.918, 0.871, 0.769], [0.886, 0.827, 0.706], [0.933, 0.902, 0.831],
  [0.859, 0.784, 0.659], [0.824, 0.741, 0.604], [0.902, 0.855, 0.765],
  [0.796, 0.706, 0.561], [0.906, 0.863, 0.769], [0.847, 0.808, 0.729],
  [0.871, 0.816, 0.702], [0.839, 0.769, 0.643], [0.788, 0.741, 0.663],
  [0.839, 0.722, 0.494], [0.800, 0.682, 0.463],   // охра
  [0.906, 0.851, 0.686], [0.878, 0.831, 0.702],   // палевый
  [0.812, 0.812, 0.788], [0.757, 0.765, 0.753],   // светло-серый
  [0.945, 0.937, 0.914], [0.965, 0.949, 0.918],   // белёный
];
const ROOFS_TILE = [[0.545, 0.271, 0.196], [0.494, 0.239, 0.169], [0.612, 0.325, 0.216], [0.463, 0.255, 0.192]];
const ROOFS_FLAT = [[0.318, 0.310, 0.294], [0.286, 0.310, 0.325], [0.361, 0.349, 0.329], [0.255, 0.267, 0.275]];
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
function urbanMask(world, x0, z0, x1, z1, res = 4) {
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
  for (const r of world.roads) {
    const rad = r.w / 2 + (r.c <= 3 ? 6 : 2.5);
    const p = r.pts;
    for (let i = 0; i < p.length / 2 - 1; i++) {
      const ax = p[i * 2], az = p[i * 2 + 1], bx = p[i * 2 + 2], bz = p[i * 2 + 3];
      const len = Math.hypot(bx - ax, bz - az);
      const steps = Math.max(1, Math.ceil(len / (res * 0.7)));
      for (let s = 0; s <= steps; s++) disc(ax + (bx - ax) * s / steps, az + (bz - az) * s / steps, rad);
    }
  }
  for (const b of world.buildings) {
    const bb = bbox(b.poly);
    const i0 = Math.max(0, Math.floor((bb[0] - x0 - 4) / res)), i1 = Math.min(W - 1, Math.ceil((bb[2] - x0 + 4) / res));
    const j0 = Math.max(0, Math.floor((bb[1] - z0 - 4) / res)), j1 = Math.min(H - 1, Math.ceil((bb[3] - z0 + 4) / res));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) m[j * W + i] = 255;
  }
  // два прохода размытия — чтобы город переходил в склоны, а не обрывался
  let a = m, b = new Uint8Array(W * H);
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 0; j < H; j++)
      for (let i = 0; i < W; i++) {
        let s = 0, n = 0;
        for (let dj = -2; dj <= 2; dj++)
          for (let di = -2; di <= 2; di++) {
            const jj = j + dj, ii = i + di;
            if (jj < 0 || ii < 0 || jj >= H || ii >= W) continue;
            s += a[jj * W + ii]; n++;
          }
        b[j * W + i] = s / n;
      }
    [a, b] = [b, a];
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
function removeBuildings(heights, nx, x0, z0, dx, dz, buildings) {
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
  }

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
  }
  return masked;
}

// ---------------------------------------------------------------- коридор дорог
// Полотно, посаженное прямо на DEM, повторяет каждую кочку — ехать по такому
// нельзя, и выглядит как стиральная доска. Считаем сглаженный профиль вдоль
// осевой и ВДАВЛИВАЕМ под него рельеф: дорога ложится ровно, грунт подходит к ней плавно.
function roadCorridor(world, terrain, x0, z0, x1, z1, res = 5) {
  const W = Math.ceil((x1 - x0) / res), H = Math.ceil((z1 - z0) / res);
  const tgt = new Float32Array(W * H), wgt = new Float32Array(W * H);
  const cap = new Float32Array(W * H).fill(Infinity);
  // Плоская зона обязана быть шире ДИАГОНАЛИ ячейки рельефа (8.7·√2 ≈ 12.3 м):
  // высота в точке берётся из четырёх углов ячейки, и угол по диагонали,
  // не попавший в плоскую зону, поднимает поверхность над кромкой полотна.
  // Плюс потолок: рядом с дорогой рельеф не имеет права быть выше её больше,
  // чем на пологий откос — иначе на склоне он просто накрывает улицу.
  const STEP = 4, FLAT = 13.0, FEATHER = 14.0, CAP_SLOPE = 0.55;

  for (const r of world.roads) {
    if (r.c > 3 || r.br || r.tn) continue;      // мосты и тоннели на грунт не сажаем
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
    if (n < 2) continue;

    let h = new Float32Array(n);
    for (let i = 0; i < n; i++) h[i] = terrain.gridHeightAt(sx[i], sz[i]);
    // Низкочастотный фильтр [1,2,1]. Но сглаживание тянет профиль к среднему,
    // и на пологом месте дорога уезжает вверх — вокруг неё коридор достраивает
    // насыпь, которой в жизни нет. Поэтому после сглаживания возвращаем профиль
    // к реальной земле: выемка не глубже 1.5 м, насыпь не выше 0.9 м.
    const raw = Float32Array.from(h);
    const tmp = new Float32Array(n);
    const MAX_CUT = 1.5, MAX_FILL = 0.9;
    const smooth = passes => {
      for (let pass = 0; pass < passes; pass++) {
        for (let i = 0; i < n; i++) {
          const a = h[Math.max(0, i - 1)], b = h[i], c = h[Math.min(n - 1, i + 1)];
          tmp[i] = (a + 2 * b + c) / 4;
        }
        h.set(tmp);
      }
    };
    // Жёсткое подрезание возвращает в профиль изломы исходного рельефа —
    // это и есть «дорога идёт буграми». Сжимаем отклонение мягко (tanh):
    // у земли профиль держится, но кривая остаётся гладкой везде.
    const soft = () => {
      for (let i = 0; i < n; i++) {
        const d = h[i] - raw[i];
        const lim = d < 0 ? MAX_CUT : MAX_FILL;
        h[i] = raw[i] + lim * Math.tanh(d / lim);
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
    smooth(5); soft(); limitGrade(); smooth(2); soft(); limitGrade(); smooth(1);

    const inner = r.w / 2 + FLAT, rad = inner + FEATHER;
    for (let i = 0; i < n; i++) {
      const cx = (sx[i] - x0) / res, cz = (sz[i] - z0) / res, cr = rad / res;
      const i0 = Math.max(0, Math.floor(cx - cr)), i1 = Math.min(W - 1, Math.ceil(cx + cr));
      const j0 = Math.max(0, Math.floor(cz - cr)), j1 = Math.min(H - 1, Math.ceil(cz + cr));
      for (let j = j0; j <= j1; j++)
        for (let k = i0; k <= i1; k++) {
          const d = Math.hypot((k - cx) * res, (j - cz) * res);
          if (d > rad) continue;
          const w = d <= inner ? 1 : Math.max(0, 1 - (d - inner) / FEATHER);
          const idx = j * W + k;
          // Потолок ОБЯЗАН считаться по той же улице, что задала высоту ячейки.
          // Минимум по всем дорогам в радиусе продавливал грунт под нижней улицей,
          // и соседняя верхняя оставалась висеть в воздухе на несколько метров.
          if (w > wgt[idx]) {
            wgt[idx] = w;
            tgt[idx] = h[i];
            cap[idx] = h[i] + Math.max(0, d - inner) * CAP_SLOPE;
          }
        }
    }
  }
  // Соседние улицы спорят за одни ячейки, и жёсткий выбор одной из них рвёт
  // поверхность обрывом на ровном месте — «рельеф, которого не бывает».
  // Размываем ЦЕЛЕВУЮ ВЫСОТУ с весом: внутри одной улицы значения одинаковые
  // и плоскость сохраняется, а на стыке двух высот получается плавный переход.
  const sm = new Float32Array(W * H);
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 0; j < H; j++)
      for (let i = 0; i < W; i++) {
        const idx = j * W + i;
        if (wgt[idx] <= 0) { sm[idx] = tgt[idx]; continue; }
        let sh = 0, sw = 0;
        for (let dj = -1; dj <= 1; dj++)
          for (let di = -1; di <= 1; di++) {
            const jj = j + dj, ii = i + di;
            if (jj < 0 || ii < 0 || jj >= H || ii >= W) continue;
            const k = jj * W + ii;
            if (wgt[k] <= 0) continue;
            const bw = (di === 0 && dj === 0) ? 4 : (di === 0 || dj === 0) ? 2 : 1;
            sh += tgt[k] * wgt[k] * bw; sw += wgt[k] * bw;
          }
        sm[idx] = sw > 0 ? sh / sw : tgt[idx];
      }
    tgt.set(sm);
  }
  // Ограничение уклона ПО ВСЕМУ ПОЛЮ, а не по профилю каждой улицы отдельно.
  // Соседняя крутая улочка занимает ячейку своей высотой, и профиль соседа
  // скачет на её значение: замер давал 69% уклона там, где его быть не может.
  // Разводим соседние ячейки навстречу друг другу, пока перепад не уложится
  // в 15% — реальные севастопольские спуски столько и имеют.
  const LIM = res * 0.185;
  for (let pass = 0; pass < 60; pass++) {
    let fixed = 0;
    for (let j = 0; j < H; j++)
      for (let i = 0; i < W; i++) {
        const a = j * W + i;
        if (wgt[a] <= 0) continue;
        for (const o of [1, W]) {
          const b2 = a + o;
          if ((o === 1 && i === W - 1) || (o === W && j === H - 1)) continue;
          if (wgt[b2] <= 0) continue;
          const d = tgt[a] - tgt[b2];
          if (Math.abs(d) <= LIM) continue;
          const ex = (Math.abs(d) - LIM) * 0.5 * Math.sign(d);
          tgt[a] -= ex; tgt[b2] += ex;
          fixed++;
        }
      }
    if (!fixed) break;
  }

  // потолок пересчитываем по сглаженной высоте, иначе он режет её же
  for (let i = 0; i < W * H; i++) if (wgt[i] > 0 && cap[i] < tgt[i]) cap[i] = tgt[i];

  return { tgt, wgt, cap, W, H, x0, z0, res };
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
  let sw = 0, sh = 0, wsum = 0, cap = Infinity;
  for (let dj = 0; dj < 2; dj++)
    for (let di = 0; di < 2; di++) {
      const bw = (di ? fx : 1 - fx) * (dj ? fz : 1 - fz);
      const k = (j + dj) * c.W + (i + di);
      const w = c.wgt[k];
      sw += w * bw;
      if (w > 0) { sh += c.tgt[k] * w * bw; wsum += w * bw; }
      if (c.cap[k] < cap) cap = c.cap[k];
    }
  if (wsum <= 0) return { h: 0, w: 0, cap };
  return { h: sh / wsum, w: sw, cap };
}

// ------------------------------------------------------------------ море
// SRTM снят с шагом 30 м и засыпает бухты: Артиллерийская и Хрустальный пляж
// оказывались сушей. Берег в OSM есть (natural=coastline), но направление
// линий тут непоследовательное, и правило «суша слева» врёт. Поэтому не
// доверяем обходу вовсе: растеризуем берег как барьер и заливаем воду от
// открытого моря. Заодно копим расстояние от берега — по нему делаем отмель.
function seaMask(world, terrain, x0, z0, x1, z1, res = 8) {
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
  let segs = 0;
  for (const ln of lines) {
    const p = ln.pts;
    for (let k = 0; k + 3 < p.length; k += 2) {
      const ax = p[k], az = p[k + 1], bx = p[k + 2], bz = p[k + 3];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 0.01) continue;
      segs++;
      const n = Math.max(1, Math.ceil(L / (res * 0.4)));
      for (let t = 0; t <= n; t++) mark(ax + (bx - ax) * t / n, az + (bz - az) * t / n);
    }
  }

  // затравка — клетки по краю карты, где рельеф заведомо под водой
  const dist = new Int16Array(W * H).fill(-1);
  const q = new Int32Array(W * H);
  let qh = 0, qt = 0;
  // Одного барьера мало: линия берега обрывается на краю выгрузки OSM, и вода
  // утекала в город с юга — затопило 99% карты. Второе условие: заливка не
  // поднимается выше LIMIT. Засыпанные SRTM бухты лежат в паре метров,
  // а центр стоит на холмах в 20–60 м, так что порог их надёжно разделяет.
  const LIMIT = 5.5;
  const dem = new Float32Array(W * H);
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) dem[idx(i, j)] = terrain.heightAt(x0 + i * res, z0 + j * res);
  const seed = (i, j) => {
    const c = idx(i, j);
    if (wall[c] || dist[c] >= 0 || dem[c] > -1.5) return;
    dist[c] = 0; q[qt++] = c;
  };
  for (let i = 0; i < W; i++) { seed(i, 0); seed(i, H - 1); }
  for (let j = 0; j < H; j++) { seed(0, j); seed(W - 1, j); }

  while (qh < qt) {
    const c = q[qh++];
    const i = c % W, j = (c / W) | 0, d = dist[c];
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= W || b >= H) continue;
      const n = idx(a, b);
      if (wall[n] || dist[n] >= 0 || dem[n] > LIMIT) continue;
      dist[n] = d + 1; q[qt++] = n;
    }
  }
  let cells = 0;
  for (let c = 0; c < dist.length; c++) if (dist[c] >= 0) cells++;

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

  // глубина: у берега почти ноль, дальше отмель уходит вниз
  const depthAt = (x, z) => {
    const i = Math.round((x - x0) / res), j = Math.round((z - z0) / res);
    if (i < 0 || j < 0 || i >= W || j >= H) return null;
    const c = idx(i, j);
    if (shore[c]) return 0.35;
    const d = dist[c];
    if (d < 0) return null;                       // суша
    return 0.35 + Math.min(7.5, d * res * 0.055);
  };
  return { depthAt, cells, segs, res, W, H };
}

// ---------------------------------------------------------------- рельеф
const mesh_stats = {};
export function buildTerrain(terrain, world, opts = {}) {
  const pad = opts.pad ?? 1400, seg = opts.segments ?? 900;   // 8.7 м вместо 11 м
  const b = world.meta.bounds;
  const x0 = b.minX - pad, x1 = b.maxX + pad;
  const z0 = b.minZ - pad, z1 = b.maxZ + pad;
  const nx = seg + 1, dx = (x1 - x0) / seg, dz = (z1 - z0) / seg;

  const mask = urbanMask(world, x0, z0, x1, z1);
  const corr = roadCorridor(world, terrain, x0, z0, x1, z1);
  terrain.setCorridor(corr);
  terrain.setSampler(sampleCorridor);
  const corrAt = (x, z) => sampleCorridor(corr, x, z);
  const greens = new PolyGrid(world.green);
  const GREEN_COL = {
    park:  [0.353, 0.443, 0.247], grass: [0.427, 0.478, 0.271],
    wood:  [0.235, 0.325, 0.192], scrub: [0.435, 0.451, 0.294],
    pitch: [0.318, 0.443, 0.259], sand:  [0.827, 0.769, 0.616],
    yard:  [0.396, 0.388, 0.373],
  };
  const ROCK = [0.686, 0.643, 0.553];

  const pos = new Float32Array(nx * nx * 3);
  const col = new Uint8Array(nx * nx * 3);
  const ter = new Uint8Array(nx * nx * 2);      // x — застроенность, y — камень
  const heights = new Float32Array(nx * nx);

  // Сырые высоты + снос застройки. Делаем ДО коридора дорог: иначе профиль улиц
  // считается по крышам соседних домов и уезжает вверх.
  for (let iz = 0; iz < nx; iz++)
    for (let ix = 0; ix < nx; ix++)
      heights[iz * nx + ix] = terrain.heightAt(x0 + ix * dx, z0 + iz * dz);
  const cut = removeBuildings(heights, nx, x0, z0, dx, dz, world.buildings);

  // Море вырезаем ДО коридора дорог: иначе набережная считает профиль по
  // засыпанной бухте. Суше у самой воды даём небольшой запас над уровнем —
  // иначе полотно воды спорит за глубину с плоским берегом и мерцает.
  const sea = seaMask(world, terrain, x0, z0, x1, z1);
  let carved = 0;
  for (let iz = 0; iz < nx; iz++)
    for (let ix = 0; ix < nx; ix++) {
      const i = iz * nx + ix;
      const d = sea.depthAt(x0 + ix * dx, z0 + iz * dz);
      if (d == null) { if (heights[i] < 0.32) heights[i] = 0.32; continue; }
      const want = -d;
      if (heights[i] > want) { heights[i] = want; carved++; }
    }
  mesh_stats.sea = { клеток: sea.cells, сегментовБерега: sea.segs, вершинВрезано: carved };

  terrain.setGrid(x0, z0, dx, dz, nx, heights);   // чтобы коридор считался уже по земле

  for (let iz = 0; iz < nx; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const i = iz * nx + ix;
      const x = x0 + ix * dx, z = z0 + iz * dz;
      let h = heights[i];
      const cr = corrAt(x, z);
      if (cr) {
        if (cr.w > 0) h = h * (1 - cr.w) + cr.h * cr.w;   // рельеф подстраивается под дорогу
        if (h > cr.cap) h = cr.cap;                        // и не смеет над ней нависать
      }
      heights[i] = h;
      pos[i * 3] = x; pos[i * 3 + 1] = h; pos[i * 3 + 2] = z;

      const slope = terrain.slopeAt(x, z, 12);
      const rock = Math.min(1, Math.max(0, (slope - 0.32) / 0.42));
      let c;
      if (h < 1.2) c = [0.741, 0.694, 0.573];
      else {
        const dry = Math.min(1, Math.max(0, (h - 20) / 130));
        c = [0.400 + dry * 0.135, 0.451 + dry * 0.075, 0.286 + dry * 0.090];
      }
      let u = sampleMask(mask, x, z);
      if (cr) u = Math.max(u, cr.w);          // обочина дороги тоже город, не луг
      if (u > 0.01 && h >= 1.2) c = [
        c[0] + (URBAN[0] - c[0]) * u, c[1] + (URBAN[1] - c[1]) * u, c[2] + (URBAN[2] - c[2]) * u,
      ];
      const g = greens.find(x, z);
      if (g && h >= 1.2) {
        const gc = GREEN_COL[g.kind] || GREEN_COL.grass;
        c = [c[0] + (gc[0] - c[0]) * 0.88, c[1] + (gc[1] - c[1]) * 0.88, c[2] + (gc[2] - c[2]) * 0.88];
      }
      c = [c[0] + (ROCK[0] - c[0]) * rock, c[1] + (ROCK[1] - c[1]) * rock, c[2] + (ROCK[2] - c[2]) * rock];
      col[i * 3] = enc(c[0]); col[i * 3 + 1] = enc(c[1]); col[i * 3 + 2] = enc(c[2]);
      ter[i * 2] = Math.round(255 * u);
      ter[i * 2 + 1] = Math.round(255 * rock);
    }
  }

  const idx = new Uint32Array(seg * seg * 6);
  let k = 0;
  for (let iz = 0; iz < seg; iz++)
    for (let ix = 0; ix < seg; ix++) {
      const a = iz * nx + ix, b2 = a + 1, c2 = a + nx, d = c2 + 1;
      idx[k++] = a; idx[k++] = c2; idx[k++] = b2;
      idx[k++] = b2; idx[k++] = c2; idx[k++] = d;
    }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
  geo.setAttribute('aTer', new THREE.BufferAttribute(ter, 2, true));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();

  // финальная сетка — уже с коридорами дорог
  terrain.setGrid(x0, z0, dx, dz, nx, heights);
  mesh_stats.cut = cut;

  const mesh = new THREE.Mesh(geo, terrainMaterial());
  mesh.name = 'terrain';
  mesh.receiveShadow = true;
  mesh.userData.stats = { srezanoUzlovPodDomami: mesh_stats.cut, more: mesh_stats.sea };
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
    const k = Math.max(1, Math.ceil(len / step));
    for (let j = 0; j < k; j++) out.push(ax + dx * j / k, az + dz * j / k);
  }
  out.push(pts[(n - 1) * 2], pts[(n - 1) * 2 + 1]);
  return out;
}

export function buildRoads(world, terrain, chunk = 500) {
  const chunks = new Map();
  const bucket = (x, z) => {
    const k = Math.floor(x / chunk) + ',' + Math.floor(z / chunk);
    let c = chunks.get(k);
    if (!c) chunks.set(k, c = { P: [], C: [], R: [], K: [], O: [], S: [], I: [], base: 0 });
    return c;
  };
  // Последний рубеж. Какая бы причина ни развела профиль дороги и рельеф,
  // полотно не имеет права ни утонуть, ни повиснуть больше чем на 1.2 м:
  // иначе получаются балки в воздухе и куски улиц под землёй.
  const SAFE = 0.35;   // лучше небольшой бугор, чем дыра в полотне
  const H = (x, z) => {
    const g = terrain.gridHeightAt(x, z);
    const d = terrain.driveHeightAt(x, z);
    return d < g - SAFE ? g - SAFE : d > g + SAFE ? g + SAFE : d;
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
  // Сплошную перед перекрёстком ставим ТОЛЬКО у пересечения проезжих улиц
  // (самая широкая ветка от 8 м) и на коротком подходе. С радиусом 14 м и
  // всеми узлами подряд сплошной оказывалось 45% длины улиц — «везде сплошная».
  const nearBigJunction = (x, z, extra) => {
    const a = jmap.get(Math.floor(x / jcell) * 100003 + Math.floor(z / jcell));
    if (!a) return false;
    for (const j of a) {
      if ((j.mw || 0) < 8) continue;
      const R = j.r + 1.6 + extra;
      if ((x - j.x) ** 2 + (z - j.z) ** 2 >= R * R) continue;
      if (j.poly && polyOut(j.poly, x, z) > 1.6 + extra) continue;
      return true;
    }
    return false;
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
  const strip = (ch, pts, mt, offA, offB, lift, cls, uW, skipJ, skipFn, own = -1, lanes = 0, surf = 0, hFn = H) => {
    const col = ROAD_COLORS[cls];
    const start = ch.base;
    const aArr = typeof offA === 'number' ? null : offA;
    const bArr = typeof offB === 'number' ? null : offB;
    for (let i = 0; i < mt.n; i++) {
      const t = 0.94 + 0.12 * (((i * 2654435761) >>> 8) & 255) / 255;
      for (let s = 0; s < 2; s++) {
        const off = s === 0 ? (aArr ? aArr[i] : offA) : (bArr ? bArr[i] : offB);
        const x = pts[i * 2] + mt.NX[i] * off * mt.S[i];
        const z = pts[i * 2 + 1] + mt.NZ[i] * off * mt.S[i];
        ch.P.push(x, hFn(x, z) + lift, z);
        ch.C.push(enc(col[0] * t), enc(col[1] * t), enc(col[2] * t));
        // Разметку шейдер кладёт по aRoad.x·ширина/2 = метры от осевой. У
        // ужатого полотна кромка уже не на ±полуширине, и постоянные ∓1
        // утащили бы осевую линию в геометрический центр обрезка. Пишем
        // настоящую долю — разметка остаётся привязанной к оси улицы.
        ch.R.push(aArr ? off / (uW * 0.5) : (s === 0 ? -1 : 1), mt.D[i], uW, lanes);
        // Дробные 0.4 в классе — «до перекрёстка меньше 14 м». По ПДД пунктир
        // 1.5 перед перекрёстком сменяется сплошной 1.1: перестраиваться там
        // нельзя. Все пороги классов стоят на .5, поэтому добавка безопасна.
        // И только на многополосной: на обычной двухполосной улице осевая идёт
        // к перекрёстку пунктиром, сплошную там по ПДД не рисуют.
        ch.K.push(Math.abs(lanes) >= 3 && nearBigJunction(x, z, 9) ? cls + 0.4 : cls);
        ch.O.push(own); ch.S.push(surf);
      }
    }
    // Обход даёт нормаль вверх ТОЛЬКО при таком порядке: offA левее offB,
    // а нормаль митры смотрит против оси. Обратный порядок кладёт полосу лицом в землю.
    for (let i = 0; i < mt.n - 1; i++) {
      if (skipJ && midSkip(pts, i, 5.5)) continue;
      if (skipFn && skipFn(i)) continue;
      const a = start + i * 2, b = a + 1, c = a + 2, d = a + 3;
      ch.I.push(a, b, c, b, d, c);
    }
    ch.base += mt.n * 2;
  };

  // Вертикальная грань бордюра вдоль одного смещения.
  const kerb = (ch, pts, mt, off, yLow, yHigh, skipFn, own = -1) => {
    const skipJ = true;
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
      ch.I.push(a, c, b, b, c, d);   // двусторонний: бордюр видно с обеих сторон
    }
    ch.base += mt.n * 2;
  };

  const SIDEWALK = 2.6, KERB_H = 0.17, ROAD_Y = 0.14;
  const drawn = new Set();
  let zebras = 0;

  // Единый растр покрытия: им же пользуются расстановка деревьев и аудит.
  const COV = world.__coverage || (world.__coverage = buildCoverage(world));
  const cellOf = COV.cell;
  const cover = COV.owner, coverW = COV.width;
  const covered = COV.share;
  const onOtherRoad = (x, z, own) => COV.onOther(x, z, own);
  const underWider = (x, z, own, w) => COV.underWider(x, z, own, w);
  // Проверяем ВЕСЬ квад: три точки вдоль и три поперёк. Проверка только по
  // середине пропускала изломы — там полосу раздувает скруглением, и её
  // конец выносит на чужую проезжую часть бледным клином.
  const stripHitsRoad = (pts, i, mt, o0, o1, own) => {
    for (const s2 of [0, 0.5, 1]) {
      const bx = pts[i * 2] + (pts[i * 2 + 2] - pts[i * 2]) * s2;
      const bz = pts[i * 2 + 1] + (pts[i * 2 + 3] - pts[i * 2 + 1]) * s2;
      const nx = mt.NX[i] + (mt.NX[i + 1] - mt.NX[i]) * s2;
      const nz = mt.NZ[i] + (mt.NZ[i + 1] - mt.NZ[i]) * s2;
      const sc = mt.S[i] + (mt.S[i + 1] - mt.S[i]) * s2;
      for (const t of [0, 0.5, 1]) {
        const o = (o0 + (o1 - o0) * t) * sc;
        if (onOtherRoad(bx + nx * o, bz + nz * o, own)) return true;
      }
    }
    return false;
  };

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
  const lanes = [];        // индекс в массиве = приоритет, меньше — главнее
  const laneOf = new Map();
  for (const o of world.roads.map((r, i) => ({ r, i }))
       .filter(o => o.r.c <= 3 && o.r.pts.length >= 4 && !o.r.br && !o.r.tn
                    // Уступать можно только тому, кто и правда ляжет на землю.
                    // Улица, целиком накрытая более широкой, не рисуется вовсе —
                    // и обрезанный по ней сосед оставлял проплешину.
                    && (covered.get(o.i) ?? 0) <= 0.75)
       .sort((a, b2) => b2.r.w - a.r.w || a.i - b2.i)) {
    const hw = o.r.w / 2;
    const ext = densify(extendEnds(o.r.pts, Math.min(hw, 5)));
    // Митры считаем здесь и переиспользуем при отрисовке: сосед должен мерить
    // по ТОМУ ЖЕ полотну, которое потом ляжет на землю.
    const lane = { hw, ext, mt: miters(ext), rank: lanes.length };
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
      const w2 = w0 * w0;
      if ((x - p[s * 2]) ** 2 + (z - p[s * 2 + 1]) ** 2 < w2) return true;
      if ((x - p[s * 2 + 2]) ** 2 + (z - p[s * 2 + 3]) ** 2 < w2) return true;
    }
    return false;
  };
  // Полуширины на каждую вершину: слева (отрицательные) и справа.
  // Контуры домов. В OSM 0.51% проб по проезжей части попадают ВНУТРЬ здания:
  // гаражи и частные дома вплотную к проезду, а кое-где просто неточный обвод.
  // Полотно там резать обязательно — иначе асфальт въезжает в стену и дом
  // выглядит «съехавшим на дорогу».
  const bldGrid = new PolyGrid(world.buildings.map(b => ({ poly: b.poly, holes: b.holes })), 70);
  const inBuilding = (x, z) => !!bldGrid.find(x, z);

  // Полуширина, ужатая контуром дома. Мосты и тоннели не трогаем: там дорога
  // законно проходит сквозь габарит.
  const clipByBuildings = (pts, mt, hw) => {
    const offL = new Float64Array(mt.n), offR = new Float64Array(mt.n);
    let touched = false;
    for (let i = 0; i < mt.n; i++) {
      const bx = pts[i * 2], bz = pts[i * 2 + 1];
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
    world.roads.forEach((r, i) => { if (r.br && r.c <= 3 && r.pts.length >= 4) idxs.push(i); });
    const node = new Map();
    for (const i of idxs) {
      const p = world.roads[i].pts;
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
        const p = world.roads[i].pts;
        for (const k of [key(p[0], p[1]), key(p[p.length - 2], p[p.length - 1])])
          for (const j of node.get(k) || []) if (!seen.has(j)) { seen.add(j); stack.push(j); }
      }
      // концы цепочки — узлы, куда приходит ровно один участок
      const deg = new Map();
      for (const i of chain) {
        const p = world.roads[i].pts;
        for (const k of [key(p[0], p[1]), key(p[p.length - 2], p[p.length - 1])])
          deg.set(k, (deg.get(k) || 0) + 1);
      }
      const ends = [];
      for (const i of chain) {
        const p = world.roads[i].pts;
        for (const [k, x, z] of [[key(p[0], p[1]), p[0], p[1]],
                                 [key(p[p.length - 2], p[p.length - 1]), p[p.length - 2], p[p.length - 1]]])
          if (deg.get(k) === 1) ends.push([x, z]);
      }
      // если концов не нашлось (кольцо) — берём самые далёкие вершины
      let A = ends[0], B = ends[ends.length - 1];
      if (!A || !B || ends.length < 2) {
        const all = [];
        for (const i of chain) { const p = world.roads[i].pts;
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
      for (const i of chain) bridgeH.set(i, fn);
      // полотно для опор и перил
      for (const i of chain) {
        const r = world.roads[i];
        bridgeDecks.push({ pts: r.pts, w: r.w, hFn: fn });
      }
    }
  }
  // отдаём наружу: опоры и перила строит модуль сооружений
  world.__bridges = bridgeDecks.map(d => {
    const p = d.pts, out = [];
    for (let i = 0; i < p.length; i += 2) out.push(p[i], p[i + 1], d.hFn(p[i], p[i + 1]), H(p[i], p[i + 1]));
    return { w: d.w, pts: out };
  });

  const clipOffsets = (pts, mt, hw, rank) => {
    const offL = new Float64Array(mt.n), offR = new Float64Array(mt.n);
    for (let i = 0; i < mt.n; i++) {
      const bx = pts[i * 2], bz = pts[i * 2 + 1];
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
  const onWalkOther = (x, z, own) => {
    const c = cellOf(x, z);
    return c >= 0 && walkOwn[c] >= 0 && walkOwn[c] !== own;
  };
  const order = world.roads.map((r, i) => ({ r, i })).sort((a, b2) => (a.r.c > 3 ? 1 : 0) - (b2.r.c > 3 ? 1 : 0));

  for (const { r, i: ri } of order) {
    if (r.pts.length < 4) continue;
    // узкий проезд, целиком лежащий на широкой улице, не рисуем вовсе
    if (r.c <= 3 && r.w >= 4 && (covered.get(ri) ?? 0) > 0.75) continue;
    drawn.add(ri);
    const ch = bucket(r.pts[0], r.pts[1]);
    const hw = r.w / 2;
    const lane = laneOf.get(ri);
    const ext = lane ? lane.ext : densify(extendEnds(r.pts, Math.min(hw, 5)));
    // широкая улица лежит чуть выше узкой: там, где полотна всё же перекрылись,
    // это снимает мерцание вместо случайной борьбы за глубину
    const lift = ROAD_Y + r.w * 0.0016;
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
            if (onOtherRoad(bx + nx * o, bz + nz * o, ri) || onWalkOther(bx + nx * o, bz + nz * o, ri)) { hit = true; break; }
          }
          if (hit) break;
        }
        keep4[i] = hit ? 0 : 1;
      }
    }
    strip(ch, ext, mtR, cut ? cut.offL : -hw, cut ? cut.offR : hw, lift, r.c, r.w, false, i => {
      if (r.c === 4) return !keep4[i];
      if (r.c > 3 || r.w < 4) return false;
      // от обрезанного досуха пролёта остаются только вырожденные треугольники
      if (cut && cut.offR[i] - cut.offL[i] < 0.25 && cut.offR[i + 1] - cut.offL[i + 1] < 0.25) return true;
      const pts3 = [0.15, 0.5, 0.85].map(s2 => [
        ext[i * 2] + (ext[i * 2 + 2] - ext[i * 2]) * s2,
        ext[i * 2 + 1] + (ext[i * 2 + 3] - ext[i * 2 + 1]) * s2]);
      // Раньше требовалась именно БОЛЕЕ ШИРОКАЯ улица, и две равные по ширине
      // рисовались обе внахлёст. Растр уже решил, чья это земля, — этого хватает.
      for (const [bx, bz] of pts3) if (!onOtherRoad(bx, bz, ri)) return false;
      return true;      // кусок целиком на чужой проезжей части
    }, ri, laneEnc(r), r.sf || 0, bridgeH.get(ri) || H);
    if (r.c === 4) {
      // Дорожка метит свою полосу, чтобы параллельная соседка не легла сверху.
      // Метим ТОЛЬКО нарисованное: раньше снятый пролёт всё равно занимал
      // клетки и выбивал из них соседнюю дорожку — на месте обоих был газон.
      // Шаг вдоль был в целый пролёт (6 м) при клетке в 2 м — половина полосы
      // оставалась не помеченной, и нахлёст проходил насквозь.
      const w2 = Math.max(1.2, hw);
      for (let i = 0; i < mtR.n - 1; i++) {
        if (!keep4[i]) continue;
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
    // тротуары только у проезжих улиц и без вылета: иначе они лягут поперёк перекрёстка
    if (r.c <= 3 && r.w >= 5 && !r.br && !r.tn) {
      const dp = densify(r.pts);
      const mt = miters(dp);
      // бордюр и тротуар не строим там, где они попадают на чужую проезжую часть
      strip(ch, dp, mt, hw, hw + SIDEWALK, KERB_H + 0.03, 5, SIDEWALK, true,
            i => stripHitsRoad(dp, i, mt, hw - 0.2, hw + SIDEWALK + 0.4, ri), ri);
      strip(ch, dp, mt, -hw - SIDEWALK, -hw, KERB_H + 0.03, 5, SIDEWALK, true,
            i => stripHitsRoad(dp, i, mt, -hw + 0.2, -hw - SIDEWALK - 0.4, ri), ri);
      kerb(ch, dp, mt, hw, ROAD_Y, KERB_H + 0.03,
           i => stripHitsRoad(dp, i, mt, hw - 0.2, hw + 0.8, ri), ri);
      kerb(ch, dp, mt, -hw, ROAD_Y, KERB_H + 0.03,
           i => stripHitsRoad(dp, i, mt, -hw + 0.2, -hw - 0.8, ri), ri);
      // Метим полосу тротуара, чтобы пешеходные дорожки её не перекрывали.
      // Шаг вдоль был в треть пролёта (3 м при клетке в 2 м) — между пробами
      // оставались непомеченные клетки, и дорожка проходила сквозь них.
      for (let i = 0; i < mt.n - 1; i++) {
        const seg = Math.hypot(dp[i * 2 + 2] - dp[i * 2], dp[i * 2 + 3] - dp[i * 2 + 1]);
        const steps = Math.max(2, Math.ceil(seg / 1.2));
        for (let k = 0; k <= steps; k++) {
          const s2 = k / steps;
          const bx = dp[i * 2] + (dp[i * 2 + 2] - dp[i * 2]) * s2;
          const bz = dp[i * 2 + 1] + (dp[i * 2 + 3] - dp[i * 2 + 1]) * s2;
          const nx = mt.NX[i], nz = mt.NZ[i], sc = mt.S[i];
          for (const sg of [1, -1])
            for (let o = hw + 0.3; o <= hw + SIDEWALK + 1e-6; o += 0.7)
              claimWalk(bx + nx * sg * o * sc, bz + nz * sg * o * sc, ri);
        }
      }
    }
  }
  for (const r of world.rail) {
    if (r.pts.length < 4) continue;
    const dp = densify(r.pts);
    strip(bucket(r.pts[0], r.pts[1]), dp, miters(dp), -1.7, 1.7, 0.05, 3, 3.4);
  }

  // Пятно перекрёстка. Кладём ЧУТЬ НИЖЕ полотен и ровно в их цвет: его задача —
  // закрыть щель между сходящимися улицами, а не рисоваться поверх них кругом.
  // Раньше оно лежало сверху и читалось как круглая заплата другого оттенка.
  // У склеенного кластера (площадь) вместо круга приходит выпуклый контур:
  // шесть независимых кругов на площади Ушакова спорили друг с другом за
  // глубину и читались ступенями. Один контур — одно ровное пятно.
  for (const j of world.junctions || []) {
    const ch = bucket(j.x, j.z);
    const col = ROAD_COLORS[1];
    const start = ch.base;
    const ring = [];
    if (j.poly) {
      const n = j.poly.length / 2;
      for (let k = 0; k < n; k++) {
        const x = j.poly[k * 2], z = j.poly[k * 2 + 1];
        const dx = x - j.x, dz = z - j.z, L = Math.hypot(dx, dz) || 1;
        // те же 0.8 м внутрь, что и у круга: пятно не должно вылезать из полотен
        ring.push([x - dx / L * 0.8, z - dz / L * 0.8]);
      }
    } else {
      const SEG = 16, r = j.r - 0.8;
      if (r < 1.5) continue;
      for (let k = 0; k < SEG; k++) {
        const a = k / SEG * Math.PI * 2;
        ring.push([j.x + Math.cos(a) * r, j.z + Math.sin(a) * r]);
      }
    }
    ch.P.push(j.x, H(j.x, j.z) + ROAD_Y - 0.025, j.z);
    ch.C.push(enc(col[0]), enc(col[1]), enc(col[2]));
    ch.R.push(0, 0, 0.5, 0); ch.K.push(1); ch.O.push(-1); ch.S.push(0);   // без этого aOwn съезжал на вершину
    for (const [x, z] of ring) {
      ch.P.push(x, H(x, z) + ROAD_Y - 0.025, z);
      ch.C.push(enc(col[0]), enc(col[1]), enc(col[2]));
      ch.R.push(0, 0, 0.5, 0); ch.K.push(1); ch.O.push(-1); ch.S.push(0);
    }
    for (let k = 0; k < ring.length; k++)
      ch.I.push(start, start + 1 + (k + 1) % ring.length, start + 1 + k);
    ch.base += ring.length + 1;
  }

  // Зебра на подходах. Полосы идут вдоль движения, в России чередуются белая и жёлтая.
  for (const c of world.crossings || []) {
    // зебра ставится в отступе от центра перекрёстка и на кривой улице
    // иногда съезжает с полотна — рисуем только там, где под ней асфальт
    const cc = cellOf(c.x, c.z);
    if (!(cc >= 0 && cover[cc] >= 0)) continue;
    const ux = Math.sin(c.a), uz = Math.cos(c.a);      // вдоль улицы
    const nx = -uz, nz = ux;                            // поперёк
    // Ширину зебры брали из ширины улицы по OSM, а полотно ужимается растром
    // покрытия: 484 зебры из 3475 не доходили до кромки или наоборот вылезали
    // на тротуар, а 122 висели меньше чем на трёх четвертях асфальта — те самые
    // «застрявшие наполовину». Меряем настоящую кромку под самой зеброй и
    // рисуем ровно по ней; если асфальта нет вовсе, зебру не рисуем.
    const onAsp = (x, z) => { const k = cellOf(x, z); return k >= 0 && cover[k] >= 0; };
    let eL = 0, eR = 0;
    const LIM = c.w * 0.5 + 3.0;
    for (let t = 0.1; t <= LIM; t += 0.25) {
      if (onAsp(c.x - nx * t, c.z - nz * t)) eL = t; else break;
    }
    for (let t = 0.1; t <= LIM; t += 0.25) {
      if (onAsp(c.x + nx * t, c.z + nz * t)) eR = t; else break;
    }
    if (eL + eR < 3.2) continue;                        // под зеброй нет дороги
    // центр смещаем в середину найденной полосы, ширину берём по ней
    const shift = (eR - eL) / 2;
    const cx0 = c.x + nx * shift, cz0 = c.z + nz * shift;
    const ch = bucket(cx0, cz0);
    const hw = (eL + eR) / 2 - 0.12, hd = c.d / 2, start = ch.base;
    const col = ROAD_COLORS[1];
    for (const sd of [-1, 1])
      for (const sw of [-1, 1]) {
        const x = cx0 + ux * hd * sd + nx * hw * sw;
        const z = cz0 + uz * hd * sd + nz * hw * sw;
        // Полотно поднимается тем выше, чем ШИРЕ улица (ROAD_Y + w*0.0016 —
        // так снимается борьба за глубину между широкой и узкой). Зебра же
        // лежала на постоянных ROAD_Y + 0.02, и на четырнадцатиметровой
        // Большой Морской оказывалась НИЖЕ асфальта на 2.4 мм — отсюда
        // «проваленные переходы». Поднимаем её над ЕЁ улицей.
        // Ширина улицы под зеброй бывает не той, что у соседней на том же
        // перекрёстке, и по своей ширине зебра всё равно ныряла под чужой,
        // более широкий асфальт. Берём запас над САМЫМ высоким полотном
        // города: 14 м * 0.0016 = 2.2 см, кладём 5.5 см — этого хватает всем.
        ch.P.push(x, H(x, z) + ROAD_Y + 0.055, z);
        ch.C.push(enc(col[0]), enc(col[1]), enc(col[2]));
        ch.R.push(sw, hd * sd, hw * 2, 0); ch.K.push(7); ch.O.push(-1); ch.S.push(0);
      }
    ch.I.push(start, start + 1, start + 2, start + 1, start + 3, start + 2);
    ch.base += 4;
    zebras++;
  }

  const group = new THREE.Group();
  group.name = 'roads';
  group.userData.drawn = drawn;      // какие улицы реально попали в геометрию
  group.userData.coverage = COV;     // тот же растр отдаём аудиту
  group.userData.zebras = zebras;    // и сколько зебр легло на асфальт
  const mat = roadMaterial();
  for (const ch of chunks.values()) {
    if (!ch.I.length) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(ch.P, 3));
    geo.setAttribute('color', new THREE.Uint8BufferAttribute(ch.C, 3, true));
    geo.setAttribute('aRoad', new THREE.Float32BufferAttribute(ch.R, 4));
    geo.setAttribute('aCls', new THREE.Float32BufferAttribute(ch.K, 1));
    geo.setAttribute('aSurf', new THREE.Float32BufferAttribute(ch.S, 1));
    geo.setAttribute('aOwn', new THREE.Float32BufferAttribute(ch.O, 1));
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
export function buildBuildings(world, terrain, chunk = 500) {
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

  for (const b of world.buildings) {
    const poly = b.poly, n = poly.length / 2;
    if (n < 3) continue;

    let gmin = Infinity, gmax = -Infinity;
    for (let i = 0; i < n; i++) {
      const h = terrain.gridHeightAt(poly[i * 2], poly[i * 2 + 1]);
      if (h < gmin) gmin = h; if (h > gmax) gmax = h;
    }
    if (gmax <= SEA_FLOOR + 0.5) continue;   // мусор в данных: контур целиком в море
    const yBase = gmin - 1.2;
    const yTop = gmax + b.h;
    const Hb = yTop - yBase;
    cur = bucket(poly[0], poly[1]);

    // гаражи разбираем на боксы: контур OSM — это ряд, а не один дом
    if (/^garage/.test(b.t || '')) {
      if (garageBoxes(poly, terrain, pushV, rand) > 0) continue;
    }

    const area = polyArea(poly);
    const market = b.k === 'market';
    const wantHip = b.rs === 'hipped';
    const wall = b.wc ? hexRGB(b.wc)
               : market ? MARKET_WALLS[(rand() * MARKET_WALLS.length) | 0]
                        : WALLS[(rand() * WALLS.length) | 0];
    // Черепица в центре Севастополя лежит не только на маленьких домах:
    // послевоенный квартал — это 5–7 этажей и корпуса в пол-квартала, и они
    // тоже под скатом. Прежний порог (18 м / 900 м²) оставлял 700+ крупных,
    // но невысоких домов плоскими — квартал вырождался в поле коробок.
    // Школы, храмы, рынок и витражные корпуса не трогаем: у них своя кровля.
    const pitched = market || wantHip ||
      (b.fx !== 'glass' && !b.school && !b.temple && b.rs !== 'flat' &&
       b.h <= 22 && area <= 2200 && n >= 4 && rand() < 0.92);
    const flatRoof = !pitched;
    stats.total++; if (pitched) stats.pitched++;
    const roof = b.rc ? hexRGB(b.rc)
      : market ? MARKET_ROOF
      : flatRoof ? ROOFS_FLAT[(rand() * ROOFS_FLAT.length) | 0]
      : ROOFS_TILE[(rand() * ROOFS_TILE.length) | 0];
    const tint = 0.93 + rand() * 0.15;
    const w = [Math.min(1, wall[0] * tint), Math.min(1, wall[1] * tint), Math.min(1, wall[2] * tint)];
    // гараж, сарай, будка — окон не рисуем
    const wallKind = market ? 4 : b.temple ? 13 : b.school ? 12
      : b.fx === 'glass' ? 10 : b.arch ? 11 : b.go ? 7
      : (b.h < 4.2 || area < 38) ? 2 : 0;
    const roofKind = flatRoof ? 3 : 1;

    let u = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = poly[i * 2], az = poly[i * 2 + 1];
      const bx = poly[j * 2], bz = poly[j * 2 + 1];
      const dx = bx - ax, dz = bz - az;
      const l = Math.hypot(dx, dz);
      if (l < 0.15) continue;
      const nx = dz / l, nz = -dx / l;
      const u0 = u, u1 = u + l;
      u = u1;
      // Обход ПО нормали: при обратном порядке стена отсекается как задняя грань,
      // и снаружи видно нутро дома вместо ближних стен.
      pushV(ax, yBase, az, nx, 0, nz, w, u0, 0, Hb, wallKind);
      pushV(bx, yTop, bz, nx, 0, nz, w, u1, Hb, Hb, wallKind);
      pushV(bx, yBase, bz, nx, 0, nz, w, u1, 0, Hb, wallKind);
      pushV(ax, yBase, az, nx, 0, nz, w, u0, 0, Hb, wallKind);
      pushV(ax, yTop, az, nx, 0, nz, w, u0, Hb, Hb, wallKind);
      pushV(bx, yTop, bz, nx, 0, nz, w, u1, Hb, Hb, wallKind);
    }

    // Рыночный ряд: длинный сарай под двускатной ребристой кровлей, по бокам
    // тент над проходом. Вальма из общего кода тут не годится — ряд узкий
    // и длинный, у него конёк во всю длину, а не четыре ската.
    if (market) {
      const box = obb(poly);
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

  const group = new THREE.Group();
  group.name = 'buildings';
  const mat = buildingMaterial();
  let verts = 0;
  for (const ch of chunks.values()) {
    if (!ch.P.length) continue;
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
// Парковки, футбольные поля, беговые дорожки, детские площадки и кладбища.
// Всё из OSM (data/areas.json), ничего не выдумано. Каждая площадка ложится
// на рельеф своим полотном: контур триангулируется, треугольники дробятся,
// пока сторона не станет меньше 5 м, и каждая вершина садится на землю.
// В атрибут пишем локальные метры от габаритной рамки — по ним шейдер кладёт
// разметку машиномест, линии поля и дорожки.
export function buildAreas(world, terrain) {
  // Растр покрытия построен в buildRoads и лежит в мире: по нему проверяем,
  // не накрыла ли площадка проезжую часть.
  const COVA = world.__coverage;
  const onAsphalt = COVA ? (x, z) => COVA.onRoad(x, z) : () => false;
  // Высоту берём тем же способом, что и дороги: сетка рельефа триангулирована
  // двумя треугольниками на клетку, и билинейная выборка внутри клетки лежит
  // то выше, то ниже настоящей поверхности. При подъёме в 5 см из полотна
  // проступали чёрные заплаты — классическая борьба глубин. Поднимаем на
  // 16 см, как проезжую часть, и берём рельеф там же.
  const H = (x, z) => terrain.gridHeightAt(x, z);
  // Площадки в OSM ЛЕЖАТ ДРУГ НА ДРУГЕ: спортивное ядро накрывает и поле, и
  // беговую дорожку, и парковку рядом с ним. На одной высоте они дерутся за
  // глубину, и полотно шло пятнами — то асфальт, то газон. Разводим по слоям:
  // чем мельче и «главнее» площадка, тем выше она лежит.
  const LAYER = { cemetery: 0, sportsground: 1, pitch: 2, football: 3, track: 4, parking: 5, playground: 6, path: 7, fuel: 5 };
  const LIFT0 = 0.13;
  // Подъём каждой площадки отдаём наружу: машины и качели ставились по
  // рельефу, а полотно лежит выше — машины оказывались ПОД парковкой.
  const liftOf = new Map();
  const KIND = { parking: 0, football: 1, pitch: 2, track: 3, playground: 4, sportsground: 5, cemetery: 6, path: 7, fuel: 8 };
  const COL = {
    parking:      [0.168, 0.166, 0.172],
    football:     [0.196, 0.373, 0.161],
    pitch:        [0.376, 0.302, 0.208],
    track:        [0.435, 0.259, 0.204],
    playground:   [0.400, 0.243, 0.196],
    sportsground: [0.267, 0.286, 0.243],
    cemetery:     [0.318, 0.361, 0.243],
    path:         [0.573, 0.549, 0.494],
    fuel:         [0.176, 0.176, 0.184],
  };
  const P = [], C = [], U = [], K = [], I = [];
  let base = 0, drawn = 0;

  for (const a of world.areas || []) {
    const n = a.poly.length / 2;
    if (n < 3) continue;
    // габаритная рамка по главной оси: локальные оси для разметки
    const box = obbOf(a.poly);
    if (!box) continue;
    const { ox, oz, ux, uz, W, L } = box;
    const kind = KIND[a.k] ?? 5;
    const col = COL[a.k] || COL.sportsground;
    const LIFT = LIFT0 + (LAYER[a.k] ?? 1) * 0.035;
    liftOf.set(a, { lift: LIFT, flat: null });
    // Стадион, поле, корт, детская площадка и парковка — РОВНЫЕ площадки: их
    // срезают и подсыпают, а не стелют по склону. Раньше они шли волной вслед
    // за рельефом, и беговой овал горбился. Считаем одну отметку по медиане
    // высот контура и кладём всё полотно на неё, а по кромке ставим подпорную
    // стенку до земли. Кладбище и аллеи оставляем на рельефе — они и в жизни
    // идут по склону.
    // РОВНОЙ платформой кладём только беговой овал: он реально срезан в
    // горизонт, и по рельефу горбился. Поле, корты, детские площадки и
    // парковки оставляем на земле — выровненные, они задирались над склоном
    // и вырастала подпорная стенка там, где её нет.
    const LEVELED = a.k === 'track' || a.k === 'fuel';   // площадка АЗС и в жизни ровная
    // На дороге площадке делать нечего — кроме кладбища, где растр покрытия
    // и так пуст, и аллей, которые сами по себе тропинки.
    const skipOnRoad = a.k !== 'cemetery';   // на дороге площадке делать нечего
    let flatY = null;
    if (LEVELED) {
      const hs = [];
      for (let i = 0; i < n; i++) hs.push(H(a.poly[i * 2], a.poly[i * 2 + 1]));
      hs.sort((p, q) => p - q);
      flatY = hs[hs.length >> 1];
      liftOf.get(a).flat = flatY;
    }

    // Контур way в OSM замкнут: последняя точка совпадает с первой. Оставлять
    // её нельзя — earcut на задвоенной вершине сыпется и оставляет в полотне
    // рваные дыры, сквозь которые светит трава (143 площадки из 146).
    const pts = [];
    let last = n;
    if (Math.abs(a.poly[0] - a.poly[(n - 1) * 2]) < 1e-6 &&
        Math.abs(a.poly[1] - a.poly[(n - 1) * 2 + 1]) < 1e-6) last = n - 1;
    for (let i = 0; i < last; i++) {
      const x = a.poly[i * 2], z = a.poly[i * 2 + 1];
      // и подряд идущие совпадающие точки тоже выбрасываем
      if (pts.length && Math.abs(pts[pts.length - 1].x - x) < 1e-6
                     && Math.abs(pts[pts.length - 1].y - z) < 1e-6) continue;
      pts.push(new THREE.Vector2(x, z));
    }
    if (pts.length < 3) continue;
    // Внутренний контур: у бегового овала середина — это футбольное поле, а не
    // тартан. Без дыры красное покрытие заливало весь стадион.
    const holes = [];
    if (a.hole && a.hole.length >= 6) {
      const hp = [];
      const hn = a.hole.length / 2;
      let hlast = hn;
      if (Math.abs(a.hole[0] - a.hole[(hn - 1) * 2]) < 1e-6 &&
          Math.abs(a.hole[1] - a.hole[(hn - 1) * 2 + 1]) < 1e-6) hlast = hn - 1;
      for (let i = 0; i < hlast; i++) {
        const x = a.hole[i * 2], z = a.hole[i * 2 + 1];
        if (hp.length && Math.abs(hp[hp.length - 1].x - x) < 1e-6
                      && Math.abs(hp[hp.length - 1].y - z) < 1e-6) continue;
        hp.push(new THREE.Vector2(x, z));
      }
      if (hp.length >= 3) holes.push(hp);
    }
    let tri;
    try { tri = THREE.ShapeUtils.triangulateShape(pts, holes); } catch { tri = []; }
    if (!tri.length) continue;
    // с дырой индексы идут по объединённому списку вершин
    const all = holes.length ? pts.concat(...holes) : pts;

    // Для кольца (беговой овал) поперечную координату считаем как расстояние
    // до ВНУТРЕННЕГО контура: тогда линии дорожек идут вдоль овала, а не
    // прямыми полосами поперёк него.
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
      return best;
    } : null;

    const push = (x, z) => {
      const dx = x - ox, dz = z - oz;
      P.push(x, (flatY !== null ? flatY : H(x, z)) + LIFT, z);
      C.push(enc(col[0]), enc(col[1]), enc(col[2]));
      U.push(dx * ux + dz * uz, ringDist ? ringDist(x, z) : -dx * uz + dz * ux, W, L);
      K.push(kind);
      return base++;
    };
    // дробим треугольник, пока сторона длиннее 5 м: иначе на склоне полотно
    // висит над землёй серединой
    const emit = (A, B, Cc, depth) => {
      const d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (depth < 5 && Math.max(d(A, B), d(B, Cc), d(Cc, A)) > (flatY === null ? 5 : 8)) {
        const mAB = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
        const mBC = [(B[0] + Cc[0]) / 2, (B[1] + Cc[1]) / 2];
        const mCA = [(Cc[0] + A[0]) / 2, (Cc[1] + A[1]) / 2];
        emit(A, mAB, mCA, depth + 1); emit(mAB, B, mBC, depth + 1);
        emit(mCA, mBC, Cc, depth + 1); emit(mAB, mBC, mCA, depth + 1);
        return;
      }
      // Кусок площадки, накрывший проезжую часть, не рисуем: на Восставших
      // парковка из OSM обведена шире асфальта и заезжала прямо на дорогу.
      if (skipOnRoad) {
        // Проверяем не только центр, но и вершины со срединами сторон: у
        // крупного треугольника центр мог висеть на газоне, а половина
        // площадки уже лежала на асфальте.
        const pr = [A, B, Cc,
          [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2],
          [(B[0] + Cc[0]) / 2, (B[1] + Cc[1]) / 2],
          [(Cc[0] + A[0]) / 2, (Cc[1] + A[1]) / 2],
          [(A[0] + B[0] + Cc[0]) / 3, (A[1] + B[1] + Cc[1]) / 3]];
        for (const q of pr) if (onAsphalt(q[0], q[1])) return;
      }
      const i0 = push(A[0], A[1]), i1 = push(B[0], B[1]), i2 = push(Cc[0], Cc[1]);
      I.push(i0, i1, i2);
    };
    for (const f of tri) {
      const A = [all[f[0]].x, all[f[0]].y], B = [all[f[1]].x, all[f[1]].y], Cc = [all[f[2]].x, all[f[2]].y];
      // обход к нормали вверх
      const cross = (B[0] - A[0]) * (Cc[1] - A[1]) - (B[1] - A[1]) * (Cc[0] - A[0]);
      if (cross > 0) emit(A, Cc, B, 0); else emit(A, B, Cc, 0);
    }
    // подпорная стенка по кромке: от отметки площадки до земли
    if (flatY !== null) {
      const top = flatY + LIFT;
      const WALL = [0.616, 0.604, 0.573];
      const rim = [pts, ...holes];
      for (const ring of rim) {
        for (let i = 0; i < ring.length; i++) {
          const A = ring[i], B = ring[(i + 1) % ring.length];
          const gA = H(A.x, A.y), gB = H(B.x, B.y);
          if (Math.abs(top - gA) < 0.12 && Math.abs(top - gB) < 0.12) continue;
          const yA = Math.min(gA, top) - 0.25, yB = Math.min(gB, top) - 0.25;
          const q0 = P.length / 3;
          for (const [vx, vz, vy] of [[A.x, A.y, top], [B.x, B.y, top], [B.x, B.y, yB], [A.x, A.y, yA]]) {
            P.push(vx, vy, vz);
            C.push(enc(WALL[0]), enc(WALL[1]), enc(WALL[2]));
            U.push(0, 0, 1, 1);
            K.push(5);
            base++;
          }
          // наружу — обе стороны, чтобы стенка была видна с любой
          I.push(q0, q0 + 1, q0 + 2, q0, q0 + 2, q0 + 3);
          I.push(q0, q0 + 2, q0 + 1, q0, q0 + 3, q0 + 2);
        }
      }
    }
    drawn++;
  }

  // ---- аллеи парков: лента заданной ширины по обмеренной оси ----
  // Ось снята агентом по спутнику, ширина из отчёта. Ленту строим сами:
  // на каждой вершине берём биссектрису двух соседних отрезков, иначе на
  // повороте аллея рвётся или наезжает сама на себя.
  {
    const LIFT = LIFT0 + 7 * 0.035;
    for (const pa of (world.places && world.places.paths) || []) {
      const q = pa.pts, m = q.length / 2;
      if (m < 2) continue;
      const hw = Math.max(0.9, (pa.w || 3) / 2);
      const kind = KIND.path;
      const col = pa.s === 'ground' ? [0.412, 0.353, 0.271] : COL.path;
      let prev = null, along = 0;
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
          K.push(kind);
          cur.push(base++);
        }
        if (prev) I.push(prev[0], prev[1], cur[0], prev[1], cur[1], cur[0]);
        prev = cur;
      }
      drawn++;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('color', new THREE.Uint8BufferAttribute(C, 3, true));
  geo.setAttribute('aArea', new THREE.Float32BufferAttribute(U, 4));
  geo.setAttribute('aAKind', new THREE.Float32BufferAttribute(K, 1));
  geo.setIndex(I);
  geo.computeVertexNormals();
  // Кому ставить объекты НА площадку, а не под неё
  world.__areaLift = (x, z) => {
    for (const [a, v] of liftOf) {
      if (!pointInPoly(x, z, a.poly)) continue;
      return v.flat !== null ? v.flat + v.lift - terrain.gridHeightAt(x, z) : v.lift;
    }
    return 0;
  };

  const mesh = new THREE.Mesh(geo, areaMaterial());
  mesh.name = 'areas';
  mesh.receiveShadow = true;
  mesh.userData.count = drawn;
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
