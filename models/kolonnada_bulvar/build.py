# Колоннада-фонтанчик Приморского бульвара: четырёхколонный дорический павильон над питьевой чашей.
#
#   blender -b --python models/kolonnada_bulvar/build.py -- [glb]
#
# ВАЖНО: ротонда А. М. Вейзена 1905 г. (10 дорических колонн, полукруг) стоит не на Приморском бульваре, а в сквере 1-го
# бастиона/Ленинского комсомола (источник — sevas.com, rutraveller); её фото и точного места у нас нет. Здесь — то, что
# на самом деле видно на Викискладе в категории Приморского бульвара (refs/ko_1, ko_2): белый дорический
# тетрастиль на известняковом цоколе с чашей-фонтанчиком внутри. Ноль высоты — плитка у цоколя.
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'mon_common'))
from mon import *

X0, Z0 = -66.0, -46.0         # ПРИБЛИЗИТЕЛЬНО: у входа с пр. Нахимова; точное место не промерено
origin(X0, Z0)
FACING = 0

COL['stone'] = ((0.78, 0.72, 0.55), 0.95)       # известняк цоколя
COL['trim'] = ((0.93, 0.93, 0.90), 0.85)        # белая штукатурка колонн и антаблемента
COL['wall'] = ((0.90, 0.89, 0.85), 0.85)        # аттик
COL['glass'] = ((0.55, 0.72, 0.80), 0.08)       # вода в чаше

CS = 1.75            # половина расстояния между осями колонн
ZB = 1.35            # верх цоколя
HC = 4.2             # высота ствола
ZT = ZB + HC         # низ капители... верх ствола

def build_base():
    slab('stone', -2.35, 2.35, -2.35, 2.35, -0.6, 0.0)
    z = 0.0
    for i, (h, ex) in enumerate(((0.45, 0.0), (0.45, 0.04), (0.45, 0.0))):
        slab('stone', -2.15 - ex, 2.15 + ex, -2.15 - ex, 2.15 + ex, z, z + h)
        z += h
    slab('stone', -2.28, 2.28, -2.28, 2.28, z, z + 0.15)        # плита-пол
    return z + 0.15

def column(x, y, z0):
    secs = []
    n = 8
    for i in range(n + 1):
        t = i / n
        r = 0.47 - 0.11 * t + 0.015 * math.sin(math.pi * t)        # энтазис
        secs.append((x, y, z0 + HC * t, r, r, 0.0, 0.025, 20))      # 20 каннелюр
    loft('trim_s', secs, 40, cap0=True, cap1=True)
    # капитель: эхин и абака
    lathe('trim_s', V(x, y, 0), [(0.36, z0 + HC), (0.38, z0 + HC + 0.03), (0.47, z0 + HC + 0.14), (0.50, z0 + HC + 0.22)], 20, cap=False)
    slab('trim', x - 0.56, x + 0.56, y - 0.56, y + 0.56, z0 + HC + 0.22, z0 + HC + 0.46)

def build_columns(z0):
    for sx in (-1, 1):
        for sy in (-1, 1):
            column(sx * CS, sy * CS, z0)

def build_entablement(z0):
    z = z0 + HC + 0.46
    W = CS + 0.62
    # архитрав
    slab('trim', -W, W, -W, W, z, z + 0.6)
    # фриз с триглифами
    slab('trim', -W - 0.04, W + 0.04, -W - 0.04, W + 0.04, z + 0.6, z + 1.2)
    n = 8
    for side in range(4):
        a = side * math.pi / 2
        F = Frame(Vector((0, 0)), Vector((math.cos(a), math.sin(a))), Vector((-math.sin(a), math.cos(a))))
        for i in range(n):
            u = -W + (2 * W) * (i + 0.5) / n
            box('trim', F, u - 0.12, u + 0.12, W + 0.04, W + 0.12, z + 0.64, z + 1.16)       # триглифы
    # зубчики-мутулы под карнизом и сам карниз
    for side in range(4):
        a = side * math.pi / 2
        F = Frame(Vector((0, 0)), Vector((math.cos(a), math.sin(a))), Vector((-math.sin(a), math.cos(a))))
        for i in range(10):
            u = -W - 0.2 + (2 * W + 0.4) * (i + 0.5) / 10
            box('trim', F, u - 0.14, u + 0.14, W + 0.04, W + 0.45, z + 1.2, z + 1.34)
    slab('trim', -W - 0.5, W + 0.5, -W - 0.5, W + 0.5, z + 1.34, z + 1.62)
    slab('trim', -W - 0.25, W + 0.25, -W - 0.25, W + 0.25, z + 1.62, z + 1.78)
    # аттик
    slab('wall', -W + 0.2, W - 0.2, -W + 0.2, W - 0.2, z + 1.78, z + 2.6)
    slab('trim', -W + 0.05, W - 0.05, -W + 0.05, W - 0.05, z + 2.6, z + 2.74)
    # потолок под карнизом
    slab('trim', -W + 0.05, W - 0.05, -W + 0.05, W - 0.05, z - 0.12, z)

def build_bowl(zf):
    lathe('stone_s' if False else 'stone', V(0, 0, 0), [(0.3, zf), (0.3, zf + 0.5), (0.2, zf + 0.62), (0.28, zf + 0.7)], 14, cap=False)
    lathe('trim_s', V(0, 0, 0), [(0.28, zf + 0.7), (0.65, zf + 0.78), (0.95, zf + 0.98), (0.98, zf + 1.1), (0.9, zf + 1.1), (0.6, zf + 0.92), (0.0, zf + 0.9)], 28, cap=False)
    lathe('glass', V(0, 0, 0), [(0.85, zf + 1.0), (0.01, zf + 1.0)], 24, cap=False)
    for k in range(8):
        a = 2 * math.pi * k / 8
        limb('trim', V(0.06 * math.cos(a), 0.06 * math.sin(a), zf + 1.0), V(0.4 * math.cos(a), 0.4 * math.sin(a), zf + 1.5), 0.02, 0.012, 4)

def build_urn(x, y):
    lathe('trim_s', V(x, y, 0), [(0.35, -0.0), (0.35, 0.12), (0.26, 0.25), (0.32, 0.9), (0.4, 1.0)], 8, cap=True)
    lathe('trim_s', V(x, y, 0), [(0.2, 1.0), (0.34, 1.12), (0.42, 1.45), (0.36, 1.48), (0.16, 1.4), (0.0, 1.38)], 12, cap=False)

def build():
    zf = build_base()
    build_columns(zf)
    build_entablement(zf)
    build_bowl(zf)
    build_urn(3.2, -1.2)
    build_urn(-3.2, 1.2)

build()
finish('kolonnada_bulvar', __file__, 10000)
