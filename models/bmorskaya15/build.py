# Большая Морская, 15 — угловая сталинка у Таврической лестницы (OSM way 90821885).
#
#   blender -b --python models/bmorskaya15/build.py -- [glb]
#
# Описание фасада — refs/center-models.json (запись w90821885): рустованный
# первый этаж и угол, парные арочные окна на 2–3 этажах, балконы с кованой
# решёткой, угловая лоджия с колонками на 3 этаже и эркер под ней, богатый
# карниз с дентикулами и парапет с оградой. Что сделано наугад — NOTES.md.
#
# План Г-образный: западное крыло вдоль Б. Морской (ребро OSM 0, 44.4 м),
# срезанный угол (ребро 1, 6.5 м) и северное крыло вдоль Таврической лестницы
# (ребро 2, 46.9 м). Лестница поднимается на восток на 8 м, поэтому северное
# крыло тремя уступами: в каждом три этажа над своей землёй.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

X0, Z0 = -284.0, 1042.0          # середина фасада на Б. Морскую, тротуар
origin(X0, Z0)

COL['wall'] = ((0.90, 0.86, 0.76), 0.92)     # #e6dcc2, светлый ровный камень
COL['trim'] = ((0.94, 0.92, 0.85), 0.88)     # руст, карниз, наличники — белый известняк
COL['stone'] = ((0.36, 0.36, 0.35), 0.9)     # тёмно-серый цоколь
COL['roof'] = ((0.31, 0.29, 0.275), 0.85)    # #4f4a46
COL['wall3'] = ((0.52, 0.29, 0.21), 0.9)     # кирпич труб
COL['metal'] = ((0.11, 0.11, 0.12), 0.5)     # кованые решётки, рама эркера
COL['wood'] = ((0.22, 0.15, 0.10), 0.6)      # двери

# ------------------------------------------------------------------ план (мир x, z)
A = (-278.5, 1063.5)   # юго-западный угол
B = (-289.3, 1020.4)   # начало среза угла
C = (-286.5, 1014.5)   # конец среза, северо-западный угол
D = (-241.0, 1003.1)   # северо-восточный угол
E = (-237.7, 1015.9)
Fi = (-274.3, 1024.5)  # внутренний угол двора
G = (-264.5, 1060.1)

GROUND = -3.0
F1 = 4.6               # верх первого этажа (с поясом)
F2 = 8.2
EAVE = 11.6            # низ венчающего карниза
TOP = 12.2             # кровля
PAR = 12.6             # верх парапета
RAIL = 13.3            # верх ограды

# северное крыло: уступы по длине ребра C→D (м от угла C) и их отметки
STEPS = [(0.0, 16.0, 0.0), (16.0, 32.0, 3.3), (32.0, 46.9, 6.3)]

def lerp(a, b, t): return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)

def on_line(p, q, u):
    """Точка на прямой p→q в u метрах от p."""
    L = math.hypot(q[0] - p[0], q[1] - p[1])
    return lerp(p, q, u / L)

# точки внутренней стены северного крыла (прямая Fi→E) напротив границ уступов:
# проекция на направление C→D
_t = ((D[0] - C[0]) / 46.9, (D[1] - C[1]) / 46.9)
def u_of(p): return (p[0] - C[0]) * _t[0] + (p[1] - C[1]) * _t[1]
def inner_at(u):
    ua, ub = u_of(Fi), u_of(E)
    return lerp(Fi, E, (u - ua) / (ub - ua))
N16, N32 = on_line(C, D, 16.0), on_line(C, D, 32.0)
I16, I32 = inner_at(16.0), inner_at(32.0)

# ------------------------------------------------------------------ свои примитивы
def V3(p, z):
    w = W(*p); return Vector((w.x, w.y, z))

def prism(m, pts, z0, z1, skip=(), top=True):
    """Объём по точкам мира; рёбра из skip не строятся (там своя стена с проёмами)."""
    n = len(pts)
    area = sum(W(*pts[i]).x * W(*pts[(i + 1) % n]).y - W(*pts[(i + 1) % n]).x * W(*pts[i]).y for i in range(n))
    for i in range(n):
        if i in skip: continue
        a, b = W(*pts[i]), W(*pts[(i + 1) % n])
        t = (b - a).normalized()
        out = Vector((t.y, -t.x)) if area > 0 else Vector((-t.y, t.x))
        face(m, [V3(pts[i], z0), V3(pts[(i + 1) % n], z0), V3(pts[(i + 1) % n], z1), V3(pts[i], z1)],
             Vector((out.x, out.y, 0)))
    if top:
        face('roof', [V3(p, z1) for p in pts], UP)

