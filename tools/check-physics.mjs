// Стенд физики машины: числа вместо «вроде едет».
//
// Зачем: управляемость на глаз не принять — «стало лучше» у каждого своё, а
// разгон, тормозной путь, боковое ускорение и тряска кузова меряются. Скрипт
// поднимает игру в headless-браузере и гоняет машину программно, шагая физику
// напрямую (car.update с шагом 1/60, как кадр игры), поэтому результат не
// зависит от FPS: в headless он ~10, и по настоящим кадрам мерить нельзя.
//
// Два полигона:
//   • ровная плита (подставной рельеф) — разгон, максималка, торможение,
//     круг, прямая на 250, занос и его ловля;
//   • настоящая улица (Большая Морская от точки −398, 484) — стоянка 10 с
//     и проезд на 60 км/ч с замером вертикальной тряски кузова.
//
//   python3 tools/serve.py 5191 .            # сервер должен быть поднят
//   node tools/check-physics.mjs --port 5191
//   node tools/check-physics.mjs --port 5191 --json out.json   # числа в файл
//   node tools/check-physics.mjs --only flat                   # без улицы
//
// Playwright в зависимости проекта не входит. Путь к нему — переменная
// PLAYWRIGHT (по умолчанию пробуем пакет 'playwright', потом известный путь).

import { writeFileSync } from 'node:fs';

const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name);
  return i > 0 ? process.argv[i + 1] : def;
};
const PORT = arg('port', '5191');
const ONLY = arg('only', '');
const JSON_OUT = arg('json', '');
const START = (arg('start', '-398,484')).split(',').map(Number);

async function loadPlaywright() {
  const tries = [process.env.PLAYWRIGHT, 'playwright',
    '/Users/aleksandrkanakov/Downloads/domiro/node_modules/playwright/index.mjs'].filter(Boolean);
  for (const t of tries) {
    try { return await import(t); } catch { /* следующий */ }
  }
  throw new Error('playwright не найден: задайте PLAYWRIGHT=/путь/к/playwright/index.mjs');
}
const { chromium } = await loadPlaywright();

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error') errors.push('консоль: ' + m.text().slice(0, 200)); });

