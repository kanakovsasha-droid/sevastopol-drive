# Летняя эстрада «Ракушка» на Приморском бульваре (OSM way 1266287887, leisure=bandstand).
#
#   blender -b --python models/rakushka/build.py -- [glb]
#
# Прямоугольный портал-пилоны с аркой-раковиной в бежево-белой штукатурке, над ним балюстрада и вазы-шишки, за
# порталом цилиндр закулисья, внутри золотистая полукупольная раковина; перед ней дощатая эстрада с
# полукруглым фартуком и ступенями, амфитеатр рядов скамеек веером на ЮЗ, подпорная стенка по дуге.
# Ноль высоты — пол зрительской части.
import sys, os, random
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'mon_common'))
from mon import *

# Портал: линия от (-63.7,-120.7) до (-52.6,-108.0), фасад на ЮЗ (по спутнику tools/sat.html)
PA, PB = (-63.7, -120.7), (-52.6, -108.0)
O = ((PA[0] + PB[0]) / 2 + 0.0, (PA[1] + PB[1]) / 2)
origin(*O)
F, LEN = frame_from(PA, PB, (-48.0, -122.0))       # n — наружу от здания (в зал, на ЮЗ)
F = Frame(F.p(LEN / 2, 0, 0).xy, F.u, F.n)         # начало в середине портала

COL['wall'] = ((0.93, 0.84, 0.58), 0.9)            # бежево-жёлтая штукатурка
COL['trim'] = ((0.95, 0.94, 0.90), 0.85)           # белые пилястры, архивольт, балюстрада
COL['wall2'] = ((0.82, 0.60, 0.22), 0.7)           # золотистая обшивка раковины
COL['stone'] = ((0.55, 0.55, 0.52), 0.9)           # цоколь эстрады, подпорная стенка, ступени
COL['roof'] = ((0.50, 0.22, 0.18), 0.8)            # крыша закулисья
COL['wood'] = ((0.45, 0.30, 0.18), 0.6)            # скамьи, настил

ZD = 0.9                  # пол эстрады над залом
W, TH = 17.0, 1.2         # ширина и толщина портала
OPEN_HW, SPRING, ARCR = 5.2, 2.4, 5.2
ZC = ZD + 8.7             # низ карниза
Z_BAL = 0.9

def arch_h(u):
    if abs(u) >= OPEN_HW: return ZD
    return ZD + SPRING + math.sqrt(max(0.0, ARCR ** 2 - u * u)) * (ARCR / OPEN_HW) * 0 + (ZD * 0)

def arch_z(u):
    """Высота внутренней кромки арки над залом."""
    if abs(u) >= OPEN_HW: return ZD
    return ZD + SPRING + math.sqrt(ARCR ** 2 - u * u) * 0.98

