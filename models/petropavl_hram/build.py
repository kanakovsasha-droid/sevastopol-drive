# Собор Святых Апостолов Петра и Павла (Петропавловский храм), ул. Луначарского, 37.
# Греческий дорический периптер 1840–1844 (по образцу храма Тесея): восемь колонн
# на торцах, шестнадцать на боках (всего 44), двускатная кровля, фронтоны с
# лучистым рельефом, низкий стилобат со ступенями на западном фасаде.
#
#   blender -b --python models/petropavl_hram/build.py -- [glb]
#
# План — контур OSM way 90983967 (прямоугольник 18,5 × 35,85 м), фасады — по
# фото Викисклада (см. NOTES.md). Начало координат — середина западного
# (главного) фасада по линии стилобата, ноль высоты — земля у входа.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

A = (18.9, 919.2); B = (54.4, 914.2); C = (57.0, 932.5); D = (21.5, 937.5)
MID = ((A[0] + D[0]) / 2, (A[1] + D[1]) / 2)
X0, Z0 = MID
origin(X0, Z0)

COL['wall'] = ((0.90, 0.86, 0.76), 0.9)      # тёплый известняк
COL['wall2'] = ((0.74, 0.70, 0.60), 0.95)    # швы кладки
COL['trim'] = ((0.93, 0.92, 0.88), 0.85)     # колонны, лепнина
COL['stone'] = ((0.60, 0.58, 0.53), 0.95)    # стилобат
COL['roof'] = ((0.58, 0.21, 0.18), 0.7)      # крашеная жесть
COL['wood'] = ((0.48, 0.28, 0.11), 0.6)      # двери, иконы-мозаики, крест
COL['metal'] = ((0.22, 0.20, 0.17), 0.7)     # канавки триглифов

F, _ = frame_from(MID, D, (34, 925))         # u — к югу, n — наружу (на запад)
HW = 9.25                                    # полуширина стилобата
L = 35.85                                    # длина стилобата
GROUND = -3.0
ST1, ST = 0.22, 0.45                         # верх нижней и верхней ступени стилобата
EC = 1.05                                    # ось колонн от края стилобата
E = 0.42                                     # лицо архитрава от края
HS = 5.55                                    # ствол колонны
COLH = HS + 0.50                             # колонна с капителью
ENT0 = ST + COLH                             # низ архитрава
FR0, FR1 = ENT0 + 0.70, ENT0 + 1.38          # фриз
COR1 = ENT0 + 1.82                           # верх карниза
SL = math.tan(math.radians(17.5))            # уклон фронтона и кровли
HWC = HW - E + 0.40                          # полуширина по карнизу
ZA = COR1 + HWC * SL                         # вершина фронтона
DW = 4.6                                     # задняя стена пронаоса от края стилобата
CW = HW - 3.2                                # полуширина целлы

Fs = Frame(F.p(HW, 0, 0).xy, -F.n, F.u)      # южный бок (идём на восток)
Fe = Frame(F.p(HW, -L, 0).xy, -F.u, -F.n)    # восточный торец
Fn = Frame(F.p(-HW, -L, 0).xy, F.n, -F.u)    # северный бок (идём на запад)
Fb = Frame(F.p(0, -L, 0).xy, -F.u, -F.n)     # восточный торец с центром в нуле
SIDES = [(F, None, 2 * HW, 8), (Fs, None, L, 16), (Fe, None, 2 * HW, 8), (Fn, None, L, 16)]
# рамка западного торца с началом в левом углу
Fw = Frame(F.p(-HW, 0, 0).xy, F.u, F.n)
SIDES[0] = (Fw, None, 2 * HW, 8)


