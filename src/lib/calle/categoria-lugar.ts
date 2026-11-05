/* De la categoría cruda (OSM "amenity:cafe" u Overture "coffee_shop") a un nombre en criollo y a qué interior le toca. */
export type Escena = "farmacia" | "cafe" | "restaurante" | "super" | "ropa" | "gimnasio" | "banco" | "hotel" | "museo" | "iglesia"
  | "facultad" | "oficina" | "peluqueria" | "kiosco" | "hospital" | "generico";

/* El orden importa: gana la primera que coincide. */
const REGLAS: [RegExp, string, Escena][] = [
  [/chemist|pharmacy|drug_store/, "Farmacia", "farmacia"],
  [/hospital|clinic|outpatient|doctors|health_care|surgery|diagnostics|rehabilitation|health$/, "Salud", "hospital"],
  [/dentist|dental/, "Dentista", "hospital"],
  [/veterinary|animal_or_pet/, "Veterinaria", "hospital"],
  [/optician|vision_or_eye/, "Óptica", "ropa"],
  [/supermarket|warehouse_club|greengrocer|butcher|food_and_beverage_store|cheese|pasta$|wine|alcohol|health_food/, "Supermercado o almacén", "super"],
  [/convenience|kiosk|lottery|newsagent|variety_store|tobacco/, "Kiosco", "kiosco"],
  [/coffee|:cafe$|^cafe$|ice_cream|bakery|pastry|confectionery/, "Café", "cafe"],
  [/fast_food|restaurant|casual_eatery|food_court|^bar$|:bar$|:pub$|nightclub|dance_club/, "Restaurante", "restaurante"],
  [/fitness|^gym$|sports_centre|sport_or_fitness|gimnasio/, "Gimnasio", "gimnasio"],
  [/:bank$|bank_or_credit|financial_service|bureau_de_change|payment_centre|money_transfer|insurance/, "Banco o finanzas", "banco"],
  [/tourism:(hotel|hostel|guest_house|motel)|^hotel$|lodging/, "Hotel", "hotel"],
  [/museum|art_gallery|arts_centre|cultural_center|historic_site|tourism:attraction|theatre|movie_theater|cinema|music_venue/, "Museo o cultura", "museo"],
  [/place_of_worship|religious|church|cathedral/, "Templo", "iglesia"],
  [/university|college|campus_building|place_of_learning|education|library|high_school|elementary_school|^school$|:school$|specialty_school|kindergarten|preschool/, "Educación", "facultad"],
  [/hairdresser|beauty|barber|personal_or_beauty|wellness|cosmetics|perfumery|massage|nails/, "Peluquería y belleza", "peluqueria"],
  [/clothes|fashion|shoes|apparel|boutique|jewelry|bag$|second_hand|sporting_goods|sports$/, "Ropa", "ropa"],
  [/^office:|real_estate|professional_service|corporate|government_office|attorney|b2b|travel_service|estate_agent|technical_service|design_service|embassy/, "Oficina", "oficina"],
  [/fuel|gas_station/, "Estación de servicio", "generico"],
  [/car_repair|auto_dealer|automotive|vehicle|shop:car|tyres|motorcycle/, "Autos", "generico"],
  [/electronics|computer|mobile_phone|hardware|paint|furniture|houseware|bed$|shopping|shop:/, "Comercio", "generico"],
  [/park|plaza|garden|pitch/, "Parque o plaza", "generico"],
];

const RUBRO_A_ESCENA: Record<string, Escena> = {
  farmacia: "farmacia", super: "super", almacen: "kiosco", verduleria: "super", carniceria: "super", panaderia: "cafe", cafe: "cafe", restaurante: "restaurante",
  rapida: "restaurante", bar: "restaurante", helados: "cafe", banco: "banco", ropa: "ropa", calzado: "ropa", belleza: "peluqueria", salud: "hospital", hotel: "hotel",
  educacion: "facultad", cultura: "museo",
};

const POR_NOMBRE: [RegExp, Escena][] = [
  [/\b(iglesia|parroquia|bas[ií]lica|catedral|capilla|templo|sinagoga)\b/i, "iglesia"],
  [/\b(museo|galer[ií]a de arte)\b/i, "museo"],
  [/\b(facultad|universidad|instituto|escuela|colegio)\b/i, "facultad"],
  [/\b(gimnasio|gym|crossfit|fitness)\b/i, "gimnasio"],
  [/\b(hospital|sanatorio|cl[ií]nica)\b/i, "hospital"],
  [/\b(kiosco|maxikiosco)\b/i, "kiosco"],
  [/\b(peluquer[ií]a|barber[ií]a)\b/i, "peluqueria"],
];

export function describirCategoria(c: string | undefined | null): { nombre: string; escena: Escena } {
  const k = (c ?? "").toLowerCase();
  if (k) for (const [r, nombre, escena] of REGLAS) if (r.test(k)) return { nombre, escena };
  return { nombre: "Lugar", escena: "generico" };
}

export function escenaDe(l: { nombre: string; categoria?: string; rubro?: { id: string } }): Escena {
  const d = describirCategoria(l.categoria);
  if (d.escena !== "generico") return d.escena;
  for (const [r, e] of POR_NOMBRE) if (r.test(l.nombre)) return e;
  return (l.rubro && RUBRO_A_ESCENA[l.rubro.id]) || "generico";
}
