/* El corazón del modo calle: escena, bucle, caminante, cielo, locales e interiores.
   La interfaz vive en CalleVista; acá solo hay eventos y unos pocos métodos. */
import * as THREE from "three";
import { cieloEn, fechaEnHora } from "./cielo";
import { Entrada } from "./entrada";
import { DIV, celdaDeMundo, crearOrigen, lonLatDeMundo, mundoDeLonLat } from "./geo";
import { CartelesFlotantes, crearAzotea, GuiaRuta } from "./guia";
import { crearInterior, crearPasillo, type Interior } from "./interior";
import { aplicarCielo, crearComunes, matCielo, matDisco, matEdificio, matObjeto, matSombra, matSuelo, texturaDetalle } from "./materiales";
import { Mundo, type Calidad } from "./mundo";
import { crearProcesador, type Procesador } from "./procesador";
import { dentroPoligono } from "./ruta";
import { Trafico } from "./trafico";
import type { Local, ProveedorTiles } from "./tipos";

export type ModoMarcha = "caminar" | "correr" | "bici" | "auto" | "volar";

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
const VEL: Record<ModoMarcha, number> = { caminar: 2.3, correr: 5.2, bici: 8.5, auto: 15, volar: 28 };
const OJO = 1.62, RADIO = 0.36;

