// @ts-nocheck
/* Dibujos del mapa. Los mismos trazos sirven para los botones (SVG) y para los pines dentro del mapa (canvas),
   así no dependemos de marcadores en el DOM ni de que lleguen las fuentes. */
export const IC={
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
 agrandar:'<path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"/>',super:'<path d="M3 4h3l2.5 11h10l2-8H7"/><circle cx="10" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',lavadero:'<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="13" r="4.5"/>',gym:'<path d="M4 9v6M8 7v10M16 7v10M20 9v6M8 12h8"/>',copia:'<rect x="8" y="8" width="12" height="13" rx="1.5"/><path d="M16 8V4H4v13h4"/>',mapa:'<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14"/>',guardar:'<path d="M6 3h12v18l-6-4-6 4z"/>',enviar:'<path d="M3 11l18-8-6 18-3-8z"/>',
 capas:'<path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5"/>',
 brujula:'<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
 gps:'<path d="M3 11l18-8-8 18-2-8z"/>',
 caminar:'<circle cx="13" cy="4.5" r="2"/><path d="M10 21l2-6-2.5-2.5.8-5 3.2 1 1.8 3 3 1M9.5 8.5L6.5 11v3M15 16l1 5"/>',
 bano:'<circle cx="8" cy="5" r="2"/><circle cx="16" cy="5" r="2"/><path d="M8 9v12M5 10h6v6H5zM16 9l-3 8h6zM15 17v4M17 17v4"/>',
 wifi:'<path d="M3 9.5a14 14 0 0118 0M6.5 13a9 9 0 0111 0M10 16.5a4 4 0 014 0"/><circle cx="12" cy="20" r="1"/>',
 libro:'<path d="M4 5c3-1.5 6-1.5 8 .5 2-2 5-2 8-.5v14c-3-1.5-6-1.5-8 .5-2-2-5-2-8-.5zM12 5.5v14"/>',
 regla:'<path d="M3 16L16 3l5 5L8 21zM7 12l2 2M10 9l3 3M13 6l2 2"/>',
 medio:'<circle cx="4.5" cy="12" r="2.5"/><circle cx="19.5" cy="12" r="2.5"/><path d="M7 12h3M14 12h3"/><circle cx="12" cy="12" r="2"/>',
 explorar:'<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
 x:'<path d="M6 6l12 12M18 6L6 18"/>',
 lista:'<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
 vivo:'<circle cx="12" cy="12" r="3"/><path d="M6.3 6.3a8 8 0 000 11.4M17.7 6.3a8 8 0 010 11.4"/>',
 campana:'<path d="M6 10a6 6 0 0112 0c0 6 2 7 2 7H4s2-1 2-7zM10 20a2 2 0 004 0"/>',
 tres:'<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9"/>',
 noche:'<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/>',
 sat:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
 mas:'<path d="M12 5v14M5 12h14"/>',
};
export const svg=(n,sw=2)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n]||''}</svg>`;

/* ───── Pines para el mapa: se dibujan en canvas y entran como imágenes de MapLibre ───── */
const PR=2,LETRA='system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
const tela=(w,h)=>{const c=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(w*PR,h*PR):Object.assign(document.createElement('canvas'),{width:w*PR,height:h*PR});const g=c.getContext('2d',{willReadFrequently:true});g.scale(PR,PR);return g;};
const sacar=(g,w,h)=>({width:w*PR,height:h*PR,data:g.getImageData(0,0,w*PR,h*PR).data});
function trazos(g,n,x,y,lado,col,grosor=2.2){
  const s=lado/24;g.save();g.translate(x,y);g.scale(s,s);g.strokeStyle=col;g.lineWidth=grosor;g.lineCap='round';g.lineJoin='round';
  for(const m of (IC[n]||'').matchAll(/<(path|circle|rect)\s([^>]*)\/>/g)){
    const a={};for(const q of m[2].matchAll(/([a-z-]+)="([^"]*)"/g))a[q[1]]=q[2];
    if(m[1]==='path')g.stroke(new Path2D(a.d));
    else if(m[1]==='circle'){g.beginPath();g.arc(+a.cx,+a.cy,+a.r,0,7);g.stroke();}
    else{g.beginPath();g.roundRect(+a.x,+a.y,+a.width,+a.height,+(a.rx||0));g.stroke();}
  }
  g.restore();
}
function sombra(g,on){g.shadowColor=on?'rgba(0,0,0,.32)':'transparent';g.shadowBlur=on?4*PR:0;g.shadowOffsetY=on?1.5*PR:0;}
function amigo(col,tx,mio){
  const w=mio?46:40,g=tela(w,w),c=w/2,r=c-5;
  if(mio){g.fillStyle='rgba(31,122,255,.28)';g.beginPath();g.arc(c,c,c-1,0,7);g.fill();}
  sombra(g,true);g.fillStyle='#fff';g.beginPath();g.arc(c,c,r+2.5,0,7);g.fill();sombra(g,false);
  g.fillStyle=col;g.beginPath();g.arc(c,c,r,0,7);g.fill();
  g.fillStyle='#fff';g.font=`800 ${tx.length>2?11:13}px ${LETRA}`;g.textAlign='center';g.textBaseline='middle';g.fillText(tx,c,c+.5);
  return sacar(g,w,w);
}
function pin(col,tx){
  let tw=0;if(tx){const m=tela(4,4);m.font=`800 12.5px ${LETRA}`;tw=Math.ceil(m.measureText(tx).width)+16;}
  const w=Math.max(40,tw+6),alto=tx?64:44,g=tela(w,alto),c=w/2,y0=alto-4;
  sombra(g,true);g.fillStyle=col;g.beginPath();g.moveTo(c,y0);g.bezierCurveTo(c-3,y0-9,c-14,y0-15,c-14,y0-25);g.arc(c,y0-25,14,Math.PI,0);g.bezierCurveTo(c+14,y0-15,c+3,y0-9,c,y0);g.fill();sombra(g,false);
  g.fillStyle='#fff';g.beginPath();g.arc(c,y0-25,5.5,0,7);g.fill();
  if(tx){sombra(g,true);g.fillStyle='rgba(255,255,255,.96)';g.beginPath();g.roundRect(c-tw/2,1,tw,19,9);g.fill();sombra(g,false);g.fillStyle='#0E1116';g.font=`800 12.5px ${LETRA}`;g.textAlign='center';g.textBaseline='middle';g.fillText(tx,c,11);}
  return sacar(g,w,alto);
}
function insignia(col,n){
  const w=34,g=tela(w,w),c=w/2;
  sombra(g,true);g.fillStyle='#fff';g.beginPath();g.arc(c,c,13.5,0,7);g.fill();sombra(g,false);
  g.fillStyle=col;g.beginPath();g.arc(c,c,11.5,0,7);g.fill();
  trazos(g,n,c-7.5,c-7.5,15,'#fff',2.4);
  return sacar(g,w,w);
}
function grupoN(col,n){
  const tx=+n>=1000?`${Math.round(n/100)/10}k`:n,w=46,g=tela(w,w),c=w/2,r=+n>99?20:+n>9?18:16;
  g.fillStyle=col;g.globalAlpha=.22;g.beginPath();g.arc(c,c,r+2,0,7);g.fill();g.globalAlpha=1;
  sombra(g,true);g.fillStyle=col;g.beginPath();g.arc(c,c,r-2.5,0,7);g.fill();sombra(g,false);
  g.fillStyle='#fff';g.font=`800 14px ${LETRA}`;g.textAlign='center';g.textBaseline='middle';g.fillText(String(tx),c,c+.5);
  return sacar(g,w,w);
}
function flecha(conRumbo){
  const w=56,g=tela(w,w),c=w/2;
  if(conRumbo){const gr=g.createRadialGradient(c,c,8,c,c,28);gr.addColorStop(0,'rgba(31,122,255,.42)');gr.addColorStop(1,'rgba(31,122,255,0)');g.fillStyle=gr;g.beginPath();g.moveTo(c,c);g.arc(c,c,28,-Math.PI/2-.62,-Math.PI/2+.62);g.closePath();g.fill();}
  sombra(g,true);g.fillStyle='#fff';g.beginPath();g.arc(c,c,11.5,0,7);g.fill();sombra(g,false);
  g.fillStyle='#1F7AFF';g.beginPath();g.arc(c,c,8.5,0,7);g.fill();
  return sacar(g,w,w);
}
/* Cada nombre de imagen lleva todo lo que hace falta para dibujarla: `am|#color|TC|1`, `pin|#color|UCA`, `bg|#color|farma`, `cl|#color|23`, `yo|1` */
export function dibujarImagen(id){
  try{
    const p=id.split('|');
    if(p[0]==='am')return amigo(p[1],p[2],p[3]==='1');
    if(p[0]==='pin')return pin(p[1],p[2]);
    if(p[0]==='bg')return insignia(p[1],p[2]);
    if(p[0]==='cl')return grupoN(p[1],p[2]);
    if(p[0]==='yo')return flecha(p[1]==='1');
  }catch{/* sin imagen: MapLibre lo saltea */}
  return null;
}
export const RATIO_IMAGEN=PR;
