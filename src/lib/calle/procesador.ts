/* Quién procesa los tiles: un Web Worker, y si no se puede, el hilo principal de a poco. */
import { DIV } from "./geo";
import type { PedidoWorker, RespuestaWorker } from "./tipos";

export interface Procesador {
  enviar(p: PedidoWorker): void;
  destruir(): void;
}
type Oyente = (r: RespuestaWorker | { t: "caido" }) => void;

export function workerPorDefecto() {
  return new Worker(new URL("./tiles.worker.ts", import.meta.url), { type: "module" });
}

/** Mismo trabajo que el worker, pero repartido en ratos libres. */
export function procesadorLocal(oir: Oyente): Procesador {
  const cola: PedidoWorker[] = [];
  let vivo = true, corriendo = false;
  let mods: Promise<[typeof import("./decodificar"), typeof import("./celda")]> | null = null;
  const tiles = new Map<string, import("./decodificar").TileDatos>();
  const espera = (f: () => void) => {
    if ("requestIdleCallback" in window) window.requestIdleCallback(f, { timeout: 120 });
    else setTimeout(f, 16);
  };
  const paso = async () => {
    if (!vivo) return;
    const p = cola.shift();
    if (!p) { corriendo = false; return; }
    mods ??= Promise.all([import("./decodificar"), import("./celda")]);
    const [dec, cel] = await mods;
    if (!vivo) return;
    try {
      if (p.t === "tile") {
        tiles.set(`${p.tx}/${p.ty}`, await dec.decodificarTile(p.buf, p.tx, p.ty, p.m));
        if (!vivo) return;
        oir({ t: "tile", tx: p.tx, ty: p.ty });
      } else if (p.t === "soltar") {
        tiles.delete(`${p.tx}/${p.ty}`);
      } else {
        const t = tiles.get(`${Math.floor(p.gx / DIV)}/${Math.floor(p.gy / DIV)}`);
        if (!t) throw new Error("tile no cargado");
        oir({ t: "celda", datos: cel.armarCelda(t, p.gx, p.gy) });
      }
    } catch (e) {
      oir({ t: "error", mensaje: String(e), ...(p.t === "celda" ? { gx: p.gx, gy: p.gy } : p.t === "tile" ? { tx: p.tx, ty: p.ty } : {}) });
    }
    espera(paso);
  };
  return {
    enviar(p) { cola.push(p); if (!corriendo) { corriendo = true; espera(paso); } },
    destruir() { vivo = false; cola.length = 0; tiles.clear(); },
  };
}

export function crearProcesador(crear: (() => Worker) | undefined, oir: Oyente): Procesador {
  let w: Worker | null = null;
  try { w = (crear ?? workerPorDefecto)(); } catch { return procesadorLocal(oir); }
  let actual: Procesador | null = null, caido = false;
  w.onmessage = (e: MessageEvent<RespuestaWorker>) => oir(e.data);
  w.onerror = () => {
    if (caido) return;
    caido = true;
    w?.terminate();
    actual = procesadorLocal(oir);
    oir({ t: "caido" });
  };
  return {
    enviar(p) {
      if (actual) return actual.enviar(p);
      const t = p.t === "tile" && p.buf ? [p.buf] : [];
      w!.postMessage(p, t);
    },
    destruir() { w?.terminate(); actual?.destruir(); },
  };
}
