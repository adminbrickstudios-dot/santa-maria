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
  /** Datos reales publicados del lugar. Si falta alguno, no se muestra ni se inventa. */
  categoria?: string;
  telefono?: string;
  web?: string;
  /** Instagram o Facebook. */
  red?: string;
  /** Solo si el lugar publicó su WhatsApp. */
  whatsapp?: string;
  /** Formato opening_hours de OpenStreetMap. */
  horario?: string;
}

export interface Cartel { slot: number; tipo: "local" | "calle" | "numero"; texto: string; rubro?: Rubro }

export interface ViaTrafico {
  /** Id de la vía real: la misma calle en dos celdas tiene el mismo id. */
  id: number;
  pts: Float32Array; hw: number; sentido: number; clase: string; carriles: number;
  /** Semáforos sobre esta vía: distancia desde el inicio, fase (0/1) y corrimiento de la esquina. */
  altos: Float32Array;
}

export interface MallaSuelo { pos: Float32Array; col: Uint8Array; mat: Uint8Array; idx: Uint32Array }
export interface MallaEdif { pos: Float32Array; uv: Float32Array; ven: Float32Array; est: Uint8Array; nor: Int8Array; col: Uint8Array; idx: Uint32Array }
export interface MallaDetalle { pos: Float32Array; uv: Float32Array; nor: Int8Array; col: Uint8Array; idx: Uint32Array }

/** Instancias de una pieza del kit: matrices 4×4 y color por instancia. */
export interface LoteKit { pieza: number; m: Float32Array; c: Float32Array; /** Muros y puentes: se ven desde lejos. */ siempre?: boolean }
/** Objeto fijo: x, y, z, giro, escala, c1, c2, c3 (ocho números por instancia). */
export interface LoteProp { tipo: number; d: Float32Array }

export interface CeldaDatos {
  gx: number;
  gy: number;
  /** Mapa del suelo: lado×lado texeles RGBA, ver suelo.ts. */
  mapa: Uint8Array;
  ladoMapa: number;
  suelo: MallaSuelo;
  edif: MallaEdif;
  det: MallaDetalle;
  kit: LoteKit[];
  props: LoteProp[];
  /** Árboles: x, y, z, escala, giro, especie, semilla, alto (ocho números). */
  arboles: Float32Array;
  /** Paredes para chocar: x1, z1, x2, z2. */
  colision: Float32Array;
  /** Tramos de calle: x1, z1, x2, z2, medio ancho, índice en `nombres` (-1 si no tiene). */
  tramos: Float32Array;
  nombres: string[];
  locales: Local[];
  carteles: Cartel[];
  atlasFilas: number;
  vias: ViaTrafico[];
  singulares: Singular[];
}

/** Edificio con forma propia, en coordenadas de la celda. */
export interface Singular { id: string; x: number; z: number; giro: number; anillo: number[] }

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
    d.mapa.buffer, d.suelo.pos.buffer, d.suelo.col.buffer, d.suelo.mat.buffer, d.suelo.idx.buffer,
    d.edif.pos.buffer, d.edif.uv.buffer, d.edif.ven.buffer, d.edif.est.buffer, d.edif.nor.buffer, d.edif.col.buffer, d.edif.idx.buffer,
    d.det.pos.buffer, d.det.uv.buffer, d.det.nor.buffer, d.det.col.buffer, d.det.idx.buffer,
    d.arboles.buffer, d.colision.buffer, d.tramos.buffer,
    ...d.kit.flatMap((k) => [k.m.buffer, k.c.buffer]),
    ...d.props.map((k) => k.d.buffer),
    ...d.vias.flatMap((v) => [v.pts.buffer, v.altos.buffer]),
  ];
  return b as ArrayBuffer[];
}
