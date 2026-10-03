# Гимназия №1 им. А. С. Пушкина (ул. Суворова, 10, Севастополь) — модель с нуля.
#
#   blender -b --python models/gimnazia1/build.py -- [glb]
#
# План — контур OSM w92718646, выпрямленный до прямоугольной сетки (s, t):
#   s — от северного торца вдоль восточного фасада (на юг, ул. Суворова),
#   t — от восточного фасада на запад. Начало сетки — СВ угол (точка 9 контура).
# Три крыла вокруг двора, открытого на запад: восточное (s 0..66.8, t 0..14.3),
# северное (s 3.7..14.5, t 14..55.9) и южное (s 51..65, t 14..55.5).
# Фасады и портик — по панорамам Яндекса 2020 года (см. NOTES.md).
# Ноль высоты — тротуар у крыльца северного портика (ул. Марата).
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

A = (0.14665713, 0.98918739)           # вдоль восточного фасада (на юг), в координатах мира
B = (-0.98918739, 0.14665713)          # от восточного фасада на запад
P9 = (-185.7, 732.2)

def ST(s, t):
    return (P9[0] + A[0] * s + B[0] * t, P9[1] + A[1] * s + B[1] * t)

X0, Z0 = ST(0, 7.0)                    # середина северного портика у крыльца
origin(X0, Z0)

COL['wall'] = ((0.87, 0.82, 0.65), 0.9)       # тёплый светлый камень верхних этажей
COL['wall2'] = ((0.91, 0.89, 0.81), 0.9)      # рустованный белёный низ
COL['wall3'] = ((0.66, 0.62, 0.53), 0.95)     # швы руста
COL['trim'] = ((0.94, 0.92, 0.86), 0.85)
COL['stone'] = ((0.52, 0.47, 0.41), 0.9)      # цоколь
COL['roof'] = ((0.48, 0.30, 0.27), 0.8)

GROUND = -3.0
ZP = 0.9          # верх цоколя
Z1, Z2, Z3 = 4.0, 9.0, 13.2     # междуэтажные пояса и низ венчающего карниза
ZT = Z3 + 0.6     # верх карниза
ZPAR = ZT + 0.7   # верх парапета


def mk(s, t, u, n):
    """Рамка фасада: начало (s,t), вдоль стены u=(ds,dt), наружу n=(ds,dt) — единичные векторы сетки."""
    o = W(*ST(s, t))
    ub = W(*ST(s + u[0], t + u[1])) - o
    nb = W(*ST(s + n[0], t + n[1])) - o
    return Frame(o, ub, nb)

NORTH, SOUTH, EAST, WEST = (-1, 0), (1, 0), (0, -1), (0, 1)      # направления (ds, dt)


# ------------------------------------------------------------------ примитивы
def strip(F, u0, u1, z0, z1, d, m='trim'):
    face(m, [F.p(u0, d, z0), F.p(u1, d, z0), F.p(u1, d, z1), F.p(u0, d, z1)], F.N())

def wall_lvl(F, u0, u1, z0, z1, d, holes, m='wall'):
    """Стена одного яруса полосами между проёмами (в отличие от kit.wall не плодит сетку)."""
    prev = u0
    for ua, ub, za, zb in sorted(holes):
        if ua > prev + 1e-6: strip(F, prev, ua, z0, z1, d, m)
        if za > z0 + 1e-6: strip(F, ua, ub, z0, za, d, m)
        if zb < z1 - 1e-6: strip(F, ua, ub, zb, z1, d, m)
        prev = ub
    if u1 > prev + 1e-6: strip(F, prev, u1, z0, z1, d, m)

def reveals(F, ua, ub, za, zb, d, top=True, r=0.24):
    e = d - r
    face('trim', [F.p(ua, d, za), F.p(ua, e, za), F.p(ua, e, zb), F.p(ua, d, zb)], F.U())
    face('trim', [F.p(ub, d, za), F.p(ub, e, za), F.p(ub, e, zb), F.p(ub, d, zb)], -F.U())
    face('trim', [F.p(ua, d, za), F.p(ub, d, za), F.p(ub, e, za), F.p(ua, e, za)], UP)
    if top:
        face('trim', [F.p(ua, d, zb), F.p(ub, d, zb), F.p(ub, e, zb), F.p(ua, e, zb)], -UP)

