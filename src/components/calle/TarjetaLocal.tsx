"use client";
/* Tarjeta inferior de vidrio con los datos de un local. */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icono } from "@/components/Icono";
import type { DatosExtraLugar, Local, ProveedorLugar } from "@/lib/calle/tipos";

export function TarjetaLocal({ local, proveedor, cerrar, entrar }: { local: Local; proveedor: ProveedorLugar; cerrar: () => void; entrar: () => void }) {
  const [extra, setExtra] = useState<DatosExtraLugar | null>(null);
  const [buscando, setBuscando] = useState(true);
  const caja = useRef<HTMLDivElement>(null);
  const arrastre = useRef<{ y: number; d: number } | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    let vivo = true;
    setExtra(null);
    setBuscando(true);
    if (local.lat == null || local.lon == null) { setBuscando(false); return; }
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

  const href = `/mapa?lat=${local.lat?.toFixed(6)}&lon=${local.lon?.toFixed(6)}&n=${encodeURIComponent(local.nombre)}`;
  return (
    <div ref={caja} className="calle-tarjeta" role="dialog" aria-label={local.nombre} onPointerDown={baja} onPointerMove={mueve} onPointerUp={suelta} onPointerCancel={suelta}>
      <div className="calle-asa" aria-hidden="true" />
      <button className="calle-cerrar" onClick={cerrar} aria-label="Cerrar"><Icono n="x" /></button>
      <span className="calle-rubro" style={{ background: local.rubro.color, color: local.rubro.texto }}>{local.rubro.nombre}</span>
      <h2>{local.nombre}</h2>
      <ul className="calle-datos">
        {local.direccion && <li><Icono n="pin" t={18} /><span>{local.direccion}</span></li>}
        <li><Icono n="ciudad" t={18} /><span>{local.pisos === 1 ? "Edificio de 1 piso" : `Edificio de unos ${local.pisos} pisos`}</span></li>
        {extra?.horario && <li><Icono n="reloj" t={18} /><span>{extra.horario}</span></li>}
        {extra?.telefono && <li><Icono n="chat" t={18} /><a href={`tel:${extra.telefono.replace(/[^+\d]/g, "")}`}>{extra.telefono}</a></li>}
        {extra?.web && <li><Icono n="link" t={18} /><a href={extra.web} target="_blank" rel="noopener noreferrer">{new URL(extra.web).hostname.replace(/^www\./, "")}</a></li>}
        {buscando && <li className="calle-buscando" aria-live="polite"><span>Buscando horarios…</span></li>}
      </ul>
      <div className="calle-acciones">
        <button className="calle-btn pri" onClick={entrar}>Entrar</button>
        <Link className="calle-btn" href={href}>Cómo llego</Link>
      </div>
      <p className="calle-nota">El interior es una recreación ilustrativa, no el local real.</p>
    </div>
  );
}
