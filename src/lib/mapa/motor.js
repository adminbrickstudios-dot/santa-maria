/* ───────── Motor de rutas: calles, caminata, bici, auto, colectivo y subte ───────── */
const LON0=-58.4,LAT0=-34.6,KX=91700,KY=110950;
const wx=l=>(l-LON0)*KX, wy=l=>-(l-LAT0)*KY, alon=x=>x/KX+LON0, alat=y=>-y/KY+LAT0;
export const G={},T={},L={};
const sinTilde=s=>(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();

function cargarCalles(d){
  const [ox,oy]=d.o, N=d.n.length/2, nx=new Float64Array(N), ny=new Float64Array(N);
  for(let i=0;i<N;i++){nx[i]=wx((d.n[2*i]+ox)/1e5);ny[i]=wy((d.n[2*i+1]+oy)/1e5);}
  const E=d.e.length, ea=new Int32Array(E), eb=new Int32Array(E), ec=new Uint8Array(E), en=new Int32Array(E),
        e0=new Int32Array(E), e1=new Int32Array(E), el=new Float32Array(E), eba=new Int16Array(E), ep=new Array(E);
  const grid=new Map(), put=(k,i)=>{let a=grid.get(k);if(!a)grid.set(k,a=[]);if(a[a.length-1]!==i)a.push(i);};
  const deg=new Int32Array(N+1);
  for(let i=0;i<E;i++){
    const e=d.e[i],a=e[0],b=e[1];ea[i]=a;eb[i]=b;ec[i]=e[2];en[i]=e[3];e0[i]=e[4];e1[i]=e[5];eba[i]=e[6];
    const m=e[7],pts=new Float32Array(4+m.length);pts[0]=nx[a];pts[1]=ny[a];
    let px=d.n[2*a]+ox,py=d.n[2*a+1]+oy;
    for(let j=0;j<m.length;j+=2){px+=m[j];py+=m[j+1];pts[2+j]=wx(px/1e5);pts[3+j]=wy(py/1e5);}
    pts[pts.length-2]=nx[b];pts[pts.length-1]=ny[b];ep[i]=pts;
    let len=0;
    for(let j=2;j<pts.length;j+=2){
      const sx=pts[j]-pts[j-2],sy=pts[j+1]-pts[j-1],s=Math.hypot(sx,sy);len+=s;
      for(let t=0;t<=s;t+=120){const q=s?t/s:0;put(ckey(pts[j-2]+q*sx,pts[j-1]+q*sy),i);}
    }
    put(ckey(pts[pts.length-2],pts[pts.length-1]),i);
    el[i]=len;deg[a]++;deg[b]++;
  }
  const st=new Int32Array(N+1);for(let i=0;i<N;i++)st[i+1]=st[i]+deg[i];
  const fill=st.slice(),ad=new Int32Array(2*E);
  for(let i=0;i<E;i++){ad[fill[ea[i]]++]=i;ad[fill[eb[i]]++]=i;}
  Object.assign(G,{N,E,nx,ny,ea,eb,ec,en,e0,e1,el,eba,ep,grid,st,ad,names:d.names,barrios:d.barrios});
}
function ckey(x,y){return (Math.floor(x/200)+5000)*100000+(Math.floor(y/200)+5000);}

function cargarTransporte(d){
  const S=d.stops.length,sx=new Float64Array(S),sy=new Float64Array(S),sn=new Int32Array(S);
  d.stops.forEach((s,i)=>{sx[i]=wx(s[0]/1e5);sy[i]=wy(s[1]/1e5);sn[i]=s[2];});
  const por=Array.from({length:S},()=>[]);
  const pats=d.pats.map((p,i)=>{
    const g=new Float32Array(p.g.length);let x=0,y=0;
    for(let j=0;j<p.g.length;j+=2){x=j?x+p.g[j]:p.g[0];y=j?y+p.g[j+1]:p.g[1];g[j]=wx(x/1e5);g[j+1]=wy(y/1e5);}
    p.s.forEach((s,k)=>por[s].push(i,k));
    return {l:p.l,h:p.h,s:p.s,p:p.p,g,w:p.w||1,sub:!!p.sub};
  });
  const sg=new Map();
  for(let i=0;i<S;i++){const k=Math.floor(sx[i]/300)*100000+Math.floor(sy[i]/300);let a=sg.get(k);if(!a)sg.set(k,a=[]);a.push(i);}
  Object.assign(T,{S,sx,sy,sn,por,pats,sg,stops:d.stops,meta:d.meta});
}

/* ───── punto → calle más cercana ───── */
function enganchar(x,y,sirve){
  const cx=Math.floor(x/200),cy=Math.floor(y/200);let best=null,bd=1e12;
  for(let r=1;r<=4&&!best;r++){
    for(let i=-r;i<=r;i++)for(let j=-r;j<=r;j++){
      const a=G.grid.get((cx+i+5000)*100000+(cy+j+5000));if(!a)continue;
      for(const e of a){
        if(sirve&&!sirve(G.ec[e]))continue;
        const p=G.ep[e];let acc=0;
        for(let k=2;k<p.length;k+=2){
          const ax=p[k-2],ay=p[k-1],dx=p[k]-ax,dy=p[k+1]-ay,l2=dx*dx+dy*dy;
          const t=l2?Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/l2)):0,qx=ax+t*dx,qy=ay+t*dy,d=(qx-x)**2+(qy-y)**2,l=Math.sqrt(l2);
          if(d<bd){bd=d;best={e,qx,qy,d:Math.sqrt(d),ini:acc+t*l};}
          acc+=l;
        }
      }
    }
  }
  return best;
}

