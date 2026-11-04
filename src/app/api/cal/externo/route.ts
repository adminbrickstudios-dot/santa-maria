import { createClient } from "@supabase/supabase-js";

/* Trae un calendario de Google, Apple u Outlook que la persona conectó. Solo esos sitios. */
const PERMITIDOS = /(^|\.)(google\.com|icloud\.com|office365\.com|outlook\.com|live\.com)$/i;
export async function GET(req: Request) {
  const t = (req.headers.get("authorization") || "").replace(/^Bearer /, ""), id = new URL(req.url).searchParams.get("id");
  if (!t || !id) return new Response("No", { status: 401 });
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${t}` } } });
  const { data } = await sb.from("calendarios_externos").select("url").eq("id", id).maybeSingle();
  if (!data) return new Response("No existe", { status: 404 });
  const url = new URL(data.url.replace(/^webcal:/i, "https:"));
  if (url.protocol !== "https:" || !PERMITIDOS.test(url.hostname)) return new Response("Ese calendario no se puede conectar.", { status: 400 });
  const r = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(9000) }).catch(() => null);
  if (!r?.ok) return new Response("No pude leerlo", { status: 502 });
  const txt = await r.text();
  if (!txt.includes("BEGIN:VCALENDAR") || txt.length > 4e6) return new Response("No es un calendario", { status: 400 });
  return new Response(txt, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, max-age=900" } });
}
