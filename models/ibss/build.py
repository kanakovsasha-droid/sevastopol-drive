# Институт биологии южных морей им. А. О. Ковалевского (Севастопольская биологическая
# станция, 1897-98, Приморский бульвар; в здании — Севастопольский аквариум-музей).
#
#   blender -b --python models/ibss/build.py -- [glb]
#
# План — контур OSM w104316994, выпрямленный до прямоугольников в «береговых» осях:
# A — вдоль берега (на юго-юго-запад), B — от двора к морю (на запад-северо-запад).
# Фасады — по фото Викисклада (refs/, см. NOTES.md): белое здание в три этажа на
# серо-синем гранитном цоколе, арочные окна второго этажа, лёгкий надстроенный
# четвёртый этаж с куполом-радиопрозрачным колпаком, во дворе — круглая крыша аквариума.
# Ноль высоты — двор (вход со двора, этаж 2 от набережной); набережная на 4 м ниже.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

X0, Z0 = -246.4, -35.2           # вход со двора, на уровне земли двора
origin(X0, Z0)

COL['wall'] = ((0.93, 0.92, 0.88), 0.9)     # белая штукатурка морского фасада
COL['wall2'] = ((0.91, 0.88, 0.76), 0.9)    # кремовая — двор
COL['wall3'] = ((0.89, 0.87, 0.80), 0.9)    # торцы
COL['trim'] = ((0.96, 0.95, 0.92), 0.85)
COL['stone'] = ((0.40, 0.41, 0.42), 0.9)    # серо-синий гранитный цоколь
COL['roof'] = ((0.34, 0.34, 0.33), 0.85)    # плоская кровля
COL['glass'] = ((0.10, 0.14, 0.18), 0.15)

# ------------------------------------------------------------------ система осей A/B
SX, SZ = -0.45915, 0.88836        # направление A в мире (x, z)
EX, EZ = -0.88836, -0.45915       # направление B (к морю)
A0, B0 = 61.0, 215.0

def wo(A, B):
    a, b = A + A0, B + B0
    return (a * SX + b * EX, a * SZ + b * EZ)

_o = W(*wo(0, 0))
M = Frame(_o, W(*wo(1, 0)) - _o, W(*wo(0, 1)) - _o)      # p(A, B, z)

def Fb(B, out):
    """Фасад на B = const, вдоль A (u = A). out=+1 — к морю."""
    return Frame(M.p(0, B, 0).xy, M.u, M.n * out)

def Fa(A, out):
    """Фасад на A = const, вдоль B (u = B). out=+1 — на юг."""
    return Frame(M.p(A, 0, 0).xy, M.n, M.u * out)

GR = -8.0          # низ стен морской стороны (рельеф у берега неточен)
GY = -3.0          # низ стен двора
ZC = 7.6           # низ венчающего карниза крыльев
ZR = 8.7           # плоская кровля крыльев
ZA = 11.3          # низ карниза надстройки
ZT = 12.3          # кровля надстройки

# ------------------------------------------------------------------ окна
def glaze(F, ua, ub, za, zb, d, cols=2, rows=(0.66,)):
    g = d - 0.24 + 0.02
    face('glass', [F.p(ua, g, za), F.p(ub, g, za), F.p(ub, g, zb), F.p(ua, g, zb)], F.N())
    t, gg = 0.05, g + 0.04
    def bar(u0, u1, z0, z1):
        face('trim', [F.p(u0, gg, z0), F.p(u1, gg, z0), F.p(u1, gg, z1), F.p(u0, gg, z1)], F.N())
    bar(ua, ua + t, za, zb); bar(ub - t, ub, za, zb)
    bar(ua, ub, za, za + t); bar(ua, ub, zb - t, zb)
    for c in range(1, cols):
        u = ua + (ub - ua) * c / cols
        bar(u - t / 2, u + t / 2, za, zb)
    for r in rows:
        z = za + (zb - za) * r
        bar(ua, ub, z - t / 2, z + t / 2)

