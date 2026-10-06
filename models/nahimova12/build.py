# Жилой дом, пр. Нахимова, 12 (Черноморка, OSM way 92028133).
#
#   blender -b --python models/nahimova12/build.py -- [glb]
#   (или python с модулем bpy: python models/nahimova12/build.py -- glb)
#
# Фото нет, в refs/center-models.json только план и «3 этажа; соседние дома —
# кремовый известняк с аркадами у основания». Поэтому дом сдержанный, в духе
# соседей: трёхэтажная послевоенная сталинка из кремового инкерманского камня,
# первый этаж с арочными окнами и рустом в простенках, окна верхних этажей с
# наличниками, венчающий карниз, вальмовая серая кровля. Что сделано наугад —
# в NOTES.md.
#
# План — контур OSM, выпрямленный до буквы Г: корпус вдоль проспекта Нахимова
# (35.4 × 14.1 м) и поперечное крыло у угла с ул. Маяковского (13.8 × 20.6 м).
# Рамка F: u — вдоль фасада на проспект от угла с ул. Маяковского (ЮЗ, u = 0)
# к СВ торцу (u = 35.4), то есть слева направо, если смотреть с проспекта;
# d — наружу на ЮВ, к проспекту. Ноль высоты — тротуар у середины фасада.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

# ------------------------------------------------------------------ цвета
COL['wall']  = ((0.88, 0.84, 0.74), 0.9)     # кремовый известняк (#e0d6bd)
COL['wall2'] = ((0.83, 0.78, 0.67), 0.9)     # первый этаж — тон темнее
COL['trim']  = ((0.93, 0.90, 0.82), 0.85)    # наличники, пояса, руст, карниз
COL['stone'] = ((0.58, 0.56, 0.52), 0.9)     # цоколь, ступени
COL['roof']  = ((0.48, 0.48, 0.48), 0.8)     # серая кровля (#7a7a7a)
COL['wood']  = ((0.32, 0.22, 0.14), 0.6)     # двери подъездов
COL['metal'] = ((0.20, 0.21, 0.22), 0.5)     # козырьки, водостоки

A_ = (-434.0, 514.2)            # угол проспекта и ул. Маяковского (точка 4 контура)
B_ = (-413.5, 485.3)            # СВ угол фасада на проспект (точка 3)
L = 35.4                        # длина фасада на проспект
_ux, _uz = (B_[0] - A_[0]) / L, (B_[1] - A_[1]) / L
X0, Z0 = A_[0] + _ux * L / 2, A_[1] + _uz * L / 2
origin(round(X0, 2), round(Z0, 2))
F, _ = frame_from(A_, B_, (-430.0, 495.0))

GR = -3.0                       # стены уходят под землю
DN = 14.1                       # глубина корпуса вдоль проспекта
WU, WD = 13.8, 20.6             # крыло у ул. Маяковского: u 0..13.8, d до −20.6
PL = 0.8                        # верх цоколя
H1, H2 = 4.1, 7.5               # отметки 2-го и 3-го этажей
EAVE = 10.9                     # низ венчающего карниза
TOP = EAVE + 0.6                # верх карниза — пята кровли
RISE = 2.9

# План в осях рамки (u, d), обход по контуру.
PLAN = [(0, 0), (L, 0), (L, -DN), (WU, -DN), (WU, -WD), (0, -WD)]

def inside(u, d):
    return (0 < u < L and -DN < d < 0) or (0 < u < WU and -WD < d < 0)

def edge(i):
    """Рамка стены по ребру плана i и её длина; n — наружу."""
    a, b = Vector(PLAN[i]), Vector(PLAN[(i + 1) % len(PLAN)])
    t = (b - a).normalized()
    nn = Vector((-t.y, t.x))
    mid = (a + b) / 2
    if inside(*(mid + nn * 0.5)): nn = -nn
    o = F.o + F.u * a.x + F.n * a.y
    return Frame(o, F.u * t.x + F.n * t.y, F.u * nn.x + F.n * nn.y), (b - a).length

