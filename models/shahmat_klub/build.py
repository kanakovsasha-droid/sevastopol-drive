# Центральный шахматный клуб (бывший), Большая Морская, 50 — модель с нуля.
#
#   blender -b --python models/shahmat_klub/build.py -- [glb]
#
# Контур OSM way 166878776 — длинный корпус вдоль Б. Морской, повёрнутый на
# ~15° к осям мира, с выступом к улице и полуротондой на его торце. План в
# местной системе: a — вдоль длинной оси (на юго-юго-восток), b — поперёк,
# к улице (на восток-северо-восток). Прямоугольники (a, b в метрах, рёбра
# контура ложатся на сетку с точностью 0.2 м):
#   NW  северное крыло         a −68.4…−26.1, b −31.6…−18.5
#   NL  северная связка        a −26.1…−20.8, b −33.6…−17.1
#   X   средний корпус         a −20.8…17.7,  b −38.4…−23.5
#   SL  южная связка           a  17.7…23.1,  b −34.7…−18.4
#   SW  южное крыло            a  23.1…65.3,  b −33.0…−19.8
#   C   выступ к улице         a  −7.4…5.4,   b −23.5…−9.0
#   F   торец с ротондой       a −10.0…8.0,   b  −9.0…−2.3
# Ротонда — полукруг на торце F, ось в (a −0.5, b −2.3), контур OSM обводит
# ступени (радиус 6.1). Что видно на фото и что наугад — NOTES.md.
# Ноль высоты — земля у нижней ступени ротонды.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

# ------------------------------------------------------------------ местная система
SA = (0.2581, 0.9661)                          # +a в мире (x, z)
SB = (SA[1], -SA[0])                           # +b в мире
O = (-192.0, 1549.5)

def LW(a, b):
    return (O[0] + a * SA[0] + b * SB[0], O[1] + a * SA[1] + b * SB[1])

CA, CB = -0.5, -2.3                            # ось ротонды
X0, Z0 = [round(c, 2) for c in LW(CA, CB + 6.1)]
origin(X0, Z0)
VA = Vector((SA[0], -SA[1]))
VB = Vector((SB[0], -SB[1]))
DIRS = {'+a': VA, '-a': -VA, '+b': VB, '-b': -VB}

def P2(a, b):
    return W(*LW(a, b))

def FR(a, b, u, n):
    return Frame(P2(a, b), DIRS[u], DIRS[n])

# ------------------------------------------------------------------ цвета
COL['wall'] = ((0.92, 0.89, 0.78), 0.9)       # кремовая штукатурка #ebe2c8
COL['wall3'] = ((0.94, 0.91, 0.83), 0.85)     # колонны и барабан чуть светлее #efe8d4
COL['trim'] = ((0.95, 0.93, 0.87), 0.85)      # карнизы, балюстрада, тяги
COL['stone'] = ((0.50, 0.48, 0.46), 0.85)     # гранит постамента и ступеней, цоколь
COL['roof'] = ((0.55, 0.56, 0.54), 0.8)       # серая кровля #8d8f8a
COL['glass'] = ((0.10, 0.12, 0.14), 0.15)
COL['wood'] = ((0.80, 0.77, 0.68), 0.9)       # швы барабанов колонн (не в дальнем уровне)
COL['metal'] = ((0.13, 0.13, 0.14), 0.5)      # двери

# скруглённые стены ротонды: гладкие нормали, в дальнем уровне
SMOOTH.update({'wall_s', 'wall3_s'}); LOD_KEEP.update({'wall_s', 'wall3_s'})

GROUND = -3.5     # к западу земля ниже на ~3 м
Z_PL = 0.7        # верх цоколя
EAVE = 13.0       # верх венчающего карниза корпусов
PAR = 13.7        # верх парапета
STEP = 3.4        # шаг осей окон (наугад)
FLOORS = ((1.5, 2.2), (5.6, 2.3), (9.6, 2.0))   # низ и высота окон трёх этажей

# ------------------------------------------------------------------ примитивы
def quad(m, F, u0, u1, z0, z1, d, hint=None):
    face(m, [F.p(u0, d, z0), F.p(u1, d, z0), F.p(u1, d, z1), F.p(u0, d, z1)], hint if hint is not None else F.N())