def surr(F, ua, ub, za, zb, d, ped=False, sill=True):
    if sill:
        box('trim', F, ua - 0.12, ub + 0.12, d, d + 0.14, za - 0.12, za)
    for u0, u1 in ((ua - 0.14, ua), (ub, ub + 0.14)):
        face('trim', [F.p(u0, d + 0.03, za), F.p(u1, d + 0.03, za), F.p(u1, d + 0.03, zb + 0.14), F.p(u0, d + 0.03, zb + 0.14)], F.N())
    box('trim', F, ua - 0.18, ub + 0.18, d, d + 0.12, zb, zb + 0.16)
    if ped:
        cu = (ua + ub) / 2
        hw = (ub - ua) / 2 + 0.3
        prism_uz('trim', F, [(cu - hw, zb + 0.16), (cu + hw, zb + 0.16), (cu, zb + 0.16 + 0.55)], d, d + 0.18)

def win(F, cu, za, w, h, d, ped=False, cols=2, rows=(0.66,), sill=True):
    ua, ub = cu - w / 2, cu + w / 2
    surr(F, ua, ub, za, za + h, d, ped, sill)
    glazing_ = glaze(F, ua, ub, za, za + h, d, cols, rows)
    return (ua, ub, za, za + h)

def arch(F, cu, za, w, zt, d, m='wall', seg=4, glaze_it=True, rim=0.2):
    """Арочное окно: проём до zt, углы заполняются стеной, обрамление-архивольт."""
    r = w / 2; zs = zt - r; n = 2 * seg
    arc = lambda rr, dd: [F.p(cu + rr * math.cos(math.pi * k / n), dd, zs + rr * math.sin(math.pi * k / n)) for k in range(n + 1)]
    a0 = arc(r, d)
    face(m, [F.p(cu + r, d, zt)] + a0[:seg + 1], F.N())
    face(m, [F.p(cu - r, d, zt)] + a0[seg:], F.N())
    if glaze_it:
        g = d - 0.24 + 0.02
        ag = arc(r, g)
        face('glass', [F.p(cu - r, g, za), F.p(cu + r, g, za)] + ag, F.N())
        gg = g + 0.04
        def bar(u0, u1, z0, z1):
            face('trim', [F.p(u0, gg, z0), F.p(u1, gg, z0), F.p(u1, gg, z1), F.p(u0, gg, z1)], F.N())
        t = 0.05
        bar(cu - r, cu - r + t, za, zs); bar(cu + r - t, cu + r, za, zs)
        bar(cu - t / 2, cu + t / 2, za, zt - 0.02)
        bar(cu - r, cu + r, za, za + t)
        bar(cu - r, cu + r, zs - t, zs)
        bar(cu - r, cu + r, za + (zs - za) * 0.55, za + (zs - za) * 0.55 + t)
    # архивольт и обрамление
    a1 = arc(r + rim, d + 0.04)
    a0b = arc(r, d + 0.04)
    for k in range(n):
        face('trim', [a0b[k], a0b[k + 1], a1[k + 1], a1[k]], F.N())
    for u0, u1 in ((cu - r - rim, cu - r), (cu + r, cu + r + rim)):
        face('trim', [F.p(u0, d + 0.04, za - 0.1), F.p(u1, d + 0.04, za - 0.1), F.p(u1, d + 0.04, zs), F.p(u0, d + 0.04, zs)], F.N())
    box('trim', F, cu - 0.14, cu + 0.14, d, d + 0.12, zt + 0.02, zt + rim + 0.12)         # замковый камень
    box('trim', F, cu - r - rim - 0.1, cu + r + rim + 0.1, d, d + 0.14, za - 0.12, za)     # подоконник
    return (cu - r, cu + r, za, zt)

