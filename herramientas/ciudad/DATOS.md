# Datos de la ciudad 3D

Se generan con `armar.py` desde extractos abiertos. Todo se muestra con crédito dentro de la app.

| Fuente | Qué aporta | Licencia |
|---|---|---|
| Overture Maps | huellas de edificios, lugares, direcciones | ODbL (edificios), CDLA-Permissive-2.0 (lugares) |
| OpenStreetMap | calles, veredas, cruces, árboles, objetos, datos de locales | ODbL |
| 3D-GloBFP | altura estimada por edificio | CC BY 4.0 |
| GHSL GHS-BUILT-H | altura media por zona | CC BY 4.0 |

No se usa contenido de Google Maps en estos archivos. Las huellas de Google Open Buildings
llegan por Overture bajo su licencia abierta.

Formato: un archivo `x_y.json.gz` por tile z16 (unos 500 m), con coordenadas enteras 0..10000 dentro del tile.
