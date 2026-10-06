# Большая Морская, 14 — четырёхэтажный дом с угловым балконом на консолях
# (OSM w90821948, refs/center-models.json, п. 28.21 очереди облака).
#
#   blender -b --python models/bm14/build.py -- [glb]
#   (или python3 с модулем bpy: python3 models/bm14/build.py -- glb)
#
# Фото не открыть — работаю по описанию из refs/center-models.json (снимок
# P9151244 с Викисклада): высокий первый этаж коммерческого пояса в белой
# облицовке с витринами, ступенями и перилами; выше охристо-жёлтая
# штукатурка; на северном конце выступ с большим балконом по всей ширине
# 3-го этажа на пяти лепных консолях, кованые перила, выше остеклённая
# лоджия, под балконом окно с наличником, внизу гладкая белая стена с нишей;
# к югу оси окон с шагом ≈3 м, на 3-м этаже три арочных окна с балкончиками
# на кованых консолях; кровля малоуклонная с ограждением, трубы.
# Что сделано наугад — NOTES.md.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

# Контур OSM — почти точный прямоугольник 42.1 × 13.3 м, длинной стороной
# вдоль Б. Морской (восточный фасад). Выпрямлен по двум точкам восточного
# ребра; глубина — по северному торцу.
PN = (-352.7, 894.4)        # северо-восточный угол
PS = (-342.4, 935.2)        # юго-восточный угол
INSIDE = (-354.0, 917.0)
X0, Z0 = -347.55, 914.8     # середина фасада на Б. Морскую, уровень тротуара
origin(X0, Z0)

COL['wall'] = ((0.85, 0.81, 0.66), 0.9)     # #d9cfa8, охристо-жёлтая штукатурка
COL['wall2'] = ((0.91, 0.90, 0.86), 0.8)    # белая облицовка первого этажа
COL['roof'] = ((0.48, 0.42, 0.38), 0.85)    # #7b6b60
COL['trim'] = ((0.94, 0.92, 0.86), 0.85)

FE, LEN = frame_from(PN, PS, INSIDE)        # восток: u с севера на юг, n наружу
DEP = 13.3
ue, ne = FE.u, FE.n
A = FE.o                                    # СВ угол в плане Blender
B = A + ue * LEN                            # ЮВ
D = A - ne * DEP                            # СЗ
FW = Frame(D, ue, -ne)                      # запад (двор): u с севера на юг
FN = Frame(A, -ne, -ue)                     # север: u с востока на запад
FS = Frame(B, -ne, ue)                      # юг: u с востока на запад

GROUND = -3.0
Z1 = 4.5                    # верх высокого первого этажа
ZF = [4.75, 8.05, 11.35]    # низы 2-4 этажей
TOP = 14.4                  # низ венчающего карниза
EAVE = TOP + 0.6
PROJ = 9.2                  # ширина северного выступа по фасаду
PD = 0.3                    # его вынос

# ------------------------------------------------------------------ мелочи
def lwin(F, cu, za, w, h, d):
    """Окно фасада полегче kit.window: наличник тремя планками и подоконник,
    в глубине стекло с крестом переплёта (рама — сами откосы)."""
    ua, ub, zb = cu - w / 2, cu + w / 2, za + h
    t = 0.15
    box('trim', F, ua - t, ua, d, d + 0.05, za, zb + t, bottom=False)
    box('trim', F, ub, ub + t, d, d + 0.05, za, zb + t, bottom=False)
    box('trim', F, ua, ub, d, d + 0.05, zb, zb + t, bottom=False)
    box('trim', F, ua - t - 0.04, ub + t + 0.04, d, d + 0.13, za - 0.1, za, bottom=False)
    g = d - 0.22
    face('glass', [F.p(ua, g, za), F.p(ub, g, za), F.p(ub, g, zb), F.p(ua, g, zb)], F.N())
    box('trim', F, cu - 0.035, cu + 0.035, g, g + 0.06, za, zb, bottom=False)
    zt = za + h * 0.7
    box('trim', F, ua, ub, g, g + 0.06, zt - 0.035, zt + 0.035, bottom=False)
    return (ua, ub, za, zb)

