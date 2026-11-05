/* Cuentas de mapa: del mundo real (lon/lat) a tiles z16 y a metros locales.
   El mundo son metros desde el punto de arranque: +x al este, +z al sur, y arriba. */
export const ZOOM = 16;
/** Cada tile z16 (unos 500 m) se parte en DIV×DIV celdas de unos 170 m. */
export const DIV = 3;
const N = 2 ** ZOOM;

export function aTile(lon: number, lat: number) {
  const r = (lat * Math.PI) / 180;
  return { x: ((lon + 180) / 360) * N, y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * N };
}
export function deTile(x: number, y: number) {
  const n = Math.PI - (2 * Math.PI * y) / N;
  return { lon: (x / N) * 360 - 180, lat: (180 / Math.PI) * Math.atan(Math.sinh(n)) };
}
export function metrosPorTile(lat: number) {
  return (40075016.686 * Math.cos((lat * Math.PI) / 180)) / N;
}

export interface Origen { fx: number; fy: number; m: number }
export function crearOrigen(lat: number, lon: number): Origen {
  const t = aTile(lon, lat);
  return { fx: t.x, fy: t.y, m: metrosPorTile(lat) };
}
export const mundoDeLonLat = (o: Origen, lon: number, lat: number) => {
  const t = aTile(lon, lat);
  return { x: (t.x - o.fx) * o.m, z: (t.y - o.fy) * o.m };
};
export const lonLatDeMundo = (o: Origen, x: number, z: number) => deTile(o.fx + x / o.m, o.fy + z / o.m);

/** Celda global que contiene un punto del mundo. */
export const celdaDeMundo = (o: Origen, x: number, z: number) => ({
  gx: Math.floor((o.fx + x / o.m) * DIV),
  gy: Math.floor((o.fy + z / o.m) * DIV),
});
/** Esquina noroeste de una celda, en metros del mundo. */
export const origenCelda = (o: Origen, gx: number, gy: number) => ({
  x: (gx / DIV - o.fx) * o.m,
  z: (gy / DIV - o.fy) * o.m,
});

/** Pseudoazar estable: el mismo edificio siempre sale igual. */
export function hash(a: number, b = 0): number {
  let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x165667b1, 0xc2b2ae35);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2f);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function hashTexto(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
export function hexARgb(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
