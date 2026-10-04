# АЗС одной сети: навес с фризом и светильниками, опоры в облицовке, островки
# с ТРК (табло, пистолеты, шланги), отбойники, стела-ценник, павильон-магазин.
# Надстройка над models/kit.py (kit.py не правится). Скрипт сети:
#     import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
#     from azs_kit import build
#     build('azs_atan', __file__, BRAND)           # BRAND — словарь цветов и вида сети
#
# Модель не привязана к месту: её ставит web/js/fuel.js по контуру АЗС из OSM.
# Локальные оси Blender: X — вдоль навеса (длинная сторона), −Y — к дороге
# (туда смотрят стела и витрина), Z вверх; ноль — земля в середине навеса.
# glTF переводит их в оси игры: +X → +x, −Y → +z.
#
# Имена материалов — это имена мешей в GLB, по ним fuel.js находит части:
#   lamp            — светильники под навесом (ночью светятся, uNight)
#   stela_led       — цифры цен на стеле (светятся всегда, ночью ярче)
#   brand, logo_txt — фриз и надписи (ночью подсветка короба)
#   shop_*          — павильон: прячется, если на его месте стоит дом из OSM
#   shop_glass      — витрина (ночью свет изнутри)
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import *
import kit
import bpy

FONT = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'

# ------------------------------------------------------------------ размеры
CL, CD = 16.6, 10.6        # навес: длина (X) и глубина (Y)
CZ0, CZ1 = 5.0, 5.9        # низ и верх фриза — навес 0,9 м толщиной
ISL_Y = 2.7                # островки — вдоль навеса на Y = ±ISL_Y
ISL_L, ISL_W = 11.0, 1.3   # длина и ширина островка
COL_X = 4.6                # опоры стоят на островках, по X = ±COL_X
TRK_X = 1.7                # ТРК на островке, по X = ±TRK_X
SHOP = (-5.8, 5.8, 8.8, 15.0, 3.6)   # павильон: X0, X1, Y0, Y1, высота
STELA = (11.4, -7.6)       # стела у въезда со стороны дороги

F0 = Frame(Vector((0, 0)), Vector((1, 0)), Vector((0, 1)))   # u = X, d = Y


def text(m, s, at, right, normal, size, depth=0.04, align='CENTER'):
    """Надпись шрифтом в геометрию: at — середина строки (Vector 3), right —
    направление чтения, normal — куда смотрит лицо надписи."""
    if not s:
        return
    cu = bpy.data.curves.new('t', 'FONT')
    cu.body = s
    try:
        cu.font = bpy.data.fonts.load(FONT, check_existing=True)
    except Exception:
        pass
    cu.size = size
    cu.extrude = depth / 2
    cu.resolution_u = 2
    cu.align_x = align
    cu.align_y = 'CENTER'
    ob = bpy.data.objects.new('t', cu)
    bpy.context.scene.collection.objects.link(ob)
    dg = bpy.context.evaluated_depsgraph_get()
    me = ob.evaluated_get(dg).to_mesh()
    right = right.normalized(); normal = normal.normalized(); up = Vector((0, 0, 1))
    bm = kit.bm_of(m)
    vs = [bm.verts.new(at + right * v.co.x + up * v.co.y + normal * (v.co.z + depth / 2)) for v in me.vertices]
    for p in me.polygons:
        try:
            bm.faces.new([vs[i] for i in p.vertices])
        except ValueError:
            pass
    ob.evaluated_get(dg).to_mesh_clear()
    bpy.data.objects.remove(ob)
    bpy.data.curves.remove(cu)


def disk_y(m, cx, y0, y1, cz, r, seg=24):
    """Диск лицом по ±Y (логотип-кружок)."""
    poly = [(cx + r * math.cos(2 * math.pi * k / seg), cz + r * math.sin(2 * math.pi * k / seg)) for k in range(seg)]
    prism_uz(m, F0, poly, y0, y1)


def rrect(u0, u1, z0, z1, r, seg=5, top_only=False):
    """Скруглённый прямоугольник в плоскости (u, z)."""
    pts = []
    cs = [(u1 - r, z1 - r, 0), (u0 + r, z1 - r, 90), (u0 + r, z0 + r, 180), (u1 - r, z0 + r, 270)]
    for i, (cx, cz, a0) in enumerate(cs):
        if top_only and i >= 2:
            pts.append((u0, z0) if i == 2 else (u1, z0))
            continue
        for k in range(seg + 1):
            a = math.radians(a0 + 90 * k / seg)
            pts.append((cx + r * math.cos(a), cz + r * math.sin(a)))
    return pts


