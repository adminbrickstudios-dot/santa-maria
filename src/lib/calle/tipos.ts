/* Tipos compartidos entre el hilo principal y el worker de tiles. Sin dependencias de Three. */

/** Baja un tile vectorial. Devuelve null si el tile no existe (zona vacía). */
export type ProveedorTiles = (z: number, x: number, y: number, senal?: AbortSignal) => Promise<ArrayBuffer | null>;

export interface DatosExtraLugar { horario?: string; telefono?: string; web?: string }
export interface ConsultaLugar { nombre: string; lat: number; lon: number }
export type ProveedorLugar = (c: ConsultaLugar, senal?: AbortSignal) => Promise<DatosExtraLugar | null>;

export type TipoInterior = "farmacia" | "cafe" | "super" | "ropa" | "generico";

export interface Rubro {
  id: string;
  nombre: string;
  color: string;
  texto: string;
  toldo: boolean;
  interior: TipoInterior;
  cruz?: boolean;
}

/** Un local ubicado sobre una pared. x/z son del mundo una vez que la celda se integra. */
export interface Local {
  id: string;
  nombre: string;
  rubro: Rubro;
  /** Punto del frente, relativo al origen de la celda hasta que se integra. */
  x: number;
  z: number;
  nx: number;
  nz: number;
  ancho: number;
  pisos: number;
  altura: number;
  direccion: string | null;
  /** Punto del POI original en coordenadas de celda, para pedir datos y para "Cómo llego". */
  px: number;
  pz: number;
  lat?: number;
  lon?: number;
}

export interface Cartel { slot: number; tipo: "local" | "calle"; texto: string; rubro?: Rubro }

export interface ViaTrafico { pts: Float32Array; hw: number; sentido: number; clase: string }

export interface MallaSuelo { pos: Float32Array; col: Uint8Array; mat: Uint8Array; idx: Uint32Array }
export interface MallaEdif { pos: Float32Array; uv: Float32Array; nor: Int8Array; col: Uint8Array; idx: Uint32Array }
export interface MallaDetalle { pos: Float32Array; uv: Float32Array; nor: Int8Array; col: Uint8Array; idx: Uint32Array }

export interface CeldaDatos {
  gx: number;
  gy: number;
  suelo: MallaSuelo;
  edif: MallaEdif;
  det: MallaDetalle;
  /** Árboles y farolas: x, z, escala, giro, tipo (0 árbol, 1 farola, 2 jacarandá). */
  props: Float32Array;
  /** Paredes para chocar: x1, z1, x2, z2. */
  colision: Float32Array;
  /** Tramos de calle: x1, z1, x2, z2, medio ancho, índice en `nombres` (-1 si no tiene). */
  tramos: Float32Array;
  nombres: string[];
  locales: Local[];
  carteles: Cartel[];
  atlasFilas: number;
  vias: ViaTrafico[];
}

export type PedidoWorker =
  | { t: "tile"; tx: number; ty: number; m: number; buf: ArrayBuffer | null }
  | { t: "celda"; gx: number; gy: number }
  | { t: "soltar"; tx: number; ty: number };

export type RespuestaWorker =
  | { t: "tile"; tx: number; ty: number }
  | { t: "celda"; datos: CeldaDatos }
  | { t: "error"; mensaje: string; gx?: number; gy?: number; tx?: number; ty?: number };

export function transferiblesCelda(d: CeldaDatos): ArrayBuffer[] {
  const b: ArrayBufferLike[] = [
    d.suelo.pos.buffer, d.suelo.col.buffer, d.suelo.mat.buffer, d.suelo.idx.buffer,
    d.edif.pos.buffer, d.edif.uv.buffer, d.edif.nor.buffer, d.edif.col.buffer, d.edif.idx.buffer,
    d.det.pos.buffer, d.det.uv.buffer, d.det.nor.buffer, d.det.col.buffer, d.det.idx.buffer,
    d.props.buffer, d.colision.buffer, d.tramos.buffer,
    ...d.vias.map((v) => v.pts.buffer),
  ];
  return b as ArrayBuffer[];
}
