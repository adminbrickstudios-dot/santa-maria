"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { sb } from "@/lib/sb";
import { useSesion } from "@/lib/sesion";
import { Avatar } from "@/components/Avatar";
import { Icono } from "@/components/Icono";
import { ItemGuia } from "@/components/ItemGuia";
import { fechaLarga, pesos } from "@/lib/util";

const nor = (t: string) => (t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const ATAJOS = [["SUBE", "SUBE"], ["Guardia", "guardia"], ["Alquiler", "alquiler"], ["Beca", "beca"], ["Descuento", "descuento"], ["Bodegón", "bodegón"]];
export default function Buscar() {
  const { personas, lugares } = useSesion();
  const [mas, setMas] = useState<any[]>([]), [q, setQ] = useState(""), [g, setG] = useState<any[]>([]), [c, setC] = useState<any[]>([]), [item, setItem] = useState<any>(null), [ev, setEv] = useState<any[]>([]), [mv, setMv] = useState<any[]>([]), [rs, setRs] = useState<any[]>([]);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) { setG([]); setC([]); setEv([]); setMv([]); setRs([]); setMas([]); return; }
    const id = setTimeout(async () => {
      const a = await sb.rpc("buscar_guia", { q: t }); setG(a.data || []);
      const pe = await sb.rpc("buscar_personas", { q: t, p_limite: 10 }); setMas(pe.data || []);
      const b = await sb.from("carreras").select("id,nombre,universidad_id").ilike("nombre", `%${t}%`).limit(6); setC(b.data || []);
      const lk = `%${t.replace(/[%_,()]/g, " ")}%`;
      const [e1, m1, r1] = await Promise.all([sb.from("eventos").select("id,titulo,fecha").ilike("titulo", lk).order("fecha", { ascending: false }).limit(5), sb.from("movimientos").select("id,tipo,monto,categoria,nota,fecha").ilike("nota", lk).order("fecha", { ascending: false }).limit(5), sb.from("resumenes").select("id,titulo,materia").ilike("titulo", lk).limit(5)]);
      setEv(e1.data || []); setMv(m1.data || []); setRs(r1.data || []);
    }, 220);
    return () => clearTimeout(id);
  }, [q]);
  const n = nor(q.trim()), ps = n.length > 1 ? [...personas.filter((p) => nor(p.nombre).includes(n)), ...mas.filter((m) => !personas.some((p) => p.id === m.id))] : [], ls = n.length > 1 ? lugares.filter((l) => nor(l.nombre).includes(n)) : [];
  const vacio = n.length > 1 && !ps.length && !ls.length && !g.length && !c.length && !ev.length && !mv.length && !rs.length;
  return <div className="pagina">
    <div className="campo"><label htmlFor="bq" className="titulo-m">¿Qué buscás?</label><input ref={ref} id="bq" type="search" placeholder="Gente, lugares, agenda, gastos, guía" value={q} onChange={(e) => setQ(e.target.value)} /></div>
    {n.length < 2 && <div className="chipera">{ATAJOS.map(([t, v]) => <button key={v} className="chip" onClick={() => setQ(v)}>{t}</button>)}</div>}
    {ps.length > 0 && <><h3 className="sec">Gente</h3><div className="lista">{ps.map((p) => <Link key={p.id} href={`/gente?persona=${p.id}`} className="item"><Avatar p={p} /><span className="q"><b>{p.nombre}</b><small>{p.barrio}</small></span></Link>)}</div></>}
    {ls.length > 0 && <><h3 className="sec">Lugares</h3><div className="lista">{ls.map((l) => <Link key={l.id} href={`/mapa?lat=${l.lat}&lon=${l.lon}&n=${encodeURIComponent(l.nombre)}`} className="item"><span className="ic"><Icono n="mapa" /></span><span className="q"><b>{l.nombre}</b><small>{l.descripcion}</small></span></Link>)}</div></>}
    {ev.length > 0 && <><h3 className="sec">En tu agenda</h3><div className="lista">{ev.map((x) => <Link key={x.id} href={`/agenda?e=${x.id}`} className="item"><span className="ic"><Icono n="calendario" /></span><span className="q"><b>{x.titulo}</b><small>{fechaLarga(x.fecha)}</small></span></Link>)}</div></>}
    {mv.length > 0 && <><h3 className="sec">En tu billetera</h3><div className="lista">{mv.map((x) => <Link key={x.id} href="/billetera" className="item"><span className="ic"><Icono n="billetera" /></span><span className="q"><b>{x.nota}</b><small>{x.categoria}, {x.fecha.slice(8)}/{x.fecha.slice(5, 7)}</small></span><span className="v">{pesos(+x.monto)}</span></Link>)}</div></>}
    {rs.length > 0 && <><h3 className="sec">Resúmenes</h3><div className="lista">{rs.map((x) => <Link key={x.id} href="/agenda?v=res" className="item"><span className="ic">📄</span><span className="q"><b>{x.titulo}</b><small>{x.materia}</small></span></Link>)}</div></>}
    {g.length > 0 && <><h3 className="sec">En la guía</h3><div className="lista">{g.slice(0, 12).map((i) => <button key={i.id} className="item" onClick={() => setItem(i)}><span className="q"><b>{i.titulo}</b><small>{i.bajada}</small></span></button>)}</div></>}
    {c.length > 0 && <><h3 className="sec">Carreras</h3><div className="lista">{c.map((x) => <Link key={x.id} href="/facu/carreras" className="item"><span className="ic"><Icono n="brujula" /></span><span className="q"><b>{x.nombre}</b></span></Link>)}</div></>}
    {vacio && <p className="vacio">No encontré nada con “{q}”.</p>}
    {item && <ItemGuia item={item} cerrar={() => setItem(null)} />}
  </div>;
}
