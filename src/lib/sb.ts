import { createClient } from "@supabase/supabase-js";
import { crearDemo } from "./demo";

export const DEMO = process.env.NEXT_PUBLIC_DEMO === "1";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://pendiente.supabase.co";
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "pendiente";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const sb: any = DEMO ? crearDemo() : createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "sm-sesion" } });

/* PostgREST corta en 1.000 filas aunque se pida más: esto trae de a páginas hasta el tope.
   armar(desde, hasta) tiene que devolver la consulta con un orden fijo y .range(desde, hasta). */
export async function traerTodo(armar: (desde: number, hasta: number) => any, tope = 5000) {
  const r: any[] = [];
  for (let i = 0; i < tope; i += 1000) {
    const { data, error } = await armar(i, i + 999);
    if (error || !data) break;
    r.push(...data);
    if (data.length < 1000) break;
  }
  return r.slice(0, tope);
}

export const DOMINIO_CUENTAS = "cuentas.santa-maria.app";
export function normalizarUsuario(t: string) {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
export const correoDe = (usuario: string) => `${normalizarUsuario(usuario)}@${DOMINIO_CUENTAS}`;
