# Севастопольский Центр культуры и искусства (бывший Городской Дом культуры, ул. Ленина, 25).
#
#   blender -b --python models/cki/build.py -- [glb]
#
# План — по контуру OSM way 90983939, выпрямленному до прямоугольников в повёрнутой
# системе (a — вдоль улицы Ленина «на восток», b — на юг, начало в северо-западном углу
# главного фасада). Фасад — по фото Викисклада (refs/ref0, ref1). Ноль высоты —
# тротуар у подножия лестницы входа.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

# ---------------------------------------------------------------- план
V9 = (87.0, 719.0)                      # СЗ угол главного (западного) фасада
_A = (0.95547, -0.29507)                # орт «a» в мире (x, z): на восток, чуть к северу
_B = (0.29507, 0.95547)                 # орт «b»: на юг

def AB(a, b):
    return (V9[0] + _A[0] * a + _B[0] * b, V9[1] + _A[1] * a + _B[1] * b)

HW = 19.9                               # ширина главного фасада (b: 0..HW)
X0, Z0 = AB(0, HW / 2)                  # середина фасада у входа
origin(X0, Z0)

def PT(a, b, z):
    v = W(*AB(a, b))
    return Vector((v.x, v.y, z))

def FRM(p0, p1, inside):
    """Рамка по ребру (a0,b0)→(a1,b1) плана; u растёт вправо для зрителя снаружи."""
    return frame_from(AB(*p0), AB(*p1), AB(*inside))

# цвета (в скрипте, до геометрии)
COL['wall'] = ((0.93, 0.92, 0.88), 0.9)       # белая штукатурка
COL['trim'] = ((0.96, 0.95, 0.92), 0.85)
COL['stone'] = ((0.72, 0.71, 0.68), 0.9)      # рустованный серо-белый цоколь
COL['roof'] = ((0.56, 0.27, 0.19), 0.8)       # красно-коричневая черепица
COL['wood'] = ((0.40, 0.07, 0.08), 0.5)       # тёмно-красные переплёты витража, дверей и окон
COL['glass'] = ((0.12, 0.12, 0.14), 0.12)
COL['metal'] = ((0.17, 0.17, 0.18), 0.5)

# высоты
PL = 1.05            # цоколь = уровень пола входа
CORN = 8.95          # низ междуэтажного (венчающего подиум) карниза
PODT = 9.55          # верх подиума
EAVE = 13.4          # карниз зала
SLOPE = 0.35         # уклон кровли (tg ~19°)
INS = 1.2            # отступ верхнего объёма зала от подиума
Hn, Hs = 0.0, HW     # границы зала по b
Ae = 41.75           # восточный торец зала
AN0, AN1, BN0, BNL = 21.3, 45.35, -10.55, -0.7     # северный флигель
AS0, AS1, BS1, BSL = 19.6, 45.7, 29.65, 19.15      # южный флигель
SH = 0.27            # уклон односкатных крыш флигелей

# ---------------------------------------------------------------- мелкие детали
def glaze(F, ua, ub, za, zb, d, cols=2, rows=4, reveal=0.24, t=0.05):
    """Стекло в глубине проёма и тёмно-красный переплёт."""
    g = d - reveal + 0.02
    face('glass', [F.p(ua, g, za), F.p(ub, g, za), F.p(ub, g, zb), F.p(ua, g, zb)], F.N())
    f0, f1 = g, g + 0.07
    box('wood', F, ua, ua + t, f0, f1, za, zb); box('wood', F, ub - t, ub, f0, f1, za, zb)
    box('wood', F, ua, ub, f0, f1, za, za + t); box('wood', F, ua, ub, f0, f1, zb - t, zb)
    for c in range(1, cols):
        u = ua + (ub - ua) * c / cols
        box('wood', F, u - t / 2, u + t / 2, f0, f1, za, zb)
    for r in range(1, rows):
        z = za + (zb - za) * r / rows
        box('wood', F, ua, ub, f0, f1, z - t / 2, z + t / 2)

def win(F, cu, za, w, h, d=0.0, cols=2, rows=4, sill=True):
    """Окно: возвращает проём для wall(), рисует переплёт и подоконник."""
    ua, ub = cu - w / 2, cu + w / 2
    glaze(F, ua, ub, za, za + h, d, cols, rows)
    if sill:
        box('trim', F, ua - 0.1, ub + 0.1, d, d + 0.14, za - 0.12, za)
    return (ua, ub, za, za + h)

