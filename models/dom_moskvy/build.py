# Дом Москвы (Московский культурно-деловой центр), пл. Нахимова, 1 — модель с нуля.
#
#   blender -b --python models/dom_moskvy/build.py -- [glb]
#
# Контур OSM way 148568946 повёрнут на ~3° относительно осей мира, поэтому план
# собран в местной прямоугольной системе (u — на восток вдоль южного фасада,
# v — на север от южного фасада), как у контура: см. LW(). Фасады — с фото
# Викисклада (refs/), заметки — в NOTES.md. Ноль высоты — тротуар у ступеней
# входа в середине южного фасада.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

# ------------------------------------------------------------------ местная система
A0, B0 = (-20.1, -72.4), (-7.2, -73.1)         # южный фасад (точки sw из landmarks.json)
_LL = math.hypot(B0[0] - A0[0], B0[1] - A0[1])
UX, UZ = (B0[0] - A0[0]) / _LL, (B0[1] - A0[1]) / _LL
NX, NZ = UZ, -UX                               # на север (z мира убывает)

def LW(u, v):
    """Местные (u, v) → мир (x, z)."""
    return (A0[0] + u * UX + v * NX, A0[1] + u * UZ + v * NZ)

X0, Z0 = [round(c, 1) for c in LW(6.45, 0)]
origin(X0, Z0)

def LF(a, b, inside):
    """Рамка фасада по ребру a→b (местные u,v); inside — точка внутри дома."""
    F, L = frame_from(LW(*a), LW(*b), LW(*inside))
    return F, L

# цвета: тёплая светлая штукатурка (по фото — кремово-жёлтая), белые детали
COL['wall'] = ((0.90, 0.86, 0.69), 0.9)
COL['wall2'] = ((0.82, 0.78, 0.62), 0.9)
COL['trim'] = ((0.94, 0.91, 0.79), 0.85)
COL['stone'] = ((0.52, 0.53, 0.55), 0.9)
COL['roof'] = ((0.55, 0.20, 0.15), 0.8)
COL['wood'] = ((0.43, 0.23, 0.09), 0.6)

GROUND = -3.0
F1 = 0.8          # пол первого этажа
S2 = 5.3          # верх перекрытия над 1 этажом (пол 2-го)
S3 = 10.1         # верх перекрытия над 2 этажом (пол 3-го)
ZC = 14.7         # низ венчающего карниза
ZT = 16.3         # верх карниза (кровельная плита)
ZP = 16.7         # верх парапета
FS, _ = LF((0, 0), (12.92, 0), (6.4, 6))     # южный фасад: u на восток, d на юг
PW = 12.92        # ширина портика-лоджии

# ------------------------------------------------------------------ мелкие примитивы
def pyr(F, u0, u1, z0, z1, d, pr, m='trim'):
    """Гранёный (алмазный) рустовый блок: четыре треугольника."""
    A, B, C, D = F.p(u0, d, z0), F.p(u1, d, z0), F.p(u1, d, z1), F.p(u0, d, z1)
    T = F.p((u0 + u1) / 2, d + pr, (z0 + z1) / 2)
    for p, q in ((A, B), (B, C), (C, D), (D, A)):
        face(m, [p, q, T], (p + q) / 2 - (A + C) / 2 + F.N() * 0.3)

def quoin(F, u0, u1, d, z0, z1):
    """Угловая лопатка с алмазным рустом."""
    z, k = z0, 0
    while z < z1 - 0.1:
        h = min(0.55, z1 - z)
        w0 = u0 if k % 2 == 0 else u0 + 0.0
        pyr(F, u0 if k % 2 == 0 else u0 + 0.12, u1, z + 0.03, z + h - 0.03, d, 0.10)
        z += h; k += 1

def rust_lines(F, u0, u1, z0, z1, holes, d=0.0, step=0.62):
    """Горизонтальные швы руста: тонкие плашки, обходят проёмы."""
    z = z0 + step
    while z < z1 - 0.2:
        segs = [(u0, u1)]
        for ha, hb, za, zb in holes:
            if za - 0.12 < z < zb + 0.12:
                nxt = []
                for a, b in segs:
                    if hb + 0.1 <= a or ha - 0.1 >= b:
                        nxt.append((a, b)); continue
                    if ha - 0.1 > a: nxt.append((a, ha - 0.1))
                    if hb + 0.1 < b: nxt.append((hb + 0.1, b))
                segs = nxt
        for a, b in segs:
            if b - a > 0.15:
                face('trim', [F.p(a, d + 0.04, z - 0.025), F.p(b, d + 0.04, z - 0.025),
                              F.p(b, d + 0.04, z + 0.025), F.p(a, d + 0.04, z + 0.025)], F.N())
        z += step

