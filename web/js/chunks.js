// Потоковая подгрузка города квадратами по 1024 м. Контракт — docs/CHUNKS.md.
//
// Пять правил, из-за которых всё и написано именно так:
//   1. Качаем и разбираем JSON в воркере: разбор чанка стоит десятки
//      миллисекунд, в главном потоке это пропущенный кадр на каждом квартале.
//   2. Собираем НЕ БОЛЬШЕ ОДНОГО чанка за кадр. Сборка геометрии синхронна;
//      два-три чанка подряд — уже заметный рывок.
//   3. Выгружаем с гистерезисом: грузим по radius, держим до keep. Без запаса
//      чанк на границе радиуса дёргается «загрузился — выгрузился» каждый кадр.
//   4. Выгружаем ПО ОЧЕРЕДИ, по паре за кадр. Прыжок через полкарты разом
//      обесценивает все три десятка квадратов, а выгрузка одного — это сотни
//      dispose и снятие с индексов: все сразу давали 600 мс паузы.
//   5. Сирот выгруженного квадрата (объект лежит и у соседа) пересобираем
//      ТОЙ ЖЕ очередью, что и обычные квадраты. Раньше их домматывали разом
//      прямо в выгрузке — длинная улица через полгорода стоила там 130 мс.

// Поля чанка, которые дедуплицируются по id. Объект, попавший в несколько
// чанков (длинная улица, дом на шве), лежит в каждом из них целиком, но
// строится ровно один раз — вместе с тем чанком, который приехал первым.
const FIELDS = ['buildings', 'roads', 'areas', 'green', 'water', 'rail', 'coast',
                'crossings', 'fuel', 'zones', 'landmarks'];
// Вложенные словари массивов: places.trees, furniture.points и так далее.
const SUBFIELDS = {
  places: ['paths', 'trees', 'features', 'fences', 'structures', 'trains'],
  furniture: ['points', 'barriers'],
};
// Перекрёстки — контекст, а не геометрия: по ним сборщик дорог решает, где НЕ
// класть бордюр. Дедуплицировать их нельзя, иначе на шве у чужого перекрёстка
// бордюры сходящихся улиц полезут поперёк проезжей части.
const CONTEXT = ['junctions'];

export class ChunkManager {
  constructor(base, opts = {}) {
    // Адрес приводим к абсолютному СРАЗУ: качает воркер, а относительный путь
    // внутри него считается от адреса самого воркера (web/js/) — и '../data'
    // уезжало в web/data, отдавая 404 на каждый чанк.
    this.base = new URL(base, location.href).href.replace(/\/$/, '');
    this.chunk = opts.chunk || 1024;
    this.radius = opts.radius ?? 2600;
    this.keep = opts.keep ?? 3600;
    this.parallel = opts.parallel ?? 3;     // сколько качаем одновременно
    this.msBudget = opts.msBudget ?? 8;     // сколько миллисекунд кадра отдаём сборке
    this.v = opts.v || '';

    this.cells = new Map();      // key → { cx, cz, bytes }
    this.state = new Map();      // key → 'queue' | 'load' | 'ready' | 'built'
    this.ready = new Map();      // key → разобранные данные, ждут сборки
    this.groups = new Map();     // key → [THREE.Object3D, ...]
    this.contains = new Map();   // key → [id объектов, лежащих в чанке]
    this.owner = new Map();      // id объекта → чанк, который его построил
    this.refs = new Map();       // id → Set(чанки, где объект лежит)
    this.shared = new Map();     // id → { f, s, o } для объектов из двух и более чанков
    this.queue = [];             // ключи к загрузке, отсортированы по важности
    this.dropQueue = [];         // ключи к выгрузке — по паре за кадр, не все разом
    this.orphans = [];           // осиротевшие объекты, ждут пересборки
    this.building = null;        // чанк, который собирается прямо сейчас
    this.loading = new Set();
    this.built = new Set();
    this.failed = new Set();     // чанки, которых нет на сервере — больше не просим

    this.onBuild = null;
    this.onDrop = null;
    // Разрешение на сборку. Геометрия квадрата сажается по высотам ОДИН раз,
    // при сборке: если в этот момент детального рельефа под ним ещё нет,
    // дороги и дома встанут по грубой сетке и потом окажутся в склоне.
    // Возвращает false — квадрат ждёт в this.ready до следующего кадра.
    this.canBuild = null;

    this._px = 0; this._pz = 0; this._dirX = 0; this._dirZ = 1;
    this._speed = 0; this._t = 0;
    this._lastScanX = Infinity; this._lastScanZ = Infinity;
    this.stats = { built: 0, dropped: 0, bytes: 0, buildMs: 0, worstMs: 0 };
  }

