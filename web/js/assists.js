// Электронные помощники, как у Mercedes-AMG: ABS, ASR (антипробуксовка),
// ESP в трёх режимах и Race Start (лаунч-контроль). Сама физика — в
// vehicle.js (ESP_MODES, car.assist); здесь — выбор игрока и его хранение.
//
//   U коротко — ESP по кругу: On → Sport → Off → On;
//   U держать дольше 0.8 с — ESP OFF сразу (как длинное нажатие у AMG),
//   из OFF длинное нажатие возвращает On.
//   Режим езды задаёт ESP по умолчанию: Eco / Comfort — On, Sport и Sport+ —
//   Sport (сменил режим езды — ESP встаёт по нему, как в машине).
//   ABS, ASR и Race Start включаются в настройках (T → «Машина»).
//
// Всё хранится в localStorage (sev.assist), обёрнуто в try/catch.

const KEY = 'sev.assist';
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* приватное окно */ } },
};
export const ESP_NAMES = { on: 'ESP ON', sport: 'ESP SPORT', off: 'ESP OFF' };
const CYCLE = ['on', 'sport', 'off'];
// ESP по умолчанию для режима езды (drivemodes.js: short — E, C, S, S+)
const BY_DM = { E: 'on', C: 'on', S: 'sport', 'S+': 'sport' };

export class Assists {
  constructor({ car, toast }) {
    this.getCar = car; this.toast = toast || (() => {});
    let s = {};
    try { s = JSON.parse(ls.get(KEY) || '{}') || {}; } catch { s = {}; }
    this.cfg = {
      abs: s.abs ?? true,
      asr: s.asr ?? true,
      launch: s.launch ?? true,
      esp: CYCLE.includes(s.esp) ? s.esp : 'on',
    };
    this._dm = null;                 // режим езды, под который ESP уже выставлен
    this._fresh = !CYCLE.includes(s.esp);   // ESP ещё не выбирали — берём по режиму езды
    this._down = 0;                  // когда нажали U
    this._long = false;
    addEventListener('keydown', e => {
      if (e.code !== 'KeyU' || (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName))) return;
      if (e.repeat) return;
      this._down = performance.now(); this._long = false;
      clearTimeout(this._tm);
      this._tm = setTimeout(() => {                    // держат — ESP OFF (или назад в On)
        this._long = true;
        this.setEsp(this.cfg.esp === 'off' ? 'on' : 'off');
      }, 800);
    });
    addEventListener('keyup', e => {
      if (e.code !== 'KeyU' || !this._down) return;
      clearTimeout(this._tm);
      if (!this._long) this.setEsp(CYCLE[(CYCLE.indexOf(this.cfg.esp) + 1) % CYCLE.length]);
      this._down = 0;
    });
  }

  save() { ls.set(KEY, JSON.stringify(this.cfg)); }
  setEsp(m) {
    this.cfg.esp = m; this.save(); this.apply();
    this.toast(m === 'off' ? 'ESP OFF — все системы выключены' : m === 'sport' ? 'ESP SPORT — занос до ~16°' : 'ESP ON');
  }
  set(k, v) { this.cfg[k] = v; this.save(); this.apply(); }

  // каждый кадр из main.js: режим езды сменился — ESP по нему; выбор — в машину
  apply() {
    const car = this.getCar();
    if (!car) return;
    const dm = car.dm?.short || '';
    if (dm && dm !== this._dm) {
      if ((this._dm !== null || this._fresh) && BY_DM[dm] && BY_DM[dm] !== this.cfg.esp) { this.cfg.esp = BY_DM[dm]; this.save(); }
      this._fresh = false;
      this._dm = dm;
    }
    const a = car.assist || (car.assist = {});
    a.abs = this.cfg.abs; a.asr = this.cfg.asr; a.launch = this.cfg.launch; a.esp = this.cfg.esp;
  }
}
