# Большая Морская, 19 — трёхэтажная сталинка с рустованным низом и угловыми
# балконами у проезда к Главпочтамту. Модель с нуля по описанию
# refs/center-models.json (id w90821883); фото в облаке не открыть, что
# сделано наугад — NOTES.md.
#
#   blender -b --python models/bm19/build.py -- [glb]
#
# Контур OSM way 90821883 — почти точный прямоугольник 53.5 × 12.1 м:
#   A (-267.6, 1095.2) — северо-западный угол, B (-255.9, 1092.0) — северо-восточный,
#   C (-241.8, 1143.6) — юго-восточный, D (-253.5, 1146.8) — юго-западный.
# Главный фасад A→D смотрит на Большую Морскую (запад), южный торец D→C — на
# проезд к Главпочтамту. Ноль высоты — тротуар в середине уличного фасада.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

A, B, C, D = (-267.6, 1095.2), (-255.9, 1092.0), (-241.8, 1143.6), (-253.5, 1146.8)
X0, Z0 = round((A[0] + D[0]) / 2, 2), round((A[1] + D[1]) / 2, 2)
origin(X0, Z0)

COL['wall'] = ((0.91, 0.88, 0.77), 0.9)      # #e8e1c4 — жёлто-кремовый камень
COL['wall2'] = ((0.80, 0.76, 0.64), 0.92)    # швы руста первого этажа
COL['trim'] = ((0.93, 0.90, 0.80), 0.85)     # руст, наличники, карниз — светло-бежевые
COL['roof'] = ((0.36, 0.31, 0.29), 0.85)     # #5b4f49
COL['stone'] = ((0.36, 0.36, 0.35), 0.9)     # тёмно-серый цоколь

CEN = ((A[0] + C[0]) / 2, (A[1] + C[1]) / 2)
FW, LW_ = frame_from(A, D, CEN)    # улица: u с севера на юг
FS, LS = frame_from(D, C, CEN)     # южный торец: u с запада на восток
FE, LE = frame_from(C, B, CEN)     # двор: u с юга на север
FN, LN = frame_from(B, A, CEN)     # северный торец: u с востока на запад

GROUND = -3.0
PL = 0.6                 # цоколь
F1 = 4.0                 # верх рустованного этажа
BAND = 4.3               # верх междуэтажного пояса
Z2 = 4.35                # пол 2 этажа
Z3 = 7.75                # пол 3 этажа
CZ = 10.6                # низ венчающего карниза
RZ = 11.4                # кровля
PAR = 11.85              # верх парапета
TOP = 12.5               # верх ограждения кровли

# ------------------------------------------------------------------ свои примитивы
def rust(F, u0, u1, z0, z1, holes, row=0.56, gap=0.07, pr=0.05):
    """Ленточный руст: горизонтальные полосы камня, обходящие проёмы."""
    z = z0
    while z < z1 - 0.1:
        za, zb = z, min(z + row - gap, z1)
        segs = [(u0, u1)]
        for ha, hb, hz0, hz1 in holes:
            if hz0 < zb and hz1 > za:
                nxt = []
                for a, b in segs:
                    if hb <= a or ha >= b:
                        nxt.append((a, b)); continue
                    if ha - 0.12 > a: nxt.append((a, ha - 0.12))
                    if hb + 0.12 < b: nxt.append((hb + 0.12, b))
                segs = nxt
        for a, b in segs:
            if b - a > 0.15:
                box('trim', F, a, b, 0, pr, za, zb, bottom=False)
        z += row

def plinth(F, u0, u1, cuts):
    """Тёмный цоколь до PL с разрывами под двери."""
    segs = [(u0 - 0.08, u1 + 0.08)]
    for a, b in cuts:
        nxt = []
        for s0, s1 in segs:
            if b <= s0 or a >= s1: nxt.append((s0, s1)); continue
            if a > s0: nxt.append((s0, a))
            if b < s1: nxt.append((b, s1))
        segs = nxt
    for a, b in segs:
        box('stone', F, a, b, -0.02, 0.10, GROUND, PL, bottom=False)
        box('trim', F, a, b, -0.02, 0.13, PL, PL + 0.08, bottom=False)

