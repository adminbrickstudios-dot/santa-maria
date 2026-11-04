/* Cuentas de Estudio. Sin React ni base, para poder probarlas solas. */

/* ───── Fechas como texto AAAA-MM-DD ───── */
export function sumarDias(clave: string, n: number) {
  const d = new Date(`${clave}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function lunesDe(clave: string) {
  const dia = new Date(`${clave}T12:00:00Z`).getUTCDay();
  return sumarDias(clave, dia === 0 ? -6 : 1 - dia);
}

/* ───── Foco ───── */
export type EstadoFoco = { inicio: number; min: number; modo: "foco" | "descanso"; materiaId: number | null; pausadoEn: number | null; pausaTotal: number };

export function nuevoFoco(min: number, modo: EstadoFoco["modo"], materiaId: number | null, ahora: number): EstadoFoco {
  return { inicio: ahora, min, modo, materiaId, pausadoEn: null, pausaTotal: 0 };
}
/* Todo sale de la hora de inicio: si el teléfono se duerme, al volver la cuenta da bien */
export function segundosPasados(f: EstadoFoco, ahora: number) {
  return Math.max(0, ((f.pausadoEn ?? ahora) - f.inicio - f.pausaTotal) / 1000);
}
export function segundosRestan(f: EstadoFoco, ahora: number) {
  return Math.max(0, f.min * 60 - segundosPasados(f, ahora));
}
export function minutosHechos(f: EstadoFoco, ahora: number) {
  return Math.min(f.min, Math.floor(segundosPasados(f, ahora) / 60));
}
export function pausar(f: EstadoFoco, ahora: number): EstadoFoco {
  return f.pausadoEn ? f : { ...f, pausadoEn: ahora };
}
export function seguir(f: EstadoFoco, ahora: number): EstadoFoco {
  return f.pausadoEn ? { ...f, pausaTotal: f.pausaTotal + (ahora - f.pausadoEn), pausadoEn: null } : f;
}
export function reloj(seg: number) {
  const s = Math.ceil(seg);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
/* Días seguidos con algo estudiado. Si hoy todavía no estudiaste, la racha sigue viva desde ayer */
export function racha(dias: Iterable<string>, hoy: string) {
  const con = new Set(dias);
  let d = con.has(hoy) ? hoy : sumarDias(hoy, -1), n = 0;
  while (con.has(d)) { n++; d = sumarDias(d, -1); }
  return n;
}
/* Minutos de las últimas semanas, de la más vieja a la actual. Semanas de lunes a domingo */
export function minutosPorSemana(sesiones: { dia: string; minutos: number }[], hoy: string, semanas = 6) {
  const lunes = lunesDe(hoy);
  const r = Array.from({ length: semanas }, (_, i) => ({ desde: sumarDias(lunes, -7 * (semanas - 1 - i)), minutos: 0 }));
  for (const s of sesiones) {
    const k = lunesDe(s.dia), x = r.find((w) => w.desde === k);
    if (x) x.minutos += s.minutos;
  }
  return r;
}
export function horasTexto(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/* ───── Tarjetas: repetición espaciada tipo SM-2 ───── */
export type Memoria = { facilidad: number; intervalo: number; repeticiones: number };
export type Calidad = 1 | 3 | 4 | 5;
export const INTERVALO_MAX = 365;

export function repasar(t: Memoria, calidad: Calidad, hoy: string) {
  const q = calidad, f0 = Number(t.facilidad);
  const facilidad = Math.max(1.3, Math.round((f0 + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)) * 100) / 100);
  let repeticiones: number, intervalo: number;
  if (q < 3) { repeticiones = 0; intervalo = 1; }
  else {
    repeticiones = t.repeticiones + 1;
    intervalo = repeticiones === 1 ? 1 : repeticiones === 2 ? 6 : Math.round(t.intervalo * facilidad);
    if (q === 5 && repeticiones === 1) intervalo = 3;
    intervalo = Math.min(INTERVALO_MAX, Math.max(1, intervalo));
  }
  return { facilidad, intervalo, repeticiones, vence: sumarDias(hoy, intervalo) };
}
export function diasTexto(n: number) {
  if (n <= 1) return "mañana";
  if (n < 30) return `${n} días`;
  if (n < 365) return `${Math.round(n / 30)} ${Math.round(n / 30) === 1 ? "mes" : "meses"}`;
  return "1 año";
}
/* Cada línea "pregunta: respuesta" es una tarjeta. Devuelve también las que no se entendieron */
export function parsearTarjetas(texto: string) {
  const ok: { pregunta: string; respuesta: string }[] = [], malas: string[] = [], vistas = new Set<string>();
  for (const cruda of texto.split(/\r?\n/)) {
    const l = cruda.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim();
    if (!l) continue;
    let i = l.indexOf(": ");
    if (i < 0) i = l.indexOf(":");
    const pregunta = i > 0 ? l.slice(0, i).trim() : "", respuesta = i > 0 ? l.slice(i + 1).trim() : "";
    if (!pregunta || !respuesta) { malas.push(l); continue; }
    if (vistas.has(pregunta)) continue;
    vistas.add(pregunta);
    ok.push({ pregunta, respuesta });
  }
  return { ok, malas };
}

/* ───── Faltas ───── */
export function resumenFaltas(faltas: number, tope: number | null) {
  if (tope == null) return { faltas, tope, quedan: null as number | null, nivel: "sin" as const, pct: 0 };
  const quedan = tope - faltas, pct = tope > 0 ? Math.min(100, (faltas / tope) * 100) : 100;
  const nivel = quedan < 0 ? ("pasado" as const) : quedan === 0 ? ("limite" as const) : quedan <= Math.max(1, tope * 0.25) ? ("cerca" as const) : ("bien" as const);
  return { faltas, tope, quedan, nivel, pct };
}
export function numeroCorto(n: number) {
  return String(Math.round(n * 100) / 100).replace(".", ",");
}

/* ───── Notas ───── */
export type Nota = { nota: number; peso: number };
export function promedio(notas: Nota[]) {
  const pesos = notas.reduce((a, n) => a + Number(n.peso), 0);
  if (!pesos) return null;
  return notas.reduce((a, n) => a + Number(n.nota) * Number(n.peso), 0) / pesos;
}
/* Cuánto hay que sacar en la próxima nota (que vale pesoProximo) para que el promedio llegue a objetivo */
export function cuantoNecesito(notas: Nota[], objetivo: number, pesoProximo = 1, maximo = 10) {
  const suma = notas.reduce((a, n) => a + Number(n.nota) * Number(n.peso), 0);
  const pesos = notas.reduce((a, n) => a + Number(n.peso), 0);
  const nota = (objetivo * (pesos + pesoProximo) - suma) / pesoProximo;
  const redondeada = Math.ceil(nota * 100 - 1e-9) / 100;
  const estado = redondeada <= 0 ? ("ya" as const) : redondeada > maximo ? ("imposible" as const) : ("posible" as const);
  return { estado, nota: redondeada };
}

/* ───── Plan de carrera ───── */
export type MateriaPlan = { id: number; estado: string; anio?: number | null };
export function avanceCarrera(materias: MateriaPlan[]) {
  const total = materias.length, aprobadas = materias.filter((m) => m.estado === "aprobada").length;
  const regulares = materias.filter((m) => m.estado === "regular").length, cursando = materias.filter((m) => m.estado === "cursando").length;
  return { total, aprobadas, regulares, cursando, pendientes: total - aprobadas - regulares - cursando, pct: total ? Math.round((aprobadas / total) * 100) : 0 };
}
/* Materias que faltan para poder cursar: para cursar alcanza con tener la correlativa regular o aprobada */
export function correlativasQueFaltan(id: number, materias: MateriaPlan[], correlativas: { materia_id: number; requiere_id: number }[]) {
  const est = new Map(materias.map((m) => [m.id, m.estado]));
  return correlativas.filter((c) => c.materia_id === id && !["regular", "aprobada"].includes(est.get(c.requiere_id) || "")).map((c) => c.requiere_id);
}
export function porAnio<T extends { anio?: number | null }>(materias: T[]) {
  const g = new Map<number, T[]>();
  for (const m of materias) { const k = m.anio ?? 0; if (!g.has(k)) g.set(k, []); g.get(k)!.push(m); }
  return [...g].sort(([a], [b]) => (a || 99) - (b || 99));
}
