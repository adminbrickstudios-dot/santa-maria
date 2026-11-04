"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { sb } from "@/lib/sb";
import { useSesion } from "@/lib/sesion";
import { Hoja } from "@/components/Hoja";
import { Icono } from "@/components/Icono";
import { aISO } from "@/lib/agenda";
import { Tilde } from "./Comun";

const PRIORIDAD: [string, string][] = [["baja", "Baja"], ["media", "Normal"], ["alta", "Alta"]];

export function TareaHoja({ x, listas, listaInicial, fechaInicial, cerrar }: { x?: any; listas: any[]; listaInicial: number | null; fechaInicial: string; cerrar: () => void }) {
  const { perfil, toast } = useSesion();
  const [f, setF] = useState<any>(x ? { ...x, fecha: x.fecha || "", notas: x.notas || "" } : { titulo: "", notas: "", fecha: fechaInicial, prioridad: "media", repetir: "no", lista_id: listaInicial, pasos: [] });
  const [paso, setPaso] = useState(""), [agenda, setAgenda] = useState(!!x?.evento_id), [ocupado, setOcupado] = useState(false);
  const mio = !x || x.perfil_id === perfil.id, pasos: any[] = Array.isArray(f.pasos) ? f.pasos : [];

  function cambiarPasos(l: any[]) {
    setF({ ...f, pasos: l });
    if (x) sb.from("tareas").update({ pasos: l }).eq("id", x.id).then(({ error }: any) => { if (error) toast("No pude guardar el paso."); });
  }
  function sumarPaso(e: React.FormEvent) { e.preventDefault(); if (!paso.trim()) return; cambiarPasos([...pasos, { t: paso.trim(), h: false }]); setPaso(""); }
  async function guardar() {
    if (!f.titulo.trim()) return toast("Ponele un título.");
    setOcupado(true);
    const fecha = f.fecha || null;
    const fila = { titulo: f.titulo.trim(), notas: f.notas.trim() || null, fecha, prioridad: f.prioridad, repetir: fecha ? f.repetir : "no", lista_id: f.lista_id || null, pasos };
    const r = x ? await sb.from("tareas").update(fila).eq("id", x.id).select().single() : await sb.from("tareas").insert({ ...fila, perfil_id: perfil.id }).select().single();
    if (r.error) { setOcupado(false); return toast("No pude guardar. Probá de nuevo."); }
    if (mio) {
      if (agenda && fecha && !r.data.evento_id) {
        const e = await sb.from("eventos").insert({ perfil_id: perfil.id, titulo: fila.titulo, tipo: "personal", fecha: aISO(fecha, null), todo_dia: true, avisos: [1440] }).select().single();
        if (e.error) toast("Se guardó, pero no pude sumarla a la Agenda.");
        else await sb.from("tareas").update({ evento_id: e.data.id }).eq("id", r.data.id);
      } else if ((!agenda || !fecha) && x?.evento_id) await sb.from("eventos").delete().eq("id", x.evento_id);
    }
    setOcupado(false); cerrar();
  }
  return <Hoja titulo={x ? "Tarea" : "Nueva tarea"} cerrar={cerrar}>
    <div className="campo"><label htmlFor="ta-t">Qué hay que hacer</label><input id="ta-t" type="text" value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} /></div>
    <div className="dos">
      <div className="campo"><label htmlFor="ta-f">Fecha</label><input id="ta-f" type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} /></div>
      <div className="campo"><label htmlFor="ta-l">Lista</label><select id="ta-l" value={f.lista_id ?? ""} onChange={(e) => setF({ ...f, lista_id: e.target.value ? +e.target.value : null })}><option value="">Sin lista</option>{listas.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}</select></div>
    </div>
    <div className="campo"><span>Prioridad</span><div className="chipera">{PRIORIDAD.map(([k, n]) => <button key={k} className="chip" aria-pressed={f.prioridad === k} onClick={() => setF({ ...f, prioridad: k })}>{n}</button>)}</div></div>
    <div className="chipera">
      <button className="chip" aria-pressed={f.repetir === "semanal" && !!f.fecha} disabled={!f.fecha} onClick={() => setF({ ...f, repetir: f.repetir === "semanal" ? "no" : "semanal" })}><Icono n="repetir" t={18} />Cada semana</button>
      {mio && <button className="chip" aria-pressed={agenda && !!f.fecha} disabled={!f.fecha} onClick={() => setAgenda(!agenda)}><Icono n="calendario" t={18} />Ver en la Agenda</button>}
    </div>
    {!f.fecha && <p className="chico">Poné una fecha para repetirla o verla en la Agenda.</p>}
    <div className="campo"><label htmlFor="ta-n">Notas</label><textarea id="ta-n" value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} /></div>
    <h3 className="sec">Pasos{pasos.length ? ` (${pasos.filter((p) => p.h).length} de ${pasos.length})` : ""}</h3>
    {pasos.length > 0 && <div className="or-pasos">{pasos.map((p, i) => <div key={i} className={`or-fila ${p.h ? "hecha" : ""}`}>
      <Tilde si={p.h} tocar={() => cambiarPasos(pasos.map((q, k) => (k === i ? { ...q, h: !q.h } : q)))} etiqueta={p.h ? `Desmarcar ${p.t}` : `Marcar ${p.t}`} />
      <span className="q"><b style={{ fontSize: 16 }}>{p.t}</b></span>
      <button className="ico-btn" aria-label={`Sacar ${p.t}`} onClick={() => cambiarPasos(pasos.filter((_, k) => k !== i))}><Icono n="x" t={18} /></button>
    </div>)}</div>}
    <form className="or-suma" onSubmit={sumarPaso}><input type="text" aria-label="Nuevo paso" placeholder="Sumar paso" value={paso} onChange={(e) => setPaso(e.target.value)} /><button className="cap-ok" type="submit" aria-label="Sumar paso"><Icono n="mas" t={22} /></button></form>
    <button className="btn pri" disabled={ocupado} onClick={guardar}>{ocupado ? "Guardando…" : "Guardar"}</button>
    {x && <button className="btn mal chico" onClick={async () => { await sb.from("tareas").delete().eq("id", x.id); cerrar(); }}><Icono n="papelera" t={20} />Borrar</button>}
  </Hoja>;
}

