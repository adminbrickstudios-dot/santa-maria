/* Baja y prepara los datos del mapa fuera del hilo principal, y calcula las rutas pesadas.
   El mapa y el panel siguen respondiendo mientras tanto. */
import {G,T,wx,wy,indexarCalles,adoptarCalles,indexarTransporte,adoptarTransporte,planificar,variantesPie,juntaCalc,caminar,puntoMedio,minutosPie,recorrido,barrioDe,prepararLugares,fichaBarrio,planoBase} from './motor';

let LW=null;
const bajar=async u=>{const r=await fetch(u);if(!r.ok)throw new Error(`${u}: ${r.status}`);return r.json();};
const copiar=x=>{const o={},t=[];for(const k in x){const v=x[k];if(ArrayBuffer.isView(v)){const c=v.slice();o[k]=c;t.push(c.buffer);}else o[k]=v;}return [o,t];};

async function cargar(){
  const [c,tr,l]=await Promise.all([bajar('/data/calles.json'),bajar('/data/transporte.json'),bajar('/data/lugares.json')]);
  const xc=indexarCalles(c);adoptarCalles(xc);
  const xt=indexarTransporte(tr);adoptarTransporte(xt);
  LW=prepararLugares(l);
  /* Partes separadas: cada una entra al hilo principal en su propia tarea, sin trabarlo */
  const [oc,tc]=copiar(xc);self.postMessage({t:'calles',x:oc},tc);
  const [ot,tt]=copiar(xt);self.postMessage({t:'transporte',x:ot},tt);
  self.postMessage({t:'lugares',x:LW.paraVista});
}
const FN={
  planificar(o,d,c){return {ops:planificar(o,d,c).ops};},
  variantesPie,juntaCalc,caminar,puntoMedio,minutosPie,recorrido,
  fichaBarrio(b){return fichaBarrio(b,LW);},
  verdes(){return LW.verdesUrl||(LW.verdesUrl=URL.createObjectURL(new Blob([JSON.stringify(LW.verdes)],{type:'application/json'})));},
  plano(){return LW.planoUrl||(LW.planoUrl=URL.createObjectURL(new Blob([JSON.stringify(planoBase(LW))],{type:'application/json'})));},
  barrioDe,
};
self.onmessage=async e=>{
  const {id,fn,args}=e.data;
  try{
    if(fn==='cargar'){await cargar();self.postMessage({id,ok:true});return;}
    self.postMessage({id,ok:FN[fn](...(args||[]))});
  }catch(err){self.postMessage({id,error:String(err&&err.message||err)});}
};
