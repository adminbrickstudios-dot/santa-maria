#!/usr/bin/env python3
"""Arma los archivos de la ciudad 3D a partir de extractos abiertos.

Uso: armar.py <carpeta_crudo> <carpeta_salida>
Formato en DATOS.md. Tile z16 (~500 m). Coordenadas enteras: 0..10000 dentro del tile.
"""
import collections, gzip, json, math, os, re, sys, unicodedata

CR, SAL = sys.argv[1], sys.argv[2]
Z = 16
N = 2 ** Z
EXT = 10000
MARGEN = 0.09  # fracción de tile que se repite alrededor (unos 45 m)


def merc(lon, lat):
    r = math.radians(lat)
    return (lon + 180) / 360 * N, (1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * N


def abrir(n):
    p = os.path.join(CR, n)
    return gzip.open(p, "rt", encoding="utf8") if os.path.exists(p) else None


def lineas(n):
    f = abrir(n)
    if not f:
        return
    for l in f:
        l = l.strip("\x1e\n ")
        if l:
            yield json.loads(l)


def anillos(g):
    t = g["type"]
    if t == "Polygon":
        return [g["coordinates"]]
    if t == "MultiPolygon":
        return g["coordinates"]
    return []


def centro(r):
    a = cx = cz = 0.0
    n = len(r) - 1
    for i in range(n):
        x0, z0, x1, z1 = r[i][0], r[i][1], r[i + 1][0], r[i + 1][1]
        k = x0 * z1 - x1 * z0
        a += k
        cx += (x0 + x1) * k
        cz += (z0 + z1) * k
    if abs(a) < 1e-14:
        return sum(p[0] for p in r) / len(r), sum(p[1] for p in r) / len(r)
    return cx / (3 * a), cz / (3 * a)


def adentro(r, x, z):
    c = False
    j = len(r) - 1
    for i in range(len(r)):
        zi, zj = r[i][1], r[j][1]
        if (zi > z) != (zj > z) and x < (r[j][0] - r[i][0]) * (z - zi) / (zj - zi) + r[i][0]:
            c = not c
        j = i
    return c


def simplificar(r, tol):
    """Douglas-Peucker sobre un anillo cerrado, en unidades de tile."""
    if len(r) < 6:
        return r

    def dp(a, b, sal):
        ax, az = r[a]
        bx, bz = r[b]
        dx, dz = bx - ax, bz - az
        L = math.hypot(dx, dz) or 1e-12
        m, k = 0, -1
        for i in range(a + 1, b):
            d = abs((r[i][0] - ax) * dz - (r[i][1] - az) * dx) / L
            if d > m:
                m, k = d, i
        if m > tol:
            dp(a, k, sal)
            sal.append(r[k])
            dp(k, b, sal)

    mit = len(r) // 2
    s = [r[0]]
    dp(0, mit, s)
    s.append(r[mit])
    dp(mit, len(r) - 1, s)
    s.append(r[-1])
    return s


def recortar(p, x0, z0, x1, z1):
    """Sutherland-Hodgman contra un rectángulo."""
    sal = p[:-1] if p[0] == p[-1] else p
    for lado in range(4):
        ent_, sal = sal, []
        if not ent_:
            break
        den = lambda q: (q[0] >= x0 if lado == 0 else q[0] <= x1 if lado == 1 else q[1] >= z0 if lado == 2 else q[1] <= z1)
        for i, a in enumerate(ent_):
            b = ent_[(i + 1) % len(ent_)]
            da, db = den(a), den(b)
            if da:
                sal.append(a)
            if da != db:
                if lado < 2:
                    t = ((x0 if lado == 0 else x1) - a[0]) / (b[0] - a[0])
                else:
                    t = ((z0 if lado == 2 else z1) - a[1]) / (b[1] - a[1])
                sal.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return sal


def num(v):
    if v is None:
        return None
    m = re.match(r"\s*(\d+(?:[.,]\d+)?)", str(v))
    return float(m.group(1).replace(",", ".")) if m else None


def norm(s):
    s = unicodedata.normalize("NFD", s.lower())
    return re.sub(r"[^a-z0-9]", "", "".join(c for c in s if not unicodedata.combining(c)))


def col(v):
    if not v:
        return None
    v = str(v).strip().lower()
    if re.fullmatch(r"#[0-9a-f]{6}", v):
        return v
    return {"white": "#ece8df", "grey": "#9a9a98", "gray": "#9a9a98", "red": "#a84c3c", "brown": "#7a5a44", "beige": "#d8c8a8", "yellow": "#e0c878", "black": "#333333", "blue": "#6a8aa8", "green": "#6a8a68", "orange": "#c88a50", "pink": "#d8a8a0", "cream": "#e8dcc0"}.get(v)


# ───────── Zona de la Ciudad: tiles con lugares de código postal C ─────────
print("zona")
cuenta = collections.Counter()
lugares_crudos = []
for o in lineas("ov_lug.jsonl.gz"):
    p = o["properties"]
    x, z = merc(*o["geometry"]["coordinates"][:2])
    lugares_crudos.append((x, z, p))
    ad = (p.get("addresses") or [{}])[0] or {}
    if str(ad.get("postcode") or "").startswith("C") or "Ciudad" in str(ad.get("locality") or "") or "CABA" in str(ad.get("locality") or ""):
        cuenta[(int(x), int(z))] += 1
zona = {k for k, v in cuenta.items() if v >= 3}
print(" tiles", len(zona))

T = collections.defaultdict(lambda: {"e": [], "l": [], "o": [], "p": [], "k": [], "v": [], "a": []})


def tiles_de(a, b, c, d):
    for tx in range(int(a - MARGEN), int(c + MARGEN) + 1):
        for tz in range(int(b - MARGEN), int(d + MARGEN) + 1):
            if (tx, tz) in zona:
                yield tx, tz


def ent(v, t):
    return int(round((v - t) * EXT))


# ───────── Alturas estimadas ─────────
print("alturas")
gf = collections.defaultdict(list)
for o in lineas("globfp.jsonl.gz"):
    pts = [merc(p[0], p[1]) for p in o["p"]]
    if o.get("h") is None:
        continue
    c = centro(pts + [pts[0]])
    gf[(int(c[0] * 16), int(c[1] * 16))].append((c, pts, float(o["h"])))
print(" globfp", sum(len(v) for v in gf.values()))
gh = None
f = abrir("ghsl_alto.json.gz")
if f:
    gh = json.load(f)


def alto_zona(lon, lat):
    if not gh:
        return None
    j = int((lat - gh["lat0"]) / gh["paso"])
    i = int((lon - gh["lon0"]) / gh["paso"])
    if 0 <= j < len(gh["filas"]) and 0 <= i < len(gh["filas"][0]):
        v = gh["filas"][j][i] / 10
        return v if v > 0 else None
    return None


def alto_globfp(c):
    k = (int(c[0] * 16), int(c[1] * 16))
    mejor, md = None, 0.0016  # ~8 m en tile z16
    for i in (-1, 0, 1):
        for j in (-1, 0, 1):
            for cc, pts, h in gf.get((k[0] + i, k[1] + j), ()):
                d = math.hypot(cc[0] - c[0], cc[1] - c[1])
                if d < md:
                    md, mejor = d, h
    return mejor


# ───────── Detalles de OpenStreetMap por edificio ─────────
print("osm edificios")
osm_e = collections.defaultdict(list)
for o in lineas("osm_edif.jsonl.gz"):
    p = o["properties"]
    for pol in anillos(o["geometry"]):
        r = [merc(a, b) for a, b in pol[0]]
        c = centro(r)
        osm_e[(int(c[0] * 32), int(c[1] * 32))].append((c, p))

# ───────── Edificios de Overture ─────────
print("edificios")
n_id = 0
est = collections.Counter()
for o in lineas("ov_edif.jsonl.gz"):
    p = o["properties"]
    if p.get("is_underground"):
        continue
    for pol in anillos(o["geometry"]):
        r = [merc(a, b) for a, b in pol[0]]
        cx, cz = centro(r)
        if (int(cx), int(cz)) not in zona:
            continue
        ar = abs(sum(r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1] for i in range(len(r) - 1))) / 2 * (503 ** 2)
        if ar < 8:
            continue
        huecos = pol[1:]
        r2 = simplificar(r, 0.0007)  # 35 cm
        if r2[0] != r2[-1]:
            r2.append(r2[0])
        # lo que dice OSM para esta huella
        tags = {}
        k0, k1 = int(cx * 32), int(cz * 32)
        for i in (-1, 0, 1):
            for j in (-1, 0, 1):
                for c, q in osm_e.get((k0 + i, k1 + j), ()):
                    if adentro(r, c[0], c[1]):
                        for a, b in q.items():
                            tags.setdefault(a, b)
        h = num(p.get("height")) or num(tags.get("height"))
        pisos = num(p.get("num_floors")) or num(tags.get("building:levels"))
        calidad = 0
        if h is None and pisos:
            h = pisos * 3.0 + 1
        if h is None:
            calidad = 1
            h = alto_globfp((cx, cz))
            if h is None:
                calidad = 2
                lon = cx / N * 360 - 180
                lat = math.degrees(math.atan(math.sinh(math.pi - 2 * math.pi * cz / N)))
                z_ = alto_zona(lon, lat)
                h = z_ if z_ else 6.0
                h = min(h, 7.0 if ar < 40 else 12.0 if ar < 100 else 45.0)
        h = max(2.6, min(h, 260.0))
        if not pisos:
            pisos = max(1, round((h - 0.6) / 3.0))
        est[calidad] += 1
        minh = num(p.get("min_height")) or num(tags.get("min_height")) or 0
        ano = re.search(r"(1[6-9]\d\d|20\d\d)", str(tags.get("start_date") or ""))
        nombre = ((p.get("names") or {}).get("primary") if isinstance(p.get("names"), dict) else None) or tags.get("name")
        techo = (p.get("roof_shape") or tags.get("roof:shape") or "")
        fila = [
            0, None, round(h * 10), round(minh * 10), int(pisos), calidad,
            str(tags.get("building") if tags.get("building") not in (None, "yes") else (p.get("class") or p.get("subtype") or "")),
            str(techo), col(p.get("facade_color") or tags.get("building:colour")) or "",
            str(p.get("facade_material") or tags.get("building:material") or ""),
            int(ano.group(1)) if ano else 0, nombre or "", 1 if tags.get("heritage") or tags.get("historic") else 0,
            col(p.get("roof_color") or tags.get("roof:colour")) or "",
            str(tags.get("architect") or ""), str(tags.get("wikipedia") or ""),
        ]
        n_id += 1
        fila[0] = n_id
        xs = [q[0] for q in r2]
        zs = [q[1] for q in r2]
        for tx, tz in tiles_de(min(xs), min(zs), max(xs), max(zs)):
            ff = list(fila)
            pl = []
            for q in r2[:-1]:
                pl += [ent(q[0], tx), ent(q[1], tz)]
            ff[1] = pl
            T[(tx, tz)]["e"].append(ff)