# ================================================================== детали
def arch(Fr, cu, r, za, zs, d=0.0, rev=0.3, seg=8):
    """Арочное окно первого этажа: пазухи, откос по дуге, архивольт с замком,
    стекло с импостом. Возвращает прямоугольный проём для wall()."""
    arc = [(cu + r * math.cos(math.pi * k / seg), zs + r * math.sin(math.pi * k / seg)) for k in range(seg + 1)]
    hs = seg // 2
    face('wall2', [Fr.p(cu + r, d, zs + r)] + [Fr.p(u, d, z) for u, z in arc[:hs + 1]], Fr.N())
    face('wall2', [Fr.p(cu - r, d, zs + r)] + [Fr.p(u, d, z) for u, z in arc[hs:]], Fr.N())
    dd = d - rev
    for k in range(seg):
        (ua, za_), (ub, zb_) = arc[k], arc[k + 1]
        face('trim', [Fr.p(ua, d, za_), Fr.p(ub, d, zb_), Fr.p(ub, dd, zb_), Fr.p(ua, dd, za_)],
             Fr.p(cu, d, zs) - Fr.p((ua + ub) / 2, d, (za_ + zb_) / 2))
        ro = r + 0.18                                         # архивольт
        oa = (cu + ro * math.cos(math.pi * k / seg), zs + ro * math.sin(math.pi * k / seg))
        ob = (cu + ro * math.cos(math.pi * (k + 1) / seg), zs + ro * math.sin(math.pi * (k + 1) / seg))
        face('trim', [Fr.p(ua, d + 0.05, za_), Fr.p(ub, d + 0.05, zb_), Fr.p(ob[0], d + 0.05, ob[1]), Fr.p(oa[0], d + 0.05, oa[1])], Fr.N())
    box('trim', Fr, cu - 0.17, cu + 0.17, d, d + 0.1, zs + r - 0.12, zs + r + 0.3, bottom=False)   # замок
    box('trim', Fr, cu - r - 0.1, cu + r + 0.1, d, d + 0.12, za - 0.12, za, bottom=False)          # подоконник
    g = dd + 0.02
    face('glass', [Fr.p(cu - r, g, za), Fr.p(cu + r, g, za), Fr.p(cu + r, g, zs)] +
         [Fr.p(u, g, z) for u, z in arc[1:-1]] + [Fr.p(cu - r, g, zs)], Fr.N())
    t = 0.07
    box('trim', Fr, cu - r, cu + r, g, g + 0.07, zs - t / 2, zs + t / 2, bottom=False)          # импост
    box('trim', Fr, cu - t / 2, cu + t / 2, g, g + 0.07, za, zs + r, bottom=False)
    return (cu - r, cu + r, za, zs + r)

def lite(Fr, cu, za, w, h, d=0.0):
    """Простое окно дворового фасада: стекло, переплёт, отлив."""
    ua, ub = cu - w / 2, cu + w / 2
    g = d - 0.22
    face('glass', [Fr.p(ua, g, za), Fr.p(ub, g, za), Fr.p(ub, g, za + h), Fr.p(ua, g, za + h)], Fr.N())
    box('trim', Fr, cu - 0.03, cu + 0.03, g, g + 0.06, za, za + h, bottom=False)
    box('trim', Fr, ua, ub, g, g + 0.06, za + h * 0.68 - 0.03, za + h * 0.68 + 0.03, bottom=False)
    box('trim', Fr, ua - 0.06, ub + 0.06, d, d + 0.08, za - 0.08, za, bottom=False)
    return (ua, ub, za, za + h)

def win(Fr, cu, za, w, h, d=0.0):
    """Окно уличного фасада: наличник из набора, стекло с переплётом (рамку
    заменяет откос проёма — так вдвое легче, чем glazing())."""
    surround(Fr, cu - w / 2, cu + w / 2, za, za + h, d)
    ua, ub = cu - w / 2, cu + w / 2
    g = d - 0.22
    face('glass', [Fr.p(ua, g, za), Fr.p(ub, g, za), Fr.p(ub, g, za + h), Fr.p(ua, g, za + h)], Fr.N())
    box('trim', Fr, cu - 0.035, cu + 0.035, g, g + 0.07, za, za + h, bottom=False)
    box('trim', Fr, ua, ub, g, g + 0.07, za + h * 0.68 - 0.035, za + h * 0.68 + 0.035, bottom=False)
    return (ua, ub, za, za + h)

