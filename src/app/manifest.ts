import type { MetadataRoute } from "next";
import { MARCA } from "@/lib/marca";

export default function manifest(): MetadataRoute.Manifest {
  const icono = [{ src: "/iconos/192.png", sizes: "192x192" }];
  return {
    name: MARCA.nombre,
    short_name: MARCA.nombre,
    description: MARCA.descripcion,
    start_url: "/inicio",
    display: "standalone",
    orientation: "any",
    background_color: "#0B0C0F",
    theme_color: "#F2F3F7",
    lang: "es-AR",
    icons: [
      { src: "/iconos/192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/iconos/512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/iconos/512-mascara.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Anotar gasto", url: "/billetera?rapido=1", icons: icono },
      { name: "Agregar a la agenda", url: "/agenda?rapido=1", icons: icono },
      { name: "Cómo llego", url: "/mapa", icons: icono },
      { name: "Mensajes", url: "/gente", icons: icono },
    ],
  };
}
