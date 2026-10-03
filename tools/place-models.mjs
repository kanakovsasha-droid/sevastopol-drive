// Ставит готовые модели зданий в игру: node tools/place-models.mjs <имя> [<имя> …]
//
// Берёт models/<имя>/placement.json ({ name, file, ox, oz, skip[] }) и пишет
// запись стиля model в data/landmarks.json и в чанк, куда попадает центр
// первого контура из skip. Прежние записи того же здания (по имени или
// рядом с контуром, другого стиля) убираются и из landmarks.json, и из всех
// чанков: landmarks запечены в чанки, и старый портик иначе так и остался бы
// висеть рядом с новой моделью.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const names = process.argv.slice(2);
if (!names.length) { console.error('укажи имена папок в models/'); process.exit(1); }

const W = JSON.parse(readFileSync('data/world.json', 'utf8'));
const byId = new Map(W.buildings.map(b => [b.id, b]));
const centre = b => {
  let x = 0, z = 0; const n = b.poly.length / 2;
  for (let i = 0; i < b.poly.length; i += 2) { x += b.poly[i]; z += b.poly[i + 1]; }
  return [x / n, z / n];
};
const L = JSON.parse(readFileSync('data/landmarks.json', 'utf8'));
const chunkFiles = readdirSync('data/chunks').filter(f => f.endsWith('.json'));
const chunks = new Map();
const chunk = f => {
  if (!chunks.has(f)) chunks.set(f, { j: JSON.parse(readFileSync('data/chunks/' + f, 'utf8')), dirty: false });
  return chunks.get(f);
};

for (const n of names) {
  const P = JSON.parse(readFileSync(`models/${n}/placement.json`, 'utf8'));
  // У памятников и малых форм контура в OSM нет — тогда центр берём из
  // placement (x, z) или из начала модели.
  const b = P.skip?.length ? byId.get(P.skip[0]) : null;
  if (P.skip?.length && !b) { console.error(n, ': контура', P.skip[0], 'нет в world.json'); process.exit(1); }
  const [cx, cz] = b ? centre(b) : [P.x ?? P.ox, P.z ?? P.oz];
  const def = {
    name: P.name, style: 'model', x: +cx.toFixed(1), z: +cz.toFixed(1),
    file: P.file, ox: P.ox, oz: P.oz, skip: P.skip || [],
    source: `модель models/${n}/build.py; что видно на фото и что сделано наугад — models/${n}/NOTES.md`,
    checked: new Date().toISOString().slice(0, 10),
  };
  const old = L.filter(d => d.name === P.name ||
    (d.style !== 'model' && Math.hypot(d.x - cx, d.z - cz) < 25 && !d.keep));
  for (const o of old) L.splice(L.indexOf(o), 1);
  L.push(def);
  const home = Math.floor(cx / 1024) + '_' + Math.floor(cz / 1024) + '.json';
  for (const f of chunkFiles) {
    const c = chunk(f);
    if (!Array.isArray(c.j.landmarks)) continue;
    const before = c.j.landmarks.length;
    c.j.landmarks = c.j.landmarks.filter(d =>
      d.name !== P.name && !old.some(o => o.name === d.name && Math.hypot(o.x - d.x, o.z - d.z) < 1));
    if (f === home) c.j.landmarks.push({ ...def, id: 'lm_' + n });
    if (c.j.landmarks.length !== before || f === home) c.dirty = true;
  }
  // контуры, которые модель замещает, — пометить во всех квадратах, где лежит копия
  const ids = new Set(P.skip || []);
  for (const f of chunkFiles) {
    const c = chunk(f);
    for (const bb of c.j.buildings || []) if (ids.has(bb.id) && !bb.hide) { bb.hide = 1; c.dirty = true; }
  }
  console.log(`${n}: чанк ${home}, заменено: ${old.map(o => `${o.name} [${o.style}]`).join('; ') || '—'}`);
}
writeFileSync('data/landmarks.json', JSON.stringify(L, null, 2) + '\n');
for (const [f, c] of chunks) if (c.dirty) writeFileSync('data/chunks/' + f, JSON.stringify(c.j));
