/* Modelos low-poly: árbol, farola, autos, colectivo y personas sin rostro. Todos facetados,
   con color por vértice, para instanciarlos en un solo llamado de dibujo. */
import * as THREE from "three";

export const P_FIJO = 0, P_PINTABLE = 1, P_EMISIVO = 2, P_PIERNA_A = 3, P_PIERNA_B = 4, P_FOLLAJE = 5, P_BRAZO_A = 6, P_BRAZO_B = 7;

export interface Parte { geo: THREE.BufferGeometry; color: number[]; parte?: number; gradiente?: number }

export const hex = (h: string) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };

export function caja(w: number, h: number, d: number, x: number, y: number, z: number, color: number[], parte = 0): Parte {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return { geo: g, color, parte };
}

export function fundir(partes: Parte[], conFase = false): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], col: number[] = [], par: number[] = [];
  const p = new THREE.Vector3(), q = new THREE.Vector3(), r = new THREE.Vector3(), n = new THREE.Vector3(), e = new THREE.Vector3();
  for (const pa of partes) {
    const g = pa.geo.index ? pa.geo.toNonIndexed() : pa.geo, a = g.getAttribute("position");
    let yMin = Infinity, yMax = -Infinity;
    for (let i = 0; i < a.count; i++) { yMin = Math.min(yMin, a.getY(i)); yMax = Math.max(yMax, a.getY(i)); }
    for (let i = 0; i + 2 < a.count; i += 3) {
      p.fromBufferAttribute(a, i); q.fromBufferAttribute(a, i + 1); r.fromBufferAttribute(a, i + 2);
      n.subVectors(q, p).cross(e.subVectors(r, p)).normalize();
      for (const v of [p, q, r]) {
        pos.push(v.x, v.y, v.z);
        nor.push(n.x, n.y, n.z);
        const t = pa.gradiente ? 1 - pa.gradiente * (1 - (v.y - yMin) / (yMax - yMin || 1)) : 1;
        col.push(pa.color[0] * t, pa.color[1] * t, pa.color[2] * t);
        par.push(pa.parte ?? 0);
      }
    }
    if (g !== pa.geo) g.dispose();
    pa.geo.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("aColor", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("aParte", new THREE.Float32BufferAttribute(par, 1));
  if (conFase) g.setAttribute("aFase", new THREE.InstancedBufferAttribute(new Float32Array(1), 1));
  return g;
}

function ico(r: number, x: number, y: number, z: number, sy = 1) {
  const g = new THREE.IcosahedronGeometry(r, 0);
  g.scale(1, sy, 1);
  g.rotateY(x * 3 + z);
  g.translate(x, y, z);
  return g;
}

export function geoArbol() {
  const tronco = new THREE.CylinderGeometry(0.11, 0.2, 3.6, 6, 1, true);
  tronco.translate(0, 1.8, 0);
  const rama = new THREE.CylinderGeometry(0.05, 0.1, 1.8, 5, 1, true);
  rama.rotateZ(-0.6);
  rama.translate(0.42, 3.8, 0.1);
  const blanco = [1, 1, 1];
  return fundir([
    { geo: tronco, color: hex("#6B5344") },
    { geo: rama, color: hex("#6B5344") },
    { geo: ico(2.1, 0, 5.2, 0, 0.92), color: blanco, parte: P_FOLLAJE, gradiente: 0.3 },
    { geo: ico(1.55, 1.25, 4.5, 0.5), color: blanco, parte: P_FOLLAJE, gradiente: 0.34 },
    { geo: ico(1.45, -1.05, 4.4, -0.75), color: [0.93, 0.95, 0.9], parte: P_FOLLAJE, gradiente: 0.34 },
    { geo: ico(1.25, -0.2, 6.5, 0.45), color: [1.06, 1.06, 1.02], parte: P_FOLLAJE, gradiente: 0.2 },
  ]);
}

export function geoFarola() {
  const c = hex("#3A4148");
  const palo = new THREE.CylinderGeometry(0.055, 0.1, 6.4, 6, 1, true);
  palo.translate(0, 3.2, 0);
  const brazo = new THREE.CylinderGeometry(0.04, 0.05, 1.7, 5, 1, true);
  brazo.rotateX(1.25);
  brazo.translate(0, 6.56, 0.8);
  return fundir([
    { geo: palo, color: c }, { geo: brazo, color: c },
    caja(0.26, 0.09, 0.62, 0, 6.8, 1.62, c),
    caja(0.2, 0.03, 0.5, 0, 6.74, 1.62, [1, 0.9, 0.66], P_EMISIVO),
  ]);
}

const OSC = hex("#1E2329"), VIDRIO = hex("#2C3A48");

function ruedas(xs: number[], zs: number[], r: number, w: number): Parte[] {
  const sal: Parte[] = [];
  for (const x of xs) for (const z of zs) {
    const g = new THREE.CylinderGeometry(r, r, w, 8);
    g.rotateZ(Math.PI / 2);
    g.translate(x, r, z);
    sal.push({ geo: g, color: OSC });
  }
  return sal;
}
function sombraPlana(w: number, l: number): Parte {
  const g = new THREE.PlaneGeometry(w, l);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0.03, 0);
  return { geo: g, color: [0.12, 0.11, 0.15] };
}