def sash(F, ua, ub, za, zb, d, rows=(0.68,), cols=2, r=0.24):
    """Стекло в глубине проёма и тонкий переплёт (плоские планки)."""
    g = d - r + 0.02
    face('glass', [F.p(ua, g, za), F.p(ub, g, za), F.p(ub, g, zb), F.p(ua, g, zb)], F.N())
    f, t = g + 0.03, 0.06
    strip(F, ua, ua + t, za, zb, f); strip(F, ub - t, ub, za, zb, f)
    strip(F, ua, ub, za, za + t, f); strip(F, ua, ub, zb - t, zb, f)
    for c in range(1, cols):
        u = ua + (ub - ua) * c / cols
        strip(F, u - t / 2, u + t / 2, za, zb, f)
    for q in rows:
        z = za + (zb - za) * q
        strip(F, ua, ub, z - t / 2, z + t / 2, f)

def rect_win(F, cu, w, za, zb, d, brackets=False, rows=(0.68,), cols=2):
    ua, ub = cu - w / 2, cu + w / 2
    reveals(F, ua, ub, za, zb, d)
    sash(F, ua, ub, za, zb, d, rows, cols)
    j = 0.16
    strip(F, ua - j, ua, za, zb + j, d + 0.025); strip(F, ub, ub + j, za, zb + j, d + 0.025)
    strip(F, ua, ub, zb, zb + j, d + 0.025)
    box('trim', F, ua - j - 0.04, ub + j + 0.04, d, d + 0.12, za - 0.12, za, bottom=False)
    if brackets:
        for u in (ua - 0.02, ub - 0.18):
            box('trim', F, u, u + 0.2, d, d + 0.1, za - 0.4, za - 0.12, bottom=False)
    return (ua - 0.0, ub + 0.0, za, zb)

def arch_win(F, cu, w, sill, zs, d, seg=6):
    """Окно с полукруглым верхом: sill — подоконник, zs — пята арки."""
    r = w / 2
    ua, ub, zt = cu - r, cu + r, zs + r
    arc = [(cu + r * math.cos(math.pi * k / seg), zs + r * math.sin(math.pi * k / seg)) for k in range(seg + 1)]
    reveals(F, ua, ub, sill, zs, d, top=False)
    e = d - 0.24
    for k in range(seg):                                   # свод откоса
        (u1, z1), (u2, z2) = arc[k], arc[k + 1]
        face('trim', [F.p(u1, d, z1), F.p(u2, d, z2), F.p(u2, e, z2), F.p(u1, e, z1)],
             F.p(cu, d, zs) - F.p((u1 + u2) / 2, d, (z1 + z2) / 2))
    hs = seg // 2
    face('wall', [F.p(ub, d, zt)] + [F.p(u, d, z) for u, z in arc[:hs + 1]], F.N())
    face('wall', [F.p(ua, d, zt)] + [F.p(u, d, z) for u, z in arc[hs:]], F.N())
    g = e + 0.02
    face('glass', [F.p(ua, g, sill), F.p(ub, g, sill)] + [F.p(u, g, z) for u, z in arc], F.N())
    f, t = g + 0.03, 0.06
    strip(F, ua, ua + t, sill, zs, f); strip(F, ub - t, ub, sill, zs, f)
    strip(F, cu - t / 2, cu + t / 2, sill, zt, f)
    strip(F, ua, ub, zs - t / 2, zs + t / 2, f); strip(F, ua, ub, sill, sill + t, f)
    ro = r + 0.2                                           # архивольт
    for k in range(seg):
        a0, a1 = math.pi * k / seg, math.pi * (k + 1) / seg
        face('trim', [F.p(cu + r * math.cos(a0), d + 0.04, zs + r * math.sin(a0)),
                      F.p(cu + ro * math.cos(a0), d + 0.04, zs + ro * math.sin(a0)),
                      F.p(cu + ro * math.cos(a1), d + 0.04, zs + ro * math.sin(a1)),
                      F.p(cu + r * math.cos(a1), d + 0.04, zs + r * math.sin(a1))], F.N())
    strip(F, ua - 0.2, ua, sill, zs, d + 0.04); strip(F, ub, ub + 0.2, sill, zs, d + 0.04)
    box('trim', F, cu - 0.16, cu + 0.16, d, d + 0.14, zt, zt + 0.34, bottom=False)       # замковый камень
    box('trim', F, ua - 0.3, ub + 0.3, d, d + 0.12, sill - 0.13, sill, bottom=False)     # подоконник
    return (ua, ub, sill, zt)

