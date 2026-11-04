"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useState } from "react";
import { sb } from "@/lib/sb";
import { useSesion } from "@/lib/sesion";
import { Hoja } from "@/components/Hoja";
import { Icono } from "@/components/Icono";
import { lanzarEfecto } from "@/components/Efectos";
import { diaClave } from "@/lib/agenda";
import { ahoraBA } from "@/lib/util";
import { Vacio } from "@/components/organizar/Comun";
import { diasTexto, parsearTarjetas, repasar, type Calidad } from "./logica";

const hoyK = () => diaClave(ahoraBA());
const NOTAS: [Calidad, string, string][] = [[1, "Otra vez", "#E5383B"], [3, "Difícil", "#E08A00"], [4, "Bien", "#10B765"], [5, "Fácil", "#1F7AFF"]];

function Repaso({ mazo, cartas, salir }: { mazo: any; cartas: any[]; salir: () => void }) {
  const { toast } = useSesion();
  const [cola, setCola] = useState(cartas), [vuelta, setVuelta] = useState(false), [hechas, setHechas] = useState(0), [ocupado, setOcupado] = useState(false), [ronda, setRonda] = useState(0);
  const hoy = hoyK(), c = cola[0], total = cartas.length;
  useEffect(() => { if (!cola.length) lanzarEfecto("listo"); }, [cola.length]);
  async function responder(q: Calidad) {
    if (ocupado) return;
    setOcupado(true);
    const n = repasar(c, q, hoy);
    const { error } = await sb.from("tarjetas").update(n).eq("id", c.id);
    setOcupado(false);
    if (error) return toast("No pude guardar. Probá de nuevo.");
    setVuelta(false); setRonda((r) => r + 1);
    /* La carta que no salió vuelve al final de esta misma tanda */
    if (q < 3) setCola((x) => [...x.slice(1), { ...c, ...n }]);
    else { setCola((x) => x.slice(1)); setHechas((h) => h + 1); }
  }
  if (!c) return <>
    <Vacio emoji="🎉" titulo="Terminaste el repaso" texto={`Repasaste ${total} ${total === 1 ? "tarjeta" : "tarjetas"} de ${mazo.nombre}. Volvé cuando te toque la próxima tanda.`}><button className="btn pri" onClick={salir}>Volver a los mazos</button></Vacio>
  </>;
  return <>
    <div className="ag-cab"><h3 className="titulo-m" style={{ flex: 1, minWidth: 0 }}>{mazo.nombre}</h3><button className="ico-btn ag-mas" onClick={salir} aria-label="Salir del repaso"><Icono n="x" t={22} /></button></div>
    <div className="or-barra" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={hechas} aria-label="Avance del repaso"><i style={{ width: `${(hechas / Math.max(1, total)) * 100}%` }} /></div>
    <div className="es-escena">
      <button key={ronda} className={`es-carta ${vuelta ? "vuelta" : ""}`} onClick={() => setVuelta(!vuelta)} aria-label={vuelta ? "Ver la pregunta" : "Ver la respuesta"}>
        <span className="es-cara" aria-hidden={vuelta}><small>Pregunta</small><p>{c.pregunta}</p><small>Tocá para dar vuelta</small></span>
        <span className="es-cara atras" aria-hidden={!vuelta}><small>Respuesta</small><p>{c.respuesta}</p></span>
      </button>
    </div>
    {vuelta ? <div className="es-notas">{NOTAS.map(([q, n, col]) => <button key={q} disabled={ocupado} style={{ "--c": col } as React.CSSProperties} onClick={() => responder(q)}>{n}<small>{q === 1 ? "de nuevo" : diasTexto(repasar(c, q, hoy).intervalo)}</small></button>)}</div>
      : <button className="btn pri" onClick={() => setVuelta(true)}>Ver la respuesta</button>}
    <p className="chico" style={{ textAlign: "center" }}>{cola.length} {cola.length === 1 ? "tarjeta" : "tarjetas"} por repasar</p>
  </>;
}

