/* Lo que muestra la recepción: solo datos reales, validados. Lo que falta no se muestra ni se inventa. */
import type { Punto } from "./ciudad";

export interface DatosLugar {
  nombre: string;
  lat?: number;
  lon?: number;
  direccion?: string | null;
  categoria?: string | null;
  telefono?: string | null;
  web?: string | null;
  red?: string | null;
  whatsapp?: string | null;
  /** Formato opening_hours de OpenStreetMap, o texto ya legible. */
  horario?: string | null;
}

/** Solo http y https. Agrega https:// si vino sin esquema. */
export function urlSegura(u: string | null | undefined): string | null {
  const t = (u ?? "").trim();
  if (!t || /\s/.test(t)) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(t) && !/^https?:/i.test(t)) return null;
  try {
    const p = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    if ((p.protocol !== "https:" && p.protocol !== "http:") || !p.hostname.includes(".") || p.username || p.password) return null;
    return p.href;
  } catch { return null; }
}

export const dominio = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

/** Deja dígitos y un + inicial, y pasa a formato internacional si es argentino. */
export function limpiarTelefono(t: string | null | undefined): string | null {
  const c = (t ?? "").split(/[;,/]/)[0].trim().replace(/[^+\d]/g, "");
  const d = c.replace(/(?!^\+)\+/g, "");
  if (d.replace(/\D/g, "").length < 7 || d.replace(/\D/g, "").length > 15) return null;
  return d;
}

export function telHref(t: string | null | undefined): string | null {
  const c = limpiarTelefono(t);
  return c ? `tel:${c}` : null;
}

/** Celular argentino internacional: +549 y 10 dígitos. Es lo único que se puede probar por WhatsApp. */
export const esCelularAr = (t: string | null | undefined) => /^\+549\d{10}$/.test(limpiarTelefono(t) ?? "");

export function whatsappHref(t: string | null | undefined): string | null {
  const c = limpiarTelefono(t);
  return c ? `https://wa.me/${c.replace(/\D/g, "")}` : null;
}

export function redDe(u: string | null | undefined): { url: string; nombre: "Instagram" | "Facebook" } | null {
  let url = urlSegura(u);
  if (!url && u && /^@?[\w.]{2,30}$/.test(u.trim())) url = `https://www.instagram.com/${u.trim().replace(/^@/, "")}/`;
  if (!url) return null;
  const h = dominio(url);
  if (/(^|\.)instagram\.com$/.test(h)) return { url, nombre: "Instagram" };
  if (/(^|\.)(facebook|fb)\.com$/.test(h)) return { url, nombre: "Facebook" };
  return null;
}

