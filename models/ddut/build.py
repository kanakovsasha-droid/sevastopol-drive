# Дворец детского и юношеского творчества (бывш. Дворец пионеров), Севастополь,
# пр. Нахимова, 4 — модель с нуля.
#
#   blender -b --python models/ddut/build.py -- [glb]
#
# План — контур OSM way 104316991, выпрямленный: дом повёрнут на 2.7° от осей
# мира, все размеры снимаются в местной системе (a — на восток к площади, b — на
# юг), которая превращает контур в чистые прямоугольники. Фасады — с фото
# Викисклада (см. NOTES.md). Ноль высоты — площадь у подножия лестницы портика;
# со стороны бухты дом стоит на 5 м ниже (рустованный цокольный этаж).
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

X0, Z0 = -253.2, 87.0        # середина лицевой грани постаментов портика
origin(X0, Z0)

COL['wall'] = ((0.90, 0.86, 0.76), 0.9)      # тёплая белая штукатурка
COL['wall2'] = ((0.80, 0.77, 0.69), 0.92)    # цоколь, руст
COL['wall3'] = ((0.60, 0.58, 0.55), 0.9)     # светлый гранит ступеней
COL['trim'] = ((0.96, 0.95, 0.91), 0.85)
COL['stone'] = ((0.50, 0.49, 0.47), 0.9)     # гранит постаментов, ступени
COL['roof'] = ((0.55, 0.24, 0.16), 0.8)      # крашеная жесть
COL['metal'] = ((0.10, 0.10, 0.11), 0.5)

# ------------------------------------------------------------ местная система
TH = math.atan2(0.047, 0.9989)
CT, SN = math.cos(TH), math.sin(TH)

def LW(a, b):
    """Местные (a на восток, b на юг) → мир."""
    return (X0 + a * CT - b * SN, Z0 + a * SN + b * CT)

def LP(a, b, z=0.0):
    w = W(*LW(a, b))
    return Vector((w.x, w.y, z))

def D2(a, b):
    return Vector((a * CT - b * SN, -(a * SN + b * CT)))

def FR(a, b, n, u):
    return Frame(W(*LW(a, b)), D2(*u), D2(*n))

E_, W_, S_, N_ = (1, 0), (-1, 0), (0, 1), (0, -1)
FI = Frame(Vector((0, 0)), Vector((1, 0)), Vector((0, 1)))

def prism_ab(m, poly, z0, z1, top=True):
    pts = [LP(a, b) for a, b in poly]
    prism_plan(m, FI, [(p.x, p.y) for p in pts], z0, z1, top)

# ------------------------------------------------------------ уровни
Q = -5.0           # набережная (запад)
GE = -5.0          # низ стен: до отметки набережной (местность под домом идёт к бухте вниз)
F1 = 2.0           # пол портика / низ окон первого этажа
ZE = 9.4           # низ карниза крыльев
ZB = 15.3          # низ карниза центрального корпуса

# ------------------------------------------------------------ лёгкие примитивы
def fbox(m, F, u0, u1, d0, d1, z0, z1):
    """Брус без низа и задней грани (10 → 8 треугольников): для накладных деталей."""
    P = F.p
    face(m, [P(u0, d1, z0), P(u1, d1, z0), P(u1, d1, z1), P(u0, d1, z1)], F.N())
    face(m, [P(u0, d0, z1), P(u1, d0, z1), P(u1, d1, z1), P(u0, d1, z1)], UP)
    face(m, [P(u0, d0, z0), P(u0, d1, z0), P(u0, d1, z1), P(u0, d0, z1)], -F.U())
    face(m, [P(u1, d0, z0), P(u1, d1, z0), P(u1, d1, z1), P(u1, d0, z1)], F.U())

def band(F, u0, u1, d, z0, z1, pr, m='trim'):
    fbox(m, F, u0, u1, d - 0.02, d + pr, z0, z1)

def glz(F, ua, ub, za, zb, d, cols=2, rows=(), reveal=0.24):
    """Стекло в глубине проёма и плоский переплёт из полосок (≈16 треугольников)."""
    g = d - reveal + 0.02
    face('glass', [F.p(ua, g, za), F.p(ub, g, za), F.p(ub, g, zb), F.p(ua, g, zb)], F.N())
    t, f = 0.06, g + 0.02
    def st(u0, u1, z0, z1):
        face('trim', [F.p(u0, f, z0), F.p(u1, f, z0), F.p(u1, f, z1), F.p(u0, f, z1)], F.N())
    st(ua, ua + t, za, zb); st(ub - t, ub, za, zb)
    st(ua, ub, za, za + t); st(ua, ub, zb - t, zb)
    for c in range(1, cols):
        u = ua + (ub - ua) * c / cols
        st(u - t / 2, u + t / 2, za, zb)
    for r in rows:
        z = za + (zb - za) * r
        st(ua, ub, z - t / 2, z + t / 2)

# ------------------------------------------------------------ мелкие помощники
def bays(u0, u1, step):
    n = max(1, round((u1 - u0) / step))
    s = (u1 - u0) / n
    return [u0 + s * (i + 0.5) for i in range(n)], s

def win(F, cu, za, w, h, d, kind):
    ua, ub = cu - w / 2, cu + w / 2
    if kind == 'c':                              # простое окно: перемычка и подоконник
        glz(F, ua, ub, za, za + h, d, 2, ())
        fbox('trim', F, ua - 0.12, ub + 0.12, d, d + 0.08, za + h, za + h + 0.16)
        fbox('trim', F, ua - 0.1, ub + 0.1, d, d + 0.12, za - 0.12, za)
    elif kind == 'p':                            # с наличником
        glz(F, ua, ub, za, za + h, d, 2, (0.7,))
        fbox('trim', F, ua - 0.16, ua, d, d + 0.05, za, za + h + 0.16)
        fbox('trim', F, ub, ub + 0.16, d, d + 0.05, za, za + h + 0.16)
        fbox('trim', F, ua - 0.16, ub + 0.16, d, d + 0.08, za + h, za + h + 0.2)
        fbox('trim', F, ua - 0.2, ub + 0.2, d, d + 0.13, za - 0.1, za)
    else:                                        # 'r': с сандриком
        glz(F, ua, ub, za, za + h, d, 2, (0.7,))
        fbox('trim', F, ua - 0.2, ua, d, d + 0.06, za, za + h + 0.2)
        fbox('trim', F, ub, ub + 0.2, d, d + 0.06, za, za + h + 0.2)
        fbox('trim', F, ua - 0.3, ub + 0.3, d, d + 0.12, za - 0.15, za)
        fbox('trim', F, ua - 0.2, ub + 0.2, d, d + 0.1, za + h, za + h + 0.2)
        zp = za + h + 0.2
        fbox('trim', F, ua - 0.4, ub + 0.4, d, d + 0.2, zp, zp + 0.09)
        prism_uz('wall', F, [(ua - 0.3, zp + 0.09), (ub + 0.3, zp + 0.09), (cu, zp + 0.62)], d, d + 0.1)
        for sgn in (-1, 1):
            beam('trim', F.p(cu + sgn * (w / 2 + 0.4), d + 0.1, zp + 0.1), F.p(cu, d + 0.1, zp + 0.68), 0.16, 0.12)
        for sgn in (-1, 1):
            fbox('trim', F, cu + sgn * (w / 2 + 0.08) - 0.1, cu + sgn * (w / 2 + 0.08) + 0.1, d, d + 0.18, za + h - 0.7, za + h)

