"use client";
/* Modo calle: la interfaz encima del 3D. El motor se baja recién acá, para no pesar en otras pantallas. */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icono } from "@/components/Icono";
import { crearProveedorLugar, crearProveedorTiles } from "@/lib/calle/proveedor";
import type { Local, ProveedorLugar, ProveedorTiles } from "@/lib/calle/tipos";
import type { ModoMarcha, Motor } from "@/lib/calle/motor";
import { TarjetaLocal } from "./TarjetaLocal";

const PIE = '<circle cx="13" cy="4.5" r="2"/><path d="M10 21l2-6-2.5-2.5.8-5 3.2 1 1.8 3 3 1M9.5 8.5L6.5 11v3M15 16l1 5"/>';
const CORRE = '<circle cx="15" cy="4.5" r="2"/><path d="M6 20l3.5-1 2-4 3 2.500 1 4.500M8 11.500l1.500-3.500 4-1 2.500 3 3 1.500M11.500 15l1.500-6"/>';
const BICI = '<circle cx="6" cy="16" r="3.800"/><circle cx="18" cy="16" r="3.800"/><path d="M6 16l4-7h6l2 7M10 9L8.500 6H6M16 9l-1-3h3M10 9l3 7"/>';
const INFO = '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.500M12 7.700v.01"/>';
const MARCHAS: { id: ModoMarcha; nombre: string; d: string }[] = [
  { id: "caminar", nombre: "Caminar", d: PIE }, { id: "correr", nombre: "Correr", d: CORRE }, { id: "bici", nombre: "Bici", d: BICI },
];
const Svg = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: d }} />;
const CARD = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
const leer = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const guardar = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };

export interface PropsCalle {
  lat: number;
  lon: number;
  hora?: number | null;
  proveedorTiles?: ProveedorTiles;
  proveedorLugar?: ProveedorLugar;
  crearWorker?: () => Worker;
  calidadFija?: number;
  alMotor?: (m: Motor) => void;
}

function Credito() {
  return <>Datos del mapa: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</a></>;
}

function Maqueta({ progreso, titulo, detalle, children }: { progreso: number; titulo: string; detalle?: string; children?: React.ReactNode }) {
  const alturas = [38, 66, 52, 88, 46, 74, 34];
  return (
    <div className="calle-carga">
      <div className="calle-maqueta" aria-hidden="true">
        {alturas.map((h, i) => {
          const f = Math.max(0, Math.min(1, progreso * 1.5 - i * 0.07));
          return <i key={i} style={{ height: `${h}%`, transform: `scaleY(${Math.max(0.05, f)})` }} />;
        })}
      </div>
      <h1>{titulo}</h1>
      {detalle && <p>{detalle}</p>}
      {children}
      <p className="calle-credito-carga"><Credito /></p>
    </div>
  );
}

