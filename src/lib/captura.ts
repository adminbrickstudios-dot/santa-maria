/* eslint-disable @typescript-eslint/no-explicit-any */
import { sb } from "./sb";

/* Lo liviano de "anotar rápido": lo usa toda la app. La pantalla en sí está en components/Captura y carga aparte. */
export type Modo = "plata" | "agenda" | "auto";
export type DetalleCaptura = { modo: Modo; tipo?: "gasto" | "ingreso"; texto?: string };
export function abrirCaptura(modo: Modo, tipo?: "gasto" | "ingreso", texto?: string) { window.dispatchEvent(new CustomEvent("sm-captura", { detail: { modo, tipo, texto } })); }

/* Si no hay internet, lo guardo acá y lo subo cuando vuelve */
const COLA = "sm-cola";
export function aCola(tabla: string, fila: any) { try { localStorage.setItem(COLA, JSON.stringify([...JSON.parse(localStorage.getItem(COLA) || "[]"), { tabla, fila }])); } catch {} }
export async function vaciarCola() {
  let l: any[] = []; try { l = JSON.parse(localStorage.getItem(COLA) || "[]"); } catch {}
  if (!l.length || !navigator.onLine) return;
  const quedan: any[] = [];
  for (const x of l) { const { error } = await sb.from(x.tabla).insert(x.fila); if (error) quedan.push(x); }
  try { localStorage.setItem(COLA, JSON.stringify(quedan)); } catch {}
  window.dispatchEvent(new Event("sm-plata")); window.dispatchEvent(new Event("sm-agenda"));
}
