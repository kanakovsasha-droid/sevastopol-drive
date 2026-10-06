# Жилой дом, пр. Нахимова, 10 («Медоборы» внизу) — модель с нуля.
#
#   blender -b --python models/nahimova10/build.py -- [glb]
#
# Обычный трёхэтажный сталинский дом у гостиницы «Севастополь». План —
# контур OSM w92028137: Г-образный, длинное крыло 54 м вдоль проспекта
# (фасад на ЮВ, к проспекту), короткое крыло 28 м уходит во двор на СЗ.
# Фото дома нет: кремовые стены, светлый первый этаж с витринами,
# прямоугольные окна, карниз на кронштейнах, серая скатная кровля — по
# описанию в refs/center-models.json, остальное наугад (NOTES.md).
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

# Контур OSM w92028137 (мир x, z), обход как в world.json
P = [(-407.5, 429.8), (-400.1, 419.4), (-377.2, 435.7),
     (-408.7, 479.7), (-419.8, 471.8), (-395.8, 438.2)]
P0, P1, P2, P3, P4, P5 = P

# начало модели — середина фасада на проспект, у земли
origin((P2[0] + P3[0]) / 2, (P2[1] + P3[1]) / 2)

COL['wall'] = ((0.894, 0.851, 0.753), 0.9)     # кремовая штукатурка #e4d9c0
COL['wall2'] = ((0.93, 0.90, 0.82), 0.9)       # первый этаж светлее
COL['trim'] = ((0.95, 0.94, 0.90), 0.85)       # тяги, наличники, карниз
COL['roof'] = ((0.48, 0.48, 0.48), 0.8)        # серая кровля #7a7a7a
COL['stone'] = ((0.62, 0.60, 0.56), 0.9)       # цоколь

GROUND = -3.0
Z1 = 4.0             # верх первого этажа (витрины)
FH = 3.3             # высота жилого этажа
EAVE = Z1 + 2 * FH   # 10.6 — верх стен
RISE = 2.7           # подъём скатов
STEP = 3.4           # шаг осей окон

def outward(a, b):
    """Рамка ребра контура: обход P идёт по часовой стрелке в плане Blender,
    поэтому наружу — правая нормаль; проверяем знаком площади."""
    o = W(*a); u = (W(*b) - o).normalized()
    n = Vector((u.y, -u.x))
    if _area < 0: n = -n
    return Frame(o, u, n), (W(*b) - o).length

_pts = [W(*p) for p in P]
_area = sum(_pts[i].x * _pts[(i + 1) % 6].y - _pts[(i + 1) % 6].x * _pts[i].y for i in range(6))

def axes(L, step=STEP, edge=1.6):
    """Центры осей окон по ребру длиной L, с полями у углов."""
    n = max(1, int((L - 2 * edge) / step + 0.5))
    s = (L - 2 * edge) / n
    return [edge + s * (k + 0.5) for k in range(n)]

def pane(F, ua, ub, za, zb, transom=None):
    """Стекло в глубине проёма, импост и фрамуга плоскими полосами."""
    g = -0.2
    face('glass', [F.p(ua, g, za), F.p(ub, g, za), F.p(ub, g, zb), F.p(ua, g, zb)], F.N())
    t, f = 0.035, g + 0.03
    cu = (ua + ub) / 2
    face('trim', [F.p(cu - t, f, za), F.p(cu + t, f, za), F.p(cu + t, f, zb), F.p(cu - t, f, zb)], F.N())
    if transom:
        z = za + (zb - za) * transom
        face('trim', [F.p(ua, f, z - t), F.p(ub, f, z - t), F.p(ub, f, z + t), F.p(ua, f, z + t)], F.N())

def floor_wall(F, L, z0, z1, holes, m):
    wall(F, 0, L, z0, z1, 0, holes, m=m, reveal=0.2, rm=m)

# ------------------------------------------------------------------ стены
EDGES = []
for i in range(6):
    F, L = outward(P[i], P[(i + 1) % 6])
    EDGES.append((F, L))