def door(F, cu, w, h, d, steps=3, rise=0.3, reach=1.2, z0=ZP):
    ZP_ = z0
    ua, ub = cu - w / 2, cu + w / 2
    reveals(F, ua, ub, ZP_, ZP_ + h, d)
    g = d - 0.2
    face('wood', [F.p(ua, g, ZP_), F.p(ub, g, ZP_), F.p(ub, g, ZP_ + h * 0.78), F.p(ua, g, ZP_ + h * 0.78)], F.N())
    face('glass', [F.p(ua, g, ZP_ + h * 0.78), F.p(ub, g, ZP_ + h * 0.78), F.p(ub, g, ZP_ + h), F.p(ua, g, ZP_ + h)], F.N())
    strip(F, cu - 0.03, cu + 0.03, ZP_, ZP_ + h * 0.78, g + 0.02, 'trim')
    box('trim', F, ua - 0.45, ua, d, d + 0.16, ZP_, ZP_ + h + 0.3, bottom=False)       # пилястры-обрамление
    box('trim', F, ub, ub + 0.45, d, d + 0.16, ZP_, ZP_ + h + 0.3, bottom=False)
    box('trim', F, ua - 0.6, ub + 0.6, d, d + 0.34, ZP_ + h + 0.3, ZP_ + h + 0.62, bottom=False)
    for i in range(steps):
        box('stone', F, ua - 0.5 - i * 0.12, ub + 0.5 + i * 0.12, d, d + reach * (steps - i) / steps,
            ZP_ - rise * (i + 1) - 2.0 * (i == steps - 1), ZP_ - rise * i, bottom=False)
    return (ua, ub, ZP_, ZP_ + h)

def disc(F, cu, z, r, d, n=12):
    ring = [(cu + r * math.cos(2 * math.pi * k / n), z + r * math.sin(2 * math.pi * k / n)) for k in range(n)]
    face('trim', [F.p(u, d, zz) for u, zz in ring], F.N())
    ring2 = [(cu + r * 0.62 * math.cos(2 * math.pi * k / n), z + r * 0.62 * math.sin(2 * math.pi * k / n)) for k in range(n)]
    face('metal', [F.p(u, d + 0.03, zz) for u, zz in ring2], F.N())



def column(base, H, D, seg=12):
    """Упрощённая коринфская колонна: ствол (дальний уровень) гладкий, база и капитель — мелкая деталь."""
    R = D / 2
    F0 = Frame(Vector((base.x, base.y)), Vector((1, 0)), Vector((0, 1)))
    k = D / 1.1
    box('trim', F0, -0.77 * k, 0.77 * k, -0.77 * k, 0.77 * k, base.z, base.z + 0.2 * k, bottom=False)
    lathe('trim', base, [(0.74 * k, 0.2 * k), (0.78 * k, 0.27 * k), (0.70 * k, 0.37 * k), (0.62 * k, 0.45 * k),
                         (0.66 * k, 0.52 * k), (0.585 * k, 0.60 * k)], seg, cap=False)
    cap_h = 1.17 * D
    zs0, zs1 = 0.60 * k, H - cap_h
    prof = [(R - R * 0.15 * (i / 4) ** 1.8, zs0 + (zs1 - zs0) * i / 4) for i in range(5)]
    lathe('trim_s', base, prof, seg, cap=False)
    rt = R * 0.85
    zb1 = H - 0.17 * D
    lathe('trim', base, [(rt + 0.04, zs1 - 0.06), (rt + 0.05, zs1), (rt + 0.02, zs1 + 0.1),
                         (0.45 * D, zs1 + 0.45 * (zb1 - zs1)), (0.66 * D, zb1)], seg, cap=True)
    a = 0.80 * D
    box('trim', F0, -a, a, -a, a, base.z + zb1, base.z + H, bottom=False)
    for q in range(8):                                  # листья аканта
        ang = q * math.pi / 4
        ca, sa = math.cos(ang), math.sin(ang)
        rad = Vector((ca, sa, 0)); tang = Vector((-sa, ca, 0))
        prev = None
        for i in range(4):
            tt = i / 3
            z = zs1 + 0.02 + (0.70 * D) * tt
            r = rt + 0.03 + (0.40 * D) * tt ** 2.2
            ww = 0.17 * D * (1 - 0.5 * tt ** 2)
            c0 = base + rad * r + UP * z
            cur = (c0 - tang * ww, c0 + tang * ww)
            if prev: face('trim', [prev[0], prev[1], cur[1], cur[0]], rad)
            prev = cur

