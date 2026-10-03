# Гостиница «Севастополь», проспект Нахимова, 8 — модель с нуля (сталинский неоклассицизм, 1953).
#
#   blender -b --python models/hotel_sevastopol/build.py -- [glb]
#
# План — контур OSM way 92718650 (+ way 701165048, перемычка во двор), спутник
# (tools/sat.html) и фото с Викисклада (refs/). Рамка плана FA: u — вдоль главного
# фасада на проспект (от северо-восточного угла к югу), n — наружу (на ЮВ). В этой
# рамке контур OSM прямоугольный до десятых долей метра, поэтому план строим по ней.
# Ноль высоты — тротуар у ступеней портика, на его оси.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

# ------------------------------------------------------------------ цвета (до геометрии)
COL['wall'] = ((0.88, 0.83, 0.68), 0.92)     # светлая охристо-кремовая штукатурка
COL['wall2'] = ((0.80, 0.74, 0.58), 0.92)
COL['trim'] = ((0.94, 0.93, 0.89), 0.85)     # белёные колонны, балюстрады, наличники
COL['stone'] = ((0.62, 0.60, 0.57), 0.9)     # цоколь, рустованные тумбы, плоские кровли
COL['roof'] = ((0.60, 0.33, 0.25), 0.8)      # '#9a5340' по данным OSM

# ------------------------------------------------------------------ рамка плана
A10 = (-326.3, 372.5)       # северо-восточный угол главного фасада (точка 10 контура)
A17 = (-365.5, 423.7)       # южный угол (точка 17)
_L = math.hypot(A17[0] - A10[0], A17[1] - A10[1])
UW = ((A17[0] - A10[0]) / _L, (A17[1] - A10[1]) / _L)       # u в мире (x, z)
NW_ = (UW[1], -UW[0])                                        # n в мире (наружу, на ЮВ)
PORT_U, PORT_N = 28.4, 5.1                                   # ось портика, его передняя линия
X0 = A10[0] + UW[0] * PORT_U + NW_[0] * PORT_N
Z0 = A10[1] + UW[1] * PORT_U + NW_[1] * PORT_N
origin(round(X0, 2), round(Z0, 2))
print('ORIGIN', round(X0, 2), round(Z0, 2))

UV = Vector((UW[0], -UW[1]))      # плоскость Blender: Y = −z мира
NV = Vector((NW_[0], -NW_[1]))
O10 = W(*A10)

def PP(u, n):
    return O10 + UV * u + NV * n

FA = Frame(PP(0, 0), UV, NV)      # главный фасад: d = n

GROUND = -3.0
Z1, Z2 = 4.5, 9.0                 # уровни полов 2-го и 3-го этажей
ZC = 12.6                         # низ венчающего карниза крыльев
EAVE = ZC + 0.6
ZN, HN = 9.8, 10.4                # то же для низких частей (2 этажа)

# ------------------------------------------------------------------ контур (u, n), по часовой в (u, n)
PT = {0: (15.5, -73.5), 1: (13.0, -72.9), 2: (10.5, -71.9), 3: (8.3, -70.6), 4: (6.3, -68.4),
      5: (5.1, -66.2), 6: (4.4, -63.9), 7: (3.9, -61.1), 8: (3.8, -54.4), 9: (0.0, -54.4),
      10: (0.0, 0.0), 11: (19.0, 0.0), 12: (19.0, 5.1), 13: (37.8, 5.1), 14: (37.8, 0.0),
      17: (64.5, 0.0), 18: (64.5, -54.1), 19: (48.7, -54.1), 20: (48.7, -17.9), 21: (37.7, -17.9),
      22: (37.7, -21.0), 23: (24.8, -21.0), 24: (24.8, -17.9), 25: (13.2, -17.9), 26: (13.2, -54.4),
      27: (14.3, -58.0), 28: (16.4, -61.1), 29: (19.0, -63.0), 30: (19.6, -61.3), 31: (44.5, -69.7),
      32: (49.1, -57.7), 33: (64.5, -59.3), 34: (62.2, -82.4), 35: (57.1, -88.7), 36: (48.7, -87.8),
      37: (14.7, -75.9)}
RING = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26,
        27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37]

def inside_ring(p):
    x, y = p
    c = False
    pts = [PT[i] for i in RING]
    for i in range(len(pts)):
        (x1, y1), (x2, y2) = pts[i], pts[(i + 1) % len(pts)]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c

def eframe(a, b):
    """Рамка ребра контура a→b (точки (u, n)); n — наружу, проверка точкой."""
    ax, ay = a; bx, by = b
    L = math.hypot(bx - ax, by - ay)
    tx, ty = (bx - ax) / L, (by - ay) / L
    ox, oy = -ty, tx
    mid = ((ax + bx) / 2, (ay + by) / 2)
    if inside_ring((mid[0] + ox * 0.3, mid[1] + oy * 0.3)) and not inside_ring((mid[0] - ox * 0.3, mid[1] - oy * 0.3)):
        ox, oy = -ox, -oy
    return Frame(PP(ax, ay), UV * tx + NV * ty, UV * ox + NV * oy), L