def plan_windows(axes, rows, skip=()):
    holes, wins = [], []
    for i, cu in enumerate(axes):
        if i in skip:
            continue
        for za, h, w, kind in rows:
            k = kind(i) if callable(kind) else kind
            holes.append((cu - w / 2, cu + w / 2, za, za + h))
            wins.append((cu, za, w, h, k))
    return holes, wins

def build_wins(F, wins, d=0.0):
    for cu, za, w, h, k in wins:
        win(F, cu, za, w, h, d, k)

def arch_opening(F, cu, sill, spring, r, d, seg=6, bars=2):
    """Арочный проём: вызывать ПОСЛЕ wall() с дырой (cu-r, cu+r, sill, spring+r)."""
    arc = [(cu + r * math.cos(math.pi * k / seg), spring + r * math.sin(math.pi * k / seg)) for k in range(seg + 1)]
    hs = seg // 2
    face('wall', [F.p(cu + r, d, spring + r)] + [F.p(u, d, z) for u, z in arc[:hs + 1]], F.N())
    face('wall', [F.p(cu - r, d, spring + r)] + [F.p(u, d, z) for u, z in arc[hs:]], F.N())
    for k in range(seg):
        (ua, za), (ub, zb) = arc[k], arc[k + 1]
        face('trim', [F.p(ua, d, za), F.p(ub, d, zb), F.p(ub, d - 0.24, zb), F.p(ua, d - 0.24, za)],
             F.p(cu, d, spring) - F.p((ua + ub) / 2, d, (za + zb) / 2))
        ro = r + 0.24
        oa = (cu + ro * math.cos(math.pi * k / seg), spring + ro * math.sin(math.pi * k / seg))
        ob = (cu + ro * math.cos(math.pi * (k + 1) / seg), spring + ro * math.sin(math.pi * (k + 1) / seg))
        face('trim', [F.p(ua, d + 0.05, za), F.p(ub, d + 0.05, zb), F.p(ob[0], d + 0.05, ob[1]), F.p(oa[0], d + 0.05, oa[1])], F.N())
    g = d - 0.22
    face('glass', [F.p(cu - r, g, sill), F.p(cu + r, g, sill)] + [F.p(u, g, z) for u, z in arc], F.N())
    t = 0.05
    box('trim', F, cu - t, cu + t, g, g + 0.06, sill, spring + r)
    for j in range(1, bars + 1):
        z = sill + (spring - sill) * j / (bars + 1)
        box('trim', F, cu - r, cu + r, g, g + 0.06, z - t / 2, z + t / 2)
    box('trim', F, cu - r - 0.24, cu - r, d, d + 0.05, sill, spring)
    box('trim', F, cu + r, cu + r + 0.24, d, d + 0.05, sill, spring)
    box('trim', F, cu - r - 0.3, cu + r + 0.3, d, d + 0.14, sill - 0.14, sill)

# ------------------------------------------------------------ колонны
def column(base, H, D, seg=12):
    """Коринфская колонна, упрощённая: ствол — trim_s (виден вдали), капитель — trim."""
    R = D / 2
    prof = [(R * 1.22, 0.0), (R * 1.22, 0.16), (R * 1.08, 0.26), (R * 1.0, 0.36),
            (R * 0.97, 1.4), (R * 0.90, H * 0.55), (R * 0.84, H - 1.15 * D)]
    lathe('trim_s', base, prof, seg, cap=False)
    zc = H - 1.15 * D
    cb = Vector((base.x, base.y, base.z + zc))
    cp = [(R * 0.86, 0), (R * 1.0, 0.05 * D), (R * 1.18, 0.18 * D), (R * 1.08, 0.30 * D),
          (R * 1.30, 0.44 * D), (R * 1.22, 0.58 * D), (R * 1.44, 0.82 * D), (R * 1.52, 1.0 * D)]
    lathe('trim', cb, cp, seg, cap=True)
    F0 = Frame(Vector((base.x, base.y)), Vector((1, 0)), Vector((0, 1)))
    box('trim', F0, -0.80 * D, 0.80 * D, -0.80 * D, 0.80 * D, base.z + H - 0.14 * D, base.z + H)
    for sx in (-1, 1):
        for sy in (-1, 1):
            box('trim', F0, sx * 0.62 * D - 0.09 * D, sx * 0.62 * D + 0.09 * D,
                sy * 0.62 * D - 0.09 * D, sy * 0.62 * D + 0.09 * D, base.z + H - 0.45 * D, base.z + H - 0.14 * D)

def column_s(base, H, D, seg=8, m='trim'):
    """Тонкая колонна лоджий и ротонд."""
    R = D / 2
    prof = [(R * 1.35, 0.0), (R * 1.35, 0.14), (R * 1.0, 0.2), (R * 0.92, H - 0.3),
            (R * 1.15, H - 0.2), (R * 1.35, H - 0.1), (R * 1.35, H)]
    lathe(m, base, prof, seg, cap=True)
    F0 = Frame(Vector((base.x, base.y)), Vector((1, 0)), Vector((0, 1)))
    box('trim', F0, -R * 1.5, R * 1.5, -R * 1.5, R * 1.5, base.z + H, base.z + H + 0.1)

# ------------------------------------------------------------ фасад крыла
WROWS = [(F1 + 0.7, 1.9, 1.3, 'c'), (6.3, 2.0, 1.3, 'p')]