def dentils(F, u0, u1, d, z, step=0.7, h=0.3, w=0.26, out=0.42):
    k = u0 + step / 2
    while k < u1:
        box('trim', F, k - w / 2, k + w / 2, d, d + out, z - h, z)
        k += step

def eave_cornice(F, u0, u1, d, ze):
    """Карниз под свесом: полка и зубчики (сухарики)."""
    box('trim', F, u0 - 0.55, u1 + 0.55, d, d + 0.58, ze - 0.42, ze - 0.22)
    dentils(F, u0 - 0.3, u1 + 0.3, d, ze - 0.42)

def seg(F, L, holes, ztop=PODT, cornice=True, ext=0.5):
    """Стена подиума: цоколь, стена с проёмами, пояс, карниз."""
    wall(F, 0, L, PL, ztop, 0, holes)
    box('stone', F, 0, L, -0.3, 0.08, -3.0, PL)
    box('trim', F, -0.04, L + 0.04, -0.3, 0.14, PL - 0.06, PL + 0.08)
    if cornice:
        cornice_f(F, 0, L, ext)

def cornice_f(F, u0, u1, ext=0.5):
    cornice(F, u0, u1, 0, CORN, ext=ext)

def gable_wall(F, cu, uh, ze=EAVE):
    """Треугольник фронтона в плоскости стены + раскрепованный карниз с зубчиками."""
    ap = ze + uh * SLOPE
    prism_uz('wall', F, [(cu - uh, ze), (cu + uh, ze), (cu, ap)], -0.3, 0.0)
    ov = uh + 0.6
    zl = lambda u: ze + (uh - abs(u)) * SLOPE
    for s in (-1, 1):
        poly = [(cu + s * ov, zl(ov) + 0.12), (cu, ap + 0.12), (cu, ap - 0.43), (cu + s * ov, zl(ov) - 0.43)]
        prism_uz('trim', F, poly, -0.1, 0.62)
        k = 0.75
        while k < ov - 0.2:
            zt = zl(k) - 0.43
            box('trim', F, cu + s * k - 0.14, cu + s * k + 0.14, 0, 0.46, zt - 0.3, zt + 0.02)
            k += 0.78
    return ap

