# Акционерный банк «Россия», улица Ленина, 15 (Севастополь) — модель с нуля.
#
#   blender -b --python models/bank_rossiya/build.py -- [glb]
#
# План — контур OSM way 92717285 (w92717285), фасады — фото Викисклада и панорамы
# Яндекса 2020 года (см. NOTES.md). Дом состоит из трёх объёмов:
#   • передний корпус (параллелограмм 21,7 × 19 м) с шестиколонным дорическим
#     портиком на СЕВЕРО-СЕВЕРО-ЗАПАДНОМ ребре P3–P5 контура — это главный фасад;
#   • «рука» вдоль улицы Мокроусова (ребро P5–P6, 36 м), две этажа над цоколем;
#   • низкий южный выступ во двор (P0–P1–P2).
# Ноль высоты — тротуар у подножия лестницы по оси портика; начало (X0, Z0) —
# середина стены P3–P5 (лицевая плоскость крыльев, d = 0). Колонны и лестница
# выступают за контур OSM наружу.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

# ------------------------------------------------------------------ цвета
COL['wall']  = ((0.87, 0.87, 0.84), 0.9)     # белая плитка-«кирпич» стен
COL['trim']  = ((0.92, 0.92, 0.89), 0.85)    # белые детали
COL['wall2'] = ((0.62, 0.64, 0.61), 0.92)    # серо-зелёный цокольный камень
COL['wall3'] = ((0.10, 0.19, 0.55), 0.4)     # синий: буквы вывески и логотип
COL['stone'] = ((0.26, 0.26, 0.27), 0.9)     # тёмный гранит ступеней и щёк
COL['roof']  = ((0.58, 0.24, 0.18), 0.8)     # красная кровля; им же «РОССИЯ»
COL['metal'] = ((0.10, 0.10, 0.11), 0.5)     # кованые ограды, кровельные решётки
COL['glass'] = ((0.13, 0.18, 0.23), 0.12)
COL['wood']  = ((0.47, 0.29, 0.13), 0.6)     # дубовая входная дверь

# ------------------------------------------------------------------ план
P = {0: (42.8, 512.1), 1: (44.4, 520.2), 2: (34.2, 522.3), 3: (30.0, 499.0),
     5: (48.6, 487.9), 6: (77.0, 510.3), 7: (70.2, 519.2), 8: (53.5, 505.7)}

def _inter(a, d1, b, d2):
    den = d1[0] * d2[1] - d1[1] * d2[0]
    t = ((b[0] - a[0]) * d2[1] - (b[1] - a[1]) * d2[0]) / den
    return (a[0] + d1[0] * t, a[1] + d1[1] * t)

# задняя стена переднего корпуса — прямая P8–P0, продолжена до западной стены P3–P2
Pw = _inter(P[8], (P[0][0] - P[8][0], P[0][1] - P[8][1]), P[3], (P[2][0] - P[3][0], P[2][1] - P[3][1]))
P['w'] = Pw

X0, Z0 = (P[3][0] + P[5][0]) / 2, (P[3][1] + P[5][1]) / 2
origin(X0, Z0)

_u = (W(*P[3]) - W(*P[5])).normalized()       # вправо, если смотреть на дом с улицы
_n = Vector((-_u.y, _u.x))
if _n.dot(W(60, 500)) > 0:                    # наружу = на СЕВЕРО-СЕВЕРО-ЗАПАД
    _n = -_n
FP = Frame(Vector((0, 0)), _u, _n)
HW = (W(*P[3]) - W(*P[5])).length / 2         # полуширина переднего фасада ≈ 10,83

ST = 1.6              # стилобат / пол первого этажа над тротуаром
TOP = 7.5             # верх стены под карнизом (над ST)
COLH, COLD = 6.7, 1.4  # высота колонны с капителью, нижний диаметр
CAX = 3.2             # ось колонн от стены
GR = -3.0             # стены уходят в землю

# ------------------------------------------------------------------ помощники

# ------------------------------------------------------------------ лёгкие примитивы
def lbox(m, F, u0, u1, d0, d1, z0, z1):
    """Брусок, приставленный к стене: лицо, верх и два бока (без низа и тыла)."""
    P_ = F.p
    face(m, [P_(u0, d1, z0), P_(u1, d1, z0), P_(u1, d1, z1), P_(u0, d1, z1)], F.N())
    face(m, [P_(u0, d0, z1), P_(u1, d0, z1), P_(u1, d1, z1), P_(u0, d1, z1)], UP)
    face(m, [P_(u0, d0, z0), P_(u0, d1, z0), P_(u0, d1, z1), P_(u0, d0, z1)], -F.U())
    face(m, [P_(u1, d0, z0), P_(u1, d1, z0), P_(u1, d1, z1), P_(u1, d0, z1)], F.U())

