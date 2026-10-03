// Площадки под домами и чистка рельефа от застройки.
//
// Рельеф — Terrarium DSM: модель ПОВЕРХНОСТИ, крыши и кроны в нём сидят как
// холмы. Крупные дома из far-слоя вырезает removeBuildingsGen, но в far-слое
// только пятна от 260 м², мелкий частный сектор и деревья оставались горбами,
// и земля «вспухала» вокруг домов, съедая первые этажи.
//
// Два шага, оба считаются на ОБЩЕЙ решётке квадратов земли (узел (i, j)
// лежит в одной и той же точке мира у любого квадрата) и зависят только от
// окрестности узла — иначе высоты на шве двух квадратов разойдутся:
//   * openGround — морфологическое «открытие» (минимум, потом максимум по
//     окну 5×5 узлов): горб уже ~35 м уходит, ровный склон остаётся точно
//     таким же (на плоскости минимум и максимум сдвигают высоту на одну и ту
//     же величину в разные стороны);
//   * platformsGen — площадка под каждым домом: грунт под пятном и полосой
//     вокруг выравнивается к одной отметке, наружу — плавный откос.

// Открытие поля высот на квадратной сетке n×n. Края (r узлов) не трогаем:
// там окно обрезано, и результат был бы другим, чем у соседа по шву, — но
// широкая сетка квадрата и так с каймой в двадцать узлов.
export function openGround(h, n, r = 2) {
  const t = new Float32Array(h.length);
  const u = new Float32Array(h.length);
  // минимум раздельно: строки, потом столбцы (квадратное окно)
  for (let j = 0; j < n; j++) {
    const row = j * n;
    for (let i = 0; i < n; i++) {
      let m = Infinity;
      for (let k = Math.max(0, i - r); k <= Math.min(n - 1, i + r); k++) if (h[row + k] < m) m = h[row + k];
      t[row + i] = m;
    }
  }
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      let m = Infinity;
      for (let k = Math.max(0, j - r); k <= Math.min(n - 1, j + r); k++) if (t[k * n + i] < m) m = t[k * n + i];
      u[j * n + i] = m;
    }
  // максимум тем же окном
  for (let j = 0; j < n; j++) {
    const row = j * n;
    for (let i = 0; i < n; i++) {
      let m = -Infinity;
      for (let k = Math.max(0, i - r); k <= Math.min(n - 1, i + r); k++) if (u[row + k] > m) m = u[row + k];
      t[row + i] = m;
    }
  }
  for (let i = r; i < n - r; i++)
    for (let j = r; j < n - r; j++) {
      let m = -Infinity;
      for (let k = j - r; k <= j + r; k++) if (t[k * n + i] > m) m = t[k * n + i];
      // Открытие никогда не поднимает землю; минимум — на случай, если
      // окно у края обрезано.
      const k = j * n + i;
      if (m < h[k]) h[k] = m;
    }
}

// Отметка площадки дома по id. Дом на шве попадает в окна ОБОИХ соседей, и
// отметка обязана выйти одинаковой до сантиметра. Окна у соседей разные,
// поэтому кто посчитал первым, тот и записал — второй берёт готовую.
const LEVEL = new Map();

const FULL = 5;        // м от стены, где земля целиком на отметке площадки
const FEATHER = 11;    // м откоса наружу (треугольник рельефа — 9.14 м)
const CUT = 3.0;       // глубже не срезаем склон под площадку
const FILL = 3.0;      // и выше не отсыпаем — остальное берёт цоколь дома
const NEAR_ROAD = 0.6; // у улицы (в коридоре) землю можно только чуть опустить