function MazoForm({ mazo, materias, cerrar }: { mazo?: any; materias: any[]; cerrar: (nuevo?: any) => void }) {
  const { perfil, toast } = useSesion();
  const [nombre, setNombre] = useState(mazo?.nombre || ""), [mat, setMat] = useState<string>(mazo?.materia_id ? String(mazo.materia_id) : "");
  async function guardar() {
    const n = nombre.trim() || materias.find((m) => m.id === +mat)?.nombre;
    if (!n) return toast("Ponele un nombre o elegí una materia.");
    const fila = { perfil_id: perfil.id, nombre: n, materia_id: mat ? +mat : null };
    const { data, error } = mazo ? await sb.from("mazos").update(fila).eq("id", mazo.id).select().single() : await sb.from("mazos").insert(fila).select().single();
    if (error) return toast("No pude guardar. Probá de nuevo.");
    cerrar(data);
  }
  return <Hoja titulo={mazo ? "Editar mazo" : "Nuevo mazo"} cerrar={() => cerrar()}>
    <div className="campo"><label htmlFor="mz-m">Materia</label><select id="mz-m" value={mat} onChange={(e) => setMat(e.target.value)}><option value="">Sin materia</option>{materias.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select></div>
    <div className="campo"><label htmlFor="mz-n">Nombre del mazo</label><input id="mz-n" type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Unidad 2" /></div>
    <button className="btn pri" onClick={guardar}>Guardar</button>
  </Hoja>;
}

function CartaForm({ c, cerrar }: { c: any; cerrar: () => void }) {
  const { toast } = useSesion();
  const [p, setP] = useState(c.pregunta), [r, setR] = useState(c.respuesta);
  async function guardar() {
    if (!p.trim() || !r.trim()) return toast("Completá pregunta y respuesta.");
    const { error } = await sb.from("tarjetas").update({ pregunta: p.trim(), respuesta: r.trim() }).eq("id", c.id);
    if (error) return toast("No pude guardar."); cerrar();
  }
  return <Hoja titulo="Editar tarjeta" cerrar={cerrar}>
    <div className="campo"><label htmlFor="cf-p">Pregunta</label><textarea id="cf-p" value={p} onChange={(e) => setP(e.target.value)} /></div>
    <div className="campo"><label htmlFor="cf-r">Respuesta</label><textarea id="cf-r" value={r} onChange={(e) => setR(e.target.value)} /></div>
    <button className="btn pri" onClick={guardar}>Guardar</button>
    <button className="btn mal chico" onClick={async () => { await sb.from("tarjetas").delete().eq("id", c.id); cerrar(); }}><Icono n="papelera" t={20} />Borrar tarjeta</button>
  </Hoja>;
}

function MazoHoja({ mazo, cartas, materias, cerrar, repasarYa }: { mazo: any; cartas: any[]; materias: any[]; cerrar: () => void; repasarYa: () => void }) {
  const { perfil, toast } = useSesion();
  const [texto, setTexto] = useState(""), [ed, setEd] = useState<any>(null), [editar, setEditar] = useState(false), [ocupado, setOcupado] = useState(false);
  const leido = useMemo(() => parsearTarjetas(texto), [texto]);
  async function sumar() {
    if (!leido.ok.length) return toast("Escribí una línea por tarjeta: pregunta: respuesta");
    setOcupado(true);
    const { error } = await sb.from("tarjetas").insert(leido.ok.map((x) => ({ ...x, perfil_id: perfil.id, mazo_id: mazo.id })));
    setOcupado(false);
    if (error) return toast("No pude guardar las tarjetas.");
    toast(leido.ok.length === 1 ? "Sumé 1 tarjeta." : `Sumé ${leido.ok.length} tarjetas.`);
    setTexto(leido.malas.join("\n")); window.dispatchEvent(new Event("sm-tarjetas"));
  }
  async function borrarMazo() { await sb.from("mazos").delete().eq("id", mazo.id); window.dispatchEvent(new Event("sm-tarjetas")); cerrar(); }
  return <>
  <Hoja titulo={mazo.nombre} cerrar={cerrar}>
    {cartas.length > 0 && <button className="btn pri" onClick={repasarYa}>Repasar todas ({cartas.length})</button>}
    <div className="campo">
      <label htmlFor="mz-t">Pegá tus tarjetas</label>
      <textarea id="mz-t" style={{ minHeight: 130 }} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={"Una por línea, así:\nPregunta: respuesta\nCapital de Francia: París"} />
      <small>{texto.trim() ? `${leido.ok.length} ${leido.ok.length === 1 ? "tarjeta lista" : "tarjetas listas"}${leido.malas.length ? `. ${leido.malas.length} sin los dos puntos: quedan acá para que las arregles.` : ""}` : "Cada línea con dos puntos se convierte en una tarjeta."}</small>
    </div>
    <button className="btn sec2" disabled={ocupado || !leido.ok.length} onClick={sumar}><Icono n="mas" />Crear tarjetas</button>
    {cartas.length > 0 && <>
      <h3 className="sec">Tarjetas del mazo</h3>
      <div className="lista">{cartas.map((c) => <button key={c.id} className="item" style={{ minHeight: 54 }} onClick={() => setEd(c)}><span className="q"><b style={{ fontSize: 16 }}>{c.pregunta}</b><small>{c.respuesta}</small></span></button>)}</div>
    </>}
    <div className="fila">
      <button className="btn sec2 chico" onClick={() => setEditar(true)}><Icono n="lapiz" t={20} />Editar mazo</button>
      <button className="btn mal chico" onClick={borrarMazo}><Icono n="papelera" t={20} />Borrar mazo</button>
    </div>
  </Hoja>
  {ed && <CartaForm c={ed} cerrar={() => { setEd(null); window.dispatchEvent(new Event("sm-tarjetas")); }} />}
  {editar && <MazoForm mazo={mazo} materias={materias} cerrar={() => { setEditar(false); window.dispatchEvent(new Event("sm-tarjetas")); }} />}
  </>;
}

export function Tarjetas({ materias }: { materias: any[] }) {
  const [mazos, setM] = useState<any[]>([]), [cartas, setC] = useState<any[]>([]), [cargado, setCargado] = useState(false);
  const [nuevo, setNuevo] = useState(false), [abierto, setAbierto] = useState<number | null>(null), [repaso, setRepaso] = useState<{ mazo: any; cartas: any[] } | null>(null);
  const cargar = useCallback(async () => {
    const [a, b] = await Promise.all([sb.from("mazos").select("*").order("creado_en"), sb.from("tarjetas").select("*").order("id").limit(5000)]);
    setM(a.data || []); setC(b.data || []); setCargado(true);
  }, []);
  useEffect(() => { cargar(); addEventListener("sm-tarjetas", cargar); return () => removeEventListener("sm-tarjetas", cargar); }, [cargar]);
  const hoy = hoyK(), mz = mazos.find((m) => m.id === abierto);
  const de = (id: number) => cartas.filter((c) => c.mazo_id === id), toca = (id: number) => de(id).filter((c) => c.vence <= hoy);
  const totalToca = cartas.filter((c) => c.vence <= hoy).length;
  function arrancar(m: any, lista: any[]) { setAbierto(null); setRepaso({ mazo: m, cartas: lista }); }
  if (repaso) return <Repaso mazo={repaso.mazo} cartas={repaso.cartas} salir={() => { setRepaso(null); cargar(); }} />;
  return <>
    {cartas.length > 0 && <div className="or-tapa"><small>Para repasar hoy</small><b>{totalToca} {totalToca === 1 ? "tarjeta" : "tarjetas"}</b>{!totalToca && <small>Estás al día.</small>}</div>}
    {cargado && !mazos.length && <Vacio emoji="🃏" titulo="Armá tu primer mazo" texto="Pegá apuntes con el formato pregunta: respuesta y te los voy tomando justo cuando se te empiezan a olvidar." />}
    {mazos.length > 0 && <div className="lista">{mazos.map((m) => {
      const n = de(m.id).length, t = toca(m.id).length, mat = materias.find((x) => x.id === m.materia_id);
      return <div key={m.id} className="item">
        <button className="q" style={{ textAlign: "left" }} onClick={() => setAbierto(m.id)}><b>{m.nombre}</b><small>{[mat?.nombre, n ? `${n} ${n === 1 ? "tarjeta" : "tarjetas"}` : "Sin tarjetas todavía"].filter(Boolean).join(", ")}</small></button>
        {t > 0 ? <button className="btn pri chico" style={{ color: "#fff" }} onClick={() => arrancar(m, toca(m.id))}>Repasar {t}</button> : <button className="ico-btn" aria-label={`Abrir ${m.nombre}`} onClick={() => setAbierto(m.id)}><Icono n="chevron" t={18} /></button>}
      </div>;
    })}</div>}
    <button className={`btn ${mazos.length ? "sec2" : "pri"}`} onClick={() => setNuevo(true)}><Icono n="mas" />Nuevo mazo</button>
    {nuevo && <MazoForm materias={materias} cerrar={(n) => { setNuevo(false); if (n) { cargar().then(() => setAbierto(n.id)); } }} />}
    {mz && <MazoHoja mazo={mz} cartas={de(mz.id)} materias={materias} cerrar={() => setAbierto(null)} repasarYa={() => arrancar(mz, de(mz.id))} />}
  </>;
}