/* ───────── Tipos de la sección Viaje ───────── */
export interface EstadoViaje { activo: boolean; pausada: boolean; nombre: string | null; restante: number; segundos: number; maniobra: string | null; enM: number; volando: boolean; altura: number; enAire: boolean }
export interface EventosMotor {
  viaje?(e: EstadoViaje): void;
  llegada?(nombre: string): void;
  nube?(activa: boolean): void;
  azotea?(altura: number | null): void;
  piso?(n: number): void;
  edificio?(desde: { lat: number; lon: number }, hasta: { lat: number; lon: number }): void;
  cartel?(indice: number): void;
}
interface Seguidor { pts: Float32Array; acum: Float32Array; total: number; s: number; v: number; pausada: boolean; nombre: string; maniobras: { s: number; texto: string }[]; yawAuto: number; tLibre: number }
interface Vuelo { fase: "subir" | "cruzar" | "esperar" | "bajar" | "fundir"; t: number; x0: number; z0: number; y0: number; x1: number; z1: number; alto: number; cruce: number; yaw0: number; pitch0: number; yaw1: number; xL: number; zL: number; yawL: number; alLlegar?: () => void }
interface Azotea { y: number; anillo: number[] | null; cx: number; cz: number; radio: number; obra: ReturnType<typeof crearAzotea>; volver: Local | null }

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
  private sombrasActivas = true;

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
      suelo: matSuelo(this.comunes, this.detalle, this.o.m / DIV),
      edif: matEdificio(this.comunes, this.calidadUni),
      sombra: matSombra(this.comunes),
      objeto: matObjeto(this.comunes),
    };

    this.matCieloM = matCielo(this.comunes, this.cen, this.hor);
    this.cieloMesh = new THREE.Mesh(new THREE.SphereGeometry(10, 16, 10), this.matCieloM);
    this.cieloMesh.renderOrder = 50; // al final: solo pinta lo que quedó libre
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
      alMover: () => { this.destino = null; this.marca.visible = false; this.tomarControl(); },
      rueda: (d) => this.ruedaDron(d),
    });

    this.calidadUni.value = this.calidad().ventanas;
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
    if (this.tocarCartel(px, py)) return;
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
    else this.tocarEdificio(px, py);
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
      this.x = this.inter.entrada.x; this.z = this.inter.entrada.z; this.yaw = 0; this.pitch = -0.1;
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
    if (this.tarjeta && Math.hypot(this.tarjeta.x - this.x, this.tarjeta.z - this.z) > 45) this.cerrarTarjeta();
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
    else if (this.buenas >= 8 && this.nivel < NIVELES.length - 1) { this.nivel++; this.buenas = 0; this.aplicarNivel(); }
  }

  private aplicarNivel() {
    const q = this.calidad();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.dpr));
    this.ajustar();
    this.nieblaPara(q);
    this.calidadUni.value = q.ventanas;
  }

  private nieblaPara(q: Calidad) {
    this.comunes.uNieblaD.value.set(q.radio * 0.2, 2 / (q.radio * 0.8));
  }

  private cuadro = (ahora: number) => {
    if (!this.vivo || this.pausa) return;
    this.raf = requestAnimationFrame(this.cuadro);
    const dt = Math.min(0.2, (ahora - this.tAnt) / 1000);
    this.tAnt = ahora;
    const t = (ahora - this.t0) / 1000;
    this.comunes.uTiempo.value = t;
    this.medir(ahora);

    if (this.inter) {
      this.mover(dt);
      this.vigilarInterior(t);
      this.rumbo();
      this.renderer.render(this.inter.escena, this.camara);
      return;
    }

    const carga = this.puntoDeCarga();
    this.mundo.actualizar(carga.x, carga.z, t);
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
    if (!this.pasoViaje(dt, t)) this.mover(dt);
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

  /* ═════════════════ SECCIÓN VIAJE ═════════════════
     Todo lo de moverse por la ciudad: rutas, vuelo, dron, auto, pisos y terraza.
     Vive acá junto para no pisar el render. El resto de la clase la toca solo por:
     pasoViaje, puntoDeCarga, vigilarInterior, tomarControl, tocarEdificio, ruedaDron y destruirViaje. */
  private seg: Seguidor | null = null;
  private guia: GuiaRuta | null = null;
  private vuelo: Vuelo | null = null;
  private azotea: Azotea | null = null;
  private altDron = 70;
  private altActual = OJO;
  private pasoAnt = { x: NaN, z: NaN };
  private metros = { pie: 0, corre: 0, bici: 0 };
  private tViaje = 0;
  private tEmpuje = 0;
  private tInterior = -1;
  private pisoAct = 0;
  private nieblaAlta = false;
  private carteles: CartelesFlotantes | null = null;

  /** Carteles flotantes de un filtro. Con null los saca. */
  ponerCarteles(lista: { lat: number; lon: number; texto: string; sub: string }[] | null) {
    this.carteles?.destruir();
    this.carteles = lista?.length ? new CartelesFlotantes(this.escena, lista.map((l) => ({ ...mundoDeLonLat(this.o, l.lon, l.lat), texto: l.texto, sub: l.sub }))) : null;
  }

  private tocarCartel(px: number, py: number) {
    if (!this.carteles) return false;
    const r = this.renderer.domElement.getBoundingClientRect(), i = this.carteles.tocado(px, py, r.width, r.height, this.camara);
    if (i < 0) return false;
    this.op.eventos.cartel?.(i);
    return true;
  }

  /** Mira hacia un rumbo en grados: para abrir una vista compartida. */
  setRumbo(g: number) { this.yaw = (-g * Math.PI) / 180; }

  /** Cambia la forma de moverse. Al dejar de volar baja solo y aterriza en la vereda. */
  cambiarModo(m: ModoMarcha) {
    const antes = this.modo;
    this.modo = m;
    if (this.inter || this.azotea) return;
    if (m === "volar") this.tomarControl();
    else if (antes === "volar") this.iniciarBajada();
    this.op.eventos.viaje?.(this.estadoViaje());
  }

  setAlturaDron(metros: number) { this.altDron = Math.max(12, Math.min(180, metros)); this.op.eventos.viaje?.(this.estadoViaje()); }
  private ruedaDron(d: number) { if (this.modo === "volar") this.setAlturaDron(this.altDron - d * 0.06); }

  /** Empieza a seguir una ruta. `pts`: lat, lon intercalados. */
  iniciarRuta(r: { pts: ArrayLike<number>; largo: number; maniobras: { s: number; texto: string }[] }, nombre: string) {
    this.cancelarRuta(true);
    if (this.modo === "volar") { this.modo = "caminar"; this.iniciarBajada(); }
    const n = r.pts.length / 2, pts = new Float32Array(n * 2), acum = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const p = mundoDeLonLat(this.o, r.pts[2 * i + 1], r.pts[2 * i]);
      pts[2 * i] = p.x; pts[2 * i + 1] = p.z;
    }
    /* Arranca de donde estás parado, no de donde se calculó */
    pts[0] = this.x; pts[1] = this.z;
    for (let i = 1; i < n; i++) acum[i] = acum[i - 1] + Math.hypot(pts[2 * i] - pts[2 * i - 2], pts[2 * i + 1] - pts[2 * i - 1]);
    const escala = acum[n - 1] / Math.max(1, r.largo);
    this.seg = { pts, acum, total: acum[n - 1], s: 0, v: 0, pausada: false, nombre, maniobras: r.maniobras.map((m) => ({ s: m.s * escala, texto: m.texto })), yawAuto: this.yaw, tLibre: 0 };
    this.guia = new GuiaRuta(this.escena, pts, acum);
    this.op.eventos.viaje?.(this.estadoViaje());
  }

  pausarRuta(p: boolean) {
    if (!this.seg) return;
    this.seg.pausada = p;
    this.seg.v = 0;
    this.seg.yawAuto = this.yaw;
    this.op.eventos.viaje?.(this.estadoViaje());
  }

  cancelarRuta(silencio = false) {
    this.seg = null;
    this.guia?.destruir();
    this.guia = null;
    if (!silencio) this.op.eventos.viaje?.(this.estadoViaje());
  }

  /** El joystick retoma el control: la ruta queda en pausa. */
  private tomarControl() {
    if (this.seg && !this.seg.pausada) this.pausarRuta(true);
  }

  /** "Ir ya": sube, cruza y baja. Con movimiento reducido es un fundido. */
  volarA(lat: number, lon: number, alLlegar?: () => void) {
    if (this.vuelo) return;
    this.cancelarRuta(true);
    const p = mundoDeLonLat(this.o, lon, lat), dist = Math.hypot(p.x - this.x, p.z - this.z);
    this.vuelo = {
      fase: this.op.reducirMovimiento ? "fundir" : "subir", t: 0, x0: this.x, z0: this.z, y0: this.camara.position.y, x1: p.x, z1: p.z, alto: Math.max(90, Math.min(240, 80 + dist * 0.035)),
      cruce: Math.max(1.5, Math.min(4.2, 1.2 + dist / 1800)), yaw0: this.yaw, pitch0: this.pitch, yaw1: dist > 1 ? Math.atan2(-(p.x - this.x), -(p.z - this.z)) : this.yaw, xL: p.x, zL: p.z, yawL: this.yaw, alLlegar,
    };
    if (this.modo === "volar" || this.modo === "auto") this.modo = "caminar";
    this.op.eventos.viaje?.(this.estadoViaje());
  }

  private iniciarBajada() {
    const a = this.mundo.puntoDeArranque(this.x, this.z);
    this.vuelo = { fase: "bajar", t: 0, x0: this.x, z0: this.z, y0: this.altActual, x1: this.x, z1: this.z, alto: this.altActual, cruce: 0, yaw0: this.yaw, pitch0: this.pitch, yaw1: this.yaw, xL: a?.x ?? this.x, zL: a?.z ?? this.z, yawL: this.yaw };
  }

  /** Dónde tiene que cargar el mundo: durante un vuelo, en el destino y no en el camino. */
  private puntoDeCarga() {
    const v = this.vuelo;
    if (v && (v.fase === "esperar" || v.fase === "fundir" || (v.fase === "cruzar" && v.t > v.cruce * 0.35))) return { x: v.x1, z: v.z1 };
    return { x: this.x, z: this.z };
  }

  private zonaLista(x: number, z: number) {
    const { gx, gy } = celdaDeMundo(this.o, x, z);
    return this.mundo.celdas.has(`${gx}/${gy}`);
  }

  private pasoVuelo(dt: number) {
    const v = this.vuelo!, suave = (f: number) => f * f * (3 - 2 * f);
    const angulo = (a: number, b: number, f: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * f;
    v.t += dt;
    let y = this.camara.position.y;
    if (v.fase === "fundir") {
      if (v.t < 0.3) { this.op.eventos.fundido(true); this.fijarCamara(y); return; }
      this.x = v.x1; this.z = v.z1;
      if (this.zonaLista(v.x1, v.z1) || v.t > 6) {
        this.prepararAterrizaje(v);
        this.x = v.xL; this.z = v.zL; this.yaw = v.yawL; this.pitch = 0;
        this.terminarVuelo(v);
        this.op.eventos.fundido(false);
      }
      this.fijarCamara(OJO);
      return;
    }
    if (v.fase === "subir") {
      const f = suave(Math.min(1, v.t));
      y = v.y0 + (v.alto - v.y0) * f;
      this.pitch = v.pitch0 + (-0.62 - v.pitch0) * f;
      this.yaw = angulo(v.yaw0, v.yaw1, f);
      if (v.t >= 1) { v.fase = "cruzar"; v.t = 0; }
    } else if (v.fase === "cruzar") {
      const f = suave(suave(Math.min(1, v.t / v.cruce)));
      this.x = v.x0 + (v.x1 - v.x0) * f; this.z = v.z0 + (v.z1 - v.z0) * f;
      y = v.alto;
      /* Pasa entre nubes: el barrio de abajo todavía no está */
      this.op.eventos.nube?.(v.cruce > 1.6 && f > 0.12 && f < 0.97);
      if (v.t >= v.cruce) { v.fase = "esperar"; v.t = 0; }
    } else if (v.fase === "esperar") {
      y = v.alto;
      if (this.zonaLista(v.x1, v.z1) || v.t > 5) {
        this.op.eventos.nube?.(false);
        this.prepararAterrizaje(v);
        v.fase = "bajar"; v.t = 0; v.x0 = this.x; v.z0 = this.z; v.y0 = y;
      }
    } else {
      const f = suave(Math.min(1, v.t / 1.25));
      y = v.y0 + (OJO - v.y0) * f;
      this.x = v.x0 + (v.xL - v.x0) * f; this.z = v.z0 + (v.zL - v.z0) * f;
      this.pitch += (0 - this.pitch) * Math.min(1, dt * 4);
      this.yaw = angulo(this.yaw, v.yawL, Math.min(1, dt * 3));
      if (v.t >= 1.25) this.terminarVuelo(v);
    }
    this.fijarCamara(y);
  }

  private terminarVuelo(v: Vuelo) {
    this.vuelo = null;
    this.altActual = OJO;
    this.vx = this.vz = 0;
    this.pasoAnt = { x: NaN, z: NaN };
    this.op.eventos.viaje?.(this.estadoViaje());
    v.alLlegar?.();
  }

  private prepararAterrizaje(v: Vuelo) {
    const a = this.mundo.puntoDeArranque(v.x1, v.z1);
    v.xL = a?.x ?? v.x1; v.zL = a?.z ?? v.z1; v.yawL = a?.yaw ?? this.yaw;
  }

  private fijarCamara(y: number) {
    this.altActual = y;
    this.camara.position.set(this.x, y, this.z);
    this.camara.rotation.set(this.pitch, this.yaw, 0);
    /* Desde arriba la niebla de la calle taparía todo */
    if (y > 8) {
      const r = this.calidad().radio;
      this.comunes.uNieblaD.value.set(r * 0.2 + y * 1.3, 2 / (r * 0.8 + y * 1.6));
      this.nieblaAlta = true;
    } else if (this.nieblaAlta) { this.nieblaAlta = false; this.nieblaPara(this.calidad()); }
  }

  private camaraPaso(v: number, dt: number, ojo: number, q: number) {
    const mov = Math.min(1, v / 2.2);
    this.fase += v * dt * 1.9;
    this.balanceo += (mov - this.balanceo) * Math.min(1, dt * 8);
    const r = this.op.reducirMovimiento ? 0 : this.balanceo * q;
    this.camara.position.set(this.x, ojo + Math.sin(this.fase * 2) * 0.032 * r, this.z);
    this.camara.rotation.set(this.pitch + Math.sin(this.fase * 2) * 0.0035 * r, this.yaw, Math.sin(this.fase) * 0.0045 * r);
    this.altActual = ojo;
    if (this.nieblaAlta) { this.nieblaAlta = false; this.nieblaPara(this.calidad()); }
  }

  private puntoRuta(r: Seguidor, s: number) {
    const a = r.acum;
    let lo = 0, hi = a.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (a[m] <= s) lo = m; else hi = m; }
    const L = a[hi] - a[lo] || 1, f = Math.max(0, Math.min(1, (s - a[lo]) / L));
    return { x: r.pts[2 * lo] + (r.pts[2 * hi] - r.pts[2 * lo]) * f, z: r.pts[2 * lo + 1] + (r.pts[2 * hi + 1] - r.pts[2 * lo + 1]) * f };
  }

  private velRuta() {
    return VEL[this.modo === "volar" ? "caminar" : this.entrada.correr && this.modo === "caminar" ? "correr" : this.modo];
  }

  private pasoRuta(dt: number, t: number) {
    const r = this.seg!, vel = this.velRuta();
    /* Frena antes de doblar, sobre todo en bici y en auto */
    const mira = Math.max(5, r.v * 1.3), a = this.puntoRuta(r, r.s), b = this.puntoRuta(r, Math.min(r.total, r.s + mira)), c = this.puntoRuta(r, Math.min(r.total, r.s + mira * 2));
    const g1 = Math.atan2(b.x - a.x, b.z - a.z), g2 = Math.atan2(c.x - b.x, c.z - b.z), giro = Math.abs(Math.atan2(Math.sin(g2 - g1), Math.cos(g2 - g1)));
    const obj = Math.max(1.6, vel * (giro > 0.5 ? 0.55 : 1)) * Math.min(1, (r.total - r.s) / 4 + 0.25);
    r.v += (obj - r.v) * (1 - Math.exp(-dt * (vel > 6 ? 2.4 : 5)));
    r.s = Math.min(r.total, r.s + r.v * dt);
    const p = this.puntoRuta(r, r.s);
    /* Si el mundo tiene una pared que la ruta no conocía, se desliza sin frenar el viaje */
    const [cx, cz] = this.mundo.chocar(p.x, p.z, RADIO);
    this.x = cx; this.z = cz;
    /* Si mirás para otro lado no te corrige la vista por un rato */
    if (Math.abs(this.yaw - r.yawAuto) > 1e-5) r.tLibre = t + 2.5;
    if (t > r.tLibre) {
      const des = Math.atan2(-(b.x - a.x), -(b.z - a.z)), k = 1 - Math.exp(-dt * (this.op.reducirMovimiento ? 8 : 3.4));
      this.yaw += Math.atan2(Math.sin(des - this.yaw), Math.cos(des - this.yaw)) * k;
      this.pitch += (-0.03 - this.pitch) * Math.min(1, dt * 2);
    }
    r.yawAuto = this.yaw;
    const auto = this.modo === "auto";
    this.camaraPaso(r.v, dt, auto ? 1.32 : this.modo === "bici" ? 1.74 : OJO, auto ? 0 : this.modo === "bici" ? 0.25 : 1);
    if (r.s >= r.total - 0.2) {
      const nombre = r.nombre;
      this.cancelarRuta();
      this.op.eventos.llegada?.(nombre);
    }
  }

  private pasoDron(dt: number) {
    const en = this.entrada, sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    this.altDron = Math.max(12, Math.min(180, this.altDron + en.subir * 26 * dt));
    const vel = Math.min(52, VEL.volar + this.altDron * 0.12), tx = (en.x * cy + en.y * sy) * vel, tz = (en.y * cy - en.x * sy) * vel;
    const k = 1 - Math.exp(-dt * 2.2);
    this.vx += (tx - this.vx) * k;
    this.vz += (tz - this.vz) * k;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    const y = this.altActual + (this.altDron - this.altActual) * (1 - Math.exp(-dt * 1.8));
    if (this.altActual < 6 && this.pitch > -0.3) this.pitch += (-0.42 - this.pitch) * Math.min(1, dt * 1.6);
    this.fijarCamara(y);
  }

  private pasoAuto(dt: number) {
    const en = this.entrada, ac = -en.y;
    const v0 = Math.hypot(this.vx, this.vz), sentido = this.vx * -Math.sin(this.yaw) + this.vz * -Math.cos(this.yaw) >= 0 ? 1 : -1, ant = v0 * sentido;
    const v = ant + (ac * (ac >= 0 ? VEL.auto : 5) - ant) * (1 - Math.exp(-dt * (ac ? 1.6 : 2.6)));
    this.yaw -= en.x * dt * 1.5 * Math.min(1, Math.abs(v) / 6 + 0.25);
    this.vx = -Math.sin(this.yaw) * v; this.vz = -Math.cos(this.yaw) * v;
    const pasos = Math.max(1, Math.ceil((Math.abs(v) * dt) / 0.2));
    let golpe = false;
    for (let i = 0; i < pasos; i++) {
      const [a, b, c] = this.mundo.chocar(this.x + (this.vx * dt) / pasos, this.z + (this.vz * dt) / pasos, 0.8);
      this.x = a; this.z = b; golpe = golpe || c;
    }
    if (golpe) { this.vx *= 0.5; this.vz *= 0.5; }
    this.camaraPaso(Math.abs(v), dt, 1.32, 0);
  }

  /* Azotea: se camina adentro del contorno del techo */
  subirTerraza(d: { lat?: number; lon?: number; altura: number; anillo?: number[] | null }, l?: Local | null) {
    if (this.enTransicion) return;
    this.enTransicion = true;
    this.op.eventos.fundido(true);
    setTimeout(() => {
      if (!this.vivo) return;
      this.inter?.destruir();
      this.inter = null;
      this.pisoAct = 0;
      this.cancelarRuta(true);
      const base = l ?? this.localInt;
      let cx = base ? base.x - base.nx * 5 : this.x, cz = base ? base.z - base.nz * 5 : this.z;
      if (d.lat != null && d.lon != null) { const p = mundoDeLonLat(this.o, d.lon, d.lat); cx = p.x; cz = p.z; }
      let anillo: number[] | null = null;
      if (d.anillo && d.anillo.length >= 6) {
        anillo = [];
        for (let i = 0; i < d.anillo.length; i += 2) { const p = mundoDeLonLat(this.o, d.anillo[i + 1], d.anillo[i]); anillo.push(p.x, p.z); }
      }
      const y = Math.max(3, d.altura), obra = crearAzotea(anillo, cx, cz, 7, y);
      this.escena.add(obra.grupo);
      this.azotea = { y, anillo, cx, cz, radio: 6.5, obra, volver: base };
      this.localInt = null;
      this.x = cx; this.z = cz; this.pitch = -0.08; this.vx = this.vz = 0;
      this.tarjeta = null;
      this.op.eventos.local(null);
      this.op.eventos.cerca(null);
      this.op.eventos.interior(null);
      this.op.eventos.azotea?.(y);
      this.op.eventos.fundido(false);
      this.enTransicion = false;
    }, this.op.reducirMovimiento ? 60 : 280);
  }

  bajarTerraza() {
    const A = this.azotea;
    if (!A || this.enTransicion) return;
    this.enTransicion = true;
    this.op.eventos.fundido(true);
    setTimeout(() => {
      if (!this.vivo) return;
      A.obra.destruir();
      this.azotea = null;
      const l = A.volver;
      if (l) { this.x = l.x + l.nx * 2.2; this.z = l.z + l.nz * 2.2; this.yaw = Math.atan2(-l.nx, -l.nz); this.cerrado.add(l.id); }
      else { const a = this.mundo.puntoDeArranque(A.cx, A.cz); if (a) { this.x = a.x; this.z = a.z; this.yaw = a.yaw; } }
      this.pitch = 0;
      this.altActual = OJO;
      this.pasoAnt = { x: NaN, z: NaN };
      this.op.eventos.azotea?.(null);
      this.op.eventos.fundido(false);
      this.enTransicion = false;
    }, this.op.reducirMovimiento ? 60 : 280);
  }

  private pasoAzotea(dt: number) {
    const A = this.azotea!, en = this.entrada, sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const nx = this.x + (en.x * cy + en.y * sy) * VEL.caminar * dt, nz = this.z + (en.y * cy - en.x * sy) * VEL.caminar * dt;
    if (A.anillo ? dentroPoligono(A.anillo, nx, nz) : Math.hypot(nx - A.cx, nz - A.cz) < A.radio) { this.x = nx; this.z = nz; }
    this.fijarCamara(A.y + OJO);
  }

  /* Pisos: el ascensor cambia de escena sin volver a la calle */
  irAPiso(n: number) {
    const l = this.localInt;
    if (!l || this.enTransicion || !this.inter || n === this.pisoAct) return;
    this.enTransicion = true;
    this.op.eventos.fundido(true);
    setTimeout(() => {
      if (!this.vivo) return;
      this.inter?.destruir();
      this.inter = n === 0 ? crearInterior(l) : crearPasillo(l, n);
      this.pisoAct = n;
      this.x = this.inter.entrada.x; this.z = this.inter.entrada.z; this.yaw = this.inter.entrada.yaw; this.pitch = -0.04;
      this.vx = this.vz = 0;
      this.tInterior = -1;
      this.op.eventos.piso?.(n);
      this.op.eventos.fundido(false);
      this.enTransicion = false;
    }, this.op.reducirMovimiento ? 60 : 300);
  }

  /** Caminar hasta la puerta también es salir. */
  private vigilarInterior(t: number) {
    const I = this.inter!;
    if (this.tInterior < 0) this.tInterior = t;
    if (!I.puerta || t - this.tInterior < 1.5 || this.enTransicion) return;
    if (Math.abs(this.x) < 1.2 && this.z > I.fondo / 2 - RADIO - 0.04 && this.entrada.y > 0.2) { this.tInterior = -1; this.salir(); }
  }

  /** Empujar contra la puerta de un local también es entrar. */
  private vigilarPuerta(dt: number) {
    const l = this.cercaActual;
    if (!l || this.tarjeta || this.enTransicion) { this.tEmpuje = 0; return; }
    const dx = this.x - l.x, dz = this.z - l.z, frente = dx * l.nx + dz * l.nz, lado = Math.abs(dx * l.nz - dz * l.nx);
    const empuja = this.vx * -l.nx + this.vz * -l.nz, quiere = this.entrada.x !== 0 || this.entrada.y !== 0;
    /* Solo por la puerta: el medio del frente, y yendo hacia ella. Caminar pegado a la pared no entra */
    if (frente < 1 && lado < Math.min(1.6, Math.max(0.9, l.ancho / 2)) && quiere && (empuja > 0.6 || Math.hypot(this.vx, this.vz) < 0.2)) {
      this.tEmpuje += dt;
      if (this.tEmpuje > 0.35) { this.tEmpuje = 0; this.entrar(l); }
    } else this.tEmpuje = 0;
  }

  /** Un toque que no dio en un local: quizá dio en un edificio. La consulta la hace la pantalla. */
  private tocarEdificio(px: number, py: number) {
    if (this.azotea || this.vuelo || !this.op.eventos.edificio) return;
    const d = this.rayo(px, py), o = this.camara.position;
    const t = d.y < -0.01 ? Math.min(120, -o.y / d.y) : 120;
    if (t < 3) return;
    const a = lonLatDeMundo(this.o, o.x, o.z), b = lonLatDeMundo(this.o, o.x + d.x * t, o.z + d.z * t);
    this.op.eventos.edificio({ lat: a.lat, lon: a.lon }, { lat: b.lat, lon: b.lon });
  }

  /** Corre antes de `mover`. Devuelve true si este cuadro ya movió la cámara. */
  private pasoViaje(dt: number, t: number) {
    /* Pasos y calorías: lo que anduviste de verdad, sin teletransportes */
    if (!Number.isNaN(this.pasoAnt.x)) {
      const d = Math.hypot(this.x - this.pasoAnt.x, this.z - this.pasoAnt.z);
      if (d < 3 && !this.azotea && !this.vuelo) {
        if (this.modo === "caminar") this.metros.pie += d;
        else if (this.modo === "correr") this.metros.corre += d;
        else if (this.modo === "bici") this.metros.bici += d;
      }
    }
    this.pasoAnt = { x: this.x, z: this.z };
    this.carteles?.actualizar(this.camara);
    if (t - this.tViaje > 0.25) { this.tViaje = t; if (this.seg || this.modo === "volar") this.op.eventos.viaje?.(this.estadoViaje()); }

    if (this.vuelo) this.pasoVuelo(dt);
    else if (this.azotea) this.pasoAzotea(dt);
    else if (this.seg && !this.seg.pausada) this.pasoRuta(dt, t);
    else if (this.modo === "volar") this.pasoDron(dt);
    else if (this.modo === "auto") this.pasoAuto(dt);
    else { this.vigilarPuerta(dt); return false; }
    if (this.guia && this.seg) this.guia.actualizar(this.seg.s, t);
    return true;
  }

  estadoViaje(): EstadoViaje {
    /* El tiempo es el de la vida real, no el del juego: a pie son 4,9 km/h */
    const r = this.seg, m = r?.maniobras.find((q) => q.s > r.s - 2), vel = { caminar: 1.35, correr: 2.8, bici: 4.6, auto: 7, volar: 1.35 }[this.modo];
    return {
      activo: !!r, pausada: !!r?.pausada, nombre: r?.nombre ?? null, restante: r ? r.total - r.s : 0, segundos: r ? (r.total - r.s) / vel : 0,
      maniobra: m?.texto ?? null, enM: m && r ? Math.max(0, m.s - r.s) : 0, volando: !!this.vuelo, altura: this.altDron, enAire: this.altActual > 6,
    };
  }

  /** Lo que dibuja el mini mapa. No pasa por React. */
  estadoMapa() {
    const p = this.posicionReal(), r = this.seg, ruta: number[] = [];
    if (r) {
      const paso = Math.max(1, Math.ceil(r.pts.length / 2 / 300));
      for (let i = 0; i < r.pts.length / 2; i += paso) { if (r.acum[i] < r.s) continue; const q = lonLatDeMundo(this.o, r.pts[2 * i], r.pts[2 * i + 1]); ruta.push(q.lat, q.lon); }
      const f = lonLatDeMundo(this.o, r.pts[r.pts.length - 2], r.pts[r.pts.length - 1]);
      ruta.push(f.lat, f.lon);
    }
    return { lat: p.lat, lon: p.lon, rumbo: ((-this.yaw * 180) / Math.PI + 360) % 360, ruta };
  }

  recorrido() {
    const { pie, corre, bici } = this.metros;
    return { metros: pie + corre + bici, pasos: Math.round(pie / 0.72 + corre / 1.05), kcal: Math.round((pie * 52 + corre * 70 + bici * 22) / 1000) };
  }

  /** Foto de lo que se ve ahora. Hay que dibujar y leer en el mismo momento. */
  foto(): Promise<Blob | null> {
    this.renderer.render(this.inter ? this.inter.escena : this.escena, this.camara);
    return new Promise((ok) => this.renderer.domElement.toBlob(ok, "image/jpeg", 0.92));
  }

  /** Mientras otra pantalla tapa todo no hace falta dibujar. */
  pausar(p: boolean) {
    this.pausa = p || document.hidden;
    if (!this.pausa && this.vivo) { this.tAnt = performance.now(); cancelAnimationFrame(this.raf); this.raf = requestAnimationFrame(this.cuadro); }
  }

  /** Local real con ese nombre cerca de un punto, para abrirlo al llegar. */
  localEn(lat: number, lon: number, nombre: string) {
    const p = mundoDeLonLat(this.o, lon, lat), n = nombre.trim().toLowerCase();
    return this.mundo.localesCerca(p.x, p.z, 45).find((l) => l.nombre.trim().toLowerCase() === n) ?? null;
  }

  /** Abre la tarjeta de un lugar que no tiene frente en la calle (un resultado del buscador). */
  abrirExterno(l: Local) {
    const p = l.lat != null && l.lon != null ? mundoDeLonLat(this.o, l.lon, l.lat) : { x: this.x, z: this.z };
    l.x = p.x; l.z = p.z;
    this.abrir(l);
  }

  private destruirViaje() {
    this.guia?.destruir();
    this.azotea?.obra.destruir();
    this.carteles?.destruir();
  }
  /* ═════════════════ FIN SECCIÓN VIAJE ═════════════════ */

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
    this.destruirViaje();
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
    return !!c.getContext("webgl2");
  } catch { return false; }
}
