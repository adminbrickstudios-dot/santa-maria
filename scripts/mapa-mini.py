# Dibuja el mapa chico del Inicio a partir de los datos de la ciudad.
import json
L=json.load(open('public/data/lugares.json')); C=json.load(open('public/data/calles.json'))
W,H=1000,420
LON0,LON1=-58.4465,-58.3485; LAT1=-34.5725
import math
k=(LON1-LON0)/W*1/math.cos(math.radians(34.6)); LAT0=LAT1-H*k
print('LAT0',round(LAT0,5))
X=lambda lo:(lo-LON0)/(LON1-LON0)*W; Y=lambda la:(LAT1-la)/(LAT1-LAT0)*H
def camino(pts,cerrar=False,):
    out=[]
    for i in range(0,len(pts),2):
        out.append(('M' if i==0 else 'L')+f'{X(pts[i]/1e5):.0f} {Y(pts[i+1]/1e5):.0f}')
    return ''.join(out)+('Z' if cerrar else '')
def visible(pts):
    xs=pts[0::2];ys=pts[1::2]
    return max(xs)/1e5>LON0-.01 and min(xs)/1e5<LON1+.01 and max(ys)/1e5>LAT0-.01 and min(ys)/1e5<LAT1+.01
parques=''.join(camino(r,True) for p in L['parks'] for r in p[4] if visible(r) and p[1]>15000)
ox,oy=C['o']
ejes={1:[],0:[]}
for e in C['e']:
    a,b,cl,*_,g=e
    ax,ay=C['n'][a*2],C['n'][a*2+1]
    xs=[ox+ax];ys=[oy+ay]
    for i in range(0,len(g),2):
        xs.append(xs[-1]+g[i]);ys.append(ys[-1]+g[i+1])
    bx,by=C['n'][b*2],C['n'][b*2+1]
    xs.append(ox+bx);ys.append(oy+by)
    if max(xs)/1e5<LON0 or min(xs)/1e5>LON1 or max(ys)/1e5<LAT0 or min(ys)/1e5>LAT1:continue
    d=''.join(('M' if i==0 else 'L')+f'{X(x/1e5):.0f} {Y(y/1e5):.0f}' for i,(x,y) in enumerate(zip(xs,ys)))
    if cl in(1,4): ejes[1].append(d)
    elif cl in (2,): ejes[0].append(d)
av=''.join(ejes[1]); ca=''.join(ejes[0])
print(len(av),len(ca),len(parques))
TEMA={'claro':dict(rio='#A9D8F2',tierra='#EDF0F4',parque='#C4EBC9',calle='#FFFFFF',av='#FFFFFF',borde='#DCE1E8'),
      'oscuro':dict(rio='#0C2A3D',tierra='#1C1E22',parque='#163D2A',calle='#2E3238',av='#474C54',borde='#1C1E22')}
for n,t in TEMA.items():
    svg=f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}"><rect width="{W}" height="{H}" fill="{t['rio']}"/><path fill="{t['tierra']}" d="{camino(L['land'],True)}"/><path fill="{t['parque']}" d="{parques}"/><path fill="{t['rio']}" d="{camino(L['agua'],True)}"/><path fill="none" stroke="{t['calle']}" stroke-width="2.2" stroke-linecap="round" d="{ca}"/><path fill="none" stroke="{t['av']}" stroke-width="6" stroke-linecap="round" d="{av}"/></svg>'''
    open(f'public/mapa-mini-{n}.svg','w').write(svg); print(n,len(svg))
