// Проверка модели в живой игре БЕЗ правки файлов игры: чанки с Графской подменяются на лету.
// node models/grafskaya/ingame.mjs <out.png> <atX,atZ,h> <lookX,lookZ,h> [ждать мс]
import { chromium } from '/Users/aleksandrkanakov/Downloads/domiro/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
const [out, at, look, wait = 40000] = process.argv.slice(2);
const P = JSON.parse(readFileSync('models/grafskaya/placement.json', 'utf8'));
const b = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
await p.route(/\/data\/chunks\/(0_-1|0_0)\.json/, async route => {
  const r = await route.fetch();
  const j = await r.json();
  if (Array.isArray(j.landmarks)) {
    j.landmarks = j.landmarks.filter(d => d.name !== P.name);
    if (route.request().url().includes('0_-1.json'))
      j.landmarks.push({ name: P.name, style: 'model', x: 80.3, z: -47.6, file: P.file, ox: P.ox, oz: P.oz, skip: P.skip, id: 'lm_grafskaya' });
  }
  await route.fulfill({ response: r, body: JSON.stringify(j) });
});
await p.goto(`http://127.0.0.1:5173/web/?at=${at}&look=${look}`, { waitUntil: 'load' });
await p.waitForTimeout(+wait);
await p.screenshot({ path: out });
await b.close();
