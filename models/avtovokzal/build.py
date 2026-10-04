# Центральный автовокзал Севастополя (автостанция, ул. Вокзальная, 11) — модель с нуля.
#
#   blender -b --python models/avtovokzal/build.py -- [glb]
#
# План — контур OSM way 93252025 (прямоугольник 15,1 x 23,5 м, выпрямлен: OSM даёт
# две лишние точки-«колена» на длинных сторонах), фасады — с фото Викисклада
# (Автостанция — panoramio 4, 5, 6, 7, 9; Автовокзал — panoramio 12), крыша и
# площадки — со спутника. Ноль высоты — тротуар у середины главного (юго-
# западного) фасада, перед входом.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

X0, Z0 = 480.2, 2459.25          # середина короткой (главной) стороны контура P5–P0
origin(X0, Z0)

COL['wall']  = ((0.90, 0.89, 0.85), 0.9)     # белый «кирпичный» сайдинг (фото 2020 г.), #e2e3df
COL['wall2'] = ((0.08, 0.27, 0.62), 0.55)    # синий: буквы, каркас козырьков, навесы перрона, стойки
COL['wall3'] = ((0.27, 0.19, 0.16), 0.75)    # тёмно-коричневый: поликарбонат козырька, крыши киосков
COL['roof']  = ((0.47, 0.14, 0.17), 0.8)     # малиново-бордовая металлочерепица
COL['stone'] = ((0.62, 0.61, 0.58), 0.9)
COL['trim']  = ((0.95, 0.95, 0.93), 0.85)
COL['glass'] = ((0.20, 0.31, 0.38), 0.10)    # серебристо-голубое тонированное остекление
COL['metal'] = ((0.14, 0.15, 0.17), 0.5)

GROUND = -3.0                    # стены уходят под землю (участок с уклоном)
HW, DEP = 7.55, 23.5             # полуширина фасада и глубина здания
EAVE = 6.9                       # низ свеса кровли
RISE = 2.0                       # подъём вальмы
TOP = 11.0                       # верх лестничной башни

a = W(473.3, 2456.2); b = W(487.1, 2462.3)
u = (b - a).normalized()
n = Vector((-u.y, u.x))
if n.dot(W(489.7, 2437.7) - W(X0, Z0)) > 0:
    n = -n
F = Frame(W(X0, Z0), u, n)                               # главный фасад: u — вправо, d — наружу
FE = Frame(F.p(HW, 0, 0).xy, -F.n, F.u)                  # восточная длинная стена, u — от фасада к тылу
FW = Frame(F.p(-HW, 0, 0).xy, -F.n, -F.u)                # западная
FR = Frame(F.p(HW, -DEP, 0).xy, -F.u, -F.n)              # тыловая (северная), u — с востока на запад

def slab(m, Fx, u0, u1, d0, d1, za, zb, th):
    """Наклонная плита: у d0 низ на za, у d1 — на zb."""
    P = Fx.p
    top = [P(u0, d0, za + th), P(u1, d0, za + th), P(u1, d1, zb + th), P(u0, d1, zb + th)]
    bot = [P(u0, d0, za), P(u1, d0, za), P(u1, d1, zb), P(u0, d1, zb)]
    c = sum(top + bot, Vector()) / 8
    for q in (top, bot, [bot[0], bot[1], top[1], top[0]], [bot[3], bot[2], top[2], top[3]],
              [bot[0], bot[3], top[3], top[0]], [bot[1], bot[2], top[2], top[1]]):
        face(m, q, sum(q, Vector()) / 4 - c)

def railing(pts, z0, h=0.95, step=0.6):
    for i in range(len(pts)):
        p, q = pts[i], pts[(i + 1) % len(pts)]
        A = Vector((p.x, p.y, z0)); B = Vector((q.x, q.y, z0))
        beam('metal', A + UP * h, B + UP * h, 0.07, 0.05)
        beam('metal', A + UP * h * 0.45, B + UP * h * 0.45, 0.04, 0.03)
        k = max(1, round((B - A).length / step))
        for j in range(k + 1):
            s = A + (B - A) * (j / k)
            beam('metal', s, s + UP * h, 0.035)

