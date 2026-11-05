/* Arma una celda (unos 170 m de lado) a partir de un tile decodificado.
   Corre en el worker, y si no hay worker en el hilo principal. No toca Three ni el DOM. */
import { Earcut } from "three/src/extras/Earcut.js";
import { clasificar, abreviarCalle } from "./categorias";
import { DIV, hash, hexARgb } from "./geo";
import { BUCKET_EDIF, BUCKET_VIA, dentroDe, recortar, type Edif, type Poi, type TileDatos, type Via } from "./decodificar";
import { M_CHAPA_TECHO, M_LOSA, M_MEDIANERA, M_PIZARRA, M_TEJA, M_TERRAZA, estiloDe, zonaDe, type Estilo } from "./fachada";
import { singularesDe, type Bloque } from "./singulares";
import { ALTO_VEREDA, armarMapa, distCalzada, distPared, distSenda } from "./suelo";
import * as P from "./piezas";
import type { Cartel, CeldaDatos, Local, LoteKit, LoteProp, Rubro, Singular, ViaTrafico } from "./tipos";

type C3 = readonly [number, number, number];
type C4 = readonly [number, number, number, number];

/* Tipos de suelo: los mismos números que usa el shader */
export const S_BASE = 0, S_PASTO = 1, S_PARQUE = 2, S_BOSQUE = 3, S_AGUA = 4, S_ARENA = 5, S_CANCHA = 6, S_JUEGOS = 7, S_CEMENTERIO = 8,
  S_CANIL = 9, S_MARCA = 10, S_SOMBRA = 11, S_LUZ = 12, S_PARCHE = 13, S_ADOQUIN = 14, S_TAPA = 15, S_TIERRA = 16, S_BUS = 17, S_BICI = 18, S_BALASTO = 19, S_RIEL = 20,
  S_PLAYA = 21, S_PLAZA = 22, S_TERRENO = 23, S_RAMPA = 24, S_REJILLA = 25, S_CANTERO = 26;

class Capa {
  pos: number[] = [];
  col: number[] = [];
  mat: number[] = [];
  idx: number[] = [];
  v(x: number, y: number, z: number, c: C4, tipo: number, a = 0, b = 0) {
    const i = this.pos.length / 3;
    this.pos.push(x, y, z);
    this.col.push(c[0], c[1], c[2], c[3]);
    this.mat.push(tipo, a, b, 0);
    return i;
  }
  q(a: number, b: number, c: number, d: number) { this.idx.push(a, b, c, a, c, d); }
}

class MallaD {
  pos: number[] = [];
  uv: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  private v(x: number, y: number, z: number, u: number, w: number, n: number[], c: readonly number[], k: number) {
    this.pos.push(x, y, z);
    this.uv.push(u, w);
    this.nor.push(n[0], n[1], n[2]);
    this.col.push(c[0], c[1], c[2], k);
  }
  /** Cuadrilátero en orden: abajo-izq, abajo-der, arriba-der, arriba-izq, visto de frente. */
  q(a: number[], b: number[], c: number[], d: number[], n: number[], uv: number[], col: readonly number[], k: number) {
    const i = this.pos.length / 3, nb = n.map((v) => Math.round(v * 127));
    this.v(a[0], a[1], a[2], uv[0], uv[1], nb, col, k);
    this.v(b[0], b[1], b[2], uv[2], uv[1], nb, col, k);
    this.v(c[0], c[1], c[2], uv[2], uv[3], nb, col, k);
    this.v(d[0], d[1], d[2], uv[0], uv[3], nb, col, k);
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
}

class Kit {
  m: number[][] = Array.from({ length: P.N_KIT }, () => []);
  c: number[][] = Array.from({ length: P.N_KIT }, () => []);
  /** r = derecha del que mira la pared de frente, n = afuera. Posición en coordenadas de celda. */
  poner(p: number, x: number, y: number, z: number, rx: number, rz: number, nx: number, nz: number, sx: number, sy: number, sz: number, c: readonly number[]) {
    this.m[p].push(rx * sx, 0, rz * sx, 0, 0, sy, 0, 0, nx * sz, 0, nz * sz, 0, x, y, z, 1);
    this.c[p].push(c[0] / 255, c[1] / 255, c[2] / 255);
  }
  lotes(siempre = false): LoteKit[] {
    const s: LoteKit[] = [];
    for (let p = 0; p < P.N_KIT; p++) if (this.m[p].length) s.push({ pieza: p, m: new Float32Array(this.m[p]), c: new Float32Array(this.c[p]), siempre });
    return s;
  }
}

function enEdif(t: TileDatos, x: number, z: number, excl?: Edif): Edif | null {
  const l = t.grillaEdif.get((Math.floor(z / BUCKET_EDIF) + 64) * 4096 + Math.floor(x / BUCKET_EDIF) + 64);
  if (!l) return null;
  for (const e of l) {
    if (e === excl || x < e.caja[0] || x > e.caja[2] || z < e.caja[1] || z > e.caja[3]) continue;
    if (dentroDe(e.anillo, x, z)) return e;
  }
  return null;
}

/** La calle con coche más cercana a un punto. */
function viaCerca(t: TileDatos, x: number, z: number, radio: number, soloAuto = true, dx = 0, dz = 0) {
  const c0 = Math.floor(x / BUCKET_VIA), f0 = Math.floor(z / BUCKET_VIA), a = Math.ceil(radio / BUCKET_VIA);
  let mejor: { v: Via; d: number; px: number; pz: number; dx: number; dz: number } | null = null, md = radio;
  for (let f = f0 - a; f <= f0 + a; f++) for (let c = c0 - a; c <= c0 + a; c++) {
    const l = t.grillaVia.get((f + 64) * 4096 + c + 64);
    if (!l) continue;
    for (const s of l) {
      if (soloAuto && !s.v.auto) continue;
      const sx = s.bx - s.ax, sz = s.bz - s.az, L2 = sx * sx + sz * sz;
      if (!L2) continue;
      if ((dx || dz) && Math.abs(sx * dx + sz * dz) / Math.sqrt(L2) < 0.8) continue;
      const q = Math.max(0, Math.min(1, ((x - s.ax) * sx + (z - s.az) * sz) / L2)), px = s.ax + sx * q, pz = s.az + sz * q, d = Math.hypot(x - px, z - pz) - (soloAuto ? s.v.hw : 0);
      if (d < md) { md = d; const L = Math.sqrt(L2); mejor = { v: s.v, d, px, pz, dx: sx / L, dz: sz / L }; }
    }
  }
  return mejor;
}

function nombreCalle(t: TileDatos, x: number, z: number, radio: number, dx = 0, dz = 0): string | null {
  const c0 = Math.floor(x / BUCKET_VIA), f0 = Math.floor(z / BUCKET_VIA);
  let mejor: string | null = null, md = radio;
  for (let f = f0 - 1; f <= f0 + 1; f++) for (let c = c0 - 1; c <= c0 + 1; c++) {
    const l = t.grillaVia.get((f + 64) * 4096 + c + 64);
    if (!l) continue;
    for (const s of l) {
      if (!s.v.nombre || !s.v.auto) continue;
      const sx = s.bx - s.ax, sz = s.bz - s.az, L2 = sx * sx + sz * sz;
      if (!L2) continue;
      if ((dx || dz) && Math.abs(sx * dx + sz * dz) / Math.sqrt(L2) < 0.8) continue;
      const q = Math.max(0, Math.min(1, ((x - s.ax) * sx + (z - s.az) * sz) / L2)), d = Math.hypot(x - s.ax - sx * q, z - s.az - sz * q);
      if (d < md) { md = d; mejor = s.v.nombre; }
    }
  }
  return mejor;
}

/** Para cada pared: 0 de calle, 1 medianera, 2 tapada por el vecino, 3 contrafrente o patio. */
function paredes(t: TileDatos, e: Edif): Uint8Array {
  if (e.oculta) return e.oculta;
  const a = e.anillo, n = a.length / 2, o = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, ax = a[i * 2], az = a[i * 2 + 1], bx = a[j * 2], bz = a[j * 2 + 1];
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
    if (L < 0.2) { o[i] = 2; continue; }
    const nx = dz / L, nz = -dx / L;
    let tapa = 0, alto = true;
    for (const f of [0.2, 0.5, 0.8]) {
      const v = enEdif(t, ax + dx * f + nx * 1, az + dz * f + nz * 1, e);
      if (v && v.minH < 2.5) { tapa++; if (v.h < e.h - 0.5) alto = false; } else alto = false;
    }
    if (tapa === 3 && alto) { o[i] = 2; continue; }
    /* Da a la calle si mirando afuera hay calle enseguida y va más o menos paralela a la pared */
    const mx = ax + dx * 0.5, mz = az + dz * 0.5;
    const calle = viaCerca(t, mx + nx * 7, mz + nz * 7, 11) ?? viaCerca(t, mx + nx * 2, mz + nz * 2, 8);
    const frente = !!calle && Math.abs(calle.dx * dx + calle.dz * dz) / L > 0.35;
    if (frente && tapa <= 1) { o[i] = 0; continue; }
    if (tapa > 0) { o[i] = 1; continue; }
    o[i] = frente || L <= 3 ? 0 : 3;
  }
  e.oculta = o;
  return o;
}

interface FrenteLocal { p: Poi; rubro: Rubro; e: Edif; i: number; s: number; w: number; L: number }
interface PuertaEdif { i: number; s: number; num: string }
interface Preparado { frentes: FrenteLocal[][]; puertas: Map<Edif, PuertaEdif[]>; singulares: Bloque[]; zona: number }

/** Ubica una sola vez por tile los locales y las puertas sobre las paredes, para que dos celdas no se pisen. */
function preparar(t: TileDatos): Preparado {
  if (t.preparado) return t.preparado as Preparado;
  const frentes: FrenteLocal[][] = Array.from({ length: DIV * DIV }, () => []), puertas = new Map<Edif, PuertaEdif[]>();
  const celdaDe = (x: number, z: number) => Math.max(0, Math.min(DIV - 1, Math.floor((z * DIV) / t.m))) * DIV + Math.max(0, Math.min(DIV - 1, Math.floor((x * DIV) / t.m)));
  const singulares = singularesDe(t, enEdif, viaCerca);
  const candidatas = (x: number, z: number, radio: number) => {
    const c: { e: Edif; i: number; d: number; q: number; L: number }[] = [], vistos = new Set<Edif>();
    const b0 = Math.floor(x / BUCKET_EDIF), b1 = Math.floor(z / BUCKET_EDIF), a = Math.ceil(radio / BUCKET_EDIF);
    for (let f = b1 - a; f <= b1 + a; f++) for (let g = b0 - a; g <= b0 + a; g++) for (const e of t.grillaEdif.get((f + 64) * 4096 + g + 64) ?? []) {
      if (vistos.has(e) || e.minH > 1 || e.omitir) continue;
      vistos.add(e);
      const an = e.anillo, n = an.length / 2, oc = paredes(t, e);
      for (let i = 0; i < n; i++) {
        if (oc[i] !== 0) continue;
        const j = (i + 1) % n, ax = an[i * 2], az = an[i * 2 + 1], dx = an[j * 2] - ax, dz = an[j * 2 + 1] - az, L = Math.hypot(dx, dz);
        if (L < 2.4) continue;
        const q = Math.max(0, Math.min(L, ((x - ax) * dx + (z - az) * dz) / L)), d = Math.hypot(x - ax - (dx / L) * q, z - az - (dz / L) * q);
        if (d < radio) c.push({ e, i, d, q, L });
      }
    }
    return c.sort((u, v) => u.d - v.d);
  };

  /* Primero las puertas reales, después los locales alrededor */
  for (const p of t.puertas) {
    const c = candidatas(p.x, p.z, 14)[0];
    if (!c) continue;
    const l = puertas.get(c.e) ?? [];
    if (l.some((q) => q.i === c.i && Math.abs(q.s - c.q) < 3.2)) continue;
    l.push({ i: c.i, s: c.q, num: p.num });
    puertas.set(c.e, l);
  }
  const visto = new Set<string>();
  for (const p of t.pois) {
    const rubro = clasificar(p.categoria);
    if (!rubro) continue;
    const llave = `${p.nombre}|${Math.round(p.x / 8)}|${Math.round(p.z / 8)}`;
    if (visto.has(llave)) continue;
    visto.add(llave);
    const w0 = Math.min(8, Math.max(4.2, 3.2 + p.nombre.length * 0.22));
    for (const k of candidatas(p.x, p.z, 26).slice(0, 8)) {
      const w = Math.min(w0, k.L - 0.3), lista = k.e.ocupado.get(k.i) ?? [], lo = w / 2 + 0.15, hi = k.L - w / 2 - 0.15;
      let s = -1;
      for (const off of [0, w + 0.2, -(w + 0.2), 2 * (w + 0.2), -2 * (w + 0.2)]) {
        const c = Math.max(lo, Math.min(hi, k.q + off));
        if (lista.every(([x, y]) => c + w / 2 + 0.12 < x || c - w / 2 - 0.12 > y)) { s = c; break; }
      }
      if (s < 0) continue;
      lista.push([s - w / 2, s + w / 2]);
      k.e.ocupado.set(k.i, lista);
      frentes[celdaDe(p.x, p.z)].push({ p, rubro, e: k.e, i: k.i, s, w, L: k.L });
      break;
    }
  }
  const prep: Preparado = { frentes, puertas, singulares, zona: zonaDe(t.tx + 0.5, t.ty + 0.5) };
  t.preparado = prep;
  return prep;
}

