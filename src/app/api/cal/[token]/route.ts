/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@supabase/supabase-js";
import { MARCA } from "@/lib/marca";

/* Calendario privado de cada persona, para que Google o Apple lo lean. */
const esc = (s: string) => String(s || "").replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\r?\n/g, "\\n");
const utc = (d: string | Date) => new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const dia = (d: string, mas = 0) => { const x = new Date(new Date(d).getTime() - 3 * 3600e3 + mas * 864e5); return x.toISOString().slice(0, 10).replace(/-/g, ""); };
const dobla = (l: string) => { const r: string[] = []; let s = l; while (s.length > 70) { r.push(s.slice(0, 70)); s = " " + s.slice(70); } r.push(s); return r.join("\r\n"); };
const FREQ: Record<string, string> = { diario: "FREQ=DAILY", semanal: "FREQ=WEEKLY", quincenal: "FREQ=WEEKLY;INTERVAL=2", mensual: "FREQ=MONTHLY" };

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data } = await sb.rpc("agenda_feed", { p_token: token.replace(/\.ics$/, "") });
  if (!data) return new Response("No existe", { status: 404 });
  const l = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:-//${MARCA.nombre}//Agenda//ES`, "CALSCALE:GREGORIAN", `X-WR-CALNAME:${MARCA.nombre}`, "X-WR-TIMEZONE:America/Argentina/Buenos_Aires", "REFRESH-INTERVAL;VALUE=DURATION:PT1H"];
  for (const e of data as any[]) {
    l.push("BEGIN:VEVENT", `UID:evento-${e.id}@santa-maria`, `DTSTAMP:${utc(new Date())}`, dobla(`SUMMARY:${esc(e.titulo)}`));
    if (e.todo_dia) l.push(`DTSTART;VALUE=DATE:${dia(e.fecha)}`, `DTEND;VALUE=DATE:${dia(e.fecha, 1)}`);
    else l.push(`DTSTART:${utc(e.fecha)}`, `DTEND:${utc(e.fin || new Date(new Date(e.fecha).getTime() + 36e5))}`);
    if (e.lugar) l.push(dobla(`LOCATION:${esc(e.lugar)}`));
    if (e.notas) l.push(dobla(`DESCRIPTION:${esc(e.notas)}`));
    if (FREQ[e.repetir]) l.push(`RRULE:${FREQ[e.repetir]}${e.hasta ? `;UNTIL=${e.hasta.replace(/-/g, "")}T235959Z` : ""}`);
    for (const x of e.excepciones || []) l.push(e.todo_dia ? `EXDATE;VALUE=DATE:${x.replace(/-/g, "")}` : `EXDATE:${x.replace(/-/g, "")}T${utc(e.fecha).slice(9)}`);
    l.push("END:VEVENT");
  }
  l.push("END:VCALENDAR");
  return new Response(l.join("\r\n") + "\r\n", { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=300", "X-Robots-Tag": "noindex" } });
}
