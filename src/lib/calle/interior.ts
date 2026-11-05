/* Interior ilustrativo de un local: se genera según el rubro. No es el local real: sin marcas, sin fotos y sin personas.
   Cada escena tiene un mostrador de recepción, porque ahí se habla con el lugar. */
import * as THREE from "three";
import { escenaDe, type Escena } from "./categoria-lugar";
import { hash, hashTexto } from "./geo";
import { texturaNombre } from "./carteles";
import { crearComunes, matObjeto } from "./materiales";
import { P_EMISIVO, caja, fundir, hex, type Parte } from "./objetos";
import type { Local } from "./tipos";

export interface Caja2D { x0: number; x1: number; z0: number; z1: number }

export interface Interior {
  escena: THREE.Scene;
  tipo: Escena | "pasillo";
  ancho: number;
  fondo: number;
  obstaculos: Caja2D[];
  entrada: { x: number; z: number; yaw: number };
  /** Dónde está el mostrador, si hay. */
  mostrador: { x: number; z: number } | null;
  /** Si caminando hasta la puerta se sale a la calle. */
  puerta: boolean;
  destruir(): void;
}

type Bloq = (x: number, z: number, w: number, d: number) => void;
interface Armado { p: Parte[]; bloq: Bloq; color: number[]; W: number; D: number; H: number; sem: number; textos: { texto: string; x: number; y: number; z: number; ry: number; ancho: number; fondo?: string }[]; mostrador: { x: number; z: number } | null }

const PRODUCTOS = ["#E85D4A", "#F2B134", "#3FA7D6", "#59C9A5", "#F6F1E7", "#8E6BBF", "#EE8FB0", "#4C6FBF", "#7DBE4E"].map(hex);
const METAL = hex("#3A3A42"), ACERO = hex("#B9BEC4"), NEGRO = hex("#26272C"), BLANCO = hex("#F4F3EE"), CREMA = hex("#EFE3D0"), TELA = hex("#4A6078"), VIDRIO = [0.72, 0.85, 0.92];

/* [ancho, fondo, alto, piso A, piso B, pared] */
const DIM: Record<Escena, [number, number, number, string, string, string]> = {
  farmacia: [9, 11, 3.2, "#E9ECE8", "#DDE2DD", "#F2F6F3"],
  cafe: [9, 11, 3.2, "#A8785A", "#94694E", "#EFE3D0"],
  restaurante: [11, 13, 3.4, "#7C5A44", "#6C4C38", "#E6D8C4"],
  super: [13, 16, 3.4, "#E5E2DA", "#D6D3CA", "#F0EDE6"],
  ropa: [9, 11, 3.4, "#B9A78F", "#AB9880", "#EDE9E4"],
  gimnasio: [13, 14, 3.6, "#3C3F46", "#34373D", "#E4E6EA"],
  banco: [11, 12, 4, "#D8D2C6", "#C7C0B2", "#EFEBE2"],
  hotel: [13, 13, 4.6, "#C9B79A", "#B7A586", "#EEE6D6"],
  museo: [14, 16, 4.8, "#CFC9BD", "#C2BCB0", "#F6F4EF"],
  iglesia: [13, 24, 8, "#BDB6A8", "#A9A294", "#E9E2D2"],
  facultad: [13, 13, 3.6, "#C9C4B8", "#BBB6AA", "#EEECE4"],
  oficina: [12, 12, 3.1, "#AEB4BA", "#A2A8AE", "#EEF0F2"],
  peluqueria: [9, 11, 3.2, "#2F2F36", "#EDE9E2", "#F3EEEA"],
  kiosco: [6, 7, 3, "#D9D4C9", "#C6C1B6", "#F0EDE6"],
  hospital: [13, 13, 3.2, "#DCE4E6", "#D0D9DC", "#F1F6F6"],
  generico: [9, 11, 3.2, "#D9D4C9", "#C6C1B6", "#F0EDE6"],
};

function estante(p: Parte[], x: number, z: number, largo: number, fondo: number, alto: number, enX: boolean, madera: number[], sem: number) {
  const pisos = Math.max(3, Math.round(alto / 0.42));
  const w = enX ? largo : fondo, d = enX ? fondo : largo;
  p.push(caja(w, 0.12, d, x, 0.06, z, madera));
  for (const s of [-1, 1]) p.push(enX ? caja(0.05, alto, fondo, x + (s * largo) / 2, alto / 2, z, madera) : caja(fondo, alto, 0.05, x, alto / 2, z + (s * largo) / 2, madera));
  p.push(caja(enX ? largo : 0.04, alto, enX ? 0.04 : largo, x, alto / 2, z, madera.map((v) => v * 0.8)));
  for (let i = 1; i <= pisos; i++) {
    const y = (i * alto) / pisos;
    p.push(caja(w, 0.03, d, x, y, z, madera));
    if (i === pisos) continue;
    const n = Math.floor(largo / 0.22);
    for (const lado of [-1, 1]) for (let k = 0; k < n; k++) {
      const r = hash(sem + k * 31, i * 7 + lado);
      if (r < 0.14) continue;
      const a = 0.14 + r * 0.05, h = 0.14 + r * 0.16, of = -largo / 2 + (k + 0.5) * (largo / n), lat = lado * fondo * 0.27;
      const col = PRODUCTOS[Math.floor(r * 91) % PRODUCTOS.length];
      p.push(enX ? caja(a, h, 0.14, x + of, y + h / 2 + 0.015, z + lat, col) : caja(0.14, h, a, x + lat, y + h / 2 + 0.015, z + of, col));
    }
  }
}

function silla(p: Parte[], x: number, z: number, g: number, c: number[]) {
  const dx = Math.sin(g), dz = Math.cos(g);
  p.push(caja(0.42, 0.05, 0.42, x, 0.45, z, c));
  for (const [a, b] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) p.push(caja(0.04, 0.45, 0.04, x + a * 0.17, 0.22, z + b * 0.17, METAL));
  p.push(caja(Math.abs(dz) * 0.42 + 0.04, 0.42, Math.abs(dx) * 0.42 + 0.04, x - dx * 0.2, 0.68, z - dz * 0.2, c));
}

function mesaRedonda(p: Parte[], x: number, z: number, sem: number, tapa: number[]) {
  const t = new THREE.CylinderGeometry(0.5, 0.5, 0.05, 12);
  t.translate(x, 0.75, z);
  p.push({ geo: t, color: tapa });
  p.push(caja(0.06, 0.74, 0.06, x, 0.37, z, METAL));
  const taza = new THREE.CylinderGeometry(0.05, 0.04, 0.08, 8);
  taza.translate(x + 0.14, 0.82, z - 0.08);
  p.push({ geo: taza, color: BLANCO });
  for (let i = 0; i < 2; i++) {
    const a = sem + i * Math.PI;
    silla(p, x + Math.cos(a) * 0.85, z + Math.sin(a) * 0.85, Math.round(a / (Math.PI / 2)) * (Math.PI / 2), hex("#8B5A3C"));
  }
}

