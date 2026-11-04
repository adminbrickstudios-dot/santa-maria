"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { sb } from "@/lib/sb";
import { useSesion } from "@/lib/sesion";
import { Hoja } from "@/components/Hoja";
import { lanzarEfecto } from "@/components/Efectos";
import { aISO, claveDeISO, horaDeISO, OPC_AVISO, REPETIR, TIPOS } from "@/lib/agenda";
import { avisosDe } from "@/lib/interpretar";
import { Icono } from "@/components/Icono";
import dynamic from "next/dynamic";
const ElegirLugar = dynamic(() => import("@/components/ElegirLugar").then((m) => m.ElegirLugar), { ssr: false });

export function EventoForm({ e, dia, cerrar }: { e?: any; dia?: string; cerrar: () => void }) {
  const { perfil, toast } = useSesion();
  const [f, setF] = useState<any>(() => e ? { ...e, dia: claveDeISO(e.fecha), hora: e.todo_dia ? "" : horaDeISO(e.fecha), horaFin: e.fin ? horaDeISO(e.fin) : "" } : { titulo: "", tipo: "personal", dia, hora: "", horaFin: "", lugar_nombre: "", notas: "", repetir: "no", repetir_hasta: null, avisos: avisosDe("personal"), importante: false, materia_id: null });
  const [mats, setMats] = useState<any[]>([]), [elegir, setElegir] = useState(false);
  useEffect(() => { sb.from("materias").select("id,nombre").order("nombre").then(({ data }: any) => setMats(data || [])); }, []);
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));
  async function guardar() {
    if (!f.titulo.trim()) return toast("Poné qué es.");
    const fila = { perfil_id: e?.perfil_id || perfil.id, titulo: f.titulo.trim(), tipo: f.tipo, fecha: aISO(f.dia, f.hora || null), fin: f.hora && f.horaFin ? aISO(f.dia, f.horaFin) : null, todo_dia: !f.hora, lugar_nombre: f.lugar_nombre || null, lat: f.lat ?? null, lon: f.lon ?? null, notas: f.notas || null, repetir: f.repetir, repetir_hasta: f.repetir === "no" ? null : f.repetir_hasta || null, avisos: f.avisos, importante: f.importante, materia_id: f.materia_id ? +f.materia_id : null };
    const { error } = e ? await sb.from("eventos").update(fila).eq("id", e.id) : await sb.from("eventos").insert(fila);
    if (error) return toast("No se pudo guardar.");
    lanzarEfecto("listo"); window.dispatchEvent(new Event("sm-agenda")); cerrar();
  }
  return <Hoja titulo={e ? "Editar" : "Nuevo evento"} cerrar={cerrar}>
    <div className="campo"><label htmlFor="ef-t">Qué es</label><input id="ef-t" type="text" value={f.titulo} onChange={(x) => set("titulo", x.target.value)} /></div>
    <div className="cap-cats">{Object.entries(TIPOS).filter(([k]) => k !== "otro").map(([k, t]) => <button key={k} className="cap-cat" aria-pressed={f.tipo === k} style={{ "--c": t.c } as React.CSSProperties} onClick={() => setF((x: any) => ({ ...x, tipo: k, avisos: e ? x.avisos : avisosDe(k) }))}><i>{t.e}</i>{t.n}</button>)}</div>
    <div className="campo"><label htmlFor="ef-d">Día</label><input id="ef-d" type="date" value={f.dia} onChange={(x) => set("dia", x.target.value)} /></div>
    <div className="dos"><div className="campo"><label htmlFor="ef-h">Empieza</label><input id="ef-h" type="time" value={f.hora} onChange={(x) => set("hora", x.target.value)} /></div><div className="campo"><label htmlFor="ef-hf">Termina</label><input id="ef-hf" type="time" value={f.horaFin} onChange={(x) => set("horaFin", x.target.value)} disabled={!f.hora} /></div></div>
    <div className="campo"><label htmlFor="ef-l">Dónde</label><input id="ef-l" type="text" value={f.lugar_nombre || ""} onChange={(x) => set("lugar_nombre", x.target.value)} placeholder="Una dirección o lugar" /><button className="btn sec2 chico" onClick={() => setElegir(true)}><Icono n="pin" t={18} />{f.lat != null ? "Cambiar en el mapa" : "Marcar en el mapa"}</button></div>
    {elegir && <ElegirLugar titulo="Dónde es" inicial={{ lat: f.lat, lon: f.lon }} cerrar={() => setElegir(false)} listo={(l) => { setF((x: any) => ({ ...x, lat: l.lat, lon: l.lon, lugar_nombre: x.lugar_nombre || l.nombre })); setElegir(false); }} />}
    {mats.length > 0 && <div className="campo"><label htmlFor="ef-m">Materia</label><select id="ef-m" value={f.materia_id || ""} onChange={(x) => set("materia_id", x.target.value)}><option value="">Ninguna</option>{mats.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select></div>}
    <div className="campo"><label htmlFor="ef-r">Repetir</label><select id="ef-r" value={f.repetir} onChange={(x) => set("repetir", x.target.value)}>{REPETIR.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></div>
    {f.repetir !== "no" && <div className="campo"><label htmlFor="ef-rh">Hasta</label><input id="ef-rh" type="date" value={f.repetir_hasta || ""} onChange={(x) => set("repetir_hasta", x.target.value)} /></div>}
    <div className="campo"><span>Avisarme</span><div className="chipera">{OPC_AVISO.map(([m, n]) => <button key={m} className="chip" aria-pressed={f.avisos.includes(m)} onClick={() => set("avisos", f.avisos.includes(m) ? f.avisos.filter((q: number) => q !== m) : [...f.avisos, m])}>{n}</button>)}</div></div>
    <button className="chip" aria-pressed={f.importante} onClick={() => set("importante", !f.importante)}>⭐ Importante</button>
    <div className="campo"><label htmlFor="ef-n">Notas</label><textarea id="ef-n" value={f.notas || ""} onChange={(x) => set("notas", x.target.value)} /></div>
    <button className="btn pri" onClick={guardar}>Guardar</button>
  </Hoja>;
}
