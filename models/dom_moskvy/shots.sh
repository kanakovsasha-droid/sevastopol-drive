#!/bin/bash
# кадры для проверки: bash models/dom_moskvy/shots.sh [быстро]
cd "$(dirname "$0")/../.."
S=${1:-24}
python3 - "$@" <<'P'
import math,subprocess,sys
S=sys.argv[1]
A0=(-20.1,-72.4);B0=(-7.2,-73.1)
L=math.hypot(B0[0]-A0[0],B0[1]-A0[1]);ux,uz=(B0[0]-A0[0])/L,(B0[1]-A0[1])/L;nx,nz=uz,-ux
LW=lambda u,v:(A0[0]+u*ux+v*nx,A0[1]+u*uz+v*nz)
def c(u,v,h):x,z=LW(u,v);return '%.1f,%.1f,%.1f'%(x,z,h)
import os
only=sys.argv[2:]
shots={
 'front':(c(6.45,-34,1.7),c(6.45,0,8.5),24),
 'corner_sw':(c(-22,-14,1.7),c(5,4,7),24),
 'corner_se':(c(32,-18,2.0),c(8,6,7),24),
 'west':(c(-30,8,1.7),c(-3,20,7),24),
 'west_n':(c(-22,50,2.0),c(-3,16,7),24),
 'air':(c(5,-45,60),c(7,17,8),28),
 'air_n':(c(10,70,55),c(5,15,8),28),
 'sign':(c(6.45,-26,8),c(6.45,0,17.5),40),
 'detail':(c(6.45,-9,2.5),c(6.45,0,8),30),
}
for k,(a,b,l) in shots.items():
    if only and k not in only: continue
    subprocess.run(['blender','-b','models/dom_moskvy/dom_moskvy.blend','--python','models/render.py','--','models/dom_moskvy/out/%s.png'%k,a,b,str(l),'1400','880',S],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    print(k)
P
