"use client";
/* Caja grande de arriba: lugares, direcciones y esquinas. La búsqueda corre en el worker. */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icono } from "@/components/Icono";
import { comoLlegoHref } from "@/lib/calle/recepcion";
import type { Resultado } from "@/lib/calle/buscador";
import type { Punto } from "@/lib/calle/ciudad";
import type { ClienteCiudad } from "@/lib/calle/cliente";
import { distancia } from "./comunes";

export interface Destino { nombre: string; lat: number; lon: number; categoria?: string; categoriaCruda?: string; direccion?: string; dist?: number | null }

const ATAJOS = ["Farmacia", "Café", "Supermercado", "Cajero", "Gimnasio", "Museo"];

export function Buscador({ cliente, posicion, abierto, abrir, cerrar, elegir, enMapa, guardados }: {
  cliente: ClienteCiudad | null; posicion: () => Punto | null; abierto: boolean; abrir: () => void; cerrar: () => void;
  elegir: (d: Destino) => void; enMapa: () => void; guardados: Destino[];
}) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Resultado[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const caja = useRef<HTMLInputElement>(null);
  const sec = useRef(0);

  useEffect(() => { if (abierto) void cliente?.preparar().catch(() => {}); }, [abierto, cliente]);

  useEffect(() => {
    const t = q.trim(), n = ++sec.current;
    if (t.length < 2 || !cliente) { setRes(null); setBuscando(false); return; }
    setBuscando(true);
    const h = setTimeout(() => {
      cliente.buscar(t, posicion()).then((r) => { if (n === sec.current) { setRes(r); setBuscando(false); } }).catch(() => { if (n === sec.current) { setRes([]); setBuscando(false); } });
    }, 140);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, cliente]);

  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (/INPUT|TEXTAREA/.test(t.tagName)) { if (e.key === "Escape" && abierto) { t.blur(); cerrar(); } return; }
      if (e.key === "/" || ((e.metaKey || e.ctrlKey) && e.key === "k")) { e.preventDefault(); caja.current?.focus(); }
    };
    addEventListener("keydown", f);
    return () => removeEventListener("keydown", f);
  }, [abierto, cerrar]);

  const cerrarTodo = () => { caja.current?.blur(); setQ(""); setRes(null); cerrar(); };
  const tocar = (r: Resultado) => { caja.current?.blur(); setQ(""); setRes(null); elegir({ nombre: r.nombre, lat: r.lat, lon: r.lon, categoria: r.categoria, categoriaCruda: r.categoriaCruda, direccion: r.direccion, dist: r.dist }); };

  return (
    <>
      {abierto && <div className="calle-panel-fondo" onClick={cerrarTodo} aria-hidden="true" />}
      <form className={`calle-busca ${abierto ? "abierta" : ""}`} role="search" onSubmit={(e) => { e.preventDefault(); if (res?.[0]) tocar(res[0]); }}>
        {abierto ? <button type="button" className="calle-busca-ic" onClick={cerrarTodo} aria-label="Cerrar la búsqueda"><Icono n="volver" t={24} /></button> : <span className="calle-busca-ic"><Icono n="lupa" t={24} /></span>}
        <input ref={caja} type="search" inputMode="search" enterKeyHint="search" autoComplete="off" autoCorrect="off" spellCheck={false} placeholder="¿Adónde querés ir?" aria-label="Buscar un lugar, una dirección o una esquina" value={q} onChange={(e) => setQ(e.target.value)} onFocus={abrir} />
        {q && <button type="button" className="calle-busca-ic" onClick={() => { setQ(""); caja.current?.focus(); }} aria-label="Borrar"><Icono n="x" t={22} /></button>}
      </form>
      {abierto && (
        <div className="calle-panel">
          {res === null && <>
            <button className="calle-fila" onClick={() => { cerrarTodo(); enMapa(); }}><span className="calle-fila-ic"><Icono n="mapa" t={22} /></span><span><b>Elegir en el mapa</b><small>Tocá un punto de la ciudad</small></span></button>
            <div className="calle-atajos">{ATAJOS.map((a) => <button key={a} type="button" onClick={() => { setQ(a); caja.current?.focus(); }}>{a}</button>)}</div>
            {guardados.length > 0 && <h3 className="calle-sec">Tus lugares</h3>}
            {guardados.map((g) => <button key={`${g.lat},${g.lon}`} className="calle-fila" onClick={() => { cerrarTodo(); elegir(g); }}><span className="calle-fila-ic"><Icono n="guardar" t={22} /></span><span><b>{g.nombre}</b>{g.direccion && <small>{g.direccion}</small>}</span></button>)}
            {!cliente && <p className="calle-vacio">Preparando el buscador…</p>}
          </>}
          {res?.map((r, i) => (
            <button key={`${r.nombre}-${i}`} className="calle-fila" onClick={() => tocar(r)}>
              <span className="calle-fila-ic"><Icono n={r.tipo === "dir" ? "pin" : "ciudad"} t={22} /></span>
              <span><b>{r.nombre}</b><small>{[r.categoria, r.direccion].filter(Boolean).join(" · ")}</small></span>
              {r.dist != null && <em>{distancia(r.dist)}</em>}
            </button>
          ))}
          {res?.length === 0 && !buscando && <p className="calle-vacio">No lo encuentro. Probá con calle y altura, o con dos calles que se cruzan.</p>}
          {buscando && !res?.length && <p className="calle-vacio" aria-live="polite">Buscando…</p>}
        </div>
      )}
    </>
  );
}

/** El lugar elegido, con las dos formas de ir. */
export function TarjetaDestino({ d, cerrar, caminando, ya, iniciar, ocupado }: { d: Destino; cerrar: () => void; caminando: () => void; ya: () => void; iniciar: () => void; ocupado: boolean }) {
  return (
    <div className="calle-tarjeta calle-destino" role="dialog" aria-label={d.nombre}>
      <button className="calle-cerrar" onClick={cerrar} aria-label="Cerrar"><Icono n="x" /></button>
      {d.categoria && <span className="calle-rubro calle-rubro-neutro">{d.categoria}</span>}
      <h2>{d.nombre}</h2>
      {(d.direccion || d.dist != null) && <p className="calle-sub">{[d.direccion, d.dist != null ? `a ${distancia(d.dist)}` : ""].filter(Boolean).join(" · ")}</p>}
      <button className="calle-btn pri calle-iniciar" onClick={iniciar}>Iniciar recorrido</button>
      <div className="calle-acciones tres">
        <button className="calle-btn" onClick={caminando} disabled={ocupado}>{ocupado ? "Armando…" : "Ir caminando"}</button>
        <button className="calle-btn" onClick={ya}>Ir ya</button>
        <Link className="calle-btn" href={comoLlegoHref(d, d.nombre)}>Cómo ir</Link>
      </div>
    </div>
  );
}