# Цвета по умолчанию (sRGB, шероховатость) — нейтральная АЗС; сеть
# переопределяет свои в B['col'].
BASE = {
    'canopy': ((0.80, 0.80, 0.78), 0.8),  'soffit': ((0.92, 0.92, 0.90), 0.7),
    'lamp': ((0.96, 0.96, 0.93), 0.3),    'brand': ((0.42, 0.45, 0.48), 0.6),
    'brand2': ((0.30, 0.32, 0.35), 0.6),  'logo_txt': ((0.97, 0.97, 0.96), 0.5),
    'logo_a': ((0.97, 0.97, 0.96), 0.5),  'logo_b': ((0.30, 0.32, 0.35), 0.5),
    'clad': ((0.90, 0.90, 0.88), 0.5),    'clad2': ((0.90, 0.90, 0.88), 0.5),
    'concrete': ((0.70, 0.69, 0.66), 0.9), 'curb': ((0.55, 0.55, 0.53), 0.9),
    'guard': ((0.95, 0.78, 0.10), 0.5),   'guard_s': ((0.10, 0.10, 0.10), 0.5),
    'pump': ((0.80, 0.82, 0.84), 0.4),    'pump2': ((0.42, 0.45, 0.48), 0.5),
    'screen': ((0.05, 0.06, 0.07), 0.2),  'nozzle': ((0.12, 0.12, 0.13), 0.5),
    'metal': ((0.16, 0.17, 0.18), 0.5),
    'stela': ((0.55, 0.57, 0.60), 0.6),   'stela2': ((0.42, 0.45, 0.48), 0.6),
    'stela_panel': ((0.05, 0.06, 0.07), 0.3), 'stela_led': ((0.95, 0.95, 0.92), 0.4),
    'stela_lab': ((0.95, 0.95, 0.92), 0.5), 'stela_txt': ((0.97, 0.97, 0.96), 0.5),
    'stela_txt2': ((0.97, 0.97, 0.96), 0.5),
    'shop_wall': ((0.92, 0.92, 0.90), 0.8), 'shop_glass': ((0.10, 0.14, 0.18), 0.1),
    'shop_band': ((0.42, 0.45, 0.48), 0.6), 'shop_txt': ((0.97, 0.97, 0.96), 0.5),
}


