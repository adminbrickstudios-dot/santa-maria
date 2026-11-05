// @ts-nocheck
/* El mapa: plano, rutas, cerca, juntada, explorar y herramientas. Se monta sobre un div.
   El mapa aparece primero y los datos llegan después, desde un Worker: nada espera a nada. */
import {G,T,L,wx,wy,alon,alat,sinTilde,perfil,dijkstra,semillas,franja,frecuencia,subteFrec,km,cuadras,planificar,geocodificar,barrioDe,esquinaDe,nomParada,centroCalle,VBUS,FRANJA} from './motor';
import {cargarDatosMapa,enMotor,urlVerdes,urlPlano,datosEnMemoria} from './datos';
import {svg,dibujarImagen,RATIO_IMAGEN} from './iconos';
import {fc,urlEstilo,estiloPlano,instalarCapas,CAPAS_TOQUE} from './estilo';
import {armarIndice,buscar,indiceListo,nombreBarrio} from './buscador';
import {FICHAS,ficha,traerOSM,lugaresOSM,yaBuscado,traerEcobici} from './osm';
import {estadoHorario} from './abierto';
import {escucharUbicacion,apagarUbicacion,ubicacionUnaVez,pedirBrujula} from './ubicacion';

let API=null,sesion=0;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=id=>document.getElementById('m-'+id);
const plata=n=>'$'+(Math.round(n/10)*10).toLocaleString('es-AR');
const hhmm=m=>{m=((Math.round(m)%1440)+1440)%1440;return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');};
const limpioH=h=>{let s=(h||'').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/\s+x\s+.*$/i,'').replace(/^Ramal\s+\S+\s*-\s*/i,'').replace(/\s*-?\s*(IDA|VUELTA)\s*$/i,'').trim();return s.replace(/^a\s+/i,'');};
const minutos=s=>Math.max(1,Math.round(s/60));
const quieto=()=>matchMedia('(prefers-reduced-motion:reduce)').matches;
const escritorio=()=>matchMedia('(min-width:920px)').matches;
const demo=!!process.env.NEXT_PUBLIC_DEMO;

/* ───────── Memoria ───────── */
const CLAVE='sm-mapa-v2';
const memoriaInicial=()=>({recientes:[],favs:[],bici:false,conocidos:{},listas:[],capas:null,vista:'mapa'});
let M=memoriaInicial();
let tMem=null;function guardar(){try{localStorage.setItem(CLAVE,JSON.stringify(M));}catch(e){}clearTimeout(tMem);const a=API;tMem=setTimeout(()=>{try{a&&a.guardarMemoria&&a.guardarMemoria(M);}catch(e){}},1500);}

/* ───────── Estado ───────── */
const estadoInicial=()=>({tab:'ir',desde:null,dest:null,plan:null,calculando:false,sel:0,varPie:null,varSel:null,ctx:null,ctxAbierto:false,elegirDesde:false,cat:null,cercaDe:null,cercaRes:null,junta:{quien:null,res:null,elegido:0,calculando:false},
  marca:null,buscar:'',buscando:false,capas:{amigos:true,facus:true,subte:true,guia:false,verdes:false,ciclo:false,ecobici:false},filtro:null,soloAbierto:false,estadoFicha:'',exp:null,herr:null,med:null,pm:null,paraLista:null,listaAbierta:null,menu:false,datos:'cargando',globo:null,vivoElegir:false});
const S=estadoInicial();
const CACHE=new Map();
function ahora(){
  const d=new Date(new Date().toLocaleString('en-US',{timeZone:'America/Argentina/Buenos_Aires'})),w=d.getDay();
  return {dia:w===0?'dom':w===6?'sab':'hab',min:d.getHours()*60+d.getMinutes(),lluvia:false,auto:true,wd:w};
}
S.ctx=ahora();
const hayDatos=()=>S.datos==='listo';
const REG=new Map();
function reg(p){const k=p.k||`x${p.x.toFixed(0)}_${p.y.toFixed(0)}`;p.k=k;REG.set(k,p);return k;}
let PERSONAS=[];
function armarPersonas(){
  PERSONAS=API.personas.map(p=>({k:'p:'+p.id,id:p.id,nombre:p.nombre,x:p.lat!=null?wx(p.lon):null,y:p.lat!=null?wy(p.lat):null,tipo:'persona',col:p.color,barrio:p.barrio||'',foto:p.avatar_url})).filter(p=>p.x!=null||p.id===API.yoId);
  PERSONAS.forEach(p=>{if(p.x!=null)reg(p);});
}
const yo=()=>PERSONAS.find(p=>p.id===API.yoId)||null;
const conCasa=()=>PERSONAS.filter(p=>p.x!=null);
const iniciales=n=>{const w=n.replace(/ y /,' ').split(/\s+/);return (w.length>1?w[0][0]+w[1][0]:n.slice(0,2)).toUpperCase();};
const avatar=p=>`<span class="avatar" style="background:${p.col}">${esc(iniciales(p.nombre))}</span>`;
const casaPlace=p=>({k:p.k,nombre:p.id===API.yoId?'Tu casa':`Casa de ${p.nombre}`,x:p.x,y:p.y,tipo:'persona',col:p.col,barrio:p.barrio});

/* ───────── Mapa: vida del motor gráfico ───────── */
let mapa=null,maplibre=null,CAPAS=null,COL={},dibRuta=[],PTS=new Map(),vistaBase='mapa',sucio=false,estiloListo=false,trid=false,usandoPlano=false,verEstilo=0,tEstilo=null,fTiles=0,fSat=0,tCtx=null,tSondeo=null,rehechos=0,SIG={},tMueve=null,tTap=null,ctrlOSM=null;
const ZM=64417,aZoom=s=>Math.log2(ZM*s),aEscala=()=>mapa?Math.pow(2,mapa.getZoom())/ZM:.17;
const cc=(x,y)=>[alon(x),alat(y)];
function colores(){const c=getComputedStyle(document.documentElement),g=n=>c.getPropertyValue(n).trim();
  COL={bondi:g('--azul')||'#1F7AFF',tinta:g('--tinta'),hoja:g('--hoja'),taxi:g('--taxi'),cartel:g('--cartel'),agenda:g('--agenda')||'#FF5147',oscuro:(document.documentElement.getAttribute('data-theme')==='dark')||(!document.documentElement.getAttribute('data-theme')&&matchMedia('(prefers-color-scheme:dark)').matches)};}
const baseOscura=()=>vistaBase==='noche'||COL.oscuro;
function prepararCapas(){CAPAS={est:Array.from(T.est)};}
const linea=(pts,props)=>{const co=[];for(let i=0;i<pts.length;i+=2)co.push(cc(pts[i],pts[i+1]));return {type:'Feature',properties:props,geometry:{type:'LineString',coordinates:co}};};
const punto=(x,y,props)=>({type:'Feature',properties:props,geometry:{type:'Point',coordinates:cc(x,y)}});
/* Pone datos en una fuente solo si cambiaron: evita repintar de gusto */
function poner(src,data,sig){if(!mapa)return;const k=sig??JSON.stringify(data);if(SIG[src]===k)return;const s=mapa.getSource(src);if(s){s.setData(data);SIG[src]=k;}}

/* Avisos cortos arriba del mapa. Se distinguen por clave y se pisan solos. */
const PILLS=new Map();
function pill(k,tx,btn){tx?PILLS.set(k,{tx,btn}):PILLS.delete(k);const b=$('avisos');if(!b)return;b.innerHTML=[...PILLS.entries()].map(([id,p])=>`<div class="m-pill" data-p="${id}"><span>${esc(p.tx)}</span>${p.btn?`<button data-a="${p.btn.a}">${esc(p.btn.n)}</button>`:''}</div>`).join('');}

