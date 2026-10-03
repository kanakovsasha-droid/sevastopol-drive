# Кинотеатр «Украина», Севастополь, ул. Ленина, 35 — модель с нуля.
#
#   blender -b --python models/kino_ukraina/build.py -- [glb]
#
# План — контур OSM way 92723124 (выпрямлен до прямоугольников), фасады — фото
# Викисклада (см. NOTES.md). Здание вытянуто с ЗЗС на ВЮВ: на запад (к ул. Ленина)
# смотрит портик с парными ионическими колоннами, на восток (к фонтану) — ротонда.
# Координаты плана: a — вдоль оси на ВОСТОК от лицевого ребра портика, b — поперёк,
# на ЮГ (вправо, если смотреть на восток). Ноль высоты — тротуар у ступеней входа.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

# ------------------------------------------------------------------ цвета
COL['wall']  = ((0.86, 0.80, 0.67), 0.92)    # тёплая светло-бежевая штукатурка
COL['wall2'] = ((0.72, 0.66, 0.54), 0.95)    # камень лоджий и ниш
COL['trim']  = ((0.93, 0.90, 0.81), 0.85)    # колонны, антаблемент, наличники
COL['stone'] = ((0.62, 0.58, 0.50), 0.92)    # рустованный подиум, ступени
COL['roof']  = ((0.52, 0.57, 0.53), 0.70)    # оцинковка серо-зелёная

MID = (140.3, 1347.2)                          # середина лицевого ребра (ребро 11 контура)
origin(*MID)
_ex, _ez = 0.9805, 0.1966
_l = math.hypot(_ex, _ez); _ex /= _l; _ez /= _l
E = Vector((_ex, -_ez))                        # ось здания на восток (плоскость Blender)
B = Vector((-_ez, -_ex))                       # поперёк, на юг

def P(a, b):
    return E * a + B * b

# ------------------------------------------------------------------ высоты
FL = 0.9                 # пол портика и лоджий над тротуаром у входа
CH, CD = 7.4, 0.9        # колонна целиком (с базой и капителью), диаметр
ZC = FL + CH             # 8.3 — верх капителей
Z_AR = ZC + 0.55         # верх архитрава
Z_FR = Z_AR + 0.55       # верх фриза
Z_CY = Z_FR + 0.12       # верх гусека
Z_DE = Z_CY + 0.20       # верх зубчиков
Z_EN = ZC + 1.70         # верх карниза портиков 10.0
EAVE = 10.1              # низ ската главной кровли
SLOPE = 0.25             # уклон главной кровли
RIDGE = 12.4
G = -3.0                 # стены западного блока уходят вниз: участок с уклоном
GM = -4.5                # ризалиты: по DEM земля тут на 2–3 м ниже входа
GE = -6.5                # восточный блок и ротонда: земля ниже входа на 4–5 м

A_BACK = 5.8             # задняя стена западного портика
A_EBACK = 51.2           # задняя стена восточной лоджии
A_END = 57.4             # восточный край контура
WH = 9.2                 # полуширина западного блока
EH = 9.05                # полуширина восточного блока
WG = 12.85               # полуширина боковых ризалитов

FW = Frame(P(0, 0), B, -E)                     # западный фасад: u = b, d наружу (на запад)
FE = Frame(P(A_EBACK, 0), B, E)                # восточная лоджия: d = a − 51.2

def fl(s, b0, a0=0.0):
    """Боковой фасад: s = +1 юг, −1 север; u = a, d наружу."""
    return Frame(P(a0, s * b0), E, B * s)

# ------------------------------------------------------------------ мелкие помощники
def circle(cu, cz, r, n=12):
    return [(cu + r * math.cos(2 * math.pi * k / n), cz + r * math.sin(2 * math.pi * k / n)) for k in range(n)]