  async init() {
    const q = this.v ? '?v=' + this.v : '';
    const index = await fetch(`${this.base}/index.json${q}`).then(r => {
      if (!r.ok) throw new Error(`нет ${this.base}/index.json (HTTP ${r.status})`);
      return r.json();
    });
    this.index = index;
    if (index.chunk) this.chunk = index.chunk;
    for (const c of index.chunks) this.cells.set(c.cx + '_' + c.cz, c);

    const far = await fetch(`${this.base}/${index.far || 'far.json'}${q}`).then(r => r.json());

    // Воркер один: он только качает и разбирает, узкое место — сеть, а не он.
    this.worker = new Worker(new URL('./chunk-worker.js' + q, import.meta.url));
    this.worker.onmessage = e => {
      const { key, data, error } = e.data;
      this.loading.delete(key);
      if (error) {
        // Без этого чанк, которого нет на сервере (обрезанная выкладка,
        // манифест новее файлов), просился бы заново каждую пересборку
        // очереди — десятки запросов в секунду в лог и в сеть.
        this.failed.add(key);
        this.state.delete(key);
        console.warn('чанк', key, error);
      }
      else { this.ready.set(key, data); this.state.set(key, 'ready'); }
      this._pump();
    };
    return { index, far, meta: index.meta };
  }

  // ------------------------------------------------------------- каждый кадр
  update(x, z) {
    // Направление движения — чтобы чанк ПЕРЕД носом грузился раньше того,
    // что за спиной. Считаем по смещению, сглаживаем: на месте вектор нулевой
    // и приоритет вырождается в чистое расстояние, что тоже верно.
    const now = performance.now();
    const dt = this._t ? Math.min((now - this._t) / 1000, 0.5) : 0;
    this._t = now;
    const dx = x - this._px, dz = z - this._pz;
    const l = Math.hypot(dx, dz);
    if (l > 0.4) {
      const k = Math.min(1, l / 12);
      this._dirX += (dx / l - this._dirX) * k;
      this._dirZ += (dz / l - this._dirZ) * k;
    }
    // Скорость в м/с — по ней решаем, насколько далеко смотреть вперёд.
    // Прыжок через полгорода (меню, клик по карте) — это не скорость: без
    // отсечки он давал сотни тысяч метров в секунду и перекашивал очередь.
    if (l > 200) this._speed = 0;
    else if (dt > 0) this._speed += (l / dt - this._speed) * Math.min(1, dt * 2.5);
    this._px = x; this._pz = z;

    // Полный обход списка чанков дорог не стоит, но и каждый кадр не нужен:
    // пересматриваем очередь, когда игрок сдвинулся заметно. На трассе 90 км/ч
    // это раз в две секунды — очередь успевает перестроиться задолго до шва.
    if (Math.hypot(x - this._lastScanX, z - this._lastScanZ) > 48) {
      this._lastScanX = x; this._lastScanZ = z;
      this._scan(x, z);
    }
    this._pump();
    this._dropSome(x, z);
    this._buildOne();
  }

  get pending() {
    return this.queue.length + this.loading.size + this.ready.size
         + this.orphans.length + (this.building ? 1 : 0);
  }
  get loaded() { return this.built.size; }
  has(key) { return this.built.has(key); }
  keyAt(x, z) { return Math.floor(x / this.chunk) + '_' + Math.floor(z / this.chunk); }

