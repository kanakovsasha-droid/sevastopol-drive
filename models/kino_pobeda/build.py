# Кинотеатр «Победа», Большая Морская, 13 — модель с нуля.
#
#   blender -b --python models/kino_pobeda/build.py -- [glb]
#
# План — контур OSM way 90822039 (выпрямлен до прямоугольников), фасад — фото
# Викисклада (см. NOTES.md). Ноль высоты — площадка у подножия розового цоколя
# по оси главного входа; сверху от неё лестницы поднимаются на террасу (T = 3.1).
# Рамка F: u — вдоль фасада на ЮГ-ЮГО-ВОСТОК (вправо, если смотреть на дом
# с улицы), d — наружу, на ЗАПАД-СЕВЕРО-ЗАПАД, к улице Большой Морской.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

# ------------------------------------------------------------------ цвета
COL['wall']  = ((0.95, 0.94, 0.90), 0.9)     # белёная штукатурка
COL['trim']  = ((0.97, 0.96, 0.93), 0.85)    # белые детали, балюстрады
COL['wall2'] = ((0.80, 0.64, 0.60), 0.95)    # розовый цоколь-подиум
COL['wall3'] = ((0.28, 0.29, 0.32), 0.9)     # тёмный камень щёк лестницы
COL['stone'] = ((0.74, 0.72, 0.69), 0.9)     # ступени, площадки
COL['roof']  = ((0.46, 0.27, 0.21), 0.8)     # красно-коричневая кровля

A, B = (-283.2, 961.0), (-287.9, 942.8)       # лицевое ребро портика контура OSM
X0, Z0 = (A[0] + B[0]) / 2, (A[1] + B[1]) / 2
origin(X0, Z0)

u_ = (W(*A) - W(*B)).normalized()
n_ = Vector((-u_.y, u_.x))
if n_.dot(W(-250, 950)) > 0:                  # наружу = на запад, к улице
    n_ = -n_
F = Frame(Vector((0, 0)), u_, n_)

GR = -6.0              # стены уходят вниз: участок с уклоном
T = 3.1                # терраса (верх розового подиума)
PH = 6.9               # высота столба с базой и капителью
ENT0 = T + PH          # низ антаблемента
ENT1 = ENT0 + 1.8      # верх карниза = низ фронтона
HALF = 9.4             # полуширина портика/зала
WALLZ = 9.0            # низ карниза крыльев
WE = 9.6               # верх карниза крыльев
BACK = -5.9            # задняя стена лоджии = фронт крыльев
REAR = -22.2           # задняя стена
UN, US = -30.2, 30.1   # торцы крыльев
PODU = 17.5            # полудлина подиума с террасой
SL = math.tan(math.radians(23.3))
OV = HALF + 0.35
APEX = ENT1 + OV * SL

def frm(u, d, uv, nv):
    return Frame(F.p(u, d, 0).xy, uv, nv)

