/* Árboles: copas hechas con tarjetas de hojas alfa, dibujadas en un canvas, sin fotos.
   Hay un solo juego de mallas instanciadas por especie para toda la ciudad visible: las celdas
   aportan posiciones y acá se reparten en cerca (muchas tarjetas) y lejos (pocas y grandes). */
import * as THREE from "three";
import { caja, fundir, hex, type Parte } from "./objetos";
import * as P from "./piezas";

const COLS = 4, FILAS = 2;

interface Forma { alto: number; ancho: number; copa: [number, number]; tronco: number; talla: number; cerca: number; lejos: number; achata: number; hoja: number; aire: number }
/* alto: base de la copa; ancho, alto de copa (semiejes); tronco: radio. Medidas de un árbol grande de vereda */
const FORMAS: Forma[] = [
  /* plátano  */ { alto: 5.5, ancho: 5.2, copa: [5.2, 6.8], tronco: 0.26, talla: 3.1, cerca: 70, lejos: 15, achata: 1, hoja: 0.9, aire: 0.05 },
  /* tipa     */ { alto: 6.2, ancho: 7.2, copa: [7.2, 4.6], tronco: 0.34, talla: 3.2, cerca: 74, lejos: 15, achata: 0.8, hoja: 0.72, aire: 0.08 },
  /* jacarandá*/ { alto: 4.4, ancho: 4.4, copa: [4.4, 4], tronco: 0.2, talla: 2.6, cerca: 56, lejos: 12, achata: 0.9, hoja: 0.7, aire: 0.2 },
  /* fresno   */ { alto: 3.8, ancho: 3.8, copa: [3.8, 4.4], tronco: 0.18, talla: 2.5, cerca: 56, lejos: 12, achata: 1, hoja: 0.8, aire: 0.05 },
  /* palo bor.*/ { alto: 5.4, ancho: 4.6, copa: [4.6, 3.8], tronco: 0.5, talla: 2.7, cerca: 44, lejos: 11, achata: 0.9, hoja: 0.8, aire: 0.3 },
  /* gomero   */ { alto: 3.4, ancho: 8.6, copa: [8.6, 6.4], tronco: 0.62, talla: 3.8, cerca: 84, lejos: 16, achata: 0.9, hoja: 1, aire: 0.02 },
  /* palmera  */ { alto: 8.6, ancho: 3.4, copa: [3.4, 1.7], tronco: 0.3, talla: 2.7, cerca: 22, lejos: 9, achata: 1, hoja: 1, aire: 0 },
];

type Dib = (c: CanvasRenderingContext2D, s: number, R: () => number) => void;

function hojaOval(c: CanvasRenderingContext2D, x: number, y: number, l: number, an: number, g: number, col: string) {
  c.save(); c.translate(x, y); c.rotate(g);
  c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(l * 0.45, an, l, 0); c.quadraticCurveTo(l * 0.45, -an, 0, 0);
  c.fillStyle = col; c.fill(); c.restore();
}
const tonos = (r: number, g: number, b: number, v: number, R: () => number) => { const k = 1 + (R() - 0.5) * v; return `rgb(${Math.min(255, r * k)},${Math.min(255, g * k)},${Math.min(255, b * k)})`; };

