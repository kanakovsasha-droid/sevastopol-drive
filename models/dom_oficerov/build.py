# Севастопольский Дом офицеров Черноморского флота, ул. Ленина, 9 (OSM w104918333).
# НЕ классика: модернизм 1966–67 (арх. И. А. Брауде) — стеклянная навесная стена,
# выступающий блок с вертикальными рёбрами над входом, белый объём с магазинами.
#
#   blender -b --python models/dom_oficerov/build.py -- [glb]
#
# План снят с контура OSM и спутника, фасад — с фото Викисклада (refs/r00–r02).
# Ноль высоты — тротуар у главного входа.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

X0, Z0 = 12.8, 294.0                  # главный вход на уличной линии фасада
origin(X0, Z0)

COL['wall']  = ((0.90, 0.89, 0.85), 0.9)     # белый бетон/облицовка
COL['wall2'] = ((0.30, 0.23, 0.19), 0.8)     # тёмно-коричневые рёбра и панели
COL['wall3'] = ((0.47, 0.22, 0.17), 0.45)    # красно-коричневый полированный гранит
COL['roof']  = ((0.37, 0.41, 0.39), 0.8)     # плоская кровля #5f6863
COL['trim']  = ((0.92, 0.91, 0.88), 0.85)
COL['stone'] = ((0.52, 0.51, 0.49), 0.6)     # серый камень цоколя, козырька, ступеней
COL['metal'] = ((0.13, 0.11, 0.10), 0.5)     # тёмные переплёты
COL['glass'] = ((0.10, 0.15, 0.17), 0.1)

GROUND = -3.0

# Фасад на Ленина (запад): u — с севера на юг (от угла OSM 11.3,263), d — наружу (на запад).
FW, LEN = frame_from((11.3, 263.0), (14.1, 322.5), (30.0, 290.0))
D = 27.75                  # глубина главного корпуса (по контуру)
U_GL = 23.0                # конец стеклянного крыла / начало блока с рёбрами
U_FIN = 40.15              # конец блока с рёбрами / начало южного белого корпуса
U_END = LEN                # южный торец (≈59.6)
G = -1.4                   # плоскость стеклянной стены (блок над входом выступает на 1.4 м)
PL = 1.75                  # верх гранитного цоколя
LV = 3.4                   # шаг этажей стеклянной стены
TOP_G = PL + 0.1 + 4 * LV  # верх остекления 15.45

# ---------------------------------------------------------------- рамки сторон
def f_east(u1):   # восточная сторона: u' = u1 - u (идём на север), d' = -d
    return Frame(FW.p(u1, 0, 0).xy, -FW.u, -FW.n)
def f_north(u0, dE):   # северный торец
    return Frame(FW.p(u0, dE, 0).xy, FW.n, -FW.u)
def f_south(u1, dW):   # южный торец
    return Frame(FW.p(u1, dW, 0).xy, -FW.n, FW.u)

def win(F, cu, za, w, h, d):
    """Оконный проём с тёмным переплётом (без наличника)."""
    glazing_dark(F, cu - w / 2, cu + w / 2, za, za + h, d)
    return (cu - w / 2, cu + w / 2, za, za + h)

def glazing_dark(F, ua, ub, za, zb, d, cols=2, rows=(0.5,), reveal=0.24):
    g = d - reveal + 0.02
    face('glass', [F.p(ua, g, za), F.p(ub, g, za), F.p(ub, g, zb), F.p(ua, g, zb)], F.N())
    t, f0, f1 = 0.07, g, g + 0.08
    box('metal', F, ua, ua + t, f0, f1, za, zb); box('metal', F, ub - t, ub, f0, f1, za, zb)
    box('metal', F, ua, ub, f0, f1, za, za + t); box('metal', F, ua, ub, f0, f1, zb - t, zb)
    for c in range(1, cols):
        u = ua + (ub - ua) * c / cols
        box('metal', F, u - t / 2, u + t / 2, f0, f1, za, zb)
    for r in rows:
        z = za + (zb - za) * r
        box('metal', F, ua, ub, f0, f1, z - t / 2, z + t / 2)