# ================================================================== КОРОБКА
def plinth_band(Fx, L):
    band(Fx, 0, L, 0, GROUND, 0.6, 0.08, m='stone')
    band(Fx, 0, L, 0, 3.72, 3.86, 0.07)                       # междуэтажная тяга
    band(Fx, -0.1, L + 0.1, 0, EAVE - 0.38, EAVE, 0.22)       # венчающий пояс под свесом

def front():
    Fx = F
    holes = []
    for s in (-1, 1):                                         # окна боковых частей фасада
        holes.append(window(Fx, s * 5.75, 1.25, 1.5, 1.5, 0))
        holes.append(window(Fx, s * 5.75, 4.55, 1.5, 1.65, 0))
    ent = (-3.45, 3.45, 0.6, 3.55)                            # остеклённый вход
    glass = (-3.3, 3.3, 3.95, 6.95)                           # большой витраж 5 x 4
    holes += [ent, glass]
    wall(Fx, -HW, HW, GROUND, EAVE, 0, holes)
    wall(Fx, -HW, HW, EAVE, EAVE + 0.01, 0, [])
    plinth_band(Fx, 0)                                        # (пустая заглушка, ниже — по частям)
    for s0, s1 in ((-HW, -4.1), (4.1, HW)):
        band(Fx, s0, s1, 0, GROUND, 0.6, 0.08, m='stone')
        band(Fx, s0, s1, 0, 3.72, 3.86, 0.07)
        band(Fx, s0 - 0.1, s1 + 0.1, 0, EAVE - 0.38, EAVE, 0.22)
    # вход
    glazing(Fx, *ent[:2], ent[2], ent[3], 0, cols=6, rows=(0.74,))
    g = -0.20
    box('metal', Fx, -0.95, 0.95, g, g + 0.07, 0.62, 0.7)
    box('metal', Fx, -0.95, -0.88, g, g + 0.07, 0.62, 3.0)
    box('metal', Fx, 0.88, 0.95, g, g + 0.07, 0.62, 3.0)
    box('metal', Fx, -0.95, 0.95, g, g + 0.07, 2.93, 3.0)
    # витраж
    glazing(Fx, *glass[:2], glass[2], glass[3], 0, cols=5, rows=(0.25, 0.5, 0.75))
    # лопатки-ризалиты по бокам витража и входа
    for s in (-1, 1):
        u0, u1 = sorted((s * 3.5, s * 4.15))
        box('wall', Fx, u0, u1, 0, 0.32, 0.6, EAVE + 0.8)
        box('trim', Fx, u0 - 0.04, u1 + 0.04, 0, 0.36, EAVE + 0.8, EAVE + 0.95)
    # ступени и площадка крыльца
    for i in range(4):
        box('stone', Fx, -4.0 - i * 0.0, 4.0, 0, 2.7 - i * 0.55, GROUND, 0.6 - 0.15 * (i + 1) + 0.15 * 0)
    box('stone', Fx, -4.0, 4.0, 0, 0.5, GROUND, 0.6)
    # козырёк над входом: поликарбонат на синем каркасе и две синие стойки
    slab('wall3', Fx, -3.9, 3.9, 0.05, 2.3, 3.95, 3.45, 0.08)
    box('wall2', Fx, -3.95, 3.95, 2.2, 2.38, 3.35, 3.62)
    for s in (-1, 1):
        box('wall2', Fx, s * 3.95 - 0.09, s * 3.95 + 0.09, 0.05, 2.38, 3.4, 3.95 - 0.35 * 0)
        box('wall2', Fx, s * 3.2 - 0.14, s * 3.2 + 0.14, 2.0, 2.28, 0.6, 3.5)
        box('trim', Fx, s * 3.2 - 0.3, s * 3.2 + 0.3, 2.28, 2.33, 1.5, 2.4)      # табличка
    # карниз-козырёк над витражом с кессонами
    box('trim', Fx, -4.2, 4.2, 0, 1.05, 6.95, 7.7)
    box('trim', Fx, -4.3, 4.3, 0, 1.15, 7.7, 7.85)
    for k in range(-3, 4):
        box('wall', Fx, k * 1.1 - 0.35, k * 1.1 + 0.35, 0.05, 1.0, 6.9, 6.97)
    # аттик-фронтон с надписью «АВТОСТАНЦИЯ»
    box('wall', Fx, -4.0, 4.0, -2.2, 0.35, 7.7, 9.0)
    prism_uz('wall', Fx, [(-4.0, 9.0), (4.0, 9.0), (0, 10.45)], -2.2, 0.35)
    for s in (-1, 1):
        prism_uz('trim', Fx, [(s * 4.15, 8.98), (0, 10.55), (0, 10.42), (s * 4.15, 8.82)], -2.35, 0.5)
    box('trim', Fx, -4.15, 4.15, -2.35, 0.5, 8.9, 9.0)
    ws = [0.62, 0.55, 0.45, 0.62, 0.6, 0.45, 0.62, 0.62, 0.6, 0.45, 0.62]      # А В Т О С Т А Н Ц И Я
    tot = sum(ws) + 0.1 * (len(ws) - 1)
    x = -tot / 2
    for w in ws:
        box('wall2', Fx, x, x + w, 0.35, 0.43, 7.9, 8.6)
        x += w + 0.1
    for k in (-3, -2, -1, 1, 2, 3):                                 # слепые ниши фриза
        box('stone', Fx, k * 1.05 - 0.28, k * 1.05 + 0.28, 0.35, 0.40, 8.68, 8.92)
    circ = [(0.62 * math.cos(2 * math.pi * k / 14), 8.38 + 0.62 * math.sin(2 * math.pi * k / 14)) for k in range(14)]
    prism_uz('wall2', Fx, circ, 0.43, 0.55)                          # часы с синим ободом
    circ2 = [(0.46 * math.cos(2 * math.pi * k / 14), 8.38 + 0.46 * math.sin(2 * math.pi * k / 14)) for k in range(14)]
    prism_uz('trim', Fx, circ2, 0.55, 0.58)
    beam('metal', Fx.p(0, -1.0, 10.4), Fx.p(0, -1.0, 13.6), 0.05)   # мачта на коньке