def glass(F, ua, ub, za, zb, d=-0.22, m='glass'):
    face(m, [F.p(ua, d, za), F.p(ub, d, za), F.p(ub, d, zb), F.p(ua, d, zb)], F.N())

def rust(F, u0, u1, z0, z1, row=0.5, pr=0.07):
    """Ленточный руст: каждый ряд — лицо, верх и низ (бока прячутся в соседях)."""
    z = z0
    while z < z1 - 0.1:
        za, zb = z + 0.03, min(z + row, z1) - 0.03
        face('trim', [F.p(u0, pr, za), F.p(u1, pr, za), F.p(u1, pr, zb), F.p(u0, pr, zb)], F.N())
        face('trim', [F.p(u0, 0, zb), F.p(u1, 0, zb), F.p(u1, pr, zb), F.p(u0, pr, zb)], UP)
        face('trim', [F.p(u0, 0, za), F.p(u1, 0, za), F.p(u1, pr, za), F.p(u0, pr, za)], -UP)
        z += row

def piers(u0, u1, holes):
    """Простенки между проёмами одного яруса."""
    out, u = [], u0
    for h in sorted(holes):
        if h[0] > u + 0.05: out.append((u, h[0]))
        u = max(u, h[1])
    if u1 > u + 0.05: out.append((u, u1))
    return out

def arch_plate(F, ua, ub, zs, ztop, n, mull, d=0.0, seg=6):
    """Заполнение над пятами n арок в одном проёме (ua..ub): плита стены с полукруглыми вырезами."""
    r = (ub - ua - mull * (n - 1)) / n / 2
    pts = [(ua, ztop), (ua, zs)]
    u = ua
    for k in range(n):
        cu = u + r
        for s in range(1, seg + 1):
            a = math.pi - math.pi * s / seg
            pts.append((cu + r * math.cos(a), zs + r * math.sin(a)))
        u = cu + r
        if k < n - 1:
            pts.append((u + mull, zs)); u += mull
    pts.append((ub, ztop))
    face('wall', [F.p(pu, d, pz) for pu, pz in pts], F.N())
    return r

def pair_window(F, cu, za, zs, base, holes, door=False):
    """Парное арочное окно (два арочных окна рядом), центр cu."""
    r, m = 0.42, 0.24
    ua, ub = cu - r * 2 - m / 2, cu + r * 2 + m / 2
    holes.append((ua, ub, base + za, base + zs + r))
    glass(F, ua, ub, base + za, base + zs + r)
    arch_plate(F, ua, ub, base + zs, base + zs + r, 2, m)
    box('wall', F, cu - m / 2, cu + m / 2, -0.22, 0, base + za, base + zs)            # простенок между окнами
    box('trim', F, cu - 0.14, cu + 0.14, 0, 0.1, base + zs + r - 0.32, base + zs + r + 0.1)  # замок
    box('trim', F, ua - 0.1, ub + 0.1, 0, 0.12, base + za - 0.12, base + za, bottom=False)  # подоконник

def rect_window(F, cu, za, w, h, base, holes):
    """Окно первого этажа с сандриком."""
    ua, ub = cu - w / 2, cu + w / 2
    holes.append((ua, ub, base + za, base + za + h))
    glass(F, ua, ub, base + za, base + za + h)
    box('trim', F, ua - 0.12, ub + 0.12, 0, 0.14, base + za - 0.14, base + za, bottom=False)
    box('trim', F, ua - 0.25, ub + 0.25, 0, 0.22, base + za + h + 0.12, base + za + h + 0.32, bottom=True)

def door(F, cu, w, h, base, holes, z0=0.0):
    ua, ub = cu - w / 2, cu + w / 2
    holes.append((ua, ub, base + z0, base + h))
    face('wood', [F.p(ua, -0.28, base + z0), F.p(ub, -0.28, base + z0), F.p(ub, -0.28, base + h - 0.7),
                  F.p(ua, -0.28, base + h - 0.7)], F.N())
    glass(F, ua, ub, base + h - 0.7, base + h, -0.28)
    box('trim', F, ua - 0.3, ub + 0.3, 0, 0.25, base + h + 0.05, base + h + 0.3)

