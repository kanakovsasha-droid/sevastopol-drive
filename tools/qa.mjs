// Автопроверка игры одной командой: снимки и замеры по фиксированному набору
// мест (qa/spots.json) и отчёт «до / после». Ловит регрессии после слияния веток.
//
//   python3 tools/serve.py 5260 .                      # сервер из проверяемой копии
//   node tools/qa.mjs --port 5260 --out qa/runs/до     # полный прогон (~6–8 мин)
//   ... слияние веток, перезапуск сервера ...
//   node tools/qa.mjs --port 5260 --out qa/runs/после --base qa/runs/до
//   node tools/qa.mjs --port 5260 --quick              # быстрый: 12 мест, 1 улица (~2–3 мин)
//
// Ключи: --port (5173) · --out каталог прогона (по умолчанию qa/runs/<дата-время>)
// · --base каталог прогона «до» · --quick · --only id1,id2 (только эти места)
// · --no-phys (без прогонов машины) · --hills (добавить заезд по холмам, +3–5 мин).
//
// Что делает:
//  1. Один headless-Chromium и ОДНА страница: камеру полёта (G.fly) переставляем
//     из места в место, страницу не перегружаем. Ждём, пока доедут чанки, земля
//     и высоты, и ещё пока не перестанет меняться число треугольников.
//  2. На время снимка замораживаем часы страницы (вода, ветер в кронах) — иначе
//     два кадра одной сцены различались бы. HUD скрыт, разрешение фиксировано.
//  3. По каждому месту: два кадра (сверху 60–130 м и с 2 м, как из машины),
//     вызовы отрисовки и треугольники (G.info), отпечаток высот и дорог на
//     площадке 60×60 м, ошибки консоли и сети.
//  4. По улицам: профиль полотна вдоль осевой на 520 м (переломы уклона,
//     ступени, «волна») — те же функции игры, что у tools/check-physics.mjs.
//  5. Параллельно: заезд машины по трём улицам через tools/check-physics.mjs
//     (время в воздухе, тряска, толчки, стоянка).
//  6. Если есть --base: попиксельная разница кадров, отчёт со сводкой
//     «стало хуже в N местах».
//
// Playwright — по абсолютному пути (в зависимости проекта его нет).

import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeReport } from './qa-report.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const flag = n => argv.includes('--' + n);
const PORT = arg('port', '5173');
const QUICK = flag('quick');
const NOPHYS = flag('no-phys');
const HILLS = flag('hills');
const ONLY = (arg('only', '') || '').split(',').filter(Boolean);
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 13);
const OUT = resolve(ROOT, arg('out', 'qa/runs/' + stamp));
const BASE = arg('base', '') ? resolve(ROOT, arg('base', '')) : null;
const URL_BASE = `http://127.0.0.1:${PORT}/web/`;
const W = 1280, H = 720;
const PLAYWRIGHT = process.env.PLAYWRIGHT || '/Users/aleksandrkanakov/Downloads/domiro/node_modules/playwright/index.mjs';
const { chromium } = await import(PLAYWRIGHT);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a);

// Три улицы для заезда машины: старт — как у check-physics (--start x,z). Выбраны
// те, где результат заезда повторяется до знака: на Большой Морской (шов чанка
// на z=1024) и на Гоголя два заезда подряд давали разную тряску — см. отчёт.
const PHYS = [
  { id: 'lazareva-nakhimova', name: 'проспект Нахимова от пл. Лазарева', start: [-398, 484] },
  { id: 'lenina', name: 'улица Ленина', start: [92, 784] },
  { id: 'petrova', name: 'улица Генерала Петрова (спуск)', start: [-1051, 1103] },
];

mkdirSync(join(OUT, 'img'), { recursive: true });
mkdirSync(join(OUT, 'diff'), { recursive: true });

// ---- набор мест
const spotsAll = JSON.parse(readFileSync(join(ROOT, 'qa/spots.json'), 'utf8')).spots;
let spots = spotsAll.filter(s => (!QUICK || s.quick) && (!ONLY.length || ONLY.includes(s.id)));
// обход по ближайшему соседу: чанки не выгружаются и не грузятся заново зря
{
  const rest = spots.slice(), ord = [rest.shift()];
  while (rest.length) {
    const l = ord[ord.length - 1];
    let bi = 0, bd = 1e18;
    rest.forEach((s, i) => { const d = Math.hypot(s.x - l.x, s.z - l.z); if (d < bd) { bd = d; bi = i; } });
    ord.push(rest.splice(bi, 1)[0]);
  }
  spots = ord;
}

