"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { sb } from "@/lib/sb";
import { useSesion } from "@/lib/sesion";
import { Icono } from "@/components/Icono";
import { Vacio } from "@/components/organizar/Comun";
import { activarPush, esIOS, estaInstalada, pushSoportado } from "@/lib/push";
import { cuandoRelativo } from "@/lib/util";
import { Solicitudes } from "@/components/Contacto";

const TIPOS: [string, string, string][] = [["mensajes", "Mensajes", "Cuando alguien te escribe"], ["juntadas", "Juntadas", "Cuando proponen una"], ["avisos", "Avisos del grupo", "Salidas, pedidos y novedades"], ["agenda", "Agenda", "Recordatorios, parciales y qué tenés hoy"], ["plata", "Billetera", "Consejos, fijos, presupuesto y cierre de mes"], ["descuentos", "Descuentos", "Promos del día"]];
function Notif() {
  const q = useSearchParams(), { perfil, recargar, recuentos, toast } = useSesion();
  const [l, setL] = useState<any[]>([]), [hayMas, setHayMas] = useState(false), [est, setE] = useState<string>("default"), [n, setN] = useState<any>({ agenda: true, plata: true, ...(perfil.notif || {}) });
  useEffect(() => {
    sb.from("notificaciones").select("id,titulo,cuerpo,enlace,creado_en").order("creado_en", { ascending: false }).limit(50).then(async ({ data }: any) => {
      setL(data || []); setHayMas((data || []).length === 50);
      await sb.from("notificaciones").update({ leida: true }).eq("leida", false).eq("perfil_id", perfil.id); recuentos();
    });
    if ("Notification" in window) setE(Notification.permission); else setE("no");
  }, [perfil.id, recuentos]);
  async function anteriores() {
    const { data } = await sb.from("notificaciones").select("id,titulo,cuerpo,enlace,creado_en").lt("creado_en", l[l.length - 1].creado_en).order("creado_en", { ascending: false }).limit(50);
    setL((x) => [...x, ...(data || [])]); setHayMas((data || []).length === 50);
  }
  async function activar() {
    const r = await activarPush(perfil.id);
    if (r === "ok") { setE("granted"); toast("Listo, te van a llegar al celular."); }
    else if (r === "denegado") { setE("denied"); toast("Los bloqueaste. Se activan desde los permisos del navegador."); }
    else if (r === "instalar") location.href = "/instalar";
    else toast("Tu navegador no pudo activarlas.");
  }
  async function cambiar(k: string) { const x = { ...n, [k]: !n[k] }; setN(x); await sb.from("perfiles").update({ notif: x }).eq("id", perfil.id); recargar(); }
  return <div className="pagina">
    <h2 className="titulo">Avisos</h2>
    {est !== "granted" && <div className="grande" style={{ cursor: "pointer" }} onClick={activar} role="button" tabIndex={0}><Icono n="campana" /><span className="q"><b>Activá las notificaciones</b><small>{est === "denied" ? "Están bloqueadas: habilitalas en los permisos del navegador." : esIOS() && !estaInstalada() ? "En iPhone primero hay que instalar la app." : "Así te llegan mensajes y juntadas aunque tengas la app cerrada."}</small></span></div>}
    {!pushSoportado() && !esIOS() && <p className="expl">Este navegador no admite notificaciones.</p>}
    {q.get("v") !== "ajustes" && <Solicitudes />}
    <h3 className="sec">Qué me llega</h3>
    <div className="lista">{TIPOS.map(([k, t, d]) => <button key={k} className="item" role="switch" aria-checked={!!n[k]} onClick={() => cambiar(k)}><span className="q"><b>{t}</b><small>{d}</small></span><span className="ic" style={{ color: n[k] ? "var(--ok)" : "var(--tinta3)" }}><Icono n={n[k] ? "ok" : "x"} /></span></button>)}</div>
    {q.get("v") !== "ajustes" && <><h3 className="sec">Lo último</h3>
    {l.length ? <div className="lista">{l.map((a) => <Link key={a.id} href={a.enlace || "/inicio"} className="item"><span className="q"><b>{a.titulo}</b>{a.cuerpo && <small>{a.cuerpo}</small>}<small>{cuandoRelativo(a.creado_en)}</small></span></Link>)}{hayMas && <button className="btn sec2 chico" style={{ justifySelf: "center" }} onClick={anteriores}>Ver anteriores</button>}</div> : <Vacio emoji="🔔" titulo="Todo tranquilo" texto="Acá van a aparecer mensajes, juntadas y avisos." />}</>}
  </div>;
}
export default function P() { return <Suspense><Notif /></Suspense>; }