/* ───── Dijkstra ───── */
class Monton{constructor(){this.k=[];this.v=[];}
  push(k,v){const K=this.k,V=this.v;let i=K.length;K.push(k);V.push(v);while(i>0){const p=(i-1)>>1;if(K[p]<=k)break;K[i]=K[p];V[i]=V[p];i=p;}K[i]=k;V[i]=v;}
  pop(){const K=this.k,V=this.v,top=V[0],tk=K[0],k=K.pop(),v=V.pop(),n=K.length;
    if(n){let i=0;for(;;){let c=2*i+1;if(c>=n)break;if(c+1<n&&K[c+1]<K[c])c++;if(K[c]>=k)break;K[i]=K[c];V[i]=V[c];i=c;}K[i]=k;V[i]=v;}
    this.tk=tk;return top;}
  get n(){return this.k.length;}}
function perfil(tipo,ctx){
  const W=new Float32Array(G.E),sale=franja(ctx);
  const lluvia=ctx&&ctx.lluvia;
  for(let e=0;e<G.E;e++){
    const c=G.ec[e],l=G.el[e];let w;
    if(tipo==='pie'||tipo==='tranqui'||tipo==='avenida'){
      if(c===4){W[e]=Infinity;continue;}
      const v=lluvia?1.22:1.35;
      w=l/v+(c===1?7:4);
      if(tipo==='tranqui')w*=c===1?1.75:1;
      if(tipo==='avenida')w*=c===1?.74:c===2||c===3?1.5:1.08;
    }else if(tipo==='bici'){
      if(c===4){W[e]=Infinity;continue;}
      w=l/4.2+3;if(c===1)w*=1.35;if(c===3)w*=1.25;
    }else{
      if(c===3){W[e]=Infinity;continue;}
      const f=AUTO[sale]*(lluvia?.82:1),v=(c===4?19:c===1?10:c===2?4:7.5)*f;
      w=l/v+(c===4?0:7);
    }
    W[e]=w;
  }
  return W;
}
function dijkstra(sem,W,lim=Infinity){
  const dist=new Float64Array(G.N).fill(Infinity),prev=new Int32Array(G.N).fill(-1),h=new Monton();
  for(const s of sem){if(s.c<dist[s.n]){dist[s.n]=s.c;h.push(s.c,s.n);}}
  while(h.n){
    const u=h.pop();if(h.tk>dist[u])continue;if(h.tk>lim)break;
    for(let i=G.st[u];i<G.st[u+1];i++){
      const e=G.ad[i],v=G.ea[e]===u?G.eb[e]:G.ea[e],nd=dist[u]+W[e];
      if(nd<dist[v]){dist[v]=nd;prev[v]=e;h.push(nd,v);}
    }
  }
  return {dist,prev,W};
}
function semillas(p,W,sirve){
  const m=enganchar(p.x,p.y,sirve);if(!m)return {sem:[],m:null};
  const e=m.e,len=G.el[e]||1,t=m.ini/len,w=W[e],con=m.d/1.35;
  return {m,sem:[{n:G.ea[e],c:con+w*t},{n:G.eb[e],c:con+w*(1-t)}]};
}
/* devuelve costo y recorrido desde el origen de `r` hasta el punto destino */
function camino(r,dest,sirve){
  const {m,sem}=semillas(dest,r.W,sirve);if(!m)return null;
  const [a,b]=sem,ca=r.dist[a.n]+a.c,cb=r.dist[b.n]+b.c;
  const fin=ca<=cb?a.n:b.n,costo=Math.min(ca,cb);
  if(!isFinite(costo))return null;
  const cadena=[];let u=fin;
  while(r.prev[u]>=0){const e=r.prev[u];const de=G.ea[e]===u?G.eb[e]:G.ea[e];cadena.push({e,de,a:u});u=de;}
  cadena.reverse();
  const pts=[],tramos=[];let len=0;
  const pega=(x,y)=>{const n=pts.length;if(n<2||Math.abs(pts[n-2]-x)>.01||Math.abs(pts[n-1]-y)>.01)pts.push(x,y);};
  for(const c of cadena){
    const p=G.ep[c.e],ida=G.ea[c.e]===c.de,ini=pts.length;
    if(ida)for(let i=0;i<p.length;i+=2)pega(p[i],p[i+1]);
    else for(let i=p.length-2;i>=0;i-=2)pega(p[i],p[i+1]);
    const nom=G.names[G.en[c.e]]||'',l=G.el[c.e],cl=G.ec[c.e];len+=l;
    const q=ida?[p[0],p[1],p[2],p[3],p[p.length-4],p[p.length-3],p[p.length-2],p[p.length-1]]:[p[p.length-2],p[p.length-1],p[p.length-4],p[p.length-3],p[2],p[3],p[0],p[1]];
    const t=tramos[tramos.length-1];
    if(t&&t.nom===nom){t.len+=l;t.fin=q.slice(4);}
    else tramos.push({nom,cl,len:l,ini:q.slice(0,4),fin:q.slice(4)});
  }
  return {costo,pts,tramos,len};
}
function pasos(tr,primera='Salí'){
  const out=[];
  tr.forEach((t,i)=>{
    const nom=t.nom||'el sendero',cu=Math.max(1,Math.round(t.len/115));
    let v=primera+' por';
    if(i){
      const a=tr[i-1].fin,b=t.ini,ax=a[2]-a[0],ay=a[3]-a[1],bx=b[2]-b[0],by=b[3]-b[1];
      const c=ax*by-ay*bx,g=Math.atan2(c,ax*bx+ay*by)*57.3;
      v=Math.abs(g)<28?'Seguí por':g>0?'Doblá a la derecha en':'Doblá a la izquierda en';
    }
    if(t.len<12&&i&&i<tr.length-1)return;
    out.push({t:`${v} ${nom}`,d:t.len<90?`${Math.round(t.len/10)*10} m`:`${cu} ${cu===1?'cuadra':'cuadras'}`});
  });
  return out;
}

