// Поле расстояний до проезжей части и её кромка.
//
// Раньше тротуар и бордюр строились ОТ КАЖДОЙ УЛИЦЫ ОТДЕЛЬНО: лента слева,
// лента справа, а там, где лента попадала на чужой асфальт, из неё выкидывали
// пролёты. На перекрёстке так сходились четыре независимых обрубка, которые
// ничего не знали друг о друге: углы кварталов не замыкались, островки
// оставались голой землёй, а кромка асфальта была там, где кончился
// прямоугольник полотна, — рубленым углом.
//
// Теперь кромка одна на всех. По сетке в один метр считаем расстояние до
// ближайшей проезжей части (минус её полуширина): отрицательное — асфальт,
// положительное — всё остальное. Линия уровня этого поля и есть бордюр: она
// по построению замкнута вокруг каждого квартала и каждого островка, не может
// лечь поперёк проезжей части и не зависит от того, из скольких кусков OSM
// сложена улица. Тротуар — полоса вдоль этой линии наружу.
//
// Решётка привязана к целым мировым метрам, поэтому соседние чанки получают
// на шве одни и те же значения, и кромка переходит из квадрата в квадрат без
// ступеньки.

const FAR = 9;            // «далеко от любой дороги», м
const PADF = 4.4;         // на столько поле считаем за кромку: тротуар 2.6 + запас

// Бордюр стоит на 15 см ВНУТРИ расчётной кромки: полотно гарантированно
// заходит под него, и между асфальтом и камнем не остаётся щели до земли.
export const KERB_ISO = -0.15;

// all — ВСЕ улицы квадрата, включая те, что уже построены соседом: кромке
// нужна вся сеть, а не только то, что досталось этой сборке.
export function* roadFieldGen(all, bx0, bz0, bx1, bz1) {
  const M = 16;
  const ox = Math.floor(bx0) - M, oz = Math.floor(bz0) - M;
  const W = Math.ceil(bx1) - Math.floor(bx0) + 2 * M + 1;
  const Hn = Math.ceil(bz1) - Math.floor(bz0) + 2 * M + 1;
  const F = new Float32Array(W * Hn).fill(FAR);
  const O = new Int16Array(W * Hn).fill(-1);

  // Широкие первыми — тот же порядок, что у растра покрытия: узкий проезд,
  // целиком лежащий на проспекте, в поле не идёт (его и не рисуют).
  const order = [];
  for (let i = 0; i < all.length; i++) if (all[i].c <= 3 && all[i].pts.length >= 4) order.push(i);
  order.sort((a, b) => all[b].w - all[a].w || a - b);

  let work = 0;
  for (const ri of order) {
    const r = all[ri], p = r.pts, hw = r.w / 2, n = p.length / 2;
    const R = hw + PADF;
    if (r.w >= 4) {
      let taken = 0, total = 0;
      for (let k = 0; k < n - 1; k++) {
        const ax = p[k * 2], az = p[k * 2 + 1];
        const dx = p[k * 2 + 2] - ax, dz = p[k * 2 + 3] - az;
        const L = Math.hypot(dx, dz);
        if (L < 0.2) continue;
        const steps = Math.ceil(L / 1.5);
        for (let s = 0; s <= steps; s++) {
          const i = Math.round(ax + dx * s / steps) - ox, j = Math.round(az + dz * s / steps) - oz;
          if (i < 0 || j < 0 || i >= W || j >= Hn) continue;
          total++;
          const c = j * W + i;
          if (O[c] >= 0 && F[c] < 0.6 && all[O[c]].w > r.w + 0.5) taken++;
        }
      }
      if (!total || taken / total > 0.75) continue;
    }
    for (let k = 0; k < n - 1; k++) {
      const sx = p[k * 2], sz = p[k * 2 + 1];
      const tx = p[k * 2 + 2] - sx, tz = p[k * 2 + 3] - sz;
      const SL = Math.hypot(tx, tz);
      if (SL < 0.05) continue;
      // Длинный косой пролёт режем на куски: иначе его габарит — квадрат со
      // стороной в длину пролёта, и девять десятых ячеек в нём считаются зря.
      const parts = Math.max(1, Math.ceil(SL / 8));
      for (let q = 0; q < parts; q++) {
        const ax = sx + tx * q / parts, az = sz + tz * q / parts;
        const dx = tx / parts, dz = tz / parts;
        const L2 = dx * dx + dz * dz;
        const i0 = Math.max(0, Math.ceil(Math.min(ax, ax + dx) - R) - ox);
        const i1 = Math.min(W - 1, Math.floor(Math.max(ax, ax + dx) + R) - ox);
        const j0 = Math.max(0, Math.ceil(Math.min(az, az + dz) - R) - oz);
        const j1 = Math.min(Hn - 1, Math.floor(Math.max(az, az + dz) + R) - oz);
        if (i0 > i1 || j0 > j1) continue;
        for (let j = j0; j <= j1; j++) {
          const z = oz + j - az;
          let c = j * W + i0;
          for (let i = i0; i <= i1; i++, c++) {
            const x = ox + i - ax;
            let t = (x * dx + z * dz) / L2;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            const ex = x - dx * t, ez = z - dz * t;
            const d = Math.sqrt(ex * ex + ez * ez) - hw;
            if (d < F[c]) { F[c] = d; O[c] = ri; }
          }
        }
        work += (i1 - i0 + 1) * (j1 - j0 + 1);
      }
    }
    if (work > 120000) { work = 0; yield; }
  }

  // Билинейная выборка. За пределами решётки — «далеко»: там мы ничего не
  // знаем, и вызывающий обязан спросить has(), прежде чем что-то резать.
  const at = (x, z) => {
    const fx = x - ox, fz = z - oz;
    const i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= W - 1 || j >= Hn - 1) return FAR;
    const u = fx - i, v = fz - j, c = j * W + i;
    const a = F[c] + (F[c + 1] - F[c]) * u;
    const b = F[c + W] + (F[c + W + 1] - F[c + W]) * u;
    return a + (b - a) * v;
  };
  const has = (x, z) => x - ox >= 1 && z - oz >= 1 && x - ox < W - 2 && z - oz < Hn - 2;
  const own = (x, z) => {
    const i = Math.round(x - ox), j = Math.round(z - oz);
    return (i < 0 || j < 0 || i >= W || j >= Hn) ? -1 : O[j * W + i];
  };
  return { F, O, W, H: Hn, ox, oz, at, has, own };
}

