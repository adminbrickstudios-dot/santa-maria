/* Maneja las celdas alrededor del caminante: pide, integra a la escena, ajusta el detalle y suelta. */
import * as THREE from "three";
import { crearAtlas } from "./carteles";
import { DIV, ZOOM, celdaDeMundo, hash, lonLatDeMundo, origenCelda, type Origen } from "./geo";
import { matDetalle, type Comunes } from "./materiales";
import { geoArbol, geoFarola } from "./objetos";
import type { Procesador } from "./procesador";
import type { CeldaDatos, Local, ProveedorTiles, RespuestaWorker } from "./tipos";

export interface Calidad { nivel: number; dpr: number; radio: number; rDet: number; rAtlas: number; rProps: number; rSombra: number; autos: number; gente: number; atlas: number; ventanas: number }

const VERDES = ["#7DA858", "#6E9F52", "#8DB562", "#5F964C", "#94B866"].map((c) => new THREE.Color().setStyle(c, THREE.LinearSRGBColorSpace));
const LILA = new THREE.Color().setStyle("#A98AD6", THREE.LinearSRGBColorSpace);

export interface ViaMundo { pts: Float32Array; L: Float32Array; total: number; hw: number; ida: boolean; sentido: number }

interface Celda {
  gx: number; gy: number; ox: number; oz: number; cx: number; cz: number;
  grupo: THREE.Group;
  suelo: THREE.Mesh;
  edif: THREE.Mesh | null;
  sombra: THREE.Mesh | null;
  det: THREE.Mesh | null;
  matDet: THREE.ShaderMaterial | null;
  atlas: THREE.Texture | null;
  arboles: THREE.InstancedMesh | null;
  farolas: THREE.InstancedMesh | null;
  datos: CeldaDatos;
  locales: Local[];
  col: Float32Array;
  grilla: Map<number, number[]>;
  tramos: Float32Array;
  nombres: string[];
  vias: ViaMundo[];
}

interface EstadoTile { estado: "pidiendo" | "decodificando" | "listo" | "error"; intentos: number; ctrl?: AbortController }

const BALDE = 6;

export interface Materiales { suelo: THREE.ShaderMaterial; edif: THREE.ShaderMaterial; sombra: THREE.ShaderMaterial; objeto: THREE.ShaderMaterial; comunes: Comunes }

export class Mundo {
  celdas = new Map<string, Celda>();
  private tiles = new Map<string, EstadoTile>();
  private pedidas = new Set<string>();
  private listas: CeldaDatos[] = [];
  private enCurso = 0;
  private ultimo = { x: Infinity, z: Infinity, t: -1 };
  private geoA: THREE.BufferGeometry;
  private geoF: THREE.BufferGeometry;
  private grupo = new THREE.Group();
  private falta: string[] = [];
  private sinDatos = new Set<string>();
  /** Cuántas celdas tienen que estar para poder arrancar. */
  inicial: Set<string> | null = null;
  fallos = 0;
  version = 0;
  C: number;

  constructor(
    escena: THREE.Scene, private o: Origen, private mats: Materiales, private proc: () => Procesador, private proveedor: ProveedorTiles, private calidad: () => Calidad,
    private eventos: { progreso: (f: number) => void; fallo: (m: string) => void; aviso: (m: string) => void },
  ) {
    escena.add(this.grupo);
    this.geoA = geoArbol();
    this.geoF = geoFarola();
    this.C = o.m / DIV;
  }

  /** Pedidos que quedaron en el aire si el worker se cayó: se vuelven a hacer. */
  reiniciarPendientes() {
    for (const [k, t] of this.tiles) if (t.estado !== "error") this.tiles.delete(k);
    this.pedidas.clear();
    this.enCurso = 0;
    for (const c of this.celdas.values()) this.pedidas.add(`${c.gx}/${c.gy}`);
    this.ultimo.t = -1;
  }

  alRecibir(r: RespuestaWorker) {
    if (r.t === "tile") {
      const t = this.tiles.get(`${r.tx}/${r.ty}`);
      if (t) t.estado = "listo";
      this.ultimo.t = -1;
    } else if (r.t === "celda") {
      this.enCurso = Math.max(0, this.enCurso - 1);
      this.listas.push(r.datos);
    } else if (r.t === "error") {
      if (r.gx != null) { this.enCurso = Math.max(0, this.enCurso - 1); this.sinDatos.add(`${r.gx}/${r.gy}`); this.contarInicial(`${r.gx}/${r.gy}`); }
      if (r.tx != null) this.tiles.delete(`${r.tx}/${r.ty}`);
      console.warn("calle:", r.mensaje);
    }
  }

