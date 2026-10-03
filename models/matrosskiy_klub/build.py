# Матросский клуб (Драматический театр Черноморского флота им. Б. Лавренёва),
# площадь Ушакова, 1 — модель с нуля. Контур OSM way 91447933.
#
#   blender -b --python models/matrosskiy_klub/build.py -- [glb]
#
# План снят с контура OSM и спутника, фасады — с фото Викисклада (refs/).
# Строительная система координат (s, t): s — вдоль оси дома на юг-юго-запад от
# северного торца, t — поперёк, на восток-северо-восток от западной стены.
# Ноль высоты — тротуар у центра северного (парадного) фасада.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

COL['wall'] = ((0.90, 0.88, 0.81), 0.9)     # светлая штукатурка
COL['trim'] = ((0.95, 0.94, 0.90), 0.85)    # белёные колонны и лепнина
COL['wall2'] = ((0.74, 0.71, 0.63), 0.92)   # инкерманский камень башни
COL['wall3'] = ((0.52, 0.40, 0.14), 0.45)   # бронза шпиля и звезды
COL['roof'] = ((0.52, 0.58, 0.55), 0.6)     # серо-зелёная кровля
COL['stone'] = ((0.66, 0.64, 0.59), 0.9)
COL['wood'] = ((0.30, 0.19, 0.11), 0.6)

# ------------------------------------------------------------------ план
P0 = (-97.8, 1789.9)                         # СЗ угол контура
P14 = (-109.5, 1849.9)                       # ЮЗ угол
_l = math.hypot(P14[0] - P0[0], P14[1] - P0[1])
A = ((P14[0] - P0[0]) / _l, (P14[1] - P0[1]) / _l)       # вдоль оси (на юг)
E = (A[1], -A[0])                                         # поперёк (на восток)

def pt(s, t):
    return (P0[0] + A[0] * s + E[0] * t, P0[1] + A[1] * s + E[1] * t)

X0, Z0 = [round(v, 1) for v in pt(0.0, 12.0)]
origin(X0, Z0)

def dirW(ds, dt):
    return Vector((ds * A[0] + dt * E[0], -(ds * A[1] + dt * E[1]))).normalized()

def FR(s, t, u, n):
    """Рамка фасада: точка (s, t), направление вдоль (ds, dt), наружу (ds, dt)."""
    return Frame(W(*pt(s, t)), dirW(*u), dirW(*n))

def PL(s, t):
    v = W(*pt(s, t)); return (v.x, v.y)

FI = Frame(Vector((0, 0)), Vector((1, 0)), Vector((0, 1)))

GROUND = -4.5
BASE = 5.4            # верх цокольного этажа = пол галерей
CT = 16.2             # верх колонн = низ антаблемента
EN1 = 18.4            # верх венчающего карниза
PAR = 19.5            # верх балюстрады
SL = 61.1             # длина дома
TW = 24.0             # ширина дома
CS = [1.7 + 3.25 * k for k in range(8)]       # оси 8 колонн галерей
GAL = 26.0            # длина галерей
RC = (48.2, 32.7)     # центр полуротонды (s, t)
RR = 9.2              # радиус полуротонды

