# Церковь Всех Святых на старом городском кладбище (ул. Пожарова), 1822 г. — модель с нуля.
#
#   blender -b --python models/vseh_svyatyh/build.py -- [glb]
#
# План — по контуру OSM way 91744622 (29,7 × 11,9 м) и спутнику (два тёмных круга
# по углам севера: колокольня на западе, ротонда-купол на востоке). Фасады — по фото
# с Викисклада (refs/) и снимку 1856 г. Ноль высоты — земля у северного входа.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import *

# ---- цвета этого дома (до геометрии)
COL['wall']  = ((0.93, 0.88, 0.62), 0.9)     # светло-жёлтая штукатурка
COL['trim']  = ((0.96, 0.95, 0.91), 0.85)    # белые детали
COL['wall2'] = ((0.56, 0.31, 0.26), 0.85)    # красно-коричневое кровельное железо плоских крыш
COL['roof']  = ((0.26, 0.22, 0.19), 0.55)    # тёмный металл куполов и шатра
COL['stone'] = ((0.27, 0.30, 0.29), 0.8)     # тёмный гранит цоколя
COL['wood']  = ((0.10, 0.42, 0.34), 0.55)    # зелёные ворота с решёткой
COL['metal'] = ((0.17, 0.17, 0.17), 0.5)     # решётки, кресты

X0, Z0 = -1493.5, 1631.1                    # середина северного входа на земле
origin(X0, Z0)

NW, NE, SE, SW = (-1504.8, 1631.4), (-1475.1, 1630.7), (-1474.8, 1642.6), (-1504.5, 1643.3)
CEN = (-1490.0, 1637.0)
FN, LN = frame_from(NW, NE, CEN)     # север: u на восток, d наружу (на север)
FS, LS = frame_from(SW, SE, CEN)     # юг:    u на восток, d наружу (на юг)
FE, LE = frame_from(NE, SE, CEN)     # восток: u на юг
FW, LW = frame_from(NW, SW, CEN)     # запад:  u на юг

GR = -2.5          # низ стен
WH = 4.6           # верх стен / низ карниза
RZ = WH + 0.6      # низ крыши (верх карниза)
BODY = 9.3         # глубина основного объёма (север → южная стена в нише лоджии)
LOG = 2.6          # глубина портика и лоджии по югу

# ------------------------------------------------------------------ свои примитивы
def lathe_ph(m, base, prof, seg=8, phase=0.0, smooth=False, cap=True):
    """lathe из kit с поворотом фазы и плоской штриховкой (для граней шатра)."""
    bm = bm_of(m)
    rings = []
    for r, z in prof:
        rings.append([bm.verts.new(base + Vector((r * math.cos(phase + 2 * math.pi * k / seg),
                                                  r * math.sin(phase + 2 * math.pi * k / seg), z)))
                      for k in range(seg)])
    for i in range(len(rings) - 1):
        for k in range(seg):
            j = (k + 1) % seg
            f = bm.faces.new([rings[i][k], rings[i][j], rings[i + 1][j], rings[i + 1][k]])
            f.smooth = smooth
    if cap:
        f = bm.faces.new(rings[-1]); f.normal_update()
        if f.normal.z < 0: f.normal_flip()

def blind_win(F, cu, za, w, h, d=0.0):
    """Окно на поверхности тела вращения (без проёма): наличник, стекло, переплёт, решётка."""
    ua, ub, zb = cu - w / 2, cu + w / 2, za + h
    surround(F, ua, ub, za, zb, d, 'plain')
    g = d + 0.015
    face('glass', [F.p(ua, g, za), F.p(ub, g, za), F.p(ub, g, zb), F.p(ua, g, zb)], F.N())
    grille(F, ua, ub, za, zb, g, 4, 3)

