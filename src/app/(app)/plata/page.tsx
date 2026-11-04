"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { sb } from "@/lib/sb";
import { useSesion } from "@/lib/sesion";
import { Hoja } from "@/components/Hoja";
import { Icono } from "@/components/Icono";
import { ahoraBA, pesos, MESES } from "@/lib/util";

const CATS = ["Alquiler y expensas", "Súper", "Transporte", "Comida afuera", "Facu", "Salidas", "Servicios", "Salud", "Otros"];
function Plata() {
  const { perfil, recargar, toast } = useSesion();
  const q = useSearchParams();
  const [l, setL] = useState<any[]>([]), [n, setN] = useState(q.get("nuevo") === "1"), [f, setF] = useState<any>({ categoria: CATS[1] }), [pres, setP] = useState(String(perfil.preferencias?.presupuesto || ""));
  const hoy = ahoraBA(), ini = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-01`;
  const cargar = useCallback(async () => { const { data } = await sb.from("gastos").select("*").gte("fecha", ini).order("fecha", { ascending: false }); setL(data || []); }, [ini]);
  useEffect(() => { cargar(); }, [cargar]);
  const tot = l.reduce((a, g) => a + Number(g.monto), 0), lim = Number(perfil.preferencias?.presupuesto || 0);
  const porCat = CATS.map((c) => [c, l.filter((g) => g.categoria === c).reduce((a, g) => a + Number(g.monto), 0)] as [string, number]).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]);
  const diasMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate(), resta = diasMes - hoy.getDate() + 1;
  async function guardar() {
    if (!(+f.monto > 0)) return toast("Poné el monto.");
    await sb.from("gastos").insert({ perfil_id: perfil.id, categoria: f.categoria, monto: +f.monto, nota: f.nota || null });
    setN(false); setF({ categoria: CATS[1] }); cargar();
  }
  async function tope() { await sb.from("perfiles").update({ preferencias: { ...perfil.preferencias, presupuesto: +pres || 0 } }).eq("id", perfil.id); await recargar(); toast("Presupuesto guardado."); }
  return <div className="pagina">
    <h2 className="titulo">Mi plata de {MESES[hoy.getMonth()]}</h2>
    <p className="expl">Solo vos ves esto.</p>
    <div className="dos"><div className="mini"><span className="et">Gastaste</span><b>{pesos(tot)}</b>{lim > 0 && <small>de {pesos(lim)}</small>}</div>{lim > 0 ? <div className="mini"><span className="et">Por día</span><b>{pesos(Math.max(0, (lim - tot) / resta))}</b><small>te quedan {resta} días</small></div> : <div className="mini"><span className="et">Movimientos</span><b>{l.length}</b><small>este mes</small></div>}</div>
    {lim > 0 && <div className="barrita"><i style={{ width: `${Math.min(100, (tot / lim) * 100)}%`, background: tot > lim ? "var(--mal)" : undefined }} /></div>}
    <button className="btn pri" onClick={() => setN(true)}><Icono n="mas" />Anotar gasto</button>
    {porCat.length > 0 && <><h3 className="sec">En qué se fue</h3><div className="lista">{porCat.map(([c, m]) => <div key={c} className="item"><span className="q"><b>{c}</b><div className="barrita" style={{ marginTop: 5 }}><i style={{ width: `${(m / tot) * 100}%` }} /></div></span><span className="v">{pesos(m)}</span></div>)}</div></>}
    {l.length > 0 && <><h3 className="sec">Movimientos</h3><div className="lista">{l.slice(0, 40).map((g) => <div key={g.id} className="item"><span className="q"><b>{g.nota || g.categoria}</b><small>{g.categoria} · {g.fecha.slice(8, 10)}/{g.fecha.slice(5, 7)}</small></span><span className="v">{pesos(g.monto)}</span><button className="ico-btn" aria-label="Borrar" onClick={async () => { await sb.from("gastos").delete().eq("id", g.id); cargar(); }}><Icono n="x" t={18} /></button></div>)}</div></>}
    <div className="tarjeta"><div className="campo"><label htmlFor="pr">Presupuesto del mes</label><input id="pr" type="number" min="0" value={pres} onChange={(e) => setP(e.target.value)} /></div><button className="btn sec2 chico" onClick={tope}>Guardar presupuesto</button></div>
    <Link className="btn sec2" href="/guia/plata">Ver cuánto cuesta vivir acá</Link>
    {n && <Hoja titulo="Anotar gasto" cerrar={() => setN(false)}>
      <div className="campo"><label htmlFor="m1">Monto</label><input id="m1" type="number" min="1" inputMode="numeric" value={f.monto || ""} onChange={(e) => setF({ ...f, monto: e.target.value })} /></div>
      <div className="chipera">{CATS.map((c) => <button key={c} className="chip" aria-pressed={f.categoria === c} onClick={() => setF({ ...f, categoria: c })}>{c}</button>)}</div>
      <div className="campo"><label htmlFor="m2">Nota (opcional)</label><input id="m2" type="text" value={f.nota || ""} onChange={(e) => setF({ ...f, nota: e.target.value })} /></div>
      <button className="btn pri" onClick={guardar}>Guardar</button>
    </Hoja>}
  </div>;
}
export default function P() { return <Suspense><Plata /></Suspense>; }
