# Памятник затопленным кораблям (1905, А. Адамсон, В. Фельдман): колонна с орлом на скале в воде.
#
#   blender -b --python models/sunken_ships/build.py -- [glb]
#
# Ноль высоты — уровень воды (в игре плоскость воды y = 0, дно бухты ниже). Скала уходит до z = −3 и
# выходит из воды; на ней восьмигранный гранитный пьедестал с бронзовыми плитами, колонна
# коринфского ордера, бронзовый двуглавый орёл с венком и якорем.
import sys, os, random
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'mon_common'))
from mon import *

X0, Z0 = -88.0, -193.8            # OSM node 1186315435 — ось колонны
origin(X0, Z0)
RND = random.Random(11)

COL['stone'] = ((0.46, 0.41, 0.35), 0.95)      # скала: серо-бурая гранитная кладка
COL['wall'] = ((0.56, 0.46, 0.34), 0.95)       # скала: рыжеватые глыбы
COL['wall2'] = ((0.80, 0.78, 0.70), 0.7)       # ствол колонны (светлый диорит/известняк на фото)
COL['wall3'] = ((0.16, 0.15, 0.12), 0.5)       # бронза: орёл, капитель, плиты
COL['metal'] = ((0.16, 0.15, 0.12), 0.5)
COL['trim'] = ((0.36, 0.38, 0.35), 0.75)       # серо-зелёный гранит пьедестала
B, M = 'wall3_s', 'metal_s'

ROCK_TOP = 3.7            # верх скалы под пьедесталом, м над водой
PED_H = 4.1
COL_H = 7.1

def block(m, c, size, rot, jit=0.18, taper=0.82):
    """Грубо обработанная глыба: ящик с перекошенной верхней гранью."""
    sx, sy, sz = size
    ca, sa = math.cos(rot), math.sin(rot)
    def P(ix, iy, iz):
        k = taper if iz else 1.0
        x, y = ix * sx / 2 * k, iy * sy / 2 * k
        z = (sz if iz else 0) + (RND.uniform(-jit, jit) * sz * 0.6 if iz else 0)
        return V(c.x + x * ca - y * sa + RND.uniform(-jit, jit) * sx * 0.15, c.y + x * sa + y * ca + RND.uniform(-jit, jit) * sy * 0.15, c.z + z)
    v = {(i, j, k): P(i, j, k) for i in (-1, 1) for j in (-1, 1) for k in (0, 1)}
    cen = c + V(0, 0, sz / 2)
    for q in ([(-1, -1, 0), (1, -1, 0), (1, -1, 1), (-1, -1, 1)], [(1, -1, 0), (1, 1, 0), (1, 1, 1), (1, -1, 1)],
              [(1, 1, 0), (-1, 1, 0), (-1, 1, 1), (1, 1, 1)], [(-1, 1, 0), (-1, -1, 0), (-1, -1, 1), (-1, 1, 1)],
              [(-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)]):
        pts = [v[t] for t in q]
        face(m, pts, sum(pts, Vector()) / 4 - cen)

