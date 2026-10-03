# Севастопольский академический русский драматический театр имени А. В. Луначарского
# (пр. Нахимова, 6; 1951 г.) — модель с нуля.
#
#   blender -b --python models/theatre_lunacharsky/build.py -- [glb]
#
# План — контур OSM way 92718636: корпус 52 × 35,2 м (длинная ось на СВ), главный
# фасад с восьмиколонным портиком обращён на СВ, на площадь. Фото — Викисклад
# (см. NOTES.md). Ноль высоты — плитка площади по оси портика у подножия
# входных дверей; в плане начало координат — середина фасада портика.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

COL['wall']  = ((0.91, 0.87, 0.75), 0.9)    # тёплая светлая штукатурка
COL['wall2'] = ((0.87, 0.84, 0.77), 0.9)    # рустованный цоколь, чуть холоднее
COL['trim']  = ((0.96, 0.95, 0.91), 0.85)   # белые детали
COL['stone'] = ((0.60, 0.58, 0.55), 0.9)
COL['roof']  = ((0.50, 0.19, 0.15), 0.8)    # красная листовая сталь
COL['wood']  = ((0.30, 0.19, 0.10), 0.6)    # двери, бронза скульптур

# ---------------------------------------------------------------- план
A = (-331.9, 308.7)                      # западный угол контура (OSM)
UE = (0.5977, -0.8020)                   # вдоль длинной оси, на СВ (мир x, z)
VE = (0.8020, 0.5977)                    # поперёк, на ЮВ
L, WD, PD = 52.0, 35.2, 14.4             # длина корпуса, ширина, вынос портика
def pt(a, v): return (A[0] + a * UE[0] + v * VE[0], A[1] + a * UE[1] + v * VE[1])

CEN = pt(L + PD, WD / 2)                 # середина фасада портика
X0, Z0 = CEN
origin(X0, Z0)
FP, _ = frame_from(CEN, pt(L + PD, WD / 2 - 12.8), pt(L, WD / 2))   # u — на СЗ, n — на СВ
HW = WD / 2                              # 17.6 — полуширина корпуса в u

GROUND = -4.0            # стены уходят под землю: участок с уклоном
PB = 5.2                 # терраса: верх цоколя портика
COLH, COLD = 8.0, 1.4
EAVE = 15.6              # верх карниза корпуса и антаблемента портика
ENT0 = PB + COLH         # низ антаблемента 13.2
HALF = 12.5              # полуширина антаблемента
SL = math.tan(math.radians(19))
OV = HALF + 0.85
APEX = EAVE + OV * SL

def cstep(F, ua, ub, d, z, h=0.95, step=0.4, w=0.11):
    """Балюстрада: перила и балясины на прямом участке."""
    box('trim', F, ua, ub, d - 0.11, d + 0.11, z + h - 0.12, z + h)
    box('trim', F, ua, ub, d - 0.09, d + 0.09, z, z + 0.14)
    n = max(1, int((ub - ua) / step))
    for i in range(n + 1):
        u = ua + (ub - ua) * i / n
        box('trim', F, u - w / 2, u + w / 2, d - w / 2, d + w / 2, z + 0.14, z + h - 0.12, bottom=False)

def bal_slope(F, u0, z0, u1, z1, d, h=0.95, n=8):
    a, b = F.p(u0, d, z0 + h), F.p(u1, d, z1 + h)
    beam('trim', a, b, 0.2, 0.14)
    beam('trim', F.p(u0, d, z0 + 0.1), F.p(u1, d, z1 + 0.1), 0.2, 0.14)
    for i in range(n + 1):
        t = i / n
        u = u0 + (u1 - u0) * t; z = z0 + (z1 - z0) * t
        box('trim', F, u - 0.06, u + 0.06, d - 0.06, d + 0.06, z + 0.1, z + h, bottom=False)

def arch_fill(F, cu, rx, ry, zs, d, m='wall2', rev=0.35, n=10):
    """Заполнение углов над проёмом, который закрыт полуэллипсом (центр на высоте zs)."""
    arc = [(cu + rx * math.cos(math.pi * k / n), zs + ry * math.sin(math.pi * k / n)) for k in range(n + 1)]
    h = n // 2
    face(m, [F.p(cu + rx, d, zs + ry)] + [F.p(u, d, z) for u, z in arc[:h + 1]], F.N())
    face(m, [F.p(cu - rx, d, zs + ry)] + [F.p(u, d, z) for u, z in arc[h:]], F.N())
    for k in range(n):
        (ua, za), (ub, zb) = arc[k], arc[k + 1]
        face('trim', [F.p(ua, d, za), F.p(ub, d, zb), F.p(ub, d - rev, zb), F.p(ua, d - rev, za)],
             F.p(cu, d, zs) - F.p((ua + ub) / 2, d, (za + zb) / 2))
    return arc

