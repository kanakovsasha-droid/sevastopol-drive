# Кадры модели для проверки глазами:
#   blender -b models/hospital/hospital.blend --python models/hospital/render.py -- <кадр> [W H сэмплы]
# Кадры: front (как с панорамы на площади), portico, south, tower, air, plan
import bpy, sys, os, math
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
A = sys.argv[sys.argv.index('--') + 1:]
shot = A[0]
Wd, Hd, S = (int(A[1]), int(A[2]), int(A[3])) if len(A) > 3 else (1600, 1000, 48)

X0, Z0 = -761.3, 1638.7
def W(x, z, h): return Vector((x - X0, -(z - Z0), h))

SHOTS = {   # камера, цель, фокусное
    'front':   (W(-785.0, 1627.6, 2.4), W(-757.0, 1640.5, 7.5), 20),
    'portico': (W(-776.5, 1631.0, 2.0), W(-760.0, 1638.2, 9.0), 24),
    'cap':     (W(-770.0, 1634.5, 9.0), W(-761.5, 1638.0, 11.6), 50),
    'south':   (W(-800.0, 1648.0, 2.4), W(-775.0, 1657.0, 6.0), 20),
    'tower':   (W(-712.0, 1590.0, 2.4), W(-707.0, 1616.0, 13.0), 20),
    'air':     (W(-830.0, 1600.0, 55.0), W(-745.0, 1645.0, 5.0), 32),
    'plan':    (W(-745.0, 1647.0, 170.0), W(-745.0, 1646.9, 0.0), 50),
}
cam_p, cam_t, lens = SHOTS[shot]

sc = bpy.context.scene
cd = bpy.data.cameras.new('cam'); cd.lens = lens; cd.clip_end = 2000
cam = bpy.data.objects.new('cam', cd); sc.collection.objects.link(cam)
cam.location = cam_p
cam.rotation_euler = (cam_t - cam_p).to_track_quat('-Z', 'Y').to_euler()
sc.camera = cam

sd = bpy.data.lights.new('sun', 'SUN'); sd.energy = 4.0; sd.angle = math.radians(1.5)
sun = bpy.data.objects.new('sun', sd); sc.collection.objects.link(sun)
# солнце с юго-запада, как на панораме: фасад портика освещён
sun.rotation_euler = (Vector((0.55, -0.35, -0.75))).to_track_quat('-Z', 'Y').to_euler()

w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
bg = w.node_tree.nodes['Background']
bg.inputs[0].default_value = (0.42, 0.62, 1.0, 1); bg.inputs[1].default_value = 1.1

bpy.ops.mesh.primitive_plane_add(size=600, location=(20, -10, 0))
g = bpy.context.object
gm = bpy.data.materials.new('ground'); gm.use_nodes = True
gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.19, 0.19, 0.19, 1)
g.data.materials.append(gm)

sc.render.engine = 'CYCLES'
sc.cycles.samples = S
sc.cycles.use_denoising = True
try:
    sc.cycles.device = 'GPU'
    pr = bpy.context.preferences.addons['cycles'].preferences
    pr.compute_device_type = 'METAL'; pr.get_devices()
    for d in pr.devices: d.use = True
except Exception as e:
    print('GPU нет:', e)
sc.render.resolution_x, sc.render.resolution_y = Wd, Hd
sc.view_settings.view_transform = 'Standard'
out = os.path.join(HERE, 'out', shot + '.png')
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
print('КАДР:', out)
