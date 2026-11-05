"use client";
/* Las herramientas del menú. Cada hoja usa datos reales y aclara lo que no se sabe. */
import Link from "next/link";
import { useState } from "react";
import { Icono } from "@/components/Icono";
import { NOMBRE, useClima } from "@/lib/clima";
import { FILTROS, type IdFiltro } from "@/lib/calle/filtros";
import type { Cercano, Cuadra } from "@/lib/calle/nucleo";
import { HojaCalle, distancia } from "./comunes";
import type { Destino } from "./Buscador";

export interface Tema { id: string; nombre: string; paradas: { nombre: string; lat: number; lon: number; direccion?: string; bajada?: string }[] }
export interface Visita extends Destino { t: number }
export interface Amigo { id: string; nombre: string; lat: number; lon: number }

const FilaLugar = ({ c, tocar }: { c: Cercano; tocar: () => void }) => (
  <button className="calle-fila" onClick={tocar}>
    <span className="calle-fila-ic"><Icono n="ciudad" t={22} /></span>
    <span><b>{c.nombre}</b><small>{[c.categoria, c.direccion, c.abierto === true ? "Abierto ahora" : c.abierto === false ? "Cerrado ahora" : ""].filter(Boolean).join(" · ")}</small></span>
    <em>{distancia(c.dist)}</em>
  </button>
);

export function HojaFiltros({ activo, elegir, quitar, cerrar }: { activo: IdFiltro | null; elegir: (id: IdFiltro) => void; quitar: () => void; cerrar: () => void }) {
  return (
    <HojaCalle titulo="Qué hay cerca" cerrar={cerrar}>
      <p className="calle-sub">Elegí uno y aparecen carteles flotantes. Tocá un cartel para ir.</p>
      {FILTROS.map((f) => (
        <button key={f.id} className="calle-fila" aria-pressed={activo === f.id} onClick={() => elegir(f.id)}>
          <span className="calle-fila-ic"><Icono n={activo === f.id ? "ok" : "pin"} t={22} /></span>
          <span><b>{f.nombre}</b><small>{f.aclara}</small></span>
        </button>
      ))}
      {activo && <button className="calle-btn calle-ancho" onClick={quitar}>Sacar los carteles</button>}
    </HojaCalle>
  );
}

export function HojaCuadra({ c, calleMotor, tocar, cerrar }: { c: Cuadra | null; calleMotor: string | null; tocar: (l: Cercano) => void; cerrar: () => void }) {
  const calle = c?.calle ?? calleMotor;
  return (
    <HojaCalle titulo={calle ? `${calle}${c?.altura ? ` ${c.altura}` : ""}` : "Esta cuadra"} cerrar={cerrar}>
      {c?.barrio && <p className="calle-sub">{c.barrio}</p>}
      {c?.altura && <p className="calle-nota izq">La altura es la del número de puerta más cercano.</p>}
      <h3 className="calle-sec">En esta cuadra</h3>
      {c?.lugares.map((l, i) => <FilaLugar key={`${l.nombre}-${i}`} c={l} tocar={() => tocar(l)} />)}
      {c && !c.lugares.length && <p className="calle-vacio">No hay lugares cargados en esta cuadra.</p>}
      {!c && <p className="calle-vacio" aria-live="polite">Buscando…</p>}
    </HojaCalle>
  );
}

export function HojaRecorridos({ temas, cerca, elegir, cerrar }: { temas: Tema[] | null; cerca: () => void; elegir: (t: Tema) => void; cerrar: () => void }) {
  return (
    <HojaCalle titulo="Recorridos" cerrar={cerrar}>
      <p className="calle-sub">Vas caminando solo de parada en parada. Podés frenar cuando quieras.</p>
      <button className="calle-fila" onClick={cerca}><span className="calle-fila-ic"><Icono n="brujula" t={22} /></span><span><b>Cerca de vos</b><small>Museos, plazas y monumentos de este barrio</small></span></button>
      {temas?.map((t) => <button key={t.id} className="calle-fila" onClick={() => elegir(t)}><span className="calle-fila-ic"><Icono n="guia" t={22} /></span><span><b>{t.nombre}</b><small>{t.paradas.length} paradas de la guía · {t.paradas.slice(0, 2).map((p) => p.nombre).join(", ")}</small></span></button>)}
      {temas === null && <p className="calle-vacio" aria-live="polite">Buscando en la guía…</p>}
      {temas?.length === 0 && <p className="calle-vacio">La guía no tiene lugares cerca de acá.</p>}
    </HojaCalle>
  );
}

