// Геймпад: PlayStation (DualShock 4, DualSense и их клоны) и Xbox через
// Gamepad API.
//
// Устройство простое: каждый кадр читаем состояние пада (poll), аналоговые
// оси — газ, тормоз, руль, обзор — main.js забирает сам (car(), look(),
// move()), а кнопки превращаются в те же нажатия клавиш, что и с клавиатуры:
// △ шлёт KeyE, ○ — KeyC и так далее. Так геймпад сразу умеет всё, что умеют
// клавиши (коробка в carfx.js, гараж, карта, подсказки), и ни один модуль
// не надо учить отдельно «понимать пад».
//
// Раскладка по умолчанию — как в GTA V и как подрулевые у AMG:
//   R2 / RT — газ, L2 / LT — тормоз и задний ход (плавно, по нажиму курка)
//   левый стик — руль, правый — обзор
//   ✕ / A — ручник · R1 / RB и L1 / LB — передача вверх и вниз
//   △ / Y — выйти и сесть · ○ / B — вид камеры · □ / X — вернуть на дорогу
//   R3 — камера за корму · L3 — автомат / ручная
//   Options / Menu — настройки · Share / View — карта
//   крестовина: ↑ — места, ↓ — гараж
// Китайские клоны «под PlayStation» почти все отдаются браузеру как
// стандартный пад (mapping === 'standard'). Если нет — любую кнопку и ось
// можно переназначить в настройках (T → Управление).

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* приватное окно */ } },
};
const KEY = 'sev.pad';

// Действия, которые можно переназначить. b — кнопка, a — ось со знаком.
// key — какую клавишу изображает кнопка; hold — держится, пока нажата
// (ручник, бег), иначе — короткое нажатие.
export const ACTIONS = [
  { id: 'gas',     name: 'Газ',                 def: { b: 7 } },
  { id: 'brake',   name: 'Тормоз / назад',      def: { b: 6 } },
  { id: 'steerL',  name: 'Руль влево',          def: { a: 0, s: -1 } },
  { id: 'steerR',  name: 'Руль вправо',         def: { a: 0, s: 1 } },
  { id: 'lookX',   name: 'Обзор по горизонтали', def: { a: 2, s: 1 } },
  { id: 'lookY',   name: 'Обзор по вертикали',  def: { a: 3, s: 1 } },
  { id: 'hand',    name: 'Ручник',              def: { b: 0 }, key: 'Space', hold: true },
  { id: 'up',      name: 'Передача вверх',      def: { b: 5 }, key: 'ShiftLeft' },
  { id: 'down',    name: 'Передача вниз',       def: { b: 4 }, key: 'KeyQ' },
  { id: 'exit',    name: 'Выйти / сесть',       def: { b: 3 }, key: 'KeyE' },
  { id: 'cam',     name: 'Вид камеры',          def: { b: 1 }, key: 'KeyC' },
  { id: 'reset',   name: 'Вернуть на дорогу',   def: { b: 2 }, key: 'KeyR' },
  { id: 'behind',  name: 'Камера за корму',     def: { b: 11 }, key: 'KeyV' },
  { id: 'gearbox', name: 'Автомат / ручная',    def: { b: 10 }, key: 'KeyG' },
  { id: 'menu',    name: 'Настройки',           def: { b: 9 }, key: 'KeyT' },
  { id: 'map',     name: 'Карта',               def: { b: 8 }, key: 'Tab' },
  { id: 'places',  name: 'Места',               def: { b: 12 }, key: 'KeyM' },
  { id: 'garage',  name: 'Гараж',               def: { b: 13 }, key: 'KeyO' },
];
const BY_ID = Object.fromEntries(ACTIONS.map(a => [a.id, a]));