def glaz2(F, ua, ub, za, zb, d, reveal=0.24, tr=0.68):
    """Стекло и тонкий деревянный переплёт (плоскими полосами)."""
    g = d - reveal + 0.02
    face('glass', [F.p(ua, g, za), F.p(ub, g, za), F.p(ub, g, zb), F.p(ua, g, zb)], F.N())
    gf = g + 0.015
    t = 0.07
    def strip(a, b, c, e):
        face('wood', [F.p(a, gf, c), F.p(b, gf, c), F.p(b, gf, e), F.p(a, gf, e)], F.N())
    strip(ua, ua + t, za, zb); strip(ub - t, ub, za, zb)
    strip(ua, ub, za, za + t); strip(ua, ub, zb - t, zb)
    strip((ua + ub) / 2 - t / 2, (ua + ub) / 2 + t / 2, za, zb)
    z = za + (zb - za) * tr
    strip(ua, ub, z - t / 2, z + t / 2)

def win(F, cu, za, w, h, d=0.0, cap=None, panel=True, rv=0.24):
    """Окно с наличником; cap: None / 'tri' (треугольный фронтон) / 'seg' (сегментный)."""
    ua, ub, zb = cu - w / 2, cu + w / 2, za + h
    glaz2(F, ua, ub, za, zb, d, rv)
    pw = 0.14
    box('trim', F, ua - pw, ua, d, d + 0.06, za, zb + 0.18)
    box('trim', F, ub, ub + pw, d, d + 0.06, za, zb + 0.18)
    box('trim', F, ua - pw, ub + pw, d, d + 0.09, zb, zb + 0.18)
    box('trim', F, ua - pw - 0.07, ub + pw + 0.07, d, d + 0.17, za - 0.14, za)
    if panel:
        box('trim', F, ua + 0.05, ub - 0.05, d, d + 0.05, za - 0.95, za - 0.22)
    zc = zb + 0.18
    if cap == 'tri':
        prism_uz('trim', F, [(ua - pw - 0.12, zc), (ub + pw + 0.12, zc), (cu, zc + 0.55)], d, d + 0.14)
    elif cap == 'seg':
        r = (w / 2 + pw + 0.12)
        n = 7
        arc = [(cu + r * math.cos(math.pi * k / n), zc + 0.45 * math.sin(math.pi * k / n)) for k in range(n + 1)]
        prism_uz('trim', F, arc, d, d + 0.14)

def balust(F, u0, u1, d, z0, h=0.92, pitch=0.24, two=True):
    """Балюстрада: поручень, нижний пояс и точёные балясины."""
    box('trim', F, u0, u1, d - 0.13, d + 0.13, z0 + h - 0.12, z0 + h)
    box('trim', F, u0, u1, d - 0.11, d + 0.11, z0, z0 + 0.11)
    n = max(1, int(round((u1 - u0 - 0.1) / pitch)))
    for i in range(n + 1):
        u = u0 + 0.05 + (u1 - u0 - 0.1) * i / n
        box('trim', F, u - 0.055, u + 0.055, d - 0.055, d + 0.055, z0 + 0.11, z0 + h - 0.12, bottom=False)
        if two:
            box('trim', F, u - 0.085, u + 0.085, d - 0.085, d + 0.085, z0 + 0.22, z0 + 0.5, bottom=False)

def rcol(F, u, d, z0, H, D=0.62):
    """Простая круглая колонна с базой и капителью."""
    R = D / 2
    base = F.p(u, d, z0)
    prof = [(R * 1.28, 0), (R * 1.28, 0.10), (R * 1.04, 0.15), (R * 1.0, 0.28), (R * 0.88, H - 0.5),
            (R * 0.94, H - 0.38), (R * 1.08, H - 0.30), (R * 1.22, H - 0.20), (R * 1.30, H - 0.14), (R * 1.30, H - 0.10)]
    lathe('trim', base, prof, 10)
    box('trim', F, u - R * 1.6, u + R * 1.6, d - R * 1.6, d + R * 1.6, z0 + H - 0.10, z0 + H)