function relojEstilo(){clearTimeout(tEstilo);const v=verEstilo;tEstilo=setTimeout(()=>{if(v===verEstilo&&!estiloListo&&!usandoPlano)caerAPlano();},8000);}
async function ponerEstilo(){
  if(!mapa)return;
  const v=++verEstilo,yoS=sesion;estiloListo=false;SIG={};
  if(usandoPlano){
    let f=null;try{f=await urlPlano();}catch{/* sin datos todavía: queda el fondo, y se reintenta al llegar */}
    if(v!==verEstilo||yoS!==sesion||!mapa)return;
    mapa.setStyle(estiloPlano(baseOscura(),f),{diff:false,validate:demo});return;
  }
  relojEstilo();mapa.setStyle(urlEstilo(baseOscura()),{diff:false,validate:demo});
}
/* Si el mapa de internet no llega, se dibuja el plano propio y se vuelve solo apenas responda */
function caerAPlano(){
  if(usandoPlano||!mapa)return;
  usandoPlano=true;clearTimeout(tEstilo);pill('red','Sin conexión con el mapa: te muestro el plano guardado.');ponerEstilo();sondear(4000);
}
function sondear(ms){clearTimeout(tSondeo);const yoS=sesion;tSondeo=setTimeout(()=>probarRed(yoS,ms),ms);}
async function probarRed(yoS,ms){
  if(yoS!==sesion||!usandoPlano)return;
  try{
    const c=new AbortController(),t=setTimeout(()=>c.abort(),6000);
    const r=await fetch(urlEstilo(baseOscura()),{cache:'no-store',signal:c.signal});clearTimeout(t);
    if(r.ok&&yoS===sesion&&mapa){usandoPlano=false;fTiles=0;pill('red','');ponerEstilo();return;}
  }catch{/* sigue sin red */}
  if(yoS===sesion)sondear(Math.min(60000,ms*1.7));
}
function alError(e){
  const er=e?.error||{},src=e?.sourceId;
  if(demo)console.warn('mapa',src||'',er.message||'');
  if(src==='sat'||src==='nombres'){if(++fSat>=6&&vistaBase==='satelite'){fSat=0;elegirVista('mapa');aviso('No llegan las imágenes satelitales. Volví al mapa.');}return;}
  if(src){if(er.status===404||usandoPlano)return;if(/^(openmaptiles|ne2_shaded)/i.test(src)&&++fTiles>=8)caerAPlano();return;}
  if(usandoPlano||estiloListo)return;
  const url=er.url||'';
  if(url&&!/\/styles\//.test(url))return;
  if(url)caerAPlano();else{const v=verEstilo;setTimeout(()=>{if(v===verEstilo&&!estiloListo)caerAPlano();},1500);}
}
function alPerderContexto(){
  pill('gl','Recuperando el mapa…');clearTimeout(tCtx);
  tCtx=setTimeout(rehacerMapa,1800);
}
function alRecuperarContexto(){clearTimeout(tCtx);pill('gl','');rehechos=0;SIG={};if(mapa){sincronizar();mapa.triggerRepaint();}}
function rehacerMapa(){
  if(!mapa)return;
  const c=mapa.getContainer(),cam={center:mapa.getCenter(),zoom:mapa.getZoom(),bearing:mapa.getBearing(),pitch:mapa.getPitch()};
  try{mapa.remove();}catch{/* el contexto ya estaba perdido */}
  mapa=null;estiloListo=false;c.innerHTML='';
  if(++rehechos>3){falla('No pude recuperar el mapa.');return;}
  crearMapa(c,cam).then(()=>{if(mapa)pill('gl','');});
}
function falla(tx){const b=$('carga');if(!b)return;b.hidden=false;b.innerHTML=`<div><p>${esc(tx)}</p><p class="m-sub">Podés seguir buscando rutas en el panel.</p><button class="btn pri" data-a="reintentar">Probar de nuevo</button></div>`;pill('gl','');}
async function crearMapa(contenedor,cam){
  const yoS=sesion;
  try{if(!maplibre)maplibre=(await import('maplibre-gl')).default;}
  catch{if(yoS===sesion)falla('No pude cargar el mapa. Revisá la conexión.');return;}
  if(yoS!==sesion||!contenedor.isConnected)return;
  const vacio={version:8,sources:{},layers:[{id:'fondo',type:'background',paint:{'background-color':baseOscura()?'#17191D':'#F2EFE9'}}]};
  try{
    mapa=new maplibre.Map({container:contenedor,style:usandoPlano?vacio:urlEstilo(baseOscura()),center:cam?.center||[-58.40,-34.60],zoom:cam?.zoom??13,bearing:cam?.bearing||0,pitch:cam?.pitch||0,minZoom:9,maxZoom:19,maxBounds:[[-59.3,-35.25],[-57.6,-34.0]],attributionControl:false,fadeDuration:120,maxPitch:70,
      pixelRatio:Math.min(window.devicePixelRatio||1,2),renderWorldCopies:false,refreshExpiredTiles:false,validateStyle:demo,clickTolerance:4});
  }catch(e){falla('Este dispositivo no pudo abrir el mapa.');return;}
  $('carga').hidden=true;
  mapa.addControl(new maplibre.AttributionControl({compact:true}),'bottom-left');
  mapa.on('style.load',()=>{clearTimeout(tEstilo);estiloListo=false;SIG={};intentarCapas();});
  mapa.on('styleimagemissing',e=>{if(!mapa||mapa.hasImage(e.id))return;const im=dibujarImagen(e.id);if(im)mapa.addImage(e.id,im,{pixelRatio:RATIO_IMAGEN});});
  mapa.once('idle',()=>{document.querySelector('.maplibregl-compact-show')?.classList.remove('maplibregl-compact-show');rehechos=0;});
  mapa.on('sourcedata',e=>{if(e.tile&&e.sourceId!=='sat')fTiles=0;if(e.tile&&e.sourceId==='sat')fSat=0;});
  mapa.on('click',alClick);
  mapa.on('error',alError);
  mapa.on('webglcontextlost',alPerderContexto);
  mapa.on('webglcontextrestored',alRecuperarContexto);
  mapa.on('rotate',brujulaMapa);mapa.on('pitch',brujulaMapa);
  mapa.on('moveend',alMover);
  mapa.on('dragstart',()=>{if(U.modo===2)modoGps(1);});
  if(matchMedia('(hover:hover)').matches){mapa.on('mouseenter','marcas',cursorMano);mapa.on('mouseleave','marcas',cursorMapa);mapa.on('mouseenter','pois',cursorMano);mapa.on('mouseleave','pois',cursorMapa);mapa.on('mouseenter','puntos',cursorMano);mapa.on('mouseleave','puntos',cursorMapa);}
  if(demo)window.__m=mapa;
  if(usandoPlano)ponerEstilo();else relojEstilo();
  brujulaMapa();
}
const cursorMano=()=>{if(mapa)mapa.getCanvas().style.cursor='pointer';};
const cursorMapa=()=>{if(mapa)mapa.getCanvas().style.cursor='';};
/* Si el estilo todavía está cambiando addSource tira error antes de tocar nada: se reintenta */
function intentarCapas(){
  if(!mapa)return;
  try{instalarCapas(mapa,{oscuro:baseOscura(),azul:COL.bondi||'#1F7AFF'});}
  catch(e){if(demo)console.warn('capas',e.message);mapa.once('style.load',intentarCapas);return;}
  estiloListo=true;fTiles=0;
  if(hayDatos()){datosEnCapas();}
  sincronizar();
}
function datosEnCapas(){
  if(!mapa||!estiloListo||!CAPAS)return;
  const subte=[...new Set(T.pats.filter(p=>p.sub).map(p=>p.l))].map(l=>{const q=T.pats.filter(p=>p.sub&&p.l===l).sort((a,b)=>b.g.length-a.g.length)[0];return linea(q.g,{col:T.meta.subteCol[l]||COL.bondi});});
  poner('subte',fc(subte),'x');
  poner('estaciones',fc(CAPAS.est.map(e=>punto(T.sx[e],T.sy[e],{col:T.meta.subteCol[T.lin[e]]||COL.bondi,nom:T.nom[e].replace('Est. ','')}))),'x');
}
async function capaVerdes(){const yoS=sesion;if(SIG.verdes)return;SIG.verdes='x';let u=null;try{u=await urlVerdes();}catch{SIG.verdes='';return;}if(yoS!==sesion||!mapa||!u)return;mapa.getSource('verdes')?.setData(u);}
let ecobici=null;
async function capaEcobici(){
  if(ecobici){poner('ecobici',fc(ecobici.map((q,i)=>{PTS.set('b'+i,q);return punto(q.x,q.y,{id:'b'+i});})),'x');return;}
  const yoS=sesion;pill('eco','Buscando estaciones de Ecobici…');
  try{const l=await traerEcobici();if(yoS!==sesion)return;ecobici=l.map(q=>({nombre:q.n,x:wx(q.lo),y:wy(q.la),tipo:'poi',sub:'Estación de Ecobici'}));pill('eco','');if(!ecobici.length){aviso('No encontré estaciones de Ecobici.');return;}capaEcobici();}
  catch{if(yoS!==sesion)return;pill('eco','');S.capas.ecobici=false;pintarMenu();aviso('No pude traer las estaciones ahora. Probá en un rato.');}
}
function sincronizar(){
  if(!mapa||!estiloListo)return;
  poner('ruta',fc(dibRuta.filter(r=>r.pts&&r.pts.length>3).map(r=>linea(r.pts,{alt:r.alt?1:0,pie:r.punteado?1:0,col:r.col||COL.bondi,ancho:r.ancho||5}))));
  const f=[],mar=[];
  for(const k of [...PTS.keys()])if(k[0]==='p'||k[0]==='m')PTS.delete(k);
  const add=(x,y,r,col,p)=>{const id='p'+f.length;PTS.set(id,p);f.push(punto(x,y,{r,col,id}));};
  const pin=(x,y,ic,an,z,p)=>{const id='m'+mar.length;if(p)PTS.set(id,p);mar.push(punto(x,y,{ic,an,z,id}));};
  if(S.cercaRes&&S.cercaRes.marcas)S.cercaRes.marcas.forEach(q=>add(q.x,q.y,7,COL.bondi,q));
  if(S.capas.facus)L.places.filter(q=>q.k==='f'&&!q.prim).forEach(q=>add(q.wx,q.wy,6.5,'#7C5CFC',q.place||q));
  (API.aportes||[]).filter(a=>(a.tipo==='lugar'||a.tipo==='atajo')&&a.lat!=null).forEach(a=>add(wx(a.lon),wy(a.lat),7,a.tipo==='atajo'?'#FFB400':'#10B765',{k:'ap'+a.id,nombre:a.titulo||a.texto||'Aporte',x:wx(a.lon),y:wy(a.lat),sub:a.nota||a.detalle||a.texto||''}));
  if(S.capas.guia)(API.guia||[]).filter(q=>q.lat!=null).forEach(q=>add(wx(q.lon),wy(q.lat),6,'#10B765',{k:'g'+q.id,nombre:q.titulo,x:wx(q.lon),y:wy(q.lat),sub:q.dato||q.bajada||''}));
  if(S.listaAbierta){const l=M.listas.find(x=>x.id===S.listaAbierta);(l?.lugares||[]).forEach(q=>add(q.x,q.y,8,'#FF9500',{...q,tipo:'poi'}));}
  if(S.exp&&S.exp.cards)S.exp.cards.forEach((c,i)=>{if(c.x!=null&&c.tipo!=='portada'){if(i===S.exp.i)pin(c.x,c.y,'pin|#FF3B30|','bottom',9,c.place);else add(c.x,c.y,7,'#FF3B30',c.place);}});
  poner('puntos',fc(f));
  if(S.capas.facus)L.places.filter(q=>q.prim).forEach(q=>pin(q.wx,q.wy,`pin|${COL.agenda}|${q.n.replace(' · Puerto Madero','')}`,'bottom',2,q.place));
  if(S.capas.amigos){const me=yo();conCasa().forEach(p=>pin(p.x,p.y,`am|${p.col}|${iniciales(p.nombre)}|${me&&p.id===me.id?1:0}`,'center',me&&p.id===me.id?4:3,casaPlace(p)));}
  dibRuta.forEach(r=>{if(r.fin)pin(r.fin[0],r.fin[1],'pin|#FF3B30|','bottom',8);});
  if(S.marca)pin(S.marca.x,S.marca.y,'pin|#FFB400|','bottom',9,S.marca);
  poner('marcas',fc(mar));
  const vis=(id,v)=>{if(mapa.getLayer(id))mapa.setLayoutProperty(id,'visibility',v?'visible':'none');};
  vis('subte',S.capas.subte);vis('estaciones',S.capas.subte);vis('estaciones-nom',S.capas.subte);vis('edificios-3d',trid&&vistaBase!=='satelite');
  vis('verdes',S.capas.verdes);vis('verdes-borde',S.capas.verdes);vis('ciclo',S.capas.ciclo);vis('ecobici',S.capas.ecobici);
  vis('sat',vistaBase==='satelite');vis('nombres',vistaBase==='satelite'&&usandoPlano);
  if(S.capas.verdes)capaVerdes();
  if(S.capas.ecobici&&!SIG.ecobici)capaEcobici();
  pintarFichaEnMapa();pintarVivoEnMapa();pintarYo();pintarMedida();
}
function pedir(){if(sucio)return;sucio=true;requestAnimationFrame(()=>{sucio=false;sincronizar();});}
/* Cuánto tapa el panel: en el celu abajo, en la compu a la izquierda */
function bajoPanel(){const h=$('hoja');if(!h||escritorio())return 0;return Math.min(h.offsetHeight-(+h.dataset.y||0),(mapa?.getContainer().clientHeight||600)*.62);}
const desplazo=()=>escritorio()?[216,20]:[0,Math.round(34-bajoPanel()/2)];
function centroVisible(){const c=mapa.getContainer(),[ox,oy]=desplazo();const q=mapa.unproject([c.clientWidth/2+ox,c.clientHeight/2+oy]);return {x:wx(q.lng),y:wy(q.lat)};}
function irA(x,y,s,dur=620){
  if(!mapa)return;
  const z=Math.max(9,Math.min(19,aZoom(s))),o=desplazo();
  if(quieto()){mapa.jumpTo({center:cc(x,y),zoom:z});return;}
  const p=mapa.project(cc(x,y)),c=mapa.getContainer(),lejos=Math.hypot(p.x-c.clientWidth/2,p.y-c.clientHeight/2)>c.clientWidth*2.2;
  if(lejos&&dur)mapa.flyTo({center:cc(x,y),zoom:z,offset:o,duration:1100,curve:1.3,essential:false});
  else mapa.easeTo({center:cc(x,y),zoom:z,duration:dur,offset:o,easing:t=>1-Math.pow(1-t,4)});
}
function encuadrar(pts,marg=60){
  if(!mapa)return;pedir();let a=1e9,b=1e9,c=-1e9,d=-1e9;for(let i=0;i<pts.length;i+=2){a=Math.min(a,pts[i]);c=Math.max(c,pts[i]);b=Math.min(b,pts[i+1]);d=Math.max(d,pts[i+1]);}
  if(a>c)return;const H=mapa.getContainer().clientHeight;
  mapa.fitBounds([cc(a,d),cc(c,b)],{padding:{top:marg+56,left:escritorio()?464:marg-14,right:marg,bottom:Math.min(bajoPanel()+24,H*.62)},duration:quieto()?0:760,maxZoom:16.5});
}
function abrirP(p){reg(p);S.marca=null;abrirGlobo(p);pedir();}
/* Un toque espera un instante: si llega otro enseguida es doble toque y hace zoom sin abrir nada */
function alClick(e){if(tTap){clearTimeout(tTap);tTap=null;return;}tTap=setTimeout(()=>{tTap=null;toque(e);},240);}
function toque(e){
  if(!mapa)return;
  const x=wx(e.lngLat.lng),y=wy(e.lngLat.lat);
  if(S.herr==='medir'){sumarMedida(x,y);return;}
  if(S.herr==='medio'){elegirMedio({nombre:hayDatos()?(esquinaDe(x,y)||'Este punto'):'Este punto',x,y,tipo:'punto'});return;}
  const capas=CAPAS_TOQUE.filter(l=>mapa.getLayer(l));
  const c=capas.length?mapa.queryRenderedFeatures([[e.point.x-14,e.point.y-14],[e.point.x+14,e.point.y+14]],{layers:capas}):[];
  for(const f of c){
    if(f.layer.id==='pois-cl'){const s=mapa.getSource('pois'),id=f.properties.cluster_id,co=f.geometry.coordinates;s.getClusterExpansionZoom(id).then(z=>{mapa&&mapa.easeTo({center:co,zoom:z+.3,duration:quieto()?0:480,offset:desplazo()});}).catch(()=>{});return;}
    const p=PTS.get(f.properties.id);if(p){abrirP(p);return;}
  }
  if($('globo')&&!$('globo').hidden&&!S.marca){cerrarGlobo();return;}
  const pl={nombre:hayDatos()?(esquinaDe(x,y)||'Este punto'):'Este punto',x,y,tipo:'punto'};reg(pl);S.marca=pl;abrirGlobo(pl);pedir();
}
function cerrarGlobo(){const g=$('globo');if(g)g.hidden=true;S.globo=null;if(S.marca){S.marca=null;pedir();}}
function brujulaMapa(){
  const b=$('brujula');if(!b||!mapa)return;
  const r=mapa.getBearing(),p=mapa.getPitch(),on=Math.abs(r)>.5||p>1;
  if(b.hidden===on)b.hidden=!on;
  if(on){const i=b.firstElementChild;if(i)i.style.transform=`rotate(${-r}deg)`;}
}
function cambiarBaseVista(){pintarVistas();pedir();}
function elegirVista(v){
  if(v==='satelite'){vistaBase='satelite';if(trid){trid=false;mapa?.easeTo({pitch:0,duration:400});}cambiarBaseVista();M.vista='mapa';guardar();return;}
  const oscAntes=vistaEstiloOscuro;vistaBase=v;vistaEstiloOscuro=baseOscura();M.vista=v;guardar();
  /* Tocar varias veces seguidas no recarga el estilo cada vez */
  if(vistaEstiloOscuro!==oscAntes){clearTimeout(tPoner);tPoner=setTimeout(ponerEstilo,160);}
  cambiarBaseVista();
}
let vistaEstiloOscuro=false,tPoner=null;
function alternar3D(){if(!mapa)return;trid=!trid;if(trid&&vistaBase==='satelite')elegirVista('mapa');mapa.easeTo({pitch:trid?58:0,zoom:trid?Math.max(mapa.getZoom(),15.5):mapa.getZoom(),duration:quieto()?0:760});pedir();pintarVistas();}
function abrirGlobo(p){
  const g=$('globo');if(!g)return;g.hidden=false;S.globo=p;reg(p);
  let sub=p.sub||p.d||'';if(p.tipo==='persona')sub=p.barrio||'';
  const fav=M.favs.includes(p.k),h=p.h?estadoHorario(p.h,S.ctx.wd??ahora().wd,S.ctx.min):null;
  const hor=h?`<small class="${h.abierto?'m-abre':'m-cierra'}">${h.abierto?`Abierto ahora${h.hasta?`, hasta ${h.hasta}`:''}`:'Cerrado ahora'}</small>`:'';
  g.innerHTML=`<div class="m-g-t"><b>${esc(p.nombre)}${sub?`<small>${esc(sub)}</small>`:''}${hor}</b><button class="ico-btn" data-a="cerrar-globo" aria-label="Cerrar">${svg('x',2.4)}</button></div>
  <div class="m-g-p"><button class="btn pri" data-a="ir" data-k="${esc(p.k)}">${svg('ir')}Cómo llego</button><button class="btn sec2" data-a="caminar-a" data-k="${esc(p.k)}">${svg('caminar')}Caminar acá</button></div>
  <div class="m-g-m"><button data-a="fav-p" data-k="${esc(p.k)}" aria-pressed="${fav}">${svg('guardar',fav?3:2)}<span>${fav?'Guardado':'Guardar'}</span></button><button data-a="a-lista" data-k="${esc(p.k)}">${svg('lista')}<span>A una lista</span></button><button data-a="mandar-p" data-k="${esc(p.k)}">${svg('enviar')}<span>Mandar</span></button><button data-a="cerca-de" data-k="${esc(p.k)}">${svg('cerca')}<span>Cerca</span></button></div>`;
}

/* ───────── Vistas ───────── */
const TABS=[['ir','Cómo llego'],['cerca','Cerca'],['junta','Juntarnos'],['explorar','Explorar']];
function pintarTabs(){$('tabs').innerHTML=TABS.map(([id,n])=>`<button class="seg" role="tab" aria-selected="${S.tab===id&&!S.herr&&!S.filtro&&!S.buscando}" data-a="tab" data-t="${id}">${n}</button>`).join('');}
function pintarFichas(){
  const b=$('fichas');if(!b)return;
  const f=S.filtro&&ficha(S.filtro);
  b.innerHTML=(f&&f.osm?`<button class="m-ficha abre" aria-pressed="${S.soloAbierto}" data-a="abierto">Abierto ahora</button>`:'')+FICHAS.map(q=>`<button class="m-ficha" aria-pressed="${S.filtro===q.id}" data-a="ficha" data-f="${q.id}" style="--c:${q.col}">${svg(q.ic)}${q.n}</button>`).join('');
}
function pintarVistas(){pintarMenu();const b=$('gps');if(b){b.dataset.modo=U.modo;b.setAttribute('aria-label',['Ir a donde estoy','Seguirme mientras camino','Dejar de seguirme'][U.modo]);}}
function render(){
  if(!$('panel'))return;
  pintarTabs();pintarFichas();
  const P=$('panel'),v=S.buscando?vistaBusqueda:S.herr==='medir'?vistaMedir:S.herr==='medio'?vistaMedio:S.herr==='listas'?vistaListas:S.filtro?vistaFicha:{ir:vistaIr,cerca:vistaCerca,junta:vistaJunta,explorar:vistaExplorar}[S.tab];
  P.innerHTML=`<div class="pila">${v()}</div>`;
}
const avisoDatos=()=>S.datos==='error'?`<div class="nota"><h3>No pude bajar las rutas</h3><p>El mapa funciona igual. Vuelvo a probar solo, o tocá acá.</p><button class="btn sec2 chico" data-a="reintentar-datos">Probar de nuevo</button></div>`:'<div class="m-carga-fila"><i></i><span>Preparando las rutas…</span></div>';
const ctxTexto=c=>{const d=c.auto?`Ahora, ${hhmm(c.min)}`:`${c.dia==='hab'?'Lun a vie':c.dia==='sab'?'Sábado':'Domingo'} ${hhmm(c.min)}`;return d;};
function chipsCtx(){const c=S.ctx;return `<div class="chipera"><button class="chip" data-a="ctx-abrir" aria-expanded="${!!S.ctxAbierto}">${esc(ctxTexto(c))} ▾</button><button class="chip" aria-pressed="${c.lluvia}" data-a="lluvia">Llueve</button><button class="chip" aria-pressed="${M.bici}" data-a="tengo-bici">Tengo bici</button></div>
${S.ctxAbierto?`<div class="nota"><div class="fila"><button class="chip" aria-pressed="${c.auto}" data-a="ctx-ahora">Ahora</button>${[['hab','Lun a vie'],['sab','Sábado'],['dom','Domingo']].map(([d,n])=>`<button class="chip" aria-pressed="${!c.auto&&c.dia===d}" data-a="ctx-dia" data-d="${d}">${n}</button>`).join('')}</div><div class="campo"><label for="m-hora">Hora de salida</label><input id="m-hora" type="time" value="${hhmm(c.min)}"></div></div>`:''}`;}

function vistaIr(){
  const me=yo();
  if(!S.desde&&me&&me.x!=null)S.desde=casaPlace(me);
  if(!S.desde)return sinOrigen();
  if(!S.dest){
    const uca=L.places[0];
    const hist=M.recientes.map(k=>REG.get(k)).filter(Boolean);
    const freq=[...new Set(hist)].slice(0,4);
    const favs=M.favs.map(k=>REG.get(k)).filter(Boolean);
    const mins=minutosAmigos();
    const am=conCasa().filter(p=>p.id!==API.yoId).map(p=>({p,m:mins?mins[p.id]:null})).sort((a,b)=>(a.m??0)-(b.m??0));
    const bloque=(arr,ic)=>arr.map(q=>`<button class="item" data-a="ir" data-k="${esc(reg(q.place||q))}"><span class="ic">${svg(ic)}</span><span class="q"><b>${esc(q.nombre||q.place.nombre)}</b><small>${esc(q.d||q.sub||'')}</small></span></button>`).join('');
    return `${hayDatos()?'':avisoDatos()}
    <button class="item m-desde" data-a="desde"><span class="q"><small>Salís de</small><b>${esc(S.desde.nombre)} <span class="m-cambiar">cambiar</span></b></span></button>
    ${S.elegirDesde?`<div class="chipera"><button class="chip" data-a="gps-origen">Donde estoy ahora</button>${conCasa().map(p=>`<button class="chip" data-a="desde-sel" data-k="${esc(p.k)}" aria-pressed="${S.desde.k===p.k}">${esc(p.nombre)}</button>`).join('')}</div>`:''}
    ${uca?`<button class="grande" data-a="ir" data-k="${esc(uca.place.k)}">${svg('uca')}<span class="q"><b>A ${esc(uca.n.split(' · ')[0])}</b><small>${esc(uca.d||'')}</small></span>${svg('flecha')}</button>`:''}
    ${favs.length?`<h3 class="sec">Tus guardados</h3><div class="lista">${bloque(favs,'guardar')}</div>`:''}
    ${freq.length?`<h3 class="sec">Lo último que buscaste</h3><div class="lista">${bloque(freq,'ir')}</div>`:''}
    <h3 class="sec">Amigos</h3>
    <div class="grilla-gente">${am.map(({p,m})=>`<button class="persona" data-a="ir" data-k="${esc(reg(casaPlace(p)))}">${avatar(p)}<span class="q"><b>${esc(p.nombre)}</b><small>${m!=null?`${m} min a pie`:esc(p.barrio)}</small></span></button>`).join('')}</div>
    <h3 class="sec">Facultades</h3><div class="lista">${bloque(L.places.filter(q=>q.k==='f').slice(1),'uca')}</div>
    <h3 class="sec">Para salir</h3><div class="lista">${bloque(L.places.filter(q=>q.k==='p'),'lugar')}</div>
    <h3 class="sec">Viajes largos</h3><div class="lista">${bloque(L.places.filter(q=>q.k==='t'),'bus')}</div>`;
  }
  /* resultado */
  const cab=`<div class="ruta-cab"><button class="ico-btn" data-a="volver" aria-label="Volver">${svg('volver',2.4)}</button><div class="t">${esc(S.dest.nombre)}<small>Desde ${esc(S.desde.nombre==='Tu casa'?'tu casa':S.desde.nombre)}</small></div><button class="ico-btn" data-a="fav" aria-pressed="${M.favs.includes(S.dest.k)}" aria-label="Guardar destino" style="color:${M.favs.includes(S.dest.k)?'var(--ojo)':'inherit'}">${svg('guardar',M.favs.includes(S.dest.k)?3:2)}</button></div>`;
  if(!S.plan)return `${cab}${S.datos==='error'?avisoDatos():'<div class="m-carga-fila"><i></i><span>Buscando cómo llegar…</span></div><div class="m-esq"></div><div class="m-esq"></div>'}`;
  const pl=S.plan,op=pl.ops[S.sel];
  return `${cab}
  ${chipsCtx()}
  ${!pl.ops.length?'<p class="vacio">No encontré cómo llegar. Probá otro punto.</p>':''}
  ${pl.ops.map((o,i)=>tarjeta(o,i,i===S.sel)).join('')}
  ${op?`<div class="nota expl">Tiempos estimados por este mapa. Para ver el colectivo en vivo, usá el botón de Google Maps.</div>`:''}`;
}
const ICT={pie:'pie',bus:'bus',subte:'subte',bici:'bici',auto:'auto'};
function chipLinea(p){
  if(p.t==='subte')return `<span class="ln sub ${p.linea==='H'?'subH':''}" style="background:${T.meta.subteCol[p.linea]}">${p.linea}</span>`;
  return `<span class="ln">${esc(p.linea)}</span>`;
}
function tarjeta(o,i,sel){
  const lineas=o.pp.filter(p=>p.linea);
  const tit=lineas.length?lineas.map(chipLinea).join(' '):esc(o.titulo);
  return `<article class="op ${sel?'sel':''}"><button class="op-cab" data-a="op" data-i="${i}" aria-expanded="${sel}"><span class="op-ic">${svg(ICT[o.tipo])}</span><span class="op-q">${o.marca?`<span class="marca">${o.marca}</span>`:''}<b>${tit}</b><small>${esc(o.resumen)}</small><small>${o.costo?'≈ '+plata(o.costo):'Gratis'}${o.pieM?` · ${km(o.pieM)} a pie`:''}</small></span><span class="op-m"><b>${Math.round(o.min)}</b> <span>min</span><small>${Math.round(o.dMin)} a ${Math.round(o.dMax)}</small></span></button>${sel?detalle(o):''}</article>`;
}
function detalle(o){
  const c=S.ctx,tot=o.pp.reduce((a,p)=>a+p.seg+(p.espera||0),0);
  const COLS={pie:'var(--tinta3)',espera:'var(--taxi)',bici:'var(--ok)',auto:'var(--tinta)'};
  const seg=[];o.pp.forEach(p=>{if(p.espera)seg.push(['espera',p.espera]);seg.push([p.t,p.seg,p]);});
  const colTramo=([t,,p])=>t==='bus'?'var(--bondi)':t==='subte'?T.meta.subteCol[p.linea]:COLS[t];
  const sumas={};seg.forEach(([t,s])=>sumas[t]=(sumas[t]||0)+s);
  const NOM={pie:'Caminando',espera:'Esperando',bus:'Arriba del colectivo',subte:'En el subte',bici:'Pedaleando',auto:'Viaje'};
  const bar=`<div><div class="barra" aria-hidden="true">${seg.map(s=>`<i style="flex:${s[1]} 0 0;background:${colTramo(s)}"></i>`).join('')}</div><div class="barra-ley">${Object.entries(sumas).map(([t,s])=>`<span>${NOM[t]} ${minutos(s)} min</span>`).join('')}</div></div>`;
  const sale=c.min,llega=sale+tot/60;
  const pierna=p=>{
    if(p.t==='pie'){if(p.len<25&&!p.trans)return '';return `<div class="pierna"><span class="n">${svg('pie')}</span><div><b>${p.ha?`Caminá hasta ${esc(p.ha)}`:'Caminá'}</b><small>${minutos(p.seg)} min · ${km(p.len)}</small>${p.pasos&&p.pasos.length>1?`<ul class="pasos">${p.pasos.slice(0,9).map(q=>`<li><span>${esc(q.t)}</span><span>${q.d}</span></li>`).join('')}</ul>`:''}</div></div>`;}
    if(p.t==='bus'||p.t==='subte'){const hacia=limpioH(p.hacia);return `<div class="pierna ${p.t}" style="--c:${p.t==='subte'?T.meta.subteCol[p.linea]:'var(--bondi)'}"><span class="n">${chipLinea(p)}</span><div><b>${p.t==='subte'?'Subte línea ':'Tomá el '}${esc(p.linea)}${hacia?` hacia ${esc(hacia)}`:''}</b><small>Subí en ${esc(p.sube)}. Pasa cada ${p.hw} min.</small><small>Bajá en ${esc(p.baja)}: ${p.paradas} ${p.paradas===1?'parada':'paradas'}, ${minutos(p.seg)} min.</small></div></div>`;}
    return `<div class="pierna"><span class="n">${svg(ICT[p.t])}</span><div><b>${o.titulo}</b><small>${minutos(p.seg)} min · ${km(p.len)}</small><ul class="pasos">${p.pasos.slice(0,11).map(q=>`<li><span>${esc(q.t)}</span><span>${q.d}</span></li>`).join('')}</ul></div></div>`;
  };
  const hayBondi=o.pp.some(p=>p.t==='bus');
  return `<div class="op-det">
    <p><b>Salís ${hhmm(sale)}, llegás ${hhmm(llega)}.</b></p>${bar}
    ${o.tipo==='pie'?variantesHtml():''}
    <div class="linea-tiempo">${o.pp.map(pierna).join('')}</div>
    ${hayBondi?`<button class="btn sec2" data-a="alerta-bajar">${svg('campana')}${A.activa?'Aviso de bajada prendido':'Avisame cuando tenga que bajar'}</button>`:''}
    ${notaDepende(o)}${notaAtajos(o)}${notaCompanero(o)}${notaCerca()}
    <div class="fila"><a class="btn pri" target="_blank" rel="noopener" href="${gm(o)}">${svg('mapa')}Abrir en Google Maps</a><button class="btn sec2" data-a="mandar">${svg('enviar')}Mandar a alguien</button><a class="btn sec2" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(textoViaje(o))}">WhatsApp</a></div>
    <button class="btn sec2 chico" data-a="salgo">Avisar al grupo que salgo</button>
  </div>`;
}
function gm(o){const m={pie:'walking',bici:'bicycling',auto:'driving',bus:'transit',subte:'transit'}[o.tipo];
  const f=(p)=>`${alat(p.y).toFixed(6)},${alon(p.x).toFixed(6)}`;return `https://www.google.com/maps/dir/?api=1&origin=${f(S.desde)}&destination=${f(S.dest)}&travelmode=${m}`;}
function textoViaje(o){const l=o.pp.filter(p=>p.linea).map(p=>`${p.t==='subte'?'subte ':''}${p.linea} en ${p.sube}`).join(', luego ');
  return `Voy a ${S.dest.nombre}: ${Math.round(o.min)} min${l?' en '+l:' '+o.titulo.toLowerCase()}. Salgo ${hhmm(S.ctx.min)}.`;}
function variantesHtml(){
  if(!S.varPie){traerVariantes();return '';}
  const base=S.varPie[0];if(!base)return '';
  const u=[];S.varPie.forEach(v=>{if(!u.some(q=>Math.abs(q.len-v.len)<25&&Math.abs(q.av-v.av)<60))u.push(v);});
  if(u.length<2)return `<div class="nota"><h3>Por dónde es más corto</h3><p>Esta es la opción más corta y no hay otra que cambie mucho el camino.</p></div>`;
  return `<div class="pila" style="gap:8px"><h3 style="font-size:17px">Por dónde ir</h3>${u.map(v=>`<button class="var" aria-pressed="${(S.varSel||'pie')===v.id}" data-a="var" data-v="${v.id}"><span class="q"><b>${v.nom}</b><small>${v.des}</small></span><span class="v">${Math.round(v.seg/60)} min<br><small>${v===base?km(v.len):'+'+Math.max(0,Math.round((v.len-base.len)/115))+' cuadras'}</small></span></button>`).join('')}</div>`;
}
let pidiendoVar=null;
function traerVariantes(){
  const yoS=sesion,clave=S.plan,o=S.desde,d=S.dest;if(pidiendoVar===clave)return;pidiendoVar=clave;
  enMotor('variantesPie',{x:o.x,y:o.y},{x:d.x,y:d.y},S.ctx).then(v=>{if(yoS!==sesion||S.plan!==clave)return;S.varPie=v;render();dibujarOpcion(false);}).catch(()=>{});
}
function notaDepende(o){
  const c=S.ctx,r=[],f=franja(c),pie=S.plan.ops.find(x=>x.tipo==='pie'),trans=o.pp.filter(p=>p.linea);
  if(o.tipo==='bus'||o.tipo==='subte'){
    const p=trans[0];
    r.push(`Cuánto tarde en pasar: en el mejor caso llegás en ${Math.round(o.dMin)} min, y si recién se fue, en ${Math.round(o.dMax)}.`);
    if(o.tipo==='bus'&&(f==='am'||f==='pm')){const ride=trans.reduce((a,q)=>a+q.seg,0),val=ride*(VBUS[f]/VBUS.val);if(ride-val>90)r.push(`Es ${FRANJA[f]}: el tránsito te suma unos ${Math.round((ride-val)/60)} min comparado con el mediodía.`);}
    if(pie&&pie.min<75){const marg=(pie.min*60-(o.min*60-(p.espera||0)))/60;if(marg>=2&&marg<60)r.push(`Si el ${p.linea} no aparece en ${Math.round(marg)} min, ya te conviene caminar.`);}
    if(o.tipo==='subte'){const a={hab:'23:30',sab:'24:00',dom:'22:30'}[c.dia];r.push(`El subte funciona hasta cerca de las ${a}.`);}
  }
  if(o.tipo==='pie'){if(c.lluvia)r.push('Con lluvia ya sumé el paso más lento y paradas más cerca.');else if(o.min>25)r.push(`Son ${Math.round(o.min)} min parejos: acá casi no influye la hora.`);}
  if(o.tipo==='auto'){r.push(`Es ${FRANJA[f]}: puede ir de ${Math.round(o.dMin)} a ${Math.round(o.dMax)} min según el tránsito.`);r.push('El recorrido no tiene en cuenta las manos de las calles: Google Maps lo ajusta.');r.push('El precio es un cálculo con tarifa de taxi. Uber o Cabify cambian según la demanda.');}
  if(o.tipo==='bici')r.push('Elegí calles antes que avenidas. Prendé la capa Ciclovías para verlas en el mapa.');
  if(!r.length)return '';
  return `<div class="nota"><h3>De qué depende</h3><ul>${r.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`;
}
function notaAtajos(o){
  const r=[];
  if(o.otras&&o.otras.length){
    const b=o.pp.find(p=>p.linea),mismo=o.otras.filter(q=>nomParada(T.pats[q.pi].s[q.bi])===b.sube);
    if(mismo.length)r.push(`En la misma parada también te sirven: ${mismo.slice(0,5).map(q=>`<span class="ln">${esc(q.l)}</span>`).join(' ')}. Tomá el primero que venga.`);
    const otro=o.otras.filter(q=>!mismo.includes(q)&&q.v/60<=o.min+8).sort((x,y)=>x.hw-y.hw)[0];
    if(otro)r.push(`Si caminás ${minutos(otro.pieO)} min hasta ${esc(nomParada(T.pats[otro.pi].s[otro.bi]))} tenés el <span class="ln">${esc(otro.l)}</span>, que pasa cada ${Math.round(otro.hw)} min. Llegás en unos ${minutos(otro.v)} min.`);
  }
  o.pp.forEach(p=>(p.tramos||[]).filter(t=>t.cl===2||t.cl===3).forEach(t=>{if(t.nom&&t.len>50)r.push(`Cortás camino por ${esc(t.nom)}.`);}));
  const ruta=o.pp.flatMap(p=>Array.from(p.pts));
  (API.aportes||[]).filter(a=>a.tipo==='atajo'&&a.lat!=null).map(a=>({...a,x:wx(a.lon),y:wy(a.lat)})).forEach(a=>{for(let i=0;i<ruta.length;i+=8){if(Math.hypot(ruta[i]-a.x,ruta[i+1]-a.y)<280){r.push(`<b>${esc(a.titulo)}</b>${a.nota?`: ${esc(a.nota)}`:''}`);break;}}});
  if(!r.length)return '';
  return `<div class="nota"><h3>Atajos</h3><ul>${r.slice(0,6).map(x=>`<li>${x}</li>`).join('')}</ul></div>`;
}
function notaCompanero(o){
  const ruta=o.pp.flatMap(p=>Array.from(p.pts)),l=[];
  conCasa().forEach(p=>{if(p.id===API.yoId||S.dest.k===p.k)return;let b=1e9;for(let i=0;i<ruta.length;i+=2)b=Math.min(b,Math.hypot(ruta[i]-p.x,ruta[i+1]-p.y));if(b<260)l.push({p,c:Math.max(1,Math.round(b/115))});});
  if(!l.length)return '';l.sort((a,b)=>a.c-b.c);
  return `<div class="nota"><h3>Te quedan de paso</h3><p>${l.slice(0,4).map(q=>`${esc(q.p.nombre)} (a ${q.c} ${q.c===1?'cuadra':'cuadras'} del recorrido)`).join(', ')}. Pasalos a buscar.</p></div>`;
}
function notaCerca(){
  const d=S.dest,k=[['f','Farmacia'],['a','Cajero'],['c','Café notable']],o=[];
  for(const [cat,n] of k){let b=null,bd=1e9;for(const q of L.pois){if(q.c!==cat)continue;const e=Math.hypot(q.wx-d.x,q.wy-d.y);if(e<bd){bd=e;b=q;}}if(b&&bd<650)o.push(`${n}: ${esc(b.n)}, a ${cuadras(bd*1.25)}`);}
  if(!o.length)return '';return `<div class="nota"><h3>Cerca de donde llegás</h3><ul>${o.map(x=>`<li>${x}</li>`).join('')}</ul></div>`;
}

/* ───── helpers de distancia ───── */
let MA={k:null,v:null,p:null};
function minutosAmigos(){
  const o=S.desde,k=`${o.x|0}|${o.y|0}`;if(MA.k===k)return MA.v;
  if(!hayDatos()||MA.p===k)return null;MA.p=k;const yoS=sesion;
  enMotor('minutosPie',{x:o.x,y:o.y},conCasa().filter(p=>p.id!==API.yoId).map(p=>({id:p.id,x:p.x,y:p.y}))).then(v=>{
    if(yoS!==sesion)return;MA={k,v,p:null};if(S.tab==='ir'&&!S.dest&&!S.buscando&&!S.herr&&!S.filtro)render();
  }).catch(()=>{MA.p=null;});
  return null;
}
function dijkstraDesde(p){const c=`pie|${p.x|0}|${p.y|0}`;if(CACHE.has(c))return CACHE.get(c);const W=perfil('pie',{dia:'hab',min:720}),r=dijkstra(semillas(p,W,cl=>cl!==4).sem,W);if(CACHE.size>=6)CACHE.delete(CACHE.keys().next().value);CACHE.set(c,r);return r;}
function minPie(r,p){const {sem}=semillas(p,r.W,cl=>cl!==4);if(!sem.length)return 99;return minutos(Math.min(r.dist[sem[0].n]+sem[0].c,r.dist[sem[1].n]+sem[1].c));}
let turnoViaje=0;
async function viajar(){
  const t=++turnoViaje,yoS=sesion,o=S.desde,d=S.dest,c=S.ctx;
  S.plan=null;S.varPie=null;S.varSel=null;dibRuta=[{pts:[],fin:[d.x,d.y]}];pedir();
  let plan=null;
  try{plan=await enMotor('planificar',{x:o.x,y:o.y,nombre:o.nombre},{x:d.x,y:d.y,nombre:d.nombre},c);}
  catch{if(t===turnoViaje&&yoS===sesion){S.datos=hayDatos()?'listo':'error';S.plan={ops:[]};render();}return;}
  if(t!==turnoViaje||yoS!==sesion||S.dest!==d)return;
  S.plan=plan;
  const ops=S.plan.ops,ok=ops.filter(q=>q.tipo!=='auto'&&(M.bici||q.tipo!=='bici')).sort((a,b)=>(a.min+a.costo/260)-(b.min+b.costo/260))[0]||ops[0];
  ops.forEach(q=>{if(q.marca==='Más rápido'&&(q.tipo==='auto'||q.tipo==='bici'&&!M.bici)&&ok!==q)q.marca=q.tipo==='auto'?'Más rápido':'Más rápido en bici';});
  if(ok){ok.marca='Te conviene';ops.splice(ops.indexOf(ok),1);ops.unshift(ok);S.sel=0;}
  /* colectivo que tarda más que caminar: no suma */
  const pie=ops.find(q=>q.tipo==='pie');
  if(pie&&!S.ctx.lluvia){const f=ops.filter(q=>!((q.tipo==='bus'||q.tipo==='subte')&&q.min>pie.min+1));if(f.length!==ops.length){const s=ops[S.sel];S.plan.ops=f;S.sel=Math.max(0,f.indexOf(s));if(f.indexOf(s)<0&&f.includes(pie)){pie.marca='Te conviene';S.sel=f.indexOf(pie);}}}
  render();dibujarOpcion(true);
}
function dibujarOpcion(fit){
  const o=S.plan&&S.plan.ops[S.sel];dibRuta=[];if(!o){pedir();return;}
  const alt=S.varPie&&o.tipo==='pie'?S.varPie.filter(v=>v.id!==(S.varSel||'pie')):[];
  alt.forEach(v=>dibRuta.push({pts:v.pts,alt:1}));
  const elegido=S.varPie&&o.tipo==='pie'&&S.varSel?S.varPie.find(v=>v.id===S.varSel):null;
  (elegido?[{t:'pie',pts:elegido.pts}]:o.pp).forEach(p=>{
    const col=p.t==='bus'?COL.bondi:p.t==='subte'?T.meta.subteCol[p.linea]:COL.tinta;
    dibRuta.push({pts:p.pts,col,ancho:p.t==='pie'?4:6,punteado:p.t==='pie'});
  });
  dibRuta.push({pts:[],fin:[S.dest.x,S.dest.y]});
  if(fit)encuadrar(o.pp.flatMap(p=>Array.from(p.pts)));else pedir();
}

/* ───── Cerca ───── */
const CATS=[['amigos','Amigos','junta'],['paradas','Colectivos','bus'],['subte','Subte','subte'],['super','Súper y chinos','super'],['f','Farmacias','farma'],['a','Cajeros','atm'],['cafeteria','Cafés','cafe'],['lavadero','Lavaderos','lavadero'],['gym','Gimnasios','gym'],['fotocopias','Fotocopias','copia'],['c','Bares notables','cafe'],['guia','De la guía','guardar'],['plazas','Plazas','plaza'],['h','Hospitales','hosp'],['grupo','Del grupo','guardar']];
const LIVE={super:'nwr[shop~"^(supermarket|convenience)$"]',cafeteria:'nwr[amenity=cafe]',lavadero:'nwr[shop=laundry]',gym:'nwr[leisure=fitness_centre]',fotocopias:'nwr[shop=copyshop]'};
const CACHE_VIVO=new Map();
function cercaEnVivo(cat,de,r,fila){
  const c=`${cat}|${Math.round(de.x/250)}|${Math.round(de.y/250)}`,v=CACHE_VIVO.get(c);
  if(!v){CACHE_VIVO.set(c,{cargando:1});
    const la=alat(de.y),lo=alon(de.x),q=`[out:json][timeout:12];${LIVE[cat]}(around:900,${la.toFixed(5)},${lo.toFixed(5)});out center 40;`;
    fetch('https://overpass-api.de/api/interpreter',{method:'POST',body:'data='+encodeURIComponent(q)}).then(x=>x.json()).then(j=>{
      CACHE_VIVO.set(c,{l:j.elements.map(e=>({n:e.tags&&(e.tags.name||e.tags.brand),la:e.lat??e.center?.lat,lo:e.lon??e.center?.lon,dir:[e.tags?.['addr:street'],e.tags?.['addr:housenumber']].filter(Boolean).join(' '),h:e.tags?.opening_hours||''})).filter(e=>e.n&&e.la)});
      if(S.cat===cat&&API)render();
    }).catch(()=>{CACHE_VIVO.delete(c);CACHE_VIVO.set(c+'!',1);if(S.cat===cat&&API)render();});
    return '<p class="vacio">Buscando en OpenStreetMap…</p>';}
  if(v.cargando)return '<p class="vacio">Buscando en OpenStreetMap…</p>';
  if(!v.l.length)return '<p class="vacio">No encontré nada a menos de 900 metros.</p>';
  const it=v.l.map(e=>{const pl={nombre:e.n,x:wx(e.lo),y:wy(e.la),tipo:'poi',sub:e.dir,h:e.h};return {pl,m:minPie(r,pl)};}).sort((a,b)=>a.m-b.m).slice(0,15);
  return `<div class="lista">${it.map(({pl,m})=>{S.cercaRes.marcas.push({...pl,k:reg(pl)});return fila('ir',pl.nombre,pl.sub||'',m,pl.k);}).join('')}</div><p class="expl">Datos de OpenStreetMap, cargados por vecinos. Puede faltar algún local.</p>`;
}
function sinOrigen(){return `<h2 class="titulo">¿Desde dónde salís?</h2><p class="expl">Todavía no cargaste tu casa. Podés hacerlo en tu perfil, o usar tu ubicación ahora.</p><button class="btn pri" data-a="gps-origen">Usar donde estoy ahora</button><a class="btn sec2" href="/perfil">Cargar mi casa</a>`;}
function vistaCerca(){
  const me=yo();if(!S.cercaDe&&S.desde)S.cercaDe=S.desde;if(!S.cercaDe&&me&&me.x!=null)S.cercaDe=casaPlace(me);
  if(!S.cercaDe)return sinOrigen();
  if(!hayDatos())return avisoDatos();
  const de=S.cercaDe;
  const r=S.cat?resultadosCerca(S.cat,de):null;
  return `<h2 class="titulo">Qué hay cerca de ${esc(de.nombre==='Tu casa'?'tu casa':de.nombre)}</h2>
  <p class="expl">Elegí qué buscás. Lo ordeno por minutos caminando de verdad, por las calles.</p>
  <div class="fila">${de.nombre!=='Tu casa'?`<button class="btn sec2 chico" data-a="cerca-yo">Volver a mi casa</button>`:''}<button class="btn sec2 chico" data-a="cerca-aca">Cerca de lo que estoy viendo</button></div>
  <div class="chipera">${CATS.map(([id,n])=>`<button class="chip" aria-pressed="${S.cat===id}" data-a="cat" data-c="${id}">${n}</button>`).join('')}</div>
  ${r?`<div id="m-res-cerca" class="pila">${r}</div>`:`<div class="lista">${CATS.slice(0,3).map(([id,n,ic])=>`<button class="item" data-a="cat" data-c="${id}"><span class="ic">${svg(ic)}</span><span class="q"><b>${n}</b><small>${{amigos:'Quién vive más cerca',paradas:'Qué líneas tenés a mano',subte:'Las estaciones a las que llegás a pie'}[id]}</small></span></button>`).join('')}</div>`}`;
}
function resultadosCerca(cat,de){
  const r=dijkstraDesde(de);S.cercaRes={marcas:[]};
  const fila=(ic,n,sub,m,k,extra='')=>`<button class="item" data-a="ver" data-k="${esc(k)}"><span class="ic">${svg(ic)}</span><span class="q"><b>${esc(n)}</b><small>${esc(sub)}</small>${extra}</span><span class="v">${m}<small>min</small></span></button>`;
  if(cat==='amigos'){const l=conCasa().filter(p=>p.id!==API.yoId).map(p=>({p,m:minPie(r,p)})).sort((a,b)=>a.m-b.m);
    return `<div class="lista">${l.map(({p,m})=>`<button class="item" data-a="ver" data-k="${esc(reg(casaPlace(p)))}">${avatar(p)}<span class="q"><b>${esc(p.nombre)}</b><small>${esc(p.barrio)}</small></span><span class="v">${m}<small>min</small></span></button>`).join('')}</div>`;}
  if(cat==='paradas'){
    const ctx=S.ctx,lim=9*60,mej=new Map();
    for(let s=0;s<T.S;s++){const n=T.sn[s];if(n<0||T.lin[s]!=null)continue;if(Math.abs(T.sx[s]-de.x)>900||Math.abs(T.sy[s]-de.y)>900)continue;const t=r.dist[n];if(t>lim)continue;
      const li=T.por[s];for(let i=0;i<li.length;i+=2){const p=T.pats[li[i]];if(p.sub)continue;const h=frecuencia(p.l,ctx);const key=p.l;const o=mej.get(key);if(!o||t<o.t)mej.set(key,{t,s,p,pi:li[i],h});}}
    const l=[...mej.values()].sort((a,b)=>a.t-b.t).slice(0,24);
    if(!l.length)return '<p class="vacio">No hay paradas a menos de 9 minutos.</p>';
    return `<p class="expl">${mej.size} líneas a menos de 9 min caminando. Tocá una para ver el recorrido.</p><div class="lista">${l.map(q=>`<button class="item" data-a="linea" data-i="${q.pi}"><span class="ln">${esc(q.p.l)}</span><span class="q"><b style="font-size:16px">${esc(nomParada(q.s))}</b><small>${q.h?`Pasa cada ${q.h} min`:'No pasa a esta hora'}</small></span><span class="v">${minutos(q.t)}<small>min</small></span></button>`).join('')}</div>`;}
  if(cat==='subte'){const l=[];for(const s of CAPAS.est){const t=r.dist[T.sn[s]];if(t<25*60)l.push({s,t});}l.sort((a,b)=>a.t-b.t);const u=l.slice(0,10);
    return `<div class="lista">${u.map(q=>{const li=T.lin[q.s];const pl={nombre:T.nom[q.s],x:T.sx[q.s],y:T.sy[q.s],tipo:'est'};return `<button class="item" data-a="ver" data-k="${esc(reg(pl))}"><span class="ln sub ${li==='H'?'subH':''}" style="background:${T.meta.subteCol[li]}">${li}</span><span class="q"><b>${esc(T.nom[q.s].replace('Est. ',''))}</b><small>Línea ${li}, cada ${subteFrec(li,S.ctx)} min</small></span><span class="v">${minutos(q.t)}<small>min</small></span></button>`;}).join('')}</div>`;}
  if(cat==='plazas'){const l=L.parks.filter(q=>q.n&&Math.hypot(q.x-de.x,q.y-de.y)<1800).map(q=>({q,m:minPie(r,q)})).sort((a,b)=>a.m-b.m).slice(0,12);
    if(!l.length)return '<p class="vacio">No encontré plazas cerca.</p>';
    return `<div class="lista">${l.map(({q,m})=>{const pl={nombre:q.n,x:q.x,y:q.y,tipo:'plaza'};S.cercaRes.marcas.push({...pl,k:reg(pl)});return fila('plaza',q.n,`${(q.area/10000).toFixed(1).replace('.',',')} hectáreas`,m,pl.k);}).join('')}</div>`;}
  if(LIVE[cat]){if(CACHE_VIVO.has(`${cat}|${Math.round(de.x/250)}|${Math.round(de.y/250)}!`)){CACHE_VIVO.delete(`${cat}|${Math.round(de.x/250)}|${Math.round(de.y/250)}!`);return '<p class="vacio">No pude buscar ahora. Probá de nuevo en un rato.</p>';}return cercaEnVivo(cat,de,r,fila);}
  if(cat==='guia'){const it=(API.guia||[]).filter(q=>q.lat!=null).map(q=>{const pl={nombre:q.titulo,x:wx(q.lon),y:wy(q.lat),tipo:'poi',sub:q.dato||q.bajada||''};return {pl};}).filter(q=>Math.hypot(q.pl.x-de.x,q.pl.y-de.y)<2500).map(q=>({...q,m:minPie(r,q.pl)})).sort((a,b)=>a.m-b.m).slice(0,15);if(!it.length)return '<p class="vacio">No hay datos de la guía cerca de acá.</p>';return `<div class="lista">${it.map(({pl,m})=>{S.cercaRes.marcas.push({...pl,k:reg(pl)});return fila('idea',pl.nombre,pl.sub,m,pl.k);}).join('')}</div>`;}
  if(cat==='grupo'){const a=(API.aportes||[]).filter(a=>a.tipo==='lugar'&&a.lat!=null);if(!a.length)return `<div class="vacio">Todavía nadie sumó lugares. Se agregan desde Gente.</div>`;
    return `<div class="lista">${a.map(q=>{const pl={nombre:q.titulo,x:wx(q.lon),y:wy(q.lat),tipo:'aporte',sub:q.nota};return fila('guardar',q.titulo,q.nota||'',minPie(r,pl),reg(pl));}).join('')}</div>`;}
  const IC2={f:'farma',a:'atm',c:'cafe',h:'hosp'},lim=cat==='h'?6000:cat==='c'?3500:1500,l=L.pois.filter(q=>q.c===cat&&Math.hypot(q.wx-de.x,q.wy-de.y)<lim).sort((a,b)=>Math.hypot(a.wx-de.x,a.wy-de.y)-Math.hypot(b.wx-de.x,b.wy-de.y)).slice(0,12);
  if(!l.length)return '<p class="vacio">No encontré nada cerca.</p>';
  const it=l.map(q=>{const pl={nombre:q.n,x:q.wx,y:q.wy,tipo:'poi',sub:q.d};return {q,pl,m:minPie(r,pl)};}).sort((a,b)=>a.m-b.m);
  return `<div class="lista">${it.map(({q,pl,m})=>{S.cercaRes.marcas.push({...pl,k:reg(pl)});return fila(IC2[cat],q.n,q.d,m,pl.k);}).join('')}</div>${cat==='a'?'<p class="expl">Listado de cajeros de un relevamiento anterior: pueden haber cambiado.</p>':''}`;
}

/* ───── Juntada ───── */
function vistaJunta(){
  const J=S.junta;if(!J.quien)J.quien=new Set(conCasa().map(p=>p.id));
  const elegidos=conCasa().filter(p=>J.quien.has(p.id));
  return `<h2 class="titulo">¿Dónde nos juntamos?</h2>
  <p class="expl">Marcá quiénes van. Busco la casa o el lugar donde el viaje sale más parejo para todos.</p>
  ${chipsCtx()}
  <div class="chipera">${conCasa().map(p=>`<button class="chip" aria-pressed="${J.quien.has(p.id)}" data-a="junta-p" data-id="${esc(p.id)}">${esc(p.nombre)}</button>`).join('')}</div>
  <button class="btn pri" data-a="junta-calc" ${J.calculando?'disabled':''}>${J.calculando?'Calculando…':`Buscar el mejor lugar para ${elegidos.length}`}</button>
  <button class="btn sec2" data-a="herr-medio">${svg('medio')}Punto medio entre dos lugares</button>
  <div id="m-junta-res">${J.res?resJunta():''}</div>`;
}
async function calcJunta(){
  const J=S.junta,g=conCasa().filter(p=>J.quien.has(p.id));if(g.length<2){aviso('Elegí por lo menos dos personas.');return;}
  const ctx=S.ctx,cx0=g.reduce((a,p)=>a+p.x,0)/g.length,cy0=g.reduce((a,p)=>a+p.y,0)/g.length,yoS=sesion;
  const cerca=(a,fx,fy,n)=>a.slice().sort((p,q)=>Math.hypot(fx(p)-cx0,fy(p)-cy0)-Math.hypot(fx(q)-cx0,fy(q)-cy0)).slice(0,n);
  const cand=g.map(p=>({k:p.k,nombre:p.id===API.yoId?'Tu casa':`Casa de ${p.nombre}`,x:p.x,y:p.y,tipo:'persona',sub:p.barrio,casa:p.id}));
  cerca(L.pois.filter(q=>q.c==='c'),q=>q.wx,q=>q.wy,3).forEach(q=>cand.push({nombre:q.n,x:q.wx,y:q.wy,sub:`Café notable · ${q.d}`,tipo:'poi'}));
  cerca(L.parks.filter(p=>p.n&&p.area>8000),q=>q.x,q=>q.y,2).forEach(q=>cand.push({nombre:q.n,x:q.x,y:q.y,sub:'Plaza',tipo:'plaza'}));
  cerca(L.places.filter(q=>q.k==='p'),q=>q.wx,q=>q.wy,2).forEach(q=>cand.push({k:q.place.k,nombre:q.place.nombre,x:q.place.x,y:q.place.y,tipo:'lugar',sub:q.d}));
  J.calculando=true;render();
  let res=null;
  try{res=await enMotor('juntaCalc',g.map(p=>({id:p.id,x:p.x,y:p.y})),cand,ctx);}catch{aviso('No pude calcularlo ahora.');}
  if(yoS!==sesion)return;
  J.calculando=false;
  if(res){J.res=res.map(x=>({...x,t:x.t.map(q=>({...q,p:g.find(u=>u.id===q.id)}))}));J.elegido=0;dibujarJunta();}
  render();const x=$('junta-res');if(x)$('panel').scrollTop=x.offsetTop-$('panel').offsetTop-8;
}
function resJunta(){
  const J=S.junta,r=J.res[J.elegido];
  return `<div class="pila"><h3 class="sec">Los mejores</h3><div class="lista">${J.res.map((x,i)=>`<button class="item" data-a="junta-sel" data-i="${i}" style="${i===J.elegido?'background:var(--suelo)':''}"><span class="ic">${svg(x.c.casa?'casa':x.c.tipo==='plaza'?'plaza':x.c.tipo==='poi'?'cafe':'lugar')}</span><span class="q"><b>${esc(x.c.nombre)}</b><small>${esc(x.c.sub||'')}</small><small>Promedio ${minutos(x.prom)} min. El que más tarda: ${minutos(x.max)}.</small></span></button>`).join('')}</div>
  <h3 class="sec">Cuánto tarda cada uno</h3>
  <div>${r.t.map(x=>barra(x.p,x.seg,r.max,x.modo)).join('')}</div>
  <a class="btn pri" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(textoJunta(r))}">${svg('enviar')}Proponer por WhatsApp</a>
  <button class="btn sec2 chico" data-a="ir" data-k="${esc(reg(r.c))}">Ver cómo llego yo</button><button class="btn sec2 chico" data-a="proponer">Proponerla en la app</button></div>`;
}
const barra=(p,seg,max,modo)=>`<div class="bar-fila ${p.id===API.yoId?'yo':''}" title="${esc(modo||'')}"><span>${esc(p.nombre)}</span><span class="b"><i style="width:${max?Math.max(2,seg/max*100):2}%"></i></span><em>${seg?minutos(seg)+' min':'casa'}</em></div>`;
function textoJunta(r){return `¿Nos juntamos en ${r.c.nombre}? Es lo que queda más parejo para todos.\n${r.t.map(x=>`${x.p.nombre}: ${x.seg?minutos(x.seg)+' min':'es su casa'}`).join('\n')}`;}
function dibujarJunta(){
  const J=S.junta;dibRuta=[];if(!J.res)return;const r=J.res[J.elegido];
  r.t.forEach(x=>{if(x.seg)dibRuta.push({pts:[x.p.x,x.p.y,r.c.x,r.c.y],alt:1});});
  dibRuta.push({pts:[],fin:[r.c.x,r.c.y]});
  encuadrar([...r.t.flatMap(x=>[x.p.x,x.p.y]),r.c.x,r.c.y]);
}

/* ───── Ubicación: flecha, seguir y rumbo ───── */
const U={modo:0,pos:null,off:null,primera:true};
const enCiudad=(la,lo)=>Math.abs(la+34.6)<=.2&&Math.abs(lo+58.44)<=.25;
function alPos(p){
  U.pos=p;pintarYo();
  if(!mapa)return;
  if(!enCiudad(p.lat,p.lon)){if(U.primera){U.primera=false;aviso('Estás fuera de la Ciudad: el mapa cubre Buenos Aires.');}return;}
  if(U.primera){U.primera=false;irA(wx(p.lon),wy(p.lat),Math.max(aEscala(),.5));}
  else if(U.modo===2&&!quieto())mapa.easeTo({center:[p.lon,p.lat],bearing:p.rumbo??mapa.getBearing(),zoom:Math.max(mapa.getZoom(),16),offset:desplazo(),duration:900,easing:t=>t});
}
function modoGps(n){
  U.modo=n;
  if(n===0){if(U.off)U.off();U.off=null;U.pos=null;U.primera=true;pedir();mapa?.easeTo({bearing:0,duration:quieto()?0:400});}
  else if(!U.off){
    U.primera=true;pedir();
    U.off=escucharUbicacion(alPos,()=>{aviso('No pude ver tu ubicación. Revisá el permiso del navegador.');modoGps(0);});
  }
  if(n===2)pedirBrujula();
  pintarVistas();
}
function pintarYo(){
  if(!mapa||!estiloListo)return;
  const p=U.pos;if(!p){poner('yo',fc([]),'0');return;}
  const mpp=78271.5*Math.cos(p.lat*Math.PI/180)/Math.pow(2,mapa.getZoom()),rp=Math.min(140,Math.round((p.prec||0)/mpp));
  const r=p.rumbo!=null?Math.round(p.rumbo):0;
  poner('yo',fc([{type:'Feature',properties:{ic:`yo|${p.rumbo!=null?1:0}`,rumbo:r,rp},geometry:{type:'Point',coordinates:[p.lon,p.lat]}}]),`${p.lat.toFixed(5)}|${p.lon.toFixed(5)}|${r}|${rp}`);
}

/* ───── Aviso para bajarse del bondi ───── */
const A={activa:false,off:null,nom:'',x:0,y:0,previo:false};
function pararAlerta(){if(A.off)A.off();A.off=null;A.activa=false;pill('bajar','');}
function alertaBajar(){
  if(A.activa){pararAlerta();render();return;}
  const o=S.plan?.ops[S.sel],p=o&&[...o.pp].reverse().find(q=>q.t==='bus');if(!p)return;
  const s=T.pats[p.pi].s[p.ai];
  Object.assign(A,{activa:true,nom:p.baja,x:T.sx[s],y:T.sy[s],previo:false});
  try{if('Notification' in window&&Notification.permission==='default')Notification.requestPermission();}catch{/* sigue con el aviso en pantalla */}
  A.off=escucharUbicacion(q=>{
    const d=Math.hypot(wx(q.lon)-A.x,wy(q.lat)-A.y);
    if(d<320){pill('bajar',`Bajá ahora: ${A.nom}`,{a:'bajar-ok',n:'Listo'});avisoFuerte(`Bajá ahora: ${A.nom}`);if(A.off)A.off();A.off=null;A.activa=false;}
    else if(d<750&&!A.previo){A.previo=true;pill('bajar',`Ya casi: bajás en ${A.nom}`,{a:'bajar-ok',n:'Cancelar'});avisoFuerte(`Ya casi llegás a ${A.nom}`);}
  },()=>{pararAlerta();aviso('Sin ubicación no puedo avisarte. Revisá el permiso.');render();});
  pill('bajar',`Te aviso al llegar a ${A.nom}. Dejá la app abierta.`,{a:'bajar-ok',n:'Cancelar'});render();
}
function avisoFuerte(tx){
  try{navigator.vibrate&&navigator.vibrate([300,150,300]);}catch{/* no todos vibran */}
  try{if('Notification' in window&&Notification.permission==='granted')navigator.serviceWorker?.ready.then(r=>r.showNotification('Santa María',{body:tx,tag:'bajar',icon:'/iconos/192.png'})).catch(()=>{});}catch{/* queda el aviso en pantalla */}
}

/* ───── Medir ───── */
function pintarMedida(){
  if(!mapa||!estiloListo)return;
  const m=S.herr==='medir'?S.med:null,pm=S.herr==='medio'?S.pm:null,f=[];
  if(m){if(m.pts.length>1)f.push(linea(m.pts.flatMap(p=>[p.x,p.y]),{}));m.pts.forEach(p=>f.push(punto(p.x,p.y,{})));}
  if(pm){[pm.a,pm.b].filter(Boolean).forEach(p=>f.push(punto(p.x,p.y,{})));}
  poner('medir',fc(f));
}
const recta=l=>{let t=0;for(let i=1;i<l.length;i++)t+=Math.hypot(l[i].x-l[i-1].x,l[i].y-l[i-1].y);return t;};
function sumarMedida(x,y){
  S.med.pts.push({x,y});S.med.pie=null;pedir();render();calcularPie();
}
let turnoMed=0;
async function calcularPie(){
  const l=S.med?.pts||[];if(l.length<2||!hayDatos())return;
  const t=++turnoMed;let r=null;try{r=await enMotor('recorrido',l.map(p=>({x:p.x,y:p.y})));}catch{/* queda la distancia recta */}
  if(t!==turnoMed||!S.med||!r)return;S.med.pie=r;render();
}
function vistaMedir(){
  const m=S.med,n=m.pts.length;
  return `${cabHerr('Medir distancia')}
  ${n<2?`<p class="m-grande">${n?'Tocá otro punto del mapa':'Tocá un punto del mapa'}</p>`:`<div class="m-numeros"><div><b>${km(recta(m.pts))}</b><small>en línea recta</small></div>${m.pie?`<div><b>${km(m.pie.len)}</b><small>por la calle, ${minutos(m.pie.seg)} min a pie</small></div>`:''}</div>`}
  ${n?`<div class="fila"><button class="btn sec2 chico" data-a="med-atras">Sacar el último</button><button class="btn sec2 chico" data-a="med-limpiar">Empezar de nuevo</button></div>`:''}`;
}
const cabHerr=t=>`<div class="ruta-cab"><button class="ico-btn" data-a="herr-salir" aria-label="Volver">${svg('volver',2.4)}</button><div class="t">${esc(t)}</div></div>`;

/* ───── Punto medio ───── */
function elegirMedio(p){
  reg(p);const m=S.pm;
  if(!m.a)m.a=p;else if(!m.b)m.b=p;else{m.a=p;m.b=null;m.res=null;}
  m.res=null;pedir();render();
  if(m.a&&m.b)calcularMedio();
}
async function calcularMedio(){
  const m=S.pm,yoS=sesion;m.calc=true;render();let r=null;
  try{r=await enMotor('puntoMedio',{x:m.a.x,y:m.a.y},{x:m.b.x,y:m.b.y});}catch{aviso('No pude calcularlo ahora.');}
  if(yoS!==sesion||S.pm!==m)return;m.calc=false;
  if(!r){render();return;}
  m.res=r;m.lugar={nombre:esquinaDe(r.x,r.y)||'Punto medio',x:r.x,y:r.y,tipo:'punto',sub:'Punto medio a pie'};reg(m.lugar);
  dibRuta=[{pts:r.pts,col:COL.tinta,ancho:4,punteado:true},{pts:[],fin:[r.x,r.y]}];
  encuadrar(r.pts);render();
}
function vistaMedio(){
  const m=S.pm,cerca=(l,fx,fy,n)=>l.map(q=>({q,d:Math.hypot(fx(q)-m.res.x,fy(q)-m.res.y)})).sort((a,b)=>a.d-b.d).slice(0,n);
  const ch=conCasa().map(p=>`<button class="chip" data-a="medio-p" data-k="${esc(reg(casaPlace(p)))}" aria-pressed="${m.a?.k===p.k||m.b?.k===p.k}">${esc(p.nombre)}</button>`).join('');
  const lugares=m.res?[...cerca(L.pois.filter(q=>q.c==='c'),q=>q.wx,q=>q.wy,3).map(({q,d})=>({nombre:q.n,x:q.wx,y:q.wy,tipo:'poi',sub:q.d,d})),...cerca(L.parks.filter(q=>q.n),q=>q.x,q=>q.y,2).map(({q,d})=>({nombre:q.n,x:q.x,y:q.y,tipo:'plaza',sub:'Plaza',d}))].filter(q=>q.d<1500).sort((a,b)=>a.d-b.d):[];
  return `${cabHerr('Punto medio')}
  <p class="expl">Elegí dos lugares: tocá el mapa o elegí a alguien. Busco la mitad del camino a pie.</p>
  <div class="m-dos"><span class="${m.a?'':'vacio'}">${esc(m.a?.nombre||'Primer lugar')}</span><span class="${m.b?'':'vacio'}">${esc(m.b?.nombre||'Segundo lugar')}</span></div>
  <div class="chipera">${ch}</div>
  ${m.calc?'<div class="m-carga-fila"><i></i><span>Buscando la mitad del camino…</span></div>':''}
  ${m.res?`<div class="m-numeros"><div><b>${minutos(m.res.seg/2)} min</b><small>camina cada uno</small></div><div><b>${km(m.res.len)}</b><small>entre los dos</small></div></div>
  <button class="grande" data-a="ver" data-k="${esc(m.lugar.k)}">${svg('medio')}<span class="q"><b>${esc(m.lugar.nombre)}</b><small>La mitad exacta</small></span>${svg('flecha')}</button>
  ${lugares.length?`<h3 class="sec">Para juntarse cerca</h3><div class="lista">${lugares.map(q=>`<button class="item" data-a="ver" data-k="${esc(reg(q))}"><span class="ic">${svg(q.tipo==='plaza'?'plaza':'cafe')}</span><span class="q"><b>${esc(q.nombre)}</b><small>${esc(q.sub||'')}</small></span><span class="v">${km(q.d*1.25)}</span></button>`).join('')}</div>`:''}`:''}`;
}

/* ───── Filtros tipo ficha ───── */
const CACHE_F={k:'',l:[]};
function itemsFicha(){
  const f=ficha(S.filtro);if(!f)return [];
  const l=[];
  if(f.local&&hayDatos())for(const q of L.pois)if(q.c===f.local)l.push({n:q.n,d:q.d,x:q.wx,y:q.wy,h:''});
  if(f.osm)for(const q of lugaresOSM(f.id))l.push({n:q.n||'Baño público',d:q.d,x:wx(q.lo),y:wy(q.la),h:q.h});
  if(!S.soloAbierto)return l;
  const a=ahora();return l.filter(q=>estadoHorario(q.h,a.wd,a.min)?.abierto);
}
function pintarFichaEnMapa(){
  if(!mapa||!estiloListo)return;
  const f=S.filtro&&ficha(S.filtro);
  if(!f){poner('pois',fc([]),'0');return;}
  const l=itemsFicha(),sig=`${f.id}|${S.soloAbierto}|${l.length}`;if(SIG.pois===sig)return;
  for(const k of [...PTS.keys()])if(k[0]==='i')PTS.delete(k);
  const ic=`bg|${f.col}|${f.ic}`;
  poner('pois',fc(l.map((q,i)=>{PTS.set('i'+i,{nombre:q.n,x:q.x,y:q.y,tipo:'poi',sub:q.d,h:q.h});return punto(q.x,q.y,{id:'i'+i,ic});})),sig);
}
let tFicha=null;
async function actualizarFicha(){
  const f=S.filtro&&ficha(S.filtro);if(!f||!f.osm||!mapa)return;
  if(mapa.getZoom()<12.5){S.estadoFicha='lejos';if(!S.herr&&!S.buscando)render();return;}
  const b=mapa.getBounds(),dx=(b.getEast()-b.getWest())*.15,dy=(b.getNorth()-b.getSouth())*.15,c=[b.getWest()-dx,b.getSouth()-dy,b.getEast()+dx,b.getNorth()+dy];
  if(yaBuscado(f.id,[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()])){S.estadoFicha='';pintarFichaEnMapa();if(!S.herr&&!S.buscando)render();return;}
  if(ctrlOSM)ctrlOSM.abort();const ct=new AbortController(),yoS=sesion;ctrlOSM=ct;
  const tope=setTimeout(()=>ct.abort(),18000);
  S.estadoFicha='cargando';if(!S.herr&&!S.buscando)render();
  try{await traerOSM(f,c,ct.signal);if(yoS!==sesion||S.filtro!==f.id)return;S.estadoFicha='';}
  catch{if(yoS!==sesion||ctrlOSM!==ct||S.filtro!==f.id)return;S.estadoFicha='error';}
  finally{clearTimeout(tope);}
  pintarFichaEnMapa();if(!S.herr&&!S.buscando)render();
}
function vistaFicha(){
  const f=ficha(S.filtro),l=itemsFicha(),a=ahora();
  let c={x:0,y:0};if(mapa)c=centroVisible();
  const cerca=l.map(q=>({...q,dist:Math.hypot(q.x-c.x,q.y-c.y)})).sort((p,q)=>p.dist-q.dist).slice(0,12);
  S.fichaLista=cerca;
  const e=S.estadoFicha;
  return `<div class="ruta-cab"><div class="t">${esc(f.n)}<small>${l.length?`${l.length.toLocaleString('es-AR')} ${S.soloAbierto?'abiertos con horario cargado':'en esta zona'}`:''}</small></div><button class="ico-btn" data-a="ficha-fuera" aria-label="Sacar filtro">${svg('x',2.4)}</button></div>
  ${!hayDatos()&&f.local?avisoDatos():''}
  ${e==='cargando'?'<div class="m-carga-fila"><i></i><span>Buscando en OpenStreetMap…</span></div>':''}
  ${e==='lejos'?'<p class="expl">Acercá un poco el mapa para buscar en esta zona.</p>':''}
  ${e==='error'?'<div class="nota"><p>No pude buscar ahora.</p><button class="btn sec2 chico" data-a="ficha-otra">Probar de nuevo</button></div>':''}
  ${!l.length&&!e&&(hayDatos()||!f.local)?`<p class="vacio">${S.soloAbierto?'No encontré nada con horario cargado que esté abierto.':'No encontré nada en esta zona. Mové el mapa.'}</p>`:''}
  <div class="lista">${cerca.map((q,i)=>{const h=estadoHorario(q.h,a.wd,a.min);return `<button class="item" data-a="ver-f" data-i="${i}"><span class="ic" style="color:${f.col}">${svg(f.ic)}</span><span class="q"><b>${esc(q.n)}</b><small>${esc(q.d||'')}</small>${h?`<small class="${h.abierto?'m-abre':'m-cierra'}">${h.abierto?`Abierto${h.hasta?`, hasta ${h.hasta}`:''}`:'Cerrado'}</small>`:''}</span><span class="v">${km(q.dist*1.25)}</span></button>`;}).join('')}</div>
  ${f.nota?`<p class="expl">${esc(f.nota)}</p>`:''}${f.osm?'<p class="expl">Datos de OpenStreetMap, cargados por vecinos. Puede faltar algún lugar, y no todos tienen horario.</p>':''}`;
}

/* ───── Buscador único ───── */
let tBusca=null,indiceSucio=true;
function asegurarIndice(){
  if(!hayDatos()||(!indiceSucio&&indiceListo()))return;indiceSucio=false;
  armarIndice({personas:conCasa().map(p=>({...p,sub:p.barrio})),lugares:L.places.map(q=>q.place),guia:API.guia});
}
function abrirBusqueda(){if(S.buscando)return;S.buscando=true;abrirHoja(0);render();}
function cerrarBusqueda(){S.buscando=false;S.res=null;const i=$('buscar');if(i){i.value='';i.blur();}S.buscar='';pintarBorrar();render();}
function pintarBorrar(){const b=$('q-x');if(b)b.hidden=!S.buscar;}
function vistaBusqueda(){
  const q=S.buscar.trim();
  if(q.length<2){
    const rec=[...new Set(M.recientes.map(k=>REG.get(k)).filter(Boolean))].slice(0,5);
    return `${!hayDatos()?avisoDatos():''}${rec.length?`<h3 class="sec">Lo último</h3><div class="lista">${rec.map(p=>`<button class="item" data-a="ver-g" data-k="${esc(p.k)}"><span class="ic">${svg('ir')}</span><span class="q"><b>${esc(p.nombre)}</b><small>${esc(p.sub||p.d||'')}</small></span></button>`).join('')}</div>`:''}
    <p class="expl">Probá con un lugar, Santa Fe 2100, Callao y Corrientes, un barrio, un amigo, una línea como 60 o algo como farmacia.</p>`;
  }
  if(!hayDatos())return avisoDatos();
  asegurarIndice();const r=buscar(q,8);S.res=r;
  if(!r.length)return '<p class="expl">No lo encuentro. Probá con calle y altura, o con dos calles que se cruzan.</p>';
  const IC_T={persona:'junta',lugar:'lugar',barrio:'explorar',est:'subte',linea:'bus',plaza:'plaza','poi-c':'cafe','poi-h':'hosp',poi:'ir',guia:'idea',calle:'mapa',dir:'ir',esquina:'ir'};
  return `<div class="lista">${r.map((h,i)=>`<button class="item" data-a="res" data-i="${i}"><span class="ic">${svg(h.ic||IC_T[h.tipo]||'ir')}</span><span class="q"><b>${esc(h.n)}</b><small>${esc(h.sub||'')}</small></span></button>`).join('')}</div>`;
}
function mostrar(p,marcar=true){
  reg(p);if(S.buscando)cerrarBusqueda();S.marca=marcar&&p.tipo!=='persona'&&p.tipo!=='lugar'?p:null;
  recordar(p);irA(p.x,p.y,Math.max(aEscala(),.6));abrirGlobo(p);abrirHoja(2);pedir();
}
function recordar(p){const k=p.k;M.recientes=[k,...M.recientes.filter(x=>x!==k)].slice(0,8);if(!k.startsWith('p:')&&!k.startsWith('l:'))M.conocidos={...(M.conocidos||{}),[k]:{k,nombre:p.nombre,x:p.x,y:p.y,tipo:p.tipo,sub:p.sub}};guardar();}
function accionRes(h){
  if(h.tipo==='cat'){cerrarBusqueda();ponerFicha(h.f);return;}
  if(h.tipo==='barrio'){cerrarBusqueda();abrirBarrio(h.b);return;}
  if(h.tipo==='linea'){cerrarBusqueda();verLinea(h.pi);return;}
  if(h.tipo==='calle'){const p=centroCalle(h.na);if(p)mostrar(p);return;}
  if(h.tipo==='persona'){mostrar(casaPlace(h.ref));return;}
  if(h.tipo==='lugar'){mostrar(h.ref);return;}
  mostrar({nombre:h.n||h.nombre,x:h.x,y:h.y,tipo:h.tipo==='dir'||h.tipo==='esquina'?'dir':'poi',sub:h.sub||''});
}
function verLinea(pi){const p=T.pats[pi];dibRuta=[{pts:Array.from(p.g),col:COL.bondi,ancho:5}];encuadrar(Array.from(p.g));aviso(`Línea ${p.l}: ${limpioH(p.h)}`);}
function ponerFicha(id){
  if(S.filtro===id){sacarFicha();return;}
  S.filtro=id;S.soloAbierto=false;S.estadoFicha='';S.herr=null;S.buscando=false;SIG.pois='';
  abrirHoja(1);render();pedir();actualizarFicha();
}
function sacarFicha(){S.filtro=null;S.soloAbierto=false;S.estadoFicha='';if(ctrlOSM)ctrlOSM.abort();ctrlOSM=null;render();pedir();}

/* ───── Explorar un barrio ───── */
const SECC_HIST=new Set(['secretos','paseos','cultura-gratis','comer','salir','estudiar','deporte']);
const tieneBarrio=(g,b)=>{const n=sinTilde(nombreBarrio(b)),t=sinTilde([g.titulo,g.bajada,g.cuerpo].filter(Boolean).join(' '));return new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`).test(t);};
function vistaExplorar(){
  if(S.exp)return vistaBarrio();
  if(!hayDatos())return avisoDatos();
  const ord=[...(L.barrios||[])].sort((a,b)=>nombreBarrio(a[0]).localeCompare(nombreBarrio(b[0]),'es'));
  return `<h2 class="titulo">Explorá un barrio</h2>
  <p class="expl">Te muestro qué tiene, con datos reales, y te armo un recorrido a pie.</p>
  <button class="grande" data-a="exp-aca">${svg('explorar')}<span class="q"><b>El barrio que estoy viendo</b><small>Según dónde está el mapa</small></span>${svg('flecha')}</button>
  <div class="chipera">${ord.map(b=>`<button class="chip" data-a="exp-b" data-b="${esc(b[0])}">${esc(nombreBarrio(b[0]))}</button>`).join('')}</div>`;
}
async function abrirBarrio(b){
  const yoS=sesion;S.tab='explorar';S.filtro=null;S.herr=null;S.exp={b,cargando:true};dibRuta=[];render();abrirHoja(1);
  const ce=(L.barrios||[]).find(q=>q[0]===b);if(ce)irA(wx(ce[1]),wy(ce[2]),.09);
  let f=null;try{f=await enMotor('fichaBarrio',b);}catch{/* abajo avisa */}
  if(yoS!==sesion||S.exp?.b!==b)return;
  if(!f){S.exp=null;aviso('No pude armar el barrio ahora.');render();return;}
  const nom=nombreBarrio(b),t=[];
  const dato=(n,s)=>{if(n)t.push([n,s]);};
  dato(f.lineas,f.lineas===1?'línea de colectivo':'líneas de colectivo');dato(f.est.length,f.est.length===1?'estación de subte':'estaciones de subte');dato(f.cuenta.f,f.cuenta.f===1?'farmacia':'farmacias');dato(f.nPlazas,f.nPlazas===1?'plaza o parque':'plazas y parques');dato(f.verde,f.verde===1?'hectárea verde':'hectáreas verdes');dato(f.cuenta.c,f.cuenta.c===1?'bar notable':'bares notables');
  const cards=[{tipo:'portada',t:nom,datos:t.slice(0,6),x:ce?wx(ce[1]):null,y:ce?wy(ce[2]):null}];
  const lugar=(tipo,n,x,y,sub,ic)=>cards.push({tipo,t:n,sub,ic,x,y,place:{nombre:n,x,y,tipo:'poi',sub}});
  f.plazas.slice(0,3).forEach(p=>lugar('plaza',p.n,p.x,p.y,`Plaza o parque de ${(p.area/10000).toFixed(1).replace('.',',')} hectáreas`,'plaza'));
  f.cafes.slice(0,3).forEach(q=>lugar('cafe',q.n,q.wx,q.wy,`Bar notable · ${q.d||''}`,'cafe'));
  f.est.slice(0,3).forEach(q=>lugar('est',q.nom.replace('Est. ',''),q.x,q.y,`Subte línea ${q.lin}`,'subte'));
  (API.guia||[]).filter(g=>SECC_HIST.has(g.seccion)&&tieneBarrio(g,b)).slice(0,5).forEach(g=>cards.push({tipo:'hist',t:g.titulo,sub:g.bajada||g.dato||'',fuente:g.fuente_nombre,url:g.fuente_url,x:g.lat!=null?wx(g.lon):null,y:g.lat!=null?wy(g.lat):null,ic:'idea',place:g.lat!=null?{nombre:g.titulo,x:wx(g.lon),y:wy(g.lat),tipo:'poi',sub:g.dato||''}:null}));
  S.exp={b,cards,i:0,rec:null};render();pedir();
}
function moverCarta(d){
  const e=S.exp;if(!e?.cards)return;e.i=Math.max(0,Math.min(e.cards.length-1,e.i+d));
  const c=e.cards[e.i];if(c.x!=null)irA(c.x,c.y,c.tipo==='portada'?.09:Math.max(aEscala(),.45));pedir();render();
}
async function armarRecorrido(){
  const e=S.exp,yoS=sesion,c=e.cards.filter(q=>q.tipo!=='portada'&&q.x!=null);if(c.length<2)return;
  /* del primero al más cercano, y así: nunca más de 5 paradas */
  const orden=[c.shift()];while(c.length&&orden.length<5){const u=orden[orden.length-1];c.sort((a,b)=>Math.hypot(a.x-u.x,a.y-u.y)-Math.hypot(b.x-u.x,b.y-u.y));orden.push(c.shift());}
  e.armando=true;render();let r=null;
  try{r=await enMotor('recorrido',orden.map(q=>({x:q.x,y:q.y})));}catch{aviso('No pude armar el recorrido.');}
  if(yoS!==sesion||S.exp!==e)return;e.armando=false;
  if(r&&r.pts.length){e.rec={len:r.len,seg:r.seg,nom:orden.map(q=>q.t)};dibRuta=[{pts:r.pts,col:COL.tinta,ancho:4,punteado:true}];encuadrar(r.pts);}
  render();
}
function vistaBarrio(){
  const e=S.exp;
  if(e.cargando)return `${cabBarrio(e)}<div class="m-carga-fila"><i></i><span>Juntando lo que tiene el barrio…</span></div><div class="m-esq"></div>`;
  const c=e.cards[e.i],n=e.cards.length;
  const cuerpo=c.tipo==='portada'?`<div class="m-cifras">${c.datos.map(([v,s])=>`<div><b>${Number(v).toLocaleString('es-AR')}</b><small>${esc(s)}</small></div>`).join('')}</div><p class="expl">Contado desde los datos de la app.</p>`
   :`<p class="m-carta-t">${esc(c.sub||'')}</p>${c.fuente?`<p class="expl">Fuente: ${c.url?`<a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.fuente)}</a>`:esc(c.fuente)}</p>`:''}${c.place?`<div class="fila"><button class="btn pri" data-a="ir" data-k="${esc(reg(c.place))}">${svg('ir')}Cómo llego</button><button class="btn sec2" data-a="caminar-a" data-k="${esc(c.place.k)}">${svg('caminar')}Caminar acá</button></div>`:''}`;
  return `${cabBarrio(e)}
  <article class="m-carta" aria-live="polite"><small>${e.i+1} de ${n}</small><h3>${c.ic?svg(c.ic):''}${esc(c.t)}</h3>${cuerpo}</article>
  <div class="m-pasar"><button class="btn sec2" data-a="carta" data-d="-1" ${e.i?'':'disabled'}>Anterior</button><button class="btn pri" data-a="carta" data-d="1" ${e.i<n-1?'':'disabled'}>Siguiente</button></div>
  ${e.rec?`<div class="nota"><h3>Recorrido a pie: ${km(e.rec.len)}, ${minutos(e.rec.seg)} min</h3><p>${e.rec.nom.map(esc).join(' → ')}</p></div>`:e.cards.filter(q=>q.tipo!=='portada'&&q.x!=null).length>1?`<button class="btn sec2" data-a="recorrido" ${e.armando?'disabled':''}>${svg('pie')}${e.armando?'Armando el recorrido…':'Armame un recorrido a pie'}</button>`:''}`;
}
const cabBarrio=e=>`<div class="ruta-cab"><button class="ico-btn" data-a="exp-salir" aria-label="Volver">${svg('volver',2.4)}</button><div class="t">${esc(nombreBarrio(e.b))}</div></div>`;

/* ───── Listas propias ───── */
const lugarDeLista=q=>{const p={nombre:q.nombre,x:wx(q.lon),y:wy(q.lat),tipo:'poi',sub:q.sub||''};reg(p);return p;};
const nuevoId=()=>crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}-4000-8000-000000000000`;
function subirLista(l){guardar();try{API.listas?.guardar(l);}catch{/* queda en preferencias */}}
function vistaListas(){
  const a=S.listaAbierta&&M.listas.find(l=>l.id===S.listaAbierta);
  if(a){const pl=a.lugares.map(lugarDeLista);
    return `${cabHerr(a.nombre)}${pl.length?`<div class="lista">${pl.map((p,i)=>`<div class="m-fila-b"><button class="item" data-a="ver" data-k="${esc(p.k)}"><span class="ic">${svg('ir')}</span><span class="q"><b>${esc(p.nombre)}</b><small>${esc(p.sub)}</small></span></button><button class="ico-btn" data-a="lista-saca" data-i="${i}" aria-label="Sacar de la lista">${svg('x')}</button></div>`).join('')}</div>`:'<p class="expl">Tocá un lugar del mapa y elegí “A una lista”.</p>'}
    <button class="btn sec2 chico" data-a="lista-borra">Borrar esta lista</button>`;}
  const fv=M.favs.map(k=>REG.get(k)).filter(Boolean);
  return `${cabHerr(S.paraLista?`Sumar ${S.paraLista.nombre}`:'Mis lugares')}
  ${S.paraLista?'':fv.length?`<h3 class="sec">Guardados</h3><div class="lista">${fv.map(p=>`<button class="item" data-a="ver" data-k="${esc(p.k)}"><span class="ic">${svg('guardar')}</span><span class="q"><b>${esc(p.nombre)}</b><small>${esc(p.sub||p.d||'')}</small></span></button>`).join('')}</div>`:'<p class="expl">Lo que guardes del mapa aparece acá.</p>'}
  <h3 class="sec">Listas</h3>
  ${M.listas.length?`<div class="lista">${M.listas.map(l=>`<button class="item" data-a="lista" data-id="${esc(l.id)}"><span class="ic">${svg('lista')}</span><span class="q"><b>${esc(l.nombre)}</b><small>${l.lugares.length} ${l.lugares.length===1?'lugar':'lugares'}</small></span></button>`).join('')}</div>`:''}
  <div class="campo"><label for="m-lista-n">Lista nueva</label><input id="m-lista-n" maxlength="60" autocomplete="off" placeholder="Ej: Cafés para estudiar"></div>
  <button class="btn pri" data-a="lista-nueva">Crear lista</button>`;
}
function mezclarListas(filas){
  if(!filas)return;
  if(filas.length){M.listas=filas.map(f=>({id:f.id,nombre:f.nombre,lugares:f.lugares||[]}));}
  else M.listas.forEach(l=>{try{API.listas?.guardar(l);}catch{/* queda en preferencias */}});
  if(S.herr==='listas')render();
}
function mezclarFavoritos(filas){
  (filas||[]).forEach(f=>{
    const x=wx(f.lon),y=wy(f.lat);
    if(M.favs.some(k=>{const p=REG.get(k);return p&&Math.hypot(p.x-x,p.y-y)<6;}))return;
    const p={nombre:f.nombre,x,y,tipo:'poi'};reg(p);M.favs.push(p.k);M.conocidos={...(M.conocidos||{}),[p.k]:{k:p.k,nombre:p.nombre,x,y,tipo:'poi'}};
  });
  if(S.tab==='ir'&&!S.dest&&!S.herr&&!S.filtro&&!S.buscando)render();
}
function alternarFav(p){
  const on=!M.favs.includes(p.k);M.favs=on?[p.k,...M.favs]:M.favs.filter(x=>x!==p.k);
  if(on&&!p.k.startsWith('p:')&&!p.k.startsWith('l:'))M.conocidos={...(M.conocidos||{}),[p.k]:{k:p.k,nombre:p.nombre,x:p.x,y:p.y,tipo:p.tipo,sub:p.sub}};
  guardar();try{API.favorito?.({nombre:p.nombre,lat:+alat(p.y).toFixed(6),lon:+alon(p.x).toFixed(6)},on);}catch{/* queda en preferencias */}
  return on;
}

