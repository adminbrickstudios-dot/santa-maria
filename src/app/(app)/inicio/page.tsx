"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { tic } from "@/lib/tic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSesion } from "@/lib/sesion";
import { sb } from "@/lib/sb";
import { Icono } from "@/components/Icono";
import { expandirBoton } from "@/lib/transicion";
import { abrirCaptura } from "@/components/Captura";
import { DibuBilletera, DibuCalendario, DibuLibro, DibuMapa, IconoCielo } from "@/components/Animados";
import { aMin, ahoraBA, DIAS, faltan, pesos, MESES } from "@/lib/util";
import { activarPush, estaInstalada, pushSoportado } from "@/lib/push";
import { cieloDe, FONDO, useClima } from "@/lib/clima";
import { claveDeISO, diaClave, expandir, horaDeISO, TIPOS } from "@/lib/agenda";

/* Recorte del mapa chico: tiene que coincidir con scripts/mapa-mini.py */
const MINI = { o: -58.4465, e: -58.3485, n: -34.5725, s: -34.6225 };
const px = (lon: number) => `${((lon - MINI.o) / (MINI.e - MINI.o)) * 100}%`;
const py = (lat: number) => `${((MINI.n - lat) / (MINI.n - MINI.s)) * 100}%`;
const dentro = (lat: number, lon: number) => lon > MINI.o && lon < MINI.e && lat < MINI.n && lat > MINI.s;

