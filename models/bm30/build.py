# Большая Морская, 30 — жилой дом 1913 г. (памятник) с арочной нишей-лоджией
# и балконом на лепных пилястрах. Модель с нуля по описанию в
# refs/center-models.json (id w166878763); что видно и что наугад — NOTES.md.
#
#   blender -b --python models/bm30/build.py -- [glb]
#
# Контур OSM way 166878763 — прямоугольник 19.74 × 13.42 м (OSM гуляет на
# 0.1 м, выпрямлено). Местная система:
#   a — вдоль уличного фасада от северного угла на юг (SSW, 75° к оси x мира),
#   b — от улицы вглубь участка (на запад).
# Уличный фасад (b = 0) смотрит на Большую Морскую, на восток; дворовый
# (b = 13.42) — на запад. Север и юг — брандмауэры, к ним вплотную соседи
# (w92723108 высотой 14 м и w166878764 — 10.8 м).
# Ноль высоты — тротуар посередине уличного фасада.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

# ------------------------------------------------------------------ местная система
A0 = (-285.0, 1147.4)                          # северо-восточный угол контура
SA = (0.25325, 0.96740)                        # +a в мире (x, z)
SN = (0.96740, -0.25325)                       # наружу от уличного фасада
LA, LB = 19.74, 13.42                          # длина фасада, глубина дома

def LW(a, b):
    return (A0[0] + a * SA[0] - b * SN[0], A0[1] + a * SA[1] - b * SN[1])

X0, Z0 = [round(c, 2) for c in LW(LA / 2, 0)]
origin(X0, Z0)
VA = Vector((SA[0], -SA[1]))                   # +a в плане Blender
VN = Vector((SN[0], -SN[1]))                   # наружу от улицы в плане Blender

def P2(a, b):
    return W(*LW(a, b))

FE = Frame(P2(0, 0), VA, VN)                   # уличный фасад: u = a
FW = Frame(P2(LA, LB), -VA, -VN)               # дворовый: u = LA − a
FN = Frame(P2(0, LB), VN, -VA)                # северный торец: u = LB − b
FS = Frame(P2(LA, 0), -VN, VA)                 # южный торец: u = b

# ------------------------------------------------------------------ цвета
COL['wall'] = ((0.91, 0.90, 0.88), 0.9)        # штукатурка #e8e6e0 (по описанию)
COL['trim'] = ((0.96, 0.95, 0.92), 0.85)       # пилястры, наличники — светлее стены
COL['wall2'] = ((0.74, 0.72, 0.68), 0.85)      # рустовка первого этажа плиткой (тон на глаз)
COL['stone'] = ((0.58, 0.57, 0.54), 0.9)       # цоколь, ступени, швы руста
COL['roof'] = ((0.42, 0.38, 0.36), 0.8)        # кровля #6b625c
COL['glass'] = ((0.08, 0.10, 0.12), 0.15)
COL['metal'] = ((0.07, 0.07, 0.08), 0.5)       # чёрные столбы витрин, перила
COL['wood'] = ((0.30, 0.20, 0.13), 0.6)        # двери в нише

GROUND = -3.0
Z1 = 4.3          # верх первого этажа (торговый)
Z2 = 7.9          # пол третьего этажа
ZC = 11.4         # низ венчающего карниза
ZP = 13.0         # верх парапета (height из описания)
D_RIS = 0.25      # вынос левого ризалита с фронтоном
D_RIS2 = 0.12     # вынос правого ризалита

# оси уличного фасада (a): правый (северный) ризалит, четыре средних оси,
# левый (южный) ризалит с нишей — «слева», если смотреть с улицы
R2 = (0.35, 3.85)
RL = (15.90, 19.40)
MID = [R2[1] + (RL[0] - R2[1]) * (i + 0.5) / 4 for i in range(4)]

# ------------------------------------------------------------------ примитивы
def quad(m, F, u0, u1, z0, z1, d, hint=None):
    face(m, [F.p(u0, d, z0), F.p(u1, d, z0), F.p(u1, d, z1), F.p(u0, d, z1)],
         hint if hint is not None else F.N())