def arch_opening(F, cu, za, w, zs, d=0.0, frame=True):
    """Арочный проём: прямоугольная дыра до замка, пазухи заложены стеной."""
    r = w / 2
    n = 8
    arc = [(cu - r * math.cos(math.pi * k / n), zs + r * math.sin(math.pi * k / n)) for k in range(n + 1)]
    zt = zs + r
    # пазухи — два многоугольника: угол проёма и четверть дуги
    left = [(cu - r, zt)] + [p for p in arc if p[0] <= cu + 1e-6]
    right = [p for p in arc if p[0] >= cu - 1e-6] + [(cu + r, zt)]
    face('wall' if za > F1 else 'wall2', [F.p(u, d, z) for u, z in left], F.N())
    face('wall' if za > F1 else 'wall2', [F.p(u, d, z) for u, z in right], F.N())
    if frame:               # архивольт
        for k in range(n):
            (u1, z1), (u2, z2) = arc[k], arc[k + 1]
            m1, m2 = Vector((u1 - cu, z1 - zs)).normalized(), Vector((u2 - cu, z2 - zs)).normalized()
            q = [F.p(u1 + m1.x * 0.18, d, z1 + m1.y * 0.18), F.p(u2 + m2.x * 0.18, d, z2 + m2.y * 0.18)]
            beam('trim', (F.p(u1, d, z1) + q[0]) / 2 + F.N() * 0.04, (F.p(u2, d, z2) + q[1]) / 2 + F.N() * 0.04, 0.2, 0.08)
        box('trim', F, cu - 0.22, cu + 0.22, d, d + 0.12, zt - 0.05, zt + 0.32)       # замковый камень
    # стекло с переплётом
    g = d - 0.2
    face('glass', [F.p(cu - r, g, za), F.p(cu + r, g, za), F.p(cu + r, g, zs)] +
         [F.p(u, g, z) for u, z in arc[::-1]][1:-1] + [F.p(cu - r, g, zs)], F.N())
    box('trim', F, cu - 0.03, cu + 0.03, g, g + 0.06, za, zt)
    box('trim', F, cu - r, cu + r, g, g + 0.06, zs - 0.03, zs + 0.03)
    return (cu - r, cu + r, za, zt)

def glaze(F, ua, ub, za, zb, d=0.0, rows=(0.7,)):
    """Стекло в глубине проёма с импостом и фрамугой — без обвязки по контуру."""
    g = d - 0.22
    face('glass', [F.p(ua, g, za), F.p(ub, g, za), F.p(ub, g, zb), F.p(ua, g, zb)], F.N())
    cu = (ua + ub) / 2
    box('trim', F, cu - 0.035, cu + 0.035, g, g + 0.06, za, zb, bottom=False)
    for r in rows:
        z = za + (zb - za) * r
        box('trim', F, ua, ub, g, g + 0.06, z - 0.035, z + 0.035, bottom=False)

def win(F, cu, za, w, h, d=0.0, rows=(0.7,)):
    """Окно с простым наличником и подоконником."""
    ua, ub, zb = cu - w / 2, cu + w / 2, za + h
    box('trim', F, ua - 0.16, ua, d, d + 0.05, za, zb + 0.16, bottom=False)
    box('trim', F, ub, ub + 0.16, d, d + 0.05, za, zb + 0.16, bottom=False)
    box('trim', F, ua, ub, d, d + 0.05, zb, zb + 0.16, bottom=False)
    box('trim', F, ua - 0.2, ub + 0.2, d, d + 0.13, za - 0.1, za, bottom=False)
    glaze(F, ua, ub, za, zb, d, rows)
    return (ua, ub, za, zb)

