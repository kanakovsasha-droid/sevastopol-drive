# Mercedes-Benz E-Class (W212) — подготовка скачанной модели под игру.
#   blender -b --python models/w212/prep.py
# Исходник: sketchfab.com/3d-models/mercedes-benz-e-class-w212-9b70707fd2304f578175158564719c5d
# автор Savelliy 07, лицензия CC BY 4.0 (в репозиторий не кладём, src/ в .gitignore).
#
# То же, что models/e63/prep.py: метры по колёсной базе, нос — в +Z игры, ноль
# — на земле посередине между осями, колёса — узлы wheel_FL/FR/RL/RR с началом
# в центре колеса, остальное — кузов; сетка прорежена. Отличия исходника:
#   • это .blend, а не glb; нос смотрит в −X, вбок — Y;
#   • задние колёса (шины, диски) лежат в файле по ДВА раза в одном месте —
#     дубли выкидываем;
#   • суппорты и диски Brembo остаются на кузове — они не крутятся.
import bpy, os, math
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'src', 'source', 'Mercedes-Benz E-Class.blend')
OUT = os.path.normpath(os.path.join(HERE, '..', '..', 'data', 'models', 'w212.glb'))
WHEELBASE = 2.874            # м, паспорт W212
RATIO = 0.45                 # доля треугольников у тяжёлых деталей кузова
RATIO_WHEEL = 0.35

bpy.ops.wm.open_mainfile(filepath=SRC)

# Материалы. В исходнике у каждого два выхода, и активный подключён к
# Diffuse BSDF — экспорт glTF понимает только Principled, и всё выходило белым.
# Оставляем один Principled с цветом исходника; стекло — полупрозрачное.
# Кузов в исходнике чёрный «пустой» — красим в серебро (Brillantsilber).
PAINT = (0.56, 0.58, 0.61, 1.0)
for m in bpy.data.materials:
    if not m.use_nodes or not m.node_tree: continue
    nt = m.node_tree
    old = next((n for n in nt.nodes if n.bl_idname == 'ShaderNodeBsdfPrincipled'), None)
    glass = any(n.bl_idname == 'ShaderNodeBsdfGlass' for n in nt.nodes)
    col = tuple(old.inputs['Base Color'].default_value) if old else tuple(m.diffuse_color)
    alpha = old.inputs['Alpha'].default_value if old else 1.0
    met = old.inputs['Metallic'].default_value if old else 0.0
    rough = old.inputs['Roughness'].default_value if old else 0.5
    for n in list(nt.nodes): nt.nodes.remove(n)
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled'); outn = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(bsdf.outputs['BSDF'], outn.inputs['Surface']); outn.is_active_output = True
    name = m.name.lower()
    if m.name.startswith('Body_Color'):
        col, met, rough = PAINT, 0.6, 0.3
    elif glass or 'glass' in name or alpha < 0.99:
        col, alpha, rough = (0.75, 0.78, 0.8, 1.0), min(alpha, 0.35), 0.05
    elif 'chrome' in name or 'chr' in name:
        met, rough = 1.0, 0.15
    bsdf.inputs['Base Color'].default_value = col
    bsdf.inputs['Metallic'].default_value = met
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Alpha'].default_value = alpha
    if alpha < 0.99:
        try: m.surface_render_method = 'BLENDED'
        except AttributeError: m.blend_method = 'BLEND'
for o in list(bpy.data.objects):
    if o.type != 'MESH': continue
    mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
for o in list(bpy.data.objects):
    if o.type != 'MESH': bpy.data.objects.remove(o)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
# у деталей бывают общие сетки (дубли через инстансы) — делаем их своими
for o in meshes:
    if o.data.users > 1: o.data = o.data.copy()
bpy.ops.object.select_all(action='DESELECT')
for o in meshes: o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

def bbox(o):
    vs = [Vector(c) for c in o.bound_box]
    return Vector([min(v[i] for v in vs) for i in range(3)]), Vector([max(v[i] for v in vs) for i in range(3)])

def tris(objs):
    n = 0
    for o in objs:
        o.data.calc_loop_triangles(); n += len(o.data.loop_triangles)
    return n

# дубли: тот же габарит до сантиметра и то же число треугольников
seen, keep = set(), []
for o in meshes:
    a, b = bbox(o); o.data.calc_loop_triangles()
    key = (tuple(round(v, 2) for v in a), tuple(round(v, 2) for v in b), len(o.data.loop_triangles))
    if key in seen: bpy.data.objects.remove(o); continue
    seen.add(key); keep.append(o)
meshes = keep
print('ДУБЛЕЙ УБРАНО', len(seen) and (471 - len(meshes)))

