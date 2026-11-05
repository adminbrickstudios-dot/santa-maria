/* Qué rubro es cada lugar según su categoría, y cómo se ve su frente. */
import type { Rubro } from "./tipos";

const R = (id: string, nombre: string, color: string, texto: string, toldo: boolean, interior: Rubro["interior"], extra?: Partial<Rubro>): Rubro =>
  ({ id, nombre, color, texto, toldo, interior, ...extra });

export const RUBROS = {
  farmacia: R("farmacia", "Farmacia", "#0E9F6E", "#FFFFFF", false, "farmacia", { cruz: true }),
  super: R("super", "Supermercado", "#E4572E", "#FFFFFF", true, "super"),
  almacen: R("almacen", "Almacén", "#D98E04", "#2B1B00", true, "super"),
  verduleria: R("verduleria", "Verdulería", "#5B9A32", "#FFFFFF", true, "super"),
  carniceria: R("carniceria", "Carnicería", "#B3261E", "#FFFFFF", true, "super"),
  panaderia: R("panaderia", "Panadería", "#C98B3A", "#2E1A05", true, "cafe"),
  cafe: R("cafe", "Café", "#6F4E37", "#FBEFE2", true, "cafe"),
  restaurante: R("restaurante", "Restaurante", "#A93226", "#FFF3E6", true, "cafe"),
  rapida: R("rapida", "Comida rápida", "#E67E22", "#2B1500", true, "cafe"),
  bar: R("bar", "Bar", "#5B2C6F", "#FBEAFF", true, "cafe"),
  helados: R("helados", "Heladería", "#F06292", "#FFFFFF", true, "cafe"),
  banco: R("banco", "Banco", "#16407C", "#FFFFFF", false, "generico"),
  ropa: R("ropa", "Ropa", "#23232B", "#FFFFFF", true, "ropa"),
  calzado: R("calzado", "Calzado", "#3D3D4E", "#FFFFFF", true, "ropa"),
  libreria: R("libreria", "Librería", "#2C6E91", "#FFFFFF", true, "generico"),
  belleza: R("belleza", "Peluquería", "#B14AA5", "#FFFFFF", false, "generico"),
  salud: R("salud", "Salud", "#1E9AA6", "#FFFFFF", false, "generico"),
  hotel: R("hotel", "Hotel", "#4B45B8", "#FFFFFF", false, "generico"),
  educacion: R("educacion", "Educación", "#3F6DB3", "#FFFFFF", false, "generico"),
  cultura: R("cultura", "Cultura", "#8E3B6E", "#FFFFFF", false, "generico"),
  ferreteria: R("ferreteria", "Ferretería", "#B8660B", "#FFFFFF", true, "generico"),
  tecnologia: R("tecnologia", "Tecnología", "#2F3E9E", "#FFFFFF", false, "generico"),
  otro: R("otro", "Comercio", "#4A5568", "#FFFFFF", true, "generico"),
} satisfies Record<string, Rubro>;

/** Palabras de la categoría → rubro. Se prueban en orden; la categoría viene de OSM ("shop:bakery") o de Overture ("coffee_shop"). */
const REGLAS: [RegExp, keyof typeof RUBROS][] = [
  [/pharmacy|chemist|drugstore|farmacia/, "farmacia"],
  [/supermarket|hypermarket|department_store|mall/, "super"],
  [/greengrocer|fruit|vegetable/, "verduleria"], [/butcher|meat/, "carniceria"],
  [/bakery|pastry|confectionery|dessert|chocolate/, "panaderia"],
  [/ice_cream|gelato|frozen/, "helados"],
  [/coffee|cafe|tea_|:tea/, "cafe"],
  [/fast_food|pizza|casual_eatery|sandwich|burger|empanada|food_court|food_truck/, "rapida"],
  [/restaurant|steakhouse|parrilla|sushi|eatery|bistro|grill|diner/, "restaurante"],
  [/bar$|:bar|pub|beer|brewery|nightclub|night_club|wine_bar|cocktail/, "bar"],
  [/grocery|convenience|kiosk|deli|food_and_beverage|alcohol|wine|beverage|liquor|health_food|dairy|cheese/, "almacen"],
  [/shoe/, "calzado"],
  [/clothes|clothing|fashion|boutique|jewel|bag|accessor|lingerie|tailor|fabric/, "ropa"],
  [/book|stationery|copyshop|newsagent|music_and_video/, "libreria"],
  [/hairdresser|beauty|cosmetic|perfum|barber|nail|personal_or_beauty|massage|spa|wellness/, "belleza"],
  [/optician|veterinary|pet/, "salud"],
  [/hardware|doityourself|paint|garden|home|furniture|interior|appliance|lighting|tool/, "ferreteria"],
  [/mobile_phone|electronics|computer|telecommunication/, "tecnologia"],
  [/bank|credit_union|bureau_de_change|money_transfer|exchange/, "banco"],
  [/hotel|hostel|guest_house|lodging|motel|apartment_hotel/, "hotel"],
  [/cinema|theat|museum|gallery|arts_centre|cultural/, "cultura"],
  [/shop:|store|shopping|retail|travel_agency|florist|gift|toy|sport|bicycle|craft|variety/, "otro"],
];

/** Lo que no tiene frente a la calle: oficinas en un piso alto, tumbas, parques, escuelas con su edificio propio. */
const FUERA = /tomb|grave|park|garden_|playground|pitch|stadium|cemetery|attorney|law|dental|doctor|clinic|diagnostic|health_care|hospital|physician|psych|office|professional|real_estate|financial|insurance|corporate|government|consult|accounting|social_or_community|religious|church|place_of_worship|school|college|university|education|learning|embassy|consulate|parking|bus|railway|subway|taxi|memorial|monument|fountain|statue|attraction|viewpoint|toilets|community_centre|sports_centre|gym|fitness/;

export function clasificar(categoria: string): Rubro | null {
  if (!categoria) return null;
  const c = categoria.toLowerCase();
  if (FUERA.test(c)) return null;
  for (const [re, k] of REGLAS) if (re.test(c)) return RUBROS[k];
  return null;
}

export function abreviarCalle(n: string): string {
  return n.replace(/^Avenida\s+/i, "Av. ").replace(/^Boulevard\s+/i, "Bv. ").replace(/^Pasaje\s+/i, "Pje. ").replace(/^Diagonal\s+/i, "Diag. ").trim();
}