def glz(F, ua, ub, za, zb, d, cols=2, rows=1, reveal=0.24):
    """Стекло в глубине проёма с лёгким переплётом."""
    g = d - reveal + 0.02
    face('glass', [F.p(ua, g, za), F.p(ub, g, za), F.p(ub, g, zb), F.p(ua, g, zb)], F.N())
    t, f1 = 0.06, g + 0.06
    lbox('trim', F, ua, ua + t, g, f1, za, zb); lbox('trim', F, ub - t, ub, g, f1, za, zb)
    lbox('trim', F, ua + t, ub - t, g, f1, zb - t, zb); lbox('trim', F, ua + t, ub - t, g, f1, za, za + t)
    for c in range(1, cols):
        u = ua + (ub - ua) * c / cols
        lbox('trim', F, u - t / 2, u + t / 2, g, f1, za + t, zb - t)
    if rows:
        z = za + (zb - za) * 0.68
        lbox('trim', F, ua + t, ub - t, g, f1, z - t / 2, z + t / 2)

def win(F, cu, za, w, h, d=0.0):
    """Окно: наличник, подоконник, переплёт."""
    ua, ub, zb = cu - w / 2, cu + w / 2, za + h
    fw = 0.16
    lbox('trim', F, ua - fw, ua, d, d + 0.05, za, zb + fw)
    lbox('trim', F, ub, ub + fw, d, d + 0.05, za, zb + fw)
    lbox('trim', F, ua, ub, d, d + 0.05, zb, zb + fw)
    lbox('trim', F, ua - fw - 0.04, ub + fw + 0.04, d, d + 0.13, za - 0.1, za)
    glz(F, ua, ub, za, zb, d)
    return (ua, ub, za, zb)

def ped_window(F, cu, za, w, h, d=0.0, tri=0.55):
    """Окно с наличником и треугольным сандриком (боковые окна крыльев и первые окна «руки»)."""
    win(F, cu, za, w, h, d)
    hw = w / 2 + 0.34
    zt = za + h + 0.16
    box('trim', F, cu - hw, cu + hw, d, d + 0.17, zt, zt + 0.14)
    prism_uz('trim', F, [(cu - hw - 0.06, zt + 0.14), (cu + hw + 0.06, zt + 0.14), (cu, zt + 0.14 + tri)], d, d + 0.2)
    prism_uz('wall', F, [(cu - hw + 0.14, zt + 0.14), (cu + hw - 0.14, zt + 0.14), (cu, zt + 0.14 + tri - 0.14)], d, d + 0.22)

def rail(F, u0, u1, d, z, h=0.9, step=1.3):
    """Кровельная решётка по краю карниза."""
    beam('metal', F.p(u0, d, z + h), F.p(u1, d, z + h), 0.05)
    beam('metal', F.p(u0, d, z + 0.35), F.p(u1, d, z + 0.35), 0.03)
    n = max(1, round((u1 - u0) / step))
    for k in range(n + 1):
        u = u0 + (u1 - u0) * k / n
        box('metal', F, u - 0.02, u + 0.02, d - 0.02, d + 0.02, z, z + h, bottom=False)

def cornice_full(F, u0, u1, z, ext=0.5, mod=True, rl=True):
    """Карниз с кронштейнами, венчающий поясок и кровельная решётка. Низ роли кровли — z + 0.9."""
    if mod:
        u = u0 + 0.3
        while u < u1 - 0.15:
            box('trim', F, u - 0.1, u + 0.1, 0, 0.42, z - 0.3, z + 0.02)
            u += 0.62
    cornice(F, u0, u1, 0, z, ext)
    band(F, u0 - ext, u1 + ext, 0, z + 0.6, z + 0.9, ext * 0.7)
    if rl:
        rail(F, u0 - ext * 0.6, u1 + ext * 0.6, ext * 0.55, z + 0.9)

