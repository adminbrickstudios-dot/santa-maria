/* Shaders propios: sin luces de Three, todo sale de unos pocos uniforms compartidos. Trabajan
   directo en sRGB (estética de maqueta, y más barato). Ver `aplicarCielo` para lo que cambia con la hora. */
import * as THREE from "three";
import type { EstadoCielo } from "./cielo";

export interface Comunes {
  uSol: { value: THREE.Vector3 };
  uLuzSol: { value: THREE.Color };
  uLuzCielo: { value: THREE.Color };
  uLuzSuelo: { value: THREE.Color };
  uNiebla: { value: THREE.Color };
  uNieblaD: { value: THREE.Vector2 };
  uNoche: { value: number };
  uTiempo: { value: number };
}

export function crearComunes(): Comunes {
  return {
    uSol: { value: new THREE.Vector3(0, 1, 0) }, uLuzSol: { value: new THREE.Color() }, uLuzCielo: { value: new THREE.Color() }, uLuzSuelo: { value: new THREE.Color() },
    uNiebla: { value: new THREE.Color() }, uNieblaD: { value: new THREE.Vector2(60, 0.008) }, uNoche: { value: 0 }, uTiempo: { value: 0 },
  };
}

const COMUN_FRAG = /* glsl */ `
uniform vec3 uSol, uLuzSol, uLuzCielo, uLuzSuelo, uNiebla;
uniform vec2 uNieblaD;
uniform float uNoche, uTiempo;
vec3 conNiebla(vec3 c, vec3 w){
  float x=max(length(w-cameraPosition)-uNieblaD.x,0.)*uNieblaD.y;
  return mix(c,uNiebla,1.-exp(-x*x));
}
float h21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
`;

/* ───────── Suelo ───────── */
export function matSuelo(c: Comunes, detalle: THREE.Texture, lado: number) {
  return new THREE.ShaderMaterial({
    uniforms: { ...c, uDet: { value: detalle }, uC: { value: lado } },
    /* Escribe profundidad pero no la consulta: pinta por orden y deja que el cielo se salte lo tapado */
    depthFunc: THREE.AlwaysDepth, depthWrite: true, transparent: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    vertexShader: /* glsl */ `
      attribute vec4 aCol; attribute vec4 aMat;
      varying vec2 vL; varying vec3 vW; varying vec4 vCol; varying vec4 vMat;
      void main(){
        vL=position.xy; vCol=aCol; vMat=aMat;
        vec4 w=modelMatrix*vec4(position.x,0.,position.y,1.); vW=w.xyz;
        gl_Position=projectionMatrix*viewMatrix*w;
      }`,
    fragmentShader: COMUN_FRAG + /* glsl */ `
      uniform sampler2D uDet; uniform float uC;
      varying vec2 vL; varying vec3 vW; varying vec4 vCol; varying vec4 vMat;
      void main(){
        if(vL.x<-.02||vL.y<-.02||vL.x>uC+.02||vL.y>uC+.02) discard;
        vec4 d=texture2D(uDet,vW.xz/6.4);
        vec3 c=vCol.rgb;
        float agua=step(.3,vMat.a)*step(vMat.a,.7), luzNoche=step(.8,vMat.a);
        float a=vCol.a;
        if(luzNoche>.5){ a*=uNoche; gl_FragColor=vec4(conNiebla(c*1.15,vW),a); return; }
        c*=1.+(d.r-.5)*.26*vMat.r;
        c*=mix(1.,.82+d.g*.26,vMat.g);
        c*=1.+(d.b-.5)*.5*vMat.b;
        vec3 luz=uLuzCielo*.72+uLuzSol*max(uSol.y,.0)*.38+uLuzSuelo*.08;
        c*=luz;
        if(agua>.5){
          float o=sin(vW.x*.9+uTiempo*.9+d.r*5.)*sin(vW.z*.7-uTiempo*.7+d.b*5.);
          c+=uLuzCielo*(.05+.09*o);
        }
        gl_FragColor=vec4(conNiebla(c,vW),a);
      }`,
  });
}

