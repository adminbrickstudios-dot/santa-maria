"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from "react";
import { sb } from "@/lib/sb";
import { useSesion } from "@/lib/sesion";
import { Avatar } from "@/components/Avatar";
import { Icono } from "@/components/Icono";

const PANT: [string, string][] = [["mapa", "Mapa"], ["guia", "Guía"], ["facu", "Facu"], ["gente", "Gente"], ["cuentas", "Cuentas compartidas"], ["apuntes", "Apuntes"], ["carreras", "Carreras"]];
export default function Admin() {
  const { perfil, grupo, recargar, toast } = useSesion();
  const [l, setL] = useState<any[]>([]), [mails, setM] = useState<Record<string, string>>({});
  const cargar = useCallback(async () => { const { data } = await sb.rpc("admin_cuentas"); setL(data || []); }, []);
  useEffect(() => { if (perfil.rol === "admin") cargar(); }, [perfil.rol, cargar]);
  if (perfil.rol !== "admin") return <div className="pagina"><p className="expl">Esta pantalla es para quien administra el grupo.</p></div>;
  async function pantalla(k: string) { const p = { ...grupo.pantallas, [k]: grupo.pantallas?.[k] === false }; await sb.from("grupos").update({ pantallas: p }).eq("id", grupo.id); recargar(); }
  return <div className="pagina">
    <h2 className="titulo">Administrar</h2>
    <div className="tarjeta"><h3>Código para sumarse a {grupo.nombre}</h3><p className="titulo-m" style={{ userSelect: "all" }}>{grupo.codigo_invitacion}</p><p className="expl">Quien crea una cuenta con este código entra a tu grupo.</p></div>
    <h3 className="sec">Pantallas del grupo</h3>
    <div className="lista">{PANT.map(([k, n]) => { const on = grupo.pantallas?.[k] !== false; return <button key={k} className="item" role="switch" aria-checked={on} onClick={() => pantalla(k)}><span className="q"><b>{n}</b></span><span className="ic" style={{ color: on ? "var(--ok)" : "var(--tinta3)" }}><Icono n={on ? "ok" : "x"} /></span></button>; })}</div>
    <h3 className="sec">Cuentas</h3>
    <p className="expl">No ves contraseñas, casas ni mensajes. Si alguien se olvida la contraseña, volvela a la inicial y la app le pide una nueva.</p>
    {l.map((u) => <div key={u.id} className="tarjeta">
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}><Avatar p={u} t={40} /><div style={{ flex: 1, minWidth: 0 }}><b>{u.nombre}</b><p className="chico">@{u.usuario} · {u.debe_cambiar_clave ? "todavía no entró" : "ya eligió contraseña"}</p></div></div>
      <div className="campo"><label htmlFor={`m${u.id}`}>Mail</label><input id={`m${u.id}`} type="email" value={mails[u.id] ?? u.email_contacto ?? ""} onChange={(e) => setM({ ...mails, [u.id]: e.target.value })} /></div>
      <div className="fila"><button className="btn sec2 chico" onClick={async () => { await sb.rpc("admin_poner_mail", { p: u.id, mail: mails[u.id] || "" }); toast("Mail guardado."); cargar(); }}>Guardar mail</button><button className="btn sec2 chico" onClick={async () => { await sb.rpc("admin_resetear_clave", { p: u.id }); toast(`La contraseña de ${u.nombre} volvió a la inicial.`); cargar(); }}>Resetear contraseña</button></div>
    </div>)}
  </div>;
}
