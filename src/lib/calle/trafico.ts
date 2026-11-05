/* Lo que se mueve: taxis, autos, colectivos y bicis por su calle y su sentido, frenando en los semáforos,
   y gente genérica por las veredas. Nadie tiene rostro, patente ni nada que identifique. */
import * as THREE from "three";
import type { Calidad, Mundo, ViaMundo } from "./mundo";
import { geoBici, geoCamioneta, geoColectivo, geoPerro, geoPersona, geoSedan, geoTaxi } from "./objetos";
import { luzSemaforo } from "./piezas";

const col = (h: string) => new THREE.Color().setStyle(h, THREE.LinearSRGBColorSpace);
const COLECTIVOS = ["#E0B40F", "#1E63C8", "#C8362C", "#2B8F6A", "#E8E2D2", "#2B7FD9"].map(col);
const AUTOS = ["#D8DAD6", "#2B2E36", "#9EA5AC", "#A33A33", "#2D5FA8", "#E9E4D8", "#66707A", "#5A2B2B", "#BFC4C8", "#1E2228"].map(col);
const ROPA = ["#B65A4A", "#3C6E9F", "#C0943E", "#4E8569", "#7A62A8", "#E0DBCD", "#39424E", "#C98497", "#3E7E88", "#2C3038", "#8C8C84"].map(col);

const T_COLECTIVO = 0, T_SEDAN = 1, T_TAXI = 2, T_CAMIONETA = 3, T_BICI = 4;
interface Vehiculo { via: ViaMundo | null; s: number; i: number; carril: number; vel: number; v: number; tipo: number; ind: number; yaw: number }
interface Persona { ax: number; az: number; bx: number; bz: number; t: number; dir: number; of: number; vel: number; viva: boolean }

const VEL_TIPO = [8, 10, 10.5, 9, 5.5], LARGO = [11.5, 4.3, 4.3, 4.8, 1.8];

