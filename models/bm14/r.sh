#!/bin/bash
# Кадр модели: ./r.sh <имя> camX,camZ,h lookX,lookZ,h [фокусное]
# Без бинарника blender — через модуль bpy (python3 -m pip install bpy).
cd "$(dirname "$0")"
if command -v blender >/dev/null; then
  blender -b bm14.blend --python ../render.py -- out/$1.png $2 $3 ${4:-24} 1200 750 16 2>&1 | grep -E "КАДР|Error"
else
  /usr/bin/python3 -c "import bpy,sys; bpy.ops.wm.open_mainfile(filepath='bm14.blend'); sys.argv=['x','--','out/$1.png','$2','$3','${4:-24}','1200','750','16']; exec(open('../render.py').read())" 2>&1 | grep -E "КАДР|Error"
fi
