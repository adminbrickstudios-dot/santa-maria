"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { sb } from "@/lib/sb";
import { useSesion } from "@/lib/sesion";
import { Avatar } from "@/components/Avatar";
import { Icono } from "@/components/Icono";
import { ItemGuia } from "@/components/ItemGuia";

const nor = (t: string) => (t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const ATAJOS = [["SUBE", "SUBE"], ["Guardia", "guardia"], ["Alquiler", "alquiler"], ["Beca", "beca"], ["Descuento", "descuento"], ["Bodegón", "bodegón"]];
export default function Buscar() {
  const { personas, lugares } = useSesion();
  const [q, setQ] = useState(""), [g, setG] = useState<any[]>([]), [c, setC] = useState<any[]>([]), [item, setItem] = useState<any>(null);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) { setG([]); setC([]); return; }
    const id = setTimeout(async () => {
      const a = await sb.rpc("buscar_guia", { q: t }); setG(a.data || []);
      const b = await sb.from("carreras").select("id,nombre,universidad_id").ilike("nombre", `%${t}%`).limit(6); setC(b.data || []);
    }, 220);
    return () => clearTimeout(id);
  }, [q]);
  const n = nor(q.trim()), ps = n.length > 1 ? personas.filter((p) => nor(p.nombre).includes(n)) : [], ls = n.length > 1 ? lugares.filter((l) => nor(l.nombre).includes(n)) : [];
  const vacio = n.length > 1 && !ps.length && !ls.length && !g.length && !c.length;
  return <div className="pagina">
    <div className="campo"><label htmlFor="bq" className="titulo-m">¿Qué buscás?</label><input ref={ref} id="bq" type="search" placeholder="Gente, lugares, guía, carreras" value={q} onChange={(e) => setQ(e.target.value)} /></div>
    {n.length < 2 && <div className="chipera">{ATAJOS.map(([t, v]) => <button key={v} className="chip" onClick={() => setQ(v)}>{t}</button>)}</div>}
    {ps.length > 0 && <><h3 className="sec">Gente</h3><div className="lista">{ps.map((p) => <Link key={p.id} href={`/gente?persona=${p.id}`} className="item"><Avatar p={p} /><span className="q"><b>{p.nombre}</b><small>{p.barrio}</small></span></Link>)}</div></>}
    {ls.length > 0 && <><h3 className="sec">Lugares</h3><div className="lista">{ls.map((l) => <Link key={l.id} href={`/mapa?lat=${l.lat}&lon=${l.lon}&n=${encodeURIComponent(l.nombre)}`} className="item"><span className="ic"><Icono n="mapa" /></span><span className="q"><b>{l.nombre}</b><small>{l.descripcion}</small></span></Link>)}</div></>}
    {g.length > 0 && <><h3 className="sec">En la guía</h3><div className="lista">{g.slice(0, 12).map((i) => <button key={i.id} className="item" onClick={() => setItem(i)}><span className="q"><b>{i.titulo}</b><small>{i.bajada}</small></span></button>)}</div></>}
    {c.length > 0 && <><h3 className="sec">Carreras</h3><div className="lista">{c.map((x) => <Link key={x.id} href="/facu/carreras" className="item"><span className="ic"><Icono n="brujula" /></span><span className="q"><b>{x.nombre}</b></span></Link>)}</div></>}
    {vacio && <p className="vacio">No encontré nada con “{q}”.</p>}
    {item && <ItemGuia item={item} cerrar={() => setItem(null)} />}
  </div>;
}
