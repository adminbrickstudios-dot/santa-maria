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
