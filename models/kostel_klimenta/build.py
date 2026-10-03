# Костёл Климента Римского (б. кинотеатр «Дружба»), Севастополь, ул. Шмидта 1 — модель с нуля.
#
#   blender -b --python models/kostel_klimenta/build.py -- [glb] [tower]
#
# Без аргумента tower — здание таким, каким оно стоит сегодня (по фото 2010 и 2020-х):
# неоготический нефт 1911 года со ступенчатыми контрфорсами и слепыми стрельчатыми
# нишами, многогранная апсида и белая стеклянная пристройка 1958–60 гг. спереди.
# Башни в натуре НЕТ: по проекту Терецкого её собирались поставить над центральным нефом,
# но не построили. С аргументом tower собирается «проектный» вариант с башней-шпилем
# (имя kostel_klimenta_tower) — на случай, если в игре нужна именно башня.
#
# План — контур OSM way 91446750 (прямоугольник 15.4 × 33.9 м). Ноль высоты и начало
# координат — середина главного фасада (восточный торец) у ступеней входа.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

TOWER = 'tower' in ARGS
NAME = 'kostel_klimenta_tower' if TOWER else 'kostel_klimenta'

A_ = (-215.4, 1708.5); B_ = (-220.8, 1694.1); C_ = (-189.0, 1682.3); D_ = (-183.6, 1696.7)
MID = ((C_[0] + D_[0]) / 2, (C_[1] + D_[1]) / 2)          # середина главного фасада
origin(*MID)

COL['wall'] = ((0.80, 0.74, 0.58), 0.9)      # нефт: охристо-кремовая штукатурка
COL['wall2'] = ((0.88, 0.87, 0.82), 0.9)     # пристройка: беленый бетон
COL['wall3'] = ((0.14, 0.20, 0.38), 0.8)     # синий баннер с мозаикой св. Климента
COL['trim'] = ((0.84, 0.79, 0.64), 0.9)
COL['stone'] = ((0.56, 0.56, 0.54), 0.95)
COL['roof'] = ((0.40, 0.25, 0.20), 0.7)      # ржавая кровельная жесть
COL['glass'] = ((0.08, 0.11, 0.14), 0.15)

# рамка главного фасада: u — вправо (на север), n — наружу (на восток-северо-восток)
u0 = (W(*C_) - W(*D_)).normalized()
n0 = Vector((-u0.y, u0.x))
if n0.dot(W(*A_) - W(*MID)) > 0: n0 = -n0
F = Frame(W(*MID), u0, n0)

HW = 7.7               # полуширина по контуру
BOXD = 7.5             # глубина пристройки
GAB = 1.0              # передний щипец нефа стоит почти вплотную за парапетом пристройки
NAVE_END = 30.0        # конец нефа (дальше апсида до 33.9)
BOXH = 10.5            # парапет пристройки
EAVE = 9.4             # низ кровли нефа
WALLTOP = 8.4          # низ главного карниза нефа
RISE = (HW - 0.25) * math.tan(math.radians(24))
APEX = EAVE + RISE     # ~12.7

# ------------------------------------------------------------------ свои примитивы
def arch_pts(cu, zs, w, N=7):
    """Стрельчатая дуга из двух радиусов (равносторонняя): (u, z) слева направо."""
    pts = []
    cx = cu + w / 2
    for k in range(N + 1):
        th = math.radians(180 - 60 * k / N)
        pts.append((cx + w * math.cos(th), zs + w * math.sin(th)))
    cx = cu - w / 2
    for k in range(1, N + 1):
        th = math.radians(60 - 60 * k / N)
        pts.append((cx + w * math.cos(th), zs + w * math.sin(th)))
    return pts