# ------------------------------------------------------------------ свои примитивы
def pw(F, u0, u1, z0, z1, d, holes, m='wall', rm='trim', reveal=0.22):
    """Стена: простенки и перемычки между колонками проёмов (проёмы одной колонки — одинаковые u)."""
    cols = {}
    for h in holes:
        cols.setdefault((round(h[0], 3), round(h[1], 3)), []).append(h)
    def quad(ua, ub, za, zb):
        face(m, [F.p(ua, d, za), F.p(ub, d, za), F.p(ub, d, zb), F.p(ua, d, zb)], F.N())
    cur = u0
    for (ua, ub) in sorted(cols):
        if ua > cur + 1e-6: quad(cur, ua, z0, z1)
        z = z0
        for h in sorted(cols[(ua, ub)], key=lambda h: h[2]):
            if h[2] > z + 1e-6: quad(ua, ub, z, h[2])
            z = h[3]
        if z1 > z + 1e-6: quad(ua, ub, z, z1)
        cur = ub
    if u1 > cur + 1e-6: quad(cur, u1, z0, z1)
    r = d - reveal
    for ua, ub, za, zb in holes:
        face(rm, [F.p(ua, d, za), F.p(ua, r, za), F.p(ua, r, zb), F.p(ua, d, zb)], F.U())
        face(rm, [F.p(ub, d, za), F.p(ub, r, za), F.p(ub, r, zb), F.p(ub, d, zb)], -F.U())
        face(rm, [F.p(ua, d, zb), F.p(ub, d, zb), F.p(ub, r, zb), F.p(ua, r, zb)], -UP)

def sill(F, ua, ub, za, d, pr=0.1):
    box('trim', F, ua - 0.1, ub + 0.1, d, d + pr, za - 0.1, za)

def win(F, cu, za, w, h, d, tier=2, rev=0.22):
    """Окно: стекло в глубине проёма, крестовина; tier 1 — ещё наличник с сандриком и подоконник."""
    ua, ub, zb = cu - w / 2, cu + w / 2, za + h
    g = d - rev + 0.02
    face('glass', [F.p(ua, g, za), F.p(ub, g, za), F.p(ub, g, zb), F.p(ua, g, zb)], F.N())
    t, gf = 0.07, g + 0.02
    def strip(a, b, z0, z1, dd=gf):
        face('trim', [F.p(a, dd, z0), F.p(b, dd, z0), F.p(b, dd, z1), F.p(a, dd, z1)], F.N())
    strip(cu - t / 2, cu + t / 2, za, zb)
    strip(ua, ub, za + h * 0.7 - t / 2, za + h * 0.7 + t / 2)
    if tier == 1:
        w_ = 0.15
        strip(ua - w_, ua, za, zb + w_, d + 0.03); strip(ub, ub + w_, za, zb + w_, d + 0.03)
        strip(ua, ub, zb, zb + w_, d + 0.03)
        box('trim', F, ua - w_ - 0.05, ub + w_ + 0.05, d, d + 0.14, zb + w_, zb + w_ + 0.14, bottom=False)
        box('trim', F, ua - 0.12, ub + 0.12, d, d + 0.12, za - 0.1, za, bottom=False)
    else:
        face('trim', [F.p(ua - 0.08, d, za), F.p(ub + 0.08, d, za), F.p(ub + 0.08, d + 0.09, za), F.p(ua - 0.08, d + 0.09, za)], UP)
        face('trim', [F.p(ua - 0.08, d + 0.09, za - 0.08), F.p(ub + 0.08, d + 0.09, za - 0.08), F.p(ub + 0.08, d + 0.09, za), F.p(ua - 0.08, d + 0.09, za)], F.N())
    return (ua, ub, za, zb)

def arch_geom(cu, r, zs, seg):
    return [(cu + r * math.cos(math.pi * k / seg), zs + r * math.sin(math.pi * k / seg)) for k in range(seg + 1)]

def arch_win(F, cu, za, r, zs, d, rev=0.24, seg=6, frame=True):
    """Арочное окно: проём (cu−r, cu+r, za, zs+r) прорезает стена, здесь — заполнение углов, архивольт, стекло."""
    arc = arch_geom(cu, r, zs, seg)
    hs = seg // 2
    face('wall', [F.p(cu + r, d, zs + r)] + [F.p(u, d, z) for u, z in arc[:hs + 1]], F.N())
    face('wall', [F.p(cu - r, d, zs + r)] + [F.p(u, d, z) for u, z in arc[hs:]], F.N())
    gd = d - rev + 0.02
    for k in range(seg):
        (ua, za_), (ub, zb_) = arc[k], arc[k + 1]
        face('trim', [F.p(ua, d, za_), F.p(ub, d, zb_), F.p(ub, d - rev, zb_), F.p(ua, d - rev, za_)],
             F.p(cu, d, zs) - F.p((ua + ub) / 2, d, (za_ + zb_) / 2))
        if frame:
            ro = r + 0.2
            oa = (cu + ro * math.cos(math.pi * k / seg), zs + ro * math.sin(math.pi * k / seg))
            ob = (cu + ro * math.cos(math.pi * (k + 1) / seg), zs + ro * math.sin(math.pi * (k + 1) / seg))
            face('trim', [F.p(ua, d + 0.05, za_), F.p(ub, d + 0.05, zb_), F.p(ob[0], d + 0.05, ob[1]), F.p(oa[0], d + 0.05, oa[1])], F.N())
    face('glass', [F.p(cu - r, gd, za), F.p(cu + r, gd, za)] + [F.p(u, gd, z) for u, z in arc], F.N())
    if frame:
        box('trim', F, cu - r - 0.2, cu - r, d, d + 0.05, za, zs)
        box('trim', F, cu + r, cu + r + 0.2, d, d + 0.05, za, zs)
        box('trim', F, cu - r - 0.3, cu + r + 0.3, d, d + 0.12, za - 0.12, za)
        box('trim', F, cu - 0.03, cu + 0.03, gd, gd + 0.05, za, zs + r)
        box('trim', F, cu - r, cu + r, gd, gd + 0.05, zs - 0.03, zs + 0.03)