def punched(F, u0, u1, d, z0, z1, bays, levels, w=1.7, h=1.9, z_first=2.6, pitch=LV):
    """Ряд оконных проёмов; возвращает список дыр для wall()."""
    holes = []
    step = (u1 - u0) / bays
    for i in range(bays):
        for k in range(levels):
            za = z_first + pitch * k
            if za + h < z1 - 0.8:
                holes.append(win(F, u0 + step * (i + 0.5), za, w, h, d))
    return holes

def roof_and_parapet(u0, u1, dE, dW, z, h=0.8, t=0.3, west=True, north=True, south=True, east=True):
    face('roof', [FW.p(u0, dE, z), FW.p(u1, dE, z), FW.p(u1, dW, z), FW.p(u0, dW, z)], UP)
    if west:  box('wall', FW, u0, u1, dW - t, dW, z, z + h)
    if east:  box('wall', FW, u0, u1, dE, dE + t, z, z + h)
    if north: box('wall', FW, u0, u0 + t, dE, dW, z, z + h)
    if south: box('wall', FW, u1 - t, u1, dE, dW, z, z + h)
    c = 0.06
    if west:  box('trim', FW, u0 - c, u1 + c, dW - t - c, dW + c, z + h, z + h + 0.1)
    if east:  box('trim', FW, u0 - c, u1 + c, dE - c, dE + t + c, z + h, z + h + 0.1)
    if north: box('trim', FW, u0 - c, u0 + t + c, dE, dW, z + h, z + h + 0.1)
    if south: box('trim', FW, u1 - t - c, u1 + c, dE, dW, z + h, z + h + 0.1)

def band_all(u0, u1, dE, dW, z0, z1, pr=0.08, west=True):
    """Горизонтальный пояс по сторонам объёма."""
    if west: box('trim', FW, u0, u1, dW, dW + pr, z0, z1)
    box('trim', FW, u0, u1, dE - pr, dE, z0, z1)

# ================================================================ СТЕКЛЯННОЕ КРЫЛО (север)
def glass_wing():
    u0, u1 = 0.0, U_GL
    top = TOP_G + 1.05                       # верх парапета 16.5
    # гранитный цоколь и серый карниз-полка
    box('wall3', FW, u0, u1, G - 1.0, G + 0.15, GROUND, PL)
    box('stone', FW, u0, u1, G - 1.0, G + 0.38, PL, PL + 0.12)
    # стена: стекло в плоскости G
    z0, z1 = PL + 0.12, TOP_G
    face('glass', [FW.p(u0, G, z0), FW.p(u1, G, z0), FW.p(u1, G, z1), FW.p(u0, G, z1)], FW.N())
    nb = 7
    step = (u1 - u0) / nb
    for i in range(nb + 1):                       # несущие столбики
        u = u0 + step * i
        box('metal', FW, max(u - 0.17, u0), min(u + 0.17, u1), G, G + 0.34, z0, z1)
    for i in range(nb):                           # средние импосты и ригели в каждом пролёте
        uc = u0 + step * (i + 0.5)
        box('metal', FW, uc - 0.045, uc + 0.045, G, G + 0.16, z0, z1)
        for k in range(4):
            zk = z0 + LV * k
            box('metal', FW, uc - step / 2, uc + step / 2, G, G + 0.14, zk + LV * 0.62, zk + LV * 0.62 + 0.07)
    for k in range(5):                            # перекрытия этажей — тёмные пояса
        zk = z0 + LV * k
        pr = 0.20 if 0 < k < 4 else 0.12
        h = 0.5 if 0 < k < 4 else 0.3
        box('wall2', FW, u0, u1, G, G + pr, zk - h / 2 + (0.15 if k == 0 else 0), zk + h / 2 + (0.15 if k == 0 else 0))
    # белый парапет-фасция над остеклением
    box('wall', FW, u0, u1, G - 0.3, G + 0.42, TOP_G, top)
    box('trim', FW, u0 - 0.06, u1, G - 0.36, G + 0.48, top, top + 0.1)
    # глухой северный торец и восток
    Fn = f_north(u0, -D)
    wall(Fn, 0, D + G, GROUND, top, 0, punched(Fn, 1.5, D + G - 1.5, 0, 0, top, 4, 4, w=1.8))
    Fe = f_east(u1)
    wall(Fe, 0, u1 - u0, GROUND, top, D, punched(Fe, 0.8, u1 - 0.8, D, 0, top, 7, 4))
    roof_and_parapet(u0, u1, -D, G - 0.0, TOP_G - 0.8, west=False)
    # южная стена над крышей южного корпуса не нужна — она скрыта блоком с рёбрами

