#!/bin/bash
# Mira qué datos públicos hay disponibles para la ciudad. Solo lee.
set -u
mkdir -p recon
BA=https://data.buenosaires.gob.ar/api/3/action
curl -sS -m 60 "$BA/package_list" -o recon/paquetes.json || echo fallo paquetes
for q in tejido edificios parcelas arbolado comercios locales luminarias paradas veredas farmacias gastronomia "usos del suelo" "bares notables" hoteles cines teatros museos; do
  curl -sS -m 40 -G "$BA/package_search" --data-urlencode "q=$q" --data-urlencode rows=8 -o "recon/q_${q// /_}.json" || true
done
curl -sS -m 40 https://stac.overturemaps.org/catalog.json -o recon/overture_catalogo.json || true
curl -sSI -m 30 https://download.geofabrik.de/south-america/argentina-latest.osm.pbf > recon/geofabrik.txt || true
pip install -q overturemaps >/dev/null 2>&1; pip show overturemaps | head -3 > recon/overture_pip.txt
python3 - <<'P' > recon/resumen.txt
import json,glob
for f in sorted(glob.glob('recon/q_*.json')):
    try: d=json.load(open(f))
    except Exception as e: print(f,'ERR',e); continue
    print('==',f)
    for p in d.get('result',{}).get('results',[]):
        print(' *',p.get('name'),'|',p.get('title'),'|',p.get('license_title'))
        for r in p.get('resources',[]):
            print('    ',r.get('format'),r.get('name'),r.get('url'),r.get('size'))
P
