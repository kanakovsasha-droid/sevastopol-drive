# Большая Морская, 2 («Черноморочка», «Гала») — трёхэтажный кремовый дом на
# пл. Лазарева, послевоенный ампир круга Павлова. Модель с нуля.
#
#   blender -b --python models/bmorskaya2/build.py -- [glb]
#   (или python3 с модулем bpy: python3 models/bmorskaya2/build.py -- glb)
#
# План — четырёхугольник контура OSM w95119639, 50.5 × 13 м; длинный фасад
# смотрит на СВ, на площадь. Оба торца глухие: к СЗ примыкает Ген. Петрова, 1,
# к ЮВ — Б. Морская, 4. Фото открыть не удалось — модель по описанию
# refs/center-models.json (поле source); что наугад — NOTES.md. Ноль высоты —
# тротуар у середины фасада; улица поднимается к ЮВ: −1.5 м у СЗ угла,
# +2.1 м у ЮВ.
import sys, os, math
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

A, B, C, D = (-446.4, 604.7), (-406.8, 636.0), (-415.0, 646.4), (-454.4, 615.5)
X0, Z0 = -426.6, 620.35                      # середина фасада на площадь
origin(X0, Z0)
INSIDE = (-430.6, 625.6)

COL['wall'] = ((0.86, 0.82, 0.71), 0.9)      # 2–3 этажи: кремово-песочный известняк #dcd0b4
COL['wall2'] = ((0.94, 0.93, 0.89), 0.9)     # 1 этаж: светлый известняк блоками #efece4
COL['wall3'] = ((0.80, 0.76, 0.66), 0.9)     # двор: простая штукатурка (наугад)
COL['trim'] = ((0.95, 0.94, 0.90), 0.85)     # балясины, карнизы, наличники
COL['stone'] = ((0.54, 0.54, 0.52), 0.9)     # цоколь серой плиткой #8a8a85
COL['roof'] = ((0.49, 0.48, 0.45), 0.8)      # #7d7a74
COL['wood'] = ((0.54, 0.35, 0.17), 0.6)      # рамы витрин #8a5a2b
COL['glass'] = ((0.08, 0.10, 0.12), 0.15)

GROUND = -3.0
G_A, G_B, G_D, G_C = -1.52, 2.13, -1.52, 0.84      # земля у углов (рельеф игры)
B0 = 6.0           # низ карниза-балкона над первым этажом
B1 = B0 + 0.35     # пол балкона
F3 = 9.6           # пол третьего этажа
TOP = 12.6         # низ венчающего карниза
CRN = TOP + 0.6    # верх карниза
PAR = CRN + 0.4    # верх парапета

Fm, Lm = frame_from(A, B, INSIDE)    # фасад на площадь
Fr, Lr = frame_from(C, D, INSIDE)    # двор
Fa, La = frame_from(D, A, INSIDE)    # СЗ торец (брандмауэр к Ген. Петрова, 1)
Fb, Lb = frame_from(B, C, INSIDE)    # ЮВ торец (брандмауэр к Б. Морской, 4)
gm = lambda u: G_A + (G_B - G_A) * u / Lm
gr = lambda u: G_C + (G_D - G_C) * u / Lr

def quad(m, F, u0, u1, z0, z1, d):
    face(m, [F.p(u0, d, z0), F.p(u1, d, z0), F.p(u1, d, z1), F.p(u0, d, z1)], F.N())

def arc(cu, zs, r, n=8):
    return [(cu + r * math.cos(math.pi * (1 - k / n)), zs + r * math.sin(math.pi * (1 - k / n))) for k in range(n + 1)]