def balustrade(F, u0, u1, d, z, h=0.95, step=0.62, pw_=0.15):
    box('trim', F, u0, u1, d - 0.13, d + 0.13, z + h - 0.14, z + h)
    box('trim', F, u0, u1, d - 0.11, d + 0.11, z, z + 0.13)
    n = max(1, int((u1 - u0) / step))
    s = (u1 - u0) / n
    for i in range(n + 1):
        u = u0 + i * s
        box('trim', F, u - pw_ / 2, u + pw_ / 2, d - pw_ / 2, d + pw_ / 2, z + 0.13, z + h - 0.14, bottom=False)

def pillar(F, u, d, z, h=1.3, w=0.42):
    box('trim', F, u - w / 2, u + w / 2, d - w / 2, d + w / 2, z, z + h)
    box('trim', F, u - w / 2 - 0.06, u + w / 2 + 0.06, d - w / 2 - 0.06, d + w / 2 + 0.06, z + h, z + h + 0.1)

def urn(F, u, d, z, s=1.0):
    base = F.p(u, d, z)
    prof = [(0.0, 0.0), (0.2 * s, 0.0), (0.26 * s, 0.1 * s), (0.18 * s, 0.22 * s), (0.34 * s, 0.45 * s),
            (0.36 * s, 0.62 * s), (0.26 * s, 0.78 * s), (0.34 * s, 0.84 * s)]
    lathe('trim', Vector((base.x, base.y, z)), prof, 8, cap=True)

def balcony(F, cu, z, w, d, pr=0.6):
    """Балкон под окном 2-го этажа: плита и ограждение."""
    box('trim', F, cu - w / 2 - 0.25, cu + w / 2 + 0.25, d, d + pr, z - 0.28, z - 0.06, bottom=False)
    balustrade(F, cu - w / 2 - 0.2, cu + w / 2 + 0.2, d + pr - 0.1, z - 0.06, h=0.9, step=0.7, pw_=0.14)

def column(F, u, d, z0, H, D, ped=0.8):
    """Колонна упрощённого коринфского ордера: тумба, база, гладкий ствол (trim_s), капитель."""
    p = F.p(u, d, 0)
    cx, cy = p.x, p.y
    F0 = Frame(Vector((cx, cy)), Vector((1, 0)), Vector((0, 1)))
    k = D
    if ped:
        box('stone', F0, -0.78 * D, 0.78 * D, -0.78 * D, 0.78 * D, z0, z0 + ped)
        box('stone', F0, -0.86 * D, 0.86 * D, -0.86 * D, 0.86 * D, z0 + ped - 0.08, z0 + ped)
    zb = z0 + ped
    box('trim', F0, -0.74 * D, 0.74 * D, -0.74 * D, 0.74 * D, zb, zb + 0.12 * D)
    base = Vector((cx, cy, zb + 0.12 * D))
    lathe('trim', base, [(0.68 * k, 0), (0.64 * k, 0.12 * k), (0.52 * k, 0.17 * k)], 8, cap=False)
    zs0 = zb + 0.12 * D + 0.17 * k
    cap_h = 1.05 * D
    zs1 = z0 + H - cap_h
    zm = (zs0 + zs1) / 2
    lathe('trim_s', Vector((cx, cy, 0)), [(0.50 * D, zs0), (0.51 * D, zm), (0.445 * D, zs1)], 10, cap=False)
    cb = Vector((cx, cy, zs1))
    lathe('trim', cb, [(0.455 * D, 0), (0.56 * D, 0.35 * D), (0.66 * D, 0.72 * D)], 8, cap=True)
    # листья акантов (наклонные пластины) и абака
    for q in range(8):
        a = q * math.pi / 4
        ca, sa = math.cos(a), math.sin(a)
        rad = Vector((ca, sa, 0)); tang = Vector((-sa, ca, 0))
        r0 = 0.46 * D; r1 = 0.62 * D if q % 2 == 0 else 0.55 * D
        h1 = 0.78 * D if q % 2 == 0 else 0.5 * D
        c0 = Vector((cx, cy, zs1 + 0.04 * D)) + rad * r0
        c1 = Vector((cx, cy, zs1 + h1)) + rad * r1
        wd = 0.11 * D
        face('trim', [c0 - tang * wd, c0 + tang * wd, c1 + tang * wd * 0.6, c1 - tang * wd * 0.6], rad)
    box('trim', F0, -0.74 * D, 0.74 * D, -0.74 * D, 0.74 * D, z0 + H - 0.16 * D, z0 + H)