# ---------------------------------------------------------------- главный фасад
def build_front():
    F, L = FRM((0, 0), (0, HW), (10, 10))        # u: с севера на юг (вправо для зрителя)
    c = HW / 2
    S = lambda s: c + s                           # смещение от оси → u
    holes = []
    # --- витраж: проём по всей высоте, разрезан на два блока стены (подиум / верх)
    VW = 2.05
    vz1 = 12.55
    # --- подиум
    low = [(S(-VW), S(VW), PL, PODT)]
    # арочное окно слева
    r, sill, zs = 0.95, 1.25, 3.40
    cu = S(-5.9)
    low.append((cu - r, cu + r, sill, zs + r))
    # прямоугольное окно справа (под деревом: на фото читается как проём)
    cuR = S(5.9)
    low.append(win(F, cuR, 1.3, 1.7, 3.0, rows=5))
    for sg in (-1, 1):
        low.append(win(F, S(sg * 5.8), 5.4, 1.55, 2.6))
    seg(F, L, low, cornice=False)
    # карниз подиума — отдельными кусками: в зоне витража его перекрывают пилоны
    cornice_f(F, 0, S(-3.2), 0.5)
    cornice_f(F, S(3.2), L, 0.5)
    # арка: заполнение углов, архивольт, стекло
    seg_n = 14
    arc = [(cu + r * math.cos(math.pi * k / seg_n), zs + math.sin(math.pi * k / seg_n) * r) for k in range(seg_n + 1)]
    hs = seg_n // 2
    face('wall', [F.p(cu + r, 0, zs + r)] + [F.p(u, 0, z) for u, z in arc[:hs + 1]], F.N())
    face('wall', [F.p(cu - r, 0, zs + r)] + [F.p(u, 0, z) for u, z in arc[hs:]], F.N())
    ro = r + 0.28
    for k in range(seg_n):
        (ua, za), (ub, zb) = arc[k], arc[k + 1]
        face('trim', [F.p(ua, 0, za), F.p(ub, 0, zb), F.p(ub, -0.24, zb), F.p(ua, -0.24, za)],
             F.p(cu, 0, zs) - F.p((ua + ub) / 2, 0, (za + zb) / 2))
        oa = (cu + ro * math.cos(math.pi * k / seg_n), zs + ro * math.sin(math.pi * k / seg_n))
        ob = (cu + ro * math.cos(math.pi * (k + 1) / seg_n), zs + ro * math.sin(math.pi * (k + 1) / seg_n))
        face('trim', [F.p(ua, 0.06, za), F.p(ub, 0.06, zb), F.p(ob[0], 0.06, ob[1]), F.p(oa[0], 0.06, oa[1])], F.N())
        face('trim', [F.p(oa[0], 0, oa[1]), F.p(ob[0], 0, ob[1]), F.p(ob[0], 0.06, ob[1]), F.p(oa[0], 0.06, oa[1])],
             F.p((oa[0] + ob[0]) / 2, 0, (oa[1] + ob[1]) / 2) - F.p(cu, 0, zs))
    box('trim', F, cu - ro, cu - r, 0, 0.06, sill, zs); box('trim', F, cu + r, cu + ro, 0, 0.06, sill, zs)
    box('trim', F, cu - ro - 0.1, cu + ro + 0.1, 0, 0.14, sill - 0.14, sill)
    gd = -0.22
    face('glass', [F.p(cu - r, gd, sill), F.p(cu + r, gd, sill)] + [F.p(u, gd, z) for u, z in arc], F.N())
    for dx in (-r / 2, 0, r / 2):
        top = zs + math.sqrt(r * r - dx * dx)
        box('wood', F, cu + dx - 0.03, cu + dx + 0.03, gd, gd + 0.06, sill, top)
    for z in (sill + 0.03, sill + 0.8, sill + 1.6, zs):
        box('wood', F, cu - r, cu + r, gd, gd + 0.06, z - 0.03, z + 0.03)
    # --- верх зала (третий уровень): окна, отступ INS с обеих сторон
    top = [(S(-VW), S(VW), PODT, vz1)]
    for sg in (-1, 1):
        top.append(win(F, S(sg * 5.8), 10.0, 1.4, 2.5))
    wall(F, INS, HW - INS, PODT, EAVE, 0, top)
    # площадка подиума по бокам и карниз-отлив у верха зала
    # --- пилоны ризалита и антаблемент над витражом
    for sg in (-1, 1):
        u0, u1 = sorted((S(sg * VW), S(sg * 3.2)))
        box('trim', F, u0, u1, 0, 0.32, PL, 12.65)
        box('trim', F, u0 - 0.05, u1 + 0.05, 0, 0.5, CORN, PODT)
    box('trim', F, S(-3.45), S(3.45), 0, 0.42, 12.62, 13.0)
    dentils(F, S(-3.4), S(3.4), 0, 13.28, step=0.52, h=0.24, w=0.2, out=0.5)
    box('trim', F, S(-3.55), S(3.55), 0, 0.58, 13.04, 13.28)
    box('trim', F, S(-3.55), S(3.55), 0, 0.58, 13.28, 13.62)
    # --- витраж: стекло в глубине, тёмно-красные переплёты, двери
    g = -0.22
    face('glass', [F.p(S(-VW), g, PL + 2.4), F.p(S(VW), g, PL + 2.4), F.p(S(VW), g, vz1), F.p(S(-VW), g, vz1)], F.N())
    box('wood', F, S(-VW), S(-VW) + 0.07, g, g + 0.1, PL, vz1); box('wood', F, S(VW) - 0.07, S(VW), g, g + 0.1, PL, vz1)
    for k in range(1, 4):
        u = S(-VW + 2 * VW * k / 4)
        box('wood', F, u - 0.035, u + 0.035, g, g + 0.1, PL, vz1)
    for z in (PL + 2.4, 5.55, 7.45, 9.25, 10.95, vz1):
        box('wood', F, S(-VW), S(VW), g, g + 0.1, z - 0.04, z + 0.04)
    # двери: четыре створки со стеклом
    face('glass', [F.p(S(-VW), g, PL), F.p(S(VW), g, PL), F.p(S(VW), g, PL + 2.4), F.p(S(-VW), g, PL + 2.4)], F.N())
    for k in range(0, 5):
        u = S(-VW + 2 * VW * k / 4)
        box('wood', F, u - 0.06, u + 0.06, g, g + 0.12, PL, PL + 2.4)
    box('wood', F, S(-VW), S(VW), g, g + 0.12, PL, PL + 0.12)
    box('wood', F, S(-VW), S(VW), g, g + 0.12, PL + 1.0, PL + 1.06)
    box('wood', F, S(-VW), S(VW), g, g + 0.12, PL + 2.34, PL + 2.46)
    # --- лестница, тумбы, фонари
    n, rise, run = 7, 0.15, 0.33
    for i in range(n):
        topz = PL - rise * (i + 1)
        box('stone', F, S(-2.9), S(2.9), 0, run * (i + 1) + 0.02, topz - (0 if i < n - 1 else 3.0), topz)
    box('stone', F, S(-2.9), S(2.9), 0, 0.45, PL - 0.02, PL)       # площадка у дверей
    for sg in (-1, 1):
        u0, u1 = sorted((S(sg * 2.9), S(sg * 4.3)))
        box('stone', F, u0, u1, 0, 2.7, -3.0, 1.5)
        box('trim', F, u0 - 0.06, u1 + 0.06, 0, 2.76, 1.5, 1.64)
        # фонарь на тумбе
        lu = S(sg * 3.6)
        beam('metal', F.p(lu, 2.35, 1.64), F.p(lu, 2.35, 4.1), 0.07)
        box('metal', F, lu - 0.2, lu + 0.2, 2.15, 2.55, 4.1, 4.2)
        box('glass', F, lu - 0.16, lu + 0.16, 2.19, 2.51, 4.2, 4.65)
        box('metal', F, lu - 0.22, lu + 0.22, 2.13, 2.57, 4.65, 4.72)
    # --- фронтон, кровля над фасадом
    uh = (HW - 2 * INS) / 2
    ap = gable_wall(F, c, uh)
    return F, ap

