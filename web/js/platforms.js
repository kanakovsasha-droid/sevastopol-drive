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
import { levelAt, hasLevels } from './roadlevels.js?v=90d69937';

const LEVEL = new Map();

const FULL = 5;        // м от стены, где земля целиком на отметке площадки
const FEATHER = 13;    // м откоса наружу (треугольник рельефа — 9.14 м)
const CUT = 3.0;       // глубже не срезаем склон под площадку
const FILL = 3.0;      // и выше не отсыпаем — остальное берёт цоколь дома
const NEAR_ROAD = 0.6; // у улицы (в коридоре) землю можно только чуть опустить

// Поле ext (ne×ne узлов с началом ox, oz и шагом step) — земля после сноса,
// моря и коридора дорог. cw — вес коридора в узле, cap — потолок коридора.
// Правим только узлы внутри keep = [x0, z0, x1, z1]: остальное — запас,
// по которому считаются отметки домов на краю.
// Дома, которые заменены готовыми моделями (стиль 'model' в landmarks.json):
// ноль модели — земля у её точки (ox, oz), а ниже нуля у моделей свой цоколь
// метра на три. Поэтому площадка под таким домом — ровно на отметке этой
// точки, отсыпать выше нельзя вовсе (иначе грунт заходит в первый этаж
// модели), срезать можно глубже обычного. Дом модели в far-слое узнаём по
// списку skip или по тому, что точка модели лежит внутри его контура.
const MODEL_CUT = 7.0;
export function modelLevels(models, buildings, ext, ne, ox, oz, step) {
  const out = new Map();
  if (!models || !models.length) return out;
  const sample = (x, z) => {
    const gx = (x - ox) / step, gz = (z - oz) / step;
    const i = Math.floor(gx), j = Math.floor(gz);
    if (i < 0 || j < 0 || i >= ne - 1 || j >= ne - 1) return null;
    const fx = gx - i, fz = gz - j, k = j * ne + i;
    return (ext[k] * (1 - fx) + ext[k + 1] * fx) * (1 - fz) + (ext[k + ne] * (1 - fx) + ext[k + ne + 1] * fx) * fz;
  };
  const inPoly = (x, z, p) => {
    let c = false;
    for (let a = 0, b = p.length / 2 - 1; a < p.length / 2; b = a++) {
      const xa = p[a * 2], za = p[a * 2 + 1], xb = p[b * 2], zb = p[b * 2 + 1];
      if ((za > z) !== (zb > z) && x < (xb - xa) * (z - za) / (zb - za) + xa) c = !c;
    }
    return c;
  };
  for (const d of models) {
    if (d.style !== 'model' || d.ox === undefined) continue;
    let hit = null;
    for (const b of buildings) {
      const p = b.poly;
      if (Math.abs(p[0] - d.x) > 300 || Math.abs(p[1] - d.z) > 300) continue;
      if ((d.skip && d.skip.includes(b.id)) || inPoly(d.x, d.z, p)) {
        if (!hit) {
          const id = 'model:' + d.file;
          let P = LEVEL.get(id);
          if (P === undefined) {
            P = sample(d.ox, d.oz);
            if (P === null) break;
            LEVEL.set(id, P);
          }
          hit = P;
        }
        out.set(b, hit);
      }
    }
  }
  return out;
}

