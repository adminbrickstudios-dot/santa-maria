/* El cielo de Buenos Aires según la hora: posición real del sol y una paleta por altura del sol. */
export interface EstadoCielo {
  sol: [number, number, number]; // dirección hacia el sol
  elevacion: number; // grados
  cenit: number[]; horizonte: number[];
  luzSol: number[]; luzCielo: number[]; luzSuelo: number[];
  noche: number; // 0 día, 1 noche
}

const rad = Math.PI / 180;
const c = (h: string) => { const n = parseInt(h, 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };

/** Altura y azimut del sol. Fórmula corta, alcanza y sobra para pintar el cielo. */
export function posicionSol(fecha: Date, lat: number, lon: number) {
  const d = fecha.getTime() / 864e5 - 10957.5;
  const g = (357.529 + 0.98560028 * d) * rad, q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad, e = (23.439 - 3.6e-7 * d) * rad;
  const dec = Math.asin(Math.sin(e) * Math.sin(L)), ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const H = ((18.697374558 + 24.06570982441908 * d) * 15 + lon) * rad - ra, f = lat * rad;
  const alt = Math.asin(Math.sin(f) * Math.sin(dec) + Math.cos(f) * Math.cos(dec) * Math.cos(H));
  const az = Math.atan2(-Math.sin(H) * Math.cos(dec), Math.sin(dec) * Math.cos(f) - Math.cos(dec) * Math.sin(f) * Math.cos(H));
  return { alt, az };
}

interface Clave { e: number; cen: number[]; hor: number[]; sol: number[]; cie: number[]; sue: number[]; n: number }
const CLAVES: Clave[] = [
  { e: -16, cen: c("0A1230"), hor: c("1C2A4E"), sol: [0, 0, 0], cie: [0.2, 0.25, 0.42], sue: [0.1, 0.11, 0.18], n: 1 },
  { e: -5, cen: c("1E2C63"), hor: c("7A6792"), sol: [0.05, 0.03, 0.05], cie: [0.36, 0.38, 0.56], sue: [0.18, 0.16, 0.24], n: 0.85 },
  { e: 0, cen: c("3F62A8"), hor: c("F6A878"), sol: [0.9, 0.5, 0.3], cie: [0.56, 0.52, 0.62], sue: [0.32, 0.25, 0.26], n: 0.4 },
  { e: 8, cen: c("5B95DA"), hor: c("FFD9AE"), sol: [1.0, 0.75, 0.5], cie: [0.66, 0.68, 0.76], sue: [0.4, 0.34, 0.3], n: 0 },
  { e: 25, cen: c("58A3EE"), hor: c("DCEEF4"), sol: [0.86, 0.76, 0.6], cie: [0.74, 0.78, 0.84], sue: [0.44, 0.4, 0.36], n: 0 },
  { e: 65, cen: c("4A9CF2"), hor: c("E2F1F6"), sol: [0.8, 0.74, 0.62], cie: [0.78, 0.82, 0.88], sue: [0.46, 0.43, 0.4], n: 0 },
];
const mez = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);

export function cieloEn(fecha: Date, lat: number, lon: number): EstadoCielo {
  const { alt, az } = posicionSol(fecha, lat, lon);
  const e = alt / rad;
  let i = 0;
  while (i < CLAVES.length - 2 && e > CLAVES[i + 1].e) i++;
  const a = CLAVES[i], b = CLAVES[i + 1], t = Math.max(0, Math.min(1, (e - a.e) / (b.e - a.e)));
  return {
    sol: [Math.sin(az) * Math.cos(alt), Math.sin(alt), -Math.cos(az) * Math.cos(alt)],
    elevacion: e, cenit: mez(a.cen, b.cen, t), horizonte: mez(a.hor, b.hor, t),
    luzSol: mez(a.sol, b.sol, t), luzCielo: mez(a.cie, b.cie, t), luzSuelo: mez(a.sue, b.sue, t), noche: a.n + (b.n - a.n) * t,
  };
}

/** Fecha de hoy a una hora dada de Buenos Aires (UTC−3). Sin hora, ahora. */
export function fechaEnHora(hora?: number | null) {
  if (hora == null || Number.isNaN(hora)) return new Date();
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return new Date(d.getTime() + (hora + 3) * 36e5);
}
