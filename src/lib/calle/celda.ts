/* Arma la geometría de una celda (unos 200 m de lado) a partir de un tile decodificado.
   Corre en el worker, y si no hay worker en el hilo principal. No toca Three ni el DOM.

   El suelo se pinta "de abajo para arriba" sin buffer de profundidad: base, parques, veredas,
   cordón, asfalto, marcas y sombritas, en ese orden dentro del mismo buffer. Por eso las esquinas
   salen solas (el asfalto de una calle tapa la vereda de la otra) y nunca hay parpadeo de capas. */
import { Earcut } from "three/src/extras/Earcut.js";
import { clasificar, abreviarCalle } from "./categorias";
import { DIV, hash, hashTexto, hexARgb } from "./geo";
import { BUCKET_EDIF, dentroDe, recortar, type Edif, type Poi, type TileDatos, type Via } from "./decodificar";
import type { Cartel, CeldaDatos, Local, Rubro, ViaTrafico } from "./tipos";

type C4 = readonly [number, number, number, number];

const M_LISO: C4 = [0, 0, 0, 0], M_ASF: C4 = [255, 0, 0, 0], M_BAL: C4 = [0, 255, 0, 0], M_PASTO: C4 = [0, 0, 255, 0], M_AGUA: C4 = [0, 0, 0, 128], M_LUZ: C4 = [0, 0, 0, 255];
const C_BASE: C4 = [206, 195, 174, 255], C_VEREDA: C4 = [224, 212, 188, 255], C_CORDON: C4 = [236, 230, 216, 255], C_CUNETA: C4 = [62, 60, 68, 255];
const C_ASF: C4 = [92, 90, 98, 255], C_ASF_AV: C4 = [84, 82, 92, 255], C_LINEA: C4 = [238, 234, 222, 255], C_CEBRA: C4 = [240, 236, 226, 255];
const C_PASTO: C4 = [136, 178, 92, 255], C_BOSQUE: C4 = [104, 158, 84, 255], C_PARQUE: C4 = [146, 190, 104, 255], C_AGUA: C4 = [84, 164, 196, 255], C_ARENA: C4 = [226, 208, 164, 255];
const C_SENDA: C4 = [214, 200, 168, 255], C_BALASTO: C4 = [134, 124, 116, 255], C_RIEL: C4 = [70, 68, 72, 255];

const CALLES_AUTO = new Set(["motorway", "trunk", "primary", "secondary", "tertiary", "minor"]);
const CON_AUTOS = new Set(["trunk", "primary", "secondary", "tertiary"]);
const PALETA_BAJOS = ["#EAD9B6", "#DDB98F", "#CC8B70", "#E8C9A8", "#F2E7D3", "#BDA78F", "#D7A877", "#ABC3C4", "#E7BBA8", "#C5CBA9", "#E2CF9E", "#D4A58F"].map(hexARgb);
const PALETA_ALTOS = ["#DCD5C7", "#CBC4B7", "#E6DDCD", "#BDB8AE", "#D1C3B1", "#AEB9C0", "#DFD2C2", "#C3B3A0", "#D6CDBB"].map(hexARgb);

class Capa {
  pos: number[] = [];
  col: number[] = [];
  mat: number[] = [];
  idx: number[] = [];
  v(x: number, z: number, c: C4, m: C4, a = c[3]) {
    const i = this.pos.length / 2;
    this.pos.push(x, z);
    this.col.push(c[0], c[1], c[2], a);
    this.mat.push(m[0], m[1], m[2], m[3]);
    return i;
  }
  t(a: number, b: number, c: number) { this.idx.push(a, b, c); }
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
    const i = this.pos.length / 3;
    const nb = n.map((v) => Math.round(v * 127));
    this.v(a[0], a[1], a[2], uv[0], uv[1], nb, col, k);
    this.v(b[0], b[1], b[2], uv[2], uv[1], nb, col, k);
    this.v(c[0], c[1], c[2], uv[2], uv[3], nb, col, k);
    this.v(d[0], d[1], d[2], uv[0], uv[3], nb, col, k);
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
  /** Caja vertical alrededor de un punto (postes, tubos). */
  poste(x: number, z: number, y0: number, y1: number, r: number, col: readonly number[]) {
    const lados: [number, number, number, number, number, number][] = [
      [-r, r, r, r, 0, 1], [r, r, r, -r, 1, 0], [r, -r, -r, -r, 0, -1], [-r, -r, -r, r, -1, 0],
    ];
    for (const [ax, az, bx, bz, nx, nz] of lados) this.q([x + ax, y0, z + az], [x + bx, y0, z + bz], [x + bx, y1, z + bz], [x + ax, y1, z + az], [nx, 0, nz], [0, 0, 1, 1], col, 0);
  }
}

interface Seg { ax: number; az: number; bx: number; bz: number; dx: number; dz: number; L: number; v: Via }
interface Brazo { dx: number; dz: number; hw: number; ac: number; clase: string; nombre: string | null }
interface Esquina { x: number; z: number; brazos: Brazo[] }

function enEdif(t: TileDatos, x: number, z: number, excl?: Edif): Edif | null {
  const l = t.grillaEdif.get(Math.floor(z / BUCKET_EDIF) * 4096 + Math.floor(x / BUCKET_EDIF));
  if (!l) return null;
  for (const e of l) {
    if (e === excl || x < e.caja[0] || x > e.caja[2] || z < e.caja[1] || z > e.caja[3]) continue;
    if (dentroDe(e.anillo, x, z)) return e;
  }
  return null;
}

