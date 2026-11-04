"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from "react";
import { sb } from "@/lib/sb";
import { useSesion } from "@/lib/sesion";
import { Hoja } from "@/components/Hoja";
import { Icono } from "@/components/Icono";
import { MARCA } from "@/lib/marca";

export function Conectar({ cerrar }: { cerrar: () => void }) {
  const { perfil, toast } = useSesion();
  const [token, setToken] = useState(""), [ext, setExt] = useState<any[]>([]), [f, setF] = useState({ nombre: "", url: "" });
  const cargar = useCallback(async () => { const { data } = await sb.from("calendarios_externos").select("*").order("id"); setExt(data || []); }, []);
  useEffect(() => {
    cargar();
    (async () => {
      let { data } = await sb.from("calendario_enlaces").select("token").maybeSingle();
      if (!data) ({ data } = await sb.from("calendario_enlaces").insert({ perfil_id: perfil.id }).select("token").single());
      setToken(data?.token || "");
    })();
  }, [cargar, perfil.id]);
  const dom = typeof location !== "undefined" ? location.host : "", https = `https://${dom}/api/cal/${token}.ics`, webcal = `webcal://${dom}/api/cal/${token}.ics`;
  async function copiar() { try { await navigator.clipboard.writeText(https); toast("Enlace copiado."); } catch { toast("No se pudo copiar."); } }
  async function nuevoEnlace() { await sb.from("calendario_enlaces").delete().eq("perfil_id", perfil.id); const { data } = await sb.from("calendario_enlaces").insert({ perfil_id: perfil.id }).select("token").single(); setToken(data?.token || ""); toast("Listo: el enlace anterior dejó de andar."); }
  async function sumar(e: React.FormEvent) {
    e.preventDefault();
    if (!/^(https|webcal):\/\//i.test(f.url)) return toast("Pegá el enlace completo.");
    const { error } = await sb.from("calendarios_externos").insert({ perfil_id: perfil.id, nombre: f.nombre || "Mi calendario", url: f.url.trim() });
    if (error) return toast("No se pudo conectar.");
    setF({ nombre: "", url: "" }); cargar(); window.dispatchEvent(new Event("sm-agenda"));
  }
  return <Hoja titulo="Conectar calendarios" cerrar={cerrar}>
    <h3 className="sec">Ver {MARCA.nombre} en tu calendario</h3>
    <p className="expl">Tu agenda aparece en Google o Apple y se actualiza sola. Google puede tardar unas horas en mostrar los cambios.</p>
    <div className="fila">
      <a className="btn sec2 chico" href={webcal}><Icono n="calendario" t={20} />Apple</a>
      <a className="btn sec2 chico" href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`} target="_blank" rel="noopener noreferrer"><Icono n="calendario" t={20} />Google</a>
      <button className="btn sec2 chico" onClick={copiar}><Icono n="link" t={20} />Copiar enlace</button>
    </div>
    <p className="chico">Este enlace es privado: quien lo tenga puede ver tu agenda. <button style={{ textDecoration: "underline" }} onClick={nuevoEnlace}>Cambiar enlace</button></p>
    <h3 className="sec">Ver tu calendario acá</h3>
    <div className="tarjeta"><b>Google</b><p className="expl">En una computadora abrí calendar.google.com, entrá a la configuración de tu calendario y copiá la “Dirección secreta en formato iCal”.</p><b>Apple</b><p className="expl">En iCloud.com, en Calendario, compartí el calendario como público y copiá el enlace.</p></div>
    {ext.length > 0 && <div className="lista">{ext.map((c) => <div key={c.id} className="item"><span className="ic" style={{ background: c.color }} /><span className="q"><b>{c.nombre}</b></span><button className="ico-btn" aria-label={`Sacar ${c.nombre}`} onClick={async () => { await sb.from("calendarios_externos").delete().eq("id", c.id); cargar(); window.dispatchEvent(new Event("sm-agenda")); }}><Icono n="x" t={18} /></button></div>)}</div>}
    <form style={{ display: "grid", gap: 10 }} onSubmit={sumar}>
      <div className="campo"><label htmlFor="cx-n">Nombre</label><input id="cx-n" type="text" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Personal" /></div>
      <div className="campo"><label htmlFor="cx-u">Enlace del calendario</label><input id="cx-u" type="url" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://calendar.google.com/…" /></div>
      <button className="btn pri">Conectar</button>
    </form>
  </Hoja>;
}