def arch_head(F, ua, ub, zs, d, m, reveal=0.3, rm='trim', n=8):
    """Заполнение стены над полукруглой перемычкой: проём в стене прямоугольный
    до zs + r, углы над дугой закрываются полосами, по дуге — откос."""
    cu, r = (ua + ub) / 2, (ub - ua) / 2
    top = zs + r
    P = arc(cu, zs, r, n)
    for i in range(n):
        (u0, z0), (u1, z1) = P[i], P[i + 1]
        face(m, [F.p(u0, d, z0), F.p(u1, d, z1), F.p(u1, d, top), F.p(u0, d, top)], F.N())
        face(rm, [F.p(u0, d, z0), F.p(u1, d, z1), F.p(u1, d - reveal, z1), F.p(u0, d - reveal, z0)],
             F.p(cu, d, zs) - F.p((u0 + u1) / 2, d, (z0 + z1) / 2))
    return P

def archivolt(F, cu, zs, r, d, w=0.24, pr=0.1, n=8):
    """Рельефный архивольт: полукольцо на фасаде и замковый камень."""
    a, b = arc(cu, zs, r, n), arc(cu, zs, r + w, n)
    for i in range(n):      # лицо и наружная кромка; внутреннюю закрывает откос
        face('trim', [F.p(a[i][0], d + pr, a[i][1]), F.p(a[i + 1][0], d + pr, a[i + 1][1]),
                      F.p(b[i + 1][0], d + pr, b[i + 1][1]), F.p(b[i][0], d + pr, b[i][1])], F.N())
        face('trim', [F.p(b[i][0], d, b[i][1]), F.p(b[i + 1][0], d, b[i + 1][1]),
                      F.p(b[i + 1][0], d + pr, b[i + 1][1]), F.p(b[i][0], d + pr, b[i][1])],
             F.p((b[i][0] + b[i + 1][0]) / 2, d, (b[i][1] + b[i + 1][1]) / 2) - F.p(cu, d, zs))
    box('trim', F, cu - 0.22, cu + 0.22, d, d + pr + 0.05, zs + r - 0.05, zs + r + w + 0.12)

def sash(F, ua, ub, za, zb, d, zs=None, cols=2, t=0.07):
    """Стекло и деревянный переплёт в глубине проёма; zs — пята арки. Переплёт —
    плоскими полосами перед стеклом: сбоку его не видно."""
    g = d - 0.28
    top = zb if zs is None else zs
    face('glass', [F.p(ua, g, za), F.p(ub, g, za), F.p(ub, g, top), F.p(ua, g, top)], F.N())
    f1 = g + 0.06
    quad('wood', F, ua, ua + t, za, top, f1); quad('wood', F, ub - t, ub, za, top, f1)
    quad('wood', F, ua, ub, za, za + t, f1)
    for c in range(1, cols):
        u = ua + (ub - ua) * c / cols
        quad('wood', F, u - t / 2, u + t / 2, za, zb if zs is None else zs + (ub - ua) / 2, f1)
    if zs is None:
        quad('wood', F, ua, ub, zb - t, zb, f1)
        return
    quad('wood', F, ua, ub, zs - t, zs, f1)          # импост по пяте
    P = arc((ua + ub) / 2, zs, (ub - ua) / 2)
    face('glass', [F.p(u, g, z) for u, z in P], F.N())

def baluster(F, u, d, z0, h=0.62):
    """Балясина: с улицы фигуру не разглядеть, хватает бруска с тумбой-тулово
    (вершины тулова сдвинуты от шейки, без лишних граней)."""
    bm = bm_of('trim')
    r0, r1 = 0.05, 0.085
    zs = (z0, z0 + h * 0.35, z0 + h)
    rs = (r0, r1, r0)
    U, N = F.U(), F.N()
    c = F.p(u, d, 0)
    rings = [[bm.verts.new(Vector((c.x, c.y, z)) + U * sx * r + N * sy * r)
              for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))] for z, r in zip(zs, rs)]
    for a, b in zip(rings, rings[1:]):
        for k in range(4):
            j = (k + 1) % 4
            bm.faces.new([a[k], a[j], b[j], b[k]])

