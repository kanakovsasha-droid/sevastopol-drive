// Режимы езды, как AMG DYNAMIC SELECT: Eco · Comfort · Sport · Sport+.
//
// Параметры ложатся ПОВЕРХ vehicle.js — множителями и порогами в car.dm, сама
// машина (CAR, CARS) не меняется. Sport — ровно то, что было до режимов: на
// нём машина ведёт себя как раньше.
//   gas   — показатель кривой педали: >1 — вялый отклик в начале хода;
//   rise  — во сколько раз быстрее/медленнее «нажимается» газ с клавиатуры;
//   upLo, upHi — порог переключения вверх: upLo + upHi · газ (об/мин);
//   down  — ниже скольких оборотов под газом коробка идёт вниз;
//   shift — длительность переключения (множитель);
//   steer — время выкручивания руля (множитель): меньше — острее;
//   esp, tcMin, tcSlip — курсовая устойчивость и противобуксовочная
//                        (null — как у машины);
//   exhaust — множитель громкости выхлопа (сам звук не трогаем).
// Клавиши 1–4 или Y по кругу; на геймпаде — тачпад / View+… (см. gamepad.js).

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* приватное окно */ } },
};

export const MODES = {
  eco:     { name: 'Eco',     short: 'E',  color: '#7fd18b', gas: 1.7, rise: 0.45, upLo: 1900, upHi: 2500, down: 1400, shift: 1.45, steer: 1.12, esp: 0.95, tcMin: 0.30, tcSlip: 0.10, exhaust: 0.70 },
  comfort: { name: 'Comfort', short: 'C',  color: '#ffffff', gas: 1.3, rise: 0.70, upLo: 2200, upHi: 3300, down: 1800, shift: 1.20, steer: 1.06, esp: 0.75, tcMin: 0.40, tcSlip: 0.14, exhaust: 0.85 },
  sport:   { name: 'Sport',   short: 'S',  color: '#e8b451', gas: 1.0, rise: 1.00, upLo: 2600, upHi: 4100, down: 2200, shift: 1.00, steer: 1.00, esp: null, tcMin: null, tcSlip: null, exhaust: 1.00 },
  sportp:  { name: 'Sport+',  short: 'S+', color: '#ff3b30', gas: 0.85, rise: 1.45, upLo: 3600, upHi: 3500, down: 3000, shift: 0.65, steer: 0.86, esp: 0.20, tcMin: 0.65, tcSlip: 0.26, exhaust: 1.20 },
};
const ORDER = ['eco', 'comfort', 'sport', 'sportp'];

export class DriveModes {
  constructor({ car, audio, toast }) {
    this.getCar = car; this.audio = audio; this.toast = toast || (() => {});
    const saved = ls.get('sev.drivemode');
    this.id = MODES[saved] ? saved : 'comfort';
    this.apply();
    addEventListener('keydown', e => {
      if (e.repeat || (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName))) return;
      const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
      if (n >= 0) this.set(ORDER[n]);
      if (e.code === 'KeyY') this.set(ORDER[(ORDER.indexOf(this.id) + 1) % ORDER.length]);
    });
  }

  get mode() { return MODES[this.id]; }

  set(id) {
    if (!MODES[id]) return;
    this.id = id;
    ls.set('sev.drivemode', id);
    this.apply();
    this.toast('Режим: ' + MODES[id].name);
  }

  // Машину меняют в гараже — режим надо положить и на новую; зовётся каждый
  // кадр из main.js, дёшево: только сравнение.
  apply() {
    const car = this.getCar();
    if (car && car.dm !== this.mode) car.dm = this.mode;
    // громкость выхлопа — множителем к громкости движка, запомнив исходную
    const a = this.audio?.()?.audio;
    if (a && typeof a.volume === 'number') {
      if (a._volBase == null) a._volBase = a.volume;
      a.volume = a._volBase * this.mode.exhaust;
    }
  }
}
