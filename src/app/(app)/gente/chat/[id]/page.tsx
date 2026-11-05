"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { sb } from "@/lib/sb";
import { useSesion } from "@/lib/sesion";
import { Avatar } from "@/components/Avatar";
import { Moderar } from "@/components/Contacto";
import { Hoja } from "@/components/Hoja";
import { Icono } from "@/components/Icono";
import { horaDe } from "@/lib/util";

export default function Chat() {
  const { id } = useParams<{ id: string }>();
  const { perfil, personas, recuentos, toast, asegurarPersonas } = useSesion();
  const [ms, setM] = useState<any[]>([]), [c, setC] = useState<any>(null), [t, setT] = useState(""), [env, setEnv] = useState(false), [hayMas, setHayMas] = useState(false), [mod, setMod] = useState(false);
  const fin = useRef<HTMLDivElement>(null), alFinal = useRef(true);
  const POR_TANDA = 50;
  async function anteriores() {
    if (!ms.length) return;
    const { data } = await sb.from("mensajes").select("id,autor_id,texto,adjunto,creado_en").eq("conversacion_id", id).lt("creado_en", ms[0].creado_en).order("creado_en", { ascending: false }).limit(POR_TANDA);
    alFinal.current = false;
    setHayMas((data || []).length === POR_TANDA);
    setM((m) => [...(data || []).reverse(), ...m]);
  }
  const quien = (i: string) => personas.find((p) => p.id === i);
  useEffect(() => {
    let vivo = true;
    const cargar = async () => {
      const { data } = await sb.from("mensajes").select("id,autor_id,texto,adjunto,creado_en").eq("conversacion_id", id).order("creado_en", { ascending: false }).limit(POR_TANDA);
      if (vivo) { setM((data || []).reverse()); setHayMas((data || []).length === POR_TANDA); }
      await sb.rpc("marcar_leido", { c: id }); recuentos();
    };
    sb.rpc("mis_conversaciones", { p_limite: 1, p_id: id }).then(({ data }: any) => setC(data?.[0] || null));
    cargar();
    /* Marcar leído como mucho cada 5 segundos, aunque lleguen muchos mensajes */
    let espera: any = null;
    const leido = () => { if (!espera) espera = setTimeout(() => { espera = null; sb.rpc("marcar_leido", { c: id }); }, 5000); };
    const ca = sb.channel(`chat-${id}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "mensajes", filter: `conversacion_id=eq.${id}` }, (p: any) => {
      alFinal.current = true;
      setM((m) => m.some((x) => x.id === p.new.id) ? m : [...m, p.new]); leido();
    }).subscribe();
    return () => { vivo = false; clearTimeout(espera); sb.removeChannel(ca); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  useEffect(() => { if (alFinal.current) fin.current?.scrollIntoView({ block: "end" }); }, [ms.length]);
  useEffect(() => { asegurarPersonas(ms.map((m) => m.autor_id)); }, [ms, asegurarPersonas]);
  async function enviar(e: React.FormEvent) {
    e.preventDefault(); const x = t.trim(); if (!x) return;
    setEnv(true); setT(""); alFinal.current = true;
    const { data, error } = await sb.from("mensajes").insert({ conversacion_id: id, autor_id: perfil.id, texto: x }).select().single();
    setEnv(false);
    if (error) { setT(x); toast(error.code === "PT429" ? "Mandaste muchos seguidos. Esperá un minuto." : error.code === "PT403" ? "Todavía no aceptó tu contacto." : "No se pudo mandar. Puede que te hayan bloqueado o no tengas conexión."); return; }
    setM((m) => m.some((y) => y.id === data.id) ? m : [...m, data]);
  }
  const titulo = c ? (c.tipo === "grupo" ? c.titulo : c.otro_nombre) : "Mensajes";
  return <div className="chat">
    <div className="chat-cab"><Link className="ico-btn" href="/gente" aria-label="Volver"><Icono n="volver" /></Link>{c?.tipo === "directa" && <Avatar p={{ nombre: c.otro_nombre, color: c.otro_color, avatar_url: c.otro_avatar }} t={38} />}{c?.otro_id ? <Link href={`/gente?persona=${c.otro_id}`}><b>{titulo}</b></Link> : <b>{titulo}</b>}{c?.otro_id && <button className="ico-btn" style={{ marginLeft: "auto" }} aria-label="Bloquear o denunciar" onClick={() => setMod(true)}><Icono n="ajustes" /></button>}</div>
    {mod && c?.otro_id && <Hoja titulo={c.otro_nombre} cerrar={() => setMod(false)}><Moderar persona={{ id: c.otro_id, nombre: c.otro_nombre }} /></Hoja>}
    <div className="chat-lista">
      {hayMas && <button className="btn sec2 chico" style={{ justifySelf: "center" }} onClick={anteriores}>Ver anteriores</button>}
      {!ms.length && <p className="vacio">Mandá el primer mensaje. Solo lo ven quienes están en esta charla.</p>}
      {ms.map((m) => { const mia = m.autor_id === perfil.id; return <div key={m.id} className={`burbuja ${mia ? "mia" : ""}`}>{c?.tipo === "grupo" && !mia && <span className="quien">{quien(m.autor_id)?.nombre}</span>}{m.texto}{m.adjunto?.lat != null && <Link href={`/mapa?lat=${m.adjunto.lat}&lon=${m.adjunto.lon}&n=${encodeURIComponent(m.adjunto.nombre || "Destino")}`} style={{ display: "block", fontWeight: 800, textDecoration: "underline", marginTop: 4 }}>Ver cómo llego</Link>}<small>{horaDe(m.creado_en)}</small></div>; })}
      <div ref={fin} />
    </div>
    <form className="chat-pie" onSubmit={enviar}><input type="text" aria-label="Mensaje" placeholder="Escribí un mensaje" maxLength={4000} value={t} onChange={(e) => setT(e.target.value)} /><button className="btn pri" disabled={env || !t.trim()} aria-label="Enviar"><Icono n="enviar" /></button></form>
  </div>;
}
