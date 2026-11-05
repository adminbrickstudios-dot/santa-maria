/* Shaders propios: sin luces de Three, todo sale de unos pocos uniforms compartidos.
   Afuera se trabaja en lineal y cada shader termina en `tono()`, sin pasada de posproceso: es lo más
   barato en un celular. Ver `aplicarCielo` para lo que cambia con la hora. */
import * as THREE from "three";
import type { EstadoCielo } from "./cielo";
import { RANGO } from "./suelo";
import { CICLO_SEMAFORO } from "./piezas";

export interface Comunes {
  uSol: { value: THREE.Vector3 };
  uLuzSol: { value: THREE.Color };
  uLuzCielo: { value: THREE.Color };
  uLuzSuelo: { value: THREE.Color };
  uNiebla: { value: THREE.Color };
  uNieblaD: { value: THREE.Vector2 };
  uNoche: { value: number };
  uTiempo: { value: number };
  uExpo: { value: number };
  uCenit: { value: THREE.Color };
  uRKit: { value: number };
  uConSombra: { value: number };
  uSM0: { value: THREE.Matrix4 };
  uSM1: { value: THREE.Matrix4 };
  uTS0: { value: THREE.Texture | null };
  uTS1: { value: THREE.Texture | null };
  uRui: { value: THREE.Texture | null };
  uLluvia: { value: number };
}

export function crearComunes(): Comunes {
  return {
    uSol: { value: new THREE.Vector3(0, 1, 0) }, uLuzSol: { value: new THREE.Color() }, uLuzCielo: { value: new THREE.Color() }, uLuzSuelo: { value: new THREE.Color() },
    uNiebla: { value: new THREE.Color() }, uNieblaD: { value: new THREE.Vector2(60, 0.008) }, uNoche: { value: 0 }, uTiempo: { value: 0 }, uExpo: { value: 0.6 }, uCenit: { value: new THREE.Color() },
    uRKit: { value: 80 }, uConSombra: { value: 0 }, uSM0: { value: new THREE.Matrix4() }, uSM1: { value: new THREE.Matrix4() }, uTS0: { value: null }, uTS1: { value: null }, uRui: { value: null }, uLluvia: { value: 0 },
  };
}

/* Lo del interior: sin tonemap, igual que siempre */
const COMUN_INTERIOR = /* glsl */ `
uniform vec3 uSol, uLuzSol, uLuzCielo, uLuzSuelo, uNiebla;
uniform vec2 uNieblaD;
uniform float uNoche, uTiempo;
vec3 conNiebla(vec3 c, vec3 w){
  float x=max(length(w-cameraPosition)-uNieblaD.x,0.)*uNieblaD.y;
  return mix(c,uNiebla,1.-exp(-x*x));
}
`;

const COMUN_FRAG = /* glsl */ `
uniform vec3 uSol, uLuzSol, uLuzCielo, uLuzSuelo, uNiebla, uCenit;
uniform vec2 uNieblaD;
uniform float uNoche, uTiempo, uExpo, uConSombra, uLluvia;
uniform mat4 uSM0, uSM1;
uniform sampler2DShadow uTS0, uTS1;
uniform sampler2D uRui;
vec3 conNiebla(vec3 c, vec3 w){
  vec3 d=w-cameraPosition;
  float x=max(length(d)-uNieblaD.x,0.)*uNieblaD.y;
  return mix(c,uNiebla,(1.-exp(-x*x))*(1.-.6*clamp(d.y/220.,0.,1.)));
}
float h21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
vec3 lin(vec3 c){ return c*c*(c*.31+.69); }
vec3 tono(vec3 c){
  c*=uExpo;
  c=(c*(2.51*c+.03))/(c*(2.43*c+.59)+.14);
  return pow(clamp(c,0.,1.),vec3(.4545));
}
float sombra(vec3 w){
  if(uConSombra<.5) return 1.;
  if(uConSombra>1.5){
    vec4 p=uSM0*vec4(w,1.);
    vec3 q=p.xyz*.5+.5;
    if(q.x>.015&&q.y>.015&&q.x<.985&&q.y<.985&&q.z<1.) return texture(uTS0,vec3(q.xy,q.z-.0009));
  }
  vec4 p=uSM1*vec4(w,1.);
  vec3 q=p.xyz*.5+.5;
  if(q.x<0.||q.y<0.||q.x>1.||q.y>1.||q.z>1.) return 1.;
  vec2 b=min(q.xy,1.-q.xy);
  float borde=smoothstep(0.,.05,min(b.x,b.y));
  return mix(1.,texture(uTS1,vec3(q.xy,q.z-.0012)),borde);
}
/* Cielo visto en un reflejo, con el borde de la cuadra de enfrente */
vec3 ambiente(vec3 R){
  float h=max(R.y,0.);
  vec3 c=mix(uNiebla,uCenit,pow(h,.55));
  float s=max(dot(R,uSol),0.);
  c+=uLuzSol*pow(s,90.)*2.5;
  return c*1.05;
}
`;

const CAJA_GLSL = /* glsl */ `
float caja(float v,float c,float m,float aa){ return smoothstep(m+aa,m-aa,abs(v-c)); }
`;

