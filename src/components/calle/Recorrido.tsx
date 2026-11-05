"use client";
/* Lo que se ve mientras caminás de verdad, y la explicación antes de pedir permisos. */
import Link from "next/link";
import { Icono } from "@/components/Icono";
import { comoLlegoHref } from "@/lib/calle/recepcion";
import { HojaCalle, distancia, tiempo } from "./comunes";
import type { Destino } from "./Buscador";
import type { EstadoCaminata } from "./useCaminata";

const SENAL = { buena: "Buena señal", regular: "Señal regular", mala: "Señal débil" };

export function BarraRecorrido({ e, voz, setVoz, corregir, terminar }: { e: EstadoCaminata; voz: boolean; setVoz: (v: boolean) => void; corregir: (si: boolean) => void; terminar: () => void }) {
  if (e.corrigiendo) {
    return (
      <div className="calle-recorrido">
        <p>Movete con el joystick hasta donde estás parado de verdad.</p>
        <button className="calle-btn pri" onClick={() => corregir(false)}>Listo</button>
      </div>
    );
  }
  return (
    <div className="calle-recorrido">
      <div className={`calle-senal ${e.senal}`} role="status">
        {e.buscando ? <b>Buscando tu ubicación…</b> : <><i aria-hidden="true" /><b>{SENAL[e.senal]}</b><small>Tu punto puede errar unos {Math.round(e.precision)} m</small></>}
      </div>
      <div className="calle-recorrido-acc">
        <button className="calle-btn" onClick={() => corregir(true)} disabled={e.buscando}>Corregir mi punto</button>
        <button className="calle-btn" onClick={() => setVoz(!voz)} aria-pressed={voz}>{voz ? "Voz: sí" : "Voz: no"}</button>
        <button className="calle-btn" onClick={terminar}>Terminar</button>
      </div>
      {!e.brujula && !e.buscando && <small className="calle-recorrido-nota">Sin brújula: la vista sigue la ruta, no tu celular.</small>}
    </div>
  );
}

export function HojaPermisos({ seguir, cerrar }: { seguir: () => void; cerrar: () => void }) {
  return (
    <HojaCalle titulo="Iniciar recorrido" cerrar={cerrar}>
      <p className="calle-sub">Caminás por la calle de verdad y el 3D te sigue: mira adonde mira tu celular y te muestra la ruta.</p>
      <p className="calle-sub">Para eso te vamos a pedir la <b>ubicación</b> y la <b>brújula</b>. Tu ubicación queda en el celular: no se guarda ni se manda. Solo se bajan los mapas de la zona.</p>
      <p className="calle-sub">Mirá el camino al cruzar, no la pantalla.</p>
      <button className="calle-btn pri calle-ancho" onClick={seguir}>Empezar</button>
    </HojaCalle>
  );
}

export function HojaLejos({ destino, metros, aPie, cerrar }: { destino: Destino; metros: number; aPie: () => void; cerrar: () => void }) {
  return (
    <HojaCalle titulo={`Estás a ${distancia(metros)}`} cerrar={cerrar} chica>
      <p className="calle-sub">Hasta {destino.nombre} son unos {tiempo(metros * 1.25 / 1.35)} a pie. Podés ir caminando desde donde estás, o ver colectivos y subte.</p>
      <div className="calle-acciones calle-pie-hoja">
        <button className="calle-btn pri" onClick={aPie}>Ir a pie</button>
        <Link className="calle-btn" href={comoLlegoHref(destino, destino.nombre)}>Cómo ir</Link>
      </div>
    </HojaCalle>
  );
}