const PARED_LOTE: C3[] = [[196, 188, 170], [176, 170, 158], [204, 190, 160], [168, 160, 150], [190, 178, 164]];
const PINTURAS = [[0.85, 0.86, 0.84], [0.17, 0.18, 0.21], [0.62, 0.65, 0.67], [0.6, 0.2, 0.18], [0.18, 0.34, 0.6], [0.91, 0.89, 0.85], [0.4, 0.44, 0.48], [0.1, 0.12, 0.14], [0.75, 0.77, 0.78], [0.3, 0.17, 0.15]];

const ESPECIES: [RegExp, number][] = [[/tipu/i, P.A_TIPA], [/jacaranda/i, P.A_JACARANDA], [/ficus/i, P.A_GOMERO], [/phoenix|palm|syagrus|washingtonia/i, P.A_PALMERA], [/ceiba|chorisia/i, P.A_PALO_BORRACHO], [/fraxinus|fresno/i, P.A_FRESNO], [/platanus|plátano|platano/i, P.A_PLATANO]];
const especieDe = (d: string, sem: number) => {
  for (const [r, e] of ESPECIES) if (r.test(d)) return e;
  return sem < 0.34 ? P.A_PLATANO : sem < 0.6 ? P.A_FRESNO : sem < 0.84 ? P.A_TIPA : P.A_JACARANDA;
};

const PROP_OBJ: Record<string, number> = {
  banco: P.P_BANCO, cesto: P.P_CESTO, contenedor: P.P_CONTENEDOR, reciclado: P.P_RECICLADO, fuente: P.P_FUENTE, bicis: P.P_BICIS, ecobici: P.P_ECOBICI, buzon: P.P_BUZON, telefono: P.P_TELEFONO,
  posta: P.P_POSTA, mesa: P.P_MESA, maceta: P.P_MACETA, publicidad: P.P_PUBLICIDAD, subte: P.P_SUBTE, arte: P.P_ESTATUA, monumento: P.P_ESTATUA, hidrante: P.P_HIDRANTE, gabinete: P.P_GABINETE, bolardo: P.P_BOLARDO, cajero: P.P_CAJERO, bebedero: P.P_BEBEDERO, reloj: P.P_RELOJ, farola: P.P_FAROL_PLAZA, parada: P.P_PARADA,
};