function mesaLarga(p: Parte[], x: number, z: number, mantel: number[], silCol: number[]) {
  p.push(caja(1.5, 0.05, 0.86, x, 0.75, z, mantel));
  p.push(caja(1.42, 0.7, 0.78, x, 0.38, z, mantel.map((v) => v * 0.9)));
  for (const s of [-0.42, 0.42]) {
    for (const lado of [-1, 1]) silla(p, x + s, z + lado * 0.74, lado > 0 ? Math.PI : 0, silCol);
    const pl = new THREE.CylinderGeometry(0.13, 0.11, 0.02, 12);
    pl.translate(x + s, 0.79, z - 0.2);
    p.push({ geo: pl, color: BLANCO });
    const pl2 = new THREE.CylinderGeometry(0.13, 0.11, 0.02, 12);
    pl2.translate(x + s, 0.79, z + 0.2);
    p.push({ geo: pl2, color: BLANCO });
  }
}

function perchero(p: Parte[], x: number, z: number, largo: number, sem: number) {
  p.push(caja(0.04, 1.55, 0.04, x - largo / 2, 0.78, z, METAL), caja(0.04, 1.55, 0.04, x + largo / 2, 0.78, z, METAL), caja(largo, 0.03, 0.03, x, 1.52, z, METAL));
  const n = Math.floor(largo / 0.17);
  for (let i = 0; i < n; i++) {
    const r = hash(sem, i), h = 0.72 + r * 0.32;
    p.push(caja(0.07, h, 0.46, x - largo / 2 + (i + 0.5) * (largo / n), 1.48 - h / 2, z, PRODUCTOS[Math.floor(r * 53) % PRODUCTOS.length]));
  }
}

function planta(p: Parte[], x: number, z: number) {
  const m = new THREE.CylinderGeometry(0.28, 0.22, 0.5, 8);
  m.translate(x, 0.25, z);
  const h = new THREE.IcosahedronGeometry(0.62, 0);
  h.translate(x, 1.05, z);
  p.push({ geo: m, color: hex("#B06A4C") }, { geo: h, color: hex("#5F9A4A") });
}

function cuadro(p: Parte[], x: number, y: number, z: number, w: number, h: number, sem: number, enX = true) {
  const m = 0.08;
  p.push(enX ? caja(w + m, h + m, 0.05, x, y, z, hex("#3A2E25")) : caja(0.05, h + m, w + m, x, y, z, hex("#3A2E25")));
  /* Manchas de color: un cuadro abstracto, nunca una foto */
  for (let i = 0; i < 5; i++) {
    const c = PRODUCTOS[Math.floor(hash(sem, i) * PRODUCTOS.length)], a = w * (0.25 + hash(sem + 1, i) * 0.4), b = h * (0.25 + hash(sem + 2, i) * 0.4);
    const ox = (hash(sem + 3, i) - 0.5) * (w - a), oy = (hash(sem + 4, i) - 0.5) * (h - b);
    p.push(enX ? caja(a, b, 0.06 + i * 0.002, x + ox, y + oy, z, c) : caja(0.06 + i * 0.002, b, a, x, y + oy, z + ox, c));
  }
}

function sillon(p: Parte[], x: number, z: number, largo: number, enX: boolean, c: number[]) {
  const w = enX ? largo : 0.8, d = enX ? 0.8 : largo;
  p.push(caja(w, 0.4, d, x, 0.2, z, c), caja(enX ? largo : 0.2, 0.42, enX ? 0.2 : largo, x + (enX ? 0 : 0.3), 0.62, z + (enX ? 0.3 : 0), c.map((v) => v * 0.9)));
}

function mostrador(a: Armado, x: number, z: number, w: number, frente: number[], tapa: number[], letrero = "Recepción") {
  const { p, bloq } = a;
  p.push(caja(w, 1.05, 0.7, x, 0.53, z, frente), caja(w + 0.1, 0.05, 0.8, x, 1.08, z, tapa));
  bloq(x, z, w + 0.2, 0.9);
  /* Pantalla y timbre: siempre hay algo que indique dónde hablar */
  p.push(caja(0.48, 0.32, 0.03, x + w * 0.2, 1.3, z - 0.1, NEGRO), caja(0.42, 0.26, 0.04, x + w * 0.2, 1.3, z - 0.1, [0.5, 0.8, 0.95], P_EMISIVO), caja(0.05, 0.14, 0.05, x + w * 0.2, 1.17, z - 0.1, METAL));
  const t = new THREE.CylinderGeometry(0.02, 0.07, 0.07, 10);
  t.translate(x - w * 0.2, 1.14, z + 0.12);
  p.push({ geo: t, color: hex("#D9A441") });
  a.mostrador = { x, z: z + 0.9 };
  a.textos.push({ texto: letrero, x, y: Math.min(a.H - 0.5, 2.3), z: z - 0.34, ry: 0, ancho: Math.min(w, 2.4) });
}

function escenaFarmacia(a: Armado) {
  const { p, bloq, W, D, sem, color } = a;
  for (const s of [-1, 1]) { estante(p, s * (W / 2 - 0.3), 0.5, 7, 0.5, 2.3, false, BLANCO, sem + s); bloq(s * (W / 2 - 0.3), 0.5, 0.6, 7); }
  estante(p, -2.3, -D / 2 + 0.3, 3.4, 0.45, 2.3, true, BLANCO, sem + 5);
  estante(p, 2.3, -D / 2 + 0.3, 3.4, 0.45, 2.3, true, BLANCO, sem + 6);
  bloq(0, -D / 2 + 0.3, 8, 0.5);
  estante(p, 0, 1.2, 3, 0.6, 1.3, true, BLANCO, sem + 8); bloq(0, 1.2, 3.1, 0.7);
  mostrador(a, 0, -2.4, 6, BLANCO, color);
  p.push(caja(0.72, 0.22, 0.08, 0, 2.5, -D / 2 + 0.06, [0.1, 0.8, 0.42], P_EMISIVO), caja(0.22, 0.72, 0.08, 0, 2.5, -D / 2 + 0.06, [0.1, 0.8, 0.42], P_EMISIVO));
}

