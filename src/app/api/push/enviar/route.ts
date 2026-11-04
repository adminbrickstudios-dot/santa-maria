import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import webpush from "web-push";

/* Lo llama la base cuando se crea una notificación. El secreto y las claves viven en la base. */
export async function POST(req: Request) {
  const secreto = req.headers.get("x-secreto");
  if (!secreto) return NextResponse.json({ error: "no" }, { status: 401 });
  const { notificacion_id, iniciar } = await req.json();
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  if (iniciar) {
    const k = webpush.generateVAPIDKeys();
    const { data: ok } = await sb.rpc("push_guardar_claves", { p_secreto: secreto, p_publica: k.publicKey, p_privada: k.privateKey });
    return NextResponse.json({ ok: !!ok }, { status: ok ? 200 : 401 });
  }
  const { data: n } = await sb.rpc("push_datos", { p_id: notificacion_id, p_secreto: secreto });
  if (!n) return NextResponse.json({ error: "no" }, { status: 401 });
  if (!n.vapid_publica || !n.vapid_privada) return NextResponse.json({ error: "sin claves" }, { status: 503 });
  webpush.setVapidDetails(process.env.VAPID_CONTACTO || "mailto:adminbrickstudios@gmail.com", n.vapid_publica, n.vapid_privada);
  const cuerpo = JSON.stringify({ titulo: n.titulo, cuerpo: n.cuerpo, enlace: n.enlace, tag: n.enlace });
  await Promise.all((n.subs || []).map(async (s: { id: number; endpoint: string; p256dh: string; auth: string }) => {
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, cuerpo); }
    catch (e) { const c = (e as { statusCode?: number }).statusCode; if (c === 404 || c === 410) await sb.rpc("push_borrar", { p_id: s.id, p_secreto: secreto }); }
  }));
  return NextResponse.json({ ok: true });
}
