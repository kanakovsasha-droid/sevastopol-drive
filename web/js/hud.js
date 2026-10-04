import { drawMini } from './minimap.js?v=2df4b869';
import { CarFX } from './carfx.js?v=2df4b869';

// Интерфейс поверх игры — вариант A «Циферблат» (утверждён владельцем):
//   • справа снизу круглый прибор: обороты дугой со шкалой 0–8 и красной
//     зоной, стрелка по краю шкалы, крупная скорость, передача, привод значком;
//     в полёте тот же круг — компас с высотой над землёй;
//   • слева снизу круглая тёмная миникарта по курсу, масштаб от скорости;
//   • сверху слева — место, только когда сменилась улица, на 4,5 с;
//   • «?» — подсказка клавиш (первый запуск — сама на 8 с), «`» — тех.данные.
//
// Чего тут НЕТ, и это нарочно: перерисовки DOM каждый кадр. Прибор — один
// canvas, статичная часть (шкала, цифры) рисуется один раз в закадровый
// холст, в кадре — только стрелка, дуга и цифры, и то если они сдвинулись.
// Миникарта рисуется редко, севером вверх, а поворачивает и двигает её
// CSS-трансформ — это работа компоновщика.

const FONT = '"Sofia Sans Condensed", "Arial Narrow", sans-serif';
const RED = '#ff3b30';
const KEY_HELP = 'sev.help';          // '1' — подсказка закреплена
const KEY_SEEN = 'sev.helpSeen';      // первый запуск уже был
const KEY_DEBUG = 'sev.debug';
const D0 = 252;                       // сторона прибора в «дизайнерских» пикселях (экран 1440×900)
const M0 = 216;                       // диаметр миникарты там же
const PLACE_T = 4.5;                  // сколько висит плашка места, с
const FIRST_T = 8;                    // первая подсказка клавиш, с

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* приватное окно */ } },
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (dt, rate) => 1 - Math.exp(-dt * rate);
const wrapPi = a => Math.atan2(Math.sin(a), Math.cos(a));
const rad = d => d * Math.PI / 180;

// «улица» → «ул.» и т. п. — только для подписи на карте, там тесно
const SHORT = [[/^улица /, 'ул. '], [/ улица$/, ' ул.'], [/^проспект /, 'пр-т '], [/ проспект$/, ' пр-т'],
  [/^площадь /, 'пл. '], [/ площадь$/, ' пл.'], [/^переулок /, 'пер. '], [/ переулок$/, ' пер.'],
  [/^бульвар /, 'б-р '], [/ бульвар$/, ' б-р'], [/^шоссе /, 'ш. '], [/ шоссе$/, ' ш.'],
  [/^набережная /, 'наб. '], [/ набережная$/, ' наб.']];
const short = n => SHORT.reduce((s, [a, b]) => s.replace(a, b), n);