function escenaCafe(a: Armado) {
  const { p, bloq, D, sem } = a;
  mostrador(a, -0.6, -3.6, 5.6, hex("#6F4E37"), CREMA, "Pedí acá");
  p.push(caja(0.7, 0.42, 0.42, -1.9, 1.32, -3.6, ACERO), caja(0.08, 0.16, 0.08, -1.7, 1.02, -3.3, METAL));
  p.push(caja(1.3, 0.36, 0.5, 1, 1.3, -3.6, VIDRIO, P_EMISIVO));
  for (let i = 0; i < 5; i++) { const d = new THREE.CylinderGeometry(0.08, 0.09, 0.05, 10); d.translate(0.5 + i * 0.25, 1.17, -3.5); p.push({ geo: d, color: hex(i % 2 ? "#C98B3A" : "#8B5A3C") }); }
  estante(p, 1.4, -D / 2 + 0.28, 4, 0.4, 2.2, true, hex("#8A5F3F"), sem + 3);
  bloq(1.4, -D / 2 + 0.28, 4.1, 0.5);
  [[-2.8, -0.8], [2.8, -0.8], [-2.8, 2.2], [2.8, 2.2]].forEach(([x, z], i) => { mesaRedonda(p, x, z, sem + i, hex("#D8BE9A")); bloq(x, z, 2.1, 1.1); });
  cuadro(p, -a.W / 2 + 0.05, 1.9, 0.5, 1.6, 1, sem, false);
  planta(p, a.W / 2 - 0.7, -2.6); bloq(a.W / 2 - 0.7, -2.6, 0.7, 0.7);
}

function escenaRestaurante(a: Armado) {
  const { p, bloq, W, D, sem, color } = a;
  mostrador(a, -W / 2 + 2.3, -D / 2 + 1.1, 3.6, hex("#4E3528"), hex("#C9A577"), "Reservas");
  p.push(caja(3, 1, 0.12, 2, 1.9, -D / 2 + 0.06, [1, 0.84, 0.6], P_EMISIVO));
  estante(p, 2, -D / 2 + 0.3, 4.4, 0.4, 0.95, true, hex("#5A3A2A"), sem + 2);
  bloq(2, -D / 2 + 0.3, 4.5, 0.5);
  const mantel = hash(sem, 1) > 0.5 ? hex("#F2EEE3") : hex("#7E2B2B");
  for (const x of [-3.3, 3.3]) for (const z of [-1.8, 1.6]) { mesaLarga(p, x, z, mantel, hex("#6F4E37")); bloq(x, z, 1.7, 2.1); }
  for (const [x, z] of [[-3.3, -1.8], [3.3, -1.8], [-3.3, 1.6], [3.3, 1.6]]) {
    p.push(caja(0.02, 0.9, 0.02, x, a.H - 0.45, z, METAL), caja(0.42, 0.18, 0.42, x, a.H - 0.98, z, [1, 0.86, 0.6], P_EMISIVO));
  }
  cuadro(p, W / 2 - 0.05, 1.9, -1, 2, 1.2, sem + 7, false);
  cuadro(p, -W / 2 + 0.05, 1.9, 2, 2, 1.2, sem + 9, false);
  void color;
}

function escenaSuper(a: Armado) {
  const { p, bloq, W, D, sem, color } = a;
  for (const x of [-4.2, -1.4, 1.4, 4.2]) { estante(p, x, -2, 7.6, 0.9, 1.9, false, hex("#E9E6DF"), sem + x * 3); bloq(x, -2, 1, 7.7); }
  estante(p, 2, -D / 2 + 0.4, 7.5, 0.6, 2.2, true, hex("#E9E6DF"), sem + 9); bloq(2, -D / 2 + 0.4, 7.6, 0.7);
  /* Heladeras al fondo y cajones de fruta a un lado */
  for (let i = 0; i < 3; i++) { p.push(caja(0.7, 2, 0.7, -W / 2 + 0.5, 1, -5.5 + i * 1, [0.68, 0.84, 0.96], P_EMISIVO), caja(0.72, 0.12, 0.72, -W / 2 + 0.5, 2.06, -5.5 + i * 1, METAL)); }
  bloq(-W / 2 + 0.5, -4.5, 0.8, 3.2);
  for (let i = 0; i < 3; i++) {
    const x = W / 2 - 0.6, z = 3.2 + i * 1;
    p.push(caja(0.9, 0.7, 0.9, x, 0.35, z, hex("#A9805A")));
    for (let k = 0; k < 8; k++) { const f = new THREE.IcosahedronGeometry(0.1, 0); f.translate(x - 0.3 + (k % 3) * 0.3, 0.8, z - 0.3 + Math.floor(k / 3) * 0.3); p.push({ geo: f, color: PRODUCTOS[(i * 3 + k) % 3 === 0 ? 0 : (i * 3 + k) % 3 === 1 ? 1 : 8] }); }
  }
  bloq(W / 2 - 0.6, 4.2, 1, 3.2);
  p.push(caja(1.8, 0.95, 0.75, -4.4, 0.48, 4.6, hex("#3D4148")), caja(1.84, 0.04, 0.8, -4.4, 0.98, 4.6, color));
  bloq(-4.4, 4.6, 1.9, 0.85);
  mostrador(a, -1, 4.2, 3, color.map((v) => v * 0.9), hex("#EFE9DD"), "Atención al cliente");
}

function escenaRopa(a: Armado) {
  const { p, bloq, W, D, sem } = a;
  [[-2.5, -2.2], [2.5, -2.2], [-2.5, 1.4], [2.5, 1.4]].forEach(([x, z], i) => { perchero(p, x, z, 2.8, sem + i); bloq(x, z, 2.9, 0.6); });
  for (let i = 0; i < 2; i++) {
    const z = -2.4 + i * 1.5;
    p.push(caja(0.04, 2.1, 1.2, -W / 2 + 1.3, 1.05, z, hex("#6E5F52")), caja(1.2, 0.05, 1.2, -W / 2 + 0.7, 2.1, z, hex("#6E5F52")));
  }
  p.push(caja(0.05, 2.3, 1, W / 2 - 0.05, 1.2, -1, VIDRIO, P_EMISIVO));
  estante(p, -2, -D / 2 + 0.3, 3.8, 0.45, 2.3, true, hex("#2F2F36"), sem + 8); bloq(-2, -D / 2 + 0.3, 3.9, 0.55);
  mostrador(a, 2.4, -D / 2 + 1, 3, hex("#3A3A42"), hex("#EDE9E4"), "Caja");
}

function cinta(p: Parte[], bloq: Bloq, x: number, z: number) {
  p.push(caja(0.8, 0.14, 1.9, x, 0.14, z, NEGRO), caja(0.62, 0.02, 1.7, x, 0.22, z, hex("#55585F")));
  p.push(caja(0.06, 1.2, 0.06, x - 0.36, 0.72, z - 0.8, ACERO), caja(0.06, 1.2, 0.06, x + 0.36, 0.72, z - 0.8, ACERO), caja(0.8, 0.26, 0.1, x, 1.34, z - 0.84, NEGRO), caja(0.5, 0.16, 0.02, x, 1.36, z - 0.78, [0.4, 0.85, 0.65], P_EMISIVO));
  bloq(x, z, 0.9, 2);
}

