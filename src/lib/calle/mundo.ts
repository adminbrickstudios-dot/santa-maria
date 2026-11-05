/* Maneja las celdas alrededor del caminante: pide, integra a la escena de a poco, ajusta el detalle y suelta. */
import * as THREE from "three";
import { Arboleda } from "./arboles";
import { crearAtlas } from "./carteles";
import { DIV, ZOOM, celdaDeMundo, lonLatDeMundo, origenCelda, type Origen } from "./geo";
import { geoKit, geoProp } from "./kit";
import { matDetalle, matSuelo, type Comunes } from "./materiales";
import { geoSingular } from "./modelos";
import { K_CAJA, K_CORNISA, N_KIT, N_PROPS } from "./piezas";
import type { Procesador } from "./procesador";
import { FueraDeZona } from "./proveedor";
import { CAPA_SOLIDOS } from "./sombras";
import { ALTO_VEREDA, RANGO } from "./suelo";
import type { CeldaDatos, Local, ProveedorTiles, RespuestaWorker } from "./tipos";

export interface Calidad {
  nivel: number; dpr: number; radio: number; rDet: number; rKit: number; rAtlas: number; rProps: number; rArbolCerca: number; rTronco: number; rArbol: number;
  autos: number; gente: number; atlas: number; ventanas: number; sombras: [number, number][]; memoria: number;
}

export interface ViaMundo { id: number; pts: Float32Array; L: Float32Array; total: number; hw: number; ida: boolean; sentido: number; carriles: number; altos: Float32Array; clase: string }

interface Celda {
  gx: number; gy: number; ox: number; oz: number; cx: number; cz: number;
  grupo: THREE.Group;
  suelo: THREE.Mesh;
  matSuelo: THREE.ShaderMaterial;
  mapa: THREE.DataTexture;
  datosMapa: Uint8Array; ladoMapa: number;
  edif: THREE.Mesh | null;
  det: THREE.Mesh | null;
  matDet: THREE.ShaderMaterial | null;
  atlas: THREE.Texture | null;
  kit: THREE.InstancedMesh[];
  kitLejos: THREE.InstancedMesh[];
  singulares: THREE.Mesh[];
  datos: CeldaDatos;
  locales: Local[];
  col: Float32Array;
  grilla: Map<number, number[]>;
  tramos: Float32Array;
  nombres: string[];
  vias: ViaMundo[];
  bytes: number;
}

interface EstadoTile { estado: "pidiendo" | "decodificando" | "listo" | "error"; intentos: number; ctrl?: AbortController }

const BALDE = 6;
const MENSAJE_ZONA = "Todavía no armamos este lugar en 3D. Por ahora está la Ciudad de Buenos Aires.";

export interface Materiales { edif: THREE.ShaderMaterial; prop: THREE.ShaderMaterial; follaje: THREE.ShaderMaterial; comunes: Comunes; baldosa: THREE.Texture }

/** Objetos de la calle: una malla instanciada por tipo para toda la zona visible. */
class Mobiliario {
  private mallas: THREE.InstancedMesh[] = [];
  private fuentes = new Map<string, { tipo: number; d: Float32Array; ox: number; oz: number }[]>();
  private ult = { x: Infinity, z: Infinity, v: -1 };
  private version = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private e = new THREE.Vector3(0, 1, 0);
  private c = new THREE.Color();
  constructor(grupo: THREE.Object3D, mat: THREE.ShaderMaterial) {
    for (let t = 0; t < N_PROPS; t++) {
      const im = new THREE.InstancedMesh(geoProp(t), mat, TOPES[t] ?? 80);
      im.frustumCulled = false;
      im.count = 0;
      im.setColorAt(0, this.c.setRGB(1, 1, 1));
      grupo.add(im);
      this.mallas.push(im);
    }
  }
  agregar(k: string, l: { tipo: number; d: Float32Array }[], ox: number, oz: number) { this.fuentes.set(k, l.map((q) => ({ ...q, ox, oz }))); this.version++; }
  quitar(k: string) { if (this.fuentes.delete(k)) this.version++; }
  actualizar(x: number, z: number, r: number) {
    if (this.ult.v === this.version && Math.hypot(this.ult.x - x, this.ult.z - z) < 12) return;
    this.ult = { x, z, v: this.version };
    const n = new Array(N_PROPS).fill(0);
    for (const l of this.fuentes.values()) for (const f of l) {
      const im = this.mallas[f.tipo], tope = im.instanceMatrix.count, d = f.d;
      for (let i = 0; i < d.length && n[f.tipo] < tope; i += 8) {
        const px = d[i] + f.ox, pz = d[i + 2] + f.oz;
        if (Math.abs(px - x) > r || Math.abs(pz - z) > r) continue;
        this.p.set(px, d[i + 1], pz);
        this.q.setFromAxisAngle(this.e, d[i + 3]);
        this.s.setScalar(d[i + 4]);
        this.m.compose(this.p, this.q, this.s);
        im.setMatrixAt(n[f.tipo], this.m);
        im.setColorAt(n[f.tipo], this.c.setRGB(d[i + 5], d[i + 6], d[i + 7]));
        n[f.tipo]++;
      }
    }
    this.mallas.forEach((im, i) => { im.count = n[i]; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; });
  }
  destruir() { for (const m of this.mallas) { m.removeFromParent(); m.geometry.dispose(); m.dispose(); } }
}
const TOPES: Record<number, number> = { 0: 260, 2: 160, 4: 200, 24: 400, 5: 120, 25: 40 };

