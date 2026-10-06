import * as THREE from 'three';
import { mergeGeometries } from '../lib/BufferGeometryUtils.js?v=8c71f0ed';

// Заезды на время (data/races.json, собирает tools/build-races.mjs): маршрут —
// кратчайший путь по дорогам OSM между местами из poi.json, по нему арки-
// чекпоинты. Меню «Заезды» — из паузы; машину ставим на начало маршрута по
// ходу, таймер стартует на первой арке. Лучшее время и время на каждой арке —
// в localStorage, на арках показываем разницу с рекордом.
//
// Видно только две арки — текущую и следующую: две сетки, два вызова
// отрисовки, сам мир не трогаем. Время идёт только в кадрах, где идёт игра:
// на паузе цикл до update не доходит.
//
// Прерывается заезд сам: вышли из машины, взлетели, переехали через меню мест
// (машина за кадр сместилась дальше, чем можно доехать).

const CSS = `
#races{position:fixed;inset:0;z-index:21;display:none;align-items:center;justify-content:center;
  background:rgba(8,10,12,.55);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)}
#races.on{display:flex}
#racesbox{width:min(420px,92vw);padding:22px 22px 16px;font-family:var(--ui)}
#racesbox h2{font-family:var(--hud);font-weight:800;font-size:34px;letter-spacing:.06em;text-transform:uppercase;margin-bottom:14px}
#racesbox button{display:block;width:100%;font:inherit;font-size:15px;color:var(--ink);background:rgba(255,255,255,.05);
  border:1px solid var(--line);border-radius:9px;padding:10px 14px;margin-bottom:7px;cursor:pointer;text-align:left}
#racesbox button:hover,#racesbox button.padsel{background:rgba(255,255,255,.13)}
#racesbox button b{font-weight:600}
#racesbox button small{display:flex;justify-content:space-between;color:var(--dim);font-family:var(--mono);font-size:11px;margin-top:3px}
#racesbox .sub{color:var(--dim);font-size:12px;margin-top:6px}
#race{position:absolute;left:50%;top:calc(62px*var(--u,1));transform:translateX(-50%);display:none;z-index:6;
  font-family:var(--hud);text-align:center;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.6);pointer-events:none}
#race.on{display:block}
#race .rn{font-size:13px;letter-spacing:.08em;text-transform:uppercase;opacity:.8}
#race .rt{font:800 40px/1 var(--hud);font-variant-numeric:tabular-nums;margin:2px 0}
#race .ri{font:600 14px/1.3 var(--mono);opacity:.9}
#race .rd{font:800 20px/1.2 var(--hud);min-height:24px}
#race .rd.up{color:#ff6b5e}
#race .rd.dn{color:#57e08a}
#race .ra{display:inline-block;font-size:22px;line-height:1;transition:transform .1s linear}
`;

const fmt = t => {
  if (!isFinite(t)) return '—';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
};
const fmtD = d => (d >= 0 ? '+' : '−') + Math.abs(d).toFixed(2);
const LS = id => 'sev.race.' + id;
const loadBest = id => { try { return JSON.parse(localStorage.getItem(LS(id))) || null; } catch { return null; } };
const saveBest = (id, v) => { try { localStorage.setItem(LS(id), JSON.stringify(v)); } catch { /* приватный режим */ } };

// Арка: две стойки и перекладина в шашку. Высоты стоек — свои, по дороге под
// каждой (на уклоне перекладина ровная, по верхней стойке); hL, hR — подъём
// стоек на −x и +x арки над нижней.
const POST = 0x2a2d31, CA = 0xff7a1a, CB = 0xf4f1ea, FIN_A = 0x111111, FIN_B = 0xf4f1ea;
function archGeo(w, hL, hR, finish) {
  const parts = [];
  const top = Math.max(hL, hR) + 5.2;
  const box = (sx, sy, sz, x, y, z, col) => {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    g.translate(x, y, z);
    const c = new THREE.Color(col), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  };
  const x0 = -w / 2, x1 = w / 2;
  parts.push(box(0.45, top - hL + 0.3, 0.45, x0, (top + hL) / 2 - 0.15, 0, POST));
  parts.push(box(0.45, top - hR + 0.3, 0.45, x1, (top + hR) / 2 - 0.15, 0, POST));
  const n = Math.max(4, Math.round(w / 1.2));
  for (let i = 0; i < n; i++) {
    const a = x0 + (w * i) / n, b = x0 + (w * (i + 1)) / n;
    const odd = i % 2;
    // финиш — шашка в два ряда; чекпоинт — оранжево-белые полосы
    if (finish) {
      parts.push(box(b - a, 0.45, 0.3, (a + b) / 2, top + 0.225, 0, odd ? FIN_A : FIN_B));
      parts.push(box(b - a, 0.45, 0.3, (a + b) / 2, top + 0.675, 0, odd ? FIN_B : FIN_A));
    } else parts.push(box(b - a, 0.8, 0.3, (a + b) / 2, top + 0.4, 0, odd ? CB : CA));
  }
  const g = mergeGeometries(parts, false);
  parts.forEach(p => p.dispose());
  return g;
}