/* ───── horario ───── */
const AUTO={am:.6,val:.78,pm:.55,noc:1.05,mad:1.15,sab:.86,dom:1};
const VBUS={am:3.6,val:4.2,pm:3.4,noc:5.6,mad:6,sab:4.6,dom:5.3};
const FRANJA={am:'hora pico de la mañana',val:'media jornada',pm:'hora pico de la tarde',noc:'noche',mad:'madrugada',sab:'sábado',dom:'domingo'};
function franja(c){
  if(!c)return 'val';const h=c.min/60;
  if(h<6)return 'mad';
  if(c.dia==='sab')return h>=21?'noc':'sab';
  if(c.dia==='dom')return h>=21?'noc':'dom';
  if(h>=6.5&&h<10)return 'am';if(h>=16&&h<20)return 'pm';if(h>=20)return 'noc';return h<6.5?'noc':'val';
}
function frecuencia(lin,c){
  const f=franja(c),ix={am:0,val:1,pm:2,noc:3,mad:3,sab:4,dom:5}[f];
  const t=T.meta.lineHw[lin],v=t?t[ix]:[12,14,12,25,18,20][ix];
  if(!v)return 0;
  return f==='mad'?Math.round(v*1.6):v;
}
function subteAbierto(c){
  const a={hab:[330,1410],sab:[360,1440],dom:[480,1350]}[c.dia];return c.min>=a[0]&&c.min<=a[1];
}
function subteFrec(l,c){return T.meta.subteHw[l][{hab:0,sab:1,dom:2}[c.dia]];}