# ================================================================== подиум и лестницы
def podium():
    # розовый цоколь с террасой наверху; передняя плоскость d = 0
    box('wall2', F, -PODU, PODU, BACK, -0.3, GR, T)
    box('wall2', F, -PODU, PODU, -0.3, 0.0, GR, 0.0)
    holes = [(-14.15, -12.25, 0.0, 2.3), (12.45, 14.35, 0.0, 2.3)]
    wall(F, -PODU, PODU, 0.0, T - 0.3, 0.0, holes, m='wall2', reveal=0.3)
    for (ua, ub, za, zb) in holes:           # двери в цоколе
        cu = (ua + ub) / 2
        g = -0.3 + 0.03
        face('wood', [F.p(ua, g, za), F.p(ub, g, za), F.p(ub, g, zb), F.p(ua, g, zb)], F.N())
        box('trim', F, cu - 0.03, cu + 0.03, g, g + 0.05, za, zb)
        box('trim', F, ua - 0.22, ua, -0.02, 0.1, za, zb + 0.22)
        box('trim', F, ub, ub + 0.22, -0.02, 0.1, za, zb + 0.22)
        box('trim', F, ua - 0.3, ub + 0.3, -0.02, 0.2, zb + 0.22, zb + 0.42)
    # решётчатое окошко под площадкой
    glazing(F, -0.8, 0.8, 0.45, 1.45, 0.0, cols=3, rows=(0.5,), reveal=0.3)
    surround(F, -0.8, 0.8, 0.45, 1.45, 0.0)
    # венчающий и нижний пояса
    band(F, -PODU - 0.1, PODU + 0.1, 0.0, T - 0.32, T, 0.2)
    band(F, -PODU - 0.05, PODU + 0.05, 0.0, 0.0, 0.35, 0.08, 'stone')
    # настил террасы
    box('stone', F, -PODU + 0.2, PODU - 0.2, BACK, -0.2, T, T + 0.05)
    # площадка у подножия и центральный марш вниз
    box('stone', F, -4.0, 4.0, 0.0, 2.5, GR, 0.0)
    nst, rise, run = 18, 0.155, 0.35
    for j in range(nst):
        top = -rise * (j + 1)
        box('stone', F, -4.0, 4.0, 2.5 + j * run, 2.5 + (j + 1) * run, GR, top)
    # щёки центрального марша — тёмный камень
    for s in (-1, 1):
        Fc = frm(s * 4.0, 0, F.n, F.u * s)
        zl = -rise * nst
        prism_uz('wall3', Fc, [(2.5, GR), (2.5 + nst * run + 0.2, GR), (2.5 + nst * run + 0.2, zl + 0.8),
                               (2.5, 0.85)], 0, 0.9)
    # боковые марши вдоль цоколя, поднимаются к краям террасы
    n2, r2 = 20, T / 20
    U0, U1 = 4.0, 10.7
    run2 = (U1 - U0) / n2
    for s in (-1, 1):
        for i in range(n2):
            ua = U0 + i * run2
            u0, u1 = sorted((s * ua, s * (ua + run2)))
            box('stone', F, u0, u1, 0.0, 2.0, GR if i == 0 else 0.0, r2 * (i + 1))
        Fs = frm(0, 0, F.u, F.n)
        pts = [(s * U0, 0.0), (s * U0, r2), (s * U1, T), (s * U1, 0.0)]
        prism_uz('trim', F, pts, 2.0, 2.22)
    return n2, r2, U0, U1

def balustrade(p0, p1, h=0.9, sp=0.3, w=0.11, posts=(True, True)):
    """Балюстрада по прямой между двумя точками основания."""
    n = max(1, round((p1 - p0).length / sp))
    for k in range(n + 1):
        q = p0 + (p1 - p0) * (k / n)
        beam('trim', q + UP * 0.12, q + UP * (h - 0.1), w)
    beam('trim', p0 + UP * h, p1 + UP * h, 0.2, 0.12)
    beam('trim', p0 + UP * 0.02, p1 + UP * 0.02, 0.18, 0.14)
    for q, on in ((p0, posts[0]), (p1, posts[1])):
        if on:
            beam('trim', q, q + UP * (h + 0.22), 0.26)

def railings(n2, r2, U0, U1):
    # край террасы вдоль всего подиума
    balustrade(F.p(-PODU + 0.2, -0.25, T), F.p(PODU - 0.2, -0.25, T))
    for s in (-1, 1):                          # торцы террасы
        balustrade(F.p(s * (PODU - 0.2), -0.25, T), F.p(s * (PODU - 0.2), BACK + 0.2, T), posts=(False, True))
        # наружный борт бокового марша
        balustrade(F.p(s * U0, 2.12, r2), F.p(s * U1, 2.12, T), h=0.9, sp=0.28)
    # ограждение площадки перед центральным маршем — только торцы щёк
    for s in (-1, 1):
        beam('trim', F.p(s * 4.45, 2.3, 0.0), F.p(s * 4.45, 2.3, 1.25), 0.3)

