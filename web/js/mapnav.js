// Управление полноэкранной картой (Tab): масштаб и сдвиг.
//
// Раньше карта знала только колесо «приблизить / отдалить», и центр всегда
// стоял на игроке. На маке с тачпадом так неудобно: щипок приходит как wheel
// с ctrlKey, а прокрутка двумя пальцами — как wheel без него, и оба крутили
// масштаб. Теперь:
//   • щипок тачпада (wheel + ctrlKey; в Safari — gesturechange) — плавный
//     масштаб вокруг точки под курсором;
//   • два пальца по тачпаду — сдвиг карты;
//   • колесо обычной мыши — масштаб ступенькой, тоже вокруг курсора;
//   • перетаскивание мышью / пальцем — сдвиг, два пальца на сенсорном
//     экране — щипок;
//   • кнопки + / − / «к себе», клавиши = и −.
// Клик без перетаскивания по-прежнему «переехать туда» (mapClick в main.js):
// после настоящего перетаскивания клик глушим в фазе захвата на #mapfull.
//
// Центр держим в пикселях обзорного растра (map.X / map.Z), null — на игроке.

const ZMIN = 1, ZMAX = 40;
const DRAG_PX = 5;                     // сдвиг пальца меньше — это ещё клик

export class MapNav {
  // o: { box — #mapfull, cv — холст, map() — карта, open() — открыта ли,
  //      redraw() — перерисовать, player() — {x, z} игрока }
  constructor(o) {
    this.o = o;
    this.zoom = 1;
    this.c = null;                     // {mx, my} центр в пикселях растра или null
    this.ptr = new Map();              // активные указатели: id → {x, y}
    this.moved = false;                // было ли перетаскивание в этом жесте
    this.ctrlWheelAt = -1e9;           // время последнего щипка через wheel
    this.gScale = 1;                   // Safari: масштаб жеста на прошлом шаге
    this.buttons();
    this.listen();
  }

  // При открытии карты: заданный масштаб, центр на игроке.
  reset(zoom) { this.zoom = clamp(zoom, ZMIN, ZMAX); this.c = null; }

  // Центр для drawFull в метрах мира (или null — на игроке).
  center() {
    const m = this.o.map();
    if (!this.c || !m) return null;
    return { x: this.c.mx / m.px + m.minX, z: this.c.my / m.px + m.minZ };
  }

  // экранная точка события → пиксели холста
  local(e) {
    const cv = this.o.cv, r = cv.getBoundingClientRect();
    return { sx: (e.clientX - r.left) * cv.width / r.width,
             sy: (e.clientY - r.top) * cv.height / r.height,
             k: cv.width / r.width };
  }

  // Масштаб в f раз так, чтобы точка холста (sx, sy) осталась на месте.
  // Опираемся на map.view — его кладёт последний drawFull.
  zoomAt(f, sx, sy) {
    const m = this.o.map(), v = m?.view, cv = this.o.cv;
    if (!v) return;
    const z = clamp(this.zoom * f, ZMIN, ZMAX);
    if (z === this.zoom) return;
    if (sx == null) { sx = cv.width / 2; sy = cv.height / 2; }
    const mx = (sx - v.ox) / v.k, my = (sy - v.oy) / v.k;   // точка растра под курсором
    const k2 = v.k / this.zoom * z;                          // fit * новый zoom
    this.zoom = z;
    this.c = this.clampC((cv.width / 2 - (sx - mx * k2)) / k2,
                         (cv.height / 2 - (sy - my * k2)) / k2);
    this.o.redraw();
  }

  // Сдвиг на (dx, dy) пикселей холста. На общем плане (zoom = 1) карта
  // вписана целиком и двигать нечего.
  pan(dx, dy) {
    const m = this.o.map(), v = m?.view;
    if (!v || this.zoom <= 1.001) return;
    const c = this.c || this.playerC();
    this.c = this.clampC(c.mx - dx / v.k, c.my - dy / v.k);
    this.o.redraw();
  }

  playerC() {
    const m = this.o.map(), p = this.o.player();
    return { mx: m.X(p.x), my: m.Z(p.z) };
  }

  clampC(mx, my) {
    const m = this.o.map();
    return { mx: clamp(mx, 0, m.W), my: clamp(my, 0, m.H) };
  }

