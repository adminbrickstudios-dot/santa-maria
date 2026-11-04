"use client";
import { useEffect, useRef } from "react";

/* El plano de Buenos Aires dibujándose: la portada de la app. */
const RUTAS = [
  [[-58.4155, -34.5797], [-58.4058, -34.5875], [-58.3931, -34.5956], [-58.3817, -34.6037], [-58.3725, -34.6083], [-58.3661, -34.6145]],
  [[-58.4426, -34.6197], [-58.4170, -34.6100], [-58.3926, -34.6096], [-58.3725, -34.6083], [-58.3661, -34.6145]],
  [[-58.4630, -34.5583], [-58.4312, -34.5757], [-58.4045, -34.5832], [-58.3768, -34.5915], [-58.3661, -34.6145]],
];
export function Ciudad() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const c = cv.getContext("2d")!;
    let lineas: number[][] = [], raf = 0, vivo = true;
    const redu = matchMedia("(prefers-reduced-motion:reduce)").matches;
    let t0 = 0;
    const pinta = (n: number) => {
      if (!vivo) return;
      const r = cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
      if (cv.width !== Math.round(r.width * d)) { cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d); }
      const W = r.width, H = r.height, s = Math.max(W / 0.135, H / 0.13);
      const px = (lo: number) => W * 0.5 + (lo + 58.405) * s * 0.823;
      const py = (la: number) => H * 0.40 - (la + 34.598) * s;
      c.setTransform(d, 0, 0, d, 0, 0);
      c.clearRect(0, 0, W, H);
      if (!redu && !t0) {
        if (!document.documentElement.classList.contains("intro-lista")) { raf = requestAnimationFrame(pinta); return; }
        t0 = n;
      }
      const t = redu ? 1 : Math.min(1, (n - t0) / 2600);
      c.strokeStyle = "rgba(255,255,255,.3)"; c.lineWidth = 1; c.beginPath();
      const hasta = Math.floor(lineas.length * Math.min(1, t * 1.6));
      for (let i = 0; i < hasta; i++) { const l = lineas[i]; c.moveTo(px(l[0]), py(l[1])); c.lineTo(px(l[2]), py(l[3])); }
      c.stroke();
      c.lineCap = "round"; c.lineJoin = "round";
      RUTAS.forEach((ru, i) => {
        const p = Math.max(0, Math.min(1, (t - 0.25 - i * 0.12) / 0.6)) * (ru.length - 1), k = Math.floor(p);
        c.strokeStyle = "#FFD21F"; c.lineWidth = i === 0 ? 3 : 2; c.globalAlpha = i === 0 ? 1 : 0.6; c.beginPath();
        c.moveTo(px(ru[0][0]), py(ru[0][1]));
        for (let j = 1; j <= k; j++) c.lineTo(px(ru[j][0]), py(ru[j][1]));
        let ex = px(ru[k][0]), ey = py(ru[k][1]);
        if (k < ru.length - 1) { const f = p - k; ex += (px(ru[k + 1][0]) - ex) * f; ey += (py(ru[k + 1][1]) - ey) * f; c.lineTo(ex, ey); }
        c.stroke(); c.globalAlpha = 1;
        c.fillStyle = "#FFD21F"; c.beginPath(); c.arc(ex, ey, i === 0 ? 5 : 3.5, 0, 7); c.fill();
      });
      if (t < 1) raf = requestAnimationFrame(pinta);
    };
    fetch("/data/avenidas.json").then((r) => r.json()).then((d) => {
      lineas = d.l.map((a: number[]) => [(a[0] + d.o[0]) / 1e5, (a[1] + d.o[1]) / 1e5, (a[2] + d.o[0]) / 1e5, (a[3] + d.o[1]) / 1e5]);
      raf = requestAnimationFrame(pinta);
    }).catch(() => {});
    const re = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(pinta); };
    addEventListener("resize", re);
    return () => { vivo = false; cancelAnimationFrame(raf); removeEventListener("resize", re); };
  }, []);
  return <canvas ref={ref} className="ciudad" aria-hidden="true" />;
}
