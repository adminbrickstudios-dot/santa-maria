/* Línea guía en el piso y terraza. Material propio: no depende de los del mundo. */
import * as THREE from "three";

const VERT = /* glsl */`
attribute float aS;
varying float vS; varying float vL;
attribute float aLado;
void main(){ vS=aS; vL=aLado; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;

/* Flechas que avanzan: se leen desde lejos y marcan para dónde ir */
const FRAG = /* glsl */`
uniform float uAvance; uniform float uTiempo; uniform vec3 uColor;
varying float vS; varying float vL;
void main(){
  if(vS<uAvance-.5) discard;
  float l=abs(vL);
  float paso=fract((vS-uTiempo*1.6)/3.);
  float flecha=smoothstep(.0,.06,paso-l*.32)*(1.-smoothstep(.34,.4,paso-l*.32));
  float a=mix(.5,.95,flecha)*(1.-smoothstep(.78,1.,l));
  gl_FragColor=vec4(mix(uColor,vec3(1.),flecha*.55),a);
}`;

export class GuiaRuta {
  malla: THREE.Mesh;
  private mat: THREE.ShaderMaterial;

  /** `pts`: x, z del mundo. `acum`: metros acumulados en cada punto. */
  constructor(escena: THREE.Scene, private pts: Float32Array, private acum: Float32Array, ancho = 1.05, y = 0.22) {
    const n = pts.length / 2, pos = new Float32Array(n * 6), s = new Float32Array(n * 2), lado = new Float32Array(n * 2), idx: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      let dx = pts[2 * b] - pts[2 * a], dz = pts[2 * b + 1] - pts[2 * a + 1];
      const L = Math.hypot(dx, dz) || 1;
      dx /= L; dz /= L;
      const nx = -dz * (ancho / 2), nz = dx * (ancho / 2), x = pts[2 * i], z = pts[2 * i + 1];
      pos.set([x + nx, y, z + nz, x - nx, y, z - nz], i * 6);
      s[i * 2] = s[i * 2 + 1] = acum[i];
      lado[i * 2] = 1; lado[i * 2 + 1] = -1;
      if (i < n - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aS", new THREE.BufferAttribute(s, 1));
    g.setAttribute("aLado", new THREE.BufferAttribute(lado, 1));
    g.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uAvance: { value: 0 }, uTiempo: { value: 0 }, uColor: { value: new THREE.Color(0x1f8bff) } },
    });
    this.malla = new THREE.Mesh(g, this.mat);
    this.malla.frustumCulled = false;
    this.malla.renderOrder = 60;
    escena.add(this.malla);
  }

  actualizar(s: number, t: number) { this.mat.uniforms.uAvance.value = s; this.mat.uniforms.uTiempo.value = t; }

  destruir() {
    this.malla.removeFromParent();
    this.malla.geometry.dispose();
    this.mat.dispose();
  }
}

/** Piso y pretil del techo. `anillo`: x, z del mundo. */
export function crearAzotea(anillo: number[] | null, cx: number, cz: number, radio: number, y: number) {
  const g = new THREE.Group();
  const forma = new THREE.Shape();
  let pts = anillo ?? [];
  if (pts.length < 6) {
    pts = [];
    for (let i = 0; i < 16; i++) pts.push(cx + Math.cos((i / 8) * Math.PI) * radio, cz + Math.sin((i / 8) * Math.PI) * radio);
  }
  forma.moveTo(pts[0], -pts[1]);
  for (let i = 2; i < pts.length; i += 2) forma.lineTo(pts[i], -pts[i + 1]);
  forma.closePath();
  const piso = new THREE.ShapeGeometry(forma);
  piso.rotateX(-Math.PI / 2);
  piso.translate(0, y + 0.03, 0);
  const mp = new THREE.MeshBasicMaterial({ color: 0xc9c5bc, side: THREE.DoubleSide });
  const mr = new THREE.MeshBasicMaterial({ color: 0xa9a59c, side: THREE.DoubleSide });
  const mPiso = new THREE.Mesh(piso, mp);
  g.add(mPiso);
  /* Pretil: una pared baja siguiendo el borde */
  const pos: number[] = [], idx: number[] = [], n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    const x = pts[2 * i], z = pts[2 * i + 1];
    pos.push(x, y, z, x, y + 0.95, z);
    const j = (i + 1) % n;
    idx.push(i * 2, i * 2 + 1, j * 2, i * 2 + 1, j * 2 + 1, j * 2);
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  pg.setIndex(idx);
  const pret = new THREE.Mesh(pg, mr);
  g.add(pret);
  return { grupo: g, destruir() { g.removeFromParent(); piso.dispose(); pg.dispose(); mp.dispose(); mr.dispose(); } };
}

/** Carteles flotantes de un filtro: se ven por encima de todo y guían hasta el lugar. */
export class CartelesFlotantes {
  private items: { s: THREE.Sprite; tx: THREE.CanvasTexture; m: THREE.SpriteMaterial; x: number; z: number }[] = [];
  private v = new THREE.Vector3();

  constructor(private escena: THREE.Scene, lista: { x: number; z: number; texto: string; sub: string }[]) {
    for (const l of lista) {
      const c = document.createElement("canvas"), g = c.getContext("2d")!;
      c.width = 512; c.height = 176;
      g.fillStyle = "#1F8BFF";
      g.beginPath(); g.roundRect(6, 6, 500, 128, 34); g.fill();
      g.beginPath(); g.moveTo(232, 130); g.lineTo(256, 172); g.lineTo(280, 130); g.fill();
      g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle";
      let t = 46;
      g.font = `800 ${t}px sans-serif`;
      while (g.measureText(l.texto).width > 464 && t > 24) { t -= 2; g.font = `800 ${t}px sans-serif`; }
      let tx = l.texto;
      while (g.measureText(tx).width > 464 && tx.length > 4) tx = tx.slice(0, -2);
      g.fillText(tx === l.texto ? tx : `${tx}…`, 256, 54);
      g.font = "700 30px sans-serif";
      g.fillText(l.sub, 256, 104);
      const textura = new THREE.CanvasTexture(c);
      textura.colorSpace = THREE.NoColorSpace;
      const m = new THREE.SpriteMaterial({ map: textura, depthTest: false, depthWrite: false, transparent: true, sizeAttenuation: true });
      const s = new THREE.Sprite(m);
      s.center.set(0.5, 0);
      s.position.set(l.x, 5, l.z);
      s.renderOrder = 70;
      escena.add(s);
      this.items.push({ s, tx: textura, m, x: l.x, z: l.z });
    }
  }

  /** Cuanto más lejos, más grande en el mundo: siempre se puede leer. */
  actualizar(cam: THREE.Camera) {
    for (const i of this.items) {
      const d = Math.hypot(i.x - cam.position.x, i.z - cam.position.z), e = Math.max(2.4, Math.min(30, d * 0.085));
      i.s.scale.set(e * 2.9, e, 1);
      i.s.position.y = 3 + Math.min(10, d * 0.03);
    }
  }

  /** Índice del cartel en un punto de la pantalla, el más cercano primero. */
  tocado(px: number, py: number, w: number, h: number, cam: THREE.Camera) {
    let mejor = -1, md = 1e9;
    this.items.forEach((i, n) => {
      const q = this.v.set(i.s.position.x, i.s.position.y + i.s.scale.y / 2, i.s.position.z).project(cam);
      if (q.z > 1) return;
      const sx = ((q.x + 1) / 2) * w, sy = ((1 - q.y) / 2) * h, d = Math.hypot(sx - px, sy - py), radio = 46;
      if (d < radio && d < md) { md = d; mejor = n; }
    });
    return mejor;
  }

  destruir() {
    for (const i of this.items) { this.escena.remove(i.s); i.tx.dispose(); i.m.dispose(); }
    this.items = [];
  }
}
