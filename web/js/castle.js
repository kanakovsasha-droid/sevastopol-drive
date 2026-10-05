// Частный дом «как замок»: зубчатый парапет по кровле и круглая башня на углу.
//
// Первый такой дом — Льва Толстого, 4Б (w169280028, напротив хрущёвки 4А):
// со слов владельца, «вообще как замок выглядит, частный дом». Фото дома нет —
// это аккуратный особняк в два этажа под плоской кровлей с зубцами и башня
// под шатром на одном углу. Включается полем дома castle (houses.json):
//   castle: 1                      — башня на углу 0;
//   castle: { tower: k, th: 4.5 }  — на углу k, выше кровли на th метров.
// Всё ложится в общий меш домов (новых вызовов отрисовки нет), коллайдер —
// прежний контур OSM: башня не выходит за угол больше чем на метр.

const SIDES = 12;              // граней башни
const MERLON = 0.75;           // ширина зубца, шаг — вдвое больше

function ringN(p) {
  let n = p.length / 2;
  if (n > 3 && Math.hypot(p[0] - p[n * 2 - 2], p[1] - p[n * 2 - 1]) < 0.05) n--;
  return n;
}

// Зубцы по стене A→B (нормаль наружу nx,nz): сплошной бортик и зубцы над ним.
function battlement(ax, az, bx, bz, nx, nz, y, col, Hb, box, inset) {
  const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz);
  if (l < 1.5) return;
  const ux = dx / l, uz = dz / l;
  const ox = -nx * 0.2, oz = -nz * 0.2;          // бортик по внешней кромке стены
  const a0 = inset, a1 = l - inset;
  if (a1 - a0 < 1) return;
  box(ax + ux * (a0 + a1) / 2 + ox, az + uz * (a0 + a1) / 2 + oz, (a1 - a0) / 2, 0.2,
      y - 0.05, y + 0.55, col, 2, ux, uz, Hb);
  const k = Math.max(1, Math.floor((a1 - a0 + MERLON) / (MERLON * 2)));
  const pad = (a1 - a0 - (k * 2 - 1) * MERLON) / 2;
  for (let m = 0; m < k; m++) {
    const t = a0 + pad + m * MERLON * 2 + MERLON / 2;
    box(ax + ux * t + ox, az + uz * t + oz, MERLON / 2, 0.22, y + 0.55, y + 1.25, col, 2, ux, uz, Hb);
  }
}

