#!/bin/bash
# Кадры для проверки (models/render.py). Камера/цель — мировые x,z,высота над нулём модели.
cd "$(dirname "$0")/../.."
R="blender -b models/morvokzal/morvokzal.blend --python models/render.py --"
O=models/morvokzal/out
S=${1:-12}
$R $O/front.png   100,106,1.7   63.7,106,5.5    24 1400 880 $S &
$R $O/corner.png  95,70,2.0     60,100,5        24 1400 880 $S &
$R $O/top.png     110,120,70    56,106,0        28 1400 880 $S &
$R $O/west.png    28,106,2.0    52,106,5.5      24 1400 880 $S &
wait
