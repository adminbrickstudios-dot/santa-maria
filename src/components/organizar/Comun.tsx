"use client";
import type { ReactNode } from "react";

/* Tilde redondo que se dibuja solo al marcar */
export function Tilde({ si, tocar, etiqueta, disabled }: { si: boolean; tocar: () => void; etiqueta: string; disabled?: boolean }) {
  return <button type="button" className={`or-tilde ${si ? "si" : ""}`} onClick={tocar} disabled={disabled} aria-pressed={si} aria-label={etiqueta}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.500 12.800l4.200 4.200L18.500 7.500" /></svg>
  </button>;
}

export function Vacio({ emoji, titulo, texto, children }: { emoji: string; titulo: string; texto: string; children?: ReactNode }) {
  return <div className="or-vacio"><span aria-hidden="true">{emoji}</span><b>{titulo}</b><p>{texto}</p>{children}</div>;
}

/* Lectura y escritura local que nunca rompe la pantalla */
export function leerLocal<T>(clave: string): T | null {
  try { const t = localStorage.getItem(clave); return t ? (JSON.parse(t) as T) : null; } catch { return null; }
}
export function guardarLocal(clave: string, v: unknown) {
  try { if (v == null) localStorage.removeItem(clave); else localStorage.setItem(clave, JSON.stringify(v)); } catch { /* el modo privado puede negar el guardado */ }
}