def balcony(F, cu, w, z, proj=0.7, h=0.85):
    u0, u1 = cu - w / 2, cu + w / 2
    box('trim', F, u0, u1, 0, proj, z - 0.28, z)
    box('trim', F, u0, u1, proj - 0.1, proj - 0.04, z, z + h)
    box('trim', F, u0 - 0.04, u1 + 0.04, proj - 0.14, proj, z + h, z + h + 0.1)
    for s in (u0, u1 - 0.06):
        box('trim', F, s, s + 0.06, 0.05, proj, z, z + h)

def balustrade(F, u0, u1, d, z, h=0.95, step=0.4):
    box('trim', F, u0, u1, d, d + 0.3, z, z + 0.14)
    box('trim', F, u0, u1, d - 0.02, d + 0.32, z + h - 0.12, z + h)
    u = u0 + 0.2
    while u < u1 - 0.1:
        box('trim', F, u - 0.07, u + 0.07, d + 0.08, d + 0.22, z + 0.14, z + h - 0.12, bottom=False)
        u += step
    for s in (u0, u1 - 0.22):
        box('trim', F, s, s + 0.22, d, d + 0.3, z + 0.14, z + h - 0.12)

def pilaster_s(F, cu, d, z0, z1, w=0.8, pr=0.12):
    box('trim', F, cu - w / 2, cu + w / 2, d, d + pr, z0, z1)
    box('trim', F, cu - w / 2 - 0.06, cu + w / 2 + 0.06, d, d + pr + 0.04, z0, z0 + 0.3)
    box('trim', F, cu - w / 2 - 0.06, cu + w / 2 + 0.06, d, d + pr + 0.04, z1 - 0.3, z1)

def dome(A, B, z, R, m='wall2'):
    c = M.p(A, B, 0)
    prof = [(R * math.cos(math.radians(a)), z + R * (math.sin(math.radians(a)) + 0.25)) for a in range(-14, 80, 16)]
    lathe(m, Vector((c.x, c.y, 0)), prof, 18)
    # низ — основание
    lathe('metal', Vector((c.x, c.y, 0)), [(R * 0.9, z), (R * 0.9, z + 0.25)], 12, cap=True)

def mast(A, B, z0, h, w=0.06):
    c = M.p(A, B, 0)
    beam('metal', Vector((c.x, c.y, z0)), Vector((c.x, c.y, z0 + h)), w)

# ------------------------------------------------------------------ плоские фасады крыльев
def plain_face(F, u0, u1, ztop, bays, mat='wall3', base=GY, f1=False, arched=False, ped=(), cor=True, rows=(True, True)):
    """Фасад крыла: этаж 2 (z 1…3), этаж 3 (z 4.6…6.6), карниз на ztop. bays — число осей."""
    L = u1 - u0; step = L / bays
    holes = []; deco = []
    for i in range(bays):
        cu = u0 + step * (i + 0.5)
        if f1:
            holes.append((cu - 0.55, cu + 0.55, -3.0, -1.1)); deco.append(('w1', cu))
        if rows[0]:
            if arched:
                holes.append((cu - 0.75, cu + 0.75, 0.5, 3.0)); deco.append(('arch', cu))
            else:
                holes.append((cu - 0.7, cu + 0.7, 0.9, 3.0)); deco.append(('w2', cu))
        if rows[1]:
            holes.append((cu - 0.65, cu + 0.65, 4.6, 6.6)); deco.append(('w3', cu))
    # арочные проёмы в стене: прямоугольник до вершины арки — как есть
    wall(F, u0, u1, base, ztop, 0, holes, m=mat)
    for kind, cu in deco:
        if kind == 'w1':
            surr(F, cu - 0.55, cu + 0.55, -3.0, -1.1, 0, sill=True); glaze(F, cu - 0.55, cu + 0.55, -3.0, -1.1, 0, 2, (0.66,))
        elif kind == 'w2':
            surr(F, cu - 0.7, cu + 0.7, 0.9, 3.0, 0); glaze(F, cu - 0.7, cu + 0.7, 0.9, 3.0, 0, 2, (0.68,))
        elif kind == 'arch':
            arch(F, cu, 0.5, 1.5, 3.0, 0, m=mat)
        else:
            i = round((cu - u0) / step - 0.5)
            surr(F, cu - 0.65, cu + 0.65, 4.6, 6.6, 0, ped=(i in ped)); glaze(F, cu - 0.65, cu + 0.65, 4.6, 6.6, 0, 2, (0.68,))
    if f1 or base < -3.5:
        band(F, u0, u1, 0, -0.35, -0.1, 0.1)
    band(F, u0, u1, 0, 3.5, 3.75, 0.09)
    if cor:
        band(F, u0 - 0.1, u1 + 0.1, 0, ztop, ztop + 0.3, 0.1)
        cornice(F, u0, u1, 0, ztop + 0.3)
    return F