/* ───────── Suelo ───────── */
export function matSuelo(c: Comunes, tex: { baldosa: THREE.Texture }, mapa: THREE.Texture, lado: number, ladoMapa: number) {
  return new THREE.ShaderMaterial({
    uniforms: { ...c, uBal: { value: tex.baldosa }, uMapa: { value: mapa }, uC: { value: lado }, uE: { value: new THREE.Vector2((ladoMapa - 1) / ladoMapa, 0.5 / ladoMapa) } },
    /* Escribe profundidad pero no la consulta: pinta por orden y deja que el cielo se salte lo tapado */
    depthFunc: THREE.AlwaysDepth, depthWrite: true, transparent: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    vertexShader: /* glsl */ `
      attribute vec4 aCol; attribute vec4 aMat;
      varying vec2 vL; varying vec3 vW; varying vec4 vCol; varying vec3 vMat;
      void main(){
        vL=position.xz; vCol=aCol; vMat=vec3(aMat.x*255.+.5,aMat.y,aMat.z);
        vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz;
        gl_Position=projectionMatrix*viewMatrix*w;
      }`,
    fragmentShader: COMUN_FRAG + /* glsl */ `
      uniform sampler2D uBal, uMapa; uniform float uC; uniform vec2 uE;
      varying vec2 vL; varying vec3 vW; varying vec4 vCol; varying vec3 vMat;
      const float R=${RANGO.toFixed(1)}/127.;
      vec4 mapa(vec2 l){ return (texture2D(uMapa,clamp(l/uC,0.,1.)*uE.x+uE.y)*255.-128.)*R; }
      vec3 luzSuelo(vec3 n,float ao,vec3 w){
        float s=sombra(w+vec3(0.,.04,0.));
        return uLuzCielo*ao*(.55+.45*n.y)+uLuzSol*max(dot(n,uSol),0.)*s*.82+uLuzSuelo*.12*ao;
      }
      void main(){
        float tipo=floor(vMat.x);
        vec3 V=cameraPosition-vW;
        float dist=length(V);
        vec3 alb, N=vec3(0.,1.,0.);
        float ao=1., a=1.;
        vec3 W=vW;
        vec4 ru=texture2D(uRui,vW.xz*.031), rf=texture2D(uRui,vW.xz*.37);
        if(tipo<.5){
          vec4 m=mapa(vL);
          float cara=0.;
          bool arriba=m.x>0.;
          if(dist<52.){
            float k=.15/max(V.y,.08);
            vec2 d=V.xz*k;
            vec4 m1=mapa(vL+d);
            if(m1.x>0.){ arriba=true; m=m1; W=vec3(vW.x+d.x,.15,vW.z+d.y); }
            else if(m.x>0.){ arriba=false; cara=1.; }
            else arriba=false;
          }
          float aa=clamp(dist*.004,.006,.5);
          if(cara>.5){
            /* Cara del cordón: piedra gris, más oscura abajo */
            alb=vec3(.3,.29,.27)*(.75+.5*rf.b); N=normalize(vec3(V.x,0.,V.z)); ao=.7;
          }else if(!arriba){
            /* Calzada: asfalto con grano, gastado por el tránsito y sucio junto al cordón */
            float borde=smoothstep(-.9,-.05,m.x);
            float g=rf.b*.55+rf.g*.45;
            alb=mix(vec3(.08,.08,.085),vec3(.135,.132,.13),g)*(.8+.5*ru.r);
            alb+=vec3(.012,.011,.01)*smoothstep(.56,.72,texture2D(uRui,vW.xz*2.1).b);
            alb=mix(alb,vec3(.05,.047,.045),borde*.8);
            alb=mix(alb,alb*1.28,smoothstep(.52,.3,ru.a)*.5);
            if(dist<26.){ N=normalize(vec3((texture2D(uRui,vW.xz*3.1).b-.5)*.12,1.,(texture2D(uRui,vW.zx*3.1).b-.5)*.12)); }
            ao=.86-.26*borde;
          }else{
            vec4 b=texture2D(uBal,W.xz/1.6);
            float pared=m.z, acera=m.w, senda=m.y;
            float vereda=max(1.-smoothstep(-.05,.05,acera), max(1.-smoothstep(1.8,2.4,pared), 1.-smoothstep(-.03,.03,senda)));
            vec3 bal=mix(vec3(.17,.155,.13),vec3(.36,.335,.29),b.b);
            bal*=.8+.4*ru.g;
            bal=mix(bal,bal*vec3(.72,.72,.74),smoothstep(.55,.72,rf.r)*.45);
            /* Remiendos de cemento y baldosas rotas */
            vec2 ce=floor(W.xz/5.);
            float rot=h21(ce);
            if(rot>.8){
              vec2 p=fract(W.xz/5.)-.5, e=vec2(.18+.2*fract(rot*7.),.14+.3*fract(rot*13.));
              float pa=smoothstep(.0,.03,min(e.x-abs(p.x),e.y-abs(p.y))+(ru.b-.5)*.1);
              bal=mix(bal,vec3(.2,.195,.185)*(.8+.4*rf.g),pa);
              b.rg=mix(b.rg,vec2(.5),pa);
            }
            vec3 ter=mix(vec3(.24,.225,.19),vec3(.2,.215,.13),smoothstep(.4,.62,ru.g))*(.8+.4*rf.b);
            alb=mix(ter,bal,vereda);
            if(dist<34.) N=normalize(vec3((b.r-.5)*.9*vereda,1.,(b.g-.5)*.9*vereda));
            /* Cordón de granito */
            float co=smoothstep(.21+aa,.19-aa*.5,m.x);
            alb=mix(alb,vec3(.3,.295,.27)*(.8+.4*rf.g),co);
            alb*=mix(.74,1.,smoothstep(.0,.9,pared));
            ao=mix(.42,1.,smoothstep(0.,4.5,pared));
            ao*=mix(.8,1.,smoothstep(0.,1.6,m.x));
          }
          vec3 c=alb*luzSuelo(N,ao,W);
          if(uLluvia>.5){
            /* Mojado: más oscuro y con cielo reflejado en los charcos */
            vec3 Vn=normalize(V);
            float ch=smoothstep(.42,.6,ru.r), fr=.03+.97*pow(1.-max(Vn.y,0.),5.);
            c=mix(c*.6,ambiente(reflect(-Vn,normalize(vec3(rf.b*.04-.02,1.,rf.g*.04-.02))))*.75,fr*(.35+.65*ch));
          }
          gl_FragColor=vec4(tono(conNiebla(c,vW)),1.);
          return;
        }
        if(tipo<9.5||tipo>20.5&&tipo<23.5){
          vec4 m=mapa(vL);
          if(tipo<3.5||tipo>4.5&&tipo<9.5||tipo>20.5) if(m.x<.15||m.w<-.1||m.y<0.) discard;
          if(tipo>22.5){ alb=mix(vec3(.13,.1,.075),vec3(.18,.16,.1),ru.g)*(.75+.5*rf.b); }
          else if(tipo>21.5){
            vec4 b=texture2D(uBal,vW.xz/3.2);
            alb=mix(vec3(.17,.16,.14),vec3(.3,.285,.25),b.b)*(.85+.3*ru.g);
          }else if(tipo>20.5){
            vec2 f=abs(fract(vW.xz/2.6)-.5);
            alb=vec3(.16,.155,.15)*(.8+.4*ru.g);
            alb=mix(alb,vec3(.55,.54,.5),smoothstep(.46,.47,f.x)*.6);
          }else if(tipo>8.5){ alb=mix(vec3(.24,.19,.12),vec3(.2,.2,.1),ru.g)*(.8+.4*rf.b); }
          else if(tipo>7.5){ alb=vec3(.42,.4,.36)*(.8+.4*ru.g); }
          else if(tipo>6.5){ alb=vec3(.3,.13,.1)*(.8+.3*rf.g); }
          else if(tipo>5.5){ alb=mix(vec3(.13,.22,.1),vec3(.2,.16,.1),ru.r); }
          else if(tipo>4.5){ alb=vec3(.6,.5,.34)*(.8+.3*rf.b); }
          else if(tipo>3.5){
            float o=sin(vW.x*.9+uTiempo*.9+ru.r*5.)*sin(vW.z*.7-uTiempo*.7+ru.b*5.);
            vec3 Rr=reflect(-normalize(V),normalize(vec3(o*.03,1.,o*.02)));
            float fr=.04+.96*pow(1.-max(normalize(V).y,0.),5.);
            vec3 c=mix(vec3(.02,.05,.06),ambiente(Rr),fr);
            gl_FragColor=vec4(tono(conNiebla(c,vW)),1.);
            return;
          }else{
            float p=texture2D(uRui,vW.xz*1.37).b;
            alb=mix(vec3(.06,.1,.035),vec3(.11,.15,.05),ru.g)*(.72+.56*p);
            alb=mix(alb,vec3(.2,.17,.1),smoothstep(.62,.75,ru.r)*.5);
            if(tipo>2.5) alb=mix(alb,vec3(.12,.09,.05),.35);
          }
          float ao2=mix(.7,1.,smoothstep(0.,4.,m.z));
          gl_FragColor=vec4(tono(conNiebla(alb*luzSuelo(N,ao2,vW),vW)),1.);
          return;
        }
        if(tipo<10.5){
          /* Pintura, gastada por las ruedas */
          float g=vMat.y>.001?smoothstep(.34,.56,texture2D(uRui,vW.xz*.43).g+rf.b*.3):smoothstep(.24,.44,rf.g);
          alb=vCol.rgb*vCol.rgb*.9; a=.92*g;
        }else if(tipo<11.5){
          gl_FragColor=vec4(vCol.rgb,vCol.a*vMat.y); return;
        }else if(tipo<12.5){
          float f=vMat.y; f*=f;
          vec3 c=vec3(1.,.7,.42)*.62;
          gl_FragColor=vec4(tono(c),vCol.a*f*uNoche*1.15); return;
        }else if(tipo<13.5){
          alb=vec3(.062,.062,.066)*(.8+.5*rf.b); a=.95;
        }else if(tipo<14.5){
          vec2 q=vec2(vW.x+vW.z,vW.z-vW.x)*2.4;
          vec2 f=abs(fract(q)-.5);
          float j=smoothstep(.5,.42,max(f.x,f.y));
          float leja=smoothstep(14.,40.,dist);
          alb=mix(mix(vec3(.04),vec3(.13,.12,.11)*(.7+.7*h21(floor(q))),j),vec3(.09,.085,.08),leja);
        }else if(tipo<15.5){
          vec2 d=vL; float g=step(.5,fract((d.x+d.y)*5.));
          alb=vec3(.1,.1,.11)*(.8+.3*g); a=step(.05,vMat.y);
        }else if(tipo<16.5){
          alb=vec3(.09,.065,.045)*(.6+.8*rf.b);
        }else if(tipo<17.5){
          alb=vec3(.2,.19,.18)*(.8+.4*rf.g);
        }else if(tipo<18.5){
          alb=vec3(.1,.1,.11)*(.8+.4*rf.g);
        }else if(tipo<19.5){
          alb=vec3(.14,.12,.1)*(.5+1.*texture2D(uRui,vW.xz*2.).b);
        }else if(tipo<20.5){
          alb=vec3(.3,.3,.32);
        }else if(tipo<24.5){
          /* Rampa: cemento rayado */
          alb=vec3(.24,.235,.22)*(.85+.3*rf.g)*(.92+.08*step(.5,fract((vW.x+vW.z)*5.)));
        }else if(tipo<25.5){
          vec2 d=vec2(dot(vW.xz,vec2(.707,.707)),dot(vW.xz,vec2(-.707,.707)));
          alb=vec3(.03)*(1.+1.5*step(.45,fract(d.x*11.)));
        }else{
          /* Cantero: tierra con flores */
          float fl=step(.56,texture2D(uRui,vW.xz*2.3).b), mt=texture2D(uRui,vW.xz*.7).r;
          vec3 c1=mix(vec3(.5,.06,.12),vec3(.62,.46,.05),step(.5,mt));
          alb=mix(vec3(.05,.04,.03),mix(vec3(.08,.14,.04),c1,step(.62,texture2D(uRui,vW.xz*3.7).b)),fl);
          a=smoothstep(.0,.25,vMat.y);
        }
        gl_FragColor=vec4(tono(conNiebla(alb*luzSuelo(N,.9,vW),vW)),a);
      }`,
  });
}