# ------------------------------------------------------------------ колонна
def doric(base, H=COLH):
    """Дорическая колонна: каннелированный ствол с энтазисом, эхин, абака."""
    Rb, Rt = 0.55, 0.42
    nf = 20
    ts = (0.0, 0.3, 0.65, 1.0)
    rings = []
    for t in ts:
        R = Rb + (Rt - Rb) * t + 0.012 * math.sin(math.pi * t)
        z = base.z + HS * t
        rings.append([(R if j % 2 == 0 else R * 0.93, z, 2 * math.pi * j / nf) for j in range(nf)])
    for i in range(len(rings) - 1):
        for j in range(nf):
            k = (j + 1) % nf
            pts = []
            for r, z, a in (rings[i][j], rings[i][k], rings[i + 1][k], rings[i + 1][j]):
                pts.append(Vector((base.x + r * math.cos(a), base.y + r * math.sin(a), z)))
            am = (rings[i][j][2] + rings[i][k][2]) / 2
            face('trim', pts, Vector((math.cos(am), math.sin(am), 0)))
    # эхин
    zb = base + Vector((0, 0, HS))
    lathe('trim', zb, [(0.42, 0.0), (0.45, 0.05), (0.49, 0.10), (0.56, 0.17), (0.62, 0.26)], 12, cap=False)
    # абака
    F0 = Frame(Vector((base.x, base.y)), Vector((1, 0)), Vector((0, 1)))
    box('wall', F0, -0.65, 0.65, -0.65, 0.65, base.z + HS + 0.26, base.z + H)
    # упрощённая колонна для дальнего уровня (скрыта внутри каннелюр)
    lathe('trim_s', base, [(0.495, 0.0), (0.378, HS), (0.56, HS + 0.26)], 10, cap=False)


# ------------------------------------------------------------------ антаблемент
def ring(z0, z1, out, m, T=1.3):
    hw = HW - E + out
    dF = -(E - out)
    dB = -(L - E + out)
    box(m, F, -hw, hw, dF - (T + out), dF, z0, z1)
    box(m, F, -hw, hw, dB, dB + T + out, z0, z1)
    box(m, F, -hw, -hw + T + out, dB, dF, z0, z1)
    box(m, F, hw - T - out, hw, dB, dF, z0, z1)


def stylobate():
    box('stone', F, -HW, HW, -L, 0, GROUND, ST1)
    box('stone', F, -HW + 0.3, HW - 0.3, -L + 0.3, -0.3, ST1 - 0.01, ST)
    # ступени главного входа (западный фасад)
    box('stone', F, -3.5, 3.5, 0.0, 0.95, GROUND, 0.11)
    box('stone', F, -3.3, 3.3, -0.3, 0.1, ST1 - 0.01, ST1)


def colonnade():
    for Fr, _, ln, n in SIDES:
        step = (ln - 2 * EC) / (n - 1)
        for i in range(n - 1):
            c = EC + i * step
            doric(Fr.p(c, -EC, ST))
        # триглифы и мутулы
        mids = [EC + (i + 0.5) * step for i in range(n - 1)]
        axes = [EC + i * step for i in range(1, n - 1)]
        for c in mids + axes:
            box('trim', Fr, c - 0.24, c + 0.24, -E - 0.002, -E + 0.07, FR0 + 0.06, FR1 - 0.0)
            for s in (-0.09, 0.09):
                box('metal', Fr, c + s - 0.025, c + s + 0.025, -E, -E + 0.08, FR0 + 0.14, FR1 - 0.10)
            box('trim', Fr, c - 0.22, c + 0.22, -E, -E + 0.10, FR0, FR0 + 0.06)
            box('trim', Fr, c - 0.25, c + 0.25, -E + 0.02, -E + 0.38, FR1 - 0.09, FR1)


def entablature():
    ring(ENT0, ENT0 + 0.70, 0.0, 'wall')
    ring(ENT0 + 0.64, ENT0 + 0.72, 0.04, 'trim', 0.3)
    ring(FR0, FR1, 0.0, 'wall', 0.6)
    ring(FR1, ENT0 + 1.70, 0.40, 'wall', 1.0)
    ring(ENT0 + 1.70, COR1, 0.28, 'trim', 0.8)
    box('wall', F, -(HW - E), HW - E, -(L - E), -E, ENT0 + 0.40, ENT0 + 0.55)   # потолок