export function* platformsGen(ext, ne, ox, oz, step, cw, cap, buildings, keep0, models = null) {
  // Считаем с запасом в узел за краем квадрата: откос потом сглаживается
  // окном 3×3, и узлу на шве нужны соседи — те же, что у соседа по шву.
  const keep = [keep0[0] - step, keep0[1] - step, keep0[2] + step, keep0[3] + step];
  const R = FULL + FEATHER;
  const acc = new Float32Array(ne * ne), accW = new Float32Array(ne * ne);
  const wmax = new Float32Array(ne * ne), mdl = new Float32Array(ne * ne);
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
    const mP = models && models.get(b);
    let P = mP !== undefined ? mP : LEVEL.get(id);
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
        // под моделью отметка обязательная: её вес перебивает соседей
        const wm = mP !== undefined ? w * 8 : w;
        acc[k] += wm * P; accW[k] += wm;
        if (w > wmax[k]) wmax[k] = w;
        if (mP !== undefined && w > mdl[k]) mdl[k] = w;
      }
    }
    made++;
    if ((work += (i1 - i0 + 1) * (j1 - j0 + 1) * n) > 60000) { work = 0; yield; }
  }

  // ---- сведение: в узле, на который претендуют несколько домов, отметка
  // средняя с весом; отход от исходной земли ограничен, у улицы — почти ноль
  const dlt = new Float32Array(ne * ne);
  for (let k = 0; k < ne * ne; k++) {
    const m = wmax[k];
    if (m <= 0) continue;
    const S = ext[k], c = cw[k];
    let dev = acc[k] / accW[k] - S;
    // под моделью: не отсыпать вовсе, срезать до MODEL_CUT (и у улицы тоже —
    // улица у модели и так на отметке её точки)
    const mm = mdl[k];
    const up = FILL * (1 - c) * (1 - mm), down = Math.max(CUT * (1 - c) + NEAR_ROAD * c, MODEL_CUT * mm);
    if (dev > up) dev = up; else if (dev < -down) dev = -down;
    let h = S + m * dev;
    if (h > cap[k]) h = cap[k];
    dlt[k] = h - S;
  }
  // Откос сглаживаем окном 3×3: между двумя соседними площадками на разных
  // отметках проезд во двор шёл изломами — перелом уклона до 20 пунктов на
  // пяти метрах. У самих стен (полный вес) отметку не трогаем.
  const i0 = Math.max(1, Math.ceil((keep0[0] - ox) / step)), i1 = Math.min(ne - 2, Math.floor((keep0[2] - ox) / step));
  const j0 = Math.max(1, Math.ceil((keep0[1] - oz) / step)), j1 = Math.min(ne - 2, Math.floor((keep0[3] - oz) / step));
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      const k = j * ne + i;
      let d = dlt[k];
      if (wmax[k] < 1) {
        d = (4 * dlt[k] + 2 * (dlt[k - 1] + dlt[k + 1] + dlt[k - ne] + dlt[k + ne])
             + dlt[k - ne - 1] + dlt[k - ne + 1] + dlt[k + ne - 1] + dlt[k + ne + 1]) / 16;
      }
      if (!d) continue;
      let h = ext[k] + d;
      if (h > cap[k]) h = cap[k];
      ext[k] = h;
    }
  return made;
}

// ---- места, где DSM для земли не годится вовсе, а натура известна.
// Земля тут не выше плоскости h = a + b·x + c·z внутри многоугольника (и
// плавно подходит к ней в полосе FEATHER_CUT снаружи). Применяется последним,
// поверх площадок и коридора: это не «пожелание», а отметки по натуре.
//
// Графская пристань (модель data/models/grafskaya.glb): пол колоннады +4.7 м,
// центральный марш со львами спускается от x≈84 до x≈100 (≈0.27 м на метр),
// дальше причал (+0.4 м у модели, землю держим на +0.35) до воды у x≈113. DSM держал тут газон 4–3 м, и
// лестница целиком уходила в землю. Отметки сняты с самой модели.
const SITE_CUTS = [
  { name: 'Графская: причал', poly: [98, -74, 124, -74, 124, -10, 98, -10], plane: [0.35, 0, 0] },
  { name: 'Графская: марш',   poly: [85, -62, 98, -62, 98, -30, 85, -30],   plane: [3.95 + 84 * 0.27, -0.27, 0] },
];
const FEATHER_CUT = 6;

