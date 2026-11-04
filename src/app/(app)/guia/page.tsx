"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { sb } from "@/lib/sb";
import { Icono } from "@/components/Icono";
import { ItemGuia } from "@/components/ItemGuia";

function Guia() {
  const q = useSearchParams();
  const [bl, setBl] = useState<any[]>([]), [se, setSe] = useState<any[]>([]), [abierto, setAb] = useState<string | null>(null);
  const [txt, setTxt] = useState(""), [res, setRes] = useState<any[] | null>(null), [item, setItem] = useState<any>(null), [guard, setGuard] = useState<any[]>([]);
  const verGuard = q.get("v") === "guardados";
  useEffect(() => {
    sb.from("bloques_guia").select("*").order("orden").then(({ data }: any) => setBl(data || []));
    sb.from("secciones_guia").select("*").order("orden").then(({ data }: any) => setSe(data || []));
    if (verGuard) sb.from("guardados").select("guia_items(*)").then(({ data }: any) => setGuard((data || []).map((x: any) => x.guia_items)));
  }, [verGuard]);
  useEffect(() => {
    const t = txt.trim();
    if (t.length < 3) { setRes(null); return; }
    const id = setTimeout(() => sb.rpc("buscar_guia", { q: t }).then(({ data }: any) => setRes(data || [])), 250);
    return () => clearTimeout(id);
  }, [txt]);
  if (verGuard) return <div className="pagina">
    <Link href="/guia" className="btn sec2 chico" style={{ justifySelf: "start" }}><Icono n="volver" />Guía</Link>
    <h2 className="titulo">Guardados</h2>
    {guard.length ? <div className="lista">{guard.map((i) => <button key={i.id} className="item" onClick={() => setItem(i)}><span className="q"><b>{i.titulo}</b><small>{i.bajada}</small></span></button>)}</div> : <p className="expl">Tocá Guardar en cualquier cosa de la guía y queda acá.</p>}
    {item && <ItemGuia item={item} cerrar={() => setItem(null)} />}
  </div>;
  return <div className="pagina">
    <h2 className="titulo">Buenos Aires, explicada</h2>
    <div className="campo"><label htmlFor="bg">Buscá lo que necesites</label><input id="bg" type="search" placeholder="Ej: SUBE, guardia, alquiler, descuentos" value={txt} onChange={(e) => setTxt(e.target.value)} /></div>
    {res && (res.length ? <div className="lista">{res.map((i) => <button key={i.id} className="item" onClick={() => setItem(i)}><span className="q"><b>{i.titulo}</b><small>{i.bajada}</small></span></button>)}</div> : <p className="expl">No encontré nada con eso.</p>)}
    {!res && bl.map((b) => {
      const ab = abierto === b.slug, ss = se.filter((s) => s.bloque === b.slug);
      return <div key={b.slug} style={{ display: "grid", gap: 8 }}>
        <button className="bloque" aria-expanded={ab} onClick={() => setAb(ab ? null : b.slug)}><span className="ic"><Icono n={b.icono} t={28} /></span><span style={{ flex: 1, minWidth: 0 }}><b>{b.nombre}</b><small>{b.descripcion}</small></span></button>
        {ab && <div className="lista">{ss.map((s) => <Link key={s.slug} href={`/guia/${s.slug}`} className="item"><span className="ic"><Icono n={s.icono} /></span><span className="q"><b>{s.nombre}</b><small>{s.descripcion}</small></span></Link>)}</div>}
      </div>;
    })}
    {item && <ItemGuia item={item} cerrar={() => setItem(null)} />}
  </div>;
}
export default function P() { return <Suspense><Guia /></Suspense>; }
