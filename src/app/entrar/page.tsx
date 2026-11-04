import { Suspense } from "react";
import { Cuatro } from "@/components/Cuatro";
import { Formulario } from "./Formulario";

/* Los cuatro mundos salen directo en el HTML; el formulario depende de la dirección y entra apenas carga el JS */
export default function Pagina() {
  return <div className="portada fa-portada">
    <Cuatro />
    <Suspense fallback={<div className="fa-hoja fa-hoja-vacia" aria-hidden="true"><i /><i /><i /></div>}><Formulario /></Suspense>
  </div>;
}
