# Большая Морская, 32 — угловой дом на ул. Сергеева-Ценского с большим угловым
# балконом на консолях (OSM way 166878764, 3 этажа). Модель с нуля.
#
#   blender -b --python models/bm32/build.py -- [glb]
#   (или python3 с модулем bpy: python3 models/bm32/build.py -- glb)
#
# План — Г по контуру OSM: восточный блок 10.4 × 19.1 м вдоль Б. Морской и
# западное крыло 23.4 × 14.4 м вдоль ул. Сергеева-Ценского; угол — юго-восточная
# точка P1, в ней начало модели. Описание фасадов — поле source записи
# w166878764 в refs/center-models.json (фото не открыть, работа по тексту):
# первый этаж в белом русте с арочными окнами и замковыми камнями, выше охристая
# штукатурка #cdbf9d, окна второго этажа 1 × 1.8 м в зелёных рамах с сандриками
# на консолях, третьего — поменьше; на углу на уровне третьего этажа плита
# балкона с выносом 2.2 м и по ≈ 6 м на обе улицы на пяти консолях (три крупных),
# кованая серо-зелёная решётка «ёлочкой», над ней остеклённая лоджия в белых
# переплётах; венчающий карниз с дентикулами, малоуклонная кровля ржавой жести.
# Земля от угла понижается к западу на 2.9 м — цоколь там растёт. Что наугад —
# NOTES.md.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

# контур OSM (мир: x — восток, z — юг)
P0, P1, P2_, P3 = (-280.0, 1166.5), (-275.2, 1185.0), (-285.3, 1187.6), (-308.0, 1193.4)
P4, P5, P6 = (-311.6, 1179.5), (-288.9, 1173.6), (-290.1, 1169.1)
X0, Z0 = P1                                   # угол под балконом
origin(X0, Z0)
INSIDE = (-284.0, 1178.0)
# земля у точек контура относительно угла (terrain.gridHeightAt в игре)
GH = {P0: -0.71, P1: 0.0, P2_: -0.30, P3: -2.94, P4: -2.87, P5: -0.97, P6: -1.22}

def hexc(h):
    return tuple(int(h[i:i + 2], 16) / 255 for i in (1, 3, 5))

COL['wall'] = (hexc('#cdbf9d'), 0.92)          # охристо-жёлтая штукатурка
COL['wall2'] = ((0.90, 0.88, 0.83), 0.9)       # белый руст первого этажа, плита балкона
COL['trim'] = ((0.93, 0.92, 0.88), 0.85)       # карнизы, консоли, белые переплёты лоджии
COL['stone'] = ((0.62, 0.60, 0.56), 0.9)       # цоколь
COL['roof'] = (hexc('#5e564f'), 0.75)          # ржавая жесть
COL['wood'] = ((0.20, 0.33, 0.24), 0.6)        # зелёные деревянные рамы
COL['metal'] = ((0.36, 0.42, 0.38), 0.5)       # серо-зелёная кованая решётка
COL['glass'] = ((0.08, 0.11, 0.14), 0.15)

GROUND = -4.0
PL = 0.4          # верх цоколя у угла
Z1 = 4.4          # верх первого этажа (руст)
Z2 = 8.2          # пол третьего этажа = верх плиты балкона
TOPW = 11.2       # низ венчающего карниза
EAVE = TOPW + 0.6
BX = 2.2          # вынос балкона
BL = 6.8          # длина балкона по стене от угла

def quad(m, F, u0, u1, z0, z1, d):
    face(m, [F.p(u0, d, z0), F.p(u1, d, z0), F.p(u1, d, z1), F.p(u0, d, z1)], F.N())

def ground(a, b, L):
    ga, gb = GH[a], GH[b]
    return lambda u: ga + (gb - ga) * max(0.0, min(1.0, u / L))