# ================================================================== МОРСКОЙ ФАСАД (B = 35)
AC = 21.2                  # ось симметрии
FS = Fb(35.0, +1)

def build_sea():
    F = FS
    off = lambda o: AC + o
    # --- верхняя часть (этажи 2-3)
    holes = []
    arches = [-15.2, -13.2, -11.2, -7.6, -3.4, 0.0, 3.4, 7.6, 11.2, 13.2, 15.2]
    for o in arches:
        holes.append((off(o) - 0.75, off(o) + 0.75, 0.5, 3.0))
    f3 = [-15.0, -13.1, -11.1, 11.1, 13.1, 15.0]
    f3p = [-7.7, 7.7]
    for o in f3 + f3p:
        holes.append((off(o) - 0.65, off(o) + 0.65, 4.6, 6.6))
    bif = [-3.5, 0.0, 3.4]
    for o in bif:
        for s in (-0.5, 0.5):
            holes.append((off(o + s) - 0.4, off(o + s) + 0.4, 4.6, 6.6))
    wall(F, 4.2, 38.2, -0.2, ZC, 0, holes, m='wall')
    for o in arches:
        arch(F, off(o), 0.5, 1.5, 3.0, 0, m='wall')
    for o in f3 + f3p:
        win(F, off(o), 4.6, 1.3, 2.0, 0, ped=(o in f3p))
    for o in bif:
        for s in (-0.5, 0.5):
            arch(F, off(o + s), 4.6, 0.8, 6.6, 0, m='wall', rim=0.12)
    # --- цоколь: слева белый, справа гранит
    hl = [(6.0 - 0.55, 6.0 + 0.55, -3.0, -1.1), (7.9 - 0.55, 7.9 + 0.55, -3.0, -1.1), (9.9 - 0.55, 9.9 + 0.55, -3.0, -1.1),
          (12.4 - 0.6, 12.4 + 0.6, -4.0, -1.5)]
    wall(F, 4.2, 27.4, GR, -0.2, 0, hl, m='wall')
    hr = [(31.9 - 0.6, 31.9 + 0.6, -4.0, -1.6), (33.6 - 0.6, 33.6 + 0.6, -3.0, -1.1), (36.5 - 0.6, 36.5 + 0.6, -3.0, -1.1)]
    wall(F, 27.4, 38.2, GR, -0.2, 0, hr, m='stone')
    for cu, w in ((6.0, 1.1), (7.9, 1.1), (9.9, 1.1)):
        surr(F, cu - w / 2, cu + w / 2, -3.0, -1.1, 0); glaze(F, cu - w / 2, cu + w / 2, -3.0, -1.1, 0)
    for cu in (33.6, 36.5):
        surr(F, cu - 0.6, cu + 0.6, -3.0, -1.1, 0, sill=True); glaze(F, cu - 0.6, cu + 0.6, -3.0, -1.1, 0, 2, (0.66,))
    for cu, z0, z1 in ((12.4, -4.0, -1.5), (31.9, -4.0, -1.6)):
        g = -0.2
        face('wood', [F.p(cu - 0.6, g, z0), F.p(cu + 0.6, g, z0), F.p(cu + 0.6, g, z1), F.p(cu - 0.6, g, z1)], F.N())
        box('trim', F, cu - 0.8, cu + 0.8, 0, 0.1, z1, z1 + 0.18)
    # --- пояса и карниз
    band(F, 4.2, 38.2, 0, -0.35, -0.1, 0.12)
    band(F, 4.2, 38.2, 0, 3.4, 3.75, 0.10)
    band(F, 4.2, 38.2, 0, ZC, ZC + 0.3, 0.12)
    cornice(F, 4.2, 38.2, 0, ZC + 0.3)
    for u in (4.6, 37.8):
        pilaster_s(F, u, 0, -0.1, ZC, w=0.8)
    # --- фриз между этажами: плашки с надписью и рельефами
    box('trim', F, off(-5.0), off(5.0), 0, 0.05, 3.85, 4.3)
    for o in (-11.0, 11.0):
        box('trim', F, off(o) - 1.4, off(o) + 1.4, 0, 0.05, 3.85, 4.3)
    # --- балконы
    for o, w in ((-13.1, 4.8), (13.1, 4.8)):
        balcony(F, off(o), w, 4.35, 0.6)
    balcony(F, off(0), 5.2, 4.35, 0.9)
    for o in (-7.7, 7.7):
        balcony(F, off(o), 2.2, 4.35, 0.55)
    for o in (-13.2, 13.2):
        balcony(F, off(o), 3.0, 0.1, 0.55, h=0.8)
    # --- баллюстрада по карнизу
    balustrade(F, 4.2, 38.2, 0.5, ZR, 0.95)
    # --- надстройка (четвёртый этаж), отступ на 1.8 м
    FA = Fb(33.2, +1)
    holes = []
    for o in (-7.7, 7.7):
        holes.append((off(o) - 0.65, off(o) + 0.65, 9.7, 11.1))
    for o in (-3.5, 0.0, 3.4):
        for s in (-0.5, 0.5):
            holes.append((off(o + s) - 0.35, off(o + s) + 0.35, 9.7, 11.1))
    wall(FA, 11.8, 30.0, ZR - 0.2, ZA, 0, holes, m='wall')
    for o in (-7.7, 7.7):
        win(FA, off(o), 9.7, 1.3, 1.4, 0, cols=2, rows=(), sill=True)
    for o in (-3.5, 0.0, 3.4):
        for s in (-0.5, 0.5):
            win(FA, off(o + s), 9.7, 0.7, 1.4, 0, cols=1, rows=(), sill=False)
    band(FA, 11.8, 30.0, 0, ZA, ZA + 0.3, 0.12)
    cornice(FA, 11.8, 30.0, 0, ZA + 0.3, ext=0.45)
    balustrade(FA, off(-2.9), off(2.9), 0.55, ZR + 0.0, 0.0001) if False else None
    for u in (12.2, 29.6):
        pilaster_s(FA, u, 0, ZR, ZA, w=0.7, pr=0.1)

    # --- «аквариумный» гранитный куб перед фасадом (B 35 → 42.6, A 16.2 → 27.4)
    FB = Fb(42.6, +1)
    HZ = -0.2
    wall(FB, 16.2, 27.4, GR, HZ, 0, [(AC + o - 0.15, AC + o + 0.15, -1.5, -0.7) for o in (-4.7, -3.9, -3.0, -0.9, -0.1, 0.8, 2.8, 3.7, 4.7)], m='stone')
    for o in (-4.7, -3.9, -3.0, -0.9, -0.1, 0.8, 2.8, 3.7, 4.7):
        face('glass', [FB.p(AC + o - 0.15, -0.24, -1.5), FB.p(AC + o + 0.15, -0.24, -1.5), FB.p(AC + o + 0.15, -0.24, -0.7), FB.p(AC + o - 0.15, -0.24, -0.7)], FB.N())
    F2 = Fa(16.2, -1)          # северный бок куба
    wall(F2, 35.0, 42.6, GR, HZ, 0, [], m='stone')
    F3 = Fa(27.4, +1)          # южный бок
    wall(F3, 35.0, 42.6, GR, HZ, 0, [], m='stone')
    box('stone', M, 16.2, 27.4, 35.0, 42.6, HZ, HZ + 0.25)
    box('trim', M, 16.1, 27.5, 34.9, 42.7, HZ + 0.25, HZ + 0.4)
    # вывеска «АКВАРИУМ»: бирюзовая полоса-заменитель (буквы не делаем)
    for k in range(8):
        u = 18.0 + k * 1.15
        box('glass', FB, u, u + 0.7, 0.0, 0.1, 0.55, 1.6)

