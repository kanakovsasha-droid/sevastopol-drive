// ДОРОГИ ПЕРВИЧНЫ: отметки улиц по графу улиц, а не по рельефу — по всей карте.
//
// Рельеф у нас — модель ПОВЕРХНОСТИ (SRTM/Copernicus, 30 м): крыши и кроны
// входят в неё, и профиль улицы, снятый с неё и сглаженный, всё равно
// ходил буграми, ступенями на стыках и перекосами на перекрёстках. Делаем
// наоборот: сначала считаем отметки дорог как инженер — по графу улиц, с
// ограничением уклона и перелома и одной отметкой на узел, — а землю потом
// подгоняем к ним (коридор в buildTerrainTile делает это сам).
//
// Сначала (roads3) так был сделан квадрат центра 3×3 км — 3% длины дорог.
// Теперь — вся карта, включая трассу на Ялту.
//
//   1. Граф: осевые проезжих улиц (класс ≤ 3) из world.json, уплотнённые до
//      шага 8 м. Общие узлы OSM — общие вершины; все узлы внутри пятна
//      небольшого перекрёстка — ОДНА вершина (одна отметка). Две проезжие
//      части одной магистрали связываются поперечными рёбрами. Мосты — в
//      графе, но без данных земли: полотно между устоями натягивается само,
//      без провисания в овраг. Тоннели магистралей (Меласский, галерея) —
//      тоже: иначе трасса лезла через гору на 25%.
//   2. Земля в вершине. В центре — 25-й процентиль высот в круге 14 м мимо
//      домов (срезает кровли и кроны; так настроен центр). За городом
//      дорога идёт по склону, и процентиль уводил её на метры вниз по
//      склону — там берём наклонную плоскость по тем же точкам, где точки
//      выше плоскости (кроны, крыши) почти не весят.
//   3. Решатель: экранированное сглаживание по графу (данные с весом,
//      растущим при уходе от земли больше чем на 2 м) чередуется с
//      проекциями на ограничения: уклон ребра (магистраль ≤ 6%, улица ≤ 9%,
//      где сам склон круче — по склону, но не круче потолка класса) и
//      перелом уклона: у трасс (класс 0–1 за центром) ≤ 1 пункта на 20 м,
//      у улиц — как в центре.
//   4. Выход. Улицы дальнего слоя (far.json) — в data/road-levels.json:
//      отметки по длине их осевой (как в far.json) с шагом 8 м, в сантиметрах,
//      разностями. Дворовые проезды (класс 3) вне far.json — по квадратам
//      1024 м в data/road-levels/<cx>_<cz>.json вместе с осевой: коридор
//      земли берёт их, когда собирает квадрат.
//
//   5. Вторая волна roads5 (06.10.2026): доводка привязана к земле (--anch, м), поперечные
//      связи проезжих частей — только напротив, путепроводы держат габарит
//      над улицей внизу (--clr, м), концы мостов сводятся в перекрёсток,
//      одномерная задача — только класс 0 (--trc), класс 1 — графом с
//      переломом до 3 п. на 20 м (--k1).
//
//   node tools/build-road-levels.mjs                 → вся карта
//   node tools/build-road-levels.mjs --box x0,x1,z0,z1 [--out file]  → кусок (для замеров)
//   отладка: --probe x,z,r (вершины и нарушения у точки), --viol x0,x1,z0,z1
//   (худшие нарушения в рамке), --stroke x,z (штрих трассы через точку), --debug
//   ВНИМАНИЕ: data/road-levels/* (дворовые проезды) пишутся и с --out.
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const T0 = Date.now();
const DBG = !!process.argv.includes('--debug');
const tlog = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1)} с]`, ...a);
// Квадрат центра: настроен в roads3/roads4, там правила прежние.
const CENTER = { x0: -1800, x1: 1200, z0: -300, z1: 2700 };
const CRAMP = 200;
const BOX = arg('box') ? (([x0, x1, z0, z1]) => ({ x0, x1, z0, z1 }))(arg('box').split(',').map(Number)) : null;
const MARGIN = 320;
const STEP = 8;
const RAD = Math.PI / 180;
// вес «центра» в точке: 1 в квадрате, к нулю на CRAMP метрах за краем
const centerW = (x, z) => {
  const b = CENTER, dx = Math.max(b.x0 - x, 0, x - b.x1), dz = Math.max(b.z0 - z, 0, z - b.z1);
  const d = Math.hypot(dx, dz);
  if (d <= 0) return 1;
  const t = Math.max(0, 1 - d / CRAMP);
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------- рельеф
const TI = JSON.parse(readFileSync(ROOT + 'data/terrain/index.json'));
const meta = TI.meta, D = TI.detail, unit = D.unit ?? 0.1;
const n2 = 2 ** D.zoom * D.tileSize;
const tiles = new Map();
for (const e of TI.chunks) tiles.set(e.tx + '_' + e.tz, { ...e, ox: e.px0 - D.px0, oy: e.py0 - D.py0, data: undefined });
const pix = (x, z) => {
  const lat = meta.origin.lat - z / meta.scale.mPerDegLat, r = lat * RAD;
  const mLon = 111412.84 * Math.cos(r) - 93.5 * Math.cos(3 * r);
  const lon = meta.origin.lon + x / mLon;
  return [(lon + 180) / 360 * n2 - D.px0, (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n2 - D.py0];
};
const raw = (x, z) => {
  const t = tiles.get(Math.floor(x / TI.chunk) + '_' + Math.floor(z / TI.chunk));
  if (!t) return null;
  if (t.data === undefined) {
    try { const b = readFileSync(`${ROOT}data/terrain/${t.tx}_${t.tz}.bin`); t.data = new Int16Array(b.buffer, b.byteOffset, b.length / 2); }
    catch { t.data = null; }
  }
  if (!t.data) return null;
  const [px, py] = pix(x, z), lx = px - t.ox, ly = py - t.oy;
  const x0 = Math.floor(lx), y0 = Math.floor(ly);
  if (x0 < 0 || y0 < 0 || x0 >= t.w - 1 || y0 >= t.h - 1) return null;
  const fx = lx - x0, fy = ly - y0, h = t.data, W = t.w, i = y0 * W + x0;
  return ((h[i] * (1 - fx) + h[i + 1] * fx) * (1 - fy) + (h[i + W] * (1 - fx) + h[i + W + 1] * fx) * fy) * unit;
};

// ---------------------------------------------------------------- данные
const W = JSON.parse(readFileSync(ROOT + 'data/world.json'));
const FAR = JSON.parse(readFileSync(ROOT + 'data/chunks/far.json'));
tlog('world.json и far.json прочитаны');
const X0 = BOX ? BOX.x0 - MARGIN : -Infinity, X1 = BOX ? BOX.x1 + MARGIN : Infinity;
const Z0 = BOX ? BOX.z0 - MARGIN : -Infinity, Z1 = BOX ? BOX.z1 + MARGIN : Infinity;
const inside = (x, z) => x > X0 && x < X1 && z > Z0 && z < Z1;
const inPoly = (x, z, p) => {
  let c = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], zi = p[i + 1], xj = p[j], zj = p[j + 1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
  }
  return c;
};
// сетка домов
const BG = 40, bgrid = new Map();
for (const b of W.buildings) {
  const p = b.poly; let a = Infinity, bz = Infinity, c = -Infinity, dz = -Infinity;
  for (let i = 0; i < p.length; i += 2) { a = Math.min(a, p[i]); c = Math.max(c, p[i]); bz = Math.min(bz, p[i + 1]); dz = Math.max(dz, p[i + 1]); }
  if (c < X0 - 50 || a > X1 + 50 || dz < Z0 - 50 || bz > Z1 + 50) continue;
  b.bb = [a, bz, c, dz];
  for (let i = Math.floor(a / BG); i <= Math.floor(c / BG); i++)
    for (let j = Math.floor(bz / BG); j <= Math.floor(dz / BG); j++) {
      const k = i * 100003 + j; let l = bgrid.get(k); if (!l) bgrid.set(k, l = []); l.push(b);
    }
}
const inHouse = (x, z) => {
  const l = bgrid.get(Math.floor(x / BG) * 100003 + Math.floor(z / BG));
  if (l) for (const b of l) {
    const q = b.bb; if (x < q[0] || x > q[2] || z < q[1] || z > q[3]) continue;
    if (inPoly(x, z, b.poly)) return true;
  }
  return false;
};
// Земля в точке. Точки круга 14 м (26 м, если мало) мимо домов.
//   pct   — 25-й процентиль: срезает кровли и кроны (центр настроен по нему);
//   plane — наклонная плоскость, точки выше неё почти не весят: на склоне
//           процентиль уводил трассу вниз по склону на метры.
// Между ними — плавно по весу центра.
const DX = [], DZ = [];
const ground = (x, z) => {
  const cw = centerW(x, z);
  for (const R of [14, 26]) {
    const hs = []; DX.length = 0; DZ.length = 0;
    for (let dx = -R; dx <= R; dx += 3.5)
      for (let dz = -R; dz <= R; dz += 3.5) {
        if (dx * dx + dz * dz > R * R) continue;
        const px = x + dx, pz = z + dz;
        if (inHouse(px, pz)) continue;
        const h = raw(px, pz); if (h !== null) { hs.push(h); DX.push(dx); DZ.push(dz); }
      }
    if (hs.length < 8) continue;
    let pct = 0, pl = 0;
    if (cw > 0) { const s = hs.slice().sort((a, b) => a - b); pct = s[Math.floor(s.length * 0.25)]; }
    if (cw < 1) {
      // взвешенные наименьшие квадраты, 4 прохода; вес точки выше плоскости
      // падает с превышением (кроны, крыши), ниже — почти нет
      let a = 0, bx = 0, bz = 0;
      { const s = hs.slice().sort((p, q) => p - q); a = s[s.length >> 1]; }
      for (let it = 0; it < 4; it++) {
        let n = 0, sx = 0, sz = 0, sh = 0, sxx = 0, szz = 0, sxz = 0, sxh = 0, szh = 0;
        for (let k = 0; k < hs.length; k++) {
          const x1 = DX[k], z1 = DZ[k], h = hs[k];
          const r = h - (a + bx * x1 + bz * z1);
          const w = r > 0.3 ? 1 / (1 + ((r - 0.3) / 0.5) ** 2) : r < -1.5 ? 1 / (1 + ((-r - 1.5) / 1.5) ** 2) : 1;
          n += w; sx += x1 * w; sz += z1 * w; sh += h * w; sxx += x1 * x1 * w; szz += z1 * z1 * w; sxz += x1 * z1 * w; sxh += x1 * h * w; szh += z1 * h * w;
        }
        const A = [[n, sx, sz], [sx, sxx, sxz], [sz, sxz, szz]], B = [sh, sxh, szh];
        const sol = solve3(A, B);
        if (!sol) break;
        [a, bx, bz] = sol;
      }
      pl = a;
    }
    return Math.max(0.6, pct * cw + pl * (1 - cw));
  }
  const h = raw(x, z); return h === null ? null : Math.max(0.6, h);
};
function det3(m) {
  return m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
}
function solve3(A, B) {
  const D0 = det3(A);
  if (Math.abs(D0) < 1e-6) return null;
  const col = k => A.map((r, ri) => r.map((v, ci) => ci === k ? B[ri] : v));
  return [det3(col(0)) / D0, det3(col(1)) / D0, det3(col(2)) / D0];
}

// ---------------------------------------------------------------- граф
// Тоннели магистралей — в граф (и в коридор земли: см. roadCorridorGen);
// прочие тоннели — подземные проезды дворов — нет.
const tunnelOk = r => r.tn && r.c <= 1;
const use = W.roads.filter(r => r.c <= 3 && (!r.tn || tunnelOk(r)) && r.pts.length >= 4 &&
  (!BOX || r.pts.some((v, i) => i % 2 === 0 && inside(v, r.pts[i + 1]))));
// небольшие перекрёстки — одна вершина
const JC = 30, jgrid = new Map();
for (const j of W.junctions) {
  if (j.r > 16 || !inside(j.x, j.z)) continue;
  const k = Math.floor(j.x / JC) * 100003 + Math.floor(j.z / JC);
  let l = jgrid.get(k); if (!l) jgrid.set(k, l = []); l.push(j);
}
const junctionOf = (x, z) => {
  for (let i = Math.floor(x / JC) - 1; i <= Math.floor(x / JC) + 1; i++)
    for (let jj = Math.floor(z / JC) - 1; jj <= Math.floor(z / JC) + 1; jj++)
      for (const j of jgrid.get(i * 100003 + jj) || []) {
        if (j.poly ? inPoly(x, z, j.poly) : Math.hypot(x - j.x, z - j.z) < j.r) return j.id;
      }
  return null;
};
const nodeId = new Map(), NX = [], NZ = [], NC = [];
const node = (x, z, osm, free) => {
  let key = null;
  if (osm) {
    // Мост и тоннель с пятном перекрёстка внизу не сводим: у них свой уровень.
    const jid = free ? null : junctionOf(x, z);
    key = jid ? 'J' + jid : 'P' + Math.round(x * 2) + ',' + Math.round(z * 2);
  } else if (!free) {
    // Вставная точка (шаг 8 м) внутри пятна перекрёстка — тоже его вершина.
    // Иначе между двумя узлами OSM, сведёнными в одну вершину перекрёстка,
    // оставалась свободная точка: перелом её не держал (тройка «узел — точка —
    // тот же узел» отбрасывается), и в перекрёстке выходила яма на полметра
    // (Пластунская × 2-я Линия Бомборы, 614, 2091: перелом 14%).
    // В положение вершины такие точки не идут — его задают узлы OSM.
    const jid = junctionOf(x, z);
    if (jid && nodeId.has('J' + jid)) return nodeId.get('J' + jid);
  }
  if (key && nodeId.has(key)) { const id = nodeId.get(key); NX[id] += x; NZ[id] += z; NC[id]++; return id; }
  const id = NX.length; NX.push(x); NZ.push(z); NC.push(1);
  if (key) nodeId.set(key, id);
  return id;
};
const NOBREND = process.argv.includes('--no-brend');
const edgesL = [];      // a, b, len, base, kind, imp, cls
const chains = [];      // по улице: вершины, длины дуги, длина дуги в узлах OSM
const noData = new Set();
for (const r of use) {
  const p = r.pts, ids = [], ss = [], sk = [];
  const free = !!(r.br || r.tn);
  let s = 0;
  for (let k = 0; k < p.length / 2; k++) {
    const x = p[k * 2], z = p[k * 2 + 1];
    // узел конца звена — раньше вставных точек: те ищут вершину перекрёстка
    // Концы моста и тоннеля — устои, они на земле и в сети улиц: сводим их
    // в пятно перекрёстка, как всех. Иначе мост, упёршийся в перекрёсток,
    // висел отдельной вершиной, трасса за ним кончалась свободным концом и
    // уходила на 7 м вверх (ул. Новикова у Сапунгорской, 2290, 9600).
    const end = node(x, z, true, free && (NOBREND || (k > 0 && k < p.length / 2 - 1)));
    if (k > 0) {
      const px = p[k * 2 - 2], pz = p[k * 2 - 1], L = Math.hypot(x - px, z - pz);
      const m = Math.max(1, Math.ceil(L / STEP));
      for (let q = 1; q < m; q++) {
        const id = node(px + (x - px) * q / m, pz + (z - pz) * q / m, false, free);
        ids.push(id); ss.push(s + L * q / m);
        if (free) noData.add(id);
      }
      s += L;
    }
    ids.push(end); ss.push(s); sk.push(s);
    // у моста и тоннеля земля — только на концах
    if (free && k > 0 && k < p.length / 2 - 1) noData.add(end);
  }
  const base = r.c <= 1 && r.w >= 10 ? 0.06 : 0.09;
  // Вес ребра в сглаживании — по значимости улицы: в узле главная улица
  // ведёт свою линию, а второстепенная подстраивается к ней. Поровну
  // крутой переулок утаскивал узел вниз, и Большая Морская на перекрёстке
  // проседала ямой на метр.
  const imp = (r.c <= 1 ? 4 : r.c === 2 ? 1.5 : 0.5) * Math.max(0.5, r.w / 9);
  for (let k = 1; k < ids.length; k++) if (ids[k] !== ids[k - 1]) edgesL.push(ids[k - 1], ids[k], Math.max(0.5, ss[k] - ss[k - 1]), base, 0, imp, r.c);
  chains.push({ r, ids, ss, sk, imp });
}
const N = NX.length;
for (let i = 0; i < N; i++) { NX[i] /= NC[i]; NZ[i] /= NC[i]; }
// концы мостов: земля у устоя — это откос оврага, процентиль тянет вниз
const nearBridge = new Uint8Array(N);
{
  const G = 25, g = new Map();
  for (const c of chains) if (c.r.br) for (const k of [0, c.ids.length - 1]) {
    const id = c.ids[k], key = Math.floor(NX[id] / G) * 100003 + Math.floor(NZ[id] / G);
    (g.get(key) || g.set(key, []).get(key)).push(id);
  }
  if (g.size) for (let i = 0; i < N; i++) {
    const cx = Math.floor(NX[i] / G), cz = Math.floor(NZ[i] / G);
    for (let a = cx - 1; a <= cx + 1 && !nearBridge[i]; a++) for (let b = cz - 1; b <= cz + 1; b++) {
      const l = g.get(a * 100003 + b); if (!l) continue;
      if (l.some(e => Math.hypot(NX[e] - NX[i], NZ[e] - NZ[i]) < 25)) { nearBridge[i] = 1; break; }
    }
  }
}
// две проезжие части магистрали: поперечные связи
{
  const G = 12, g = new Map();
  chains.forEach((c, ci) => { if (c.r.c > 1 || c.r.w < 7 || c.r.br || c.r.tn) return;
    for (const id of c.ids) { const k = Math.floor(NX[id] / G) * 100003 + Math.floor(NZ[id] / G); let l = g.get(k); if (!l) g.set(k, l = []); l.push(ci, id); } });
  const seen = new Set();
  // направление улицы в вершине — по соседям в её цепочке
  const pos = chains.map(c => { const m = new Map(); c.ids.forEach((id, k) => { if (!m.has(id)) m.set(id, k); }); return m; });
  const dirOf = (ci, id) => {
    const c = chains[ci], k = pos[ci].get(id);
    if (k === undefined) return null;
    const a = c.ids[Math.max(0, k - 1)], b = c.ids[Math.min(c.ids.length - 1, k + 1)];
    const dx = NX[b] - NX[a], dz = NZ[b] - NZ[a], L = Math.hypot(dx, dz);
    return L > 0.1 ? [dx / L, dz / L] : null;
  };
  chains.forEach((c, ci) => {
    if (c.r.c > 1 || c.r.w < 7 || c.r.br || c.r.tn) return;
    for (const id of c.ids) {
      let best = -1, bd = Infinity;
      for (let i = Math.floor(NX[id] / G) - 2; i <= Math.floor(NX[id] / G) + 2; i++)
        for (let j = Math.floor(NZ[id] / G) - 2; j <= Math.floor(NZ[id] / G) + 2; j++) {
          const l = g.get(i * 100003 + j); if (!l) continue;
          for (let t = 0; t < l.length; t += 2) {
            const o = chains[l[t]]; if (l[t] === ci || o.r === c.r) continue;
            const d = Math.hypot(NX[l[t + 1]] - NX[id], NZ[l[t + 1]] - NZ[id]);
            if (!(d < bd && d > 4 && d < (c.r.w + o.r.w) / 2 + 6)) continue;
            // Только параллельные: на серпантине соседняя петля той же
            // дороги идёт в 15 м выше — это не вторая проезжая часть.
            const u = dirOf(ci, id), v = dirOf(l[t], l[t + 1]);
            if (!u || !v || Math.abs(u[0] * v[0] + u[1] * v[1]) < 0.94) continue;
            // И напротив, а не наискось: ближайшая параллельная точка второй
            // проезжей части бывает на 10 м вперёд по склону — связь «на одной
            // отметке» тогда тянет узел вниз по склону (пл. Нахимова: узел
            // Ленина × пр. Нахимова к точке другой проезжей части на 1.3 м ниже).
            const ox = (NX[l[t + 1]] - NX[id]) / d, oz = (NZ[l[t + 1]] - NZ[id]) / d;
            if (Math.abs(ox * u[0] + oz * u[1]) > +arg("abeam", 0.6)) continue;
            bd = d; best = l[t + 1];
          }
        }
      if (best < 0) continue;
      const k = Math.min(id, best) + ',' + Math.max(id, best);
      if (seen.has(k)) continue; seen.add(k);
      edgesL.push(id, best, bd, 0.02, 1, 2, 1);   // проезжие части почти на одной отметке
    }
  });
}
const NE = edgesL.length / 7;
const EA = new Int32Array(NE), EB = new Int32Array(NE), EL = new Float32Array(NE), EG = new Float32Array(NE),
  EK = new Uint8Array(NE), EI = new Float32Array(NE), EC = new Uint8Array(NE);
for (let e = 0; e < NE; e++) {
  EA[e] = edgesL[e * 7]; EB[e] = edgesL[e * 7 + 1]; EL[e] = edgesL[e * 7 + 2]; EG[e] = edgesL[e * 7 + 3];
  EK[e] = edgesL[e * 7 + 4]; EI[e] = edgesL[e * 7 + 5]; EC[e] = edgesL[e * 7 + 6];
}
edgesL.length = 0;
tlog(`улиц ${use.length}, вершин ${N}, рёбер ${NE}, без земли ${noData.size}`);

// ---------------------------------------------------------------- земля
const G0 = new Float32Array(N);
for (let i = 0; i < N; i++) {
  // за краем высот (улица уходит с карты) земли нет — вершина без данных,
  // иначе отметка 1 м тянула горную дорогу вниз на сотни метров
  const g = ground(NX[i], NZ[i]); G0[i] = g === null ? 1 : g;
  if (g === null) noData.add(i);
  if (i % 100000 === 99999) tlog('земля', i + 1, 'из', N);
}
tlog('земля посчитана');
const G0raw = Float32Array.from(G0);       // для итоговой статистики
// Поперечная связь двух проезжих частей, у которых земля расходится больше
// чем на 2 м, — это уступ с подпорной стенкой (или эстакада над улицей), а
// не одна дорога: связь снимаем (как и в коридоре, worldgen.js).
{
  let off = 0;
  for (let e = 0; e < NE; e++) if (EK[e] && Math.abs(G0[EA[e]] - G0[EB[e]]) > 2) { EK[e] = 2; EG[e] = 10; off++; }
  tlog('поперечных связей снято по земле', off);
}
// данные: вес вершины
const DW = new Float32Array(N).fill(1);
for (const i of noData) DW[i] = 0;
for (let i = 0; i < N; i++) if (nearBridge[i] && DW[i] > 0) DW[i] = 0.3;
// соседи (CSR)
const deg = new Int32Array(N + 1);
for (let e = 0; e < NE; e++) { deg[EA[e] + 1]++; deg[EB[e] + 1]++; }
for (let i = 0; i < N; i++) deg[i + 1] += deg[i];
const NB = new Int32Array(deg[N]), NW = new Float32Array(deg[N]);
{
  const fill = Int32Array.from(deg.subarray(0, N));
  for (let e = 0; e < NE; e++) {
    NB[fill[EA[e]]] = EB[e]; NW[fill[EA[e]]++] = EI[e];
    NB[fill[EB[e]]] = EA[e]; NW[fill[EB[e]]++] = EI[e];
  }
}
// Без данных (середина моста): опорная «земля» — сглаженная по соседям,
// чтобы стартовать не со дна оврага.
for (let it = 0; it < 200; it++) for (const i of noData) {
  let s = 0, w = 0;
  for (let k = deg[i]; k < deg[i + 1]; k++) { s += G0[NB[k]]; w++; }
  if (w) G0[i] = s / w;
}
// ПУТЕПРОВОДЫ. Мост над улицей — без данных земли, полотно натягивалось
// между устоями, а устои стоят на той же земле, что и улица внизу: на
// развязке 7-го км Городское шоссе шло «мостом» в 0.3–0.5 м над Балаклавским
// шоссе, полотно перехватывало колесо — удар до 7 g. Где осевая моста
// пересекает осевую другой улицы (не моста и не тоннеля), держим габарит:
// полотно не ниже улицы под ним на CLR м — опорой в данных (одномерная задача
// трасс) и ограничением в проекциях.
const CLR = +arg('clr', 6.0);
const clrL = [];        // мост, улица внизу
{
  const G = 24, g = new Map();
  const segKey = (i, j) => i * 100003 + j;
  chains.forEach((c, ci) => {
    if (c.r.br || c.r.tn) return;
    for (let k = 1; k < c.ids.length; k++) {
      const a = c.ids[k - 1], b = c.ids[k];
      for (let i = Math.floor(Math.min(NX[a], NX[b]) / G); i <= Math.floor(Math.max(NX[a], NX[b]) / G); i++)
        for (let j = Math.floor(Math.min(NZ[a], NZ[b]) / G); j <= Math.floor(Math.max(NZ[a], NZ[b]) / G); j++)
          (g.get(segKey(i, j)) || g.set(segKey(i, j), []).get(segKey(i, j))).push(ci, k);
    }
  });
  const cross = (ax, az, bx, bz, cx, cz, dx, dz) => {
    const r = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx);
    if (Math.abs(r) < 1e-9) return null;
    const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / r, u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / r;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [t, u] : null;
  };
  const seen = new Set();
  for (const c of chains) {
    if (!c.r.br) continue;
    const ids = new Set(c.ids), L = c.ss[c.ss.length - 1];
    for (let k = 1; k < c.ids.length; k++) {
      const a = c.ids[k - 1], b = c.ids[k];
      for (let i = Math.floor(Math.min(NX[a], NX[b]) / G); i <= Math.floor(Math.max(NX[a], NX[b]) / G); i++)
        for (let j = Math.floor(Math.min(NZ[a], NZ[b]) / G); j <= Math.floor(Math.max(NZ[a], NZ[b]) / G); j++)
          for (const [oci, ok] of ((l => { const o = []; for (let q = 0; q < (l || []).length; q += 2) o.push([l[q], l[q + 1]]); return o; })(g.get(segKey(i, j))))) {
            const o = chains[oci], p = o.ids[ok - 1], q = o.ids[ok];
            if (ids.has(p) || ids.has(q)) continue;               // примыкает к мосту — не под ним
            const x = cross(NX[a], NZ[a], NX[b], NZ[b], NX[p], NZ[p], NX[q], NZ[q]);
            if (!x) continue;
            const s = c.ss[k - 1] + (c.ss[k] - c.ss[k - 1]) * x[0];
            if (s < 6 || s > L - 6) continue;                      // у самого устоя — съезд, а не пролёт
            const v = x[0] < 0.5 ? a : b, u = x[1] < 0.5 ? p : q;
            if (!noData.has(v)) continue;
            const key = v + ',' + u; if (seen.has(key)) continue; seen.add(key);
            clrL.push(v, u);
          }
    }
  }
  // Опоры: недостающий габарит — пополам: полотно вверх, улица внизу в
  // выемку. Модель рельефа (30 м, поверхность) путепровода не видит: «земля»
  // под ним — то полотно, то улица, и тянуть полотно на все 6 м вверх
  // значило поднимать трассу на подходах на сотни метров (ул. Новикова над
  // Балаклавским шоссе). Вес опоры — сильнее земли.
  const need = new Map();
  for (let k = 0; k < clrL.length; k += 2) {
    const v = clrL[k], u = clrL[k + 1], n = CLR - (G0[v] - G0[u]);
    if (n > (need.get(k) || 0)) need.set(k, n);
  }
  const lift = new Map(), sink = new Map();
  for (const [k, n] of need) {
    const v = clrL[k], u = clrL[k + 1];
    lift.set(v, Math.max(lift.get(v) || 0, n / 2)); sink.set(u, Math.max(sink.get(u) || 0, n / 2));
  }
  for (const [v, d] of lift) { G0[v] += d; DW[v] = Math.max(DW[v], 1e4); }
  for (const [u, d] of sink) { G0[u] -= d; DW[u] = Math.max(DW[u], 1e4); }
  if (DBG) for (let k = 0; k < clrL.length; k += 2) console.log('путепровод', NX[clrL[k]].toFixed(0), NZ[clrL[k]].toFixed(0), 'улица внизу', G0[clrL[k + 1]].toFixed(1), 'полотно', G0[clrL[k]].toFixed(1));
  tlog('путепроводов над улицами (пар вершин)', clrL.length / 2);
}
const clrSet = new Set(clrL);
const clearance = () => {
  for (let k = 0; k < clrL.length; k += 2) {
    const v = clrL[k], u = clrL[k + 1], d = Hh[v] - Hh[u];
    if (d >= CLR) continue;
    const mv = PIN[v] ? 0 : 1, mu = PIN[u] ? 0 : 1;
    if (mv + mu <= 0) continue;
    const ex = (CLR - d) / (mv + mu);
    Hh[v] += ex * mv; Hh[u] -= ex * mu;
  }
};
// склон, сглаженный на ~70 м: по нему решаем, где улица и правда крутая
const GS =Float32Array.from(G0), T = new Float32Array(N);
for (let it = 0; it < 70; it++) {
  for (let i = 0; i < N; i++) { let s = GS[i] * 2, w = 2; for (let k = deg[i]; k < deg[i + 1]; k++) { s += GS[NB[k]]; w++; } T[i] = s / w; }
  GS.set(T);
}
// Потолок уклона по классу. Улицы — до 20%, как в центре (2-я Линия Бомборы:
// 27% в среднем на 148 м, 18% было невыполнимо). Трасса и шоссе за центром
// — до 10 и 14%: таких уклонов на них в жизни нет, а склон модели рельефа
// местами круче (бровки, кроны).
const capOf = (c, x, z) => {
  if (c >= 2) return 0.20;
  const cw = centerW(x, z);
  const far = c === 0 ? 0.10 : 0.14;
  return far + (0.20 - far) * cw;
};
for (let e = 0; e < NE; e++) {
  if (EK[e]) continue;
  const a = EA[e], b = EB[e];
  const slope = Math.abs(GS[a] - GS[b]) / EL[e];
  EG[e] = Math.min(capOf(EC[e], NX[a], NZ[a]), Math.max(EG[e], slope * 1.15 + 0.01));
}

// ---------------------------------------------------------------- решатель
const WD = 0.035;
// Подвижность вершины в проекциях: узел, через который идёт более важная
// улица, второстепенной почти не двигается.
const nodeImp = new Float32Array(N);
for (let e = 0; e < NE; e++) { if (EI[e] > nodeImp[EA[e]]) nodeImp[EA[e]] = EI[e]; if (EI[e] > nodeImp[EB[e]]) nodeImp[EB[e]] = EI[e]; }
// Тройки подряд идущих вершин улицы: ограничение ПЕРЕЛОМА уклона. Одного
// предела уклона мало — на крутом склоне, где данные тянут сильнее, профиль
// ломался с −1% на +11% за 16 м (Троллейбусный спуск).
//   улицы: перелом не больше 5 пунктов на вершину при плечах 8 м (как в центре);
//   трассы (класс 0–1 за центром): не больше 1 пункта на 20 м — радиус
//   вертикальной кривой 2 км, на 100 км/ч это 0.04 g.
// Цепочку сжимаем: подряд идущие одинаковые вершины (несколько точек улицы
// внутри пятна перекрёстка — одна вершина) становятся одной, со своими
// краями по длине. Иначе тройка «подход — перекрёсток — перекрёсток»
// отбрасывалась, и перелом на въезде в перекрёсток ничем не держался (до 15%).
const KMAX = 0.025, KTR = 0.01 / 20;
// Шоссе класса 1 (Балаклавское, Камышовое, улицы Новикова, Хрусталёва) —
// не автомагистраль: радиус вертикальной кривой 2 км там уводил профиль
// от земли на 4–6 м (выход из оврага на ул. Новикова, развязка 7-го км),
// и коридор рвался ступенями. Им — KTR1 (3 п. на 20 м, радиус ~670 м:
// на 100 км/ч 0.12 g) и мягче начальный штраф.
const KTR1 = +arg('k1', 3) / 100 / 20, LAM1 = +arg('lam1', 2e6);
const PIN = new Uint8Array(N);    // трасса за центром: отметки решены одномерно
const limOf = (cls, b, l1, l2) => {
  const street = KMAX * 2 * Math.min(l1, l2) / STEP;
  if (cls > 1) return street;
  const cw = centerW(NX[b], NZ[b]);
  // запас 0.75: проекции сходятся к пределу снизу не до конца
  return (cls === 1 ? KTR1 : KTR) * 0.75 * (l1 + l2) / 2 * (1 - cw) + street * cw;
};
const cv = chains.map(c => {
  const v = [], s0 = [], s1 = [];
  for (let k = 0; k < c.ids.length; k++) {
    if (v.length && v[v.length - 1] === c.ids[k]) s1[s1.length - 1] = c.ss[k];
    else { v.push(c.ids[k]); s0.push(c.ss[k]); s1.push(c.ss[k]); }
  }
  // Положение вершины — середина её пятна. Отметка внутри пятна перекрёстка
  // раньше была плато (вершина одна на все точки пятна), и на трассе через
  // перекрёсток на спуске выходили два перелома по краям плато.
  const pos = s0.map((a, k) => (a + s1[k]) / 2);
  const e = { v, s0, s1, pos, c };
  c.cv = e;
  return e;
});
// отметка на куске по длине дуги: ломаная по серединам пятен
const hOn = (e, s) => {
  const { v, pos } = e, m = v.length;
  if (m === 1 || s <= pos[0]) return Hh[v[0]];
  if (s >= pos[m - 1]) return Hh[v[m - 1]];
  let lo = 0, hi = m - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pos[mid] <= s) lo = mid; else hi = mid; }
  const u = (s - pos[lo]) / Math.max(1e-6, pos[hi] - pos[lo]);
  return Hh[v[lo]] + (Hh[v[hi]] - Hh[v[lo]]) * u;
};
const trl = [];
for (const { v, pos, c } of cv) {
  for (let k = 1; k < v.length - 1; k++) {
    const a = v[k - 1], b = v[k], d = v[k + 1];
    if (a === d) continue;
    const l1 = pos[k] - pos[k - 1], l2 = pos[k + 1] - pos[k];
    if (l1 < 0.5 || l2 < 0.5) continue;
    trl.push(a, b, d, l1, l2, c.imp, limOf(c.r.c, b, l1, l2));
  }
}
// СТЫКИ OSM-ЛИНИЙ. Улица в OSM нарезана на куски (мост, смена полосности,
// названия), и перелом держался только внутри куска: на стыке двух кусков
// тройки не было, и профиль ломался там как угодно. Концы кусков в общей
// вершине сводим в пары — самые прямые продолжения, своего класса —
// и держим перелом и через стык.
const ends = new Map();           // вершина → [[кусок, с начала?]]
cv.forEach((q, qi) => {
  if (q.v.length < 2) return;
  for (const atStart of [true, false]) {
    const vv = atStart ? q.v[0] : q.v[q.v.length - 1];
    (ends.get(vv) || ends.set(vv, []).get(vv)).push([qi, atStart]);
  }
});
const endInfo = (qi, atStart) => {
  const q = cv[qi], m = q.v.length;
  return atStart ? { nb: q.v[1], arm: q.pos[1] - q.pos[0] } : { nb: q.v[m - 2], arm: q.pos[m - 1] - q.pos[m - 2] };
};
const pairOf = new Map();         // «кусок:конец» → [кусок, конец]
let nJoint = 0;
for (const [vv, l] of ends) {
  if (l.length < 2) continue;
  const info = l.map(([qi, st]) => {
    const e = endInfo(qi, st), dx = NX[e.nb] - NX[vv], dz = NZ[e.nb] - NZ[vv], d = Math.hypot(dx, dz) || 1;
    return { qi, st, ...e, ux: dx / d, uz: dz / d, cls: cv[qi].c.r.c };
  });
  const cand = [];
  for (let i = 0; i < info.length; i++) for (let j = i + 1; j < info.length; j++) {
    const A = info[i], B = info[j];
    if (A.qi === B.qi || A.nb === B.nb) continue;
    const cos = A.ux * B.ux + A.uz * B.uz;
    if (cos > -0.7) continue;                       // не продолжение (угол < 135°)
    cand.push([cos + 1.0 * Math.abs(A.cls - B.cls) + 0.03 * Math.abs(cv[A.qi].c.r.w - cv[B.qi].c.r.w), A, B]);
  }
  cand.sort((a, b) => a[0] - b[0]);
  const used = new Set();
  for (const [, A, B] of cand) {
    if (used.has(A) || used.has(B)) continue;
    used.add(A); used.add(B);
    if (A.arm < 0.5 || B.arm < 0.5) continue;
    const cls = Math.max(A.cls, B.cls);
    trl.push(A.nb, vv, B.nb, A.arm, B.arm, Math.min(cv[A.qi].c.imp, cv[B.qi].c.imp), limOf(cls, vv, A.arm, B.arm));
    pairOf.set(A.qi + ':' + A.st, [B.qi, B.st]); pairOf.set(B.qi + ':' + B.st, [A.qi, A.st]);
    nJoint++;
  }
}
const NT = trl.length / 7;
const TA = new Int32Array(NT), TB = new Int32Array(NT), TD = new Int32Array(NT), TL1 = new Float32Array(NT), TL2 = new Float32Array(NT),
  TI_ = new Float32Array(NT), TLIM = new Float32Array(NT);
for (let t = 0; t < NT; t++) {
  TA[t] = trl[t * 7]; TB[t] = trl[t * 7 + 1]; TD[t] = trl[t * 7 + 2]; TL1[t] = trl[t * 7 + 3]; TL2[t] = trl[t * 7 + 4]; TI_[t] = trl[t * 7 + 5]; TLIM[t] = trl[t * 7 + 6];
}
trl.length = 0;
tlog(`троек ${NT}, из них на стыках кусков ${nJoint}`);

// ТРАССЫ: профиль одним куском. Перелом 1 пункт на 20 м — это вертикальная
// кривая на 400 м и дальше; проекциями по три вершины его не добиться
// (поправка ползёт на вершину за проход, а кругов тысяча). Поэтому трассы
// (класс 0–1 за центром) сначала собираем в «штрихи» — куски, сведённые
// через стыки, — и на каждом решаем одномерную задачу прямо: отметки,
// близкие к земле, со штрафом за кривизну (пятидиагональная система),
// и где кривизна всё ещё выше предела — штраф там поднимаем и решаем снова.
// Дальше эти отметки — опора с большим весом, граф подстраивает к ним
// остальные улицы (их узлы на трассе почти не подвижны).
{
  const TRC = +arg('trc', 0);
  const isTr = qi => { const r = cv[qi].c.r; return r.c <= TRC && cv[qi].v.length >= 2; };
  const seen = new Set();
  const strokes = [];
  for (let qi = 0; qi < cv.length; qi++) {
    if (seen.has(qi) || !isTr(qi)) continue;
    // идём к началу штриха
    let cur = qi, st = true, guard = 0;
    for (;;) {
      const p = pairOf.get(cur + ':' + st);
      if (!p || !isTr(p[0]) || p[0] === qi || guard++ > 100000) break;
      cur = p[0]; st = !p[1];
    }
    // cur — первый кусок, st — каким концом он смотрит в начало
    const seq = [];
    let q = cur, fromStart = st;          // fromStart: идём от начала куска к концу
    for (;;) {
      if (seen.has(q)) break;
      seen.add(q); seq.push([q, fromStart]);
      const p = pairOf.get(q + ':' + !fromStart);
      if (!p || !isTr(p[0])) break;
      q = p[0]; fromStart = p[1];
    }
    // вершины и длины дуги
    const V = [], S = [], C = [];
    for (const [q2, fwd] of seq) {
      const c = cv[q2], m = c.v.length, cl = c.c.r.c;
      const idx = fwd ? [...Array(m).keys()] : [...Array(m).keys()].reverse();
      for (let t = 0; t < m; t++) {
        const k = idx[t], vv = c.v[k];
        if (V.length && V[V.length - 1] === vv) continue;
        if (!V.length) { V.push(vv); S.push(0); C.push(cl); continue; }
        const kp = idx[t - 1];
        const arm = Math.abs(c.pos[k] - c.pos[kp]);
        V.push(vv); S.push(S[S.length - 1] + Math.max(0.5, arm)); C.push(cl);
      }
    }
    if (V.length >= 2) strokes.push({ V, S, C, imp: Math.max(...seq.map(([q2]) => cv[q2].c.imp)) });
  }
  // пятидиагональная симметричная система: A·h = b, A хранится лентой
  // d0 — диагональ, d1[i] = A[i][i+1], d2[i] = A[i][i+2]. LDLᵀ, L — единичная
  // нижняя с двумя поддиагоналями l1[i] = L[i][i−1], l2[i] = L[i][i−2].
  const solve5 = (n, d0, d1, d2, b) => {
    const l1 = new Float64Array(n), l2 = new Float64Array(n), Dg = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      if (i >= 2) l2[i] = d2[i - 2] / Dg[i - 2];
      if (i >= 1) l1[i] = (d1[i - 1] - (i >= 2 ? l2[i] * l1[i - 1] * Dg[i - 2] : 0)) / Dg[i - 1];
      Dg[i] = d0[i] - (i >= 1 ? l1[i] * l1[i] * Dg[i - 1] : 0) - (i >= 2 ? l2[i] * l2[i] * Dg[i - 2] : 0);
    }
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) y[i] = b[i] - (i >= 1 ? l1[i] * y[i - 1] : 0) - (i >= 2 ? l2[i] * y[i - 2] : 0);
    const h = new Float64Array(n);
    for (let i = n - 1; i >= 0; i--) h[i] = y[i] / Dg[i] - (i + 1 < n ? l1[i + 1] * h[i + 1] : 0) - (i + 2 < n ? l2[i + 2] * h[i + 2] : 0);
    return h;
  };
  const KLIM = KTR * 0.75, LMAX = 2e11, DMAX = +arg('dmax', 5);
  let worstAll = 0;
  const solveStroke = ({ V, S, C }, gOf, wOf) => {
    const n = V.length;
    const w = new Float64Array(n), g = new Float64Array(n), lam = new Float64Array(n), cwv = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      w[i] = wOf(V[i]) + 1e-6; g[i] = gOf(V[i]); cwv[i] = centerW(NX[V[i]], NZ[V[i]]);
      lam[i] = (C[i] === 1 ? LAM1 : 2e8) * (1 - cwv[i]) + 1e3;
    }
    // У путепровода профиль обязан подняться (или уйти в выемку) на габарит:
    // кривизну там не ужесточаем, иначе штраф перебивал опору габарита.
    const soft = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (clrSet.has(V[i])) for (let j = Math.max(0, i - 12); j <= Math.min(n - 1, i + 12); j++) { soft[j] = 1; lam[j] = Math.min(lam[j], LAM1); }
    let h = null;
    for (let round = 0; round < 16; round++) {
      const d0 = Float64Array.from(w), d1 = new Float64Array(n), d2 = new Float64Array(n), b = new Float64Array(n);
      for (let i = 0; i < n; i++) b[i] = w[i] * g[i];
      for (let i = 1; i < n - 1; i++) {
        const l1 = S[i] - S[i - 1], l2 = S[i + 1] - S[i], m = (l1 + l2) / 2;
        const ca = 1 / (l1 * m), cc = 1 / (l2 * m), cb = -(ca + cc), L = lam[i];
        d0[i - 1] += L * ca * ca; d0[i] += L * cb * cb; d0[i + 1] += L * cc * cc;
        d1[i - 1] += L * ca * cb; d1[i] += L * cb * cc; d2[i - 1] += L * ca * cc;
      }
      h = solve5(n, d0, d1, d2, b);
      // Штраф поднимаем, где кривизна выше предела, но не до бесконечности:
      // там, где предел с землёй несовместим (крутой съезд с горы в конце
      // шоссе), профиль выпрямлялся в линию и уходил от земли на 70 м. Ушёл
      // дальше DMAX — штраф там опускаем: лучше перелом круче предела, чем
      // дорога в насыпи или выемке в два этажа. Эти два правила не спорят:
      // там, где профиль далеко от земли, штраф только опускается.
      let bad = 0;
      const far = new Uint8Array(n);
      for (let i = 0; i < n; i++) if (w[i] > 0.05 && w[i] < 100 && Math.abs(h[i] - g[i]) > DMAX)
        for (let j = Math.max(0, i - 6); j <= Math.min(n - 1, i + 6); j++) far[j] = 1;
      for (let i = 1; i < n - 1; i++) {
        if (cwv[i] > 0 || far[i] || soft[i]) continue;
        const l1 = S[i] - S[i - 1], l2 = S[i + 1] - S[i];
        const k = Math.abs((h[i + 1] - h[i]) / l2 - (h[i] - h[i - 1]) / l1) / ((l1 + l2) / 2);
        if (k > (C[i] === 1 ? KTR1 * 0.75 : KLIM) * 0.9) { bad++; for (let j = Math.max(1, i - 3); j <= Math.min(n - 2, i + 3); j++) if (!far[j]) lam[j] = Math.min(LMAX, lam[j] * 2.5); }
      }
      for (let i = 0; i < n; i++) if (far[i]) { lam[i] = Math.max(1e4, lam[i] * 0.4); bad++; }
      if (!bad) break;
    }
    if (DBG) {
      let md = 0, at = 0;
      for (let i = 0; i < n; i++) if (w[i] > 0.5 && w[i] < 100 && Math.abs(h[i] - g[i]) > md) { md = Math.abs(h[i] - g[i]); at = i; }
      if (md > 15) console.log('штрих', n, 'длина', S[n - 1].toFixed(0), 'откл', md.toFixed(1), 'у', NX[V[at]].toFixed(0), NZ[V[at]].toFixed(0),
        'λmax', Math.max(...lam).toExponential(1), 'жёстких', [...w].filter(x => x > 1e6).length, 'h', h[at].toFixed(1), 'g', g[at].toFixed(1));
    }
    return { h, cwv };
  };
  // Узел двух трасс (развилка) и две проезжие части одной трассы
  // (поперечные рёбра) решаются отдельными штрихами — и расходятся на
  // полметра-метр: граф потом сводил их проекциями и ломал перелом.
  // Второй круг: в таких вершинах опора — среднее первого круга, с весом.
  const pin = new Float32Array(N), pinW = new Float32Array(N);
  const twin = new Map();
  for (let e = 0; e < NE; e++) if (EK[e] === 1) {
    (twin.get(EA[e]) || twin.set(EA[e], []).get(EA[e])).push(EB[e]);
    (twin.get(EB[e]) || twin.set(EB[e], []).get(EB[e])).push(EA[e]);
  }
  let res = strokes.map(st => solveStroke(st, v => G0[v], v => DW[v]));
  // Общие вершины штрихов (развилка, пересечение, две проезжие части) —
  // жёсткая общая отметка: важнейшая трасса задаёт её, равные — среднее.
  // Вес опоры 20 (было) не перебивал штраф кривизны, штрихи расходились на
  // метр, и среднее вставало в одной вершине горбом.
  let lastT = null, lastW = null;
  for (let round = 0; round < 3; round++) {
    const best = new Float32Array(N).fill(-1), sum = new Float64Array(N), cnt = new Float32Array(N), mult = new Uint8Array(N);
    strokes.forEach((st, k) => st.V.forEach((v, i) => {
      mult[v]++;
      if (st.imp > best[v] + 1e-6) { best[v] = st.imp; sum[v] = res[k].h[i]; cnt[v] = 1; }
      else if (st.imp > best[v] - 1e-6) { sum[v] += res[k].h[i]; cnt[v]++; }
    }));
    const val = v => sum[v] / cnt[v];
    // общая вершина — жёстко; пара проезжих частей — мягко (в развязке
    // «пары» находятся у всех съездов подряд, и жёсткие цели спорили бы)
    const tgt = new Map(), tw8 = new Map();
    lastT = tgt; lastW = tw8;
    for (let v = 0; v < N; v++) {
      if (!cnt[v]) continue;
      const tw = (twin.get(v) || []).filter(u => cnt[u]);
      if (mult[v] < 2 && !tw.length) continue;
      tgt.set(v, tw.length ? (val(v) + tw.reduce((a, u) => a + val(u), 0) / tw.length) / 2 : val(v));
      tw8.set(v, mult[v] >= 2 ? 1e7 : 300);
    }
    if (round === 2) break;
    res = strokes.map(st => solveStroke(st, v => tgt.has(v) ? tgt.get(v) : G0[v], v => tgt.has(v) ? tw8.get(v) : DW[v]));
  }
  if (arg('stroke')) {
    const [sx, sz] = arg('stroke').split(',').map(Number);
    strokes.forEach((st, k) => {
      const hit = st.V.findIndex(v => Math.hypot(NX[v] - sx, NZ[v] - sz) < 12);
      if (hit < 0) return;
      console.log('штрих', k, 'вершин', st.V.length, 'imp', st.imp);
      for (let i = Math.max(0, hit - 25); i < Math.min(st.V.length, hit + 25); i++) {
        const v = st.V[i];
        console.log('  ', i, v, NX[v].toFixed(0), NZ[v].toFixed(0), 's', st.S[i].toFixed(0), 'h', res[k].h[i].toFixed(2), 'g', G0[v].toFixed(2), 'raw', G0raw[v].toFixed(2), 'w', DW[v].toFixed(2), noData.has(v) ? 'нет' : '', clrL.includes(v) ? 'габ' : '', lastT && lastT.has(v) ? 'цель ' + lastT.get(v).toFixed(2) + ' в ' + lastW.get(v) : '');
      }
    });
  }
  let nV = 0;
  pin.fill(0); pinW.fill(0);
  strokes.forEach((st, k) => {
    const { h, cwv } = res[k], { V, S } = st, n = V.length;
    for (let i = 0; i < n; i++) {
      const v = V[i];
      pin[v] += h[i] * (1 - cwv[i]); pinW[v] += 1 - cwv[i];
      if (i > 0 && i < n - 1 && !cwv[i]) {
        const l1 = S[i] - S[i - 1], l2 = S[i + 1] - S[i];
        worstAll = Math.max(worstAll, Math.abs((h[i + 1] - h[i]) / l2 - (h[i] - h[i - 1]) / l1) / ((l1 + l2) / 2) * 20 * 100);
      }
    }
    nV += n;
  });
  // считаем, сколько раз вершина попала в штрихи с весом 1 − центр
  const mult = new Float32Array(N);
  strokes.forEach((st, k) => st.V.forEach((v, i) => { mult[v] += 1; }));
  for (let i = 0; i < N; i++) if (pinW[i] > 0) {
    const t = Math.min(1, pinW[i] / mult[i]);
    G0[i] = G0[i] * (1 - t) + pin[i] / pinW[i] * t;
    DW[i] = DW[i] * (1 - t) + 40 * t;
    // за центром трасса — граничное условие: граф её не двигает
    if (t > 0.999) PIN[i] = 1;
  }
  tlog(`трасс-штрихов ${strokes.length}, вершин ${nV}; худший перелом после одномерной задачи ${worstAll.toFixed(2)} п./20 м`);
}
const Hh = Float32Array.from(G0);
const mob = (v, imp) => PIN[v] ? 0 : imp >= nodeImp[v] - 1e-6 ? 1 : 0.08;
const bend = () => {
  for (let t = 0; t < NT; t++) {
    const a = TA[t], b = TB[t], d = TD[t], l1 = TL1[t], l2 = TL2[t];
    // перелом уклона на средней вершине
    const k = (Hh[d] - Hh[b]) / l2 - (Hh[b] - Hh[a]) / l1, lim = TLIM[t];
    if (k <= lim && k >= -lim) continue;
    const ex = k > 0 ? k - lim : k + lim;
    // сдвиг b на δ меняет перелом на −δ(1/l1 + 1/l2), a и d — на δ/l1 и δ/l2
    const imp = TI_[t], ma = mob(a, imp), mb = mob(b, imp), md = mob(d, imp);
    const kb = 1 / l1 + 1 / l2, den = kb * kb * mb + ma / (l1 * l1) + md / (l2 * l2);
    if (den <= 0) continue;
    const tt = ex / den;
    Hh[b] += tt * kb * mb; Hh[a] -= tt / l1 * ma; Hh[d] -= tt / l2 * md;
  }
};
// Перелом проверяется перед КАЖДЫМ проходом по уклонам, а не раз на три:
// иначе три прохода по уклону перебивали один по перелому, и на коротких
// рёбрах (4–5 м, Троллейбусный спуск) переломы оставались до 12%.
const project = () => {
  for (let pass = 0; pass < 3; pass++) {
    bend();
    clearance();
    for (let e = 0; e < NE; e++) {
      const a = EA[e], b = EB[e], d = Hh[a] - Hh[b], lim = EG[e] * EL[e];
      if (d <= lim && d >= -lim) continue;
      const imp = EI[e], ma = mob(a, imp), mb = mob(b, imp);
      if (ma + mb <= 0) continue;
      const ex = (d > 0 ? d - lim : d + lim) / (ma + mb);
      Hh[a] -= ex * ma; Hh[b] += ex * mb;
    }
  }
};
const IT1 = +arg('it', 900), IT2 = +arg('it2', 1200);
for (let it = 0; it < IT1; it++) {
  for (let i = 0; i < N; i++) {
    const dev = (Hh[i] - G0[i]) / 2;
    let s = 0, w = 0, cnt = 0;
    for (let k = deg[i]; k < deg[i + 1]; k++) { s += Hh[NB[k]] * NW[k]; w += NW[k]; cnt++; }
    // данные — в долях от суммы весов: у главной улицы сглаживание то же
    const wd = WD * (1 + dev * dev) * DW[i] * w / Math.max(1, cnt);
    T[i] = w ? (wd * G0[i] + s) / (wd + w) : G0[i];
  }
  // Якоби с релаксацией
  for (let i = 0; i < N; i++) if (!PIN[i]) Hh[i] = Hh[i] * 0.3 + T[i] * 0.7;
  if (it % 3 === 0) project();
  if (it % 100 === 99) tlog('сглаживание', it + 1);
}
// Доводка одними проекциями: 1200 кругов (было 120) — переломов сверх
// предела 83 → 2, худший 9.6% → 5.1%.
//
// ПРИВЯЗКА К ЗЕМЛЕ. Одни проекции без данных земли за 1200 кругов уводили
// целые районы: противоречивые тройки перелома (петли, стыки у площадей)
// толкали узел по кругу, и он уходил на метры — дрейф > 10 м у 233 вершин,
// до 225 м; узел на пл. Нахимова встал на −3.2 м при земле 11.8. Теперь
// доводка держит вершину в коридоре: между решением сглаживания и землёй,
// плюс ANCH м в обе стороны. Где ограничения с землёй несовместимы, лучше
// остаточный перелом, чем яма или насыпь в этаж.
const ANCH = +arg('anch', 3.0);
const HS = Float32Array.from(Hh);
const HLO = new Float32Array(N), HHI = new Float32Array(N);
for (let i = 0; i < N; i++) {
  if (PIN[i] || !DW[i]) { HLO[i] = -Infinity; HHI[i] = Infinity; continue; }
  HLO[i] = Math.min(Hh[i], G0[i]) - ANCH; HHI[i] = Math.max(Hh[i], G0[i]) + ANCH;
}
const clampH = () => { for (let i = 0; i < N; i++) { const h = Hh[i]; if (h < HLO[i]) Hh[i] = HLO[i]; else if (h > HHI[i]) Hh[i] = HHI[i]; } };
for (let k = 0; k < IT2; k++) { project(); clampH(); if (k % 300 === 299) tlog('доводка', k + 1); }
// итог: отклонение от земли и уклоны — по классам
const stats = {};
{
  const st = c => stats[c] || (stats[c] = { v: 0, dev2: 0, devMax: 0, over2: 0, eBad: 0, e: 0, tBad: 0, t: 0, kMax: 0 });
  const vc = new Uint8Array(N).fill(9);
  for (let e = 0; e < NE; e++) { if (EK[e]) continue; vc[EA[e]] = Math.min(vc[EA[e]], EC[e]); vc[EB[e]] = Math.min(vc[EB[e]], EC[e]); }
  for (let i = 0; i < N; i++) {
    if (noData.has(i)) continue;
    const s = st(vc[i]), d = Math.abs(Hh[i] - G0raw[i]);
    s.v++; s.dev2 += d * d; if (d > s.devMax) s.devMax = d; if (d > 2) s.over2++;
  }
  const ex = [];
  for (let e = 0; e < NE; e++) {
    if (EK[e]) continue;
    const s = st(EC[e]), gr = Math.abs(Hh[EA[e]] - Hh[EB[e]]) / EL[e];
    s.e++; if (gr > EG[e] + 0.01) { s.eBad++; if (ex.length < 6) ex.push(`${NX[EA[e]].toFixed(0)},${NZ[EA[e]].toFixed(0)} ${(gr * 100).toFixed(0)}% при ${(EG[e] * 100).toFixed(0)}%`); }
  }
  const tex = [];
  for (let t = 0; t < NT; t++) {
    const s = st(vc[TB[t]]);
    const k = Math.abs((Hh[TD[t]] - Hh[TB[t]]) / TL2[t] - (Hh[TB[t]] - Hh[TA[t]]) / TL1[t]);
    s.t++;
    if (k > TLIM[t] * 1.5 + 0.002) { s.tBad++; if (tex.length < 8) tex.push(`${NX[TB[t]].toFixed(0)},${NZ[TB[t]].toFixed(0)} ${(k * 100).toFixed(1)} при ${(TLIM[t] * 100).toFixed(1)}`); }
    // перелом на 20 м: для трасс — в пунктах на 20 м
    const per20 = k / ((TL1[t] + TL2[t]) / 2) * 20;
    if (per20 > s.kMax && Math.min(TL1[t], TL2[t]) >= 4) s.kMax = per20;
  }
  for (const [c, s] of Object.entries(stats))
    console.log(`класс ${c}: вершин ${s.v}, от земли ср.кв ${Math.sqrt(s.dev2 / Math.max(1, s.v)).toFixed(2)} м, макс ${s.devMax.toFixed(1)}, >2 м ${s.over2}; ` +
      `рёбер круче предела ${s.eBad} из ${s.e}; переломов сверх предела ×1.5 ${s.tBad} из ${s.t}, худший ${(s.kMax * 100).toFixed(1)} п./20 м`);
  console.log('уклон:', ex.join(' | '));
  {
    // дрейф от земли (вершины с данными; мосты, тоннели и край карты — нет)
    let d5 = 0, d10 = 0, dm = 0, at = '';
    for (let i = 0; i < N; i++) {
      if (noData.has(i) || nearBridge[i]) continue;
      const d = Math.abs(Hh[i] - G0raw[i]);
      if (d > 5) d5++; if (d > 10) d10++;
      if (d > dm) { dm = d; at = NX[i].toFixed(0) + ',' + NZ[i].toFixed(0); }
    }
    let nk = -1, nd = Infinity;
    for (let i = 0; i < N; i++) { const d = Math.hypot(NX[i] + 15, NZ[i] - 47); if (d < nd) { nd = d; nk = i; } }
    console.log(`от земли > 5 м: ${d5}, > 10 м: ${d10}, макс ${dm.toFixed(1)} у ${at}; пл. Нахимова (−15,47): H ${Hh[nk].toFixed(1)} при земле ${G0raw[nk].toFixed(1)}`);
  }
  {
    // две проезжие части: расхождение отметок по поперечным рёбрам
    const ds = [];
    for (let e = 0; e < NE; e++) if (EK[e] === 1) ds.push([Math.abs(Hh[EA[e]] - Hh[EB[e]]) - EG[e] * EL[e], e]);
    ds.sort((a, b) => b[0] - a[0]);
    const over = ds.filter(d => d[0] > 0.1).length;
    if (DBG) for (const [d, e] of ds.slice(0, 4)) console.log('  пара', EA[e], EB[e], 'H', Hh[EA[e]].toFixed(1), Hh[EB[e]].toFixed(1), 'G', G0raw[EA[e]].toFixed(1), G0raw[EB[e]].toFixed(1), 'pin', PIN[EA[e]], PIN[EB[e]], 'len', EL[e].toFixed(1));
    console.log(`поперечных рёбер ${ds.length}, сверх допуска на 10+ см ${over}; худшие:`, ds.slice(0, 5).map(([d, e]) => `${NX[EA[e]].toFixed(0)},${NZ[EA[e]].toFixed(0)} ${d.toFixed(2)} м`).join(' | '));
  }
  // Перелом на 20 м по осевым трасс за центром: уклон на 20 м до точки и
  // после неё, в пунктах. Требование — не больше 1.
  for (const cl of [0, 1]) {
    let len = 0, bad1 = 0, bad2 = 0, worst = 0, wAt = '';
    for (const c of chains) {
      if (c.r.c !== cl || c.r.br || c.r.tn) continue;
      const L = c.ss[c.ss.length - 1];
      if (L < 45) continue;
      let q = 0;
      const hAt = s => hOn(c.cv, s);
      for (let s = 20; s <= L - 20; s += 2) {
        while (q < c.ss.length - 2 && c.ss[q + 1] < s) q++;
        if (centerW(NX[c.ids[q]], NZ[c.ids[q]]) > 0) continue;
        const k = Math.abs((hAt(s + 20) - hAt(s)) / 20 - (hAt(s) - hAt(s - 20)) / 20) * 100;
        len += 2; if (k > 1) bad1 += 2; if (k > 2) bad2 += 2;
        if (k > worst) { worst = k; wAt = NX[c.ids[q]].toFixed(0) + ',' + NZ[c.ids[q]].toFixed(0); }
      }
    }
    console.log(`трассы класса ${cl}: ${(len / 1000).toFixed(0)} км, перелом > 1 п./20 м — ${(100 * bad1 / Math.max(1, len)).toFixed(1)}% длины, > 2 п. — ${(100 * bad2 / Math.max(1, len)).toFixed(1)}%, худший ${worst.toFixed(1)} у ${wAt}`);
  }
  if (arg('debug')) {
    const idx = [...Array(N).keys()].filter(i => !noData.has(i)).sort((a, b) => Math.abs(Hh[b] - G0raw[b]) - Math.abs(Hh[a] - G0raw[a]));
    const shown = [];
    for (const i of idx) {
      if (shown.some(j => Math.hypot(NX[i] - NX[j], NZ[i] - NZ[j]) < 1500)) continue;
      shown.push(i); if (shown.length > 14) break;
      console.log('откл', NX[i].toFixed(0), NZ[i].toFixed(0), 'H', Hh[i].toFixed(1), 'G0', G0raw[i].toFixed(1), 'raw', (raw(NX[i], NZ[i]) ?? NaN).toFixed(1), 'GS', GS[i].toFixed(1), 'pin', PIN[i]);
    }
  }
  console.log('перелом:', tex.join(' | '));
  if (arg('debug')) {
    const bad = [];
    for (let t = 0; t < NT; t++) {
      const k = Math.abs((Hh[TD[t]] - Hh[TB[t]]) / TL2[t] - (Hh[TB[t]] - Hh[TA[t]]) / TL1[t]);
      if (k > TLIM[t] * 3 + 0.01) bad.push([k, t]);
    }
    bad.sort((a, b) => b[0] - a[0]);
    for (const [k, t] of bad.slice(0, 6)) {
      const f = v => `${v}@${NX[v].toFixed(0)},${NZ[v].toFixed(0)} pin${PIN[v]} H${Hh[v].toFixed(2)}`;
      console.log('тройка', (k * 100).toFixed(1), 'l', TL1[t].toFixed(1), TL2[t].toFixed(1), '|', f(TA[t]), '|', f(TB[t]), '|', f(TD[t]), 'imp', TI_[t].toFixed(2));
    }
  }
}

// ---------------------------------------------------------------- выход
// Отметки по длине ОСЕВОЙ ВЫХОДА (у far.json она прорежена, но её точки —
// подмножество точек world.json): длину дуги выхода переводим в длину дуги
// графа через общие точки и берём отметку там. Шаг выхода — 8 м, последний
// отсчёт — в конце осевой. Сантиметры, разностями.
const byId = new Map(chains.map(c => [c.r.id, c]));
// ЦЕНТР — КАК В ROADS3/ROADS4. Квадрат центра 3×3 км настраивали по своему
// решателю (data/road-levels-roads3.json — его отметки, формат v1: s по осевой
// world.json, h); полный граф решает его чуть иначе, и на стенде центр и
// кольцо пл. Восставших выходили хуже (удары 27 → 71). В квадрате берём
// прежние отметки, на 200 м за краем — плавно к новым (вес как levelWeight
// прежнего рантайма).
const HC = existsSync(ROOT + 'data/road-levels-roads3.json') ? JSON.parse(readFileSync(ROOT + 'data/road-levels-roads3.json')) : null;
const hcAt = (id, s) => {
  const e = HC && HC.roads[id];
  if (!e) return null;
  const S = e.s, h = e.h, m = S.length;
  if (m === 1) return h[0];
  if (s <= S[0]) return h[0] + (h[1] - h[0]) / Math.max(0.5, S[1] - S[0]) * (s - S[0]);
  if (s >= S[m - 1]) return h[m - 1] + (h[m - 1] - h[m - 2]) / Math.max(0.5, S[m - 1] - S[m - 2]) * (s - S[m - 1]);
  let lo = 0, hi = m - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (S[mid] <= s) lo = mid; else hi = mid; }
  const t = (s - S[lo]) / Math.max(1e-6, S[hi] - S[lo]);
  const h0 = h[Math.max(0, lo - 1)], h1 = h[lo], h2 = h[hi], h3 = h[Math.min(m - 1, hi + 1)];
  const m1 = (h2 - h0) / 2, m2 = (h3 - h1) / 2, t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * h1 + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * h2 + (t3 - t2) * m2;
};
let nHC = 0;
const levelsFor = (c, pts) => {
  const wp = c.r.pts, n = pts.length / 2;
  // s графа в точках OSM
  const sw = new Float64Array(n);
  let j = 0;
  for (let k = 0; k < n; k++) {
    const x = pts[k * 2], z = pts[k * 2 + 1];
    while (j < wp.length / 2 && (wp[j * 2] !== x || wp[j * 2 + 1] !== z)) j++;
    if (j >= wp.length / 2) return null;
    sw[k] = c.sk[j];
  }
  const so = new Float64Array(n);
  for (let k = 1; k < n; k++) so[k] = so[k - 1] + Math.hypot(pts[k * 2] - pts[k * 2 - 2], pts[k * 2 + 1] - pts[k * 2 - 1]);
  const L = so[n - 1];
  const m = Math.max(2, Math.ceil(L / STEP - 1e-6) + 1);
  const out = [];
  let seg = 0, q = 0;
  for (let i = 0; i < m; i++) {
    const s = Math.min(L, i * STEP);
    while (seg < n - 2 && so[seg + 1] < s) seg++;
    const t = so[seg + 1] > so[seg] ? (s - so[seg]) / (so[seg + 1] - so[seg]) : 0;
    const swv = sw[seg] + (sw[seg + 1] - sw[seg]) * t;
    let hv = hOn(c.cv, swv);
    if (HC) {
      const x = pts[seg * 2] + (pts[seg * 2 + 2] - pts[seg * 2]) * t, z = pts[seg * 2 + 1] + (pts[seg * 2 + 3] - pts[seg * 2 + 1]) * t;
      const w = centerW(x, z);
      if (w > 0) { const ho = hcAt(c.r.id, swv); if (ho !== null) { hv = ho * w + hv * (1 - w); if (i === 0) nHC++; } }
    }
    out.push(hv);
  }
  const cm = out.map(v => Math.round(v * 100));
  const enc = [cm[0]];
  for (let i = 1; i < cm.length; i++) enc.push(cm[i] - cm[i - 1]);
  return enc;
};
const out = {
  _: 'Отметки улиц по графу (tools/build-road-levels.mjs). roads: id → отметки по длине осевой far.json с шагом step м, ' +
     'сантиметры: первая — сама, дальше разности. junctions: x, z, r (дм), a (см), bx, bz (1e-4), пятно (дм от центра). ' +
     'yards: квадраты data/road-levels/<cx>_<cz>.json с дворовыми проездами вне far.json.',
  v: 2, step: STEP, box: BOX, ramp: 200, roads: {}, junctions: [], yards: [],
  // квадрат центра: рантайм там ведёт коридор по-старому (centerWeight)
  center: HC ? { ...CENTER, ramp: CRAMP } : null,
};
let nFar = 0, nMiss = 0;
const farIds = new Set();
// Мосты far.json. В дальнем слое нет флага моста, и коридор вдавливал их в
// землю как обычные улицы. С отметками графа полотно моста висит над
// оврагом или над трассой — и его плато в коридоре тянуло трассу под ним
// на 2–3 м вверх (развязка у 48376, 15200). Рантайм мосты в коридор не берёт.
const worldBr = new Set(W.roads.filter(r => r.br).map(r => r.id));
out.bridges = FAR.roads.filter(r => worldBr.has(r.id)).map(r => r.id);
// осевые мостов: полотно моста в рантайме — по отметкам (bridgeLevelAt), а
// в чанках мост бывает нарезан на куски со своими id
out.bridgePts = Object.fromEntries(FAR.roads.filter(r => worldBr.has(r.id)).map(r => [r.id, r.pts]));
for (const r of FAR.roads) {
  farIds.add(r.id);
  if (r.c > 3) continue;
  const c = byId.get(r.id);
  if (!c) { if (!BOX && !r.tn) nMiss++; continue; }
  const lv = levelsFor(c, r.pts);
  if (!lv) { nMiss++; continue; }
  out.roads[r.id] = lv; nFar++;
}
tlog(`улиц far.json с отметками ${nFar}, без — ${nMiss}; из них с отметками центра ${nHC}`);
// ПЛОСКОСТИ ПЕРЕКРЁСТКОВ. Полотна узла накладываются друг на друга, и
// поверхность коридора в узле — склейка плато разных улиц: не плоскость.
// Треугольник поперёк улицы шириной 10 м ложился хордой на 9–12 см выше
// соседних полотен — колесо ловило ступеньку. Каждому перекрёстку даём
// плоскость по отметкам подходящих к нему улиц (наименьшие квадраты в круге
// r + 5 м), рантайм кладёт её в коридор.
{
  const G = 20, g = new Map();
  const HCJ = new Map((HC ? HC.junctions : []).map(o => [Math.round(o[0] * 10) + ',' + Math.round(o[1] * 10), o]));
  // полотно моста — не опора плоскости перекрёстка под ним (у путепровода
  // DW ≠ 0: опора габарита)
  for (let i = 0; i < N; i++) { if (!DW[i] || noData.has(i)) continue; const k = Math.floor(NX[i] / G) * 100003 + Math.floor(NZ[i] / G); let l = g.get(k); if (!l) g.set(k, l = []); l.push(i); }
  for (const j of W.junctions) {
    if (BOX && (j.x < BOX.x0 - MARGIN / 2 || j.x > BOX.x1 + MARGIN / 2 || j.z < BOX.z0 - MARGIN / 2 || j.z > BOX.z1 + MARGIN / 2)) continue;
    if ((j.mw || 0) < 5) continue;
    // За центром узел — одна вершина, соседние точки улиц в 8 м за пятном:
    // в круге r + 5 м их одна-две, и наклон не определялся. Берём r + 16 м.
    const jcw = centerW(j.x, j.z);
    const R = Math.min(30, j.r) + (jcw >= 1 ? 5 : 16);
    let n = 0, sx = 0, sz = 0, sh = 0, sxx = 0, szz = 0, sxz = 0, sxh = 0, szh = 0;
    for (let a = Math.floor((j.x - R) / G); a <= Math.floor((j.x + R) / G); a++)
      for (let b = Math.floor((j.z - R) / G); b <= Math.floor((j.z + R) / G); b++)
        for (const i of g.get(a * 100003 + b) || []) {
          const x = NX[i] - j.x, z = NZ[i] - j.z;
          if (x * x + z * z > R * R) continue;
          // Вес — квадрат значимости улицы: плоскость ведёт главная улица,
          // переулок лишь задаёт поперечный наклон. Поровну плоскость
          // проваливала Большую Морскую на перекрёстке на полметра.
          const q = nodeImp[i] * nodeImp[i];
          n += q; sx += x * q; sz += z * q; sh += Hh[i] * q; sxx += x * x * q; szz += z * z * q; sxz += x * z * q; sxh += x * Hh[i] * q; szh += z * Hh[i] * q;
        }
    if (n <= 0) continue;
    let a0 = sh / n, bx = 0, bz = 0;
    // Гребень (ε·n на наклоны): если точки легли в одну линию (одна улица
    // через узел), система вырождена, и плоскость выходила ГОРИЗОНТАЛЬНОЙ —
    // плато поперёк улицы на уклоне 3–5%, ступенька в метр (Хрусталёва, −290, 6470).
    // С гребнем наклон вдоль улицы берётся по ней, поперёк — ноль.
    const eps = jcw >= 1 ? 0 : 2 * n;
    const sol = solve3([[n, sx, sz], [sx, sxx + eps, sxz], [sz, sxz, szz + eps]], [sh, sxh, szh]);
    if (sol) [a0, bx, bz] = sol;
    // плоскость не круче 12%
    const gl = Math.hypot(bx, bz);
    if (gl > 0.12) { bx *= 0.12 / gl; bz *= 0.12 / gl; }
    // центр: плоскость прежнего решателя (та же точка узла)
    if (HC && jcw > 0) {
      const o = HCJ.get(Math.round(j.x * 10) + ',' + Math.round(j.z * 10));
      if (o) { a0 = o[3] * jcw + a0 * (1 - jcw); bx = o[4] * jcw + bx * (1 - jcw); bz = o[5] * jcw + bz * (1 - jcw); }
    }
    const poly = j.poly ? j.poly.map((v, k) => Math.round((v - (k % 2 ? j.z : j.x)) * 10)) : null;
    out.junctions.push([Math.round(j.x * 10), Math.round(j.z * 10), Math.round(Math.min(30, j.r) * 10),
      Math.round(a0 * 100), Math.round(bx * 1e4), Math.round(bz * 1e4), poly]);
  }
  tlog('плоскостей перекрёстков', out.junctions.length, HC ? '(центр — из road-levels-roads3.json)' : '');
}
// ДВОРОВЫЕ ПРОЕЗДЫ вне far.json — по квадратам 1024 м, с осевой. Проезд
// кладётся в каждый квадрат, который задевает его рамка + 64 м (как чанки):
// квадрат земли берёт проезды своих девяти квадратов, и у соседей по шву
// набор проездов у шва один и тот же.
const YDIR = ROOT + 'data/road-levels/';
const yards = new Map();
let nYard = 0, rank = 0;
for (const c of chains) {
  const r = c.r;
  if (r.c !== 3 || r.br || r.tn || farIds.has(r.id)) continue;
  const lv = levelsFor(c, r.pts);
  if (!lv) continue;
  let a = Infinity, b = Infinity, cc = -Infinity, d = -Infinity;
  for (let i = 0; i < r.pts.length; i += 2) { a = Math.min(a, r.pts[i]); cc = Math.max(cc, r.pts[i]); b = Math.min(b, r.pts[i + 1]); d = Math.max(d, r.pts[i + 1]); }
  const o = { id: r.id, c: 3, w: r.w, rk: rank++, pts: r.pts, lv };
  for (let i = Math.floor((a - 64) / 1024); i <= Math.floor((cc + 64) / 1024); i++)
    for (let j = Math.floor((b - 64) / 1024); j <= Math.floor((d + 64) / 1024); j++) {
      const k = i + '_' + j; (yards.get(k) || yards.set(k, []).get(k)).push(o);
    }
  nYard++;
}
if (!BOX) {
  if (existsSync(YDIR)) rmSync(YDIR, { recursive: true });
  mkdirSync(YDIR, { recursive: true });
  let bytes = 0;
  for (const [k, l] of yards) {
    const s = JSON.stringify({ roads: l });
    writeFileSync(YDIR + k + '.json', s); bytes += s.length;
    out.yards.push(k);
  }
  out.yards.sort();
  tlog(`дворовых проездов ${nYard} в ${yards.size} квадратах, ${(bytes / 1e6).toFixed(2)} МБ`);
}
out.stats = stats;
if (arg('viol')) {
  const [x0, x1, z0, z1] = arg('viol').split(',').map(Number);
  const inb = i => NX[i] > x0 && NX[i] < x1 && NZ[i] > z0 && NZ[i] < z1;
  const nm = i => { for (const c of chains) if (c.ids.includes(i)) return (c.r.n || c.r.id) + ' c' + c.r.c; return '?'; };
  const L = [];
  for (let t = 0; t < NT; t++) {
    if (!inb(TB[t])) continue;
    const k = (Hh[TD[t]] - Hh[TB[t]]) / TL2[t] - (Hh[TB[t]] - Hh[TA[t]]) / TL1[t];
    const ex = Math.abs(k) - TLIM[t];
    if (ex > 0.01) L.push([ex, 'T', TB[t], (k * 100).toFixed(1) + '/' + (TLIM[t] * 100).toFixed(1), TL1[t].toFixed(1), TL2[t].toFixed(1)]);
  }
  for (let e = 0; e < NE; e++) {
    if (!inb(EA[e])) continue;
    const g = Math.abs(Hh[EA[e]] - Hh[EB[e]]) / EL[e], ex = g - EG[e];
    if (ex > 0.01) L.push([ex, 'E' + EK[e], EA[e], (g * 100).toFixed(1) + '/' + (EG[e] * 100).toFixed(1), EL[e].toFixed(1)]);
  }
  L.sort((a, b) => b[0] - a[0]);
  console.log('нарушений', L.length);
  for (const r of L.slice(0, 25)) { const i = r[2]; console.log(r[1], NX[i].toFixed(0), NZ[i].toFixed(0), 'H', Hh[i].toFixed(1), 'G', G0raw[i].toFixed(1), 'Hs', HS[i].toFixed(1), r.slice(3).join(' '), nm(i)); }
}
if (arg('probe')) {
  const [px, pz, pr] = arg('probe').split(',').map(Number);
  const near = new Set();
  for (let i = 0; i < N; i++) if (Math.hypot(NX[i] - px, NZ[i] - pz) < (pr || 25)) near.add(i);
  const nm = i => { for (const c of chains) if (c.ids.includes(i)) return (c.r.n || c.r.id) + ' c' + c.r.c; return '?'; };
  for (const i of near) console.log('v', i, NX[i].toFixed(1), NZ[i].toFixed(1), 'H', Hh[i].toFixed(2), 'Hs', HS[i].toFixed(2), 'G', G0raw[i].toFixed(2), 'G0', G0[i].toFixed(2), 'DW', DW[i].toFixed(2), 'pin', PIN[i], 'imp', nodeImp[i].toFixed(2), nm(i));
  for (let t = 0; t < NT; t++) {
    if (!near.has(TB[t])) continue;
    const k = (Hh[TD[t]] - Hh[TB[t]]) / TL2[t] - (Hh[TB[t]] - Hh[TA[t]]) / TL1[t];
    if (Math.abs(k) > TLIM[t] * 1.2) console.log('  тройка', TA[t], TB[t], TD[t], 'k', (k * 100).toFixed(1), 'lim', (TLIM[t] * 100).toFixed(1), 'l', TL1[t].toFixed(1), TL2[t].toFixed(1), 'imp', TI_[t]);
  }
  for (let e = 0; e < NE; e++) if (near.has(EA[e]) || near.has(EB[e])) {
    const g = Math.abs(Hh[EA[e]] - Hh[EB[e]]) / EL[e];
    if (EK[e] || g > EG[e] + 0.005) console.log('  ребро', EA[e], EB[e], 'kind', EK[e], 'g', (g * 100).toFixed(1), 'lim', (EG[e] * 100).toFixed(1), 'L', EL[e].toFixed(1), 'imp', EI[e].toFixed(2));
  }
}
const OUT = arg('out', ROOT + 'data/road-levels.json');
writeFileSync(OUT, JSON.stringify(out));
tlog('записано', OUT, (JSON.stringify(out).length / 1e6).toFixed(2), 'МБ');
