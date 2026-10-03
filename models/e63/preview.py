# Кадр машины: blender -b --python models/e63/preview.py -- <glb> <out.png> [азимут] [высота]
import bpy, sys, math
from mathutils import Vector
A = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=A[0])
mn = Vector((1e9,) * 3); mx = Vector((-1e9,) * 3)
for o in bpy.data.objects:
    if o.type != 'MESH': continue
    for c in o.bound_box:
        v = o.matrix_world @ Vector(c)
        mn = Vector(map(min, mn, v)); mx = Vector(map(max, mx, v))
c = (mn + mx) / 2; size = (mx - mn).length
print('BBOX', [round(v, 3) for v in mn], [round(v, 3) for v in mx])
az = math.radians(float(A[2]) if len(A) > 2 else 35); el = float(A[3]) if len(A) > 3 else 0.28
sc = bpy.context.scene
cd = bpy.data.cameras.new('c'); cd.lens = 50; cam = bpy.data.objects.new('c', cd); sc.collection.objects.link(cam)
cam.location = c + Vector((math.sin(az), -math.cos(az), el)) * size * 1.15
cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler(); sc.camera = cam
sd = bpy.data.lights.new('s', 'SUN'); sd.energy = 3.5; s = bpy.data.objects.new('s', sd); sc.collection.objects.link(s)
s.rotation_euler = (0.9, 0.2, az + 0.6)
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (0.6, 0.7, 0.9, 1)
bpy.ops.mesh.primitive_plane_add(size=size * 20, location=(c.x, c.y, mn.z))
sc.render.engine = 'CYCLES'; sc.cycles.samples = 24; sc.cycles.use_denoising = True
sc.render.resolution_x, sc.render.resolution_y = 1200, 700
sc.view_settings.view_transform = 'Standard'
sc.render.filepath = A[1]; bpy.ops.render.render(write_still=True)
