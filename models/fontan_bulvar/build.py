# Фонтан Приморского бульвара (OSM way 1266287886, диаметр ~10,3 м) — «музыкальный» фонтан с двумя чашами.
#
#   blender -b --python models/fontan_bulvar/build.py -- [glb]
#
# Круглый гранитный бассейн с бортом, в центре двухъярусная гранитная композиция (низкая широкая чаша на
# ножке и тёмная высокая верхняя чаша), струи и каскад; вокруг кирпичное кольцо, кованая решётка с
# проходами на четыре стороны, подстриженная живая изгородь. Ноль высоты — плитка вокруг бассейна.
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'mon_common'))
from mon import *

X0, Z0 = -120.45, -67.55
origin(X0, Z0)

COL['stone'] = ((0.52, 0.51, 0.49), 0.9)        # светло-серый гранит бассейна
COL['wall3'] = ((0.27, 0.27, 0.29), 0.45)       # тёмный полированный гранит чаш
COL['glass'] = ((0.22, 0.38, 0.44), 0.08)       # вода
COL['trim'] = ((0.92, 0.95, 0.97), 0.3)         # струи
COL['roof'] = ((0.58, 0.32, 0.27), 0.9)         # кирпичное кольцо
COL['metal'] = ((0.10, 0.10, 0.11), 0.5)        # кованая решётка
COL['wall2'] = ((0.14, 0.27, 0.12), 0.95)       # живая изгородь
SMOOTH_IN = None

R_OUT, R_IN, H_B = 5.15, 4.55, 0.85
ORI = Vector((0, 0, 0))

def ring_prof(m, prof, seg=48, cap=False):
    lathe(m, ORI, prof, seg, cap=cap)

def build_basin():
    # борт: наружная стенка, верх с лёгким свесом, внутренняя стенка до воды
    ring_prof('stone_s', [(R_OUT + 0.12, -0.3), (R_OUT + 0.12, 0.05), (R_OUT, 0.05), (R_OUT, H_B - 0.1), (R_OUT + 0.08, H_B - 0.1),
                         (R_OUT + 0.08, H_B), (R_IN - 0.0, H_B), (R_IN, 0.55)])
    # дно и вода
    pts_n = 48
    ring_prof('wall3_s', [(R_IN, 0.55), (R_IN, 0.05), (0.01, 0.05)], 48, cap=False)
    ring_prof('glass', [(R_IN - 0.02, 0.62), (0.01, 0.62)], 48, cap=False)

def build_center():
    # ножка и нижняя чаша
    ring_prof('wall3_s', [(0.9, 0.05), (0.9, 0.5), (0.55, 0.75), (0.5, 1.2), (0.7, 1.28)])
    # нижняя широкая чаша — блюдце
    ring_prof('wall3_s', [(0.7, 1.28), (1.6, 1.38), (2.35, 1.52), (2.45, 1.7), (2.35, 1.72), (2.2, 1.58), (1.0, 1.5), (0.0, 1.52)], 48, cap=False)
    ring_prof('glass', [(2.2, 1.62), (0.01, 1.62)], 40, cap=False)
    # верхняя тёмная чаша — широкий «стакан» с обручем
    ring_prof('wall3_s', [(0.55, 1.5), (0.7, 1.9), (1.05, 2.3), (1.22, 2.9), (1.3, 3.1), (1.18, 3.12), (1.1, 3.0), (0.0, 3.0)], 40, cap=False)
    ring_prof('wall3_s', [(1.28, 3.1), (1.32, 3.18), (1.2, 3.22)], 40, cap=False)
    ring_prof('glass', [(1.1, 3.02), (0.01, 3.02)], 36, cap=False)
    # центральные струи: пучок тонких конусов, веером вверх
    for k in range(14):
        a = 2 * math.pi * k / 14
        r0 = 0.25 + 0.3 * (k % 2)
        top = V(0.28 * (1 + (k % 3) * 0.4) * math.cos(a), 0.28 * (1 + (k % 3) * 0.4) * math.sin(a), 4.1 + 0.25 * (k % 3))
        limb('trim', V(r0 * math.cos(a), r0 * math.sin(a), 3.02), top, 0.06, 0.035, 5)
    limb('trim', V(0, 0, 3.02), V(0, 0, 4.9), 0.1, 0.05, 6)
    # водопад по краю верхней чаши: тонкие прозрачные «шторы»
    for k in range(18):
        a = 2 * math.pi * k / 18
        limb('trim', V(1.2 * math.cos(a), 1.2 * math.sin(a), 3.0), V(1.62 * math.cos(a), 1.62 * math.sin(a), 1.7), 0.05, 0.03, 4)
    # веер струй вокруг нижней чаши
    for k in range(20):
        a = 2 * math.pi * k / 20
        limb('trim', V(2.1 * math.cos(a), 2.1 * math.sin(a), 1.62), V(3.1 * math.cos(a), 3.1 * math.sin(a), 1.4), 0.03, 0.02, 4)

