# Российская галерея искусств на мысе Хрустальном (Капитанская, 13) —
# модель по фото стройки и готового здания (2025) и по спутнику.
#
#   blender -b --python models/galereya/build.py -- [glb]
#
# План — контур OSM way 1547729146 (совпадает со спутником Esri): два крыла
# буквой V, открытой на северо-запад к Капитанской, и восточный блок-связка
# на углу. СЕВЕРНОЕ крыло — гранёный белый «корабль» на столбах: низ
# наклонён наружу, верх внутрь (ромб в разрезе), нос на северо-запад со
# стеклянной косой щелью, на дворовом фасаде — горизонтальные ламели.
# ЮЖНОЕ крыло — длинный белый короб со стенами, наклонёнными наружу, над
# утопленным стеклянным первым этажом. Во дворе к южному крылу прислонена
# стеклянная треугольная «пирамида» атриума, над ней на кровле — овальный
# световой фонарь. Восточный блок — изогнутый стеклянный фасад за
# вертикальными ламелями. К востоку земля падает на 12–16 м, там видно
# подиум с лентами окон нижних этажей.
#
# Ноль высоты — двор у точки (−880, 300). Подробности и догадки — NOTES.md.
import sys, os, math, json
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *
from mathutils import Vector

COL['wall']  = ((0.90, 0.90, 0.88), 0.6)     # белые фасадные панели
COL['wall2'] = ((0.80, 0.80, 0.79), 0.85)    # подиум, фибробетон
COL['roof']  = ((0.78, 0.78, 0.77), 0.8)     # плоские кровли
COL['glass'] = ((0.15, 0.22, 0.30), 0.08)    # голубоватое стекло
COL['trim']  = ((0.95, 0.95, 0.94), 0.6)     # ламели, рамы пирамиды
COL['metal'] = ((0.55, 0.57, 0.60), 0.45)

X0, Z0 = -880.0, 300.0
origin(X0, Z0)

# ------------------------------------------------------------------ контур OSM
OSM = [(-945.8, 330.0), (-924.6, 312.4), (-862.3, 335.9), (-843.2, 320.0), (-878.3, 276.3),
       (-860.0, 259.2), (-848.5, 259.3), (-807.7, 301.8), (-798.3, 312.1), (-796.0, 318.2),
       (-796.2, 322.6), (-799.6, 327.4), (-807.7, 331.8), (-820.4, 341.8), (-828.0, 348.8),
       (-837.9, 370.4)]
P = OSM
Q1 = (-817.3, 291.7)              # стык северного крыла и блока-связки на СВ фасаде

def V3(p, z): return Vector((p.x, p.y, z))

def area(pts):
    return sum(pts[i].x * pts[(i + 1) % len(pts)].y - pts[(i + 1) % len(pts)].x * pts[i].y
               for i in range(len(pts))) / 2

def inward(pts, i):
    a, b = pts[i], pts[(i + 1) % len(pts)]
    e = (b - a).normalized()
    n = Vector((-e.y, e.x))
    return n if area(pts) > 0 else -n

def offset(pts, ds):
    """Каждое ребро i сдвинуто внутрь на ds[i]; вершины — пересечения соседних."""
    n = len(pts)
    L = []
    for i in range(n):
        a, b = pts[i], pts[(i + 1) % n]
        L.append((a + inward(pts, i) * ds[i], (b - a).normalized()))
    out = []
    for j in range(n):
        (p1, d1), (p2, d2) = L[j - 1], L[j]
        den = d1.x * d2.y - d1.y * d2.x
        if abs(den) < 1e-4:
            out.append(pts[j] + inward(pts, j) * ds[j]); continue
        t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / den
        out.append(p1 + d1 * t)
    return out

def loft(m, base, rings, top=None, bot=None, skip=()):
    """Кольца (ds, z) по одному контуру: грани между кольцами, крышки."""
    R = [(offset(base, ds), z) for ds, z in rings]
    n = len(base)
    for k in range(len(R) - 1):
        (A, za), (B, zb) = R[k], R[k + 1]
        for i in range(n):
            if i in skip: continue
            j = (i + 1) % n
            q = [V3(A[i], za), V3(A[j], za), V3(B[j], zb), V3(B[i], zb)]
            o = -inward(base, i)
            face(m, q, Vector((o.x, o.y, 0)))
    if top: face(top, [V3(p, R[-1][1]) for p in R[-1][0]], UP)
    if bot: face(bot, [V3(p, R[0][1]) for p in R[0][0]], -UP)
    return R

def ring_at(R, z):
    for k in range(len(R) - 1):
        (A, za), (B, zb) = R[k], R[k + 1]
        if za <= z <= zb:
            t = (z - za) / (zb - za)
            return [a.lerp(b, t) for a, b in zip(A, B)]
    raise ValueError(z)