def archivolt(F, cu, rx, ry, zs, d, w=0.3, n=10):
    for k in range(n):
        a0, a1 = math.pi * k / n, math.pi * (k + 1) / n
        p = [(cu + rx * math.cos(a0), zs + ry * math.sin(a0)), (cu + rx * math.cos(a1), zs + ry * math.sin(a1)),
             (cu + (rx + w) * math.cos(a1), zs + (ry + w) * math.sin(a1)), (cu + (rx + w) * math.cos(a0), zs + (ry + w) * math.sin(a0))]
        face('trim', [F.p(u, d + 0.06, z) for u, z in p], F.N())
        face('trim', [F.p(p[2][0], d, p[2][1]), F.p(p[3][0], d, p[3][1]), F.p(p[3][0], d + 0.06, p[3][1]), F.p(p[2][0], d + 0.06, p[2][1])],
             F.p((p[2][0] + p[3][0]) / 2, d, (p[2][1] + p[3][1]) / 2) - F.p(cu, d, zs))

def arch_glass(F, cu, rx, ry, zs, zlow, g, spokes=0, n=10, glass='glass'):
    arc = [(cu + rx * math.cos(math.pi * k / n), zs + ry * math.sin(math.pi * k / n)) for k in range(n + 1)]
    face(glass, [F.p(cu - rx, g, zlow), F.p(cu + rx, g, zlow)] + [F.p(u, g, z) for u, z in arc], F.N())
    t = 0.06
    for k in range(n):
        (ua, za), (ub, zb) = arc[k], arc[k + 1]
        beam('trim', F.p(ua, g + 0.03, za), F.p(ub, g + 0.03, zb), t, 0.1)
    for s in range(1, spokes + 1):
        a = math.pi * s / (spokes + 1)
        beam('trim', F.p(cu, g + 0.03, zs), F.p(cu + rx * math.cos(a), g + 0.03, zs + ry * math.sin(a)), t, 0.1)
    return arc

def lite_window(F, cu, za, w, h, d, jambs=False, simple=False):
    """Окно попроще кита: стекло, импост, подоконник и перемычка."""
    ua, ub, zb = cu - w / 2, cu + w / 2, za + h
    g = d - 0.2
    face('glass', [F.p(ua, g, za), F.p(ub, g, za), F.p(ub, g, zb), F.p(ua, g, zb)], F.N())
    if not simple:
        face('trim', [F.p(cu - 0.03, g + 0.02, za), F.p(cu + 0.03, g + 0.02, za), F.p(cu + 0.03, g + 0.02, zb), F.p(cu - 0.03, g + 0.02, zb)], F.N())
        face('trim', [F.p(ua, g + 0.02, za + h * 0.66 - 0.03), F.p(ub, g + 0.02, za + h * 0.66 - 0.03),
                      F.p(ub, g + 0.02, za + h * 0.66 + 0.03), F.p(ua, g + 0.02, za + h * 0.66 + 0.03)], F.N())
    box('trim', F, ua - 0.16, ub + 0.16, d, d + 0.10, zb, zb + 0.2, bottom=False)
    box('trim', F, ua - 0.14, ub + 0.14, d, d + 0.2, za - 0.14, za, bottom=False)
    if jambs:
        box('trim', F, ua - 0.14, ua, d, d + 0.06, za, zb, bottom=False)
        box('trim', F, ub, ub + 0.14, d, d + 0.06, za, zb, bottom=False)
    return (ua, ub, za, zb)

