/* El trabajo pesado de la ciudad: buscar, rutear y consultar edificios. Corre en un worker.
   Si no hay tiles z16 para una zona, rutea con la red de calles del mapa 2D. */
import { alat, alon, barrioDe, cargarCalles, enganchar, G, geocodificar, wx, wy } from "@/lib/mapa/motor";
import { buscarEn, crearIndice, normalizar, type FilaBuscar, type Indice, type Resultado } from "./buscador";
import { describirCategoria } from "./categoria-lugar";
import { BASE_CIUDAD, EXT, bajarGz, distanciaM, lonLatDeZ16, metrosTile, urlTile, z16DeLonLat, type Punto, type TileCiudad } from "./ciudad";
import { FILTROS, type IdFiltro } from "./filtros";
import { Red, dentroPoligono, type Camino, type Perfil, type ViaEntrada } from "./ruta";
import { abiertoAhora, type DatosLugar } from "./recepcion";

const LAT_REF = -34.6, M = metrosTile(LAT_REF), BASE_X = 22000, BASE_Y = 39000;
const aPlano = (lon: number, lat: number) => { const t = z16DeLonLat(lon, lat); return { x: (t.x - BASE_X) * M, y: (t.y - BASE_Y) * M }; };
const dePlano = (x: number, y: number) => lonLatDeZ16(x / M + BASE_X, y / M + BASE_Y);
const MAX_TILES = 150, MAX_CORREDOR = 200;

interface Poli { xy: Float32Array; x0: number; x1: number; y0: number; y1: number; meta: (string | number | number[])[] }
interface TileRed { x: number; y: number; vias: ViaEntrada[]; polis: Poli[]; lugares: (string | number)[][]; numeros: (string | number)[][]; cajeros: (string | number)[][]; cruces: number[][]; uso: number }

export interface RutaHecha { pts: Float64Array; largo: number; maniobras: Camino["maniobras"]; fuente: "tiles" | "calles" }
export interface DatosEdificio {
  nombre: string | null; pisos: number | null; altura: number | null; base: number; calidad: number; anio: number | null; arquitecto: string | null;
  tipo: string | null; patrimonio: boolean; wikipedia: string | null; lat: number; lon: number; anillo: number[];
}
export interface Parada { nombre: string; categoria: string; lat: number; lon: number; direccion: string }
export interface LineasMapa { calles: Float32Array; avenidas: Float32Array }
export interface Cercano { nombre: string; categoria: string; categoriaCruda?: string; direccion: string; lat: number; lon: number; dist: number; abierto?: boolean | null }
export interface Cuadra { calle: string | null; altura: string | null; barrio: string | null; lugares: Cercano[] }

const RUTAS_AUTO = new Set(["motorway", "trunk", "primary", "secondary", "tertiary", "residential", "unclassified", "living_street", "service", "primary_link", "secondary_link", "tertiary_link", "road", "pedestrian"]);

export class Nucleo {
  private indiceTiles: Promise<Set<string> | null> | null = null;
  private tiles = new Map<string, TileRed>();
  private enCurso = new Map<string, Promise<TileRed | null>>();
  private reloj = 0;
  private buscador: Promise<Indice | null> | null = null;
  private calles: Promise<boolean> | null = null;
  private redCalles: Red | null = null;

  private indice() {
    this.indiceTiles ??= bajarGz<{ tiles: number[][] }>(`${BASE_CIUDAD}/indice.json`).then((j) => (j ? new Set(j.tiles.map((t) => `${t[0]}_${t[1]}`)) : null)).catch(() => null);
    return this.indiceTiles;
  }