# ------------------------------------------------------------------ проёмы
def frames(F, ua, ub, za, zb, d, cols=2, rows=(0.7,), m='wood', reveal=0.22):
    """Стекло в глубине проёма и переплёт — плоскими полосами перед стеклом."""
    g = d - reveal + 0.02
    quad('glass', F, ua, ub, za, zb, g)
    t, f = 0.07, g + 0.03
    quad(m, F, ua, ua + t, za, zb, f); quad(m, F, ub - t, ub, za, zb, f)
    quad(m, F, ua, ub, za, za + t, f); quad(m, F, ua, ub, zb - t, zb, f)
    for c in range(1, cols):
        u = ua + (ub - ua) * c / cols
        quad(m, F, u - t / 2, u + t / 2, za, zb, f)
    for r in rows:
        z = za + (zb - za) * r
        quad(m, F, ua, ub, z - t / 2, z + t / 2, f)

def arch(F, cu, w, za, zs, d, m='wall2', reveal=0.3, door=False):
    """Арочный проём первого этажа: прямоугольная дыра до верха арки,
    углы над полуциркулем закрыты пазухами (их торцы — откос арки),
    замковый камень и импосты. Возвращает дыру для wall()."""
    r = w / 2
    ua, ub, zt = cu - r, cu + r, zs + r
    n = 8
    for s in (-1, 1):
        pts = [(cu + s * r * math.cos(math.pi / 2 * k / n), zs + r * math.sin(math.pi / 2 * k / n)) for k in range(n + 1)]
        pts.append((cu + s * r, zt))
        if s < 0:
            pts.reverse()
        prism_uz(m, F, pts, d - reveal, d)
    g = d - reveal + 0.02
    quad('glass', F, ua, ub, za, zt, g - 0.04)
    t, f = 0.07, g + 0.03
    quad('wood', F, ua, ua + t, za, zs, f); quad('wood', F, ub - t, ub, za, zs, f)
    quad('wood', F, ua, ub, zs - t, zs, f)
    quad('wood', F, cu - t / 2, cu + t / 2, za, zt, f)
    if not door:
        quad('wood', F, ua, ub, za, za + t, f)
        box('trim', F, ua - 0.12, ub + 0.12, d, d + 0.12, za - 0.12, za)          # подоконник
    else:
        quad('wood', F, ua, ub, za + 0.9, za + 0.97, f)                 # филёнка двери
    # замковый камень и импосты
    prism_uz('trim', F, [(cu - 0.17, zt - 0.32), (cu + 0.17, zt - 0.32), (cu + 0.24, zt + 0.12), (cu - 0.24, zt + 0.12)], d, d + 0.14)
    for s in (-1, 1):
        box('trim', F, cu + s * r - 0.12, cu + s * r + 0.12, d, d + 0.07, zs - 0.12, zs)
    return (ua, ub, za, zt)

def win2(F, cu, za, d, w=1.0, h=1.8):
    """Окно второго этажа: наличник, зелёная рама, сандрик на двух консольках."""
    ua, ub, zb = cu - w / 2, cu + w / 2, za + h
    frames(F, ua, ub, za, zb, d, 2, (0.68,))
    k = 0.13
    box('trim', F, ua - k, ua, d, d + 0.05, za, zb); box('trim', F, ub, ub + k, d, d + 0.05, za, zb)
    box('trim', F, ua - k - 0.06, ub + k + 0.06, d, d + 0.14, za - 0.1, za)       # подоконник
    for s in (ua - k, ub):                                                          # консольки
        prism_uz('trim', F, [(s, zb + 0.02), (s + k, zb + 0.02), (s + k, zb + 0.3), (s, zb + 0.3)], d, d + 0.08)
        box('trim', F, s, s + k, d, d + 0.2, zb + 0.18, zb + 0.3)
    box('trim', F, ua - k - 0.12, ub + k + 0.12, d, d + 0.28, zb + 0.3, zb + 0.42)  # полка сандрика
    return (ua, ub, za, zb)