/* ───────── Edificios ───────── */
export function matEdificio(c: Comunes, calidad: { value: number }) {
  return new THREE.ShaderMaterial({
    uniforms: { ...c, uCalidad: calidad },
    vertexShader: /* glsl */ `
      attribute vec4 aUv; attribute vec4 aVen; attribute vec4 aEst; attribute vec4 aNor; attribute vec4 aCol;
      varying vec4 vUv; varying vec4 vVen; varying vec3 vCol; varying float vSem; varying vec3 vW; varying vec3 vN; varying vec3 vE;
      void main(){
        vUv=aUv; vVen=aVen; vCol=aCol.rgb; vSem=aCol.a; vN=aNor.xyz;
        vE=vec3(floor(aEst.x*255.+.5),floor(aEst.y*255.+.5),floor(aEst.z*255.+.5));
        vE.z+=aEst.w*.999; /* parte entera balcón+cornisa, fracción planta baja */
        vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz;
        gl_Position=projectionMatrix*viewMatrix*w;
      }`,
    fragmentShader: COMUN_FRAG + CAJA_GLSL + /* glsl */ `
      uniform float uCalidad, uRKit;
      varying vec4 vUv; varying vec4 vVen; varying vec3 vCol; varying float vSem; varying vec3 vW; varying vec3 vN; varying vec3 vE;
      vec3 muroDe(float mat,vec3 base,vec2 p,float y,float H,float sem,float dF,out float relieve){
        relieve=0.;
        vec4 n=texture2D(uRui,p*.13+sem*7.), g=texture2D(uRui,p*.9+sem);
        vec3 c=base;
        if(mat<.5){
          c*=.9+.14*n.g+.1*(g.b-.5);
        }else if(mat<1.5){
          /* Piedra París: hiladas con buñas */
          float a=.46, fy=fract(y/a), fi=floor(y/a), fx=fract(p.x/1.1+.5*mod(fi,2.));
          float j=smoothstep(.0,.05,fy)*smoothstep(1.,.95,fy)*smoothstep(0.,.02,fx)*smoothstep(1.,.98,fx);
          j=mix(j,1.,clamp(dF*14.,0.,1.));
          c*=(.8+.22*j)*(.92+.12*n.g)*(.96+.08*h21(vec2(floor(p.x/1.1+.5*mod(fi,2.)),fi)));
        }else if(mat<2.5){
          float a=.078, fi=floor(y/a), fy=fract(y/a), fx=fract(p.x/.25+.5*mod(fi,2.));
          float j=smoothstep(0.,.14,fy)*smoothstep(0.,.05,fx)*smoothstep(1.,.95,fx);
          j=mix(j,.8,clamp(dF*40.,0.,1.));
          vec3 lad=base*(.74+.5*h21(vec2(floor(p.x/.25+.5*mod(fi,2.)),fi)));
          lad=mix(lad,base,clamp(dF*40.,0.,1.));
          c=mix(vec3(.3,.28,.25),lad,j);
        }else if(mat<3.5){
          float pa=smoothstep(.0,.03,abs(fract(y/3.)-.5)-.45)+smoothstep(.0,.02,abs(fract(p.x/2.4)-.5)-.47);
          c*=(.86+.2*n.g)*(1.-.22*clamp(pa,0.,1.)*(1.-clamp(dF*14.,0.,1.)));
        }else if(mat<4.5){
          c*=1.;
        }else if(mat<5.5){
          c*=.86+.14*sin(p.x*18.)*(1.-clamp(dF*10.,0.,1.));
        }else if(mat<6.5){
          /* Medianera: revoque crudo, manchas de humedad y la huella de lo que hubo al lado */
          c*=.72+.3*n.g+.16*(g.g-.5);
          float hu=smoothstep(.5,.7,texture2D(uRui,vec2(p.x*.021,y*.012)+sem).r);
          c=mix(c,c*vec3(.72,.7,.66),hu);
          float vieja=step(y,6.+6.*h21(vec2(floor(p.x/6.),sem)))*step(.5,h21(vec2(floor(p.x/6.),sem+3.)));
          c=mix(c,c*vec3(.86,.83,.8),vieja*.8);
        }else if(mat<7.5){
          c=vec3(.1,.11,.13)*(.8+.4*step(.5,fract(y*5.+.5*step(.5,fract(p.x*3.)))));
        }else{
          c*=.95+.07*n.g;
        }
        /* Chorreados: hollín que baja de cornisas y antepechos */
        vec4 ch=texture2D(uRui,vec2(p.x*.11+sem,y*.016));
        float sucio=smoothstep(.45,.75,ch.a)*(.4+.6*smoothstep(H*.55,H,y));
        c*=1.-.1*sucio;
        return c;
      }
      void main(){
        float mat=vE.x, sem=vSem;
        vec3 N=normalize(vN);
        vec3 Vv=cameraPosition-vW; float dist=length(Vv); vec3 V=Vv/dist;
        float S=sombra(vW+N*.12);
        float dif=max(dot(N,uSol),0.);
        if(mat>19.5){
          /* Techos */
          vec2 p=vW.xz;
          vec4 n=texture2D(uRui,p*.07+sem), g=texture2D(uRui,p*.61);
          vec3 b=lin(vCol)*(.8+.3*n.g)*(.9+.2*g.b);
          if(mat<20.5){ vec2 f=abs(fract(p/.5)-.5); b*=.9+.1*smoothstep(.5,.46,max(f.x,f.y)); }
          vec3 l=uLuzCielo*.9+uLuzSol*dif*S;
          gl_FragColor=vec4(tono(conNiebla(b*l,vW)),1.);
          return;
        }
        vec3 T=vec3(-N.z,0.,N.x);
        float u=vUv.x, y=vUv.y, piso=vUv.z, H=vUv.w, bw=vVen.x, vA=vVen.y, v0=vVen.z, v1=vVen.w;
        float mol=mod(vE.y,16.), per=floor(vE.y/16.);
        float bal=mod(floor(vE.z),16.), cor=floor(floor(vE.z)/16.), pb=fract(vE.z)*255./32.;
        float dU=max(fwidth(u)*bw,1e-4), dY=max(fwidth(y),1e-4), dF=max(dU,dY);
        vec2 pm=vec2(u*bw,y);
        float rel;
        vec3 base=lin(vCol);
        vec3 col=muroDe(mat,base,pm,y,H,sem,dF,rel);
        if(mat>5.5&&mat<6.5&&vE.y>.5){
          /* Mural abstracto, sin marcas ni personas: colores planos con la textura del muro encima */
          vec2 q=pm/max(H,6.);
          float id=mod(vE.y,5.);
          vec3 c0=lin(vec3(.86,.32,.22)),c1=lin(vec3(.12,.46,.56)),c2=lin(vec3(.95,.74,.2)),c3=lin(vec3(.9,.86,.78));
          float f=id<1.?fract(q.x*2.+q.y*3.):id<2.?fract(length(q-vec2(.5,.5+.3*sin(sem*20.)))*4.):id<3.?fract(q.x*3.+sin(q.y*6.+sem*9.)*.3):id<4.?fract(q.y*4.+.4*sin(q.x*9.)):fract(atan(q.y-.5,q.x-.5)*.95+sem);
          vec3 mu=f<.25?c0:f<.5?c1:f<.75?c2:c3;
          float borde=smoothstep(.0,.04,min(min(pm.y-3.,H-pm.y-.6),min(pm.x-.4,20.)));
          col=mix(col,mu*(.8+.3*texture2D(uRui,pm*.09).g),borde*.92);
        }
        vec3 emi=vec3(0.);
        float aoP=1., vid=mat>3.5&&mat<4.5?1.:0.;
        bool haceVent=vA>.01||vid>.5;
        /* Un poco de visibilidad de cielo: la calle es un cañón */
        float cielo=mix(.5,1.,smoothstep(0.,22.,y));
        float cerca=1.-smoothstep(uRKit-5.,uRKit+3.,dist);
        if(haceVent&&y>=pb-.001){
          float fl=(y-pb)/piso, ip=floor(fl), py=fract(fl)*piso;
          float iu=floor(u), px=(fract(u)-.5)*bw;
          float r=h21(vec2(iu,ip)+sem*91.), r2=fract(r*7.3), r3=fract(r*13.1);
          float planta=step(H-.2,y+piso*0.);
          if(vid>.5){
            /* Muro cortina: paños de vidrio, antepechos oscuros y parantes */
            float ant=smoothstep(.3,.3+dY,py)*smoothstep(piso-.1,piso-.1-dY,py);
            float par=smoothstep(bw*.5-.04-dU,bw*.5-.04,abs(px));
            vec3 Rg=reflect(-V,normalize(N+vec3(.012*(r-.5),.008*(r2-.5),.012*(r3-.5))));
            float fr=.08+.92*pow(1.-max(dot(V,N),0.),4.);
            vec3 am=ambiente(Rg);
            vec3 g=mix(base*.25,am,clamp(fr+.28,0.,1.));
            vec3 l0=(uLuzCielo*.85+uLuzSuelo*.3)*cielo+uLuzSol*dif*S*.5;
            vec3 pa=lin(vec3(.2,.21,.22))*l0;
            vec3 fo=mix(pa,g,ant);
            fo=mix(fo,vec3(.05,.055,.06)*l0,par);
            fo+=ant*(1.-par)*uNoche*step(.58,r)*vec3(.9,.82,.6)*.7;
            gl_FragColor=vec4(tono(conNiebla(fo,vW)),1.);
            return;
          }
          /* Hueco de ventana con profundidad real: se sigue el rayo adentro del muro */
          float d=uCalidad<.5?0.:.2;
          float vn=max(dot(V,N),.08), vt=dot(V,T)/vn, vy=V.y/vn;
          vec2 q=vec2(px-vt*d,py-vy*d);
          float cy=(v0+v1)*.5, hy=(v1-v0)*.5;
          float aa=max(dU,dY)*1.2;
          float arco=mol>2.5?(1.-clamp(px*px/(vA*vA),0.,1.))*.18:0.;
          float boca=caja(px,0.,vA,aa)*smoothstep(v0-aa,v0+aa,py)*smoothstep(v1+arco+aa,v1+arco-aa,py);
          float pasa=smoothstep(.3,.8,max(dU,dY)/min(vA,hy));
          if(boca>.001){
            float enVid=step(abs(q.x),vA)*step(v0,q.y)*step(q.y,v1+arco);
            vec3 revoque=col*.82;
            /* Reveses del hueco */
            float lt=dot(uSol,T)/max(dot(uSol,N),.05), ly=uSol.y/max(dot(uSol,N),.05);
            vec3 hueco;
            float fp=(q.y-v0)/(v1-v0);
            if(enVid>.5){
              float cierre=(per<.5?mix(0.,.85,step(.45,r)*r2):per<1.5?step(.5,r)*.999*step(.25,r2):0.);
              float postigo=per>.5&&per<1.5?step(1.-cierre,1.):0.;
              float pers=step(1.-cierre,fp)*(per<.5?1.:0.);
              vec3 Rg=reflect(-V,normalize(N+vec3((r-.5)*.03,(r2-.5)*.02,(r3-.5)*.03)));
              float fr=.05+.95*pow(1.-max(dot(V,N),0.),5.);
              vec3 am=ambiente(Rg);
              /* Adentro: penumbra con cortina clara abajo */
              vec3 pieza=mix(vec3(.018,.02,.024),vec3(.06,.055,.05),smoothstep(.2,.8,fp*r2));
              float cort=step(.55,r3)*(.8+.2*sin(q.x*38.)*(1.-smoothstep(.02,.1,dU*8.)));
              pieza=mix(pieza,vec3(.34,.32,.28)*(uLuzCielo*.6),cort*.6);
              vec3 g=mix(pieza,am,clamp(fr+.1,0.,.9));
              float prende=step(.58,h21(vec2(ip,iu)*1.31+sem*17.));
              vec3 hog=mix(vec3(1.,.72,.38),vec3(1.,.88,.62),r2)*(1.1+.6*r3);
              vec3 luzC=hog*prende*(1.-.6*cort)*uNoche*1.6;
              /* Sol entrando en el hueco */
              float mx=mol<.5?.03:.05;
              float mar=1.-caja(q.x,0.,vA-mx,.004)*smoothstep(v0+mx,v0+mx+.004,q.y)*smoothstep(v1+arco-mx,v1+arco-mx-.004,q.y);
              float medio=per<2.5?caja(q.x,0.,.018,.004):0.;
              vec3 marco=lin(vec3(.62,.6,.56));
              if(per>.5&&per<1.5) marco=lin(vec3(.2,.26,.2));
              if(per>2.5) marco=lin(vec3(.17,.17,.18));
              hueco=g;
              vec3 cin=lin(vec3(.74,.72,.67))*(.86+.14*sin(q.y*62.)*(1.-smoothstep(.04,.14,dY*8.)));
              if(per<.5) hueco=mix(hueco,cin*(uLuzCielo+uLuzSol*dif*S*.5)*.8,pers);
              if(per>.5&&per<1.5&&cierre>.5){ vec3 cel=lin(vec3(.3,.36,.27))*(.86+.14*sin(q.y*80.)*(1.-smoothstep(.04,.14,dY*8.))); hueco=cel*(uLuzCielo+uLuzSol*dif*S*.5)*.8; luzC*=.12; }
              if(per<.5) luzC*=1.-pers;
              vec3 mc=marco*(uLuzCielo*.8+uLuzSol*dif*S*.5);
              hueco=mix(hueco,mc,clamp(mar+medio,0.,1.));
              float sMar=1.-clamp(mar+medio,0.,1.);
              emi+=boca*luzC*sMar;
            }else{
              float lado=step(vA,abs(q.x));
              float cl=lado>.5?clamp(sign(q.x)*-lt+.3,.25,1.):(q.y>v1?.35:.9);
              hueco=revoque*(uLuzCielo*.75*cl+uLuzSol*dif*S*cl*.8);
            }
            col=mix(col*1.,col,0.);
            col=col*(1.-boca);
            emi+=hueco*boca*(1.-pasa);
            vec3 prom=mix(vec3(.05,.06,.07),ambiente(reflect(-V,N)),.28);
            emi+=prom*boca*pasa;
          }
          /* Molduras pintadas: se confirman con el kit cuando estás cerca */
          if(mol>.5){
            float m=.11, aa2=aa*.8;
            float marco=caja(px,0.,vA+m,aa2)*smoothstep(v0-m-aa2,v0-m+aa2,py)*smoothstep(v1+m+arco+aa2,v1+m+arco-aa2,py)*(1.-boca);
            col=mix(col,col*1.14,marco);
          }
          /* Balcones vistos de lejos, y la sombra que dejan */
          if(bal>.5){
            float sb=smoothstep(.9,.1,py)*0.+smoothstep(piso-1.,piso,py);
            col*=1.-.36*sb*(bal>2.5?1.:caja(px,0.,vA+.5,.1));
            float lej=1.-cerca;
            if(lej>.01){
              float an=bal>2.5?1.:caja(px,0.,vA+.42,aa);
              float losa=smoothstep(.12+dY,.12-dY,py)*an;
              float bar=smoothstep(1.05+dY,1.05-dY,py)*step(.12,py)*an;
              col=mix(col,base*1.1,losa*lej);
              emi*=1.-bar*.75*lej;
              col=mix(col,mix(col,base*.5,.7),bar*lej*.7);
            }
          }
        }
        if(y<pb){
          /* Planta baja lejana: el kit la tapa de cerca */
          float h=min(pb,3.2);
          float iu=floor(u*max(1.,bw/3.2)), fu=fract(u*max(1.,bw/3.2)), r=h21(vec2(iu,sem)+3.);
          float aa=dF*2.;
          float v=caja(fu,.5,.36,aa/max(bw,1.))*smoothstep(.6,.6+aa,y)*smoothstep(h-.5+aa,h-.5,y);
          vec3 v2=mix(vec3(.03,.035,.04),ambiente(reflect(-V,N)),.22);
          if(r<.6) col=mix(col*.7,col,0.);
          col=mix(col,v2*.0+col*.8,step(.6,r)*0.);
          float lej=1.-cerca;
          emi+=v*lej*(v2+uNoche*vec3(.9,.72,.5)*step(.4,r));
          col*=1.-v*lej;
          col*=smoothstep(.0,.5,y)*.25+.75;
        }
        /* Cornisa arriba y pretil */
        if(mat<6.5){
          float aa=dY;
          float cor2=smoothstep(H-.6-aa,H-.6+aa,y)*smoothstep(H-.12+aa,H-.12-aa,y);
          if(cor>.5&&cerca<.99) col=mix(col,base*1.1,cor2*(1.-cerca));
          col*=1.-.3*smoothstep(H-1.,H-.62,y)*smoothstep(H-.5,H-.62,y)*(cor>.5?1.:0.);
        }
        float amb=cielo;
        vec3 luz=(uLuzCielo*(.7+.2*N.y)+uLuzSuelo*(.42-.1*smoothstep(0.,14.,y)))*amb+uLuzSol*dif*S;
        /* Luz cálida de la calle de noche */
        vec3 noc=vec3(1.,.74,.42)*uNoche*.5*exp(-y*.13);
        vec3 f=col*(luz+noc)+emi;
        gl_FragColor=vec4(tono(conNiebla(f,vW)),1.);
      }`,
  });
}