# ------------------------------------------------------------------ мелкие детали
def post(F, u, d, z0, z1, w=0.08, m='trim'):
    pts = [(u - w, d - w), (u + w, d - w), (u + w, d + w), (u - w, d + w)]
    c = F.p(u, d, 0)
    for i in range(4):
        p, q = pts[i], pts[(i + 1) % 4]
        face(m, [F.p(p[0], p[1], z0), F.p(q[0], q[1], z0), F.p(q[0], q[1], z1), F.p(p[0], p[1], z1)],
             F.p((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, 0) - c)

def dentil(F, u, d0, d1, z0, z1, w=0.12):
    """Зубец карниза: перед, два бока и низ (верх закрыт полкой)."""
    P = F.p
    c = P(u, (d0 + d1) / 2, (z0 + z1) / 2)
    for q in ([P(u - w, d1, z0), P(u + w, d1, z0), P(u + w, d1, z1), P(u - w, d1, z1)],
              [P(u - w, d0, z0), P(u - w, d1, z0), P(u - w, d1, z1), P(u - w, d0, z1)],
              [P(u + w, d0, z0), P(u + w, d1, z0), P(u + w, d1, z1), P(u + w, d0, z1)],
              [P(u - w, d0, z0), P(u + w, d0, z0), P(u + w, d1, z0), P(u - w, d1, z0)]):
        face('trim', q, sum(q, Vector()) / 4 - c)

def balustrade(F, u0, u1, d, z, h=1.05, step=0.62, pier=None):
    """Балюстрада вдоль фасада: низ, столбики, поручень; pier — шаг тумб."""
    box('trim', F, u0, u1, d - 0.15, d + 0.15, z, z + 0.16, bottom=False)
    box('trim', F, u0, u1, d - 0.19, d + 0.19, z + h - 0.15, z + h)
    n = max(1, int(round((u1 - u0) / step)))
    for i in range(n + 1):
        post(F, u0 + (u1 - u0) * i / n, d, z + 0.16, z + h - 0.15)
    if pier:
        k = int(round((u1 - u0) / pier))
        for i in range(k + 1):
            u = u0 + (u1 - u0) * i / max(k, 1)
            box('trim', F, u - 0.22, u + 0.22, d - 0.22, d + 0.22, z, z + h + 0.12, bottom=False)

def win(F, cu, za, w, h, d, rev=0.24, simple=False):
    ua, ub, zb = cu - w / 2, cu + w / 2, za + h
    g = d - rev + 0.02
    face('glass', [F.p(ua, g, za), F.p(ub, g, za), F.p(ub, g, zb), F.p(ua, g, zb)], F.N())
    t = 0.04
    zt = za + h * 0.68
    for q in ([(cu - t, za), (cu + t, za), (cu + t, zb), (cu - t, zb)],
              [(ua, zt - t), (ub, zt - t), (ub, zt + t), (ua, zt + t)]):
        face('wood', [F.p(u_, g + 0.03, z_) for u_, z_ in q], F.N())
    box('trim', F, ua - 0.14, ub + 0.14, d - 0.02, d + 0.16, za - 0.14, za, bottom=False)      # подоконник
    if not simple:
        face('trim', [F.p(ua - 0.12, d + 0.07, zb), F.p(ub + 0.12, d + 0.07, zb),
                      F.p(ub + 0.12, d + 0.07, zb + 0.16), F.p(ua - 0.12, d + 0.07, zb + 0.16)], F.N())
        face('trim', [F.p(ua - 0.12, d, zb + 0.16), F.p(ub + 0.12, d, zb + 0.16),
                      F.p(ub + 0.12, d + 0.07, zb + 0.16), F.p(ua - 0.12, d + 0.07, zb + 0.16)], UP)
    return (ua, ub, za, zb)

def flat_win(F, cu, za, w, h, d, sill=True):
    """Окно без проёма: стекло, переплёт и рамка поверх плоской стены (второстепенные фасады)."""
    ua, ub, zb = cu - w / 2, cu + w / 2, za + h
    g = d + 0.02
    face('glass', [F.p(ua, g, za), F.p(ub, g, za), F.p(ub, g, zb), F.p(ua, g, zb)], F.N())
    t = 0.035
    zt = za + h * 0.68
    for q in ([(cu - t, za), (cu + t, za), (cu + t, zb), (cu - t, zb)],
              [(ua, zt - t), (ub, zt - t), (ub, zt + t), (ua, zt + t)]):
        face('wood', [F.p(u_, g + 0.02, z_) for u_, z_ in q], F.N())
    f = 0.11
    g2 = d + 0.04
    for q in ([(ua - f, za - f), (ua, za - f), (ua, zb + f), (ua - f, zb + f)],
              [(ub, za - f), (ub + f, za - f), (ub + f, zb + f), (ub, zb + f)],
              [(ua, zb), (ub, zb), (ub, zb + f), (ua, zb + f)],
              [(ua, za - f), (ub, za - f), (ub, za), (ua, za)]):
        face('trim', [F.p(u_, g2, z_) for u_, z_ in q], F.N())

def arch_hole(cu, r, sill, zs):
    return (cu - r, cu + r, sill, zs + r)

def arch_fill(F, cu, r, sill, zs, d, rev=0.24, seg=6, door=False):
    arc = [(cu + r * math.cos(math.pi * k / seg), zs + r * math.sin(math.pi * k / seg)) for k in range(seg + 1)]
    hs = seg // 2
    face('wall', [F.p(cu + r, d, zs + r)] + [F.p(u, d, z) for u, z in arc[:hs + 1]], F.N())
    face('wall', [F.p(cu - r, d, zs + r)] + [F.p(u, d, z) for u, z in arc[hs:]], F.N())
    gd = d - rev + 0.02
    face('glass' if not door else 'wood', [F.p(cu - r, gd, sill), F.p(cu + r, gd, sill)] + [F.p(u, gd, z) for u, z in arc], F.N())
    for k in range(seg):                                       # откос арки
        (ua, za), (ub, zb) = arc[k], arc[k + 1]
        face('trim', [F.p(ua, d, za), F.p(ub, d, zb), F.p(ub, gd, zb), F.p(ua, gd, za)],
             F.p(cu, d, zs) - F.p((ua + ub) / 2, d, (za + zb) / 2))
    ro = r + 0.22                                              # архивольт
    for k in range(seg):
        oa = (cu + ro * math.cos(math.pi * k / seg), zs + ro * math.sin(math.pi * k / seg))
        ob = (cu + ro * math.cos(math.pi * (k + 1) / seg), zs + ro * math.sin(math.pi * (k + 1) / seg))
        (ua, za), (ub, zb) = arc[k], arc[k + 1]
        face('trim', [F.p(ua, d + 0.01, za), F.p(ub, d + 0.01, zb), F.p(ob[0], d + 0.01, ob[1]), F.p(oa[0], d + 0.01, oa[1])], F.N())
    box('wood', F, cu - 0.03, cu + 0.03, gd, gd + 0.06, sill, zs + r)
    if not door:
        box('wood', F, cu - r, cu + r, gd, gd + 0.06, zs - 0.03, zs + 0.03)

def slab(m, poly_st, z0, z1, top=True):
    prism_plan(m, FI, [PL(s, t) for s, t in poly_st], z0, z1, top)

def rect_st(s0, s1, t0, t1, o=0.0):
    return [(s0 - o, t0 - o), (s1 + o, t0 - o), (s1 + o, t1 + o), (s0 - o, t1 + o)]

# ------------------------------------------------------------------ колонны
def ionic(F, u, d, z0, H, D=1.0, seg=8):
    """Ионическая колонна: база, ствол с энтазисом (гладкий), капитель с волютами."""
    R = D / 2
    base = F.p(u, d, z0)
    box('trim', F, u - 0.78 * D, u + 0.78 * D, d - 0.78 * D, d + 0.78 * D, z0, z0 + 0.26, bottom=False)
    lathe('trim', base, [(0.72 * D, 0.26), (0.74 * D, 0.40), (0.56 * D, 0.55)], seg, cap=False)
    lathe('trim_s', base, [(0.98 * R, 0.55), (1.0 * R, 0.38 * H), (0.84 * R, H - 0.95)], seg, cap=True)
    lathe('trim', base, [(0.86 * R, H - 0.95), (1.15 * R, H - 0.62), (1.22 * R, H - 0.46)], seg, cap=True)
    for sgn in (-1, 1):                                                                                       # волюты
        cu, cz = u + sgn * 0.60 * D, z0 + H - 0.60
        rr = 0.17 * D
        poly = [(cu + rr * math.cos(math.pi * k / 3), cz + rr * math.sin(math.pi * k / 3)) for k in range(6)]
        prism_uz('trim', F, poly, d - 0.30 * D, d + 0.30 * D)
    box('trim', F, u - 0.72 * D, u + 0.72 * D, d - 0.72 * D, d + 0.72 * D, z0 + H - 0.44, z0 + H, bottom=False)   # абака

def corinth(F, u, d, z0, H, D=0.8, seg=6):
    """Облегчённая коринфская колонна башни."""
    R = D / 2
    base = F.p(u, d, z0)
    box('trim', F, u - 0.75 * D, u + 0.75 * D, d - 0.75 * D, d + 0.75 * D, z0, z0 + 0.22)
    lathe('trim', base, [(0.72 * D, 0.22), (0.72 * D, 0.38), (0.54 * D, 0.48)], seg, cap=False)
    lathe('trim_s', base, [(0.97 * R, 0.48), (1.0 * R, 0.38 * H), (0.86 * R, H - 1.1)], seg, cap=True)
    lathe('trim', base, [(0.88 * R, H - 1.1), (1.25 * R, H - 0.6), (1.62 * R, H - 0.18)], seg, cap=True)
    box('trim', F, u - 0.82 * D, u + 0.82 * D, d - 0.82 * D, d + 0.82 * D, z0 + H - 0.18, z0 + H)

# ================================================================== КОРПУС
def build_body():
    # --- общий цоколь и ступени парадного входа
    slab('stone', rect_st(0, SL, 0, TW, 0.0), GROUND, 0.9, top=False)
    Fn = FR(0, 0, (0, 1), (-1, 0))               # северный (парадный) фасад
    for j in (1, 2, 3):
        box('stone', Fn, 3.0 - 0.3 * j, TW - 3.0 + 0.3 * j, 0.0, 0.45 * j, 0.0, 0.15 * (4 - j))
    # --- северный фасад: цоколь с арочными проёмами, два этажа окон
    holes = []
    arches = []
    for cu in (6.0, 12.0, 18.0):                                      # три арочные двери
        holes.append(arch_hole(cu, 1.1, 0.0, 3.5)); arches.append((cu, 1.1, 0.0, 3.5))
    for cu in (2.4, 21.6):
        holes.append(win(Fn, cu, 1.3, 1.5, 2.4, 0))
    for cu in (3.0, 7.5, 12.0, 16.5, 21.0):
        holes.append(win(Fn, cu, 6.9, 1.5, 3.3, 0))
        holes.append(win(Fn, cu, 11.7, 1.5, 3.3, 0))
    wall(Fn, 0, TW, GROUND, CT, 0, holes)
    for a in arches:
        arch_fill(Fn, *a, 0, door=True)
    box('trim', Fn, 0, TW, -0.02, 0.12, BASE - 0.1, BASE + 0.1)       # пояс над цоколем
    for cu in (3.0, 12.0, 21.0):                                       # балконы второго этажа
        box('trim', Fn, cu - 1.0, cu + 1.0, 0, 0.5, 6.4, 6.6)
        balustrade(Fn, cu - 1.0, cu + 1.0, 0.45, 6.6, h=0.9, step=0.42)
    for u0, u1 in ((0, 1.4), (TW - 1.4, TW)):                          # угловые лопатки
        box('trim', Fn, u0, u1, 0, 0.18, 0.9, CT)
    # --- западный и восточный фасады южнее галерей
    for side in (0, 1):
        tt = 0.0 if side == 0 else TW
        F = FR(GAL, tt, (1, 0), (0, -1 if side == 0 else 1))
        L = SL - GAL
        step = 3.9
        n = int(L // step)
        for i in range(n):
            cu = (i + 0.5) * L / n
            flat_win(F, cu, 1.3, 1.5, 2.4, 0)
            flat_win(F, cu, 6.9, 1.5, 3.3, 0)
            flat_win(F, cu, 11.7, 1.5, 3.3, 0)
        wall(F, 0, L, GROUND, CT, 0, [])
        box('trim', F, 0, L, -0.02, 0.12, BASE - 0.1, BASE + 0.1)
    # --- южный фасад
    F = FR(SL, 0, (0, 1), (1, 0))
    for i in range(6):
        cu = (i + 0.5) * TW / 6
        flat_win(F, cu, 1.3, 1.5, 2.4, 0); flat_win(F, cu, 6.9, 1.5, 3.3, 0); flat_win(F, cu, 11.7, 1.5, 3.3, 0)
    wall(F, 0, TW, GROUND, CT, 0, [])
    box('trim', F, 0, TW, -0.02, 0.12, BASE - 0.1, BASE + 0.1)
    # --- галереи: цокольный этаж, ниша, колонны
    for side in (0, 1):
        tt = 0.0 if side == 0 else TW
        dirn = -1 if side == 0 else 1
        Fb = FR(0, tt, (1, 0), (0, dirn))               # плоскость колонн, наружу
        Fr = FR(0, tt - dirn * 4.2, (1, 0), (0, dirn))  # задняя стена галереи
        # цоколь галереи — стена с тремя арками
        h = []; ar = []
        for cu in (CS[1] + 1.6, CS[3] + 1.6, CS[5] + 1.6):
            h.append(arch_hole(cu, 1.05, 0.0, 3.4)); ar.append((cu, 1.05, 0.0, 3.4))
        for cu in (CS[0] + 1.6, CS[2] + 1.6, CS[4] + 1.6, CS[6] + 1.6):
            h.append(win(Fb, cu, 1.3, 1.5, 2.4, 0))
        wall(Fb, 0, GAL, GROUND, BASE, 0, h)
        for a in ar:
            arch_fill(Fb, *a, 0, door=True)
        box('trim', Fb, 0, GAL, -0.08, 0.22, BASE - 0.1, BASE + 0.1)
        # плита пола галереи
        slab('trim', rect_st(0, GAL, min(tt, tt - dirn * 4.2), max(tt, tt - dirn * 4.2)), BASE - 0.1, BASE + 0.05)
        # задняя стена: нижние окна и верхние арочные
        h = []; ar = []
        for k in range(7):
            cu = CS[k] + 1.625
            h.append(win(Fr, cu, BASE + 1.5, 1.4, 3.0, 0))
            h.append(arch_hole(cu, 0.75, BASE + 6.0, BASE + 8.5)); ar.append((cu, 0.75, BASE + 6.0, BASE + 8.5))
        wall(Fr, 0, GAL, BASE, CT, 0, h)
        for a in ar:
            arch_fill(Fr, *a, 0)
        for k in range(1, 7, 2):                                           # медальоны
            cu = CS[k] + 1.625 + 0.0
            cc = [(cu + 0.55 * math.cos(math.pi * q / 4), BASE + 9.9 + 0.55 * math.sin(math.pi * q / 4)) for q in range(8)]
            prism_uz('trim', Fr, cc, 0, 0.1)
        # торцевая стенка галереи (юг)
        Fe = FR(GAL, tt, (0, -dirn), (1, 0))
        wall(Fe, 0, 4.2, BASE, CT, 0, [])
        # колонны и балюстрада между ними
        for s in CS:
            ionic(Fb, s, 0.0, BASE, CT - BASE, 1.05)
        for i in range(7):
            balustrade(Fb, CS[i] + 0.65, CS[i + 1] - 0.65, 0.0, BASE, h=1.0, step=0.45)
    # --- антаблемент и венчающий карниз всего корпуса
    slab('trim', rect_st(0, SL, 0, TW, 0.22), CT, CT + 0.72)                              # архитрав
    slab('wall', rect_st(0, SL, 0, TW, 0.12), CT + 0.72, CT + 1.55)                       # фриз
    slab('trim', rect_st(0, SL, 0, TW, 0.50), CT + 1.55, CT + 1.75)
    slab('trim', rect_st(0, SL, 0, TW, 0.90), CT + 1.75, EN1)
    # зубчики под карнизом по парадному фасаду и галереям
    for side in (0, 1):
        tt = 0.0 if side == 0 else TW
        dirn = -1 if side == 0 else 1
        F = FR(0, tt, (1, 0), (0, dirn))
        k = 0.4
        while k < GAL + 0.6:
            dentil(F, k, 0.3, 0.62, CT + 1.4, CT + 1.6)
            k += 0.8
    F = Fn
    k = 0.4
    while k < TW:
        dentil(F, k, 0.3, 0.62, CT + 1.4, CT + 1.6)
        k += 0.8
    # --- балюстрада по периметру кровли
    for (s0, t0, u, n, L) in ((0, 0, (0, 1), (-1, 0), TW), (SL, 0, (0, 1), (1, 0), TW),
                              (0, 0, (1, 0), (0, -1), SL), (0, TW, (1, 0), (0, 1), SL)):
        Fp = FR(s0, t0, u, n)
        balustrade(Fp, -0.6, L + 0.6, 0.55, EN1, h=PAR - EN1, step=0.9, pier=4.0)
    # --- вальмовая кровля, скрытая за балюстрадой
    Fr = FR(0, 0, (1, 0), (0, -1))
    hip_roof(Fr, 0.6, SL - 0.6, -0.6, -(TW - 0.6), EN1 - 0.1, 2.6, ov=0.0)
    for s, t in ((10.0, 7.0), (22.0, 15.0), (44.0, 8.0), (52.0, 16.0)):          # вентшахты
        slab('wall', rect_st(s - 0.5, s + 0.5, t - 0.5, t + 0.5), EN1, EN1 + 3.6)

# ================================================================== ПОЛУРОТОНДА
def arc_pts(r, n, off=0):
    out = []
    for i in range(n + 1):
        ph = math.pi * i / n
        out.append((RC[0] - r * math.cos(ph), RC[1] + r * math.sin(ph) + off))
    return out

def rot_poly(r):
    arc = arc_pts(r, 14)
    return [(39.0 - (r - RR), 24.0)] + [(a[0], a[1]) for a in arc] + [(SL, 32.7), (SL, 24.0)]

def build_rotunda():
    RB = 4.8            # пол галереи полуротонды
    RT = 13.6           # верх колонн
    # цоколь: стена по дуге с арочными окнами
    N = 12
    ang = [math.pi * i / N for i in range(N + 1)]
    for i in range(N):
        p0 = (RC[0] - RR * math.cos(ang[i]), RC[1] + RR * math.sin(ang[i]))
        p1 = (RC[0] - RR * math.cos(ang[i + 1]), RC[1] + RR * math.sin(ang[i + 1]))
        ds, dt = p1[0] - p0[0], p1[1] - p0[1]
        L = math.hypot(ds, dt)
        mid = ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2)
        outv = (mid[0] - RC[0], mid[1] - RC[1])
        F = FR(p0[0], p0[1], (ds, dt), outv)
        h = []; ar = []
        if i % 2 == 0:
            ar.append((L / 2, 0.8, 0.0, 2.7)); h.append(arch_hole(L / 2, 0.8, 0.0, 2.7))
        else:
            h.append(win(F, L / 2, 1.0, 1.3, 2.4, 0))
        wall(F, 0, L, -7.5, RB, 0, h)
        for a in ar:
            arch_fill(F, *a, 0, door=(i == 6 or i == 4 or i == 8))
    # пол галереи и входные ступени
    slab('trim', rot_poly(RR), RB - 0.12, RB)
    # колонны
    n = 6
    for i in range(n + 1):
        ph = math.pi * i / n
        p = (RC[0] - RR * math.cos(ph), RC[1] + RR * math.sin(ph))
        outv = (p[0] - RC[0], p[1] - RC[1])
        if i == 0: outv = (0.0, 1.0)
        F = FR(p[0], p[1], (outv[1], -outv[0]), outv)
        ionic(F, 0, -0.0 - 0.0, RB, RT - RB, 0.95)
    # стена за колоннами: по дуге меньшего радиуса, окна в два яруса
    r2 = RR - 3.6
    N2 = 10
    for i in range(N2):
        a0, a1 = math.pi * i / N2, math.pi * (i + 1) / N2
        p0 = (RC[0] - r2 * math.cos(a0), RC[1] + r2 * math.sin(a0))
        p1 = (RC[0] - r2 * math.cos(a1), RC[1] + r2 * math.sin(a1))
        ds, dt = p1[0] - p0[0], p1[1] - p0[1]
        L = math.hypot(ds, dt)
        mid = ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2)
        F = FR(p0[0], p0[1], (ds, dt), (mid[0] - RC[0], mid[1] - RC[1]))
        flat_win(F, L / 2, RB + 1.2, 1.4, 3.0, 0); flat_win(F, L / 2, RB + 5.4, 1.4, 2.6, 0)
        wall(F, 0, L, RB, RT, 0, [])
    # антаблемент, балюстрада
    slab('trim', rot_poly(RR + 0.35), RT, RT + 0.65)
    slab('wall', rot_poly(RR + 0.25), RT + 0.65, RT + 1.35)
    slab('trim', rot_poly(RR + 0.9), RT + 1.35, RT + 1.9)
    # прямая часть крыла (юг и запад) — стены под тем же карнизом
    F = FR(SL, TW, (0, 1), (1, 0))
    for i in range(2):
        flat_win(F, 2.2 + 4.2 * i + 0.0, 1.3, 1.4, 2.4, 0); flat_win(F, 2.2 + 4.2 * i, 6.9, 1.4, 3.0, 0)
    wall(F, 0, 8.6, GROUND, RT, 0, [])
    # стены крыла: северная (к башне) и восточная у южной полосы
    Fn2 = FR(39.0, 24.0, (0, 1), (-1, 0))
    flat_win(Fn2, 4.35, RB + 1.5, 1.4, 3.0, 0)
    wall(Fn2, 0, 8.7, GROUND, RT, 0, [])
    Fe2 = FR(RC[0] + RR, 32.7, (1, 0), (0, 1))
    wall(Fe2, 0, SL - (RC[0] + RR), GROUND, RT, 0, [])
    # стена между башней и крылом, цоколь под полуротондой
    Fb = FR(35.6, 24.0, (1, 0), (0, 1))
    wall(Fb, 0, 3.4, GROUND, CT, 0, [])
    # балюстрада по краю плоской кровли
    arc = arc_pts(RR + 0.55, 14)
    for i in range(14):
        a, b = arc[i], arc[i + 1]
        ds, dt = b[0] - a[0], b[1] - a[1]
        L = math.hypot(ds, dt)
        mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        Fp = FR(a[0], a[1], (ds, dt), (mid[0] - RC[0], mid[1] - RC[1]))
        balustrade(Fp, 0, L, 0, RT + 1.9, h=1.0, step=0.55)
    Fs = FR(SL, TW, (0, 1), (1, 0))
    balustrade(Fs, 0, 8.6, 0.4, RT + 1.9, h=1.0, step=0.55)
    Fa = FR(RC[0] + RR + 0.55, 32.7, (0, 1), (1, 0))
    balustrade(Fa, 0, 0.1, 0, RT + 1.9, h=1.0, step=0.55)
    # плоская кровля над залом
    slab('roof', rot_poly(RR + 0.5), RT + 1.9, RT + 2.0)

