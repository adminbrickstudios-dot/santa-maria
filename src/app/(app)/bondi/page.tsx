"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import "@/app/organizar.css";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { sb } from "@/lib/sb";
import { useSesion } from "@/lib/sesion";
import { Hoja } from "@/components/Hoja";
import { Icono } from "@/components/Icono";
import { lanzarEfecto } from "@/components/Efectos";
import { pesos } from "@/lib/util";
import { Vacio, guardarLocal, leerLocal } from "@/components/organizar/Comun";
import { gastoTransporte, leerPrecio, pesosExactos } from "@/components/organizar/logica";

const CLAVE = "sm-bondi-viajes", NOMBRE_FIJO = "Transporte público", MAX_VIAJES = 42;
const COMO: { e: string; t: string; l: string[]; ojo?: string }[] = [
  { e: "💳", t: "Con la tarjeta SUBE", l: ["Apoyala en la máquina al subir.", "Registrala con tu DNI: sin registrar el viaje sale más caro."] },
  { e: "📲", t: "Cargarle plata", l: ["Billeteras virtuales y home banking.", "Terminales automáticas (TAS) en estaciones.", "Carga a Bordo en los colectivos habilitados."] },
  { e: "📡", t: "Acreditar lo que cargaste", l: ["App SUBE en un Android con NFC: apoyás la tarjeta en el celular y se acredita.", "También se acredita en las terminales TAS."] },
  { e: "🔳", t: "Pagar con QR", l: ["Desde la app SUBE o BNA+, en las líneas donde funciona."] },
  { e: "⌚", t: "Tarjeta contactless, celular o reloj", l: ["Visa o Mastercard contactless, o celular y reloj con NFC, en las líneas adheridas.", "En colectivo, avisale al chofer hasta dónde vas antes de apoyar."], ojo: "Esto paga el viaje. No acredita saldo pendiente en tu SUBE, y el precio puede ser distinto." },
];

function FijoHoja({ monto, cerrar }: { monto: number; cerrar: () => void }) {
  const { perfil, toast } = useSesion();
  const [m, setM] = useState(String(Math.round(monto / 100) * 100)), [dia, setDia] = useState("1"), [existe, setExiste] = useState<any>(null), [ocupado, setOcupado] = useState(false);
  useEffect(() => { sb.from("fijos").select("*").eq("nombre", NOMBRE_FIJO).limit(1).then(({ data }: any) => { const x = data?.[0]; if (x) { setExiste(x); setDia(String(x.dia)); } }); }, []);
  async function guardar() {
    const n = leerPrecio(m), d = Math.min(31, Math.max(1, +dia || 1));
    if (!(n > 0)) return toast("Poné el monto.");
    setOcupado(true);
    const { error } = existe ? await sb.from("fijos").update({ monto: n, dia: d }).eq("id", existe.id) : await sb.from("fijos").insert({ perfil_id: perfil.id, tipo: "gasto", nombre: NOMBRE_FIJO, monto: n, categoria: "Transporte", dia: d });
    setOcupado(false);
    if (error) return toast("No se pudo guardar.");
    window.dispatchEvent(new Event("sm-plata")); lanzarEfecto("listo"); toast(existe ? "Actualicé tu gasto fijo." : "Listo: quedó en tus gastos fijos."); cerrar();
  }
  return <Hoja titulo="Gasto fijo en Billetera" cerrar={cerrar}>
    <p className="expl">{existe ? "Ya tenés este gasto fijo: voy a actualizarlo." : "Se anota solo una vez por mes, en Transporte."}</p>
    <div className="dos">
      <div className="campo"><label htmlFor="bo-m">Monto por mes</label><input id="bo-m" type="text" inputMode="numeric" value={m} onChange={(e) => setM(e.target.value)} /></div>
      <div className="campo"><label htmlFor="bo-d">Día del mes</label><input id="bo-d" type="number" inputMode="numeric" min="1" max="31" value={dia} onChange={(e) => setDia(e.target.value)} /></div>
    </div>
    <button className="btn pri" disabled={ocupado} onClick={guardar}>Guardar</button>
  </Hoja>;
}

function MiSube() {
  const { perfil, toast } = useSesion();
  const [guardada, setGuardada] = useState<string | null>(null), [num, setNum] = useState(""), [cargado, setCargado] = useState(false);
  useEffect(() => { sb.from("caja_items").select("cuerpo").eq("clave", "sube").limit(1).then(({ data }: any) => { setGuardada(data?.[0]?.cuerpo || null); setCargado(true); }); }, []);
  async function guardar() {
    const d = num.replace(/\D/g, "");
    if (d.length < 10 || d.length > 20) return toast("Revisá el número: son los dígitos del frente de la SUBE.");
    const { error } = await sb.from("caja_items").upsert({ perfil_id: perfil.id, tipo: "nota", titulo: "Mi SUBE", cuerpo: d, categoria: "Transporte", fijado: true, clave: "sube" }, { onConflict: "perfil_id,clave" });
    if (error) return toast("No se pudo guardar.");
    setGuardada(d); setNum(""); toast("Guardada en Mi caja.");
  }
  if (!cargado) return null;
  if (guardada) return <Link className="or-enlace" href="/caja"><Icono n="billetera" /><span>Tu SUBE está en Mi caja<small>{guardada.replace(/(\d{4})(?=\d)/g, "$1 ")}</small></span><Icono n="chevron" t={18} /></Link>;
  return <div className="tarjeta">
    <h3>Guardar mi número de SUBE</h3>
    <p className="expl">Es opcional. Queda en Mi caja por si la perdés: solo lo ves vos.</p>
    <div className="or-suma"><input type="text" inputMode="numeric" aria-label="Número de SUBE" placeholder="Número de la tarjeta" value={num} onChange={(e) => setNum(e.target.value)} /><button className="btn sec2 chico" onClick={guardar}>Guardar</button></div>
  </div>;
}

