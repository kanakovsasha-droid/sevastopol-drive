# Mercedes-AMG E 63 S (W213) — подготовка скачанной модели под игру.
#   blender -b --python models/e63/prep.py
# Исходник: sketchfab.com/3d-models/mercedes-amg-e-63-s-w213-f61d8efb0b9b4c499fc66fcf35a4d09c
# автор Mona x Supercars, лицензия CC BY 4.0 (в репозиторий не кладём, src/ в .gitignore).
#
# Что делает: метры вместо условных единиц, нос — в сторону +Z игры, ноль —
# на земле посередине между осями; четыре колеса — отдельные узлы с началом в
# центре колеса (wheel_FL/FR/RL/RR), остальное — кузов, склеенный по материалам.
# Сетка — как в исходнике, без прореживания (177 тыс. треугольников): прореженная
# в 0.42 давала грани на капоте и крыльях и рваные кромки бамперов. Картинки — в
# родном разрешении (у автора до 1024), потолок 2048; WebP с качеством 90.
import bpy, os, math
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'src', 'mercedes-amg_e_63_s_w213.glb')
OUT = os.path.normpath(os.path.join(HERE, '..', '..', 'data', 'models', 'e63.glb'))
WHEELBASE = 2.939            # м, паспорт W213
MAX_TEX = 2048               # потолок для картинок; у исходника они до 1024, не трогаются

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
# всё в мировые координаты, иерархию исходника — долой
for o in meshes:
    mw = o.matrix_world.copy()
    o.parent = None
    o.matrix_world = mw
bpy.ops.object.select_all(action='DESELECT')
for o in meshes: o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in list(bpy.data.objects):
    if o.type != 'MESH': bpy.data.objects.remove(o)

def bbox(o):
    vs = [Vector(c) for c in o.bound_box]
    return Vector([min(v[i] for v in vs) for i in range(3)]), Vector([max(v[i] for v in vs) for i in range(3)])

# шины: четыре одинаковых «бублика» материала Black с круглым габаритом в YZ
tires = []
for o in meshes:
    a, b = bbox(o); d = b - a
    if abs(d.y - d.z) < 0.08 * d.y and 1.8 < d.y < 3.2 and d.x < 0.75 * d.y:
        tires.append(((a + b) / 2, d.y / 2, o))
# по одному самому большому на каждый угол
corner = {}
for c, r, o in tires:
    k = (c.x > sum(t[0].x for t in tires) / len(tires), c.y > sum(t[0].y for t in tires) / len(tires))
    if k not in corner or r > corner[k][1]: corner[k] = (c, r, o)
assert len(corner) == 4, corner
yf = max(c.y for c, r, o in corner.values()); yr = min(c.y for c, r, o in corner.values())
S = WHEELBASE / (yf - yr)
cx = sum(c.x for c, r, o in corner.values()) / 4
print('МАСШТАБ', round(S, 4), 'радиус шины, м', [round(r * S, 3) for c, r, o in corner.values()])

# детали колеса: габарит целиком внутри цилиндра шины (диски, гайки, колпачки)
wheels = {k: [] for k in corner}
body = []
for o in meshes:
    a, b = bbox(o); c = (a + b) / 2
    put = False
    for k, (wc, wr, wo) in corner.items():
        ext = max(abs(a.y - wc.y), abs(b.y - wc.y), abs(a.z - wc.z), abs(b.z - wc.z))
        centred = math.hypot(c.y - wc.y, c.z - wc.z) < 0.12 * wr
        if ext <= wr * 1.03 and centred and abs(c.x - wc.x) < wr * 0.6:
            wheels[k].append(o); put = True; break
    if not put: body.append(o)
for k, v in wheels.items(): print('КОЛЕСО', k, len(v), [o.name for o in v][:8])

def tris(objs):
    n = 0
    for o in objs:
        o.data.calc_loop_triangles(); n += len(o.data.loop_triangles)
    return n
print('ИСХОДНИК', tris(body), tris(sum(wheels.values(), [])))

def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1: bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = name
    return o

# нос исходника смотрит в +Y; игре нужен нос в +Z glTF, то есть в −Y Blender
ground = min(bbox(o)[0].z for c, r, o in corner.values())
T = Matrix.Rotation(math.pi, 4, 'Z') @ Matrix.Scale(S, 4) @ Matrix.Translation(Vector((-cx, -(yf + yr) / 2, -ground)))
out = []
b = join(body, 'body'); out.append(b)
names = {(False, True): 'wheel_FL', (True, True): 'wheel_FR', (False, False): 'wheel_RL', (True, False): 'wheel_RR'}
centers = {}
for k, v in wheels.items():
    w = join(v, 'w'); out.append(w); centers[w.name] = (corner[k][0], k)
for o in out:
    o.data.transform(T); o.data.update()
for o in out:
    if o.name == 'body': continue
    c0, k = centers[o.name]
    c = T @ c0
    # после разворота на 180° левый и правый борт поменялись местами
    left = c.x > 0
    front = c.y < 0
    o.data.transform(Matrix.Translation(-c)); o.location = c
    o.name = 'wheel_' + ('F' if front else 'R') + ('L' if left else 'R')
    print('УЗЕЛ', o.name, [round(v, 3) for v in c], 'R', round(corner[k][1] * S, 3))

for im in bpy.data.images:
    if max(im.size) > MAX_TEX:
        f = MAX_TEX / max(im.size); im.scale(max(1, int(im.size[0] * f)), max(1, int(im.size[1] * f)))
print('ПОСЛЕ', tris(out), 'объектов', len(out), 'материалов', len({s.material.name for o in out for s in o.material_slots if s.material}))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'e63.blend'))
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_apply=True, export_yup=True,
                          export_image_format='WEBP', export_image_quality=90)
print('GLB', os.path.getsize(OUT) // 1024, 'КБ')
