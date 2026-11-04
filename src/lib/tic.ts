/* Vibración corta: en Android con vibrate, en iPhone con el interruptor nativo, que da un toque háptico. */
let lab: HTMLLabelElement | null = null;
export function tic(ms: number | number[] = 10) {
  try {
    if (typeof navigator === "undefined") return;
    if (navigator.vibrate) { navigator.vibrate(ms); return; }
    if (!lab) {
      lab = document.createElement("label"); lab.style.cssText = "position:fixed;left:-99px;opacity:0;pointer-events:none";
      const i = document.createElement("input"); i.type = "checkbox"; i.setAttribute("switch", ""); lab.appendChild(i); document.body.appendChild(lab);
    }
    lab.click();
  } catch {}
}
