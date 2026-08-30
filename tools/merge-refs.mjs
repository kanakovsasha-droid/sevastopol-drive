// Отчёты агентов из refs/*.json -> houses.json (высота, цвет, кровля, вывеска)
// и landmarks.json (портики и колоннады). Записи с координатами и уверенностью
// выше низкой; всё, что уже описано руками, не трогаем.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const DIR = new URL('../data/', import.meta.url).pathname;
const REF = new URL('../refs/', import.meta.url).pathname;

const houses = JSON.parse(readFileSync(DIR + 'houses.json', 'utf8'));
const marks  = JSON.parse(readFileSync(DIR + 'landmarks.json', 'utf8'));
const haveH = new Set(houses.map(h => h.addr));
const haveL = new Set(marks.map(m => m.name));

const COLONNADE = new Set(['portico', 'colonnade', 'rotunda', 'cathedral', 'order']);
let addedH = 0, addedL = 0, skipped = 0;

for (const f of readdirSync(REF).filter(n => n.endsWith('.json') && n !== 'review.json')) {
  const raw = JSON.parse(readFileSync(REF + f, 'utf8'));
  const list = Array.isArray(raw) ? raw : Object.values(raw).find(Array.isArray) || [];
  for (const b of list) {
    if (!b.name || !isFinite(b.x) || !isFinite(b.z)) { skipped++; continue; }
    if (b.confidence === 'низкая') { skipped++; continue; }
    // Памятники, фонтаны и мостики — не дома: контура здания у них нет,
    // и в houses.json они только сорят «не нашёл контур».
    if (['column', 'obelisk', 'fountain', 'bridge', 'bandstand', 'wall', 'rotunda-free'].includes(b.style || b.kind)) { skipped++; continue; }
    if (!haveH.has(b.name)) {
      const h = { addr: b.name, x: b.x, z: b.z };
      if (b.height) h.height = b.height; else if (b.floors) h.floors = b.floors;
      if (b.roof) h.roof = b.roof;
      if (b.roofColor) h.roofColor = b.roofColor;
      if (b.wallColor) h.wallColor = b.wallColor;
      if (b.grandOrder) h.grandOrder = true;
      if (b.arch) h.arch = true;
      if (b.style === 'glass') h.fx = 'glass';
      if (b.sign) { h.sign = b.sign; if (b.wall) h.signWall = b.wall; }
      h.source = (b.source || '').slice(0, 900);
      h.checked = b.checked || '2026-08-30';
      houses.push(h); haveH.add(b.name); addedH++;
    }
    if (COLONNADE.has(b.style) && !haveL.has(b.name)) {
      const m = { name: b.name, style: b.style === 'rotunda' ? 'colonnade' : b.style, x: b.x, z: b.z };
      if (b.domes) m.domes = b.domes;                 // храм: главы поимённо
      if (b.domeColor) m.domeColor = b.domeColor;
      if (Array.isArray(b.belfry)) m.belfry = b.belfry;   // отрезок стены звонницы
      if (b.belfryH) m.belfryH = b.belfryH;
      if (b.round) m.round = b.round;                 // ротонда: центр и радиус
      if (b.columns) m.columns = b.columns;
      if (b.wall) m.wall = b.wall;
      if (b.stairs) m.stairs = true;
      if (b.sign) m.sign = b.sign;
      m.source = (b.source || '').slice(0, 600);
      m.checked = b.checked || '2026-08-30';
      marks.push(m); haveL.add(b.name); addedL++;
    }
  }
}
writeFileSync(DIR + 'houses.json', JSON.stringify(houses, null, 2) + '\n');
writeFileSync(DIR + 'landmarks.json', JSON.stringify(marks, null, 2) + '\n');
console.log(`описаний домов +${addedH} (всего ${houses.length}), достопримечательностей +${addedL} (всего ${marks.length}), пропущено ${skipped}`);
