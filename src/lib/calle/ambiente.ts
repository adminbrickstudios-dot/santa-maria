/* Lo chico que da vida: hojas que caen, palomas que se espantan y lluvia opcional. Todo instanciado,
   cerca de la cámara y barato: unas decenas de matrices por cuadro y una malla animada solo en el shader. */
import * as THREE from "three";
import type { Comunes } from "./materiales";
import type { Mundo } from "./mundo";
import { caja, fundir, hex } from "./objetos";

const N_HOJAS = 36, N_PALOMAS = 14, N_GOTAS = 700;

interface Paloma { x: number; z: number; y: number; g: number; vuela: number; vx: number; vz: number; viva: boolean; f: number }

function geoPaloma() {
  const c = new THREE.IcosahedronGeometry(0.1, 1);
  c.scale(0.8, 0.85, 1.5);
  c.translate(0, 0.13, 0);
  const cab = new THREE.IcosahedronGeometry(0.05, 0);
  cab.translate(0, 0.21, 0.13);
  return fundir([
    { geo: c, color: hex("#7E858E") }, { geo: cab, color: hex("#4E5A62") }, caja(0.014, 0.012, 0.03, 0, 0.2, 0.19, hex("#D8A23C")),
    caja(0.05, 0.02, 0.14, 0, 0.13, -0.17, hex("#5E656E")), caja(0.012, 0.09, 0.012, -0.03, 0.04, 0, hex("#A8524A")), caja(0.012, 0.09, 0.012, 0.03, 0.04, 0, hex("#A8524A")),
  ]);
}

function geoHoja() {
  const g = new THREE.PlaneGeometry(0.09, 0.13);
  const f = fundir([{ geo: g, color: [1, 1, 1], parte: 1 }]);
  return f;
}