def balustrade(F, u0, u1, d, z0, step=0.34, h=0.9, posts=()):
    """Ограждение: плинтус, балясины, тумбы и поручень. Высота ~0.9 м."""
    box('trim', F, u0, u1, d - 0.16, d + 0.16, z0, z0 + 0.12)
    n = max(1, int((u1 - u0) / step))
    for k in range(n):
        u = u0 + (u1 - u0) * (k + 0.5) / n
        if any(abs(u - p) < 0.3 for p in posts):
            continue
        baluster(F, u, d, z0 + 0.12, h - 0.28)
    for p in posts:
        box('trim', F, p - 0.2, p + 0.2, d - 0.2, d + 0.2, z0, z0 + h - 0.1, bottom=False)
    box('trim', F, u0 - 0.04, u1 + 0.04, d - 0.2, d + 0.2, z0 + h - 0.16, z0 + h)

def sandrik(F, ua, ub, z, d):
    """Треугольный сандрик на двух кронштейнах над прямоугольным окном."""
    cu, hw = (ua + ub) / 2, (ub - ua) / 2 + 0.32
    for u in (ua - 0.16, ub + 0.16):
        prism_uz('trim', F, [(u - 0.09, z - 0.42), (u + 0.09, z - 0.42), (u + 0.09, z + 0.1), (u - 0.09, z + 0.1)], d, d + 0.2)
    box('trim', F, cu - hw, cu + hw, d, d + 0.26, z + 0.1, z + 0.2)
    prism_uz('wall', F, [(cu - hw + 0.12, z + 0.2), (cu + hw - 0.12, z + 0.2), (cu, z + 0.68)], d, d + 0.06)
    for s in (-1, 1):
        prism_uz('trim', F, [(cu + s * hw, z + 0.2), (cu + s * hw, z + 0.32), (cu, z + 0.82), (cu, z + 0.68)], d, d + 0.28)

def plain_surround(F, ua, ub, za, zb, d, w=0.14):
    box('trim', F, ua - w, ua, d, d + 0.05, za, zb + w)
    box('trim', F, ub, ub + w, d, d + 0.05, za, zb + w)
    box('trim', F, ua, ub, d, d + 0.05, zb, zb + w)
    box('trim', F, ua - w - 0.05, ub + w + 0.05, d, d + 0.14, za - 0.1, za)   # подоконник

# ================================================================== ФАСАД НА ПЛОЩАДЬ
NB = 9                 # ось арок первого этажа ~5.6 м (описание: шаг ~6 м)
STEP = Lm / NB
ENT = NB // 2          # вход «Черноморочки» по центру
AW, AS = 3.4, 3.7      # ширина арки, пята
AR = AW / 2
F = Fm

holes1 = []
for i in range(NB):
    cu = STEP * (i + 0.5)
    ua, ub = cu - AW / 2, cu + AW / 2
    za = gm(cu) + 0.15 if i == ENT else max(gm(ua), gm(ub)) + 0.9
    holes1.append((ua, ub, za, AS + AR))
wall(F, 0, Lm, GROUND, B0, 0, holes1, m='wall2', reveal=0.3)
for i, (ua, ub, za, _) in enumerate(holes1):
    cu = (ua + ub) / 2
    arch_head(F, ua, ub, AS, 0, 'wall2')
    archivolt(F, cu, AS, AR, 0)
    if i == ENT:
        # блок из четырёх створок (дерево + стекло) под арочным окном
        sash(F, ua, ub, za, AS, 0, zs=AS, cols=4)
        for k in range(1, 4):
            u = ua + AW * k / 4
            box('wood', F, u - 0.05, u + 0.05, -0.28, -0.2, za, AS)
        box('wood', F, ua, ub, -0.28, -0.2, za + 1.0, za + 1.08)
        # гранитная площадка в две ступени
        g = gm(cu)
        box('stone', F, ua - 0.6, ub + 0.6, 0, 1.1, GROUND, g + 0.15)
        box('stone', F, ua - 0.3, ub + 0.3, 1.1, 1.5, GROUND, g + 0.02)
    else:
        sash(F, ua, ub, za, AS, 0, zs=AS, cols=3)
