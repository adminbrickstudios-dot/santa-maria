"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { useEffect, useState } from "react";
import { sb } from "@/lib/sb";
import { useSesion } from "@/lib/sesion";
import { Hoja } from "./Hoja";
import { Icono } from "./Icono";
import { MandarA } from "./MandarA";

export function ItemGuia({ item: i, cerrar }: { item: any; cerrar: () => void }) {
  const { perfil, toast } = useSesion();
  const [g, setG] = useState(false), [mandar, setMandar] = useState(false);
  useEffect(() => { sb.from("guardados").select("item_id").eq("item_id", i.id).then(({ data }: any) => setG(!!data?.length)); }, [i.id]);
  async function guardar() {
    if (g) await sb.from("guardados").delete().eq("item_id", i.id).eq("perfil_id", perfil.id);
    else await sb.from("guardados").insert({ item_id: i.id, perfil_id: perfil.id });
    setG(!g); toast(g ? "Lo sacaste de guardados." : "Guardado.");
  }
  const pasos: string[] = Array.isArray(i.pasos) ? i.pasos : [];
  return <Hoja titulo={i.titulo} cerrar={cerrar}>
    {i.dato && <p><span className="etiqueta amarilla" style={{ fontSize: 15 }}>{i.dato}</span></p>}
    {i.bajada && <p style={{ fontWeight: 700 }}>{i.bajada}</p>}
    {i.cuerpo && <p>{i.cuerpo}</p>}
    {pasos.length > 0 && <ol className="pasos-g">{pasos.map((p, k) => <li key={k}>{p}</li>)}</ol>}
    {(i.direccion || i.barrio) && <p className="expl">{[i.direccion, i.barrio].filter(Boolean).join(" · ")}</p>}
    {i.confianza === "media" && <p className="chico">Dato para confirmar antes de ir.</p>}
    <div className="fila">
      {i.lat != null && <Link className="btn pri" href={`/mapa?lat=${i.lat}&lon=${i.lon}&n=${encodeURIComponent(i.titulo)}`}><Icono n="mapa" />Cómo llego</Link>}
      {i.enlace && <a className="btn sec2" href={i.enlace} target="_blank" rel="noopener noreferrer"><Icono n="link" />Abrir sitio</a>}
      <button className="btn sec2" onClick={guardar}><Icono n="guardar" g={g ? 3 : 2} />{g ? "Guardado" : "Guardar"}</button>
      <button className="btn sec2" onClick={() => setMandar(true)}><Icono n="enviar" />Mandar</button>
    </div>
    {i.fuente_url && <p className="fuente">Fuente: <a href={i.fuente_url} target="_blank" rel="noopener noreferrer">{i.fuente_nombre || "ver"}</a>{i.vigente_a ? `, revisado en ${i.vigente_a}` : ""}</p>}
  {mandar && <MandarA texto={`Mirá esto: ${i.titulo}${i.dato ? ` (${i.dato})` : ""}${i.bajada ? `. ${i.bajada}` : ""}`} adjunto={i.lat != null ? { nombre: i.titulo, lat: i.lat, lon: i.lon } : null} cerrar={() => setMandar(false)} />}
  </Hoja>;
}
