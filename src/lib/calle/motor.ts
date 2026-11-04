/* El corazón del modo calle: escena, bucle, caminante, cielo, locales e interiores.
   La interfaz vive en CalleVista; acá solo hay eventos y unos pocos métodos. */
import * as THREE from "three";
import { cieloEn, fechaEnHora } from "./cielo";
import { Entrada } from "./entrada";
import { crearOrigen, lonLatDeMundo, mundoDeLonLat } from "./geo";
import { crearInterior, type Interior } from "./interior";
import { aplicarCielo, crearComunes, matCielo, matDisco, matEdificio, matObjeto, matSombra, matSuelo, texturaDetalle } from "./materiales";
import { Mundo, type Calidad } from "./mundo";
import { crearProcesador, type Procesador } from "./procesador";
import { Trafico } from "./trafico";
import type { Local, ProveedorTiles } from "./tipos";

export type ModoMarcha = "caminar" | "correr" | "bici";

export interface EventosMotor {
  progreso(f: number): void;
  listo(): void;
  fallo(mensaje: string): void;
  aviso(mensaje: string): void;
  calle(nombre: string | null): void;
  rumbo(grados: number): void;
  local(l: Local | null): void;
  cerca(l: Local | null): void;
  interior(l: Local | null): void;
  fundido(activo: boolean): void;
  joystick(activo: boolean, x: number, y: number, dx: number, dy: number): void;
}

export interface OpcionesMotor {
  lat: number;
  lon: number;
  hora?: number | null;
  proveedorTiles: ProveedorTiles;
  crearWorker?: () => Worker;
  reducirMovimiento: boolean;
  /** Fija la calidad (para pruebas). Sin esto se ajusta sola. */
  calidadFija?: number;
  eventos: EventosMotor;
}

const NIVELES: Omit<Calidad, "nivel">[] = [
  { dpr: 0.85, radio: 170, rDet: 90, rAtlas: 60, rProps: 110, rSombra: 0, autos: 5, gente: 0, atlas: 0.5, ventanas: 0 },
  { dpr: 1.1, radio: 210, rDet: 130, rAtlas: 80, rProps: 150, rSombra: 0, autos: 9, gente: 10, atlas: 0.5, ventanas: 1 },
  { dpr: 1.4, radio: 270, rDet: 170, rAtlas: 95, rProps: 200, rSombra: 180, autos: 14, gente: 18, atlas: 0.75, ventanas: 1 },
  { dpr: 1.75, radio: 330, rDet: 210, rAtlas: 120, rProps: 250, rSombra: 260, autos: 20, gente: 30, atlas: 1, ventanas: 1 },
];
const VEL: Record<ModoMarcha, number> = { caminar: 2.3, correr: 5.2, bici: 8.5 };
const OJO = 1.62, RADIO = 0.36;

export class Motor {
  private renderer: THREE.WebGLRenderer;
  private escena = new THREE.Scene();
  private camara: THREE.PerspectiveCamera;
  private comunes = crearComunes();
  private detalle: THREE.Texture;
  private mats: { suelo: THREE.ShaderMaterial; edif: THREE.ShaderMaterial; sombra: THREE.ShaderMaterial; objeto: THREE.ShaderMaterial };
  private cieloMesh: THREE.Mesh;
  private disco: THREE.Mesh;
  private matCieloM: THREE.ShaderMaterial;
  private cen = { value: new THREE.Color() };
  private hor = { value: new THREE.Color() };
  private proc: Procesador;
  mundo: Mundo;
  private trafico: Trafico;
  private entrada: Entrada;
  private o: ReturnType<typeof crearOrigen>;
  private nivel: number;
  private fijo: boolean;
  private calidadUni = { value: 1 };

  /* Caminante */
  x = 0;
  z = 0;
  yaw = 0;
  pitch = 0;
  modo: ModoMarcha = "caminar";
  private vx = 0;
  private vz = 0;
  private fase = 0;
  private balanceo = 0;
  private destino: { x: number; z: number; t: number; px: number; pz: number } | null = null;
  private marca: THREE.Mesh;
  private ubicado = false;

  private inter: Interior | null = null;
  private localInt: Local | null = null;
  private tarjeta: Local | null = null;
  private cercaActual: Local | null = null;
  private cerrado = new Set<string>();
  private enTransicion = false;

  private raf = 0;
  private vivo = true;
  private pausa = false;
  private t0 = performance.now();
  private tAnt = performance.now();
  private tCielo = -999;
  private tCalle = 0;
  private tCerca = 0;
  private calleAct: string | null | undefined = undefined;
  private rumboAnt = -999;
  private listo = false;

