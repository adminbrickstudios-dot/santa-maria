"use client";
import { useEffect, useState } from "react";
import { MARCA, MUNDOS } from "@/lib/marca";
import { MESES } from "@/lib/util";
import { DibuBilletera, DibuCalendario, DibuLibro, DibuMapa } from "./Animados";

/* La fecha sale recién en el celular: el HTML se genera en el build y ahí sería la del día que se publicó */
function Calendario() {
  const [h, setH] = useState<Date | null>(null);
  useEffect(() => { setH(new Date()); }, []);
  return <DibuCalendario dia={h ? h.getDate() : ""} mes={h ? MESES[h.getMonth()].toUpperCase() : ""} />;
}
const DIBU = [<DibuLibro key="f" />, <Calendario key="a" />, <DibuMapa key="m" />, <DibuBilletera key="h" />];

/* FAMA son cuatro letras y cuatro mundos: la portada de la app es esa idea, sin adornos */
export function Cuatro() {
  return <div className="fa-cuatro">
    <h1 className="solo-lector">{MARCA.nombre}: {MARCA.sigla}</h1>
    {MUNDOS.map((m, i) => <div key={i} className={`fa-c ${m.clase}`} aria-hidden="true">{DIBU[i]}<b>{m.letra}</b><span>{m.nombre}</span></div>)}
  </div>;
}

/* Los pasos de la bienvenida: una letra que se prende por paso */
export function Pasos({ paso }: { paso: number }) {
  return <div className="fa-pasos" role="img" aria-label={`Paso ${paso + 1} de ${MUNDOS.length}`}>
    {MUNDOS.map((m, i) => <span key={i} className={`${m.clase} ${i <= paso ? "si" : ""}`}>{m.letra}</span>)}
  </div>;
}