def slab(m, F, u0, u1, d0, d1, z0, z1, bottom=True):
    """Брусок без задней грани (полка, подоконник, кронштейн)."""
    quad(m, F, u0, u1, z0, z1, d1)
    face(m, [F.p(u0, d0, z1), F.p(u1, d0, z1), F.p(u1, d1, z1), F.p(u0, d1, z1)], UP)
    if bottom:
        face(m, [F.p(u0, d0, z0), F.p(u1, d0, z0), F.p(u1, d1, z0), F.p(u0, d1, z0)], -UP)
    face(m, [F.p(u0, d0, z0), F.p(u0, d1, z0), F.p(u0, d1, z1), F.p(u0, d0, z1)], -F.U())
    face(m, [F.p(u1, d0, z0), F.p(u1, d1, z0), F.p(u1, d1, z1), F.p(u1, d0, z1)], F.U())

def win(F, cu, za, w, h, d=0.02):
    """Окно поверх стены: стекло, крест переплёта, подоконник."""
    ua, ub = cu - w / 2, cu + w / 2
    quad('glass', F, ua, ub, za, za + h, d)
    t = 0.04
    quad('trim', F, cu - t, cu + t, za, za + h, d + 0.02)
    quad('trim', F, ua, ub, za + h * 0.7 - t, za + h * 0.7 + t, d + 0.02)
    quad('trim', F, ua - 0.1, ub + 0.1, za - 0.1, za, 0.14)                # подоконник: лицо и верх
    face('trim', [F.p(ua - 0.1, 0, za), F.p(ub + 0.1, 0, za), F.p(ub + 0.1, 0.14, za), F.p(ua - 0.1, 0.14, za)], UP)

def bays(L, step=STEP, margin=1.4):
    n = max(0, int((L - 2 * margin) / step) + 1)
    s0 = (L - (n - 1) * step) / 2
    return [s0 + i * step for i in range(n)]

# ------------------------------------------------------------------ полярная система ротонды
RC = P2(CA, CB)
def R(r, th, z):
    """Точка ротонды: радиус, угол от оси к улице (+ — к +a), высота."""
    v = VB * math.cos(th) + VA * math.sin(th)
    return Vector((RC.x + v.x * r, RC.y + v.y * r, z))

def rad_dir(th):
    v = VB * math.cos(th) + VA * math.sin(th)
    return Vector((v.x, v.y, 0))

def ring(m, r, z0, z1, th0=-math.pi / 2, th1=math.pi / 2, seg=16, out=True):
    """Цилиндрическая лента; out — нормаль наружу."""
    for k in range(seg):
        a, b = th0 + (th1 - th0) * k / seg, th0 + (th1 - th0) * (k + 1) / seg
        f = face(m, [R(r, a, z0), R(r, b, z0), R(r, b, z1), R(r, a, z1)],
                 rad_dir((a + b) / 2) * (1 if out else -1))
        if f and m in SMOOTH: f.smooth = True

def annulus(m, r0, r1, z, th0=-math.pi / 2, th1=math.pi / 2, seg=16, up=True):
    for k in range(seg):
        a, b = th0 + (th1 - th0) * k / seg, th0 + (th1 - th0) * (k + 1) / seg
        face(m, [R(r0, a, z), R(r0, b, z), R(r1, b, z), R(r1, a, z)], UP if up else -UP)

def column(r, th, z0, H, D, seg=12, drums=0.0):
    """Гладкая колонна без капители: плинт, ствол, тонкая плита сверху;
    drums — шаг горизонтальных швов (ствол сложен из барабанов)."""
    base = R(r, th, 0)
    F0 = Frame(Vector((base.x, base.y)), Vector((VA.x, VA.y)), Vector((VB.x, VB.y)))
    k = D * 0.62
    box('trim', F0, -k, k, -k, k, z0, z0 + 0.25)
    lathe('trim_s', Vector((base.x, base.y, z0 + 0.25)),
          [(D / 2, 0), (D / 2, H - 0.55)], seg, cap=False)
    box('trim', F0, -k, k, -k, k, z0 + H - 0.55, z0 + H - 0.3)
    box('trim', F0, -k - 0.05, k + 0.05, -k - 0.05, k + 0.05, z0 + H - 0.3, z0 + H)
    if drums:
        z = z0 + 0.25 + drums
        while z < z0 + H - 0.7:
            lathe('wood', Vector((base.x, base.y, z)), [(D / 2 + 0.006, 0), (D / 2 + 0.006, 0.035)], seg, cap=False)
            z += drums

