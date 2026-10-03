# Акватермальный комплекс «Термы Наутико», Севастополь, ул. Загородная Балка, 1.
#
#   blender -b --python models/termy_nautiko/build.py -- [glb]
#
# План — контур OSM way 237976472, выпрямленный до прямоугольника 67.8 × 38.1 м.
# Главный вход (портик) — на восточном длинном фасаде, ближе к южному концу
# (к парковке). Западный фасад — зал с высокими арочными витражами. Фасады —
# по фото (см. NOTES.md). Ноль высоты — площадка у входа, начало — на оси портика.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

COL['wall']  = ((0.90, 0.80, 0.53), 0.9)    # песочно-кремовая штукатурка
COL['wall2'] = ((0.95, 0.94, 0.90), 0.85)   # белые крупные формы: пилястры, портик
COL['trim']  = ((0.95, 0.94, 0.90), 0.85)
COL['stone'] = ((0.62, 0.60, 0.56), 0.9)
COL['roof']  = ((0.34, 0.36, 0.38), 0.7)    # серый металл
COL['glass'] = ((0.06, 0.09, 0.12), 0.12)

# ------------------------------------------------------------------ план
A_, B_, C_, D_ = (-1242.4, 1437.0), (-1207.2, 1422.3), (-1180.9, 1484.8), (-1216.1, 1499.5)
CEN = (-1211.6, 1460.9)
L_E = math.hypot(B_[0] - C_[0], B_[1] - C_[1])       # длинная сторона (ВОСТОК), 67.8
W_E = math.hypot(C_[0] - D_[0], C_[1] - D_[1])       # короткая, 38.1
U_AX = 14.0                                          # ось портика от юго-восточного угла
# ось входа на длинной стороне
t_n = (B_[0] - C_[0], B_[1] - C_[1]); t_n = (t_n[0] / L_E, t_n[1] / L_E)
X0, Z0 = C_[0] + t_n[0] * U_AX, C_[1] + t_n[1] * U_AX
origin(X0, Z0)

Cc = W(*C_)
tN = (W(*B_) - Cc).normalized()                      # на север
nE = Vector((tN.y, -tN.x))                           # наружу, на восток
if nE.dot(W(*CEN) - Cc) > 0: nE = -nE
Lg, Wg = L_E, W_E
Bc = Cc + tN * Lg
Dc = Cc - nE * Wg
Ac = Bc - nE * Wg
FE = Frame(Cc, tN, nE)                               # восточный (вход), u = на север
FN = Frame(Bc, -nE, tN)
FW = Frame(Ac, -tN, -nE)
FS = Frame(Dc, nE, -tN)

GROUND = -3.0
PL = 0.7                 # верх цоколя
CZ = 6.4                 # низ венчающего карниза (карниз 0.6)
PZ0, PZ1 = 7.0, 8.0      # парапет-балюстрада
AZ = 9.6                 # низ кровли (аттик)
RIDGE = 11.5

# ------------------------------------------------------------------ вспомогательные
def arc_pts(cu, r, zsp, seg):
    return [(cu + r * math.cos(math.pi * k / seg), zsp + r * math.sin(math.pi * k / seg)) for k in range(seg + 1)]

def side_frame(F, u, s):
    """Рамка торца, примыкающего к фасаду по линии u: s=+1 — справа, s=-1 — слева.
    Её u' идёт от стены наружу при s=-1 и внутрь при s=+1."""
    if s > 0: return Frame(F.p(u, 0, 0).xy, -F.n, F.u)
    return Frame(F.p(u, 0, 0).xy, F.n, -F.u)