def strip(Fr, po, pi, d, pr, cen):
    """Лента-наличник между двумя ломаными, приподнятая на pr."""
    for i in range(len(po) - 1):
        A, B, C, D = po[i], po[i + 1], pi[i + 1], pi[i]
        face('trim', [Fr.p(A[0], d + pr, A[1]), Fr.p(B[0], d + pr, B[1]),
                      Fr.p(C[0], d + pr, C[1]), Fr.p(D[0], d + pr, D[1])], Fr.N())
        mo = ((A[0] + B[0]) / 2, (A[1] + B[1]) / 2)
        mi = ((C[0] + D[0]) / 2, (C[1] + D[1]) / 2)
        c = Fr.p(cen[0], d, cen[1])
        face('trim', [Fr.p(A[0], d, A[1]), Fr.p(B[0], d, B[1]), Fr.p(B[0], d + pr, B[1]), Fr.p(A[0], d + pr, A[1])],
             Fr.p(mo[0], d, mo[1]) - c)
        face('trim', [Fr.p(D[0], d, D[1]), Fr.p(C[0], d, C[1]), Fr.p(C[0], d + pr, C[1]), Fr.p(D[0], d + pr, D[1])],
             c - Fr.p(mi[0], d, mi[1]))

def niche(Fr, cu, d, zb, zsp, wi=1.55, ring=0.22, pr=0.12, blocks=True):
    """Слепая стрельчатая ниша: рамка-архивольт с уступами по бокам."""
    wo = wi + 2 * ring
    po = [(cu - wo / 2, zb)] + arch_pts(cu, zsp, wo) + [(cu + wo / 2, zb)]
    pi = [(cu - wi / 2, zb)] + arch_pts(cu, zsp, wi) + [(cu + wi / 2, zb)]
    strip(Fr, po, pi, d, pr, (cu, zsp))
    if blocks:
        for s in (-1, 1):
            for zz, hh in ((zb + 0.5, 0.34), (zb + 1.7, 0.30)):
                box('trim', Fr, cu + s * (wo / 2 + 0.16) - 0.16, cu + s * (wo / 2 + 0.16) + 0.16, d, d + pr + 0.04, zz, zz + hh)

def oculus(Fr, cu, zc, d, Ro=1.1, Ri=0.78, pr=0.16):
    n = 18
    po = [(cu + Ro * math.cos(2 * math.pi * k / n), zc + Ro * math.sin(2 * math.pi * k / n)) for k in range(n + 1)]
    pi = [(cu + Ri * math.cos(2 * math.pi * k / n), zc + Ri * math.sin(2 * math.pi * k / n)) for k in range(n + 1)]
    strip(Fr, po, pi, d, pr, (cu, zc))
    face('glass', [Fr.p(cu + Ri * math.cos(2 * math.pi * k / n), d + 0.03, zc + Ri * math.sin(2 * math.pi * k / n)) for k in range(n)], Fr.N())
    box('trim', Fr, cu - 0.03, cu + 0.03, d + 0.03, d + 0.08, zc - Ri, zc + Ri)
    box('trim', Fr, cu - Ri, cu + Ri, d + 0.03, d + 0.08, zc - 0.03, zc + 0.03)
    # «замочная скважина»: рельефные ножки вниз от кольца
    for s in (-1, 1):
        box('trim', Fr, cu + s * (Ro + 0.14) - 0.09, cu + s * (Ro + 0.14) + 0.09, d, d + 0.08, zc - 3.2, zc + 0.2)
    box('trim', Fr, cu - Ro - 0.23, cu + Ro + 0.23, d, d + 0.08, zc - 3.3, zc - 3.1)

def pier(Fs, sc, z0=1.0, w=0.9, back=-0.75):
    """Контрфорс: шахта и ступенчатая консоль под карнизом."""
    h = w / 2
    box('wall', Fs, sc - h, sc + h, back, 0.0, z0, WALLTOP - 1.0)
    box('trim', Fs, sc - h - 0.08, sc + h + 0.08, back, 0.10, 3.2, 3.7)      # уступы на высоте
    box('trim', Fs, sc - h - 0.05, sc + h + 0.05, back, 0.07, 5.3, 5.7)
    box('trim', Fs, sc - h - 0.04, sc + h + 0.04, back, 0.12, WALLTOP - 1.0, WALLTOP - 0.65)
    box('trim', Fs, sc - h - 0.10, sc + h + 0.10, back, 0.23, WALLTOP - 0.65, WALLTOP - 0.32)
    box('trim', Fs, sc - h - 0.18, sc + h + 0.18, back, 0.34, WALLTOP - 0.32, WALLTOP)

