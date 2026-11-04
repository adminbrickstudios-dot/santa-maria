"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import "@/app/organizar.css";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { sb } from "@/lib/sb";
import { useSesion } from "@/lib/sesion";
import { Hoja } from "@/components/Hoja";
import { Icono } from "@/components/Icono";
import { Vacio } from "@/components/organizar/Comun";
import { buscarEnCaja } from "@/components/organizar/logica";

const TIPOS: [string, string, string][] = [["nota", "📝", "Nota"], ["enlace", "🔗", "Enlace"], ["foto", "🖼️", "Foto"], ["archivo", "📄", "Archivo"]];
const EMOJI: Record<string, string> = { nota: "📝", enlace: "🔗", foto: "🖼️", archivo: "📄" };
const MAX = 25e6, BUCKET = "caja";

function ItemForm({ x, cats, cerrar }: { x?: any; cats: any[]; cerrar: (c?: boolean) => void }) {
  const { perfil, toast } = useSesion();
  const [f, setF] = useState<any>(x ? { ...x, cuerpo: x.cuerpo || "", enlace: x.enlace || "" } : { tipo: "nota", titulo: "", cuerpo: "", enlace: "", categoria: cats[0]?.nombre || "Otros", fijado: false });
  const [arch, setArch] = useState<File | null>(null), [ocupado, setOcupado] = useState(false), [nueva, setNueva] = useState("");
  const conArchivo = f.tipo === "foto" || f.tipo === "archivo";
  async function sumarCat() {
    const n = nueva.trim(); if (!n) return;
    const { error } = await sb.from("caja_categorias").insert({ perfil_id: perfil.id, nombre: n, emoji: "🗂️", orden: 50 });
    if (error) return toast("Esa categoría ya existe.");
    setNueva(""); setF({ ...f, categoria: n }); window.dispatchEvent(new Event("sm-caja"));
  }
  function elegir(a: File | null) {
    if (a && a.size > MAX) return toast("El archivo pesa más de 25 MB.");
    setArch(a); if (a && !f.titulo.trim()) setF({ ...f, titulo: a.name.replace(/\.[^.]+$/, "") });
  }
  async function guardar() {
    if (!f.titulo.trim()) return toast("Ponele un título.");
    if (f.tipo === "enlace" && !/^https?:\/\/\S+/i.test(f.enlace.trim())) return toast("El enlace tiene que empezar con https://");
    if (conArchivo && !arch && !f.archivo) return toast("Elegí el archivo.");
    setOcupado(true);
    let archivo = f.archivo || null, archivo_nombre = f.archivo_nombre || null, mime = f.mime || null, subido: string | null = null;
    if (arch) {
      const ruta = `${perfil.id}/${Date.now()}-${arch.name.replace(/[^\w.-]/g, "_")}`;
      const { error } = await sb.storage.from(BUCKET).upload(ruta, arch, { contentType: arch.type || undefined });
      if (error) { setOcupado(false); return toast("No se pudo subir el archivo."); }
      subido = ruta; archivo = ruta; archivo_nombre = arch.name; mime = arch.type || null;
    }
    const fila = { perfil_id: perfil.id, tipo: f.tipo, titulo: f.titulo.trim(), cuerpo: f.cuerpo.trim() || null, enlace: f.tipo === "enlace" ? f.enlace.trim() : null, archivo, archivo_nombre, mime, categoria: f.categoria, fijado: f.fijado };
    const { error } = x ? await sb.from("caja_items").update(fila).eq("id", x.id) : await sb.from("caja_items").insert(fila);
    if (error) { if (subido) await sb.storage.from(BUCKET).remove([subido]); setOcupado(false); return toast("No se pudo guardar."); }
    if (subido && x?.archivo) await sb.storage.from(BUCKET).remove([x.archivo]);
    setOcupado(false); cerrar(true);
  }
  return <Hoja titulo={x ? "Editar" : "Guardar en Mi caja"} cerrar={() => cerrar()}>
    {!x && <div className="cj-tipos">{TIPOS.map(([k, e, n]) => <button key={k} aria-pressed={f.tipo === k} onClick={() => setF({ ...f, tipo: k })}><span aria-hidden="true">{e}</span>{n}</button>)}</div>}
    <div className="campo"><label htmlFor="cj-t">Título</label><input id="cj-t" type="text" value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} /></div>
    {f.tipo === "enlace" && <div className="campo"><label htmlFor="cj-e">Enlace</label><input id="cj-e" type="url" inputMode="url" value={f.enlace} onChange={(e) => setF({ ...f, enlace: e.target.value })} placeholder="https://" /></div>}
    {conArchivo && <label className="cj-archivo"><input type="file" accept={f.tipo === "foto" ? "image/*" : undefined} onChange={(e) => elegir(e.target.files?.[0] || null)} /><Icono n="adjunto" />{arch?.name || f.archivo_nombre || (f.tipo === "foto" ? "Elegir foto" : "Elegir archivo")}<small className="chico">Hasta 25 MB</small></label>}
    <div className="campo"><label htmlFor="cj-c">{f.tipo === "nota" ? "Nota" : "Nota (opcional)"}</label><textarea id="cj-c" style={{ minHeight: f.tipo === "nota" ? 130 : 70 }} value={f.cuerpo} onChange={(e) => setF({ ...f, cuerpo: e.target.value })} /></div>
    <div className="campo"><span>Categoría</span><div className="chipera">{cats.map((c) => <button key={c.id} className="chip" aria-pressed={f.categoria === c.nombre} onClick={() => setF({ ...f, categoria: c.nombre })}>{c.emoji} {c.nombre}</button>)}</div></div>
    <form className="or-suma" onSubmit={(e) => { e.preventDefault(); sumarCat(); }}><input type="text" aria-label="Nueva categoría" placeholder="Nueva categoría" value={nueva} onChange={(e) => setNueva(e.target.value)} /><button className="cap-ok" type="submit" aria-label="Sumar categoría"><Icono n="mas" t={22} /></button></form>
    <button className="chip" aria-pressed={f.fijado} onClick={() => setF({ ...f, fijado: !f.fijado })}><Icono n="pin" t={18} />Fijar arriba</button>
    <button className="btn pri" disabled={ocupado} onClick={guardar}>{ocupado ? "Guardando…" : "Guardar"}</button>
  </Hoja>;
}