def openings(F, u0, u1, z0, z1, d, ops, rev=0.18, seg=8, glass=False, recess_mat='wall'):
    """Стена с арочными проёмами ops=[(cu, r, zbot, zsp)]: ниша глубиной rev
    (или остеклённый проём), архивольт."""
    holes = [(cu - r, cu + r, zb, zs + r) for cu, r, zb, zs in ops]
    wall(F, u0, u1, z0, z1, d, holes, 'wall', rev, recess_mat)
    for cu, r, zb, zs in ops:
        arc = arc_pts(cu, r, zs, seg)
        hs = seg // 2
        face('wall', [F.p(cu + r, d, zs + r)] + [F.p(u, d, z) for u, z in arc[:hs + 1]], F.N())
        face('wall', [F.p(cu - r, d, zs + r)] + [F.p(u, d, z) for u, z in arc[hs:]], F.N())
        dr = d - rev
        if not glass:
            face('wall', [F.p(cu - r, dr, zb), F.p(cu + r, dr, zb)] + [F.p(u, dr, z) for u, z in arc], F.N())
        for k in range(seg):
            (ua, za), (ub, zb_) = arc[k], arc[k + 1]
            q = [F.p(ua, d, za), F.p(ub, d, zb_), F.p(ub, dr, zb_), F.p(ua, dr, za)]
            face(recess_mat, q, F.p(cu, dr, zs) - sum(q, Vector()) / 4)
        # архивольт: белое кольцо
        ro = r + 0.30
        for k in range(seg):
            a0, a1 = math.pi * k / seg, math.pi * (k + 1) / seg
            pi_ = (cu + r * math.cos(a0), zs + r * math.sin(a0)); pj = (cu + r * math.cos(a1), zs + r * math.sin(a1))
            oi = (cu + ro * math.cos(a0), zs + ro * math.sin(a0)); oj = (cu + ro * math.cos(a1), zs + ro * math.sin(a1))
            face('trim', [F.p(pi_[0], d + 0.07, pi_[1]), F.p(pj[0], d + 0.07, pj[1]), F.p(oj[0], d + 0.07, oj[1]), F.p(oi[0], d + 0.07, oi[1])], F.N())
            q = [F.p(oi[0], d, oi[1]), F.p(oj[0], d, oj[1]), F.p(oj[0], d + 0.07, oj[1]), F.p(oi[0], d + 0.07, oi[1])]
            face('trim', q, sum(q, Vector()) / 4 - F.p(cu, d, zs))
        # пояски по низу: боковые полосы архивольта
        box('trim', F, cu - r - 0.30, cu - r, d, d + 0.07, zb, zs)
        box('trim', F, cu + r, cu + r + 0.30, d, d + 0.07, zb, zs)

def medallion(F, cu, z, d, r1=0.50, r2=0.66, n=14):
    for k in range(n):
        a0, a1 = 2 * math.pi * k / n, 2 * math.pi * (k + 1) / n
        P = lambda r, a: F.p(cu + r * math.cos(a), d, z + r * math.sin(a))
        face('trim', [P(r1, a0), P(r1, a1), P(r2, a1), P(r2, a0)], F.N())
    box('trim', F, cu - 0.09, cu + 0.09, d - 0.02, d + 0.04, z - 0.09, z + 0.09)       # светильник

def glass_arch(F, cu, r, zb, zs, d, rev, seg=8, bars=2, tall=True):
    """Остекление арочного витража: тёмное стекло и переплёт."""
    g = d - rev + 0.05
    arc = arc_pts(cu, r, zs, seg)
    face('glass', [F.p(cu - r, g, zb), F.p(cu + r, g, zb)] + [F.p(u, g, z) for u, z in arc], F.N())
    t = 0.07
    f0, f1 = g, g + 0.08
    box('trim', F, cu - r, cu - r + t, f0, f1, zb, zs); box('trim', F, cu + r - t, cu + r, f0, f1, zb, zs)
    for c in range(1, bars):
        u = cu - r + 2 * r * c / bars
        top = zs + math.sqrt(max(r * r - (u - cu) ** 2, 0))
        box('trim', F, u - t / 2, u + t / 2, f0, f1, zb, top)
    for z in [zb + 0.02, zb + (zs - zb) * 0.38, zb + (zs - zb) * 0.72, zs]:
        box('trim', F, cu - r, cu + r, f0, f1, z - t / 2, z + t / 2)
    for k in range(seg):                                  # обвязка дуги
        (ua, za), (ub, zb_) = arc[k], arc[k + 1]
        ri = r - t
        a0, a1 = math.pi * k / seg, math.pi * (k + 1) / seg
        ia = (cu + ri * math.cos(a0), zs + ri * math.sin(a0)); ib = (cu + ri * math.cos(a1), zs + ri * math.sin(a1))
        face('trim', [F.p(ua, f1, za), F.p(ub, f1, zb_), F.p(ib[0], f1, ib[1]), F.p(ia[0], f1, ia[1])], F.N())

def pilaster_strip(F, cu, w, z0, z1, pr=0.14):
    box('wall2', F, cu - w / 2, cu + w / 2, -0.02, pr, z0, z1)
    box('trim', F, cu - w / 2 - 0.06, cu + w / 2 + 0.06, -0.02, pr + 0.05, z0, z0 + 0.45)         # база
    box('trim', F, cu - w / 2 - 0.06, cu + w / 2 + 0.06, -0.02, pr + 0.07, z1 - 0.38, z1)         # капитель