def arc_segments(r0, r1, h, m, gap=math.radians(14), center_hole=4):
    pass

def build_pavement_ring():
    # кирпичное кольцо у бассейна
    ring_prof('roof', [(R_OUT + 0.12, 0.02), (R_OUT + 2.3, 0.02)], 48)
    ring_prof('roof', [(R_OUT + 2.3, 0.02), (R_OUT + 2.3, 0.0)], 48)

def build_fence():
    Rf = 7.4
    n_post = 56
    openings = [math.radians(a) for a in (0, 90, 180, 270)]
    gap = math.radians(11)
    def in_gap(a):
        return any(abs(((a - o + math.pi) % (2 * math.pi)) - math.pi) < gap for o in openings)
    pts = []
    for i in range(n_post + 1):
        a = 2 * math.pi * i / n_post
        pts.append((a, V(Rf * math.cos(a), Rf * math.sin(a), 0)))
    for (a0, p0), (a1, p1) in zip(pts[:-1], pts[1:]):
        am = (a0 + a1) / 2
        if in_gap(am):
            # столбики по краям проходов
            limb('metal_s', p0, p0 + UP * 1.0, 0.04, 0.04, 4)
            continue
        limb('metal_s', p0, p0 + UP * 0.95, 0.025, 0.025, 4)                              # столбик
        limb('metal_s', p0 + UP * 0.88, p1 + UP * 0.88, 0.02, 0.02, 4)                    # верхний рельс
        limb('metal_s', p0 + UP * 0.1, p1 + UP * 0.1, 0.02, 0.02, 4)                      # нижний рельс
        # прутья-балясины в стиле кованой решётки (по три между столбиками) и средний рельс
        limb('metal_s', p0 + UP * 0.5, p1 + UP * 0.5, 0.012, 0.012, 3)
        for t in (0.25, 0.5, 0.75):
            q = p0 + (p1 - p0) * t
            limb('metal_s', q + UP * 0.1, q + UP * 0.88, 0.012, 0.012, 3)

def build_hedge():
    # подстриженная живая изгородь кольцом с проходами, профиль — скруглённый
    Rh0, Rh1, Hh = 8.55, 9.25, 0.75
    openings = [math.radians(a) for a in (0, 90, 180, 270)]
    gap = math.radians(13)
    n = 64
    segs = []
    cur = []
    for i in range(n + 1):
        a = 2 * math.pi * i / n
        g = any(abs(((a - o + math.pi) % (2 * math.pi)) - math.pi) < gap for o in openings)
        if g:
            if len(cur) > 1: segs.append(cur)
            cur = []
        else:
            cur.append(a)
    if len(cur) > 1: segs.append(cur)
    rm = (Rh0 + Rh1) / 2
    prof = [(Rh0, 0.0), (Rh0 - 0.02, Hh * 0.6), (Rh0 + 0.12, Hh), (rm, Hh + 0.06), (Rh1 - 0.12, Hh), (Rh1 + 0.02, Hh * 0.6), (Rh1, 0.0)]
    for seg in segs:
        rings = []
        for r, z in prof:
            rings.append([V(r * math.cos(a), r * math.sin(a), z) for a in seg])
        skin('wall2', rings, cap0=False, cap1=False, smooth=False, closed=False)

def build():
    build_basin()
    build_center()
    build_pavement_ring()
    build_fence()
    build_hedge()

build()
finish('fontan_bulvar', __file__, 10000)
