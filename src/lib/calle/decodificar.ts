/* Pasa un tile de datos de la ciudad (ver herramientas/ciudad/DATOS.md) a estructuras simples,
   en metros relativos a la esquina del tile, e indexadas por celda. No toca Three ni el DOM. */
import { DIV, hash } from "./geo";

export interface Edif {
  id: number;
  anillo: number[]; // x,z en sentido normalizado (normal afuera = (dz,-dx))
  h: number;
  minH: number;
  pisos: number;
  calidad: number;
  tipo: string;
  techo: string;
  color: string;
  material: string;
  ano: number;
  nombre: string;
  patrimonio: boolean;
  colorTecho: string;
  /** Centroide en metros del tile. Es el mismo en todos los tiles que traen el edificio. */
  cx: number;
  cz: number;
  area: number;
  caja: [number, number, number, number];
  hash: number;
  /** Tramos ya tomados por locales o puertas en cada pared: pared → [desde, hasta]. */
  ocupado: Map<number, [number, number][]>;
  /** 0 pared de calle, 1 ciega, 2 tapada (no se dibuja), 3 contrafrente o patio. */
  oculta?: Uint8Array;
  /** Lo reemplaza un edificio singular. */
  omitir?: boolean;
}

export interface Via {
  id: number; clase: string; nombre: string; pts: number[];
  /** Medio ancho de calzada y ancho de vereda, en metros. */
  hw: number; acera: number;
  /** 1 va en el sentido de los puntos, -1 al revés, 0 doble mano. */
  sentido: number;
  carriles: number;
  auto: boolean; peaton: boolean; tunel: boolean; puente: boolean; capa: number;
  superficie: string; ciclo: number; bus: boolean; vereda: boolean; escalera: boolean; plataforma: boolean; estaciona: boolean;
  caja: [number, number, number, number];
}
export interface Poi { x: number; z: number; nombre: string; categoria: string; telefono: string; web: string; red: string; whatsapp: string; horario: string; direccion: string }
export interface Puerta { x: number; z: number; num: string; tipo: string }
export interface Objeto { tipo: string; x: number; z: number; detalle: string }
export interface Cruce { x: number; z: number; tipo: string }
export type TipoArea = "parque" | "pasto" | "bosque" | "agua" | "cancha" | "juegos" | "cementerio" | "arena" | "canil" | "obra" | "playa" | "balasto" | "terreno" | "arbustos" | "plazaseca";
export interface Poligono { tipo: TipoArea; anillos: number[][]; caja: [number, number, number, number] }

interface Indice { edifs: Edif[]; vias: Via[]; polis: Poligono[]; pois: Poi[]; objetos: Objeto[]; cruces: Cruce[] }

export interface TileDatos {
  tx: number; ty: number; m: number;
  edifs: Edif[]; vias: Via[]; pois: Poi[]; puertas: Puerta[]; objetos: Objeto[]; cruces: Cruce[]; polis: Poligono[];
  celdas: Indice[];
  grillaEdif: Map<number, Edif[]>;
  grillaVia: Map<number, { v: Via; ax: number; az: number; bx: number; bz: number }[]>;
  /** Lo calcula celda.ts una sola vez por tile. */
  preparado?: unknown;
}

export const BUCKET_EDIF = 24;
export const BUCKET_VIA = 32;
const MIN_PISO = 2.5;

/** Medio ancho de calzada mínimo y vereda por clase, a ojo de lo que se ve en CABA. */
const CLASES: Record<string, [number, number]> = {
  motorway: [5.6, 0], motorway_link: [3.4, 0], trunk: [6.4, 3.4], trunk_link: [3.4, 0], primary: [6.2, 3.6], primary_link: [3.4, 2.5], secondary: [5.4, 3.3], secondary_link: [3.4, 2.5],
  tertiary: [4.8, 3.1], tertiary_link: [3.2, 2.5], unclassified: [4.2, 2.8], residential: [4.2, 2.9], living_street: [3.1, 1.8], service: [2.3, 0], busway: [3.4, 0], road: [4, 2.5],
};
const PEATON: Record<string, number> = { footway: 0.8, path: 0.8, pedestrian: 3.5, cycleway: 1.1, track: 1.4, steps: 1, bridleway: 1 };

export function cajaDe(p: number[]): [number, number, number, number] {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (let i = 0; i < p.length; i += 2) {
    if (p[i] < a) a = p[i];
    if (p[i] > c) c = p[i];
    if (p[i + 1] < b) b = p[i + 1];
    if (p[i + 1] > d) d = p[i + 1];
  }
  return [a, b, c, d];
}