def grille(F, ua, ub, za, zb, g, nv, nh):
    t = 0.045
    box('trim', F, ua, ua + t, g, g + 0.05, za, zb); box('trim', F, ub - t, ub, g, g + 0.05, za, zb)
    box('trim', F, ua, ub, g, g + 0.05, za, za + t); box('trim', F, ua, ub, g, g + 0.05, zb - t, zb)
    for i in range(1, nv):
        u = ua + (ub - ua) * i / nv
        box('metal', F, u - 0.015, u + 0.015, g + 0.04, g + 0.08, za, zb)
    for i in range(1, nh):
        z = za + (zb - za) * i / nh
        box('metal', F, ua, ub, g + 0.04, g + 0.08, z - 0.015, z + 0.015)

def barred_window(F, cu, za, w, h, d):
    """Окно в проёме стены: наличник, стекло в глубине, решётка снаружи."""
    window(F, cu, za, w, h, d, 'plain', 2, (0.62,))
    grille(F, cu - w / 2, cu + w / 2, za, za + h, d - 0.02, 4, 3)
    return (cu - w / 2, cu + w / 2, za, za + h)

def gate(F, cu, w, h, dw, z0):
    """Зелёные решётчатые ворота в проёме стены на глубине dw."""
    gd = dw - 0.2
    ua, ub = cu - w / 2, cu + w / 2
    face('glass', [F.p(ua, gd - 0.01, z0), F.p(ub, gd - 0.01, z0), F.p(ub, gd - 0.01, z0 + h), F.p(ua, gd - 0.01, z0 + h)], F.N())
    t = 0.06
    box('wood', F, ua, ua + t, gd, gd + 0.07, z0, z0 + h); box('wood', F, ub - t, ub, gd, gd + 0.07, z0, z0 + h)
    box('wood', F, cu - 0.03, cu + 0.03, gd, gd + 0.07, z0, z0 + h)
    box('wood', F, ua, ub, gd, gd + 0.07, z0 + h - t, z0 + h)
    box('wood', F, ua, ub, gd, gd + 0.07, z0, z0 + 0.95)           # глухая нижняя филёнка
    n = 7
    for i in range(1, n):
        for s in (-1, 1):
            u = cu + s * (w / 2) * i / n
            box('wood', F, u - 0.025, u + 0.025, gd, gd + 0.06, z0 + 0.95, z0 + h)
    for k in range(1, 5):
        z = z0 + 0.95 + (h - 0.95) * k / 5
        box('wood', F, ua, ub, gd, gd + 0.06, z - 0.03, z + 0.03)

def pilaster_s(F, cu, d, z0, z1, w=0.46, pr=0.12):
    box('trim', F, cu - w / 2 - 0.05, cu + w / 2 + 0.05, d, d + pr + 0.04, z0, z0 + 0.3)
    box('trim', F, cu - w / 2, cu + w / 2, d, d + pr, z0 + 0.3, z1 - 0.3)
    box('trim', F, cu - w / 2 - 0.06, cu + w / 2 + 0.06, d, d + pr + 0.05, z1 - 0.3, z1)

def tuscan(base, H=3.4, R=0.26):
    """Колонна: база и капитель (trim), ствол с энтазисом (trim_s, виден и вдали)."""
    lathe('trim', base, [(R * 1.35, 0.0), (R * 1.35, 0.1), (R * 1.1, 0.14), (R * 1.0, 0.2)], 10, cap=False)
    lathe('trim_s', base, [(R * 1.0, 0.2), (R * 0.97, H * 0.5), (R * 0.88, H - 0.32)], 10, cap=False)
    lathe('trim', base, [(R * 0.95, H - 0.32), (R * 1.25, H - 0.26), (R * 1.35, H - 0.17), (R * 1.4, H - 0.12)], 10, cap=False)
    box('trim', Frame(Vector((base.x, base.y)), Vector((1, 0)), Vector((0, 1))),
        -R * 1.6, R * 1.6, -R * 1.6, R * 1.6, base.z + H - 0.12, base.z + H)

