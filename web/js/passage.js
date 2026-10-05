// Арка-проезд в первом этаже дома: с улицы во двор насквозь.
//
// В OSM проезды под домом отмечены редко (tunnel=building_passage у дороги),
// у нас — по описанию дома в data/houses.json: gate: [x, z, ширина, высота],
// где (x, z) — середина проёма на уличной стене. Первая такая арка —
// «Купеческий» на Льва Толстого, 2/16 (со слов владельца: арка левее магазина,
// если смотреть с улицы).
//
// Дом остаётся одним контуром OSM: та же кровля и та же сетка окон. Меняется
// только вот что:
//  - уличная и дворовая стены рвутся проёмом (полукруглый верх);
//  - внутри — облицовка проезда: две стены и цилиндрический свод, глухие;
//  - в индекс столкновений вместо контура идут две его половины по бокам
//    проезда (gatePolys) — машина проезжает во двор.
// Ограничение: полоса проезда должна пересекать дом один раз (прямой корпус).
// Новых вызовов отрисовки нет — всё в общем меше домов, треугольников ~150.

const ARC = 8;                 // отрезков полукруга свода

function inPoly(x, z, p, n) {
  let ins = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = p[i * 2], zi = p[i * 2 + 1], xj = p[j * 2], zj = p[j * 2 + 1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) ins = !ins;
  }
  return ins;
}

// Точки контура без замыкающего повтора (в чанках контур замкнут).
function ring(b) {
  const p = b.poly;
  let n = p.length / 2;
  if (n > 3 && Math.hypot(p[0] - p[n * 2 - 2], p[1] - p[n * 2 - 1]) < 0.05) n--;
  return n;
}

// Пересечение луча (ox,oz)+(ux,uz)·t со стеной i: t и доля вдоль стены.
function hitEdge(p, i, j, ox, oz, ux, uz) {
  const ax = p[i * 2], az = p[i * 2 + 1];
  const ex = p[j * 2] - ax, ez = p[j * 2 + 1] - az;
  const den = ux * ez - uz * ex;
  if (Math.abs(den) < 1e-9) return null;
  const wx = ax - ox, wz = az - oz;
  const t = (wx * ez - wz * ex) / den;
  const s = (wx * uz - wz * ux) / den;
  if (s < -1e-6 || s > 1 + 1e-6) return null;
  return { t, s };
}

// Разбор арки дома: стена улицы, стена двора, оси проезда. null — арки нет.
export function gateOf(b) {
  if (!b.gate) return null;
  if (b._gate !== undefined) return b._gate;
  b._gate = null;
  const [gx, gz, W, H] = b.gate;
  const p = b.poly, n = ring(b);
  // уличная стена — ближайшая к середине проёма
  let e = -1, bd = Infinity;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = p[i * 2], az = p[i * 2 + 1], ex = p[j * 2] - ax, ez = p[j * 2 + 1] - az;
    const L2 = ex * ex + ez * ez;
    if (L2 < 0.01) continue;
    const t = Math.max(0, Math.min(1, ((gx - ax) * ex + (gz - az) * ez) / L2));
    const d = Math.hypot(gx - ax - ex * t, gz - az - ez * t);
    if (d < bd) { bd = d; e = i; }
  }
  if (e < 0 || bd > 3) return null;
  const j = (e + 1) % n;
  const l = Math.hypot(p[j * 2] - p[e * 2], p[j * 2 + 1] - p[e * 2 + 1]);
  const dx = (p[j * 2] - p[e * 2]) / l, dz = (p[j * 2 + 1] - p[e * 2 + 1]) / l;
  // внутрь дома — от улицы; обход контура заранее не известен
  let ux = -dz, uz = dx;
  const s0 = ((gx - p[e * 2]) * dx + (gz - p[e * 2 + 1]) * dz);
  const cx = p[e * 2] + dx * s0, cz = p[e * 2 + 1] + dz * s0;
  if (!inPoly(cx + ux * 0.5, cz + uz * 0.5, p, n)) { ux = -ux; uz = -uz; }
  // дворовая стена — первая, в которую упирается ось проезда изнутри
  let x = -1, depth = Infinity;
  for (let i = 0; i < n; i++) {
    if (i === e) continue;
    const h = hitEdge(p, i, (i + 1) % n, cx, cz, ux, uz);
    if (h && h.t > 0.5 && h.t < depth) { depth = h.t; x = i; }
  }
  if (x < 0) return null;
  // обе боковые линии проезда: где входят и где выходят
  const hw = W / 2, sides = [];
  for (const s of [-hw, hw]) {
    const ox = cx + dx * s, oz = cz + dz * s;
    const a = hitEdge(p, e, j, ox - ux, oz - uz, ux, uz);
    const c = hitEdge(p, x, (x + 1) % n, ox, oz, ux, uz);
    if (!a || !c) return null;            // проём вылез за угол стены
    sides.push({ s, ix: ox - ux + ux * a.t, iz: oz - uz + uz * a.t, ox: ox + ux * c.t, oz: oz + uz * c.t });
  }
  b._gate = { e, x, cx, cz, ux, uz, dx, dz, hw, H };
  b._gate.sides = sides;
  return b._gate;
}