export function geoAuto(techo?: number[]) {
  const cab = new THREE.BoxGeometry(1.54, 0.56, 2.2);
  const a = cab.getAttribute("position");
  for (let i = 0; i < a.count; i++) if (a.getY(i) > 0) { a.setX(i, a.getX(i) * 0.86); a.setZ(i, a.getZ(i) * 0.76); }
  cab.translate(0, 1.2, -0.12);
  return fundir([
    sombraPlana(2, 4.4),
    ...ruedas([-0.8, 0.8], [-1.32, 1.3], 0.32, 0.22),
    caja(1.74, 0.56, 4.16, 0, 0.66, 0, [1, 1, 1], P_PINTABLE),
    { geo: cab, color: VIDRIO },
    caja(1.34, 0.05, 1.68, 0, 1.49, -0.12, techo ?? [1, 1, 1], techo ? P_FIJO : P_PINTABLE),
    caja(0.3, 0.14, 0.04, -0.62, 0.72, 2.09, [1, 0.96, 0.82], P_EMISIVO),
    caja(0.3, 0.14, 0.04, 0.62, 0.72, 2.09, [1, 0.96, 0.82], P_EMISIVO),
    caja(0.32, 0.12, 0.04, -0.62, 0.76, -2.09, [0.85, 0.08, 0.08], P_EMISIVO),
    caja(0.32, 0.12, 0.04, 0.62, 0.76, -2.09, [0.85, 0.08, 0.08], P_EMISIVO),
  ]);
}

export function geoColectivo() {
  const blanco = hex("#F4F1E8");
  return fundir([
    sombraPlana(2.9, 11.6),
    ...ruedas([-1.1, 1.1], [-3.3, 3.2], 0.5, 0.3),
    caja(2.48, 1.3, 11, 0, 1.12, 0, [1, 1, 1], P_PINTABLE),
    caja(2.5, 0.95, 10.6, 0, 2.2, 0, VIDRIO),
    caja(2.48, 0.32, 11, 0, 2.84, 0, [1, 1, 1], P_PINTABLE),
    caja(2.5, 0.09, 11, 0, 1.76, 0, blanco),
    caja(1.5, 0.3, 0.05, 0, 2.5, 5.51, [1, 0.72, 0.2], P_EMISIVO),
    caja(0.32, 0.18, 0.05, -0.9, 0.9, 5.51, [1, 0.96, 0.82], P_EMISIVO),
    caja(0.32, 0.18, 0.05, 0.9, 0.9, 5.51, [1, 0.96, 0.82], P_EMISIVO),
    caja(0.36, 0.2, 0.05, -0.9, 1.1, -5.51, [0.85, 0.08, 0.08], P_EMISIVO),
    caja(0.36, 0.2, 0.05, 0.9, 1.1, -5.51, [0.85, 0.08, 0.08], P_EMISIVO),
  ]);
}

export function geoPersona() {
  const piel = hex("#CDB29A"), pant = hex("#3E4757");
  const pecho = new THREE.CylinderGeometry(0.21, 0.17, 0.62, 6);
  pecho.translate(0, 1.2, 0);
  pecho.scale(1, 1, 0.68);
  const cabeza = new THREE.IcosahedronGeometry(0.125, 1);
  cabeza.translate(0, 1.6, 0);
  const pierna = (x: number, k: number): Parte => caja(0.14, 0.86, 0.16, x, 0.47, 0, pant, k);
  const brazo = (x: number, k: number): Parte => caja(0.08, 0.6, 0.09, x, 1.15, 0, piel, k);
  return fundir([
    { geo: pecho, color: [1, 1, 1], parte: P_PINTABLE },
    { geo: cabeza, color: piel },
    pierna(-0.09, P_PIERNA_A), pierna(0.09, P_PIERNA_B),
    brazo(-0.255, P_BRAZO_A), brazo(0.255, P_BRAZO_B),
    sombraPlana(0.55, 0.55),
  ], true);
}