/** Sombras proyectadas: aplasta las paredes contra el piso en dirección contraria al sol. */
export function matSombra(c: Comunes) {
  return new THREE.ShaderMaterial({
    uniforms: { ...c, uProy: { value: new THREE.Vector2() }, uFuerza: { value: 0.3 } },
    depthTest: false, depthWrite: false, side: THREE.DoubleSide, transparent: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    stencilWrite: true, stencilFunc: THREE.NotEqualStencilFunc, stencilRef: 1, stencilZPass: THREE.ReplaceStencilOp,
    vertexShader: /* glsl */ `
      uniform vec2 uProy; varying vec3 vW;
      void main(){
        vec4 w=modelMatrix*vec4(position,1.);
        w.xz+=uProy*w.y; w.y=0.; vW=w.xyz;
        gl_Position=projectionMatrix*viewMatrix*w;
      }`,
    fragmentShader: COMUN_FRAG + /* glsl */ `
      uniform float uFuerza; varying vec3 vW;
      void main(){
        float x=max(length(vW-cameraPosition)-uNieblaD.x,0.)*uNieblaD.y;
        gl_FragColor=vec4(.16,.16,.27,uFuerza*exp(-x*x));
      }`,
  });
}

/* ───────── Edificios ───────── */
export function matEdificio(c: Comunes, calidad: { value: number }) {
  return new THREE.ShaderMaterial({
    uniforms: { ...c, uCalidad: calidad },
    vertexShader: /* glsl */ `
      attribute vec4 aUv; attribute vec2 aNor; attribute vec4 aCol;
      varying vec4 vUv; varying vec3 vCol; varying float vSem; varying vec3 vW; varying vec2 vN;
      void main(){
        vUv=aUv; vCol=aCol.rgb; vSem=aCol.a; vN=aNor;
        vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz;
        gl_Position=projectionMatrix*viewMatrix*w;
      }`,
    fragmentShader: COMUN_FRAG + /* glsl */ `
      uniform float uCalidad;
      varying vec4 vUv; varying vec3 vCol; varying float vSem; varying vec3 vW; varying vec2 vN;
      const float PB=3.4;
      float caja(float v,float c,float m,float aa){ return smoothstep(m+aa,m-aa,abs(v-c)); }
      void main(){
        float sem=floor(vSem*255.+.5)/255.;
        float u=vUv.x, y=vUv.y, pisoH=abs(vUv.z), H=vUv.w, conPb=step(0.,vUv.z);
        vec3 N=normalize(vec3(vN.x,0.,vN.y));
        float dif=max(dot(N,uSol),0.);
        vec3 luz=(uLuzCielo*.56+uLuzSuelo*.5)*(.92+.08*N.x)+uLuzSol*dif*.62;
        vec3 muro=vCol*(.985+.03*sin(y*.8+sem*40.));
        vec3 col=muro, emi=vec3(0.);
        float est=floor(sem*3.999);
        float ven=mix(.25,.34,fract(sem*7.));
        if(u<-.5){
          /* Medianera: revoque sin ventanas */
          col=mix(muro,vec3(.82,.79,.74),.45)*(.97+.03*sin(y*.45+sem*20.));
        }else{
          float dU=max(fwidth(u),1e-4), dY=max(fwidth(y),1e-4);
          float pasa=0.;
          if(uCalidad<.5){
            /* versión barata para equipos justos: solo ventanas lisas */
            float y0=conPb*PB, p=(y-y0)/pisoH;
            float m=step(.24,fract(u))*step(fract(u),.76)*step(.3,fract(p))*step(fract(p),.8)*step(y0,y);
            col=mix(muro*(y<y0?.78:1.),vec3(.2,.24,.3)+.25*uLuzCielo,m*.85);
            emi+=m*uNoche*step(.6,h21(floor(vec2(u,p))*1.3+sem*17.))*vec3(.95,.75,.45);
          }else if(conPb>.5&&y<PB){
            float iu=floor(u), fu=fract(u), r=h21(vec2(iu,1.)+sem*53.);
            vec3 base=mix(muro*.74,vec3(.45,.42,.4),.3+.3*fract(sem*3.));
            col=base;
            float ax=dU*1.2, ay=dY*1.2;
            if(r<.34){
              /* portón o persiana metálica */
              float m=caja(fu,.5,.43,ax)*smoothstep(2.65+ay,2.65-ay,y);
              float cin=.86+.14*sin(y*22.);
              col=mix(col,vec3(.56,.57,.6)*cin,m);
            }else if(r<.62){
              /* puerta de calle con paño de vidrio */
              float m=caja(fu,.5,.27,ax)*smoothstep(2.5+ay,2.5-ay,y);
              float vid=caja(fu,.5,.17,ax)*caja(y,1.5,.72,ay);
              col=mix(col,vec3(.24,.17,.13),m);
              vec3 v=mix(vec3(.16,.2,.26),uLuzCielo*.55,.5);
              col=mix(col,v,vid);
              emi+=vid*uNoche*vec3(.55,.42,.25)*step(.3,r*3.-floor(r*3.));
            }else{
              /* ventana con reja */
              float m=caja(fu,.5,.33,ax)*caja(y,1.75,.72,ay);
              vec3 v=mix(vec3(.13,.16,.22),uLuzCielo*.5,.42);
              float reja=step(.7,fract(fu*7.))*(1.-smoothstep(.2,.45,dU*7.));
              v=mix(v,vec3(.12),reja*.8);
              col=mix(col,v,m);
              emi+=m*uNoche*step(.5,h21(vec2(iu,7.)+sem))*vec3(.7,.55,.32)*(1.-reja);
            }
            /* zócalo y cornisa de la planta baja */
            col=mix(col,base*.72,smoothstep(.6+ay,.6-ay,y));
            col=mix(col,muro*1.1,smoothstep(3.0-ay,3.0+ay,y));
            col=mix(col,base*.55,smoothstep(.09,.0,y));
            pasa=smoothstep(.5,1.4,dU);
            col=mix(col,base*.82,pasa);
          }else{
            float y0=conPb*PB, p=(y-y0)/pisoH, ip=floor(p), fp=fract(p), fu=fract(u), iu=floor(u);
            float dP=dY/pisoH, ax=dU*1.3, ay=dP*1.3;
            float r=h21(vec2(iu,ip)+sem*91.);
            float mx=caja(fu,.5,ven,ax), my=caja(fp,.55,.27,ay), m=mx*my;
            float mx2=caja(fu,.5,ven+.035,ax), my2=caja(fp,.55,.27+.05,ay), rim=mx2*my2;
            float tinte=.5+.5*r;
            vec3 refl=mix(uNiebla,uLuzCielo,clamp(fp*1.1,0.,1.));
            vec3 vid=mix(vec3(.13,.17,.24),refl*.86,.34+.3*tinte);
            /* cortina de enrollar a medio bajar, tan de acá */
            float cierre=step(.42,r)*fract(r*7.3)*.85;
            float yv=clamp((fp-.28)/.54,0.,1.), pers=step(1.-cierre,yv);
            float cinta=1.-smoothstep(.1,.5,dY*11.);
            vec3 cor=mix(vec3(.82,.79,.72),muro,.25)*(.95+.05*sin(y*69.)*cinta);
            vid=mix(vid,cor,pers);
            float prende=step(.6,h21(vec2(ip,iu)*1.31+sem*17.));
            vec3 hog=mix(vec3(1.,.8,.48),vec3(1.,.92,.72),fract(r*5.))*(1.-.75*pers);
            col=mix(col,muro*1.13,rim);
            col=mix(col,vid,m);
            emi+=m*prende*uNoche*hog*.95;
            /* moldura entre pisos */
            col*=1.-.14*smoothstep(.05+ay,.05-ay,abs(fp-.02));
            if(mod(est,2.)<.5){
              /* balcón corrido con baranda */
              float losa=smoothstep(.1+ay,.1-ay,fp)*mx2;
              col=mix(col,muro*1.2,losa);
              float bar=smoothstep(.32+ay,.32-ay,fp)*mx2*step(.1,fp);
              float pal=step(.55,fract(fu*16.))*(1.-smoothstep(.3,.6,dU*16.));
              float tope=smoothstep(.31,.3,fp)*smoothstep(.27,.28,fp);
              col=mix(col,vec3(.17,.18,.2),bar*max(pal*.85,tope));
            }
            pasa=smoothstep(.42,.95,max(dU,dP));
            vec3 prom=mix(muro,vec3(.26,.3,.36)+.2*uLuzCielo,.3);
            col=mix(col,prom,pasa);
            emi*=mix(1.,.55,pasa);
          }
          /* cornisa arriba */
          col=mix(col,muro*1.16,smoothstep(H-.55-dY,H-.55+dY,y));
          col=mix(col,muro*.78,smoothstep(H-.14-dY,H-.14+dY,y));
        }
        /* oclusión al pie y un poquito de gradiente en altura */
        col*=mix(.74,1.,smoothstep(0.,3.2,y))*(.96+.1*clamp(y/40.,0.,1.));
        vec3 f=col*luz*1.08+emi;
        gl_FragColor=vec4(conNiebla(f,vW),1.);
      }`,
  });
}

