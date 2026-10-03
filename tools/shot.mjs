// Снимок страницы своим браузером: node tools/shot.mjs <url> <out.png> [w] [h] [ждать мс] [масштаб]
// Игра: http://localhost:5173/web/?at=x,z,высота&look=x,z,высота — ждать 22000.
import { chromium } from '/Users/aleksandrkanakov/Downloads/domiro/node_modules/playwright/index.mjs';
const [url, out, w = 1400, h = 1000, wait = 3000, scale = 1] = process.argv.slice(2);
const b = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +scale });
p.on('pageerror', e => console.log('PAGEERROR', e.message));
p.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 300)); });
await p.goto(url, { waitUntil: 'load' });
await p.waitForTimeout(+wait);
await p.screenshot({ path: out });
await b.close();