/** Enlace oficial de Maps URLs para ver la calle real. No usa ni guarda contenido de Google. */
export const calleRealHref = (p: Punto) => `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;
export const comoLlegoHref = (p: Punto, nombre: string) => `/mapa?lat=${p.lat.toFixed(6)}&lon=${p.lon.toFixed(6)}&n=${encodeURIComponent(nombre)}`;

/* ───────── Horarios (opening_hours de OSM, lo común) ───────── */
const DIAS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"], NOMBRE: Record<string, string> = { Mo: "lun", Tu: "mar", We: "mié", Th: "jue", Fr: "vie", Sa: "sáb", Su: "dom", PH: "feriados" };

interface Regla { dias: Set<number>; tramos: [number, number][]; cerrado: boolean }

const minutos = (h: string) => { const [a, b] = h.split(":").map(Number); return a * 60 + b; };

function leerReglas(texto: string): Regla[] | null {
  const t = texto.trim();
  if (!t) return null;
  if (t === "24/7") return [{ dias: new Set([0, 1, 2, 3, 4, 5, 6]), tramos: [[0, 1440]], cerrado: false }];
  const out: Regla[] = [];
  for (const parte of t.split(";").map((s) => s.trim()).filter(Boolean)) {
    const m = parte.match(/^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)(?:\s*,\s*(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)*)?\s*(.*)$/);
    if (!m) return null;
    const dias = new Set<number>();
    if (m[1]) {
      for (const g of m[1].split(",").map((s) => s.trim())) {
        if (g === "PH") continue;
        const [a, b] = g.split("-"), i = DIAS.indexOf(a), j = b ? DIAS.indexOf(b) : i;
        for (let k = i; ; k = (k + 1) % 7) { dias.add(k); if (k === j) break; }
      }
      if (!dias.size) continue;
    } else for (let k = 0; k < 7; k++) dias.add(k);
    const resto = m[2].trim();
    if (/^(off|closed)$/i.test(resto)) { out.push({ dias, tramos: [], cerrado: true }); continue; }
    const tramos: [number, number][] = [];
    for (const r of resto.split(",").map((s) => s.trim())) {
      const q = r.match(/^(\d{1,2}:\d\d)\s*-\s*(\d{1,2}:\d\d)\+?$/);
      if (!q) return null;
      tramos.push([minutos(q[1]), minutos(q[2])]);
    }
    if (!tramos.length) return null;
    out.push({ dias, tramos, cerrado: false });
  }
  return out.length ? out : null;
}

/** true/false si se puede saber; null si el horario no se entiende. Hora de Buenos Aires. */
export function abiertoAhora(h: string | null | undefined, ahora = new Date()): boolean | null {
  const rs = leerReglas(h ?? "");
  if (!rs) return null;
  const ba = new Date(ahora.getTime() - 3 * 3600000), dia = ba.getUTCDay(), min = ba.getUTCHours() * 60 + ba.getUTCMinutes();
  let abierto = false, hay = false;
  /* Las reglas de más abajo pisan a las de arriba, como en OSM */
  for (const r of rs) {
    if (r.dias.has(dia)) {
      hay = true;
      abierto = !r.cerrado && r.tramos.some(([a, b]) => (b > a ? min >= a && min < b : min >= a));
    } else if (r.dias.has((dia + 6) % 7) && r.tramos.some(([a, b]) => b <= a && min < b)) { hay = true; abierto = true; }
  }
  return hay ? abierto : false;
}

/** "lun a vie 09:00 a 20:00 · sáb 10:00 a 14:00" */
export function horarioTexto(h: string | null | undefined): string | null {
  const t = (h ?? "").trim();
  if (!t) return null;
  return t.replace(/24\/7/g, "Abierto siempre").replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH)\b/g, (m) => NOMBRE[m])
    .replace(/([a-zá-ú]+)-([a-zá-ú]+)/g, "$1 a $2").replace(/(\d{1,2}:\d\d)\s*-\s*(\d{1,2}:\d\d)/g, "$1 a $2")
    .replace(/\b(off|closed)\b/g, "cerrado").replace(/;\s*/g, " · ").replace(/,\s*/g, ", ");
}

export interface AccionesRecepcion {
  web: { url: string; texto: string } | null;
  whatsapp: { url: string; probar: boolean } | null;
  llamar: { url: string; texto: string } | null;
  red: { url: string; nombre: string } | null;
  horario: { texto: string; abierto: boolean | null } | null;
  comoLlego: string | null;
  calleReal: string | null;
}

export function accionesDe(d: DatosLugar, ahora?: Date): AccionesRecepcion {
  const web = urlSegura(d.web), red = redDe(d.red);
  /* Si la "web" publicada es la red social, se muestra una sola vez */
  const redFinal = red ?? redDe(d.web);
  const llamar = telHref(d.telefono);
  const wa = d.whatsapp ? whatsappHref(d.whatsapp) : esCelularAr(d.telefono) ? whatsappHref(d.telefono) : null;
  const p = d.lat != null && d.lon != null ? { lat: d.lat, lon: d.lon } : null;
  const ht = horarioTexto(d.horario);
  return {
    web: web && !(redFinal && web === redFinal.url) ? { url: web, texto: dominio(web) } : null,
    whatsapp: wa ? { url: wa, probar: !d.whatsapp } : null,
    llamar: llamar ? { url: llamar, texto: (d.telefono ?? "").split(/[;,/]/)[0].trim() } : null,
    red: redFinal,
    horario: ht ? { texto: ht, abierto: abiertoAhora(d.horario, ahora) } : null,
    comoLlego: p ? comoLlegoHref(p, d.nombre) : null,
    calleReal: p ? calleRealHref(p) : null,
  };
}
