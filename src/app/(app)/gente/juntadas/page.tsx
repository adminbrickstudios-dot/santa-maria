"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { sb } from "@/lib/sb";
import { useSesion } from "@/lib/sesion";
import { Avatar } from "@/components/Avatar";
import { Hoja } from "@/components/Hoja";
import { Icono } from "@/components/Icono";
import { Vacio } from "@/components/organizar/Comun";
import { fechaLarga, horaDe } from "@/lib/util";

function Juntadas() {
  const q = useSearchParams(), { perfil, personas, toast, asegurarPersonas } = useSesion();
  const [l, setL] = useState<any[]>([]), [rs, setR] = useState<any[]>([]), [n, setN] = useState(false), [f, setF] = useState<any>({});
  const cargar = useCallback(async () => {
    const { data } = await sb.from("juntadas").select("*").gte("cuando", new Date(Date.now() - 864e5).toISOString()).order("cuando").limit(100);
    setL(data || []);
    const ids = (data || []).map((j: any) => j.id);
    if (ids.length) { const r = await sb.from("juntada_respuestas").select("*").in("juntada_id", ids).limit(1000); setR(r.data || []); asegurarPersonas((r.data || []).map((x: any) => x.perfil_id)); }
  }, [asegurarPersonas]);
  useEffect(() => { cargar(); if (q.get("lugar")) { setF({ lugar: q.get("lugar"), lat: q.get("lat"), lon: q.get("lon") }); setN(true); } else if (q.get("nuevo") === "1") setN(true); }, [cargar, q]);
  async function responder(id: number, estado: string) { await sb.from("juntada_respuestas").upsert({ juntada_id: id, perfil_id: perfil.id, estado }); cargar(); }
  async function crear() {
    if (!f.titulo || !f.cuando) return toast("Poné qué es y cuándo.");
    await sb.from("juntadas").insert({ grupo_id: perfil.grupo_id, creada_por: perfil.id, titulo: f.titulo, lugar_nombre: f.lugar || null, lat: f.lat ? +f.lat : null, lon: f.lon ? +f.lon : null, cuando: new Date(f.cuando).toISOString(), nota: f.nota || null });
    setN(false); setF({}); cargar(); toast("Listo, le avisé al grupo.");
  }
  return <div className="pagina">
    <Link href="/gente" className="btn sec2 chico" style={{ justifySelf: "start" }}><Icono n="volver" />Gente</Link>
    <h2 className="titulo">Juntadas</h2>
    <div className="fila"><button className="btn pri" onClick={() => setN(true)}><Icono n="mas" />Proponer</button><Link className="btn sec2" href="/mapa">Buscar el mejor lugar</Link></div>
    {!l.length && <Vacio emoji="🧉" titulo="No hay nada armado" texto="Proponé un plan. En Mapa, “Dónde juntarnos” te dice qué lugar queda más parejo para todos." />}
    {l.map((j) => { const rr = rs.filter((r) => r.juntada_id === j.id), van = rr.filter((r) => r.estado === "voy"), mio = rr.find((r) => r.perfil_id === perfil.id)?.estado; return <div key={j.id} className="tarjeta">
      <h3 style={{ fontSize: 20 }}>{j.titulo}</h3>
      <p>{fechaLarga(j.cuando)}, {horaDe(j.cuando)}{j.lugar_nombre ? ` · ${j.lugar_nombre}` : ""}</p>
      {j.nota && <p className="expl">{j.nota}</p>}
      <div className="chipera">{[["voy", "Voy"], ["quizas", "Quizás"], ["no", "No puedo"]].map(([k, t]) => <button key={k} className="chip" aria-pressed={mio === k} onClick={() => responder(j.id, k)}>{t}</button>)}</div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>{van.map((r) => <Avatar key={r.perfil_id} p={personas.find((p) => p.id === r.perfil_id)} t={32} />)}<span className="chico" style={{ marginLeft: 6 }}>{van.length} {van.length === 1 ? "va" : "van"}</span></div>
      {j.lat != null && <Link className="btn sec2 chico" href={`/mapa?lat=${j.lat}&lon=${j.lon}&n=${encodeURIComponent(j.lugar_nombre || j.titulo)}`}><Icono n="mapa" />Cómo llego</Link>}
    </div>; })}
    {n && <Hoja titulo="Proponer juntada" cerrar={() => setN(false)}>
      <div className="campo"><label htmlFor="j1">Qué hacemos</label><input id="j1" type="text" placeholder="Ej: Asado en lo de Beltru" value={f.titulo || ""} onChange={(e) => setF({ ...f, titulo: e.target.value })} /></div>
      <div className="campo"><label htmlFor="j2">Dónde</label><input id="j2" type="text" value={f.lugar || ""} onChange={(e) => setF({ ...f, lugar: e.target.value })} /></div>
      <div className="campo"><label htmlFor="j3">Cuándo</label><input id="j3" type="datetime-local" value={f.cuando || ""} onChange={(e) => setF({ ...f, cuando: e.target.value })} /></div>
      <div className="campo"><label htmlFor="j4">Nota (opcional)</label><input id="j4" type="text" value={f.nota || ""} onChange={(e) => setF({ ...f, nota: e.target.value })} /></div>
      <button className="btn pri" onClick={crear}>Avisarle al grupo</button>
    </Hoja>}
  </div>;
}
export default function P() { return <Suspense><Juntadas /></Suspense>; }