def side_walls():
    # --- восточная (к проезду) длинная стена
    hs = []
    hs.append(window(FE, 2.0, 1.7, 0.5, 4.0, 0))                      # узкая лестничная щель
    for cu in (9.6, 13.2, 16.8, 20.4):
        hs.append(window(FE, cu, 4.5, 1.3, 1.6, 0))
    for cu in (9.6, 13.2, 20.4):
        hs.append(window(FE, cu, 1.2, 1.3, 1.5, 0))
    door = (5.55, 6.5, 3.86, 5.9)
    hs.append(door)
    wall(FE, 0, DEP, GROUND, EAVE, 0, hs)
    glazing(FE, *door, 0, cols=1, rows=(0.0,))
    box('trim', FE, 5.0, 7.1, 0, 1.0, 3.72, 3.88)                    # балкончик у двери
    railing([FE.p(5.0, 1.0, 0).xy, FE.p(7.1, 1.0, 0).xy, FE.p(7.1, 0.05, 0).xy], 3.88, 0.95, 0.5)
    plinth_band(FE, DEP)
    # --- западная
    hs = []
    hs.append(window(FW, 4.0, 4.5, 1.7, 1.65, 0))
    hs.append(window(FW, 8.2, 4.5, 1.1, 1.65, 0))
    hs.append(window(FW, 11.2, 4.5, 1.1, 1.65, 0))
    hs.append(window(FW, 14.0, 4.5, 1.1, 1.65, 0))
    hs.append(window(FW, 4.0, 1.2, 1.7, 1.5, 0))
    hs.append(window(FW, 8.2, 1.2, 1.1, 1.5, 0))
    wall(FW, 0, 16.8, GROUND, EAVE, 0, hs)
    plinth_band(FW, 16.8)
    # башня на северо-западном углу: ярус выше свеса + узкие высокие щели
    hs = [(17.9, 18.4, 1.5, 9.3), (19.9, 20.4, 1.5, 9.3), (21.9, 22.4, 1.5, 9.3)]
    for h in hs:
        glazing(FW, *h, 0, cols=1, rows=(), reveal=0.2)
    for cu in (17.2, 18.4, 19.6, 20.8, 22.0):
        pass
    sm = [window(FW, cu, 9.5, 0.55, 0.65, 0) for cu in (17.45, 18.6, 19.75, 20.9, 22.05)]
    wall(FW, 16.8, DEP, GROUND, TOP, 0, hs + sm)
    plinth_band(Frame(FW.p(16.8, 0, 0).xy, FW.u, FW.n), DEP - 16.8)
    band(FW, 16.8, DEP, 0, TOP - 0.3, TOP, 0.2)
    # --- тыл (север): восточная часть до свеса, западная — башня
    hs = [window(FR, cu, 4.5, 1.3, 1.6, 0) for cu in (1.6, 4.6, 7.6)]
    hs += [window(FR, cu, 1.2, 1.3, 1.5, 0) for cu in (1.6, 4.6, 7.6)]
    wall(FR, 0, 9.95, GROUND, EAVE, 0, hs)
    sm = [window(FR, cu, 9.5, 0.55, 0.65, 0) for cu in (10.9, 12.0, 13.1, 14.2)]
    hs2 = [window(FR, 12.5, 4.5, 1.3, 1.6, 0), window(FR, 12.5, 1.2, 1.3, 1.5, 0)]
    wall(FR, 9.95, 2 * HW, GROUND, TOP, 0, hs2 + sm)
    plinth_band(FR, 9.95)
    plinth_band(Frame(FR.p(9.95, 0, 0).xy, FR.u, FR.n), 2 * HW - 9.95)
    band(FR, 9.95, 2 * HW, 0, TOP - 0.3, TOP, 0.2)
    # --- грани башни, выступающие над крышей: южная и восточная
    FS = Frame(F.p(-HW, -16.8, 0).xy, F.u, F.n)
    sm = [window(FS, cu, 9.5, 0.55, 0.65, 0) for cu in (0.9, 2.0, 3.1, 4.2)]
    wall(FS, 0, HW - 2.4, EAVE - 0.2, TOP, 0, sm)
    band(FS, 0, HW - 2.4, 0, TOP - 0.3, TOP, 0.2)
    FT = Frame(F.p(-2.4, -16.8, 0).xy, -F.n, F.u)
    sm = [window(FT, cu, 9.5, 0.55, 0.65, 0) for cu in (1.2, 2.5, 3.8, 5.1)]
    wall(FT, 0, DEP - 16.8, EAVE - 0.2, TOP, 0, sm)
    band(FT, 0, DEP - 16.8, 0, TOP - 0.3, TOP, 0.2)
    # плоская кровля башни с ограждением
    t0, t1, e0, e1 = -HW - 0.35, -2.4 + 0.35, -DEP - 0.35, -16.8 + 0.35
    box('trim', F, t0, t1, e0, e1, TOP, TOP + 0.3)
    box('stone', F, t0 + 0.05, t1 - 0.05, e0 + 0.05, e1 - 0.05, TOP + 0.3, TOP + 0.34)
    railing([F.p(t0 + 0.1, e1 - 0.1, 0).xy, F.p(t1 - 0.1, e1 - 0.1, 0).xy,
             F.p(t1 - 0.1, e0 + 0.1, 0).xy, F.p(t0 + 0.1, e0 + 0.1, 0).xy], TOP + 0.34, 0.95, 0.55)
    chimney(F, -3.8, -21.8, TOP + 0.34, TOP + 1.5, w=0.7)