  private contarInicial(k: string) {
    if (!this.inicial?.has(k)) return;
    const total = this.inicial.size;
    this.falta = this.falta.filter((c) => c !== k);
    this.eventos.progreso(1 - this.falta.length / total);
  }

  private pedirTile(tx: number, ty: number) {
    const k = `${tx}/${ty}`;
    if (this.tiles.has(k)) return;
    const e: EstadoTile = { estado: "pidiendo", intentos: 0, ctrl: new AbortController() };
    this.tiles.set(k, e);
    const bajar = () => {
      this.proveedor(ZOOM, tx, ty, e.ctrl?.signal).then((buf) => {
        if (this.tiles.get(k) !== e) return;
        e.estado = "decodificando";
        this.proc().enviar({ t: "tile", tx, ty, m: this.o.m, buf });
      }).catch((err) => {
        if (this.tiles.get(k) !== e || e.ctrl?.signal.aborted) return;
        if (++e.intentos < 3) { setTimeout(bajar, 700 * e.intentos); return; }
        e.estado = "error";
        this.fallos++;
        console.warn("calle:", err);
        if (this.inicial && this.falta.length) this.eventos.fallo("No pudimos bajar el mapa de esta zona.");
        else this.eventos.aviso("Falta un pedazo del mapa: revisá tu conexión.");
      });
    };
    bajar();
  }

  /** Decide qué falta y qué sobra. Se llama seguido, pero solo trabaja si te moviste. */
  actualizar(x: number, z: number, ahora: number) {
    const q = this.calidad();
    if (Math.hypot(x - this.ultimo.x, z - this.ultimo.z) > 12 || ahora - this.ultimo.t > 0.6 || this.ultimo.t < 0) {
      this.ultimo = { x, z, t: ahora };
      const { gx, gy } = celdaDeMundo(this.o, x, z);
      const rc = Math.ceil(q.radio / this.C) + 1, nec: { k: string; gx: number; gy: number; d: number }[] = [];
      for (let j = gy - rc; j <= gy + rc; j++) for (let i = gx - rc; i <= gx + rc; i++) {
        const p = origenCelda(this.o, i, j), d = Math.hypot(p.x + this.C / 2 - x, p.z + this.C / 2 - z);
        if (d < q.radio + this.C * 0.75) nec.push({ k: `${i}/${j}`, gx: i, gy: j, d });
      }
      nec.sort((a, b) => a.d - b.d);
      if (!this.inicial) {
        const cerca = nec.filter((n) => n.d < 150).map((n) => n.k);
        this.inicial = new Set(cerca);
        this.falta = [...cerca];
      }
      const tilesUsados = new Set<string>();
      for (const n of nec) {
        const tx = Math.floor(n.gx / DIV), ty = Math.floor(n.gy / DIV), kt = `${tx}/${ty}`;
        tilesUsados.add(kt);
        if (this.pedidas.has(n.k)) continue;
        const t = this.tiles.get(kt);
        if (!t) { this.pedirTile(tx, ty); continue; }
        if (t.estado === "error") { this.contarInicial(n.k); continue; }
        if (t.estado !== "listo" || this.enCurso >= 3) continue;
        this.pedidas.add(n.k);
        this.enCurso++;
        this.proc().enviar({ t: "celda", gx: n.gx, gy: n.gy });
      }
      for (const [k, c] of this.celdas) if (Math.hypot(c.cx - x, c.cz - z) > q.radio + this.C * 1.7) this.soltar(k, c);
      for (const [k, t] of this.tiles) {
        if (tilesUsados.has(k) || t.estado === "pidiendo" && t.intentos > 0) continue;
        const [tx, ty] = k.split("/").map(Number), px = (tx + 0.5 - this.o.fx) * this.o.m, pz = (ty + 0.5 - this.o.fy) * this.o.m;
        if (Math.hypot(px - x, pz - z) > this.o.m * 1.3) {
          t.ctrl?.abort();
          this.tiles.delete(k);
          this.proc().enviar({ t: "soltar", tx, ty });
          for (const c of [...this.pedidas]) { const [a, b] = c.split("/").map(Number); if (`${Math.floor(a / DIV)}/${Math.floor(b / DIV)}` === k && !this.celdas.has(c)) this.pedidas.delete(c); }
        }
      }
    }
    /* A lo sumo una celda por cuadro entra a la escena */
    if (this.listas.length) {
      let m = 0, md = Infinity;
      this.listas.forEach((c, i) => {
        const p = origenCelda(this.o, c.gx, c.gy), d = Math.hypot(p.x - x, p.z - z);
        if (d < md) { md = d; m = i; }
      });
      this.integrar(this.listas.splice(m, 1)[0]);
    }
    this.lod(x, z, q);
  }

