/* Mensajes entre la pantalla y el núcleo de la ciudad. */
import type { Punto } from "./ciudad";
import type { Nucleo } from "./nucleo";
import type { IdFiltro } from "./filtros";
import type { Perfil } from "./ruta";

export type PedidoCiudad = { id: number } & (
  | { t: "preparar" }
  | { t: "buscar"; q: string; ref: Punto | null; tope?: number }
  | { t: "ruta"; a: Punto; b: Punto; perfil: Perfil }
  | { t: "edificio"; a: Punto; hasta?: Punto | null }
  | { t: "lugar"; a: Punto; nombre: string }
  | { t: "vias"; a: Punto; radio: number }
  | { t: "paseo"; a: Punto; cuantas?: number }
  | { t: "filtro"; id2: IdFiltro; a: Punto; radio?: number }
  | { t: "cuadra"; a: Punto }
  | { t: "cruces"; a: Punto }
);

export type RespuestaCiudad =
  | { id: number; t: "listo" }
  | { id: number; t: "ok"; r: unknown }
  | { id: number; t: "error"; mensaje: string }
  | { id: number; t: "progreso"; f: number };

export async function atender(n: Nucleo, p: PedidoCiudad, enviar: (m: RespuestaCiudad, t?: ArrayBuffer[]) => void) {
  try {
    let r: unknown = null, tr: ArrayBuffer[] = [];
    if (p.t === "preparar") r = await n.preparar();
    else if (p.t === "buscar") r = await n.buscar(p.q, p.ref, p.tope);
    else if (p.t === "ruta") {
      const h = await n.ruta(p.a, p.b, p.perfil, (f) => enviar({ id: p.id, t: "progreso", f }));
      r = h;
      if (h) tr = [h.pts.buffer as ArrayBuffer];
    } else if (p.t === "edificio") r = await n.edificio(p.a, p.hasta);
    else if (p.t === "lugar") r = await n.lugar(p.a, p.nombre);
    else if (p.t === "vias") {
      const h = await n.vias(p.a, p.radio);
      r = h;
      tr = [h.calles.buffer as ArrayBuffer, h.avenidas.buffer as ArrayBuffer];
    } else if (p.t === "paseo") r = await n.paseo(p.a, p.cuantas);
    else if (p.t === "filtro") r = await n.filtro(p.id2, p.a, p.radio);
    else if (p.t === "cuadra") r = await n.cuadra(p.a);
    else if (p.t === "cruces") r = await n.cruces(p.a);
    enviar({ id: p.id, t: "ok", r }, tr);
  } catch (e) {
    enviar({ id: p.id, t: "error", mensaje: String(e) });
  }
}