export class Races {
  // car — () => Car; mode — () => 'car' | 'walk' | 'fly'; jumpTo(x, z) —
  // прыжок с догрузкой; settled() — прыжок довёл машину до дороги;
  // place(x, z, yaw) — поставить машину; toast(text)
  constructor({ scene, terrain, car, mode, jumpTo, settled, place, toast, v }) {
    Object.assign(this, { scene, terrain, car, mode, jumpTo, settled, place, toast });
    this.list = [];
    this.run = null;
    fetch(`../data/races.json${v ? '?v=' + v : ''}`).then(r => r.ok ? r.json() : { races: [] })
      .then(d => { this.list = d.races || []; }).catch(() => {});

    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const el = document.createElement('div');
    el.id = 'races';
    el.innerHTML = `<div id="racesbox" class="panel"><h2>Заезды</h2><div class="rl"></div>
      <div class="sub">Машина встанет на старт. Время пойдёт с первой арки. Маршруты — по улицам OSM.</div></div>`;
    document.body.appendChild(el);
    el.addEventListener('click', e => { if (e.target === el) this.close(); });
    this.el = el;
    // меню модальное: пока открыто, клавиши до игры не доходят; Esc — закрыть
    addEventListener('keydown', e => {
      if (!this.isOpen()) return;
      e.stopImmediatePropagation();
      if (e.code === 'Escape' && !e.repeat) this.close();
    }, true);

    const h = document.createElement('div');
    h.id = 'race';
    h.innerHTML = '<div class="rn"></div><div class="rt">0:00.0</div><div class="ri"></div><div class="rd"></div>';
    (document.getElementById('hud') || document.body).appendChild(h);
    this.hud = { el: h, n: h.querySelector('.rn'), t: h.querySelector('.rt'), i: h.querySelector('.ri'), d: h.querySelector('.rd') };

    this.mat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.arch = [new THREE.Mesh(new THREE.BufferGeometry(), this.mat), new THREE.Mesh(new THREE.BufferGeometry(), this.mat)];
    for (const m of this.arch) { m.visible = false; m.frustumCulled = false; m.matrixAutoUpdate = false; scene.add(m); }
    this._hudT = 0; this._dT = 0;
  }

  isOpen() { return this.el.classList.contains('on'); }
  close() { this.el.classList.remove('on'); }
  open() {
    const box = this.el.querySelector('.rl');
    box.innerHTML = '';
    if (this.run) {
      const b = document.createElement('button');
      b.innerHTML = `<b>Прервать заезд</b><small><span>${this.run.r.name}</span></small>`;
      b.onclick = () => { this.stop('Заезд прерван'); this.close(); };
      box.appendChild(b);
    }
    if (!this.list.length) box.insertAdjacentHTML('beforeend', '<div class="sub">Маршруты ещё не загрузились.</div>');
    for (const r of this.list) {
      const best = loadBest(r.id);
      const b = document.createElement('button');
      b.innerHTML = `<b>${r.name}</b><small><span>${(r.len / 1000).toFixed(1)} км · ${r.gates.length - 1} арок${r.loop ? ' · круг' : ''}</span>`
        + `<span>рекорд ${best ? fmt(best.t) : '—'}</span></small>`;
      b.title = r.note || '';
      b.onclick = () => { this.close(); this.start(r.id); };
      box.appendChild(b);
    }
    this.el.classList.add('on');
    document.exitPointerLock?.();
  }

  start(id) {
    const r = this.list.find(q => q.id === id);
    if (!r) return;
    if (this.mode() !== 'car') { this.toast('Заезд — только за рулём (E)'); return; }
    this.stop();
    const [x, z] = r.start;
    this.jumpTo(x, z);
    this.run = { r, state: 'load', wait: 0, gate: 0, t: 0, splits: [], best: loadBest(r.id), lx: x, lz: z, fixed: -1 };
    this._show(0); this._show(1);
    this.hud.n.textContent = r.name;
    this.hud.t.textContent = fmt(0);
    this.hud.i.textContent = 'грузим маршрут…';
    this.hud.d.textContent = ''; this.hud.d.className = 'rd';
    this.hud.el.classList.add('on');
  }

  stop(msg) {
    if (!this.run) return;
    this.run = null;
    for (const m of this.arch) m.visible = false;
    this.hud.el.classList.remove('on');
    if (msg) this.toast(msg);
  }

  // арка k маршрута — в слот k % 2
  _show(k) {
    const run = this.run, gs = run.r.gates, m = this.arch[k % 2];
    if (k >= gs.length) { m.visible = false; return; }
    const [x, z, yaw, w] = gs[k];
    const c = Math.cos(yaw), s = Math.sin(yaw);
    // арку крутим на yaw: её локальная +x смотрит влево по ходу (cos, −sin),
    // −x — вправо (−cos, sin), как «вправо» полёта в main.js
    const h = (dx, dz) => this.terrain.driveHeightAt(x + dx, z + dz);
    const hA = h(-c * w / 2, s * w / 2), hB = h(c * w / 2, -s * w / 2), h0 = Math.min(hA, hB);
    m.geometry.dispose();
    m.geometry = archGeo(w, hA - h0, hB - h0, k === gs.length - 1);
    m.position.set(x, h0, z);
    m.rotation.set(0, yaw, 0);
    m.updateMatrix();
    m.visible = true;
  }

