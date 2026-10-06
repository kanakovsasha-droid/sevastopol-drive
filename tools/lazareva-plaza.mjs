// Площадка перед пр. Нахимова, 12 на пл. Лазарева (очередь, п. 38) → запись
// pl-nahimova12 в data/plazas.json. Запуск: node tools/lazareva-plaza.mjs [--dry]
//
// Рамка — та же, что у модели models/nahimova12 (build.py): u вдоль фасада на
// проспект от угла с ул. Маяковского (A_) к СВ углу (B_), d — наружу, к
// проспекту. Внешняя кромка площадки — край тротуара buildRoads у проспекта
// w703820931 (ось − полуширина − 2.35 м, как paving.js); у ул. Маяковского —
// тротуар её (ось w25049868 на u ≈ −8.8, полуширина 3 + 2.6).
// Расстановка кадок, террасы, урны и тумбы — по описанию панорам владельца
// (docs/CLOUD.md, п. 38), места — наугад в пределах площадки.
import fs from 'node:fs';

const W = JSON.parse(fs.readFileSync('data/world.json', 'utf8'));
const road = id => W.roads.find(r => r.id === id);

const A = [-434.0, 514.2], B = [-413.5, 485.3];
const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
const ux = (B[0] - A[0]) / L, uz = (B[1] - A[1]) / L;
const nx = -uz, nz = ux;                       // наружу, к проспекту
const P = (u, d) => [+(A[0] + ux * u + nx * d).toFixed(2), +(A[1] + uz * u + nz * d).toFixed(2)];
const UD = (x, z) => [(x - A[0]) * ux + (z - A[1]) * uz, (x - A[0]) * nx + (z - A[1]) * nz];
const r2 = v => Math.round(v * 100) / 100;

// d оси проспекта на данном u (ломаная почти параллельна фасаду)
const pr = road('w703820931');
const axisD = u => {
  const q = [];
  for (let i = 0; i < pr.pts.length; i += 2) q.push(UD(pr.pts[i], pr.pts[i + 1]));
  q.sort((a, b) => a[0] - b[0]);
  for (let i = 0; i + 1 < q.length; i++)
    if (u >= q[i][0] && u <= q[i + 1][0]) return q[i][1] + (q[i + 1][1] - q[i][1]) * (u - q[i][0]) / (q[i + 1][0] - q[i][0]);
  return null;
};
const hw = pr.w / 2;
const U0 = -2.8, U1 = L;                       // от тротуара ул. Маяковского до СВ угла дома
const D0 = 0.25;                               // от стены (карниз цоколя — 0.1)
const edge = u => r2(axisD(u) - hw - 2.35);
const quad = [...P(U0, D0), ...P(U1, D0), ...P(U1, edge(U1)), ...P(U0, edge(U0))];

// Оси окон первого этажа модели: 10 осей по L (street(..., 10, ...)).
const bay = i => L / 10 * (i + 0.5);
const ang = Math.atan2(nx, nz);                // «лицом» наружу: локальный +z → n
const angU = Math.atan2(ux, uz);               // лицом вдоль фасада
const at = (u, d, extra = {}) => { const [x, z] = P(u, d); return { x, z, ...extra }; };

const plaza = {
  id: 'pl-nahimova12',
  name: 'Площадка перед пр. Нахимова, 12',
  source: 'Рамка — фасад модели models/nahimova12 (A_, B_ из build.py) и ось проспекта Нахимова '
    + 'w703820931 из data/world.json; по панорамам Яндекса 2020/2025 (описание владельца в docs/CLOUD.md, '
    + 'п. 38): вся площадка — светло-серая плитка до фасадов, кадки-клумбы с платанами, летняя терраса '
    + 'кафе под тремя красными маркизами-полукуполами у витрин, оранжевая урна, тумба сити-формата. '
    + 'Наугад: число кадок (4) и их места, оси окон под маркизами (3–5-я от ул. Маяковского), '
    + 'столики (6), места урны и тумбы. Сделано tools/lazareva-plaza.mjs.',
  quad,
  tile: [0.78, 0.77, 0.74],
  planters: [4.5, 13.5, 22.5, 31.5].map(u => at(u, 8.0, { a: r2(ang), w: 1.8, l: 1.8, h: 0.55, tree: 'platan' })),
  awnings: [2, 3, 4].map(i => at(bay(i), D0 - 0.15, { a: r2(ang), w: 2.2, dep: 1.15, top: 3.95, h: 1.05 })),
  tables: [
    ...[2, 3, 4].map(i => at(bay(i), 2.0, { a: r2(angU) })),
    ...[2.5, 3.5, 4.5].map(i => at(L / 10 * (i + 0.5), 3.9, { a: r2(angU + 0.4) })),
  ],
  bins: [at(19.5, 9.6, { c: [0.93, 0.45, 0.10] })],
  stands: [at(27.5, 10.2, { a: r2(angU) })],
};

const file = 'data/plazas.json';
const all = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
const i = all.findIndex(p => p.id === plaza.id);
if (i >= 0) all[i] = plaza; else all.push(plaza);
if (process.argv.includes('--dry')) console.log(JSON.stringify(plaza, null, 1));
else {
  fs.writeFileSync(file, '[\n' + all.map(p => '  ' + JSON.stringify(p)).join(',\n') + '\n]\n');
  console.log(`${file}: ${plaza.id}, кромка d ${edge(U0)} … ${edge(U1)} м`);
}