// Проём на стене i (если она уличная или дворовая): [от, до] вдоль стены, м.
export function gateCut(g, i, ax, az, bx, bz, l) {
  if (!g || (i !== g.e && i !== g.x)) return null;
  const tx = (bx - ax) / l, tz = (bz - az) / l;
  const out = i === g.e ? 'i' : 'o';
  let s0 = Infinity, s1 = -Infinity;
  for (const sd of g.sides) {
    const s = (sd[out + 'x'] - ax) * tx + (sd[out + 'z'] - az) * tz;
    if (s < s0) s0 = s; if (s > s1) s1 = s;
  }
  return s0 > 0.2 && s1 < l - 0.2 ? [s0, s1] : null;
}

// Треугольник с нормалью n: обход разворачиваем, чтобы лицо смотрело по n.
function tri(push, A, B, C, n, col, Hb) {
  const e1x = B[0] - A[0], e1y = B[1] - A[1], e1z = B[2] - A[2];
  const e2x = C[0] - A[0], e2y = C[1] - A[1], e2z = C[2] - A[2];
  const cx = e1y * e2z - e1z * e2y, cy = e1z * e2x - e1x * e2z, cz = e1x * e2y - e1y * e2x;
  if (cx * n[0] + cy * n[1] + cz * n[2] < 0) { const t = B; B = C; C = t; }
  for (const q of [A, B, C]) push(q[0], q[1], q[2], n[0], n[1], n[2], col, q[3] || 0, q[4] || 0, Hb, 2);
}

// Стена с проёмом: куски слева и справа во всю высоту, над проёмом — полоса
// от полукруга до карниза. wall(x0,z0,x1,z1,u0,u1) — обычная стена из
// buildBuildings; push — её pushV. ground(x, z) — земля.
export function gateWall(g, cut, ax, az, bx, bz, l, u0, u1, yFloor, yTop, Hb, nx, nz, col, kind, push, wall, ground) {
  const [s0, s1] = cut;
  const tx = (bx - ax) / l, tz = (bz - az) / l;
  const k = (u1 - u0) / l;                      // шаг сетки окон серии тянется под стену
  wall(ax, az, ax + tx * s0, az + tz * s0, u0, u0 + k * s0);
  wall(ax + tx * s1, az + tz * s1, bx, bz, u0 + k * s1, u1);
  const r = (s1 - s0) / 2, sm = (s0 + s1) / 2;
  const y0 = ground(ax + tx * sm, az + tz * sm);
  const spring = y0 + Math.max(0.5, g.H - r);  // пята свода
  for (let q = 0; q < ARC; q++) {
    const a0 = Math.PI * q / ARC, a1 = Math.PI * (q + 1) / ARC;
    const sa = sm - r * Math.cos(a0), sb = sm - r * Math.cos(a1);
    const ya = spring + r * Math.sin(a0), yb = spring + r * Math.sin(a1);
    const xa = ax + tx * sa, za = az + tz * sa, xb = ax + tx * sb, zb = az + tz * sb;
    const ua = u0 + k * sa, ub = u0 + k * sb;
    const A = [xa, ya, za, ua, ya - yFloor], B = [xb, yb, zb, ub, yb - yFloor];
    const At = [xa, yTop, za, ua, Hb], Bt = [xb, yTop, zb, ub, Hb];
    const pv = (P) => push(P[0], P[1], P[2], nx, 0, nz, col, P[3], P[4], Hb, kind);
    // тот же обход, что у стен в buildBuildings: нормаль (dz, −dx) у ребра A→B
    const fwd = (xb - xa) * -nz + (zb - za) * nx > 0;
    const [P, Q, Pt, Qt] = fwd ? [A, B, At, Bt] : [B, A, Bt, At];
    pv(P); pv(Qt); pv(Q); pv(P); pv(Pt); pv(Qt);
  }
  // от пяты до земли — откосы проёма не нужны: их даёт облицовка проезда
  return spring;
}

