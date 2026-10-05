// Заезды бота по длинным маршрутам: где дорога неиграбельна.
//
// check-physics гоняет машину по одной улице в центре. Здесь — маршруты на
// десятки километров (трасса на Ялту, выезды 5-го и 7-го км, районы):
// маршрут собирается по графу улиц world.json через опорные точки, режется на
// участки по ~1 км, на каждый участок прыгаем, ждём землю под ним и проезжаем
// его ботом на 60 и 100 км/ч, шагая физику напрямую (как check-physics).
//
// Что меряем на участке:
//   • профиль езды (driveHeightAt) по осевой с шагом 0.25 м: ступени > 5 см,
//     переломы уклона > 5 п. на 4 м, «гребни» — где на 60 км/ч колёса
//     оторвутся (v²·h'' < −g на базе 4 м);
//   • заезд: время в воздухе, отрывы, удары |ay| > 0.5 g (вертикальное
//     ускорение кузова), сход с полотна.
// Длина маршрута бьётся на корзины по 50 м: корзина «играбельна», если на 60
// км/ч в ней нет ни удара > 0.5 g, ни полёта. Процент — по длине.
//
//   python3 tools/serve.py 5231 .
//   node tools/check-drive-long.mjs --port 5231 --json out.json [--only yalta,kamysh] [--speeds 60,100]
//
// Playwright — как в check-physics (переменная PLAYWRIGHT или известный путь).
import { readFileSync, writeFileSync } from 'node:fs';
import { project } from './config.mjs';

const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : def; };
const PORT = arg('port', '5231');
const JSON_OUT = arg('json', '');
const ONLY = arg('only', '');
const SPEEDS = arg('speeds', '60,100').split(',').map(Number);
const SECTION = +arg('section', 1000);
const MAXSEC = +arg('maxsec', 1e9);
const FROM = +arg('from', 0);             // с какого участка (для отладки)          // для отладки: не больше N участков на маршрут
const ROOT = new URL('..', import.meta.url).pathname;

