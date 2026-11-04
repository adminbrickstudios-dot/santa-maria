"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { sb } from "@/lib/sb";
import { Avatar } from "@/components/Avatar";
import { Cargando } from "@/components/Cargando";
import { Pasos } from "@/components/Cuatro";
import { activarPush, esIOS, estaInstalada } from "@/lib/push";
import dynamic from "next/dynamic";
const ElegirLugar = dynamic(() => import("@/components/ElegirLugar").then((m) => m.ElegirLugar), { ssr: false });

export default function Bienvenida() {
  const r = useRouter();
  const [p, setP] = useState<any>(null), [paso, setPaso] = useState(0), [us, setU] = useState<any[]>([]), [mapa, setMapa] = useState(false);
  useEffect(() => {
    (async () => {
      const { data: s } = await sb.auth.getSession();
      if (!s?.session) { r.replace("/entrar"); return; }
      const { data } = await sb.from("perfiles").select("*").eq("id", s.session.user.id).single();
      setP(data);
      const u = await sb.from("universidades").select("id,nombre").order("nombre"); setU(u.data || []);
    })();
  }, [r]);
  if (!p) return <Cargando />;
  const set = (k: string) => (e: any) => setP({ ...p, [k]: e.target.value });
  async function fin(activar: boolean) {
    await sb.from("perfiles").update({ nombre: p.nombre, ciudad_origen: p.ciudad_origen, universidad_id: p.universidad_id || null, carrera_texto: p.carrera_texto, anio_cursada: p.anio_cursada || null, casa_lat: p.casa_lat, casa_lon: p.casa_lon, casa_barrio: p.casa_barrio, onboarding_hecho: true }).eq("id", p.id);
    if (activar) await activarPush(p.id);
    r.replace(esIOS() && !estaInstalada() ? "/instalar" : "/inicio");
  }
  return <div className="portada fa-bien">
    <div className="portada-cu">
      <Pasos paso={paso} />
      {paso === 0 && <><Avatar p={p} t={72} /><h1 className="fa-tit">Hola, {p.nombre.split(" ")[0]}</h1><p className="lema">Dos o tres datos y queda todo armado para vos.</p>
        <div className="campo"><label htmlFor="n">Cómo te llamamos</label><input id="n" type="text" value={p.nombre} onChange={set("nombre")} /></div>
        <div className="campo"><label htmlFor="o">De dónde sos</label><input id="o" type="text" placeholder="Ej: Salta" value={p.ciudad_origen || ""} onChange={set("ciudad_origen")} /></div>
        <button className="btn pri" onClick={() => setPaso(1)}>Seguir</button></>}
      {paso === 1 && <><h1 className="fa-tit">¿Dónde vivís?</h1><p className="lema">{p.casa_lat != null ? `Quedó en ${p.casa_nombre || p.casa_barrio || "el mapa"}.` : "Marcalo en el mapa y las rutas salen desde tu casa."}</p>
        <button className="btn pri" onClick={() => setMapa(true)}>{p.casa_lat != null ? "Cambiar en el mapa" : "Elegir en el mapa"}</button>
        <button className={p.casa_lat != null ? "btn pri" : "enl"} onClick={() => setPaso(2)}>{p.casa_lat != null ? "Seguir" : "Ahora no"}</button>
        {mapa && <ElegirLugar titulo="Tu casa" inicial={{ lat: p.casa_lat, lon: p.casa_lon }} boton="Vivo acá" cerrar={() => setMapa(false)} listo={(l) => { setP({ ...p, casa_lat: l.lat, casa_lon: l.lon, casa_barrio: l.barrio, casa_nombre: l.nombre }); setMapa(false); }} />}</>}
      {paso === 2 && <><h1 className="fa-tit">¿Qué estudiás?</h1>
        <div className="campo"><label htmlFor="u">Universidad</label><select id="u" value={p.universidad_id || ""} onChange={set("universidad_id")}><option value="">Elegí</option>{us.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select></div>
        <div className="campo"><label htmlFor="c">Carrera</label><input id="c" type="text" value={p.carrera_texto || ""} onChange={set("carrera_texto")} /></div>
        <button className="btn pri" onClick={() => setPaso(3)}>Seguir</button><button className="enl" onClick={() => setPaso(3)}>Todavía no sé</button></>}
      {paso === 3 && <><h1 className="fa-tit">Que no se te pase nada</h1><p className="lema">Activá las notificaciones para enterarte de mensajes y juntadas aunque tengas la app cerrada.</p>
        <button className="btn pri" onClick={() => fin(true)}>Activar notificaciones</button><button className="enl" onClick={() => fin(false)}>Ahora no</button></>}
    </div>
  </div>;
}
