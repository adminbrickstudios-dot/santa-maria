"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { sb } from "@/lib/sb";
import { useSesion } from "@/lib/sesion";
import { Avatar } from "./Avatar";
import { Hoja } from "./Hoja";

/* Solicitudes de contacto que te llegaron. Si no hay ninguna, no muestra nada. */
export function Solicitudes({ alCambiar }: { alCambiar?: () => void }) {
  const { toast, recuentos } = useSesion(), r = useRouter();
  const [l, setL] = useState<any[]>([]);
  const cargar = useCallback(async () => { const { data } = await sb.rpc("mis_solicitudes"); setL(data || []); }, []);
  useEffect(() => { cargar(); }, [cargar]);
  async function responder(s: any, si: boolean) {
    setL((x) => x.filter((y) => y.id !== s.id));
    const { data, error } = await sb.rpc("responder_contacto", { otro: s.id, p_acepto: si });
    if (error) { toast("No pude responder. Probá de nuevo."); return cargar(); }
    alCambiar?.(); recuentos();
    if (si && data) r.push(`/gente/chat/${data}`);
    else if (!si) toast("Listo. No le avisamos.");
  }
  if (!l.length) return null;
  return <>
    <h3 className="sec">Quieren escribirte</h3>
    {l.map((s) => <div key={s.id} className="tarjeta">
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}><Avatar p={s} t={52} /><div style={{ flex: 1, minWidth: 0 }}><b style={{ fontSize: 19 }}>{s.nombre}</b><p className="chico">@{s.usuario}{s.carrera_texto ? ` · ${s.carrera_texto}` : ""}</p></div></div>
      {s.mensaje && <p>{s.mensaje}</p>}
      <div className="fila"><button className="btn pri" onClick={() => responder(s, true)}>Aceptar</button><button className="btn sec2" onClick={() => responder(s, false)}>Rechazar</button></div>
    </div>)}
  </>;
}

/* Bloquear y denunciar, iguales en el perfil y en el chat */
const MOTIVOS: [string, string][] = [["acoso", "Me molesta o me acosa"], ["spam", "Manda spam o publicidad"], ["contenido", "Contenido ofensivo"], ["suplantacion", "Se hace pasar por otra persona"], ["otro", "Otra cosa"]];
export function Denunciar({ persona, cerrar }: { persona: { id: string; nombre: string }; cerrar: () => void }) {
  const { toast } = useSesion();
  const [motivo, setMotivo] = useState(""), [detalle, setDetalle] = useState(""), [bloquear, setBloquear] = useState(true), [env, setEnv] = useState(false);
  async function mandar() {
    if (!motivo) return toast("Elegí un motivo.");
    setEnv(true);
    const { data, error } = await sb.rpc("denunciar", { otro: persona.id, p_motivo: motivo, p_detalle: detalle.trim() || null, p_bloquear: bloquear });
    setEnv(false);
    if (error || data === "no_valido") return toast("No pude mandar la denuncia.");
    if (data === "muchas") return toast("Mandaste muchas denuncias hoy. Probá más tarde.");
    toast("Gracias. La va a revisar quien administra."); cerrar();
  }
  return <Hoja titulo={`Denunciar a ${persona.nombre}`} cerrar={cerrar}>
    <p className="expl">No se entera quién la hizo. El admin no puede leer tus mensajes: contá lo que pasó acá.</p>
    <div className="chipera">{MOTIVOS.map(([k, n]) => <button key={k} className="chip" aria-pressed={motivo === k} onClick={() => setMotivo(k)}>{n}</button>)}</div>
    <div className="campo"><label htmlFor="dn1">Qué pasó (opcional)</label><textarea id="dn1" maxLength={500} value={detalle} onChange={(e) => setDetalle(e.target.value)} /></div>
    <button className="chip" role="switch" aria-checked={bloquear} aria-pressed={bloquear} onClick={() => setBloquear(!bloquear)}>También bloquear</button>
    <button className="btn pri" disabled={env} onClick={mandar}>Mandar denuncia</button>
  </Hoja>;
}

/* Fila con Bloquear o Desbloquear y Denunciar */
export function Moderar({ persona, alCambiar }: { persona: { id: string; nombre: string }; alCambiar?: () => void }) {
  const { perfil, toast } = useSesion();
  const [bloq, setBloq] = useState(false), [den, setDen] = useState(false);
  useEffect(() => { sb.from("bloqueos").select("bloqueado_id").eq("bloqueado_id", persona.id).then(({ data }: any) => setBloq(!!data?.length)); }, [persona.id]);
  async function cambiar() {
    const { error } = bloq ? await sb.from("bloqueos").delete().eq("bloqueado_id", persona.id).eq("perfil_id", perfil.id) : await sb.from("bloqueos").upsert({ perfil_id: perfil.id, bloqueado_id: persona.id });
    if (error) return toast("No pude hacerlo. Probá de nuevo.");
    toast(bloq ? `Desbloqueaste a ${persona.nombre}.` : `Bloqueaste a ${persona.nombre}. Ya no puede escribirte.`);
    setBloq(!bloq); alCambiar?.();
  }
  return <>
    <div className="fila"><button className="btn mal chico" onClick={cambiar}>{bloq ? "Desbloquear" : "Bloquear"}</button><button className="btn mal chico" onClick={() => setDen(true)}>Denunciar</button></div>
    {den && <Denunciar persona={persona} cerrar={() => setDen(false)} />}
  </>;
}