build_sea()

# ================================================================== ТОРЦЫ МОРСКОГО КРЫЛА
def build_ends():
    # северный торец: A = 4.2, B 14.1 → 35, смотрит на север
    F = Fa(4.2, -1)
    # u = B; сначала белая стена, окна арочные
    holes = []
    bays = [16.4, 19.0, 21.6, 24.2, 26.8, 29.4, 32.0]
    plain_face(F, 14.1, 35.0, ZC, 7, mat='wall', base=GR, f1=True, arched=True, ped=(1, 5), rows=(True, True))
    # южный торец: A = 38.2, B 13.1 → 35
    F = Fa(38.2, +1)
    plain_face(F, 13.1, 35.0, ZC, 7, mat='wall', base=GR, f1=True, arched=True, ped=(2, 4), rows=(True, True))
    # низкие торцы рукавов на B = 14.1 / 13.1
    plain_face(Fb(14.1, +1), 0.2, 4.2, ZC, 1, mat='wall', base=GR, f1=True, arched=True)
    plain_face(Fb(13.1, +1), 38.2, 42.1, ZC, 1, mat='wall', base=GR, f1=True, arched=True)

build_ends()

# ================================================================== РУКАВА И ДВОР
def build_arms():
    # северный рукав
    plain_face(Fa(0.2, -1), 1.3, 14.1, ZC, 4, mat='wall3', base=GY)               # с севера
    plain_face(Fb(1.3, -1), 0.2, 11.8, ZC, 4, mat='wall2', base=GY)                # восточный торец
    plain_face(Fa(11.8, +1), 1.3, 21.8, ZC, 6, mat='wall2', base=GY)               # во двор
    # южный рукав
    plain_face(Fa(30.0, -1), 0.2, 21.8, ZC, 6, mat='wall2', base=GY)               # во двор
    plain_face(Fb(0.2, -1), 30.0, 42.1, ZC, 4, mat='wall2', base=GY)               # восточный торец
    plain_face(Fa(42.1, +1), 0.2, 13.1, ZC, 4, mat='wall3', base=GY)               # с юга
    # южная стенка корпуса за рукавом (A=38.2 уже есть), склейка между B 13.1 и 21.8 внутри — не видна

