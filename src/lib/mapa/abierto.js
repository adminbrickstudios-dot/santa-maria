// @ts-nocheck
/* Lee el horario de OpenStreetMap (opening_hours) en sus formas comunes.
   Si no entiende algo devuelve null: preferimos no saber antes que decir "abierto" sin estar seguros. */
const D=['Su','Mo','Tu','We','Th','Fr','Sa'];
const dias=t=>{
  const r=new Set();
  for(const p of t.split(',')){
    const m=p.trim().match(/^(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?$/);
    if(!m)return null;
    const a=D.indexOf(m[1]),b=m[2]?D.indexOf(m[2]):a;
    for(let i=a;;i=(i+1)%7){r.add(i);if(i===b)break;}
  }
  return r;
};
const mins=t=>{const m=t.match(/^(\d{1,2}):(\d{2})$/);return m?+m[1]*60+ +m[2]:null;};
function tramos(t){
  const o=[];
  for(const p of t.split(',')){
    const m=p.trim().match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\+?$/);
    if(!m)return null;
    o.push([mins(m[1]),mins(m[2])]);
  }
  return o;
}
function leer(h){
  const reglas=[];
  for(let reg of h.split(';')){
    reg=reg.trim();if(!reg)continue;
    if(reg==='24/7'){reglas.push({d:new Set([0,1,2,3,4,5,6]),t:[[0,1440]]});continue;}
    let m=reg.match(/^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)(?:\s*,\s*(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)*)(?:\s*,\s*PH)?\s+(.+)$/);
    let d=new Set([0,1,2,3,4,5,6]),resto=reg;
    if(m){d=dias(m[1]);resto=m[2];if(!d)return null;}
    else if(/^PH\b/.test(reg))continue;
    if(/^(off|closed)$/i.test(resto)){reglas.push({d,t:[]});continue;}
    const t=tramos(resto);if(!t)return null;
    reglas.push({d,t});
  }
  return reglas.length?reglas:null;
}
const hh=m=>{m=m%1440;return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;};
/* {abierto:boolean, hasta:'20:00'|null} o null si no se puede saber */
export function estadoHorario(h,dia,min){
  if(!h)return null;
  const r=leer(h);if(!r)return null;
  const de=d=>{let t=null;for(const q of r)if(q.d.has(d))t=q.t;return t;};
  for(const [a,b] of de(dia)||[]){
    if(b===1440&&a===0)return {abierto:true,hasta:null};
    if(b>a?min>=a&&min<b:min>=a)return {abierto:true,hasta:hh(b)};
  }
  /* un horario de ayer que cruza la medianoche */
  for(const [a,b] of de((dia+6)%7)||[])if(b<a&&min<b)return {abierto:true,hasta:hh(b)};
  return {abierto:false,hasta:null};
}
