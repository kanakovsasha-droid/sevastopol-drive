# Фоновый трёхэтажный жилой корпус без адреса у пр. Нахимова (Черноморка), OSM w91092515.
# Фото нет: план — по контуру OSM, высота и цвета — по refs/center-models.json
# (3 этажа, 12 м, стены #e0d6bd, кровля #7a7a7a). Остальное — сдержанно, в духе
# послевоенных соседей: оштукатуренные стены, цоколь, тяга над первым этажом,
# карниз, вальмовая кровля, три подъезда со двора. Что наугад — NOTES.md.
#
#   python build.py -- glb      (модуль bpy)  или  blender -b --python build.py -- glb
#
# План. Контур OSM — почти прямоугольник 46,8 × 14,1 м, длинной стороной с СВ на ЮЗ.
# Рамка F — северо-западный фасад (к проезду w406560755 / w701165045): начало в
# северном углу P0, u — на юго-запад к P3, n — наружу (на СЗ); дом лежит в d ∈ [−D, 0].
import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

P0, P1, P3 = (-445.5, 448.2), (-433.7, 456.1), (-472.5, 486.4)
INSIDE = (-451.6, 466.7)
F, L = frame_from(P0, P3, INSIDE)
D = 14.1                                   # глубина корпуса: рёбра P0P1 и P2P3 — 14,2 и 14,1 м

# начало модели — середина главного фасада у земли
OX, OZ = (P0[0] + P3[0]) / 2, (P0[1] + P3[1]) / 2
origin(OX, OZ)
F, L = frame_from(P0, P3, INSIDE)          # пересчитать в местных осях

COL['wall'] = ((0.878, 0.839, 0.741), 0.9)     # #e0d6bd
COL['roof'] = ((0.478, 0.478, 0.478), 0.75)    # #7a7a7a
COL['stone'] = ((0.62, 0.60, 0.56), 0.9)
COL['trim'] = ((0.93, 0.91, 0.86), 0.85)

def F2(o, u, n):
    return Frame(Vector((o.x, o.y)), Vector((u.x, u.y)), Vector((n.x, n.y)))

# четыре фасада по прямоугольнику: (рамка, длина)
FAC = {
    'nw': (F, L),
    'sw': (F2(F.p(L, 0, 0), -F.n, F.u), D),
    'se': (F2(F.p(L, -D, 0), -F.u, -F.n), L),
    'ne': (F2(F.p(0, -D, 0), F.n, -F.u), D),
}

Z_GROUND = -3.0       # стены уходят в землю: площадка под моделью срезается до отметки начала
Z_PLINTH = 0.9        # отметка первого этажа
FLOOR = 3.3
Z_EAVES = Z_PLINTH + 3 * FLOOR + 0.2          # 11,0 — низ карниза
SILL = 0.85
WIN_W, WIN_H = 1.35, 1.85
DOOR_W, DOOR_H = 1.5, 2.45

def axes(length, step):
    n = max(1, round(length / step))
    s = length / n
    return [s * (i + 0.5) for i in range(n)]

def light_window(Fr, ua, ub, za, zb, d):
    """Окно попроще кита: стекло в глубине, импост и фрамуга, подоконник."""
    r = 0.2
    g = d - r + 0.02
    face('glass', [Fr.p(ua, g, za), Fr.p(ub, g, za), Fr.p(ub, g, zb), Fr.p(ua, g, zb)], Fr.N())
    t = 0.07
    cu = (ua + ub) / 2
    box('trim', Fr, cu - t / 2, cu + t / 2, g, g + 0.06, za, zb, bottom=False)
    zt = za + (zb - za) * 0.72
    box('trim', Fr, ua, ub, g, g + 0.06, zt - t / 2, zt + t / 2, bottom=False)
    box('trim', Fr, ua - 0.08, ub + 0.08, d - 0.02, d + 0.1, za - 0.08, za, bottom=False)

