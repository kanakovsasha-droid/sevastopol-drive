// Разметка парковки: где стоят машиноместа.
//
// Раньше места клались сеткой по габаритной рамке площадки, а машины ставились
// в ту же сетку с проверкой одной-двух точек. Сетке было всё равно, где у
// парковки проезды: в OSM их рисуют отдельными линиями (service=parking_aisle),
// и машины вставали поперёк проезда, на дорожки и друг в друга, а размеченные
// места оставались пустыми.
//
// Теперь так:
//   1. Места ставятся ВДОЛЬ ПРОЕЗДОВ — по обе стороны каждой улицы, проходящей
//      по парковке, торцом к ней, как и паркуются на самом деле.
//   2. Если проездов в OSM нет — рядами по рамке: ряд 5 м, проезд 6 м, ряд 5 м.
//   3. Каждое место — прямоугольник 2.5 × 5 м — проверяется ЦЕЛИКОМ: внутри
//      контура, не на проезжей части и тротуаре, не на дорожке, не в доме, не
//      на дереве и не внахлёст с уже принятым местом.
// Разметка рисуется только у принятых мест, машины встают только в них —
// источник один, разойтись им не в чем.

export const STALL_W = 2.5, STALL_D = 5.0;
const SIDEWALK = 2.6;

// точка внутри многоугольника
function inPoly(x, z, p) {
  let c = false;
  for (let i = 0, j = p.length / 2 - 1; i < p.length / 2; j = i++) {
    const xi = p[i * 2], zi = p[i * 2 + 1], xj = p[j * 2], zj = p[j * 2 + 1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
  }
  return c;
}
function segDist(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz || 1)));
  return Math.hypot(px - ax - t * vx, pz - az - t * vz);
}
function segsCross(a, b, c, d) {
  const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}
// расстояние от отрезка до прямоугольника (углы q[4]); 0 — пересекаются
function segRect(ax, az, bx, bz, q) {
  const A = [ax, az], Bp = [bx, bz];
  // конец отрезка внутри прямоугольника
  const inside = (x, z) => {
    let s = 0;
    for (let i = 0; i < 4; i++) {
      const p = q[i], r = q[(i + 1) % 4];
      const c = (r[0] - p[0]) * (z - p[1]) - (r[1] - p[1]) * (x - p[0]);
      s += c > 0 ? 1 : -1;
    }
    return Math.abs(s) === 4;
  };
  if (inside(ax, az) || inside(bx, bz)) return 0;
  let best = Infinity;
  for (let i = 0; i < 4; i++) {
    const p = q[i], r = q[(i + 1) % 4];
    if (segsCross(A, Bp, p, r)) return 0;
    best = Math.min(best, segDist(p[0], p[1], ax, az, bx, bz));
  }
  best = Math.min(best, segDist(ax, az, q[0][0], q[0][1], q[1][0], q[1][1]),
    segDist(ax, az, q[1][0], q[1][1], q[2][0], q[2][1]), segDist(ax, az, q[2][0], q[2][1], q[3][0], q[3][1]),
    segDist(ax, az, q[3][0], q[3][1], q[0][0], q[0][1]),
    segDist(bx, bz, q[0][0], q[0][1], q[1][0], q[1][1]), segDist(bx, bz, q[1][0], q[1][1], q[2][0], q[2][1]),
    segDist(bx, bz, q[2][0], q[2][1], q[3][0], q[3][1]), segDist(bx, bz, q[3][0], q[3][1], q[0][0], q[0][1]));
  return best;
}
// пересечение двух прямоугольников (разделяющая ось)
function rectsOverlap(p, q) {
  for (const R of [p, q]) {
    for (let i = 0; i < 2; i++) {
      const ex = R[i + 1][0] - R[i][0], ez = R[i + 1][1] - R[i][1];
      const nx = -ez, nz = ex;
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const v of p) { const d = v[0] * nx + v[1] * nz; a0 = Math.min(a0, d); a1 = Math.max(a1, d); }
      for (const v of q) { const d = v[0] * nx + v[1] * nz; b0 = Math.min(b0, d); b1 = Math.max(b1, d); }
      if (a1 <= b0 || b1 <= a0) return false;
    }
  }
  return true;
}

