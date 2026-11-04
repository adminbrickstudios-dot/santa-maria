/* Decoración que se mueve: autos y colectivos por las avenidas, y gente genérica por las veredas.
   Nadie tiene rostro, patente ni nada que identifique. */
import * as THREE from "three";
import type { Calidad, Mundo, ViaMundo } from "./mundo";
import { geoAuto, geoColectivo, geoPersona, hex } from "./objetos";

const col = (h: string) => new THREE.Color().setStyle(h, THREE.LinearSRGBColorSpace);
const COLECTIVOS = ["#F4C20D", "#1E63C8", "#F4C20D", "#2B7FD9", "#E8B400"].map(col);
const AUTOS = ["#D8DAD6", "#2B2E36", "#9EA5AC", "#C33C33", "#2D5FA8", "#E9E4D8", "#66707A", "#7E2B2B"].map(col);
const ROPA = ["#D65A4A", "#3C7EBF", "#E0A42E", "#4EA579", "#8A62B8", "#F0EBDD", "#39424E", "#D98497", "#3E8E98"].map(col);

interface Vehiculo { via: ViaMundo | null; s: number; i: number; carril: number; vel: number; tipo: number; ind: number }
interface Persona { ax: number; az: number; bx: number; bz: number; t: number; dir: number; of: number; vel: number; viva: boolean }