def cheap_window(F, cu, za, w, h, d=0.0):
    """Окно без наличника (дворовый фасад, его не видно с улицы): стекло и импост."""
    g = d - 0.2
    face('glass', [F.p(cu - w / 2, g, za), F.p(cu + w / 2, g, za), F.p(cu + w / 2, g, za + h), F.p(cu - w / 2, g, za + h)], F.N())
    box('trim', F, cu - 0.03, cu + 0.03, g, g + 0.06, za, za + h, bottom=False)
    return (cu - w / 2, cu + w / 2, za, za + h)

def sandrik(F, ua, ub, zb):
    """Прямой сандрик — полка на двух кронштейнах над окном 2 этажа."""
    box('trim', F, ua - 0.32, ub + 0.32, 0, 0.26, zb + 0.18, zb + 0.34)
    box('trim', F, ua - 0.22, ub + 0.22, 0, 0.14, zb + 0.16, zb + 0.2, bottom=False)

def door(F, cu, w, h, za=0.0, d=0.0, arched=False):
    g = d - 0.24
    face('wood', [F.p(cu - w / 2, g, za), F.p(cu + w / 2, g, za), F.p(cu + w / 2, g, za + h), F.p(cu - w / 2, g, za + h)], F.N())
    box('trim', F, cu - 0.03, cu + 0.03, g, g + 0.05, za, za + h, bottom=False)
    box('stone', F, cu - w / 2 - 0.25, cu + w / 2 + 0.25, -0.05, 0.45, GROUND, za + 0.02, bottom=False)   # ступень
    return (cu - w / 2, cu + w / 2, za, za + h)

def railing(p0, p1, z, h=1.0, step=0.42):
    """Кованая решётка: поручень, нижняя тяга, прутья и кольца-завитки поясом."""
    p0, p1 = Vector((p0.x, p0.y, z)), Vector((p1.x, p1.y, z))
    beam('metal', p0 + UP * h, p1 + UP * h, 0.06, 0.05)
    beam('metal', p0 + UP * 0.08, p1 + UP * 0.08, 0.04)
    L = (p1 - p0).length
    n = max(2, int(L / step))
    for k in range(n + 1):
        q = p0 + (p1 - p0) * (k / n)
        beam('metal', q + UP * 0.08, q + UP * h, 0.025)

def balcony(F, u0, u1, z, dep=1.0, open0=True, open1=True, ext1=0.0):
    """Консольный балкон: плита, профилированный край, консоли, решётка.
    ext1 — вынос плиты за конец u1 (за угол дома); open — решётка на торце."""
    box('trim', F, u0, u1 + ext1, 0, dep, z - 0.18, z)
    box('trim', F, u0 - 0.05, u1 + ext1 + 0.05, dep - 0.08, dep + 0.06, z - 0.26, z - 0.12, bottom=False)
    k = max(2, int((u1 - u0) / 1.4) + 1)
    for i in range(k):
        u = u0 + 0.25 + (u1 - u0 - 0.5) * i / (k - 1)
        # консоль-волюта: клин, сужающийся вниз к стене
        bm_pts = [(0, z - 0.18), (dep - 0.1, z - 0.18), (dep - 0.25, z - 0.36), (0.15, z - 0.75), (0, z - 0.75)]
        G = Frame(F.o + F.u * u, F.n, -F.u)      # плоскость консоли поперёк стены
        prism_uz('trim', G, bm_pts, -0.09, 0.09)
    zr = z
    if open0: railing(F.p(u0 + 0.04, 0, zr), F.p(u0 + 0.04, dep - 0.04, zr), zr)
    railing(F.p(u0 + 0.04, dep - 0.04, zr), F.p(u1 + ext1 - 0.04, dep - 0.04, zr), zr)
    if open1: railing(F.p(u1 + ext1 - 0.04, 0, zr), F.p(u1 + ext1 - 0.04, dep - 0.04, zr), zr)