def build_rock():
    # ядро: вытянутое тело, сужающееся кверху (скрывает щели между глыбами)
    core = []
    prof = [(-3.0, 5.8, 5.0), (0.0, 5.0, 4.3), (1.5, 3.9, 3.4), (2.8, 2.9, 2.6), (ROCK_TOP, 2.2, 2.2)]
    for z, rx, ry in prof:
        core.append((0.0, 0.0, z, rx * 0.93, ry * 0.93, 0.25))
    loft('stone', core, 20, cap0=True, cap1=True, smooth=False)
    # слои глыб по овалу: у воды широкий, кверху уже; верхние ряды и спуск к югу ниже
    layers = [(-0.9, 1.5, 5.5, 4.7, 22, 1.45), (0.3, 1.3, 4.7, 4.0, 19, 1.35), (1.3, 1.2, 3.9, 3.3, 16, 1.3),
              (2.2, 1.1, 3.2, 2.8, 13, 1.25), (3.0, 1.0, 2.6, 2.4, 11, 1.2)]
    for z, h, rx, ry, n, w0 in layers:
        for i in range(n):
            a = 2 * math.pi * (i + RND.uniform(-0.25, 0.25)) / n
            r = 1.0 + RND.uniform(-0.04, 0.04)
            c = V(rx * r * math.cos(a) * 0.95, ry * r * math.sin(a) * 0.95, z)
            if z >= 2.2 and math.sin(a) < -0.5 and RND.random() < 0.6:
                continue
            w = w0 * RND.uniform(0.8, 1.3)
            block(RND.choice(['stone', 'stone', 'wall']), c, (w * 1.15, w * RND.uniform(0.8, 1.1), h + RND.uniform(0, 0.4)),
                  a + math.pi / 2 + RND.uniform(-0.25, 0.25), 0.12, 0.85)
    # гребень-«шпора» на востоке/севере, поднимающийся выше пьедестала
    for i, (x, y, z, w, h) in enumerate([(2.4, 0.4, 3.0, 1.0, 1.5), (2.2, -0.2, 3.8, 0.9, 1.3), (1.9, 0.8, 4.3, 0.8, 1.3),
                                         (2.3, 1.0, 3.4, 0.9, 1.2), (1.8, 0.2, 5.0, 0.7, 0.9), (1.5, 1.5, 3.3, 0.9, 1.4),
                                         (-1.7, 1.2, 3.5, 0.9, 1.3), (-0.9, 1.9, 3.3, 1.0, 1.4), (0.6, 2.0, 3.5, 0.9, 1.4),
                                         (-2.1, 0.3, 3.4, 0.9, 1.3), (2.0, 1.4, 4.0, 0.7, 1.0)]):
        block(RND.choice(['stone', 'wall']), V(x, y, z), (w, w, h), RND.uniform(0, 3), 0.15, 0.75)
    # верх скалы: площадка под пьедестал
    slab('stone', -1.8, 1.8, -1.8, 1.8, ROCK_TOP - 0.5, ROCK_TOP)

def octagon(r, rot=math.pi / 8):
    return [(r * math.cos(rot + k * math.pi / 4), r * math.sin(rot + k * math.pi / 4)) for k in range(8)]

def oct_loft(m, rings, top=True):
    """Восьмигранный лофт: rings = [(z, r)] — r описанный (до вершин)."""
    F0 = Frame(Vector((0, 0)), Vector((1, 0)), Vector((0, 1)))
    prev = None
    for z, r in rings:
        cur = [V(x, y, z) for x, y in octagon(r)]
        if prev:
            for k in range(8):
                j = (k + 1) % 8
                q = [prev[k], prev[j], cur[j], cur[k]]
                face(m, q, sum(q, Vector()) / 4 - V(0, 0, (prev[0].z + cur[0].z) / 2))
        prev = cur
    if top:
        face(m, prev, UP)

