/* Pasa un tile vectorial de OpenFreeMap (esquema OpenMapTiles) a estructuras simples, en metros
   relativos a la esquina del tile, e indexadas por celda. No toca Three ni el DOM. */
import { VectorTile, classifyRings } from "@mapbox/vector-tile";
import Pbf from "pbf";
import { DIV, hash } from "./geo";

export interface Edif {
  id: number;
  anillo: number[]; // x,z en sentido normalizado (normal afuera = (dz,-dx))
  borde: boolean[]; // la arista i está sobre el corte del tile: no lleva pared
  h: number;
  minH: number;
  cx: number;
  cz: number;
  caja: [number, number, number, number];
  hash: number;
  ocupado: Map<number, [number, number][]>;
  oculta?: Uint8Array; // 0 pared normal, 1 ciega, 2 no se dibuja
}
export interface Via { clase: string; sentido: number; pts: number[]; hw: number; acera: number; tunel: boolean; caja: [number, number, number, number]; id: number }
export interface NombreVia { nombre: string; pts: number[] }
export interface Poi { x: number; z: number; nombre: string; clase: string; subclase: string; rank: number }
export interface Puerta { x: number; z: number; num: string }
export interface Poligono { tipo: "parque" | "pasto" | "bosque" | "agua" | "arena"; anillos: number[][]; caja: [number, number, number, number] }

interface Indice { edifs: Edif[]; vias: Via[]; polis: Poligono[]; pois: Poi[] }

export interface TileDatos {
  tx: number;
  ty: number;
  m: number;
  edifs: Edif[];
  vias: Via[];
  nombres: NombreVia[];
  pois: Poi[];
  puertas: Puerta[];
  polis: Poligono[];
  celdas: Indice[];
  grillaEdif: Map<number, Edif[]>;
  grillaNombre: Map<number, { n: NombreVia; ax: number; az: number; bx: number; bz: number }[]>;
}

/* Ancho de calzada y de vereda por clase (metros), a ojo de lo que se ve en CABA. */
const ANCHOS: Record<string, [number, number]> = {
  motorway: [9.5, 0], trunk: [8.5, 4], primary: [7.5, 4.5], secondary: [6.5, 4], tertiary: [5.2, 3.5], minor: [4.4, 3.2],
  service: [2.4, 0], track: [1.6, 0], path: [1.0, 0], busway: [3.5, 0], rail: [1.3, 0], transit: [1.3, 0],
};
export const BUCKET_EDIF = 24;

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

function celdasDeCaja(c: [number, number, number, number], m: number, margen: number, f: (i: number) => void) {
  const k = DIV / m;
  const a = Math.max(0, Math.floor((c[0] - margen) * k)), b = Math.max(0, Math.floor((c[1] - margen) * k));
  const d = Math.min(DIV - 1, Math.floor((c[2] + margen) * k)), e = Math.min(DIV - 1, Math.floor((c[3] + margen) * k));
  for (let z = b; z <= e; z++) for (let x = a; x <= d; x++) f(z * DIV + x);
}

function anilloPlano(r: { x: number; y: number }[], k: number): number[] {
  const p: number[] = [];
  const n = r.length - (r.length > 1 && r[0].x === r[r.length - 1].x && r[0].y === r[r.length - 1].y ? 1 : 0);
  for (let i = 0; i < n; i++) p.push(r[i].x * k, r[i].y * k);
  return p;
}

