"use client";
import { useEffect, type ReactNode } from "react";
import { Icono } from "./Icono";

export function Hoja({ titulo, cerrar, children }: { titulo?: string; cerrar: () => void; children: ReactNode }) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === "Escape" && cerrar();
    addEventListener("keydown", f);
    return () => removeEventListener("keydown", f);
  }, [cerrar]);
  return (
    <div className="hoja-fondo" onClick={cerrar} role="presentation">
      <div className="hoja" role="dialog" aria-modal="true" aria-label={titulo} onClick={(e) => e.stopPropagation()}>
        <div className="hoja-asa" />
        <div className="hoja-cab">
          {titulo && <h2>{titulo}</h2>}
          <button className="ico-btn" onClick={cerrar} aria-label="Cerrar"><Icono n="x" /></button>
        </div>
        <div className="hoja-cu">{children}</div>
      </div>
    </div>
  );
}