def plain_win(F, cu, za, w, h, d, cols=2):
    """Простое окно двора: стекло в откосе и импост — без наличника."""
    g = d - 0.2
    face('glass', [F.p(cu - w / 2, g, za), F.p(cu + w / 2, g, za), F.p(cu + w / 2, g, za + h), F.p(cu - w / 2, g, za + h)], F.N())
    if cols > 1:
        box('trim', F, cu - 0.04, cu + 0.04, g, g + 0.06, za, za + h, bottom=False)
    return (cu - w / 2, cu + w / 2, za, za + h)

def arch_win(F, cu, za, zs, r, d):
    """Арочный проём: прямоугольник до пяты и полукруг; углы над дугой
    заполнены стеной, по дуге — откос и архивольт."""
    seg = 8
    arc = [(cu + r * math.cos(math.pi * k / seg), zs + r * math.sin(math.pi * k / seg)) for k in range(seg + 1)]
    hs = seg // 2
    face('wall', [F.p(cu + r, d, zs + r)] + [F.p(u, d, z) for u, z in arc[:hs + 1]], F.N())
    face('wall', [F.p(cu - r, d, zs + r)] + [F.p(u, d, z) for u, z in arc[hs:]], F.N())
    g = d - 0.24
    face('glass', [F.p(cu - r, g + 0.02, za), F.p(cu + r, g + 0.02, za)] +
         [F.p(u, g + 0.02, z) for u, z in arc], F.N())
    for k in range(seg):
        (ua, za_), (ub, zb_) = arc[k], arc[k + 1]
        face('trim', [F.p(ua, d, za_), F.p(ub, d, zb_), F.p(ub, g, zb_), F.p(ua, g, za_)],
             F.p(cu, d, zs) - F.p((ua + ub) / 2, d, (za_ + zb_) / 2))
        ro = r + 0.18
        oa = (cu + ro * math.cos(math.pi * k / seg), zs + ro * math.sin(math.pi * k / seg))
        ob = (cu + ro * math.cos(math.pi * (k + 1) / seg), zs + ro * math.sin(math.pi * (k + 1) / seg))
        prism_uz('trim', F, [(ua, za_), (ub, zb_), ob, oa], d, d + 0.07)
    # переплёт: импост до пяты, фрамуга по пяте
    box('trim', F, cu - 0.035, cu + 0.035, g, g + 0.07, za, zs, bottom=False)
    box('trim', F, cu - r, cu + r, g, g + 0.07, zs - 0.035, zs + 0.035, bottom=False)
    return (cu - r, cu + r, za, zs)          # прямоугольная часть — дыра в стене

def railing(pts, z0, h=1.0, step=0.42):
    """Кованые перила по ломаной в плане Blender: поручень, низ и стойки."""
    for a, b in zip(pts, pts[1:]):
        a3, b3 = Vector((a.x, a.y, z0)), Vector((b.x, b.y, z0))
        beam('metal', a3 + UP * h, b3 + UP * h, 0.06, 0.05)
        beam('metal', a3 + UP * 0.12, b3 + UP * 0.12, 0.04)
        n = max(1, round((b3 - a3).length / step))
        for k in range(n + 1):
            q = a3 + (b3 - a3) * (k / n)
            beam('metal', q + UP * 0.12, q + UP * h, 0.025)

def console(F, cu, d, ztop, out, h, w=0.32, m='trim'):
    """Консоль-кронштейн: клин от стены (высота h) к краю плиты (out)."""
    Fc = Frame(F.o + F.u * cu, F.n, -F.u)   # u — наружу, n — вдоль фасада
    poly = [(d, ztop), (d + out, ztop), (d + out, ztop - 0.22), (d, ztop - h)]
    prism_uz(m, Fc, poly, -w / 2, w / 2)

