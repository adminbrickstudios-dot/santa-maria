/* Interior ilustrativo de un local: se genera según el rubro. No es el local real. */
import * as THREE from "three";
import { hash, hashTexto } from "./geo";
import { texturaNombre } from "./carteles";
import { crearComunes, matObjeto } from "./materiales";
import { P_EMISIVO, caja, fundir, hex, type Parte } from "./objetos";
import type { Local } from "./tipos";

export interface Caja2D { x0: number; x1: number; z0: number; z1: number }

export interface Interior {
  escena: THREE.Scene;
  ancho: number;
  fondo: number;
  obstaculos: Caja2D[];
  entrada: { x: number; z: number; yaw: number };
  destruir(): void;
}

const PRODUCTOS = ["#E85D4A", "#F2B134", "#3FA7D6", "#59C9A5", "#F6F1E7", "#8E6BBF", "#EE8FB0", "#4C6FBF", "#7DBE4E"].map(hex);

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
    const n = Math.floor(largo / 0.17);
    for (const lado of [-1, 1]) for (let k = 0; k < n; k++) {
      const r = hash(sem + k * 31, i * 7 + lado);
      if (r < 0.14) continue;
      const a = 0.11 + r * 0.05, h = 0.14 + r * 0.16, of = -largo / 2 + (k + 0.5) * (largo / n), lat = lado * fondo * 0.27;
      p.push(enX ? caja(a, h, 0.14, x + of, y + h / 2 + 0.015, z + lat, PRODUCTOS[Math.floor(r * 91) % PRODUCTOS.length])
        : caja(0.14, h, a, x + lat, y + h / 2 + 0.015, z + of, PRODUCTOS[Math.floor(r * 91) % PRODUCTOS.length]));
    }
  }
}

function mesa(p: Parte[], x: number, z: number, sem: number, madera: number[]) {
  const t = new THREE.CylinderGeometry(0.5, 0.5, 0.05, 12);
  t.translate(x, 0.75, z);
  p.push({ geo: t, color: madera });
  p.push(caja(0.06, 0.74, 0.06, x, 0.37, z, hex("#33343A")));
  const taza = new THREE.CylinderGeometry(0.05, 0.04, 0.08, 8);
  taza.translate(x + 0.14, 0.82, z - 0.08);
  p.push({ geo: taza, color: hex("#F6F1E7") });
  for (let i = 0; i < 2; i++) {
    const a = sem + (i * Math.PI), cx = x + Math.cos(a) * 0.85, cz = z + Math.sin(a) * 0.85;
    p.push(caja(0.4, 0.05, 0.4, cx, 0.45, cz, hex("#8B5A3C")));
    p.push(caja(0.05, 0.45, 0.05, cx - 0.16, 0.22, cz - 0.16, hex("#33343A")), caja(0.05, 0.45, 0.05, cx + 0.16, 0.22, cz + 0.16, hex("#33343A")));
    p.push(caja(0.05, 0.45, 0.05, cx - 0.16, 0.22, cz + 0.16, hex("#33343A")), caja(0.05, 0.45, 0.05, cx + 0.16, 0.22, cz - 0.16, hex("#33343A")));
  }
}

function perchero(p: Parte[], x: number, z: number, largo: number, sem: number) {
  const metal = hex("#3A3A42");
  p.push(caja(0.04, 1.55, 0.04, x - largo / 2, 0.78, z, metal), caja(0.04, 1.55, 0.04, x + largo / 2, 0.78, z, metal), caja(largo, 0.03, 0.03, x, 1.52, z, metal));
  const n = Math.floor(largo / 0.17);
  for (let i = 0; i < n; i++) {
    const r = hash(sem, i), h = 0.72 + r * 0.32;
    p.push(caja(0.07, h, 0.46, x - largo / 2 + (i + 0.5) * (largo / n), 1.48 - h / 2, z, PRODUCTOS[Math.floor(r * 53) % PRODUCTOS.length]));
  }
}