# ================================================================== БАШНЯ
SC, TC = 30.9, 28.3         # центр башни (s, t)
TH = 4.7                    # полуширина ствола
ZS = 24.0                   # верх ствола

def build_tower():
    # --- ствол из инкерманского камня: три грани над землёй (запад в корпусе)
    faces = [(FR(SC - TH, TC + TH, (1, 0), (0, 1)), 2 * TH),        # восток
             (FR(SC - TH, TC - TH, (0, 1), (-1, 0)), 2 * TH),       # север
             (FR(SC + TH, TC - TH, (0, 1), (1, 0)), 2 * TH),        # юг
             (FR(SC - TH, TC - TH, (1, 0), (0, -1)), 2 * TH)]       # запад (над кровлей корпуса)
    for i, (F, L) in enumerate(faces):
        cu = L / 2
        for za, hh in ((4.2, 2.3), (9.0, 2.3), (13.8, 2.3), (18.6, 2.3)):
            flat_win(F, cu, za, 1.4, hh, 0.04)
        wall(F, 0, L, -6.0, ZS, 0, [], m='wall2')
        for dx in (-1.6, 0, 1.6):
            face('glass', [F.p(cu + dx - 0.2, 0.05, 22.4), F.p(cu + dx + 0.2, 0.05, 22.4),
                           F.p(cu + dx + 0.2, 0.05, 23.1), F.p(cu + dx - 0.2, 0.05, 23.1)], F.N())
        # горизонтальные пояса рустовки
        z = -6.0 + 1.0
        while z < ZS - 0.5:
            if z > 0.3:
                face('wall2', [F.p(-0.05, 0.07, z), F.p(L + 0.05, 0.07, z), F.p(L + 0.05, 0.07, z + 0.1), F.p(-0.05, 0.07, z + 0.1)], F.N())
                face('trim' if False else 'wall2', [F.p(-0.05, 0.0, z + 0.1), F.p(L + 0.05, 0.0, z + 0.1), F.p(L + 0.05, 0.07, z + 0.1), F.p(-0.05, 0.07, z + 0.1)], UP)
            z += 1.6
        box('trim', F, -0.2, L + 0.2, 0, 0.3, 11.2, 11.45)          # пояс
        box('wall', F, -0.25, L + 0.25, 0, 0.5, ZS - 0.8, ZS - 0.1)  # подкарнизный пояс
        # окно-ниша с пилястрами по оси на высоте второго пояса не рисуем
    FC = Frame(W(*pt(SC, TC)), dirW(0, 1), dirW(-1, 0))             # u — восток, d — север
    # --- карниз и площадка бельведера
    def sq(m, hw, z0, z1, hw2=None):
        box(m, FC, -hw, hw, -(hw2 or hw), (hw2 or hw), z0, z1)
    sq('wall', TH + 0.55, ZS - 0.1, ZS + 0.45)
    sq('trim', TH + 0.95, ZS + 0.45, ZS + 0.9)
    sq('wall', TH + 0.6, ZS + 0.9, ZS + 1.4)
    z0 = ZS + 1.4                                       # пол бельведера
    # --- сердцевина бельведера и арочные окна
    CH = 2.9
    sq('wall', CH, z0, 32.4)
    for rot in range(4):
        u = [FC.u, FC.n, -FC.u, -FC.n][rot]
        n = [FC.n, -FC.u, -FC.n, FC.u][rot]
        Fk = Frame(FC.o + n * CH, u, n)
        # окно в стене сердцевины: арка + прямоугольное
        face('glass', [Fk.p(-0.9, 0.02, z0 + 0.6), Fk.p(0.9, 0.02, z0 + 0.6), Fk.p(0.9, 0.02, z0 + 3.2), Fk.p(-0.9, 0.02, z0 + 3.2)], Fk.N())
        arc = [(0.9 * math.cos(math.pi * q / 6), z0 + 3.2 + 0.9 * math.sin(math.pi * q / 6)) for q in range(7)]
        face('glass', [Fk.p(u_, 0.02, z_) for u_, z_ in arc], Fk.N())
        box('trim', Fk, -0.05, 0.05, 0.02, 0.07, z0 + 0.6, z0 + 4.0)
    # --- колонны и балюстрада по периметру
    HC = 3.85
    cpos = [-HC, -HC / 3, HC / 3, HC]
    cz0 = z0 + 0.0
    colH = 32.4 - cz0
    for rot in range(4):
        u = [FC.u, FC.n, -FC.u, -FC.n][rot]
        n = [FC.n, -FC.u, -FC.n, FC.u][rot]
        Fk = Frame(FC.o, u, n)
        for i, cu in enumerate(cpos):
            if i == 3: continue                     # угол принадлежит следующей грани
            corinth(Fk, cu, HC, cz0, colH, 0.85)
        for i in range(3):
            balustrade(Fk, cpos[i] + 0.55, cpos[i + 1] - 0.55, HC, z0, h=1.0, step=0.4)
    # --- антаблемент бельведера
    sq('trim', HC + 0.65, 32.4, 33.1)
    sq('wall', HC + 0.55, 33.1, 33.8)
    sq('trim', HC + 1.15, 33.8, 34.1)
    sq('trim', HC + 1.55, 34.1, 34.7)
    # зубчики
    for rot in range(4):
        u = [FC.u, FC.n, -FC.u, -FC.n][rot]
        n = [FC.n, -FC.u, -FC.n, FC.u][rot]
        Fk = Frame(FC.o, u, n)
        k = -HC - 0.6
        while k < HC + 0.7:
            dentil(Fk, k, HC + 0.55, HC + 0.95, 33.65, 33.82, w=0.1)
            k += 0.7
    # --- аттик: балюстрада, пинакли, подножие фонаря
    ZA = 34.7
    sq('wall', 3.2, ZA, ZA + 3.9)
    sq('trim', 3.5, ZA + 3.9, ZA + 4.2)
    HB = 4.7
    for rot in range(4):
        u = [FC.u, FC.n, -FC.u, -FC.n][rot]
        n = [FC.n, -FC.u, -FC.n, FC.u][rot]
        Fk = Frame(FC.o, u, n)
        balustrade(Fk, -HB, HB, HB, ZA, h=0.95, step=0.45)
        for cu in (-HB, 0.0):                         # пинакли: углы и середины
            base = Fk.p(cu, HB, ZA)
            lathe('trim', base + UP * 0.0, [(0.55, 0.0), (0.55, 0.9), (0.38, 1.05), (0.30, 2.8), (0.42, 3.0), (0.24, 3.2), (0.0, 4.2)], 6, cap=False)
    # --- фонарь с курантами
    LZ0, LZ1 = ZA + 4.2, ZA + 9.2
    sq('wall', 2.2, LZ0, LZ1)
    for rot in range(4):
        u = [FC.u, FC.n, -FC.u, -FC.n][rot]
        n = [FC.n, -FC.u, -FC.n, FC.u][rot]
        Fk = Frame(FC.o + n * 2.2, u, n)
        cz = LZ0 + 2.5
        ring = [(1.35 * math.cos(math.pi * q / 6), cz + 1.35 * math.sin(math.pi * q / 6)) for q in range(12)]
        prism_uz('trim', Fk, ring, 0.0, 0.12)
        disk = [(1.2 * math.cos(math.pi * q / 6), cz + 1.2 * math.sin(math.pi * q / 6)) for q in range(12)]
        face('glass', [Fk.p(a, 0.14, b) for a, b in disk], Fk.N())
        for q in range(0, 12, 3):                               # засечки 12-3-6-9 и стрелки
            a = math.pi * q / 6
            r1, r2 = 0.82, 1.12
            w = 0.09
            c, s_ = math.cos(a), math.sin(a)
            beam('trim', Fk.p(r1 * c, 0.16, cz + r1 * s_), Fk.p(r2 * c, 0.16, cz + r2 * s_), w, 0.03)
        beam('trim', Fk.p(0, 0.16, cz), Fk.p(0.0, 0.16, cz + 0.85), 0.08, 0.03)
        beam('trim', Fk.p(0, 0.16, cz), Fk.p(0.65, 0.16, cz - 0.15), 0.07, 0.03)
        for cu in (-2.2, 2.2):
            box('trim', Fk, cu - 0.2, cu + 0.2, -0.05, 0.12, LZ0, LZ1)
        # узкое окно под часами
        face('glass', [Fk.p(-0.35, 0.02, LZ0 + 0.3), Fk.p(0.35, 0.02, LZ0 + 0.3), Fk.p(0.35, 0.02, LZ0 + 1.1), Fk.p(-0.35, 0.02, LZ0 + 1.1)], Fk.N())
    sq('trim', 2.85, LZ1, LZ1 + 0.3)
    sq('trim', 2.55, LZ1 + 0.3, LZ1 + 0.7)
    for rot in range(4):
        u = [FC.u, FC.n, -FC.u, -FC.n][rot]
        n = [FC.n, -FC.u, -FC.n, FC.u][rot]
        Fk = Frame(FC.o, u, n)
        balustrade(Fk, -2.4, 2.4, 2.4, LZ1 + 0.7, h=0.9, step=0.45)
    # --- шпиль
    SB = LZ1 + 0.7
    base = Vector((FC.o.x, FC.o.y, SB))
    lathe('wall3', base, [(1.05, 0.0), (0.55, 0.9), (0.42, 6.0), (0.30, 14.0), (0.18, 17.5), (0.12, 18.6)], 8, cap=True)
    lathe('wall3', base, [(0.0, 18.2), (0.34, 18.6), (0.0, 19.3)], 8, cap=False)       # шар
    # звезда
    pts = []
    for k in range(10):
        r = 1.0 if k % 2 == 0 else 0.42
        a = math.pi / 2 + k * math.pi / 5
        pts.append((r * math.cos(a), 19.6 + SB + r * math.sin(a)))
    Fstar = Frame(Vector((FC.o.x, FC.o.y)), FC.u, FC.n)
    prism_uz('wall3', Fstar, pts, -0.07, 0.07)

