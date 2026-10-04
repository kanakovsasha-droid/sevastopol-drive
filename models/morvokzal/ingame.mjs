// Проверка модели в живой игре БЕЗ правки файлов игры: чанки подменяются на лету.
// node models/morvokzal/ingame.mjs <out.png> <atX,atZ,h> <lookX,lookZ,h> [ждать мс] [с моделью: 1 / без: 0]
import { chromium } from '/Users/aleksandrkanakov/Downloads/domiro/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
const [out, at, look, wait = 40000, withModel = '1'] = process.argv.slice(2);
const P = JSON.parse(readFileSync('models/morvokzal/placement.json', 'utf8'));
const b = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
await p.route(/\/data\/chunks\/-?\d+_-?\d+\.json/, async route => {
  const r = await route.fetch();
  const j = await r.json();
  const home = /\/0_0\.json/.test(route.request().url());
  if (withModel === '1') {
    // дом лежит копией во всех соседних квадратах (кайма) — прячем везде, как делает tools/place-models.mjs
    for (const bb of j.buildings || []) if (P.skip.includes(bb.id)) bb.hide = 1;
    if (home && Array.isArray(j.landmarks)) {
      j.landmarks = j.landmarks.filter(d => d.name !== P.name);
      j.landmarks.push({ name: P.name, style: 'model', x: 55.2, z: 123.4, file: P.file, ox: P.ox, oz: P.oz, skip: P.skip, id: 'lm_morvokzal' });
    }
  }
  await route.fulfill({ response: r, body: JSON.stringify(j) });
});
p.on('requestfailed', r => console.log('REQFAIL', r.url()));
p.on('response', r => { if (/morvokzal|0_0\.json/.test(r.url())) console.log('RESP', r.status(), r.url()); });
p.on('pageerror', e => console.log('PAGEERROR', e.message));
p.on('console', m => { const t = m.text(); if (process.env.ALL || /morv|модел|landmark|error|fail|404/i.test(t) || m.type()==='error') console.log('PAGE', t.slice(0, 200)); });
await p.goto(`http://127.0.0.1:5173/web/?at=${at}&look=${look}`, { waitUntil: 'load' });
await p.waitForTimeout(+wait);
await p.screenshot({ path: out });
await b.close();
