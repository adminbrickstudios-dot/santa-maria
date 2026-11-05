/* Caminar en la vida real: GPS y brújula del celular. Nada de esto sale del teléfono.
   El GPS entre edificios erra de 5 a 30 m: se filtra, pero no se esconde. */
import { distanciaM, type Punto } from "./ciudad";

export interface Lectura { lat: number; lon: number; precision: number; t: number }
export type Senal = "buena" | "regular" | "mala";

export const senalDe = (precision: number): Senal => (precision <= 12 ? "buena" : precision <= 30 ? "regular" : "mala");

/** Filtro de saltos y suavizado. Caminando no se puede ir a más de 7 m/s, y el GPS dice cuánto duda. */
export class FiltroGPS {
  pos: Punto | null = null;
  precision = 999;
  /** m/s suavizado. */
  vel = 0;
  private dudosas: Lectura[] = [];
  private t = 0;
  private varianza = 0;

  /** Devuelve true si la lectura se aceptó. */
  entrar(l: Lectura) {
    this.precision = l.precision;
    if (!this.pos) {
      this.pos = { lat: l.lat, lon: l.lon }; this.t = l.t; this.varianza = l.precision ** 2;
      return true;
    }
    const dt = Math.max(0.2, (l.t - this.t) / 1000), d = distanciaM(this.pos, l);
    if (d > 7 * dt + l.precision + 12) {
      /* Un salto suelto se ignora. Tres seguidos que coinciden entre sí es que te moviste de verdad */
      this.dudosas.push(l);
      if (this.dudosas.length < 3) return false;
      const a = this.dudosas[0], b = this.dudosas[this.dudosas.length - 1];
      if (distanciaM(a, b) > 40 + l.precision) { this.dudosas.shift(); return false; }
      this.dudosas = [];
      this.pos = { lat: l.lat, lon: l.lon }; this.t = l.t; this.varianza = l.precision ** 2; this.vel = 0;
      return true;
    }
    this.dudosas = [];
    this.varianza += (3 * dt) ** 2;
    const k = this.varianza / (this.varianza + l.precision ** 2), antes = this.pos;
    this.pos = { lat: antes.lat + (l.lat - antes.lat) * k, lon: antes.lon + (l.lon - antes.lon) * k };
    this.varianza *= 1 - k;
    this.vel += (distanciaM(antes, this.pos) / dt - this.vel) * 0.35;
    this.t = l.t;
    return true;
  }
}

/** El rumbo del celular: 0 norte, 90 este. Null si este evento no trae brújula. */
export function rumboDe(e: DeviceOrientationEvent & { webkitCompassHeading?: number }): number | null {
  if (typeof e.webkitCompassHeading === "number" && !Number.isNaN(e.webkitCompassHeading)) return e.webkitCompassHeading;
  if (e.absolute && e.alpha != null) return (360 - e.alpha) % 360;
  return null;
}

/** Inclinación de la cámara según cómo sostenés el celular: parado mira al frente. */
export const inclinacionDe = (beta: number | null) => (beta == null ? 0 : Math.max(-32, Math.min(30, (beta - 80) * 0.8)));

/** iOS exige pedir este permiso dentro del toque. Hay que llamarla sin esperar nada antes. */
export function pedirBrujula(): Promise<boolean> {
  const D = (globalThis as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
  if (!D) return Promise.resolve(false);
  if (typeof D.requestPermission !== "function") return Promise.resolve(true);
  return D.requestPermission().then((r) => r === "granted").catch(() => false);
}

export interface OyentesCaminata {
  posicion(l: Lectura): void;
  rumbo(grados: number, inclinacion: number): void;
  error(tipo: "permiso" | "sinSenal" | "noSoportado"): void;
}

/** Enciende y apaga los sensores. Con la app en segundo plano se apagan: gasta menos y no sigue midiendo. */
export class Sensores {
  private watch: number | null = null;
  private candado: { release(): Promise<void>; addEventListener(t: string, f: () => void): void } | null = null;
  private vivo = false;
  private hayAbsoluta = false;

  constructor(private o: OyentesCaminata) {}

  private orientar = (e: DeviceOrientationEvent) => {
    const g = rumboDe(e as DeviceOrientationEvent & { webkitCompassHeading?: number });
    if (g == null) return;
    if (e.type === "deviceorientationabsolute") this.hayAbsoluta = true;
    else if (this.hayAbsoluta) return;
    const giro = (screen.orientation?.angle ?? 0) as number;
    this.o.rumbo((g + giro) % 360, inclinacionDe(e.beta));
  };

  private visible = () => {
    if (!this.vivo) return;
    if (document.hidden) this.apagar(); else this.prender();
  };

  private prender() {
    if (!navigator.geolocation) { this.o.error("noSoportado"); return; }
    if (this.watch != null) return;
    this.watch = navigator.geolocation.watchPosition(
      (p) => this.o.posicion({ lat: p.coords.latitude, lon: p.coords.longitude, precision: p.coords.accuracy, t: p.timestamp || Date.now() }),
      (e) => this.o.error(e.code === e.PERMISSION_DENIED ? "permiso" : "sinSenal"),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 },
    );
    window.addEventListener("deviceorientationabsolute", this.orientar as EventListener);
    window.addEventListener("deviceorientation", this.orientar as EventListener);
    void this.pedirCandado();
  }

  private apagar() {
    if (this.watch != null) navigator.geolocation.clearWatch(this.watch);
    this.watch = null;
    window.removeEventListener("deviceorientationabsolute", this.orientar as EventListener);
    window.removeEventListener("deviceorientation", this.orientar as EventListener);
    void this.candado?.release().catch(() => {});
    this.candado = null;
  }

  /** Que la pantalla no se apague mientras caminás. */
  private async pedirCandado() {
    try {
      const w = (navigator as unknown as { wakeLock?: { request(t: string): Promise<NonNullable<Sensores["candado"]>> } }).wakeLock;
      if (w) this.candado = await w.request("screen");
    } catch { /* sin candado: la pantalla se apaga sola */ }
  }

  empezar() {
    this.vivo = true;
    document.addEventListener("visibilitychange", this.visible);
    this.prender();
  }

  terminar() {
    this.vivo = false;
    document.removeEventListener("visibilitychange", this.visible);
    this.apagar();
  }
}

/** Avisos sin mirar: vibra donde se puede, y habla solo si lo pediste. */
export function avisarGiro(texto: string, voz: boolean) {
  try { navigator.vibrate?.([70, 60, 70]); } catch { /* sin vibración */ }
  if (!voz || !("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(texto);
  u.lang = "es-AR";
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}