def arc_pts(cu, zs, r, n):
    return [(cu + r * math.cos(math.pi * k / n), zs + r * math.sin(math.pi * k / n)) for k in range(n + 1)]

def disk(m, F, cu, cz, r, d0, d1, n=12):
    prism_uz(m, F, [(cu + r * math.cos(2 * math.pi * k / n), cz + r * math.sin(2 * math.pi * k / n))
                    for k in range(n)], d0, d1)

def rust(F, u0, u1, z0, z1, d, step=0.45):
    """Рустовка: горизонтальные швы-полосы поверх стены первого этажа."""
    z = z0 + step
    while z < z1 - 0.1:
        box('stone', F, u0, u1, d, d + 0.025, z - 0.03, z)
        z += step

def shopfront(F, ua, ub, za, zb, d, door=False):
    """Витрина или дверь магазина: стекло в глубине, чёрные тонкие стойки."""
    g = d - 0.28
    quad('glass', F, ua, ub, za, zb, g)
    t = 0.07
    for u in (ua, ub):
        box('metal', F, u - t / 2, u + t / 2, g, g + 0.08, za, zb)
    box('metal', F, ua, ub, g, g + 0.08, zb - 0.6 - t, zb - 0.6)        # фрамуга
    box('metal', F, ua, ub, g, g + 0.08, za, za + 0.12)
    if not door:
        cu = (ua + ub) / 2
        box('metal', F, cu - t / 2, cu + t / 2, g, g + 0.08, za, zb)
    else:
        box('wood', F, ua + 0.05, ub - 0.05, g, g + 0.05, za, zb - 0.67)

def railing(F, u0, u1, d, z0, h=1.0, herring=True):
    """Кованые перила: поручень, низ, стойки и «ёлочка» косыми прутьями."""
    box('metal', F, u0, u1, d - 0.03, d + 0.03, z0 + h - 0.05, z0 + h)
    box('metal', F, u0, u1, d - 0.02, d + 0.02, z0 + 0.08, z0 + 0.12)
    n = max(2, int(round((u1 - u0) / 0.5)))
    for i in range(n + 1):
        u = u0 + (u1 - u0) * i / n
        box('metal', F, u - 0.02, u + 0.02, d - 0.02, d + 0.02, z0, z0 + h)
    if herring:
        zm = z0 + 0.12; zt = z0 + h - 0.05
        for i in range(n):
            ua = u0 + (u1 - u0) * i / n; ub = u0 + (u1 - u0) * (i + 1) / n
            cu = (ua + ub) / 2
            beam('metal', F.p(ua + 0.02, d, zm), F.p(cu, d, (zm + zt) / 2), 0.025)
            beam('metal', F.p(ub - 0.02, d, zm), F.p(cu, d, (zm + zt) / 2), 0.025)
            beam('metal', F.p(cu, d, (zm + zt) / 2), F.p(cu, d, zt), 0.025)

# ------------------------------------------------------------------ уличный фасад
F = FE
# первый этаж: рустованный, витрины по осям, двери в ризалитах
holes1 = []
for cu in MID:
    holes1.append((cu - 1.05, cu + 1.05, 0.55, 3.75))
dl = ((RL[0] + RL[1]) / 2 - 0.75, (RL[0] + RL[1]) / 2 + 0.75)
dr = ((R2[0] + R2[1]) / 2 - 0.75, (R2[0] + R2[1]) / 2 + 0.75)
door_z = 0.30
holes1 += [(dl[0], dl[1], door_z, 3.75), (dr[0], dr[1], door_z, 3.75)]
wall(F, 0, LA, GROUND, Z1, 0, holes1, m='wall2', reveal=0.28, rm='wall2')
for ua, ub, za, zb in holes1:
    shopfront(F, ua, ub, za, zb, 0, door=(za == door_z))
# швы руста только по простенкам
edges = sorted([0] + [h[0] for h in holes1] + [h[1] for h in holes1] + [LA])
for i in range(0, len(edges) - 1, 2):
    rust(F, edges[i], edges[i + 1], 0.45, Z1 - 0.3, 0)
box('stone', F, 0, LA, -0.05, 0.10, GROUND, 0.45)                       # цоколь
for ua, ub in (dl, dr):                                                  # ступени
    box('stone', F, ua - 0.3, ub + 0.3, 0, 0.55, GROUND, 0.15)
    box('stone', F, ua - 0.3, ub + 0.3, 0, 0.28, 0.15, 0.30)