/* ───── Ubicación en vivo: apagada por defecto, con quién y hasta cuándo lo elegís vos ───── */
const V={sin:false,comp:false,para:new Set(),dur:60,hasta:0,off:null,ult:null,tPub:0,tFin:null,tLeer:null,gente:[]};
const compartidos=()=>PERSONAS.filter(p=>V.para.has(p.id)).map(p=>p.nombre);
function vistaVivo(){
  const otros=PERSONAS.filter(p=>p.id!==API.yoId);
  if(V.comp)return `${cabHerr('Tu ubicación')}<div class="nota"><h3>La están viendo: ${esc(compartidos().join(', '))}</h3><p>Hasta las ${hhmm(ahoraMin(V.hasta))}, mientras tengas el mapa abierto.</p></div><button class="btn pri" data-a="vivo-parar">Dejar de compartir</button>`;
  return `${cabHerr('Compartir mi ubicación')}
  <p class="expl">Está apagado. Solo la ven las personas que elijas, hasta la hora que elijas, y se corta sola cuando salís del mapa.</p>
  <h3 class="sec">¿Con quién?</h3>
  <div class="chipera">${otros.map(p=>`<button class="chip" aria-pressed="${V.para.has(p.id)}" data-a="vivo-p" data-id="${esc(p.id)}">${esc(p.nombre)}</button>`).join('')}</div>
  <h3 class="sec">¿Por cuánto?</h3>
  <div class="chipera">${[[15,'15 minutos'],[60,'1 hora'],[180,'3 horas']].map(([m,n])=>`<button class="chip" aria-pressed="${V.dur===m}" data-a="vivo-d" data-m="${m}">${n}</button>`).join('')}</div>
  <button class="btn pri" data-a="vivo-empezar" ${V.para.size?'':'disabled'}>Empezar a compartir</button>`;
}
const ahoraMin=t=>{const d=new Date(new Date(t).toLocaleString('en-US',{timeZone:'America/Argentina/Buenos_Aires'}));return d.getHours()*60+d.getMinutes();};
function publicar(p,forzar){
  const t=Date.now();V.ult=p;if(!V.comp||(!forzar&&t-V.tPub<20000))return;V.tPub=t;
  Promise.resolve(API.vivo.publicar({lat:+p.lat.toFixed(5),lon:+p.lon.toFixed(5),rumbo:p.rumbo!=null?Math.round(p.rumbo):null,para:[...V.para],hasta:new Date(V.hasta).toISOString()})).catch(()=>{});
}
function empezarVivo(){
  if(!V.para.size)return;
  V.comp=true;V.hasta=Date.now()+V.dur*60000;V.tPub=0;
  V.off=escucharUbicacion(p=>publicar(p,!V.tPub),()=>{pararVivo();aviso('Sin permiso de ubicación no puedo compartirla.');render();});
  clearTimeout(V.tFin);V.tFin=setTimeout(()=>{pararVivo();aviso('Se terminó el tiempo: ya no compartís tu ubicación.');},V.dur*60000);
  pill('vivo',`Compartís tu ubicación con ${compartidos().join(', ')}`,{a:'vivo-parar',n:'Parar'});render();
}
function pararVivo(){
  if(!V.comp)return;V.comp=false;if(V.off)V.off();V.off=null;clearTimeout(V.tFin);pill('vivo','');
  Promise.resolve(API.vivo.parar()).catch(()=>{});if(S.herr==='vivo')render();
}
async function leerVivo(){
  clearTimeout(V.tLeer);const yoS=sesion;
  if(document.visibilityState==='visible'&&!V.sin){
    let f=[];try{f=await API.vivo.leer();}catch{/* sin red: el próximo intento */}
    if(yoS!==sesion)return;
    if(f===null){V.sin=true;pintarMenu();return;}
    V.gente=(f||[]).filter(q=>q.perfil_id!==API.yoId);pintarVivoEnMapa();
  }
  V.tLeer=setTimeout(leerVivo,20000);
}
function pintarVivoEnMapa(){
  if(!mapa||!estiloListo)return;
  const f=[];
  for(const k of [...PTS.keys()])if(k[0]==='v')PTS.delete(k);
  V.gente.forEach((q,i)=>{const p=PERSONAS.find(u=>u.id===q.perfil_id);if(!p)return;const id='v'+i,min=Math.round((Date.now()-new Date(q.actualizado_en))/60000);PTS.set(id,{nombre:p.nombre,x:wx(q.lon),y:wy(q.lat),tipo:'poi',sub:min<1?'Ubicación en vivo, recién':`Ubicación en vivo, hace ${min} min`});f.push(punto(wx(q.lon),wy(q.lat),{id,ic:`am|${p.col}|${iniciales(p.nombre)}|1`}));});
  poner('vivo',fc(f));
}