# ---------------------------------------------------------------- колонна
def column(base, H, D, seg=10):
    """Колонна: гладкий ствол с энтазисом (trim_s — виден и вдали), коринфская капитель (trim)."""
    R = D / 2
    F0 = Frame(Vector((base.x, base.y)), Vector((1, 0)), Vector((0, 1)))
    box('trim', F0, -0.78 * D, 0.78 * D, -0.78 * D, 0.78 * D, base.z, base.z + 0.32)
    cap_h = 1.1 * D
    z0, z1 = 0.32, H - cap_h
    prof = [(R * 1.1, z0), (R * 1.0, z0 + 0.16), (R * 1.06, z0 + 0.3)]
    for k in range(1, 4):
        t = k / 3
        prof.append((R * (1.0 - 0.13 * t ** 1.7), z0 + 0.3 + (z1 - z0 - 0.3) * t))
    prof.append((R * 0.9, z1 + 0.02))
    lathe('trim_s', base, prof, seg, cap=True)
    # капитель: колокол, два яруса листьев, абака, угловые завитки
    rb = R * 0.88
    bell = [(rb, z1), (rb + 0.02, z1 + 0.15 * cap_h), (rb + 0.14 * D, z1 + 0.45 * cap_h),
            (rb + 0.34 * D, z1 + 0.78 * cap_h), (rb + 0.40 * D, z1 + 0.84 * cap_h)]
    lathe('trim', base, bell, seg, cap=True)
    for tier, (zh, ln) in enumerate(((0.05, 0.50), (0.28, 0.58))):
        for q in range(8):
            ang = q * math.pi / 4 + (math.pi / 8 if tier else 0)
            ca, sa = math.cos(ang), math.sin(ang)
            rad = Vector((ca, sa, 0))
            p0 = base + rad * (rb + 0.06 + 0.03 * tier) + UP * (z1 + zh * cap_h)
            p1 = base + rad * (rb + 0.06 + 0.15 * D + 0.1 * tier) + UP * (z1 + (zh + ln) * cap_h)
            beam('trim', p0, p1, 0.34 * D, 0.08)
    ab = 0.62 * D
    prism_plan('trim', F0, [(-ab, -ab), (ab, -ab), (ab, ab), (-ab, ab)], base.z + z1 + 0.84 * cap_h, base.z + H)
    for q in range(4):
        ang = math.pi / 4 + q * math.pi / 2
        c0 = base + Vector((math.cos(ang), math.sin(ang), 0)) * (0.66 * D) + UP * (z1 + 0.76 * cap_h)
        beam('trim', c0 - UP * 0.18, c0 + UP * 0.14, 0.13 * D)

# ---------------------------------------------------------------- портик
def _cnt(): return sum(len(f.verts) - 2 for bm in BM.values() for f in bm.faces)

