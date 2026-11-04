"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { sb } from "@/lib/sb";
import { useSesion } from "@/lib/sesion";
import { Avatar } from "@/components/Avatar";
import { Icono } from "@/components/Icono";
import { horaDe } from "@/lib/util";

export default function Chat() {
  const { id } = useParams<{ id: string }>();
  const { perfil, personas, recuentos, toast } = useSesion();
  const [ms, setM] = useState<any[]>([]), [c, setC] = useState<any>(null), [t, setT] = useState(""), [env, setEnv] = useState(false);
  const fin = useRef<HTMLDivElement>(null);
  const quien = (i: string) => personas.find((p) => p.id === i);
  useEffect(() => {
    let vivo = true;
    const cargar = async () => {
      const { data } = await sb.from("mensajes").select("*").eq("conversacion_id", id).order("creado_en", { ascending: false }).limit(100);
      if (vivo) setM((data || []).reverse());
      await sb.rpc("marcar_leido", { c: id }); recuentos();
    };
    sb.rpc("mis_conversaciones").then(({ data }: any) => setC((data || []).find((x: any) => x.id === id) || null));
    cargar();
    const ca = sb.channel(`chat-${id}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "mensajes", filter: `conversacion_id=eq.${id}` }, (p: any) => {
      setM((m) => m.some((x) => x.id === p.new.id) ? m : [...m, p.new]); sb.rpc("marcar_leido", { c: id });
    }).subscribe();
    return () => { vivo = false; sb.removeChannel(ca); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  useEffect(() => { fin.current?.scrollIntoView({ block: "end" }); }, [ms.length]);
  async function enviar(e: React.FormEvent) {
    e.preventDefault(); const x = t.trim(); if (!x) return;
    setEnv(true); setT("");
    const { data, error } = await sb.from("mensajes").insert({ conversacion_id: id, autor_id: perfil.id, texto: x }).select().single();
    setEnv(false);
    if (error) { setT(x); toast("No se pudo mandar. Puede que te hayan bloqueado o no tengas conexión."); return; }
    setM((m) => m.some((y) => y.id === data.id) ? m : [...m, data]);
  }
  const titulo = c ? (c.tipo === "grupo" ? c.titulo : c.otro_nombre) : "Mensajes";
  return <div className="chat">
    <div className="chat-cab"><Link className="ico-btn" href="/gente" aria-label="Volver"><Icono n="volver" /></Link>{c?.tipo === "directa" && <Avatar p={{ nombre: c.otro_nombre, color: c.otro_color, avatar_url: c.otro_avatar }} t={38} />}{c?.otro_id ? <Link href={`/gente?persona=${c.otro_id}`}><b>{titulo}</b></Link> : <b>{titulo}</b>}</div>
    <div className="chat-lista">
      {!ms.length && <p className="vacio">Mandá el primer mensaje. Solo lo ven quienes están en esta charla.</p>}
      {ms.map((m) => { const mia = m.autor_id === perfil.id; return <div key={m.id} className={`burbuja ${mia ? "mia" : ""}`}>{c?.tipo === "grupo" && !mia && <span className="quien">{quien(m.autor_id)?.nombre}</span>}{m.texto}{m.adjunto?.lat != null && <Link href={`/mapa?lat=${m.adjunto.lat}&lon=${m.adjunto.lon}&n=${encodeURIComponent(m.adjunto.nombre || "Destino")}`} style={{ display: "block", fontWeight: 800, textDecoration: "underline", marginTop: 4 }}>Ver cómo llego</Link>}<small>{horaDe(m.creado_en)}</small></div>; })}
      <div ref={fin} />
    </div>
    <form className="chat-pie" onSubmit={enviar}><input type="text" aria-label="Mensaje" placeholder="Escribí un mensaje" maxLength={4000} value={t} onChange={(e) => setT(e.target.value)} /><button className="btn pri" disabled={env || !t.trim()} aria-label="Enviar"><Icono n="enviar" /></button></form>
  </div>;
}
