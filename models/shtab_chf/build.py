# Штаб Краснознамённого Черноморского флота (Севастополь, ул. Ленина / пл. Суворова,
# 1958–59, инж. Ю. Д. Фердман и В. И. Ежов) — модель с нуля.
#
#   blender -b --python models/shtab_chf/build.py -- [glb]
#
# План снят с контура OSM way 92717230: он ложится на две перпендикулярные оси
# (дом повёрнут на 4,1° от меридиана), поэтому всё строится в «местных»
# координатах (u — на восток вдоль северного фасада, v — на юг вдоль крыльев), а
# рамки фасадов задаются по этим осям. Подробности и догадки — в NOTES.md.
# Ноль высоты — подножие парадной лестницы у северного портика; пол первого этажа
# на высоте ZF = 2,2 м.
import sys, os, math
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

# ---------------------------------------------------------------- местные оси
P13, P14 = (-139.7, 383.4), (-102.2, 380.7)       # северный фасад по OSM
_d = (P14[0] - P13[0], P14[1] - P13[1])
_l = math.hypot(*_d)
EUW = (_d[0] / _l, _d[1] / _l)                    # u в мире (x, z)
EVW = (-EUW[1], EUW[0])                           # v в мире (юг)

def LP(u, v):
    """Местная точка → мир (x, z)."""
    return (P13[0] + u * EUW[0] + v * EVW[0], P13[1] + u * EUW[1] + v * EVW[1])

UC = 18.75                                        # середина северного фасада
X0, Z0 = LP(UC, -4.8)                             # подножие лестницы
origin(X0, Z0)

_o = W(*LP(0, 0))
_eu = (W(*LP(1, 0)) - _o).normalized()
_ev = (W(*LP(0, 1)) - _o).normalized()
FL = Frame(_o, _eu, _ev)                          # FL.p(u, v, z) — местные координаты

def fr(a, b, out):
    """Рамка фасада по ребру a→b (местные точки), out — вектор наружу (местный)."""
    du = (b[0] - a[0], b[1] - a[1]); L = math.hypot(*du)
    uu = (du[0] / L, du[1] / L)
    ol = math.hypot(*out); on = (out[0] / ol, out[1] / ol)
    o = FL.p(a[0], a[1], 0).xy
    u = _eu * uu[0] + _ev * uu[1]
    n = _eu * on[0] + _ev * on[1]
    return Frame(o, u, n), L

# ---------------------------------------------------------------- цвета и мерки
COL['wall']  = ((0.89, 0.86, 0.76), 0.92)     # светлый кремово-слоновый известняк
COL['wall2'] = ((0.80, 0.77, 0.68), 0.92)     # тень лоджии
COL['trim']  = ((0.91, 0.89, 0.82), 0.88)
COL['stone'] = ((0.52, 0.51, 0.48), 0.92)     # серый цоколь
COL['roof']  = ((0.42, 0.40, 0.37), 0.9)      # плоская кровля #6a675e
COL['glass'] = ((0.10, 0.13, 0.17), 0.15)
COL['metal'] = ((0.10, 0.11, 0.12), 0.5)

GROUND = -6.0         # стены уходят под землю: участок на склоне, с подпорными стенами
ZF = 2.2              # пол первого этажа
ZB = 3.0              # верх серого цоколя
SILLS = (3.6, 7.5, 11.4, 15.3)     # подоконники четырёх рядов окон
WH = 2.1              # высота окна
ZCOL = 17.6           # верх колонн / низ архитрава
ZFR = 18.4            # низ фриза
ZCOR = 19.6           # низ венчающего карниза
ZROOF = 20.2          # плоскость кровли
ZPAR = 21.3           # верх парапета
ZATT = 23.1           # верх аттика над колоннадой

