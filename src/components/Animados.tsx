"use client";
import type { Cielo } from "@/lib/clima";

/* Los dibujos de los cuatro botones. Se mueven solo con CSS, para no pesar. */
export function DibuCalendario({ dia, mes }: { dia: number; mes: string }) {
  return <span className="dibu" aria-hidden="true"><span className="d-cal">
    <span className="d-cal-cab">{mes}</span>
    <span className="d-cal-base">{dia}</span>
    <span className="d-cal-hoja">{dia}</span>
  </span></span>;
}
export function DibuBilletera() {
  return <span className="dibu d-plata" aria-hidden="true"><svg viewBox="0 0 84 84">
    <g className="d-billete b2"><rect x="17" y="17" width="50" height="30" rx="4" fill="#BFF3D6" /><circle cx="42" cy="32" r="7" fill="#7FE0AE" /></g>
    <g className="d-billete"><rect x="13" y="21" width="56" height="32" rx="4" fill="#E6FFF2" /><circle cx="41" cy="37" r="8" fill="#37C985" /><path d="M41 32v10M38.500 34.500c.5-1 4-1.700 5 0 1 2-5 2-5 4.200 0 1.500 3.800 1.800 5.200.3" stroke="#fff" strokeWidth="1.300" fill="none" strokeLinecap="round" /></g>
    <path d="M8 40a7 7 0 017-7h54a7 7 0 017 7v28a7 7 0 01-7 7H15a7 7 0 01-7-7z" fill="#0B6B41" />
    <path d="M8 40a7 7 0 017-7h54a7 7 0 017 7v7H8z" fill="#0E8551" />
    <rect x="56" y="50" width="24" height="15" rx="7.500" fill="#084D2F" /><circle cx="65" cy="57.500" r="3.500" fill="#FFD21F" />
    <g className="d-moneda"><circle cx="19" cy="62" r="7.500" fill="#FFD21F" /><circle cx="19" cy="62" r="5" fill="none" stroke="#E0A800" strokeWidth="1.300" /></g>
  </svg></span>;
}
export function DibuMapa() {
  return <span className="dibu d-plata" aria-hidden="true"><svg viewBox="0 0 84 84" style={{ position: "relative" }}>
    <path d="M4 22l24-9 26 9 26-9v50l-26 9-26-9-24 9z" fill="#fff" />
    <path d="M28 13v50M54 22v50" stroke="#DCE8F7" strokeWidth="1.600" />
    <path d="M4 44c14-8 22 12 38 2s24-14 38-12" stroke="#BFE3C6" strokeWidth="9" fill="none" opacity=".7" />
    <path d="M6 66 C 22 46, 40 72, 56 54 S 76 40, 82 34" stroke="#1F7AFF" strokeWidth="3.200" strokeDasharray="1 7" strokeLinecap="round" fill="none" />
    <ellipse className="d-sombra" cx="56" cy="52" rx="7" ry="2.500" fill="#000" />
    <g className="d-pin"><path d="M56 51s-13-12-13-23a13 13 0 0126 0c0 11-13 23-13 23z" fill="#FF3B30" /><circle cx="56" cy="28" r="5" fill="#fff" /></g>
  </svg><span className="d-bondi" style={{ position: "absolute", top: 0, left: 0, width: 13, height: 8, borderRadius: 3, background: "#FFD21F", boxShadow: "0 1px 2px rgba(0,0,0,.35)" }} /></span>;
}
export function DibuLibro() {
  return <span className="dibu" aria-hidden="true"><span className="d-libro">
    <span className="d-pag i" /><span className="d-pag d" /><span className="d-vuelta" />
  </span></span>;
}

/* Icono animado del clima */
export function IconoCielo({ c }: { c: Cielo }) {
  const sol = <g style={{ transformOrigin: "16px 16px", animation: "giro 14s linear infinite" }}><circle cx="16" cy="16" r="6.500" fill="#FFE27A" />{[...Array(8)].map((_, i) => <path key={i} d="M16 3v4" stroke="#FFE27A" strokeWidth="2.400" strokeLinecap="round" transform={`rotate(${i * 45} 16 16)`} />)}</g>;
  const nube = <path d="M9 24a5 5 0 01-.6-10 7 7 0 0113.500-1.500A5.500 5.500 0 0123 24z" fill="#fff" style={{ animation: "flotar 3.600s ease-in-out infinite" }} />;
  if (c === "sol") return <svg viewBox="0 0 32 32" aria-hidden="true">{sol}</svg>;
  if (c === "noche") return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M23 20a10 10 0 01-11-14 10 10 0 1011 14z" fill="#FFE9A8" style={{ animation: "flotar 4s ease-in-out infinite" }} /><circle cx="24" cy="9" r="1.200" fill="#fff" style={{ animation: "titila 2s ease-in-out infinite" }} /></svg>;
  if (c === "lluvia" || c === "tormenta") return <svg viewBox="0 0 32 32" aria-hidden="true"><g transform="translate(0 -3)">{nube}</g>{c === "tormenta" ? <path d="M17 21l-4 6h3l-2 4 6-7h-3l2-3z" fill="#FFE27A" style={{ animation: "titila 1.400s steps(2) infinite" }} /> : [10, 16, 22].map((x, i) => <path key={x} d={`M${x} 23l-1.500 5`} stroke="#CFE6FF" strokeWidth="2" strokeLinecap="round" style={{ animation: `llueve .9s ${i * .25}s ease-in infinite` }} />)}</svg>;
  return <svg viewBox="0 0 32 32" aria-hidden="true">{nube}</svg>;
}