def roof():
    hip_roof(F, -HW, HW, 0, -DEP, EAVE, RISE, ov=0.5)
    # вентканал на скате
    chimney(F, 4.5, -15.0, EAVE + 1.4, EAVE + 2.8, w=0.6)

# ================================================================== КИОСКИ
def kiosk(Fx, u0, u1, dep, h=3.0):
    box('trim', Fx, u0, u1, 0.05, dep, 0.1, h)
    box('wall3', Fx, u0 - 0.25, u1 + 0.25, 0.0, dep + 0.5, h, h + 0.2)
    k = u0 + 0.25
    while k < u1 - 0.9:
        w = min(1.6, u1 - 0.25 - k)
        face('glass', [Fx.p(k, dep + 0.01, 0.95), Fx.p(k + w - 0.1, dep + 0.01, 0.95),
                       Fx.p(k + w - 0.1, dep + 0.01, 2.5), Fx.p(k, dep + 0.01, 2.5)], Fx.N())
        k += w
    box('stone', Fx, u0, u1, 0.05, dep + 0.05, 0.0, 0.1)

def kiosks():
    kiosk(FW, 1.5, 14.0, 2.4)                    # западный ряд: газеты, буфет (под бордовым козырьком)
    kiosk(FE, 1.3, 8.5, 2.0, 2.9)                # восточный: «Запчасти» и киоск у перрона

