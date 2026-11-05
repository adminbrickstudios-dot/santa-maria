/* Lo que usa la pantalla para hablar con el worker de la ciudad. Si el worker no arranca, hace lo mismo en el hilo principal. */
import type { Resultado } from "./buscador";
import type { Punto } from "./ciudad";
import type { PedidoCiudad, RespuestaCiudad } from "./cliente-protocolo";
import type { IdFiltro } from "./filtros";
import type { Cercano, Cuadra, DatosEdificio, LineasMapa, Parada, RutaHecha } from "./nucleo";
import type { Perfil } from "./ruta";
import type { DatosLugar } from "./recepcion";

export interface ClienteCiudad {
  preparar(): Promise<unknown>;
  buscar(q: string, ref: Punto | null, tope?: number): Promise<Resultado[]>;
  ruta(a: Punto, b: Punto, perfil: Perfil, progreso?: (f: number) => void): Promise<RutaHecha | null>;
  edificio(a: Punto, hasta?: Punto | null): Promise<DatosEdificio | null>;
  lugar(a: Punto, nombre: string): Promise<DatosLugar | null>;
  vias(a: Punto, radio: number): Promise<LineasMapa>;
  paseo(a: Punto, cuantas?: number): Promise<Parada[]>;
  filtro(id: IdFiltro, a: Punto, radio?: number): Promise<Cercano[]>;
  cuadra(a: Punto): Promise<Cuadra>;
  cruces(a: Punto): Promise<Punto[]>;
  destruir(): void;
}

type SinId<T> = T extends unknown ? Omit<T, "id"> : never;
interface Espera { ok: (v: unknown) => void; mal: (e: Error) => void; progreso?: (f: number) => void }

/* Turbopack arranca todos los workers desde el mismo archivo y dice cuál es en el #fragmento de la URL.
   El navegador reusa la respuesta de esa URL, fragmento incluido, y este worker terminaba corriendo el
   código de otro (o el de tiles el de este, y la calle no cargaba). Con una URL distinta no pasa. */
function conUrlPropia(crear: () => Worker) {
  const Real = globalThis.Worker;
  globalThis.Worker = class extends Real {
    constructor(u: string | URL, o?: WorkerOptions) {
      const url = new URL(u, location.href);
      url.searchParams.set("w", "ciudad");
      super(url, o);
    }
  };
  try { return crear(); } finally { globalThis.Worker = Real; }
}

export function crearCliente(crear?: () => Worker): ClienteCiudad {
  const esperas = new Map<number, Espera>();
  let sec = 0, w: Worker | null = null, local: Promise<(p: PedidoCiudad) => void> | null = null, listo = false;
  const cola: PedidoCiudad[] = [];

  const oir = (m: RespuestaCiudad) => {
    if (m.t === "listo") { listo = true; for (const p of cola.splice(0)) w?.postMessage(p); return; }
    const e = esperas.get(m.id);
    if (!e) return;
    if (m.t === "progreso") { e.progreso?.(m.f); return; }
    esperas.delete(m.id);
    if (m.t === "ok") e.ok(m.r); else e.mal(new Error(m.mensaje));
  };
  const respaldo = () => {
    local ??= Promise.all([import("./nucleo"), import("./cliente-protocolo")]).then(([{ Nucleo }, { atender }]) => {
      const n = new Nucleo();
      return (p: PedidoCiudad) => { void atender(n, p, oir); };
    });
    return local;
  };
  /* Si el worker no arranca, lo que estaba esperando pasa al hilo principal */
  const caido = () => {
    w?.terminate();
    w = null;
    const p = cola.splice(0);
    if (p.length) void respaldo().then((f) => p.forEach(f));
  };
  try {
    w = crear ? crear() : conUrlPropia(() => new Worker(new URL("./ciudad.worker.ts", import.meta.url), { type: "module" }));
    w.onmessage = (e: MessageEvent<RespuestaCiudad>) => oir(e.data);
    w.onerror = caido;
    setTimeout(() => { if (!listo) caido(); }, 12000);
  } catch { w = null; }

  const pedir = <T>(p: SinId<PedidoCiudad>, progreso?: (f: number) => void) => new Promise<T>((ok, mal) => {
    const id = ++sec, msg = { ...p, id } as PedidoCiudad;
    esperas.set(id, { ok: ok as (v: unknown) => void, mal, progreso });
    if (w && listo) w.postMessage(msg);
    else if (w) cola.push(msg);
    else void respaldo().then((f) => f(msg));
  });

  return {
    preparar: () => pedir({ t: "preparar" }),
    buscar: (q, ref, tope) => pedir({ t: "buscar", q, ref, tope }),
    ruta: (a, b, perfil, progreso) => pedir({ t: "ruta", a, b, perfil }, progreso),
    edificio: (a, hasta) => pedir({ t: "edificio", a, hasta }),
    lugar: (a, nombre) => pedir({ t: "lugar", a, nombre }),
    vias: (a, radio) => pedir({ t: "vias", a, radio }),
    paseo: (a, cuantas) => pedir({ t: "paseo", a, cuantas }),
    filtro: (id2, a, radio) => pedir({ t: "filtro", id2, a, radio }),
    cuadra: (a) => pedir({ t: "cuadra", a }),
    cruces: (a) => pedir({ t: "cruces", a }),
    destruir() { w?.terminate(); esperas.clear(); },
  };
}
