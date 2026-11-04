import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const maxDuration = 30;

/* Audio → texto (OPENAI_API_KEY o GROQ_API_KEY) y texto → datos (ANTHROPIC_API_KEY). Las claves van en Vercel. */
/* Vercel corta los pedidos de más de 4,5 MB antes de llegar acá */
const MAX_AUDIO = 4e6, MAX_PEDIDO = 4.4e6, POR_MINUTO = 10, POR_DIA = 80;

/* El cupo vive en la base: en memoria se reparte entre instancias y no frena a nadie.
   Con un token inválido la base no reconoce a nadie y devuelve false. */
async function cupo(token: string): Promise<"ok" | "sesion" | "pasado"> {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data, error } = await sb.rpc("consumir_cupo", { p_accion: "voz", p_por_minuto: POR_MINUTO, p_por_dia: POR_DIA });
  if (error) return "sesion";
  return data ? "ok" : "pasado";
}
async function fallo(mensaje: string) {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  await sb.rpc("registrar_error", { p_origen: "api/voz", p_codigo: "", p_mensaje: mensaje, p_ruta: "/api/voz" });
}
async function transcribir(audio: File) {
  const groq = process.env.GROQ_API_KEY, oa = process.env.OPENAI_API_KEY;
  if (!groq && !oa) return null;
  const f = new FormData();
  f.append("file", audio, "audio.webm"); f.append("language", "es");
  f.append("model", groq ? "whisper-large-v3" : "whisper-1");
  const r = await fetch(groq ? "https://api.groq.com/openai/v1/audio/transcriptions" : "https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${groq || oa}` }, body: f, signal: AbortSignal.timeout(15000) }).catch(() => null);
  if (!r?.ok) { await fallo(`Transcribir: ${r?.status ?? "tiempo agotado"}`); return null; }
  return (await r.json()).text as string;
}
const GUIA: Record<string, string> = {
  plata: `Devolvé solo un JSON {"tipo":"gasto"|"ingreso","monto":número en pesos,"categoria":una de las categorías dadas,"nota":texto corto,"fecha":"AAAA-MM-DD"}. "5 lucas" o "5 mil" son 5000.`,
  agenda: `Devolvé solo un JSON {"titulo":texto corto,"tipo":"parcial"|"final"|"tp"|"entrega"|"clase"|"estudio"|"juntada"|"tramite"|"vencimiento"|"personal","fecha":"AAAA-MM-DD","hora":"HH:MM" o null,"lugar":texto o ""}. El titulo no repite la fecha ni la hora.`,
};
async function pensar(texto: string, modo: string, hoy: string, cats: string) {
  const k = process.env.ANTHROPIC_API_KEY;
  if (!k) return null;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": k, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: process.env.IA_MODELO || "claude-haiku-5-5", max_tokens: 300, system: `Interpretás notas de un estudiante argentino. Hoy es ${hoy} en Buenos Aires. ${GUIA[modo]}${cats ? ` Categorías: ${cats}.` : ""}`, messages: [{ role: "user", content: texto.slice(0, 600) }] }),
    signal: AbortSignal.timeout(10000),
  }).catch(() => null);
  if (!r?.ok) { await fallo(`Interpretar: ${r?.status ?? "tiempo agotado"}`); return null; }
  const j = await r.json(), s: string = j.content?.[0]?.text || "", m = s.match(/\{[\s\S]*\}/);
  try { return m ? JSON.parse(m[0]) : null; } catch { return null; }
}
export async function GET() {
  return NextResponse.json({ audio: !!(process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY), ia: !!process.env.ANTHROPIC_API_KEY }, { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" } });
}
export async function POST(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer /, "");
  if (!token) return NextResponse.json({ error: "Iniciá sesión de nuevo." }, { status: 401 });
  if (Number(req.headers.get("content-length") || 0) > MAX_PEDIDO) return NextResponse.json({ error: "El audio es muy largo." }, { status: 413 });
  const c = await cupo(token);
  if (c === "sesion") return NextResponse.json({ error: "Iniciá sesión de nuevo." }, { status: 401 });
  if (c === "pasado") return NextResponse.json({ error: "Muchos pedidos seguidos. Esperá un rato." }, { status: 429 });
  const f = await req.formData().catch(() => null);
  if (!f) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  const h = String(f.get("hoy") || ""), hoy = /^\d{4}-\d{2}-\d{2}$/.test(h) ? h : new Date(Date.now() - 3 * 36e5).toISOString().slice(0, 10);
  const modo = f.get("modo") === "agenda" ? "agenda" : "plata", cats = String(f.get("categorias") || "").slice(0, 500);
  let texto = String(f.get("texto") || "").slice(0, 600);
  const audio = f.get("audio");
  if (audio instanceof File && audio.size > 0) {
    if (audio.size > MAX_AUDIO) return NextResponse.json({ error: "El audio es muy largo." }, { status: 413 });
    texto = (await transcribir(audio)) || "";
    if (!texto) return NextResponse.json({ error: "No pude pasar el audio a texto." }, { status: 502 });
  }
  const datos = texto ? await pensar(texto, modo, hoy, cats) : null;
  return NextResponse.json({ texto, datos });
}