const t00 = Date.now();
const summary = {
  meta: { label: OUT.split('/').pop(), date: new Date().toISOString().slice(0, 16).replace('T', ' '), port: PORT, quick: QUICK,
          commit: sh('git rev-parse --short HEAD'), branch: sh('git rev-parse --abbrev-ref HEAD'), dirty: !!sh('git status --porcelain web data/landmarks.json'),
          viewport: `${W}x${H}`, durationS: 0 },
  spots: {}, profiles: {}, physics: {}, errors: [],
};
function sh(cmd) { try { return execSync(cmd, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; } }

// ---- заезды машины: отдельные процессы, параллельно с обходом
const physJobs = NOPHYS ? [] : (QUICK ? PHYS.slice(0, 1) : PHYS);
async function runPhysics() {
  const run = (id, name, extra, key) => new Promise(res => {
    const file = join(OUT, `phys-${id}.json`);
    const args = [join(ROOT, 'tools/check-physics.mjs'), '--port', PORT, '--only', 'street', ...extra, '--json', file];
    const ch = spawn(process.execPath, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    ch.stdout.on('data', d => out += d); ch.stderr.on('data', d => out += d);
    ch.on('close', code => {
      if (code === 0 && existsSync(file)) {
        const j = JSON.parse(readFileSync(file, 'utf8'));
        if (key === 'hills') summary.physics.hills = { hills100: j.hills100, hills130: j.hills130 };
        else summary.physics[id] = { name, ...j };
        const m = out.split('ошибки страницы:')[1];
        if (m) for (const l of m.split('\n').map(s => s.trim()).filter(Boolean)) summary.errors.push({ where: 'check-physics ' + id, text: l });
      } else {
        summary.physics[key === 'hills' ? 'hills' : id] = { name, error: `check-physics упал (код ${code}): ${out.slice(-300)}` };
      }
      log(`физика ${id}: готово`);
      res();
    });
  });
  for (const p of physJobs) await run(p.id, p.name, ['--skip', 'hills', '--start', p.start.join(',')]);
  if (HILLS) await run('hills', 'холмы', [], 'hills');
}
const physDone = physJobs.length || HILLS ? runPhysics() : Promise.resolve();

// ---- браузер
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
let cur = 'загрузка';
const addErr = (kind, text) => {
  text = text.replace(/\s+/g, ' ').slice(0, 400);
  if (summary.errors.some(e => e.text === text && e.where === cur)) return;
  summary.errors.push({ where: cur, kind, text });
};
page.on('pageerror', e => addErr('pageerror', 'исключение: ' + String(e)));
page.on('console', m => { if (m.type() === 'error') addErr('console', 'консоль: ' + m.text()); });
page.on('requestfailed', r => { if (r.failure()?.errorText === 'net::ERR_ABORTED') { summary.meta.aborted = (summary.meta.aborted || 0) + 1; return; }   // обрывы запросов браузером — шум, не ошибка
  if (!/favicon|\.mp3|\.ogg|\.wav|audio/.test(r.url())) addErr('net', `запрос не прошёл (${r.failure()?.errorText}): ${r.url().replace(URL_BASE.replace('/web/', ''), '')}`); });
page.on('response', r => { if (r.status() >= 400 && !/favicon/.test(r.url())) addErr('net', `HTTP ${r.status()}: ${r.url().replace(URL_BASE.replace('/web/', ''), '')}`); });

// Часы страницы: пока не заморожены — идут как обычно, заморожены — стоят на
// одном и том же значении. Игра берёт время из аргумента requestAnimationFrame
// (вода, ветер), поэтому подмена честная.
await page.addInitScript(() => {
  const raw = window.requestAnimationFrame.bind(window);
  window.__rawRaf = raw;
  let vt = 1e6, last = null, frozen = false;
  window.__qaFrames = 0;
  window.__qaFreeze = on => { frozen = !!on; if (frozen) vt = 1e6; };
  window.requestAnimationFrame = cb => raw(t => {
    if (last === null) last = t;
    const d = Math.min(t - last, 100); last = t;
    if (!frozen) vt += d;
    window.__qaFrames++;
    cb(vt);
  });
});

const first = spots[0];
log(`порт ${PORT}, мест ${spots.length}${QUICK ? ' (быстрый)' : ''}, вывод ${relative(ROOT, OUT)}`);
await page.goto(`${URL_BASE}?at=${first.x},${first.z + 1},${first.top}&look=${first.x},${first.z},0`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.G && window.G.car && window.G.fly, null, { timeout: 240000 });
await page.evaluate(() => {
  const st = document.createElement('style');
  st.textContent = '#hud,#load,#menu{display:none!important}';
  document.head.appendChild(st);
  // адаптивное разрешение в headless падает до 0.85 (кадр там ~10 fps) — фиксируем 1.0
  window.__setPR = () => {};
  G.renderer.setPixelRatio(1);
  G.renderer.setSize(innerWidth, innerHeight);
  // установка камеры полёта; высоты — по полотну, если точка на дороге
  const T = G.terrain, f = G.fly;
  const gy = (x, z) => { const d = T.driveHeightAt(x, z); return Number.isFinite(d) ? d : T.gridHeightAt(x, z); };
  window.__qaCam = (x, z, h, lx, lz, lh, down) => {
    f.x = x; f.z = z; f.y = gy(x, z) + h; f.vx = f.vy = f.vz = 0;
    if (down) { f.yaw = Math.PI; f.pitch = -1.553; }
    else {
      const dx = lx - x, dz = lz - z, dy = gy(lx, lz) + lh - f.y;
      f.yaw = Math.atan2(dx, dz); f.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    }
  };
  window.__qaFrameWait = n => new Promise(res => { const target = window.__qaFrames + n; const tick = () => window.__qaFrames >= target ? res() : window.__rawRaf(tick); tick(); });
  window.__qaState = () => { const c = G.chunks, i = G.info;
    return { busy: c.queue.length + c.loading.size + c.orphans.length + (c.building ? 1 : 0), ready: c.ready.size, ground: G.ground.pending,
             terrain: G.terrain.pending, tri: i.render.triangles, calls: i.render.calls, frames: window.__qaFrames, loaded: c.built.size }; };
});
log(`страница поднята за ${((Date.now() - t00) / 1000).toFixed(1)} с`);

// ждём, пока мир под камерой достроится
async function settle(maxMs = 50000) {
  const t0 = Date.now();
  let lastSig = '', stable = 0, quietSince = 0;
  while (Date.now() - t0 < maxMs) {
    const s = await page.evaluate(() => window.__qaState());
    const quiet = s.busy === 0 && s.ground === 0 && s.terrain === 0;
    const sig = [s.busy, s.ground, s.terrain, s.tri, s.calls, s.ready].join();
    if (quiet) { if (!quietSince) quietSince = Date.now(); } else quietSince = 0;
    stable = quiet && sig === lastSig ? stable + 1 : 0;
    lastSig = sig;
    if (stable >= 3 && Date.now() - quietSince > 900) return { ok: true, ms: Date.now() - t0 };
    await sleep(220);
  }
  return { ok: false, ms: Date.now() - t0 };
}

const metricsOf = () => page.evaluate(() => {
  const i = G.info;
  return { calls: i.render.calls, tri: i.render.triangles, geo: i.memory.geometries, tex: i.memory.textures };
});

async function capture(id, view) {
  // Кадр считается готовым, когда два снимка подряд (с паузой в несколько
  // кадров при замороженных часах) совпали байт в байт: дальние фасады и
  // текстуры достраиваются ещё какое-то время после того, как очереди опустели.
  let buf = null, tries = 0;
  for (; tries < 6; tries++) {
    await page.evaluate(() => window.__qaFreeze(true));
    await page.evaluate(() => window.__qaFrameWait(4));
    const a = await page.screenshot({ type: 'jpeg', quality: 84 });
    await page.evaluate(() => window.__qaFrameWait(3));
    const b = await page.screenshot({ type: 'jpeg', quality: 84 });
    buf = b;
    if (a.equals(b)) break;
    await page.evaluate(() => window.__qaFreeze(false));
    await sleep(500);
  }
  // три кадра подряд: берём максимум (тени/деревья могут обновляться не каждый кадр)
  const ms = [];
  for (let k = 0; k < 3; k++) { ms.push(await metricsOf()); await page.evaluate(() => window.__qaFrameWait(1)); }
  const m = { calls: Math.max(...ms.map(x => x.calls)), tri: Math.max(...ms.map(x => x.tri)),
              geo: Math.max(...ms.map(x => x.geo)), tex: Math.max(...ms.map(x => x.tex)),
              jitter: Math.max(...ms.map(x => x.tri)) - Math.min(...ms.map(x => x.tri)), tries: tries + 1 };
  writeFileSync(join(OUT, `img/${id}-${view}.jpg`), buf);
  await page.evaluate(() => window.__qaFreeze(false));
  return m;
}

// отпечаток площадки 60×60 м вокруг центра места
const fingerprint = (x, z) => page.evaluate(([x, z]) => {
  const T = G.terrain; let n = 0, sh = 0, sd = 0, road = 0, mn = 1e9, mx = -1e9;
  for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
    const px = x + i * 10, pz = z + j * 10;
    const d = T.driveHeightAt(px, pz), g = T.gridHeightAt(px, pz);
    if (!Number.isFinite(d) || !Number.isFinite(g)) continue;
    n++; sh += d; sd += d - g; mn = Math.min(mn, d); mx = Math.max(mx, d);
    if (T.corridorAt(px, pz) !== null) road++;
  }
  const r = v => Math.round(v * 100) / 100;
  return { hMean: r(sh / Math.max(n, 1)), hMin: r(mn), hMax: r(mx), deck: r(sd / Math.max(n, 1)), road: r(road / Math.max(n, 1)), n };
}, [x, z]);

// профиль полотна вдоль улицы: код — из tools/check-physics.mjs (buildRoute и
// «сырые данные полотна»), только направление выбирается к заданной точке
function inPageProfile({ sx, sz, tx, tz, maxLen }) {
  const G = window.G, KMH = 3.6, G0 = 9.81;
  const r2 = (v, n = 2) => v === null || v === undefined || !isFinite(v) ? null : +v.toFixed(n);
  const hit = G.roads.nearest(sx, sz, 80, r => r.c <= 3);
  if (!hit) return { error: 'у старта нет проезжей части' };
  const route = [], used = new Set();
  let r = hit.road, p = r.pts, n = p.length / 2;
  let best = 0, bd = 1e9;
  for (let i = 0; i < n; i++) { const d = Math.hypot(p[i * 2] - hit.x, p[i * 2 + 1] - hit.z); if (d < bd) { bd = d; best = i; } }
  const dTo = i => i < 0 || i >= n ? 1e9 : Math.hypot(p[i * 2] - tx, p[i * 2 + 1] - tz);
  let dir = dTo(best + 1) <= dTo(best - 1) ? 1 : -1;
  route.push([hit.x, hit.z]);
  let i = best, len = 0;
  for (let guard = 0; guard < 600 && len < maxLen; guard++) {
    i += dir;
    if (i < 0 || i >= n) {
      used.add(r);
      const ex = p[(i - dir) * 2], ez = p[(i - dir) * 2 + 1];
      const pi = (i - dir) - dir;
      const hx = ex - p[pi * 2], hz = ez - p[pi * 2 + 1];
      let nb = null, nbScore = 0.5;
      for (const q of G.roads.roads) {
        if (!q || used.has(q) || q.c > 3) continue;
        const qp = q.pts, qn = qp.length / 2;
        for (const [a, b, d2] of [[0, 1, 1], [qn - 1, qn - 2, -1]]) {
          if (Math.hypot(qp[a * 2] - ex, qp[a * 2 + 1] - ez) > 2.5) continue;
          const ux = qp[b * 2] - qp[a * 2], uz = qp[b * 2 + 1] - qp[a * 2 + 1];
          const sc = (ux * hx + uz * hz) / ((Math.hypot(ux, uz) || 1) * (Math.hypot(hx, hz) || 1));
          if (sc > nbScore) { nbScore = sc; nb = { q, a, d2 }; }
        }
      }
      if (!nb) break;
      r = nb.q; p = r.pts; n = p.length / 2; i = nb.a; dir = nb.d2;
      continue;
    }
    const last = route[route.length - 1];
    const d = Math.hypot(p[i * 2] - last[0], p[i * 2 + 1] - last[1]);
    if (d < 0.5) continue;
    len += d; route.push([p[i * 2], p[i * 2 + 1]]);
  }
  const routeLen = route.reduce((a, q, k) => k ? a + Math.hypot(q[0] - route[k - 1][0], q[1] - route[k - 1][1]) : 0, 0);
  const H = [], XZ = [], step = 0.25;
  for (let k = 1; k < route.length; k++) {
    const a = route[k - 1], b = route[k], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let d = 0; d < L; d += step) {
      const x = a[0] + (b[0] - a[0]) * d / L, z = a[1] + (b[1] - a[1]) * d / L;
      H.push(G.terrain.driveHeightAt(x, z)); XZ.push([x, z]);
    }
  }
  if (H.length < 80) return { error: 'маршрут слишком короткий: ' + routeLen.toFixed(0) + ' м' };
  let maxStep = 0, kinks = 0, maxKink = 0, s2 = 0, at = 0;
  for (let k = 1; k < H.length - 1; k++) {
    const dd = H[k + 1] - 2 * H[k] + H[k - 1];
    const kink = Math.abs(dd) / step;
    if (kink > maxKink) { maxKink = kink; at = k; }
    if (kink > 0.02) kinks++;
    maxStep = Math.max(maxStep, Math.abs(H[k] - H[k - 1]));
    s2 += dd * dd;
  }
  let sMin = 1, sMax = -1, curv = 0;
  for (let k = 0; k + 40 < H.length; k += 4) {
    const s1 = (H[k + 20] - H[k]) / 5, s2b = (H[k + 40] - H[k + 20]) / 5;
    sMin = Math.min(sMin, s1); sMax = Math.max(sMax, s1);
    curv = Math.max(curv, Math.abs(s2b - s1) / 5);
  }
  const wAt = XZ[at] || [0, 0];
  const src = G.terrain.corridorAt(wAt[0], wAt[1]) === null ? 'сетка рельефа' : G.terrain.deckAt(wAt[0], wAt[1]) ? 'мост' : 'коридор';
  const v = 60 / KMH;
  return { lengthM: r2(routeLen, 0), samples: H.length, maxStepCm: r2(maxStep * 100, 1), maxSlopeBreakPct: r2(maxKink * 100, 1),
           maxBreakAt: `${wAt[0].toFixed(0)},${wAt[1].toFixed(0)} (${src})`, breaksOver2pct: kinks,
           gluedAyRms60: r2(Math.sqrt(s2 / H.length) / (step * step) * v * v, 1),
           slopeMinPct: r2(sMin * 100, 1), slopeMaxPct: r2(sMax * 100, 1),
           waveG60: r2(curv * v * v / G0), waveG100: r2(curv * (100 / KMH) ** 2 / G0), climbM: r2(H[H.length - 1] - H[0], 1) };
}

