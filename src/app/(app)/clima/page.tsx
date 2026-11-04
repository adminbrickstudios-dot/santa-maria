"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { IconoCielo } from "@/components/Animados";
import { cieloDe, FONDO, NOMBRE, useClima } from "@/lib/clima";

const DIA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
function Fondo({ c }: { c: string }) {
  return <div className="cl-capa" aria-hidden="true">
    {(c === "sol") && <i className="cl-sol" />}
    {(c === "nubes" || c === "lluvia" || c === "tormenta") && [0, 1, 2].map((i) => <i key={i} className="cl-nube" style={{ top: 50 + i * 54, animationDelay: `${-i * 9}s` }} />)}
    {(c === "lluvia" || c === "tormenta") && [...Array(26)].map((_, i) => <i key={i} className="cl-gota" style={{ left: `${(i * 37) % 100}%`, animationDelay: `${-(i * .13)}s`, animationDuration: `${.55 + (i % 4) * .08}s` }} />)}
  </div>;
}
function consejo(w: any) {
  const ll = w.daily.precipitation_probability_max[0], max = w.daily.temperature_2m_max[0], min = w.daily.temperature_2m_min[0];
  if (ll >= 60) return `Llevá paraguas: ${ll}% de lluvia hoy.`;
  if (ll >= 35) return `Puede llover (${ll}%). Mejor llevar algo.`;
  if (max - min >= 11) return `Mucha diferencia entre ${Math.round(min)}° y ${Math.round(max)}°: salí con abrigo liviano.`;
  if (max >= 30) return "Va a hacer calor: llevá agua.";
  if (max <= 12) return "Día frío: abrigate bien.";
  return "Día tranquilo para andar por la calle.";
}
export default function Clima() {
  const w = useClima();
  if (!w) return <div className="pagina"><h2 className="titulo">Clima</h2><p className="expl">Cargando el pronóstico…</p></div>;
  const c = cieloDe(w.current.weather_code, w.current.is_day);
  const ahora = w.current.time.slice(0, 13), i0 = Math.max(0, w.hourly.time.findIndex((t: string) => t.startsWith(ahora)));
  const horas = w.hourly.time.slice(i0, i0 + 25).map((t: string, k: number) => ({ h: k === 0 ? "Ahora" : `${t.slice(11, 13)}h`, tmp: w.hourly.temperature_2m[i0 + k], ll: w.hourly.precipitation_probability[i0 + k], c: cieloDe(w.hourly.weather_code[i0 + k], w.hourly.is_day[i0 + k]) }));
  const minS = Math.min(...w.daily.temperature_2m_min), maxS = Math.max(...w.daily.temperature_2m_max), r = Math.max(1, maxS - minS);
  const hh = (s: string) => s.slice(11, 16);
  return <div className="pagina">
    <div className="cl-cielo" style={{ "--c-cielo": FONDO[c].c } as React.CSSProperties}>
      <Fondo c={c} />
      <div style={{ position: "relative" }}>
        <p>Buenos Aires</p>
        <h2>{Math.round(w.current.temperature_2m)}°</h2>
        <p>{NOMBRE[w.current.weather_code] || "Variable"}</p>
        <p style={{ fontWeight: 600, fontSize: 16 }}>Máxima {Math.round(w.daily.temperature_2m_max[0])}°, mínima {Math.round(w.daily.temperature_2m_min[0])}°</p>
      </div>
    </div>
    <div className="tarjeta"><b>{consejo(w)}</b></div>
    <div className="lista"><div className="cl-horas">{horas.map((x: any, k: number) => <div key={k} className="cl-h"><span>{x.h}</span><small>{x.ll >= 20 ? `${x.ll}%` : ""}</small><span style={{ color: x.c === "sol" ? "#FFB400" : "var(--azul)", filter: "saturate(1.2)" }}><IconoHora c={x.c} /></span><b>{Math.round(x.tmp)}°</b></div>)}</div></div>
    <div className="lista">{w.daily.time.slice(0, 8).map((d: string, k: number) => {
      const mn = w.daily.temperature_2m_min[k], mx = w.daily.temperature_2m_max[k], ll = w.daily.precipitation_probability_max[k];
      return <div key={d} className="cl-dia"><span>{k === 0 ? "Hoy" : DIA[new Date(d + "T12:00").getDay()]}</span><IconoHora c={cieloDe(w.daily.weather_code[k])} /><small style={{ color: "var(--azul)", fontWeight: 800 }}>{ll >= 20 ? `${ll}%` : ""}</small><span className="cl-barra"><i style={{ left: `${((mn - minS) / r) * 100}%`, right: `${((maxS - mx) / r) * 100}%` }} /></span><span><span className="mm">{Math.round(mn)}°</span> {Math.round(mx)}°</span></div>;
    })}</div>
    <div className="dos">
      <div className="mini"><span className="et">Sensación</span><b>{Math.round(w.current.apparent_temperature)}°</b></div>
      <div className="mini"><span className="et">Humedad</span><b>{w.current.relative_humidity_2m}%</b></div>
      <div className="mini"><span className="et">Viento</span><b>{Math.round(w.current.wind_speed_10m)} km/h</b></div>
      <div className="mini"><span className="et">Índice UV</span><b>{Math.round(w.daily.uv_index_max[0])}</b><small>{w.daily.uv_index_max[0] >= 6 ? "Usá protector" : "Bajo a moderado"}</small></div>
      <div className="mini"><span className="et">Amanece</span><b>{hh(w.daily.sunrise[0])}</b></div>
      <div className="mini"><span className="et">Atardece</span><b>{hh(w.daily.sunset[0])}</b></div>
    </div>
    <p className="chico">Datos de Open-Meteo.</p>
  </div>;
}
function IconoHora({ c }: { c: any }) {
  const fondo = c === "sol" || c === "noche" ? "transparent" : "#7F93AD";
  return <span style={{ display: "inline-grid", width: 30, height: 30, borderRadius: 15, background: fondo, placeItems: "center", color: "inherit" }}><span style={{ width: 26, height: 26, filter: c === "sol" ? "saturate(2) brightness(.92)" : undefined }}><IconoCielo c={c} /></span></span>;
}
