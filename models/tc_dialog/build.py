# ТЦ «Диалог», Большая Морская, 23 (OSM w166878757) — модель с нуля.
#
#   blender -b --python models/tc_dialog/build.py -- [glb]
#
# Торговый комплекс 1990 г. (расширен в 1999), три этажа: светлая кремовая
# коробка с лентами окон, плоская кровля со стеклянным фонарём. С запада, к
# Большой Морской, контур OSM выгнут внутрь дугой R ≈ 12 м — там стеклянный
# вогнутый фасад со входом, над ним буквы «ДИАЛОГ». Фото нет: всё, кроме
# контура, высоты и цветов из refs/center-models.json, — наугад (NOTES.md).
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import mall_kit
from mall_kit import *

# шрифт: на маке — Arial из системы, в облаке (Linux) — DejaVu
if os.path.isdir(mall_kit.FONTS):
    BOLD = 'Arial Bold.ttf'
else:
    mall_kit.FONTS = '/usr/share/fonts/truetype/dejavu/'
    BOLD = 'DejaVuSans-Bold.ttf'

# Контур OSM w166878757 (мир x, z), обход как в world.json
POLY = [(-224.4, 1217.4), (-223.4, 1217.1), (-222.3, 1216.7), (-220.6, 1216.0), (-218.3, 1214.3),
        (-216.5, 1212.2), (-215.1, 1209.7), (-214.3, 1207.0), (-214.1, 1204.2), (-214.5, 1201.5),
        (-215.4, 1198.8), (-217.0, 1196.5), (-219.0, 1194.5), (-221.4, 1193.0), (-224.0, 1192.0),
        (-226.8, 1191.6), (-228.9, 1191.6), (-230.3, 1191.9), (-231.1, 1192.2), (-233.1, 1184.5),
        (-212.2, 1179.0), (-211.5, 1181.5), (-191.0, 1176.1), (-180.2, 1217.0), (-221.6, 1227.9)]
ARC = POLY[0:18]                      # вогнутая дуга к Большой Морской
INSIDE = (-200.0, 1200.0)
CX, CZ, R = fit_circle(ARC)

# начало — вершина дуги, у входа, на уровне тротуара
origin(-214.1, 1204.2)

# Земля у углов относительно начала (рельеф data/terrain, gridHeightAt):
# участок поднимается на восток, к ул. Володарского, на 3.3 м.
GR = {(-224.4, 1217.4): 0.09, (-230.3, 1191.9): -1.65, (-231.1, 1192.2): -1.7,
      (-233.1, 1184.5): -2.40, (-212.2, 1179.0): -0.45, (-211.5, 1181.5): -0.4,
      (-191.0, 1176.1): 1.68, (-180.2, 1217.0): 3.30, (-221.6, 1227.9): 0.70}

COL['wall'] = ((0.91, 0.886, 0.83), 0.85)    # #e8e2d4 — светлая кремовая штукатурка
COL['wall2'] = ((0.80, 0.78, 0.73), 0.85)    # пояса перекрытий, парапет
COL['roof'] = ((0.56, 0.56, 0.54), 0.8)      # #8f8f8a — плоская кровля
COL['stone'] = ((0.58, 0.56, 0.52), 0.9)     # цоколь
COL['glass'] = ((0.10, 0.15, 0.19), 0.12)
COL['metal'] = ((0.30, 0.32, 0.34), 0.45)    # импосты витражей
mat('letters', (0.12, 0.30, 0.62), 0.45)     # буквы «ДИАЛОГ» — цвет наугад
mat('white', (0.95, 0.95, 0.94), 0.5)
mat('coffee', (0.10, 0.10, 0.10), 0.5)
lod_keep('letters')

GROUND = -3.0
Z1 = 5.6                 # верх первого этажа (витрины)
B1 = (Z1, 6.3)           # пояс перекрытия
RIB = [(6.6, 9.0), (10.0, 12.4)]   # ленты окон второго и третьего этажей
HR = 13.3                # плоская кровля
HP = 14.0                # верх парапета