  /* Medición de cuadros */
  private fCuenta = 0;
  private fIni = performance.now();
  private bajas = 0;
  private buenas = 0;
  fps = 0;

  constructor(private cont: HTMLElement, private op: OpcionesMotor) {
    this.o = crearOrigen(op.lat, op.lon);
    this.fijo = op.calidadFija != null;
    const nav = navigator as Navigator & { deviceMemory?: number };
    const modesto = (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 3;
    this.nivel = op.calidadFija ?? (modesto ? 2 : 3);

    this.renderer = new THREE.WebGLRenderer({ antialias: this.nivel >= 2, stencil: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.calidad().dpr));
    this.renderer.domElement.className = "calle-canvas";
    this.renderer.domElement.setAttribute("aria-label", "Vista en primera persona de la calle");
    cont.appendChild(this.renderer.domElement);

    this.camara = new THREE.PerspectiveCamera(68, 1, 0.25, 520);
    this.camara.rotation.order = "YXZ";

    this.detalle = texturaDetalle();
    this.mats = {
      suelo: matSuelo(this.comunes, this.detalle, this.o.m / 10),
      edif: matEdificio(this.comunes, this.calidadUni),
      sombra: matSombra(this.comunes),
      objeto: matObjeto(this.comunes),
    };

    this.matCieloM = matCielo(this.comunes, this.cen, this.hor);
    this.cieloMesh = new THREE.Mesh(new THREE.SphereGeometry(10, 16, 10), this.matCieloM);
    this.cieloMesh.renderOrder = -30;
    this.cieloMesh.frustumCulled = false;
    this.escena.add(this.cieloMesh);
    const dg = new THREE.CircleGeometry(600, 24);
    dg.rotateX(-Math.PI / 2);
    this.disco = new THREE.Mesh(dg, matDisco(this.comunes));
    this.disco.renderOrder = -25;
    this.disco.frustumCulled = false;
    this.escena.add(this.disco);

    const mg = new THREE.RingGeometry(0.42, 0.62, 28);
    mg.rotateX(-Math.PI / 2);
    this.marca = new THREE.Mesh(mg, new THREE.MeshBasicMaterial({ color: 0x4fb0ff, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
    this.marca.visible = false;
    this.marca.position.y = 0.05;
    this.escena.add(this.marca);

    this.proc = crearProcesador(op.crearWorker, (r) => {
      if (!this.vivo) return;
      if (r.t === "caido") this.mundo.reiniciarPendientes();
      else this.mundo.alRecibir(r);
    });
    this.mundo = new Mundo(this.escena, this.o, { ...this.mats, comunes: this.comunes }, () => this.proc, op.proveedorTiles, () => this.calidad(), {
      progreso: (f) => op.eventos.progreso(f),
      fallo: (m) => { if (!this.listo) op.eventos.fallo(m); },
      aviso: (m) => op.eventos.aviso(m),
    });
    this.trafico = new Trafico(this.escena, this.mats.objeto);

    this.entrada = new Entrada(this.renderer.domElement, {
      mirar: (dx, dy) => {
        this.yaw -= dx * 0.0042;
        this.pitch = Math.max(-1.3, Math.min(1.2, this.pitch - dy * 0.0036));
      },
      tocar: (x, y) => this.toque(x, y),
      dobleToque: (x, y) => this.dobleToque(x, y),
      joystick: (a, x, y, dx, dy) => op.eventos.joystick(a, x, y, dx, dy),
      alMover: () => { this.destino = null; this.marca.visible = false; },
    });

    this.ajustar();
    window.addEventListener("resize", this.ajustar);
    document.addEventListener("visibilitychange", this.visibilidad);
    this.renderer.domElement.addEventListener("webglcontextlost", this.contextoPerdido);
    this.ponerCielo();
    this.raf = requestAnimationFrame(this.cuadro);
  }

  private calidad(): Calidad {
    return { ...NIVELES[this.nivel], nivel: this.nivel };
  }

  private ajustar = () => {
    const w = this.cont.clientWidth || window.innerWidth, h = this.cont.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camara.aspect = w / h;
    this.camara.fov = w < h ? 74 : 62;
    this.camara.updateProjectionMatrix();
  };

  private visibilidad = () => {
    this.pausa = document.hidden;
    if (!this.pausa && this.vivo) { this.tAnt = performance.now(); this.fIni = this.tAnt; this.fCuenta = 0; cancelAnimationFrame(this.raf); this.raf = requestAnimationFrame(this.cuadro); }
  };

  private contextoPerdido = (e: Event) => {
    e.preventDefault();
    this.op.eventos.fallo("Se perdió el 3D en este celular. Probá entrar de nuevo.");
  };

  private ponerCielo() {
    const e = cieloEn(fechaEnHora(this.op.hora), this.op.lat, this.op.lon);
    aplicarCielo(this.comunes, e);
    this.cen.value.setRGB(e.cenit[0], e.cenit[1], e.cenit[2], THREE.LinearSRGBColorSpace);
    this.hor.value.copy(this.comunes.uNiebla.value);
    const s = this.mats.sombra.uniforms;
    const y = Math.max(e.sol[1], 0.24);
    s.uProy.value.set(-e.sol[0] / y, -e.sol[2] / y);
    s.uFuerza.value = 0.34 * Math.max(0, Math.min(1, e.elevacion / 7));
    this.sombrasActivas = e.elevacion > 1;
  }
  private sombrasActivas = true;

  setHora(h: number | null) { this.op.hora = h; this.ponerCielo(); }

  setModo(m: ModoMarcha) { this.modo = m; }

  /* ───────── Toques ───────── */
  private rayo(px: number, py: number) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector3((px / r.width) * 2 - 1, -(py / r.height) * 2 + 1, 0.5).unproject(this.camara);
    return v.sub(this.camara.position).normalize();
  }

  private toque(px: number, py: number) {
    const d = this.rayo(px, py), o = this.camara.position;
    if (this.inter) return;
    let mejor: Local | null = null, mt = 40;
    for (const l of this.mundo.localesCerca(this.x, this.z, 42)) {
      const den = d.x * l.nx + d.z * l.nz;
      if (den > -0.05) continue;
      const t = ((l.x - o.x) * l.nx + (l.z - o.z) * l.nz) / den;
      if (t < 0 || t > mt) continue;
      const hx = o.x + d.x * t - l.x, hz = o.z + d.z * t - l.z, y = o.y + d.y * t, a = hx * l.nz - hz * l.nx;
      if (Math.abs(a) < l.ancho / 2 + 0.3 && y >= 0 && y < 3.9) { mt = t; mejor = l; }
    }
    if (mejor) this.abrir(mejor);
  }

  private dobleToque(px: number, py: number) {
    if (this.inter) return;
    const d = this.rayo(px, py), o = this.camara.position;
    if (d.y > -0.02) return;
    const t = -o.y / d.y;
    if (t > 90) return;
    const x = o.x + d.x * t, z = o.z + d.z * t;
    this.irHacia(x, z);
  }

  irHacia(x: number, z: number) {
    this.destino = { x, z, t: 0, px: this.x, pz: this.z };
    this.marca.position.set(x, 0.05, z);
    this.marca.visible = true;
  }

  abrir(l: Local) { this.tarjeta = l; this.op.eventos.local(l); }
  cerrarTarjeta() { if (this.tarjeta) this.cerrado.add(this.tarjeta.id); this.tarjeta = null; this.op.eventos.local(null); }

  /* ───────── Interior ───────── */
  entrar(l: Local) {
    if (this.enTransicion || this.inter) return;
    this.enTransicion = true;
    this.op.eventos.fundido(true);
    setTimeout(() => {
      if (!this.vivo) return;
      this.inter = crearInterior(l);
      this.localInt = l;
      this.x = this.inter.entrada.x; this.z = this.inter.entrada.z; this.yaw = 0; this.pitch = 0;
      this.vx = this.vz = 0;
      this.destino = null; this.marca.visible = false;
      this.tarjeta = null;
      this.op.eventos.local(null);
      this.op.eventos.cerca(null);
      this.op.eventos.interior(l);
      this.op.eventos.fundido(false);
      this.enTransicion = false;
    }, this.op.reducirMovimiento ? 60 : 280);
  }

  salir() {
    const l = this.localInt;
    if (this.enTransicion || !this.inter || !l) return;
    this.enTransicion = true;
    this.op.eventos.fundido(true);
    setTimeout(() => {
      if (!this.vivo) return;
      this.inter?.destruir();
      this.inter = null;
      this.localInt = null;
      this.x = l.x + l.nx * 2.2;
      this.z = l.z + l.nz * 2.2;
      this.yaw = Math.atan2(-l.nx, -l.nz) ;
      this.pitch = 0;
      this.cerrado.add(l.id);
      this.cercaActual = null;
      this.op.eventos.interior(null);
      this.op.eventos.fundido(false);
      this.enTransicion = false;
    }, this.op.reducirMovimiento ? 60 : 280);
  }

  /* ───────── Bucle ───────── */
  private mover(dt: number) {
    const en = this.entrada, sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let ix = en.x, iy = en.y;
    if (this.destino) {
      const d = this.destino, dx = d.x - this.x, dz = d.z - this.z, L = Math.hypot(dx, dz);
      d.t += dt;
      if (L < 0.5) { this.destino = null; this.marca.visible = false; }
      else {
        if (d.t > 0.8) {
          if (Math.hypot(this.x - d.px, this.z - d.pz) < 0.25) { this.destino = null; this.marca.visible = false; }
          d.t = 0; d.px = this.x; d.pz = this.z;
        }
        const f = Math.min(1, L / 1.5);
        ix = ((dx / L) * cy - (dz / L) * sy) * f;
        iy = ((dz / L) * cy + (dx / L) * sy) * f;
      }
    }
    const vel = VEL[en.correr && this.modo === "caminar" ? "correr" : this.modo];
    const tx = (ix * cy + iy * sy) * vel, tz = (iy * cy - ix * sy) * vel;
    const k = 1 - Math.exp(-dt * (this.modo === "bici" ? 4 : 9));
    this.vx += (tx - this.vx) * k;
    this.vz += (tz - this.vz) * k;
    const v = Math.hypot(this.vx, this.vz);
    if (v > 0.02) {
      const pasos = Math.max(1, Math.ceil((v * dt) / 0.2));
      for (let i = 0; i < pasos; i++) {
        this.x += (this.vx * dt) / pasos;
        this.z += (this.vz * dt) / pasos;
        if (this.inter) this.chocarInterior();
        else {
          const [a, b] = this.mundo.chocar(this.x, this.z, RADIO);
          this.x = a; this.z = b;
        }
      }
    }
    const mov = Math.min(1, v / 2.2);
    const q = this.modo === "bici" ? 0.25 : 1;
    this.fase += v * dt * 1.9;
    this.balanceo += (mov - this.balanceo) * Math.min(1, dt * 8);
    const r = this.op.reducirMovimiento ? 0 : this.balanceo * q;
    this.camara.position.set(this.x, (this.modo === "bici" ? 1.74 : OJO) + Math.sin(this.fase * 2) * 0.032 * r, this.z);
    this.camara.rotation.set(this.pitch + Math.sin(this.fase * 2) * 0.0035 * r, this.yaw, Math.sin(this.fase) * 0.0045 * r);
  }

  private chocarInterior() {
    const I = this.inter!, w = I.ancho / 2 - RADIO, d = I.fondo / 2 - RADIO;
    this.x = Math.max(-w, Math.min(w, this.x));
    this.z = Math.max(-d, Math.min(d, this.z));
    for (const c of I.obstaculos) {
      const x0 = c.x0 - RADIO, x1 = c.x1 + RADIO, z0 = c.z0 - RADIO, z1 = c.z1 + RADIO;
      if (this.x > x0 && this.x < x1 && this.z > z0 && this.z < z1) {
        const a = this.x - x0, b = x1 - this.x, e = this.z - z0, f = z1 - this.z, m = Math.min(a, b, e, f);
        if (m === a) this.x = x0; else if (m === b) this.x = x1; else if (m === e) this.z = z0; else this.z = z1;
      }
    }
  }

  private cerca(t: number) {
    if (t - this.tCerca < 0.25) return;
    this.tCerca = t;
    let mejor: Local | null = null, md = 7.5;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    for (const l of this.mundo.localesCerca(this.x, this.z, 8)) {
      const dx = l.x - this.x, dz = l.z - this.z, d = Math.hypot(dx, dz);
      if (d < md && (d < 3 || (dx * fx + dz * fz) / d > -0.1)) { md = d; mejor = l; }
    }
    if (mejor && this.cerrado.has(mejor.id)) mejor = null;
    for (const id of [...this.cerrado]) {
      const l = this.mundo.localesCerca(this.x, this.z, 12).find((q) => q.id === id);
      if (!l) this.cerrado.delete(id);
    }
    if (mejor !== this.cercaActual) { this.cercaActual = mejor; this.op.eventos.cerca(mejor); }
  }

  private medir(ahora: number) {
    this.fCuenta++;
    const dur = ahora - this.fIni;
    if (dur < 2000) return;
    this.fps = (this.fCuenta * 1000) / dur;
    this.fCuenta = 0;
    this.fIni = ahora;
    if (this.fijo || !this.listo) return;
    if (this.fps < 26) { this.bajas++; this.buenas = 0; }
    else if (this.fps > 52) { this.buenas++; this.bajas = 0; }
    else { this.bajas = 0; this.buenas = 0; }
    if (this.bajas >= 2 && this.nivel > 0) { this.nivel--; this.bajas = 0; this.aplicarNivel(); }
    else if (this.buenas >= 8 && this.nivel < NIVELES.length - 1 && this.nivel < 3) { this.nivel++; this.buenas = 0; this.aplicarNivel(); }
  }

  private aplicarNivel() {
    const q = this.calidad();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.dpr));
    this.ajustar();
    this.nieblaPara(q);
  }

  private nieblaPara(q: Calidad) {
    this.comunes.uNieblaD.value.set(q.radio * 0.2, 2 / (q.radio * 0.8));
  }

  private cuadro = (ahora: number) => {
    if (!this.vivo || this.pausa) return;
    this.raf = requestAnimationFrame(this.cuadro);
    const dt = Math.min(0.1, (ahora - this.tAnt) / 1000);
    this.tAnt = ahora;
    const t = (ahora - this.t0) / 1000;
    this.comunes.uTiempo.value = t;
    this.medir(ahora);

    if (this.inter) {
      this.mover(dt);
      this.rumbo();
      this.renderer.render(this.inter.escena, this.camara);
      return;
    }

    this.mundo.actualizar(this.x, this.z, t);
    if (!this.ubicado && this.mundo.inicial && this.mundo.celdas.size) {
      /* Espera las celdas de alrededor para arrancar en la vereda y no adentro de un edificio */
      const pendiente = [...this.mundo.inicial].some((k) => !this.mundo.celdas.has(k)) && t < 25 && this.mundo.fallos === 0;
      if (!pendiente) {
        const a = this.mundo.puntoDeArranque(this.x, this.z);
        if (a) { this.x = a.x; this.z = a.z; this.yaw = a.yaw; }
        this.ubicado = true;
        this.listo = true;
        this.nieblaPara(this.calidad());
        this.op.eventos.progreso(1);
        this.op.eventos.listo();
      }
    }
    this.mover(dt);
    this.cieloMesh.position.copy(this.camara.position);
    this.disco.position.set(this.x, 0, this.z);
    const q = this.calidad();
    this.trafico.actualizar(dt, this.x, this.z, this.mundo, q);
    this.cerca(t);
    this.rumbo();
    if (t - this.tCalle > 0.4) {
      this.tCalle = t;
      const c = this.mundo.calleEn(this.x, this.z)?.nombre ?? null;
      if (c !== this.calleAct) { this.calleAct = c; this.op.eventos.calle(c); }
    }
    if (t - this.tCielo > 30) { this.tCielo = t; this.ponerCielo(); }
    this.mats.sombra.visible = this.sombrasActivas && q.rSombra > 0;
    this.marca.scale.setScalar(1 + Math.sin(t * 5) * 0.1);
    this.renderer.render(this.escena, this.camara);
  };

  private rumbo() {
    const g = ((-this.yaw * 180) / Math.PI + 360) % 360;
    if (Math.abs(g - this.rumboAnt) > 0.5) { this.rumboAnt = g; this.op.eventos.rumbo(g); }
  }

  /** Coordenadas reales de donde está parado, para volver al mapa en el mismo lugar. */
  posicionReal() {
    if (this.localInt) return lonLatDeMundo(this.o, this.localInt.x, this.localInt.z);
    return lonLatDeMundo(this.o, this.x, this.z);
  }

  /** Para pruebas: lleva al caminante a un punto del mundo real. */
  irA(lat: number, lon: number, yaw = 0) {
    const p = mundoDeLonLat(this.o, lon, lat);
    this.x = p.x; this.z = p.z; this.yaw = yaw;
  }

  depuracion() {
    return {
      x: this.x, z: this.z, yaw: this.yaw, pitch: this.pitch, fps: this.fps, nivel: this.nivel, interior: !!this.inter,
      r: { llamadas: this.renderer.info.render.calls, tris: this.renderer.info.render.triangles, geos: this.renderer.info.memory.geometries, texs: this.renderer.info.memory.textures },
      mundo: this.mundo.info(),
    };
  }

  destruir() {
    this.vivo = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.ajustar);
    document.removeEventListener("visibilitychange", this.visibilidad);
    this.renderer.domElement.removeEventListener("webglcontextlost", this.contextoPerdido);
    this.entrada.destruir();
    this.proc.destruir();
    this.mundo.destruir();
    this.trafico.destruir();
    this.inter?.destruir();
    this.detalle.dispose();
    Object.values(this.mats).forEach((m) => m.dispose());
    this.matCieloM.dispose();
    this.cieloMesh.geometry.dispose();
    this.disco.geometry.dispose();
    (this.disco.material as THREE.Material).dispose();
    this.marca.geometry.dispose();
    (this.marca.material as THREE.Material).dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}

export function hayWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch { return false; }
}