function escenaGimnasio(a: Armado) {
  const { p, bloq, W, D, color } = a;
  mostrador(a, -W / 2 + 2.2, D / 2 - 2.8, 3.2, color, hex("#EFE9DD"));
  for (let i = 0; i < 4; i++) cinta(p, bloq, -3.6 + i * 2.4, -D / 2 + 1.7);
  p.push(caja(W - 1, 2.2, 0.04, 0, 1.3, -D / 2 + 0.04, VIDRIO, P_EMISIVO));
  /* Mancuernas, bancos y colchonetas */
  p.push(caja(0.5, 0.9, 3.4, W / 2 - 0.4, 0.45, 0, METAL));
  for (let i = 0; i < 8; i++) for (const y of [0.34, 0.74]) {
    const d = new THREE.CylinderGeometry(0.09, 0.09, 0.32, 8);
    d.rotateZ(Math.PI / 2);
    d.translate(W / 2 - 0.4, y + 0.14, -1.45 + i * 0.42);
    p.push({ geo: d, color: i % 2 ? NEGRO : hex("#C33F3F") });
  }
  bloq(W / 2 - 0.4, 0, 0.6, 3.5);
  for (const z of [-2, 1.2]) {
    p.push(caja(0.34, 0.08, 1.3, 2, 0.46, z, NEGRO), caja(0.08, 0.42, 0.08, 2, 0.22, z - 0.5, METAL), caja(0.08, 0.42, 0.08, 2, 0.22, z + 0.5, METAL));
    p.push(caja(0.05, 1.2, 0.05, 1.5, 0.6, z - 0.6, METAL), caja(0.05, 1.2, 0.05, 2.5, 0.6, z - 0.6, METAL), caja(1.9, 0.04, 0.04, 2, 1.16, z - 0.6, ACERO));
    for (const s of [-1, 1]) { const r = new THREE.CylinderGeometry(0.22, 0.22, 0.05, 12); r.rotateZ(Math.PI / 2); r.translate(2 + s * 0.84, 1.16, z - 0.6); p.push({ geo: r, color: NEGRO }); }
    bloq(2, z, 1.4, 1.6);
  }
  for (let i = 0; i < 3; i++) p.push(caja(1, 0.03, 1.9, -4 + i * 1.3, 0.02, -0.5, PRODUCTOS[(i * 2 + 2) % 9]));
}

function escenaBanco(a: Armado) {
  const { p, bloq, W, D, color } = a;
  mostrador(a, -1, -D / 2 + 1.6, 7.4, hex("#4A4A52"), hex("#E6E0D2"), "Atención");
  for (let i = 0; i < 4; i++) p.push(caja(0.04, 0.9, 0.5, -3.6 + i * 2.2, 1.55, -D / 2 + 1.6, VIDRIO, P_EMISIVO));
  /* Cajeros automáticos sin marca */
  for (let i = 0; i < 2; i++) {
    const z = 0.4 + i * 1.5;
    p.push(caja(0.7, 1.7, 1, W / 2 - 0.4, 0.85, z, hex("#D0D2D6")), caja(0.04, 0.42, 0.56, W / 2 - 0.77, 1.32, z, [0.38, 0.7, 0.9], P_EMISIVO), caja(0.04, 0.2, 0.4, W / 2 - 0.77, 0.98, z, NEGRO));
  }
  bloq(W / 2 - 0.4, 1.15, 0.8, 2.7);
  /* Fila con postes */
  for (let i = 0; i < 4; i++) {
    const x = -3 + i * 1.3;
    p.push(caja(0.07, 0.95, 0.07, x, 0.48, -1.6, ACERO), caja(0.26, 0.03, 0.26, x, 0.02, -1.6, ACERO));
    if (i < 3) p.push(caja(1.26, 0.03, 0.03, x + 0.65, 0.82, -1.6, color));
  }
  bloq(-1.05, -1.6, 4.2, 0.3);
  for (const x of [-3.4, -1.6]) { p.push(caja(1.5, 0.08, 0.5, x, 0.46, 1.6, hex("#7A6A58")), caja(1.5, 0.45, 0.08, x, 0.72, 1.82, hex("#7A6A58")), caja(0.08, 0.44, 0.4, x, 0.22, 1.6, METAL)); bloq(x, 1.65, 1.6, 0.7); }
  p.push(caja(0.34, 1.3, 0.34, -W / 2 + 0.7, 0.65, 2, hex("#C33F3F")), caja(0.26, 0.18, 0.02, -W / 2 + 0.7, 1.1, 2.18, [0.9, 0.9, 0.8], P_EMISIVO));
  bloq(-W / 2 + 0.7, 2, 0.5, 0.5);
}

function escenaHotel(a: Armado) {
  const { p, bloq, W, D, H, sem } = a;
  mostrador(a, 0, -D / 2 + 2, 5.4, hex("#4B3A2E"), hex("#DCC9A3"));
  p.push(caja(5.6, 1.9, 0.04, 0, 1.9, -D / 2 + 0.08, hex("#6B4F3B")));
  for (let i = 0; i < 12; i++) p.push(caja(0.26, 0.16, 0.03, -2.2 + (i % 6) * 0.88, 2.1 - Math.floor(i / 6) * 0.5, -D / 2 + 0.12, hex("#C9A65A")));
  for (const s of [-1, 1]) {
    p.push(caja(0.55, H, 0.55, s * 3.2, H / 2, -0.8, hex("#E2D8C4")), caja(0.55, H, 0.55, s * 3.2, H / 2, 3, hex("#E2D8C4")));
    bloq(s * 3.2, -0.8, 0.65, 0.65); bloq(s * 3.2, 3, 0.65, 0.65);
    p.push(caja(0.9, 0.05, 2, s * (W / 2 - 1.5), 0.32, 1, hex("#6B4F3B")), caja(0.06, 0.32, 0.06, s * (W / 2 - 1.5), 0.16, 1, METAL));
    bloq(s * (W / 2 - 1.5), 1, 1, 2.1);
    sillon(p, s * (W / 2 - 0.55), 1, 2.6, false, hex("#6E8491"));
    bloq(s * (W / 2 - 0.55), 1, 0.9, 2.7);
    planta(p, s * (W / 2 - 0.8), -D / 2 + 1); bloq(s * (W / 2 - 0.8), -D / 2 + 1, 0.7, 0.7);
    cuadro(p, s * (W / 2 - 0.05), 2.4, 3.6, 1.6, 1, sem + s, false);
  }
  p.push(caja(4.6, 0.02, 5, 0, 0.012, 1.8, hex("#7E2B2B")), caja(4.2, 0.021, 4.6, 0, 0.013, 1.8, hex("#B98F52")), caja(3.9, 0.022, 4.3, 0, 0.014, 1.8, hex("#7E2B2B")));
  /* Ascensor del lobby */
  p.push(caja(1.5, 2.3, 0.05, W / 2 - 1.2, 1.15, -D / 2 + 0.06, ACERO), caja(0.02, 2.3, 0.06, W / 2 - 1.2, 1.15, -D / 2 + 0.07, METAL), caja(0.5, 0.14, 0.03, W / 2 - 1.2, 2.5, -D / 2 + 0.08, [0.95, 0.6, 0.2], P_EMISIVO));
  const l = new THREE.CylinderGeometry(0.9, 0.3, 0.7, 10);
  l.translate(0, H - 0.5, 1.4);
  p.push({ geo: l, color: [1, 0.9, 0.68] });
}