def parapet_run(F, u0, u1, d, z0=PZ0, z1=PZ1, pitch=1.3):
    """Парапет-балюстрада: кремовая стенка, белые столбики, диски-медальоны, поручень."""
    box('wall', F, u0, u1, d - 0.15, d + 0.15, z0, z1)
    box('trim', F, u0, u1, d - 0.22, d + 0.22, z0, z0 + 0.20)
    box('trim', F, u0 - 0.04, u1 + 0.04, d - 0.24, d + 0.24, z1 - 0.18, z1)
    n = max(1, round((u1 - u0) / pitch))
    step = (u1 - u0) / n
    for i in range(n + 1):
        u = u0 + i * step
        box('trim', F, u - 0.13, u + 0.13, d - 0.20, d + 0.20, z0 + 0.20, z1 - 0.18)
    for i in range(n):
        cu = u0 + (i + 0.5) * step
        # диск-медальон (восьмигранник) на лицевой стороне
        pts = [(0.24 * math.cos(math.pi / 4 * k), 0.24 * math.sin(math.pi / 4 * k)) for k in range(8)]
        face('trim', [F.p(cu + x, d + 0.19, (z0 + z1) / 2 + y) for x, y in pts], F.N())

def crown(F, u0, u1):
    cornice(F, u0, u1, 0, CZ, ext=0.5)

# ------------------------------------------------------------------ колонна
def flute_shaft(base, z0, z1, R, n=12, taper=0.88, groove=0.05):
    bm = bm_of('trim_s')
    def ring(z, r):
        pts = []
        for k in range(n):
            for h, rr in ((0.0, r), (0.5, r - groove * r / R)):
                a = 2 * math.pi * (k + h) / n
                pts.append(bm.verts.new(base + Vector((rr * math.cos(a), rr * math.sin(a), z))))
        return pts
    a, b = ring(z0, R), ring(z1, R * taper)
    m = len(a)
    for i in range(m):
        j = (i + 1) % m
        f = bm.faces.new([a[i], a[j], b[j], b[i]]); f.smooth = True

def column(F, u, d, z0, z1, D=0.85):
    """Каннелированная колонна с базой и ионической капителью; z0 — верх пьедестала."""
    base = F.p(u, d, z0)
    R = D / 2
    ph = 0.38; ch = 0.62
    prof_b = [(R * 1.25, 0), (R * 1.25, 0.10), (R * 1.12, 0.16), (R * 1.2, 0.22), (R * 1.08, 0.30), (R * 1.0, ph)]
    lathe('trim', base, prof_b, 12, cap=True)
    flute_shaft(base, ph, z1 - ch - z0, R)
    top = z1 - ch
    rt = R * 0.88
    prof_c = [(rt, 0), (rt * 1.08, 0.06), (rt * 1.05, 0.12), (rt * 1.35, 0.30), (rt * 1.45, 0.38)]
    lathe('trim', F.p(u, d, top), prof_c, 12, cap=True)
    box('trim', F, u - D * 0.86, u + D * 0.86, d - D * 0.86, d + D * 0.86, z1 - 0.24, z1)      # абака
    for sd in (-1, 1):                                                                           # волюты
        for ss in (-1, 1):
            c = F.p(u + ss * D * 0.78, d, top + 0.42)
            beam('trim', c + F.N() * sd * D * 0.7, c - F.N() * sd * D * 0.7, 0.18, 0.18)

# ------------------------------------------------------------------ фасады
def blind_facade(F, Lf, axes, p, z_top=CZ):
    """Глухой фасад с арочными нишами и медальонами между пилястрами с осями axes."""
    ops = []
    for a, b in zip(axes[:-1], axes[1:]):
        cu = (a + b) / 2
        r = (b - a - 1.25) / 2
        ops.append((cu, r, PL, 3.5))
    openings(F, 0, Lf, PL, z_top, 0, ops, rev=0.20)
    for cu, r, zb, zs in ops:
        medallion(F, cu, 3.15, -0.20 + 0.02)
    return ops

def base_and_crown(F, Lf, parapet=True):
    box('stone', F, -0.35, Lf + 0.35, -0.3, 0.12, GROUND, PL)
    box('trim', F, -0.35, Lf + 0.35, -0.3, 0.17, PL - 0.1, PL + 0.1)
    crown(F, -0.35, Lf + 0.35)
    if parapet:
        parapet_run(F, -0.35, Lf + 0.35, 0.0)

