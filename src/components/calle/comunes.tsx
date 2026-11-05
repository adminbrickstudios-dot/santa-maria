"use client";
/* Piezas compartidas de la interfaz de la calle. */
import { Component, useEffect, type ReactNode } from "react";
import { Icono } from "@/components/Icono";
import { textoDistancia } from "@/lib/calle/buscador";

const PIE = '<circle cx="13" cy="4.5" r="2"/><path d="M10 21l2-6-2.5-2.500.8-5 3.200 1 1.800 3 3 1M9.500 8.500L6.500 11v3M15 16l1 5"/>';
const CORRE = '<circle cx="15" cy="4.5" r="2"/><path d="M6 20l3.500-1 2-4 3 2.500 1 4.500M8 11.500l1.500-3.500 4-1 2.500 3 3 1.500M11.500 15l1.500-6"/>';
const BICI = '<circle cx="6" cy="16" r="3.800"/><circle cx="18" cy="16" r="3.800"/><path d="M6 16l4-7h6l2 7M10 9L8.500 6H6M16 9l-1-3h3M10 9l3 7"/>';
const AUTO = '<path d="M4 16v-3l2-5.500h12l2 5.500v3M4 16h16v2.500h-3V16M7 16v2.500H4V16M4.500 12.500h15"/><circle cx="7.500" cy="14" r=".6"/><circle cx="16.500" cy="14" r=".6"/>';
const DRON = '<circle cx="5.500" cy="6" r="3"/><circle cx="18.500" cy="6" r="3"/><circle cx="5.500" cy="18" r="3"/><circle cx="18.500" cy="18" r="3"/><path d="M8 8l2.500 2.500M16 8l-2.500 2.500M8 16l2.500-2.500M16 16l-2.500-2.500"/><rect x="10" y="10" width="4" height="4" rx="1"/>';
export const CAMARA = '<path d="M4 8h3.500L9 5.500h6L16.500 8H20v11H4z"/><circle cx="12" cy="13" r="3.500"/>';
export const SOL = '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.600 5.600L7 7M17 17l1.400 1.400M18.400 5.600L17 7M7 17l-1.400 1.400"/>';
export const PAUSA = '<path d="M9 6v12M15 6v12"/>';
export const PLAY = '<path d="M8 5.500l10 6.500-10 6.500z"/>';
export const WA = '<path d="M4 20l1.300-4.200A8 8 0 1112 20a8 8 0 01-3.800-1z"/><path d="M9 9.500c0 3 2.500 5.500 5.500 5.500l1-1.500-2-1-.8.700c-1-.4-1.700-1.200-2-2l.8-.8-1-2z"/>';
export const WEB = '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>';
export const TEL = '<path d="M5 4h4l1.500 5-2.500 1.500a11 11 0 005.500 5.500l1.500-2.500 5 1.500v4c0 1-1 2-2 2C10 21 3 14 3 6c0-1 1-2 2-2z"/>';
export const ASCENSOR = '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M12 3v18M8 9.500L9.500 8l1.500 1.500M16 13l-1.500 1.500L13 13"/>';
export const OJO_D = '<path d="M2.500 12S6 5.500 12 5.500 21.500 12 21.500 12 18 18.500 12 18.500 2.500 12 2.500 12z"/><circle cx="12" cy="12" r="3"/>';
export const RED = '<rect x="4" y="4" width="16" height="16" rx="5"/><circle cx="12" cy="12" r="3.600"/><circle cx="16.500" cy="7.500" r=".6"/>';

export const Svg = ({ d, t = 24 }: { d: string; t?: number }) => <svg viewBox="0 0 24 24" width={t} height={t} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: d }} />;

export const MODOS = [
  { id: "caminar", nombre: "Caminar", d: PIE },
  { id: "correr", nombre: "Correr", d: CORRE },
  { id: "bici", nombre: "Bici", d: BICI },
  { id: "auto", nombre: "Auto rápido", d: AUTO },
  { id: "volar", nombre: "Volar", d: DRON },
] as const;

export function Credito() {
  return <>Datos: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</a>, <a href="https://overturemaps.org" target="_blank" rel="noopener noreferrer">Overture Maps</a>, <a href="https://essd.copernicus.org/articles/16/5357/2024/" target="_blank" rel="noopener noreferrer">3D-GloBFP</a>, <a href="https://human-settlement.emergency.copernicus.eu/" target="_blank" rel="noopener noreferrer">GHSL</a></>;
}

/** Hoja que sube desde abajo (de costado si está acostado). Sin vidrio: abre sin trabar el 3D. */
export function HojaCalle({ titulo, cerrar, children, chica }: { titulo: string; cerrar: () => void; children: ReactNode; chica?: boolean }) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); cerrar(); } };
    addEventListener("keydown", f);
    return () => removeEventListener("keydown", f);
  }, [cerrar]);
  return (
    <div className="calle-fondo" onClick={cerrar} role="presentation">
      <section className={`calle-hoja ${chica ? "chica" : ""}`} role="dialog" aria-modal="true" aria-label={titulo} onClick={(e) => e.stopPropagation()}>
        <header className="calle-hoja-cab">
          <h2>{titulo}</h2>
          <button className="calle-cerrar" onClick={cerrar} aria-label="Cerrar"><Icono n="x" /></button>
        </header>
        <div className="calle-hoja-cuerpo">{children}</div>
      </section>
    </div>
  );
}

export const tiempo = (s: number) => {
  const m = Math.max(1, Math.round(s / 60));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
};
export const distancia = textoDistancia;

/** Un error de pantalla nunca saca de la calle: avisa y deja reintentar. */
export class Protector extends Component<{ children: ReactNode }, { error: boolean; n: number }> {
  state = { error: false, n: 0 };
  static getDerivedStateFromError() { return { error: true }; }
  componentDidCatch(e: unknown) { console.warn("calle:", e); }
  render() {
    if (!this.state.error) return <div key={this.state.n} style={{ display: "contents" }}>{this.props.children}</div>;
    return (
      <div className="calle"><div className="calle-carga">
        <h1>Algo se trabó</h1>
        <p>Seguís en la misma pantalla. Probá de nuevo y volvés al lugar donde estabas.</p>
        <button className="calle-btn pri" onClick={() => this.setState((s) => ({ error: false, n: s.n + 1 }))}>Probar de nuevo</button>
      </div></div>
    );
  }
}