def box_cornice(Fr, a, b, d, z, pr=0.25):
    band(Fr, a, b, d, z, z + 0.14, 0.07, 'wall2')
    band(Fr, a - 0.08, b + 0.08, d, z + 0.14, z + 0.40, pr, 'wall2')

# ================================================================== ПРИСТРОЙКА 1958–60 (главный фасад)
def build_front():
    # парапет 10.5, три проёма снизу, два яруса окон, синий баннер над входом
    holes = [(-6.4, -2.9, 0.45, 2.95), (-6.4, -2.9, 4.7, 8.8),
             (2.7, 6.7, 0.45, 2.95), (2.7, 6.7, 4.7, 8.8),
             (-1.95, 1.95, 0.55, 3.0)]
    wall(F, -HW, HW, -3.0, BOXH, 0, holes, m='wall2', rm='wall2')
    for ua, ub, za, zb in holes[:4]:
        glazing(F, ua, ub, za, zb, 0, cols=3, rows=(0.5, 0.8) if za > 3 else (0.72,))
    glazing(F, -1.95, 1.95, 0.55, 3.0, 0, cols=4, rows=(0.76,))
    # цоколь на простенках, пояса, венчающий карниз
    box('stone', F, -HW, HW, -0.3, 0.09, -3.0, 0.6)
    band(F, -HW, HW, 0, 3.0, 3.1, 0.05, 'wall2')
    band(F, -HW, HW, 0, 4.6, 4.7, 0.05, 'wall2')
    band(F, -HW, HW, 0, 8.8, 8.95, 0.06, 'wall2')
    box_cornice(F, -HW, HW, 0, BOXH - 0.45)
    # баннер
    box('wall3', F, -1.9, 1.9, 0, 0.05, 3.15, 8.9)
    cen = (0, 5.9)
    n = 12
    face('wall', [F.p(0 + 0.42 * math.cos(2 * math.pi * k / n), 0.08, 7.55 + 0.5 * math.sin(2 * math.pi * k / n)) for k in range(n)], F.N())
    face('wall', [F.p(-0.55, 0.08, 7.0), F.p(0.55, 0.08, 7.0), F.p(1.15, 0.08, 4.0), F.p(-1.15, 0.08, 4.0)], F.N())
    box('trim', F, -0.07, 0.07, 0.08, 0.1, 4.6, 6.8)
    # крыльцо: три ступени
    for i in range(3):
        box('stone', F, -4.4, 4.4, 0, 0.62 * (3 - i) - 0.0, -0.2 if i else -3.0, 0.18 * (3 - i))
    # боковые стены пристройки
    for s in (-1, 1):
        Fs = Frame(F.p(s * HW, 0, 0).xy, -F.n, F.u * s)
        sh = [(1.3, 4.9, 0.45, 2.95), (1.3, 4.9, 4.7, 8.8)]
        wall(Fs, 0, BOXD, -3.0, BOXH, 0, sh, m='wall2', rm='wall2')
        for ua, ub, za, zb in sh:
            glazing(Fs, ua, ub, za, zb, 0, cols=3, rows=(0.5, 0.8) if za > 3 else (0.72,))
        box('stone', Fs, 0, BOXD, -0.3, 0.09, -3.0, 1.0)
        band(Fs, 0, BOXD, 0, 3.0, 3.1, 0.05, 'wall2')
        band(Fs, 0, BOXD, 0, 4.6, 4.7, 0.05, 'wall2')
        band(Fs, 0, BOXD, 0, 8.8, 8.95, 0.06, 'wall2')
        box_cornice(Fs, 0, BOXD, 0, BOXH - 0.45)
        if s == 1:      # водосточная труба у стыка с нефом
            beam('metal', Fs.p(5.4, 0.12, 0.2), Fs.p(5.4, 0.12, 10.0), 0.14)
    # плоская кровля пристройки
    face('roof', [F.p(-HW, BOXD * -1, BOXH), F.p(HW, -BOXD, BOXH), F.p(HW, 0, BOXH), F.p(-HW, 0, BOXH)], UP)
    face('wall2', [F.p(-HW, 0.0, BOXH), F.p(HW, 0.0, BOXH), F.p(HW, 0.0, BOXH - 0.1), F.p(-HW, 0.0, BOXH - 0.1)], F.N())
    # блоки-дымники на парапете: по углам и по сторонам от щипца
    for cu in (-7.1, -4.4, 4.4, 7.1):
        w = 1.2 if abs(cu) > 5 else 1.1
        box('wall2', F, cu - w / 2, cu + w / 2, -1.2, 0.0, BOXH, BOXH + 1.3)
        box('trim', F, cu - w / 2 - 0.08, cu + w / 2 + 0.08, -1.28, 0.08, BOXH + 1.3, BOXH + 1.45)
    # большой деревянный крест перед входом слева
    box('wood', F, -5.4, -5.1, 1.0, 1.25, 0.0, 6.8)
    box('wood', F, -6.95, -3.55, 1.0, 1.25, 5.2, 5.5)
    box('trim', F, -5.5, -5.0, 1.0, 1.28, 4.0, 5.2)

