// Стены домов как отрезки в равномерной сетке — чтобы столкновение стоило O(1),
// а не обход 10 тысяч контуров каждый кадр.
//
// Город грузится чанками, поэтому оба индекса — ПОПОЛНЯЕМЫЕ: add(key, …) при
// загрузке квадрата, remove(key) при выгрузке. Место снятых отрезков идёт в
// список свободных и переиспользуется, иначе после часа катания туда-сюда
// массив растёт до бесконечности, хотя домов вокруг всё те же две сотни.
// Чего в индексе нет — того нет и в мире: пока чанк едет, там пусто.
export class Collider {
  // Совместимость со старым вызовом new Collider(buildings): если первым
  // аргументом пришёл массив, сразу кладём его пачкой 'static'.
  constructor(buildings = null, cell = 24) {
    if (typeof buildings === 'number') { cell = buildings; buildings = null; }
    this.cell = cell;
    this.map = new Map();        // ячейка → [id отрезка, …]
    this.seg = [];               // плоско: ax, az, bx, bz на отрезок
    this.free = [];              // освободившиеся id
    this.parts = new Map();      // ключ чанка → [id отрезка, …]
    if (buildings) this.add('static', buildings);
  }

  get count() { return this.seg.length / 4 - this.free.length; }

  _cells(ax, az, bx, bz, fn) {
    const c = this.cell;
    const cx0 = Math.floor(Math.min(ax, bx) / c), cx1 = Math.floor(Math.max(ax, bx) / c);
    const cz0 = Math.floor(Math.min(az, bz) / c), cz1 = Math.floor(Math.max(az, bz) / c);
    for (let cx = cx0; cx <= cx1; cx++)
      for (let cz = cz0; cz <= cz1; cz++) fn(cx * 100003 + cz);
  }

  add(key, buildings) {
    if (this.parts.has(key)) this.remove(key);
    const ids = [];
    for (const b of buildings || []) {
      const p = b.poly, n = p.length / 2;
      if (n < 3) continue;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ax = p[i * 2], az = p[i * 2 + 1], bx = p[j * 2], bz = p[j * 2 + 1];
        if (Math.hypot(bx - ax, bz - az) < 0.3) continue;
        const id = this.free.length ? this.free.pop() : this.seg.length / 4;
        this.seg[id * 4] = ax; this.seg[id * 4 + 1] = az;
        this.seg[id * 4 + 2] = bx; this.seg[id * 4 + 3] = bz;
        ids.push(id);
        this._cells(ax, az, bx, bz, k => {
          let a = this.map.get(k); if (!a) this.map.set(k, a = []);
          a.push(id);
        });
      }
    }
    this.parts.set(key, ids);
    return ids.length;
  }

  remove(key) {
    const ids = this.parts.get(key);
    if (!ids) return;
    const dead = new Set(ids);
    for (const id of ids) {
      const s = this.seg;
      this._cells(s[id * 4], s[id * 4 + 1], s[id * 4 + 2], s[id * 4 + 3], k => {
        const a = this.map.get(k);
        if (!a) return;
        // Ячейку чистим целиком за один проход: точечный splice на каждый
        // отрезок превращает выгрузку квартала в квадрат от числа стен.
        if (a.__swept === key) return;
        const keep = a.filter(i => !dead.has(i));
        if (keep.length) { keep.__swept = key; this.map.set(k, keep); }
        else this.map.delete(k);
      });
      // геометрию отрезка обнуляем, чтобы «пустой» слот ни во что не попадал
      this.seg[id * 4] = this.seg[id * 4 + 2] = 1e9;
      this.seg[id * 4 + 1] = this.seg[id * 4 + 3] = 1e9;
      this.free.push(id);
    }
    this.parts.delete(key);
  }

  // Выталкивает круг из стен. Возвращает суммарную нормаль выталкивания или null.
  resolve(pos, radius) {
    const cell = this.cell, s = this.seg;
    const c0x = Math.floor((pos.x - radius) / cell), c1x = Math.floor((pos.x + radius) / cell);
    const c0z = Math.floor((pos.z - radius) / cell), c1z = Math.floor((pos.z + radius) / cell);
    let hit = false, nx = 0, nz = 0, depth = 0;
    const seen = new Set();
    for (let cx = c0x; cx <= c1x; cx++)
      for (let cz = c0z; cz <= c1z; cz++) {
        const list = this.map.get(cx * 100003 + cz);
        if (!list) continue;
        for (const id of list) {
          if (seen.has(id)) continue;
          seen.add(id);
          const ax = s[id * 4], az = s[id * 4 + 1], bx = s[id * 4 + 2], bz = s[id * 4 + 3];
          const dx = bx - ax, dz = bz - az;
          const l2 = dx * dx + dz * dz;
          if (!l2) continue;
          let t = ((pos.x - ax) * dx + (pos.z - az) * dz) / l2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const px = ax + dx * t, pz = az + dz * t;
          let ox = pos.x - px, oz = pos.z - pz;
          const d = Math.hypot(ox, oz);
          if (d >= radius) continue;
          if (d < 1e-4) { ox = -dz; oz = dx; }
          const inv = 1 / (Math.hypot(ox, oz) || 1);
          const push = radius - d;
          pos.x += ox * inv * push;
          pos.z += oz * inv * push;
          nx += ox * inv * push; nz += oz * inv * push;
          depth += push;
          hit = true;
        }
      }
    if (!hit) return null;
    const l = Math.hypot(nx, nz) || 1;
    return { nx: nx / l, nz: nz / l, depth };
  }
}