export class Trafico {
  private mallas: THREE.InstancedMesh[];
  private gente: THREE.InstancedMesh;
  private fases: Float32Array;
  private vehiculos: Vehiculo[] = [];
  private personas: Persona[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private eje = new THREE.Vector3(0, 1, 0);
  private p = new THREE.Vector3();
  private s = new THREE.Vector3(1, 1, 1);
  private cache: { version: number; vias: ViaMundo[] } = { version: -1, vias: [] };
  private sombras: THREE.InstancedMesh;
  private texSombra: THREE.CanvasTexture;

  constructor(escena: THREE.Scene, mat: THREE.ShaderMaterial) {
    const geos = [geoColectivo(), geoAuto(), geoAuto(hex("#F4C20D"))], topes = [6, 16, 5];
    this.mallas = geos.map((g, i) => {
      const m = new THREE.InstancedMesh(g, mat, topes[i]);
      m.frustumCulled = false;
      m.count = 0;
      for (let k = 0; k < topes[i]; k++) {
        const pal = i === 0 ? COLECTIVOS : i === 2 ? [col("#1A1C20")] : AUTOS;
        m.setColorAt(k, pal[k % pal.length]);
        this.vehiculos.push({ via: null, s: 0, i: 0, carril: 0, vel: 0, tipo: i, ind: k });
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

    /* Sombrita blanda bajo cada cosa que se mueve: un solo llamado de dibujo */
    const cv = document.createElement("canvas");
    cv.width = cv.height = 64;
    const c = cv.getContext("2d")!, g = c.createRadialGradient(32, 32, 6, 32, 32, 32);
    g.addColorStop(0, "#fff");
    g.addColorStop(0.55, "#bbb");
    g.addColorStop(1, "#000");
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
    this.texSombra = new THREE.CanvasTexture(cv);
    const gs = new THREE.PlaneGeometry(1, 1);
    gs.rotateX(-Math.PI / 2);
    const ms = new THREE.MeshBasicMaterial({ color: 0x1a1626, alphaMap: this.texSombra, transparent: true, opacity: 0.42, depthWrite: false });
    this.sombras = new THREE.InstancedMesh(gs, ms, this.vehiculos.length + N);
    this.sombras.frustumCulled = false;
    this.sombras.count = 0;
    this.sombras.position.y = 0.03;
    escena.add(this.sombras);
  }

  private nSombra = 0;
  private sombraEn(x: number, z: number, g: number, an: number, la: number) {
    this.p.set(x, 0, z);
    this.q.setFromAxisAngle(this.eje, g);
    this.s.set(an, 1, la);
    this.m.compose(this.p, this.q, this.s);
    this.sombras.setMatrixAt(this.nSombra++, this.m);
    this.s.set(1, 1, 1);
  }

  private vias(mundo: Mundo) {
    if (this.cache.version !== mundo.version) this.cache = { version: mundo.version, vias: mundo.todasLasVias() };
    return this.cache.vias;
  }

  private ubicar(v: Vehiculo, vias: ViaMundo[], x: number, z: number) {
    v.via = null;
    if (!vias.length) return;
    for (let i = 0; i < 12; i++) {
      const c = vias[Math.floor(Math.random() * vias.length)];
      if (c.total < 20 || (v.tipo === 0 && c.hw < 5)) continue;
      const s = Math.random() * c.total;
      let k = 0;
      while (k < c.L.length - 2 && c.L[k + 1] < s) k++;
      const d = Math.hypot(c.pts[k * 2] - x, c.pts[k * 2 + 1] - z);
      if (d < 55 || d > 240) continue;
      v.via = c; v.s = s; v.i = k;
      const lados = c.sentido ? [-0.58, 0, 0.58] : [0.52];
      v.carril = lados[Math.floor(Math.random() * lados.length)] * c.hw;
      v.vel = v.tipo === 0 ? 7 + Math.random() * 2 : 8.5 + Math.random() * 3.5;
      return;
    }
  }

  /** Busca la vía que sigue cuando se termina la actual. */
  private seguir(v: Vehiculo, vias: ViaMundo[]) {
    const c = v.via!, n = c.pts.length / 2, ex = c.pts[n * 2 - 2], ez = c.pts[n * 2 - 1];
    const dx = ex - c.pts[n * 2 - 4], dz = ez - c.pts[n * 2 - 3];
    let mejor: ViaMundo | null = null, mp = 0.5;
    for (const o of vias) {
      if (o === c || Math.hypot(o.pts[0] - ex, o.pts[1] - ez) > 5) continue;
      const ox = o.pts[2] - o.pts[0], oz = o.pts[3] - o.pts[1], co = (ox * dx + oz * dz) / (Math.hypot(ox, oz) * Math.hypot(dx, dz) || 1);
      if (co > mp) { mp = co; mejor = o; }
    }
    if (!mejor) return false;
    v.via = mejor; v.s = 0; v.i = 0;
    return true;
  }

  actualizar(dt: number, x: number, z: number, mundo: Mundo, cal: Calidad) {
    const vias = this.vias(mundo);
    const cantidad = [Math.ceil(cal.autos * 0.25), Math.ceil(cal.autos * 0.6), Math.ceil(cal.autos * 0.15)];
    const cuenta = [0, 0, 0];
    this.nSombra = 0;
    for (const v of this.vehiculos) {
      if (v.ind >= cantidad[v.tipo]) continue;
      if (!v.via) { this.ubicar(v, vias, x, z); if (!v.via) continue; }
      const c = v.via;
      let vel = v.vel;
      const ax = c.pts[v.i * 2], az = c.pts[v.i * 2 + 1], bx = c.pts[v.i * 2 + 2], bz = c.pts[v.i * 2 + 3];
      const L = c.L[v.i + 1] - c.L[v.i] || 1, dx = (bx - ax) / L, dz = (bz - az) / L, t = v.s - c.L[v.i];
      const px = ax + dx * t - dz * v.carril, pz = az + dz * t + dx * v.carril;
      /* frena si tenés que cruzar */
      const fx = x - px, fz = z - pz, ad = fx * dx + fz * dz, lat = Math.abs(-fx * dz + fz * dx);
      if (ad > 0 && ad < (v.tipo === 0 ? 11 : 9) && lat < 2.2) vel = 0;
      v.s += vel * dt;
      while (v.i < c.L.length - 2 && v.s > c.L[v.i + 1]) v.i++;
      if (v.s >= c.total) {
        if (!this.seguir(v, vias)) { v.via = null; continue; }
      }
      if (Math.hypot(px - x, pz - z) > 300) { v.via = null; continue; }
      const k = cuenta[v.tipo]++;
      this.p.set(px, 0, pz);
      this.q.setFromAxisAngle(this.eje, Math.atan2(dx, dz));
      this.m.compose(this.p, this.q, this.s);
      this.mallas[v.tipo].setMatrixAt(k, this.m);
      if (v.tipo === 0) this.sombraEn(px, pz, Math.atan2(dx, dz), 3.4, 12.5); else this.sombraEn(px, pz, Math.atan2(dx, dz), 2.5, 5.2);
    }
    this.mallas.forEach((m, i) => { m.count = cuenta[i]; m.instanceMatrix.needsUpdate = true; });

    /* Gente */
    let n = 0;
    for (let i = 0; i < this.personas.length; i++) {
      const p = this.personas[i];
      if (i >= cal.gente) continue;
      if (!p.viva) { this.nacer(p, x, z, mundo); if (!p.viva) continue; }
      const L = Math.hypot(p.bx - p.ax, p.bz - p.az) || 1;
      p.t += (p.dir * p.vel * dt) / L;
      if (p.t > 1 || p.t < 0) { p.dir = -p.dir; p.t = Math.max(0, Math.min(1, p.t)); }
      const dx = (p.bx - p.ax) / L, dz = (p.bz - p.az) / L, px = p.ax + (p.bx - p.ax) * p.t - dz * p.of, pz = p.az + (p.bz - p.az) * p.t + dx * p.of;
      if (Math.hypot(px - x, pz - z) > 130) { p.viva = false; continue; }
      this.p.set(px, 0, pz);
      this.q.setFromAxisAngle(this.eje, Math.atan2(dx * p.dir, dz * p.dir));
      this.m.compose(this.p, this.q, this.s);
      this.gente.setMatrixAt(n, this.m);
      this.sombraEn(px, pz, 0, 0.95, 0.95);
      if (this.fases[n] !== this.fases[i]) this.fases[n] = this.fases[i];
      n++;
    }
    this.gente.count = n;
    this.gente.instanceMatrix.needsUpdate = true;
    this.sombras.count = this.nSombra;
    this.sombras.instanceMatrix.needsUpdate = true;
  }

  private nacer(p: Persona, x: number, z: number, mundo: Mundo) {
    const l = mundo.tramosCerca(x, z);
    if (!l.length) return;
    for (let i = 0; i < 6; i++) {
      const { t, ini } = l[Math.floor(Math.random() * l.length)], hw = t[ini + 4];
      if (hw < 4) continue;
      const ax = t[ini], az = t[ini + 1], bx = t[ini + 2], bz = t[ini + 3], q = Math.random();
      const lado = Math.random() < 0.5 ? 1 : -1, of = lado * (hw + 1.9 + Math.random() * 0.9);
      const L = Math.hypot(bx - ax, bz - az) || 1, px = ax + (bx - ax) * q - ((bz - az) / L) * of, pz = az + (bz - az) * q + ((bx - ax) / L) * of;
      const d = Math.hypot(px - x, pz - z);
      if (d < 7 || d > 110 || mundo.chocar(px, pz, 0.4)[2]) continue;
      Object.assign(p, { ax, az, bx, bz, t: q, dir: Math.random() < 0.5 ? 1 : -1, of, vel: 1.05 + Math.random() * 0.5, viva: true });
      return;
    }
  }

  destruir() {
    for (const m of [...this.mallas, this.gente, this.sombras]) { m.geometry.dispose(); m.dispose(); }
    this.texSombra.dispose();
    (this.sombras.material as THREE.Material).dispose();
  }
}
