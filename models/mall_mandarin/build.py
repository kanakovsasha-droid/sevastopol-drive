# ТЦ «Мандарин», ул. Генерала Хрюкина, 2 — модель с нуля.
#
#   blender -b --python models/mall_mandarin/build.py -- [glb]
#
# Коробка из серых алюминиевых панелей; главный фасад — на север, к улице
# Хрюкина: посередине выпуклая оранжевая полукруглая часть повыше с белыми
# буквами «мандарин» и медиаэкраном, по сторонам серые блоки с вывесками
# арендаторов (справа наверху — зелёное «Яблоко» с яблоком: это якорный
# супермаркет), первый этаж — стекло под колоннами. Панорама Яндекса,
# ноябрь 2024 (refs/malls/mandarin/pano_2024_north.jpg). Что откуда — NOTES.md.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from mall_kit import *

NW, NE, SE, SW = (-61.0, 5545.2), (0.5, 5526.6), (27.4, 5615.0), (-34.1, 5633.6)
INSIDE = (-17.0, 5580.0)
mid = ((NW[0] + NE[0]) / 2, (NW[1] + NE[1]) / 2)
origin(*mid)                                   # середина северного фасада
F, LEN = frame_lr(NW, NE, INSIDE)              # u слева (восток) направо (запад)
uc = LEN / 2

COL['wall'] = ((0.70, 0.72, 0.75), 0.45)     # серый алюминиевый композит
COL['wall2'] = ((0.58, 0.60, 0.63), 0.5)     # швы панелей
COL['roof'] = ((0.50, 0.50, 0.49), 0.85)
COL['glass'] = ((0.14, 0.22, 0.30), 0.12)
mat('orange', (0.93, 0.36, 0.08), 0.5)
mat('white', (0.97, 0.97, 0.97), 0.5)
mat('red', (0.82, 0.10, 0.12), 0.45)
mat('green', (0.40, 0.72, 0.12), 0.45)
mat('yellow', (0.96, 0.80, 0.10), 0.5)
mat('dark', (0.08, 0.09, 0.10), 0.4)
mat('blue', (0.10, 0.25, 0.60), 0.5)
mat('sber', (0.13, 0.63, 0.25), 0.5)
mat('logo', (0.98, 0.98, 0.98), 0.5)           # буквы «мандарин»
lod_keep('orange', 'logo')

GROUND = -3.0
H = 13.0           # серые блоки
HO = 14.6          # оранжевая середина
SB = -3.0          # серые блоки отступают от линии контура
HALF = 12.0        # полуширина оранжевой дуги по хорде
SAG = 3.0          # стрела дуги (до линии контура)

# ------------------------------------------------------------------ объём
# серые блоки стоят на линии SB, южная четверть корпуса — ниже
pS = lambda u, d: F.p(u, d, 0)
def wpt(u, d):
    v = F.o + F.u * u + F.n * d
    return (v.x + mid[0], -v.y + mid[1])
DEPTH = (W(*SW) - W(*NW)).length
body = [wpt(0, SB), wpt(LEN, SB), wpt(LEN, -DEPTH * 0.72), wpt(0, -DEPTH * 0.72)]
south = [wpt(0, -DEPTH * 0.72), wpt(LEN, -DEPTH * 0.72), wpt(LEN, -DEPTH), wpt(0, -DEPTH)]
prism_world('wall', body, GROUND, H, roof='roof')
prism_world('wall', south, GROUND, 9.0, roof='roof')
for poly, h in ((body, H), (south, 9.0)):
    P = [W(x, z) for x, z in poly]
    for i in range(len(P)):
        a, b = P[i], P[(i + 1) % len(P)]
        beam('wall2', Vector((a.x, a.y, h + 0.3)), Vector((b.x, b.y, h + 0.3)), 0.25, 0.6)

# швы панелей на северном фасаде: сетка 1.5 × 1.2 м
for u in [k * 1.5 for k in range(1, int(LEN / 1.5))]:
    if abs(u - uc) < HALF: continue
    box('wall2', F, u - 0.03, u + 0.03, SB, SB + 0.04, 4.8, H, bottom=False)
for z in [4.8 + 1.2 * k for k in range(1, 7)]:
    box('wall2', F, 0, uc - HALF, SB, SB + 0.04, z - 0.03, z + 0.03, bottom=False)
    box('wall2', F, uc + HALF, LEN, SB, SB + 0.04, z - 0.03, z + 0.03, bottom=False)
# первый этаж — витрины, над ними тонкий карниз
for a, b in ((0.8, uc - HALF), (uc + HALF, LEN - 0.8)):
    curtain(F, a, b, 0.0, 4.4, SB + 0.06, du=3.0, dz=4.4)
    box('wall2', F, a, b, SB, SB + 0.5, 4.4, 4.75)
# большие окна второго этажа — по одному витражу в каждом блоке у середины
curtain(F, uc - HALF - 9.5, uc - HALF - 1.5, 6.0, 10.6, SB + 0.06, du=2.0, dz=2.3)
curtain(F, uc + HALF + 1.5, uc + HALF + 9.5, 6.0, 10.6, SB + 0.06, du=2.0, dz=2.3)
curtain(F, 1.0, 7.0, 6.0, 10.6, SB + 0.06, du=2.0, dz=2.3)
curtain(F, LEN - 7.0, LEN - 1.0, 6.0, 10.6, SB + 0.06, du=2.0, dz=2.3)

# ------------------------------------------------------------------ оранжевая дуга
N = 14
def arc_d(t):          # t в -1..1 вдоль хорды → вынос дуги
    return SB + SAG * (1 - t * t)