def win3(F, cu, za, d, w=0.9, h=1.45):
    ua, ub, zb = cu - w / 2, cu + w / 2, za + h
    frames(F, ua, ub, za, zb, d, 2, (0.66,))
    box('trim', F, ua - 0.1, ub + 0.1, d, d + 0.04, zb, zb + 0.1)
    box('trim', F, ua - 0.08, ub + 0.08, d, d + 0.12, za - 0.08, za)
    return (ua, ub, za, zb)

def rust(F, u0, u1, z0, z1, holes, hgt=0.5, gap=0.05, pr=0.05):
    """Ряды руста между проёмами: каждый ряд — бруски по участкам без дыр."""
    z = z0
    while z < z1 - 0.05:
        za, zb = z + gap, min(z + hgt, z1)
        cuts = sorted((h[0], h[1]) for h in holes if h[2] < zb and h[3] > za)
        a = u0
        for ha, hb in cuts + [(u1, u1)]:
            if ha - a > 0.05:
                box('wall2', F, a, ha, 0, pr, za, zb, bottom=False)
            a = max(a, hb)
        z += hgt

def plinth(F, L, g, gaps=(), basement=()):
    """Цоколь от земли до PL с разрывами под двери; оконца подвала там,
    где земля ниже угла больше чем на метр."""
    a = 0.0
    for ga, gb in sorted(gaps) + [(L, L)]:
        if ga - a > 0.02:
            box('stone', F, a, ga, -0.2, 0.09, GROUND, PL)
        a = gb
    for cu in basement:
        z0 = g(cu) + 0.35
        if PL - 0.15 - z0 > 0.45:
            quad('glass', F, cu - 0.45, cu + 0.45, z0, PL - 0.15, 0.095)
            box('wood', F, cu - 0.03, cu + 0.03, 0.09, 0.12, z0, PL - 0.15)

def steps(F, ua, ub, g):
    if g < PL - 0.05:
        box('stone', F, ua - 0.2, ub + 0.2, 0.0, 0.6, GROUND, PL)
        if PL - g > 0.3:
            box('stone', F, ua - 0.2, ub + 0.2, 0.6, 0.95, GROUND, (PL + g) / 2)

def dentils(F, u0, u1, z):
    u = u0 + 0.1
    while u < u1 - 0.1:
        quad('trim', F, u, u + 0.14, z - 0.16, z, 0.2)
        face('trim', [F.p(u, 0, z - 0.16), F.p(u + 0.14, 0, z - 0.16), F.p(u + 0.14, 0.2, z - 0.16), F.p(u, 0.2, z - 0.16)], -UP)
        u += 0.36

def street(F, L, axes, doors, g, balc=None):
    """Уличный фасад: руст первого этажа с арками, штукатурка выше, тяги,
    карниз с дентикулами. balc = (u0, u1) — участок под угловым балконом."""
    hz = []
    for i, cu in enumerate(axes):
        hz.append(arch(F, cu, 1.5 if i not in doors else 1.6, PL if i in doors else 1.1, 3.0, 0, door=i in doors))
        if i in doors:
            steps(F, cu - 0.8, cu + 0.8, g(cu))
    wall(F, 0, L, PL, Z1, 0, hz, m='wall2', reveal=0.3, rm='wall2')
    rust(F, 0, L, PL, Z1, hz)
    plinth(F, L, g, [(hz[i][0], hz[i][1]) for i in doors], [cu for i, cu in enumerate(axes) if i not in doors])
    band(F, -0.05, L + 0.05, 0.05, Z1, Z1 + 0.28, 0.16)                           # тяга над рустом
    up = []
    for cu in axes:
        up.append(win2(F, cu, Z1 + 1.0, 0))
        up.append(win3(F, cu, Z2 + 0.75, 0))
    wall(F, 0, L, Z1, TOPW, 0, up, reveal=0.22)
    band(F, 0, L, 0.02, Z2 - 0.05, Z2 + 0.08, 0.06)                              # тонкая междуэтажная тяга
    cornice(F, 0, L, 0, TOPW, ext=0.6)
    dentils(F, 0, L, TOPW + 0.22)
    quad('wall', F, -0.2, L + 0.2, EAVE, EAVE + 0.35, 0.3)                        # низкий парапет
    box('trim', F, -0.25, L + 0.25, 0.2, 0.42, EAVE + 0.35, EAVE + 0.43)

