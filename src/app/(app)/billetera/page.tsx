"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { sb } from "@/lib/sb";
import { useSesion } from "@/lib/sesion";
import { Hoja } from "@/components/Hoja";
import { Icono } from "@/components/Icono";
import { abrirCaptura } from "@/lib/captura";
import { lanzarEfecto } from "@/components/Efectos";
import { ahoraBA, pesos } from "@/lib/util";
import { recomendar, resumen, type Mov } from "@/lib/plata";

const MES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const DIA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MEDIOS: [string, string][] = [["efectivo", "Efectivo"], ["debito", "Débito"], ["credito", "Crédito"], ["billetera", "Billetera virtual"]];
let cache: { m: Mov[]; c: any[]; f: any[]; g: any[] } | null = null;

function Numero({ v }: { v: number }) {
  const [n, setN] = useState(v), ant = useRef(v);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion:reduce)").matches) { setN(v); return; }
    const a = ant.current, t0 = performance.now(); let r = 0;
    const p = (t: number) => { const k = Math.min(1, (t - t0) / 650), e = 1 - Math.pow(1 - k, 3); setN(a + (v - a) * e); if (k < 1) r = requestAnimationFrame(p); else ant.current = v; };
    r = requestAnimationFrame(p);
    return () => cancelAnimationFrame(r);
  }, [v]);
  return <>{pesos(Math.round(n))}</>;
}
function Dona({ datos, total }: { datos: { n: string; v: number; c: string }[]; total: number }) {
  let a = 0; const R = 42, L = 2 * Math.PI * R;
  return <svg viewBox="0 0 100 100" className="pl-dona" role="img" aria-label="Gastos por categoría">
    <circle cx="50" cy="50" r={R} fill="none" stroke="var(--hoja2)" strokeWidth="13" />
    {datos.map((d) => { const f = d.v / total, s = <circle key={d.n} cx="50" cy="50" r={R} fill="none" stroke={d.c} strokeWidth="13" strokeDasharray={`${Math.max(0, f * L - 1.5)} ${L}`} strokeDashoffset={-a * L} transform="rotate(-90 50 50)" />; a += f; return s; })}
  </svg>;
}
function MovHoja({ m, cats, cerrar }: { m: Mov; cats: any[]; cerrar: () => void }) {
  const { toast } = useSesion();
  const [f, setF] = useState<any>({ ...m, monto: String(+m.monto) });
  const lista = cats.filter((c) => c.tipo === f.tipo);
  async function guardar() {
    const n = +String(f.monto).replace(/\./g, "").replace(",", ".");
    if (!(n > 0)) return toast("Poné el monto.");
    const { error } = await sb.from("movimientos").update({ tipo: f.tipo, monto: n, categoria: f.categoria, fecha: f.fecha, nota: f.nota || null, medio: f.medio || null }).eq("id", m.id);
    if (error) return toast("No se pudo guardar.");
    window.dispatchEvent(new Event("sm-plata")); cerrar();
  }
  async function borrar() { await sb.from("movimientos").delete().eq("id", m.id); window.dispatchEvent(new Event("sm-plata")); cerrar(); }
  return <Hoja titulo="Editar" cerrar={cerrar}>
    <div className="cap-tipo" data-i={f.tipo === "gasto" ? 0 : 1}><button onClick={() => setF({ ...f, tipo: "gasto" })}>Gasto</button><button onClick={() => setF({ ...f, tipo: "ingreso" })}>Ingreso</button></div>
    <label className="cap-monto"><span>$</span><input inputMode="numeric" value={f.monto} onChange={(e) => setF({ ...f, monto: e.target.value.replace(/[^\d.,]/g, "") })} aria-label="Monto" /></label>
    <div className="cap-cats">{lista.map((c) => <button key={c.id} className="cap-cat" aria-pressed={f.categoria === c.nombre} style={{ "--c": c.color } as React.CSSProperties} onClick={() => setF({ ...f, categoria: c.nombre })}><i>{c.emoji}</i>{c.nombre}</button>)}</div>
    <div className="dos"><div className="campo"><label htmlFor="mv-f">Fecha</label><input id="mv-f" type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} /></div><div className="campo"><label htmlFor="mv-n">Nota</label><input id="mv-n" type="text" value={f.nota || ""} onChange={(e) => setF({ ...f, nota: e.target.value })} /></div></div>
    <div className="chipera">{MEDIOS.map(([k, n]) => <button key={k} className="chip" aria-pressed={f.medio === k} onClick={() => setF({ ...f, medio: f.medio === k ? null : k })}>{n}</button>)}</div>
    <button className="btn pri" onClick={guardar}>Guardar</button>
    <button className="btn mal chico" onClick={borrar}><Icono n="papelera" t={20} />Borrar</button>
  </Hoja>;
}
function FijoHoja({ x, cats, cerrar }: { x?: any; cats: any[]; cerrar: () => void }) {
  const { perfil, toast } = useSesion();
  const [f, setF] = useState<any>(x ? { ...x, monto: String(+x.monto) } : { tipo: "gasto", nombre: "", monto: "", categoria: "Servicios", dia: 1 });
  async function guardar() {
    if (!f.nombre.trim() || !(+f.monto > 0)) return toast("Poné nombre y monto.");
    const fila = { perfil_id: perfil.id, tipo: f.tipo, nombre: f.nombre.trim(), monto: +f.monto, categoria: f.categoria, dia: Math.min(31, Math.max(1, +f.dia || 1)) };
    const { error } = x ? await sb.from("fijos").update(fila).eq("id", x.id) : await sb.from("fijos").insert(fila);
    if (error) return toast("No se pudo guardar.");
    window.dispatchEvent(new Event("sm-plata")); cerrar();
  }
  return <Hoja titulo={x ? "Editar fijo" : "Nuevo fijo"} cerrar={cerrar}>
    <div className="cap-tipo" data-i={f.tipo === "gasto" ? 0 : 1}><button onClick={() => setF({ ...f, tipo: "gasto" })}>Gasto</button><button onClick={() => setF({ ...f, tipo: "ingreso", categoria: "Sueldo" })}>Ingreso</button></div>
    <div className="campo"><label htmlFor="fj-n">Qué es</label><input id="fj-n" type="text" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Alquiler, Netflix, sueldo" /></div>
    <div className="dos"><div className="campo"><label htmlFor="fj-m">Monto</label><input id="fj-m" type="number" inputMode="numeric" value={f.monto} onChange={(e) => setF({ ...f, monto: e.target.value })} /></div><div className="campo"><label htmlFor="fj-d">Día del mes</label><input id="fj-d" type="number" min="1" max="31" value={f.dia} onChange={(e) => setF({ ...f, dia: e.target.value })} /></div></div>
    <div className="cap-cats">{cats.filter((c) => c.tipo === f.tipo).map((c) => <button key={c.id} className="cap-cat" aria-pressed={f.categoria === c.nombre} style={{ "--c": c.color } as React.CSSProperties} onClick={() => setF({ ...f, categoria: c.nombre })}><i>{c.emoji}</i>{c.nombre}</button>)}</div>
    <p className="chico">Se anota solo ese día de cada mes, y te aviso el día anterior.</p>
    <button className="btn pri" onClick={guardar}>Guardar</button>
    {x && <button className="btn mal chico" onClick={async () => { await sb.from("fijos").delete().eq("id", x.id); window.dispatchEvent(new Event("sm-plata")); cerrar(); }}><Icono n="papelera" t={20} />Borrar</button>}
  </Hoja>;
}
function MetaHoja({ x, cerrar }: { x?: any; cerrar: () => void }) {
  const { perfil, toast } = useSesion();
  const [f, setF] = useState<any>(x || { nombre: "", emoji: "🎯", objetivo: "", limite: "" }), [suma, setSuma] = useState("");
  async function guardar() {
    if (!f.nombre.trim() || !(+f.objetivo > 0)) return toast("Poné nombre y cuánto querés juntar.");
    const fila = { perfil_id: perfil.id, nombre: f.nombre.trim(), emoji: f.emoji || "🎯", objetivo: +f.objetivo, limite: f.limite || null };
    const { error } = x ? await sb.from("metas").update(fila).eq("id", x.id) : await sb.from("metas").insert(fila);
    if (error) return toast("No se pudo guardar.");
    window.dispatchEvent(new Event("sm-plata")); cerrar();
  }
  async function poner() {
    const n = +suma; if (!(n > 0)) return;
    await sb.from("metas").update({ ahorrado: +x.ahorrado + n }).eq("id", x.id);
    lanzarEfecto("gana", `+${pesos(n)}`); window.dispatchEvent(new Event("sm-plata")); cerrar();
  }
  return <Hoja titulo={x ? x.nombre : "Nueva meta"} cerrar={cerrar}>
    {x && <><div className="campo"><label htmlFor="mt-s">Sumar a esta meta</label><input id="mt-s" type="number" inputMode="numeric" value={suma} onChange={(e) => setSuma(e.target.value)} /></div><button className="btn pri" onClick={poner}>Sumar</button><h3 className="sec">Editar</h3></>}
    <div className="dos"><div className="campo"><label htmlFor="mt-e">Emoji</label><input id="mt-e" type="text" value={f.emoji} maxLength={4} onChange={(e) => setF({ ...f, emoji: e.target.value })} /></div><div className="campo"><label htmlFor="mt-o">Quiero juntar</label><input id="mt-o" type="number" inputMode="numeric" value={f.objetivo} onChange={(e) => setF({ ...f, objetivo: e.target.value })} /></div></div>
    <div className="campo"><label htmlFor="mt-n">Para qué</label><input id="mt-n" type="text" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Vacaciones, celular" /></div>
    <div className="campo"><label htmlFor="mt-l">Para cuándo</label><input id="mt-l" type="date" value={f.limite || ""} onChange={(e) => setF({ ...f, limite: e.target.value })} /></div>
    <button className="btn sec2" onClick={guardar}>Guardar</button>
    {x && <button className="btn mal chico" onClick={async () => { await sb.from("metas").delete().eq("id", x.id); window.dispatchEvent(new Event("sm-plata")); cerrar(); }}><Icono n="papelera" t={20} />Borrar</button>}
  </Hoja>;
}
function Ajustes({ cats, cerrar }: { cats: any[]; cerrar: () => void }) {
  const { perfil, recargar, toast } = useSesion();
  const [p, setP] = useState(String(perfil.preferencias?.presupuesto || "")), [n, setN] = useState(perfil.notif?.plata !== false), [nueva, setNueva] = useState({ nombre: "", emoji: "💸" });
  const [topes, setTopes] = useState<Record<string, string>>({});
  async function guardar() {
    await sb.from("perfiles").update({ preferencias: { ...perfil.preferencias, presupuesto: +p || 0 }, notif: { ...perfil.notif, plata: n } }).eq("id", perfil.id);
    for (const [nom, v] of Object.entries(topes)) {
      const c = cats.find((x) => x.nombre === nom && x.tipo === "gasto");
      if (c?.perfil_id) await sb.from("plata_categorias").update({ tope: +v || null }).eq("id", c.id);
      else if (c) await sb.from("plata_categorias").insert({ perfil_id: perfil.id, tipo: "gasto", nombre: nom, emoji: c.emoji, color: c.color, tope: +v || null, orden: c.orden });
    }
    await recargar(); window.dispatchEvent(new Event("sm-plata")); toast("Guardado."); cerrar();
  }
  async function sumarCat() { if (!nueva.nombre.trim()) return; const { error } = await sb.from("plata_categorias").insert({ perfil_id: perfil.id, tipo: "gasto", nombre: nueva.nombre.trim(), emoji: nueva.emoji || "💸", color: "#5E6673", orden: 50 }); if (error) return toast("Esa categoría ya existe."); setNueva({ nombre: "", emoji: "💸" }); window.dispatchEvent(new Event("sm-plata")); toast("Categoría sumada."); }
  return <Hoja titulo="Ajustes de Billetera" cerrar={cerrar}>
    <div className="campo"><label htmlFor="aj-p">Presupuesto del mes</label><input id="aj-p" type="number" inputMode="numeric" value={p} onChange={(e) => setP(e.target.value)} /><small>Te aviso cuando llegues al 80% y si te pasás.</small></div>
    <button className="chip" aria-pressed={n} onClick={() => setN(!n)}>Avisos y consejos de plata</button>
    <h3 className="sec">Tope por categoría</h3>
    <div className="lista">{cats.filter((c) => c.tipo === "gasto").map((c) => <div key={c.id} className="item" style={{ minHeight: 54 }}><span className="q"><b style={{ fontSize: 16 }}>{c.emoji} {c.nombre}</b></span><input type="number" inputMode="numeric" aria-label={`Tope de ${c.nombre}`} style={{ width: 118 }} placeholder="Sin tope" value={topes[c.nombre] ?? (c.tope ? +c.tope : "")} onChange={(e) => setTopes({ ...topes, [c.nombre]: e.target.value })} /></div>)}</div>
    <h3 className="sec">Nueva categoría</h3>
    <div className="cap-txt"><input type="text" aria-label="Emoji" value={nueva.emoji} maxLength={4} style={{ width: 62, flex: "none" }} onChange={(e) => setNueva({ ...nueva, emoji: e.target.value })} /><input type="text" aria-label="Nombre de la categoría" placeholder="Nombre" value={nueva.nombre} onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })} /><button className="cap-ok" aria-label="Sumar categoría" onClick={sumarCat}><Icono n="mas" t={22} /></button></div>
    <button className="btn pri" onClick={guardar}>Guardar</button>
  </Hoja>;
}
function Dolar() {
  const [d, setD] = useState<any>(null);
  useEffect(() => { fetch("https://dolarapi.com/v1/dolares").then((r) => r.json()).then(setD).catch(() => {}); }, []);
  if (!Array.isArray(d)) return null;
  const b = d.find((x: any) => x.casa === "blue"), o = d.find((x: any) => x.casa === "oficial");
  return <div className="dos"><div className="mini"><span className="et">Dólar blue</span><b>{b ? pesos(b.venta) : "-"}</b></div><div className="mini"><span className="et">Dólar oficial</span><b>{o ? pesos(o.venta) : "-"}</b></div></div>;
}
function Billetera() {
  const { perfil } = useSesion(), q = useSearchParams();
  const h = ahoraBA();
  const [mes, setMes] = useState({ a: h.getFullYear(), m: h.getMonth() }), [v, setV] = useState(q.get("v") || "mov");
  const [m, setM] = useState<Mov[]>(cache?.m || []), [cats, setCats] = useState<any[]>(cache?.c || []), [fijos, setFijos] = useState<any[]>(cache?.f || []), [metas, setMetas] = useState<any[]>(cache?.g || []);
  const [cargado, setCargado] = useState(!!cache);
  const [ed, setEd] = useState<Mov | null>(null), [fj, setFj] = useState<any>(null), [mt, setMt] = useState<any>(null), [aj, setAj] = useState(false), [busca, setBusca] = useState("");
  const cargar = useCallback(async () => {
    const [{ data: a }, { data: b }, { data: c }, { data: d }] = await Promise.all([sb.from("movimientos").select("*").order("fecha", { ascending: false }).order("id", { ascending: false }).limit(5000), sb.from("plata_categorias").select("*").order("orden"), sb.from("fijos").select("*").order("dia"), sb.from("metas").select("*").order("creado_en")]);
    const mias = (b || []).filter((x: any) => x.perfil_id), comunes = (b || []).filter((x: any) => !x.perfil_id && !mias.some((y: any) => y.nombre === x.nombre && y.tipo === x.tipo));
    const cc = [...comunes, ...mias].sort((x: any, y: any) => x.orden - y.orden);
    cache = { m: a || [], c: cc, f: c || [], g: d || [] };
    setM(cache.m); setCats(cc); setFijos(cache.f); setMetas(cache.g); setCargado(true);
  }, []);
  useEffect(() => { cargar(); const f = () => cargar(); addEventListener("sm-plata", f); return () => removeEventListener("sm-plata", f); }, [cargar]);
  const ini = `${mes.a}-${String(mes.m + 1).padStart(2, "0")}`;
  const r = useMemo(() => resumen(m, ini), [m, ini]);
  const lim = +(perfil.preferencias?.presupuesto || 0), estamos = mes.a === h.getFullYear() && mes.m === h.getMonth();
  const hoyK = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}-${String(h.getDate()).padStart(2, "0")}`;
  const dias = new Date(mes.a, mes.m + 1, 0).getDate(), resta = estamos ? dias - h.getDate() + 1 : 0;
  const catDe = (n: string, t: string) => cats.find((c) => c.nombre === n && c.tipo === t);
  const delMes = m.filter((x) => x.fecha.startsWith(ini) && (!busca || `${x.nota} ${x.categoria}`.toLowerCase().includes(busca.toLowerCase())));
  const dias2 = useMemo(() => { const g = new Map<string, Mov[]>(); for (const x of delMes) { if (!g.has(x.fecha)) g.set(x.fecha, []); g.get(x.fecha)!.push(x); } return [...g]; }, [delMes]);
  const datos = r.porCat.slice(0, 7).map(([n, val]) => ({ n, v: val, c: catDe(n, "gasto")?.color || "#8E8E93" }));
  const recs = useMemo(() => recomendar(m, ini, lim, fijos, estamos ? h.getDate() : dias, dias), [m, ini, lim, fijos, estamos, dias]); // eslint-disable-line react-hooks/exhaustive-deps
  const totFijos = fijos.filter((f) => f.activo && f.tipo === "gasto").reduce((a, f) => a + +f.monto, 0);
  function cambiar(d: number) { setMes((x) => { const n = new Date(x.a, x.m + d, 1); return { a: n.getFullYear(), m: n.getMonth() }; }); }
  return <div className="pagina">
    <div className="ag-cab">
      <h2 className="titulo">Billetera</h2>
      <button className="ico-btn ag-mas" onClick={() => setAj(true)} aria-label="Ajustes de Billetera"><Icono n="ajustes" t={22} /></button>
    </div>
    <div className="pl-tapa">
      <div className="pl-mes"><button aria-label="Mes anterior" onClick={() => cambiar(-1)}><span style={{ display: "inline-block", transform: "scaleX(-1)" }}><Icono n="chevron" t={18} /></span></button><span>{MES[mes.m]}{mes.a !== h.getFullYear() ? ` ${mes.a}` : ""}</span><button aria-label="Mes siguiente" onClick={() => cambiar(1)}><Icono n="chevron" t={18} /></button></div>
      <small>{r.balance >= 0 ? "Te queda" : "Estás abajo"}</small>
      <b className="pl-grande"><Numero v={Math.abs(r.balance)} /></b>
      <div className="pl-dos"><span><Icono n="bajar" t={16} g={3} />Entró <Numero v={r.ingresos} /></span><span><Icono n="subir" t={16} g={3} />Salió <Numero v={r.gastos} /></span></div>
      {lim > 0 && <div className="pl-tope"><div><i style={{ width: `${Math.min(100, (r.gastos / lim) * 100)}%`, background: r.gastos > lim ? "#FFD21F" : "#fff" }} /></div><small>{r.gastos > lim ? `Te pasaste ${pesos(r.gastos - lim)} del presupuesto` : estamos ? `Podés gastar ${pesos((lim - r.gastos) / Math.max(1, resta))} por día` : `De ${pesos(lim)} de presupuesto`}</small></div>}
      <span className="pl-bil" aria-hidden="true" />
    </div>
    <div className="dos">
      <button className="btn pl-b gasto" onClick={() => abrirCaptura("plata", "gasto")}><Icono n="fuego" />Gasté</button>
      <button className="btn pl-b ingreso" onClick={() => abrirCaptura("plata", "ingreso")}><Icono n="mas" />Entró plata</button>
    </div>
    {recs[0] && <button className="pl-rec" onClick={() => setV("num")}><span>{recs[0].e}</span><span className="q"><b>{recs[0].t}</b>{recs[0].d && <small>{recs[0].d}</small>}</span></button>}
    <div className="segs" role="tablist">{[["mov", "Movimientos"], ["num", "Números"], ["fijos", "Fijos"], ["metas", "Metas"]].map(([k, n]) => <button key={k} className="seg" role="tab" aria-selected={v === k || (k === "num" && v === "numeros")} onClick={() => setV(k)}>{n}</button>)}</div>
    {v === "mov" && !cargado && <div className="lista">{[0, 1, 2, 3].map((i) => <div key={i} className="item esq"><i /><span><b /><small /></span></div>)}</div>}
    {v === "mov" && cargado && <>
      {m.length > 8 && <input type="search" placeholder="Buscar" aria-label="Buscar movimientos" value={busca} onChange={(e) => setBusca(e.target.value)} />}
      {dias2.length ? dias2.map(([d, l]) => { const dd = new Date(d + "T12:00"), fut = d > hoyK; return <div key={d}><div className="pl-dia"><span>{d === hoyK ? "Hoy" : `${DIA[dd.getDay()]} ${dd.getDate()}`}{fut ? ", programado" : ""}</span></div><div className="lista">{l.map((x) => { const c = catDe(x.categoria, x.tipo); return <button key={x.id} className="item pl-mov" onClick={() => setEd(x)}><span className="ic" style={{ background: `color-mix(in srgb,${c?.color || "#8E8E93"} 16%,var(--hoja))` }}>{c?.emoji || "💸"}</span><span className="q"><b>{x.nota || x.categoria}</b>{x.nota && <small>{x.categoria}</small>}</span><span className={`v ${x.tipo}`}>{x.tipo === "gasto" ? "−" : "+"}{pesos(+x.monto)}</span></button>; })}</div></div>; }) : <p className="expl" style={{ textAlign: "center", padding: 18 }}>Nada anotado este mes. Tocá dos veces Billetera abajo y anotá con voz o texto.</p>}
    </>}
    {(v === "num" || v === "numeros") && <>
      {r.gastos > 0 ? <div className="tarjeta pl-graf"><div className="pl-dona-c"><Dona datos={datos} total={r.gastos} /><span><small>Salió</small><b>{pesos(r.gastos)}</b></span></div><div className="pl-ley">{datos.map((d) => <div key={d.n}><i style={{ background: d.c }} /><span>{d.n}</span><b>{Math.round((d.v / r.gastos) * 100)}%</b></div>)}</div></div> : <p className="expl" style={{ textAlign: "center", padding: 18 }}>Cuando anotes gastos, acá ves en qué se va la plata.</p>}
      {r.seis.some((x) => x.g > 0) && <div className="tarjeta"><h3>Últimos meses</h3><div className="pl-bars">{r.seis.map((x) => { const mx = Math.max(...r.seis.map((y) => y.g), 1); return <div key={x.k} className={x.k === ini ? "ya" : ""}><i style={{ height: `${Math.max(3, (x.g / mx) * 100)}%` }} /><span>{MES[+x.k.slice(5) - 1].slice(0, 3)}</span></div>; })}</div></div>}
      <div className="dos"><div className="mini"><span className="et">Por día</span><b>{pesos(r.gastos / Math.max(1, estamos ? h.getDate() : dias))}</b></div><div className="mini"><span className="et">Gasto más grande</span><b>{r.mayor ? pesos(+r.mayor.monto) : "-"}</b><small>{r.mayor?.nota || r.mayor?.categoria}</small></div></div>
      {recs.length > 0 && <><h3 className="sec">Para vos</h3><div className="lista">{recs.map((x, i) => <div key={i} className="item"><span className="ic">{x.e}</span><span className="q"><b style={{ fontSize: 16 }}>{x.t}</b>{x.d && <small>{x.d}</small>}</span></div>)}</div></>}
      <Dolar />
      <div className="fila"><Link className="btn sec2 chico" href="/gente?v=cuentas">Cuentas con amigos</Link><Link className="btn sec2 chico" href="/guia/descuentos">Descuentos de hoy</Link><Link className="btn sec2 chico" href="/guia/plata">Cuánto cuesta vivir acá</Link></div>
    </>}
    {v === "fijos" && <>
      <div className="mini"><span className="et">Gastos fijos por mes</span><b>{pesos(totFijos)}</b></div>
      {fijos.length > 0 && <div className="lista">{fijos.map((x) => { const c = catDe(x.categoria, x.tipo); return <button key={x.id} className="item pl-mov" onClick={() => setFj(x)}><span className="ic">{c?.emoji || "📌"}</span><span className="q"><b>{x.nombre}</b><small>Día {x.dia}</small></span><span className={`v ${x.tipo}`}>{pesos(+x.monto)}</span></button>; })}</div>}
      <button className="btn pri" onClick={() => setFj({})}><Icono n="mas" />Sumar fijo</button>
    </>}
    {v === "metas" && <>
      {metas.map((x) => { const pct = Math.min(100, (+x.ahorrado / +x.objetivo) * 100); return <button key={x.id} className="tarjeta" style={{ textAlign: "left" }} onClick={() => setMt(x)}><h3>{x.emoji} {x.nombre}</h3><div className="pl-meta"><i style={{ width: `${pct}%` }} /></div><small className="expl">{pesos(+x.ahorrado)} de {pesos(+x.objetivo)}{x.limite ? `, para el ${x.limite.slice(8)}/${x.limite.slice(5, 7)}` : ""}</small></button>; })}
      {!metas.length && <p className="expl" style={{ textAlign: "center", padding: 12 }}>Poné una meta y mirá cómo se va llenando.</p>}
      <button className="btn pri" onClick={() => setMt({})}><Icono n="mas" />Nueva meta</button>
    </>}
    {ed && <MovHoja m={ed} cats={cats} cerrar={() => setEd(null)} />}
    {fj && <FijoHoja x={fj.id ? fj : undefined} cats={cats} cerrar={() => setFj(null)} />}
    {mt && <MetaHoja x={mt.id ? mt : undefined} cerrar={() => setMt(null)} />}
    {aj && <Ajustes cats={cats} cerrar={() => setAj(false)} />}
  </div>;
}
export default function P() { return <Suspense><Billetera /></Suspense>; }
