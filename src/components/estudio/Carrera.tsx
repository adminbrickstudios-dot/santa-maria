"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useState } from "react";
import { sb } from "@/lib/sb";
import { useSesion } from "@/lib/sesion";
import { Hoja } from "@/components/Hoja";
import { Icono } from "@/components/Icono";
import { COLORES } from "@/lib/util";
import { Vacio } from "@/components/organizar/Comun";
import { avanceCarrera, correlativasQueFaltan, numeroCorto, porAnio } from "./logica";

const ESTADOS: Record<string, string> = { pendiente: "Pendiente", cursando: "Cursando", regular: "Regular", aprobada: "Aprobada" };
const ANIOS = [1, 2, 3, 4, 5, 6, 7, 8];
const SIMBOLO: Record<string, string> = { aprobada: "✓", regular: "R", cursando: "C", pendiente: "" };

function MateriaForm({ m, materias, corr, cerrar }: { m?: any; materias: any[]; corr: any[]; cerrar: () => void }) {
  const { perfil, toast } = useSesion();
  const [f, setF] = useState<any>(m ? { ...m, nota: m.nota != null ? numeroCorto(+m.nota) : "" } : { nombre: "", estado: "pendiente", anio: 1, nota: "" });
  const [req, setReq] = useState<number[]>(m ? corr.filter((c) => c.materia_id === m.id).map((c) => c.requiere_id) : []);
  const otras = materias.filter((x) => x.id !== m?.id);
  async function guardar() {
    if (!f.nombre.trim()) return toast("Poné el nombre de la materia.");
    const nota = String(f.nota).trim() === "" ? null : +String(f.nota).replace(",", ".");
    if (nota != null && !(nota >= 0 && nota <= 10)) return toast("La nota va de 0 a 10.");
    const fila = { nombre: f.nombre.trim(), estado: f.estado, anio: f.anio ? +f.anio : null, nota };
    const r = m ? await sb.from("materias").update(fila).eq("id", m.id).select().single() : await sb.from("materias").insert({ ...fila, perfil_id: perfil.id, color: COLORES[materias.length % COLORES.length] }).select().single();
    if (r.error) return toast("No pude guardar.");
    const id = r.data.id;
    if (m) await sb.from("materia_correlativas").delete().eq("materia_id", id);
    if (req.length) { const e = await sb.from("materia_correlativas").insert(req.map((x) => ({ materia_id: id, requiere_id: x, perfil_id: perfil.id }))); if (e.error) return toast("No pude guardar las correlativas."); }
    window.dispatchEvent(new Event("sm-carrera")); cerrar();
  }
  async function borrar() { await sb.from("materias").delete().eq("id", m.id); window.dispatchEvent(new Event("sm-carrera")); cerrar(); }
  return <Hoja titulo={m ? m.nombre : "Nueva materia"} cerrar={cerrar}>
    <div className="campo"><label htmlFor="ca-n">Nombre</label><input id="ca-n" type="text" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></div>
    <div className="campo"><span>Estado</span><div className="chipera">{Object.entries(ESTADOS).map(([k, n]) => <button key={k} className="chip" aria-pressed={f.estado === k} onClick={() => setF({ ...f, estado: k })}>{n}</button>)}</div></div>
    <div className="dos">
      <div className="campo"><label htmlFor="ca-a">Año de la carrera</label><select id="ca-a" value={f.anio ?? ""} onChange={(e) => setF({ ...f, anio: e.target.value })}><option value="">Sin año</option>{ANIOS.map((a) => <option key={a} value={a}>{a}.º año</option>)}</select></div>
      <div className="campo"><label htmlFor="ca-t">Nota final</label><input id="ca-t" type="text" inputMode="decimal" value={f.nota} onChange={(e) => setF({ ...f, nota: e.target.value })} placeholder="Opcional" /></div>
    </div>
    {otras.length > 0 && <div className="campo"><span>Correlativas</span><small>Las materias que necesitás tener para cursar esta.</small><div className="chipera">{otras.map((x) => <button key={x.id} className="chip" aria-pressed={req.includes(x.id)} onClick={() => setReq(req.includes(x.id) ? req.filter((y) => y !== x.id) : [...req, x.id])}>{x.nombre}</button>)}</div></div>}
    <button className="btn pri" onClick={guardar}>Guardar</button>
    {m && <button className="btn mal chico" onClick={borrar}><Icono n="papelera" t={20} />Borrar materia</button>}
  </Hoja>;
}

