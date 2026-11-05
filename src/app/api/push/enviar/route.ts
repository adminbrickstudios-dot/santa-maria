import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import webpush from "web-push";

export const maxDuration = 60;

/* La base lo despierta cuando hay avisos en la cola. El secreto y las claves viven en la base. */
const TAM_LOTE = 100, A_LA_VEZ = 25, TOPE_MS = 45_000;
type Sub = { id: number; endpoint: string; p256dh: string; auth: string };
type Item = { id: number; titulo: string; cuerpo: string | null; enlace: string | null; subs: Sub[] };

/* Entregado, descartado para siempre o para reintentar */
async function mandar(it: Item, muertas: number[]): Promise<"ok" | "reintentar"> {
  const cuerpo = JSON.stringify({ titulo: it.titulo, cuerpo: it.cuerpo, enlace: it.enlace, tag: it.enlace });
  let entregada = false, reintentar = false;
  await Promise.all((it.subs || []).map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, cuerpo, { TTL: 21600, timeout: 8000 });
      entregada = true;
    } catch (e) {
      const c = (e as { statusCode?: number }).statusCode;
      if (c === 404 || c === 410) muertas.push(s.id);
      else if (!c || c === 429 || c >= 500) reintentar = true;
    }
  }));
  return reintentar && !entregada ? "reintentar" : "ok";
}

export async function POST(req: Request) {
  const secreto = req.headers.get("x-secreto");
  if (!secreto) return NextResponse.json({ error: "no" }, { status: 401 });
  const pedido = await req.json().catch(() => ({}));
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  if (pedido.iniciar) {
    const k = webpush.generateVAPIDKeys();
    const { data: ok } = await sb.rpc("push_guardar_claves", { p_secreto: secreto, p_publica: k.publicKey, p_privada: k.privateKey });
    return NextResponse.json({ ok: !!ok }, { status: ok ? 200 : 401 });
  }
  const inicio = Date.now();
  let enviadas = 0, fallidas = 0;
  while (Date.now() - inicio < TOPE_MS) {
    const { data: l, error } = await sb.rpc("push_tomar_lote", { p_secreto: secreto, p_max: TAM_LOTE });
    if (error) { await sb.rpc("registrar_error", { p_origen: "api/push", p_codigo: error.code || "", p_mensaje: error.message, p_ruta: "/api/push/enviar" }); return NextResponse.json({ error: "base" }, { status: 502 }); }
    if (!l) return NextResponse.json({ error: "no" }, { status: 401 });
    const items: Item[] = l.items || [];
    if (!items.length) break;
    if (!l.vapid_publica || !l.vapid_privada) return NextResponse.json({ error: "sin claves" }, { status: 503 });
    webpush.setVapidDetails(process.env.VAPID_CONTACTO || "mailto:adminbrickstudios@gmail.com", l.vapid_publica, l.vapid_privada);
    /* Lo que no se confirma vuelve solo a la cola: nada se pierde si esto se corta */
    const ok: number[] = [], muertas: number[] = [];
    for (let i = 0; i < items.length; i += A_LA_VEZ) {
      await Promise.all(items.slice(i, i + A_LA_VEZ).map(async (it) => {
        if (await mandar(it, muertas) === "ok") ok.push(it.id); else fallidas++;
      }));
    }
    enviadas += ok.length;
    const c = await sb.rpc("push_confirmar", { p_secreto: secreto, p_ok: ok, p_subs_muertas: muertas });
    if (c.error) await sb.rpc("registrar_error", { p_origen: "api/push", p_codigo: c.error.code || "", p_mensaje: c.error.message, p_ruta: "/api/push/enviar" });
    if (items.length < TAM_LOTE) break;
  }
  if (fallidas) await sb.rpc("registrar_error", { p_origen: "api/push", p_codigo: "reintento", p_mensaje: "Avisos que volvieron a la cola", p_ruta: "/api/push/enviar" });
  return NextResponse.json({ ok: true, enviadas, fallidas });
}