function escenaMuseo(a: Armado) {
  const { p, bloq, W, D, sem, H } = a;
  for (let i = 0; i < 3; i++) { cuadro(p, -W / 2 + 0.05, 2.1, -5 + i * 4.2, 2.6, 1.8, sem + i * 5, false); cuadro(p, W / 2 - 0.05, 2.1, -5 + i * 4.2, 2.6, 1.8, sem + i * 5 + 40, false); }
  cuadro(p, -3, 2.3, -D / 2 + 0.05, 3.6, 2.4, sem + 90);
  mostrador(a, 3.5, -D / 2 + 1.5, 4, hex("#D9D5CC"), hex("#3A3A42"), "Boletería");
  /* Tabiques, plintos y esculturas abstractas */
  p.push(caja(0.2, H - 1, 4.2, -2.4, (H - 1) / 2, -1.2, hex("#ECEAE3")), caja(0.2, H - 1, 4.2, 2.4, (H - 1) / 2, -1.2, hex("#ECEAE3")));
  bloq(-2.4, -1.2, 0.3, 4.3); bloq(2.4, -1.2, 0.3, 4.3);
  cuadro(p, -2.27, 2, -1.2, 2.4, 1.6, sem + 60, false);
  cuadro(p, 2.27, 2, -1.2, 2.4, 1.6, sem + 70, false);
  for (const [x, z, f] of [[0, 3.6, 0], [-4.6, 3.6, 1], [4.6, 3.6, 2]] as const) {
    p.push(caja(0.9, 0.9, 0.9, x, 0.45, z, BLANCO));
    const g = f === 0 ? new THREE.TorusKnotGeometry(0.3, 0.1, 40, 8) : f === 1 ? new THREE.DodecahedronGeometry(0.42, 0) : new THREE.ConeGeometry(0.34, 1, 6);
    g.translate(x, 1.42, z);
    p.push({ geo: g, color: f === 0 ? hex("#B5774A") : f === 1 ? hex("#7F8A92") : hex("#4C6FBF") });
    bloq(x, z, 1, 1);
  }
  p.push(caja(2, 0.45, 0.6, 0, 0.23, 0.4, hex("#5C4A3B"))); bloq(0, 0.4, 2.1, 0.7);
  for (let i = -1; i <= 1; i++) p.push(caja(W * 0.8, 0.05, 0.1, 0, H - 0.8, i * 4.6, [1, 0.97, 0.88], P_EMISIVO));
}

function escenaIglesia(a: Armado) {
  const { p, bloq, W, D, H, sem } = a;
  /* Bancas a los dos lados, con pasillo al medio */
  for (let f = 0; f < 8; f++) for (const s of [-1, 1]) {
    const z = -6 + f * 1.7, x = s * 3.3;
    p.push(caja(4, 0.07, 0.42, x, 0.45, z, hex("#5A3A2A")), caja(4, 0.55, 0.06, x, 0.8, z + 0.22, hex("#5A3A2A")), caja(0.08, 0.45, 0.4, x - 1.9, 0.22, z, hex("#4A2F22")), caja(0.08, 0.45, 0.4, x + 1.9, 0.22, z, hex("#4A2F22")));
    bloq(x, z, 4.1, 0.6);
  }
  /* Columnas y vitrales de colores */
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
    const z = -8 + i * 5.4;
    p.push(caja(0.7, H, 0.7, s * (W / 2 - 0.7), H / 2, z, hex("#D6CFBF")));
    bloq(s * (W / 2 - 0.7), z, 0.8, 0.8);
    for (let k = 0; k < 6; k++) p.push(caja(0.04, 0.72, 0.5, s * (W / 2 - 0.02), 3 + k * 0.74, z + 2.7, PRODUCTOS[Math.floor(hash(sem + i, k + s) * PRODUCTOS.length)], P_EMISIVO));
  }
  /* Presbiterio y altar */
  p.push(caja(W - 1, 0.3, 3.2, 0, 0.15, -D / 2 + 1.7, hex("#CFC6B2")));
  p.push(caja(2.6, 1, 0.9, 0, 0.8, -D / 2 + 1.5, BLANCO), caja(2.8, 0.06, 1, 0, 1.33, -D / 2 + 1.5, hex("#C9A65A")));
  bloq(0, -D / 2 + 1.5, W - 1, 3.2);
  for (let i = 0; i < 7; i++) {
    const c = PRODUCTOS[Math.floor(hash(sem, i * 3) * PRODUCTOS.length)], g = new THREE.BoxGeometry(0.62, 0.9, 0.04);
    g.translate(-1.95 + i * 0.65, 5.1 + Math.sin((i / 6) * Math.PI) * 0.8, -D / 2 + 0.06);
    p.push({ geo: g, color: c, parte: P_EMISIVO });
  }
  /* Mesa de la secretaría, cerca de la entrada */
  mostrador(a, -W / 2 + 2.2, D / 2 - 2.1, 2.6, hex("#6F4E37"), CREMA, "Secretaría");
  a.mostrador = { x: -W / 2 + 2.2, z: D / 2 - 1.2 };
}