def build_portal():
    n = 40
    us = [-W / 2 + W * i / n for i in range(n + 1)]
    for a, b in zip(us[:-1], us[1:]):
        m = (a + b) / 2
        za, zb = arch_z(a), arch_z(b)
        lo_a = za if abs(a) < OPEN_HW else ZD - 0.0
        lo_b = zb if abs(b) < OPEN_HW else ZD - 0.0
        if abs(m) < OPEN_HW:
            lo_a, lo_b = za, zb
            # свод внутри арки (раковина): низ колонны — арка; сам проём пустой
        else:
            lo_a = lo_b = ZD
        for dd, nn in ((0.0, 1.0), (-TH, -1.0)):             # лицевая и задняя грани
            q = [F.p(a, dd, lo_a), F.p(b, dd, lo_b), F.p(b, dd, ZC), F.p(a, dd, ZC)]
            face('wall', q, F.N() * nn)
        # торец проёма (откос)
        if abs(m) < OPEN_HW:
            face('trim', [F.p(a, 0, lo_a), F.p(b, 0, lo_b), F.p(b, -TH, lo_b), F.p(a, -TH, lo_a)], -UP)
    # боковые торцы
    for s in (-1, 1):
        face('wall', [F.p(s * W / 2, 0, ZD), F.p(s * W / 2, -TH, ZD), F.p(s * W / 2, -TH, ZC), F.p(s * W / 2, 0, ZC)], F.U() * s)
        # откосы проёма
        face('trim', [F.p(s * OPEN_HW, 0, ZD), F.p(s * OPEN_HW, -TH, ZD), F.p(s * OPEN_HW, -TH, ZD + SPRING), F.p(s * OPEN_HW, 0, ZD + SPRING)], -F.U() * s)
    # верх портала
    box('wall', F, -W / 2, W / 2, -TH, 0, ZC - 0.01, ZC + 0.01)
    # архивольт — белая лента вокруг арки (по дуге) и по вертикалям
    k = 24
    pts_in, pts_out = [], []
    for i in range(k + 1):
        t = math.pi * i / k
        u = ARCR * math.cos(t)
        pts_in.append((u, ZD + SPRING + ARCR * 0.98 * math.sin(t)))
        pts_out.append(((ARCR + 0.55) * math.cos(t), ZD + SPRING + (ARCR * 0.98 + 0.55) * math.sin(t)))
    for i in range(k):
        q = [F.p(*pts_in[i][:1], 0.06, pts_in[i][1]), F.p(*pts_in[i + 1][:1], 0.06, pts_in[i + 1][1]),
             F.p(*pts_out[i + 1][:1], 0.06, pts_out[i + 1][1]), F.p(*pts_out[i][:1], 0.06, pts_out[i][1])]
        face('trim', q, F.N())
        q = [F.p(*pts_out[i][:1], 0.0, pts_out[i][1]), F.p(*pts_out[i + 1][:1], 0.0, pts_out[i + 1][1]),
             F.p(*pts_out[i + 1][:1], 0.06, pts_out[i + 1][1]), F.p(*pts_out[i][:1], 0.06, pts_out[i][1])]
        face('trim', q, F.N() + UP)
    for s in (-1, 1):
        box('trim', F, s * ARCR if s > 0 else -ARCR - 0.55, (s * ARCR + 0.55) if s > 0 else -ARCR, 0.0, 0.06, ZD, ZD + SPRING)
    # пилястры белые: по краям портала и по бокам арки
    for u in (-W / 2 + 0.5, W / 2 - 0.5, -OPEN_HW - 1.4, OPEN_HW + 1.4):
        box('trim', F, u - 0.45, u + 0.45, 0.0, 0.18, ZD, ZC - 0.4)
    # междуэтажный пояс на уровне пят арки
    box('trim', F, -W / 2, -OPEN_HW - 0.55, 0.0, 0.2, ZD + SPRING - 0.25, ZD + SPRING + 0.1)
    box('trim', F, OPEN_HW + 0.55, W / 2, 0.0, 0.2, ZD + SPRING - 0.25, ZD + SPRING + 0.1)
    # филенки на боковых полях
    for s in (-1, 1):
        box('trim', F, s * 7.1 - 0.7, s * 7.1 + 0.7, 0.0, 0.05, ZD + 3.5, ZD + 6.2)
    # карниз и парапет-балюстрада
    box('trim', F, -W / 2 - 0.35, W / 2 + 0.35, -TH - 0.25, 0.6, ZC, ZC + 0.35)
    box('trim', F, -W / 2 - 0.15, W / 2 + 0.15, -TH - 0.1, 0.4, ZC + 0.35, ZC + 0.55)
    # балюстрада: стойки-балясины и поручень
    zb0, zb1 = ZC + 0.55, ZC + 0.55 + Z_BAL
    nb = 36
    for i in range(nb + 1):
        u = -W / 2 + 0.2 + (W - 0.4) * i / nb
        ellipsoid('trim_s', F.p(u, 0.28, zb0 + 0.42), 0.09, 0.09, 0.28, 6, 3)
        ellipsoid('trim_s', F.p(u, 0.28, zb0 + 0.42), 0.12, 0.12, 0.05, 6, 3)
    box('trim', F, -W / 2 - 0.1, W / 2 + 0.1, 0.12, 0.45, zb1 - 0.12, zb1)
    box('trim', F, -W / 2 - 0.1, W / 2 + 0.1, 0.12, 0.45, zb0 - 0.0, zb0 + 0.12)
    for u in (-W / 2 + 0.15, W / 2 - 0.15, -OPEN_HW - 1.4, OPEN_HW + 1.4, 0):
        box('trim', F, u - 0.3, u + 0.3, 0.05, 0.65, zb0, zb1 + 0.25)                      # столбики
        ellipsoid('trim_s', F.p(u, 0.35, zb1 + 0.5), 0.2, 0.2, 0.26, 8, 4)                    # шишки-навершия
    # закулисье: цилиндр позади портала
    p0 = F.p(0, -TH - 0.0, 0)
    secs = [(F.p(0, -TH - 2.0, 0).x, F.p(0, -TH - 2.0, 0).y, ZD - 0.0 - 0.9, 6.6, 6.6), (F.p(0, -TH - 2.0, 0).x, F.p(0, -TH - 2.0, 0).y, ZC + 0.2, 6.6, 6.6)]
    c = F.p(0, -TH - 2.2, 0)
    loft('wall', [(c.x, c.y, -2.0, 6.8, 6.4, math.atan2(F.u.y, F.u.x)), (c.x, c.y, ZC - 0.6, 6.8, 6.4, math.atan2(F.u.y, F.u.x))], 28, smooth=False) if False else None
    base = []
    for i in range(29):
        t = math.pi * i / 28                         # полукруг позади портала
        base.append((6.6 * math.cos(t), -TH - 2.2 - 6.0 * math.sin(t) + 2.2 + 0.0))
    for a, b in zip(base[:-1], base[1:]):
        q = [F.p(a[0], a[1], -2.0), F.p(b[0], b[1], -2.0), F.p(b[0], b[1], ZC - 1.0), F.p(a[0], a[1], ZC - 1.0)]
        face('wall', q, F.p((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0) - F.p(0, -3.0, 0))
        q = [F.p(a[0], a[1], ZC - 1.0), F.p(b[0], b[1], ZC - 1.0), F.p(b[0] * 0.0, -TH, ZC - 0.5), F.p(a[0] * 0.0, -TH, ZC - 0.5)]
        face('roof', q, UP)

def build_shell():
    """Золотистая раковина: полукруглая в плане вертикальная стенка + четверть сферы, на глубину ARCR."""
    levels = []
    wall_steps = 4
    arc_steps = 10
    prof = [(ARCR * 0.98, ZD + SPRING * i / wall_steps) for i in range(wall_steps + 1)]
    prof += [(ARCR * 0.98 * math.cos(math.pi / 2 * j / arc_steps), ZD + SPRING + ARCR * 0.98 * math.sin(math.pi / 2 * j / arc_steps)) for j in range(1, arc_steps + 1)]
    rings = []
    for r, z in prof:
        ring = []
        n = 20
        for i in range(n + 1):
            t = math.pi * i / n                       # 0 → вправо, π → влево; назад — в −d
            ring.append(F.p(r * math.cos(t), -r * math.sin(t) * (0.95 / 0.98) * 1.0 - 0.0, z))
        rings.append(ring)
    skin('wall2', rings, cap0=False, cap1=False, smooth=False, closed=False)
    # пол сцены внутри раковины
    pts = [F.p(ARCR * 0.98 * math.cos(math.pi * i / 20), -ARCR * 0.95 * math.sin(math.pi * i / 20), ZD) for i in range(21)]
    face('wood', pts, UP)
    # две двери в задней стенке
    for u in (-1.4, 1.4):
        box('wood', F, u - 0.5, u + 0.5, -ARCR * 0.95 - 0.02, -ARCR * 0.95 + 0.05, ZD, ZD + 2.2) if False else None

def build_stage():
    # дощатая эстрада: полукруглый фартук перед порталом, цоколь облицован камнем
    R = 7.3
    k = 24
    pts = [F.p(R * math.cos(math.pi * i / k + math.pi), -R * math.sin(math.pi * i / k + math.pi) * 0.78 + 0.0, ZD) for i in range(k + 1)]
    # внешний контур фартука (выпуклый в зал)
    arc = [(R * math.cos(math.pi * i / k), R * 0.78 * math.sin(math.pi * i / k)) for i in range(k + 1)]
    for a, b in zip(arc[:-1], arc[1:]):
        q = [F.p(a[0], a[1], -0.5), F.p(b[0], b[1], -0.5), F.p(b[0], b[1], ZD), F.p(a[0], a[1], ZD)]
        face('stone', q, F.p((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0.5) - F.p(0, 0, 0.5))
    deck = [F.p(a[0], a[1], ZD) for a in arc]
    face('wood', deck, UP)
    # ступени по краям фартука
    for s in (-1, 1):
        for i in range(3):
            box('stone', F, s * (R - 0.4 + 0.0) - 0.0 if False else min(s * (R + 0.6 + 0.3 * i), s * (R - 0.4)), max(s * (R + 0.6 + 0.3 * i), s * (R - 0.4)),
                -0.3, 1.4, -0.5, ZD - 0.3 * (i + 1) + 0.3) if False else None
        box('stone', F, (R - 0.2) if s > 0 else -(R + 0.7), (R + 0.7) if s > 0 else -(R - 0.2), -0.3, 1.6, -0.5, ZD - 0.3)
        box('stone', F, (R + 0.7) if s > 0 else -(R + 1.4), (R + 1.4) if s > 0 else -(R + 0.7), -0.3, 1.6, -0.5, ZD - 0.6)

def build_seating():
    rnd = random.Random(3)
    # веер скамей: центр веера в середине фартука
    CX = F.p(0, 1.0, 0)
    rows = 12
    for r in range(rows):
        R = 10.5 + 1.3 * r
        a_lim = math.radians(66 - r * 0.6)
        n = max(8, int(2 * a_lim * R / 2.1))
        for i in range(n):
            a = -a_lim + 2 * a_lim * (i + 0.5) / n
            if abs(a) < math.radians(3.2) or abs(abs(a) - math.radians(33)) < math.radians(2.0):
                continue            # проходы
            # направление веера: от ЮЗ-нормали F.n, поворот на угол a
            ca, sa = math.cos(a), math.sin(a)
            dirv = F.n * ca + F.u * sa
            p = CX.xy + dirv.xy * R if hasattr(CX, 'xy') else Vector((CX.x, CX.y)) + Vector((dirv.x, dirv.y)) * R
            L = 2.0 * R * math.tan(a_lim / n * 1.0) * 0.9 if False else 1.85
            tang = Vector((-dirv.y, dirv.x))
            q0 = p - tang * L / 2; q1 = p + tang * L / 2
            ax = Vector((q0.x, q0.y, 0)); bx = Vector((q1.x, q1.y, 0))
            beam('wood', ax + UP * 0.28, bx + UP * 0.28, 0.5, 0.05)                         # сиденье
            beam('wood', ax + UP * 0.62 + Vector((dirv.x, dirv.y, 0)) * -0.22, bx + UP * 0.62 + Vector((dirv.x, dirv.y, 0)) * -0.22, 0.04, 0.4)   # спинка
            beam('metal', ax + UP * 0.12 + (bx - ax) * 0.08, bx + UP * 0.12 - (bx - ax) * 0.08, 0.2, 0.24)      # чугунные опоры
    # подпорная стенка по внешней дуге
    Rw = 11.0 + 1.3 * rows + 0.8
    for i in range(30):
        t0, t1 = -1.15 + 2.3 * i / 30, -1.15 + 2.3 * (i + 1) / 30
        pts = []
        for t in (t0, t1):
            d = F.n * math.cos(t) + F.u * math.sin(t)
            pts.append(Vector((CX.x, CX.y)) + Vector((d.x, d.y)) * Rw)
        a, b = pts
        face('stone', [Vector((a.x, a.y, 0)), Vector((b.x, b.y, 0)), Vector((b.x, b.y, 0.9)), Vector((a.x, a.y, 0.9))], Vector((b.x - CX.x, b.y - CX.y, 0)))

COL['metal'] = ((0.12, 0.12, 0.12), 0.5)
build_portal()
build_shell()
build_stage()
build_seating()
finish('rakushka', __file__, 25000)
