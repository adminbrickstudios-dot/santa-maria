"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Suspense, useEffect, useRef, useState } from "react";
import { MandarA } from "@/components/MandarA";
import { useRouter, useSearchParams } from "next/navigation";
import { useSesion } from "@/lib/sesion";
import { sb } from "@/lib/sb";
import { montarMapa, desmontarMapa } from "@/lib/mapa/vista";
import "maplibre-gl/dist/maplibre-gl.css";

function Mapa() {
  const ref = useRef<HTMLDivElement>(null), s = useSesion(), q = useSearchParams(), r = useRouter();
  const [mandar, setMandar] = useState<any>(null);
  useEffect(() => {
    let vivo = true;
    (async () => {
      const [{ data: aportes }, { data: guia }] = await Promise.all([
        sb.from("aportes").select("*").in("tipo", ["atajo", "lugar"]).limit(300),
        sb.from("guia_items").select("id,titulo,seccion,dato,lat,lon,bajada").not("lat", "is", null).limit(400),
      ]);
      if (!vivo || !ref.current) return;
      const la = q.get("lat"), lo = q.get("lon");
      montarMapa(ref.current, {
        yoId: s.perfil.id, personas: s.personas, lugares: s.lugares, aportes: aportes || [], guia: guia || [], aviso: s.toast, memoria: s.perfil.preferencias?.mapa || null,
        guardarMemoria: (m: any) => sb.from("perfiles").update({ preferencias: { ...s.perfil.preferencias, mapa: m } }).eq("id", s.perfil.id),
        compartir: (d: any) => setMandar(d),
        destino: la && lo ? { lat: +la, lon: +lo, nombre: q.get("n") || "Destino" } : null, soloVer: q.get("ver") === "1",
        aportar: async (a: any) => { await sb.from("aportes").insert({ ...a, grupo_id: s.perfil.grupo_id, autor_id: s.perfil.id }); s.toast("Listo, ya lo ve el grupo."); },
        proponerJuntada: (d: any) => r.push(`/gente/juntadas?lugar=${encodeURIComponent(d.lugar)}&lat=${d.lat}&lon=${d.lon}`),
      });
    })();
    return () => { vivo = false; desmontarMapa(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <><div ref={ref} style={{ height: "100%" }} />{mandar && <MandarA texto={mandar.texto} adjunto={mandar.adjunto} cerrar={() => setMandar(null)} />}</>;
}
export default function P() { return <Suspense><Mapa /></Suspense>; }