def facade(F, L, bays, top=TOP, m0=0.9, ped=(), mod=True, rl=True, pil=True, basement=True):
    """Рядовой фасад: серо-зелёный цоколь, два яруса окон, пояс, угловые лопатки, карниз."""
    step = (L - 2 * m0) / bays
    holes, wins = [], []
    for i in range(bays):
        cu = m0 + step * (i + 0.5)
        wins.append((cu, ST + 0.55, 1.2, 2.0, i in ped))
        wins.append((cu, ST + 3.55, 1.2, 1.8, False))
    for cu, za, w, h, pd in wins:
        holes.append((cu - w / 2, cu + w / 2, za, za + h))
    wall(F, 0, L, ST, ST + top, 0, holes)
    bh = []
    if basement:
        for i in range(bays):
            cu = m0 + step * (i + 0.5)
            bh.append((cu - 0.45, cu + 0.45, 0.35, 1.0))
    wall(F, 0, L, GR, ST, 0, bh, m='wall2', reveal=0.2)
    for ua, ub, za, zb in bh:
        glz(F, ua, ub, za, zb, 0, cols=1, rows=0, reveal=0.2)
    box('trim', F, 0, L, 0, 0.1, ST - 0.14, ST)
    for cu, za, w, h, pd in wins:
        if pd:
            ped_window(F, cu, za, w, h)
        else:
            win(F, cu, za, w, h, 0)
    band(F, 0, L, 0, ST + 3.0, ST + 3.3, 0.07)
    if pil:
        box('trim', F, 0, 0.7, 0, 0.09, ST, ST + top)
        box('trim', F, L - 0.7, L, 0, 0.09, ST, ST + top)
    cornice_full(F, 0, L, ST + top, mod=mod, rl=rl)

def edge_frame(a, b, inside):
    return frame_from(P[a], P[b], inside)

def frustum(pts, z0, rise, ws, m='roof'):
    """Низкая вальмовая кровля с плоским верхом над выпуклым многоугольником.
    ws[i] — на сколько внутрь уходит скат ребра i (pts[i]→pts[i+1]); 0 — шов с соседним объёмом."""
    V = [W(*p) for p in pts]
    n = len(V)
    area = sum(V[i].x * V[(i + 1) % n].y - V[(i + 1) % n].x * V[i].y for i in range(n)) / 2
    lines = []
    for i in range(n):
        a, b = V[i], V[(i + 1) % n]
        d = (b - a).normalized()
        nin = Vector((-d.y, d.x)) if area > 0 else Vector((d.y, -d.x))
        lines.append((a + nin * ws[i], d))
    T = []
    for i in range(n):
        p1, d1 = lines[i - 1]
        p2, d2 = lines[i]
        den = d1.x * d2.y - d1.y * d2.x
        t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / den
        T.append(p1 + d1 * t)
    A = [Vector((v.x, v.y, z0)) for v in V]
    Tt = [Vector((t.x, t.y, z0 + rise)) for t in T]
    cen = sum(A, Vector()) / n
    for i in range(n):
        j = (i + 1) % n
        mid = (A[i] + A[j]) / 2
        face(m, [A[i], A[j], Tt[j], Tt[i]], (mid - cen) + UP * 1.2)
    face(m, Tt, UP)

# ================================================================== ПОРТИК
def doric(F, u, H=COLH, D=COLD):
    """Дорическая колонна без базы: 20 каннелюр, эхин, абака."""
    R = D / 2
    base = F.p(u, CAX, ST)
    zc = H - 0.8                                  # низ капители
    n = 20
    rings = []
    bm = bm_of('trim')
    for k, t in enumerate((0.0, 0.34, 0.68, 1.0)):
        r = R * (1 - 0.14 * t ** 1.3)
        z = zc * t
        ring = []
        for j in range(2 * n):
            a = math.pi * j / n
            rr = r if j % 2 == 0 else r * 0.95
            ring.append(bm.verts.new(base + Vector((rr * math.cos(a), rr * math.sin(a), z))))
        rings.append(ring)
    for k in range(3):
        for j in range(2 * n):
            jj = (j + 1) % (2 * n)
            bm.faces.new([rings[k][j], rings[k][jj], rings[k + 1][jj], rings[k + 1][j]])
    # упрощённый ствол (для дальнего уровня) — внутри каннелюр
    lathe('trim_s', base, [(R * 0.93, 0.0), (R * 0.93 * 0.93, zc * 0.5), (R * 0.93 * 0.86, zc)], 8, cap=False)
    rt = R * 0.86
    prof = [(rt, zc), (rt * 1.0, zc + 0.04), (rt * 1.07, zc + 0.06), (rt * 1.07, zc + 0.10), (rt, zc + 0.12),
            (rt * 1.03, zc + 0.20), (rt * 1.13, zc + 0.26), (rt * 1.28, zc + 0.34), (rt * 1.42, zc + 0.42),
            (rt * 1.46, zc + 0.47)]
    lathe('trim_s', base, prof, 12, cap=True)
    box('trim_s', F, u - 1.05, u + 1.05, CAX - 1.05, CAX + 1.05, ST + zc + 0.47, ST + H)

