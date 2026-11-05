/* Red de calles y camino real de A a B. Sin DOM ni Three: corre en el worker.
   Trabaja en metros de un plano local. Las esquinas se unen por coordenada exacta y los
   caminos sueltos (veredas que terminan cerca de una calle) se enganchan al tramo más cercano. */

export type Perfil = "pie" | "auto";

export interface ViaEntrada {
  /** Puntos en metros: x, y, x, y... */
  pts: ArrayLike<number>;
  clase: string;
  nombre: string;
  extra?: Record<string, string>;
}

export interface Maniobra { s: number; texto: string }
export interface Camino {
  /** x, y en metros. */
  pts: number[];
  largo: number;
  maniobras: Maniobra[];
}

const FACTOR_PIE: Record<string, number> = {
  footway: 0.92, pedestrian: 0.9, path: 1, living_street: 0.95, crossing: 0.9, cycleway: 1.05, steps: 1.3, track: 1.25, corridor: 1,
  residential: 1, unclassified: 1, tertiary: 1.02, tertiary_link: 1.05, secondary: 1.04, secondary_link: 1.1, primary: 1.08, primary_link: 1.15, service: 1.1,
  trunk: 1.6, trunk_link: 1.8, road: 1.1,
};
const FACTOR_AUTO: Record<string, number> = {
  motorway: 0.6, motorway_link: 0.7, trunk: 0.7, trunk_link: 0.8, primary: 0.8, primary_link: 0.85, secondary: 0.85, secondary_link: 0.9, tertiary: 0.92, tertiary_link: 0.95,
  residential: 1.1, unclassified: 1.1, living_street: 1.5, service: 1.6, road: 1.2,
};
const CRUCE_MAX = 7;

/** Medio ancho de calzada en metros: de ahí sale cuánto correrse a la vereda. */
export function medioAncho(clase: string, extra?: Record<string, string>) {
  const w = parseFloat(extra?.width ?? "");
  if (w > 2 && w < 80) return w / 2;
  const l = parseInt(extra?.lanes ?? "", 10);
  if (l > 0 && l < 12) return Math.max(3, (l * 3.2) / 2 + 0.6);
  return { primary: 9, primary_link: 5, secondary: 7, secondary_link: 4.5, tertiary: 5.2, tertiary_link: 4, residential: 4.4, unclassified: 4.4, living_street: 3.2, service: 2.2, trunk: 11, road: 4 }[clase] ?? 0;
}

interface Arista { a: number; b: number; len: number; via: number; soloIda: boolean }

export class Red {
  private id = new Map<number, number>();
  xs: number[] = [];
  ys: number[] = [];
  private segs: Arista[] = [];
  private vistos = new Set<number>();
  private vias: { nombre: string; clase: string; hw: number; ida: boolean; pie: number; auto: number }[] = [];
  private ady: number[][] = [];
  /** Lado de grilla en metros para buscar tramos cerca. */
  private balde = new Map<number, number[]>();
  private bx = 0; private by = 0; private iniciada = false;

  private nodo(x: number, y: number) {
    if (!this.iniciada) { this.bx = x; this.by = y; this.iniciada = true; }
    const k = Math.round((x - this.bx) * 10) * 1e7 + Math.round((y - this.by) * 10);
    let n = this.id.get(k);
    if (n == null) { n = this.xs.length; this.id.set(k, n); this.xs.push(x); this.ys.push(y); }
    return n;
  }