def pediment(Fp):
    bt = 0.42
    ib = HWC - bt / SL
    prism_uz('wall', Fp, [(-ib, COR1), (ib, COR1), (0, ZA - bt)], -0.72, -0.30)
    for s in (-1, 1):
        prism_uz('trim', Fp, [(s * HWC, COR1), (0, ZA), (0, ZA - bt), (s * ib, COR1)], -0.58, 0.02)
        prism_uz('trim', Fp, [(s * (HWC + 0.05), COR1 - 0.02), (0, ZA + 0.08), (0, ZA), (s * HWC, COR1)], -0.58, 0.06)
    # лучи
    dr = -0.30 + 0.035
    c0 = COR1 + 0.55
    zlim = ZA - bt - 0.14
    th = 12.0
    while th < 169:
        a = math.radians(th)
        ca, sa = math.cos(a), math.sin(a)
        tmax = (zlim - c0) / (sa + SL * abs(ca))
        r0 = 0.75
        if tmax > r0 + 0.3:
            beam('trim', Fp.p(ca * r0, dr, c0 + sa * r0), Fp.p(ca * tmax, dr, c0 + sa * tmax), 0.075, 0.07)
        th += 6.0
    # постамент с звёздами и эмблема
    box('trim', Fp, -0.95, 0.95, -0.30, -0.10, COR1 + 0.04, COR1 + 0.44)
    for u in (-0.5, 0, 0.5):
        box('wall2', Fp, u - 0.07, u + 0.07, -0.10, -0.085, COR1 + 0.17, COR1 + 0.31)
    box('trim', Fp, -0.40, 0.40, -0.30, -0.12, COR1 + 0.44, COR1 + 0.70)
    box('trim', Fp, -0.12, 0.12, -0.30, -0.14, COR1 + 0.70, COR1 + 1.20)


def roof():
    zr = lambda u: COR1 + 0.10 + (HWC - abs(u)) * SL
    d0, d1 = -0.60, -(L - 0.60)
    for s in (-1, 1):
        face('roof', [F.p(s * (HWC + 0.02), d0, zr(HWC)), F.p(0, d0, zr(0)),
                      F.p(0, d1, zr(0)), F.p(s * (HWC + 0.02), d1, zr(HWC))], UP)
    beam('roof', F.p(0, d0, zr(0) + 0.05), F.p(0, d1, zr(0) + 0.05), 0.30, 0.16)
    # купольная главка с крестом над западным фронтоном
    z0 = zr(0) + 0.10
    dk = -1.7
    box('trim', F, -0.55, 0.55, dk - 0.55, dk + 0.55, z0 - 0.25, z0 + 0.62)
    box('trim', F, -0.65, 0.65, dk - 0.65, dk + 0.65, z0 + 0.62, z0 + 0.74)
    base = F.p(0, dk, z0 + 0.74)
    lathe('trim', base, [(0.32, 0.0), (0.46, 0.13), (0.50, 0.27), (0.40, 0.44), (0.20, 0.57), (0.07, 0.66)], 12)
    zt = z0 + 0.74 + 0.64
    lathe('wood', F.p(0, dk, zt), [(0.0, 0.0), (0.10, 0.04), (0.12, 0.12), (0.08, 0.22), (0.0, 0.24)], 8)
    p = F.p(0, dk, zt + 0.24)
    beam('wood', p, p + UP * 1.5, 0.08, 0.08)
    for zz, w in ((0.50, 0.50), (1.15, 0.28)):
        q = p + UP * zz
        beam('wood', q - F.U() * w / 2, q + F.U() * w / 2, 0.08, 0.08)
    # вентиляционная будка на скате
    box('wall', F, 3.6, 4.5, -6.0, -5.1, zr(4.1) - 0.1, zr(4.1) + 0.9)