// Подписи кнопок стандартного пада: индекс → [PlayStation, Xbox]
const NAMES = [
  ['✕', 'A'], ['○', 'B'], ['□', 'X'], ['△', 'Y'], ['L1', 'LB'], ['R1', 'RB'], ['L2', 'LT'], ['R2', 'RT'],
  ['Share', 'View'], ['Options', 'Menu'], ['L3', 'LS'], ['R3', 'RS'], ['↑', '↑'], ['↓', '↓'], ['←', '←'], ['→', '→'],
  ['PS', 'Xbox'], ['тачпад', '—'],
];
const AXES = ['левый стик ↔', 'левый стик ↕', 'правый стик ↔', 'правый стик ↕'];

// Какой это пад — по имени, которое отдаёт браузер. Sony — производитель
// 054c, у клонов в имени обычно «Wireless Controller» или «PS4/PS5».
export function padKind(id = '') {
  if (/054c|dualshock|dualsense|playstation|ps[345]|wireless controller/i.test(id)) return 'ps';
  if (/045e|xbox|xinput/i.test(id)) return 'xbox';
  return 'other';
}

export class Gamepad {
  constructor({ mode, overlay, toast }) {
    this.mode = mode;              // () => 'car' | 'walk' | 'fly'
    this.overlay = overlay;        // () => открытое меню (элемент) или null
    this.toast = toast || (() => {});
    this.index = -1;               // какой пад слушаем
    this.pad = null;
    this.prev = [];                // кнопки прошлого кадра
    this.held = new Set();         // клавиши, которые сейчас «держит» пад
    this.active = false;           // пад трогали недавно — его оси главнее
    this.lastUse = 0;
    this.capture = null;           // переназначение: ждём кнопку или ось
    this.navT = 0; this.navDir = 0; this.sel = 0;
    this.rumbleT = 0;
    // настройки
    const s = JSON.parse(ls.get(KEY) || '{}');
    this.cfg = {
      scheme: s.scheme || 'auto',            // auto | keyboard | gamepad
      layout: s.layout || 'auto',            // auto | ps | xbox — подписи кнопок
      dead: s.dead ?? 0.12,                  // мёртвая зона стиков
      steerCurve: s.steerCurve ?? 1.6,       // >1 — точнее в центре, резче у края
      pedalCurve: s.pedalCurve ?? 1.5,       // то же для курков: лёгкий нажим — немного газа
      lookSens: s.lookSens ?? 1.0,
      invertY: !!s.invertY,
      rumble: s.rumble ?? true,
      bind: { ...Object.fromEntries(ACTIONS.map(a => [a.id, a.def])), ...(s.bind || {}) },
    };
    addEventListener('gamepadconnected', e => {
      if (this.index < 0) this.index = e.gamepad.index;
      this.toast(`Геймпад: ${this.label(e.gamepad)}`);
      document.body.classList.add('haspad');
      this.onChange?.();
    });
    addEventListener('gamepaddisconnected', e => {
      if (e.gamepad.index !== this.index) return;
      this.index = -1; this.pad = null; this.active = false;
      this._releaseAll();
      document.body.classList.remove('haspad', 'usepad');
      this.toast('Геймпад отключён');
      this.onChange?.();
    });
  }

  save() { ls.set(KEY, JSON.stringify(this.cfg)); }
  get enabled() { return this.cfg.scheme !== 'keyboard'; }
  // Подписи: выбранные в настройках или по самому паду.
  get kind() {
    if (this.cfg.layout !== 'auto') return this.cfg.layout;
    const k = padKind(this.pad?.id);
    return k === 'xbox' ? 'xbox' : 'ps';
  }
  label(gp = this.pad) {
    if (!gp) return 'не подключён';
    const k = padKind(gp.id);
    const name = k === 'ps' ? 'PlayStation' : k === 'xbox' ? 'Xbox' : 'геймпад';
    return gp.mapping === 'standard' ? name : `${name} (нестандартная раскладка — проверь кнопки)`;
  }
  // как подписать привязку: «R2», «A», «левый стик ↔ +»
  bindName(b) {
    if (!b) return '—';
    if (b.b != null) return (NAMES[b.b] || [`кнопка ${b.b}`, `кнопка ${b.b}`])[this.kind === 'xbox' ? 1 : 0];
    return `${AXES[b.a] || 'ось ' + b.a} ${b.s > 0 ? '+' : '−'}`;
  }
  btnName(id) { return this.bindName(this.cfg.bind[id]); }

