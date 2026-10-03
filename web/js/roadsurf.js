// Высота НАРИСОВАННОГО асфальта под точкой — для колёс.
//
// Физика берёт высоту дороги из профиля коридора (terrain.driveHeightAt) — это
// гладкая поверхность. А полотно в сцене — плоские четырёхугольники пролётов
// между вершинами осевой, поднятые на ROAD_Y + ширина·0.0016 и вдобавок
// приподнятые там, где выпуклая земля протыкала бы хорду (поправка на
// провисание, до 40 см; buildRoads в worldgen.js). Замер лучом сверху по шести
// улицам: колесо уходило в асфальт на 1–28 см, у пл. Нахимова — на 28.
//
// Поэтому колёса опираются на сами треугольники проезжей части. Индекс
// строится лениво и по кусочку в кадр — только для полотен рядом с машиной:
// треугольники раскладываются по клеткам 2×2 м, запрос — несколько проверок
// «точка в треугольнике». Берём верхний слой, если полотна перекрылись.

const CELL = 2;
const NEAR = 60;                 // полотна, чья рамка ближе этого к машине, — в работу
const BUDGET = 6000;             // треугольников индексации за кадр
// Только проезжая часть. Зебра и стоп-линия нарисованы на 4–5 см выше полотна
// (чтобы не мерцали), а в жизни это краска толщиной в миллиметры: колесо на
// них подпрыгивало бы на каждом переходе.
const KEEP = (c) => c < 3.5;

export class RoadSurface {
  constructor(scene) {
    this.scene = scene;
    this.index = new WeakMap();  // меш → { cells, done, next, pos, idx }
    this.near = [];
    this.at = [Infinity, Infinity];
    this.t = 0;
  }

  // Раз в полсекунды или при отъезде — какие полотна рядом; и доиндексировать
  // их кусочком. Зовётся каждый кадр.
  update(dt, x, z) {
    this.t -= dt;
    if (this.t <= 0 || Math.hypot(x - this.at[0], z - this.at[1]) > 40) {
      this.t = 0.5; this.at = [x, z];
      const near = [];
      this.scene.traverse(o => {
        if (!o.isMesh || !o.visible) return;
        const g = o.geometry;
        if (!g || !g.attributes.aCls || !g.index) return;
        if (!g.boundingBox) g.computeBoundingBox();
        const b = g.boundingBox, e = o.matrixWorld.elements;
        const ox = e[12], oz = e[14];
        if (x < b.min.x + ox - NEAR || x > b.max.x + ox + NEAR || z < b.min.z + oz - NEAR || z > b.max.z + oz + NEAR) return;
        near.push(o);
      });
      this.near = near;
    }
    let budget = BUDGET;
    for (const m of this.near) {
      let ix = this.index.get(m);
      if (!ix) {
        const g = m.geometry, e = m.matrixWorld.elements;
        ix = { cells: new Map(), next: 0, done: false, pos: g.attributes.position.array, idx: g.index.array,
               cls: g.attributes.aCls.array, ox: e[12], oy: e[13], oz: e[14] };
        this.index.set(m, ix);
      }
      if (ix.done) continue;
      budget = this._build(ix, budget);
      if (budget <= 0) break;
    }
  }

  _build(ix, budget) {
    const { pos: P, idx: I, cls: K, cells } = ix;
    const n = I.length / 3;
    let t = ix.next;
    for (; t < n && budget > 0; t++, budget--) {
      const a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2];
      if (!KEEP(K[a])) continue;
      const ax = P[a * 3] + ix.ox, az = P[a * 3 + 2] + ix.oz;
      const bx = P[b * 3] + ix.ox, bz = P[b * 3 + 2] + ix.oz;
      const cx = P[c * 3] + ix.ox, cz = P[c * 3 + 2] + ix.oz;
      // вертикальные и вырожденные (торцы бордюров, подложки) — не опора
      if (Math.abs((bx - ax) * (cz - az) - (cx - ax) * (bz - az)) < 1e-3) continue;
      const x0 = Math.floor(Math.min(ax, bx, cx) / CELL), x1 = Math.floor(Math.max(ax, bx, cx) / CELL);
      const z0 = Math.floor(Math.min(az, bz, cz) / CELL), z1 = Math.floor(Math.max(az, bz, cz) / CELL);
      if ((x1 - x0) * (z1 - z0) > 400) continue;          // гигантские куски — не полотно
      for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
        const k = i * 100003 + j;
        let l = cells.get(k); if (!l) cells.set(k, l = []);
        l.push(t);
      }
    }
    ix.next = t;
    if (t >= n) ix.done = true;
    return budget;
  }

  // Верх асфальта под точкой или null, если под ней нет проезжей части
  // (или полотно ещё не проиндексировано).
  heightAt(x, z) {
    const k = Math.floor(x / CELL) * 100003 + Math.floor(z / CELL);
    let best = null;
    for (const m of this.near) {
      const ix = this.index.get(m);
      if (!ix) continue;
      const l = ix.cells.get(k);
      if (!l) continue;
      const P = ix.pos, I = ix.idx;
      for (const t of l) {
        const a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2];
        const ax = P[a * 3] + ix.ox, az = P[a * 3 + 2] + ix.oz;
        const bx = P[b * 3] + ix.ox, bz = P[b * 3 + 2] + ix.oz;
        const cx = P[c * 3] + ix.ox, cz = P[c * 3 + 2] + ix.oz;
        const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
        const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
        const v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
        if (u < -1e-4 || v < -1e-4 || u + v > 1 + 1e-4) continue;
        const y = (P[a * 3 + 1] * u + P[b * 3 + 1] * v + P[c * 3 + 1] * (1 - u - v)) + ix.oy;
        if (best === null || y > best) best = y;
      }
    }
    return best;
  }
}