build_arms()

def build_yard():
    F = Fb(21.8, -1)             # u = A, d наружу = в двор
    cx = 20.9
    holes = []
    f2 = [-7.4, -4.4, 4.2, 7.6]
    f3 = [-7.6, -4.4, 4.0, 7.4]
    f4 = [-7.6, -4.4, -0.5, 4.0, 7.4]
    for o in f2: holes.append((cx + o - 0.75, cx + o + 0.75, 1.0, 3.0))
    for o in f3: holes.append((cx + o - 0.7, cx + o + 0.7, 4.7, 6.7))
    for o in f4: holes.append((cx + o - 0.7, cx + o + 0.7, 9.7, 11.1))
    wall(F, 11.8, 30.0, GY, ZA, 0, holes, m='wall2')
    for o in f2:
        surr(F, cx + o - 0.75, cx + o + 0.75, 1.0, 3.0, 0); glaze(F, cx + o - 0.75, cx + o + 0.75, 1.0, 3.0, 0, 2, (0.68,))
        pilaster_s(F, cx + o - 1.4, 0, 0.0, 3.6, w=0.55, pr=0.1)
        pilaster_s(F, cx + o + 1.4, 0, 0.0, 3.6, w=0.55, pr=0.1)
    for o in f3:
        surr(F, cx + o - 0.7, cx + o + 0.7, 4.7, 6.7, 0); glaze(F, cx + o - 0.7, cx + o + 0.7, 4.7, 6.7, 0, 2, (0.68,))
    for o in f4:
        surr(F, cx + o - 0.7, cx + o + 0.7, 9.7, 11.1, 0, sill=True); glaze(F, cx + o - 0.7, cx + o + 0.7, 9.7, 11.1, 0, 2, (), )
    band(F, 11.8, 30.0, 0, 3.5, 3.75, 0.09)
    band(F, 11.8, 30.0, 0, 7.8, 8.05, 0.09)
    band(F, 11.8, 30.0, 0, ZA, ZA + 0.3, 0.1)
    cornice(F, 11.8, 30.0, 0, ZA + 0.3, ext=0.45)
    # --- портал
    hp = 1.2
    wall(F, cx - 3.3, cx + 3.3, GY, 3.5, hp, [(cx - 1.0, cx + 1.0, -0.8, 1.4), (cx - 1.1, cx + 1.1, 1.9, 3.3)], m='wall2')
    for s in (-1, 1):
        u0, u1 = sorted((cx + s * 3.3, cx + s * 3.3))
        face('wall2', [F.p(cx + s * 3.3, 0, GY), F.p(cx + s * 3.3, hp, GY), F.p(cx + s * 3.3, hp, 3.5), F.p(cx + s * 3.3, 0, 3.5)], F.U() * s)
        pilaster_s(F, cx + s * 2.95, hp, 0.0, 3.5, w=0.5, pr=0.1)
    g = hp - 0.22
    face('wood', [F.p(cx - 1.0, g, -0.8), F.p(cx + 1.0, g, -0.8), F.p(cx + 1.0, g, 1.4), F.p(cx - 1.0, g, 1.4)], F.N())
    box('trim', F, cx - 0.03, cx + 0.03, g, g + 0.05, -0.8, 1.4)
    glaze(F, cx - 1.1, cx + 1.1, 1.9, 3.3, hp, 4, (0.35, 0.7))
    surr(F, cx - 1.1, cx + 1.1, 1.9, 3.3, hp)
    box('metal', F, cx - 1.3, cx + 1.3, hp, hp + 1.0, 1.5, 1.6)        # козырёк
    box('trim', F, cx - 3.5, cx + 3.5, 0, hp + 0.3, 3.5, 3.9)           # карниз портала
    prism_uz('trim', F, [(cx - 3.6, 3.9), (cx + 3.6, 3.9), (cx, 5.5)], 0.3, hp + 0.3)
    prism_uz('wall2', F, [(cx - 3.2, 3.95), (cx + 3.2, 3.95), (cx, 5.2)], 0.3, hp + 0.34)
    box('wall2', F, cx - 3.0, cx + 3.0, 0, 0.7, 3.9, 7.3)                # верхний «ящик» над фронтоном
    box('trim', F, cx - 3.2, cx + 3.2, 0, 0.9, 7.3, 7.6)
    # --- круглая крыша аквариума во дворе
    c = M.p(20.9, 12.3, 0)
    lathe('wall2', Vector((c.x, c.y, 0)), [(8.4, GY), (8.4, -0.35), (8.0, -0.1), (0.2, 0.25)], 36, cap=True)
    lathe('trim', Vector((c.x, c.y, 0)), [(8.4, -0.45), (8.55, -0.4), (8.55, -0.1), (8.4, -0.05)], 36, cap=False)
    # шестигранный павильон-световой фонарь у входа
    pc = M.p(20.9, 17.8, 0)
    bm = bm_of('metal')
    hexa = [Vector((pc.x + 2.0 * math.cos(math.radians(60 * k)), pc.y + 2.0 * math.sin(math.radians(60 * k)), 0.1)) for k in range(6)]
    for k in range(6):
        j = (k + 1) % 6
        a, b = hexa[k], hexa[j]
        face('glass', [a, b, b + Vector((0, 0, 1.4)), a + Vector((0, 0, 1.4))], Vector((a.x + b.x - 2 * pc.x, a.y + b.y - 2 * pc.y, 0)))
        face('metal', [a + Vector((0, 0, 1.4)), b + Vector((0, 0, 1.4)), Vector((pc.x, pc.y, 2.0))], Vector((0, 0, 1)))
    # решётка по краю
    for k in range(0, 24):
        ang = math.pi * (0.1 + 0.8 * k / 23)
        bx = 9.1 * math.cos(ang); by = 9.1 * math.sin(ang)
        p = M.p(20.9 + bx * 0.0, 12.3, 0)
    # плита двора
    box('stone', M, 8.0, 34.0, -12.0, 22.0, GY - 1, -0.02) if False else None