def star(F, cu, cz, r, d):
    """Пятиконечная звезда барельефа."""
    pts = []
    for i in range(10):
        rr = r if i % 2 == 0 else r * 0.4
        a = math.pi / 2 + i * math.pi / 5
        pts.append((cu + rr * math.cos(a), cz + rr * math.sin(a)))
    face('trim', [F.p(u, d, z) for u, z in pts], F.N())

# ================================================================== КОРПУСА
RECTS = {
    'NW': (-68.4, -26.1, -31.6, -18.5),
    'NL': (-26.1, -20.8, -33.6, -17.1),
    'X':  (-20.8, 17.7, -38.4, -23.5),
    'SL': (17.7, 23.1, -34.7, -18.4),
    'SW': (23.1, 65.3, -33.0, -19.8),
    'C':  (-7.4, 5.4, -23.5, -9.0),
    'F':  (-10.0, 8.0, -9.0, -2.3),
}

def inside_any(a, b, skip):
    return any(r[0] < a < r[1] and r[2] < b < r[3] for k, r in RECTS.items() if k != skip)

def open_spans(key, side):
    """Открытые участки стороны прямоугольника: (рамка, [(u0, u1)])."""
    a0, a1, b0, b1 = RECTS[key]
    if side == '+b':   F, L, pt = FR(a0, b1, '+a', '+b'), a1 - a0, lambda u, e: (a0 + u, b1 + e)
    elif side == '-b': F, L, pt = FR(a1, b0, '-a', '-b'), a1 - a0, lambda u, e: (a1 - u, b0 - e)
    elif side == '+a': F, L, pt = FR(a1, b1, '-b', '+a'), b1 - b0, lambda u, e: (a1 + e, b1 - u)
    else:              F, L, pt = FR(a0, b0, '+b', '-a'), b1 - b0, lambda u, e: (a0 - e, b0 + u)
    # точки разбиения — рёбра соседей, спроецированные на сторону
    us = {0.0, L}
    for r in RECTS.values():
        for va in (r[0], r[1]):
            for vb in (r[2], r[3]):
                # u точки (va, vb) вдоль стороны
                if side == '+b': u = va - a0
                elif side == '-b': u = a1 - va
                elif side == '+a': u = b1 - vb
                else: u = vb - b0
                if 0 < u < L: us.add(round(u, 3))
    us = sorted(us)
    spans = []
    for i in range(len(us) - 1):
        m = (us[i] + us[i + 1]) / 2
        if not inside_any(*pt(m, 0.3), key):
            if spans and abs(spans[-1][1] - us[i]) < 1e-6: spans[-1][1] = us[i + 1]
            else: spans.append([us[i], us[i + 1]])
    return F, spans

def facade(F, u0, u1, no_win=(), brackets=False):
    """Оштукатуренный трёхэтажный фасад: цоколь, окна, пояс, карниз, парапет."""
    quad('wall', F, u0, u1, Z_PL, PAR, 0)
    quad('wall', F, u0, u1, PAR - 0.5, PAR, -0.3, -F.N())                # изнанка парапета
    box('stone', F, u0, u1, -0.3, 0.08, GROUND, Z_PL)
    band(F, u0, u1, 0, Z_PL, Z_PL + 0.12, 0.1)
    band(F, u0, u1, 0, 4.7, 4.95, 0.1)                                     # пояс над первым этажом
    cornice(F, u0, u1, 0, EAVE - 0.6, 0.45)
    box('trim', F, u0, u1, -0.3, 0.06, PAR - 0.12, PAR + 0.04)            # шапка парапета
    if brackets:                                                          # консоли под карнизом
        u = u0 + 0.5
        while u < u1 - 0.3:
            if not any(a + 2.9 <= u <= b - 2.9 for a, b in no_win):
                    slab('trim', F, u - 0.12, u + 0.12, 0, 0.38, EAVE - 1.1, EAVE - 0.6)
            u += 0.9
    for c in bays(u1 - u0):
        cu = u0 + c
        if any(a <= cu <= b for a, b in no_win):
            continue
        for za, h in FLOORS:
            win(F, cu, za, 1.4, h)

