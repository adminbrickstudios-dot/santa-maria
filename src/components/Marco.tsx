"use client";
import { tic } from "@/lib/tic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { olvidarSesion, useSesion } from "@/lib/sesion";
import { sb } from "@/lib/sb";
import { Icono } from "./Icono";
import { Avatar } from "./Avatar";
import { Captura, abrirCaptura, vaciarCola } from "./Captura";
import { Efectos } from "./Efectos";

const TABS = [["inicio", "Inicio", "inicio"], ["agenda", "Agenda", "calendario"], ["billetera", "Billetera", "billetera"], ["mapa", "Mapa", "mapa"], ["gente", "Gente", "gente"]];
const MENU = [
  ["/perfil", "usuario", "Mi perfil", "Foto, casa, carrera, colores"],
  ["/notificaciones", "campana", "Avisos", "Lo que pasó y qué te llega al celular"],
  ["/guia?v=guardados", "guardar", "Guardados", "Lo que marcaste en la guía"],
  ["/guia", "guia", "Guía", "La ciudad, descuentos y trámites"],
  ["/facu", "facu", "Estudio y horarios", "Materias, clases y apuntes"],
  ["/facu/carreras", "brujula", "Carreras", "Explorar, comparar y test de orientación"],
  ["/instalar", "instalar", "Instalar la app", "Ponela en tu pantalla de inicio"],
];

export function Marco({ children }: { children: React.ReactNode }) {
  const ruta = usePathname(), r = useRouter();
  const { perfil, grupo, sinLeer, avisos, pantalla, recuentos } = useSesion();
  const [menu, setMenu] = useState(false);
  const enChat = ruta.startsWith("/gente/chat/"), enInicio = ruta === "/inicio", enMapa = ruta.startsWith("/mapa");
  const conten = useRef<HTMLElement>(null), [oculta, setOculta] = useState(false), ult = useRef(0);
  const [titulo, setTitulo] = useState(""), [tira, setTira] = useState(0), gesto = useRef<any>(null);
  useEffect(() => { setOculta(false); setTitulo(""); }, [ruta]);
  useEffect(() => {
    const cola = () => vaciarCola();
    cola(); addEventListener("online", cola);
    return () => removeEventListener("online", cola);
  }, []);
  function alScroll() {
    const y = conten.current?.scrollTop || 0;
    if (Math.abs(y - ult.current) > 8) { setOculta(y > ult.current && y > 60); ult.current = y; }
    /* El título grande pasa a la barra de arriba, como en el iPhone */
    const t = y > 44 ? (conten.current?.querySelector(".vista .titulo")?.textContent || "") : "";
    setTitulo(t);
  }
  /* Deslizar desde el borde para volver, y tirar para abajo para actualizar */
  function tocaIni(e: React.TouchEvent) { const t = e.touches[0]; gesto.current = { x: t.clientX, y: t.clientY, borde: t.clientX < 22 && !enInicio, arriba: (conten.current?.scrollTop || 0) <= 0 && !enMapa }; }
  function tocaMov(e: React.TouchEvent) {
    const g = gesto.current, t = e.touches[0]; if (!g) return;
    const dx = t.clientX - g.x, dy = t.clientY - g.y, v = conten.current?.querySelector(".vista") as HTMLElement | null;
    if (g.borde && dx > 0 && Math.abs(dx) > Math.abs(dy) && v) { v.style.transition = "none"; v.style.transform = `translateX(${dx * .55}px)`; g.dx = dx; }
    else if (g.arriba && dy > 0 && Math.abs(dy) > Math.abs(dx) * 1.4) { setTira(Math.min(84, dy * .45)); g.dy = dy; }
  }
  function tocaFin() {
    const g = gesto.current; gesto.current = null; if (!g) return;
    const v = conten.current?.querySelector(".vista") as HTMLElement | null;
    if (g.dx !== undefined && v) { v.style.transition = "transform .3s cubic-bezier(.32,.72,0,1)"; v.style.transform = ""; if (g.dx > 90) atras(); }
    if (g.dy !== undefined) { if (g.dy * .45 > 62) refrescar(); setTira(0); }
  }
  function refrescar() {
    tic(10);
    ["sm-agenda", "sm-plata", "sm-inicio"].forEach((x) => window.dispatchEvent(new Event(x)));
    recuentos();
    if (!["/inicio", "/agenda", "/billetera"].some((x) => ruta.startsWith(x))) location.reload();
  }
  function atras() { if (history.length > 1) r.back(); else r.push("/inicio"); }
  const sec = ["agenda", "billetera", "mapa", "guia", "facu", "gente"].find((x) => ruta.startsWith("/" + x)) || "inicio";
  const tabs = TABS.filter(([id]) => pantalla(id));
  const activa = tabs.findIndex(([id]) => ruta.startsWith("/" + id));
  const toques = useRef<Record<string, number>>({});
  function tocar(e: React.MouseEvent, id: string) {
    if (id !== "billetera" && id !== "agenda") return;
    const ahora = performance.now(), antes = toques.current[id] || 0;
    toques.current[id] = ahora;
    if (ahora - antes < 320) { e.preventDefault(); abrirCaptura(id === "agenda" ? "agenda" : "plata"); }
  }
  async function salir() { olvidarSesion(); await sb.auth.signOut(); r.replace("/entrar"); }
  return (
    <div className="marco" data-sec={sec} data-ini={enInicio ? 1 : 0} data-alto={titulo ? 1 : 0}>
      <header className="barra-top">
        {enInicio ? <button className="ico-btn" onClick={() => setMenu(true)} aria-label="Abrir menú"><Icono n="menu" /></button> : <button className="ico-btn atras" onClick={atras} aria-label="Volver"><Icono n="volver" /></button>}
        <h1><i />{titulo ? <span key={titulo}>{titulo}</span> : enInicio ? grupo?.nombre || "Santa María" : ""}</h1>
        <Link className="ico-btn" href="/buscar" aria-label="Buscar"><Icono n="lupa" /></Link>
        <Link className="ico-btn" href="/notificaciones" aria-label={`Avisos, ${avisos} sin leer`}><Icono n="campana" />{avisos > 0 && <span className="punto">{avisos > 9 ? "9+" : avisos}</span>}</Link>
        <Link className="ico-btn" href="/perfil" aria-label="Mi perfil"><Avatar p={perfil} t={34} /></Link>
      </header>
      <main ref={conten} className="contenido" id="contenido" onScroll={alScroll} onTouchStart={tocaIni} onTouchMove={tocaMov} onTouchEnd={tocaFin} onTouchCancel={tocaFin}>
        {tira > 0 && <div className="tira" style={{ height: tira }} aria-hidden="true"><i style={{ transform: `rotate(${tira * 4}deg)`, opacity: tira / 62 }} /></div>}
        <div className="vista" key={ruta}>{children}</div>
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
        </aside>
      </>}
    </div>
  );
}