export function decodificarTile(buf: ArrayBuffer | null, tx: number, ty: number, m: number): TileDatos {
  const t: TileDatos = {
    tx, ty, m, edifs: [], vias: [], nombres: [], pois: [], puertas: [], polis: [],
    celdas: Array.from({ length: DIV * DIV }, () => ({ edifs: [], vias: [], polis: [], pois: [] })),
    grillaEdif: new Map(), grillaNombre: new Map(),
  };
  if (!buf || !buf.byteLength) return t;
  const vt = new VectorTile(new Pbf(new Uint8Array(buf)));

  /* Edificios: nos quedamos solo con el anillo de afuera (los patios no se ven desde la calle)
     y lo cortamos en el borde del tile, para que no se duplique con el tile vecino. */
  const b = vt.layers.building;
  if (b) {
    const k = m / b.extent;
    for (let i = 0; i < b.length; i++) {
      const f = b.feature(i);
      if (f.type !== 3 || f.properties.hide_3d === true) continue;
      const h = Math.max(3, Number(f.properties.render_height) || 5);
      const minH = Math.max(0, Number(f.properties.render_min_height) || 0);
      for (const poli of classifyRings(f.loadGeometry())) {
        let an = anilloPlano(poli[0], k);
        if (an.length < 6) continue;
        const caja0 = cajaDe(an);
        if (caja0[0] < 0 || caja0[1] < 0 || caja0[2] > m || caja0[3] > m) an = recortar(an, 0, 0, m, m);
        if (an.length < 6) continue;
        let ar = area2(an);
        if (Math.abs(ar) < 8) continue;
        if (ar < 0) {
          const inv: number[] = [];
          for (let j = an.length - 2; j >= 0; j -= 2) inv.push(an[j], an[j + 1]);
          an = inv;
          ar = -ar;
        }
        const n = an.length / 2;
        let cx = 0, cz = 0;
        for (let j = 0; j < n; j++) { cx += an[j * 2]; cz += an[j * 2 + 1]; }
        cx /= n; cz /= n;
        const borde: boolean[] = [];
        const e = 0.01;
        for (let j = 0; j < n; j++) {
          const q = (j + 1) % n, ax = an[j * 2], az = an[j * 2 + 1], bx = an[q * 2], bz = an[q * 2 + 1];
          borde.push((ax < e && bx < e) || (az < e && bz < e) || (ax > m - e && bx > m - e) || (az > m - e && bz > m - e));
        }
        const caja = cajaDe(an);
        const ed: Edif = { id: (f.id ?? i) as number, anillo: an, borde, h, minH, cx, cz, caja, hash: hash((f.id ?? i) as number, i), ocupado: new Map() };
        t.edifs.push(ed);
        celdasDeCaja(caja, m, 3, (c) => t.celdas[c].edifs.push(ed));
        const g0 = Math.floor(caja[0] / BUCKET_EDIF), g1 = Math.floor(caja[2] / BUCKET_EDIF), g2 = Math.floor(caja[1] / BUCKET_EDIF), g3 = Math.floor(caja[3] / BUCKET_EDIF);
        for (let gz = g2; gz <= g3; gz++) for (let gx = g0; gx <= g1; gx++) {
          const c = gz * 4096 + gx, l = t.grillaEdif.get(c);
          if (l) l.push(ed); else t.grillaEdif.set(c, [ed]);
        }
      }
    }
  }

  const tr = vt.layers.transportation;
  if (tr) {
    const k = m / tr.extent;
    for (let i = 0; i < tr.length; i++) {
      const f = tr.feature(i);
      if (f.type !== 2) continue;
      const cl = String(f.properties.class || ""), base = cl.replace(/_construction$/, "");
      if (cl.endsWith("_construction") || cl === "ferry" || cl === "cable_car" || cl === "bridge" || cl === "pier") continue;
      const tunel = f.properties.brunnel === "tunnel";
      if (tunel) continue;
      const sub = String(f.properties.subclass || "");
      const [hw0, ac0] = ANCHOS[base] ?? ANCHOS.minor;
      let hw = hw0, acera = ac0;
      if (Number(f.properties.ramp) === 1) { hw = 3.2; acera = 0; }
      if (base === "path" && sub === "pedestrian") { hw = 4; acera = 0; }
      if (base === "path" && sub === "steps") continue;
      if (f.properties.oneway && (base === "primary" || base === "trunk") && hw > 6) hw *= 0.9;
      for (const l of f.loadGeometry()) {
        const pts: number[] = [];
        for (const p of l) pts.push(p.x * k, p.y * k);
        if (pts.length < 4) continue;
        const caja = cajaDe(pts);
        const v: Via = { clase: base === "path" && sub === "pedestrian" ? "peatonal" : base, sentido: Number(f.properties.oneway) || 0, pts, hw, acera, tunel, caja, id: t.vias.length };
        t.vias.push(v);
        celdasDeCaja(caja, m, hw + acera + 12, (c) => t.celdas[c].vias.push(v));
      }
    }
  }

  const tn = vt.layers.transportation_name;
  if (tn) {
    const k = m / tn.extent;
    for (let i = 0; i < tn.length; i++) {
      const f = tn.feature(i), nombre = String(f.properties.name || "").trim();
      if (!nombre || f.type !== 2 || f.properties.brunnel === "tunnel") continue;
      for (const l of f.loadGeometry()) {
        const pts: number[] = [];
        for (const p of l) pts.push(p.x * k, p.y * k);
        const nv = { nombre, pts };
        t.nombres.push(nv);
        for (let j = 0; j + 3 < pts.length; j += 2) {
          const ax = pts[j], az = pts[j + 1], bx = pts[j + 2], bz = pts[j + 3];
          const paso = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 16));
          const vistos = new Set<number>();
          for (let s = 0; s <= paso; s++) {
            const q = s / paso, c = Math.floor((az + (bz - az) * q) / 32) * 4096 + Math.floor((ax + (bx - ax) * q) / 32);
            if (vistos.has(c)) continue;
            vistos.add(c);
            const lista = t.grillaNombre.get(c), e = { n: nv, ax, az, bx, bz };
            if (lista) lista.push(e); else t.grillaNombre.set(c, [e]);
          }
        }
      }
    }
  }

  const po = vt.layers.poi;
  if (po) {
    const k = m / po.extent;
    for (let i = 0; i < po.length; i++) {
      const f = po.feature(i), nombre = String(f.properties.name || "").trim();
      if (!nombre || f.type !== 1) continue;
      const g = f.loadGeometry()[0]?.[0];
      if (!g) continue;
      const x = g.x * k, z = g.y * k;
      if (x < 0 || z < 0 || x >= m || z >= m) continue; // está en el borde compartido: lo trae el tile vecino
      const p: Poi = { x, z, nombre, clase: String(f.properties.class || ""), subclase: String(f.properties.subclass || ""), rank: Number(f.properties.rank) || 99 };
      t.pois.push(p);
      t.celdas[Math.floor((z * DIV) / m) * DIV + Math.floor((x * DIV) / m)].pois.push(p);
    }
  }

  const hn = vt.layers.housenumber;
  if (hn) {
    const k = m / hn.extent;
    for (let i = 0; i < hn.length; i++) {
      const f = hn.feature(i), g = f.loadGeometry()[0]?.[0];
      if (g && f.properties.housenumber) t.puertas.push({ x: g.x * k, z: g.y * k, num: String(f.properties.housenumber) });
    }
  }

  const poligonos = (capa: string, tipo: (p: Record<string, unknown>) => Poligono["tipo"] | null) => {
    const c = vt.layers[capa];
    if (!c) return;
    const k = m / c.extent;
    for (let i = 0; i < c.length; i++) {
      const f = c.feature(i);
      if (f.type !== 3) continue;
      const ti = tipo(f.properties);
      if (!ti) continue;
      for (const poli of classifyRings(f.loadGeometry())) {
        const anillos = poli.map((r) => anilloPlano(r, k)).filter((r) => r.length >= 6);
        if (!anillos.length) continue;
        const po2: Poligono = { tipo: ti, anillos, caja: cajaDe(anillos[0]) };
        t.polis.push(po2);
        celdasDeCaja(po2.caja, m, 1, (i2) => t.celdas[i2].polis.push(po2));
      }
    }
  };
  poligonos("landcover", (p) => {
    const cl = String(p.class);
    return cl === "wood" ? "bosque" : cl === "grass" ? "pasto" : cl === "sand" ? "arena" : cl === "wetland" ? "pasto" : null;
  });
  poligonos("park", () => "parque");
  poligonos("water", (p) => (p.brunnel === "tunnel" ? null : "agua"));
  return t;
}
