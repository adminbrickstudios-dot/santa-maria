"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { sb } from "@/lib/sb";
import { useSesion } from "@/lib/sesion";
import { Avatar } from "@/components/Avatar";
import { Hoja } from "@/components/Hoja";
import { Icono } from "@/components/Icono";
import { cuandoRelativo, pesos } from "@/lib/util";

function Gente() {
  const r = useRouter(), q = useSearchParams(), s = useSesion();
  const { perfil, personas, toast, recuentos, pantalla, asegurarPersonas } = s;
  const [v, setV] = useState(q.get("v") || "mensajes");
  const [conv, setConv] = useState<any[]>([]), [aps, setAps] = useState<any[]>([]), [cuentas, setCu] = useState<any[]>([]);
  const [ver, setVer] = useState<any>(null), [nuevo, setN] = useState(false), [f, setF] = useState<any>({}), [cu, setCuAb] = useState<any>(null), [gastos, setGa] = useState<any[]>([]), [ncu, setNcu] = useState(false);
  const cargar = useCallback(async () => {
    const [a, b, c] = await Promise.all([sb.rpc("mis_conversaciones"), sb.from("aportes").select("*").order("creado_en", { ascending: false }).limit(60), sb.from("cuentas").select("*").order("creado_en", { ascending: false }).limit(100)]);
    setConv(a.data || []); setAps(b.data || []); setCu(c.data || []); recuentos();
    asegurarPersonas([...(b.data || []).map((x: any) => x.autor_id), ...(c.data || []).flatMap((x: any) => x.miembros || [])]);
  }, [recuentos, asegurarPersonas]);
  /* Buscar a alguien sin bajarse la lista entera */
  const [busca, setBusca] = useState(""), [halladas, setHalladas] = useState<any[] | null>(null);
  useEffect(() => {
    const t = busca.trim();
    if (t.length < 2) { setHalladas(null); return; }
    const id = setTimeout(() => sb.rpc("buscar_personas", { q: t }).then(({ data }: any) => setHalladas(data || [])), 250);
    return () => clearTimeout(id);
  }, [busca]);
  useEffect(() => { cargar(); if (q.get("nuevo") === "1") { setF({ tipo: "aviso" }); setN(true); } }, [cargar, q]);
  useEffect(() => { const id = q.get("persona"); if (id) { const p = personas.find((x) => x.id === id); if (p) { setV("personas"); setVer(p); } } }, [q, personas]);
  const nombre = (id: string) => personas.find((p) => p.id === id)?.nombre || "Alguien";
  async function dm(id: string) { const { data, error } = await sb.rpc("abrir_directa", { otro: id }); if (error) return toast("No pude abrir la charla."); r.push(`/gente/chat/${data}`); }
  async function publicar() {
    if (!f.titulo) return toast("Escribí algo.");
    let la = null, lo = null;
    if (f.dir) {
      const m = await import("@/lib/mapa/vista"); await m.cargarDatosMapa(); const g = m.geocodificar(f.dir)[0]; if (g) { la = m.alat(g.y); lo = m.alon(g.x); } }
    const { error } = await sb.from("aportes").insert({ grupo_id: perfil.grupo_id, autor_id: perfil.id, tipo: f.tipo || "aviso", titulo: f.titulo, nota: f.nota || null, lat: la, lon: lo });
    if (error) return toast("No pude publicar.");
    setN(false); setF({}); cargar();
  }
  async function abrirCuenta(c: any) { setCuAb(c); const { data } = await sb.from("cuenta_gastos").select("*").eq("cuenta_id", c.id).order("creado_en"); setGa(data || []); }
  async function crearCuenta() {
    const m: string[] = f.miembros || []; if (!f.titulo || m.length < 1) return toast("Poné un nombre y elegí con quién.");
    await sb.from("cuentas").insert({ grupo_id: perfil.grupo_id, creada_por: perfil.id, titulo: f.titulo, miembros: [perfil.id, ...m] });
    setNcu(false); setF({}); cargar();
  }
  async function sumarGasto() {
    if (!f.concepto || !(+f.monto > 0)) return toast("Poné concepto y monto.");
    await sb.from("cuenta_gastos").insert({ cuenta_id: cu.id, pago_id: f.pago_id || perfil.id, concepto: f.concepto, monto: +f.monto });
    setF({}); abrirCuenta(cu);
  }
  /* quién le debe a quién, con la menor cantidad de transferencias */
  function saldos() {
    const m: string[] = cu.miembros, tot = gastos.reduce((a, g) => a + Number(g.monto), 0), parte = tot / m.length, sal = new Map(m.map((x) => [x, -parte]));
    gastos.forEach((g) => sal.set(g.pago_id, (sal.get(g.pago_id) || 0) + Number(g.monto)));
    const deu = [...sal].filter((x) => x[1] < -1).sort((a, b) => a[1] - b[1]), acr = [...sal].filter((x) => x[1] > 1).sort((a, b) => b[1] - a[1]), o: string[] = [];
    let i = 0, j = 0;
    while (i < deu.length && j < acr.length) { const n = Math.min(-deu[i][1], acr[j][1]); o.push(`${nombre(deu[i][0])} le pasa ${pesos(n)} a ${nombre(acr[j][0])}`); deu[i][1] += n; acr[j][1] -= n; if (deu[i][1] > -1) i++; if (acr[j][1] < 1) j++; }
    return { tot, o };
  }
  const yo = perfil.id, TX: Record<string, string> = { aviso: "Aviso", salida: "Sale", pedido: "Pedido", atajo: "Atajo", lugar: "Lugar" };
  const tabs = [["mensajes", "Mensajes"], ["grupo", "Muro"], ["personas", "Personas"], ["cuentas", "Cuentas"]].filter(([k]) => k !== "cuentas" || pantalla("cuentas"));
  return <div className="pagina">
    <h2 className="titulo">Tu gente</h2>
    <Link href="/gente/juntadas" className="bloque"><span className="ic"><Icono n="gente" t={28} /></span><span style={{ flex: 1, minWidth: 0 }}><b>Juntadas</b><small>Proponé una, confirmá quién va</small></span></Link>
    <div className="segs" role="tablist">{tabs.map(([k, n]) => <button key={k} className="seg" role="tab" aria-selected={v === k} onClick={() => setV(k)}>{n}</button>)}</div>
    {v === "mensajes" && <>
      {conv.length > 0 && <div className="lista">{conv.map((c) => <Link key={c.id} href={`/gente/chat/${c.id}`} className="item">
        {c.tipo === "grupo" ? <span className="ic"><Icono n="gente" /></span> : <Avatar p={{ nombre: c.otro_nombre, color: c.otro_color, avatar_url: c.otro_avatar }} />}
        <span className="q"><b>{c.tipo === "grupo" ? c.titulo : c.otro_nombre}</b><small style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.ultimo_texto || "Todavía no hay mensajes"}</small></span>
        <span className="v"><small>{c.ultimo_texto ? cuandoRelativo(c.ultimo_en) : ""}</small>{Number(c.sin_leer) > 0 && <span className="etiqueta amarilla">{c.sin_leer}</span>}</span>
      </Link>)}</div>}
      <button className="btn pri" onClick={() => setV("personas")}><Icono n="chat" />Escribirle a alguien</button>
    </>}
    {v === "personas" && <div className="campo"><label htmlFor="bp">Buscar por nombre o usuario</label><input id="bp" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>}
    {v === "personas" && <div className="grilla-gente">{(halladas || personas).filter((p: any) => p.id !== yo).map((p: any) => <button key={p.id} className="persona" onClick={() => setVer(p)}><Avatar p={p} t={46} /><span className="q"><b>{p.nombre}</b><small>{p.carrera_texto || p.barrio || ""}</small></span></button>)}</div>}
    {v === "grupo" && <>
      <button className="btn pri" onClick={() => { setF({ tipo: "aviso" }); setN(true); }}><Icono n="mas" />Publicar</button>
      {aps.length ? <div className="lista">{aps.map((a) => <div key={a.id} className="item"><Avatar p={personas.find((p) => p.id === a.autor_id)} t={38} /><span className="q"><b>{a.titulo}</b>{a.nota && <small>{a.nota}</small>}<small>{nombre(a.autor_id)} · {TX[a.tipo]} · {cuandoRelativo(a.creado_en)}</small></span>{a.lat != null && <Link className="ico-btn" aria-label="Ver en el mapa" href={`/mapa?lat=${a.lat}&lon=${a.lon}&n=${encodeURIComponent(a.titulo)}&ver=1`}><Icono n="mapa" t={20} /></Link>}{(a.autor_id === yo || perfil.rol === "admin") && <button className="ico-btn" aria-label="Borrar" onClick={async () => { await sb.from("aportes").delete().eq("id", a.id); cargar(); }}><Icono n="x" t={18} /></button>}</div>)}</div> : <p className="expl">Avisos, atajos, lugares y pedidos del tipo “¿alguien tiene el libro de…?”.</p>}
    </>}
    {v === "cuentas" && <>
      <p className="expl">Para dividir un asado, un viaje o el alquiler sin pelearse.</p>
      {cuentas.length > 0 && <div className="lista">{cuentas.map((c) => <button key={c.id} className="item" onClick={() => abrirCuenta(c)}><span className="ic"><Icono n="plata" /></span><span className="q"><b>{c.titulo}</b><small>{c.miembros.length} personas</small></span></button>)}</div>}
      <button className="btn pri" onClick={() => { setF({ miembros: [] }); setNcu(true); }}><Icono n="mas" />Nueva cuenta</button>
    </>}
    {ver && <Hoja titulo={ver.nombre} cerrar={() => setVer(null)}>
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}><Avatar p={ver} t={72} /><div><p className="chico">@{ver.usuario}</p>{ver.barrio && <p>{ver.barrio}</p>}{ver.ciudad_origen && <p className="expl">De {ver.ciudad_origen}</p>}</div></div>
      {ver.carrera_texto && <p><b>{ver.carrera_texto}</b>{ver.anio_cursada ? `, ${ver.anio_cursada}° año` : ""}</p>}
      {ver.bio && <p>{ver.bio}</p>}
      <div className="fila"><button className="btn pri" onClick={() => dm(ver.id)}><Icono n="chat" />Mensaje</button>{ver.lat != null && <Link className="btn sec2" href={`/mapa?lat=${ver.lat}&lon=${ver.lon}&n=${encodeURIComponent("Casa de " + ver.nombre)}`}><Icono n="mapa" />Cómo llego</Link>}</div>
      <button className="btn mal chico" onClick={async () => { await sb.from("bloqueos").insert({ perfil_id: yo, bloqueado_id: ver.id }); toast(`Bloqueaste a ${ver.nombre}. Ya no puede escribirte.`); setVer(null); }}>Bloquear</button>
    </Hoja>}
    {nuevo && <Hoja titulo="Publicar en el grupo" cerrar={() => setN(false)}>
      <div className="chipera">{[["aviso", "Aviso"], ["pedido", "Pedido"], ["atajo", "Atajo"], ["lugar", "Lugar"]].map(([k, n]) => <button key={k} className="chip" aria-pressed={f.tipo === k} onClick={() => setF({ ...f, tipo: k })}>{n}</button>)}</div>
      <div className="campo"><label htmlFor="p1">Qué querés contar</label><input id="p1" type="text" maxLength={80} value={f.titulo || ""} onChange={(e) => setF({ ...f, titulo: e.target.value })} /></div>
      <div className="campo"><label htmlFor="p2">Detalle (opcional)</label><textarea id="p2" maxLength={280} value={f.nota || ""} onChange={(e) => setF({ ...f, nota: e.target.value })} /></div>
      {(f.tipo === "atajo" || f.tipo === "lugar") && <div className="campo"><label htmlFor="p3">Dirección o esquina</label><input id="p3" type="text" placeholder="Ej: Paraguay 2100" value={f.dir || ""} onChange={(e) => setF({ ...f, dir: e.target.value })} /></div>}
      <button className="btn pri" onClick={publicar}>Publicar</button>
    </Hoja>}
    {ncu && <Hoja titulo="Nueva cuenta" cerrar={() => setNcu(false)}>
      <div className="campo"><label htmlFor="q1">Nombre</label><input id="q1" type="text" placeholder="Ej: Asado del sábado" value={f.titulo || ""} onChange={(e) => setF({ ...f, titulo: e.target.value })} /></div>
      <p style={{ fontWeight: 700 }}>¿Con quién?</p>
      <div className="chipera">{personas.filter((p) => p.id !== yo).map((p) => { const on = (f.miembros || []).includes(p.id); return <button key={p.id} className="chip" aria-pressed={on} onClick={() => setF({ ...f, miembros: on ? f.miembros.filter((x: string) => x !== p.id) : [...f.miembros, p.id] })}>{p.nombre}</button>; })}</div>
      <button className="btn pri" onClick={crearCuenta}>Crear</button>
    </Hoja>}
    {cu && <Hoja titulo={cu.titulo} cerrar={() => setCuAb(null)}>
      {(() => { const b = saldos(); return <div className="tarjeta"><h3>Total {pesos(b.tot)}, {pesos(b.tot / cu.miembros.length)} cada uno</h3>{b.o.length ? <ul>{b.o.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="expl">Están a mano.</p>}</div>; })()}
      {gastos.length > 0 && <div className="lista">{gastos.map((g) => <div key={g.id} className="item"><span className="q"><b>{g.concepto}</b><small>Pagó {nombre(g.pago_id)}</small></span><span className="v">{pesos(g.monto)}</span></div>)}</div>}
      <div className="campo"><label htmlFor="g1">Qué se pagó</label><input id="g1" type="text" value={f.concepto || ""} onChange={(e) => setF({ ...f, concepto: e.target.value })} /></div>
      <div className="dos"><div className="campo"><label htmlFor="g2">Monto</label><input id="g2" type="number" min="1" value={f.monto || ""} onChange={(e) => setF({ ...f, monto: e.target.value })} /></div><div className="campo"><label htmlFor="g3">Pagó</label><select id="g3" value={f.pago_id || yo} onChange={(e) => setF({ ...f, pago_id: e.target.value })}>{cu.miembros.map((m: string) => <option key={m} value={m}>{nombre(m)}</option>)}</select></div></div>
      <button className="btn pri" onClick={sumarGasto}>Sumar gasto</button>
    </Hoja>}
  </div>;
}
export default function P() { return <Suspense><Gente /></Suspense>; }