def entablature(F, u0, u1, d0, d1, z):
    """Антаблемент z .. z+0.9: архитрав, фриз, карниз с вылетом вперёд (d1 — лицо)."""
    box('trim', F, u0, u1, d0, d1, z, z + 0.32)
    box('wall', F, u0, u1, d0, d1 - 0.02, z + 0.32, z + 0.6)
    box('trim', F, u0 - 0.15, u1 + 0.15, d0, d1 + 0.2, z + 0.6, z + 0.74)
    box('trim', F, u0 - 0.25, u1 + 0.25, d0, d1 + 0.3, z + 0.74, z + 0.9)

def gable(F, uc, hw, z0, rise, d_f, d_b, rm='wall2', back_wall=True):
    """Фронтон: тимпан, наклонные карнизы с зубцами, кровля назад до d_b."""
    ov = hw + 0.3
    sl = rise / hw
    apex = z0 + ov * sl
    prism_uz('wall', F, [(uc - hw, z0), (uc + hw, z0), (uc, z0 + rise)], d_f - 0.3, d_f - 0.05)
    bt = 0.34
    for s in (-1, 1):
        prism_uz('trim', F, [(uc + s * ov, z0), (uc, apex), (uc, apex - bt), (uc + s * (ov - bt / sl), z0)], d_f - 0.2, d_f + 0.35)
        prism_uz('trim', F, [(uc + s * ov, z0 - 0.02), (uc, apex + 0.08), (uc, apex), (uc + s * ov, z0 - 0.1)], d_f - 0.2, d_f + 0.43)
        k = 1
        while k * 0.5 < ov - 0.8:
            u = uc + s * k * 0.5
            zt = apex - abs(u - uc) * sl - bt
            box('trim', F, u - 0.09, u + 0.09, d_f + 0.35, d_f + 0.5 + 0.0, zt - 0.2, zt + 0.02)
            k += 1
        face(rm, [F.p(uc + s * (ov + 0.06), d_f + 0.43, z0 + 0.0), F.p(uc, d_f + 0.43, apex + 0.09),
                  F.p(uc, d_b, apex + 0.09), F.p(uc + s * (ov + 0.06), d_b, z0 + 0.0)], F.U() * s + UP)
    if back_wall:
        prism_uz('wall', F, [(uc - ov, z0 - 0.05), (uc + ov, z0 - 0.05), (uc, apex)], d_b, d_b + 0.05)

def cross(p, h=1.7):
    beam('metal', p, p + UP * h, 0.07)
    X = Vector((1, 0, 0))
    beam('metal', p + UP * h * 0.90 - X * 0.2, p + UP * h * 0.90 + X * 0.2, 0.05, 0.05)
    beam('metal', p + UP * h * 0.72 - X * 0.42, p + UP * h * 0.72 + X * 0.42, 0.06, 0.06)
    beam('metal', p + UP * h * 0.28 - X * 0.2 - UP * 0.05, p + UP * h * 0.28 + X * 0.2 + UP * 0.07, 0.05, 0.05)

def onion(base, z0, s=1.0):
    """Маленькая луковка на шее; возвращает верх."""
    prof = [(0.34 * s, 0.0), (0.34 * s, 0.35), (0.30 * s, 0.4), (0.52 * s, 0.55), (0.62 * s, 0.78),
            (0.50 * s, 1.02), (0.28 * s, 1.2), (0.07 * s, 1.36)]
    lathe('roof', base, [(r, z0 + z) for r, z in prof], 12, cap=True)
    return z0 + 1.36