COLS = (-7.0, -4.2, -1.4, 1.4, 4.2, 7.0)
EHW = 8.25            # полуширина антаблемента
FR = CAX + 0.5        # лицо архитрава/фриза от стены
Z_ARCH = ST + COLH    # низ антаблемента

def build_portico():
    F = FP
    # стилобат (платформа) с тёмными щеками и девятью ступенями веером
    box('stone', F, -8.7, 8.7, 0.0, 4.4, GR, ST)
    n, rise, run = 9, ST / 9, 0.36
    for i in range(n):
        top = ST - rise * (i + 1)
        hw = 5.4 + 0.55 * i
        box('stone', F, -hw, hw, 4.4, 4.4 + run * (i + 1), (top - rise) if i < n - 1 else GR, top)
    # кованые ограждения в крайних интерколумниях
    for c0, c1 in ((-7.0, -4.2), (4.2, 7.0)):
        u0, u1 = c0 + 0.85, c1 - 0.85
        beam('metal', F.p(u0, CAX, ST + 0.95), F.p(u1, CAX, ST + 0.95), 0.05)
        beam('metal', F.p(u0, CAX, ST + 0.12), F.p(u1, CAX, ST + 0.12), 0.05)
        k = 0
        while u0 + 0.28 * k <= u1 + 0.01:
            box('metal', F, u0 + 0.28 * k - 0.015, u0 + 0.28 * k + 0.015, CAX - 0.015, CAX + 0.015, ST + 0.12, ST + 0.95, bottom=False)
            k += 1
    # колонны
    for u in COLS:
        doric(F, u)
    # стена за колоннами: дверь и по пять окон на ярус
    hd = (-0.65, 0.65, ST, ST + 2.6)
    holes = [hd]
    low = [-5.6, -2.8, 2.8, 5.6]
    for cu in low:
        holes.append((cu - 0.6, cu + 0.6, ST + 0.55, ST + 2.55))
    for cu in (-5.6, -2.8, 0.0, 2.8, 5.6):
        holes.append((cu - 0.6, cu + 0.6, ST + 3.55, ST + 5.35))
    wall(F, -7.7, 7.7, ST, ST + TOP, 0, holes)
    for cu in low:
        win(F, cu, ST + 0.55, 1.2, 2.0, 0)
    for cu in (-5.6, -2.8, 0.0, 2.8, 5.6):
        win(F, cu, ST + 3.55, 1.2, 1.8, 0)
    # дверь
    g = -0.22
    face('wood', [F.p(-0.65, g, ST), F.p(0.65, g, ST), F.p(0.65, g, ST + 2.6), F.p(-0.65, g, ST + 2.6)], F.N())
    box('trim', F, -0.025, 0.025, g, g + 0.05, ST, ST + 2.6)
    for z in (ST + 0.45, ST + 1.3, ST + 2.05):
        box('trim', F, -0.6, 0.6, g, g + 0.04, z - 0.025, z + 0.025)
    for s in (-1, 1):
        u0, u1 = sorted((s * 0.65, s * 0.9))
        box('trim', F, u0, u1, 0, 0.09, ST, ST + 2.8)
    box('trim', F, -0.95, 0.95, 0, 0.12, ST + 2.6, ST + 2.8)
    # вывеска-растяжка над дверью, цвета флага
    box('wall3', F, -1.45, 1.45, 0.0, 0.05, ST + 3.0, ST + 3.5)
    box('roof', F, -1.45, 1.45, 0.0, 0.055, ST + 2.85, ST + 3.0)
    # пояс между этажами, угловые лопатки у колонн
    band(F, -7.7, 7.7, 0, ST + 3.0, ST + 3.3, 0.07)
    for s in (-1, 1):
        u0, u1 = sorted((s * 7.7, s * 8.4))
        box('trim', F, u0, u1, 0, 0.13, ST, ST + TOP)
        u0, u1 = sorted((s * (HW - 0.7), s * HW))
        box('trim', F, u0, u1, 0, 0.09, ST, ST + TOP)
    # крылья: по одному окну с сандриком в нижнем ярусе
    cw = (8.4 + HW) / 2 + 0.1
    for s in (-1, 1):
        u0, u1 = sorted((s * 7.7, s * HW))
        cu = s * cw
        wall(F, u0, u1, ST, ST + TOP, 0, [(cu - 0.55, cu + 0.55, ST + 0.8, ST + 2.8)])
        ped_window(F, cu, ST + 0.8, 1.1, 2.0)
        box('trim', F, cu - 0.3, cu + 0.3, 0, 0.04, ST + 4.4, ST + 4.8)        # памятная табличка
    # цоколь крыльев и под портиком
    wall(F, -HW, HW, GR, ST, 0, [], m='wall2')
    box('trim', F, -HW, HW, 0, 0.1, ST - 0.14, ST)
    # карнизы крыльев (в середине их перекрывает антаблемент)
    for s in (-1, 1):
        u0, u1 = sorted((s * 7.7, s * HW))
        cornice_full(F, u0, u1, ST + TOP, mod=True, rl=True)
    # антаблемент: архитрав, фриз, зубчики, венчающий карниз
    box('wall', F, -EHW, EHW, 0, FR, Z_ARCH, Z_ARCH + 0.47)                       # архитрав
    box('trim', F, -EHW - 0.03, EHW + 0.03, 0, FR + 0.05, Z_ARCH + 0.47, Z_ARCH + 0.55)
    box('wall', F, -EHW, EHW, 0, FR, Z_ARCH + 0.55, Z_ARCH + 1.38)               # фриз
    zd = Z_ARCH + 1.38
    box('trim', F, -EHW - 0.08, EHW + 0.08, 0, FR + 0.12, zd, zd + 0.09)
    box('wall', F, -EHW - 0.08, EHW + 0.08, 0, FR + 0.08, zd + 0.09, zd + 0.4)
    k = -EHW + 0.15
    while k < EHW - 0.1:                                                          # зубчики по фасаду
        box('trim', F, k, k + 0.3, FR + 0.08, FR + 0.3, zd + 0.09, zd + 0.4)
        k += 0.56
    for s in (-1, 1):                                                             # и по торцам
        Fs = Frame(F.p(s * (EHW + 0.08), 0, 0).xy, F.n, F.u * s)
        dd = 0.3
        while dd < FR - 0.2:
            box('trim', Fs, dd, dd + 0.3, 0.0, 0.22, zd + 0.09, zd + 0.4)
            dd += 0.56
    zk = zd + 0.4
    box('trim', F, -EHW - 0.28, EHW + 0.28, 0, FR + 0.55, zk, zk + 0.2)
    box('trim', F, -EHW - 0.34, EHW + 0.34, 0, FR + 0.62, zk + 0.2, zk + 0.48)
    # аттик над портиком и вывеска
    ZA0 = zk + 0.48
    ZA1 = ST + 9.95
    box('wall', F, -7.1, 7.1, -6.0, FR - 0.4, ST + TOP, ZA1 - 0.14)
    box('trim', F, -7.18, 7.18, -6.0, FR - 0.32, ZA1 - 0.14, ZA1)
    sign(F, ZA1, FR - 0.45)