/* ───────── Frentes de locales, carteles y portales ───────── */
export function matDetalle(c: Comunes, atlas: THREE.Texture | null) {
  return new THREE.ShaderMaterial({
    uniforms: { ...c, uAtlas: { value: atlas }, uConAtlas: { value: atlas ? 1 : 0 } },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute vec2 aUv; attribute vec3 aNor; attribute vec4 aCol;
      varying vec2 vUv; varying vec3 vN; varying vec3 vCol; varying float vK; varying vec3 vW;
      void main(){
        vUv=aUv; vN=aNor; vCol=aCol.rgb; vK=aCol.a*255.;
        vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz;
        gl_Position=projectionMatrix*viewMatrix*w;
      }`,
    fragmentShader: COMUN_FRAG + CAJA_GLSL + /* glsl */ `
      uniform sampler2D uAtlas; uniform float uConAtlas;
      varying vec2 vUv; varying vec3 vN; varying vec3 vCol; varying float vK; varying vec3 vW;
      void main(){
        float k=floor(vK+.5);
        vec3 N=normalize(vN);
        if(!gl_FrontFacing) N=-N;
        vec3 V=normalize(cameraPosition-vW);
        float S=sombra(vW+N*.08);
        vec3 luz=uLuzCielo*.72*smoothstep(0.,2.6,vW.y)*.4+uLuzCielo*.45+uLuzSuelo*.3+uLuzSol*max(dot(N,uSol),0.)*S;
        vec3 col=lin(vCol), emi=vec3(0.);
        float vn=max(dot(V,N),.1);
        vec3 T=vec3(-N.z,0.,N.x);
        if(k<.5){
        }else if(k<1.5){
          /* Vidriera: una caja de 3 m de fondo detrás del vidrio, con góndolas y luz propia */
          float u=vUv.x, y=vUv.y, W=2.7;
          vec3 vt=vec3(-dot(V,T)/vn, -V.y/vn, 1.);
          float fondo=3.;
          /* Rayo al fondo de la caja */
          vec2 q=vec2(u,y)+vt.xy*fondo;
          float piso=y/max(-vt.y,.001), tec=(W-y)/max(vt.y,.001);
          float t=min(fondo,vt.y<0.?piso:tec);
          vec2 p=vec2(u,y)+vt.xy*t;
          vec3 base=lin(vCol);
          vec3 adentro;
          float fi=floor(p.y/.42), it=floor(p.x*3.1+fi*1.7), r=h21(vec2(it,fi));
          vec3 pared=mix(vec3(.82,.74,.62),base,.12);
          if(t>=fondo-.001){
            float est=step(.08,fract(p.y/.42))*step(.14,fract(p.x*3.1+fi*1.7));
            vec3 prod=mix(base*1.1,vec3(r,fract(r*7.),fract(r*13.))*.8+.1,.6);
            adentro=mix(pared*.5,prod,est*step(.14,r));
          }else if(vt.y<0.){
            vec2 g=abs(fract(vec2(u,0.)+vt.xy*t*vec2(1.,0.)+vec2(0.,t))*2.-1.);
            adentro=vec3(.5,.47,.42)*(.7+.3*step(.5,g.x+g.y-.5));
          }else{
            adentro=vec3(.9,.87,.8)*(.8+.5*step(.72,fract(p.x*.5))*step(.4,fract(t*.7)));
          }
          float ilum=mix(.32,1.25,uNoche);
          vec3 Rg=reflect(-V,N);
          float fr=.08+.92*pow(1.-vn,5.);
          vec3 refl=ambiente(Rg)*.55;
          float vano=step(.42,y)*step(y,2.6);
          float ccol=fract(u/1.75), mont=smoothstep(.0,.03,ccol)*smoothstep(1.,.97,ccol);
          vec3 marco=mix(col*.5,vec3(.03),.5);
          vec3 z=marco*luz;
          vec3 v=adentro*ilum*vec3(1.,.93,.82)+refl*fr*(1.-.7*uNoche);
          col=vec3(0.);
          emi=mix(z,v,vano*mont);
          if(y<.42){ col=lin(vCol)*.5; emi=vec3(0.); }
        }else if(k<2.5){
          float r=step(.5,fract(vUv.x/1.1));
          col=mix(col,lin(vec3(.93,.9,.84)),r*.92);
          col*=.9+.1*texture2D(uRui,vW.xz*.3).g;
          luz+=uLuzSol*.18;
        }else if(k<3.5){
          if(!gl_FrontFacing) discard;
          if(uConAtlas>.5){
            vec4 t=texture2D(uAtlas,vUv);
            col=lin(t.rgb); emi=col*uNoche*1.1;
          }
        }else if(k<4.5){
          emi=col*(.4+uNoche);
        }else if(k<5.5){
          vec2 p=abs(vUv-.5);
          float cr=clamp(step(p.x,.13)*step(p.y,.36)+step(p.y,.13)*step(p.x,.36),0.,1.);
          float pul=.8+.2*sin(uTiempo*2.4);
          col=mix(vec3(.002,.006,.004),vec3(.01,.8,.2)*pul,cr); emi=cr*vec3(.02,.9,.25)*(.4+uNoche*1.3)*pul;
        }else if(k<6.5){
          /* Puerta de edificio: hierro y vidrio con hall iluminado */
          float a=vUv.x, b=vUv.y, W=vUv.x; float w=1.9;
          float hoja=fract(a/(w*.5));
          float vano=smoothstep(.1,.12,hoja)*smoothstep(.9,.88,hoja)*step(.14,b)*step(b,2.5);
          float tr=1.-step(2.1,b)*step(b,2.16);
          float bar=1.-smoothstep(.0,.012,abs(b-1.05)-.025);
          vec3 refl=ambiente(reflect(-V,N));
          vec3 hall=mix(vec3(.05,.045,.04),vec3(.7,.6,.42),uNoche)*(.5+.5*smoothstep(1.,2.5,b));
          vec3 g=hall+refl*.22;
          vec3 h=col*luz;
          emi=mix(h,g,vano*tr);
          emi=mix(emi,lin(vec3(.62,.52,.3))*luz,bar*vano);
          col=vec3(0.);
          W=0.;
        }else if(k<7.5){
          /* Cortina metálica */
          float cin=.86+.14*step(.5,fract(vUv.y*9.));
          float g=texture2D(uRui,vUv*.21).a;
          col=lin(vCol)*cin*(.8+.3*g);
          float gra=smoothstep(.56,.7,texture2D(uRui,vUv*.09).r);
          col=mix(col,col*vec3(.5,.4,.45),gra*.5);
        }else if(k<8.5){
          /* Portón de garage: chapa con paneles */
          float pa=step(.08,fract(vUv.y/.62));
          col=lin(vCol)*(.72+.2*pa);
        }else if(k<9.5){
          /* Ventana de planta baja con reja */
          float w=vUv.x, h=vUv.y;
          float bar=step(.86,fract(w*6.))+step(.9,fract(h*2.6));
          vec3 g=mix(vec3(.012,.015,.018),ambiente(reflect(-V,N)),.1);
          g+=uNoche*vec3(.4,.3,.16)*step(.5,h21(floor(vW.xz/3.)));
          emi=mix(g,col*luz,clamp(bar,0.,1.));
          col=vec3(0.);
        }else{
          /* Zócalo de piedra oscura */
          vec4 n=texture2D(uRui,vUv*.31);
          col*=.8+.3*n.g;
          float j=step(.03,fract(vUv.x/1.2));
          col*=.85+.15*j;
        }
        gl_FragColor=vec4(tono(conNiebla(col*luz+emi,vW)),1.);
      }`,
  });
}

/* ───────── Kit de fachada, objetos, vehículos y gente ───────── */
export function matProp(c: Comunes) {
  return new THREE.ShaderMaterial({
    uniforms: { ...c, uCiclo: { value: CICLO_SEMAFORO } },
    vertexShader: /* glsl */ `
      attribute vec3 aColor; attribute float aParte; attribute float aFase;
      uniform float uTiempo;
      varying vec3 vC; varying vec3 vN; varying vec3 vW; varying float vP; varying vec3 vCi; varying vec2 vU;
      void main(){
        vec3 p=position; vP=aParte;
        #ifdef USE_INSTANCING_COLOR
          vCi=instanceColor;
        #else
          vCi=vec3(1.);
        #endif
        vC=aColor;
        if(aParte>2.5&&aParte<4.5){
          p.z+=(aParte<3.5?1.:-1.)*sin(uTiempo*6.2+aFase)*(.94-p.y)*.5;
        }
        if(aParte>17.5){
          float q=abs(p.x);
          p.z+=sin(q*2.6-uTiempo*5.)*.14*q*.6+sin(q*5.-uTiempo*7.)*.04*q;
          p.y+=sin(q*2.-uTiempo*4.)*.04*q;
        }
        if(aParte>5.5&&aParte<7.5){
          p.z+=(aParte<6.5?-1.:1.)*sin(uTiempo*6.2+aFase)*(1.42-p.y)*.38;
        }
        vec4 w; vec3 n;
        #ifdef USE_INSTANCING
          w=modelMatrix*instanceMatrix*vec4(p,1.);
          n=mat3(instanceMatrix)*normal;
          vU=aParte>17.5?p.xy:vec2(p.x*length(instanceMatrix[0].xyz),p.y*length(instanceMatrix[1].xyz));
        #else
          w=modelMatrix*vec4(p,1.);
          n=mat3(modelMatrix)*normal;
          vU=p.xy;
        #endif
        vN=n; vW=w.xyz;
        gl_Position=projectionMatrix*viewMatrix*w;
      }`,
    fragmentShader: COMUN_FRAG + /* glsl */ `
      uniform float uCiclo;
      varying vec3 vC; varying vec3 vN; varying vec3 vW; varying float vP; varying vec3 vCi; varying vec2 vU;
      void main(){
        vec3 N=normalize(vN);
        vec3 col=lin(vC);
        vec3 emi=vec3(0.);
        float p=vP;
        if(p>.5&&p<1.5) col*=lin(vCi);
        if(p>1.5&&p<2.5) emi=col*(.08+uNoche*2.5);
        if(p>15.5&&p<17.5){
          /* Peatonal: siga cuando el auto de esa mano tiene rojo */
          float f=fract((uTiempo+vCi.g*uCiclo)/uCiclo+vCi.r*.5);
          float siga=f>.52&&f<.9?1.:0.;
          float on=p<16.5?1.-siga:siga;
          emi=vC*on*(1.1+uNoche*1.5); col=vec3(.01);
        }
        if(p>17.5){
          /* Bandera: celeste, blanco, celeste */
          float z=(vU.y-8.625)/1.15;
          col=lin(z>.333&&z<.666?vec3(.95,.95,.93):vec3(.46,.68,.87));
        }
        if(p>7.5&&p<10.5){
          /* Semáforo: la fase y el corrimiento vienen en el color de instancia */
          float f=fract((uTiempo+vCi.g*uCiclo)/uCiclo+vCi.r*.5);
          float luz=f<.42?2.:f<.48?1.:0.;
          float on=step(abs(p-8.-(2.-luz)),.5);
          emi=vC*on*(1.1+uNoche*1.6)+vC*.03;
          col=vec3(.01);
        }
        if(p>14.5){
          /* Baranda de caño: tres horizontales y un parante cada tanto */
          float fy=fract(vU.y/.26), bx=fract(vU.x/1.3);
          if(fy>.1&&bx>.03) discard;
          col=lin(vCi);
        }else if(p>10.5&&p<11.5){
          /* Hierro forjado: barrotes y volutas */
          float aa=fwidth(vU.x)*1.5;
          float fr=fract(vU.x/.13);
          float bar=smoothstep(.2+aa/.13,.2,abs(fr-.5));
          vec2 ce=vec2(fract(vU.x/.52)-.5,(vU.y-.16)/.52-floor((vU.y-.16)/.52)-.5);
          float vo=smoothstep(.04,.0,abs(length(ce)-.3))*step(.14,vU.y)*step(vU.y,.82);
          if(max(bar,vo)<.5) discard;
          col=lin(vCi);
        }
        vec3 V=normalize(cameraPosition-vW);
        if(p>11.5&&p<12.5){
          vec3 r=ambiente(reflect(-V,N));
          float fr=.1+.9*pow(1.-abs(dot(V,N)),4.);
          gl_FragColor=vec4(tono(conNiebla(r*fr+vec3(.02),vW)),1.);
          return;
        }
        float s=sombra(vW+N*.06);
        vec3 luz=mix(uLuzSuelo*.9,uLuzCielo,.5+.5*N.y)+uLuzSol*max(dot(N,uSol),0.)*s;
        vec3 noc=vec3(1.,.74,.42)*uNoche*.3*exp(-vW.y*.16);
        /* Carrocerías y metales con un toque de brillo */
        vec3 c0=col*(luz+noc);
        if(p>.5&&p<1.5){ float fr=pow(1.-max(dot(V,N),0.),4.); c0+=ambiente(reflect(-V,N))*fr*.3; }
        if(p>12.5&&p<13.5){ float fr=.08+.92*pow(1.-max(dot(V,N),0.),5.); c0=mix(col*.3,ambiente(reflect(-V,N))*.7,clamp(fr+.12,0.,.85)); }
        if(p>13.5&&p<14.5){
          /* Muro de un edificio singular: ventanas pintadas en coordenadas de mundo */
          float h=dot(vW.xz,vec2(-N.z,N.x)), fy=fract(vW.y/4.2), fx=fract(h/3.1), a=fwidth(h)*.4+.02;
          float ve=smoothstep(.34-a,.34,abs(fx-.5))*0.+(1.-smoothstep(.2,.2+a,abs(fx-.5)))*(1.-smoothstep(.27,.27+a/2.,abs(fy-.5)));
          vec3 vr=mix(vec3(.02,.025,.03),ambiente(reflect(-V,N)),.3);
          c0=mix(c0,vr+uNoche*step(.6,h21(floor(vec2(h/3.1,vW.y/4.2))))*vec3(.9,.7,.4),ve*abs(1.-abs(N.y)));
        }
        gl_FragColor=vec4(tono(conNiebla(c0+emi,vW)),1.);
      }`,
  });
}

/* ───────── Follaje ───────── */
export function matFollaje(c: Comunes, atlas: THREE.Texture, alphaToCoverage: boolean) {
  return new THREE.ShaderMaterial({
    uniforms: { ...c, uAtlas: { value: atlas } },
    side: THREE.DoubleSide, alphaToCoverage,
    vertexShader: /* glsl */ `
      attribute float aSom; attribute vec3 aEsq;
      uniform float uTiempo;
      varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying float vS; varying vec3 vTint;
      void main(){
        vUv=uv; vS=aSom; vTint=instanceColor;
        vec4 w=modelMatrix*instanceMatrix*vec4(position,1.);
        float fa=w.x*.31+w.z*.27;
        w.xyz+=vec3(sin(uTiempo*1.2+fa),.4*sin(uTiempo*1.7+fa*1.3),cos(uTiempo*1.05+fa))*.04*aSom*(position.y*.1);
        /* Tarjeta de frente a la cámara, girada en su plano */
        float e=length(instanceMatrix[0].xyz), c=cos(aEsq.z), s=sin(aEsq.z);
        vec2 q=vec2(aEsq.x*c-aEsq.y*s,aEsq.x*s+aEsq.y*c)*e;
        vec3 der=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]), arr=vec3(viewMatrix[0][1],viewMatrix[1][1],viewMatrix[2][1]);
        w.xyz+=der*q.x+arr*q.y;
        vN=normalize(mat3(instanceMatrix)*normal); vW=w.xyz;
        gl_Position=projectionMatrix*viewMatrix*w;
      }`,
    fragmentShader: COMUN_FRAG + /* glsl */ `
      uniform sampler2D uAtlas;
      varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying float vS; varying vec3 vTint;
      void main(){
        vec4 t=texture2D(uAtlas,vUv);
        if(t.a<.36) discard;
        vec3 alb=lin(t.rgb/t.a)*vTint;
        vec3 N=normalize(vN);
        float s=.3+.7*sombra(vW+uSol*.5);
        float nl=dot(N,uSol);
        vec3 V=normalize(cameraPosition-vW);
        /* El sol atraviesa las hojas */
        float tr=pow(max(dot(-V,uSol),0.),3.)*.8;
        vec3 l=(uLuzCielo*(.62+.38*N.y)+uLuzSuelo*.4*(1.-N.y)*.5)*(.62+.38*vS)+uLuzSol*(max(nl*.75+.25,0.)+tr)*s*(.5+.5*vS);
        vec3 noc=vec3(1.,.74,.42)*uNoche*.2*exp(-vW.y*.14);
        gl_FragColor=vec4(tono(conNiebla(alb*(l+noc),vW)),1.);
      }`,
  });
}

/* ───────── Profundidad para las sombras ───────── */
export function matProfundidad() {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    colorWrite: false,
    vertexShader: /* glsl */ `
      void main(){
        #ifdef USE_INSTANCING
          gl_Position=projectionMatrix*viewMatrix*modelMatrix*instanceMatrix*vec4(position,1.);
        #else
          gl_Position=projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.);
        #endif
      }`,
    fragmentShader: `void main(){ gl_FragColor=vec4(1.); }`,
  });
}
export function matProfundidadHojas(atlas: THREE.Texture) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide, colorWrite: false,
    uniforms: { uAtlas: { value: atlas } },
    vertexShader: /* glsl */ `
      attribute vec3 aEsq;
      varying vec2 vUv;
      void main(){
        vUv=uv;
        vec4 w=modelMatrix*instanceMatrix*vec4(position,1.);
        float e=length(instanceMatrix[0].xyz), c=cos(aEsq.z), s=sin(aEsq.z);
        vec2 q=vec2(aEsq.x*c-aEsq.y*s,aEsq.x*s+aEsq.y*c)*e;
        w.xyz+=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0])*q.x+vec3(viewMatrix[0][1],viewMatrix[1][1],viewMatrix[2][1])*q.y;
        gl_Position=projectionMatrix*viewMatrix*w;
      }`,
    fragmentShader: `uniform sampler2D uAtlas; varying vec2 vUv; void main(){ if(texture2D(uAtlas,vUv).a<.4) discard; gl_FragColor=vec4(1.); }`,
  });
}

/* ───────── Interior de los locales ───────── */
export function matObjeto(c: Comunes, instanciado = true) {
  return new THREE.ShaderMaterial({
    uniforms: { ...c },
    defines: instanciado ? {} : { SIN_INSTANCIA: 1 },
    vertexShader: /* glsl */ `
      attribute vec3 aColor; attribute float aParte; attribute float aFase;
      uniform float uTiempo;
      varying vec3 vC; varying vec3 vN; varying vec3 vW; varying float vP; varying vec3 vCi;
      void main(){
        vec3 p=position; vP=aParte;
        #ifdef USE_INSTANCING_COLOR
          vCi=instanceColor;
        #else
          vCi=vec3(1.);
        #endif
        vC=aColor;
        if(aParte>2.5&&aParte<4.5){
          /* piernas: péndulo desde la cadera */
          p.z+=(aParte<3.5?1.:-1.)*sin(uTiempo*6.2+aFase)*(.94-p.y)*.5;
        }
        if(aParte>5.5){
          /* brazos: péndulo desde el hombro, al revés que las piernas */
          p.z+=(aParte<6.5?-1.:1.)*sin(uTiempo*6.2+aFase)*(1.42-p.y)*.38;
        }
        if(aParte>4.5&&aParte<5.5){ p.x+=sin(uTiempo*1.1+aFase)*.018*p.y; }
        #ifdef SIN_INSTANCIA
          vec4 w=modelMatrix*vec4(p,1.);
          vN=mat3(modelMatrix)*normal;
        #else
          vec4 w=modelMatrix*instanceMatrix*vec4(p,1.);
          vN=mat3(modelMatrix)*mat3(instanceMatrix)*normal;
        #endif
        vW=w.xyz;
        gl_Position=projectionMatrix*viewMatrix*w;
      }`,
    fragmentShader: COMUN_INTERIOR + /* glsl */ `
      varying vec3 vC; varying vec3 vN; varying vec3 vW; varying float vP; varying vec3 vCi;
      void main(){
        vec3 N=normalize(vN);
        vec3 col=vC;
        vec3 emi=vec3(0.);
        if((vP>.5&&vP<1.5)||(vP>4.5&&vP<5.5)) col*=vCi;
        if(vP>1.5&&vP<2.5){ emi=vC*(.15+uNoche*1.5); }
        float k=.5+.5*N.y;
        vec3 luz=mix(uLuzSuelo,uLuzCielo,k)+uLuzSol*max(dot(N,uSol),0.)*.72;
        gl_FragColor=vec4(conNiebla(col*luz*1.1+emi,vW),1.);
      }`,
  });
}

/* ───────── Cielo ───────── */
export function matCielo(c: Comunes) {
  return new THREE.ShaderMaterial({
    uniforms: { ...c },
    side: THREE.BackSide, depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vD;
      void main(){ vD=position; vec4 p=projectionMatrix*mat4(mat3(viewMatrix))*vec4(position,1.); gl_Position=p.xyww; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSol,uLuzSol,uCenit,uNiebla; uniform float uNoche,uTiempo,uExpo; uniform sampler2D uRui;
      varying vec3 vD;
      float h21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      vec3 tono(vec3 c){ c*=uExpo; c=(c*(2.51*c+.03))/(c*(2.43*c+.59)+.14); return pow(clamp(c,0.,1.),vec3(.4545)); }
      void main(){
        vec3 d=normalize(vD);
        float h=clamp(d.y,0.,1.);
        vec3 c=mix(uNiebla,uCenit,pow(h,.46));
        float s=max(dot(d,uSol),0.);
        c+=uLuzSol*(pow(s,10.)*.14+pow(s,120.)*.35+smoothstep(.99975,.99995,s)*14.);
        /* Nubes: dos capas de ruido proyectadas sobre un plano alto */
        vec2 q=d.xz/(d.y+.14);
        float n=texture2D(uRui,q*.06+vec2(uTiempo*.0009,0.)).g*.6+texture2D(uRui,q*.17+vec2(uTiempo*.0013,.3)).b*.28+texture2D(uRui,q*.43).r*.12;
        float nube=smoothstep(.5,.68,n)*smoothstep(.01,.17,d.y);
        float bajo=smoothstep(.5,.72,texture2D(uRui,q*.06+vec2(uTiempo*.0009+.012,.01)).g);
        vec3 cn=mix(vec3(1.,.98,.95)*1.6,uNiebla*.7,bajo*.6)+uLuzSol*.1*pow(s,4.);
        c=mix(c,cn*(1.-uNoche*.965),nube*.86);
        if(uNoche>.1){
          vec2 g=d.xz/(abs(d.y)+.3)*260., e=floor(g), f=fract(g)-.5;
          c+=step(.992,h21(e))*h21(e+3.)*smoothstep(.34,.1,length(f))*uNoche*uNoche*smoothstep(.04,.3,d.y)*(1.-nube)*.7;
        }
        gl_FragColor=vec4(tono(c),1.);
      }`,
  });
}

