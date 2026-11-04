import { MUNDOS } from "./marca";

/* Toques de la portada: todo sobre transform, y nada si la persona pidió menos movimiento. */
const quieto = () => typeof matchMedia === "undefined" || matchMedia("(prefers-reduced-motion:reduce)").matches;
const CURVA = "cubic-bezier(.32,.72,0,1)";

/* Cada tecla le da un golpecito a una de las cuatro letras, por turno */
let turno = 0;
export function latirLetra() {
  if (quieto()) return;
  const l = document.querySelectorAll<HTMLElement>(".fa-c");
  if (!l.length) return;
  l[turno++ % l.length].animate?.([{ transform: "translateY(0)" }, { transform: "translateY(-5px) scale(1.03)" }, { transform: "translateY(0)" }], { duration: 240, easing: "ease-out" });
}

/* Las cuatro letras dicen que no */
export function sacudirLetras() {
  if (quieto()) return;
  document.querySelectorAll<HTMLElement>(".fa-c").forEach((el, i) => {
    el.animate?.([0, -7, 6, -4, 2, 0].map((x) => ({ transform: `translateX(${x}px)` })), { duration: 380, delay: i * 18, easing: "ease-out" });
  });
}

/* Al entrar, los cuatro mundos cierran la pantalla desde las esquinas y se abren sobre la app */
export function pase(navegar: () => void) {
  if (quieto() || !document.body.animate) return navegar();
  const capa = document.createElement("div");
  capa.className = "fa-pase"; capa.setAttribute("aria-hidden", "true");
  const piezas = MUNDOS.map((m) => { const e = document.createElement("span"); e.className = m.clase; e.textContent = m.letra; capa.appendChild(e); return e; });
  document.body.appendChild(capa);
  const desde = (i: number) => `translate3d(${i % 2 ? 101 : -101}%,${i < 2 ? -101 : 101}%,0)`;
  const ida = piezas.map((e, i) => e.animate([{ transform: desde(i) }, { transform: "none" }], { duration: 340, delay: i * 26, easing: CURVA, fill: "both" }));
  Promise.all(ida.map((a) => a.finished)).then(async () => {
    navegar();
    await new Promise((ok) => setTimeout(ok, 240));
    await Promise.all(piezas.map((e, i) => e.animate([{ transform: "none" }, { transform: desde(i) }], { duration: 380, delay: i * 22, easing: CURVA, fill: "both" }).finished));
    capa.remove();
  }).catch(() => { capa.remove(); navegar(); });
  /* Por si la pantalla queda en segundo plano y la animación nunca termina */
  setTimeout(() => capa.remove(), 3500);
}