function escenaFacultad(a: Armado) {
  const { p, bloq, W, D, H } = a;
  mostrador(a, -W / 2 + 2.6, D / 2 - 2.8, 3.6, hex("#7A6A58"), hex("#E2DBCB"), "Bedelía");
  /* Aula: pizarrón, tarima y pupitres */
  p.push(caja(6.4, 1.8, 0.05, 0, 1.7, -D / 2 + 0.06, hex("#2E4A3E")), caja(6.6, 0.08, 0.1, 0, 0.78, -D / 2 + 0.1, hex("#7A6A58")));
  for (let i = 0; i < 6; i++) p.push(caja(1.4 + (i % 3) * 0.8, 0.03, 0.02, -2.3 + (i % 2) * 2.2, 2.3 - i * 0.2, -D / 2 + 0.1, BLANCO));
  p.push(caja(W - 1, 0.18, 1.8, 0, 0.09, -D / 2 + 1.1, hex("#8E7A62")), caja(1, 1.1, 0.5, 1.8, 0.75, -D / 2 + 1.4, hex("#6F4E37")));
  bloq(1.8, -D / 2 + 1.4, 1.1, 0.6);
  for (let f = 0; f < 3; f++) for (const x of [-4.4, -2.1, 2.1, 4.4]) {
    const z = -2.6 + f * 1.9;
    p.push(caja(1.8, 0.05, 0.56, x, 0.74, z, hex("#C9A577")), caja(0.06, 0.72, 0.5, x - 0.8, 0.37, z, METAL), caja(0.06, 0.72, 0.5, x + 0.8, 0.37, z, METAL));
    silla(p, x - 0.4, z + 0.62, Math.PI, hex("#3F6DB3")); silla(p, x + 0.4, z + 0.62, Math.PI, hex("#3F6DB3"));
    bloq(x, z + 0.2, 1.9, 1.2);
  }
  p.push(caja(0.04, 1.3, 2.6, W / 2 - 0.05, 1.6, 4.4, hex("#B98C63")));
  for (let i = 0; i < 7; i++) p.push(caja(0.05, 0.3, 0.24, W / 2 - 0.08, 1.3 + (i % 3) * 0.34, 3.5 + (i % 4) * 0.56, PRODUCTOS[i]));
  void H;
}

function escritorio(p: Parte[], bloq: Bloq, x: number, z: number, sem: number) {
  p.push(caja(1.5, 0.05, 0.72, x, 0.74, z, hex("#D9CDB8")), caja(0.05, 0.72, 0.66, x - 0.7, 0.37, z, METAL), caja(0.05, 0.72, 0.66, x + 0.7, 0.37, z, METAL));
  p.push(caja(0.56, 0.34, 0.03, x, 1.08, z - 0.18, NEGRO), caja(0.5, 0.28, 0.02, x, 1.08, z - 0.16, [0.42, 0.68, 0.9], P_EMISIVO), caja(0.05, 0.14, 0.05, x, 0.84, z - 0.18, METAL));
  silla(p, x, z + 0.72, Math.PI, PRODUCTOS[Math.floor(hash(sem, x * 3) * 4) + 4]);
  bloq(x, z + 0.2, 1.6, 1.3);
}

function escenaOficina(a: Armado) {
  const { p, bloq, W, D, sem, color } = a;
  mostrador(a, 0, 1.2, 4, color, hex("#EFEDE6"));
  for (const x of [-3.8, -1.3, 1.3, 3.8]) escritorio(p, bloq, x, -2.4, sem);
  /* Sala de reuniones vidriada al fondo */
  p.push(caja(W - 1, 2.4, 0.05, 0, 1.2, -D / 2 + 1.6, VIDRIO, P_EMISIVO), caja(3.6, 0.05, 1, 0, 0.74, -D / 2 + 0.8, hex("#5A3A2A")));
  bloq(0, -D / 2 + 1.6, W - 1, 0.15);
  for (const s of [-1, 1]) { planta(p, s * (W / 2 - 0.8), 2.8); bloq(s * (W / 2 - 0.8), 2.8, 0.7, 0.7); }
  p.push(caja(0.04, 1.2, 1.8, -W / 2 + 0.06, 1.5, 0.8, BLANCO));
}

function escenaPeluqueria(a: Armado) {
  const { p, bloq, W, D, sem, color } = a;
  mostrador(a, 2.2, D / 2 - 3, 2.6, color, hex("#EFE9DD"));
  for (let i = 0; i < 4; i++) {
    const z = -4 + i * 1.9, x = -W / 2 + 0.05;
    p.push(caja(0.04, 1.3, 1, x, 1.5, z, VIDRIO, P_EMISIVO));
    p.push(caja(0.06, 0.05, 1.1, x, 2.2, z, [1, 0.94, 0.8], P_EMISIVO), caja(0.5, 0.06, 1.2, x + 0.3, 0.92, z, hex("#D4CFC6")));
    /* Sillón giratorio */
    const b = new THREE.CylinderGeometry(0.28, 0.3, 0.06, 12);
    b.translate(-W / 2 + 1.5, 0.03, z);
    p.push({ geo: b, color: ACERO }, caja(0.06, 0.42, 0.06, -W / 2 + 1.5, 0.24, z, ACERO), caja(0.56, 0.12, 0.54, -W / 2 + 1.5, 0.5, z, NEGRO), caja(0.14, 0.72, 0.54, -W / 2 + 1.8, 0.86, z, NEGRO));
    bloq(-W / 2 + 0.3, z, 0.55, 1.3); bloq(-W / 2 + 1.5, z, 0.7, 0.8);
  }
  for (let i = 0; i < 2; i++) {
    const z = -D / 2 + 0.5, x = 1.2 + i * 1.6;
    p.push(caja(0.7, 0.8, 0.6, x, 0.4, z, BLANCO), caja(0.5, 0.14, 0.44, x, 0.84, z, hex("#D4CFC6")), caja(0.04, 0.3, 0.04, x, 1, z - 0.2, ACERO));
    bloq(x, z, 0.8, 0.7);
  }
  estante(p, W / 2 - 0.25, -0.5, 3.6, 0.36, 1.9, false, hex("#E9E2D8"), sem + 4); bloq(W / 2 - 0.25, -0.5, 0.45, 3.7);
}

function escenaKiosco(a: Armado) {
  const { p, bloq, W, D, sem, color } = a;
  mostrador(a, 0, -D / 2 + 1.5, W - 1.2, color.map((v) => v * 0.9), hex("#F2EDE1"), "Caja");
  estante(p, 0, -D / 2 + 0.3, W - 0.8, 0.4, 2.1, true, hex("#E4DED0"), sem + 1); bloq(0, -D / 2 + 0.3, W - 0.7, 0.5);
  p.push(caja(0.7, 1.9, 0.6, W / 2 - 0.4, 0.95, 0.6, [0.68, 0.84, 0.96], P_EMISIVO), caja(0.72, 0.1, 0.62, W / 2 - 0.4, 1.95, 0.6, METAL));
  p.push(caja(0.7, 1.9, 0.6, W / 2 - 0.4, 0.95, -0.2 + 1.5, [0.68, 0.84, 0.96], P_EMISIVO));
  bloq(W / 2 - 0.4, 1, 0.8, 1.6);
  /* Golosinas sobre el mostrador */
  for (let i = 0; i < 14; i++) { const x = -2.1 + (i % 7) * 0.7; p.push(caja(0.42, 0.2, 0.2, x, 1.22 + Math.floor(i / 7) * 0.2, -D / 2 + 1.7 - Math.floor(i / 7) * 0.2, PRODUCTOS[i % 9])); }
  estante(p, -W / 2 + 0.3, 1, 2.2, 0.44, 1.8, false, hex("#E4DED0"), sem + 2); bloq(-W / 2 + 0.3, 1, 0.5, 2.3);
}

