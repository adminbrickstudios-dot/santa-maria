/* El cielo de Buenos Aires según la hora: posición real del sol y una paleta por altura del sol. Todo en lineal. */
export interface EstadoCielo {
  sol: [number, number, number]; // dirección hacia el sol
  elevacion: number; // grados
  cenit: number[]; horizonte: number[];
  luzSol: number[]; luzCielo: number[]; luzSuelo: number[];
  noche: number; // 0 día, 1 noche
  expo: number;
}

const rad = Math.PI / 180;

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

interface Clave { e: number; cen: number[]; hor: number[]; sol: number[]; cie: number[]; sue: number[]; n: number; x: number }
const CLAVES: Clave[] = [
  { e: -16, cen: [0.012, 0.018, 0.05], hor: [0.04, 0.05, 0.1], sol: [0, 0, 0], cie: [0.13, 0.14, 0.22], sue: [0.12, 0.1, 0.1], n: 1, x: 0.9 },
  { e: -5, cen: [0.05, 0.09, 0.26], hor: [0.42, 0.3, 0.42], sol: [0.02, 0.012, 0.02], cie: [0.16, 0.17, 0.3], sue: [0.1, 0.09, 0.11], n: 0.85, x: 0.8 },
  { e: 0, cen: [0.18, 0.3, 0.7], hor: [1.5, 0.82, 0.55], sol: [1.5, 0.66, 0.3], cie: [0.36, 0.34, 0.46], sue: [0.2, 0.15, 0.13], n: 0.4, x: 0.74 },
  { e: 8, cen: [0.24, 0.45, 0.98], hor: [1.5, 1.2, 0.92], sol: [2.7, 1.95, 1.2], cie: [0.48, 0.52, 0.66], sue: [0.3, 0.25, 0.21], n: 0, x: 0.66 },
  { e: 25, cen: [0.2, 0.44, 1.0], hor: [1.05, 1.22, 1.38], sol: [3.1, 2.75, 2.25], cie: [0.56, 0.63, 0.78], sue: [0.36, 0.33, 0.29], n: 0, x: 0.56 },
  { e: 65, cen: [0.16, 0.4, 1.0], hor: [1.0, 1.25, 1.45], sol: [3.5, 3.25, 2.85], cie: [0.6, 0.68, 0.84], sue: [0.42, 0.39, 0.35], n: 0, x: 0.5 },
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
    luzSol: mez(a.sol, b.sol, t), luzCielo: mez(a.cie, b.cie, t), luzSuelo: mez(a.sue, b.sue, t), noche: a.n + (b.n - a.n) * t, expo: a.x + (b.x - a.x) * t,
  };
}

/** Fecha de hoy a una hora dada de Buenos Aires (UTC−3). Sin hora, ahora. */
export function fechaEnHora(hora?: number | null) {
  if (hora == null || Number.isNaN(hora)) return new Date();
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return new Date(d.getTime() + (hora + 3) * 36e5);
}