# ------------------------------------------------------------------ вывеска
# Простой плакатный шрифт: штрихи в клетке 1 × 1 (x вдоль, y вверх); прямоугольники
# ('r', x0, x1, y0, y1) и многоугольники ('p', [(x, y), ...]). tx, ty — толщина штриха.
tx, ty = 0.26, 0.15
def G(ch):
    m = 1 - tx
    my = 0.5 - ty / 2
    R = lambda x0, x1, y0, y1: ('r', x0, x1, y0, y1)
    Pp = lambda *p: ('p', list(p))
    g = {
     'А': [Pp((0, 0), (tx, 0), (0.5 + tx / 2, 1), (0.5 - tx / 2, 1)), Pp((m, 0), (1, 0), (0.5 + tx / 2, 1), (0.5 - tx / 2, 1)),
           R(0.2, 0.8, 0.22, 0.22 + ty)],
     'К': [R(0, tx, 0, 1), Pp((tx, 0.38), (tx + 0.28, 0.38), (1, 1), (0.72, 1)), Pp((tx, 0.62), (0.72, 0), (1, 0), (tx + 0.28, 0.62))],
     'Ц': [R(0, tx, ty, 1), R(0.78 - tx, 0.78, ty, 1), R(0, 1, -0.12, ty + 0.0), R(0.78 - tx, 1, -0.12, ty)],
     'И': [R(0, tx, 0, 1), R(m, 1, 0, 1), Pp((tx, 0), (tx + 0.3, 0), (m, 1), (m - 0.3, 1))],
     'Й': [R(0, tx, 0, 1), R(m, 1, 0, 1), Pp((tx, 0), (tx + 0.3, 0), (m, 1), (m - 0.3, 1)), R(0.28, 0.72, 1.1, 1.1 + ty * 0.8)],
     'О': [R(0, tx, 0.1, 0.9), R(m, 1, 0.1, 0.9), R(0.1, m, 0, ty), R(0.1, m, 1 - ty, 1),
           Pp((0, 0.1), (0.1, 0), (0.1, ty), (tx, 0.1)), Pp((m, 0.1), (m, ty), (0.9, 0), (1, 0.1)),
           Pp((0, 0.9), (tx, 0.9), (0.1, 1 - ty), (0.1, 1)), Pp((m, 0.9), (1, 0.9), (0.9, 1), (0.9, 1 - ty))],
     'Н': [R(0, tx, 0, 1), R(m, 1, 0, 1), R(tx, m, my, my + ty)],
     'Е': [R(0, tx, 0, 1), R(tx, 1, 0, ty), R(tx, 0.9, my, my + ty), R(tx, 1, 1 - ty, 1)],
     'Р': [R(0, tx, 0, 1), R(tx, m, 1 - ty, 1), R(tx, m, 0.38, 0.38 + ty), R(m, 1, 0.38, 1 - 0.0)],
     'Ы': [R(0, tx, 0, 1), R(tx, 0.62, 0, ty), R(tx, 0.62, 0.4, 0.4 + ty), R(0.62 - tx, 0.62, 0, 0.55), R(m, 1, 0, 1)],
     'Б': [R(0, tx, 0, 1), R(tx, 1, 1 - ty, 1), R(tx, m, 0, ty), R(tx, m, 0.4, 0.4 + ty), R(m, 1, 0, 0.55)],
     'С': [R(0, tx, 0.1, 0.9), R(0.1, 1, 0, ty), R(0.1, 1, 1 - ty, 1), Pp((0, 0.1), (0.1, 0), (0.1, ty), (tx, 0.1)),
           Pp((0, 0.9), (tx, 0.9), (0.1, 1 - ty), (0.1, 1))],
     'Я': [R(m, 1, 0, 1), R(0.1, m, 1 - ty, 1), R(0.1, m, 0.44, 0.44 + ty), R(0, tx, 0.55, 0.95),
           Pp((0, 0), (0.28, 0), (m, 0.46), (0.62, 0.46))],
    }
    return g[ch]

