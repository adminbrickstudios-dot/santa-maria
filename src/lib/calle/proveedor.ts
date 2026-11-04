/* Acceso a datos abiertos. Todo lo que sale a la red pasa por acá, para poder probar con datos falsos.
   Solo OpenStreetMap: tiles de OpenFreeMap y consultas a Overpass. */
import type { ConsultaLugar, DatosExtraLugar, ProveedorLugar, ProveedorTiles } from "./tipos";

const TILEJSON = "https://tiles.openfreemap.org/planet";
const OVERPASS = "https://overpass-api.de/api/interpreter";

/** Baja tiles z14 de OpenFreeMap. La URL con la versión del planeta sale del TileJSON. */
export function crearProveedorTiles(urlTileJson: string = TILEJSON): ProveedorTiles {
  let plantilla: Promise<string> | null = null;
  const base = () => {
    plantilla ??= fetch(urlTileJson).then(async (r) => {
      if (!r.ok) throw new Error(`TileJSON ${r.status}`);
      const j = (await r.json()) as { tiles?: string[] };
      if (!j.tiles?.[0]) throw new Error("TileJSON sin tiles");
      return j.tiles[0];
    }).catch((e) => { plantilla = null; throw e; });
    return plantilla;
  };
  return async (z, x, y, senal) => {
    const url = (await base()).replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
    const r = await fetch(url, { signal: senal });
    if (r.status === 404 || r.status === 204) return null;
    if (!r.ok) throw new Error(`tile ${z}/${x}/${y}: ${r.status}`);
    return r.arrayBuffer();
  };
}

const regexExacto = (s: string) => s.replace(/[.*+?^${}()|[\]\\"]/g, "\\$&");
const webSegura = (u: string) => {
  const c = /^https?:\/\//i.test(u) ? u : `https://${u}`;
  try { const p = new URL(c); return p.protocol === "https:" || p.protocol === "http:" ? p.href : undefined; } catch { return undefined; }
};

/** Pone en criollo lo más común de opening_hours: "Mo-Fr 09:00-20:00" → "lun a vie 09:00 a 20:00". */
export function horarioLegible(h: string): string {
  const D: Record<string, string> = { Mo: "lun", Tu: "mar", We: "mié", Th: "jue", Fr: "vie", Sa: "sáb", Su: "dom", PH: "feriados" };
  return h.replace(/24\/7/g, "Abierto siempre").replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH)\b/g, (m) => D[m])
    .replace(/([a-zá-ú]+)-([a-zá-ú]+)/g, "$1 a $2").replace(/(\d\d:\d\d)-(\d\d:\d\d)/g, "$1 a $2")
    .replace(/\boff\b/g, "cerrado").replace(/;\s*/g, " · ");
}

/** Busca el lugar en Overpass. Si tarda o falla devuelve null y la tarjeta sigue andando. */
export function crearProveedorLugar(url: string = OVERPASS, esperaMs = 5000): ProveedorLugar {
  const cache = new Map<string, DatosExtraLugar | null>();
  return async ({ nombre, lat, lon }: ConsultaLugar, senal) => {
    const clave = `${nombre}|${lat.toFixed(4)}|${lon.toFixed(4)}`;
    if (cache.has(clave)) return cache.get(clave) ?? null;
    const q = `[out:json][timeout:4];nwr(around:60,${lat.toFixed(6)},${lon.toFixed(6)})["name"~"^${regexExacto(nombre)}$",i];out tags 3;`;
    const ctrl = new AbortController(), reloj = setTimeout(() => ctrl.abort(), esperaMs);
    senal?.addEventListener("abort", () => ctrl.abort(), { once: true });
    try {
      const r = await fetch(url, { method: "POST", body: new URLSearchParams({ data: q }), signal: ctrl.signal });
      if (!r.ok) return null;
      const j = (await r.json()) as { elements?: { tags?: Record<string, string> }[] };
      const t = j.elements?.find((e) => e.tags)?.tags;
      if (!t) { cache.set(clave, null); return null; }
      const web = t.website || t["contact:website"];
      const d: DatosExtraLugar = {
        horario: t.opening_hours ? horarioLegible(t.opening_hours) : undefined,
        telefono: t.phone || t["contact:phone"] || undefined,
        web: web ? webSegura(web) : undefined,
      };
      cache.set(clave, d);
      return d;
    } catch {
      return null;
    } finally {
      clearTimeout(reloj);
    }
  };
}
