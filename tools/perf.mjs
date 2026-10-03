// Стенд кадров: node tools/perf.mjs <порт|адрес> [метка] [out.json] [--quick]
//
// Мерит НЕ в headless: там всегда ~10 кадров и до, и после, и замер ничего не
// говорит. Открывает настоящее окно Chromium (ретина, 1400×880 точек), ждёт
// загрузки и проходит один и тот же маршрут через тяжёлые места:
//   старт    — стоим на остановке пл. Лазарева, пока догружается круг 2.6 км;
//   езда     — автопилот по проспекту Нахимова до площади и дальше по Ленина;
//   низко    — полёт на 35 м: пл. Нахимова → Большая Морская → пл. Восставших
//              (больница, рынок) → старое кладбище;
//   высоко   — подъём на 150 м и пролёт обратно над центром.
// Печатает по каждому этапу средний fps, 1% low, худший кадр, число кадров
// длиннее 50 и 100 мс и разбор самых длинных: что в этот кадр делалось
// (сборка квартала и её этап, земля, физика, отрисовка, новые шейдеры,
// разбор GLB). «Лагает» — это именно залипания, средний fps тут вторичен.
import { chromium } from '/Users/aleksandrkanakov/Downloads/domiro/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const quick = args.includes('--quick');
const pos = args.filter(a => !a.startsWith('--'));
const base = /^\d+$/.test(pos[0] || '') ? `http://localhost:${pos[0]}` : (pos[0] || 'http://localhost:5173');
const label = pos[1] || base;
const out = pos[2] || null;

const browser = await chromium.launch({
  headless: false,
  args: [
    '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-precise-memory-info',
    // окно может оказаться за другими — кадры не должны от этого замедляться
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--window-position=0,0',
  ],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 880 }, deviceScaleFactor: 2 });
const prof = [], laps = [];
// Холодный кеш шейдеров. macOS хранит собранные Metal-шейдеры между запусками
// браузера, и второй прогон компиляцию уже почти не видит — а игрок после
// каждого обновления видит. Делаем текст каждой программы уникальным на прогон
// (вызов пустой функции с неповторимым именем) — кеш промахивается всегда.
// --warm — замер с прогретым кешем, как у повторного захода.
if (!args.includes('--warm')) await page.addInitScript(nonce => {
  for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) {
    const src = C.prototype.shaderSource;
    C.prototype.shaderSource = function (sh, s) {
      s = s.replace(/void\s+main\s*\(\s*\)\s*\{/, `float perfN${nonce}(float x){return x;}\nvoid main(){ perfN${nonce}(0.0);`);
      return src.call(this, sh, s);
    };
  }
}, String(Date.now()) + String(Math.random()).slice(2, 8));
page.on('pageerror', e => console.log('PAGEERROR', e.message));
page.on('console', m => {
  const t = m.text();
  if (m.type() === 'error') console.log('CONSOLE', t.slice(0, 300));
  else if (t.startsWith('чанк ')) prof.push(t);
  else if (/^  .*: \d+ мс$/.test(t)) laps.push(t.trim());
});
// Время главного потока в вызовах GL за кадр: что именно стоит в длинном
// кадре — ожидание сборки шейдера (getProgramInfoLog), выгрузка буферов и
// текстур или сами вызовы отрисовки.
await page.addInitScript(() => {
  const acc = window.__glf = {};
  const C = WebGL2RenderingContext;
  for (const name of ['getProgramInfoLog', 'bufferData', 'bufferSubData', 'texImage2D', 'texSubImage2D', 'texStorage2D',
                      'generateMipmap', 'drawElements', 'drawElementsInstanced', 'drawArrays', 'drawArraysInstanced', 'readPixels', 'getError']) {
    const f = C.prototype[name];
    if (!f) continue;
    C.prototype[name] = function (...a) {
      const t = performance.now(); const r = f.apply(this, a);
      acc[name] = (acc[name] || 0) + performance.now() - t;
      return r;
    };
  }
});
const t0 = Date.now();
await page.goto(`${base}/web/?prof`, { waitUntil: 'load' });
await page.waitForFunction(() => window.G && window.G.boot, null, { timeout: 60000, polling: 200 });
const bootMs = await page.evaluate(() => window.G.boot);

