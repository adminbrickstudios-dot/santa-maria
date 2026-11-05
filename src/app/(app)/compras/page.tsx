"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import "@/app/organizar.css";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { sb, traerTodo } from "@/lib/sb";
import { useSesion } from "@/lib/sesion";
import { Hoja } from "@/components/Hoja";
import { Icono } from "@/components/Icono";
import { ItemGuia } from "@/components/ItemGuia";
import { lanzarEfecto } from "@/components/Efectos";
import { DIAS, ahoraBA, pesos } from "@/lib/util";
import { Tilde, Vacio, guardarLocal, leerLocal } from "@/components/organizar/Comun";
import { leerPrecio, totalesCompra } from "@/components/organizar/logica";

const CLAVE = "sm-compra-lista";

function ListaForm({ x, cerrar }: { x?: any; cerrar: (id?: number | null) => void }) {
  const { perfil, toast } = useSesion();
  const [nombre, setNombre] = useState(x?.nombre || ""), [comp, setComp] = useState(!!x?.compartida);
  const mia = !x || x.perfil_id === perfil.id;
  async function guardar() {
    if (!nombre.trim()) return toast("Ponele un nombre.");
    const fila = { perfil_id: perfil.id, grupo_id: perfil.grupo_id, nombre: nombre.trim(), compartida: comp };
    const r = x ? await sb.from("compra_listas").update(fila).eq("id", x.id).select().single() : await sb.from("compra_listas").insert(fila).select().single();
    if (r.error) return toast("No pude guardar."); cerrar(r.data.id);
  }
  if (!mia) return <Hoja titulo={x.nombre} cerrar={() => cerrar()}><p className="expl">Esta lista la compartió alguien de tu grupo. Podés sumar y tildar cosas; solo quien la creó puede cambiarle el nombre o borrarla.</p></Hoja>;
  return <Hoja titulo={x ? "Editar lista" : "Nueva lista"} cerrar={() => cerrar()}>
    <div className="campo"><label htmlFor="cl-n">Nombre</label><input id="cl-n" type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Súper de la semana, asado" /></div>
    <button className="chip" aria-pressed={comp} onClick={() => setComp(!comp)}><Icono n="gente" t={18} />Compartir con el grupo</button>
    <p className="chico">Compartida, todo tu grupo puede verla, sumar y tildar.</p>
    <button className="btn pri" onClick={guardar}>Guardar</button>
    {x && <button className="btn mal chico" onClick={async () => { await sb.from("compra_listas").delete().eq("id", x.id); cerrar(null); }}><Icono n="papelera" t={20} />Borrar lista</button>}
  </Hoja>;
}
function ItemForm({ x, cerrar }: { x: any; cerrar: () => void }) {
  const { toast } = useSesion();
  const [f, setF] = useState({ nombre: x.nombre, cantidad: String(+x.cantidad).replace(".", ","), precio: x.precio != null ? String(+x.precio).replace(".", ",") : "" });
  async function guardar() {
    const cantidad = leerPrecio(f.cantidad), precio = f.precio.trim() ? leerPrecio(f.precio) : null;
    if (!f.nombre.trim() || !(cantidad > 0)) return toast("Poné nombre y cantidad.");
    if (precio != null && !(precio >= 0)) return toast("Revisá el precio.");
    const { error } = await sb.from("compra_items").update({ nombre: f.nombre.trim(), cantidad, precio }).eq("id", x.id);
    if (error) return toast("No pude guardar."); cerrar();
  }
  return <Hoja titulo="Editar" cerrar={cerrar}>
    <div className="campo"><label htmlFor="ci-n">Qué es</label><input id="ci-n" type="text" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></div>
    <div className="dos"><div className="campo"><label htmlFor="ci-c">Cantidad</label><input id="ci-c" type="text" inputMode="decimal" value={f.cantidad} onChange={(e) => setF({ ...f, cantidad: e.target.value })} /></div><div className="campo"><label htmlFor="ci-p">Precio estimado</label><input id="ci-p" type="text" inputMode="decimal" value={f.precio} onChange={(e) => setF({ ...f, precio: e.target.value })} placeholder="Por unidad" /></div></div>
    <button className="btn pri" onClick={guardar}>Guardar</button>
    <button className="btn mal chico" onClick={async () => { await sb.from("compra_items").delete().eq("id", x.id); cerrar(); }}><Icono n="papelera" t={20} />Sacar de la lista</button>
  </Hoja>;
}
function PasarHoja({ lista, total, cant, sinPrecio, cerrar }: { lista: any; total: number; cant: number; sinPrecio: number; cerrar: (ok?: boolean) => void }) {
  const { toast } = useSesion();
  const [monto, setMonto] = useState(total ? String(Math.round(total * 100) / 100).replace(".", ",") : ""), [ocupado, setOcupado] = useState(false);
  async function pasar() {
    const n = leerPrecio(monto);
    if (!(n > 0)) return toast("Poné cuánto gastaste.");
    setOcupado(true);
    const { data, error } = await sb.rpc("pasar_a_billetera", { p_lista: lista.id, p_monto: n });
    setOcupado(false);
    if (error) return toast("No se pudo pasar a Billetera.");
    window.dispatchEvent(new Event("sm-plata")); lanzarEfecto("quema", `−${pesos(+(data ?? n))}`); cerrar(true);
  }
  return <Hoja titulo="Pasar a Billetera" cerrar={() => cerrar()}>
    <p className="expl">Anoto un gasto en Súper en tu Billetera. {cant === 1 ? "Lo tildado sale" : `Los ${cant} tildados salen`} de la lista.</p>
    <label className="cap-monto"><span>$</span><input inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value.replace(/[^\d.,]/g, ""))} aria-label="Cuánto gastaste" /></label>
    {sinPrecio > 0 && <p className="chico" style={{ textAlign: "center" }}>{sinPrecio === 1 ? "1 cosa no tiene precio" : `${sinPrecio} cosas no tienen precio`}: poné el total del ticket.</p>}
    <button className="btn pri" disabled={ocupado} onClick={pasar}>{ocupado ? "Pasando…" : "Anotar gasto"}</button>
  </Hoja>;
}
function HoyConviene() {
  const [l, setL] = useState<any[] | null>(null), [ver, setVer] = useState<any>(null), dia = DIAS[ahoraBA().getDay()].toLowerCase();
  useEffect(() => { sb.from("guia_items").select("*").eq("seccion", "descuentos").contains("etiquetas", [dia]).order("orden").limit(6).then(({ data }: any) => setL(data || [])); }, [dia]);
  return <>
    <h3 className="sec">Hoy conviene</h3>
    {l && !l.length && <p className="expl">No tengo descuentos cargados para hoy {dia}.</p>}
    {l && l.length > 0 && <div className="lista">{l.map((i) => <button key={i.id} className="item" style={{ minHeight: 58 }} onClick={() => setVer(i)}><span className="q"><b style={{ fontSize: 16.5 }}>{i.titulo}</b>{(i.dato || i.bajada) && <small>{i.dato || i.bajada}</small>}</span><Icono n="chevron" t={18} /></button>)}</div>}
    <Link className="or-enlace" href="/guia/descuentos"><Icono n="regalo" /><span>Todos los descuentos</span><Icono n="chevron" t={18} /></Link>
    <a className="or-enlace" href="https://www.preciosclaros.gob.ar" target="_blank" rel="noopener noreferrer"><Icono n="grafico" /><span>Comparar precios<small>Precios Claros, sitio oficial</small></span><Icono n="link" t={18} /></a>
    {ver && <ItemGuia item={ver} cerrar={() => setVer(null)} />}
  </>;
}
function Compras() {
  const { perfil, toast } = useSesion();
  const [listas, setListas] = useState<any[]>([]), [items, setItems] = useState<any[]>([]), [cargado, setCargado] = useState(false), [sel, setSel] = useState<number | null>(null);
  const [f, setF] = useState({ nombre: "", cantidad: "", precio: "" }), [lf, setLf] = useState<any>(null), [ed, setEd] = useState<any>(null), [pasar, setPasar] = useState(false);
  const cargar = useCallback(async () => {
    const [a, b] = await Promise.all([sb.from("compra_listas").select("*").order("creado_en"), traerTodo((d, h) => sb.from("compra_items").select("*").order("id").range(d, h), 3000)]);
    const ls = a.data || [];
    setListas(ls); setItems(b); setCargado(true);
    setSel((s) => { const g = s ?? leerLocal<number>(CLAVE); return ls.some((x: any) => x.id === g) ? g : ls[0]?.id ?? null; });
  }, []);
  useEffect(() => { cargar(); const v = () => { if (!document.hidden) cargar(); }; document.addEventListener("visibilitychange", v); return () => document.removeEventListener("visibilitychange", v); }, [cargar]);
  const elegir = (id: number) => { setSel(id); guardarLocal(CLAVE, id); };
  const lista = listas.find((x) => x.id === sel), de = useMemo(() => items.filter((i) => i.lista_id === sel), [items, sel]);
  const orden = useMemo(() => [...de].sort((a, b) => +a.tildado - +b.tildado || a.id - b.id), [de]), t = useMemo(() => totalesCompra(de), [de]);
  async function sumar(e: React.FormEvent) {
    e.preventDefault();
    if (!f.nombre.trim() || !sel) return;
    const cantidad = f.cantidad.trim() ? leerPrecio(f.cantidad) : 1, precio = f.precio.trim() ? leerPrecio(f.precio) : null;
    if (!(cantidad > 0)) return toast("Revisá la cantidad.");
    if (precio != null && !(precio >= 0)) return toast("Revisá el precio.");
    const { error } = await sb.from("compra_items").insert({ lista_id: sel, perfil_id: perfil.id, nombre: f.nombre.trim(), cantidad, precio });
    if (error) return toast("No pude guardar.");
    setF({ nombre: "", cantidad: "", precio: "" }); navigator.vibrate?.(8); cargar();
  }
  async function tildar(i: any) {
    navigator.vibrate?.(10);
    setItems((l) => l.map((x) => (x.id === i.id ? { ...x, tildado: !x.tildado } : x)));
    const { error } = await sb.from("compra_items").update({ tildado: !i.tildado }).eq("id", i.id);
    if (error) { toast("No pude guardar."); cargar(); }
  }
  return <div className="pagina pg-compras">
    <div className="ag-cab"><h2 className="titulo">Compras</h2><button className="ico-btn ag-mas" style={{ background: "var(--sec-c)", color: "#fff" }} aria-label="Nueva lista" onClick={() => setLf({})}><Icono n="mas" t={24} /></button></div>
    {listas.length > 1 && <div className="segs or-segs" role="tablist">{listas.map((x) => <button key={x.id} className="seg" role="tab" aria-selected={sel === x.id} onClick={() => elegir(x.id)}>{x.nombre}</button>)}</div>}
    {cargado && !listas.length && <Vacio emoji="🛒" titulo="Armá tu primera lista" texto="Anotá lo que necesitás, cuánto cuesta más o menos y tildá en el súper."><button className="btn pri" onClick={() => setLf({})}>Nueva lista</button></Vacio>}
    {lista && <>
      <div className="or-tapa">
        <small>{lista.nombre}{lista.compartida ? ", compartida con el grupo" : ""}</small>
        <b>{pesos(t.estimado)}</b>
        <div className="co-tapa-f"><span>En el carrito {pesos(t.enCarrito)}</span><span>{t.tildados} de {t.total}</span></div>
        <div className="or-barra" role="progressbar" aria-valuemin={0} aria-valuemax={t.total} aria-valuenow={t.tildados} aria-label="Cosas tildadas"><i style={{ width: `${t.total ? (t.tildados / t.total) * 100 : 0}%` }} /></div>
      </div>
      <form style={{ display: "grid", gap: 8 }} onSubmit={sumar}>
        <div className="or-suma"><input type="text" aria-label="Qué necesitás" placeholder="Agregar a la lista" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /><button className="cap-ok" type="submit" aria-label="Agregar"><Icono n="mas" t={22} /></button></div>
        {f.nombre.trim() && <div className="dos"><input type="text" inputMode="decimal" aria-label="Cantidad" placeholder="Cantidad: 1" value={f.cantidad} onChange={(e) => setF({ ...f, cantidad: e.target.value })} /><input type="text" inputMode="decimal" aria-label="Precio estimado por unidad" placeholder="Precio estimado" value={f.precio} onChange={(e) => setF({ ...f, precio: e.target.value })} /></div>}
      </form>
      {orden.length > 0 ? <div className="lista">{orden.map((i) => <div key={i.id} className={`or-fila ${i.tildado ? "hecha" : ""}`}>
        <Tilde si={i.tildado} tocar={() => tildar(i)} etiqueta={i.tildado ? `Destildar ${i.nombre}` : `Tildar ${i.nombre}`} />
        <button className="q" onClick={() => setEd(i)}><b>{i.nombre}</b>{+i.cantidad !== 1 && <small>Cantidad {String(+i.cantidad).replace(".", ",")}</small>}</button>
        {i.precio != null && <span className="v">{pesos(+i.cantidad * +i.precio)}</span>}
      </div>)}</div> : <p className="expl" style={{ textAlign: "center", padding: 10 }}>La lista está vacía. Escribí arriba lo que necesitás.</p>}
      {t.tildados > 0 && <button className="btn pri" onClick={() => setPasar(true)}><Icono n="billetera" />Pasar a Billetera</button>}
      <button className="btn sec2 chico" onClick={() => setLf(lista)}><Icono n="ajustes" t={20} />Ajustes de la lista</button>
    </>}
    <HoyConviene />
    {lf && <ListaForm x={lf.id ? lf : undefined} cerrar={(id) => { setLf(null); if (id !== undefined) { if (id) elegir(id); else setSel(null); cargar(); } }} />}
    {ed && <ItemForm x={ed} cerrar={() => { setEd(null); cargar(); }} />}
    {pasar && lista && <PasarHoja lista={lista} total={t.enCarrito} cant={t.tildados} sinPrecio={t.sinPrecio} cerrar={(ok) => { setPasar(false); if (ok) cargar(); }} />}
  </div>;
}
export default function P() { return <Suspense><Compras /></Suspense>; }
