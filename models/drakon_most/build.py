# Мост влюблённых («Драконий мостик») на Приморском бульваре, 1905 г., альминский камень.
#
#   blender -b --python models/drakon_most/build.py -- [glb]
#
# Горбатый пешеходный мост шириной 3 м и длиной ~17,4 м (OSM way 166764285) через аллею: широкая арка
# (пролёт ~9 м), облицовка из светлого известняка «в разбежку», по обоим фасадам под парапетом фриз:
# герб Севастополя в венке и два крылатых дракона; по бокам аллеи — стенки из дикого камня.
# Ноль высоты — дорожка под мостом.
import sys, os, random
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'mon_common'))
from mon import *

A, Bp = (-100.7, -132.7), (-116.2, -124.8)      # концы моста по OSM
MX, MZ = (A[0] + Bp[0]) / 2, (A[1] + Bp[1]) / 2
origin(MX, MZ)
INSIDE = (-108.4, -112.0)
F0, L = frame_from(A, Bp, INSIDE)
RND = random.Random(5)

COL['wall'] = ((0.77, 0.73, 0.63), 0.95)       # светлый альминский известняк
COL['wall2'] = ((0.70, 0.66, 0.56), 0.95)      # вторая тональность кладки
COL['trim'] = ((0.82, 0.79, 0.70), 0.9)        # резные детали (парапет, барельефы)
COL['stone'] = ((0.52, 0.47, 0.40), 0.97)      # дикий камень стенок и откосов

def P(u, d, z):
    return F0.p(u + L / 2, d, z)

HALF_W = 1.5          # полуширина (ширина 3 м)
SPAN, RISE = 4.6, 4.7  # полупролёт, подъём арки
ZTOP = lambda u: 5.55 - 1.5 * (u / (L / 2)) ** 2          # низ парапета/верх проезжей части

def arch(u):
    return RISE * math.sqrt(max(0.0, 1 - (u / SPAN) ** 2)) ** 0.92 if abs(u) < SPAN else 0.0

def build_body():
    n = 48
    us = [-L / 2 + L * i / n for i in range(n + 1)]
    for a, b in zip(us[:-1], us[1:]):
        za0, za1 = arch(a), arch(b)
        mid = (a + b) / 2
        m = 'wall' if int((mid + 20) * 0.6) % 2 == 0 else 'wall2'
        zb0, zb1 = (za0 if za0 > 0 else -2.0), (za1 if za1 > 0 else -2.0)
        zt0, zt1 = ZTOP(a), ZTOP(b)
        for s in (-1, 1):                                    # фасады
            q = [P(a, s * HALF_W, zb0), P(b, s * HALF_W, zb1), P(b, s * HALF_W, zt1), P(a, s * HALF_W, zt0)]
            face(m, q, P(mid, s * 5, 2.0) - P(mid, 0, 2.0))
        # проезжая часть
        face('wall2', [P(a, -HALF_W, zt0), P(b, -HALF_W, zt1), P(b, HALF_W, zt1), P(a, HALF_W, zt0)], UP)
        if za0 > 0 or za1 > 0:                                # свод арки
            q = [P(a, -HALF_W, za0), P(b, -HALF_W, za1), P(b, HALF_W, za1), P(a, HALF_W, za0)]
            face('wall', q, -UP)
    # торцы — стенки в землю
    for s in (-1, 1):
        u = s * L / 2
        face('wall2', [P(u, -HALF_W, -2.0), P(u, HALF_W, -2.0), P(u, HALF_W, ZTOP(u)), P(u, -HALF_W, ZTOP(u))], P(u * 2, 0, 0) - P(0, 0, 0))
    # пята арки: закрытие стенок под сводом (внутренние стенки у опор)
    for s in (-1, 1):
        for sd in (-1, 1):
            pass