# ================================================================ БЛОК С РЁБРАМИ НАД ВХОДОМ
def fin_block():
    u0, u1 = U_GL, U_FIN
    top = 17.4
    SOFF0, SOFF1 = 4.5, 5.4                  # серый каменный пояс (козырёк)
    DB = -3.2                                # задняя стена тамбура
    PLAT = 0.5                               # площадка входа выше тротуара
    # платформа и ступени
    box('stone', FW, u0 - 1.0, U_FIN + 4.5, DB, 0.0, GROUND, PLAT)
    n = 3
    for i in range(n):
        top_i = PLAT - (PLAT / n) * (i + 1)
        box('stone', FW, u0 - 1.0, U_FIN + 4.5, 0.0, 0.9 * (n - i), top_i - (3 if i == n - 1 else PLAT / n), top_i + PLAT / n)
    # красные гранитные стойки по краям тамбура
    box('wall3', FW, u0, u0 + 2.0, DB, 0.0, PLAT, SOFF0)
    box('wall3', FW, U_FIN - 3.15, U_FIN, DB, 0.0, PLAT, SOFF0)
    # торцы тамбура в глубину G..DB — стойки уже закрывают, делаем ещё глухую часть стены глубже
    # стена тамбура с тремя парами дверей
    uA, uB = u0 + 2.0, U_FIN - 3.15
    holes = []
    cen = (uA + uB) / 2
    for dx in (-3.6, 0.0, 3.6):
        holes.append((cen + dx - 1.2, cen + dx + 1.2, PLAT, PLAT + 3.6))
    wall(FW, uA, uB, PLAT, SOFF0, DB, holes, m='wall3')
    for ua, ub, za, zb in holes:
        g = DB - 0.22
        um = (ua + ub) / 2
        face('wood', [FW.p(ua, g, za), FW.p(um - 0.03, g, za), FW.p(um - 0.03, g, za + 2.7), FW.p(ua, g, za + 2.7)], FW.N())
        face('wood', [FW.p(um + 0.03, g, za), FW.p(ub, g, za), FW.p(ub, g, za + 2.7), FW.p(um + 0.03, g, za + 2.7)], FW.N())
        face('glass', [FW.p(ua, g, za + 2.7), FW.p(ub, g, za + 2.7), FW.p(ub, g, zb), FW.p(ua, g, zb)], FW.N())
        box('metal', FW, ua, ub, g, g + 0.07, za + 2.66, za + 2.74)
        box('metal', FW, um - 0.04, um + 0.04, g, g + 0.07, za, zb)
        box('metal', FW, ua, ua + 0.07, g, g + 0.07, za, zb); box('metal', FW, ub - 0.07, ub, g, g + 0.07, za, zb)
        box('stone', FW, ua - 0.1, ub + 0.1, DB, DB + 0.12, zb, zb + 0.1)
    # надпись-табличка на граните (тёмная плита справа от дверей)
    box('metal', FW, uB - 2.4, uB - 0.4, DB, DB + 0.04, PLAT + 1.9, PLAT + 3.0)
    # серый каменный пояс-козырёк
    box('stone', FW, u0, u1, DB, 0.0, SOFF0, SOFF1)
    box('stone', FW, u0 - 0.04, u1, -0.05, 0.12, SOFF0 - 0.06, SOFF1 + 0.04)
    # белые пилоны по краям блока
    box('wall', FW, u0, u0 + 1.0, DB, 0.0, SOFF1, top)
    box('wall', FW, U_FIN - 3.15, U_FIN, DB, 0.0, SOFF1, top)
    # тёмная задняя стена за рёбрами и верхняя белая балка
    FIN0, FIN1 = u0 + 1.0, U_FIN - 3.15
    BKD = -0.8
    box('wall2', FW, FIN0, FIN1, DB, BKD, SOFF1, top - 1.15)
    box('wall', FW, u0, u1, DB, 0.0, top - 1.15, top)
    box('trim', FW, u0 - 0.05, u1 + 0.05, -0.08, 0.14, top - 1.15, top - 1.0)
    # вертикальные рёбра
    k = FIN0 + 0.5
    NF = 24
    pitch = (FIN1 - FIN0 - 0.6) / (NF - 1)
    for i in range(NF):
        u = FIN0 + 0.3 + pitch * i
        box('wall2', FW, u - 0.12, u + 0.12, BKD, 0.0, SOFF1, top - 1.15)
        box('trim', FW, u + 0.12, u + 0.15, BKD, -0.1, SOFF1, top - 1.15)
    # восточный и торцевой фасады блока
    Fe = f_east(u1)
    wall(Fe, 0, u1 - u0, GROUND, top, D, punched(Fe, 0.8, u1 - u0 - 0.8, D, 0, top, 5, 4, w=1.8))
    roof_and_parapet(u0, u1, -D, DB, top - 1.15 - 0.5, h=1.5, t=0.3, west=False, south=False, north=True)
    # венткамера на кровле
    box('wall', FW, 30.0, 35.0, -18.0, -12.0, top - 1.65, top + 1.4)
    box('trim', FW, 29.9, 35.1, -18.1, -11.9, top + 1.4, top + 1.55)
    for i in range(6):
        box('metal', FW, 30.4 + i * 0.7, 30.65 + i * 0.7, -11.99, -11.93, top - 0.2, top + 1.0)