# ================================================================== портик
def pillar(cu, d=-1.9, z0=T):
    w = 1.1
    box('trim_s', F, cu - 0.75, cu + 0.75, d - 0.75, d + 0.75, z0, z0 + 0.28)
    box('trim_s', F, cu - 0.63, cu + 0.63, d - 0.63, d + 0.63, z0 + 0.28, z0 + 0.42)
    box('trim_s', F, cu - w / 2, cu + w / 2, d - w / 2, d + w / 2, z0 + 0.42, z0 + PH - 0.72)
    box('trim_s', F, cu - 0.63, cu + 0.63, d - 0.63, d + 0.63, z0 + PH - 0.72, z0 + PH - 0.5)
    box('trim_s', F, cu - 0.72, cu + 0.72, d - 0.72, d + 0.72, z0 + PH - 0.5, z0 + PH - 0.26)
    box('trim_s', F, cu - 0.82, cu + 0.82, d - 0.82, d + 0.82, z0 + PH - 0.26, z0 + PH)
    # каннелюры — выступающие рёбра (по две грани: на улицу и вглубь, и торцы)
    zb, zt = z0 + 0.42, z0 + PH - 0.72
    for k in (-0.37, -0.125, 0.125, 0.37):
        box('trim', F, cu + k - 0.06, cu + k + 0.06, d + w / 2, d + w / 2 + 0.04, zb, zt, bottom=False)
        box('trim', F, cu + k - 0.06, cu + k + 0.06, d - w / 2 - 0.04, d - w / 2, zb, zt, bottom=False)
        box('trim', F, cu + w / 2, cu + w / 2 + 0.04, d + k - 0.06, d + k + 0.06, zb, zt, bottom=False)
        box('trim', F, cu - w / 2 - 0.04, cu - w / 2, d + k - 0.06, d + k + 0.06, zb, zt, bottom=False)

def portico():
    for cu in (-8.375, -5.025, -1.675, 1.675, 5.025, 8.375):
        pillar(cu)
    # стены лоджии: задняя с дверью и окнами, боковые
    door = (-1.0, 1.0, T, T + 2.9)
    holes = [door, (-6.7, -5.5, T + 0.9, T + 3.1), (5.5, 6.7, T + 0.9, T + 3.1)]
    wall(F, -HALF, HALF, T, ENT0, BACK, holes)
    g = BACK - 0.22
    face('wood', [F.p(-1.0, g, T), F.p(1.0, g, T), F.p(1.0, g, T + 2.3), F.p(-1.0, g, T + 2.3)], F.N())
    face('glass', [F.p(-1.0, g, T + 2.3), F.p(1.0, g, T + 2.3), F.p(1.0, g, T + 2.9), F.p(-1.0, g, T + 2.9)], F.N())
    box('trim', F, -0.03, 0.03, g, g + 0.05, T, T + 2.9)
    box('trim', F, -1.0, 1.0, g, g + 0.07, T + 2.28, T + 2.34)
    box('trim', F, -1.28, -1.0, BACK, BACK + 0.1, T, T + 3.2)
    box('trim', F, 1.0, 1.28, BACK, BACK + 0.1, T, T + 3.2)
    box('trim', F, -1.28, 1.28, BACK, BACK + 0.1, T + 2.9, T + 3.2)
    for cu in (-6.1, 6.1):
        glazing(F, cu - 0.6, cu + 0.6, T + 0.9, T + 3.1, BACK, cols=2, rows=(0.5,))
        surround(F, cu - 0.6, cu + 0.6, T + 0.9, T + 3.1, BACK)
    box('trim', F, -2.9, -2.35, BACK, BACK + 0.04, T + 1.3, T + 2.0)           # памятная доска
    for s in (-1, 1):
        u0, u1 = sorted((s * 8.95, s * HALF))
        box('wall', F, u0, u1, BACK, -0.95, T, ENT0)
    # масса антаблемента и зала
    box('wall', F, -HALF, HALF, BACK, -1.0, ENT0, ENT1)
    band(F, -HALF, HALF, -1.0, ENT0, ENT0 + 0.5, 0.06)                         # архитрав
    cornice(F, -HALF, HALF, -1.0, ENT0 + 1.2, ext=0.45)
    band(F, -HALF + 0.3, HALF - 0.3, -1.0, ENT0 + 0.5, ENT0 + 0.56, 0.03)
    # надпись «КИНО-ТЕАТР ★ ПОБЕДА ★» на фризе — условные буквы
    slots = [('l', 10), ('g', 1), ('s', 1), ('g', 1), ('l', 6), ('g', 1), ('s', 1)]
    seq = ['L'] * 4 + ['H'] + ['L'] * 5 + ['G', 'S', 'G'] + ['L'] * 6 + ['G', 'S']
    x = -(len(seq) - 1) * 0.31
    for ch in seq:
        zc = ENT0 + 0.86
        if ch == 'L':
            box('metal', F, x - 0.08, x + 0.08, -1.0, -0.97, zc - 0.17, zc + 0.17, bottom=False)
        elif ch == 'H':
            box('metal', F, x - 0.1, x + 0.1, -1.0, -0.97, zc - 0.03, zc + 0.03, bottom=False)
        elif ch == 'S':
            box('metal', F, x - 0.09, x + 0.09, -1.0, -0.97, zc - 0.09, zc + 0.09, bottom=False)
        x += 0.62
    # фронтон
    prism_uz('wall', F, [(-HALF, ENT1), (HALF, ENT1), (0, ENT1 + HALF * SL)], -1.35, -1.0)
    bt = 0.5
    for s in (-1, 1):
        prism_uz('trim', F, [(s * OV, ENT1), (0, APEX), (0, APEX - bt), (s * (OV - bt / SL), ENT1)], -1.35, -0.55)
        prism_uz('trim', F, [(s * OV, ENT1 - 0.02), (0, APEX + 0.1), (0, APEX), (s * OV, ENT1 - 0.12)], -1.4, -0.45)
        k = 1
        while k * 0.56 < OV - 1.4:               # зубчики по скатам
            uu = s * k * 0.56
            zt = APEX - abs(uu) * SL - bt
            box('trim', F, uu - 0.1, uu + 0.1, -1.0, -0.62, zt - 0.2, zt + 0.02)
            k += 1

