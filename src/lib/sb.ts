import { createClient } from "@supabase/supabase-js";
import { crearDemo } from "./demo";

export const DEMO = process.env.NEXT_PUBLIC_DEMO === "1";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://pendiente.supabase.co";
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "pendiente";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const sb: any = DEMO ? crearDemo() : createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "sm-sesion" } });

export const DOMINIO_CUENTAS = "cuentas.santa-maria.app";
export function normalizarUsuario(t: string) {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
export const correoDe = (usuario: string) => `${normalizarUsuario(usuario)}@${DOMINIO_CUENTAS}`;