  buttons() {
    const bar = document.createElement('div');
    bar.id = 'mapnav';
    bar.style.cssText = 'position:absolute;right:28px;top:50%;transform:translateY(-50%);'
      + 'display:flex;flex-direction:column;gap:6px;pointer-events:auto';
    const mk = (txt, title, fn) => {
      const b = document.createElement('button');
      b.textContent = txt; b.title = title;
      b.style.cssText = 'width:38px;height:38px;border-radius:9px;border:1px solid rgba(255,255,255,.18);'
        + 'background:rgba(20,24,28,.82);color:#f2ede2;font:600 20px/1 -apple-system,sans-serif;'
        + 'cursor:pointer;padding:0';
      b.addEventListener('click', e => { e.stopPropagation(); fn(); });
      bar.appendChild(b);
    };
    mk('+', 'Приблизить (=)', () => this.zoomAt(1.5));
    mk('−', 'Отдалить (−)', () => this.zoomAt(1 / 1.5));
    mk('⌖', 'К себе', () => { this.c = null; this.o.redraw(); });
    this.o.box.appendChild(bar);
    const hint = this.o.box.querySelector('#maphint');
    if (hint) hint.innerHTML = 'клик — переехать туда &nbsp;·&nbsp; щипок / колесо — масштаб'
      + ' &nbsp;·&nbsp; два пальца / перетаскивание — сдвиг &nbsp;·&nbsp; Tab — закрыть';
  }

  listen() {
    const { box, cv } = this.o;

    box.addEventListener('wheel', e => {
      if (!this.o.open()) return;
      e.preventDefault(); e.stopPropagation();
      const p = this.local(e);
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      const dx = e.deltaX * unit, dy = e.deltaY * unit;
      if (e.ctrlKey) {                                      // щипок тачпада
        this.ctrlWheelAt = performance.now();
        this.zoomAt(Math.exp(-dy * 0.01), p.sx, p.sy);
      } else if (isTrackpad(e)) {                           // два пальца — сдвиг
        this.pan(-dx * p.k, -dy * p.k);
      } else {                                              // колесо мыши
        this.zoomAt(dy > 0 ? 0.8 : 1.25, p.sx, p.sy);
      }
    }, { passive: false });

    // Safari щипок шлёт жестами. Если тот же щипок уже пришёл ctrl-колесом —
    // жест пропускаем, иначе масштаб удвоится.
    box.addEventListener('gesturestart', e => { e.preventDefault(); this.gScale = 1; });
    box.addEventListener('gesturechange', e => {
      e.preventDefault();
      if (!this.o.open() || performance.now() - this.ctrlWheelAt < 300) return;
      const p = this.local(e);
      this.zoomAt(e.scale / this.gScale, p.sx, p.sy);
      this.gScale = e.scale;
    });

    cv.style.touchAction = 'none';
    cv.addEventListener('pointerdown', e => {
      if (!this.o.open() || (e.pointerType === 'mouse' && e.button !== 0)) return;
      if (!this.ptr.size) this.moved = false;
      this.ptr.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY });
      cv.setPointerCapture?.(e.pointerId);
    });
    cv.addEventListener('pointermove', e => {
      const q = this.ptr.get(e.pointerId);
      if (!q) return;
      const k = this.local(e).k;
      if (this.ptr.size === 1) {
        if (!this.moved && Math.hypot(e.clientX - q.x0, e.clientY - q.y0) < DRAG_PX) return;
        this.moved = true;
        this.pan((e.clientX - q.x) * k, (e.clientY - q.y) * k);
      } else if (this.ptr.size === 2) {
        // два пальца на экране: щипок вокруг середины + сдвиг серединой
        const [a, b] = [...this.ptr.values()];
        const o = a === q ? b : a;
        const d0 = Math.hypot(q.x - o.x, q.y - o.y);
        const d1 = Math.hypot(e.clientX - o.x, e.clientY - o.y);
        const m = this.local({ clientX: (e.clientX + o.x) / 2, clientY: (e.clientY + o.y) / 2 });
        this.moved = true;
        this.pan((e.clientX - q.x) * k / 2, (e.clientY - q.y) * k / 2);
        if (d0 > 1) this.zoomAt(d1 / d0, m.sx, m.sy);
      }
      q.x = e.clientX; q.y = e.clientY;
    });
    const up = e => { this.ptr.delete(e.pointerId); };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('lostpointercapture', up);
    cv.style.cursor = 'crosshair';

    // клик после перетаскивания — не «переехать»
    box.addEventListener('click', e => {
      if (this.moved && e.target === cv) { e.stopPropagation(); this.moved = false; }
    }, true);

    addEventListener('keydown', e => {
      if (!this.o.open()) return;
      if (e.code === 'Equal' || e.code === 'NumpadAdd') { this.zoomAt(1.5); e.preventDefault(); }
      if (e.code === 'Minus' || e.code === 'NumpadSubtract') { this.zoomAt(1 / 1.5); e.preventDefault(); }
    });
  }
}

// Тачпад или колесо. Колесо мыши в Chrome/Safari даёт wheelDeltaY кратным
// 120 и ровно −3·deltaY; тачпад — мелкие дробные шаги и боковую составляющую.
function isTrackpad(e) {
  if (e.deltaMode !== 0) return false;
  if (e.deltaX !== 0) return true;
  if (typeof e.wheelDeltaY === 'number' && e.wheelDeltaY !== 0)
    return e.wheelDeltaY !== -3 * e.deltaY;
  return !Number.isInteger(e.deltaY) || Math.abs(e.deltaY) < 40;
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