# ================================================================== зал и кровля
def hall():
    # объём зала за лоджией
    box('wall', F, -HALF, HALF, REAR, BACK - 0.02, GR, ENT1)
    # боковые карнизы вдоль зала и портика (рамки на сторонах)
    Ld = (-1.0) - REAR
    for Fh in (frm(-HALF, -1.0, -F.n, -F.u), frm(HALF, REAR, F.n, F.u)):
        cornice(Fh, 0, Ld, 0, ENT0 + 1.2, ext=0.45)
    # кровля двухскатная вдоль оси улица—двор
    zr = ENT1 + 0.04
    rz = APEX + 0.14
    ov = OV + 0.06
    d0, d1 = -1.4, REAR - 0.45
    for s in (-1, 1):
        face('roof', [F.p(s * ov, d0, zr), F.p(0, d0, rz), F.p(0, d1, rz), F.p(s * ov, d1, zr)], F.U() * s + UP)
    face('trim', [F.p(-ov, d0, zr - 0.02), F.p(ov, d0, zr - 0.02), F.p(ov, d1, zr - 0.02), F.p(-ov, d1, zr - 0.02)], -UP)
    beam('roof', F.p(0, d0, rz + 0.04), F.p(0, d1, rz + 0.04), 0.3, 0.16)
    # задний фронтон зала
    prism_uz('wall', F, [(-HALF, ENT1), (HALF, ENT1), (0, ENT1 + HALF * SL)], REAR - 0.35, REAR)
    for s in (-1, 1):
        prism_uz('trim', F, [(s * ov, ENT1), (0, APEX + 0.05), (0, APEX - 0.25), (s * (ov - 0.25 / SL), ENT1)], REAR - 0.5, REAR + 0.15)
    # трубы и мачта на кровле
    def zroof(uu): return zr + (rz - zr) * (1 - abs(uu) / ov)
    for uu, dd in ((-6.6, -9.5), (6.6, -12.5)):
        z0 = zroof(abs(uu) + 0.5) - 0.3
        chimney(F, uu, dd, z0, zroof(uu) + 1.2)
    base = F.p(0, -7.5, rz)
    beam('metal', base, base + UP * 7.0, 0.12)
    for hz, w in ((3.6, 1.8), (5.0, 1.4), (6.4, 1.0)):
        beam('metal', base + UP * hz - F.U() * w / 2, base + UP * hz + F.U() * w / 2, 0.06)
    for sgn in (-1, 1):
        for hz in (3.6, 5.0):
            box('metal', F, sgn * 0.8 - 0.1, sgn * 0.8 + 0.1, -7.75, -7.4, base.z + hz - 0.3, base.z + hz + 0.3)