  update(dt) {
    const run = this.run;
    if (!run) return;
    if (this.mode() !== 'car') { this.stop('Заезд прерван: вышли из машины'); return; }
    const car = this.car();
    const px = car.pos.x, pz = car.pos.z;
    if (run.state === 'load') {
      // ждём, пока квадрат старта приедет и main.js доведёт машину до дороги,
      // потом ставим её по ходу маршрута (snapToRoad мог развернуть)
      run.wait += dt;
      if (!this.settled() && run.wait < 12) return;
      const [x, z, yaw] = run.r.start;
      // арки поставлены до приезда рельефа — перекладываем по настоящему
      this._show(0); this._show(1);
      this.place(x, z, yaw);
      run.state = 'ready';
      run.lx = x; run.lz = z;
      this.hud.i.textContent = 'на старт — проезжайте арку';
      return;
    }
    // телепорт (меню мест, клик по карте) — заезд не в счёт
    const jump = Math.hypot(px - run.lx, pz - run.lz);
    if (jump > Math.max(40, 120 * dt)) { this.stop('Заезд прерван: переезд'); return; }
    const ox = run.lx, oz = run.lz;
    run.lx = px; run.lz = pz;
    if (run.state === 'go') run.t += dt;

    const gs = run.r.gates, g = gs[run.gate];
    // арку через одну ставили по грубому рельефу (точные высоты квадрата
    // приезжают, когда он рядом) — подъехали на 250 м, перекладываем
    if (run.fixed !== run.gate && Math.hypot(px - g[0], pz - g[1]) < 250) { run.fixed = run.gate; this._show(run.gate); }
    const fx = Math.sin(g[2]), fz = Math.cos(g[2]);
    const along = (x, z) => (x - g[0]) * fx + (z - g[1]) * fz;
    const across = Math.abs((px - g[0]) * fz - (pz - g[1]) * fx);
    const a0 = along(ox, oz), a1 = along(px, pz);
    // проехали плоскость арки между стойками (с запасом), или впритирку мимо
    const hit = (a0 < 0 && a1 >= 0 && across < g[3] / 2 + 3) || Math.hypot(px - g[0], pz - g[1]) < g[3] / 2 + 2;
    if (hit) this._pass(run);

    this._hudT -= dt;
    if (this._hudT <= 0 && this.run) {
      this._hudT = 0.1;
      const q = gs[Math.min(this.run.gate, gs.length - 1)];
      const dx = q[0] - px, dz = q[1] - pz;
      const rel = Math.atan2(Math.sin(Math.atan2(dx, dz) - car.yaw), Math.cos(Math.atan2(dx, dz) - car.yaw));
      const d = Math.hypot(dx, dz);
      if (this.run.state === 'go') {
        this.hud.t.textContent = fmt(this.run.t);
        const bt = this.run.best ? ` · рекорд ${fmt(this.run.best.t)}` : '';
        this.hud.i.innerHTML = `<span class="ra" style="transform:rotate(${(-rel).toFixed(2)}rad)">▲</span> `
          + `${this.run.gate}/${gs.length - 1} · ${d < 1000 ? d.toFixed(0) + ' м' : (d / 1000).toFixed(1) + ' км'}${bt}`;
      }
    }
    if (this._dT > 0) { this._dT -= dt; if (this._dT <= 0 && this.run) this.hud.d.textContent = ''; }
  }

  _pass(run) {
    const gs = run.r.gates;
    if (run.gate === 0) {
      run.state = 'go'; run.t = 0;
      this.toast('Старт!');
    } else {
      run.splits[run.gate] = run.t;
      const b = run.best?.splits?.[run.gate];
      if (b !== undefined && b !== null) {
        const d = run.t - b;
        this.hud.d.textContent = fmtD(d);
        this.hud.d.className = 'rd ' + (d > 0 ? 'up' : 'dn');
        this._dT = 3;
      }
    }
    if (run.gate === gs.length - 1) { this._finish(run); return; }
    run.gate++;
    // освободившийся слот — под арку через одну
    this._show(run.gate + 1);
  }

  _finish(run) {
    const t = run.t, id = run.r.id;
    const rec = !run.best || t < run.best.t;
    if (rec) saveBest(id, { t, splits: run.splits.map(v => (v == null ? null : +v.toFixed(2))), at: Date.now() });
    const was = run.best ? ` (было ${fmt(run.best.t)})` : '';
    this.run = null;
    for (const m of this.arch) m.visible = false;
    this.hud.t.textContent = fmt(t);
    this.hud.i.textContent = rec ? 'Финиш · новый рекорд!' + was : `Финиш · рекорд ${fmt(run.best.t)}`;
    this.toast(rec ? 'Новый рекорд: ' + fmt(t) : 'Финиш: ' + fmt(t));
    clearTimeout(this._hideT);
    this._hideT = setTimeout(() => { if (!this.run) this.hud.el.classList.remove('on'); }, 8000);
  }
}