def sq_pier(F, u, d, z0, z1, w=0.9, cap=True):
    box('trim', F, u - w / 2 - 0.07, u + w / 2 + 0.07, d - w / 2 - 0.07, d + w / 2 + 0.07, z0, z0 + 0.3)
    box('trim', F, u - w / 2, u + w / 2, d - w / 2, d + w / 2, z0 + 0.3, z1 - 0.3)
    if cap:
        box('trim', F, u - w / 2 - 0.1, u + w / 2 + 0.1, d - w / 2 - 0.1, d + w / 2 + 0.1, z1 - 0.3, z1)

def arch_fill(F, cu, r, zs, ztop, d, m='wall'):
    """Заполнение углов над полукруглым проёмом (от пяты zs до плоскости ztop)."""
    n = 14
    arc = [(cu + r * math.cos(math.pi * k / n), zs + r * math.sin(math.pi * k / n)) for k in range(n + 1)]
    h = n // 2
    face(m, [F.p(u, d, z) for u, z in arc[:h + 1]] + [F.p(cu, d, ztop), F.p(cu + r, d, ztop)], F.N())
    face(m, [F.p(u, d, z) for u, z in arc[h:]] + [F.p(cu - r, d, ztop), F.p(cu, d, ztop)], F.N())
    return arc

def archivolt(F, arc, cu, zs, d, w=0.32):
    for k in range(len(arc) - 1):
        (ua, za), (ub, zb) = arc[k], arc[k + 1]
        r = math.hypot(ua - cu, za - zs)
        f = (r + w) / r
        oa = (cu + (ua - cu) * f, zs + (za - zs) * f)
        ob = (cu + (ub - cu) * f, zs + (zb - zs) * f)
        face('trim', [F.p(ua, d + 0.07, za), F.p(ub, d + 0.07, zb), F.p(ob[0], d + 0.07, ob[1]), F.p(oa[0], d + 0.07, oa[1])], F.N())
    ua, za = arc[0]; ub, zb = arc[-1]

def vault(F, arc, cu, zs, d0, d1):
    """Цилиндрический свод внутри арки (между плоскостями d0 и d1)."""
    c = F.p(cu, (d0 + d1) / 2, zs)
    for k in range(len(arc) - 1):
        (ua, za), (ub, zb) = arc[k], arc[k + 1]
        q = [F.p(ua, d0, za), F.p(ub, d0, zb), F.p(ub, d1, zb), F.p(ua, d1, za)]
        face('wall', q, c - sum(q, Vector()) / 4)

def entab(F, u0, u1, d=0.0, dent=True, pitch=0.44):
    """Венчающий карниз: фриз, зубчики, венчающая плита, парапет."""
    band(F, u0, u1, d, ZC, ZC + 0.55, 0.07)
    band(F, u0, u1, d, ZC + 0.55, ZC + 0.62, 0.20)
    if dent:
        k = u0 + 0.12
        while k < u1 - 0.1:
            box('trim', F, k - 0.09, k + 0.09, d + 0.02, d + 0.20, ZC + 0.62, ZC + 0.86, bottom=False)
            k += pitch
    band(F, u0 - 0.1, u1 + 0.1, d, ZC + 0.86, ZC + 1.06, 0.34)
    band(F, u0 - 0.35, u1 + 0.35, d, ZC + 1.06, ZC + 1.36, 0.72)
    band(F, u0 - 0.28, u1 + 0.28, d, ZC + 1.36, ZT - 0.0 + 0.0, 0.56)
    band(F, u0 - 0.1, u1 + 0.1, d, ZT, ZP, 0.16, m='wall')

def deck(poly_uv, z0=ZC, z1=ZT - 0.05):
    """Плоская кровля (серая) над многоугольником плана (местные u,v)."""
    pts = [W(*LW(u, v)) for u, v in poly_uv]
    prism_plan('stone', Frame(Vector((0, 0)), Vector((1, 0)), Vector((0, 1))), [(p.x, p.y) for p in pts], z0, z1)

def ceiling(poly_uv, z, m='wall'):
    pts = [W(*LW(u, v)) for u, v in poly_uv]
    face(m, [Vector((p.x, p.y, z)) for p in pts], -UP)

# ------------------------------------------------------------------ фасад «по-рядовой»
QW, LGW, LHW, LDR = 1.5, 5.0, 1.85, 2.2     # лопатка, лоджия, её полуширина и глубина