/** Ramillete denso de hojas que llena el cuadro y se desvanece en los bordes. */
function ramillete(c: CanvasRenderingContext2D, s: number, R: () => number, n: number, dib: (x: number, y: number, g: number) => void) {
  for (let i = 0; i < n; i++) {
    const a = R() * 6.283, r = Math.sqrt(R()) * 0.48 * s, x = s / 2 + Math.cos(a) * r, y = s / 2 + Math.sin(a) * r;
    dib(x, y, R() * 6.283);
  }
}
const DIBUJOS: Dib[] = [
  /* plátano: hoja grande y palmeada */
  (c, s, R) => ramillete(c, s, R, 170, (x, y, g) => {
    const l = s * 0.085, col = tonos(112, 142, 62, 0.5, R);
    for (const d of [-0.7, 0, 0.7]) hojaOval(c, x, y, l, l * 0.42, g + d, col);
  }),
  /* tipa: folíolos chicos y claros */
  (c, s, R) => ramillete(c, s, R, 560, (x, y, g) => hojaOval(c, x, y, s * 0.04, s * 0.011, g, tonos(118, 150, 66, 0.45, R))),
  /* jacarandá en flor (noviembre): manchas lilas con algo de verde plumoso */
  (c, s, R) => {
    ramillete(c, s, R, 180, (x, y, g) => hojaOval(c, x, y, s * 0.05, s * 0.01, g, tonos(100, 128, 76, 0.4, R)));
    ramillete(c, s, R, 300, (x, y) => { c.beginPath(); c.arc(x, y, s * (0.012 + R() * 0.012), 0, 6.3); c.fillStyle = tonos(150, 124, 214, 0.32, R); c.fill(); });
  },
  /* fresno: hoja mediana, verde pareja */
  (c, s, R) => ramillete(c, s, R, 300, (x, y, g) => hojaOval(c, x, y, s * 0.06, s * 0.018, g, tonos(84, 124, 58, 0.45, R))),
  /* palo borracho: verde con flor rosa */
  (c, s, R) => {
    ramillete(c, s, R, 230, (x, y, g) => hojaOval(c, x, y, s * 0.06, s * 0.016, g, tonos(84, 122, 62, 0.4, R)));
    ramillete(c, s, R, 60, (x, y) => { c.beginPath(); c.arc(x, y, s * 0.02, 0, 6.3); c.fillStyle = tonos(226, 134, 170, 0.25, R); c.fill(); });
  },
  /* gomero: hoja grande, oscura y brillante */
  (c, s, R) => ramillete(c, s, R, 200, (x, y, g) => hojaOval(c, x, y, s * 0.1, s * 0.03, g, tonos(46, 86, 50, 0.6, R))),
  /* palmera: fronda */
  (c, s, R) => {
    c.strokeStyle = "rgb(96,118,64)"; c.lineWidth = s * 0.012;
    c.beginPath(); c.moveTo(s * 0.5, s); c.quadraticCurveTo(s * 0.48, s * 0.4, s * 0.6, 0); c.stroke();
    for (let i = 0; i < 70; i++) {
      const t = i / 70, x = s * (0.5 + 0.1 * t * t), y = s * (1 - t), l = s * 0.34 * Math.sin(t * 3.1 + 0.1);
      hojaOval(c, x, y, l, s * 0.012, -2.2 + (i % 2) * 1.3 - t * 0.2, tonos(92, 124, 60, 0.4, R));
    }
  },
  /* corteza del tronco (fila inferior, última celda) */
  (c, s, R) => {
    c.fillStyle = "rgb(140,122,102)"; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 120; i++) { c.fillStyle = tonos(100, 86, 72, 0.7, R); c.fillRect(R() * s, R() * s, s * 0.14 * R() + 3, s * 0.03); }
  },
];

export function crearAtlasHojas(escala: number): THREE.CanvasTexture {
  const s = Math.round(384 * escala), cv = document.createElement("canvas");
  cv.width = s * COLS; cv.height = s * FILAS;
  const c = cv.getContext("2d")!;
  let sem = 91731;
  const R = () => { sem = Math.imul(sem ^ (sem >>> 15), 1540483477) + 12345; sem ^= sem >>> 13; return ((sem >>> 0) % 100000) / 100000; };
  DIBUJOS.forEach((d, i) => {
    c.save();
    c.translate((i % COLS) * s, Math.floor(i / COLS) * s);
    c.beginPath(); c.rect(0, 0, s, s); c.clip();
    d(c, s, R);
    c.restore();
  });
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace;
  t.premultiplyAlpha = true;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 2;
  return t;
}

function azar(sem: number) {
  let s = sem;
  return () => { s = Math.imul(s ^ (s >>> 13), 1103515245) + 12345; s ^= s >>> 11; return ((s >>> 0) % 100000) / 100000; };
}

