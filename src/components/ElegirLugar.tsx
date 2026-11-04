"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "maplibre-gl/dist/maplibre-gl.css";
import { Icono } from "./Icono";

export type Lugar = { lat: number; lon: number; nombre: string; barrio: string };
const BA = { lat: -34.6037, lon: -58.3816 };
const oscuro = () => { const t = document.documentElement.getAttribute("data-theme"); return t === "dark" || (!t && matchMedia("(prefers-color-scheme:dark)").matches); };

/* Mapa con un pin fijo en el medio: movés el mapa y soltás donde querés */
export function ElegirLugar({ titulo, inicial, boton = "Usar esta ubicación", listo, cerrar }: { titulo: string; inicial?: { lat?: number | null; lon?: number | null }; boton?: string; listo: (l: Lugar) => void; cerrar: () => void }) {
  const caja = useRef<HTMLDivElement>(null), mapa = useRef<any>(null), mot = useRef<any>(null);
  const [q, setQ] = useState(""), [res, setRes] = useState<any[]>([]), [mueve, setMueve] = useState(false), [sat, setSat] = useState(false);
  const [lugar, setLugar] = useState<Lugar | null>(null), [cargando, setCargando] = useState(true), [gps, setGps] = useState(false);
  useEffect(() => {
    let vivo = true;
    (async () => {
      const ml = (await import("maplibre-gl")).default, m = await import("@/lib/mapa/vista");
      await m.cargarDatosMapa();
      if (!vivo || !caja.current) return;
      mot.current = m;
      const c = inicial?.lat != null ? { lat: inicial.lat, lon: inicial.lon! } : BA;
      const map = new ml.Map({ container: caja.current, style: `https://tiles.openfreemap.org/styles/${oscuro() ? "dark" : "liberty"}`, center: [c.lon, c.lat], zoom: inicial?.lat != null ? 15.5 : 12.5, minZoom: 9, maxZoom: 19, maxBounds: [[-59.3, -35.25], [-57.6, -34]], attributionControl: false, dragRotate: false, pitchWithRotate: false });
      map.addControl(new ml.AttributionControl({ compact: true }), "bottom-left");
      map.touchZoomRotate.disableRotation(); map.touchPitch.disable();
      mapa.current = map;
      const leer = () => { const k = map.getCenter(), x = m.wx(k.lng), y = m.wy(k.lat); setLugar({ lat: k.lat, lon: k.lng, nombre: m.esquinaDe(x, y) || "Este punto", barrio: m.barrioDe(x, y) || "" }); };
      map.on("movestart", () => setMueve(true));
      map.on("moveend", () => { setMueve(false); leer(); });
      map.once("load", () => setCargando(false));
      setTimeout(() => setCargando(false), 2500);
      leer();
    })().catch(() => setCargando(false));
    return () => { vivo = false; mapa.current?.remove(); mapa.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const m = mot.current, t = q.trim();
    setRes(m && t.length > 2 ? m.geocodificar(t).slice(0, 4) : []);
  }, [q]);
  function ir(lat: number, lon: number, z = 16.5) { mapa.current?.easeTo({ center: [lon, lat], zoom: z, duration: 600 }); }
  function usarGps() {
    if (!navigator.geolocation) return;
    setGps(true);
    navigator.geolocation.getCurrentPosition((p) => { setGps(false); ir(p.coords.latitude, p.coords.longitude); }, () => setGps(false), { enableHighAccuracy: true, timeout: 9000 });
  }
  function satelite() {
    const m = mapa.current; if (!m) return;
    const v = !sat; setSat(v);
    m.setStyle(v ? { version: 8, sources: { s: { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, maxzoom: 19, attribution: "Imágenes de Esri" } }, layers: [{ id: "s", type: "raster", source: "s" }] } : `https://tiles.openfreemap.org/styles/${oscuro() ? "dark" : "liberty"}`);
  }
  return createPortal(<div className="el-fondo" role="dialog" aria-modal="true" aria-label={titulo}>
    <div ref={caja} className="el-mapa" />
    <span className={`el-pin ${mueve ? "alza" : ""}`} aria-hidden="true"><Icono n="pin" t={46} g={2} /></span><i className={`el-punto ${mueve ? "alza" : ""}`} aria-hidden="true" />
    <div className="el-arriba">
      <button className="el-x" onClick={cerrar} aria-label="Cerrar"><Icono n="x" t={22} /></button>
      <div className="el-busca"><Icono n="lupa" t={18} /><input type="search" placeholder="Buscar calle y altura" aria-label="Buscar dirección" value={q} onChange={(e) => setQ(e.target.value)} /></div>
    </div>
    {res.length > 0 && <div className="el-res">{res.map((r, i) => <button key={i} onClick={() => { const m = mot.current; ir(m.alat(r.y), m.alon(r.x)); setRes([]); setQ(""); }}><b>{r.nombre}</b>{r.sub && <small>{r.sub}</small>}</button>)}</div>}
    <div className="el-lado">
      <button onClick={satelite} aria-pressed={sat}>{sat ? "Mapa" : "Satélite"}</button>
      <button onClick={usarGps} aria-label="Ir a donde estoy" disabled={gps}><Icono n="brujula" t={21} /></button>
    </div>
    <div className="el-abajo">
      <small>{titulo}</small>
      <b>{mueve ? "Soltá donde quieras" : cargando ? "Cargando el mapa…" : lugar?.nombre || "Mové el mapa"}</b>
      {!mueve && lugar?.barrio && <small>{lugar.barrio}</small>}
      <button className="btn pri" disabled={!lugar || mueve} onClick={() => lugar && listo(lugar)}>{boton}</button>
    </div>
  </div>, document.body);
}
