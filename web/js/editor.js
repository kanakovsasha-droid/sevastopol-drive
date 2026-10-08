// Редактор карты в игре (F2): владелец правит город сам, без Blender и без
// пересборки данных. Формат слоя правок — docs/EDITOR.md.
//
// Как устроено. Все правки — один объект E (он же файл data/edits.json):
// дома по id OSM и деревья (посаженные руками и снятые). Слой накладывается
// на данные квадрата ПЕРЕД сборкой (applyEdits из buildChunk в main.js) —
// сборщики ничего о редакторе не знают, они видят уже исправленный дом.
// Правка в редакторе — это пересборка только тех квадратов, где лежит этот
// дом (ChunkManager.rebuild): старый квартал стоит, пока новый не показан.
//
// Дом правим от исходника: при первом касании копия исходных полей ложится
// в b.__o, и каждое наложение считает дом заново от неё — поэтому отмена и
// «как было» просто убирают запись из E.
//
// Сохранение: localStorage (автоматически), «Скачать edits.json» —
// файл, который владелец кладёт в data/. На загрузке игра берёт черновик из
// localStorage, а если его нет — data/edits.json. На сервер ничего не пишется.
//
// В обычной игре (редактор закрыт) стоимость — один проход по id домов
// квадрата на его сборке; ни одного вызова отрисовки.
import * as THREE from 'three';
import { TREES, ST } from './flora.js?v=2628e755';
import { PolyGrid } from './worldgen.js?v=2628e755';

const LS = 'sev.edits';
const LV_H = (lv) => lv * 3.2 + 1.2;            // как parseH в tools/build-world.mjs
const empty = () => ({ version: 1, buildings: {}, trees: { add: [], del: [] } });
let E = empty();
let fileE = null;                                // то, что лежит в data/edits.json

function norm(o) {
  const e = empty();
  if (o && typeof o === 'object') {
    if (o.buildings && typeof o.buildings === 'object') e.buildings = o.buildings;
    if (o.trees) {
      e.trees.add = Array.isArray(o.trees.add) ? o.trees.add : [];
      e.trees.del = Array.isArray(o.trees.del) ? o.trees.del : [];
    }
  }
  return e;
}
const hasEdits = () => Object.keys(E.buildings).length || E.trees.add.length || E.trees.del.length;

// На загрузке, до первого квадрата: черновик из localStorage, иначе файл.
export async function loadEdits(v) {
  try {
    const r = await fetch(`../data/edits.json${v ? '?v=' + v : ''}`);
    if (r.ok) fileE = norm(await r.json());
  } catch { fileE = null; }
  let draft = null;
  try { draft = localStorage.getItem(LS); } catch { /* приватный режим */ }
  try { E = draft ? norm(JSON.parse(draft)) : norm(fileE); } catch { E = norm(fileE); }
}

// ------------------------------------------------------------ наложение
function longestEdge(p) {
  let best = 0, bl = -1;
  for (let i = 0, n = p.length / 2 - 1; i < n; i++) {
    const l = Math.hypot(p[i * 2 + 2] - p[i * 2], p[i * 2 + 3] - p[i * 2 + 1]);
    if (l > bl) { bl = l; best = i; }
  }
  return best;
}

// Центр и длинная ось исходного контура: вокруг них поворот и масштаб.
function frame(p) {
  let cx = 0, cz = 0;
  const n = p.length / 2 - (p[0] === p[p.length - 2] && p[1] === p[p.length - 1] ? 1 : 0);
  for (let i = 0; i < n; i++) { cx += p[i * 2]; cz += p[i * 2 + 1]; }
  cx /= n; cz /= n;
  const i = longestEdge(p);
  const dx = p[i * 2 + 2] - p[i * 2], dz = p[i * 2 + 3] - p[i * 2 + 1], l = Math.hypot(dx, dz) || 1;
  return { cx, cz, ax: dx / l, az: dz / l };
}