# ================================================================== ГЛАВНЫЙ ФАСАД И ПОРТИК
PU0, PU1 = 19.0, 37.8
UC = (PU0 + PU1) / 2
DCOL = 4.2                 # ось передних колонн портика
COL_D, COL_Z0 = 1.1, 0.55
COL_H = 8.6                # от стилобата до верха капители
Z_ENT = COL_Z0 + COL_H     # 9.15
Z_DECK = Z_ENT + 1.25      # 10.4 — пол балкона 3-го этажа
Z_BLK = 14.0               # верх стены над портиком
CASP = 4.8                 # шаг арочных окон 3-го этажа

def entablature(F, u0, u1, d0, d1, ends=(True, True), side_u=None):
    """Антаблемент: архитрав, фриз, двухступенчатый карниз; u0..u1 — по архитраву, d1 — передняя грань."""
    def ring(z0, z1, off, m):
        box(m, F, u0 - off, u1 + off, d0, d1 + off, z0, z1)
    ring(Z_ENT, Z_ENT + 0.4, 0.0, 'trim')
    ring(Z_ENT + 0.4, Z_ENT + 0.8, -0.04, 'wall')
    ring(Z_ENT + 0.8, Z_ENT + 0.98, 0.2, 'trim')
    ring(Z_ENT + 0.98, Z_DECK, 0.5, 'trim')

def modillions(F, u0, u1, d, z0, z1, step=0.6, pr=0.3):
    k = u0 + step / 2
    while k < u1:
        box('trim', F, k - 0.1, k + 0.1, d, d + pr, z0, z1, bottom=False)
        k += step

def build_portico():
    F = FA
    uc = UC
    # стилобат и ступени
    box('stone', F, PU0 - 0.2, PU1 + 0.2, 0.0, DCOL + 0.55, GROUND, COL_Z0 - 0.05)
    box('trim', F, PU0 - 0.25, PU1 + 0.25, 0.0, DCOL + 0.6, COL_Z0 - 0.05, COL_Z0)
    for i in range(3):
        box('stone', F, PU0 - 0.2, PU1 + 0.2, DCOL + 0.55, DCOL + 0.95 + 0.4 * i, GROUND, COL_Z0 - 0.17 * (i + 1) - 0.0)
    # колонны: шесть по фасаду + боковые возвраты (по две на сторону)
    fu = [-8.6, -5.16, -1.72, 1.72, 5.16, 8.6]
    for s in fu:
        column(F, uc + s, DCOL, COL_Z0, COL_H, COL_D)
    for s in (-8.6, 8.6):
        column(F, uc + s, DCOL - 2.1, COL_Z0, COL_H, COL_D)
        # пилястра у стены
        box('trim', F, uc + s - 0.45, uc + s + 0.45, 0.0, 0.16, COL_Z0, Z_ENT)
    # антаблемент по всему периметру портика
    entablature(F, uc - 9.15, uc + 9.15, 0.0, DCOL + 0.52)
    modillions(F, uc - 9.0, uc + 9.0, DCOL + 0.72, Z_ENT + 0.8, Z_ENT + 0.98)
    # потолок и пол балкона
    box('trim', F, uc - 9.0, uc + 9.0, 0.0, DCOL + 0.5, Z_ENT - 0.02, Z_ENT)
    # стена за колоннами: двери, окна, арочные окна 3 этажа
    bay = [-6.88, -3.44, 0.0, 3.44, 6.88]
    lo, up = [], []
    wbs = [1.8 if i % 2 == 0 else 1.4 for i in range(5)]
    for i, s in enumerate(bay):
        wb = wbs[i]
        if i % 2 == 0:
            lo.append((uc + s - wb / 2, uc + s + wb / 2, COL_Z0, COL_Z0 + 3.5))
        else:
            lo.append((uc + s - wb / 2, uc + s + wb / 2, 1.3, 3.6))
        lo.append((uc + s - wb / 2, uc + s + wb / 2, 5.45, 8.1))
    ar = 1.3
    for s in (-CASP, 0.0, CASP):
        up.append((uc + s - ar, uc + s + ar, Z_DECK + 0.55, Z_DECK + 0.55 + 1.5 + ar))
    pw(F, PU0, PU1, COL_Z0, 9.0, 0.0, lo)
    pw(F, PU0, PU1, 9.0, Z_BLK, 0.0, up)
    for i, s in enumerate(bay):
        cu = uc + s
        wb = wbs[i]
        if i % 2 == 0:
            g = -0.2
            face('wood', [F.p(cu - 0.9, g, COL_Z0), F.p(cu + 0.9, g, COL_Z0), F.p(cu + 0.9, g, COL_Z0 + 2.6), F.p(cu - 0.9, g, COL_Z0 + 2.6)], F.N())
            face('glass', [F.p(cu - 0.9, g, COL_Z0 + 2.6), F.p(cu + 0.9, g, COL_Z0 + 2.6), F.p(cu + 0.9, g, COL_Z0 + 3.5), F.p(cu - 0.9, g, COL_Z0 + 3.5)], F.N())
            box('trim', F, cu - 0.03, cu + 0.03, g, g + 0.05, COL_Z0, COL_Z0 + 3.5)
            box('trim', F, cu - 1.15, cu - 0.9, 0.0, 0.12, COL_Z0, COL_Z0 + 3.7)
            box('trim', F, cu + 0.9, cu + 1.15, 0.0, 0.12, COL_Z0, COL_Z0 + 3.7)
            box('trim', F, cu - 1.3, cu + 1.3, 0.0, 0.2, COL_Z0 + 3.5, COL_Z0 + 3.68)
            prism_uz('trim', F, [(cu - 1.35, COL_Z0 + 3.68), (cu + 1.35, COL_Z0 + 3.68), (cu, COL_Z0 + 4.25)], 0.0, 0.2)
        else:
            win(F, cu, 1.3, wb, 2.3, 0.0, tier=1)
        win(F, cu, 5.45, wb, 2.65, 0.0, tier=2)
        balustrade(F, cu - wb / 2, cu + wb / 2, 0.18, 4.65, h=0.8, step=0.3, pw_=0.1)
    for s in (-CASP, 0.0, CASP):
        arch_win(F, uc + s, Z_DECK + 0.55, ar, Z_DECK + 0.55 + 1.5, 0.0, seg=6)
    # пояс под 2-м этажом и междуэтажный
    band(F, PU0, PU1, 0.0, Z1 - 0.15, Z1 + 0.1, 0.08)
    # венчание портика: карниз, аттик
    cornice(F, PU0 + 0.1, PU1 - 0.1, 0.0, Z_BLK, ext=0.6)
    box('wall', F, PU0 + 0.3, PU1 - 0.3, -0.4, 0.5, Z_BLK + 0.6, Z_BLK + 1.7)
    box('trim', F, PU0 + 0.1, PU1 - 0.1, -0.55, 0.62, Z_BLK + 1.7, Z_BLK + 1.9)
    for s in (-CASP * 1.5, -CASP * 0.5, CASP * 0.5, CASP * 1.5):
        box('trim', F, uc + s - 1.25, uc + s + 1.25, 0.5, 0.56, Z_BLK + 0.75, Z_BLK + 1.6)
    # балюстрада балкона и вазы
    zb = Z_DECK
    fd = DCOL + 0.4
    balustrade(F, uc - 9.2, uc + 9.2, fd, zb, h=1.05)
    Fl = Frame(F.p(uc - 9.2, 0, 0).xy, F.n, -F.u)
    Fr = Frame(F.p(uc + 9.2, 0, 0).xy, F.n, F.u)
    for Fs in (Fl, Fr):
        balustrade(Fs, 0.0, fd, 0.0, zb, h=1.05)
    for s in (-9.2, -4.6, 0.0, 4.6, 9.2):
        pillar(F, uc + s, fd, zb, h=1.15)
        urn(F, uc + s, fd, zb + 1.25, 1.2)
    # фонарики-лампы не строим; табличка-фриз
    box('trim', F, uc - 3.2, uc + 3.2, DCOL + 0.5, DCOL + 0.55, Z_ENT + 0.46, Z_ENT + 0.74)

