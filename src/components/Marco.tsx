"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { tic } from "@/lib/tic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ViewTransition, useEffect, useLayoutEffect, useRef, useState } from "react";
import { olvidarSesion, useSesion } from "@/lib/sesion";
import { sb } from "@/lib/sb";
import { MARCA } from "@/lib/marca";
import { Icono } from "./Icono";
import { Avatar } from "./Avatar";
import { Captura, abrirCaptura, vaciarCola } from "./Captura";
import { Efectos } from "./Efectos";

const TABS = [["inicio", "Inicio", "inicio"], ["agenda", "Agenda", "calendario"], ["billetera", "Billetera", "billetera"], ["mapa", "Mapa", "mapa"], ["gente", "Gente", "gente"]];
const MENU = [
  ["/perfil", "usuario", "Mi perfil", "Foto, casa, carrera, colores"],
  ["/notificaciones", "campana", "Avisos", "Lo que pasó y qué te llega al celular"],
  ["/guia?v=guardados", "guardar", "Guardados", "Lo que marcaste en la guía"],
  ["/tareas", "tilde", "Tareas", "Lo que tenés que hacer"],
  ["/caja", "guardar", "Mi caja", "Notas, fotos y archivos tuyos"],
  ["/compras", "regalo", "Compras", "Listas y qué conviene hoy"],
  ["/bondi", "bus", "Bondi", "Cuánto sale y cómo pagar"],
  ["/guia", "guia", "Guía", "La ciudad, descuentos y trámites"],
  ["/facu", "facu", "Estudio y horarios", "Materias, clases y apuntes"],
  ["/facu/carreras", "brujula", "Carreras", "Explorar, comparar y test de orientación"],
  ["/instalar", "instalar", "Instalar la app", "Ponela en tu pantalla de inicio"],
];
/* Las que se abren todo el tiempo quedan listas de antemano */
const PRINCIPALES = ["/agenda", "/billetera", "/mapa", "/gente", "/facu", "/mas", "/tareas", "/inicio"];
const CURVA = "cubic-bezier(.32,.72,0,1)";
const pocoMovimiento = () => matchMedia("(prefers-reduced-motion:reduce)").matches;
const conVistas = () => "startViewTransition" in document && !!CSS.supports?.("view-transition-class", "a");