def attic(F, Lf, glass=False):
    """Уступ над парапетом: глухая стена (или лента верхнего света на западе)."""
    d = -0.9
    if not glass:
        wall(F, 0.9, Lf - 0.9, PZ1 - 0.4, AZ, d, [])
        box('roof', F, 0.9, Lf - 0.9, d, 0.0, PZ0 - 0.05, PZ0 + 0.03)
        return
    z0, z1 = CZ + 0.62, AZ
    box('roof', F, 0.9, Lf - 0.9, d, 0.5, CZ + 0.55, CZ + 0.63)
    g = d + 0.05
    face('glass', [F.p(0.9, g, z0), F.p(Lf - 0.9, g, z0), F.p(Lf - 0.9, g, z1), F.p(0.9, g, z1)], F.N())
    box('trim', F, 0.9, Lf - 0.9, d, d + 0.14, z0, z0 + 0.25)
    box('trim', F, 0.9, Lf - 0.9, d, d + 0.14, z1 - 0.2, z1)
    n = round((Lf - 1.8) / 1.7)
    for i in range(n + 1):
        u = 0.9 + (Lf - 1.8) * i / n
        box('trim', F, u - 0.06, u + 0.06, d, d + 0.12, z0, z1)
    box('trim', F, 0.9, Lf - 0.9, d, d + 0.12, (z0 + z1) / 2 - 0.04, (z0 + z1) / 2 + 0.04)

# --- северный, южный
def build_ends():
    for F in (FS, FN):
        n = 7
        axes = [Wg * k / n for k in range(n + 1)]
        blind_facade(F, Wg, axes, Wg / n)
        for a in axes:
            if a in (axes[0], axes[-1]):
                pilaster_strip(F, a + (0.45 if a == axes[0] else -0.45), 0.9, PL, CZ)
            else:
                pilaster_strip(F, a, 0.75, PL, CZ)
        base_and_crown(F, Wg)
        attic(F, Wg)

# --- западный фасад: зал с арочными витражами
def build_west():
    F = FW
    n = 13
    p = Lg / n
    axes = [p * k for k in range(n + 1)]
    ops = []
    for a, b in zip(axes[:-1], axes[1:]):
        cu = (a + b) / 2
        ops.append((cu, 1.92, 0.95, 4.15))
    openings(F, 0, Lg, PL, CZ, 0, ops, rev=0.40, glass=True)
    for cu, r, zb, zs in ops:
        glass_arch(F, cu, r, zb, zs, 0, 0.40)
        box('trim', F, cu - r - 0.35, cu + r + 0.35, 0, 0.14, zb - 0.16, zb)                 # подоконный пояс
    for k, a in enumerate(axes):
        w = 0.9 if k in (0, n) else 0.75
        cu = a + (0.45 if k == 0 else -0.45 if k == n else 0)
        pilaster_strip(F, cu, w, PL, CZ)
    base_and_crown(F, Lg, parapet=False)
    attic(F, Lg, glass=True)

# --- восточный фасад с портиком
def build_east():
    F = FE
    d0 = 0.0
    porch = [U_AX - 10.6, U_AX + 10.6]
    pitch = (Lg - porch[1]) / 8.0
    axes_n = [porch[1] + pitch * k for k in range(9)]
    r = (pitch - 1.25) / 2
    ops = []
    for a, b in zip(axes_n[:-1], axes_n[1:]):
        ops.append(((a + b) / 2, r, PL, 3.5))
    rs = 2.1
    for s in (-1, 1):
        ops.append((U_AX + s * 6.2, rs, PL, 3.5))
    # входная арка
    DR, DZB, DZS = 2.05, 0.40, 2.85
    ops_door = (U_AX, DR, DZB, DZS)
    ops.append(ops_door)
    ops.sort()
    openings(F, 0, Lg, PL, CZ, 0, ops, rev=0.20)
    # вход: остекление глубже
    for cu, rr, zb, zs in ops:
        if cu == U_AX:
            continue
        if cu < porch[1] + 0.1 or True:
            medallion(F, cu, 3.15, -0.20 + 0.02)
    # дверной проём: глубокий откос и стекло
    arc = arc_pts(U_AX, DR, DZS, 8)
    glass_arch(F, U_AX, DR, DZB, DZS, 0, 0.20, bars=2)
    # дверной блок: стеклянные двери
    g = -0.20 + 0.05
    box('trim', F, U_AX - 0.04, U_AX + 0.04, g, g + 0.10, DZB, DZB + 2.4)
    # служебная дверь в северной нише (как на фото)
    uc = axes_n[3] + pitch / 2
    box('wood', F, uc + 0.5, uc + 1.5, -0.20 + 0.02, -0.20 + 0.10, PL, PL + 2.1)
    # пилястры
    for k, a in enumerate(axes_n):
        if k == 0: continue
        if k == 8:
            pilaster_strip(F, Lg - 0.45, 0.9, PL, CZ)
        else:
            pilaster_strip(F, a, 0.75, PL, CZ)
    pilaster_strip(F, 0.45, 0.9, PL, CZ)
    for s in (-1, 1):                              # пилястры вокруг входной зоны
        pilaster_strip(F, U_AX + s * 3.4 * 0 + s * 10.6, 1.0, PL, CZ)
    base_and_crown(F, Lg)
    attic(F, Lg)
    portico(F)