function mover(f, e) {
  const L = e.len || 1, W = e.wid || 1, r = (e.rot || 0) * Math.PI / 180;
  const cr = Math.cos(r), sr = Math.sin(r), dx = e.dx || 0, dz = e.dz || 0;
  const bx = -f.az, bz = f.ax;
  return (x, z) => {
    const px = x - f.cx, pz = z - f.cz;
    const a = (px * f.ax + pz * f.az) * L, b = (px * bx + pz * bz) * W;
    const vx = a * f.ax + b * bx, vz = a * f.az + b * bz;
    return [f.cx + vx * cr - vz * sr + dx, f.cz + vx * sr + vz * cr + dz];
  };
}
const moveArr = (arr, m) => {
  const out = arr.slice();
  for (let i = 0; i + 1 < arr.length; i += 2) { const q = m(arr[i], arr[i + 1]); out[i] = +q[0].toFixed(2); out[i + 1] = +q[1].toFixed(2); }
  return out;
};

function applyOne(b, e) {
  const o = b.__o || (b.__o = {
    poly: b.poly, holes: b.holes, h: b.h, lv: b.lv, wc: b.wc, rc: b.rc, rs: b.rs, gate: b.gate, fx: b.fx,
  });
  // от исходника
  b.poly = o.poly; b.holes = o.holes; b.h = o.h; b.lv = o.lv; b.wc = o.wc; b.rc = o.rc;
  b.rs = o.rs; b.gate = o.gate; b.fx = o.fx; delete b._gate; delete b.edWc; delete b.edSer;
  if (!e) return;
  if (e.dx || e.dz || e.rot || (e.len && e.len !== 1) || (e.wid && e.wid !== 1)) {
    const m = mover(frame(o.poly), e);
    b.poly = moveArr(o.poly, m);
    if (o.holes) b.holes = o.holes.map(h => moveArr(h, m));
    if (o.gate) { const q = m(o.gate[0], o.gate[1]); b.gate = [q[0], q[1], ...o.gate.slice(2)]; }
  }
  if (e.lv) { b.lv = e.lv; b.h = LV_H(e.lv); }
  if (e.ser) {
    // серия — своей записью вида series.json прямо на доме (series.js, seriesOf)
    if (e.ser === 'k' || e.ser === 's' || e.ser === 'p') {
      b.edSer = [e.ser, longestEdge(b.poly), 0];
      if (!e.lv) { b.lv = { k: 5, s: 4, p: 9 }[e.ser]; b.h = LV_H(b.lv); }
    } else b.edSer = null;
    if (e.ser === 'box') { b.rs = 'flat'; b.fx = undefined; }
    if (e.ser === 'house') { b.rs = 'hipped'; b.fx = undefined; if (!e.lv) { b.lv = 2; b.h = LV_H(2); } }
  }
  if (e.wc) { b.wc = e.wc; b.edWc = e.wc; }
  if (e.rc) b.rc = e.rc;
}

// Слой правок на список домов: правит на месте, удалённые — вон из списка.
export function applyEditsTo(list) {
  if (!list || !list.length) return list;
  let del = false;
  for (const b of list) {
    const e = b.id && E.buildings[b.id];
    if (e || b.__o) applyOne(b, e);
    if (e && e.del) del = true;
  }
  return del ? list.filter(b => !(b.id && E.buildings[b.id]?.del)) : list;
}

// Данные квадрата перед сборкой (buildChunk в main.js).
export function applyEdits(d) {
  if (d.buildings) d.buildings = applyEditsTo(d.buildings);
  if (d.allBuildings) d.allBuildings = applyEditsTo(d.allBuildings);
}

// ------------------------------------------------------------ учёт для выбора
const reg = new Map();          // часть → дома, как их построили
const treeReg = new Map();      // часть → [{k, x, y, z, w, h}]
let grid = null;
let onRegister = null;          // редактор: перерисовать рамку, когда дом пересобран
export function registerChunk(part, buildings) { reg.set(part, buildings || []); grid = null; onRegister?.(buildings); }
export function dropChunkEdits(part) { if (reg.delete(part)) grid = null; treeReg.delete(part); }