print(" edificios", n_id, est)

# ───────── Lugares ─────────
print("lugares")
CAT_OSM = lambda p: next((f"{k}:{p[k]}" for k in ("shop", "amenity", "tourism", "healthcare", "office", "leisure", "craft", "historic") if p.get(k)), "")
SALTA_AM = {"parking", "bench", "waste_basket", "waste_disposal", "bicycle_parking", "fountain", "recycling", "telephone", "post_box", "parking_entrance", "vending_machine", "shelter", "clock", "toilets", "drinking_water", "motorcycle_parking", "taxi", "atm", "bicycle_rental", "grit_bin", "charging_station", "parking_space"}
lista = []
por_clave = {}


def agregar(x, z, nombre, cat, tel="", web="", red="", wa="", hor="", dire="", conf=1.0):
    k = (norm(nombre)[:14], int(x * 12), int(z * 12))
    e = por_clave.get(k)
    if e:
        for i, v in ((5, tel), (6, web), (7, red), (8, wa), (9, hor), (10, dire)):
            if v and not e[i]:
                e[i] = v
        return
    e = [x, z, nombre, cat, "", tel, web, red, wa, hor, dire, conf]
    por_clave[k] = e
    lista.append(e)


for o in lineas("osm_cosas.jsonl.gz"):
    p = o["properties"]
    g = o["geometry"]
    n = p.get("name")
    if not n or (p.get("amenity") in SALTA_AM):
        continue
    cat = CAT_OSM(p)
    if not cat:
        continue
    if g["type"] == "Point":
        x, z = merc(*g["coordinates"])
    else:
        pols = anillos(g)
        if not pols:
            continue
        x, z = centro([merc(a, b) for a, b in pols[0][0]])
    if (int(x), int(z)) not in zona:
        continue
    dire = " ".join(v for v in (p.get("addr:street"), p.get("addr:housenumber")) if v)
    agregar(x, z, n, cat, p.get("phone") or p.get("contact:phone") or "", p.get("website") or p.get("contact:website") or "",
            p.get("contact:instagram") or p.get("contact:facebook") or "", p.get("contact:whatsapp") or "", p.get("opening_hours") or "", dire)