// Линия уровня поля внутри квадрата [bx0,bx1) × [bz0,bz1) — «шагающие
// квадраты». Отрезки ориентируем так, чтобы асфальт всегда был по одну руку:
// нормаль (−dz, dx) смотрит НАРУЖУ, от проезжей части. Тогда соседние отрезки
// стыкуются конец в начало, а знак площади замкнутой цепочки сразу говорит,
// что внутри неё — квартал или сама дорога.
export function traceContours(fld, bx0, bz0, bx1, bz1, iso) {
  const { F, W, ox, oz } = fld;
  const i0 = Math.max(0, Math.floor(bx0) - ox), i1 = Math.min(W - 1, Math.ceil(bx1) - ox);
  const j0 = Math.max(0, Math.floor(bz0) - oz), j1 = Math.min(fld.H - 1, Math.ceil(bz1) - oz);
  const SA = [], SB = [], X0 = [], Z0 = [], X1 = [], Z1 = [];
  const ex = [0, 0, 0, 0], ez = [0, 0, 0, 0], eid = [0, 0, 0, 0];
  const cxs = [0, 1, 1, 0], czs = [0, 0, 1, 1];
  const T = (a, b) => { const t = (iso - a) / (b - a); return t < 0.001 ? 0.001 : t > 0.999 ? 0.999 : t; };
  let bi = 0, bj = 0;
  const emit = (ea, eb, corner, inside) => {
    let ax = ex[ea], az = ez[ea], bx = ex[eb], bz = ez[eb];
    const s = (bi + cxs[corner] - ax) * -(bz - az) + (bj + czs[corner] - az) * (bx - ax);
    let a = eid[ea], b = eid[eb];
    if (inside ? s > 0 : s < 0) {
      let t = ax; ax = bx; bx = t; t = az; az = bz; bz = t; t = a; a = b; b = t;
    }
    SA.push(a); SB.push(b);
    X0.push(ox + ax); Z0.push(oz + az); X1.push(ox + bx); Z1.push(oz + bz);
  };
  for (let j = j0; j < j1; j++) {
    for (let i = i0; i < i1; i++) {
      const c = j * W + i;
      const v0 = F[c], v1 = F[c + 1], v2 = F[c + W + 1], v3 = F[c + W];
      const code = (v0 < iso ? 1 : 0) | (v1 < iso ? 2 : 0) | (v2 < iso ? 4 : 0) | (v3 < iso ? 8 : 0);
      if (code === 0 || code === 15) continue;
      bi = i; bj = j;
      // рёбра: 0 нижнее, 1 правое, 2 верхнее, 3 левое
      eid[0] = c * 2; eid[1] = (c + 1) * 2 + 1; eid[2] = (c + W) * 2; eid[3] = c * 2 + 1;
      if ((v0 < iso) !== (v1 < iso)) { ex[0] = i + T(v0, v1); ez[0] = j; }
      if ((v1 < iso) !== (v2 < iso)) { ex[1] = i + 1; ez[1] = j + T(v1, v2); }
      if ((v3 < iso) !== (v2 < iso)) { ex[2] = i + T(v3, v2); ez[2] = j + 1; }
      if ((v0 < iso) !== (v3 < iso)) { ex[3] = i; ez[3] = j + T(v0, v3); }
      switch (code) {
        case 1: emit(3, 0, 0, 1); break;
        case 2: emit(0, 1, 1, 1); break;
        case 4: emit(1, 2, 2, 1); break;
        case 8: emit(2, 3, 3, 1); break;
        case 14: emit(3, 0, 0, 0); break;
        case 13: emit(0, 1, 1, 0); break;
        case 11: emit(1, 2, 2, 0); break;
        case 7: emit(2, 3, 3, 0); break;
        case 3: emit(3, 1, 0, 1); break;
        case 6: emit(0, 2, 1, 1); break;
        case 12: emit(1, 3, 2, 1); break;
        case 9: emit(0, 2, 0, 1); break;
        default: {
          // седло: по среднему решаем, соединены ли два «асфальтовых» угла
          const mid = (v0 + v1 + v2 + v3) / 4 < iso;
          if (code === 5) {
            if (mid) { emit(0, 1, 1, 0); emit(2, 3, 3, 0); } else { emit(3, 0, 0, 1); emit(1, 2, 2, 1); }
          } else if (mid) { emit(3, 0, 0, 0); emit(1, 2, 2, 0); } else { emit(0, 1, 1, 1); emit(2, 3, 3, 1); }
        }
      }
    }
  }
  // Сцепляем: у следующего отрезка начало лежит на том же ребре сетки, где
  // кончился предыдущий.
  const n = SA.length;
  const next = new Map(), ends = new Set();
  for (let s = 0; s < n; s++) { next.set(SA[s], s); ends.add(SB[s]); }
  const seen = new Uint8Array(n);
  const chains = [];
  const walk = (s0, closed) => {
    const pts = [X0[s0], Z0[s0]];
    let s = s0;
    while (s !== undefined && !seen[s]) {
      seen[s] = 1;
      pts.push(X1[s], Z1[s]);
      s = next.get(SB[s]);
    }
    if (closed) { pts.length -= 2; }      // последняя точка замкнутой цепочки — это первая
    if (pts.length >= 6 || (!closed && pts.length >= 4)) chains.push({ pts, closed });
  };
  for (let s = 0; s < n; s++) if (!seen[s] && !ends.has(SA[s])) walk(s, false);
  for (let s = 0; s < n; s++) if (!seen[s]) walk(s, true);
  return chains;
}