// ---- обход
let idx = 0;
for (const s of spots) {
  idx++;
  cur = s.id;
  const t0 = Date.now();
  const rec = { name: s.name, group: s.group, x: s.x, z: s.z, views: {} };
  summary.spots[s.id] = rec;

  await page.evaluate(([x, z, h]) => window.__qaCam(x, z, h, x, z, 0, true), [s.x, s.z, s.top]);
  const st = await settle();
  rec.settleMs = st.ms; if (!st.ok) rec.unsettled = true;
  rec.terrain = await fingerprint(s.x, s.z);
  rec.views.top = await capture(s.id, 'top');

  if (s.profile && (!QUICK || s.quick)) {
    summary.profiles[s.id] = await page.evaluate(inPageProfile, { sx: s.ground.from[0], sz: s.ground.from[1], tx: s.profile.toward[0], tz: s.profile.toward[1], maxLen: s.profile.len });
  }
  const g = s.ground;
  await page.evaluate(([fx, fz, lx, lz, lh]) => window.__qaCam(fx, fz, 2, lx, lz, lh, false), [g.from[0], g.from[1], g.look[0], g.look[1], g.look[2] ?? 1.5]);
  const st2 = await settle(20000);
  if (!st2.ok) rec.unsettled = true;
  rec.views.ground = await capture(s.id, 'ground');
  log(`${String(idx).padStart(2)}/${spots.length} ${s.id.padEnd(22)} ${((Date.now() - t0) / 1000).toFixed(1).padStart(5)} с  вызовов ${rec.views.top.calls}/${rec.views.ground.calls}  треуг. ${rec.views.top.tri}/${rec.views.ground.tri}${rec.unsettled ? '  НЕ ДОГРУЗИЛОСЬ' : ''}`);
}
cur = 'после обхода';