/** Sutherland-Hodgman contra un rectángulo. Sirve también con polígonos cóncavos para rellenar. */
export function recortar(p: number[], x0: number, z0: number, x1: number, z1: number): number[] {
  let sal = p;
  for (let lado = 0; lado < 4; lado++) {
    const ent = sal;
    sal = [];
    const n = ent.length / 2;
    if (!n) break;
    const dentro = (x: number, z: number) => (lado === 0 ? x >= x0 : lado === 1 ? x <= x1 : lado === 2 ? z >= z0 : z <= z1);
    for (let i = 0; i < n; i++) {
      const ax = ent[i * 2], az = ent[i * 2 + 1], j = (i + 1) % n, bx = ent[j * 2], bz = ent[j * 2 + 1];
      const da = dentro(ax, az), db = dentro(bx, bz);
      if (da) sal.push(ax, az);
      if (da !== db) {
        const t = lado < 2 ? ((lado === 0 ? x0 : x1) - ax) / (bx - ax) : ((lado === 2 ? z0 : z1) - az) / (bz - az);
        sal.push(ax + (bx - ax) * t, az + (bz - az) * t);
      }
    }
  }
  return sal;
}

export function area2(p: number[]) {
  let a = 0;
  const n = p.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += p[i * 2] * p[j * 2 + 1] - p[j * 2] * p[i * 2 + 1];
  }
  return a;
}
export function dentroDe(p: number[], x: number, z: number) {
  let c = false;
  const n = p.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const zi = p[i * 2 + 1], zj = p[j * 2 + 1];
    if (zi > z !== zj > z && x < ((p[j * 2] - p[i * 2]) * (z - zi)) / (zj - zi) + p[i * 2]) c = !c;
  }
  return c;
}

function celdasDeCaja(c: readonly number[], m: number, margen: number, f: (i: number) => void) {
  const k = DIV / m;
  const a = Math.max(0, Math.floor((c[0] - margen) * k)), b = Math.max(0, Math.floor((c[1] - margen) * k));
  const d = Math.min(DIV - 1, Math.floor((c[2] + margen) * k)), e = Math.min(DIV - 1, Math.floor((c[3] + margen) * k));
  for (let z = b; z <= e; z++) for (let x = a; x <= d; x++) f(z * DIV + x);
}

/** Centroide por áreas: da igual en cualquier tile porque el redondeo de los enteros es el mismo. */
function centroide(p: number[], a2: number): [number, number] {
  let cx = 0, cz = 0;
  const n = p.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, k = p[i * 2] * p[j * 2 + 1] - p[j * 2] * p[i * 2 + 1];
    cx += (p[i * 2] + p[j * 2]) * k;
    cz += (p[i * 2 + 1] + p[j * 2 + 1]) * k;
  }
  return [cx / (3 * a2), cz / (3 * a2)];
}