export class Trafico {
  private mallas: THREE.InstancedMesh[];
  private gente: THREE.InstancedMesh;
  private perros: THREE.InstancedMesh;
  private fases: Float32Array;
  private vehiculos: Vehiculo[] = [];
  private personas: Persona[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private eje = new THREE.Vector3(0, 1, 0);
  private p = new THREE.Vector3();
  private s = new THREE.Vector3(1, 1, 1);
  private cache: { version: number; vias: ViaMundo[]; ini: Map<number, ViaMundo[]> } = { version: -1, vias: [], ini: new Map() };
  private sombras: THREE.InstancedMesh;
  private texSombra: THREE.CanvasTexture;
  private t = 0;

  constructor(escena: THREE.Scene, mat: THREE.ShaderMaterial) {
    const geos = [geoColectivo(), geoSedan(), geoTaxi(), geoCamioneta(), geoBici()], topes = [6, 14, 6, 4, 4];
    this.mallas = geos.map((g, i) => {
      const m = new THREE.InstancedMesh(g, mat, topes[i]);
      m.frustumCulled = false;
      m.count = 0;
      for (let k = 0; k < topes[i]; k++) {
        const pal = i === T_COLECTIVO ? COLECTIVOS : i === T_TAXI ? [col("#FFFFFF")] : i === T_BICI ? [col("#E8701A")] : AUTOS;
        m.setColorAt(k, pal[k % pal.length]);
        this.vehiculos.push({ via: null, s: 0, i: 0, carril: 0, vel: 0, v: 0, tipo: i, ind: k, yaw: 0 });
      }
      escena.add(m);
      return m;
    });
    const gp = geoPersona(), N = 34;
    this.fases = new Float32Array(N);
    for (let i = 0; i < N; i++) this.fases[i] = Math.random() * 6.28;
    gp.setAttribute("aFase", new THREE.InstancedBufferAttribute(this.fases, 1));
    this.gente = new THREE.InstancedMesh(gp, mat, N);
    this.gente.frustumCulled = false;
    this.gente.count = 0;
    for (let i = 0; i < N; i++) {
      this.gente.setColorAt(i, ROPA[i % ROPA.length]);
      this.personas.push({ ax: 0, az: 0, bx: 0, bz: 0, t: 0, dir: 1, of: 0, vel: 1.2, viva: false });
    }
    escena.add(this.gente);
    const gd = geoPerro();
    gd.setAttribute("aFase", new THREE.InstancedBufferAttribute(Float32Array.from({ length: 6 }, () => Math.random() * 6), 1));
    this.perros = new THREE.InstancedMesh(gd, mat, 6);
    this.perros.frustumCulled = false;
    this.perros.count = 0;
    ["#C9A06A", "#2E2A26", "#E6DFCF", "#8A6544", "#6E6E6A", "#B8884A"].forEach((h, i) => this.perros.setColorAt(i, col(h)));
    escena.add(this.perros);

    /* Sombrita blanda bajo cada cosa que se mueve: un solo llamado de dibujo */
    const cv = document.createElement("canvas");
    cv.width = cv.height = 64;
    const c = cv.getContext("2d")!, g = c.createRadialGradient(32, 32, 6, 32, 32, 32);
    g.addColorStop(0, "#fff");
    g.addColorStop(0.55, "#aaa");
    g.addColorStop(1, "#000");
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
    this.texSombra = new THREE.CanvasTexture(cv);
    const gs = new THREE.PlaneGeometry(1, 1);
    gs.rotateX(-Math.PI / 2);
    const ms = new THREE.MeshBasicMaterial({ color: 0x0c0a10, alphaMap: this.texSombra, transparent: true, opacity: 0.52, depthWrite: false, depthTest: true });
    this.sombras = new THREE.InstancedMesh(gs, ms, this.vehiculos.length + N);
    this.sombras.frustumCulled = false;
    this.sombras.count = 0;
    this.sombras.position.y = 0.03;
    this.sombras.renderOrder = -15;
    escena.add(this.sombras);
  }

  private nSombra = 0;
  private sombraEn(x: number, y: number, z: number, g: number, an: number, la: number) {
    this.p.set(x, y, z);
    this.q.setFromAxisAngle(this.eje, g);
    this.s.set(an, 1, la);
    this.m.compose(this.p, this.q, this.s);
    this.sombras.setMatrixAt(this.nSombra++, this.m);
    this.s.set(1, 1, 1);
  }

  private vias(mundo: Mundo) {
    if (this.cache.version !== mundo.version) {
      const vias = mundo.todasLasVias(), ini = new Map<number, ViaMundo[]>();
      for (const v of vias) {
        const k = claveP(v.pts[0], v.pts[1]), l = ini.get(k);
        if (l) l.push(v); else ini.set(k, [v]);
      }
      this.cache = { version: mundo.version, vias, ini };
    }
    return this.cache;
  }

  private ubicar(v: Vehiculo, vias: ViaMundo[], x: number, z: number) {
    v.via = null;
    if (!vias.length) return;
    for (let i = 0; i < 14; i++) {
      const c = vias[Math.floor(Math.random() * vias.length)];
      if (c.total < 12 || (v.tipo === T_COLECTIVO && c.hw < 4.6) || (v.tipo === T_BICI && c.hw > 7)) continue;
      const s = Math.random() * c.total;
      let k = 0;
      while (k < c.L.length - 2 && c.L[k + 1] < s) k++;
      const d = Math.hypot(c.pts[k * 2] - x, c.pts[k * 2 + 1] - z);
      if (d < 45 || d > 260) continue;
      v.via = c; v.s = s; v.i = k;
      const nC = Math.max(1, Math.round(c.sentido ? c.carriles : c.carriles / 2)), ca = Math.floor(Math.random() * nC);
      /* Doble mano: siempre por la derecha */
      const ancho = c.sentido ? c.hw * 2 : c.hw;
      v.carril = c.sentido ? -c.hw + (ancho / nC) * (ca + 0.5) : (ancho / nC) * (ca + 0.5);
      if (v.tipo === T_BICI) v.carril = c.sentido ? c.hw - 0.9 : c.hw - 0.9;
      v.vel = VEL_TIPO[v.tipo] * (0.85 + Math.random() * 0.3);
      v.v = v.vel;
      return;
    }
  }

  /** Busca la vía que sigue cuando se termina la actual: primero la misma calle, si no doblar. */
  private seguir(v: Vehiculo, ini: Map<number, ViaMundo[]>) {
    const c = v.via!, n = c.pts.length / 2, ex = c.pts[n * 2 - 2], ez = c.pts[n * 2 - 1];
    const dx = ex - c.pts[n * 2 - 4], dz = ez - c.pts[n * 2 - 3], L = Math.hypot(dx, dz) || 1;
    let mejor: ViaMundo | null = null, mp = -0.4;
    const k0 = claveP(ex, ez);
    for (const k of [k0, k0 + 1, k0 - 1, k0 + 4096, k0 - 4096]) for (const o of ini.get(k) ?? []) {
      if (o === c || Math.hypot(o.pts[0] - ex, o.pts[1] - ez) > 4) continue;
      const ox = o.pts[2] - o.pts[0], oz = o.pts[3] - o.pts[1], co = (ox * dx + oz * dz) / (Math.hypot(ox, oz) * L || 1) + (o.id === c.id ? 2 : 0) + Math.random() * 0.25;
      if (v.tipo === T_COLECTIVO && o.hw < 4.6) continue;
      if (co > mp) { mp = co; mejor = o; }
    }
    if (!mejor) return false;
    v.via = mejor; v.s = 0; v.i = 0;
    const nC = Math.max(1, Math.round(mejor.sentido ? mejor.carriles : mejor.carriles / 2));
    const ancho = mejor.sentido ? mejor.hw * 2 : mejor.hw;
    const ca = Math.min(nC - 1, Math.floor(Math.random() * nC));
    v.carril = mejor.sentido ? -mejor.hw + (ancho / nC) * (ca + 0.5) : (ancho / nC) * (ca + 0.5);
    return true;
  }

  /** Distancia al próximo semáforo en rojo, adelante en esta vía. */
  private rojoAdelante(v: Vehiculo, t: number) {
    const a = v.via!.altos;
    let d = Infinity;
    for (let i = 0; i < a.length; i += 3) {
      const r = a[i] - 6 - v.s;
      if (r < -1 || r > 32 || r > d) continue;
      if (luzSemaforo(t, a[i + 1], a[i + 2]) !== 0) d = r;
    }
    return d;
  }

  actualizar(dt: number, x: number, z: number, mundo: Mundo, cal: Calidad, t = 0) {
    this.t = t;
    const { vias, ini } = this.vias(mundo);
    const cantidad = [Math.ceil(cal.autos * 0.2), Math.ceil(cal.autos * 0.5), Math.ceil(cal.autos * 0.22), Math.ceil(cal.autos * 0.12), Math.ceil(cal.autos * 0.1)];
    const cuenta = [0, 0, 0, 0, 0];
    this.nSombra = 0;
    for (const v of this.vehiculos) {
      if (v.ind >= cantidad[v.tipo]) continue;
      if (!v.via) { this.ubicar(v, vias, x, z); if (!v.via) continue; }
      const c = v.via;
      let obj = v.vel;
      const ax = c.pts[v.i * 2], az = c.pts[v.i * 2 + 1], bx = c.pts[v.i * 2 + 2], bz = c.pts[v.i * 2 + 3];
      const L = c.L[v.i + 1] - c.L[v.i] || 1, dx = (bx - ax) / L, dz = (bz - az) / L, u = v.s - c.L[v.i];
      const px = ax + dx * u - dz * v.carril, pz = az + dz * u + dx * v.carril;
      /* Frena si estás cruzando */
      const fx = x - px, fz = z - pz, ad = fx * dx + fz * dz, lat = Math.abs(-fx * dz + fz * dx);
      if (ad > 0 && ad < LARGO[v.tipo] / 2 + 7 && lat < 2.2) obj = 0;
      /* Semáforo */
      const rojo = this.rojoAdelante(v, t);
      if (rojo < Infinity) obj = Math.min(obj, Math.max(0, rojo * 0.55 - 0.3));
      /* El de adelante en el mismo carril */
      for (const o of this.vehiculos) {
        if (o === v || o.via !== c || Math.abs(o.carril - v.carril) > 1.4) continue;
        const gap = o.s - v.s - (LARGO[v.tipo] + LARGO[o.tipo]) / 2;
        if (gap > -2 && gap < 16) obj = Math.min(obj, Math.max(0, gap * 0.6 - 0.5));
      }
      v.v += (obj - v.v) * Math.min(1, dt * (obj < v.v ? 3.5 : 1.3));
      if (v.v < 0.05) v.v = 0;
      v.s += v.v * dt;
      while (v.i < c.L.length - 2 && v.s > c.L[v.i + 1]) v.i++;
      if (v.s >= c.total) {
        if (!this.seguir(v, ini)) { v.via = null; continue; }
      }
      if (Math.hypot(px - x, pz - z) > 320) { v.via = null; continue; }
      const k = cuenta[v.tipo]++;
      /* Dobla de a poco en vez de pegar el volantazo */
      const yaw = Math.atan2(dx, dz);
      let dy = yaw - v.yaw;
      if (dy > Math.PI) dy -= Math.PI * 2; else if (dy < -Math.PI) dy += Math.PI * 2;
      v.yaw += dy * Math.min(1, dt * 4.5);
      this.p.set(px, 0, pz);
      this.q.setFromAxisAngle(this.eje, v.yaw);
      this.m.compose(this.p, this.q, this.s);
      this.mallas[v.tipo].setMatrixAt(k, this.m);
      if (v.tipo === T_COLECTIVO) this.sombraEn(px, 0, pz, v.yaw, 3.6, 13);
      else if (v.tipo === T_BICI) this.sombraEn(px, 0, pz, v.yaw, 0.9, 2);
      else this.sombraEn(px, 0, pz, v.yaw, 2.7, 5.6);
    }
    this.mallas.forEach((m, i) => { m.count = cuenta[i]; m.instanceMatrix.needsUpdate = true; });

    /* Gente */
    let n = 0, nd = 0;
    for (let i = 0; i < this.personas.length; i++) {
      const p = this.personas[i];
      if (i >= cal.gente) continue;
      if (!p.viva) { this.nacer(p, x, z, mundo); if (!p.viva) continue; }
      const L = Math.hypot(p.bx - p.ax, p.bz - p.az) || 1;
      p.t += (p.dir * p.vel * dt) / L;
      if (p.t > 1 || p.t < 0) { p.dir = -p.dir; p.t = Math.max(0, Math.min(1, p.t)); }
      const dx = (p.bx - p.ax) / L, dz = (p.bz - p.az) / L, px = p.ax + (p.bx - p.ax) * p.t - dz * p.of, pz = p.az + (p.bz - p.az) * p.t + dx * p.of;
      if (Math.hypot(px - x, pz - z) > 130) { p.viva = false; continue; }
      this.p.set(px, 0.15, pz);
      this.q.setFromAxisAngle(this.eje, Math.atan2(dx * p.dir, dz * p.dir));
      this.m.compose(this.p, this.q, this.s);
      this.gente.setMatrixAt(n, this.m);
      this.sombraEn(px, 0.15, pz, 0, 0.95, 0.95);
      if (i % 5 === 2 && nd < 6) {
        /* Algunos pasean al perro */
        this.p.set(px + dx * p.dir * 1.1 - dz * 0.35, 0.15, pz + dz * p.dir * 1.1 + dx * 0.35);
        this.m.compose(this.p, this.q, this.s);
        this.perros.setMatrixAt(nd++, this.m);
      }
      if (this.fases[n] !== this.fases[i]) this.fases[n] = this.fases[i];
      n++;
    }
    this.gente.count = n;
    this.perros.count = nd;
    this.perros.instanceMatrix.needsUpdate = true;
    this.gente.instanceMatrix.needsUpdate = true;
    this.sombras.count = this.nSombra;
    this.sombras.instanceMatrix.needsUpdate = true;
  }

  private nacer(p: Persona, x: number, z: number, mundo: Mundo) {
    const l = mundo.tramosCerca(x, z);
    if (!l.length) return;
    for (let i = 0; i < 6; i++) {
      const { t, ini } = l[Math.floor(Math.random() * l.length)], hw = t[ini + 4];
      if (hw < 3) continue;
      const ax = t[ini], az = t[ini + 1], bx = t[ini + 2], bz = t[ini + 3], q = Math.random();
      const lado = Math.random() < 0.5 ? 1 : -1, of = lado * (hw + 1.6 + Math.random() * 0.9);
      const L = Math.hypot(bx - ax, bz - az) || 1, px = ax + (bx - ax) * q - ((bz - az) / L) * of, pz = az + (bz - az) * q + ((bx - ax) / L) * of;
      const d = Math.hypot(px - x, pz - z);
      if (d < 7 || d > 110 || mundo.chocar(px, pz, 0.4)[2]) continue;
      Object.assign(p, { ax, az, bx, bz, t: q, dir: Math.random() < 0.5 ? 1 : -1, of, vel: 1.05 + Math.random() * 0.5, viva: true });
      return;
    }
  }

  destruir() {
    for (const m of [...this.mallas, this.gente, this.perros, this.sombras]) { m.removeFromParent(); m.geometry.dispose(); m.dispose(); }
    this.texSombra.dispose();
    (this.sombras.material as THREE.Material).dispose();
  }
}

const claveP = (x: number, z: number) => Math.round(z / 3) * 4096 + Math.round(x / 3);
