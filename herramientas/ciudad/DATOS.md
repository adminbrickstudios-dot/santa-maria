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

## Contenido de cada tile

Claves: `x`, `y` (tile z16) y estas listas. `X,Z` son enteros 0..10000 dentro del tile (pueden salir un poco del rango).
Un edificio o calle que cruza tiles aparece en cada uno: se dibuja una sola vez usando `id` o el centroide.

- `e` edificios: `[id, anillo[X,Z,...] (sin repetir el primero, sin orientar), altoDm, baseDm, pisos, calidad, tipo, techo, colorFachada, materialFachada, año, nombre, patrimonio(0/1), colorTecho, arquitecto, wikipedia]`.
  `calidad`: 0 dato publicado, 1 estimación por edificio, 2 estimación por zona.
- `l` lugares: `[X, Z, nombre, categoria, telefono, web, red, whatsapp, horario, direccion]`.
- `o` objetos: `[tipo, X, Z, detalle]`; tipos arbol (detalle: especie), farola, semaforo, parada, banco, cesto, contenedor, reciclado, fuente, bicis, ecobici, buzon, telefono, subte, arte, hidrante, gabinete, bolardo, cajero, bebedero, reloj, monumento, posta, mesa, bandera (detalle: flag:type), tapa, maceta, terraza, publicidad, cochera, rampa, pare, ceda, radar, lomo.
- `p` puertas y números: `[X, Z, numero, tipo]`; tipo `numero` si solo se conoce la altura.
- `k` cruces peatonales: `[X, Z, tipo]`.
- `v` vías: `[id, clase, nombre, puntos[X,Z,...], extra]`; clase highway de OSM, `rail:*` o `muro:*`; extra con lanes, width, surface, oneway, sidewalk, bridge, tunnel, layer, maxspeed, cycleway, footway, lit, busway.
- `a` áreas: `[tipo, anillos]`; parque, pasto, bosque, agua, cancha, juegos, cementerio, arena, canil, obra, playa, balasto, terreno, arbustos, plazaseca. El primer anillo es el exterior.

`indice.json` lista los tiles. `buscar.json.gz`: `[x, y, nombre, categoria, direccion]` con x,y fraccionarios en z16.
