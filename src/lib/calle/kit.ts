/* Geometrías del kit de fachada y de los objetos de la calle. Se arman una sola vez y se instancian.
   Partes: ver matProp. Las piezas del kit miden 1×1×1 (x de −.5 a .5, y de 0 a 1, z de 0 a 1 hacia afuera). */
import * as THREE from "three";
import { P_EMISIVO, P_FIJO, P_PINTABLE, caja, fundir, geoCamioneta, geoSedan, geoTaxi, hex, type Parte } from "./objetos";
import * as P from "./piezas";

const BL = [1, 1, 1];
const P_ROJO = 8, P_AMAR = 9, P_VERDE = 10, P_REJA = 11, P_VIDRIO = 12, P_ESPEJO = 13, P_CANO = 15;

const tubo = (r0: number, r1: number, h: number, x: number, y: number, z: number, lados = 6): THREE.BufferGeometry => {
  const g = new THREE.CylinderGeometry(r0, r1, h, lados, 1, false);
  g.translate(x, y + h / 2, z);
  return g;
};
const cola = (g: THREE.BufferGeometry, color: number[], parte = P_FIJO): Parte => ({ geo: g, color, parte });

/** Tubo entre dos puntos. */
function barra(a: number[], b: number[], r: number, color: number[], parte = P_FIJO, lados = 5): Parte {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), L = d.length();
  const g = new THREE.CylinderGeometry(r, r, L, lados, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  return cola(g, color, parte);
}

function placa(w: number, h: number, x: number, y: number, z: number, color: number[], parte = P_FIJO, gy = 0): Parte {
  const g = new THREE.PlaneGeometry(w, h);
  if (gy) g.rotateY(gy);
  g.translate(x, y, z);
  return { geo: g, color, parte };
}

/** Pasamanos: solo el plano de arriba, en vez de una caja entera. */
function pasamanos(): Parte {
  const g = new THREE.PlaneGeometry(1.01, 1.4);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 1, 0.5);
  return { geo: g, color: BL, parte: P_PINTABLE };
}

