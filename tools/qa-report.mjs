// Сравнение двух прогонов tools/qa.mjs и отчёт report.html.
//
//   node tools/qa-report.mjs qa/runs/после --base qa/runs/до        # пересобрать отчёт без нового прогона
//   node tools/qa-report.mjs qa/runs/после                          # отчёт без сравнения
//
// Что считается ухудшением, решают таблицы METRICS ниже и допуски в
// qa/tolerances.json: число в пределах допуска — «без изменений». Допуски
// подобраны по повторным прогонам одной и той же сборки (см. qa/README.md),
// поэтому «стало хуже» значит именно стало хуже, а не плавает.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// better: 'lower' — меньше лучше, 'higher' — больше лучше, 'neutral' — просто «изменилось».
// tol — допуск по умолчанию: {abs, rel}; переопределяется в qa/tolerances.json по ключу.
export const METRICS = {
  spot: [
    ['top.calls', 'вызовы отрисовки, сверху', 'lower', { abs: 3, rel: 0.03 }, 0],
    ['top.tri', 'треугольники, сверху', 'lower', { abs: 1500, rel: 0.02 }, 0],
    ['ground.calls', 'вызовы отрисовки, с земли', 'lower', { abs: 3, rel: 0.03 }, 0],
    ['ground.tri', 'треугольники, с земли', 'lower', { abs: 1500, rel: 0.02 }, 0],
    ['terrain.hMean', 'средняя высота полотна/земли, м', 'neutral', { abs: 0.05, rel: 0 }, 2],
    ['terrain.deck', 'полотно над землёй (в среднем), м', 'neutral', { abs: 0.03, rel: 0 }, 2],
    ['terrain.road', 'доля площадки под дорогой', 'neutral', { abs: 0.02, rel: 0 }, 2],
  ],
  profile: [
    ['maxStepCm', 'макс. ступень полотна, см', 'lower', { abs: 0.5, rel: 0.1 }, 1],
    ['maxSlopeBreakPct', 'макс. перелом уклона, %', 'lower', { abs: 0.3, rel: 0.1 }, 1],
    ['breaksOver2pct', 'переломов уклона больше 2%, шт', 'lower', { abs: 1, rel: 0.1 }, 0],
    ['waveG60', 'вертикальная перегрузка волны на 60 км/ч, g', 'lower', { abs: 0.03, rel: 0.1 }, 2],
    ['waveG100', 'то же на 100 км/ч, g', 'lower', { abs: 0.06, rel: 0.1 }, 2],
    ['gluedAyRms60', 'шероховатость профиля (ay rms, 60 км/ч)', 'lower', { abs: 0.3, rel: 0.1 }, 1],
    ['lengthM', 'длина замеренного отрезка, м', 'neutral', { abs: 3, rel: 0 }, 0],
    ['climbM', 'перепад высот по отрезку, м', 'neutral', { abs: 0.2, rel: 0 }, 1],
  ],
  phys: [
    ['street60.airbornePct', '60 км/ч: время в воздухе, %', 'lower', { abs: 0.2, rel: 0.1 }, 1],
    ['street60.shakeRms', '60 км/ч: тряска (rms), м/с²', 'lower', { abs: 0.05, rel: 0.1 }, 2],
    ['street60.shakeMax', '60 км/ч: тряска (пик), м/с²', 'lower', { abs: 0.4, rel: 0.1 }, 1],
    ['street60.ayRms', '60 км/ч: вертикальное ускорение (rms)', 'lower', { abs: 0.08, rel: 0.1 }, 2],
    ['street60.joltsOver05g', '60 км/ч: толчков сильнее 0.5 g', 'lower', { abs: 1, rel: 0.2 }, 0],
    ['street100.airbornePct', '100 км/ч: время в воздухе, %', 'lower', { abs: 0.2, rel: 0.1 }, 1],
    ['street100.shakeRms', '100 км/ч: тряска (rms), м/с²', 'lower', { abs: 0.05, rel: 0.1 }, 2],
    ['street100.shakeMax', '100 км/ч: тряска (пик), м/с²', 'lower', { abs: 0.4, rel: 0.1 }, 1],
    ['street100.ayRms', '100 км/ч: вертикальное ускорение (rms)', 'lower', { abs: 0.08, rel: 0.1 }, 2],
    ['street100.joltsOver05g', '100 км/ч: толчков сильнее 0.5 g', 'lower', { abs: 1, rel: 0.2 }, 0],
    ['street100.crash', '100 км/ч: удар', 'lower', { abs: 0.05, rel: 0 }, 2],
    ['parkStreet.moveMm', 'стоянка: сползание, мм', 'lower', { abs: 1, rel: 0.1 }, 1],
    ['parkStreet.dyMm', 'стоянка: дрожь по высоте, мм', 'lower', { abs: 0.5, rel: 0.1 }, 1],
    ['street60.reachedEnd', '60 км/ч: доехал до конца', 'bool', {}, 0],
    ['street100.reachedEnd', '100 км/ч: доехал до конца', 'bool', {}, 0],
    ['street60.distM', '60 км/ч: пройдено, м', 'neutral', { abs: 15, rel: 0 }, 0],
  ],
  hills: [
    ['airS', 'в воздухе, с', 'lower', { abs: 0.2, rel: 0.15 }, 2],
    ['launches', 'подбросов', 'lower', { abs: 1, rel: 0.2 }, 0],
    ['liftMaxM', 'макс. подлёт, м', 'lower', { abs: 0.05, rel: 0.15 }, 2],
    ['distM', 'проехано, м', 'neutral', { abs: 30, rel: 0 }, 0],
  ],
};
// Доли изменившихся пикселей (%, канал разошёлся больше чем на 16/255). Выше
// IMG_CHANGED_PCT кадр считается другим и идёт в сводку; между IMG_MINOR_PCT и
// ним — «мелкие отличия»: показываем, но в сводку не берём. 3% — потому что
// сама игра на одной и той же сборке иногда по-разному собирает дом на краю
// квадрата (порядок сборки чанков зависит от скорости загрузки): так на
// Троллейбусном спуске меняется кровля одного дома, это ~2.5% кадра.
const TOL0 = JSON.parse(existsSync(join(ROOT, 'qa/tolerances.json')) ? readFileSync(join(ROOT, 'qa/tolerances.json'), 'utf8') : '{}');
export const IMG_CHANGED_PCT = TOL0['img.changedPct'] ?? 3;
export const IMG_MINOR_PCT = TOL0['img.minorPct'] ?? 0.05;

