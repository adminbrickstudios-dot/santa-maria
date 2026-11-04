import { MARCA, MUNDOS } from "@/lib/marca";

/* Lo primero que se ve mientras llegan los datos */
export function Cargando() {
  return <div className="cargando" role="status" aria-label={`Cargando ${MARCA.nombre}`}><span className="fa-sello" aria-hidden="true">{MUNDOS.map((m, i) => <i key={i} className={m.clase}>{m.letra}</i>)}</span></div>;
}