def loggia(F, cu):
    """Лоджия на двух верхних этажах: балюстрады, колонна, арка в третьем этаже."""
    hw, DR = LHW, LDR
    zs = ZC - 0.1 - hw                           # пята арки
    # плиты пола
    box('trim', F, cu - hw, cu + hw, -DR, 0.28, S2 - 0.6, S2)
    box('trim', F, cu - hw, cu + hw, -DR, 0.20, S3 - 0.6, S3)
    # боковые стенки и задняя стена
    for s, sg in ((cu - hw, 1), (cu + hw, -1)):
        face('wall', [F.p(s, 0, S2), F.p(s, -DR, S2), F.p(s, -DR, zs), F.p(s, 0, zs)], F.U() * sg)
    holes = [(cu - 1.0, cu - 0.3, S2 + 0.3, S2 + 3.3), (cu + 0.3, cu + 1.0, S2 + 0.3, S2 + 3.3),
             (cu - 1.0, cu - 0.3, S3 + 0.3, S3 + 3.3), (cu + 0.3, cu + 1.0, S3 + 0.3, S3 + 3.3)]
    wall(F, cu - hw, cu + hw, S2, ZC, -DR, holes)
    for ha, hb, za, zb in holes:
        glaz2(F, ha, hb, za, zb, -DR, 0.2)
    # колонна на тумбе, балюстрады
    box('trim', F, cu - 0.4, cu + 0.4, -0.45, 0.45 - 0.0, S2, S2 + 0.92)
    rcol(F, cu, 0.0, S2 + 0.92, S3 - 0.6 - S2 - 0.92, 0.62)
    box('trim', F, cu - 0.4, cu + 0.4, -0.4, 0.4, S2 + 0.92, S2 + 0.99)
    for z0 in (S2,):
        balust(F, cu - hw, cu - 0.4, 0.0, z0); balust(F, cu + 0.4, cu + hw, 0.0, z0)
    balust(F, cu - hw, cu + hw, 0.0, S3, two=False)
    # арка
    arc = arch_fill(F, cu, hw, zs, ZC, 0.0)
    archivolt(F, arc, cu, zs, 0.0)
    vault(F, arc, cu, zs, 0.0, -DR)

def facade(F, L, seq, dent=True, rust=True):
    nW = sum(t[1] for t in seq if t[0] == 'W')
    fixed = sum(QW if t[0] == 'Q' else LGW if t[0] == 'L' else t[1] if t[0] == 'B' else 0 for t in seq)
    p = (L - fixed) / nW if nW else 0
    ww = min(1.5, p - 0.75) if nW else 1.25
    u = 0.0
    holes, wins, quoins, logs, blanks = [], [], [], [], []
    for t in seq:
        if t[0] == 'Q':
            quoins.append((u, u + QW)); u += QW
        elif t[0] == 'B':
            blanks.append((u, u + t[1])); u += t[1]
        elif t[0] == 'L':
            cu = u + LGW / 2
            logs.append(cu)
            for s in (-1.0, 1.0):
                wins.append((cu + s * 1.15, 1.65, ww, 2.8, None))
            holes.append((cu - LHW, cu + LHW, S2, ZC))
            u += LGW
        else:
            for i in range(t[1]):
                cu = u + p * (i + 0.5)
                wins.append((cu, 1.65, ww, 2.8, None))
                wins.append((cu, 6.25, ww, 2.6, 'tri'))
                wins.append((cu, 11.05, ww, 2.9, 'seg'))
            u += p * t[1]
    ground = []
    for cu, za, w, h, cap in wins:
        holes.append((cu - w / 2, cu + w / 2, za, za + h))
        if za < 3: ground.append(holes[-1])
    wall(F, 0, L, GROUND, ZC, 0, holes)
    box('stone', F, 0, L, -0.3, 0.08, GROUND, 0.75)
    band(F, 0, L, 0, 0.75, 0.92, 0.14)
    if rust:
        rust_lines(F, 0, L, 0.92, S2 - 0.6, ground, d=0.0)
    band(F, -0.0, L, 0, S2 - 0.6, S2, 0.30)           # пояс-перекрытие над 1 этажом
    band(F, 0, L, 0, S2 - 0.2, S2 - 0.0, 0.40)
    band(F, 0, L, 0, S3 - 0.6, S3, 0.22)
    for cu, za, w, h, cap in wins:
        win(F, cu, za, w, h, 0.0, cap, panel=(za > 3))
    for a, b in quoins:
        quoin(F, a, b, 0.0, 0.92, S3 - 0.62)
        box('trim', F, a, b, 0, 0.09, S3, ZC)
    for cu in logs:
        loggia(F, cu)
    entab(F, 0, L, 0.0, dent=dent)
    return p

