/* Atlas de carteles de una celda: dos columnas de carteles con el nombre real, dibujados en canvas. */
import * as THREE from "three";
import type { Cartel, Rubro } from "./tipos";

/** La tipografía real de la app sale de lo computado: next/font le pone un nombre con hash. */
let fuente: string | null = null;
const FUENTE = () => (fuente ??= getComputedStyle(document.body).fontFamily || "-apple-system, system-ui, sans-serif");
const FILA = 96, COL = 512;

function ajustar(ctx: CanvasRenderingContext2D, texto: string, max: number, alto: number, estilo: string) {
  let t = alto;
  ctx.font = `${estilo} ${t}px ${FUENTE()}`;
  const w = ctx.measureText(texto).width;
  if (w > max) { t = Math.max(18, Math.floor((t * max) / w)); ctx.font = `${estilo} ${t}px ${FUENTE()}`; }
  return t;
}

function icono(ctx: CanvasRenderingContext2D, r: Rubro, x: number, y: number, s: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = ctx.strokeStyle = r.texto;
  ctx.lineWidth = s * 0.11;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const b = () => ctx.beginPath();
  switch (r.id) {
    case "farmacia": {
      const a = s * 0.17, L = s * 0.46;
      ctx.fillRect(-a, -L, a * 2, L * 2);
      ctx.fillRect(-L, -a, L * 2, a * 2);
      break;
    }
    case "cafe": case "panaderia":
      b(); ctx.roundRect(-s * 0.36, -s * 0.2, s * 0.56, s * 0.5, s * 0.1); ctx.stroke();
      b(); ctx.arc(s * 0.26, s * 0.02, s * 0.14, -1.4, 1.4); ctx.stroke();
      break;
    case "restaurante": case "rapida":
      b(); ctx.moveTo(-s * 0.2, -s * 0.4); ctx.lineTo(-s * 0.2, s * 0.4); ctx.moveTo(s * 0.2, -s * 0.4); ctx.quadraticCurveTo(s * 0.34, -s * 0.05, s * 0.2, s * 0.05); ctx.lineTo(s * 0.2, s * 0.4); ctx.stroke();
      break;
    case "super": case "almacen": case "verduleria":
      b(); ctx.moveTo(-s * 0.42, -s * 0.3); ctx.lineTo(-s * 0.26, -s * 0.3); ctx.lineTo(-s * 0.12, s * 0.16); ctx.lineTo(s * 0.32, s * 0.16); ctx.lineTo(s * 0.4, -s * 0.16); ctx.lineTo(-s * 0.2, -s * 0.16); ctx.stroke();
      break;
    case "banco":
      b(); ctx.moveTo(-s * 0.42, -s * 0.08); ctx.lineTo(0, -s * 0.38); ctx.lineTo(s * 0.42, -s * 0.08); ctx.closePath(); ctx.fill();
      ctx.fillRect(-s * 0.32, -s * 0.02, s * 0.1, s * 0.3); ctx.fillRect(-s * 0.05, -s * 0.02, s * 0.1, s * 0.3); ctx.fillRect(s * 0.22, -s * 0.02, s * 0.1, s * 0.3);
      ctx.fillRect(-s * 0.42, s * 0.3, s * 0.84, s * 0.1);
      break;
    default:
      b(); ctx.arc(0, 0, s * 0.14, 0, 7); ctx.fill();
  }
  ctx.restore();
}

function letrero(ctx: CanvasRenderingContext2D, c: Cartel, x: number, y: number) {
  const W = COL, H = FILA;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, W, H);
  ctx.clip();
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  if (c.tipo === "calle") {
    ctx.fillStyle = "#17191D";
    ctx.fillRect(x, y, W, H);
    ctx.strokeStyle = "#E8E4D8";
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 6, y + 6, W - 12, H - 12);
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    ajustar(ctx, c.texto, W - 44, 56, "800");
    ctx.fillText(c.texto, x + W / 2, y + H / 2 + 3);
    ctx.restore();
    return;
  }
  if (c.tipo === "numero") {
    ctx.fillStyle = "#1B2A4A";
    ctx.fillRect(x, y, W, H);
    ctx.fillStyle = "#F2EFE6";
    ctx.textAlign = "center";
    ajustar(ctx, c.texto, W - 30, 78, "700");
    ctx.fillText(c.texto, x + W / 2, y + H / 2 + 4);
    ctx.restore();
    return;
  }
  const r = c.rubro!;
  ctx.fillStyle = r.color;
  ctx.fillRect(x, y, W, H);
  const g = ctx.createLinearGradient(0, y, 0, y + H);
  g.addColorStop(0, "rgba(255,255,255,.16)");
  g.addColorStop(0.5, "rgba(255,255,255,0)");
  g.addColorStop(1, "rgba(0,0,0,.2)");
  ctx.fillStyle = g;
  ctx.fillRect(x, y, W, H);
  ctx.fillStyle = "rgba(255,255,255,.28)";
  ctx.fillRect(x, y, W, 3);
  ctx.fillRect(x, y + H - 3, W, 3);
  icono(ctx, r, x + 50, y + H / 2, 60);
  ctx.fillStyle = r.texto;
  const estilo = r.id === "cafe" || r.id === "restaurante" ? "italic 700" : r.id === "ropa" ? "500" : "800";
  ajustar(ctx, c.texto, W - 112, 58, estilo);
  ctx.fillText(c.texto, x + 92, y + H / 2 + 3);
  ctx.restore();
}

export function crearAtlas(carteles: Cartel[], filas: number, escala: number, anisotropia: number): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = Math.round(COL * 2 * escala);
  cv.height = Math.round(FILA * filas * escala);
  const ctx = cv.getContext("2d")!;
  ctx.scale(escala, escala);
  ctx.fillStyle = "#333";
  ctx.fillRect(0, 0, COL * 2, FILA * filas);
  for (const c of carteles) letrero(ctx, c, (c.slot % 2) * COL, Math.floor(c.slot / 2) * FILA);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = anisotropia;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/** Nombre del local para la pared del interior. */
export function texturaNombre(nombre: string, r: Rubro): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = 1024; cv.height = 192;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = r.color;
  ctx.fillRect(0, 0, 1024, 192);
  ctx.fillStyle = "rgba(255,255,255,.18)";
  ctx.fillRect(0, 0, 1024, 5);
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillStyle = r.texto;
  ajustar(ctx, nombre, 930, 112, "800");
  ctx.fillText(nombre, 512, 100);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}