export function HojaPracticar({ casa, facu, guardados, practicar, cerrar }: { casa: Destino | null; facu: Destino | null; guardados: Destino[]; practicar: (desde: Destino | null, hasta: Destino) => void; cerrar: () => void }) {
  const [desdeCasa, setDesde] = useState(!!casa);
  const destinos = [...(facu ? [facu] : []), ...guardados.filter((g) => g.nombre !== facu?.nombre)];
  return (
    <HojaCalle titulo="Practicar un recorrido" cerrar={cerrar}>
      <p className="calle-sub">Te llevamos al inicio y lo hacés caminando, para conocer el camino antes de ir.</p>
      <h3 className="calle-sec">Salís desde</h3>
      <div className="calle-atajos" role="radiogroup" aria-label="Salís desde">
        {casa && <button role="radio" aria-checked={desdeCasa} className={desdeCasa ? "on" : ""} onClick={() => setDesde(true)}>Tu casa</button>}
        <button role="radio" aria-checked={!desdeCasa} className={!desdeCasa ? "on" : ""} onClick={() => setDesde(false)}>Donde estoy</button>
      </div>
      <h3 className="calle-sec">Hasta</h3>
      {destinos.map((d) => <button key={`${d.lat},${d.lon}`} className="calle-fila" onClick={() => practicar(desdeCasa ? casa : null, d)}><span className="calle-fila-ic"><Icono n={d === facu ? "facu" : "guardar"} t={22} /></span><span><b>{d.nombre}</b>{d.direccion && <small>{d.direccion}</small>}</span></button>)}
      {!destinos.length && <p className="calle-vacio">Cargá tu facu en el perfil o guardá un lugar, y aparece acá.</p>}
      {!casa && <p className="calle-nota izq">Para salir desde tu casa, cargala en tu perfil.</p>}
    </HojaCalle>
  );
}

export function HojaEncuentro({ amigos, buscar, cerrar }: { amigos: Amigo[]; buscar: (ids: string[]) => Promise<{ nombre: string; lat: number; lon: number; detalle: string } | null>; cerrar: () => void }) {
  const [sel, setSel] = useState<string[]>([]);
  const [r, setR] = useState<{ nombre: string; lat: number; lon: number; detalle: string } | null>(null);
  const [nada, setNada] = useState(false);
  const alternar = (id: string) => { setR(null); setNada(false); setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id])); };
  return (
    <HojaCalle titulo="Punto de encuentro" cerrar={cerrar}>
      <p className="calle-sub">Busca un lugar a mitad de camino. Le llega a tus amigos como juntada y cada uno decide.</p>
      {amigos.map((a) => <button key={a.id} className="calle-fila" aria-pressed={sel.includes(a.id)} onClick={() => alternar(a.id)}><span className="calle-fila-ic"><Icono n={sel.includes(a.id) ? "ok" : "usuario"} t={22} /></span><span><b>{a.nombre}</b></span></button>)}
      {!amigos.length && <p className="calle-vacio">Nadie de tu grupo compartió su casa exacta todavía.</p>}
      <p className="calle-nota izq">Solo aparecen quienes eligieron compartir su casa exacta en el perfil. Se usa únicamente para calcular el medio.</p>
      {amigos.length > 0 && !r && <button className="calle-btn pri calle-ancho" disabled={!sel.length} onClick={async () => { const q = await buscar(sel); setR(q); setNada(!q); }}>Buscar a mitad de camino</button>}
      {nada && <p className="calle-vacio">No encontré un lugar por ahí.</p>}
      {r && <>
        <h3 className="calle-sec">Te proponemos</h3>
        <p className="calle-sub"><b>{r.nombre}</b><br />{r.detalle}</p>
        <Link className="calle-btn pri calle-ancho" href={`/gente/juntadas?lugar=${encodeURIComponent(r.nombre)}&lat=${r.lat.toFixed(6)}&lon=${r.lon.toFixed(6)}`}>Proponer la juntada</Link>
      </>}
    </HojaCalle>
  );
}

