/* El suelo de una celda es un mapa de distancias más unas pocas calcomanías.

   Mapa RGBA de LADO×LADO texeles, en metros codificados con RANGO (ver materiales.ts):
     R: distancia al borde de la calzada (negativo adentro de la calle).
     G: distancia a una senda peatonal (veredas mapeadas, caminos de plaza, peatonales).
     B: distancia a la pared más cercana, para la oclusión y hasta dónde llega la baldosa.
     A: distancia al borde exterior de la vereda de la calle.
   Con eso el shader dibuja cordón, cuneta, baldosas y esquinas redondeadas sin vértices, y la
   altura real del cordón sale de mirar el mapa en dos alturas. No toca Three ni el DOM. */
import type { Edif, Via } from "./decodificar";

export const RANGO = 6;
export const ALTO_VEREDA = 0.15;

const K = 127 / RANGO;
/** Radio de la esquina del cordón. */
const FILETE = 3.4;

const smin = (a: number, b: number, k: number) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};

/** Baja `d` con la distancia a un segmento, solo en los texeles que puede afectar. */
function grabar(d: Float32Array, L: number, paso: number, ox: number, oz: number, ax: number, az: number, bx: number, bz: number, hw: number, alcance: number) {
  const r = hw + alcance;
  const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - r - ox) / paso)), i1 = Math.min(L - 1, Math.ceil((Math.max(ax, bx) + r - ox) / paso));
  const j0 = Math.max(0, Math.floor((Math.min(az, bz) - r - oz) / paso)), j1 = Math.min(L - 1, Math.ceil((Math.max(az, bz) + r - oz) / paso));
  const sx = bx - ax, sz = bz - az, L2 = sx * sx + sz * sz || 1e-6, iL = 1 / Math.sqrt(L2);
  for (let j = j0; j <= j1; j++) {
    const z = oz + j * paso - az;
    for (let i = i0; i <= i1; i++) {
      const x = ox + i * paso - ax;
      /* Descarte rápido: lejos de la recta no hay nada que grabar */
      if (Math.abs(x * sz - z * sx) * iL > r) continue;
      const q = Math.max(0, Math.min(1, (x * sx + z * sz) / L2)), hx = x - sx * q, hz = z - sz * q, v = Math.sqrt(hx * hx + hz * hz) - hw, k = j * L + i;
      if (v < d[k]) d[k] = v;
    }
  }
}

export interface MapaSuelo { mapa: Uint8Array; lado: number; paso: number; ox: number; oz: number; cal: Float32Array }

export function armarMapa(vias: Via[], edifs: Edif[], ox: number, oz: number, C: number): MapaSuelo {
  const L = Math.round(C) + 1, paso = C / (L - 1), n = L * L;
  const MUCHO = 1e3;
  /* Un campo por dirección: así el filete redondea cruces y no los quiebres de una misma calle */
  const dirs = [new Float32Array(n).fill(MUCHO), new Float32Array(n).fill(MUCHO), new Float32Array(n).fill(MUCHO), new Float32Array(n).fill(MUCHO)];
  const senda = new Float32Array(n).fill(MUCHO), pared = new Float32Array(n).fill(MUCHO), acera = new Float32Array(n).fill(MUCHO);
  const borde = RANGO + FILETE;
  for (const v of vias) {
    const p = v.pts;
    if (v.tunel || v.puente || v.escalera) { if (!v.peaton || v.tunel || v.puente) continue; }
    if (!v.auto && !v.peaton) continue;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3], dx = bx - ax, dz = bz - az;
      if (dx === 0 && dz === 0) continue;
      if (v.auto) {
        let a = Math.atan2(dz, dx);
        if (a < 0) a += Math.PI;
        const b = Math.floor((a / Math.PI) * 4) % 4;
        grabar(dirs[b], L, paso, ox, oz, ax, az, bx, bz, v.hw, borde);
        if (v.acera > 0) grabar(acera, L, paso, ox, oz, ax, az, bx, bz, v.hw + v.acera, RANGO);
      } else {
        grabar(senda, L, paso, ox, oz, ax, az, bx, bz, v.vereda ? Math.max(v.hw, 1.2) : v.hw, RANGO);
      }
    }
  }
  for (const e of edifs) {
    const a = e.anillo, m = a.length / 2;
    if (e.minH > 3) continue;
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      grabar(pared, L, paso, ox, oz, a[i * 2], a[i * 2 + 1], a[j * 2], a[j * 2 + 1], 0, RANGO);
    }
  }
  const mapa = new Uint8Array(n * 4), cal = new Float32Array(n);
  const cod = (v: number) => Math.max(0, Math.min(255, Math.round(128 + Math.max(-RANGO, Math.min(RANGO, v)) * K)));
  for (let k = 0; k < n; k++) {
    let d = dirs[0][k];
    for (let q = 1; q < 4; q++) d = smin(d, dirs[q][k], FILETE);
    cal[k] = d;
    mapa[k * 4] = cod(d);
    mapa[k * 4 + 1] = cod(senda[k]);
    mapa[k * 4 + 2] = cod(pared[k]);
    mapa[k * 4 + 3] = cod(acera[k]);
  }
  return { mapa, lado: L, paso, ox, oz, cal };
}

/** Distancia a la calzada en un punto (interpolada). Sirve para saber si algo va sobre la vereda. */
export function distCalzada(m: MapaSuelo, x: number, z: number) {
  const fx = Math.max(0, Math.min(m.lado - 1.001, (x - m.ox) / m.paso)), fz = Math.max(0, Math.min(m.lado - 1.001, (z - m.oz) / m.paso));
  const i = Math.floor(fx), j = Math.floor(fz), a = fx - i, b = fz - j, c = m.cal, L = m.lado;
  return (c[j * L + i] * (1 - a) + c[j * L + i + 1] * a) * (1 - b) + (c[(j + 1) * L + i] * (1 - a) + c[(j + 1) * L + i + 1] * a) * b;
}