def dentil_cornice(F, u0, u1, z, ext=0.8, dent=True):
    """Карниз с дентикулами: фриз, ряд зубчиков, гусёк и выносная плита."""
    band(F, u0 - 0.08, u1 + 0.08, 0, z, z + 0.22, 0.08)
    if dent:
        u = u0 + 0.15
        while u < u1 - 0.2:
            box('trim', F, u, u + 0.18, 0, 0.26, z + 0.22, z + 0.4, bottom=False)
            u += 0.7
    pr = 0.36 if dent else 0.26
    band(F, u0 - pr, u1 + pr, 0, z + 0.4, z + 0.52, pr)
    prism_uz('trim', F, [(u0 - 0.5, z + 0.52), (u1 + 0.5, z + 0.52), (u1 + 0.5, z + 0.6), (u0 - 0.5, z + 0.6)], -0.02, 0.5)
    band(F, u0 - ext, u1 + ext, 0, z + 0.6, RZ, ext)

# ------------------------------------------------------------------ фасады
STEP = 3.6
AX_W = [LW_ / 2 + (i - 6.5) * STEP for i in range(14)]     # 14 осей по улице
AX_S = [2.3, LS / 2, LS - 2.3]                               # три оси торцов

def facade_street():
    F = FW
    g_holes, u_holes, doors = [], [], []
    for i, u in enumerate(AX_W):
        if i == 13:                         # арочная витрина-вход кофейни у угла
            g_holes.append(arch_opening(F, u, 0.1, 2.4, 2.5))
            doors.append((u - 1.45, u + 1.45))
            box('stone', F, u - 1.45, u + 1.45, -0.05, 0.4, GROUND, 0.1, bottom=False)
        elif i in (3, 9):                   # подъезды
            g_holes.append(door(F, u, 1.5, 2.9, 0.15))
            doors.append((u - 1.0, u + 1.0))
            box('trim', F, u - 1.05, u + 1.05, 0, 0.3, 3.15, 3.35)       # козырёк-полка
        else:                               # витрины магазинов
            g_holes.append(win(F, u, 0.95, 2.1, 2.35, rows=(0.75,)))
    wall(F, 0, LW_, GROUND, F1, 0, g_holes, m='wall2')
    rust(F, 0, LW_, PL + 0.08, F1, g_holes)
    plinth(F, 0, LW_, doors)
    band(F, -0.15, LW_ + 0.15, 0, F1, BAND, 0.16)
    for i, u in enumerate(AX_W):
        bal2 = i >= 12                      # балконы 2 этажа — на двух осях у угла
        bal3 = i == 13
        if bal2:
            h = (u - 0.65, u + 0.65, Z2 + 0.05, Z2 + 2.6)
            win(F, (h[0] + h[1]) / 2, h[2], h[1] - h[0], h[3] - h[2], rows=(0.72,))
            sandrik(F, h[0], h[1], h[3])
        else:
            h = win(F, u, Z2 + 0.75, 1.5, 2.0)
            sandrik(F, h[0], h[1], h[3])
        u_holes.append(h)
        if bal3:
            h = (u - 0.65, u + 0.65, Z3 + 0.05, Z3 + 2.4)
            win(F, (h[0] + h[1]) / 2, h[2], h[1] - h[0], h[3] - h[2], rows=(0.72,))
        else:
            h = win(F, u, Z3 + 0.7, 1.5, 1.8)
        u_holes.append(h)
    wall(F, 0, LW_, F1, RZ, 0, u_holes)
    band(F, 0, LW_, 0, Z3 - 0.05, Z3 + 0.12, 0.08)                     # тяга под окнами 3 этажа
    dentil_cornice(F, 0, LW_, CZ)
    # угловые балконы: 2 этаж — на две оси, 3 этаж — на одну («ступенью»)
    balcony(F, AX_W[12] - 1.1, LW_, Z2, open1=False, ext1=1.0)
    balcony(F, AX_W[13] - 1.1, LW_, Z3, open1=False, ext1=1.0)

