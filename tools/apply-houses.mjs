// Применить записи data/houses.json к уже нарезанным данным, без пересборки
// мира: node tools/apply-houses.mjs <часть адреса> [<часть адреса> …]
//
// build-world.mjs применяет houses.json при полной сборке (блок «описаний
// домов применено»), но полная сборка трогает весь город. Этот скрипт делает
// то же самое точечно — для записей, у которых addr содержит одну из
// подстрок: ищет ближайший контур (центр в 45 м) и пишет те же поля в
// data/world.json, во все чанки с копией дома и высоту — в far.json.
// Запись с полем wayId ставится строго на этот контур.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const keys = process.argv.slice(2);
if (!keys.length) { console.error('укажи часть адреса из houses.json'); process.exit(1); }
const R1 = v => Math.round(v * 10) / 10;
const HOUSES = JSON.parse(readFileSync('data/houses.json', 'utf8')).filter(h => keys.some(k => (h.addr || '').includes(k)));
const world = JSON.parse(readFileSync('data/world.json', 'utf8'));
const centre = p => { let x = 0, z = 0; const n = p.length / 2; for (let k = 0; k < n; k++) { x += p[k * 2]; z += p[k * 2 + 1]; } return [x / n, z / n]; };

const patch = new Map();          // id → поля
for (const h of HOUSES) {
  let b = null;
  if (h.wayId) b = world.buildings.find(o => o.id === 'w' + h.wayId);
  else {
    let bd = Infinity;
    for (const o of world.buildings) {
      const [cx, cz] = centre(o.poly);
      const d = Math.hypot(cx - h.x, cz - h.z);
      if (d < bd) { bd = d; b = o; }
    }
    if (bd > 45) b = null;
  }
  if (!b) { console.log(`  ! не нашёл контур для ${h.addr}`); continue; }
  const f = {};
  if (h.floors) f.h = R1(h.floors * 3.2 + 1.1);
  if (h.height) f.h = R1(h.height);
  if (h.grandOrder) f.go = 1;
  if (h.arch) f.arch = 1;
  if (h.signWall) f.sw = h.signWall;
  if (h.addr) f.n = h.addr;
  if (h.roof) f.rs = h.roof;
  if (h.roofColor) f.rc = h.roofColor;
  if (h.wallColor) f.wc = h.wallColor;
  if (h.fx) f.fx = h.fx;
  if (h.porch) f.porch = 1;
  if (h.chimney) f.chim = h.chimney;
  if (h.series) f.ser = h.series;
  if (h.gate) f.gate = h.gate;
  if (h.entrances) f.ent = h.entrances;
  if (h.castle) f.castle = h.castle;
  f.hand = 1;
  patch.set(b.id, { f, sign: h.sign ? { n: h.sign, c: h.signKind || 'civic' } : null });
  console.log(`${b.id}: ${h.addr}`);
}

const apply = b => {
  const p = patch.get(b.id);
  if (!p) return false;
  // поля, которые ставят только описания: прежнее описание дома не должно
  // пережить новое (4Б был по ошибке хрущёвкой — серия и крыльцо снимаются)
  for (const k of ['ser', 'gate', 'ent', 'castle', 'porch', 'chim']) delete b[k];
  Object.assign(b, p.f);
  if (p.sign) {
    b.sg = (b.sg || []).filter(s => s.n !== p.sign.n);
    b.sg.unshift(p.sign);
  }
  return true;
};
world.buildings.forEach(apply);
writeFileSync('data/world.json', JSON.stringify(world));
for (const f of readdirSync('data/chunks').filter(f => f.endsWith('.json'))) {
  const c = JSON.parse(readFileSync('data/chunks/' + f, 'utf8'));
  if (!Array.isArray(c.buildings)) continue;
  let dirty = false;
  for (const b of c.buildings) {
    if (f === 'far.json') {
      const p = patch.get(b.id);
      if (p && p.f.h && b.h !== p.f.h) { b.h = p.f.h; dirty = true; }
    } else if (apply(b)) dirty = true;
  }
  if (dirty) { writeFileSync('data/chunks/' + f, JSON.stringify(c)); console.log('  чанк', f); }
}
