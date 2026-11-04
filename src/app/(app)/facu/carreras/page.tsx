"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { sb } from "@/lib/sb";
import { useSesion } from "@/lib/sesion";
import { Hoja } from "@/components/Hoja";
import { Icono } from "@/components/Icono";

const AREAS: Record<string, string> = { "arte-diseno": "Arte y diseño", ciencias: "Ciencias", "ciencias-sociales": "Ciencias sociales", comunicacion: "Comunicación", derecho: "Derecho", "economia-negocios": "Economía y negocios", educacion: "Educación", humanidades: "Humanidades", "ingenieria-tecnologia": "Ingeniería y tecnología", salud: "Salud" };

function Test({ cerrar, listo }: { cerrar: () => void; listo: (r: any) => void }) {
  const [ps, setPs] = useState<any[]>([]), [i, setI] = useState(0), [r, setR] = useState<Record<string, number>>({});
  useEffect(() => { sb.from("test_preguntas").select("*").order("id").then(({ data }: any) => setPs(data || [])); }, []);
  const p = ps[i];
  function responder(v: number) {
    const n: Record<string, number> = { ...r, [p.area]: (r[p.area] || 0) + v };
    setR(n);
    if (i + 1 < ps.length) setI(i + 1);
    else listo(Object.entries(n).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([area, puntos]) => ({ area, puntos })));
  }
  return <Hoja titulo="Test de orientación" cerrar={cerrar}>
    {p ? <>
      <div className="barrita"><i style={{ width: `${(i / ps.length) * 100}%` }} /></div>
      <p className="chico">Pregunta {i + 1} de {ps.length}</p>
      <p className="titulo-m">{p.texto}</p>
      <div style={{ display: "grid", gap: 8 }}>{([[2, "Me encanta"], [1, "Me interesa"], [0, "Me da igual"], [-1, "No es para mí"]] as [number, string][]).map(([v, t]) => <button key={t} className="btn sec2" onClick={() => responder(v)}>{t}</button>)}</div>
      <p className="chico">Es una brújula, no un diagnóstico. Para una orientación en serio mirá los servicios gratuitos en la guía.</p>
    </> : <p className="vacio">Cargando…</p>}
  </Hoja>;
}
export default function Carreras() {
  const { perfil, recargar, toast } = useSesion();
  async function esLaMia(c: any) { await sb.from("perfiles").update({ universidad_id: c.universidad_id, carrera_id: c.id, carrera_texto: c.nombre }).eq("id", perfil.id); await recargar(); setVer(null); toast("Listo, quedó en tu perfil."); }
  const [us, setU] = useState<any[]>([]), [cs, setC] = useState<any[]>([]), [area, setA] = useState(""), [uni, setUni] = useState(""), [q, setQ] = useState(""), [sel, setSel] = useState<any[]>([]), [ver, setVer] = useState<any>(null), [test, setTest] = useState(false), [comp, setComp] = useState(false);
  const res: any[] | null = perfil.test_resultado;
  useEffect(() => {
    sb.from("universidades").select("*").order("nombre").then(({ data }: any) => setU(data || []));
    sb.from("carreras").select("*").order("nombre").limit(1500).then(({ data }: any) => setC(data || []));
  }, []);
  const nomU = (id: string) => us.find((u) => u.id === id)?.nombre || id;
  const vis = useMemo(() => {
    const t = q.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    return cs.filter((c) => (!area || c.area === area) && (!uni || c.universidad_id === uni) && (!t || c.nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().includes(t)));
  }, [cs, area, uni, q]);
  async function guardarTest(r: any) {
    await sb.from("perfiles").update({ test_resultado: r }).eq("id", perfil.id);
    setTest(false); setArea(r[0]?.area || ""); await recargar(); toast("Listo. Te filtré las carreras por tu área más fuerte.");
  }
  function setArea(a: string) { setA(a); }
  const togglear = (c: any) => setSel((s) => s.some((x) => x.id === c.id) ? s.filter((x) => x.id !== c.id) : s.length < 3 ? [...s, c] : s);
  return <div className="pagina">
    <Link href="/facu" className="btn sec2 chico" style={{ justifySelf: "start" }}><Icono n="volver" />Facu</Link>
    <h2 className="titulo">Carreras en Buenos Aires</h2>
    <button className="grande" onClick={() => setTest(true)}><Icono n="brujula" /><span className="q"><b>{res ? "Repetir el test" : "No sé qué elegir"}</b><small>{res ? `Te dio: ${res.map((r) => AREAS[r.area]).join(", ")}` : "30 preguntas rápidas sobre lo que te gusta"}</small></span><Icono n="flecha" /></button>
    <div className="campo"><label htmlFor="bc">Buscar carrera</label><input id="bc" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ej: Diseño, Abogacía" /></div>
    <div className="dos">
      <div className="campo"><label htmlFor="fa">Área</label><select id="fa" value={area} onChange={(e) => setA(e.target.value)}><option value="">Todas</option>{Object.entries(AREAS).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></div>
      <div className="campo"><label htmlFor="fu">Universidad</label><select id="fu" value={uni} onChange={(e) => setUni(e.target.value)}><option value="">Todas</option>{us.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select></div>
    </div>
    {sel.length > 0 && <button className="btn pri" onClick={() => setComp(true)}>Comparar {sel.length} {sel.length === 1 ? "carrera" : "carreras"}</button>}
    <p className="expl">{vis.length} carreras. Marcá hasta 3 para compararlas.</p>
    <div className="lista">{vis.slice(0, 80).map((c) => <div key={c.id} className="item" style={{ padding: 0 }}>
      <button className="ico-btn" style={{ marginLeft: 8, color: sel.some((x) => x.id === c.id) ? "var(--ok)" : "var(--tinta3)" }} aria-label="Marcar para comparar" onClick={() => togglear(c)}><Icono n={sel.some((x) => x.id === c.id) ? "ok" : "tilde"} /></button>
      <button style={{ flex: 1, minWidth: 0, padding: "10px 14px 10px 0" }} onClick={() => setVer(c)}><span className="q" style={{ display: "block" }}><b style={{ display: "block", fontSize: 18 }}>{c.nombre}</b><small style={{ display: "block", color: "var(--tinta2)", fontSize: 15 }}>{nomU(c.universidad_id)}{c.duracion ? ` · ${c.duracion}` : ""}</small></span></button>
    </div>)}</div>
    {vis.length > 80 && <p className="expl">Mostrando 80. Filtrá para ver más.</p>}
    {test && <Test cerrar={() => setTest(false)} listo={guardarTest} />}
    {ver && <Hoja titulo={ver.nombre} cerrar={() => setVer(null)}><Detalle c={ver} u={us.find((x) => x.id === ver.universidad_id)} /><button className="btn pri" onClick={() => esLaMia(ver)}>Es la que estudio</button></Hoja>}
    {comp && <Hoja titulo="Comparar" cerrar={() => setComp(false)}>{sel.map((c) => <div key={c.id} className="tarjeta"><h3>{c.nombre}</h3><Detalle c={c} u={us.find((x) => x.id === c.universidad_id)} /></div>)}</Hoja>}
  </div>;
}
function Detalle({ c, u }: { c: any; u: any }) {
  const f: [string, string][] = [["Universidad", u?.nombre], ["Facultad", c.facultad], ["Título", c.titulo], ["Duración", c.duracion], ["Sede", c.sede], ["Modalidad", c.modalidad], ["Cómo se entra", u?.ingreso], ["Costo", u?.costo]].filter((x) => x[1]) as [string, string][];
  return <>{f.map(([k, v]) => <div key={k}><b style={{ fontSize: 14, color: "var(--tinta3)" }}>{k}</b><p>{v}</p></div>)}{c.enlace && <a className="btn sec2 chico" href={c.enlace} target="_blank" rel="noopener noreferrer"><Icono n="link" />Sitio oficial</a>}</>;
}
