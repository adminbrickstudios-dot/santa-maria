"use client";
/* Modo calle: /calle?lat=..&lon=.. a pantalla completa. Three.js se baja solo si entrás acá. */
import dynamic from "next/dynamic";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MandarA } from "@/components/MandarA";
import { sb } from "@/lib/sb";
import { useSesion } from "@/lib/sesion";
import "@/app/calle.css";

/* Mientras baja el código ya tapa todo: si no, se ven los botones de la app y se tocan sin querer */
const CalleVista = dynamic(() => import("@/components/calle/CalleVista"), { ssr: false, loading: () => <div className="calle" /> });
const LAT = -34.5953, LON = -58.3938; // Av. Callao y Santa Fe

function num(v: string | null, min: number, max: number, def: number) {
  const n = v == null || v === "" ? NaN : Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : def;
}

function Calle() {
  const q = useSearchParams(), s = useSesion();
  const hora = q.get("hora");
  const [envio, setEnvio] = useState<{ texto: string; adjunto: { nombre: string; lat: number; lon: number } } | null>(null);
  const prefs = s.perfil.preferencias ?? {};
  return <>
    <CalleVista lat={num(q.get("lat"), -90, 90, LAT)} lon={num(q.get("lon"), -180, 180, LON)} puntoPedido={q.has("lat") && q.has("lon")} hora={hora ? num(hora, 0, 24, 12) : null}
      calidadFija={process.env.NEXT_PUBLIC_DEMO && q.has("cal") ? num(q.get("cal"), 0, 3, 1) : undefined}
      lugares={prefs.calle?.lugares} mandar={setEnvio}
      guardarLugares={(l) => { void sb.from("perfiles").update({ preferencias: { ...prefs, calle: { ...prefs.calle, lugares: l } } }).eq("id", s.perfil.id); }} />
    {envio && <MandarA texto={envio.texto} adjunto={envio.adjunto} cerrar={() => setEnvio(null)} />}
  </>;
}

export default function P() {
  return <Suspense><Calle /></Suspense>;
}
