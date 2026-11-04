"use client";
/* Modo calle: /calle?lat=..&lon=.. a pantalla completa. Three.js se baja solo si entrás acá. */
import dynamic from "next/dynamic";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import "@/app/calle.css";

const CalleVista = dynamic(() => import("@/components/calle/CalleVista"), { ssr: false });
const LAT = -34.5953, LON = -58.3938; // Av. Callao y Santa Fe

function num(v: string | null, min: number, max: number, def: number) {
  const n = v == null || v === "" ? NaN : Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : def;
}

function Calle() {
  const q = useSearchParams();
  const hora = q.get("hora");
  return <CalleVista lat={num(q.get("lat"), -90, 90, LAT)} lon={num(q.get("lon"), -180, 180, LON)} hora={hora ? num(hora, 0, 24, 12) : null} />;
}

export default function P() {
  return <Suspense><Calle /></Suspense>;
}