# ================================================================== восток (Б. Морская)
F = FE
# --- первый этаж: белая облицовка, витрины к югу от выступа
AX = [10.7 + 2.99 * i for i in range(11)]
DOORS = {AX[1], AX[7]}
holes1 = []
for cu in AX:
    if cu in DOORS:
        ua, ub, za, zb = cu - 0.9, cu + 0.9, 0.0, 3.1
        holes1.append((ua, ub, za, zb))
        g = -0.3
        face('glass', [F.p(ua, g, za), F.p(ub, g, za), F.p(ub, g, zb), F.p(ua, g, zb)], F.N())
        box('metal', F, cu - 0.04, cu + 0.04, g, g + 0.06, za, zb - 0.7, bottom=False)
        box('metal', F, ua, ub, g, g + 0.06, zb - 0.74, zb - 0.68, bottom=False)
        # ступени вниз к тротуару (у северного конца тротуар ниже на ~0.7 м) и перила
        for k in range(3):
            box('stone', F, ua - 0.4, ub + 0.4, 0, 0.9 + 0.35 * k, GROUND, -0.2 * k)
        for s in (ua - 0.3, ub + 0.3):
            railing([F.p(s, 0.1, 0).to_2d(), F.p(s, 1.6, 0).to_2d()], -0.3, 1.0, 1.5)
    else:
        ua, ub, za, zb = cu - 1.15, cu + 1.15, 0.55, 3.55
        holes1.append((ua, ub, za, zb))
        g = -0.28                                                       # витрина: стекло, импост, фрамуга
        face('glass', [F.p(ua, g, za), F.p(ub, g, za), F.p(ub, g, zb), F.p(ua, g, zb)], F.N())
        box('metal', F, cu - 0.04, cu + 0.04, g, g + 0.06, za, zb, bottom=False)
        box('metal', F, ua, ub, g, g + 0.06, zb - 0.72, zb - 0.66, bottom=False)
wall(F, PROJ, LEN, GROUND, Z1, 0.0, holes1, m='wall2', reveal=0.3)
box('stone', F, PROJ, LEN, 0, 0.1, GROUND, 0.25)                       # цоколь
band(F, PROJ - 0.1, LEN, 0.0, Z1 - 0.35, Z1, 0.12)                     # карниз витрин
box('wall2', F, PROJ, LEN, 0, 0.16, Z1, ZF[0])                         # пояс над первым этажом

# --- 2-4 этажи к югу от выступа
ARCH = AX[-3:]                       # три арочных окна 3-го этажа, южный край
holes = []
for cu in AX:
    holes.append(lwin(F, cu, ZF[0] + 0.85, 1.3, 1.95, 0.0))         # 2-й
    if cu in ARCH:
        holes.append(arch_win(F, cu, ZF[1] + 0.12, ZF[1] + 2.15, 0.68, 0.0))
    else:
        holes.append(lwin(F, cu, ZF[1] + 0.8, 1.3, 2.1, 0.0))       # 3-й
    holes.append(lwin(F, cu, ZF[2] + 0.8, 1.3, 1.85, 0.0))          # 4-й
wall(F, PROJ, LEN, ZF[0], TOP, 0.0, holes)
band(F, PROJ, LEN, 0.0, ZF[1] - 0.12, ZF[1] + 0.06, 0.08)             # междуэтажные тяги
band(F, PROJ, LEN, 0.0, ZF[2] - 0.12, ZF[2] + 0.06, 0.08)
# балкончики на кованых консолях у арочных окон
for cu in ARCH:
    z = ZF[1] + 0.12
    box('stone', F, cu - 0.95, cu + 0.95, 0, 0.62, z - 0.14, z)
    for s in (-0.7, 0.7):
        console(F, cu + s, 0.0, z - 0.14, 0.55, 0.55, w=0.06, m='metal')
    railing([F.p(cu - 0.92, 0.0, 0).to_2d(), F.p(cu - 0.92, 0.58, 0).to_2d(),
             F.p(cu + 0.92, 0.58, 0).to_2d(), F.p(cu + 0.92, 0.0, 0).to_2d()], z, 0.95, 0.45)