# ------------------------------------------------------------------ здание
def build_body():
    # --- северная стена с выступом-фронтоном
    holes = []
    for cu in (1.9, 5.4, 17.35, 20.05, 25.45, 28.05):
        holes.append(barred_window(FN, cu, 1.2, 1.0, 1.8, 0))
    wall(FN, 0, LN, GR, WH, 0, holes)
    box('stone', FN, 0, LN, -0.3, 0.07, GR, 0.6)
    band(FN, 0, LN, 0, 0.6, 0.72, 0.1)
    for cu in (0.4, 3.65, 16.0, 18.7, 21.4, 24.1, 26.8, 29.3):
        pilaster_s(FN, cu, 0, 0.6, WH)
    cornice(FN, 0, LN, 0, WH, ext=0.45)
    # выступ-фронтон (главный вход)
    A0, A1, AD = 7.4, 15.2, 0.9
    acu = (A0 + A1) / 2 + 0.0
    ah = []
    door = (acu - 0.75, acu + 0.75, 0.42, 3.1)
    ah.append(door)
    for cu in (acu - 2.2, acu + 2.2):
        ah.append(barred_window(FN, cu, 1.2, 1.0, 1.8, AD))
    wall(FN, A0, A1, GR, WH, AD, ah)
    for u in (A0, A1):
        s = 1 if u == A1 else -1
        face('wall', [FN.p(u, 0, GR), FN.p(u, AD, GR), FN.p(u, AD, WH), FN.p(u, 0, WH)], FN.U() * s)
    gate(FN, acu, 1.5, 2.68, AD, 0.42)
    box('stone', FN, A0 - 0.05, A1 + 0.05, 0, AD + 0.07, GR, 0.6)
    band(FN, A0, A1, AD, 0.6, 0.72, 0.1)
    for u in (A0 + 0.25, A0 + 0.95, acu - 1.1, acu + 1.1, A1 - 0.95, A1 - 0.25):
        pilaster_s(FN, u, AD, 0.6, WH, w=0.36)
    cornice(FN, A0, A1, AD, WH, ext=0.45)
    gable(FN, acu, (A1 - A0) / 2 + 0.1, RZ, 1.75, AD, -3.9)
    # крыльцо
    box('stone', FN, acu - 1.7, acu + 1.7, AD, AD + 0.9, GR, 0.14)
    box('stone', FN, acu - 1.3, acu + 1.3, AD, AD + 0.5, GR, 0.28)
    box('stone', FN, acu - 1.5, acu + 1.5, AD - 0.3, AD, GR, 0.42)

    # --- южная стена (в нише лоджии) и портик
    SD = -LOG
    holes = []
    PC, PW = 4.55, 5.0                    # центр и ширина портика (по колонам)
    holes.append((PC - 0.85, PC + 0.85, 0.42, 3.55))
    for cu in (0.9, 8.7, 10.9, 13.1):
        holes.append(barred_window(FS, cu, 1.2, 1.0, 1.8, SD))
    for i in range(6):
        holes.append(barred_window(FS, 15.3 + 2.3 * (i + 0.5), 1.2, 1.0, 1.8, SD))
    wall(FS, 0, LS, GR, WH, SD, holes)
    box('stone', FS, 0, LS, SD - 0.3, SD + 0.07, GR, 0.6)
    band(FS, 0, LS, SD, 0.6, 0.72, 0.1)
    cornice(FS, 0, LS, SD, WH, ext=0.45)
    for cu in (0.4, 7.7, 9.8, 12.0, 14.2):
        pilaster_s(FS, cu, SD, 0.6, WH)
    gate(FS, PC, 1.7, 3.13, SD, 0.42)
    # тёмные гранитные панели с белыми крестами по сторонам ворот
    for s in (-1, 1):
        cu = PC + s * 1.75
        box('stone', FS, cu - 0.5, cu + 0.5, SD, SD + 0.05, 0.42, 1.5)
        box('trim', FS, cu - 0.07, cu + 0.07, SD + 0.05, SD + 0.08, 0.62, 1.32)
        box('trim', FS, cu - 0.27, cu + 0.27, SD + 0.05, SD + 0.08, 0.92, 1.06)
    # портик: стилобат, 4 колонны, антаблемент, фронтон
    u0, u1 = PC - PW / 2, PC + PW / 2
    box('stone', FS, u0 - 0.1, u1 + 0.1, SD, 0.2, GR, 0.35)
    box('trim', FS, u0 - 0.12, u1 + 0.12, SD, 0.22, 0.30, 0.38)
    box('stone', FS, PC - 1.8, PC + 1.8, 0.2, 0.75, GR, 0.2)
    box('stone', FS, PC - 1.6, PC + 1.6, 0.2, 0.45, GR, 0.28)
    for cu in (u0 + 0.3, PC - 0.95, PC + 0.95, u1 - 0.3):
        tuscan(FS.p(cu, -0.7, 0.38), 3.35, 0.26)
    for cu in (u0 + 0.3, u1 - 0.3):         # боковые колонны вглубь портика
        tuscan(FS.p(cu, -1.75, 0.38), 3.35, 0.26)
    entablature(FS, u0 - 0.05, u1 + 0.05, SD, -0.25, 3.73)
    box('trim', FS, u0 - 0.05, u0 + 0.05, SD, -0.25, 3.73, 4.63)
    gable(FS, PC, PW / 2 + 0.05, 4.63 + 0.2, 1.4, -0.25, -3.6)
    # икона-медальон во фронтоне
    box('trim', FS, PC - 0.22, PC + 0.22, -0.3, -0.24, 5.25, 5.8)
    # лоджия по востоку: стилобат, колонны, антаблемент, скат
    L0 = 14.7
    box('stone', FS, L0, LS, SD, 0.0, GR, 0.3)
    box('trim', FS, L0, LS, SD, 0.04, 0.3, 0.38)
    for i in range(7):
        tuscan(FS.p(15.3 + 2.3 * i, -0.75, 0.38), 3.35, 0.24)
    entablature(FS, L0, LS, SD, -0.3, 3.73)
    face('trim', [FS.p(L0, 0.0, 4.63), FS.p(LS, 0.0, 4.63), FS.p(LS, SD, 4.63), FS.p(L0, SD, 4.63)], -UP)
    face('wall2', [FS.p(L0 - 0.1, 0.35, 4.65), FS.p(LS + 0.1, 0.35, 4.65), FS.p(LS + 0.1, SD - 0.1, RZ + 0.1), FS.p(L0 - 0.1, SD - 0.1, RZ + 0.1)], FS.N() + UP)
    # западный и восточный торцы лоджии/ниши закрыты стенами торцов (см. ниже)

    # --- торцы
    for F, L, wins, name in ((FE, LE, (2.4, 6.4), 'E'), (FW, BODY, (2.4, 6.4), 'W')):
        holes = [barred_window(F, cu, 1.2, 1.0, 1.8, 0) for cu in wins]
        wall(F, 0, L, GR, WH, 0, holes)
        box('stone', F, 0, L, -0.3, 0.07, GR, 0.6)
        band(F, 0, L, 0, 0.6, 0.72, 0.1)
        cornice(F, 0, L, 0, WH, ext=0.45)
        for cu in (4.4, 8.4):
            pilaster_s(F, cu, 0, 0.6, WH)
    for F, L in ((FN, LN), (FS, LS)):         # угловые лопатки по краям длинных стен
        pass

    # --- плоская кровля основного объёма: пологая вальма
    hip_roof(FN, 0.0, LN, 0, -BODY, RZ, 1.05, ov=0.5, m='wall2')

