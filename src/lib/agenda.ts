/* eslint-disable @typescript-eslint/no-explicit-any */
export const TIPOS: Record<string, { n: string; e: string; c: string }> = {
  parcial: { n: "Parcial", e: "📝", c: "#FF3B30" },
  final: { n: "Final", e: "🎓", c: "#B4235F" },
  entrega: { n: "Entrega", e: "📤", c: "#FF8A1F" },
  tp: { n: "TP", e: "📎", c: "#E0A100" },
  clase: { n: "Clase", e: "🏛️", c: "#1F7AFF" },
  estudio: { n: "Estudiar", e: "📚", c: "#7C5CFC" },
  juntada: { n: "Juntada", e: "🍻", c: "#10B765" },
  tramite: { n: "Trámite o turno", e: "🗂️", c: "#0FB5AE" },
  vencimiento: { n: "Vencimiento", e: "⏳", c: "#E5484D" },
  personal: { n: "Personal", e: "⭐", c: "#5E6673" },
  otro: { n: "Otro", e: "📌", c: "#8E8E93" },
};
export const OPC_AVISO: [number, string][] = [[0, "A la hora"], [10, "10 minutos antes"], [30, "30 minutos antes"], [60, "1 hora antes"], [120, "2 horas antes"], [1440, "1 día antes"], [4320, "3 días antes"], [10080, "1 semana antes"], [20160, "2 semanas antes"]];
export const REPETIR: [string, string][] = [["no", "No se repite"], ["diario", "Todos los días"], ["semanal", "Todas las semanas"], ["quincenal", "Cada 15 días"], ["mensual", "Todos los meses"]];
const TZ = "America/Argentina/Buenos_Aires";
const partes = (iso: string | Date) => new Date(new Date(iso).toLocaleString("en-US", { timeZone: TZ }));
export const diaClave = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const claveDeISO = (iso: string) => diaClave(partes(iso));
export const horaDeISO = (iso: string) => { const d = partes(iso); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
export const aISO = (fecha: string, hora: string | null) => new Date(`${fecha}T${hora || "00:00"}:00-03:00`).toISOString();

export type Ocurrencia = { e: any; dia: string; cuando: string };
/* Abre los eventos que se repiten dentro de un rango de días */
export function expandir(lista: any[], desde: string, hasta: string): Ocurrencia[] {
  const r: Ocurrencia[] = [];
  for (const e of lista) {
    if (!e.repetir || e.repetir === "no") {
      const k = claveDeISO(e.fecha);
      if (k >= desde && k <= hasta) r.push({ e, dia: k, cuando: e.fecha });
      continue;
    }
    const paso = e.repetir === "diario" ? 1 : e.repetir === "semanal" ? 7 : e.repetir === "quincenal" ? 14 : 0;
    const ini = new Date(e.fecha), fin = e.repetir_hasta && e.repetir_hasta < hasta ? e.repetir_hasta : hasta;
    for (let i = 0; i < 1500; i++) {
      const t = new Date(ini);
      if (paso) t.setTime(ini.getTime() + paso * i * 864e5); else t.setMonth(ini.getMonth() + i);
      const k = claveDeISO(t.toISOString());
      if (k > fin) break;
      if (k >= desde && !(e.excepciones || []).includes(k)) r.push({ e, dia: k, cuando: t.toISOString() });
    }
  }
  return r.sort((a, b) => (a.e.todo_dia === b.e.todo_dia ? a.cuando.localeCompare(b.cuando) : a.e.todo_dia ? -1 : 1));
}

/* Lee los eventos de un calendario .ics externo */
export function leerICS(txt: string, nombre: string, color: string, desde: string, hasta: string): Ocurrencia[] {
  const lineas = txt.replace(/\r?\n[ \t]/g, "").split(/\r?\n/), r: Ocurrencia[] = [];
  let ev: any = null;
  const fechaICS = (v: string) => {
    const m = v.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z?))?/);
    if (!m) return null;
    if (!m[4]) return { todo: true, iso: `${m[1]}-${m[2]}-${m[3]}T00:00:00-03:00` };
    return { todo: false, iso: `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7] ? "Z" : "-03:00"}` };
  };
  const des = (s: string) => s.replace(/\\n/g, "\n").replace(/\\([,;\\])/g, "$1");
  for (const l of lineas) {
    if (l === "BEGIN:VEVENT") ev = {};
    else if (l === "END:VEVENT" && ev) {
      if (ev.ini) {
        const base = { id: `x${r.length}-${nombre}`, externo: nombre, color, titulo: ev.titulo || "Sin título", tipo: "otro", fecha: new Date(ev.ini.iso).toISOString(), fin: ev.fin ? new Date(ev.fin.iso).toISOString() : null, todo_dia: ev.ini.todo, lugar_nombre: ev.lugar || null, notas: ev.notas || null, repetir: ev.rrule?.includes("FREQ=WEEKLY") ? "semanal" : ev.rrule?.includes("FREQ=DAILY") ? "diario" : ev.rrule?.includes("FREQ=MONTHLY") ? "mensual" : "no", repetir_hasta: ev.rrule?.match(/UNTIL=(\d{4})(\d{2})(\d{2})/)?.slice(1).join("-") || null };
        r.push(...expandir([base], desde, hasta));
      }
      ev = null;
    } else if (ev) {
      const i = l.indexOf(":"); if (i < 0) continue;
      const k = l.slice(0, i).split(";")[0], v = l.slice(i + 1);
      if (k === "SUMMARY") ev.titulo = des(v); else if (k === "DTSTART") ev.ini = fechaICS(v); else if (k === "DTEND") ev.fin = fechaICS(v); else if (k === "LOCATION") ev.lugar = des(v); else if (k === "DESCRIPTION") ev.notas = des(v); else if (k === "RRULE") ev.rrule = v;
    }
  }
  return r;
}
