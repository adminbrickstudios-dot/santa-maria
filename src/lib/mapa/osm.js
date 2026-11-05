// @ts-nocheck
/* Fichas de filtros y búsqueda en vivo en OpenStreetMap (Overpass). Datos abiertos, cargados por vecinos. */
export const FICHAS=[
  {id:'f',n:'Farmacia',ic:'farma',col:'#FF3B30',local:'f',osm:'nwr[amenity=pharmacy]',nota:'Lista de farmacias de la Ciudad.'},
  {id:'cafe',n:'Café',ic:'cafe',col:'#A2672D',local:'c',osm:'nwr[amenity=cafe]'},
  {id:'super',n:'Súper',ic:'super',col:'#10B765',osm:'nwr[shop~"^(supermarket|convenience)$"]'},
  {id:'a',n:'Cajero',ic:'atm',col:'#1F7AFF',local:'a',nota:'Cajeros de un relevamiento anterior: pueden haber cambiado.'},
  {id:'banos',n:'Baños',ic:'bano',col:'#5856D6',osm:'nwr[amenity=toilets]'},
  {id:'wifi',n:'Wifi',ic:'wifi',col:'#00A3D9',osm:'nwr[internet_access~"^(wlan|yes)$"]'},
  {id:'estudiar',n:'Para estudiar',ic:'libro',col:'#7C5CFC',osm:'nwr[amenity~"^(library|coworking_space)$"]'},
];
export const ficha=id=>FICHAS.find(f=>f.id===id);
const SERVIDORES=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter'];
async function preguntar(q,senal){
  let ult=null;
  for(const u of SERVIDORES){
    try{
      const r=await fetch(u,{method:'POST',body:'data='+encodeURIComponent(q),headers:{'Content-Type':'application/x-www-form-urlencoded'},signal:senal});
      if(r.ok)return await r.json();
      ult=new Error('overpass '+r.status);
    }catch(e){if(e.name==='AbortError')throw e;ult=e;}
  }
  throw ult||new Error('overpass');
}
const fila=e=>{
  const t=e.tags||{},la=e.lat??e.center?.lat,lo=e.lon??e.center?.lon;
  return {id:e.id,n:t.name||t.brand||t.operator||'',la,lo,d:[t['addr:street'],t['addr:housenumber']].filter(Boolean).join(' '),h:t.opening_hours||'',acc:t.access||''};
};
/* Lo ya traído por categoría, para no repetir pedidos */
const MEMO=new Map();
export const yaBuscado=(id,c)=>{const m=MEMO.get(id);return !!m&&m.cajas.some(b=>c[0]>=b[0]&&c[1]>=b[1]&&c[2]<=b[2]&&c[3]<=b[3]);};
export const lugaresOSM=id=>[...(MEMO.get(id)?.l.values()||[])];
/* caja: [oeste,sur,este,norte] */
export async function traerOSM(f,caja,senal){
  const m=MEMO.get(f.id)||{cajas:[],l:new Map()};MEMO.set(f.id,m);
  if(yaBuscado(f.id,caja))return [...m.l.values()];
  const [o,s,e,n]=caja,q=`[out:json][timeout:15];${f.osm}(${s.toFixed(4)},${o.toFixed(4)},${n.toFixed(4)},${e.toFixed(4)});out tags center 300;`;
  const j=await preguntar(q,senal);
  for(const x of j.elements||[]){const p=fila(x);if(p.la!=null&&p.acc!=='private'&&(p.n||f.id==='banos'))m.l.set(p.id,p);}
  m.cajas.push(caja);if(m.cajas.length>12)m.cajas.shift();
  return [...m.l.values()];
}
/* Estaciones de Ecobici: ubicación, no bicis disponibles (ese dato no es abierto) */
export async function traerEcobici(senal){
  const k='sm-ecobici-v1';
  try{const c=JSON.parse(localStorage.getItem(k)||'null');if(c&&Date.now()-c.t<7*864e5&&c.l.length)return c.l;}catch{/* sin memoria */}
  const j=await preguntar('[out:json][timeout:20];nwr[amenity=bicycle_rental](-34.71,-58.54,-34.52,-58.33);out tags center 500;',senal);
  const l=(j.elements||[]).map(fila).filter(p=>p.la!=null).map(p=>({n:p.n||'Estación',la:p.la,lo:p.lo}));
  try{localStorage.setItem(k,JSON.stringify({t:Date.now(),l}));}catch{/* sin memoria */}
  return l;
}
