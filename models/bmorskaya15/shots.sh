#!/bin/bash
# кадры для проверки: bash models/bmorskaya15/shots.sh [имена...]
# BLENDER — команда блендера (по умолчанию blender; в облаке — python с модулем bpy и обёрткой)
cd "$(dirname "$0")/../.."
B=models/bmorskaya15/bmorskaya15.blend
R=models/render.py
O=models/bmorskaya15/out
r() { ${BLENDER:-blender -b $B --python $R --} $O/$1.png "$2" "$3" ${4:-24} ${5:-1200} ${6:-760} ${7:-12} >/dev/null 2>&1 && echo done $1; }
for n in ${@:-front corner top}; do
 case $n in
  front) r front -318,1050,2 -284,1036,7 24 ;;
  corner) r corner -312,1000,2 -287,1020,8 24 ;;
  top) r top -330,1090,55 -268,1030,6 26 ;;
  north) r north -268,985,4 -262,1012,9 22 ;;
  loggia) r loggia -301,1009,4 -288,1018,9 35 ;;
  yard) r yard -250,1060,30 -270,1035,6 26 ;;
 esac
done