def rear(F, L, n, g, blank=()):
    """Дворовые стены: штукатурка от земли, простые окна по шагу (наугад)."""
    step = L / n
    hs = []
    for i in range(n):
        if i in blank:
            continue
        cu = step * (i + 0.5)
        za = max(1.0, g(cu) + 1.0)
        hs.append(win3(F, cu, za, 0, 1.0, 1.6))
        hs.append(win3(F, cu, Z1 + 1.0, 0, 1.0, 1.7))
        hs.append(win3(F, cu, Z2 + 0.75, 0, 0.9, 1.45))
    wall(F, 0, L, PL, TOPW, 0, hs, reveal=0.2)
    box('stone', F, 0, L, -0.2, 0.06, GROUND, PL)
    cornice(F, 0, L, 0, TOPW, ext=0.45)

def blind(F, L):
    """Глухая стена к соседу (w166878763) — до верха карниза."""
    quad('wall', F, 0, L, GROUND, EAVE, 0.0)

# ------------------------------------------------------------------ фасады
Fe, Le = frame_from(P0, P1, INSIDE)        # восточный, на Б. Морскую (с севера к углу)
Fs, Ls = frame_from(P1, P3, INSIDE)        # южный, на ул. Сергеева-Ценского (от угла на запад)
Fw, Lw = frame_from(P3, P4, INSIDE)        # западный торец, во двор
Fn, Ln = frame_from(P4, P5, INSIDE)        # северная стена крыла, во двор
Fj, Lj = frame_from(P5, P6, INSIDE)        # уступ к соседу
Fb, Lb = frame_from(P6, P0, INSIDE)        # общая стена с соседом

# оси: два окна под балконом с каждой стороны, остальное шагом 3.6–3.8 м
street(Fe, Le, [2.2, 6.0, 9.8, Le - 4.6, Le - 1.7], doors=(1, 3), g=ground(P0, P1, Le))
street(Fs, Ls, [1.7, 4.6, 8.6, 12.2, 15.8, 19.4, 23.0, 26.6, 30.2], doors=(0, 2),
       g=lambda u: GH[P1] + (GH[P2_] - GH[P1]) * u / 10.4 if u < 10.4 else GH[P2_] + (GH[P3] - GH[P2_]) * (u - 10.4) / (Ls - 10.4))
rear(Fw, Lw, 3, ground(P3, P4, Lw))
rear(Fn, Ln, 6, ground(P4, P5, Ln))
blind(Fj, Lj)
blind(Fb, Lb)

# ------------------------------------------------------------------ угловой балкон
# Плита в рамке восточного фасада: u — с севера к углу, d — на восток. Южная
# улица перпендикулярна (OSM даёт 89.8°), её полоса — u ∈ [Le, Le + BX].
zs0, zs1 = Z2 - 0.32, Z2
box('wall2', Fe, Le - BL, Le + BX, 0, BX, zs0, zs1)                  # вдоль Б. Морской и угол
box('wall2', Fe, Le, Le + BX, -BL, 0, zs0, zs1)                      # вдоль Сергеева-Ценского
box('trim', Fe, Le - BL - 0.06, Le + BX + 0.06, BX - 0.02, BX + 0.08, zs1 - 0.12, zs1 + 0.04)
box('trim', Fe, Le + BX - 0.02, Le + BX + 0.08, -BL - 0.06, BX, zs1 - 0.12, zs1 + 0.04)

