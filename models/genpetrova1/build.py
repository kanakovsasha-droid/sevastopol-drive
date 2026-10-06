# Ул. Генерала Петрова, 1 — угловой дом у пл. Лазарева (контур OSM w300639971),
# послевоенный ампир ~1952: три этажа, кремово-песочные стены (1-й этаж
# светлее), на углу к площади — эркер во 2-м этаже, под ним открытая лоджия на
# парных колоннах с балюстрадой; окна прямоугольные, карниз с кронштейнами,
# вывески магазинов прямоугольные. Описание — refs/center-models.json; что
# наугад — NOTES.md. Ноль высоты — тротуар у срезанного угла.
#
#   blender -b --python models/genpetrova1/build.py -- [glb]
#   (или python3.13 с модулем bpy: python models/genpetrova1/build.py -- glb)
#
# План — контур OSM как есть, без точки P0 (-454.4, 615.5): она лежит на одной
# прямой с задней стеной P4–P1, отрезок P4–P0 — общая стена с Б. Морской, 2.
# Угол P3 у площади срезан на 4,5 м — туда смотрят лоджия и эркер.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

# ------------------------------------------------------------------ цвета
COL['wall'] = ((0.878, 0.831, 0.722), 0.9)     # #e0d4b8 — кремово-песочная штукатурка
COL['wall2'] = ((0.925, 0.895, 0.815), 0.9)    # первый этаж светлее
COL['trim'] = ((0.945, 0.925, 0.865), 0.85)    # карниз, наличники, пояс
COL['roof'] = ((0.478, 0.353, 0.282), 0.8)     # #7a5a48
COL['stone'] = ((0.58, 0.56, 0.52), 0.9)       # цоколь, ступени
COL['glass'] = ((0.08, 0.11, 0.14), 0.15)
COL['metal'] = ((0.20, 0.21, 0.22), 0.5)       # щиты вывесок, двери
COL['wood'] = ((0.30, 0.20, 0.13), 0.6)

# ------------------------------------------------------------------ план
P1, P2, P3, P4 = (-481.1, 651.8), (-493.7, 641.9), (-457.4, 597.8), (-446.4, 604.7)
P0 = (-454.4, 615.5)

def lerp(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)

def dist(a, b):
    return math.hypot(b[0] - a[0], b[1] - a[1])

CUT = 3.4                                        # срез угла от P3 по обеим улицам
A = lerp(P3, P2, CUT / dist(P3, P2))
B = lerp(P3, P4, CUT / dist(P3, P4))
INSIDE = (-468.0, 622.0)
PLAN = [P1, P2, A, B, P4]                        # обход: торец, улица, срез, площадь, двор

X0, Z0 = (A[0] + B[0]) / 2, (A[1] + B[1]) / 2
origin(X0, Z0)

GR = -3.0             # стены уходят в землю (уклон к площади)
Z1 = 4.2              # верх первого этажа (магазины)
Z2 = 7.6              # верх второго
Z3 = 11.0             # верх стены под карнизом
ZC = Z3 + 0.6         # верх карниза = свес кровли
RISE = 2.7            # подъём вальмы
OV = 0.55             # вынос свеса от стены

# ------------------------------------------------------------------ лёгкие примитивы
def lbox(m, F, u0, u1, d0, d1, z0, z1, bottom=False):
    """Брусок, приставленный к стене: лицо, верх и бока (без тыла)."""
    P_ = F.p
    face(m, [P_(u0, d1, z0), P_(u1, d1, z0), P_(u1, d1, z1), P_(u0, d1, z1)], F.N())
    face(m, [P_(u0, d0, z1), P_(u1, d0, z1), P_(u1, d1, z1), P_(u0, d1, z1)], UP)
    face(m, [P_(u0, d0, z0), P_(u0, d1, z0), P_(u0, d1, z1), P_(u0, d0, z1)], -F.U())
    face(m, [P_(u1, d0, z0), P_(u1, d1, z0), P_(u1, d1, z1), P_(u1, d0, z1)], F.U())
    if bottom:
        face(m, [P_(u0, d0, z0), P_(u1, d0, z0), P_(u1, d1, z0), P_(u0, d1, z0)], -UP)

