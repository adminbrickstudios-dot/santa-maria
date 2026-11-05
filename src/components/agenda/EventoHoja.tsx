"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { sb } from "@/lib/sb";
import { useSesion } from "@/lib/sesion";
import { Hoja } from "@/components/Hoja";
import { Icono } from "@/components/Icono";
import { Avatar } from "@/components/Avatar";
import { MandarA } from "@/components/MandarA";
import { lanzarEfecto } from "@/components/Efectos";
import { aISO, claveDeISO, horaDeISO, OPC_AVISO, TIPOS, type Ocurrencia } from "@/lib/agenda";
import { faltan, fechaLarga, hhmm } from "@/lib/util";
import { ResumenForm, ResumenFila } from "./Resumenes";
import { EventoForm } from "./EventoForm";

const fin1h = (iso: string) => new Date(new Date(iso).getTime() + 36e5).toISOString();
const g = (d: string) => new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
export function enlaceGoogle(e: any, cuando: string) {
  const fechas = e.todo_dia ? `${claveDeISO(cuando).replace(/-/g, "")}/${claveDeISO(fin1h(fin1h(cuando).replace(/T.*/, "T23:00:00Z"))).replace(/-/g, "")}` : `${g(cuando)}/${g(e.fin || fin1h(cuando))}`;
  const p = new URLSearchParams({ action: "TEMPLATE", text: e.titulo, dates: fechas, location: e.lugar_nombre || "", details: e.notas || "" });
  return `https://calendar.google.com/calendar/render?${p}`;
}
function diasAntes(cuando: string, n: number, hora: string) {
  const d = new Date(new Date(cuando).getTime() - n * 864e5);
  return aISO(claveDeISO(d.toISOString()), hora);
}
export function EventoHoja({ o, cerrar }: { o: Ocurrencia; cerrar: () => void }) {
  const { perfil, personas, toast } = useSesion(), r = useRouter();
  const [e, setE] = useState<any>(o.e), [inv, setInv] = useState<any[]>([]), [res, setRes] = useState<any[]>([]);
  const [editar, setEditar] = useState(false), [nuevoRes, setNR] = useState(false), [invitar, setInvitar] = useState(false), [mandar, setMandar] = useState(false), [borrar, setBorrar] = useState(false);
  const [paso, setPaso] = useState(""), [salida, setSalida] = useState<string>("");
  const mio = e.perfil_id === perfil.id, t = TIPOS[e.tipo] || TIPOS.otro, pasos: any[] = Array.isArray(e.pasos) ? e.pasos : [];
  const yo = inv.find((i) => i.perfil_id === perfil.id);
  const recargar = useCallback(async () => {
    const [{ data: i }, { data: rs }, { data: ev }] = await Promise.all([sb.from("evento_invitados").select("*").eq("evento_id", o.e.id), sb.from("resumenes").select("*").eq("evento_id", o.e.id).order("creado_en", { ascending: false }), sb.from("eventos").select("*").eq("id", o.e.id).maybeSingle()]);
    setInv(i || []); setRes(rs || []); if (ev) setE(ev);
  }, [o.e.id]);
  useEffect(() => { recargar(); const f = () => recargar(); addEventListener("sm-agenda", f); return () => removeEventListener("sm-agenda", f); }, [recargar]);
  const avisar = () => window.dispatchEvent(new Event("sm-agenda"));
  async function campo(c: any) { setE((x: any) => ({ ...x, ...c })); await sb.from("eventos").update(c).eq("id", e.id); avisar(); }
  function togglePaso(i: number) { const l = pasos.map((p, k) => (k === i ? { ...p, h: !p.h } : p)); campo({ pasos: l }); if (l.length && l.every((p) => p.h)) lanzarEfecto("listo"); }
  function sumarPaso(ev: React.FormEvent) { ev.preventDefault(); if (!paso.trim()) return; campo({ pasos: [...pasos, { t: paso.trim(), h: false }] }); setPaso(""); }
  async function plan() {
    const dias = e.tipo === "final" ? [14, 10, 7, 4, 2, 1] : [7, 5, 3, 2, 1];
    const filas = dias.map((n, i) => ({ perfil_id: e.perfil_id, tipo: "estudio", titulo: `Estudiar ${e.titulo}${i === dias.length - 1 ? ": repaso final" : ""}`, fecha: diasAntes(o.cuando, n, "19:00"), fin: diasAntes(o.cuando, n, "21:00"), avisos: [60], origen_id: e.id, materia_id: e.materia_id })).filter((x) => new Date(x.fecha) > new Date());
    if (!filas.length) return toast("Ya no hay días para armar el plan.");
    const { error } = await sb.from("eventos").insert(filas);
    if (error) return toast("No se pudo armar el plan.");
    lanzarEfecto("listo"); toast(`Sumé ${filas.length} tandas de estudio.`); avisar();
  }
  async function geo() {
    if (e.lat != null) return { lat: e.lat, lon: e.lon };
    if (!e.lugar_nombre) return null;
    const m = await import("@/lib/mapa/vista"); await m.cargarDatosMapa();
    const q = m.geocodificar(e.lugar_nombre)?.[0];
    if (!q) return null;
    const p = { lat: m.alat(q.y), lon: m.alon(q.x) }; campo(p); return p;
  }
  async function comoLlego() {
    const p = await geo().catch(() => null);
    if (p) { cerrar(); r.push(`/mapa?lat=${p.lat}&lon=${p.lon}&n=${encodeURIComponent(e.lugar_nombre || e.titulo)}`); }
    else window.open(`https://www.google.com/maps/search/${encodeURIComponent(e.lugar_nombre + ", Buenos Aires")}`, "_blank");
  }
  useEffect(() => {
    if (!e.lugar_nombre || e.todo_dia || perfil.casa_lat == null || new Date(o.cuando) < new Date()) return;
    (async () => {
      const p = await geo(); if (!p) return;
      const m = await import("@/lib/mapa/vista");
      const h = horaDeISO(o.cuando).split(":").map(Number), min = h[0] * 60 + h[1], d = new Date(o.cuando).getDay();
      const pl = m.planificar({ nombre: "Tu casa", x: m.wx(perfil.casa_lon), y: m.wy(perfil.casa_lat) }, { nombre: e.lugar_nombre, x: m.wx(p.lon), y: m.wy(p.lat) }, { dia: d === 0 ? "dom" : d === 6 ? "sab" : "hab", min: Math.max(0, min - 40), lluvia: false });
      const op = pl.ops.filter((x: any) => ["bus", "subte", "pie"].includes(x.tipo)).sort((a: any, b: any) => a.dMax - b.dMax)[0];
      if (!op) return;
      setSalida(`Salí a las ${hhmm(min - op.dMax - 5)}. Tardás hasta ${Math.round(op.dMax)} minutos${op.titulo ? ` (${op.titulo})` : ""}.`);
      if (mio && e.viaje_min !== Math.round(op.dMax)) campo({ viaje_min: Math.round(op.dMax) });
    })().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [e.id, e.lugar_nombre]);
  async function responder(estado: string) { await sb.from("evento_invitados").update({ estado }).eq("evento_id", e.id).eq("perfil_id", perfil.id); recargar(); avisar(); }
  async function sumar(id: string) { const { error } = await sb.from("evento_invitados").insert({ evento_id: e.id, perfil_id: id }); if (error) toast("No se pudo sumar."); recargar(); }
  async function borrarEste() { await sb.from("eventos").update({ excepciones: [...(e.excepciones || []), o.dia] }).eq("id", e.id); avisar(); cerrar(); }
  async function borrarTodo() { await sb.from("eventos").delete().eq("id", e.id); avisar(); cerrar(); }
  if (editar) return <EventoForm e={e} cerrar={() => setEditar(false)} />;
  return <Hoja titulo={e.titulo} cerrar={cerrar}>
    <div className="ev-cab" style={{ "--c": t.c } as React.CSSProperties}>
      <span className="ev-tipo">{t.e} {t.n}</span>{e.importante && <span className="ev-tipo">⭐ Importante</span>}
      <b>{fechaLarga(o.cuando)}{e.todo_dia ? "" : ` a las ${horaDeISO(o.cuando)}`}{e.fin && !e.todo_dia ? ` a ${horaDeISO(e.fin)}` : ""}</b>
      <small>{new Date(o.cuando) > new Date() ? `Falta: ${faltan(o.cuando)}` : "Ya pasó"}{e.lugar_nombre ? `. ${e.lugar_nombre}` : ""}</small>
    </div>
    <div className="ev-acc">
      {e.lugar_nombre && <button onClick={comoLlego}><i><Icono n="pin" /></i>Cómo llego</button>}
      {mio && <button onClick={() => campo({ hecho: !e.hecho })}><i style={e.hecho ? { background: "var(--billetera)", color: "#fff" } : undefined}><Icono n="ok" /></i>{e.hecho ? "Hecho" : "Marcar hecho"}</button>}
      <button onClick={() => setMandar(true)}><i><Icono n="enviar" /></i>Mandar</button>
      {mio && <button onClick={() => setEditar(true)}><i><Icono n="lapiz" /></i>Editar</button>}
    </div>
    {salida && <div className="tarjeta"><b>{salida}</b><small className="expl">Te aviso 15 minutos antes de salir.</small></div>}
    {yo && !mio && <div className="fila"><button className="btn sec2" aria-pressed={yo.estado === "voy"} style={yo.estado === "voy" ? { background: "var(--billetera)", color: "#fff" } : undefined} onClick={() => responder("voy")}>Voy</button><button className="btn sec2" style={yo.estado === "no" ? { background: "var(--agenda)", color: "#fff" } : undefined} onClick={() => responder("no")}>No voy</button></div>}
    {(e.tipo === "parcial" || e.tipo === "final") && mio && new Date(o.cuando) > new Date() && <button className="ev-plan" onClick={plan}><span>📚</span><span className="q"><b>Armar plan de estudio</b><small>Reparto tandas de estudio en tu agenda hasta el {e.tipo}</small></span></button>}
    {e.notas && <div className="tarjeta"><p style={{ whiteSpace: "pre-wrap" }}>{e.notas}</p></div>}
    <h3 className="sec">Por hacer{pasos.length > 0 ? ` (${pasos.filter((p) => p.h).length} de ${pasos.length})` : ""}</h3>
    <div className="lista">
      {pasos.map((p, i) => <div key={i} className="item ev-paso"><button className={`ev-tilde ${p.h ? "si" : ""}`} onClick={() => togglePaso(i)} disabled={!mio} aria-label={p.h ? "Desmarcar" : "Marcar"}><Icono n="ok" t={16} g={3} /></button><span className="q" style={p.h ? { textDecoration: "line-through", opacity: .55 } : undefined}>{p.t}</span>{mio && <button className="ico-btn" aria-label="Sacar" onClick={() => campo({ pasos: pasos.filter((_, k) => k !== i) })}><Icono n="x" t={18} /></button>}</div>)}
      {mio && <form className="item" onSubmit={sumarPaso}><input type="text" value={paso} onChange={(x) => setPaso(x.target.value)} placeholder="Sumar algo por hacer" aria-label="Sumar algo por hacer" style={{ flex: 1, minWidth: 0 }} /></form>}
    </div>
    <h3 className="sec">Resúmenes y apuntes</h3>
    {res.length > 0 && <div className="lista">{res.map((x) => <ResumenFila key={x.id} r={x} cambio={recargar} />)}</div>}
    <button className="btn sec2 chico" onClick={() => setNR(true)}><Icono n="adjunto" t={20} />Sumar resumen</button>
    <h3 className="sec">Con quién</h3>
    {inv.length > 0 && <div className="lista">{inv.map((i) => { const p = personas.find((x: any) => x.id === i.perfil_id); return <div key={i.perfil_id} className="item"><Avatar p={p} t={36} /><span className="q"><b>{p?.nombre || "Alguien"}</b><small>{i.estado === "voy" ? "Va" : i.estado === "no" ? "No va" : "Sin responder"}</small></span>{mio && <button className="ico-btn" aria-label="Sacar" onClick={async () => { await sb.from("evento_invitados").delete().eq("evento_id", e.id).eq("perfil_id", i.perfil_id); recargar(); }}><Icono n="x" t={18} /></button>}</div>; })}</div>}
    {mio && <button className="btn sec2 chico" onClick={() => setInvitar(true)}><Icono n="gente" t={20} />Sumar gente</button>}
    {mio && <><h3 className="sec">Avisarme</h3><div className="chipera">{OPC_AVISO.map(([m, n]) => { const on = (e.avisos || []).includes(m); return <button key={m} className="chip" aria-pressed={on} onClick={() => campo({ avisos: on ? e.avisos.filter((q: number) => q !== m) : [...(e.avisos || []), m] })}>{n}</button>; })}</div></>}
    <a className="btn sec2 chico" href={enlaceGoogle(e, o.cuando)} target="_blank" rel="noopener noreferrer"><Icono n="calendario" t={20} />Pasar a Google Calendar</a>
    {mio && <button className="btn mal chico" onClick={() => (e.repetir !== "no" ? setBorrar(true) : borrarTodo())}><Icono n="papelera" t={20} />Borrar</button>}
    {borrar && <Hoja titulo="¿Qué borramos?" cerrar={() => setBorrar(false)}><button className="btn sec2" onClick={borrarEste}>Solo este día</button><button className="btn mal" onClick={borrarTodo}>Todos los días</button></Hoja>}
    {invitar && <Hoja titulo="Sumar gente" cerrar={() => setInvitar(false)}><div className="lista">{personas.filter((p: any) => p.id !== perfil.id && (!p.trato || p.trato === "libre") && !inv.some((i) => i.perfil_id === p.id)).map((p: any) => <button key={p.id} className="item" onClick={() => sumar(p.id)}><Avatar p={p} t={36} /><span className="q"><b>{p.nombre}</b></span><Icono n="mas" t={20} /></button>)}</div></Hoja>}
    {nuevoRes && <ResumenForm eventoId={e.id} materia={e.titulo} cerrar={() => { setNR(false); recargar(); }} />}
    {mandar && <MandarA texto={`${t.e} ${e.titulo}: ${fechaLarga(o.cuando)}${e.todo_dia ? "" : ` a las ${horaDeISO(o.cuando)}`}${e.lugar_nombre ? `, en ${e.lugar_nombre}` : ""}`} adjunto={e.lat != null ? { nombre: e.lugar_nombre, lat: e.lat, lon: e.lon } : null} cerrar={() => setMandar(false)} />}
  </Hoja>;
}