# простенки: крупные блоки известняка с заметными швами
piers = [0] + [h[1] for h in holes1]
starts = [h[0] for h in holes1] + [Lm]
for u0, u1 in zip(piers, starts):
    zb = max(gm(u0), gm(u1)) + 0.9
    z = zb
    while z < B0 - 0.3:
        box('wall2', F, u0 + 0.03, u1 - 0.03, 0, 0.04, z + 0.03, min(B0, z + 0.6) - 0.03, bottom=False)
        z += 0.6
# цоколь серой плиткой по уклону улицы
prism_uz('stone', F, [(0, GROUND), (Lm, GROUND), (Lm, G_B + 0.9), (0, G_A + 0.9)], -0.02, 0.08)
# сплошной карниз-балкон с балюстрадой над первым этажом, на консолях
box('wall2', F, -0.1, Lm + 0.1, -0.3, 1.0, B0, B1)
box('trim', F, -0.1, Lm + 0.1, 0.0, 1.06, B0 - 0.18, B0)
for i in range(NB + 1):
    cu = STEP * i
    for s in ((-0.7, 0.7) if 0 < i < NB else ((0.7,) if i == 0 else (-0.7,))):
        u = cu + s
        box('trim', F, u - 0.12, u + 0.12, 0, 0.75, B0 - 0.55, B0 - 0.18)
balustrade(F, 0.15, Lm - 0.15, 0.82, B1, posts=[STEP * i for i in range(1, NB)] + [0.35, Lm - 0.35])

# 2–3 этажи: окна по осям арок, прямоугольные с сандриком и арочные чередуются
holes2, wins = [], []
for i in range(NB):
    cu = STEP * (i + 0.5)
    arched = i % 2 == 1
    # второй этаж — на балкон: высокие окна-двери
    w2 = 1.6
    za, zb = B1 + 0.05, B1 + 2.65
    holes2.append((cu - w2 / 2, cu + w2 / 2, za, zb))
    wins.append((2, cu, w2, za, zb, arched))
    w3 = 1.5
    za, zb = F3 + 0.85, F3 + 2.55
    holes2.append((cu - w3 / 2, cu + w3 / 2, za, zb))
    wins.append((3, cu, w3, za, zb, arched))
wall(F, 0, Lm, B1, TOP, 0, holes2, reveal=0.28)
for fl, cu, w, za, zb, arched in wins:
    ua, ub = cu - w / 2, cu + w / 2
    if arched:
        zs = zb - w / 2
        arch_head(F, ua, ub, zs, 0, 'wall', reveal=0.28)
        archivolt(F, cu, zs, w / 2, 0, w=0.16, pr=0.06)
        sash(F, ua, ub, za, zb, 0, zs=zs)
        box('trim', F, ua - 0.2, ub + 0.2, 0, 0.12, za - 0.1, za)
        if fl == 3:                     # балкончик с балясинами
            box('trim', F, ua - 0.35, ub + 0.35, 0, 0.55, za - 0.25, za - 0.05)
            for k in range(2):
                box('trim', F, cu + (k - 0.5) * (w + 0.2) - 0.08, cu + (k - 0.5) * (w + 0.2) + 0.08, 0, 0.45, za - 0.6, za - 0.25)
            balustrade(F, ua - 0.25, ub + 0.25, 0.42, za - 0.05, step=0.3, h=0.8)
    else:
        sash(F, ua, ub, za, zb, 0, cols=2)
        plain_surround(F, ua, ub, za, zb, 0)
        if fl == 2:
            sandrik(F, ua - 0.14, ub + 0.14, zb + 0.14, 0)
        else:
            box('trim', F, ua - 0.3, ub + 0.3, 0, 0.18, zb + 0.14, zb + 0.26)    # полочка