// Индекс дорог: ближайшая улица к точке — для подписи «где я еду».
// Тоже пополняемый: улицы приезжают и уезжают вместе со своими чанками.
export class RoadIndex {
  constructor(roads = null, cell = 60) {
    if (typeof roads === 'number') { cell = roads; roads = null; }
    this.cell = cell;
    this.map = new Map();        // ячейка → [слот дороги, номер звена, …]
    this.roads = [];             // слот → дорога (null у свободных)
    this.free = [];
    this.parts = new Map();      // ключ чанка → [слот, …]
    if (roads) this.add('static', roads);
  }

  add(key, roads) {
    if (this.parts.has(key)) this.remove(key);
    const slots = [];
    const cell = this.cell;
    for (const r of roads || []) {
      const p = r.pts;
      if (!p || p.length < 4) continue;
      const slot = this.free.length ? this.free.pop() : this.roads.length;
      this.roads[slot] = r;
      slots.push(slot);
      for (let i = 0; i < p.length / 2 - 1; i++) {
        const ax = p[i * 2], az = p[i * 2 + 1], bx = p[i * 2 + 2], bz = p[i * 2 + 3];
        const cx0 = Math.floor(Math.min(ax, bx) / cell), cx1 = Math.floor(Math.max(ax, bx) / cell);
        const cz0 = Math.floor(Math.min(az, bz) / cell), cz1 = Math.floor(Math.max(az, bz) / cell);
        for (let cx = cx0; cx <= cx1; cx++)
          for (let cz = cz0; cz <= cz1; cz++) {
            const k = cx * 100003 + cz;
            let a = this.map.get(k); if (!a) this.map.set(k, a = []);
            a.push(slot, i);
          }
      }
    }
    this.parts.set(key, slots);
    return slots.length;
  }

  remove(key) {
    const slots = this.parts.get(key);
    if (!slots) return;
    const dead = new Set(slots);
    // Пробегаем весь индекс: ячеек у длинной улицы много, и собирать их
    // список ради выгрузки дороже, чем один проход по карте раз в минуту.
    for (const [k, a] of this.map) {
      let has = false;
      for (let i = 0; i < a.length; i += 2) if (dead.has(a[i])) { has = true; break; }
      if (!has) continue;
      const keep = [];
      for (let i = 0; i < a.length; i += 2) if (!dead.has(a[i])) keep.push(a[i], a[i + 1]);
      if (keep.length) this.map.set(k, keep); else this.map.delete(k);
    }
    for (const s of slots) { this.roads[s] = null; this.free.push(s); }
    this.parts.delete(key);
  }

  // Ближайшая дорога: сама улица, точка на ней и направление — чтобы ставить машину по ходу движения.
  // Кольцо ячеек берём по maxDist, а не жёстко 3×3: с радиусом поиска 400 м
  // (клик по карте, прыжок из меню) три ячейки по 60 м ничего не находили.
  nearest(x, z, maxDist = 30, filter = null) {
    const cell = this.cell;
    let best = null, bestD = maxDist * maxDist;
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
    const R = Math.min(24, Math.max(1, Math.ceil(maxDist / cell)));
    for (let dx = -R; dx <= R; dx++)
      for (let dz = -R; dz <= R; dz++) {
        const list = this.map.get((cx + dx) * 100003 + (cz + dz));
        if (!list) continue;
        for (let k = 0; k < list.length; k += 2) {
          const r = this.roads[list[k]], i = list[k + 1];
          if (!r) continue;
          const p = r.pts;
          if (filter && !filter(r)) continue;
          const ax = p[i * 2], az = p[i * 2 + 1], bx = p[i * 2 + 2], bz = p[i * 2 + 3];
          const ux = bx - ax, uz = bz - az;
          const l2 = ux * ux + uz * uz || 1;
          let t = ((x - ax) * ux + (z - az) * uz) / l2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const px = x - (ax + ux * t), pz = z - (az + uz * t);
          const d2 = px * px + pz * pz;
          if (d2 < bestD) {
            bestD = d2;
            const ul = Math.hypot(ux, uz) || 1;
            best = { road: r, x: ax + ux * t, z: az + uz * t,
                     dirX: ux / ul, dirZ: uz / ul, dist: Math.sqrt(d2) };
          }
        }
      }
    return best;
  }
}