def console(F, cu, depth, z_top, drop, w):
    """Лепная консоль: профиль в плоскости (d, z) — волюта, сходящая к стене;
    спереди накладка-лист аканта."""
    prof = [(0.0, z_top), (depth, z_top), (depth, z_top - 0.28), (depth * 0.8, z_top - 0.36),
            (depth * 0.55, z_top - drop * 0.45), (depth * 0.3, z_top - drop * 0.75),
            (depth * 0.12, z_top - drop * 0.95), (0.0, z_top - drop)]
    a = [F.p(cu - w / 2, d, z) for d, z in prof]
    b = [F.p(cu + w / 2, d, z) for d, z in prof]
    face('trim', a, -F.U()); face('trim', b, F.U())
    c = F.p(cu, depth / 2, z_top - drop / 2)
    for i in range(len(prof)):
        j = (i + 1) % len(prof)
        q = [a[i], a[j], b[j], b[i]]
        face('trim', q, sum(q, Vector()) / 4 - c)
    # лист: пластина по наклонной груди консоли
    p0, p1 = prof[3], prof[6]
    face('trim', [F.p(cu - w * 0.35, p0[0] + 0.05, p0[1]), F.p(cu + w * 0.35, p0[0] + 0.05, p0[1]),
                  F.p(cu + w * 0.15, p1[0] + 0.05, p1[1]), F.p(cu - w * 0.15, p1[0] + 0.05, p1[1])], F.N() + UP * 0.3)

console(Fe, Le - BL + 0.25, BX - 0.1, zs0, 0.9, 0.28)                 # крайние, малые
console(Fs, BL - 0.25, BX - 0.1, zs0, 0.9, 0.28)
console(Fe, Le - 3.15, BX - 0.05, zs0, 1.4, 0.42)                     # крупные
console(Fs, 3.15, BX - 0.05, zs0, 1.4, 0.42)
cn = (Fe.n + Fs.n).normalized()                                      # угловая — по биссектрисе
Fc = Frame(W(*P1), Vector((-cn.y, cn.x)), cn)
console(Fc, 0.0, BX * 1.35, zs0, 1.5, 0.46)

# Ограждение: поручень, низ и кованые прутья «ёлочкой» по внешней кромке.
RH = 1.0
def strip(F, d, a, b, w):
    """Плоский прут в плоскости ограждения: a, b — точки (u, z); материал двусторонний."""
    du, dz = b[0] - a[0], b[1] - a[1]
    l = math.hypot(du, dz); nu, nz = -dz / l * w / 2, du / l * w / 2
    face('metal', [F.p(a[0] - nu, d, a[1] - nz), F.p(b[0] - nu, d, b[1] - nz),
                   F.p(b[0] + nu, d, b[1] + nz), F.p(a[0] + nu, d, a[1] + nz)], F.N())

def railing(F, u0, u1, d):
    zb, zt = zs1 + 0.06, zs1 + RH
    beam('metal', F.p(u0, d, zt), F.p(u1, d, zt), 0.06)
    beam('metal', F.p(u0, d, zb), F.p(u1, d, zb), 0.04)
    beam('metal', F.p(u0, d, (zb + zt) / 2), F.p(u1, d, (zb + zt) / 2), 0.03)
    n = max(2, round((u1 - u0) / 0.42))
    s = (u1 - u0) / n
    for k in range(n):
        u = u0 + s * k
        zm = (zb + zt) / 2                                           # «ёлочка»: две шеврона на звено
        strip(F, d, (u, zb), (u + s / 2, zm), 0.035); strip(F, d, (u + s, zb), (u + s / 2, zm), 0.035)
        strip(F, d, (u, zm), (u + s / 2, zt), 0.035); strip(F, d, (u + s, zm), (u + s / 2, zt), 0.035)
        strip(F, d, (u + s, zb), (u + s, zt), 0.04)

