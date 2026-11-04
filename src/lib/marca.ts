/* El nombre de la app vive solo acá. Lo usan el HTML, el manifest, el service worker, el calendario y las pantallas. */
export const MARCA = {
  nombre: "FAMA",
  sigla: "Facu, Agenda, Mapa y Ahorro",
  lema: "Tu vida en Buenos Aires, resuelta.",
  descripcion: "Facu, Agenda, Mapa y Ahorro: tu vida en Buenos Aires organizada.",
} as const;

/* Las cuatro letras y sus cuatro mundos */
export const MUNDOS = [
  { letra: "F", nombre: "Facu", clase: "fa-f" },
  { letra: "A", nombre: "Agenda", clase: "fa-a" },
  { letra: "M", nombre: "Mapa", clase: "fa-m" },
  { letra: "A", nombre: "Ahorro", clase: "fa-h" },
] as const;
