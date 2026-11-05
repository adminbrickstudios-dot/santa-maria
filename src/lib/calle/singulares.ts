/* Edificios con forma propia, ubicados donde están de verdad. Acá solo se decide cuáles huellas del dato
   reemplazan; la geometría la arma modelos.ts en el hilo principal. No toca Three ni el DOM. */
import { aTile } from "./geo";
import type { Edif, TileDatos } from "./decodificar";

interface Def {
  id: string; lat: number; lon: number;
  /** Rumbo del modelo en radianes. Con `huella`, se saca del lado más largo y mira a la calle más cercana. */
  giro: number;
  /** Medio largo y medio ancho de lo que además se saca alrededor. */
  a: number; b: number;
  huella?: boolean;
}

export const SINGULARES: Def[] = [
  { id: "obelisco", lat: -34.60374, lon: -58.38157, giro: 0, a: 0, b: 0 },
  { id: "pilar", lat: -34.586698, lon: -58.392247, giro: 0, a: 0, b: 0, huella: true },
  { id: "floralis", lat: -34.58166, lon: -58.39397, giro: 0, a: 0, b: 0 },
  { id: "recoleta", lat: -34.58742, lon: -58.39315, giro: 0.92, a: 8, b: 6 },
  { id: "derecho", lat: -34.58230, lon: -58.39213, giro: 0, a: 0, b: 0, huella: true },
  { id: "congreso", lat: -34.60988, lon: -58.39280, giro: 0, a: 0, b: 0, huella: true },
  { id: "rosada", lat: -34.60801, lon: -58.37032, giro: 0, a: 0, b: 0, huella: true },
  { id: "barolo", lat: -34.60966, lon: -58.38573, giro: 0, a: 0, b: 0, huella: true },
  { id: "colon", lat: -34.60107, lon: -58.38335, giro: 0, a: 0, b: 0, huella: true },
  { id: "kavanagh", lat: -34.59539, lon: -58.37462, giro: 0, a: 0, b: 0, huella: true },
];

export interface Bloque { id: string; x: number; z: number; giro: number; anillo: number[] }
type Buscar = (t: TileDatos, x: number, z: number) => Edif | null;
type Vial = (t: TileDatos, x: number, z: number, r: number) => { d: number } | null;

export function singularesDe(t: TileDatos, enEdif: Buscar, viaCerca: Vial): Bloque[] {
  const s: Bloque[] = [], M = 60;
  for (const d of SINGULARES) {
    const p = aTile(d.lon, d.lat), x = (p.x - t.tx) * t.m, z = (p.y - t.ty) * t.m;
    if (x < -M - d.a || z < -M - d.a || x > t.m + M + d.a || z > t.m + M + d.a) continue;
    const c = Math.cos(d.giro), sn = Math.sin(d.giro);
    let anillo: number[] = [], giro = d.giro, cx = x, cz = z;
    if (d.a) for (const e of t.edifs) {
      const dx = e.cx - x, dz = e.cz - z, u = dx * c + dz * sn, v = -dx * sn + dz * c;
      if (Math.abs(u) < d.a && Math.abs(v) < d.b) e.omitir = true;
    }
    if (d.huella) {
      const e = enEdif(t, x, z);
      if (e) {
        e.omitir = true;
        cx = e.cx; cz = e.cz;
        anillo = e.anillo.map((v, i) => v - (i % 2 ? cz : cx));
        /* El lado más largo da el eje; el frente es la punta más cerca de una calle */
        let m = 0;
        const n = anillo.length / 2;
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n, dx = anillo[j * 2] - anillo[i * 2], dz = anillo[j * 2 + 1] - anillo[i * 2 + 1], L = Math.hypot(dx, dz);
          if (L > m) { m = L; giro = Math.atan2(dz, dx); }
        }
        const L = Math.sqrt(e.area) * 0.75, ca = Math.cos(giro), sa = Math.sin(giro);
        const da = viaCerca(t, cx + ca * L, cz + sa * L, 40)?.d ?? 40, db = viaCerca(t, cx - ca * L, cz - sa * L, 40)?.d ?? 40;
        if (db < da) giro += Math.PI;
      }
    }
    if (x >= 0 && z >= 0 && x < t.m && z < t.m) s.push({ id: d.id, x: cx, z: cz, giro, anillo });
  }
  return s;
}