  // расстояние от точки до квадрата чанка (0 — игрок внутри)
  _dist(c, x, z) {
    const s = this.chunk;
    const x0 = c.cx * s, z0 = c.cz * s;
    const ddx = x < x0 ? x0 - x : x > x0 + s ? x - x0 - s : 0;
    const ddz = z < z0 ? z0 - z : z > z0 + s ? z - z0 - s : 0;
    return Math.hypot(ddx, ddz);
  }

  // На трассе счёт идёт не от того, где игрок сейчас, а от того, где он будет
  // через несколько секунд: на 90 км/ч это 250 м в секунду очереди. Чем
  // быстрее едем, тем сильнее перевес переднего чанка над задним.
  _score(c, x, z) {
    const s = this.chunk;
    const lead = Math.min(this.radius * 0.45, this._speed * 7);
    const ahead = Math.min(0.55, 0.2 + this._speed * 0.012);
    const lx = x + this._dirX * lead, lz = z + this._dirZ * lead;
    const cx = c.cx * s + s / 2 - x, cz = c.cz * s + s / 2 - z;
    const cl = Math.hypot(cx, cz) || 1;
    const dot = (cx / cl) * this._dirX + (cz / cl) * this._dirZ;      // −1…+1
    return this._dist(c, lx, lz) * (1 - ahead * dot);
  }

  _scan(x, z) {
    const want = [];
    for (const [key, c] of this.cells) {
      if (this.state.has(key) || this.failed.has(key)) continue;
      if (this._dist(c, x, z) > this.radius) continue;
      want.push(key);
    }
    for (const key of want) { this.queue.push(key); this.state.set(key, 'queue'); }
    // Очередь переставляем ВСЕГДА, а не только когда в неё что-то добавили:
    // пока качался хвост, игрок уехал, и первым в списке должен стоять уже
    // другой квадрат — тот, в который он въедет.
    if (this.queue.length > 1)
      this.queue.sort((a, b) => this._score(this.cells.get(a), x, z)
                              - this._score(this.cells.get(b), x, z));
    this._dropFar(x, z);
  }

  _pump() {
    while (this.loading.size < this.parallel && this.queue.length) {
      const key = this.queue.shift();
      if (this.state.get(key) !== 'queue') continue;
      this.state.set(key, 'load');
      this.loading.add(key);
      const q = this.v ? '?v=' + this.v : '';
      this.worker.postMessage({ key, url: `${this.base}/${key}.json${q}` });
    }
  }

  // ------------------------------------------------------------- сборка
  // Сборка чанка идёт ПОЭТАПНО. onBuild может вернуть готовую группу, а может
  // генератор: тогда каждый его шаг (дороги, дома, деревья…) выполняется
  // отдельно, пока не выйдет бюджет кадра. Целиком плотный квартал собирается
  // 170 мс — это десять пропущенных кадров подряд и заметный рывок ровно на
  // въезде в новый квартал; по частям те же 170 мс размазываются и не видны.
  // Начинаем при этом не больше ОДНОГО чанка за кадр.
  _buildOne() {
    const t0 = performance.now();
    if (this.building) this._step(t0);
    if (this.building || !this.onBuild) return;
    // Сироты выгруженного квадрата — такая же сборка, как обычная, и такая же
    // тяжёлая: длинная улица через полгорода. Разом её домотать нельзя, это
    // сотня миллисекунд ровно в кадре выгрузки.
    if (this.orphans.length) {
      const j = this.orphans.shift();
      if (!this.built.has(j.host)) return;          // хозяин успел уехать сам
      try {
        const r = this.onBuild(j.data, j.host);
        if (r && typeof r.next === 'function') {
          this.building = { key: j.host, gen: r, out: [], ms: 0, host: j.host };
          this._step(t0);
        } else if (r) this.groups.get(j.host).push(...(Array.isArray(r) ? r : [r]));
      } catch (e) { console.error('сироты для', j.host, e); }
      return;
    }
    if (!this.ready.size) return;

    // Из готовых берём самый нужный: пока качалось, игрок уехал, и первым
    // должен собраться тот, в который он въезжает, а не тот, что скачался.
    let best = null, bestS = Infinity;
    for (const key of this.ready.keys()) {
      // Не готов рельеф под квадратом — пропускаем, он дождётся своей очереди.
      if (this.canBuild && !this.canBuild(key, this.cells.get(key))) continue;
      const s = this._score(this.cells.get(key), this._px, this._pz);
      if (s < bestS) { bestS = s; best = key; }
    }
    if (best === null) return;
    const data = this.ready.get(best);
    this.ready.delete(best);
    if (this._dist(this.cells.get(best), this._px, this._pz) > this.keep) {
      this.state.delete(best); return;                            // уехали, уже не нужен
    }
    this.state.set(best, 'build');
    try {
      const r = this.onBuild(this._claim(best, data), best);
      if (r && typeof r.next === 'function') {
        this.building = { key: best, gen: r, out: [], ms: 0 };
        this._step(t0);
      } else {
        this._done(best, r ? (Array.isArray(r) ? r : [r]) : [], performance.now() - t0);
      }
    } catch (e) {
      console.error('чанк', best, 'не собрался:', e);
      this._done(best, [], performance.now() - t0);
    }
  }