# ================================================================== ПЕРРОН: навесы
def arch_canopy(uc, d0, d1, w=3.2, zc=3.1, rise=0.75, th=0.07, number=None):
    n_ = 8
    prof = []
    for k in range(n_ + 1):
        t = math.pi - math.pi * k / n_
        prof.append((uc + w / 2 * math.cos(t), zc + rise * math.sin(t), t))
    for k in range(n_):
        (u0, z0, t0), (u1, z1, t1) = prof[k], prof[k + 1]
        tm = (t0 + t1) / 2
        hint = F.U() * math.cos(tm) + UP * math.sin(tm)
        face('wall2', [F.p(u0, d0, z0 + th), F.p(u1, d0, z1 + th), F.p(u1, d1, z1 + th), F.p(u0, d1, z0 + th)], hint)
        face('wall2', [F.p(u0, d0, z0), F.p(u1, d0, z1), F.p(u1, d1, z1), F.p(u0, d1, z0)], -hint)
        for d, s in ((d0, -1), (d1, 1)):
            face('wall2', [F.p(u0, d, z0), F.p(u1, d, z1), F.p(u1, d, z1 + th), F.p(u0, d, z0 + th)], F.N() * s)
    for d in (d0 + 0.15, d1 - 0.15):                      # стойки
        for s in (-1, 1):
            box('wall2', F, uc + s * (w / 2 - 0.1) - 0.07, uc + s * (w / 2 - 0.1) + 0.07, d - 0.07, d + 0.07, 0.15, zc)
    box('wall2', F, uc - w / 2 + 0.05, uc + w / 2 - 0.05, d0 + 0.08, d0 + 0.2, zc - 0.02, zc + 0.06)     # поперечные
    # скамья
    box('wood', F, uc - 0.3, uc + 0.3, (d0 + d1) / 2 - 1.0, (d0 + d1) / 2 + 1.0, 0.4, 0.46)
    box('metal', F, uc - 0.28, uc - 0.2, (d0 + d1) / 2 - 0.95, (d0 + d1) / 2 + 0.95, 0.15, 0.4)
    box('metal', F, uc + 0.2, uc + 0.28, (d0 + d1) / 2 - 0.95, (d0 + d1) / 2 + 0.95, 0.15, 0.4)
    if number:                                            # шест с табличкой номера посадочной
        pd = d0 - 0.5
        box('wall2', F, uc - 0.07, uc + 0.07, pd - 0.07, pd + 0.07, 0.0, 4.6)
        box('wall2', F, uc - 0.4, uc + 0.4, pd - 0.05, pd + 0.05, 3.7, 4.6)
        box('trim', F, uc - 0.16, uc + 0.16, pd - 0.06, pd + 0.06, 3.86, 4.44)

def platform():
    # посадочная площадка (перрон) вдоль восточной стены: бордюр и покрытие
    box('stone', F, HW + 0.5, 18.2, -15.5, -1.0, GROUND, 0.12)
    box('trim', F, 18.0, 18.2, -15.5, -1.0, 0.12, 0.2)
    box('stone', F, -9.0, 9.0, 0.0, 3.4, GROUND, 0.1)             # площадка перед входом
    arch_canopy(15.3, -8.0, -3.2, number='3')
    arch_canopy(15.7, -13.2, -8.4, number='2')
    # навес на западе-севере за зданием (посадка № 4)
    arch_canopy(-12.3, -32.0, -26.0, number='4')
    box('stone', F, -15.0, -9.5, -33.0, -24.5, GROUND, 0.1)

front()
side_walls()
roof()
kiosks()
platform()

finish('avtovokzal', __file__)