band(F, 0, LA, 0, Z1 - 0.30, Z1, 0.22)                                   # пояс над витринами

# средняя часть: прямоугольные окна 2 и 3 этажей в узких наличниках
WW, WH2, WH3 = 1.25, 2.30, 2.10
z2a, z3a = Z1 + 0.95, Z2 + 0.85
holes2 = []
for cu in MID:
    holes2.append(window(F, cu, z2a, WW, WH2, 0, cols=2, rows=(0.72,)))
    holes2.append(window(F, cu, z3a, WW, WH3, 0, cols=2, rows=(0.70,)))
wall(F, R2[1], RL[0], Z1, ZP, 0, holes2)
# барельефный пояс между этажами: тяга и филёнки под окнами третьего этажа
band(F, R2[1], RL[0], 0, Z2 - 0.05, Z2 + 0.12, 0.10)
for cu in MID:
    box('trim', F, cu - WW / 2 - 0.1, cu + WW / 2 + 0.1, 0, 0.06, Z2 + 0.22, z3a - 0.22)
    box('wall', F, cu - WW / 2 + 0.05, cu + WW / 2 - 0.05, 0.06, 0.08, Z2 + 0.32, z3a - 0.32)

# правый (северный) ризалит: окно на этаж, свой карниз
holesR = [window(F, (R2[0] + R2[1]) / 2, z2a, WW, WH2, D_RIS2, cols=2, rows=(0.72,)),
          window(F, (R2[0] + R2[1]) / 2, z3a, WW, WH3, D_RIS2, cols=2, rows=(0.70,))]
wall(F, R2[0], R2[1], Z1, ZP, D_RIS2, holesR)
quad('wall', F, 0, R2[0], Z1, ZP, 0)
for u, s in ((R2[0], -1), (R2[1], 1)):                                   # боковины выноса
    face('wall', [F.p(u, 0, Z1), F.p(u, D_RIS2, Z1), F.p(u, D_RIS2, ZP), F.p(u, 0, ZP)], F.U() * s)
band(F, R2[0], R2[1], D_RIS2, Z2 - 0.05, Z2 + 0.12, 0.10)

