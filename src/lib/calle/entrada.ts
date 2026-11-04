/* Dedos, mouse y teclado. Traduce gestos a intenciones; no sabe nada del mundo. */
export interface ManejadoresEntrada {
  mirar(dx: number, dy: number): void;
  tocar(x: number, y: number): void;
  dobleToque(x: number, y: number): void;
  joystick(activo: boolean, x: number, y: number, dx: number, dy: number): void;
  alMover?(): void;
}

const RADIO_JOY = 56;

export class Entrada {
  /** -1..1 en cada eje, del joystick o del teclado. */
  x = 0;
  y = 0;
  correr = false;
  private teclas = new Set<string>();
  private joy: { id: number; ox: number; oy: number } | null = null;
  private mira = new Map<number, { x: number; y: number; t: number; ix: number; iy: number; movio: boolean }>();
  private ultimoToque = { t: 0, x: 0, y: 0 };

  constructor(private el: HTMLElement, private h: ManejadoresEntrada) {
    el.addEventListener("pointerdown", this.baja);
    el.addEventListener("pointermove", this.mueve);
    el.addEventListener("pointerup", this.sube);
    el.addEventListener("pointercancel", this.sube);
    el.addEventListener("contextmenu", this.nada);
    window.addEventListener("keydown", this.tecla);
    window.addEventListener("keyup", this.tecla);
    window.addEventListener("blur", this.limpiar);
  }

  private nada = (e: Event) => e.preventDefault();
  private limpiar = () => { this.teclas.clear(); this.calc(); };

  private baja = (e: PointerEvent) => {
    this.el.setPointerCapture(e.pointerId);
    const r = this.el.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (e.pointerType !== "mouse" && !this.joy && x < r.width * 0.5 && y > r.height * 0.42) {
      this.joy = { id: e.pointerId, ox: x, oy: y };
      this.h.joystick(true, x, y, 0, 0);
      return;
    }
    this.mira.set(e.pointerId, { x, y, t: performance.now(), ix: x, iy: y, movio: false });
  };

  private mueve = (e: PointerEvent) => {
    const r = this.el.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (this.joy?.id === e.pointerId) {
      let dx = x - this.joy.ox, dy = y - this.joy.oy;
      const d = Math.hypot(dx, dy);
      if (d > RADIO_JOY) { dx *= RADIO_JOY / d; dy *= RADIO_JOY / d; }
      this.h.joystick(true, this.joy.ox, this.joy.oy, dx, dy);
      const nx = dx / RADIO_JOY, ny = dy / RADIO_JOY, m = Math.hypot(nx, ny);
      const f = m < 0.14 ? 0 : (m - 0.14) / 0.86 / (m || 1);
      this.joyX = nx * f;
      this.joyY = ny * f;
      this.calc();
      return;
    }
    const m = this.mira.get(e.pointerId);
    if (!m) return;
    const dx = x - m.x, dy = y - m.y;
    m.x = x; m.y = y;
    if (Math.hypot(x - m.ix, y - m.iy) > 9) m.movio = true;
    if (m.movio) this.h.mirar(dx, dy);
  };

  private joyX = 0;
  private joyY = 0;

  private sube = (e: PointerEvent) => {
    if (this.joy?.id === e.pointerId) {
      this.joy = null;
      this.joyX = this.joyY = 0;
      this.calc();
      this.h.joystick(false, 0, 0, 0, 0);
      return;
    }
    const m = this.mira.get(e.pointerId);
    if (!m) return;
    this.mira.delete(e.pointerId);
    if (m.movio || e.type === "pointercancel" || performance.now() - m.t > 320) return;
    const u = this.ultimoToque, ahora = performance.now();
    if (ahora - u.t < 340 && Math.hypot(m.ix - u.x, m.iy - u.y) < 44) {
      this.ultimoToque = { t: 0, x: 0, y: 0 };
      this.h.dobleToque(m.ix, m.iy);
    } else {
      this.ultimoToque = { t: ahora, x: m.ix, y: m.iy };
      this.h.tocar(m.ix, m.iy);
    }
  };

  private tecla = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
    const c = e.code;
    if (!/^(Key[WASD]|Arrow(Up|Down|Left|Right)|Shift(Left|Right))$/.test(c)) return;
    if (c.startsWith("Arrow")) e.preventDefault();
    if (e.type === "keydown") this.teclas.add(c); else this.teclas.delete(c);
    this.calc();
  };

  private calc() {
    const t = this.teclas, k = (a: string, b: string) => (t.has(a) || t.has(b) ? 1 : 0);
    let x = k("KeyD", "ArrowRight") - k("KeyA", "ArrowLeft"), y = k("KeyS", "ArrowDown") - k("KeyW", "ArrowUp");
    if (x && y) { x *= 0.707; y *= 0.707; }
    this.x = x || this.joyX;
    this.y = y || this.joyY;
    this.correr = t.has("ShiftLeft") || t.has("ShiftRight");
    if (this.x || this.y) this.h.alMover?.();
  }

  destruir() {
    const el = this.el;
    el.removeEventListener("pointerdown", this.baja);
    el.removeEventListener("pointermove", this.mueve);
    el.removeEventListener("pointerup", this.sube);
    el.removeEventListener("pointercancel", this.sube);
    el.removeEventListener("contextmenu", this.nada);
    window.removeEventListener("keydown", this.tecla);
    window.removeEventListener("keyup", this.tecla);
    window.removeEventListener("blur", this.limpiar);
  }
}
