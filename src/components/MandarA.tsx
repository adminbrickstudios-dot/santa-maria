"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useRouter } from "next/navigation";
import { sb } from "@/lib/sb";
import { useSesion } from "@/lib/sesion";
import { Hoja } from "./Hoja";
import { Avatar } from "./Avatar";

/* Mandarle a alguien un lugar, un viaje o un dato de la guía. */
export function MandarA({ texto, adjunto, cerrar }: { texto: string; adjunto?: any; cerrar: () => void }) {
  const { perfil, personas, toast } = useSesion(), r = useRouter();
  async function mandar(p: any) {
    const { data, error } = await sb.rpc("compartir", { otro: p.id, texto, adjunto: adjunto || null });
    if (error) return toast(error.code === "PT403" ? "Primero tiene que aceptar tu contacto." : "No se pudo mandar.");
    cerrar(); toast(`Listo, se lo mandaste a ${p.nombre}.`); r.push(`/gente/chat/${data}`);
  }
  return <Hoja titulo="¿A quién se lo mandás?" cerrar={cerrar}>
    <p className="expl">{texto}</p>
    <div className="grilla-gente">{personas.filter((p) => p.id !== perfil.id && (!p.trato || p.trato === "libre")).map((p) => <button key={p.id} className="persona" onClick={() => mandar(p)}><Avatar p={p} t={46} /><span className="q"><b>{p.nombre}</b></span></button>)}</div>
  </Hoja>;
}
