"use client";
/* Menú lateral: lo que no hace falta tener siempre a la vista. */
import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import { Icono } from "@/components/Icono";
import type { Punto } from "@/lib/calle/ciudad";
import { CAMARA, Credito, SOL, Svg, distancia } from "./comunes";
import type { Destino } from "./Buscador";

export const HORAS: { id: string; nombre: string; h: number | null }[] = [
  { id: "ahora", nombre: "Ahora", h: null }, { id: "manana", nombre: "Mañana", h: 9 }, { id: "tarde", nombre: "Tarde", h: 15 }, { id: "atardecer", nombre: "Atardecer", h: 19.2 }, { id: "noche", nombre: "Noche", h: 22.5 },
];

function Fila({ icono, titulo, detalle, onClick }: { icono: ReactNode; titulo: string; detalle?: string; onClick: () => void }) {
  return <button className="calle-fila" onClick={onClick}><span className="calle-fila-ic">{icono}</span><span><b>{titulo}</b>{detalle && <small>{detalle}</small>}</span></button>;
}

export function MenuCalle({ cerrar, enMapa, paseo, hora, setHora, foto, guardados, irA, salir, posicion, recorrido, tactil }: {
  cerrar: () => void; enMapa: () => void; paseo: () => void; hora: string; setHora: (id: string) => void; foto: () => void; guardados: Destino[]; irA: (d: Destino) => void; salir: () => void;
  posicion: Punto | null; recorrido: { metros: number; pasos: number; kcal: number }; tactil: boolean;
}) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === "Escape") cerrar(); };
    addEventListener("keydown", f);
    return () => removeEventListener("keydown", f);
  }, [cerrar]);
  const hacer = (f: () => void) => () => { cerrar(); f(); };
  return (
    <div className="calle-fondo lateral" onClick={cerrar} role="presentation">
      <aside className="calle-menu" role="dialog" aria-modal="true" aria-label="Más opciones" onClick={(e) => e.stopPropagation()}>
        <header className="calle-hoja-cab"><h2>Más opciones</h2><button className="calle-cerrar" onClick={cerrar} aria-label="Cerrar"><Icono n="x" /></button></header>
        <div className="calle-hoja-cuerpo">
          <Fila icono={<Icono n="mapa" t={22} />} titulo="Elegir en el mapa" detalle="Tocá un punto y andá ahí" onClick={hacer(enMapa)} />
          <Fila icono={<Icono n="brujula" t={22} />} titulo="Paseo guiado" detalle="Paradas reales de este barrio" onClick={hacer(paseo)} />
          <Fila icono={<Svg d={CAMARA} t={22} />} titulo="Sacar una foto" detalle="Para guardar o compartir" onClick={hacer(foto)} />
          <h3 className="calle-sec"><Svg d={SOL} t={18} /> Hora del día</h3>
          <div className="calle-atajos" role="radiogroup" aria-label="Hora del día">
            {HORAS.map((h) => <button key={h.id} role="radio" aria-checked={hora === h.id} className={hora === h.id ? "on" : ""} onClick={() => setHora(h.id)}>{h.nombre}</button>)}
          </div>
          {guardados.length > 0 && <h3 className="calle-sec">Tus lugares</h3>}
          {guardados.map((g) => <Fila key={`${g.lat},${g.lon}`} icono={<Icono n="guardar" t={22} />} titulo={g.nombre} detalle={g.direccion} onClick={hacer(() => irA(g))} />)}
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
          {posicion && <Link className="calle-fila" href={`/mapa?lat=${posicion.lat.toFixed(6)}&lon=${posicion.lon.toFixed(6)}&ver=1`}><span className="calle-fila-ic"><Icono n="pin" t={22} /></span><span><b>Ver este punto en el mapa</b><small>Sale del modo calle</small></span></Link>}
          <Fila icono={<Icono n="salir" t={22} />} titulo="Salir de la calle" onClick={hacer(salir)} />
          <p className="calle-credito-menu"><Credito /></p>
        </div>
      </aside>
    </div>
  );
}