def facet_quad(m, R, base, i, u0, u1, z0, z1, push=0.06, slant=0.0):
    """Четырёхугольник на грани i между высотами z0..z1 (доли u0..u1 ребра)."""
    o = -inward(base, i); o3 = Vector((o.x, o.y, 0))
    pts = []
    for (u, z) in ((u0, z0), (u1, z0), (u1 + slant, z1), (u0 + slant, z1)):
        r = ring_at(R, z); a, b = r[i], r[(i + 1) % len(r)]
        p = a.lerp(b, u) + o * push
        pts.append(V3(p, z))
    face(m, pts, o3)

def louvres(R, base, i, u0, u1, z0, z1, step=0.8, depth=0.9):
    """Горизонтальные ламели перед гранью i: тёмная подложка и белые полки."""
    facet_quad('glass', R, base, i, u0, u1, z0, z1, push=0.05)
    o = -inward(base, i); o3 = Vector((o.x, o.y, 0))
    z = z0 + step / 2
    while z < z1:
        r = ring_at(R, z); a, b = r[i], r[(i + 1) % len(r)]
        p0, p1 = a.lerp(b, u0) + o * 0.1, a.lerp(b, u1) + o * 0.1
        q0, q1 = p0 + o * depth, p1 + o * depth
        face('trim', [V3(p0, z), V3(p1, z), V3(q1, z - 0.18), V3(q0, z - 0.18)], o3 + UP)
        face('trim', [V3(p0, z - 0.12), V3(p1, z - 0.12), V3(q1, z - 0.30), V3(q0, z - 0.30)], o3 - UP)
        face('trim', [V3(q0, z - 0.18), V3(q1, z - 0.18), V3(q1, z - 0.30), V3(q0, z - 0.30)], o3)
        z += step

B = lambda pts: [W(*p) for p in pts]

# ------------------------------------------------------------------ подиум
# Весь контур от −20 до +0.3: со двора он в земле, к востоку и югу (склон
# на 6–16 м ниже) — открытая стена с тремя лентами окон.
POD = B(P)
loft('wall2', POD, [([0] * len(POD), -20.0), ([0] * len(POD), 0.3)], top='wall2')
for i in range(len(POD)):
    a, b = POD[i], POD[(i + 1) % len(POD)]
    if (b - a).length < 4: continue
    o = -inward(POD, i)
    e = (b - a).normalized()
    for z0, z1 in ((-14.5, -12.0), (-9.5, -7.0), (-4.5, -2.0)):
        A, Bb = a + e * 1.0 + o * 0.06, b - e * 1.0 + o * 0.06
        face('glass', [V3(A, z0), V3(Bb, z0), V3(Bb, z1), V3(A, z1)], Vector((o.x, o.y, 0)))

# ------------------------------------------------------------------ северное крыло
# Рёбра: 0 — дворовый фасад (ЮЗ), 1 — нос на СЗ, 2 — скос у носа, 3 — СВ
# фасад к улице, 4 — стык с блоком-связкой (внутри).
NW = B([P[3], P[4], P[5], P[6], Q1])
RN = loft('wall', NW, [([2.0, 9.0, 7.0, 8.0, 0.0], 7.0),
                       ([0.0, 0.0, 0.0, 0.0, 0.0], 16.5),
                       ([1.0, 3.5, 3.0, 4.5, 0.0], 26.0)], top='roof', bot='wall', skip=(4,))
# стеклянный первый этаж под «кораблём» и столбы
loft("glass", NW, [([10.0, 15.0, 12.0, 12.0, 0.0], 0.3), ([10.0, 15.0, 12.0, 12.0, 0.0], 7.0)], skip=(4,))
for p in offset(NW, [9.5, 13.0, 11.0, 11.0, 2.5]):
    F = Frame(p, Vector((1, 0)), Vector((0, 1)))
    box('wall', F, -0.8, 0.8, -0.8, 0.8, 0.3, 7.2, bottom=False)
# ламели на дворовом фасаде, от носа почти до стыка
louvres(RN, NW, 0, 0.12, 0.90, 9.0, 24.0)
# тёмная полоса ламелей на СВ фасаде у носа (видна с Капитанской)
louvres(RN, NW, 3, 0.02, 0.32, 17.5, 25.0)
# косая стеклянная щель в носу
facet_quad('glass', RN, NW, 1, 0.60, 0.70, 16.8, 25.5, push=0.08, slant=0.12)

# ------------------------------------------------------------------ южное крыло
# Рёбра: 0 — западный торец, 1 — дворовый фасад, 2 — его продолжение внутри
# связки, 3 — восточный торец, 4 — южный фасад.
SW = B([P[0], P[1], P[2], P[14], P[15]])
RS = loft('wall', SW, [([3.0] * 5, 6.0), ([0.0] * 5, 24.0)], top='roof', bot='wall', skip=(2,))
loft('glass', SW, [([5.0] * 5, 0.3), ([5.0] * 5, 6.0)], skip=(2,))
# парапет-кромка по кровле
loft('trim', SW, [([0.0] * 5, 24.0), ([0.0] * 5, 24.9)], skip=(2,))
for k, p in enumerate(offset(SW, [7.0] * 5)):
    F = Frame(p, Vector((1, 0)), Vector((0, 1)))
    box('wall', F, -0.7, 0.7, -0.7, 0.7, 0.3, 6.2, bottom=False)

