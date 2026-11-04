"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { Icono } from "./Icono";

export function Hoja({ titulo, cerrar, children }: { titulo?: string; cerrar: () => void; children: ReactNode }) {
  const caja = useRef<HTMLDivElement>(null);
  const arrastre = useRef<{ y: number; t: number; d: number } | null>(null);
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === "Escape" && cerrar();
    addEventListener("keydown", f);
    return () => removeEventListener("keydown", f);
  }, [cerrar]);
  function baja(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest("button,input")) return;
    arrastre.current = { y: e.clientY, t: performance.now(), d: 0 };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (caja.current) { caja.current.style.animation = "none"; caja.current.style.transition = "none"; }
  }
  function mueve(e: React.PointerEvent) {
    const a = arrastre.current; if (!a || !caja.current) return;
    a.d = Math.max(0, e.clientY - a.y);
    caja.current.style.transform = `translateY(${a.d}px)`;
  }
  function suelta() {
    const a = arrastre.current, c = caja.current; arrastre.current = null; if (!a || !c) return;
    const vel = a.d / Math.max(1, performance.now() - a.t);
    c.style.transition = "transform .36s cubic-bezier(.32,.72,0,1)";
    if (a.d > 130 || vel > .6) { c.style.transform = "translateY(105%)"; setTimeout(cerrar, 240); }
    else c.style.transform = "translateY(0)";
  }
  return (
    <div className="hoja-fondo" onClick={cerrar} role="presentation">
      <div ref={caja} className="hoja" role="dialog" aria-modal="true" aria-label={titulo} onClick={(e) => e.stopPropagation()}>
        <div onPointerDown={baja} onPointerMove={mueve} onPointerUp={suelta} onPointerCancel={suelta} style={{ touchAction: "none" }}>
          <div className="hoja-asa" />
          <div className="hoja-cab">
            {titulo && <h2>{titulo}</h2>}
            <button className="ico-btn" onClick={cerrar} aria-label="Cerrar"><Icono n="x" /></button>
          </div>
        </div>
        <div className="hoja-cu">{children}</div>
      </div>
    </div>
  );
}
