/* Modelos low-poly: autos, taxi, colectivo, bici y personas sin rostro. Todos facetados,
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

const OSC = hex("#16181B"), VIDRIO = hex("#20303C"), LLANTA = hex("#8A8E92");
const P_ESPEJO = 13;

function ruedas(xs: number[], zs: number[], r: number, w: number): Parte[] {
  const sal: Parte[] = [];
  for (const x of xs) for (const z of zs) {
    const g = new THREE.CylinderGeometry(r, r, w, 10);
    g.rotateZ(Math.PI / 2);
    g.translate(x, r, z);
    sal.push({ geo: g, color: OSC });
    const l = new THREE.CylinderGeometry(r * 0.55, r * 0.55, w + 0.02, 8);
    l.rotateZ(Math.PI / 2);
    l.translate(x, r, z);
    sal.push({ geo: l, color: LLANTA });
  }
  return sal;
}

/** Perfil lateral extruido: x = largo (adelante +), y = alto. Queda centrado en el ancho. */
function perfil(pts: number[][], ancho: number, x0 = 0) {
  const s = new THREE.Shape();
  pts.forEach((p, i) => (i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1])));
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: ancho, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.05, bevelSegments: 1, curveSegments: 1 });
  g.translate(0, 0, -ancho / 2);
  g.rotateY(-Math.PI / 2);
  g.translate(x0, 0, 0);
  return g;
}

function autoBase(cuerpo: number[][], cabina: number[][], ancho: number, techo: number[] | null, ejes: [number, number], extra: Parte[] = []) {
  const n = ancho / 2 - 0.08;
  return fundir([
    ...ruedas([-n, n], ejes, 0.31, 0.2),
    { geo: perfil(cuerpo, ancho - 0.1), color: [1, 1, 1], parte: P_PINTABLE },
    { geo: perfil(cabina, ancho - 0.3), color: VIDRIO, parte: P_ESPEJO },
    ...(techo ? [caja(ancho - 0.42, 0.03, 1.5, 0, cabina.reduce((m, p) => Math.max(m, p[1]), 0) + 0.055, -0.2, techo, techo[0] === 1 && techo[1] === 1 ? P_PINTABLE : P_FIJO)] : []),
    caja(ancho - 0.1, 0.1, 0.1, 0, 0.34, ejes[1] + 0.92, OSC), caja(ancho - 0.1, 0.1, 0.1, 0, 0.36, ejes[0] - 0.88, OSC),
    caja(0.34, 0.12, 0.04, -ancho * 0.34, 0.68, ejes[1] + 0.94, [1, 0.95, 0.8], P_EMISIVO), caja(0.34, 0.12, 0.04, ancho * 0.34, 0.68, ejes[1] + 0.94, [1, 0.95, 0.8], P_EMISIVO),
    caja(0.32, 0.14, 0.04, -ancho * 0.34, 0.74, ejes[0] - 0.9, [0.8, 0.05, 0.05], P_EMISIVO), caja(0.32, 0.14, 0.04, ancho * 0.34, 0.74, ejes[0] - 0.9, [0.8, 0.05, 0.05], P_EMISIVO),
    caja(0.18, 0.08, 0.06, -ancho / 2 - 0.08, 1, 0.72, OSC), caja(0.18, 0.08, 0.06, ancho / 2 + 0.08, 1, 0.72, OSC),
    ...extra,
  ]);
}

const CUERPO = [[-2.1, 0.34], [2.12, 0.34], [2.14, 0.66], [1.95, 0.82], [0.95, 0.92], [-1.1, 0.96], [-1.95, 0.98], [-2.14, 0.84]];
const CABINA = [[0.92, 0.9], [0.3, 1.36], [-0.86, 1.4], [-1.45, 0.96]];

export function geoSedan() { return autoBase(CUERPO, CABINA, 1.76, [1, 1, 1], [-1.3, 1.34]); }