// Поле ext (ne×ne узлов с началом ox, oz и шагом step) — земля после сноса,
// моря и коридора дорог. cw — вес коридора в узле, cap — потолок коридора.
// Правим только узлы внутри keep = [x0, z0, x1, z1]: остальное — запас,
// по которому считаются отметки домов на краю.
export function* platformsGen(ext, ne, ox, oz, step, cw, cap, buildings, keep) {
  const R = FULL + FEATHER;
  const acc = new Float32Array(ne * ne), accW = new Float32Array(ne * ne);
  const wmax = new Float32Array(ne * ne);
  const sample = (a, x, z) => {
    const gx = (x - ox) / step, gz = (z - oz) / step;
    const i = Math.floor(gx), j = Math.floor(gz);
    if (i < 0 || j < 0 || i >= ne - 1 || j >= ne - 1) return null;
    const fx = gx - i, fz = gz - j, k = j * ne + i;
    return (a[k] * (1 - fx) + a[k + 1] * fx) * (1 - fz) + (a[k + ne] * (1 - fx) + a[k + ne + 1] * fx) * fz;
  };
  let work = 0, made = 0;
  for (const b of buildings) {
    const p = b.poly, n = p.length / 2;
    if (n < 3) continue;
    let bx0 = Infinity, bz0 = Infinity, bx1 = -Infinity, bz1 = -Infinity;
    for (let i = 0; i < n; i++) {
      const x = p[i * 2], z = p[i * 2 + 1];
      if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
      if (z < bz0) bz0 = z; if (z > bz1) bz1 = z;
    }
    if (bx1 + R < keep[0] || bx0 - R > keep[2] || bz1 + R < keep[1] || bz0 - R > keep[3]) continue;

    // ---- отметка: средняя высота земли по контуру; точки у улицы весят
    // вчетверо больше — дом стоит фасадом на тротуаре, а не на заднем дворе
    const id = b.id ?? (p[0] + ',' + p[1]);
    let P = LEVEL.get(id);
    if (P === undefined) {
      let s = 0, sw = 0, lo = Infinity, hi = -Infinity;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ax = p[i * 2], az = p[i * 2 + 1], ex = p[j * 2] - ax, ez = p[j * 2 + 1] - az;
        const k = Math.max(1, Math.ceil(Math.hypot(ex, ez) / 2.5));
        for (let t = 0; t < k; t++) {
          const x = ax + ex * t / k, z = az + ez * t / k;
          const h = sample(ext, x, z);
          if (h === null) continue;
          const w = 1 + 3 * (sample(cw, x, z) || 0);
          s += h * w; sw += w;
          if (h < lo) lo = h; if (h > hi) hi = h;
        }
      }
      if (!sw) continue;
      P = Math.min(hi, Math.max(lo, s / sw));
      LEVEL.set(id, P);
    }

    // ---- вклад в узлы вокруг дома
    const i0 = Math.max(0, Math.floor((bx0 - R - ox) / step)), i1 = Math.min(ne - 1, Math.ceil((bx1 + R - ox) / step));
    const j0 = Math.max(0, Math.floor((bz0 - R - oz) / step)), j1 = Math.min(ne - 1, Math.ceil((bz1 + R - oz) / step));
    for (let j = j0; j <= j1; j++) {
      const z = oz + j * step;
      if (z < keep[1] || z > keep[3]) continue;
      for (let i = i0; i <= i1; i++) {
        const x = ox + i * step;
        if (x < keep[0] || x > keep[2]) continue;
        // расстояние до контура (внутри — ноль)
        let inside = false, d2 = Infinity;
        for (let a = 0, c = n - 1; a < n; c = a++) {
          const xa = p[a * 2], za = p[a * 2 + 1], xc = p[c * 2], zc = p[c * 2 + 1];
          if ((za > z) !== (zc > z) && x < (xc - xa) * (z - za) / (zc - za) + xa) inside = !inside;
          const ex = xc - xa, ez = zc - za, L2 = ex * ex + ez * ez;
          let t = L2 > 0 ? ((x - xa) * ex + (z - za) * ez) / L2 : 0;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const dx = xa + ex * t - x, dz = za + ez * t - z, dd = dx * dx + dz * dz;
          if (dd < d2) d2 = dd;
        }
        const d = inside ? 0 : Math.sqrt(d2);
        if (d >= R) continue;
        let w = 1;
        if (d > FULL) { const t = 1 - (d - FULL) / FEATHER; w = t * t * (3 - 2 * t); }
        const k = j * ne + i;
        acc[k] += w * P; accW[k] += w;
        if (w > wmax[k]) wmax[k] = w;
      }
    }
    made++;
    if ((work += (i1 - i0 + 1) * (j1 - j0 + 1) * n) > 60000) { work = 0; yield; }
  }

  // ---- сведение: в узле, на который претендуют несколько домов, отметка
  // средняя с весом; отход от исходной земли ограничен, у улицы — почти ноль
  for (let k = 0; k < ne * ne; k++) {
    const m = wmax[k];
    if (m <= 0) continue;
    const S = ext[k], c = cw[k];
    let dev = acc[k] / accW[k] - S;
    const up = FILL * (1 - c), down = CUT * (1 - c) + NEAR_ROAD * c;
    if (dev > up) dev = up; else if (dev < -down) dev = -down;
    let h = S + m * dev;
    if (h > cap[k]) h = cap[k];
    ext[k] = h;
  }
  return made;
}
