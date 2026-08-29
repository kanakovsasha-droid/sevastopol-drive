import * as THREE from 'three';
import { SEA_FLOOR } from './terrain.js';
import { buildingMaterial, roadMaterial, terrainMaterial } from './materials.js';

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
];
const ROOFS_TILE = [[0.545, 0.271, 0.196], [0.494, 0.239, 0.169], [0.612, 0.325, 0.216], [0.463, 0.255, 0.192]];
const ROOFS_FLAT = [[0.318, 0.310, 0.294], [0.286, 0.310, 0.325], [0.361, 0.349, 0.329], [0.255, 0.267, 0.275]];
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
    // 15% оставляем: в Севастополе такие спуски есть по-настоящему, а вот
    // четверть уклона берётся только из скачка в данных высот.
    const MAXG = 0.15;
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
    smooth(7); soft(); limitGrade(); smooth(3); soft(); limitGrade(); smooth(2);

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
  for (let pass = 0; pass < 4; pass++) {
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
  const LIM = res * 0.15;
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
  mesh.userData.stats = { srezanoUzlovPodDomami: mesh_stats.cut };
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
    if (!c) chunks.set(k, c = { P: [], C: [], R: [], K: [], I: [], base: 0 });
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
  const inJunction = (x, z, extra = 0) => {
    const a = jmap.get(Math.floor(x / jcell) * 100003 + Math.floor(z / jcell));
    if (!a) return false;
    for (const j of a) {
      const R = j.r + 1.6 + extra;
      if ((x - j.x) ** 2 + (z - j.z) ** 2 < R * R) return true;
    }
    return false;
  };
  const midSkip = (pts, i, extra = 0) =>
    inJunction((pts[i * 2] + pts[i * 2 + 2]) / 2, (pts[i * 2 + 1] + pts[i * 2 + 3]) / 2, extra);

  const strip = (ch, pts, mt, offA, offB, lift, cls, uW, skipJ, skipFn) => {
    const col = ROAD_COLORS[cls];
    const start = ch.base;
    for (let i = 0; i < mt.n; i++) {
      const t = 0.94 + 0.12 * (((i * 2654435761) >>> 8) & 255) / 255;
      for (let s = 0; s < 2; s++) {
        const off = s === 0 ? offA : offB;
        const x = pts[i * 2] + mt.NX[i] * off * mt.S[i];
        const z = pts[i * 2 + 1] + mt.NZ[i] * off * mt.S[i];
        ch.P.push(x, H(x, z) + lift, z);
        ch.C.push(enc(col[0] * t), enc(col[1] * t), enc(col[2] * t));
        ch.R.push(s === 0 ? -1 : 1, mt.D[i], uW);
        ch.K.push(cls);
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
  const kerb = (ch, pts, mt, off, yLow, yHigh, skipFn) => {
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
        ch.R.push(0, mt.D[i], 0.3);
        ch.K.push(6);
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

  // ---- карта покрытия проезжих частей ----
  // Сканер показал: 4.7% асфальта накрыто сразу двумя улицами, а 6.8% бордюров
  // лежат на чужой проезжей части. Строим растр 2 м, начиная с самых широких
  // улиц: по нему пропускаем и лишние полотна, и бордюры, попавшие на дорогу.
  const CRES = 2;
  const cb = world.meta.bounds;
  const CX0 = cb.minX - 30, CZ0 = cb.minZ - 30;
  const CW = Math.ceil((cb.maxX - cb.minX + 60) / CRES);
  const CH = Math.ceil((cb.maxZ - cb.minZ + 60) / CRES);
  const cover = new Int32Array(CW * CH).fill(-1);
  const coverW = new Float32Array(CW * CH);
  const cellOf = (x, z) => {
    const i = Math.floor((x - CX0) / CRES), j = Math.floor((z - CZ0) / CRES);
    return (i < 0 || j < 0 || i >= CW || j >= CH) ? -1 : j * CW + i;
  };
  const drive = world.roads.map((r, i) => ({ r, i })).filter(o => o.r.c <= 3 && o.r.w >= 4);
  drive.sort((a, b) => b.r.w - a.r.w);          // широкие занимают землю первыми
  const covered = new Map();                     // индекс дороги → доля уже занятой длины
  for (const { r, i } of drive) {
    const p = r.pts, hw = r.w / 2;
    let taken = 0, total = 0;
    const cells = [];
    for (let k = 0; k < p.length / 2 - 1; k++) {
      const ax = p[k * 2], az = p[k * 2 + 1];
      const dx = p[k * 2 + 2] - ax, dz = p[k * 2 + 3] - az;
      const L = Math.hypot(dx, dz);
      if (L < 0.2) continue;
      const steps = Math.ceil(L / 1.5);
      for (let s = 0; s <= steps; s++) {
        const cx = ax + dx * s / steps, cz = az + dz * s / steps;
        total++;
        const c0 = cellOf(cx, cz);
        if (c0 >= 0 && cover[c0] >= 0 && cover[c0] !== i && coverW[c0] > r.w + 0.5) taken++;
        for (let dj = -Math.ceil(hw / CRES); dj <= Math.ceil(hw / CRES); dj++)
          for (let di = -Math.ceil(hw / CRES); di <= Math.ceil(hw / CRES); di++) {
            const x = cx + di * CRES, z = cz + dj * CRES;
            if ((x - cx) ** 2 + (z - cz) ** 2 > hw * hw) continue;
            cells.push(cellOf(x, z));
          }
      }
    }
    covered.set(i, total ? taken / total : 0);
    for (const c of cells) if (c >= 0 && (cover[c] < 0 || coverW[c] < r.w)) { cover[c] = i; coverW[c] = r.w; }
  }
  const onOtherRoad = (x, z, own) => {
    const c = cellOf(x, z);
    return c >= 0 && cover[c] >= 0 && cover[c] !== own;
  };

  for (const r of world.roads) {
    if (r.pts.length < 4) continue;
    const ri = world.roads.indexOf(r);
    // узкий проезд, целиком лежащий на широкой улице, не рисуем вовсе
    if (r.c <= 3 && r.w >= 4 && (covered.get(ri) ?? 0) > 0.75) continue;
    const ch = bucket(r.pts[0], r.pts[1]);
    const hw = r.w / 2;
    const ext = densify(extendEnds(r.pts, Math.min(hw, 5)));
    // широкая улица лежит чуть выше узкой: там, где полотна всё же перекрылись,
    // это снимает мерцание вместо случайной борьбы за глубину
    const lift = ROAD_Y + r.w * 0.0016;
    strip(ch, ext, miters(ext), -hw, hw, lift, r.c, r.w);
    // тротуары только у проезжих улиц и без вылета: иначе они лягут поперёк перекрёстка
    if (r.c <= 3 && r.w >= 5 && !r.br && !r.tn) {
      const dp = densify(r.pts);
      const mt = miters(dp);
      // бордюр и тротуар не строим там, где они попадают на чужую проезжую часть
      const skipSide = (pts, i, off) => {
        const mx = (pts[i * 2] + pts[i * 2 + 2]) / 2, mz = (pts[i * 2 + 1] + pts[i * 2 + 3]) / 2;
        const nx = (mt.NX[i] + mt.NX[i + 1]) / 2, nz = (mt.NZ[i] + mt.NZ[i + 1]) / 2;
        return onOtherRoad(mx + nx * off, mz + nz * off, ri);
      };
      strip(ch, dp, mt, hw, hw + SIDEWALK, KERB_H + 0.03, 5, SIDEWALK, true, i => skipSide(dp, i, hw + 1.3));
      strip(ch, dp, mt, -hw - SIDEWALK, -hw, KERB_H + 0.03, 5, SIDEWALK, true, i => skipSide(dp, i, -hw - 1.3));
      kerb(ch, dp, mt, hw, ROAD_Y, KERB_H + 0.03, i => skipSide(dp, i, hw + 0.3));
      kerb(ch, dp, mt, -hw, ROAD_Y, KERB_H + 0.03, i => skipSide(dp, i, -hw - 0.3));
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
  for (const j of world.junctions || []) {
    const ch = bucket(j.x, j.z);
    const col = ROAD_COLORS[1];
    const SEG = 16, start = ch.base, r = j.r - 0.8;
    if (r < 1.5) continue;
    ch.P.push(j.x, H(j.x, j.z) + ROAD_Y - 0.025, j.z);
    ch.C.push(enc(col[0]), enc(col[1]), enc(col[2]));
    ch.R.push(0, 0, 0.5); ch.K.push(1);
    for (let k = 0; k <= SEG; k++) {
      const a = k / SEG * Math.PI * 2;
      const x = j.x + Math.cos(a) * r, z = j.z + Math.sin(a) * r;
      ch.P.push(x, H(x, z) + ROAD_Y - 0.025, z);
      ch.C.push(enc(col[0]), enc(col[1]), enc(col[2]));
      ch.R.push(0, 0, 0.5); ch.K.push(1);
    }
    for (let k = 0; k < SEG; k++) ch.I.push(start, start + 1 + k + 1, start + 1 + k);
    ch.base += SEG + 2;
  }

  // Зебра на подходах. Полосы идут вдоль движения, в России чередуются белая и жёлтая.
  for (const c of world.crossings || []) {
    const ch = bucket(c.x, c.z);
    const ux = Math.sin(c.a), uz = Math.cos(c.a);      // вдоль улицы
    const nx = -uz, nz = ux;                            // поперёк
    const hw = c.w / 2, hd = c.d / 2, start = ch.base;
    const col = ROAD_COLORS[1];
    for (const sd of [-1, 1])
      for (const sw of [-1, 1]) {
        const x = c.x + ux * hd * sd + nx * hw * sw;
        const z = c.z + uz * hd * sd + nz * hw * sw;
        ch.P.push(x, H(x, z) + ROAD_Y + 0.02, z);
        ch.C.push(enc(col[0]), enc(col[1]), enc(col[2]));
        ch.R.push(sw, hd * sd, c.w); ch.K.push(7);
      }
    ch.I.push(start, start + 1, start + 2, start + 1, start + 3, start + 2);
    ch.base += 4;
  }

  const group = new THREE.Group();
  group.name = 'roads';
  const mat = roadMaterial();
  for (const ch of chunks.values()) {
    if (!ch.I.length) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(ch.P, 3));
    geo.setAttribute('color', new THREE.Uint8BufferAttribute(ch.C, 3, true));
    geo.setAttribute('aRoad', new THREE.Float32BufferAttribute(ch.R, 3));
    geo.setAttribute('aCls', new THREE.Float32BufferAttribute(ch.K, 1));
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
  let cur = null;
  const pushV = (x, y, z, nx, ny, nz, c, wu, wv, wh, kind) => {
    cur.P.push(x, y, z); cur.N.push(nx, ny, nz);
    cur.C.push(enc(c[0]), enc(c[1]), enc(c[2]));
    cur.W.push(wu, wv, wh); cur.K.push(kind);
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

    const area = polyArea(poly);
    const wall = WALLS[(rand() * WALLS.length) | 0];
    // до 5 этажей и небольшим пятном в Севастополе почти всегда скатная черепица;
    // крупные корпуса и высотки — плоская кровля
    const pitched = b.h <= 18 && area <= 1100 && n >= 4 && rand() < 0.90;
    const flatRoof = !pitched;
    const roof = flatRoof
      ? ROOFS_FLAT[(rand() * ROOFS_FLAT.length) | 0]
      : ROOFS_TILE[(rand() * ROOFS_TILE.length) | 0];
    const tint = 0.93 + rand() * 0.15;
    const w = [Math.min(1, wall[0] * tint), Math.min(1, wall[1] * tint), Math.min(1, wall[2] * tint)];
    // гараж, сарай, будка — окон не рисуем
    const wallKind = (b.h < 4.2 || area < 38) ? 2 : 0;
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

    // Скатная кровля вместо плоской плиты — именно плоский верх и делал город
    // набором коробок. Строим по охватывающему прямоугольнику: у почти
    // прямоугольного пятна застройки вальма садится точно, свес выпускаем наружу.
    const box = pitched ? obb(poly) : null;
    if (box && area / box.area > 0.70) {
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
        if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }   // кровля всегда наружу
        pushV(A[0], ay, A[1], nx, ny, nz, roof, A[0], A[1], Hb, 1);
        pushV(B[0], by, B[1], nx, ny, nz, roof, B[0], B[1], Hb, 1);
        pushV(C[0], cy, C[1], nx, ny, nz, roof, C[0], C[1], Hb, 1);
      };
      // два ската-трапеции и две вальмы
      tri(c1, eaveY, c2, eaveY, r2, ridgeY); tri(c1, eaveY, r2, ridgeY, r1, ridgeY);
      tri(c3, eaveY, c4, eaveY, r1, ridgeY); tri(c3, eaveY, r1, ridgeY, r2, ridgeY);
      tri(c4, eaveY, c1, eaveY, r1, ridgeY);
      tri(c2, eaveY, c3, eaveY, r2, ridgeY);
      continue;
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
  return group;
}

// ---------------------------------------------------------------- вода
export function buildWater() {
  const geo = new THREE.PlaneGeometry(60000, 60000, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    color: 0x18414f, roughness: 0.09, metalness: 0.45,
  }));
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
  const DENSITY = { wood: 95, scrub: 240, park: 165, grass: 520, pitch: 0, sand: 0 };
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
