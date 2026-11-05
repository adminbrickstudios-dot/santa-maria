/* Filtros de "qué hay cerca". Cada uno dice qué dato real usa y qué no se sabe: nada de promesas. */
export type IdFiltro = "abierto" | "farmacia" | "cajero" | "estudiar" | "comida" | "banos";

export const FILTROS: { id: IdFiltro; nombre: string; aclara: string; r?: RegExp }[] = [
  { id: "abierto", nombre: "Abierto ahora", aclara: "Solo lugares que publicaron su horario, que son pocos. Puede haber más abiertos." },
  { id: "farmacia", nombre: "Farmacias", aclara: "Farmacias del mapa. No sabemos cuál está de turno.", r: /chemist|pharmacy|drug_store/ },
  { id: "cajero", nombre: "Cajeros", aclara: "Cajeros y bancos del mapa. No sabemos si tienen plata ni de qué red son.", r: /(^|:)atm$|:bank$|bank_or_credit/ },
  { id: "estudiar", nombre: "Para estudiar", aclara: "Bibliotecas, coworkings y cafés. No sabemos si hay wifi o enchufes.", r: /library|coworking|:cafe$|^cafe$|coffee_shop/ },
  { id: "comida", nombre: "Comida al paso", aclara: "Comida rápida, patios de comida y panaderías. Suelen ser lo más barato, pero no tenemos precios.", r: /fast_food|food_court|shop:bakery|casual_eatery/ },
  { id: "banos", nombre: "Baños", aclara: "Casi no hay baños públicos cargados. Mostramos esos, y shoppings y estaciones, donde suele haber.", r: /public_restroom|:toilets$|private_toilet|shopping_mall|shop:mall|train_station/ },
];