# ---------------------------------------------------------------- мелкие детали
def wall_cols(F, u0, u1, z0, z1, d, cols, m='wall', reveal=0.24, rm='trim'):
    """Стена с проёмами, разрезанная на простенки и столбцы — втрое меньше
    треугольников, чем сетка kit.wall. cols = [(ua, ub, [(za, zb), ...]), ...]."""
    cols = sorted(cols)
    cur = u0
    def quad(ua, ub, za, zb):
        face(m, [F.p(ua, d, za), F.p(ub, d, za), F.p(ub, d, zb), F.p(ua, d, zb)], F.N())
    for ua, ub, hs in cols:
        if ua > cur + 1e-6:
            quad(cur, ua, z0, z1)
        z = z0
        for za, zb in sorted(hs):
            if za > z + 1e-6:
                quad(ua, ub, z, za)
            z = zb
            r = d - reveal
            face(rm, [F.p(ua, d, za), F.p(ua, r, za), F.p(ua, r, zb), F.p(ua, d, zb)], F.U())
            face(rm, [F.p(ub, d, za), F.p(ub, r, za), F.p(ub, r, zb), F.p(ub, d, zb)], -F.U())
            face(rm, [F.p(ua, d, zb), F.p(ub, d, zb), F.p(ub, r, zb), F.p(ua, r, zb)], -UP)
            face(rm, [F.p(ua, d, za), F.p(ub, d, za), F.p(ub, r, za), F.p(ua, r, za)], UP)
        if z1 > z + 1e-6:
            quad(ua, ub, z, z1)
        cur = ub
    if u1 > cur + 1e-6:
        quad(cur, u1, z0, z1)

def win(F, cu, za, w, h, d):
    """Окно без избытка треугольников: стекло, крест, подоконник."""
    ua, ub, zb = cu - w / 2, cu + w / 2, za + h
    g = d - 0.20
    face('glass', [F.p(ua, g, za), F.p(ub, g, za), F.p(ub, g, zb), F.p(ua, g, zb)], F.N())
    f = g + 0.02
    zt = za + h * 0.64
    for u0, u1, z0, z1 in ((cu - 0.03, cu + 0.03, za, zb), (ua, ub, zt - 0.03, zt + 0.03)):
        face('trim', [F.p(u0, f, z0), F.p(u1, f, z0), F.p(u1, f, z1), F.p(u0, f, z1)], F.N())
    box('trim', F, ua - 0.12, ub + 0.12, d, d + 0.14, za - 0.14, za, bottom=False)
    return (ua, ub, za, zb)

def pilaster(F, u, d, z0, z1, w=0.62, pr=0.16):
    box('trim', F, u - w / 2, u + w / 2, d, d + pr, z0, z1, bottom=False)
    box('trim', F, u - w / 2 - 0.1, u + w / 2 + 0.1, d, d + pr + 0.07, z1 - 0.28, z1, bottom=False)

def crown(F, u0, u1, d, ze=0.0, parapet=True):
    """Венчание крыла: пояс-архитрав, фриз, трёхполочный карниз и парапет.
    ze — крошечный сдвиг по высоте, чтобы карнизы соседних фасадов не лежали в одной плоскости."""
    box('trim', F, u0, u1, d - 0.02, d + 0.10, ZCOL, ZFR + ze, bottom=False)
    cornice(F, u0, u1, d, ZCOR + ze, ext=0.5)
    if parapet:
        box('wall', F, u0 - 0.2, u1 + 0.2, d - 0.55, d + 0.22, ZROOF + ze, ZPAR + ze, bottom=False)
        box('trim', F, u0 - 0.3, u1 + 0.3, d - 0.62, d + 0.32, ZPAR + ze, ZPAR + 0.14 + ze, bottom=False)

def facade(a, b, out, kind='bays', short=2.6, ze=0.0):
    """Обычный фасад крыла по ребру a→b (местные точки)."""
    F, L = fr(a, b, out)
    box('stone', F, 0, L, -0.45, 0.07, GROUND, ZB, bottom=False)           # цоколь
    if L < short:                                                            # короткий уступ
        wall(F, 0, L, ZB, ZCOR, 0, [])
        crown(F, 0, L, 0, ze)
        return
    pw = 2.1 if kind == 'piers' else 0.0
    nb = max(1, round((L - 2 * pw) / 3.6))
    step = (L - 2 * pw) / nb
    ww = min(1.5, step - 0.9)
    holes, cols = [], []
    for i in range(nb):
        cu = pw + step * (i + 0.5)
        cols.append((cu - ww / 2, cu + ww / 2, [(za, za + WH) for za in SILLS]))
        for za in SILLS:
            holes.append((cu - ww / 2, cu + ww / 2, za, za + WH))
    wall_cols(F, 0, L, ZB, ZCOR, 0, cols)
    band(F, 0, L, 0, ZB, ZB + 0.12, 0.10)
    for h in holes:
        win(F, (h[0] + h[1]) / 2, h[2], h[1] - h[0], WH, 0)
    xs = [pw + step * i for i in range(nb + 1)]
    if kind == 'piers':                                                    # угловые лопатки-ризалиты
        box('trim', F, 0, pw, 0, 0.30, ZB + 0.12, ZCOL, bottom=False)
        box('trim', F, L - pw, L, 0, 0.30, ZB + 0.12, ZCOL, bottom=False)
        box('trim', F, -0.05, pw + 0.1, 0, 0.38, ZCOL - 0.5, ZCOL, bottom=False)
        box('trim', F, L - pw - 0.1, L + 0.05, 0, 0.38, ZCOL - 0.5, ZCOL, bottom=False)
        xs = xs[1:-1]
    else:
        xs = [x for x in xs]
    for x in xs:
        pilaster(F, x, 0, ZB + 0.12, ZCOL)
    crown(F, 0, L, 0, ze)

