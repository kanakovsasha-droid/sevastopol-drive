// Пятна моделей без контура OSM — памятников, фонтана, «Ракушки», мостика,
// деревьев-моделей. Посадка (props.js, street.js) спрашивает world.__noPlant,
// а тот знал только площадки: у памятника своего контура нет, и деревья
// сажались прямо на его гранит (у «Солдата и Матроса» — роща на клине
// постамента). Пятно — выпуклая оболочка низа модели в метрах мира, его
// считает tools/model-pads.mjs и пишет полем `pad` в записи landmarks.
// Запас MARGIN — чтобы ствол не вставал вплотную к ступеням, а крона не
// ложилась на фигуру.

const MARGIN = 1.6;

export function padBlocker(defs, base = () => false) {
  const pads = [];
  for (const d of defs) {
    const p = d.pad;
    if (!p || p.length < 6) continue;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < p.length; i += 2) {
      x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]);
      z0 = Math.min(z0, p[i + 1]); z1 = Math.max(z1, p[i + 1]);
    }
    pads.push({ p, x0: x0 - MARGIN, z0: z0 - MARGIN, x1: x1 + MARGIN, z1: z1 + MARGIN });
  }
  if (!pads.length) return base;
  const hit = (q, x, z) => {
    const p = q.p;
    let inside = false, d2 = Infinity;
    for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
      const ax = p[j], az = p[j + 1], bx = p[i], bz = p[i + 1];
      if ((bz > z) !== (az > z) && x < (ax - bx) * (z - bz) / (az - bz) + bx) inside = !inside;
      const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9;
      let t = ((x - ax) * dx + (z - az) * dz) / L2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = x - ax - dx * t, ez = z - az - dz * t;
      d2 = Math.min(d2, ex * ex + ez * ez);
    }
    return inside || d2 < MARGIN * MARGIN;
  };
  return (x, z) => {
    if (base(x, z)) return true;
    for (const q of pads)
      if (x >= q.x0 && x <= q.x1 && z >= q.z0 && z <= q.z1 && hit(q, x, z)) return true;
    return false;
  };
}