/** Para cada pared: 0 normal, 1 medianera (sin ventanas), 2 tapada por el vecino (no se dibuja). */
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
      const v = enEdif(t, ax + dx * f + nx * 1.1, az + dz * f + nz * 1.1, e);
      if (v) { tapa++; if (v.h < e.h - 0.5) alto = false; } else alto = false;
    }
    o[i] = tapa === 3 && alto ? 2 : tapa > 0 ? 1 : 0;
  }
  e.oculta = o;
  return o;
}

function calleCerca(t: TileDatos, x: number, z: number, radio: number, dx = 0, dz = 0): string | null {
  const c0 = Math.floor(x / 32), f0 = Math.floor(z / 32);
  let mejor: string | null = null, md = radio;
  for (let f = f0 - 1; f <= f0 + 1; f++) for (let c = c0 - 1; c <= c0 + 1; c++) {
    const l = t.grillaNombre.get(f * 4096 + c);
    if (!l) continue;
    for (const s of l) {
      const sx = s.bx - s.ax, sz = s.bz - s.az, L2 = sx * sx + sz * sz;
      if (!L2) continue;
      if ((dx || dz) && Math.abs(sx * dx + sz * dz) / Math.sqrt(L2) < 0.8) continue;
      const q = Math.max(0, Math.min(1, ((x - s.ax) * sx + (z - s.az) * sz) / L2));
      const d = Math.hypot(x - s.ax - sx * q, z - s.az - sz * q);
      if (d < md) { md = d; mejor = s.n.nombre; }
    }
  }
  return mejor;
}