  private async tile(x: number, y: number): Promise<TileRed | null> {
    const k = `${x}_${y}`, h = this.tiles.get(k);
    if (h) { h.uso = ++this.reloj; return h; }
    const c = this.enCurso.get(k);
    if (c) return c;
    const p = (async () => {
      const ind = await this.indice();
      if (!ind || !ind.has(k)) return null;
      const j = await bajarGz<TileCiudad>(urlTile(x, y));
      if (!j) return null;
      const t = this.armarTile(j);
      this.tiles.set(k, t);
      if (this.tiles.size > MAX_TILES) {
        const viejo = [...this.tiles.entries()].sort((a, b) => a[1].uso - b[1].uso).slice(0, 30);
        for (const [q] of viejo) this.tiles.delete(q);
      }
      return t;
    })().catch(() => null).finally(() => this.enCurso.delete(k));
    this.enCurso.set(k, p);
    return p;
  }

  private armarTile(j: TileCiudad): TileRed {
    const X = (v: number) => (j.x + v / EXT - BASE_X) * M, Y = (v: number) => (j.y + v / EXT - BASE_Y) * M;
    const vias: ViaEntrada[] = [];
    for (const v of j.v) {
      const p = v[3], pts = new Float64Array(p.length);
      for (let i = 0; i < p.length; i += 2) { pts[i] = X(p[i]); pts[i + 1] = Y(p[i + 1]); }
      vias.push({ pts, clase: v[1], nombre: v[2], extra: v[4] });
    }
    const polis: Poli[] = [];
    for (const e of j.e) {
      const r = e[1] as number[], xy = new Float32Array(r.length);
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (let i = 0; i < r.length; i += 2) {
        const a = X(r[i]), b = Y(r[i + 1]);
        xy[i] = a; xy[i + 1] = b;
        if (a < x0) x0 = a; if (a > x1) x1 = a; if (b < y0) y0 = b; if (b > y1) y1 = b;
      }
      polis.push({ xy, x0, x1, y0, y1, meta: e });
    }
    return { x: j.x, y: j.y, vias, polis, lugares: j.l, numeros: j.p ?? [], cajeros: (j.o ?? []).filter((o) => o[0] === "cajero"),
      cruces: [...(j.k ?? []).map((c) => [Number(c[0]), Number(c[1])]), ...(j.o ?? []).filter((o) => o[0] === "semaforo").map((o) => [Number(o[1]), Number(o[2])])], uso: ++this.reloj };
  }

  /** Edificio que contiene un punto del plano, mirando solo los tiles ya bajados. */
  private edificioEn(x: number, y: number): Poli | null {
    const t = this.tiles.get(`${Math.floor(x / M + BASE_X)}_${Math.floor(y / M + BASE_Y)}`);
    if (!t) return null;
    for (const p of t.polis) if (x >= p.x0 && x <= p.x1 && y >= p.y0 && y <= p.y1 && dentroPoligono(p.xy, x, y)) return p;
    return null;
  }

  private asegurarCalles() {
    this.calles ??= fetch("/data/calles.json").then(async (r) => {
      if (!r.ok) return false;
      cargarCalles(await r.json());
      return true;
    }).catch(() => { this.calles = null; return false; });
    return this.calles;
  }

  /* ───────── Búsqueda ───────── */
  private indiceBuscar() {
    this.buscador ??= (async () => {
      const f = await bajarGz<FilaBuscar[]>(`${BASE_CIUDAD}/buscar.json.gz`).catch(() => null);
      if (f?.length) return crearIndice(f);
      /* Sin el archivo nuevo: los lugares del mapa 2D */
      const r = await fetch("/data/lugares.json").catch(() => null);
      if (!r?.ok) return null;
      const j = (await r.json()) as { pois?: (string | number)[][] };
      const filas: FilaBuscar[] = (j.pois ?? []).map((p) => { const u = z16DeLonLat(Number(p[1]), Number(p[2])); return [u.x, u.y, String(p[3]), "", String(p[4] ?? "")]; });
      return filas.length ? crearIndice(filas) : null;
    })().catch(() => null);
    return this.buscador;
  }

  /** Lo baja de antemano: el primer tipeo ya responde. */
  async preparar() { await Promise.all([this.indiceBuscar(), this.asegurarCalles()]); return true; }