  // Ждём, что нажмут, — и назначаем это действию.
  rebind(id, done) { this.capture = { id, done, t: performance.now() }; }
  resetBinds() {
    this.cfg.bind = Object.fromEntries(ACTIONS.map(a => [a.id, a.def]));
    this.save();
  }

  _get() {
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    if (this.index >= 0 && list[this.index]) return list[this.index];
    // Chrome иногда не шлёт gamepadconnected, пока на паде не нажали кнопку,
    // а Safari может отдать пад под другим номером: берём первый живой.
    for (const gp of list) if (gp && gp.connected) { this.index = gp.index; document.body.classList.add('haspad'); return gp; }
    return null;
  }

  // значение привязки: кнопка 0..1 (курки — аналоговые), ось — 0..1 по знаку
  val(id) {
    // «отрицательная» половина оси обзора: та же ось с обратным знаком
    const neg = id.endsWith('_neg');
    const b0 = this.cfg.bind[neg ? id.slice(0, -4) : id], gp = this.pad;
    if (!b0 || !gp) return 0;
    if (neg && b0.a == null) return 0;
    const b = neg ? { a: b0.a, s: -b0.s } : b0;
    if (b.b != null) {
      const x = gp.buttons[b.b];
      if (!x) return 0;
      if (typeof x !== 'object') return x;
      // Курки аналоговые: value — степень нажатия. pressed у них включается
      // уже от лёгкого касания, поэтому брать его нельзя — было «чуть тронул,
      // и полный газ». pressed — только для цифровых кнопок (value 0 или 1)
      // и для курков, которые степень не отдают вовсе.
      if (x.value > 0) return x.value;
      return x.pressed ? 1 : 0;
    }
    const v = (gp.axes[b.a] || 0) * b.s;
    // у части клонов курки — оси от −1 (отпущен) до 1 (выжат)
    if (b.full) return clamp((v + 1) / 2, 0, 1);
    return v > this.cfg.dead ? (v - this.cfg.dead) / (1 - this.cfg.dead) : 0;
  }
  // ось целиком, −1..1, с мёртвой зоной (для стиков)
  axis(neg, pos) { return this.val(pos) - this.val(neg); }

  // Каждый кадр, до движения машины.
  poll(dt) {
    if (!this.enabled) { if (this.pad) { this._releaseAll(); this.pad = null; } return; }
    const gp = this._get();
    this.pad = gp;
    if (!gp) { this.active = false; return; }

    const btn = gp.buttons.map(x => (typeof x === 'object' ? x.pressed || x.value > 0.5 : x > 0.5));
    const moved = btn.some(Boolean) || gp.axes.some(a => Math.abs(a) > 0.35);

    // переназначение: первая нажатая кнопка или отклонённая ось
    if (this.capture) {
      const c = this.capture;
      if (performance.now() - c.t > 250) {      // не ловим ту же кнопку, которой открыли
        let got = null;
        btn.forEach((p, i) => { if (p && !this.prev[i] && !got) got = { b: i }; });
        if (!got) gp.axes.forEach((a, i) => {
          if (!got && Math.abs(a) > 0.6) {
            // ось курка у клона: в покое −1. Такую считаем «полной» 0..1
            const rest = this._rest?.[i] ?? 0;
            got = rest < -0.8 ? { a: i, s: 1, full: true } : { a: i, s: Math.sign(a) };
          }
        });
        if (got) {
          this.cfg.bind[c.id] = got; this.save();
          this.capture = null;
          c.done?.(got);
        }
      }
      this.prev = btn;
      return;
    }
    if (!this._rest) this._rest = gp.axes.slice();   // оси в покое — для курков-осей

    if (moved) { this.lastUse = performance.now(); if (!this.active) { this.active = true; document.body.classList.add('usepad'); } }
    if (this.cfg.scheme === 'auto' && this.active && performance.now() - this.lastUse > 20000) {
      this.active = false; document.body.classList.remove('usepad');
    }

    const ov = this.overlay();
    if (ov) this._nav(ov, btn, dt);
    else this._actions(btn);
    this.prev = btn;
  }

