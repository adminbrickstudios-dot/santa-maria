"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { sb } from "@/lib/sb";
import { useSesion } from "@/lib/sesion";
import { Icono } from "@/components/Icono";
import { abrirCaptura } from "@/components/Captura";
import { EventoHoja } from "@/components/agenda/EventoHoja";
import { EventoForm } from "@/components/agenda/EventoForm";
import { Conectar } from "@/components/agenda/Conectar";
import { Resumenes } from "@/components/agenda/Resumenes";
import { claveDeISO, diaClave, expandir, horaDeISO, leerICS, TIPOS, type Ocurrencia } from "@/lib/agenda";
import { ahoraBA, faltan } from "@/lib/util";

const MES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const SEM = ["L", "M", "M", "J", "V", "S", "D"];
const NOMDIA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const colorDe = (e: any) => e.color || TIPOS[e.tipo]?.c || "#8E8E93";
function Fila({ o, abrir }: { o: Ocurrencia; abrir: (o: Ocurrencia) => void }) {
  const e = o.e, t = TIPOS[e.tipo] || TIPOS.otro;
  return <button className="ag-ev" onClick={() => abrir(o)} style={{ "--c": colorDe(e) } as React.CSSProperties}>
    <span className="ag-hora">{e.todo_dia ? "Todo el día" : horaDeISO(o.cuando)}</span>
    <span className="q"><b style={e.hecho ? { textDecoration: "line-through", opacity: .5 } : undefined}>{e.importante ? "⭐ " : ""}{e.titulo}</b><small>{e.externo || [t.n, e.lugar_nombre].filter(Boolean).join(". ")}</small></span>
    <Icono n="chevron" t={16} />
  </button>;
}
function Agenda() {
  const { perfil } = useSesion(), q = useSearchParams();
  const hoyD = ahoraBA(), hoy = diaClave(hoyD);
  const [mes, setMes] = useState({ a: hoyD.getFullYear(), m: hoyD.getMonth() }), [sel, setSel] = useState(hoy), [v, setV] = useState("mes");
  const [ev, setEv] = useState<any[]>([]), [extra, setExtra] = useState<any[]>([]), [ext, setExt] = useState<{ txt: string; c: any }[]>([]);
  const [ab, setAb] = useState<Ocurrencia | null>(null), [nuevo, setNuevo] = useState<string | null>(null), [con, setCon] = useState(false), [dir, setDir] = useState(0);
  const cargar = useCallback(async () => {
    const [{ data: e }, { data: c }, { data: j }, { data: cal }] = await Promise.all([
      sb.from("eventos").select("*").order("fecha").limit(3000),
      sb.from("clases").select("*, materias(nombre,color)"),
      sb.from("juntadas").select("id,titulo,cuando,lugar_nombre,lat,lon,juntada_respuestas(perfil_id,estado)").gte("cuando", new Date(Date.now() - 60 * 864e5).toISOString()),
      sb.from("calendarios_externos").select("*"),
    ]);
    setEv(e || []);
    /* Las clases y juntadas también caen en el calendario */
    const lun = new Date(hoyD); lun.setMonth(lun.getMonth() - 2);
    setExtra([
      ...(c || []).map((k: any) => { const d = new Date(lun); d.setDate(d.getDate() + ((k.dia - d.getDay() + 7) % 7)); return { id: `c${k.id}`, soloVer: "/facu", titulo: k.materias?.nombre || "Clase", tipo: "clase", color: k.materias?.color, fecha: new Date(`${diaClave(d)}T${k.hora_inicio.slice(0, 5)}:00-03:00`).toISOString(), repetir: "semanal", lugar_nombre: k.aula ? `Aula ${k.aula}` : null }; }),
      ...(j || []).filter((x: any) => x.juntada_respuestas?.some((r: any) => r.perfil_id === perfil.id && r.estado !== "no")).map((x: any) => ({ id: `j${x.id}`, soloVer: "/gente/juntadas", titulo: x.titulo, tipo: "juntada", fecha: x.cuando, repetir: "no", lugar_nombre: x.lugar_nombre })),
    ]);
    const { data: ses } = await sb.auth.getSession();
    const rs = await Promise.all((cal || []).map(async (x: any) => ({ c: x, txt: await fetch(`/api/cal/externo?id=${x.id}`, { headers: { Authorization: `Bearer ${ses.session?.access_token}` } }).then((r) => (r.ok ? r.text() : "")).catch(() => "") })));
    setExt(rs.filter((x) => x.txt));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil.id]);
  useEffect(() => { cargar(); const f = () => cargar(); addEventListener("sm-agenda", f); return () => removeEventListener("sm-agenda", f); }, [cargar]);
  useEffect(() => { const id = q.get("e"); if (!id || !ev.length) return; const e = ev.find((x) => String(x.id) === id); if (e) setAb({ e, dia: claveDeISO(e.fecha), cuando: e.fecha }); }, [q, ev]);
  const rango = useMemo(() => { const d = new Date(mes.a, mes.m, 1); d.setDate(d.getDate() - 7); const h = new Date(mes.a, mes.m + 1, 8); return [diaClave(d), diaClave(h)]; }, [mes]);
  const ocs = useMemo(() => [...expandir([...ev, ...extra], rango[0], rango[1]), ...ext.flatMap((x) => leerICS(x.txt, x.c.nombre, x.c.color, rango[0], rango[1]))], [ev, extra, ext, rango]);
  const porDia = useMemo(() => { const m = new Map<string, Ocurrencia[]>(); for (const o of ocs) { if (!m.has(o.dia)) m.set(o.dia, []); m.get(o.dia)!.push(o); } return m; }, [ocs]);
  const celdas = useMemo(() => { const p = new Date(mes.a, mes.m, 1), ini = (p.getDay() + 6) % 7, n = new Date(mes.a, mes.m + 1, 0).getDate(), l: (string | null)[] = Array(ini).fill(null); for (let i = 1; i <= n; i++) l.push(diaClave(new Date(mes.a, mes.m, i))); return l; }, [mes]);
  const proximos = useMemo(() => expandir(ev.filter((e) => ["parcial", "final", "entrega", "tp"].includes(e.tipo) && !e.hecho), hoy, "2099-01-01").slice(0, 8), [ev, hoy]);
  const lista = useMemo(() => { const f = new Date(hoyD); f.setDate(f.getDate() + 60); return [...expandir([...ev, ...extra], hoy, diaClave(f)), ...ext.flatMap((x) => leerICS(x.txt, x.c.nombre, x.c.color, hoy, diaClave(f)))].sort((a, b) => a.cuando.localeCompare(b.cuando)).slice(0, 80); }, [ev, extra, ext, hoy, hoyD]);
  function cambiarMes(d: number) { setDir(d); setMes((x) => { const n = new Date(x.a, x.m + d, 1); return { a: n.getFullYear(), m: n.getMonth() }; }); navigator.vibrate?.(6); }
  const toque = useRef<{ x: number; y: number } | null>(null);
  function abrir(o: Ocurrencia) { if (o.e.soloVer) location.href = o.e.soloVer; else if (o.e.externo) setAb(null); else setAb(o); }
  const dSel = new Date(sel + "T12:00"), delSel = porDia.get(sel) || [];
  return <div className="pagina">
    <div className="ag-cab">
      <h2 className="titulo">{v === "mes" ? <>{MES[mes.m]}{mes.a !== hoyD.getFullYear() ? ` ${mes.a}` : ""}</> : v === "lista" ? "Próximo" : "Resúmenes"}</h2>
      <button className="ico-btn ag-mas" onClick={() => setCon(true)} aria-label="Conectar calendarios"><Icono n="repetir" t={22} /></button>
      <button className="ico-btn ag-mas pri" onClick={() => abrirCaptura("agenda")} aria-label="Sumar con voz o texto"><Icono n="mas" t={24} /></button>
    </div>
    <div className="segs" role="tablist"><button className="seg" role="tab" aria-selected={v === "mes"} onClick={() => setV("mes")}>Calendario</button><button className="seg" role="tab" aria-selected={v === "lista"} onClick={() => setV("lista")}>Lista</button><button className="seg" role="tab" aria-selected={v === "res"} onClick={() => setV("res")}>Resúmenes</button></div>
    {v === "mes" && <>
      {proximos.length > 0 && <div className="ag-cuenta">{proximos.map((o) => { const t = TIPOS[o.e.tipo]; return <button key={o.e.id + o.dia} style={{ "--c": t.c } as React.CSSProperties} onClick={() => setAb(o)}><span>{t.e}</span><b>{faltan(o.cuando)}</b><small>{o.e.titulo}</small></button>; })}</div>}
      <div className="ag-mes tarjeta" onPointerDown={(e) => { toque.current = { x: e.clientX, y: e.clientY }; }} onPointerUp={(e) => { const t = toque.current; toque.current = null; if (t && Math.abs(e.clientX - t.x) > 50 && Math.abs(e.clientX - t.x) > Math.abs(e.clientY - t.y) * 1.5) cambiarMes(e.clientX < t.x ? 1 : -1); }}>
        <div className="ag-nav"><button className="ico-btn" aria-label="Mes anterior" onClick={() => cambiarMes(-1)}><span style={{ display: "inline-block", transform: "scaleX(-1)" }}><Icono n="chevron" t={20} /></span></button><button className="ag-hoy" onClick={() => { setMes({ a: hoyD.getFullYear(), m: hoyD.getMonth() }); setSel(hoy); }}>Hoy</button><button className="ico-btn" aria-label="Mes siguiente" onClick={() => cambiarMes(1)}><Icono n="chevron" t={20} /></button></div>
        <div className="ag-sem">{SEM.map((s, i) => <span key={i}>{s}</span>)}</div>
        <div className="ag-grilla" key={`${mes.a}-${mes.m}`} data-dir={dir}>{celdas.map((c, i) => {
          if (!c) return <span key={i} />;
          const l = porDia.get(c) || [], cols = [...new Set(l.map((o) => colorDe(o.e)))].slice(0, 3);
          return <button key={c} className={`ag-dia ${c === hoy ? "hoy" : ""} ${c === sel ? "sel" : ""}`} onClick={() => setSel(c)} onDoubleClick={() => setNuevo(c)} aria-label={`${+c.slice(8)}, ${l.length} eventos`}><span>{+c.slice(8)}</span><em>{cols.map((x) => <i key={x} style={{ background: x }} />)}</em></button>;
        })}</div>
      </div>
      <div className="ag-dia-cab"><h3 className="sec">{sel === hoy ? "Hoy" : `${NOMDIA[dSel.getDay()]} ${+sel.slice(8)}`}</h3><button className="btn sec2 chico" onClick={() => setNuevo(sel)}><Icono n="mas" t={18} />Sumar</button></div>
      {delSel.length ? <div className="lista">{delSel.map((o) => <Fila key={o.e.id + o.cuando} o={o} abrir={abrir} />)}</div> : <p className="expl" style={{ textAlign: "center", padding: 12 }}>Nada para este día.</p>}
    </>}
    {v === "lista" && (lista.length ? <div className="lista">{lista.map((o, i) => { const nuevoDia = i === 0 || lista[i - 1].dia !== o.dia, d = new Date(o.dia + "T12:00"); return <div key={o.e.id + o.cuando}>{nuevoDia && <div className="ag-sep">{o.dia === hoy ? "Hoy" : `${NOMDIA[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`}</div>}<Fila o={o} abrir={abrir} /></div>; })}</div> : <p className="expl" style={{ textAlign: "center", padding: 18 }}>No tenés nada en los próximos 60 días.</p>)}
    {v === "res" && <Resumenes />}
    {ab && <EventoHoja key={ab.e.id + ab.dia} o={ab} cerrar={() => setAb(null)} />}
    {nuevo && <EventoForm dia={nuevo} cerrar={() => setNuevo(null)} />}
    {con && <Conectar cerrar={() => setCon(false)} />}
  </div>;
}
export default function P() { return <Suspense><Agenda /></Suspense>; }
