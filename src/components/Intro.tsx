"use client";
import { useEffect, useRef, useState } from "react";

/* Cada vez que abrís la app cae el libro: plum, se abre, pasan las hojas y aparece el nombre. Un toque lo saltea. */
function plum() {
  try {
    try { if ((navigator as unknown as { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive) navigator.vibrate?.(22); } catch {}
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const a = new AC();
    if (a.state !== "running") return;
    const o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
    o.type = "sine"; o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.16);
    g.gain.setValueAtTime(0.55, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + 0.25);
  } catch {}
}

const RAPIDO = 1.8;
export function Intro() {
  const [ver, setVer] = useState(false), [fin, setFin] = useState(false);
  const tms = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    let vista = false;
    try { vista = sessionStorage.getItem("sm-libro") === "1"; } catch {}
    if (vista || matchMedia("(prefers-reduced-motion:reduce)").matches) { document.documentElement.classList.add("intro-lista"); return; }
    setVer(true);
    try { sessionStorage.setItem("sm-libro", "1"); } catch {}
    requestAnimationFrame(() => document.getAnimations().forEach((a) => { a.playbackRate = RAPIDO; }));
    tms.current = [setTimeout(plum, 520 / RAPIDO), setTimeout(() => setFin(true), 2650 / RAPIDO), setTimeout(cerrar, 3050 / RAPIDO)];
    return () => tms.current.forEach(clearTimeout);
  }, []);
  function cerrar() { tms.current.forEach(clearTimeout); document.documentElement.classList.add("intro-lista"); setVer(false); }
  if (!ver) return null;
  return (
    <div className={`intro ${fin ? "fin" : ""}`} onClick={cerrar} role="presentation" aria-hidden="true">
      <div className="polvo">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ "--a": `${(i / 14) * 360}deg`, "--d": `${70 + (i % 4) * 26}px`, "--t": `${0.45 + (i % 3) * 0.14}s` } as React.CSSProperties} />)}</div>
      <div className="escena">
        <div className="libro">
          <div className="sombra" />
          <div className="lomo" />
          <div className="contra" />
          <div className="bloque-hojas" />
          <div className="pagina-der">
            <div className="sello"><span>Santa</span><span>María</span></div>
            <p className="sello-sub">Buenos Aires, resuelta.</p>
            <svg className="garabato" viewBox="0 0 160 60" fill="none"><path d="M6 48C30 20 50 44 72 30s38-22 80-20" stroke="#E0A800" strokeWidth="3.5" strokeLinecap="round" /></svg>
          </div>
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="hojita" style={{ animationDelay: `${0.86 + i * 0.075}s`, zIndex: 8 - i }}><i /><i /><i /><i /></div>)}
          <div className="tapa">
            <div className="tapa-frente">
              <span className="banda" />
              <span className="elastico" />
              <b>Santa<br />María</b>
              <small>Guía de la ciudad<br />y la facu</small>
            </div>
            <div className="tapa-dorso" />
          </div>
        </div>
      </div>
    </div>
  );
}