# ================================================================== ПОРТИК-ЛОДЖИЯ (юг)
def build_pavilion():
    F = FS
    DB = -2.8
    cx = PW / 2
    # цоколь и ступени
    box('stone', F, -0.1, PW + 0.1, DB, 0.2, GROUND, F1 - 0.1)
    box('trim', F, -0.15, PW + 0.15, DB, 0.25, F1 - 0.1, F1)
    n, run = 5, 0.34
    rise = F1 / n
    for i in range(n):
        top = F1 - rise * (i + 1)
        box('stone', F, 3.4, 9.5, 0.1, 0.25 + run * (i + 1), GROUND, top)
    # задняя стена с проёмами трёх этажей
    holes = [(cx - 1.1, cx + 1.1, F1, F1 + 3.2),
             (1.5, 2.9, F1 + 0.9, F1 + 3.4), (PW - 2.9, PW - 1.5, F1 + 0.9, F1 + 3.4)]
    for c in (2.3, cx, PW - 2.3):
        holes.append((c - 0.8, c + 0.8, S2 + 0.25, S2 + 3.35))
        holes.append((c - 0.8, c + 0.8, S3 + 0.25, S3 + 3.45))
    wall(F, 0, PW, F1, ZC, DB, holes)
    rust_lines(F, 0, PW, F1, S2 - 0.6, holes[:3], d=DB)
    for ha, hb, za, zb in holes:
        glaz2(F, ha, hb, za, zb, DB, 0.2, tr=0.7)
        if za > S2:
            box('trim', F, ha - 0.12, ha, DB, DB + 0.05, za, zb); box('trim', F, hb, hb + 0.12, DB, DB + 0.05, za, zb)
            box('trim', F, ha - 0.12, hb + 0.12, DB, DB + 0.07, zb, zb + 0.14)
    # дверь: две створки, импост-стекло, чугунный козырёк
    g = DB - 0.18
    face('wood', [F.p(cx - 1.1, g, F1), F.p(cx + 1.1, g, F1), F.p(cx + 1.1, g, F1 + 2.3), F.p(cx - 1.1, g, F1 + 2.3)], F.N())
    box('wood', F, cx - 0.03, cx + 0.03, g, g + 0.06, F1, F1 + 2.3)
    box('trim', F, cx - 1.1, cx + 1.1, g, g + 0.07, F1 + 2.28, F1 + 2.36)
    box('metal', F, cx - 2.1, cx + 2.1, -1.6, 0.0, F1 + 3.55, F1 + 3.65)
    for s in (-1.5, -0.5, 0.5, 1.5):
        beam('metal', F.p(cx + s, DB, F1 + 3.0), F.p(cx + s, -1.4, F1 + 3.55), 0.07)
    # перекрытия (вылет карниза-пояса над этажом)
    for zt, zb in ((S2, S2 - 0.6), (S3, S3 - 0.6)):
        box('trim', F, -0.15, PW + 0.15, DB, 0.12, zb, zt)
        box('trim', F, -0.28, PW + 0.28, DB, 0.30, zt - 0.28, zt)
    # ---- первый этаж: пилоны
    px = [0.45, 3.4, PW - 3.4, PW - 0.45]
    for u in px:
        sq_pier(F, u, -0.45, F1, S2 - 0.6)
    balust(F, px[0] + 0.45, px[1] - 0.45, -0.45, F1)
    balust(F, px[2] + 0.45, px[3] - 0.45, -0.45, F1)
    # боковые ограждения нижнего этажа
    for u in (0.45, PW - 0.45):
        for z0 in (F1, S2, S3):
            h0 = 0.92
            d0, d1 = DB + 0.05, -0.9 - 0.0
            box('trim', F, u - 0.13, u + 0.13, d0, d1, z0 + h0 - 0.12, z0 + h0)
            box('trim', F, u - 0.11, u + 0.11, d0, d1, z0, z0 + 0.11)
            k = d0 + 0.2
            while k < d1 - 0.05:
                box('trim', F, u - 0.055, u + 0.055, k - 0.055, k + 0.055, z0 + 0.11, z0 + h0 - 0.12, bottom=False)
                k += 0.28
    # ---- второй этаж: угловые пилоны и четыре колонны на тумбах
    for u in (px[0], px[3]):
        sq_pier(F, u, -0.45, S2, S3 - 0.6)
    cols2 = [3.7, 5.55, PW - 5.55, PW - 3.7]
    for u in cols2:
        box('trim', F, u - 0.42, u + 0.42, -0.87, -0.03, S2, S2 + 0.92)
        box('trim', F, u - 0.47, u + 0.47, -0.92, 0.02, S2 + 0.86, S2 + 0.96)
        rcol(F, u, -0.45, S2 + 0.96, S3 - 0.6 - S2 - 0.96, 0.66)
    edges = [px[0] + 0.45] + [x for u in cols2 for x in (u - 0.42, u + 0.42)] + [px[3] - 0.45]
    for a, b in zip(edges[0::2], edges[1::2]):
        balust(F, a, b, -0.45, S2)
    # ---- третий этаж: парные колонны по краям, в центре арка
    for u in (0.5, 2.2, PW - 2.2, PW - 0.5):
        box('trim', F, u - 0.42, u + 0.42, -0.87, -0.03, S3, S3 + 0.92)
        box('trim', F, u - 0.47, u + 0.47, -0.92, 0.02, S3 + 0.86, S3 + 0.96)
        rcol(F, u, -0.45, S3 + 0.96, ZC - S3 - 0.96, 0.66)
    balust(F, 0.5 + 0.42, 2.2 - 0.42, -0.45, S3)
    balust(F, PW - 2.2 + 0.42, PW - 0.5 - 0.42, -0.45, S3)
    r = 3.0
    zs = ZC - 0.12 - r
    scr = -0.45
    hole = (cx - r, cx + r, S3, ZC)
    wall(F, 2.2 + 0.42, PW - 2.2 - 0.42, S3, ZC, scr, [hole], reveal=0.0)
    arc = arch_fill(F, cx, r, zs, ZC, scr)
    archivolt(F, arc, cx, zs, scr, 0.36)
    vault(F, arc, cx, zs, scr, DB)
    balust(F, cx - r, cx + r, scr + 0.05, S3, two=True)
    for u in (cx - r, cx + r):
        box('trim', F, u - 0.5, u + 0.5, scr, scr + 0.1, S3, zs)         # пилястры на пятах арки (упрощённо)
    # венчание: фасад и обе стороны
    entab(F, -0.0, PW, 0.0)
    for a, b, ins in (((0, 2.8), (0, 0), (-3, 2)), ((PW, 0), (PW, 2.8), (PW + 3, 2))):
        Fs, Ls = LF(a, b, ins)
        entab(Fs, 0, Ls, 0.0)
    deck([(0, 0), (PW, 0), (PW, 2.8), (0, 2.8)])
    ceiling([(0, 0), (PW, 0), (PW, 2.8), (0, 2.8)], ZC)
    ceiling([(0, 0), (PW, 0), (PW, 2.8), (0, 2.8)], F1)
    # надпись «ДОМ МОСКВЫ» на крыше
    sign(F, cx, -1.35, ZP + 0.05)

