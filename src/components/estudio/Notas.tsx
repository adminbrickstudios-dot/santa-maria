"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from "react";
import { sb } from "@/lib/sb";
import { useSesion } from "@/lib/sesion";
import { Hoja } from "@/components/Hoja";
import { Icono } from "@/components/Icono";
import { diaClave } from "@/lib/agenda";
import { ahoraBA } from "@/lib/util";
import { Vacio } from "@/components/organizar/Comun";
import { cuantoNecesito, numeroCorto, promedio } from "./logica";

const TIPOS: Record<string, string> = { parcial: "Parcial", tp: "TP", final: "Final", otro: "Otra" };
const leer = (t: string) => +String(t).replace(",", ".");

function NotaForm({ m, x, cerrar }: { m: any; x?: any; cerrar: () => void }) {
  const { perfil, toast } = useSesion();
  const [f, setF] = useState<any>(x ? { ...x, nota: numeroCorto(+x.nota), peso: numeroCorto(+x.peso) } : { tipo: "parcial", titulo: "", nota: "", peso: "1", fecha: diaClave(ahoraBA()) });
  async function guardar() {
    const nota = leer(f.nota), peso = leer(f.peso);
    if (String(f.nota).trim() === "" || !(nota >= 0 && nota <= 10)) return toast("Poné una nota de 0 a 10.");
    if (!(peso > 0)) return toast("El peso tiene que ser mayor a 0.");
    const fila = { perfil_id: perfil.id, materia_id: m.id, tipo: f.tipo, titulo: f.titulo?.trim() || null, nota, peso, fecha: f.fecha };
    const { error } = x ? await sb.from("calificaciones").update(fila).eq("id", x.id) : await sb.from("calificaciones").insert(fila);
    if (error) return toast("No pude guardar."); cerrar();
  }
  return <Hoja titulo={x ? "Editar nota" : `Nota en ${m.nombre}`} cerrar={cerrar}>
    <div className="chipera">{Object.entries(TIPOS).map(([k, n]) => <button key={k} className="chip" aria-pressed={f.tipo === k} onClick={() => setF({ ...f, tipo: k })}>{n}</button>)}</div>
    <div className="dos"><div className="campo"><label htmlFor="no-n">Nota</label><input id="no-n" type="text" inputMode="decimal" value={f.nota} onChange={(e) => setF({ ...f, nota: e.target.value })} placeholder="Ej: 7,5" /></div>
      <div className="campo"><label htmlFor="no-p">Cuánto pesa</label><input id="no-p" type="text" inputMode="decimal" value={f.peso} onChange={(e) => setF({ ...f, peso: e.target.value })} /></div></div>
    <p className="chico">Si todas valen igual, dejá 1. Si un parcial vale el doble que un TP, ponele 2.</p>
    <div className="campo"><label htmlFor="no-t">Nombre (opcional)</label><input id="no-t" type="text" value={f.titulo || ""} onChange={(e) => setF({ ...f, titulo: e.target.value })} placeholder="Ej: Primer parcial" /></div>
    <div className="campo"><label htmlFor="no-f">Fecha</label><input id="no-f" type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} /></div>
    <button className="btn pri" onClick={guardar}>Guardar</button>
    {x && <button className="btn mal chico" onClick={async () => { await sb.from("calificaciones").delete().eq("id", x.id); cerrar(); }}><Icono n="papelera" t={20} />Borrar</button>}
  </Hoja>;
}

function Necesito({ m, notas }: { m: any; notas: any[] }) {
  const [obj, setObj] = useState(m.nota_objetivo != null ? numeroCorto(+m.nota_objetivo) : ""), [peso, setPeso] = useState("1");
  const o = leer(obj), p = leer(peso), valido = obj.trim() !== "" && o > 0 && o <= 10 && p > 0;
  const r = valido ? cuantoNecesito(notas, o, p) : null;
  async function guardarObjetivo() { if (obj.trim() === "" || valido) await sb.from("materias").update({ nota_objetivo: obj.trim() === "" ? null : o }).eq("id", m.id); }
  return <div className="es-necesito">
    <div className="dos">
      <div className="campo"><label htmlFor={`ob-${m.id}`}>Quiero llegar a</label><input id={`ob-${m.id}`} type="text" inputMode="decimal" value={obj} onChange={(e) => setObj(e.target.value)} onBlur={guardarObjetivo} placeholder="Ej: 7" /></div>
      <div className="campo"><label htmlFor={`pe-${m.id}`}>La próxima pesa</label><input id={`pe-${m.id}`} type="text" inputMode="decimal" value={peso} onChange={(e) => setPeso(e.target.value)} /></div>
    </div>
    {r && <p role="status">{r.estado === "ya" ? <>Ya llegaste: <b>con cualquier nota</b> te da.</> : r.estado === "imposible" ? <>Necesitarías <b>{numeroCorto(r.nota)}</b>: con una sola nota no alcanza.</> : <>En la próxima necesitás <b>{numeroCorto(r.nota)}</b>.</>}</p>}
  </div>;
}

export function Notas({ materias, irACarrera }: { materias: any[]; irACarrera: () => void }) {
  const [cal, setCal] = useState<any[]>([]), [form, setForm] = useState<{ m: any; x?: any } | null>(null);
  const cargar = useCallback(async () => { const { data } = await sb.from("calificaciones").select("*").order("fecha").limit(3000); setCal(data || []); }, []);
  useEffect(() => { cargar(); }, [cargar]);
  const conNotas = new Set(cal.map((c) => c.materia_id));
  const lista = materias.filter((m) => m.estado === "cursando" || conNotas.has(m.id));
  if (!lista.length) return <Vacio emoji="📝" titulo="Sumá tus materias" texto="Cargá parciales y TPs, mirá tu promedio y calculá cuánto necesitás en el próximo."><button className="btn pri" onClick={irACarrera}>Ir a Carrera</button></Vacio>;
  return <>
    {lista.map((m) => {
      const n = cal.filter((c) => c.materia_id === m.id).map((c) => ({ ...c, nota: +c.nota, peso: +c.peso })), p = promedio(n);
      return <div key={m.id} className="tarjeta">
        <div className="es-nota-c"><span className="q"><h3>{m.nombre}</h3></span>{p != null && <span className="es-prom" aria-label={`Promedio ${numeroCorto(+p.toFixed(2))}`}>{numeroCorto(+p.toFixed(2))}</span>}</div>
        {n.length > 0 && <div className="lista" style={{ background: "var(--hoja2)" }}>{n.map((c) => <button key={c.id} className="item" style={{ minHeight: 50 }} onClick={() => setForm({ m, x: c })}><span className="q"><b style={{ fontSize: 16 }}>{c.titulo || TIPOS[c.tipo]}</b>{+c.peso !== 1 && <small>Pesa {numeroCorto(c.peso)}</small>}</span><span className="v">{numeroCorto(c.nota)}</span></button>)}</div>}
        {n.length > 0 && <Necesito m={m} notas={n} />}
        <button className="btn sec2 chico" onClick={() => setForm({ m })}><Icono n="mas" t={20} />Sumar nota</button>
      </div>;
    })}
    {form && <NotaForm m={form.m} x={form.x} cerrar={() => { setForm(null); cargar(); }} />}
  </>;
}
