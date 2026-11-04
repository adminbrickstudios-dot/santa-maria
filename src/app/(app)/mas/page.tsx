"use client";
import Link from "next/link";
import { useSesion } from "@/lib/sesion";
import { Icono } from "@/components/Icono";

const T: [string, string, string, string, string, string?][] = [
  ["/guia", "guia", "#10B765", "Guía de la ciudad", "Comer, salir, trámites y secretos", "guia"],
  ["/gente/juntadas", "gente", "#7C5CFC", "Juntadas", "Armá planes con tu gente", "gente"],
  ["/guia/descuentos", "regalo", "#FF8A1F", "Descuentos", "Lo que conviene hoy"],
  ["/facu/carreras", "brujula", "#1F7AFF", "Carreras", "Comparar y test de orientación", "carreras"],
  ["/guia/emergencias", "sirena", "#FF3B30", "Emergencias", "Los teléfonos a mano"],
  ["/guia/salud", "salud", "#FF4D8D", "Salud", "Guardias, turnos y obras sociales"],
  ["/guia?v=guardados", "guardar", "#FFB400", "Guardados", "Lo que marcaste en la guía"],
  ["/perfil", "usuario", "#5E6673", "Mi perfil", "Foto, casa y colores"],
];
export default function Mas() {
  const { pantalla } = useSesion();
  return <div className="pagina">
    <h2 className="titulo">Más</h2>
    <div className="mas-grilla">{T.filter((t) => !t[5] || pantalla(t[5])).map(([h, ic, c, n, d]) => <Link key={h} href={h} className="mas-t"><span className="ic" style={{ "--c": c } as React.CSSProperties}><Icono n={ic} t={23} /></span><b>{n}</b><small>{d}</small></Link>)}</div>
  </div>;
}