export default function CalleVista({ lat, lon, hora, proveedorTiles, proveedorLugar, crearWorker, calidadFija, alMotor }: PropsCalle) {
  const lienzo = useRef<HTMLDivElement>(null);
  const motor = useRef<Motor | null>(null);
  const dial = useRef<HTMLSpanElement>(null), rumbo = useRef<HTMLElement>(null);
  const joyBase = useRef<HTMLDivElement>(null), joyPunta = useRef<HTMLElement>(null);
  const [montado, setMontado] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sinWebGL, setSinWebGL] = useState(false);
  const [calle, setCalle] = useState<string | null>(null);
  const [local, setLocal] = useState<Local | null>(null);
  const [cerca, setCerca] = useState<Local | null>(null);
  const [interior, setInterior] = useState<Local | null>(null);
  const [fundido, setFundido] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [modo, setModo] = useState<ModoMarcha>("caminar");
  const [credito, setCredito] = useState(true);
  const [ayuda, setAyuda] = useState(false);
  const [intento, setIntento] = useState(0);

  const tiles = useMemo(() => proveedorTiles ?? crearProveedorTiles(), [proveedorTiles]);
  const lugar = useMemo(() => proveedorLugar ?? crearProveedorLugar(), [proveedorLugar]);

  useEffect(() => { setMontado(true); }, []);

  useEffect(() => {
    if (!montado) return;
    let vivo = true, m: Motor | null = null;
    const reducir = matchMedia("(prefers-reduced-motion: reduce)").matches;
    (async () => {
      const { Motor, hayWebGL } = await import("@/lib/calle/motor");
      if (!vivo || !lienzo.current) return;
      if (!hayWebGL()) { setSinWebGL(true); return; }
      try {
        m = new Motor(lienzo.current, {
          lat, lon, hora, proveedorTiles: tiles, crearWorker, calidadFija, reducirMovimiento: reducir,
          eventos: {
            progreso: (f) => setProgreso((p) => Math.max(p, f)),
            listo: () => setListo(true),
            fallo: setError,
            aviso: setAviso,
            calle: setCalle,
            rumbo: (g) => {
              if (dial.current) dial.current.style.transform = `rotate(${-g}deg)`;
              if (rumbo.current) rumbo.current.textContent = CARD[Math.round(g / 45) % 8];
            },
            local: setLocal,
            cerca: setCerca,
            interior: setInterior,
            fundido: setFundido,
            joystick: (a, x, y, dx, dy) => {
              const b = joyBase.current, p = joyPunta.current;
              if (!b || !p) return;
              b.classList.toggle("activo", a);
              b.style.transform = a ? `translate(${x}px,${y}px)` : "";
              p.style.transform = `translate(${dx}px,${dy}px)`;
            },
          },
        });
        motor.current = m;
        alMotor?.(m);
      } catch {
        setSinWebGL(true);
      }
    })();
    return () => { vivo = false; m?.destruir(); motor.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [montado, intento]);

  /* El crédito se ve 5 segundos y queda en el botón de información */
  useEffect(() => {
    if (!listo || !credito) return;
    const t = setTimeout(() => setCredito(false), 5000);
    return () => clearTimeout(t);
  }, [listo, credito]);

  useEffect(() => {
    if (!listo || leer("sm-calle-ayuda")) return;
    setAyuda(true);
    const t = setTimeout(() => { setAyuda(false); guardar("sm-calle-ayuda", "1"); }, 7000);
    return () => clearTimeout(t);
  }, [listo]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 4000);
    return () => clearTimeout(t);
  }, [aviso]);

  const cerrar = useCallback(() => motor.current?.cerrarTarjeta(), []);
  const reintentar = () => { setError(null); setProgreso(0); setListo(false); setIntento((i) => i + 1); };
  const elegir = (m: ModoMarcha) => { setModo(m); motor.current?.setModo(m); };
  const tactil = montado && matchMedia("(pointer:coarse)").matches;

  if (!montado) return null;
  const parar = (e: React.SyntheticEvent) => e.stopPropagation();
  return createPortal(
    <div className="calle" onTouchStart={parar} onTouchMove={parar} onTouchEnd={parar}>
      <div ref={lienzo} className="calle-lienzo" />

      {listo && !interior && (
        <>
          <div ref={joyBase} className="calle-joy" aria-hidden="true"><i ref={joyPunta} /></div>
          <header className="calle-arriba">
            <Link className="calle-redondo" href="/mapa" aria-label="Salir al mapa"><Icono n="volver" /></Link>
            <div className="calle-brujula">
              <span ref={dial} className="calle-dial" aria-hidden="true"><b>N</b></span>
              <strong aria-live="polite">{calle ?? "Sin nombre de calle"}</strong>
              <small ref={rumbo}>N</small>
            </div>
            <button className="calle-redondo" onClick={() => setCredito((c) => !c)} aria-label="Información del mapa" aria-expanded={credito}><Svg d={INFO} /></button>
          </header>
          {credito && <p className="calle-credito"><Credito /></p>}
          <div className="calle-marcha" role="radiogroup" aria-label="Velocidad">
            {MARCHAS.map((q) => (
              <button key={q.id} role="radio" aria-checked={modo === q.id} aria-label={q.nombre} className={modo === q.id ? "on" : ""} onClick={() => elegir(q.id)}>
                <Svg d={q.d} /><span>{q.nombre}</span>
              </button>
            ))}
          </div>
          {ayuda && <p className="calle-ayuda" role="status">{tactil ? "Mové con el dedo izquierdo, arrastrá para mirar y tocá un local para ver qué es." : "Caminá con WASD o las flechas, arrastrá para mirar y tocá un local para ver qué es."}</p>}
          {cerca && !local && (
            <button className="calle-cerca" onClick={() => motor.current?.abrir(cerca)}>
              <i style={{ background: cerca.rubro.color }} /><span><b>{cerca.nombre}</b><small>{cerca.rubro.nombre}</small></span><Icono n="flecha" t={20} />
            </button>
          )}
          {local && <TarjetaLocal key={local.id} local={local} proveedor={lugar} cerrar={cerrar} entrar={() => motor.current?.entrar(local)} />}
        </>
      )}

      {interior && (
        <div className="calle-interior">
          <div className="calle-interior-tit"><strong>{interior.nombre}</strong><small>Recreación ilustrativa, no es el local real</small></div>
          <button className="calle-btn pri calle-salir" onClick={() => motor.current?.salir()}><Icono n="salir" />Salir</button>
          <div ref={joyBase} className="calle-joy" aria-hidden="true"><i ref={joyPunta} /></div>
        </div>
      )}

      {aviso && <p className="calle-aviso" role="status">{aviso}</p>}
      <div className={`calle-fundido ${fundido ? "on" : ""}`} aria-hidden="true" />

      {sinWebGL && (
        <Maqueta progreso={1} titulo="Este equipo no puede mostrar el 3D" detalle="Le falta WebGL. Podés seguir usando el mapa normal.">
          <Link className="calle-btn pri" href="/mapa">Ir al mapa</Link>
        </Maqueta>
      )}
      {!sinWebGL && error && (
        <Maqueta progreso={0.4} titulo="No pudimos armar la calle" detalle={error}>
          <div className="calle-acciones"><button className="calle-btn pri" onClick={reintentar}>Probar de nuevo</button><Link className="calle-btn" href="/mapa">Ir al mapa</Link></div>
        </Maqueta>
      )}
      {!sinWebGL && !error && !listo && (
        <Maqueta progreso={progreso} titulo="Armando la cuadra" detalle={progreso < 0.25 ? "Bajando el mapa…" : progreso < 0.8 ? "Levantando los edificios…" : "Plantando los árboles…"}>
          <div className="calle-barra" role="progressbar" aria-label="Cargando" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progreso * 100)}><i style={{ transform: `scaleX(${progreso})` }} /></div>
        </Maqueta>
      )}
    </div>,
    document.body,
  );
}
