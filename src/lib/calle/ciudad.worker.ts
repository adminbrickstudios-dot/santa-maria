/* Worker de la ciudad: búsqueda, rutas y edificios sin trabar la pantalla. */
import { atender, type PedidoCiudad, type RespuestaCiudad } from "./cliente-protocolo";
import { Nucleo } from "./nucleo";

interface Canal {
  onmessage: ((e: MessageEvent<PedidoCiudad>) => void) | null;
  postMessage(m: RespuestaCiudad, t?: ArrayBuffer[]): void;
}
const ctx = self as unknown as Canal;
const nucleo = new Nucleo();

ctx.onmessage = (e) => { atender(nucleo, e.data, (m, t) => ctx.postMessage(m, t)); };