# --- северный выступ с большим балконом
P = PD
pc = [1.7, PROJ / 2, PROJ - 1.7]
# первый этаж: гладкая белая стена с нишей
niche = (PROJ / 2 - 0.8, PROJ / 2 + 0.8, 0.9, 3.4)
wall(F, 0, PROJ, GROUND, Z1, P, [niche], m='wall2', reveal=0.35, rm='wall2')
face('wall2', [F.p(niche[0], P - 0.35, niche[2]), F.p(niche[1], P - 0.35, niche[2]),
               F.p(niche[1], P - 0.35, niche[3]), F.p(niche[0], P - 0.35, niche[3])], F.N())
box('trim', F, niche[0] - 0.12, niche[1] + 0.12, P, P + 0.08, niche[3], niche[3] + 0.16)
box('trim', F, niche[0] - 0.12, niche[1] + 0.12, P, P + 0.1, niche[2] - 0.12, niche[2])
box('stone', F, 0, PROJ, P, P + 0.1, GROUND, 0.25)
band(F, -0.1, PROJ + 0.1, P, Z1 - 0.35, Z1, 0.12)
box('wall2', F, 0, PROJ, P, P + 0.16, Z1, ZF[0])
# 2-й: под балконом одно окно с наличником (ось выступа), боковые простенки глухие
WU, WZ, WWD, WH = PROJ / 2, ZF[0] + 0.6, 1.6, 1.8
hp = [lwin(F, WU, WZ, WWD, WH, P)]
box('trim', F, WU - 1.15, WU + 1.15, P, P + 0.18, WZ + WH + 0.15, WZ + WH + 0.3)   # сандрик-полка
for s in (-1, 1):                                                                 # лопатки наличника
    u = WU + s * (WWD / 2 + 0.32)
    box('trim', F, u - 0.13, u + 0.13, P, P + 0.1, WZ - 0.1, WZ + WH + 0.15, bottom=False)
# 3-й: двери на балкон
for cu in pc:
    ua, ub, za, zb = cu - 0.6, cu + 0.6, ZF[1] + 0.12, ZF[1] + 2.75
    hp.append((ua, ub, za, zb))
    glazing(F, ua, ub, za, zb, P, cols=2, rows=(0.78,))
    box('trim', F, ua - 0.14, ub + 0.14, P, P + 0.05, zb, zb + 0.14)
# 4-й: остеклённая лоджия по всей ширине выступа
LG = (0.55, PROJ - 0.55, ZF[2] + 0.1, TOP - 0.35)
hp.append(LG)
wall(F, 0, PROJ, ZF[0], TOP, P, hp)
LD = 1.1                                                                # глубина лоджии
for u in (LG[0], LG[1]):                                                # боковины
    face('wall', [F.p(u, P, LG[2]), F.p(u, P - LD, LG[2]), F.p(u, P - LD, LG[3]), F.p(u, P, LG[3])], -F.U() if u > 1 else F.U())
face('wall', [F.p(LG[0], P, LG[3]), F.p(LG[1], P, LG[3]), F.p(LG[1], P - LD, LG[3]), F.p(LG[0], P - LD, LG[3])], -UP)
face('wall', [F.p(LG[0], P - LD, LG[2]), F.p(LG[1], P - LD, LG[2]), F.p(LG[1], P - LD, LG[3]), F.p(LG[0], P - LD, LG[3])], F.N())
box('wall', F, LG[0], LG[1], P - LD, P - 0.15, LG[2], LG[2] + 0.95)    # парапет лоджии
glazing(F, LG[0] + 0.05, LG[1] - 0.05, LG[2] + 0.95, LG[3] - 0.05, P - 0.15 + 0.24, cols=8, rows=(0.7,), reveal=0.24)
# боковины выступа
box('wall', F, PROJ - 0.01, PROJ, 0, P, ZF[0], TOP)
box('wall2', F, PROJ - 0.01, PROJ, 0, P, GROUND, ZF[0])
band(F, 0, PROJ, P, ZF[2] - 0.12, ZF[2] + 0.06, 0.08)
# балконная плита на пяти лепных консолях и кованые перила
BZ = ZF[1] + 0.12
BO = 1.5
box('stone', F, -0.15, PROJ + 0.15, P, P + BO, BZ - 0.2, BZ)
band(F, -0.15, PROJ + 0.15, P + BO - 0.05, BZ - 0.28, BZ - 0.2, 0.05)
for k in range(5):
    cu = 0.5 + (PROJ - 1.0) * k / 4
    console(F, cu, P, BZ - 0.2, BO - 0.15, 0.62 if k == 2 else 1.1, w=0.34)   # средняя — над сандриком
