/* Cuentas de Tareas, Caja, Compras y Bondi. Sin React ni base, para poder probarlas solas. */

/* ───── Números escritos a mano ───── */
export function leerPrecio(t: string | number | null | undefined) {
  if (typeof t === "number") return t;
  let s = String(t ?? "").trim().replace(/[$\s]/g, "");
  if (!s) return NaN;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  return Number(s);
}
export function pesosExactos(n: number) {
  return "$" + Number(n).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/* ───── Tareas ───── */
export type Tarea = { id: number; titulo: string; fecha: string | null; prioridad: string; hecha: boolean; hecha_en?: string | null };
const PESO: Record<string, number> = { alta: 0, media: 1, baja: 2 };
function orden(a: Tarea, b: Tarea) {
  const f = (a.fecha || "9999").localeCompare(b.fecha || "9999");
  return f || (PESO[a.prioridad] ?? 1) - (PESO[b.prioridad] ?? 1) || a.id - b.id;
}
export function agruparTareas<T extends Tarea>(l: T[], hoy: string) {
  const abiertas = l.filter((t) => !t.hecha);
  return {
    hoy: abiertas.filter((t) => t.fecha && t.fecha <= hoy).sort((a, b) => (PESO[a.prioridad] ?? 1) - (PESO[b.prioridad] ?? 1) || orden(a, b)),
    proximas: abiertas.filter((t) => !t.fecha || t.fecha > hoy).sort(orden),
    hechas: l.filter((t) => t.hecha).sort((a, b) => (b.hecha_en || "").localeCompare(a.hecha_en || "")),
  };
}
export function fechaTarea(f: string, hoy: string, manana: string) {
  if (f === hoy) return "Hoy";
  if (f === manana) return "Mañana";
  if (f < hoy) return "Atrasada";
  const d = new Date(`${f}T12:00:00Z`), dias = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"], meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${dias[d.getUTCDay()]} ${d.getUTCDate()} ${meses[d.getUTCMonth()]}`;
}

/* ───── Mi caja ───── */
export const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export function buscarEnCaja<T extends { titulo: string; cuerpo?: string | null; categoria?: string | null; archivo_nombre?: string | null; enlace?: string | null }>(l: T[], texto: string) {
  const palabras = normalizar(texto).split(/\s+/).filter(Boolean);
  if (!palabras.length) return l;
  return l.filter((i) => { const h = normalizar([i.titulo, i.cuerpo, i.categoria, i.archivo_nombre, i.enlace].filter(Boolean).join(" ")); return palabras.every((p) => h.includes(p)); });
}

/* ───── Compras ───── */
export type ItemCompra = { cantidad: number; precio: number | null; tildado: boolean };
export function totalesCompra(l: ItemCompra[]) {
  const suma = (x: ItemCompra[]) => x.reduce((a, i) => a + Number(i.cantidad) * Number(i.precio ?? 0), 0);
  const tildados = l.filter((i) => i.tildado);
  return { estimado: suma(l), enCarrito: suma(tildados), tildados: tildados.length, sinPrecio: tildados.filter((i) => i.precio == null).length, total: l.length };
}

/* ───── Bondi ───── */
export const SEMANAS_POR_MES = 52 / 12;
export type Escalon = { desde_viaje: number; descuento: number };
/* Costo del mes. Con escalones (subte), cada viaje paga según su número dentro del mes */
export function gastoMensual(precio: number, viajesSemana: number, escalones: Escalon[] = []) {
  const viajes = Math.round(Math.max(0, viajesSemana) * SEMANAS_POR_MES);
  const orden = [...escalones].sort((a, b) => b.desde_viaje - a.desde_viaje);
  let total = 0;
  for (let n = 1; n <= viajes; n++) {
    const e = orden.find((x) => n >= x.desde_viaje);
    total += precio * (1 - (e?.descuento || 0) / 100);
  }
  return { viajes, total: Math.round(total * 100) / 100 };
}
export type Tarifa = { id: number; desde: number; hasta?: number | null; escalones?: Escalon[] | null };
export function gastoTransporte(tarifas: Tarifa[], viajes: Record<number, number>) {
  let min = 0, max = 0, cant = 0;
  for (const t of tarifas) {
    const v = viajes[t.id] || 0, a = gastoMensual(+t.desde, v, t.escalones || []), b = gastoMensual(+(t.hasta ?? t.desde), v, t.escalones || []);
    min += a.total; max += b.total; cant += a.viajes;
  }
  return { min: Math.round(min * 100) / 100, max: Math.round(max * 100) / 100, viajes: cant };
}