for x, z, p in lugares_crudos:
    if (int(x), int(z)) not in zona:
        continue
    nom = (p.get("names") or {}).get("primary")
    if not nom or (p.get("confidence") or 0) < 0.6 or p.get("operating_status") in ("closed", "permanently_closed"):
        continue
    ad = (p.get("addresses") or [{}])[0] or {}
    soc = [s for s in (p.get("socials") or []) if isinstance(s, str)]
    wa = next((s for s in soc if "wa.me" in s or "whatsapp" in s), "")
    red = next((s for s in soc if "instagram" in s), "") or next((s for s in soc if "facebook" in s), "")
    web = next((w for w in (p.get("websites") or []) if isinstance(w, str) and not re.search(r"gmail\.|hotmail\.|yahoo\.|facebook\.|instagram\.", w)), "")
    agregar(x, z, nom, p.get("basic_category") or "", (p.get("phones") or [""])[0] or "", web, red, wa, "", ad.get("freeform") or "", round(p.get("confidence") or 0, 2))

for e in lista:
    tx, tz = int(e[0]), int(e[1])
    T[(tx, tz)]["l"].append([ent(e[0], tx), ent(e[1], tz)] + e[2:4] + e[5:11])
print(" lugares", len(lista))

# ───────── Objetos de la calle, árboles, puertas, cruces ─────────
print("objetos")
TIPO = {"street_lamp": "farola", "traffic_signals": "semaforo", "bus_stop": "parada", "bench": "banco", "waste_basket": "cesto", "waste_disposal": "contenedor", "recycling": "reciclado",
        "fountain": "fuente", "bicycle_parking": "bicis", "bicycle_rental": "ecobici", "post_box": "buzon", "telephone": "telefono", "subway_entrance": "subte", "artwork": "arte",
        "fire_hydrant": "hidrante", "street_cabinet": "gabinete", "bollard": "bolardo", "atm": "cajero", "drinking_water": "bebedero", "clock": "reloj", "memorial": "monumento", "monument": "monumento"}