def shop_arch(F, cu, base, holes, w=2.6):
    """Арочный витринный проём первого этажа (≈3.5 м)."""
    za, zs = 0.6, 2.8
    ua, ub = cu - w / 2, cu + w / 2
    holes.append((ua, ub, base + za, base + zs + w / 2))
    glass(F, ua, ub, base + za, base + zs + w / 2, -0.3)
    arch_plate(F, ua, ub, base + zs, base + zs + w / 2, 1, 0, seg=8)
    box('trim', F, cu - 0.2, cu + 0.2, 0, 0.12, base + zs + w / 2 - 0.4, base + zs + w / 2 + 0.12)
    box('metal', F, ua, ub, -0.3, -0.24, base + zs - 0.05, base + zs + 0.05)          # импост витрины

def floor_wall(F, u0, u1, z0, z1, holes):
    wall(F, u0, u1, z0, z1, 0.0, holes, reveal=0.24, rm='wall')

def railing(F, u0, u1, d, z0, z1, step=0.3):
    """Кованая ограда: поручень, нижняя тяга и прутья-пластины."""
    beam('metal', F.p(u0, d, z1), F.p(u1, d, z1), 0.06, 0.05)
    beam('metal', F.p(u0, d, z0 + 0.1), F.p(u1, d, z0 + 0.1), 0.04, 0.04)
    n = max(1, round((u1 - u0) / step))
    for k in range(n + 1):
        u = u0 + (u1 - u0) * k / n
        w = 0.05 if k % 6 else 0.09
        face('metal', [F.p(u - w / 2, d, z0), F.p(u + w / 2, d, z0), F.p(u + w / 2, d, z1), F.p(u - w / 2, d, z1)], F.N())

def balcony(F, cu, base, zf, w=2.6, dep=0.9):
    box('trim', F, cu - w / 2, cu + w / 2, 0, dep, base + zf - 0.18, base + zf)
    for s in (-1, 1):                                     # консоли
        prism_uz('trim', F, [(cu + s * (w / 2 - 0.25) - 0.1, base + zf - 0.18), (cu + s * (w / 2 - 0.25) + 0.1, base + zf - 0.18),
                             (cu + s * (w / 2 - 0.25) + 0.1, base + zf - 0.6)], 0, dep - 0.1)
    railing(F, cu - w / 2 + 0.05, cu + w / 2 - 0.05, dep - 0.05, base + zf, base + zf + 1.0, 0.25)
    for s in (-1, 1):
        u = cu + s * (w / 2 - 0.05)
        beam('metal', F.p(u, 0.02, base + zf + 1.0), F.p(u, dep - 0.05, base + zf + 1.0), 0.05, 0.05)
        face('metal', [F.p(u, 0.02, base + zf), F.p(u, dep - 0.05, base + zf), F.p(u, dep - 0.05, base + zf + 1.0),
                       F.p(u, 0.02, base + zf + 1.0)], F.U())

def top_dressing(F, u0, u1, base, dentils=True, rail=True):
    """Венчание: карниз с дентикулами, парапет, ограда."""
    band(F, u0, u1, 0, base + EAVE - 0.55, base + EAVE - 0.38, 0.08)               # архитрав
    if dentils:
        u = u0 + 0.25
        while u < u1 - 0.2:
            box('trim', F, u - 0.08, u + 0.08, 0, 0.2, base + EAVE - 0.3, base + EAVE - 0.02, bottom=True)
            u += 0.6
    band(F, u0 - 0.1, u1 + 0.1, 0, base + EAVE, base + EAVE + 0.2, 0.3)
    band(F, u0 - 0.2, u1 + 0.2, 0, base + EAVE + 0.2, base + TOP + 0.05, 0.8)       # вынос ≈0.8 м
    box('wall', F, u0, u1, -0.3, 0, base + TOP, base + PAR)                           # парапет
    box('trim', F, u0 - 0.05, u1 + 0.05, -0.35, 0.05, base + PAR, base + PAR + 0.08)
    if rail:
        railing(F, u0 + 0.1, u1 - 0.1, -0.15, base + PAR + 0.08, base + RAIL, 0.45)

def street_floors(F, u0, u1, base, axes, ground):
    """Стена на улицу от u0 до u1 на отметке base: ground — {ось: вид проёма первого этажа}."""
    h1 = []
    for cu in axes:
        kind = ground.get(cu, 'win')
        if kind == 'win': rect_window(F, cu, 1.3, 1.5, 2.1, base, h1)
        elif kind == 'door': door(F, cu, 1.5, 3.0, base, h1)
        elif kind == 'shop': shop_arch(F, cu, base, h1)
    floor_wall(F, u0, u1, base + GROUND, base + F1, h1)
    box('stone', F, u0, u1, 0, 0.1, base + GROUND, base, bottom=False)                # цоколь, под дверями тоже
    for a, b in piers(u0, u1, [h for h in h1 if h[2] < base + 0.5]):
        box('stone', F, a, b, 0, 0.1, base, base + 0.6, bottom=False)
    for a, b in piers(u0, u1, h1):
        rust(F, a, b, base + 0.6, base + F1 - 0.3)
    band(F, u0, u1, 0, base + F1 - 0.3, base + F1, 0.16)                            # пояс над рустом
    h2 = []
    for cu in axes: pair_window(F, cu, 5.3, 7.0, base, h2)
    floor_wall(F, u0, u1, base + F1, base + F2, h2)
    band(F, u0, u1, 0, base + F2 - 0.12, base + F2, 0.06)
    return h2

