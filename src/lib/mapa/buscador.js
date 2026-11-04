// @ts-nocheck
/* Buscador único: gente, lugares, direcciones, esquinas, calles, barrios, líneas y categorías. Sin red y al instante. */
import {G,T,L,wx,wy,sinTilde,claveCalle,indiceCalles,centroCalle,geocodificar} from './motor';
import {FICHAS} from './osm';

const norm=s=>sinTilde(s).replace(/[.,;:'"()]/g,' ').replace(/\s+/g,' ').trim();
let IDX=[];
const SIN={farmacias:'f',farmacia:'f',remedios:'f',cafe:'cafe',cafes:'cafe',cafeteria:'cafe',bar:'cafe',super:'super',supermercado:'super',chino:'super',almacen:'super',cajero:'a',cajeros:'a',banco:'a',plata:'a',bano:'banos',banos:'banos',wifi:'wifi',internet:'wifi',estudiar:'estudiar',biblioteca:'estudiar',coworking:'estudiar'};
export const nombreBarrio=b=>({Agronomia:'Agronomía',Constitucion:'Constitución','Nuñez':'Núñez','San Cristobal':'San Cristóbal','San Nicolas':'San Nicolás','Velez Sarsfield':'Vélez Sarsfield','Villa Pueyrredon':'Villa Pueyrredón','Villa Ortuzar':'Villa Ortúzar'})[b]||b;

/* Se arma una vez cuando llegan los datos */
export function armarIndice(api){
  const a=[],add=(n,tipo,peso,extra)=>{const t=norm(n);a.push({t,p:' '+t,n,tipo,peso,...extra});};
  for(const p of api.personas)add(p.nombre,'persona',90,{ref:p,sub:p.sub||''});
  for(const p of api.lugares)add(p.nombre,'lugar',80,{ref:p,sub:p.sub||p.d||''});
  for(const b of L.barrios||[])add(nombreBarrio(b[0]),'barrio',70,{b:b[0],sub:'Barrio · explorar',x:wx(b[1]),y:wy(b[2])});
  for(const s of T.est||[])add(T.nom[s].replace('Est. ',''),'est',65,{x:T.sx[s],y:T.sy[s],sub:`Subte línea ${T.lin[s]}`,lin:T.lin[s]});
  const ln=new Set();(T.pats||[]).forEach((p,i)=>{if(!p.sub&&!ln.has(p.l)){ln.add(p.l);a.push({t:norm(p.l),p:' '+norm(p.l),n:`Línea ${p.l}`,tipo:'linea',peso:55,pi:i,sub:'Ver el recorrido del colectivo',exacto:true});}});
  for(const p of L.parks||[])if(p.n)add(p.n,'plaza',50,{x:p.x,y:p.y,sub:'Plaza o parque'});
  for(const q of L.pois||[])add(q.n,q.c==='c'?'poi-c':q.c==='h'?'poi-h':'poi',q.c==='c'?45:q.c==='h'?45:25,{x:q.wx,y:q.wy,sub:q.d,c:q.c});
  for(const g of api.guia||[])if(g.lat!=null)add(g.titulo,'guia',40,{x:wx(g.lon),y:wy(g.lat),sub:g.dato||g.bajada||'De la guía'});
  indiceCalles();
  G.names.forEach((n,i)=>{if(!n||!G.porN[i].length)return;const t=G.cl[i];a.push({t,p:' '+t,n,tipo:'calle',peso:30,na:i,sub:'Calle'});});
  IDX=a;
}
export const indiceListo=()=>IDX.length>0;
/* Distancia de edición chica, solo para perdonar un error de tipeo */
function casi(a,b,tope){
  if(Math.abs(a.length-b.length)>tope)return false;
  let prev=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
    const cur=[i];let min=i;
    for(let j=1;j<=b.length;j++){const c=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));cur.push(c);if(c<min)min=c;}
    if(min>tope)return false;prev=cur;
  }
  return prev[b.length]<=tope;
}
function puntaje(e,q,pal){
  if(e.exacto)return e.t===q?e.peso+60:-1;
  let s=0;
  if(e.t===q)s=200;else if(e.t.startsWith(q))s=120;else if(e.p.includes(' '+q))s=95;
  else{for(const w of pal){if(e.p.includes(' '+w))s+=30;else if(e.t.includes(w))s+=12;else return -1;}}
  return s+e.peso*.5-Math.min(25,e.t.length*.2);
}
export function buscar(texto,tope=8){
  const q=norm(texto).replace(/^av(da|enida)? /,'');if(q.length<2)return [];
  const pal=q.split(' '),hall=[];
  const cat=SIN[q]||(q.length>=4?Object.keys(SIN).find(k=>k.startsWith(q)&&SIN[k]):null);
  if(cat){const f=FICHAS.find(x=>x.id===(SIN[q]||SIN[cat]||cat));if(f)hall.push({tipo:'cat',n:f.n,ic:f.ic,sub:'Mostrar en el mapa',f:f.id,s:999});}
  for(const e of IDX){const s=puntaje(e,q,pal);if(s>0)hall.push({...e,s});}
  /* Dirección o esquina escrita completa */
  for(const g of geocodificar(texto))hall.push({...g,n:g.nombre,s:300});
  if(hall.length<3&&q.length>=4){
    const tope2=q.length>6?2:1;
    for(const e of IDX){if(e.exacto||e.tipo==='poi')continue;for(const w of e.t.split(' '))if(w.length>3&&casi(w,pal[pal.length-1],tope2)){hall.push({...e,s:20+e.peso*.2});break;}}
  }
  hall.sort((a,b)=>b.s-a.s);
  const vistos=new Set(),out=[];
  for(const h of hall){const k=`${h.tipo}|${norm(h.n)}|${h.lin||''}`;if(vistos.has(k))continue;vistos.add(k);out.push(h);if(out.length>=tope)break;}
  return out;
}
export {centroCalle};