export class Mundo {
  celdas = new Map<string, Celda>();
  private tiles = new Map<string, EstadoTile>();
  private pedidas = new Set<string>();
  private listas: CeldaDatos[] = [];
  private armando: Generator<void, void, void> | null = null;
  private enCurso = 0;
  private ultimo = { x: Infinity, z: Infinity, t: -1 };
  private geoKit: THREE.BufferGeometry[];
  private grupo = new THREE.Group();
  private falta: string[] = [];
  private sinDatos = new Set<string>();
  private muebles: Mobiliario;
  arboleda: Arboleda;
  private bytes = 0;
  private fueraAvisado = false;
  /** Milisegundos por cuadro para integrar celdas. */
  presupuesto = 2.5;
  /** Cuántas celdas tienen que estar para poder arrancar. */
  inicial: Set<string> | null = null;
  fallos = 0;
  version = 0;
  /** Sube cuando cambia algo que proyecta sombra. */
  sombraVersion = 0;
  C: number;

  constructor(
    escena: THREE.Scene, private o: Origen, private mats: Materiales, private proc: () => Procesador, private proveedor: ProveedorTiles, private calidad: () => Calidad,
    private eventos: { progreso: (f: number) => void; fallo: (m: string) => void; aviso: (m: string) => void },
    matTronco: THREE.ShaderMaterial,
  ) {
    escena.add(this.grupo);
    this.C = o.m / DIV;
    this.geoKit = Array.from({ length: N_KIT }, (_, i) => geoKit(i));
    this.muebles = new Mobiliario(this.grupo, mats.prop);
    const q = calidad();
    this.arboleda = new Arboleda(this.grupo, mats.follaje, matTronco, 90 + q.nivel * 70, 900 + q.nivel * 300);
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
      this.ultimo.t = -1;
    } else if (r.t === "error") {
      if (r.gx != null) { this.enCurso = Math.max(0, this.enCurso - 1); this.sinDatos.add(`${r.gx}/${r.gy}`); this.contarInicial(`${r.gx}/${r.gy}`); }
      if (r.tx != null) {
        /* Un tile dañado no rompe el resto: queda sin datos y se sigue */
        const t = this.tiles.get(`${r.tx}/${r.ty}`);
        if (t) { t.estado = "error"; this.fallos++; }
      }
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
        if (err instanceof FueraDeZona) {
          e.estado = "error";
          this.ultimo.t = -1;
          const m = celdaDeMundo(this.o, this.ultimo.x, this.ultimo.z);
          if (Math.floor(m.gx / DIV) === tx && Math.floor(m.gy / DIV) === ty && !this.celdas.size) this.eventos.fallo(MENSAJE_ZONA);
          else if (!this.fueraAvisado) { this.fueraAvisado = true; if (this.celdas.size) this.eventos.aviso("Acá termina la zona del mapa 3D."); }
          return;
        }
        if (++e.intentos < 3) { setTimeout(bajar, 700 * e.intentos); return; }
        e.estado = "error";
        this.fallos++;
        console.warn("calle:", err);
        if (this.inicial && this.falta.length && !this.celdas.size) this.eventos.fallo("No pudimos bajar el mapa de esta zona.");
        else this.eventos.aviso("Falta un pedazo del mapa: revisá tu conexión.");
      });
    };
    bajar();
  }

  /** Decide qué falta y qué sobra. Se llama seguido, pero solo trabaja si te moviste. `vx,vz`: para adelantarse. */
  actualizar(x: number, z: number, ahora: number, vx = 0, vz = 0) {
    const q = this.calidad();
    /* Adelanta el centro de carga cuando vas rápido */
    const fx = x + vx * 1.6, fz = z + vz * 1.6;
    if (Math.hypot(x - this.ultimo.x, z - this.ultimo.z) > 10 || ahora - this.ultimo.t > 0.5 || this.ultimo.t < 0) {
      this.ultimo = { x, z, t: ahora };
      const { gx, gy } = celdaDeMundo(this.o, fx, fz);
      const rc = Math.ceil(q.radio / this.C) + 1, nec: { k: string; gx: number; gy: number; d: number }[] = [];
      for (let j = gy - rc; j <= gy + rc; j++) for (let i = gx - rc; i <= gx + rc; i++) {
        const p = origenCelda(this.o, i, j), d = Math.hypot(p.x + this.C / 2 - fx, p.z + this.C / 2 - fz);
        if (d < q.radio + this.C * 0.75) nec.push({ k: `${i}/${j}`, gx: i, gy: j, d });
      }
      nec.sort((a, b) => a.d - b.d);
      if (!this.inicial) {
        const cerca = nec.filter((n) => n.d < 130).map((n) => n.k);
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
        if (t.estado !== "listo" || this.enCurso >= 2) continue;
        this.pedidas.add(n.k);
        this.enCurso++;
        this.proc().enviar({ t: "celda", gx: n.gx, gy: n.gy });
      }
      const lim = q.radio + this.C * 1.7;
      for (const [k, c] of this.celdas) if (Math.hypot(c.cx - x, c.cz - z) > lim) this.soltar(k, c);
      /* Tope de memoria: si la zona es muy densa, se sueltan primero las más lejanas */
      if (this.bytes > q.memoria) {
        const l = [...this.celdas.entries()].sort((a, b) => Math.hypot(b[1].cx - x, b[1].cz - z) - Math.hypot(a[1].cx - x, a[1].cz - z));
        for (const [k, c] of l) { if (this.bytes <= q.memoria * 0.9 || Math.hypot(c.cx - x, c.cz - z) < 240) break; this.soltar(k, c); }
      }
      this.listas = this.listas.filter((c) => {
        const p = origenCelda(this.o, c.gx, c.gy);
        if (Math.hypot(p.x + this.C / 2 - x, p.z + this.C / 2 - z) <= lim) return true;
        this.pedidas.delete(`${c.gx}/${c.gy}`);
        return false;
      });
      for (const [k, t] of this.tiles) {
        if (tilesUsados.has(k) || (t.estado === "pidiendo" && t.intentos > 0)) continue;
        const [tx, ty] = k.split("/").map(Number), px = (tx + 0.5 - this.o.fx) * this.o.m, pz = (ty + 0.5 - this.o.fy) * this.o.m;
        if (Math.hypot(px - x, pz - z) > this.o.m * 1.5) {
          t.ctrl?.abort();
          this.tiles.delete(k);
          if (t.estado !== "error") this.proc().enviar({ t: "soltar", tx, ty });
          for (const c of [...this.pedidas]) { const [a, b] = c.split("/").map(Number); if (`${Math.floor(a / DIV)}/${Math.floor(b / DIV)}` === k && !this.celdas.has(c)) this.pedidas.delete(c); }
        }
      }
    }
    /* Integración repartida entre cuadros: unos pocos milisegundos y sigue en el próximo */
    const t0 = performance.now();
    do {
      if (!this.armando) {
        if (!this.listas.length) break;
        let m = 0, md = Infinity;
        this.listas.forEach((c, i) => {
          const p = origenCelda(this.o, c.gx, c.gy), d = Math.hypot(p.x + this.C / 2 - fx, p.z + this.C / 2 - fz);
          if (d < md) { md = d; m = i; }
        });
        this.armando = this.integrar(this.listas.splice(m, 1)[0]);
      }
      if (this.armando.next().done) this.armando = null;
    } while (performance.now() - t0 < this.presupuesto);
    this.lod(x, z, q);
    this.muebles.actualizar(x, z, q.rProps);
    if (this.arboleda.actualizar(x, z, q.rArbolCerca, q.rTronco, q.rArbol)) this.sombraVersion++;
  }

  private *integrar(d: CeldaDatos): Generator<void, void, void> {
    const k = `${d.gx}/${d.gy}`;
    if (this.celdas.has(k)) return;
    const { x: ox, z: oz } = origenCelda(this.o, d.gx, d.gy), C = this.C;
    const grupo = new THREE.Group();
    grupo.position.set(ox, 0, oz);
    this.grupo.add(grupo);
    let bytes = d.mapa.byteLength;

    const mapa = new THREE.DataTexture(d.mapa as Uint8Array<ArrayBuffer>, d.ladoMapa, d.ladoMapa, THREE.RGBAFormat);
    mapa.magFilter = mapa.minFilter = THREE.LinearFilter;
    mapa.wrapS = mapa.wrapT = THREE.ClampToEdgeWrapping;
    mapa.needsUpdate = true;
    const gs = new THREE.BufferGeometry();
    gs.setAttribute("position", new THREE.BufferAttribute(d.suelo.pos, 3));
    gs.setAttribute("aCol", new THREE.BufferAttribute(d.suelo.col, 4, true));
    gs.setAttribute("aMat", new THREE.BufferAttribute(d.suelo.mat, 4, true));
    gs.setIndex(new THREE.BufferAttribute(d.suelo.idx, 1));
    gs.boundingSphere = new THREE.Sphere(new THREE.Vector3(C / 2, 0, C / 2), C * 0.75);
    const mS = matSuelo(this.mats.comunes, { baldosa: this.mats.baldosa }, mapa, C, d.ladoMapa);
    const suelo = new THREE.Mesh(gs, mS);
    suelo.renderOrder = -20;
    grupo.add(suelo);
    bytes += d.suelo.pos.byteLength + d.suelo.col.byteLength * 2 + d.suelo.idx.byteLength;
    yield;

    let edif: THREE.Mesh | null = null;
    if (d.edif.idx.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(d.edif.pos, 3));
      g.setAttribute("aUv", new THREE.BufferAttribute(d.edif.uv, 4));
      g.setAttribute("aVen", new THREE.BufferAttribute(d.edif.ven, 4));
      g.setAttribute("aEst", new THREE.BufferAttribute(d.edif.est, 4, true));
      g.setAttribute("aNor", new THREE.BufferAttribute(d.edif.nor, 4, true));
      g.setAttribute("aCol", new THREE.BufferAttribute(d.edif.col, 4, true));
      g.setIndex(new THREE.BufferAttribute(d.edif.idx, 1));
      g.computeBoundingSphere();
      edif = new THREE.Mesh(g, this.mats.edif);
      edif.layers.enable(CAPA_SOLIDOS);
      grupo.add(edif);
      bytes += d.edif.pos.byteLength * 4 + d.edif.idx.byteLength;
    }
    yield;

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
      det.visible = false;
      grupo.add(det);
      bytes += d.det.pos.byteLength * 3;
    }
    yield;

    const kit: THREE.InstancedMesh[] = [], kitLejos: THREE.InstancedMesh[] = [];
    for (const l of d.kit) {
      const n = l.c.length / 3, im = new THREE.InstancedMesh(this.geoKit[l.pieza], this.mats.prop, n);
      im.instanceMatrix = new THREE.InstancedBufferAttribute(l.m, 16);
      im.instanceColor = new THREE.InstancedBufferAttribute(l.c, 3);
      im.computeBoundingSphere();
      im.visible = !!l.siempre;
      if (l.siempre || l.pieza === K_CAJA || l.pieza === K_CORNISA) im.layers.enable(CAPA_SOLIDOS);
      grupo.add(im);
      (l.siempre ? kitLejos : kit).push(im);
      bytes += l.m.byteLength + l.c.byteLength;
    }
    yield;

    const singulares: THREE.Mesh[] = [];
    for (const s of d.singulares) {
      const geo = geoSingular(s.id, s.anillo, s.giro);
      if (!geo) continue;
      const m = new THREE.Mesh(geo, this.mats.prop);
      m.position.set(s.x, 0, s.z);
      m.rotation.y = -s.giro;
      m.layers.enable(CAPA_SOLIDOS);
      m.frustumCulled = true;
      grupo.add(m);
      singulares.push(m);
    }
    yield;

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
    yield;

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
        const total = L[n2 - 1], altos = new Float32Array(v.altos);
        if (!ida) for (let i = 0; i < altos.length; i += 3) altos[i] = total - altos[i];
        return { id: v.id, pts, L, total, hw: v.hw, ida, sentido: v.sentido, carriles: v.carriles, altos, clase: v.clase };
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
      gx: d.gx, gy: d.gy, ox, oz, cx: ox + C / 2, cz: oz + C / 2, grupo, suelo, matSuelo: mS, mapa, datosMapa: d.mapa, ladoMapa: d.ladoMapa, edif, det, matDet, atlas: null, kit, kitLejos, singulares,
      datos: d, locales, col: paredes, grilla, tramos, nombres: d.nombres, vias, bytes,
    };
    this.bytes += bytes;
    this.celdas.set(k, celda);
    this.muebles.agregar(k, d.props, ox, oz);
    this.arboleda.agregar(k, d.arboles, ox, oz);
    this.version++;
    this.sombraVersion++;
    this.contarInicial(k);
  }

  private soltar(k: string, c: Celda) {
    this.grupo.remove(c.grupo);
    c.suelo.geometry.dispose();
    c.matSuelo.dispose();
    c.mapa.dispose();
    c.edif?.geometry.dispose();
    c.det?.geometry.dispose();
    c.matDet?.dispose();
    c.atlas?.dispose();
    for (const m of [...c.kit, ...c.kitLejos]) m.dispose();
    for (const m of c.singulares) m.geometry.dispose();
    this.muebles.quitar(k);
    this.arboleda.quitar(k);
    this.bytes -= c.bytes;
    this.celdas.delete(k);
    this.pedidas.delete(k);
    this.version++;
    this.sombraVersion++;
  }

  private lod(x: number, z: number, q: Calidad) {
    let cand: Celda | null = null, md = q.rAtlas;
    for (const c of this.celdas.values()) {
      const d = Math.max(Math.abs(c.cx - x), Math.abs(c.cz - z)) - this.C / 2;
      const dist = Math.max(0, d);
      if (c.det) c.det.visible = dist < q.rDet;
      const verKit = dist < q.rKit;
      if (c.kit.length && c.kit[0].visible !== verKit) {
        for (const m of c.kit) m.visible = verKit;
        this.sombraVersion++;
      }
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

  /** Cuánto falta por integrar o llegar: para esperar en pruebas. */
  pendiente() { return this.listas.length + this.enCurso + (this.armando ? 1 : 0); }

  /** La vereda está 15 cm arriba de la calzada: lo lee del mapa del suelo. */
  altoSuelo(x: number, z: number) {
    const { gx, gy } = celdaDeMundo(this.o, x, z);
    const c = this.celdas.get(`${gx}/${gy}`);
    if (!c) return ALTO_VEREDA;
    const L = c.ladoMapa, p = (L - 1) / this.C, i = Math.max(0, Math.min(L - 1, Math.round((x - c.ox) * p))), j = Math.max(0, Math.min(L - 1, Math.round((z - c.oz) * p)));
    return ((c.datosMapa[(j * L + i) * 4] - 128) * RANGO) / 127 > 0 ? ALTO_VEREDA : 0;
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
    let tris = 0, atlas = 0, loc = 0, kit = 0;
    for (const c of this.celdas.values()) {
      tris += c.suelo.geometry.index!.count / 3 + (c.edif?.geometry.index!.count ?? 0) / 3 + (c.det?.geometry.index!.count ?? 0) / 3;
      if (c.atlas) atlas++;
      loc += c.locales.length;
      for (const m of c.kit) if (m.visible) kit += m.count;
    }
    return { celdas: this.celdas.size, tris, atlas, locales: loc, tiles: this.tiles.size, cola: this.listas.length, kit, arboles: this.arboleda.contar(), mb: Math.round(this.bytes / 1e5) / 10 };
  }

  destruir() {
    for (const t of this.tiles.values()) t.ctrl?.abort();
    this.armando = null;
    for (const [k, c] of [...this.celdas]) this.soltar(k, c);
    this.muebles.destruir();
    this.arboleda.destruir();
    this.geoKit.forEach((g) => g.dispose());
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
