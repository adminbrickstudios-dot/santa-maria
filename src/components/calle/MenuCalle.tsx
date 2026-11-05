"use client";
/* Menú lateral: todo lo que no hace falta tener siempre a la vista. */
import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import { Icono } from "@/components/Icono";
import type { Punto } from "@/lib/calle/ciudad";
import { CAMARA, Credito, SOL, Svg, distancia } from "./comunes";

export type HojaMenu = "filtros" | "recorridos" | "practicar" | "encuentro" | "clima" | "lugares";

function Fila({ icono, titulo, detalle, onClick }: { icono: ReactNode; titulo: string; detalle?: string; onClick: () => void }) {
  return <button className="calle-fila" onClick={onClick}><span className="calle-fila-ic">{icono}</span><span><b>{titulo}</b>{detalle && <small>{detalle}</small>}</span></button>;
}

export function MenuCalle({ cerrar, abrir, enMapa, modoFoto, compartir, salir, posicion, recorrido, tactil, iniciar }: {
  iniciar: () => void; cerrar: () => void; abrir: (h: HojaMenu) => void; enMapa: () => void; modoFoto: () => void; compartir: () => void; salir: () => void;
  posicion: Punto | null; recorrido: { metros: number; pasos: number; kcal: number }; tactil: boolean;
}) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === "Escape") cerrar(); };
    addEventListener("keydown", f);
    return () => removeEventListener("keydown", f);
  }, [cerrar]);
  const hacer = (f: () => void) => () => { cerrar(); f(); };
  return (
    <div className="calle-fondo calle-fondo-lado" onClick={cerrar} role="presentation">
      <aside className="calle-menu" role="dialog" aria-modal="true" aria-label="Más opciones" onClick={(e) => e.stopPropagation()}>
        <header className="calle-hoja-cab"><h2>Más opciones</h2><button className="calle-cerrar" onClick={cerrar} aria-label="Cerrar"><Icono n="x" /></button></header>
        <div className="calle-hoja-cuerpo">
          <button className="calle-btn pri calle-iniciar" onClick={hacer(iniciar)}>Iniciar recorrido</button>
          <Fila icono={<Icono n="pin" t={22} />} titulo="Qué hay cerca" detalle="Farmacias, cajeros, abierto ahora" onClick={hacer(() => abrir("filtros"))} />
          <Fila icono={<Icono n="mapa" t={22} />} titulo="Elegir en el mapa" detalle="Tocá un punto y andá ahí" onClick={hacer(enMapa)} />
          <Fila icono={<Icono n="brujula" t={22} />} titulo="Recorridos" detalle="Paradas reales que avanzan solas" onClick={hacer(() => abrir("recorridos"))} />
          <Fila icono={<Icono n="facu" t={22} />} titulo="Practicar un recorrido" detalle="De casa a la facu, con tiempo a pie" onClick={hacer(() => abrir("practicar"))} />
          <Fila icono={<Icono n="gente" t={22} />} titulo="Punto de encuentro" detalle="A mitad de camino con tus amigos" onClick={hacer(() => abrir("encuentro"))} />
          <Fila icono={<Svg d={SOL} t={22} />} titulo="Reloj y clima" detalle="El de ahora, o simulá otra hora" onClick={hacer(() => abrir("clima"))} />
          <Fila icono={<Svg d={CAMARA} t={22} />} titulo="Modo foto" detalle="Sin botones, para compartir la vista" onClick={hacer(modoFoto)} />
          <Fila icono={<Icono n="compartir" t={22} />} titulo="Compartir este punto" detalle="Se abre en esta misma vista" onClick={hacer(compartir)} />
          <Fila icono={<Icono n="guardar" t={22} />} titulo="Mis lugares" detalle="Favoritos y visitados" onClick={hacer(() => abrir("lugares"))} />
          <h3 className="calle-sec">Tu recorrido</h3>
          <div className="calle-numeros">
            <div><b>{distancia(recorrido.metros) || "0 m"}</b><small>andados</small></div>
            <div><b>{recorrido.pasos.toLocaleString("es-AR")}</b><small>pasos</small></div>
            <div><b>{recorrido.kcal}</b><small>kcal estimadas</small></div>
          </div>
          {!tactil && <>
            <h3 className="calle-sec">Con teclado</h3>
            <p className="calle-nota izq">WASD o flechas para moverte · Shift para correr · Mouse para mirar · Q y E o la rueda suben y bajan el dron · / para buscar</p>
          </>}
          {posicion && <Link className="calle-fila" href={`/mapa?lat=${posicion.lat.toFixed(6)}&lon=${posicion.lon.toFixed(6)}&ver=1`}><span className="calle-fila-ic"><Icono n="ciudad" t={22} /></span><span><b>Ver este punto en el mapa</b><small>Sale del modo calle</small></span></Link>}
          <Fila icono={<Icono n="salir" t={22} />} titulo="Salir de la calle" onClick={hacer(salir)} />
          <p className="calle-credito-menu"><Credito /></p>
        </div>
      </aside>
    </div>
  );
}
