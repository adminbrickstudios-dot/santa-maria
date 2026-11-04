"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { sb } from "@/lib/sb";
import { Avatar } from "@/components/Avatar";
import { activarPush, esIOS, estaInstalada } from "@/lib/push";

export default function Bienvenida() {
  const r = useRouter();
  const [p, setP] = useState<any>(null), [paso, setPaso] = useState(0), [us, setU] = useState<any[]>([]), [dir, setDir] = useState(""), [err, setErr] = useState("");
  useEffect(() => {
    (async () => {
      const { data: s } = await sb.auth.getSession();
      if (!s?.session) { r.replace("/entrar"); return; }
      const { data } = await sb.from("perfiles").select("*").eq("id", s.session.user.id).single();
      setP(data);
      const u = await sb.from("universidades").select("id,nombre").order("nombre"); setU(u.data || []);
    })();
  }, [r]);
  if (!p) return <div className="cargando"><span className="sello">Santa María</span></div>;
  const set = (k: string) => (e: any) => setP({ ...p, [k]: e.target.value });
  async function casa() {
    setErr("");
    if (!dir.trim()) { setPaso(2); return; }
    const m = await import("@/lib/mapa/vista"); await m.cargarDatosMapa();
    const g = m.geocodificar(dir)[0];
    if (!g) { setErr("No la encontré. Probá calle y altura, por ejemplo Juncal 1500."); return; }
    setP({ ...p, casa_lat: m.alat(g.y), casa_lon: m.alon(g.x), casa_barrio: m.barrioDe(g.x, g.y) }); setPaso(2);
  }
  async function fin(activar: boolean) {
    await sb.from("perfiles").update({ nombre: p.nombre, ciudad_origen: p.ciudad_origen, universidad_id: p.universidad_id || null, carrera_texto: p.carrera_texto, anio_cursada: p.anio_cursada || null, casa_lat: p.casa_lat, casa_lon: p.casa_lon, casa_barrio: p.casa_barrio, onboarding_hecho: true }).eq("id", p.id);
    if (activar) await activarPush(p.id);
    r.replace(esIOS() && !estaInstalada() ? "/instalar" : "/inicio");
  }
  return <div className="portada" style={{ justifyContent: "center" }}>
    <div className="portada-cu" style={{ zIndex: 2 }}>
      {paso === 0 && <><Avatar p={p} t={72} /><h1 className="marca-p" style={{ fontSize: 60 }}>Hola, {p.nombre.split(" ")[0]}</h1><p className="lema">Dos o tres datos y queda todo armado para vos.</p>
        <div className="campo"><label htmlFor="n">Cómo te llamamos</label><input id="n" type="text" value={p.nombre} onChange={set("nombre")} /></div>
        <div className="campo"><label htmlFor="o">De dónde sos</label><input id="o" type="text" placeholder="Ej: Salta" value={p.ciudad_origen || ""} onChange={set("ciudad_origen")} /></div>
        <button className="btn pri" onClick={() => setPaso(1)}>Seguir</button></>}
      {paso === 1 && <><h1 className="marca-p" style={{ fontSize: 56 }}>¿Dónde vivís?</h1><p className="lema">{p.casa_lat != null ? `Ya te tenemos en ${p.casa_barrio}. Si te mudaste, poné la nueva dirección.` : "Con tu dirección el mapa calcula todo desde tu casa."}</p>
        <div className="campo"><label htmlFor="d">Dirección o esquina</label><input id="d" type="text" placeholder="Ej: Juncal 1500" value={dir} onChange={(e) => setDir(e.target.value)} /></div>
        {err && <p className="error">{err}</p>}
        <button className="btn pri" onClick={casa}>{dir.trim() ? "Guardar y seguir" : "Seguir"}</button></>}
      {paso === 2 && <><h1 className="marca-p" style={{ fontSize: 56 }}>¿Qué estudiás?</h1>
        <div className="campo"><label htmlFor="u">Universidad</label><select id="u" style={{ background: "#1D2125", color: "#fff", borderColor: "#3A4147" }} value={p.universidad_id || ""} onChange={set("universidad_id")}><option value="">Elegí</option>{us.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select></div>
        <div className="campo"><label htmlFor="c">Carrera</label><input id="c" type="text" value={p.carrera_texto || ""} onChange={set("carrera_texto")} /></div>
        <button className="btn pri" onClick={() => setPaso(3)}>Seguir</button><button className="enl" onClick={() => setPaso(3)}>Todavía no sé</button></>}
      {paso === 3 && <><h1 className="marca-p" style={{ fontSize: 56 }}>Que no se te pase nada</h1><p className="lema">Activá las notificaciones para enterarte de mensajes y juntadas aunque tengas la app cerrada.</p>
        <button className="btn pri" onClick={() => fin(true)}>Activar notificaciones</button><button className="enl" onClick={() => fin(false)}>Ahora no</button></>}
    </div>
  </div>;
}
