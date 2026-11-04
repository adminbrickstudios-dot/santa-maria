/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";

const URL_CLIMA = "https://api.open-meteo.com/v1/forecast?latitude=-34.6&longitude=-58.42&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day&hourly=temperature_2m,precipitation_probability,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max&timezone=America%2FArgentina%2FBuenos_Aires&forecast_days=8";
export type Cielo = "sol" | "noche" | "nubes" | "lluvia" | "tormenta" | "niebla";
export const NOMBRE: Record<number, string> = { 0: "Despejado", 1: "Casi despejado", 2: "Algo nublado", 3: "Nublado", 45: "Niebla", 48: "Niebla", 51: "Llovizna", 53: "Llovizna", 55: "Llovizna", 61: "Lluvia", 63: "Lluvia", 65: "Lluvia fuerte", 80: "Chaparrones", 81: "Chaparrones", 82: "Chaparrones fuertes", 95: "Tormenta", 96: "Tormenta", 99: "Tormenta" };
export function cieloDe(cod: number, dia = 1): Cielo {
  if (cod >= 95) return "tormenta";
  if (cod >= 51) return "lluvia";
  if (cod >= 45) return "niebla";
  if (cod >= 2) return "nubes";
  return dia ? "sol" : "noche";
}
export const FONDO: Record<Cielo, { b: string; s: string; c: string }> = {
  sol: { b: "linear-gradient(135deg,#FFC24A,#FF8A3D)", s: "#FF8A3D", c: "linear-gradient(180deg,#2D8CFF,#7CC8FF)" },
  noche: { b: "linear-gradient(135deg,#34407A,#141B3D)", s: "#141B3D", c: "linear-gradient(180deg,#0B1236,#2B3573)" },
  nubes: { b: "linear-gradient(135deg,#9FB2C8,#6C829C)", s: "#6C829C", c: "linear-gradient(180deg,#667C96,#A9BBCF)" },
  lluvia: { b: "linear-gradient(135deg,#4F86C6,#2C5A99)", s: "#2C5A99", c: "linear-gradient(180deg,#2F4C73,#5F86B0)" },
  tormenta: { b: "linear-gradient(135deg,#5B4B8A,#2B2350)", s: "#2B2350", c: "linear-gradient(180deg,#221C42,#4F4380)" },
  niebla: { b: "linear-gradient(135deg,#B5BDC6,#8A949F)", s: "#8A949F", c: "linear-gradient(180deg,#8D97A3,#C3CAD2)" },
};
let memo: { t: number; d: any } | null = null;
export function useClima() {
  const [d, setD] = useState<any>(memo?.d || null);
  useEffect(() => {
    if (memo && Date.now() - memo.t < 15 * 60e3) return;
    try { const c = JSON.parse(sessionStorage.getItem("sm-clima") || "null"); if (c && Date.now() - c.t < 15 * 60e3) { memo = c; setD(c.d); return; } } catch {}
    fetch(URL_CLIMA).then((r) => r.json()).then((x) => { if (!x?.current) return; memo = { t: Date.now(), d: x }; setD(x); try { sessionStorage.setItem("sm-clima", JSON.stringify(memo)); } catch {} }).catch(() => {});
  }, []);
  return d;
}
