// Настройки: время суток, погода, сезон и управление (клавиатура / геймпад).
// Открываются клавишей T и кнопкой Options / Menu на геймпаде, есть кнопка в
// меню мест. [ и ] — час назад и вперёд прямо на ходу.
//
// Всё хранится в localStorage (env.js — sev.env, gamepad.js — sev.pad):
// после перезагрузки тот же вечер, та же погода, та же раскладка.

import { WEATHER, SEASONS, sunDirection } from './env.js?v=3c5be47d';
import { ACTIONS } from './gamepad.js?v=3c5be47d';
import { VIEWS, FOLLOW } from './carcam.js?v=3c5be47d';

const CSS = `
#settings{position:fixed;inset:0;z-index:22;display:none;align-items:center;justify-content:center;
  background:rgba(8,10,12,.45)}
#settings.on{display:flex}
#setbox{width:min(640px,94vw);max-height:84vh;overflow:auto;padding:18px 20px 16px;font-family:var(--ui)}
#setbox h2{font-size:14px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);font-weight:600;margin-bottom:12px;
  display:flex;justify-content:space-between;align-items:baseline}
#setbox h2 small{font-family:var(--mono);letter-spacing:0;text-transform:none}
#setbox .tabs{display:flex;gap:6px;margin-bottom:14px}
#setbox .tabs button{flex:1}
#setbox section{display:none}
#setbox section.on{display:block}
#setbox h3{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);font-weight:600;margin:14px 0 8px}
#setbox button{font:inherit;font-size:13px;color:var(--ink);background:rgba(255,255,255,.06);border:1px solid var(--line);
  border-radius:8px;padding:7px 10px;cursor:pointer}
#setbox button:hover{background:rgba(255,255,255,.12)}
#setbox button.sel{background:var(--accent);border-color:var(--accent);color:#111;font-weight:600}
#setbox .row{display:flex;flex-wrap:wrap;gap:6px}
#setbox .row button{flex:1 1 auto}
#setbox label{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:13px;padding:5px 0}
#setbox label span{color:var(--dim)}
#setbox input[type=range]{flex:1;max-width:300px;accent-color:var(--accent)}
#setbox input[type=checkbox]{width:18px;height:18px;accent-color:var(--accent)}
#setbox .clock{font-family:var(--hud);font-weight:700;font-size:38px;line-height:1;margin:2px 0 6px}
#setbox .sub{color:var(--dim);font-size:12px}
#setbox table{width:100%;border-collapse:collapse;font-size:13px}
#setbox td{padding:4px 0;border-bottom:1px solid var(--line)}
#setbox td:last-child{text-align:right}
#setbox td button{min-width:120px;padding:4px 8px;font-size:12px}
#setbox td button.wait{background:var(--bad);border-color:var(--bad)}
#setbox .padsel,#menu .padsel{outline:2px solid var(--accent);outline-offset:2px}
#setbox .st{font-size:13px;padding:8px 10px;border-radius:8px;background:rgba(255,255,255,.05);margin-bottom:6px}
#setbox .st b{color:var(--accent)}
#padkeys{display:none}
body.usepad #keys .row{display:none}
body.usepad #keys #padkeys{display:flex;flex-wrap:wrap;justify-content:center}
#padkeys .g{margin:0 calc(11px*var(--u))}
`;

const SPEEDS = [
  [0, 'стоит'], [120, 'сутки за 12 мин'], [60, 'за 24 мин'], [30, 'за 48 мин'], [12, 'за 2 часа'], [1, 'как в жизни'],
];

