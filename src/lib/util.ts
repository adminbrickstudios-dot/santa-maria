export const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
export const DIAS_C = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
export const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function ahoraBA() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
}
export function hhmm(m: number) {
  m = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
export const aMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
export function pesos(n: number) {
  return "$" + Math.round(n).toLocaleString("es-AR");
}
export function cuandoRelativo(iso: string) {
  const d = new Date(iso), s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return "recién";
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  if (s < 172800) return "ayer";
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}
export function faltan(iso: string) {
  const hoy = ahoraBA();
  hoy.setHours(0, 0, 0, 0);
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  const n = Math.round((d.getTime() - hoy.getTime()) / 864e5);
  if (n === 0) return "hoy";
  if (n === 1) return "mañana";
  if (n < 0) return `hace ${-n} días`;
  return `en ${n} días`;
}
export function fechaLarga(iso: string) {
  const d = new Date(iso);
  return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}`;
}
export function horaDe(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
export const iniciales = (n: string) => {
  const w = n.replace(/ y /, " ").trim().split(/\s+/);
  return (w.length > 1 ? w[0][0] + w[1][0] : n.slice(0, 2)).toUpperCase();
};
/* Índice estable por día, para que el tip cambie una vez por día */
export function delDia<T>(lista: T[]): T | undefined {
  if (!lista.length) return undefined;
  const d = ahoraBA();
  return lista[(d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate()) % lista.length];
}
export const COLORES = ["#C2410C", "#0F766E", "#7C3AED", "#B91C1C", "#1D4ED8", "#A21CAF", "#15803D", "#B45309", "#0369A1", "#BE185D", "#4D7C0F", "#6D28D9"];

const SIGLAS = new Set(["uca", "uba", "cbc", "sube", "dni", "uade", "modo", "bcra", "anses", "cuil", "cesac", "indec", "renaper", "miba", "imei", "caba", "isic", "utn"]);
export function nomEtiqueta(e: string) {
  if (SIGLAS.has(e)) return e.toUpperCase();
  return e.charAt(0).toUpperCase() + e.slice(1);
}