us = [uc - HALF + 2 * HALF * i / N for i in range(N + 1)]
ds = [arc_d((u - uc) / HALF) for u in us]
for i in range(N):
    a = (us[i], ds[i]); b = (us[i + 1], ds[i + 1])
    pa, pb = F.p(a[0], a[1], 0), F.p(b[0], b[1], 0)
    t = (pb - pa).normalized(); n = Vector((t.y, -t.x, 0))
    if n.dot(F.N()) < 0: n = -n
    V = lambda p, z: Vector((p.x, p.y, z))
    # стекло первого этажа отступает внутрь, выше — оранжевые панели
    gi = 1.4
    qa, qb = pa - n * gi, pb - n * gi
    face('glass', [V(qa, 0), V(qb, 0), V(qb, 4.4), V(qa, 4.4)], n)
    face('orange', [V(pa, 4.4), V(pb, 4.4), V(pb, HO), V(pa, HO)], n)
    face('orange', [V(qa, 4.4), V(qb, 4.4), V(pb, 4.4), V(pa, 4.4)], -UP)
    beam('white', V(pa, HO + 0.1), V(pb, HO + 0.1), 0.35, 0.25)
    # швы оранжевых панелей
    beam('wall2', V(pa + n * 0.02, 4.4), V(pa + n * 0.02, HO), 0.05)
    for z in (6.8, 9.2, 11.6):
        beam('wall2', V(pa + n * 0.02, z), V(pb + n * 0.02, z), 0.05)
    if i % 2 == 1:     # колонны под дугой
        lathe('wall2', V((pa + pb) / 2 - n * 0.4, 0), [(0.32, 0), (0.32, 4.4)], 10, cap=False)
# кровля и торцы дуги
cap = [wpt(us[i], ds[i]) for i in range(N + 1)]
prism_world('orange', cap[::-1] + [wpt(uc + HALF, SB - 0.1), wpt(uc - HALF, SB - 0.1)], H - 0.2, HO, top=True)
# «мандарин» и медиаэкран на дуге
Fa = Frame(F.o + F.n * (SB + SAG), F.u, F.n)
text('logo', Fa, 'мандарин', uc, 10.9, 1.6, 0.1, depth=0.25, width=13.5)
board(Fa, uc - 3.4, uc + 3.4, 5.6, 9.6, 0.05, 'dark', depth=0.35)
box('blue', Fa, uc - 3.1, uc + 3.1, 0.4, 0.42, 5.9, 9.3, bottom=False)

# ------------------------------------------------------------------ вывески арендаторов
d = SB + 0.08
L0 = uc - HALF - 5.5           # левый блок: столбик вывесок у оранжевой части
board(F, L0 - 4.5, L0 + 3.5, 10.7, 11.9, d, 'red', depth=0.15)
text('white', F, 'voltmart', L0 - 0.5, 10.95, 0.75, d + 0.15, depth=0.05, width=6.4)
text('red', F, 'МЕТР', L0 - 0.5, 9.25, 0.85, d, depth=0.12, width=4.0)
board(F, L0 - 3.8, L0 + 2.8, 7.6, 8.7, d, 'dark', depth=0.12)
text('yellow', F, 'ЭСТЕТ', L0 - 0.5, 7.82, 0.7, d + 0.12, depth=0.05, width=4.4)
text('sber', F, 'СБЕР', L0 - 0.5, 6.3, 0.75, d, depth=0.12, width=3.6)
board(F, 0.6, 7.4, 11.2, 12.4, d, 'blue', depth=0.12)
text('white', F, 'BIGSHOP', 4.0, 11.45, 0.75, d + 0.12, depth=0.05, width=5.8)
R0 = uc + HALF + 5.5           # правый блок: «Яблоко» наверху, ниже SUNLIGHT, БИРКА, ОПТИКА
text('green', F, 'Яблоко', R0 - 0.6, 10.4, 1.9, d, depth=0.22, fnt='Brush Script.ttf', width=6.6, res=1)
disc('red', F, R0 + 3.6, 11.4, 0.75, d, depth=0.25, seg=12)
box('green', F, R0 + 3.75, R0 + 4.15, d, d + 0.3, 12.1, 12.6)
board(F, R0 - 4.0, R0 + 3.8, 8.6, 9.5, d, 'white', depth=0.12)
disc('red', F, R0 - 3.3, 9.05, 0.38, d + 0.12, depth=0.05, seg=10)
text('dark', F, 'SUNLIGHT', R0 + 0.5, 8.78, 0.55, d + 0.12, depth=0.05, width=5.6)
text('white', F, 'БИРКА', R0, 7.25, 0.65, d, depth=0.12, width=4.2)
text('red', F, 'ОПТИКА', R0, 6.0, 0.7, d, depth=0.12, width=4.8)
board(F, LEN - 7.2, LEN - 0.6, 11.2, 12.4, d, 'red', depth=0.12)
text('white', F, 'GOOD', LEN - 3.9, 11.45, 0.75, d + 0.12, depth=0.05, width=4.0)

# ------------------------------------------------------------------ прочие фасады
FE, LE = frame_lr(NE, SE, INSIDE)
curtain(FE, 4, LE * 0.6, 0.0, 4.4, 0.06, du=3.0, dz=4.4)
FW, LW = frame_lr(SW, NW, INSIDE)
curtain(FW, LW * 0.4, LW - 6, 0.0, 4.4, 0.06, du=3.0, dz=4.4)
box('stone', F, 0, LEN, SB - 0.3, SB + 0.2, GROUND, 0.05)

finish('mall_mandarin', __file__)