export class Settings {
  constructor({ env, pad, cam, toast }) {
    this.env = env; this.pad = pad; this.cam = cam; this.toast = toast || (() => {});
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const el = document.createElement('div');
    el.id = 'settings';
    el.innerHTML = `<div id="setbox" class="panel">
      <h2>Настройки <small>T · Esc</small></h2>
      <div class="tabs"><button data-tab="time">Время и погода</button><button data-tab="season">Сезон</button><button data-tab="cam">Камера</button><button data-tab="ctl">Управление</button></div>
      <section data-s="time"></section><section data-s="season"></section><section data-s="cam"></section><section data-s="ctl"></section>
    </div>`;
    document.body.appendChild(el);
    this.el = el;
    this.box = el.querySelector('#setbox');
    el.addEventListener('click', e => { if (e.target === el) this.close(); });
    this.tab = 'time';
    this.box.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => this.show(b.dataset.tab)));

    // кнопка в меню мест (M)
    const mb = document.getElementById('menubox');
    if (mb) {
      const b = document.createElement('button');
      b.className = 'jump';
      b.innerHTML = '<span>Настройки: время, погода, сезон, геймпад</span><small>T</small>';
      b.addEventListener('click', e => { e.stopPropagation(); document.getElementById('menu')?.classList.remove('on'); this.open(); });
      mb.insertBefore(b, mb.querySelector('h2')?.nextSibling || mb.firstChild);
    }
    this._padHints();
    // в подсказку клавиш — T и [ ] (без правки index.html)
    const more = document.querySelector('#keys .row.more') || document.querySelector('#keys .row:last-of-type');
    if (more && !more.querySelector('.kc-t')) more.insertAdjacentHTML('beforeend',
      '<span class="g sh"><span class="kc kc-t">T</span>настройки</span><span class="g sh"><span class="kc">[</span><span class="kc">]</span>время</span>');

    addEventListener('keydown', e => {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && e.code !== 'Escape') return;
      if (e.code === 'KeyT' && !e.repeat) { this.isOpen() ? this.close() : this.open(); }
      if (e.code === 'Escape' && this.isOpen()) this.close();
      if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
        this.env.addHours(e.code === 'BracketLeft' ? -1 : 1);
        this.toast(`Время ${this.env.clock}`);
      }
    });
    env.onChange(() => { if (this.isOpen()) this.render(); });
    pad.onChange = () => { this._padHints(); if (this.isOpen() && this.tab === 'ctl') this.render(); };
    this.show('time');
    setInterval(() => {
      if (!this.isOpen()) return;
      const c = this.box.querySelector('.clock');
      if (c) c.textContent = this.env.clock;
      if (this.tab === 'ctl') this._padStatus();
    }, 500);
  }

  isOpen() { return this.el.classList.contains('on'); }
  open() { this.el.classList.add('on'); document.exitPointerLock?.(); this.render(); }
  close() {
    this.el.classList.remove('on');
    if (this.pad.capture) this.pad.capture = null;
  }
  show(tab) {
    this.tab = tab;
    this.box.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('sel', b.dataset.tab === tab));
    this.box.querySelectorAll('section').forEach(s => s.classList.toggle('on', s.dataset.s === tab));
    this.render();
  }
  render() {
    if (this.tab === 'time') this._time();
    if (this.tab === 'season') this._season();
    if (this.tab === 'ctl') this._ctl();
    if (this.tab === 'cam') this._cam();
  }

  _cam() {
    const s = this.box.querySelector('[data-s=cam]'), cam = this.cam, c = cam.cfg;
    const range = (k, name, min, max, step) =>
      `<label><span>${name}</span><input type="range" min="${min}" max="${max}" step="${step}" data-k="${k}" value="${c[k]}"></label>`;
    const check = (k, name) => `<label><span>${name}</span><input type="checkbox" data-k="${k}" ${c[k] ? 'checked' : ''}></label>`;
    s.innerHTML = `
      <h3>Вид — C (на геймпаде ${this.pad.btnName('cam')})</h3>
      <div class="row">${VIEWS.map((v, i) => `<button data-view="${i}" class="${cam.view === i ? 'sel' : ''}">${v.name}</button>`).join('')}</div>
      <h3>Камера сама уходит за машину</h3>
      <div class="row">${Object.entries(FOLLOW).map(([k, n]) => `<button data-follow="${k}" class="${c.follow === k ? 'sel' : ''}">${n}</button>`).join('')}</div>
      <div class="sub">GTA — после паузы мыши на ходу · Forza — всегда, обзор только пока держишь · V — за корму сразу</div>
      ${range('delay', 'Пауза перед возвратом (GTA), с', 0.3, 4, 0.1)}
      ${range('stiff', 'Как быстро догоняет', 1, 8, 0.25)}
      <h3>Снаружи</h3>
      ${range('fov', 'Угол обзора', 45, 90, 1)}
      ${range('dist', 'Расстояние', 0.6, 1.8, 0.05)}
      ${range('height', 'Высота', -0.8, 2, 0.1)}
      ${check('speedFov', 'Шире на скорости')}
      <h3>От первого лица</h3>
      ${range('fpFov', 'Угол обзора', 50, 100, 1)}
      ${check('lean', 'Из салона смотреть в поворот')}
      ${check('shake', 'Тряска при ударе')}`;
    s.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => { cam.setView(+b.dataset.view); this.render(); }));
    s.querySelectorAll('[data-follow]').forEach(b => b.addEventListener('click', () => { c.follow = b.dataset.follow; cam.save(); this.render(); }));
    s.querySelectorAll('input[type=range]').forEach(i => i.addEventListener('input', () => { c[i.dataset.k] = +i.value; cam.save(); }));
    s.querySelectorAll('input[type=checkbox]').forEach(i => i.addEventListener('change', () => { c[i.dataset.k] = i.checked; cam.save(); }));
  }

  // Время, когда солнце на высоте elev (по дате сезона): от полудня в сторону dir.
  _sunAt(elev, dir) {
    const doy = this.env.doy, v = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
    let a = 13, b = dir > 0 ? 23.9 : 0.1;
    for (let i = 0; i < 30; i++) {
      const m = (a + b) / 2;
      const y = Math.asin(sunDirection(doy, m, v).y) * 180 / Math.PI;
      if (y > elev) a = m; else b = m;
    }
    return (a + b) / 2;
  }

  _time() {
    const s = this.box.querySelector('[data-s=time]'), env = this.env, c = env.cfg;
    const fmt = h => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
    const rise = this._sunAt(0, -1), set = this._sunAt(0, 1);
    s.innerHTML = `
      <div class="clock">${env.clock}</div>
      <div class="sub">рассвет ${fmt(rise)} · закат ${fmt(set)} · [ и ] — час назад и вперёд</div>
      <label><span>Время суток</span><input type="range" min="0" max="23.9" step="0.1" data-pad-step="2.5" value="${c.hour.toFixed(1)}" data-k="hour"></label>
      <div class="row">
        <button data-h="${(rise - 0.3).toFixed(2)}">Рассвет</button><button data-h="10">Утро</button><button data-h="13.5">День</button>
        <button data-h="${(set - 1).toFixed(2)}">Золотой час</button><button data-h="${(set - 0.15).toFixed(2)}">Закат</button>
        <button data-h="${(set + 0.45).toFixed(2)}">Сумерки</button><button data-h="23">Ночь</button>
      </div>
      <h3>Ход времени</h3>
      <div class="row">${SPEEDS.map(([v, n]) => `<button data-speed="${v}" class="${!c.real && (c.frozen ? v === 0 : c.speed === v) ? 'sel' : ''}">${n}</button>`).join('')}
        <button data-real="1" class="${c.real ? 'sel' : ''}">по часам</button></div>
      <h3>Погода</h3>
      <div class="row">${Object.entries(WEATHER).map(([k, w]) => `<button data-w="${k}" class="${c.weather === k ? 'sel' : ''}">${w.name}</button>`).join('')}</div>`;
    s.querySelector('[data-k=hour]').addEventListener('input', e => { env.setHour(+e.target.value, true); s.querySelector('.clock').textContent = env.clock; });
    s.querySelectorAll('[data-h]').forEach(b => b.addEventListener('click', () => env.setHour(+b.dataset.h)));
    s.querySelectorAll('[data-speed]').forEach(b => b.addEventListener('click', () => {
      const v = +b.dataset.speed;
      c.real = false; c.frozen = v === 0; if (v) c.speed = v;
      env.save(); this.render();
    }));
    s.querySelector('[data-real]').addEventListener('click', () => { c.real = true; c.frozen = false; env.save(); this.render(); });
    s.querySelectorAll('[data-w]').forEach(b => b.addEventListener('click', () => env.setWeather(b.dataset.w)));
  }

  _season() {
    const s = this.box.querySelector('[data-s=season]'), env = this.env, c = env.cfg;
    const d = new Date(2026, 0, env.doy);
    const sz = env.season;
    const pct = v => Math.round(v * 100) + '%';
    s.innerHTML = `
      <div class="row">${Object.entries(SEASONS).map(([k, v]) => `<button data-season="${k}" class="${c.season === k ? 'sel' : ''}">${v.name}</button>`).join('')}</div>
      <div class="sub" style="margin-top:8px">Дата для солнца и деревьев: ${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
        · листва в цвете ${pct(sz.autumn)} · облетело ${pct(sz.bare)} · снег ${pct(sz.snow)}</div>
      <label><span>Снег зимой (в Севастополе — редкий и тонкий)</span><input type="checkbox" data-k="snow" ${c.snow ? 'checked' : ''}></label>
      <div class="sub">Платаны, каштаны, акации и тополя осенью желтеют и облетают; кипарисы, сосны, туи и ели — вечнозелёные.
        От сезона зависит и солнце: летом высокое и садится поздно, зимой низкое.</div>`;
    s.querySelectorAll('[data-season]').forEach(b => b.addEventListener('click', () => env.setSeason(b.dataset.season)));
    s.querySelector('[data-k=snow]').addEventListener('change', e => env.set('snow', e.target.checked));
  }

  _padStatus() {
    const st = this.box.querySelector('.padst');
    if (!st) return;
    const p = this.pad, gp = p.pad || p._get?.();
    if (!gp) { st.innerHTML = 'Геймпад не найден. Подключи его (провод или Bluetooth) и нажми любую кнопку — браузер показывает пад только после нажатия.'; return; }
    const pressed = gp.buttons.map((b, i) => (b.pressed || b.value > 0.5) ? p.bindName({ b: i }) : null).filter(Boolean);
    const axes = gp.axes.map(a => a.toFixed(2)).join('  ');
    st.innerHTML = `<b>${p.label(gp)}</b><br><span class="sub">${gp.id}</span><br>
      нажато: ${pressed.join(', ') || '—'} · оси: <span style="font-family:var(--mono)">${axes}</span>`;
  }

  _ctl() {
    const s = this.box.querySelector('[data-s=ctl]'), p = this.pad, c = p.cfg;
    const opt = (k, list) => `<div class="row">${list.map(([v, n]) => `<button data-${k}="${v}" class="${c[k] === v ? 'sel' : ''}">${n}</button>`).join('')}</div>`;
    s.innerHTML = `
      <div class="st padst"></div>
      <h3>Чем управлять</h3>
      ${opt('scheme', [['auto', 'Авто: что трогал, то и работает'], ['keyboard', 'Только клавиатура'], ['gamepad', 'Геймпад']])}
      <h3>Подписи кнопок</h3>
      ${opt('layout', [['auto', 'По паду'], ['ps', 'PlayStation ✕○□△'], ['xbox', 'Xbox ABXY']])}
      <h3>Геймпад</h3>
      <label><span>Мёртвая зона стиков</span><input type="range" min="0.02" max="0.35" step="0.01" data-k="dead" value="${c.dead}"></label>
      <label><span>Газ и тормоз: точность при лёгком нажиме</span><input type="range" min="1" max="3" step="0.1" data-k="pedalCurve" value="${c.pedalCurve}"></label>
      <label><span>Руль: точность в центре</span><input type="range" min="1" max="2.6" step="0.1" data-k="steerCurve" value="${c.steerCurve}"></label>
      <label><span>Чувствительность обзора</span><input type="range" min="0.3" max="2.5" step="0.1" data-k="lookSens" value="${c.lookSens}"></label>
      <label><span>Инверсия обзора по вертикали</span><input type="checkbox" data-k="invertY" ${c.invertY ? 'checked' : ''}></label>
      <label><span>Вибрация (пробуксовка, отсечка, удар)</span><input type="checkbox" data-k="rumble" ${c.rumble ? 'checked' : ''}></label>
      <h3>Кнопки — нажми «назначить» и затем кнопку на геймпаде</h3>
      <table>${ACTIONS.map(a => `<tr><td>${a.name}</td><td><button data-bind="${a.id}">${p.btnName(a.id)}</button></td></tr>`).join('')}</table>
      <div class="row" style="margin-top:10px"><button data-reset="1">Вернуть раскладку по умолчанию</button></div>
      <h3>Клавиатура</h3>
      <div class="sub">WASD — ехать · Space — ручник · E — выйти · C — камера · R — на дорогу · F — полёт · Tab — карта · M — места ·
        O — гараж · G — автомат/ручная, Shift/Q — передачи · 1–4 / Y — режим езды · L — свет · Z — завести/заглушить · V — камера за корму · Esc — пауза · T — настройки · [ ] — время · ? — все клавиши</div>`;
    this._padStatus();
    for (const k of ['scheme', 'layout']) s.querySelectorAll(`[data-${k}]`).forEach(b => b.addEventListener('click', () => {
      c[k] = b.dataset[k]; p.save();
      if (k === 'scheme') document.body.classList.toggle('usepad', k === 'scheme' && c.scheme === 'gamepad');
      this._padHints(); this.render();
    }));
    s.querySelectorAll('input[type=range]').forEach(i => i.addEventListener('input', () => { c[i.dataset.k] = +i.value; p.save(); }));
    s.querySelectorAll('input[type=checkbox]').forEach(i => i.addEventListener('change', () => { c[i.dataset.k] = i.checked; p.save(); }));
    s.querySelectorAll('[data-bind]').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      b.classList.add('wait'); b.textContent = 'нажми кнопку…';
      p.rebind(b.dataset.bind, () => { this._padHints(); this.render(); });
    }));
    s.querySelector('[data-reset]').addEventListener('click', () => { p.resetBinds(); this._padHints(); this.render(); });
  }

  // Подсказка внизу экрана, когда играешь на геймпаде: те же «клавиши», но кнопками пада.
  _padHints() {
    const keys = document.getElementById('keys');
    if (!keys) return;
    let row = document.getElementById('padkeys');
    if (!row) { row = document.createElement('div'); row.id = 'padkeys'; keys.insertBefore(row, keys.firstChild); }
    const p = this.pad, b = id => `<span class="kc">${p.btnName(id)}</span>`;
    row.innerHTML = [
      [b('gas') + b('brake'), 'газ / тормоз'], ['<span class="kc">стик</span>', 'руль'], [b('hand'), 'ручник'],
      [b('exit'), 'выйти'], [b('cam'), 'камера'], [b('reset'), 'на дорогу'], [b('down') + b('up'), 'передачи'],
      [b('map'), 'карта'], [b('menu'), 'пауза'],
    ].map(([k, t]) => `<span class="g sh">${k}${t}</span>`).join('');
  }
}