  _step(t0) {
    const b = this.building;
    do {
      let r;
      const tp = performance.now();
      try { r = b.gen.next(); }
      catch (e) { console.error('чанк', b.key, 'не собрался:', e); r = { done: true }; }
      if (this.prof) {
        const d = performance.now() - tp, k = this.prof.cur || '?';
        this.prof[k] = (this.prof[k] || 0) + d;
        if (d > (this.prof.worst[k] || 0)) this.prof.worst[k] = Math.round(d);
      }
      if (r.value) b.out.push(...(Array.isArray(r.value) ? r.value : [r.value]));
      if (r.done) {
        b.ms += performance.now() - t0;
        this.building = null;
        if (b.host) {                       // пачка сирот — она живёт у хозяина
          const g = this.groups.get(b.host);
          if (g) g.push(...b.out);
          else for (const o of b.out) { try { this.onDrop && this.onDrop(o, b.host); } catch { /* уже выгружен */ } }
          return;
        }
        this._done(b.key, b.out, b.ms);
        return;
      }
    } while (performance.now() - t0 < this.msBudget);
    b.ms += performance.now() - t0;
  }

  _done(key, groups, ms) {
    this.groups.set(key, groups);
    this.stats.buildMs += ms;
    if (ms > this.stats.worstMs) this.stats.worstMs = ms;
    this.stats.built++;
    this.stats.bytes += this.cells.get(key)?.bytes || 0;
    this.state.set(key, 'built');
    this.built.add(key);
  }

  // Оставляет в данных чанка только то, что ещё никем не построено, и
  // запоминает, кто чем владеет. Контекстные поля (перекрёстки) отдаются
  // целиком: по ним ничего не рисуется, зато без них ломаются швы.
  _claim(key, data) {
    const out = { cx: data.cx, cz: data.cz, key };
    for (const f of CONTEXT) if (data[f]) out[f] = data[f];
    const here = [];                       // всё, что лежит в этом чанке
    const take = (arr, f, s) => {
      const mine = [];
      for (const o of arr || []) {
        const id = o.id;
        if (id === undefined) { mine.push(o); continue; }
        here.push(id);
        let set = this.refs.get(id);
        if (!set) this.refs.set(id, set = new Set());
        set.add(key);
        // Объект из двух и более чанков придётся уметь пересобрать, когда его
        // хозяина выгрузят, — держим на него ссылку.
        if (set.size > 1) this.shared.set(id, { f, s, o });
        if (this.owner.has(id)) continue;
        this.owner.set(id, key);
        mine.push(o);
      }
      return mine;
    };
    // Контуры домов квадрата ДО дедупликации: по ним мебель проверяет, не
    // встала ли остановка в стену. Дом на шве принадлежит соседнему квадрату
    // и из out.buildings уходит, а проверять по нему всё равно надо.
    // Это только ссылка на уже разобранный массив — памяти не стоит.
    out.allBuildings = data.buildings || [];
    for (const f of FIELDS) if (data[f]) out[f] = take(data[f], f, null);
    for (const [f, subs] of Object.entries(SUBFIELDS)) {
      if (!data[f]) continue;
      out[f] = {};
      for (const s of subs) out[f][s] = take(data[f][s], f, s);
    }
    this.contains.set(key, here);
    return out;
  }

