"use client";
import Link from "next/link";
import { useSesion } from "@/lib/sesion";
import { Icono } from "@/components/Icono";

const T: [string, string, string, string, string, string?][] = [
  ["/tareas", "tilde", "#FF8A1F", "Tareas", "Lo que tenés que hacer"],
  ["/estudio", "reloj", "#7C5CFC", "Estudio", "Foco, repaso, faltas y notas"],
  ["/caja", "guardar", "#1F7AFF", "Mi caja", "Notas, fotos y archivos tuyos"],
  ["/compras", "regalo", "#10B765", "Compras", "Listas y qué conviene hoy"],
  ["/bondi", "bus", "#FFB400", "Bondi", "Cuánto sale y cómo pagar"],
  ["/calle", "ciudad", "#0FB5AE", "Caminar en 3D", "Recorré Buenos Aires"],
  ["/guia", "guia", "#10B765", "Guía de la ciudad", "Comer, salir, trámites y secretos", "guia"],
  ["/gente/juntadas", "gente", "#7C5CFC", "Juntadas", "Armá planes con tu gente", "gente"],
  ["/guia/descuentos", "regalo", "#FF8A1F", "Descuentos", "Lo que conviene hoy"],
  ["/facu/carreras", "brujula", "#1F7AFF", "Carreras", "Comparar y test de orientación", "carreras"],
  ["/guia/emergencias", "sirena", "#FF3B30", "Emergencias", "Los teléfonos a mano"],
  ["/guia/salud", "salud", "#FF4D8D", "Salud", "Guardias, turnos y obras sociales"],
  ["/guia?v=guardados", "guardar", "#FFB400", "Guardados", "Lo que marcaste en la guía"],
  ["/gente?v=cuentas", "plata", "#10B765", "Cuentas con amigos", "Quién le debe a quién"],
  ["/perfil", "usuario", "#5E6673", "Mi perfil", "Foto, casa y colores"],
];
export default function Mas() {
  const { pantalla, grupo, toast } = useSesion();
  async function invitar() {
    const texto = `Sumate a Santa María, la app para organizar tu vida en Buenos Aires.${grupo?.codigo_invitacion ? ` El código del grupo es ${grupo.codigo_invitacion}.` : ""} ${location.origin}`;
    try { if (navigator.share) await navigator.share({ text: texto }); else { await navigator.clipboard.writeText(texto); toast("Invitación copiada."); } } catch {}
  }
  return <div className="pagina">
    <h2 className="titulo">Más</h2>
    <div className="mas-grilla">{T.filter((t) => !t[5] || pantalla(t[5])).map(([h, ic, c, n, d]) => <Link key={h} href={h} className="mas-t"><span className="ic" style={{ "--c": c } as React.CSSProperties}><Icono n={ic} t={23} /></span><b>{n}</b><small>{d}</small></Link>)}<button className="mas-t" onClick={invitar} style={{ textAlign: "left" }}><span className="ic" style={{ "--c": "#FF4D8D" } as React.CSSProperties}><Icono n="compartir" t={23} /></span><b>Invitar amigos</b><small>Mandales la app y el código</small></button></div>
  </div>;
}
