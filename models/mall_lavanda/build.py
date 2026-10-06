# ТЦ Lavanda Mall, ул. Вакуленчука, 33А — модель с нуля.
#
#   blender -b --python models/mall_lavanda/build.py -- [glb]
#
# Узнаётся по облицовке: фиолетовые панели с выпуклыми пирамидками (грани
# светлее и темнее — фасад «переливается»), тёмно-серый низ. Главный фасад —
# на северо-запад, к улице Вакуленчука: вход под стеклянным козырьком на
# консолях, над ним стеклянный витраж до кровли, справа повыше — блок с
# белым логотипом LAVANDA mall (вместо V — значок-метка с вертикальной
# линией вниз), слева белые буквы ZENDEN и LC WAIKIKI, дальше короба COLIN'S
# и LIME. Панорама Яндекса 2021 и фото 2022–2024. Что откуда — NOTES.md.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from mall_kit import *

POLY = [(-3260.3, 2970.2), (-3194.4, 2921.7), (-3160.8, 2965.0), (-3185.1, 2983.7), (-3182.0, 2987.8),
        (-3212.1, 3011.0), (-3215.1, 3007.1), (-3225.5, 3015.1)]
A, B, C, Dd = POLY[0], POLY[1], POLY[2], POLY[7]
INSIDE = (-3210.0, 2968.0)
F, LEN = frame_lr(A, B, INSIDE)                # u: с северо-востока (слева) на юго-запад
ENT = LEN - 33.5                               # ось входа — по точке панорамы 2021
v = F.o + F.u * ENT
origin(v.x, -v.y)                              # (пока начало в нуле — это мировые x, z)
X0, Z0 = v.x, -v.y
F, LEN = frame_lr(A, B, INSIDE)

COL['wall'] = ((0.42, 0.36, 0.70), 0.45)      # фиолетовые панели
COL['wall2'] = ((0.20, 0.20, 0.23), 0.6)      # тёмно-серый низ
COL['wall3'] = ((0.56, 0.50, 0.84), 0.45)     # светлые грани пирамидок
COL['roof'] = ((0.45, 0.45, 0.46), 0.85)
COL['glass'] = ((0.15, 0.24, 0.32), 0.1)
mat('violet', (0.31, 0.26, 0.56), 0.45)       # тёмные грани
mat('logo', (0.98, 0.98, 0.98), 0.4)
mat('white', (0.96, 0.96, 0.96), 0.5)
mat('dark', (0.07, 0.07, 0.08), 0.5)
lod_keep('logo', 'violet')

GROUND = -3.0
H = 14.0           # длинное крыло
HT = 19.0          # блок с логотипом
ZB = 4.8           # тёмный низ
UT = LEN - 24.0    # начало высокого блока

prism_world('wall', POLY, GROUND, H, roof='roof')
tall = []
for u, d in ((UT, 0), (LEN, 0), (LEN, -40), (UT, -40)):
    p = F.o + F.u * u + F.n * d
    tall.append((p.x + X0, -p.y + Z0))
prism_world('wall', tall, H - 0.5, HT, roof='roof')

# ------------------------------------------------------------------ облицовка
def pyramids(Fr, u0, u1, z0, z1, d, s=2.0, h=0.32):
    """Панели-пирамидки: верхняя и левая грани светлее, нижняя и правая темнее."""
    nu = max(1, round((u1 - u0) / s)); nz = max(1, round((z1 - z0) / s))
    du, dz = (u1 - u0) / nu, (z1 - z0) / nz
    for i in range(nu):
        for k in range(nz):
            a, b = u0 + i * du, u0 + (i + 1) * du
            c, e = z0 + k * dz, z0 + (k + 1) * dz
            # не каждая панель выпуклая: рисунок «пятнами», как на фото
            if (i * 7 + k * 3) % 5 == 0:
                face('violet', [Fr.p(a, d, c), Fr.p(b, d, c), Fr.p(b, d, e), Fr.p(a, d, e)], Fr.N())
                continue
            ap = Fr.p((a + b) / 2, d + h, (c + e) / 2)
            P00, P10, P11, P01 = Fr.p(a, d, c), Fr.p(b, d, c), Fr.p(b, d, e), Fr.p(a, d, e)
            face('wall3', [P01, P11, ap], Fr.N() + UP)      # верх
            face('wall', [P00, P01, ap], Fr.N() - Fr.U())   # левая
            face('violet', [P10, P00, ap], Fr.N() - UP)     # низ
            face('wall', [P11, P10, ap], Fr.N() + Fr.U())   # правая
    for u in (u0, u1):
        pass