def quad(m, F, u0, u1, z0, z1, d, hint=None):
    face(m, [F.p(u0, d, z0), F.p(u1, d, z0), F.p(u1, d, z1), F.p(u0, d, z1)],
         hint if hint is not None else F.N())

def glz(F, ua, ub, za, zb, cols=2, transom=True, reveal=0.24):
    """Стекло в глубине проёма с лёгким переплётом."""
    g = -reveal + 0.02
    quad('glass', F, ua, ub, za, zb, g)
    t, f1 = 0.06, g + 0.04          # переплёт — плоские полосы перед стеклом (вблизи не видно разницы)
    for a, b, c, e in ((ua, ua + t, za, zb), (ub - t, ub, za, zb), (ua, ub, zb - t, zb), (ua, ub, za, za + t)):
        quad('trim', F, a, b, c, e, f1)
    for c in range(1, cols):
        u = ua + (ub - ua) * c / cols
        quad('trim', F, u - t / 2, u + t / 2, za + t, zb - t, f1)
    if transom:
        z = za + (zb - za) * 0.7
        quad('trim', F, ua + t, ub - t, z - t / 2, z + t / 2, f1)

def win(F, cu, za, w, h, surround=True):
    """Прямоугольное окно: наличник (у лицевых фасадов), подоконник, переплёт."""
    ua, ub, zb = cu - w / 2, cu + w / 2, za + h
    if surround:
        fw = 0.15
        lbox('trim', F, ua - fw, ua, 0, 0.05, za, zb + fw)
        lbox('trim', F, ub, ub + fw, 0, 0.05, za, zb + fw)
        lbox('trim', F, ua, ub, 0, 0.05, zb, zb + fw)
        lbox('trim', F, ua - 0.3, ub + 0.3, 0, 0.16, zb + fw, zb + fw + 0.12)     # полочка-сандрик
    lbox('trim', F, ua - 0.08, ub + 0.08, 0, 0.12, za - 0.09, za, bottom=True)  # подоконник
    glz(F, ua, ub, za, zb)
    return (ua, ub, za, zb)

def shopwin(F, cu, w, door=False):
    """Витрина первого этажа (у двери — до земли), импосты."""
    za, zb = (0.05 if door else 0.55), 3.15
    ua, ub = cu - w / 2, cu + w / 2
    glz(F, ua, ub, za, zb, cols=3 if not door else 2, transom=True, reveal=0.3)
    if not door:
        lbox('stone', F, ua - 0.05, ub + 0.05, 0, 0.08, za - 0.12, za, bottom=True)
    return (ua, ub, za, zb)

def brackets(F, u0, u1, z, step=0.9):
    """Кронштейны под карнизом."""
    n = max(1, round((u1 - u0) / step))
    for k in range(n + 1):
        u = u0 + 0.25 + (u1 - u0 - 0.5) * k / n
        lbox('trim', F, u - 0.08, u + 0.08, 0, 0.36, z - 0.32, z + 0.02, bottom=True)

def frame_of(a, b):
    return frame_from(a, b, INSIDE)

def upper(F, L, axes, m0=0.8, surround=True, skip=()):
    """Второй и третий этажи: ряд осей окон, стена с проёмами."""
    holes = []
    step = (L - 2 * m0) / axes
    for i in range(axes):
        if i in skip: continue
        cu = m0 + step * (i + 0.5)
        holes.append(win(F, cu, Z1 + 0.95, 1.4, 1.9, surround))
        holes.append(win(F, cu, Z2 + 0.85, 1.4, 1.85, surround))
    wall(F, 0, L, Z1, Z3, 0, holes, m='wall')