// --census: где лежат треугольники и вызовы. Встаём в точки, ждём, пока
// догрузится круг, и раскладываем видимое по сборщикам (дороги, дома, деревья…)
// — отдельно для кадра и для карты теней.
if (args.includes('--census')) {
  const POINTS = [['пл. Лазарева, глаза', -398, 484, 3, -150, 230], ['пл. Нахимова', 0, 0, 3, -100, 400],
    ['пл. Восставших', -757, 1640, 3, -500, 1500], ['кладбище', -1493, 1631, 3, -1300, 1500],
    ['150 м над центром', 0, 0, 150, -300, 900]];
  for (const [name, x, z, h, lx, lz] of POINTS) {
    const c = await page.evaluate(async ([x, z, h, lx, lz]) => {
      const G = window.G, T = G.THREE;
      if (G.mode !== 'fly') { dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF' })); dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyF' })); }
      const f = G.fly;
      const put = () => { f.x = x; f.z = z; f.y = G.terrain.gridHeightAt(x, z) + h; f.vx = f.vy = f.vz = 0;
        f.yaw = Math.atan2(lx - x, lz - z); f.pitch = h > 100 ? -0.45 : -0.03; };
      put();
      const t0 = performance.now();
      while (performance.now() - t0 < 45000 && (G.chunks.pending || G.ground.pending || performance.now() - t0 < 6000)) {
        put(); await new Promise(r => setTimeout(r, 200));
      }
      await new Promise(r => setTimeout(r, 1500));
      const cam = G.camera, sunL = G.scene.children.find(o => o.isDirectionalLight);
      const fr = new T.Frustum(), sfr = new T.Frustum(), m = new T.Matrix4();
      fr.setFromProjectionMatrix(m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
      const sc = sunL.shadow.camera;
      sfr.setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(sc.projectionMatrix, sc.matrixWorldInverse));
      const cat = o => {
        let p = o, last = o;
        while (p.parent && !(p.parent.name || '').startsWith('чанк ') && p.parent !== G.scene) { last = p; p = p.parent; }
        if (p.parent && p.parent.name.startsWith('чанк ')) {
          // внутри чанка: имя сборщика, а у памятных — модель отдельно
          let n = p.name || p.type;
          let q = o; while (q && q !== p) { if ((q.name || '').startsWith('model:')) { n = 'модели'; break; } q = q.parent; }
          return n;
        }
        return (p.name || p.type).replace(/ -?\d+_-?\d+$/, '');
      };
      const acc = {};
      const add = (k, f, v) => { const a = acc[k] || (acc[k] = { calls: 0, tris: 0, sCalls: 0, sTris: 0 }); a[f] += v; };
      G.scene.traverseVisible(o => {
        if (!o.isMesh) return;
        const g = o.geometry;
        let n = (g.index ? g.index.count : g.attributes.position.count) / 3;
        if (g.drawRange && g.drawRange.count !== Infinity) n = Math.min(n, g.drawRange.count / 3);
        if (o.isInstancedMesh) n *= o.count;
        const k = cat(o);
        const mats = Array.isArray(o.material) ? o.material.length : 1;
        if (!o.frustumCulled || fr.intersectsObject(o)) { add(k, 'calls', mats); add(k, 'tris', n); }
        if (o.castShadow && (!o.frustumCulled || sfr.intersectsObject(o))) { add(k, 'sCalls', mats); add(k, 'sTris', n); }
      });
      const info = { calls: G.info.render.calls, tris: G.info.render.triangles, chunks: G.chunks.loaded };
      return { acc, info };
    }, [x, z, h, lx, lz]);
    console.log(`\n## ${name}: renderer.info ${c.info.calls} вызовов, ${(c.info.tris / 1e3).toFixed(0)} тыс. треуг., чанков ${c.info.chunks}`);
    console.log('  сборщик                 кадр: вызовов  треуг.тыс | тени: вызовов  треуг.тыс');
    const rows = Object.entries(c.acc).sort((a, b) => (b[1].tris + b[1].sTris) - (a[1].tris + a[1].sTris));
    for (const [k, a] of rows)
      console.log(`  ${k.slice(0, 22).padEnd(22)} ${String(a.calls).padStart(8)} ${(a.tris / 1e3).toFixed(0).padStart(10)} | ${String(a.sCalls).padStart(8)} ${(a.sTris / 1e3).toFixed(0).padStart(10)}`);
  }
  await browser.close();
  process.exit(0);
}