def slab(m, F, u0, u1, z0, z1, d0, d1):
    """Тонкий брусок для букв: лицо, верх и бока (без низа и тыла)."""
    P_ = F.p
    face(m, [P_(u0, d1, z0), P_(u1, d1, z0), P_(u1, d1, z1), P_(u0, d1, z1)], F.N())
    face(m, [P_(u0, d0, z1), P_(u1, d0, z1), P_(u1, d1, z1), P_(u0, d1, z1)], UP)
    face(m, [P_(u0, d0, z0), P_(u0, d1, z0), P_(u0, d1, z1), P_(u0, d0, z1)], -F.U())
    face(m, [P_(u1, d0, z0), P_(u1, d1, z0), P_(u1, d1, z1), P_(u1, d0, z1)], F.U())

def glyph(F, ch, u0, cw, z0, h, d0, d1, m):
    for s in G(ch):
        if s[0] == 'r':
            _, a, b, c, e = s
            slab(m, F, u0 + a * cw, u0 + b * cw, z0 + c * h, z0 + e * h, d0, d1)
        else:
            pts = [(u0 + x * cw, z0 + y * h) for x, y in s[1]]
            face(m, [F.p(u, d1, z) for u, z in pts], F.N())
            face(m, [F.p(u, d0, z) for u, z in pts], -F.N())

