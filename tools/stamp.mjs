// Штамп версии на все свои файлы. GitHub Pages отдаёт cache-control: max-age=600
// и ETag, и браузер минутами держит СТАРЫЕ модули — правка уже на проде, а на
// экране прежняя картинка. Заголовки на Pages нам не подвластны, поэтому
// меняем сами адреса: ?v=<хеш содержимого> у каждого своего импорта и fetch.
// Запускать перед коммитом: node tools/stamp.mjs
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS_DIR = join(ROOT, 'web', 'js');
const files = readdirSync(JS_DIR).filter(f => f.endsWith('.js'));

// хеш считаем по содержимому БЕЗ старых штампов, иначе он менялся бы сам от себя
const strip = s => s.replace(/(\.js|\.json)\?v=[0-9a-f]{8}/g, '$1');
const h = createHash('sha1');
for (const f of files.sort()) h.update(strip(readFileSync(join(JS_DIR, f), 'utf8')));
for (const d of ['world.json', 'landmarks.json', 'furniture.json', 'terrain.json', 'terrain.bin']) {
  try { h.update(String(statSync(join(ROOT, 'data', d)).size)); } catch {}
}
const V = h.digest('hex').slice(0, 8);

const stampIn = (text) => strip(text)
  .replace(/(from\s+'\.{1,2}\/[^']+?\.js)'/g, `$1?v=${V}'`)
  .replace(/(fetch\('\.{1,2}\/[^']+?\.(?:json|bin))'/g, `$1?v=${V}'`)
  .replace(/(src="\.\/js\/main\.js)"/g, `$1?v=${V}"`);

let n = 0;
for (const f of files) {
  const p = join(JS_DIR, f);
  const before = readFileSync(p, 'utf8');
  const after = stampIn(before);
  if (after !== before) { writeFileSync(p, after); n++; }
}
const ip = join(ROOT, 'web', 'index.html');
const ib = readFileSync(ip, 'utf8');
const ia = stampIn(ib);
if (ia !== ib) { writeFileSync(ip, ia); n++; }
console.log(`версия ${V}, проштамповано файлов ${n}`);