function escenaHospital(a: Armado) {
  const { p, bloq, W, D, sem, color } = a;
  mostrador(a, 0, -2.6, 6, hex("#E4ECEE"), color, "Admisión");
  /* Sala de espera */
  for (const x of [-3.8, 3.8]) for (const z of [-0.2, 2]) {
    p.push(caja(2.4, 0.06, 0.5, x, 0.46, z, hex("#5F8EA0")), caja(2.4, 0.5, 0.06, x, 0.76, z + 0.24, hex("#5F8EA0")), caja(0.06, 0.45, 0.4, x - 1.1, 0.22, z, METAL), caja(0.06, 0.45, 0.4, x + 1.1, 0.22, z, METAL));
    bloq(x, z, 2.5, 0.7);
  }
  /* Línea guía en el piso y puertas de consultorios */
  p.push(caja(0.2, 0.012, D - 3, -1.1, 0.012, 1.2, color), caja(0.2, 0.012, D - 3, 1.1, 0.012, 1.2, hex("#E4A23A")));
  for (let i = 0; i < 4; i++) {
    const x = -4.5 + i * 3;
    p.push(caja(1.1, 2.2, 0.06, x, 1.1, -D / 2 + 0.06, hex("#BFD3D8")), caja(0.3, 0.2, 0.02, x, 2.42, -D / 2 + 0.07, [0.4, 0.8, 0.86], P_EMISIVO));
    a.textos.push({ texto: `Consultorio ${i + 1}`, x, y: 2.72, z: -D / 2 + 0.1, ry: 0, ancho: 1.3 });
  }
  /* Camilla */
  p.push(caja(0.72, 0.1, 1.9, W / 2 - 0.7, 0.72, 4.6 - 0.6, BLANCO), caja(0.7, 0.08, 0.5, W / 2 - 0.7, 0.8, 3.3, hex("#D8E4E6")), caja(0.05, 0.7, 0.05, W / 2 - 1, 0.36, 3.3, ACERO), caja(0.05, 0.7, 0.05, W / 2 - 0.4, 0.36, 4.7, ACERO), caja(0.05, 0.7, 0.05, W / 2 - 1, 0.36, 4.7, ACERO), caja(0.05, 0.7, 0.05, W / 2 - 0.4, 0.36, 3.3, ACERO));
  bloq(W / 2 - 0.7, 4, 0.85, 2);
  p.push(caja(0.2, 0.2, 0.04, -5.5, 2.55, -D / 2 + 0.08, [0.9, 0.25, 0.25], P_EMISIVO));
  void sem;
}

function escenaGenerico(a: Armado) {
  const { p, bloq, W, D, sem, color } = a;
  mostrador(a, 0, -2.6, 6.4, color.map((v) => v * 0.9), hex("#EFE9DD"));
  const madera = hex("#B98C63");
  for (const s of [-1, 1]) { estante(p, s * (W / 2 - 0.3), 1, 6, 0.5, 2, false, madera, sem + s * 2); bloq(s * (W / 2 - 0.3), 1, 0.6, 6); }
  planta(p, -W / 2 + 0.9, -D / 2 + 0.8); bloq(-W / 2 + 0.9, -D / 2 + 0.8, 0.7, 0.7);
  cuadro(p, 2.2, 1.9, -D / 2 + 0.05, 2, 1.3, sem);
}

const RECETAS: Record<Escena, (a: Armado) => void> = {
  farmacia: escenaFarmacia, cafe: escenaCafe, restaurante: escenaRestaurante, super: escenaSuper, ropa: escenaRopa, gimnasio: escenaGimnasio, banco: escenaBanco, hotel: escenaHotel,
  museo: escenaMuseo, iglesia: escenaIglesia, facultad: escenaFacultad, oficina: escenaOficina, peluqueria: escenaPeluqueria, kiosco: escenaKiosco, hospital: escenaHospital, generico: escenaGenerico,
};

/* Texto en la pared, siempre legible */
function letrero(texto: string, ancho: number, fondo = "#1F2933", tinta = "#FFFFFF") {
  const c = document.createElement("canvas"), g = c.getContext("2d")!;
  c.width = 512; c.height = 96;
  g.fillStyle = fondo; g.fillRect(0, 0, 512, 96);
  g.fillStyle = tinta; g.textAlign = "center"; g.textBaseline = "middle";
  let t = 46;
  g.font = `800 ${t}px sans-serif`;
  while (g.measureText(texto).width > 480 && t > 16) { t -= 2; g.font = `800 ${t}px sans-serif`; }
  g.fillText(texto, 256, 50);
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.NoColorSpace;
  const m = new THREE.MeshBasicMaterial({ map: tx }), geo = new THREE.PlaneGeometry(ancho, (ancho * 96) / 512);
  return { malla: new THREE.Mesh(geo, m), destruir() { tx.dispose(); m.dispose(); geo.dispose(); } };
}

function montar(a: Armado, tipo: Interior["tipo"], l: Local, entrada: Interior["entrada"], obst: Caja2D[], puerta: boolean, cartel: boolean, luz = 0.28): Interior {
  const comunes = crearComunes();
  comunes.uSol.value.set(0.15, 1, 0.3).normalize();
  comunes.uLuzSol.value.setRGB(0.3, 0.27, 0.22, THREE.LinearSRGBColorSpace);
  comunes.uLuzCielo.value.setRGB(0.7, 0.68, 0.64, THREE.LinearSRGBColorSpace);
  comunes.uLuzSuelo.value.setRGB(0.86, 0.83, 0.78, THREE.LinearSRGBColorSpace);
  comunes.uNiebla.value.setRGB(1, 1, 1, THREE.LinearSRGBColorSpace);
  comunes.uNieblaD.value.set(1e4, 0);
  comunes.uNoche.value = luz;

  const escena = new THREE.Scene();
  escena.background = new THREE.Color(0xf4efe6);
  const mat = matObjeto(comunes, false), geo = fundir(a.p);
  escena.add(new THREE.Mesh(geo, mat));
  const liberar: (() => void)[] = [];
  if (cartel) {
    const tex = texturaNombre(l.nombre, l.rubro), mp = new THREE.MeshBasicMaterial({ map: tex }), ALTO = 0.56, ANCHO = 3;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(ANCHO, ALTO * (ANCHO / 3)), mp);
    m.position.set(0, Math.min(a.H - 0.46, 2.72), -a.D / 2 + 0.11);
    escena.add(m);
    liberar.push(() => { tex.dispose(); mp.dispose(); m.geometry.dispose(); });
  }
  for (const t of a.textos) {
    const q = letrero(t.texto, t.ancho, t.fondo);
    q.malla.position.set(t.x, t.y, t.z);
    q.malla.rotation.y = t.ry;
    escena.add(q.malla);
    liberar.push(q.destruir);
  }
  return {
    escena, tipo, ancho: a.W, fondo: a.D, obstaculos: obst, entrada, mostrador: a.mostrador, puerta,
    destruir() { geo.dispose(); mat.dispose(); liberar.forEach((f) => f()); },
  };
}