def pillar_dummy(): pass

# ------------------------------------------------------------------ фасад крыла
GROOVES = (1.7, 2.6, 3.5)       # швы руста на первом этаже

def facade(F, L, cols, doors=(), brackets=False, upper=True, ext=0.5):
    """Трёхэтажная стена: рустованный цоколь/первый этаж, арочные окна второго,
    прямоугольные третьего, карниз с модульонами и парапет. cols — [(центр, ширина)];
    doors — центры колонок, где на первом этаже вместо окна дверь."""
    box('stone', F, 0, L, -0.3, 0.08, GROUND, ZP)
    # первый этаж
    h0 = []
    for cu, w in cols:
        if cu in doors:
            h0.append(door(F, cu, 1.9, 3.0, 0))
        else:
            h0.append(rect_win(F, cu, w, 1.2, 3.4, 0, rows=(0.5,)))
    wall_lvl(F, 0, L, ZP, Z1, 0, h0, 'wall2')
    segs, prev = [], 0
    for ua, ub, za, zb in sorted(h0):
        segs.append((prev, ua - 0.22)); prev = ub + 0.22
    segs.append((prev, L))
    for z in GROOVES:
        for a, b in segs:
            if b - a > 0.3:
                strip(F, a, b, z, z + 0.055, 0.012, 'wall3')
    band(F, 0, L, 0, ZP, ZP + 0.1, 0.1)
    band(F, 0, L, 0, Z1 - 0.1, Z1 + 0.15, 0.12)
    # второй этаж — арки
    h1 = [arch_win(F, cu, w + 0.1, 5.3, 7.35, 0) for cu, w in cols]
    wall_lvl(F, 0, L, Z1 + 0.15, Z2, 0, h1, 'wall')
    band(F, 0, L, 0, Z2 - 0.12, Z2 + 0.15, 0.12)
    # третий этаж
    h2 = [rect_win(F, cu, w, 9.95, 12.3, 0, brackets=brackets) for cu, w in cols]
    wall_lvl(F, 0, L, Z2 + 0.15, Z3, 0, h2, 'wall')
    cornice(F, 0, L, 0, Z3, ext=ext)
    box('wall', F, 0, L, -0.4, 0, ZT, ZPAR)
    box('trim', F, -0.04, L + 0.04, -0.46, 0.08, ZPAR, ZPAR + 0.14, bottom=False)

def pair_cols(start, n, module, w=1.35, off=1.08):
    out = []
    for i in range(n):
        c = start + module * (i + 0.5)
        out += [(c - off, w), (c + off, w)]
    return out

def even_cols(L, n, w=1.4):
    return [(L / n * (i + 0.5), w) for i in range(n)]

def plain_wall(F, L, h_top=ZPAR):
    box('stone', F, 0, L, -0.3, 0.08, GROUND, ZP)
    wall_lvl(F, 0, L, ZP, Z1, 0, [], 'wall2')
    wall_lvl(F, 0, L, Z1, Z3, 0, [], 'wall')
    band(F, 0, L, 0, Z1 - 0.1, Z1 + 0.15, 0.12)
    band(F, 0, L, 0, Z2 - 0.12, Z2 + 0.15, 0.12)
    cornice(F, 0, L, 0, Z3, ext=0.4)
    box('wall', F, 0, L, -0.4, 0, ZT, ZPAR)
    box('trim', F, -0.04, L + 0.04, -0.46, 0.08, ZPAR, ZPAR + 0.14, bottom=False)