// ---- сравнение кадров с базой (в браузере: декодер JPEG есть только там)
if (BASE && existsSync(join(BASE, 'summary.json'))) {
  const cmpPage = await browser.newPage();
  await cmpPage.goto('about:blank');
  let n = 0;
  for (const id of Object.keys(summary.spots)) {
    for (const view of ['top', 'ground']) {
      const fa = join(BASE, `img/${id}-${view}.jpg`), fb = join(OUT, `img/${id}-${view}.jpg`);
      if (!existsSync(fa) || !existsSync(fb)) continue;
      const r = await cmpPage.evaluate(async ([a64, b64]) => {
        const dec = async s => {
          const bm = await createImageBitmap(await (await fetch('data:image/jpeg;base64,' + s)).blob());
          const c = new OffscreenCanvas(bm.width, bm.height), x = c.getContext('2d', { willReadFrequently: true });
          x.drawImage(bm, 0, 0); return x.getImageData(0, 0, bm.width, bm.height);
        };
        const A = await dec(a64), B = await dec(b64);
        if (A.width !== B.width || A.height !== B.height) return { pct: 100, mean: 255, size: true };
        const N = A.width * A.height, o = new ImageData(A.width, A.height);
        let ch = 0, sum = 0;
        for (let i = 0; i < N; i++) {
          const k = i * 4;
          const d = Math.max(Math.abs(A.data[k] - B.data[k]), Math.abs(A.data[k + 1] - B.data[k + 1]), Math.abs(A.data[k + 2] - B.data[k + 2]));
          sum += d;
          if (d > 16) { ch++; o.data[k] = 255; o.data[k + 1] = 40; o.data[k + 2] = 40; }
          else { const g = (B.data[k] + B.data[k + 1] + B.data[k + 2]) / 3 * 0.35; o.data[k] = o.data[k + 1] = o.data[k + 2] = g; }
          o.data[k + 3] = 255;
        }
        const res = { pct: ch / N * 100, mean: sum / N };
        if (ch) {
          const c2 = new OffscreenCanvas(A.width, A.height); c2.getContext('2d').putImageData(o, 0, 0);
          const buf = new Uint8Array(await (await c2.convertToBlob({ type: 'image/jpeg', quality: 0.8 })).arrayBuffer());
          let s = ''; for (let i = 0; i < buf.length; i += 8192) s += String.fromCharCode.apply(null, buf.subarray(i, i + 8192));
          res.jpg = btoa(s);
        }
        return res;
      }, [readFileSync(fa).toString('base64'), readFileSync(fb).toString('base64')]);
      if (r.jpg) { writeFileSync(join(OUT, `diff/${id}-${view}.jpg`), Buffer.from(r.jpg, 'base64')); delete r.jpg; }
      r.pct = +r.pct.toFixed(4); r.mean = +r.mean.toFixed(3);
      summary.spots[id].views[view].diff = r;
      n++;
    }
  }
  await cmpPage.close();
  log(`кадров сравнено: ${n}`);
}

await browser.close();
await physDone;

summary.meta.durationS = Math.round((Date.now() - t00) / 1000);
summary.errors.sort((a, b) => (a.where + a.text).localeCompare(b.where + b.text));
writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 1));

const cmp = writeReport(OUT, BASE, join(OUT, 'report.html'));
const latest = join(ROOT, 'qa/report.html');
writeReport(OUT, BASE, latest);
const T = cmp.total;
log(`готово за ${summary.meta.durationS} с`);
console.log(BASE ? (T.same ? 'ИТОГ: без изменений' : `ИТОГ: хуже в ${T.worse}, лучше в ${T.better}, кадров изменилось ${T.imgChanged}, новых ошибок ${T.newErrors}`) : 'ИТОГ: прогон без сравнения');
console.log('ошибок консоли/сети: ' + summary.errors.length);
console.log('отчёт: ' + join(OUT, 'report.html') + '\nпоследний:  ' + latest);