export function armarCelda(t: TileDatos, gx: number, gy: number): CeldaDatos {
  const cx = gx - t.tx * DIV, cy = gy - t.ty * DIV, C = t.m / DIV, ox = cx * C, oz = cy * C;
  const ind = t.celdas[cy * DIV + cx], prep = preparar(t);
  const adentro = (x: number, z: number) => x >= ox && x < ox + C && z >= oz && z < oz + C;
  const mapa = armarMapa(ind.vias, ind.edifs, ox, oz, C);
  const suelo = new Capa(), det = new MallaD(), kit = new Kit(), fijo = new Kit();
  const eP: number[] = [], eU: number[] = [], eV: number[] = [], eE: number[] = [], eN: number[] = [], eC: number[] = [], eI: number[] = [];
  const colision: number[] = [], tramos: number[] = [], nombres: string[] = [];
  const locales: Local[] = [], carteles: Cartel[] = [], vias: ViaTrafico[] = [], singulares: Singular[] = [];
  const props: number[][] = Array.from({ length: P.N_PROPS }, () => []), arboles: number[] = [];
  const prop = (tipo: number, x: number, y: number, z: number, giro: number, esc = 1, a = 1, b = 1, c = 1) => props[tipo].push(x - ox, y, z - oz, giro, esc, a, b, c);
  const altoEn = (x: number, z: number) => (distCalzada(mapa, x, z) > 0 ? ALTO_VEREDA : 0);

  /* Atlas de carteles de la celda */
  const MAX_SLOTS = 56;
  let slot = 0;
  function pedirSlot(c: Omit<Cartel, "slot">) {
    if (slot >= MAX_SLOTS) return -1;
    carteles.push({ ...c, slot });
    return slot++;
  }
  const uvSlot = (s: number): number[] => {
    if (s < 0) return [0, 0, 0, 0];
    const f = Math.floor(s / 2);
    return [(s % 2) * 0.5 + 0.003, f + 1, ((s % 2) + 1) * 0.5 - 0.003, f];
  };
  const pendientesUv: { i0: number; n: number }[] = [];
  function conUvAtlas(f: () => void) { const i0 = det.uv.length / 2; f(); pendientesUv.push({ i0, n: det.uv.length / 2 - i0 }); }

  /* ───────── Suelo ───────── */
  const CERO: C4 = [0, 0, 0, 255];
  {
    const a = suelo.v(0, 0, 0, CERO, S_BASE), b = suelo.v(C, 0, 0, CERO, S_BASE), c = suelo.v(C, 0, C, CERO, S_BASE), d = suelo.v(0, 0, C, CERO, S_BASE);
    suelo.q(a, d, c, b);
  }
  const orden: Record<string, number> = { terreno: 0, obra: 0, balasto: 0, playa: 0, arena: 1, arbustos: 2, pasto: 2, parque: 3, bosque: 4, cementerio: 4, plazaseca: 5, cancha: 6, juegos: 6, canil: 6, agua: 7 };
  const TIPO_AREA: Record<string, number> = {
    arena: S_ARENA, cancha: S_CANCHA, juegos: S_JUEGOS, pasto: S_PASTO, arbustos: S_PASTO, parque: S_PARQUE, bosque: S_BOSQUE, cementerio: S_CEMENTERIO, agua: S_AGUA, canil: S_CANIL,
    obra: S_TERRENO, terreno: S_TERRENO, playa: S_PLAYA, balasto: S_BALASTO, plazaseca: S_PLAZA,
  };
  const polis = [...ind.polis].sort((a, b) => orden[a.tipo] - orden[b.tipo]);
  for (const p of polis) {
    const plano: number[] = [], huecos: number[] = [];
    let mal = false;
    p.anillos.forEach((r, i) => {
      const q = recortar(r, ox, oz, ox + C, oz + C);
      if (q.length < 6) { if (!i) mal = true; return; }
      if (i) huecos.push(plano.length / 2);
      for (const v of q) plano.push(v);
    });
    if (mal || plano.length < 6) continue;
    const tri = Earcut.triangulate(plano, huecos, 2), base = suelo.pos.length / 3, c4: C4 = [0, 0, 0, 255];
    for (let i = 0; i < plano.length; i += 2) suelo.v(plano[i] - ox, ALTO_VEREDA, plano[i + 1] - oz, c4, TIPO_AREA[p.tipo] ?? S_PASTO);
    for (let i = 0; i < tri.length; i += 3) suelo.idx.push(base + tri[i], base + tri[i + 2], base + tri[i + 1]);
  }

  /* Una tira a lo largo de una polilínea, a un costado del eje si hace falta */
  const tira = (p: number[], of: number, hw: number, y: number, col: C4, tipo: number, a = 0, u0 = 0) => {
    let s = u0;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3], L = Math.hypot(bx - ax, bz - az);
      if (L < 0.01) continue;
      const m = hw + Math.abs(of) + 1;
      if (Math.max(ax, bx) < ox - m || Math.min(ax, bx) > ox + C + m || Math.max(az, bz) < oz - m || Math.min(az, bz) > oz + C + m) { s += L; continue; }
      const nx = -(bz - az) / L, nz = (bx - ax) / L, x0 = ax + nx * of - ox, z0 = az + nz * of - oz, x1 = bx + nx * of - ox, z1 = bz + nz * of - oz;
      const p0 = suelo.v(x0 + nx * hw, y, z0 + nz * hw, col, tipo, a), p1 = suelo.v(x1 + nx * hw, y, z1 + nz * hw, col, tipo, a), p2 = suelo.v(x1 - nx * hw, y, z1 - nz * hw, col, tipo, a), p3 = suelo.v(x0 - nx * hw, y, z0 - nz * hw, col, tipo, a);
      suelo.q(p0, p3, p2, p1);
      s += L;
    }
  };
  /* Rectángulo orientado en el suelo */
  const rect = (x: number, z: number, y: number, dx: number, dz: number, largo: number, ancho: number, col: C4, tipo: number, a = 0) => {
    const nx = -dz, nz = dx, X = x - ox, Z = z - oz;
    const p0 = suelo.v(X - dx * largo + nx * ancho, y, Z - dz * largo + nz * ancho, col, tipo, a), p1 = suelo.v(X + dx * largo + nx * ancho, y, Z + dz * largo + nz * ancho, col, tipo, a);
    const p2 = suelo.v(X + dx * largo - nx * ancho, y, Z + dz * largo - nz * ancho, col, tipo, a), p3 = suelo.v(X - dx * largo - nx * ancho, y, Z - dz * largo - nz * ancho, col, tipo, a);
    suelo.q(p0, p3, p2, p1);
  };
  /* Mancha redonda que se apaga hacia el borde */
  const mancha = (x: number, y: number, z: number, r: number, col: C4, tipo: number, an = 1) => {
    const cen = suelo.v(x - ox, y, z - oz, col, tipo, 255), n = 10, o = suelo.pos.length / 3;
    for (let i = 0; i < n; i++) { const g = (i / n) * Math.PI * 2; suelo.v(x - ox + Math.cos(g) * r * an, y, z - oz + Math.sin(g) * r, col, tipo, 0); }
    for (let i = 0; i < n; i++) suelo.idx.push(cen, o + ((i + 1) % n), o + i);
  };

  const BLANCO: C4 = [236, 232, 220, 255], AMARILLO: C4 = [222, 176, 52, 255];
  for (const v of ind.vias) {
    if (v.tunel) continue;
    if (v.clase.startsWith("rail:") && !v.puente) {
      tira(v.pts, 0, 1.6, 0, [120, 110, 100, 255], S_BALASTO);
      for (const s of [-0.72, 0.72]) tira(v.pts, s, 0.05, 0, [150, 150, 152, 255], S_RIEL);
      continue;
    }
    if (!v.auto || v.puente) {
      if (v.clase === "cycleway" && !v.puente) tira(v.pts, 0, Math.max(v.hw, 1.05), ALTO_VEREDA, [66, 64, 66, 255], S_BICI);
      continue;
    }
    if (/cobblestone|sett|paving_stones|unhewn/.test(v.superficie)) tira(v.pts, 0, v.hw, 0, [112, 104, 96, 255], S_ADOQUIN);
    if (v.bus) tira(v.pts, 0, v.hw, 0, [150, 146, 138, 255], S_BUS);
  }

  /* Segmentos de calle cercanos, para esquinas, chequeos y nombres */
  interface Seg { ax: number; az: number; bx: number; bz: number; dx: number; dz: number; L: number; v: Via }
  const segs: Seg[] = [];
  for (const v of ind.vias) {
    if (!v.auto || v.tunel || v.puente) continue;
    for (let i = 0; i + 3 < v.pts.length; i += 2) {
      const ax = v.pts[i], az = v.pts[i + 1], bx = v.pts[i + 2], bz = v.pts[i + 3];
      if (Math.max(ax, bx) < ox - 14 || Math.min(ax, bx) > ox + C + 14 || Math.max(az, bz) < oz - 14 || Math.min(az, bz) > oz + C + 14) continue;
      const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
      if (L > 0.3) segs.push({ ax, az, bx, bz, dx: dx / L, dz: dz / L, L, v });
    }
  }
  const distSeg = (s: Seg, x: number, z: number) => {
    const q = Math.max(0, Math.min(s.L, (x - s.ax) * s.dx + (z - s.az) * s.dz));
    return Math.hypot(x - s.ax - s.dx * q, z - s.az - s.dz * q);
  };

  /* Esquinas: donde se cruzan dos calles de verdad */
  interface Brazo { dx: number; dz: number; hw: number; ac: number; clase: string; nombre: string | null }
  const hits: { x: number; z: number; d: Seg[] }[] = [];
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
    const a = segs[i], b = segs[j];
    if (a.v.id === b.v.id || a.v.clase === "service" || b.v.clase === "service") continue;
    const cr = a.dx * b.dz - a.dz * b.dx;
    if (Math.abs(cr) < 0.45) continue;
    const ex = b.ax - a.ax, ez = b.az - a.az, ta = (ex * b.dz - ez * b.dx) / cr, tb = (ex * a.dz - ez * a.dx) / cr;
    if (ta < -3 || ta > a.L + 3 || tb < -3 || tb > b.L + 3) continue;
    const x = a.ax + a.dx * ta, z = a.az + a.dz * ta;
    if (!adentro(x, z)) continue;
    const h = hits.find((q) => Math.hypot(q.x - x, q.z - z) < 11);
    if (h) h.d.push(a, b); else hits.push({ x, z, d: [a, b] });
  }
  const esquinas: { x: number; z: number; brazos: Brazo[] }[] = [];
  for (const h of hits) {
    const brazos: Brazo[] = [];
    for (const s of h.d) for (const sg of [1, -1]) {
      const dx = s.dx * sg, dz = s.dz * sg;
      if (brazos.some((b) => b.dx * dx + b.dz * dz > 0.85)) continue;
      const px = h.x + dx * 12, pz = h.z + dz * 12;
      if (!segs.some((q) => Math.abs(q.dx * dx + q.dz * dz) > 0.8 && distSeg(q, px, pz) < 3.5)) continue;
      brazos.push({ dx, dz, hw: s.v.hw, ac: s.v.acera, clase: s.v.clase, nombre: nombreCalle(t, h.x + dx * 6, h.z + dz * 6, 12, dx, dz) });
    }
    if (brazos.length >= 2) esquinas.push({ x: h.x, z: h.z, brazos });
  }
  const cercaEsquina = (x: number, z: number, m: number) => esquinas.some((e) => Math.hypot(e.x - x, e.z - z) < m);

  /* Marcas: carriles, doble línea, sendas peatonales gastadas y líneas de pare */
  for (const v of ind.vias) {
    if (!v.auto || v.tunel || v.puente || v.clase === "service" || /link/.test(v.clase)) continue;
    const pintado = v.hw >= 5 && v.clase !== "residential" && v.clase !== "living_street" && v.clase !== "unclassified";
    if (!pintado) continue;
    const carriles = Math.max(2, Math.min(5, Math.round((v.hw * 2) / 3.1)));
    let s = 0;
    for (let i = 0; i + 3 < v.pts.length; i += 2) {
      const ax = v.pts[i], az = v.pts[i + 1], bx = v.pts[i + 2], bz = v.pts[i + 3], L = Math.hypot(bx - ax, bz - az);
      if (L < 0.5) continue;
      if (Math.max(ax, bx) < ox - 2 || Math.min(ax, bx) > ox + C + 2 || Math.max(az, bz) < oz - 2 || Math.min(az, bz) > oz + C + 2) { s += L; continue; }
      const dx = (bx - ax) / L, dz = (bz - az) / L, nx = -dz, nz = dx;
      for (let q = Math.ceil(s / 9) * 9 - s; q < L; q += 9) {
        const fin = Math.min(L, q + 3.6);
        for (let c = 1; c < carriles; c++) {
          const of = -v.hw + ((v.hw * 2) / carriles) * c, doble = !v.sentido && c === carriles / 2;
          const x0 = ax + dx * q + nx * of, z0 = az + dz * q + nz * of;
          if (!adentro(x0, z0) || cercaEsquina(x0, z0, v.hw + 13)) continue;
          if (doble) rect(x0 + dx * 4.5, z0 + dz * 4.5, 0, dx, dz, 4.5, 0.06, AMARILLO, S_MARCA);
          else rect(x0 + dx * (fin - q) / 2, z0 + dz * (fin - q) / 2, 0, dx, dz, (fin - q) / 2, 0.06, BLANCO, S_MARCA);
        }
      }
      s += L;
    }
  }
  const cebra = (x: number, z: number, dx: number, dz: number, hw: number) => {
    /* Barras a lo largo de la calle, una al lado de la otra de cordón a cordón */
    const nx = -dz, nz = dx, n = Math.floor((hw * 2 - 0.6) / 1.05);
    for (let i = 0; i < n; i++) {
      const of = -hw + 0.3 + (hw * 2 - 0.6 - n * 1.05) / 2 + (i + 0.5) * 1.05;
      const bx = x + nx * of, bz = z + nz * of;
      if (adentro(bx, bz) || adentro(x, z)) rect(bx, bz, 0, dx, dz, 1.7, 0.3, BLANCO, S_MARCA, 1);
    }
  };
  const hechas: [number, number][] = [];
  for (const k of ind.cruces) {
    const c = viaCerca(t, k.x, k.z, 7);
    if (!c || c.v.clase === "service" || k.tipo === "unmarked" || c.v.tunel || c.v.puente) continue;
    if (hechas.some(([a, b]) => Math.hypot(a - c.px, b - c.pz) < 5)) continue;
    hechas.push([c.px, c.pz]);
    cebra(c.px, c.pz, c.dx, c.dz, c.v.hw);
  }
  for (const e of esquinas) for (const b of e.brazos) {
    if (b.clase === "motorway" || b.hw < 3.8) continue;
    let otro = 0;
    for (const o of e.brazos) if (Math.abs(o.dx * b.dx + o.dz * b.dz) < 0.75) otro = Math.max(otro, o.hw);
    const D = otro + 3.4, x = e.x + b.dx * D, z = e.z + b.dz * D;
    if (hechas.some(([a, c]) => Math.hypot(a - x, c - z) < 8)) continue;
    if (b.hw >= 4.8 || hash(Math.round(x), Math.round(z)) < 0.55) cebra(x, z, b.dx, b.dz, b.hw);
    if (b.hw >= 4.8) rect(e.x + b.dx * (D + 2.7), e.z + b.dz * (D + 2.7), 0, -b.dz, b.dx, b.hw - 0.3, 0.2, BLANCO, S_MARCA, 1);
  }

  /* Rampas en todas las esquinas: una calcomanía inclinada que baja la vereda y tapa el cordón */
  const rampa = (x: number, z: number, nx: number, nz: number) => {
    /* (nx,nz) apunta de la vereda a la calle */
    const tx = -nz, tz = nx, a = 0.75, f = 1.15, X = x - ox, Z = z - oz, col: C4 = [172, 168, 156, 255];
    const q0 = suelo.v(X + tx * a, 0.01, Z + tz * a, col, S_RAMPA), q1 = suelo.v(X - tx * a, 0.01, Z - tz * a, col, S_RAMPA);
    const q2 = suelo.v(X - tx * a - nx * f, ALTO_VEREDA, Z - tz * a - nz * f, col, S_RAMPA), q3 = suelo.v(X + tx * a - nx * f, ALTO_VEREDA, Z + tz * a - nz * f, col, S_RAMPA);
    suelo.q(q0, q1, q2, q3);
  };
  for (const e of esquinas) for (const b of e.brazos) {
    if (b.clase === "motorway") continue;
    let otro = 0;
    for (const o of e.brazos) if (Math.abs(o.dx * b.dx + o.dz * b.dz) < 0.75) otro = Math.max(otro, o.hw);
    const D = otro + 3.4, nx = -b.dz, nz = b.dx;
    for (const s of [1, -1]) {
      const x = e.x + b.dx * D + nx * s * (b.hw + 0.02), z = e.z + b.dz * D + nz * s * (b.hw + 0.02);
      const d = distCalzada(mapa, x, z);
      if (Math.abs(d) < 1.6 && adentro(x, z)) rampa(x, z, -nx * s, -nz * s);
      /* Boca de tormenta contra el cordón, un poco antes de la esquina */
      const gx = e.x + b.dx * (D + 4.5) + nx * s * (b.hw - 0.3), gz = e.z + b.dz * (D + 4.5) + nz * s * (b.hw - 0.3);
      if (adentro(gx, gz) && hash(Math.round(gx), Math.round(gz)) < 0.6) rect(gx, gz, 0, b.dx, b.dz, 0.5, 0.22, [40, 40, 42, 255], S_REJILLA);
    }
  }

  /* Parches de asfalto, tapas y bocas de tormenta */
  for (const v of ind.vias) {
    if (!v.auto || v.tunel || v.puente || v.clase === "service") continue;
    let s = 0;
    for (let i = 0; i + 3 < v.pts.length; i += 2) {
      const ax = v.pts[i], az = v.pts[i + 1], bx = v.pts[i + 2], bz = v.pts[i + 3], L = Math.hypot(bx - ax, bz - az);
      if (L < 1) continue;
      const dx = (bx - ax) / L, dz = (bz - az) / L, nx = -dz, nz = dx;
      for (let q = Math.ceil(s / 13) * 13 - s; q < L; q += 13) {
        const k = Math.round((s + q) / 13), r = hash(v.id, k), of = (hash(k, v.id) - 0.5) * (v.hw * 2 - 2), x = ax + dx * q + nx * of, z = az + dz * q + nz * of;
        if (!adentro(x, z) || cercaEsquina(x, z, v.hw + 2)) continue;
        if (r < 0.32) rect(x, z, 0, dx, dz, 0.9 + r * 7, 0.7 + hash(k, 3) * 1.1, [46, 45, 48, 255], S_PARCHE, Math.floor(r * 255));
      }
      s += L;
    }
  }

  /* ───────── Edificios ───────── */
  const quad = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx2: number, cy2: number, cz2: number, dx: number, dy: number, dz: number,
    u0: number, u1: number, y0: number, y1: number, piso: number, H: number, ven: readonly number[], est: readonly number[], nx: number, ny: number, nz: number, col: readonly number[], sem: number) => {
    const i = eP.length / 3;
    eP.push(ax - ox, ay, az - oz, bx - ox, by, bz - oz, cx2 - ox, cy2, cz2 - oz, dx - ox, dy, dz - oz);
    eU.push(u0, y0, piso, H, u1, y0, piso, H, u1, y1, piso, H, u0, y1, piso, H);
    const n = [Math.round(nx * 127), Math.round(ny * 127), Math.round(nz * 127), 0];
    for (let k = 0; k < 4; k++) { eV.push(ven[0], ven[1], ven[2], ven[3]); eE.push(est[0], est[1], est[2], est[3]); eN.push(n[0], n[1], n[2], n[3]); eC.push(col[0], col[1], col[2], sem); }
    eI.push(i, i + 2, i + 1, i, i + 3, i + 2);
  };
  const VEN0 = [1, 0, 0, 0], EST_LISO = [M_MEDIANERA, 0, 0, 0];

  const cajaEdif = (x: number, z: number, y0: number, y1: number, a: number, b: number, g: number, col: C3, mat: number, sem: number) => {
    /* Caja de techo: tanque, casilla */
    const cg = Math.cos(g), sg = Math.sin(g), P2 = (u: number, w: number): [number, number] => [x + cg * u - sg * w, z + sg * u + cg * w];
    const c = [P2(-a, -b), P2(-a, b), P2(a, b), P2(a, -b)], est = [mat, 0, 0, 0];
    for (let i = 0; i < 4; i++) {
      const p = c[i], q = c[(i + 1) % 4], dx = q[0] - p[0], dz = q[1] - p[1], L = Math.hypot(dx, dz) || 1;
      quad(p[0], y0, p[1], q[0], y0, q[1], q[0], y1, q[1], p[0], y1, p[1], 0, L, y0, y1, 3, y1, VEN0, est, dz / L, 0, -dx / L, col, sem);
    }
    const iy = [mat === M_MEDIANERA ? M_LOSA : mat, 0, 0, 0];
    quad(c[0][0], y1, c[0][1], c[3][0], y1, c[3][1], c[2][0], y1, c[2][1], c[1][0], y1, c[1][1], 0, 1, 0, 1, 3, y1, VEN0, iy, 0, 1, 0, col, sem);
  };

  const fachada = (e: Edif, es: Estilo, ax: number, az: number, bx: number, bz: number, y0: number, y1: number, ven: boolean, sem: number, conKit = true) => {
    const L = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L, dz = (bz - az) / L, nx = dz, nz = -dx, rx = -dx, rz = -dz;
    const n = Math.max(1, Math.round(L / es.bay)), bw = L / n;
    const est = [es.mat, es.moldura + 16 * es.persiana, es.balcon + 16 * es.cornisa, Math.min(255, Math.round(es.pb * 32))];
    quad(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az, 0, n, y0, y1, es.piso, e.h, [bw, ven ? es.vA : 0, es.v0, es.v1], est, nx, 0, nz, es.color, sem);
    if (!ven || !conKit) return;
    /* Kit de relieve: se ve solo de cerca. Los pisos altos casi no se distinguen: hasta 12 */
    const pisos = Math.floor((y1 - es.pb - 0.3) / es.piso + 0.3), P3 = (u: number, y: number, s: number): [number, number, number] => [ax + dx * u + nx * s - ox, y, az + dz * u + nz * s - oz];
    const cor = (y: number, alto: number, vuelo: number, pieza: number, col: C3) => { const [px, py, pz] = P3(L / 2, y, 0); kit.poner(pieza, px, py, pz, rx, rz, nx, nz, L + vuelo * 2, alto, vuelo, col); };
    const vidriada = es.familia === "oficina";
    if (!vidriada) {
      if (es.cornisa) {
        cor(y1 - (es.cornisa === 2 ? 0.75 : 0.45), es.cornisa === 2 ? 0.7 : 0.42, es.cornisa === 2 ? 0.48 : 0.28, P.K_CORNISA, es.acento);
        if (es.cornisa === 2) for (let u = 0.5; u < n; u += 0.5) { const [px, py, pz] = P3(u * bw, y1 - 1.05, 0); kit.poner(P.K_MENSULA, px, py, pz, rx, rz, nx, nz, 0.22, 0.34, 0.4, es.acento); }
      }
      /* Impostas entre pisos y sobre la planta baja */
      cor(es.pb - 0.18, 0.24, 0.1, P.K_CORNISA, es.acento);
      if (es.familia === "frances" && pisos > 2) cor(es.pb + es.piso * 2 - 0.1, 0.16, 0.05, P.K_CAJA, es.acento);
    }
    for (let ip = 0; ip < Math.min(pisos, 12); ip++) {
      const yp = es.pb + ip * es.piso;
      if (yp + es.piso > y1 + 0.2) break;
      const conBalcon = es.balcon > 0 && ip % es.balconCada === 0 && !(es.familia === "racionalista" && ip === pisos - 1);
      if (es.balcon === 3 && conBalcon && !vidriada) {
        const [px, py, pz] = P3(L / 2, yp - 0.16, 0);
        const a = L - 0.4, f = 1.25;
        kit.poner(P.K_CAJA, px, py, pz, rx, rz, nx, nz, a, 0.2, f, es.baranda === 2 ? es.color : es.acento);
        const [qx, qy, qz] = P3(L / 2, yp + 0.04, f - 0.06);
        if (es.baranda === 2) kit.poner(P.K_CAJA, qx, qy, qz, rx, rz, nx, nz, a, 1, 0.1, es.color);
        else kit.poner(es.baranda === 3 ? P.K_VIDRIO : P.K_CANO, qx, qy, qz, rx, rz, nx, nz, a, 1, 0.05, es.baranda === 3 ? es.acento : es.metal);
        for (const s of [-1, 1]) {
          const [sx, sy, sz] = P3(L / 2 + (s * a) / 2, yp + 0.04, 0.06);
          if (es.baranda === 2) kit.poner(P.K_CAJA, sx, sy, sz, nz, -nx, rx, rz, 1.1, 1, 0.08, es.color);
          else kit.poner(es.baranda === 3 ? P.K_VIDRIO : P.K_CANO, sx, sy, sz, s > 0 ? -nx : nx, s > 0 ? -nz : nz, s > 0 ? rx : -rx, s > 0 ? rz : -rz, 1.16, 1, 0.05, es.baranda === 3 ? es.acento : es.metal);
        }
      }
      for (let iu = 0; iu < n; iu++) {
        const u = (iu + 0.5) * bw, r = hash(e.id * 31 + iu * 7, ip + 3);
        if (!vidriada) {
          if (ip < 3) { const [mx, my, mz] = P3(u, yp + es.v0, 0); kit.poner(P.K_MARCO, mx, my, mz, rx, rz, nx, nz, es.vA * 2, es.v1 - es.v0, 0.05, es.moldura ? es.acento : [214, 210, 202]); }
          if (es.v0 > 0.5 && ip < 7) { const [sx, sy, sz] = P3(u, yp + es.v0 - 0.08, 0); kit.poner(P.K_CAJA, sx, sy, sz, rx, rz, nx, nz, es.vA * 2 + 0.24, 0.08, 0.14, es.acento); }
        }
        if (es.moldura === 3 && !vidriada) {
          const [sx, sy, sz] = P3(u, yp + es.v1 + 0.02, 0);
          kit.poner(P.K_ARCO, sx, sy, sz, rx, rz, nx, nz, es.vA * 2 + 0.34, 0.36, 0.1, es.acento);
        } else if (es.moldura === 2 && !vidriada) {
          const [sx, sy, sz] = P3(u, yp + es.v1 + 0.05, 0);
          kit.poner(P.K_CAJA, sx, sy, sz, rx, rz, nx, nz, es.vA * 2 + 0.4, 0.2, 0.12, es.acento);
        }
        if (conBalcon && es.balcon === 1) {
          const [qx, qy, qz] = P3(u, yp + es.v0, 0.1);
          kit.poner(P.K_REJA, qx, qy, qz, rx, rz, nx, nz, es.vA * 2 + 0.1, Math.min(1.05, es.v1 - es.v0 - 0.4), 0.05, es.metal);
        } else if (conBalcon && es.balcon === 2 && !(es.familia === "racionalista" && r < 0.15)) {
          const a = es.vA * 2 + 0.75, f = es.familia === "frances" ? 0.72 : 1.05, b = es.baranda;
          const [px, py, pz] = P3(u, yp - 0.1, 0);
          kit.poner(P.K_CAJA, px, py, pz, rx, rz, nx, nz, a, 0.14, f, es.acento);
          if (es.familia === "frances") for (const s of [-0.34, 0.34]) { const [kx, ky, kz] = P3(u + s * a, yp - 0.56, 0); kit.poner(P.K_MENSULA, kx, ky, kz, rx, rz, nx, nz, 0.16, 0.46, f - 0.08, es.acento); }
          const [qx, qy, qz] = P3(u, yp + 0.04, f - 0.05);
          const pieza = b === 0 ? P.K_REJA : b === 3 ? P.K_VIDRIO : P.K_CANO, col = b === 3 ? es.acento : es.metal;
          kit.poner(pieza, qx, qy, qz, rx, rz, nx, nz, a - 0.06, 1, 0.04, col);
          for (const s of [-1, 1]) {
            const [sx, sy, sz] = P3(u + (s * (a - 0.06)) / 2, yp + 0.04, f / 2);
            kit.poner(pieza, sx, sy, sz, nz, -nx, rx, rz, f - 0.1, 1, 0.04, col);
          }
        } else if (es.aires && r > 0.72 && es.v0 > 0.4) {
          const [qx, qy, qz] = P3(u + es.vA * 0.4, yp + 0.12, 0);
          kit.poner(P.K_AIRE, qx, qy, qz, rx, rz, nx, nz, 0.82, 0.55, 0.26, [222, 222, 216]);
        }
      }
    }
    /* Mansarda: una lucarna por bahía */
    if (es.mansarda && y1 < e.h - 2) for (let iu = 0; iu < n; iu++) {
      const [px, py, pz] = P3((iu + 0.5) * bw, y1 + 0.2, -0.75);
      kit.poner(P.K_LUCARNA, px, py, pz, rx, rz, nx, nz, 1.5, 2.1, 1.1, es.acento);
    }
  };

  /* Planta baja de un lote que no tiene local: portal, garage, casa o cortina baja */
  const plantaBaja = (e: Edif, es: Estilo, i: number, ax: number, az: number, bx: number, bz: number, s0: number, s1: number, lote: number) => {
    const L = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L, dz = (bz - az) / L, nx = dz, nz = -dx;
    const P3 = (s: number, y: number, o: number) => [ax + dx * s + nx * o - ox, y, az + dz * s + nz * o - oz];
    const N = [nx, 0, nz];
    const tomado = e.ocupado.get(i) ?? [], puertas = (prep.puertas.get(e) ?? []).filter((p) => p.i === i && p.s >= s0 && p.s < s1);
    const libre = (a: number, b: number) => tomado.every(([x, y]) => b < x || a > y);
    const pieza = (a: number, b: number, h: number, of: number, k: number, col: readonly number[]) => det.q(P3(b, 0, of), P3(a, 0, of), P3(a, h, of), P3(b, h, of), N, [0, 0, b - a, h], col, k);
    const W = s1 - s0, sem = hash(e.id, lote * 3 + 1), H = Math.min(es.pb, 3.6);
    if (es.familia === "oficina" || es.familia === "iglesia") return;
    /* Zócalo de todo el frente */
    const col = es.familia === "frances" ? es.color : [Math.round(es.color[0] * 0.62), Math.round(es.color[1] * 0.6), Math.round(es.color[2] * 0.58)];
    if (libre(s0, s1)) pieza(s0, s1, 0.62, 0.03, 10, col);
    const marco = (a: number, b: number, h: number, col2: readonly number[]) => {
      const m = 0.1, of = 0.12;
      det.q(P3(a, 0, of), P3(a - m, 0, of), P3(a - m, h + m, of), P3(a, h + m, of), N, [0, 0, 1, 1], col2, 0);
      det.q(P3(b + m, 0, of), P3(b, 0, of), P3(b, h + m, of), P3(b + m, h + m, of), N, [0, 0, 1, 1], col2, 0);
      det.q(P3(b + m, h, of), P3(a - m, h, of), P3(a - m, h + m, of), P3(b + m, h + m, of), N, [0, 0, 1, 1], col2, 0);
    };
    const portal = (c: number, num: string | null) => {
      const a = c - 0.95, b = c + 0.95;
      if (!libre(a - 0.2, b + 0.2)) return false;
      pieza(a, b, 2.72, 0.05, 6, es.metal);
      marco(a, b, 2.72, es.familia === "frances" ? es.acento : [68, 64, 60]);
      if (num) {
        const sl = pedirSlot({ tipo: "numero", texto: num });
        if (sl >= 0) conUvAtlas(() => det.q(P3(b + 0.5, 2.05, 0.13), P3(b + 0.12, 2.05, 0.13), P3(b + 0.12, 2.27, 0.13), P3(b + 0.5, 2.27, 0.13), N, uvSlot(sl), [20, 40, 80], 3));
      }
      const [lx, , lz] = P3(c, 0, 0.6);
      mancha(lx + ox, ALTO_VEREDA, lz + oz, 3, [255, 222, 170, 110], S_LUZ);
      return true;
    };
    const casa = es.familia === "casa" || es.familia === "ph";
    let hecho: number | null = null;
    for (const p of puertas) if (portal(p.s, p.num)) { hecho = p.s; break; }
    if (hecho == null && W > 4) {
      const c = s0 + W * (casa ? (sem < 0.5 ? 0.22 : 0.78) : 0.5);
      if (portal(c, null)) hecho = c;
    }
    /* Lo que queda a cada lado de la puerta */
    const tramos2: [number, number][] = hecho == null ? [[s0 + 0.2, s1 - 0.2]] : [[s0 + 0.2, hecho - 1.3], [hecho + 1.3, s1 - 0.2]];
    tramos2.forEach(([a, b], q) => {
      const w = b - a;
      if (w < 1.6 || !libre(a, b)) return;
      const r = hash(e.id + lote * 13, q + 2);
      if (!casa && w > 2.8 && r < 0.3) {
        const m = (a + b) / 2, an = Math.min(w, 3.2) / 2;
        pieza(m - an, m + an, 2.5, 0.05, 8, [150, 150, 150]);
        marco(m - an, m + an, 2.5, [64, 62, 60]);
      } else if (!casa && w > 3 && r < 0.62) {
        pieza(a + 0.1, b - 0.1, Math.min(H, 2.85), 0.05, 7, [165, 166, 168]);
      } else {
        const v = Math.min(1.9, w * 0.42), n = Math.max(1, Math.floor(w / (v + 0.9)));
        for (let c = 0; c < n; c++) {
          const m = a + (w * (c + 0.5)) / n;
          det.q(P3(m + v / 2, 0.95, 0.05), P3(m - v / 2, 0.95, 0.05), P3(m - v / 2, 2.55, 0.05), P3(m + v / 2, 2.55, 0.05), N, [0, 0, v, 1.6], es.metal, 9);
        }
      }
    });
  };

  const techo = (e: Edif, an: number[], y: number, col: C3, mat: number) => {
    const tri = Earcut.triangulate(an, [], 2), i0 = eP.length / 3, n = an.length / 2, sem = Math.floor(e.hash * 255);
    for (let i = 0; i < n; i++) {
      eP.push(an[i * 2] - ox, y, an[i * 2 + 1] - oz);
      eU.push(an[i * 2], an[i * 2 + 1], 3, y);
      eV.push(3, 0, 0, 0); eE.push(mat, 0, 0, 0); eN.push(0, 127, 0, 0); eC.push(col[0], col[1], col[2], sem);
    }
    for (let i = 0; i < tri.length; i += 3) eI.push(i0 + tri[i], i0 + tri[i + 1], i0 + tri[i + 2]);
  };

  for (const e of ind.edifs) {
    if (!adentro(e.cx, e.cz) || e.omitir) continue;
    const a = e.anillo, n = a.length / 2, oc = paredes(t, e), sem = Math.floor(e.hash * 255), H = e.h, y0 = e.minH;
    const base = estiloDe(e, prep.zona, 0);
    if (base.familia === "institucional" && /government|civic|school/.test(e.tipo) && hash(e.id, 61) < 0.6) prop(P.P_BANDERA, e.cx, H - 0.85, e.cz, 0.6, 0.7);
    const conTecho = e.techo === "gabled" || e.techo === "hipped" || e.techo === "skillion" || e.techo === "saltbox";
    const mans = base.mansarda;
    const yMuro = mans ? H - 3.4 : H;
    const inset = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ax = a[i * 2], az = a[i * 2 + 1], bx = a[j * 2], bz = a[j * 2 + 1];
      const L = Math.hypot(bx - ax, bz - az);
      if (L > 0.2 && y0 < 2) { if (oc[i] !== 2) colision.push(ax - ox, az - oz, bx - ox, bz - oz); }
      if (oc[i] === 2) continue;
      const nx = (bz - az) / L, nz = -(bx - ax) / L;
      if (mans && (oc[i] === 0 || oc[i] === 3) && L > 1) {
        inset[i * 2] -= nx * 1.5; inset[i * 2 + 1] -= nz * 1.5;
        inset[j * 2] -= nx * 1.5; inset[j * 2 + 1] -= nz * 1.5;
      }
      if (oc[i] === 1) {
        const m = hash(e.id, i + 51), mural = H > 11 && L > 6 && m < 0.14 ? 1 + Math.floor(m * 40) : 0;
        quad(ax, y0, az, bx, y0, bz, bx, H, bz, ax, H, az, 0, L, y0, H, 3, H, [1, 0, 0, 0], mural ? [M_MEDIANERA, mural, 0, 0] : EST_LISO, nx, 0, nz, [188, 180, 168], sem);
        continue;
      }
      if (oc[i] === 3) {
        const es = { ...base, pb: 0.01, bay: 3.2, vA: 0.6, v0: 0.95, v1: 2.2, moldura: 0, balcon: 0, cornisa: 0, mat: base.mat === 4 ? 4 : 0, color: base.color };
        fachada(e, es, ax, az, bx, bz, y0, yMuro, L > 3, sem, false);
        continue;
      }
      /* Frente largo: se parte en lotes de 8,66 m */
      const lotes = L > 12.5 && H < 42 ? Math.max(1, Math.round(L / 8.66)) : 1;
      for (let p = 0; p < lotes; p++) {
        const f0 = p / lotes, f1 = (p + 1) / lotes;
        const px = ax + (bx - ax) * f0, pz = az + (bz - az) * f0, qx = ax + (bx - ax) * f1, qz = az + (bz - az) * f1;
        const es = lotes > 1 ? estiloDe(e, prep.zona, p + 1 + i * 8) : base;
        const s2 = lotes > 1 ? Math.floor(hash(e.id, p + 21) * 255) : sem;
        fachada(e, lotes > 1 ? { ...es, mansarda: mans } : es, px, pz, qx, qz, y0, yMuro, L >= 2.4, s2);
        if (y0 < 1 && L >= 2.4) plantaBaja(e, es, i, ax, az, bx, bz, L * f0, L * f1, p);
      }
    }
    if (mans) {
      const r2: number[] = [];
      for (let i = 0; i < n; i++) r2.push(a[i * 2] + inset[i * 2], a[i * 2 + 1] + inset[i * 2 + 1]);
      for (let i = 0; i < n; i++) {
        if (oc[i] !== 0 && oc[i] !== 3) continue;
        const j = (i + 1) % n, ax = a[i * 2], az = a[i * 2 + 1], bx = a[j * 2], bz = a[j * 2 + 1], cx2 = r2[j * 2], cz2 = r2[j * 2 + 1], dx = r2[i * 2], dz = r2[i * 2 + 1];
        const L = Math.hypot(bx - ax, bz - az);
        if (L < 0.3) continue;
        const nx = (bz - az) / L, nz = -(bx - ax) / L;
        quad(ax, yMuro, az, bx, yMuro, bz, cx2, H, cz2, dx, H, dz, 0, L, 0, 3.7, 3, H, [1, 0, 0, 0], [M_PIZARRA, 0, 0, 0], nx * 0.9, 0.42, nz * 0.9, [78, 82, 92], sem);
      }
      techo(e, r2, H, [84, 86, 92], M_TEJA);
    } else {
      const colT: C3 = e.colorTecho ? hexARgb(e.colorTecho) : conTecho ? [150, 92, 70] : H < 9 ? [150, 146, 140] : [176, 172, 166];
      const yT = conTecho ? H : H - 0.85;
      techo(e, a, yT, colT, conTecho ? M_TEJA : e.h < 7 ? M_CHAPA_TECHO : M_TERRAZA);
      if (!conTecho) {
        /* Cara de adentro del pretil: se ve volando */
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n, ax = a[i * 2], az = a[i * 2 + 1], bx = a[j * 2], bz = a[j * 2 + 1], L = Math.hypot(bx - ax, bz - az);
          if (L < 0.5 || oc[i] === 2) continue;
          const nx = -(bz - az) / L, nz = (bx - ax) / L;
          quad(bx, yT, bz, ax, yT, az, ax, H, az, bx, H, bz, 0, L, yT, H, 3, H, [1, 0, 0, 0], [M_LOSA, 0, 0, 0], nx, 0, nz, [170, 166, 160], sem);
        }
        /* Tanque de agua y casilla de ascensor */
        if (H >= 11 && e.area > 70) {
          const k = H >= 15 ? 1.2 : 1;
          const g = Math.atan2(a[3] - a[1], a[2] - a[0]);
          cajaEdif(e.cx + (hash(e.id, 9) - 0.5) * 3, e.cz + (hash(e.id, 10) - 0.5) * 3, H - 0.9, H + 2.5, 1.5, 1.7, g, [190, 186, 176], M_LOSA, sem);
          cajaEdif(e.cx + (hash(e.id, 11) - 0.5) * 4 + 2.2, e.cz + (hash(e.id, 12) - 0.5) * 4, H + 1.1 * k, H + 2.9 * k, 1.1, 1.3, g, [172, 170, 162], M_LOSA, sem);
          if (hash(e.id, 13) > 0.5) prop(P.P_ANTENA, e.cx - 1.6, H - 0.85, e.cz + 1.2, g, 1 + hash(e.id, 14));
        }
      }
    }
  }

  /* ───────── Edificios con forma propia ───────── */
  for (const b of prep.singulares) if (adentro(b.x, b.z)) singulares.push({ id: b.id, x: b.x - ox, z: b.z - oz, giro: b.giro, anillo: b.anillo });

  /* ───────── Locales ───────── */
  for (const f of prep.frentes[cy * DIV + cx]) {
    const { p, rubro, e, i, s, w } = f;
    const a = e.anillo, n = a.length / 2, j = (i + 1) % n, ax = a[i * 2], az = a[i * 2 + 1], L = f.L, tx = (a[j * 2] - ax) / L, tz = (a[j * 2 + 1] - az) / L;
    const nx = tz, nz = -tx, rx = nz, rz = -nx, x = ax + tx * s, z = az + tz * s, lx = x - ox, lz = z - oz, col = hexARgb(rubro.color), h = w / 2;
    const PP = (r: number, y: number, o: number) => [lx + rx * r + nx * o, y, lz + rz * r + nz * o];
    const N = [nx, 0, nz];
    const sl = pedirSlot({ tipo: "local", texto: p.nombre, rubro });
    if (rubro.id === "hotel" || rubro.id === "banco") {
      det.q(PP(-h, 0, 0.05), PP(h, 0, 0.05), PP(h, 2.72, 0.05), PP(-h, 2.72, 0.05), N, [0, 0, w, 2.72], [40, 42, 46], 6);
      const [g2x, , g2z] = PP(0, 0, 0.8);
      mancha(g2x + ox, ALTO_VEREDA, g2z + oz, 4, [255, 225, 175, 130], S_LUZ);
    } else det.q(PP(-h, 0, 0.16), PP(h, 0, 0.16), PP(h, 2.72, 0.16), PP(-h, 2.72, 0.16), N, [0, 0, w, 2.72], col, 1);
    /* Marco del local, un poco salido */
    kit.poner(P.K_MARCO_PB, lx, 0, lz, rx, rz, nx, nz, w, 2.74, 0.24, [Math.round(col[0] * 0.5 + 20), Math.round(col[1] * 0.5 + 20), Math.round(col[2] * 0.5 + 22)]);
    if (sl >= 0) conUvAtlas(() => det.q(PP(-h, 2.76, 0.24), PP(h, 2.76, 0.24), PP(h, 3.46, 0.24), PP(-h, 3.46, 0.24), N, uvSlot(sl), col, 3));
    else det.q(PP(-h, 2.76, 0.24), PP(h, 2.76, 0.24), PP(h, 3.46, 0.24), PP(-h, 3.46, 0.24), N, [0, 0, 1, 1], col, 0);
    det.q(PP(-h, 3.46, 0.24), PP(h, 3.46, 0.24), PP(h, 3.46, 0.02), PP(-h, 3.46, 0.02), [0, 1, 0], [0, 0, 1, 1], [224, 220, 208], 0);
    if (rubro.toldo) {
      const ny = 0.84, nh = 0.54;
      det.q(PP(-h + 0.05, 2.3, 1.4), PP(h - 0.05, 2.3, 1.4), PP(h - 0.05, 2.74, 0.26), PP(-h + 0.05, 2.74, 0.26), [nx * nh, ny, nz * nh], [0, 0, w, 1], col, 2);
      det.q(PP(-h + 0.05, 2.12, 1.4), PP(h - 0.05, 2.12, 1.4), PP(h - 0.05, 2.3, 1.4), PP(-h + 0.05, 2.3, 1.4), N, [0, 0, w, 0.2], col, 2);
    }
    if (rubro.cruz) {
      const q0 = PP(h + 0.08, 3.05, 0.1), q1 = PP(h + 0.08, 3.05, 0.94), q2 = PP(h + 0.08, 3.9, 0.94), q3 = PP(h + 0.08, 3.9, 0.1);
      det.q(q0, q1, q2, q3, [rx, 0, rz], [0, 0, 1, 1], col, 5);
      det.q(q1, q0, q3, q2, [-rx, 0, -rz], [0, 0, 1, 1], col, 5);
    }
    /* Mesas en la vereda en bares, cafés y restaurantes con lugar */
    if (/cafe|bar|restaurante|helados|panaderia/.test(rubro.id)) {
      const sem = hash(gx * 13 + locales.length, gy), n = Math.min(3, Math.floor(w / 1.9));
      for (let q = 0; q < n && sem > 0.2; q++) {
        const r = (q - (n - 1) / 2) * 1.95, a = PP(r, ALTO_VEREDA, 1.75), wx = a[0] + ox, wz = a[2] + oz;
        if (distCalzada(mapa, wx, wz) < 1) continue;
        prop(P.P_CAFE, wx, ALTO_VEREDA, wz, sem * 6 + q);
        if (sem > 0.7) prop(P.P_SOMBRILLA, wx, ALTO_VEREDA, wz, 0, 1, col[0] / 255, col[1] / 255, col[2] / 255);
      }
    }
    if (rubro.toldo && hash(gx + locales.length, 5) > 0.6) for (const s2 of [-1, 1]) { const a = PP(s2 * (h + 0.25), ALTO_VEREDA, 0.35); prop(P.P_MACETA, a[0] + ox, ALTO_VEREDA, a[2] + oz, 0); }
    const [g0x, , g0z] = PP(0, 0, 1.2);
    mancha(g0x + ox, ALTO_VEREDA, g0z + oz, Math.min(5.5, w * 0.8), [255, 218, 165, 150], S_LUZ, 1);

    let num: string | null = null;
    for (const q of prep.puertas.get(e) ?? []) if (q.i === i && Math.abs(q.s - s) < 12) { num = q.num; break; }
    const calle = nombreCalle(t, p.x, p.z, 34);
    const direccion = p.direccion || (calle ? `${abreviarCalle(calle)}${num ? " " + num : ""}` : null);
    const pisos = Math.max(1, e.pisos);
    locales.push({
      id: `${gx}_${gy}_${locales.length}`, nombre: p.nombre, rubro, x: lx, z: lz, nx, nz, ancho: w, pisos, altura: e.h, direccion, px: p.x - ox, pz: p.z - oz, categoria: p.categoria,
      telefono: p.telefono || undefined, web: p.web || undefined, red: p.red || undefined, whatsapp: p.whatsapp || undefined, horario: p.horario || undefined,
    });
  }

  /* ───────── Objetos reales de la calle ───────── */
  const zonaTraf = (x: number, z: number) => hash(Math.round((x + t.tx * t.m) / 70), Math.round((z + t.ty * t.m) / 70)) * P.CICLO_SEMAFORO;
  const semaforos: { x: number; z: number; ax: number; corr: number }[] = [];
  for (const o of ind.objetos) {
    if (o.tipo === "arbol") continue;
    if (o.tipo === "tapa") {
      if (distCalzada(mapa, o.x, o.z) < 0) mancha(o.x, 0, o.z, 0.4, [70, 66, 62, 255], S_TAPA);
      else rect(o.x, o.z, ALTO_VEREDA, 1, 0, 0.3, 0.3, [84, 82, 78, 255], S_TAPA, 255);
      continue;
    }
    if (o.tipo === "terraza") { prop(P.P_CAFE, o.x, ALTO_VEREDA, o.z, hash(Math.round(o.x), 3) * 3); continue; }
    if (o.tipo === "bandera") { prop(P.P_BANDERA, o.x, altoEn(o.x, o.z), o.z, 0.6, 1); continue; }
    if (o.tipo === "pare" || o.tipo === "ceda" || o.tipo === "radar") {
      const c = viaCerca(t, o.x, o.z, 10);
      if (!c) continue;
      const nx = -c.dz, nz = c.dx, lado = (o.x - c.px) * nx + (o.z - c.pz) * nz >= 0 ? 1 : -1, x = c.px + nx * lado * (c.v.hw + 0.4), z = c.pz + nz * lado * (c.v.hw + 0.4);
      if (!enEdif(t, x, z)) prop(P.P_SENAL, x, ALTO_VEREDA, z, Math.atan2(c.dx, c.dz), 1, o.tipo === "pare" ? 0.8 : 0.95, o.tipo === "pare" ? 0.1 : 0.92, o.tipo === "pare" ? 0.1 : o.tipo === "radar" ? 0.3 : 0.9);
      continue;
    }
    if (o.tipo === "lomo") {
      const c = viaCerca(t, o.x, o.z, 5);
      if (c) rect(c.px, c.pz, 0, c.dz, -c.dx, c.v.hw, 0.32, [226, 190, 60, 255], S_MARCA, 1);
      continue;
    }
    if (o.tipo === "semaforo") {
      const c = viaCerca(t, o.x, o.z, 9);
      if (!c) continue;
      const ang = Math.atan2(c.dx, c.dz), corr = zonaTraf(o.x, o.z), grupo = ((((ang % Math.PI) + Math.PI) % Math.PI) < Math.PI / 2 ? 0 : 1);
      semaforos.push({ x: c.px, z: c.pz, ax: grupo, corr });
      const nx = -c.dz, nz = c.dx;
      for (const lado of c.v.sentido ? [c.v.sentido] : [1, -1]) {
        /* A la derecha de quien llega, mirando hacia él */
        const fx = c.dx * lado, fz = c.dz * lado, px = c.px + nx * lado * (c.v.hw + 0.5), pz = c.pz + nz * lado * (c.v.hw + 0.5);
        if (!adentro(px, pz) || enEdif(t, px, pz)) continue;
        prop(P.P_SEMAFORO, px, ALTO_VEREDA, pz, Math.atan2(-fx, -fz), 1, grupo, corr / P.CICLO_SEMAFORO, Math.min(1, c.v.hw / 10));
      }
      continue;
    }
    const tipo = PROP_OBJ[o.tipo];
    if (tipo == null) continue;
    /* Lo que queda en plena calzada por error del dato se corre a la vereda */
    let x = o.x, z = o.z, g = hash(Math.round(x * 3), Math.round(z * 3)) * 6.28;
    const c = viaCerca(t, x, z, 14);
    if (c) {
      g = Math.atan2(c.dx, c.dz);
      const lx = x - c.px, lz = z - c.pz, D = Math.hypot(lx, lz) || 1, nx = lx / D, nz = lz / D;
      if (tipo !== P.P_SUBTE && D < c.v.hw + 0.9) { x = c.px + nx * (c.v.hw + 1); z = c.pz + nz * (c.v.hw + 1); }
      g = Math.atan2(-nx, -nz);
    }
    if (enEdif(t, x, z) && tipo !== P.P_CAJERO) continue;
    prop(tipo === P.P_PARADA && (c?.v.hw ?? 0) < 4.5 ? P.P_PARADA : tipo === P.P_PARADA ? P.P_GARITA : tipo, x, altoEn(x, z), z, g);
  }

  /* Bóvedas reales del cementerio: los lugares con categoría de tumba */
  for (const p of ind.pois) {
    if (!/tomb|mausoleum|grave/.test(p.categoria) || enEdif(t, p.x, p.z)) continue;
    const s = hash(Math.round(p.x * 5), Math.round(p.z * 5));
    prop(P.P_BOVEDA, p.x, ALTO_VEREDA, p.z, 0.92 + (s < 0.5 ? 0 : Math.PI / 2), 0.85 + s * 0.5);
  }

  /* Kioscos de diarios y revistas donde el lugar dice que hay uno y no cayó en un edificio */
  for (const p of ind.pois) {
    if (!/kiosk|newsagent/.test(p.categoria) || enEdif(t, p.x, p.z)) continue;
    const c = viaCerca(t, p.x, p.z, 10);
    if (c && c.d > 0.5) prop(P.P_KIOSCO, p.x, ALTO_VEREDA, p.z, Math.atan2(c.px - p.x, c.pz - p.z));
  }
  /* Puestos de flores: florerías sin edificio, en la vereda */
  for (const p of ind.pois) {
    if (!/florist/.test(p.categoria) || enEdif(t, p.x, p.z)) continue;
    const c = viaCerca(t, p.x, p.z, 12);
    if (c && c.d > 0.3) prop(P.P_FLORES, p.x, ALTO_VEREDA, p.z, Math.atan2(c.px - p.x, c.pz - p.z));
  }

  /* ───────── Árboles ───────── */
  const hayArbol: [number, number][] = [];
  const cerca = (x: number, z: number, r: number) => hayArbol.some(([a, b]) => Math.abs(a - x) < r && Math.abs(b - z) < r);
  const pozo = (x: number, z: number, dx: number, dz: number) => {
    rect(x, z, ALTO_VEREDA, dx, dz, 0.62, 0.55, [58, 44, 32, 255], S_TIERRA);
  };
  const claros = prep.singulares.filter((b) => b.id === "floralis" || b.id === "obelisco");
  const plantar = (x: number, z: number, y: number, esp: number, sem: number) => {
    if (claros.some((b) => Math.hypot(b.x - x, b.z - z) < 30)) return;
    const escala = 0.82 + sem * 0.5;
    arboles.push(x - ox, y, z - oz, escala, sem * 6.28, esp, sem, 0);
    hayArbol.push([x, z]);
  };
  for (const o of ind.objetos) {
    if (o.tipo !== "arbol" || enEdif(t, o.x, o.z)) continue;
    const sem = hash(Math.round(o.x * 7), Math.round(o.z * 7));
    let x = o.x, z = o.z;
    const d = distCalzada(mapa, x, z);
    if (d < 0.5 && d > -6) { const c = viaCerca(t, x, z, 8); if (c) { const lx = x - c.px, lz = z - c.pz, D = Math.hypot(lx, lz) || 1; x = c.px + (lx / D) * (c.v.hw + 0.9); z = c.pz + (lz / D) * (c.v.hw + 0.9); } }
    plantar(x, z, ALTO_VEREDA, especieDe(o.detalle, sem), sem);
    if (d < 5) { const c = viaCerca(t, x, z, 8); if (c) pozo(x, z, c.dx, c.dz); }
  }

  /* Completa veredas sin datos: cada calle tiene su especie dominante */
  for (const v of ind.vias) {
    if (!v.auto || v.tunel || v.puente || v.acera < 1.5 || v.clase === "service" || /link|motorway/.test(v.clase)) continue;
    let s = 0;
    const paso = v.clase === "residential" ? 8.6 : 10.4, esp = especieDe("", hash(v.id, 41));
    const luz = v.hw >= 5 ? 27 : 34;
    for (let i = 0; i + 3 < v.pts.length; i += 2) {
      const ax = v.pts[i], az = v.pts[i + 1], bx = v.pts[i + 2], bz = v.pts[i + 3], L = Math.hypot(bx - ax, bz - az);
      if (L < 0.5) continue;
      const dx = (bx - ax) / L, dz = (bz - az) / L, nx = -dz, nz = dx;
      for (let q = Math.ceil(s / paso) * paso - s; q < L; q += paso) {
        const k = Math.round((s + q) / paso);
        for (const lado of [1, -1]) {
          const x = ax + dx * q + nx * lado * (v.hw + 0.95), z = az + dz * q + nz * lado * (v.hw + 0.95);
          if (!adentro(x, z)) continue;
          const r = hash(v.id * 3 + k, lado + 5);
          if (r < 0.24 || cercaEsquina(x, z, v.hw + 9) || distCalzada(mapa, x, z) < 0.4 || enEdif(t, x, z) || enEdif(t, x + nx * lado * 1.2, z + nz * lado * 1.2) || cerca(x, z, 5.5)) continue;
          const e2 = hash(v.id, k * 13 + lado) < 0.8 ? esp : especieDe("", hash(k, lado + 9));
          plantar(x, z, ALTO_VEREDA, e2, hash(k + v.id, lado + 77));
          pozo(x, z, dx, dz);
        }
      }
      /* Luminarias: casi no están mapeadas, salen de la calle iluminada */
      const paso2 = luz;
      for (let q = Math.ceil(s / paso2) * paso2 - s; q < L; q += paso2) {
        const k = Math.round((s + q) / paso2), lado = v.hw >= 5.5 ? (k % 2 ? 1 : -1) : hash(v.id, 3) < 0.5 ? 1 : -1;
        const x = ax + dx * q + nx * lado * (v.hw + 0.45), z = az + dz * q + nz * lado * (v.hw + 0.45);
        if (!adentro(x, z) || distCalzada(mapa, x, z) < 0.15 || enEdif(t, x, z)) continue;
        prop(P.P_FAROLA, x, ALTO_VEREDA, z, Math.atan2(-nx * lado, -nz * lado), 1);
        mancha(x - nx * lado * 2, 0, z - nz * lado * 2, 9.5, [255, 214, 158, 120], S_LUZ);
        mancha(x + nx * lado * 2, ALTO_VEREDA, z + nz * lado * 2, 6.5, [255, 214, 158, 100], S_LUZ);
      }
      s += L;
    }
  }
  /* Autos estacionados junto al cordón: en cada cuadra hay un lado permitido */
  for (const v of ind.vias) {
    if (!v.auto || v.tunel || v.puente || v.hw < 3.8 || v.hw > 7.5 || v.bus || !v.estaciona || !/residential|tertiary|unclassified|secondary/.test(v.clase)) continue;
    const lado = hash(v.id, 2) < 0.7 ? -1 : 1;
    let s = 0;
    for (let i = 0; i + 3 < v.pts.length; i += 2) {
      const ax = v.pts[i], az = v.pts[i + 1], bx = v.pts[i + 2], bz = v.pts[i + 3], L = Math.hypot(bx - ax, bz - az);
      if (L < 1) continue;
      const dx = (bx - ax) / L, dz = (bz - az) / L, nx = -dz, nz = dx;
      for (let q = Math.ceil(s / 5.6) * 5.6 - s; q < L; q += 5.6) {
        const k = Math.round((s + q) / 5.6), r = hash(v.id + k * 3, 19), x = ax + dx * q + nx * lado * (v.hw - 1.12), z = az + dz * q + nz * lado * (v.hw - 1.12);
        if (r < 0.34 || !adentro(x, z) || cercaEsquina(x, z, v.hw + 11) || distCalzada(mapa, x, z) > -0.7) continue;
        const c = PINTURAS[Math.floor(r * 811) % PINTURAS.length];
        prop(r > 0.93 ? P.P_TAXI : r > 0.8 ? P.P_CAMIONETA : P.P_AUTO, x, 0, z, Math.atan2(dx, dz) + (hash(k, 3) < 0.5 ? 0 : Math.PI) + (r - 0.6) * 0.03, 1, c[0], c[1], c[2]);
      }
      s += L;
    }
  }

  /* Plazas: arboleda densa donde el dato no alcanza, nunca peladas */
  for (const p of polis) {
    const verde = p.tipo === "parque" || p.tipo === "bosque" || p.tipo === "pasto";
    const r = p.anillos[0];
    if (verde || p.tipo === "arbustos") {
      const paso = p.tipo === "bosque" ? 7 : p.tipo === "parque" ? 9.5 : p.tipo === "arbustos" ? 3 : 13;
      for (let i = Math.ceil(ox / paso); i * paso < ox + C; i++) for (let j = Math.ceil(oz / paso); j * paso < oz + C; j++) {
        const h = hash(i + t.tx * 97, j + t.ty * 89), x = i * paso + (hash(j, i) - 0.5) * paso * 0.85, z = j * paso + (h - 0.5) * paso * 0.85;
        if (!adentro(x, z) || !dentroDe(r, x, z) || enEdif(t, x, z) || distCalzada(mapa, x, z) < 2.5 || distSenda(mapa, x, z) < 1.3) continue;
        if (p.tipo === "arbustos" || h < 0.16) { if (h < 0.7) prop(P.P_ARBUSTO, x, ALTO_VEREDA, z, h * 6, 0.8 + h, 0.75 + h * 0.3, 0.9, 0.7); continue; }
        if (cerca(x, z, 5)) continue;
        plantar(x, z, ALTO_VEREDA, especieDe("", hash(i >> 2, j >> 2)), h);
      }
    }
    if (p.tipo === "juegos") {
      const m = centroAnillo(r);
      if (adentro(m[0], m[1])) prop(P.P_JUEGOS, m[0], ALTO_VEREDA, m[1], hash(Math.round(m[0]), 2) * 6);
    }
    if (p.tipo === "canil" || p.tipo === "juegos") {
      const n = r.length / 2;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, ax = r[i * 2], az = r[i * 2 + 1], bx = r[j * 2], bz = r[j * 2 + 1], L = Math.hypot(bx - ax, bz - az), mx = (ax + bx) / 2, mz = (az + bz) / 2;
        if (L < 0.5 || !adentro(mx, mz)) continue;
        const rx = (bx - ax) / L, rz = (bz - az) / L;
        fijo.poner(P.K_REJA, mx - ox, ALTO_VEREDA, mz - oz, rx, rz, -rz, rx, L, 1.15, 0.03, [40, 74, 56]);
      }
    }
    if (p.tipo === "obra") {
      const n = r.length / 2;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, ax = r[i * 2], az = r[i * 2 + 1], bx = r[j * 2], bz = r[j * 2 + 1], L = Math.hypot(bx - ax, bz - az), mx = (ax + bx) / 2, mz = (az + bz) / 2;
        if (L < 0.5 || !adentro(mx, mz)) continue;
        const rx = (bx - ax) / L, rz = (bz - az) / L;
        fijo.poner(P.K_CAJA, mx - ox, 0, mz - oz, rx, rz, -rz, rx, L, 2.3, 0.04, [120, 124, 120]);
      }
    }
  }
  /* Bancos, faroles y cestos a lo largo de los senderos reales de la plaza */
  const enPlaza = (x: number, z: number) => polis.some((p) => (p.tipo === "parque" || p.tipo === "pasto" || p.tipo === "plazaseca") && dentroDe(p.anillos[0], x, z));
  for (const v of ind.vias) {
    if (!v.peaton || v.tunel || v.puente || v.vereda || v.escalera) continue;
    let s = 0;
    for (let i = 0; i + 3 < v.pts.length; i += 2) {
      const ax = v.pts[i], az = v.pts[i + 1], bx = v.pts[i + 2], bz = v.pts[i + 3], L = Math.hypot(bx - ax, bz - az);
      if (L < 0.5) continue;
      const dx = (bx - ax) / L, dz = (bz - az) / L, nx = -dz, nz = dx;
      for (let q = Math.ceil(s / 7) * 7 - s; q < L; q += 7) {
        const k = Math.round((s + q) / 7), lado = k % 2 ? 1 : -1, x = ax + dx * q + nx * lado * (v.hw + 0.55), z = az + dz * q + nz * lado * (v.hw + 0.55);
        if (!adentro(x, z) || !enPlaza(x, z) || enEdif(t, x, z)) continue;
        if (k % 3 === 0) prop(P.P_BANCO, x, ALTO_VEREDA, z, Math.atan2(-nx * lado, -nz * lado) + Math.PI);
        else if (k % 6 === 1) { prop(P.P_FAROL_PLAZA, x, ALTO_VEREDA, z, 0); mancha(x, ALTO_VEREDA, z, 6, [255, 214, 158, 110], S_LUZ); }
        else if (k % 12 === 5) prop(P.P_CESTO, x, ALTO_VEREDA, z, Math.atan2(nx * lado, nz * lado));
        else if (k % 12 === 8) mancha(x + nx * lado * 1.5, ALTO_VEREDA, z + nz * lado * 1.5, 1.5, [255, 255, 255, 255], S_CANTERO);
      }
      s += L;
    }
  }

  /* Mobiliario de vereda: cestos en las esquinas, contenedores, parquímetros, señales */
  for (const e of esquinas) {
    const b = e.brazos[0], o = e.brazos.find((q) => Math.abs(q.dx * b.dx + q.dz * b.dz) < 0.7);
    if (!o) continue;
    const s1 = hash(Math.round(e.x), 1) < 0.5 ? 1 : -1, s2 = hash(Math.round(e.z), 2) < 0.5 ? 1 : -1;
    const x = e.x + b.dx * s1 * (o.hw + 3.2) + o.dx * s2 * (b.hw + 0.8), z = e.z + b.dz * s1 * (o.hw + 3.2) + o.dz * s2 * (b.hw + 0.8);
    if (adentro(x, z) && distCalzada(mapa, x, z) > 0.3 && !enEdif(t, x, z)) prop(P.P_CESTO, x, ALTO_VEREDA, z, Math.atan2(-o.dx * s2, -o.dz * s2));
    /* Señal de sentido o de no estacionar, sobre el cartel de calle no: en la esquina opuesta */
    const x2 = e.x - b.dx * s1 * (o.hw + 2.4) - o.dx * s2 * (b.hw + 0.5), z2 = e.z - b.dz * s1 * (o.hw + 2.4) - o.dz * s2 * (b.hw + 0.5);
    if (adentro(x2, z2) && distCalzada(mapa, x2, z2) > 0.1 && !enEdif(t, x2, z2)) prop(P.P_SENAL, x2, ALTO_VEREDA, z2, Math.atan2(b.dx, b.dz), 1, 0.12, 0.3, 0.72);
  }
  for (const v of ind.vias) {
    if (!v.auto || v.tunel || v.puente || v.clase === "service" || /link|motorway/.test(v.clase) || v.hw < 3.6) continue;
    let s = 0;
    for (let i = 0; i + 3 < v.pts.length; i += 2) {
      const ax = v.pts[i], az = v.pts[i + 1], bx = v.pts[i + 2], bz = v.pts[i + 3], L = Math.hypot(bx - ax, bz - az);
      if (L < 0.5) continue;
      const dx = (bx - ax) / L, dz = (bz - az) / L, nx = -dz, nz = dx, lado = hash(v.id, 7) < 0.5 ? 1 : -1;
      for (let q = Math.ceil(s / 46) * 46 - s; q < L; q += 46) {
        const k = Math.round((s + q) / 46), x = ax + dx * q + nx * lado * (v.hw - 1), z = az + dz * q + nz * lado * (v.hw - 1);
        if (!adentro(x, z) || cercaEsquina(x, z, v.hw + 12)) continue;
        if (k % 2 === 0) { const ve = hash(k, v.id) < 0.4; prop(P.P_CONTENEDOR, x, 0, z, Math.atan2(dx, dz) + Math.PI / 2, 1, ve ? 0.16 : 0.08, ve ? 0.34 : 0.08, ve ? 0.2 : 0.09); }
        else if (prep.zona === 1 || v.hw > 5) { const x3 = ax + dx * q + nx * lado * (v.hw + 0.5), z3 = az + dz * q + nz * lado * (v.hw + 0.5); if (distCalzada(mapa, x3, z3) > 0.1 && !enEdif(t, x3, z3)) prop(P.P_PARQUIMETRO, x3, ALTO_VEREDA, z3, Math.atan2(nx * lado, nz * lado)); }
      }
      s += L;
    }
  }

  /* Cableado aéreo en los barrios bajos: postes de madera a lo largo de la cuadra */
  if (prep.zona === 2) for (const v of ind.vias) {
    if (!v.auto || v.tunel || v.puente || !/residential|tertiary/.test(v.clase)) continue;
    const lado = hash(v.id, 31) < 0.5 ? 1 : -1;
    let s = 0, antX = 0, antZ = 0, hay = false;
    for (let i = 0; i + 3 < v.pts.length; i += 2) {
      const ax = v.pts[i], az = v.pts[i + 1], bx = v.pts[i + 2], bz = v.pts[i + 3], L = Math.hypot(bx - ax, bz - az);
      if (L < 0.5) continue;
      const dx = (bx - ax) / L, dz = (bz - az) / L, nx = -dz, nz = dx;
      for (let q = Math.ceil(s / 33) * 33 - s; q < L; q += 33) {
        const x = ax + dx * q + nx * lado * (v.hw + 0.4), z = az + dz * q + nz * lado * (v.hw + 0.4);
        if (!adentro(x, z) || distCalzada(mapa, x, z) < 0.1 || enEdif(t, x, z)) { hay = false; continue; }
        prop(P.P_POSTE_LUZ, x, ALTO_VEREDA, z, Math.atan2(dx, dz));
        if (hay) for (const al of [7.1, 6.6]) {
          const mx = (antX + x) / 2, mz = (antZ + z) / 2, LL = Math.hypot(x - antX, z - antZ) || 1, rx = (x - antX) / LL, rz = (z - antZ) / LL;
          fijo.poner(P.K_CAJA, mx - ox, al, mz - oz, rx, rz, -rz, rx, LL, 0.018, 0.018, [24, 24, 26]);
        }
        antX = x; antZ = z; hay = true;
      }
      s += L;
    }
  }

  /* Sin huecos: donde en la línea de edificación no hay nada, un tapial o una reja cierra el lote */
  for (const v of ind.vias) {
    if (!v.auto || v.tunel || v.puente || v.acera < 1.5 || /link|motorway|service/.test(v.clase)) continue;
    for (const lado of [1, -1]) {
      let ini: number[] | null = null, fin: number[] | null = null, s = 0;
      const cerrar = () => {
        if (ini && fin) {
          const L = Math.hypot(fin[0] - ini[0], fin[1] - ini[1]);
          if (L > 1.5) {
            const mx = (ini[0] + fin[0]) / 2, mz = (ini[1] + fin[1]) / 2, rx = (fin[0] - ini[0]) / L, rz = (fin[1] - ini[1]) / L, r = hash(Math.round(mx / 9), Math.round(mz / 9));
            if (r < 0.62) {
              const c0 = PARED_LOTE[Math.floor(r * 97) % PARED_LOTE.length];
              fijo.poner(P.K_CAJA, mx - ox, 0, mz - oz, rx, rz, -rz, rx, L, 2.5 + (r * 7 % 1) * 0.8, 0.2, c0);
            } else {
              fijo.poner(P.K_CAJA, mx - ox, 0, mz - oz, rx, rz, -rz, rx, L, 0.7, 0.2, [186, 180, 168]);
              fijo.poner(P.K_REJA, mx - ox, 0.7, mz - oz, rx, rz, -rz, rx, L, 1.5, 0.03, [32, 36, 38]);
            }
            colision.push(ini[0] - ox, ini[1] - oz, fin[0] - ox, fin[1] - oz);
          }
        }
        ini = fin = null;
      };
      for (let i = 0; i + 3 < v.pts.length; i += 2) {
        const ax = v.pts[i], az = v.pts[i + 1], bx = v.pts[i + 2], bz = v.pts[i + 3], L = Math.hypot(bx - ax, bz - az);
        if (L < 0.5) continue;
        const dx = (bx - ax) / L, dz = (bz - az) / L, nx = -dz, nz = dx, of = v.hw + v.acera + 0.3;
        for (let q = Math.ceil(s / 2.4) * 2.4 - s; q < L; q += 2.4) {
          const x = ax + dx * q + nx * lado * of, z = az + dz * q + nz * lado * of;
          const hueco = adentro(x, z) && distPared(mapa, x, z) > 2.2 && distCalzada(mapa, x, z) > v.acera - 0.6 && distSenda(mapa, x, z) > 1 && !enEdif(t, x, z) && !cercaEsquina(x, z, v.hw + v.acera + 9) && !polis.some((p) => p.tipo !== "terreno" && p.tipo !== "obra" && dentroDe(p.anillos[0], x, z));
          if (hueco) { if (!ini) ini = [x, z]; fin = [x, z]; } else cerrar();
        }
        s += L;
      }
      cerrar();
    }
  }

  /* Cartel de calle en cada esquina, con el nombre real */
  for (const e of esquinas) {
    const con = e.brazos.filter((b) => b.nombre);
    if (con.length < 2) continue;
    const a = con[0], b = con.find((q) => Math.abs(q.dx * a.dx + q.dz * a.dz) < 0.7);
    if (!b) continue;
    let sx = 0, sz = 0, ok = false;
    for (const [s1, s2] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      sx = e.x + a.dx * s1 * (b.hw + 1.1) + b.dx * s2 * (a.hw + 1.1);
      sz = e.z + a.dz * s1 * (b.hw + 1.1) + b.dz * s2 * (a.hw + 1.1);
      if (!enEdif(t, sx, sz) && distCalzada(mapa, sx, sz) > 0.1) { ok = true; break; }
    }
    if (!ok) continue;
    const x = sx - ox, z = sz - oz;
    prop(P.P_POSTE_CALLE, sx, ALTO_VEREDA, sz, 0);
    [a, b].forEach((br, i) => {
      if (!br.nombre) return;
      const sl = pedirSlot({ tipo: "calle", texto: abreviarCalle(br.nombre) });
      if (sl < 0) return;
      const rx = br.dx, rz = br.dz, nx = -rz, nz = rx, y = 3.27 - i * 0.3, h = 0.13, L = 0.72;
      for (const lado of [1, -1]) {
        const rrx = rx * lado, rrz = rz * lado, nnx = nx * lado, nnz = nz * lado, of = 0.05;
        const Q = (r: number, yy: number) => [x + rrx * r + nnx * of, yy, z + rrz * r + nnz * of];
        conUvAtlas(() => det.q(Q(-L, y - h), Q(L, y - h), Q(L, y + h), Q(-L, y + h), [nnx, 0, nnz], uvSlot(sl), [32, 56, 110], 3));
      }
    });
  }

  /* Muro perimetral del cementerio: sale del borde real del área */
  for (const p of polis) {
    if (p.tipo !== "cementerio") continue;
    const r = p.anillos[0], n = r.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ax = r[i * 2], az = r[i * 2 + 1], bx = r[j * 2], bz = r[j * 2 + 1], L = Math.hypot(bx - ax, bz - az), mx = (ax + bx) / 2, mz = (az + bz) / 2;
      if (L < 0.5 || !adentro(mx, mz)) continue;
      const rx = (bx - ax) / L, rz = (bz - az) / L;
      fijo.poner(P.K_CAJA, mx - ox, 0, mz - oz, rx, rz, -rz, rx, L + 0.1, 4.6, 0.55, [204, 196, 176]);
      colision.push(ax - ox, az - oz, bx - ox, bz - oz);
    }
  }

  /* Ciclovías con separadores, muros y rejas, y puentes */
  for (const v of ind.vias) {
    const p = v.pts;
    if (v.clase.startsWith("muro:")) {
      const alto = /wall|retaining/.test(v.clase) ? 2.4 : /hedge/.test(v.clase) ? 1.5 : 1.6;
      const rejaM = /fence|gate|railing/.test(v.clase);
      for (let i = 0; i + 3 < p.length; i += 2) {
        const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3], L = Math.hypot(bx - ax, bz - az), mx = (ax + bx) / 2, mz = (az + bz) / 2;
        if (L < 0.3 || !adentro(mx, mz)) continue;
        const dx = (bx - ax) / L, dz = (bz - az) / L, nx = dz, nz = -dx, rx = -dx, rz = -dz;
        if (rejaM) fijo.poner(P.K_REJA, mx - ox, ALTO_VEREDA, mz - oz, rx, rz, nx, nz, L, alto, 0.04, [36, 38, 40]);
        else {
          fijo.poner(P.K_CAJA, mx - ox, 0, mz - oz, rx, rz, nx, nz, L, alto, 0.25, /hedge/.test(v.clase) ? [64, 92, 52] : [176, 168, 152]);
          colision.push(ax - ox, az - oz, bx - ox, bz - oz);
        }
      }
      continue;
    }
    if (v.plataforma && !v.tunel) {
      const techo = v.clase === "platform";
      for (let i = 0; i + 3 < p.length; i += 2) {
        const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3], L = Math.hypot(bx - ax, bz - az), mx = (ax + bx) / 2, mz = (az + bz) / 2;
        if (L < 0.5 || !adentro(mx, mz)) continue;
        const rx = (bx - ax) / L, rz = (bz - az) / L;
        fijo.poner(P.K_CAJA, mx - ox + rz * 1.5, 0, mz - oz - rx * 1.5, rx, rz, -rz, rx, L, 0.32, 3, [168, 164, 154]);
        if (techo) {
          fijo.poner(P.K_CAJA, mx - ox + rz * 1.7, 3, mz - oz - rx * 1.7, rx, rz, -rz, rx, L, 0.12, 3.4, [70, 92, 110]);
          for (let q = 0; q < L; q += 6) fijo.poner(P.K_CAJA, ax + rx * q - ox, 0.3, az + rz * q - oz, rx, rz, -rz, rx, 0.12, 2.7, 0.12, [60, 66, 72]);
        }
      }
      continue;
    }
    if (v.clase === "cycleway" && !v.puente && !v.tunel) {
      let s = 0;
      for (let i = 0; i + 3 < p.length; i += 2) {
        const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3], L = Math.hypot(bx - ax, bz - az);
        if (L < 0.5) continue;
        const dx = (bx - ax) / L, dz = (bz - az) / L, nx = -dz, nz = dx;
        for (let q = Math.ceil(s / 3) * 3 - s; q < L; q += 3) {
          for (const lado of [1, -1]) {
            const x = ax + dx * q + nx * lado * 1.2, z = az + dz * q + nz * lado * 1.2;
            if (adentro(x, z) && distCalzada(mapa, x, z) < 1.5) prop(P.P_SEPARADOR, x, 0, z, Math.atan2(dx, dz));
          }
        }
        s += L;
      }
    }
    if (v.puente && !v.tunel && (v.auto || v.peaton)) {
      const y = 5.4 * Math.max(1, v.capa), ancho = v.hw + (v.acera ? 0.4 : 0.3), bajo = 0.7;
      let s = 0;
      for (let i = 0; i + 3 < p.length; i += 2) {
        const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3], L = Math.hypot(bx - ax, bz - az), mx = (ax + bx) / 2, mz = (az + bz) / 2;
        if (L < 0.5 || !adentro(mx, mz)) { s += L; continue; }
        const dx = (bx - ax) / L, dz = (bz - az) / L, nx = dz, nz = -dx;
        fijo.poner(P.K_CAJA, mx - ox, y - bajo, mz - oz, nx, nz, -dx, -dz, ancho * 2, bajo, L + 0.1, [150, 148, 142]);
        /* Las cajas salen de z=0 hacia afuera: se corre medio largo */
        fijo.m[P.K_CAJA].splice(-4, 3, mx - ox + dx * (L / 2 + 0.05), y - bajo, mz - oz + dz * (L / 2 + 0.05));
        for (let q = Math.ceil(s / 18) * 18 - s; q < L; q += 18) {
          const x = ax + dx * q, z = az + dz * q;
          fijo.poner(P.K_CAJA, x - ox, 0, z - oz, nx, nz, -dx, -dz, 1.2, y - bajo, 0.8, [140, 138, 132]);
        }
        s += L;
      }
    }
  }

  /* Tramos para saber en qué calle estás, y vías por donde pasa el tráfico */
  const indNombre = new Map<string, number>();
  for (const v of ind.vias) {
    if (!v.auto && !v.peaton) continue;
    if (v.tunel) continue;
    for (let i = 0; i + 3 < v.pts.length; i += 2) {
      const ax = v.pts[i], az = v.pts[i + 1], bx = v.pts[i + 2], bz = v.pts[i + 3], mx = (ax + bx) / 2, mz = (az + bz) / 2, L = Math.hypot(bx - ax, bz - az);
      if (!adentro(mx, mz) && L < C * 0.5) continue;
      let k = -1;
      if (v.nombre) {
        const ab = abreviarCalle(v.nombre);
        k = indNombre.get(ab) ?? -1;
        if (k < 0) { k = nombres.length; nombres.push(ab); indNombre.set(ab, k); }
      }
      tramos.push(ax - ox, az - oz, bx - ox, bz - oz, v.auto ? v.hw : 0, k);
    }
    if (!v.auto || v.puente || !CON_AUTOS.has(v.clase)) continue;
    /* Cada tramo pertenece a la celda de su punto medio: nunca dos veces */
    let act: number[] = [];
    const cerrar = () => {
      if (act.length >= 4) {
        const pts = new Float32Array(act.length);
        for (let i = 0; i < pts.length; i += 2) { pts[i] = act[i] - ox; pts[i + 1] = act[i + 1] - oz; }
        const altos: number[] = [];
        let s = 0;
        for (let i = 0; i + 3 < act.length; i += 2) {
          const ax = act[i], az = act[i + 1], dx = act[i + 2] - ax, dz = act[i + 3] - az, L = Math.hypot(dx, dz);
          if (!L) continue;
          for (const q of semaforos) {
            const a = ((q.x - ax) * dx + (q.z - az) * dz) / L, lat = Math.abs((q.x - ax) * dz - (q.z - az) * dx) / L;
            if (a >= -1 && a <= L + 1 && lat < v.hw + 2.5) { altos.push(s + a, q.ax, q.corr); break; }
          }
          s += L;
        }
        vias.push({ id: v.id, pts, hw: v.hw, sentido: v.sentido, clase: v.clase, carriles: v.carriles, altos: new Float32Array(altos) });
      }
      act = [];
    };
    for (let i = 0; i + 3 < v.pts.length; i += 2) {
      const ax = v.pts[i], az = v.pts[i + 1], bx = v.pts[i + 2], bz = v.pts[i + 3];
      if (adentro((ax + bx) / 2, (az + bz) / 2)) {
        if (!act.length) act.push(ax, az);
        act.push(bx, bz);
      } else cerrar();
    }
    cerrar();
  }

  /* Los UV de atlas se guardan en filas; acá se pasan a 0..1 ya sabiendo cuántas filas hay */
  const filas = Math.max(1, Math.ceil(slot / 2));
  for (const { i0, n } of pendientesUv) for (let i = i0; i < i0 + n; i++) det.uv[i * 2 + 1] = 1 - det.uv[i * 2 + 1] / filas;

  const lotesProps: LoteProp[] = [];
  props.forEach((d, tipo) => { if (d.length) lotesProps.push({ tipo, d: new Float32Array(d) }); });
  return {
    gx, gy, mapa: mapa.mapa, ladoMapa: mapa.lado,
    suelo: { pos: new Float32Array(suelo.pos), col: new Uint8Array(suelo.col), mat: new Uint8Array(suelo.mat), idx: new Uint32Array(suelo.idx) },
    edif: { pos: new Float32Array(eP), uv: new Float32Array(eU), ven: new Float32Array(eV), est: new Uint8Array(eE), nor: new Int8Array(eN), col: new Uint8Array(eC), idx: new Uint32Array(eI) },
    det: { pos: new Float32Array(det.pos), uv: new Float32Array(det.uv), nor: new Int8Array(det.nor), col: new Uint8Array(det.col), idx: new Uint32Array(det.idx) },
    kit: [...kit.lotes(), ...fijo.lotes(true)], props: lotesProps, arboles: new Float32Array(arboles),
    colision: new Float32Array(colision), tramos: new Float32Array(tramos), nombres, locales, carteles, atlasFilas: filas, vias, singulares,
  };
}

const CON_AUTOS = new Set(["motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential", "primary_link", "secondary_link", "tertiary_link", "trunk_link", "motorway_link"]);

function centroAnillo(r: number[]): [number, number] {
  let x = 0, z = 0;
  const n = r.length / 2;
  for (let i = 0; i < n; i++) { x += r[i * 2]; z += r[i * 2 + 1]; }
  return [x / n, z / n];
}