/* ───────── Frentes de locales, carteles y postes ───────── */
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
    fragmentShader: COMUN_FRAG + /* glsl */ `
      uniform sampler2D uAtlas; uniform float uConAtlas;
      varying vec2 vUv; varying vec3 vN; varying vec3 vCol; varying float vK; varying vec3 vW;
      void main(){
        float k=floor(vK+.5);
        vec3 N=normalize(vN);
        if(!gl_FrontFacing) N=-N;
        vec3 luz=(uLuzCielo*.56+uLuzSuelo*.5)+uLuzSol*max(dot(N,uSol),0.)*.62;
        vec3 col=vCol, emi=vec3(0.);
        if(k<.5){
        }else if(k<1.5){
          /* vidriera: u y v en metros. Góndolas y mercadería sugeridas, con reflejo de la calle */
          float u=vUv.x, y=vUv.y, df=max(fwidth(u),fwidth(y));
          float vano=step(.42,y)*step(y,2.56);
          float ccol=fract(u/1.75), mont=smoothstep(.0,.035,ccol)*smoothstep(1.,.965,ccol);
          float limpio=1.-smoothstep(.04,.14,df);
          float fila=floor(y/.58), fy=fract(y/.58);
          float ite=floor(u*4.2+fila*1.7), r=h21(vec2(ite,fila)+floor(vCol.rg*16.+.5));
          float alto=.3+.5*r;
          float pieza=step(fy,alto)*step(.12,fract(u*4.2+fila*1.7))*step(.1,r)*limpio;
          vec3 fondo=mix(vec3(.98,.9,.76),vCol,.16)*(.72+.28*smoothstep(.42,2.5,y));
          vec3 obj=mix(vCol*1.1,vec3(r,fract(r*7.),fract(r*13.))*.85+.12,.6);
          vec3 adentro=mix(fondo,obj,pieza*.85);
          adentro*=1.-.45*(1.-smoothstep(.0,.05,fy))*limpio;
          float diag=smoothstep(.0,.25,fract((u*.6+y*.42)+vW.x*.03+vW.z*.03));
          vec3 refl=mix(uNiebla,uLuzCielo,clamp(y/2.6,0.,1.));
          vec3 vid=mix(adentro*.74,refl,.14+.2*diag*diag*.5);
          vec3 marco=mix(vCol*.5,vec3(.14,.14,.17),.5);
          col=mix(marco,vid,vano*mont);
          col=mix(col,vCol*.72,1.-step(.42,y));
          emi=vano*mont*uNoche*(adentro*.72+vec3(.08,.06,.03));
        }else if(k<2.5){
          /* toldo a rayas */
          float r=step(.5,fract(vUv.x/1.1));
          col=mix(vCol,vec3(.96,.93,.88),r*.92);
        }else if(k<3.5){
          if(!gl_FrontFacing) discard;
          if(uConAtlas>.5){
            vec4 t=texture2D(uAtlas,vUv);
            col=t.rgb; emi=col*uNoche*.72;
          }
        }else if(k<4.5){
          emi=vCol*(.4+uNoche);
        }else{
          /* cruz verde de farmacia */
          vec2 p=abs(vUv-.5);
          float cr=step(p.x,.13)*step(p.y,.36)+step(p.y,.13)*step(p.x,.36);
          float pul=.8+.2*sin(uTiempo*2.4);
          vec3 c2=mix(vec3(.04,.08,.06),vec3(.12,.9,.46)*pul,clamp(cr,0.,1.));
          col=c2; emi=clamp(cr,0.,1.)*vec3(.1,.7,.32)*(.35+uNoche)*pul;
        }
        gl_FragColor=vec4(conNiebla(col*luz*1.08+emi,vW),1.);
      }`,
  });
}