def build_portico():
    F = FP
    # цоколь с пятью арочными дверями
    doors = [-8.2, -4.1, 0.0, 4.1, 8.2]
    RX, RY, ZS = 1.15, 1.05, 3.0
    holes = [(cu - RX, cu + RX, 0.0, ZS + RY) for cu in doors]
    wall(F, -12.8, 12.8, GROUND, PB, 0, holes, m='wall2', reveal=0.36)
    for cu in doors:
        arch_fill(F, cu, RX, RY, ZS, 0)
        archivolt(F, cu, RX, RY, ZS, 0, 0.28)
        g = -0.34
        face('wood', [F.p(cu - RX, g, 0), F.p(cu + RX, g, 0), F.p(cu + RX, g, ZS), F.p(cu - RX, g, ZS)], F.N())
        box('trim', F, cu - 0.03, cu + 0.03, g, g + 0.05, 0, ZS)
        box('trim', F, cu - RX, cu + RX, g, g + 0.05, 1.0, 1.06)
        arch_glass(F, cu, RX, RY, ZS, ZS, g + 0.01, spokes=2)
        box('trim', F, cu - RX, cu + RX, g, g + 0.06, ZS - 0.04, ZS + 0.04)
    # рустовка (швы) между дверями
    free = [(-12.8, -9.35), (-7.05, -5.25), (-2.95, -1.15), (1.15, 2.95), (5.25, 7.05), (9.35, 12.8)]
    for z in (0.6, 1.5, 2.4, 3.3, 4.2, 4.65):
        for a, b in free:
            if z > 3.9 and z < 4.0: continue
            face('stone', [F.p(a, 0.012, z), F.p(b, 0.012, z), F.p(b, 0.012, z + 0.06), F.p(a, 0.012, z + 0.06)], F.N())
        if z >= 4.2:
            for cu in doors:
                face('stone', [F.p(cu - RX, 0.012, z), F.p(cu + RX, 0.012, z), F.p(cu + RX, 0.012, z + 0.06), F.p(cu - RX, 0.012, z + 0.06)], F.N())
    # ступени у дверей, цокольная полоса, карниз цоколя
    box('stone', F, -10.6, 10.6, -0.1, 1.5, -0.6, -0.12)
    box('stone', F, -10.6, 10.6, -0.1, 0.8, -0.6, 0.0)
    box('stone', F, -12.9, 12.9, -0.1, 0.12, GROUND, 0.5)
    box('trim', F, -13.0, 13.0, -0.12, 0.42, 4.75, PB)
    box('trim', F, -12.9, 12.9, -0.1, 0.2, 4.55, 4.75)
    # терраса
    box('stone', F, -12.8, 12.8, -14.4, 0.2, PB - 0.06, PB, bottom=False)
    # крылья с маршами: ступени идут вверх к краям
    N = 11
    for s in (-1, 1):
        u0, u1 = sorted((s * 12.8, s * HW))
        lo, hi = (s * 12.8, s * HW)
        z_lo, z_hi = 0.45, PB
        prism_uz('wall2', Frame(F.o, F.u * s, F.n), [(12.8, GROUND), (HW, GROUND), (HW, z_hi), (12.8, z_lo)], -3.3, 0.0)
        box('wall2', F, u0, u1, -14.4, -3.3, GROUND, PB - 0.04, bottom=False)
        face('wall2', [F.p(s * 12.8, 0, z_lo), F.p(s * 12.8, -3.3, z_lo), F.p(s * 12.8, -3.3, PB), F.p(s * 12.8, 0, PB)], F.U() * -s)
        box('stone', F, u0, u1, -14.4, -3.3, PB - 0.06, PB, bottom=False)
        for i in range(N):
            ua = 12.8 + (HW - 12.8) * i / N
            ub = 12.8 + (HW - 12.8) * (i + 1) / N
            zt = z_lo + (z_hi - z_lo) * (i + 1) / N
            a, b = sorted((s * ua, s * ub))
            box('stone', F, a, b, -3.1, -0.15, zt - 0.5, zt)
        bal_slope(Frame(F.o, F.u * s, F.n), 12.8, z_lo, HW, z_hi, -0.13)
        bal_slope(Frame(F.o, F.u * s, F.n), 12.8, z_lo, HW, z_hi, -3.2)
        Fs = Frame(F.o, F.u * s, F.n)
        # перила по внешнему краю площадки крыла (вдоль корпуса)
        Fq = Frame(F.p(s * HW, 0, 0).xy, -F.n, F.u * s)
        cstep(Fq, 3.4, 14.2, -0.14, PB)
        # пьедестал и фонарь у подножия марша
        pu = s * 11.6
        box('trim', F, pu - 0.55, pu + 0.55, 0.5, 1.6, -0.3, 1.9)
        box('trim', F, pu - 0.65, pu + 0.65, 0.4, 1.7, 1.9, 2.1)
        base = F.p(pu, 1.05, 2.1)
        beam('metal', base, base + UP * 3.4, 0.22)
        for dx in (-0.55, 0.55):
            beam('metal', base + UP * 3.4, base + UP * 3.7 + F.U() * dx * s, 0.07)
        for k in (-1, 0, 1):
            c = base + F.U() * k * 0.5 * s + UP * 3.85
            beam('trim', c - UP * 0.2, c + UP * 0.25, 0.3)
        beam('trim', base + UP * 4.3, base + UP * 4.45, 0.3)
    # боковые стены «второго этажа» портика
    for s in (-1, 1):
        Fs = Frame(F.p(s * 12.8, 0, 0).xy, -F.n, F.u * s)
        hs = [(7.2, 9.4, PB + 1.0, PB + 4.4)]
        wall(Fs, 0, 14.4, PB, EAVE - 0.6, 0, hs)
        lite_window(Fs, 8.3, PB + 1.0, 2.2, 3.4, 0)
        for d in (3.0, 5.0):
            pilaster(Fs, d, 0, PB, COLH + 0.6, w=0.7)
    # колонны: восемь, у углов — парные
    axes = (-11.6, -10.0, -6.0, -2.0, 2.0, 6.0, 10.0, 11.6)
    DC = -1.0
    for u in axes:
        column(F.p(u, DC, PB), COLH, COLD)
    # балюстрада между колоннами
    pts = [-12.6] + [x for u in axes for x in (u - 0.7, u + 0.7)] + [12.6]
    for i in range(0, len(pts), 2):
        if pts[i + 1] - pts[i] > 0.4:
            cstep(F, pts[i], pts[i + 1], DC, PB, step=0.36)
    # задняя стена портика: три арочных окна, малые окна и барельефы
    BK = -5.0
    holes = []
    cen = [(-8.0, 2.4, 1.15), (0.0, 3.0, 1.45), (8.0, 2.4, 1.15)]
    za = PB + 1.0
    for cu, w, rx in cen:
        holes.append((cu - w / 2 - 0.2, cu + w / 2 + 0.2, za, za + 3.0 + 1.0))
    for cu in (-4.0, 4.0):
        holes.append((cu - 0.75, cu + 0.75, za + 0.6, za + 3.0))
    wall(F, -12.4, 12.4, PB, ENT0, BK, holes, reveal=0.3)
    for cu, w, rx in cen:
        arch_fill(F, cu, w / 2 + 0.2, 1.0, za + 3.0, BK, m='wall', rev=0.3)
        archivolt(F, cu, w / 2 + 0.2, 1.0, za + 3.0, BK, 0.2)
    for cu in (-4.0, 4.0):
        glazing(F, cu - 0.75, cu + 0.75, za + 0.6, za + 3.0, BK, cols=2, rows=(0.66,), reveal=0.3)
        box('trim', F, cu - 0.95, cu + 0.95, BK, BK + 0.12, za + 3.0, za + 3.2)
    # большие окна с лунетами: проём с полуэллиптическим верхом
    zs = za + 3.0
    for cu, w, rx0 in cen:
        rx, ry = w / 2 + 0.2, 1.0
        glazing(F, cu - rx, cu + rx, za, zs, BK, cols=3 if w > 2.5 else 2, rows=(0.72,), reveal=0.3)
        arch_glass(F, cu, rx, ry, zs, zs, BK - 0.3 + 0.02, spokes=3)
        box('trim', F, cu - rx - 0.1, cu + rx + 0.1, BK, BK + 0.16, za - 0.15, za)
    # барельефы-маски между окнами
    for cu in (-4.0, 4.0):
        box('trim', F, cu - 1.3, cu + 1.3, BK, BK + 0.1, zs + 0.6, zs + 2.5)
        box('wall2', F, cu - 1.1, cu + 1.1, BK + 0.1, BK + 0.16, zs + 0.8, zs + 2.3)
        box('trim', F, cu - 0.55, cu + 0.55, BK + 0.1, BK + 0.3, zs + 1.0, zs + 2.1)
        box('trim', F, cu - 0.9, cu - 0.55, BK + 0.1, BK + 0.2, zs + 0.9, zs + 1.9)
        box('trim', F, cu + 0.55, cu + 0.9, BK + 0.1, BK + 0.2, zs + 0.9, zs + 1.9)
    # потолок портика, антаблемент
    box('trim', F, -12.4, 12.4, BK, -0.3, ENT0 - 0.02, ENT0 + 0.14)
    for u in (-6.0, 0.0, 6.0):
        c = F.p(u, -2.8, ENT0 - 0.02)
        beam('trim', c, c - UP * 0.25, 0.7)
    def ring(z0, z1, off, m):
        h = HALF + off
        box(m, F, -h, h, -1.7, -0.15 + off, z0, z1)
        for s in (-1, 1):
            u0, u1 = sorted((s * (HALF - 0.9), s * h))
            box(m, F, u0, u1, -14.4, -0.15 + off, z0, z1)
    ring(ENT0, ENT0 + 0.85, 0.0, 'trim')            # архитрав
    ring(ENT0 + 0.85, ENT0 + 0.95, 0.06, 'trim')
    ring(ENT0 + 0.95, EAVE - 1.0, 0.0, 'wall')      # фриз
    ring(EAVE - 1.0, EAVE - 0.82, 0.14, 'trim')
    ring(EAVE - 0.82, EAVE - 0.55, 0.14, 'trim')    # зубчики ставятся ниже
    ring(EAVE - 0.55, EAVE - 0.33, 0.55, 'trim')
    ring(EAVE - 0.33, EAVE, 0.85, 'trim')
    ft = -0.15 + 0.14
    k = -HALF + 0.2
    while k < HALF:
        box('trim', F, k, k + 0.3, ft, ft + 0.22, EAVE - 0.83, EAVE - 0.56, bottom=False)
        k += 0.8
    for s in (-1, 1):
        Fs = Frame(F.p(s * (HALF + 0.14), 0, 0).xy, -F.n, F.u * s)
        d = 0.9
        while d < 14.0:
            box('trim', Fs, d, d + 0.3, 0, 0.2, EAVE - 0.83, EAVE - 0.56, bottom=False)
            d += 0.8
    # фронтон
    ov = OV
    prism_uz('wall', F, [(-HALF - 0.2, EAVE), (HALF + 0.2, EAVE), (0, EAVE + (HALF + 0.2) * SL)], -1.25, -0.45)
    bt = 0.55
    for s in (-1, 1):
        prism_uz('trim', F, [(s * ov, EAVE), (0, APEX), (0, APEX - bt), (s * (ov - bt / SL), EAVE)], -1.0, 0.7)
        prism_uz('trim', F, [(s * ov, EAVE - 0.02), (0, APEX + 0.12), (0, APEX), (s * ov, EAVE - 0.14)], -1.0, 0.82)
        k = 1
        while k * 0.7 < ov - 1.5:
            u = s * k * 0.7
            zt = APEX - abs(u) * SL - bt
            box('trim', F, u - 0.15, u + 0.15, -0.3, 0.52, zt - 0.3, zt + 0.02, bottom=False)
            k += 1
    # кровля портика (двускатная) и торец
    for s in (-1, 1):
        face('roof', [F.p(s * (ov + 0.05), 0.8, EAVE + 0.02), F.p(0, 0.8, APEX + 0.13),
                      F.p(0, -15.0, APEX + 0.13), F.p(s * (ov + 0.05), -15.0, EAVE + 0.02)], F.U() * s + UP)
    prism_uz('wall', F, [(-ov, EAVE), (ov, EAVE), (0, APEX + 0.1)], -15.0, -14.9)
    # полоски стены корпуса справа и слева от портика (выше крыльев)
    for s in (-1, 1):
        u0, u1 = sorted((s * 12.8, s * HW))
        holes = [tuple(sorted((s * 14.2 - 0.6, s * 14.2 + 0.6))) + (PB + 1.3, PB + 4.0)]
        holes.append(tuple(sorted((s * 14.2 - 0.6, s * 14.2 + 0.6))) + (PB + 5.6, PB + 8.4))
        wall(F, u0, u1, PB, EAVE - 0.6, -14.4, holes)
        for hh in holes:
            lite_window(F, (hh[0] + hh[1]) / 2, hh[2], 1.2, hh[3] - hh[2], -14.4)
        cornice(F, u0, u1, -14.4, EAVE - 0.6, ext=0.5)