# левый (южный) ризалит: пилястры, арочная ниша-лоджия на 2–3 этажах, фронтон
ua, ub = RL[0] + 0.70, RL[1] - 0.70           # проём ниши между пилястрами
cu = (RL[0] + RL[1]) / 2
r = (ub - ua) / 2
zs = ZC - 0.45 - r                            # пята арки
ND = 1.30                                     # глубина ниши (наугад)
dR = D_RIS
n_arc = 10
arc = arc_pts(cu, zs, r, n_arc)
# лицевая стена ризалита с аркой
quad('wall', F, RL[0], ua, Z1, ZP, dR)
quad('wall', F, ub, RL[1], Z1, ZP, dR)
quad('wall', F, ua, ub, zs + r, ZP, dR)
face('wall', [F.p(ua, dR, zs + r)] + [F.p(u, dR, z) for u, z in arc[n_arc // 2:]], F.N())
face('wall', [F.p(ub, dR, zs + r)] + [F.p(u, dR, z) for u, z in reversed(arc[:n_arc // 2 + 1])], F.N())
quad('wall', F, ua, ub, Z1, Z1 + 0.15, dR)
quad('wall', F, RL[1], LA, Z1, ZP, 0)
for u, s in ((RL[0], -1), (RL[1], 1)):
    face('wall', [F.p(u, 0, Z1), F.p(u, dR, Z1), F.p(u, dR, ZP), F.p(u, 0, ZP)], F.U() * s)
# откосы и свод ниши
d_back = dR - ND
for u, s in ((ua, 1), (ub, -1)):
    face('wall', [F.p(u, dR, Z1 + 0.15), F.p(u, d_back, Z1 + 0.15), F.p(u, d_back, zs), F.p(u, dR, zs)], F.U() * s)
for k in range(n_arc):
    (u0, z0), (u1, z1) = arc[k], arc[k + 1]
    face('wall', [F.p(u0, dR, z0), F.p(u1, dR, z1), F.p(u1, d_back, z1), F.p(u0, d_back, z0)],
         -(F.U() * (u0 + u1 - 2 * cu) / 2 + UP * ((z0 + z1) / 2 - zs)))
face('wall', [F.p(ua, dR, Z1 + 0.15), F.p(ub, dR, Z1 + 0.15), F.p(ub, d_back, Z1 + 0.15), F.p(ua, d_back, Z1 + 0.15)], UP)
# задняя стена ниши: две балконные двери и веерная фрамуга в своде
d2 = (Z1 + 0.15, Z2 - 0.55)
d3 = (Z2 + 0.15, zs - 0.10)
dw = 1.10
hb = [(cu - dw / 2, cu + dw / 2, d2[0], d2[1]), (cu - dw / 2, cu + dw / 2, d3[0], d3[1])]
wall(F, ua, ub, Z1 + 0.15, zs, d_back, hb, reveal=0.12)
for h in hb:
    glazing(F, h[0], h[1], h[2], h[3], d_back, cols=2, rows=(0.75,), reveal=0.12)
face('glass', [F.p(u, d_back, z) for u, z in arc], F.N())                # фрамуга
for k in range(1, 6):                                                    # веер
    a = math.pi * k / 6
    beam('trim', F.p(cu, d_back + 0.03, zs), F.p(cu + r * math.cos(a), d_back + 0.03, zs + r * math.sin(a)), 0.05)
box('trim', F, ua, ub, d_back, d_back + 0.06, zs - 0.08, zs)
inner = arc_pts(cu, zs, 0.35, 6)
face('trim', [F.p(u, d_back + 0.05, z) for u, z in inner], F.N())
# балкон третьего этажа внутри ниши и перила «ёлочкой» на обоих ярусах
box('wall', F, ua, ub, d_back, dR, Z2 - 0.10, Z2 + 0.15)
railing(F, ua + 0.02, ub - 0.02, dR - 0.06, Z1 + 0.15)
railing(F, ua + 0.02, ub - 0.02, dR - 0.06, Z2 + 0.15)
# пилястры с наличниками (лепные): ствол, филёнка, капитель-импост
for p0, p1 in ((RL[0], ua), (ub, RL[1])):
    box('trim', F, p0 + 0.04, p1 - 0.04, dR, dR + 0.12, Z1 + 0.15, zs + 0.25)
    box('wall', F, p0 + 0.16, p1 - 0.16, dR + 0.12, dR + 0.15, Z1 + 0.5, zs - 0.4)
    box('trim', F, p0 - 0.02, p1 + 0.02, dR, dR + 0.20, zs, zs + 0.25)                 # импост арки
    box('trim', F, p0 - 0.04, p1 + 0.04, dR, dR + 0.18, Z1 + 0.0, Z1 + 0.18)            # база
# архивольт
arcO = arc_pts(cu, zs, r + 0.24, n_arc)
for k in range(n_arc):
    q = [F.p(arc[k][0], dR + 0.08, arc[k][1]), F.p(arc[k + 1][0], dR + 0.08, arc[k + 1][1]),
         F.p(arcO[k + 1][0], dR + 0.08, arcO[k + 1][1]), F.p(arcO[k][0], dR + 0.08, arcO[k][1])]
    face('trim', q, F.N())
    face('trim', [F.p(arcO[k][0], dR, arcO[k][1]), F.p(arcO[k + 1][0], dR, arcO[k + 1][1]),
                  F.p(arcO[k + 1][0], dR + 0.08, arcO[k + 1][1]), F.p(arcO[k][0], dR + 0.08, arcO[k][1])],
         F.U() * (arcO[k][0] - cu) + UP * (arcO[k][1] - zs))
box('trim', F, cu - 0.18, cu + 0.18, dR, dR + 0.16, zs + r - 0.05, zs + r + 0.34)       # замковый камень

# ------------------------------------------------------------------ венчание
cornice(F, 0, RL[0], 0, ZC, ext=0.42)
cornice(F, R2[0], R2[1], D_RIS2, ZC - 0.05, ext=0.50)                      # карниз правого ризалита
cornice(F, RL[0], RL[1], dR, ZC, ext=0.42)
cornice(F, RL[1], LA, 0, ZC, ext=0.30)
box('trim', F, 0, LA, -0.15, 0.08, ZP - 0.12, ZP)                          # обрез парапета
# фронтон над нишей с медальоном-розеткой в тимпане
zf = ZC + 0.6
HF = 1.8
hw = (RL[1] - RL[0]) / 2 + 0.25
prism_uz('wall', F, [(cu - hw + 0.2, zf), (cu + hw - 0.2, zf), (cu, zf + HF - 0.15)], dR - 0.3, dR + 0.05)
for s in (-1, 1):
    prism_uz('trim', F, [(cu + s * hw, zf), (cu + s * hw, zf + 0.2), (cu, zf + HF + 0.05), (cu, zf + HF - 0.15)],
             dR - 0.3, dR + 0.28)
box('trim', F, cu - hw, cu + hw, dR - 0.3, dR + 0.28, zf - 0.02, zf + 0.12)
disk('trim', F, cu, zf + 0.68, 0.42, dR + 0.05, dR + 0.12, 14)
disk('trim', F, cu, zf + 0.68, 0.18, dR + 0.12, dR + 0.20, 10)
for k in range(8):                                                         # лепестки розетки
    a = 2 * math.pi * k / 8
    disk('trim', F, cu + 0.30 * math.cos(a), zf + 0.68 + 0.30 * math.sin(a), 0.07, dR + 0.12, dR + 0.17, 6)

# ------------------------------------------------------------------ дворовый фасад (наугад)
F = FW
axes = [LA * (i + 0.5) / 6 for i in range(6)]
hy = []
for c in axes:
    hy.append(window(F, c, 1.0, 1.15, 2.0, 0, cols=2))
    hy.append(window(F, c, z2a, 1.15, 2.1, 0, cols=2))
    hy.append(window(F, c, z3a, 1.15, 2.0, 0, cols=2))
wall(F, 0, LA, GROUND, ZP, 0, hy)
box('stone', F, 0, LA, -0.05, 0.08, GROUND, 0.45)
band(F, 0, LA, 0, Z1 - 0.15, Z1, 0.08)
band(F, 0, LA, 0, ZC + 0.2, ZC + 0.5, 0.18)
box('trim', F, 0, LA, -0.15, 0.08, ZP - 0.12, ZP)

# ------------------------------------------------------------------ брандмауэры и кровля
for F_ in (FN, FS):
    quad('wall', F_, 0, LB, GROUND, ZP, 0)
    box('trim', F_, 0, LB, -0.15, 0.08, ZP - 0.12, ZP)
# малоуклонная кровля, скрытая парапетом
ZR = ZP - 0.9
face('roof', [P2(0, 0.15).to_3d() + UP * ZR, P2(LA, 0.15).to_3d() + UP * ZR,
              P2(LA, LB - 0.15).to_3d() + UP * ZR, P2(0, LB - 0.15).to_3d() + UP * ZR], UP)
hip_roof(Frame(P2(0, LB / 2), VA, VN), 0.6, LA - 0.6, LB / 2 - 0.6, -LB / 2 + 0.6, ZR, 0.75, ov=0)
for F_ in (FE, FW, FN, FS):                         # внутренняя сторона парапета
    L_ = LA if F_ in (FE, FW) else LB
    quad('wall', F_, 0, L_, ZR, ZP - 0.12, -0.3, -F_.N())
    face('trim', [F_.p(0, -0.3, ZP - 0.12), F_.p(L_, -0.3, ZP - 0.12), F_.p(L_, -0.15, ZP - 0.12), F_.p(0, -0.15, ZP - 0.12)], UP)
# антенны
for a, b in ((6.0, 5.0), (13.0, 7.5)):
    p = P2(a, b).to_3d()
    beam('metal', p + UP * (ZR + 0.7), p + UP * (ZR + 2.6), 0.05)
    beam('metal', p + UP * (ZR + 2.3) - VA.to_3d() * 0.5, p + UP * (ZR + 2.3) + VA.to_3d() * 0.5, 0.03)

finish('bm30', __file__, tri_budget=10000)