/* ───────── Árboles, vehículos, gente, muebles ───────── */
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
    fragmentShader: COMUN_FRAG + /* glsl */ `
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
export function matCielo(c: Comunes, cen: { value: THREE.Color }, hor: { value: THREE.Color }) {
  return new THREE.ShaderMaterial({
    uniforms: { ...c, uCenit: cen, uHorizonte: hor },
    side: THREE.BackSide, depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vD;
      void main(){ vD=position; vec4 p=projectionMatrix*mat4(mat3(viewMatrix))*vec4(position,1.); gl_Position=p.xyww; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSol,uLuzSol,uCenit,uHorizonte; uniform float uNoche,uTiempo;
      varying vec3 vD;
      float h21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float rui(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y); }
      void main(){
        vec3 d=normalize(vD);
        float h=clamp(d.y,0.,1.);
        vec3 c=mix(uHorizonte,uCenit,pow(h,.5));
        float s=max(dot(d,uSol),0.);
        c+=uLuzSol*(pow(s,18.)*.22+pow(s,240.)*.5+smoothstep(.9994,.9998,s)*1.2);
        vec2 q=d.xz/(d.y+.16)*1.4+vec2(uTiempo*.006,0.);
        float n=rui(q)*.55+rui(q*2.1+3.)*.3+rui(q*4.3+7.)*.15;
        float nube=smoothstep(.52,.74,n)*smoothstep(0.,.14,d.y);
        vec3 cn=mix(vec3(1.,.97,.93),uHorizonte*1.05,.25+.4*smoothstep(.0,.3,1.-h));
        c=mix(c,cn*(1.-uNoche*.72),nube*.8);
        if(uNoche>.1){
          vec2 g=d.xz/(abs(d.y)+.3)*260., e=floor(g), f=fract(g)-.5;
          c+=step(.992,h21(e))*h21(e+3.)*smoothstep(.34,.1,length(f))*uNoche*uNoche*smoothstep(.04,.3,d.y)*(1.-nube);
        }
        gl_FragColor=vec4(c,1.);
      }`,
  });
}

