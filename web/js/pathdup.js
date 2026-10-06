// Двойные дорожки. Аллеи парков из data/places.json (обмер по спутнику,
// buildAreas) — старый слой: все 82 оси лежат ровно по пешеходным дорожкам
// OSM (класс 4), которые сборщик дорог рисует сам, по земле и с обрезкой у
// тротуаров и полотна. Аллея шла второй лентой на 0.375 м над сеткой (у
// дорожки OSM — 0.115) и без сгущения вершин: на перегибе хорда висела в
// воздухе ещё выше, а на переходах ложилась светлой полосой поверх асфальта
// (Комсомольский парк, парк у Центрального рынка, Исторический бульвар).
//
// pathDupIndex(roads) → { dupSpan(ax, az, bx, bz, hw) } — пролёт аллеи от a
// до b полушириной hw уже нарисован дорожкой OSM (идёт вдоль неё в пределах
// суммы полуширин) или лежит на проезжей части (там асфальт). Такой пролёт
// не рисуем. Остальное аллея рисует сама — сгущённой, см. densePath.

const CELL = 16;

export function pathDupIndex(roads) {
  const grid = new Map();
  for (const r of roads || []) {
    if (!r || !r.pts || r.pts.length < 4 || r.br || r.tn) continue;
    const q = r.pts, hw = (r.w || (r.c === 4 ? 2.5 : 6)) / 2;
    for (let t = 0; t + 3 < q.length; t += 2) {
      const ax = q[t], az = q[t + 1], bx = q[t + 2], bz = q[t + 3], m = hw + 4;
      for (let j = Math.floor((Math.min(az, bz) - m) / CELL); j <= Math.floor((Math.max(az, bz) + m) / CELL); j++)
        for (let i = Math.floor((Math.min(ax, bx) - m) / CELL); i <= Math.floor((Math.max(ax, bx) + m) / CELL); i++) {
          const k = i + '_' + j;
          let e = grid.get(k);
          if (!e) grid.set(k, e = []);
          e.push(ax, az, bx, bz, hw, r.c === 4 ? 1 : 0);
        }
    }
  }
  // точка (x, z) с направлением (dx, dz): на полотне — 2, на дорожке OSM
  // вдоль — 1, иначе 0
  const probe = (x, z, dx, dz, hw) => {
    const e = grid.get(Math.floor(x / CELL) + '_' + Math.floor(z / CELL));
    if (!e) return 0;
    let res = 0;
    for (let t = 0; t < e.length; t += 6) {
      const ax = e[t], az = e[t + 1], vx = e[t + 2] - ax, vz = e[t + 3] - az, L2 = vx * vx + vz * vz;
      if (L2 < 1e-6) continue;
      let u = ((x - ax) * vx + (z - az) * vz) / L2;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const d = Math.hypot(ax + vx * u - x, az + vz * u - z);
      if (!e[t + 5]) { if (d < e[t + 4] - 0.3) return 2; continue; }
      const cos = Math.abs(vx * dx + vz * dz) / Math.sqrt(L2);
      if (cos > 0.8 && d < hw + e[t + 4] + 0.5) res = 1;
    }
    return res;
  };
  return {
    dupSpan(ax, az, bx, bz, hw) {
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 1e-6) return true;
      const dx = (bx - ax) / L, dz = (bz - az) / L;
      // пробы через ~2 м: пролёт дублем считаем, если ВСЕ пробы на дорожке
      // OSM или на полотне — иначе хвост аллеи, которого у OSM нет, пропал бы
      const k = Math.max(2, Math.ceil(L / 2));
      for (let s = 0; s <= k; s++) {
        const x = ax + (bx - ax) * s / k, z = az + (bz - az) * s / k;
        if (!probe(x, z, dx, dz, hw)) return false;
      }
      return true;
    },
  };
}

// Ось аллеи, сгущённая до шага step: лента по земле с треугольниками в 9 м
// на длинном пролёте висела хордой над перегибом (как и дорожки OSM до шага
// 4 м в buildRoads). Пролёты-дубли выкинуты: возвращает список кусков.
export function densePath(q, hw, idx, step = 4) {
  const runs = [];
  let cur = null;
  for (let i = 0; i + 3 < q.length; i += 2) {
    const ax = q[i], az = q[i + 1], bx = q[i + 2], bz = q[i + 3];
    if (idx && idx.dupSpan(ax, az, bx, bz, hw)) { if (cur) runs.push(cur); cur = null; continue; }
    if (!cur) cur = [ax, az];
    const k = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
    for (let s = 1; s <= k; s++) cur.push(ax + (bx - ax) * s / k, az + (bz - az) * s / k);
  }
  if (cur) runs.push(cur);
  return runs.filter(r => r.length >= 4);
}