GLY = {
    'Д': [(.12, .88, .8, 1), (.2, .36, .16, .8), (.64, .8, .16, .8), (0, 1, 0, .17), (0, .13, 0, .32), (.87, 1, 0, .32)],
    'О': [(0, .24, .12, .88), (.76, 1, .12, .88), (.18, .82, 0, .2), (.18, .82, .8, 1)],
    'М': [(0, .22, 0, 1), (.78, 1, 0, 1), (.2, .42, .56, 1), (.58, .8, .56, 1), (.4, .6, .3, .72)],
    'С': [(0, .24, .12, .88), (.18, 1, 0, .2), (.18, 1, .8, 1), (.76, 1, .12, .3), (.76, 1, .7, .88)],
    'К': [(0, .22, 0, 1), (.22, .5, .4, .6), (.48, .78, .58, 1), (.48, .78, 0, .42)],
    'В': [(0, .22, 0, 1), (.2, .74, .8, 1), (.2, .74, .4, .6), (.2, .74, 0, .2), (.72, 1, .6, .86), (.72, 1, .12, .42)],
    'Ы': [(0, .18, 0, 1), (.18, .54, .42, .6), (.18, .54, 0, .18), (.5, .68, 0, .6), (.82, 1, 0, 1)],
}

def sign(F, cu, d, z0, text='ДОМ МОСКВЫ', h=1.7, pitch=1.2):
    """Объёмные красные буквы на крыше портика, читаются с юга."""
    glyphs = [c for c in text]
    total = 0.0
    adv = []
    for c in glyphs:
        a = pitch * (0.55 if c == ' ' else 1.0)
        adv.append(a); total += a
    u = cu - total / 2
    w = h * 0.62
    box('metal', F, cu - total / 2 - 0.1, cu + total / 2 + 0.1, d - 0.15, d - 0.02, z0 - 0.05, z0 + 0.25)
    for c, a in zip(glyphs, adv):
        if c != ' ':
            for ua, ub, za, zb in GLY[c]:
                box('roof', F, u + ua * w, u + ub * w, d, d + 0.3, z0 + 0.1 + za * h, z0 + 0.1 + zb * h, bottom=False)
        u += a