  // ---- кнопки в игре: нажатия клавиш
  _actions(btn) {
    const mode = this.mode();
    for (const a of ACTIONS) {
      if (!a.key) continue;
      const b = this.cfg.bind[a.id];
      let on = false, was = false;
      if (b?.b != null) { on = btn[b.b]; was = this.prev[b.b]; }
      else if (b?.a != null) { on = this.val(a.id) > 0.6; was = this.held.has('ax:' + a.id); if (on) this.held.add('ax:' + a.id); else this.held.delete('ax:' + a.id); }
      // ✕ пешком — бег, а не ручник; в полёте — вверх
      let key = a.key;
      if (a.id === 'hand' && mode === 'walk') key = 'ShiftLeft';
      if (a.hold) {
        if (on && !this.held.has(key)) this._down(key);
        if (!on && this.held.has(key)) this._up(key);
      } else if (on && !was) {
        this._tap(key);
      }
    }
    // Пешком и в полёте стик ходит как WASD: шаг там всё равно дискретный.
    if (mode !== 'car') {
      const mx = this.axis('steerL', 'steerR');
      const my = this.cfg.bind.steerL?.a === 0 && this.pad ? -(this.pad.axes[1] || 0) : 0;
      this._hold('KeyD', mx > 0.4); this._hold('KeyA', mx < -0.4);
      this._hold('KeyW', my > 0.4); this._hold('KeyS', my < -0.4);
      if (mode === 'fly') {
        this._hold('Space', this.val('gas') > 0.3);
        this._hold('KeyQ', this.val('brake') > 0.3);
      }
    } else {
      for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ']) if (this.held.has(k)) this._up(k);
    }
  }

