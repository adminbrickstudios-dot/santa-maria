"use client";
/* Cartel del edificio: datos reales, y ascensor con los pisos y la terraza. */
import Link from "next/link";
import type { DatosEdificio } from "@/lib/calle/nucleo";
import { comoLlegoHref } from "@/lib/calle/recepcion";
import { HojaCalle } from "./comunes";

const TIPOS: Record<string, string> = { apartments: "Departamentos", residential: "Viviendas", office: "Oficinas", commercial: "Comercial", retail: "Comercial", house: "Casa", school: "Escuela", university: "Universidad", hospital: "Hospital", church: "Iglesia", hotel: "Hotel", industrial: "Industrial", public: "Público", government: "Gobierno", entertainment: "Espectáculos", civic: "Cívico", education: "Educación", religious: "Religioso", service: "Servicios", transportation: "Transporte" };

export function HojaEdificio({ d, pisosLocal, alturaLocal, piso, irAPiso, terraza, cerrar, titulo, caminando }: {
  d: DatosEdificio | null; pisosLocal?: number; alturaLocal?: number; piso?: number; irAPiso?: (n: number) => void; terraza: (() => void) | null; cerrar: () => void; titulo?: string; caminando?: () => void;
}) {
  const pisos = d?.pisos ?? pisosLocal ?? null, altura = d?.altura ?? alturaLocal ?? null, estimada = !d || d.calidad !== 0;
  const filas: [string, string][] = [];
  if (pisos) filas.push(["Pisos", estimada ? `Unos ${pisos}` : String(pisos)]);
  if (altura) filas.push(["Altura", `${altura.toLocaleString("es-AR", { maximumFractionDigits: altura < 20 ? 1 : 0 })} m${estimada ? " (altura estimada)" : ""}`]);
  if (d?.anio) filas.push(["Año", String(d.anio)]);
  if (d?.arquitecto) filas.push(["Arquitecto", d.arquitecto]);
  if (d?.tipo && TIPOS[d.tipo]) filas.push(["Uso", TIPOS[d.tipo]]);
  if (d?.patrimonio) filas.push(["Patrimonio", "Edificio protegido"]);
  const hayPisos = !!irAPiso && (pisos ?? 1) > 1, cuantos = Math.min(40, pisos ?? 1);
  return (
    <HojaCalle titulo={titulo ?? d?.nombre ?? "Este edificio"} cerrar={cerrar}>
      {filas.length > 0 && <dl className="calle-ficha">{filas.map(([a, b]) => <div key={a}><dt>{a}</dt><dd>{b}</dd></div>)}</dl>}
      {!filas.length && <p className="calle-vacio">No hay datos publicados de este edificio.</p>}
      {estimada && filas.length > 0 && <p className="calle-nota izq">Pisos y altura son estimados. Nombre, año y arquitecto, cuando aparecen, son datos publicados.</p>}
      {caminando && d && <div className="calle-acciones calle-pie-hoja">
        <button className="calle-btn" onClick={caminando}>Ir caminando</button>
        <Link className="calle-btn" href={comoLlegoHref(d, d.nombre ?? "Este edificio")}>Cómo ir</Link>
      </div>}
      {hayPisos && <>
        <h3 className="calle-sec">Ascensor</h3>
        <div className="calle-pisos" role="group" aria-label="Elegir piso">
          <button onClick={() => irAPiso!(0)} aria-current={piso === 0 ? "true" : undefined}>PB</button>
          {Array.from({ length: cuantos - 1 }, (_, i) => i + 1).map((n) => <button key={n} onClick={() => irAPiso!(n)} aria-current={piso === n ? "true" : undefined}>{n}</button>)}
        </div>
        <p className="calle-nota">Los pasillos son ilustrativos: no muestran el edificio real.</p>
      </>}
      {terraza && <button className="calle-btn pri calle-ancho" onClick={terraza}>Subir a la terraza</button>}
      {terraza && <p className="calle-nota">Te lleva a la altura real del techo, con la ciudad real alrededor.</p>}
    </HojaCalle>
  );
}
