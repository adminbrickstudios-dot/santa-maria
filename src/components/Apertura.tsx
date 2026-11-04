import { MARCA, MUNDOS } from "@/lib/marca";

/* La apertura va en el HTML y se mueve solo con CSS: se ve desde el primer cuadro, sin esperar al JS, mientras la app carga debajo.
   El guion corre antes de pintar: decide si se muestra (una vez por apertura) y deja saltearla con un toque. */
const GUION = `(function(){var h=document.documentElement,l=function(){h.classList.add("intro-lista")};try{if(sessionStorage.getItem("sm-libro")==="1"||matchMedia("(prefers-reduced-motion:reduce)").matches)return l();sessionStorage.setItem("sm-libro","1")}catch(e){}h.classList.add("intro-ve");setTimeout(l,1150);addEventListener("pointerdown",l,{once:true,capture:true})})()`;

export function Apertura() {
  return <>
    <script dangerouslySetInnerHTML={{ __html: GUION }} />
    <div className="fa-intro" aria-hidden="true">
      <div className="fa-grilla">{MUNDOS.map((m, i) => <span key={i} className={`fa-t ${m.clase}`} style={{ "--n": i } as React.CSSProperties}>{m.letra}</span>)}</div>
      <p className="fa-sigla">{MARCA.sigla}</p>
    </div>
  </>;
}