  // ------------------------------------------------------------- выгрузка
  // Прыжок через полкарты разом обесценивает ВСЕ загруженные квадраты, а
  // выгрузка одного — это сотни geometry.dispose() и текстуры вывесок.
  // Тридцать квадратов в одном кадре давали шестьсот миллисекунд паузы ровно
  // в момент прыжка. Поэтому выгружаем по паре за кадр, из очереди.
  _dropSome(x, z, n = 2) {
    while (n-- > 0 && this.dropQueue.length) {
      const key = this.dropQueue.shift();
      if (!this.built.has(key)) continue;
      if (this._dist(this.cells.get(key), x, z) <= this.keep) continue;   // вернулись — оставляем
      this._drop(key);
    }
  }

  _dropFar(x, z) {
    for (const key of [...this.built]) {
      if (this._dist(this.cells.get(key), x, z) <= this.keep) continue;
      if (!this.dropQueue.includes(key)) this.dropQueue.push(key);
    }
    // То, что успело скачаться, но собирать уже незачем
    for (const key of [...this.ready.keys()]) {
      if (this._dist(this.cells.get(key), x, z) <= this.keep) continue;
      this.ready.delete(key); this.state.delete(key);
    }
    for (const key of [...this.queue]) {
      if (this._dist(this.cells.get(key), x, z) <= this.keep) continue;
      this.queue.splice(this.queue.indexOf(key), 1);
      this.state.delete(key);
    }
  }

  _drop(key) {
    const gs = this.groups.get(key) || [];
    if (this.onDrop) for (const g of gs) { try { this.onDrop(g, key); } catch (e) { console.error(e); } }
    this.groups.delete(key);
    this.built.delete(key);
    this.state.delete(key);
    this.stats.dropped++;

    // Сироты: объект строился вместе с этим чанком, но лежит ещё и в соседнем,
    // который остаётся на месте. Длинная улица уходит в такой чанк целиком —
    // просто забыть её нельзя, в дороге появится дыра. Собираем осиротевшее
    // отдельной пачкой и вешаем на живого соседа: он её и выгрузит, когда
    // придёт его черёд.
    const ids = this.contains.get(key) || [];
    this.contains.delete(key);
    const orphans = [];
    for (const id of ids) {
      const set = this.refs.get(id);
      if (set) {
        set.delete(key);
        if (!set.size) { this.refs.delete(id); this.shared.delete(id); }
      }
      if (this.owner.get(id) !== key) continue;
      this.owner.delete(id);
      const live = this.refs.get(id);
      if (!live || !live.size) continue;
      const rec = this.shared.get(id);
      if (rec) orphans.push({ id, rec, live });
    }
    if (!orphans.length || !this.onBuild) return;

    // Хозяин — ближайший к игроку из живых чанков, где эти объекты лежат.
    let host = null, hostD = Infinity;
    for (const o of orphans)
      for (const k of o.live) {
        if (!this.built.has(k)) continue;
        const d = this._dist(this.cells.get(k), this._px, this._pz);
        if (d < hostD) { hostD = d; host = k; }
      }
    if (!host) return;

    const cell = this.cells.get(key);
    const data = { cx: cell.cx, cz: cell.cz, key: key + '>' + host };
    for (const { id, rec } of orphans) {
      if (rec.s) { (data[rec.f] ||= {}); (data[rec.f][rec.s] ||= []).push(rec.o); }
      else (data[rec.f] ||= []).push(rec.o);
      this.owner.set(id, host);          // теперь объект держит хозяин
      this.contains.get(host)?.push(id);
    }
    this.orphans.push({ data, host });
  }

  // Всё снести (смена набора данных, отладка)
  clear() {
    for (const key of [...this.built]) this._drop(key);
    this.building = null;
    this.ready.clear(); this.queue.length = 0; this.dropQueue.length = 0;
    this.orphans.length = 0; this.state.clear();
    this.owner.clear(); this.refs.clear(); this.shared.clear(); this.contains.clear();
  }
}