def ionic(x, y, z0, nv, H=CH, D=CD, seg=10):
    """Ионическая колонна: база, ствол с энтазисом (trim_s), капитель с волютами."""
    R = D / 2
    nv = nv.normalized(); uv = Vector((-nv.y, nv.x))
    F0 = Frame(Vector((x, y)), uv, nv)
    hp = 0.62 * D
    box('trim', F0, -hp, hp, -hp, hp, z0, z0 + 0.14, bottom=False)
    lathe('trim', Vector((x, y, z0)), [(0.58 * D, 0.14), (0.58 * D, 0.23), (0.52 * D, 0.32), (R, 0.38)], seg, cap=False)
    top = H - 0.50
    prof = []
    for i in range(5):
        t = i / 4
        prof.append((R * (1 - 0.14 * t ** 1.5), 0.38 + (top - 0.38) * t))
    lathe('trim_s', Vector((x, y, z0)), prof, seg, cap=False)
    zc = z0 + top
    lathe('trim', Vector((x, y, zc)), [(0.86 * R, 0), (0.95 * R, 0.04), (1.08 * R, 0.10), (1.10 * R, 0.13)], seg, cap=False)
    box('trim', F0, -0.50 * D, 0.50 * D, -0.30 * D, 0.30 * D, zc + 0.12, zc + 0.34, bottom=False)
    for s in (-1, 1):
        prism_uz('trim', F0, circle(s * 0.58 * D, zc + 0.27, 0.21 * D, 10), -0.30 * D, 0.30 * D)
    box('trim', F0, -0.80 * D, 0.80 * D, -0.42 * D, 0.42 * D, zc + 0.40, zc + 0.50)

def dentil_run(F, ua, ub, dface, step=0.5):
    k = ua + 0.25
    while k < ub - 0.15:
        box('trim', F, k - 0.12, k + 0.12, dface, dface + 0.12, Z_CY, Z_DE, bottom=False)
        k += step

def ent_rect(F, u0, u1, d0, d1, sides='fle', roof=True, rz=0.03):
    """Антаблемент портика: архитрав, фриз, гусёк, зубчики, венчающий карниз.
    sides: f — фронт (d1), l — сторона u0, r — сторона u1 (зубчики)."""
    box('trim', F, u0, u1, d0, d1, ZC, Z_AR)
    box('wall', F, u0, u1, d0, d1, Z_AR, Z_FR)
    box('trim', F, u0 - 0.14, u1 + 0.14, d0 - 0.14, d1 + 0.14, Z_FR, Z_CY)
    box('trim', F, u0 - 0.12, u1 + 0.12, d0 - 0.12, d1 + 0.12, Z_CY, Z_DE)
    o = 0.52
    box('trim', F, u0 - o, u1 + o, d0 - o, d1 + o, Z_DE, Z_EN)
    if 'f' in sides:
        dentil_run(F, u0 - 0.12, u1 + 0.12, d1 + 0.12)
    if 'r' in sides:
        dentil_run(Frame(F.p(u1, d0, 0).xy, F.n, F.u), -0.12, d1 - d0 + 0.12, 0.12)
    if 'l' in sides:
        dentil_run(Frame(F.p(u0, d0, 0).xy, F.n, -F.u), -0.12, d1 - d0 + 0.12, 0.12)
    if roof:
        z = Z_EN + rz
        face('roof', [F.p(u0 - o, d0 - o, z), F.p(u1 + o, d0 - o, z), F.p(u1 + o, d1 + o, z), F.p(u0 - o, d1 + o, z)], UP)

def hd(cu, cd, r, n=24, a0=-90, a1=90):
    """Полукруг в плане (u, d): дуга по ходу вперёд от центра."""
    return [(cu + r * math.sin(math.radians(a0 + (a1 - a0) * k / n)),
             cd + r * math.cos(math.radians(a0 + (a1 - a0) * k / n))) for k in range(n + 1)]

def arc_slab(m, F, cu, cd, r0, r1, a0, a1, z0, z1, n=14):
    """Дуговая стена: внутренняя поверхность (r0) смотрит к центру, наружная (r1) — от него."""
    bm_ = bm_of(m)
    for k in range(n):
        t0, t1 = math.radians(a0 + (a1 - a0) * k / n), math.radians(a0 + (a1 - a0) * (k + 1) / n)
        pt = lambda r, t, z: F.p(cu + r * math.sin(t), cd + r * math.cos(t), z)
        tm = (t0 + t1) / 2
        rad = F.n * math.cos(tm) + F.u * math.sin(tm)
        radv = Vector((rad.x, rad.y, 0))
        face(m, [pt(r0, t0, z0), pt(r0, t1, z0), pt(r0, t1, z1), pt(r0, t0, z1)], -radv)
        face(m, [pt(r1, t0, z0), pt(r1, t1, z0), pt(r1, t1, z1), pt(r1, t0, z1)], radv)
        face(m, [pt(r0, t0, z1), pt(r0, t1, z1), pt(r1, t1, z1), pt(r1, t0, z1)], UP)

