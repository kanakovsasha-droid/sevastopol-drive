# Кадр модели для проверки глазами. Камера и цель — в координатах МИРА игры:
#   blender -b models/<имя>/<имя>.blend --python models/render.py -- <кадр.png> camX,camZ,высота lookX,lookZ,высота [фокусное=24] [W H сэмплы]
# Вид сверху: поставить камеру над домом на высоту 150–200 и цель под ней.
import bpy, sys, os, math
from mathutils import Vector

A = sys.argv[sys.argv.index('--') + 1:]
out = os.path.abspath(A[0])
O = bpy.context.scene.get('origin', [0, 0])
def W(t):
    x, z, h = [float(v) for v in t.split(',')]
    return Vector((x - O[0], -(z - O[1]), h))
cam_p, cam_t = W(A[1]), W(A[2])
lens = float(A[3]) if len(A) > 3 else 24
Wd, Hd, S = (int(A[4]), int(A[5]), int(A[6])) if len(A) > 6 else (1400, 880, 32)

sc = bpy.context.scene
cd = bpy.data.cameras.new('cam'); cd.lens = lens; cd.clip_end = 3000
cam = bpy.data.objects.new('cam', cd); sc.collection.objects.link(cam)
cam.location = cam_p
d = cam_t - cam_p
if abs(d.x) + abs(d.y) < 1e-3: d.y += 0.01
cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
sc.camera = cam

sd = bpy.data.lights.new('sun', 'SUN'); sd.energy = 4.0; sd.angle = math.radians(1.5)
sun = bpy.data.objects.new('sun', sd); sc.collection.objects.link(sun)
# солнце светит в сторону взгляда камеры и чуть сбоку: фасад в кадре освещён
f = Vector((d.x, d.y, 0)).normalized() if abs(d.x) + abs(d.y) > 0.5 else Vector((0.6, -0.4, 0))
side = Vector((-f.y, f.x, 0))
sun.rotation_euler = (f * 0.6 + side * 0.45 + Vector((0, 0, -0.7))).to_track_quat('-Z', 'Y').to_euler()

w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
bg = w.node_tree.nodes['Background']
bg.inputs[0].default_value = (0.42, 0.62, 1.0, 1); bg.inputs[1].default_value = 1.1
bpy.ops.mesh.primitive_plane_add(size=900, location=(0, 0, 0))
gm = bpy.data.materials.new('ground'); gm.use_nodes = True
gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.19, 0.19, 0.19, 1)
bpy.context.object.data.materials.append(gm)

sc.render.engine = 'CYCLES'
sc.cycles.samples = S
sc.cycles.use_denoising = True
sc.render.resolution_x, sc.render.resolution_y = Wd, Hd
sc.view_settings.view_transform = 'Standard'
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
print('КАДР:', out)