// Сегменты улиц по клеткам 32 м — проверять место против всех улиц квартала
// было бы квадратично.
export function roadSegIndex(roads, paths) {
  const CELL = 32, map = new Map();
  const add = (ax, az, bx, bz, clear, aisle) => {
    const s = { ax, az, bx, bz, clear, aisle };
    const x0 = Math.min(ax, bx) - clear, x1 = Math.max(ax, bx) + clear;
    const z0 = Math.min(az, bz) - clear, z1 = Math.max(az, bz) + clear;
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++)
      for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
        const k = i * 100003 + j;
        let a = map.get(k); if (!a) map.set(k, a = []);
        a.push(s);
      }
  };
  const segs = [];
  for (const r of roads || []) {
    const p = r.pts;
    if (!p || p.length < 4 || r.br || r.tn) continue;
    // проезжая часть + тротуар, если он ей положен (как в buildRoads)
    const drive = r.c <= 3;
    const clear = r.w / 2 + (drive && r.w >= 5 ? SIDEWALK : 0) + 0.25;
    for (let i = 0; i < p.length - 2; i += 2) {
      add(p[i], p[i + 1], p[i + 2], p[i + 3], clear, drive);
      if (drive) segs.push({ ax: p[i], az: p[i + 1], bx: p[i + 2], bz: p[i + 3], hw: r.w / 2, side: drive && r.w >= 5 ? SIDEWALK : 0 });
    }
  }
  for (const pa of paths || []) {
    const q = pa.pts;
    if (!q || q.length < 4) continue;
    const clear = Math.max(0.9, (pa.w || 3) / 2) + 0.2;
    for (let i = 0; i < q.length - 2; i += 2) add(q[i], q[i + 1], q[i + 2], q[i + 3], clear, false);
  }
  const near = (x0, z0, x1, z1) => {
    const out = new Set();
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++)
      for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++)
        for (const s of map.get(i * 100003 + j) || []) out.add(s);
    return out;
  };
  // то же для одной точки: место 2.5 × 5 м целиком лежит в своей клетке и
  // соседних, а сегмент записан во все клетки, которые задевает с запасом
  const at = (x, z) => map.get(Math.floor(x / CELL) * 100003 + Math.floor(z / CELL)) || [];
  return { near, at, segs };
}