/** Lo que tapa el horizonte: un disco del color de la niebla bajo todo lo no cargado. */
export function matDisco(c: Comunes) {
  return new THREE.ShaderMaterial({
    uniforms: { uNiebla: c.uNiebla, uExpo: c.uExpo },
    depthFunc: THREE.AlwaysDepth, depthWrite: true,
    vertexShader: `void main(){ gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform vec3 uNiebla; uniform float uExpo;
      void main(){ vec3 c=uNiebla*uExpo; c=(c*(2.51*c+.03))/(c*(2.43*c+.59)+.14); gl_FragColor=vec4(pow(clamp(c,0.,1.),vec3(.4545)),1.); }`,
  });
}

/** Actualiza todos los uniforms que dependen de la hora. */
export function aplicarCielo(c: Comunes, e: EstadoCielo) {
  c.uSol.value.set(e.sol[0], Math.max(e.sol[1], 0.02), e.sol[2]).normalize();
  c.uLuzSol.value.setRGB(e.luzSol[0], e.luzSol[1], e.luzSol[2], THREE.LinearSRGBColorSpace);
  c.uLuzCielo.value.setRGB(e.luzCielo[0], e.luzCielo[1], e.luzCielo[2], THREE.LinearSRGBColorSpace);
  c.uLuzSuelo.value.setRGB(e.luzSuelo[0], e.luzSuelo[1], e.luzSuelo[2], THREE.LinearSRGBColorSpace);
  c.uNiebla.value.setRGB(e.horizonte[0], e.horizonte[1], e.horizonte[2], THREE.LinearSRGBColorSpace);
  c.uCenit.value.setRGB(e.cenit[0], e.cenit[1], e.cenit[2], THREE.LinearSRGBColorSpace);
  c.uNoche.value = e.noche;
  c.uExpo.value = e.expo;
}