def arch_fill(F, cu, sill, spring, r, d, seg=8, reveal=0.24, ring=True):
    """Арочное окно: углы над дугой, стекло, переплёт, откос и архивольт.
    В стене на этом месте должен быть прямоугольный проём (cu−r, cu+r, sill, spring+r)."""
    arc = [(cu + r * math.cos(math.pi * k / seg), spring + r * math.sin(math.pi * k / seg)) for k in range(seg + 1)]
    hs = seg // 2
    face('wall', [F.p(cu + r, d, spring + r)] + [F.p(u, d, z) for u, z in arc[:hs + 1]], F.N())
    face('wall', [F.p(cu - r, d, spring + r)] + [F.p(u, d, z) for u, z in arc[hs:]], F.N())
    g = d - reveal + 0.02
    face('glass', [F.p(cu - r, g, sill), F.p(cu + r, g, sill)] + [F.p(u, g, z) for u, z in arc], F.N())
    for k in range(seg):
        (ua, za), (ub, zb) = arc[k], arc[k + 1]
        face('trim', [F.p(ua, d, za), F.p(ub, d, zb), F.p(ub, g, zb), F.p(ua, g, za)],
             F.p(cu, d, spring) - F.p((ua + ub) / 2, d, (za + zb) / 2))
    t = 0.05
    box('trim', F, cu - t, cu + t, g, g + 0.06, sill, spring + r)
    box('trim', F, cu - r, cu + r, g, g + 0.06, spring - t, spring + t)
    box('trim', F, cu - r - 0.12, cu + r + 0.12, d, d + 0.14, sill - 0.16, sill)
    if ring:
        ro = r + 0.20
        for k in range(seg):
            a0, a1 = math.pi * k / seg, math.pi * (k + 1) / seg
            oa = (cu + ro * math.cos(a0), spring + ro * math.sin(a0))
            ob = (cu + ro * math.cos(a1), spring + ro * math.sin(a1))
            (ua, za), (ub, zb) = arc[k], arc[k + 1]
            face('trim', [F.p(ua, d + 0.05, za), F.p(ub, d + 0.05, zb), F.p(ob[0], d + 0.05, ob[1]), F.p(oa[0], d + 0.05, oa[1])], F.N())
        box('trim', F, cu - ro, cu - r, d, d + 0.05, sill, spring)
        box('trim', F, cu + r, cu + ro, d, d + 0.05, sill, spring)

def arch_wall(F, u0, u1, z0, z1, centers, sill, spring, r, m='wall', d=0.0):
    holes = [(c - r, c + r, sill, spring + r) for c in centers]
    wall(F, u0, u1, z0, z1, d, holes, m=m)
    for c in centers:
        arch_fill(F, c, sill, spring, r, d)

def grille(F, ua, ub, za, zb, d, n=5):
    g = d - 0.24 + 0.1
    for k in range(n + 1):
        u = ua + (ub - ua) * k / n
        box('metal', F, u - 0.02, u + 0.02, g, g + 0.05, za, zb, bottom=False)

def panel(F, ua, ub, za, zb, d, m='wall2'):
    """Слепая филёнка: тёмная плоскость в рамке."""
    face(m, [F.p(ua, d + 0.03, za), F.p(ub, d + 0.03, za), F.p(ub, d + 0.03, zb), F.p(ua, d + 0.03, zb)], F.N())
    t = 0.09
    box('trim', F, ua - t, ub + t, d, d + 0.07, za - t, za)
    box('trim', F, ua - t, ub + t, d, d + 0.07, zb, zb + t)
    box('trim', F, ua - t, ua, d, d + 0.07, za, zb)
    box('trim', F, ub, ub + t, d, d + 0.07, za, zb)

def door(F, ua, ub, za, zb, d, panels=False):
    """Створ двери в проёме (стена с reveal 0.24 строится wall())."""
    g = d - 0.24 + 0.03
    face('wood', [F.p(ua, g, za), F.p(ub, g, za), F.p(ub, g, zb), F.p(ua, g, zb)], F.N())
    cu = (ua + ub) / 2
    box('trim', F, cu - 0.03, cu + 0.03, g, g + 0.05, za, zb)
    box('trim', F, ua, ub, g, g + 0.06, zb - 0.10, zb)