# ================================================================ ЮЖНЫЙ БЕЛЫЙ КОРПУС
def south_block():
    u0, u1 = U_FIN, U_END
    top = 16.4
    # западный фасад: витрины на первом этаже, выше — белая плоскость
    shop = []
    step = (u1 - u0 - 5.5) / 4
    for i in range(4):
        cu = u0 + 5.0 + step * (i + 0.5)
        shop.append((cu - 1.5, cu + 1.5, 0.5, 3.6))
    wall(FW, u0, u1, 0.0, top, 0.0, shop)
    for ua, ub, za, zb in shop:
        glazing_dark(FW, ua, ub, za, zb, 0.0, cols=3, rows=(0.72,))
        box('stone', FW, ua - 0.2, ub + 0.2, 0.0, 0.14, za - 0.12, za)
        box('wall3', FW, ua - 0.2, ub + 0.2, 0.0, 0.08, 0.0, za - 0.12)
    box('stone', FW, u0, u1, 0.0, 0.1, 0.0, 0.5)
    band_all(u0, u1, -D, 0.0, 3.8, 4.1, 0.06, west=True)
    band_all(u0, u1, -D, 0.0, 9.9, 10.15, 0.06, west=True)
    # южный торец
    Fs = f_south(u1, 0.0)
    wall(Fs, 0, D, GROUND, top, 0, punched(Fs, 1.2, D - 1.2, 0, 0, top, 5, 4, w=1.8, z_first=1.2, pitch=3.7))
    # восток
    Fe = f_east(u1)
    wall(Fe, 0, u1 - u0, GROUND, top, D, punched(Fe, 0.8, u1 - u0 - 0.8, D, 0, top, 5, 4, w=1.8))
    roof_and_parapet(u0, u1, -D, 0.0, top - 0.8, west=True, north=False)
    # низкая пристройка на восток (двор)
    DA = 43.8
    ua0, ua1, ht = u0, u1, 5.4
    Fe2 = f_east(ua1)
    wall(Fe2, 0, ua1 - ua0, GROUND, ht, DA, punched(Fe2, 1.0, ua1 - ua0 - 1.0, DA, 0, ht, 4, 1, w=1.6, h=1.8, z_first=1.8))
    Fs2 = f_south(ua1, -D)
    wall(Fs2, 0, DA - D, GROUND, ht, 0, [])
    Fn2 = f_north(ua0, -DA)
    wall(Fn2, 0, DA - D, GROUND, ht, 0, [])
    face('roof', [FW.p(ua0, -DA, ht), FW.p(ua1, -DA, ht), FW.p(ua1, -D, ht), FW.p(ua0, -D, ht)], UP)
    box('trim', FW, ua0, ua1, -DA, -D, ht, ht + 0.12)

glass_wing()
fin_block()
south_block()

finish('dom_oficerov', __file__)