export class Hud {
  // opts: map — карта из buildMap, roads — RoadIndex (улицы с именами),
  // car() — машина, view() — { mode, x, z, yaw, alt? } того, кем сейчас играем
  constructor({ map, roads, car, view }) {
    Hud.last = this;
    this.map = map; this.roads = roads; this.getCar = car; this.view = view;
    const $ = id => document.getElementById(id);
    this.el = {
      hud: $('hud'), place: $('place'), street: $('street'), dial: $('dial'),
      mini: $('minimap'), miniCv: $('mini'), north: $('north'), mlabel: $('mlabel'),
      keys: $('keys'), help: $('help'), toast: $('toast'),
    };
    this.dctx = this.el.dial.getContext('2d');
    this.mctx = this.el.miniCv.getContext('2d');

    // сглаженные показания
    this.rpmS = 900; this.kmhS = 0; this.yawS = null; this.mppS = 1.3; this.headS = 0;
    this._t = { speedKmh: 0, rpm: 0, rpmMax: 8000, redline: 7000, gear: 1, gearMode: 'D', drive: 'awd', manual: false, slip: 0, onLimiter: false };
    this._drawn = '';                  // подпись последнего кадра прибора — перерисовка только по изменению
    this._static = null; this._staticKey = '';
    this._mini = null;                 // где и в каком масштабе нарисован холст карты
    this._miniDirty = true; this._miniWait = 0;
    this._streetT = 0; this._street = undefined; this._hi = null;
    this._placeT = 0; this._toastT = 0;
    this._mode = null;

    this.debug = ls.get(KEY_DEBUG) === '1';
    document.body.classList.toggle('debug', this.debug);
    // подсказка клавиш: закреплена — висит; первый запуск — сама на 8 с
    this._helpT = 0;
    if (ls.get(KEY_HELP) === '1') this._setHelp(true);
    else if (ls.get(KEY_SEEN) !== '1') {
      this._setHelp(true, FIRST_T);
      ls.set(KEY_SEEN, '1');
    }

    this.el.help.addEventListener('click', () => this.toggleHelp());
    addEventListener('keydown', e => {
      if (e.repeat || (e.target && /INPUT|TEXTAREA/.test(e.target.tagName))) return;
      if (e.code === 'Slash' || e.key === '?') this.toggleHelp();
      if (e.code === 'Backquote') this.toggleDebug();
      // carfx.js переключает звук своим обработчиком раньше нашего
      if (e.code === 'KeyK' && CarFX.last) this.toast(CarFX.last.soundOn ? 'Звук включён' : 'Без звука');
      if (e.code === 'KeyJ' && CarFX.last && CarFX.last.packs?.length > 1) this.toast('Звук: ' + CarFX.last.pack);
    });

    this._resize();
    addEventListener('resize', () => this._resize());
    // шрифт приезжает позже первого кадра — тогда шкалу перерисуем им
    document.fonts?.load(`800 40px ${FONT}`).then(() => { this._staticKey = ''; this._drawn = ''; }).catch(() => {});
  }

  // ---------------------------------------------------------------- ввод
  toggleHelp() {
    const on = !this.el.keys.classList.contains('on') || this._helpT > 0;
    this._setHelp(on);
    ls.set(KEY_HELP, on ? '1' : '0');
  }
  _setHelp(on, t = 0) {
    const k = this.el.keys;
    k.classList.toggle('on', on);
    k.classList.toggle('timed', t > 0);
    this._helpT = t;
    const bar = k.querySelector('.t i');
    if (bar) {
      // обратный отсчёт — CSS-переход ширины, без JS в кадре
      bar.style.transition = 'none'; bar.style.width = '100%';
      if (t > 0) { void bar.offsetWidth; bar.style.transition = `width ${t}s linear`; bar.style.width = '0%'; }
    }
  }
  toggleDebug() {
    this.debug = !this.debug;
    document.body.classList.toggle('debug', this.debug);
    ls.set(KEY_DEBUG, this.debug ? '1' : '0');
  }
  toast(text) {
    const t = this.el.toast;
    t.textContent = text; t.classList.add('on');
    this._toastT = 1.6;
  }

  // ---------------------------------------------------------------- размеры
  // Масштаб от экрана: 1440×900 — единица; 13" (1280×800) мельче, 16" крупнее.
  _resize() {
    const u = clamp(Math.min(innerWidth / 1440, innerHeight / 900), 0.8, 1.25);
    this.u = u;
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.el.hud.style.setProperty('--u', u.toFixed(3));
    const D = Math.round(D0 * u);
    const cv = this.el.dial;
    cv.style.width = cv.style.height = D + 'px';
    cv.width = cv.height = Math.round(D * this.dpr);
    this.D = D;
    const M = Math.round(M0 * u);
    this.M = M;
    this.el.mini.style.width = this.el.mini.style.height = M + 'px';
    this.el.mini.style.setProperty('--r', M / 2 + 'px');
    // холст карты больше окна: запас на сдвиг между перерисовками
    const C = Math.round(M * 1.7);
    this.C = C;
    const mc = this.el.miniCv;
    mc.style.width = mc.style.height = C + 'px';
    mc.style.left = mc.style.top = Math.round((M - C) / 2) + 'px';
    mc.width = mc.height = Math.round(C * this.dpr);
    this._staticKey = ''; this._drawn = ''; this._mini = null; this._miniDirty = true;
  }

  // ---------------------------------------------------------------- телеметрия
  // Поток physics выставит car.telemetry; пока его нет — собираем из полей Car.
  _telemetry(car) {
    if (car.telemetry) return car.telemetry;
    const t = this._t;
    t.speedKmh = car.kmh; t.rpm = car.rpm;
    t.gear = car.mode !== 'D' ? car.mode : car.gear < 0 ? 'R' : car.gear;
    t.gearMode = car.mode; t.drive = car.rwd ? 'rwd' : 'awd';
    t.onLimiter = !!car.limiter;
    return t;
  }

