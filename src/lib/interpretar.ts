/* Entiende frases en castellano rioplatense sin depender de internet. */
const NUM: Record<string, number> = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, cien: 100, ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400, quinientos: 500, seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900 };
const limpio = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

export function hoyBA(): Date { return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" })); }
export const fechaISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function palabrasANumero(t: string): { n: number; texto: string } | null {
  const toks = t.split(" ");
  let mejor: { n: number; ini: number; fin: number } | null = null;
  for (let i = 0; i < toks.length; i++) {
    let tot = 0, act = 0, j = i, vio = false;
    for (; j < toks.length; j++) {
      const w = toks[j];
      if (w === "y" && vio) continue;
      if (NUM[w] !== undefined) { act += NUM[w]; vio = true; }
      else if (/^\d+([.,]\d+)?$/.test(w) && !vio) { act += parseFloat(w.replace(",", ".")); vio = true; }
      else if (w === "mil" || w === "lucas" || w === "luca" || w === "lucarda") { tot += (act || 1) * 1000; act = 0; vio = true; }
      else if (w === "millon" || w === "millones" || w === "palo" || w === "palos") { tot += (act || 1) * 1e6; act = 0; vio = true; }
      else break;
    }
    if (vio) {
      if (toks[j - 1] === "y") j--;
      const n = tot + act, largo = j - i;
      if (n > 0 && (!mejor || largo > mejor.fin - mejor.ini)) mejor = { n, ini: i, fin: j };
    }
  }
  if (!mejor) return null;
  return { n: mejor.n, texto: toks.slice(mejor.ini, mejor.fin).join(" ") };
}
export function montoDe(t0: string): { monto: number; resto: string } {
  let t = limpio(t0).replace(/\$/g, " ");
  const k = t.match(/(\d+(?:[.,]\d+)?)\s*k\b/);
  if (k) return { monto: Math.round(parseFloat(k[1].replace(",", ".")) * 1000), resto: t.replace(k[0], " ") };
  const m = t.match(/\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?/);
  if (m) { const n = parseFloat(m[0].replace(/\./g, "").replace(",", ".")); const d = palabrasSeguidas(t, m[0]); return { monto: n * d.por, resto: t.replace(d.txt, " ") }; }
  const c = t.match(/\d+,\d{3}\b/);
  if (c) { t = t.replace(c[0], c[0].replace(",", "")); }
  const p = palabrasANumero(t);
  if (p) return { monto: Math.round(p.n), resto: t.replace(p.texto, " ") };
  return { monto: 0, resto: t };
}
const palabrasSeguidas = (t: string, m: string) => {
  const r = new RegExp(m.replace(/\./g, "\\.") + "\\s+(mil|lucas)");
  const x = t.match(r);
  return x ? { por: 1000, txt: x[0] } : { por: 1, txt: m };
};

const CLAVES: [string, string[]][] = [
  ["Súper", ["super", "supermercado", "coto", "carrefour", "jumbo", "dia", "disco", "chino", "verduleria", "carniceria", "almacen", "kiosco", "kiosko", "mercado"]],
  ["Comida afuera", ["asado", "cafe", "almuerzo", "cena", "pizza", "hamburguesa", "sushi", "empanadas", "rappi", "pedidosya", "pedidos ya", "delivery", "restaurante", "bar", "comida", "facturas", "helado"]],
  ["Salidas", ["boliche", "birra", "birras", "cerveza", "fernet", "entrada", "cine", "teatro", "recital", "previa", "salida", "joda", "tragos"]],
  ["Transporte", ["sube", "bondi", "colectivo", "subte", "taxi", "uber", "cabify", "didi", "tren", "nafta", "peaje", "estacionamiento", "pasaje", "micro"]],
  ["Facu", ["apunte", "apuntes", "fotocopia", "fotocopias", "libro", "libros", "cuota", "facu", "facultad", "universidad", "uca", "matricula", "cuaderno"]],
  ["Alquiler y expensas", ["alquiler", "expensas", "garantia"]],
  ["Servicios", ["luz", "gas", "agua", "internet", "wifi", "celular", "telefono", "edesur", "edenor", "metrogas", "movistar", "personal", "claro", "abl"]],
  ["Salud", ["farmacia", "remedio", "remedios", "medico", "dentista", "prepaga", "obra social", "psicologo", "gimnasio", "gym"]],
  ["Ropa", ["ropa", "zapatillas", "remera", "pantalon", "campera", "buzo", "jean", "zapatos"]],
  ["Suscripciones", ["netflix", "spotify", "disney", "hbo", "max", "youtube", "icloud", "chatgpt", "claude", "suscripcion", "amazon prime", "prime"]],
  ["Regalos", ["regalo", "regale", "cumple"]],
];
const INGRESO = ["cobre", "me pagaron", "me depositaron", "me entro", "me entraron", "gane", "ingreso", "me dieron", "me mandaron", "me transfirieron", "vendi", "sueldo", "aguinaldo", "me regalaron", "me devolvieron"];
const CLAVES_ING: [string, string[]][] = [["Sueldo", ["sueldo", "aguinaldo", "laburo", "trabajo", "me pagaron"]], ["Papás", ["papa", "mama", "viejos", "papas"]], ["Changa", ["changa", "clase particular", "clases", "freelance"]], ["Beca", ["beca", "progresar"]], ["Venta", ["vendi", "venta"]], ["Regalo", ["regalaron", "regalo"]]];
const incluye = (t: string, w: string) => new RegExp(`(^|\\W)${w}(\\W|$)`).test(t);

function fechaPasadaDe(t: string): { fecha: Date; resto: string } {
  const h = hoyBA(); let resto = t, f = new Date(h);
  const D = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
  if (incluye(t, "anteayer") || t.includes("antes de ayer")) { f.setDate(h.getDate() - 2); resto = t.replace(/antes de ayer|anteayer/, " "); }
  else if (incluye(t, "ayer")) { f.setDate(h.getDate() - 1); resto = t.replace("ayer", " "); }
  else if (incluye(t, "hoy")) resto = t.replace("hoy", " ");
  else {
    const i = D.findIndex((d) => incluye(t, d));
    if (i >= 0) { f.setDate(h.getDate() - ((h.getDay() - i + 7) % 7)); resto = t.replace(new RegExp(`(el )?${D[i]}`), " "); }
  }
  return { fecha: f, resto };
}
const mayus = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : "");
/* Devuelve los acentos y mayúsculas que puso la persona */
function restaurar(s: string, original: string) {
  const d = new Map(original.split(/\s+/).map((w) => [limpio(w).replace(/[.,;:]/g, ""), w.replace(/[.,;:]$/, "")]));
  return s.split(" ").map((w) => d.get(w) || w).join(" ");
}
export type GastoLeido = { tipo: "gasto" | "ingreso"; monto: number; categoria: string; nota: string; fecha: string };
export function interpretarPlata(texto: string, forzar?: "gasto" | "ingreso"): GastoLeido {
  const t = limpio(texto);
  const tipo = forzar || (INGRESO.some((w) => t.includes(w)) ? "ingreso" : "gasto");
  const { monto, resto } = montoDe(t);
  const fp = fechaPasadaDe(resto);
  const tabla = tipo === "ingreso" ? CLAVES_ING : CLAVES;
  const cat = tabla.find(([, l]) => l.some((w) => incluye(t, w)))?.[0] || "Otros";
  const nota = fp.resto.replace(/\b(gaste|pague|compre|sali[oó]|me salio|me costo|cobre|me pagaron|me depositaron|me entro|me dieron|pesos|por|en|de|del|la|el|los|las|un|una|y|al|para|con)\b/g, " ").replace(/\s+/g, " ").trim();
  return { tipo, monto, categoria: cat, nota: mayus(restaurar(nota, texto)), fecha: fechaISO(fp.fecha) };
}

