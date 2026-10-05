// Навесы (OSM building=roof) в данных: высота — как у навеса, не как у дома.
//
// Сборщик мира подбирал навесам этажность по соседям, и навес АЗС у «Атана»
// на Руднева получил 17.7 м. Рантайм теперь рисует навес плитой на столбах
// (web/js/canopy.js) и высоту берёт сам, но в данных цифра осталась — её
// видят дальний силуэт (far.json), миникарта и всё, что читает b.h. Скрипт
// приводит h к высоте навеса в world.json и во всех чанках, а из дальнего
// слоя навесы убирает: с километра пятиметровая плита не видна.
//
//   node tools/fix-roofs.mjs           # правит и печатает отчёт
//   node tools/fix-roofs.mjs --check   # только проверка (выход 1, если есть что править)
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const DIR = new URL('../data/', import.meta.url).pathname;
const CHECK = process.argv.includes('--check');
const R1 = v => Math.round(v * 10) / 10;
const area = p => { let a = 0; for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) a += (p[j] - p[i]) * (p[j + 1] + p[i + 1]); return Math.abs(a / 2); };
// то же правило, что canopyHeight в web/js/canopy.js (тег высоты в нём
// уже недостоверен: его затёрла медиана соседей — поэтому только по размеру)
const canopyH = p => { const a = area(p); return a < 40 ? 2.8 : a < 150 ? 3.6 : 5.0; };
// навес с высотой из тега (lv) и правдоподобной — оставляем; остальным
// высоту навеса по размеру. Возвращает 1, если запись была не такой.
const want = b => (b.lv && b.h >= 2.6 && b.h <= 8) ? b.h : R1(canopyH(b.poly));
const fix = b => {
  if (b.t !== 'roof') return 0;
  const h = want(b);
  if (Math.abs(b.h - h) < 0.05) return 0;
  if (!CHECK) b.h = h;
  return 1;
};

const ids = new Set();
let tall = 0, chunksTouched = 0;
const w = JSON.parse(readFileSync(DIR + 'world.json', 'utf8'));
let tallW = 0;
for (const b of w.buildings) tallW += fix(b);
if (!CHECK && tallW) writeFileSync(DIR + 'world.json', JSON.stringify(w));

for (const f of readdirSync(DIR + 'chunks')) {
  if (!/^-?\d+_-?\d+\.json$/.test(f)) continue;
  const c = JSON.parse(readFileSync(DIR + 'chunks/' + f, 'utf8'));
  let n = 0;
  for (const b of c.buildings || []) {
    if (b.t !== 'roof') continue;
    ids.add(b.id);
    const k = fix(b); n += k; tall += k;
  }
  if (n && !CHECK) { writeFileSync(DIR + 'chunks/' + f, JSON.stringify(c)); chunksTouched++; }
}

const far = JSON.parse(readFileSync(DIR + 'chunks/far.json', 'utf8'));
const farRoofs = far.buildings.filter(b => ids.has(b.id)).length;
if (!CHECK && farRoofs) {
  far.buildings = far.buildings.filter(b => !ids.has(b.id));
  writeFileSync(DIR + 'chunks/far.json', JSON.stringify(far));
}
console.log(`навесов (building=roof) в чанках: ${ids.size}; не по-навесному: в мире ${tallW}, в чанках ${tall} записей; в дальнем слое ${farRoofs}`);
if (!CHECK) console.log(`исправлено: world.json ${tallW}, чанков переписано ${chunksTouched}, из far.json убрано ${farRoofs}`);
process.exitCode = CHECK && (tall || tallW || farRoofs) ? 1 : 0;
