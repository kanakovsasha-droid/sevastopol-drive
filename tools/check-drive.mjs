// Проезд машиной по заданной ломаной: нет ли ступенек, провалов и стен.
//
// Стенд гоняет настоящую машину игры (car.update с шагом 1/60, как в
// check-physics.mjs) по точкам маршрута на малой скорости — заезд на АЗС,
// драйв, двор — и меряет то, что ощущается как «ступенька»: скачок высоты
// кузова за кадр, вертикальный толчок, отрыв колёс, удар о стену и
// застревание (машина не доехала до конца).
//
//   node tools/check-drive.mjs --port 5173 --kmh 20 \
//     --route "-3074.5,2712;-3074.9,2733.7;-3073.2,2774.5;-3063.5,2788;-3040,2787"
//   несколько маршрутов — через |
//
// Playwright — как в check-physics.mjs (переменная PLAYWRIGHT или известный путь).

const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name);
  return i > 0 ? process.argv[i + 1] : def;
};
const PORT = arg('port', '5173');
const KMH = +arg('kmh', '20');
const ROUTES = arg('route', '').split('|').filter(Boolean)
  .map(r => r.split(';').map(p => p.split(',').map(Number)));
if (!ROUTES.length) { console.error('нужен --route "x,z;x,z;…"'); process.exit(2); }

async function loadPlaywright() {
  for (const t of [process.env.PLAYWRIGHT, 'playwright', '/Users/aleksandrkanakov/Downloads/domiro/node_modules/playwright/index.mjs'].filter(Boolean)) {
    try { return await import(t); } catch { /* следующий */ }
  }
  throw new Error('playwright не найден');
}
const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error') errors.push('консоль: ' + m.text().slice(0, 200)); });
await page.goto(`http://127.0.0.1:${PORT}/web/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.G && window.G.car, null, { timeout: 180000 });

const res = await page.evaluate(async ({ ROUTES, KMH }) => {
  const G = window.G, car = G.car, DT = 1 / 60;
  const idle = ms => new Promise(r => setTimeout(r, ms));
  const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const realUpdate = car.update.bind(car);
  car.update = () => {};
  const out = [];
  for (const rt of ROUTES) {
    const [sx, sz] = rt[0];
    G.jumpTo(sx, sz);
    for (let i = 0; i < 100; i++) {
      await idle(200);
      if (G.chunks.has(G.chunks.keyAt(sx, sz)) && G.terrain.surfaceAt(sx, sz)) break;
    }
    await idle(2500);
    car.reset(sx, sz, Math.atan2(rt[1][0] - sx, rt[1][1] - sz));
    for (let i = 0; i < 60; i++) realUpdate(DT, { throttle: 0, steer: 0 });
    let j = 1, n = 0, py = car.pos.y, pvy = 0, px = car.pos.x, pz = car.pos.z;
    const r = { stepMaxCm: 0, stepAt: '', joltMaxG: 0, joltAt: '', airFrames: 0, crash: 0, stuckS: 0, reached: false, dist: 0, gapMaxCm: 0 };
    let slow = 0;
    while (n < 60 * 120) {
      if (Math.hypot(rt[j][0] - car.pos.x, rt[j][1] - car.pos.z) < 3) { j++; if (j >= rt.length) { r.reached = true; break; } continue; }
      const err = wrap(Math.atan2(rt[j][0] - car.pos.x, rt[j][1] - car.pos.z) - car.yaw);
      const v = Math.hypot(car.pos.x - px, car.pos.z - pz) / DT;
      px = car.pos.x; pz = car.pos.z;
      const vt = Math.min(KMH / 3.6, 3 + 2 / (Math.abs(err) + 0.05));
      realUpdate(DT, { throttle: clamp((vt - v) * 0.6, 0, 1), steer: clamp(err * 2.2, -1, 1), handbrake: false });
      n++;
      r.dist += v * DT;
      const dy = car.pos.y - py, vy = dy / DT, ay = (vy - pvy) / DT;
      py = car.pos.y; pvy = vy;
      if (n > 30) {
        if (Math.abs(dy) * 100 > r.stepMaxCm) { r.stepMaxCm = Math.abs(dy) * 100; r.stepAt = `${car.pos.x.toFixed(1)},${car.pos.z.toFixed(1)}`; }
        if (Math.abs(ay) / 9.81 > r.joltMaxG) { r.joltMaxG = Math.abs(ay) / 9.81; r.joltAt = `${car.pos.x.toFixed(1)},${car.pos.z.toFixed(1)}`; }
        if (car.airborne) r.airFrames++;
        const gap = car.pos.y - (G.terrain.driveHeightAt(car.pos.x, car.pos.z) + 0.145);
        r.gapMaxCm = Math.max(r.gapMaxCm, Math.abs(gap) * 100);
      }
      r.crash = Math.max(r.crash, car.crash || 0);
      slow = v < 0.3 ? slow + DT : 0;
      if (slow > 4) { r.stuckS = slow; break; }
      if (n % 120 === 0) await idle(0);
    }
    for (const k of ['stepMaxCm', 'joltMaxG', 'crash', 'gapMaxCm', 'dist']) r[k] = +r[k].toFixed(2);
    r.endAt = `${car.pos.x.toFixed(1)},${car.pos.z.toFixed(1)}`;
    r.route = rt.map(p => p.join(',')).join(';');
    out.push(r);
  }
  car.update = realUpdate;
  return out;
}, { ROUTES, KMH });
await browser.close();
for (const r of res) console.log(JSON.stringify(r));
if (errors.length) { console.log('ОШИБКИ:'); for (const e of errors) console.log('  ' + e); }
