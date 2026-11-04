import { createClient } from "@supabase/supabase-js";

/* Trae un calendario de Google, Apple u Outlook que la persona conectó. Solo esos sitios. */
const PERMITIDOS = /(^|\.)(google\.com|icloud\.com|office365\.com|outlook\.com|live\.com)$/i;
const MAX_ICS = 4e6;
/* Corta apenas pasa el tope: no confía en lo que dice el servidor de afuera */
async function leerConTope(r: Response) {
  const rd = r.body?.getReader();
  if (!rd) return null;
  const dec = new TextDecoder();
  let txt = "", n = 0;
  for (;;) {
    const { done, value } = await rd.read();
    if (done) return txt + dec.decode();
    n += value.length;
    if (n > MAX_ICS) { await rd.cancel(); return null; }
    txt += dec.decode(value, { stream: true });
  }
}
export async function GET(req: Request) {
  const t = (req.headers.get("authorization") || "").replace(/^Bearer /, ""), id = new URL(req.url).searchParams.get("id");
  if (!t || !id) return new Response("No", { status: 401 });
  if (!/^\d{1,18}$/.test(id)) return new Response("No existe", { status: 404 });
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${t}` } } });
  const { data: cupo, error: e } = await sb.rpc("consumir_cupo", { p_accion: "cal", p_por_minuto: 30, p_por_dia: 600 });
  if (e) return new Response("No", { status: 401 });
  if (!cupo) return new Response("Muchos pedidos seguidos", { status: 429, headers: { "Retry-After": "60" } });
  const { data } = await sb.from("calendarios_externos").select("url").eq("id", id).maybeSingle();
  if (!data) return new Response("No existe", { status: 404 });
  let url: URL;
  try { url = new URL(data.url.replace(/^webcal:/i, "https:")); } catch { return new Response("Ese calendario no se puede conectar.", { status: 400 }); }
  if (url.protocol !== "https:" || !PERMITIDOS.test(url.hostname)) return new Response("Ese calendario no se puede conectar.", { status: 400 });
  const r = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(9000) }).catch(() => null);
  if (!r?.ok) return new Response("No pude leerlo", { status: 502 });
  if (Number(r.headers.get("content-length") || 0) > MAX_ICS) return new Response("Es muy grande", { status: 413 });
  const txt = await leerConTope(r).catch(() => null);
  if (!txt?.includes("BEGIN:VCALENDAR")) return new Response("No es un calendario", { status: 400 });
  return new Response(txt, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, max-age=900" } });
}