# ---------------------------------------------------------------- колонны
def column(F, cu, d, z0, H, D):
    """Дорическая колонна: подробная (trim) и дальняя (trim_s, внутри подробной)."""
    R = D / 2
    base = F.p(cu, d, z0)
    prof = [(1.12 * R, 0.0), (1.12 * R, 0.2), (1.0 * R, 0.32)]
    zs0, zs1 = 0.32, H - 0.85
    for i in range(7):
        t = i / 6
        prof.append((R * (1 - 0.15 * t ** 1.5 + 0.015 * math.sin(math.pi * t)), zs0 + (zs1 - zs0) * t))
    prof += [(0.80 * R, H - 0.80), (0.84 * R, H - 0.68), (1.06 * R, H - 0.56),
             (1.22 * R, H - 0.42), (1.26 * R, H - 0.30)]
    lathe('trim', base, prof, 16, cap=True)
    lo = [(0.95 * R, 0.0), (0.80 * R, H - 0.8), (1.14 * R, H - 0.40)]
    lathe('trim_s', base, lo, 6, cap=True)
    a = 1.38 * R
    box('trim_s', F, cu - a, cu + a, d - a, d + a, z0 + H - 0.30, z0 + H, bottom=False)

# ---------------------------------------------------------------- план
VS = 67.65
BOW = [(25.8, 20.4), (24.8, 22.0), (23.4, 23.4), (21.5, 24.4), (19.5, 24.7),
       (17.4, 24.4), (15.5, 23.6), (14.0, 22.2), (13.0, 20.4)]
PLAN = [(0, 0), (37.5, 0), (37.5, 8.0), (46.6, 8.0), (46.6, 16.1), (47.8, 16.1), (47.8, VS),
        (32.1, VS), (32.1, 62.6), (30.3, 62.6), (30.3, 56.9), (32.1, 56.9), (32.1, 20.4)] \
       + BOW + [(6.1, 20.4), (6.1, 56.9), (7.9, 56.9), (7.9, 62.6), (6.1, 62.6), (6.1, VS),
                (-9.4, VS), (-9.4, 17.0), (-8.0, 17.0), (-8.0, 8.6), (0, 8.6)]

def build_walls():
    n = len(PLAN)
    for i in range(n):
        a, b = PLAN[i], PLAN[(i + 1) % n]
        du, dv = b[0] - a[0], b[1] - a[1]
        out = (dv, -du)                                  # план обходится по часовой: наружу = вправо
        if i == 0:
            continue                                     # северный фасад — отдельно (колоннада)
        kind = 'piers' if (abs(dv) < 1e-6 and abs(du) > 14 and a[1] == VS) else 'bays'
        facade(a, b, out, kind, short=(1.0 if (a in BOW and b in BOW) else 2.6), ze=0.003 * (i % 9))