await page.goto(`http://127.0.0.1:${PORT}/web/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.G && window.G.car, null, { timeout: 180000 });

// Всё, что ниже, исполняется в странице.
const result = await page.evaluate(async ({ ONLY, START }) => {
  const G = window.G;
  const Car = G.car.constructor;
  const DT = 1 / 60, KMH = 3.6, G0 = 9.81;
  const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const r2 = (v, n = 2) => v === null || v === undefined || !isFinite(v) ? null : +v.toFixed(n);

  // Игровой цикл продолжает крутиться и звал бы car.update с пустым вводом —
  // глушим его, машиной управляет только стенд.
  const realUpdate = G.car.update.bind(G.car);
  G.car.update = () => {};

  // ---- ровная плита
  const flatTerrain = {
    driveHeightAt: () => 10, groundDriveHeightAt: () => 10, gridHeightAt: () => 10,
    heightAt: () => 10, deckAt: () => null, corridorAt: () => 10,
  };
  const noWalls = { resolve: () => null };
  const mkFlat = () => { const c = new Car(flatTerrain, noWalls); c.reset(0, 0, 0); return c; };

  // Обёртка: шаг + скорость и рыскание ПО ПОЛОЖЕНИЮ (не верим полям модели).
  function rig(car, step = (dt, inp) => car.update(dt, inp)) {
    const s = { t: 0, v: 0, yawRate: 0, dist: 0, vy: 0, ay: 0, x: car.pos.x, y: car.pos.y, z: car.pos.z, yaw: car.yaw, beta: 0 };
    s.step = inp => {
      step(DT, { throttle: inp.throttle || 0, steer: inp.steer || 0, handbrake: !!inp.handbrake, gas: !!inp.gas, brake: !!inp.brake });
      const dx = car.pos.x - s.x, dz = car.pos.z - s.z;
      const d = Math.hypot(dx, dz);
      s.v = d / DT; s.dist += d;
      const vy = (car.pos.y - s.y) / DT;
      s.ay = (vy - s.vy) / DT; s.vy = vy;
      s.yawRate = wrap(car.yaw - s.yaw) / DT;
      // угол увода кузова: между курсом и направлением движения
      s.beta = d > 0.02 ? wrap(Math.atan2(dx, dz) - car.yaw) : 0;
      if (s.beta > Math.PI / 2) s.beta -= Math.PI; else if (s.beta < -Math.PI / 2) s.beta += Math.PI;
      s.x = car.pos.x; s.y = car.pos.y; s.z = car.pos.z; s.yaw = car.yaw; s.t += DT;
    };
    return s;
  }
  // держать скорость: газ пропорционально недобору
  const hold = (s, vt) => clamp((vt - s.v) * 0.6, 0, 1);

  const out = {};

  if (!ONLY || ONLY === 'flat') {
    // ---- 1. разгон и максималка
    {
      const car = mkFlat(), s = rig(car);
      let t100 = null, t200 = null, d400 = null;
      while (s.t < 100) {
        s.step({ throttle: 1 });
        if (t100 === null && s.v * KMH >= 100) t100 = s.t;
        if (t200 === null && s.v * KMH >= 200) t200 = s.t;
        if (d400 === null && s.dist >= 402.3) d400 = s.t;
      }
      out.accel = { t100: r2(t100), t200: r2(t200), quarterMile: r2(d400), vmaxKmh: r2(s.v * KMH, 1),
                    driftDeg: r2(wrap(car.yaw) * 180 / Math.PI, 3), driftM: r2(car.pos.x, 2) };
    }
    // ---- 2. торможение со 100 и с 200
    for (const v0 of [100, 200]) {
      const car = mkFlat(), s = rig(car);
      while (s.v * KMH < v0 && s.t < 60) s.step({ throttle: 1 });
      const d0 = s.dist, t0 = s.t, yaw0 = car.yaw;
      while (s.v > 0.15 && s.t < t0 + 20) s.step({ throttle: -1 });
      // после остановки S включает задний ход — меряем до первой остановки
      out['brake' + v0] = { dist: r2(s.dist - d0, 1), time: r2(s.t - t0), g: r2((v0 / KMH) ** 2 / (2 * (s.dist - d0)) / G0),
                            yawDeg: r2(wrap(car.yaw - yaw0) * 180 / Math.PI, 2) };
    }
    // ---- 3. круг: руль до упора, скорость держим
    for (const v0 of [60, 120]) {
      const car = mkFlat(), s = rig(car);
      const vt = v0 / KMH;
      while (s.v < vt * 0.98 && s.t < 40) s.step({ throttle: hold(s, vt) });
      const t0 = s.t;
      let n = 0, sv = 0, sw = 0, sb = 0, maxA = 0;
      while (s.t < t0 + 14) {
        s.step({ throttle: hold(s, vt), steer: 1 });
        if (s.t > t0 + 8) { n++; sv += s.v; sw += s.yawRate; sb += s.beta; }
        maxA = Math.max(maxA, Math.abs(s.v * s.yawRate) / G0);
      }
      const v = sv / n, w = sw / n;
      out['circle' + v0] = { kmh: r2(v * KMH, 1), radius: r2(Math.abs(v / w), 1), gLat: r2(Math.abs(v * w) / G0),
                             gLatPeak: r2(maxA), betaDeg: r2(sb / n * 180 / Math.PI, 1), roll: r2((car.roll || 0) * 180 / Math.PI, 1) };
    }
    // ---- 4. прямая на 250 и реакция на рывок рулём
    {
      const car = mkFlat(), s = rig(car);
      const vt = 250 / KMH;
      while (s.v < vt * 0.99 && s.t < 70) s.step({ throttle: hold(s, vt) });
      const reached = s.v * KMH;
      const yaw0 = car.yaw, x0 = car.pos.x, z0 = car.pos.z, t0 = s.t;
      let maxW = 0, sa = 0, n = 0;
      while (s.t < t0 + 10) { s.step({ throttle: hold(s, vt) }); maxW = Math.max(maxW, Math.abs(s.yawRate)); sa += s.ay * s.ay; n++; }
      // отклонение от прямой, заданной курсом в начале
      const lat = (car.pos.x - x0) * Math.cos(yaw0) - (car.pos.z - z0) * Math.sin(yaw0);
      const straight = { kmh: r2(reached, 1), driftDeg: r2(wrap(car.yaw - yaw0) * 180 / Math.PI, 3), lateralM: r2(lat, 2),
                         maxYawRate: r2(maxW, 4), ayRms: r2(Math.sqrt(sa / n), 3) };
      // рывок: 0.2 с руля, потом отпустить
      const t1 = s.t; let peak = 0, peakB = 0;
      while (s.t < t1 + 0.2) { s.step({ throttle: hold(s, vt), steer: 1 }); peak = Math.max(peak, Math.abs(s.yawRate)); }
      let late = 0;
      while (s.t < t1 + 4.2) {
        s.step({ throttle: hold(s, vt) });
        peak = Math.max(peak, Math.abs(s.yawRate)); peakB = Math.max(peakB, Math.abs(s.beta));
        if (s.t > t1 + 3.2) late = Math.max(late, Math.abs(s.yawRate));
      }
      straight.kick = { peakYawRate: r2(peak, 3), peakBetaDeg: r2(peakB * 180 / Math.PI, 1), yawRateAfter3s: r2(late, 4), kmhAfter: r2(s.v * KMH, 1) };
      out.straight250 = straight;
    }
    // ---- 5/6. занос и ловля. «Игрок»: газ бросил, руль против вращения,
    // пока кузов идёт боком. Поймал — угол увода и рыскание ушли в ноль.
    const catchDrift = (s, car, tMax = 8, gasHold = 0) => {
      const t0 = s.t; let spun = 0, calm = 0, tCatch = null;
      const yawStart = car.yaw; let yawAcc = 0, prevYaw = car.yaw;
      while (s.t < t0 + tMax) {
        const b = s.beta;
        // руль в сторону, куда едет машина (β<0 — корма ушла влево от движения…)
        const st = clamp(b * 4 - s.yawRate * 0.6, -1, 1);
        // gasHold > 0 — «дрифтер»: держит немного газа, пока угол не больше 30°
        s.step({ throttle: gasHold && Math.abs(b) < 0.52 ? gasHold : 0, steer: st });
        yawAcc += wrap(car.yaw - prevYaw); prevYaw = car.yaw;
        if (Math.abs(s.beta) < 0.05 && Math.abs(s.yawRate) < 0.08 || s.v < 2) { calm += DT; if (calm > 0.5 && tCatch === null) tCatch = s.t - t0 - 0.5; }
        else calm = 0;
        spun = Math.max(spun, Math.abs(yawAcc));
      }
      return { caught: tCatch !== null && spun < Math.PI * 0.75, tCatch: r2(tCatch), yawTravelDeg: r2(spun * 180 / Math.PI, 0), kmhEnd: r2(s.v * KMH, 0) };
    };
    {
      const car = mkFlat(), s = rig(car);
      const vt = 50 / KMH;
      while (s.v < vt && s.t < 20) s.step({ throttle: hold(s, vt) });
      const t0 = s.t; let maxB = 0;
      while (s.t < t0 + 3) { s.step({ throttle: 1, steer: 1 }); maxB = Math.max(maxB, Math.abs(s.beta)); }
      out.powerslide = { maxBetaDeg: r2(maxB * 180 / Math.PI, 1), kmh: r2(s.v * KMH, 0), ...catchDrift(s, car) };
    }
    {
      const car = mkFlat(), s = rig(car);
      const vt = 80 / KMH;
      while (s.v < vt && s.t < 20) s.step({ throttle: hold(s, vt) });
      const t0 = s.t; let maxB = 0;
      while (s.t < t0 + 0.6) { s.step({ steer: 1, handbrake: true }); maxB = Math.max(maxB, Math.abs(s.beta)); }
      out.handbrake = { maxBetaDeg: r2(maxB * 180 / Math.PI, 1), kmh: r2(s.v * KMH, 0), ...catchDrift(s, car) };
    }
    // ---- 7. змейка на 100: руль влево-вправо по секунде, машина обязана
    // слушаться и не разворачиваться
    {
      const car = mkFlat(), s = rig(car);
      const vt = 100 / KMH;
      while (s.v < vt && s.t < 20) s.step({ throttle: hold(s, vt) });
      const t0 = s.t; let maxB = 0, maxG = 0;
      while (s.t < t0 + 8) {
        const ph = Math.floor((s.t - t0) / 1.0) % 2;
        s.step({ throttle: hold(s, vt), steer: ph ? -1 : 1 });
        maxB = Math.max(maxB, Math.abs(s.beta)); maxG = Math.max(maxG, Math.abs(s.v * s.yawRate) / G0);
      }
      out.slalom100 = { maxBetaDeg: r2(maxB * 180 / Math.PI, 1), gLatPeak: r2(maxG), kmhEnd: r2(s.v * KMH, 0) };
    }
    // ---- 7б. задний привод (режим Drift): тот же занос газом в повороте и
    // ловля. Два «игрока»: бросил газ совсем — и придержал газ контррулём.
    if (Car.prototype.toggleDrive) {
      const rwdRun = (gasHold) => {
        const car = mkFlat(); car.toggleDrive();
        const s = rig(car);
        const vt = 50 / KMH;
        while (s.v < vt && s.t < 20) s.step({ throttle: hold(s, vt) });
        const t0 = s.t; let maxB = 0;
        while (s.t < t0 + 3) s.step({ throttle: hold(s, vt), steer: 0.7 });
        const t1 = s.t;
        while (s.t < t1 + 0.8) { s.step({ throttle: 1, steer: 0.7 }); maxB = Math.max(maxB, Math.abs(s.beta)); }
        return { maxB, kmh: s.v * KMH, ...catchDrift(s, car, 8, gasHold) };
      };
      const a = rwdRun(0), b = rwdRun(0.35);
      out.rwdPowerslide = { maxBetaDeg: r2(a.maxB * 180 / Math.PI, 1), kmh: r2(a.kmh, 0),
        liftCaught: a.caught, liftYawDeg: a.yawTravelDeg, gasCaught: b.caught, gasTCatch: b.tCatch, gasYawDeg: b.yawTravelDeg, gasKmhEnd: b.kmhEnd };
    }
    // ---- 7в. бёрнаут: газ + тормоз на месте. Передние держит тормоз, задние
    // буксуют; машина не должна уехать. На полном и на заднем приводе.
    if (Car.prototype.toggleDrive) for (const rwd of [false, true]) {
      const car = mkFlat(); if (rwd) car.toggleDrive();
      const s = rig(car);
      for (let i = 0; i < 60; i++) s.step({});
      const z0 = car.pos.z;
      let n = 0, sv = 0, rpm = 0, fr = 0, lim = 0;
      while (n < 240) {
        s.step({ gas: true, brake: true });
        n++;
        if (n > 60) { sv += (car.slipVel[2] + car.slipVel[3]) / 2; rpm = Math.max(rpm, car.rpm); fr = Math.max(fr, Math.abs(car._om[0])); lim += car.limiter; }
      }
      const moved = car.pos.z - z0;
      // отпустили тормоз — уходит с пробуксовкой
      const t0 = s.t; let t50 = null;
      while (s.t < t0 + 6 && t50 === null) { s.step({ throttle: 1, gas: true }); if (s.v * KMH >= 50) t50 = s.t - t0; }
      out[rwd ? 'burnoutRwd' : 'burnoutAwd'] = { movedM: r2(moved, 2), rearSlipMs: r2(sv / 180, 1), frontWheelRad: r2(fr, 2),
        rpmMax: Math.round(rpm), limiterPct: r2(100 * lim / 180, 0), t0to50afterRelease: r2(t50) };
    }
    // ---- 7г. нейтраль: газ крутит мотор без тяги, до отсечки; из N в D на
    // оборотах — старт с пробуксовкой
    if (Car.prototype.setMode) {
      const car = mkFlat(); car.setMode('N');
      const s = rig(car);
      let tLim = null, rpmMax = 0;
      while (s.t < 2.5) { s.step({ throttle: 1 }); rpmMax = Math.max(rpmMax, car.rpm); if (tLim === null && car.rpm > 6900) tLim = s.t; }
      const moved = car.pos.z;
      car.setMode('D');
      const t0 = s.t; let t50 = null, slipMax = 0;
      while (s.t < t0 + 6 && t50 === null) { s.step({ throttle: 1 }); slipMax = Math.max(slipMax, car.slipVel[2]); if (s.v * KMH >= 50) t50 = s.t - t0; }
      out.neutral = { tToLimiter: r2(tLim), rpmMax: Math.round(rpmMax), movedM: r2(moved, 3), dumpLaunch0to50: r2(t50), rearSlipMaxMs: r2(slipMax, 1) };
      const p = mkFlat(); p.setMode('P'); const sp = rig(p);
      while (sp.t < 2) sp.step({ throttle: 1 });
      out.parkGas = { movedMm: r2(Math.abs(p.pos.z) * 1000, 1), rpm: Math.round(p.rpm), gear: p.gearLabel };
    }
    // ---- 8. стоянка на плите и на косогоре 10%: не ползти и не дрожать
    for (const [name, slope] of [['parkFlat', 0], ['parkSlope', 0.10]]) {
      const hAt = (x, z) => 10 + x * slope * 0.7 + z * slope * 0.7;
      const t = { ...flatTerrain, driveHeightAt: hAt, groundDriveHeightAt: hAt, gridHeightAt: hAt };
      const car = new Car(t, noWalls); car.reset(0, 0, 0);
      const s = rig(car);
      for (let i = 0; i < 120; i++) s.step({});          // дать сесть на подвеску
      const x0 = car.pos.x, z0 = car.pos.z, y0 = car.pos.y, yaw0 = car.yaw;
      let sa = 0, n = 0, maxV = 0, dyMax = 0;
      while (n < 600) { s.step({}); sa += s.ay * s.ay; n++; maxV = Math.max(maxV, s.v); dyMax = Math.max(dyMax, Math.abs(car.pos.y - y0)); }
      out[name] = { moveMm: r2(Math.hypot(car.pos.x - x0, car.pos.z - z0) * 1000, 1), dyMm: r2(dyMax * 1000, 2),
                    yawDeg: r2(wrap(car.yaw - yaw0) * 180 / Math.PI, 3), ayRms: r2(Math.sqrt(sa / n), 4), vMaxMm: r2(maxV * 1000, 2) };
    }
  }

  if (!ONLY || ONLY === 'street') {
    // ---- настоящая улица
    const car = G.car;
    G.jumpTo(START[0], START[1]);
    const idle = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 100; i++) {
      await idle(200);
      if (G.chunks.has(G.chunks.keyAt(START[0], START[1])) && G.terrain.surfaceAt(START[0], START[1]) && G.roads.nearest(START[0], START[1], 80, r => r.c <= 3)) break;
    }
    await idle(1500);

    // Маршрут: от ближайшей проезжей части цепочкой звеньев, на стыке берём
    // продолжение с наименьшим поворотом. У дорог нет имён — только геометрия.
    const hit = G.roads.nearest(START[0], START[1], 80, r => r.c <= 3);
    const route = [];
    if (hit) {
      const used = new Set();
      let r = hit.road, p = r.pts, n = p.length / 2;
      // ближайшая вершина и направление «на северо-восток» (к площади Лазарева)
      let best = 0, bd = 1e9;
      for (let i = 0; i < n; i++) { const d = Math.hypot(p[i * 2] - hit.x, p[i * 2 + 1] - hit.z); if (d < bd) { bd = d; best = i; } }
      let dir = (p[(n - 1) * 2] - p[0]) > 0 ? 1 : -1;
      route.push([hit.x, hit.z]);
      let i = best, len = 0;
      for (let guard = 0; guard < 400 && len < 520; guard++) {
        i += dir;
        if (i < 0 || i >= n) {
          used.add(r);
          const ex = p[(i - dir) * 2], ez = p[(i - dir) * 2 + 1];
          const pi = (i - dir) - dir;
          const hx = ex - p[pi * 2], hz = ez - p[pi * 2 + 1];
          let nb = null, nbScore = 0.5;                   // не круче ~60°
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
    }
    const routeLen = route.reduce((a, q, i) => i ? a + Math.hypot(q[0] - route[i - 1][0], q[1] - route[i - 1][1]) : 0, 0);
    const yawOf = (a, b) => Math.atan2(b[0] - a[0], b[1] - a[1]);

    // ---- сырые данные полотна вдоль осевой: насколько неровен сам профиль
    {
      const H = [], XZ = [], step = 0.25;
      for (let k = 1; k < route.length; k++) {
        const a = route[k - 1], b = route[k], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        for (let d = 0; d < L; d += step) {
          const x = a[0] + (b[0] - a[0]) * d / L, z = a[1] + (b[1] - a[1]) * d / L;
          H.push(G.terrain.driveHeightAt(x, z)); XZ.push([x, z]);
        }
      }
      let maxStep = 0, kinks = 0, maxKink = 0, s2 = 0, at = 0;
      for (let i = 1; i < H.length - 1; i++) {
        const dd = H[i + 1] - 2 * H[i] + H[i - 1];           // вторая разность на 0.25 м
        const kink = Math.abs(dd) / step;                    // перелом уклона, доли
        if (kink > maxKink) { maxKink = kink; at = i; }
        if (kink > 0.02) kinks++;
        maxStep = Math.max(maxStep, Math.abs(H[i] - H[i - 1]));
        s2 += dd * dd;
      }
      // «волна» профиля: насколько гуляет уклон на отрезках по 5 м (шаг коридора)
      let sMin = 1, sMax = -1, curv = 0;
      for (let i = 0; i + 40 < H.length; i += 4) {
        const s1 = (H[i + 20] - H[i]) / 5, s2b = (H[i + 40] - H[i + 20]) / 5;
        sMin = Math.min(sMin, s1); sMax = Math.max(sMax, s1);
        curv = Math.max(curv, Math.abs(s2b - s1) / 5);
      }
      const wAt = XZ[at] || [0, 0];
      const src = G.terrain.corridorAt(wAt[0], wAt[1]) === null ? 'сетка рельефа' : G.terrain.deckAt(wAt[0], wAt[1]) ? 'мост' : 'коридор';
      // во что это превращается для точки, приклеенной к профилю, на 60 км/ч
      const v = 60 / KMH;
      out.roadProfile = { lengthM: r2(routeLen, 0), samples: H.length, maxStepCm: r2(maxStep * 100, 1), maxSlopeBreakPct: r2(maxKink * 100, 1),
                          maxBreakAt: `${wAt[0].toFixed(0)},${wAt[1].toFixed(0)} (${src})`,
                          breaksOver2pct: kinks, gluedAyRms60: r2(Math.sqrt(s2 / H.length) / (step * step) * v * v, 1),
                          slopeMinPct: r2(sMin * 100, 1), slopeMaxPct: r2(sMax * 100, 1),
                          // вертикальное ускорение на самой крутой «волне» при 60 и 100 км/ч — его даёт форма дороги, не подвеска
                          waveG60: r2(curv * v * v / G0), waveG100: r2(curv * (100 / KMH) ** 2 / G0),
                          climbM: r2(H[H.length - 1] - H[0], 1) };
    }

    // ---- стоянка 10 с на улице
    if (route.length > 1) {
      car.reset(route[0][0], route[0][1], yawOf(route[0], route[1]));
      const s = rig(car, realUpdate);
      for (let i = 0; i < 120; i++) s.step({});
      const x0 = car.pos.x, z0 = car.pos.z, y0 = car.pos.y, yaw0 = car.yaw;
      let sa = 0, n = 0, maxV = 0, dyMax = 0;
      while (n < 600) { s.step({}); sa += s.ay * s.ay; n++; maxV = Math.max(maxV, s.v); dyMax = Math.max(dyMax, Math.abs(car.pos.y - y0)); }
      out.parkStreet = { moveMm: r2(Math.hypot(car.pos.x - x0, car.pos.z - z0) * 1000, 1), dyMm: r2(dyMax * 1000, 2),
                         yawDeg: r2(wrap(car.yaw - yaw0) * 180 / Math.PI, 3), ayRms: r2(Math.sqrt(sa / n), 4), vMaxMm: r2(maxV * 1000, 2) };
    }

    // ---- проезд по улице. Рулим «погоней за точкой» на осевой впереди.
    for (const kmh of [60, 100]) {
      if (route.length < 3) break;
      car.reset(route[0][0], route[0][1], yawOf(route[0], route[1]));
      const s = rig(car, realUpdate);
      const vt = kmh / KMH;
      let seg = 1, sa = 0, n = 0, maxA = 0, big = 0, sp = 0, sr = 0, air = 0, offMax = 0;
      const win = [], WN = 30; let wsum = 0, shf = 0, hfMax = 0;      // окно 0.5 с: всё, что медленнее, — форма дороги
      let pPitch = car.pitch, pRoll = car.roll, steps = 0, crash = 0;
      while (seg < route.length && s.t < 90) {
        // точка прицеливания: 6 м + 0.35 с хода вперёд по ломаной
        let need = 6 + s.v * 0.35, k = seg, tx = route[k][0], tz = route[k][1];
        let cx = car.pos.x, cz = car.pos.z;
        while (k < route.length) {
          const d = Math.hypot(route[k][0] - cx, route[k][1] - cz);
          if (d >= need) { tx = cx + (route[k][0] - cx) * need / d; tz = cz + (route[k][1] - cz) * need / d; break; }
          need -= d; cx = route[k][0]; cz = route[k][1]; tx = cx; tz = cz; k++;
        }
        if (Math.hypot(route[seg][0] - car.pos.x, route[seg][1] - car.pos.z) < 5) { seg++; continue; }
        const err = wrap(Math.atan2(tx - car.pos.x, tz - car.pos.z) - car.yaw);
        const steer = clamp(err * 2.2, -1, 1);
        s.step({ throttle: hold(s, vt), steer });
        steps++;
        if (s.dist > 40) {                                   // разгон в зачёт не идёт
          sa += s.ay * s.ay; n++; maxA = Math.max(maxA, Math.abs(s.ay));
          if (Math.abs(s.ay) > 0.5 * G0) big++;
          win.push(s.ay); wsum += s.ay;
          if (win.length > WN) wsum -= win.shift();
          if (win.length === WN) { const hf = win[WN >> 1] - wsum / WN; shf += hf * hf; hfMax = Math.max(hfMax, Math.abs(hf)); }
          const dp = (car.pitch - pPitch) / DT, dr = (car.roll - pRoll) / DT;
          sp += dp * dp; sr += dr * dr;
          if (car.airborne) air++;
          crash = Math.max(crash, car.crash || 0);
        }
        pPitch = car.pitch; pRoll = car.roll;
        if (steps % 90 === 0) await idle(0);                 // дать городу догрузиться
      }
      out['street' + kmh] = { distM: r2(s.dist, 0), kmhAvg: r2(s.dist / s.t * KMH, 0), ayRms: r2(Math.sqrt(sa / Math.max(1, n)), 2), ayMax: r2(maxA, 1),
                              shakeRms: r2(Math.sqrt(shf / Math.max(1, n)), 2), shakeMax: r2(hfMax, 1),
                              joltsOver05g: big, pitchRateRms: r2(Math.sqrt(sp / Math.max(1, n)), 3), rollRateRms: r2(Math.sqrt(sr / Math.max(1, n)), 3),
                              airbornePct: r2(100 * air / Math.max(1, n), 1), crash: r2(crash), reachedEnd: seg >= route.length };
    }
  }
  G.car.update = realUpdate;
  return out;
}, { ONLY, START });

await browser.close();

// ---- печать
const row = (name, o) => console.log(name.padEnd(15) + Object.entries(o || {}).map(([k, v]) =>
  `${k}=${typeof v === 'object' && v !== null ? JSON.stringify(v) : v}`).join('  '));
console.log('\n=== физика машины ===');
for (const [k, v] of Object.entries(result)) row(k, v);
if (errors.length) { console.log('\nошибки страницы:'); for (const e of errors.slice(0, 10)) console.log('  ' + e); }
if (JSON_OUT) { writeFileSync(JSON_OUT, JSON.stringify(result, null, 1)); console.log('\nзаписано: ' + JSON_OUT); }