  async buscar(q: string, ref: Punto | null, tope = 8): Promise<Resultado[]> {
    const t = q.trim();
    if (t.length < 2) return [];
    const [ix, hayCalles] = await Promise.all([this.indiceBuscar(), this.asegurarCalles()]);
    const dirs: Resultado[] = [];
    if (hayCalles && t.length >= 3) {
      for (const g of geocodificar(t) as { nombre: string; x: number; y: number; sub?: string }[]) {
        const p = { lat: alat(g.y), lon: alon(g.x) };
        dirs.push({ tipo: "dir", nombre: g.nombre, categoria: / y /.test(g.nombre) ? "Esquina" : "Dirección", direccion: g.sub ?? "", ...p, dist: ref ? distanciaM(ref, p) : null });
      }
    }
    const lug = ix ? buscarEn(ix, t, ref, tope) : [];
    return [...dirs, ...lug].slice(0, tope);
  }

  /* ───────── Ruta ───────── */
  private tilesCorredor(a: Punto, b: Punto, margenM: number) {
    const p = z16DeLonLat(a.lon, a.lat), q = z16DeLonLat(b.lon, b.lat), mg = margenM / M, out = new Set<string>();
    const L = Math.hypot(q.x - p.x, q.y - p.y), pasos = Math.max(1, Math.ceil(L * 2));
    for (let i = 0; i <= pasos; i++) {
      const cx = p.x + ((q.x - p.x) * i) / pasos, cy = p.y + ((q.y - p.y) * i) / pasos;
      for (let x = Math.floor(cx - mg); x <= Math.floor(cx + mg); x++) for (let y = Math.floor(cy - mg); y <= Math.floor(cy + mg); y++) out.add(`${x}_${y}`);
    }
    return [...out].map((s) => s.split("_").map(Number) as [number, number]);
  }

  private async bajarTodos(l: [number, number][], progreso?: (f: number) => void) {
    let i = 0, hechos = 0;
    const out: TileRed[] = [];
    const obrero = async () => {
      while (i < l.length) {
        const [x, y] = l[i++], t = await this.tile(x, y);
        if (t) out.push(t);
        progreso?.(++hechos / l.length);
      }
    };
    await Promise.all([obrero(), obrero(), obrero(), obrero()]);
    return out;
  }

  private armarRed(ts: TileRed[]) {
    const red = new Red();
    for (const t of ts) for (const v of t.vias) red.agregar(v);
    red.cerrar();
    return red;
  }

  private async redDeCalles(): Promise<Red | null> {
    if (this.redCalles) return this.redCalles;
    if (!(await this.asegurarCalles())) return null;
    const red = new Red(), g = G as unknown as { E: number; ep: Float32Array[]; ec: Uint8Array; en: Int32Array; names: string[] };
    for (let e = 0; e < g.E; e++) {
      const p = g.ep[e], pts = new Float64Array(p.length);
      for (let i = 0; i < p.length; i += 2) { const u = aPlano(alon(p[i]), alat(p[i + 1])); pts[i] = u.x; pts[i + 1] = u.y; }
      red.agregar({ pts, clase: g.ec[e] === 1 ? "primary" : "residential", nombre: g.names[g.en[e]] ?? "" });
    }
    red.cerrar();
    this.redCalles = red;
    return red;
  }

