import bpy, sys
from mathutils import Vector
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=sys.argv[-1])
tot = 0
rows = []
for o in bpy.data.objects:
    if o.type != 'MESH': continue
    o.data.calc_loop_triangles(); n = len(o.data.loop_triangles); tot += n
    bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
    mn = [min(v[i] for v in bb) for i in range(3)]; mx = [max(v[i] for v in bb) for i in range(3)]
    rows.append((n, o.name[:38], [m.name[:22] for m in o.data.materials], [round(v, 2) for v in mn], [round(v, 2) for v in mx]))
rows.sort(reverse=True)
print('OBJ', len(rows), 'TRI', tot)
for r in rows[:45]: print('ROW', *r)
print('MATS', len(bpy.data.materials), 'IMGS', [(i.name[:30], i.size[0], i.size[1]) for i in bpy.data.images])
