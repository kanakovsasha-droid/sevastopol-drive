// Поле высот Севастополя: Terrarium-тайлы, распакованные в Float32 (метры над уровнем моря).
// Проекция та же, что в tools/config.mjs — метры честные и обратимые.

export const SEA_FLOOR = -28;   // дно бухты подрезаем: в тайлах оно уходит на -2400 (открытое море)

export class Terrain {
  constructor(meta, dem, heights) {
    this.meta = meta;
    this.dem = dem;
    this.h = heights;
    this.n2 = 2 ** dem.zoom * dem.tileSize;
    this.px0 = dem.tileX0 * dem.tileSize;
    this.py0 = dem.tileY0 * dem.tileSize;
  }

  static async load(base = '..') {
    // Адреса собраны шаблонной строкой — tools/stamp.mjs их не видит и версию
    // не приклеивает. Pages отдаёт world.json с max-age=600, и браузер честно
    // держал СТАРЫЕ дороги и дома десять минут после выкатки, хотя код был уже
    // новый: правки «не доезжали до прода». Клеим версию сами, из <meta build>.
    const v = document.querySelector('meta[name="build"]')?.content || '';
    const q = v ? '?v=' + v : '';
    const [world, dem, bin] = await Promise.all([
      fetch(`${base}/data/world.json${q}`).then(r => r.json()),
      fetch(`${base}/data/terrain.json${q}`).then(r => r.json()),
      fetch(`${base}/data/terrain.bin${q}`).then(r => r.arrayBuffer()),
    ]);
    return { world, terrain: new Terrain(world.meta, dem, new Float32Array(bin)) };
  }

  // локальные метры → пиксель поля высот
  pixel(x, z) {
    const m = this.meta;
    const lon = m.origin.lon + x / m.scale.mPerDegLon;
    const lat = m.origin.lat - z / m.scale.mPerDegLat;
    const r = lat * Math.PI / 180;
    const tx = (lon + 180) / 360 * this.n2;
    const ty = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * this.n2;
    return [tx - this.px0, ty - this.py0];
  }

  heightAt(x, z) {
    const [px, py] = this.pixel(x, z);
    const W = this.dem.width, H = this.dem.height;
    const x0 = Math.floor(px), y0 = Math.floor(py);
    if (x0 < 0 || y0 < 0 || x0 >= W - 1 || y0 >= H - 1) return SEA_FLOOR;
    const fx = px - x0, fy = py - y0;
    const h = this.h, i = y0 * W + x0;
    const a = h[i], b = h[i + 1], c = h[i + W], d = h[i + W + 1];
    const v = (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
    return v < SEA_FLOOR ? SEA_FLOOR : v;
  }

  // нормаль через центральные разности, шаг в метрах
  normalAt(x, z, s = 4) {
    const hx = this.heightAt(x + s, z) - this.heightAt(x - s, z);
    const hz = this.heightAt(x, z + s) - this.heightAt(x, z - s);
    const len = Math.hypot(hx, 2 * s, hz);
    return [-hx / len, 2 * s / len, -hz / len];
  }

  slopeAt(x, z, s = 4) {
    return Math.acos(this.normalAt(x, z, s)[1]);
  }

  // Сетка, которая реально нарисована. Дороги и колёса должны опираться на неё,
  // а не на исходные данные: между узлами поверхность плоская, и дорога,
  // посаженная по данным, на склоне уходит под треугольник.
  setGrid(x0, z0, dx, dz, nx, heights) {
    this.grid = { x0, z0, dx, dz, nx, h: heights };
  }

  // Высота на нарисованном треугольнике. Квад делится диагональю b–c,
  // порядок индексов тот же, что в buildTerrain.
  gridHeightAt(x, z) {
    const g = this.grid;
    if (!g) return this.heightAt(x, z);
    const gx = (x - g.x0) / g.dx, gz = (z - g.z0) / g.dz;
    const ix = Math.floor(gx), iz = Math.floor(gz);
    if (ix < 0 || iz < 0 || ix >= g.nx - 1 || iz >= g.nx - 1) return this.heightAt(x, z);
    const fx = gx - ix, fz = gz - iz;
    const h = g.h, i = iz * g.nx + ix;
    const a = h[i], b = h[i + 1], c = h[i + g.nx], d = h[i + g.nx + 1];
    return fx + fz < 1
      ? a + (b - a) * fx + (c - a) * fz
      : d + (b - d) * (1 - fz) + (c - d) * (1 - fx);
  }

  // Профиль дороги. Полотно и колёса должны опираться на НЕГО, а не на сетку
  // рельефа: её узлы попадают внутрь проезжей части и пробивают полотно горбом.
  setCorridor(c) { this.corr = c; }

  // Та же билинейная выборка, что и у рельефа: иначе полотно ступенчатое,
  // а поверхность гладкая, и на уклоне они расходятся.
  corridorAt(x, z) {
    const s = this.sampler && this.sampler(this.corr, x, z);
    return s && s.w > 0.5 ? s.h : null;
  }

  setSampler(fn) { this.sampler = fn; }

  // высота для дорог, тротуаров и колёс
  driveHeightAt(x, z) {
    const h = this.corridorAt(x, z);
    return h !== null ? h : this.gridHeightAt(x, z);
  }

  gridNormalAt(x, z, s = 3) {
    const hx = this.gridHeightAt(x + s, z) - this.gridHeightAt(x - s, z);
    const hz = this.gridHeightAt(x, z + s) - this.gridHeightAt(x, z - s);
    const len = Math.hypot(hx, 2 * s, hz);
    return [-hx / len, 2 * s / len, -hz / len];
  }
}