def wing_face(F, u0, u1, spans, d=0.0, gz=GE, pil=True, rows=None, cor=True, extra_axes=(), drop_after=None):
    axes = []
    for ua, ub, st in spans:
        axes += bays(ua, ub, st)[0]
    axes += list(extra_axes)
    axes.sort()
    if drop_after is not None:        # у западного торца стену изнутри подпирает бык лоджии — окон нет
        axes = [u for u in axes if u < drop_after]
    holes, wins = plan_windows(axes, rows or WROWS)
    wall(F, u0, u1, F1, ZE, d, holes)
    wall(F, u0, u1, gz, F1, d, [], m='wall2')
    band(F, u0, u1, d, F1 - 0.05, F1 + 0.15, 0.10)
    band(F, u0, u1, d, 5.3, 5.55, 0.07)
    if cor:
        cornice(F, u0, u1, d, ZE, ext=0.5)
    build_wins(F, wins, d)
    if pil:
        for i in range(len(axes) - 1):
            if axes[i + 1] - axes[i] < 4.0:
                u = (axes[i] + axes[i + 1]) / 2
                fbox('trim', F, u - 0.22, u + 0.22, d, d + 0.09, F1 + 0.15, ZE - 0.05)
    return axes

def quoin(F, ua, ub, d, z0, z1):
    """Угловой руст лопаткой."""
    z = z0
    k = 0
    while z < z1 - 0.1:
        h = min(0.9, z1 - z)
        fbox('trim', F, ua, ub, d, d + (0.08 if k % 2 == 0 else 0.05), z, z + h - 0.06)
        z += h
        k += 1

def pavilion(F, ua, ub, d=0.0, wide_ped=True):
    """Угловой выступ крыла с треугольным фронтончиком (на торцах крыльев)."""
    pr = 0.3
    wm = (ua + ub) / 2
    cu = wm
    holes = [(cu - 0.65, cu + 0.65, F1 + 0.7, F1 + 2.6), (cu - 0.65, cu + 0.65, 6.3, 8.3)]
    wall(F, ua, ub, F1, ZE, d + pr, holes)
    for u in (ua, ub):
        face('wall', [F.p(u, d, F1), F.p(u, d + pr, F1), F.p(u, d + pr, ZE), F.p(u, d, ZE)], F.U() * (-1 if u == ua else 1))
    win(F, cu, F1 + 0.7, 1.3, 1.9, d + pr, 'p')
    win(F, cu, 6.3, 1.3, 2.0, d + pr, 'r')
    band(F, ua, ub, d + pr, F1 - 0.05, F1 + 0.15, 0.10)
    band(F, ua, ub, d + pr, 5.3, 5.55, 0.07)
    quoin(F, ua, ua + 0.5, d + pr, F1 + 0.15, ZE)
    quoin(F, ub - 0.5, ub, d + pr, F1 + 0.15, ZE)
    cornice(F, ua, ub, d + pr, ZE, ext=0.5)
    zc = ZE + 0.6
    ov = (ub - ua) / 2 + 0.45
    rise = 1.6
    prism_uz('wall', F, [(wm - ov + 0.3, zc), (wm + ov - 0.3, zc), (wm, zc + rise - 0.1)], d + pr - 0.3, d + pr + 0.05)
    for s in (-1, 1):
        beam('trim', F.p(wm + s * ov, d + pr + 0.1, zc + 0.05), F.p(wm, d + pr + 0.1, zc + rise + 0.05), 0.26, 0.22)
    box('wall', F, ua + 0.5, ub - 0.5, d - 2.6, d + pr - 0.3, zc, zc + 2.4)     # аттик за фронтоном
    box('trim', F, ua + 0.35, ub - 0.35, d - 2.7, d + pr - 0.2, zc + 2.4, zc + 2.6)

def parapet(F, u0, u1, d, z, step=2.3):
    """Столбики-зубцы с решёткой по краю кровли."""
    n = max(1, round((u1 - u0) / step))
    s = (u1 - u0) / n
    for i in range(n + 1):
        u = u0 + s * i
        box('wall', F, u - 0.32, u + 0.32, d - 0.3, d + 0.3, z, z + 0.95)
        box('trim', F, u - 0.4, u + 0.4, d - 0.38, d + 0.38, z + 0.95, z + 1.08)
    for zz in (z + 0.35, z + 0.8):
        beam('metal', F.p(u0, d, zz), F.p(u1, d, zz), 0.04)

# ================================================================== ПОРТИК
FP = FR(0, 0, E_, N_)          # d=0 — грань постаментов, u — на север (вправо с площади)
BACK = -3.1                     # стена за колоннами
DC = -1.05                      # ось колонн
COLH, COLD = 11.0, 1.4
PED = 1.7                       # высота постамента
CAPZ = F1 + PED + COLH          # 14.7 — верх колонн
ENT0 = CAPZ
ENT1 = ENT0 + 2.4               # верх карниза портика 17.1
CA = (-5.35, -1.85, 1.85, 5.35)
ARCH = (-3.6, 0.0, 3.6)