const horaTexto = (h: number) => `${String(Math.floor(h) % 24).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;

export function HojaClima({ hora, setHora, cerrar }: { hora: number | null; setHora: (h: number | null) => void; cerrar: () => void }) {
  const d = useClima(), c = d?.current;
  const ahora = new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" });
  const min = new Date(Date.now() - 3 * 36e5), real = min.getUTCHours() + min.getUTCMinutes() / 60;
  return (
    <HojaCalle titulo="Reloj y clima" cerrar={cerrar} chica>
      <div className="calle-numeros dos">
        <div><b>{ahora}</b><small>Hora real</small></div>
        <div><b>{c ? `${Math.round(c.temperature_2m)}°` : "—"}</b><small>{c ? NOMBRE[c.weather_code] ?? "Ahora" : "Sin datos del clima"}</small></div>
      </div>
      <h3 className="calle-sec">Simular otra hora</h3>
      <p className="calle-nota izq">Mové la hora para ver dónde da el sol y dónde hay sombra en esta vereda.</p>
      <label className="calle-regla">
        <span>{hora == null ? "Ahora" : horaTexto(hora)}</span>
        <input type="range" min={0} max={23.75} step={0.25} value={hora ?? real} aria-label="Hora simulada" onChange={(e) => setHora(Number(e.target.value))} />
      </label>
      <button className="calle-btn calle-ancho" onClick={() => setHora(null)} disabled={hora == null}>Volver a la hora real</button>
    </HojaCalle>
  );
}

export function HojaLugares({ favoritos, visitados, ir, borrar, cerrar }: { favoritos: Destino[]; visitados: Visita[]; ir: (d: Destino) => void; borrar: () => void; cerrar: () => void }) {
  const [p, setP] = useState<"fav" | "vis">("fav");
  const lista: Destino[] = p === "fav" ? favoritos : visitados;
  return (
    <HojaCalle titulo="Mis lugares" cerrar={cerrar}>
      <div className="calle-atajos" role="tablist">
        <button role="tab" aria-selected={p === "fav"} className={p === "fav" ? "on" : ""} onClick={() => setP("fav")}>Favoritos</button>
        <button role="tab" aria-selected={p === "vis"} className={p === "vis" ? "on" : ""} onClick={() => setP("vis")}>Visitados</button>
      </div>
      {lista.map((d, i) => (
        <button key={`${d.lat},${d.lon},${i}`} className="calle-fila" onClick={() => ir(d)}>
          <span className="calle-fila-ic"><Icono n={p === "fav" ? "guardar" : "reloj"} t={22} /></span>
          <span><b>{d.nombre}</b><small>{"t" in d ? new Date((d as Visita).t).toLocaleDateString("es-AR", { day: "numeric", month: "short" }) : d.direccion}</small></span>
        </button>
      ))}
      {!lista.length && <p className="calle-vacio">{p === "fav" ? "Todavía no guardaste lugares. Guardalos desde la recepción." : "Acá aparecen los lugares a los que llegues."}</p>}
      <p className="calle-nota izq">Se guarda solo en tu cuenta. Nadie más lo ve.</p>
      {p === "vis" && visitados.length > 0 && <button className="calle-btn calle-ancho" onClick={borrar}>Borrar el historial</button>}
    </HojaCalle>
  );
}