def sculptures():
    F = FP
    # женская фигура на коньке фронтона
    base = F.p(0, -0.9, APEX + 0.13)
    box('trim', F, -1.0, 1.0, -1.9, 0.1, APEX + 0.0, APEX + 1.3)
    box('trim', F, -1.15, 1.15, -2.05, 0.25, APEX + 1.3, APEX + 1.5)
    b = base + UP * 1.5
    k = 1.3
    lathe('wood', b, [(r * k, z * k) for r, z in ((0.6, 0), (0.62, 0.3), (0.55, 1.3), (0.4, 1.9), (0.34, 2.35), (0.22, 2.55))], 8, cap=True)
    lathe('wood', b, [(r * k, z * k) for r, z in ((0.12, 2.5), (0.2, 2.65), (0.21, 2.9), (0.12, 3.12))], 8, cap=True)
    beam('wood', b + UP * 2.3 * k + F.U() * 0.15 * k, b + UP * 3.7 * k + F.U() * 0.55 * k, 0.24)
    ring = b + UP * 4.0 * k + F.U() * 0.6 * k
    for a in range(6):
        t0, t1 = a * math.pi / 3, (a + 1) * math.pi / 3
        beam('wood', ring + F.U() * math.cos(t0) * 0.42 + UP * math.sin(t0) * 0.42,
             ring + F.U() * math.cos(t1) * 0.42 + UP * math.sin(t1) * 0.42, 0.1)
    # парные трофеи на углах фронтона
    for s in (-1, 1):
        ov_ = OV - 0.5
        box('trim', F, s * ov_ - 0.7, s * ov_ + 0.7, -1.2, 0.2, EAVE + 0.1, EAVE + 1.1)
        c = F.p(s * ov_, -0.5, EAVE + 1.1)
        lathe('wood', c, [(0.5, 0), (0.45, 0.5), (0.3, 1.2), (0.12, 1.7)], 8, cap=True)
        beam('wood', c + UP * 0.3 + F.U() * -0.4, c + UP * 2.0 + F.U() * 0.5, 0.12)
        beam('wood', c + UP * 0.3 + F.U() * 0.4, c + UP * 1.8 + F.U() * -0.5, 0.12)
        box('wood', F, s * ov_ - 0.35, s * ov_ + 0.35, -0.75, -0.25, EAVE + 1.4, EAVE + 2.1)

