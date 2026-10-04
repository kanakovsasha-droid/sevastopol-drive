// Стенд помощников: ABS, ASR, ESP по режимам и Race Start — числами.
//
// Как check-physics.mjs: игра в headless-браузере, машина на ровной плите,
// физика шагает напрямую (1/60 с), выбор помощников — в car.assist (так же
// его кладёт assists.js в игре).
//
//   python3 tools/serve.py 5191 .
//   node tools/check-assists.mjs --port 5191

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const PORT = arg('port', '5191');
async function loadPlaywright() {
  for (const t of [process.env.PLAYWRIGHT, 'playwright', '/Users/aleksandrkanakov/Downloads/domiro/node_modules/playwright/index.mjs'].filter(Boolean)) {
    try { return await import(t); } catch { /* следующий */ }
  }
  throw new Error('нет playwright: PLAYWRIGHT=/путь/к/playwright/index.mjs');
}
const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
await page.goto(`http://127.0.0.1:${PORT}/web/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.G && window.G.car, null, { timeout: 180000 });

const out = await page.evaluate(() => {
  const G = window.G, Car = G.car.constructor;
  G.car.update = () => {};                       // игровой цикл машиной не управляет
  const DT = 1 / 60, KMH = 3.6, r2 = (v, n = 2) => v == null || !isFinite(v) ? null : +v.toFixed(n);
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a)), clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const flat = { driveHeightAt: () => 10, groundDriveHeightAt: () => 10, gridHeightAt: () => 10, heightAt: () => 10, deckAt: () => null, corridorAt: () => 10 };
  const mk = (assist, rwd = false) => { const c = new Car(flat, { resolve: () => null }); c.reset(0, 0, 0); if (rwd) c.toggleDrive(); c.assist = { abs: true, asr: true, esp: 'on', launch: true, ...assist }; c.engine = 'on'; return c; };
  const rig = car => { const s = { t: 0, v: 0, beta: 0, yawRate: 0, x: car.pos.x, z: car.pos.z, yaw: car.yaw, dist: 0 };
    s.step = inp => { car.update(DT, { throttle: inp.throttle || 0, steer: inp.steer || 0, handbrake: !!inp.handbrake, gas: !!inp.gas || (inp.throttle || 0) > 0, brake: !!inp.brake || (inp.throttle || 0) < 0 });
      const dx = car.pos.x - s.x, dz = car.pos.z - s.z, d = Math.hypot(dx, dz); s.v = d / DT; s.dist += d;
      s.yawRate = wrap(car.yaw - s.yaw) / DT; s.beta = d > 0.02 ? wrap(Math.atan2(dx, dz) - car.yaw) : 0;
      if (s.beta > Math.PI / 2) s.beta -= Math.PI; else if (s.beta < -Math.PI / 2) s.beta += Math.PI;
      s.x = car.pos.x; s.z = car.pos.z; s.yaw = car.yaw; s.t += DT; };
    return s; };
  const hold = (s, vt) => clamp((vt - s.v) * 0.6, 0, 1);
  const res = {};

  // ---- 1. торможение со 100 до 0: ABS вкл и выкл
  for (const abs of [true, false]) {
    const car = mk({ abs }), s = rig(car);
    while (s.v * KMH < 100 && s.t < 30) s.step({ throttle: 1 });
    const d0 = s.dist, t0 = s.t; let lock = 0, n = 0, kmin = 0, absT = 0;
    while (s.v > 0.15 && s.t < t0 + 15) {
      s.step({ throttle: -1 });
      // проскальзывание колёс при торможении (−1 — стоит, юз)
      if (s.v > 3) { n++; const k = Math.min(...car._kap); kmin = Math.min(kmin, k); if (k < -0.5) lock++; if (car.absActive) absT += DT; }
    }
    res[abs ? 'brakeAbsOn' : 'brakeAbsOff'] = { dist: r2(s.dist - d0, 1), time: r2(s.t - t0), lockedPct: r2(lock / n * 100, 0), minSlipPct: r2(kmin * 100, 0), absActiveS: r2(absT, 1) };
  }

  // ---- 2. разгон 0–100: с Race Start и без, полный и задний привод
  for (const rwd of [false, true]) for (const launch of [false, true]) {
    const car = mk({ esp: launch ? 'sport' : 'on', launch }, rwd), s = rig(car);
    for (let i = 0; i < 30; i++) s.step({});
    let armRpm = [], moved = 0;
    if (launch) {
      const z0 = car.pos.z;
      for (let i = 0; i < 150; i++) { s.step({ throttle: 1, gas: true, brake: true }); if (i > 60) armRpm.push(car.rpm); }
      moved = Math.abs(car.pos.z - z0);
    }
    const armed = car.launch;
    const t0 = s.t; let t100 = null, maxSlip = 0, n = 0, sumSlip = 0;
    while (s.t < t0 + 12 && t100 === null) {
      s.step({ throttle: 1 });
      if (s.v * KMH >= 100) t100 = s.t - t0;
      const drv = rwd ? [car._kap[2], car._kap[3]] : car._kap;
      const k = Math.max(...drv); maxSlip = Math.max(maxSlip, k); if (s.t - t0 < 2) { sumSlip += k; n++; }
    }
    const mean = armRpm.length ? armRpm.reduce((a, b) => a + b) / armRpm.length : 0;
    const sd = armRpm.length ? Math.sqrt(armRpm.reduce((a, b) => a + (b - mean) ** 2, 0) / armRpm.length) : 0;
    res[(rwd ? 'rwd' : 'awd') + (launch ? 'Launch' : 'Plain')] = { t100: r2(t100), armed, armRpm: r2(mean, 0), armRpmSd: r2(sd, 1), movedWhileArmedMm: r2(moved * 1000, 0),
      slipFirst2sPct: r2(sumSlip / Math.max(1, n) * 100, 1), maxSlipPct: r2(maxSlip * 100, 0) };
  }

  // ---- 2б. Race Start при ESP ON (в игре assists.js на время старта ставит
  // SPORT; здесь ESP остаётся ON — проверяем, что лаунч взводится и стартует)
  for (const rwd of [false, true]) {
    const car = mk({ esp: 'on', launch: true }, rwd), s = rig(car);
    for (let i = 0; i < 30; i++) s.step({});
    const z0 = car.pos.z; let rpm = 0, n = 0;
    for (let i = 0; i < 150; i++) { s.step({ throttle: 1, gas: true, brake: true }); if (i > 60) { rpm += car.rpm; n++; } }
    const armed = car.launch, moved = Math.abs(car.pos.z - z0);
    s.step({ throttle: 1, gas: true });
    const go = car.launch, t0 = s.t; let t100 = null;
    while (s.t < t0 + 12 && t100 === null) { s.step({ throttle: 1, gas: true }); if (s.v * KMH >= 100) t100 = s.t - t0; }
    res[(rwd ? 'rwd' : 'awd') + 'LaunchEspOn'] = { armed, go, armRpm: r2(rpm / n, 0), movedWhileArmedMm: r2(moved * 1000, 0), t100: r2(t100) };
  }

  // ---- 3. газ с тормозом на месте без лаунча (выключен в настройках) —
  // стоит на любом приводе, бёрнаута нет
  for (const rwd of [false, true]) {
    const car = mk({ esp: 'on', launch: false }, rwd), s = rig(car);
    for (let i = 0; i < 30; i++) s.step({});
    const z0 = car.pos.z; let rpm = 0, n = 0, sv = 0;
    for (let i = 0; i < 180; i++) { s.step({ throttle: 1, gas: true, brake: true }); if (i > 60) { rpm += car.rpm; n++; sv += (car.slipVel[2] + car.slipVel[3]) / 2; } }
    res[(rwd ? 'rwd' : 'awd') + 'BrakeGasHold'] = { movedMm: r2(Math.abs(car.pos.z - z0) * 1000, 0), rpm: r2(rpm / n, 0), launch: car.launch, burnout: car.burnout, rearSlipMs: r2(sv / n, 1) };
  }

  // ---- 3б. бёрнаут: ручник + газ на месте (автомат). Задние буксуют,
  // передние держит тормоз, машина стоит; отпустил ручник — уходит.
  for (const rwd of [false, true]) for (const esp of ['on', 'off']) {
    const car = mk({ esp }, rwd), s = rig(car);
    for (let i = 0; i < 30; i++) s.step({});
    const z0 = car.pos.z; let n = 0, sv = 0, rpm = 0, fr = 0, burn = 0;
    for (let i = 0; i < 240; i++) {
      s.step({ throttle: 1, gas: true, handbrake: true });
      if (i > 60) { n++; sv += (car.slipVel[2] + car.slipVel[3]) / 2; rpm = Math.max(rpm, car.rpm); fr = Math.max(fr, Math.abs(car._om[0])); burn += car.burnout ? 1 : 0; }
    }
    const moved = Math.abs(car.pos.z - z0);
    const t0 = s.t; let t50 = null;
    while (s.t < t0 + 6 && t50 === null) { s.step({ throttle: 1, gas: true }); if (s.v * KMH >= 50) t50 = s.t - t0; }
    res[(rwd ? 'rwd' : 'awd') + 'Burnout_' + esp] = { burnoutPct: r2(100 * burn / n, 0), movedM: r2(moved, 2), rearSlipMs: r2(sv / n, 1), frontWheelRad: r2(fr, 2), rpmMax: Math.round(rpm), t0to50afterRelease: r2(t50) };
  }

  // ---- 4. занос газом в повороте на 50 км/ч (руль до упора, газ в пол 3 с),
  // потом «игрок» ловит контррулём; по режимам ESP, полный и задний привод
  for (const rwd of [false, true]) for (const esp of ['on', 'sport', 'off']) {
    const car = mk({ esp }, rwd), s = rig(car);
    const vt = 50 / KMH;
    while (s.v < vt && s.t < 20) s.step({ throttle: hold(s, vt) });
    for (let i = 0; i < 60; i++) s.step({ throttle: hold(s, vt), steer: 0.8 });
    const t0 = s.t; let maxB = 0, espT = 0, asrT = 0;
    while (s.t < t0 + 3) { s.step({ throttle: 1, steer: 1 }); maxB = Math.max(maxB, Math.abs(s.beta)); if (car.espActive > 0.08) espT += DT; if (car.asrActive) asrT += DT; }
    // ловля: газ бросил, руль против
    const t1 = s.t; let calm = null, spun = 0, acc = 0, py = car.yaw;
    while (s.t < t1 + 6) { s.step({ steer: clamp(s.beta * 4 - s.yawRate * 0.6, -1, 1) }); acc += wrap(car.yaw - py); py = car.yaw; spun = Math.max(spun, Math.abs(acc));
      if (calm === null && Math.abs(s.beta) < 0.05 && Math.abs(s.yawRate) < 0.08) calm = s.t - t1; }
    res[(rwd ? 'rwd' : 'awd') + 'Slide_' + esp] = { maxBetaDeg: r2(maxB * 180 / Math.PI, 1), espActiveS: r2(espT, 1), asrActiveS: r2(asrT, 1), kmh: r2(s.v * KMH, 0), caughtAfterS: r2(calm), spunDeg: r2(spun * 180 / Math.PI, 0) };
  }
  return res;
});
console.log('\n=== помощники ===');
for (const [k, v] of Object.entries(out)) console.log(k.padEnd(18), Object.entries(v).map(([a, b]) => `${a}=${b}`).join('  '));
await browser.close();