/* ───── Menú de capas y herramientas ───── */
const NOM_CAPAS=[['amigos','Amigos'],['facus','Facus'],['subte','Subte'],['guia','Guía'],['verdes','Zonas verdes'],['ciclo','Ciclovías'],['ecobici','Ecobici']];
function pintarMenu(){
  const b=$('menu');if(!b)return;b.hidden=!S.menu;if(!S.menu)return;
  const VIS=[['mapa','Mapa','mapa'],['satelite','Satélite','sat'],...(COL.oscuro?[]:[['noche','Noche','noche']])];
  b.innerHTML=`<div class="m-menu-v">${VIS.map(([k,n,ic])=>`<button data-a="vista" data-v="${k}" aria-pressed="${vistaBase===k}">${svg(ic)}${n}</button>`).join('')}<button data-a="tres" aria-pressed="${trid}">${svg('tres')}3D</button></div>
  <h3>Qué mostrar</h3><div class="chipera">${NOM_CAPAS.filter(([k])=>!(k==='ciclo'&&usandoPlano)).map(([k,n])=>`<button class="chip" data-a="capa" data-c="${k}" aria-pressed="${S.capas[k]}">${n}</button>`).join('')}</div>
  <h3>Herramientas</h3><div class="m-menu-h"><button data-a="herr-medir">${svg('regla')}Medir</button><button data-a="herr-medio">${svg('medio')}Punto medio</button><button data-a="herr-listas">${svg('lista')}Mis lugares</button>${V.sin?'':`<button data-a="herr-vivo">${svg('vivo')}Compartir ubicación</button>`}</div>`;
}
function herramienta(h){
  S.menu=false;pintarMenu();S.buscando=false;S.filtro=null;cerrarGloboSiHay();
  S.herr=h;dibRuta=[];
  if(h==='medir')S.med={pts:[],pie:null};
  if(h==='medio')S.pm={a:null,b:null,res:null,calc:false,lugar:null};
  if(h==='listas'){S.paraLista=null;S.listaAbierta=null;}
  abrirHoja(1);render();pedir();
}
function cerrarGloboSiHay(){const g=$('globo');if(g&&!g.hidden)cerrarGlobo();}
function salirHerr(){
  if(S.herr==='listas'&&S.listaAbierta){S.listaAbierta=null;render();pedir();return;}
  S.herr=null;S.med=null;S.pm=null;S.paraLista=null;dibRuta=[];render();pedir();
}
function salirModos(){S.herr=null;S.med=null;S.pm=null;S.buscando=false;S.filtro=null;S.soloAbierto=false;S.estadoFicha='';const i=$('buscar');if(i)i.value='';S.buscar='';pintarBorrar();}
function aPuntoDeCaminar(p){API.navegar(`/calle?lat=${alat(p.y).toFixed(6)}&lon=${alon(p.x).toFixed(6)}`);}

