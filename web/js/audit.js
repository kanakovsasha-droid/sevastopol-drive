// Аудит всей карты. Задача — не ловить дефекты по скриншотам, а получить
// полный список по классам с числами и худшими точками, чинить пачками
// и сравнивать «было / стало». Вызов: G.audit()

const RES = 2;   // сетка растеризации, м

export function audit(G) {
  const { world, terrain, scene, roads: roadIndex } = G;
  const b = world.meta.bounds;
  const X0 = b.minX - 30, Z0 = b.minZ - 30;
  const W = Math.ceil((b.maxX - b.minX + 60) / RES);
  const H = Math.ceil((b.maxZ - b.minZ + 60) / RES);
  const cell = (x, z) => {
    const i = Math.floor((x - X0) / RES), j = Math.floor((z - Z0) / RES);
    return (i < 0 || j < 0 || i >= W || j >= H) ? -1 : j * W + i;
  };
  const out = {};
  const worstOf = arr => arr.sort((p, q) => q.v - p.v).slice(0, 5)
    .map(o => `${o.v.toFixed(2)} @ ${o.x | 0},${o.z | 0}${o.n ? ' — ' + o.n : ''}`);

  // ---------- растр проезжих частей ----------
  const cover = new Int32Array(W * H).fill(-1);
  const dbl = new Uint8Array(W * H);
  // ВАЖНО: считаем только те улицы, что реально попали в геометрию.
  // Иначе аудит мерит исходные данные OSM, а не картинку, и цифры врут.
  const grpRoads = scene.getObjectByName('roads');
  const drawn = grpRoads?.userData?.drawn;
  const drivable = world.roads.map((r, i) => ({ r, i }))
    .filter(o => o.r.c <= 3 && o.r.w >= 4 && (!drawn || drawn.has(o.i)));
  let covered = 0;
  for (const { r, i } of drivable) {
    const p = r.pts, hw = r.w / 2;
    for (let k = 0; k < p.length / 2 - 1; k++) {
      const ax = p[k * 2], az = p[k * 2 + 1];
      const dx = p[k * 2 + 2] - ax, dz = p[k * 2 + 3] - az;
      const L = Math.hypot(dx, dz); if (L < 0.2) continue;
      const st = Math.ceil(L / 1.5);
      for (let s = 0; s <= st; s++) {
        const cx = ax + dx * s / st, cz = az + dz * s / st;
        const rc = Math.ceil(hw / RES);
        for (let dj = -rc; dj <= rc; dj++)
          for (let di = -rc; di <= rc; di++) {
            const x = cx + di * RES, z = cz + dj * RES;
            if ((x - cx) ** 2 + (z - cz) ** 2 > hw * hw) continue;
            const c = cell(x, z); if (c < 0) continue;
            if (cover[c] < 0) { cover[c] = i; covered++; }
            else if (cover[c] !== i) dbl[c] = 1;
          }
      }
    }
  }
  let nDbl = 0; for (let i = 0; i < dbl.length; i++) if (dbl[i]) nDbl++;
  out['дороги друг на друге'] = { всего: covered, дефект: nDbl, процент: +(100 * nDbl / covered).toFixed(2) };

  // ---------- бордюры и тротуары на чужой проезжей части ----------
  let kTot = 0, kBad = 0; const kW = [];
  for (const { r, i } of drivable) {
    if (r.w < 5) continue;
    const p = r.pts, hw = r.w / 2;
    for (let k = 0; k < p.length / 2 - 1; k++) {
      const ax = p[k * 2], az = p[k * 2 + 1];
      const dx = p[k * 2 + 2] - ax, dz = p[k * 2 + 3] - az;
      const L = Math.hypot(dx, dz); if (L < 1) continue;
      const nx = -dz / L, nz = dx / L, st = Math.ceil(L / 4);
      for (let s = 0; s <= st; s++) {
        const cx = ax + dx * s / st, cz = az + dz * s / st;
        for (const sd of [1, -1]) for (const off of [hw + 0.3, hw + 2.6]) {
          const x = cx + nx * sd * off, z = cz + nz * sd * off; kTot++;
          const c = cell(x, z);
          if (c >= 0 && cover[c] >= 0 && cover[c] !== i) { kBad++; if (kW.length < 40) kW.push({ v: 1, x, z, n: r.n }); }
        }
      }
    }
  }
  out['бордюр на чужой дороге (данные)'] = { проб: kTot, дефект: kBad, процент: +(100 * kBad / kTot).toFixed(2) };

  // Честная метрика: сколько НАРИСОВАННОГО бордюра и тротуара лежит вглубь
  // чужой полосы. Вершины на самой кромке не считаем — они там законно.
  {
    let dTot = 0, dBad = 0; const dW = [];
    const inset = (x, z) => {
      const c = cell(x, z);
      if (!(c >= 0 && cover[c] >= 0)) return false;
      // требуем, чтобы точка была внутри полосы с запасом 1.5 м со всех сторон
      for (const [dx, dz] of [[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]]) {
        const k = cell(x + dx, z + dz);
        if (!(k >= 0 && cover[k] >= 0)) return false;
      }
      return true;
    };
    for (const m of grpRoads.children) {
      const K = m.geometry.attributes.aCls.array, P = m.geometry.attributes.position.array;
      for (let i = 0; i < K.length; i++) {
        if (K[i] !== 5 && K[i] !== 6) continue;
        dTot++;
        if (inset(P[i * 3], P[i * 3 + 2])) { dBad++; if (dW.length < 40) dW.push({ v: 1, x: P[i * 3], z: P[i * 3 + 2] }); }
      }
    }
    out['бордюр вглубь чужой полосы'] = { вершин: dTot, дефект: dBad,
      процент: dTot ? +(100 * dBad / dTot).toFixed(2) : 0,
      примеры: dW.slice(0, 5).map(o => `${o.x | 0},${o.z | 0}`) };
  }

  // ---------- полотно в воздухе и под грунтом (по серединам пролётов) ----------
  const ROAD_Y = 0.14, SAFE = 0.35;
  const Hh = (x, z) => {
    const g = terrain.gridHeightAt(x, z), d = terrain.driveHeightAt(x, z);
    return (d < g - SAFE ? g - SAFE : d > g + SAFE ? g + SAFE : d) + ROAD_Y;
  };
  const dens = (p, step) => {
    const o = []; const n = p.length / 2;
    for (let i = 0; i < n - 1; i++) {
      const ax = p[i * 2], az = p[i * 2 + 1], dx = p[i * 2 + 2] - ax, dz = p[i * 2 + 3] - az;
      const L = Math.hypot(dx, dz), k = Math.max(1, Math.ceil(L / step));
      for (let j = 0; j < k; j++) o.push(ax + dx * j / k, az + dz * j / k);
    }
    o.push(p[(n - 1) * 2], p[(n - 1) * 2 + 1]); return o;
  };
  let mid = 0, air = 0, bur = 0; const aW = [], bW = [];
  for (const { r } of drivable) {
    if (r.w < 5) continue;
    const p = dens(r.pts, 6);
    for (let i = 0; i < p.length / 2 - 1; i++) {
      const x0 = p[i * 2], z0 = p[i * 2 + 1], x1 = p[i * 2 + 2], z1 = p[i * 2 + 3];
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      const y = (Hh(x0, z0) + Hh(x1, z1)) / 2, g = terrain.gridHeightAt(mx, mz);
      mid++; const dv = y - g;
      if (dv > 1) { air++; aW.push({ v: dv, x: mx, z: mz, n: r.n }); }
      if (dv < -0.05) { bur++; bW.push({ v: -dv, x: mx, z: mz, n: r.n }); }
    }
  }
  out['полотно в воздухе'] = { проб: mid, дефект: air, процент: +(100 * air / mid).toFixed(2), худшие: worstOf(aW) };
  out['полотно под грунтом'] = { проб: mid, дефект: bur, процент: +(100 * bur / mid).toFixed(2), худшие: worstOf(bW) };

  // ---------- геометрия дорог, оторванная от земли ----------
  const grp = grpRoads;
  let vTot = 0, vBad = 0; const vW = [];
  for (const m of grp.children) {
    const P = m.geometry.attributes.position.array;
    for (let i = 0; i < P.length; i += 3) {
      const dv = P[i + 1] - terrain.gridHeightAt(P[i], P[i + 2]); vTot++;
      if (Math.abs(dv) > 2) { vBad++; vW.push({ v: Math.abs(dv), x: P[i], z: P[i + 2] }); }
    }
  }
  out['вершины дорог вне земли'] = { всего: vTot, дефект: vBad, процент: +(100 * vBad / vTot).toFixed(2), худшие: worstOf(vW) };

  // ---------- уклон улиц ----------
  let sTot = 0, sBad = 0; const sW = [];
  for (const { r } of drivable) {
    if (r.w < 5) continue;
    const p = r.pts;
    for (let i = 0; i < p.length / 2 - 1; i++) {
      const ax = p[i * 2], az = p[i * 2 + 1], dx = p[i * 2 + 2] - ax, dz = p[i * 2 + 3] - az;
      const L = Math.hypot(dx, dz); if (L < 4) continue;
      const gr = Math.abs(terrain.driveHeightAt(ax + dx, az + dz) - terrain.driveHeightAt(ax, az)) / L * 100;
      sTot++; if (gr > 18) { sBad++; sW.push({ v: gr, x: ax, z: az, n: r.n }); }
    }
  }
  out['уклон круче 18%'] = { сегментов: sTot, дефект: sBad, процент: +(100 * sBad / sTot).toFixed(2), худшие: worstOf(sW) };

  // ---------- обрывы рельефа ----------
  const gr = terrain.grid;
  let gTot = 0, gBad = 0; const gW = [];
  for (let j = 1; j < gr.nx - 1; j++)
    for (let i = 1; i < gr.nx - 1; i++) {
      const k = j * gr.nx + i;
      const dh = Math.max(Math.abs(gr.h[k] - gr.h[k + 1]), Math.abs(gr.h[k] - gr.h[k + gr.nx]));
      gTot++; const sl = dh / gr.dx;
      if (sl > 1) { gBad++; if (gW.length < 200) gW.push({ v: sl, x: gr.x0 + i * gr.dx, z: gr.z0 + j * gr.dz }); }
    }
  out['обрывы рельефа круче 45°'] = { узлов: gTot, дефект: gBad, процент: +(100 * gBad / gTot).toFixed(2), худшие: worstOf(gW) };

  // ---------- столбы и деревья на проезжей части ----------
  const props = scene.getObjectByName('props');
  let pTot = 0, pBad = 0; const pW = [];
  if (props) {
    const m4 = new G.THREE.Matrix4(), v3 = new G.THREE.Vector3();
    for (const m of props.children) {
      for (let i = 0; i < m.count; i++) {
        m.getMatrixAt(i, m4); v3.setFromMatrixPosition(m4); pTot++;
        const c = cell(v3.x, v3.z);
        if (c >= 0 && cover[c] >= 0) { pBad++; if (pW.length < 40) pW.push({ v: 1, x: v3.x, z: v3.z }); }
      }
    }
  }
  out['деревья и фонари на дороге'] = { всего: pTot, дефект: pBad, процент: +(100 * pBad / pTot).toFixed(2), примеры: pW.slice(0, 5).map(o => `${o.x | 0},${o.z | 0}`) };

  // ---------- зебры: считаем НАРИСОВАННЫЕ, а не строки в данных ----------
  let zDrawn = grpRoads?.userData?.zebras ?? 0, zBad = 0;
  // Считаем ЦЕНТР каждой зебры, а не её углы: полоса кладётся во всю ширину
  // проезжей части, и её углы законно лежат на кромке. Зебры пишутся
  // четвёрками подряд, поэтому берём четвёрку от найденной вершины.
  let zVert = 0;
  for (const m of grpRoads.children) {
    const K = m.geometry.attributes.aCls.array, P = m.geometry.attributes.position.array;
    for (let i = 0; i < K.length; i++) {
      if (K[i] !== 7) continue;
      let sx = 0, sz = 0;
      for (let k = 0; k < 4; k++) { sx += P[(i + k) * 3]; sz += P[(i + k) * 3 + 2]; }
      zVert++;
      const c = cell(sx / 4, sz / 4);
      if (!(c >= 0 && cover[c] >= 0)) zBad++;
      i += 3;
    }
  }
  out['зебры вне асфальта'] = { нарисовано: zDrawn, отброшено: (world.crossings || []).length - zDrawn,
                                зебр: zVert, дефект: zBad,
                                процент: zVert ? +(100 * zBad / zVert).toFixed(2) : 0 };

  return out;
}
