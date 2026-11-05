"use client";
/* Mini mapa dibujado en un canvas 2D: no abre un segundo WebGL y se dibuja cinco veces por segundo sin pasar por React. */
import { useEffect, useRef } from "react";
import { metrosTile, z16DeLonLat } from "@/lib/calle/ciudad";
import type { ClienteCiudad } from "@/lib/calle/cliente";
import type { LineasMapa } from "@/lib/calle/nucleo";
import type { Motor } from "@/lib/calle/motor";

const M = metrosTile(-34.6), RADIO = 230;
const plano = (lat: number, lon: number) => { const t = z16DeLonLat(lon, lat); return { x: t.x * M, y: t.y * M }; };

export function MiniMapa({ motor, cliente, abrir }: { motor: () => Motor | null; cliente: ClienteCiudad | null; abrir: () => void }) {
  const lienzo = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = lienzo.current;
    if (!c || !cliente) return;
    const g = c.getContext("2d", { alpha: false });
    if (!g) return;
    let centro: { x: number; y: number } | null = null, lineas: LineasMapa | null = null, pidiendo = false, vivo = true;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const oscuro = () => { const t = document.documentElement.getAttribute("data-theme"); return t === "dark" || (!t && matchMedia("(prefers-color-scheme:dark)").matches); };

    const trazar = (l: Float32Array, cx: number, cy: number, k: number, S: number) => {
      g.beginPath();
      let nuevo = true;
      for (let i = 0; i < l.length; i += 2) {
        const x = l[i], y = l[i + 1];
        if (Number.isNaN(x)) { nuevo = true; continue; }
        const px = S / 2 + (x - cx) * k, py = S / 2 + (y - cy) * k;
        if (nuevo) g.moveTo(px, py); else g.lineTo(px, py);
        nuevo = false;
      }
      g.stroke();
    };

    const dibujar = () => {
      const m = motor();
      if (!m || !vivo) return;
      const S = c.clientWidth;
      if (!S) return;
      if (c.width !== Math.round(S * dpr)) { c.width = c.height = Math.round(S * dpr); }
      const e = m.estadoMapa(), p = plano(e.lat, e.lon), k = S / (2 * RADIO), tinta = oscuro();
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = tinta ? "#20262B" : "#ECEEE7";
      g.fillRect(0, 0, S, S);
      if (!pidiendo && (!centro || Math.hypot(p.x - centro.x, p.y - centro.y) > 130)) {
        pidiendo = true;
        const q = p;
        cliente.vias({ lat: e.lat, lon: e.lon }, 460).then((l) => { lineas = l; centro = q; }).catch(() => {}).finally(() => { pidiendo = false; });
      }
      if (lineas && centro) {
        const cx = p.x - centro.x, cy = p.y - centro.y;
        g.lineCap = "round"; g.lineJoin = "round";
        g.strokeStyle = tinta ? "#3B444A" : "#FFFFFF"; g.lineWidth = 2.2;
        trazar(lineas.calles, cx, cy, k, S);
        g.strokeStyle = tinta ? "#5C5230" : "#F7DE8D"; g.lineWidth = 3.6;
        trazar(lineas.avenidas, cx, cy, k, S);
      }
      const r = e.ruta;
      if (r.length >= 4) {
        g.strokeStyle = "#1F8BFF"; g.lineWidth = 3.4; g.lineCap = "round"; g.lineJoin = "round";
        g.beginPath();
        g.moveTo(S / 2, S / 2);
        for (let i = 0; i < r.length; i += 2) { const u = plano(r[i], r[i + 1]); g.lineTo(S / 2 + (u.x - p.x) * k, S / 2 + (u.y - p.y) * k); }
        g.stroke();
        /* El destino: si queda lejos, una marca en el borde que indica para dónde */
        const u = plano(r[r.length - 2], r[r.length - 1]);
        let px = (u.x - p.x) * k, py = (u.y - p.y) * k;
        const lim = S / 2 - 9, d = Math.max(Math.abs(px), Math.abs(py));
        if (d > lim) { px *= lim / d; py *= lim / d; }
        g.fillStyle = "#E5322E"; g.strokeStyle = "#FFF"; g.lineWidth = 2;
        g.beginPath(); g.arc(S / 2 + px, S / 2 + py, 6.5, 0, 6.3); g.fill(); g.stroke();
      }
      /* Vos: flecha con tu rumbo */
      g.save();
      g.translate(S / 2, S / 2);
      g.rotate((e.rumbo * Math.PI) / 180);
      g.fillStyle = "#1F8BFF"; g.strokeStyle = "#FFF"; g.lineWidth = 2; g.lineJoin = "round";
      g.beginPath(); g.moveTo(0, -11); g.lineTo(8, 8); g.lineTo(0, 4); g.lineTo(-8, 8); g.closePath(); g.fill(); g.stroke();
      g.restore();
    };
    dibujar();
    const t = setInterval(dibujar, 200);
    return () => { vivo = false; clearInterval(t); };
  }, [motor, cliente]);

  return <button className="calle-mini" onClick={abrir} aria-label="Abrir el mapa para elegir adónde ir"><canvas ref={lienzo} aria-hidden="true" /></button>;
}