export type EventoLeido = { titulo: string; tipo: string; fecha: string; hora: string | null; lugar: string; avisos: number[] };
const AVISOS: Record<string, number[]> = { parcial: [10080, 4320, 1440, 120], final: [20160, 10080, 4320, 1440, 120], entrega: [4320, 1440, 120], tp: [4320, 1440, 120], clase: [30], juntada: [1440, 120], tramite: [1440, 120], vencimiento: [4320, 1440], personal: [1440, 60] };
export const avisosDe = (tipo: string) => AVISOS[tipo] || [1440, 60];
const MES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export function interpretarEvento(texto: string): EventoLeido {
  const original = texto.trim();
  let t = limpio(texto).replace(/[.,]$/, "");
  const h = hoyBA(); let f: Date | null = null, hora: string | null = null;
  const qu = (re: RegExp) => { t = t.replace(re, " ").replace(/\s+/g, " ").trim(); };
  const D = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
  let m: RegExpMatchArray | null;
  if (/pasado manana/.test(t)) { f = new Date(h); f.setDate(h.getDate() + 2); qu(/pasado manana/); }
  else if (/(^|\s)manana(\s|$)/.test(t) && !/(de|a) la manana/.test(t)) { f = new Date(h); f.setDate(h.getDate() + 1); qu(/(^|\s)manana(\s|$)/); }
  else if (/(^|\s)hoy(\s|$)/.test(t)) { f = new Date(h); qu(/(^|\s)hoy(\s|$)/); }
  else if ((m = t.match(/en (\d+|un|una|dos|tres|cuatro|cinco|seis|siete) (dias?|semanas?)/))) { const n = /^\d/.test(m[1]) ? +m[1] : NUM[m[1]]; f = new Date(h); f.setDate(h.getDate() + n * (m[2].startsWith("sem") ? 7 : 1)); qu(new RegExp(m[0])); }
  else if (/la semana que viene|la proxima semana/.test(t)) { f = new Date(h); f.setDate(h.getDate() + 7); qu(/la semana que viene|la proxima semana/); }
  else if ((m = t.match(/(\d{1,2}) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/))) {
    f = new Date(h.getFullYear(), MES.indexOf(m[2]), +m[1]); if (fechaISO(f) < fechaISO(h)) f.setFullYear(f.getFullYear() + 1); qu(new RegExp(`(el )?${m[0]}`));
  } else if ((m = t.match(/(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?/))) { f = new Date(h.getFullYear(), +m[2] - 1, +m[1]); if (fechaISO(f) < fechaISO(h)) f.setFullYear(f.getFullYear() + 1); qu(new RegExp(`(el )?${m[0].replace(/\//g, "\\/")}`)); }
  else {
    const i = D.findIndex((d) => incluye(t, d));
    if (i >= 0) { f = new Date(h); let s = (i - h.getDay() + 7) % 7; if (s === 0) s = 7; f.setDate(h.getDate() + s); qu(new RegExp(`(este |el |proximo )*${D[i]}( que viene)?`)); }
    else if ((m = t.match(/\bel (\d{1,2})\b(?!:)/))) { f = new Date(h.getFullYear(), h.getMonth(), +m[1]); if (fechaISO(f) < fechaISO(h)) f.setMonth(f.getMonth() + 1); qu(new RegExp(m[0])); }
  }
  if (/mediodia/.test(t)) { hora = "12:00"; qu(/(al |a )?mediodia/); }
  else if ((m = t.match(/(?:a las?|tipo|alas)\s*(\d{1,2}|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)(?:[:.](\d{2})| y (media|cuarto))?(?:\s*(?:hs|horas?))?(?:\s*(de la manana|de la tarde|de la noche|am|pm))?/))) {
    let hh = /^\d/.test(m[1]) ? +m[1] : NUM[m[1]];
    const mi = m[2] ? +m[2] : m[3] === "media" ? 30 : m[3] === "cuarto" ? 15 : 0, per = m[4] || "";
    if (/tarde|noche|pm/.test(per) && hh < 12) hh += 12;
    else if (!per && hh >= 1 && hh <= 7) hh += 12;
    hora = `${String(hh).padStart(2, "0")}:${String(mi).padStart(2, "0")}`; qu(new RegExp(m[0]));
  }
  let tipo = "personal";
  const tipos: [string, RegExp][] = [["parcial", /parcial|recuperatorio/], ["final", /\bfinal\b/], ["entrega", /entrega|entregar/], ["tp", /\btp\b|trabajo practico/], ["clase", /\bclase\b|cursada/], ["juntada", /juntada|asado|cumple|birra|previa|salida|cena con/], ["tramite", /turno|tramite|medico|dentista|dni|pasaporte/], ["vencimiento", /vence|vencimiento|pagar/]];
  for (const [k, re] of tipos) if (re.test(t)) { tipo = k; break; }
  let lugar = "";
  if ((m = t.match(/\ben (?:la |el |lo de |casa de )?([a-z0-9 ]{2,30})$/)) && !/dias?$/.test(m[1])) { lugar = restaurar(m[1], original); t = t.replace(m[0], " ").trim(); }
  t = t.replace(/^(tengo|hay|agendar?|agenda|anota(me)?|acordate( de)?|recordame( que)?|poneme|poner|sumar?|que tengo)\s+/, "").replace(/\s+/g, " ").trim();
  return { titulo: t ? mayus(restaurar(t, original)) : original, tipo, fecha: fechaISO(f || h), hora, lugar: mayus(lugar), avisos: avisosDe(tipo) };
}