def build_portico():
    F = FP
    # лестница на всю ширину корпуса, расширяющаяся книзу
    n, rise, run = 12, F1 / 12, 0.34
    for k in range(n):
        w = 6.7 + 0.33 * (k + 1)
        box('stone' if k % 2 == 0 else 'wall3', F, -w, w, 0.0, 0.1 + run * (k + 1), -0.4, F1 - rise * (k + 1) if k < n - 1 else 0.0)
    # площадка портика
    box('stone', F, -6.9, 6.9, BACK, 0.12, GE, F1 - 0.12)
    box('trim', F, -6.95, 6.95, BACK, 0.17, F1 - 0.12, F1)
    # постаменты (гранит) и колонны
    for u in CA:
        box('stone', F, u - 1.0, u + 1.0, DC - 1.0, DC + 1.0, F1, F1 + PED - 0.14)
        box('trim', F, u - 1.07, u + 1.07, DC - 1.07, DC + 1.07, F1 + PED - 0.14, F1 + PED)
        column(F.p(u, DC, F1 + PED), COLH, COLD)
    # стена за колоннами: двери, арочные окна
    holes = [(cu - 0.8, cu + 0.8, F1, F1 + 3.6) for cu in ARCH]
    SILL, SPR, AR = 7.3, 10.0, 0.8
    for cu in ARCH:
        holes.append((cu - AR, cu + AR, SILL, SPR + AR))
    FL = [(-8.25, 'L'), (8.25, 'R')]
    for cu, _ in FL:                         # боковые части ризалита
        holes.append((cu - 0.75, cu + 0.75, 3.0, 5.55))          # арочное окно 1-го этажа
        holes.append((cu - 0.65, cu + 0.65, 7.4, 9.5))
        holes.append((cu - 0.65, cu + 0.65, 11.5, 13.4))
    wall(F, -9.8, 9.8, F1, ZB, BACK, holes)
    wall(F, -9.8, 9.8, GE, F1, BACK, [], m='wall2')
    # двери (деревянные, красно-коричневые) с фрамугами
    for cu in ARCH:
        g = BACK - 0.2
        face('wood', [F.p(cu - 0.8, g, F1), F.p(cu + 0.8, g, F1), F.p(cu + 0.8, g, F1 + 2.6), F.p(cu - 0.8, g, F1 + 2.6)], F.N())
        face('glass', [F.p(cu - 0.8, g, F1 + 2.6), F.p(cu + 0.8, g, F1 + 2.6), F.p(cu + 0.8, g, F1 + 3.6), F.p(cu - 0.8, g, F1 + 3.6)], F.N())
        box('trim', F, cu - 0.03, cu + 0.03, g, g + 0.05, F1, F1 + 3.6)
        box('trim', F, cu - 0.8, cu + 0.8, g, g + 0.07, F1 + 2.58, F1 + 2.64)
        box('trim', F, cu - 1.0, cu - 0.8, BACK, BACK + 0.1, F1, F1 + 3.8)
        box('trim', F, cu + 0.8, cu + 1.0, BACK, BACK + 0.1, F1, F1 + 3.8)
        box('trim', F, cu - 1.1, cu + 1.1, BACK, BACK + 0.2, F1 + 3.8, F1 + 4.0)
        arch_opening(F, cu, SILL, SPR, AR, BACK, seg=6, bars=2)
        for k in (-1, 0, 1):                   # розетки над окном
            pass
    for cu in ARCH:
        box('trim', F, cu - 0.55, cu + 0.55, BACK, BACK + 0.07, 11.5, 12.3)
        box('trim', F, cu - 0.25, cu + 0.25, BACK, BACK + 0.12, 11.75, 12.05)
    band(F, -6.6, 6.6, BACK, 6.3, 6.5, 0.1)
    band(F, -6.6, 6.6, BACK, 13.3, 13.5, 0.1)
    # боковые части: окна, меандр, лопатки
    for cu, _ in FL:
        arch_opening(F, cu, 3.0, 4.8, 0.75, BACK, seg=6, bars=1)
        win(F, cu, 7.4, 1.3, 2.1, BACK, 'r')
        win(F, cu, 11.5, 1.3, 1.9, BACK, 'p')
        band(F, cu - 1.5, cu + 1.5, BACK, 10.15, 10.45, 0.06)
        band(F, cu - 1.5, cu + 1.5, BACK, 6.3, 6.5, 0.07)
        band(F, cu - 1.5, cu + 1.5, BACK, 13.9, 14.15, 0.06)
    for s in (-1, 1):
        quoin(F, s * 9.8 - (0.55 if s > 0 else 0.0), s * 9.8 + (0.0 if s > 0 else 0.55), BACK, F1, ZB)
    # главный карниз корпуса с кронштейнами
    cornice(F, -9.8, 9.8, BACK, ZB, ext=0.62)
    for s in (-1, 1):
        for k in range(3):
            u = s * (7.1 + 1.3 * k)
            box('trim', F, u - 0.12, u + 0.12, BACK, BACK + 0.55, ZB + 0.18, ZB + 0.42)
    # антаблемент портика
    h = 6.55
    box('trim', F, -h, h, DC - 0.7, DC + 0.8, ENT0, ENT0 + 0.8)                 # архитрав
    box('trim', F, -h - 0.05, h + 0.05, BACK, DC + 0.84, ENT0 + 0.8, ENT0 + 0.9)
    box('wall', F, -h, h, BACK, DC + 0.78, ENT0 + 0.9, ENT0 + 1.75)             # фриз
    box('trim', F, -h - 0.1, h + 0.1, BACK, DC + 0.9, ENT0 + 1.75, ENT0 + 1.95)
    box('trim', F, -h - 0.3, h + 0.3, BACK, DC + 1.25, ENT0 + 1.95, ENT0 + 2.15)
    box('trim', F, -h - 0.55, h + 0.55, BACK, DC + 1.6, ENT0 + 2.15, ENT1)
    for i in range(-11, 12):                                                    # зубцы фриза
        box('trim', F, i * 0.55 - 0.12, i * 0.55 + 0.12, DC + 0.86, DC + 1.1, ENT0 + 1.78, ENT0 + 1.95)
    # фронтон
    ov = h + 0.55
    sl = math.tan(math.radians(21.5))
    apex = ENT1 + ov * sl
    fr = DC + 1.55
    prism_uz('wall', F, [(-h, ENT1), (h, ENT1), (0, ENT1 + h * sl)], fr - 0.5, fr)
    bt = 0.5
    for s in (-1, 1):
        prism_uz('trim', F, [(s * ov, ENT1), (0, apex), (0, apex - bt), (s * (ov - bt / sl), ENT1)], fr - 0.3, fr + 0.45)
    # ступенчатый аттик по углам корпуса с «кольцами» и башенкой
    for s in (-1, 1):
        u0, u1 = sorted((s * 6.2, s * 9.9))
        box('wall', F, u0, u1, BACK - 4.5, BACK + 0.0, ZB + 0.6, ZB + 2.5)
        box('trim', F, u0 - 0.1, u1 + 0.1, BACK - 4.6, BACK + 0.1, ZB + 2.5, ZB + 2.7)
        for kk in (-0.35, 0.35):
            box('trim', F, (u0 + u1) / 2 + kk - 0.2, (u0 + u1) / 2 + kk + 0.2, BACK, BACK + 0.12, ZB + 1.1, ZB + 1.9)
        v0, v1 = sorted((s * 6.8, s * 9.2))
        box('wall', F, v0, v1, BACK - 3.0, BACK - 0.4, ZB + 2.7, ZB + 4.0)
        box('trim', F, v0 - 0.15, v1 + 0.15, BACK - 3.15, BACK - 0.25, ZB + 4.0, ZB + 4.25)
    # тумбы с фонарями по краям лестницы
    for s in (-1, 1):
        u = s * 11.4
        box('wall', F, u - 0.7, u + 0.7, 0.9, 2.3, -0.4, 2.1)
        box('trim', F, u - 0.8, u + 0.8, 0.8, 2.4, 2.1, 2.3)
        box('trim', F, u - 0.78, u + 0.78, 0.82, 2.38, 0.0, 0.3)
        beam('metal', F.p(u, 1.6, 2.3), F.p(u, 1.6, 6.0), 0.11)
        for k in range(4):
            ang = k * math.pi / 2 + math.pi / 4
            lp = F.p(u + 0.38 * math.cos(ang), 1.6 + 0.38 * math.sin(ang), 5.7)
            box('metal', F, lp.x * 0 + u + 0.38 * math.cos(ang) - 0.09, u + 0.38 * math.cos(ang) + 0.09,
                1.6 + 0.38 * math.sin(ang) - 0.09, 1.6 + 0.38 * math.sin(ang) + 0.09, 5.5, 6.0)

