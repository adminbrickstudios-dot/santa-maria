"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSesion } from "@/lib/sesion";
import { sb } from "@/lib/sb";
import { Icono } from "@/components/Icono";
import { abrirCaptura } from "@/components/Captura";
import { DibuBilletera, DibuCalendario, DibuLibro, DibuMapa, IconoCielo } from "@/components/Animados";
import { aMin, ahoraBA, DIAS, faltan, pesos, MESES } from "@/lib/util";
import { activarPush, estaInstalada, pushSoportado } from "@/lib/push";
import { cieloDe, FONDO, useClima } from "@/lib/clima";

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
  return <Link href="/mapa" className="mapa-chico" aria-label="Abrir el mapa completo">
    {amigos.map((p: any) => <i key={p.id} className="mc-amigo" style={{ left: px(p.lon), top: py(p.lat), background: p.color }} />)}
    {u && dentro(u.lat, u.lon) && <span className="mc-facu" style={{ left: px(u.lon), top: py(u.lat) }}><Icono n="pin" t={24} g={2.4} /></span>}
    {perfil.casa_lat != null && dentro(perfil.casa_lat, perfil.casa_lon) && <i className="mc-yo" style={{ left: px(perfil.casa_lon), top: py(perfil.casa_lat) }} />}
    <span className="mc-buscar"><Icono n="lupa" t={19} g={2.6} />¿A dónde vas?</span>
  </Link>;
}
/* Un toque abre, dos toques anota rápido */
function Gordo({ clase, n, href, titulo, sub, dibu, doble }: { clase: string; n: number; href: string; titulo: string; sub?: string; dibu: React.ReactNode; doble?: () => void }) {
  const r = useRouter(), t = useRef<any>(null);
  function clic() {
    if (!doble) return r.push(href);
    if (t.current) { clearTimeout(t.current); t.current = null; navigator.vibrate?.(12); return doble(); }
    t.current = setTimeout(() => { t.current = null; r.push(href); }, 240);
  }
  return <button className={`gordo ${clase}`} style={{ "--n": n } as React.CSSProperties} onClick={clic} onPointerEnter={() => r.prefetch(href)}>{dibu}<b>{titulo}</b><small>{sub || " "}</small></button>;
}
function useResumen() {
  const [ag, setAg] = useState(""), [pl, setPl] = useState(""), [cl, setCl] = useState("");
  const { perfil } = useSesion();
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
  }, []);
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
export default function Inicio() {
  const { perfil, pantalla } = useSesion();
  const h = ahoraBA(), hr = h.getHours(), sal = hr < 6 ? "Buenas noches" : hr < 13 ? "Buen día" : hr < 20 ? "Buenas tardes" : "Buenas noches";
  const { ag, pl, cl } = useResumen();
  return <div className="pagina">
    <div className="saludo"><h2>{sal}, {perfil.nombre.split(" ")[0]}</h2><ClimaBoton /></div>
    {pantalla("mapa") && <MapaChico />}
    <div className="cuatro">
      <Gordo clase="g-agenda" n={0} href="/agenda" titulo="Agenda" sub={ag} dibu={<DibuCalendario dia={h.getDate()} mes={MESES[h.getMonth()].slice(0, 3).toUpperCase()} />} doble={() => abrirCaptura("agenda")} />
      <Gordo clase="g-plata" n={1} href="/billetera" titulo="Billetera" sub={pl} dibu={<DibuBilletera />} doble={() => abrirCaptura("plata")} />
      <Gordo clase="g-mapa" n={2} href="/mapa" titulo="Mapa" sub="Cómo llegar a todos lados" dibu={<DibuMapa />} />
      <Gordo clase="g-estudio" n={3} href="/facu" titulo="Estudio y horarios" sub={cl} dibu={<DibuLibro />} />
    </div>
    <Link href="/mas" className="mas-largo"><span>Más</span><span className="ptos" style={{ flex: "none" }}><i style={{ "--c": "#10B765" } as React.CSSProperties} /><i style={{ "--c": "#FFB400" } as React.CSSProperties} /><i style={{ "--c": "#7C5CFC" } as React.CSSProperties} /></span><Icono n="chevron" t={18} /></Link>
    <Avisos />
  </div>;
}