def balustrade(p0, p1, z0, h=0.85):
    """Балюстрада между двумя точками плана (Vector 2D): поручень и балясины."""
    L = (p1 - p0).length
    n = max(2, int(L / 0.24))
    a, b = Vector((p0.x, p0.y, z0 + h)), Vector((p1.x, p1.y, z0 + h))
    beam('trim', a, b, 0.20, 0.12)
    beam('trim', Vector((p0.x, p0.y, z0 + 0.10)), Vector((p1.x, p1.y, z0 + 0.10)), 0.20, 0.14)
    for k in range(n + 1):
        q = p0 + (p1 - p0) * (k / n)
        beam('trim', Vector((q.x, q.y, z0 + 0.14)), Vector((q.x, q.y, z0 + h - 0.06)), 0.10)

def rustic(F, u0, u1, z0, z1, d, row=0.95, joint=3.8):
    """Рустовка подиума: ряды плит, чуть выступающих из плоскости."""
    k = 0
    z = z0
    while z < z1 - 1e-3:
        h = min(row, z1 - z)
        u = u0 - (joint * 0.5 if k % 2 else 0)
        while u < u1 - 1e-3:
            ua, ub = max(u, u0), min(u + joint, u1)
            if ub - ua > 0.2:
                box('stone', F, ua + 0.02, ub - 0.02, d, d + 0.05, z + 0.02, z + h - 0.02, bottom=False)
            u += joint
        z += h; k += 1


PB = Z_EN + 0.7          # низ треугольника фронтона: над карнизом ещё невысокий аттик

def pediment(F, fa, r_l, cz_l, HW=5.55):
    """Фронтон на аттике с полукруглым лунетом; fa — наружная плоскость (d)."""
    sl = math.tan(math.radians(27))
    apex = PB + HW * sl
    prism_uz('wall', F, [(-HW, Z_EN), (HW, Z_EN), (HW, PB), (0, apex), (-HW, PB)], fa - 0.9, fa)
    bt, ov = 0.42, HW + 0.5
    for s in (-1, 1):
        prism_uz('trim', F, [(s * ov, PB), (0, apex + 0.22), (0, apex - bt + 0.22), (s * (ov - bt / sl), PB)], fa - 0.5, fa + 0.55)
    box('trim', F, -HW - 0.2, HW + 0.2, fa - 0.9, fa + 0.15, Z_EN, Z_EN + 0.12, bottom=False)
    arc = [(r_l * math.cos(math.pi * k / 18), cz_l + r_l * math.sin(math.pi * k / 18)) for k in range(19)]
    arc = [(u, z) for u, z in arc if z >= Z_EN + 0.14]
    face('wall2', [F.p(u, fa + 0.03, z) for u, z in arc], F.N())
    ro = r_l + 0.24
    for k in range(len(arc) - 1):
        (ua, za), (ub, zb) = arc[k], arc[k + 1]
        oa = (ua * ro / r_l, cz_l + (za - cz_l) * ro / r_l)
        ob = (ub * ro / r_l, cz_l + (zb - cz_l) * ro / r_l)
        face('trim', [F.p(ua, fa + 0.04, za), F.p(ub, fa + 0.04, zb), F.p(ob[0], fa + 0.04, ob[1]), F.p(oa[0], fa + 0.04, oa[1])], F.N())


# ------------------------------------------------------------------ буквы надписи
GLYPH = {   # штрихи в единичном квадрате: ('r', u0, u1, z0, z1) или ('l', u0, z0, u1, z1)
    'К': [('r', 0, .2, 0, 1), ('l', .2, .5, .66, 1), ('l', .3, .52, .66, 0)],
    'И': [('r', 0, .2, 0, 1), ('r', .5, .7, 0, 1), ('l', .12, .1, .58, .9)],
    'Н': [('r', 0, .2, 0, 1), ('r', .5, .7, 0, 1), ('r', .2, .5, .42, .58)],
    'О': [('r', 0, .2, 0, 1), ('r', .5, .7, 0, 1), ('r', .2, .5, 0, .16), ('r', .2, .5, .84, 1)],
    'У': [('l', .0, 1.0, .33, .42), ('l', .66, 1.0, .33, .42), ('r', .24, .42, 0, .45)],
    'Р': [('r', 0, .2, 0, 1), ('r', .2, .66, .84, 1), ('r', .2, .66, .42, .58), ('r', .5, .66, .56, .86)],
    'А': [('l', .0, .0, .33, 1), ('l', .66, .0, .33, 1), ('r', .18, .48, .3, .44)],
    'Т': [('r', 0, .7, .84, 1), ('r', .25, .45, 0, .84)],
    'Е': [('r', 0, .2, 0, 1), ('r', .2, .66, .84, 1), ('r', .2, .6, .42, .58), ('r', .2, .66, 0, .16)],
}