# ================================================================== КОРПУС: бока
def block_side(F, side):
    """Северный/южный фасад центрального корпуса (u от восточного угла на запад)."""
    LOWU = 13.75
    axes1 = [2.2, 5.6, 9.0, 12.2]
    rows = [(3.0, 2.4, 1.3, 'c'), (7.2, 2.1, 1.3, lambda i: 'r' if i == 0 else 'p'), (11.3, 1.9, 1.3, 'c')]
    holes, wins = plan_windows(axes1, rows)
    wall(F, 0, LOWU, F1, ZB, 0, holes)
    wall(F, 0, LOWU, GE, F1, 0, [], m='wall2')
    build_wins(F, wins, 0)
    for u in (0.0, 3.9, 7.3, 10.6, 13.7):
        fbox('trim', F, u - 0.22, u + 0.22, 0, 0.09, F1 + 0.15, ZB - 0.05)
    band(F, 0, LOWU, 0, 5.5, 5.7, 0.07)
    band(F, 0, LOWU, 0, 9.7, 9.9, 0.07)
    band(F, 0, LOWU, 0, 10.1, 10.35, 0.05)
    quoin(F, 0, 0.6, 0, F1, ZB)
    # над крыльями: только верх, окна 3-го этажа
    UE = 34.0 if side == 'N' else 30.3
    axes2 = [15.5 + 3.3 * i for i in range(6 if side == 'N' else 5)]
    h2, w2 = plan_windows(axes2, [(11.3, 1.9, 1.3, 'c')])
    wall(F, LOWU, UE, ZE, ZB, 0, h2)
    build_wins(F, w2, 0)
    band(F, LOWU, UE, 0, 10.1, 10.35, 0.05)
    cornice(F, 0, UE, 0, ZB, ext=0.55)
    for u in range(16, int(UE), 3):
        box('trim', F, u - 0.12, u + 0.12, 0, 0.5, ZB + 0.18, ZB + 0.42)
    if side == 'S':          # западный отрезок южной стены отступает к b=6.9
        wall(F, UE, 34.0, ZE, ZB, -2.8, [])
        face('wall', [F.p(UE, 0, ZE), F.p(UE, -2.8, ZE), F.p(UE, -2.8, ZB), F.p(UE, 0, ZB)], -F.U())
        cornice(F, UE, 34.0, -2.8, ZB, ext=0.55)

# ================================================================== КРЫЛЬЯ
def build_north_wing():
    # --- северный фасад (u от восточного торца на запад)
    F = FR(-16.85, -25.45, N_, W_)
    L = 36.45
    BAY = (3.35, 11.05)
    wing_face(F, 0, L, [(0.2, 3.35, 3.0), (11.05, L, 3.18)], extra_axes=[BAY[0] + 3.85], drop_after=L - 2.6)
    quoin(F, 0, 0.7, 0, F1, ZE)
    quoin(F, L - 0.7, L, 0, F1, ZE)
    # --- восточный торец с угловым выступом
    Fe = FR(-16.85, -9.8, E_, N_)
    wing_face(Fe, 0, 15.65, [(0.3, 9.85, 3.3)], extra_axes=[], cor=False)
    cornice(Fe, 0, 9.85, 0, ZE, ext=0.5)
    pavilion(Fe, 9.85, 15.65)
    parapet(Fe, 0.4, 9.4, -0.1, ZE + 0.6)
    quoin(Fe, 0, 0.5, 0, F1, ZE)
    # --- двор: южная стена крыла
    Fc = FR(-37.1, -9.8, S_, W_)
    wing_face(Fc, 0, 16.2, [(0.2, 16.2, 3.2)], gz=Q, drop_after=16.2 - 2.6)
    # --- западный торец (к бухте) с лоджией
    Fw = FR(-53.3, -25.45, W_, S_)
    west_gable(Fw, 15.65)
    # --- кровля
    FRN = FR(-16.85, -25.45, N_, W_)
    hip_roof(FRN, 0, L, 0, -15.65, ZE + 0.4, 3.0, ov=0.5, hip0=True, hip1=False)
    zr = lambda d: ZE + 0.4 + 3.0 * (0.5 - d) / 8.3
    for cu in (14.5, 21.0, 28.0, 33.0):
        dormer(FRN, cu, -2.4, zr(-2.4) - 0.05, r=0.8)
    for cu in (13.0, 25.5):
        dormer(FRN, cu, -13.4, zr(-13.4) - 0.05, r=0.8) if False else None
    chimney(FRN, 18.0, -8.0, zr(-8.0) - 0.4, ZE + 4.8)

