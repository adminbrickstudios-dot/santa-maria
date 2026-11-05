/* Sombras reales del sol: un mapa de profundidad por cascada, que se guarda y solo se rehace cuando
   hace falta (caminaste un rato, entró una celda o cambió la hora). Así casi no cuesta nada por cuadro. */
import * as THREE from "three";
import { matProfundidad, matProfundidadHojas, type Comunes } from "./materiales";

export const CAPA_SOLIDOS = 1, CAPA_HOJAS = 2;

interface Cascada { rt: THREE.WebGLRenderTarget; cam: THREE.OrthographicCamera; radio: number; cx: number; cz: number; sucia: boolean; mat: { value: THREE.Matrix4 }; tex: { value: THREE.Texture | null } }

export class Sombras {
  private cas: Cascada[] = [];
  private mS = matProfundidad();
  private mH: THREE.ShaderMaterial;
  private sol = new THREE.Vector3(0, 1, 0);
  private uso = 0;
  private turno = 0;

  /* Los samplers de sombra necesitan siempre una textura de profundidad válida, aunque no se use */
  private vacio: THREE.WebGLRenderTarget;

  constructor(private r: THREE.WebGLRenderer, private c: Comunes, atlas: THREE.Texture) {
    this.mH = matProfundidadHojas(atlas);
    this.vacio = this.objetivo(1);
    c.uTS0.value = c.uTS1.value = this.vacio.depthTexture;
  }

  private objetivo(s: number) {
    const prof = new THREE.DepthTexture(s, s, THREE.UnsignedIntType);
    prof.compareFunction = THREE.LessEqualCompare;
    prof.magFilter = prof.minFilter = THREE.LinearFilter;
    const rt = new THREE.WebGLRenderTarget(s, s, { depthTexture: prof, depthBuffer: true, generateMipmaps: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.r.initRenderTarget(rt);
    return rt;
  }

  /** `conf`: lista de [radio, tamaño] de cerca a lejos. Vacía apaga las sombras. */
  configurar(conf: [number, number][]) {
    this.liberar();
    this.c.uConSombra.value = 0;
    if (!conf.length) return;
    const slots = conf.length === 2 ? [[this.c.uSM0, this.c.uTS0], [this.c.uSM1, this.c.uTS1]] : [[this.c.uSM1, this.c.uTS1]];
    conf.forEach(([radio, s], i) => {
      const rt = this.objetivo(s);
      const cam = new THREE.OrthographicCamera(-radio, radio, radio, -radio, 1, 1400);
      const [mat, tex] = slots[i] as [{ value: THREE.Matrix4 }, { value: THREE.Texture | null }];
      tex.value = rt.depthTexture;
      this.cas.push({ rt, cam, radio, cx: Infinity, cz: Infinity, sucia: true, mat, tex });
    });
  }

  ponerSol(s: THREE.Vector3, activo: boolean) {
    this.sol.copy(s);
    this.uso = activo && this.cas.length ? this.cas.length : 0;
    this.c.uConSombra.value = this.uso;
    for (const c of this.cas) c.sucia = true;
  }

  marcarSucio() { for (const c of this.cas) c.sucia = true; }

  /** Rehace como mucho una cascada por cuadro. Devuelve true si dibujó. */
  actualizar(escena: THREE.Scene, x: number, z: number) {
    if (!this.uso) return false;
    const n = this.cas.length;
    for (let i = 0; i < n; i++) {
      const k = (this.turno + i) % n, c = this.cas[k];
      if (!c.sucia && Math.hypot(c.cx - x, c.cz - z) < c.radio * 0.22) continue;
      this.turno = k + 1;
      this.dibujar(c, escena, x, z);
      return true;
    }
    return false;
  }

  private dibujar(c: Cascada, escena: THREE.Scene, x: number, z: number) {
    /* Centro alineado a un texel del mapa, para que el borde de las sombras no tiemble */
    const cam = c.cam, t = (c.radio * 2) / c.rt.width, d = 620;
    const ej = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion), ey = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    cam.position.set(x + this.sol.x * d, this.sol.y * d, z + this.sol.z * d);
    cam.up.set(0, 0, -1);
    cam.lookAt(x, 0, z);
    cam.updateMatrixWorld();
    ej.set(1, 0, 0).applyQuaternion(cam.quaternion); ey.set(0, 1, 0).applyQuaternion(cam.quaternion);
    const dx = new THREE.Vector3(x, 0, z).dot(ej), dy = new THREE.Vector3(x, 0, z).dot(ey);
    const ax = dx - Math.round(dx / t) * t, ay = dy - Math.round(dy / t) * t;
    cam.position.addScaledVector(ej, -ax).addScaledVector(ey, -ay);
    cam.updateMatrixWorld();
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    c.mat.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    c.cx = x; c.cz = z; c.sucia = false;

    const r = this.r, ant = r.getRenderTarget(), auto = r.autoClear, ov = escena.overrideMaterial, fondo = escena.background;
    r.setRenderTarget(c.rt);
    r.autoClear = false;
    r.clear(true, true, false);
    escena.background = null;
    cam.layers.set(CAPA_SOLIDOS);
    escena.overrideMaterial = this.mS;
    r.render(escena, cam);
    cam.layers.set(CAPA_HOJAS);
    escena.overrideMaterial = this.mH;
    r.render(escena, cam);
    escena.overrideMaterial = ov;
    escena.background = fondo;
    r.autoClear = auto;
    r.setRenderTarget(ant);
  }

  private liberar() {
    for (const c of this.cas) { c.rt.depthTexture?.dispose(); c.rt.dispose(); c.tex.value = this.vacio.depthTexture; }
    this.cas = [];
  }

  destruir() { this.liberar(); this.vacio.depthTexture?.dispose(); this.vacio.dispose(); this.mS.dispose(); this.mH.dispose(); }
}