# ================================================================== КОРПУСА
def build_body():
    # --- южное крыло слева от портика (угловая лопатка + окно)
    F, L = LF((-3, 2.8), (0, 2.8), (-1.5, 6)); facade(F, L, [('Q',), ('W', 1)])
    # --- пристройка на востоке
    F, L = LF((12.92, 2.8), (18.9, 2.8), (15, 6)); facade(F, L, [('W', 2), ('Q',)])
    F, L = LF((18.9, 2.8), (18.9, 9.3), (15, 6)); facade(F, L, [('Q',), ('W', 2), ('Q',)])
    F, L = LF((18.9, 9.3), (13.65, 9.3), (15, 6)); facade(F, L, [('Q',), ('W', 2)])
    # --- восточный фасад южного корпуса и его север
    F, L = LF((13.65, 9.3), (13.65, 16.4), (10, 12)); facade(F, L, [('W', 2), ('Q',)])
    F, L = LF((13.65, 16.4), (10.8, 16.4), (12, 12)); facade(F, L, [('Q',), ('B', 1.35)])
    # --- северное крыло
    F, L = LF((10.8, 16.4), (10.8, 36.8), (5, 25)); facade(F, L, [('W', 7), ('Q',)])
    F, L = LF((10.8, 36.8), (-3, 36.8), (5, 30)); facade(F, L, [('Q',), ('W', 4), ('Q',)])
    # --- западный фасад на улицу (с двумя лоджиями)
    F, L = LF((-3, 36.8), (-3, 2.8), (5, 20)); facade(F, L, [('Q',), ('W', 2), ('L',), ('W', 4), ('L',), ('W', 3), ('Q',)])
    # --- кровли
    deck([(-3, 36.8), (-3, 16.4), (10.8, 16.4), (10.8, 36.8)])
    deck([(-3, 2.8), (13.65, 2.8), (13.65, 16.4), (-3, 16.4)])
    deck([(13.65, 2.8), (18.9, 2.8), (18.9, 9.3), (13.65, 9.3)])
    # красная вальмовая кровля над южным корпусом
    hip_roof(FS, -2.5, 13.3, -3.4, -15.9, ZT - 0.05, 2.4, ov=0.0)
    for u, d in ((3.0, -8.6), (9.0, -11.0)):
        chimney(FS, u, d, ZT, ZT + 3.1, w=0.8)
    # северная кровля: невысокий машинный объём и вытяжки
    Fn, _ = LF((10.8, 36.8), (-3, 36.8), (5, 30))
    box('wall', Fn, 3.5, 8.5, -22.0, -16.5, ZT - 0.05, ZT + 1.3)
    box('trim', Fn, 3.4, 8.6, -22.1, -16.4, ZT + 1.3, ZT + 1.45)
    for u, d in ((2.0, -29.0), (10.5, -30.5)):
        box('wall', Fn, u - 0.45, u + 0.45, d - 0.45, d + 0.45, ZT - 0.05, ZT + 1.1)
        box('trim', Fn, u - 0.55, u + 0.55, d - 0.55, d + 0.55, ZT + 1.1, ZT + 1.22)

build_pavilion()
build_body()

finish('dom_moskvy', __file__)