def letters(F, text, uc, d, z0, h, pitch):
    """Надпись по центру uc на плоскости фриза d (читается слева направо для зрителя)."""
    n = len(text)
    u = uc - pitch * (n - 1) / 2
    w = h * 0.7
    for ch in text:
        for st in GLYPH[ch]:
            if st[0] == 'r':
                _, a, b, c, e = st
                box('wood', F, u - w / 2 + a * w / 0.7, u - w / 2 + b * w / 0.7, d, d + 0.05, z0 + c * h, z0 + e * h, bottom=False)
            else:
                _, a, b, c, e = st
                p0 = F.p(u - w / 2 + a * w / 0.7, d + 0.025, z0 + b * h)
                p1 = F.p(u - w / 2 + c * w / 0.7, d + 0.025, z0 + e * h)
                beam('wood', p0, p1, h * 0.17, 0.05)
        u += pitch

# ================================================================== ЗАПАДНЫЙ ПОРТИК
def build_west():
    F = FW
    # стилобат и ступени
    box('stone', F, -9.6, 9.6, -A_BACK, 0.25, G, FL - 0.10)
    box('trim', F, -9.65, 9.65, -A_BACK, 0.30, FL - 0.10, FL, bottom=False)
    n, run = 4, 0.36
    rise = FL / n
    for i in range(n - 1):
        top = FL - rise * (i + 1)
        box('stone', F, -4.0, 4.0, 0.05, 0.30 + run * (i + 1), G, top, bottom=False)
    # колонны: парами в углах и по четвертям, две одиночные у двери
    xs = [-8.575, -7.425, -5.275, -4.125, -1.75, 1.75, 4.125, 5.275, 7.425, 8.575]
    for u in xs:
        d = -0.9 if abs(u) > 3 else -2.9
        x, y = F.p(u, d, 0).xy
        ionic(x, y, FL, F.n)
    for s in (-1, 1):                              # боковые колонны вдоль торцов портика
        for a in (2.05, 3.95, 5.1):
            x, y = F.p(s * 8.575, -a, 0).xy
            ionic(x, y, FL, F.u * s)
    # антаблемент: два боковых павильона и центральная часть
    ent_rect(F, 3.4, 9.35, -A_BACK, 0.35, 'flr')
    ent_rect(F, -9.35, -3.4, -A_BACK, 0.35, 'flr')
    ent_rect(F, -3.4, 3.4, -A_BACK, -2.45, 'f', rz=0.045)
    fa = -3.6
    pediment(F, fa, 2.3, Z_EN + 0.06)
    letters(F, 'КИНО', -6.4, 0.35, Z_AR + 0.075, 0.40, 0.95)
    letters(F, 'УКРАИНА', 0.0, -2.45, Z_AR + 0.075, 0.40, 0.88)
    letters(F, 'ТЕАТР', 6.4, 0.35, Z_AR + 0.075, 0.40, 0.95)
    # задняя стена с дверью и окнами
    d0 = -A_BACK
    door_h = (-0.95, 0.95, FL, FL + 3.1)
    holes = [door_h]
    wins = []
    for cu, za, w, h in ((0.0, FL + 3.95, 1.9, 1.9), (-3.2, FL + 3.95, 1.1, 1.9), (3.2, FL + 3.95, 1.1, 1.9),
                         (-3.2, FL + 0.55, 1.2, 1.6), (3.2, FL + 0.55, 1.2, 1.6)):
        holes.append((cu - w / 2, cu + w / 2, za, za + h)); wins.append((cu, za, w, h))
    wall(F, -WH, WH, G, EAVE, d0, holes)
    door(F, -0.95, 0.95, FL, FL + 3.1, d0)
    box('trim', F, -1.25, -0.95, d0, d0 + 0.14, FL, FL + 3.3)
    box('trim', F, 0.95, 1.25, d0, d0 + 0.14, FL, FL + 3.3)
    box('trim', F, -1.35, 1.35, d0, d0 + 0.16, FL + 3.1, FL + 3.5)
    box('trim', F, -1.6, 1.6, d0, d0 + 0.45, FL + 3.5, FL + 3.68)
    for cu, za, w, h in wins:
        window(F, cu, za, w, h, d0, 'plain', cols=2 if w > 1.5 else 1)
    for cu in (-3.2, 3.2):
        grille(F, cu - 0.6, cu + 0.6, FL + 0.55, FL + 2.15, d0, 4)
    for s in (-1, 1):                              # слепые филёнки на задних стенах павильонов
        panel(F, *sorted((s * 5.0, s * 8.4)), FL + 1.5, FL + 5.3, d0)
        panel(F, *sorted((s * 5.3, s * 6.6)), FL + 0.1, FL + 2.9, d0, 'wood')
    # треугольник главного щипца за фронтоном
    face('wall', [F.p(-WH, d0, EAVE), F.p(WH, d0, EAVE), F.p(0, d0, RIDGE)], F.N())
    # боковые стены павильонов (со стороны flank) — общие с боковыми фасадами, см. build_flanks

