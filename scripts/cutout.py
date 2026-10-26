import sys,math
from PIL import Image
from collections import deque
src,dst=sys.argv[1],sys.argv[2]
im=Image.open(src).convert('RGB');W,H=im.size;px=im.load()
lum=lambda c:(c[0]*299+c[1]*587+c[2]*114)//1000
alpha=bytearray([255])*(W*H);seen=bytearray(W*H)
def flood(seeds,ok,spread_min):
    q=deque(seeds)
    while q:
        x,y=q.popleft();i=y*W+x
        if seen[i]:continue
        c=px[x,y]
        if not ok(c):continue
        seen[i]=1;l=lum(c);alpha[i]=0 if l>=240 else int(min(255,(240-l)*1.9))
        if l<spread_min:continue
        for nx,ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)):
            if 0<=nx<W and 0<=ny<H and not seen[ny*W+nx]:q.append((nx,ny))
border=[(x,y) for x in range(W) for y in (0,H-1)]+[(x,y) for y in range(H) for x in (0,W-1)]
flood(border,lambda c:max(c)-min(c)<18 and lum(c)>170,226)
# Inside the wheels and other enclosed gaps: only clean studio white.
seeds=[]
for cx,cy,r in ((464,924,230),(1706,921,230)):
    for k in range(72):
        for rr in range(40,r,12):
            seeds.append((int(cx+rr*math.cos(k*math.pi/36)),int(cy+rr*math.sin(k*math.pi/36))))
seeds+=[(x,y) for x in range(640,1420,6) for y in (880,960,1040,1120,1180)]
flood(seeds,lambda c:max(c)-min(c)<14 and lum(c)>=244,244)
out=im.convert('RGBA');out.putalpha(Image.frombytes('L',(W,H),bytes(alpha)))
out.save(dst,'WEBP',quality=86,method=6)