// Деревья: снятые выкидываем из набора квадрата, посаженные добавляем.
// Зовёт props.js перед посадкой (world.__treeEdit).
const DEL_R = 1.6;
export function treeHook(part) {
  return (sets, inSq, H) => {
    const del = E.trees.del.filter(p => inSq(p[0], p[1]));
    if (del.length) {
      for (const k of TREES) {
        const a = sets[k]; if (!a) continue;
        const out = [];
        for (let i = 0; i < a.length; i += ST) {
          const x = a[i], z = a[i + 2];
          if (del.some(p => Math.abs(p[0] - x) < DEL_R && Math.abs(p[1] - z) < DEL_R)) continue;
          for (let j = 0; j < ST; j++) out.push(a[i + j]);
        }
        sets[k] = out;
      }
    }
    for (const t of E.trees.add) {
      if (!inSq(t.x, t.z) || !TREES.includes(t.k)) continue;
      const rot = ((t.x * 12.9898 + t.z * 78.233) % 6.283 + 6.283) % 6.283;
      (sets[t.k] || (sets[t.k] = [])).push(t.x, H(t.x, t.z) - 0.25, t.z, t.w || 0.9, t.h || 0.9, rot, 0, 0, 0);
    }
    const list = [];
    for (const k of TREES) {
      const a = sets[k]; if (!a) continue;
      for (let i = 0; i < a.length; i += ST) list.push({ k, x: a[i], y: a[i + 1], z: a[i + 2], w: a[i + 3], h: a[i + 4] });
    }
    treeReg.set(part, list);
  };
}

// ------------------------------------------------------------ интерфейс
const WALLS = ['#efe9dc', '#e6dcc4', '#d9c39a', '#e8c9a3', '#efd9b0', '#ead0c6', '#c9d8e2', '#cfdbc2', '#c8c6c0', '#b7735a'];
const ROOFS = ['#9c4a33', '#7d3a2a', '#5e544c', '#6a6a66', '#4a6b57', '#6b4a3a', '#a9adb0', '#d8d4cc'];
const SERS = [['', 'как было'], ['k', 'хрущёвка'], ['s', 'сталинка'], ['p', 'девятиэтажка'], ['house', 'частный'], ['box', 'коробка']];
const TREE_NAMES = { platan: 'платан', chestnut: 'каштан', acacia: 'акация', poplar: 'тополь', pine: 'сосна',
  olive: 'олива', cypress: 'кипарис', thuja: 'туя', spruce: 'ель' };

const CSS = `
#editor{position:fixed;top:12px;right:12px;z-index:19;width:min(310px,92vw);max-height:calc(100vh - 24px);overflow:auto;
  display:none;padding:12px 14px;font-family:var(--ui);font-size:13px;color:var(--ink)}
#editor.on{display:block}
#editor h3{font-family:var(--hud);font-weight:800;font-size:18px;letter-spacing:.05em;text-transform:uppercase;margin:0 0 8px;
  display:flex;justify-content:space-between}
#editor h4{margin:10px 0 4px;font-size:11px;color:var(--dim);font-weight:600;text-transform:uppercase;letter-spacing:.06em}
#editor button,#editor select{font:inherit;font-size:12px;color:var(--ink);background:rgba(255,255,255,.06);border:1px solid var(--line);
  border-radius:7px;padding:4px 8px;cursor:pointer;margin:0 3px 4px 0}
#editor select option{color:#000}
#editor button:hover{background:rgba(255,255,255,.15)}
#editor button.on{background:rgba(255,214,90,.28);border-color:rgba(255,214,90,.7)}
#editor .row{display:flex;align-items:center;flex-wrap:wrap;gap:2px}
#editor .row b{min-width:42px;text-align:center;font-family:var(--mono)}
#editor .sw{width:20px;height:20px;padding:0;border-radius:5px;margin:0 3px 3px 0}
#editor input[type=color]{width:26px;height:22px;padding:0;border:0;background:none;cursor:pointer}
#editor .dim{color:var(--dim);font-size:11px;line-height:1.45}
#editor .list{max-height:120px;overflow:auto}
#editor .list div{cursor:pointer;padding:1px 0;font-family:var(--mono);font-size:11px}
#editor .list div:hover{color:#ffd65a}
`;

