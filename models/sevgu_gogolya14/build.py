# СевГУ, корпус на ул. Гоголя, 14 (бывший судостроительный техникум, арх.
# Б. Митник, 1950) — модель с нуля.
#
#   blender -b --python models/sevgu_gogolya14/build.py -- [glb]
#
# Контур OSM way 111424195 — «меандр» из пяти корпусов под прямыми углами,
# повёрнутый на ~22° к осям мира. План собран в местной системе:
#   a — вдоль ул. Гоголя на юг (SSW), b — поперёк, к улице (ESE);
#   уличная линия фасадов — b = 0, ротонда — на углу, a ≈ 1.25.
# Корпуса (a, b в метрах, сверено с контуром — рёбра ложатся на сетку с
# точностью 0.5 м):
#   SW  южное крыло вдоль улицы    a 10.4…74.9, b −19.6…0
#   MW  среднее крыло с ротондой   a −8…11.4,   b −36.2…0
#   WB  западный корпус (охра)     a −55.5…11.4, b −52.4…−36.2
#   NW  северное крыло             a −55.5…−34.5, b −36.2…−20
#   NE  северный корпус вдоль улицы a −95.5…−34.5, b −20…0
# Между NE и MW — двор с воротами на улицу (a −34.5…−8).
# Фасады — фото Викисклада 2015 (refs/g1…g4) и панорамы Яндекса 2020/2025
# (refs/ya_*). Что видно и что наугад — NOTES.md. Ноль высоты — тротуар у
# ротонды.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

# ------------------------------------------------------------------ местная система
_s = (-0.381, 0.925); _l = math.hypot(*_s)
SA = (_s[0] / _l, _s[1] / _l)                 # +a в мире (x, z)
SB = (SA[1], -SA[0])                          # +b в мире: (0.925, 0.381)
O = (-421.3, 2109.7)

def LW(a, b):
    return (O[0] + a * SA[0] + b * SB[0], O[1] + a * SA[1] + b * SB[1])

CA, CB = 1.25, -0.5                           # ось ротонды
X0, Z0 = [round(c, 2) for c in LW(CA, CB)]
origin(X0, Z0)
VA = Vector((SA[0], -SA[1]))                  # +a в плане Blender
VB = Vector((SB[0], -SB[1]))                  # +b в плане Blender
DIRS = {'+a': VA, '-a': -VA, '+b': VB, '-b': -VB}

def P2(a, b):
    return W(*LW(a, b))

def FR(a, b, u, n):
    """Рамка: начало в (a, b), u и n — '+a', '-b'…"""
    return Frame(P2(a, b), DIRS[u], DIRS[n])

# ------------------------------------------------------------------ цвета
COL['wall'] = ((0.82, 0.78, 0.69), 0.9)       # инкерманский камень, замер по фото #d9d1bd
COL['trim'] = ((0.88, 0.85, 0.78), 0.85)      # карнизы, наличники — чуть светлее
COL['wall2'] = ((0.85, 0.75, 0.53), 0.9)      # охристая штукатурка западного корпуса
COL['wall3'] = ((0.94, 0.93, 0.90), 0.85)     # белёный портик и низ ротонды
COL['stone'] = ((0.62, 0.60, 0.55), 0.9)      # цоколь, ступени, швы руста
COL['roof'] = ((0.55, 0.54, 0.52), 0.75)      # серая металлическая кровля
COL['glass'] = ((0.10, 0.12, 0.14), 0.15)
COL['wood'] = ((0.82, 0.78, 0.69), 0.9)       # = камень: гранёный руст ротонды (не в дальнем уровне)
COL['metal'] = ((0.14, 0.15, 0.16), 0.5)

GROUND = -3.0
Z_PL = 0.8        # верх цоколя
Z_B1 = 4.6        # пояс над первым этажом
Z_B2 = 9.3        # подоконный пояс третьего этажа
EAVE = 14.5       # верх венчающего карниза = свес кровли
COR = EAVE - 0.6  # низ карниза (kit.cornice — три полки по 0.2)
STEP = 3.7        # шаг осей окон, замер по фото (6 арок ≈ 22 м)

# окна: ширина, низ, высота (у арочных — высота до пяты и радиус)
W1 = (1.40, 1.45, 2.15)
W2 = (1.45, 5.55, 2.50)
W3 = (1.40, 9.85, 1.70, 0.70)

# ------------------------------------------------------------------ примитивы
def quad(m, F, u0, u1, z0, z1, d, hint=None):
    face(m, [F.p(u0, d, z0), F.p(u1, d, z0), F.p(u1, d, z1), F.p(u0, d, z1)], hint if hint is not None else F.N())

def slab(m, F, u0, u1, d0, d1, z0, z1):
    """Брусок без задней и нижней граней (полка, подоконник, сандрик)."""
    quad(m, F, u0, u1, z0, z1, d1)
    face(m, [F.p(u0, d0, z1), F.p(u1, d0, z1), F.p(u1, d1, z1), F.p(u0, d1, z1)], UP)
    face(m, [F.p(u0, d0, z0), F.p(u1, d0, z0), F.p(u1, d1, z0), F.p(u0, d1, z0)], -UP)
    face(m, [F.p(u0, d0, z0), F.p(u0, d1, z0), F.p(u0, d1, z1), F.p(u0, d0, z1)], -F.U())
    face(m, [F.p(u1, d0, z0), F.p(u1, d1, z0), F.p(u1, d1, z1), F.p(u1, d0, z1)], F.U())