build_yard()

# ================================================================== КРОВЛИ И КРЫШИ
def build_roofs():
    for a0, a1, b0, b1 in ((0.2, 11.8, 1.3, 14.1), (4.2, 11.8, 14.1, 21.8), (4.2, 38.2, 21.8, 35.0),
                           (30.0, 42.1, 0.2, 13.1), (30.0, 38.2, 13.1, 21.8)):
        box('roof', M, a0 + 0.05, a1 - 0.05, b0 + 0.05, b1 - 0.05, ZC + 0.3, ZR, bottom=False)
    box('roof', M, 11.9, 29.9, 21.9, 33.1, ZA, ZT, bottom=False)
    # парапет надстройки
    for (a0, a1, b0, b1) in ((11.8, 30.0, 33.0, 33.2), (11.8, 30.0, 21.8, 22.0), (11.8, 12.0, 21.8, 33.2), (29.8, 30.0, 21.8, 33.2)):
        box('trim', M, a0, a1, b0, b1, ZT, ZT + 0.35)
    # парапеты нижних кровель
    for (a0, a1, b0, b1) in ((0.2, 11.8, 1.3, 1.5), (0.2, 0.4, 1.3, 14.1), (30.0, 42.1, 0.2, 0.4), (41.9, 42.1, 0.2, 13.1),
                             (38.0, 38.2, 21.8, 35.0), (4.2, 4.4, 14.1, 35.0), (4.2, 38.2, 34.8, 35.0)):
        box('trim', M, a0, a1, b0, b1, ZR, ZR + 0.3)
    # надстройки на кровле: лестничная клетка слева, выступ справа
    box('wall', M, 4.8, 9.6, 22.5, 30.5, ZR, ZR + 2.4)
    box('trim', M, 4.7, 9.7, 22.4, 30.6, ZR + 2.4, ZR + 2.6)
    box('roof', M, 4.8, 9.6, 22.5, 30.5, ZR + 2.6, ZR + 2.62)
    box('wall', M, 31.0, 36.2, 24.0, 31.0, ZR, ZR + 1.9)
    box('trim', M, 30.9, 36.3, 23.9, 31.1, ZR + 1.9, ZR + 2.1)
    # колпаки-радомы
    dome(20.9, 27.2, ZT, 1.65)
    dome(33.6, 27.0, ZR + 2.1, 0.95)
    dome(7.2, 26.0, ZR + 2.6, 0.7)
    for (A, B, h) in ((15.0, 24.0, 5.5), (26.0, 30.0, 4.5), (35.0, 26.0, 4.0)):
        mast(A, B, ZT if 12 < A < 30 else ZR, h)
    beam('metal', M.p(16.0, 25.0, ZT + 0.35), M.p(26.0, 25.0, ZT + 0.35), 0.03)

build_roofs()

finish('ibss', __file__, tri_budget=25000)