def ground(F, L, holes, belt=True):
    wall(F, 0, L, 0.35, Z1, 0, holes, m='wall2')
    lbox('stone', F, -0.02, L + 0.02, -0.3, 0.06, GR, 0.35)                     # цоколь
    if belt:
        lbox('trim', F, -0.05, L + 0.05, -0.02, 0.18, Z1 - 0.12, Z1 + 0.16, bottom=True)

def top(F, L, ext=0.5, br=True):
    if br: brackets(F, 0.2, L - 0.2, Z3)
    cornice(F, 0, L, 0, Z3, ext)

# ------------------------------------------------------------------ улица Генерала Петрова (P2 → A)
F, L = frame_of(P2, A)
AX = 16
m0 = 0.8
step = (L - 2 * m0) / AX
upper(F, L, AX, m0)
holes = []
DOORS = {1, 6, 11, 14}                            # входы в магазины — наугад, по одному на 3–5 осей
for i in range(AX):
    cu = m0 + step * (i + 0.5)
    holes.append(shopwin(F, cu, 2.4 if i not in DOORS else 1.7, door=i in DOORS))
    if i in DOORS:
        lbox('metal', F, cu - 0.85, cu + 0.85, -0.3, -0.24, 0.05, 2.5)         # дверное полотно в глубине
ground(F, L, holes)
# прямоугольные вывески над витринами (без надписей: текстов на фото не разобрать)
for i0, i1 in ((0, 3), (5, 8), (10, 12), (13, 15)):
    ua, ub = m0 + step * i0 + 0.3, m0 + step * (i1 + 1) - 0.3
    lbox('metal', F, ua, ub, 0, 0.12, 3.35, 3.95, bottom=True)
top(F, L)

# ------------------------------------------------------------------ площадь Лазарева (B → P4)
F, L = frame_of(B, P4)
upper(F, L, 3, 0.7)
h1 = shopwin(F, L * 0.36, 2.4)
h2 = shopwin(F, L * 0.78, 1.7, door=True)
lbox('metal', F, L * 0.78 - 0.85, L * 0.78 + 0.85, -0.3, -0.24, 0.05, 2.5)
ground(F, L, [h1, h2])
lbox('metal', F, 0.5, L - 0.4, 0, 0.12, 3.35, 3.95, bottom=True)
top(F, L)

# ------------------------------------------------------------------ торец (P1 → P2)
F, L = frame_of(P1, P2)
upper(F, L, 4, 1.2, surround=False)
holes = [win(F, L * 0.3, 1.1, 1.3, 1.7, False), win(F, L * 0.7, 1.1, 1.3, 1.7, False)]
ground(F, L, holes)
top(F, L, br=False)

# ------------------------------------------------------------------ двор (P4 → P1); P4–P0 — общая стена
F, L = frame_of(P4, P1)
LP = dist(P4, P0)                                 # 13,4 м — стык с Б. Морской, 2
wall(F, 0, LP, GR, Z3, 0, [], m='wall')
FY = Frame(F.o + F.u * LP, F.u, F.n)
LY = L - LP
AXY = 13
my = 0.8
sy = (LY - 2 * my) / AXY
holes_u, holes_g = [], []
ENTR = {3, 9}                                     # подъезды — наугад
for i in range(AXY):
    cu = my + sy * (i + 0.5)
    holes_u.append(win(FY, cu, Z1 + 0.95, 1.3, 1.8, False))
    holes_u.append(win(FY, cu, Z2 + 0.85, 1.3, 1.8, False))
    if i in ENTR:
        holes_g.append((cu - 0.7, cu + 0.7, 0.35, 2.5))
        lbox('wood', FY, cu - 0.7, cu + 0.7, -0.26, -0.2, 0.35, 2.5)
        lbox('trim', FY, cu - 1.0, cu + 1.0, 0, 0.9, 2.75, 2.9, bottom=True)    # козырёк
        lbox('stone', FY, cu - 1.0, cu + 1.0, 0, 1.0, GR, 0.35)                # крыльцо
    else:
        holes_g.append(win(FY, cu, 1.0, 1.3, 1.7, False))