def build_pedestal():
    z0 = ROCK_TOP
    oct_loft('stone', [(z0 - 0.4, 2.15), (z0 + 0.5, 2.0)])
    oct_loft('trim', [(z0 + 0.5, 1.92), (z0 + 0.62, 1.92), (z0 + 0.62, 1.78)])
    oct_loft('trim', [(z0 + 0.62, 1.58), (z0 + PED_H - 0.5, 1.46)])
    oct_loft('trim', [(z0 + PED_H - 0.5, 1.62), (z0 + PED_H - 0.38, 1.62), (z0 + PED_H - 0.38, 1.5)])
    oct_loft('trim', [(z0 + PED_H - 0.38, 1.7), (z0 + PED_H, 1.7)], top=True)
    # бронзовые плиты на южной (к набережной, −Y) и остальных гранях
    for k in range(8):
        a = k * math.pi / 4
        # нормаль грани k: у восьмигранника с вершинами на (π/8 + kπ/4) центры граней на kπ/4
        F = Frame(Vector((0, 0)), Vector((-math.sin(a), math.cos(a))), Vector((math.cos(a), math.sin(a))))
        dr = 1.46 * math.cos(math.pi / 8) * 0 + 1.46 * math.cos(math.pi / 8) + 0.0    # апофема ≈ 1.35
        ap = 1.54 * math.cos(math.pi / 8)
        if k == 6:      # юг: надпись и барельеф
            box(M, F, -0.55, 0.55, ap - 0.04, ap + 0.04, z0 + 2.45, z0 + 3.0)       # плита с надписью
            for zz in (2.9, 2.75, 2.6):
                box(M, F, -0.45, 0.45, ap + 0.04, ap + 0.065, z0 + zz - 0.07, z0 + zz)
            box(M, F, -0.38, 0.38, ap - 0.04, ap + 0.05, z0 + 1.2, z0 + 1.7)        # барельеф 0,75 × 0,5
            for u in (-0.25, -0.1, 0.05, 0.2, 0.3):
                box(M, F, u - 0.03, u + 0.03, ap + 0.05, ap + 0.075, z0 + 1.25, z0 + 1.25 + 0.2 + 0.12 * abs(math.sin(u * 9)))
        else:
            box(M, F, -0.35, 0.35, ap - 0.03, ap + 0.03, z0 + 2.0, z0 + 2.7)

def build_column():
    zb = ROCK_TOP + PED_H
    # бронзовая база
    lathe(B, V(0, 0, 0), [(0.78, zb), (0.78, zb + 0.08), (0.64, zb + 0.14), (0.60, zb + 0.22), (0.66, zb + 0.28),
                          (0.62, zb + 0.34), (0.52, zb + 0.40)], 20, cap=False)
    # ствол — светлый диорит, сужается кверху
    zs0, zs1 = zb + 0.40, zb + COL_H - 1.1
    prof = [(0.475 - 0.075 * ((z - zs0) / (zs1 - zs0)) ** 1.2, z) for z in [zs0 + (zs1 - zs0) * i / 8 for i in range(9)]]
    lathe('wall2_s', V(0, 0, 0), prof, 24, cap=False)
    # астрагал и капитель коринфская, бронза
    lathe(B, V(0, 0, 0), [(0.40, zs1), (0.45, zs1 + 0.03), (0.45, zs1 + 0.08), (0.40, zs1 + 0.12)], 20, cap=False)
    zc = zs1 + 0.12
    bell = lambda t: 0.40 + 0.20 * t ** 1.6
    prof = [(bell(i / 6), zc + (1.1 - 0.12 - 0.2) * i / 6) for i in range(7)]
    lathe(B, V(0, 0, 0), prof, 20, cap=False)
    # два яруса акантовых листьев
    for tier, (n, zl0, zl1, off) in enumerate([(8, zc, zc + 0.45, 0.03), (8, zc + 0.05, zc + 0.72, 0.05)]):
        for q in range(n):
            a = 2 * math.pi * (q + 0.5 * tier) / n
            ca, sa = math.cos(a), math.sin(a)
            r0 = bell((zl0 - zc) / 0.78) + off
            r1 = bell((zl1 - zc) / 0.78) + off + 0.08
            strip(B, V(r0 * ca, r0 * sa, zl0), V(r1 * ca, r1 * sa, zl1), 0.2, 0.14, 0.03, Vector((ca, sa, 0)))
    # угловые волюты и абака
    zt = zc + 0.78
    for q in range(4):
        a = math.pi / 4 + q * math.pi / 2
        ca, sa = math.cos(a), math.sin(a)
        ellipsoid(B, V(0.55 * ca, 0.55 * sa, zt - 0.06), 0.1, 0.1, 0.1, 8, 4)
    rloft(B, [(zt, 0.34, 0.34), (zt + 0.1, 0.62, 0.62), (zt + 0.2, 0.62, 0.62)], 0, 0)
    return zt + 0.2