def build_body():
    for key in RECTS:
        for side in ('+a', '-a', '+b', '-b'):
            F, spans = open_spans(key, side)
            for u0, u1 in spans:
                if key == 'F' and side == '+b':
                    # торец за ротондой: простенки с консолями, окна — только по краям
                    facade(F, u0, u1, no_win=((CA + 10.0 - 6.6, CA + 10.0 + 6.6),), brackets=True)
                else:
                    facade(F, u0, u1)
        a0, a1, b0, b1 = RECTS[key]
        Fr = FR(a0, b0, '+a', '-b')
        face('roof', [Fr.p(0, 0, PAR - 0.5), Fr.p(a1 - a0, 0, PAR - 0.5),
                      Fr.p(a1 - a0, -(b1 - b0), PAR - 0.5), Fr.p(0, -(b1 - b0), PAR - 0.5)], UP)

# ================================================================== РОТОНДА
RW = 3.6          # радиус стены ротонды
RCOL = 4.45       # ось колонн
DCOL = 1.05
Z_POD = 0.85      # верх подиума (5 ступеней)
H_COL = 9.4
Z_ENT = Z_POD + H_COL        # низ антаблемента
Z_BAL = Z_ENT + 0.8          # пол балкона
Z_DR = Z_BAL + 3.9           # верх барабана
H = math.pi / 2

