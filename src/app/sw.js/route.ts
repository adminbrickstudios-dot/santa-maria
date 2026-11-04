import { MARCA } from "@/lib/marca";
import { cuerpoSW } from "@/lib/sw";

/* Se sirve desde una ruta para que cada deploy traiga su versión adentro, sin depender de un paso previo al build */
export const dynamic = "force-static";

export function GET() {
  return new Response(cuerpoSW(process.env.NEXT_PUBLIC_VERSION || "dev", MARCA.nombre), {
    headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-cache, no-store, must-revalidate" },
  });
}