const num = (v: unknown) => {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

type Fila = (string | number | number[] | Record<string, string> | null)[];
interface TileCrudo { e?: Fila[]; l?: Fila[]; o?: Fila[]; p?: Fila[]; k?: Fila[]; v?: Fila[]; a?: [string, number[][]][] }

function leerVia(f: Fila, k: number): Via | null {
  const clase = String(f[1]), extra = (f[4] ?? {}) as Record<string, string>;
  const auto = clase in CLASES, peaton = clase in PEATON, riel = clase.startsWith("rail:"), muro = clase.startsWith("muro:");
  const plataforma = clase === "platform" || clase === "rail:platform";
  if (!auto && !peaton && !riel && !muro && !plataforma) return null;
  if (riel && !plataforma && !/^rail:(rail|tram|light_rail|subway|narrow_gauge)$/.test(clase)) return null;
  const tunel = extra.tunnel != null && extra.tunnel !== "no", puente = extra.bridge != null && extra.bridge !== "no";
  if (extra.location === "underground") return null;
  const pts = (f[3] as number[]).map((v) => v * k);
  if (pts.length < 4) return null;
  const [hw0, ac0] = CLASES[clase] ?? [PEATON[clase] ?? 1, 0];
  const onewayY = extra.oneway === "yes" || extra.oneway === "1", onewayN = extra.oneway === "-1";
  const lanes = num(extra.lanes), width = num(extra.width);
  const sentido = onewayY ? 1 : onewayN ? -1 : 0;
  let hw = hw0, acera = ac0, carriles = lanes || (hw0 > 5.8 ? 3 : 2);
  if (auto) {
    if (width >= 3) hw = width / 2;
    else if (lanes) hw = Math.max(hw0 * (sentido ? 0.85 : 1), lanes * (sentido ? 1.68 : 1.62));
    if (clase === "service") { hw = Math.max(2.3, width / 2); carriles = 1; }
  } else if (peaton) {
    if (width >= 0.6) hw = Math.min(8, width / 2);
  }
  const sw = extra.sidewalk;
  if (sw === "no" || sw === "none") acera = 0;
  const cl = `${extra.cycleway ?? ""}${extra["cycleway:left"] ?? ""}${extra["cycleway:right"] ?? ""}`;
  return {
    id: Number(f[0]), clase, nombre: String(f[2] ?? ""), pts, hw, acera, sentido, carriles, auto, peaton, tunel, puente,
    capa: num(extra.layer), superficie: String(extra.surface ?? ""), ciclo: /lane|track|separate/.test(cl) ? 1 : 0, bus: extra.busway != null && extra.busway !== "no" || clase === "busway",
    vereda: extra.footway === "sidewalk", escalera: clase === "steps", plataforma, estaciona: !/^(no|separate)/.test(extra["parking:both"] ?? ""), caja: cajaDe(pts),
  };
}

export function tileDeJson(d: TileCrudo, tx: number, ty: number, m: number): TileDatos {
  const t: TileDatos = {
    tx, ty, m, edifs: [], vias: [], pois: [], puertas: [], objetos: [], cruces: [], polis: [],
    celdas: Array.from({ length: DIV * DIV }, () => ({ edifs: [], vias: [], polis: [], pois: [], objetos: [], cruces: [] })),
    grillaEdif: new Map(), grillaVia: new Map(),
  };
  const k = m / 10000;
  const celdaDe = (x: number, z: number) => Math.max(0, Math.min(DIV - 1, Math.floor((z * DIV) / m))) * DIV + Math.max(0, Math.min(DIV - 1, Math.floor((x * DIV) / m)));

  for (const f of d.e ?? []) {
    try {
      let an = (f[1] as number[]).map((v) => v * k);
      if (an.length < 6) continue;
      let ar = area2(an);
      if (Math.abs(ar) < 4) continue;
      if (ar < 0) {
        const inv: number[] = [];
        for (let j = an.length - 2; j >= 0; j -= 2) inv.push(an[j], an[j + 1]);
        an = inv;
        ar = -ar;
      }
      /* Normal afuera = (dz,-dx): si queda al revés se invierte */
      if (!normalAfuera(an)) {
        const inv: number[] = [];
        for (let j = an.length - 2; j >= 0; j -= 2) inv.push(an[j], an[j + 1]);
        an = inv;
      }
      const [cx, cz] = centroide(an, area2(an));
      const h = Math.max(2.6, Number(f[2]) / 10), minH = Math.max(0, Number(f[3]) / 10), id = Number(f[0]);
      const caja = cajaDe(an);
      const e: Edif = {
        id, anillo: an, h, minH, pisos: Math.max(1, Math.min(Number(f[4]) || 1, Math.floor((h - minH) / MIN_PISO) || 1)), calidad: Number(f[5]), tipo: String(f[6] ?? ""), techo: String(f[7] ?? ""),
        color: String(f[8] ?? ""), material: String(f[9] ?? ""), ano: Number(f[10]) || 0, nombre: String(f[11] ?? ""), patrimonio: !!f[12], colorTecho: String(f[13] ?? ""),
        cx, cz, area: ar / 2, caja, hash: hash(id, 7), ocupado: new Map(),
      };
      t.edifs.push(e);
      celdasDeCaja(caja, m, 3, (c) => t.celdas[c].edifs.push(e));
      const g0 = Math.floor(caja[0] / BUCKET_EDIF), g1 = Math.floor(caja[2] / BUCKET_EDIF), g2 = Math.floor(caja[1] / BUCKET_EDIF), g3 = Math.floor(caja[3] / BUCKET_EDIF);
      for (let gz = g2; gz <= g3; gz++) for (let gx = g0; gx <= g1; gx++) {
        const c = (gz + 64) * 4096 + gx + 64, l = t.grillaEdif.get(c);
        if (l) l.push(e); else t.grillaEdif.set(c, [e]);
      }
    } catch { /* una fila rara no tira el tile */ }
  }

  for (const f of d.v ?? []) {
    try {
      const v = leerVia(f, k);
      if (!v) continue;
      t.vias.push(v);
      celdasDeCaja(v.caja, m, v.hw + v.acera + 14, (c) => t.celdas[c].vias.push(v));
      if (!v.auto && !v.peaton) continue;
      const p = v.pts;
      for (let j = 0; j + 3 < p.length; j += 2) {
        const ax = p[j], az = p[j + 1], bx = p[j + 2], bz = p[j + 3], paso = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 16)), vistos = new Set<number>();
        for (let s = 0; s <= paso; s++) {
          const q = s / paso, c = (Math.floor((az + (bz - az) * q) / BUCKET_VIA) + 64) * 4096 + Math.floor((ax + (bx - ax) * q) / BUCKET_VIA) + 64;
          if (vistos.has(c)) continue;
          vistos.add(c);
          const lista = t.grillaVia.get(c), e = { v, ax, az, bx, bz };
          if (lista) lista.push(e); else t.grillaVia.set(c, [e]);
        }
      }
    } catch { /* idem */ }
  }

  for (const f of d.l ?? []) {
    const x = Number(f[0]) * k, z = Number(f[1]) * k, nombre = String(f[2] ?? "").trim();
    if (!nombre) continue;
    const p: Poi = { x, z, nombre, categoria: String(f[3] ?? ""), telefono: String(f[4] ?? ""), web: String(f[5] ?? ""), red: String(f[6] ?? ""), whatsapp: String(f[7] ?? ""), horario: String(f[8] ?? ""), direccion: String(f[9] ?? "") };
    t.pois.push(p);
    t.celdas[celdaDe(x, z)].pois.push(p);
  }
  for (const f of d.o ?? []) {
    const o: Objeto = { tipo: String(f[0]), x: Number(f[1]) * k, z: Number(f[2]) * k, detalle: String(f[3] ?? "") };
    t.objetos.push(o);
    t.celdas[celdaDe(o.x, o.z)].objetos.push(o);
  }
  for (const f of d.k ?? []) {
    const c: Cruce = { x: Number(f[0]) * k, z: Number(f[1]) * k, tipo: String(f[2] ?? "") };
    t.cruces.push(c);
    t.celdas[celdaDe(c.x, c.z)].cruces.push(c);
  }
  for (const f of d.p ?? []) {
    const tipo = String(f[3] ?? "numero");
    if (tipo === "no") continue;
    t.puertas.push({ x: Number(f[0]) * k, z: Number(f[1]) * k, num: String(f[2] ?? ""), tipo });
  }
  for (const a of d.a ?? []) {
    const anillos = a[1].map((r) => r.map((v) => v * k)).filter((r) => r.length >= 6);
    if (!anillos.length) continue;
    const p: Poligono = { tipo: a[0] as TipoArea, anillos, caja: cajaDe(anillos[0]) };
    t.polis.push(p);
    celdasDeCaja(p.caja, m, 1, (c) => t.celdas[c].polis.push(p));
  }
  return t;
}