// Облицовка проезда: боковые стены до пяты и полукруглый свод.
export function gateLining(g, wall, push, ground, Hb) {
  const [L, R] = g.sides;                        // s = −hw и +hw
  const col = [wall[0] * 0.78, wall[1] * 0.77, wall[2] * 0.75];
  const floor = [0.34, 0.33, 0.32];
  const r = g.hw;
  // земля на входе и выходе по оси
  const mi = [(L.ix + R.ix) / 2, (L.iz + R.iz) / 2], mo = [(L.ox + R.ox) / 2, (L.oz + R.oz) / 2];
  const gi = ground(mi[0], mi[1]), go = ground(mo[0], mo[1]);
  const si = gi + Math.max(0.5, g.H - r), so = go + Math.max(0.5, g.H - r);
  // точка сечения свода под углом a (0 — пята со стороны −hw, π — со стороны +hw)
  const at = (a, end) => {
    const t = (1 - Math.cos(a)) / 2;
    const x = end ? L.ox + (R.ox - L.ox) * t : L.ix + (R.ix - L.ix) * t;
    const z = end ? L.oz + (R.oz - L.oz) * t : L.iz + (R.iz - L.iz) * t;
    return [x, (end ? so : si) + r * Math.sin(a), z];
  };
  // стены: со стороны −hw нормаль смотрит на +d, со стороны +hw — на −d
  for (const [sd, sg] of [[L, 1], [R, -1]]) {
    const n = [g.dx * sg, 0, g.dz * sg];
    const A = [sd.ix, ground(sd.ix, sd.iz) - 0.3, sd.iz], B = [sd.ox, ground(sd.ox, sd.oz) - 0.3, sd.oz];
    const At = [sd.ix, si, sd.iz], Bt = [sd.ox, so, sd.oz];
    tri(push, A, B, Bt, n, col, Hb); tri(push, A, Bt, At, n, col, Hb);
  }
  // свод: нормаль к оси проезда
  for (let q = 0; q < ARC; q++) {
    const a0 = Math.PI * q / ARC, a1 = Math.PI * (q + 1) / ARC, am = (a0 + a1) / 2;
    const n = [g.dx * Math.cos(am), -Math.sin(am), g.dz * Math.cos(am)];
    const A = at(a0, 0), B = at(a1, 0), C = at(a1, 1), D = at(a0, 1);
    tri(push, A, B, C, n, col, Hb); tri(push, A, C, D, n, col, Hb);
  }
  // мощение проезда — чуть над землёй, чтобы трава рельефа не лезла сквозь
  const up = [0, 1, 0], lift = 0.05;
  const P = (x, z) => [x, ground(x, z) + lift, z];
  const a = P(L.ix, L.iz), b2 = P(R.ix, R.iz), c = P(R.ox, R.oz), d = P(L.ox, L.oz);
  tri(push, a, b2, c, up, floor, Hb); tri(push, a, c, d, up, floor, Hb);
}

// Для индекса столкновений: дом с аркой — две половины по бокам проезда.
// Collider читает только poly, остальное ему не нужно.
export function gatePolys(b) {
  const g = gateOf(b);
  if (!g) return [b];
  const p = b.poly, n = ring(b), out = [];
  for (const sg of [-1, 1]) {
    // полуплоскость (P − C)·d·sg ≥ hw — Сазерленд — Ходжман по одной прямой
    const f = (x, z) => ((x - g.cx) * g.dx + (z - g.cz) * g.dz) * sg - g.hw;
    const q = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = p[i * 2], az = p[i * 2 + 1], bx = p[j * 2], bz = p[j * 2 + 1];
      const fa = f(ax, az), fb = f(bx, bz);
      if (fa >= 0) q.push(ax, az);
      if ((fa >= 0) !== (fb >= 0)) {
        const t = fa / (fa - fb);
        q.push(ax + (bx - ax) * t, az + (bz - az) * t);
      }
    }
    if (q.length >= 6) out.push({ id: b.id, poly: q });
  }
  return out;
}
