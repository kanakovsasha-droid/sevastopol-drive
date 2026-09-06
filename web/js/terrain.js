// Поле высот Севастополя: Terrarium-тайлы, распакованные в метры над уровнем моря.
// Проекция та же, что в tools/config.mjs — метры честные и обратимые.
//
// Два режима:
//   'mono'  — старый монолит data/terrain.bin (Float32) на квадрат 5 × 5 км;
//   'chunk' — нарезка data/terrain/ по контракту docs/CHUNKS.md: детальные
//             чанки Int16 в дециметрах (1024 м, кайма 1 пиксель) плюс грубая
//             сетка coarse.bin на весь охват.
//
// В чанковом режиме heightAt ОСТАЁТСЯ СИНХРОННЫМ и обязан вернуть высоту всегда:
// по нему ездит машина и сажаются дороги, ждать сетевого ответа он не может.
// Пока детальный чанк не приехал, ответ берётся из coarse — грубо, но сразу.

const RAD = Math.PI / 180;

export const SEA_FLOOR = -28;   // дно бухты подрезаем: в тайлах оно уходит на -2400 (открытое море)

export class Terrain {
  constructor(meta, dem, heights) {
    this.meta = meta;
    this.mode = 'mono';
    this.dem = dem;
    this.h = heights;
    if (dem) {
      this.n2 = 2 ** dem.zoom * dem.tileSize;
      this.px0 = dem.tileX0 * dem.tileSize;
      this.py0 = dem.tileY0 * dem.tileSize;
    }
  }

  // Чанковый режим. loadChunk(tx, tz) → Promise<ArrayBuffer | null>; вынесен
  // наружу, чтобы этот же класс можно было прогнать в node (tools/check-terrain.mjs)
  // без всякого fetch — сверка нарезки идёт по тому же коду, что и в браузере.
  static chunked(index, coarseBuf, loadChunk, opts = {}) {
    const t = new Terrain(index.meta, null, null);
    t.mode = 'chunk';
    t.index = index;
    t.chunk = index.chunk;

    const d = index.detail;
    t.detail = d;
    t.n2 = 2 ** d.zoom * d.tileSize;   // pixel() и в этом режиме даёт ДЕТАЛЬНЫЙ пиксель
    t.px0 = d.px0;
    t.py0 = d.py0;
    t.unit = d.unit ?? 0.1;

    const c = index.coarse;
    t.coarse = {
      n2: 2 ** c.zoom * c.tileSize, px0: c.px0, py0: c.py0,
      w: c.width, h: c.height, unit: c.unit ?? 1,
      data: new Float32Array(coarseBuf),
    };

    t.loadChunk = loadChunk;
    t.radius = opts.radius ?? 2600;   // что просим подгрузить вокруг игрока
    t.keep = opts.keep ?? 4200;       // дальше этого выгружаем (гистерезис: keep > radius)
    t.busy = 0;
    t.tiles = new Map();
    for (const e of index.chunks) {
      t.tiles.set(e.tx + '_' + e.tz, {
        tx: e.tx, tz: e.tz, w: e.w, h: e.h,
        ox: e.px0 - d.px0, oy: e.py0 - d.py0,   // смещение в пикселях детальной сетки
        data: null, req: null, bad: false,
      });
    }
    return t;
  }