export function applySiteCuts(h, n, ox, oz, step) {
  let hit = 0;
  for (const c of SITE_CUTS) {
    const p = c.poly, m = p.length / 2;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < m; i++) {
      x0 = Math.min(x0, p[i * 2]); x1 = Math.max(x1, p[i * 2]);
      z0 = Math.min(z0, p[i * 2 + 1]); z1 = Math.max(z1, p[i * 2 + 1]);
    }
    const i0 = Math.max(0, Math.floor((x0 - FEATHER_CUT - ox) / step)), i1 = Math.min(n - 1, Math.ceil((x1 + FEATHER_CUT - ox) / step));
    const j0 = Math.max(0, Math.floor((z0 - FEATHER_CUT - oz) / step)), j1 = Math.min(n - 1, Math.ceil((z1 + FEATHER_CUT - oz) / step));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const x = ox + i * step, z = oz + j * step;
        let inside = false, d2 = Infinity;
        for (let a = 0, b = m - 1; a < m; b = a++) {
          const xa = p[a * 2], za = p[a * 2 + 1], xb = p[b * 2], zb = p[b * 2 + 1];
          if ((za > z) !== (zb > z) && x < (xb - xa) * (z - za) / (zb - za) + xa) inside = !inside;
          const ex = xb - xa, ez = zb - za, L2 = ex * ex + ez * ez;
          let t = L2 > 0 ? ((x - xa) * ex + (z - za) * ez) / L2 : 0;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const dx = xa + ex * t - x, dz = za + ez * t - z;
          d2 = Math.min(d2, dx * dx + dz * dz);
        }
        const d = inside ? 0 : Math.sqrt(d2);
        if (d > FEATHER_CUT) continue;
        const want = c.plane[0] + c.plane[1] * x + c.plane[2] * z + d * 0.5;
        const k = j * n + i;
        if (h[k] > want) { h[k] = want; hit++; }
      }
  }
  return hit;
}

// ---- террасы под скверами, парками и площадями (data/terraces.json).
// В натуре сквер на склоне — ровная площадка на подпорной стенке, а DSM
// ведёт под ним склон. Небольшие (до 2 га) — к одной отметке: медиана земли
// по контуру, с откосом наружу; большие парки — сглаживаем окном ±27 м, но
// не в стол. Улицы не трогаем: вес террасы гаснет в коридоре дорог.
const T_SMALL = 20000;          // м²: до этого — площадка, крупнее — сглаживание
const T_FEATHER = 8;            // м откоса за контуром
const T_CUT = 5, T_FILL = 4;    // дальше этого от исходной земли не уводим
const T_SMOOTH = 3;             // узлов в полуокне сглаживания (3 × 9.14 м)
const TIDX = new WeakMap();
const tIndex = list => {
  let ix = TIDX.get(list);
  if (ix) return ix;
  ix = new Map();
  for (const it of list) {
    const p = it.poly;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < p.length; i += 2) {
      if (p[i] < x0) x0 = p[i]; if (p[i] > x1) x1 = p[i];
      if (p[i + 1] < z0) z0 = p[i + 1]; if (p[i + 1] > z1) z1 = p[i + 1];
    }
    it.bb = [x0, z0, x1, z1];
    for (let j = Math.floor(z0 / 512); j <= Math.floor(z1 / 512); j++)
      for (let i = Math.floor(x0 / 512); i <= Math.floor(x1 / 512); i++) {
        const k = i + '_' + j;
        if (!ix.has(k)) ix.set(k, []);
        ix.get(k).push(it);
      }
  }
  TIDX.set(list, ix);
  return ix;
};