# шины — «бублики» gum*: круглый габарит в плоскости XZ
tires = []
for o in meshes:
    a, b = bbox(o); d = b - a
    if o.name.startswith('gum') and abs(d.x - d.z) < 0.08 * d.z and d.y < 0.8 * d.z:
        tires.append(((a + b) / 2, d.z / 2, o))
corner = {}
mx_ = sum(t[0].x for t in tires) / len(tires); my_ = sum(t[0].y for t in tires) / len(tires)
for c, r, o in tires:
    k = (c.x < mx_, c.y < my_)          # (перед?, левый борт?) — нос в −X, левый борт в −Y
    if k not in corner or r > corner[k][1]: corner[k] = (c, r, o)
assert len(corner) == 4, corner
xf = sum(c.x for (f, l), (c, r, o) in corner.items() if f) / 2
xr = sum(c.x for (f, l), (c, r, o) in corner.items() if not f) / 2
S = WHEELBASE / abs(xr - xf)
S0 = S
cy = sum(c.y for c, r, o in corner.values()) / 4
print('МАСШТАБ', round(S, 4), 'радиус шины, м', [round(r * S, 3) for c, r, o in corner.values()],
      'колея, м', round(abs(corner[(True, True)][0].y - corner[(True, False)][0].y) * S, 3))

# детали колеса: габарит внутри цилиндра шины, центр на оси; Brembo — кузову
wheels = {k: [] for k in corner}
body = []
for o in meshes:
    a, b = bbox(o); c = (a + b) / 2
    put = False
    if 'Brembo' not in o.name:
        for k, (wc, wr, wo) in corner.items():
            ext = max(abs(a.x - wc.x), abs(b.x - wc.x), abs(a.z - wc.z), abs(b.z - wc.z))
            centred = math.hypot(c.x - wc.x, c.z - wc.z) < 0.12 * wr
            if ext <= wr * 1.03 and centred and abs(c.y - wc.y) < wr * 0.6:
                wheels[k].append(o); put = True; break
    if not put: body.append(o)
# задние колёса в исходнике лежат дважды со сдвигом в сантиметр — внутри
# каждого колеса выкидываем деталь, если такая же (по числу треугольников и
# габариту до 3 см) уже есть
for k, v in wheels.items():
    uniq, kept = [], []
    for o in v:
        a, b = bbox(o); o.data.calc_loop_triangles(); n = len(o.data.loop_triangles)
        if any(n == n2 and (a - a2).length < 0.03 / S0 and (b - b2).length < 0.03 / S0 for a2, b2, n2 in uniq):
            bpy.data.objects.remove(o); continue
        uniq.append((a, b, n)); kept.append(o)
    wheels[k] = kept
for k, v in wheels.items(): print('КОЛЕСО', k, len(v), [o.name for o in v][:6])
print('ДО', tris(body), tris(sum(wheels.values(), [])))

def decimate(o, ratio):
    o.data.calc_loop_triangles()
    if len(o.data.loop_triangles) < 600: return
    m = o.modifiers.new('d', 'DECIMATE'); m.ratio = ratio
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier=m.name)
for o in body: decimate(o, RATIO)
for v in wheels.values():
    for o in v: decimate(o, RATIO_WHEEL)

def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1: bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = name
    return o

# нос из −X в −Y Blender (это +Z glTF): поворот на +90° вокруг Z
ground = min(bbox(o)[0].z for c, r, o in corner.values())
T = Matrix.Rotation(math.pi / 2, 4, 'Z') @ Matrix.Scale(S, 4) @ Matrix.Translation(Vector((-(xf + xr) / 2, -cy, -ground)))
out = [join(body, 'body')]
centers = {}
for k, v in wheels.items():
    w = join(v, 'w_' + str(k)); out.append(w); centers[w.name] = (corner[k][0], k)
for o in out:
    o.data.transform(T); o.data.update()
for o in out:
    if o.name == 'body': continue
    c0, k = centers[o.name]
    c = T @ c0
    left = c.x > 0                   # +X Blender = +X glTF = левый борт игры
    front = c.y < 0                  # −Y Blender = +Z glTF = нос
    o.data.transform(Matrix.Translation(-c)); o.location = c
    o.name = 'wheel_' + ('F' if front else 'R') + ('L' if left else 'R')
    print('УЗЕЛ', o.name, [round(v, 3) for v in c], 'R', round(corner[k][1] * S, 3))

for im in bpy.data.images:
    if im.size[0] > 512 or im.size[1] > 512:
        f = 512 / max(im.size); im.scale(max(1, int(im.size[0] * f)), max(1, int(im.size[1] * f)))
print('ПОСЛЕ', tris(out), 'объектов', len(out), 'материалов', len({s.material.name for o in out for s in o.material_slots if s.material}))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'w212.blend'))
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_apply=True, export_yup=True,
                          export_image_format='WEBP', export_image_quality=80)
print('GLB', os.path.getsize(OUT) // 1024, 'КБ')
