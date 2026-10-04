// Колесо против нарисованного асфальта: по осевым и краям полос улиц (c ≤ 3,
// без мостов и тоннелей) в радиусе R от старта сравнивает высоту полотна в
// сцене (RoadSurface.heightAt, по треугольникам) с профилем, по которому
// едет физика (driveHeightAt + 0.145). Вне «полосы доверия» колеса
// (−0.3…+0.6 м, vehicle.js _hAt) — список мест.
//   python3 tools/serve.py 5260 .
//   node tools/check-asphalt.mjs 5260 650
// Playwright — по PLAYWRIGHT (как у qa.mjs), иначе облачный путь.
const { chromium } = await import(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright/index.mjs');
const [port, R = 450] = process.argv.slice(2);
const b = await chromium.launch({ headless: true, args: process.platform === 'darwin' ? ['--use-angle=metal', '--ignore-gpu-blocklist'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 500, height: 300 } });
p.on('pageerror', e => console.log('PAGEERROR', e.message));
await p.goto(`http://localhost:${port}/web/?radius=700&ground=900`, { waitUntil: 'load' });
await p.waitForFunction(() => window.G && G.car && G.car.surface, null, { timeout: 250000 });
await p.waitForTimeout(+(process.env.WAIT || 150000));   // в облаке (~1 кадр/с) чанки догружаются долго
const r = await p.evaluate((R) => {
  const S = G.car.surface, T = G.terrain, X0 = -398, Z0 = 484;
  const tiles = new Map();
  for (const rd of G.roads.roads) {
    if (!rd || rd.c > 3 || rd.br || rd.tn) continue;
    const q = rd.pts;
    for (let i = 0; i < q.length - 2; i += 2) {
      const ax = q[i], az = q[i + 1], bx = q[i + 2], bz = q[i + 3], L = Math.hypot(bx - ax, bz - az);
      if (L < 0.1) continue;
      const ux = (bx - ax) / L, uz = (bz - az) / L, nx = -uz, nz = ux;
      for (let t = 0; t < L; t += 4) for (const o of (rd.w < 4 ? [0] : [0, rd.w / 2 - 1.2, -(rd.w / 2 - 1.2)])) {
        const x = ax + ux * t + nx * o, z = az + uz * t + nz * o;
        if (Math.hypot(x - X0, z - Z0) > R) continue;
        const k = Math.floor(x / 80) + ',' + Math.floor(z / 80);
        let a = tiles.get(k); if (!a) tiles.set(k, a = []);
        a.push(x, z);
      }
    }
  }
  const cnt = { n: 0, none: 0, low: 0, high: 0, ok: 0 }, bad = [], hist = {};
  for (const [k, a] of tiles) {
    const [tx, tz] = k.split(',').map(Number);
    const cx = tx * 80 + 40, cz = tz * 80 + 40;
    S.t = 0; S.at = [Infinity, Infinity];
    for (let i = 0; i < 60; i++) S.update(1, cx, cz);
    for (let i = 0; i < a.length; i += 2) {
      const x = a[i], z = a[i + 1];
      const h = T.driveHeightAt(x, z) + 0.145, s = S.heightAt(x, z);
      cnt.n++;
      if (s === null) { cnt.none++; continue; }
      const d = s - h;
      const bin = Math.max(-10, Math.min(20, Math.round(d * 10))); hist[bin] = (hist[bin] || 0) + 1;
      if (d < -0.3) { cnt.low++; if (bad.length < 400) bad.push([+x.toFixed(1), +z.toFixed(1), +d.toFixed(2)]); }
      else if (d > 0.6) { cnt.high++; if (bad.length < 400) bad.push([+x.toFixed(1), +z.toFixed(1), +d.toFixed(2)]); }
      else cnt.ok++;
    }
  }
  return { cnt, hist, bad };
}, +R);
console.log(JSON.stringify(r.cnt)); console.log(JSON.stringify(r.hist));
const byD = r.bad.sort((a, b) => Math.abs(b[2]) - Math.abs(a[2]));
console.log(JSON.stringify(byD.slice(0, 60)));
await b.close();