/** Taxi porteño: negro con el techo amarillo y la capelina. */
export function geoTaxi() {
  const ng = hex("#141517");
  return fundir([
    ...ruedas([-0.8, 0.8], [-1.3, 1.34], 0.31, 0.2),
    { geo: perfil(CUERPO, 1.66), color: ng, parte: 0 },
    { geo: perfil(CABINA, 1.46), color: VIDRIO, parte: P_ESPEJO },
    caja(1.34, 0.05, 1.42, 0, 1.45, -0.26, hex("#F2C100")),
    caja(0.46, 0.14, 0.16, 0, 1.54, -0.1, [1, 0.86, 0.3], P_EMISIVO),
    caja(1.66, 0.1, 0.1, 0, 0.34, 2.26, OSC), caja(1.66, 0.1, 0.1, 0, 0.36, -2.18, OSC),
    caja(0.34, 0.12, 0.04, -0.6, 0.68, 2.28, [1, 0.95, 0.8], P_EMISIVO), caja(0.34, 0.12, 0.04, 0.6, 0.68, 2.28, [1, 0.95, 0.8], P_EMISIVO),
    caja(0.32, 0.14, 0.04, -0.6, 0.74, -2.2, [0.8, 0.05, 0.05], P_EMISIVO), caja(0.32, 0.14, 0.04, 0.6, 0.74, -2.2, [0.8, 0.05, 0.05], P_EMISIVO),
  ]);
}

export function geoCamioneta() {
  return autoBase([[-2.4, 0.42], [2.3, 0.42], [2.32, 0.8], [2.1, 1.02], [1.05, 1.12], [-2.4, 1.14]], [[1.02, 1.1], [0.42, 1.74], [-2.2, 1.78], [-2.36, 1.12]], 1.88, null, [-1.45, 1.42]);
}

export function geoColectivo() {
  const blanco = hex("#EFECE2"), L = 5.7, A = 2.5;
  /* Perfil de costado: frente algo inclinado y techo apenas curvo */
  const cuerpo = [[-L, 0.42], [L - 0.05, 0.42], [L, 1.2], [L - 0.28, 2.72], [L - 0.7, 2.98], [-L + 0.4, 3.02], [-L, 2.7]];
  const ventanas: Parte[] = [];
  for (let z = -4.7; z <= 4.3; z += 1.5) for (const s of [-1, 1]) ventanas.push(caja(0.03, 0.84, 1.38, s * (A / 2 + 0.03), 2.2, z, VIDRIO, P_ESPEJO));
  return fundir([
    ...ruedas([-1.08, 1.08], [-3.3, 3.2], 0.5, 0.3),
    { geo: perfil(cuerpo, A - 0.1), color: [1, 1, 1], parte: P_PINTABLE },
    /* Franjas típicas de la línea */
    caja(A + 0.05, 0.1, 11.1, 0, 1.62, 0, blanco), caja(A + 0.05, 0.06, 11.1, 0, 1.46, 0, hex("#D8A020")), caja(A + 0.05, 0.1, 11.1, 0, 0.56, 0, hex("#20242A")),
    caja(2.1, 1.16, 0.04, 0, 2.08, L - 0.1, VIDRIO, P_ESPEJO), caja(1.9, 0.72, 0.04, 0, 2.2, -L - 0.04, VIDRIO, P_ESPEJO),
    ...ventanas,
    caja(0.04, 2.06, 1.16, A / 2 + 0.03, 1.5, 4, hex("#20282E")), caja(0.04, 2.06, 1.16, A / 2 + 0.03, 1.5, -0.8, hex("#20282E")),
    caja(1.4, 0.24, 0.04, 0, 2.76, L - 0.26, [1, 0.72, 0.2], P_EMISIVO),
    caja(0.32, 0.18, 0.05, -0.92, 0.95, L + 0.02, [1, 0.96, 0.82], P_EMISIVO), caja(0.32, 0.18, 0.05, 0.92, 0.95, L + 0.02, [1, 0.96, 0.82], P_EMISIVO),
    caja(0.36, 0.22, 0.05, -0.92, 1.1, -L - 0.03, [0.85, 0.08, 0.08], P_EMISIVO), caja(0.36, 0.22, 0.05, 0.92, 1.1, -L - 0.03, [0.85, 0.08, 0.08], P_EMISIVO),
  ]);
}

