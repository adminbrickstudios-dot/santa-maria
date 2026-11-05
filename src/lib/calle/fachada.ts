/* Decide cómo es cada frente: estilo porteño, materiales, proporciones de ventanas, balcones.
   Lo que no viene en los datos se elige con un hash del edificio, así siempre sale igual.
   Corre en el worker. No toca Three ni el DOM. */
import { hash, hexARgb, deTile } from "./geo";
import type { Edif } from "./decodificar";

/* Materiales del muro: los mismos números que usa el shader de edificios */
export const M_REVOQUE = 0, M_PIEDRA = 1, M_LADRILLO = 2, M_HORMIGON = 3, M_VIDRIO = 4, M_CHAPA = 5, M_MEDIANERA = 6, M_PIZARRA = 7, M_LISO = 8;
export const M_TERRAZA = 20, M_TEJA = 21, M_CHAPA_TECHO = 22, M_LOSA = 23;

export type Familia = "casa" | "ph" | "frances" | "racionalista" | "torre" | "moderna" | "oficina" | "iglesia" | "institucional" | "galpon";

export interface Estilo {
  familia: Familia;
  mat: number;
  color: readonly [number, number, number];
  acento: readonly [number, number, number];
  metal: readonly [number, number, number];
  /** Alto de planta baja y de cada piso. */
  pb: number;
  piso: number;
  /** Ancho de bahía, medio ancho de ventana, y alturas de la ventana desde el piso. */
  bay: number;
  vA: number;
  v0: number;
  v1: number;
  /** 0 nada, 1 marco, 2 dintel con jambas, 3 arco rebajado. */
  moldura: number;
  /** 0 persiana plástica, 1 celosía de madera, 2 cortina, 3 sin nada. */
  persiana: number;
  /** 0 nada, 1 balcón francés, 2 saliente, 3 corrido. */
  balcon: number;
  /** Cada cuántos pisos arranca una fila con balcón. */
  balconCada: number;
  /** 0 hierro forjado, 1 caño, 2 maciza, 3 vidrio. */
  baranda: number;
  /** 0 pretil simple, 1 cornisa, 2 cornisa con ménsulas. */
  cornisa: number;
  mansarda: boolean;
  aires: boolean;
}

const pal = (l: string[]) => l.map(hexARgb);
const PIEDRA = pal(["#D8CCB5", "#CDBFA6", "#DFD5C2", "#C7B99F", "#D3C7B4", "#E2D9C6"]);
const SIMIL = pal(["#CFC5B0", "#BDB6A7", "#D9D3C4", "#C4B69E", "#B8AE9C", "#D2C8B8", "#A9A69C"]);
const CASA = pal(["#D9C8A9", "#C9A98A", "#C48F72", "#E3DCCB", "#B4B7A4", "#D7BE8E", "#BE9B86", "#E8E0D0", "#A9B7B5", "#CDB99E"]);
const TORRE = pal(["#C9C5BA", "#B5B2A9", "#D6D2C7", "#A7A49B", "#BFB7A8", "#DAD6CC"]);
const LADRILLO = pal(["#9C5B44", "#A5664C", "#8E5340", "#B0735A"]);
const MODERNA = pal(["#E6E4DD", "#D4D3CE", "#EFEDE7", "#C3C4C2"]);
const VIDRIO = pal(["#5E7686", "#4E6A78", "#6B8592", "#3F5866"]);
const FIERRO = pal(["#1E2022", "#23262A", "#2B2A28"]);
const BLANCO_PINT = hexARgb("#E8E4DA");

/** Zona de la ciudad a grandes rasgos: 0 señorial (Recoleta, Retiro, Palermo Chico), 1 centro, 2 barrios. */
export function zonaDe(tileX: number, tileY: number) {
  const { lon, lat } = deTile(tileX, tileY);
  const dx = (lon + 58.3895) * 91.7, dz = (lat + 34.5875) * 110.9;
  /* Elipse a lo largo del río: Retiro, Recoleta y Palermo Chico */
  const u = dx * 0.79 + dz * 0.61, v = -dx * 0.61 + dz * 0.79;
  if ((u / 2.6) ** 2 + (v / 1.15) ** 2 < 1) return 0;
  if (lon > -58.398 && lat < -34.594) return 1;
  return 2;
}

