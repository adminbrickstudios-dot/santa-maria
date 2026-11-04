"use client";
import { useEffect, useState } from "react";
import { esIOS, estaInstalada } from "@/lib/push";
import { Icono } from "@/components/Icono";

export default function Instalar() {
  const [ev, setEv] = useState<(Event & { prompt: () => void }) | null>(null), [ins, setIns] = useState(false), [ios, setIos] = useState(false);
  useEffect(() => {
    setIns(estaInstalada()); setIos(esIOS());
    const f = (e: Event) => { e.preventDefault(); setEv(e as Event & { prompt: () => void }); };
    addEventListener("beforeinstallprompt", f);
    return () => removeEventListener("beforeinstallprompt", f);
  }, []);
  return <div className="pagina">
    <h2 className="titulo">Ponela en tu celular</h2>
    {ins ? <p className="ok-t">Ya la tenés instalada.</p> : <>
      <p className="expl">Queda con su ícono en la pantalla de inicio, abre a pantalla completa y te llegan las notificaciones.</p>
      {ev && <button className="btn pri" onClick={() => ev.prompt()}><Icono n="instalar" />Instalar ahora</button>}
      {ios ? <div className="tarjeta"><h3>En iPhone</h3><ol className="pasos-g"><li>Abrí esta página en Safari.</li><li>Tocá el botón Compartir, el cuadrado con la flecha.</li><li>Elegí “Agregar a inicio”.</li><li>Abrila desde el ícono y activá las notificaciones.</li></ol></div>
        : <div className="tarjeta"><h3>En Android</h3><ol className="pasos-g"><li>Abrí esta página en Chrome.</li><li>Tocá los tres puntos de arriba.</li><li>Elegí “Agregar a la pantalla principal” o “Instalar app”.</li></ol></div>}
    </>}
  </div>;
}
