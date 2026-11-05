"use client";
/* Tarjeta inferior con los datos de un local. */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icono } from "@/components/Icono";
import { abiertoAhora, comoLlegoHref, dominio, horarioTexto, telHref, urlSegura } from "@/lib/calle/recepcion";
import type { DatosExtraLugar, Local, ProveedorLugar } from "@/lib/calle/tipos";

export function TarjetaLocal({ local, proveedor, cerrar, entrar, edificio, caminando }: { local: Local; proveedor: ProveedorLugar; cerrar: () => void; entrar: () => void; edificio: () => void; caminando: () => void }) {
  const [extra, setExtra] = useState<DatosExtraLugar | null>(null);
  const [buscando, setBuscando] = useState(true);
  const caja = useRef<HTMLDivElement>(null);
  const arrastre = useRef<{ y: number; d: number } | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    let vivo = true;
    setExtra(null);
    setBuscando(true);
    if (local.lat == null || local.lon == null || local.telefono || local.web || local.horario) { setBuscando(false); return; }
    proveedor({ nombre: local.nombre, lat: local.lat, lon: local.lon }, ctrl.signal)
      .then((d) => { if (vivo) setExtra(d); })
      .catch(() => {})
      .finally(() => { if (vivo) setBuscando(false); });
    return () => { vivo = false; ctrl.abort(); };
  }, [local, proveedor]);

  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === "Escape" && cerrar();
    addEventListener("keydown", f);
    return () => removeEventListener("keydown", f);
  }, [cerrar]);

  function baja(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest("button,a")) return;
    arrastre.current = { y: e.clientY, d: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
    if (caja.current) caja.current.style.transition = "none";
  }
  function mueve(e: React.PointerEvent) {
    const a = arrastre.current;
    if (!a || !caja.current) return;
    a.d = Math.max(0, e.clientY - a.y);
    caja.current.style.transform = `translateY(${a.d}px)`;
  }
  function suelta() {
    const a = arrastre.current, c = caja.current;
    arrastre.current = null;
    if (!a || !c) return;
    c.style.transition = "";
    if (a.d > 90) cerrar(); else c.style.transform = "";
  }

  const horario = local.horario ?? extra?.horario, abierto = local.horario ? abiertoAhora(local.horario) : null;
  const tel = local.telefono ?? extra?.telefono, web = urlSegura(local.web ?? extra?.web), telH = telHref(tel);
  return (
    <div ref={caja} className="calle-tarjeta" role="dialog" aria-label={local.nombre} onPointerDown={baja} onPointerMove={mueve} onPointerUp={suelta} onPointerCancel={suelta}>
      <div className="calle-asa" aria-hidden="true" />
      <button className="calle-cerrar" onClick={cerrar} aria-label="Cerrar"><Icono n="x" /></button>
      <span className="calle-rubro" style={{ background: local.rubro.color, color: local.rubro.texto }}>{local.rubro.nombre}</span>
      <h2>{local.nombre}</h2>
      <ul className="calle-datos">
        {local.direccion && <li><Icono n="pin" t={18} /><span>{local.direccion}</span></li>}
        <li><Icono n="ciudad" t={18} /><button className="calle-enlace" onClick={edificio}>{local.pisos === 1 ? "Edificio de 1 piso" : `Edificio de unos ${local.pisos} pisos`}</button></li>
        {horario && <li><Icono n="reloj" t={18} /><span>{abierto != null && <b className={abierto ? "abierto" : "cerrado"}>{abierto ? "Abierto ahora · " : "Cerrado ahora · "}</b>}{horarioTexto(horario)}</span></li>}
        {tel && telH && <li><Icono n="chat" t={18} /><a href={telH}>{tel}</a></li>}
        {web && <li><Icono n="link" t={18} /><a href={web} target="_blank" rel="noopener noreferrer">{dominio(web)}</a></li>}
        {buscando && <li className="calle-buscando" aria-live="polite"><span>Buscando horarios…</span></li>}
      </ul>
      <div className="calle-acciones">
        <button className="calle-btn pri" onClick={entrar}>Entrar</button>
        <button className="calle-btn" onClick={caminando}>Ir caminando</button>
        {local.lat != null && local.lon != null && <Link className="calle-btn calle-doble" href={comoLlegoHref({ lat: local.lat, lon: local.lon }, local.nombre)}>Cómo ir</Link>}
      </div>
      <p className="calle-nota">El interior es una recreación ilustrativa, no el local real.</p>
    </div>
  );
}