  // ---- меню открыто: крестовина и стик ходят по кнопкам, ✕ жмёт, ○ закрывает
  _nav(ov, btn, dt) {
    for (const k of [...this.held]) if (!k.startsWith('ax:')) this._up(k);
    const press = i => btn[i] && !this.prev[i];
    const gp = this.pad;
    const sy = gp.axes[1] || 0, sx = gp.axes[0] || 0;
    let dir = 0, side = 0;
    if (btn[12] || sy < -0.5) dir = -1;
    if (btn[13] || sy > 0.5) dir = 1;
    if (btn[14] || sx < -0.5) side = -1;
    if (btn[15] || sx > 0.5) side = 1;
    const garage = ov.classList.contains('garage');
    // повтор при удержании: первый шаг сразу, дальше раз в 0.16 с
    const want = dir || side * 2;
    let fire = false;
    if (want !== this.navDir) { this.navDir = want; fire = !!want; this.navT = 0.38; }
    else if (want && (this.navT -= dt) <= 0) { fire = true; this.navT = 0.16; }

    if (garage) {
      if (fire && side) this._tap(side < 0 ? 'ArrowLeft' : 'ArrowRight');
      if (press(0)) this._tap('Enter');
      if (press(1)) this._tap('Escape');
      return;
    }
    const items = [...ov.querySelectorAll('button, input, select')].filter(el => el.offsetParent && !el.disabled);
    if (!items.length) return;
    this.sel = clamp(this.sel, 0, items.length - 1);
    const cur = items[this.sel];
    if (fire && dir) {
      this.sel = (this.sel + dir + items.length) % items.length;
      this._focus(items, this.sel);
    } else if (fire && side) {
      if (cur.type === 'range') {
        const st = +cur.step || 1;
        cur.value = clamp(+cur.value + side * st * (cur.dataset.padStep || 1), +cur.min, +cur.max);
        cur.dispatchEvent(new Event('input', { bubbles: true }));
        cur.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (cur.tagName === 'SELECT') {
        cur.selectedIndex = clamp(cur.selectedIndex + side, 0, cur.options.length - 1);
        cur.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        // кнопки в строку (вкладки, варианты): ← → тоже листают
        this.sel = (this.sel + side + items.length) % items.length;
        this._focus(items, this.sel);
      }
    }
    if (press(0)) { this._focus(items, this.sel); cur.click(); }
    if (press(1) || press(this.cfg.bind.menu?.b ?? 9)) this._tap(ov.id === 'settings' ? 'KeyT' : 'Escape');
  }
  _focus(items, i) {
    for (const el of items) el.classList.remove('padsel');
    const el = items[i];
    el.classList.add('padsel');
    el.scrollIntoView?.({ block: 'nearest' });
  }

  // ---- синтетические клавиши
  _key(type, code) {
    const key = code.startsWith('Key') ? code.slice(3).toLowerCase() : code === 'Space' ? ' ' : code;
    dispatchEvent(new KeyboardEvent(type, { code, key, bubbles: true }));
  }
  _down(code) { this.held.add(code); this._key('keydown', code); }
  _up(code) { this.held.delete(code); this._key('keyup', code); }
  _tap(code) { this._key('keydown', code); this._key('keyup', code); }
  _hold(code, on) { if (on && !this.held.has(code)) this._down(code); else if (!on && this.held.has(code)) this._up(code); }
  _releaseAll() { for (const k of [...this.held]) if (!k.startsWith('ax:')) this._up(k); this.held.clear(); }

  // ---- оси для main.js
  // Машина: газ и тормоз по нажиму курков, руль со сглаженной кривой.
  car() {
    if (!this.pad || !this.enabled) return null;
    const pc = this.cfg.pedalCurve;
    const gas = Math.pow(this.val('gas'), pc), brake = Math.pow(this.val('brake'), pc);
    let st = this.axis('steerR', 'steerL');            // +1 — влево, как A на клавиатуре
    st = Math.sign(st) * Math.pow(Math.abs(st), this.cfg.steerCurve);
    if (!this.active && gas < 0.05 && brake < 0.05 && Math.abs(st) < 0.02) return null;
    return { throttle: gas - brake, steer: st, gas: gas > 0.5, brake: brake > 0.5, pedals: gas > 0.01 || brake > 0.01 };
  }
  // Обзор: «пиксели мыши» за кадр — main.js крутит камеру тем же кодом,
  // что и от мыши. ~600 px/с на полном отклонении.
  look(dt) {
    if (!this.pad || !this.enabled) return null;
    const x = this.axis('lookX_neg', 'lookX'), y = this.axis('lookY_neg', 'lookY');
    if (!x && !y) return null;
    const k = 620 * this.cfg.lookSens * dt;
    const cx = Math.sign(x) * x * x, cy = Math.sign(y) * y * y;     // мягче в центре
    return { dx: cx * k, dy: (this.cfg.invertY ? -cy : cy) * k };
  }

  // Вибрация: пробуксовка, отсечка, удар. Шлём короткими импульсами
  // раз в 0.1 с — длинный эффект нельзя плавно менять на ходу.
  feel(dt, car) {
    if (!this.cfg.rumble || !this.pad || !this.active) return;
    const act = this.pad.vibrationActuator;
    if (!act?.playEffect) return;
    this.rumbleT -= dt;
    if (this.rumbleT > 0) return;
    this.rumbleT = 0.1;
    const t = car.telemetry || {};
    const slip = clamp(((t.slip || 0) - 2.5) / 9, 0, 1);
    const hit = clamp(car.crash || 0, 0, 1);
    const lim = t.onLimiter ? 0.25 : 0;
    const strong = Math.max(hit, slip * 0.35);
    const weak = Math.max(slip * 0.7, lim, hit * 0.6);
    if (strong < 0.02 && weak < 0.02) return;
    act.playEffect('dual-rumble', { duration: 130, strongMagnitude: strong, weakMagnitude: weak }).catch(() => {});
  }
}

export const PAD_ACTIONS = BY_ID;