# ================================================================== НЕФ 1911
def build_nave():
    pc = [8.0 + 4.31 * i for i in range(6)]
    for s in (-1, 1):
        Fs = Frame(F.p(s * HW, 0, 0).xy, -F.n, F.u * s)
        back = -0.75
        wall(Fs, BOXD, NAVE_END, -3.0, WALLTOP, back, [], m='wall')
        box('stone', Fs, BOXD, NAVE_END, back - 0.05, 0.12, -3.0, 1.0)
        band(Fs, BOXD, NAVE_END, back + 0.12, 1.0, 1.12, 0.0 + 0.0, 'trim')      # верхний срез цоколя
        for c in pc:
            pier(Fs, c)
        for i in range(5):
            cu = (pc[i] + pc[i + 1]) / 2
            if i == 0:
                oculus(Fs, cu, 6.6, back)
            else:
                niche(Fs, cu, back, 2.9, 5.2)
        # главный карниз: полка, затем парапет
        box('trim', Fs, BOXD, NAVE_END, back, 0.22, WALLTOP, WALLTOP + 0.3)
        box('trim', Fs, BOXD, NAVE_END, back, 0.12, WALLTOP + 0.3, WALLTOP + 0.45)
        box('wall', Fs, BOXD, NAVE_END, back, back + 0.55, WALLTOP + 0.45, EAVE)
        band(Fs, BOXD, NAVE_END, back + 0.05, EAVE - 0.14, EAVE, 0.08, 'trim')
    # дверь на южной стороне в третьем пролёте (с двумя ступенями)
    Fs = Frame(F.p(-HW, 0, 0).xy, -F.n, F.u * -1)
    cu = (pc[2] + pc[3]) / 2
    box('wood', Fs, cu - 0.85, cu + 0.85, -0.78, -0.62, 1.0, 3.0)
    box('trim', Fs, cu - 1.05, cu - 0.85, -0.78, -0.55, 1.0, 3.2)
    box('trim', Fs, cu + 0.85, cu + 1.05, -0.78, -0.55, 1.0, 3.2)
    box('trim', Fs, cu - 1.05, cu + 1.05, -0.78, -0.55, 3.0, 3.2)
    for i in range(2):
        box('stone', Fs, cu - 1.3, cu + 1.3, -0.75, 0.9 - 0.45 * i, -3.0, 0.5 - 0.25 * i)
    # окна в цоколе первого пролёта (северная сторона)
    Fn = Frame(F.p(HW, 0, 0).xy, -F.n, F.u)
    cu = (pc[0] + pc[1]) / 2
    box('trim', Fn, cu - 0.8, cu + 0.8, -0.8, 0.14, 0.15, 1.0)
    glazing(Fn, cu - 0.65, cu + 0.65, 0.2, 0.95, 0.1, cols=2, rows=(0.5,), reveal=0.0)
    # торцевые стены: передний щипец над пристройкой, задняя стена
    prism_uz('wall', F, [(-HW + 0.25, EAVE), (HW - 0.25, EAVE), (0, APEX)], -GAB - 0.2, -GAB)
    for s in (-1, 1):
        beam('trim', F.p(s * (HW - 0.15), -GAB + 0.1, EAVE - 0.05), F.p(0, -GAB + 0.1, APEX + 0.03), 0.16, 0.26)
    FR = Frame(F.p(HW, -NAVE_END, 0).xy, -F.u, -F.n)
    wall(FR, 0.25, 2 * HW - 0.25, -3.0, EAVE, 0, [], m='wall')
    prism_uz('wall', FR, [(0.25, EAVE), (2 * HW - 0.25, EAVE), (HW, APEX)], -0.2, 0)
    box('stone', FR, 0.25, 2 * HW - 0.25, -0.05, 0.12, -3.0, 1.0)
    band(FR, 0.0, 2 * HW, 0, WALLTOP, WALLTOP + 0.3, 0.22, 'trim')
    for cu in (1.75, 2 * HW - 1.75):
        niche(FR, cu, 0, 2.4, 4.9, wi=1.5)
    for s in (-1, 1):
        beam('trim', FR.p(HW + s * (HW - 0.15), 0.1, EAVE - 0.05), FR.p(HW, 0.1, APEX + 0.03), 0.16, 0.26)
    # крест на щипце (над передним щипцом)
    if not TOWER: beam('metal', F.p(0, -GAB, APEX), F.p(0, -GAB, APEX + 1.7), 0.14, 0.14)
    if not TOWER: beam('metal', F.p(-0.5, -GAB, APEX + 1.25), F.p(0.5, -GAB, APEX + 1.25), 0.12, 0.12)
    # двускатная кровля
    for s in (-1, 1):
        face('roof', [F.p(s * (HW - 0.25), -GAB, EAVE), F.p(s * (HW - 0.25), -NAVE_END, EAVE),
                      F.p(0, -NAVE_END, APEX), F.p(0, -GAB, APEX)], F.U() * s + UP)
    beam('roof', F.p(0, -GAB, APEX + 0.05), F.p(0, -NAVE_END, APEX + 0.05), 0.3, 0.16)
    # вентшахты на кровле
    for cu, dd in ((-2.6, -14.0), (2.6, -19.5), (-2.6, -25.0)):
        zr = EAVE + (HW - 0.25 - abs(cu)) * math.tan(math.radians(24))
        box('roof', F, cu - 0.45, cu + 0.45, dd - 0.45, dd + 0.45, zr - 0.3, zr + 1.1)
        box('trim', F, cu - 0.55, cu + 0.55, dd - 0.55, dd + 0.55, zr + 1.1, zr + 1.22)