  /** Agrega una vía. Devuelve false si no sirve para caminar ni manejar. */
  agregar(v: ViaEntrada) {
    const pie = FACTOR_PIE[v.clase], auto = FACTOR_AUTO[v.clase];
    if (pie == null && auto == null) return false;
    if (v.extra?.tunnel && v.extra.tunnel !== "no" && pie != null && auto == null) return false;
    const ida = v.extra?.oneway === "yes" || v.extra?.oneway === "1";
    const iv = this.vias.length;
    this.vias.push({ nombre: v.nombre, clase: v.clase, hw: medioAncho(v.clase, v.extra), ida, pie: pie ?? Infinity, auto: auto ?? Infinity });
    let a = this.nodo(v.pts[0], v.pts[1]);
    for (let i = 2; i + 1 < v.pts.length; i += 2) {
      const b = this.nodo(v.pts[i], v.pts[i + 1]);
      if (a !== b) {
        const k = Math.min(a, b) * 3e7 + Math.max(a, b);
        if (!this.vistos.has(k)) {
          this.vistos.add(k);
          this.segs.push({ a, b, len: Math.hypot(this.xs[a] - this.xs[b], this.ys[a] - this.ys[b]), via: iv, soloIda: ida });
        }
      }
      a = b;
    }
    return true;
  }

  private indexar() {
    this.balde.clear();
    this.ady = this.xs.map(() => []);
    this.segs.forEach((s, i) => {
      this.ady[s.a].push(i); this.ady[s.b].push(i);
      this.ponerEnGrilla(i);
    });
  }