function familiaDe(e: Edif, zona: number, sem: number): Familia {
  const t = e.tipo, h = e.h, n = e.nombre.toLowerCase();
  if (t === "church" || t === "religious" || t === "cathedral" || /iglesia|bas[ií]lica|parroquia|capilla|catedral|templo|santuario/.test(n)) return "iglesia";
  if (["school", "education", "university", "college", "hospital", "civic", "government", "public", "medical", "train_station", "transportation"].includes(t)) return "institucional";
  if (t === "office" || e.material === "glass") return "oficina";
  if (["industrial", "warehouse", "parking", "garage", "garages", "greenhouse", "shed"].includes(t)) return "galpon";
  if (e.ano >= 1990) return h > 40 ? (sem < 0.5 ? "oficina" : "moderna") : "moderna";
  if (e.ano && e.ano < 1935) return h > 9 ? "frances" : "casa";
  if (e.ano && e.ano < 1958) return "racionalista";
  if (e.ano) return "torre";
  if (h <= 7.5) return sem < 0.55 ? "casa" : "ph";
  if (h <= 11) return zona === 0 && sem < 0.5 ? "frances" : sem < 0.5 ? "ph" : "racionalista";
  if (h <= 36) {
    if (zona === 0) return sem < 0.4 ? "frances" : sem < 0.72 ? "racionalista" : sem < 0.93 ? "torre" : "moderna";
    if (zona === 1) return sem < 0.25 ? "frances" : sem < 0.6 ? "racionalista" : sem < 0.86 ? "torre" : "oficina";
    return sem < 0.5 ? "racionalista" : sem < 0.86 ? "torre" : "moderna";
  }
  if (h > 80) return zona === 1 && sem < 0.7 ? "oficina" : sem < 0.5 ? "moderna" : "torre";
  return sem < 0.55 ? "torre" : sem < 0.85 ? "moderna" : "oficina";
}