def upper_floor(F, u0, u1, base, axes, balconies=()):
    h3 = []
    for cu in axes:
        pair_window(F, cu, 8.85 if cu in balconies else 8.9, 10.5, base, h3)
        if cu in balconies: balcony(F, cu, base, 8.85)
    floor_wall(F, u0, u1, base + F2, base + TOP, h3)

def corner_rust(F, u0, u1, base, z0=F1):
    rust(F, u0, u1, base + z0, base + EAVE - 0.6)

# ------------------------------------------------------------------ массы
# западное крыло + первый уступ северного: одна масса; рёбра 0, 1, 2 (на улицы) — свои стены
MAIN = [A, B, C, N16, I16, Fi, G]
prism('wall', MAIN, GROUND, TOP, skip=(0, 1, 2, 3))
H2 = STEPS[1][2]; H3 = STEPS[2][2]
# уступы; их западные торцы встают над кровлей соседа ниже
prism('wall', [N16, N32, I32, I16], GROUND + H2, TOP + H2, skip=(0,))
prism('wall', [N32, D, E, I32], GROUND + H3, TOP + H3, skip=(0,))

# ------------------------------------------------------------------ фасад на Б. Морскую
FW, LW = frame_from(A, B, (-275, 1040))            # u: от юга (A) на север (B)
axesW = [2.4 + 4.0 * k for k in range(11)]
groundW = {axesW[0]: 'door', axesW[1]: 'shop', axesW[2]: 'shop', axesW[3]: 'shop', axesW[4]: 'door'}
street_floors(FW, 0, LW, 0.0, axesW, groundW)
upper_floor(FW, 0, LW, 0.0, axesW, balconies=(axesW[2], axesW[5], axesW[8]))
corner_rust(FW, LW - 0.9, LW, 0.0)
top_dressing(FW, 0, LW, 0.0)

# ------------------------------------------------------------------ срезанный угол: эркер и лоджия
FC, LC = frame_from(B, C, (-280, 1030))
h1 = []
door(FC, LC / 2, 1.7, 3.1, 0.0, h1)
floor_wall(FC, 0, LC, GROUND, F1, h1)
for a, b in piers(0, LC, h1):
    box('stone', FC, a, b, 0, 0.1, GROUND, 0.6, bottom=False)
    rust(FC, a, b, 0.6, F1 - 0.3)
band(FC, 0, LC, 0, F1 - 0.3, F1, 0.16)
# 2 этаж: эркерное окно в тёмной раме с решёткой
floor_wall(FC, 0, LC, F1, F2, [])
e0, e1, ed = 1.5, LC - 1.5, 0.7
box('trim', FC, e0 - 0.1, e1 + 0.1, 0, ed + 0.1, 5.0, 5.25)                         # плита
prism_uz('trim', FC, [(e0, 5.0), (e1, 5.0), ((e0 + e1) / 2 + 0.6, 4.55), ((e0 + e1) / 2 - 0.6, 4.55)], 0, ed)
box('metal', FC, e0, e1, 0, ed, 5.25, 5.45)
glass(FC, e0, e1, 5.45, 7.45, ed)
for s, u in ((-1, e0), (1, e1)):
    face('glass', [FC.p(u, 0, 5.45), FC.p(u, ed, 5.45), FC.p(u, ed, 7.45), FC.p(u, 0, 7.45)], FC.U() * s)
box('metal', FC, e0, e1, 0, ed + 0.04, 7.45, 7.6)
box('trim', FC, e0 - 0.15, e1 + 0.15, 0, ed + 0.2, 7.6, 7.8)
for k in range(1, 5):                                                                # рама и решётка
    u = e0 + (e1 - e0) * k / 5
    box('metal', FC, u - 0.04, u + 0.04, ed, ed + 0.05, 5.45, 7.45, bottom=False)
for z in (6.1, 6.8):
    box('metal', FC, e0, e1, ed, ed + 0.05, z - 0.03, z + 0.03, bottom=False)