/* ───── Acciones ───── */
function aviso(t){API?.aviso(t);}
function irDestino(k){
  const p=REG.get(k);if(!p)return;
  salirModos();S.dest=p;cerrarGloboSiHay();S.marca=null;S.cercaRes=null;S.cat=null;
  if(!S.desde){const me=yo();if(me&&me.x!=null)S.desde=casaPlace(me);}
  if(!S.desde){S.dest=null;S.tab='ir';render();return;}
  if(Math.hypot(p.x-S.desde.x,p.y-S.desde.y)<30){aviso('Ya estás ahí.');S.dest=null;render();return;}
  if(S.ctx.auto)S.ctx={...ahora(),lluvia:S.ctx.lluvia};
  S.tab='ir';recordar(p);viajar();render();abrirHoja(1);$('panel').scrollTop=0;
}
function recalc(){for(const k of [...CACHE.keys()])if(!k.startsWith('pie'))CACHE.delete(k);if(S.plan&&S.dest)viajar();S.junta.res=null;render();}
function gpsOrigen(){
  if(!navigator.geolocation){aviso('Tu navegador no da la ubicación.');return;}
  aviso('Buscando dónde estás…');
  ubicacionUnaVez(c=>{
    if(!API)return;
    if(!enCiudad(c.latitude,c.longitude)){aviso('El plano cubre solo la Ciudad de Buenos Aires.');return;}
    const x=wx(c.longitude),y=wy(c.latitude);
    S.desde={k:'gps',nombre:'Donde estás',x,y,tipo:'punto'};REG.set('gps',S.desde);S.cercaDe=S.desde;S.elegirDesde=false;CACHE.clear();render();irA(x,y,.3);
  },()=>aviso('No pude ver tu ubicación. Revisá el permiso del navegador.'));
}
const ACC={
  tab(e){salirModos();S.tab=e.dataset.t;if(S.tab!=='ir')dibRuta=[];else if(S.plan&&S.dest)dibujarOpcion(false);if(S.tab!=='cerca')S.cercaRes=null;render();pedir();$('panel').scrollTop=0;abrirHoja(1);},
  capa(e){const k=e.dataset.c;S.capas[k]=!S.capas[k];M.capas=S.capas;guardar();pintarMenu();pedir();},
  vista(e){elegirVista(e.dataset.v);},
  tres(){alternar3D();},
  menu(){S.menu=!S.menu;pintarMenu();},
  norte(){mapa?.easeTo({bearing:0,pitch:0,duration:quieto()?0:420});if(trid){trid=false;pintarVistas();pedir();}if(U.modo===2)modoGps(1);},
  gps(){modoGps((U.modo+1)%3);},
  caminar(){if(S.globo){aPuntoDeCaminar(S.globo);return;}if(!mapa)return;aPuntoDeCaminar(centroVisible());},
  'caminar-a'(e){const p=REG.get(e.dataset.k);if(p)aPuntoDeCaminar(p);},
  ir(e){irDestino(e.dataset.k);},
  'gps-origen':gpsOrigen,
  'cerrar-globo'(){cerrarGlobo();},
  'cerca-de'(e){const p=REG.get(e.dataset.k);salirModos();S.cercaDe=p;S.cat=S.cat||'amigos';S.tab='cerca';cerrarGloboSiHay();dibRuta=[];render();pedir();abrirHoja(1);},
  'cerca-yo'(){const me=yo();S.cercaDe=me&&me.x!=null?casaPlace(me):null;S.cercaRes=null;render();pedir();},
  'cerca-aca'(){if(!mapa||!hayDatos())return;const c=centroVisible();S.cercaDe={nombre:esquinaDe(c.x,c.y)||'este punto',x:c.x,y:c.y,tipo:'punto'};reg(S.cercaDe);S.cercaRes=null;render();pedir();},
  volver(){turnoViaje++;S.dest=null;S.plan=null;dibRuta=[];render();pedir();},
  op(e){S.sel=+e.dataset.i;S.varSel=null;render();dibujarOpcion(true);},
  var(e){S.varSel=e.dataset.v;render();dibujarOpcion(false);},
  fav(){alternarFav(S.dest);render();},
  'fav-p'(e){const p=REG.get(e.dataset.k);if(p){alternarFav(p);abrirGlobo(p);}},
  'a-lista'(e){const p=REG.get(e.dataset.k);if(!p)return;herramienta('listas');S.paraLista=p;render();},
  'mandar-p'(e){const p=REG.get(e.dataset.k);if(p)API.compartir({texto:`Mirá este lugar: ${p.nombre}`,adjunto:{nombre:p.nombre,lat:alat(p.y),lon:alon(p.x)}});},
  desde(){S.elegirDesde=!S.elegirDesde;render();},
  'desde-sel'(e){const p=conCasa().find(q=>q.k===e.dataset.k);S.desde=casaPlace(p);S.elegirDesde=false;render();},
  'ctx-abrir'(){S.ctxAbierto=!S.ctxAbierto;render();},
  'ctx-ahora'(){const l=S.ctx.lluvia;S.ctx={...ahora(),lluvia:l};recalc();},
  'ctx-dia'(e){S.ctx={...S.ctx,dia:e.dataset.d,auto:false};recalc();},
  lluvia(){S.ctx={...S.ctx,lluvia:!S.ctx.lluvia};recalc();},
  'tengo-bici'(){M.bici=!M.bici;guardar();recalc();},
  cat(e){S.cat=e.dataset.c;render();const q=S.cercaRes&&S.cercaRes.marcas;if(q&&q.length){encuadrar([S.cercaDe.x,S.cercaDe.y,...q.flatMap(m=>[m.x,m.y])]);}else pedir();const r=$('res-cerca');if(r)$('panel').scrollTop=r.offsetTop-$('panel').offsetTop-8;},
  ver(e){const p=REG.get(e.dataset.k);if(!p)return;irA(p.x,p.y,Math.max(aEscala(),.4));abrirGlobo(p);abrirHoja(2);},
  'ver-g'(e){const p=REG.get(e.dataset.k);if(p)mostrar(p);},
  'ver-f'(e){const q=S.fichaLista?.[+e.dataset.i];if(q)mostrar({nombre:q.n,x:q.x,y:q.y,tipo:'poi',sub:q.d,h:q.h},false);},
  res(e){const h=S.res?.[+e.dataset.i];if(h)accionRes(h);},
  'q-x'(){cerrarBusqueda();},
  linea(e){verLinea(+e.dataset.i);},
  ficha(e){ponerFicha(e.dataset.f);},
  'ficha-fuera'(){sacarFicha();},
  'ficha-otra'(){actualizarFicha();},
  abierto(){S.soloAbierto=!S.soloAbierto;render();pedir();},
  'junta-p'(e){const s=S.junta.quien,i=e.dataset.id;s.has(i)?s.delete(i):s.add(i);S.junta.res=null;render();},
  'junta-calc'(){calcJunta();},
  'junta-sel'(e){S.junta.elegido=+e.dataset.i;dibujarJunta();render();},
  proponer(){const r=S.junta.res[S.junta.elegido];API.proponerJuntada({lugar:r.c.nombre,lat:alat(r.c.y),lon:alon(r.c.x)});},
  mandar(){const o=S.plan.ops[S.sel];API.compartir({texto:textoViaje(o),adjunto:{nombre:S.dest.nombre,lat:alat(S.dest.y),lon:alon(S.dest.x)}});},
  salgo(){const o=S.plan.ops[S.sel];API.aportar({tipo:'salida',titulo:`Salgo a ${S.dest.nombre}`,nota:`${hhmm(S.ctx.min)}, ${o.titulo==='A pie'?'a pie':o.titulo}`});},
  'alerta-bajar':alertaBajar,
  'bajar-ok'(){pararAlerta();if(S.plan)render();},
  'herr-medir'(){herramienta('medir');},'herr-medio'(){herramienta('medio');},'herr-listas'(){herramienta('listas');},'herr-vivo'(){herramienta('vivo');},
  'herr-salir':salirHerr,
  'med-atras'(){S.med.pts.pop();S.med.pie=null;render();pedir();calcularPie();},
  'med-limpiar'(){S.med={pts:[],pie:null};render();pedir();},
  'medio-p'(e){const p=REG.get(e.dataset.k);if(p)elegirMedio(p);},
  'exp-aca'(){if(!mapa||!hayDatos())return;const c=centroVisible(),b=barrioDe(c.x,c.y);if(b)abrirBarrio(b);else aviso('Acá no hay un barrio.');},
  'exp-b'(e){abrirBarrio(e.dataset.b);},
  'exp-salir'(){S.exp=null;dibRuta=[];render();pedir();},
  carta(e){moverCarta(+e.dataset.d);},
  recorrido(){armarRecorrido();},
  lista(e){
    const l=M.listas.find(x=>x.id===e.dataset.id);if(!l)return;
    if(S.paraLista){const p=S.paraLista;if(!l.lugares.some(q=>q.nombre===p.nombre))l.lugares.push({nombre:p.nombre,lat:+alat(p.y).toFixed(6),lon:+alon(p.x).toFixed(6),sub:p.sub||''});subirLista(l);S.paraLista=null;aviso(`Sumado a ${l.nombre}.`);}
    S.listaAbierta=l.id;render();pedir();
    const q=l.lugares.map(lugarDeLista);if(q.length)encuadrar(q.flatMap(p=>[p.x,p.y]));
  },
  'lista-nueva'(){
    const i=$('lista-n'),n=(i?.value||'').trim();if(!n){i?.focus();return;}
    const l={id:nuevoId(),nombre:n,lugares:[]};M.listas=[l,...M.listas];
    if(S.paraLista){const p=S.paraLista;l.lugares.push({nombre:p.nombre,lat:+alat(p.y).toFixed(6),lon:+alon(p.x).toFixed(6),sub:p.sub||''});S.paraLista=null;}
    subirLista(l);S.listaAbierta=l.id;render();pedir();
  },
  'lista-saca'(e){const l=M.listas.find(x=>x.id===S.listaAbierta);l.lugares.splice(+e.dataset.i,1);subirLista(l);render();pedir();},
  'lista-borra'(){const id=S.listaAbierta;M.listas=M.listas.filter(x=>x.id!==id);S.listaAbierta=null;guardar();try{API.listas?.borrar(id);}catch{/* queda en preferencias */}render();pedir();},
  'vivo-p'(e){const i=e.dataset.id;V.para.has(i)?V.para.delete(i):V.para.add(i);render();},
  'vivo-d'(e){V.dur=+e.dataset.m;render();},
  'vivo-empezar':empezarVivo,'vivo-parar':pararVivo,
  reintentar(){const b=$('carga');if(b)b.hidden=true;rehechos=0;const c=$('mapa');if(c&&!mapa){c.innerHTML='';crearMapa(c);}},
  'reintentar-datos'(){cargarDatos(0);},
};
function alMover(){
  clearTimeout(tMueve);
  tMueve=setTimeout(()=>{if(!mapa)return;pintarYo();if(S.filtro){const f=ficha(S.filtro);if(f.osm)actualizarFicha();else if(!S.herr&&!S.buscando)render();}},380);
}