def sign(F, zbase, d):
    """«АКЦИОНЕРНЫЙ БАНК РОССИЯ»: синие буквы на кровле аттика, «РОССИЯ» красным, слева круглый логотип."""
    adv, cw, h = 0.47, 0.42, 0.82
    words = [('АКЦИОНЕРНЫЙ', 'wall3'), ('БАНК', 'wall3'), ('РОССИЯ', 'roof')]
    total = sum(len(w) * adv for w, _ in words) + 0.3 * 2
    logo_w = 0.86 + 0.25
    u = -(total + logo_w) / 2 + logo_w
    z0 = zbase + 0.22
    # логотип: синий диск с белым кольцом — зримо при взгляде вдоль улицы
    lu = -(total + logo_w) / 2 + 0.43
    n = 16
    disk = [(lu + 0.43 * math.cos(2 * math.pi * k / n), z0 + h / 2 + 0.43 * math.sin(2 * math.pi * k / n)) for k in range(n)]
    face('wall3', [F.p(a, d + 0.22, z) for a, z in disk], F.N())
    face('wall3', [F.p(a, d, z) for a, z in disk], -F.N())
    ring = [(lu + 0.27 * math.cos(2 * math.pi * k / n), z0 + h / 2 + 0.27 * math.sin(2 * math.pi * k / n)) for k in range(n)]
    face('trim', [F.p(a, d + 0.235, z) for a, z in ring], F.N())
    ring2 = [(lu + 0.17 * math.cos(2 * math.pi * k / n), z0 + h / 2 + 0.17 * math.sin(2 * math.pi * k / n)) for k in range(n)]
    face('wall3', [F.p(a, d + 0.24, z) for a, z in ring2], F.N())
    for word, mat in words:
        for ch in word:
            glyph(F, ch, u, cw, z0, h, d, d + 0.2, mat)
            u += adv
        u += 0.3
    # тонкая рама-подставка под буквами
    box('metal', F, -(total + logo_w) / 2, (total + logo_w) / 2, d + 0.05, d + 0.1, zbase, zbase + 0.12, bottom=False)

# ================================================================== КОРПУСА
def build_arm():
    """«Рука» вдоль улицы Мокроусова: P5→P6 наружный фасад, торец P6→P7, двор P7→P8."""
    F, L = edge_frame(5, 6, (62, 503))
    facade(F, L, 11, ped=(0, 1))
    Fe, Le = edge_frame(6, 7, (62, 503))
    facade(Fe, Le, 3, mod=False, rl=True, basement=True)
    Fi, Li = edge_frame(7, 8, (62, 503))
    facade(Fi, Li, 6, mod=False)
    frustum([P[5], P[6], P[7], P[8]], ST + TOP + 0.9, 1.1, [3.8, 3.8, 3.8, 0.0])

def build_front_block():
    # западная стена P3→Pw (Pw — точка на P3–P2, где кончается задняя стена корпуса)
    Fw, Lw = frame_from(P[3], P['w'], (45, 505))
    facade(Fw, Lw, 5, ped=(0, 1))
    # задняя стена P8→Pw, видна лишь до выступа
    Fr, Lr = frame_from(P[8], P['w'], (45, 505))
    facade(Fr, Lr, 7, mod=False)
    frustum([P[3], P[5], P[8], P['w']], ST + TOP + 0.9, 1.1, [3.8, 0.0, 3.8, 3.8])

def build_stub():
    """Низкий выступ во двор: Pw–P0 — шов с корпусом, P0–P1 восток, P1–P2 юг, P2–Pw запад."""
    ins = (40, 517)
    top = 6.6
    Fe, Le = frame_from(P[0], P[1], ins)
    facade(Fe, Le, 2, top=top, m0=0.7, mod=False)
    Fs, Ls = frame_from(P[1], P[2], ins)
    facade(Fs, Ls, 3, top=top, m0=0.9, mod=False)
    Fw, Lw = frame_from(P[2], P['w'], ins)
    facade(Fw, Lw, 1, top=top, m0=0.8, mod=False)
    frustum([P['w'], P[0], P[1], P[2]], ST + top + 0.9, 0.8, [0.0, 2.6, 2.6, 2.6])

build_portico()
build_front_block()
build_arm()
build_stub()

finish('bank_rossiya', __file__, tri_budget=25000)
