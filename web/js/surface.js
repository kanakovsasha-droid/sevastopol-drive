// Высота ВИДИМОЙ поверхности в точке — то, на что ставится мебель, урны,
// таблички: асфальт, плитка тротуара или земля. Повторяет правила, по
// которым buildRoads кладёт слои (см. «Порядок высот» в worldgen.js).
//
// Скамейка ставилась по профилю езды (driveHeightAt): у улицы это плато
// коридора шириной до 27 м, и за тротуаром, на склоне сквера, скамейка
// висела над газоном на полметра, а на самом тротуаре стояла на 20 см
// ниже плитки и тонула в ней ножками.

const ROAD_Y = 0.14, WALK_TOP = 0.20, SIDEWALK = 2.6;

// Улице положен тротуар — то же правило, что walkRoad в buildRoads.
const walks = r => !r.br && !r.tn && (r.c <= 2 ? r.w >= 3 : r.c === 3 && r.w >= 6);

export function surfaceTop(terrain, roadIndex, x, z) {
  const hit = roadIndex && roadIndex.nearest(x, z, 12, r => r.c <= 3 && !r.br && !r.tn);
  if (hit) {
    const hw = hit.road.w / 2;
    if (hit.dist < hw) return terrain.driveHeightAt(x, z) + ROAD_Y;
    const sw = hit.road.w < 5 ? 1.7 : SIDEWALK;
    if (walks(hit.road) && hit.dist < hw + sw) return terrain.driveHeightAt(x, z) + WALK_TOP;
  }
  return terrain.gridHeightAt(x, z);
}