# ---------------------------------------------------------------- боковые и торцевые стены
def hall_free_sides():
    """Боковые стены зала у фасада (a от 0 до флигелей): подиум с окнами, верх глухой."""
    # север: ребро b=0, a∈[0, AN0]; u растёт к западу
    for (b, p0, p1, ins, a_end) in ((0.0, (AN0, 0.0), (0.0, 0.0), (10, 10), AN0),
                                    (HW, (0.0, HW), (AS0, HW), (10, 10), AS0)):
        F, L = FRM(p0, p1, ins)
        holes = []
        pos = []
        a = 11.0
        while a < a_end - 2.2:
            pos.append(a); a += 5.0
        for a in pos:
            u = (AN0 - a) if b == 0.0 else a
            holes.append(win(F, u, 1.35, 1.5, 2.8))
            holes.append(win(F, u, 5.4, 1.5, 2.6))
        seg(F, L, holes)
        # ступенька подиума: верхняя площадка у стены верхнего объёма
        box('trim', F, 0, L, -INS, 0, PODT - 0.06, PODT)

def hall_upper_sides():
    """Верхний объём зала: глухие стены с карнизом, видны над флигелями."""
    for b, p0, p1 in ((INS, (Ae, INS), (0.0, INS)), (HW - INS, (0.0, HW - INS), (Ae, HW - INS))):
        F, L = FRM(p0, p1, (10, 10))
        wall(F, 0, L, PODT, EAVE, 0, [])
        eave_cornice(F, 0, L, 0, EAVE)
    # зазоры между верхней стеной и кровлями флигелей закрываются заливкой (см. flanks)