def build_parapet():
    n = 48
    us = [-L / 2 + L * i / n for i in range(n + 1)]
    for a, b in zip(us[:-1], us[1:]):
        for s in (-1, 1):
            d0, d1 = s * (HALF_W + 0.05), s * (HALF_W - 0.35)
            lo = lambda u: ZTOP(u)
            # парапет: брус над фризом, полка выступает
            q_top = [P(a, d0, lo(a) + 0.85), P(b, d0, lo(b) + 0.85), P(b, d1, lo(b) + 0.85), P(a, d1, lo(a) + 0.85)]
            face('trim', q_top, UP)
            q_out = [P(a, d0, lo(a)), P(b, d0, lo(b)), P(b, d0, lo(b) + 0.85), P(a, d0, lo(a) + 0.85)]
            face('trim', q_out, P(0, s * 5, 0) - P(0, 0, 0))
            q_in = [P(a, d1, lo(a)), P(b, d1, lo(b)), P(b, d1, lo(b) + 0.85), P(a, d1, lo(a) + 0.85)]
            face('trim', q_in, P(0, -s * 5, 0) - P(0, 0, 0))
    # карниз-пояс под парапетом (выступающая полка)
    for s in (-1, 1):
        for a, b in zip(us[:-1], us[1:]):
            d0 = s * (HALF_W + 0.12)
            z0a, z0b = ZTOP(a) - 0.25, ZTOP(b) - 0.25
            q = [P(a, d0, z0a), P(b, d0, z0b), P(b, d0, ZTOP(b)), P(a, d0, ZTOP(a))]
            face('trim', q, P(0, s * 5, 0) - P(0, 0, 0))
            q = [P(a, s * HALF_W, z0a), P(b, s * HALF_W, z0b), P(b, d0, z0b), P(a, d0, z0a)]
            face('trim', q, -UP)

def dragon(s, uc, flip, zb):
    """Крылатый дракон-барельеф лицом к гербу: тело, шея с головой, крыло-веер, хвост-завиток."""
    d = s * (HALF_W + 0.12)
    sg = flip       # +1 — голова в сторону +u, −1 — в сторону −u
    def Q(du, dz, dd=0.0):
        return P(uc + sg * du, d + s * dd, zb + dz)
    # туловище
    ellipsoid('trim_s', Q(0.0, 0.26, 0.03), 0.34, 0.07, 0.17, 8, 4) if False else None
    p = [Q(-0.55, 0.12), Q(-0.2, 0.18), Q(0.15, 0.22), Q(0.5, 0.42), Q(0.72, 0.64)]
    for a, b in zip(p[:-1], p[1:]):
        limb('trim_s', a, b, 0.085, 0.075, 6)
    limb('trim_s', p[-1], Q(0.9, 0.68), 0.07, 0.04, 6)                 # морда
    ellipsoid('trim_s', Q(0.74, 0.68, 0.02), 0.07, 0.05, 0.06, 6, 3)  # голова
    # лапы
    for du in (-0.15, 0.3):
        limb('trim_s', Q(du, 0.2), Q(du + 0.08, 0.02), 0.04, 0.03, 5)
    # хвост с завитком
    prev = Q(-0.55, 0.12)
    for k in range(1, 8):
        a = k * 0.55
        q = Q(-0.62 - 0.05 * k, 0.12 + 0.15 * math.sin(a))
        limb('trim_s', prev, q, 0.05 - 0.004 * k, 0.045 - 0.004 * k, 5)
        prev = q
    # крыло: веер перьев вверх-назад
    root = Q(0.12, 0.3, 0.04)
    for k in range(6):
        t = k / 5
        tip = Q(0.12 - 0.55 * math.cos(0.3 + 0.9 * t), 0.3 + 0.45 * math.sin(0.35 + 0.7 * t) , 0.04)
        strip('trim_s', root, tip, 0.1, 0.07, 0.03, s * Vector(F0.n.x, F0.n.y, 0) if False else Vector(F0.N()) * s)