/** Copa: tarjetas sobre un elipsoide. La normal sale del centro para que se ilumine como un volumen. */
function geoCopa(esp: number, n: number, k: number): THREE.BufferGeometry {
  const f = FORMAS[esp], R = azar(esp * 977 + n), cu = (esp % COLS) / COLS, cv = 1 - Math.floor(esp / COLS) / FILAS, du = 1 / COLS, dv = 1 / FILAS;
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], som: number[] = [], idx: number[] = [];
  const cen = new THREE.Vector3(0, f.alto + f.copa[1] * 0.92, 0), v = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), N = new THREE.Vector3(), Q = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    /* Más cáscara que relleno, con lóbulos para que el contorno no sea una bola */
    const th = R() * Math.PI * 2, u = R() * 2 - 1, r = Math.pow(R(), 0.42) * (0.82 + 0.3 * Math.sin(th * 3 + esp) * Math.sqrt(1 - u * u));
    const s = Math.sqrt(1 - u * u);
    v.set(Math.cos(th) * s * r, u * r * (u < 0 ? 0.74 : 1), Math.sin(th) * s * r);
    const px = v.x * f.copa[0], py = v.y * f.copa[1], pz = v.z * f.copa[0];
    N.set(v.x, v.y + 0.25, v.z).normalize();
    /* Tarjeta orientada al azar pero tirando a mirar hacia afuera */
    a.set(R() - 0.5, (R() - 0.5) * 0.6, R() - 0.5).normalize();
    b.copy(N).add(Q.set(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(1.3)).normalize().cross(a).normalize();
    a.crossVectors(b, N).normalize();
    const t = f.talla * k * (0.72 + R() * 0.56), base = pos.length / 3;
    for (const [sx, sy, tu, tv] of [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]]) {
      pos.push(cen.x + px + (a.x * sx + b.x * sy) * t * 0.5, cen.y + py + (a.y * sx + b.y * sy) * t * 0.5, cen.z + pz + (a.z * sx + b.z * sy) * t * 0.5);
      nor.push(N.x, N.y, N.z);
      uv.push(cu + (0.02 + tu * 0.96) * du, cv - dv + (0.02 + tv * 0.96) * dv);
      som.push(Math.min(1, 0.25 + 0.75 * r * (0.72 + 0.28 * (u + 1) * 0.5)));
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("aSom", new THREE.Float32BufferAttribute(som, 1));
  g.setIndex(idx);
  return g;
}

function geoTronco(esp: number): THREE.BufferGeometry {
  const f = FORMAS[esp], col = hex(esp === P.A_PLATANO ? "#8C7F68" : esp === P.A_PALO_BORRACHO ? "#5F7A58" : esp === P.A_PALMERA ? "#8A7558" : "#5E4C3C"), R = azar(esp + 31), p: Parte[] = [];
  const cil = (r0: number, r1: number, a: number[], b: number[], lados = 6) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), L = d.length();
    const g = new THREE.CylinderGeometry(r1, r0, L, lados, 1, true);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
    g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
    p.push({ geo: g, color: col });
  };
  if (esp === P.A_PALO_BORRACHO) {
    const h = f.alto + 1, pts = [0.5, 0.78, 0.8, 0.6, 0.34, 0.2].map((r, i) => new THREE.Vector2(r * f.tronco * 2, (h * i) / 5));
    p.push({ geo: new THREE.LatheGeometry(pts, 8), color: col });
  } else if (esp === P.A_PALMERA) {
    cil(f.tronco * 1.1, f.tronco * 0.75, [0, 0, 0], [0, f.alto + 1, 0], 7);
  } else {
    const h = f.alto + f.copa[1] * 0.3;
    cil(f.tronco * 1.25, f.tronco * 0.6, [0, 0, 0], [0, h, 0], 7);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * 6.28 + R() * 0.8, y = f.alto * (0.72 + 0.14 * (i % 3)), L = f.copa[0] * (0.55 + 0.25 * R());
      const b = [Math.cos(a) * L, y + f.copa[1] * (0.55 + 0.5 * R()), Math.sin(a) * L], m = [b[0] * 0.5, y + (b[1] - y) * 0.42, b[2] * 0.5];
      cil(f.tronco * 0.42, f.tronco * 0.24, [0, y, 0], m, 5);
      cil(f.tronco * 0.24, f.tronco * 0.08, m, b, 4);
    }
  }
  /* Cantero: borde bajo */
  p.push(caja(0.05, 0.08, 0.05, 0, -1, 0, col));
  return fundir(p);
}

const TINTES: number[][] = [[1, 1, 1], [0.92, 1, 0.92], [1.08, 1.05, 0.95], [0.94, 0.96, 1.02]];

interface Fuente { d: Float32Array }

