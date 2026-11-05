/* Buscador de lugares: índice de palabras, tolerante a tildes y a errores de tipeo. Sin DOM: corre en el worker. */
import { describirCategoria } from "./categoria-lugar";
import { distanciaM, lonLatDeZ16, type Punto } from "./ciudad";

export type FilaBuscar = [number, number, string, string, string];

export interface Resultado {
  tipo: "lugar" | "dir";
  nombre: string;
  categoria: string;
  direccion: string;
  lat: number;
  lon: number;
  dist: number | null;
  categoriaCruda?: string;
}

export interface Indice {
  filas: FilaBuscar[];
  /** Palabras únicas ordenadas: permite buscar por prefijo con búsqueda binaria. */
  palabras: string[];
  /** Por palabra, en qué filas aparece. */
  filasDe: Int32Array[];
  nombres: string[];
  /** Palabras que nombran un rubro: "farmacia", "café"... Si buscás eso, querés el más cercano. */
  rubros: Set<string>;
}

export const normalizar = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9ñ ]+/g, " ").replace(/\s+/g, " ").trim();
const VACIAS = new Set(["de", "la", "el", "los", "las", "del", "y", "en", "al", "a"]);
const tokens = (s: string) => normalizar(s).split(" ").filter((t) => t && !VACIAS.has(t));

export function crearIndice(filas: FilaBuscar[]): Indice {
  const mapa = new Map<string, number[]>(), nombres: string[] = new Array(filas.length), rubros = new Set<string>();
  filas.forEach((f, i) => {
    nombres[i] = normalizar(f[2]);
    const cat = describirCategoria(f[3]).nombre, tc = tokens(cat === "Lugar" ? "" : cat);
    tc.forEach((t) => rubros.add(t));
    for (const t of new Set([...tokens(f[2]), ...tc])) {
      const l = mapa.get(t);
      if (l) l.push(i); else mapa.set(t, [i]);
    }
  });
  const palabras = [...mapa.keys()].sort();
  return { filas, palabras, filasDe: palabras.map((p) => Int32Array.from(mapa.get(p)!)), nombres, rubros };
}

/** Levenshtein con banda: corta apenas supera el máximo. */
export function editar(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let ant = new Array<number>(b.length + 1), act = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) ant[j] = j;
  for (let i = 1; i <= a.length; i++) {
    act[0] = i;
    let mejor = i;
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(ant[j] + 1, act[j - 1] + 1, ant[j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, ant[j - 2 < 0 ? 0 : j - 2] + c);
      act[j] = v;
      if (v < mejor) mejor = v;
    }
    if (mejor > max) return max + 1;
    [ant, act] = [act, ant];
  }
  return ant[b.length];
}

/** Índices de palabras que empiezan con `p`. */
function rangoPrefijo(ps: string[], p: string): [number, number] {
  let lo = 0, hi = ps.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (ps[m] < p) lo = m + 1; else hi = m; }
  const ini = lo;
  hi = ps.length;
  const fin = p + "￿";
  while (lo < hi) { const m = (lo + hi) >> 1; if (ps[m] < fin) lo = m + 1; else hi = m; }
  return [ini, lo];
}

/** Para un término: fila → puntaje (1 exacto … 0,4 con error). */
function coincidencias(ix: Indice, t: string): Map<number, number> {
  const out = new Map<number, number>();
  const sumar = (w: number, v: number) => { const f = ix.filasDe[w]; for (let i = 0; i < f.length; i++) if ((out.get(f[i]) ?? 0) < v) out.set(f[i], v); };
  const [a, b] = rangoPrefijo(ix.palabras, t);
  for (let w = a; w < b; w++) sumar(w, ix.palabras[w] === t ? 1 : 0.75);
  if (t.length >= 4 && out.size < 60) {
    const max = t.length >= 8 ? 2 : 1, c0 = t[0];
    for (let w = 0; w < ix.palabras.length; w++) {
      const p = ix.palabras[w];
      if (p[0] !== c0 && max < 2) continue;
      if (Math.abs(p.length - t.length) > max) continue;
      const d = editar(t, p, max);
      if (d <= max) sumar(w, d === 1 ? 0.55 : 0.4);
    }
  }
  return out;
}

export function buscarEn(ix: Indice, q: string, ref: Punto | null, tope = 8): Resultado[] {
  const ts = tokens(q);
  if (!ts.length) return [];
  const conjuntos = ts.map((t) => coincidencias(ix, t)).sort((a, b) => a.size - b.size);
  const nq = normalizar(q), cand: { i: number; p: number; d: number | null }[] = [];
  const esRubro = !!ref && ts.length === 1 && [...ix.rubros].some((r) => editar(ts[0], r, ts[0].length >= 6 ? 1 : 0) <= 1);
  for (const [i, p0] of conjuntos[0]) {
    let p = p0, vale = true;
    for (let k = 1; k < conjuntos.length && vale; k++) {
      const v = conjuntos[k].get(i);
      if (v == null) vale = false; else p += v;
    }
    if (!vale) continue;
    p /= ts.length;
    const n = ix.nombres[i];
    if (n === nq) p += 1; else if (n.startsWith(nq)) p += 0.5; else if (n.includes(nq)) p += 0.25;
    cand.push({ i, p, d: null });
  }
  if (!cand.length) return [];
  /* Cerca pesa: entre dos iguales gana el más cercano, y lo lejano solo pierde un poco */
  const pos = (i: number) => lonLatDeZ16(ix.filas[i][0], ix.filas[i][1]);
  for (const c of cand) {
    if (!ref) continue;
    const u = pos(c.i);
    c.d = distanciaM(ref, u);
    c.p -= Math.min(0.5, c.d / 16000);
  }
  if (esRubro) cand.sort((a, b) => (a.d ?? 0) - (b.d ?? 0));
  else cand.sort((a, b) => b.p - a.p || (a.d ?? 0) - (b.d ?? 0));
  const out: Resultado[] = [];
  for (const c of cand) {
    const f = ix.filas[c.i], u = pos(c.i);
    /* La misma cosa suele venir de OSM y de Overture */
    if (out.some((r) => normalizar(r.nombre) === ix.nombres[c.i] && distanciaM(r, u) < 90)) continue;
    out.push({ tipo: "lugar", nombre: f[2], categoria: describirCategoria(f[3]).nombre, categoriaCruda: f[3] || undefined, direccion: f[4], lat: u.lat, lon: u.lon, dist: c.d });
    if (out.length >= tope) break;
  }
  return out;
}

export const textoDistancia = (m: number | null | undefined) => m == null ? "" : m < 950 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(m < 9950 ? 1 : 0).replace(".", ",")} km`;