def build_frieze():
    for s in (-1, 1):
        d = s * (HALF_W + 0.05)
        zc = ZTOP(0) + 0.42
        # герб: щит в венке, на кронштейне над замковым камнем
        for k in range(14):
            for sg in (-1, 1):
                a = 0.4 + k * 0.17
                pa = P(sg * (0.55 + 0.0), d + s * 0.08, zc + 0.25 + 0.0)
        c = P(0, d + s * 0.08, zc + 0.05)
        ellipsoid('trim_s', P(0, d + s * 0.1, zc - 0.02), 0.22, 0.06, 0.3, 10, 5)
        for sg in (-1, 1):                                       # венок: ветви
            prev = P(sg * 0.14, d + s * 0.1, zc - 0.3)
            for k in range(1, 7):
                a = k / 6
                q = P(sg * (0.14 + 0.32 * math.sin(a * 1.6)), d + s * 0.1, zc - 0.3 + 0.62 * a)
                limb('trim_s', prev, q, 0.035, 0.03, 5)
                prev = q
        # замковый камень с маской
        box('trim', F0, 0, 0, 0, 0, 0, 0) if False else None
        ellipsoid('trim_s', P(0, d + s * 0.1, ZTOP(0) - 0.45), 0.12, 0.06, 0.16, 6, 3)
        # драконы справа и слева лицом к гербу
        dragon(s, -1.2, +1, ZTOP(-1.2) + 0.08)
        dragon(s, 1.2, -1, ZTOP(1.2) + 0.08)
        # боковые мотивы: венок с датой «1854» на левом поле и якорный лавр справа
        for sg in (-1, 1):
            uc = sg * 4.0
            ring = [P(uc + 0.28 * math.cos(2 * math.pi * i / 14), d + s * 0.08, ZTOP(uc) + 0.42 + 0.28 * math.sin(2 * math.pi * i / 14)) for i in range(14)]
            for a, b in zip(ring, ring[1:] + ring[:1]):
                limb('trim_s', a, b, 0.03, 0.03, 4)

def block(m, c, size, rot, taper=0.8):
    sx, sy, sz = size
    ca, sa = math.cos(rot), math.sin(rot)
    def Pp(ix, iy, iz):
        k = taper if iz else 1.0
        x, y = ix * sx / 2 * k, iy * sy / 2 * k
        return V(c.x + x * ca - y * sa + RND.uniform(-0.05, 0.05), c.y + x * sa + y * ca + RND.uniform(-0.05, 0.05), c.z + (sz if iz else 0) + (RND.uniform(-0.1, 0.1) if iz else 0))
    v = {(i, j, k): Pp(i, j, k) for i in (-1, 1) for j in (-1, 1) for k in (0, 1)}
    cen = c + V(0, 0, sz / 2)
    for q in ([(-1, -1, 0), (1, -1, 0), (1, -1, 1), (-1, -1, 1)], [(1, -1, 0), (1, 1, 0), (1, 1, 1), (1, -1, 1)],
              [(1, 1, 0), (-1, 1, 0), (-1, 1, 1), (1, 1, 1)], [(-1, 1, 0), (-1, -1, 0), (-1, -1, 1), (-1, 1, 1)],
              [(-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)]):
        pts = [v[t] for t in q]
        face(m, pts, sum(pts, Vector()) / 4 - cen)

def build_rubble():
    # стенки из дикого камня вдоль дорожки под мостом (по d), по обе стороны от пролёта, подпирают откосы
    for su in (-1, 1):
        for row in range(3):
            n = 11 - row * 2
            for i in range(n):
                d = -7.0 + 14.0 * (i + 0.5 * (row % 2)) / n
                u = su * (SPAN + 0.6 + 0.1 * RND.uniform(-1, 1) + 0.25 * row)
                zb = -0.3 + row * 0.9
                w = RND.uniform(0.8, 1.2)
                block('stone', P(u, d, zb), (w, w * 1.1, 0.9), RND.uniform(-0.3, 0.3) + F0.u.angle_signed(Vector((1, 0))) if False else RND.uniform(-0.3, 0.3))
        # скальная кромка у береговой части за торцом моста
    for su in (-1, 1):
        for i in range(8):
            u = su * (L / 2 - 0.3 + RND.uniform(-0.3, 0.8))
            d = RND.uniform(-2.2, 2.2)
            block('stone', P(u, d, ZTOP(u) - 1.3 + RND.uniform(-0.5, 0.2)), (RND.uniform(0.9, 1.5),) * 2 + (1.0,), RND.uniform(0, 3))

def build_lamps():
    for su in (-1, 1):
        u = su * 6.0
        lathe('metal_s', P(u, 1.2, 0) if False else Vector((P(u, 1.2, 0).x, P(u, 1.2, 0).y, 0)), [(0.12, ZTOP(u) - 0.5), (0.05, ZTOP(u) + 0.2), (0.04, ZTOP(u) + 2.6), (0.2, ZTOP(u) + 2.7), (0.0, ZTOP(u) + 3.0)], 8, cap=False)

def build():
    build_body()
    build_parapet()
    build_frieze()
    build_rubble()

COL['metal'] = ((0.12, 0.12, 0.12), 0.5)
build()
finish('drakon_most', __file__, 15000)