def build_rotunda():
    """Ротонда с куполом (восток). Барабан, венчающий карниз, купол, шейка, луковка, крест — телами вращения."""
    c = FN.p(26.2, -3.2, 0)
    R = 2.25
    lathe('wall', c, [(R, RZ - 0.4), (R, 8.3)], 20, cap=False)
    # лопатки между окнами
    segs = 6
    for k in range(segs):
        a = math.radians(30 + 60 * k)
        dr = Vector((math.cos(a), math.sin(a)))
        tg = Vector((-dr.y, dr.x))
        Fk = Frame(Vector((c.x, c.y)) + dr * (R * math.cos(math.pi / 20) - 0.01), tg, dr)
        blind_win(Fk, 0, 5.75, 0.95, 1.8, 0)
        # лопатка в промежутке (на 30° дальше)
        b = a + math.radians(30)
        db = Vector((math.cos(b), math.sin(b)))
        Fb = Frame(Vector((c.x, c.y)) + db * (R * math.cos(math.pi / 20) - 0.01), Vector((-db.y, db.x)), db)
        box('trim', Fb, -0.2, 0.2, 0, 0.1, RZ - 0.1, 8.0)
    # пояс по низу окон и венчающий карниз
    lathe('trim', c, [(R + 0.06, RZ - 0.1), (R + 0.06, RZ + 0.1), (R, RZ + 0.1)], 20, cap=False)
    lathe('trim', c, [(R - 0.1, 8.25), (R + 0.2, 8.32), (R + 0.42, 8.46), (R + 0.5, 8.62), (R + 0.46, 8.82), (R + 0.2, 8.95), (R - 0.1, 8.98)], 24, cap=False)
    # купол
    prof = []
    n = 8
    for i in range(n + 1):
        t = math.radians(80 * i / n)
        prof.append(((R + 0.1) * math.cos(t) * 0.97, 8.95 + 2.1 * math.sin(t)))
    lathe('roof', c, prof, 24, cap=True)
    ztop = prof[-1][1]
    lathe('roof', c, [(0.42, ztop - 0.1), (0.42, ztop + 0.25), (0.5, ztop + 0.3)], 12, cap=False)
    zt = onion(c, ztop + 0.3)
    cross(Vector((c.x, c.y, zt)), 1.8)