# ================================================================== крылья
def arch_niche(Fr, cu, r, sill, zs, d, reveal=0.25):
    """Арочная ниша с полукруглым окном (по образцу больницы)."""
    seg = 10
    arc = [(cu + r * math.cos(math.pi * k / seg), zs + r * math.sin(math.pi * k / seg)) for k in range(seg + 1)]
    hs = seg // 2
    face('wall', [Fr.p(cu + r, d, zs + r)] + [Fr.p(u, d, z) for u, z in arc[:hs + 1]], Fr.N())
    face('wall', [Fr.p(cu - r, d, zs + r)] + [Fr.p(u, d, z) for u, z in arc[hs:]], Fr.N())
    dd = d - reveal
    for k in range(seg):
        (ua, za), (ub, zb) = arc[k], arc[k + 1]
        face('trim', [Fr.p(ua, d, za), Fr.p(ub, d, zb), Fr.p(ub, dd, zb), Fr.p(ua, dd, za)],
             Fr.p(cu, d, zs) - Fr.p((ua + ub) / 2, d, (za + zb) / 2))
    face('wall', [Fr.p(cu - r, dd, sill), Fr.p(cu + r, dd, sill), Fr.p(cu + r, dd, zs), Fr.p(cu - r, dd, zs)], Fr.N())
    # полукруглое окно в верхней части ниши
    ri = r - 0.2
    arc2 = [(cu + ri * math.cos(math.pi * k / seg), zs + 0.05 + ri * math.sin(math.pi * k / seg)) for k in range(seg + 1)]
    gd = dd + 0.03
    face('glass', [Fr.p(cu - ri, gd, zs + 0.05), Fr.p(cu + ri, gd, zs + 0.05)] + [Fr.p(u, gd, z) for u, z in arc2], Fr.N())
    for dx in (-ri / 2, 0, ri / 2):
        top = zs + 0.05 + math.sqrt(max(ri * ri - dx * dx, 0))
        box('trim', Fr, cu + dx - 0.025, cu + dx + 0.025, gd, gd + 0.05, zs + 0.05, top)
    box('trim', Fr, cu - ri, cu + ri, gd, gd + 0.05, zs + 0.02, zs + 0.09)
    # архивольт на стене
    ro = r + 0.22
    for k in range(seg):
        oa = (cu + ro * math.cos(math.pi * k / seg), zs + ro * math.sin(math.pi * k / seg))
        ob = (cu + ro * math.cos(math.pi * (k + 1) / seg), zs + ro * math.sin(math.pi * (k + 1) / seg))
        ia, ib = arc[k], arc[k + 1]
        face('trim', [Fr.p(ia[0], d + 0.06, ia[1]), Fr.p(ib[0], d + 0.06, ib[1]), Fr.p(ob[0], d + 0.06, ob[1]), Fr.p(oa[0], d + 0.06, oa[1])], Fr.N())
    box('trim', Fr, cu - ro, cu - r, d, d + 0.06, sill, zs)
    box('trim', Fr, cu + r, cu + ro, d, d + 0.06, sill, zs)