def door(Fr, cu, d=0.0, w=1.4):
    """Подъезд: дверь в проёме, фрамуга, козырёк, две ступени."""
    ua, ub = cu - w / 2, cu + w / 2
    g = d - 0.22
    face('wood', [Fr.p(ua, g, 0.3), Fr.p(ub, g, 0.3), Fr.p(ub, g, 2.5), Fr.p(ua, g, 2.5)], Fr.N())
    face('glass', [Fr.p(ua, g, 2.5), Fr.p(ub, g, 2.5), Fr.p(ub, g, 3.0), Fr.p(ua, g, 3.0)], Fr.N())
    box('trim', Fr, ua, ub, g, g + 0.07, 2.47, 2.55, bottom=False)
    box('trim', Fr, cu - 0.03, cu + 0.03, g, g + 0.06, 0.3, 2.47, bottom=False)
    box('metal', Fr, ua - 0.4, ub + 0.4, d, d + 1.2, 3.25, 3.37)                                  # козырёк
    box('stone', Fr, ua - 0.3, ub + 0.3, d, d + 1.0, GR, 0.15)
    box('stone', Fr, ua - 0.3, ub + 0.3, d, d + 0.6, 0.15, 0.3, bottom=False)
    return (ua, ub, 0.3, 3.0)

def quoins(Fr, u, s, z0, z1, d=0.0):
    """Рустованная лопатка на углу: камни через один длинный и короткий;
    s = +1 — лопатка уходит вдоль u вперёд, −1 — назад."""
    z, k = z0, 0
    while z < z1 - 0.1:
        h = min(0.5, z1 - z)
        ln = 0.95 if k % 2 == 0 else 0.62
        a, b = sorted((u, u + s * ln))
        box('trim', Fr, a, b, d, d + 0.07, z + 0.03, z + h - 0.03, bottom=False)
        z += h; k += 1

def rust(Fr, u0, u1, z0, z1, d=0.0):
    """Горизонтальный руст простенка первого этажа: камни выступают на 4 см."""
    if u1 - u0 < 0.25: return
    z = z0
    while z < z1 - 0.1:                 # передняя грань, торцы и полки; к стене грань не нужна
        a, b, za, zb = u0 + 0.02, u1 - 0.02, z + 0.04, min(z + 0.6, z1) - 0.04
        q = lambda u, dd, zz: Fr.p(u, dd, zz)
        face('trim', [q(a, d + 0.04, za), q(b, d + 0.04, za), q(b, d + 0.04, zb), q(a, d + 0.04, zb)], Fr.N())
        face('trim', [q(a, d, zb), q(b, d, zb), q(b, d + 0.04, zb), q(a, d + 0.04, zb)], UP)
        face('trim', [q(a, d, za), q(b, d, za), q(b, d + 0.04, za), q(a, d + 0.04, za)], -UP)
        z += 0.6

# ================================================================== фасады
def street(Fr, ln, bays, corner0, corner1):
    """Уличный фасад: арки и руст внизу, окна с наличниками на 2–3 этажах."""
    step = ln / bays
    axes = [step * (i + 0.5) for i in range(bays)]
    r, za, zs = 0.78, 0.95, 2.75
    h1 = []
    for cu in axes:
        h1.append(arch(Fr, cu, r, za, zs))
    wall(Fr, 0, ln, PL, H1, 0, h1, m='wall2')
    edges = [0] + [x for cu in axes for x in (cu - r - 0.18, cu + r + 0.18)] + [ln]
    for k in range(0, len(edges), 2):                       # руст в простенках
        a, b = edges[k], edges[k + 1]
        if corner0 and k == 0: a += 0.95
        if corner1 and k == len(edges) - 2: b -= 0.95
        rust(Fr, a, b, PL + 0.1, zs)
    box('stone', Fr, 0, ln, -0.25, 0.1, GR, PL)                # цоколь
    band(Fr, 0, ln, 0, PL, PL + 0.1, 0.12)
    band(Fr, 0, ln, 0, H1 - 0.35, H1 + 0.05, 0.14)              # межэтажный пояс
    h2 = []
    for cu in axes:
        h2.append(win(Fr, cu, H1 + 0.85, 1.3, 2.0))
        h2.append(win(Fr, cu, H2 + 0.75, 1.3, 1.85))
    wall(Fr, 0, ln, H1 + 0.05, EAVE, 0, h2)
    band(Fr, 0, ln, 0, H2 + 0.45, H2 + 0.55, 0.06)              # пояс под окнами 3-го этажа
    for u, s, c in ((0, 1, corner0), (ln, -1, corner1)):
        if c: quoins(Fr, u, s, PL + 0.1, H1 - 0.35)
        if c: quoins(Fr, u, s, H1 + 0.05, EAVE)
    cornice(Fr, 0, ln, 0, EAVE, ext=0.55)