export function Marco({ children }: { children: React.ReactNode }) {
  const ruta = usePathname(), r = useRouter();
  const { perfil, grupo, sinLeer, avisos, pantalla, recuentos } = useSesion();
  const [menu, setMenu] = useState(false);
  const enChat = ruta.startsWith("/gente/chat/"), enInicio = ruta === "/inicio", enMapa = ruta.startsWith("/mapa");
  const marco = useRef<HTMLDivElement>(null), conten = useRef<HTMLElement>(null), vista = useRef<HTMLDivElement>(null), tiraEl = useRef<HTMLDivElement>(null);
  const [oculta, setOculta] = useState(false), ult = useRef(0), cuadro = useRef(0), tituloEl = useRef<Element | null>(null);
  const [titulo, setTitulo] = useState(""), gesto = useRef<any>(null);
  const vuelve = useRef(false), primera = useRef(true), yendo = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setOculta(false); setTitulo(""); }, [ruta]);
  useEffect(() => {
    const cola = () => vaciarCola();
    cola(); addEventListener("online", cola);
    return () => removeEventListener("online", cola);
  }, []);
  useEffect(() => {
    const f = () => { vuelve.current = true; document.documentElement.dataset.dir = "atras"; };
    addEventListener("popstate", f);
    return () => removeEventListener("popstate", f);
  }, []);
  /* Sin red de por medio: cuando el celular está libre va dejando listas las pantallas principales */
  useEffect(() => {
    const red = (navigator as any).connection;
    if (red?.saveData || /2g/.test(red?.effectiveType || "")) return;
    let i = 0, id: any = 0, fin = false;
    const pedir = (f: () => void) => ("requestIdleCallback" in window ? requestIdleCallback(f, { timeout: 1500 }) : setTimeout(f, 300));
    const sig = () => { if (fin || i >= PRINCIPALES.length) return; const h = PRINCIPALES[i++]; if (h !== location.pathname) r.prefetch(h); id = pedir(sig); };
    id = setTimeout(sig, 700);
    return () => { fin = true; clearTimeout(id); };
  }, [r]);
  /* La pantalla nueva entra con transform y opacity: si el navegador hace View Transitions lo resuelve él, y si no, esto */
  useLayoutEffect(() => {
    const m = marco.current; if (m) delete m.dataset.yendo;
    if (yendo.current) { clearTimeout(yendo.current); yendo.current = null; }
    tituloEl.current = null;
    const atras = vuelve.current; vuelve.current = false;
    const quitar = setTimeout(() => { delete document.documentElement.dataset.dir; }, 420);
    if (primera.current) { primera.current = false; return () => clearTimeout(quitar); }
    const v = vista.current;
    if (v?.animate && !conVistas() && !pocoMovimiento()) v.animate([{ opacity: .4, transform: `translate3d(${atras ? -18 : 18}px,0,0)` }, { opacity: 1, transform: "none" }], { duration: 260, easing: CURVA });
    return () => clearTimeout(quitar);
  }, [ruta]);
  /* Respuesta inmediata: el toque se nota antes de que llegue la pantalla */
  function alTocar(e: React.MouseEvent) {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const a = (e.target as HTMLElement).closest?.("a[href]") as HTMLAnchorElement | null;
    if (!a || a.target || a.origin !== location.origin || a.pathname === location.pathname) return;
    document.documentElement.dataset.dir = "ida";
    avisarYendo();
  }
  function avisarYendo() {
    const m = marco.current; if (!m) return;
    m.dataset.yendo = "1";
    if (yendo.current) clearTimeout(yendo.current);
    yendo.current = setTimeout(() => { delete m.dataset.yendo; }, 5000);
  }
  function alScroll() {
    if (cuadro.current) return;
    cuadro.current = requestAnimationFrame(() => {
      cuadro.current = 0;
      const c = conten.current; if (!c) return;
      const y = c.scrollTop;
      if (Math.abs(y - ult.current) > 8) { setOculta(y > ult.current && y > 60); ult.current = y; }
      /* El título grande pasa a la barra de arriba, como en el iPhone */
      if (!tituloEl.current) tituloEl.current = c.querySelector(".vista .titulo");
      setTitulo(y > 44 ? tituloEl.current?.textContent || "" : "");
    });
  }
  /* Deslizar desde el borde para volver, y tirar para abajo para actualizar: solo mueven transform, sin pasar por React */
  function tocaIni(e: React.TouchEvent) { const t = e.touches[0]; gesto.current = { x: t.clientX, y: t.clientY, borde: t.clientX < 22 && !enInicio, arriba: (conten.current?.scrollTop || 0) <= 0 && !enMapa }; }
  function tocaMov(e: React.TouchEvent) {
    const g = gesto.current, t = e.touches[0]; if (!g) return;
    const dx = t.clientX - g.x, dy = t.clientY - g.y, v = vista.current, ti = tiraEl.current;
    if (g.borde && dx > 0 && Math.abs(dx) > Math.abs(dy) && v) { v.style.transition = "none"; v.style.transform = `translate3d(${dx * .55}px,0,0)`; g.dx = dx; }
    else if (g.arriba && dy > 0 && Math.abs(dy) > Math.abs(dx) * 1.4 && v && ti) {
      const d = Math.min(84, dy * .45);
      v.style.transition = ti.style.transition = "none"; v.style.transform = `translate3d(0,${d}px,0)`;
      ti.style.transform = `translate3d(0,${d}px,0)`; ti.style.opacity = String(d / 62);
      (ti.firstChild as HTMLElement).style.transform = `rotate(${d * 4}deg)`;
      g.dy = dy;
    }
  }
  function tocaFin() {
    const g = gesto.current; gesto.current = null; if (!g) return;
    const v = vista.current, ti = tiraEl.current;
    const volver = () => { if (!v) return; v.style.transition = `transform .3s ${CURVA}`; v.style.transform = ""; };
    if (g.dx !== undefined) { volver(); if (g.dx > 90) atras(); }
    if (g.dy !== undefined) {
      volver();
      if (ti) { ti.style.transition = `transform .3s ${CURVA},opacity .2s`; ti.style.transform = ""; ti.style.opacity = "0"; }
      if (g.dy * .45 > 62) refrescar();
    }
  }
  function refrescar() {
    tic(10);
    ["sm-agenda", "sm-plata", "sm-inicio"].forEach((x) => window.dispatchEvent(new Event(x)));
    recuentos();
    if (!["/inicio", "/agenda", "/billetera"].some((x) => ruta.startsWith(x))) location.reload();
  }
  function atras() { vuelve.current = true; document.documentElement.dataset.dir = "atras"; avisarYendo(); if (history.length > 1) r.back(); else r.push("/inicio"); }
  const sec = ["agenda", "billetera", "mapa", "guia", "facu", "estudio", "gente"].find((x) => ruta.startsWith("/" + x)) || "inicio";
  const tabs = TABS.filter(([id]) => pantalla(id));
  const activa = tabs.findIndex(([id]) => ruta.startsWith("/" + id));
  const toques = useRef<Record<string, number>>({});
  function tocar(e: React.MouseEvent, id: string) {
    if (id !== "billetera" && id !== "agenda") return;
    const ahora = performance.now(), antes = toques.current[id] || 0;
    toques.current[id] = ahora;
    if (ahora - antes < 320) { e.preventDefault(); abrirCaptura(id === "agenda" ? "agenda" : "plata"); }
  }
  /* Recarga completa: así no queda en memoria nada de esta cuenta para la siguiente */
  async function salir() { olvidarSesion(); await sb.auth.signOut(); location.replace("/entrar"); }
  return (
    <div ref={marco} className="marco" data-sec={sec} data-ini={enInicio ? 1 : 0} data-alto={titulo ? 1 : 0} onClickCapture={alTocar}>
      <header className="barra-top">
        {enInicio ? <button className="ico-btn" onClick={() => setMenu(true)} aria-label="Abrir menú"><Icono n="menu" /></button> : <button className="ico-btn atras" onClick={atras} aria-label="Volver"><Icono n="volver" /></button>}
        <h1><i />{titulo ? <span key={titulo}>{titulo}</span> : enInicio ? grupo?.nombre || MARCA.nombre : ""}</h1>
        <Link className="ico-btn" href="/buscar" aria-label="Buscar"><Icono n="lupa" /></Link>
        <Link className="ico-btn" href="/notificaciones" aria-label={`Avisos, ${avisos} sin leer`}><Icono n="campana" />{avisos > 0 && <span className="punto">{avisos > 9 ? "9+" : avisos}</span>}</Link>
        <Link className="ico-btn" href="/perfil" aria-label="Mi perfil"><Avatar p={perfil} t={34} /></Link>
      </header>
      <main ref={conten} className="contenido" id="contenido" onScroll={alScroll} onTouchStart={tocaIni} onTouchMove={tocaMov} onTouchEnd={tocaFin} onTouchCancel={tocaFin}>
        <div ref={tiraEl} className="tira" aria-hidden="true"><i /></div>
        <ViewTransition key={ruta} name="vista" share="vista" enter="vista" exit="vista" update="none" default="none"><div ref={vista} className="vista">{children}</div></ViewTransition>
      </main>
      <Captura /><Efectos />
      {!enInicio && !enChat && !enMapa && <Link href="/inicio" className={`casa-flota ${oculta ? "fuera" : ""}`} aria-label="Ir a Inicio"><Icono n="inicio" t={24} /></Link>}
      {enInicio && <nav className="tabs5" aria-label="Secciones" style={{ "--n": tabs.length, "--i": Math.max(0, activa) } as React.CSSProperties}>
        {activa >= 0 && <span className="tab-bola" aria-hidden="true" />}
        {tabs.map(([id, n, ic]) => (
          <Link key={id} href={`/${id}`} onClick={(e) => tocar(e, id)} className={`tab5 ${ruta.startsWith("/" + id) ? "activa" : ""}`}>
            <Icono n={ic} t={26} />{n}
            {id === "gente" && sinLeer > 0 && <span className="punto">{sinLeer > 9 ? "9+" : sinLeer}</span>}
          </Link>
        ))}
      </nav>}
      {menu && <>
        <div className="lateral-f" onClick={() => setMenu(false)} />
        <aside className="lateral" aria-label="Menú" onClick={() => setMenu(false)}>
          <div className="l-yo"><Avatar p={perfil} t={52} /><div><b>{perfil.nombre}</b><small>@{perfil.usuario}</small></div></div>
          {MENU.map(([h, ic, n, d]) => <Link key={h} href={h} className="l-item"><Icono n={ic} /><span><b>{n}</b><small>{d}</small></span></Link>)}
          {perfil.rol === "admin" && <Link href="/admin" className="l-item"><Icono n="admin" /><span><b>Administrar</b><small>Cuentas, mails y pantallas del grupo</small></span></Link>}
          <button className="l-item" onClick={salir}><Icono n="salir" /><span><b>Cerrar sesión</b></span></button>
          <p className="l-marca"><b>{MARCA.nombre}</b>{MARCA.sigla}</p>
        </aside>
      </>}
    </div>
  );
}