def build_colonnade():
    """Северо-восточная колоннада (u 0…11.5): колонны перед стеной, балкон со вазами над ними."""
    F = FA
    CD = 2.3
    cu = [0.9, 3.0, 5.1, 7.2, 9.3, 11.0]
    for u in cu:
        column(F, u, CD, COL_Z0, COL_H, 0.95, ped=0.6)
    column(F, 0.9, 0.35, COL_Z0, COL_H, 0.95, ped=0.6)         # угловая пара
    box('stone', F, -0.2, 11.9, 0.0, CD + 0.7, GROUND, COL_Z0 - 0.05)
    box('trim', F, -0.25, 11.95, 0.0, CD + 0.75, COL_Z0 - 0.05, COL_Z0)
    def ring(z0, z1, off, m):
        box(m, F, -0.3 - off, 11.6 + off, 0.0, CD + 0.5 + off, z0, z1)
    ring(Z_ENT, Z_ENT + 0.4, 0.0, 'trim')
    ring(Z_ENT + 0.4, Z_ENT + 0.8, -0.04, 'wall')
    ring(Z_ENT + 0.8, Z_ENT + 0.98, 0.2, 'trim')
    ring(Z_ENT + 0.98, Z_DECK, 0.5, 'trim')
    modillions(F, -0.2, 11.5, CD + 0.7, Z_ENT + 0.8, Z_ENT + 0.98)
    fd = CD + 0.4
    balustrade(F, -0.6, 11.9, fd, Z_DECK, h=1.0)
    for s, Fs in ((-0.6, Frame(F.p(-0.6, 0, 0).xy, F.n, -F.u)), (11.9, Frame(F.p(11.9, 0, 0).xy, F.n, F.u))):
        balustrade(Fs, 0.0, fd, 0.0, Z_DECK, h=1.0)
    for u in (-0.6, 3.4, 7.4, 11.9):
        pillar(F, u, fd, Z_DECK, h=1.1, w=0.4)
        urn(F, u, fd, Z_DECK + 1.2, 1.1)
    # стена за колоннадой
    bays = [1.9, 5.75, 9.6]
    lo, up = [], []
    for c in bays:
        lo.append((c - 0.8, c + 0.8, 0.9, 3.7))
        lo.append((c - 0.8, c + 0.8, 5.45, 8.1))
        up.append((c - 0.8, c + 0.8, Z_DECK + 0.5, Z_DECK + 0.5 + 1.3 + 0.8))
    pw(FA, 0.0, 11.5, GROUND, 9.0, 0.0, lo)
    pw(FA, 0.0, 11.5, 9.0, ZC, 0.0, up)
    for c in bays:
        win(FA, c, 0.9, 1.6, 2.8, 0.0, tier=2)
        win(FA, c, 5.45, 1.6, 2.65, 0.0, tier=2)
        balustrade(FA, c - 0.8, c + 0.8, 0.18, 4.65, h=0.8, step=0.3, pw_=0.1)
        arch_win(FA, c, Z_DECK + 0.5, 0.8, Z_DECK + 0.5 + 1.3, 0.0, seg=4, frame=False)