// ---------------------------------------------------------------- маршруты
const W = JSON.parse(readFileSync(ROOT + 'data/world.json', 'utf8'));
const pen = { 0: 1, 1: 1.05, 2: 1.3, 3: 3 };
const key = (x, z) => Math.round(x * 2) + ',' + Math.round(z * 2);
const NX = [], NZ = [], idOf = new Map(), adj = [];
const nodeAt = (x, z) => {
  const k = key(x, z);
  let i = idOf.get(k);
  if (i === undefined) { i = NX.length; idOf.set(k, i); NX.push(x); NZ.push(z); adj.push([]); }
  return i;
};
for (const r of W.roads) {
  if (r.c > 3) continue;
  const p = r.pts;
  let prev = -1;
  for (let k = 0; k < p.length; k += 2) {
    const i = nodeAt(p[k], p[k + 1]);
    if (prev >= 0 && prev !== i) {
      const L = Math.hypot(NX[i] - NX[prev], NZ[i] - NZ[prev]);
      adj[prev].push(i, L, r.c); adj[i].push(prev, L, r.c);
    }
    prev = i;
  }
}
const nearestNode = (x, z, maxC = 1) => {
  let best = -1, bd = Infinity;
  for (let i = 0; i < NX.length; i++) {
    const l = adj[i]; let ok = false;
    for (let k = 2; k < l.length; k += 3) if (l[k] <= maxC) { ok = true; break; }
    if (!ok) continue;
    const d = (NX[i] - x) ** 2 + (NZ[i] - z) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
};
// Дейкстра на двоичной куче
let allow = null;               // фильтр вершин (для трассы — коридор вдоль осевой)
let penT = pen;                  // цена метра по классу — для квартальных маршрутов своя
const path = (a, b, maxC) => {
  const n = NX.length, dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1);
  const heap = [[0, a]]; dist[a] = 0;
  const push = e => { heap.push(e); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const t = heap[0], l = heap.pop(); if (heap.length) { heap[0] = l; let i = 0; for (;;) { const a2 = 2 * i + 1, b2 = a2 + 1; let m = i; if (a2 < heap.length && heap[a2][0] < heap[m][0]) m = a2; if (b2 < heap.length && heap[b2][0] < heap[m][0]) m = b2; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return t; };
  while (heap.length) {
    const [d, u] = pop();
    if (u === b) break;
    if (d > dist[u]) continue;
    const l = adj[u];
    for (let k = 0; k < l.length; k += 3) {
      if (l[k + 2] > maxC) continue;
      if (allow && !allow(l[k])) continue;
      const v = l[k], nd = d + l[k + 1] * penT[l[k + 2]];
      if (nd < dist[v]) { dist[v] = nd; prev[v] = u; push([nd, v]); }
    }
  }
  if (!isFinite(dist[b])) return null;
  const out = [];
  for (let u = b; u >= 0; u = prev[u]) out.push(u);
  return out.reverse();
};
const routeThrough = (wps, maxC = 2, snapC = 1) => {
  const ids = wps.map(([x, z]) => nearestNode(x, z, snapC));
  let pts = [];
  for (let i = 1; i < ids.length; i++) {
    const p = path(ids[i - 1], ids[i], maxC);
    if (!p) { console.warn('нет пути', wps[i - 1], wps[i]); continue; }
    for (const u of (pts.length ? p.slice(1) : p)) pts.push([NX[u], NZ[u]]);
  }
  return pts;
};
// концы улицы по имени: самая далёкая пара точек
const ends = (name) => {
  const P = [];
  for (const r of W.roads) if (r.n === name && r.c <= 2) for (let k = 0; k < r.pts.length; k += 2) P.push([r.pts[k], r.pts[k + 1]]);
  let a = P[0], b = P[0], bd = 0;
  for (const p of P) { const d = Math.hypot(p[0] - P[0][0], p[1] - P[0][1]); if (d > bd) { bd = d; a = p; } }
  bd = 0; for (const p of P) { const d = Math.hypot(p[0] - a[0], p[1] - a[1]); if (d > bd) { bd = d; b = p; } }
  return [a, b];
};
const ll = (lat, lon) => { const p = project(lat, lon); return [p.x, p.z]; };

const ROUTES = {
  // Трасса: опорные точки — осевая data/route-yalta.json через каждые ~3 км,
  // от города к концу карты.
  // Точки осевой лежат вперемешку, поэтому путь ищем от ближнего к центру
  // конца до самого восточного, но только по вершинам в 250 м от осевой.
  yalta: () => {
    const R = JSON.parse(readFileSync(ROOT + 'data/route-yalta.json', 'utf8')).pts.map(([a, b]) => ll(a, b));
    const g = new Set();
    for (const [x, z] of R) for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) g.add((Math.floor(x / 100) + i) + ',' + (Math.floor(z / 100) + j));
    allow = v => g.has(Math.floor(NX[v] / 100) + ',' + Math.floor(NZ[v] / 100));
    let a = R[0], b = R[0];
    for (const p of R) { if (Math.hypot(...p) < Math.hypot(...a)) a = p; if (p[0] > b[0]) b = p; }
    const out = routeThrough([a, b], 2, 1);
    allow = null;
    return out;
  },
  kamysh: () => routeThrough(ends('Камышовое шоссе'), 2, 1),
  fiolent: () => routeThrough(ends('Фиолентовское шоссе'), 2, 1),
  ostryakova: () => routeThrough(ends('проспект Генерала Острякова'), 2, 1),
  pobedy: () => routeThrough(ends('проспект Победы'), 2, 2),
  // 7-й км → Балаклава
  balaklava: () => routeThrough([ends('Балаклавское шоссе')[0], ll(44.4995, 33.5990)], 2, 2),
  // Развязка 7-го км (≈ 600…1000, 7350…8000): Острякова → Балаклавское ш.,
  // Хрусталёва → Монастырское ш., Моргунова → Камышовое ш., Городское ш.
  km7_ostr: () => routeThrough([[-97, 5598], [614, 7370], [967, 8002], [1754, 9053]], 2, 1),
  km7_hrust: () => routeThrough([[-464, 5626], [121, 7422], [-792, 8988]], 2, 1),
  km7_morg: () => routeThrough([[2312, 6771], [741, 7361], [170, 7432], [-1496, 6964]], 2, 1),
  km7_gor: () => routeThrough([[408, 7007], [762, 7771], [964, 7912], [1115, 8116], [1181, 8229]], 2, 1),
  severnaya: () => routeThrough(ends('улица Богданова'), 2, 1),
  korabelnaya: () => routeThrough([...ends('улица Героев Севастополя'), ...ends('улица Генерала Жидилова')], 2, 1),
  gagarin: () => routeThrough([...ends('проспект Октябрьской Революции'), ...ends('проспект Гагарина')], 2, 1),
  // Центр: пл. Нахимова → пр. Нахимова → пл. Лазарева → Большая Морская → Ленина обратно
  center: () => routeThrough([[-41, 4], [-422, 533], [-389, 623], [-139, 1639], [-14, 50]], 2, 1),
  // пл. Лазарева → кольцо на пл. Восставших (круг)
  vosst: () => routeThrough([[-422, 533], [-762, 1615], [-833, 1616], [-842, 1661], [-791, 1651], [-762, 1615]], 2, 1),
  // Кварталы: по улицам и проездам (класс 2–3), магистрали — в обход.
  ...Object.fromEntries([
    ['q_severnaya', [[3600, -2600], [5200, -1500], [6400, -2600]]],
    ['q_gagarin', [[-4700, 3600], [-3900, 2700], [-3000, 3600]]],
    ['q_korabelnaya', [[2300, 1300], [3000, 400], [3800, 1100]]],
    ['q_center', [[-500, 1500], [100, 2100], [600, 2500]]],
    ['q_kamyshovaya', [[-6500, 5200], [-5600, 6200], [-6800, 6800]]],
  ].map(([n, w]) => [n, () => { penT = { 0: 3, 1: 2, 2: 1, 3: 1.15 }; const r = routeThrough(w, 3, 3); penT = pen; return r; }])),
};

const routes = [];
for (const [name, fn] of Object.entries(ROUTES)) {
  if (ONLY && !ONLY.split(',').includes(name)) continue;
  const pts = fn();
  let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  // участки по SECTION м
  const secs = [];
  let cur = [pts[0]], acc = 0;
  for (let i = 1; i < pts.length; i++) {
    cur.push(pts[i]); acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (acc >= SECTION || i === pts.length - 1) { if (acc > 60) secs.push(cur); cur = [pts[i]]; acc = 0; }
  }
  routes.push({ name, lengthM: Math.round(L), secs: secs.slice(FROM, FROM + MAXSEC) });
  if (arg('dump', '')) writeFileSync(arg('dump') + '/routes-' + name + '.json', JSON.stringify(secs));
  console.log(`${name}: ${(L / 1000).toFixed(1)} км, участков ${secs.length}`);
}

// ---------------------------------------------------------------- браузер
async function loadPlaywright() {
  for (const t of [process.env.PLAYWRIGHT, 'playwright', '/Users/aleksandrkanakov/Downloads/domiro/node_modules/playwright/index.mjs'].filter(Boolean)) {
    try { return await import(t); } catch { /* следующий */ }
  }
  throw new Error('playwright не найден');
}
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e).slice(0, 300)));
const s0 = routes[0].secs[0][0];
await page.goto(`http://127.0.0.1:${PORT}/web/?radius=700&ground=1300`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.G && window.G.car, null, { timeout: 240000 });

