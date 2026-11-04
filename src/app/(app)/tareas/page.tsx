"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import "@/app/organizar.css";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { sb, traerTodo } from "@/lib/sb";
import { useSesion } from "@/lib/sesion";
import { Icono } from "@/components/Icono";
import { lanzarEfecto } from "@/components/Efectos";
import { diaClave } from "@/lib/agenda";
import { ahoraBA } from "@/lib/util";
import { sumarDias } from "@/components/estudio/logica";
import { Tilde, Vacio } from "@/components/organizar/Comun";
import { agruparTareas, fechaTarea } from "@/components/organizar/logica";
import { ListaHoja, TareaHoja } from "@/components/organizar/TareaHojas";

const V: [string, string][] = [["hoy", "Hoy"], ["proximas", "Próximas"], ["hechas", "Hechas"]];

function Tareas() {
  const q = useSearchParams(), { perfil, toast } = useSesion();
  const [v, setV] = useState("hoy"), [l, setL] = useState<any[]>([]), [listas, setListas] = useState<any[]>([]), [miembros, setMiembros] = useState<any[]>([]);
  const [cargado, setCargado] = useState(false), [filtro, setFiltro] = useState<number | null>(q.get("lista") ? +q.get("lista")! : null);
  const [txt, setTxt] = useState(""), [marcando, setMarcando] = useState<number[]>([]), [ed, setEd] = useState<any>(null), [lh, setLh] = useState<any>(null);
  const tiempos = useRef<any[]>([]);
  const cargar = useCallback(async () => {
    const [a, b, c] = await Promise.all([traerTodo((d, h) => sb.from("tareas").select("*").order("id").range(d, h), 3000), sb.from("tarea_listas").select("*").order("creado_en"), sb.from("tarea_lista_miembros").select("*")]);
    setL(a); setListas(b.data || []); setMiembros(c.data || []); setCargado(true);
  }, []);
  useEffect(() => {
    cargar();
    const f = () => { if (!document.hidden) cargar(); };
    addEventListener("sm-tareas", cargar); document.addEventListener("visibilitychange", f);
    const t = tiempos.current;
    return () => { removeEventListener("sm-tareas", cargar); document.removeEventListener("visibilitychange", f); t.forEach(clearTimeout); };
  }, [cargar]);
  const hoy = diaClave(ahoraBA()), manana = sumarDias(hoy, 1);
  const vis = useMemo(() => (filtro ? l.filter((t) => t.lista_id === filtro) : l), [l, filtro]);
  const g = useMemo(() => agruparTareas(vis, hoy), [vis, hoy]);
  const lista = v === "hoy" ? g.hoy : v === "proximas" ? g.proximas : g.hechas.slice(0, 60);
  const listaDe = (id: number | null) => listas.find((x) => x.id === id);

  async function sumar(e: React.FormEvent) {
    e.preventDefault();
    if (!txt.trim()) return;
    const { error } = await sb.from("tareas").insert({ perfil_id: perfil.id, titulo: txt.trim(), lista_id: filtro, fecha: v === "hoy" ? hoy : null, prioridad: "media", pasos: [], repetir: "no", hecha: false });
    if (error) return toast("No pude guardar. Probá de nuevo.");
    setTxt(""); navigator.vibrate?.(8); cargar();
  }
  async function tildar(t: any) {
    const nueva = !t.hecha;
    navigator.vibrate?.(10);
    setMarcando((x) => [...x, t.id]);
    const { error } = await sb.from("tareas").update({ hecha: nueva }).eq("id", t.id);
    if (error) { setMarcando((x) => x.filter((i) => i !== t.id)); return toast("No pude guardar. Probá de nuevo."); }
    if (nueva && t.repetir === "semanal") toast("Hecha. Vuelve la semana que viene.");
    if (nueva && v === "hoy" && g.hoy.length === 1) lanzarEfecto("listo", "Todo hecho por hoy");
    tiempos.current.push(setTimeout(() => { setMarcando((x) => x.filter((i) => i !== t.id)); cargar(); }, 680));
  }
  const vacio: [string, string, string] = v === "hoy" ? ["☀️", "Nada para hoy", "Escribí algo arriba y te queda para hoy."] : v === "proximas" ? ["🗓️", "Nada por delante", "Las tareas con fecha futura o sin fecha aparecen acá."] : ["✅", "Todavía no hay hechas", "Cuando marques una tarea, queda guardada acá."];
  return <div className="pagina pg-tareas">
    <div className="ag-cab"><h2 className="titulo">Tareas</h2><button className="ico-btn ag-mas pri" aria-label="Nueva tarea" onClick={() => setEd({})}><Icono n="mas" t={24} /></button></div>
    <form className="or-suma" onSubmit={sumar}>
      <input type="text" aria-label="Nueva tarea rápida" placeholder={v === "hoy" ? "¿Qué tenés que hacer hoy?" : "Nueva tarea"} value={txt} onChange={(e) => setTxt(e.target.value)} />
      <button className="cap-ok" type="submit" aria-label="Sumar tarea"><Icono n="mas" t={22} /></button>
    </form>
    <div className="segs or-segs">
      <button className="chip" style={{ flex: "none" }} aria-pressed={!filtro} onClick={() => setFiltro(null)}>Todas</button>
      {listas.map((x) => <button key={x.id} className="chip" aria-pressed={filtro === x.id} style={{ flex: "none" }} onClick={() => setFiltro(filtro === x.id ? null : x.id)}>{x.emoji} {x.nombre}</button>)}
      <button className="chip" style={{ flex: "none" }} onClick={() => setLh({})}><Icono n="mas" t={18} />Lista</button>
    </div>
    {filtro && listaDe(filtro) && <button className="or-enlace" onClick={() => setLh(listaDe(filtro))}><span>{listaDe(filtro).emoji} {listaDe(filtro).nombre}<small>{(() => { const n = miembros.filter((m) => m.lista_id === filtro).length; return n ? `Compartida con ${n} ${n === 1 ? "persona" : "personas"}` : "Solo vos"; })()}</small></span><Icono n="ajustes" t={20} /></button>}
    <div className="segs" role="tablist">{V.map(([k, n]) => { const c = k === "hoy" ? g.hoy.length : k === "proximas" ? g.proximas.length : 0; return <button key={k} className="seg" role="tab" aria-selected={v === k} onClick={() => setV(k)}>{n}{c ? ` ${c}` : ""}</button>; })}</div>
    {!cargado ? <div className="lista">{[0, 1, 2].map((i) => <div key={i} className="item esq"><i /><span><b /><small /></span></div>)}</div>
      : lista.length ? <div className="lista">{lista.map((t) => {
        const yendo = marcando.includes(t.id), si = t.hecha !== yendo, pasos = Array.isArray(t.pasos) ? t.pasos : [], li = listaDe(t.lista_id);
        const atras = t.fecha && t.fecha < hoy && !t.hecha;
        const datos = [t.fecha && fechaTarea(t.fecha, hoy, manana), pasos.length > 0 && `${pasos.filter((p: any) => p.h).length} de ${pasos.length} pasos`, t.repetir === "semanal" && "Cada semana", !filtro && li && `${li.emoji} ${li.nombre}`].filter(Boolean).join(", ");
        return <div key={t.id} className={`or-fila ${t.hecha ? "hecha" : ""} ${yendo ? "or-sale" : ""}`}>
          <Tilde si={si} tocar={() => tildar(t)} etiqueta={t.hecha ? `Desmarcar ${t.titulo}` : `Marcar ${t.titulo} como hecha`} disabled={yendo} />
          <button className="q" onClick={() => setEd(t)}><b>{t.titulo}</b>{datos && <small className={atras ? "tarde" : ""}>{datos}</small>}</button>
          {t.prioridad !== "media" && !t.hecha && <span className={`or-prio ${t.prioridad}`} role="img" aria-label={t.prioridad === "alta" ? "Prioridad alta" : "Prioridad baja"} />}
        </div>;
      })}</div> : <Vacio emoji={vacio[0]} titulo={vacio[1]} texto={vacio[2]} />}
    {ed && <TareaHoja x={ed.id ? ed : undefined} listas={listas} listaInicial={filtro} fechaInicial={v === "hoy" ? hoy : ""} cerrar={() => { setEd(null); cargar(); }} />}
    {lh && <ListaHoja x={lh.id ? lh : undefined} miembros={miembros} cerrar={(borrada) => { setLh(null); if (borrada) setFiltro(null); cargar(); }} />}
  </div>;
}
export default function P() { return <Suspense><Tareas /></Suspense>; }