/** Estilo de un frente. `lote` distingue los lotes de un frente largo partido. */
export function estiloDe(e: Edif, zona: number, lote: number): Estilo {
  const s0 = hash(e.id, lote * 17 + 3), s1 = hash(e.id, lote * 17 + 5), s2 = hash(e.id, lote * 17 + 7), s3 = hash(e.id, lote * 17 + 11);
  const f = familiaDe(e, zona, s0);
  const de = (l: readonly (readonly [number, number, number])[]) => l[Math.floor(s1 * l.length) % l.length];
  const metal = FIERRO[Math.floor(s2 * FIERRO.length) % FIERRO.length];
  const conColor = e.color ? hexARgb(e.color) : null;
  const pisos = Math.max(1, e.pisos), H = e.h - e.minH;
  const b: Estilo = {
    familia: f, mat: M_REVOQUE, color: de(CASA), acento: BLANCO_PINT, metal, pb: 3.2, piso: 3, bay: 3.3, vA: 0.75, v0: 0.95, v1: 2.35,
    moldura: 1, persiana: 0, balcon: 0, balconCada: 1, baranda: 0, cornisa: 0, mansarda: false, aires: false,
  };
  switch (f) {
    case "casa":
      Object.assign(b, { pb: Math.min(H, 4.2), bay: 2.9, vA: 0.55, v0: 0.9, v1: 2.6, moldura: 2, persiana: 1, cornisa: 1 });
      break;
    case "ph":
      Object.assign(b, { pb: 3.3, bay: 3.1, vA: 0.62, v0: 0.85, v1: 2.4, moldura: 1, persiana: s2 < 0.5 ? 1 : 0, balcon: s3 < 0.4 ? 1 : 0, baranda: 0, cornisa: 1, color: de(CASA) });
      break;
    case "frances":
      Object.assign(b, {
        mat: M_PIEDRA, color: de(PIEDRA), acento: PIEDRA[Math.floor(s2 * 6) % 6], pb: 4.2, bay: 3.1, vA: 0.62, v0: 0.08, v1: 2.75, moldura: s3 < 0.45 ? 3 : 2, persiana: 1,
        balcon: s2 < 0.75 ? 2 : 1, balconCada: 1, baranda: 0, cornisa: 2, mansarda: H >= 13 && s3 < 0.82, aires: false,
      });
      break;
    case "racionalista":
      Object.assign(b, {
        mat: M_REVOQUE, color: de(SIMIL), acento: de(SIMIL), pb: 3.5, bay: 3.6 + s3 * 0.8, vA: 1.05 + s2 * 0.3, v0: 0.9, v1: 2.3, moldura: 0, persiana: 0, balcon: s2 < 0.62 ? 2 : 0, balconCada: 1, baranda: 1, cornisa: 0, aires: true,
      });
      break;
    case "torre":
      Object.assign(b, {
        mat: s2 < 0.28 ? M_LADRILLO : s2 < 0.62 ? M_HORMIGON : M_REVOQUE, color: s2 < 0.28 ? de(LADRILLO) : de(TORRE), acento: de(TORRE), pb: 3.8, bay: 3.9 + s3 * 0.9, vA: 1.35 + s2 * 0.25, v0: 0.3, v1: 2.35,
        moldura: 0, persiana: 0, balcon: s3 < 0.78 ? 3 : 0, balconCada: 1, baranda: s3 < 0.42 ? 2 : 1, cornisa: 0, aires: true,
      });
      break;
    case "moderna":
      Object.assign(b, { mat: s2 < 0.6 ? M_LISO : M_HORMIGON, color: de(MODERNA), acento: de(MODERNA), pb: 4.2, bay: 3.8 + s3, vA: 1.5 + s3 * 0.2, v0: 0.05, v1: 2.6, moldura: 0, persiana: 3, balcon: s3 < 0.72 ? 3 : 2, balconCada: 1, baranda: 3, cornisa: 0 });
      break;
    case "oficina":
      Object.assign(b, { mat: M_VIDRIO, color: de(VIDRIO), acento: pal(["#9EA5A8"])[0], pb: 5, piso: 3.6, bay: 1.6, vA: 0.74, v0: 0.05, v1: 3.5, moldura: 0, persiana: 3, cornisa: 0 });
      break;
    case "iglesia":
      Object.assign(b, { mat: M_REVOQUE, color: de(PIEDRA), acento: BLANCO_PINT, pb: 0.8, piso: Math.max(5, H - 1.5), bay: 4.2, vA: 0.8, v0: 1.6, v1: Math.min(H - 2, 5.4), moldura: 3, persiana: 3, cornisa: 1 });
      break;
    case "institucional":
      Object.assign(b, { mat: s2 < 0.4 ? M_PIEDRA : M_REVOQUE, color: de(PIEDRA), acento: BLANCO_PINT, pb: 4.2, piso: 3.9, bay: 3.7, vA: 0.95, v0: 0.8, v1: 3.05, moldura: 2, persiana: 3, cornisa: 1 });
      break;
    case "galpon":
      Object.assign(b, { mat: s2 < 0.5 ? M_LADRILLO : M_CHAPA, color: s2 < 0.5 ? de(LADRILLO) : de(TORRE), pb: Math.min(H, 4.5), bay: 5, vA: 1.5, v0: 1.6, v1: 2.8, moldura: 0, persiana: 3, cornisa: 0 });
      break;
  }
  if (conColor) b.color = conColor;
  if (e.material === "brick") { b.mat = M_LADRILLO; if (!conColor) b.color = de(LADRILLO); }
  if (e.material === "concrete") b.mat = M_HORMIGON;
  /* Los pisos reales mandan: el alto de cada piso se reparte con lo que dejó la planta baja */
  const techo = b.mansarda ? 3.6 : 0.5;
  b.pb = Math.min(b.pb, Math.max(2.6, H - techo));
  const resto = H - b.pb - techo;
  const n = Math.max(0, Math.min(pisos - 1, Math.round(resto / b.piso)) || Math.round(resto / b.piso));
  if (n > 0) b.piso = Math.max(2.5, Math.min(5.5, resto / n));
  const esc = Math.min(1, b.piso / 3);
  b.v1 = Math.min(b.v1, b.piso - 0.34);
  b.v0 = Math.min(b.v0, b.v1 - 0.8) * esc;
  return b;
}
