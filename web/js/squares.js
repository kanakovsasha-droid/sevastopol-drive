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
  if (list && !list.some(g => g.id === s.id)) list.push({ id: s.id, kind: s.kind || 'park', poly: s.poly });
};

// В far-слой — до раскладки его по квадратам (FarIndex): по нему красится земля.
export function addFarSquares(far) {
  if (!far.green) far.green = [];
  for (const s of SQUARES) put(far.green, s);
}

// В зелень собираемого квадрата: и в его собственный список, и в общий
// контекст посадок (roads.ctx, см. chunks.js) — props.js берёт оттуда.
export function addSquares(w) {
  const b = w.meta.bounds;
  for (const s of SQUARES) {
    if (s.bb[2] < b.minX || s.bb[0] > b.maxX || s.bb[3] < b.minZ || s.bb[1] > b.maxZ) continue;
    put(w.green, s);
    if (w.roads.ctx) put(w.roads.ctx.green, s);
  }
}
