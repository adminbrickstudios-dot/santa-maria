/* Datos abiertos de la ciudad: dónde están y cómo se leen. Sin DOM ni Three: corre en el worker.
   Los tiles son z16 (unos 500 m) y las coordenadas enteras 0..10000 dentro de cada tile. */
export const BASE_CIUDAD = (process.env.NEXT_PUBLIC_CIUDAD_URL || "/ciudad/v1").replace(/\/$/, "");
export const Z_CIUDAD = 16;
export const EXT = 10000;
const N = 2 ** Z_CIUDAD;

export const urlTile = (x: number, y: number) => `${BASE_CIUDAD}/${x}_${y}.json.gz`;

export interface Punto { lat: number; lon: number }

export function z16DeLonLat(lon: number, lat: number) {
  const r = (lat * Math.PI) / 180;
  return { x: ((lon + 180) / 360) * N, y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * N };
}
export function lonLatDeZ16(x: number, y: number) {
  const n = Math.PI - (2 * Math.PI * y) / N;
  return { lon: (x / N) * 360 - 180, lat: (180 / Math.PI) * Math.atan(Math.sinh(n)) };
}
/** Metros reales por tile z16 a esta latitud. */
export const metrosTile = (lat: number) => (40075016.686 * Math.cos((lat * Math.PI) / 180)) / N;

export function distanciaM(a: Punto, b: Punto) {
  const k = 111320, dy = (a.lat - b.lat) * k, dx = (a.lon - b.lon) * k * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

/** Baja un .json.gz. Devuelve null si no existe. Sirve con o sin Content-Encoding del servidor. */
export async function bajarGz<T>(url: string, senal?: AbortSignal): Promise<T | null> {
  const r = await fetch(url, { signal: senal });
  if (r.status === 404 || r.status === 204) return null;
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  const b = new Uint8Array(await r.arrayBuffer());
  if (b[0] === 0x7b || b[0] === 0x5b) return JSON.parse(new TextDecoder().decode(b)) as T;
  if (b[0] !== 0x1f || b[1] !== 0x8b) return null; // fallback de HTML de un host: no es el dato
  const s = new Blob([b]).stream().pipeThrough(new DecompressionStream("gzip"));
  return (await new Response(s).json()) as T;
}

export type TileCiudad = {
  x: number; y: number;
  e: (string | number | number[])[][];
  l: (string | number)[][];
  v: [number, string, string, number[], Record<string, string>][];
  /** Puertas y números: X, Z, número, tipo. */
  p?: (string | number)[][];
  /** Objetos: tipo, X, Z, detalle. */
  o?: (string | number)[][];
  /** Cruces peatonales: X, Z, tipo. */
  k?: (string | number)[][];
};