# ------------------------------------------------------------------ объём
prism_world('wall', POLY, GROUND, HR, top=True, roof='roof')
prism_world('stone', POLY, GROUND, -0.6, top=False)
n = len(POLY)
for i in range(n):                                  # парапет по всему контуру
    a, b = W(*POLY[i]), W(*POLY[(i + 1) % n])
    beam('wall2', Vector((a.x, a.y, (HR + HP) / 2)), Vector((b.x, b.y, (HR + HP) / 2)), 0.35, HP - HR)

# ------------------------------------------------------------------ прямые фасады
def ground(p):
    return GR.get(p, 0.0)

for i in range(17, n):
    a, b = POLY[i], POLY[(i + 1) % n]
    F, L = frame_from(a, b, INSIDE)
    if L < 5:
        continue
    ga, gb = ground(a), ground(b)
    # витрины первого этажа: от земли (ниже — уходят в рельеф) до пояса
    curtain(F, 0.8, L - 0.8, min(ga, gb) - 0.4, Z1 - 0.15, 0.06, du=2.4, dz=10, mz=[Z1 - 0.15])
    box('wall2', F, 0, L, 0, 0.18, *B1, bottom=False)      # пояс над витринами
    for z0, z1 in RIB:                                       # ленты окон
        curtain(F, 0.8, L - 0.8, z0, z1, 0.06, du=1.5, dz=10, mz=[z0, z1])
        box('wall2', F, 0.7, L - 0.7, 0, 0.14, z0 - 0.12, z0, bottom=False)   # отлив

# ------------------------------------------------------------------ вогнутая стеклянная дуга
A0, A1 = ang_of((CX, CZ), ARC[0]), ang_of((CX, CZ), ARC[-1])
if A1 < A0:
    A1 += 360
C = W(CX, CZ)
NA = 18

def apt(a, r):
    a = math.radians(a)
    return Vector((C.x + r * math.cos(a), C.y + r * math.sin(a)))

def cglass(r, z0, z1):
    """Вогнутый витраж: стекло смотрит к центру дуги, на улицу."""
    for k in range(NA):
        p, q = apt(A0 + (A1 - A0) * k / NA, r), apt(A0 + (A1 - A0) * (k + 1) / NA, r)
        m = (p + q) / 2
        face('glass', [Vector((p.x, p.y, z0)), Vector((q.x, q.y, z0)), Vector((q.x, q.y, z1)), Vector((p.x, p.y, z1))],
             Vector((C.x - m.x, C.y - m.y, 0)))

RG = R - 0.3                          # стекло чуть к улице: точки OSM гуляют на 0.1 м
cglass(RG, -1.0, HR - 0.3)
for k in range(NA + 1):                              # стойки
    p = apt(A0 + (A1 - A0) * k / NA, RG - 0.06)
    beam('metal', Vector((p.x, p.y, -1.0)), Vector((p.x, p.y, HR - 0.3)), 0.10)
for z in (Z1, B1[1], RIB[0][1], RIB[1][0], HR - 0.35):   # ригели по этажам
    for k in range(NA):
        p, q = apt(A0 + (A1 - A0) * k / NA, RG - 0.06), apt(A0 + (A1 - A0) * (k + 1) / NA, RG - 0.06)
        beam('metal', Vector((p.x, p.y, z)), Vector((q.x, q.y, z)), 0.10)
# пояса перекрытий — светлые полосы поперёк стекла
for z0, z1 in ((Z1 + 0.05, B1[1]), (RIB[0][1] + 0.05, RIB[1][0] - 0.05)):
    for k in range(NA):
        p, q = apt(A0 + (A1 - A0) * k / NA, RG - 0.12), apt(A0 + (A1 - A0) * (k + 1) / NA, RG - 0.12)
        beam('wall2', Vector((p.x, p.y, (z0 + z1) / 2)), Vector((q.x, q.y, (z0 + z1) / 2)), 0.12, z1 - z0)

