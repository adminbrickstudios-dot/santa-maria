// @ts-nocheck
/* Lo que se ve: la base del mapa, el plano propio de reserva y todas las capas de la app. */
export const fc=l=>({type:'FeatureCollection',features:l});
const FUENTE_OSCURO='dark',FUENTE_CLARO='liberty';
export const urlEstilo=oscuro=>'https://tiles.openfreemap.org/styles/'+(oscuro?FUENTE_OSCURO:FUENTE_CLARO);

/* Plano de reserva: sale solo de los archivos de la app, así que anda sin internet.
   No lleva textos porque las letras del mapa vienen de internet. */
export function estiloPlano(oscuro,fuente){
  const c=oscuro?{agua:'#0C1A2B',tierra:'#17191D',verde:'#17301F',calle:'#33373E',av:'#4A505A',ruta:'#6A5A36'}:{agua:'#BFDDF2',tierra:'#F2EFE9',verde:'#CFE8C6',calle:'#FFFFFF',av:'#FBE3A0',ruta:'#F5B95F'};
  const k=v=>['==',['get','k'],v],cl=v=>['==',['get','c'],v];
  return {version:8,sources:{plano:{type:'geojson',data:fuente||fc([]),attribution:'© OpenStreetMap'}},layers:[
    {id:'fondo',type:'background',paint:{'background-color':c.tierra}},
    {id:'p-tierra',type:'fill',source:'plano',filter:k('tierra'),paint:{'fill-color':c.tierra}},
    {id:'p-agua',type:'fill',source:'plano',filter:k('agua'),paint:{'fill-color':c.agua}},
    {id:'p-verde',type:'fill',source:'plano',filter:k('verde'),paint:{'fill-color':c.verde}},
    {id:'p-calle',type:'line',source:'plano',filter:['all',k('calle'),['!=',['get','c'],1],['!=',['get','c'],4]],minzoom:11.5,layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':c.calle,'line-width':['interpolate',['exponential',1.6],['zoom'],12,.5,14,2,16,6,18,18]}},
    {id:'p-av',type:'line',source:'plano',filter:['all',k('calle'),cl(1)],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':c.av,'line-width':['interpolate',['exponential',1.6],['zoom'],10,.6,14,3,16,9,18,24]}},
    {id:'p-ruta',type:'line',source:'plano',filter:['all',k('calle'),cl(4)],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':c.ruta,'line-width':['interpolate',['exponential',1.6],['zoom'],10,1,14,4,16,10,18,26]}},
  ]};
}

const FUENTES=['subte','estaciones','ruta','puntos','pois','ecobici','marcas','vivo','yo','medir'];
/* Todas las capas de la app. Son GL: no hay marcadores en el DOM. */
export function instalarCapas(m,o){
  if(m.getSource('ruta'))return;
  const vacio=()=>fc([]),est=m.getStyle(),capas=est.layers||[],simbolo=capas.find(l=>l.type==='symbol')?.id;
  const baseVec=Object.keys(est.sources||{}).find(k=>/openmaptiles/i.test(k));
  m.addSource('sat',{type:'raster',tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],tileSize:256,maxzoom:19,attribution:'Imágenes de Esri'});
  m.addSource('nombres',{type:'raster',tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'],tileSize:256,maxzoom:19});
  m.addSource('verdes',{type:'geojson',data:vacio()});
  for(const f of FUENTES)m.addSource(f,f==='ruta'?{type:'geojson',data:vacio(),lineMetrics:true}:f==='pois'?{type:'geojson',data:vacio(),cluster:true,clusterRadius:46,clusterMaxZoom:15}:{type:'geojson',data:vacio()});
  m.addLayer({id:'sat',type:'raster',source:'sat',layout:{visibility:'none'},paint:{'raster-fade-duration':180}},simbolo);
  m.addLayer({id:'nombres',type:'raster',source:'nombres',minzoom:12,layout:{visibility:'none'}},simbolo);
  m.addLayer({id:'verdes',type:'fill',source:'verdes',layout:{visibility:'none'},paint:{'fill-color':'#22B455','fill-opacity':.32}},simbolo);
  m.addLayer({id:'verdes-borde',type:'line',source:'verdes',minzoom:12.5,layout:{visibility:'none'},paint:{'line-color':'#159443','line-width':1.2,'line-opacity':.6}},simbolo);
  if(baseVec){
    m.addLayer({id:'ciclo',type:'line',source:baseVec,'source-layer':'transportation',minzoom:11,filter:['all',['==',['get','class'],'path'],['==',['get','subclass'],'cycleway']],layout:{visibility:'none','line-cap':'round','line-join':'round'},paint:{'line-color':'#00A86B','line-width':['interpolate',['linear'],['zoom'],12,1.6,16,4.5]}},simbolo);
    m.addLayer({id:'edificios-3d',type:'fill-extrusion',source:baseVec,'source-layer':'building',minzoom:14,layout:{visibility:'none'},paint:{'fill-extrusion-color':o.oscuro?'#33363B':'#E4E6EA','fill-extrusion-height':['coalesce',['get','render_height'],9],'fill-extrusion-base':['coalesce',['get','render_min_height'],0],'fill-extrusion-opacity':.9}});
  }
  const redondo={'line-cap':'round','line-join':'round'};
  m.addLayer({id:'subte',type:'line',source:'subte',layout:redondo,paint:{'line-color':['get','col'],'line-width':['interpolate',['linear'],['zoom'],11,2,16,5],'line-opacity':.8}});
  m.addLayer({id:'ruta-alt',type:'line',source:'ruta',filter:['==',['get','alt'],1],layout:redondo,paint:{'line-color':'#8E8E93','line-width':4,'line-opacity':.55}});
  m.addLayer({id:'ruta-halo',type:'line',source:'ruta',filter:['==',['get','alt'],0],layout:redondo,paint:{'line-color':'#fff','line-width':['+',['get','ancho'],3.5]}});
  m.addLayer({id:'ruta',type:'line',source:'ruta',filter:['all',['==',['get','alt'],0],['==',['get','pie'],0]],layout:redondo,paint:{'line-color':['get','col'],'line-width':['get','ancho']}});
  m.addLayer({id:'ruta-pie',type:'line',source:'ruta',filter:['all',['==',['get','alt'],0],['==',['get','pie'],1]],layout:redondo,paint:{'line-color':o.azul,'line-width':['get','ancho'],'line-dasharray':[.1,2]}});
  m.addLayer({id:'medir-linea',type:'line',source:'medir',filter:['==',['geometry-type'],'LineString'],layout:redondo,paint:{'line-color':'#FF3B30','line-width':3.5,'line-dasharray':[1.5,1.5]}});
  m.addLayer({id:'medir-punto',type:'circle',source:'medir',filter:['==',['geometry-type'],'Point'],paint:{'circle-radius':7,'circle-color':'#FF3B30','circle-stroke-color':'#fff','circle-stroke-width':2.5}});
  m.addLayer({id:'estaciones',type:'circle',source:'estaciones',minzoom:12.5,paint:{'circle-radius':['interpolate',['linear'],['zoom'],12.5,2.5,16,6],'circle-color':'#fff','circle-stroke-color':['get','col'],'circle-stroke-width':2}});
  if(est.glyphs)m.addLayer({id:'estaciones-nom',type:'symbol',source:'estaciones',minzoom:14.2,layout:{'text-field':['get','nom'],'text-font':['Noto Sans Regular'],'text-size':12,'text-offset':[0,1.1],'text-anchor':'top','text-optional':true},paint:{'text-color':o.oscuro?'#F5F5F7':'#0E1116','text-halo-color':o.oscuro?'#000':'#fff','text-halo-width':1.4}});
  m.addLayer({id:'puntos',type:'circle',source:'puntos',paint:{'circle-radius':['get','r'],'circle-color':['get','col'],'circle-stroke-color':'#fff','circle-stroke-width':2}});
  const icono=(extra={})=>({'icon-allow-overlap':true,'icon-ignore-placement':true,...extra});
  m.addLayer({id:'ecobici',type:'symbol',source:'ecobici',minzoom:11.5,layout:icono({'icon-image':'bg|#00A86B|bici','icon-size':['interpolate',['linear'],['zoom'],12,.62,15,.95]})});
  m.addLayer({id:'pois-cl',type:'symbol',source:'pois',filter:['has','point_count'],layout:icono({'icon-image':['concat','cl|',o.azul,'|',['to-string',['get','point_count']]]})});
  m.addLayer({id:'pois',type:'symbol',source:'pois',filter:['!',['has','point_count']],layout:icono({'icon-image':['get','ic']})});
  m.addLayer({id:'vivo',type:'symbol',source:'vivo',layout:icono({'icon-image':['get','ic']})});
  m.addLayer({id:'marcas',type:'symbol',source:'marcas',layout:icono({'icon-image':['get','ic'],'icon-anchor':['get','an'],'symbol-sort-key':['get','z']})});
  m.addLayer({id:'yo-prec',type:'circle',source:'yo',paint:{'circle-radius':['get','rp'],'circle-color':'#1F7AFF','circle-opacity':.13,'circle-stroke-color':'#1F7AFF','circle-stroke-opacity':.3,'circle-stroke-width':1,'circle-pitch-alignment':'map'}});
  m.addLayer({id:'yo',type:'symbol',source:'yo',layout:icono({'icon-image':['get','ic'],'icon-rotate':['get','rumbo'],'icon-rotation-alignment':'map'})});
}
export const CAPAS_TOQUE=['marcas','vivo','pois-cl','pois','ecobici','puntos'];
