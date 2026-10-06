# Ул. Воронина, 10 (Черноморка) — четырёхэтажный дом сложного плана, модель
# с нуля.
#
#   blender -b --python models/voronina10/build.py -- [glb]
#
# Контур OSM way 92717226 — два корпуса и перемычка, повёрнуты на ~40° к осям
# мира. План собран в местной системе:
#   a — вдоль ул. Воронина на юго-запад, b — поперёк, к улице (на юго-восток).
# Корпуса (a, b в метрах; рёбра контура ложатся на сетку с точностью 0.2 м):
#   A  восточный корпус      a 0…16.9,   b 0…32.4
#   N  перемычка             a 16.9…24.2, b 8.8…18.4
#   B  западный корпус       a 24.2…62,   b 7.2…22.2
# Улица Воронина — со стороны +b (ось улицы b ≈ 38…43), там и главный фасад.
# Фото дома нет (refs/center-models.json: «4 этажа (OSM), сложная форма»),
# поэтому всё, кроме плана, этажности и цветов из описания, — сдержанно и
# наугад; что именно — NOTES.md. Ноль высоты — земля у середины уличного
# фасада корпуса B.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

# ------------------------------------------------------------------ местная система
SA = (-0.6359, 0.7718)                        # +a в мире (x, z)
SB = (0.7718, 0.6359)                         # +b в мире
O = (-304.8, 470.3)                           # угол корпуса A (a = 0, b = 0)

def LW(a, b):
    return (O[0] + a * SA[0] + b * SB[0], O[1] + a * SA[1] + b * SB[1])

X0, Z0 = [round(c, 2) for c in LW(43.0, 22.2)]
origin(X0, Z0)
VA = Vector((SA[0], -SA[1]))
VB = Vector((SB[0], -SB[1]))
DIRS = {'+a': VA, '-a': -VA, '+b': VB, '-b': -VB}
DAB = {'+a': (1, 0), '-a': (-1, 0), '+b': (0, 1), '-b': (0, -1)}

def P2(a, b):
    return W(*LW(a, b))

def P3(a, b, z):
    v = P2(a, b)
    return Vector((v.x, v.y, z))

# Рельеф под домом (data/terrain, плоскость по 48 точкам, отклонение ≤ 0.6 м):
# склон на северо-запад, от улицы вниз, ~0.2 м на метр поперёк дома.
def ground(a, b):
    return 23.709 + 0.02288 * a + 0.19846 * b - 28.67

# ------------------------------------------------------------------ материалы
COL['wall'] = ((0.878, 0.839, 0.741), 0.9)    # #e0d6bd — из описания
COL['roof'] = ((0.478, 0.478, 0.478), 0.85)   # #7a7a7a — плоская кровля
COL['trim'] = ((0.93, 0.91, 0.86), 0.85)
COL['stone'] = ((0.62, 0.60, 0.56), 0.9)

# Этажи: первый 4.0 м, остальные по 3.5; парапет 0.5 над кровлей.
FLOORS = (0.0, 4.0, 7.5, 11.0)
TOP = 14.5
PAR = 0.5
# Корпус A стоит выше по склону: улица у его торца на ~2 м выше, чем у
# корпуса B, — пол A поднят, иначе первый этаж ушёл бы в землю.
ZB = 0.4
ZA = 2.4

# ------------------------------------------------------------------ фасад
def facade(a0, b0, u, n, L, zb, bays=None, door=None, basement=False, blank_to=None):
    """Отрезок фасада: начало (a0, b0), вдоль u, наружу n, длина L, пол zb.
    blank_to — глухая стена от этой высоты (выше соседней кровли), без окон."""
    F = Frame(P2(a0, b0), DIRS[u], DIRS[n])
    du = DAB[u]
    g = lambda s: ground(a0 + du[0] * s, b0 + du[1] * s)
    gmin = min(g(0), g(L))
    z0 = min(gmin - 1.0, zb - 0.5)
    ztop = zb + TOP
    zpar = ztop + PAR
    if blank_to is not None:
        face('wall', [F.p(0, 0, blank_to), F.p(L, 0, blank_to), F.p(L, 0, zpar), F.p(0, 0, zpar)], F.N())
        cornice_top(F, 0, L, ztop, zpar)
        return
    n_b = bays if bays is not None else max(1, round(L / 3.4))
    step = L / n_b
    holes = []
    low = False                     # есть ли окна полуподвала
    for i in range(n_b):
        cu = (i + 0.5) * step
        gi = g(cu)
        if door is not None and i == door:
            h = (cu - 1.0, cu + 1.0, zb, zb + 3.0)
            holes.append(h)
            pane(F, *h, mull=True)
            box('trim', F, cu - 1.7, cu + 1.7, 0, 1.4, zb + 3.25, zb + 3.45)      # козырёк
            if gi < zb:
                box('stone', F, cu - 1.6, cu + 1.6, 0, 1.3, gi - 0.3, zb)        # крыльцо
        else:
            za = zb + 1.0
            if gi + 0.4 < za:
                holes.append(win(F, cu, za, 1.7, 2.2))
        for fz in FLOORS[1:]:
            holes.append(win(F, cu, zb + fz + 0.9, 1.5, 1.8))
        if basement and gi < zb - 2.4:
            holes.append(win(F, cu, zb - 1.9, 1.3, 1.1, mull=False))
            low = True
    wall_rows(F, 0, L, z0, zpar, holes)
    # цоколь; где есть полуподвал — ниже его окон, над ними тяга
    box('stone', F, 0, L, 0, 0.08, z0, zb - 2.1 if low else zb + 0.6, bottom=False)
    if low:
        box('trim', F, 0, L, 0, 0.08, zb - 0.1, zb + 0.1, bottom=False)
    box('trim', F, 0, L, 0, 0.10, zb + FLOORS[1] - 0.2, zb + FLOORS[1], bottom=False)
    cornice_top(F, 0, L, ztop, zpar)

