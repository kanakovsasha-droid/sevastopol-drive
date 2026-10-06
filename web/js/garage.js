import { CARS } from './vehicle.js?v=b4c97018';

// Гараж: выбор машины (W213 / W212) без перезагрузки страницы.
//
// Живёт внутри того же затемнения, что и меню мест (#menu): пока гараж
// открыт, main.js считает меню открытым и не пускает ввод в машину — своих
// правок ввода не нужно. Открывается клавишей O и кнопкой в меню мест (M).
// ←/→ — выбор, Enter или щелчок — сесть, Esc или O — закрыть.
// Выбор запоминается (sev.car); ?car=w212 в адресе — выбрать сразу.

const KEY = 'sev.car';
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* приватное окно */ } },
};

// Силуэты сбоку, нос вправо: у W213 крыша покатая к короткому багажнику,
// у W212 — «трёхобъёмник» с высоким задом и прямыми стойками.
const SIL = {
  w213: 'M8 58 L10 47 Q14 42 30 40 L58 36 Q72 22 92 19 L126 18 Q142 19 160 33 L190 37 Q206 39 210 46 L212 58 Z',
  w212: 'M8 58 L9 45 Q12 39 26 38 L56 36 Q70 21 90 18 L124 17 Q140 18 156 33 L188 36 Q204 38 209 45 L211 58 Z',
};
const WHEELS = { w213: [44, 176], w212: [43, 174] };

function silhouette(id) {
  const [a, b] = WHEELS[id];
  return `<svg viewBox="0 0 220 70" aria-hidden="true"><path d="${SIL[id]}" fill="currentColor" opacity=".92"/>` +
    `<circle cx="${a}" cy="58" r="11" fill="#0b0e11"/><circle cx="${b}" cy="58" r="11" fill="#0b0e11"/>` +
    `<circle cx="${a}" cy="58" r="6.5" fill="currentColor" opacity=".55"/><circle cx="${b}" cy="58" r="6.5" fill="currentColor" opacity=".55"/></svg>`;
}

const CSS = `
#garagebox{display:none;width:min(620px,94vw);padding:20px 22px 18px}
#menu.garage #menubox{display:none}
#menu.garage #garagebox{display:block}
#garagebox h2{font-size:14px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);font-weight:600;margin-bottom:14px}
#garagebox .cars{display:grid;grid-template-columns:1fr 1fr;gap:12px}
#garagebox .car{all:unset;cursor:pointer;display:flex;flex-direction:column;gap:6px;padding:14px 14px 12px;border-radius:10px;
  border:1px solid var(--line);background:rgba(255,255,255,.03);color:var(--ink);transition:border-color .15s,background .15s}
#garagebox .car:hover{background:rgba(255,255,255,.07)}
#garagebox .car.sel{border-color:var(--accent);background:rgba(232,180,81,.08)}
#garagebox .car.cur .t::after{content:' ●';color:var(--accent);font-size:.6em;vertical-align:middle}
#garagebox svg{width:100%;height:auto;color:var(--ink)}
#garagebox .t{font-size:22px;font-weight:700;letter-spacing:.01em}
#garagebox .s{font-family:var(--mono);font-size:11px;color:var(--dim);letter-spacing:.04em}
#garagebox .k{margin-top:12px;font-size:11px;color:var(--dim);letter-spacing:.06em}
#garagebtn{all:unset;cursor:pointer;display:flex;justify-content:space-between;align-items:baseline;width:100%;box-sizing:border-box;
  padding:9px 12px;margin:-4px 0 10px;border-radius:8px;background:rgba(232,180,81,.10);color:var(--ink);font-weight:600}
#garagebtn:hover{background:rgba(232,180,81,.18)}
#garagebtn small{color:var(--dim);font-family:var(--mono);font-size:10.5px}
@media (max-width:520px){#garagebox .cars{grid-template-columns:1fr}}
`;

export class Garage {
  // car() — машина; choose(id) — пересадить (параметры, модель, звук)
  constructor({ car, choose }) {
    this.getCar = car; this.choose = choose;
    this.ids = Object.keys(CARS);
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const menu = document.getElementById('menu');
    this.menu = menu;
    const box = document.createElement('div');
    box.id = 'garagebox'; box.className = 'panel';
    box.innerHTML = `<h2>Гараж</h2><div class="cars">${this.ids.map(id => {
      const M = CARS[id];
      return `<button class="car" data-id="${id}">${silhouette(id)}<span class="t">${M.title}</span>` +
        `<span class="s">${M.code} · ${M.power} · ${M.years}</span></button>`;
    }).join('')}</div><div class="k">← → · Enter · Esc</div>`;
    menu?.appendChild(box);
    this.box = box;
    box.querySelectorAll('.car').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); this._pick(b.dataset.id); }));
    box.addEventListener('click', e => e.stopPropagation());
    // кнопка в меню мест
    const mb = document.getElementById('menubox');
    if (mb) {
      const b = document.createElement('button');
      b.id = 'garagebtn';
      b.innerHTML = '<span>Гараж</span><small>O</small>';
      b.addEventListener('click', e => { e.stopPropagation(); this.open(); });
      mb.insertBefore(b, mb.querySelector('h2')?.nextSibling || mb.firstChild);
    }
    this.sel = 0;
    addEventListener('keydown', e => {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.code === 'KeyO' && !e.repeat) { this.isOpen() ? this.close() : this.open(); return; }
      if (!this.isOpen()) return;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') this._select(this.sel - 1);
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this._select(this.sel + 1);
      if (e.code === 'Enter' || e.code === 'Space') this._pick(this.ids[this.sel]);
      if (e.code === 'Escape') this.close();
    });
    // меню закрыли своим способом (M, щелчок мимо) — гараж закрывается с ним
    // (снимаем класс, только если он есть: remove() пишет атрибут и без него,
    // а это новая мутация — наблюдатель зациклился бы и повесил вкладку)
    if (menu) new MutationObserver(() => {
      if (!menu.classList.contains('on') && menu.classList.contains('garage')) menu.classList.remove('garage');
    })
      .observe(menu, { attributes: true, attributeFilter: ['class'] });
  }

  // какая машина была выбрана прошлый раз (или ?car=)
  static saved() {
    const q = new URLSearchParams(location.search).get('car');
    const id = q || ls.get(KEY);
    return id && CARS[id] ? id : 'w213';
  }

  isOpen() { return !!this.menu && this.menu.classList.contains('garage') && this.menu.classList.contains('on'); }
  open() {
    if (!this.menu) return;
    this.menu.classList.add('on', 'garage');
    document.exitPointerLock?.();
    this._select(Math.max(0, this.ids.indexOf(this.getCar().model)));
  }
  close() { this.menu?.classList.remove('on', 'garage'); }

  _select(i) {
    this.sel = (i + this.ids.length) % this.ids.length;
    const cur = this.getCar().model;
    this.box.querySelectorAll('.car').forEach((b, k) => {
      b.classList.toggle('sel', k === this.sel);
      b.classList.toggle('cur', b.dataset.id === cur);
    });
  }

  _pick(id) {
    ls.set(KEY, id);
    if (id !== this.getCar().model) this.choose(id);
    this.close();
  }
}
