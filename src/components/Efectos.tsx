"use client";
import { useEffect, useState } from "react";

type Ef = { id: number; tipo: "quema" | "gana" | "listo"; texto?: string };
export function lanzarEfecto(tipo: Ef["tipo"], texto?: string) { window.dispatchEvent(new CustomEvent("sm-efecto", { detail: { tipo, texto } })); }

const Billete = () => <svg viewBox="0 0 120 64" aria-hidden="true"><rect x="1" y="1" width="118" height="62" rx="7" fill="#7FE0AE" /><rect x="7" y="7" width="106" height="50" rx="4" fill="none" stroke="#2FA56C" strokeWidth="2" /><circle cx="60" cy="32" r="15" fill="#37C985" /><path d="M60 21v22M54.500 26c1-2.200 9-3.400 11 0 2 4.200-11 4.200-11 9 0 3.300 8.300 4 11.500.7" stroke="#fff" strokeWidth="2.500" fill="none" strokeLinecap="round" /></svg>;

/* Billete que se quema al gastar, lluvia de billetes al cobrar */
export function Efectos() {
  const [l, setL] = useState<Ef[]>([]);
  useEffect(() => {
    const f = (e: Event) => {
      if (matchMedia("(prefers-reduced-motion:reduce)").matches) return;
      const d = (e as CustomEvent).detail, id = Date.now() + Math.random();
      setL((x) => [...x, { id, ...d }]);
      navigator.vibrate?.(d.tipo === "gana" ? [10, 40, 10, 40, 20] : 18);
      setTimeout(() => setL((x) => x.filter((q) => q.id !== id)), 2100);
    };
    addEventListener("sm-efecto", f);
    return () => removeEventListener("sm-efecto", f);
  }, []);
  return <>{l.map((e) => <div key={e.id} className="ef" aria-hidden="true">
    {e.tipo === "quema" && <div className="ef-quema"><div className="ef-bil"><Billete /></div>{[...Array(9)].map((_, i) => <i key={i} className="ef-llama" style={{ left: `${8 + i * 10.500}%`, animationDelay: `${i * 45}ms` }} />)}{[...Array(10)].map((_, i) => <i key={i} className="ef-chispa" style={{ left: `${12 + i * 8}%`, animationDelay: `${300 + i * 60}ms` }} />)}</div>}
    {e.tipo === "gana" && [...Array(16)].map((_, i) => <div key={i} className="ef-lluvia" style={{ left: `${(i * 23) % 92}%`, animationDelay: `${i * 55}ms`, "--g": `${(i % 2 ? 1 : -1) * (120 + i * 30)}deg`, width: 62 + (i % 3) * 14 } as React.CSSProperties}><Billete /></div>)}
    {e.tipo === "listo" && <div className="ef-listo"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24" /><path d="M14 27l8 8 16-17" /></svg></div>}
    {e.texto && <div className={`ef-monto ${e.tipo}`}>{e.texto}</div>}
  </div>)}</>;
}