def entablature(F, u0, u1, d0, d1, z0, z1, m='wall2'):
    box(m, F, u0, u1, d0, d1, z0, z1)

def portico(F):
    c = U_AX
    HW = 5.5                  # полуширина антаблемента
    DF, DR_ = 4.3, 0.55       # ось передних / задних колонн
    ST = 0.30                 # площадка
    # стилобат / площадка
    box('stone', F, c - HW - 0.4, c + HW + 0.4, 0.0, DF + 1.4, GROUND, ST)
    box('trim', F, c - HW - 0.45, c + HW + 0.45, 0.0, DF + 1.45, ST - 0.1, ST + 0.03)
    # ступени и пандус
    for i in range(2):
        box('stone', F, c - 3.0, c + 3.0, DF + 1.4, DF + 1.4 + 0.35 * (i + 1), GROUND, ST - 0.13 * (i + 1))
    # колонны на пьедесталах
    ped = 0.85
    for s in (-1, 1):
        for d, nm in ((DF, 'f'), (DR_, 'r')):
            u = c + s * 3.9
            box('wall2', F, u - 0.78, u + 0.78, d - 0.78, d + 0.78, ST, ST + ped)
            box('trim', F, u - 0.85, u + 0.85, d - 0.85, d + 0.85, ST + ped - 0.12, ST + ped)
            box('trim', F, u - 0.84, u + 0.84, d - 0.84, d + 0.84, ST, ST + 0.16)
            column(F, u, d, ST + ped, CZ + 0.05)
    # антаблемент: архитрав, фриз, карниз
    z = CZ - 0.5
    ring_z = [(z, z + 0.5, 0.0, 'wall2'), (z + 0.5, z + 0.82, 0.12, 'wall2'), (z + 0.82, z + 1.0, 0.45, 'trim')]
    for za, zb, off, m in ring_z:
        entablature(F, c - HW - off, c + HW + off, DF - 0.85 - off * 0.4, DF + 0.85 + off, za, zb, m)          # фронт
        for s in (-1, 1):                                                                                     # боковые балки
            u0, u1 = sorted((c + s * (HW - 1.75), c + s * (HW + off)))
            entablature(F, u0, u1, 0.0, DF + 0.85 + off, za, zb, m)
    # потолок (подшивка)
    box('trim', F, c - HW + 1.7, c + HW - 1.7, 0.0, DF, CZ + 0.45, CZ + 0.5, bottom=True)
    # балюстрада поверху
    zb0 = CZ + 1.0 + 0.0
    parapet_run(F, c - HW - 0.2, c + HW + 0.2, DF + 0.9, z0=zb0, z1=zb0 + 1.0, pitch=1.25)
    for s in (-1, 1):
        Fs = side_frame(F, c + s * (HW + 0.0), s)
        a0, a1 = (-(DF + 0.9), 0.0) if s > 0 else (0.0, DF + 0.9)
        parapet_run(Fs, a0, a1, 0.0, z0=zb0, z1=zb0 + 1.0, pitch=1.25)
    # фронтон
    pz = zb0 + 1.0
    ov = HW + 0.45
    sl = math.tan(math.radians(14))
    apex = pz + ov * sl
    prism_uz('wall', F, [(c - HW, pz), (c + HW, pz), (c, pz + HW * sl)], DF + 0.1, DF + 0.5)
    bt = 0.42
    for s in (-1, 1):
        prism_uz('trim', F, [(c + s * ov, pz), (c, apex), (c, apex - bt), (c + s * (ov - bt / sl), pz)], DF - 0.15, DF + 1.0)
    box('trim', F, c - ov, c + ov, DF - 0.15, DF + 1.0, pz - 0.14, pz)
    # кровля портика (серая) назад, к парапету здания
    for s in (-1, 1):
        face('roof', [F.p(c + s * (ov + 0.1), DF + 1.0, pz), F.p(c, DF + 1.0, apex + 0.02),
                      F.p(c, 0.35, apex + 0.02), F.p(c + s * (ov + 0.1), 0.35, pz)], F.U() * s + UP)
    # боковые крыльца на концах: колонна + пилястра + антаблемент
    for s in (-1, 1):
        u = c + s * 10.6
        pw = 1.0
        box('wall2', F, u - 0.62, u + 0.62, 1.0, 2.2, ST, ST + ped)       # пьедестал
        box('trim', F, u - 0.70, u + 0.70, 0.9, 2.3, ST + ped - 0.12, ST + ped)
        column(F, u, 1.6, ST + ped, CZ + 0.05, D=0.85)
        box('stone', F, u - 1.3, u + 1.3, 0.0, 2.9, GROUND, ST * 0.5)
        entablature(F, u - 0.95, u + 0.95, 0.0, 2.45, CZ - 0.5, CZ, 'wall2')
        cornice(F, u - 0.95, u + 0.95, 2.45, CZ, ext=0.5)
        for ss in (-1, 1):
            Fc = side_frame(F, u + ss * 0.95, ss)
            a0, a1 = (0.0, 2.45) if ss < 0 else (-2.45, 0.0)
            cornice(Fc, a0, a1, 0, CZ, ext=0.5)
        parapet_run(F, u - 1.15, u + 1.15, 2.35, z0=PZ0 - 0.0, z1=PZ1)
        for ss in (-1, 1):
            Fs = side_frame(F, u + ss * 1.15, ss)
            parapet_run(Fs, *((-2.35, 0.0) if ss > 0 else (0.0, 2.35)), 0.0, z0=PZ0, z1=PZ1)
    # пандус вдоль фасада к северу и поручни
    u_a, u_b = c + HW + 0.4, c + HW + 9.0
    for i in range(6):
        ua = u_a + (u_b - u_a) * i / 6; ub = u_a + (u_b - u_a) * (i + 1) / 6
        zt = ST * (1 - (i + 0.5) / 6)
        box('stone', F, ua, ub, 3.0, 4.6, GROUND, max(zt, 0.02))
    for dd in (3.0, 4.6):
        a, b = F.p(u_a, dd, ST + 0.9), F.p(u_b, dd, 0.92)
        beam('metal', a, b, 0.05)
        beam('metal', a - UP * 0.4, b - UP * 0.4, 0.03)
        for k in range(5):
            q = a + (b - a) * (k / 4)
            beam('metal', q, q - UP * (0.9 - 0.0 * k), 0.035)
    # низкая габионная стенка вдоль цоколя на север
    box('stone', F, c + 14.0, Lg - 0.3, 3.2, 3.8, GROUND, 0.55)
    box('stone', F, 0.3, c - 14.0, 3.2, 3.8, GROUND, 0.55)

# --- кровля: пологая вальма
def build_roof():
    F = FE
    m = 0.5
    ue0, ue1 = 0.9 - m, Lg - 0.9 + m
    de0, de1 = -0.9 + m, -Wg + 0.9 - m
    zr = AZ
    A = F.p(ue0, de0, zr); B = F.p(ue1, de0, zr); C = F.p(ue1, de1, zr); D = F.p(ue0, de1, zr)
    half = abs(de0 - de1) / 2
    dm = (de0 + de1) / 2
    R0, R1 = F.p(ue0 + half, dm, zr + 1.9), F.p(ue1 - half, dm, zr + 1.9)
    face('roof', [A, B, R1, R0], F.N() + UP)
    face('roof', [C, D, R0, R1], -F.N() + UP)
    face('roof', [D, A, R0], -F.U() + UP)
    face('roof', [B, C, R1], F.U() + UP)
    face('trim', [A, B, C, D], -UP)
    beam('roof', R0 + UP * 0.05, R1 + UP * 0.05, 0.3, 0.18)
    # торец стены под кровлей: заделка щелей между свесом и атиком
    for z in (zr - 0.0,):
        pass

build_ends()
build_west()
build_east()
build_roof()

finish('termy_nautiko', __file__, 25000)
