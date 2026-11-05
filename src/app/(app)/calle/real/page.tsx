"use client";
/* Vista fotorrealista de Google, separada de la ciudad propia. Three.js se baja solo si entrás acá. */
import dynamic from "next/dynamic";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import "./real.css";

const Google3D = dynamic(() => import("@/components/Google3D"), { ssr: false });
const LAT = -34.5953, LON = -58.3938;

function Vista() {
  const q = useSearchParams();
  const lat = Number(q.get("lat")), lon = Number(q.get("lon"));
  return <Google3D lat={Number.isFinite(lat) && lat ? lat : LAT} lon={Number.isFinite(lon) && lon ? lon : LON} />;
}

export default function Pagina() {
  return <Suspense><Vista /></Suspense>;
}
