// Пятна моделей памятников (data/landmark-footprints.json, считает
// tools/landmark-footprints.mjs): посадка деревьев и кустов их обходит.
// Только памятники — у моделей зданий (skip не пуст) контур есть в OSM, и
// посадку от них уже отводит сетка домов; габарит здания вдобавок захватил
// бы дворы и скверы.

let FP = {};
export async function loadFootprints(v) {
  FP = await fetch(`../data/landmark-footprints.json${v ? '?v=' + v : ''}`).then(r => r.json()).catch(() => ({}));
}

// Для квартала: (x, z) → лежит ли точка на пятне памятника (с запасом pad).
export function monumentTest(defs, pad = 1.2) {
  const boxes = [];
  for (const d of defs || []) {
    if (d.style !== 'model' || !d.file || (d.skip && d.skip.length) || d.ox === undefined) continue;
    const f = FP[d.file];
    if (!f) continue;
    boxes.push(d.ox + f[0] - pad, d.oz + f[1] - pad, d.ox + f[2] + pad, d.oz + f[3] + pad);
  }
  if (!boxes.length) return null;
  return (x, z) => {
    for (let i = 0; i < boxes.length; i += 4)
      if (x >= boxes[i] && x <= boxes[i + 2] && z >= boxes[i + 1] && z <= boxes[i + 3]) return true;
    return false;
  };
}
