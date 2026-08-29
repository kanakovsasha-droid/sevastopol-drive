// Стены домов как отрезки в равномерной сетке — чтобы столкновение стоило O(1),
// а не обход 10 тысяч контуров каждый кадр.
export class Collider {
  constructor(buildings, cell = 24) {
    this.cell = cell;
    this.map = new Map();
    const seg = [];
    for (const b of buildings) {
      const p = b.poly, n = p.length / 2;
      if (n < 3) continue;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ax = p[i * 2], az = p[i * 2 + 1], bx = p[j * 2], bz = p[j * 2 + 1];
        if (Math.hypot(bx - ax, bz - az) < 0.3) continue;
        const id = seg.length / 4;
        seg.push(ax, az, bx, bz);
        const cx0 = Math.floor(Math.min(ax, bx) / cell), cx1 = Math.floor(Math.max(ax, bx) / cell);
        const cz0 = Math.floor(Math.min(az, bz) / cell), cz1 = Math.floor(Math.max(az, bz) / cell);
        for (let cx = cx0; cx <= cx1; cx++)
          for (let cz = cz0; cz <= cz1; cz++) {
            const k = cx * 100003 + cz;
            let a = this.map.get(k); if (!a) this.map.set(k, a = []);
            a.push(id);
          }
      }
    }
    this.seg = new Float32Array(seg);
    this.count = seg.length / 4;
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
export class RoadIndex {
  constructor(roads, cell = 60) {
    this.cell = cell; this.map = new Map(); this.roads = roads;
    roads.forEach((r, ri) => {
      const p = r.pts;
      for (let i = 0; i < p.length / 2 - 1; i++) {
        const ax = p[i * 2], az = p[i * 2 + 1], bx = p[i * 2 + 2], bz = p[i * 2 + 3];
        const cx0 = Math.floor(Math.min(ax, bx) / cell), cx1 = Math.floor(Math.max(ax, bx) / cell);
        const cz0 = Math.floor(Math.min(az, bz) / cell), cz1 = Math.floor(Math.max(az, bz) / cell);
        for (let cx = cx0; cx <= cx1; cx++)
          for (let cz = cz0; cz <= cz1; cz++) {
            const k = cx * 100003 + cz;
            let a = this.map.get(k); if (!a) this.map.set(k, a = []);
            a.push(ri, i);
          }
      }
    });
  }
  // Ближайшая дорога: сама улица, точка на ней и направление — чтобы ставить машину по ходу движения.
  nearest(x, z, maxDist = 30, filter = null) {
    const cell = this.cell;
    let best = null, bestD = maxDist * maxDist;
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        const list = this.map.get((cx + dx) * 100003 + (cz + dz));
        if (!list) continue;
        for (let k = 0; k < list.length; k += 2) {
          const r = this.roads[list[k]], i = list[k + 1], p = r.pts;
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
