# Одесская, 5 (Черноморка) — трёхэтажный Г-образный корпус, в OSM
# building=school, building:levels=3 (way 91092545). Модель с нуля.
#
#   blender -b --python models/odesskaya5/build.py -- [glb]
#
# Фото дома нет: по refs/center-models.json — «3 этажа, Г-образный, типичный
# сталинский дом, кремовые стены, скатная крыша», и всё, кроме плана, — наугад.
# Поэтому модель сдержанная: план — контур OSM как есть, три этажа окон,
# цоколь, пояс над первым этажом, венчающий карниз, вальмовые скаты серой
# кровли. Вход — на торце пристройки к Торговой улице (там же ставил крыльцо
# schools.js). Что наугад — NOTES.md. Ноль высоты — земля у входа.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

# контур OSM (мир x, z), обход как в world.json
POLY = [(-572.4, 565.1), (-550.0, 582.0), (-518.8, 540.7), (-508.6, 548.3), (-550.6, 603.9),
        (-583.2, 579.3), (-577.1, 571.3), (-591.4, 560.6), (-584.9, 551.9), (-570.6, 562.7)]
ENTRY = 7                      # ребро P7→P8 — торец пристройки к Торговой улице

X0, Z0 = (POLY[7][0] + POLY[8][0]) / 2, (POLY[7][1] + POLY[8][1]) / 2
origin(X0, Z0)

COL['wall'] = ((0.88, 0.84, 0.74), 0.9)       # кремовая штукатурка (#e0d6bd)
COL['wall2'] = ((0.80, 0.76, 0.66), 0.9)      # первый этаж на тон темнее
COL['trim'] = ((0.93, 0.91, 0.85), 0.85)      # пояса, карниз, подоконники
COL['stone'] = ((0.58, 0.56, 0.52), 0.9)      # цоколь, ступени
COL['roof'] = ((0.48, 0.48, 0.48), 0.85)      # серая кровля (#7a7a7a)
COL['glass'] = ((0.10, 0.13, 0.16), 0.15)
COL['wood'] = ((0.30, 0.19, 0.11), 0.6)

GROUND = -3.0
PL = 0.6                       # верх цоколя
FL = (PL, 4.4, 7.8)            # уровни этажей
EAVE = 11.4                    # низ венчающего карниза
CTOP = EAVE + 0.6              # верх карниза = свес кровли
PITCH = math.tan(math.radians(28))
WW, WH, SILL = 1.6, 2.3, 0.95  # окно: ширина, высота, подоконник над полом
STEP = 3.4                     # шаг осей окон

P = [W(*p) for p in POLY]
n = len(P)
area = sum(P[i].x * P[(i + 1) % n].y - P[(i + 1) % n].x * P[i].y for i in range(n)) / 2
CCW = area > 0

def frame_edge(i):
    a, b = P[i], P[(i + 1) % n]
    u = (b - a).normalized()
    nrm = Vector((u.y, -u.x)) if CCW else Vector((-u.y, u.x))   # наружу
    return Frame(a, u, nrm), (b - a).length

def quad(m, F, u0, u1, z0, z1, d, hint=None):
    face(m, [F.p(u0, d, z0), F.p(u1, d, z0), F.p(u1, d, z1), F.p(u0, d, z1)], hint if hint is not None else F.N())