def build_eagle(z):
    # плинт под орлом
    lathe(B, V(0, 0, 0), [(0.28, z), (0.30, z + 0.06), (0.22, z + 0.1)], 12, cap=True)
    zc = z + 0.55
    # тело (ось по Y — клювами на север), хвост
    loft(B, [(0, -0.35, zc - 0.2, 0.12, 0.12), (0, -0.1, zc - 0.05, 0.2, 0.25), (0, 0.2, zc + 0.05, 0.22, 0.25), (0, 0.4, zc + 0.15, 0.1, 0.12)], 12, rot=None) if False else None
    ellipsoid(B, V(0, 0.0, zc), 0.2, 0.42, 0.27, 12, 6)
    for k in range(5):                                             # хвост веером вниз-назад
        ax = (k - 2) * 0.14
        strip(B, V(0, -0.3, zc - 0.1), V(ax, -0.5 - 0.0, zc - 0.5), 0.09, 0.12, 0.02, Vector((0, 1, 0)))
    # шеи и две головы с клювами, в клювах венок с якорем
    for s in (-1, 1):
        limb(B, V(s * 0.06, 0.3, zc + 0.15), V(s * 0.22, 0.52, zc + 0.5), 0.09, 0.07, 8)
        ellipsoid(B, V(s * 0.22, 0.55, zc + 0.55), 0.09, 0.12, 0.09, 8, 4)
        limb(B, V(s * 0.2, 0.62, zc + 0.52), V(s * 0.17, 0.82, zc + 0.43), 0.045, 0.012, 6)
    # корона над головами
    lathe(B, V(0, 0.5, 0), [(0.1, zc + 0.68), (0.14, zc + 0.78), (0.1, zc + 0.86)], 8, cap=True)
    # венок с якорем, висит между клювами (плоскость x–z, чуть севернее)
    cw = V(0, 0.84, zc + 0.12)
    for i in range(20):
        a0, a1 = 2 * math.pi * i / 20, 2 * math.pi * (i + 1) / 20
        limb(B, cw + V(0.26 * math.cos(a0), 0, 0.26 * math.sin(a0)), cw + V(0.26 * math.cos(a1), 0, 0.26 * math.sin(a1)), 0.032, 0.032, 5)
    limb(M, cw + V(0, 0, 0.24), cw + V(0, 0, -0.2), 0.02, 0.02, 4)                                  # веретено якоря
    limb(M, cw + V(-0.13, 0, 0.1), cw + V(0.13, 0, 0.1), 0.015, 0.015, 4)                          # шток
    for s in (-1, 1):
        limb(M, cw + V(0, 0, -0.2), cw + V(s * 0.14, 0, -0.1), 0.02, 0.016, 4)
    # крылья: веер перьев от плеч вверх-в стороны, размах 2,67 м
    for s in (-1, 1):
        sh = V(s * 0.16, 0.0, zc + 0.15)
        for k in range(10):
            t = k / 9
            ang = math.radians(25 + 70 * t)              # от почти горизонтали к вертикали
            L = 1.25 - 0.45 * abs(t - 0.35)
            tip = sh + V(s * L * math.cos(ang), -0.05 * k * 0.3, L * math.sin(ang) * 0.9 + 0.2)
            strip(B, sh + V(s * 0.05, 0.0, 0.0), tip, 0.2, 0.16, 0.022, Vector((0, 1, 0)))
        # локоть крыла — массивный плечевой край
        limb(B, sh, sh + V(s * 0.55, 0.0, 0.45), 0.1, 0.07, 8)
    # лапы
    for s in (-1, 1):
        limb(B, V(s * 0.1, 0.1, zc - 0.2), V(s * 0.11, 0.18, z + 0.1), 0.035, 0.03, 5)

def build():
    build_rock()
    build_pedestal()
    zt = build_column()
    build_eagle(zt)

build()
finish('sunken_ships', __file__, 14000)