# ================================================================== ОБЫЧНЫЕ ФАСАДЫ
FLOORS_T = ((0.95, 2.7), (5.45, 2.6), (9.9, 2.2))     # высоты окон: этаж 1, 2, 3
FLOORS_N = ((0.95, 2.7), (5.45, 2.6))

def facade(F, L, tall=True, bay=3.3, tier=2, arched=False, balc=(), u0=0.0, u1=None, ztop=None, zbot=GROUND,
           floors=None, win_w=1.4, belt=True, cornice_on=True, plinth=True, arch_r=0.7, skip_lo=False):
    """Фасад по ребру контура: окна по этажам, пояс, цоколь, карниз. Стена в плоскости d=0."""
    u1 = L if u1 is None else u1
    fl = floors or (FLOORS_T if tall else FLOORS_N)
    zc = ZC if tall else ZN
    ztop = zc if ztop is None else ztop
    span = u1 - u0
    nb = int(round(span / bay)) if span > 2.4 else 0
    holes, items = [], []
    for i in range(nb):
        cu = u0 + span * (i + 0.5) / nb
        for fi, (za, h) in enumerate(fl):
            if za < zbot + 0.01 and zbot > 0: continue
            w = min(win_w, span / nb * 0.55)
            if arched and fi == 0:
                holes.append((cu - w / 2, cu + w / 2, 0.8, 3.3 + w / 2))
                items.append(('arch', cu, 0.8, w / 2))
            else:
                holes.append((cu - w / 2, cu + w / 2, za, za + h))
                items.append(('win', cu, za, w, h, fi))
    pw(F, u0, u1, zbot, ztop, 0.0, holes)
    for it in items:
        if it[0] == 'arch':
            arch_win(F, it[1], 0.8, it[3], 3.3, 0.0, seg=4)
        else:
            _, cu, za, w, h, fi = it
            win(F, cu, za, w, h, 0.0, tier=tier)
            if fi == 1 and any(abs(cu - b) < 0.5 for b in balc):
                balcony(F, cu, za, w, 0.0)
    if plinth:
        box('stone', F, u0, u1, -0.25, 0.07, zbot, 0.8)
        box('trim', F, u0, u1, -0.25, 0.1, 0.8, 0.92)
    if belt and tall:
        band(F, u0, u1, 0.0, Z1 - 0.1, Z1 + 0.12, 0.07)
    if cornice_on:
        cornice(F, u0, u1, 0.0, ztop, ext=0.5)
    return nb

def pilaster_strip(F, u, z0, z1, w=0.5, pr=0.14):
    box('trim', F, u - w / 2, u + w / 2, 0.0, pr, z0, z1)

def build_street_wings():
    F = FA
    # ровный участок между колоннадой и портиком (u 11.5…19)
    holes = []
    cs = [13.4, 17.1]
    for c in cs:
        holes += [(c - 0.7, c + 0.7, 1.3, 3.6), (c - 0.7, c + 0.7, 5.45, 8.1), (c - 0.7, c + 0.7, 9.9, 12.1)]
    pw(F, 11.5, 19.0, GROUND, ZC, 0.0, holes)
    for c in cs:
        win(F, c, 1.3, 1.4, 2.3, 0.0, tier=1)
        win(F, c, 5.45, 1.4, 2.65, 0.0, tier=1)
        win(F, c, 9.9, 1.4, 2.2, 0.0, tier=1)
    balcony(F, cs[0], 5.45, 1.4, 0.0)
    box('stone', F, 11.5, 19.0, -0.25, 0.07, GROUND, 0.8); box('trim', F, 11.5, 19.0, -0.25, 0.1, 0.8, 0.92)
    band(F, 11.5, 19.0, 0.0, Z1 - 0.1, Z1 + 0.12, 0.07)
    cornice(F, 0.0, 19.0, 0.0, ZC, ext=0.5)
    # юго-западное крыло вдоль проспекта (u 37.8…64.5)
    Fs = Frame(F.p(37.8, 0, 0).xy, F.u, F.n)
    facade(Fs, 26.7, tall=True, bay=3.34, tier=1, arched=True, balc=(1.7, 8.4, 15.1, 21.8), belt=True)
    # рустованные лопатки по углам
    for u0, u1 in ((0.0, 0.55), (26.15, 26.7)):
        z = 0.92
        while z < ZC - 0.6:
            box('trim', Fs, u0, u1, 0.0, 0.1, z, z + 0.3)
            z += 0.46
    # левый ровный торец портика — стена и пилястры у боковых граней
    box('trim', F, 36.9, 37.8, 0.0, 0.14, COL_Z0, Z_BLK)