  private ponerEnGrilla(i: number) {
    const s = this.segs[i], B = 40, x0 = Math.floor(Math.min(this.xs[s.a], this.xs[s.b]) / B), x1 = Math.floor(Math.max(this.xs[s.a], this.xs[s.b]) / B);
    const y0 = Math.floor(Math.min(this.ys[s.a], this.ys[s.b]) / B), y1 = Math.floor(Math.max(this.ys[s.a], this.ys[s.b]) / B);
    for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) {
      const k = gx * 1e6 + gy, l = this.balde.get(k);
      if (l) l.push(i); else this.balde.set(k, [i]);
    }
  }

  /** Tramo más cercano a un punto. */
  masCercano(x: number, y: number, radio: number, filtro?: (via: number, seg: number) => boolean) {
    const B = 40, r = Math.ceil(radio / B), cx = Math.floor(x / B), cy = Math.floor(y / B);
    let mejor: { seg: number; t: number; d: number; x: number; y: number } | null = null;
    for (let gx = cx - r; gx <= cx + r; gx++) for (let gy = cy - r; gy <= cy + r; gy++) {
      for (const i of this.balde.get(gx * 1e6 + gy) ?? []) {
        const s = this.segs[i];
        if (filtro && !filtro(s.via, i)) continue;
        const ax = this.xs[s.a], ay = this.ys[s.a], dx = this.xs[s.b] - ax, dy = this.ys[s.b] - ay, q = dx * dx + dy * dy;
        const t = q ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / q)) : 0;
        const px = ax + dx * t, py = ay + dy * t, d = Math.hypot(px - x, py - y);
        if (d <= radio && (!mejor || d < mejor.d)) mejor = { seg: i, t, d, x: px, y: py };
      }
    }
    return mejor;
  }

  /** Parte un tramo en un punto y devuelve el nodo nuevo. */
  private partir(seg: number, t: number) {
    const s = this.segs[seg];
    if (t < 0.01) return s.a;
    if (t > 0.99) return s.b;
    const x = this.xs[s.a] + (this.xs[s.b] - this.xs[s.a]) * t, y = this.ys[s.a] + (this.ys[s.b] - this.ys[s.a]) * t;
    const n = this.xs.length;
    this.xs.push(x); this.ys.push(y); this.ady.push([]);
    const b = s.b, largo = s.len;
    s.b = n; s.len = largo * t;
    this.ady[b] = this.ady[b].filter((i) => i !== seg);
    const nuevo = this.segs.length;
    this.segs.push({ a: n, b, len: largo * (1 - t), via: s.via, soloIda: s.soloIda });
    this.ady[n].push(seg, nuevo);
    this.ady[b].push(nuevo);
    this.ponerEnGrilla(nuevo);
    return n;
  }

  /** Cierra la red: índices y enganche de veredas sueltas. */
  cerrar() {
    this.indexar();
    const sueltos: number[] = [];
    for (let n = 0; n < this.ady.length; n++) if (this.ady[n].length === 1) sueltos.push(n);
    for (const n of sueltos) {
      const mio = this.ady[n][0];
      const m = this.masCercano(this.xs[n], this.ys[n], CRUCE_MAX, (_, i) => {
        if (i === mio) return false;
        const s = this.segs[i];
        return s.a !== n && s.b !== n && s.a !== this.segs[mio].a && s.a !== this.segs[mio].b && s.b !== this.segs[mio].a && s.b !== this.segs[mio].b;
      });
      if (!m) continue;
      const u = this.partir(m.seg, m.t);
      const iv = this.vias.length;
      this.vias.push({ nombre: "", clase: "footway", hw: 0, ida: false, pie: 1, auto: Infinity });
      const i = this.segs.length;
      this.segs.push({ a: n, b: u, len: Math.hypot(this.xs[n] - this.xs[u], this.ys[n] - this.ys[u]), via: iv, soloIda: false });
      this.ady[n].push(i); this.ady[u].push(i);
      this.ponerEnGrilla(i);
    }
  }

  get tamano() { return this.segs.length; }

  /** Camino más corto (A*). `esDentro` dice si un punto cae adentro de un edificio. */
  camino(ax: number, ay: number, bx: number, by: number, perfil: Perfil, esDentro?: (x: number, y: number) => boolean, lado0?: number): Camino | null {
    const filtro = (v: number) => (perfil === "pie" ? this.vias[v].pie : this.vias[v].auto) < Infinity;
    const r0 = this.masCercano(ax, ay, 260, filtro), r1 = this.masCercano(bx, by, 260, filtro);
    if (!r0 || !r1) return null;
    const ini = this.partir(r0.seg, r0.t);
    /* Partir puede mover el tramo del destino si es el mismo: se vuelve a buscar */
    const r2 = this.masCercano(bx, by, 260, filtro)!;
    const fin = this.partir(r2.seg, r2.t);
    if (ini === fin) {
      const pts = [ax, ay, bx, by], largo = Math.hypot(ax - bx, ay - by);
      return { pts, largo, maniobras: [] };
    }

    const N = this.xs.length, g = new Float64Array(N).fill(Infinity), de = new Int32Array(N).fill(-1), cerrado = new Uint8Array(N);
    const h = (n: number) => Math.hypot(this.xs[n] - this.xs[fin], this.ys[n] - this.ys[fin]) * (perfil === "auto" ? 0.6 : 0.9);
    /* Montículo binario de pares (f, nodo) */
    const hf: number[] = [], hn: number[] = [];
    const push = (f: number, n: number) => {
      let i = hf.length; hf.push(f); hn.push(n);
      while (i) { const p = (i - 1) >> 1; if (hf[p] <= f) break; hf[i] = hf[p]; hn[i] = hn[p]; i = p; }
      hf[i] = f; hn[i] = n;
    };
    const pop = () => {
      const n = hn[0], f = hf.pop()!, m = hn.pop()!, L = hf.length;
      if (L) {
        let i = 0;
        for (;;) {
          let c = 2 * i + 1;
          if (c >= L) break;
          if (c + 1 < L && hf[c + 1] < hf[c]) c++;
          if (hf[c] >= f) break;
          hf[i] = hf[c]; hn[i] = hn[c]; i = c;
        }
        hf[i] = f; hn[i] = m;
      }
      return n;
    };
    g[ini] = 0; push(h(ini), ini);
    let hallado = false;
    while (hf.length) {
      const n = pop();
      if (cerrado[n]) continue;
      cerrado[n] = 1;
      if (n === fin) { hallado = true; break; }
      for (const i of this.ady[n]) {
        const s = this.segs[i], otro = s.a === n ? s.b : s.a, v = this.vias[s.via], k = perfil === "pie" ? v.pie : v.auto;
        if (k === Infinity || cerrado[otro]) continue;
        if (perfil === "auto" && s.soloIda && s.a !== n) continue;
        const tapado = esDentro && esDentro((this.xs[n] + this.xs[otro]) / 2, (this.ys[n] + this.ys[otro]) / 2);
        const c = g[n] + s.len * k * (tapado ? 6 : 1);
        if (c < g[otro]) { g[otro] = c; de[otro] = i; push(c + h(otro), otro); }
      }
    }
    if (!hallado) return null;

    /* Rearmar: lista de nodos y a qué vía pertenece cada tramo */
    const nodos: number[] = [fin], viasTr: number[] = [];
    for (let n = fin; n !== ini;) {
      const s = this.segs[de[n]], p = s.a === n ? s.b : s.a;
      viasTr.push(s.via); nodos.push(p); n = p;
    }
    nodos.reverse(); viasTr.reverse();
    const crudo: number[] = [];
    for (const n of nodos) crudo.push(this.xs[n], this.ys[n]);
    return this.terminar(crudo, viasTr, ax, ay, bx, by, perfil, esDentro, lado0);
  }

  /** De la línea central a la vereda, sin meterse en edificios, y con las maniobras. */
  private terminar(cr: number[], vias: number[], ax: number, ay: number, bx: number, by: number, perfil: Perfil, esDentro?: (x: number, y: number) => boolean, lado0?: number): Camino {
    const n = cr.length / 2;
    /* De qué lado de la calle viene caminando: arranca por esa vereda */
    let lado = lado0 ?? 1;
    if (lado0 == null && n >= 2) {
      const dx = cr[2] - cr[0], dy = cr[3] - cr[1], c = dx * (ay - cr[1]) - dy * (ax - cr[0]);
      if (Math.abs(c) > 0.5) lado = c > 0 ? 1 : -1;
    }
    const corr = (i: number) => {
      const v = this.vias[vias[i]];
      if (perfil === "auto") return v.ida ? 0 : 1.7;
      return v.hw > 0 ? v.hw + 1.1 : 0;
    };
    /* Rectas corridas, unidas por la intersección de cada par. `ref` es el vértice de la línea central de cada punto. */
    const out: number[] = [], ref: number[] = [];
    const poner = (x: number, y: number, j: number) => { out.push(x, y); ref.push(j); };
    const normal = (i: number) => {
      const dx = cr[2 * i + 2] - cr[2 * i], dy = cr[2 * i + 3] - cr[2 * i + 1], L = Math.hypot(dx, dy) || 1;
      return { nx: (-dy / L) * lado, ny: (dx / L) * lado };
    };
    const seg0 = normal(0), d0 = corr(0);
    poner(cr[0] + seg0.nx * d0, cr[1] + seg0.ny * d0, 0);
    for (let i = 1; i < n - 1; i++) {
      const a = normal(i - 1), b = normal(i), da = corr(i - 1), db = corr(i);
      const px = cr[2 * i], py = cr[2 * i + 1];
      const pax = px + a.nx * da, pay = py + a.ny * da, pbx = px + b.nx * db, pby = py + b.ny * db;
      const dax = -a.ny, day = a.nx, dbx = -b.ny, dby = b.nx, den = dax * dby - day * dbx;
      if (Math.abs(den) < 0.12) { poner(pax, pay, i); if (Math.hypot(pax - pbx, pay - pby) > 0.3) poner(pbx, pby, i); continue; }
      const t = ((pbx - pax) * dby - (pby - pay) * dbx) / den, ix = pax + dax * t, iy = pay + day * t;
      if (Math.hypot(ix - px, iy - py) > Math.max(da, db) * 3 + 2) { poner(pax, pay, i); poner(pbx, pby, i); continue; }
      poner(ix, iy, i);
    }
    const u = normal(n - 2), du = corr(n - 2);
    poner(cr[2 * n - 2] + u.nx * du, cr[2 * n - 1] + u.ny * du, n - 1);

    /* Si la vereda pisa un edificio, ese punto se acerca a la calle */
    const dentro = esDentro ?? (() => false);
    const seguro: number[] = [];
    for (let i = 0; i < ref.length; i++) {
      const ox = out[2 * i], oy = out[2 * i + 1], j = ref[i], cx = cr[2 * j], cy = cr[2 * j + 1];
      let x = ox, y = oy;
      if (dentro(x, y)) for (const f of [0.75, 0.5, 0.25, 0]) { x = cx + (ox - cx) * f; y = cy + (oy - cy) * f; if (!dentro(x, y)) break; }
      seguro.push(x, y);
    }
    /* Muestreo fino: si un tramo corta un edificio, ese pedazo va por la línea central */
    const limpio: number[] = [seguro[0], seguro[1]];
    for (let i = 1; i < ref.length; i++) {
      const x0 = seguro[2 * i - 2], y0 = seguro[2 * i - 1], x1 = seguro[2 * i], y1 = seguro[2 * i + 1], L = Math.hypot(x1 - x0, y1 - y0), m = Math.ceil(L / 3);
      let corta = false;
      for (let k = 1; k < m && !corta; k++) corta = dentro(x0 + ((x1 - x0) * k) / m, y0 + ((y1 - y0) * k) / m);
      if (corta) for (let j = ref[i - 1]; j <= ref[i]; j++) limpio.push(cr[2 * j], cr[2 * j + 1]);
      limpio.push(x1, y1);
    }

    /* Punta y cola: de donde estás a la vereda, y de la vereda al destino si no es adentro de un edificio */
    const pts = [ax, ay, ...limpio];
    if (!dentro(bx, by) && Math.hypot(bx - limpio[limpio.length - 2], by - limpio[limpio.length - 1]) > 1) pts.push(bx, by);

    /* Limpiar puntos pegados */
    const fino: number[] = [pts[0], pts[1]];
    for (let i = 2; i < pts.length; i += 2) if (Math.hypot(pts[i] - fino[fino.length - 2], pts[i + 1] - fino[fino.length - 1]) > 0.4) fino.push(pts[i], pts[i + 1]);
    if (fino.length < 4) fino.push(bx, by);

    let largo = 0;
    for (let i = 2; i < fino.length; i += 2) largo += Math.hypot(fino[i] - fino[i - 2], fino[i + 1] - fino[i - 1]);
    return { pts: fino, largo, maniobras: this.maniobras(cr, vias) };
  }

  /** "Doblá a la izquierda en Thames": cuando cambia el nombre de la calle y hay giro. */
  private maniobras(cr: number[], vias: number[]) {
    const out: Maniobra[] = [];
    let s = 0;
    for (let i = 1; i < vias.length; i++) {
      s += Math.hypot(cr[2 * i] - cr[2 * i - 2], cr[2 * i + 1] - cr[2 * i - 1]);
      const a = this.vias[vias[i - 1]], b = this.vias[vias[i]];
      if (!b.nombre || a.nombre === b.nombre) continue;
      const ax = cr[2 * i] - cr[2 * i - 2], ay = cr[2 * i + 1] - cr[2 * i - 1], bx = cr[2 * i + 2] - cr[2 * i], by = cr[2 * i + 3] - cr[2 * i + 1];
      const ang = Math.atan2(ax * by - ay * bx, ax * bx + ay * by), g = Math.abs(ang);
      /* El plano tiene y hacia el sur: girar con ángulo positivo es a la derecha */
      const texto = g < 0.45 ? `Seguí por ${b.nombre}` : ang > 0 ? `Doblá a la derecha en ${b.nombre}` : `Doblá a la izquierda en ${b.nombre}`;
      out.push({ s, texto });
    }
    return out;
  }
}

/** Punto adentro de un polígono (x, y, x, y...). */
export function dentroPoligono(p: ArrayLike<number>, x: number, y: number) {
  let c = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    if ((p[i + 1] > y) !== (p[j + 1] > y) && x < ((p[j] - p[i]) * (y - p[i + 1])) / (p[j + 1] - p[i + 1]) + p[i]) c = !c;
  }
  return c;
}