/* ───────── Kit ───────── */
export function geoKit(p: number): THREE.BufferGeometry {
  switch (p) {
    case P.K_CAJA: return fundir([caja(1, 1, 1, 0, 0.5, 0.5, BL, P_PINTABLE)]);
    case P.K_CORNISA: return fundir([
      caja(1, 0.34, 0.5, 0, 0.17, 0.25, [0.9, 0.9, 0.9], P_PINTABLE), caja(1, 0.3, 0.76, 0, 0.49, 0.38, BL, P_PINTABLE), caja(1, 0.36, 1, 0, 0.82, 0.5, BL, P_PINTABLE),
    ]);
    case P.K_MENSULA: {
      const s = new THREE.Shape();
      s.moveTo(0, 1); s.lineTo(1, 1); s.lineTo(0.55, 0.62); s.lineTo(0.2, 0); s.lineTo(0, 0); s.closePath();
      const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false, curveSegments: 1 });
      g.rotateY(-Math.PI / 2);
      g.translate(0.5, 0, 0);
      return fundir([cola(g, BL, P_PINTABLE)]);
    }
    case P.K_REJA: return fundir([placa(1, 1, 0, 0.5, 0.5, BL, P_REJA), placa(1, 1, 0, 0.5, 0.5, BL, P_REJA, Math.PI), pasamanos()]);
    case P.K_CANO: return fundir([placa(1, 1, 0, 0.5, 0.5, BL, P_CANO), placa(1, 1, 0, 0.5, 0.5, BL, P_CANO, Math.PI), pasamanos()]);
    case P.K_MARCO: {
      /* Solo el frente y el canto interior: cuatro cuadriláteros cada lado */
      const lado = (w: number, h: number, x: number, y: number) => caja(w, h, 1, x, y, 0.5, BL, P_PINTABLE);
      return fundir([lado(0.05, 1.04, -0.505, 0.5), lado(0.05, 1.04, 0.505, 0.5), lado(1.05, 0.03, 0, 1.005)]);
    }
    case P.K_AIRE: return fundir([
      caja(1, 1, 1, 0, 0.5, 0.5, BL, P_PINTABLE), placa(0.72, 0.7, -0.08, 0.52, 1.01, [0.42, 0.43, 0.44]),
    ]);
    case P.K_LUCARNA: {
      /* Buhardilla con frontón y ventana */
      const fr = new THREE.Shape();
      fr.moveTo(-0.55, 0.7); fr.lineTo(0.55, 0.7); fr.lineTo(0, 1); fr.closePath();
      const gf = new THREE.ExtrudeGeometry(fr, { depth: 0.14, bevelEnabled: false });
      gf.translate(0, 0, 0.86);
      const tech = new THREE.Shape();
      tech.moveTo(-0.5, 0.7); tech.lineTo(0.5, 0.7); tech.lineTo(0, 0.98); tech.closePath();
      const gt = new THREE.ExtrudeGeometry(tech, { depth: 0.9, bevelEnabled: false });
      return fundir([
        caja(0.86, 0.7, 0.9, 0, 0.35, 0.45, [0.7, 0.68, 0.62], P_FIJO), caja(0.5, 0.48, 0.04, 0, 0.36, 0.91, [0.05, 0.06, 0.08], P_ESPEJO), caja(1.02, 0.05, 0.96, 0, 0.7, 0.48, BL, P_PINTABLE),
        caja(0.12, 0.72, 0.1, -0.38, 0.36, 0.92, BL, P_PINTABLE), caja(0.12, 0.72, 0.1, 0.38, 0.36, 0.92, BL, P_PINTABLE),
        cola(gf, BL, P_PINTABLE), cola(gt, [0.11, 0.12, 0.15]),
      ]);
    }
    case P.K_ARCO: {
      const s = new THREE.Shape();
      s.moveTo(-0.5, 0); s.lineTo(-0.5, 0.22); s.quadraticCurveTo(0, 1.25, 0.5, 0.22); s.lineTo(0.5, 0); s.quadraticCurveTo(0, 0.84, -0.5, 0);
      const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false, curveSegments: 3 });
      return fundir([cola(g, BL, P_PINTABLE)]);
    }
    case P.K_VIDRIO: return fundir([
      placa(1, 1, 0, 0.5, 0.5, BL, P_VIDRIO), placa(1, 1, 0, 0.5, 0.5, BL, P_VIDRIO, Math.PI),
      caja(1.005, 0.03, 1.2, 0, 1, 0.5, BL, P_PINTABLE), caja(0.012, 1, 0.8, -0.5, 0.5, 0.5, BL, P_PINTABLE), caja(0.012, 1, 0.8, 0.5, 0.5, 0.5, BL, P_PINTABLE),
    ]);
    case P.K_MARCO_PB: return fundir([
      caja(0.05, 1, 1, -0.5, 0.5, 0.5, BL, P_PINTABLE), caja(0.05, 1, 1, 0.5, 0.5, 0.5, BL, P_PINTABLE), caja(1.05, 0.02, 1, 0, 0.99, 0.5, BL, P_PINTABLE), caja(1.05, 0.14, 0.86, 0, 0.07, 0.43, [0.55, 0.55, 0.55], P_PINTABLE),
    ]);
  }
  return fundir([caja(1, 1, 1, 0, 0.5, 0.5, BL, P_PINTABLE)]);
}

/* ───────── Objetos de la calle ───────── */
const FIERRO = hex("#2A2E33"), GRIS = hex("#7C8187"), MADERA = hex("#7A5638"), VERDE = hex("#2F5D45"), NARANJA = hex("#E8701A");

function bici(z: number, color: number[], x = 0): Parte[] {
  const rueda = (y: number): THREE.BufferGeometry => { const g = new THREE.TorusGeometry(0.33, 0.022, 4, 12); g.rotateY(Math.PI / 2); g.translate(x, 0.34, y); return g; };
  return [
    cola(rueda(z - 0.52), hex("#17191C")), cola(rueda(z + 0.52), hex("#17191C")),
    barra([x, 0.34, z - 0.52], [x, 0.85, z - 0.2], 0.018, color), barra([x, 0.85, z - 0.2], [x, 0.9, z + 0.3], 0.018, color), barra([x, 0.34, z + 0.52], [x, 0.98, z + 0.34], 0.018, color),
    barra([x, 0.35, z - 0.05], [x, 0.85, z - 0.2], 0.018, color), barra([x, 0.35, z - 0.05], [x, 0.9, z + 0.3], 0.018, color), barra([x, 0.35, z - 0.05], [x, 0.34, z - 0.52], 0.014, color),
    barra([x - 0.23, 1.02, z + 0.32], [x + 0.23, 1.02, z + 0.32], 0.014, FIERRO), caja(0.1, 0.05, 0.24, x, 0.92, z - 0.26, FIERRO),
  ];
}