  async ruta(a: Punto, b: Punto, perfil: Perfil, progreso?: (f: number) => void): Promise<RutaHecha | null> {
    const A = aPlano(a.lon, a.lat), B = aPlano(b.lon, b.lat), hayTiles = !!(await this.indice());
    const dentro = (x: number, y: number) => !!this.edificioEn(x, y);
    const recta = Math.hypot(A.x - B.x, A.y - B.y);
    let mejor: Camino | null = null;
    if (hayTiles) {
      /* Primero un corredor angosto. Si obliga a un rodeo (vías, autopistas) se ensancha */
      for (const margen of [320, 800, 1500]) {
        const l = this.tilesCorredor(a, b, margen);
        if (l.length > MAX_CORREDOR) break;
        const ts = await this.bajarTodos(l, progreso);
        if (ts.length < l.length * 0.5) break;
        const c = this.armarRed(ts).camino(A.x, A.y, B.x, B.y, perfil, dentro);
        if (c && (!mejor || c.largo < mejor.largo)) mejor = c;
        if (mejor && mejor.largo < recta * 1.45 + 150) break;
      }
      if (mejor) return this.empaquetar(mejor, "tiles");
    }
    /* La red del mapa no sobrevive partir tramos varias veces: se usa una vez y se rearma */
    const red = await this.redDeCalles();
    if (!red) return null;
    this.redCalles = null;
    const c = red.camino(A.x, A.y, B.x, B.y, perfil);
    return c ? this.empaquetar(c, "calles") : null;
  }

  private empaquetar(c: Camino, fuente: RutaHecha["fuente"]): RutaHecha {
    const pts = new Float64Array(c.pts.length);
    for (let i = 0; i < c.pts.length; i += 2) { const u = dePlano(c.pts[i], c.pts[i + 1]); pts[i] = u.lat; pts[i + 1] = u.lon; }
    return { pts, largo: c.largo, maniobras: c.maniobras, fuente };
  }

