// @ts-nocheck
/* Plano, rutas, cerca y juntada. Se monta sobre un div y dibuja con canvas. */
import {G,T,L,wx,wy,alon,alat,sinTilde,cargarCalles,cargarTransporte,perfil,dijkstra,semillas,franja,frecuencia,subteAbierto,subteFrec,vecinas,esperaDe,rideSeg,planificar,km,cuadras,variantesPie,geocodificar,barrioDe,esquinaDe,nomParada,VBUS,FRANJA} from './motor';
let API=null;
const IC={
 idea:'<path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.7.5 1 1.1 1 2.1h5c0-1 .3-1.6 1-2.1A6 6 0 0012 3z"/>',
 pie:'<circle cx="13" cy="4.5" r="2"/><path d="M10 21l2-6-2.5-2.5.8-5 3.2 1 1.8 3 3 1M9.5 8.5L6.5 11v3M15 16l1 5"/>',
 bus:'<rect x="4" y="4" width="16" height="14" rx="2.5"/><path d="M4 11h16M7 21v-3M17 21v-3"/><circle cx="8" cy="14.7" r=".9"/><circle cx="16" cy="14.7" r=".9"/>',
 subte:'<path d="M7 20l2-3h6l2 3M6 5.5A3.5 3.5 0 019.5 2h5A3.5 3.5 0 0118 5.5V14a3 3 0 01-3 3H9a3 3 0 01-3-3zM6 10h12"/><circle cx="9.5" cy="13.5" r=".8"/><circle cx="14.5" cy="13.5" r=".8"/>',
 bici:'<circle cx="6" cy="16" r="3.8"/><circle cx="18" cy="16" r="3.8"/><path d="M6 16l4-7h6l2 7M10 9L8.5 6H6M16 9l-1-3h3M10 9l3 7"/>',
 auto:'<path d="M4 16v-3.5l2-5.5h12l2 5.5V16M4 13h16M3.5 16h17v3h-3v-1.5h-11V19h-3z"/>',
 casa:'<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/>',
 ir:'<path d="M12 21s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
 cerca:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3"/>',
 junta:'<circle cx="8" cy="9" r="3"/><circle cx="16.5" cy="9.5" r="2.5"/><path d="M3 20c0-3.5 2-5.5 5-5.5s5 2 5 5.5M14.5 14.5c3-.5 6 1 6 5"/>',
 grupo:'<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
 uca:'<path d="M2 9l10-5 10 5-10 5zM6 11.5V16c3 2.5 9 2.5 12 0v-4.5"/>',
 lupa:'<circle cx="11" cy="11" r="6.5"/><path d="M16 16l5 5"/>',
 lugar:'<path d="M5 21V4h9l1 2h5v9h-6l-1-2H7"/>',
 farma:'<path d="M12 5v14M5 12h14" stroke-width="3.2"/>',
 atm:'<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18"/>',
 cafe:'<path d="M4 9h13v5a5 5 0 01-5 5H9a5 5 0 01-5-5zM17 10h2a2 2 0 010 5h-2M8 3v3M12 3v3"/>',
 plaza:'<path d="M12 21v-7M12 14c-4 0-6-2.5-6-5.5S9 3 12 3s6 2.5 6 5.5-2 5.5-6 5.5z"/>',
 hosp:'<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/>',
 flecha:'<path d="M14 6l6 6-6 6M20 12H4"/>',volver:'<path d="M10 6l-6 6 6 6M4 12h16"/>',
 agrandar:'<path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"/>',super:'<path d="M3 4h3l2.5 11h10l2-8H7"/><circle cx="10" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',lavadero:'<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="13" r="4.5"/>',gym:'<path d="M4 9v6M8 7v10M16 7v10M20 9v6M8 12h8"/>',copia:'<rect x="8" y="8" width="12" height="13" rx="1.5"/><path d="M16 8V4H4v13h4"/>',mapa:'<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14"/>',guardar:'<path d="M6 3h12v18l-6-4-6 4z"/>',enviar:'<path d="M3 11l18-8-6 18-3-8z"/>'
};
const svg=(n,sw=2)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n]||''}</svg>`;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=id=>document.getElementById('m-'+id);
const plata=n=>'$'+(Math.round(n/10)*10).toLocaleString('es-AR');
const hhmm=m=>{m=((Math.round(m)%1440)+1440)%1440;return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');};
const DIAS=['dom','lun','mar','mié','jue','vie','sáb'];
const limpioH=h=>{let s=(h||'').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/\s+x\s+.*$/i,'').replace(/^Ramal\s+\S+\s*-\s*/i,'').replace(/\s*-?\s*(IDA|VUELTA)\s*$/i,'').trim();return s.replace(/^a\s+/i,'');};
const minutos=s=>Math.max(1,Math.round(s/60));

/* ───────── Memoria ───────── */
const CLAVE='sm-mapa-v2';
let M={recientes:[],favs:[],bici:false,conocidos:{}};
let tMem=null;function guardar(){try{localStorage.setItem(CLAVE,JSON.stringify(M));}catch(e){}clearTimeout(tMem);tMem=setTimeout(()=>{try{API.guardarMemoria&&API.guardarMemoria(M);}catch(e){}},1500);}
/* ───────── Estado ───────── */
const S={tab:'ir',sub:null,desde:null,dest:null,plan:null,sel:0,varPie:null,ctx:null,cat:null,cercaDe:null,cercaRes:null,linea:null,junta:{quien:null,res:null,elegido:0},
  aportes:[],marca:null,pick:null,buscar:'',capas:{amigos:true,facus:true,subte:true,guia:false},resp:'',cal:null};
const CACHE=new Map();
function ahora(){
  const d=new Date(new Date().toLocaleString('en-US',{timeZone:'America/Argentina/Buenos_Aires'})),w=d.getDay();
  return {dia:w===0?'dom':w===6?'sab':'hab',min:d.getHours()*60+d.getMinutes(),lluvia:false,auto:true,wd:w};
}
S.ctx=ahora();
const claveCtx=c=>`${c.dia}|${Math.round(c.min/15)}|${c.lluvia?1:0}`;
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

/* ───────── Mapa ───────── */
let mapa=null,maplibre=null,CAPAS=null,COL={},dibRuta=[],marcas=new Map(),puntos=new Map(),vistaBase='mapa',sucio=false,estiloListo=false,trid=false,marcaGps=null;
const ZM=64417,aZoom=s=>Math.log2(ZM*s),aEscala=()=>mapa?Math.pow(2,mapa.getZoom())/ZM:.17;
const cc=(x,y)=>[alon(x),alat(y)];
function colores(){const c=getComputedStyle(document.documentElement),g=n=>c.getPropertyValue(n).trim();
  COL={bondi:g('--azul')||'#1F7AFF',tinta:g('--tinta'),hoja:g('--hoja'),taxi:g('--taxi'),cartel:g('--cartel'),agenda:g('--agenda'),oscuro:(document.documentElement.getAttribute('data-theme')==='dark')||(!document.documentElement.getAttribute('data-theme')&&matchMedia('(prefers-color-scheme:dark)').matches)};}
function prepararCapas(){const est=[];for(let s=0;s<T.S;s++)if(T.stops[s].length>4)est.push(s);CAPAS={est};}
const fc=l=>({type:'FeatureCollection',features:l});
const linea=(pts,props)=>{const co=[];for(let i=0;i<pts.length;i+=2)co.push(cc(pts[i],pts[i+1]));return {type:'Feature',properties:props,geometry:{type:'LineString',coordinates:co}};};
const punto=(x,y,props)=>({type:'Feature',properties:props,geometry:{type:'Point',coordinates:cc(x,y)}});
function estiloBase(){
  if(vistaBase==='satelite')return {version:8,glyphs:'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',sources:{sat:{type:'raster',tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],tileSize:256,maxzoom:19,attribution:'Imágenes de Esri'},nombres:{type:'raster',tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'],tileSize:256,maxzoom:19}},layers:[{id:'sat',type:'raster',source:'sat'},{id:'nombres',type:'raster',source:'nombres',minzoom:12}]};
  return 'https://tiles.openfreemap.org/styles/'+(COL.oscuro?'dark':'liberty');
}
function instalarCapas(){
  if(!mapa||mapa.getSource('ruta'))return;
  const subte=[...new Set(T.pats.filter(p=>p.sub).map(p=>p.l))].map(l=>{const q=T.pats.filter(p=>p.sub&&p.l===l).sort((a,b)=>b.g.length-a.g.length)[0];return linea(q.g,{col:T.meta.subteCol[l]||COL.bondi});});
  mapa.addSource('subte',{type:'geojson',data:fc(subte)});
  mapa.addSource('estaciones',{type:'geojson',data:fc(CAPAS.est.map(e=>punto(T.sx[e],T.sy[e],{col:T.meta.subteCol[T.stops[e][4]]||COL.bondi})))});
  mapa.addSource('ruta',{type:'geojson',data:fc([]),lineMetrics:true});
  mapa.addSource('puntos',{type:'geojson',data:fc([])});
  mapa.addLayer({id:'subte',type:'line',source:'subte',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['get','col'],'line-width':['interpolate',['linear'],['zoom'],11,2,16,5],'line-opacity':.8}});
  mapa.addLayer({id:'estaciones',type:'circle',source:'estaciones',minzoom:12.5,paint:{'circle-radius':['interpolate',['linear'],['zoom'],12.5,2.5,16,6],'circle-color':'#fff','circle-stroke-color':['get','col'],'circle-stroke-width':2}});
  mapa.addLayer({id:'ruta-alt',type:'line',source:'ruta',filter:['==',['get','alt'],1],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#8E8E93','line-width':4,'line-opacity':.55}});
  mapa.addLayer({id:'ruta-halo',type:'line',source:'ruta',filter:['==',['get','alt'],0],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#fff','line-width':['+',['get','ancho'],3.5]}});
  mapa.addLayer({id:'ruta',type:'line',source:'ruta',filter:['all',['==',['get','alt'],0],['==',['get','pie'],0]],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['get','col'],'line-width':['get','ancho']}});
  mapa.addLayer({id:'ruta-pie',type:'line',source:'ruta',filter:['all',['==',['get','alt'],0],['==',['get','pie'],1]],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':COL.bondi,'line-width':['get','ancho'],'line-dasharray':[.1,2]}});
  mapa.addLayer({id:'puntos',type:'circle',source:'puntos',paint:{'circle-radius':['get','r'],'circle-color':['get','col'],'circle-stroke-color':'#fff','circle-stroke-width':2}});
  mapa.addLayer({id:'edificios-3d',type:'fill-extrusion',source:Object.keys(mapa.getStyle().sources).find(k=>/openmaptiles/i.test(k))||'openmaptiles','source-layer':'building',minzoom:14,layout:{visibility:'none'},paint:{'fill-extrusion-color':COL.oscuro?'#33363B':'#E4E6EA','fill-extrusion-height':['coalesce',['get','render_height'],9],'fill-extrusion-base':['coalesce',['get','render_min_height'],0],'fill-extrusion-opacity':.9}},'ruta-alt');
  estiloListo=true;sincronizar();
}
function marcador(k,el,lng){
  let m=marcas.get(k);
  if(!m){m=new maplibre.Marker({element:el,anchor:el.dataset.ancla||'center'}).setLngLat(lng).addTo(mapa);marcas.set(k,m);}
  else m.setLngLat(lng);
  return m;
}
function limpiarMarcas(vivas){for(const [k,m] of marcas)if(!vivas.has(k)){m.remove();marcas.delete(k);}}
function elAmigo(p,mio){const e=document.createElement('button');e.className='mk-amigo'+(mio?' yo':'');e.style.setProperty('--c',p.col);e.textContent=iniciales(p.nombre);e.setAttribute('aria-label',p.nombre);e.onclick=ev=>{ev.stopPropagation();abrirP(casaPlace(p));};return e;}
function elPin(col,tx){const e=document.createElement('span');e.className='mk-pin';e.dataset.ancla='bottom';e.style.setProperty('--c',col);e.innerHTML=svg('ir',2.4)+(tx?`<b>${esc(tx)}</b>`:'');return e;}
function sincronizar(){
  if(!mapa||!estiloListo)return;
  mapa.getSource('ruta').setData(fc(dibRuta.filter(r=>r.pts&&r.pts.length>3).map(r=>linea(r.pts,{alt:r.alt?1:0,pie:r.punteado?1:0,col:r.col||COL.bondi,ancho:r.ancho||5}))));
  const f=[],vivas=new Set();puntos.clear();
  const add=(x,y,r,col,p)=>{const id='p'+puntos.size;puntos.set(id,p);f.push(punto(x,y,{r,col,id}));};
  if(S.cercaRes&&S.cercaRes.marcas)S.cercaRes.marcas.forEach(q=>add(q.x,q.y,7,COL.bondi,q));
  if(S.capas.facus)L.places.filter(q=>q.k==='f'&&!q.prim).forEach(q=>add(q.wx,q.wy,6.5,'#7C5CFC',q.place||q));
  (API.aportes||[]).filter(a=>(a.tipo==='lugar'||a.tipo==='atajo')&&a.lat!=null).forEach(a=>add(wx(a.lon),wy(a.lat),7,a.tipo==='atajo'?'#FFB400':'#10B765',{k:'ap'+a.id,nombre:a.titulo||a.texto||'Aporte',x:wx(a.lon),y:wy(a.lat),sub:a.detalle||a.texto||''}));
  if(S.capas.guia)(API.guia||[]).forEach(q=>add(wx(q.lon),wy(q.lat),6,'#10B765',{k:'g'+q.id,nombre:q.titulo,x:wx(q.lon),y:wy(q.lat),sub:q.dato||q.bajada||''}));
  mapa.getSource('puntos').setData(fc(f));
  const vis=(id,v)=>mapa.getLayer(id)&&mapa.setLayoutProperty(id,'visibility',v?'visible':'none');
  vis('subte',S.capas.subte);vis('estaciones',S.capas.subte);vis('edificios-3d',trid&&vistaBase==='mapa');
  if(S.capas.facus)L.places.filter(q=>q.prim).forEach(q=>{const k='f'+q.n;vivas.add(k);if(!marcas.has(k)){const e=elPin(COL.agenda,q.n.replace(' · Puerto Madero',''));e.onclick=ev=>{ev.stopPropagation();abrirP(q.place);};marcador(k,e,[alon(q.wx),alat(q.wy)]);}});
  if(S.capas.amigos){const me=yo();conCasa().forEach(p=>{const k='a'+p.id;vivas.add(k);if(!marcas.has(k))marcador(k,elAmigo(p,me&&p.id===me.id),cc(p.x,p.y));});}
  dibRuta.forEach((r,i)=>{if(r.fin){const k='fin'+i;vivas.add(k);marcador(k,marcas.get(k)?.getElement()||elPin('#FF3B30'),cc(r.fin[0],r.fin[1]));}});
  if(S.marca){vivas.add('marca');marcador('marca',marcas.get('marca')?.getElement()||elPin('#FFB400'),cc(S.marca.x,S.marca.y));}
  limpiarMarcas(vivas);
}
function pedir(){if(sucio)return;sucio=true;requestAnimationFrame(()=>{sucio=false;sincronizar();});}
function bajoPanel(){const h=$('hoja');return h&&!$('raiz').classList.contains('mapa-grande')?Math.min(h.offsetHeight-(+h.dataset.y||0),(mapa?.getContainer().clientHeight||600)*.6):96;}
function irA(x,y,s,dur=480){if(!mapa)return;const z=Math.max(9,Math.min(19,aZoom(s)));const red=matchMedia('(prefers-reduced-motion:reduce)').matches;mapa.easeTo({center:cc(x,y),zoom:z,duration:red?0:dur,padding:{bottom:bajoPanel()},easing:t=>1-Math.pow(1-t,4)});}
function encuadrar(pts,marg=60){
  if(!mapa)return;let a=1e9,b=1e9,c=-1e9,d=-1e9;for(let i=0;i<pts.length;i+=2){a=Math.min(a,pts[i]);c=Math.max(c,pts[i]);b=Math.min(b,pts[i+1]);d=Math.max(d,pts[i+1]);}
  if(a>c)return;mapa.fitBounds([cc(a,d),cc(c,b)],{padding:{top:marg+40,left:marg,right:marg,bottom:bajoPanel()+30},duration:700,maxZoom:16.5});
}
function abrirP(p){reg(p);S.marca=null;abrirGlobo(p);pedir();}
function toque(e){
  const c=mapa.queryRenderedFeatures([[e.point.x-13,e.point.y-13],[e.point.x+13,e.point.y+13]],{layers:['puntos']});
  if(c.length){const p=puntos.get(c[0].properties.id);if(p){abrirP(p);return;}}
  const x=wx(e.lngLat.lng),y=wy(e.lngLat.lat),pl={nombre:esquinaDe(x,y)||'Este punto',x,y,tipo:'punto'};reg(pl);S.marca=pl;abrirGlobo(pl);pedir();
}
async function crearMapa(contenedor){
  maplibre=(await import('maplibre-gl')).default;
  mapa=new maplibre.Map({container:contenedor,style:estiloBase(),center:[-58.40,-34.60],zoom:13,minZoom:9,maxZoom:19,maxBounds:[[-59.3,-35.25],[-57.6,-34.0]],attributionControl:false,fadeDuration:120,maxPitch:60,pitchWithRotate:false,dragRotate:false});
  mapa.addControl(new maplibre.AttributionControl({compact:true}),'bottom-left');mapa.touchZoomRotate.disableRotation();mapa.touchPitch.disable();mapa.keyboard.disableRotation();
  mapa.on('style.load',()=>{estiloListo=false;instalarCapas();});
  mapa.once('idle',()=>{document.querySelector('.maplibregl-compact-show')?.classList.remove('maplibregl-compact-show');});
  mapa.on('click',toque);
  mapa.on('error',e=>{if(!mapa.isStyleLoaded()&&!S.avisoRed){S.avisoRed=1;aviso('El mapa de fondo tarda en cargar. Revisá tu conexión.');}});
}
function cambiarBase(v){if(v===vistaBase||!mapa)return;vistaBase=v;estiloListo=false;for(const [,m] of marcas)m.remove();marcas.clear();mapa.setStyle(estiloBase(),{diff:false});pintarCapas();}
function alternar3D(){trid=!trid;if(trid&&vistaBase==='satelite'){cambiarBase('mapa');}mapa.easeTo({pitch:trid?58:0,zoom:trid?Math.max(mapa.getZoom(),15.5):mapa.getZoom(),duration:700});pedir();pintarCapas();}
function abrirGlobo(p){
  const g=$('globo');g.hidden=false;
  let sub=p.sub||p.d||'';if(p.tipo==='persona')sub=p.barrio||'';
  g.innerHTML=`<b>${esc(p.nombre)}${sub?`<small>${esc(sub)}</small>`:''}</b><button class="btn pri chico" data-a="ir" data-k="${esc(p.k)}">Cómo llego</button><button class="btn sec2 chico" data-a="cerca-de" data-k="${esc(p.k)}">Qué hay cerca</button><button class="ico-btn" data-a="cerrar-globo" aria-label="Cerrar">✕</button>`;
}

/* ───────── Vistas ───────── */
const TABS=[['ir','Cómo llego'],['cerca','Qué hay cerca'],['junta','Dónde juntarnos']];
function pintarTabs(){$('tabs').innerHTML=TABS.map(([id,n])=>`<button class="seg" role="tab" aria-selected="${S.tab===id}" data-a="tab" data-t="${id}">${n}</button>`).join('');}
function pintarCapas(){$('capas').innerHTML=[['amigos','Amigos'],['facus','Facus'],['subte','Subte'],['guia','Guía']].map(([k,n])=>`<button class="capa" data-a="capa" data-c="${k}" aria-pressed="${S.capas[k]}">${n}</button>`).join('');
  const v=$('vistas');if(v)v.innerHTML=[['mapa','Mapa'],['satelite','Satélite']].map(([k,n])=>`<button data-a="base" data-v="${k}" aria-pressed="${vistaBase===k}">${n}</button>`).join('')+`<button data-a="tres" aria-pressed="${trid}">3D</button>`;}
function render(){
  pintarTabs();
  const P=$('panel'),v={ir:vistaIr,cerca:vistaCerca,junta:vistaJunta}[S.tab];
  P.innerHTML=`<div class="pila">${v()}</div>`;
}
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
    const r=dijkstraDesde(S.desde);
    const am=conCasa().filter(p=>p.id!==API.yoId).map(p=>({p,m:minPie(r,p)})).sort((a,b)=>a.m-b.m);
    const bloque=(arr,ic)=>arr.map(q=>`<button class="item" data-a="ir" data-k="${esc(reg(q.place||q))}"><span class="ic">${svg(ic)}</span><span class="q"><b>${esc(q.nombre||q.place.nombre)}</b><small>${esc(q.d||q.sub||'')}</small></span><span class="v">${svg('flecha')}</span></button>`).join('').replace(/<span class="v"><svg[^>]*>.*?<\/svg><\/span>/g,'');
    return `<h2 class="titulo">¿A dónde querés ir?</h2>
    <div class="campo"><label for="m-buscar">Buscá un lugar, una dirección o una esquina</label><input id="m-buscar" type="search" autocomplete="off" placeholder="Ej: Santa Fe 2100 o Callao y Corrientes" value="${esc(S.buscar)}"></div>
    <div id="m-sugerencias"></div>
    <button class="item" style="padding:0;min-height:44px" data-a="desde"><span class="q"><small>Salís de</small><b>${esc(S.desde.nombre)} <span style="color:var(--bondi);font-weight:700;font-size:15px">cambiar</span></b></span></button>
    ${S.elegirDesde?`<div class="chipera"><button class="chip" data-a="gps">Donde estoy ahora</button>${conCasa().map(p=>`<button class="chip" data-a="desde-sel" data-k="${esc(p.k)}" aria-pressed="${S.desde.k===p.k}">${esc(p.nombre)}</button>`).join('')}</div>`:''}
    ${uca?`<button class="grande" data-a="ir" data-k="${esc(uca.place.k)}">${svg('uca')}<span class="q"><b>A ${esc(uca.n.split(' · ')[0])}</b><small>${esc(uca.d||'')}</small></span>${svg('flecha')}</button>`:''}
    ${favs.length?`<h3 class="sec">Tus guardados</h3><div class="lista">${bloque(favs,'guardar')}</div>`:''}
    ${freq.length?`<h3 class="sec">Lo último que buscaste</h3><div class="lista">${bloque(freq,'ir')}</div>`:''}
    <h3 class="sec">Amigos</h3>
    <div class="grilla-gente">${am.map(({p,m})=>`<button class="persona" data-a="ir" data-k="${esc(reg(casaPlace(p)))}">${avatar(p)}<span class="q"><b>${esc(p.nombre)}</b><small>${m} min a pie</small></span></button>`).join('')}</div>
    <h3 class="sec">Facultades</h3><div class="lista">${bloque(L.places.filter(q=>q.k==='f').slice(1),'uca')}</div>
    <h3 class="sec">Para salir</h3><div class="lista">${bloque(L.places.filter(q=>q.k==='p'),'lugar')}</div>
    <h3 class="sec">Viajes largos</h3><div class="lista">${bloque(L.places.filter(q=>q.k==='t'),'bus')}</div>`;
  }
  /* resultado */
  const pl=S.plan,op=pl.ops[S.sel];
  const fav=M.favs.includes(S.dest.k);
  return `<div class="ruta-cab"><button class="ico-btn" data-a="volver" aria-label="Volver">${svg('volver',2.4)}</button><div class="t">${esc(S.dest.nombre)}<small>Desde ${esc(S.desde.nombre==='Tu casa'?'tu casa':S.desde.nombre)}</small></div><button class="ico-btn" data-a="fav" aria-pressed="${fav}" aria-label="Guardar destino" style="color:${fav?'var(--ojo)':'inherit'}">${svg('guardar',fav?3:2)}</button></div>
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
  return `<div class="op-det">
    <p><b>Salís ${hhmm(sale)}, llegás ${hhmm(llega)}.</b></p>${bar}
    ${o.tipo==='pie'?variantesHtml():''}
    <div class="linea-tiempo">${o.pp.map(pierna).join('')}</div>
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
  if(!S.varPie)S.varPie=variantesPie(S.desde,S.dest,S.ctx);
  const base=S.varPie[0];if(!base)return '';
  const u=[];S.varPie.forEach(v=>{if(!u.some(q=>Math.abs(q.len-v.len)<25&&Math.abs(q.av-v.av)<60))u.push(v);});
  if(u.length<2)return `<div class="nota"><h3>Por dónde es más corto</h3><p>Esta es la opción más corta y no hay otra que cambie mucho el camino.</p></div>`;
  return `<div class="pila" style="gap:8px"><h3 style="font-size:17px">Por dónde ir</h3>${u.map(v=>`<button class="var" aria-pressed="${(S.varSel||'pie')===v.id}" data-a="var" data-v="${v.id}"><span class="q"><b>${v.nom}</b><small>${v.des}</small></span><span class="v">${Math.round(v.seg/60)} min<br><small>${v===base?km(v.len):'+'+Math.max(0,Math.round((v.len-base.len)/115))+' cuadras'}</small></span></button>`).join('')}</div>`;
}
function notaDepende(o){
  const c=S.ctx,r=[],f=franja(c),pie=S.plan.ops.find(x=>x.tipo==='pie'),trans=o.pp.filter(p=>p.linea);
  if(o.tipo==='bus'||o.tipo==='subte'){
    const p=trans[0];
    r.push(`Cuánto tarde en pasar: en el mejor caso llegás en ${Math.round(o.dMin)} min, y si recién se fue, en ${Math.round(o.dMax)}.`);
    if(o.tipo==='bus'&&(f==='am'||f==='pm')){const ride=trans.reduce((a,q)=>a+q.seg,0),val=ride*(VBUS[f]/VBUS.val);if(ride-val>90)r.push(`Es ${FRANJA[f]}: el tránsito te suma unos ${Math.round((ride-val)/60)} min comparado con el mediodía.`);}
    if(pie&&pie.min<75){const ini=o.pp[0].t==='pie'?o.pp[0].seg:0,marg=(pie.min*60-(o.min*60-(p.espera||0)))/60;if(marg>=2&&marg<60)r.push(`Si el ${p.linea} no aparece en ${Math.round(marg)} min, ya te conviene caminar.`);}
    if(o.tipo==='subte'){const a={hab:'23:30',sab:'24:00',dom:'22:30'}[c.dia];r.push(`El subte funciona hasta cerca de las ${a}.`);}
  }
  if(o.tipo==='pie'){if(c.lluvia)r.push('Con lluvia ya sumé el paso más lento y paradas más cerca.');else if(o.min>25)r.push(`Son ${Math.round(o.min)} min parejos: acá casi no influye la hora.`);}
  if(o.tipo==='auto'){r.push(`Es ${FRANJA[f]}: puede ir de ${Math.round(o.dMin)} a ${Math.round(o.dMax)} min según el tránsito.`);r.push('El recorrido no tiene en cuenta las manos de las calles: Google Maps lo ajusta.');r.push('El precio es un cálculo con tarifa de taxi. Uber o Cabify cambian según la demanda.');}
  if(o.tipo==='bici')r.push('Elegí calles antes que avenidas. El plano no marca las ciclovías todavía.');
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
  for(const [cat,n] of k){let b=null,bd=1e9;for(const q of L.pois){if(q[0]!==cat)continue;const e=Math.hypot(q.wx-d.x,q.wy-d.y);if(e<bd){bd=e;b=q;}}if(b&&bd<650)o.push(`${n}: ${esc(b[3])}, a ${cuadras(bd*1.25)}`);}
  if(!o.length)return '';return `<div class="nota"><h3>Cerca de donde llegás</h3><ul>${o.map(x=>`<li>${x}</li>`).join('')}</ul></div>`;
}

/* ───── helpers de distancia ───── */
function dijkstraDesde(p){const c=`pie|${p.x|0}|${p.y|0}`;if(CACHE.has(c))return CACHE.get(c);const W=perfil('pie',{dia:'hab',min:720}),r=dijkstra(semillas(p,W,cl=>cl!==4).sem,W);CACHE.set(c,r);return r;}
function minPie(r,p){const {sem}=semillas(p,r.W,cl=>cl!==4);if(!sem.length)return 99;return minutos(Math.min(r.dist[sem[0].n]+sem[0].c,r.dist[sem[1].n]+sem[1].c));}
function viajar(){
  S.plan=planificar(S.desde,S.dest,S.ctx);S.varPie=null;S.varSel=null;
  const ops=S.plan.ops,ok=ops.filter(o=>o.tipo!=='auto'&&(M.bici||o.tipo!=='bici')).sort((a,b)=>(a.min+a.costo/260)-(b.min+b.costo/260))[0]||ops[0];
  ops.forEach(o=>{if(o.marca==='Más rápido'&&(o.tipo==='auto'||o.tipo==='bici'&&!M.bici)&&ok!==o)o.marca=o.tipo==='auto'?'Más rápido':'Más rápido en bici';});
  if(ok){ok.marca='Te conviene';ops.splice(ops.indexOf(ok),1);ops.unshift(ok);S.sel=0;}
  /* colectivo que tarda más que caminar: no suma */
  const pie=ops.find(o=>o.tipo==='pie');
  if(pie&&!S.ctx.lluvia){const f=ops.filter(o=>!((o.tipo==='bus'||o.tipo==='subte')&&o.min>pie.min+1));if(f.length!==ops.length){const s=ops[S.sel];S.plan.ops=f;S.sel=Math.max(0,f.indexOf(s));if(f.indexOf(s)<0&&f.includes(pie)){pie.marca='Te conviene';S.sel=f.indexOf(pie);}}}
  dibujarOpcion(true);
}
function dibujarOpcion(fit){
  const o=S.plan&&S.plan.ops[S.sel];dibRuta=[];if(!o){pedir();return;}
  const alt=S.varPie&&o.tipo==='pie'?S.varPie.filter(v=>v.id!==(S.varSel||'pie')):[];
  alt.forEach(v=>dibRuta.push({pts:v.pts,alt:1}));
  const elegido=S.varPie&&o.tipo==='pie'&&S.varSel?S.varPie.find(v=>v.id===S.varSel):null;
  (elegido?[{t:'pie',pts:elegido.pts}]:o.pp).forEach(p=>{
    const col=p.t==='bus'?COL.bondi:p.t==='subte'?T.meta.subteCol[p.linea]:p.t==='auto'||p.t==='bici'?COL.tinta:COL.tinta;
    dibRuta.push({pts:p.pts,col,ancho:p.t==='pie'?4:6,punteado:p.t==='pie'});
  });
  dibRuta.push({pts:[],fin:[S.dest.x,S.dest.y]});
  if(fit)encuadrar(o.pp.flatMap(p=>Array.from(p.pts)));else pedir();
}
const lugarPorK=k=>REG.get(k);

/* ───── Cerca ───── */
const CATS=[['amigos','Amigos','junta'],['paradas','Colectivos','bus'],['subte','Subte','subte'],['super','Súper y chinos','super'],['f','Farmacias','farma'],['a','Cajeros','atm'],['cafeteria','Cafés','cafe'],['lavadero','Lavaderos','lavadero'],['gym','Gimnasios','gym'],['fotocopias','Fotocopias','copia'],['c','Bares notables','cafe'],['guia','De la guía','guardar'],['plazas','Plazas','plaza'],['h','Hospitales','hosp'],['grupo','Del grupo','guardar']];
const LIVE={super:'nwr[shop~"^(supermarket|convenience)$"]',cafeteria:'nwr[amenity=cafe]',lavadero:'nwr[shop=laundry]',gym:'nwr[leisure=fitness_centre]',fotocopias:'nwr[shop=copyshop]'};
const CACHE_VIVO=new Map();
function cercaEnVivo(cat,de,r,fila){
  const c=`${cat}|${Math.round(de.x/250)}|${Math.round(de.y/250)}`,v=CACHE_VIVO.get(c);
  if(!v){CACHE_VIVO.set(c,{cargando:1});
    const la=alat(de.y),lo=alon(de.x),q=`[out:json][timeout:12];${LIVE[cat]}(around:900,${la.toFixed(5)},${lo.toFixed(5)});out center 40;`;
    fetch('https://overpass-api.de/api/interpreter',{method:'POST',body:'data='+encodeURIComponent(q)}).then(x=>x.json()).then(j=>{
      CACHE_VIVO.set(c,{l:j.elements.map(e=>({n:e.tags&&(e.tags.name||e.tags.brand),la:e.lat??e.center?.lat,lo:e.lon??e.center?.lon,dir:[e.tags?.['addr:street'],e.tags?.['addr:housenumber']].filter(Boolean).join(' ')})).filter(e=>e.n&&e.la)});
      if(S.cat===cat)render();
    }).catch(()=>{CACHE_VIVO.set(c,{error:1});if(S.cat===cat)render();});
    return '<p class="vacio">Buscando en OpenStreetMap…</p>';}
  if(v.cargando)return '<p class="vacio">Buscando en OpenStreetMap…</p>';
  if(v.error)return '<p class="vacio">No pude buscar ahora. Probá de nuevo en un rato.</p>';
  if(!v.l.length)return '<p class="vacio">No encontré nada a menos de 900 metros.</p>';
  const it=v.l.map(e=>{const pl={nombre:e.n,x:wx(e.lo),y:wy(e.la),tipo:'poi',sub:e.dir};return {pl,m:minPie(r,pl)};}).sort((a,b)=>a.m-b.m).slice(0,15);
  return `<div class="lista">${it.map(({pl,m})=>{S.cercaRes.marcas.push({...pl,k:reg(pl)});return fila('ir',pl.nombre,pl.sub||'',m,pl.k);}).join('')}</div><p class="expl">Datos de OpenStreetMap, cargados por vecinos. Puede faltar algún local.</p>`;
}
function sinOrigen(){return `<h2 class="titulo">¿Desde dónde salís?</h2><p class="expl">Todavía no cargaste tu casa. Podés hacerlo en tu perfil, o usar tu ubicación ahora.</p><button class="btn pri" data-a="gps">Usar donde estoy ahora</button><a class="btn sec2" href="/perfil">Cargar mi casa</a>`;}
function vistaCerca(){
  const me=yo();if(!S.cercaDe&&S.desde)S.cercaDe=S.desde;if(!S.cercaDe&&me&&me.x!=null)S.cercaDe=casaPlace(me);
  if(!S.cercaDe)return sinOrigen();
  const de=S.cercaDe;
  const r=S.cat?resultadosCerca(S.cat,de):null;
  return `<h2 class="titulo">Qué hay cerca de ${esc(de.nombre==='Tu casa'?'tu casa':de.nombre)}</h2>
  <p class="expl">Elegí qué buscás. Lo ordeno por minutos caminando de verdad, por las calles.</p>
  ${de.nombre!=='Tu casa'?`<button class="btn sec2 chico" data-a="cerca-yo">Volver a mi casa</button>`:''}
  <div class="chipera">${CATS.map(([id,n])=>`<button class="chip" aria-pressed="${S.cat===id}" data-a="cat" data-c="${id}">${n}</button>`).join('')}</div>
  ${r?`<div id="m-res-cerca" class="pila">${r}</div>`:`<div class="lista">${CATS.slice(0,4).map(([id,n,ic])=>`<button class="item" data-a="cat" data-c="${id}"><span class="ic">${svg(ic)}</span><span class="q"><b>${n}</b><small>${{amigos:'Quién vive más cerca',paradas:'Qué líneas tenés a mano',subte:'Las estaciones a las que llegás a pie',f:'Las más cercanas'}[id]}</small></span></button>`).join('')}</div>`}
  
  `;
}
function resultadosCerca(cat,de){
  const r=dijkstraDesde(de);S.cercaRes={marcas:[]};
  const fila=(ic,n,sub,m,k,extra='')=>`<button class="item" data-a="ver" data-k="${esc(k)}"><span class="ic">${svg(ic)}</span><span class="q"><b>${esc(n)}</b><small>${esc(sub)}</small>${extra}</span><span class="v">${m}<small>min</small></span></button>`;
  if(cat==='amigos'){const l=conCasa().filter(p=>p.id!==API.yoId).map(p=>({p,m:minPie(r,p)})).sort((a,b)=>a.m-b.m);
    return `<div class="lista">${l.map(({p,m})=>`<button class="item" data-a="ver" data-k="${esc(reg(casaPlace(p)))}">${avatar(p)}<span class="q"><b>${esc(p.nombre)}</b><small>${esc(p.barrio)}</small></span><span class="v">${m}<small>min</small></span></button>`).join('')}</div>`;}
  if(cat==='paradas'){
    const ctx=S.ctx,lim=9*60,mej=new Map();
    for(let s=0;s<T.S;s++){const n=T.sn[s];if(n<0||T.stops[s].length>4)continue;if(Math.abs(T.sx[s]-de.x)>900||Math.abs(T.sy[s]-de.y)>900)continue;const t=r.dist[n];if(t>lim)continue;
      const li=T.por[s];for(let i=0;i<li.length;i+=2){const p=T.pats[li[i]];if(p.sub)continue;const h=frecuencia(p.l,ctx);const key=p.l;const o=mej.get(key);if(!o||t<o.t)mej.set(key,{t,s,p,pi:li[i],h});}}
    const l=[...mej.values()].sort((a,b)=>a.t-b.t).slice(0,24);
    if(!l.length)return '<p class="vacio">No hay paradas a menos de 9 minutos.</p>';
    return `<p class="expl">${mej.size} líneas a menos de 9 min caminando. Tocá una para ver el recorrido.</p><div class="lista">${l.map(q=>`<button class="item" data-a="linea" data-i="${q.pi}"><span class="ln">${esc(q.p.l)}</span><span class="q"><b style="font-size:16px">${esc(nomParada(q.s))}</b><small>${q.h?`Pasa cada ${q.h} min`:'No pasa a esta hora'}</small></span><span class="v">${minutos(q.t)}<small>min</small></span></button>`).join('')}</div>`;}
  if(cat==='subte'){const l=[];for(const s of CAPAS.est){const t=r.dist[T.sn[s]];if(t<25*60)l.push({s,t});}l.sort((a,b)=>a.t-b.t);const u=l.slice(0,10);
    return `<div class="lista">${u.map(q=>{const li=T.stops[q.s][4];const pl={nombre:T.stops[q.s][3],x:T.sx[q.s],y:T.sy[q.s],tipo:'est'};return `<button class="item" data-a="ver" data-k="${esc(reg(pl))}"><span class="ln sub ${li==='H'?'subH':''}" style="background:${T.meta.subteCol[li]}">${li}</span><span class="q"><b>${esc(T.stops[q.s][3].replace('Est. ',''))}</b><small>Línea ${li}, cada ${subteFrec(li,S.ctx)} min</small></span><span class="v">${minutos(q.t)}<small>min</small></span></button>`;}).join('')}</div>`;}
  if(cat==='plazas'){const l=L.parks.map(p=>({p,x:wx(p[2]),y:wy(p[3])})).filter(q=>q.p[0]&&Math.hypot(q.x-de.x,q.y-de.y)<1800).map(q=>{q.m=minPie(r,q);return q;}).sort((a,b)=>a.m-b.m).slice(0,12);
    if(!l.length)return '<p class="vacio">No encontré plazas cerca.</p>';
    return `<div class="lista">${l.map(q=>{const pl={nombre:q.p[0],x:q.x,y:q.y,tipo:'plaza'};S.cercaRes.marcas.push({...pl,k:reg(pl)});return fila('plaza',q.p[0],`${(q.p[1]/10000).toFixed(1).replace('.',',')} hectáreas`,q.m,pl.k);}).join('')}</div>`;}
  if(LIVE[cat])return cercaEnVivo(cat,de,r,fila);
  if(cat==='guia'){const it=(API.guia||[]).map(q=>{const pl={nombre:q.titulo,x:wx(q.lon),y:wy(q.lat),tipo:'poi',sub:q.dato||q.bajada||''};return {pl};}).filter(q=>Math.hypot(q.pl.x-de.x,q.pl.y-de.y)<2500).map(q=>({...q,m:minPie(r,q.pl)})).sort((a,b)=>a.m-b.m).slice(0,15);if(!it.length)return '<p class="vacio">No hay datos de la guía cerca de acá.</p>';return `<div class="lista">${it.map(({pl,m})=>{S.cercaRes.marcas.push({...pl,k:reg(pl)});return fila('idea',pl.nombre,pl.sub,m,pl.k);}).join('')}</div>`;}
  if(cat==='grupo'){const a=(API.aportes||[]).filter(a=>a.tipo==='lugar'&&a.lat!=null);if(!a.length)return `<div class="vacio">Todavía nadie sumó lugares. Se agregan desde Gente.</div>`;
    return `<div class="lista">${a.map(q=>{const pl={nombre:q.titulo,x:wx(q.lon),y:wy(q.lat),tipo:'aporte',sub:q.nota};return fila('guardar',q.titulo,q.nota||'',minPie(r,pl),reg(pl));}).join('')}</div>`;}
  const IC2={f:'farma',a:'atm',c:'cafe',h:'hosp'},lim=cat==='h'?6000:cat==='c'?3500:1500,l=L.pois.filter(q=>q[0]===cat&&Math.hypot(q.wx-de.x,q.wy-de.y)<lim).sort((a,b)=>Math.hypot(a.wx-de.x,a.wy-de.y)-Math.hypot(b.wx-de.x,b.wy-de.y)).slice(0,12);
  if(!l.length)return '<p class="vacio">No encontré nada cerca.</p>';
  const it=l.map(q=>{const pl={nombre:q[3],x:q.wx,y:q.wy,tipo:'poi',sub:q[4]};return {q,pl,m:minPie(r,pl)};}).sort((a,b)=>a.m-b.m);
  return `<div class="lista">${it.map(({q,pl,m})=>{S.cercaRes.marcas.push({...pl,k:reg(pl)});return fila(IC2[cat],q[3],q[4],m,pl.k);}).join('')}</div>${cat==='a'?'<p class="expl">Listado de cajeros de un relevamiento anterior: pueden haber cambiado.</p>':''}`;
}

/* ───── Tiempos en masa (una persona a todos lados) ───── */
function tablaDesde(p,ctx){
  const k=`${p.k}|${claveCtx(ctx)}`;if(CACHE.has(k))return CACHE.get(k);
  const W=perfil('pie',ctx),r=dijkstra(semillas(p,W,cl=>cl!==4).sem,W),a=new Float32Array(T.S).fill(Infinity);
  for(let s=0;s<T.S;s++){const n=T.sn[s];if(n>=0&&r.dist[n]<=800)a[s]=r.dist[n]+6;}
  const v=raptorTodo(a,ctx),o={r,best:v};CACHE.set(k,o);return o;
}
function raptorTodo(aO,c){
  const S2=T.S,prev=aO.slice(),best=aO.slice();let marc=[];for(let s=0;s<S2;s++)if(aO[s]<Infinity)marc.push(s);
  let tau=prev;
  for(let k=1;k<=2;k++){
    const t=tau.slice(),nu=new Set(),q=new Map();
    for(const s of marc){const l=T.por[s];for(let i=0;i<l.length;i+=2){const p=l[i],ix=l[i+1];if(!q.has(p)||q.get(p)>ix)q.set(p,ix);}}
    for(const [pi,ini] of q){const p=T.pats[pi],es=esperaDe(p,c);if(!es)continue;let base=Infinity,bi=-1;
      for(let i=ini;i<p.s.length;i++){const s=p.s[i];if(bi>=0){const ar=base+rideSeg(p,bi,i,c);if(ar<t[s]&&ar<best[s]){t[s]=ar;best[s]=ar;nu.add(s);}}
        const pr=tau[s];if(pr<Infinity){const c2=pr+es.w+(k>1?60:0);if(bi<0||c2<base+rideSeg(p,bi,i,c)){base=c2;bi=i;}}}}
    for(const s of [...nu]){const v=vecinas(s);for(let i=0;i<v.length;i+=2){const n=v[i],ar=t[s]+v[i+1]*1.25/1.3+20;if(ar<t[n]&&ar<best[n]){t[n]=ar;best[n]=ar;nu.add(n);}}}
    tau=t;marc=[...nu];if(!marc.length)break;
  }
  return best;
}
function tiempoA(tab,q){
  const {sem}=semillas(q,tab.r.W,cl=>cl!==4);const pie=Math.min(tab.r.dist[sem[0].n]+sem[0].c,tab.r.dist[sem[1].n]+sem[1].c);
  let tr=Infinity;const cxx=Math.floor(q.x/300),cyy=Math.floor(q.y/300);
  for(let i=-2;i<=2;i++)for(let j=-2;j<=2;j++){const a=T.sg.get((cxx+i)*100000+cyy+j);if(!a)continue;for(const s of a){const d=Math.hypot(T.sx[s]-q.x,T.sy[s]-q.y);if(d<650){const v=tab.best[s]+d*1.28/1.35;if(v<tr)tr=v;}}}
  return pie<=tr?{seg:pie,modo:'a pie'}:{seg:tr,modo:'en transporte'};
}

/* ───── Juntada ───── */
function vistaJunta(){
  const J=S.junta;if(!J.quien)J.quien=new Set(conCasa().map(p=>p.id));
  const elegidos=conCasa().filter(p=>J.quien.has(p.id));
  return `<h2 class="titulo">¿Dónde nos juntamos?</h2>
  <p class="expl">Marcá quiénes van. Busco la casa o el lugar donde el viaje sale más parejo para todos.</p>
  ${chipsCtx()}
  <div class="chipera">${conCasa().map(p=>`<button class="chip" aria-pressed="${J.quien.has(p.id)}" data-a="junta-p" data-id="${esc(p.id)}">${esc(p.nombre)}</button>`).join('')}</div>
  <button class="btn pri" data-a="junta-calc">Buscar el mejor lugar para ${elegidos.length}</button>
  <div id="m-junta-res">${J.res?resJunta():''}</div>`;
}
function calcJunta(){
  const J=S.junta,g=conCasa().filter(p=>J.quien.has(p.id));if(g.length<2){aviso('Elegí por lo menos dos personas.');return;}
  const ctx=S.ctx,cx0=g.reduce((a,p)=>a+p.x,0)/g.length,cy0=g.reduce((a,p)=>a+p.y,0)/g.length;
  const cand=g.map(p=>({...casaPlace(p),nombre:p.id===API.yoId?'Tu casa':`Casa de ${p.nombre}`,sub:p.barrio,casa:p.id}));
  L.pois.filter(q=>q[0]==='c').sort((a,b)=>Math.hypot(a.wx-cx0,a.wy-cy0)-Math.hypot(b.wx-cx0,b.wy-cy0)).slice(0,3).forEach(q=>cand.push({nombre:q[3],x:q.wx,y:q.wy,sub:`Café notable · ${q[4]}`,tipo:'poi'}));
  L.parks.filter(p=>p[0]&&p[1]>8000).map(p=>({p,x:wx(p[2]),y:wy(p[3])})).sort((a,b)=>Math.hypot(a.x-cx0,a.y-cy0)-Math.hypot(b.x-cx0,b.y-cy0)).slice(0,2).forEach(q=>cand.push({nombre:q.p[0],x:q.x,y:q.y,sub:'Plaza',tipo:'plaza'}));
  L.places.filter(q=>q.k==='p').sort((a,b)=>Math.hypot(a.wx-cx0,a.wy-cy0)-Math.hypot(b.wx-cx0,b.wy-cy0)).slice(0,2).forEach(q=>cand.push({...q.place,sub:q.d}));
  const tabs=g.map(p=>[p,tablaDesde(p,ctx)]);
  const res=cand.map(c=>{const t=tabs.map(([p,tb])=>{if(c.casa===p.id)return {p,seg:0,modo:'es su casa'};const v=tiempoA(tb,c);return {p,seg:v.seg,modo:v.modo};});
    const max=Math.max(...t.map(x=>x.seg)),sum=t.reduce((a,x)=>a+x.seg,0);return {c,t:t.sort((a,b)=>b.seg-a.seg),max,prom:sum/t.length,score:sum/t.length*.6+max*.4};}).sort((a,b)=>a.score-b.score);
  J.res=res.slice(0,5);J.elegido=0;dibujarJunta();render();const x=$('junta-res');if(x)$('panel').scrollTop=x.offsetTop-$('panel').offsetTop-8;
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

/* ───── Acciones ───── */
let tToast=null;function aviso(t){API.aviso(t);}
function irDestino(k){
  const p=REG.get(k);if(!p)return;S.dest=p;S.buscar='';$('globo').hidden=true;S.marca=null;S.cercaRes=null;S.cat=null;
  if(!S.desde){const me=yo();if(me&&me.x!=null)S.desde=casaPlace(me);}
  if(!S.desde){S.dest=null;S.tab='ir';render();return;}
  if(Math.hypot(p.x-S.desde.x,p.y-S.desde.y)<30){aviso('Ya estás ahí.');S.dest=null;return;}
  if(S.ctx.auto)S.ctx={...ahora(),lluvia:S.ctx.lluvia};
  S.tab='ir';viajar();M.recientes=[k,...M.recientes.filter(x=>x!==k)].slice(0,8);
  if(!k.startsWith('p:')&&!k.startsWith('l:')){M.conocidos={...(M.conocidos||{}),[k]:{k,nombre:p.nombre,x:p.x,y:p.y,tipo:p.tipo,sub:p.sub}};}
  guardar();render();$('raiz').classList.remove('mapa-grande');$('panel').scrollTop=0;
}
function recalc(){CACHE.forEach((v,k)=>{if(k.includes('|')&&!k.startsWith('pie'))CACHE.delete(k);});if(S.plan&&S.dest)viajar();S.junta.res=null;render();}
function gps(){
  if(!navigator.geolocation){aviso('Tu navegador no da la ubicación.');return;}
  aviso('Buscando dónde estás…');
  navigator.geolocation.getCurrentPosition(pos=>{
    const x=wx(pos.coords.longitude),y=wy(pos.coords.latitude);
    if(Math.abs(alat(y)+34.6)>.15||Math.abs(alon(x)+58.44)>.2){aviso('El plano cubre solo la Ciudad de Buenos Aires.');return;}
    S.desde={k:'gps',nombre:'Donde estás',x,y,tipo:'punto'};REG.set('gps',S.desde);S.cercaDe=S.desde;S.elegirDesde=false;CACHE.clear();render();irA(x,y,.3);
  },()=>aviso('No pude ver tu ubicación. Revisá el permiso del navegador.'),{enableHighAccuracy:true,timeout:9000});
}
const ACC={
  tab(e){S.tab=e.dataset.t;if(S.tab!=='ir'){dibRuta=[];}else if(S.plan&&S.dest)dibujarOpcion(false);if(S.tab!=='cerca')S.cercaRes=null;render();pedir();$('panel').scrollTop=0;$('raiz').classList.remove('mapa-grande');},
  capa(e){const k=e.dataset.c;S.capas[k]=!S.capas[k];pintarCapas();pedir();},
  base(e){if(trid&&e.dataset.v==='satelite'){trid=false;mapa.easeTo({pitch:0,duration:400});}cambiarBase(e.dataset.v);},
  tres(){alternar3D();},
  ir(e){irDestino(e.dataset.k);},
  gps,
  'cerrar-globo'(){$('globo').hidden=true;S.marca=null;pedir();},
  'cerca-de'(e){const p=REG.get(e.dataset.k);S.cercaDe=p;S.cat=S.cat||'amigos';S.tab='cerca';$('globo').hidden=true;S.marca=null;dibRuta=[];render();pedir();},
  'cerca-yo'(){const me=yo();S.cercaDe=me&&me.x!=null?casaPlace(me):null;S.cercaRes=null;render();pedir();},
  volver(){S.dest=null;S.plan=null;dibRuta=[];render();pedir();},
  op(e){const i=+e.dataset.i;S.sel=i;S.varSel=null;render();dibujarOpcion(true);},
  var(e){S.varSel=e.dataset.v;render();dibujarOpcion(false);},
  fav(){const k=S.dest.k;M.favs=M.favs.includes(k)?M.favs.filter(x=>x!==k):[k,...M.favs];guardar();render();},
  desde(){S.elegirDesde=!S.elegirDesde;render();},
  'desde-sel'(e){const p=conCasa().find(q=>q.k===e.dataset.k);S.desde=casaPlace(p);S.elegirDesde=false;render();},
  'ctx-abrir'(){S.ctxAbierto=!S.ctxAbierto;render();},
  'ctx-ahora'(){const l=S.ctx.lluvia;S.ctx={...ahora(),lluvia:l};recalc();},
  'ctx-dia'(e){S.ctx={...S.ctx,dia:e.dataset.d,auto:false};recalc();},
  lluvia(){S.ctx={...S.ctx,lluvia:!S.ctx.lluvia};recalc();},
  'tengo-bici'(){M.bici=!M.bici;guardar();recalc();},
  cat(e){S.cat=e.dataset.c;render();const q=S.cercaRes&&S.cercaRes.marcas;if(q&&q.length){encuadrar([S.cercaDe.x,S.cercaDe.y,...q.flatMap(m=>[m.x,m.y])]);}else pedir();const r=$('res-cerca');if(r)$('panel').scrollTop=r.offsetTop-$('panel').offsetTop-8;},
  ver(e){const p=REG.get(e.dataset.k);if(!p)return;irA(p.x,p.y,Math.max(aEscala(),.4));abrirGlobo(p);},
  linea(e){const p=T.pats[+e.dataset.i];dibRuta=[{pts:Array.from(p.g),col:COL.bondi,ancho:5}];encuadrar(Array.from(p.g));aviso(`Línea ${p.l}: ${limpioH(p.h)}`);},
  'junta-p'(e){const s=S.junta.quien,i=e.dataset.id;s.has(i)?s.delete(i):s.add(i);S.junta.res=null;render();},
  'junta-calc'(e){e.textContent='Calculando…';setTimeout(calcJunta,30);},
  'junta-sel'(e){S.junta.elegido=+e.dataset.i;dibujarJunta();render();},
  proponer(){const r=S.junta.res[S.junta.elegido];API.proponerJuntada({lugar:r.c.nombre,lat:alat(r.c.y),lon:alon(r.c.x)});},
  mandar(){const o=S.plan.ops[S.sel];API.compartir({texto:textoViaje(o),adjunto:{nombre:S.dest.nombre,lat:alat(S.dest.y),lon:alon(S.dest.x)}});},
  salgo(){const o=S.plan.ops[S.sel];API.aportar({tipo:'salida',titulo:`Salgo a ${S.dest.nombre}`,nota:`${hhmm(S.ctx.min)}, ${o.titulo==='A pie'?'a pie':o.titulo}`});}
};
function pintarSugerencias(){
  const q=sinTilde(S.buscar).trim(),b=$('sugerencias');if(!b)return;if(q.length<2){b.innerHTML='';return;}
  const r=[];conCasa().forEach(p=>{if(sinTilde(p.nombre).includes(q))r.push({...casaPlace(p),sub:p.barrio});});
  L.places.forEach(p=>{if(sinTilde(p.n).includes(q))r.push({...p.place,sub:p.d});});
  L.pois.filter(p=>p[0]==='c'&&sinTilde(p[3]).includes(q)).slice(0,3).forEach(p=>r.push({nombre:p[3],x:p.wx,y:p.wy,sub:p[4],tipo:'poi'}));
  CAPAS.est.forEach(s=>{if(sinTilde(T.stops[s][3]).includes(q)&&r.length<7)r.push({nombre:T.stops[s][3],x:T.sx[s],y:T.sy[s],sub:`Subte línea ${T.stops[s][4]}`,tipo:'est'});});
  L.parks.filter(p=>p[0]&&sinTilde(p[0]).includes(q)).slice(0,3).forEach(p=>r.push({nombre:p[0],x:wx(p[2]),y:wy(p[3]),sub:'Plaza o parque',tipo:'plaza'}));
  geocodificar(S.buscar).forEach(g=>r.push(g));
  if(!r.length){b.innerHTML='<p class="expl">No lo encuentro. Probá con calle y altura, o con dos calles que se cruzan.</p>';return;}
  b.innerHTML=`<div class="lista">${r.slice(0,7).map(p=>`<button class="item" data-a="ir" data-k="${esc(reg(p))}"><span class="ic">${svg('ir')}</span><span class="q"><b>${esc(p.nombre)}</b><small>${esc(p.sub||'')}</small></span></button>`).join('')}</div>`;
}

/* ───── Datos: se bajan una sola vez por sesión ───── */
let datos=null;
export function cargarDatosMapa(){
  if(!datos)datos=(async()=>{
    const g=async u=>{const r=await fetch(u);if(!r.ok)throw new Error(u);return r.json();};
    const [c,t,l]=await Promise.all([g('/data/calles.json'),g('/data/transporte.json'),g('/data/lugares.json')]);
    cargarCalles(c);cargarTransporte(t);Object.assign(L,l);
    L.pois.forEach(q=>{q.wx=wx(q[1]);q.wy=wy(q[2]);});
    prepararCapas();
  })();
  return datos;
}
const SKELETON=`<div class="mp" id="m-raiz">
  <div class="stage" id="m-stage">
    <div id="m-mapa" aria-label="Mapa de Buenos Aires"></div>
    <div class="capas" id="m-capas"></div>
    <div class="zoom">
      <div class="vistas" id="m-vistas"></div>
      <button id="m-z-gps" aria-label="Ir a donde estoy">${svg('cerca')}</button>
    </div>
    <div id="m-globo" hidden></div>
    <div id="m-carga">Cargando el mapa…</div>
  </div>
  <div class="m-hoja" id="m-hoja">
    <div class="m-asa" id="m-asa"><i></i></div>
    <div class="mp-tabs" id="m-tabs" role="tablist"></div>
    <div id="m-panel" tabindex="-1"></div>
  </div>