export function ListaHoja({ x, miembros, cerrar }: { x?: any; miembros: any[]; cerrar: (borrada?: boolean) => void }) {
  const { perfil, personas, toast } = useSesion();
  const [nombre, setNombre] = useState(x?.nombre || ""), [emoji, setEmoji] = useState(x?.emoji || "📋");
  const [con, setCon] = useState<string[]>(x ? miembros.filter((m) => m.lista_id === x.id).map((m) => m.perfil_id) : []);
  const mia = !x || x.perfil_id === perfil.id, otros = personas.filter((p: any) => p.id !== perfil.id && (!p.trato || p.trato === "libre"));
  const avisar = () => window.dispatchEvent(new Event("sm-tareas"));
  async function guardar() {
    if (!nombre.trim()) return toast("Ponele un nombre.");
    const fila = { perfil_id: perfil.id, grupo_id: perfil.grupo_id, nombre: nombre.trim(), emoji: emoji || "📋" };
    const r = x ? await sb.from("tarea_listas").update(fila).eq("id", x.id).select().single() : await sb.from("tarea_listas").insert(fila).select().single();
    if (r.error) return toast("No pude guardar.");
    if (!x && con.length) { const e = await sb.from("tarea_lista_miembros").insert(con.map((p) => ({ lista_id: r.data.id, perfil_id: p }))); if (e.error) toast("No pude compartirla con todos."); }
    cerrar();
  }
  async function alternar(id: string) {
    const esta = con.includes(id);
    if (x) {
      const { error } = esta ? await sb.from("tarea_lista_miembros").delete().eq("lista_id", x.id).eq("perfil_id", id) : await sb.from("tarea_lista_miembros").insert({ lista_id: x.id, perfil_id: id });
      if (error) return toast("No se puede compartir con esa persona.");
      avisar();
    }
    setCon(esta ? con.filter((c) => c !== id) : [...con, id]);
  }
  if (!mia) {
    const dueno = personas.find((p: any) => p.id === x.perfil_id);
    return <Hoja titulo={`${x.emoji} ${x.nombre}`} cerrar={() => cerrar()}>
      <p className="expl">{dueno ? `La compartió ${dueno.nombre}.` : "Te la compartieron."} Si te vas, dejás de ver sus tareas.</p>
      <button className="btn mal" onClick={async () => { await sb.from("tarea_lista_miembros").delete().eq("lista_id", x.id).eq("perfil_id", perfil.id); cerrar(true); }}>Salir de la lista</button>
    </Hoja>;
  }
  return <Hoja titulo={x ? "Editar lista" : "Nueva lista"} cerrar={() => cerrar()}>
    <div className="cap-txt"><input type="text" aria-label="Emoji" value={emoji} maxLength={4} style={{ width: 62, flex: "none", textAlign: "center" }} onChange={(e) => setEmoji(e.target.value)} /><input type="text" aria-label="Nombre de la lista" placeholder="Nombre: depto, facu, viaje" value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
    {otros.length > 0 && <div className="campo"><span>Compartir con</span><small>Pueden ver, sumar, marcar y borrar tareas de esta lista.</small><div className="chipera">{otros.map((p: any) => <button key={p.id} className="chip" aria-pressed={con.includes(p.id)} onClick={() => alternar(p.id)}>{p.nombre}</button>)}</div></div>}
    <button className="btn pri" onClick={guardar}>Guardar</button>
    {x && <button className="btn mal chico" onClick={async () => { await sb.from("tarea_listas").delete().eq("id", x.id); cerrar(true); }}><Icono n="papelera" t={20} />Borrar lista y sus tareas</button>}
  </Hoja>;
}