# ---------------------------------------------------------------- корпус
def pil2(F, cu, z0, z1, w=0.9):
    box('trim', F, cu - w / 2 - 0.06, cu + w / 2 + 0.06, 0, 0.2, z0, z0 + 0.4, bottom=False)
    box('trim', F, cu - w / 2, cu + w / 2, 0, 0.16, z0 + 0.4, z1 - 1.1, bottom=False)
    prism_uz('trim', F, [(cu - w / 2, z1 - 1.1), (cu + w / 2, z1 - 1.1), (cu + w / 2 + 0.14, z1 - 0.2), (cu - w / 2 - 0.14, z1 - 0.2)], 0, 0.22)
    box('trim', F, cu - w / 2 - 0.2, cu + w / 2 + 0.2, 0, 0.26, z1 - 0.2, z1, bottom=False)

def long_facade(F, Lw, bays, rich):
    pitch = Lw / bays
    rows = [(1.3, 2.0, 1.5), (5.5, 2.6, 1.6), (9.3, 2.6, 1.6), (12.7, 1.7, 1.4)]
    lower, upper = [], []
    for i in range(bays):
        cu = pitch * (i + 0.5)
        for k, (za, h, w) in enumerate(rows):
            (lower if k == 0 else upper).append((cu - w / 2, cu + w / 2, za, za + h))
    wall(F, 0, Lw, GROUND, 4.6, 0, [h for h in lower], m='wall2')
    wall(F, 0, Lw, 4.6, EAVE - 0.6, 0, upper)
    for i in range(bays):
        cu = pitch * (i + 0.5)
        for k, (za, h, w) in enumerate(rows):
            lite_window(F, cu, za, w, h, 0, jambs=(rich and k in (1, 2)), simple=not rich)
    box('stone', F, 0, Lw, -0.3, 0.1, GROUND, 0.3)
    band(F, 0, Lw, 0, 4.4, 4.7, 0.16)
    for i in range(bays + 1):
        cu = pitch * i
        if rich:
            pil2(F, cu, 4.7, EAVE - 0.6, 0.9)
        else:
            box('trim', F, cu - 0.4, cu + 0.4, 0, 0.13, 4.7, EAVE - 1.5)
            box('trim', F, cu - 0.5, cu + 0.5, 0, 0.17, EAVE - 1.5, EAVE - 0.6)
    cornice(F, 0, Lw, 0, EAVE - 0.6, ext=0.55)
    band(F, 0, Lw, 0, 8.55, 8.75, 0.1)

