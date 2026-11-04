/* Qué rubro es cada POI de OpenMapTiles, y cómo se ve su frente. */
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

const MAPA: Record<string, keyof typeof RUBROS> = {
  pharmacy: "farmacia", chemist: "farmacia",
  supermarket: "super", grocery: "almacen", convenience: "almacen", deli: "almacen", alcohol_shop: "almacen", alcohol: "almacen", beverages: "almacen", kiosk: "almacen",
  greengrocer: "verduleria", butcher: "carniceria", bakery: "panaderia", pastry: "panaderia", confectionery: "panaderia",
  cafe: "cafe", coffee: "cafe", tea: "cafe",
  restaurant: "restaurante", food_court: "restaurante", fast_food: "rapida", pizza: "rapida",
  bar: "bar", pub: "bar", beer: "bar", nightclub: "bar", biergarten: "bar",
  ice_cream: "helados",
  bank: "banco", atm: "banco", bureau_de_change: "banco", money_transfer: "banco",
  clothing_store: "ropa", clothes: "ropa", fashion: "ropa", boutique: "ropa", jewelry: "ropa", bag: "ropa",
  shoes: "calzado", shoe: "calzado", books: "libreria", stationery: "libreria", copyshop: "libreria", newsagent: "libreria",
  hairdresser: "belleza", beauty: "belleza", cosmetics: "belleza", perfumery: "belleza", massage: "belleza",
  hospital: "salud", clinic: "salud", doctors: "salud", dentist: "salud", veterinary: "salud", optician: "salud",
  lodging: "hotel", hotel: "hotel", hostel: "hotel", guest_house: "hotel", motel: "hotel",
  school: "educacion", college: "educacion", university: "educacion", kindergarten: "educacion", library: "educacion", language_school: "educacion",
  cinema: "cultura", theatre: "cultura", museum: "cultura", art_gallery: "cultura", arts_centre: "cultura", music: "cultura",
  hardware: "ferreteria", doityourself: "ferreteria", paint: "ferreteria", garden: "ferreteria",
  mobile_phone: "tecnologia", electronics: "tecnologia", computer: "tecnologia",
};

/** Lo que no es un frente de local: paradas, plazas, estacionamientos, etc. */
const FUERA = new Set(["bus", "bus_stop", "railway", "subway", "ferry_terminal", "harbor", "aerialway", "airport", "parking", "bicycle_parking", "motorcycle_parking",
  "bicycle_rental", "park", "playground", "dog_park", "pitch", "stadium", "golf", "swimming", "picnic_site", "toilets", "drinking_water", "cemetery", "campsite",
  "fountain", "monument", "memorial", "attraction", "viewpoint", "tram_stop", "taxi", "charging_station"]);

export function clasificar(clase: string, subclase: string): Rubro | null {
  if (FUERA.has(clase) || FUERA.has(subclase)) return null;
  const k = MAPA[subclase] || MAPA[clase];
  return RUBROS[k ?? "otro"];
}

export function abreviarCalle(n: string): string {
  return n.replace(/^Avenida\s+/i, "Av. ").replace(/^Boulevard\s+/i, "Bv. ").replace(/^Pasaje\s+/i, "Pje. ").replace(/^Diagonal\s+/i, "Diag. ").trim();
}
