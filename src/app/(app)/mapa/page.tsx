"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Suspense, useEffect, useRef, useState } from "react";
import { MandarA } from "@/components/MandarA";
import { useRouter, useSearchParams } from "next/navigation";
import { useSesion } from "@/lib/sesion";
import { sb } from "@/lib/sb";
import { montarMapa, desmontarMapa, datosDeApp } from "@/lib/mapa/vista";
import "maplibre-gl/dist/maplibre-gl.css";
import "./mapa.css";

/* Si la migración 0010 todavía no se aplicó, la tabla no existe: el mapa sigue andando sin esa función. */
const noExiste = (e: any) => e && ["42P01", "PGRST205", "PGRST106"].includes(e.code);

function Mapa() {
  const ref = useRef<HTMLDivElement>(null), s = useSesion(), q = useSearchParams(), r = useRouter();
  const [mandar, setMandar] = useState<any>(null);
  useEffect(() => {
    if (!ref.current) return;
    let vivo = true;
    const yo = s.perfil.id, la = q.get("lat"), lo = q.get("lon");
    /* El mapa se monta ya: lo que viene de la base llega después y no lo frena */
    montarMapa(ref.current, {
      yoId: yo, personas: s.personas, lugares: s.lugares, aportes: [], guia: [], aviso: s.toast, memoria: s.perfil.preferencias?.mapa || null,
      guardarMemoria: (m: any) => sb.from("perfiles").update({ preferencias: { ...s.perfil.preferencias, mapa: m } }).eq("id", yo),
      compartir: (d: any) => setMandar(d),
      navegar: (u: string) => r.push(u),
      tab: q.get("tab"), q: q.get("q"), destino: la && lo ? { lat: +la, lon: +lo, nombre: q.get("n") || "Destino" } : null, soloVer: q.get("ver") === "1",
      aportar: async (a: any) => { await sb.from("aportes").insert({ ...a, grupo_id: s.perfil.grupo_id, autor_id: yo }); s.toast("Listo, ya lo ve el grupo."); },
      proponerJuntada: (d: any) => r.push(`/gente/juntadas?lugar=${encodeURIComponent(d.lugar)}&lat=${d.lat}&lon=${d.lon}`),
      favorito: async (f: any, on: boolean) => {
        if (on) await sb.from("favoritos").upsert({ perfil_id: yo, ...f }, { onConflict: "perfil_id,lat,lon" });
        else await sb.from("favoritos").delete().eq("perfil_id", yo).eq("lat", f.lat).eq("lon", f.lon);
      },
      listas: {
        guardar: (l: any) => sb.from("mapa_listas").upsert({ id: l.id, perfil_id: yo, nombre: l.nombre, lugares: l.lugares, actualizado_en: new Date().toISOString() }).then(() => {}),
        borrar: (id: string) => sb.from("mapa_listas").delete().eq("id", id).then(() => {}),
      },
      vivo: {
        leer: async () => {
          const { data, error } = await sb.from("ubicaciones_vivas").select("perfil_id,lat,lon,rumbo,hasta,actualizado_en").gte("hasta", new Date().toISOString());
          if (noExiste(error)) return null;
          return error ? [] : data || [];
        },
        publicar: (u: any) => sb.from("ubicaciones_vivas").upsert({ perfil_id: yo, grupo_id: s.perfil.grupo_id, ...u, actualizado_en: new Date().toISOString() }).then(() => {}),
        parar: () => sb.from("ubicaciones_vivas").delete().eq("perfil_id", yo).then(() => {}),
      },
    });
    const seguro = async (f: PromiseLike<any>) => { try { const { data, error } = await f; return error ? null : data; } catch { return null; } };
    (async () => {
      const [aportes, guia, favoritos, listas] = await Promise.all([
        seguro(sb.from("aportes").select("*").in("tipo", ["atajo", "lugar"]).limit(300)),
        seguro(sb.from("guia_items").select("id,titulo,seccion,dato,lat,lon,bajada,cuerpo,fuente_nombre,fuente_url").limit(400)),
        seguro(sb.from("favoritos").select("nombre,lat,lon").eq("perfil_id", yo).limit(200)),
        seguro(sb.from("mapa_listas").select("id,nombre,lugares").eq("perfil_id", yo).limit(100)),
      ]);
      if (vivo) datosDeApp({ aportes, guia, favoritos, listas });
    })();
    return () => { vivo = false; desmontarMapa(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <><div ref={ref} style={{ height: "100%" }} />{mandar && <MandarA texto={mandar.texto} adjunto={mandar.adjunto} cerrar={() => setMandar(null)} />}</>;
}
export default function P() { return <Suspense><Mapa /></Suspense>; }