def facade_south():
    F = FS
    g_holes, u_holes = [], []
    for i, u in enumerate(AX_S):
        g_holes.append(win(F, u, 0.95, 1.9, 2.35, rows=(0.75,)))
    wall(F, 0, LS, GROUND, F1, 0, g_holes, m='wall2')
    rust(F, 0, LS, PL + 0.08, F1, g_holes)
    plinth(F, 0, LS, [])
    band(F, -0.15, LS + 0.15, 0, F1, BAND, 0.16)
    for i, u in enumerate(AX_S):
        if i == 0:                          # двери на угловые балконы
            for z, hh in ((Z2, 2.55), (Z3, 2.35)):
                h = (u - 0.65, u + 0.65, z + 0.05, z + hh)
                win(F, (h[0] + h[1]) / 2, h[2], h[1] - h[0], h[3] - h[2], rows=(0.72,))
                u_holes.append(h)
            sandrik(F, u - 0.65, u + 0.65, Z2 + 2.55)
            continue
        h = win(F, u, Z2 + 0.75, 1.5, 2.0); sandrik(F, h[0], h[1], h[3]); u_holes.append(h)
        if i == 1:                          # арочное окно 3 этажа
            u_holes.append(arch_opening(F, u, Z3 + 0.55, 1.5, Z3 + 1.85))
        else:
            u_holes.append(win(F, u, Z3 + 0.7, 1.5, 1.8))
    wall(F, 0, LS, F1, RZ, 0, u_holes)
    band(F, 0, LS, 0, Z3 - 0.05, Z3 + 0.12, 0.08)
    dentil_cornice(F, 0, LS, CZ)
    # продолжение угловых балконов за угол (плита улицы уже накрывает угол)
    for z in (Z2, Z3):
        balcony(F, 0, AX_S[0] + 1.1, z, open0=False)
        railing(F.p(-0.96, 0.96, z), F.p(0.04, 0.96, z), z)

def facade_plain(F, L, axes, ground_windows=True):
    """Дворовый фасад и северный торец: гладкая стена, простые окна."""
    g_holes, u_holes = [], []
    for u in axes:
        if ground_windows:
            g_holes.append(cheap_window(F, u, 1.0, 1.4, 2.0))
        u_holes.append(cheap_window(F, u, Z2 + 0.75, 1.4, 1.9))
        u_holes.append(cheap_window(F, u, Z3 + 0.7, 1.4, 1.8))
    wall(F, 0, L, GROUND, F1, 0, g_holes, m='wall2', reveal=0.2)
    wall(F, 0, L, F1, RZ, 0, u_holes, reveal=0.2)
    box('stone', F, -0.05, L + 0.05, -0.02, 0.08, GROUND, PL, bottom=False)
    band(F, -0.1, L + 0.1, 0, F1, BAND, 0.1)
    dentil_cornice(F, 0, L, CZ, ext=0.5, dent=False)

def roof():
    pts = [W(*A), W(*B), W(*C), W(*D)]
    face('roof', [Vector((p.x, p.y, RZ)) for p in pts], UP)
    # парапет с металлическим ограждением, отступив от карниза
    for F, L in ((FW, LW_), (FS, LS), (FE, LE), (FN, LN)):
        box('wall', F, 0.25, L - 0.25, -0.55, -0.25, RZ, PAR, bottom=False)
        box('trim', F, 0.2, L - 0.2, -0.6, -0.2, PAR, PAR + 0.06, bottom=False)
        p0, p1 = F.p(0.4, -0.4, 0), F.p(L - 0.4, -0.4, 0)
        beam('metal', Vector((p0.x, p0.y, TOP)), Vector((p1.x, p1.y, TOP)), 0.05)
        n = max(2, int(L / 4.5))
        for k in range(n + 1):
            q = p0 + (p1 - p0) * (k / n)
            beam('metal', Vector((q.x, q.y, PAR + 0.06)), Vector((q.x, q.y, TOP)), 0.04)
    # трубы — на коньке нет, ставим по оси плана
    for u in (9.0, 22.0, 35.0, 46.0):
        chimney(FW, u, -6.0, RZ, RZ + 1.3, w=0.8)

facade_street()
facade_south()
facade_plain(FE, LE, [LE / 2 + (i - 6.5) * STEP for i in range(14)])
facade_plain(FN, LN, AX_S)
roof()
finish('bm19', __file__, tri_budget=12000)