def build_colonnade():
    F, L = fr((0, 0), (37.5, 0), (0, -1))                # u на восток, n на север
    NC, D = 10, 1.7
    PIER = 2.4
    u_first, u_last = PIER + D / 2 + 0.05, 37.5 - PIER - D / 2 - 0.05
    p = (u_last - u_first) / (NC - 1)
    DC = -1.0                                            # ось колонн
    REC = -4.0                                           # стена лоджии
    # подиум и лестница
    box('stone', F, 0, 37.5, REC, 0.45, GROUND, ZF - 0.1, bottom=False)
    box('trim', F, -0.1, 37.6, REC, 0.55, ZF - 0.1, ZF, bottom=False)
    n, run = 11, 0.40
    rise = ZF / n
    sw0, sw1 = UC - 5.7, UC + 5.7
    for i in range(n):
        top = ZF - rise * (i + 1)
        box('stone', F, sw0, sw1, 0.55, 0.55 + run * (i + 1) + 0.02, top - rise - (0 if i < n - 1 else 3), top, bottom=False)
    Fs0 = Frame(F.p(sw0 - 0.55, 0, 0).xy, F.n, F.u)      # щёки лестницы: профиль (d, z) вдоль u
    Fs1 = Frame(F.p(sw1, 0, 0).xy, F.n, F.u)
    for Fs in (Fs0, Fs1):
        prism_uz('stone', Fs, [(0.55, -2.0), (0.55 + run * n + 0.2, -2.0), (0.55 + run * n + 0.2, 0.8), (0.55, ZF + 0.95)], 0, 0.55)
    # лоджия: стена с окнами, потолок, торцы
    centres = [u_first + p * (k + 0.5) for k in range(NC - 1)]
    holes, cols = [], []
    for k, cu in enumerate(centres):
        w0 = 1.2 if k == 4 else 0.8               # средний пролёт — шире, с главным входом
        hs = [(ZF, ZF + 3.7)] if k == 4 else [(SILLS[0], SILLS[0] + WH)]
        hs += [(za, za + WH) for za in SILLS[1:]]
        cols.append((cu - w0, cu + w0, hs))
        for za, zb in hs:
            holes.append((cu - w0, cu + w0, za, zb))
    wall_cols(F, PIER, 37.5 - PIER, ZF, ZCOL, REC, cols, m='wall2')
    for h in holes:
        if h[3] - h[2] > 3:                              # главный вход
            g = REC - 0.20
            face('wood', [F.p(h[0], g, h[2]), F.p(h[1], g, h[2]), F.p(h[1], g, h[2] + 2.7), F.p(h[0], g, h[2] + 2.7)], F.N())
            face('glass', [F.p(h[0], g, h[2] + 2.7), F.p(h[1], g, h[2] + 2.7), F.p(h[1], g, h[3]), F.p(h[0], g, h[3])], F.N())
            box('trim', F, (h[0] + h[1]) / 2 - 0.04, (h[0] + h[1]) / 2 + 0.04, g, g + 0.06, h[2], h[3], bottom=False)
            box('trim', F, h[0] - 0.3, h[1] + 0.3, REC, REC + 0.18, h[3], h[3] + 0.3, bottom=False)
        else:
            win(F, (h[0] + h[1]) / 2, h[2], h[1] - h[0], WH, REC)
    face('wall2', [F.p(PIER, REC, ZCOL), F.p(37.5 - PIER, REC, ZCOL), F.p(37.5 - PIER, 0, ZCOL), F.p(PIER, 0, ZCOL)], -UP)
    face('stone', [F.p(PIER, REC, ZF), F.p(37.5 - PIER, REC, ZF), F.p(37.5 - PIER, 0.45, ZF), F.p(PIER, 0.45, ZF)], UP)
    # глухие крайние устои колоннады
    for u0, u1 in ((0, PIER), (37.5 - PIER, 37.5)):
        i0, i1 = (u0 + 0.3, u1) if u0 == 0 else (u0, u1 - 0.3)   # не закрывать окна торцов
        box('wall', F, i0, i1, REC, 0.0, GROUND, ZCOR, bottom=False)
        box('stone', F, u0 + (0.3 if u0 == 0 else 0), u1 - (0.3 if u0 != 0 else 0), REC, 0.07, GROUND, ZB, bottom=False)
        band(F, u0, u1, 0, ZB, ZB + 0.12, 0.10)
        pilaster(F, (u0 + u1) / 2, 0, ZB + 0.12, ZCOL, w=1.0, pr=0.18)
    # колонны
    for k in range(NC):
        column(F, u_first + p * k, DC, ZF, ZCOL - ZF, D)
    # антаблемент: архитрав, фриз, карниз
    box('trim', F, 0, 37.5, DC - 1.0, 0.0, ZCOL, ZFR, bottom=False)
    box('wall', F, 0, 37.5, DC - 1.0, -0.12, ZFR, ZCOR, bottom=False)
    for k in range(NC + 1):                                # метопы-филёнки фриза
        u = (u_first + p * (k - 0.5)) if 0 < k < NC else None
        if u is not None:
            box('trim', F, u - 0.5, u + 0.5, -0.12, -0.04, ZFR + 0.18, ZCOR - 0.18, bottom=False)
    cornice(F, 0, 37.5, 0, ZCOR, ext=0.55)
    # аттик над колоннадой — выше крыльев, глухой
    box('wall', F, 0.0, 37.5, REC, -0.65, ZROOF, ZATT, bottom=False)
    box('trim', F, -0.2, 37.7, REC - 0.1, -0.45, ZATT, ZATT + 0.28, bottom=False)
    # парапет над крайними устоями у соседних крыльев
    return F