def wall_rows(F, u0, u1, z0, z1, holes, reveal=0.2):
    """Стена с проёмами полосами по высоте: полоса делится только там, где в
    ней есть проёмы (kit.wall режет всю стену сеткой — втрое больше треугольников)."""
    zs = sorted({z0, z1, *[h[2] for h in holes], *[h[3] for h in holes]})
    for k in range(len(zs) - 1):
        za, zb = zs[k], zs[k + 1]
        cz = (za + zb) / 2
        act = sorted((h[0], h[1]) for h in holes if h[2] < cz < h[3])
        u = u0
        for ha, hb in act + [(u1, u1)]:
            if ha > u + 1e-6:
                face('wall', [F.p(u, 0, za), F.p(ha, 0, za), F.p(ha, 0, zb), F.p(u, 0, zb)], F.N())
            u = max(u, hb)
    for ua, ub, za, zb in holes:      # откосы
        r = -reveal
        face('trim', [F.p(ua, 0, za), F.p(ua, r, za), F.p(ua, r, zb), F.p(ua, 0, zb)], F.U())
        face('trim', [F.p(ub, 0, za), F.p(ub, r, za), F.p(ub, r, zb), F.p(ub, 0, zb)], -F.U())
        face('trim', [F.p(ua, 0, zb), F.p(ub, 0, zb), F.p(ub, r, zb), F.p(ua, r, zb)], -UP)
        face('trim', [F.p(ua, 0, za), F.p(ub, 0, za), F.p(ub, r, za), F.p(ua, r, za)], UP)

def cornice_top(F, u0, u1, ztop, zpar):
    box('trim', F, u0, u1, 0, 0.32, ztop - 0.25, ztop + 0.05)                   # карниз
    face('wall', [F.p(u0, -0.3, ztop), F.p(u1, -0.3, ztop), F.p(u1, -0.3, zpar), F.p(u0, -0.3, zpar)], -F.N())
    face('trim', [F.p(u0, -0.3, zpar), F.p(u1, -0.3, zpar), F.p(u1, 0.05, zpar), F.p(u0, 0.05, zpar)], UP)

def pane(F, ua, ub, za, zb, mull=True):
    """Стекло в глубине проёма и одна стойка переплёта — дёшево по треугольникам."""
    g = -0.2
    face('glass', [F.p(ua, g, za), F.p(ub, g, za), F.p(ub, g, zb), F.p(ua, g, zb)], F.N())
    if mull:
        c = (ua + ub) / 2
        face('trim', [F.p(c - 0.04, g + 0.03, za), F.p(c + 0.04, g + 0.03, za),
                      F.p(c + 0.04, g + 0.03, zb), F.p(c - 0.04, g + 0.03, zb)], F.N())

def win(F, cu, za, w, h, mull=True):
    ua, ub = cu - w / 2, cu + w / 2
    pane(F, ua, ub, za, za + h, mull)
    box('trim', F, ua - 0.08, ub + 0.08, 0, 0.12, za - 0.08, za, bottom=False)  # подоконник
    return (ua, ub, za, za + h)

# ------------------------------------------------------------------ корпус A
facade(0, 0, '+a', '-b', 16.9, ZA, basement=True)                    # двор, вниз по склону
facade(0, 32.4, '-b', '-a', 32.4, ZA, basement=True)                 # торец на восток
facade(16.9, 32.4, '-a', '+b', 16.9, ZA)                             # к ул. Воронина
facade(16.9, 18.4, '+b', '+a', 14.0, ZA)                             # к двору над B
facade(16.9, 0, '+b', '+a', 8.8, ZA, basement=True)
facade(16.9, 8.8, '+b', '+a', 9.6, ZA, blank_to=ZB + TOP)            # над перемычкой

# ------------------------------------------------------------------ перемычка
facade(16.9, 8.8, '+a', '-b', 7.3, ZB, bays=2, basement=True)
facade(24.2, 18.4, '-a', '+b', 7.3, ZB, bays=2)

# ------------------------------------------------------------------ корпус B
facade(24.2, 22.2, '+a', '+b', 37.8, ZB, door=5)                     # главный, ул. Воронина
facade(62, 22.2, '-b', '+a', 15.0, ZB)                               # торец на запад
facade(62, 7.2, '-a', '-b', 37.8, ZB, basement=True)                 # двор
facade(24.2, 18.4, '+b', '-a', 3.8, ZB, bays=1)

# узкая глухая полоса 1.6 м между корпусом B и перемычкой
F = Frame(P2(24.2, 7.2), DIRS['+b'], DIRS['-a'])
wall_rows(F, 0, 1.6, ground(24.2, 7.2) - 1.0, ZB + TOP + PAR, [])
box('stone', F, 0, 1.6, 0, 0.08, ground(24.2, 7.2) - 1.0, ZB + 0.6, bottom=False)
cornice_top(F, 0, 1.6, ZB + TOP, ZB + TOP + PAR)

# ------------------------------------------------------------------ кровли
def roof(pts, z):
    face('roof', [P3(a, b, z) for a, b in pts], UP)

roof([(0, 0), (16.9, 0), (16.9, 32.4), (0, 32.4)], ZA + TOP)
roof([(16.9, 8.8), (24.2, 8.8), (24.2, 18.4), (16.9, 18.4)], ZB + TOP)
roof([(24.2, 7.2), (62, 7.2), (62, 22.2), (24.2, 22.2)], ZB + TOP)

finish('voronina10', __file__, tri_budget=10000)