  // ---------------------------------------------------------------- кадр
  update(dt) {
    const v = this.view(), car = this.getCar();
    if (!v || !car) return;
    dt = Math.min(dt, 0.1);
    if (v.mode !== this._mode) {
      this._mode = v.mode;
      document.body.classList.toggle('flying', v.mode === 'fly');
      this.el.dial.style.display = v.mode === 'walk' ? 'none' : '';
      this._drawn = ''; this._miniDirty = true;
      if (v.mode !== 'fly') this.yawS = null;
    }

    // ---- прибор
    if (v.mode === 'car') {
      const t = this._telemetry(car);
      this.rpmS += (clamp(t.rpm, 0, t.rpmMax || 8000) - this.rpmS) * ease(dt, 16);
      this.kmhS += (Math.abs(t.speedKmh) - this.kmhS) * ease(dt, 9);
      this._dialCar(t);
    } else if (v.mode === 'fly') {
      this.headS += wrapPi(v.yaw - this.headS) * ease(dt, 12);
      this._dialFly(v.alt ?? 0);
    }

    // ---- миникарта
    this._minimap(dt, v, car);

    // ---- место и подпись улицы — не чаще 7 раз в секунду
    this._streetT -= dt;
    if (this._streetT <= 0) { this._streetT = 0.15; this._lookStreet(v); }
    if (this._placeT > 0) {
      this._placeT -= dt;
      if (this._placeT <= 0) this.el.place.classList.remove('on');
    }
    if (this._helpT > 0) {
      this._helpT -= dt;
      if (this._helpT <= 0 && ls.get(KEY_HELP) !== '1') this._setHelp(false);
    }
    if (this._toastT > 0) {
      this._toastT -= dt;
      if (this._toastT <= 0) this.el.toast.classList.remove('on');
    }
  }

  _lookStreet(v) {
    const hit = this.roads.nearest(v.x, v.z, v.mode === 'car' ? 22 : v.mode === 'fly' ? 40 : 14);
    const name = (v.mode === 'fly' ? null : hit?.road?.n) || null;
    if (name === this._street) return;
    this._street = name;
    this.el.mlabel.textContent = name ? short(name) : '';
    if (name) {
      this.el.street.textContent = name;
      this.el.place.classList.add('on');
      this._placeT = PLACE_T;
    }
    // ломаные текущей улицы для подсветки — все её звенья поблизости
    this._hi = null;
    if (name) {
      const hi = [];
      for (const r of this.roads.roads) {
        if (!r || r.n !== name) continue;
        const p = r.pts;
        if (Math.abs(p[0] - v.x) > 1500 || Math.abs(p[1] - v.z) > 1500) continue;
        hi.push(r);
      }
      this._hi = hi;
    }
    this._miniDirty = true;
  }

  // ---------------------------------------------------------------- миникарта
  _minimap(dt, v, car) {
    if (document.body.classList.contains('nomap')) return;
    // масштаб: пешком крупно, в машине отдаляем со скоростью, в полёте — от высоты
    const want = v.mode === 'walk' ? 0.8
      : v.mode === 'fly' ? clamp(1.6 + (v.alt ?? 0) / 40, 2, 8)
      : 1.15 + 1.05 * clamp(Math.abs(car.kmh) / 150, 0, 1);
    this.mppS += (want - this.mppS) * ease(dt, 1.6);
    if (this.yawS === null) this.yawS = v.yaw;
    this.yawS += wrapPi(v.yaw - this.yawS) * ease(dt, 14);

    const m = this._mini, C = this.C, M = this.M;
    const margin = (C - M) / 2;
    let need = this._miniDirty && (this._miniWait -= dt) <= 0;
    if (!m) need = true;
    else {
      const k = this.mppS / m.mpp;
      const dx = (v.x - m.cx) / m.mpp, dz = (v.z - m.cz) / m.mpp;
      // уехали на треть запаса, или масштаб ушёл на 10 % (при отдалении
      // холст «сжимается», и запаса становится меньше)
      if (Math.hypot(dx, dz) > margin * 0.35 || k > 1.1 || k < 0.9) need = true;
    }
    if (need) {
      const o = { cx: v.x, cz: v.z, mpp: this.mppS, dpr: this.dpr, hi: this._hi };
      const missing = drawMini(this.mctx, this.map, o);
      this._mini = o;
      // море догрузится плитками за пару перерисовок
      this._miniDirty = missing; this._miniWait = 0.2;
    }
    const o = this._mini;
    const dx = (v.x - o.cx) / o.mpp, dz = (v.z - o.cz) / o.mpp;
    const th = this.yawS + Math.PI;                 // курс — вверх
    const k = o.mpp / this.mppS;
    this.el.miniCv.style.transform =
      `rotate(${th.toFixed(4)}rad) scale(${k.toFixed(4)}) translate(${(-dx).toFixed(2)}px,${(-dz).toFixed(2)}px)`;
    this.el.north.style.transform = `rotate(${th.toFixed(4)}rad)`;
  }