function ItemVer({ x, foto, cerrar, editar }: { x: any; foto?: string; cerrar: (c?: boolean) => void; editar: () => void }) {
  const { toast } = useSesion();
  async function abrir() {
    const { data } = await sb.storage.from(BUCKET).createSignedUrl(x.archivo, 300);
    if (!data?.signedUrl) return toast("No pude abrir el archivo.");
    const v = window.open(data.signedUrl, "_blank");
    if (v) v.opener = null; else location.assign(data.signedUrl);
  }
  async function borrar() {
    if (x.archivo) { const { error } = await sb.storage.from(BUCKET).remove([x.archivo]); if (error) return toast("No pude borrar el archivo."); }
    const { error } = await sb.from("caja_items").delete().eq("id", x.id);
    if (error) return toast("No pude borrar."); cerrar(true);
  }
  async function fijar() { await sb.from("caja_items").update({ fijado: !x.fijado }).eq("id", x.id); cerrar(true); }
  async function copiar() { try { await navigator.clipboard.writeText(x.cuerpo || ""); toast("Copiado."); } catch { toast("No pude copiar."); } }
  return <Hoja titulo={x.titulo} cerrar={() => cerrar()}>
    <p className="chico">{x.categoria}{x.archivo_nombre ? `, ${x.archivo_nombre}` : ""}</p>
    {x.tipo === "foto" && foto && <img className="cj-grande" src={foto} alt={x.titulo} />}
    {x.cuerpo && <div className="tarjeta"><p className="cj-cuerpo">{x.cuerpo}</p></div>}
    <div className="fila">
      {x.enlace && <a className="btn sec2 chico" href={x.enlace} target="_blank" rel="noopener noreferrer"><Icono n="link" t={20} />Abrir enlace</a>}
      {x.archivo && <button className="btn sec2 chico" onClick={abrir}><Icono n="adjunto" t={20} />Abrir</button>}
      {x.cuerpo && <button className="btn sec2 chico" onClick={copiar}>Copiar</button>}
      <button className="btn sec2 chico" onClick={fijar}><Icono n="pin" t={20} />{x.fijado ? "Desfijar" : "Fijar"}</button>
      <button className="btn sec2 chico" onClick={editar}><Icono n="lapiz" t={20} />Editar</button>
      <button className="btn mal chico" onClick={borrar}><Icono n="papelera" t={20} />Borrar</button>
    </div>
  </Hoja>;
}