export function armarCelda(t: TileDatos, gx: number, gy: number): CeldaDatos {
  const cx = gx - t.tx * DIV, cy = gy - t.ty * DIV, C = t.m / DIV, ox = cx * C, oz = cy * C;
  const ind = t.celdas[cy * DIV + cx];
  const adentro = (x: number, z: number) => x >= ox && x < ox + C && z >= oz && z < oz + C;
  const cBase = new Capa(), cPoli = new Capa(), cVereda = new Capa(), cCordon = new Capa(), cCuneta = new Capa(), cAsf = new Capa(), cMarca = new Capa(), cSombra = new Capa();
  const det = new MallaD();
  const eP: number[] = [], eU: number[] = [], eN: number[] = [], eC: number[] = [], eI: number[] = [];
  const props: number[] = [], colision: number[] = [], tramos: number[] = [], nombres: string[] = [];
  const locales: Local[] = [], carteles: Cartel[] = [], vias: ViaTrafico[] = [];

  /* Suelo base */
  {
    const a = cBase.v(-0.5, -0.5, C_BASE, M_BAL), b = cBase.v(C + 0.5, -0.5, C_BASE, M_BAL), c = cBase.v(C + 0.5, C + 0.5, C_BASE, M_BAL), d = cBase.v(-0.5, C + 0.5, C_BASE, M_BAL);
    cBase.q(a, b, c, d);
  }

  /* Parques, pasto y agua */
  const orden: Record<string, number> = { arena: 0, pasto: 1, parque: 2, bosque: 3, agua: 4 };
  const polis = [...ind.polis].sort((a, b) => orden[a.tipo] - orden[b.tipo]);
  for (const p of polis) {
    const col = p.tipo === "agua" ? C_AGUA : p.tipo === "bosque" ? C_BOSQUE : p.tipo === "parque" ? C_PARQUE : p.tipo === "arena" ? C_ARENA : C_PASTO;
    const mat = p.tipo === "agua" ? M_AGUA : p.tipo === "arena" ? M_BAL : M_PASTO;
    const plano: number[] = [], huecos: number[] = [];
    p.anillos.forEach((r, i) => {
      const q = recortar(r, ox - 1, oz - 1, ox + C + 1, oz + C + 1);
      if (q.length < 6) { if (!i) plano.length = 0; return; }
      if (i) huecos.push(plano.length / 2);
      for (const v of q) plano.push(v);
    });
    if (plano.length < 6) continue;
    const tri = Earcut.triangulate(plano, huecos, 2), base = cPoli.pos.length / 2;
    for (let i = 0; i < plano.length; i += 2) cPoli.v(plano[i] - ox, plano[i + 1] - oz, col, mat);
    for (const i of tri) cPoli.idx.push(base + i);
  }

  /* Tiras de calle: un cuadrilátero por tramo y un disco en cada vértice */
  const tira = (c: Capa, v: Via, hw: number, col: C4, mat: C4, redondo = true) => {
    const p = v.pts, n = p.length / 2, m = hw + 1;
    for (let i = 0; i + 1 < n; i++) {
      const ax = p[i * 2], az = p[i * 2 + 1], bx = p[i * 2 + 2], bz = p[i * 2 + 3];
      if (Math.max(ax, bx) < ox - m || Math.min(ax, bx) > ox + C + m || Math.max(az, bz) < oz - m || Math.min(az, bz) > oz + C + m) continue;
      const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
      if (L < 0.01) continue;
      const nx = (-dz / L) * hw, nz = (dx / L) * hw;
      const a = c.v(ax + nx - ox, az + nz - oz, col, mat), b = c.v(bx + nx - ox, bz + nz - oz, col, mat), e = c.v(bx - nx - ox, bz - nz - oz, col, mat), d = c.v(ax - nx - ox, az - nz - oz, col, mat);
      c.q(a, b, e, d);
    }
    if (!redondo) return;
    const pasos = hw > 3 ? 12 : 8;
    for (let i = 0; i < n; i++) {
      const x = p[i * 2], z = p[i * 2 + 1];
      if (x < ox - m || x > ox + C + m || z < oz - m || z > oz + C + m) continue;
      if (i > 0 && i + 1 < n) {
        const d1x = x - p[i * 2 - 2], d1z = z - p[i * 2 - 1], d2x = p[i * 2 + 2] - x, d2z = p[i * 2 + 3] - z;
        const co = (d1x * d2x + d1z * d2z) / (Math.hypot(d1x, d1z) * Math.hypot(d2x, d2z) || 1);
        if (co > 0.995) continue;
      }
      const cen = c.v(x - ox, z - oz, col, mat);
      let prev = c.v(x + hw - ox, z - oz, col, mat);
      const pri = prev;
      for (let k = 1; k <= pasos; k++) {
        const a = (k / pasos) * Math.PI * 2;
        const q = k === pasos ? pri : c.v(x + Math.cos(a) * hw - ox, z + Math.sin(a) * hw - oz, col, mat);
        c.t(cen, q, prev);
        prev = q;
      }
    }
  };

  const viasOrd = [...ind.vias].sort((a, b) => a.hw - b.hw);
  for (const v of viasOrd) {
    if (v.clase === "rail" || v.clase === "transit") {
      tira(cCordon, v, 1.7, C_BALASTO, M_BAL);
      tira(cAsf, v, 0.55, [108, 96, 88, 255], M_ASF, false);
      continue;
    }
    if (v.clase === "path" || v.clase === "track") { tira(cCordon, v, v.hw, C_SENDA, M_BAL); continue; }
    if (v.clase === "peatonal") { tira(cVereda, v, v.hw, C_CORDON, M_BAL); continue; }
    if (v.clase === "service") { tira(cCuneta, v, v.hw + 0.2, C_CORDON, M_LISO); tira(cAsf, v, v.hw, [120, 116, 118, 255], M_ASF); continue; }
    if (v.acera > 0) tira(cVereda, v, v.hw + v.acera, C_VEREDA, M_BAL);
    tira(cCordon, v, v.hw + 0.3, C_CORDON, M_LISO);
    tira(cCuneta, v, v.hw, C_CUNETA, M_LISO);
    tira(cAsf, v, v.hw - 0.22, v.hw > 6 ? C_ASF_AV : C_ASF, M_ASF);
  }

  /* Segmentos cercanos, para esquinas, chequeos y nombres */
  const segs: Seg[] = [];
  for (const v of ind.vias) {
    if (!CALLES_AUTO.has(v.clase)) continue;
    for (let i = 0; i + 3 < v.pts.length; i += 2) {
      const ax = v.pts[i], az = v.pts[i + 1], bx = v.pts[i + 2], bz = v.pts[i + 3];
      if (Math.max(ax, bx) < ox - 12 || Math.min(ax, bx) > ox + C + 12 || Math.max(az, bz) < oz - 12 || Math.min(az, bz) > oz + C + 12) continue;
      const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
      if (L > 0.3) segs.push({ ax, az, bx, bz, dx: dx / L, dz: dz / L, L, v });
    }
  }
  const distSeg = (s: Seg, x: number, z: number) => {
    const q = Math.max(0, Math.min(s.L, (x - s.ax) * s.dx + (z - s.az) * s.dz));
    return Math.hypot(x - s.ax - s.dx * q, z - s.az - s.dz * q);
  };
  const enCalzada = (x: number, z: number, m = 0.3) => segs.some((s) => distSeg(s, x, z) < s.v.hw + m);

  /* Esquinas: donde se cruzan dos tramos. No alcanza con nodos compartidos: el tile simplifica. */
  const hits: { x: number; z: number; d: Seg[] }[] = [];
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
    const a = segs[i], b = segs[j];
    if (a.v === b.v) continue;
    const cr = a.dx * b.dz - a.dz * b.dx;
    if (Math.abs(cr) < 0.45) continue;
    const ex = b.ax - a.ax, ez = b.az - a.az, ta = (ex * b.dz - ez * b.dx) / cr, tb = (ex * a.dz - ez * a.dx) / cr;
    if (ta < -3 || ta > a.L + 3 || tb < -3 || tb > b.L + 3) continue;
    const x = a.ax + a.dx * ta, z = a.az + a.dz * ta;
    if (!adentro(x, z)) continue;
    const h = hits.find((q) => Math.hypot(q.x - x, q.z - z) < 11);
    if (h) { h.d.push(a, b); } else hits.push({ x, z, d: [a, b] });
  }
  const esquinas: Esquina[] = [];
  for (const h of hits) {
    const brazos: Brazo[] = [];
    for (const s of h.d) for (const sg of [1, -1]) {
      const dx = s.dx * sg, dz = s.dz * sg;
      if (brazos.some((b) => b.dx * dx + b.dz * dz > 0.85)) continue;
      const px = h.x + dx * 12, pz = h.z + dz * 12;
      if (!segs.some((q) => Math.abs(q.dx * dx + q.dz * dz) > 0.8 && distSeg(q, px, pz) < 3.5)) continue;
      const nom = calleCerca(t, h.x + dx * 6, h.z + dz * 6, 12, dx, dz);
      brazos.push({ dx, dz, hw: s.v.hw, ac: s.v.acera, clase: s.v.clase, nombre: nom });
    }
    if (brazos.length >= 2) esquinas.push({ x: h.x, z: h.z, brazos });
  }

  /* Marcas: líneas de carril y cebras */
  const marca = (ax: number, az: number, bx: number, bz: number, hw: number, col: C4) => {
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1, nx = (-dz / L) * hw, nz = (dx / L) * hw;
    const a = cMarca.v(ax + nx - ox, az + nz - oz, col, M_ASF), b = cMarca.v(bx + nx - ox, bz + nz - oz, col, M_ASF), c = cMarca.v(bx - nx - ox, bz - nz - oz, col, M_ASF), d = cMarca.v(ax - nx - ox, az - nz - oz, col, M_ASF);
    cMarca.q(a, b, c, d);
  };
  const cercaEsquina = (x: number, z: number, m: number) => esquinas.some((e) => Math.hypot(e.x - x, e.z - z) < m);
  for (const v of ind.vias) {
    if (v.hw < 5 || !CALLES_AUTO.has(v.clase)) continue;
    const carriles = v.sentido ? Math.max(2, Math.round((v.hw * 2) / 3.2)) : 2;
    let s = 0;
    for (let i = 0; i + 3 < v.pts.length; i += 2) {
      const ax = v.pts[i], az = v.pts[i + 1], bx = v.pts[i + 2], bz = v.pts[i + 3], L = Math.hypot(bx - ax, bz - az);
      if (L < 0.5) continue;
      if (Math.max(ax, bx) < ox - 2 || Math.min(ax, bx) > ox + C + 2 || Math.max(az, bz) < oz - 2 || Math.min(az, bz) > oz + C + 2) { s += L; continue; }
      const dx = (bx - ax) / L, dz = (bz - az) / L, nx = -dz, nz = dx;
      const ini = Math.ceil(s / 8) * 8 - s;
      for (let q = ini; q < L; q += 8) {
        const fin = Math.min(L, q + 3);
        for (let c = 1; c < carriles; c++) {
          const of = -v.hw + ((v.hw * 2) / carriles) * c;
          const x0 = ax + dx * q + nx * of, z0 = az + dz * q + nz * of;
          if (cercaEsquina(x0, z0, v.hw + 11)) continue;
          marca(x0, z0, ax + dx * fin + nx * of, az + dz * fin + nz * of, 0.07, C_LINEA);
        }
      }
      s += L;
    }
  }
  for (const e of esquinas) for (const b of e.brazos) {
    if (b.clase === "motorway") continue;
    let otro = 0;
    for (const o of e.brazos) if (Math.abs(o.dx * b.dx + o.dz * b.dz) < 0.75) otro = Math.max(otro, o.hw);
    const D = otro + 1.4 + 1.6, nx = -b.dz, nz = b.dx, n = Math.floor((b.hw * 2 - 0.8) / 1.1);
    for (let i = 0; i < n; i++) {
      const of = -b.hw + 0.6 + 0.3 + i * 1.1 + (b.hw * 2 - 0.8 - n * 1.1) / 2;
      const x = e.x + b.dx * D + nx * of, z = e.z + b.dz * D + nz * of;
      marca(x - b.dx * 1.6, z - b.dz * 1.6, x + b.dx * 1.6, z + b.dz * 1.6, 0.28, C_CEBRA);
    }
  }

  /* Sombra blanda en el piso al pie de cada edificio (oclusión barata) */
  const aoEdif = (e: Edif) => {
    const a = e.anillo, n = a.length / 2, oc = paredes(t, e);
    const nvx = new Float32Array(n), nvz = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, dx = a[j * 2] - a[i * 2], dz = a[j * 2 + 1] - a[i * 2 + 1], L = Math.hypot(dx, dz) || 1;
      nvx[i] += dz / L; nvz[i] -= dx / L; nvx[j] += dz / L; nvz[j] -= dx / L;
    }
    for (let i = 0; i < n; i++) { const L = Math.hypot(nvx[i], nvz[i]) || 1; nvx[i] /= L; nvz[i] /= L; }
    const ob: C4 = [34, 26, 40, 0], an = 1.5 + Math.min(1.5, e.h / 30);
    for (let i = 0; i < n; i++) {
      if (oc[i] === 2 || e.borde[i]) continue;
      const j = (i + 1) % n, ax = a[i * 2] - ox, az = a[i * 2 + 1] - oz, bx = a[j * 2] - ox, bz = a[j * 2 + 1] - oz;
      const p = cSombra.v(ax, az, ob, M_LISO, 118), q = cSombra.v(bx, bz, ob, M_LISO, 118);
      const r = cSombra.v(bx + nvx[j] * an, bz + nvz[j] * an, ob, M_LISO, 0), s = cSombra.v(ax + nvx[i] * an, az + nvz[i] * an, ob, M_LISO, 0);
      cSombra.q(p, s, r, q);
    }
  };
  for (const e of ind.edifs) aoEdif(e);

  const mancha = (x: number, z: number, r: number, col: C4, a: number, mat: C4 = M_LISO) => {
    const cen = cSombra.v(x - ox, z - oz, col, mat, a), o = cSombra.pos.length / 2, n = 8;
    for (let i = 0; i < n; i++) { const g = (i / n) * Math.PI * 2; cSombra.v(x - ox + Math.cos(g) * r, z - oz + Math.sin(g) * r, col, mat, 0); }
    for (let i = 0; i < n; i++) cSombra.t(cen, o + ((i + 1) % n), o + i);
  };

  /* Paredes: una tira por arista. Las medianeras van sin ventanas */
  const pared = (e: { h: number; minH: number; hash: number; col: readonly number[]; pisoH: number }, ax: number, az: number, bx: number, bz: number, ciega: boolean, ventana: number) => {
    const L = Math.hypot(bx - ax, bz - az), nx = (bz - az) / L, nz = -(bx - ax) / L;
    const n = L < 2.2 ? 1 : Math.max(1, Math.round(L / ventana)), u = ciega ? -1 : n;
    const i = eP.length / 3, y0 = e.minH, y1 = e.h, s = Math.round(e.hash * 255);
    eP.push(ax - ox, y0, az - oz, bx - ox, y0, bz - oz, bx - ox, y1, bz - oz, ax - ox, y1, az - oz);
    const inicio = ciega ? -1 : 0, uv = [inicio, y0, e.pisoH, y1, u, y0, e.pisoH, y1, u, y1, e.pisoH, y1, inicio, y1, e.pisoH, y1];
    for (const v of uv) eU.push(v);
    const a = Math.round(nx * 127), b = Math.round(nz * 127);
    for (let k = 0; k < 4; k++) { eN.push(a, b); eC.push(e.col[0], e.col[1], e.col[2], s); }
    eI.push(i, i + 2, i + 1, i, i + 3, i + 2);
  };
  const datosEdif = (e: Edif) => {
    const paleta = e.h >= 16 ? PALETA_ALTOS : PALETA_BAJOS;
    const col = paleta[Math.floor(e.hash * 997) % paleta.length];
    const conPb = e.minH < 1;
    const pisos = e.h <= 4.6 ? 1 : Math.max(1, Math.round((e.h - e.minH - (conPb ? 3.4 : 0)) / 2.95));
    const pisoH = ((e.h - e.minH - (conPb ? 3.4 : 0)) / pisos) * (conPb ? 1 : -1);
    return { h: e.h, minH: e.minH, hash: e.hash, col, pisoH, ventana: 2.7 + ((e.hash * 13) % 1) * 1.1 };
  };
  for (const e of ind.edifs) {
    if (!adentro(e.cx, e.cz)) continue;
    const a = e.anillo, n = a.length / 2, oc = paredes(t, e), d = datosEdif(e);
    for (let i = 0; i < n; i++) {
      if (e.borde[i] || oc[i] === 2) continue;
      const j = (i + 1) % n, ax = a[i * 2], az = a[i * 2 + 1], bx = a[j * 2], bz = a[j * 2 + 1];
      pared(d, ax, az, bx, bz, oc[i] === 1, d.ventana);
      colision.push(ax - ox, az - oz, bx - ox, bz - oz);
    }
  }

  /* Locales: cada POI busca la pared más cercana con lugar libre */
  let slot = 0;
  const MAX_SLOTS = 44;
  const pedirSlot = (c: Omit<Cartel, "slot">) => {
    if (slot >= MAX_SLOTS) return -1;
    carteles.push({ ...c, slot });
    return slot++;
  };
  const filasEn = (s: number) => Math.floor(s / 2);
  const uvSlot = (s: number): number[] => {
    if (s < 0) return [0, 0, 0, 0];
    return [(s % 2) * 0.5 + 0.003, filasEn(s), ((s % 2) + 1) * 0.5 - 0.003, filasEn(s) + 1];
  };
  const pendientesUv: { i0: number; n: number }[] = [];
  const conUvAtlas = (f: () => void) => { const i0 = det.uv.length / 2; f(); pendientesUv.push({ i0, n: det.uv.length / 2 - i0 }); };

  const frente = (p: Poi, rubro: Rubro, x: number, z: number, nx: number, nz: number, w: number, altura: number, pisos: number) => {
    const s = pedirSlot({ tipo: "local", texto: p.nombre, rubro });
    const lx = x - ox, lz = z - oz, rx = nz, rz = -nx;
    const col = hexARgb(rubro.color);
    const P = (r: number, y: number, n: number) => [lx + rx * r + nx * n, y, lz + rz * r + nz * n];
    const h = w / 2;
    det.q(P(-h, 0, 0.07), P(h, 0, 0.07), P(h, 2.72, 0.07), P(-h, 2.72, 0.07), [nx, 0, nz], [0, 0, w, 2.72], col, 1);
    if (s >= 0) conUvAtlas(() => det.q(P(-h, 2.74, 0.16), P(h, 2.74, 0.16), P(h, 3.48, 0.16), P(-h, 3.48, 0.16), [nx, 0, nz], uvSlot(s), col, 3));
    else det.q(P(-h, 2.74, 0.16), P(h, 2.74, 0.16), P(h, 3.48, 0.16), P(-h, 3.48, 0.16), [nx, 0, nz], [0, 0, 1, 1], col, 0);
    det.q(P(-h, 3.48, 0.16), P(h, 3.48, 0.16), P(h, 3.48, 0.02), P(-h, 3.48, 0.02), [0, 1, 0], [0, 0, 1, 1], [234, 228, 216], 0);
    if (rubro.toldo) {
      const ny = 0.84, nh = 0.54;
      det.q(P(-h + 0.05, 2.28, 1.3), P(h - 0.05, 2.28, 1.3), P(h - 0.05, 2.76, 0.12), P(-h + 0.05, 2.76, 0.12), [nx * nh, ny, nz * nh], [0, 0, w, 1], col, 2);
      det.q(P(-h + 0.05, 2.08, 1.3), P(h - 0.05, 2.08, 1.3), P(h - 0.05, 2.28, 1.3), P(-h + 0.05, 2.28, 1.3), [nx, 0, nz], [0, 0, w, 0.2], col, 2);
    }
    if (rubro.cruz) {
      const a = P(h + 0.08, 3.05, 0.08), b = P(h + 0.08, 3.05, 0.92), c = P(h + 0.08, 3.9, 0.92), d = P(h + 0.08, 3.9, 0.08);
      det.q(a, b, c, d, [rx, 0, rz], [0, 0, 1, 1], col, 5);
      det.q(b, a, d, c, [-rx, 0, -rz], [0, 0, 1, 1], col, 5);
    }
    const c1: C4 = [255, 214, 150, 0], g0 = cSombra.pos.length / 2;
    const px = (r: number, n: number): [number, number] => [lx + rx * r + nx * n, lz + rz * r + nz * n];
    const [a0, a1] = px(-h, 0.1), [b0, b1] = px(h, 0.1), [c0, c11] = px(h + 1, 4), [d0, d1] = px(-h - 1, 4);
    cSombra.v(a0, a1, c1, M_LUZ, 150); cSombra.v(b0, b1, c1, M_LUZ, 150); cSombra.v(c0, c11, c1, M_LUZ, 0); cSombra.v(d0, d1, c1, M_LUZ, 0);
    cSombra.q(g0, g0 + 3, g0 + 2, g0 + 1);

    const puerta = t.puertas.reduce<{ d: number; num: string } | null>((m, q) => {
      const dd = Math.hypot(q.x - p.x, q.z - p.z);
      return dd < 30 && (!m || dd < m.d) ? { d: dd, num: q.num } : m;
    }, null);
    const calle = calleCerca(t, p.x, p.z, 34);
    const direccion = calle ? `${abreviarCalle(calle)}${puerta ? " " + puerta.num : ""}` : null;
    locales.push({
      id: `${gx}_${gy}_${locales.length}`, nombre: p.nombre, rubro, x: lx, z: lz, nx, nz, ancho: w, pisos, altura, direccion, px: p.x - ox, pz: p.z - oz,
    });
  };

  const distCalle = (x: number, z: number) => { let m = Infinity; for (const s of segs) m = Math.min(m, distSeg(s, x, z) - s.v.hw); return m; };
  const visto = new Set<string>();
  const pois = [...ind.pois].sort((a, b) => a.rank - b.rank).slice(0, 40);
  for (const p of pois) {
    const rubro = clasificar(p.clase, p.subclase);
    if (!rubro) continue;
    const llave = `${p.nombre}|${Math.round(p.x / 6)}|${Math.round(p.z / 6)}`;
    if (visto.has(llave)) continue;
    visto.add(llave);
    const cands: { e: Edif; i: number; d: number; q: number; L: number }[] = [];
    const vistos = new Set<Edif>();
    const b0 = Math.floor(p.x / BUCKET_EDIF), b1 = Math.floor(p.z / BUCKET_EDIF);
    for (let f = b1 - 1; f <= b1 + 1; f++) for (let c = b0 - 1; c <= b0 + 1; c++) for (const e of t.grillaEdif.get(f * 4096 + c) ?? []) {
      if (vistos.has(e) || e.minH > 1) continue;
      vistos.add(e);
      const a = e.anillo, n = a.length / 2, oc = paredes(t, e);
      for (let i = 0; i < n; i++) {
        if (oc[i] !== 0 || e.borde[i]) continue;
        const j = (i + 1) % n, ax = a[i * 2], az = a[i * 2 + 1], dx = a[j * 2] - ax, dz = a[j * 2 + 1] - az, L = Math.hypot(dx, dz);
        if (L < 3.4) continue;
        const q = Math.max(0, Math.min(L, ((p.x - ax) * dx + (p.z - az) * dz) / L));
        const d = Math.hypot(p.x - ax - (dx / L) * q, p.z - az - (dz / L) * q);
        if (d > 30) continue;
        const mx = ax + (dx / L) * q + (dz / L) * 2, mz = az + (dz / L) * q - (dx / L) * 2;
        cands.push({ e, i, d: d + (distCalle(mx, mz) > 13 ? 12 : 0), q, L });
      }
    }
    cands.sort((a, b) => a.d - b.d);
    let puesto = false;
    const w0 = Math.min(8.2, Math.max(4.6, 3.4 + p.nombre.length * 0.22));
    for (const k of cands.slice(0, 6)) {
      const w = Math.min(w0, k.L - 0.5), a = k.e.anillo, n = a.length / 2, j = (k.i + 1) % n;
      const ax = a[k.i * 2], az = a[k.i * 2 + 1], tx = (a[j * 2] - ax) / k.L, tz = (a[j * 2 + 1] - az) / k.L;
      const lista = k.e.ocupado.get(k.i) ?? [];
      const lo = w / 2 + 0.25, hi = k.L - w / 2 - 0.25;
      let s = -1;
      for (const off of [0, w + 0.3, -(w + 0.3), 2 * (w + 0.3), -2 * (w + 0.3)]) {
        const c = Math.max(lo, Math.min(hi, k.q + off));
        if (lista.every(([x, y]) => c + w / 2 + 0.15 < x || c - w / 2 - 0.15 > y)) { s = c; break; }
      }
      if (s < 0) continue;
      lista.push([s - w / 2, s + w / 2]);
      k.e.ocupado.set(k.i, lista);
      const pisos = Math.max(1, Math.round((k.e.h + 0.2) / 3));
      frente(p, rubro, ax + tx * s, az + tz * s, tz, -tx, w, k.e.h, pisos);
      puesto = true;
      break;
    }
    if (puesto || !adentro(p.x, p.z) || enCalzada(p.x, p.z, 1)) continue;
    /* Sin edificio mapeado: una casilla chica en el punto del POI, mirando a la calle */
    let nx = 0, nz = 1, md = Infinity;
    for (const s of segs) {
      const d = distSeg(s, p.x, p.z);
      if (d < md) {
        md = d;
        const q = Math.max(0, Math.min(s.L, (p.x - s.ax) * s.dx + (p.z - s.az) * s.dz)), hx = s.ax + s.dx * q - p.x, hz = s.az + s.dz * q - p.z, L = Math.hypot(hx, hz) || 1;
        nx = hx / L; nz = hz / L;
      }
    }
    if (enEdif(t, p.x, p.z)) continue;
    const rx = nz, rz = -nx, A = 3.1, F = 2.6;
    const px = (r: number, f: number) => [p.x + rx * r + nx * f, p.z + rz * r + nz * f];
    const rin = [px(-A, F), px(A, F), px(A, -F), px(-A, -F)];
    const color = hexARgb("#E9DFCF");
    const d = { h: 4, minH: 0, hash: hash(hashTexto(p.nombre)), col: color, pisoH: 4 };
    for (let i = 0; i < 4; i++) {
      const a = rin[(i + 1) % 4], b = rin[i];
      pared(d, a[0], a[1], b[0], b[1], true, 3);
      colision.push(a[0] - ox, a[1] - oz, b[0] - ox, b[1] - oz);
    }
    const f = px(0, F);
    frente(p, rubro, f[0], f[1], nx, nz, 6, 4, 1);
  }

  /* Árboles y farolas de vereda */
  const pozo = (x: number, z: number) => { const c: C4 = [86, 66, 48, 255]; marcaPozo(x, z, 0.62, c); };
  const marcaPozo = (x: number, z: number, r: number, c: C4) => {
    const a = cCordon.v(x - r - ox, z - r - oz, c, M_LISO), b = cCordon.v(x + r - ox, z - r - oz, c, M_LISO), d = cCordon.v(x + r - ox, z + r - oz, c, M_LISO), e = cCordon.v(x - r - ox, z + r - oz, c, M_LISO);
    cCordon.q(e, d, b, a);
  };
  for (const v of ind.vias) {
    if (v.acera < 2 || !CALLES_AUTO.has(v.clase)) continue;
    let s = 0;
    const paso = 10.5, sem = v.id * 7 + 3;
    for (let i = 0; i + 3 < v.pts.length; i += 2) {
      const ax = v.pts[i], az = v.pts[i + 1], bx = v.pts[i + 2], bz = v.pts[i + 3], L = Math.hypot(bx - ax, bz - az);
      if (L < 0.5) continue;
      const dx = (bx - ax) / L, dz = (bz - az) / L, nx = -dz, nz = dx;
      for (let q = Math.ceil(s / paso) * paso - s; q < L; q += paso) {
        const k = Math.round((s + q) / paso);
        for (const lado of [1, -1]) {
          const x = ax + dx * q + nx * lado * (v.hw + 1.05), z = az + dz * q + nz * lado * (v.hw + 1.05);
          if (!adentro(x, z)) continue;
          const r = hash(sem + k, lado);
          if (k % 3 === 1 && v.hw > 4.3) {
            if (!enEdif(t, x, z) && !enCalzada(x, z, 0.5)) {
              props.push(x - ox, z - oz, 1, Math.atan2(-nx * lado, -nz * lado), 1);
              mancha(x, z, 8, [255, 214, 150, 0], 110, M_LUZ);
            }
            continue;
          }
          if (r < 0.28 || cercaEsquina(x, z, v.hw + 10) || enCalzada(x, z, 0.5) || enEdif(t, x, z) || enEdif(t, x + nx * lado * 1.4, z + nz * lado * 1.4)) continue;
          const jac = r > 0.9;
          props.push(x - ox, z - oz, 0.78 + r * 0.5, r * 6.28, jac ? 2 : 0);
          pozo(x, z);
          mancha(x, z, 2.6, [26, 40, 26, 0], 92);
        }
      }
      s += L;
    }
  }
  /* Árboles de parque, en una grilla con ruido */
  for (const p of polis) {
    if (p.tipo === "agua" || p.tipo === "arena") continue;
    const r = p.anillos[0], paso = p.tipo === "bosque" ? 8 : 11;
    for (let i = Math.ceil(ox / paso); i * paso < ox + C; i++) for (let j = Math.ceil(oz / paso); j * paso < oz + C; j++) {
      const h = hash(i, j), x = i * paso + (hash(j, i) - 0.5) * paso * 0.8, z = j * paso + (h - 0.5) * paso * 0.8;
      if (h < 0.42 || !adentro(x, z) || !dentroDe(r, x, z) || enEdif(t, x, z) || enCalzada(x, z, 2)) continue;
      if (ind.vias.some((v) => (v.clase === "path" || v.clase === "peatonal") && cercaLinea(v.pts, x, z, 1.6))) continue;
      props.push(x - ox, z - oz, 0.95 + h * 0.7, h * 6.28, h > 0.93 ? 2 : 0);
      mancha(x, z, 3.2, [26, 40, 26, 0], 92);
    }
  }

  /* Cartel de calle en cada esquina, con el nombre real */
  for (const e of esquinas) {
    const con = e.brazos.filter((b) => b.nombre);
    if (con.length < 2) continue;
    const a = con[0];
    const b = con.find((q) => Math.abs(q.dx * a.dx + q.dz * a.dz) < 0.7);
    if (!b) continue;
    let sx = 0, sz = 0, ok = false;
    for (const [s1, s2] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      sx = e.x + a.dx * s1 * (b.hw + 1.1) + b.dx * s2 * (a.hw + 1.1);
      sz = e.z + a.dz * s1 * (b.hw + 1.1) + b.dz * s2 * (a.hw + 1.1);
      if (!enEdif(t, sx, sz) && !enCalzada(sx, sz, 0.2)) { ok = true; break; }
    }
    if (!ok) continue;
    const x = sx - ox, z = sz - oz, oscuro = [38, 42, 52];
    det.poste(x, z, 0, 3.5, 0.045, oscuro);
    [a, b].forEach((br, i) => {
      if (!br.nombre) return;
      const sl = pedirSlot({ tipo: "calle", texto: abreviarCalle(br.nombre) });
      if (sl < 0) return;
      const rx = br.dx, rz = br.dz, nx = -rz, nz = rx, y = 3.22 - i * 0.3, h = 0.13, L = 0.72;
      for (const lado of [1, -1]) {
        const rrx = rx * lado, rrz = rz * lado, nnx = nx * lado, nnz = nz * lado, of = 0.05;
        const P = (r: number, yy: number) => [x + rrx * r + nnx * of, yy, z + rrz * r + nnz * of];
        conUvAtlas(() => det.q(P(-L, y - h), P(L, y - h), P(L, y + h), P(-L, y + h), [nnx, 0, nnz], uvSlot(sl), [32, 56, 110], 3));
      }
    });
  }

  /* Tramos para saber en qué calle estás, y vías por donde pasa el tráfico */
  const indNombre = new Map<string, number>();
  for (const v of ind.vias) {
    if (v.clase === "rail" || v.clase === "transit" || v.clase === "track") continue;
    for (let i = 0; i + 3 < v.pts.length; i += 2) {
      const ax = v.pts[i], az = v.pts[i + 1], bx = v.pts[i + 2], bz = v.pts[i + 3];
      const mx = (ax + bx) / 2, mz = (az + bz) / 2, L = Math.hypot(bx - ax, bz - az);
      /* tramos largos: se parten para que cada celda tenga el suyo */
      if (!adentro(mx, mz) && L < C * 0.5) continue;
      const n = calleCerca(t, mx, mz, 10, (bx - ax) / (L || 1), (bz - az) / (L || 1)) ?? calleCerca(t, mx, mz, 10);
      let k = -1;
      if (n) {
        const ab = abreviarCalle(n);
        k = indNombre.get(ab) ?? -1;
        if (k < 0) { k = nombres.length; nombres.push(ab); indNombre.set(ab, k); }
      }
      tramos.push(ax - ox, az - oz, bx - ox, bz - oz, v.hw, k);
    }
    if (CON_AUTOS.has(v.clase) && adentro(v.pts[0], v.pts[1])) {
      const pts = new Float32Array(v.pts.length);
      for (let i = 0; i < pts.length; i += 2) { pts[i] = v.pts[i] - ox; pts[i + 1] = v.pts[i + 1] - oz; }
      vias.push({ pts, hw: v.hw, sentido: v.sentido, clase: v.clase });
    }
  }

  /* Los UV de atlas se guardan en filas; acá se pasan a 0..1 ya sabiendo cuántas filas hay */
  const filas = Math.max(1, Math.ceil(slot / 2));
  for (const { i0, n } of pendientesUv) for (let i = i0; i < i0 + n; i++) {
    const fila = det.uv[i * 2 + 1];
    det.uv[i * 2 + 1] = 1 - fila / filas;
  }

  const fusionar = (capas: Capa[]) => {
    let nv = 0, ni = 0;
    for (const c of capas) { nv += c.pos.length / 2; ni += c.idx.length; }
    const pos = new Float32Array(nv * 2), col = new Uint8Array(nv * 4), mat = new Uint8Array(nv * 4), idx = new Uint32Array(ni);
    let v = 0, i = 0;
    for (const c of capas) {
      pos.set(c.pos, v * 2); col.set(c.col, v * 4); mat.set(c.mat, v * 4);
      for (const q of c.idx) idx[i++] = q + v;
      v += c.pos.length / 2;
    }
    return { pos, col, mat, idx };
  };

  return {
    gx, gy,
    suelo: fusionar([cBase, cPoli, cVereda, cCordon, cCuneta, cAsf, cMarca, cSombra]),
    edif: { pos: new Float32Array(eP), uv: new Float32Array(eU), nor: new Int8Array(eN), col: new Uint8Array(eC), idx: new Uint32Array(eI) },
    det: { pos: new Float32Array(det.pos), uv: new Float32Array(det.uv), nor: new Int8Array(det.nor), col: new Uint8Array(det.col), idx: new Uint32Array(det.idx) },
    props: new Float32Array(props),
    colision: new Float32Array(colision),
    tramos: new Float32Array(tramos),
    nombres, locales, carteles, atlasFilas: filas, vias,
  };
}

function cercaLinea(p: number[], x: number, z: number, m: number) {
  for (let i = 0; i + 3 < p.length; i += 2) {
    const ax = p[i], az = p[i + 1], dx = p[i + 2] - ax, dz = p[i + 3] - az, L2 = dx * dx + dz * dz;
    if (!L2) continue;
    const q = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    if (Math.hypot(x - ax - dx * q, z - az - dz * q) < m) return true;
  }
  return false;
}
