// Качество графики для слабых ноутбуков: «Высокое» (как было) и «Низкое».
//
// «Низкое» не трогает ни материалы, ни шейдеры — только то, что меняется на
// ходу без пересборки программ (смена antialias или типа теней пересобрала бы
// все шейдеры города, это секунды фриза):
//   — разрешение: потолок 1.0 вместо 2 (на ретине вчетверо меньше пикселей);
//   — тени: карта 1024² вместо 1536² и квадрат ±120 м вместо ±185 м —
//     тексель почти тот же (0.23 м), зато меньше предметов попадает в проход
//     теней и сама карта легче;
//   — дальность: кварталы грузим до 1600 м (было 2600), держим до 2600 —
//     меньше чанков в памяти и в кадре;
//   — мелочь (фонари, кусты, машины во дворах — userData.far) гасим на 0.65
//     прежней дистанции.
//
// Автопонижение: если «Высокое» и средний кадр за 5 с ниже 30 в секунду —
// сами переходим на «Низкое» и пишем об этом. Вверх сами не возвращаемся:
// качели «вверх-вниз» хуже ровного низкого. Пока открыто меню, пауза или
// вкладка в фоне — не считаем (кадры там не показательны), и первые 20 с после
// загрузки тоже: там подгрузка кварталов.
//
// Хранится в localStorage (sev.quality).

const KEY = 'sev.quality';
const store = {
  get() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } },
  set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* приватное окно */ } },
};

export const LEVELS = { high: 'Высокое', low: 'Низкое' };

const PRESET = {
  high: { pr: 2, shadow: 1536, box: 185, radius: 2600, keep: 3600, far: 1 },
  low:  { pr: 1, shadow: 1024, box: 120, radius: 1600, keep: 2600, far: 0.65 },
};

// Множитель дистанции мелочи — читает cullFar в main.js.
export const QUALITY = { far: 1 };

export class Quality {
  constructor({ renderer, sun, chunks, toast, busy }) {
    this.renderer = renderer; this.sun = sun; this.chunks = chunks;
    this.toast = toast || (() => {});
    this.busy = busy || (() => false);
    const P = new URLSearchParams(location.search);
    // ?radius= / ?keep= в адресе — ручная настройка, её не перебиваем
    this.urlRadius = +P.get('radius') || 0;
    this.urlKeep = +P.get('keep') || 0;
    this.cfg = { level: 'high', auto: true, ...(store.get() || {}) };
    if (P.get('quality') in PRESET) this.cfg.level = P.get('quality');
    if (!(this.cfg.level in PRESET)) this.cfg.level = 'high';
    this._listeners = [];
    // окно подсчёта кадров
    this._acc = 0; this._n = 0; this._warm = 20;
    this._wrapPR();
    this.apply();
  }

  get level() { return this.cfg.level; }
  onChange(f) { this._listeners.push(f); }
  save() { store.set(this.cfg); }

  set(level, why) {
    if (!(level in PRESET) || level === this.cfg.level) return;
    this.cfg.level = level;
    this.save();
    this.apply();
    if (why) this.toast(why);
    for (const f of this._listeners) f(level);
  }
  setAuto(v) { this.cfg.auto = !!v; this.save(); }

  // Потолок разрешения — обёрткой над регулятором из main.js (__setPR):
  // регулятор сам опускает и поднимает, мы только не пускаем выше потолка.
  _wrapPR() {
    const orig = window.__setPR;
    if (!orig || orig.__q) return;
    const q = this;
    const wrapped = v => orig(Math.min(v, PRESET[q.cfg.level].pr));
    wrapped.__q = true;
    window.__setPR = wrapped;
    this._origPR = orig;
  }

  apply() {
    const p = PRESET[this.cfg.level];
    // разрешение: в «Низком» сразу вниз до потолка; в «Высоком» регулятор
    // поднимется сам, когда кадр позволит
    const pr = window.__getPR?.();
    if (pr && pr > p.pr && this._origPR) this._origPR(p.pr);

    // тени: новый размер карты — старую освободить, three создаст новую на
    // следующем кадре (шейдеры не пересобираются: тип теней тот же)
    const sh = this.sun?.shadow;
    if (sh) {
      if (sh.mapSize.x !== p.shadow) {
        sh.mapSize.set(p.shadow, p.shadow);
        sh.map?.dispose(); sh.map = null;
      }
      const c = sh.camera;
      if (c.right !== p.box) {
        c.left = -p.box; c.right = p.box; c.top = p.box; c.bottom = -p.box;
        c.updateProjectionMatrix();
      }
    }

    // дальность кварталов
    if (this.chunks) {
      this.chunks.radius = this.urlRadius || p.radius;
      this.chunks.keep = Math.max(this.urlKeep || p.keep, this.chunks.radius + 600);
    }
    QUALITY.far = p.far;
  }

  // Каждый кадр из main.js: копим среднее и, если надо, понижаем.
  tick(dt) {
    if (!this.cfg.auto || this.cfg.level === 'low') return;
    if (document.hidden || this.busy() || dt > 0.5) { this._acc = 0; this._n = 0; return; }
    if (this._warm > 0) { this._warm -= dt; return; }
    this._acc += dt; this._n++;
    if (this._acc < 5) return;
    const fps = this._n / this._acc;
    this._acc = 0; this._n = 0;
    if (fps < 30) this.set('low', `Графика: «Низкое» — кадров было ${Math.round(fps)} в секунду. Вернуть — T → «Графика»`);
  }

  stats() {
    const p = PRESET[this.cfg.level];
    return { level: this.cfg.level, auto: this.cfg.auto, pr: window.__getPR?.(), shadow: p.shadow,
      radius: this.chunks?.radius, keep: this.chunks?.keep, far: QUALITY.far };
  }
}