/** Lo que tapa el horizonte: un disco del color de la niebla bajo todo lo no cargado. */
export function matDisco(c: Comunes) {
  return new THREE.ShaderMaterial({
    uniforms: { uNiebla: c.uNiebla },
    depthFunc: THREE.AlwaysDepth, depthWrite: true,
    vertexShader: `void main(){ gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform vec3 uNiebla; void main(){ gl_FragColor=vec4(uNiebla,1.); }`,
  });
}

/** Actualiza todos los uniforms que dependen de la hora. */
export function aplicarCielo(c: Comunes, e: EstadoCielo) {
  c.uSol.value.set(e.sol[0], Math.max(e.sol[1], 0.02), e.sol[2]).normalize();
  c.uLuzSol.value.setRGB(e.luzSol[0], e.luzSol[1], e.luzSol[2], THREE.LinearSRGBColorSpace);
  c.uLuzCielo.value.setRGB(e.luzCielo[0], e.luzCielo[1], e.luzCielo[2], THREE.LinearSRGBColorSpace);
  c.uLuzSuelo.value.setRGB(e.luzSuelo[0], e.luzSuelo[1], e.luzSuelo[2], THREE.LinearSRGBColorSpace);
  c.uNiebla.value.setRGB(e.horizonte[0], e.horizonte[1], e.horizonte[2], THREE.LinearSRGBColorSpace);
  c.uNoche.value = e.noche;
}

/* ───────── Textura de detalle compartida ───────── */
/** R: granito del asfalto. G: baldosas en damero. B: manchones de pasto. Tilea cada 6,4 m. */
export function texturaDetalle(): THREE.Texture {
  const S = 256, cv = document.createElement("canvas");
  cv.width = cv.height = S;
  const ctx = cv.getContext("2d")!, img = ctx.createImageData(S, S), n = 16;
  const ruido: number[] = [];
  for (let i = 0; i < 64 * 64; i++) ruido.push(Math.random());
  const blando = (x: number, y: number, p: number) => {
    const fx = (x / S) * p, fy = (y / S) * p, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
    const g = (a: number, b: number) => ruido[((b % p) * 64 + (a % p)) % ruido.length];
    const s = (t: number) => t * t * (3 - 2 * t);
    return (g(ix, iy) * (1 - s(tx)) + g(ix + 1, iy) * s(tx)) * (1 - s(ty)) + (g(ix, iy + 1) * (1 - s(tx)) + g(ix + 1, iy + 1) * s(tx)) * s(ty);
  };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    img.data[i] = 128 + (Math.random() - 0.5) * 120 + (blando(x, y, 16) - 0.5) * 80;
    const fx = (x / S) * n, fy = (y / S) * n, bx = Math.floor(fx), by = Math.floor(fy);
    const junta = Math.min(fx - bx, fy - by, 1 - (fx - bx), 1 - (fy - by)) < 0.05;
    const tono = ((bx + by) % 2) * 0.1 + ruido[(by * 64 + bx) % ruido.length] * 0.1;
    const dib = (Math.floor(fx * 3) + Math.floor(fy * 3)) % 2 === 0 ? 0.04 : 0;
    img.data[i + 1] = junta ? 70 : 150 + (tono + dib) * 520 + (Math.random() - 0.5) * 16;
    img.data[i + 2] = 128 + (blando(x, y, 8) - 0.5) * 190 + (Math.random() - 0.5) * 70;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}