def hall_roof(ap):
    ze = EAVE
    bn, bs, bm = INS - 0.6, HW - INS + 0.6, HW / 2
    aw, ae = -0.6, Ae + 0.6
    zr = lambda b: ze + (min(b, HW - b) - INS) * SLOPE
    zrid = ze + (bm - INS) * SLOPE
    face('roof', [PT(aw, bn, zr(bn)), PT(ae, bn, zr(bn)), PT(ae, bm, zrid), PT(aw, bm, zrid)], UP)
    face('roof', [PT(aw, bs, zr(bs)), PT(ae, bs, zr(bs)), PT(ae, bm, zrid), PT(aw, bm, zrid)], UP)
    # коньковый брус и подшивка свесов
    beam('roof', PT(aw, bm, zrid + 0.05), PT(ae, bm, zrid + 0.05), 0.3, 0.18)
    for b, bw in ((bn, INS), (bs, HW - INS)):
        zq = zr(b) - 0.02
        face('trim', [PT(aw, b, zq), PT(ae, b, zq), PT(ae, bw, zq), PT(aw, bw, zq)], -UP)
    # ограждение на коньке и труба
    a = 4.0
    while a <= Ae - 3:
        beam('metal', PT(a, bm, zrid + 0.2), PT(a, bm, zrid + 0.95), 0.04)
        a += 1.6
    beam('metal', PT(4.0, bm, zrid + 0.95), PT(a - 1.6, bm, zrid + 0.95), 0.05)
    beam('metal', PT(4.0, bm, zrid + 0.55), PT(a - 1.6, bm, zrid + 0.55), 0.03)
    for aa in (8.0, 27.0):
        bb = bm + 2.6
        p = PT(aa, bb, 0)
        Fi = Frame(Vector((p.x, p.y)), Vector((1, 0)), Vector((0, 1)))
        chimney(Fi, 0, 0, zr(bb) - 0.3, zrid + 1.5, w=0.8)
    # флагшток на коньке фронтона
    base = PT(0.0, bm, ap + 0.1)
    beam('metal', base, base + UP * 3.2, 0.07)
    p0, p1 = PT(0.0, bm, ap + 3.2), PT(0.0, bm, ap + 2.4)
    p2, p3 = PT(0.0, bm + 1.5, ap + 2.4), PT(0.0, bm + 1.5, ap + 3.2)
    face('wood', [p0, p1, p2, p3], Vector((-1, 0, 0)))
    face('wood', [p0, p1, p2, p3], Vector((1, 0, 0)))

# ---------------------------------------------------------------- флигели
def flank_walls(F, L, bays_start, step, rows=True, nwin=None, holes_extra=None, cornice=True, ztop=PODT):
    holes = list(holes_extra or [])
    u = bays_start
    while u < L - 1.6:
        holes.append(win(F, u, 1.35, 1.5, 2.8))
        holes.append(win(F, u, 5.4, 1.5, 2.6))
        u += step
    seg(F, L, holes, ztop=ztop, cornice=cornice)

def north_annex():
    # северная стена
    F, L = FRM((AN1, BN0), (AN0, BN0), (30, -5))
    flank_walls(F, L, 3.0, 4.0)
    # западная стена (торец у фасада)
    Fw, Lw = FRM((AN0, BN0), (AN0, 0.0), (30, -5))
    flank_walls(Fw, Lw, 4.4, 5.0, ztop=PODT)
    # заполнение под скатом на западной стене: от 9.55 до линии ската
    zl = lambda b: PODT + 0.05 + SH * (b - BN0)
    zhi = zl(BNL)
    # треугольник-щека и прямоугольник до b=0
    face('wall', [PT(AN0, BN0, PODT), PT(AN0, BNL, PODT), PT(AN0, BNL, zhi)], Vector((-1, 0, 0)))
    face('wall', [PT(AN0, BNL, PODT), PT(AN0, 0.0, PODT), PT(AN0, 0.0, zhi), PT(AN0, BNL, zhi)], Vector((-1, 0, 0)))
    # восточный торец
    Fe, Le = FRM((AN1, BNL), (AN1, BN0), (40, -5))
    flank_walls(Fe, Le, 4.9, 5.0, ztop=PODT)
    face('wall', [PT(AN1, BN0, PODT), PT(AN1, BNL, PODT), PT(AN1, BNL, zhi)], Vector((1, 0, 0)))
    # стена к «колодцу» (b=-0.7), смотрит на юг
    Fn, Ln = FRM((Ae, BNL), (AN1, BNL), (43, -5))
    wall(Fn, 0, Ln, PL, zhi, 0, [win(Fn, Ln / 2, 1.35, 1.5, 2.8), win(Fn, Ln / 2, 5.4, 1.5, 2.6)])
    box('stone', Fn, 0, Ln, -0.3, 0.08, -3.0, PL)
    box('trim', Fn, -0.04, Ln + 0.04, -0.3, 0.14, PL - 0.06, PL + 0.08)
    # скат
    face('roof', [PT(AN0, BN0, PODT + 0.05), PT(AN1, BN0, PODT + 0.05), PT(AN1, BNL, zhi), PT(AN0, BNL, zhi)], UP)
    beam('trim', PT(AN0 - 0.1, BN0 - 0.02, PODT + 0.03), PT(AN1 + 0.1, BN0 - 0.02, PODT + 0.03), 0.1, 0.1)
    # заливка между скатом флигеля и верхней стеной зала
    fill = Frame(W(*AB(AN0, BNL)), W(*AB(1, 0)) - W(*AB(0, 0)), W(*AB(0, 1)) - W(*AB(0, 0)))
    box('wall', fill, 0, Ae - AN0, 0, INS - BNL, PODT, zhi, bottom=False)
    box('trim', fill, -0.05, Ae - AN0 + 0.05, -0.05, INS - BNL, zhi, zhi + 0.06)