for o in lineas("osm_cosas.jsonl.gz"):
    p = o["properties"]
    g = o["geometry"]
    if g["type"] != "Point":
        continue
    x, z = merc(*g["coordinates"])
    t = (int(x), int(z))
    if t not in zona:
        continue
    X, Z_ = ent(x, t[0]), ent(z, t[1])
    tp = None
    for k in ("highway", "amenity", "railway", "emergency", "man_made", "barrier", "tourism", "historic"):
        if p.get(k) in TIPO:
            tp = TIPO[p[k]]
            break
    if p.get("natural") == "tree":
        T[t]["o"].append(["arbol", X, Z_, p.get("species") or p.get("genus") or p.get("taxon") or ""])
    elif p.get("highway") == "crossing":
        T[t]["k"].append([X, Z_, p.get("crossing") or ""])
    elif tp:
        T[t]["o"].append([tp, X, Z_, p.get("name") or ""])
    if p.get("entrance") or p.get("door"):
        T[t]["p"].append([X, Z_, p.get("addr:housenumber") or "", p.get("entrance") or p.get("door") or ""])
    elif p.get("addr:housenumber"):
        T[t]["p"].append([X, Z_, p.get("addr:housenumber"), "numero"])

for o in lineas("ov_dir.jsonl.gz"):
    q = o["properties"]
    if o["geometry"]["type"] != "Point" or not q.get("number"):
        continue
    x, z = merc(*o["geometry"]["coordinates"])
    t = (int(x), int(z))
    if t in zona:
        T[t]["p"].append([ent(x, t[0]), ent(z, t[1]), str(q["number"]), "numero"])

