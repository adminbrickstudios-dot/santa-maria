/* eslint-disable @typescript-eslint/no-explicit-any */
/* Modo demo solo para probar pantallas sin base de datos (NEXT_PUBLIC_DEMO=1). */
export function crearDemo() {
  let db: any = null;
  const carga = async () => { if (!db) { db = await (await fetch("/demo.json")).json(); } return db; };
  const yo = () => (typeof localStorage !== "undefined" ? localStorage.getItem("demo-yo") : null);
  class Q {
    f: ((r: any) => boolean)[] = []; ord: [string, boolean][] = []; lim = 0; uno = false; op = "select"; dato: any = null; head = false; contar = false;
    constructor(public t: string) {}
    select(_c?: string, o?: any) { if (this.op === "select") { this.head = !!o?.head; this.contar = !!o?.count; } return this; }
    eq(k: string, v: any) { if (k.includes(".")) { const [a, b] = k.split("."); this.f.push((r) => r[a]?.[b] === v); } else this.f.push((r) => r[k] === v); return this; }
    gte(k: string, v: any) { this.f.push((r) => r[k] >= v); return this; }
    ilike(k: string, v: string) { const t = v.replace(/%/g, "").toLowerCase(); this.f.push((r) => (r[k] || "").toLowerCase().includes(t)); return this; }
    not(k: string) { this.f.push((r) => r[k] != null); return this; }
    in(k: string, v: any[]) { this.f.push((r) => v.includes(r[k])); return this; }
    contains(k: string, v: any[]) { this.f.push((r) => v.every((x) => (r[k] || []).includes(x))); return this; }
    order(k: string, o?: any) { this.ord.push([k, o?.ascending !== false]); return this; }
    limit(n: number) { this.lim = n; return this; }
    single() { this.uno = true; return this; }
    insert(o: any) { this.op = "insert"; this.dato = o; return this; }
    update(o: any) { this.op = "update"; this.dato = o; return this; }
    upsert(o: any) { this.op = "upsert"; this.dato = o; return this; }
    delete() { this.op = "delete"; return this; }
    async run() {
      const d = await carga(), l: any[] = (d[this.t] = d[this.t] || []);
      if (this.op === "insert" || this.op === "upsert") {
        const rows = (Array.isArray(this.dato) ? this.dato : [this.dato]).map((x: any) => ({ id: Date.now() + Math.random(), creado_en: new Date().toISOString(), ...x }));
        l.push(...rows);
        return { data: this.uno ? rows[0] : rows, error: null };
      }
      let r = l.filter((x) => this.f.every((g) => g(x)));
      if (this.op === "update") { r.forEach((x) => Object.assign(x, this.dato)); return { data: r, error: null }; }
      if (this.op === "delete") { d[this.t] = l.filter((x) => !r.includes(x)); return { data: null, error: null }; }
      r = r.map((x) => {
        if (this.t === "clases") return { ...x, materias: d.materias?.find((m: any) => m.id === x.materia_id) };
        if (this.t === "guardados" || this.t === "progreso_items") return { ...x, guia_items: d.guia_items.find((m: any) => m.id === x.item_id) };
        return x;
      });
      for (const [k, a] of this.ord.reverse()) r = [...r].sort((p, q) => (p[k] > q[k] ? 1 : p[k] < q[k] ? -1 : 0) * (a ? 1 : -1));
      if (this.lim) r = r.slice(0, this.lim);
      return { data: this.head ? null : this.uno ? r[0] ?? null : r, count: r.length, error: null };
    }
    then(a: any, b: any) { return this.run().then(a, b); }
  }
  return {
    from: (t: string) => new Q(t),
    async rpc(n: string, p: any) {
      const d = await carga();
      if (n === "personas_del_grupo") return { data: d.perfiles.map((x: any) => ({ ...x, lat: x.casa_lat, lon: x.casa_lon, barrio: x.casa_barrio })) };
      if (n === "mis_conversaciones") return { data: d.conversaciones_v || [] };
      if (n === "abrir_directa") return { data: "demo-" + p.otro };
      if (n === "usuario_disponible") return { data: true };
      if (n === "buscar_guia") return { data: d.guia_items.filter((i: any) => (i.titulo + " " + (i.bajada || "")).toLowerCase().includes(p.q.toLowerCase())).slice(0, 30) };
      if (n === "clave_cambiada") { d.perfiles.find((x: any) => x.id === yo()).debe_cambiar_clave = false; }
      return { data: null };
    },
    auth: {
      async getSession() { const u = yo(); return { data: { session: u ? { user: { id: u }, access_token: "demo" } : null } }; },
      async signInWithPassword({ email, password }: any) {
        const d = await carga(), p = d.perfiles.find((x: any) => email.startsWith(x.usuario + "@"));
        if (!p || password !== "12345678") return { error: { message: "no" } };
        localStorage.setItem("demo-yo", p.id); return { error: null };
      },
      async signUp() { return { error: null }; },
      async signOut() { localStorage.removeItem("demo-yo"); },
      async updateUser() { return { error: null }; },
    },
    channel() { const c: any = { on: () => c, subscribe: () => c }; return c; },
    removeChannel() {},
    storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: "" } }) }) },
  };
}
