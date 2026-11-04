"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from "react";
import { sb } from "@/lib/sb";
import { useSesion } from "@/lib/sesion";
import { Hoja } from "@/components/Hoja";
import { Icono } from "@/components/Icono";

export function ResumenForm({ eventoId, materia, r, cerrar }: { eventoId?: number; materia?: string; r?: any; cerrar: () => void }) {
  const { perfil, toast } = useSesion();
  const [f, setF] = useState<any>(r || { titulo: "", materia: materia || "", cuerpo: "", enlace: "", compartido: false });
  const [arch, setArch] = useState<File | null>(null), [enviando, setE] = useState(false);
  async function guardar() {
    if (!f.titulo.trim()) return toast("Ponele un título.");
    if (f.enlace && !/^https?:\/\//i.test(f.enlace)) return toast("El enlace tiene que empezar con https://");
    setE(true);
    let archivo = f.archivo || null;
    if (arch) {
      if (arch.size > 25e6) { setE(false); return toast("El archivo pesa más de 25 MB."); }
      const nombre = `${perfil.id}/${Date.now()}-${arch.name.replace(/[^\w.-]/g, "_")}`;
      const { error } = await sb.storage.from("resumenes").upload(nombre, arch);
      if (error) { setE(false); return toast("No se pudo subir el archivo."); }
      archivo = nombre;
    }
    const fila = { perfil_id: perfil.id, grupo_id: perfil.grupo_id, evento_id: eventoId ?? f.evento_id ?? null, titulo: f.titulo.trim(), materia: f.materia || null, cuerpo: f.cuerpo || null, enlace: f.enlace || null, archivo, compartido: f.compartido };
    const { error } = r ? await sb.from("resumenes").update(fila).eq("id", r.id) : await sb.from("resumenes").insert(fila);
    setE(false);
    if (error) return toast("No se pudo guardar.");
    cerrar();
  }
  return <Hoja titulo={r ? "Editar resumen" : "Nuevo resumen"} cerrar={cerrar}>
    <div className="campo"><label htmlFor="rf-t">Título</label><input id="rf-t" type="text" value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} /></div>
    <div className="campo"><label htmlFor="rf-m">Materia</label><input id="rf-m" type="text" value={f.materia || ""} onChange={(e) => setF({ ...f, materia: e.target.value })} /></div>
    <div className="campo"><label htmlFor="rf-c">Resumen</label><textarea id="rf-c" style={{ minHeight: 150 }} value={f.cuerpo || ""} onChange={(e) => setF({ ...f, cuerpo: e.target.value })} /></div>
    <div className="campo"><label htmlFor="rf-e">Enlace</label><input id="rf-e" type="url" value={f.enlace || ""} onChange={(e) => setF({ ...f, enlace: e.target.value })} placeholder="https://" /></div>
    <div className="campo"><label htmlFor="rf-a">Archivo (PDF, foto o Word)</label><input id="rf-a" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,image/*" onChange={(e) => setArch(e.target.files?.[0] || null)} /></div>
    <button className="chip" aria-pressed={f.compartido} onClick={() => setF({ ...f, compartido: !f.compartido })}>Compartir con el grupo</button>
    <button className="btn pri" disabled={enviando} onClick={guardar}>{enviando ? "Guardando…" : "Guardar"}</button>
  </Hoja>;
}
export function ResumenFila({ r, cambio }: { r: any; cambio: () => void }) {
  const { perfil, personas } = useSesion();
  const [ver, setVer] = useState(false), [editar, setEditar] = useState(false);
  const mio = r.perfil_id === perfil.id, autor = personas.find((p: any) => p.id === r.perfil_id);
  async function abrir() { const { data } = await sb.storage.from("resumenes").createSignedUrl(r.archivo, 300); if (data?.signedUrl) window.open(data.signedUrl, "_blank"); }
  async function borrar() { if (r.archivo) await sb.storage.from("resumenes").remove([r.archivo]); await sb.from("resumenes").delete().eq("id", r.id); setVer(false); cambio(); }
  return <>
    <button className="item" onClick={() => setVer(true)}><span className="ic">📄</span><span className="q"><b>{r.titulo}</b><small>{[r.materia, !mio && autor?.nombre, r.compartido && mio && "Compartido"].filter(Boolean).join(", ")}</small></span><Icono n="chevron" t={18} /></button>
    {ver && <Hoja titulo={r.titulo} cerrar={() => setVer(false)}>
      {r.cuerpo && <div className="tarjeta"><p style={{ whiteSpace: "pre-wrap" }}>{r.cuerpo}</p></div>}
      <div className="fila">
        {r.enlace && <a className="btn sec2 chico" href={r.enlace} target="_blank" rel="noopener noreferrer"><Icono n="link" t={20} />Abrir enlace</a>}
        {r.archivo && <button className="btn sec2 chico" onClick={abrir}><Icono n="adjunto" t={20} />Abrir archivo</button>}
        {mio && <button className="btn sec2 chico" onClick={() => setEditar(true)}><Icono n="lapiz" t={20} />Editar</button>}
        {mio && <button className="btn mal chico" onClick={borrar}><Icono n="papelera" t={20} />Borrar</button>}
      </div>
    </Hoja>}
    {editar && <ResumenForm r={r} cerrar={() => { setEditar(false); setVer(false); cambio(); }} />}
  </>;
}
export function Resumenes() {
  const [l, setL] = useState<any[]>([]), [n, setN] = useState(false), [f, setF] = useState("");
  const cargar = useCallback(async () => { const { data } = await sb.from("resumenes").select("*").order("creado_en", { ascending: false }).limit(200); setL(data || []); }, []);
  useEffect(() => { cargar(); }, [cargar]);
  const mats = [...new Set(l.map((x) => x.materia).filter(Boolean))], vis = f ? l.filter((x) => x.materia === f) : l;
  return <>
    <button className="btn pri" onClick={() => setN(true)}><Icono n="mas" />Nuevo resumen</button>
    {mats.length > 1 && <div className="segs"><button className="seg" aria-selected={!f} onClick={() => setF("")}>Todos</button>{mats.map((m) => <button key={m} className="seg" aria-selected={f === m} onClick={() => setF(m)}>{m}</button>)}</div>}
    {vis.length ? <div className="lista">{vis.map((x) => <ResumenFila key={x.id} r={x} cambio={cargar} />)}</div> : <p className="expl" style={{ textAlign: "center", padding: 18 }}>Guardá acá tus resúmenes. Si los compartís, los ve tu grupo.</p>}
    {n && <ResumenForm cerrar={() => { setN(false); cargar(); }} />}
  </>;
}
