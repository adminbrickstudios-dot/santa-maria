"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { sb } from "@/lib/sb";
import { useSesion } from "@/lib/sesion";
import { Hoja } from "@/components/Hoja";
import { Icono } from "@/components/Icono";
import { COLORES, DIAS, ahoraBA, faltan, fechaLarga, horaDe } from "@/lib/util";

const V = [["horario", "Horario"], ["materias", "Materias"], ["apuntes", "Apuntes"]];
const TIPOS: Record<string, string> = { parcial: "Parcial", final: "Final", tp: "Trabajo práctico", vencimiento: "Vencimiento", otro: "Otro" };
const ESTADOS: Record<string, string> = { cursando: "Cursando", regular: "Regular, falta el final", aprobada: "Aprobada", pendiente: "Por cursar" };

function Facu() {
  const q = useSearchParams(), { perfil, toast, pantalla, lugares } = useSesion();
  const [v, setV] = useState(q.get("v") || "horario");
  const [mats, setM] = useState<any[]>([]), [cls, setC] = useState<any[]>([]), [evs, setE] = useState<any[]>([]), [aps, setA] = useState<any[]>([]);
  const [hoja, setH] = useState<string | null>(null), [f, setF] = useState<any>({});
  const cargar = useCallback(async () => {
    const [a, b, c, d] = await Promise.all([
      sb.from("materias").select("*").order("creado_en"),
      sb.from("clases").select("*, materias(nombre,color)").order("hora_inicio"),
      sb.from("eventos").select("*").order("fecha"),
      sb.from("apuntes").select("*").order("creado_en", { ascending: false }).limit(100),
    ]);
    setM(a.data || []); setC(b.data || []); setE(c.data || []); setA(d.data || []);
  }, []);
  useEffect(() => { cargar(); if (q.get("nuevo") === "1") { setF({ tipo: "parcial" }); setH("evento"); } }, [cargar, q]);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const yo = perfil.id;
  const facus = lugares.filter((l) => l.tipo === "facu");
  const luDe = (id: number) => lugares.find((l) => l.id === id);
  const matsAp = [...new Set(aps.map((a) => a.materia))];
  const apVis = f.filtro ? aps.filter((a) => a.materia === f.filtro) : aps;
  async function guardar(t: string) {
    let r: any;
    if (t === "materia") {
      if (!f.nombre) return toast("Poné el nombre de la materia.");
      r = await sb.from("materias").insert({ perfil_id: yo, nombre: f.nombre, profesor: f.profesor || null, estado: f.estado || "cursando", nota: f.nota || null, color: COLORES[mats.length % COLORES.length] });
    } else if (t === "clase") {
      if (!f.materia_id || !f.hora_inicio || !f.hora_fin) return toast("Elegí materia y horario.");
      r = await sb.from("clases").insert({ perfil_id: yo, materia_id: +f.materia_id, dia: +(f.dia ?? 1), hora_inicio: f.hora_inicio, hora_fin: f.hora_fin, aula: f.aula || null, lugar_id: f.lugar_id ? +f.lugar_id : facus[0]?.id || null });
    } else if (t === "evento") {
      if (!f.titulo || !f.fecha) return toast("Poné título y fecha.");
      r = await sb.from("eventos").insert({ perfil_id: yo, titulo: f.titulo, tipo: f.tipo || "parcial", fecha: new Date(f.fecha).toISOString(), materia_id: f.materia_id ? +f.materia_id : null });
    } else {
      if (!f.materia || !f.titulo || !/^https?:\/\//.test(f.enlace || "")) return toast("Completá materia, título y un link que empiece con https.");
      r = await sb.from("apuntes").insert({ grupo_id: perfil.grupo_id, autor_id: yo, materia: f.materia, titulo: f.titulo, enlace: f.enlace });
    }
    if (r?.error) return toast("No pude guardar. Probá de nuevo.");
    setH(null); setF({}); cargar();
  }
  const aprob = mats.filter((m) => m.estado === "aprobada" && m.nota != null), prom = aprob.length ? aprob.reduce((a, m) => a + Number(m.nota), 0) / aprob.length : null;
  const hoy = ahoraBA().getDay();
  return <div className="pagina">
    <h2 className="titulo">Estudio y horarios</h2>
    <Link href="/agenda" className="mas-largo"><Icono n="calendario" t={20} /><span>Parciales y fechas en la Agenda</span><Icono n="chevron" t={18} /></Link>
    {pantalla("carreras") && <Link href="/facu/carreras" className="bloque"><span className="ic"><Icono n="brujula" t={28} /></span><span style={{ flex: 1, minWidth: 0 }}><b>Carreras</b><small>Explorá, compará y hacé el test de orientación</small></span></Link>}
    <div className="segs" role="tablist">{V.filter(([k]) => k !== "apuntes" || pantalla("apuntes")).map(([k, n]) => <button key={k} className="seg" role="tab" aria-selected={v === k} onClick={() => setV(k)}>{n}</button>)}</div>
    {v === "horario" && <>
      {!cls.length && <p className="expl">Cargá tus materias y sus horarios. En Inicio te digo a qué hora salir cada día.</p>}
      {[1, 2, 3, 4, 5, 6, 0].map((d) => { const l = cls.filter((c) => c.dia === d); if (!l.length) return null; return <div key={d} className="horario"><h3 className="sec">{DIAS[d]}{d === hoy ? " · hoy" : ""}</h3>{l.map((c) => <div key={c.id} className="clase"><i style={{ background: c.materias?.color }} /><span style={{ flex: 1, minWidth: 0 }}><b>{c.materias?.nombre}</b><small>{c.hora_inicio.slice(0, 5)} a {c.hora_fin.slice(0, 5)}{c.aula ? ` · Aula ${c.aula}` : ""}{luDe(c.lugar_id) ? ` · ${luDe(c.lugar_id).nombre}` : ""}</small></span>{luDe(c.lugar_id) && <Link className="ico-btn" aria-label="Cómo llego" href={`/mapa?lat=${luDe(c.lugar_id).lat}&lon=${luDe(c.lugar_id).lon}&n=${encodeURIComponent(luDe(c.lugar_id).nombre)}`}><Icono n="mapa" t={20} /></Link>}<button className="ico-btn" aria-label="Borrar" onClick={async () => { await sb.from("clases").delete().eq("id", c.id); cargar(); }}><Icono n="x" t={18} /></button></div>)}</div>; })}
      <button className="btn pri" onClick={() => { if (!mats.length) { toast("Primero sumá una materia."); setV("materias"); return; } setF({ dia: 1 }); setH("clase"); }}><Icono n="mas" />Sumar clase</button>
    </>}
    {v === "materias" && <>
      {prom != null && <div className="dos"><div className="mini"><span className="et">Promedio</span><b>{prom.toFixed(2).replace(".", ",")}</b><small>{aprob.length} aprobadas con nota</small></div><div className="mini"><span className="et">Cursando</span><b>{mats.filter((m) => m.estado === "cursando").length}</b><small>este cuatrimestre</small></div></div>}
      {mats.length > 0 && <div className="lista">{mats.map((m) => <div key={m.id} className="item"><span className="ic" style={{ background: m.color, color: "#fff" }}><Icono n="libro" /></span><span className="q"><b>{m.nombre}</b><small>{ESTADOS[m.estado]}{m.nota != null ? ` · nota ${m.nota}` : ""}{m.profesor ? ` · ${m.profesor}` : ""}</small></span><button className="ico-btn" aria-label="Editar" onClick={() => { setF(m); setH("editar"); }}><Icono n="ajustes" t={20} /></button></div>)}</div>}
      <button className="btn pri" onClick={() => { setF({}); setH("materia"); }}><Icono n="mas" />Sumar materia</button>
    </>}
    {v === "fechas" && <>
      {evs.length > 0 ? <div className="lista">{evs.map((e) => <div key={e.id} className="item" style={{ opacity: e.hecho ? 0.55 : 1 }}><button className="ico-btn" aria-label="Marcar hecho" onClick={async () => { await sb.from("eventos").update({ hecho: !e.hecho }).eq("id", e.id); cargar(); }}><Icono n={e.hecho ? "ok" : "tilde"} /></button><span className="q"><b>{e.titulo}</b><small>{TIPOS[e.tipo]} · {fechaLarga(e.fecha)} {horaDe(e.fecha)}</small></span><span className="v">{faltan(e.fecha)}</span></div>)}</div> : <p className="expl">Parciales, finales, entregas y vencimientos. Te los muestro en Inicio con cuánto falta.</p>}
      <button className="btn pri" onClick={() => { setF({ tipo: "parcial" }); setH("evento"); }}><Icono n="mas" />Sumar fecha</button>
    </>}
    {v === "apuntes" && <>
      <p className="expl">Links a resúmenes, carpetas de Drive y parciales viejos. Los ve todo tu grupo.</p>
      {matsAp.length > 1 && <div className="segs"><button className="seg" aria-selected={!f.filtro} onClick={() => setF({ ...f, filtro: "" })}>Todas</button>{matsAp.map((m) => <button key={m} className="seg" aria-selected={f.filtro === m} onClick={() => setF({ ...f, filtro: m })}>{m}</button>)}</div>}
      {apVis.length > 0 && <div className="lista">{apVis.map((a) => <a key={a.id} className="item" href={a.enlace} target="_blank" rel="noopener noreferrer"><span className="ic"><Icono n="link" /></span><span className="q"><b>{a.titulo}</b><small>{a.materia}</small></span></a>)}</div>}
      <button className="btn pri" onClick={() => { setF({}); setH("apunte"); }}><Icono n="mas" />Compartir apunte</button>
    </>}
    {hoja === "materia" && <Hoja titulo="Nueva materia" cerrar={() => setH(null)}>
      <div className="campo"><label htmlFor="f1">Nombre</label><input id="f1" type="text" value={f.nombre || ""} onChange={set("nombre")} /></div>
      <div className="campo"><label htmlFor="f2">Profesor (opcional)</label><input id="f2" type="text" value={f.profesor || ""} onChange={set("profesor")} /></div>
      <div className="campo"><label htmlFor="f3">Estado</label><select id="f3" value={f.estado || "cursando"} onChange={set("estado")}>{Object.entries(ESTADOS).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></div>
      <button className="btn pri" onClick={() => guardar("materia")}>Guardar</button>
    </Hoja>}
    {hoja === "editar" && <Hoja titulo={f.nombre} cerrar={() => setH(null)}>
      <div className="campo"><label htmlFor="e3">Estado</label><select id="e3" value={f.estado} onChange={set("estado")}>{Object.entries(ESTADOS).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></div>
      <div className="campo"><label htmlFor="e4">Nota final (opcional)</label><input id="e4" type="number" min="0" max="10" step="0.25" value={f.nota ?? ""} onChange={set("nota")} /></div>
      <button className="btn pri" onClick={async () => { await sb.from("materias").update({ estado: f.estado, nota: f.nota === "" ? null : f.nota }).eq("id", f.id); setH(null); cargar(); }}>Guardar</button>
      <button className="btn mal" onClick={async () => { await sb.from("materias").delete().eq("id", f.id); setH(null); cargar(); }}>Borrar materia</button>
    </Hoja>}
    {hoja === "clase" && <Hoja titulo="Nueva clase" cerrar={() => setH(null)}>
      <div className="campo"><label htmlFor="c1">Materia</label><select id="c1" value={f.materia_id || ""} onChange={set("materia_id")}><option value="">Elegí</option>{mats.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select></div>
      <div className="campo"><label htmlFor="c2">Día</label><select id="c2" value={f.dia ?? 1} onChange={set("dia")}>{[1, 2, 3, 4, 5, 6].map((d) => <option key={d} value={d}>{DIAS[d]}</option>)}</select></div>
      <div className="dos"><div className="campo"><label htmlFor="c3">Empieza</label><input id="c3" type="time" value={f.hora_inicio || ""} onChange={set("hora_inicio")} /></div><div className="campo"><label htmlFor="c4">Termina</label><input id="c4" type="time" value={f.hora_fin || ""} onChange={set("hora_fin")} /></div></div>
      <div className="campo"><label htmlFor="c6">Dónde cursás</label><select id="c6" value={f.lugar_id || facus[0]?.id || ""} onChange={set("lugar_id")}>{facus.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}</select></div>
      <div className="campo"><label htmlFor="c5">Aula (opcional)</label><input id="c5" type="text" value={f.aula || ""} onChange={set("aula")} /></div>
      <button className="btn pri" onClick={() => guardar("clase")}>Guardar</button>
    </Hoja>}
    {hoja === "evento" && <Hoja titulo="Nueva fecha" cerrar={() => setH(null)}>
      <div className="campo"><label htmlFor="v1">Título</label><input id="v1" type="text" placeholder="Ej: Parcial de Lenguaje Visual" value={f.titulo || ""} onChange={set("titulo")} /></div>
      <div className="campo"><label htmlFor="v2">Tipo</label><select id="v2" value={f.tipo} onChange={set("tipo")}>{Object.entries(TIPOS).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></div>
      {mats.length > 0 && <div className="campo"><label htmlFor="v4">Materia (opcional)</label><select id="v4" value={f.materia_id || ""} onChange={set("materia_id")}><option value="">Ninguna</option>{mats.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select></div>}
      <div className="campo"><label htmlFor="v3">Fecha y hora</label><input id="v3" type="datetime-local" value={f.fecha || ""} onChange={set("fecha")} /></div>
      <button className="btn pri" onClick={() => guardar("evento")}>Guardar</button>
    </Hoja>}
    {hoja === "apunte" && <Hoja titulo="Compartir apunte" cerrar={() => setH(null)}>
      <div className="campo"><label htmlFor="a1">Materia</label><input id="a1" type="text" value={f.materia || ""} onChange={set("materia")} /></div>
      <div className="campo"><label htmlFor="a2">Título</label><input id="a2" type="text" value={f.titulo || ""} onChange={set("titulo")} /></div>
      <div className="campo"><label htmlFor="a3">Link</label><input id="a3" type="url" placeholder="https://" value={f.enlace || ""} onChange={set("enlace")} /></div>
      <button className="btn pri" onClick={() => guardar("apunte")}>Compartir</button>
    </Hoja>}
  </div>;
}
export default function P() { return <Suspense><Facu /></Suspense>; }