def axes(L, skip=()):
    """Оси окон по ребру: целое число пролётов, поля по краям не меньше 1.2 м."""
    k = int((L - 2.4) // STEP) + 1 if L >= 2.4 + WW else 0
    if k <= 0:
        return []
    m = (L - (k - 1) * STEP) / 2
    return [m + i * STEP for i in range(k) if not any(a <= m + i * STEP <= b for a, b in skip)]

def facade(F, L, door=None):
    """Стена ребра: цоколь, три ряда окон, пояс над первым этажом, карниз."""
    skip = [(door[0] - 1.0, door[1] + 1.0)] if door else []
    us = axes(L, skip)
    up = [u for u in axes(L)]
    holes1, holes = [], []
    for u in us:
        holes1.append((u - WW / 2, u + WW / 2, FL[0] + SILL, FL[0] + SILL + WH))
    for f in (1, 2):
        for u in up:
            holes.append((u - WW / 2, u + WW / 2, FL[f] + SILL, FL[f] + SILL + WH))
    if door:
        holes1.append((door[0], door[1], PL, PL + 3.0))
    wall(F, 0, L, PL, FL[1], 0, holes1, m='wall2')
    wall(F, 0, L, FL[1], CTOP, 0, holes)
    box('stone', F, 0, L, -0.3, 0.08, GROUND, PL, bottom=False)
    band(F, 0, L, 0, FL[1] - 0.1, FL[1] + 0.12, 0.10)
    band(F, 0, L, 0, FL[2] + SILL - 0.25, FL[2] + SILL - 0.12, 0.05)
    cornice(F, 0, L, 0, EAVE, ext=0.5)
    for ua, ub, za, zb in holes1 + holes:
        if door and ua == door[0]:
            continue
        g = -0.22
        quad('glass', F, ua, ub, za, zb, g)
        cu, zt = (ua + ub) / 2, za + (zb - za) * 0.7
        quad('trim', F, cu - 0.04, cu + 0.04, za, zb, g + 0.03)                # импост
        quad('trim', F, ua, ub, zt - 0.04, zt + 0.04, g + 0.03)                # фрамуга
        box('trim', F, ua - 0.1, ub + 0.1, -0.02, 0.12, za - 0.08, za, bottom=False)   # подоконник

for i in range(n):
    F, L = frame_edge(i)
    if L < 0.05:
        continue
    door = None
    if i == ENTRY:
        door = (L / 2 - 1.0, L / 2 + 1.0)
    facade(F, L, door)

# ------------------------------------------------------------------ кровля
# Г: длинное крыло по ребру 3 (69.7 × 12.7), широкое по ребру 4 (40.8 × 17.8)
# с вальмой на внешнем углу и фронтоном к пристройке, пристройка по ребру 6
# (17.9 × 10.8) упирается своим скатом во фронтон широкого крыла.
FA, LA = frame_edge(3)
FB, LB = frame_edge(4)
FC, LC = frame_edge(6)
WA, WB, WC = 12.72, 17.84, 10.82
hip_roof(FA, 0, LA - WB / 2, 0, -WA, CTOP, WA / 2 * PITCH, hip0=True, hip1=False)
hip_roof(FB, 0, LB, 0, -WB, CTOP, WB / 2 * PITCH, hip0=True, hip1=False)
hip_roof(FC, 0, LC, 0, -WC, CTOP, WC / 2 * PITCH, hip0=False, hip1=True)
# перекрытие под кровлей (снизу через свес не видно пустоты)
face('wall', [Vector((p.x, p.y, CTOP)) for p in P], -UP)

# ------------------------------------------------------------------ вход
# Крыльцо как у типовых школ (schools.js): ступени, площадка, бетонный
# козырёк на двух столбах, двустворчатая дверь с фрамугой.
FE, LE = frame_edge(ENTRY)
c = LE / 2
g = -0.22
quad('wood', FE, c - 1.0, c + 1.0, PL, PL + 2.3, g)
quad('glass', FE, c - 1.0, c + 1.0, PL + 2.3, PL + 3.0, g)
quad('trim', FE, c - 0.03, c + 0.03, PL, PL + 2.3, g + 0.03)
quad('trim', FE, c - 1.0, c + 1.0, PL + 2.26, PL + 2.34, g + 0.03)
box('stone', FE, c - 2.4, c + 2.4, 0, 2.4, GROUND, PL - 0.02)                    # площадка
for k in range(3):                                                              # ступени
    z = PL - 0.2 * (k + 1)
    box('stone', FE, c - 1.8, c + 1.8, 2.4, 2.4 + 0.32 * (k + 1), GROUND, z)
box('trim', FE, c - 2.7, c + 2.7, 0, 2.9, PL + 3.25, PL + 3.5)                  # козырёк
for s in (-1, 1):
    box('trim', FE, c + s * 2.2 - 0.15, c + s * 2.2 + 0.15, 2.3, 2.6, PL, PL + 3.25)

finish('odesskaya5', __file__)
