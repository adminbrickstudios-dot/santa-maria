"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { useEffect, useState } from "react";
import { sb } from "@/lib/sb";
import { aplicarTema, useSesion } from "@/lib/sesion";
import { Avatar } from "@/components/Avatar";
import { Icono } from "@/components/Icono";
import { COLORES } from "@/lib/util";
import { INTERESES } from "@/lib/intereses";

const ACENTOS = ["#FFD21F", "#FF8A3D", "#FF6FA8", "#58D68D", "#5CC8FF", "#B79CFF"];

export default function Perfil() {
  const { perfil, recargar, toast } = useSesion();
  const [f, setF] = useState<any>(perfil), [us, setU] = useState<any[]>([]), [dir, setDir] = useState(""), [c1, setC1] = useState(""), [c2, setC2] = useState(""), [sub, setSub] = useState(false);
  useEffect(() => { sb.from("universidades").select("id,nombre").order("nombre").then(({ data }: any) => setU(data || [])); }, []);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const pref = f.preferencias || {};
  async function guardar(extra: any = {}) {
    const { nombre, bio, ciudad_origen, universidad_id, carrera_texto, anio_cursada, casa_visibilidad, tema, color, preferencias } = { ...f, ...extra };
    const { error } = await sb.from("perfiles").update({ nombre, bio, ciudad_origen, universidad_id: universidad_id || null, carrera_texto, anio_cursada: anio_cursada || null, casa_visibilidad, tema, color, preferencias, ...extra }).eq("id", perfil.id);
    if (error) return toast("No pude guardar.");
    await recargar(); toast("Guardado.");
  }
  async function casa() {
    const m = await import("@/lib/mapa/vista"); await m.cargarDatosMapa();
    const g = m.geocodificar(dir)[0];
    if (!g) return toast("No la encontré. Probá calle y altura, por ejemplo Juncal 1500.");
    const x = { casa_lat: m.alat(g.y), casa_lon: m.alon(g.x), casa_barrio: m.barrioDe(g.x, g.y) };
    setF({ ...f, ...x }); await guardar(x); setDir("");
  }
  async function foto(e: any) {
    const a = e.target.files?.[0]; if (!a) return;
    setSub(true);
    const ruta = `${perfil.id}/foto-${Date.now()}`;
    const { error } = await sb.storage.from("avatares").upload(ruta, a, { upsert: true, contentType: a.type });
    setSub(false);
    if (error) return toast("No pude subir la foto. Probá con una más liviana.");
    const url = sb.storage.from("avatares").getPublicUrl(ruta).data.publicUrl;
    setF({ ...f, avatar_url: url }); await guardar({ avatar_url: url });
  }
  async function clave() {
    if (c1.length < 8) return toast("Usá al menos 8 caracteres.");
    if (c1 !== c2) return toast("Las dos contraseñas no coinciden.");
    const { error } = await sb.auth.updateUser({ password: c1 });
    if (error) return toast("No pude cambiarla.");
    setC1(""); setC2(""); toast("Contraseña cambiada.");
  }
  return <div className="pagina">
    <h2 className="titulo">Mi perfil</h2>
    <div style={{ display: "flex", gap: 14, alignItems: "center" }}><Avatar p={f} t={84} /><div style={{ display: "grid", gap: 6 }}><p className="chico">Tu usuario: @{perfil.usuario}</p><label className="btn sec2 chico"><input type="file" accept="image/*" hidden onChange={foto} />{sub ? "Subiendo…" : "Cambiar foto"}</label></div></div>
    <div className="tarjeta">
      <div className="campo"><label htmlFor="p1">Nombre que ven los demás</label><input id="p1" type="text" value={f.nombre || ""} onChange={set("nombre")} /></div>
      <div className="campo"><label htmlFor="p2">Sobre vos</label><textarea id="p2" maxLength={200} value={f.bio || ""} onChange={set("bio")} /></div>
      <div className="campo"><label htmlFor="p3">De dónde sos</label><input id="p3" type="text" placeholder="Ej: Salta" value={f.ciudad_origen || ""} onChange={set("ciudad_origen")} /></div>
      <div className="campo"><label htmlFor="p4">Universidad</label><select id="p4" value={f.universidad_id || ""} onChange={set("universidad_id")}><option value="">Elegí</option>{us.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select></div>
      <div className="dos"><div className="campo"><label htmlFor="p5">Carrera</label><input id="p5" type="text" value={f.carrera_texto || ""} onChange={set("carrera_texto")} /></div><div className="campo"><label htmlFor="p6">Año</label><input id="p6" type="number" min="1" max="7" value={f.anio_cursada || ""} onChange={set("anio_cursada")} /></div></div>
      <button className="btn pri" onClick={() => guardar()}>Guardar</button>
    </div>
    <h3 className="sec">Qué me gusta</h3>
    <p className="expl">Con esto armo lo que te aparece en “Para vos”.</p>
    <div className="chipera">{Object.entries(INTERESES).map(([k, v]) => { const l: string[] = pref.intereses || [], on = l.includes(k); return <button key={k} className="chip" aria-pressed={on} onClick={() => { const p = { ...pref, intereses: on ? l.filter((x) => x !== k) : [...l, k] }; setF({ ...f, preferencias: p }); guardar({ preferencias: p }); }}>{v.nombre}</button>; })}</div>
    <h3 className="sec">Mi casa</h3>
    <div className="tarjeta">
      <p className="expl">{f.casa_lat != null ? `Está cargada en ${f.casa_barrio || "Buenos Aires"}.` : "Todavía no cargaste tu casa. Con ella el mapa sale desde ahí."}</p>
      <div className="campo"><label htmlFor="d1">Mudarme a</label><input id="d1" type="text" placeholder="Ej: Juncal 1500" value={dir} onChange={(e) => setDir(e.target.value)} /></div>
      <button className="btn sec2 chico" disabled={!dir} onClick={casa}>Actualizar dirección</button>
      <div className="campo"><label htmlFor="d2">Quién ve dónde vivo</label><select id="d2" value={f.casa_visibilidad} onChange={(e) => { setF({ ...f, casa_visibilidad: e.target.value }); guardar({ casa_visibilidad: e.target.value }); }}><option value="exacta">Mi grupo ve el punto en el mapa</option><option value="barrio">Mi grupo ve solo el barrio</option><option value="oculta">Nadie lo ve</option></select></div>
    </div>
    <h3 className="sec">Cómo se ve</h3>
    <div className="tarjeta">
      <div className="campo"><span>Tema</span><div className="chipera">{[["auto", "Como el celular"], ["claro", "Claro"], ["oscuro", "Oscuro"]].map(([k, n]) => <button key={k} className="chip" aria-pressed={f.tema === k} onClick={() => { setF({ ...f, tema: k }); aplicarTema(k, pref.acento); guardar({ tema: k }); }}>{n}</button>)}</div></div>
      <div className="campo"><span>Color de la app</span><div className="chipera">{ACENTOS.map((c) => <button key={c} aria-label={`Color ${c}`} aria-pressed={(pref.acento || "#FFD21F") === c} onClick={() => { const p = { ...pref, acento: c }; setF({ ...f, preferencias: p }); aplicarTema(f.tema, c); guardar({ preferencias: p }); }} style={{ width: 44, height: 44, borderRadius: "50%", background: c, outline: (pref.acento || "#FFD21F") === c ? "3px solid var(--tinta)" : "none", outlineOffset: 2 }} />)}</div></div>
      <div className="campo"><span>Tu color en el grupo</span><div className="chipera">{COLORES.map((c) => <button key={c} aria-label={`Color ${c}`} onClick={() => { setF({ ...f, color: c }); guardar({ color: c }); }} style={{ width: 36, height: 36, borderRadius: "50%", background: c, outline: f.color === c ? "3px solid var(--tinta)" : "none", outlineOffset: 2 }} />)}</div></div>
    </div>
    <Link className="btn sec2" href="/notificaciones?v=ajustes"><Icono n="campana" />Notificaciones</Link>
    <h3 className="sec">Contraseña</h3>
    <div className="tarjeta">
      <div className="campo"><label htmlFor="c1">Nueva</label><input id="c1" type="password" autoComplete="new-password" value={c1} onChange={(e) => setC1(e.target.value)} /></div>
      <div className="campo"><label htmlFor="c2">Repetila</label><input id="c2" type="password" autoComplete="new-password" value={c2} onChange={(e) => setC2(e.target.value)} /></div>
      <button className="btn sec2 chico" onClick={clave}>Cambiar contraseña</button>
    </div>
  </div>;
}
