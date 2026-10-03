// Снимки нового HUD в живой игре в пяти состояниях:
//   node tools/hud-shots.mjs [порт] [папка] [ширина] [высота] [масштаб]
// → <папка>/<w>x<h>-{first-run,car0,car120,walk,fly}.png
// first-run — чистый localStorage (подсказка клавиш сама на 8 с), остальные —
// как у вернувшегося игрока.
import { chromium } from '/Users/aleksandrkanakov/Downloads/domiro/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';

const [port = 5287, dir = 'shots-ui/live', W = 1440, H = 900, scale = 1] = process.argv.slice(2);
mkdirSync(dir, { recursive: true });
const tag = `${W}x${H}${+scale > 1 ? '@' + scale + 'x' : ''}`;
const url = `http://localhost:${port}/web/`;
const b = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });

async function open(seen, q = '') {
  const ctx = await b.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: +scale });
  if (seen) await ctx.addInitScript(() => { try { localStorage.setItem('sev.helpSeen', '1'); } catch {} });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('PAGEERROR', e.message));
  p.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 200)); });
  await p.goto(url + q, { waitUntil: 'load' });
  await p.waitForFunction(() => window.G && window.G.boot, null, { timeout: 120000 });
  return [ctx, p];
}
const shot = (p, n) => p.screenshot({ path: `${dir}/${tag}-${n}.png` });

// 1. первый запуск: подсказка клавиш с обратным отсчётом
let [ctx, p] = await open(false);
await p.waitForTimeout(4000);
await shot(p, 'first-run');
await ctx.close();

// 2. стоим, 3. пешком, 4. 120 км/ч
[ctx, p] = await open(true);
await p.waitForTimeout(4500);
await shot(p, 'car0');
await p.keyboard.press('e');
await p.evaluate(() => {
  const w = window.G.walk, c = window.G.car, fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
  w.x = c.pos.x - fz * 3.2 - fx * 2.6; w.z = c.pos.z + fx * 3.2 - fz * 2.6; w.yaw = c.yaw + 0.35; w.pitch = -0.08;
});
await p.waitForTimeout(2500);
await shot(p, 'walk');
await p.evaluate(() => { const G = window.G; G.walk.x = G.car.pos.x; G.walk.z = G.car.pos.z; });
await p.keyboard.press('e');
await p.evaluate(() => {
  const yaw = Math.atan2(127, 475);
  window.G.car.reset(-326, 935, yaw);
  window.G.cam.yaw = yaw; window.G.cam.pitch = 0.2;
});
await p.waitForTimeout(5000);
await p.keyboard.down('w');
await p.evaluate(() => {
  const c = window.G.car, yaw = Math.atan2(127, 475), v = 118 / 3.6;
  c._v = [Math.sin(yaw) * v, 0, Math.cos(yaw) * v];
  for (let i = 0; i < 4; i++) c._om[i] = v / 0.35;
});
await p.waitForTimeout(1200);
await shot(p, 'car120');
await p.keyboard.up('w');
await ctx.close();

// 5. полёт над центром, смотрим на север через бухту
[ctx, p] = await open(true, '?at=200,700,170&look=-300,-700,0');
await p.waitForTimeout(20000);
await shot(p, 'fly');
await ctx.close();
await b.close();
console.log('готово', tag);