export class Editor {
  // fly() — включить полёт; look(dx, dy) — обзор; toast(t) — подсказка
  constructor({ scene, camera, canvas, terrain, chunks, fly, look, toast, flyTo }) {
    Object.assign(this, { scene, camera, canvas, terrain, chunks, fly, look, toast, flyTo });
    this.on = false;
    this.tool = 'bld';
    this.sel = null;           // { id, b } или { tree }
    this.plant = false;
    this.species = 'platan';
    this.undo = [];
    this.dirty = new Set();
    this.timer = 0;
    this.mark = new THREE.Group();
    this.mark.renderOrder = 999;
    scene.add(this.mark);
    this.lineMat = new THREE.LineBasicMaterial({ color: 0xffd65a, depthTest: false, transparent: true });
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const el = document.createElement('div');
    el.id = 'editor'; el.className = 'panel';
    document.body.appendChild(el);
    this.el = el;
    // клавиши в полях панели — только панели (иначе Q опускает полёт и т. п.)
    el.addEventListener('keydown', e => { if (/INPUT|SELECT/.test(e.target.tagName)) e.stopPropagation(); });
    el.addEventListener('click', e => e.stopPropagation());
    this._file = document.createElement('input');
    this._file.type = 'file'; this._file.accept = '.json,application/json';
    this._file.onchange = () => this._upload();
    addEventListener('keydown', e => this._key(e), true);
    canvas.addEventListener('mousedown', e => this._down(e));
    addEventListener('mousemove', e => this._move(e));
    addEventListener('mouseup', e => this._up(e));
    canvas.addEventListener('contextmenu', e => { if (this.on) e.preventDefault(); });
    onRegister = list => {
      const id = this.sel && this.sel.id;
      if (id && list && list.some(b => b.id === id)) this._outline();
    };
    this.render();
  }

  toggle(v = !this.on) {
    this.on = v;
    this.el.classList.toggle('on', v);
    document.body.classList.toggle('editing', v);
    if (v) { document.exitPointerLock?.(); this.fly(); this.toast('Редактор: клик — выбрать, ПКМ — обзор'); }
    else { this.select(null); this.plant = false; }
    this.render();
  }