band(FC, 0, LC, 0, F2 - 0.12, F2, 0.06)
# 3 этаж: глубокая угловая лоджия
l0, l1, ld = 1.15, LC - 1.15, 1.8
wall(FC, 0, LC, F2, TOP, 0.0, [(l0, l1, F2 + 0.15, EAVE - 0.35)], reveal=ld, rm='wall')
FCb = Frame(FC.o - FC.n * ld, FC.u, FC.n)
lh = []
door(FCb, LC / 2, 1.4, 2.6, F2 + 0.15, lh)
glass(FCb, l0 + 0.5, l0 + 1.3, F2 + 1.0, F2 + 2.6)
glass(FCb, l1 - 1.3, l1 - 0.5, F2 + 1.0, F2 + 2.6)
lh += [(l0 + 0.5, l0 + 1.3, F2 + 1.0, F2 + 2.6), (l1 - 1.3, l1 - 0.5, F2 + 1.0, F2 + 2.6)]
wall(FCb, l0, l1, F2 + 0.15, EAVE - 0.35, 0.0, lh, reveal=0.22, rm='wall')
for cu in (l0, l1):                                                                  # коринфские пилястры
    pilaster(FC, cu, 0, F2 + 0.15, EAVE - 0.35 - F2 - 0.15, w=0.5, pr=0.12)
for cu in (l0 + (l1 - l0) / 3, l0 + 2 * (l1 - l0) / 3):                              # колонки
    p = FC.p(cu, -0.25, F2 + 0.15)
    prof = [(0.22, 0), (0.22, 0.12), (0.16, 0.2), (0.15, 2.4), (0.13, 2.55), (0.2, 2.75), (0.24, 2.92)]
    lathe('trim_s', p, prof, 10)
    box('trim', FC, cu - 0.26, cu + 0.26, -0.51, 0.01, F2 + 0.15 + 2.92, EAVE - 0.35)
railing(FC, l0 + 0.3, l1 - 0.3, -0.1, F2 + 0.15, F2 + 1.1, 0.2)
corner_rust(FC, 0, l0 - 0.3, 0.0)
corner_rust(FC, l1 + 0.3, LC, 0.0)
top_dressing(FC, 0, LC, 0.0)

# ------------------------------------------------------------------ фасад к Таврической лестнице
FN, LN = frame_from(C, D, (-262, 1015))
for k, (u0, u1, base) in enumerate(STEPS):
    axes = [u for u in (2.5 + 4.0 * i for i in range(12)) if u0 + 1.2 < u < u1 - 1.2]
    street_floors(FN, u0, u1, base, axes, {})          # входы со стороны лестницы не видны — не ставим
    upper_floor(FN, u0, u1, base, axes)
    top_dressing(FN, u0, u1, base, dentils=(k == 0), rail=True)
corner_rust(FN, 0, 0.9, 0.0)

# ------------------------------------------------------------------ двор и торцы: ровные окна
def plain_windows(p, q, inside, base, step=3.4, top=TOP):
    F, L = frame_from(p, q, inside)
    n = int((L - 1.0) // step)
    if n < 1: return
    off = (L - (n - 1) * step) / 2
    for i in range(n):
        cu = off + i * step
        for z in (1.2, 5.3, 8.9):
            glass(F, cu - 0.65, cu + 0.65, base + z, base + z + 1.9, 0.03)
    band(F, 0, L, 0, base + top - 0.4, base + top, 0.15)

plain_windows(I16, Fi, (-262, 1015), 0.0)
plain_windows(Fi, G, (-284, 1042), 0.0)
plain_windows(G, A, (-284, 1042), 0.0)
plain_windows(I32, I16, (-262, 1008), H2)
plain_windows(E, I32, (-250, 1008), H3)
plain_windows(D, E, (-250, 1008), H3)

# ------------------------------------------------------------------ кровля: трубы
for p, base in ((lerp(A, Fi, 0.25), 0.0), (lerp(B, G, 0.62), 0.0), (lerp(C, Fi, 0.5), 0.0),
                (lerp(N16, I32, 0.5), H2), (lerp(N32, E, 0.55), H3)):
    q = W(*p)
    Fr = Frame(q, FW.u, FW.n)
    box('wall3', Fr, -0.45, 0.45, -0.35, 0.35, base + TOP, base + TOP + 1.6)
    box('trim', Fr, -0.55, 0.55, -0.45, 0.45, base + TOP + 1.6, base + TOP + 1.72)

finish('bmorskaya15', __file__)