  // ---------------------------------------------------------------- прибор
  _ctxDial() {
    const g = this.dctx, s = this.D / D0 * this.dpr;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, g.canvas.width, g.canvas.height);
    return [g, s];
  }

  // статичный слой: диск, шкала, цифры — один раз на размер/режим/шрифт
  _staticLayer(kind, rpmMax, red) {
    const key = `${kind}:${this.D}:${this.dpr}:${rpmMax}:${red}`;
    if (key === this._staticKey) return this._static;
    const cv = this._static || document.createElement('canvas');
    cv.width = cv.height = this.el.dial.width;
    const g = cv.getContext('2d'), s = this.D / D0 * this.dpr, c = D0 / 2;
    g.setTransform(s, 0, 0, s, 0, 0);
    g.clearRect(0, 0, D0, D0);
    g.beginPath(); g.arc(c, c, c - 2, 0, Math.PI * 2);
    g.fillStyle = 'rgba(10,12,14,.6)'; g.fill();
    const tick = (r0, r1, a, col, w) => {
      g.beginPath();
      g.moveTo(c + r0 * Math.cos(a), c + r0 * Math.sin(a));
      g.lineTo(c + r1 * Math.cos(a), c + r1 * Math.sin(a));
      g.strokeStyle = col; g.lineWidth = w; g.stroke();
    };
    if (kind === 'car') {
      const ang = r => rad(135 + 270 * r / rpmMax);
      g.beginPath(); g.arc(c, c, 116.5, ang(red), ang(rpmMax));
      g.strokeStyle = RED; g.lineWidth = 3.5; g.stroke();
      for (let r = 0; r <= rpmMax; r += 250) {
        const maj = r % 1000 === 0, mid = r % 500 === 0;
        tick(maj ? 101 : mid ? 106 : 109, 114, ang(r),
          r >= red ? RED : maj ? '#fff' : 'rgba(255,255,255,.55)', maj ? 2.6 : mid ? 1.7 : 1.1);
      }
      g.font = `700 16px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (let k = 0; k <= rpmMax / 1000; k++) {
        const a = ang(k * 1000);
        g.fillStyle = k * 1000 >= red ? RED : 'rgba(255,255,255,.88)';
        g.fillText(String(k), c + 82 * Math.cos(a), c + 82 * Math.sin(a) + 0.5);
      }
      g.beginPath(); g.arc(c, c, 95, ang(0), ang(rpmMax));
      g.strokeStyle = 'rgba(255,255,255,.13)'; g.lineWidth = 4; g.stroke();
      g.font = `600 12px ${FONT}`; g.fillStyle = 'rgba(255,255,255,.7)';
      if ('letterSpacing' in g) g.letterSpacing = '2px';
      g.fillText('КМ/Ч', c + 1, c + 31);
      if ('letterSpacing' in g) g.letterSpacing = '0px';
    } else {
      // указатель курса сверху, неподвижный
      g.beginPath(); g.moveTo(c, c - 119); g.lineTo(c - 7, c - 131); g.lineTo(c + 7, c - 131); g.closePath();
      g.fillStyle = '#fff'; g.fill();
      g.font = `600 12px ${FONT}`; g.fillStyle = 'rgba(255,255,255,.7)';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      if ('letterSpacing' in g) g.letterSpacing = '2px';
      g.fillText('М НАД ЗЕМЛЁЙ', c + 1, c + 31);
      if ('letterSpacing' in g) g.letterSpacing = '0px';
    }
    this._static = cv; this._staticKey = key;
    return cv;
  }

  _dialCar(t) {
    const rpmMax = t.rpmMax || 8000, red = t.redline || 7000;
    const rpm = this.rpmS, kmh = Math.round(this.kmhS);
    const gear = String(t.gear ?? '');
    const hot = t.onLimiter || rpm >= red;
    // перерисовываем, только если стрелка сдвинулась хотя бы на треть градуса
    // помощники: значок мигает, пока ESP/ASR вмешиваются (4 раза в секунду)
    const blink = t.espAct ? (performance.now() / 125 | 0) & 1 : 0;
    const sig = `${Math.round(rpm / 10)}|${kmh}|${gear}|${t.drive}|${t.manual ? 1 : 0}|${hot ? 1 : 0}|${t.dm || ''}|${t.esp || ''}|${t.espAct ? 1 + blink : 0}|${t.absAct ? 1 : 0}|${t.absOff ? 1 : 0}|${t.launch || ''}`;
    if (sig === this._drawn) return;
    this._drawn = sig;
    const st = this._staticLayer('car', rpmMax, red);
    const [g, s] = this._ctxDial();
    g.drawImage(st, 0, 0);
    g.setTransform(s, 0, 0, s, 0, 0);
    const c = D0 / 2, ang = r => rad(135 + 270 * clamp(r, 0, rpmMax) / rpmMax);
    // дуга оборотов: белая до красной зоны, дальше красная
    g.lineCap = 'butt';
    g.beginPath(); g.arc(c, c, 95, ang(0), ang(Math.min(rpm, red)));
    g.strokeStyle = '#fff'; g.lineWidth = 4; g.stroke();
    if (rpm > red) { g.beginPath(); g.arc(c, c, 95, ang(red), ang(rpm)); g.strokeStyle = RED; g.stroke(); }
    // стрелка — по краю шкалы, цифры скорости не перечёркивает
    const a = ang(rpm);
    g.beginPath(); g.moveTo(c + 74 * Math.cos(a), c + 74 * Math.sin(a)); g.lineTo(c + 119 * Math.cos(a), c + 119 * Math.sin(a));
    g.strokeStyle = RED; g.lineWidth = 3.6; g.lineCap = 'round'; g.stroke();
    // скорость
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.font = `800 70px ${FONT}`;
    g.fillText(String(kmh), c, c + 17);
    // передача: в рамке; на отсечке рамка красная; ручная — заливка
    const bx = c - 17, by = c + 49;
    g.beginPath(); g.roundRect(bx, by, 34, 34, 6);
    if (hot) { g.fillStyle = RED; g.fill(); }
    else if (t.manual) { g.fillStyle = '#fff'; g.fill(); }
    g.strokeStyle = hot ? RED : '#fff'; g.lineWidth = 1.6; g.stroke();
    g.fillStyle = t.manual && !hot ? '#14171a' : '#fff';
    g.font = `800 ${gear.length > 1 ? 21 : 27}px ${FONT}`;
    g.fillText(gear, c, c + 75);
    // режим езды (drivemodes.js) — справа от передачи, своим цветом
    if (t.dm) {
      g.fillStyle = t.dmColor || '#fff';
      g.font = `800 17px ${FONT}`;
      g.textAlign = 'left';
      g.fillText(t.dm, bx + 44, c + 72);
      g.textAlign = 'center';
    }
    if (t.launch !== 'armed') this._driveIcon(g, c - 8, c - 66, t.drive);     // на его месте — RACE START
    this._assistIcons(g, c, bx, t, blink);
  }

  // Значки помощников, как на приборах Mercedes (жёлтые):
  //   ESP OFF / ESP SPORT — слева от передачи, пока режим не обычный;
  //   треугольник с изогнутыми следами — мигает, когда ESP или ASR вмешиваются;
  //   ABS — горит при срабатывании (выключенная — тускло, постоянно);
  //   RACE START — над скоростью, пока лаунч ждёт старта.
  _assistIcons(g, c, bx, t, blink) {
    const AMB = '#ffb300';
    g.save();
    if (t.esp === 'off' || t.esp === 'sport') {
      g.fillStyle = AMB; g.textAlign = 'right'; g.font = `800 14px ${FONT}`;
      g.fillText('ESP', bx - 8, c + 63);
      g.fillText(t.esp === 'off' ? 'OFF' : 'SPORT', bx - 8, c + 78);
    }
    if (t.espAct && !blink) {
      const x = c + 30, y = c - 64;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 10, y + 17); g.lineTo(x - 10, y + 17); g.closePath();
      g.fillStyle = AMB; g.fill();
      g.strokeStyle = '#14171a'; g.lineWidth = 1.3;
      g.beginPath(); g.moveTo(x - 3, y + 15); g.quadraticCurveTo(x - 5, y + 9, x - 1, y + 6); g.moveTo(x + 3, y + 15); g.quadraticCurveTo(x + 1, y + 9, x + 5, y + 6); g.stroke();
    }
    if (t.absAct || t.absOff) {
      g.globalAlpha = t.absAct ? 1 : 0.55;
      g.strokeStyle = AMB; g.fillStyle = AMB; g.lineWidth = 1.5;
      const x = c - 56, y = c - 48;
      g.beginPath(); g.arc(x, y, 9.5, 0, Math.PI * 2); g.stroke();
      g.font = `800 9px ${FONT}`; g.textAlign = 'center'; g.fillText('ABS', x, y + 3.2);
      g.globalAlpha = 1;
    }
    if (t.launch === 'armed') {
      g.fillStyle = AMB; g.textAlign = 'center'; g.font = `800 15px ${FONT}`;
      g.fillText('RACE START', c, c - 49);
    }
    g.restore();
  }

  // шасси сверху: ведущие колёса залиты, ведомые — контуром
  _driveIcon(g, x, y, drive) {
    g.save(); g.translate(x, y);
    g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 1.6; g.lineCap = 'butt';
    g.beginPath(); g.moveTo(4, 3.5); g.lineTo(12, 3.5); g.moveTo(8, 3.5); g.lineTo(8, 20.5); g.moveTo(4, 20.5); g.lineTo(12, 20.5); g.stroke();
    const wheel = (wx, wy, on) => {
      g.beginPath();
      if (on) { g.roundRect(wx, wy, 4, 7, 1.2); g.fillStyle = '#fff'; g.fill(); }
      else { g.roundRect(wx + 0.6, wy + 0.6, 2.8, 5.8, 1); g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 1.2; g.stroke(); }
    };
    const front = String(drive).toLowerCase() !== 'rwd';     // телеметрия physics пишет 'RWD'
    wheel(0, 0, front); wheel(12, 0, front); wheel(0, 17, true); wheel(12, 17, true);
    g.restore();
  }

  _dialFly(alt) {
    const head = this.headS;                       // курс: 0 — юг (+z), по часовой — запад
    const altR = Math.max(0, Math.round(alt));
    const sig = `f|${Math.round(head * 300)}|${altR}`;
    if (sig === this._drawn) return;
    this._drawn = sig;
    const st = this._staticLayer('fly', 0, 0);
    const [g, s] = this._ctxDial();
    g.drawImage(st, 0, 0);
    g.setTransform(s, 0, 0, s, 0, 0);
    const c = D0 / 2;
    // Компасный курс: мир смотрит в +(sin yaw, cos yaw), z — на юг, значит
    // север (−z) — это yaw = π. Картушка вращается, курс всегда вверху.
    const bearing = Math.PI - head;                // 0 — север, по часовой
    for (let d = 0; d < 360; d += 5) {
      const a = rad(d) - bearing - Math.PI / 2, maj = d % 30 === 0;
      const r0 = maj ? 101 : 107;
      g.beginPath();
      g.moveTo(c + r0 * Math.cos(a), c + r0 * Math.sin(a));
      g.lineTo(c + 114 * Math.cos(a), c + 114 * Math.sin(a));
      g.strokeStyle = d === 0 ? RED : maj ? '#fff' : 'rgba(255,255,255,.5)';
      g.lineWidth = maj ? 2.4 : 1.1; g.stroke();
    }
    g.font = `800 17px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    [['С', 0], ['В', 90], ['Ю', 180], ['З', 270]].forEach(([n, d]) => {
      const a = rad(d) - bearing - Math.PI / 2;
      g.fillStyle = d === 0 ? RED : '#fff';
      g.fillText(n, c + 85 * Math.cos(a), c + 85 * Math.sin(a) + 0.5);
    });
    g.fillStyle = '#fff'; g.textBaseline = 'alphabetic';
    g.font = `800 70px ${FONT}`;
    g.fillText(String(altR), c, c + 17);
  }
}
