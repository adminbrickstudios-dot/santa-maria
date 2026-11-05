/* Edificios con forma propia, hechos a mano con cajas y tornos. Son simples a propósito: la silueta es
   lo que los hace reconocibles. Ubicación real en singulares.ts. Parte 14: muro con ventanas pintadas. */
import * as THREE from "three";
import { Earcut } from "three/src/extras/Earcut.js";
import { caja, fundir, hex, type Parte } from "./objetos";

const P_VENTANAS = 14, P_METAL = 13;

/** Extruye un anillo (escalado desde su centro) entre dos alturas. */
function prisma(an: number[], y0: number, y1: number, color: number[], k = 1, parte = P_VENTANAS): Parte[] {
  const n = an.length / 2;
  let cx = 0, cz = 0;
  for (let i = 0; i < n; i++) { cx += an[i * 2]; cz += an[i * 2 + 1]; }
  cx /= n; cz /= n;
  const r: number[] = [];
  for (let i = 0; i < n; i++) r.push(cx + (an[i * 2] - cx) * k, cz + (an[i * 2 + 1] - cz) * k);
  const pos: number[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, ax = r[i * 2], az = r[i * 2 + 1], bx = r[j * 2], bz = r[j * 2 + 1];
    pos.push(ax, y0, az, bx, y1, bz, bx, y0, bz, ax, y0, az, ax, y1, az, bx, y1, bz);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  const tec = new THREE.BufferGeometry(), tp: number[] = [];
  for (const i of Earcut.triangulate(r, [], 2)) tp.push(r[i * 2], y1, r[i * 2 + 1]);
  /* El anillo viene con la normal (dz,-dx) afuera, por eso se invierte el techo */
  for (let i = 0; i < tp.length; i += 9) {
    const a = [tp[i], tp[i + 1], tp[i + 2]], b = [tp[i + 3], tp[i + 4], tp[i + 5]];
    tp[i] = b[0]; tp[i + 1] = b[1]; tp[i + 2] = b[2]; tp[i + 3] = a[0]; tp[i + 4] = a[1]; tp[i + 5] = a[2];
  }
  tec.setAttribute("position", new THREE.Float32BufferAttribute(tp, 3));
  return [{ geo: g, color, parte }, { geo: tec, color: color.map((v) => v * 0.8) }];
}

function torno(perfil: number[][], color: number[], y: number, x = 0, z = 0, lados = 16, parte = 0): Parte {
  const g = new THREE.LatheGeometry(perfil.map(([r, h]) => new THREE.Vector2(r, h)), lados);
  g.translate(x, y, z);
  return { geo: g, color, parte };
}

function columnas(n: number, x0: number, x1: number, z: number, alto: number, r: number, color: number[], y = 0): Parte[] {
  const p: Parte[] = [];
  for (let i = 0; i < n; i++) {
    const x = x0 + ((x1 - x0) * i) / (n - 1), g = new THREE.CylinderGeometry(r * 0.86, r, alto, 8);
    g.translate(x, y + alto / 2, z);
    p.push({ geo: g, color }, caja(r * 2.6, 0.28, r * 2.6, x, y + alto + 0.1, z, color), caja(r * 2.5, 0.3, r * 2.5, x, y + 0.15, z, color));
  }
  return p;
}

/** Frontón triangular sobre un ancho `w`, mirando a +z. */
function fronton(w: number, h: number, y: number, z: number, d: number, color: number[]): Parte {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
  g.translate(0, y, z - d);
  return { geo: g, color };
}

function pilar() {
  const blanco = hex("#EFEBDF"), teja = hex("#8E5E4A"), azul = hex("#6E8FA8"), p: Parte[] = [];
  /* Eje x a lo largo de la iglesia: la fachada mira a +x */
  const nave = (w: number, h: number, L: number, cx: number) => {
    p.push(caja(L, h, w, cx, h / 2, 0, blanco, P_VENTANAS));
    const s = new THREE.Shape();
    s.moveTo(-w / 2 - 0.3, 0); s.lineTo(w / 2 + 0.3, 0); s.lineTo(0, 4.6); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: L, bevelEnabled: false });
    g.rotateY(-Math.PI / 2);
    g.translate(cx + L / 2, h, 0);
    p.push({ geo: g, color: teja });
  };
  nave(15, 11.5, 44, -2);
  p.push(caja(3.4, 15.4, 15.8, 20.8, 7.7, 0, blanco));
  const f = new THREE.Shape();
  f.moveTo(-8, 0); f.quadraticCurveTo(-6, 0.6, -5, 2.4); f.lineTo(-2.4, 4.2); f.quadraticCurveTo(0, 6.4, 2.4, 4.2); f.lineTo(5, 2.4); f.quadraticCurveTo(6, 0.6, 8, 0); f.closePath();
  const gf = new THREE.ExtrudeGeometry(f, { depth: 1, bevelEnabled: false });
  gf.rotateY(Math.PI / 2);
  gf.translate(20.5, 15.4, 0);
  p.push({ geo: gf, color: blanco });
  /* Portada y campanario */
  p.push(caja(0.7, 6.4, 4.4, 22.8, 3.2, 0, hex("#E2DDCF")), caja(0.2, 4.4, 2.4, 23.2, 2.2, 0, hex("#4A3426")));
  const t = 5.6, zt = 10.6;
  p.push(caja(t, 21, t, 17.6, 10.5, zt, blanco, P_VENTANAS), caja(t + 0.7, 0.5, t + 0.7, 17.6, 21.2, zt, blanco), caja(t - 1, 5, t - 1, 17.6, 23.8, zt, blanco, P_VENTANAS), caja(t - 0.4, 0.4, t - 0.4, 17.6, 26.5, zt, blanco));
  p.push(torno([[2.4, 0], [2.3, 0.7], [1.7, 1.9], [0.9, 2.8], [0.3, 3.3], [0.08, 4.2], [0, 4.4]], azul, 26.7, 17.6, zt));
  p.push(caja(0.1, 1.2, 0.1, 17.6, 31.7, zt, hex("#2A2A2C")), caja(0.1, 0.1, 0.7, 17.6, 31.9, zt, hex("#2A2A2C")));
  return fundir(p);
}