/** Comprueba con el vértice extremo si la normal (dz,-dx) apunta para afuera. */
function normalAfuera(p: number[]) {
  let i = 0;
  const n = p.length / 2;
  for (let j = 1; j < n; j++) if (p[j * 2] < p[i * 2]) i = j;
  const a = (i + 1) % n, ax = p[a * 2], az = p[a * 2 + 1], bx = p[i * 2], bz = p[i * 2 + 1];
  const dx = ax - bx, dz = az - bz, L = Math.hypot(dx, dz) || 1;
  const mx = (ax + bx) / 2 + (dz / L) * 0.02, mz = (az + bz) / 2 - (dx / L) * 0.02;
  return !dentroDe(p, mx, mz);
}

/** Descomprime con lo que dé el navegador; si el servidor ya lo mandó descomprimido, lo usa tal cual. */
export async function textoDeTile(buf: ArrayBuffer): Promise<string> {
  const b = new Uint8Array(buf);
  if (!(b[0] === 0x1f && b[1] === 0x8b)) return new TextDecoder().decode(b);
  if (typeof DecompressionStream !== "undefined") {
    const s = new Blob([b]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Response(s).text();
  }
  const { gunzipSync } = await import("three/examples/jsm/libs/fflate.module.js");
  return new TextDecoder().decode(gunzipSync(b));
}

export async function decodificarTile(buf: ArrayBuffer | null, tx: number, ty: number, m: number): Promise<TileDatos> {
  if (!buf || !buf.byteLength) return tileDeJson({}, tx, ty, m);
  return tileDeJson(JSON.parse(await textoDeTile(buf)) as TileCrudo, tx, ty, m);
}
