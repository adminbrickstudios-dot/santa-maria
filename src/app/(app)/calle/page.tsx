"use client";
/* Modo calle: /calle?lat=..&lon=.. a pantalla completa. Three.js se baja solo si entrás acá. */
import dynamic from "next/dynamic";
import { Suspense, useCallback, useMemo, useState } from "react";
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
  const [envio, setEnvio] = useState<{ texto: string; adjunto: { nombre: string; lat: number; lon: number; rumbo?: number } } | null>(null);
  /* Se escribe sobre preferencias, que solo puede leer su dueño (RLS de perfiles) */
  function guardarMemoria(cambio: Record<string, unknown>) {
    const p = s.perfil, preferencias = { ...p.preferencias, calle: { ...p.preferencias?.calle, ...cambio } };
    p.preferencias = preferencias;
    void sb.from("perfiles").update({ preferencias }).eq("id", p.id);
  }
  const casa = useMemo(() => (s.perfil.casa_lat != null ? { nombre: "Tu casa", lat: s.perfil.casa_lat, lon: s.perfil.casa_lon, direccion: s.perfil.casa_barrio ?? undefined } : null), [s.perfil]);
  const facu = useMemo(() => { const u = s.lugares.find((x) => x.destacado); return u?.lat != null ? { nombre: u.nombre, lat: u.lat, lon: u.lon, direccion: u.descripcion ?? undefined } : null; }, [s.lugares]);
  /* personas_del_grupo solo devuelve lat y lon de quien eligió mostrar su casa exacta */
  const amigos = useMemo(() => s.personas.filter((p) => p.id !== s.perfil.id && p.lat != null && p.lon != null).map((p) => ({ id: p.id, nombre: p.nombre, lat: p.lat, lon: p.lon })), [s.personas, s.perfil.id]);
  const cargarTemas = useCallback(async () => {
    const [{ data: se }, { data: it }] = await Promise.all([
      sb.from("secciones_guia").select("slug,nombre"),
      sb.from("guia_items").select("id,titulo,bajada,seccion,direccion,lat,lon").not("lat", "is", null).limit(400),
    ]);
    const lat0 = casa?.lat ?? LAT, lon0 = casa?.lon ?? LON, cerca = (i: { lat: number; lon: number }) => Math.hypot((i.lat - lat0) * 111320, (i.lon - lon0) * 91700) < 6000;
    return ((se ?? []) as { slug: string; nombre: string }[]).map((x) => ({
      id: x.slug, nombre: x.nombre,
      paradas: ((it ?? []) as { titulo: string; bajada: string | null; seccion: string; direccion: string | null; lat: number; lon: number }[]).filter((i) => i.seccion === x.slug && cerca(i)).slice(0, 6).map((i) => ({ nombre: i.titulo, lat: i.lat, lon: i.lon, direccion: i.direccion ?? undefined, bajada: i.bajada ?? undefined })),
    })).filter((t) => t.paradas.length >= 2);
  }, [casa]);
  /* Ubicación compartida a propósito. Si la tabla todavía no existe, esa parte no aparece */
  const ubicacion = useMemo(() => ({
    activos: async () => {
      const { data, error } = await sb.from("ubicaciones_temporales").select("perfil_id,lat,lon,hasta").gte("hasta", new Date().toISOString());
      if (error) return null;
      return ((data ?? []) as { perfil_id: string; lat: number; lon: number; hasta: string }[]).filter((u) => u.perfil_id !== s.perfil.id).map((u) => ({ id: u.perfil_id, nombre: s.personas.find((p) => p.id === u.perfil_id)?.nombre ?? "Alguien del grupo", lat: u.lat, lon: u.lon, hasta: u.hasta }));
    },
    enviar: async (p: { lat: number; lon: number }, minutos: number) => {
      const { error } = await sb.from("ubicaciones_temporales").upsert({ perfil_id: s.perfil.id, grupo_id: s.perfil.grupo_id, lat: p.lat, lon: p.lon, hasta: new Date(Date.now() + minutos * 60000).toISOString(), actualizado: new Date().toISOString() });
      return !error;
    },
    apagar: async () => { await sb.from("ubicaciones_temporales").delete().eq("perfil_id", s.perfil.id); },
  }), [s.perfil.id, s.perfil.grupo_id, s.personas]);
  const mem = s.perfil.preferencias?.calle;
  return <>
    <CalleVista lat={num(q.get("lat"), -90, 90, LAT)} lon={num(q.get("lon"), -180, 180, LON)} puntoPedido={q.has("lat") && q.has("lon")} hora={hora ? num(hora, 0, 24, 12) : null}
      calidadFija={process.env.NEXT_PUBLIC_DEMO && q.has("cal") ? num(q.get("cal"), 0, 3, 1) : undefined} rumboInicial={q.has("rumbo") ? num(q.get("rumbo"), 0, 360, 0) : null}
      lugares={mem?.lugares} guardarLugares={(l) => guardarMemoria({ lugares: l })} visitados={mem?.visitados} guardarVisitados={(l) => guardarMemoria({ visitados: l })}
      alMotor={process.env.NEXT_PUBLIC_DEMO ? (m) => { (window as unknown as { __motor: unknown }).__motor = m; } : undefined}
      mandar={setEnvio} casa={casa} facu={facu} amigos={amigos} cargarTemas={cargarTemas} ubicacion={ubicacion} />
    {envio && <MandarA texto={envio.texto} adjunto={envio.adjunto} cerrar={() => setEnvio(null)} />}
  </>;
}

export default function P() {
  return <Suspense><Calle /></Suspense>;
}
