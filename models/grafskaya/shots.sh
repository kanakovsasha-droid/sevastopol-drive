#!/bin/bash
# Кадры для проверки (EEVEE, quick.py). Камера/цель — мировые x,z,высота (высота от пола колоннады).
cd "$(dirname "$0")/../.."
R="blender -b models/grafskaya/grafskaya.blend --python models/grafskaya/quick.py --"
O=models/grafskaya/out
$R $O/front.png     120,-36,-2.4   83,-47,3.0    22 1200 760 1 &
$R $O/corner.png    100,-18,2.5    84,-52,2.0    24 1200 760 1 &
$R $O/top.png       112,-60,34     90,-45,-1.0   30 1200 760 1 &
$R $O/lion.png      107,-12,-1.2   100,-30,-2.8   35 1200 760 1 &
$R $O/square.png    52,-44,-2.0    80,-46,3.0    24 1200 760 1 &
$R $O/detail.png    92,-44,1.5     83,-47,3.6    35 1200 760 1 &
$R $O/lion2.png     110,-21,-1.2   102,-26.3,-2.3 40 1200 760 1 &
wait