export function* terracesGen(ext, ne, ox, oz, step, cw, cap, list, keep, roads = []) {
  if (!list || !list.length) return 0;
  // Улицы вокруг сквера. Коридор дорог для этого не годится: его плоская
  // зона — тринадцать метров за кромкой полотна, а сквер у библиотеки
  // Толстого целиком лежит в такой зоне, и терраса там гасла полностью.
  // Поэтому меряем расстояние до самого полотна (far-слой, магистрали и
  // улицы): на полотне и в двух метрах от него земля не трогается, дальше
  // за шесть метров терраса входит в силу. Выше улицы её всё равно не
  // пустит потолок коридора.
  const RB = 24, rb = new Map();
  for (const r of roads) {
    if (r.br || r.tn) continue;
    const q = r.pts, hw = (r.w || 6) / 2;
    for (let t = 0; t + 3 < q.length; t += 2) {
      const ax = q[t], az = q[t + 1], bx = q[t + 2], bz = q[t + 3], m = hw + 8;
      if (Math.max(ax, bx) + m < keep[0] - T_FEATHER || Math.min(ax, bx) - m > keep[2] + T_FEATHER ||
          Math.max(az, bz) + m < keep[1] - T_FEATHER || Math.min(az, bz) - m > keep[3] + T_FEATHER) continue;
      for (let j = Math.floor((Math.min(az, bz) - m) / RB); j <= Math.floor((Math.max(az, bz) + m) / RB); j++)
        for (let i = Math.floor((Math.min(ax, bx) - m) / RB); i <= Math.floor((Math.max(ax, bx) + m) / RB); i++) {
          const k = i + '_' + j;
          if (!rb.has(k)) rb.set(k, []);
          rb.get(k).push(ax, az, bx, bz, hw);
        }
    }
  }
  const roadFactor = (x, z) => {
    const e = rb.get(Math.floor(x / RB) + '_' + Math.floor(z / RB));
    if (!e) return 1;
    let f = 1;
    for (let t = 0; t < e.length; t += 5) {
      const ax = e[t], az = e[t + 1], vx = e[t + 2] - ax, vz = e[t + 3] - az, L2 = vx * vx + vz * vz;
      let u = L2 > 0 ? ((x - ax) * vx + (z - az) * vz) / L2 : 0;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const d = Math.hypot(ax + vx * u - x, az + vz * u - z) - e[t + 4] - 2;
      if (d <= 0) return 0;
      if (d < 6) { const s = d / 6, g = s * s * (3 - 2 * s); if (g < f) f = g; }
    }
    return f;
  };
  // ПЛОСКОСТЬ ПО УЛИЦАМ. Сквер в городе лежит вровень с улицами вокруг —
  // а медиана земли по контуру (и тем более сглаженный DSM у парков крупнее
  // 2 га) уводила его вниз по склону: парк у Центрального рынка стоял на
  // метр-два ниже Генерала Петрова, со склоном вниз от тротуара. Если улицы
  // с отметками (roadlevels.js) идут вдоль контура хотя бы на трети его
  // длины, площадка — наклонная плоскость по их отметкам у контура (не
  // круче 6%; вес улицы — квадрат её значимости). Считается по отметкам, а не по земле квадрата, — у соседей
  // по шву одна и та же.
  const RB2 = 32, rb2 = new Map();
  for (const r of roads) {
    if (r.br || r.tn || r.c > 3 || !hasLevels(r.id)) continue;
    const q = r.pts;
    for (let t = 0; t + 3 < q.length; t += 2) {
      const ax = q[t], az = q[t + 1], bx = q[t + 2], bz = q[t + 3];
      for (let j = Math.floor((Math.min(az, bz) - 30) / RB2); j <= Math.floor((Math.max(az, bz) + 30) / RB2); j++)
        for (let i = Math.floor((Math.min(ax, bx) - 30) / RB2); i <= Math.floor((Math.max(ax, bx) + 30) / RB2); i++) {
          const k = i + '_' + j;
          if (!rb2.has(k)) rb2.set(k, []);
          rb2.get(k).push(r, t);
        }
    }
  }
  const streetLevel = (x, z) => {
    const e = rb2.get(Math.floor(x / RB2) + '_' + Math.floor(z / RB2));
    if (!e) return null;
    let best = null, bd = Infinity;
    for (let t = 0; t < e.length; t += 2) {
      const r = e[t], q = r.pts, i = e[t + 1];
      const ax = q[i], az = q[i + 1], vx = q[i + 2] - ax, vz = q[i + 3] - az, L2 = vx * vx + vz * vz;
      let u = L2 > 0 ? ((x - ax) * vx + (z - az) * vz) / L2 : 0;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const d = Math.hypot(ax + vx * u - x, az + vz * u - z) - (r.w || 6) / 2;
      if (d < 22 && d < bd) { bd = d; best = [r, ax + vx * u, az + vz * u]; }
    }
    if (!best) return null;
    const h = levelAt(best[0].id, best[0].pts, best[1], best[2]);
    // вес — значимость улицы, как в решателе отметок: сквер ровняется по
    // главной улице, а переулок с другой стороны лишь наклоняет его
    // (квадрат значимости — как у плоскостей перекрёстков)
    const imp = (best[0].c <= 1 ? 4 : best[0].c === 2 ? 1.5 : 0.5) * Math.max(0.5, (best[0].w || 6) / 9);
    return h === null ? null : [h, imp * imp];
  };
  const planeOf = it => {
    const key = 'pl:' + it.id;
    if (LEVEL.has(key)) return LEVEL.get(key);
    const p = it.poly, n = p.length / 2;
    let all = 0, hit = 0;
    let sw = 0, sx = 0, sz = 0, sh = 0, sxx = 0, szz = 0, sxz = 0, sxh = 0, szh = 0;
    const cx = (it.bb[0] + it.bb[2]) / 2, cz = (it.bb[1] + it.bb[3]) / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ax = p[i * 2], az = p[i * 2 + 1], ex = p[j * 2] - ax, ez = p[j * 2 + 1] - az;
      const k = Math.max(1, Math.ceil(Math.hypot(ex, ez) / 4));
      for (let t = 0; t < k; t++) {
        const x = ax + ex * t / k, z = az + ez * t / k;
        all++;
        const e = streetLevel(x, z);
        if (e === null) continue;
        hit++;
        const [h, q] = e, X = x - cx, Z = z - cz;
        sw += q; sx += X * q; sz += Z * q; sh += h * q; sxx += X * X * q; szz += Z * Z * q; sxz += X * Z * q; sxh += X * h * q; szh += Z * h * q;
      }
    }
    let pl = null;
    if (all && hit / all >= 0.33) {
      // наименьшие квадраты; при вырожденной системе — горизонтально
      const det = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
      const A = [[sw, sx, sz], [sx, sxx, sxz], [sz, sxz, szz]], B = [sh, sxh, szh], D0 = det(A);
      let a = sh / sw, bx = 0, bz = 0;
      if (Math.abs(D0) > 1e-6) {
        const col = c => A.map((r, ri) => r.map((v, ci) => ci === c ? B[ri] : v));
        a = det(col(0)) / D0; bx = det(col(1)) / D0; bz = det(col(2)) / D0;
      }
      const g = Math.hypot(bx, bz);
      if (g > 0.06) {
        bx *= 0.06 / g; bz *= 0.06 / g;
        // уклон урезан — высоту центра считаем заново, по тем же весам
        a = (sh - bx * sx - bz * sz) / sw;
      }
      pl = { a, bx, bz, cx, cz };
    }
    LEVEL.set(key, pl);
    return pl;
  };
  // СКВЕР ПО ОДНОЙ УЛИЦЕ (поле by, руками в build-terraces.mjs). Клин между
  // верхней и нижней улицей общая плоскость клала наклонным газоном поперёк;
  // в натуре это терраса вровень с верхней улицей: в каждой точке — отметка
  // ближайшей точки её осевой, вдоль сквер идёт её уклоном, поперёк ровный,
  // к нижней улице — откос (коридор дорог его не пускает на полотно).
  const byR = new Map();
  const byRoads = it => {
    if (!it.by) return null;
    if (!byR.has(it)) byR.set(it, roads.filter(r => it.by.includes(r.id) && hasLevels(r.id)));
    return byR.get(it).length ? byR.get(it) : null;
  };
  const byLevel = (rs, x, z) => {
    let best = null, bd = Infinity;
    for (const r of rs) {
      const q = r.pts;
      for (let t = 0; t + 3 < q.length; t += 2) {
        const ax = q[t], az = q[t + 1], vx = q[t + 2] - ax, vz = q[t + 3] - az, L2 = vx * vx + vz * vz;
        let u = L2 > 0 ? ((x - ax) * vx + (z - az) * vz) / L2 : 0;
        u = u < 0 ? 0 : u > 1 ? 1 : u;
        const d = Math.hypot(ax + vx * u - x, az + vz * u - z);
        if (d < bd) { bd = d; best = r; }
      }
    }
    return best ? levelAt(best.id, best.pts, x, z) : null;
  };
  const ix = tIndex(list);
  const seen = new Set(), mine = [];
  for (let j = Math.floor((keep[1] - T_FEATHER) / 512); j <= Math.floor((keep[3] + T_FEATHER) / 512); j++)
    for (let i = Math.floor((keep[0] - T_FEATHER) / 512); i <= Math.floor((keep[2] + T_FEATHER) / 512); i++)
      for (const it of ix.get(i + '_' + j) || []) {
        if (seen.has(it)) continue;
        seen.add(it);
        const b = it.bb;
        if (b[2] + T_FEATHER < keep[0] || b[0] - T_FEATHER > keep[2] || b[3] + T_FEATHER < keep[1] || b[1] - T_FEATHER > keep[3]) continue;
        mine.push(it);
      }
  if (!mine.length) return 0;
  const src = Float32Array.from(ext);       // всё считаем по земле ДО террас
  const sample = (x, z) => {
    const gx = (x - ox) / step, gz = (z - oz) / step;
    const i = Math.floor(gx), j = Math.floor(gz);
    if (i < 0 || j < 0 || i >= ne - 1 || j >= ne - 1) return null;
    const fx = gx - i, fz = gz - j, k = j * ne + i;
    return (src[k] * (1 - fx) + src[k + 1] * fx) * (1 - fz) + (src[k + ne] * (1 - fx) + src[k + ne + 1] * fx) * fz;
  };
  const acc = new Float32Array(ne * ne), accW = new Float32Array(ne * ne), wmax = new Float32Array(ne * ne);
  const byPl = new Uint8Array(ne * ne);     // площадка по улицам: насыпь и выемка глубже
  let made = 0;
  for (const it of mine) {
    const p = it.poly, n = p.length / 2;
    const rs = byRoads(it);
    const pl = rs ? null : planeOf(it);
    const small = it.a <= T_SMALL || !!pl || !!rs;
    let P = null;
    if (pl || rs) P = 0;
    else if (small) {
      P = LEVEL.get('t:' + it.id);
      if (P === undefined) {
        const hs = [];
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          const ax = p[i * 2], az = p[i * 2 + 1], ex = p[j * 2] - ax, ez = p[j * 2 + 1] - az;
          const k = Math.max(1, Math.ceil(Math.hypot(ex, ez) / 3));
          for (let t = 0; t < k; t++) { const h = sample(ax + ex * t / k, az + ez * t / k); if (h !== null) hs.push(h); }
        }
        if (hs.length < 4) continue;
        hs.sort((a, b) => a - b);
        P = hs[hs.length >> 1];
        LEVEL.set('t:' + it.id, P);
      }
    }
    const b = it.bb;
    const i0 = Math.max(T_SMOOTH, Math.floor((Math.max(b[0], keep[0]) - T_FEATHER - ox) / step));
    const i1 = Math.min(ne - 1 - T_SMOOTH, Math.ceil((Math.min(b[2], keep[2]) + T_FEATHER - ox) / step));
    const j0 = Math.max(T_SMOOTH, Math.floor((Math.max(b[1], keep[1]) - T_FEATHER - oz) / step));
    const j1 = Math.min(ne - 1 - T_SMOOTH, Math.ceil((Math.min(b[3], keep[3]) + T_FEATHER - oz) / step));
    for (let j = j0; j <= j1; j++) {
      const z = oz + j * step;
      if (z < keep[1] || z > keep[3]) continue;
      for (let i = i0; i <= i1; i++) {
        const x = ox + i * step;
        if (x < keep[0] || x > keep[2]) continue;
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
        if (d >= T_FEATHER) continue;
        let w = 1;
        if (d > 0) { const t = 1 - d / T_FEATHER; w = t * t * (3 - 2 * t); }
        const k = j * ne + i;
        w *= roadFactor(x, z);
        if (w <= 0) continue;
        let tgt = pl ? pl.a + pl.bx * (x - pl.cx) + pl.bz * (z - pl.cz) : P;
        if (rs) { tgt = byLevel(rs, x, z); if (tgt === null) continue; }
        if (!small) {                     // сглаживание: среднее по окну
          let s = 0, c = 0;
          for (let dj = -T_SMOOTH; dj <= T_SMOOTH; dj++)
            for (let di = -T_SMOOTH; di <= T_SMOOTH; di++) { s += src[k + dj * ne + di]; c++; }
          tgt = s / c;
          w *= 0.75;
        }
        acc[k] += w * tgt; accW[k] += w;
        if (pl || rs) byPl[k] = 1;
        if (w > wmax[k]) wmax[k] = w;
      }
    }
    made++;
    yield;
  }
  for (let k = 0; k < ne * ne; k++) {
    const m = wmax[k];
    if (m <= 0) continue;
    let dev = acc[k] / accW[k] - src[k];
    // Площадку по улицам уводим от земли до 7 м: модель рельефа под сквером
    // в городе — дно между крышами, а сквер в натуре вровень с улицей.
    const F = byPl[k] ? 7 : T_FILL, C = byPl[k] ? 7 : T_CUT;
    if (dev > F) dev = F; else if (dev < -C) dev = -C;
    let h = src[k] + m * dev;
    if (h > cap[k]) h = cap[k];
    ext[k] = h;
  }
  return made;
}