// Дуглас — Пекер без рекурсии. Точки контура стоят через метр, и на прямой
// улице их сотни подряд на одной линии; после упрощения остаются только
// настоящие изломы кромки.
function dp(pts, a, b, tol, keep) {
  const stack = [a, b];
  while (stack.length) {
    const j = stack.pop(), i = stack.pop();
    if (j - i < 2) continue;
    const ax = pts[i * 2], az = pts[i * 2 + 1];
    const dx = pts[j * 2] - ax, dz = pts[j * 2 + 1] - az;
    const L = Math.hypot(dx, dz) || 1e-9;
    let far = -1, fd = tol;
    for (let k = i + 1; k < j; k++) {
      const d = Math.abs((pts[k * 2] - ax) * dz - (pts[k * 2 + 1] - az) * dx) / L;
      if (d > fd) { fd = d; far = k; }
    }
    if (far < 0) continue;
    keep[far] = 1;
    stack.push(i, far, far, j);
  }
}

export function simplifyChain(pts, closed, tol = 0.09) {
  const n = pts.length / 2;
  if (n < 3) return pts;
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  if (closed) {
    // замкнутую режем в самой далёкой от начала точке и упрощаем половины
    let far = 0, fd = -1;
    for (let k = 1; k < n; k++) {
      const d = (pts[k * 2] - pts[0]) ** 2 + (pts[k * 2 + 1] - pts[1]) ** 2;
      if (d > fd) { fd = d; far = k; }
    }
    keep[far] = 1;
    dp(pts, 0, far, tol, keep);
    dp(pts, far, n - 1, tol, keep);
  } else dp(pts, 0, n - 1, tol, keep);
  const out = [];
  for (let k = 0; k < n; k++) if (keep[k]) out.push(pts[k * 2], pts[k * 2 + 1]);
  return out;
}
