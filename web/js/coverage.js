// Единый растр проезжих частей. Раньше его строили трижды — в сборщике дорог,
// в расстановке деревьев и в аудите — и все три claim-али ячейки в разном
// порядке. «Чужая полоса» означала у них разное, и правка мерилась не тем,
// что чинилась. Теперь растр один на всех.

export const COV_RES = 2;          // метров на ячейку

export function buildCoverage(world, opts = {}) {
  const margin = opts.margin ?? 0.6;   // запас на кромку полотна
  const b = world.meta.bounds;
  const x0 = b.minX - 30, z0 = b.minZ - 30;
  const W = Math.ceil((b.maxX - b.minX + 60) / COV_RES);
  const H = Math.ceil((b.maxZ - b.minZ + 60) / COV_RES);
  const owner = new Int32Array(W * H).fill(-1);
  const width = new Float32Array(W * H);

  const cell = (x, z) => {
    const i = Math.floor((x - x0) / COV_RES), j = Math.floor((z - z0) / COV_RES);
    return (i < 0 || j < 0 || i >= W || j >= H) ? -1 : j * W + i;
  };

  // Широкие улицы занимают землю первыми: узкий проезд, попавший на проспект,
  // должен считать чужой именно проспект, а не наоборот.
  const drive = world.roads.map((r, i) => ({ r, i }))
    .filter(o => o.r.c <= 3 && o.r.w >= 4)
    .sort((a, b2) => b2.r.w - a.r.w);

  const share = new Map();   // индекс дороги → доля длины, уже занятая более широкой
  for (const { r, i } of drive) {
    const p = r.pts, hw = r.w / 2 + margin;
    let taken = 0, total = 0;
    const mine = [];
    for (let k = 0; k < p.length / 2 - 1; k++) {
      const ax = p[k * 2], az = p[k * 2 + 1];
      const dx = p[k * 2 + 2] - ax, dz = p[k * 2 + 3] - az;
      const L = Math.hypot(dx, dz);
      if (L < 0.2) continue;
      const steps = Math.ceil(L / 1.5), rc = Math.ceil(hw / COV_RES);
      for (let s = 0; s <= steps; s++) {
        const cx = ax + dx * s / steps, cz = az + dz * s / steps;
        total++;
        const c0 = cell(cx, cz);
        if (c0 >= 0 && owner[c0] >= 0 && owner[c0] !== i && width[c0] > r.w + 0.5) taken++;
        for (let dj = -rc; dj <= rc; dj++)
          for (let di = -rc; di <= rc; di++) {
            const x = cx + di * COV_RES, z = cz + dj * COV_RES;
            if ((x - cx) ** 2 + (z - cz) ** 2 > hw * hw) continue;
            const c = cell(x, z);
            if (c >= 0) mine.push(c);
          }
      }
    }
    share.set(i, total ? taken / total : 0);
    for (const c of mine) if (owner[c] < 0 || width[c] < r.w) { owner[c] = i; width[c] = r.w; }
  }

  const onRoad = (x, z) => { const c = cell(x, z); return c >= 0 && owner[c] >= 0; };
  const ownerAt = (x, z) => { const c = cell(x, z); return c >= 0 ? owner[c] : -1; };
  const onOther = (x, z, own) => { const c = cell(x, z); return c >= 0 && owner[c] >= 0 && owner[c] !== own; };
  const underWider = (x, z, own, w) => {
    const c = cell(x, z);
    return c >= 0 && owner[c] >= 0 && owner[c] !== own && width[c] > w + 0.5;
  };
  // точка не просто на полосе, а вглубь неё — со всех сторон асфальт
  const deepInside = (x, z, own, pad = 1.5) => {
    if (!onOther(x, z, own)) return false;
    for (const [dx, dz] of [[pad, 0], [-pad, 0], [0, pad], [0, -pad]])
      if (!onOther(x + dx, z + dz, own)) return false;
    return true;
  };

  return { owner, width, W, H, x0, z0, res: COV_RES, cell, onRoad, ownerAt, onOther, underWider, deepInside, share };
}