# пояс между вторым и третьим этажом и плоские пилястры по простенкам
band(F, 0, Lm, 0, F3 + 0.05, F3 + 0.3, 0.1)
for i in range(1, NB):
    u = STEP * i
    box('trim', F, u - 0.35, u + 0.35, 0, 0.1, B1, TOP - 0.3, bottom=False)
    box('trim', F, u - 0.45, u + 0.45, 0, 0.16, TOP - 0.3, TOP, bottom=False)
# мощный венчающий карниз на кронштейнах
box('trim', F, -0.05, Lm + 0.05, 0, 0.1, TOP - 0.45, TOP - 0.25)                      # архитрав
box('wall', F, -0.1, Lm + 0.1, -0.2, 0.25, TOP, TOP + 0.25)
box('wall', F, -0.1, Lm + 0.1, -0.2, 0.85, TOP + 0.25, CRN)
n = int(Lm / 1.1)
for k in range(n):
    u = Lm * (k + 0.5) / n
    box('trim', F, u - 0.1, u + 0.1, 0.2, 0.75, TOP + 0.02, TOP + 0.25, bottom=False)
box('trim', F, -0.1, Lm + 0.1, 0.0, 0.92, CRN - 0.08, CRN + 0.04)

# ================================================================== ДВОР И ТОРЦЫ
F = Fr
NR = 12
holesR, winsR = [], []
for fl, (za, h) in enumerate(((2.0, 1.7), (B1 + 0.9, 1.7), (F3 + 0.85, 1.6))):
    for i in range(NR):
        cu = Lr / NR * (i + 0.5)
        zz = max(za, gr(cu) + 1.0)
        if zz + 0.8 > za + h:
            continue
        holesR.append((cu - 0.7, cu + 0.7, zz, za + h))
wall(F, 0, Lr, GROUND, TOP + 0.25, 0, holesR, m='wall3', reveal=0.2)
for ua, ub, za, zb in holesR:
    face('glass', [F.p(ua, -0.18, za), F.p(ub, -0.18, za), F.p(ub, -0.18, zb), F.p(ua, -0.18, zb)], F.N())
    box('trim', F, ua - 0.04, ub + 0.04, 0, 0.1, za - 0.06, za)
prism_uz('stone', F, [(0, GROUND), (Lr, GROUND), (Lr, G_D + 0.6), (0, G_C + 0.6)], -0.02, 0.06)
box('wall3', F, -0.05, Lr + 0.05, -0.2, 0.35, TOP + 0.25, CRN - 0.2)
box('trim', F, -0.05, Lr + 0.05, -0.2, 0.42, CRN - 0.2, CRN - 0.08)

for F, L in ((Fa, La), (Fb, Lb)):           # брандмауэры: глухие, видны только над соседями
    wall(F, 0, L, GROUND, TOP + 0.25, 0, [], m='wall3')
    box('wall3', F, -0.05, L + 0.05, -0.2, 0.2, TOP + 0.25, CRN)

# ================================================================== КРОВЛЯ
# плоская (с площади не видна): плита, низкий парапет за карнизом, будки
face('roof', [Vector((*W(*p), CRN - 0.05)) for p in (A, B, C, D)], UP)
F = Fm
box('wall', F, 0, Lm, 0.1, 0.45, CRN, PAR, bottom=False)
box('trim', F, -0.02, Lm + 0.02, 0.05, 0.5, PAR, PAR + 0.06, bottom=False)
for u in (Lm * 0.2, Lm * 0.5, Lm * 0.8):    # выходы на крышу и вентшахты (наугад)
    box('roof', F, u - 1.4, u + 1.4, -8.5, -5.5, CRN - 0.05, CRN + 1.9)
    box('trim', F, u - 1.5, u + 1.5, -8.6, -5.4, CRN + 1.9, CRN + 2.0)
for u in (Lm * 0.35, Lm * 0.65):
    chimney(F, u, -10.5, CRN - 0.05, CRN + 1.4)

finish('bmorskaya2', __file__, tri_budget=10000)