await page.evaluate(() => {
  const G = window.G;
  if (!G.__real) { G.__real = G.car.update.bind(G.car); G.car.update = () => {}; }
});

const result = {};
for (const R of routes) {
  const out = { lengthM: R.lengthM, secs: [] };
  for (let si = 0; si < R.secs.length; si++) {
    const sec = R.secs[si];
    const r = await page.evaluate(async ({ sec, SPEEDS }) => {
      const G = window.G, T = G.terrain, car = G.car, DT = 1 / 60, G0 = 9.81, KMH = 3.6;
      const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
      const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
      const idle = ms => new Promise(r => setTimeout(r, ms));
      // ждём землю под всеми точками участка
      G.jumpTo(sec[0][0], sec[0][1]);
      const probe = [];
      for (let i = 0; i < sec.length; i += Math.max(1, Math.floor(sec.length / 12))) probe.push(sec[i]);
      probe.push(sec[sec.length - 1]);
      // Земля под всем участком — до 300 с; не встала — прыгаем ещё раз.
      // Без этого участок мерился по наполовину собранной земле: коридора
      // нет, колесо на сырой сетке — «удары», которых в игре нет.
      let ready = false;
      for (let i = 0; i < 1500 && !ready; i++) {
        await idle(200);
        // Кварталы (мосты, нарисованный асфальт) не ждём: с ними участок
        // собирается минутами. Ждём квартал только под первой точкой; мосты
        // дальше по участку стенд видит, только если квартал успел приехать.
        ready = probe.every(([x, z]) => T.surfaceAt(x, z)) && (G.chunks.has(G.chunks.keyAt(sec[0][0], sec[0][1])) || !G.chunks.cells.has(G.chunks.keyAt(sec[0][0], sec[0][1])));
        if ((i === 400 || i === 900) && !ready) G.jumpTo(sec[0][0], sec[0][1]);
      }
      await idle(300);
      // осевая с шагом 0.25 м
      const H = [], XZ = [], S = [], step = 0.25;
      let s = 0;
      for (let k = 1; k < sec.length; k++) {
        const a = sec[k - 1], b = sec[k], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        for (let d = 0; d < L; d += step) {
          const x = a[0] + (b[0] - a[0]) * d / L, z = a[1] + (b[1] - a[1]) * d / L;
          // как колесо (vehicle._hAt): полотно путепровода над головой — не опора
          let hh = T.driveHeightAt(x, z);
          if (H.length && hh > H[H.length - 1] + 1.9 && T.groundDriveHeightAt) hh = Math.min(hh, T.groundDriveHeightAt(x, z));
          H.push(hh); XZ.push([x, z]); S.push(s + d);
        }
        s += L;
      }
      const len = s;
      const ev = [];          // [s, тип]
      let steps5 = 0, kinks5 = 0, crest60 = 0, onCorr = 0;
      for (let i = 1; i < H.length; i++) if (Math.abs(H[i] - H[i - 1]) > 0.05) { steps5++; ev.push([S[i], 'step']); }
      const v60 = 60 / KMH;
      for (let i = 16; i + 16 < H.length; i += 2) {
        const g1 = (H[i] - H[i - 16]) / 4, g2 = (H[i + 16] - H[i]) / 4, k = g2 - g1;
        if (Math.abs(k) > 0.05) { kinks5++; ev.push([S[i], 'kink']); }
        if (k / 4 * v60 * v60 < -G0) { crest60++; ev.push([S[i], 'crest']); }
      }
      for (let i = 0; i < XZ.length; i += 20) if (T.corridorAt(XZ[i][0], XZ[i][1]) !== null) onCorr++;
      const res = { mode: G.mode, len: Math.round(len), ready, steps5, kinks5, crest60, corrPct: Math.round(100 * onCorr / Math.max(1, Math.ceil(XZ.length / 20))), runs: {}, ev: [] };
      for (const e of ev) res.ev.push([Math.round(e[0]), e[1]]);
      // заезды
      for (const kmh of SPEEDS) {
        const yaw0 = Math.atan2(sec[1][0] - sec[0][0], sec[1][1] - sec[0][1]);
        car.reset(sec[0][0], sec[0][1], yaw0, kmh / KMH);
        let px = car.pos.x, pz = car.pos.z, py = car.pos.y, pvy = 0, dist = 0, t = 0, seg = 1, off = 0, n = 0, wasAir = false;
        const run = { air: 0, launches: 0, jolts: 0, aMax: 0, lost: false, dist: 0, ev: [] };
        // ход вдоль маршрута: проекция на ломаную, чтобы корзины были по длине осевой
        const cum = [0]; for (let k = 1; k < sec.length; k++) cum.push(cum[k - 1] + Math.hypot(sec[k][0] - sec[k - 1][0], sec[k][1] - sec[k - 1][1]));
        while (seg < sec.length && t < 200) {
          let need = 7 + Math.hypot(car.pos.x - px, car.pos.z - pz) / DT * 0.35, k = seg, cx = car.pos.x, cz = car.pos.z, tx = sec[k][0], tz = sec[k][1];
          while (k < sec.length) { const d = Math.hypot(sec[k][0] - cx, sec[k][1] - cz); if (d >= need) { tx = cx + (sec[k][0] - cx) * need / d; tz = cz + (sec[k][1] - cz) * need / d; break; } need -= d; cx = sec[k][0]; cz = sec[k][1]; tx = cx; tz = cz; k++; }
          if (Math.hypot(sec[seg][0] - car.pos.x, sec[seg][1] - car.pos.z) < 6) { seg++; continue; }
          const v = Math.hypot(car.pos.x - px, car.pos.z - pz) / DT;
          const err = wrap(Math.atan2(tx - car.pos.x, tz - car.pos.z) - car.yaw);
          // перед поворотом сбрасываем: меряем дорогу, а не вылеты
          const vt = Math.min(kmh / KMH, 6 + 3.5 / (Math.abs(err) + 0.02));
          px = car.pos.x; pz = car.pos.z;
          G.__real(DT, { throttle: clamp((vt - v) * 0.6, -1, 1), steer: clamp(err * 2.2, -1, 1), handbrake: false, gas: false, brake: false });
          t += DT; n++;
          const d = Math.hypot(car.pos.x - px, car.pos.z - pz); dist += d;
          const vy = (car.pos.y - py) / DT, ay = (vy - pvy) / DT; py = car.pos.y; pvy = vy;
          const sNow = cum[Math.max(0, seg - 1)] + Math.min(Math.hypot(car.pos.x - sec[seg - 1][0], car.pos.z - sec[seg - 1][1]), cum[seg] - cum[seg - 1]);
          if (dist > 40) {
            if (Math.abs(ay) > 0.5 * G0) { run.jolts++; run.ev.push([Math.round(sNow), 'jolt', +(ay / G0).toFixed(2), Math.round(car.pos.x), Math.round(car.pos.z)]); }
            run.aMax = Math.max(run.aMax, Math.abs(ay) / G0);
            if (car.airborne) { run.air += DT; if (!wasAir) { if (vy > 0.5) run.launches++; run.ev.push([Math.round(sNow), 'air', +vy.toFixed(2), Math.round(car.pos.x), Math.round(car.pos.z)]); } }
          }
          wasAir = car.airborne;
          off = T.corridorAt(car.pos.x, car.pos.z) === null && !T.deckAt(car.pos.x, car.pos.z) ? off + DT : 0;
          if (off > 1.5) { run.lost = Math.round(sNow); break; }
          if (n % 120 === 0) await idle(0);
        }
        run.done = seg >= sec.length; run.dist = Math.round(dist); run.air = +run.air.toFixed(2); run.aMax = +run.aMax.toFixed(2); run.t = +t.toFixed(1);
        res.runs[kmh] = run;
      }
      return res;
    }, { sec, SPEEDS });
    r.at = sec[0].map(Math.round);
    out.secs.push(r);
    const f = k => r.runs[k] ? `${k}: возд ${r.runs[k].air}с отр ${r.runs[k].launches} уд ${r.runs[k].jolts}${r.runs[k].lost !== false ? ' СХОД@' + r.runs[k].lost : ''}` : '';
    console.log(`${R.name} #${si} ${r.at} ${r.len}м ${r.ready ? '' : 'НЕ ГОТОВ '}корр ${r.corrPct}% ступ ${r.steps5} перел ${r.kinks5} греб ${r.crest60} | ${SPEEDS.map(f).join(' | ')}`);
  }
  // корзины по 50 м
  let good = 0, all = 0, good100 = 0, all100 = 0;
  for (const sct of out.secs) {
    if (!sct.ready) continue;                // участок не собрался — не в зачёт
    const nb = Math.max(1, Math.round(sct.len / 50));
    for (const [kmh, run] of Object.entries(sct.runs)) {
      const bad = new Set();
      for (const e of run.ev) bad.add(Math.min(nb - 1, Math.floor(e[0] / 50)));
      // после схода оставшееся не проверено — считаем неиграбельным
      if (run.lost !== false) for (let b = Math.floor(run.lost / 50); b < nb; b++) bad.add(b);
      if (+kmh === 60) { all += nb; good += nb - bad.size; } else { all100 += nb; good100 += nb - bad.size; }
    }
  }
  out.playable60 = +(100 * good / Math.max(1, all)).toFixed(1);
  out.playable100 = +(100 * good100 / Math.max(1, all100)).toFixed(1);
  const okS = out.secs.filter(s => s.ready);
  const sum = k => okS.reduce((a, s) => a + (s.runs[60] ? s.runs[60][k] : 0), 0);
  const sum1 = k => okS.reduce((a, s) => a + (s.runs[100] ? s.runs[100][k] : 0), 0);
  out.total = { air60: +sum('air').toFixed(2), jolts60: sum('jolts'), launches60: sum('launches'),
    air100: +sum1('air').toFixed(2), jolts100: sum1('jolts'), launches100: sum1('launches'),
    steps5: okS.reduce((a, s) => a + s.steps5, 0), kinks5: okS.reduce((a, s) => a + s.kinks5, 0),
    crest60: okS.reduce((a, s) => a + s.crest60, 0),
    lost60: out.secs.filter(s => s.runs[60] && s.runs[60].lost !== false).length,
    lost100: out.secs.filter(s => s.runs[100] && s.runs[100].lost !== false).length,
    notReady: out.secs.filter(s => !s.ready).length,
    t60: +sum('t').toFixed(1), t100: +sum1('t').toFixed(1),
    aMax60: Math.max(0, ...okS.map(s => s.runs[60] ? s.runs[60].aMax : 0)),
    aMax100: Math.max(0, ...okS.map(s => s.runs[100] ? s.runs[100].aMax : 0)),
    stuck60: okS.filter(s => s.runs[60] && !s.runs[60].done && s.runs[60].lost === false).length,
    stuck100: okS.filter(s => s.runs[100] && !s.runs[100].done && s.runs[100].lost === false).length };
  console.log(`== ${R.name}: играбельно на 60 — ${out.playable60}%, на 100 — ${out.playable100}%`, JSON.stringify(out.total));
  result[R.name] = out;
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(result));
}
await browser.close();
if (errors.length) { console.log('ошибки страницы:'); for (const e of errors.slice(0, 10)) console.log('  ' + e); }
if (JSON_OUT) console.log('записано: ' + JSON_OUT);