  // ---------------------------------------------------------- клавиши
  _key(e) {
    if (e.code === 'F2') { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) this.toggle(); return; }
    if (!this.on || /INPUT|SELECT/.test(e.target?.tagName || '')) return;
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); e.stopImmediatePropagation(); this.undoLast(); return; }
    if (e.code === 'Escape') { e.stopImmediatePropagation(); if (this.sel) this.select(null); else this.toggle(false); return; }
    const s = this.sel;
    if (!s) return;
    const step = e.shiftKey ? 2 : 0.5;
    const mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.code];
    if (mv) {
      e.preventDefault(); e.stopImmediatePropagation();
      // стрелки — по экрану: вверх — от камеры
      const f = new THREE.Vector3(); this.camera.getWorldDirection(f); f.y = 0; f.normalize();
      const r = new THREE.Vector3(-f.z, 0, f.x);
      const dx = (r.x * mv[0] - f.x * mv[1]) * step, dz = (r.z * mv[0] - f.z * mv[1]) * step;
      if (s.id) this.editB(s.id, e2 => { e2.dx = +((e2.dx || 0) + dx).toFixed(2); e2.dz = +((e2.dz || 0) + dz).toFixed(2); });
      else this.moveTree(s.tree, s.tree.x + dx, s.tree.z + dz);
      return;
    }
    if (s.id && (e.code === 'BracketLeft' || e.code === 'BracketRight')) {
      e.stopImmediatePropagation();
      const d = (e.code === 'BracketLeft' ? -1 : 1) * (e.shiftKey ? 15 : 2);
      this.editB(s.id, e2 => { e2.rot = ((e2.rot || 0) + d) % 360; });
    }
    if (e.code === 'Delete' || e.code === 'Backspace') {
      e.stopImmediatePropagation();
      if (s.id) this.editB(s.id, e2 => { e2.del = !e2.del; });
      else this.delTree(s.tree);
    }
  }

  // ---------------------------------------------------------- мышь
  _ray(e) {
    const r = this.canvas.getBoundingClientRect();
    const v = new THREE.Vector3(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1, 0.5);
    v.unproject(this.camera);
    const o = this.camera.position.clone();
    return { o, d: v.sub(o).normalize() };
  }
  // Луч шагом по 0.5 м: первый дом, в контур которого он вошёл ниже кровли,
  // или земля. Растр без треугольников — дома квадрата собраны в общий меш.
  _pick(e, wantTree = false) {
    const { o, d } = this._ray(e);
    if (!grid) {
      const all = [];
      for (const list of reg.values()) for (const b of list) if (b.poly && b.poly.length >= 6) all.push(b);
      grid = new PolyGrid(all, 40);
      for (const b of all) b.__top = this._top(b);
    }
    const tg = wantTree ? this._treeGrid() : null;
    for (let t = 0.5; t < 1500; t += 0.5) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      if (tg) {
        const c = tg.get(Math.floor(x / 8) * 100003 + Math.floor(z / 8));
        if (c) for (const tr of c) {
          const rr = 2.2 * tr.w;
          if (Math.abs(tr.x - x) < rr && Math.abs(tr.z - z) < rr && y > tr.y && y < tr.y + 11 * tr.h) return { tree: tr, x, z };
        }
      }
      if (y < this.terrain.gridHeightAt(x, z)) return { ground: true, x, z };
      const b = grid.find(x, z);
      if (b && y < b.__top) return { b, x, z };
    }
    return null;
  }
  _top(b) {
    let g = -Infinity;
    for (let i = 0; i < b.poly.length; i += 2) g = Math.max(g, this.terrain.gridHeightAt(b.poly[i], b.poly[i + 1]));
    return g + b.h + 3;
  }
  _treeGrid() {
    const m = new Map();
    for (const list of treeReg.values()) for (const t of list) {
      const k = Math.floor(t.x / 8) * 100003 + Math.floor(t.z / 8);
      for (const dx of [-1, 0, 1]) for (const dz of [-1, 0, 1]) {
        const kk = k + dx * 100003 + dz;
        let a = m.get(kk); if (!a) m.set(kk, a = []); a.push(t);
      }
    }
    return m;
  }
  _down(e) {
    if (!this.on) return;
    if (e.button === 2) { this.looking = { x: e.clientX, y: e.clientY }; return; }
    if (e.button !== 0) return;
    const h = this._pick(e, this.tool === 'tree');
    if (!h) return;
    if (this.tool === 'tree') {
      if (this.plant && !h.tree) { this.addTree(h.x, h.z); return; }
      if (h.tree) { this.select({ tree: h.tree }); this.drag = { x0: h.x, z0: h.z, y: h.tree.y }; }
      else this.select(null);
      return;
    }
    if (h.b && h.b.id) {
      const same = this.sel && this.sel.id === h.b.id;
      this.select({ id: h.b.id, b: h.b });
      // тащим, только если взяли уже выбранный дом
      if (same) this.drag = { x0: h.x, z0: h.z, y: this.terrain.gridHeightAt(h.x, h.z) };
    } else this.select(null);
  }
  _ground(e, y) {
    const { o, d } = this._ray(e);
    if (Math.abs(d.y) < 1e-3) return null;
    const t = (y - o.y) / d.y;
    return t > 0 ? { x: o.x + d.x * t, z: o.z + d.z * t } : null;
  }
  _move(e) {
    if (!this.on) return;
    if (this.looking) {
      this.look(e.clientX - this.looking.x, e.clientY - this.looking.y);
      this.looking = { x: e.clientX, y: e.clientY };
      return;
    }
    const g = this.drag && this._ground(e, this.drag.y);
    if (!g) return;
    this.drag.dx = g.x - this.drag.x0; this.drag.dz = g.z - this.drag.z0;
    this.mark.position.set(this.drag.dx, 0, this.drag.dz);     // рамка едет за мышью, дом — по отпусканию
  }
  _up(e) {
    if (e.button === 2) { this.looking = null; return; }
    const dr = this.drag; this.drag = null;
    if (!dr || !this.on) return;
    this.mark.position.set(0, 0, 0);
    if (!dr.dx && !dr.dz || Math.hypot(dr.dx, dr.dz) < 0.2) return;
    const s = this.sel;
    if (s && s.id) this.editB(s.id, e2 => { e2.dx = +((e2.dx || 0) + dr.dx).toFixed(2); e2.dz = +((e2.dz || 0) + dr.dz).toFixed(2); });
    else if (s && s.tree) this.moveTree(s.tree, s.tree.x + dr.dx, s.tree.z + dr.dz);
  }

  // ---------------------------------------------------------- выбор и рамка
  select(s) {
    this.sel = s;
    this._outline();
    this.render();
  }
  _findB(id) {
    for (const list of reg.values()) for (const b of list) if (b.id === id) return b;
    return null;
  }
  _outline() {
    for (const c of [...this.mark.children]) { this.mark.remove(c); c.geometry.dispose(); }
    const s = this.sel;
    if (!s) return;
    const mk = pts => {
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      const l = new THREE.LineLoop(g, this.lineMat);
      l.renderOrder = 999; l.frustumCulled = false;
      this.mark.add(l);
    };
    if (s.tree) {
      const t = s.tree, r = 2.2 * t.w, pts = [];
      for (let i = 0; i < 24; i++) pts.push(new THREE.Vector3(t.x + Math.cos(i / 24 * 6.283) * r, t.y + 0.4, t.z + Math.sin(i / 24 * 6.283) * r));
      mk(pts);
      return;
    }
    const b = this._findB(s.id) || s.b;
    if (!b) return;
    s.b = b;
    const p = b.poly, lo = [], hi = [];
    const top = this._top(b) - 3;
    for (let i = 0; i + 1 < p.length; i += 2) {
      const g = this.terrain.gridHeightAt(p[i], p[i + 1]);
      lo.push(new THREE.Vector3(p[i], g + 0.3, p[i + 1]));
      hi.push(new THREE.Vector3(p[i], top + 0.3, p[i + 1]));
    }
    mk(lo); mk(hi);
  }

  // ---------------------------------------------------------- правки
  _snap() { return JSON.stringify(E); }
  _commit(before) {
    this.undo.push(before);
    if (this.undo.length > 200) this.undo.shift();
    this._apply(JSON.parse(before));
  }
  // что поменялось между двумя слоями → какие квадраты пересобрать
  _apply(prev) {
    for (const id of new Set([...Object.keys(prev.buildings), ...Object.keys(E.buildings)])) {
      if (JSON.stringify(prev.buildings[id]) === JSON.stringify(E.buildings[id])) continue;
      for (const k of this.chunks.refs.get(id) || []) this.dirty.add(k);
      const o = this.chunks.owner.get(id); if (o) this.dirty.add(o.split('>').pop());
    }
    const sig = (t) => new Set([...t.add.map(a => JSON.stringify(a)), ...t.del.map(a => JSON.stringify(a))]);
    const a = sig(prev.trees), b = sig(E.trees);
    for (const s of [...a, ...b]) {
      if (a.has(s) && b.has(s)) continue;
      const v = JSON.parse(s), x = Array.isArray(v) ? v[0] : v.x, z = Array.isArray(v) ? v[1] : v.z;
      this.dirty.add(this.chunks.keyAt(x, z));
    }
    try { localStorage.setItem(LS, JSON.stringify(E)); } catch { /* приватный режим */ }
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this._rebuild(), 250);
    this._outline();
    this.render();
  }
  _rebuild() {
    const left = new Set();
    for (const k of this.dirty) {
      const st = this.chunks.state.get(k);
      if (st === 'built') this.chunks.rebuild(k);
      else if (st === 'build' || st === 'ready' || st === 'load') left.add(k);   // собирается — дождёмся
    }
    this.dirty = left;
    if (left.size) this.timer = setTimeout(() => this._rebuild(), 400);
  }
  editB(id, fn) {
    const before = this._snap();
    const e = E.buildings[id] || {};
    fn(e);
    for (const k of Object.keys(e)) if (e[k] === undefined || e[k] === '' || e[k] === 0 || e[k] === false || (k === 'len' || k === 'wid') && e[k] === 1) delete e[k];
    if (Object.keys(e).length) E.buildings[id] = e; else delete E.buildings[id];
    this._commit(before);
  }
  addTree(x, z) {
    const before = this._snap();
    E.trees.add.push({ uid: 't' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36), x: +x.toFixed(2), z: +z.toFixed(2), k: this.species, w: 0.9, h: 0.9 });
    this._commit(before);
  }
  delTree(t) {
    const before = this._snap();
    const i = E.trees.add.findIndex(a => Math.abs(a.x - t.x) < 0.05 && Math.abs(a.z - t.z) < 0.05);
    if (i >= 0) E.trees.add.splice(i, 1);
    else E.trees.del.push([+t.x.toFixed(2), +t.z.toFixed(2)]);
    this.sel = null;
    this._commit(before);
  }
  moveTree(t, x, z) {
    const before = this._snap();
    const a = E.trees.add.find(a => Math.abs(a.x - t.x) < 0.05 && Math.abs(a.z - t.z) < 0.05);
    if (a) { a.x = +x.toFixed(2); a.z = +z.toFixed(2); }
    else {
      // своё дерево переносим как «снять тут + посадить там» той же породы и размера
      E.trees.del.push([+t.x.toFixed(2), +t.z.toFixed(2)]);
      E.trees.add.push({ uid: 't' + Date.now().toString(36), x: +x.toFixed(2), z: +z.toFixed(2), k: t.k, w: +t.w.toFixed(3), h: +t.h.toFixed(3) });
    }
    t.x = x; t.z = z;
    this._commit(before);
  }
  undoLast() {
    const s = this.undo.pop();
    if (!s) { this.toast('Отменять нечего'); return; }
    const prev = E;
    E = norm(JSON.parse(s));
    this._apply(prev);
    if (this.sel && this.sel.tree) this.select(null);
  }
  replaceAll(next, msg) {
    const before = this._snap();
    E = norm(next);
    this._commit(before);
    this.select(null);
    this.toast(msg);
  }

  // ---------------------------------------------------------- файл
  download() {
    const blob = new Blob([JSON.stringify(E, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'edits.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  async _upload() {
    const f = this._file.files[0];
    this._file.value = '';
    if (!f) return;
    try { this.replaceAll(JSON.parse(await f.text()), 'Правки загружены: ' + f.name); }
    catch (err) { this.toast('Не читается: ' + err.message); }
  }

  // ---------------------------------------------------------- панель
  render() {
    if (!this.on) { this.el.innerHTML = ''; return; }
    const s = this.sel, nB = Object.keys(E.buildings).length, nT = E.trees.add.length + E.trees.del.length;
    let h = `<h3><span>Редактор карты</span><button data-a="close">×</button></h3>
      <div class="row"><button data-a="tool" data-v="bld" class="${this.tool === 'bld' ? 'on' : ''}">Дома</button>
      <button data-a="tool" data-v="tree" class="${this.tool === 'tree' ? 'on' : ''}">Деревья</button></div>`;
    if (this.tool === 'bld') {
      if (s && s.id) {
        const e = E.buildings[s.id] || {}, b = s.b || {};
        const lv = e.lv || b.lv || Math.max(1, Math.round(((b.h || 4.4) - 1.2) / 3.2));
        h += `<h4>${s.id}${b.n ? ' · ' + b.n : ''}</h4>
          <div class="row">Этажей <button data-a="lv" data-v="-1">−</button><b>${lv}</b><button data-a="lv" data-v="1">+</button>
          <select data-a="ser">${SERS.map(([v, t]) => `<option value="${v}"${(e.ser || '') === v ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
          <h4>Стены</h4><div class="row">${WALLS.map(c => `<button class="sw" data-a="wc" data-v="${c}" style="background:${c}"></button>`).join('')}
            <input type="color" data-a="wcx" value="${e.wc || '#e6dcc4'}"><button data-a="wc" data-v="">как было</button></div>
          <h4>Кровля</h4><div class="row">${ROOFS.map(c => `<button class="sw" data-a="rc" data-v="${c}" style="background:${c}"></button>`).join('')}
            <input type="color" data-a="rcx" value="${e.rc || '#9c4a33'}"><button data-a="rc" data-v="">как было</button></div>
          <h4>Положение</h4>
          <div class="row">Поворот <button data-a="rot" data-v="-15">⟲15°</button><button data-a="rot" data-v="-2">⟲</button><b>${e.rot || 0}°</b>
            <button data-a="rot" data-v="2">⟳</button><button data-a="rot" data-v="15">⟳15°</button></div>
          <div class="row">Длина <button data-a="len" data-v="-0.05">−</button><b>${Math.round((e.len || 1) * 100)}%</b><button data-a="len" data-v="0.05">+</button>
            Ширина <button data-a="wid" data-v="-0.05">−</button><b>${Math.round((e.wid || 1) * 100)}%</b><button data-a="wid" data-v="0.05">+</button></div>
          <div class="dim">Сдвиг: стрелки (Shift — по 2 м) или тащить выбранный дом мышью. [ ] — поворот.</div>
          <div class="row" style="margin-top:6px"><button data-a="del">${e.del ? 'Вернуть дом' : 'Удалить дом'}</button>
            <button data-a="reset">Как было</button></div>`;
      } else h += `<div class="dim" style="margin-top:6px">Клик по дому — выбрать.</div>`;
    } else {
      h += `<h4>Порода</h4><div class="row"><select data-a="sp">${TREES.map(k => `<option value="${k}"${k === this.species ? ' selected' : ''}>${TREE_NAMES[k] || k}</option>`).join('')}</select>
        <button data-a="plant" class="${this.plant ? 'on' : ''}">Сажать кликом</button></div>`;
      if (s && s.tree) h += `<h4>Дерево: ${TREE_NAMES[s.tree.k] || s.tree.k}</h4><div class="row"><button data-a="tdel">Удалить</button></div>
        <div class="dim">Сдвиг: стрелки или тащить мышью.</div>`;
      else h += `<div class="dim" style="margin-top:6px">Клик по дереву — выбрать; «Сажать кликом» — посадить на землю.</div>`;
    }
    h += `<h4>Правки: домов ${nB}, деревьев ${nT}</h4>
      <div class="row"><button data-a="undo">Отменить (Ctrl+Z)</button><button data-a="dl">Скачать edits.json</button>
      <button data-a="ul">Загрузить…</button></div>
      <div class="row">${fileE ? '<button data-a="file">Взять data/edits.json</button>' : ''}<button data-a="clear">Сбросить всё</button></div>
      <div class="list">${Object.entries(E.buildings).slice(0, 80).map(([id, e]) => `<div data-a="go" data-v="${id}">${id}${e.del ? ' — удалён' : ''}</div>`).join('')}</div>
      <div class="dim">ПКМ + мышь — обзор, WASD / Space / Q — полёт, колесо — скорость. Правки сохраняются в браузере;
        «Скачать» — файл для data/edits.json. Esc / F2 — выйти.</div>`;
    this.el.innerHTML = h;
    this.el.querySelectorAll('[data-a]').forEach(n => {
      const ev = n.tagName === 'SELECT' || n.type === 'color' ? 'change' : 'click';
      n.addEventListener(ev, () => this._act(n.dataset.a, n.dataset.v ?? n.value, n));
    });
  }
  _act(a, v, n) {
    const id = this.sel && this.sel.id;
    const B = fn => id && this.editB(id, fn);
    switch (a) {
      case 'close': this.toggle(false); break;
      case 'tool': this.tool = v; this.select(null); break;
      case 'lv': B(e => {
        const b = this.sel.b || {};
        const cur = e.lv || b.lv || Math.max(1, Math.round(((b.h || 4.4) - 1.2) / 3.2));
        e.lv = Math.max(1, Math.min(40, cur + +v));
      }); break;
      case 'ser': B(e => { e.ser = n.value || undefined; }); break;
      case 'wc': B(e => { e.wc = v || undefined; }); break;
      case 'rc': B(e => { e.rc = v || undefined; }); break;
      case 'wcx': B(e => { e.wc = n.value; }); break;
      case 'rcx': B(e => { e.rc = n.value; }); break;
      case 'rot': B(e => { e.rot = ((e.rot || 0) + +v) % 360; }); break;
      case 'len': B(e => { e.len = +Math.max(0.3, Math.min(3, (e.len || 1) + +v)).toFixed(2); }); break;
      case 'wid': B(e => { e.wid = +Math.max(0.3, Math.min(3, (e.wid || 1) + +v)).toFixed(2); }); break;
      case 'del': B(e => { e.del = !e.del; }); break;
      case 'reset': B(e => { for (const k of Object.keys(e)) delete e[k]; }); break;
      case 'sp': this.species = n.value; break;
      case 'plant': this.plant = !this.plant; this.render(); break;
      case 'tdel': if (this.sel && this.sel.tree) this.delTree(this.sel.tree); break;
      case 'undo': this.undoLast(); break;
      case 'dl': this.download(); break;
      case 'ul': this._file.click(); break;
      case 'file': this.replaceAll(fileE, 'Правки из data/edits.json'); break;
      case 'clear': if (confirm('Сбросить все правки?')) this.replaceAll(empty(), 'Правки сброшены'); break;
      case 'go': {
        const b = this._findB(v);
        if (b) this.select({ id: v, b });
        else {
          // дом не загружен — летим к нему по дальнему слою
          const p = this.flyTo(v);
          if (!p) this.toast('Дом не найден рядом');
          else this.select({ id: v, b: null });
        }
        break;
      }
    }
  }
}