  private integrar(d: CeldaDatos) {
    const k = `${d.gx}/${d.gy}`;
    if (this.celdas.has(k)) return;
    const { x: ox, z: oz } = origenCelda(this.o, d.gx, d.gy), C = this.C;
    const grupo = new THREE.Group();
    grupo.position.set(ox, 0, oz);

    const gs = new THREE.BufferGeometry();
    gs.setAttribute("position", new THREE.BufferAttribute(d.suelo.pos, 2));
    gs.setAttribute("aCol", new THREE.BufferAttribute(d.suelo.col, 4, true));
    gs.setAttribute("aMat", new THREE.BufferAttribute(d.suelo.mat, 4, true));
    gs.setIndex(new THREE.BufferAttribute(d.suelo.idx, 1));
    gs.boundingSphere = new THREE.Sphere(new THREE.Vector3(C / 2, 0, C / 2), C * 0.75);
    const suelo = new THREE.Mesh(gs, this.mats.suelo);
    suelo.renderOrder = -20;
    grupo.add(suelo);

    let edif: THREE.Mesh | null = null, sombra: THREE.Mesh | null = null;
    if (d.edif.idx.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(d.edif.pos, 3));
      g.setAttribute("aUv", new THREE.BufferAttribute(d.edif.uv, 4));
      g.setAttribute("aNor", new THREE.BufferAttribute(d.edif.nor, 2, true));
      g.setAttribute("aCol", new THREE.BufferAttribute(d.edif.col, 4, true));
      g.setIndex(new THREE.BufferAttribute(d.edif.idx, 1));
      g.computeBoundingSphere();
      edif = new THREE.Mesh(g, this.mats.edif);
      grupo.add(edif);
      sombra = new THREE.Mesh(g, this.mats.sombra);
      sombra.renderOrder = -19;
      sombra.frustumCulled = false;
      grupo.add(sombra);
    }
    let det: THREE.Mesh | null = null, matDet: THREE.ShaderMaterial | null = null;
    if (d.det.idx.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(d.det.pos, 3));
      g.setAttribute("aUv", new THREE.BufferAttribute(d.det.uv, 2));
      g.setAttribute("aNor", new THREE.BufferAttribute(d.det.nor, 3, true));
      g.setAttribute("aCol", new THREE.BufferAttribute(d.det.col, 4, true));
      g.setIndex(new THREE.BufferAttribute(d.det.idx, 1));
      g.computeBoundingSphere();
      matDet = matDetalle(this.mats.comunes, null);
      det = new THREE.Mesh(g, matDet);
      grupo.add(det);
    }

    /* Árboles y farolas instanciados */
    let arboles: THREE.InstancedMesh | null = null, farolas: THREE.InstancedMesh | null = null;
    const n = d.props.length / 5;
    let na = 0, nf = 0;
    for (let i = 0; i < n; i++) if (d.props[i * 5 + 4] === 1) nf++; else na++;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), eje = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
    if (na) {
      arboles = new THREE.InstancedMesh(this.geoA, this.mats.objeto, na);
      arboles.frustumCulled = true;
    }
    if (nf) { farolas = new THREE.InstancedMesh(this.geoF, this.mats.objeto, nf); }
    let ia = 0, jf = 0;
    for (let i = 0; i < n; i++) {
      const b = i * 5, x = d.props[b], z = d.props[b + 1], e = d.props[b + 2], r = d.props[b + 3], t = d.props[b + 4];
      p.set(x, 0, z); q.setFromAxisAngle(eje, r); s.set(e, e * (t === 1 ? 1 : 0.9 + hash(i, 5) * 0.3), e); m.compose(p, q, s);
      if (t === 1) farolas!.setMatrixAt(jf++, m);
      else {
        arboles!.setMatrixAt(ia, m);
        col.copy(t === 2 ? LILA : VERDES[Math.floor(hash(i, d.gx) * VERDES.length)]);
        arboles!.setColorAt(ia++, col);
      }
    }
    if (arboles) { arboles.computeBoundingSphere(); grupo.add(arboles); }
    if (farolas) { farolas.computeBoundingSphere(); grupo.add(farolas); }

    /* Paredes en coordenadas de mundo, en baldes de 6 m */
    const col2 = d.colision, grilla = new Map<number, number[]>();
    const paredes = new Float32Array(col2.length);
    for (let i = 0; i < col2.length; i += 2) { paredes[i] = col2[i] + ox; paredes[i + 1] = col2[i + 1] + oz; }
    for (let i = 0; i < paredes.length; i += 4) {
      const ax = paredes[i], az = paredes[i + 1], bx = paredes[i + 2], bz = paredes[i + 3], L = Math.hypot(bx - ax, bz - az), pasos = Math.ceil(L / (BALDE * 0.7));
      const vistos = new Set<number>();
      for (let t = 0; t <= pasos; t++) {
        const f = pasos ? t / pasos : 0, c = claveBalde(ax + (bx - ax) * f, az + (bz - az) * f);
        if (vistos.has(c)) continue;
        vistos.add(c);
        const l = grilla.get(c);
        if (l) l.push(i); else grilla.set(c, [i]);
      }
    }

    const tramos = new Float32Array(d.tramos);
    for (let i = 0; i < tramos.length; i += 6) { tramos[i] += ox; tramos[i + 1] += oz; tramos[i + 2] += ox; tramos[i + 3] += oz; }

    const vias: ViaMundo[] = [];
    for (const v of d.vias) {
      const n2 = v.pts.length / 2, a = new Float32Array(v.pts.length), b = new Float32Array(v.pts.length);
      for (let i = 0; i < n2; i++) {
        a[i * 2] = v.pts[i * 2] + ox; a[i * 2 + 1] = v.pts[i * 2 + 1] + oz;
        b[(n2 - 1 - i) * 2] = a[i * 2]; b[(n2 - 1 - i) * 2 + 1] = a[i * 2 + 1];
      }
      const hacer = (pts: Float32Array, ida: boolean): ViaMundo => {
        const L = new Float32Array(n2);
        for (let i = 1; i < n2; i++) L[i] = L[i - 1] + Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1]);
        return { pts, L, total: L[n2 - 1], hw: v.hw, ida, sentido: v.sentido };
      };
      if (v.sentido >= 0) vias.push(hacer(a, true));
      if (v.sentido <= 0) vias.push(hacer(b, false));
    }

    const locales = d.locales;
    for (const l of locales) {
      l.x += ox; l.z += oz; l.px += ox; l.pz += oz;
      const ll = lonLatDeMundo(this.o, l.px, l.pz);
      l.lat = ll.lat; l.lon = ll.lon;
    }

    const celda: Celda = {
      gx: d.gx, gy: d.gy, ox, oz, cx: ox + C / 2, cz: oz + C / 2, grupo, suelo, edif, sombra, det, matDet, atlas: null, arboles, farolas,
      datos: d, locales, col: paredes, grilla, tramos, nombres: d.nombres, vias,
    };
    this.celdas.set(k, celda);
    this.grupo.add(grupo);
    this.version++;
    this.contarInicial(k);
  }

  private soltar(k: string, c: Celda) {
    this.grupo.remove(c.grupo);
    c.suelo.geometry.dispose();
    c.edif?.geometry.dispose();
    c.det?.geometry.dispose();
    c.matDet?.dispose();
    c.atlas?.dispose();
    c.arboles?.dispose();
    c.farolas?.dispose();
    this.celdas.delete(k);
    this.pedidas.delete(k);
    this.version++;
  }

  private lod(x: number, z: number, q: Calidad) {
    let cand: Celda | null = null, md = q.rAtlas;
    for (const c of this.celdas.values()) {
      const d = Math.max(Math.abs(c.cx - x), Math.abs(c.cz - z)) - this.C / 2;
      const dist = Math.max(0, d);
      if (c.det) c.det.visible = dist < q.rDet;
      if (c.arboles) c.arboles.visible = dist < q.rProps;
      if (c.farolas) c.farolas.visible = dist < q.rProps;
      if (c.sombra) c.sombra.visible = dist < q.rSombra;
      if (c.matDet) {
        if (c.atlas && dist > q.rAtlas + 70) {
          c.matDet.uniforms.uAtlas.value = null;
          c.matDet.uniforms.uConAtlas.value = 0;
          c.atlas.dispose();
          c.atlas = null;
        } else if (!c.atlas && c.datos.carteles.length && dist < md) { md = dist; cand = c; }
      }
    }
    if (cand && cand.matDet) {
      cand.atlas = crearAtlas(cand.datos.carteles, cand.datos.atlasFilas, q.atlas, 4);
      cand.matDet.uniforms.uAtlas.value = cand.atlas;
      cand.matDet.uniforms.uConAtlas.value = 1;
    }
  }

  /* ───────── Consultas ───────── */
  private *cercanas(x: number, z: number) {
    const { gx, gy } = celdaDeMundo(this.o, x, z);
    for (let j = gy - 1; j <= gy + 1; j++) for (let i = gx - 1; i <= gx + 1; i++) {
      const c = this.celdas.get(`${i}/${j}`);
      if (c) yield c;
    }
  }

  /** Empuja un círculo fuera de las paredes cercanas. Devuelve la posición corregida. */
  chocar(x: number, z: number, r: number): [number, number, boolean] {
    let px = x, pz = z, toco = false;
    for (let vuelta = 0; vuelta < 3; vuelta++) {
      let mov = false;
      const base = Math.floor(px / BALDE), basez = Math.floor(pz / BALDE);
      for (const c of this.cercanas(px, pz)) {
        for (let bz = basez - 1; bz <= basez + 1; bz++) for (let bx = base - 1; bx <= base + 1; bx++) {
          const l = c.grilla.get(bz * 65536 + bx);
          if (!l) continue;
          for (const i of l) {
            const ax = c.col[i], az = c.col[i + 1], dx = c.col[i + 2] - ax, dz = c.col[i + 3] - az, L2 = dx * dx + dz * dz;
            if (!L2) continue;
            const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2));
            const hx = px - ax - dx * t, hz = pz - az - dz * t, d2 = hx * hx + hz * hz;
            if (d2 < r * r) {
              const d = Math.sqrt(d2) || 1e-4;
              px += (hx / d) * (r - d + 0.001);
              pz += (hz / d) * (r - d + 0.001);
              mov = toco = true;
            }
          }
        }
      }
      if (!mov) break;
    }
    return [px, pz, toco];
  }

  /** ¿Cruzar de A a B atraviesa una pared? Para trayectos largos y para validar el doble toque. */
  cruzaPared(ax: number, az: number, bx: number, bz: number) {
    const L = Math.hypot(bx - ax, bz - az), pasos = Math.ceil(L / 4);
    for (let s = 0; s <= pasos; s++) {
      const x = ax + ((bx - ax) * s) / pasos, z = az + ((bz - az) * s) / pasos, kx = Math.floor(x / BALDE), kz = Math.floor(z / BALDE);
      for (const c of this.cercanas(x, z)) {
        for (let q = kz - 1; q <= kz + 1; q++) for (let w = kx - 1; w <= kx + 1; w++) {
          for (const i of c.grilla.get(q * 65536 + w) ?? []) {
            if (segCruzan(ax, az, bx, bz, c.col[i], c.col[i + 1], c.col[i + 2], c.col[i + 3])) return true;
          }
        }
      }
    }
    return false;
  }

  calleEn(x: number, z: number): { nombre: string; dist: number } | null {
    let mejor: string | null = null, md = 26;
    for (const c of this.cercanas(x, z)) {
      const t = c.tramos;
      for (let i = 0; i < t.length; i += 6) {
        if (t[i + 5] < 0) continue;
        const d = distTramo(t, i, x, z) - t[i + 4];
        if (d < md) { md = d; mejor = c.nombres[t[i + 5]]; }
      }
    }
    return mejor ? { nombre: mejor, dist: md } : null;
  }

  /** Lugar en la vereda más cercana a un punto, mirando a lo largo de la calle. */
  puntoDeArranque(x: number, z: number): { x: number; z: number; yaw: number } | null {
    let mejor: { px: number; pz: number; dx: number; dz: number; hw: number } | null = null, md = 400;
    for (const c of this.celdas.values()) {
      const t = c.tramos;
      for (let i = 0; i < t.length; i += 6) {
        if (t[i + 4] < 3) continue;
        const d = distTramo(t, i, x, z);
        if (d < md) {
          md = d;
          const ax = t[i], az = t[i + 1], sx = t[i + 2] - ax, sz = t[i + 3] - az, L2 = sx * sx + sz * sz || 1, q = Math.max(0.05, Math.min(0.95, ((x - ax) * sx + (z - az) * sz) / L2));
          const L = Math.sqrt(L2);
          mejor = { px: ax + sx * q, pz: az + sz * q, dx: sx / L, dz: sz / L, hw: t[i + 4] };
        }
      }
    }
    if (!mejor) return null;
    const { px, pz, dx, dz, hw } = mejor;
    /* Se corre a lo largo de la calle para no caer en plena esquina, y prueba las dos veredas */
    for (const avance of [16, -16, 30, -30, 0]) for (const lado of [1, -1]) for (const extra of [2, 1.2]) {
      const qx = px + dx * avance - dz * lado * (hw + extra), qz = pz + dz * avance + dx * lado * (hw + extra);
      if (this.sobreCalzada(qx, qz) || this.chocar(qx, qz, 0.5)[2]) continue;
      return { x: qx, z: qz, yaw: Math.atan2(-dx, -dz) };
    }
    return { x: px, z: pz, yaw: Math.atan2(-dx, -dz) };
  }

  private sobreCalzada(x: number, z: number) {
    for (const c of this.cercanas(x, z)) {
      const t = c.tramos;
      for (let i = 0; i < t.length; i += 6) if (t[i + 4] >= 3 && distTramo(t, i, x, z) < t[i + 4] + 0.4) return true;
    }
    return false;
  }

  localesCerca(x: number, z: number, r: number) {
    const sal: Local[] = [];
    for (const c of this.cercanas(x, z)) for (const l of c.locales) if (Math.hypot(l.x - x, l.z - z) < r) sal.push(l);
    return sal;
  }

  tramosCerca(x: number, z: number) {
    const s: { t: Float32Array; ini: number }[] = [];
    for (const c of this.cercanas(x, z)) for (let i = 0; i < c.tramos.length; i += 6) s.push({ t: c.tramos, ini: i });
    return s;
  }

  todasLasVias() {
    const v: ViaMundo[] = [];
    for (const c of this.celdas.values()) for (const q of c.vias) v.push(q);
    return v;
  }

  info() {
    let tris = 0, atlas = 0, loc = 0;
    for (const c of this.celdas.values()) {
      tris += c.suelo.geometry.index!.count / 3 + (c.edif?.geometry.index!.count ?? 0) / 3 + (c.det?.geometry.index!.count ?? 0) / 3;
      if (c.atlas) atlas++;
      loc += c.locales.length;
    }
    return { celdas: this.celdas.size, tris, atlas, locales: loc, tiles: this.tiles.size, cola: this.listas.length };
  }

  destruir() {
    for (const t of this.tiles.values()) t.ctrl?.abort();
    for (const [k, c] of [...this.celdas]) this.soltar(k, c);
    this.geoA.dispose();
    this.geoF.dispose();
  }
}

const claveBalde = (x: number, z: number) => Math.floor(z / BALDE) * 65536 + Math.floor(x / BALDE);

function distTramo(t: Float32Array, i: number, x: number, z: number) {
  const ax = t[i], az = t[i + 1], sx = t[i + 2] - ax, sz = t[i + 3] - az, L2 = sx * sx + sz * sz;
  if (!L2) return Infinity;
  const q = Math.max(0, Math.min(1, ((x - ax) * sx + (z - az) * sz) / L2));
  return Math.hypot(x - ax - sx * q, z - az - sz * q);
}

function segCruzan(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number) {
  const s = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx);
  if (!s) return false;
  const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / s, u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / s;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}