/* ───────── Texturas procedurales compartidas ───────── */
function ruidoTileable(S: number, semilla: number) {
  let s = semilla >>> 0;
  const az = () => { s = Math.imul(s ^ (s >>> 15), 2246822519) + 1; s ^= s >>> 13; return ((s >>> 0) % 65536) / 65536; };
  const r = new Float32Array(64 * 64);
  for (let i = 0; i < r.length; i++) r[i] = az();
  return (x: number, y: number, p: number) => {
    const fx = (x / S) * p, fy = (y / S) * p, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
    const g = (a: number, b: number) => r[((b % p) * 64 + (a % p)) % r.length];
    const q = (t: number) => t * t * (3 - 2 * t), a = q(tx), b = q(ty);
    return (g(ix, iy) * (1 - a) + g(ix + 1, iy) * a) * (1 - b) + (g(ix, iy + 1) * (1 - a) + g(ix + 1, iy + 1) * a) * b;
  };
}

/** Ruido multiuso. R: manchones. G: nubes. B: grano. A: vetas alargadas. Se repite. */
export function texturaRuido(): THREE.Texture {
  const S = 256, d = new Uint8Array(S * S * 4), n = ruidoTileable(S, 7341), n2 = ruidoTileable(S, 991);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    const fbm = (f: (a: number, b: number, c: number) => number, p: number) => f(x, y, p) * 0.5 + f(x, y, p * 2) * 0.27 + f(x, y, p * 4) * 0.15 + f(x, y, p * 8) * 0.08;
    d[i] = fbm(n, 4) * 255;
    d[i + 1] = fbm(n2, 8) * 255;
    d[i + 2] = (n(x, y, 32) * 0.4 + n2(x, y, 48) * 0.35 + Math.random() * 0.25) * 255;
    d[i + 3] = (n2(x, y, 8) * 0.35 + n(x, y * 0.25, 32) * 0.65) * 255;
  }
  const t = new THREE.DataTexture(d, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/** Baldosa de vereda porteña: 4×4 piezas de 40 cm con nueve panes. RG normal, B claro, A junta. */
export function texturaBaldosa(): THREE.Texture {
  const S = 512, P = S / 4, alto = new Float32Array(S * S), tono = new Float32Array(16), n = ruidoTileable(S, 4242);
  for (let i = 0; i < 16; i++) tono[i] = Math.random();
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const fx = (x % P) / P, fy = (y % P) / P;
    const bor = Math.min(fx, fy, 1 - fx, 1 - fy);
    const j = Math.min(1, bor / 0.02);
    /* Nueve panes: canaletas a tercios */
    const c3 = (v: number) => { const a = Math.abs(((v * 3) % 1) - 0.5) * 2; return Math.min(1, (1 - a) / 0.11); };
    const canal = Math.min(c3(fx), c3(fy));
    const lom = 0.5 + 0.5 * Math.min(1, bor / 0.09);
    alto[y * S + x] = j * lom * (0.72 + 0.28 * canal) + (n(x, y, 64) - 0.5) * 0.06;
  }
  const d = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4, h = (a: number, b: number) => alto[((b + S) % S) * S + ((a + S) % S)];
    const ddx = h(x + 1, y) - h(x - 1, y), ddy = h(x, y + 1) - h(x, y - 1);
    const pieza = Math.floor(y / P) * 4 + Math.floor(x / P);
    d[i] = Math.max(0, Math.min(255, 128 - ddx * 200));
    d[i + 1] = Math.max(0, Math.min(255, 128 - ddy * 200));
    d[i + 2] = Math.max(0, Math.min(255, (alto[y * S + x] * 0.8 + 0.08 + tono[pieza] * 0.22 - 0.06) * 235 + (n(x, y, 96) - 0.5) * 36));
    d[i + 3] = 255;
  }
  const t = new THREE.DataTexture(d, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}