function Bondi() {
  const [t, setT] = useState<any[]>([]), [cargado, setCargado] = useState(false), [viajes, setViajes] = useState<Record<number, number>>({}), [fijo, setFijo] = useState(false);
  useEffect(() => {
    sb.from("tarifas").select("*").order("orden").then(({ data }: any) => { setT(data || []); setCargado(true); });
    setViajes(leerLocal<Record<number, number>>(CLAVE) || {});
  }, []);
  function cambiar(id: number, d: number) { const n = { ...viajes, [id]: Math.min(MAX_VIAJES, Math.max(0, (viajes[id] || 0) + d)) }; setViajes(n); guardarLocal(CLAVE, n); navigator.vibrate?.(6); }
  const r = useMemo(() => gastoTransporte(t, viajes), [t, viajes]);
  const fuentes = useMemo(() => [...new Map(t.map((x) => [x.fuente, x])).values()], [t]);
  const revisada = t[0]?.revisada;
  return <div className="pagina pg-bondi">
    <h2 className="titulo">Bondi</h2>
    <div className="or-aviso azul"><span aria-hidden="true">🚌</span><span>Esta app no cobra boletos: pagás con la SUBE u otro medio habilitado.</span></div>

    <h3 className="sec">Cuánto sale</h3>
    {cargado && !t.length ? <Vacio emoji="🚏" titulo="Sin tarifas por ahora" texto="No pude traer los precios. Probá de nuevo en un rato." /> :
      <div className="lista">{t.map((x) => <div key={x.id} className="bo-precio"><span aria-hidden="true">{x.emoji}</span>
        <span className="q"><b>{x.nombre}</b>{x.detalle && <small>{x.detalle}</small>}{x.para_confirmar && <span className="bo-conf">Para confirmar</span>}</span>
        <span className="v">{x.hasta ? <>{pesosExactos(+x.desde)}<br /><small>a {pesosExactos(+x.hasta)}</small></> : pesosExactos(+x.desde)}</span>
      </div>)}</div>}
    {fuentes.length > 0 && <p className="or-fuente">Fuentes: {fuentes.map((x, i) => <span key={x.id}>{i > 0 && ", "}{x.fuente_url ? <a href={x.fuente_url} target="_blank" rel="noopener noreferrer">{x.fuente}</a> : x.fuente}</span>)}.{revisada ? ` Revisado el ${revisada.slice(8)}/${revisada.slice(5, 7)}/${revisada.slice(0, 4)}.` : ""} Los precios cambian seguido.</p>}

    <h3 className="sec">Cuánto gasto por mes</h3>
    {t.length > 0 && <>
      <p className="expl">Poné cuántos viajes hacés por semana.</p>
      <div className="lista">{t.map((x) => <div key={x.id} className="bo-precio"><span aria-hidden="true">{x.emoji}</span><span className="q"><b style={{ fontSize: 16.5 }}>{x.nombre}</b></span>
        <span className="bo-paso"><button aria-label={`Un viaje menos en ${x.nombre}`} onClick={() => cambiar(x.id, -1)}>−</button><b aria-live="polite">{viajes[x.id] || 0}</b><button aria-label={`Un viaje más en ${x.nombre}`} onClick={() => cambiar(x.id, 1)}>+</button></span>
      </div>)}</div>
      <div className="or-tapa" role="status">
        <small>{r.viajes ? `Unos ${r.viajes} viajes por mes` : "Por mes"}</small>
        <b style={r.max > r.min ? { fontSize: "clamp(26px,8.4vw,36px)" } : undefined}>{r.max > r.min ? `${pesos(r.min)} a ${pesos(r.max)}` : pesos(r.min)}</b>
        {r.max > r.min && <small>Depende de cuán lejos viajes.</small>}
      </div>
      <button className="btn pri" disabled={!r.viajes} onClick={() => setFijo(true)}><Icono n="billetera" />Crear gasto fijo en Billetera</button>
    </>}

    <h3 className="sec">Cómo pagar</h3>
    <div className="bo-pago">{COMO.map((c) => <details key={c.t}><summary><span aria-hidden="true">{c.e}</span><span>{c.t}</span><Icono n="chevron" t={18} /></summary><ul>{c.l.map((x) => <li key={x}>{x}</li>)}</ul>{c.ojo && <p><b>Ojo:</b> {c.ojo}</p>}</details>)}</div>

    <MiSube />
    <Link className="or-enlace" href="/mapa"><Icono n="mapa" /><span>Ver cómo llegar<small>Rutas en el mapa</small></span><Icono n="chevron" t={18} /></Link>
    <a className="or-enlace" href="https://www.argentina.gob.ar/sube" target="_blank" rel="noopener noreferrer"><Icono n="link" /><span>Sitio oficial de SUBE<small>Registrar la tarjeta, saldo y más</small></span><Icono n="chevron" t={18} /></a>
    {fijo && <FijoHoja monto={(r.min + r.max) / 2} cerrar={() => setFijo(false)} />}
  </div>;
}
export default function P() { return <Suspense><Bondi /></Suspense>; }
