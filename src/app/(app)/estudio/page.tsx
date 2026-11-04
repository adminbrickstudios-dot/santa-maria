"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import "@/app/organizar.css";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { sb } from "@/lib/sb";
import { Foco } from "@/components/estudio/Foco";
import { Tarjetas } from "@/components/estudio/Tarjetas";
import { Faltas } from "@/components/estudio/Faltas";
import { Notas } from "@/components/estudio/Notas";
import { Carrera } from "@/components/estudio/Carrera";

const V = [["foco", "Foco"], ["tarjetas", "Tarjetas"], ["faltas", "Faltas"], ["notas", "Notas"], ["carrera", "Carrera"]];

function Estudio() {
  const q = useSearchParams();
  const [v, setV] = useState(V.some(([k]) => k === q.get("v")) ? q.get("v")! : "foco");
  const [mats, setM] = useState<any[]>([]), [cargado, setC] = useState(false);
  const cargar = useCallback(async () => {
    const { data } = await sb.from("materias").select("*").order("creado_en");
    setM(data || []); setC(true);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  return <div className="pagina pg-estudio">
    <h2 className="titulo">Estudio</h2>
    <div className="segs or-segs" role="tablist">{V.map(([k, n]) => <button key={k} className="seg" role="tab" aria-selected={v === k} onClick={() => setV(k)}>{n}</button>)}</div>
    {v === "foco" && <Foco materias={mats} />}
    {v === "tarjetas" && <Tarjetas materias={mats} />}
    {v === "faltas" && cargado && <Faltas materias={mats} cambio={cargar} irACarrera={() => setV("carrera")} />}
    {v === "notas" && cargado && <Notas materias={mats} irACarrera={() => setV("carrera")} />}
    {v === "carrera" && cargado && <Carrera materias={mats} cambio={cargar} />}
  </div>;
}
export default function P() { return <Suspense><Estudio /></Suspense>; }