function portalRecoleta() {
  const c = hex("#E2DBC9"), p: Parte[] = [...columnas(4, -5.4, 5.4, 2.4, 9.6, 0.68, c, 0.5)];
  p.push(caja(14, 0.5, 6.4, 0, 0.25, 0.6, c), caja(13.6, 1.5, 6, 0, 10.9, 0.5, c), caja(14.4, 0.4, 6.6, 0, 11.8, 0.5, c), fronton(14.2, 2.8, 12, 3.3, 5.6, c));
  p.push(caja(14, 10.5, 1, 0, 5.2, -2.3, c, P_VENTANAS), caja(3.4, 7, 0.3, 0, 3.5, -1.7, hex("#2A3028")));
  return fundir(p);
}

function floralis() {
  const acero = hex("#C8CDD2"), p: Parte[] = [];
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.bezierCurveTo(5.2, 3, 5, 10, 0, 16); s.bezierCurveTo(-5, 10, -5.2, 3, 0, 0);
  for (let i = 0; i < 6; i++) {
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.22, bevelEnabled: false, curveSegments: 6, steps: 1 });
    const a = g.getAttribute("position"), v = new THREE.Vector3();
    for (let k = 0; k < a.count; k++) {
      v.fromBufferAttribute(a, k);
      /* Pétalo cóncavo que se abre hacia afuera */
      const t = v.y / 16;
      a.setXYZ(k, v.x * (1 - 0.12 * Math.abs(v.x) * 0.1), v.y * 0.96, v.z + 9 * t * t - 0.28 * v.x * v.x);
    }
    g.computeVertexNormals();
    g.rotateY((i / 6) * Math.PI * 2);
    g.translate(0, 8.5, 0);
    p.push({ geo: g, color: acero, parte: P_METAL });
  }
  p.push(torno([[0.9, 0], [0.7, 4], [0.5, 8.4], [1.4, 9.4], [0, 9.8]], acero, 0, 0, 0, 12, P_METAL));
  p.push(torno([[20, 0], [20, 0.4], [19.4, 0.4], [19.4, 0.1], [0, 0.1]], hex("#B5AFA2"), 0.02));
  p.push(torno([[19.4, 0.16], [0, 0.16]], [0.12, 0.2, 0.24], 0.02, 0, 0, 16, P_METAL));
  return fundir(p);
}

/** La arista más larga: ahí va el frente. */
function aristaMayor(an: number[]) {
  const n = an.length / 2;
  let m = 0, I = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, L = Math.hypot(an[j * 2] - an[i * 2], an[j * 2 + 1] - an[i * 2 + 1]);
    if (L > m) { m = L; I = i; }
  }
  const j = (I + 1) % n, ax = an[I * 2], az = an[I * 2 + 1], dx = (an[j * 2] - ax) / m, dz = (an[j * 2 + 1] - az) / m;
  return { cx: ax + (dx * m) / 2, cz: az + (dz * m) / 2, L: m, g: Math.atan2(dz, dx) };
}

function derecho(an: number[]) {
  const c = hex("#CFC8B8");
  if (an.length < 6) return null;
  const p = prisma(an, 0, 22, c);
  /* Pórtico de doce columnas dóricas sobre la escalinata, sobre el lado largo */
  const f = aristaMayor(an), por: Parte[] = [...columnas(12, -24, 24, 3, 13, 0.78, c, 4)];
  por.push(caja(54, 4, 9, 0, 2, 2, hex("#BDB6A6")), caja(52, 1.8, 7, 0, 18, 1.4, c), fronton(54, 3.6, 19, 5, 8, c));
  for (let i = 0; i < 8; i++) por.push(caja(50, 0.3, 0.5, 0, 0.15 + i * 0.5, 6.4 + (8 - i) * 0.5, hex("#C4BDAD")));
  const mat = new THREE.Matrix4().makeRotationY(-f.g).setPosition(f.cx, 0, f.cz);
  /* El pórtico mira hacia afuera de la huella: z local = normal (dz,-dx) */
  const flip = new THREE.Matrix4().makeRotationY(Math.PI);
  for (const q of por) { q.geo.applyMatrix4(flip); q.geo.applyMatrix4(mat); }
  return fundir([...p, ...por]);
}