  static #ver() {
    // Адреса собраны шаблонной строкой — tools/stamp.mjs их не видит и версию
    // не приклеивает. Pages отдаёт world.json с max-age=600, и браузер честно
    // держал СТАРЫЕ дороги и дома десять минут после выкатки, хотя код был уже
    // новый: правки «не доезжали до прода». Клеим версию сами, из <meta build>.
    const v = document.querySelector('meta[name="build"]')?.content || '';
    return v ? '?v=' + v : '';
  }

  static async load(base = '..', opts = {}) {
    if (opts.chunked) {
      const [world, terrain] = await Promise.all([
        fetch(`${base}/data/world.json${Terrain.#ver()}`).then(r => r.json()),
        Terrain.loadChunked(base, opts),
      ]);
      terrain.meta = world.meta;      // мир и рельеф обязаны жить в одной системе координат
      return { world, terrain };
    }
    const q = Terrain.#ver();
    const [world, dem, bin] = await Promise.all([
      fetch(`${base}/data/world.json${q}`).then(r => r.json()),
      fetch(`${base}/data/terrain.json${q}`).then(r => r.json()),
      fetch(`${base}/data/terrain.bin${q}`).then(r => r.arrayBuffer()),
    ]);
    return { world, terrain: new Terrain(world.meta, dem, new Float32Array(bin)) };
  }

  // Чанковый рельеф без world.json: index.json самодостаточен (в нём есть meta).
  static async loadChunked(base = '..', opts = {}) {
    const q = Terrain.#ver();
    const dir = `${base}/data/terrain`;
    const index = await fetch(`${dir}/index.json${q}`).then(r => r.json());
    const coarse = await fetch(`${dir}/${index.coarse.file}${q}`).then(r => r.arrayBuffer());
    const load = (tx, tz) => fetch(`${dir}/${tx}_${tz}.bin${q}`)
      .then(r => (r.ok ? r.arrayBuffer() : null));
    return Terrain.chunked(index, coarse, load, opts);
  }

  // локальные метры → пиксель тайловой сетки заданного зума.
  //
  // Источник истины по проекции — unproject() в tools/config.mjs; браузерный код
  // config.mjs не импортирует, поэтому формула здесь продублирована осознанно.
  // Порядок важен: сперва широта (она зависит только от z), и лишь потом
  // долгота — масштаб долготы считается ПО ШИРОТЕ ТОЧКИ. Раньше тут стояла
  // константа m.scale.mPerDegLon по широте Нахимова: в центре это ошибка меньше
  // метра, а на Ялте уже 106 м, и дороги ЮБК сходили бы со своего склона.
  toPixel(x, z, n2, px0, py0) {
    const m = this.meta;
    const lat = m.origin.lat - z / m.scale.mPerDegLat;
    const r = lat * RAD;
    const mLon = 111412.84 * Math.cos(r) - 93.5 * Math.cos(3 * r);
    const lon = m.origin.lon + x / mLon;
    const tx = (lon + 180) / 360 * n2;
    const ty = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n2;
    return [tx - px0, ty - py0];
  }

  // локальные метры → пиксель поля высот (детального — в обоих режимах)
  pixel(x, z) {
    return this.toPixel(x, z, this.n2, this.px0, this.py0);
  }

  // ------------------------------------------------------------- чанки
  chunkKey(x, z) {
    return Math.floor(x / this.chunk) + '_' + Math.floor(z / this.chunk);
  }

  // Есть ли уже ДЕТАЛЬНАЯ высота в этой точке. Морские чанки в индекс не попали:
  // там детали нет и не будет, и это не «ещё не загрузилось».
  hasDetail(x, z) {
    if (this.mode !== 'chunk') return true;
    const t = this.tiles.get(this.chunkKey(x, z));
    return !t || !!t.data;
  }

  // Есть ли ДЕТАЛЬНАЯ высота на всём прямоугольнике. Дороги, дома и деревья
  // квадрата сажаются по heightAt ОДИН раз, при сборке, и если в этот момент
  // детального тайла ещё нет, всё встаёт по coarse — на трассе это промах до
  // восемнадцати метров, и полотно потом оказывается закопанным в склон.
  // Поэтому сборку квадрата ждём, пока сюда не приедут высоты.
  detailReady(x0, z0, x1, z1) {
    if (this.mode !== 'chunk') return true;
    const c = this.chunk;
    for (let j = Math.floor(z0 / c); j <= Math.floor(z1 / c); j++)
      for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++) {
        const t = this.tiles.get(i + '_' + j);
        if (t && !t.data && !t.bad) return false;    // тайл есть, но ещё не приехал
      }
    return true;
  }

  // Попросить подгрузить детальные чанки вокруг точки. Асинхронно и идемпотентно:
  // за одним и тем же чанком повторно не ходим, уже загруженный не перезапрашиваем.
  async ensure(x, z, radius = this.radius) {
    if (this.mode !== 'chunk') return;
    const c = this.chunk;
    const i0 = Math.floor((x - radius) / c), i1 = Math.floor((x + radius) / c);
    const j0 = Math.floor((z - radius) / c), j1 = Math.floor((z + radius) / c);
    const jobs = [];
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const t = this.tiles.get(i + '_' + j);
        if (!t || t.data || t.bad) continue;
        if (!t.req) {
          this.busy++;
          t.req = Promise.resolve(this.loadChunk(t.tx, t.tz)).then(buf => {
            const a = buf && new Int16Array(buf);
            // Битый или обрезанный файл лучше игнорировать, чем читать за край
            // массива: в чанковом режиме это молча ушло бы в нули = уровень моря.
            if (a && a.length === t.w * t.h) t.data = a;
            else t.bad = true;
          }).catch(() => { t.bad = true; }).finally(() => {
            t.req = null;
            this.busy--;
          });
        }
        jobs.push(t.req);
      }
    }
    this.prune(x, z);
    if (jobs.length) await Promise.all(jobs);
  }

  // Выгрузка дальних чанков — иначе за поездку через город память вырастет
  // на все 552 клетки. Считаем от ЦЕНТРА чанка, порог keep больше radius.
  prune(x, z, keep = this.keep) {
    if (this.mode !== 'chunk') return 0;
    const c = this.chunk;
    let n = 0;
    for (const t of this.tiles.values()) {
      if (!t.data) continue;
      const dx = (t.tx + 0.5) * c - x, dz = (t.tz + 0.5) * c - z;
      if (dx * dx + dz * dz > keep * keep) { t.data = null; n++; }
    }
    return n;
  }

  get pending() { return this.mode === 'chunk' ? this.busy : 0; }

  get loaded() {
    if (this.mode !== 'chunk') return 0;
    let n = 0;
    for (const t of this.tiles.values()) if (t.data) n++;
    return n;
  }

  // ------------------------------------------------------------- выборка
  monoHeightAt(x, z) {
    const [px, py] = this.pixel(x, z);
    const W = this.dem.width, H = this.dem.height;
    const x0 = Math.floor(px), y0 = Math.floor(py);
    if (x0 < 0 || y0 < 0 || x0 >= W - 1 || y0 >= H - 1) return SEA_FLOOR;
    const fx = px - x0, fy = py - y0;
    const h = this.h, i = y0 * W + x0;
    const a = h[i], b = h[i + 1], c = h[i + W], d = h[i + W + 1];
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  }

  // Билинейная выборка внутри детального чанка. Та же формула и та же пиксельная
  // сетка, что у монолита, поэтому значения совпадают с точностью до дециметра.
  detailHeightAt(t, x, z) {
    const [px, py] = this.pixel(x, z);
    const lx = px - t.ox, ly = py - t.oy;
    const x0 = Math.floor(lx), y0 = Math.floor(ly);
    if (x0 < 0 || y0 < 0 || x0 >= t.w - 1 || y0 >= t.h - 1) return null;
    const fx = lx - x0, fy = ly - y0;
    const h = t.data, W = t.w, i = y0 * W + x0;
    const a = h[i], b = h[i + 1], c = h[i + W], d = h[i + W + 1];
    return ((a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy) * this.unit;
  }

  coarseHeightAt(x, z) {
    const g = this.coarse;
    const [px, py] = this.toPixel(x, z, g.n2, g.px0, g.py0);
    const x0 = Math.floor(px), y0 = Math.floor(py);
    if (x0 < 0 || y0 < 0 || x0 >= g.w - 1 || y0 >= g.h - 1) return SEA_FLOOR;
    const fx = px - x0, fy = py - y0;
    const h = g.data, W = g.w, i = y0 * W + x0;
    const a = h[i], b = h[i + 1], c = h[i + W], d = h[i + W + 1];
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  }

  heightAt(x, z) {
    let v;
    if (this.mode === 'mono') v = this.monoHeightAt(x, z);
    else {
      const t = this.tiles.get(this.chunkKey(x, z));
      v = (t && t.data) ? this.detailHeightAt(t, x, z) : null;
      if (v === null) v = this.coarseHeightAt(x, z);
    }
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

  // Полотно мостов. Мост в грунт не вдавлен (под путепроводом выемка), поэтому
  // в коридоре его нет — и машина ехала по дну выемки в трёх метрах ПОД мостом.
  // Отдельное поле поверх коридора: (x, z) → высота полотна или null.
  setDeck(fn) { this.deck = fn; }

  // { h, w } или null: w < 1 у самых торцов, там опора плавно уходит к улице
  deckAt(x, z) {
    return (this.deck && this.deck(x, z)) || null;
  }

  // профиль ЗЕМЛИ под дорогой, без мостов: опоры путепровода и полотно улицы,
  // проходящей под ним, должны опираться на грунт, а не на палубу над головой
  groundDriveHeightAt(x, z) {
    const h = this.corridorAt(x, z);
    if (h === null) return this.gridHeightAt(x, z);
    // Тот же предохранитель, с каким РИСУЕТСЯ полотно (SAFE в buildRoads).
    // Без него колёса жили по коридору, а асфальт — по обрезанному коридору,
    // и на дорожках, куда затекла плоская зона широкой улицы, машина ехала
    // в пяти метрах над видимым покрытием.
    // Предохранитель был ±0.35 м — МЕНЬШЕ, чем выемка и насыпь, которые сам
    // коридор себе разрешает (1.5 и 0.9 м). На спуске Котовского профиль
    // сглаживался, а потом этот зажим возвращал его к сырому рельефу: уклон
    // доходил до 27.6% с переломом в 12.9 пункта на пятиметровый шаг — машина
    // прыгала. Ставим порог выше собственных пределов коридора: он ловит грубые
    // промахи, а нормальные выемку и насыпь пропускает.
    const g = this.gridHeightAt(x, z);
    return h < g - 1.7 ? g - 1.7 : h > g + 1.1 ? g + 1.1 : h;
  }

  // высота для дорог, тротуаров и колёс
  driveHeightAt(x, z) {
    const g = this.groundDriveHeightAt(x, z);
    const b = this.deckAt(x, z);
    // Полотно берёт верх, только если оно не провалилось ГЛУБОКО под улицу:
    // криво собранная цепочка не должна утаскивать машину под землю. Запас
    // большой нарочно — рядом с мостом коридор соседней улицы бывает выше
    // полотна на полметра, и при жёстком пороге мост в этом месте отключался.
    if (b === null || b.h <= g - 2.5) return g;
    return b.w >= 1 ? b.h : b.h * b.w + g * (1 - b.w);
  }


  gridNormalAt(x, z, s = 3) {
    const hx = this.gridHeightAt(x + s, z) - this.gridHeightAt(x - s, z);
    const hz = this.gridHeightAt(x, z + s) - this.gridHeightAt(x, z - s);
    const len = Math.hypot(hx, 2 * s, hz);
    return [-hx / len, 2 * s / len, -hz / len];
  }
}
