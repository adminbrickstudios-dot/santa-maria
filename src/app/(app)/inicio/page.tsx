"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSesion } from "@/lib/sesion";
import { sb } from "@/lib/sb";
import { Icono } from "@/components/Icono";
import { ItemGuia } from "@/components/ItemGuia";
import { ahoraBA, aMin, delDia, DIAS, faltan, fechaLarga, hhmm, horaDe, pesos } from "@/lib/util";
import { INTERESES } from "@/lib/intereses";
import { activarPush, estaInstalada, pushSoportado } from "@/lib/push";

const WIDGETS: [string, string][] = [["hoy", "Tu día"], ["avisos", "Avisos de la app"], ["clima", "Clima y dólar"], ["fechas", "Próximas fechas"], ["juntada", "Próxima juntada"], ["paravos", "Para vos"], ["descuento", "Descuento de hoy"], ["tip", "Dato porteño del día"], ["primermes", "Primer mes en Buenos Aires"], ["accesos", "Accesos rápidos"]];
const CLIMA: Record<number, string> = { 0: "Despejado", 1: "Casi despejado", 2: "Algo nublado", 3: "Nublado", 45: "Niebla", 48: "Niebla", 51: "Llovizna", 53: "Llovizna", 55: "Llovizna", 61: "Lluvia", 63: "Lluvia", 65: "Lluvia fuerte", 80: "Chaparrones", 81: "Chaparrones", 82: "Chaparrones fuertes", 95: "Tormenta", 96: "Tormenta", 99: "Tormenta" };
const DIAS_ET = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function Hoy() {
  const { perfil, lugares } = useSesion();
  const [c, setC] = useState<any>(null), [cal, setCal] = useState<string>("");
  const hoy = ahoraBA(), ahora = hoy.getHours() * 60 + hoy.getMinutes();
  useEffect(() => {
    (async () => {
      const { data } = await sb.from("clases").select("*, materias(nombre,color)").order("hora_inicio");
      const l = data || [];
      for (let i = 0; i < 7; i++) {
        const d = (hoy.getDay() + i) % 7;
        const x = l.find((k: any) => k.dia === d && (i > 0 || aMin(k.hora_inicio) > ahora));
        if (x) { setC({ ...x, en: i }); return; }
      }
      setC(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!c || c.en > 1 || perfil.casa_lat == null) return;
    (async () => {
      const m = await import("@/lib/mapa/vista");
      await m.cargarDatosMapa();
      const lugar = lugares.find((x: any) => x.id === c.lugar_id) || lugares.find((x: any) => x.destacado);
      if (!lugar) return;
      const entra = aMin(c.hora_inicio), dd = (hoy.getDay() + c.en) % 7;
      const ctx = { dia: dd === 0 ? "dom" : dd === 6 ? "sab" : "hab", min: Math.max(0, entra - 40), lluvia: false };
      const p = m.planificar({ nombre: "Tu casa", x: m.wx(perfil.casa_lon), y: m.wy(perfil.casa_lat) }, { nombre: lugar.nombre, x: m.wx(lugar.lon), y: m.wy(lugar.lat) }, ctx);
      const op = p.ops.filter((o: any) => o.tipo === "bus" || o.tipo === "subte" || o.tipo === "pie").sort((a: any, b: any) => a.dMax - b.dMax)[0];
      if (op) setCal(`Salí a las ${hhmm(entra - op.dMax - 5)} · ${op.titulo === "A pie" ? "a pie" : op.titulo}`);
    })().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c]);
  if (c === null) return null;
  if (!c) return <Link href="/facu" className="grande"><Icono n="calendario" /><span className="q"><b>Armá tu horario</b><small>Cargá tus materias y te digo a qué hora salir.</small></span><Icono n="flecha" /></Link>;
  return <Link href="/facu" className="grande"><Icono n="reloj" /><span className="q"><b>{cal || `${c.hora_inicio.slice(0, 5)} ${c.materias?.nombre}`}</b><small>{c.en === 0 ? "Hoy" : c.en === 1 ? "Mañana" : DIAS[(hoy.getDay() + c.en) % 7]} a las {c.hora_inicio.slice(0, 5)}: {c.materias?.nombre}{c.aula ? `, aula ${c.aula}` : ""}</small></span><Icono n="flecha" /></Link>;
}
function ClimaDolar() {
  const [w, setW] = useState<any>(null), [d, setD] = useState<any>(null);
  useEffect(() => {
    fetch("https://api.open-meteo.com/v1/forecast?latitude=-34.6&longitude=-58.42&current=temperature_2m,weather_code&daily=precipitation_probability_max,temperature_2m_max,temperature_2m_min&timezone=America%2FArgentina%2FBuenos_Aires&forecast_days=1").then((r) => r.json()).then(setW).catch(() => {});
    fetch("https://dolarapi.com/v1/dolares").then((r) => r.json()).then(setD).catch(() => {});
  }, []);
  const blue = Array.isArray(d) ? d.find((x: any) => x.casa === "blue") : null, of = Array.isArray(d) ? d.find((x: any) => x.casa === "oficial") : null;
  if (!w && !blue) return null;
  const ll = w?.daily?.precipitation_probability_max?.[0];
  return <div className="dos">
    {w && <div className="mini"><span className="et"><Icono n="clima" t={16} />Clima</span><b>{Math.round(w.current.temperature_2m)}°</b><small>{CLIMA[w.current.weather_code] || "Variable"}. {Math.round(w.daily.temperature_2m_min[0])}° a {Math.round(w.daily.temperature_2m_max[0])}°{ll >= 40 ? `. ${ll}% de lluvia: llevá paraguas` : ""}</small></div>}
    {blue && <div className="mini"><span className="et"><Icono n="dolar" t={16} />Dólar</span><b>{pesos(blue.venta)}</b><small>Blue. Oficial {of ? pesos(of.venta) : ""}</small></div>}
  </div>;
}
function Fechas() {
  const [l, setL] = useState<any[]>([]);
  useEffect(() => { sb.from("eventos").select("*").eq("hecho", false).gte("fecha", new Date().toISOString()).order("fecha").limit(3).then(({ data }: any) => setL(data || [])); }, []);
  if (!l.length) return null;
  return <div className="lista">{l.map((e) => <Link key={e.id} href="/facu?v=fechas" className="item"><span className="ic"><Icono n="calendario" /></span><span className="q"><b>{e.titulo}</b><small>{fechaLarga(e.fecha)}</small></span><span className="v">{faltan(e.fecha)}</span></Link>)}</div>;
}
function Juntada() {
  const [j, setJ] = useState<any>(null);
  useEffect(() => { sb.from("juntadas").select("*").gte("cuando", new Date().toISOString()).order("cuando").limit(1).then(({ data }: any) => setJ(data?.[0] || null)); }, []);
  if (!j) return null;
  return <Link href="/gente/juntadas" className="item tarjeta" style={{ display: "flex" }}><span className="ic"><Icono n="gente" /></span><span className="q"><b>{j.titulo}</b><small>{fechaLarga(j.cuando)} {horaDe(j.cuando)}{j.lugar_nombre ? ` · ${j.lugar_nombre}` : ""}</small></span></Link>;
}
function Descuento({ abrir }: { abrir: (i: any) => void }) {
  const [i, setI] = useState<any>(null);
  useEffect(() => {
    const dia = DIAS_ET[ahoraBA().getDay()];
    sb.from("guia_items").select("*").eq("seccion", "descuentos").contains("etiquetas", [dia]).limit(20).then(async ({ data }: any) => {
      let l = data || [];
      if (!l.length) { const r = await sb.from("guia_items").select("*").eq("seccion", "descuentos").limit(30); l = r.data || []; }
      setI(delDia(l) || null);
    });
  }, []);
  if (!i) return null;
  return <button className="tarjeta" style={{ textAlign: "left" }} onClick={() => abrir(i)}><h3><Icono n="regalo" t={20} />Hoy te conviene</h3><p><b>{i.titulo}</b>{i.dato ? `: ${i.dato}` : ""}</p>{i.bajada && <p className="expl">{i.bajada}</p>}</button>;
}
function Tip({ abrir }: { abrir: (i: any) => void }) {
  const [i, setI] = useState<any>(null);
  useEffect(() => { sb.from("guia_items").select("*").eq("seccion", "secretos").limit(200).then(({ data }: any) => setI(delDia(data || []) || null)); }, []);
  if (!i) return null;
  return <button className="tarjeta" style={{ textAlign: "left" }} onClick={() => abrir(i)}><h3><Icono n="idea" t={20} />Dato porteño</h3><p><b>{i.titulo}</b></p>{i.bajada && <p className="expl">{i.bajada}</p>}</button>;
}
function ParaVos({ abrir }: { abrir: (i: any) => void }) {
  const { perfil } = useSesion();
  const [l, setL] = useState<any[]>([]);
  useEffect(() => {
    const ints: string[] = perfil.preferencias?.intereses?.length ? perfil.preferencias.intereses : Object.keys(INTERESES);
    const secs = ints.map((k) => INTERESES[k]?.seccion).filter(Boolean);
    sb.from("guia_items").select("*").in("seccion", secs).limit(300).then(({ data }: any) => {
      let v: any[] = data || [];
      const la = perfil.casa_lat, lo = perfil.casa_lon;
      const d = (i: any) => (i.lat == null || la == null ? 9 : Math.hypot((i.lat - la) * 111, (i.lon - lo) * 92));
      const cerca = v.filter((i) => d(i) < 2);
      if (cerca.length >= 6) v = cerca;
      const base = ahoraBA().getDate(), o = [...v].sort((a, b) => ((a.id * 7 + base) % 13) - ((b.id * 7 + base) % 13));
      const vistos = new Set<string>(), r: any[] = [];
      for (const i of o) { if (!vistos.has(i.seccion)) { vistos.add(i.seccion); r.push(i); } if (r.length === 3) break; }
      setL(r);
    });
  }, [perfil]);
  if (!l.length) return null;
  return <div style={{ display: "grid", gap: 8 }}><h3 className="sec">Para vos</h3><div className="lista">{l.map((i) => <button key={i.id} className="item" onClick={() => abrir(i)}><span className="ic"><Icono n="estrella" t={20} /></span><span className="q"><b>{i.titulo}</b><small>{i.dato || i.bajada}</small></span></button>)}</div></div>;
}
function Avisos() {
  const { perfil, toast } = useSesion();
  const [p, setP] = useState(false), [ins, setIns] = useState(false);
  useEffect(() => { setP(pushSoportado() && Notification.permission === "default"); setIns(!estaInstalada()); }, []);
  if (ins) return <Link href="/instalar" className="tarjeta" style={{ display: "flex", gap: 10, alignItems: "center" }}><Icono n="instalar" /><span style={{ flex: 1 }}><b>Instalá la app</b><br /><span className="expl">Queda con su ícono en tu celular</span></span><Icono n="flecha" t={20} /></Link>;
  if (p) return <button className="tarjeta" style={{ display: "flex", gap: 10, alignItems: "center", textAlign: "left" }} onClick={async () => { const r = await activarPush(perfil.id); setP(false); toast(r === "ok" ? "Listo, te van a llegar al celular." : "No se activaron."); }}><Icono n="campana" /><span style={{ flex: 1 }}><b>Activá las notificaciones</b><br /><span className="expl">Para enterarte de mensajes y juntadas</span></span></button>;
  return null;
}
function Rapido() {
  const [a, setA] = useState(false);
  const ops = [["/plata?nuevo=1", "plata", "Gasto"], ["/facu?v=fechas&nuevo=1", "calendario", "Fecha"], ["/gente/juntadas?nuevo=1", "gente", "Juntada"], ["/gente?v=grupo&nuevo=1", "chat", "Aviso"]];
  return <div className="rapido">{a && <div className="rapido-m">{ops.map(([h, ic, n], i) => <Link key={n} href={h} className="rapido-o" style={{ animationDelay: `${i * 35}ms` }}><Icono n={ic} t={20} />{n}</Link>)}</div>}<button className="rapido-b" aria-label="Sumar algo rápido" aria-expanded={a} onClick={() => setA(!a)} style={{ transform: a ? "rotate(45deg)" : "none" }}><Icono n="mas" t={28} g={2.6} /></button></div>;
}
function PrimerMes() {
  const [t, setT] = useState<[number, number] | null>(null);
  useEffect(() => {
    (async () => {
      const [{ count: tot }, { data: h }] = await Promise.all([
        sb.from("guia_items").select("id", { count: "exact", head: true }).eq("seccion", "primer-mes"),
        sb.from("progreso_items").select("item_id, guia_items!inner(seccion)").eq("guia_items.seccion", "primer-mes"),
      ]);
      setT([h?.length || 0, tot || 0]);
    })();
  }, []);
  if (!t || !t[1] || t[0] >= t[1]) return null;
  return <Link href="/guia/primer-mes" className="tarjeta"><h3><Icono n="tilde" t={20} />Tu primer mes: {t[0]} de {t[1]}</h3><div className="barrita"><i style={{ width: `${(t[0] / t[1]) * 100}%` }} /></div></Link>;
}
function Accesos() {
  const { lugares } = useSesion();
  const u = lugares.find((x: any) => x.destacado);
  const a = [[u ? `/mapa?lat=${u.lat}&lon=${u.lon}&n=${encodeURIComponent(u.nombre)}` : "/mapa", "facu", "A la facu"], ["/guia/emergencias", "sirena", "Emergencias"], ["/guia/descuentos", "regalo", "Descuentos"], ["/plata", "plata", "Mi plata"]];
  return <div className="dos">{a.map(([h, ic, n]) => <Link key={n} href={h} className="mini" style={{ minHeight: 76 }}><Icono n={ic} /><strong>{n}</strong></Link>)}</div>;
}
export default function Inicio() {
  const { perfil } = useSesion();
  const [item, setItem] = useState<any>(null);
  const h = ahoraBA().getHours(), sal = h < 6 ? "Buenas noches" : h < 13 ? "Buen día" : h < 20 ? "Buenas tardes" : "Buenas noches";
  const orden: string[] = [...(perfil.preferencias?.inicio || []), ...WIDGETS.map((w) => w[0]).filter((k) => !(perfil.preferencias?.inicio || []).includes(k))];
  const oculto: string[] = perfil.preferencias?.inicio_oculto || [];
  const M: Record<string, React.ReactNode> = { hoy: <Hoy />, clima: <ClimaDolar />, fechas: <Fechas />, juntada: <Juntada />, avisos: <Avisos />, paravos: <ParaVos abrir={setItem} />, descuento: <Descuento abrir={setItem} />, tip: <Tip abrir={setItem} />, primermes: <PrimerMes />, accesos: <Accesos /> };
  return <div className="pagina">
    <h2 className="titulo">{sal}, {perfil.nombre.split(" ")[0]}</h2>
    {orden.filter((k) => !oculto.includes(k) && M[k]).map((k) => <div key={k}>{M[k]}</div>)}
    {item && <ItemGuia item={item} cerrar={() => setItem(null)} />}
    <Rapido />
  </div>;
}