function Caja() {
  const [l, setL] = useState<any[]>([]), [cats, setCats] = useState<any[]>([]), [cargado, setCargado] = useState(false), [fotos, setFotos] = useState<Record<string, string>>({});
  const [busca, setBusca] = useState(""), [cat, setCat] = useState(""), [nuevo, setNuevo] = useState(false), [ver, setVer] = useState<any>(null), [ed, setEd] = useState<any>(null);
  const cargar = useCallback(async () => {
    const [a, b] = await Promise.all([sb.from("caja_items").select("*").order("fijado", { ascending: false }).order("creado_en", { ascending: false }).limit(1500), sb.from("caja_categorias").select("*").order("orden")]);
    const items = a.data || [];
    setL(items); setCats(b.data || []); setCargado(true);
    const rutas = items.filter((i: any) => i.tipo === "foto" && i.archivo).slice(0, 80).map((i: any) => i.archivo), s = sb.storage.from(BUCKET);
    if (rutas.length && s.createSignedUrls) {
      const { data } = await s.createSignedUrls(rutas, 3600);
      setFotos(Object.fromEntries((data || []).filter((d: any) => d.signedUrl).map((d: any) => [d.path, d.signedUrl])));
    }
  }, []);
  useEffect(() => { cargar(); addEventListener("sm-caja", cargar); return () => removeEventListener("sm-caja", cargar); }, [cargar]);
  const usadas = useMemo(() => cats.filter((c) => l.some((i) => i.categoria === c.nombre)), [cats, l]);
  const vis = useMemo(() => buscarEnCaja(cat ? l.filter((i) => i.categoria === cat) : l, busca), [l, cat, busca]);
  const cerrarCon = (c?: boolean) => { setVer(null); setEd(null); setNuevo(false); if (c) cargar(); };
  return <div className="pagina pg-caja">
    <div className="ag-cab"><h2 className="titulo">Mi caja</h2><button className="ico-btn ag-mas" style={{ background: "var(--sec-c)", color: "#fff" }} aria-label="Guardar algo nuevo" onClick={() => setNuevo(true)}><Icono n="mas" t={24} /></button></div>
    <div className="or-aviso"><span aria-hidden="true">🔒</span><span><b>Lo que guardás acá solo lo ves vos.</b> No guardes contraseñas ni datos de tarjetas de crédito o débito.</span></div>
    {l.length > 0 && <input type="search" placeholder="Buscar en Mi caja" aria-label="Buscar en Mi caja" value={busca} onChange={(e) => setBusca(e.target.value)} />}
    {usadas.length > 1 && <div className="segs or-segs"><button className="chip" style={{ flex: "none" }} aria-pressed={!cat} onClick={() => setCat("")}>Todo</button>{usadas.map((c) => <button key={c.id} className="chip" style={{ flex: "none" }} aria-pressed={cat === c.nombre} onClick={() => setCat(cat === c.nombre ? "" : c.nombre)}>{c.emoji} {c.nombre}</button>)}</div>}
    {!cargado ? <div className="lista">{[0, 1, 2].map((i) => <div key={i} className="item esq"><i /><span><b /><small /></span></div>)}</div>
      : !l.length ? <Vacio emoji="📦" titulo="Tu caja está vacía" texto="Guardá notas, enlaces, fotos y archivos para tenerlos siempre a mano: el DNI escaneado, la póliza, el contrato del depto."><button className="btn pri" onClick={() => setNuevo(true)}>Guardar lo primero</button></Vacio>
      : !vis.length ? <p className="expl" style={{ textAlign: "center", padding: 18 }}>No encontré nada con eso.</p>
      : <div className="lista">{vis.map((i) => <button key={i.id} className="item" onClick={() => setVer(i)}>
        {i.tipo === "foto" && fotos[i.archivo] ? <img className="cj-foto" src={fotos[i.archivo]} alt="" /> : <span className="ic" aria-hidden="true">{EMOJI[i.tipo]}</span>}
        <span className="q"><b>{i.titulo}</b><small>{[i.categoria, i.tipo === "nota" ? i.cuerpo?.slice(0, 60) : i.tipo === "enlace" ? i.enlace?.replace(/^https?:\/\//, "").slice(0, 40) : i.archivo_nombre].filter(Boolean).join(", ")}</small></span>
        {i.fijado && <span className="cj-pin" role="img" aria-label="Fijado"><Icono n="pin" t={18} /></span>}
      </button>)}</div>}
    {nuevo && <ItemForm cats={cats} cerrar={cerrarCon} />}
    {ver && <ItemVer x={ver} foto={fotos[ver.archivo]} cerrar={cerrarCon} editar={() => { setEd(ver); setVer(null); }} />}
    {ed && <ItemForm x={ed} cats={cats} cerrar={cerrarCon} />}
  </div>;
}
export default function P() { return <Suspense><Caja /></Suspense>; }