# ------------------------------------------------------------------ пирамида атриума
# Стеклянный полуконус с треугольной сеткой у дворового фасада южного крыла
# (на спутнике — тёмный полукруг 36 × 17 м у x ≈ −891).
fa, fb = W(*P[1]), W(*P[2])
u = (fb - fa).normalized()
nc = -inward(SW, 1)                               # во двор
C0 = fa + u * 35.5
H_AP, RU, RN_ = 22.0, 17.0, 15.0
apex = V3(C0 - nc * 1.0, H_AP)
SEG = 6
base = [C0 + u * math.cos(math.pi * k / SEG) * RU + nc * math.sin(math.pi * k / SEG) * RN_
        for k in range(SEG + 1)]
AX = C0 - nc * 1.0
# гранёный купол: ярусы (доля высоты, доля радиуса) — низ почти отвесный,
# верх скруглён, как на фото 2025 года
TIERS = [(0.0, 1.0), (0.42, 0.86), (0.75, 0.5)]
rings = [[V3(AX.lerp(p, r), H_AP * h + 0.3 * (1 - h)) for p in base] for h, r in TIERS]
rings.append([apex] * (SEG + 1))
for t in range(len(rings) - 1):
    A, Bq = rings[t], rings[t + 1]
    for k in range(SEG):
        for tri in ((A[k], A[k + 1], Bq[k + 1]), (A[k], Bq[k + 1], Bq[k])):
            if (tri[1] - tri[2]).length < 1e-3 or (tri[0] - tri[2]).length < 1e-3: continue
            c = sum(tri, Vector()) / 3
            face('glass', list(tri), c - V3(C0, 4.0))
        beam('trim', A[k], A[k + 1], 0.28)
        if t < len(rings) - 2: beam('trim', A[k], Bq[k + 1], 0.2)
    for k in range(SEG + 1):
        beam('trim', A[k], Bq[k], 0.25)
face('glass', [rings[0][0], rings[0][SEG], apex], V3(-nc, 0))
# овальный фонарь над атриумом на кровле южного крыла
CR = C0 - nc * 9.0
ov = [CR + u * math.cos(2 * math.pi * k / 12) * 8.0 + nc * math.sin(2 * math.pi * k / 12) * 6.0
      for k in range(12)]
top_c = V3(CR, 26.0)
for k in range(12):
    a, b = ov[k], ov[(k + 1) % 12]
    face('glass', [V3(a, 24.05), V3(b, 24.05), top_c], V3((a + b) / 2 - CR, 1.0))

# ------------------------------------------------------------------ восточный блок-связка
# Рёбра: 0 — стеклянный угол двора, 1 — стык с северным крылом, 2 — СВ фасад,
# 3–9 — изогнутый фасад к оврагу, 10 — стык с южным крылом.
EB = B([P[2], P[3], Q1] + P[7:15])
HE = 21.0
loft('wall', EB, [([0.0] * len(EB), 0.3), ([0.0] * len(EB), HE)], top='roof', skip=tuple(range(len(EB))))
for i in range(len(EB)):
    if i in (1, len(EB) - 1): continue
    a, b = EB[i], EB[(i + 1) % len(EB)]
    o = -inward(EB, i); o3 = Vector((o.x, o.y, 0))
    zg = 12.0 if i == 0 else 18.5
    face('glass', [V3(a, 0.3), V3(b, 0.3), V3(b, zg), V3(a, zg)], o3)
    face('wall', [V3(a, zg), V3(b, zg), V3(b, HE + 0.8), V3(a, HE + 0.8)], o3)
    if i == 0: continue
    # вертикальные ламели перед стеклом, до низа подиума
    e = (b - a); L = e.length; e.normalize()
    F = Frame(a, e, o)
    k = 1.0
    while k < L - 0.5:
        box('trim', F, k - 0.15, k + 0.15, 0.1, 1.5, -14.0, HE - 0.6, bottom=False)
        k += 2.0
# стеклянные полосы кровли вдоль стыков с крыльями (на спутнике — стальная сетка)
for i, w in ((1, 7.0), (len(EB) - 1, 6.0)):
    a, b = EB[i], EB[(i + 1) % len(EB)]
    n = inward(EB, i)
    face('glass', [V3(a, HE + 0.3), V3(b, HE + 0.3), V3(b + n * w, HE + 0.3), V3(a + n * w, HE + 0.3)], UP)

# ------------------------------------------------------------------ контур для игры
# Контур OSM на 1.2 м внутрь плюс основание пирамиды: по нему стена
# столкновения, запрет посадки деревьев и каменный цоколь plinth.js.
FPp = offset(POD, [1.2] * len(POD))
ins = base[::-1]
# пирамида стоит на ребре 1 (P1 → P2): вставить её основание между вершинами 1 и 2
FPp = FPp[:2] + ins + FPp[2:]
FP = []
for p in FPp:
    FP += [round(p.x + X0, 1), round(-p.y + Z0, 1)]
FP += FP[:2]
json.dump(FP, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'footprint.json'), 'w'))

finish('galereya', __file__, tri_budget=20000)