export function geoProp(t: number): THREE.BufferGeometry {
  switch (t) {
    case P.P_FAROLA: return fundir([
      cola(tubo(0.05, 0.095, 7.6, 0, 0, 0), FIERRO), cola(tubo(0.11, 0.12, 1.4, 0, 0, 0), FIERRO),
      barra([0, 7.6, 0], [0, 8.1, 0.5], 0.05, FIERRO), barra([0, 8.1, 0.5], [0, 8.25, 1.5], 0.04, FIERRO),
      caja(0.24, 0.1, 0.62, 0, 8.25, 1.72, GRIS), caja(0.18, 0.02, 0.5, 0, 8.19, 1.72, [1, 0.86, 0.6], P_EMISIVO),
    ]);
    case P.P_FAROL_PLAZA: {
      const g = new THREE.SphereGeometry(0.17, 8, 6);
      g.translate(0, 4.05, 0);
      return fundir([cola(tubo(0.05, 0.13, 3.7, 0, 0, 0), hex("#1C2A24")), cola(tubo(0.15, 0.17, 0.5, 0, 0, 0), hex("#1C2A24")), cola(g, [1, 0.92, 0.74], P_EMISIVO), caja(0.1, 0.08, 0.1, 0, 3.75, 0, hex("#1C2A24"))]);
    }
    case P.P_SEMAFORO: {
      const luces: Parte[] = [];
      [[2.86, [1, 0.1, 0.06], P_ROJO], [2.62, [1, 0.62, 0.05], P_AMAR], [2.38, [0.1, 1, 0.4], P_VERDE]].forEach(([y, c, pa]) => {
        const g = new THREE.CircleGeometry(0.09, 10);
        g.translate(0, y as number, 0.135);
        luces.push({ geo: g, color: c as number[], parte: pa as number });
      });
      return fundir([
        cola(tubo(0.05, 0.065, 3.4, 0, 0, -0.1), hex("#30343A")), caja(0.3, 0.8, 0.22, 0, 2.62, 0.02, hex("#17191C")),
        caja(0.36, 0.86, 0.02, 0, 2.62, -0.08, hex("#E9E2CE")), caja(0.24, 0.04, 0.12, 0, 2.97, 0.17, hex("#17191C")), caja(0.24, 0.04, 0.12, 0, 2.73, 0.17, hex("#17191C")), caja(0.24, 0.04, 0.12, 0, 2.49, 0.17, hex("#17191C")), ...luces,
        /* Peatonal, mirando de costado sobre el mismo poste */
        caja(0.22, 0.46, 0.18, 0.2, 2.02, -0.1, hex("#17191C")),
        (() => { const g = new THREE.PlaneGeometry(0.13, 0.13); g.rotateY(Math.PI / 2); g.translate(0.315, 2.14, -0.1); return { geo: g, color: [1, 0.12, 0.08], parte: 16 }; })(),
        (() => { const g = new THREE.PlaneGeometry(0.13, 0.13); g.rotateY(Math.PI / 2); g.translate(0.315, 1.9, -0.1); return { geo: g, color: [0.12, 1, 0.45], parte: 17 }; })(),
      ]);
    }
    case P.P_GARITA: {
      return fundir([
        ...[-1.75, 1.75].map((x) => caja(0.08, 2.5, 0.08, x, 1.25, -0.5, hex("#3A4148"))), ...[-1.75, 1.75].map((x) => caja(0.06, 2.5, 0.06, x, 1.25, 0.5, hex("#3A4148"))),
        caja(3.9, 0.08, 1.5, 0, 2.54, 0, hex("#3A4148")), placa(3.4, 1.9, 0, 1.2, -0.5, BL, P_VIDRIO), placa(3.4, 1.9, 0, 1.2, -0.5, BL, P_VIDRIO, Math.PI),
        caja(2.4, 0.05, 0.36, -0.4, 0.5, -0.28, hex("#8C9398")), caja(0.06, 0.5, 0.3, -1.5, 0.25, -0.28, FIERRO), caja(0.06, 0.5, 0.3, 0.7, 0.25, -0.28, FIERRO),
        caja(1.25, 2.1, 0.14, 1.9, 1.15, 0, hex("#3A4148")), caja(1.05, 1.75, 0.16, 1.9, 1.2, 0, [0.9, 0.92, 0.95], P_EMISIVO),
      ]);
    }
    case P.P_PARADA: return fundir([cola(tubo(0.04, 0.04, 2.7, 0, 0, 0), hex("#D9B21F")), caja(0.46, 0.4, 0.03, 0, 2.54, 0, hex("#1E5AA8")), caja(0.34, 0.1, 0.035, 0, 2.54, 0, hex("#F2F2EC"))]);
    case P.P_BANCO: return fundir([
      ...[0.16, 0.05, -0.06].map((z) => caja(1.8, 0.04, 0.09, 0, 0.45, z, MADERA)), ...[0.74, 0.62].map((y) => caja(1.8, 0.09, 0.03, 0, y, -0.14, MADERA)),
      ...[-0.72, 0.72].flatMap((x) => [caja(0.05, 0.44, 0.42, x, 0.22, 0.02, FIERRO), caja(0.05, 0.42, 0.04, x, 0.62, -0.13, FIERRO)]),
    ]);
    case P.P_CESTO: return fundir([cola(tubo(0.03, 0.03, 1.1, 0, 0, -0.16), FIERRO), cola(tubo(0.17, 0.15, 0.55, 0, 0.45, 0, 8), hex("#D76A1A")), cola(tubo(0.18, 0.18, 0.04, 0, 1, 0, 8), hex("#22282C"))]);
    case P.P_POSTA: return fundir([barra([-0.8, 0, 0], [-0.8, 2.3, 0], 0.05, hex("#2E6E8E")), barra([0.8, 0, 0], [0.8, 2.3, 0], 0.05, hex("#2E6E8E")), barra([-0.8, 2.3, 0], [0.8, 2.3, 0], 0.04, hex("#D8D8D2")), barra([-0.8, 1.4, 0], [0.8, 1.4, 0], 0.03, hex("#D8D8D2")), caja(1.3, 0.1, 0.5, 0, 0.5, 0.9, hex("#2E6E8E")), caja(0.1, 0.5, 0.1, 0, 0.25, 0.9, FIERRO)]);
    case P.P_MESA: return fundir([caja(1.8, 0.06, 0.7, 0, 0.74, 0, MADERA), caja(1.8, 0.05, 0.28, 0, 0.45, 0.62, MADERA), caja(1.8, 0.05, 0.28, 0, 0.45, -0.62, MADERA), ...[-0.7, 0.7].map((x) => caja(0.08, 0.74, 1.3, x, 0.37, 0, FIERRO))]);
    case P.P_BANDERA: {
      /* Mástil y paño celeste y blanco, que ondea en el shader (parte 18) */
      const f = new THREE.PlaneGeometry(1.9, 1.15, 8, 3);
      f.translate(0.98, 9.2, 0);
      const f2 = f.clone();
      f2.rotateY(Math.PI);
      f2.translate(1.96, 0, 0);
      return fundir([cola(tubo(0.035, 0.06, 9.9, 0, 0, 0), hex("#C9CDD2")), { geo: f, color: BL, parte: 18 }, { geo: f2, color: BL, parte: 18 }]);
    }
    case P.P_MACETA: {
      const g = new THREE.IcosahedronGeometry(0.34, 1);
      g.scale(1, 1.1, 1);
      g.translate(0, 0.86, 0);
      return fundir([cola(tubo(0.3, 0.22, 0.5, 0, 0, 0, 8), hex("#9A6A4C")), cola(g, hex("#4D7A3C"))]);
    }
    case P.P_CAFE: {
      const silla = (x: number, z: number) => [caja(0.38, 0.03, 0.38, x, 0.46, z, hex("#6B4A32")), caja(0.38, 0.4, 0.03, x, 0.68, z + (z > 0 ? 0.18 : -0.18), hex("#6B4A32")), caja(0.03, 0.46, 0.03, x - 0.16, 0.23, z - 0.16, FIERRO), caja(0.03, 0.46, 0.03, x + 0.16, 0.23, z + 0.16, FIERRO)];
      const t2 = new THREE.CylinderGeometry(0.36, 0.36, 0.03, 12);
      t2.translate(0, 0.74, 0);
      return fundir([cola(t2, hex("#E6E2D8")), cola(tubo(0.03, 0.03, 0.72, 0, 0, 0), FIERRO), cola(tubo(0.22, 0.24, 0.03, 0, 0, 0, 8), FIERRO), ...silla(0, 0.62), ...silla(0, -0.62)]);
    }
    case P.P_SOMBRILLA: {
      const g = new THREE.ConeGeometry(1.5, 0.5, 8, 1, true);
      g.translate(0, 2.5, 0);
      return fundir([cola(g, BL, P_PINTABLE), cola(tubo(0.025, 0.025, 2.6, 0, 0, 0), hex("#D8D8D2"))]);
    }
    case P.P_PUBLICIDAD: return fundir([caja(1.3, 1.9, 0.14, 0, 1.75, 0, hex("#2F3338")), caja(1.14, 1.72, 0.16, 0, 1.75, 0, [0.82, 0.84, 0.86], P_EMISIVO), caja(0.14, 0.82, 0.14, 0, 0.41, 0, hex("#2F3338"))]);
    case P.P_SENAL: {
      const d = new THREE.CircleGeometry(0.24, 12);
      d.translate(0, 2.42, 0.05);
      const a = new THREE.CircleGeometry(0.3, 14);
      a.translate(0, 2.42, 0.045);
      const d2 = new THREE.CircleGeometry(0.31, 12);
      d2.rotateY(Math.PI);
      d2.translate(0, 2.42, 0.04);
      return fundir([cola(tubo(0.03, 0.03, 2.5, 0, 0, 0), hex("#8A8F94")), { geo: d, color: BL, parte: P_PINTABLE }, cola(a, hex("#D8D6CE")), cola(d2, hex("#8A8F94"))]);
    }
    case P.P_PARQUIMETRO: return fundir([cola(tubo(0.05, 0.05, 1.05, 0, 0, 0), hex("#3A4148")), caja(0.26, 0.44, 0.2, 0, 1.25, 0, hex("#2E5E9E")), caja(0.17, 0.12, 0.03, 0, 1.33, 0.11, [0.7, 0.9, 0.8], P_EMISIVO)]);
    case P.P_FLORES: return fundir([
      caja(2.6, 2.2, 1.5, 0, 1.1, -0.6, hex("#3A5A48")), caja(3.2, 0.08, 2.2, 0, 2.3, 0.1, hex("#2E4A3A")), caja(2.8, 0.1, 0.5, 0, 0.72, 0.5, hex("#6B5138")), caja(2.8, 0.1, 0.5, 0, 0.42, 0.85, hex("#6B5138")),
      ...Array.from({ length: 16 }, (_, i) => { const g = new THREE.IcosahedronGeometry(0.15, 0); g.translate(-1.2 + (i % 8) * 0.34, 0.92 - Math.floor(i / 8) * 0.28, 0.5 + Math.floor(i / 8) * 0.34); return cola(g, hex(["#D8476A", "#E8C23C", "#E86A3C", "#F2EDE4", "#B04AA8", "#D8476A", "#7A5AC8", "#E86A3C"][i % 8])); }),
    ]);
    case P.P_JUEGOS: return fundir([
      /* Hamacas */
      barra([-2.6, 0, 0.7], [-2.1, 2.4, 0], 0.05, hex("#D8532C")), barra([-2.6, 0, -0.7], [-2.1, 2.4, 0], 0.05, hex("#D8532C")), barra([1.1, 0, 0.7], [0.6, 2.4, 0], 0.05, hex("#D8532C")), barra([1.1, 0, -0.7], [0.6, 2.4, 0], 0.05, hex("#D8532C")), barra([-2.1, 2.4, 0], [0.6, 2.4, 0], 0.05, hex("#2E6E8E")),
      barra([-1.5, 2.4, 0], [-1.5, 0.55, 0], 0.012, FIERRO), barra([-0.7, 2.4, 0], [-0.7, 0.55, 0], 0.012, FIERRO), barra([-0.2, 2.4, 0], [-0.2, 0.55, 0], 0.012, FIERRO), caja(0.5, 0.04, 0.2, -1.1, 0.55, 0, hex("#E0B020")), caja(0.5, 0.04, 0.2, 0.05, 0.55, 0, hex("#E0B020")),
      /* Tobogán */
      caja(1, 0.08, 1, 3.4, 1.8, 2.4, hex("#2E6E8E")), ...[[2.95, 1.95], [3.85, 1.95], [2.95, 2.85], [3.85, 2.85]].map(([x, z]) => caja(0.08, 1.8, 0.08, x, 0.9, z, hex("#D8532C"))),
      (() => { const g = new THREE.BoxGeometry(0.7, 0.05, 3.1); g.rotateX(0.62); g.translate(3.4, 0.95, 0.75); return cola(g, hex("#E0B020")); })(),
      /* Subibaja */
      (() => { const g = new THREE.BoxGeometry(3, 0.08, 0.26); g.rotateZ(0.16); g.translate(-3, 0.5, -2.6); return cola(g, hex("#3C8E5A")); })(), caja(0.2, 0.42, 0.3, -3, 0.21, -2.6, hex("#D8532C")),
    ]);
    case P.P_ARBUSTO: {
      const g = new THREE.IcosahedronGeometry(0.62, 1);
      g.scale(1.2, 0.86, 1.2);
      g.translate(0, 0.46, 0);
      const h = new THREE.IcosahedronGeometry(0.42, 0);
      h.translate(0.5, 0.36, 0.22);
      return fundir([{ geo: g, color: hex("#4C7234"), parte: P_PINTABLE }, { geo: h, color: hex("#42682E"), parte: P_PINTABLE }]);
    }
    case P.P_POSTE_LUZ: return fundir([cola(tubo(0.09, 0.13, 7.6, 0, 0, 0), hex("#5E4A38")), caja(1.2, 0.08, 0.08, 0, 7.05, 0, hex("#5E4A38")), caja(0.1, 0.18, 0.1, -0.5, 7.14, 0, hex("#D8D8D2")), caja(0.1, 0.18, 0.1, 0.5, 7.14, 0, hex("#D8D8D2"))]);
    case P.P_VALLA: return fundir([caja(2.4, 0.1, 0.05, 0, 1, 0, hex("#D8532C")), caja(2.4, 0.1, 0.05, 0, 0.55, 0, hex("#E8E4D8")), caja(0.06, 1.05, 0.06, -1.1, 0.52, 0, FIERRO), caja(0.06, 1.05, 0.06, 1.1, 0.52, 0, FIERRO)]);
    case P.P_CONTENEDOR: {
      const t2 = new THREE.BoxGeometry(1.86, 0.3, 1.2); const a = t2.getAttribute("position");
      for (let i = 0; i < a.count; i++) if (a.getY(i) > 0 && a.getZ(i) < 0) a.setY(i, a.getY(i) - 0.16);
      t2.translate(0, 1.33, 0);
      return fundir([caja(1.8, 1.08, 1.14, 0, 0.66, 0, BL, P_PINTABLE), { geo: t2, color: [0.8, 0.8, 0.8], parte: P_PINTABLE }, ...[-0.72, 0.72].map((x) => caja(0.12, 0.14, 0.12, x, 0.07, 0.42, FIERRO)), caja(1.8, 0.05, 0.02, 0, 0.72, 0.58, hex("#E8E6DE"))]);
    }
    case P.P_RECICLADO: {
      const g = new THREE.LatheGeometry([[0.72, 0], [0.76, 0.9], [0.62, 1.5], [0.28, 1.8], [0, 1.86]].map(([r, y]) => new THREE.Vector2(r, y)), 10);
      return fundir([cola(g, hex("#2E7A4B")), caja(0.4, 0.14, 0.05, 0, 1.15, 0.72, hex("#0F2C1B")), caja(0.3, 0.3, 0.02, 0, 0.7, 0.76, hex("#E8E4D8"))]);
    }
    case P.P_FUENTE: return fundir([
      cola(tubo(2.5, 2.7, 0.5, 0, 0, 0, 18), hex("#B9B2A2")), cola(tubo(2.32, 2.32, 0.02, 0, 0.49, 0, 18), [0.1, 0.2, 0.22], P_ESPEJO), cola(tubo(0.3, 0.5, 1.2, 0, 0.5, 0, 8), hex("#A9A293")), cola(tubo(0.8, 0.5, 0.18, 0, 1.7, 0, 10), hex("#B9B2A2")), cola(tubo(0.12, 0.18, 0.5, 0, 1.88, 0, 6), hex("#A9A293")),
    ]);
    case P.P_BICIS: return fundir([0, 1, 2, 3].map((i) => { const g = new THREE.TorusGeometry(0.34, 0.025, 4, 8, Math.PI); g.translate(-1.2 + i * 0.8, 0.5, 0); return cola(g, GRIS); }).concat(...[0, 1, 2, 3].map((i) => [barra([-1.54 + i * 0.8, 0, 0], [-1.54 + i * 0.8, 0.5, 0], 0.024, GRIS), barra([-0.86 + i * 0.8, 0, 0], [-0.86 + i * 0.8, 0.5, 0], 0.024, GRIS)])));
    case P.P_ECOBICI: {
      const b: Parte[] = [];
      for (let i = 0; i < 4; i++) b.push(...bici(0, NARANJA, -2.2 + i * 0.9), caja(0.1, 0.8, 0.1, -2.2 + i * 0.9, 0.4, -0.72, hex("#3A4148")));
      return fundir([...b, caja(0.5, 2, 0.24, 1.5, 1, -0.5, hex("#E8701A")), caja(0.38, 0.6, 0.26, 1.5, 1.5, -0.5, [0.85, 0.9, 1], P_EMISIVO), caja(5, 0.06, 0.3, -0.4, 0.03, -0.72, hex("#3A4148"))]);
    }
    case P.P_BUZON: return fundir([cola(tubo(0.22, 0.22, 1.3, 0, 0, 0, 10), hex("#2A4E9A")), caja(0.22, 0.06, 0.03, 0, 1.1, 0.22, hex("#EAD24A"))]);
    case P.P_TELEFONO: return fundir([caja(0.1, 1.9, 0.1, 0, 0.95, -0.1, GRIS), caja(0.5, 0.7, 0.3, 0, 1.5, 0, hex("#3469A8"))]);
    case P.P_SUBTE: return fundir([
      caja(2.6, 0.95, 0.06, 0, 0.5, 2.2, hex("#2F3338")), caja(0.06, 0.95, 4.4, -1.3, 0.5, 0, hex("#2F3338")), caja(0.06, 0.95, 4.4, 1.3, 0.5, 0, hex("#2F3338")),
      caja(2.5, 0.03, 4.3, 0, 0.03, 0, [0.03, 0.03, 0.035]), cola(tubo(0.05, 0.05, 3, -1.4, 0, -2.2), FIERRO), caja(0.8, 0.8, 0.08, -1.4, 3.2, -2.2, hex("#16448C")), caja(0.5, 0.5, 0.09, -1.4, 3.2, -2.2, [0.9, 0.92, 0.95], P_EMISIVO),
    ]);
    case P.P_ESTATUA: {
      const cuerpo = new THREE.CylinderGeometry(0.28, 0.42, 1.6, 7); cuerpo.translate(0, 3.1, 0);
      const cab = new THREE.IcosahedronGeometry(0.2, 1); cab.translate(0, 4.1, 0);
      return fundir([caja(1.8, 0.3, 1.8, 0, 0.15, 0, hex("#A79F90")), caja(1.2, 1.9, 1.2, 0, 1.25, 0, hex("#B4AC9C")), caja(1.4, 0.14, 1.4, 0, 2.25, 0, hex("#A79F90")), cola(cuerpo, hex("#4A5A4C")), cola(cab, hex("#4A5A4C"))]);
    }
    case P.P_HIDRANTE: return fundir([cola(tubo(0.09, 0.1, 0.7, 0, 0, 0), hex("#B3261E")), cola(tubo(0.11, 0.09, 0.08, 0, 0.7, 0), hex("#B3261E")), caja(0.3, 0.1, 0.1, 0, 0.45, 0, hex("#B3261E"))]);
    case P.P_GABINETE: return fundir([caja(0.7, 1.3, 0.35, 0, 0.65, 0, hex("#8C9396"))]);
    case P.P_BOLARDO: return fundir([cola(tubo(0.06, 0.07, 0.8, 0, 0, 0), hex("#2A2E33"))]);
    case P.P_CAJERO: return fundir([caja(0.9, 2, 0.5, 0, 1, 0, hex("#1F4E8C")), caja(0.5, 0.36, 0.04, 0, 1.4, 0.26, [0.7, 0.85, 1], P_EMISIVO)]);
    case P.P_BEBEDERO: return fundir([cola(tubo(0.14, 0.18, 0.9, 0, 0, 0, 8), GRIS), cola(tubo(0.26, 0.18, 0.1, 0, 0.9, 0, 8), GRIS)]);
    case P.P_RELOJ: return fundir([cola(tubo(0.06, 0.1, 3.4, 0, 0, 0), hex("#1C2A24")), cola((() => { const g = new THREE.CylinderGeometry(0.34, 0.34, 0.14, 14); g.rotateX(Math.PI / 2); g.translate(0, 3.7, 0); return g; })(), [1, 0.96, 0.86], P_EMISIVO)]);
    case P.P_POSTE_CALLE: return fundir([cola(tubo(0.04, 0.04, 3.5, 0, 0, 0), hex("#25282D"))]);
    case P.P_KIOSCO: return fundir([
      caja(3.2, 2.3, 1.7, 0, 1.15, 0, hex("#3C4A44")), caja(3.8, 0.1, 2.4, 0, 2.4, 0.2, hex("#2B3631")), caja(2.8, 1.5, 0.05, 0, 1.2, 0.87, [0.65, 0.5, 0.42], P_PINTABLE),
      ...Array.from({ length: 12 }, (_, i) => caja(0.21, 0.3, 0.03, -1.2 + (i % 6) * 0.48, 0.75 + Math.floor(i / 6) * 0.42, 0.9, hex(["#D65A4A", "#3C7EBF", "#E0A42E", "#F2EFE6", "#4EA579", "#8A62B8"][i % 6]))),
    ]);
    case P.P_SEPARADOR: return fundir([caja(0.2, 0.12, 0.9, 0, 0.06, 0, hex("#E0B020")), caja(0.21, 0.125, 0.26, 0, 0.06, 0, hex("#1E1E20"))]);
    case P.P_BOVEDA: {
      const m = hex("#C9C2B0"), o = hex("#A9A392");
      const s = new THREE.Shape();
      s.moveTo(-1.5, 0); s.lineTo(1.5, 0); s.lineTo(0, 0.9); s.closePath();
      const f = new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: false });
      f.translate(0, 4.4, 1.8);
      const cruz = caja(0.08, 0.7, 0.08, 0, 5.6, 2, o);
      return fundir([caja(3, 4.4, 4, 0, 2.2, 0, m), caja(3.3, 0.3, 4.3, 0, 4.4, 0, o), caja(3.3, 0.5, 4.3, 0, 0.25, 0, o), caja(1.2, 2.6, 0.08, 0, 1.6, 2.02, hex("#26302A")), cola(f, m), cruz, caja(0.4, 0.08, 0.08, 0, 5.72, 2, o)]);
    }
    case P.P_AUTO: return geoSedan();
    case P.P_TAXI: return geoTaxi();
    case P.P_CAMIONETA: return geoCamioneta();
    case P.P_ANTENA: return fundir([barra([0, 0, 0], [0, 3.6, 0], 0.02, GRIS), barra([-0.5, 2.9, 0], [0.5, 2.9, 0], 0.012, GRIS), barra([-0.4, 3.2, 0], [0.4, 3.2, 0], 0.012, GRIS), barra([-0.3, 3.45, 0], [0.3, 3.45, 0], 0.012, GRIS)]);
  }
  return fundir([caja(0.3, 0.3, 0.3, 0, 0.15, 0, GRIS)]);
}

export { bici as partesBici, P_ESPEJO };