def build_tower():
    """Колокольня (запад): восьмигранный барабан звона, круглый вынос карниза, восьмигранный шатёр, луковка, крест."""
    c = FN.p(6.4, -3.2, 0)
    Ra = 1.9
    Rc = Ra / math.cos(math.pi / 8)
    ph = math.pi / 8
    lathe_ph('wall', c, [(Rc, RZ - 0.4), (Rc, 8.6)], 8, ph, cap=False)
    for k in range(8):                                     # угловые лопатки
        a = ph + k * math.pi / 4
        p = c + Vector((math.cos(a), math.sin(a), 0)) * (Rc + 0.02)
        beam('trim', Vector((p.x, p.y, RZ - 0.3)), Vector((p.x, p.y, 8.5)), 0.28, 0.28)
    for k in range(4):                                     # проёмы звона по сторонам света
        a = math.radians(90 * k)
        dr = Vector((math.cos(a), math.sin(a)))
        Fk = Frame(Vector((c.x, c.y)) + dr * (Ra - 0.01), Vector((-dr.y, dr.x)), dr)
        blind_win(Fk, 0, 6.35, 1.0, 1.55, 0)
        face('metal', [Fk.p(-0.45, 0.02, 6.9), Fk.p(0.45, 0.02, 6.9), Fk.p(0.45, 0.02, 7.0), Fk.p(-0.45, 0.02, 7.0)], Fk.N())
    # разрез узкой стороны: узкие окна на диагональных гранях
    for k in range(4):
        a = math.radians(45 + 90 * k)
        dr = Vector((math.cos(a), math.sin(a)))
        Fk = Frame(Vector((c.x, c.y)) + dr * (Ra - 0.01), Vector((-dr.y, dr.x)), dr)
        box('trim', Fk, -0.55, 0.55, 0, 0.06, 7.9, 8.1)
    # выпуск карниза: круглый, с закруглённым профилем
    lathe('trim', c, [(Rc - 0.05, 8.6), (Rc + 0.25, 8.66), (Rc + 0.55, 8.76), (Rc + 0.66, 8.88), (Rc + 0.62, 8.99), (Rc + 0.4, 9.07), (Rc - 0.1, 9.12)], 28, cap=False)
    # шатёр
    lathe_ph('roof', c, [(Rc + 0.1, 9.12), (0.42, 15.2)], 8, ph, cap=True)
    lathe('roof', c, [(0.4, 15.1), (0.4, 15.45), (0.46, 15.5)], 10, cap=False)
    zt = onion(c, 15.5)
    cross(Vector((c.x, c.y, zt)), 1.9)
    # основание барабана — белый цоколь над кровлей
    lathe_ph('trim', c, [(Rc + 0.15, RZ - 0.4), (Rc + 0.15, RZ + 0.35), (Rc + 0.05, RZ + 0.42)], 8, ph, cap=False)

build_body()
build_rotunda()
build_tower()

finish('vseh_svyatyh', __file__, 25000)