def arc_pts(cu, zs, r, n, r_extra=0.0):
    R = r + r_extra
    return [(cu + R * math.cos(math.pi * k / n), zs + R * math.sin(math.pi * k / n)) for k in range(n + 1)]

def wall_h(F, u0, u1, z0, z1, d, holes, m='wall', reveal=0.22, rm='trim'):
    """Стена с проёмами; проём (ua, ub, za, zb, r): r > 0 — арка с пятой на zb − r.
    Проёмы одного ряда — одной высоты: стена режется на сплошные полосы между
    рядами и простенки внутри ряда (вдвое дешевле сетки по всем рёбрам)."""
    rows = sorted({(h[2], h[3]) for h in holes})
    z = z0
    for za, zb in rows:
        if za > z + 1e-6:
            quad(m, F, u0, u1, z, za, d)
        hs = sorted([h for h in holes if (h[2], h[3]) == (za, zb)])
        u = u0
        for h in hs:
            if h[0] > u + 1e-6:
                quad(m, F, u, h[0], za, zb, d)
            u = h[1]
        if u1 > u + 1e-6:
            quad(m, F, u, u1, za, zb, d)
        z = zb
    if z1 > z + 1e-6:
        quad(m, F, u0, u1, z, z1, d)
    r_ = d - reveal
    for ua, ub, za, zb, ar in holes:
        top = zb - ar if ar else zb
        face(rm, [F.p(ua, d, za), F.p(ua, r_, za), F.p(ua, r_, top), F.p(ua, d, top)], F.U())
        face(rm, [F.p(ub, d, za), F.p(ub, r_, za), F.p(ub, r_, top), F.p(ub, d, top)], -F.U())
        face(rm, [F.p(ua, d, za), F.p(ub, d, za), F.p(ub, r_, za), F.p(ua, r_, za)], UP)
        if not ar:
            face(rm, [F.p(ua, d, zb), F.p(ub, d, zb), F.p(ub, r_, zb), F.p(ua, r_, zb)], -UP)
            continue
        cu, n = (ua + ub) / 2, 6
        arc = arc_pts(cu, top, ar, n)
        # пазухи над аркой — заполняем стену до верха прямоугольного выреза
        face(m, [F.p(ub, d, zb)] + [F.p(u, d, z) for u, z in arc[:n // 2 + 1]], F.N())
        face(m, [F.p(ua, d, zb)] + [F.p(u, d, z) for u, z in arc[n // 2:]], F.N())
        for k in range(n):
            (pa, za_), (pb, zb_) = arc[k], arc[k + 1]
            face(rm, [F.p(pa, d, za_), F.p(pb, d, zb_), F.p(pb, r_, zb_), F.p(pa, r_, za_)],
                 F.p(cu, d, top) - F.p((pa + pb) / 2, d, (za_ + zb_) / 2))

def glass_win(F, cu, za, w, h, d, ar=0.0, cross=True):
    """Стекло и переплёт (крест) на глубине d."""
    ua, ub = cu - w / 2, cu + w / 2
    pts = [(ua, za), (ub, za), (ub, za + h)]
    if ar:
        pts += arc_pts(cu, za + h, ar, 6)[1:-1]
    pts += [(ua, za + h)]
    face('glass', [F.p(u, d, z) for u, z in pts], F.N())
    if not cross:
        return
    t = 0.035
    top = za + h + (ar if ar else 0) - 0.02
    quad('trim', F, cu - t, cu + t, za, top, d + 0.03)
    zt = za + h * (0.70 if not ar else 1.0)
    quad('trim', F, ua, ub, zt - t, zt + t, d + 0.03)

def frame_band(F, ua, ub, za, zb, d, w=0.14, pr=0.05):
    """Плоский наличник: три полосы (без нижней — там подоконник)."""
    quad('trim', F, ua - w, ua, za, zb + w, d + pr)
    quad('trim', F, ub, ub + w, za, zb + w, d + pr)
    quad('trim', F, ua, ub, zb, zb + w, d + pr)

def archivolt(F, cu, zs, r, d, w=0.16, pr=0.05):
    a1, a2 = arc_pts(cu, zs, r, 6), arc_pts(cu, zs, r + w, 6)
    for k in range(6):
        face('trim', [F.p(a1[k][0], d + pr, a1[k][1]), F.p(a1[k + 1][0], d + pr, a1[k + 1][1]),
                      F.p(a2[k + 1][0], d + pr, a2[k + 1][1]), F.p(a2[k][0], d + pr, a2[k][1])], F.N())
    quad('trim', F, cu - 0.11, cu + 0.11, zs + r - 0.05, zs + r + w + 0.08, d + pr + 0.04)   # замковый камень

def sill(F, ua, ub, z, d, pr=0.14):
    a, b = ua - 0.12, ub + 0.12
    quad('trim', F, a, b, z - 0.12, z, d + pr)
    face('trim', [F.p(a, d, z), F.p(b, d, z), F.p(b, d + pr, z), F.p(a, d + pr, z)], UP)

def pediment(F, cu, w, z, d):
    """Треугольный сандрик на кронштейнах."""
    hw = w / 2 + 0.28
    slab('trim', F, cu - hw, cu + hw, d, d + 0.2, z, z + 0.1)
    rise = 0.5
    face('trim', [F.p(cu - hw, d + 0.12, z + 0.1), F.p(cu + hw, d + 0.12, z + 0.1), F.p(cu, d + 0.12, z + 0.1 + rise)], F.N())
    for s in (-1, 1):
        face('trim', [F.p(cu + s * hw, d, z + 0.1), F.p(cu + s * hw, d + 0.2, z + 0.1),
                      F.p(cu, d + 0.2, z + 0.1 + rise), F.p(cu, d, z + 0.1 + rise)], UP + F.U() * s * 1.5)
    for s in (-1, 1):
        quad('trim', F, cu + s * (w / 2 + 0.05) - 0.08, cu + s * (w / 2 + 0.05) + 0.08, z - 0.35, z, d + 0.12)

def modil(F, u, d0, d1, z0, z1, w=0.08):
    quad('trim', F, u - w, u + w, z0, z1, d1)
    face('trim', [F.p(u - w, d0, z0), F.p(u + w, d0, z0), F.p(u + w, d1, z0), F.p(u - w, d1, z0)], -UP)
    face('trim', [F.p(u - w, d0, z0), F.p(u - w, d1, z0), F.p(u - w, d1, z1), F.p(u - w, d0, z1)], -F.U())
    face('trim', [F.p(u + w, d0, z0), F.p(u + w, d1, z0), F.p(u + w, d1, z1), F.p(u + w, d0, z1)], F.U())

def cornice_mod(F, u0, u1, d, z, ext=0.55, mod=True):
    """Венчающий карниз: фриз, полки и модульоны под выносной плитой."""
    cornice(F, u0, u1, d, z, ext)
    quad('trim', F, u0 - 0.05, u1 + 0.05, z - 0.45, z - 0.3, d + 0.04)         # тяга под фризом
    if not mod:
        return
    k = u0 + 0.4
    while k < u1 - 0.3:
        modil(F, k, d, d + ext - 0.06, z + 0.24, z + 0.42)
        k += 0.8

# ------------------------------------------------------------------ рядовой фасад
def bays(L, step=STEP, margin=1.3, skip=()):
    n = max(0, int((L - 2 * margin) / step) + 1)
    if n == 0:
        return []
    s0 = (L - (n - 1) * step) / 2
    return [s0 + i * step for i in range(n) if not any(a <= s0 + i * step <= b for a, b in skip)]

def facade(F, u0, u1, mode='flat', ped=False, ped_ends=0, mod=False, rust=False, skip=(),
           balcony=False, eave=EAVE, ends=True, centers=None, f1=True):
    """Трёхэтажный каменный фасад: цоколь, первый этаж (руст), окна второго
    этажа (на уличных — с сандриками у краёв), арочные окна третьего, карниз.
    mode='hole' — окна настоящими проёмами в стене (уличные фасады), 'flat' —
    стекло поверх стены (дворы)."""
    L = u1 - u0
    cs = centers if centers is not None else [u0 + c for c in bays(L, skip=skip)]
    d = 0.0
    holes = []
    idx = []
    for i, cu in enumerate(cs):
        if f1:
            holes.append((cu - W1[0] / 2, cu + W1[0] / 2, W1[1], W1[1] + W1[2], 0)); idx.append(i)
        holes.append((cu - W2[0] / 2, cu + W2[0] / 2, W2[1], W2[1] + W2[2], 0)); idx.append(i)
        holes.append((cu - W3[0] / 2, cu + W3[0] / 2, W3[1], W3[1] + W3[2] + W3[3], W3[3])); idx.append(i)
    if mode == 'hole':
        wall_h(F, u0, u1, Z_PL, eave, d, holes)
    else:
        quad('wall', F, u0, u1, Z_PL, eave, d)
    box('stone', F, u0, u1, d - 0.3, d + 0.08, GROUND, Z_PL)
    band(F, u0, u1, d, Z_PL, Z_PL + 0.1, 0.1)
    band(F, u0, u1, d, Z_B1, Z_B1 + 0.25, 0.1)
    band(F, u0, u1, d, Z_B2 - 0.12, Z_B2, 0.08)
    cornice_mod(F, u0, u1, d, eave - 0.6, mod=mod)
    gd = d - 0.2 if mode == 'hole' else d + 0.02
    for i, (ua, ub, za, zb, ar) in enumerate(holes):
        cu = (ua + ub) / 2
        h = (zb - ar - za) if ar else (zb - za)
        glass_win(F, cu, za, ub - ua, h, gd, ar, cross=(mode == 'hole' or za > 5))
        if za < 2:                                         # первый этаж
            sill(F, ua, ub, za, d)
        elif za < 6:                                       # второй этаж
            sill(F, ua, ub, za, d)
            frame_band(F, ua, ub, za, zb, d)
            k = idx[i]
            if ped or (ped_ends and (k < ped_ends or k >= len(cs) - ped_ends)):
                pediment(F, cu, ub - ua, zb + 0.18, d)
        else:                                              # третий этаж, арки
            sill(F, ua, ub, za, d, pr=0.1)
            archivolt(F, cu, zb - ar, ar, d)
            if balcony:
                slab('trim', F, ua - 0.5, ub + 0.5, d, d + 0.9, za - 0.25, za - 0.05)
                beam('metal', F.p(ua - 0.45, d + 0.85, za + 0.85), F.p(ub + 0.45, d + 0.85, za + 0.85), 0.05)
                for kk in range(8):
                    u = ua - 0.45 + (ub - ua + 0.9) * kk / 7
                    quad('metal', F, u - 0.02, u + 0.02, za - 0.05, za + 0.85, d + 0.85)
    if rust:                                               # швы руста первого этажа
        zs = [Z_PL + 0.55 * k for k in range(1, 7) if Z_PL + 0.55 * k < Z_B1 - 0.1]
        for z in zs:
            cuts = sorted([(h[0] - 0.12, h[1] + 0.12) for h in holes if h[2] - 0.15 < z < h[3] + 0.15])
            u = u0
            for a, b in cuts + [(u1, u1)]:
                if a > u + 0.05:
                    quad('stone', F, u, a, z, z + 0.05, d + 0.006)
                u = max(u, b)
    if ends:                                               # угловые лопатки
        for a, b in ((u0, u0 + 0.9), (u1 - 0.9, u1)):
            quad('trim', F, a, b, Z_B1 + 0.25, eave - 0.6, d + 0.07)
    return cs

def end_wall(F, u0, u1, z0, z1, m='wall'):
    quad(m, F, u0, u1, z0, z1, 0)

# ================================================================== КОРПУСА
def build_sw():
    # уличный фасад южного крыла (a 10.4…74.9), смотрит на улицу (+b)
    F = FR(0, 0, '+a', '+b')
    facade(F, 10.5, 74.9, mode='hole', ped_ends=0, mod=True, rust=True)
    # торец на юг
    Fe = FR(74.9, 0, '-b', '+a')
    facade(Fe, 0, 19.6, mode='flat', mod=False)
    # дворовый фасад (b = −19.6), смотрит на запад
    Fy = FR(74.9, -19.6, '-a', '-b')
    facade(Fy, 0, 74.9 - 11.4, mode='flat', ped=True)
    Fr = FR(0, 0, '+a', '+b')
    hip_roof(Fr, 1.7, 74.9, 0, -19.6, EAVE, 3.76, hip0=False, hip1=True)
    for u, dd in ((24, -5), (44, -14.5), (63, -5)):
        z = EAVE + 3.76 * (0.55 + min(-dd, 19.6 + dd)) / (9.8 + 0.55)
        chimney(Fr, u, dd, EAVE, z + 1.1, 0.8)

def build_mw():
    # северный фасад среднего крыла — во двор с воротами (a = −8)
    F = FR(-8, -36.2, '+b', '-a')
    facade(F, 0, 36.2 - 1.0, mode='flat', ped=True)
    # южный фасад — во второй двор (a = 11.4), от b −19.6 до −36.2
    Fs = FR(11.4, -19.6, '-b', '+a')
    facade(Fs, 0, 16.6, mode='flat')
    # западный торец над охристым корпусом: полоса стены выше его карниза
    Fw = FR(-8, -36.2, '+a', '-b')
    quad('wall', Fw, 0, 19.4, 12.0, EAVE, 0)
    cornice(Fw, 0, 19.4, 0, EAVE - 0.6, 0.5)
    Fr = FR(0, 0, '+b', '+a')
    hip_roof(Fr, -36.2, 0.0, 11.4, -8, EAVE, 3.72, hip0=False, hip1=True)

def build_wb():
    """Западный корпус: охристая штукатурка, два высоких этажа, пилястры
    (фото g2 — со двора). Карниз ниже каменных крыльев."""
    E = 13.0
    def ochre(F, u0, u1, door=None, n=None):
        L = u1 - u0
        cs = [u0 + c for c in bays(L, 4.2, 1.6)] if n is None else [u0 + L * (i + 0.5) / n for i in range(n)]
        quad('wall2', F, u0, u1, Z_PL, E, 0)
        box('stone', F, u0, u1, -0.3, 0.1, GROUND, Z_PL)
        quad('wall3', F, u0, u1, Z_PL, Z_PL + 0.5, 0.04)                 # белёный цоколь
        band(F, u0, u1, 0, 5.0, 5.25, 0.1)
        band(F, u0, u1, 0, E - 1.9, E - 1.75, 0.06)
        cornice(F, u0, u1, 0, E - 0.6, 0.45)
        for i in range(len(cs) + 1):                                   # пилястры между осями
            u = u0 + 0.4 if i == 0 else (u1 - 0.4 if i == len(cs) else (cs[i - 1] + cs[i]) / 2)
            quad('trim', F, u - 0.35, u + 0.35, Z_PL + 0.5, E - 0.6, 0.08)
        for i, cu in enumerate(cs):
            if door is not None and i == door:
                face('metal', [F.p(cu - 0.8, 0.02, Z_PL), F.p(cu + 0.8, 0.02, Z_PL), F.p(cu + 0.8, 0.02, Z_PL + 2.9),
                              F.p(cu - 0.8, 0.02, Z_PL + 2.9)], F.N())
                frame_band(F, cu - 0.8, cu + 0.8, Z_PL, Z_PL + 2.9, 0, 0.3, 0.08)
                pediment(F, cu, 1.6, Z_PL + 3.25, 0)
            else:
                glass_win(F, cu, 1.6, 1.5, 2.3, 0.02)
                sill(F, cu - 0.75, cu + 0.75, 1.6, 0)
            glass_win(F, cu, 6.3, 1.5, 2.7, 0.02)
            sill(F, cu - 0.75, cu + 0.75, 6.3, 0)
            frame_band(F, cu - 0.75, cu + 0.75, 6.3, 9.0, 0)
        return cs
    ochre(FR(-34.5, -36.2, '+a', '+b'), 0, 26.5, door=3, n=6)        # во двор с воротами
    ochre(FR(11.4, -52.4, '-a', '-b'), 0, 66.9)                        # задний, на запад
    ochre(FR(11.4, -36.2, '-b', '+a'), 0, 16.2, n=3)                   # южный торец
    ochre(FR(-55.5, -52.4, '+b', '-a'), 0, 16.2, n=3)                  # северный торец
    Fr = FR(0, 0, '+a', '+b')
    hip_roof(Fr, -55.5, 11.4, -36.2, -52.4, E, 3.1, hip0=True, hip1=True)
    zr = lambda dd: E + 3.1 * (0.55 - abs(dd + 44.3) + 8.1) / (8.1 + 0.55)
    for u in (-27.5, -14.5):
        dormer(Fr, u, -37.8, zr(-37.8) - 0.1, r=0.7, depth=2.6)
    for u, dd in ((-48, -42), (-30, -46), (-12, -42), (4, -46)):
        chimney(Fr, u, dd, E, zr(dd) + 1.0, 0.7)

def build_nw():
    F = FR(-34.5, -36.2, '+b', '+a')                                   # во двор (a = −34.5)
    facade(F, 0, 16.2, mode='flat', balcony=True, ends=False)
    Fn = FR(-55.5, -20, '-b', '-a')                                    # на север
    facade(Fn, 0, 16.2, mode='flat', ends=False)
    Fr = FR(0, 0, '+b', '+a')
    hip_roof(Fr, -36.2, -10, -34.5, -55.5, EAVE, 3.84, hip0=False, hip1=False)

def build_ne():
    F = FR(-95.5, 0, '+a', '+b')                                       # уличный
    facade(F, 0, 61.0, mode='hole', mod=True, rust=True, ped_ends=1)
    Fb = FR(-55.5, -20, '-a', '-b')                                    # задний, на запад
    facade(Fb, 0, 40.0, mode='flat')
    Fn = FR(-95.5, -20, '+b', '-a')                                    # северный торец
    facade(Fn, 0, 20.0, mode='flat')
    Fs = FR(-34.5, 0, '-b', '+a')                                      # южный торец во двор
    facade(Fs, 0, 20.0, mode='flat', balcony=True, ends=False)
    Fr = FR(0, 0, '+a', '+b')
    hip_roof(Fr, -95.5, -34.5, 0, -20, EAVE, 3.84, hip0=True, hip1=True)
    for u, dd in ((-85, -5), (-62, -15), (-45, -5)):
        z = EAVE + 3.84 * (0.55 + min(-dd, 20 + dd)) / (10 + 0.55)
        chimney(Fr, u, dd, EAVE, z + 1.1, 0.8)

# ================================================================== РОТОНДА
R = 6.0           # стена ротонды (обмер по фото: диаметр ≈ 12.5 м)
RP = 8.1          # ось колонн портика
TH = 82.0         # видимая дуга ротонды между боковыми ризалитами, ±градусов

def dirv(th):
    t = math.radians(th)
    return VB * math.cos(t) + VA * math.sin(t)

def tang(th):
    t = math.radians(th)
    return -VB * math.sin(t) + VA * math.cos(t)

def cp(r, th, z):
    v = dirv(th) * r
    return Vector((v.x, v.y, z))

def arc_lathe(m, prof, th0, th1, seg, cap=False, smooth=True):
    """Тело вращения на дуге th0…th1 вокруг оси ротонды. prof = [(r, z)] —
    снаружи снизу вверх, по верху внутрь. Кольца общие вдоль дуги (гладко),
    у соседних поясков свои (острые рёбра руста)."""
    bm = bm_of(m)
    ths = [th0 + (th1 - th0) * k / seg for k in range(seg + 1)]
    for i in range(len(prof) - 1):
        (r1, z1), (r2, z2) = prof[i], prof[i + 1]
        if abs(r1 - r2) < 1e-6 and abs(z1 - z2) < 1e-6:
            continue
        ra = [bm.verts.new(cp(r1, t, z1)) for t in ths] if r1 > 1e-6 else [bm.verts.new(cp(0, 0, z1))] * len(ths)
        rb = [bm.verts.new(cp(r2, t, z2)) for t in ths] if r2 > 1e-6 else [bm.verts.new(cp(0, 0, z2))] * len(ths)
        nr, nz = (z2 - z1), -(r2 - r1)
        for k in range(seg):
            vs = [ra[k], ra[k + 1], rb[k + 1], rb[k]]
            vs = [v for j, v in enumerate(vs) if v not in vs[:j]]
            if len(vs) < 3:
                continue
            try:
                f = bm.faces.new(vs)
            except ValueError:
                continue
            f.normal_update()
            tm = (ths[k] + ths[k + 1]) / 2
            hint = Vector((*(dirv(tm) * nr), 0)) + UP * nz
            if f.normal.dot(hint) < 0:
                f.normal_flip()
            f.smooth = smooth
    if cap:
        for th, s in ((th0, -1), (th1, 1)):
            t = tang(th) * s
            face(m, [cp(r, th, z) for r, z in prof], Vector((t.x, t.y, 0)))

def rframe(th, r):
    """Касательная рамка к ротонде на угле th, на радиусе r."""
    return Frame(dirv(th) * r, tang(th), dirv(th))

def build_rotunda():
    # первый этаж за колоннадой — белёная гладкая стена с дверями
    arc_lathe('wall3', [(R, GROUND), (R, Z_B1)], -TH, TH, 24)
    for th in (-26, 0, 26):
        F = rframe(th, R)
        face('metal', [F.p(-0.85, 0.06, 0.9), F.p(0.85, 0.06, 0.9), F.p(0.85, 0.06, 3.3), F.p(-0.85, 0.06, 3.3)], F.N())
        quad('glass', F, -0.85, 0.85, 3.4, 4.0, 0.06)
        frame_band(F, -0.85, 0.85, 0.9, 4.0, 0.06, 0.16, 0.06)
        quad('trim', F, -0.02, 0.02, 0.9, 3.3, 0.08)
    for th in (-52, 52, -72, 72):
        F = rframe(th, R)
        glass_win(F, 0, 1.6, 1.3, 2.2, 0.07)
        sill(F, -0.65, 0.65, 1.6, 0.06)
    # руст второго-третьего этажей: пояски с фаской снизу
    # (дальний уровень — гладкий цилиндр 'wall'; гранёные пояски — 'wood',
    # перекрашенный в цвет камня: в дальний уровень он не идёт)
    arc_lathe('wall', [(R, Z_B1), (R, COR)], -TH, TH, 22)
    prof = []
    z = Z_B1 + 0.45
    n = 0
    while z < COR - 0.9:
        z1 = min(z + 0.6, COR - 0.45)
        prof += [(R, z), (R + 0.13, z + 0.15), (R + 0.13, z1 - 0.15), (R, z1)]
        # вертикальные швы между блоками, вперевязку через ряд
        k = 0
        while True:
            th = -TH + 4.0 + (k + (0.5 if n % 2 else 0)) * 9.6
            if th > TH - 3: break
            if min(abs(th - w) for w in (-42, 0, 42)) < 9.5:
                k += 1
                continue
            Fj = rframe(th, R + 0.135)
            quad('stone', Fj, -0.025, 0.025, z + 0.04, z1 - 0.04, 0)
            k += 1
        z = z1
        n += 1
    arc_lathe('wood', prof, -TH, TH, 22)
    # венчающий карниз ротонды и плоская площадка вокруг барабана
    arc_lathe('trim', [(R, COR), (R + 0.12, COR), (R + 0.12, COR + 0.22), (R + 0.32, COR + 0.3),
                       (R + 0.36, COR + 0.42), (R + 0.62, COR + 0.46), (R + 0.62, EAVE), (5.4, EAVE)],
              -TH - 4, TH + 4, 26)
    k = -TH
    while k <= TH:
        F = rframe(k, R)
        box('trim', F, -0.08, 0.08, 0, 0.58, COR + 0.24, COR + 0.44)
        k += 6.5
    # окна ротонды: второй этаж прямоугольные с полкой, третий — арочные
    for th in (-42, 0, 42):
        F = rframe(th, R + 0.12)          # перед гранями руста (R + 0.13 по середине пояска)
        glass_win(F, 0, W2[1] + 0.1, 1.4, 2.4, 0.07)
        sill(F, -0.7, 0.7, W2[1] + 0.1, 0.02)
        frame_band(F, -0.7, 0.7, W2[1] + 0.1, W2[1] + 2.5, 0.02, 0.16, 0.08)
        slab('trim', F, -1.0, 1.0, 0.02, 0.3, W2[1] + 2.66, W2[1] + 2.82)
        if th == 0:                                               # балкон с решёткой и высокое окно
            za, h = W3[1] - 0.2, W3[2] + 0.35
            slab('trim', F, -1.0, 1.0, 0, 0.75, za - 0.25, za)
            beam('metal', F.p(-0.95, 0.7, za + 0.95), F.p(0.95, 0.7, za + 0.95), 0.05)
            for kk in range(7):
                u = -0.95 + 1.9 * kk / 6
                beam('metal', F.p(u, 0.7, za), F.p(u, 0.7, za + 0.95), 0.03)
        else:
            za, h = W3[1], W3[2]
        glass_win(F, 0, za, 1.35, h, 0.07, 0.675)
        sill(F, -0.68, 0.68, za, 0.02, 0.1)
        archivolt(F, 0, za + h, 0.675, 0.02, 0.18, 0.08)
    # барабан-аттик с лентой окон и плоской крышей
    RD = 5.4
    arc_lathe('wall', [(RD, EAVE - 1.0), (RD, 18.2)], -180, 180, 28)
    arc_lathe('trim', [(RD, 18.2), (RD + 0.25, 18.35), (RD + 0.45, 18.6), (RD + 0.45, 18.8), (RD + 0.05, 18.8),
                       (RD + 0.05, 19.25), (RD + 0.15, 19.3), (RD + 0.15, 19.45), (RD - 0.25, 19.45)], -180, 180, 28)
    arc_lathe('roof', [(RD - 0.25, 19.0), (0, 19.0)], -180, 180, 14, smooth=False)
    band_z = [(15.0, 15.2)]
    arc_lathe('trim', [(RD, 15.0), (RD + 0.1, 15.0), (RD + 0.1, 15.2), (RD, 15.2)], -180, 180, 28)
    for i in range(12):
        th = -165 + i * 30
        F = rframe(th, RD)
        glass_win(F, 0, 15.6, 1.0, 1.75, 0.07)
        frame_band(F, -0.5, 0.5, 15.6, 17.35, 0.05, 0.13, 0.06)
        sill(F, -0.5, 0.5, 15.6, 0.03, 0.1)
    beam('metal', Vector((0, 0, 19.0)), Vector((0, 0, 25.5)), 0.08)                  # флагшток
    # боковые ризалиты: торцы крыльев по сторонам ротонды
    for a0, a1 in ((-8.0, -4.2), (6.7, 10.5)):
        F = FR(a0, 0.6, '+a', '+b')
        L = a1 - a0
        quad('wall3', F, 0, L, GROUND, Z_B1, 0)
        quad('wall', F, 0, L, Z_B1, EAVE, 0)
        cu = L / 2
        glass_win(F, cu, W1[1], W1[0], W1[2], 0.02)
        sill(F, cu - W1[0] / 2, cu + W1[0] / 2, W1[1], 0)
        glass_win(F, cu, W2[1], W2[0], W2[2], 0.02)
        sill(F, cu - W2[0] / 2, cu + W2[0] / 2, W2[1], 0)
        frame_band(F, cu - W2[0] / 2, cu + W2[0] / 2, W2[1], W2[1] + W2[2], 0)
        pediment(F, cu, W2[0], W2[1] + W2[2] + 0.18, 0)
        glass_win(F, cu, W3[1], W3[0], W3[2], 0.02, W3[3])
        sill(F, cu - W3[0] / 2, cu + W3[0] / 2, W3[1], 0, 0.1)
        archivolt(F, cu, W3[1] + W3[2], W3[3], 0)
        band(F, 0, L, 0, Z_B1, Z_B1 + 0.25, 0.1)
        band(F, 0, L, 0, Z_B2 - 0.12, Z_B2, 0.08)
        for a, b in ((0, 0.5), (L - 0.5, L)):
            quad('trim', F, a, b, Z_B1 + 0.25, COR, 0.07)
        cornice_mod(F, 0, L, 0, COR)
        # бока ризалита (0.6 м выступа + до стены ротонды)
        for u, s in ((0, -1), (L, 1)):
            Fs = Frame(F.p(u, 0, 0).xy, -F.n, F.u * s)
            quad('wall', Fs, 0, 1.6, GROUND, EAVE, 0)
        # аттик с балясником над карнизом
        box('trim', F, 0.05, L - 0.05, -1.5, -0.05, EAVE, EAVE + 0.25)
        for a, b in ((0.05, 0.55), (L - 0.55, L - 0.05)):
            box('trim', F, a, b, -1.0, -0.1, EAVE + 0.25, EAVE + 1.1)
        box('trim', F, 0.05, L - 0.05, -1.0, -0.05, EAVE + 1.1, EAVE + 1.25)
        u = 0.75
        while u < L - 0.6:
            box('trim', F, u - 0.07, u + 0.07, -0.5, -0.36, EAVE + 0.25, EAVE + 1.1, bottom=False)
            u += 0.3
    # стена за ротондой на уличной линии (между ризалитами) — внутри ротонды,
    # но видна в щели над барабаном
    F = FR(-4.2, 0, '+a', '+b')
    quad('wall', F, 0, 10.9, EAVE - 1.0, EAVE, -0.2)

def build_portico():
    """Полукруглый портик: стилобат со ступенями, шесть колонн парами, белый
    антаблемент-балкон с балюстрадой."""
    T0, T1 = -90.0, 90.0
    st = [(10.4, GROUND), (10.4, 0.18), (10.05, 0.18), (10.05, 0.36), (9.7, 0.36), (9.7, 0.54),
          (9.35, 0.54), (9.35, 0.72), (9.0, 0.72), (9.0, 0.9), (R, 0.9), (R, GROUND)]
    arc_lathe('stone', st, T0, T1, 20, cap=True, smooth=False)
    ZC0, ZC1 = 0.9, 4.4
    for th0 in (-52, 0, 52):
        for dth in (-3.6, 3.6):
            th = th0 + dth
            base = cp(RP, th, 0)
            prof = [(0.30, ZC0 + 0.06), (0.27, ZC0 + 0.24), (0.25, ZC1 - 0.4), (0.27, ZC1 - 0.3),
                    (0.34, ZC1 - 0.12)]
            lathe('trim_s', base, prof, 8, cap=False)
            F = rframe(th, RP)
            box('trim', F, -0.38, 0.38, -0.38, 0.38, ZC0 - 0.02, ZC0 + 0.06)      # плинт
            box('trim', F, -0.38, 0.38, -0.38, 0.38, ZC1 - 0.12, ZC1)             # абака
    for th in (-87.5, 87.5):                                                       # анты у ризалитов
        F = rframe(th, RP)
        box('wall3', F, -0.32, 0.32, -0.32, 0.32, ZC0, ZC1)
    # антаблемент и плита балкона
    arc_lathe('wall3', [(R, ZC1), (8.6, ZC1), (8.6, ZC1 + 0.5), (8.85, ZC1 + 0.55), (8.85, ZC1 + 0.75), (R, ZC1 + 0.75)],
              T0, T1, 30, cap=True, smooth=False)
    # балюстрада
    zb = ZC1 + 0.75
    RB = 8.5
    arc_lathe('trim', [(RB + 0.15, zb), (RB + 0.15, zb + 0.15), (RB - 0.15, zb + 0.15)], T0, T1, 24, smooth=False)
    arc_lathe('trim', [(RB + 0.18, zb + 0.85), (RB + 0.18, zb + 1.0), (RB - 0.18, zb + 1.0), (RB - 0.18, zb + 0.85)],
              T0, T1, 24, smooth=False)
    posts = (-89, -52, 0, 52, 89)
    for th in posts:
        F = rframe(th, RB)
        box('trim', F, -0.22, 0.22, -0.2, 0.2, zb, zb + 0.9)
    n = int(math.radians(T1 - T0) * RB / 0.3)
    for i in range(n):
        th = T0 + (T1 - T0) * (i + 0.5) / n
        if any(abs(th - p) < 2.2 for p in posts):
            continue
        F = rframe(th, RB)
        for (u0, u1, d0, d1) in ((-0.06, 0.06, 0, 0), (0, 0, -0.06, 0.06)):
            if d0 == d1:
                face('trim', [F.p(u0, 0, zb + 0.15), F.p(u1, 0, zb + 0.15), F.p(u1 * 1.4, 0, zb + 0.5),
                              F.p(u1, 0, zb + 0.85), F.p(u0, 0, zb + 0.85), F.p(u0 * 1.4, 0, zb + 0.5)], F.N())
            else:
                face('trim', [F.p(0, d0, zb + 0.15), F.p(0, d1, zb + 0.15), F.p(0, d1 * 1.4, zb + 0.5),
                              F.p(0, d1, zb + 0.85), F.p(0, d0, zb + 0.85), F.p(0, d0 * 1.4, zb + 0.5)], F.U())

def build_gate():
    """Двор между северным корпусом и ротондой: решётка с белыми столбами и
    воротами на улицу (панорама 2025, фото g3)."""
    F = FR(-34.5, 0, '+a', '+b')
    L = 34.5 - 8.0
    pillars = [0.4, 6.5, 11.0, 15.5, 20.0, L - 0.4]
    for u in pillars:
        box('wall3', F, u - 0.35, u + 0.35, -0.35, 0.35, GROUND, 2.6)
        box('trim', F, u - 0.42, u + 0.42, -0.42, 0.42, 2.6, 2.8)
        box('wall3', F, u - 0.2, u + 0.2, -0.2, 0.2, 2.8, 3.0)
    for a, b in zip(pillars, pillars[1:]):
        a, b = a + 0.35, b - 0.35
        box('wall3', F, a, b, -0.15, 0.15, GROUND, 0.45)
        beam('metal', F.p(a, 0, 2.15), F.p(b, 0, 2.15), 0.05)
        beam('metal', F.p(a, 0, 0.6), F.p(b, 0, 0.6), 0.05)
        u = a + 0.12
        while u < b - 0.05:
            face('metal', [F.p(u - 0.02, 0, 0.45), F.p(u + 0.02, 0, 0.45), F.p(u + 0.02, 0, 2.35), F.p(u - 0.02, 0, 2.35)], F.N())
            u += 0.16

build_sw()
build_mw()
build_wb()
build_nw()
build_ne()
build_rotunda()
build_portico()
build_gate()

finish('sevgu_gogolya14', __file__)