def build_edges():
    E = lambda a, b: eframe(PT[a], PT[b])
    # северо-восточный торец (u=0) от угла Нахимова — к северо-западу
    F, L = E(9, 10)
    facade(F, L, tall=True, bay=3.4, balc=(10.0, 27.0, 44.0))
    # юго-западный торец на ул. Айвазовского
    F, L = E(17, 18)
    facade(F, L, tall=True, bay=3.38, tier=2, arched=True, balc=(8.0, 27.0, 46.0))
    # южный угол двора: торец крыла C, внутренние стены двора
    F, L = E(18, 19); facade(F, L, tall=True, bay=3.3)
    F, L = E(19, 20); facade(F, L, tall=True, bay=3.35)
    F, L = E(20, 21); facade(F, L, tall=True, bay=3.3)
    F, L = E(21, 22); facade(F, L, tall=True, bay=3.4)
    F, L = E(22, 23); facade(F, L, tall=True, bay=3.3)
    F, L = E(23, 24); facade(F, L, tall=True, bay=3.4)
    F, L = E(24, 25); facade(F, L, tall=True, bay=3.3)
    F, L = E(25, 26); facade(F, L, tall=True, bay=3.38)
    # северо-западная часть: двухэтажная (низкий корпус ресторана)
    for a, b in ((26, 27), (27, 28), (28, 29), (29, 30)):
        F, L = E(a, b); facade(F, L, tall=False, bay=3.2)
    F, L = E(30, 31); facade(F, L, tall=False, bay=3.3)
    # крыло W (3 этажа)
    for a, b in ((31, 32), (32, 33), (33, 34), (34, 35), (35, 36)):
        F, L = E(a, b); facade(F, L, tall=True, bay=3.3, tier=2)
    F, L = E(36, 37); facade(F, L, tall=False, bay=3.3)
    F, L = E(37, 0); facade(F, L, tall=False, bay=3.0)
    # закруглённый эркер: дуга из семи хорд, на первом этаже арочные окна
    for a in range(0, 7):
        F, L = E(a, a + 1)
        facade(F, L, tall=False, bay=3.0, arched=True, arch_r=0.62, win_w=1.1, belt=False)
        pilaster_strip(F, 0.0, 0.92, ZN, w=0.5)
    F, L = E(7, 8); facade(F, L, tall=False, bay=3.3)
    F, L = E(8, 9); facade(F, L, tall=True, bay=3.0)

def build_exposed():
    """Верхние участки стен, открытые над низким корпусом."""
    # торец крыла B над низким корпусом (n = −54.4, u 3.8…13.2)
    F, L = eframe((13.2, -54.4), (3.8, -54.4))
    holes = [(c - 0.7, c + 0.7, HN + 0.3, HN + 2.0) for c in (2.2, 4.7, 7.2)]
    pw(F, 0, L, HN, ZC, 0.0, holes)
    for h in holes: win(F, (h[0] + h[1]) / 2, h[2], 1.4, h[3] - h[2], 0.0, tier=2)
    cornice(F, 0, L, 0.0, ZC, ext=0.5)
    # западная грань крыла W над низким корпусом
    F, L = eframe((48.7, -87.8), (44.5, -69.7))
    nb = 5
    holes = [(L * (i + 0.5) / nb - 0.7, L * (i + 0.5) / nb + 0.7, HN + 0.3, HN + 2.0) for i in range(nb)]
    pw(F, 0, L, HN, ZC, 0.0, holes)
    for h in holes: win(F, (h[0] + h[1]) / 2, h[2], 1.4, h[3] - h[2], 0.0, tier=2)
    cornice(F, 0, L, 0.0, ZC, ext=0.5)

def build_link():
    """Перемычка во двор (OSM w701165048, 8.9 м): два этажа, плоская кровля."""
    a = [PT[18], PT[19], (49.1, -57.7), PT[33]]
    pts = [PP(*p) for p in a]
    face('stone', [Vector((p.x, p.y, 8.9)) for p in pts], UP)
    # стена на ул. Айвазовского (u = 64.5)
    Fe = Frame(PP(64.5, -54.1), -NV, UV)
    pw(Fe, 0, 5.2, GROUND, 8.4, 0.0, [(1.6, 3.0, 1.0, 3.6), (1.6, 3.0, 5.45, 8.0)])
    win(Fe, 2.3, 1.0, 1.4, 2.6, 0.0); win(Fe, 2.3, 5.45, 1.4, 2.55, 0.0)
    cornice(Fe, 0, 5.2, 0.0, 8.4, ext=0.4)

# ================================================================== КРОВЛИ
def PF(o_u, o_n, ax_u, ax_n, side_u, side_n):
    return Frame(PP(o_u, o_n), UV * ax_u + NV * ax_n, UV * side_u + NV * side_n)

