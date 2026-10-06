#!/bin/bash
# кадры для проверки: bash models/genpetrova1/shots.sh [имена...]   (BLENDER=… — свой blender/python с bpy)
cd "$(dirname "$0")/../.."
BL=${BLENDER:-blender}
B=models/genpetrova1/genpetrova1.blend
R=models/render.py
O=models/genpetrova1/out
r() { $BL -b $B --python $R -- $O/$1.png "$2" "$3" ${4:-24} ${5:-1200} ${6:-760} ${7:-10} >/dev/null 2>&1 && echo done $1; }
for n in ${@:-corner street top yard loggia}; do
 case $n in
  corner) r corner -440,578,1.7 -459,601,6 24 ;;
  loggia) r loggia -448,590,1.7 -458.6,600.6,4 35 ;;
  street) r street -500,612,1.7 -474,622,6 22 ;;
  top) r top -425,565,55 -468,622,5 26 ;;
  yard) r yard -448,655,8 -470,628,6 24 ;;
 esac
done
