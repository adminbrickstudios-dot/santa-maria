import { pesos } from "./util";

export type Mov = { id: number; tipo: "gasto" | "ingreso"; monto: number; categoria: string; fecha: string; nota: string | null; medio: string | null };
const clave = (a: number, m: number) => { const d = new Date(a, m, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };

export function resumen(l: Mov[], mes: string) {
  const a = +mes.slice(0, 4), m = +mes.slice(5) - 1;
  const delMes = l.filter((x) => x.fecha.startsWith(mes));
  const gastos = delMes.filter((x) => x.tipo === "gasto"), ingresos = delMes.filter((x) => x.tipo === "ingreso").reduce((s, x) => s + +x.monto, 0);
  const totG = gastos.reduce((s, x) => s + +x.monto, 0);
  const pc = new Map<string, number>(); gastos.forEach((x) => pc.set(x.categoria, (pc.get(x.categoria) || 0) + +x.monto));
  const seis = [...Array(6)].map((_, i) => { const k = clave(a, m - 5 + i); return { k, g: l.filter((x) => x.tipo === "gasto" && x.fecha.startsWith(k)).reduce((s, x) => s + +x.monto, 0) }; });
  return { ingresos, gastos: totG, balance: ingresos - totG, porCat: [...pc].sort((x, y) => y[1] - x[1]), seis, mayor: [...gastos].sort((x, y) => +y.monto - +x.monto)[0] };
}
export type Rec = { e: string; t: string; d?: string };
/* Consejos calculados con tus propios números */
export function recomendar(l: Mov[], mes: string, tope: number, fijos: { monto: number; tipo: string; activo: boolean }[], dia: number, dias: number): Rec[] {
  const r = resumen(l, mes), a = +mes.slice(0, 4), m = +mes.slice(5) - 1, ant = resumen(l, clave(a, m - 1)), out: Rec[] = [];
  if (!r.gastos && !r.ingresos) return out;
  const proy = dia >= 5 ? (r.gastos / dia) * dias : 0;
  if (tope && proy > tope * 1.03) out.push({ e: "📈", t: `A este ritmo terminás en ${pesos(proy)}`, d: `Son ${pesos(proy - tope)} más que tu presupuesto. Para llegar, gastá ${pesos(Math.max(0, tope - r.gastos) / Math.max(1, dias - dia))} por día.` });
  else if (tope && dia >= 5) out.push({ e: "👏", t: "Vas bien con el presupuesto", d: `A este ritmo te sobran ${pesos(tope - proy)}.` });
  if (!tope && r.gastos) out.push({ e: "🎯", t: "Poné un presupuesto del mes", d: "Te aviso cuando te estés por pasar." });
  const pa = new Map(ant.porCat);
  for (const [c, v] of r.porCat.slice(0, 4)) {
    const b = pa.get(c) || 0;
    if (b > 0 && dia >= 8 && v > (b * dia) / dias * 1.4) { out.push({ e: "🔥", t: `${c} viene más alto que el mes pasado`, d: `Llevás ${pesos(v)}. En todo el mes pasado fueron ${pesos(b)}.` }); break; }
  }
  const salir = r.porCat.filter(([c]) => c === "Comida afuera" || c === "Salidas").reduce((s, [, v]) => s + v, 0);
  if (salir > r.gastos * .3 && r.gastos > 0) out.push({ e: "🍕", t: `${Math.round((salir / r.gastos) * 100)}% se te va en comer afuera y salir`, d: `Bajándolo a la mitad te quedan ${pesos(salir / 2)} más.` });
  const fj = fijos.filter((f) => f.activo && f.tipo === "gasto").reduce((s, f) => s + +f.monto, 0);
  if (r.ingresos && fj > r.ingresos * .6) out.push({ e: "🧾", t: "Tus gastos fijos son más del 60% de lo que entra", d: `Son ${pesos(fj)} por mes.` });
  if (r.ingresos > r.gastos && dia >= 20) out.push({ e: "🐷", t: `Podés guardar ${pesos((r.ingresos - r.gastos) * .5)} este mes`, d: "Mandalo a una meta y no lo toques." });
  return out.slice(0, 5);
}