/* ───── transporte (RAPTOR por frecuencias) ───── */
function vecinas(s){
  const out=[],x=T.sx[s],y=T.sy[s],cx=Math.floor(x/300),cy=Math.floor(y/300);
  for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++){
    const a=T.sg.get((cx+i)*100000+cy+j);if(!a)continue;
    for(const v of a){if(v===s)continue;const d=Math.hypot(T.sx[v]-x,T.sy[v]-y);if(d<280)out.push(v,d);}
  }
  return out;
}
function esperaDe(p,c){
  if(p.sub){if(!subteAbierto(c))return null;const h=subteFrec(p.l,c);return {w:h/2*60,h};}
  const h0=frecuencia(p.l,c);if(!h0)return null;
  const h=Math.round(Math.min(45,h0/Math.max(.25,p.w)));return {w:h/2*60,h};
}
function rideSeg(p,i,j,c){
  const d=p.p[j]-p.p[i];
  if(p.sub)return d/10+25*(j-i);
  return d/(VBUS[franja(c)]*(c.lluvia?.9:1));
}
function alcances(pt,W,lim){
  const {sem}=semillas(pt,W,c=>c!==4);const r=dijkstra(sem,W,lim);
  const a=new Float32Array(T.S).fill(Infinity);
  for(let s=0;s<T.S;s++){const n=T.sn[s];if(n>=0&&r.dist[n]<=lim)a[s]=r.dist[n]+6;}
  return {a,r};
}
function raptor(aO,aD,c,filtro,rondas=3){
  const S=T.S,tau=[new Float32Array(S).fill(Infinity)],par=[new Array(S).fill(null)];
  let marc=[];for(let s=0;s<S;s++)if(aO[s]<Infinity){tau[0][s]=aO[s];marc.push(s);}
  const best=tau[0].slice();
  let mejor=null;
  for(let k=1;k<=rondas;k++){
    const t=tau[k-1].slice(),pa=new Array(S).fill(null),nuevos=new Set(),q=new Map();
    for(const s of marc){const l=T.por[s];for(let i=0;i<l.length;i+=2){const p=l[i],ix=l[i+1];if(!q.has(p)||q.get(p)>ix)q.set(p,ix);}}
    for(const [pi,ini] of q){
      const p=T.pats[pi];if(filtro&&!filtro(p))continue;
      const es=esperaDe(p,c);if(!es)continue;
      let base=Infinity,bi=-1;
      for(let i=ini;i<p.s.length;i++){
        const s=p.s[i];
        if(bi>=0){const arr=base+rideSeg(p,bi,i,c);
          if(arr<t[s]&&arr<best[s]){t[s]=arr;best[s]=arr;pa[s]={pi,bi,ai:i,de:p.s[bi],k};nuevos.add(s);}}
        const prev=tau[k-1][s];
        if(prev<Infinity){const pen=k>1?60:0,c2=prev+es.w+pen;
          if(bi<0||c2<base+rideSeg(p,bi,i,c)){base=c2;bi=i;}}
      }
    }
    for(const s of [...nuevos]){
      const v=vecinas(s);
      for(let i=0;i<v.length;i+=2){const n=v[i],d=v[i+1],arr=t[s]+d*1.25/1.3+20;
        if(arr<t[n]&&arr<best[n]){t[n]=arr;best[n]=arr;pa[n]={walk:s,d};nuevos.add(n);}}
    }
    tau.push(t);par.push(pa);marc=[...nuevos];
    let bs=-1,bv=Infinity;
    for(const s of nuevos){const v=t[s]+aD[s];if(v<bv){bv=v;bs=s;}}
    if(bs>=0&&(!mejor||bv<mejor.v-30))mejor={v:bv,s:bs,k};
    if(!marc.length)break;
  }
  if(!mejor)return null;
  /* reconstruir */
  const pier=[];let s=mejor.s,k=mejor.k;
  while(k>0){
    let pa=par[k][s];
    while(!pa&&k>0){k--;pa=k>0?par[k][s]:null;}
    if(!pa)break;
    if(pa.walk!==undefined){pier.unshift({t:'trans',de:pa.walk,a:s,d:pa.d});s=pa.walk;pa=par[k][s];if(!pa)continue;}
    pier.unshift({t:'bondi',pi:pa.pi,bi:pa.bi,ai:pa.ai});s=pa.de;k--;
  }
  return {v:mejor.v,fin:mejor.s,ini:s,pier};
}
function recortaTraza(p,i,j){
  const g=p.g,a=[T.sx[p.s[i]],T.sy[p.s[i]]],b=[T.sx[p.s[j]],T.sy[p.s[j]]];
  const cerca=(q,de)=>{let bi=de,bd=1e15;for(let k=de;k<g.length;k+=2){const d=(g[k]-q[0])**2+(g[k+1]-q[1])**2;if(d<bd){bd=d;bi=k;}}return bi;};
  const i0=cerca(a,0),i1=cerca(b,i0),o=[a[0],a[1]];
  for(let k=i0;k<=i1;k+=2)o.push(g[k],g[k+1]);o.push(b[0],b[1]);return o;
}
const nomParada=s=>T.stops[s][3]||'la parada';