def build_roofs():
    # A: вдоль проспекта
    hip_roof(FA, -0.2, 64.7, 0.0, -17.9, EAVE, 3.4, ov=0.5)
    # B: северо-восточное крыло, конёк вдоль −n; d — по +u
    FB = PF(0, 0, 0, -1, 1, 0)
    hip_roof(FB, 9.5, 54.4, 13.2, 0.0, EAVE, 2.5, ov=0.5, hip0=False, hip1=True)
    # C: юго-западное крыло
    hip_roof(FB, 9.5, 54.1, 64.5, 48.7, EAVE, 3.0, ov=0.5, hip0=False, hip1=True)
    # W: крыло на северо-западе двора
    hip_roof(FB, 57.5, 89.0, 64.8, 46.0, EAVE, 3.3, ov=0.5, hip0=True, hip1=True)
    # плоская кровля низкого корпуса (камень) + парапет по наружным рёбрам
    npts = [36, 37, 0, 1, 2, 3, 4, 5, 6, 7, 8, 26, 27, 28, 29, 30, 31]
    pl = [PP(*PT[i]) for i in npts]
    face('stone', [Vector((p.x, p.y, HN)) for p in pl], UP)
    for a, b in zip(npts[:-1], npts[1:]):
        if (a, b) in ((8, 26),) : continue
        F, L = eframe(PT[a], PT[b])
        if L < 0.5: continue
        box('trim', F, -0.1, L + 0.1, -0.05, 0.3, HN, HN + 0.9)
        box('trim', F, -0.2, L + 0.2, -0.15, 0.4, HN + 0.9, HN + 1.05)
    # трубы
    for u in (7.0, 24.0, 42.0, 57.0):
        chimney(FA, u, -7.2, EAVE + 1.8, EAVE + 4.2)
    for n in (-30.0, -45.0):
        chimney(FB, -n, 9.2, EAVE + 1.0, EAVE + 3.3)

def fence(F, u0, u1, d, z, h=0.9, every=3.0):
    """Чёрное ограждение по краю кровли: два прута и стойки."""
    beam('metal', F.p(u0, d, z + h), F.p(u1, d, z + h), 0.04)
    beam('metal', F.p(u0, d, z + h * 0.5), F.p(u1, d, z + h * 0.5), 0.03)
    n = max(1, int(round((u1 - u0) / every)))
    for i in range(n + 1):
        u = u0 + (u1 - u0) * i / n
        beam('metal', F.p(u, d, z), F.p(u, d, z + h), 0.04)

def build_sign():
    """Светящаяся надпись «СЕВАСТОПОЛЬ» на аттике над портиком — каркас и буквы из брусков."""
    F = FA
    top = Z_BLK + 1.9
    zb, hh = top + 0.9, 1.9
    w, gap = 0.95, 0.3
    glyph = {
        'С': [(0, 0, 1, .22), (0, 1 - .22, 1, 1), (0, 0, .28, 1)],
        'Е': [(0, 0, .28, 1), (0, 0, 1, .22), (0, .39, .8, .61), (0, .78, 1, 1)],
        'В': [(0, 0, .28, 1), (0, 0, .9, .2), (0, .4, .9, .6), (0, .8, .9, 1), (.7, .0, 1, .5), (.7, .5, 1, 1)],
        'А': [(0, 0, .28, 1), (.72, 0, 1, 1), (0, .8, 1, 1), (0, .4, 1, .6)],
        'Т': [(0, .8, 1, 1), (.36, 0, .64, 1)],
        'О': [(0, 0, .28, 1), (.72, 0, 1, 1), (0, 0, 1, .2), (0, .8, 1, 1)],
        'П': [(0, 0, .28, 1), (.72, 0, 1, 1), (0, .8, 1, 1)],
        'Л': [(0, 0, .28, .8), (.72, 0, 1, 1), (0, .8, 1, 1), (.35, .3, .7, 1)],
        'Ь': [(0, 0, .28, 1), (0, 0, 1, .2), (0, .45, 1, .65), (.72, 0, 1, .65)],
    }
    word = 'СЕВАСТОПОЛЬ'
    total = len(word) * w + (len(word) - 1) * gap
    u = UC + total / 2
    for ch in word:
        for a, b, c, d_ in glyph[ch]:
            box('trim', F, u - c * w, u - a * w, -0.9, -0.7, zb + b * hh, zb + d_ * hh, bottom=False)
        u -= w + gap
    # каркас
    for uu in (UC - total / 2 - 0.3, UC - total / 4, UC, UC + total / 4, UC + total / 2 + 0.3):
        beam('metal', F.p(uu, -0.8, top), F.p(uu, -0.8, zb + hh + 0.3), 0.08)
    beam('metal', F.p(UC - total / 2 - 0.3, -0.8, zb - 0.15), F.p(UC + total / 2 + 0.3, -0.8, zb - 0.15), 0.08)
    beam('metal', F.p(UC - total / 2 - 0.3, -0.8, zb + hh + 0.3), F.p(UC + total / 2 + 0.3, -0.8, zb + hh + 0.3), 0.08)

_last = [0]
def tally(label):
    n = sum(sum(len(f.verts) - 2 for f in bm.faces) for bm in BM.values())
    print('  [%-10s] +%d' % (label, n - _last[0])); _last[0] = n

build_portico(); tally('portico')
build_colonnade(); tally('colonnade')
build_street_wings(); tally('street')
build_edges(); tally('edges')
build_exposed(); build_link(); tally('exposed')
build_roofs(); tally('roofs')
build_sign(); tally('sign')
fence(FA, 37.8, 64.5, 0.2, EAVE - 0.05)
fence(FA, 0.0, 19.0, 0.2, EAVE - 0.05)
tally('fence')

finish('hotel_sevastopol', __file__)