function VariasForm({ materias, cerrar }: { materias: any[]; cerrar: () => void }) {
  const { perfil, toast } = useSesion();
  const [txt, setTxt] = useState(""), [anio, setAnio] = useState("1");
  const nombres = [...new Set(txt.split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim()).filter(Boolean))];
  async function guardar() {
    if (!nombres.length) return toast("Escribí una materia por línea.");
    const { error } = await sb.from("materias").insert(nombres.map((nombre, i) => ({ nombre, perfil_id: perfil.id, estado: "pendiente", anio: +anio, color: COLORES[(materias.length + i) % COLORES.length] })));
    if (error) return toast("No pude guardar.");
    window.dispatchEvent(new Event("sm-carrera")); cerrar();
  }
  return <Hoja titulo="Sumar varias materias" cerrar={cerrar}>
    <div className="campo"><label htmlFor="cv-a">Año de la carrera</label><select id="cv-a" value={anio} onChange={(e) => setAnio(e.target.value)}>{ANIOS.map((a) => <option key={a} value={a}>{a}.º año</option>)}</select></div>
    <div className="campo"><label htmlFor="cv-t">Materias</label><textarea id="cv-t" style={{ minHeight: 170 }} value={txt} onChange={(e) => setTxt(e.target.value)} placeholder={"Una por línea, copiadas del plan de estudios"} /><small>{nombres.length ? `${nombres.length} ${nombres.length === 1 ? "materia" : "materias"}` : "Después podés marcar el estado y las correlativas de cada una."}</small></div>
    <button className="btn pri" onClick={guardar}>Sumar</button>
  </Hoja>;
}

export function Carrera({ materias, cambio }: { materias: any[]; cambio: () => void }) {
  const [corr, setCorr] = useState<any[]>([]), [ed, setEd] = useState<any>(null), [varias, setVarias] = useState(false);
  const cargar = useCallback(async () => { const { data } = await sb.from("materia_correlativas").select("*"); setCorr(data || []); }, []);
  useEffect(() => { cargar(); const f = () => { cargar(); cambio(); }; addEventListener("sm-carrera", f); return () => removeEventListener("sm-carrera", f); }, [cargar, cambio]);
  const a = useMemo(() => avanceCarrera(materias), [materias]), grupos = useMemo(() => porAnio(materias), [materias]);
  const nombre = (id: number) => materias.find((m) => m.id === id)?.nombre;
  if (!materias.length) return <>
    <Vacio emoji="🎓" titulo="Cargá tu plan de estudios" texto="Sumá las materias de tu carrera por año y mirá cuánto te falta para recibirte."><button className="btn pri" onClick={() => setVarias(true)}>Sumar varias materias</button><button className="btn sec2 chico" onClick={() => setEd({})}>Sumar una</button></Vacio>
    {varias && <VariasForm materias={materias} cerrar={() => setVarias(false)} />}
    {ed && <MateriaForm materias={materias} corr={corr} cerrar={() => setEd(null)} />}
  </>;
  return <>
    <div className="or-tapa">
      <small>Avance de la carrera</small><b>{a.pct}%</b>
      <small>{a.aprobadas} de {a.total} aprobadas{a.regulares ? `, ${a.regulares} ${a.regulares === 1 ? "regular" : "regulares"}` : ""}</small>
      <div className="or-barra" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={a.pct} aria-label="Avance de la carrera"><i style={{ width: `${a.pct}%` }} /></div>
    </div>
    {grupos.map(([anio, l]) => <div key={anio} className="es-anio">
      <h3 className="sec">{anio ? `${anio}.º año` : "Sin año"}</h3>
      <div className="lista">{l.map((m) => {
        const faltan = m.estado === "pendiente" ? correlativasQueFaltan(m.id, materias, corr) : [];
        return <button key={m.id} className="item" style={{ minHeight: 58 }} onClick={() => setEd(m)}>
          <span className="es-punto" data-e={m.estado} aria-hidden="true">{SIMBOLO[m.estado]}</span>
          <span className="q"><b style={{ fontSize: 17 }}>{m.nombre}</b><small className={faltan.length ? "es-traba" : ""}>{faltan.length ? `Te falta ${faltan.map(nombre).filter(Boolean).join(", ")}` : `${ESTADOS[m.estado]}${m.nota != null ? `, nota ${numeroCorto(+m.nota)}` : ""}`}</small></span>
          <Icono n="chevron" t={18} />
        </button>;
      })}</div>
    </div>)}
    <div className="fila"><button className="btn pri chico" style={{ color: "#fff" }} onClick={() => setEd({})}><Icono n="mas" t={20} />Sumar materia</button><button className="btn sec2 chico" onClick={() => setVarias(true)}>Sumar varias</button></div>
    {ed && <MateriaForm m={ed.id ? ed : undefined} materias={materias} corr={corr} cerrar={() => setEd(null)} />}
    {varias && <VariasForm materias={materias} cerrar={() => setVarias(false)} />}
  </>;
}