def build_south_wing():
    # --- южный фасад, восточная секция b=25.7 и западная b=22.95
    F1s = FR(-16.7, 25.7, S_, W_)
    L1 = 16.6
    wing_face(F1s, 0, L1, [(0.2, L1, 3.3)])
    quoin(F1s, 0, 0.7, 0, F1, ZE)
    F2s = FR(-33.4, 22.95, S_, W_)
    L2 = 20.4
    wing_face(F2s, 0, L2, [(0.2, L2, 3.4)], drop_after=L2 - 2.6)
    quoin(F2s, L2 - 0.7, L2, 0, F1, ZE)
    # уступ между секциями (смотрит на запад)
    Fj = FR(-33.4, 22.95, W_, S_)
    wall(Fj, 0, 2.75, GE, ZE, 0, [])
    cornice(Fj, 0, 2.75, 0, ZE, ext=0.4)
    # --- восточный торец с угловым выступом
    Fe = FR(-16.7, 9.7, E_, S_)
    wing_face(Fe, 0, 16.0, [(0.3, 10.2, 3.3)], cor=False)
    cornice(Fe, 0, 10.2, 0, ZE, ext=0.5)
    pavilion(Fe, 10.2, 16.0)
    parapet(Fe, 0.4, 9.8, -0.1, ZE + 0.6)
    quoin(Fe, 0, 0.5, 0, F1, ZE)
    # --- двор: северная стена западной секции
    Fc = FR(-37.1, 6.9, N_, W_)
    wing_face(Fc, 0, 16.7, [(0.2, 16.7, 3.3)], gz=Q, drop_after=16.7 - 2.6)
    # --- западный торец
    Fw = FR(-53.8, 6.9, W_, S_)
    west_gable(Fw, 16.05)
    # --- кровли
    FRS1 = FR(-16.7, 25.7, S_, W_)
    hip_roof(FRS1, 0, L1, 0, -16.0, ZE + 0.4, 3.0, ov=0.5, hip0=True, hip1=False)
    FRS2 = FR(-33.4, 22.95, S_, W_)
    hip_roof(FRS2, 0, L2, 0, -16.05, ZE + 0.4, 3.0, ov=0.5, hip0=False, hip1=False)
    zr = lambda d: ZE + 0.4 + 3.0 * (0.5 - d) / 8.5
    for cu in (4.5, 10.5):
        dormer(FRS1, cu, -2.4, zr(-2.4) - 0.05, r=0.8)
    for cu in (4.5, 10.5, 16.5):
        dormer(FRS2, cu, -2.4, zr(-2.4) - 0.05, r=0.8)
    chimney(FRS2, 8.0, -8.3, zr(-8.3) - 0.4, ZE + 4.8)
    chimney(FRS1, 8.5, -8.0, zr(-8.0) - 0.4, ZE + 4.8)

def west_gable(F, L):
    """Торец крыла к бухте: рустованный цоколь, лоджия на парных колоннах, арочные окна, фронтон."""
    # цоколь у набережной
    holes = [(cu - 0.5, cu + 0.5, -2.3, -0.5) for cu in (4.0, L / 2, L - 4.0)]
    wall(F, 0, L, Q, 0.8, 0, holes, m='wall2')
    for cu in (4.0, L / 2, L - 4.0):
        glazing(F, cu - 0.5, cu + 0.5, -2.3, -0.5, 0, 2, ())
    for z in (-3.6, -2.7, -1.8, -0.9, 0.0):
        band(F, 0, L, 0, z, z + 0.05, 0.05, m='trim')
    band(F, -0.05, L + 0.05, 0, 0.7, 0.95, 0.18)
    # лоджия
    DB = -2.6
    ZL0, ZL1 = 0.95, 5.0
    holes = []
    pairs = [3.9 + (L - 7.8) * i / 3 for i in range(4)]
    for i in range(3):
        cu = (pairs[i] + pairs[i + 1]) / 2
        holes.append((cu - 1.05, cu + 1.05, ZL0 + 0.5, ZL1 - 0.4))
    wall(F, 2.0, L - 2.0, ZL0, ZL1, DB, holes)
    for i in range(3):
        cu = (pairs[i] + pairs[i + 1]) / 2
        glazing(F, cu - 1.05, cu + 1.05, ZL0 + 0.5, ZL1 - 0.4, DB, 3, (0.5,))
    box('wall', F, 0.04, 2.0, DB, -0.02, ZL0, ZL1)          # быки лоджии (не вровень с боковой стеной)
    box('wall', F, L - 2.0, L - 0.04, DB, -0.02, ZL0, ZL1)
    box('wall', F, 2.0, L - 2.0, DB - 0.1, DB, ZL0, ZL1)
    for u in pairs[:]:
        for du in (-0.32, 0.32):
            column_s(F.p(u + du, -0.5, ZL0), ZL1 - ZL0 - 0.1, 0.34)
    box('trim', F, 0, L, DB, 0.3, ZL1 - 0.1, ZL1 + 0.55)          # перекрытие-балкон
    for zz in (ZL1 + 1.0, ZL1 + 1.5):
        beam('metal', F.p(2.0, 0.22, zz), F.p(L - 2.0, 0.22, zz), 0.04)
    for k in range(0, 17):
        u = 2.0 + (L - 4.0) * k / 16
        beam('metal', F.p(u, 0.22, ZL1 + 0.5), F.p(u, 0.22, ZL1 + 1.55), 0.03)
    # верхний этаж: арочные окна на пилястрах
    ZU0 = ZL1 + 0.55
    arches = [L / 2 - 3.9, L / 2, L / 2 + 3.9]
    SILL, SPR, AR = 6.2, 8.2, 0.85
    holes = [(cu - AR, cu + AR, SILL, SPR + AR) for cu in arches]
    wall(F, 0, L, ZU0, ZE, 0, holes)
    for cu in arches:
        arch_opening(F, cu, SILL, SPR, AR, 0, seg=6, bars=2)
    for u in [0.0, L / 2 - 1.95, L / 2 + 1.95, L]:
        pass
    for u in (0.55, L / 2 - 1.95, L / 2 + 1.95, L - 0.55):
        box('trim', F, u - 0.3, u + 0.3, 0, 0.1, ZU0, ZE - 0.05)
    for u in (0.9, L - 0.9):
        box('trim', F, u - 0.25, u + 0.25, 0, 0.12, 7.2, 8.4)
    cornice(F, 0, L, 0, ZE, ext=0.5)
    # фронтон с круглым окном
    zc = ZE + 0.6
    ov = L / 2 + 0.45
    rise = 2.5
    prism_uz('wall', F, [(L / 2 - ov + 0.3, zc), (L / 2 + ov - 0.3, zc), (L / 2, zc + rise - 0.1)], -0.2, 0.2)
    for s in (-1, 1):
        beam('trim', F.p(L / 2 + s * ov, 0.3, zc + 0.05), F.p(L / 2, 0.3, zc + rise + 0.05), 0.3, 0.26)
    n = 12
    cz = zc + 0.95
    ring = [(L / 2 + 0.55 * math.cos(2 * math.pi * k / n), cz + 0.55 * math.sin(2 * math.pi * k / n)) for k in range(n)]
    face('glass', [F.p(u, 0.25, z) for u, z in ring], F.N())
    ring2 = [(L / 2 + 0.75 * math.cos(2 * math.pi * k / n), cz + 0.75 * math.sin(2 * math.pi * k / n)) for k in range(n)]
    for k in range(n):
        j = (k + 1) % n
        face('trim', [F.p(*ring[k][:1], 0.24, ring[k][1]), F.p(ring[j][0], 0.24, ring[j][1]),
                      F.p(ring2[j][0], 0.24, ring2[j][1]), F.p(ring2[k][0], 0.24, ring2[k][1])], F.N())

