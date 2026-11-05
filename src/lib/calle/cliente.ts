/* Lo que usa la pantalla para hablar con el worker de la ciudad. Si el worker no arranca, hace lo mismo en el hilo principal. */
import type { Resultado } from "./buscador";
import type { Punto } from "./ciudad";
import type { PedidoCiudad, RespuestaCiudad } from "./cliente-protocolo";
import type { DatosEdificio, LineasMapa, Parada, RutaHecha } from "./nucleo";
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
  destruir(): void;
}

type SinId<T> = T extends unknown ? Omit<T, "id"> : never;
interface Espera { ok: (v: unknown) => void; mal: (e: Error) => void; progreso?: (f: number) => void }

export function crearCliente(crear?: () => Worker): ClienteCiudad {
  const esperas = new Map<number, Espera>();
  let sec = 0, w: Worker | null = null, local: Promise<(p: PedidoCiudad) => void> | null = null;

  const oir = (m: RespuestaCiudad) => {
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
  try {
    w = crear ? crear() : new Worker(new URL("./ciudad.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<RespuestaCiudad>) => oir(e.data);
    w.onerror = () => { w?.terminate(); w = null; };
  } catch { w = null; }

  const pedir = <T>(p: SinId<PedidoCiudad>, progreso?: (f: number) => void) => new Promise<T>((ok, mal) => {
    const id = ++sec, msg = { ...p, id } as PedidoCiudad;
    esperas.set(id, { ok: ok as (v: unknown) => void, mal, progreso });
    if (w) w.postMessage(msg); else void respaldo().then((f) => f(msg));
  });

  return {
    preparar: () => pedir({ t: "preparar" }),
    buscar: (q, ref, tope) => pedir({ t: "buscar", q, ref, tope }),
    ruta: (a, b, perfil, progreso) => pedir({ t: "ruta", a, b, perfil }, progreso),
    edificio: (a, hasta) => pedir({ t: "edificio", a, hasta }),
    lugar: (a, nombre) => pedir({ t: "lugar", a, nombre }),
    vias: (a, radio) => pedir({ t: "vias", a, radio }),
    paseo: (a, cuantas) => pedir({ t: "paseo", a, cuantas }),
    destruir() { w?.terminate(); esperas.clear(); },
  };
}