wall(FY, 0, LY, Z1, Z3, 0, holes_u, m='wall')
ground(FY, LY, holes_g, belt=False)
top(FY, LY, br=False)

# ------------------------------------------------------------------ срезанный угол: лоджия и эркер
F, L = frame_of(A, B)
LD = -2.0                                          # глубина лоджии
SB = 0.45                                          # стилобат лоджии над тротуаром
# стилобат, задняя стена лоджии с дверью, боковые стенки, потолок
lbox('stone', F, 0, L, LD, 0.1, GR, SB)
lbox('stone', F, L * 0.5 - 1.0, L * 0.5 + 1.0, 0.1, 0.45, GR, SB * 0.5)        # ступень
Fb = Frame(F.o + F.n * LD, F.u, F.n)
dh = (L / 2 - 0.85, L / 2 + 0.85, SB, SB + 2.7)
wall(Fb, 0, L, SB, Z1, 0, [dh], m='wall2')
glz(Fb, *dh, cols=2, transom=True, reveal=0.15)
face('wall2', [F.p(0, LD, SB), F.p(0, 0, SB), F.p(0, 0, Z1), F.p(0, LD, Z1)], F.U())
face('wall2', [F.p(L, LD, SB), F.p(L, 0, SB), F.p(L, 0, Z1), F.p(L, LD, Z1)], -F.U())
face('trim', [F.p(0, LD, Z1 - 0.4), F.p(L, LD, Z1 - 0.4), F.p(L, 0, Z1 - 0.4), F.p(0, 0, Z1 - 0.4)], -UP)
# балка над колоннами
lbox('trim', F, -0.1, L + 0.1, -0.9, 0.05, Z1 - 0.45, Z1, bottom=True)

def column(u, d):
    """Тосканская колонна: плинт, база, ствол с утонением, эхин, абака."""
    base = F.p(u, d, SB)
    H = Z1 - 0.45 - SB
    D = 0.42
    Fc = Frame(Vector((base.x, base.y)), F.u, F.n)
    box('trim', Fc, -0.29, 0.29, -0.29, 0.29, SB, SB + 0.14)
    prof = [(0.25, 0.14), (0.25, 0.22), (0.22, 0.26), (D / 2, 0.30)]
    zs1 = H - 0.32
    for k in range(4):
        t = (k + 1) / 4
        prof.append((D / 2 - 0.03 * t ** 1.6, 0.30 + (zs1 - 0.30) * t))
    prof += [(0.205, zs1 + 0.04), (0.19, zs1 + 0.08), (0.25, zs1 + 0.2)]
    lathe('trim_s', base, prof, 12, cap=True)
    box('trim', Fc, -0.29, 0.29, -0.29, 0.29, SB + zs1 + 0.2, SB + H)

CD = -0.45
for u in (0.35, 0.95, L - 0.95, L - 0.35):        # две пары колонн
    column(u, CD)
# балюстрада между парами
bu0, bu1 = 1.25, L - 1.25
lbox('trim', F, bu0, bu1, CD - 0.14, CD + 0.14, SB, SB + 0.14, bottom=True)
lbox('trim', F, bu0, bu1, CD - 0.16, CD + 0.16, SB + 0.86, SB + 0.98, bottom=True)
nb = max(2, round((bu1 - bu0) / 0.3))
for k in range(nb):
    u = bu0 + (bu1 - bu0) * (k + 0.5) / nb
    lathe('trim', F.p(u, CD, SB + 0.14),
          [(0.05, 0.0), (0.075, 0.14), (0.085, 0.3), (0.05, 0.5), (0.04, 0.6), (0.06, 0.72)], 6, cap=True)

