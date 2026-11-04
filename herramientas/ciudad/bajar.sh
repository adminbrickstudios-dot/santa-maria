#!/bin/bash
# Baja extractos abiertos de la Ciudad: Overture Maps y OpenStreetMap (Geofabrik).
set -eu
B="-58.535,-34.705,-58.33,-34.525"
mkdir -p crudo recon
sudo apt-get -qq update >/dev/null; sudo apt-get -qq install -y osmium-tool pigz >/dev/null
pip install -q overturemaps >/dev/null
overturemaps download --bbox=$B -f geojsonseq --type=building -o crudo/ov_edif.jsonl
overturemaps download --bbox=$B -f geojsonseq --type=building_part -o crudo/ov_part.jsonl || true
overturemaps download --bbox=$B -f geojsonseq --type=place -o crudo/ov_lug.jsonl
curl -sSL -m 900 https://download.geofabrik.de/south-america/argentina-latest.osm.pbf -o ar.pbf
osmium extract -b $B ar.pbf -s smart -o caba.pbf --overwrite
rm -f ar.pbf
f(){ osmium tags-filter -O caba.pbf "$@" -o t.pbf; }
f nwr/building nwr/building:part; osmium export t.pbf -O -f geojsonseq --add-unique-id=type_id -o crudo/osm_edif.jsonl
f n/entrance n/door n/shop n/amenity n/tourism n/office n/leisure n/craft n/healthcare n/historic n/natural=tree n/highway=street_lamp,traffic_signals,crossing,bus_stop n/man_made n/railway=subway_entrance n/emergency n/barrier w/shop w/amenity w/tourism w/office w/leisure w/historic r/amenity r/tourism r/leisure r/historic
osmium export t.pbf -O -f geojsonseq --add-unique-id=type_id -o crudo/osm_cosas.jsonl
f w/highway w/barrier w/railway w/waterway nwr/landuse nwr/natural nwr/leisure=park,garden,pitch,playground; osmium export t.pbf -O -f geojsonseq --add-unique-id=type_id -o crudo/osm_red.jsonl
python3 herramientas/ciudad/estadisticas.py > recon/estadisticas.txt 2> recon/estadisticas.err || true
pigz -9 crudo/*.jsonl
ls -la crudo > recon/tam.txt
