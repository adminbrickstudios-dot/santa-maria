"use client";
/* La recepción: lo real del lugar. Cada fila existe solo si el dato existe. */
import Link from "next/link";
import type { ReactNode } from "react";
import { Icono } from "@/components/Icono";
import { accionesDe, type DatosLugar } from "@/lib/calle/recepcion";
import { HojaCalle, OJO_D, RED, Svg, TEL, WA, WEB } from "./comunes";

function Fila({ href, interno, icono, titulo, detalle }: { href: string; interno?: boolean; icono: ReactNode; titulo: string; detalle?: string }) {
  const cuerpo = <><span className="calle-fila-ic">{icono}</span><span><b>{titulo}</b>{detalle && <small>{detalle}</small>}</span></>;
  if (interno) return <Link className="calle-fila" href={href}>{cuerpo}</Link>;
  /* tel: no abre pestaña; lo demás sale a otra app o sitio */
  if (href.startsWith("tel:")) return <a className="calle-fila" href={href}>{cuerpo}</a>;
  return <a className="calle-fila" href={href} target="_blank" rel="noopener noreferrer">{cuerpo}</a>;
}

export function Recepcion({ datos, cargando, guardado, alternarGuardado, compartir, cerrar }: { datos: DatosLugar; cargando: boolean; guardado: boolean; alternarGuardado: () => void; compartir: () => void; cerrar: () => void }) {
  const a = accionesDe(datos), hayContacto = a.web || a.whatsapp || a.llamar || a.red;
  return (
    <HojaCalle titulo={datos.nombre} cerrar={cerrar}>
      {a.horario && (
        <div className="calle-horario">
          {a.horario.abierto != null && <b className={a.horario.abierto ? "abierto" : "cerrado"}>{a.horario.abierto ? "Abierto ahora" : "Cerrado ahora"}</b>}
          <span>{a.horario.texto}</span>
        </div>
      )}
      {datos.direccion && <p className="calle-sub">{datos.direccion}</p>}
      {a.web && <Fila href={a.web.url} icono={<Svg d={WEB} t={22} />} titulo="Abrir web" detalle={a.web.texto} />}
      {a.whatsapp && <Fila href={a.whatsapp.url} icono={<Svg d={WA} t={22} />} titulo={a.whatsapp.probar ? "Probar por WhatsApp" : "WhatsApp"} detalle={a.whatsapp.probar ? "El lugar no lo publicó: quizá no tengan" : undefined} />}
      {a.llamar && <Fila href={a.llamar.url} icono={<Svg d={TEL} t={22} />} titulo="Llamar" detalle={a.llamar.texto} />}
      {a.red && <Fila href={a.red.url} icono={<Svg d={RED} t={22} />} titulo={a.red.nombre} />}
      {!hayContacto && !cargando && <p className="calle-vacio">Este lugar no publicó teléfono ni web.</p>}
      {cargando && <p className="calle-vacio" aria-live="polite">Buscando los datos del lugar…</p>}
      {a.comoLlego && <Fila href={a.comoLlego} interno icono={<Icono n="mapa" t={22} />} titulo="Cómo llego" detalle="En colectivo, subte o a pie" />}
      {a.calleReal && <Fila href={a.calleReal} icono={<Svg d={OJO_D} t={22} />} titulo="Ver la calle real" detalle="Se abre en Google Maps" />}
      <div className="calle-acciones calle-pie-hoja">
        <button className="calle-btn" onClick={alternarGuardado} aria-pressed={guardado}><Icono n="guardar" t={20} />{guardado ? "Guardado" : "Guardar"}</button>
        <button className="calle-btn" onClick={compartir}><Icono n="compartir" t={20} />Compartir</button>
      </div>
    </HojaCalle>
  );
}