# ------------------------------------------------------------------ целла
def joints(Fr, u0, u1, d, z0, z1, hole=None):
    z = z0 + 0.62
    while z < z1 - 0.1:
        if hole and z > hole[2] and z < hole[3]:
            box('wall2', Fr, u0, hole[0], d, d + 0.012, z, z + 0.03)
            box('wall2', Fr, hole[1], u1, d, d + 0.012, z, z + 0.03)
        else:
            box('wall2', Fr, u0, u1, d, d + 0.012, z, z + 0.03)
        z += 0.62


def cella():
    ZT = ENT0 + 0.45
    door = (-0.85, 0.85, ST, ST + 3.30)
    wall(F, -CW, CW, GROUND, ZT, -DW, [door], 'wall')
    box('wall', F, -CW, CW, -(L - DW), -DW - 0.24, GROUND, ZT)                # тело целлы
    box('wall', F, -CW, -CW + 0.4, -(L - DW), -DW, GROUND, ZT)
    box('wall', F, CW - 0.4, CW, -(L - DW), -DW, GROUND, ZT)
    # кладка
    joints(F, -CW, CW, -DW, ST, ZT - 0.3, hole=(-0.85, 0.85, 0, ST + 3.3))
    joints(Fb, -CW, CW, -DW, ST, ZT - 0.3)
    for s, Fr in ((1, Frame(F.p(CW, 0, 0).xy, -F.n, F.u)), (-1, Frame(F.p(-CW, -L, 0).xy, F.n, -F.u))):
        joints(Fr, DW, L - DW, 0, ST, ZT - 0.3)
    # лопатки у торцов целлы
    for Fr in (F, Fb):
        for s in (-1, 1):
            u0, u1 = sorted((s * CW, s * (CW - 0.55)))
            box('trim', Fr, u0, u1, -DW, -DW + 0.10, ST, ZT - 0.2)
            box('trim', Fr, u0 - 0.03 * s, u1 + 0.03 * s, -DW, -DW + 0.14, ZT - 0.5, ZT - 0.2)
    # дверь и портал
    g = -DW - 0.18
    face('wood', [F.p(-0.85, g, ST), F.p(0.85, g, ST), F.p(0.85, g, ST + 3.30), F.p(-0.85, g, ST + 3.30)], F.N())
    box('wood', F, -0.03, 0.03, g, g + 0.05, ST, ST + 3.30)
    for z in (ST + 2.4, ST + 3.2):
        box('trim', F, -0.85, 0.85, g, g + 0.06, z - 0.03, z + 0.03)
    box('trim', F, -1.20, -0.85, -DW, -DW + 0.14, ST, ST + 3.5)
    box('trim', F, 0.85, 1.20, -DW, -DW + 0.14, ST, ST + 3.5)
    box('trim', F, -1.20, 1.20, -DW, -DW + 0.14, ST + 3.3, ST + 3.6)
    box('trim', F, -1.45, 1.45, -DW, -DW + 0.28, ST + 3.6, ST + 3.78)
    # мозаичные иконы апостолов по сторонам двери
    for cu in (-2.45, 2.45):
        box('trim', F, cu - 0.62, cu + 0.62, -DW, -DW + 0.04, ST + 0.75, ST + 3.15)
        box('wood', F, cu - 0.50, cu + 0.50, -DW + 0.04, -DW + 0.07, ST + 0.88, ST + 3.02)
    # мемориальные доски
    for cu in (-4.6, 4.6):
        box('metal', F, cu - 0.4, cu + 0.4, -DW, -DW + 0.04, ST + 1.2, ST + 2.2)


stylobate()
colonnade()
entablature()
pediment(F)
pediment(Fb)
roof()
cella()

finish('petropavl_hram', __file__)