# вход в вершине дуги: двери и козырёк-полукольцо
AM = 0.0
for s in (-1, 1):
    p = apt(AM + s * 9.0, RG - 0.15)
    beam('metal', Vector((p.x, p.y, 0)), Vector((p.x, p.y, 3.0)), 0.16)
box_c = apt(AM, RG - 0.15)
F_E = Frame(box_c, Vector((0, 1)), Vector((-1, 0)))       # плоскость двери: вдоль север–юг, наружу на запад
box('metal', F_E, -1.9, 1.9, 0, 0.12, 2.75, 3.0, bottom=False)
box('metal', F_E, -0.05, 0.05, 0, 0.12, 0, 2.75, bottom=False)
ring('wall2', (CX, CZ), RG - 2.6, RG - 0.1, -24, 24, 4.0, 4.35, n=6)

# ------------------------------------------------------------------ буквы «ДИАЛОГ» на кровле над дугой
FT = Frame(Vector((apt(AM, RG).x, apt(AM, RG).y)), Vector((0, 1)), Vector((-1, 0)))
truss(FT, -6.5, 6.5, HP, HP + 1.7, -0.9, bays=6)
text('letters', FT, 'ДИАЛОГ', 0, HP + 0.15, 1.6, -0.75, depth=0.3, fnt=BOLD, width=12.0, spacing=1.1)

# ------------------------------------------------------------------ Surf Coffee (OSM) — у дуги с юга
F24, L24 = frame_from(POLY[24], POLY[0], INSIDE)
board(F24, L24 / 2 - 3.2, L24 / 2 + 3.2, 4.55, 5.35, 0.08, 'coffee', depth=0.2)
text('white', F24, 'SURF COFFEE', L24 / 2, 4.75, 0.42, 0.28, depth=0.05, fnt=BOLD, width=5.4)

# ------------------------------------------------------------------ стеклянный фонарь на кровле
FR, LR = frame_from((-191.0, 1176.1), (-180.2, 1217.0), INSIDE)   # ось вдоль восточного фасада
U0, U1, D0, D1 = 8.0, 32.0, -21.0, -11.0                          # 24 × 10 м посередине кровли
RISE = 1.6
prism_plan('wall2', FR, [(U0, D0), (U1, D0), (U1, D1), (U0, D1)], HR, HR + 0.5)
zb, zt, dm = HR + 0.5, HR + 0.5 + RISE, (D0 + D1) / 2
face('glass', [FR.p(U0, D1, zb), FR.p(U1, D1, zb), FR.p(U1, dm, zt), FR.p(U0, dm, zt)], FR.N() + UP * 3)
face('glass', [FR.p(U1, D0, zb), FR.p(U0, D0, zb), FR.p(U0, dm, zt), FR.p(U1, dm, zt)], -FR.N() + UP * 3)
face('glass', [FR.p(U0, D0, zb), FR.p(U0, D1, zb), FR.p(U0, dm, zt)], -FR.U())
face('glass', [FR.p(U1, D1, zb), FR.p(U1, D0, zb), FR.p(U1, dm, zt)], FR.U())
beam('metal', FR.p(U0, dm, zt + 0.05), FR.p(U1, dm, zt + 0.05), 0.16)
for k in range(9):                                                # рёбра фонаря
    u = U0 + (U1 - U0) * k / 8
    beam('metal', FR.p(u, D0, zb), FR.p(u, dm, zt), 0.08)
    beam('metal', FR.p(u, D1, zb), FR.p(u, dm, zt), 0.08)
# вентиляционные короба
for u, d in ((5.0, -6.0), (36.0, -28.0)):
    box('metal', FR, u - 1.2, u + 1.2, d - 0.8, d + 0.8, HR, HR + 1.2)

print('ДУГА: центр', round(CX, 1), round(CZ, 1), 'R', round(R, 1), 'углы', round(A0), round(A1))
finish('tc_dialog', __file__)