def south_annex():
    F, L = FRM((AS0, BS1), (AS1, BS1), (30, 25))
    flank_walls(F, L, 3.0, 4.0)
    Fw, Lw = FRM((AS0, HW), (AS0, BS1), (30, 25))
    flank_walls(Fw, Lw, 4.9, 5.0, ztop=PODT)
    zl = lambda b: PODT + 0.05 + SH * (BS1 - b)
    zhi = zl(BSL)
    face('wall', [PT(AS0, BS1, PODT), PT(AS0, BSL, PODT), PT(AS0, BSL, zhi)], Vector((-1, 0, 0)))
    face('wall', [PT(AS0, BSL, PODT), PT(AS0, HW, PODT), PT(AS0, HW, zl(HW)), PT(AS0, BSL, zhi)], Vector((-1, 0, 0)))
    Fe, Le = FRM((AS1, BS1), (AS1, BSL), (40, 25))
    flank_walls(Fe, Le, 4.9, 5.0, ztop=PODT)
    face('wall', [PT(AS1, BS1, PODT), PT(AS1, BSL, PODT), PT(AS1, BSL, zhi)], Vector((1, 0, 0)))
    Fn, Ln = FRM((AS1, BSL), (Ae, BSL), (43, 25))
    wall(Fn, 0, Ln, PL, zhi, 0, [win(Fn, Ln / 2, 1.35, 1.5, 2.8), win(Fn, Ln / 2, 5.4, 1.5, 2.6)])
    box('stone', Fn, 0, Ln, -0.3, 0.08, -3.0, PL)
    box('trim', Fn, -0.04, Ln + 0.04, -0.3, 0.14, PL - 0.06, PL + 0.08)
    face('roof', [PT(AS0, BS1, PODT + 0.05), PT(AS1, BS1, PODT + 0.05), PT(AS1, BSL, zhi), PT(AS0, BSL, zhi)], UP)
    beam('trim', PT(AS0 - 0.1, BS1 + 0.02, PODT + 0.03), PT(AS1 + 0.1, BS1 + 0.02, PODT + 0.03), 0.1, 0.1)
    # заливка между скатом и верхней стеной зала
    fill = Frame(W(*AB(AS0, HW - INS)), W(*AB(1, 0)) - W(*AB(0, 0)), W(*AB(0, 1)) - W(*AB(0, 0)))
    box('wall', fill, 0, Ae - AS0, 0, BSL - (HW - INS), PODT, zhi, bottom=False)
    box('trim', fill, -0.05, Ae - AS0 + 0.05, 0, BSL - (HW - INS) + 0.05, zhi, zhi + 0.06)

def hall_east():
    """Восточный торец зала в «колодце» между флигелями: стена и фронтон."""
    F, L = FRM((Ae, BSL), (Ae, BNL), (30, 10))      # u с юга на север (вправо для зрителя с востока)
    cu = BSL - HW / 2
    zhi_n, zhi_s = PODT + 0.05 + SH * (BNL - BN0), PODT + 0.05 + SH * (BS1 - BSL)
    holes = []
    for b in (3.9, 9.95, 16.0):
        u = BSL - b
        holes.append(win(F, u, 1.35, 1.5, 2.8))
        holes.append(win(F, u, 5.4, 1.5, 2.6))
    seg(F, L, holes, ztop=PODT, cornice=True, ext=0.3)
    uu0, uu1 = BSL - (HW - INS), BSL - INS
    wall(F, 0, L, PODT, 12.4, 0, [])
    wall(F, uu0, uu1, 12.4, EAVE, 0, [])
    # выступ в уровне ската: нечего — стена цельная до 12.4, выше узкая часть
    gable_wall(F, (uu0 + uu1) / 2, (uu1 - uu0) / 2)

# ---------------------------------------------------------------- сборка
F0, apex = build_front()
hall_free_sides()
hall_upper_sides()
hall_roof(apex)
north_annex()
south_annex()
hall_east()

finish('cki', __file__)