# ================================================================== БОКОВЫЕ ФАСАДЫ
def build_flanks():
    for s in (1, -1):
        # --- западный блок: стена павильона и стена зала с арочными окнами
        Fa = fl(s, WH)
        wall(Fa, 0, A_BACK, G, ZC, 0, [], m='wall')
        panel(Fa, 0.9, 4.9, FL + 1.3, FL + 5.5, 0)
        box('stone', Fa, 5.8, 11.2, 0, 0.12, G, FL + 0.55, bottom=False)
        arch_wall(Fa, A_BACK, 11.2, G, EAVE, [7.5, 9.6], FL + 1.5, FL + 5.2, 0.7)
        cornice(Fa, A_BACK, 11.2, 0, EAVE - 0.65, ext=0.5)
        # --- ризалит
        Fg = fl(s, WG)
        cs = [13.4, 17.7, 22.0, 26.3]
        arch_wall(Fg, 11.2, 28.5, GM, 8.0, cs, FL + 1.4, FL + 4.4, 0.75)
        box('stone', Fg, 11.2, 28.5, 0, 0.12, GM, FL + 0.55, bottom=False)
        for a in (11.45, 15.55, 19.85, 24.15, 28.25):
            box('trim', Fg, a - 0.28, a + 0.28, 0, 0.12, FL + 0.55, 7.55)
        band(Fg, 11.2, 28.5, 0, 7.15, 7.30, 0.10)
        cornice(Fg, 11.2, 28.5, 0, 7.95, ext=0.5)
        # торцы ризалита
        for a, sg in ((11.2, -1), (28.5, 1)):
            Fx = Frame(P(a, s * WH), B * s, E * sg)
            wall(Fx, 0, WG - WH, GM, 8.0, 0, [])
            cornice(Fx, -0.1, WG - WH + 0.1, 0, 7.95, ext=0.5)
            tri = [(WG - WH, 8.55), (0.0, 8.55), (0.0, 9.67)]
            face('wall', [Fx.p(u, 0, z) for u, z in tri], Fx.N())
        # кровля-навес ризалита, ската к стене зала
        z_at = lambda b: 8.55 + (WG + 0.5 - b) * 0.27
        pts = [(11.2 - 0.4, WG + 0.5), (28.5 + 0.4, WG + 0.5), (28.5 + 0.4, WH + 0.1), (11.2 - 0.4, WH + 0.1)]
        face('roof', [Vector((*P(a, s * b), z_at(b))) for a, b in pts], UP)
        # стена зала над ризалитом (до карниза)
        Fh = fl(s, WH)
        wall(Fh, 11.2, 28.5, 7.5, EAVE, 0, [])
        cornice(Fh, 11.2, 28.5, 0, EAVE - 0.65, ext=0.5)
        # --- восточный блок и стены лоджии
        Fe = fl(s, EH)
        cs = [31.0, 35.5, 40.0, 44.5, 48.5]
        arch_wall(Fe, 28.5, A_EBACK, GE, EAVE, cs, FL + 1.8, FL + 5.4, 0.8)
        box('stone', Fe, 28.5, A_END - 0.4, 0, 0.12, GE, FL + 0.55, bottom=False)
        cornice(Fe, 28.5, A_EBACK - 0.5, 0, EAVE - 0.65, ext=0.5)
        wall(Fe, A_EBACK, A_END - 0.4, GE, ZC, 0, [], m='wall2')
        panel(Fe, 53.0, 56.0, FL + 1.5, FL + 5.3, 0)

