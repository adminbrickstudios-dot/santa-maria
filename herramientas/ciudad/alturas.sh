#!/bin/bash
# Mira cómo bajar alturas estimadas abiertas (CC BY 4.0) para Buenos Aires.
set -u
mkdir -p recon
Z=https://zenodo.org/records/15487006/files
curl -sSL -m 60 "$Z/data_links.txt?download=1" -o recon/data_links.txt
curl -sSL -m 60 "$Z/readme.txt?download=1" -o recon/readme.txt
curl -sSL -m 60 "$Z/world_grid.zip?download=1" -o g.zip
pip install -q pyshp >/dev/null
python3 - <<'P' > recon/grilla.txt
import zipfile,shapefile,glob,os
zipfile.ZipFile('g.zip').extractall('g')
for f in glob.glob('g/**/*.shp',recursive=True):
    s=shapefile.Reader(f);print(f,len(s),[x[0] for x in s.fields])
    for r in s.iterShapeRecords():
        a=r.shape.bbox
        if a[0]<=-58.4<=a[2] and a[1]<=-34.6<=a[3]: print(r.record.as_dict(),a)
P
P=https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_BUILT_H_GLOBE_R2023A/GHS_BUILT_H_ANBH_E2018_GLOBE_R2023A_54009_100/V1-0/tiles
for r in 12 13 14; do for c in 12 13 14; do n=GHS_BUILT_H_ANBH_E2018_GLOBE_R2023A_54009_100_V1_0_R${r}_C${c}.zip; printf "%s %s\n" "$(curl -sIL -m 20 -o /dev/null -w '%{http_code} %header{content-length}' $P/$n)" $n >> recon/ghsl.txt; done; done