STREET = 2          # ребро P2–P3 — фасад на проспект
for i, (F, L) in enumerate(EDGES):
    us = axes(L)
    street = i == STREET
    # цоколь и низ стен ниже земли
    box('stone', F, -0.05, L + 0.05, -0.06, 0.08, GROUND, 0.55, bottom=False)
    # первый этаж
    holes = []
    for k, cu in enumerate(us):
        if street:                                   # витрины по всему фасаду
            h = (cu - 1.25, cu + 1.25, 0.65, 3.35)
            pane(F, *h, transom=0.78)
        elif i == 4 and k in (2, 8):                 # подъезды со двора (наугад)
            h = (cu - 0.7, cu + 0.7, 0.35, 2.6)
            face('wood', [F.p(h[0], -0.18, h[2]), F.p(h[1], -0.18, h[2]),
                          F.p(h[1], -0.18, h[3]), F.p(h[0], -0.18, h[3])], F.N())
            box('trim', F, h[0] - 0.4, h[1] + 0.4, 0, 0.9, 2.85, 2.97)       # козырёк
            box('stone', F, h[0] - 0.4, h[1] + 0.4, 0, 1.2, GROUND, 0.35, bottom=False)
        else:
            h = (cu - 0.7, cu + 0.7, 1.2, 3.1)
            pane(F, *h, transom=0.7)
            box('trim', F, h[0] - 0.08, h[1] + 0.08, 0, 0.1, h[2] - 0.08, h[2], bottom=False)
        holes.append(h)
    floor_wall(F, L, 0.55, Z1, holes, 'wall2')
    # пояс над первым этажом
    box('trim', F, -0.05, L + 0.05, 0, 0.14, Z1 - 0.12, Z1 + 0.12, bottom=False)
    # жилые этажи
    for f in range(2):
        z0 = Z1 + f * FH
        holes = []
        for cu in us:
            za = z0 + 0.95
            h = (cu - 0.72, cu + 0.72, za, za + 1.85)
            pane(F, *h, transom=0.72)
            box('trim', F, h[0] - 0.1, h[1] + 0.1, 0, 0.12, za - 0.1, za, bottom=False)   # подоконник
            if i in (STREET, 1, 3):                   # сандрик-полочка на уличных фасадах
                box('trim', F, h[0] - 0.12, h[1] + 0.12, 0, 0.1, h[3] + 0.08, h[3] + 0.2, bottom=False)
            holes.append(h)
        floor_wall(F, L, z0, z0 + FH, holes, 'wall')
    # карниз на кронштейнах
    cornice(F, 0, L, 0, EAVE - 0.6, ext=0.45)
    n = int(L / 1.1)
    for k in range(n):
        u = (k + 0.5) * L / n
        box('trim', F, u - 0.09, u + 0.09, 0, 0.32, EAVE - 0.95, EAVE - 0.6, bottom=False)

# ------------------------------------------------------------------ кровля
# крыло вдоль проспекта: рамка по P2→P3, глубина — до дворовой стены P4–P5
F2, L2 = EDGES[2]
D2 = abs(F2.n.dot(W(*P4) - F2.o))
hip_roof(F2, 0, L2, 0, -D2, EAVE, RISE, ov=0.5)
# короткое крыло: рамка по P1→P2, конец — под скатом длинного крыла
F1, L1 = EDGES[1]
D1 = abs(F1.n.dot(W(*P0) - F1.o))
hip_roof(F1, 0, L1 - D2 / 2, 0, -D1, EAVE, RISE * D1 / D2, ov=0.5, hip1=False)
# печные трубы на коньках (наугад, как у соседних сталинок)
for u in (L2 * 0.3, L2 * 0.7):
    chimney(F2, u, -D2 / 2, EAVE + RISE - 0.3, EAVE + RISE + 1.0, w=0.7)
chimney(F1, L1 * 0.35, -D1 / 2, EAVE + RISE * D1 / D2 - 0.3, EAVE + RISE + 1.0, w=0.7)

finish('nahimova10', __file__, tri_budget=10000)