def wings():
    # ---- фасад на улицу: фронты крыльев
    for s in (-1, 1):
        ua, ub = (UN, -HALF) if s < 0 else (HALF, US)
        holes = []
        cus = [s * 19.6, s * 23.9, s * 28.2]
        for cu in cus:
            holes.append((cu - 0.75, cu + 0.75, T + 1.2, T + 4.2))
        rN = 0.9
        nic = s * 14.0
        holes.append((nic - rN, nic + rN, T + 0.5, T + 1.9 + rN))
        wall(F, ua, ub, T, WALLZ, BACK, holes)
        for cu in cus:
            window(F, cu, T + 1.2, 1.5, 3.0, BACK)
        arch_niche(F, nic, rN, T + 0.5, T + 1.9, BACK)
        # цоколь крыла ниже террасы — розовый
        u0, u1 = sorted((s * PODU, s * US if s > 0 else UN))
        box('wall2', F, u0, u1, BACK - 0.3, BACK, GR, T)
        band(F, ua, ub, BACK, T - 0.02, T + 0.18, 0.12, 'trim')
        cornice(F, ua, ub, BACK, WALLZ, ext=0.5)
    # ---- кровли крыльев (низкий вальм)
    hip_roof(F, UN, -HALF, BACK, REAR, WE, 1.7, ov=0.55, hip0=True, hip1=False)
    hip_roof(F, HALF, US, BACK, REAR, WE, 1.7, ov=0.55, hip0=False, hip1=True)
    # ---- торцы
    FnE = frm(UN, BACK, -F.n, -F.u)            # северный торец: u идёт вглубь
    Len = BACK - REAR
    holes = [(cu - 0.75, cu + 0.75, T + 1.2, T + 4.2) for cu in (4.5, 11.7)]
    wall(FnE, 0, Len, GR, WALLZ, 0, holes)
    for cu in (4.5, 11.7): window(FnE, cu, T + 1.2, 1.5, 3.0, 0)
    cornice(FnE, 0, Len, 0, WALLZ, ext=0.5)
    box('stone', FnE, 0, Len, -0.3, 0.05, GR, 1.0)
    FsE = frm(US, REAR, F.n, F.u)               # южный торец
    wall(FsE, 0, Len, GR, WALLZ, 0, holes)
    for cu in (4.5, 11.7): window(FsE, cu, T + 1.2, 1.5, 3.0, 0)
    cornice(FsE, 0, Len, 0, WALLZ, ext=0.5)
    box('stone', FsE, 0, Len, -0.3, 0.05, GR, 1.0)
    # ---- боковые стены зала над крышами крыльев (простые)
    # ---- тыльный фасад
    Fr = Frame(F.p(US, REAR, 0).xy, -F.u, -F.n)
    Lr = US - UN
    rw = [3.5, 9.0, 14.5, 19.0]                  # окна южного крыла
    holes = [(cu - 0.75, cu + 0.75, T + 1.2, T + 4.2) for cu in rw]
    wall(Fr, 0, 20.7, GR, WALLZ, 0, holes)
    for cu in rw: window(Fr, cu, T + 1.2, 1.5, 3.0, 0)
    cornice(Fr, 0, 20.7, 0, WALLZ, ext=0.5)
    nw = [Lr - 3.5, Lr - 9.0, Lr - 14.5, Lr - 19.0]
    holes = [(cu - 0.75, cu + 0.75, T + 1.2, T + 4.2) for cu in nw]
    wall(Fr, Lr - 20.7, Lr, GR, WALLZ, 0, holes)
    for cu in nw: window(Fr, cu, T + 1.2, 1.5, 3.0, 0)
    cornice(Fr, Lr - 20.7, Lr, 0, WALLZ, ext=0.5)
    # тыл зала (над и по бокам пристройки)
    wall(Fr, 20.7, Lr - 20.7, GR, ENT1, 0, [])
    # низкая пристройка (кинобудка/сцена) на тыльной стороне зала: u −9.6…4.0
    box('wall', F, -9.6, 4.0, REAR - 2.64, REAR + 0.02, GR, WE - 0.4)
    box('trim', F, -9.8, 4.2, REAR - 2.84, REAR - 2.44 + 0.6, WE - 0.4, WE - 0.1)
    box('roof', F, -9.8, 4.2, REAR - 2.84, REAR + 0.02, WE - 0.1, WE + 0.06)

# ================================================================== сборка
n2, r2, U0, U1 = podium()
railings(n2, r2, U0, U1)
portico()
hall()
wings()

finish('kino_pobeda', __file__, tri_budget=25000)