def plain(Fr, ln, bays, doors=(), rough=False):
    """Дворовый фасад или торец: простые окна без наличников, подъезды."""
    step = ln / bays
    holes = []
    for i in range(bays):
        cu = step * (i + 0.5)
        if i in doors:
            holes.append(door(Fr, cu))
            holes.append(lite(Fr, cu, 4.6, 1.0, 1.3))      # окно лестницы между этажами
            holes.append(lite(Fr, cu, 8.0, 1.0, 1.3))
            continue
        holes.append(lite(Fr, cu, 1.3, 1.3, 1.9))
        holes.append(lite(Fr, cu, H1 + 0.85, 1.3, 1.9))
        holes.append(lite(Fr, cu, H2 + 0.75, 1.3, 1.8))
    wall(Fr, 0, ln, PL, EAVE, 0, holes, reveal=0.22)
    box('stone', Fr, 0, ln, -0.2, 0.08, GR, PL)
    band(Fr, 0, ln, 0, H1 - 0.2, H1 + 0.02, 0.08)
    cornice(Fr, 0, ln, 0, EAVE, ext=0.55)

def build():
    fr = [edge(i) for i in range(len(PLAN))]
    (Fn, Ln), (Fe, Le), (Fy1, Ly1), (Fk, Lk), (Fy2, Ly2), (Fm, Lm) = fr
    street(Fn, Ln, 10, True, True)              # пр. Нахимова
    street(Fm, Lm, 6, False, True)              # ул. Маяковского (лопатка у угла с проспектом)
    plain(Fe, Le, 4)                            # СВ торец
    plain(Fy1, Ly1, 6, doors=(1, 4))            # двор
    plain(Fk, Lk, 2)                            # уступ крыла
    plain(Fy2, Ly2, 4, doors=(2,))              # двор крыла
    # перекрытие над чердаком — чтобы под кровлей не просвечивало
    for (u0, u1, d0, d1) in ((0, L, -DN, 0), (0, WU, -WD, -DN)):
        face('wall', [F.p(u0, d1, TOP), F.p(u1, d1, TOP), F.p(u1, d0, TOP), F.p(u0, d0, TOP)], UP)
    # кровля: вальма над корпусом по проспекту и поперечная вальма над крылом;
    # гребни одной высоты, торец корпуса уходит под конёк крыла.
    hip_roof(F, WU / 2, L, 0, -DN, TOP, RISE, ov=0.6, hip0=False)
    Fw = Frame(F.o, -F.n, F.u)                  # u — в глубину двора, d — вдоль проспекта
    hip_roof(Fw, 0, WD, WU, 0, TOP, RISE, ov=0.6)
    # трубы и водостоки
    for u, d in ((8.0, -10.0), (20.0, -9.5), (29.5, -9.5)):
        chimney(F, u, d, TOP, TOP + RISE + 0.6, 0.7)
    for Fr, us in ((Fn, (0.35, Ln - 0.35, 14.16, 21.24)), (Fm, (Lm - 0.35,))):
        for u in us:
            box('metal', Fr, u - 0.06, u + 0.06, 0.2, 0.32, 0.1, TOP - 0.1, bottom=False)

build()
finish('nahimova12', __file__, tri_budget=10000)