/* ───── Datos: se bajan una sola vez por sesión, y si fallan reintentan solos ───── */
let tDatos=null;
async function cargarDatos(n=0){
  const yoS=sesion;clearTimeout(tDatos);
  if(S.datos==='error'){S.datos='cargando';render();}
  try{await cargarDatosMapa();}
  catch{
    if(yoS!==sesion)return;
    S.datos='error';render();pill('datos','No pude bajar las rutas. Reintento solo.');
    tDatos=setTimeout(()=>cargarDatos(n+1),Math.min(30000,2500*Math.pow(2,n)));return;
  }
  if(yoS!==sesion)return;
  pill('datos','');S.datos='listo';if(demo)window.__mapaDatos=true;prepararCapas();indiceSucio=true;
  datosEnCapas();pedir();
  if(usandoPlano)ponerEstilo();
  if(!S.plan&&!S.dest||S.tab==='cerca'||S.tab==='explorar'||S.buscando)render();
}
export {cargarDatosMapa};
function esqueleto(){return `<div class="mp" id="m-raiz">
  <div class="stage" id="m-stage">
    <div id="m-mapa" aria-label="Mapa de Buenos Aires"></div>
    <div class="m-arriba">
      <div class="m-barra"><span class="m-lupa">${svg('lupa',2.4)}</span><input id="m-buscar" type="search" autocomplete="off" enterkeyhint="search" aria-label="Buscar en el mapa" placeholder="Buscá un lugar, calle o amigo"><button id="m-q-x" data-a="q-x" aria-label="Borrar búsqueda" hidden>${svg('x',2.4)}</button><button class="m-capas-b" data-a="menu" aria-label="Capas y herramientas">${svg('capas')}</button></div>
      <div class="m-fichas" id="m-fichas"></div>
      <div id="m-avisos" aria-live="polite"></div>
    </div>
    <div id="m-menu" hidden></div>
    <div class="m-der">
      <button id="m-brujula" data-a="norte" aria-label="Volver al norte" hidden>${svg('brujula')}</button>
      <button id="m-gps" data-a="gps" data-modo="0" aria-label="Ir a donde estoy">${svg('gps')}</button>
      <button class="m-caminar" data-a="caminar" aria-label="Caminar acá en 3D">${svg('caminar')}<span>Caminar acá</span></button>
    </div>
    <div id="m-globo" hidden></div>
    <div id="m-carga" hidden></div>
  </div>
  <div class="m-hoja" id="m-hoja">
    <div class="m-asa" id="m-asa"><i></i></div>
    <div class="mp-tabs" id="m-tabs" role="tablist"></div>
    <div id="m-panel" tabindex="-1"></div>
  </div>
</div>`;}
let controladores=null;
export function montarMapa(raiz,api){
  sesion++;const yoS=sesion;
  API=api;raiz.innerHTML=esqueleto();
  Object.assign(S,estadoInicial(),{ctx:ahora()});M=memoriaInicial();
  try{const r=localStorage.getItem(CLAVE);if(r)M={...M,...JSON.parse(r)};}catch(e){}
  if(api.memoria)M={...M,...api.memoria};
  M.listas=M.listas||[];M.favs=M.favs||[];M.recientes=M.recientes||[];
  if(M.capas)S.capas={...S.capas,...M.capas,ecobici:false};
  colores();vistaBase=M.vista==='noche'?'noche':'mapa';vistaEstiloOscuro=baseOscura();
  usandoPlano=false;trid=false;rehechos=0;fTiles=0;fSat=0;SIG={};
  L.places=(api.lugares||[]).map(q=>{const wxx=wx(q.lon),wyy=wy(q.lat),k={facu:'f',salida:'p',transporte:'t'}[q.tipo];return {k,n:q.nombre,d:q.descripcion,wx:wxx,wy:wyy,prim:!!q.destacado,place:{k:'l:'+q.id,nombre:q.nombre,x:wxx,y:wyy,tipo:'lugar',d:q.descripcion,sub:q.descripcion}};});
  L.places.sort((a,b)=>b.prim-a.prim);L.places.forEach(q=>reg(q.place));
  armarPersonas();Object.values(M.conocidos||{}).forEach(q=>REG.set(q.k,q));
  (M.listas||[]).forEach(l=>l.lugares.forEach(lugarDeLista));
  if(api.tab&&TABS.some(t=>t[0]===api.tab))S.tab=api.tab;
  hojaArrastrable();
  const clic=e=>{
    if(S.menu&&!e.target.closest('#m-menu,[data-a="menu"]')){S.menu=false;pintarMenu();}
    const b=e.target.closest('[data-a]');if(!b||!raiz.contains(b)||b.disabled)return;const f=ACC[b.dataset.a];if(f){e.preventDefault();f(b);}
  };
  const entra=e=>{if(e.target.id==='m-buscar'){S.buscar=e.target.value;pintarBorrar();clearTimeout(tBusca);tBusca=setTimeout(render,50);}};
  const foco=e=>{if(e.target.id==='m-buscar')abrirBusqueda();};
  const tecla=e=>{if(e.target.id==='m-buscar'){if(e.key==='Escape')cerrarBusqueda();if(e.key==='Enter'){clearTimeout(tBusca);render();if(S.res?.[0])accionRes(S.res[0]);}}else if(e.key==='Escape'&&S.menu){S.menu=false;pintarMenu();}};
  const cambia=e=>{if(e.target.id==='m-hora'&&e.target.value){const [h,m]=e.target.value.split(':').map(Number);S.ctx={...S.ctx,min:h*60+m,auto:false};recalc();}};
  raiz.addEventListener('click',clic);raiz.addEventListener('input',entra);raiz.addEventListener('change',cambia);raiz.addEventListener('focusin',foco);raiz.addEventListener('keydown',tecla);
  const tema=()=>{const o=vistaEstiloOscuro;colores();vistaEstiloOscuro=baseOscura();if(o!==vistaEstiloOscuro&&mapa)ponerEstilo();else pedir();};
  const mo=new MutationObserver(tema);mo.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  const mq=matchMedia('(prefers-color-scheme:dark)');mq.addEventListener('change',tema);
  const volvioRed=()=>{if(usandoPlano)probarRed(sesion,4000);if(S.datos==='error')cargarDatos(0);};
  const visible=()=>{if(document.visibilityState==='visible'&&!V.sin&&!V.tLeer)leerVivo();};
  window.addEventListener('online',volvioRed);document.addEventListener('visibilitychange',visible);
  controladores=()=>{raiz.removeEventListener('click',clic);raiz.removeEventListener('input',entra);raiz.removeEventListener('change',cambia);raiz.removeEventListener('focusin',foco);raiz.removeEventListener('keydown',tecla);mo.disconnect();mq.removeEventListener('change',tema);window.removeEventListener('online',volvioRed);document.removeEventListener('visibilitychange',visible);window.removeEventListener('resize',alCambiarTam);};
  pintarMenu();render();
  crearMapa($('mapa'));
  if(api.q){const i=$('buscar');if(i)i.value=api.q;S.buscar=api.q;S.buscando=true;pintarBorrar();abrirHoja(0);}
  if(api.vivo)leerVivo();else V.sin=true;
  /* Primero que el mapa arranque: en equipos con pocos núcleos el Worker le compite. Con un tope por si el mapa tarda. */
  let arranco=false;const arrancar=()=>{if(arranco||yoS!==sesion)return;arranco=true;cargarDatos(0).then(()=>{if(yoS===sesion&&S.buscando)render();});};
  if(api.destino||api.q||datosEnMemoria())arrancar();
  else{tDatos=setTimeout(arrancar,900);irTrasMapa(()=>mapa.once('load',arrancar));}
  if(api.destino){const d=api.destino,p={nombre:d.nombre,x:wx(d.lon),y:wy(d.lat),tipo:'punto'};reg(p);if(api.soloVer){S.marca=p;abrirGlobo(p);irTrasMapa(()=>irA(p.x,p.y,.5,0));}else irDestino(p.k);}
  else irTrasMapa(()=>{const me=yo();if(me&&me.x!=null)irA(me.x,me.y,.17,0);else if(L.places[0])irA(L.places[0].wx,L.places[0].wy,.1,0);});
}
/* Mapa recién pedido: si todavía no existe, espera a que el import termine */
function irTrasMapa(f,n=0){if(mapa){f();return;}if(n<60)setTimeout(()=>{if(API)irTrasMapa(f,n+1);},50);}
/* Lo que viene de la base llega después, sin frenar el mapa */
export function datosDeApp({aportes,guia,favoritos,listas}){
  if(!API)return;
  if(aportes)API.aportes=aportes;if(guia){API.guia=guia;indiceSucio=true;}
  if(favoritos)mezclarFavoritos(favoritos);if(listas!==undefined)mezclarListas(listas);
  pedir();
}
/* Panel que sube y baja como en Mapas del iPhone */
let ponerHoja=null,alCambiarTam=()=>{};
function topesHoja(){const h=$('hoja'),H=h?h.offsetHeight:0;return [0,Math.max(0,H*.52),Math.max(0,H-148)];}
function abrirHoja(i){if(ponerHoja)ponerHoja(topesHoja()[i],true);}
function hojaArrastrable(){
  const h=$('hoja'),a=$('asa');let ini=null;
  const poner=(y,suave)=>{if(!h.isConnected)return;h.style.transition=suave&&!quieto()?'transform .46s cubic-bezier(.32,.72,0,1)':'none';h.style.transform=`translateY(${y}px)`;h.dataset.y=y;$('raiz')?.classList.toggle('mapa-grande',y>=topesHoja()[2]-2);};
  ponerHoja=poner;poner(topesHoja()[1],false);
  requestAnimationFrame(()=>poner(topesHoja()[1],false));
  alCambiarTam=()=>{const T_=topesHoja(),y=+h.dataset.y||0;poner(T_.reduce((m,q)=>Math.abs(q-y)<Math.abs(m-y)?q:m,T_[1]),false);};
  window.addEventListener('resize',alCambiarTam);
  a.addEventListener('pointerdown',e=>{a.setPointerCapture(e.pointerId);ini={p:e.clientY,y:+h.dataset.y||0,t:performance.now()};poner(ini.y,false);});
  a.addEventListener('pointermove',e=>{if(ini)poner(Math.max(0,Math.min(topesHoja()[2],ini.y+e.clientY-ini.p)),false);});
  const fin=e=>{if(!ini)return;const y=+h.dataset.y,dy=e.clientY-ini.p,v=dy/Math.max(1,performance.now()-ini.t),T_=topesHoja();let dest=T_.reduce((m,q)=>Math.abs(q-y)<Math.abs(m-y)?q:m,T_[1]);if(Math.abs(v)>.5)dest=v>0?(T_.find(q=>q>ini.y+4)??T_[2]):([...T_].reverse().find(q=>q<ini.y-4)??0);if(Math.abs(dy)<4)dest=ini.y>=T_[1]?T_[ini.y>=T_[2]-2?1:0]:T_[1];ini=null;poner(dest,true);};
  a.addEventListener('pointerup',fin);a.addEventListener('pointercancel',fin);
}
export function desmontarMapa(){
  sesion++;
  if(controladores)controladores();controladores=null;
  for(const t of [tEstilo,tSondeo,tCtx,tMueve,tTap,tBusca,tDatos,tFicha,tPoner,V.tLeer,V.tFin])clearTimeout(t);
  tTap=null;V.tLeer=null;
  if(V.comp)pararVivo();
  pararAlerta();if(U.off)U.off();U.off=null;U.modo=0;U.pos=null;apagarUbicacion();
  if(ctrlOSM)ctrlOSM.abort();ctrlOSM=null;
  turnoViaje++;dibRuta=[];PTS.clear();REG.clear();PILLS.clear();ponerHoja=null;MA={k:null,v:null,p:null};
  if(mapa){try{mapa.remove();}catch{/* ya estaba caído */}mapa=null;}
  if(demo)window.__m=null;
  estiloListo=false;trid=false;usandoPlano=false;SIG={};API&&(API=null);
}
export {planificar,alat,alon,wx,wy,geocodificar,barrioDe,esquinaDe};
