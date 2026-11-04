/* El botón crece hasta ser la pantalla, como al abrir una app en el iPhone. */
export function expandirBoton(el: HTMLElement, navegar: () => void) {
  if (matchMedia("(prefers-reduced-motion:reduce)").matches || !el.animate) return navegar();
  const r = el.getBoundingClientRect(), W = innerWidth, H = innerHeight, c = getComputedStyle(el);
  const capa = document.createElement("div"), dibu = el.cloneNode(true) as HTMLElement;
  capa.className = "zoom-capa";
  capa.style.cssText = `left:0;top:0;width:${W}px;height:${H}px;background:${c.backgroundImage}`;
  dibu.removeAttribute("style"); dibu.classList.add("zoom-copia"); dibu.style.cssText = `width:${r.width}px;height:${r.height}px;left:${r.left}px;top:${r.top}px`;
  capa.appendChild(dibu); document.body.appendChild(capa);
  const curva = "linear(0,.006,.025 2.8%,.101 6.1%,.539 18.9%,.721 25.3%,.849 31.5%,.937 38.1%,.968 41.8%,.991 45.7%,1.006 50.1%,1.015 55%,1.017 63.9%,1.001 85.9%,1)";
  const ida = capa.animate([{ clipPath: `inset(${r.top}px ${W - r.right}px ${H - r.bottom}px ${r.left}px round 30px)` }, { clipPath: "inset(0 0 0 0 round 0px)" }], { duration: 430, easing: curva, fill: "forwards" });
  dibu.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 170, fill: "forwards" });
  navegar();
  ida.finished.then(async () => { await capa.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 170, fill: "forwards" }).finished; capa.remove(); }).catch(() => capa.remove());
  setTimeout(() => capa.remove(), 1200);
}
