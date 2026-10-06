#!/bin/bash
cd "$(dirname "$0")"
blender -b mall_lavanda.blend --python ../render.py -- out/$1.png $2 $3 ${4:-24} 1200 750 16 2>&1 | grep -E "КАДР|Error"