# ================================================================== АПСИДА
def build_apse():
    P = [(-3.9, -NAVE_END), (-2.6, -33.9), (2.6, -33.9), (3.9, -NAVE_END)]
    H, CORN = 7.2, 7.6
    cen = F.p(0, -32.0, 0).xy
    for i in range(3):
        a = F.p(P[i][0], P[i][1], 0).xy; b = F.p(P[i + 1][0], P[i + 1][1], 0).xy
        u = (b - a).normalized(); L = (b - a).length
        nn = Vector((-u.y, u.x))
        if nn.dot(cen - a) > 0: nn = -nn
        Fa = Frame(a, u, nn)
        wall(Fa, 0, L, -3.0, H, 0, [], m='wall')
        box('stone', Fa, 0, L, -0.05, 0.1, -3.0, 1.0)
        band(Fa, -0.15, L + 0.15, 0, H, H + 0.18, 0.12, 'trim')
        band(Fa, -0.25, L + 0.25, 0, H + 0.18, CORN, 0.26, 'trim')
        niche(Fa, L / 2, 0, 1.9, 4.2, wi=1.7 if i == 1 else 1.4, pr=0.1)
    for (uu, dd) in P:
        c = F.p(uu, dd, 0)
        box('wall', F, uu - 0.42, uu + 0.42, dd - 0.42, dd + 0.42, 1.0, H - 0.9)
        box('trim', F, uu - 0.52, uu + 0.52, dd - 0.52, dd + 0.52, H - 0.9, H - 0.55)
        box('trim', F, uu - 0.62, uu + 0.62, dd - 0.62, dd + 0.62, H - 0.55, H - 0.2)
        box('trim', F, uu - 0.50, uu + 0.50, dd - 0.50, dd + 0.50, 3.0, 3.4)
    # кровля апсиды: три ската к коньку у задней стены нефа
    k = 1.07
    Q = [(u * k, -32.0 + (d + 32.0) * 1.1) for (u, d) in P]
    z0, z1 = CORN, CORN + 2.6
    R0 = F.p(0, -NAVE_END - 0.2, z1); R1 = F.p(0, -31.6, z1)
    E = [F.p(u, d, z0) for (u, d) in Q]
    face('roof', [E[0], E[1], R1, R0], UP - F.U())
    face('roof', [E[1], E[2], R1], UP - F.N())
    face('roof', [E[2], E[3], R0, R1], UP + F.U())
    face('trim', [E[0], E[1], E[2], E[3]], -UP)
    beam('roof', R0 + UP * 0.04, R1 + UP * 0.04, 0.24, 0.14)