# ───────── Calles, senderos y áreas ─────────
print("red")
AREA = {"park": "parque", "garden": "parque", "grass": "pasto", "meadow": "pasto", "forest": "bosque", "wood": "bosque", "water": "agua", "pitch": "cancha", "playground": "juegos", "recreation_ground": "parque", "cemetery": "cementerio", "village_green": "pasto", "beach": "arena", "sand": "arena", "riverbank": "agua", "scrub": "pasto", "wetland": "pasto"}
n_via = 0
for o in lineas("osm_red.jsonl.gz"):
    p = o["properties"]
    g = o["geometry"]
    ty = p.get("leisure") or p.get("landuse") or p.get("natural")
    if ty in AREA and g["type"] in ("Polygon", "MultiPolygon"):
        for pol in anillos(g):
            rs = [[merc(a, b) for a, b in q] for q in pol]
            xs = [q[0] for q in rs[0]]
            zs = [q[1] for q in rs[0]]
            for tx, tz in tiles_de(min(xs), min(zs), max(xs), max(zs)):
                hs = []
                for q in rs:
                    c = recortar(q, tx - MARGEN, tz - MARGEN, tx + 1 + MARGEN, tz + 1 + MARGEN)
                    if len(c) >= 3:
                        hs.append(sum(([ent(w[0], tx), ent(w[1], tz)] for w in simplificar(c + [c[0]], 0.002)[:-1]), []))
                    elif not hs:
                        break
                if hs:
                    T[(tx, tz)]["a"].append([AREA[ty], hs])
        continue
    if g["type"] != "LineString":
        continue
    cl = p.get("highway") or (("rail:" + p["railway"]) if p.get("railway") else None) or (("muro:" + p["barrier"]) if p.get("barrier") else None)
    if not cl or cl in ("proposed", "construction", "abandoned", "disused", "razed"):
        continue
    pts = [merc(a, b) for a, b in g["coordinates"]]
    n_via += 1
    extra = {k: p[k] for k in ("lanes", "width", "surface", "oneway", "sidewalk", "bridge", "tunnel", "layer", "maxspeed", "cycleway", "cycleway:left", "cycleway:right", "footway", "lit", "busway") if k in p}
    i = 0
    tocados = collections.defaultdict(list)
    for a, b in zip(pts, pts[1:]):
        for tx, tz in tiles_de(min(a[0], b[0]), min(a[1], b[1]), max(a[0], b[0]), max(a[1], b[1])):
            l = tocados[(tx, tz)]
            if l and l[-1][-1] is a:
                l[-1].append(b)
            else:
                l.append([a, b])
    for t, trozos in tocados.items():
        for tr in trozos:
            T[t]["v"].append([n_via, cl, p.get("name") or "", sum(([ent(q[0], t[0]), ent(q[1], t[1])] for q in tr), []), extra])

# ───────── Escribir ─────────
print("escribiendo")
os.makedirs(SAL, exist_ok=True)
tam = 0
ind = []
for (tx, tz), d in sorted(T.items()):
    if not (d["e"] or d["v"]):
        continue
    d["x"], d["y"] = tx, tz
    b = gzip.compress(json.dumps(d, ensure_ascii=False, separators=(",", ":")).encode("utf8"), 9, mtime=0)
    open(os.path.join(SAL, f"{tx}_{tz}.json.gz"), "wb").write(b)
    tam += len(b)
    ind.append([tx, tz, len(b)])
json.dump({"v": 1, "z": Z, "ext": EXT, "tiles": ind}, open(os.path.join(SAL, "indice.json"), "w"), separators=(",", ":"))

# Buscador: todos los lugares en un solo archivo liviano
b = [[round(e[0], 5), round(e[1], 5), e[2], e[3], e[10]] for e in lista]
open(os.path.join(SAL, "buscar.json.gz"), "wb").write(gzip.compress(json.dumps(b, ensure_ascii=False, separators=(",", ":")).encode("utf8"), 9, mtime=0))
print("tiles", len(ind), "MB", round(tam / 1e6, 1), "mayor", max(i[2] for i in ind))