# ================================================================== КРОВЛЯ
def build_roof():
    a0, a1 = A_BACK - 0.3, A_EBACK + 0.1
    hw = 9.6
    z = lambda b: RIDGE - SLOPE * abs(b) - 0.0
    for s in (1, -1):
        face('roof', [Vector((*P(a0, 0), RIDGE)), Vector((*P(a1, 0), RIDGE)),
                      Vector((*P(a1, s * hw), z(hw))), Vector((*P(a0, s * hw), z(hw)))], UP)
    # подшивка свеса
    face('trim', [Vector((*P(a0, -hw), z(hw))), Vector((*P(a1, -hw), z(hw))), Vector((*P(a1, hw), z(hw))), Vector((*P(a0, hw), z(hw)))], -UP)
    beam('roof', Vector((*P(a0, 0), RIDGE + 0.05)), Vector((*P(a1, 0), RIDGE + 0.05)), 0.34, 0.18)
    # восточный щипец (за фронтоном)
    face('wall', [FE.p(-EH, 0, EAVE), FE.p(EH, 0, EAVE), FE.p(0, 0, RIDGE)], FE.N())
    # антенны на кровле: решётчатая мачта и тонкий шест
    base = Vector((*P(9.0, -1.2), RIDGE - 0.3))
    for k in range(3):
        ang = 2 * math.pi * k / 3 + 0.3
        p0 = base + Vector((math.cos(ang) * 0.55, math.sin(ang) * 0.55, 0))
        p1 = base + Vector((math.cos(ang) * 0.18, math.sin(ang) * 0.18, 11.0))
        beam('metal', p0, p1, 0.07)
    for zz in (2.0, 4.5, 7.0, 9.5):
        r = 0.55 - 0.37 * zz / 11.0
        ring = [base + Vector((math.cos(2 * math.pi * k / 3 + 0.3) * r, math.sin(2 * math.pi * k / 3 + 0.3) * r, zz)) for k in range(3)]
        for k in range(3):
            beam('metal', ring[k], ring[(k + 1) % 3], 0.04)
    beam('metal', Vector((*P(14.5, 1.0), RIDGE)), Vector((*P(14.5, 1.0), RIDGE + 7.5)), 0.08)

# ================================================================== ВОСТОЧНАЯ РОТОНДА
DC, RC, DB = 1.9, 3.4, 4.9          # центр дуги колонн, радиус дуги, линия колонн боковых пролётов