def build_rotunda():
    # ступени веером по дуге: контур OSM (r 6.1) — нижняя ступень
    n = 5
    for i in range(n):
        r = 6.1 - i * 0.22
        z = Z_POD * (i + 1) / n
        ring('stone', r, GROUND if i == 0 else Z_POD * i / n, z, -H, H, 20)
        annulus('stone', r - 0.22 if i < n - 1 else 0.0, r, z, -H, H, 20)
    # стена ротонды (цилиндр), за колоннами
    ring('wall_s', RW, Z_POD, Z_BAL, -H, H, 16)
    # колонны парами (8 шт.: на фото 8–10, сгруппированы)
    for th in (14, 30, 58, 74):
        for s in (-1, 1):
            column(RCOL, s * math.radians(th), Z_POD, H_COL, DCOL, 12, drums=1.6)
    # антаблемент над колоннами и плита балкона
    ring('wall3_s', RCOL + 0.62, Z_ENT, Z_BAL - 0.25, -H, H, 20)
    annulus('trim', RW, RCOL + 0.62, Z_ENT, -H, H, 20, up=False)
    ring('trim', RCOL + 0.8, Z_BAL - 0.25, Z_BAL, -H, H, 20)
    annulus('trim', RW, RCOL + 0.8, Z_BAL, -H, H, 20)
    annulus('trim', RCOL + 0.62, RCOL + 0.8, Z_BAL - 0.25, -H, H, 20, up=False)
    # балюстрада: тумбы над парами колонн, между ними балясины
    rb = RCOL + 0.55
    for th in (-90, -66, -22, 22, 66, 90):
        t = math.radians(th)
        b = R(rb, t, 0)
        Fp = Frame(Vector((b.x, b.y)), Vector((-rad_dir(t).y, rad_dir(t).x)), Vector((rad_dir(t).x, rad_dir(t).y)))
        box('trim', Fp, -0.22, 0.22, -0.22, 0.22, Z_BAL, Z_BAL + 1.1)
    for k in range(48):
        t = -H + math.pi * (k + 0.5) / 48
        if any(abs(math.degrees(t) - c) < 4 for c in (-66, -22, 22, 66)):
            continue
        b = R(rb, t, 0)
        Fp = Frame(Vector((b.x, b.y)), Vector((-rad_dir(t).y, rad_dir(t).x)), Vector((rad_dir(t).x, rad_dir(t).y)))
        box('trim', Fp, -0.06, 0.06, -0.06, 0.06, Z_BAL + 0.12, Z_BAL + 0.88, bottom=False)
    ring('trim', rb + 0.12, Z_BAL + 0.88, Z_BAL + 1.0, -H, H, 20)
    ring('trim', rb - 0.12, Z_BAL + 0.88, Z_BAL + 1.0, -H, H, 20, out=False)
    annulus('trim', rb - 0.12, rb + 0.12, Z_BAL + 1.0, -H, H, 20)
    ring('trim', rb + 0.1, Z_BAL, Z_BAL + 0.12, -H, H, 20)
    # центральная ось: дверь, барельеф со звездой и датой, окно над ним
    th0 = 0.0
    p0 = R(RW + 0.02, th0, 0)
    Fc = Frame(Vector((p0.x, p0.y)), Vector((VA.x, VA.y)), Vector((VB.x, VB.y)))
    quad('metal', Fc, -0.65, 0.65, Z_POD, Z_POD + 2.5, 0.02)
    slab('trim', Fc, -0.85, 0.85, 0, 0.12, Z_POD + 2.5, Z_POD + 2.7)
    quad('trim', Fc, -0.75, 0.75, 4.0, 5.1, 0.06)                          # барельеф
    star(Fc, 0, 4.6, 0.38, 0.1)
    win(Fc, 0, 6.0, 1.1, 1.5, 0.04)
    # окна между парами колонн (два нижних этажа, наугад по шагу этажей)
    for th in (-44, 44):
        t = math.radians(th)
        p = R(RW + 0.02, t, 0)
        u = Vector((-rad_dir(t).y, rad_dir(t).x))
        Fw = Frame(Vector((p.x, p.y)), u, Vector((rad_dir(t).x, rad_dir(t).y)))
        for za, hh in ((1.8, 2.2), (5.6, 2.4)):
            win(Fw, 0, za, 1.2, hh, 0.04)
    # верхний ярус: барабан с короткими колоннами и арочными окнами
    ring('wall3_s', RW, Z_BAL, Z_DR, -H, H, 16)
    ring('wall3_s', RW, PAR - 0.6, Z_DR, H, 3 * H, 16)                         # тыльная половина над кровлей
    for k in range(7):
        t = -H + math.pi * (k + 0.5) / 7
        column(RW + 0.32, t, Z_BAL, 3.3, 0.42, 8)
        if k < 6:                                                            # арочное окно между колоннами
            tw = -H + math.pi * (k + 1) / 7
            p = R(RW + 0.03, tw, 0)
            u = Vector((-rad_dir(tw).y, rad_dir(tw).x))
            Fw = Frame(Vector((p.x, p.y)), u, Vector((rad_dir(tw).x, rad_dir(tw).y)))
            w, za, hh = 1.15, Z_BAL + 0.5, 1.9
            arc = [(w / 2 * math.cos(math.pi * i / 6), za + hh + w / 2 * math.sin(math.pi * i / 6)) for i in range(7)]
            face('glass', [Fw.p(-w / 2, 0, za), Fw.p(w / 2, 0, za)] + [Fw.p(uu, 0, zz) for uu, zz in arc], Fw.N())
            quad('trim', Fw, -0.035, 0.035, za, za + hh + w / 2, 0.02)
            quad('trim', Fw, -w / 2, w / 2, za + hh - 0.035, za + hh + 0.035, 0.02)
    # карниз барабана и пологий купол
    ring('trim', RW + 0.25, Z_DR - 0.35, Z_DR, -H, 3 * H, 24)
    ring('trim', RW + 0.55, Z_DR, Z_DR + 0.3, -H, 3 * H, 24)
    annulus('trim', RW + 0.25, RW + 0.55, Z_DR, -H, 3 * H, 24, up=False)
    annulus('trim', RW, RW + 0.25, Z_DR - 0.35, -H, 3 * H, 24, up=False)
    c = R(0, 0, 0)
    lathe('roof', Vector((c.x, c.y, Z_DR + 0.3)),
          [(RW + 0.55, 0), (RW + 0.2, 0.35), (RW - 0.6, 0.85), (2.0, 1.15), (0.6, 1.3)], 24, cap=True)

build_body()
build_rotunda()
finish('shahmat_klub', __file__)
