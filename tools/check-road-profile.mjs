// Профиль полотна в игре (driveHeightAt) вокруг точек: переломы уклона и
// «трамплины» — числами, до и после правки отметок.
//
// По осевым всех проезжих улиц (c ≤ 3, без мостов и тоннелей) в радиусе R от
// каждой точки снимаем высоту профиля физики с шагом 0.5 м и считаем перелом
// уклона в точке: уклон на L м вперёд минус уклон на L м назад (L = 4 и 8 м).
// Перелом вниз (гребень, k < 0) на скорости подбрасывает машину — это и есть
// «трамплин»; вверх (впадина) — бьёт в подвеску.
//
//   python3 tools/serve.py 5260 .
//   node tools/check-road-profile.mjs --port 5260
//   node tools/check-road-profile.mjs --port 5260 --at 250,1230 --r 120
// Playwright — по PLAYWRIGHT (как у qa.mjs), иначе облачный путь.
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const PORT = arg('port', '5260');
const R = +arg('r', 120);
const SPOTS = (arg('at', '') ? [arg('at')] : ['250,1230', '327,1235', '192,1101', '-398,484', '500,2137'])
  .map(s => s.split(',').map(Number));
const WAIT = +(process.env.WAIT || 120000);
const { chromium } = await import(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch({ headless: true, args: process.platform === 'darwin'
  ? ['--use-angle=metal', '--ignore-gpu-blocklist'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 400, height: 240 } });
p.on('pageerror', e => console.log('PAGEERROR', e.message));
await p.goto(`http://127.0.0.1:${PORT}/web/?radius=300&ground=500`, { waitUntil: 'load' });
await p.waitForFunction(() => window.G && G.terrain && G.chunks, null, { timeout: 250000 });

for (const [x0, z0] of SPOTS) {
  await p.evaluate(([x, z]) => G.jumpTo(x, z), [x0, z0]);
  await p.waitForTimeout(WAIT);
  const r = await p.evaluate(([X0, Z0, R]) => {
    const T = G.terrain, out = { n: 0, k4: [], k8: [] };
    const seen = new Set();
    for (const rd of G.roads.roads) {
      if (!rd || rd.c > 3 || rd.br || rd.tn || seen.has(rd.id)) continue;
      seen.add(rd.id);
      const q = rd.pts, P = [];
      for (let i = 0; i < q.length - 2; i += 2) {
        const ax = q[i], az = q[i + 1], bx = q[i + 2], bz = q[i + 3], L = Math.hypot(bx - ax, bz - az);
        for (let t = 0; t < L; t += 0.5) {
          const x = ax + (bx - ax) * t / L, z = az + (bz - az) * t / L;
          P.push([x, z, Math.hypot(x - X0, z - Z0) <= R ? T.driveHeightAt(x, z) : null]);
        }
      }
      for (const [L, key] of [[4, 'k4'], [8, 'k8']]) {
        const s = L * 2;                                   // шагов по 0.5 м
        for (let i = s; i + s < P.length; i++) {
          const a = P[i - s][2], m = P[i][2], c = P[i + s][2];
          if (a === null || m === null || c === null) continue;
          const k = (c - m) / L - (m - a) / L;
          out[key].push([+(k * 100).toFixed(1), +P[i][0].toFixed(0), +P[i][1].toFixed(0), rd.n || rd.id]);
          if (L === 4) out.n++;
        }
      }
    }
    const top = (a, f) => a.filter(f).sort((u, v) => Math.abs(v[0]) - Math.abs(u[0]));
    // один на место: соседние точки одного перелома не повторяем
    const uniq = a => { const o = []; for (const x of a) if (!o.some(y => Math.hypot(x[1] - y[1], x[2] - y[2]) < 6)) o.push(x); return o; };
    return {
      n: out.n,
      over5: out.k4.filter(x => Math.abs(x[0]) > 5).length,
      crests4: uniq(top(out.k4, x => x[0] < -4)).slice(0, 6),
      worst4: uniq(top(out.k4, () => true)).slice(0, 6),
      worst8: uniq(top(out.k8, () => true)).slice(0, 4),
    };
  }, [x0, z0, R]);
  console.log(`\n== (${x0}, ${z0}) R=${R}: точек ${r.n}, переломов >5% на 4 м: ${r.over5}`);
  console.log('  худшие на 4 м:', JSON.stringify(r.worst4));
  console.log('  гребни (трамплины) < −4%:', JSON.stringify(r.crests4));
  console.log('  худшие на 8 м:', JSON.stringify(r.worst8));
}
await b.close();