def build(name, script, B):
    COL.clear()
    COL.update(BASE)
    for k, v in B['col'].items():
        COL[k] = v
    # дальний уровень — массы: навес, фриз, опоры, павильон, стела
    kit.LOD_KEEP.clear()
    kit.LOD_KEEP.update({'canopy', 'soffit', 'brand', 'clad', 'shop_wall', 'shop_band', 'shop_glass', 'stela', 'stela2'})

    hl, hd = CL / 2, CD / 2
    # ---------------------------------------------------------- навес
    # плита: верх — кровля навеса, низ — подшивка (светлая, на ней светильники)
    box('canopy', F0, -hl + 0.05, hl - 0.05, -hd + 0.05, hd - 0.05, CZ1 - 0.12, CZ1 - 0.02)
    face('soffit', [F0.p(-hl + 0.05, -hd + 0.05, CZ0 + 0.02), F0.p(hl - 0.05, -hd + 0.05, CZ0 + 0.02),
                    F0.p(hl - 0.05, hd - 0.05, CZ0 + 0.02), F0.p(-hl + 0.05, hd - 0.05, CZ0 + 0.02)], -UP)
    # фриз — короб по периметру; полоса-кромка (если есть у сети) — снизу
    sz = B.get('stripe')               # (низ, верх) полосы от низа фриза, м
    z_br0 = CZ0 + (sz[1] if sz else 0)
    t = 0.12
    for (u0, u1, d0, d1) in ((-hl, hl, -hd, -hd + t), (-hl, hl, hd - t, hd), (-hl, -hl + t, -hd, hd), (hl - t, hl, -hd, hd)):
        box('brand', F0, u0, u1, d0, d1, z_br0, CZ1)
        if sz:
            box('brand2', F0, u0, u1, d0, d1, CZ0 + sz[0], CZ0 + sz[1])
    if B.get('rim'):                   # светлая кромка поверх фриза (СНП)
        for (u0, u1, d0, d1) in ((-hl, hl, -hd - 0.02, -hd + t), (-hl, hl, hd - t, hd + 0.02)):
            box('brand2', F0, u0, u1, d0, d1, CZ0 + B['rim'][0], CZ0 + B['rim'][1])
    # светильники в подшивке: 4 × 3 плоских панели
    for i in range(4):
        for j in range(3):
            x = (-hl + 2.0) + i * (CL - 4.0) / 3
            y = -hd + 2.2 + j * (CD - 4.4) / 2
            box('lamp', F0, x - 0.55, x + 0.55, y - 0.32, y + 0.32, CZ0 - 0.05, CZ0 + 0.02)
            box('metal', F0, x - 0.62, x + 0.62, y - 0.39, y + 0.39, CZ0 - 0.02, CZ0 + 0.015, bottom=False)
    # надписи сети на фризе — по обеим длинным сторонам
    zt = (z_br0 + CZ1) / 2
    for side in (-1, 1):
        nrm = Vector((0, side, 0))
        right = Vector((-side * 1, 0, 0)) * -1 if side < 0 else Vector((-1, 0, 0))
        # читатель снаружи: при взгляде на сторону −Y вправо — +X, на +Y — −X
        right = Vector((1, 0, 0)) if side < 0 else Vector((-1, 0, 0))
        y = side * (hd + 0.001)
        for k, (s, du) in enumerate(B['fascia_text']):
            at = Vector((du * (1 if side < 0 else -1), y, zt))
            text('logo_txt', s, at, right, nrm, B.get('fascia_size', 0.62), 0.05)
        if B.get('fascia_logo'):
            lx, r, ca, cb = B['fascia_logo']
            ux = lx * (1 if side < 0 else -1)
            y0, y1 = (y, y - 0.06) if side < 0 else (y, y + 0.06)
            disk_y('logo_a', ux, y0, y1, zt, r)
            disk_y('logo_b', ux, y1, y1 + (-0.02 if side < 0 else 0.02), zt, r * 0.62)
    # навершие АТАН — жёлтая арка над навесом поперёк него
    if B.get('arch'):
        ax, R, w = B['arch']
        n = 14
        pts_o = [(R * math.cos(math.pi * k / n), CZ1 + R * math.sin(math.pi * k / n)) for k in range(n + 1)]
        Ri = R - 0.55
        pts_i = [(Ri * math.cos(math.pi * k / n), CZ1 + Ri * math.sin(math.pi * k / n)) for k in range(n, -1, -1)]
        FA = Frame(Vector((ax, 0)), Vector((0, 1)), Vector((1, 0)))   # дуга в плоскости Y-Z
        prism_uz('brand', FA, pts_o + pts_i, -w / 2, w / 2)

    # ---------------------------------------------------------- островки, опоры, ТРК
    for sy in (-1, 1):
        yc = sy * ISL_Y
        # бетонный островок с бордюром
        box('concrete', F0, -ISL_L / 2, ISL_L / 2, yc - ISL_W / 2, yc + ISL_W / 2, -0.5, 0.20)
        box('curb', F0, -ISL_L / 2 - 0.08, ISL_L / 2 + 0.08, yc - ISL_W / 2 - 0.08, yc + ISL_W / 2 + 0.08, 0, 0.12, bottom=False)
        # скругление торцов островка — полукруглые носы
        for sx in (-1, 1):
            n = 8
            poly = [(sx * ISL_L / 2 + sx * (ISL_W / 2) * math.sin(math.pi * k / n),
                     yc - (ISL_W / 2) * math.cos(math.pi * k / n)) for k in range(n + 1)]
            prism_plan('concrete', F0, poly, 0, 0.20)
        # опоры в облицовке на концах островка
        for sx in (-1, 1):
            x = sx * COL_X
            box('clad', F0, x - 0.32, x + 0.32, yc - 0.32, yc + 0.32, 0.20, CZ0, bottom=False)
            if B.get('clad_band'):
                b0, b1 = B['clad_band']
                box('clad2', F0, x - 0.34, x + 0.34, yc - 0.34, yc + 0.34, b0, b1, bottom=False)
            box('metal', F0, x - 0.36, x + 0.36, yc - 0.36, yc + 0.36, 0.20, 0.28, bottom=False)
        # отбойники — П-образные трубы у торцов
        for sx in (-1, 1):
            x = sx * (ISL_L / 2 + 0.35)
            for dy in (-0.45, 0.45):
                beam('guard', Vector((x, yc + dy, 0.2)), Vector((x, yc + dy, 0.95)), 0.11)
            beam('guard', Vector((x, yc - 0.5, 0.95)), Vector((x, yc + 0.5, 0.95)), 0.11)
            beam('guard_s', Vector((x, yc - 0.45, 0.45)), Vector((x, yc + 0.45, 0.45)), 0.115, 0.12)
        # ТРК
        for sx in (-1, 1):
            x = sx * TRK_X
            box('pump2', F0, x - 0.55, x + 0.55, yc - 0.32, yc + 0.32, 0.20, 0.55)                # цоколь
            box('pump', F0, x - 0.48, x + 0.48, yc - 0.26, yc + 0.26, 0.55, 1.85, bottom=False)   # корпус
            box('pump', F0, x - 0.55, x + 0.55, yc - 0.30, yc + 0.30, 1.85, 2.45)                  # голова
            box('pump2', F0, x - 0.56, x + 0.56, yc - 0.31, yc + 0.31, 2.45, 2.62)                 # полоса сети
            for s2 in (-1, 1):
                ys = yc + s2 * 0.30
                # табло: сумма, литры, цена
                box('screen', F0, x - 0.36, x + 0.36, ys, ys + s2 * 0.02, 1.95, 2.35, bottom=False)
                box('stela_led', F0, x - 0.30, x + 0.30, ys + s2 * 0.02, ys + s2 * 0.025, 2.20, 2.30, bottom=False)
                box('stela_led', F0, x - 0.30, x + 0.10, ys + s2 * 0.02, ys + s2 * 0.025, 2.03, 2.11, bottom=False)
                # пистолеты в гнёздах корпуса и шланги
                for gx in (-0.28, 0.0, 0.28):
                    gy = yc + s2 * 0.27
                    box('metal', F0, x + gx - 0.06, x + gx + 0.06, gy, gy + s2 * 0.10, 1.25, 1.55)
                    box('nozzle', F0, x + gx - 0.035, x + gx + 0.035, gy + s2 * 0.10, gy + s2 * 0.22, 1.30, 1.38)
                for gx in (-0.28, 0.28):
                    p0 = Vector((x + gx, yc + s2 * 0.30, 1.85))
                    p1 = Vector((x + gx * 1.6, yc + s2 * 0.62, 1.05))
                    p2 = Vector((x + gx, yc + s2 * 0.40, 0.60))
                    beam('metal', p0, p1, 0.045); beam('metal', p1, p2, 0.045)
            # колонка сверху: колпак
            box('pump', F0, x - 0.05, x + 0.05, yc - 0.05, yc + 0.05, 2.62, 2.75, bottom=False)

    # ---------------------------------------------------------- павильон-магазин
    x0, x1, y0, y1, h = SHOP
    box('shop_wall', F0, x0, x1, y0, y1, -3.0, h)          # стены — под землю: участки со склоном
    # витрина и дверь — на стороне к навесу (−Y)
    gy = y0 - 0.02
    face('shop_glass', [F0.p(x0 + 0.6, gy, 0.25), F0.p(x1 - 0.6, gy, 0.25), F0.p(x1 - 0.6, gy, 2.75), F0.p(x0 + 0.6, gy, 2.75)], -F0.N())
    for k in range(7):
        u = x0 + 0.6 + k * (x1 - x0 - 1.2) / 6
        box('metal', F0, u - 0.05, u + 0.05, gy - 0.06, gy, 0.25, 2.75, bottom=False)
    box('metal', F0, x0 + 0.6, x1 - 0.6, gy - 0.06, gy, 2.70, 2.80, bottom=False)
    box('metal', F0, x0 + 0.6, x1 - 0.6, gy - 0.06, gy, 0.20, 0.30, bottom=False)
    # козырёк-фриз в цвет сети с надписью
    box('shop_band', F0, x0 - 0.15, x1 + 0.15, y0 - 0.25, y1 + 0.15, h - 0.05, h + 0.75)
    if B.get('shop_stripe'):
        box('brand2', F0, x0 - 0.16, x1 + 0.16, y0 - 0.26, y0 - 0.20, h - 0.05, h + 0.08, bottom=False)
    text('shop_txt', B['shop_text'] if 'shop_text' in B else B['fascia_text'][0][0], Vector(((x0 + x1) / 2, y0 - 0.26, h + 0.35)),
         Vector((1, 0, 0)), Vector((0, -1, 0)), 0.5, 0.04)
    box('shop_wall', F0, x0 + 0.4, x1 - 0.4, y0 + 0.4, y1 - 0.4, h + 0.75, h + 0.95)          # парапет-вентиляция
    face('shop_glass', [F0.p(x0 - 0.02, y0 + 1.0, 0.9), F0.p(x0 - 0.02, y1 - 1.0, 0.9),
                        F0.p(x0 - 0.02, y1 - 1.0, 2.4), F0.p(x0 - 0.02, y0 + 1.0, 2.4)], -F0.U())

    # ---------------------------------------------------------- стела-ценник
    sx, sy = STELA
    S = B['stela']
    H, Wd, Dp = S['h'], S['w'], 0.45
    FS = Frame(Vector((sx, sy)), Vector((1, 0)), Vector((0, -1)))   # лицо к дороге (−Y)
    box('concrete', FS, -Wd / 2 - 0.35, Wd / 2 + 0.35, -Dp / 2 - 0.35, Dp / 2 + 0.35, -2.0, 0.25)
    prism_uz('stela', FS, rrect(-Wd / 2, Wd / 2, 0.25, H, S.get('r', 0.05), 5, top_only=True), -Dp / 2, Dp / 2)
    # верхний короб с логотипом
    top0 = H - S['top_h']
    box('stela2', FS, -Wd / 2 - 0.04, Wd / 2 + 0.04, -Dp / 2 - 0.04, Dp / 2 + 0.04, top0, H - S.get('top_gap', 0.0))
    for side in (1, -1):
        d = side * (Dp / 2 + 0.05)
        nrm = FS.N() * side
        right = FS.U() * side
        cz = top0 + S['top_h'] * S.get('logo_at', 0.6)
        if S.get('logo'):
            r, ca, cb = S['logo']
            disk = [(r * math.cos(2 * math.pi * k / 24), cz + r * math.sin(2 * math.pi * k / 24)) for k in range(24)]
            prism_uz('logo_a', FS, disk, d - side * 0.02, d + side * 0.03)
            tri = [(0, cz + r * 0.62), (-r * 0.58, cz - r * 0.42), (r * 0.58, cz - r * 0.42)]
            if S.get('logo_tri'):
                prism_uz('logo_b', FS, tri, d + side * 0.03, d + side * 0.05)
            else:
                disk2 = [(r * 0.6 * math.cos(2 * math.pi * k / 24), cz + r * 0.6 * math.sin(2 * math.pi * k / 24)) for k in range(24)]
                prism_uz('logo_b', FS, disk2, d + side * 0.03, d + side * 0.05)
        if S.get('top_text'):
            p = FS.p(0, d + side * 0.01, top0 + S['top_h'] * 0.17)
            text('stela_txt', S['top_text'], Vector((p.x, p.y, p.z)), right, nrm, S.get('top_text_size', 0.34), 0.03)
        # строки цен: вид топлива слева, цифры справа на тёмном табло
        z = top0 - 0.25
        for lab, price in S['rows']:
            rh = S.get('row_h', 0.62)
            zc = z - rh / 2
            pp = FS.p(0, d, zc)
            box('stela_panel', FS, -Wd / 2 + 0.12, Wd / 2 - 0.12, d - side * 0.01, d + side * 0.02, zc - rh * 0.42, zc + rh * 0.42, bottom=False)
            pl = FS.p(-Wd / 2 + 0.2, d + side * 0.025, zc)
            text('stela_lab', lab, Vector((pl.x, pl.y, pl.z)) if side > 0 else Vector((FS.p(Wd / 2 - 0.2, d + side * 0.025, zc).x, FS.p(Wd / 2 - 0.2, d + side * 0.025, zc).y, zc)),
                 right, nrm, rh * 0.42, 0.02, align='LEFT')
            pr = FS.p(Wd / 2 - 0.2, d + side * 0.025, zc) if side > 0 else FS.p(-Wd / 2 + 0.2, d + side * 0.025, zc)
            text('stela_led', price, Vector((pr.x, pr.y, zc)), right, nrm, rh * 0.62, 0.02, align='RIGHT')
            z -= rh + 0.08
        if S.get('foot_text'):
            p = FS.p(0, d + side * 0.01, S['foot_z'])
            text('stela_txt2', S['foot_text'], Vector((p.x, p.y, p.z)), right, nrm, S.get('foot_size', 0.5), 0.03)

    finish(name, script, tri_budget=25000)
