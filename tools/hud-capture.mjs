// Кадры игры БЕЗ интерфейса + всё, что нужно макету HUD, чтобы нарисовать
// себя поверх: состояние машины, улица, карта вокруг игрока (дороги с
// именами из чанков, дома и зелень дальнего слоя, море по высотам).
//
//   node tools/hud-capture.mjs [порт] [папка]       → <папка>/<сцена>.png + .json
//
// Сцены: car0 — стоим на площади Лазарева, car120 — едем 120 по прямой
// от неё на север, walk — вышли из машины, fly — полёт над центром.
// Макет — tools/hud-mock.html, он читает эти файлы.
import { chromium } from '/Users/aleksandrkanakov/Downloads/domiro/node_modules/playwright/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const [port = 5287, dir = 'shots-ui/scenes'] = process.argv.slice(2);
const W = 1440, H = 900;
mkdirSync(dir, { recursive: true });

const b = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: W, height: H } });
p.on('pageerror', e => console.log('PAGEERROR', e.message));
await p.goto(`http://localhost:${port}/web/`, { waitUntil: 'load' });
await p.waitForFunction(() => window.G && window.G.boot, null, { timeout: 120000 });
await p.waitForTimeout(5000);
// интерфейс прячем целиком: под макет нужен чистый кадр
await p.addStyleTag({ content: '#hud,#menu{display:none!important}' });

// Снимок состояния и карты вокруг игрока, в метрах ОТНОСИТЕЛЬНО него.
const dump = (R) => p.evaluate((R) => {
  const G = window.G, car = G.car, m = G.mode;
  const px = m === 'car' ? car.pos.x : m === 'fly' ? G.fly.x : G.walk.x;
  const pz = m === 'car' ? car.pos.z : m === 'fly' ? G.fly.z : G.walk.z;
  const yaw = m === 'car' ? car.yaw : m === 'fly' ? G.fly.yaw : G.walk.yaw;
  const r1 = v => Math.round(v * 10) / 10;
  const near = (a) => {           // плоский список точек задевает окно
    for (let i = 0; i < a.length; i += 2)
      if (Math.abs(a[i] - px) < R && Math.abs(a[i + 1] - pz) < R) return true;
    return false;
  };
  const rel = a => a.map((v, i) => r1(i % 2 ? v - pz : v - px));
  const roads = [];
  for (const r of G.roads.roads) if (r && r.pts && near(r.pts)) roads.push({ c: r.c, w: r.w, n: r.n || null, pts: rel(r.pts) });
  const builds = G.far.buildings.filter(o => near(o.poly)).map(o => rel(o.poly));
  const green = G.far.green.filter(o => near(o.poly)).map(o => rel(o.poly));
  const water = (G.far.water || []).filter(o => near(o.poly)).map(o => rel(o.poly));
  // море: сетка «вода / не вода» шагом S
  const S = 4, N = Math.ceil(2 * R / S);
  let sea = '';
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++)
    sea += G.terrain.gridHeightAt(px - R + i * S, pz - R + j * S) < 0.4 ? '1' : '0';
  const hit = G.roads.nearest(px, pz, m === 'car' ? 22 : m === 'fly' ? 40 : 14);
  // Телеметрия: если поток physics уже выставил car.telemetry — берём её,
  // иначе собираем из полей Car как есть.
  const t = car.telemetry || {
    speedKmh: car.kmh, rpm: car.rpm, rpmMax: 8000, redline: 7000,
    gear: car.mode !== 'D' ? car.mode : car.gear < 0 ? 'R' : car.gear,
    gearMode: car.mode, drive: car.rwd ? 'rwd' : 'awd', manual: false,
    slip: Math.max(...car.slip), onLimiter: !!car.limiter,
  };
  const near2 = Math.hypot(G.walk.x - car.pos.x, G.walk.z - car.pos.z) < 4.5;
  return {
    mode: m, x: px, z: pz, yaw, R, sea: { S, N, bits: sea },
    alt: m === 'fly' ? G.fly.y : G.terrain.gridHeightAt(px, pz),
    ground: G.terrain.gridHeightAt(px, pz),
    street: hit?.road?.n || null, telemetry: t, nearCar: m === 'walk' && near2,
    roads, builds, green, water,
  };
}, R);

const shoot = async (name, R = 460) => {
  const d = await dump(R);
  writeFileSync(`${dir}/${name}.json`, JSON.stringify(d));
  await p.screenshot({ path: `${dir}/${name}.png` });
  console.log(name, d.mode, d.street, Math.round(d.telemetry.speedKmh), 'км/ч', Math.round(d.telemetry.rpm), 'об', 'дорог', d.roads.length, 'домов', d.builds.length);
};

// 1. стоим на месте старта
await shoot('car0');

// 2. пешком: выходим, разворачиваемся к машине вполоборота
await p.keyboard.press('e');
await p.waitForTimeout(400);
await p.evaluate(() => { const w = window.G.walk, c = window.G.car, fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
  // в 4 м от машины (ближе 4,5 — горит приглашение сесть), машина слева в кадре
  w.x = c.pos.x - fz * 3.2 - fx * 2.6; w.z = c.pos.z + fx * 3.2 - fz * 2.6; w.yaw = c.yaw + 0.35; w.pitch = -0.08; });
await p.waitForTimeout(2500);
await shoot('walk');
await p.evaluate(() => { const G = window.G; G.walk.x = G.car.pos.x; G.walk.z = G.car.pos.z; });
await p.keyboard.press('e');
await p.waitForTimeout(500);

// 3. 120 км/ч: прямая (-340,888)→(-213,1363) ширины 14 м к северу от площади
await p.evaluate(() => {
  const yaw = Math.atan2(127, 475);
  window.G.car.reset(-326, 935, yaw);
  window.G.cam.yaw = yaw; window.G.cam.pitch = 0.2;     // камеру за корму
});
await p.waitForTimeout(6000);
await p.keyboard.down('w');
await p.evaluate(() => {
  const c = window.G.car, yaw = Math.atan2(127, 475), v = 120 / 3.6;
  c._v = [Math.sin(yaw) * v, 0, Math.cos(yaw) * v];
  for (let i = 0; i < 4; i++) c._om[i] = v / 0.35;
});
await p.waitForTimeout(700);
await shoot('car120');
await p.keyboard.up('w');

// 4. полёт — отдельной загрузкой через ?at: вода у дальних квадратов
// достраивается долго, и после езды бухта в кадре оставалась песчаной.
await p.goto(`http://localhost:${port}/web/?at=200,700,170&look=-300,-700,0`, { waitUntil: 'load' });
await p.waitForFunction(() => window.G && window.G.boot, null, { timeout: 120000 });
await p.addStyleTag({ content: '#hud,#menu{display:none!important}' });
await p.waitForTimeout(32000);
await shoot('fly', 900);

await b.close();
