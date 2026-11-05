// @ts-nocheck
/* Una sola lectura de GPS y brújula para todo el mapa: seguir, avisar al bajar y compartir usan la misma.
   Si nadie la está usando, se apaga. */
let idGps=null,ult=null,rumboDisp=null,oyeBrujula=false;
const oyentes=new Set();
const avisar=()=>{for(const f of [...oyentes])try{f(ult);}catch{/* un oyente no frena a los demás */}};
const brujula=e=>{
  const r=e.webkitCompassHeading??(e.absolute&&e.alpha!=null?360-e.alpha:null);
  if(r==null)return;
  rumboDisp=r;if(ult){ult={...ult,rumbo:ult.rumboGps??rumboDisp};avisar();}
};
export async function pedirBrujula(){
  try{
    if(oyeBrujula)return;
    const D=window.DeviceOrientationEvent;if(!D)return;
    if(D.requestPermission){const r=await D.requestPermission();if(r!=='granted')return;}
    window.addEventListener('deviceorientationabsolute',brujula);window.addEventListener('deviceorientation',brujula);oyeBrujula=true;
  }catch{/* sin brújula: se usa el rumbo del GPS */}
}
function prender(error){
  if(idGps!=null||!navigator.geolocation)return;
  idGps=navigator.geolocation.watchPosition(p=>{
    const c=p.coords,rg=c.heading!=null&&!Number.isNaN(c.heading)&&(c.speed==null||c.speed>.5)?c.heading:null;
    ult={lat:c.latitude,lon:c.longitude,prec:c.accuracy,vel:c.speed,rumboGps:rg,rumbo:rg??rumboDisp,t:p.timestamp};avisar();
  },e=>{
    /* Sin señal un rato o el celu quieto dan error y la lectura sigue sola: solo corta si no hay permiso, o si nunca hubo posición */
    if(e.code!==1&&ult)return;
    for(const f of [...oyentes])if(f.alFallar)f.alFallar(e);error&&error(e);
  },{enableHighAccuracy:true,maximumAge:3000,timeout:15000});
}
function apagar(){
  if(idGps!=null){navigator.geolocation.clearWatch(idGps);idGps=null;}
  if(oyeBrujula){window.removeEventListener('deviceorientationabsolute',brujula);window.removeEventListener('deviceorientation',brujula);oyeBrujula=false;}
  ult=null;rumboDisp=null;
}
/* Devuelve la función para dejar de escuchar */
export function escucharUbicacion(f,alFallar){
  if(!navigator.geolocation){alFallar&&alFallar({code:0});return ()=>{};}
  f.alFallar=alFallar;oyentes.add(f);prender();if(ult)f(ult);
  return ()=>{oyentes.delete(f);if(!oyentes.size)apagar();};
}
export function apagarUbicacion(){oyentes.clear();apagar();}
export function ubicacionUnaVez(ok,mal){
  if(!navigator.geolocation){mal&&mal();return;}
  navigator.geolocation.getCurrentPosition(p=>ok(p.coords),()=>mal&&mal(),{enableHighAccuracy:true,timeout:9000,maximumAge:15000});
}