# ================================================================== РОТОНДА И БУХТА
def half_ring(m, ac, bc, r0, r1, z0, z1, a_dir=-1, n=12, top=True):
    """Полукольцо между радиусами r0 и r1, открытое к a_dir (запад = -1)."""
    for i in range(n):
        p0 = -math.pi / 2 + math.pi * i / n
        p1 = -math.pi / 2 + math.pi * (i + 1) / n
        pts = []
        for ph, r in ((p0, r0), (p1, r0), (p1, r1), (p0, r1)):
            pts.append((ac + a_dir * r * math.cos(ph), bc + r * math.sin(ph)))
        prism_ab(m, pts, z0, z1, top)

DECK = 5.55          # терраса над ротондой = перекрытие лоджий

def build_rotunda():
    """Ротонда у бухты: полукруг колонн на рустованном барабане, сверху терраса
    с балюстрадой, которая тянется до западной стены зала (она в нише между крыльями)."""
    ac, bc = -50.0, -1.45
    SZ = -1.5
    n = 16
    for i in range(n):
        p0 = -math.pi / 2 + math.pi * i / n
        p1 = -math.pi / 2 + math.pi * (i + 1) / n
        sec = [(ac, bc), (ac - 5.9 * math.cos(p0), bc + 5.9 * math.sin(p0)), (ac - 5.9 * math.cos(p1), bc + 5.9 * math.sin(p1))]
        prism_ab('wall2', sec, Q, SZ, True)
    for z in (-4.0, -3.0, -2.0):
        half_ring('trim', ac, bc, 5.88, 5.97, z, z + 0.06, n=n, top=False)
    for k in range(7):
        ph = -math.pi / 2 + math.pi * k / 6
        base = LP(ac - 5.0 * math.cos(ph), bc + 5.0 * math.sin(ph), SZ)
        column_s(base, 5.4, 0.6, seg=8)
    # антаблемент ротонды, терраса, балюстрада
    half_ring('trim', ac, bc, 4.3, 5.75, SZ + 5.5, SZ + 6.1, n=n)
    half_ring('wall', ac, bc, 4.4, 5.65, SZ + 6.1, SZ + 6.8, n=n, top=False)
    half_ring('trim', ac, bc, 4.3, 5.85, SZ + 6.8, DECK, n=n)
    half_ring('trim', ac, bc, 5.45, 5.75, DECK, DECK + 0.8, n=n)
    half_ring('trim', ac, bc, 5.4, 5.85, DECK + 0.8, DECK + 0.95, n=n)
    # задняя стена колоннады (по диаметру) с остеклением
    F = FR(ac, bc, W_, S_)
    HW = 8.35
    holes = [(cu - 0.9, cu + 0.9, 0.9, 4.0) for cu in (-3.0, 0.0, 3.0)]
    wall(F, -HW, HW, Q, DECK, 0, holes, m='wall2')
    for cu in (-3.0, 0.0, 3.0):
        glz(F, cu - 0.9, cu + 0.9, 0.9, 4.0, 0, 3, (0.6,))
    for cu in (-HW + 0.2, HW - 0.2):
        pass
    # терраса между ротондой и залом; по бокам — стены крыльев
    prism_ab('trim', [(ac, -9.8), (-37.1, -9.8), (-37.1, 6.9), (ac, 6.9)], DECK - 0.35, DECK, True)

def build_block_west():
    F = FR(-37.1, -1.45, W_, S_)
    HW = 8.37
    SILL, SPR, AR = 6.6, 11.3, 1.8
    hole = [(-AR, AR, SILL, SPR + AR), (-5.9, -4.7, 7.0, 9.2), (4.7, 5.9, 7.0, 9.2)]
    wall(F, -HW, HW, DECK, ZB, 0, hole)
    arch_opening(F, 0.0, SILL, SPR, AR, 0, seg=8, bars=5)
    for cu in (-1.0, 1.0):
        fbox('trim', F, cu - 0.03, cu + 0.03, -0.2, -0.14, SILL, SPR + 0.8)
    for cu in (-HW + 0.6, -HW + 3.5, HW - 3.5, HW - 0.6):
        fbox('trim', F, cu - 0.35, cu + 0.35, 0, 0.12, DECK, ZB - 0.05)
    for cu in (-5.3, 5.3):                       # картуши
        box('trim', F, cu - 0.45, cu + 0.45, 0, 0.1, 10.4, 11.4)
        box('trim', F, cu - 0.2, cu + 0.2, 0, 0.16, 10.65, 11.15)
    band(F, -HW, HW, 0, DECK, DECK + 0.2, 0.1)
    cornice(F, -HW, HW, 0, ZB, ext=0.55)
    zc = ZB + 0.6
    ov = HW + 0.5
    rise = 2.1
    prism_uz('wall', F, [(-ov + 0.3, zc), (ov - 0.3, zc), (0, zc + rise - 0.1)], -0.2, 0.2)
    for s in (-1, 1):
        beam('trim', F.p(s * ov, 0.3, zc + 0.05), F.p(0, 0.3, zc + rise + 0.05), 0.3, 0.26)
    for cu in (-5.3, 5.3):                       # окна по бокам от большого
        glz(F, cu - 0.6, cu + 0.6, 7.0, 9.2, 0, 2, (0.6,))