export class Ambiente {
  private hojas: THREE.InstancedMesh;
  private palomas: THREE.InstancedMesh;
  private lluvia: THREE.LineSegments;
  private matLluvia: THREE.ShaderMaterial;
  private h: { x: number; y: number; z: number; r: number; s: number; v: number }[] = [];
  private p: Paloma[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3(1, 1, 1);
  private c = new THREE.Color();
  private tNacer = 0;
  private uCam = { value: new THREE.Vector3() };

  constructor(private escena: THREE.Scene, mat: THREE.ShaderMaterial, private comunes: Comunes) {
    this.hojas = new THREE.InstancedMesh(geoHoja(), mat, N_HOJAS);
    this.hojas.frustumCulled = false;
    const tonos = ["#9A8A3C", "#7E7A34", "#B09A44", "#6E7A38"];
    for (let i = 0; i < N_HOJAS; i++) {
      this.hojas.setColorAt(i, this.c.setStyle(tonos[i % 4], THREE.LinearSRGBColorSpace));
      this.h.push({ x: 0, y: -1, z: 0, r: Math.random() * 6, s: Math.random() * 6, v: 0.5 + Math.random() * 0.5 });
    }
    escena.add(this.hojas);

    this.palomas = new THREE.InstancedMesh(geoPaloma(), mat, N_PALOMAS);
    this.palomas.frustumCulled = false;
    this.palomas.count = 0;
    for (let i = 0; i < N_PALOMAS; i++) this.p.push({ x: 0, y: 0.15, z: 0, g: 0, vuela: 0, vx: 0, vz: 0, viva: false, f: Math.random() * 6 });
    escena.add(this.palomas);

    /* Lluvia: una sola malla de rayitas; cada una cae y da la vuelta alrededor de la cámara en el shader */
    const pos = new Float32Array(N_GOTAS * 6), sem = new Float32Array(N_GOTAS * 2 * 3);
    for (let i = 0; i < N_GOTAS; i++) {
      const x = Math.random() * 44, y = Math.random() * 18, z = Math.random() * 44;
      for (const k of [0, 1]) {
        pos.set([x, y, z], i * 6 + k * 3);
        sem.set([k, Math.random() * 3 + 9, Math.random()], i * 6 + k * 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSem", new THREE.BufferAttribute(sem, 3));
    this.matLluvia = new THREE.ShaderMaterial({
      uniforms: { uTiempo: comunes.uTiempo, uCam: this.uCam },
      transparent: true, depthWrite: false,
      vertexShader: /* glsl */ `
        attribute vec3 aSem; uniform float uTiempo; uniform vec3 uCam; varying float vA;
        void main(){
          vec3 p=position;
          p.y=mod(p.y-uTiempo*aSem.y,18.);
          p.xz=mod(p.xz-uCam.xz+22.,44.)-22.+uCam.xz;
          p.y+=aSem.x*.5; p.x+=aSem.x*.04;
          vA=aSem.x*.5+.1;
          gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);
        }`,
      fragmentShader: `varying float vA; void main(){ gl_FragColor=vec4(.8,.85,.92,vA*.5); }`,
    });
    this.lluvia = new THREE.LineSegments(g, this.matLluvia);
    this.lluvia.frustumCulled = false;
    this.lluvia.visible = false;
    this.lluvia.renderOrder = 60;
    escena.add(this.lluvia);
  }

  setLluvia(activa: boolean) {
    this.lluvia.visible = activa;
    this.comunes.uLluvia.value = activa ? 1 : 0;
  }

  actualizar(dt: number, t: number, x: number, z: number, y: number, mundo: Mundo, alto: boolean) {
    this.uCam.value.set(x, y, z);
    const bajo = y < 12;
    this.hojas.visible = bajo && !alto;
    if (this.hojas.visible) {
      const noHay = this.comunes.uNoche.value > 0.9 ? 0.7 : 0;
      for (let i = 0; i < N_HOJAS; i++) {
        const h = this.h[i];
        h.y -= dt * h.v;
        if (h.y < 0.2) {
          if (Math.random() > 0.02 + noHay * 0 ) { this.s.setScalar(0); this.v.set(0, -9, 0); this.m.compose(this.v, this.q, this.s); this.hojas.setMatrixAt(i, this.m); this.s.setScalar(1); continue; }
          h.x = x + (Math.random() - 0.5) * 28; h.z = z + (Math.random() - 0.5) * 28; h.y = 4 + Math.random() * 6;
        }
        const sx = Math.sin(t * 1.3 + h.s) * 0.5, sz = Math.cos(t * 1.1 + h.s * 2) * 0.4;
        this.e.set(t * 2 + h.r, t * 1.7 + h.s, Math.sin(t + h.r));
        this.q.setFromEuler(this.e);
        this.v.set(h.x + sx, h.y, h.z + sz);
        this.m.compose(this.v, this.q, this.s);
        this.hojas.setMatrixAt(i, this.m);
      }
      this.hojas.instanceMatrix.needsUpdate = true;
    }
    /* Palomas: nacen en grupitos en la vereda o la plaza y vuelan si te acercás */
    if (t - this.tNacer > 1.2 && bajo) {
      this.tNacer = t;
      const libre = this.p.filter((q) => !q.viva);
      if (libre.length >= 4 && Math.random() < 0.5) {
        const a = Math.random() * 6.28, d = 12 + Math.random() * 22, cx = x + Math.cos(a) * d, cz = z + Math.sin(a) * d;
        if (mundo.altoSuelo(cx, cz) > 0.05 && !mundo.chocar(cx, cz, 0.6)[2]) for (const q of libre.slice(0, 4)) {
          Object.assign(q, { x: cx + (Math.random() - 0.5) * 2.2, z: cz + (Math.random() - 0.5) * 2.2, y: 0.15, g: Math.random() * 6.28, vuela: 0, viva: true });
        }
      }
    }
    let n = 0;
    for (const q of this.p) {
      if (!q.viva) continue;
      const d = Math.hypot(q.x - x, q.z - z);
      if (d > 45) { q.viva = false; continue; }
      if (!q.vuela && d < 3) { q.vuela = 1; const a = Math.atan2(q.x - x, q.z - z) + (Math.random() - 0.5); q.vx = Math.sin(a) * 6; q.vz = Math.cos(a) * 6; q.g = a; }
      let pico = 0;
      if (q.vuela) {
        q.x += q.vx * dt; q.z += q.vz * dt; q.y += dt * 3.2; q.vuela += dt;
        if (q.y > 16) q.viva = false;
      } else {
        const f = t * 2 + q.f, paso = Math.sin(f) > 0.6 ? 1 : 0;
        q.x += Math.sin(q.g) * dt * 0.25 * paso; q.z += Math.cos(q.g) * dt * 0.25 * paso;
        if (Math.sin(f * 0.37) > 0.7) q.g += dt;
        pico = Math.max(0, Math.sin(t * 7 + q.f)) * 0.5 * (Math.sin(f * 0.61) > 0 ? 1 : 0);
      }
      this.e.set(pico, q.g, q.vuela ? Math.sin(t * 22 + q.f) * 0.5 : 0);
      this.q.setFromEuler(this.e);
      this.v.set(q.x, q.y, q.z);
      this.m.compose(this.v, this.q, this.s);
      this.palomas.setMatrixAt(n++, this.m);
    }
    this.palomas.count = n;
    this.palomas.instanceMatrix.needsUpdate = true;
  }

  destruir() {
    for (const m of [this.hojas, this.palomas]) { m.removeFromParent(); m.geometry.dispose(); m.dispose(); }
    this.lluvia.removeFromParent();
    this.lluvia.geometry.dispose();
    this.matLluvia.dispose();
    void this.escena;
  }
}