// --trace=файл: запись трассы Chrome на весь прогон — разбирать, чем занят
// главный поток в кадрах, которые приборы внутри страницы не объясняют
// (сборка мусора, приём чанка от воркера, ожидание GPU).
const traceArg = args.find(a => a.startsWith('--trace='));
if (traceArg) await browser.startTracing(page, { path: traceArg.slice(8), screenshots: false,
  categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'v8', 'v8.gc', 'blink.user_timing', 'gpu', 'toplevel'] });

const res = await page.evaluate(async ({ quick }) => {
  const G = window.G;
  const now = () => performance.now();
  // ---- приборы: оборачиваем то, что зовёт цикл игры, на экземплярах
  const cur = { build: 0, ground: 0, phys: 0, stage: '', key: '' };
  const frames = [];                 // по одному на отрисовку игры
  const wrap = (obj, name, field) => {
    const f = obj[name].bind(obj);
    obj[name] = (...a) => { const s = now(); try { return f(...a); } finally { cur[field] += now() - s; } };
  };
  wrap(G.chunks, 'update', 'build');
  wrap(G.ground, 'update', 'ground');
  const r = G.renderer;
  const render = r.render.bind(r);
  let progs = r.info.programs ? r.info.programs.length : 0;
  let geoms = r.info.memory.geometries, texs = r.info.memory.textures;
  r.render = (s, c) => {
    const st = now();
    // этап сборки снимаем ДО отрисовки: после неё генератор уже мог уйти дальше
    cur.stage = G.chunkProf.cur; cur.key = G.chunks.building ? G.chunks.building.key : '';
    render(s, c);
    const e = now();
    const p = r.info.programs ? r.info.programs.length : 0;
    const gl = {};
    for (const k in window.__glf) { const v = window.__glf[k]; if (v > 2) gl[k.replace(/Instanced|Elements|Arrays/g, m => m[0])] = Math.round(v); window.__glf[k] = 0; }
    const pn = p > progs ? r.info.programs.slice(progs).map(x => (x.name || x.cacheKey.slice(0, 24))).join(',') : '';
    frames.push({ progNames: pn, gl: Object.entries(gl).map(([k, v]) => k + ' ' + v).join(' '), t: e, render: e - st, build: cur.build, ground: cur.ground, phys: cur.phys,
                  stage: cur.key ? cur.stage + ' ' + cur.key : '', newProg: p - progs,
                  newGeo: r.info.memory.geometries - geoms, newTex: r.info.memory.textures - texs,
                  calls: r.info.render.calls, tris: r.info.render.triangles });
    progs = p; geoms = r.info.memory.geometries; texs = r.info.memory.textures;
    cur.build = cur.ground = cur.phys = 0;
  };
  // Разбор GLB идёт вне цикла (колбэк загрузчика) — его время видно только тут.
  const glb = [];
  try {
    const v = document.querySelector('meta[name="build"]')?.content || '';
    const { GLTFLoader } = await import(`/web/lib/GLTFLoader.js${v ? '?v=' + v : ''}`);
    const parse = GLTFLoader.prototype.parse;
    GLTFLoader.prototype.parse = function (data, path, onLoad, onError) {
      const s = now(), bytes = data.byteLength || 0;
      const rec = { t: s, bytes, sync: 0, total: 0 };
      glb.push(rec);
      const r = parse.call(this, data, path, g => { rec.total = now() - s; onLoad(g); }, onError);
      rec.sync = now() - s;
      return r;
    };
  } catch (e) { glb.push({ error: String(e) }); }

  // ---- автопилот
  const car = G.car;
  const carUpd = car.update.bind(car);
  let input = null;
  car.update = (dt, inp) => { const s = now(); try { return carUpd(dt, input || inp); } finally { cur.phys += now() - s; } };
  const key = code => {
    dispatchEvent(new KeyboardEvent('keydown', { code }));
    dispatchEvent(new KeyboardEvent('keyup', { code }));
  };
  const ROUTE = [-422,533, -403,508, -391,492, -354,442, -297,371, -293,366, -200,239, -195,227, -194,225,
    -190,204, -188,176, -184,106, -182,79, -181,57, -178,41, -173,30, -165,19, -156,12, -145,6, -129,2,
    -118,1, -111,0, -77,-4, -56,-4, -41,4, -32,18, -18,41, -14,50, -11,58, -8,120, -3,182, -1,263, 2,310,
    7,390, 13,459, 21,508, 34,581, 44,616, 65,689, 84,755, 115,856, 133,930, 164,1139];
  const wp = [];
  for (let i = 0; i < ROUTE.length; i += 2) wp.push([ROUTE[i], ROUTE[i + 1]]);
  let wi = 1, stuck = 0, steerSign = 1;
  const wrapPi = a => Math.atan2(Math.sin(a), Math.cos(a));
  function pilot(dt) {
    const p = car.pos;
    // ближайшая точка впереди на 18 м
    while (wi < wp.length - 1 && Math.hypot(wp[wi][0] - p.x, wp[wi][1] - p.z) < 18) wi++;
    const [tx, tz] = wp[wi];
    const want = Math.atan2(tx - p.x, tz - p.z);
    const err = wrapPi(want - car.yaw);
    const kmh = Math.abs(car.kmh);
    const target = Math.abs(err) > 0.5 ? 25 : 55;
    if (kmh < 2) stuck += dt; else stuck = 0;
    if (stuck > 2.5 && wi < wp.length - 1) {       // упёрлись — ставим на следующую точку
      const [nx, nz] = wp[wi], [mx, mz] = wp[Math.min(wi + 1, wp.length - 1)];
      car.reset(nx, nz, Math.atan2(mx - nx, mz - nz)); wi++; stuck = 0;
    }
    input = { throttle: kmh < target ? 1 : kmh > target + 8 ? -0.4 : 0,
              steer: Math.max(-1, Math.min(1, err * 2.2 * steerSign)), handbrake: false };
  }

  // ---- этапы
  const phases = [];
  let phase = null;
  const begin = name => { phase = { name, t0: now(), dts: [] }; phases.push(phase); };
  let prev = now();
  const fly = G.fly;
  let path = null;           // [{x,z,h}], скорость м/с
  function flyStep(dt) {
    if (!path || path.i >= path.pts.length - 1) return true;
    const a = path.pts[path.i], b = path.pts[path.i + 1];
    const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    path.s += path.v * dt;
    if (path.s >= L) { path.s -= L; path.i++; return flyStep(0); }
    const k = path.s / L;
    const x = a.x + (b.x - a.x) * k, z = a.z + (b.z - a.z) * k, h = a.h + (b.h - a.h) * k;
    fly.x = x; fly.z = z;
    fly.y = G.terrain.gridHeightAt(x, z) + h;
    fly.vx = fly.vy = fly.vz = 0;
    fly.yaw = Math.atan2(b.x - a.x, b.z - a.z);
    fly.pitch = h > 100 ? -0.45 : -0.12;
    return false;
  }
  const S = quick ? 0.4 : 1;
  const plan = [
    { name: 'старт', dur: 8 * S },
    { name: 'езда', dur: 35 * S, drive: true },
    { name: 'низко', fly: { v: 48, pts: [{ x: -14, z: 50, h: 35 }, { x: -270, z: 950, h: 35 },
      { x: -757, z: 1640, h: 35 }, { x: -1493, z: 1631, h: 35 }] }, dur: 60 * S },
    { name: 'высоко', fly: { v: 95, pts: [{ x: -1493, z: 1631, h: 35 }, { x: -1200, z: 1400, h: 150 },
      { x: 0, z: 0, h: 150 }, { x: 600, z: -300, h: 150 }] }, dur: 30 * S },
  ];
  await new Promise(done => {
    let pi = -1, pt0 = 0;
    const next = () => {
      pi++;
      if (pi >= plan.length) { done(); return false; }
      const P = plan[pi];
      begin(P.name); pt0 = now();
      input = null;
      if (P.fly) {
        if (G.mode !== 'fly') key('KeyF');
        path = { pts: P.fly.pts, v: P.fly.v / S ** 0.5, i: 0, s: 0 };
      }
      return true;
    };
    next();
    const tick = t => {
      const dt = Math.min((t - prev) / 1000, 0.25);
      phase.dts.push(t - prev);
      prev = t;
      const P = plan[pi];
      if (P.drive) pilot(dt);
      let fin = false;
      if (P.fly) fin = flyStep(dt);
      if (now() - pt0 > P.dur * 1000 || (P.fly && fin)) { if (!next()) return; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(t => { prev = t; requestAnimationFrame(tick); });
  });

  // ---- итог
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
  const summary = phases.map(ph => {
    const d = ph.dts.slice(1).sort((a, b) => a - b);
    const n = d.length, total = sum(d, x => x);
    const worst1 = d.slice(Math.floor(n * 0.99));
    const fr = frames.filter(f => f.t >= ph.t0 && f.t <= ph.t0 + total + 50);
    return {
      phase: ph.name, frames: n, sec: +(total / 1000).toFixed(1),
      fps: +(n / total * 1000).toFixed(1),
      low1: +(1000 / (sum(worst1, x => x) / Math.max(1, worst1.length))).toFixed(1),
      p99: +d[Math.floor(n * 0.99)]?.toFixed(1),
      worst: +d[n - 1]?.toFixed(0),
      over33: d.filter(x => x > 33.4).length,
      over50: d.filter(x => x > 50).length,
      over100: d.filter(x => x > 100).length,
      callsAvg: Math.round(sum(fr, f => f.calls) / Math.max(1, fr.length)),
      callsMax: Math.max(0, ...fr.map(f => f.calls)),
      trisAvgK: Math.round(sum(fr, f => f.tris) / Math.max(1, fr.length) / 1000),
      trisMaxK: Math.round(Math.max(0, ...fr.map(f => f.tris)) / 1000),
      renderMs: +(sum(fr, f => f.render) / Math.max(1, fr.length)).toFixed(2),
      buildMs: +(sum(fr, f => f.build + f.ground) / Math.max(1, fr.length)).toFixed(2),
    };
  });
  // длинные кадры: что было в отрисовке, предшествующей концу интервала
  const long = frames.map((f, i) => ({ ...f, gap: i ? f.t - frames[i - 1].t : 0 }))
    .filter(f => f.gap > 45).sort((a, b) => b.gap - a.gap).slice(0, 25)
    .map(f => {
      const ph = [...phases].reverse().find(p => p.t0 <= f.t);
      const g = glb.filter(x => x.t && x.t <= f.t && x.t >= f.t - f.gap - 5);
      return { at: ph ? ph.name + ' +' + ((f.t - ph.t0) / 1000).toFixed(1) + 'с' : '',
               gap: Math.round(f.gap), render: +f.render.toFixed(1), build: +f.build.toFixed(1),
               ground: +f.ground.toFixed(1), phys: +f.phys.toFixed(1), stage: f.stage,
               gl: f.gl, newProg: f.newProg, progNames: f.progNames, newGeo: f.newGeo, newTex: f.newTex,
               glb: g.map(x => `${(x.bytes / 1e6).toFixed(1)}МБ ${x.sync.toFixed(0)}мс`).join(', ') };
    });
  // память: JS-куча и оценка видеопамяти по буферам сцены
  const seenG = new Set(), seenT = new Set();
  let gpu = 0, texB = 0;
  G.scene.traverse(o => {
    const g = o.geometry;
    if (g && !seenG.has(g)) {
      seenG.add(g);
      for (const k in g.attributes) gpu += g.attributes[k].array?.byteLength || 0;
      if (g.index) gpu += g.index.array.byteLength;
      if (o.isInstancedMesh) gpu += o.instanceMatrix.array.byteLength;
    }
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of ms) for (const k in m) {
      const v = m[k];
      if (v && v.isTexture && !seenT.has(v)) {
        seenT.add(v);
        const im = v.image; if (im && im.width) texB += im.width * im.height * 4;
      }
    }
  });
  const cp = {};
  for (const [k, v] of Object.entries(G.chunkProf)) if (typeof v === 'number') cp[k] = Math.round(v);
  const tp = {};
  for (const [k, v] of Object.entries(G.tileProf)) if (typeof v === 'number') tp[k] = Math.round(v);
  return {
    summary, long, glb: glb.map(x => ({ mb: +(x.bytes / 1e6).toFixed(2), sync: Math.round(x.sync), total: Math.round(x.total) })),
    chunkProf: { sum: cp, worst: G.chunkProf.worst }, tileProf: { sum: tp, worst: G.tileProf.worst },
    chunks: { built: G.chunks.stats.built, worstMs: Math.round(G.chunks.stats.worstMs), avgMs: Math.round(G.chunks.stats.buildMs / Math.max(1, G.chunks.stats.built)) },
    mem: { jsMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
           gpuGeoMB: Math.round(gpu / 1048576), gpuTexMB: Math.round(texB / 1048576),
           geometries: G.renderer.info.memory.geometries, textures: G.renderer.info.memory.textures,
           programs: G.renderer.info.programs?.length },
    pr: window.__getPR ? window.__getPR() : null,
  };
}, { quick });
if (traceArg) await browser.stopTracing();
await browser.close();

const pad = (s, n) => String(s).padStart(n);
console.log(`\n== ${label}: старт ${bootMs} мс (${laps.join(', ')}), прогон ${((Date.now() - t0) / 1000).toFixed(0)} с, pixelRatio в конце ${res.pr}`);
console.log('этап      кадров  fps   1%low  p99мс  худший  >33  >50  >100  вызовов(ср/макс)  треуг.тыс(ср/макс)  отрис.мс  сборка.мс');
for (const s of res.summary)
  console.log(`${s.phase.padEnd(8)} ${pad(s.frames, 6)} ${pad(s.fps, 5)} ${pad(s.low1, 6)} ${pad(s.p99, 6)} ${pad(s.worst, 7)} ${pad(s.over33, 4)} ${pad(s.over50, 4)} ${pad(s.over100, 5)}   ${pad(s.callsAvg, 6)}/${pad(s.callsMax, 5)}       ${pad(s.trisAvgK, 6)}/${pad(s.trisMaxK, 5)}     ${pad(s.renderMs, 6)}   ${pad(s.buildMs, 6)}`);
console.log('\nсамые длинные кадры (мс): где | интервал | отрисовка сборка земля физика | этап сборки | новых программ/геом/текстур | GLB');
for (const l of res.long)
  console.log(`  ${l.at.padEnd(14)} ${pad(l.gap, 5)} | ${pad(l.render, 6)} ${pad(l.build, 6)} ${pad(l.ground, 5)} ${pad(l.phys, 5)} | ${(l.stage || '-').padEnd(22)} | ${l.newProg}/${l.newGeo}/${l.newTex} | ${l.glb} ${l.progNames ? '[' + l.progNames + ']' : ''} ${l.gl ? '{' + l.gl + '}' : ''}`);
console.log('\nGLB (МБ, синхронно мс, до готовности мс):', res.glb.map(g => `${g.mb}/${g.sync}/${g.total}`).join('  '));
console.log('сборка кварталов:', JSON.stringify(res.chunks), '\n  этапы сумма мс:', JSON.stringify(res.chunkProf.sum), '\n  худший шаг мс:', JSON.stringify(res.chunkProf.worst));
console.log('земля: сумма', JSON.stringify(res.tileProf.sum), 'худший', JSON.stringify(res.tileProf.worst));
console.log('память:', JSON.stringify(res.mem));
if (out) writeFileSync(out, JSON.stringify({ label, base, bootMs, ...res, prof }, null, 1));