export function castleExtras(b, yBase, yFloor, yTop, wall, roof, Hb, box, pushV) {
  if (!b.castle) return;
  const opt = typeof b.castle === 'object' ? b.castle : {};
  const p = b.poly, n = ringN(p);
  if (n < 3) return;
  // направление обхода: площадь > 0 — против часовой в осях x, z (как в чанках)
  let A2 = 0;
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; A2 += p[i * 2] * p[j * 2 + 1] - p[j * 2] * p[i * 2 + 1]; }
  const sg = A2 >= 0 ? 1 : -1;
  const stone = [wall[0] * 0.9, wall[1] * 0.88, wall[2] * 0.85];

  // башня: на углу k, центр чуть внутрь контура
  const k = Math.min(n - 1, Math.max(0, opt.tower | 0));
  let cx = 0, cz = 0;
  for (let i = 0; i < n; i++) { cx += p[i * 2]; cz += p[i * 2 + 1]; }
  cx /= n; cz /= n;
  const kx = p[k * 2], kz = p[k * 2 + 1];
  const dl = Math.hypot(cx - kx, cz - kz) || 1;
  const R = 2.4;
  const tx = kx + (cx - kx) / dl * 1.2, tz = kz + (cz - kz) / dl * 1.2;
  const tTop = yTop + (opt.th || 4.2);

  // зубцы по кровле; у угла башни стена короче на радиус
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = p[i * 2], az = p[i * 2 + 1], bx = p[j * 2], bz = p[j * 2 + 1];
    const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz);
    if (l < 0.15) continue;
    const nx = sg * dz / l, nz = -sg * dx / l;
    if (sg > 0) battlement(ax, az, bx, bz, nx, nz, yTop, stone, Hb, box, 0.25);
    else battlement(bx, bz, ax, az, nx, nz, yTop, stone, Hb, box, 0.25);
  }

  // ствол башни: окна — обычным фасадом, по периметру метры вдоль стены
  const Ht = tTop - yFloor;
  const pt = s => [tx + Math.cos(s) * R, tz + Math.sin(s) * R];
  let u = 0;
  for (let s = 0; s < SIDES; s++) {
    const [ax, az] = pt(s / SIDES * Math.PI * 2), [bx, bz] = pt((s + 1) / SIDES * Math.PI * 2);
    const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz);
    const nx = dz / l, nz = -dx / l;
    const wb = yBase - yFloor;
    pushV(ax, yBase, az, nx, 0, nz, wall, u, wb, Ht, 0);
    pushV(bx, tTop, bz, nx, 0, nz, wall, u + l, Ht, Ht, 0);
    pushV(bx, yBase, bz, nx, 0, nz, wall, u + l, wb, Ht, 0);
    pushV(ax, yBase, az, nx, 0, nz, wall, u, wb, Ht, 0);
    pushV(ax, tTop, az, nx, 0, nz, wall, u, Ht, Ht, 0);
    pushV(bx, tTop, bz, nx, 0, nz, wall, u + l, Ht, Ht, 0);
    u += l;
  }
  // карниз-машикули: кольцо пошире ствола
  const R2 = R + 0.35, y0 = tTop - 0.1, y1 = tTop + 0.5;
  const pt2 = s => [tx + Math.cos(s) * R2, tz + Math.sin(s) * R2];
  for (let s = 0; s < SIDES; s++) {
    const [ax, az] = pt2(s / SIDES * Math.PI * 2), [bx, bz] = pt2((s + 1) / SIDES * Math.PI * 2);
    const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz);
    const nx = dz / l, nz = -dx / l;
    pushV(ax, y0, az, nx, 0, nz, stone, 0, 0, Hb, 2);
    pushV(bx, y1, bz, nx, 0, nz, stone, l, 0.6, Hb, 2);
    pushV(bx, y0, bz, nx, 0, nz, stone, l, 0, Hb, 2);
    pushV(ax, y0, az, nx, 0, nz, stone, 0, 0, Hb, 2);
    pushV(ax, y1, az, nx, 0, nz, stone, 0, 0.6, Hb, 2);
    pushV(bx, y1, bz, nx, 0, nz, stone, l, 0.6, Hb, 2);
    // низ кольца — чтобы снизу не просвечивало
    pushV(ax, y0, az, 0, -1, 0, stone, 0, 0, Hb, 2);
    pushV(bx, y0, bz, 0, -1, 0, stone, 0, 0, Hb, 2);
    pushV(tx, y0, tz, 0, -1, 0, stone, 0, 0, Hb, 2);
  }
  // шатёр над кольцом
  const apex = y1 + R2 * 1.9;
  for (let s = 0; s < SIDES; s++) {
    const a = s / SIDES * Math.PI * 2, c = (s + 1) / SIDES * Math.PI * 2, m = (a + c) / 2;
    const [ax, az] = pt2(a), [bx, bz] = pt2(c);
    const sl = R2 / Math.hypot(R2, apex - y1);
    const nx = Math.cos(m) * (1 - sl * 0.5), ny = sl + 0.4, nz = Math.sin(m) * (1 - sl * 0.5);
    const nl = Math.hypot(nx, ny, nz);
    pushV(ax, y1, az, nx / nl, ny / nl, nz / nl, roof, ax, az, Hb, 1);
    pushV(tx, apex, tz, nx / nl, ny / nl, nz / nl, roof, tx, tz, Hb, 1);
    pushV(bx, y1, bz, nx / nl, ny / nl, nz / nl, roof, bx, bz, Hb, 1);
  }
  // шпиль-флюгер
  box(tx, tz, 0.06, 0.06, apex - 0.2, apex + 1.1, [0.25, 0.24, 0.22], 2, 1, 0, Hb);
}
