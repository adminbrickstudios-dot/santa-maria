"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useSesion } from "@/lib/sesion";
import { sb } from "@/lib/sb";
import { Icono } from "./Icono";
import { Avatar } from "./Avatar";
import { Captura, abrirCaptura } from "./Captura";
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
  const { perfil, grupo, sinLeer, avisos, pantalla } = useSesion();
  const [menu, setMenu] = useState(false);
  const enChat = ruta.startsWith("/gente/chat/");
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
  async function salir() { await sb.auth.signOut(); r.replace("/entrar"); }
  return (
    <div className="marco" data-sec={sec}>
      <header className="barra-top">
        <button className="ico-btn" onClick={() => setMenu(true)} aria-label="Abrir menú"><Icono n="menu" /></button>
        <h1><i />{grupo?.nombre || "Santa María"}</h1>
        <Link className="ico-btn" href="/buscar" aria-label="Buscar"><Icono n="lupa" /></Link>
        <Link className="ico-btn" href="/notificaciones" aria-label={`Avisos, ${avisos} sin leer`}><Icono n="campana" />{avisos > 0 && <span className="punto">{avisos > 9 ? "9+" : avisos}</span>}</Link>
        <Link className="ico-btn" href="/perfil" aria-label="Mi perfil"><Avatar p={perfil} t={34} /></Link>
      </header>
      <main className="contenido" id="contenido"><div className="vista" key={ruta}>{children}</div></main>
      <Captura /><Efectos />
      {!enChat && <nav className="tabs5" aria-label="Secciones" style={{ "--n": tabs.length, "--i": Math.max(0, activa) } as React.CSSProperties}>
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