# ================================================================== ПРОЕКТНАЯ БАШНЯ (только с аргументом tower)
def build_tower():
    d1, d0 = -GAB - 0.2, -GAB - 6.6        # башня встаёт за парапетом, над входом
    cd = (d0 + d1) / 2
    HT = 3.2
    z0, z1, z2, z3 = 7.5, 14.6, 23.3, 25.4
    # четыре фасада
    for k in range(4):
        ang = k * math.pi / 2
        # рамка стороны: центр на оси башни
        ctr = F.p(0, cd, 0).xy
        fu = Vector((math.cos(ang), math.sin(ang)))
        outv = Vector((-fu.y, fu.x))
        # u и n рамки заданы в плоскости Blender через F
        U = F.u * math.cos(ang) + F.n * math.sin(ang)
        N = -F.u * math.sin(ang) + F.n * math.cos(ang)
        Ft = Frame(ctr - U * HT + N * HT, U, N)
        # (центр - U*HT) + N*HT : левый-нижний угол стороны, смотрящей по N
        L = 2 * HT
        wall(Ft, 0, L, z0, z2, 0, [], m='wall')
        wall(Ft, 0, L, z2, z3 + 1.0, 0, [], m='wall')
        # ступени: пояс, нижний ярус — слепые ланцеты, верхний — звонница
        band(Ft, -0.05, L + 0.05, 0, z1, z1 + 0.4, 0.2, 'trim')
        niche(Ft, L * 0.3, 0, 9.0, 11.5, wi=0.9, ring=0.2, pr=0.1, blocks=False)
        niche(Ft, L * 0.7, 0, 9.0, 11.5, wi=0.9, ring=0.2, pr=0.1, blocks=False)
        for cu in (L * 0.3, L * 0.7):
            zs = 19.0
            pts = [(cu - 0.65, 15.9)] + arch_pts(cu, zs, 1.3) + [(cu + 0.65, 15.9)]
            pi = [(cu - 0.65 + 0.001, 15.9)] + arch_pts(cu, zs, 1.3) + [(cu + 0.65 - 0.001, 15.9)]
            face('glass', [Ft.p(u, -0.08, z) for u, z in pts], Ft.N())
            po = [(cu - 0.9, 15.9)] + arch_pts(cu, zs, 1.8) + [(cu + 0.9, 15.9)]
            strip(Ft, po, pts, 0, 0.14, (cu, zs))
            for t in range(5):                      # жалюзи
                zz = 16.4 + t * 0.55
                if zz + 0.08 < zs:
                    box('trim', Ft, cu - 0.62, cu + 0.62, -0.12, 0.02, zz, zz + 0.08)
        band(Ft, -0.2, L + 0.2, 0, z2, z2 + 0.45, 0.35, 'trim')
        band(Ft, -0.1, L + 0.1, 0, z2 + 0.45, z3, 0.2, 'wall')
        band(Ft, -0.35, L + 0.35, 0, z3, z3 + 0.4, 0.5, 'trim')
        # угловые контрфорсы со ступенями: по два на угол
    for sx in (-1, 1):
        for sd in (-1, 1):
            cu = sx * (HT + 0.2); cdd = cd + sd * (HT + 0.2)
            for (zz0, zz1, w) in ((z0, 12.0, 0.8), (12.0, z1 + 0.4, 0.66), (z1 + 0.4, z2 - 0.3, 0.54)):
                box('wall', F, cu - w / 2, cu + w / 2, cdd - w / 2, cdd + w / 2, zz0, zz1)
            box('trim', F, cu - 0.45, cu + 0.45, cdd - 0.45, cdd + 0.45, 12.0, 12.35)
            box('trim', F, cu - 0.5, cu + 0.5, cdd - 0.5, cdd + 0.5, z1 + 0.4, z1 + 0.75)
            # пинакль над углом
            zb = z3 + 0.4
            box('trim', F, cu - 0.42, cu + 0.42, cdd - 0.42, cdd + 0.42, z2 - 0.3, z3 + 0.4)
            box('wall', F, cu - 0.32, cu + 0.32, cdd - 0.32, cdd + 0.32, zb, zb + 1.2)
            apex = F.p(cu, cdd, zb + 3.0)
            ring = [F.p(cu + a * 0.38, cdd + b * 0.38, zb + 1.2) for a, b in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
            for i in range(4):
                face('roof', [ring[i], ring[(i + 1) % 4], apex], (ring[i] + ring[(i + 1) % 4]) / 2 - F.p(cu, cdd, zb + 1.2) + UP * 0.3)
    # восьмигранный шпиль над площадкой
    zb = z3 + 0.4
    R = HT - 0.15
    ro = R / math.cos(math.pi / 8)
    ap = F.p(0, cd, zb + 13.5)
    oct_ = [F.p(ro * math.cos(math.pi / 8 + k * math.pi / 4), cd + ro * math.sin(math.pi / 8 + k * math.pi / 4), zb) for k in range(8)]
    c0 = F.p(0, cd, zb)
    for k in range(8):
        a, b = oct_[k], oct_[(k + 1) % 8]
        face('roof', [a, b, ap], (a + b) / 2 - c0 + UP * 0.6)
        # рёбра шпиля
        beam('trim', a, ap - (ap - a).normalized() * 0.05, 0.16, 0.16)
    face('roof', oct_, -UP)
    # люкарны на четырёх гранях шпиля
    for k in range(4):
        ang = k * math.pi / 2
        U = F.u * math.cos(ang) + F.n * math.sin(ang)
        N = -F.u * math.sin(ang) + F.n * math.cos(ang)
        base = F.p(0, cd, 0).xy + N * (R - 0.05)
        Fl = Frame(base - U * 0.0, U, N)
        zl = zb + 1.3
        poly = [(-0.45, zl), (0.45, zl), (0.45, zl + 0.9), (0, zl + 1.7), (-0.45, zl + 0.9)]
        prism_uz('wall', Fl, poly, -0.9 + 0.2, 0.1)
        face('glass', [Fl.p(-0.28, 0.12, zl + 0.1), Fl.p(0.28, 0.12, zl + 0.1), Fl.p(0.28, 0.12, zl + 0.8), Fl.p(0, 0.12, zl + 1.3), Fl.p(-0.28, 0.12, zl + 0.8)], Fl.N())
    # шар и крест
    beam('metal', F.p(0, cd, zb + 13.4), F.p(0, cd, zb + 15.6), 0.16, 0.16)
    beam('metal', F.p(-0.55, cd, zb + 14.9), F.p(0.55, cd, zb + 14.9), 0.13, 0.13)

build_front()
build_nave()
build_apse()
if TOWER:
    build_tower()
finish(NAME, __file__)