// a — площадка-парковка; ctx — { segs (roadSegIndex), buildings (PolyGrid),
// trees [x,z,...], blockers [poly...] (детские площадки и прочее внутри) }
// Возвращает места: { x, z, ux, uz — поперёк места (ширина), nx, nz — вдоль
// места от проезда к торцу }.
export function planParking(a, ctx) {
  const poly = a.poly;
  const n = poly.length / 2;
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < n; i++) {
    x0 = Math.min(x0, poly[i * 2]); x1 = Math.max(x1, poly[i * 2]);
    z0 = Math.min(z0, poly[i * 2 + 1]); z1 = Math.max(z1, poly[i * 2 + 1]);
  }
  const trees = [];
  for (let i = 0; i < (ctx.trees || []).length; i += 2) {
    const tx = ctx.trees[i], tz = ctx.trees[i + 1];
    if (tx > x0 - 3 && tx < x1 + 3 && tz > z0 - 3 && tz < z1 + 3) trees.push(tx, tz);
  }
  const edgeD = (x, z) => {
    let best = Infinity;
    for (let i = 0, j = n - 1; i < n; j = i++)
      best = Math.min(best, segDist(x, z, poly[j * 2], poly[j * 2 + 1], poly[i * 2], poly[i * 2 + 1]));
    return best;
  };
  const accepted = [];
  const HC = 8, hash = new Map();
  const hk = (x, z) => Math.floor(x / HC) * 100003 + Math.floor(z / HC);

  const tryStall = (cx, cz, ux, uz, nx, nz) => {
    const hw = STALL_W / 2 - 0.05, hd = STALL_D / 2 - 0.05;
    const q = [
      [cx - ux * hw - nx * hd, cz - uz * hw - nz * hd], [cx + ux * hw - nx * hd, cz + uz * hw - nz * hd],
      [cx + ux * hw + nx * hd, cz + uz * hw + nz * hd], [cx - ux * hw + nx * hd, cz - uz * hw + nz * hd],
    ];
    // целиком внутри контура и не вплотную к кромке
    for (const v of q) if (!inPoly(v[0], v[1], poly) || edgeD(v[0], v[1]) < 0.2) return false;
    // проезжая часть, тротуары, дорожки
    // сегмент записан в клетки с запасом на свой просвет — хватает клеток углов
    const seen = new Set();
    for (const v of q)
      for (const s of ctx.segs.at(v[0], v[1])) {
        if (seen.has(s)) continue;
        seen.add(s);
        if (segRect(s.ax, s.az, s.bx, s.bz, q) < s.clear) return false;
      }
    // дома: углы, середины сторон и центр
    if (ctx.buildings) {
      const pts = [...q, [cx, cz], [(q[0][0] + q[1][0]) / 2, (q[0][1] + q[1][1]) / 2],
        [(q[2][0] + q[3][0]) / 2, (q[2][1] + q[3][1]) / 2], [(q[1][0] + q[2][0]) / 2, (q[1][1] + q[2][1]) / 2],
        [(q[3][0] + q[0][0]) / 2, (q[3][1] + q[0][1]) / 2]];
      for (const v of pts) if (ctx.buildings.find(v[0], v[1])) return false;
    }
    // деревья: ствол с запасом на полметра вокруг кузова
    for (let i = 0; i < trees.length; i += 2) {
      const dx = trees[i] - cx, dz = trees[i + 1] - cz;
      if (Math.abs(dx * ux + dz * uz) < hw + 0.7 && Math.abs(dx * nx + dz * nz) < hd + 0.7) return false;
    }
    for (const bp of ctx.blockers || []) if (inPoly(cx, cz, bp)) return false;
    // внахлёст с принятыми
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (const o of hash.get(hk(cx + i * HC, cz + j * HC)) || [])
          if (Math.hypot(o.x - cx, o.z - cz) < 5.6 && rectsOverlap(o.q, q)) return false;
    const st = { x: cx, z: cz, ux, uz, nx, nz, q };
    accepted.push(st);
    const k = hk(cx, cz);
    let b = hash.get(k); if (!b) hash.set(k, b = []);
    b.push(st);
    return true;
  };

  // 1. вдоль проездов: по обе стороны каждой улицы, проходящей по парковке
  let aisles = 0;
  for (const s of ctx.segs.segs) {
    const mx = (s.ax + s.bx) / 2, mz = (s.az + s.bz) / 2;
    if (mx < x0 - 6 || mx > x1 + 6 || mz < z0 - 6 || mz > z1 + 6) continue;
    const L = Math.hypot(s.bx - s.ax, s.bz - s.az);
    if (L < STALL_W) continue;
    const ux = (s.bx - s.ax) / L, uz = (s.bz - s.az) / L;
    let any = false;
    for (const side of [-1, 1]) {
      const nx = -uz * side, nz = ux * side;
      const off = s.hw + s.side + 0.35 + STALL_D / 2;
      // равномерно по длине отрезка, с полуместом от концов
      const cnt = Math.floor((L - 0.5) / STALL_W);
      const t0 = (L - cnt * STALL_W) / 2 + STALL_W / 2;
      for (let k = 0; k < cnt; k++) {
        const t = t0 + k * STALL_W;
        const cx = s.ax + ux * t + nx * off, cz = s.az + uz * t + nz * off;
        if (tryStall(cx, cz, ux, uz, nx, nz)) any = true;
      }
    }
    if (any) aisles++;
  }

  // 2. проездов нет — ряды по рамке. Ряды вдоль ДЛИННОЙ стороны, модуль
  // «ряд 5 · проезд 6 · ряд 5», остаток поровну по краям.
  if (!aisles && a.__f) {
    const f = a.__f;
    const alongU = f.W >= f.L;
    const RL = alongU ? f.W : f.L, RW = alongU ? f.L : f.W;
    const ax = alongU ? f.ux : -f.uz, az = alongU ? f.uz : f.ux;     // вдоль ряда
    const bx = alongU ? -f.uz : f.ux, bz = alongU ? f.ux : f.uz;     // поперёк
    const at = (s, t) => alongU
      ? [f.ox + s * f.ux - t * f.uz, f.oz + s * f.uz + t * f.ux]
      : [f.ox + t * f.ux - s * f.uz, f.oz + t * f.uz + s * f.ux];
    const MOD = 16;
    const nMod = Math.max(RW >= 11 ? 1 : 0, Math.floor((RW + 0.01) / MOD));
    let rows = [];
    if (nMod >= 1 && RW >= MOD) {
      const off = (RW - nMod * MOD) / 2;
      for (let m = 0; m < nMod; m++) {
        rows.push({ t: off + m * MOD + 2.5, dir: -1 });          // торцом к проезду
        rows.push({ t: off + m * MOD + 13.5, dir: 1 });
      }
    } else if (RW >= 11) {
      const off = (RW - 11) / 2;
      rows = [{ t: off + 2.5, dir: -1 }];
    }
    const cnt = Math.floor((RL - 1) / STALL_W);
    const s0 = (RL - cnt * STALL_W) / 2 + STALL_W / 2;
    for (const r of rows)
      for (let k = 0; k < cnt; k++) {
        const [cx, cz] = at(s0 + k * STALL_W, r.t);
        // n — от проезда к торцу места
        tryStall(cx, cz, ax, az, bx * r.dir, bz * r.dir);
      }
  }
  return accepted;
}