d0 = 0.05
box('wall2', F, 0, LEN, -0.2, d0, GROUND, ZB)                       # тёмный низ
pyramids(F, 0, ENT - 7.5, ZB, H, d0)
pyramids(F, ENT + 7.5, UT, ZB, H, d0)
pyramids(F, UT, LEN, ZB, HT, d0 + 0.6)
box('wall', F, UT, LEN, -0.2, d0 + 0.6, ZB, HT)
# боковые грани высокого блока (он выступает на 0.6 м)
# витраж над входом до кровли, стеклянный козырёк на консолях
curtain(F, ENT - 7.5, ENT + 7.5, 0.0, H - 0.3, d0 + 0.08, du=2.5, dz=2.0)
box('wall2', F, ENT - 7.6, ENT + 7.6, -0.2, d0 + 0.3, H - 0.3, H + 0.2)
box('glass', F, ENT - 9, ENT + 9, 0.1, 6.5, 5.6, 5.75)
for k in range(6):
    u = ENT - 8 + k * 3.2
    beam('metal', F.p(u, 0.2, 7.6), F.p(u, 6.4, 5.8), 0.18)
    beam('metal', F.p(u, 0.2, 5.65), F.p(u, 6.4, 5.65), 0.14)
box('glass', F, ENT - 3, ENT + 3, d0, 2.2, 0, 3.2)                 # тамбур с карусельной дверью
box('metal', F, ENT - 3.1, ENT + 3.1, d0, 2.3, 3.2, 3.5)
# витрины первого этажа по крылу
for a, b in ((4, 18), (22, 34), (ENT + 10, UT - 3)):
    curtain(F, a, b, 0.6, 4.0, d0 + 0.05, du=2.0, dz=3.4)

# ------------------------------------------------------------------ вывески
# логотип LAVANDA mall на высоком блоке: LA + метка + ANDA, под ним mall
LU = UT + 12.0
dl = d0 + 0.95
ZL = 12.4
text('logo', F, 'LA', LU - 5.6, ZL, 2.0, dl, depth=0.2, width=3.9)
text('logo', F, 'ANDA', LU + 3.9, ZL, 2.0, dl, depth=0.2, width=7.4)
text('logo', F, 'mall', LU + 3.9, ZL - 1.3, 0.9, dl, depth=0.15, width=2.8)
# метка: кольцо-капля и острие вниз, от острия — белая линия к низу фасада
cz = ZL + 3.4
ring_pts_o = [(LU + 1.9 * math.cos(math.radians(a)), cz + 1.9 * math.sin(math.radians(a))) for a in range(-40, 221, 20)]
ring_pts_i = [(LU + 1.25 * math.cos(math.radians(a)), cz + 1.25 * math.sin(math.radians(a))) for a in range(-40, 221, 20)]
for i in range(len(ring_pts_o) - 1):
    prism_uz('logo', F, [ring_pts_i[i], ring_pts_o[i], ring_pts_o[i + 1], ring_pts_i[i + 1]], dl, dl + 0.2)
tip = (LU, ZL - 0.4)
prism_uz('logo', F, [ring_pts_i[0], ring_pts_o[0], tip, (LU, ZL + 0.6)], dl, dl + 0.2)
prism_uz('logo', F, [(LU, ZL + 0.6), tip, ring_pts_o[-1], ring_pts_i[-1]], dl, dl + 0.2)
box('logo', F, LU - 0.12, LU + 0.12, dl, dl + 0.2, ZB + 0.6, ZL - 0.3)
# слева от входа: ZENDEN и LC WAIKIKI белыми буквами
text('white', F, 'ZENDEN', ENT - 15.0, 11.8, 1.3, d0 + 0.35, depth=0.15, width=10.0)
text('white', F, 'LC WAIKIKI', ENT - 15.0, 9.6, 1.3, d0 + 0.35, depth=0.15, width=12.5)
# дальше по крылу — чёрные короба COLIN'S и LIME
for u, t, w in ((ENT - 34, "COLIN'S", 4.6), (ENT - 27, 'LIME', 3.4)):
    board(F, u - 3, u + 3, 7.2, 10.4, d0 + 0.35, 'dark', depth=0.2)
    text('white', F, t, u, 8.3, 0.9, d0 + 0.55, depth=0.05, width=w)

# остальные фасады — та же облицовка, но плоская, с тёмным низом
for a, b in ((B, C), (Dd, A)):
    Fs, Ls = frame_lr(a, b, INSIDE)
    box('wall2', Fs, 0, Ls, -0.2, d0, GROUND, ZB)
    pyramids(Fs, 0, Ls, ZB, H, d0, s=2.6)

print('НАЧАЛО', round(X0, 2), round(Z0, 2))
finish('mall_lavanda', __file__)
