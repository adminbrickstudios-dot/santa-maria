"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { sb } from "@/lib/sb";
import { nomEtiqueta } from "@/lib/util";
import { useSesion } from "@/lib/sesion";
import { Icono } from "@/components/Icono";
import { ItemGuia } from "@/components/ItemGuia";
import { ahoraBA } from "@/lib/util";

export default function Seccion() {
  const { seccion } = useParams<{ seccion: string }>();
  const { perfil } = useSesion();
  const [s, setS] = useState<any>(null), [l, setL] = useState<any[]>([]), [item, setItem] = useState<any>(null), [hechos, setH] = useState<Set<number>>(new Set()), [f, setF] = useState(""), [fiesta, setFiesta] = useState(false);
  useEffect(() => {
    sb.from("secciones_guia").select("*").eq("slug", seccion).single().then(({ data }: any) => setS(data));
    sb.from("guia_items").select("*").eq("seccion", seccion).order("orden").order("id").then(({ data }: any) => setL(data || []));
    sb.from("progreso_items").select("item_id").then(({ data }: any) => setH(new Set((data || []).map((x: any) => x.item_id))));
  }, [seccion]);
  const etiquetas = useMemo(() => { const c = new Map<string, number>(); l.forEach((i) => (i.etiquetas || []).forEach((e: string) => c.set(e, (c.get(e) || 0) + 1))); return [...c].filter((x) => x[1] > 1).sort((a, b) => b[1] - a[1]).slice(0, 10).map((x) => x[0]); }, [l]);
  async function tildar(i: any) {
    const n = new Set(hechos);
    if (n.has(i.id)) { n.delete(i.id); await sb.from("progreso_items").delete().eq("item_id", i.id).eq("perfil_id", perfil.id); }
    else { n.add(i.id); await sb.from("progreso_items").insert({ item_id: i.id, perfil_id: perfil.id }); }
    setH(n);
    if (l.every((x) => n.has(x.id))) { setFiesta(true); setTimeout(() => setFiesta(false), 2200); }
  }
  const hoyEt = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"][ahoraBA().getDay()];
  const vis = f ? l.filter((i) => (i.etiquetas || []).includes(f)) : l;
  const hechosSec = l.filter((i) => hechos.has(i.id)).length;
  return <div className="pagina">
    <Link href="/guia" className="btn sec2 chico" style={{ justifySelf: "start" }}><Icono n="volver" />Guía</Link>
    {s && <div><h2 className="titulo">{s.nombre}</h2><p className="expl">{s.descripcion}</p></div>}
    {s?.es_lista && l.length > 0 && <div className="tarjeta"><h3>{hechosSec} de {l.length} hechas</h3><div className="barrita"><i style={{ width: `${(hechosSec / l.length) * 100}%` }} /></div></div>}
    {etiquetas.length > 1 && <div className="segs"><button className="seg" aria-selected={!f} onClick={() => setF("")}>Todo</button>{seccion === "descuentos" && <button className="seg" aria-selected={f === hoyEt} onClick={() => setF(hoyEt)}>Hoy</button>}{etiquetas.map((e) => <button key={e} className="seg" aria-selected={f === e} onClick={() => setF(e)}>{nomEtiqueta(e)}</button>)}</div>}
    <div className="lista">{vis.map((i) => <div key={i.id} className="item" style={{ padding: 0 }}>
      {s?.es_lista && <button className="ico-btn" aria-label={hechos.has(i.id) ? "Marcar sin hacer" : "Marcar como hecha"} onClick={() => tildar(i)} style={{ marginLeft: 8, color: hechos.has(i.id) ? "var(--ok)" : "var(--tinta3)" }}><Icono n={hechos.has(i.id) ? "ok" : "tilde"} t={26} g={hechos.has(i.id) ? 3 : 2} /></button>}
      <button onClick={() => setItem(i)} style={{ flex: 1, minWidth: 0, padding: "10px 14px", display: "flex", gap: 10, alignItems: "center" }}><span className="q"><b style={{ textDecoration: hechos.has(i.id) && s?.es_lista ? "line-through" : "none" }}>{i.titulo}</b><small>{i.bajada}</small>{i.dato && <span className="etiqueta amarilla dato-item">{i.dato}</span>}</span></button>
    </div>)}</div>
    {!l.length && <p className="vacio">Cargando…</p>}
    {item && <ItemGuia item={item} cerrar={() => setItem(null)} />}
    {fiesta && <div className="fiesta" aria-hidden="true">{Array.from({ length: 34 }, (_, k) => <i key={k} style={{ left: `${(k * 37) % 100}%`, animationDelay: `${(k % 9) * 60}ms`, background: ["#FFD21F", "#2F7DF6", "#1E9E62", "#F2613F", "#7A5AF8"][k % 5] }} />)}</div>}
  </div>;
}