def build_body():
    FNW = Frame(FP.p(HW, -PD, 0).xy, -FP.n, FP.u)
    FSE = Frame(FP.p(-HW, -PD - L, 0).xy, FP.n, -FP.u)
    FSW = Frame(FP.p(HW, -PD - L, 0).xy, -FP.u, -FP.n)
    _a = _cnt(); long_facade(FNW, L, 13, True); _b = _cnt(); long_facade(FSE, L, 13, False); _c = _cnt()
    print('NW', _b - _a, 'SE', _c - _b)
    # торец (юго-запад): простой
    pitch = WD / 7
    holes, wins = [], []
    for i in range(7):
        cu = pitch * (i + 0.5)
        for za, h, w in ((1.3, 2.0, 1.5), (5.5, 2.6, 1.6), (9.3, 2.6, 1.6), (12.7, 1.7, 1.4)):
            wins.append((cu, za, w, h)); holes.append((cu - w / 2, cu + w / 2, za, za + h))
    wall(FSW, 0, WD, GROUND, EAVE - 0.6, 0, holes)
    for cu, za, w, h in wins:
        lite_window(FSW, cu, za, w, h, 0, simple=True)
    box('stone', FSW, 0, WD, -0.3, 0.1, GROUND, 0.3)
    band(FSW, 0, WD, 0, 4.4, 4.7, 0.14)
    cornice(FSW, 0, WD, 0, EAVE - 0.6, ext=0.55)
    # вальмовая кровля корпуса
    hip_roof(FNW, 0, L, 0, -WD, EAVE, 5.0, ov=0.7)
    # слуховые окна на длинных скатах
    zr = lambda d: EAVE + 5.0 * (0.7 - d) / (WD / 2 + 0.7) if d > -WD / 2 else EAVE + 5.0 * (0.7 - (-WD - d)) / (WD / 2 + 0.7)
    for cu in (10.0, 20.0, 30.0, 40.0):
        dormer(FNW, cu, -1.9, zr(-1.9) - 0.15, r=0.7, depth=2.6)
    for cu in (10.0, 20.0, 30.0, 40.0):
        dormer(FSE, L - cu, -1.9, zr(-1.9) - 0.15, r=0.7, depth=2.6)
    chimney(FNW, 41.0, -5.5, EAVE + 1.5, EAVE + 5.5, w=1.4)
    # объём сцены, возвышающийся над кровлей
    F = FP
    SWD = 10.3
    D0, D1 = -11.5, -56.5
    ZE = 23.0                      # карниз сцены
    ZA = ZE + SWD * 0.30
    for s in (-1, 1):
        Fs = Frame(F.p(s * SWD, D0, 0).xy, -F.n, F.u * s)
        Ls = D0 - D1
        hs = []
        for cu in (7.5, 14.5):
            hs.append((cu - 1.0, cu + 1.0, 19.6, 20.9))
        wall(Fs, 0, Ls, 15.0, ZE, 0, [])
        # веерные окна и слепые арки
        for cu in (7.5, 14.5, 21.5, 28.5, 35.5):
            blind = cu > 15
            ry = 1.3
            zs = 19.8
            arc = [(cu + 1.0 * math.cos(math.pi * k / 10), zs + ry * math.sin(math.pi * k / 10)) for k in range(11)]
            if not blind:
                face('glass', [Fs.p(cu - 1.0, 0.04, zs), Fs.p(cu + 1.0, 0.04, zs)] + [Fs.p(u, 0.04, z) for u, z in arc], Fs.N())
                for a in (0.25, 0.5, 0.75):
                    beam('trim', Fs.p(cu, 0.06, zs), Fs.p(cu + 1.0 * math.cos(math.pi * a), 0.06, zs + ry * math.sin(math.pi * a)), 0.06, 0.1)
            else:
                face('wall2', [Fs.p(cu - 1.0, 0.03, zs), Fs.p(cu + 1.0, 0.03, zs)] + [Fs.p(u, 0.03, z) for u, z in arc], Fs.N())
            for k in range(10):
                (ua, za_), (ub, zb_) = arc[k], arc[k + 1]
                beam('trim', Fs.p(ua, 0.06, za_), Fs.p(ub, 0.06, zb_), 0.12, 0.12)
        cornice(Fs, 0, Ls, 0, ZE - 0.6, ext=0.5)
    # фронтон сцены (над портиком) и тыльный
    prism_uz('wall', F, [(-SWD, ZE), (SWD, ZE), (0, ZA)], D0 - 0.1, D0 + 0.05)
    prism_uz('wall', F, [(-SWD, ZE), (SWD, ZE), (0, ZA)], D1, D1 + 0.15)
    wall(F, -SWD, SWD, 15.0, ZE, D0 + 0.05, [])
    # фронтон сцены: пояс, полукруглое окно
    zs = ZE + 0.3
    rx, ry = 2.4, 1.7
    arc = [(rx * math.cos(math.pi * k / 12), zs + ry * math.sin(math.pi * k / 12)) for k in range(13)]
    face('trim', [F.p(-rx - 0.25, D0 + 0.07, zs - 0.15), F.p(rx + 0.25, D0 + 0.07, zs - 0.15)] +
         [F.p(u * (1 + 0.1), D0 + 0.07, zs - 0.15 + (z - zs + 0.15) * 1.14) for u, z in arc], F.N())
    face('glass', [F.p(-rx, D0 + 0.1, zs), F.p(rx, D0 + 0.1, zs)] + [F.p(u, D0 + 0.1, z) for u, z in arc], F.N())
    for k in range(1, 8):
        a = math.pi * k / 8
        beam('trim', F.p(0, D0 + 0.12, zs), F.p(rx * math.cos(a), D0 + 0.12, zs + ry * math.sin(a)), 0.07, 0.09)
    for k in range(12):
        (ua, za_), (ub, zb_) = arc[k], arc[k + 1]
        beam('trim', F.p(ua, D0 + 0.12, za_), F.p(ub, D0 + 0.12, zb_), 0.12, 0.1)
    box('trim', F, -rx - 0.3, rx + 0.3, D0, D0 + 0.12, zs - 0.12, zs)
    for s in (-1, 1):
        face('roof', [F.p(s * (SWD + 0.55), D0 + 0.55, ZE - 0.1), F.p(0, D0 + 0.55, ZA + 0.12),
                      F.p(0, D1 - 0.4, ZA + 0.12), F.p(s * (SWD + 0.55), D1 - 0.4, ZE - 0.1)], F.U() * s + UP)
        prism_uz('trim', F, [(s * (SWD + 0.55), ZE - 0.1), (0, ZA + 0.12), (0, ZA - 0.2), (s * (SWD + 0.1), ZE - 0.1)], D0 - 0.05, D0 + 0.6)
    # люк и труба на крыше
    box('roof', F, 2.5, 7.0, -30.0, -26.0, ZE - 0.5, ZE + 1.5)

def build_misc():
    pass

_c0 = _cnt(); build_portico(); _c1 = _cnt(); sculptures(); _c2 = _cnt(); build_body(); _c3 = _cnt()
print('ПОРТИК', _c1 - _c0, 'СКУЛЬПТУРЫ', _c2 - _c1, 'КОРПУС', _c3 - _c2)

finish('theatre_lunacharsky', __file__, 25000)