export function crearInterior(l: Local): Interior {
  const sem = hashTexto(l.nombre) % 9973, tipo = l.rubro.interior;
  const W = tipo === "super" ? 12 : 9, D = tipo === "super" ? 15 : 11, H = 3.2;
  const color = hex(l.rubro.color), obst: Caja2D[] = [], p: Parte[] = [];
  const claro = hex(tipo === "cafe" ? "#EFE3D0" : tipo === "farmacia" ? "#F2F6F3" : tipo === "ropa" ? "#EDE9E4" : "#F0EDE6");
  const piso1 = hex(tipo === "cafe" ? "#A8785A" : tipo === "ropa" ? "#B9A78F" : "#D9D4C9"), piso2 = hex(tipo === "cafe" ? "#94694E" : tipo === "ropa" ? "#AB9880" : "#C6C1B6");

  /* Piso en damero, paredes, techo y paños de luz */
  const paso = 1;
  for (let i = 0; i < W / paso; i++) for (let j = 0; j < D / paso; j++) p.push(caja(paso, 0.02, paso, -W / 2 + paso * (i + 0.5), -0.01, -D / 2 + paso * (j + 0.5), (i + j) % 2 ? piso1 : piso2));
  p.push(caja(W, H, 0.1, 0, H / 2, -D / 2 - 0.05, claro), caja(0.1, H, D, -W / 2 - 0.05, H / 2, 0, claro), caja(0.1, H, D, W / 2 + 0.05, H / 2, 0, claro));
  p.push(caja(W, 0.1, D, 0, H + 0.05, 0, hex("#FBF8F1")));
  p.push(caja(W, 0.3, 0.02, 0, 0.15, -D / 2 + 0.01, color), caja(0.02, 0.3, D, -W / 2 + 0.01, 0.15, 0, color), caja(0.02, 0.3, D, W / 2 - 0.01, 0.15, 0, color));
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) p.push(caja(1.6, 0.03, 0.5, (i * W) / 3.4, H - 0.02, (j * D) / 3.4, [1, 0.95, 0.82], P_EMISIVO));
  /* Frente: vidriera con la calle clarita detrás, y la puerta */
  const pan = (x: number, w: number) => p.push(caja(w, H, 0.08, x, H / 2, D / 2 + 0.05, [0.82, 0.92, 0.98], P_EMISIVO));
  pan(-W / 4 - 0.6, W / 2 - 1.2); pan(W / 4 + 0.6, W / 2 - 1.2);
  p.push(caja(2.4, H, 0.12, 0, H / 2, D / 2 + 0.1, [0.74, 0.86, 0.95], P_EMISIVO));
  p.push(caja(0.08, H, 0.14, -1.2, H / 2, D / 2 + 0.04, hex("#3A3F46")), caja(0.08, H, 0.14, 1.2, H / 2, D / 2 + 0.04, hex("#3A3F46")));

  const madera = hex(tipo === "farmacia" ? "#F4F4EE" : "#B98C63");
  const bloq = (x: number, z: number, w: number, d: number) => obst.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
  if (tipo === "farmacia") {
    for (const s of [-1, 1]) { estante(p, s * (W / 2 - 0.3), 0.5, 7, 0.5, 2.3, false, madera, sem + s); bloq(s * (W / 2 - 0.3), 0.5, 0.6, 7); }
    estante(p, -2.3, -D / 2 + 0.3, 3.4, 0.45, 2.3, true, madera, sem + 5);
    estante(p, 2.3, -D / 2 + 0.3, 3.4, 0.45, 2.3, true, madera, sem + 6);
    p.push(caja(6, 1, 0.7, 0, 0.5, -2.4, madera), caja(6.06, 0.05, 0.76, 0, 1.02, -2.4, color));
    bloq(0, -2.4, 6.1, 0.8);
    p.push(caja(0.72, 0.22, 0.08, 0, 1.7, -D / 2 + 0.06, [0.1, 0.8, 0.42], P_EMISIVO), caja(0.22, 0.72, 0.08, 0, 1.7, -D / 2 + 0.06, [0.1, 0.8, 0.42], P_EMISIVO));
  } else if (tipo === "cafe") {
    p.push(caja(5.6, 1.05, 0.7, -0.6, 0.53, -3.6, hex("#6F4E37")), caja(5.7, 0.05, 0.8, -0.6, 1.08, -3.6, hex("#EFE3D0")));
    bloq(-0.6, -3.6, 5.8, 0.9);
    p.push(caja(0.7, 0.42, 0.42, -1.7, 1.32, -3.6, hex("#C5C8CC")), caja(0.34, 0.1, 0.3, 0.9, 1.15, -3.6, hex("#F6F1E7")));
    estante(p, 1.4, -D / 2 + 0.28, 4, 0.4, 2.2, true, hex("#8A5F3F"), sem + 3);
    [[-2.6, -0.6], [2.6, -0.6], [-2.6, 2.4], [2.6, 2.4], [0, 0.9]].forEach(([x, z], i) => { mesa(p, x, z, sem + i, hex("#D8BE9A")); bloq(x, z, 2.1, 1.1); });
  } else if (tipo === "super") {
    for (const x of [-4.4, -1.6, 1.6, 4.4]) { estante(p, x, -1.6, 7.6, 0.9, 1.9, false, hex("#E9E6DF"), sem + x * 3); bloq(x, -1.6, 1, 7.7); }
    estante(p, 0, -D / 2 + 0.4, 10, 0.6, 2.2, true, hex("#E9E6DF"), sem + 9);
    for (const s of [-1, 1]) {
      p.push(caja(1.8, 0.95, 0.75, s * 3.4, 0.48, 5, hex("#3D4148")), caja(1.84, 0.04, 0.8, s * 3.4, 0.98, 5, color));
      bloq(s * 3.4, 5, 1.9, 0.85);
    }
  } else if (tipo === "ropa") {
    [[-2.4, -2.4], [2.4, -2.4], [-2.4, 0.8], [2.4, 0.8]].forEach(([x, z], i) => { perchero(p, x, z, 2.8, sem + i); bloq(x, z, 2.9, 0.6); });
    p.push(caja(1, 2.3, 0.05, -W / 2 + 0.6, 1.2, -D / 2 + 0.04, [0.72, 0.85, 0.92], P_EMISIVO));
    p.push(caja(2.6, 1, 0.6, 2.6, 0.5, -D / 2 + 0.5, hex("#3A3A42")));
    bloq(2.6, -D / 2 + 0.5, 2.7, 0.7);
  } else {
    p.push(caja(6.4, 1.05, 0.7, 0, 0.53, -2.6, color.map((v) => v * 0.9)), caja(6.5, 0.05, 0.78, 0, 1.08, -2.6, hex("#EFE9DD")));
    bloq(0, -2.6, 6.6, 0.85);
    for (const s of [-1, 1]) { estante(p, s * (W / 2 - 0.3), 1, 6, 0.5, 2, false, madera, sem + s * 2); bloq(s * (W / 2 - 0.3), 1, 0.6, 6); }
    const maceta = new THREE.CylinderGeometry(0.28, 0.22, 0.5, 8);
    maceta.translate(-W / 2 + 0.9, 0.25, -D / 2 + 0.8);
    const pl = new THREE.IcosahedronGeometry(0.62, 0);
    pl.translate(-W / 2 + 0.9, 1.05, -D / 2 + 0.8);
    p.push({ geo: maceta, color: hex("#B06A4C") }, { geo: pl, color: hex("#5F9A4A") });
  }

  const comunes = crearComunes();
  comunes.uSol.value.set(0.15, 1, 0.3).normalize();
  comunes.uLuzSol.value.setRGB(0.3, 0.27, 0.22, THREE.LinearSRGBColorSpace);
  comunes.uLuzCielo.value.setRGB(0.7, 0.68, 0.64, THREE.LinearSRGBColorSpace);
  comunes.uLuzSuelo.value.setRGB(0.86, 0.83, 0.78, THREE.LinearSRGBColorSpace);
  comunes.uNiebla.value.setRGB(1, 1, 1, THREE.LinearSRGBColorSpace);
  comunes.uNieblaD.value.set(1e4, 0);
  comunes.uNoche.value = 0.28;

  const escena = new THREE.Scene();
  escena.background = new THREE.Color(0xf4efe6);
  const mat = matObjeto(comunes, false), geo = fundir(p);
  escena.add(new THREE.Mesh(geo, mat));
  const tex = texturaNombre(l.nombre, l.rubro), mp = new THREE.MeshBasicMaterial({ map: tex });
  const ALTO = 0.56, ANCHO = 3;
  const cartel = new THREE.Mesh(new THREE.PlaneGeometry(ANCHO, ALTO * (ANCHO / 3)), mp);
  cartel.position.set(0, 2.72, -D / 2 + 0.08);
  escena.add(cartel);

  return {
    escena, ancho: W, fondo: D, obstaculos: obst, entrada: { x: 0, z: D / 2 - 1.2, yaw: 0 },
    destruir() { geo.dispose(); mat.dispose(); tex.dispose(); mp.dispose(); cartel.geometry.dispose(); },
  };
}
