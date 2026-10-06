// Скверы, которых нет в OSM отдельным контуром (data/squares.json). Контур
// собран из рёбер соседних контуров OSM — края парка, стен домов, тротуара,
// — откуда именно, записано в поле source. В игре сквер — обычная зелень
// вида park: земля под ним красится газоном (рельеф берёт зелень из far-слоя),
// деревья, кусты и изгородь по кромке сажает props.js из зелени квадрата.

let SQUARES = [];

export async function loadSquares(v) {
  SQUARES = await fetch(`../data/squares.json${v ? '?v=' + v : ''}`)
    .then(r => r.ok ? r.json() : []).catch(() => []);
  for (const s of SQUARES) {
    const q = s.poly;
    s.bb = [Infinity, Infinity, -Infinity, -Infinity];
    for (let i = 0; i < q.length; i += 2) {
      s.bb[0] = Math.min(s.bb[0], q[i]); s.bb[2] = Math.max(s.bb[2], q[i]);
      s.bb[1] = Math.min(s.bb[1], q[i + 1]); s.bb[3] = Math.max(s.bb[3], q[i + 1]);
    }
  }
  return SQUARES;
}

const put = (list, s) => {
  if (list && !list.some(g => g.id === s.id)) list.push({ id: s.id, kind: s.kind || 'park', poly: s.poly, ...(s.dens ? { dens: s.dens } : {}) });
};

// В far-слой — до раскладки его по квадратам (FarIndex): по нему красится земля.
export function addFarSquares(far) {
  if (!far.green) far.green = [];
  for (const s of SQUARES) put(far.green, s);
}

// В зелень собираемого квадрата: и в его собственный список, и в общий
// контекст посадок (roads.ctx, см. chunks.js) — props.js берёт оттуда.
// Дорожки сквера (поле paths, вид как у улиц world.json: c, w, sf, pts) — в
// улицы квадрата до сборки дорог: их кладёт buildRoads, как любую аллею, а
// props.js по ним не сажает. Дорожку берёт ОДИН квадрат — тот, в чьих
// границах её начало (как у дедупликации chunks.js), иначе легла бы дважды.
export function addSquares(w) {
  const b = w.meta.bounds, ctx = w.roads.ctx;
  for (const s of SQUARES) {
    if (s.bb[2] < b.minX || s.bb[0] > b.maxX || s.bb[3] < b.minZ || s.bb[1] > b.maxZ) continue;
    put(w.green, s);
    if (ctx) put(ctx.green, s);
    if (!ctx || ctx.orphan) continue;
    for (const p of s.paths || []) {
      if (!own(ctx, p.pts[0], p.pts[1]) || w.roads.some(r => r.id === p.id)) continue;
      w.roads.push(p);
      if (!ctx.all.some(r => r.id === p.id)) ctx.all.push(p);
    }
  }
}

const own = (ctx, x, z) => x >= ctx.x0 && x < ctx.x1 && z >= ctx.z0 && z < ctx.z1;

// Скамейки и урны сквера (поле furniture: {k, x, z}) — к точкам мебели
// квадрата, где они стоят; ставит и поворачивает их furniture.js, как OSM-ные.
export function squareFurniture(points, w) {
  const ctx = w.roads.ctx;
  if (!ctx || ctx.orphan) return points;
  const add = [];
  for (const s of SQUARES)
    for (const f of s.furniture || []) if (own(ctx, f.x, f.z)) add.push(f);
  return add.length ? points.concat(add) : points;
}