function congreso(an: number[]) {
  const c = hex("#D3CBB8"), v = hex("#5E8877");
  const p: Parte[] = an.length >= 6 ? prisma(an, 0, 26, c) : [caja(100, 26, 84, 0, 13, 0, c, P_VENTANAS)];
  /* Tambor y cúpula verde, hasta unos 80 m */
  p.push(torno([[19, 0], [19, 15], [20, 16], [18.5, 17], [18, 22]], c, 26));
  p.push(torno([[18, 0], [17, 6], [14, 13], [9.5, 19], [4.5, 23.5], [2.6, 24.5], [2.6, 27], [0, 30]], v, 48));
  return fundir(p);
}

function barolo(an: number[]) {
  const c = hex("#D9CFBA"), p: Parte[] = an.length >= 6 ? prisma(an, 0, 58, c) : [caja(30, 58, 22, 0, 29, 0, c, P_VENTANAS)];
  p.push(caja(16, 12, 16, 0, 64, 0, c, P_VENTANAS), caja(17, 1, 17, 0, 70.5, 0, c), caja(10, 11, 10, 0, 76.5, 0, c, P_VENTANAS), caja(11, 0.8, 11, 0, 82.4, 0, c));
  p.push(torno([[4.8, 0], [4.4, 4], [3.2, 8], [1.6, 11], [0.9, 12.4], [0.3, 15], [0, 17.4]], hex("#C7BFAE"), 82.8));
  return fundir(p);
}

function colon(an: number[]) {
  const c = hex("#E1D7BF"), p: Parte[] = an.length >= 6 ? prisma(an, 0, 28, c) : [caja(66, 28, 56, 0, 14, 0, c, P_VENTANAS)];
  if (an.length >= 6) p.push(...prisma(an, 28, 34, hex("#5F6770"), 0.9, 0));
  return fundir(p);
}

function rosada(an: number[]) {
  const c = hex("#D9A7A0"), p: Parte[] = an.length >= 6 ? prisma(an, 0, 22, c) : [caja(90, 22, 70, 0, 11, 0, c, P_VENTANAS)];
  return fundir(p);
}

function kavanagh(an: number[]) {
  const c = hex("#D8D2C4");
  if (an.length < 6) return fundir([caja(30, 95, 26, 0, 47.5, 0, c, P_VENTANAS), caja(16, 25, 14, 0, 107, 0, c, P_VENTANAS)]);
  /* Art déco: se escalona hacia arriba */
  const p = [...prisma(an, 0, 58, c), ...prisma(an, 58, 80, c, 0.84), ...prisma(an, 80, 96, c, 0.66), ...prisma(an, 96, 110, c, 0.46), ...prisma(an, 110, 120, c, 0.28)];
  return fundir(p);
}

function obelisco() {
  const piedra = hex("#DDD7C8"), p: Parte[] = [];
  const f = new THREE.CylinderGeometry(1.95 * Math.SQRT2, 3.4 * Math.SQRT2, 63.5, 4, 1, false);
  f.rotateY(Math.PI / 4);
  f.translate(0, 31.75, 0);
  const pun = new THREE.ConeGeometry(1.95 * Math.SQRT2, 4, 4);
  pun.rotateY(Math.PI / 4);
  pun.translate(0, 65.5, 0);
  p.push({ geo: f, color: piedra }, { geo: pun, color: piedra }, caja(1.2, 2.2, 0.1, 0, 58, 2.15, hex("#20262E")), caja(9, 0.4, 9, 0, 0.2, 0, hex("#BDB5A2")));
  return fundir(p);
}

/** La huella viene en ejes de mundo; se pasa a ejes del modelo, que después se gira con `giro`. */
export function geoSingular(id: string, huella: number[], giro = 0): THREE.BufferGeometry | null {
  const c = Math.cos(giro), s = Math.sin(giro), anillo: number[] = [];
  for (let i = 0; i < huella.length; i += 2) anillo.push(huella[i] * c + huella[i + 1] * s, -huella[i] * s + huella[i + 1] * c);
  switch (id) {
    case "obelisco": return obelisco();
    case "pilar": return pilar();
    case "recoleta": return portalRecoleta();
    case "floralis": return floralis();
    case "derecho": return derecho(anillo);
    case "congreso": return congreso(anillo);
    case "rosada": return rosada(anillo);
    case "barolo": return barolo(anillo);
    case "colon": return colon(anillo);
    case "kavanagh": return kavanagh(anillo);
  }
  return null;
}