# ================================================================== прочее
def build_extras():
    # парапет террасы и ступени у основания башни (восточная сторона)
    F = FR(14.0, 33.2, (1, 0), (0, 1))
    box('stone', F, 0, 25.0, -0.35, 0.0, GROUND, 0.2)
    balustrade(F, 0, 25.0, -0.2, 0.2, h=1.0, step=0.5, pier=3.5)
    # цокольный объём перед восточной галереей (на месте пристройки w105880322)
    Ft = FR(0, TW, (1, 0), (0, 1))
    D = 4.0
    Fe = FR(0, TW + D, (1, 0), (0, 1))
    h = []; ar = []
    for cu in (4.0, 13.0, 22.0):
        h.append(arch_hole(cu, 1.05, 0.0, 3.4)); ar.append((cu, 1.05, 0.0, 3.4))
    for cu in (8.5, 17.5):
        h.append(win(Fe, cu, 1.3, 1.5, 2.4, 0, simple=True))
    wall(Fe, 0, GAL, GROUND, BASE - 0.1, 0, h)
    for a_ in ar:
        arch_fill(Fe, *a_, 0, door=True)
    box('trim', Fe, -0.05, GAL + 0.05, -0.08, 0.22, BASE - 0.3, BASE)
    for sgn, s0 in ((-1, 0.0), (1, GAL)):                     # торцы
        Fq = FR(s0, TW, (0, 1), (-1 if sgn < 0 else 1, 0))
        wall(Fq, 0, D, GROUND, BASE - 0.1, 0, [])
    balustrade(Fe, 0, GAL, -0.1, BASE, h=1.0, step=0.62, pier=3.25)
    for sgn, s0 in ((-1, 0.0), (1, GAL)):
        Fq = FR(s0, TW, (0, 1), (-1 if sgn < 0 else 1, 0))
        balustrade(Fq, 0, D, -0.1, BASE, h=1.0, step=0.62)

build_body()
build_rotunda()
build_tower()
build_extras()

finish('matrosskiy_klub', __file__, 25000)