/** Reparte los árboles de todas las celdas en las mallas de cerca y de lejos. */
export class Arboleda {
  private cerca: THREE.InstancedMesh[] = [];
  private lejos: THREE.InstancedMesh[] = [];
  private troncos: THREE.InstancedMesh[] = [];
  private fuentes = new Map<string, Fuente & { ox: number; oz: number }>();
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private eje = new THREE.Vector3(0, 1, 0);
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();
  private ult = { x: Infinity, z: Infinity, v: -1 };
  private version = 0;
  private geos: THREE.BufferGeometry[] = [];

  constructor(private grupo: THREE.Object3D, mat: THREE.ShaderMaterial, matTronco: THREE.ShaderMaterial, topeCerca: number, topeLejos: number) {
    for (let e = 0; e < P.N_ESPECIES; e++) {
      const f = FORMAS[e];
      const gc = geoCopa(e, f.cerca, 1), gl = geoCopa(e, f.lejos, 2.1), gt = geoTronco(e);
      this.geos.push(gc, gl, gt);
      const hazte = (g: THREE.BufferGeometry, tope: number, m: THREE.ShaderMaterial, capa: number) => {
        const im = new THREE.InstancedMesh(g, m, tope);
        im.frustumCulled = false;
        im.count = 0;
        im.setColorAt(0, this.c.setRGB(1, 1, 1));
        im.layers.enable(capa);
        this.grupo.add(im);
        return im;
      };
      this.cerca.push(hazte(gc, topeCerca, mat, 2));
      this.lejos.push(hazte(gl, topeLejos, mat, 2));
      this.troncos.push(hazte(gt, topeCerca * 2, matTronco, 1));
    }
  }

  agregar(k: string, d: Float32Array, ox: number, oz: number) { this.fuentes.set(k, { d, ox, oz }); this.version++; }
  quitar(k: string) { if (this.fuentes.delete(k)) this.version++; }

  /** Devuelve true si cambió lo que proyecta sombra. */
  actualizar(x: number, z: number, rCerca: number, rTronco: number, rLejos: number) {
    if (this.ult.v === this.version && Math.hypot(this.ult.x - x, this.ult.z - z) < 9) return false;
    const nuevo = this.ult.v !== this.version;
    this.ult = { x, z, v: this.version };
    const nC = new Array(P.N_ESPECIES).fill(0), nL = new Array(P.N_ESPECIES).fill(0), nT = new Array(P.N_ESPECIES).fill(0);
    for (const f of this.fuentes.values()) {
      const d = f.d;
      for (let i = 0; i < d.length; i += 8) {
        const px = d[i] + f.ox, pz = d[i + 2] + f.oz, dist = Math.hypot(px - x, pz - z);
        if (dist > rLejos) continue;
        const esp = d[i + 5], esc = d[i + 3], sem = d[i + 6];
        this.p.set(px, d[i + 1], pz);
        this.q.setFromAxisAngle(this.eje, d[i + 4]);
        this.s.set(esc, esc * (0.9 + sem * 0.25), esc);
        this.m.compose(this.p, this.q, this.s);
        const cerca = dist < rCerca && nC[esp] < this.cerca[esp].instanceMatrix.count;
        const im = cerca ? this.cerca[esp] : this.lejos[esp], n = cerca ? nC[esp]++ : nL[esp]++;
        if (n >= im.instanceMatrix.count) { if (!cerca) nL[esp]--; continue; }
        im.setMatrixAt(n, this.m);
        const t = TINTES[Math.floor(sem * 97) % TINTES.length];
        im.setColorAt(n, this.c.setRGB(t[0], t[1], t[2]));
        if (dist < rTronco && nT[esp] < this.troncos[esp].instanceMatrix.count) this.troncos[esp].setMatrixAt(nT[esp]++, this.m);
      }
    }
    const fin = (l: THREE.InstancedMesh[], n: number[]) => l.forEach((im, i) => {
      im.count = n[i];
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    });
    fin(this.cerca, nC); fin(this.lejos, nL); fin(this.troncos, nT);
    return nuevo;
  }

  contar() { return { cerca: this.cerca.reduce((a, m) => a + m.count, 0), lejos: this.lejos.reduce((a, m) => a + m.count, 0) }; }

  destruir() {
    for (const m of [...this.cerca, ...this.lejos, ...this.troncos]) { this.grupo.remove(m); m.dispose(); }
    this.geos.forEach((g) => g.dispose());
  }
}
