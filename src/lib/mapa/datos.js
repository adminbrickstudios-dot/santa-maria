// @ts-nocheck
/* Quién tiene los datos y quién calcula: un Web Worker, y si el navegador no puede, el hilo principal. */
import {G,T,L,adoptarCalles,adoptarTransporte,cargarCalles,cargarTransporte,planificar,variantesPie,juntaCalc,caminar,puntoMedio,recorrido,prepararLugares,fichaBarrio,planoBase} from './motor';

let w=null,sinWorker=false,sec=0,datos=null,LOCAL=null;
const pend=new Map();
const respiro=()=>new Promise(k=>setTimeout(k));

function worker(){
  if(w||sinWorker||typeof Worker==='undefined')return w;
  try{
    w=new Worker(new URL('./datos.worker.js',import.meta.url),{type:'module'});
    w.onmessage=e=>{
      const m=e.data;
      if(m.t){alRecibir(m);return;}
      const p=pend.get(m.id);if(!p)return;pend.delete(m.id);clearTimeout(p.tope);
      'error' in m?p.no(new Error(m.error)):p.si(m.ok);
    };
    w.onerror=()=>caido();
  }catch{sinWorker=true;w=null;}
  return w;
}
function caido(){
  try{w&&w.terminate();}catch{}
  w=null;sinWorker=true;
  for(const [,p] of pend){clearTimeout(p.tope);p.no(new Error('worker'));}
  pend.clear();
}
function pedir(fn,args=[],tope=30000){
  return new Promise((si,no)=>{
    const id=++sec,m=worker();if(!m){no(new Error('worker'));return;}
    const t=setTimeout(()=>{pend.delete(id);no(new Error('tiempo'));},tope);
    pend.set(id,{si,no,tope:t});
    m.postMessage({id,fn,args});
  });
}
/* Cada parte entra en su propia tarea para no bloquear el hilo principal */
function alRecibir(m){
  if(m.t==='calles')adoptarCalles(m.x);
  else if(m.t==='transporte')adoptarTransporte(m.x);
  else if(m.t==='lugares')Object.assign(L,m.x);
}

const bajar=async u=>{const r=await fetch(u);if(!r.ok)throw new Error(u);return r.json();};
async function cargarAca(){
  const [c,t,l]=await Promise.all([bajar('/data/calles.json'),bajar('/data/transporte.json'),bajar('/data/lugares.json')]);
  await respiro();cargarCalles(c);
  await respiro();cargarTransporte(t);
  await respiro();LOCAL=prepararLugares(l);Object.assign(L,LOCAL.paraVista);
}
/* Se bajan una sola vez por sesión. Si falla, la próxima llamada vuelve a intentar. */
export function cargarDatosMapa(){
  if(!datos)datos=(async()=>{
    if(worker()){
      try{await pedir('cargar',[],45000);return;}
      catch(e){if(e.message!=='worker'&&e.message!=='tiempo')throw e;caido();}
    }
    await cargarAca();
  })().catch(e=>{datos=null;throw e;});
  return datos;
}
const AQUI={planificar(o,d,c){return {ops:planificar(o,d,c).ops};},variantesPie,juntaCalc,caminar,puntoMedio,recorrido,fichaBarrio:b=>fichaBarrio(b,LOCAL||L)};
/* Corre un cálculo en el Worker; si no anda, acá mismo. */
export async function enMotor(fn,...args){
  await cargarDatosMapa();
  if(worker()){
    try{return await pedir(fn,args);}catch{/* lo hago acá */}
  }
  await respiro();
  return AQUI[fn](...args);
}
/* Direcciones de GeoJSON armado en el Worker: el mapa los lee sin pasar por el hilo principal */
export async function urlVerdes(){
  await cargarDatosMapa();
  if(worker()){try{return await pedir('verdes');}catch{/* sigue abajo */}}
  return LOCAL?LOCAL.verdes:null;
}
export async function urlPlano(){
  await cargarDatosMapa();
  if(worker()){try{return await pedir('plano');}catch{/* sigue abajo */}}
  return planoBase(LOCAL||L);
}
export const datosEnMemoria=()=>!!(G.E&&T.S&&L.pois);