export function geoBici() {
  const c = hex("#E8701A"), pant = hex("#2E3644");
  const rueda = (z: number) => { const g = new THREE.TorusGeometry(0.33, 0.03, 4, 12); g.rotateY(Math.PI / 2); g.translate(0, 0.34, z); return g; };
  const cuerpo = new THREE.CylinderGeometry(0.18, 0.14, 0.62, 6); cuerpo.rotateX(0.35); cuerpo.translate(0, 1.32, -0.12);
  const cab = new THREE.IcosahedronGeometry(0.12, 1); cab.translate(0, 1.72, 0.06);
  return fundir([
    { geo: rueda(-0.52), color: OSC }, { geo: rueda(0.52), color: OSC },
    caja(0.05, 0.05, 1, 0, 0.72, 0, c), caja(0.05, 0.5, 0.05, 0, 0.62, -0.28, c), caja(0.05, 0.6, 0.05, 0, 0.66, 0.42, c), caja(0.46, 0.03, 0.03, 0, 1, 0.42, OSC), caja(0.1, 0.05, 0.22, 0, 0.95, -0.28, OSC),
    { geo: cuerpo, color: [1, 1, 1], parte: P_PINTABLE }, { geo: cab, color: hex("#CDB29A") },
    caja(0.12, 0.6, 0.14, -0.1, 0.72, -0.1, pant), caja(0.12, 0.6, 0.14, 0.1, 0.72, -0.1, pant),
    caja(0.07, 0.5, 0.08, -0.22, 1.22, 0.16, hex("#CDB29A")), caja(0.07, 0.5, 0.08, 0.22, 1.22, 0.16, hex("#CDB29A")),
  ]);
}

export function geoPerro() {
  const b = [1, 1, 1], pata = (x: number, z: number, k: number): Parte => caja(0.05, 0.26, 0.05, x, 0.13, z, b, k);
  return fundir([
    caja(0.17, 0.17, 0.5, 0, 0.34, 0, b, P_PINTABLE), caja(0.13, 0.13, 0.17, 0, 0.47, 0.3, b, P_PINTABLE), caja(0.03, 0.03, 0.2, 0, 0.43, -0.32, b, P_PINTABLE),
    pata(-0.06, 0.18, P_PIERNA_A), pata(0.06, 0.18, P_PIERNA_B), pata(-0.06, -0.18, P_PIERNA_B), pata(0.06, -0.18, P_PIERNA_A),
  ], true);
}

export function geoPersona() {
  const piel = hex("#CDB29A"), pant = hex("#3E4757");
  const pecho = new THREE.CylinderGeometry(0.2, 0.16, 0.6, 6);
  pecho.translate(0, 1.2, 0);
  pecho.scale(1, 1, 0.68);
  const cabeza = new THREE.IcosahedronGeometry(0.125, 1);
  cabeza.translate(0, 1.6, 0);
  const pierna = (x: number, k: number): Parte => caja(0.13, 0.9, 0.15, x, 0.45, 0, pant, k);
  const brazo = (x: number, k: number): Parte => caja(0.07, 0.56, 0.08, x, 1.16, 0, piel, k);
  return fundir([
    { geo: pecho, color: [1, 1, 1], parte: P_PINTABLE },
    { geo: cabeza, color: piel },
    pierna(-0.09, P_PIERNA_A), pierna(0.09, P_PIERNA_B),
    brazo(-0.235, P_BRAZO_A), brazo(0.235, P_BRAZO_B),
  ], true);
}