  /* ───────── Edificio y lugar ───────── */
  private interiorDe(p: Poli) {
    let mejor = { x: (p.x0 + p.x1) / 2, y: (p.y0 + p.y1) / 2 }, md = -1;
    const pasos = 8;
    for (let i = 1; i < pasos; i++) for (let j = 1; j < pasos; j++) {
      const x = p.x0 + ((p.x1 - p.x0) * i) / pasos, y = p.y0 + ((p.y1 - p.y0) * j) / pasos;
      if (!dentroPoligono(p.xy, x, y)) continue;
      let d = 1e9;
      for (let k = 0, m = p.xy.length - 2; k < p.xy.length; m = k, k += 2) {
        const ax = p.xy[m], ay = p.xy[m + 1], dx = p.xy[k] - ax, dy = p.xy[k + 1] - ay, q = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / q));
        d = Math.min(d, Math.hypot(ax + dx * t - x, ay + dy * t - y));
      }
      if (d > md) { md = d; mejor = { x, y }; }
    }
    return mejor;
  }

  private datosEdificio(p: Poli): DatosEdificio {
    const m = p.meta, c = this.interiorDe(p), u = dePlano(c.x, c.y), anillo: number[] = [];
    for (let i = 0; i < p.xy.length; i += 2) { const q = dePlano(p.xy[i], p.xy[i + 1]); anillo.push(q.lat, q.lon); }
    const t = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null), n = (v: unknown) => (typeof v === "number" && v > 0 ? v : null);
    const altoDm = n(m[2]);
    return {
      nombre: t(m[11]), pisos: n(m[4]), altura: altoDm ? altoDm / 10 : null, base: (Number(m[3]) || 0) / 10, calidad: Number(m[5]) || 0, anio: n(m[10]), arquitecto: t(m[14]),
      tipo: t(m[6]), patrimonio: m[12] === 1, wikipedia: t(m[15]), lat: u.lat, lon: u.lon, anillo,
    };
  }

  /** Edificio en un punto. Con `hasta`, el primero que cruza esa línea (un toque en pantalla). */
  async edificio(a: Punto, hasta?: Punto | null): Promise<DatosEdificio | null> {
    const A = aPlano(a.lon, a.lat), B = hasta ? aPlano(hasta.lon, hasta.lat) : A, L = Math.hypot(A.x - B.x, A.y - B.y), pasos = Math.ceil(L / 2);
    const lista = new Set<string>();
    for (let i = 0; i <= pasos; i++) {
      const f = pasos ? i / pasos : 0;
      lista.add(`${Math.floor((A.x + (B.x - A.x) * f) / M + BASE_X)}_${Math.floor((A.y + (B.y - A.y) * f) / M + BASE_Y)}`);
    }
    await Promise.all([...lista].map((k) => { const [x, y] = k.split("_").map(Number); return this.tile(x, y); }));
    for (let i = 0; i <= pasos; i++) {
      const f = pasos ? i / pasos : 0, p = this.edificioEn(A.x + (B.x - A.x) * f, A.y + (B.y - A.y) * f);
      if (p) return this.datosEdificio(p);
    }
    if (!hasta) {
      /* El punto del local suele quedar justo sobre la línea de frente */
      for (const r of [3, 7, 12]) for (let k = 0; k < 8; k++) {
        const p = this.edificioEn(A.x + Math.cos((k * Math.PI) / 4) * r, A.y + Math.sin((k * Math.PI) / 4) * r);
        if (p) return this.datosEdificio(p);
      }
    }
    return null;
  }

  /** Datos reales publicados de un lugar, para la recepción. */
  async lugar(a: Punto, nombre: string): Promise<DatosLugar | null> {
    const t = z16DeLonLat(a.lon, a.lat), tx = Math.floor(t.x), ty = Math.floor(t.y);
    const ts = (await Promise.all([[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].map(([i, j]) => this.tile(tx + i, ty + j)))).filter(Boolean) as TileRed[];
    const n = nombre.trim().toLowerCase();
    let mejor: { f: (string | number)[]; d: number; t: TileRed } | null = null;
    for (const q of ts) for (const f of q.lugares) {
      const u = lonLatDeZ16(q.x + Number(f[0]) / EXT, q.y + Number(f[1]) / EXT), d = distanciaM(a, u), igual = String(f[2]).trim().toLowerCase() === n;
      if (igual ? d < 140 : false) { if (!mejor || d < mejor.d) mejor = { f, d, t: q }; }
    }
    if (!mejor) return null;
    const f = mejor.f, u = lonLatDeZ16(mejor.t.x + Number(f[0]) / EXT, mejor.t.y + Number(f[1]) / EXT), s = (i: number) => (String(f[i] ?? "").trim() || null);
    return { nombre: String(f[2]), lat: u.lat, lon: u.lon, categoria: s(3), telefono: s(4), web: s(5), red: s(6), whatsapp: s(7), horario: s(8), direccion: s(9) };
  }

  private async tilesCerca(a: Punto, radio: number) {
    const t = z16DeLonLat(a.lon, a.lat), r = radio / M, l: [number, number][] = [];
    for (let x = Math.floor(t.x - r); x <= Math.floor(t.x + r); x++) for (let y = Math.floor(t.y - r); y <= Math.floor(t.y + r); y++) l.push([x, y]);
    return this.bajarTodos(l);
  }

  private cercanoDe(q: TileRed, f: (string | number)[], a: Punto): Cercano {
    const u = lonLatDeZ16(q.x + Number(f[0]) / EXT, q.y + Number(f[1]) / EXT), cat = String(f[3] ?? "");
    return { nombre: String(f[2]), categoria: describirCategoria(cat).nombre, categoriaCruda: cat || undefined, direccion: String(f[9] ?? ""), ...u, dist: distanciaM(a, u), abierto: f[8] ? abiertoAhora(String(f[8])) : null };
  }

  /** Lo más cercano de un filtro. Sin dato no aparece: nunca se completa con suposiciones. */
  async filtro(id: IdFiltro, a: Punto, radio = 1000, tope = 14): Promise<Cercano[]> {
    const def = FILTROS.find((f) => f.id === id), out: Cercano[] = [];
    if (id === "abierto") {
      for (const q of await this.tilesCerca(a, 700)) for (const f of q.lugares) {
        if (!f[8] || !f[2]) continue;
        const c = this.cercanoDe(q, f, a);
        if (c.abierto === true && c.dist < 800) out.push(c);
      }
    } else {
      const ix = await this.indiceBuscar();
      if (ix && def?.r) for (const f of ix.filas) {
        if (!f[2] || !def.r.test(f[3])) continue;
        const u = lonLatDeZ16(f[0], f[1]), dist = distanciaM(a, u);
        if (dist < radio) out.push({ nombre: f[2], categoria: describirCategoria(f[3]).nombre, categoriaCruda: f[3], direccion: f[4], ...u, dist });
      }
      if (id === "cajero") for (const q of await this.tilesCerca(a, 500)) for (const o of q.cajeros) {
        const u = lonLatDeZ16(q.x + Number(o[1]) / EXT, q.y + Number(o[2]) / EXT), dist = distanciaM(a, u);
        if (dist < radio) out.push({ nombre: String(o[3] || "Cajero"), categoria: "Cajero", direccion: "", ...u, dist });
      }
    }
    out.sort((p, q) => p.dist - q.dist);
    const limpio: Cercano[] = [];
    for (const c of out) {
      if (limpio.some((v) => distanciaM(v, c) < 60 && normalizar(v.nombre) === normalizar(c.nombre))) continue;
      limpio.push(c);
      if (limpio.length >= tope) break;
    }
    return limpio;
  }

  /** Cruces y semáforos cerca, para el recordatorio de mirar el camino. */
  async cruces(a: Punto): Promise<Punto[]> {
    const out: Punto[] = [];
    for (const q of await this.tilesCerca(a, 120)) for (const c of q.cruces) {
      const u = lonLatDeZ16(q.x + c[0] / EXT, q.y + c[1] / EXT);
      if (distanciaM(a, u) < 170) out.push(u);
    }
    return out;
  }

  /** Dónde estás parado: calle, altura, barrio y qué hay en la cuadra. Solo lo que está en los datos. */
  async cuadra(a: Punto): Promise<Cuadra> {
    const ts = await this.tilesCerca(a, 110), P = aPlano(a.lon, a.lat);
    let calle: string | null = null, mejor = 34, altura: string | null = null, dNum = 32;
    for (const q of ts) {
      for (const v of q.vias) {
        if (!v.nombre || !RUTAS_AUTO.has(v.clase)) continue;
        for (let i = 2; i + 1 < v.pts.length; i += 2) {
          const ax = v.pts[i - 2], ay = v.pts[i - 1], dx = v.pts[i] - ax, dy = v.pts[i + 1] - ay, l = dx * dx + dy * dy || 1;
          const t = Math.max(0, Math.min(1, ((P.x - ax) * dx + (P.y - ay) * dy) / l)), d = Math.hypot(ax + dx * t - P.x, ay + dy * t - P.y);
          if (d < mejor) { mejor = d; calle = v.nombre; }
        }
      }
      for (const n of q.numeros) {
        const d = distanciaM(a, lonLatDeZ16(q.x + Number(n[0]) / EXT, q.y + Number(n[1]) / EXT));
        if (d < dNum && n[2]) { dNum = d; altura = String(n[2]); }
      }
    }
    let barrio: string | null = null;
    if (await this.asegurarCalles()) {
      const x = wx(a.lon), y = wy(a.lat);
      barrio = barrioDe(x, y) || null;
      if (!calle) {
        const m = enganchar(x, y) as { e: number } | null, g = G as unknown as { names: string[]; en: Int32Array };
        if (m) calle = g.names[g.en[m.e]] || null;
      }
    }
    const lugares: Cercano[] = [];
    for (const q of ts) for (const f of q.lugares) {
      if (!f[2]) continue;
      const c = this.cercanoDe(q, f, a);
      if (c.dist < 95 && !lugares.some((v) => normalizar(v.nombre) === normalizar(c.nombre))) lugares.push(c);
    }
    lugares.sort((p, q) => p.dist - q.dist);
    return { calle, altura, barrio, lugares: lugares.slice(0, 12) };
  }

  /* ───────── Mini mapa ───────── */
  async vias(a: Punto, radio: number): Promise<LineasMapa> {
    const t = z16DeLonLat(a.lon, a.lat), r = Math.ceil(radio / M), C = aPlano(a.lon, a.lat), lista: [number, number][] = [];
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) lista.push([Math.floor(t.x) + i, Math.floor(t.y) + j]);
    const ts = await this.bajarTodos(lista), calles: number[] = [], avs: number[] = [], vistas = new Set<string>();
    const sumar = (destino: number[], p: ArrayLike<number>, dx = 0, dy = 0) => {
      for (let i = 0; i < p.length; i += 2) destino.push(p[i] - dx, p[i + 1] - dy);
      destino.push(NaN, NaN);
    };
    for (const q of ts) for (const v of q.vias) {
      if (!RUTAS_AUTO.has(v.clase)) continue;
      const k = `${v.nombre}|${v.pts[0]}|${v.pts[1]}`;
      if (vistas.has(k)) continue;
      vistas.add(k);
      sumar(/^(primary|secondary|trunk|motorway)/.test(v.clase) ? avs : calles, v.pts, C.x, C.y);
    }
    if (!ts.length && (await this.asegurarCalles())) {
      const g = G as unknown as { E: number; ep: Float32Array[]; ec: Uint8Array };
      for (let e = 0; e < g.E; e++) {
        const p = g.ep[e], u = aPlano(alon(p[0]), alat(p[1]));
        if (Math.abs(u.x - C.x) > radio * 1.6 || Math.abs(u.y - C.y) > radio * 1.6) continue;
        const q: number[] = [];
        for (let i = 0; i < p.length; i += 2) { const w = aPlano(alon(p[i]), alat(p[i + 1])); q.push(w.x, w.y); }
        sumar(g.ec[e] === 1 ? avs : calles, q, C.x, C.y);
      }
    }
    return { calles: Float32Array.from(calles), avenidas: Float32Array.from(avs) };
  }

  /* ───────── Paseo guiado ───────── */
  async paseo(a: Punto, cuantas = 5): Promise<Parada[]> {
    const ix = await this.indiceBuscar();
    if (!ix) return [];
    const r = /^tourism:(museum|attraction|artwork|gallery)|^historic|museum|historic_site|public_plaza|^park$|leisure:park|theatre|place_of_worship|monument|art_gallery|cultural_center/i;
    const peso = (c: string) => (/museum|attraction|historic_site|monument/.test(c) ? 3 : /theatre|art_gallery|cultural/.test(c) ? 2 : 1);
    const cand: (Parada & { p: number })[] = [];
    for (const f of ix.filas) {
      if (!f[2] || !r.test(f[3]) || f[3] === "historic:tomb") continue;
      const u = lonLatDeZ16(f[0], f[1]), d = distanciaM(a, u);
      if (d > 1400 || d < 40) continue;
      cand.push({ nombre: f[2], categoria: f[3], lat: u.lat, lon: u.lon, direccion: f[4], p: peso(f[3]) - d / 900 });
    }
    cand.sort((x, y) => y.p - x.p);
    const elegidas: typeof cand = [];
    for (const c of cand) {
      if (elegidas.some((e) => distanciaM(e, c) < 160)) continue;
      elegidas.push(c);
      if (elegidas.length >= cuantas) break;
    }
    /* Vecino más cercano: el paseo no va y vuelve */
    const orden: Parada[] = [];
    let actual: Punto = a;
    while (elegidas.length) {
      elegidas.sort((x, y) => distanciaM(actual, x) - distanciaM(actual, y));
      const e = elegidas.shift()!;
      orden.push({ nombre: e.nombre, categoria: e.categoria, lat: e.lat, lon: e.lon, direccion: e.direccion });
      actual = e;
    }
    return orden;
  }
}