E = BX - 0.08
railing(Fe, Le - BL + 0.05, Le + E, E)                                # фасад на Б. Морскую
Fs2 = Frame(Fe.p(Le + E, 0, 0).to_2d(), -Fe.n, Fe.u)                  # кромка вдоль Сергеева-Ценского
railing(Fs2, -E, BL - 0.05, 0)
for u in (Le - BL + 0.05,):                                          # торцы
    beam('metal', Fe.p(u, 0, zs1 + RH), Fe.p(u, E, zs1 + RH), 0.06)
beam('metal', Fs2.p(BL - 0.05, 0, zs1 + RH), Fs2.p(BL - 0.05, -E, zs1 + RH), 0.06)

# Лоджия: ленточное остекление над решёткой в белых переплётах, сверху
# плита-козырёк под венчающим карнизом.
zg0, zg1 = zs1 + RH + 0.02, TOPW - 0.15
def ribbon(F, u0, u1, d):
    quad('glass', F, u0, u1, zg0, zg1, d)
    box('trim', F, u0, u1, d - 0.04, d + 0.04, zg0 - 0.06, zg0 + 0.04)
    box('trim', F, u0, u1, d - 0.04, d + 0.04, zg1 - 0.06, zg1)
    box('trim', F, u0, u1, d - 0.04, d + 0.04, zg0 + (zg1 - zg0) * 0.72 - 0.03, zg0 + (zg1 - zg0) * 0.72 + 0.03)
    n = max(1, round((u1 - u0) / 0.95))
    for k in range(n + 1):
        u = u0 + (u1 - u0) * k / n
        box('trim', F, u - 0.04, u + 0.04, d - 0.04, d + 0.04, zg0, zg1)

G = BX - 0.2
ribbon(Fe, Le - BL + 0.1, Le + G, G)
ribbon(Fs2, -(BX - 0.08) + 0.12, BL - 0.1, -0.12)
# боковые стенки лоджии на торцах — штукатурка
box('wall', Fe, Le - BL + 0.02, Le - BL + 0.14, 0, G, zs1, TOPW)
box('wall', Fs2, BL - 0.14, BL - 0.02, -G - 0.1, 0, zs1, TOPW)
box('wall2', Fe, Le - BL, Le + BX, 0, BX, TOPW - 0.15, TOPW + 0.1)
box('wall2', Fe, Le, Le + BX, -BL, 0, TOPW - 0.15, TOPW + 0.1)
box('trim', Fe, Le - BL - 0.05, Le + BX + 0.05, BX - 0.05, BX + 0.12, TOPW + 0.1, TOPW + 0.3)
box('trim', Fe, Le + BX - 0.05, Le + BX + 0.12, -BL - 0.05, BX, TOPW + 0.1, TOPW + 0.3)

# ------------------------------------------------------------------ кровля
# Два малоуклонных ската ржавой жести за парапетом: восточный блок — конёк
# вдоль Б. Морской, к соседу фронтон; западное крыло — конёк вдоль
# Сергеева-Ценского, восточный конец уходит под скат блока.
hip_roof(Fe, 0, Le, 0, -10.4, EAVE, 1.3, ov=0.15, hip0=False, hip1=True)
hip_roof(Fs, 5.2, Ls, 0, -14.4, EAVE, 1.6, ov=0.15, hip0=False, hip1=True)
chimney(Fs, 18.0, -9.0, EAVE + 0.6, EAVE + 2.3, 0.7)
chimney(Fe, 4.0, -6.0, EAVE + 0.6, EAVE + 2.1, 0.7)
# плиты перекрытия под кровлей: чтобы сверху сквозь щели не просвечивало
face('wall', [Vector((*W(*p), EAVE - 0.02)) for p in (P0, P1, P2_, P6)], -UP)
face('wall', [Vector((*W(*p), EAVE - 0.02)) for p in (P2_, P3, P4, P5)], -UP)

finish('bm32', __file__)
