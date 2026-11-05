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

/* ───────── Kit ───────── */
export function geoKit(p: number): THREE.BufferGeometry {
  switch (p) {
    case P.K_CAJA: return fundir([caja(1, 1, 1, 0, 0.5, 0.5, BL, P_PINTABLE)]);
    case P.K_CORNISA: return fundir([
      caja(1, 0.34, 0.5, 0, 0.17, 0.25, [0.9, 0.9, 0.9], P_PINTABLE), caja(1, 0.3, 0.76, 0, 0.49, 0.38, BL, P_PINTABLE), caja(1, 0.36, 1, 0, 0.82, 0.5, BL, P_PINTABLE),
    ]);
    case P.K_MENSULA: {
      const s = new THREE.Shape();
      s.moveTo(0, 1); s.lineTo(1, 1); s.bezierCurveTo(1, 0.7, 0.5, 0.75, 0.32, 0.4); s.lineTo(0.18, 0); s.lineTo(0, 0); s.closePath();
      const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false, curveSegments: 4 });
      g.rotateY(-Math.PI / 2);
      g.translate(0.5, 0, 0);
      return fundir([cola(g, BL, P_PINTABLE)]);
    }
    case P.K_REJA: return fundir([placa(1, 1, 0, 0.5, 0.5, BL, P_REJA), placa(1, 1, 0, 0.5, 0.5, BL, P_REJA, Math.PI), caja(1.01, 0.05, 1, 0, 0.975, 0.5, BL, P_PINTABLE)]);
    case P.K_CANO: return fundir([placa(1, 1, 0, 0.5, 0.5, BL, P_CANO), placa(1, 1, 0, 0.5, 0.5, BL, P_CANO, Math.PI), caja(1, 0.05, 1, 0, 0.98, 0.5, BL, P_PINTABLE)]);
    case P.K_MARCO: {
      /* Solo el frente y el canto interior: cuatro cuadriláteros cada lado */
      const lado = (w: number, h: number, x: number, y: number) => caja(w, h, 1, x, y, 0.5, BL, P_PINTABLE);
      return fundir([lado(0.05, 1.04, -0.505, 0.5), lado(0.05, 1.04, 0.505, 0.5), lado(1.05, 0.03, 0, 1.005)]);
    }
    case P.K_AIRE: return fundir([
      caja(1, 1, 1, 0, 0.5, 0.5, BL, P_PINTABLE), caja(0.72, 0.7, 0.04, -0.08, 0.52, 1.01, [0.42, 0.43, 0.44], P_FIJO),
      caja(0.05, 0.12, 0.95, -0.4, -0.06, 0.5, [0.4, 0.4, 0.4]), caja(0.05, 0.12, 0.95, 0.4, -0.06, 0.5, [0.4, 0.4, 0.4]),
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
      const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false, curveSegments: 6 });
      return fundir([cola(g, BL, P_PINTABLE), caja(0.13, 0.46, 1.2, 0, 0.44, 0.6, BL, P_PINTABLE)]);
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
    case P.P_CONTENEDOR: {
      const t2 = new THREE.BoxGeometry(1.86, 0.3, 1.2); const a = t2.getAttribute("position");
      for (let i = 0; i < a.count; i++) if (a.getY(i) > 0 && a.getZ(i) < 0) a.setY(i, a.getY(i) - 0.16);
      t2.translate(0, 1.33, 0);
      return fundir([caja(1.8, 1.08, 1.14, 0, 0.66, 0, hex("#30403A")), cola(t2, hex("#26332E")), ...[-0.72, 0.72].map((x) => caja(0.12, 0.14, 0.12, x, 0.07, 0.42, FIERRO)), caja(1.8, 0.05, 0.02, 0, 0.72, 0.58, hex("#E8E6DE"))]);
    }
    case P.P_RECICLADO: return fundir([caja(1.6, 1.3, 1.1, 0, 0.75, 0, hex("#2E7A4B")), caja(1.7, 0.08, 1.2, 0, 1.44, 0, hex("#1F5A36")), caja(0.8, 0.2, 0.02, 0, 1.15, 0.56, hex("#0F2C1B"))]);
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