export function crearInterior(l: Local): Interior {
  const sem = hashTexto(l.nombre) % 9973, tipo = escenaDe(l);
  const [W, D, H, pa, pb, pared] = DIM[tipo];
  const color = hex(l.rubro.color), obst: Caja2D[] = [], p: Parte[] = [], claro = hex(pared), piso1 = hex(pa), piso2 = hex(pb);
  const a: Armado = { p, W, D, H, sem, color, textos: [], mostrador: null, bloq: (x, z, w, d) => { obst.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 }); } };

  /* Piso, paredes, techo y paños de luz */
  const paso = tipo === "iglesia" || tipo === "museo" ? 2 : 1;
  for (let i = 0; i < W / paso; i++) for (let j = 0; j < D / paso; j++) p.push(caja(paso, 0.02, paso, -W / 2 + paso * (i + 0.5), -0.01, -D / 2 + paso * (j + 0.5), (i + j) % 2 ? piso1 : piso2));
  p.push(caja(W, H, 0.1, 0, H / 2, -D / 2 - 0.05, claro), caja(0.1, H, D, -W / 2 - 0.05, H / 2, 0, claro), caja(0.1, H, D, W / 2 + 0.05, H / 2, 0, claro));
  p.push(caja(W, 0.1, D, 0, H + 0.05, 0, hex("#FBF8F1")));
  p.push(caja(W, 0.3, 0.02, 0, 0.15, -D / 2 + 0.01, color), caja(0.02, 0.3, D, -W / 2 + 0.01, 0.15, 0, color), caja(0.02, 0.3, D, W / 2 - 0.01, 0.15, 0, color));
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) p.push(caja(1.6, 0.03, 0.5, (i * W) / 3.4, H - 0.02, (j * D) / 3.4, [1, 0.95, 0.82], P_EMISIVO));
  /* Frente: vidriera con la calle clarita detrás, y la puerta */
  const pan = (x: number, w: number) => p.push(caja(w, H, 0.08, x, H / 2, D / 2 + 0.05, [0.82, 0.92, 0.98], P_EMISIVO));
  const lado = Math.max(0.6, W / 2 - 1.2);
  pan(-(1.2 + lado / 2), lado); pan(1.2 + lado / 2, lado);
  p.push(caja(2.4, H, 0.12, 0, H / 2, D / 2 + 0.1, [0.74, 0.86, 0.95], P_EMISIVO));
  p.push(caja(0.08, H, 0.14, -1.2, H / 2, D / 2 + 0.04, hex("#3A3F46")), caja(0.08, H, 0.14, 1.2, H / 2, D / 2 + 0.04, hex("#3A3F46")));

  RECETAS[tipo](a);
  /* Siempre a la vista, también adentro de la escena */
  a.textos.push({ texto: "Recreación ilustrativa", x: 0, y: Math.min(H - 0.3, 2.86), z: D / 2 - 0.02, ry: Math.PI, ancho: 2.2, fondo: "#14304F" });
  return montar(a, tipo, l, { x: 0, z: D / 2 - 1.2, yaw: 0 }, obst, true, tipo !== "iglesia" && tipo !== "hospital");
}

/** Pasillo ilustrativo de un piso. Se llega por el ascensor, que queda a tus espaldas. */
export function crearPasillo(l: Local, piso: number): Interior {
  const W = 3, D = 19, H = 2.7, sem = hashTexto(l.nombre) + piso * 17, tonos = ["#E9E2D3", "#E1E7EA", "#EFE6DE", "#E6E8DC"], pared = hex(tonos[sem % 4]);
  const piso1 = hex(sem % 2 ? "#9B7F63" : "#7E8A92"), obst: Caja2D[] = [], p: Parte[] = [];
  const a: Armado = { p, W, D, H, sem, color: hex(l.rubro.color), textos: [], mostrador: null, bloq: () => {} };
  for (let j = 0; j < D; j++) p.push(caja(W, 0.02, 1, 0, -0.01, -D / 2 + j + 0.5, j % 2 ? piso1 : piso1.map((v) => v * 0.93)));
  p.push(caja(1.2, 0.012, D - 1, 0, 0.012, 0, hex("#7E2B2B")));
  p.push(caja(W, H, 0.1, 0, H / 2, -D / 2 - 0.05, pared), caja(0.1, H, D, -W / 2 - 0.05, H / 2, 0, pared), caja(0.1, H, D, W / 2 + 0.05, H / 2, 0, pared), caja(W, H, 0.1, 0, H / 2, D / 2 + 0.05, pared));
  p.push(caja(W, 0.1, D, 0, H + 0.05, 0, hex("#FBF8F1")));
  for (let j = 0; j < 5; j++) p.push(caja(0.8, 0.03, 0.4, 0, H - 0.02, -7.6 + j * 3.8, [1, 0.95, 0.82], P_EMISIVO));
  /* Ventana al fondo: da luz, pero no es la vista real */
  p.push(caja(1.8, 1.4, 0.04, 0, 1.5, -D / 2 + 0.03, [0.74, 0.88, 0.98], P_EMISIVO), caja(1.9, 0.06, 0.1, 0, 0.76, -D / 2 + 0.05, BLANCO));
  /* Ascensor a tus espaldas */
  p.push(caja(1.5, 2.2, 0.05, 0, 1.1, D / 2 - 0.03, ACERO), caja(0.02, 2.2, 0.06, 0, 1.1, D / 2 - 0.04, METAL));
  const letras = "ABCDEFGH";
  let n = 0;
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
    const z = -6.6 + i * 4, x = s * (W / 2 - 0.03), c = hex("#6B4F3B");
    p.push(caja(0.05, 2.1, 1, x, 1.05, z, c), caja(0.06, 0.05, 0.05, x - s * 0.04, 1.02, z + 0.36, hex("#D9A441")));
    a.textos.push({ texto: `${piso}${letras[n++]}`, x: x - s * 0.04, y: 1.78, z, ry: -s * (Math.PI / 2), ancho: 0.34, fondo: "#2B2B30" });
  }
  a.textos.push({ texto: `Piso ${piso}`, x: 0, y: 2.34, z: -D / 2 + 0.08, ry: 0, ancho: 0.9, fondo: "#14304F" });
  a.textos.push({ texto: "Pasillo ilustrativo", x: 0, y: 2.34, z: D / 2 - 0.06, ry: Math.PI, ancho: 1.2, fondo: "#14304F" });
  return montar(a, "pasillo", l, { x: 0, z: D / 2 - 1.4, yaw: 0 }, obst, false, false);
}