const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);

export function loadTolerances() {
  const f = join(ROOT, 'qa/tolerances.json');
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
}

// вердикт по одной метрике: 'same' | 'worse' | 'better' | 'changed'
export function verdict(kind, better, tol, a, b) {
  if (a == null || b == null) return a == null && b == null ? 'same' : 'changed';
  if (better === 'bool') return a === b ? 'same' : (b ? 'better' : 'worse');
  const d = b - a;
  const lim = Math.max(tol.abs ?? 0, (tol.rel ?? 0) * Math.abs(a));
  if (Math.abs(d) <= lim) return 'same';
  if (better === 'neutral') return 'changed';
  return (better === 'lower') === (d > 0) ? 'worse' : 'better';
}

function rowsFor(kind, curObj, baseObj, tols, ctxName) {
  const rows = [];
  for (const [path, label, better, dtol, dec] of METRICS[kind]) {
    const a = baseObj ? get(baseObj, path) : undefined;
    const b = get(curObj, path);
    if (b === undefined && a === undefined) continue;
    const tol = { ...dtol, ...(tols[kind + '.' + path] || {}) };
    rows.push({ path, label, dec, a, b, v: baseObj ? verdict(kind, better, tol, a, b) : 'none' });
  }
  return rows;
}

// Сравнение двух summary.json. base может быть null — тогда вердиктов нет.
export function compare(cur, base) {
  const tols = loadTolerances();
  const places = [];     // {id, name, group, rows[], worse, better, changed, img}
  const add = (id, name, group, rows, extra = {}) => {
    const c = { worse: 0, better: 0, changed: 0 };
    for (const r of rows) if (c[r.v] !== undefined) c[r.v]++;
    places.push({ id, name, group, rows, ...c, ...extra });
  };
  for (const [id, s] of Object.entries(cur.spots)) {
    const bs = base?.spots?.[id];
    const rows = rowsFor('spot', s, bs, tols);
    const img = {};
    for (const view of ['top', 'ground']) {
      const d = s.views?.[view]?.diff;
      if (d) img[view] = d;
    }
    const imgChanged = Object.values(img).some(d => d.pct > IMG_CHANGED_PCT);
    const imgMinor = !imgChanged && Object.values(img).some(d => d.pct > IMG_MINOR_PCT);
    const p = { img, imgChanged, imgMinor };
    add(id, s.name, s.group, rows, p);
    if (imgChanged) places[places.length - 1].changed++;
  }
  for (const [id, pr] of Object.entries(cur.profiles || {})) {
    const bp = base?.profiles?.[id];
    if (pr.error) { add('pf-' + id, 'профиль: ' + id, 'профиль полотна', [{ path: 'error', label: pr.error, a: bp?.error, b: pr.error, v: 'worse', dec: 0 }]); continue; }
    add('pf-' + id, 'профиль полотна: ' + (cur.spots[id]?.name || id), 'профиль полотна', rowsFor('profile', pr, bp && !bp.error ? bp : null, tols));
  }
  for (const [id, ph] of Object.entries(cur.physics || {})) {
    const bp = base?.physics?.[id];
    if (id === 'hills') {
      const rows = [];
      for (const k of Object.keys(ph)) {
        for (const r of rowsFor('hills', ph[k], bp?.[k], tols)) rows.push({ ...r, label: `холмы ${k.replace('hills', '')} км/ч: ${r.label}`, path: k + '.' + r.path });
      }
      add('ph-hills', 'прогон по холмам', 'физика', rows);
    } else {
      add('ph-' + id, 'прогон машины: ' + (ph.name || id), 'физика', ph.error ? [{ path: 'error', label: ph.error, a: null, b: ph.error, v: 'worse', dec: 0 }] : rowsFor('phys', ph, bp, tols));
    }
  }
  // ошибки консоли: сравниваем наборы сообщений
  const norm = e => e.text.replace(/\d+/g, '#');
  const baseErr = new Set((base?.errors || []).map(norm));
  const newErrors = (cur.errors || []).filter(e => !baseErr.has(norm(e)));
  const goneErrors = base ? (base.errors || []).filter(e => !new Set((cur.errors || []).map(norm)).has(norm(e))) : [];
  const total = {
    places: places.length,
    worse: places.filter(p => p.worse).length,
    better: places.filter(p => p.better && !p.worse).length,
    changed: places.filter(p => p.changed && !p.worse && !p.better).length,
    imgChanged: places.filter(p => p.imgChanged).length,
    imgMinor: places.filter(p => p.imgMinor).length,
    newErrors: newErrors.length, goneErrors: goneErrors.length,
    errors: (cur.errors || []).length, baseErrors: base ? (base.errors || []).length : null,
  };
  total.same = base ? (!total.worse && !total.better && !total.changed && !total.newErrors && !total.goneErrors && !total.imgChanged) : null;
  return { places, total, newErrors, goneErrors };
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (v, dec) => v === undefined || v === null ? '—' : typeof v === 'boolean' ? (v ? 'да' : 'нет') : typeof v === 'number' ? (+v.toFixed(dec ?? 2)).toString() : esc(v);
const VCLS = { worse: 'bad', better: 'good', changed: 'chg', same: 'same', none: 'none' };

export function buildHtml({ cur, base, cmp, reportDir, curDir, baseDir }) {
  const rel = (dir, file) => relative(reportDir, join(dir, file)).split('\\').join('/');
  const t = cmp.total;
  const head = base
    ? (t.same ? '<b class="good">Без изменений</b>' :
       `${t.worse ? `<b class="bad">Стало хуже в ${t.worse} ${plural(t.worse, 'месте', 'местах', 'местах')}</b>` : '<b class="good">Хуже не стало нигде</b>'}`
       + (t.better ? ` · <b class="good">лучше в ${t.better}</b>` : '')
       + (t.imgChanged ? ` · <b class="chg">кадр изменился в ${t.imgChanged}</b>` : '')
       + (t.newErrors ? ` · <b class="bad">новых ошибок консоли: ${t.newErrors}</b>` : '')
       + (t.goneErrors ? ` · <b class="good">исчезло ошибок: ${t.goneErrors}</b>` : '')) + (t.imgMinor ? ` <span class="k">· мелкие отличия кадров (меньше ${IMG_CHANGED_PCT}% пикселей): ${t.imgMinor}</span>` : '')
    : '<b>Прогон без сравнения</b>';

  const worsePlaces = cmp.places.filter(p => p.worse);
  const m = cur.meta, bm = base?.meta;
  const metaLine = (x, label) => x ? `<div><span class="k">${label}</span> ${esc(x.label)} · ${esc(x.branch)}@${esc(x.commit)}${x.dirty ? ' (+правки)' : ''} · ${esc(x.date)} · ${x.durationS} с · ${x.quick ? 'быстрый' : 'полный'} · порт ${x.port}</div>` : '';

  // ---- таблица метрик
  let rowsHtml = '';
  for (const p of cmp.places) {
    const rs = p.rows;
    if (!rs.length) continue;
    const cls = p.worse ? 'bad' : p.better ? 'good' : p.changed ? 'chg' : 'same';
    rowsHtml += `<tbody class="pl ${cls}" data-v="${cls}" id="pl-${esc(p.id)}"><tr class="plh"><th colspan="4">${esc(p.name)} <small>${esc(p.group)} · ${esc(p.id)}</small></th></tr>`;
    for (const r of rs) {
      const d = typeof r.a === 'number' && typeof r.b === 'number' ? r.b - r.a : null;
      rowsHtml += `<tr class="${VCLS[r.v]}" data-v="${r.v}"><td>${esc(r.label)}</td><td class="n">${fmt(r.a, r.dec)}</td><td class="n">${fmt(r.b, r.dec)}</td><td class="n">${d === null || r.v === 'none' ? '' : (d > 0 ? '+' : '') + +d.toFixed((r.dec ?? 2) + 1)}</td></tr>`;
    }
    rowsHtml += '</tbody>';
  }

  // ---- кадры
  let cards = '';
  const spotPlace = new Map(cmp.places.filter(p => !p.id.startsWith('pf-') && !p.id.startsWith('ph-')).map(p => [p.id, p]));
  for (const [id, s] of Object.entries(cur.spots)) {
    const p = spotPlace.get(id);
    const cls = p.worse ? 'bad' : p.imgChanged || p.changed ? 'chg' : p.better ? 'good' : p.imgMinor ? 'minor' : 'same';
    const views = ['top', 'ground'].map(v => {
      const sv = s.views[v];
      if (!sv) return '';
      const label = v === 'top' ? 'сверху' : 'с высоты машины';
      const hasBase = base?.spots?.[id]?.views?.[v];
      const cell = (src, cap, extra = '') => `<figure${extra}><a href="${src}" target="_blank"><img loading="lazy" src="${src}"></a><figcaption>${cap}</figcaption></figure>`;
      let row = '';
      if (hasBase) row += cell(rel(baseDir, `img/${id}-${v}.jpg`), 'до');
      row += cell(rel(curDir, `img/${id}-${v}.jpg`), base ? 'после' : label);
      if (sv.diff && sv.diff.pct > IMG_MINOR_PCT) row += cell(rel(curDir, `diff/${id}-${v}.jpg`), `разница: ${sv.diff.pct.toFixed(2)}% пикселей`, ' class="df"');
      else if (hasBase) row += `<figure class="nodiff"><div>без изменений${sv.diff ? ` (${sv.diff.pct.toFixed(3)}%)` : ''}</div></figure>`;
      return `<div class="vrow"><div class="vl">${label}</div>${row}</div>`;
    }).join('');
    cards += `<section class="card ${cls}" data-v="${cls}" id="c-${esc(id)}"><h3>${esc(s.name)} <small>${esc(s.group)} · ${esc(id)} · ${s.x}, ${s.z}${s.unsettled ? ' · <span class="bad">не догрузилось</span>' : ''}</small></h3>${views}</section>`;
  }

  const errs = (cur.errors || []).length
    ? `<ul class="errs">${cur.errors.slice(0, 60).map(e => `<li class="${cmp.newErrors.includes(e) ? 'bad' : ''}"><small>${esc(e.where)}</small> ${esc(e.text.slice(0, 300))}</li>`).join('')}</ul>`
    : '<p class="good">Ошибок консоли и сети нет.</p>';

  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Проверка «Севастополя»: ${esc(m.label)}</title>
<style>
:root{--bg:#14171a;--fg:#e6e8ea;--mut:#8b949e;--bad:#ff6b6b;--good:#5fd38d;--chg:#f2c14e;--card:#1d2226;--line:#2c343a}
@media (prefers-color-scheme:light){:root{--bg:#f6f7f8;--fg:#1c2126;--mut:#69727b;--bad:#c62828;--good:#1b8a4a;--chg:#a66b00;--card:#fff;--line:#d9dde1}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 -apple-system,Segoe UI,Roboto,sans-serif;padding:16px 16px 60px;max-width:1500px;margin:auto}
h1{font-size:22px;margin:0 0 6px}h2{font-size:17px;margin:28px 0 8px;border-bottom:1px solid var(--line);padding-bottom:4px}h3{font-size:15px;margin:0 0 8px}small,.k{color:var(--mut);font-weight:400;font-size:12px}
.sum{font-size:18px;padding:12px 14px;background:var(--card);border:1px solid var(--line);border-radius:8px;margin:10px 0}
.bad{color:var(--bad)}.good{color:var(--good)}.chg{color:var(--chg)}
.meta{color:var(--mut);font-size:12.5px}.meta div{margin:2px 0}
.ctl{margin:12px 0;display:flex;gap:16px;flex-wrap:wrap;align-items:center}.ctl label{cursor:pointer}
table{border-collapse:collapse;width:100%;max-width:900px}td,th{padding:3px 8px;border-bottom:1px solid var(--line);text-align:left}td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
tr.bad td{color:var(--bad);font-weight:600}tr.good td{color:var(--good);font-weight:600}tr.chg td{color:var(--chg)}tr.same td,tr.none td{color:var(--mut)}
tr.plh th{background:var(--card);padding:6px 8px}tbody.pl.bad tr.plh th{border-left:4px solid var(--bad)}tbody.pl.good tr.plh th{border-left:4px solid var(--good)}tbody.pl.chg tr.plh th{border-left:4px solid var(--chg)}
.card{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin:12px 0}.card.bad{border-left:5px solid var(--bad)}.card.chg{border-left:5px solid var(--chg)}.card.good{border-left:5px solid var(--good)}.card.minor{border-left:5px solid var(--mut)}
.vrow{display:flex;gap:8px;align-items:flex-start;margin:6px 0}.vl{width:70px;flex:none;color:var(--mut);font-size:12px;padding-top:4px}
figure{margin:0;flex:1 1 0;min-width:0}figure img{width:100%;display:block;border-radius:4px;background:#000}figcaption{font-size:12px;color:var(--mut);padding-top:2px}
figure.df img{outline:2px solid var(--bad)}figure.nodiff{display:flex;align-items:center;justify-content:center;color:var(--mut);font-size:12px;border:1px dashed var(--line);border-radius:4px;min-height:60px}
.errs{padding-left:18px}.errs li{margin:2px 0}.hide-same tbody.pl[data-v=same],.hide-same .card[data-v=same]{display:none}.hide-same tr.same,.hide-same tr.none{display:none}
@media (max-width:760px){.vrow{flex-wrap:wrap}.vl{width:100%}figure{flex:1 1 100%}}
</style></head><body class="${base ? 'hide-same' : ''}">
<h1>Проверка «Севастополя»</h1>
<div class="sum">${head}</div>
${worsePlaces.length ? `<p>Хуже: ${worsePlaces.map(p => `<a class="bad" href="#pl-${esc(p.id)}">${esc(p.name)}</a>`).join(', ')}</p>` : ''}
<div class="meta">${metaLine(m, 'после')}${metaLine(bm, 'до')}<div><span class="k">мест</span> ${Object.keys(cur.spots).length} · <span class="k">профилей</span> ${Object.keys(cur.profiles || {}).length} · <span class="k">прогонов машины</span> ${Object.keys(cur.physics || {}).length}</div></div>
<div class="ctl">${base ? '<label><input type="checkbox" id="onlychg" checked> показывать только то, что изменилось</label>' : ''}</div>
<h2>Ошибки консоли и сети</h2>${errs}
<h2>Метрики</h2><table>${rowsHtml}</table>
<h2>Кадры</h2>${cards}
<script>
const cb=document.getElementById('onlychg');if(cb)cb.onchange=()=>document.body.classList.toggle('hide-same',cb.checked);
</script></body></html>`;
}

function plural(n, a, b, c) { return n % 10 === 1 && n % 100 !== 11 ? a : b; }

export function writeReport(curDir, baseDir, file) {
  const cur = JSON.parse(readFileSync(join(curDir, 'summary.json'), 'utf8'));
  const base = baseDir ? JSON.parse(readFileSync(join(baseDir, 'summary.json'), 'utf8')) : null;
  const cmp = compare(cur, base);
  const reportDir = dirname(resolve(file));
  const html = buildHtml({ cur, base, cmp, reportDir, curDir: resolve(curDir), baseDir: baseDir ? resolve(baseDir) : null });
  writeFileSync(file, html);
  return cmp;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const bi = a.indexOf('--base');
  const baseDir = bi >= 0 ? a[bi + 1] : null;
  const cur = a.find((x, i) => !x.startsWith('--') && a[i - 1] !== '--base');
  if (!cur) { console.log('node tools/qa-report.mjs <каталог прогона> [--base <каталог прогона до>]'); process.exit(1); }
  const cmp = writeReport(cur, baseDir, join(cur, 'report.html'));
  console.log(JSON.stringify(cmp.total));
  console.log('отчёт: ' + join(cur, 'report.html'));
}