def build_east():
    F = FE
    # подиум: рустованный камень
    PD = 6.25
    box('stone', F, -10.3, 10.3, 0.0, PD, GE, FL - 0.18)
    box('trim', F, -10.4, 10.4, 0.0, PD + 0.1, FL - 0.18, FL)
    rustic(F, -10.3, 10.3, GE + 0.5, FL - 0.18, PD)
    for s in (-1, 1):
        Fs = Frame(F.p(s * 10.3, 0, 0).xy, F.n, F.u * s)
        rustic(Fs, 0, PD, GE + 0.5, FL - 0.18, 0, joint=3.1)
    # арочное окно подвала под центром
    arc = [(1.1 * math.cos(math.pi * k / 10), -2.9 + 1.1 * math.sin(math.pi * k / 10)) for k in range(11)]
    face('glass', [F.p(u, PD + 0.07, z) for u, z in arc], F.N())
    for k in range(10):
        (ua, za), (ub, zb) = arc[k], arc[k + 1]
        oa = (ua * 1.35 / 1.1, -2.9 + (za + 2.9) * 1.35 / 1.1)
        ob = (ub * 1.35 / 1.1, -2.9 + (zb + 2.9) * 1.35 / 1.1)
        face('trim', [F.p(ua, PD + 0.08, za), F.p(ub, PD + 0.08, zb), F.p(ob[0], PD + 0.08, ob[1]), F.p(oa[0], PD + 0.08, oa[1])], F.N())
    # колонны: боковые пролёты и дуга ротонды
    for u in (-8.6, -5.6, 5.6, 8.6):
        x, y = F.p(u, DB, 0).xy
        ionic(x, y, FL, F.n)
    for ang in (-62, -26, 26, 62):
        t = math.radians(ang)
        x, y = F.p(RC * math.sin(t), DC + RC * math.cos(t), 0).xy
        ionic(x, y, FL, F.n * math.cos(t) + F.u * math.sin(t))
    # антаблемент боковых пролётов
    ent_rect(F, 4.0, 9.35, -0.5, DB + 0.45, 'flr')
    ent_rect(F, -9.35, -4.0, -0.5, DB + 0.45, 'flr')
    # антаблемент ротонды (полукруглый барабан)
    ent_rect(F, -3.85, 3.85, -0.5, DC, '', roof=False)
    R0 = RC + 0.45
    prism_plan('trim', F, hd(0, DC, R0), ZC, Z_AR, top=False)
    prism_plan('wall', F, hd(0, DC, R0 - 0.02), Z_AR, Z_FR, top=False)
    prism_plan('trim', F, hd(0, DC, R0 + 0.14), Z_FR, Z_CY, top=False)
    prism_plan('trim', F, hd(0, DC, R0 + 0.12), Z_CY, Z_DE, top=False)
    prism_plan('trim', F, hd(0, DC, R0 + 0.52), Z_DE, Z_EN, top=True)
    face('trim', [F.p(u, d, ZC) for u, d in hd(0, DC, R0)], -UP)
    face('roof', [F.p(u, d, Z_EN + 0.06) for u, d in hd(0, DC, R0 + 0.45)], UP)
    for k in range(-19, 20):                       # зубчики по дуге
        t = math.radians(k * 180 / 40)
        r = R0 + 0.12
        Fd = Frame(F.p(r * math.sin(t), DC + r * math.cos(t), 0).xy, F.u * math.cos(t) - F.n * math.sin(t), F.n * math.cos(t) + F.u * math.sin(t))
        box('trim', Fd, -0.13, 0.13, 0, 0.12, Z_CY, Z_DE, bottom=False)
    # ниша ротонды: дуговая стена и возвраты к задней стене
    arc_slab('wall2', F, 0, DC, 2.3, 2.55, -90, 90, FL, ZC)
    for s in (-1, 1):
        box('wall2', F, *sorted((s * 2.3, s * 2.55)), 0.0, DC, FL, ZC, bottom=False)
    # задняя стена лоджий: камень, двери и медальоны в боковых пролётах
    doors = [(6.5, 8.1), (-8.1, -6.5)]
    holes = [(a, b, FL, FL + 3.1) for a, b in doors]
    wall(F, -EH, EH, GE, ZC, 0, holes, m='wall2')
    for a, b in doors:
        door(F, a, b, FL, FL + 3.1, 0)
        box('trim', F, a - 0.2, a, 0, 0.1, FL, FL + 3.3)
        box('trim', F, b, b + 0.2, 0, 0.1, FL, FL + 3.3)
        box('trim', F, a - 0.3, b + 0.3, 0, 0.18, FL + 3.1, FL + 3.4)
        cu = (a + b) / 2
        prism_uz('trim', F, circle(cu, FL + 5.0, 0.6, 14), 0.0, 0.07)
        prism_uz('wall2', F, circle(cu, FL + 5.0, 0.42, 14), 0.07, 0.10)
    # главный щипец с лунетом (стоит на барабане)
    pediment(F, DC, 2.9, 9.3)
    # балюстрады между колоннами
    def bal(p, q, z0=FL):
        balustrade(Vector(F.p(*p, 0).xy), Vector(F.p(*q, 0).xy), z0)
    bal((5.9, DB), (8.3, DB))
    bal((-8.3, DB), (-5.9, DB))
    cp = [(RC * math.sin(math.radians(a)), DC + RC * math.cos(math.radians(a))) for a in (-62, -26, 26, 62)]
    def shrink(p, q, k=0.45):
        dx, dz = q[0] - p[0], q[1] - p[1]; L = math.hypot(dx, dz)
        return (p[0] + dx / L * k, p[1] + dz / L * k), (q[0] - dx / L * k, q[1] - dz / L * k)
    for i in range(3):
        p, q = shrink(cp[i], cp[i + 1])
        bal(p, q)

build_west()
build_flanks()
build_roof()
build_east()

finish('kino_ukraina', __file__, 25000)
