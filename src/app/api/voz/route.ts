import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

/* Audio → texto (OPENAI_API_KEY o GROQ_API_KEY) y texto → datos (ANTHROPIC_API_KEY). Las claves van en Vercel. */
const usos = new Map<string, number[]>();
function pasado(id: string) {
  const a = Date.now(), l = (usos.get(id) || []).filter((t) => a - t < 60e3);
  l.push(a); usos.set(id, l);
  return l.length > 20;
}
async function quien(req: Request) {
  const t = (req.headers.get("authorization") || "").replace(/^Bearer /, "");
  if (!t) return null;
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data } = await sb.auth.getUser(t);
  return data.user?.id || null;
}
async function transcribir(audio: File) {
  const groq = process.env.GROQ_API_KEY, oa = process.env.OPENAI_API_KEY;
  if (!groq && !oa) return null;
  const f = new FormData();
  f.append("file", audio, "audio.webm"); f.append("language", "es");
  f.append("model", groq ? "whisper-large-v3" : "whisper-1");
  const r = await fetch(groq ? "https://api.groq.com/openai/v1/audio/transcriptions" : "https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${groq || oa}` }, body: f });
  if (!r.ok) return null;
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
  });
  if (!r.ok) return null;
  const j = await r.json(), s: string = j.content?.[0]?.text || "", m = s.match(/\{[\s\S]*\}/);
  try { return m ? JSON.parse(m[0]) : null; } catch { return null; }
}
export async function GET() {
  return NextResponse.json({ audio: !!(process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY), ia: !!process.env.ANTHROPIC_API_KEY });
}
export async function POST(req: Request) {
  const id = await quien(req);
  if (!id) return NextResponse.json({ error: "Iniciá sesión de nuevo." }, { status: 401 });
  if (pasado(id)) return NextResponse.json({ error: "Muchos pedidos seguidos. Esperá un minuto." }, { status: 429 });
  const f = await req.formData();
  const modo = f.get("modo") === "agenda" ? "agenda" : "plata", hoy = String(f.get("hoy") || "").slice(0, 10), cats = String(f.get("categorias") || "").slice(0, 500);
  let texto = String(f.get("texto") || "");
  const audio = f.get("audio");
  if (audio instanceof File && audio.size > 0) {
    if (audio.size > 8e6) return NextResponse.json({ error: "El audio es muy largo." }, { status: 413 });
    texto = (await transcribir(audio)) || "";
    if (!texto) return NextResponse.json({ error: "No pude pasar el audio a texto." }, { status: 502 });
  }
  const datos = texto ? await pensar(texto, modo, hoy, cats) : null;
  return NextResponse.json({ texto, datos });
}