function ClimaBoton() {
  const w = useClima();
  if (!w) return <span className="clima-b" style={{ opacity: 0 }} aria-hidden="true" />;
  const c = cieloDe(w.current.weather_code, w.current.is_day), f = FONDO[c];
  return <Link href="/clima" className="clima-b" aria-label={`Clima: ${Math.round(w.current.temperature_2m)} grados. Ver pronóstico`} style={{ "--c-fondo": f.b, "--c-sombra": f.s } as React.CSSProperties}><IconoCielo c={c} />{Math.round(w.current.temperature_2m)}°</Link>;
}
function MapaChico() {
  const { perfil, personas, lugares } = useSesion();
  const u = lugares.find((x: any) => x.destacado);
  const amigos = personas.filter((p: any) => p.id !== perfil.id && p.lat != null && dentro(p.lat, p.lon));
  return <div className="mapa-chico">
    <Link href="/mapa" className="mc-todo" aria-label="Abrir el mapa completo" />
    {amigos.map((p: any) => <i key={p.id} className="mc-amigo" style={{ left: px(p.lon), top: py(p.lat), background: p.color }} />)}
    {u && dentro(u.lat, u.lon) && <span className="mc-facu" style={{ left: px(u.lon), top: py(u.lat) }}><Icono n="pin" t={24} g={2.4} /></span>}
    {perfil.casa_lat != null && dentro(perfil.casa_lat, perfil.casa_lon) && <i className="mc-yo" style={{ left: px(perfil.casa_lon), top: py(perfil.casa_lat) }} />}
    <div className="mc-fila">
      <Link href="/mapa" className="mc-buscar"><Icono n="lupa" t={18} g={2.6} />¿A dónde vas?</Link>
      {u && <Link href={`/mapa?lat=${u.lat}&lon=${u.lon}&n=${encodeURIComponent(u.nombre)}`} className="mc-ir"><Icono n="facu" t={18} />Facu</Link>}
    </div>
  </div>;
}
type Accion = { n: string; ic: string; f: () => void };
/* Un toque abre, dos toques anota rápido y si lo mantenés aparecen los atajos */
function Gordo({ clase, n, href, titulo, sub, dibu, doble, atajos }: { clase: string; n: number; href: string; titulo: string; sub?: string; dibu: React.ReactNode; doble?: () => void; atajos: Accion[] }) {
  const r = useRouter(), t = useRef<any>(null), larga = useRef<any>(null), hizo = useRef(false), ini = useRef<[number, number]>([0, 0]);
  const [menu, setMenu] = useState<DOMRect | null>(null), btn = useRef<HTMLButtonElement>(null);
  const abrir = () => { tic(8); expandirBoton(btn.current!, () => r.push(href)); };
  function clic() {
    if (hizo.current) { hizo.current = false; return; }
    if (!doble) return abrir();
    if (t.current) { clearTimeout(t.current); t.current = null; tic(12); return doble(); }
    t.current = setTimeout(() => { t.current = null; abrir(); }, 210);
  }
  function inclina(e: React.PointerEvent) { const b = btn.current!, q = b.getBoundingClientRect(), x = (e.clientX - q.left) / q.width - .5, y = (e.clientY - q.top) / q.height - .5; b.style.setProperty("--rx", `${-y * 12}deg`); b.style.setProperty("--ry", `${x * 12}deg`); b.style.setProperty("--bx", `${(x + .5) * 100}%`); b.style.setProperty("--by", `${(y + .5) * 100}%`); }
  function baja(e: React.PointerEvent) { inclina(e); ini.current = [e.clientX, e.clientY]; larga.current = setTimeout(() => { hizo.current = true; tic(14); setMenu(btn.current!.getBoundingClientRect()); }, 420); }
  function mueve(e: React.PointerEvent) { inclina(e); if (Math.hypot(e.clientX - ini.current[0], e.clientY - ini.current[1]) > 10) clearTimeout(larga.current); }
  const suelta = () => { clearTimeout(larga.current); btn.current?.style.setProperty("--rx", "0deg"); btn.current?.style.setProperty("--ry", "0deg"); };
  useEffect(() => { const id = setTimeout(() => r.prefetch(href), 1800); return () => clearTimeout(id); }, [r, href]);
  return <>
    <button ref={btn} className={`gordo ${clase}`} style={{ "--n": n } as React.CSSProperties} onClick={clic} onPointerDown={baja} onPointerMove={mueve} onPointerUp={suelta} onPointerCancel={suelta} onPointerLeave={suelta} onContextMenu={(e) => e.preventDefault()}>{dibu}<b>{titulo}</b><small>{sub || " "}</small></button>
    {menu && createPortal(<div className="tq-fondo" onClick={() => { hizo.current = false; setMenu(null); }}><div className="tq-menu" style={{ left: Math.min(menu.left, innerWidth - 256), top: menu.bottom + 262 > innerHeight ? Math.max(16, menu.top - 262) : menu.bottom + 10 }}>{atajos.map((a) => <button key={a.n} onClick={(e) => { e.stopPropagation(); hizo.current = false; setMenu(null); a.f(); }}><span>{a.n}</span><Icono n={a.ic} t={20} /></button>)}</div></div>, document.body)}
  </>;
}
/* Lo próximo que tenés, con lo que hay que hacer */
function Proximo() {
  const { perfil } = useSesion(), r = useRouter();
  const [p, setP] = useState<any>(null);
  useEffect(() => {
    const leer = async () => {
      const ya = new Date(), hoy = ahoraBA(), man = new Date(hoy); man.setDate(man.getDate() + 1);
      const [{ data: e }, { data: c }] = await Promise.all([sb.from("eventos").select("*").eq("hecho", false).limit(800), sb.from("clases").select("*, materias(nombre)")]);
      const oc = expandir(e || [], diaClave(hoy), diaClave(man)).filter((o) => o.e.todo_dia ? o.dia === diaClave(hoy) : new Date(o.cuando) > ya);
      const clases = (c || []).flatMap((k: any) => [0, 1].map((i) => { const d = new Date(hoy); d.setDate(d.getDate() + i); return d.getDay() === k.dia ? { clase: k, cuando: new Date(`${diaClave(d)}T${k.hora_inicio.slice(0, 5)}:00-03:00`).toISOString() } : null; })).filter((x: any) => x && new Date(x.cuando) > ya);
      const todo = [...oc.map((o) => ({ ev: o.e, cuando: o.cuando, todo: o.e.todo_dia })), ...clases].sort((a: any, b: any) => (a.todo === b.todo ? a.cuando.localeCompare(b.cuando) : a.todo ? 1 : -1));
      setP(todo[0] || null);
    };
    leer();
    const f = () => leer();
    addEventListener("sm-agenda", f); addEventListener("sm-inicio", f);
    return () => { removeEventListener("sm-agenda", f); removeEventListener("sm-inicio", f); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil.id]);
  if (!p) return null;
  const e = p.ev, t = e ? TIPOS[e.tipo] || TIPOS.otro : TIPOS.clase, m = Math.round((new Date(p.cuando).getTime() - Date.now()) / 6e4);
  const hoyK = diaClave(ahoraBA()), cuando = p.todo ? "Hoy" : m < 60 ? `En ${Math.max(1, m)} min` : claveDeISO(p.cuando) === hoyK ? `Hoy ${horaDeISO(p.cuando)}` : `Mañana ${horaDeISO(p.cuando)}`;
  const titulo = e ? e.titulo : p.clase.materias?.nombre || "Clase", salir = e?.viaje_min && !p.todo ? new Date(new Date(p.cuando).getTime() - (e.viaje_min + 5) * 6e4) : null;
  const lugar = e?.lugar_nombre || (p.clase?.aula ? `Aula ${p.clase.aula}` : "");
  const abrir = () => r.push(e ? `/agenda?e=${e.id}` : "/facu");
  return <div className="prox" style={{ "--c": t.c } as React.CSSProperties}>
    <button className="prox-a" onClick={abrir}><span className="prox-e">{t.e}</span><span className="q"><small>{cuando}{salir ? `. Salí ${horaDeISO(salir.toISOString())}` : ""}</small><b>{titulo}</b>{lugar && <small>{lugar}</small>}</span></button>
    {e?.lat != null && <Link className="prox-ir" href={`/mapa?lat=${e.lat}&lon=${e.lon}&n=${encodeURIComponent(e.lugar_nombre || e.titulo)}`} aria-label="Cómo llego"><Icono n="pin" t={21} /></Link>}
  </div>;
}
function useResumen() {
  const [ag, setAg] = useState(""), [pl, setPl] = useState(""), [cl, setCl] = useState("");
  const { perfil } = useSesion();
  const [giro, setGiro] = useState(0);
  useEffect(() => {
    const f = () => setGiro((x) => x + 1), v = () => { if (document.visibilityState === "visible") f(); };
    ["sm-agenda", "sm-plata", "sm-inicio"].forEach((x) => addEventListener(x, f)); document.addEventListener("visibilitychange", v);
    return () => { ["sm-agenda", "sm-plata", "sm-inicio"].forEach((x) => removeEventListener(x, f)); document.removeEventListener("visibilitychange", v); };
  }, []);
  useEffect(() => {
    sb.from("eventos").select("titulo,fecha").eq("hecho", false).gte("fecha", new Date().toISOString()).order("fecha").limit(1).then(({ data }: any) => {
      const e = data?.[0]; setAg(e ? `${e.titulo}, ${faltan(e.fecha)}` : "Tocá dos veces para sumar algo");
    });
    const h = ahoraBA(), ini = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}-01`;
    sb.from("movimientos").select("tipo,monto").gte("fecha", ini).then(({ data }: any) => {
      const l = data || [], g = l.filter((m: any) => m.tipo === "gasto").reduce((a: number, m: any) => a + +m.monto, 0), lim = +(perfil.preferencias?.presupuesto || 0);
      setPl(!l.length ? "Tocá dos veces para anotar" : lim ? `Te quedan ${pesos(Math.max(0, lim - g))}` : `Gastaste ${pesos(g)} este mes`);
    });
    sb.from("clases").select("hora_inicio,dia,materias(nombre)").order("hora_inicio").then(({ data }: any) => {
      const l = data || [], d = h.getDay(), m = h.getHours() * 60 + h.getMinutes();
      for (let i = 0; i < 7; i++) {
        const x = l.find((k: any) => k.dia === (d + i) % 7 && (i > 0 || aMin(k.hora_inicio) > m));
        if (x) { setCl(`${i === 0 ? "Hoy" : i === 1 ? "Mañana" : DIAS[(d + i) % 7]} ${x.hora_inicio.slice(0, 5)}: ${x.materias?.nombre}`); return; }
      }
      setCl("Materias, clases y apuntes");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [giro]);
  return { ag, pl, cl };
}
function Avisos() {
  const { perfil, toast } = useSesion();
  const [p, setP] = useState(false), [ins, setIns] = useState(false);
  useEffect(() => { setP(pushSoportado() && Notification.permission === "default"); setIns(!estaInstalada()); }, []);
  if (ins) return <Link href="/instalar" className="mas-largo"><Icono n="instalar" t={20} /><span>Instalá la app en tu celular</span><Icono n="chevron" t={18} /></Link>;
  if (p) return <button className="mas-largo" onClick={async () => { const r = await activarPush(perfil.id); setP(false); toast(r === "ok" ? "Listo, te van a llegar al celular." : "No se activaron."); }}><Icono n="campana" t={20} /><span>Activá las notificaciones</span><Icono n="chevron" t={18} /></button>;
  return null;
}
function Ayuda() {
  const { perfil, recargar } = useSesion();
  const [v, setV] = useState(!perfil.preferencias?.ayuda_inicio);
  if (!v) return null;
  return <div className="ayuda"><span>💡</span><p><b>Dos toques</b> en Agenda o Billetera anotan rápido. <b>Mantené apretado</b> un botón para ver atajos.</p><button className="ico-btn" aria-label="Entendido" onClick={async () => { setV(false); await sb.from("perfiles").update({ preferencias: { ...perfil.preferencias, ayuda_inicio: true } }).eq("id", perfil.id); recargar(); }}><Icono n="x" t={18} /></button></div>;
}
export default function Inicio() {
  const { perfil, pantalla, lugares } = useSesion(), r = useRouter();
  const h = ahoraBA(), hr = h.getHours(), sal = hr < 6 ? "Buenas noches" : hr < 13 ? "Buen día" : hr < 20 ? "Buenas tardes" : "Buenas noches";
  const { ag, pl, cl } = useResumen();
  const u = lugares.find((x: any) => x.destacado), ir = (x: string) => () => r.push(x);
  return <div className="pagina">
    <div className="saludo"><h2>{sal}, {perfil.nombre.split(" ")[0]}</h2><ClimaBoton /></div>
    {pantalla("mapa") && <MapaChico />}
    <Proximo />
    <div className="cuatro">
      <Gordo clase="g-agenda" n={0} href="/agenda" titulo="Agenda" sub={ag} dibu={<DibuCalendario dia={h.getDate()} mes={MESES[h.getMonth()].slice(0, 3).toUpperCase()} />} doble={() => abrirCaptura("agenda")} atajos={[{ n: "Sumar algo", ic: "mas", f: () => abrirCaptura("agenda") }, { n: "Lo próximo", ic: "reloj", f: ir("/agenda?v=lista") }, { n: "Resúmenes", ic: "libro", f: ir("/agenda?v=res") }]} />
      <Gordo clase="g-plata" n={1} href="/billetera" titulo="Billetera" sub={pl} dibu={<DibuBilletera />} doble={() => abrirCaptura("plata")} atajos={[{ n: "Anotar gasto", ic: "fuego", f: () => abrirCaptura("plata", "gasto") }, { n: "Entró plata", ic: "mas", f: () => abrirCaptura("plata", "ingreso") }, { n: "Números del mes", ic: "grafico", f: ir("/billetera?v=num") }, { n: "Gastos fijos", ic: "repetir", f: ir("/billetera?v=fijos") }]} />
      <Gordo clase="g-mapa" n={2} href="/mapa" titulo="Mapa" sub="Cómo llegar a todos lados" dibu={<DibuMapa />} atajos={[...(u ? [{ n: "Ir a la facu", ic: "facu", f: ir(`/mapa?lat=${u.lat}&lon=${u.lon}&n=${encodeURIComponent(u.nombre)}`) }] : []), { n: "Qué hay cerca", ic: "pin", f: ir("/mapa?tab=cerca") }, { n: "Dónde juntarnos", ic: "gente", f: ir("/mapa?tab=junta") }]} />
      <Gordo clase="g-estudio" n={3} href="/facu" titulo="Estudio y horarios" sub={cl} dibu={<DibuLibro />} atajos={[{ n: "Mi horario", ic: "reloj", f: ir("/facu") }, { n: "Materias", ic: "libro", f: ir("/facu?v=materias") }, { n: "Apuntes", ic: "adjunto", f: ir("/facu?v=apuntes") }, { n: "Carreras", ic: "brujula", f: ir("/facu/carreras") }]} />
    </div>
    <button className="decime" onClick={() => abrirCaptura("auto")}><span>Decime qué anotar</span><i><Icono n="mic" t={20} /></i></button>
    <Link href="/mas" className="mas-largo"><span>Más</span><span className="ptos" style={{ flex: "none" }}><i style={{ "--c": "#10B765" } as React.CSSProperties} /><i style={{ "--c": "#FFB400" } as React.CSSProperties} /><i style={{ "--c": "#7C5CFC" } as React.CSSProperties} /></span><Icono n="chevron" t={18} /></Link>
    <Ayuda />
    <Avisos />
  </div>;
}