def build_north_bay():
    """Полуротонда бокового холла на северном фасаде северного крыла."""
    ac, bc = -24.05, -25.45
    R0, R1 = 3.4, 3.85
    SZ = 0.5
    # стилобат
    for i in range(10):
        p0 = -math.pi / 2 + math.pi * i / 10
        p1 = -math.pi / 2 + math.pi * (i + 1) / 10
        # северный полукруг: направление по -b, т.е. вращаем
        def pt(ph, r):
            return (ac + r * math.sin(ph), bc - r * math.cos(ph) * -1 * -1) if False else (ac + r * math.sin(ph), bc - r * math.cos(ph))
        sec = [(ac, bc), pt(p0, 3.95), pt(p1, 3.95)]
        prism_ab('wall2', sec, GE, SZ, True)
    for k in range(7):
        ph = -math.pi / 2 + math.pi * k / 6
        base = LP(ac + 3.4 * math.sin(ph), bc - 3.4 * math.cos(ph), SZ)
        column_s(base, 4.0, 0.46, seg=8)
    # решётки между колоннами на уровне земли — тёмные панели
    for k in range(6):
        p0 = -math.pi / 2 + math.pi * k / 6
        p1 = -math.pi / 2 + math.pi * (k + 1) / 6
        a0, b0 = ac + 3.28 * math.sin(p0), bc - 3.28 * math.cos(p0)
        a1, b1 = ac + 3.28 * math.sin(p1), bc - 3.28 * math.cos(p1)
        face('metal', [LP(a0, b0, SZ + 0.3), LP(a1, b1, SZ + 0.3), LP(a1, b1, SZ + 3.8), LP(a0, b0, SZ + 3.8)],
             LP((a0 + a1) / 2, (b0 + b1) / 2, 2) - LP(ac, bc, 2))
    # перекрытие-балкон и ограждение
    def ring_n(m, r0, r1, z0, z1):
        for i in range(10):
            p0 = -math.pi / 2 + math.pi * i / 10
            p1 = -math.pi / 2 + math.pi * (i + 1) / 10
            pts = []
            for ph, r in ((p0, r0), (p1, r0), (p1, r1), (p0, r1)):
                pts.append((ac + r * math.sin(ph), bc - r * math.cos(ph)))
            prism_ab(m, pts, z0, z1, True)
    ring_n('trim', 2.6, 4.0, SZ + 4.1, SZ + 4.8)
    for i in range(10):
        p0 = -math.pi / 2 + math.pi * i / 10
        p1 = -math.pi / 2 + math.pi * (i + 1) / 10
        a0, b0 = ac + 3.85 * math.sin(p0), bc - 3.85 * math.cos(p0)
        a1, b1 = ac + 3.85 * math.sin(p1), bc - 3.85 * math.cos(p1)
        for zz in (SZ + 5.3, SZ + 5.8):
            beam('metal', LP(a0, b0, zz), LP(a1, b1, zz), 0.04)
        beam('metal', LP(a0, b0, SZ + 4.8), LP(a0, b0, SZ + 5.8), 0.04)
    # второй этаж: стена полуцилиндра с окнами
    R = 3.2
    ZT = ZE
    z0 = SZ + 4.8
    cols = 8
    for i in range(cols):
        p0 = -math.pi / 2 + math.pi * i / cols
        p1 = -math.pi / 2 + math.pi * (i + 1) / cols
        a0, b0 = ac + R * math.sin(p0), bc - R * math.cos(p0)
        a1, b1 = ac + R * math.sin(p1), bc - R * math.cos(p1)
        am, bm = (a0 + a1) / 2, (b0 + b1) / 2
        q = [LP(a0, b0, z0), LP(a1, b1, z0), LP(a1, b1, ZT), LP(a0, b0, ZT)]
        face('wall', q, LP(am, bm, 2) - LP(ac, bc, 2))
        if i in (1, 3, 5, 6) or True:
            if i % 2 == 1 or i in (0,):
                continue
    # окна полуцилиндра: рамы-накладки
    for i in (1, 3, 4, 6):
        ph = -math.pi / 2 + math.pi * (i + 0.5) / cols
        am, bm = ac + (R + 0.02) * math.sin(ph), bc - (R + 0.02) * math.cos(ph)
        Fw = Frame(W(*LW(am, bm)), D2(-math.cos(ph), -math.sin(ph)), D2(math.sin(ph), -math.cos(ph)))
        glazing(Fw, -0.55, 0.55, z0 + 0.7, z0 + 3.0, 0.02, 2, (0.65,), reveal=0.0)
        box('trim', Fw, -0.7, 0.7, 0.0, 0.1, z0 + 3.0, z0 + 3.2)
        box('trim', Fw, -0.65, 0.65, 0.0, 0.12, z0 + 0.55, z0 + 0.7)
    half_ring('trim', 0, 0, 0, 0, 0, 0, n=1) if False else None
    ring_n('trim', 0.0, 3.8, ZT, ZT + 0.5)
    # коническая кровля
    apex = LP(ac, bc, ZT + 2.2)
    for i in range(10):
        p0 = -math.pi / 2 + math.pi * i / 10
        p1 = -math.pi / 2 + math.pi * (i + 1) / 10
        q = [LP(ac + 3.9 * math.sin(p0), bc - 3.9 * math.cos(p0), ZT + 0.5),
             LP(ac + 3.9 * math.sin(p1), bc - 3.9 * math.cos(p1), ZT + 0.5), apex]
        face('roof', q, UP)

# ================================================================== КРЫШИ ЦЕНТРАЛЬНОГО КОРПУСА
def build_block_roof():
    zr = ZB + 0.6
    F = FR(-3.1, 0, N_, W_)
    # основная часть между крыльями и восточная
    hip_roof(F, 0, 30.3, 9.8, -9.75, zr, 2.4, ov=0.6, hip0=True, hip1=False)
    F2 = FR(-33.4, -1.45, N_, W_)
    hip_roof(F2, 0, 3.7, 9.8, -6.9, zr, 2.4, ov=0.0, hip0=False, hip1=False)
    # световой фонарь зала
    Fl = FR(-9.6, -5.5, N_, W_)
    box('wall', Fl, 0, 13.8, -1.4, 1.4, zr + 1.2, zr + 3.2)
    box('glass', Fl, 0.5, 13.3, -1.45, 1.45, zr + 2.0, zr + 2.9)
    box('trim', Fl, -0.2, 14.0, -1.7, 1.7, zr + 3.2, zr + 3.4)
    chimney(F, 12.0, 6.0, zr + 1.0, zr + 3.4)
    chimney(F, 21.0, -4.0, zr + 1.0, zr + 3.4)

# ================================================================== ТЫЛ (остальные плоскости)
def build_misc():
    # северная и южная стенки центрального корпуса
    Fn = FR(-3.1, -9.8, N_, W_)
    block_side(Fn, 'N')
    Fs = FR(-3.1, 9.7, S_, W_)
    block_side(Fs, 'S')

def _cnt():
    return sum(len(b.faces) for b in BM.values())
for _f in (build_portico, build_misc, build_north_wing, build_south_wing, build_rotunda,
           build_block_west, build_north_bay, build_block_roof):
    _a = _cnt(); _f()
    print('  >> %-20s %6d граней' % (_f.__name__, _cnt() - _a))

finish('ddut', __file__, tri_budget=25000)
