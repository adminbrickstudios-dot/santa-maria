#!/bin/bash
# Alturas estimadas abiertas (CC BY 4.0) para la Ciudad: 3D-GloBFP por edificio y GHSL por zona.
set -eu
mkdir -p recon crudo
pip install -q overturemaps >/dev/null
overturemaps download --bbox=-58.535,-34.705,-58.33,-34.525 -f geojsonseq --type=address -o crudo/ov_dir.jsonl || true
gzip -9 crudo/ov_dir.jsonl || true
rm -f crudo/*.state
pip install -q pyshp pyproj rasterio numpy >/dev/null
curl -sSL -m 60 "https://api.figshare.com/v2/articles/28881749/files?page_size=1000" -o recon/figshare.json
python3 - <<'P'
import json,subprocess
d=json.load(open('recon/figshare.json'))
print(len(d))
f=[x for x in d if x['name'].startswith('428_')]
print(f)
open('recon/figshare_428.json','w').write(json.dumps(f,indent=1))
for x in f:
    subprocess.check_call(['curl','-sSL','-m','900',x['download_url'],'-o',x['name']])
P
python3 - <<'P'
import glob,zipfile,os,json,shapefile,gzip
for z in glob.glob('428_*.zip'):
    zipfile.ZipFile(z).extractall('g428')
B=(-58.535,-34.705,-58.33,-34.525)
n=0
with gzip.open('crudo/globfp.jsonl.gz','wt') as o:
    for f in glob.glob('g428/**/*.shp',recursive=True)+glob.glob('428_*.shp'):
        s=shapefile.Reader(f);print(f,len(s),[x[0] for x in s.fields])
        for r in s.iterShapeRecords():
            a=r.shape.bbox
            if a[2]<B[0] or a[0]>B[2] or a[3]<B[1] or a[1]>B[3]: continue
            d=r.record.as_dict()
            h=[v for k,v in d.items() if k.lower() in('height','h','heights')]
            o.write(json.dumps({'p':[[round(x,6),round(y,6)] for x,y in r.shape.points],'h':h[0] if h else None,'r':d if n<3 else None})+'\n');n+=1
print('edificios',n)
P
Q=https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_BUILT_H_GLOBE_R2023A/GHS_BUILT_H_ANBH_E2018_GLOBE_R2023A_54009_100/V1-0/tiles
python3 - <<'P' > recon/ghsl_tile.txt
from pyproj import Transformer
t=Transformer.from_crs('EPSG:4326','ESRI:54009',always_xy=True)
x,y=t.transform(-58.43,-34.61)
print(int((x+18041000)//1000000)+1, int((9000000-y)//1000000)+1, x, y)
P
read C R X Y < recon/ghsl_tile.txt
curl -sSL -m 300 "$Q/GHS_BUILT_H_ANBH_E2018_GLOBE_R2023A_54009_100_V1_0_R${R}_C${C}.zip" -o gh.zip
python3 - <<'P'
import zipfile,glob,json,gzip,rasterio,numpy as np
from pyproj import Transformer
zipfile.ZipFile('gh.zip').extractall('gh')
f=glob.glob('gh/*.tif')[0]
t=Transformer.from_crs('EPSG:4326','ESRI:54009',always_xy=True)
r=rasterio.open(f)
paso=0.0009
sal={'lon0':-58.535,'lat0':-34.705,'paso':paso,'filas':[]}
lats=np.arange(-34.705,-34.525,paso);lons=np.arange(-58.535,-58.33,paso)
for la in lats:
    xs,ys=t.transform(lons,np.full_like(lons,la))
    sal['filas'].append([int(round(float(v[0])*10)) for v in r.sample(zip(xs,ys))])
sal['anchoCols']=len(lons)
json.dump(sal,gzip.open('crudo/ghsl_alto.json.gz','wt'))
print(np.percentile(np.array(sal['filas']),[50,90,99]))
P
ls -la crudo > recon/tam.txt
