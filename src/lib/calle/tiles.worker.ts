/* Worker: decodifica tiles y arma celdas sin trabar la pantalla. */
import { decodificarTile, type TileDatos } from "./decodificar";
import { armarCelda } from "./celda";
import { DIV } from "./geo";
import { transferiblesCelda, type PedidoWorker, type RespuestaWorker } from "./tipos";

interface Canal {
  onmessage: ((e: MessageEvent<PedidoWorker>) => void) | null;
  postMessage(m: RespuestaWorker, t?: ArrayBuffer[]): void;
}
const ctx = self as unknown as Canal;
const tiles = new Map<string, TileDatos>();

ctx.onmessage = (e) => {
  const p = e.data;
  try {
    if (p.t === "tile") {
      tiles.set(`${p.tx}/${p.ty}`, decodificarTile(p.buf, p.tx, p.ty, p.m));
      ctx.postMessage({ t: "tile", tx: p.tx, ty: p.ty });
    } else if (p.t === "soltar") {
      tiles.delete(`${p.tx}/${p.ty}`);
    } else {
      const t = tiles.get(`${Math.floor(p.gx / DIV)}/${Math.floor(p.gy / DIV)}`);
      if (!t) throw new Error("tile no cargado");
      const datos = armarCelda(t, p.gx, p.gy);
      ctx.postMessage({ t: "celda", datos }, transferiblesCelda(datos));
    }
  } catch (err) {
    ctx.postMessage({ t: "error", mensaje: String(err), ...(p.t === "celda" ? { gx: p.gx, gy: p.gy } : p.t === "tile" ? { tx: p.tx, ty: p.ty } : {}) });
  }
};
