# что осталось на кузове в районе колёс: колёса прячем, снимаем сбоку крупно
import bpy, sys, math
from mathutils import Vector
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=sys.argv[-2])
for o in bpy.data.objects:
    if o.name.startswith('wheel_'): o.hide_render = True
sc = bpy.context.scene
cd = bpy.data.cameras.new('c'); cd.lens = 45; cam = bpy.data.objects.new('c', cd); sc.collection.objects.link(cam)
cam.location = Vector((4.2, -1.47, 0.6)); cam.rotation_euler = (Vector((0, -1.47, 0.35)) - cam.location).to_track_quat('-Z', 'Y').to_euler(); sc.camera = cam
sd = bpy.data.lights.new('s', 'SUN'); sd.energy = 4; s = bpy.data.objects.new('s', sd); sc.collection.objects.link(s); s.rotation_euler = (0.6, 0.3, 1.2)
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (0.7, 0.75, 0.85, 1)
sc.render.engine = 'CYCLES'; sc.cycles.samples = 16; sc.render.resolution_x, sc.render.resolution_y = 900, 600
sc.render.filepath = sys.argv[-1]; bpy.ops.render.render(write_still=True)
