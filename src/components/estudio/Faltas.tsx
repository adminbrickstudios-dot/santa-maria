"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from "react";
import { sb, traerTodo } from "@/lib/sb";
import { useSesion } from "@/lib/sesion";
import { Hoja } from "@/components/Hoja";
import { Icono } from "@/components/Icono";
import { diaClave } from "@/lib/agenda";
import { ahoraBA } from "@/lib/util";
import { Vacio } from "@/components/organizar/Comun";
import { numeroCorto, resumenFaltas } from "./logica";

function frase(r: ReturnType<typeof resumenFaltas>) {
  if (r.quedan == null) return "Poné el tope para saber cuántas te quedan";
  if (r.quedan < 0) return `Te pasaste por ${numeroCorto(-r.quedan)}`;
  if (r.quedan === 0) return "No te queda ninguna";
  return r.quedan === 1 ? "Te queda 1 falta" : `Te quedan ${numeroCorto(r.quedan)} faltas`;
}
function MateriaHoja({ m, lista, cerrar }: { m: any; lista: any[]; cerrar: () => void }) {
  const { perfil, toast } = useSesion();
  const [tope, setTope] = useState(m.tope_faltas != null ? String(+m.tope_faltas) : ""), [fecha, setFecha] = useState(diaClave(ahoraBA())), [media, setMedia] = useState(false);
  async function guardarTope() {
    const n = tope.trim() === "" ? null : +tope.replace(",", ".");
    if (n != null && !(n >= 0)) return toast("Poné un número.");
    const { error } = await sb.from("materias").update({ tope_faltas: n }).eq("id", m.id);
    if (error) return toast("No pude guardar."); toast("Tope guardado."); window.dispatchEvent(new Event("sm-faltas"));
  }
  async function sumar() {
    const { error } = await sb.from("faltas").insert({ perfil_id: perfil.id, materia_id: m.id, fecha, cantidad: media ? 0.5 : 1 });
    if (error) return toast("No pude guardar."); window.dispatchEvent(new Event("sm-faltas"));
  }
  return <Hoja titulo={m.nombre} cerrar={cerrar}>
    <div className="campo"><label htmlFor="fa-t">Tope de faltas</label><div className="or-suma"><input id="fa-t" type="text" inputMode="decimal" value={tope} onChange={(e) => setTope(e.target.value)} placeholder="Ej: 6" /><button className="btn sec2 chico" onClick={guardarTope}>Guardar</button></div><small>Fijate cuántas permite la cátedra. Cambia según la materia.</small></div>
    <h3 className="sec">Sumar falta</h3>
    <div className="dos"><div className="campo"><label htmlFor="fa-f">Día</label><input id="fa-f" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
      <div className="campo"><span>Cuánto</span><div className="chipera"><button className="chip" aria-pressed={!media} onClick={() => setMedia(false)}>Entera</button><button className="chip" aria-pressed={media} onClick={() => setMedia(true)}>Media</button></div></div></div>
    <button className="btn pri" onClick={sumar}><Icono n="mas" />Sumar falta</button>
    {lista.length > 0 && <><h3 className="sec">Historial</h3><div className="lista">{lista.map((x) => <div key={x.id} className="item" style={{ minHeight: 52 }}><span className="q"><b style={{ fontSize: 16.5 }}>{x.fecha.slice(8)}/{x.fecha.slice(5, 7)}/{x.fecha.slice(0, 4)}</b>{+x.cantidad < 1 && <small>Media falta</small>}</span><button className="ico-btn" aria-label="Borrar falta" onClick={async () => { await sb.from("faltas").delete().eq("id", x.id); window.dispatchEvent(new Event("sm-faltas")); }}><Icono n="papelera" t={20} /></button></div>)}</div></>}
  </Hoja>;
}

export function Faltas({ materias, cambio, irACarrera }: { materias: any[]; cambio: () => void; irACarrera: () => void }) {
  const { perfil, toast } = useSesion();
  const [fal, setFal] = useState<any[]>([]), [abierta, setAbierta] = useState<number | null>(null);
  const cargar = useCallback(async () => { setFal(await traerTodo((d, h) => sb.from("faltas").select("*").order("fecha", { ascending: false }).order("id").range(d, h), 3000)); }, []);
  useEffect(() => { cargar(); const f = () => { cargar(); cambio(); }; addEventListener("sm-faltas", f); return () => removeEventListener("sm-faltas", f); }, [cargar, cambio]);
  const lista = materias.filter((m) => m.estado === "cursando"), m = materias.find((x) => x.id === abierta);
  const suma = (id: number) => fal.filter((x) => x.materia_id === id).reduce((a, x) => a + +x.cantidad, 0);
  async function una(id: number) {
    navigator.vibrate?.(12);
    const { error } = await sb.from("faltas").insert({ perfil_id: perfil.id, materia_id: id, fecha: diaClave(ahoraBA()), cantidad: 1 });
    if (error) return toast("No pude guardar."); cargar();
  }
  if (!lista.length) return <Vacio emoji="🙋" titulo="No tenés materias cursando" texto="Marcá como cursando las materias de este cuatrimestre y llevá la cuenta de las faltas de cada una."><button className="btn pri" onClick={irACarrera}>Ir a Carrera</button></Vacio>;
  return <>
    {lista.map((x) => {
      const r = resumenFaltas(suma(x.id), x.tope_faltas == null ? null : +x.tope_faltas);
      return <div key={x.id} className="es-falta" data-n={r.nivel}>
        <div className="es-falta-c">
          <button className="q" style={{ textAlign: "left" }} onClick={() => setAbierta(x.id)}><b>{x.nombre}</b><small>{frase(r)}</small></button>
          <button className="es-falta-mas" aria-label={`Sumar una falta en ${x.nombre}`} onClick={() => una(x.id)}><Icono n="mas" t={24} g={2.6} /></button>
        </div>
        {r.tope != null && <div className="or-barra" role="img" aria-label={`${numeroCorto(r.faltas)} de ${numeroCorto(r.tope)} faltas`}><i style={{ width: `${Math.max(r.faltas ? 4 : 0, r.pct)}%` }} /></div>}
        <button className="chico" style={{ textAlign: "left" }} onClick={() => setAbierta(x.id)}>{numeroCorto(r.faltas)}{r.tope != null ? ` de ${numeroCorto(r.tope)}` : ""} {r.faltas === 1 ? "falta" : "faltas"}. Tocá para ver el detalle.</button>
      </div>;
    })}
    {m && <MateriaHoja m={m} lista={fal.filter((x) => x.materia_id === m.id)} cerrar={() => setAbierta(null)} />}
  </>;
}