def facade(key):
    """Глухой фасад без подъездов: окна по осям, цоколь, тяга, карниз."""
    Fr, Lf = FAC[key]
    holes = []
    for cu in axes(Lf, 3.1 if Lf > 20 else 3.4):
        for fl in range(3):
            za = Z_PLINTH + fl * FLOOR + SILL
            ua, ub = cu - WIN_W / 2, cu + WIN_W / 2
            holes.append((ua, ub, za, za + WIN_H))
            light_window(Fr, ua, ub, za, za + WIN_H, 0)
    wall(Fr, 0, Lf, Z_PLINTH, Z_EAVES, 0, holes, reveal=0.2)
    base(Fr, Lf, [])

def base(Fr, Lf, dh):
    """Каменный цоколь чуть с выступом, до z = −3; тяга над первым этажом; карниз."""
    wall(Fr, -0.08, Lf + 0.08, Z_GROUND, Z_PLINTH, 0.08, dh, m='stone', reveal=0.33)
    cuts = [-0.08] + [v for a, b, *_ in sorted(dh) for v in (a, b)] + [Lf + 0.08]
    for a, b in zip(cuts[::2], cuts[1::2]):        # полка цоколя, разрезанная дверями
        face('stone', [Fr.p(a, 0.08, Z_PLINTH), Fr.p(b, 0.08, Z_PLINTH),
                       Fr.p(b, 0, Z_PLINTH), Fr.p(a, 0, Z_PLINTH)], UP)
    band(Fr, 0, Lf, 0, Z_PLINTH + FLOOR - 0.12, Z_PLINTH + FLOOR + 0.06, 0.09)
    cornice(Fr, 0, Lf, 0, Z_EAVES - 0.6, ext=0.45)

DOORS_SE = (2, 7, 12)
for key in ('nw', 'sw', 'ne'):
    facade(key)

# юго-восточный фасад: у подъездов в первом этаже проём от крыльца до верха двери
Fr, Lf = FAC['se']
us = axes(Lf, 3.1)
holes = []
for i, cu in enumerate(us):
    for fl in range(3):
        za = Z_PLINTH + fl * FLOOR + SILL
        if fl == 0 and i in DOORS_SE:
            holes.append((cu - DOOR_W / 2, cu + DOOR_W / 2, 0.15, 0.15 + DOOR_H))
            continue
        ua, ub = cu - WIN_W / 2, cu + WIN_W / 2
        holes.append((ua, ub, za, za + WIN_H))
        light_window(Fr, ua, ub, za, za + WIN_H, 0)
wall(Fr, 0, Lf, Z_PLINTH, Z_EAVES, 0, holes, reveal=0.25)
# проём двери в цоколе — на всю высоту двери: иначе откос на отметке цоколя
# режет дверь поперёк
dh = [(us[i] - DOOR_W / 2, us[i] + DOOR_W / 2, 0.15, 0.15 + DOOR_H) for i in DOORS_SE]
base(Fr, Lf, dh)
for i in DOORS_SE:
    cu = us[i]
    ua, ub = cu - DOOR_W / 2, cu + DOOR_W / 2
    za, zb = 0.15, 0.15 + DOOR_H
    face('wood', [Fr.p(ua, -0.25, za), Fr.p(ub, -0.25, za), Fr.p(ub, -0.25, zb), Fr.p(ua, -0.25, zb)], Fr.N())
    box('trim', Fr, ua - 0.15, ub + 0.15, -0.02, 0.06, zb, zb + 0.15, bottom=False)
    box('stone', Fr, ua - 0.6, ub + 0.6, 0, 1.3, zb + 0.35, zb + 0.5)          # козырёк
    box('stone', Fr, ua - 0.5, ub + 0.5, 0, 1.2, -0.3, za, bottom=False)        # крыльцо

# перекрытие под кровлей (на случай взгляда сверху сквозь свес) и кровля
face('wall', [F.p(0, 0, Z_EAVES), F.p(L, 0, Z_EAVES), F.p(L, -D, Z_EAVES), F.p(0, -D, Z_EAVES)], UP)
hip_roof(F, 0, L, 0, -D, Z_EAVES, 3.0, ov=0.5)
# трубы — по шагу подъездов, на коньке
for i in DOORS_SE:
    u = L - us[i]
    chimney(F, u, -D / 2 + 1.6, Z_EAVES + 1.5, Z_EAVES + 4.2, w=0.8)

finish('w91092515', __file__, tri_budget=10000)