railing([F.p(-0.1, P, 0).to_2d(), F.p(-0.1, P + BO - 0.08, 0).to_2d(),
         F.p(PROJ + 0.1, P + BO - 0.08, 0).to_2d(), F.p(PROJ + 0.1, P, 0).to_2d()], BZ, 1.0, 0.45)

# венчающий карниз по всему фасаду (выступ — с раскреповкой)
cornice(F, PROJ, LEN, 0.0, TOP, ext=0.45)
cornice(F, 0, PROJ, P, TOP, ext=0.45)

# ================================================================== север (торец на ул. Лумумбы)
F = FN
hn = []
for cu in (3.4, 6.65, 9.9):
    hn.append(lwin(F, cu + 0.0, ZF[0] + 0.85, 1.2, 1.95, 0.0))
    hn.append(lwin(F, cu, ZF[1] + 0.8, 1.2, 2.1, 0.0))
    hn.append(lwin(F, cu, ZF[2] + 0.8, 1.2, 1.85, 0.0))
wall(F, -P, DEP, ZF[0], TOP, 0.0, hn)
wall(F, -P, DEP, GROUND, ZF[0], 0.0, [], m='wall2')
box('stone', F, -P, DEP, 0, 0.1, GROUND, 0.25)
band(F, -P, DEP, 0.0, Z1 - 0.35, Z1, 0.12)
band(F, -P, DEP, 0.0, ZF[1] - 0.12, ZF[1] + 0.06, 0.08)
band(F, -P, DEP, 0.0, ZF[2] - 0.12, ZF[2] + 0.06, 0.08)
cornice(F, 0, DEP, 0.0, TOP, ext=0.45)

# ================================================================== юг — брандмауэр (лента фасадов)
F = FS
wall(F, 0, DEP, GROUND, TOP + 0.6, 0.0, [])

# ================================================================== запад (двор, не виден)
F = FW
hw = []
for cu in [2.0 + 2.9 * i for i in range(14)]:
    hw.append(plain_win(F, cu, 1.0, 1.2, 1.8, 0.0))
    for z in ZF:
        hw.append(plain_win(F, cu, z + 0.85, 1.2, 1.8, 0.0))
wall(F, 0, LEN, GROUND, TOP + 0.6, 0.0, hw)
band(F, 0, LEN, 0.0, TOP + 0.3, TOP + 0.6, 0.15)

# ================================================================== кровля
# плоская площадка по верху стен, на ней низкая вальма; по краю ограждение
prism_plan('roof', FE, [(0, 0), (LEN, 0), (LEN, -DEP), (0, -DEP)], EAVE - 0.01, EAVE)
hip_roof(FE, 0.6, LEN - 0.6, -0.6, -DEP + 0.6, EAVE, 1.6, ov=0.0)
rail = [FE.p(0.2, -0.2, 0).to_2d(), FE.p(LEN - 0.2, -0.2, 0).to_2d(),
        FE.p(LEN - 0.2, -DEP + 0.2, 0).to_2d(), FE.p(0.2, -DEP + 0.2, 0).to_2d(), FE.p(0.2, -0.2, 0).to_2d()]
for a, b in zip(rail, rail[1:]):
    a3, b3 = Vector((a.x, a.y, EAVE)), Vector((b.x, b.y, EAVE))
    beam('metal', a3 + UP * 0.9, b3 + UP * 0.9, 0.05)
    n = max(1, round((b3 - a3).length / 3.0))
    for k in range(n + 1):
        q = a3 + (b3 - a3) * (k / n)
        beam('metal', q, q + UP * 0.9, 0.05)
for u, d in ((6.0, -4.0), (17.0, -9.5), (27.0, -4.0), (37.5, -9.5)):
    chimney(FE, u, d, EAVE - 0.2, EAVE + 2.3, w=0.8)

finish('bm14', __file__, tri_budget=10000)