</div>`;
let controladores=null,obs=null;
export async function montarMapa(raiz,api){
  API=api;raiz.innerHTML=SKELETON;
  try{const r=localStorage.getItem(CLAVE);if(r)M={...M,...JSON.parse(r)};}catch(e){}
  if(api.memoria)M={...M,...api.memoria};
  colores();pintarCapas();hojaArrastrable();
  const clic=e=>{const b=e.target.closest('[data-a]');if(!b||!raiz.contains(b))return;const f=ACC[b.dataset.a];if(f){e.preventDefault();f(b);}};
  const entra=e=>{if(e.target.id==='m-buscar'){S.buscar=e.target.value;pintarSugerencias();}};
  const cambia=e=>{if(e.target.id==='m-hora'&&e.target.value){const [h,m]=e.target.value.split(':').map(Number);S.ctx={...S.ctx,min:h*60+m,auto:false};recalc();}};
  raiz.addEventListener('click',clic);raiz.addEventListener('input',entra);raiz.addEventListener('change',cambia);
  const tema=()=>{const o=COL.oscuro;colores();if(o!==COL.oscuro&&vistaBase==='mapa'&&mapa){estiloListo=false;for(const [,m] of marcas)m.remove();marcas.clear();mapa.setStyle(estiloBase(),{diff:false});}else pedir();};
  const mo=new MutationObserver(tema);mo.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','style']});
  const mq=matchMedia('(prefers-color-scheme:dark)');mq.addEventListener('change',tema);
  $('z-gps').onclick=gps;
  controladores=()=>{raiz.removeEventListener('click',clic);raiz.removeEventListener('input',entra);raiz.removeEventListener('change',cambia);mo.disconnect();mq.removeEventListener('change',tema);obs&&obs.disconnect();};
  try{await cargarDatosMapa();await crearMapa($('mapa'));}catch(e){$('carga').textContent='No pude cargar el mapa. Revisá la conexión y volvé a entrar.';return;}
  L.places=(api.lugares||[]).map((q,i)=>{const wxx=wx(q.lon),wyy=wy(q.lat),k={facu:'f',salida:'p',transporte:'t'}[q.tipo];return {k,n:q.nombre,d:q.descripcion,wx:wxx,wy:wyy,prim:!!q.destacado,place:{k:'l:'+q.id,nombre:q.nombre,x:wxx,y:wyy,tipo:'lugar',d:q.descripcion,sub:q.descripcion}};});
  L.places.sort((a,b)=>b.prim-a.prim);L.places.forEach(q=>reg(q.place));
  armarPersonas();Object.values(M.conocidos||{}).forEach(q=>REG.set(q.k,q));
  S.desde=null;S.cercaDe=null;
  $('carga').hidden=true;
  const me=yo();if(me&&me.x!=null)irA(me.x,me.y,.17,0);else if(L.places[0])irA(L.places[0].wx,L.places[0].wy,.1,0);
  render();pedir();
  if(api.destino){const d=api.destino,p={nombre:d.nombre,x:wx(d.lon),y:wy(d.lat),tipo:'punto'};reg(p);if(api.soloVer){irA(p.x,p.y,.5,0);S.marca=p;abrirGlobo(p);pedir();}else irDestino(p.k);}
}
/* Panel que sube y baja como en Mapas del iPhone */
function hojaArrastrable(){
  const h=$('hoja'),a=$('asa');let ini=null;
  const topes=()=>{const H=h.offsetHeight;return [0,Math.max(0,H*.52),Math.max(0,H-148)];};
  const poner=(y,suave)=>{h.style.transition=suave?'transform .46s cubic-bezier(.32,.72,0,1)':'none';h.style.transform=`translateY(${y}px)`;h.dataset.y=y;$('raiz').classList.toggle('mapa-grande',y>=topes()[2]-2);};
  requestAnimationFrame(()=>poner(topes()[1],false));
  a.addEventListener('pointerdown',e=>{a.setPointerCapture(e.pointerId);ini={p:e.clientY,y:+h.dataset.y||0,t:performance.now()};poner(ini.y,false);});
  a.addEventListener('pointermove',e=>{if(ini)poner(Math.max(0,Math.min(topes()[2],ini.y+e.clientY-ini.p)),false);});
  const fin=e=>{if(!ini)return;const y=+h.dataset.y,dy=e.clientY-ini.p,v=dy/Math.max(1,performance.now()-ini.t),T_=topes();let dest=T_.reduce((m,q)=>Math.abs(q-y)<Math.abs(m-y)?q:m,T_[1]);if(Math.abs(v)>.5)dest=v>0?(T_.find(q=>q>ini.y+4)??T_[2]):([...T_].reverse().find(q=>q<ini.y-4)??0);if(Math.abs(dy)<4)dest=ini.y>=T_[1]?T_[ini.y>=T_[2]-2?1:0]:T_[1];ini=null;poner(dest,true);};
  a.addEventListener('pointerup',fin);a.addEventListener('pointercancel',fin);
}
export function desmontarMapa(){if(controladores)controladores();controladores=null;dibRuta=[];S.dest=null;S.plan=null;S.cat=null;S.cercaRes=null;if(mapa){mapa.remove();mapa=null;}marcas.clear();estiloListo=false;trid=false;}
export {planificar,alat,alon,wx,wy,geocodificar,barrioDe};
