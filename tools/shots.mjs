// Снимки города своим браузером.
//
// Зачем свой скрипт, а не готовый инструмент: MCP-браузеры на этой машине
// отдают пустой PNG, а без картинки правку визуала принимать нельзя — числа
// «столько-то вершин» не показывают, что дом сел в склон или дорога висит.
//
// Playwright ставится отдельно, в зависимости проекта он не входит:
//   npm i -D playwright && npx playwright install chromium
//
//   node tools/shots.mjs                       # обзор по ключевым точкам
//   node tools/shots.mjs --port 4180 --out shots
//   node tools/shots.mjs --only Ялта,Форос
//
// Сервер должен быть уже поднят: python3 tools/serve.py 4180 .

import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { project } from './config.mjs';

const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name);
  return i > 0 ? process.argv[i + 1] : def;
};
const PORT = arg('port', '4180');
const OUT = arg('out', 'shots');
const ONLY = (arg('only', '') || '').split(',').filter(Boolean);

// Точки — из OSM. Всё, что я ставил на глаз, оказывалось мимо; см. памятку
// в docs/CHUNKS.md про осевую трассы, промахнувшуюся на 4.6 км.
const SPOTS = [
  ['Нахимова',    44.6166, 33.5254, 2.2],
  ['Ушакова',     44.6015, 33.5240, 1.6],
  ['Малахов',     44.6045, 33.5468, 2.2],
  ['Северная',    44.6389, 33.5364, 1.2],
  ['Инкерман',    44.6156, 33.6089, 0.8],
  ['Балаклава',   44.5028, 33.5997, 2.0],
  ['Херсонес',    44.5872, 33.3809, 1.4],
  ['Ласпи',       44.4197, 33.7239, 1.0],
  ['Форос',       44.3986, 33.7889, 1.5],
  ['Симеиз',      44.4056, 34.0003, 1.5],
  ['Алупка',      44.4189, 34.0489, 1.5],
  ['Ялта',        44.4952, 34.1663, 1.5],
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
page.on('console', m => { if (m.type() === 'error') errors.push('консоль: ' + m.text().slice(0, 200)); });

const t0 = Date.now();
await page.goto(`http://127.0.0.1:${PORT}/web/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.G && window.G.car, null, { timeout: 180000 });
console.log(`до старта: ${((Date.now() - t0) / 1000).toFixed(1)} с`);
await page.waitForTimeout(2500);

for (const [name, lat, lon, yaw] of SPOTS) {
  if (ONLY.length && !ONLY.includes(name)) continue;
  const { x, z } = project(lat, lon);
  await page.evaluate(([x, z, yaw]) => {
    if (window.G.jumpTo) window.G.jumpTo(x, z, yaw); else window.G.car.reset(x, z, yaw);
  }, [x, z, yaw]);
  // Ждём, пока догрузятся чанки: снимок «в процессе» показывает дыры, которых
  // в игре нет, и потом полдня ищешь несуществующий баг.
  await page.waitForFunction(() => !window.G.chunks || window.G.chunks.pending === 0,
    null, { timeout: 40000 }).catch(() => {});
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  const s = await page.evaluate(() => ({
    y: Math.round(window.G.car.pos.y),
    chunks: window.G.chunks ? window.G.chunks.loaded : 0,
    tri: window.G.info.render.triangles,
  }));
  console.log(`${name.padEnd(11)} высота ${String(s.y).padStart(4)} м, чанков ${String(s.chunks).padStart(3)},`
    + ` треугольников ${s.tri.toLocaleString('ru')}`);
}

console.log(errors.length ? `\nОШИБКИ:\n${[...new Set(errors)].slice(0, 8).join('\n')}` : '\nошибок в консоли нет');
await browser.close();