function tarifaColectivo(m){const km=m/1000;return km<3?956:km<6?1063:km<12?1145:1227;}
function piernaPie(r,dest,de,ha,c){
  const w=camino(r,dest,cl=>cl!==4);if(!w)return null;
  const v=c.lluvia?1.22:1.35;
  return {t:'pie',seg:w.len/v+w.tramos.length*12,len:w.len,pts:w.pts,tramos:w.tramos,pasos:pasos(w.tramos,'Salí'),de,ha};
}
function armarViaje(o,d,j,rO,rD,c){
  const pp=[];let cuenta=0,pi=-1;
  const P0=j.pier.find(x=>x.t==='bondi');if(!P0)return null;
  const prim=T.pats[P0.pi].s[P0.bi];
  const pa=piernaPie(rO,{x:T.sx[prim],y:T.sy[prim]},o.nombre,nomParada(prim),c);if(pa){pa.pts=[o.x,o.y,...pa.pts,T.sx[prim],T.sy[prim]];pp.push(pa);}
  let ultima=prim,costo=0,subidas=0,subte=false;
  for(const q of j.pier){
    if(q.t==='trans'){pp.push({t:'pie',seg:q.d*1.25/1.3+20,len:q.d*1.25,pts:[T.sx[q.de],T.sy[q.de],T.sx[q.a],T.sy[q.a]],tramos:[],pasos:[{t:`Caminá hasta ${nomParada(q.a)}`,d:`${Math.round(q.d*1.25/10)*10} m`}],de:nomParada(q.de),ha:nomParada(q.a),trans:1});ultima=q.a;continue;}
    const p=T.pats[q.pi],es=esperaDe(p,c),rd=rideSeg(p,q.bi,q.ai,c),dist=p.p[q.ai]-p.p[q.bi];
    if(p.sub){subte=true;}
    const f=p.sub?1888:tarifaColectivo(dist);costo+=subidas?f*.5:f;subidas++;
    pp.push({t:p.sub?'subte':'bus',linea:p.l,hacia:p.h,sube:nomParada(p.s[q.bi]),baja:nomParada(p.s[q.ai]),paradas:q.ai-q.bi,seg:rd,espera:es.w,hw:es.h,pts:recortaTraza(p,q.bi,q.ai),len:dist,pi:q.pi,bi:q.bi,ai:q.ai});
    ultima=p.s[q.ai];
  }
  const fin=piernaPie(rD,{x:T.sx[ultima],y:T.sy[ultima]},d.nombre,'',c);
  if(fin){
    const inv=caminoInv(rD,ultima,d,c);if(inv)pp.push(inv);
  }
  return {pp,costo,subte,subidas};
}
/* tramo final: Dijkstra se corrió desde el destino, se invierte para leerlo desde la parada */
function caminoInv(rD,s,d,c){
  const w=camino(rD,{x:T.sx[s],y:T.sy[s]},cl=>cl!==4);if(!w)return null;
  const n=w.pts.length,pts=[];for(let i=n-2;i>=0;i-=2)pts.push(w.pts[i],w.pts[i+1]);
  const tr=w.tramos.slice().reverse().map(t=>({nom:t.nom,cl:t.cl,len:t.len,ini:[t.fin[2],t.fin[3],t.fin[0],t.fin[1]],fin:[t.ini[2],t.ini[3],t.ini[0],t.ini[1]]}));
  const v=c.lluvia?1.22:1.35;
  return {t:'pie',seg:w.len/v+tr.length*12,len:w.len,pts:[T.sx[s],T.sy[s],...pts,d.x,d.y],tramos:tr,pasos:pasos(tr,'Bajá y andá'),de:nomParada(s),ha:d.nombre};
}
function directos(aO,aD,c,tope){
  const por=new Map();
  T.pats.forEach((p,pi)=>{
    if(p.sub)return;const es=esperaDe(p,c);if(!es)return;
    let base=Infinity,bi=-1,bv=Infinity,bb=-1,ba=-1;
    for(let i=0;i<p.s.length;i++){
      const s=p.s[i];
      if(bi>=0){const v=base+rideSeg(p,bi,i,c)+aD[s];if(v<bv){bv=v;bb=bi;ba=i;}}
      const b=aO[s];if(b<Infinity){const q=b+es.w;if(bi<0||q<base+rideSeg(p,bi,i,c)){base=q;bi=i;}}
    }
    if(bb>=0&&isFinite(bv)&&p.p[ba]-p.p[bb]>500){const o=por.get(p.l);if(!o||bv<o.v)por.set(p.l,{v:bv,pi,bi:bb,ai:ba,l:p.l,h:p.h,hw:es.h,pieO:aO[p.s[bb]],pieD:aD[p.s[ba]]});}
  });
  return [...por.values()].sort((a,b)=>a.v-b.v).slice(0,tope||12);
}
function planificar(o,d,c){
  const W=perfil('pie',c),ops=[];
  const r0=dijkstra(semillas(o,W,cl=>cl!==4).sem,W),pie=camino(r0,d,cl=>cl!==4);
  const directo=Math.hypot(o.x-d.x,o.y-d.y);
  if(pie){
    const seg=pie.len/(c.lluvia?1.22:1.35)+pie.tramos.length*12;
    ops.push({id:'pie',tipo:'pie',titulo:'A pie',min:seg/60,dMin:seg/60*.92,dMax:seg/60*1.1,costo:0,len:pie.len,
      resumen:`${cuadras(pie.len)} · ${km(pie.len)}`,pp:[{t:'pie',seg,len:pie.len,pts:[o.x,o.y,...pie.pts,d.x,d.y],tramos:pie.tramos,pasos:pasos(pie.tramos),de:o.nombre,ha:d.nombre}]});
  }
  /* transporte */
  const lim=(c.lluvia?700:1050)/1.35*1.4;
  const {a:aO,r:rO}=alcances(o,W,lim*1.15),{a:aD,r:rD}=alcances(d,W,lim*1.15);
  const usados=new Set(),suma=(j,id,titulo)=>{
    if(!j)return null;
    const v=armarViaje(o,d,j,rO,rD,c);if(!v)return null;
    const sig=v.pp.filter(p=>p.linea).map(p=>p.linea).join('>');if(usados.has(sig))return null;usados.add(sig);
    const seg=v.pp.reduce((a,p)=>a+p.seg+(p.espera||0),0);
    const hw=v.pp.reduce((a,p)=>a+(p.hw?p.hw*60:0),0),trans=v.pp.filter(p=>p.linea);
    const op={id,tipo:v.subte?'subte':'bus',titulo:trans.map(p=>(p.t==='subte'?'Subte ':'')+p.linea).join(' + '),min:seg/60,
      dMin:(seg-v.pp.reduce((a,p)=>a+(p.espera||0),0))/60,dMax:(seg+hw*.5)/60*1.08,costo:v.costo,pp:v.pp,len:v.pp.reduce((a,p)=>a+p.len,0)};
    op.pieM=v.pp.filter(p=>p.t==='pie').reduce((a,p)=>a+p.len,0);
    op.resumen=`${trans.map(p=>`${p.t==='subte'?'Línea ':''}${p.linea} en ${p.sube}`)[0]}`;
    ops.push(op);return op;
  };
  const dire=directos(aO,aD,c);
  const b0=dire[0];
  let opBus=null;
  if(b0){const j={pier:[{t:'bondi',pi:b0.pi,bi:b0.bi,ai:b0.ai}]};opBus=suma(j,'bus','');if(opBus)opBus.otras=dire.slice(1,7);}
  const jBB=raptor(aO,aD,c,p=>!p.sub,2);
  if(jBB&&(!opBus||jBB.v<opBus.min*60-200))suma(jBB,'trasbordo','');
  if(subteAbierto(c)){const jS=raptor(aO,aD,c,null,3);if(jS&&jS.pier.some(x=>x.t==='bondi'&&T.pats[x.pi].sub))suma(jS,'subte','');}
  if(subteAbierto(c)){
    const jSo=raptor(aO,aD,c,p=>p.sub,3);if(jSo&&jSo.pier.length)suma(jSo,'solosubte','');
  }
  /* bici */
  if(directo<14000){
    const Wb=perfil('bici',c),rb=dijkstra(semillas(o,Wb,cl=>cl!==4).sem,Wb),b=camino(rb,d,cl=>cl!==4);
    if(b){const seg=b.len/4.2+b.tramos.length*6+90;
      ops.push({id:'bici',tipo:'bici',titulo:'Bici',min:seg/60,dMin:seg/60*.9,dMax:seg/60*1.15,costo:0,len:b.len,resumen:`${km(b.len)} · evita avenidas cuando puede`,
        pp:[{t:'bici',seg,len:b.len,pts:[o.x,o.y,...b.pts,d.x,d.y],tramos:b.tramos,pasos:pasos(b.tramos,'Arrancá')}]});}
  }
  /* auto */
  const Wc=perfil('auto',c),rc=dijkstra(semillas(o,Wc,cl=>cl!==3).sem,Wc),a=camino(rc,d,cl=>cl!==3);
  if(a){const seg=a.costo+120,noche=c.min>=1320||c.min<360,f=(2550+255*(a.len/200)+255*(seg/60*.35))*(noche?1.2:1);
    ops.push({id:'auto',tipo:'auto',titulo:'Taxi o auto',min:seg/60,dMin:seg/60*.82,dMax:seg/60*1.35,costo:f,len:a.len,resumen:`${km(a.len)} · ${FRANJA[franja(c)]}`,
      pp:[{t:'auto',seg,len:a.len,pts:[o.x,o.y,...a.pts,d.x,d.y],tramos:a.tramos,pasos:pasos(a.tramos,'Arrancá')}]});}
  ops.sort((x,y)=>x.min-y.min);
  const u=ops.filter(x=>x.tipo!=='bici'&&x.tipo!=='auto'||1);
  if(u[0])u[0].marca='Más rápido';
  const barato=ops.filter(x=>x.costo>0).sort((x,y)=>x.costo-y.costo)[0];
  const gratis=ops.find(x=>x.tipo==='pie'&&x.min<=30);
  if(gratis&&!gratis.marca)gratis.marca='Gratis';
  else if(barato&&!barato.marca&&ops[0]!==barato)barato.marca='Más barato';
  return {ops,dire,aO,aD,rO,W};
}
const km=m=>m<950?`${Math.round(m/10)*10} m`:`${(m/1000).toFixed(1).replace('.',',')} km`;
const cuadras=m=>{const c=Math.max(1,Math.round(m/115));return `${c} ${c===1?'cuadra':'cuadras'}`;};
function variantesPie(o,d,c){
  const out=[];
  for(const [id,nom,des] of [['pie','La más corta','La menor distancia posible.'],['tranqui','Por calles tranquilas','Esquiva avenidas: menos ruido y menos semáforos largos.'],['avenida','Por avenidas','Más movimiento y comercios abiertos. Útil de noche.']]){
    const W=perfil(id,c),r=dijkstra(semillas(o,W,cl=>cl!==4).sem,W),w=camino(r,d,cl=>cl!==4);
    if(!w)continue;
    const seg=w.len/(c.lluvia?1.22:1.35)+w.tramos.length*12;
    const av=w.tramos.filter(t=>t.cl===1).reduce((a,t)=>a+t.len,0);
    out.push({id,nom,des,len:w.len,seg,av,pts:[o.x,o.y,...w.pts,d.x,d.y],tramos:w.tramos});
  }
  return out;
}
function geocodificar(q){
  q=q.trim();const out=[];if(q.length<3)return out;
  const y=q.match(/^(.+?)\s+(?:y|e|esq\.?|esquina)\s+(.+)$/i),n=q.match(/^(.+?)\s+(\d{1,5})$/);
  const clave=s=>sinTilde(s).replace(/\bav(da|enida)?\.?\s/g,'').trim();
  if(y){
    const a=clave(y[1]),b=clave(y[2]);
    const lista=new Map();
    for(let e=0;e<G.E&&out.length<4;e++){
      const m=clave(G.names[G.en[e]]);if(!m.includes(a))continue;
      for(const u of [G.ea[e],G.eb[e]]){
        for(let i=G.st[u];i<G.st[u+1];i++){const f=G.ad[i],nm=clave(G.names[G.en[f]]);
          if(nm.includes(b)&&!lista.has(u)){lista.set(u,1);out.push({nombre:`${G.names[G.en[e]]} y ${G.names[G.en[f]]}`,x:G.nx[u],y:G.ny[u],tipo:'dir'});}}
      }
    }
    return out;
  }
  if(n){
    const a=clave(n[1]),h=+n[2];const vistos=new Set();
    for(let e=0;e<G.E;e++){
      if(!(G.e0[e]<=h&&h<=G.e1[e]))continue;
      const nm=G.names[G.en[e]],m=clave(nm);if(!m.includes(a)||vistos.has(nm))continue;vistos.add(nm);
      const t=(h-G.e0[e])/Math.max(1,G.e1[e]-G.e0[e]),p=G.ep[e],k=Math.floor((p.length/2-1)*t)*2;
      const x=G.nx[G.ea[e]]+(G.nx[G.eb[e]]-G.nx[G.ea[e]])*t,y2=G.ny[G.ea[e]]+(G.ny[G.eb[e]]-G.ny[G.ea[e]])*t;
      out.push({nombre:`${nm} ${h}`,x,y:y2,tipo:'dir',sub:G.barrios[G.eba[e]]});if(out.length>3)break;
    }
  }
  return out;
}
function barrioDe(x,y){const m=enganchar(x,y);return m?G.barrios[G.eba[m.e]]||'':'';}
function esquinaDe(x,y){
  const m=enganchar(x,y);if(!m)return '';
  const a=G.ea[m.e],b=G.eb[m.e],u=Math.hypot(G.nx[a]-x,G.ny[a]-y)<Math.hypot(G.nx[b]-x,G.ny[b]-y)?a:b,s=[];
  for(let i=G.st[u];i<G.st[u+1];i++){const n=G.names[G.en[G.ad[i]]];if(n&&!s.includes(n))s.push(n);}
  return s.slice(0,2).join(' y ');
}

export {LON0,LAT0,wx,wy,alon,alat,sinTilde,cargarCalles,cargarTransporte,enganchar,perfil,dijkstra,semillas,camino,pasos,franja,frecuencia,subteAbierto,subteFrec,vecinas,esperaDe,rideSeg,planificar,km,cuadras,variantesPie,geocodificar,barrioDe,esquinaDe,nomParada,VBUS,FRANJA};