# эркер второго этажа: три грани, вынос 0,9 м
BD, BS = 0.9, 0.55
pts = [(0, 0), (BS, BD), (L - BS, BD), (L, 0)]
face('trim', [F.p(u, d, Z1 - 0.15) for u, d in pts], -UP)
for k in range(3):
    (ua, da), (ub, db) = pts[k], pts[k + 1]
    o = F.p(ua, da, 0)
    uu = Vector((ub - ua, 0)); dd = (F.u * (ub - ua) + F.n * (db - da))
    ln = dd.length
    Fk = Frame(Vector((o.x, o.y)), dd, Vector((dd.y, -dd.x)))
    if Fk.n.dot(F.n * 0.5 + F.u * ((ua + ub) / 2 - L / 2) * 0.01 + F.n) < 0:
        Fk = Frame(Vector((o.x, o.y)), dd, Vector((-dd.y, dd.x)))
    w = 1.6 if k == 1 else 0.5
    hole = (ln / 2 - w / 2, ln / 2 + w / 2, Z1 + 0.85, Z1 + 2.8)
    wall(Fk, 0, ln, Z1 - 0.15, Z2 + 0.05, 0, [hole], m='wall', reveal=0.16)
    glz(Fk, *hole, cols=2 if k == 1 else 1, transom=True, reveal=0.16)
    lbox('trim', Fk, hole[0] - 0.08, hole[1] + 0.08, 0, 0.1, hole[2] - 0.08, hole[2], bottom=True)
    lbox('trim', Fk, -0.05, ln + 0.05, 0, 0.12, Z1 - 0.3, Z1 + 0.05, bottom=True)   # пояс-основание
    lbox('trim', Fk, -0.05, ln + 0.05, 0, 0.18, Z2 - 0.12, Z2 + 0.12, bottom=True)  # карнизик
face('trim', [F.p(u, d + (0.12 if d > 0 else 0), Z2 + 0.12) for u, d in pts], UP)
# кронштейны-консоли под эркером
for u in (0.6, L - 0.6):
    lbox('trim', F, u - 0.12, u + 0.12, 0, BD - 0.05, Z1 - 0.65, Z1 - 0.15, bottom=True)
# стена среза: первый этаж — за лоджией; второй — за эркером; третий — окно
wall(F, 0, L, Z2, Z3, 0, [win(F, L / 2, Z2 + 0.85, 1.4, 1.85)], m='wall')
quad('wall', F, 0, L, Z1, Z2, 0.0)
top(F, L)

# ------------------------------------------------------------------ кровля
def offset_poly(pts, ws):
    """Многоугольник, у которого ребро i сдвинуто внутрь на ws[i] (минус — наружу)."""
    V = [W(*p) for p in pts]
    n = len(V)
    area = sum(V[i].x * V[(i + 1) % n].y - V[(i + 1) % n].x * V[i].y for i in range(n)) / 2
    lines = []
    for i in range(n):
        a, b = V[i], V[(i + 1) % n]
        d = (b - a).normalized()
        nin = Vector((-d.y, d.x)) if area > 0 else Vector((d.y, -d.x))
        lines.append((a + nin * ws[i], d))
    T = []
    for i in range(n):
        p1, d1 = lines[i - 1]
        p2, d2 = lines[i]
        den = d1.x * d2.y - d1.y * d2.x
        t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / den
        T.append(p1 + d1 * t)
    return T

E = offset_poly(PLAN, [-OV] * 5)
HIP = 5.3
T = offset_poly(PLAN, [HIP] * 5)
n = len(E)
A3 = [Vector((v.x, v.y, ZC)) for v in E]
T3 = [Vector((v.x, v.y, ZC + RISE)) for v in T]
cen = sum(A3, Vector()) / n
for i in range(n):
    j = (i + 1) % n
    mid = (A3[i] + A3[j]) / 2
    face('roof', [A3[i], A3[j], T3[j], T3[i]], (mid - cen) + UP * 1.2)
    beam('roof', A3[i] + UP * 0.05, T3[i] + UP * 0.05, 0.22, 0.12)                # ребро вальмы
face('roof', T3, UP)
face('trim', A3, -UP)                              # подшивка свеса
for i in range(n):
    beam('roof', T3[i] + UP * 0.05, T3[(i + 1) % n] + UP * 0.05, 0.24, 0.14)      # конёк

finish('genpetrova1', __file__)