# ------------------------------------------------------------------ северный портик (ул. Марата)
def build_portico():
    F = mk(0, 14.0, (0, -1), NORTH)       # u: с запада на восток (t 14 → 0), n — на север
    LP = 14.0
    ZL = 0.54                              # пол портика
    ctrs = [3.1, 7.0, 10.9]
    colu = [1.15, 5.05, 8.95, 12.85]
    # стена за колоннами
    box('stone', F, 0, LP, -0.3, 0.08, GROUND, ZL)
    hg = [door(F, 7.0, 1.9, 3.0, 0, steps=0, z0=ZL)]
    # дверь рассчитана на ZP; поднимем пол: в портике ZP заменён порогом ZL
    wall_lvl(F, 0, LP, ZL, Z1, 0, hg + [], 'wall2')
    h1 = [rect_win(F, 3.1, 1.5, 5.05, 8.2, 0), rect_win(F, 10.9, 1.5, 5.05, 8.2, 0), rect_win(F, 7.0, 2.0, 5.05, 8.2, 0, cols=2)]
    wall_lvl(F, 0, LP, Z1, Z2, 0, h1, 'wall')
    h2 = [rect_win(F, 3.1, 1.5, 9.95, 12.3, 0), rect_win(F, 10.9, 1.5, 9.95, 12.3, 0), rect_win(F, 7.0, 2.0, 9.95, 12.3, 0)]
    wall_lvl(F, 0, LP, Z2, Z3 + 0.6, 0, h2, 'wall')
    band(F, 0, LP, 0, Z1 - 0.1, Z1 + 0.15, 0.1)
    band(F, 0, LP, 0, Z2 - 0.12, Z2 + 0.15, 0.1)
    box('wall', F, 0, LP, -0.4, 0, ZT, ZPAR)
    # гербы в крайних пролётах
    for cu in (3.1, 10.9):
        disc(F, cu, 2.7, 0.62, 0.04)
    # площадка и лестница
    box('stone', F, -0.1, LP + 0.1, 0, 1.55, GROUND, ZL - 0.06)
    box('trim', F, -0.14, LP + 0.14, 0, 1.6, ZL - 0.06, ZL)
    for i in range(3):
        box('stone', F, 4.7, 9.3, 1.55, 1.55 + 0.5 * (3 - i), ZL - 0.18 * (i + 1) - (2.5 if i == 2 else 0), ZL - 0.18 * i, bottom=False)
    # колонны на всю высоту трёх этажей
    HC = 11.9 - ZL
    for u in colu:
        column(F.p(u, 0.3, ZL), HC, 1.2)
    # антаблемент и карниз над колоннами
    box('trim', F, -0.15, LP + 0.15, 0, 1.4, 11.9, 12.5, bottom=False)
    box('wall', F, -0.15, LP + 0.15, 0, 1.32, 12.5, Z3, bottom=False)
    box('trim', F, -0.15, LP + 0.15, 0.2, 1.4, 12.5, 12.56, bottom=False)
    cornice(F, -0.15, LP + 0.15, 1.3, Z3, ext=0.5)
    box('wall', F, -0.1, LP + 0.1, 1.0, 1.5, ZT, ZPAR)
    box('trim', F, -0.18, LP + 0.18, 0.92, 1.6, ZPAR, ZPAR + 0.14, bottom=False)
    # боковые стены головы корпуса (с запада): ширина 3.7 до северного крыла
    Fw = mk(0, 14.0, (1, 0), WEST)
    plain_wall(Fw, 3.7)


# ------------------------------------------------------------------ крыши
def roofs():
    pitch = 0.40
    HR = ZT          # основание кровли — верх карниза
    ins = 0.35
    # восточное крыло: конёк вдоль s, вальмы на обоих концах
    Fe = mk(0, 0, (1, 0), EAST)
    wd = 14.3 - 2 * ins
    hip_roof(Fe, ins, 66.8 - ins, -ins, -14.3 + ins, HR, pitch * wd / 2, ov=0.0)
    # северное крыло: конёк вдоль t; начинается внутри восточного, заканчивается вальмой
    Fn = mk(0, 0, (0, 1), SOUTH)
    wn = 10.8 - 2 * ins
    hip_roof(Fn, 7.0, 55.9 - ins, 14.5 - ins, 3.7 + ins, HR, pitch * wn / 2, ov=0.0, hip0=False)
    # поперечный выступ запада северного крыла (s до 19.9)
    Fw = mk(0, 0, (1, 0), WEST)
    ww = 10.6 - 2 * ins
    hip_roof(Fw, 9.1, 19.9 - ins, 55.9 - ins, 45.3 + ins, HR, pitch * ww / 2 * 0.99, ov=0.0, hip0=False)
    # южное крыло
    Fs = mk(0, 0, (0, 1), SOUTH)
    ws = 13.8 - 2 * ins
    hip_roof(Fs, 7.0, 55.5 - ins, 64.8 - ins, 51.0 + ins, HR, pitch * ws / 2, ov=0.0, hip0=False)
    # плоский участок над выступом юго-восточного угла (s 64.5..66.45, t 13.9..19.25)
    q = [W(*ST(64.0, 13.5)), W(*ST(64.0, 19.25)), W(*ST(66.45, 19.25)), W(*ST(66.45, 13.5))]
    face('roof', [Vector((p.x, p.y, HR + 0.25)) for p in q], UP)