def build_roof():
    # плоская кровля по контуру плана (местные точки → мир → плоскость Blender)
    pts = [FL.p(u, v, ZROOF) for u, v in PLAN]
    face('roof', pts, UP)
    # шахта над колоннадой и небольшие надстройки
    box('wall', FL, 14.0, 24.0, 5.0, 11.0, ZROOF, ZROOF + 2.2, bottom=False)
    box('trim', FL, 13.8, 24.2, 4.8, 11.2, ZROOF + 2.2, ZROOF + 2.4, bottom=False)
    box('wall', FL, 38.0, 44.0, 22.0, 30.0, ZROOF, ZROOF + 1.8, bottom=False)
    box('wall', FL, -6.0, 3.0, 40.0, 46.0, ZROOF, ZROOF + 1.6, bottom=False)
    # флагшток и антенны (на аттике над колоннадой)
    for u, v, h in ((6.0, 2.5, 11.0), (30.0, 3.0, 7.0), (10.0, 6.0, 5.0), (27.0, 7.5, 6.0), (20.0, 9.0, 8.5)):
        z = ZATT + 0.28 if v < 4 else ZROOF
        beam('metal', FL.p(u, v, z), FL.p(u, v, z + h), 0.09)
    beam('metal', FL.p(6.0, 2.5, ZATT + 0.28), FL.p(6.0, 2.5, ZATT + 3.5), 0.16)

def build_courtyard():
    # площадка двора: уровень первого этажа
    prism_plan('stone', FL, [(6.1, 20.4), (32.1, 20.4), (32.1, VS + 0.6), (6.1, VS + 0.6)], GROUND, ZF)
    # южная ограда с воротами, видна с улицы
    v = VS + 0.35
    u0, u1 = 6.1, 32.1
    z = ZF
    box('stone', FL, u0, u1, v - 0.25, v + 0.25, GROUND, z + 0.7, bottom=False)       # низкий цокольный пояс
    box('trim', FL, u0, u1, v - 0.30, v + 0.30, z + 0.7, z + 0.85, bottom=False)
    n = 6
    for i in range(n + 1):
        u = u0 + (u1 - u0) * i / n
        big = i in (0, n)
        wdt = 0.9 if big else 0.7
        box('trim', FL, u - wdt / 2, u + wdt / 2, v - wdt / 2, v + wdt / 2, z + 0.85, z + 3.4 + (0.3 if big else 0), bottom=False)
        box('trim', FL, u - wdt / 2 - 0.1, u + wdt / 2 + 0.1, v - wdt / 2 - 0.1, v + wdt / 2 + 0.1, z + 3.4 + (0.3 if big else 0), z + 3.55 + (0.3 if big else 0), bottom=False)
    beam('metal', FL.p(u0, v, z + 3.1), FL.p(u1, v, z + 3.1), 0.06)
    beam('metal', FL.p(u0, v, z + 1.1), FL.p(u1, v, z + 1.1), 0.06)
    k = u0 + 0.5
    while k < u1 - 0.3:
        beam('metal', FL.p(k, v, z + 1.1), FL.p(k, v, z + 3.1), 0.04)
        k += 0.55

build_colonnade()
build_walls()
build_roof()
build_courtyard()

finish('shtab_chf', __file__, tri_budget=25000)