# ------------------------------------------------------------------ сборка
def build():
    build_portico()

    # --- восточный фасад (ул. Суворова): голова с одиночными окнами + 10 модулей парных окон
    F = mk(0, 0, (1, 0), EAST)
    cl = 7.0 + 5.98 * 9.5
    cols = [(3.5, 1.4)] + pair_cols(7.0, 9, 5.98) + [(cl, 1.4)]
    facade(F, 66.8, cols, doors=(cl,), brackets=True)
    # сдвиг двери: заменяет левое окно последней пары; правое остаётся окном
    # --- северное крыло: северный фасад (на Марата)
    Fn = mk(3.7, 55.9, (0, -1), NORTH)
    facade(Fn, 41.9, pair_cols(0, 7, 41.9 / 7))
    # западный торец северного крыла
    Fw = mk(3.6, 55.9, (1, 0), WEST)
    facade(Fw, 16.3, even_cols(16.3, 3), ext=0.4)
    # южная стена выступа
    Fws = mk(19.9, 55.9, (0, -1), SOUTH)
    facade(Fws, 10.6, even_cols(10.6, 2), ext=0.4)
    # восточная стена выступа (во двор)
    Fwe = mk(14.5, 45.3, (1, 0), EAST)
    facade(Fwe, 5.4, even_cols(5.4, 1), ext=0.4)
    # двор: южная стена северного крыла
    Fc = mk(14.5, 45.3, (0, -1), SOUTH)
    facade(Fc, 31.0, even_cols(31.0, 5, 1.5), ext=0.4)
    # двор: западная стена восточного крыла
    Fd = mk(14.6, 14.3, (1, 0), WEST)
    facade(Fd, 36.9, even_cols(36.9, 6, 1.5), ext=0.4)
    # западная стена головы восточного крыла уже в портике; двор: северная стена южного крыла
    Fs1 = mk(51.0, 55.5, (0, -1), NORTH)
    facade(Fs1, 26.9, even_cols(26.9, 5, 1.5), ext=0.4)
    Fs2 = mk(51.4, 22.5, (0, -1), NORTH)
    facade(Fs2, 8.2, even_cols(8.2, 1, 1.5), ext=0.4)
    # ниша во дворе южного крыла
    Fr = mk(54.6, 28.6, (0, -1), NORTH)
    facade(Fr, 6.1, even_cols(6.1, 1, 1.8), ext=0.3)
    Frs1 = mk(51.0, 28.6, (1, 0), EAST)       # боковые стенки ниши: стена, смотрящая на восток... (в нишу)
    plain_wall(Frs1, 3.6)
    Frs2 = mk(51.4, 22.5, (1, 0), WEST)
    plain_wall(Frs2, 3.2)
    # торец южного крыла (запад)
    Ft = mk(51.0, 55.5, (1, 0), WEST)
    facade(Ft, 13.9, even_cols(13.9, 3), ext=0.4)
    # южный фасад
    Fsu = mk(64.8, 55.5, (0, -1), SOUTH)
    facade(Fsu, 35.9, pair_cols(0, 6, 35.9 / 6))
    Fsb = mk(66.8, 19.6, (0, -1), SOUTH)
    facade(Fsb, 19.6, pair_cols(0, 3, 19.6 / 3))
    Fst = mk(64.8, 19.6, (1, 0), WEST)
    plain_wall(Fst, 2.0)
    roofs()

build()
finish('gimnazia1', __file__, 25000)
