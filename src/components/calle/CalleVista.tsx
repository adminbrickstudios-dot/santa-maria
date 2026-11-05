"use client";
/* Modo calle: la interfaz encima del 3D. El motor se baja recién acá, para no pesar en otras pantallas. */
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icono } from "@/components/Icono";
import { describirCategoria } from "@/lib/calle/categoria-lugar";
import { crearCliente, type ClienteCiudad } from "@/lib/calle/cliente";
import { RUBROS } from "@/lib/calle/categorias";
import type { Lugar } from "@/components/ElegirLugar";
import { crearProveedorLugar, crearProveedorTiles } from "@/lib/calle/proveedor";
import { FILTROS, type IdFiltro } from "@/lib/calle/filtros";
import type { Cercano, Cuadra, DatosEdificio, Parada } from "@/lib/calle/nucleo";
import type { DatosLugar } from "@/lib/calle/recepcion";
import type { Local, ProveedorLugar, ProveedorTiles } from "@/lib/calle/tipos";
import type { EstadoViaje, ModoMarcha, Motor } from "@/lib/calle/motor";
import { Buscador, TarjetaDestino, type Destino } from "./Buscador";
import { ASCENSOR, CAMARA, Credito, HojaCalle, MODOS, PAUSA, PLAY, Protector, Svg, distancia, tiempo } from "./comunes";
import { HojaEdificio } from "./Edificio";
import { HojaClima, HojaCuadra, HojaEncuentro, HojaFiltros, HojaLugares, HojaPracticar, HojaRecorridos, type Amigo, type Tema, type Visita } from "./Hojas";
import { MenuCalle, type HojaMenu } from "./MenuCalle";
import { MiniMapa } from "./MiniMapa";
import { Recepcion } from "./Recepcion";
import { TarjetaLocal } from "./TarjetaLocal";

const ElegirLugar = dynamic(() => import("@/components/ElegirLugar").then((m) => m.ElegirLugar), { ssr: false });

const CARD = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
const leer = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const guardar = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };
const SESION = "sm-calle-pos", FAVS = "sm-calle-lugares", VIS = "sm-calle-visitados";

export interface PropsCalle {
  lat: number;
  lon: number;
  hora?: number | null;
  /** Si la dirección trae lat y lon. Sin eso retoma donde estabas. */
  puntoPedido?: boolean;
  proveedorTiles?: ProveedorTiles;
  proveedorLugar?: ProveedorLugar;
  crearWorker?: () => Worker;
  crearWorkerCiudad?: () => Worker;
  calidadFija?: number;
  alMotor?: (m: Motor) => void;
  /** Rumbo inicial en grados, para abrir una vista compartida. */
  rumboInicial?: number | null;
  /** Lugares guardados y visitados: viven en el perfil, que solo lee su dueño. */
  lugares?: Destino[];
  guardarLugares?: (l: Destino[]) => void;
  visitados?: Visita[];
  guardarVisitados?: (l: Visita[]) => void;
  /** Mandarle el lugar a alguien del grupo. */
  mandar?: (d: { texto: string; adjunto: { nombre: string; lat: number; lon: number; rumbo?: number } }) => void;
  casa?: Destino | null;
  facu?: Destino | null;
  /** Quienes eligieron compartir su casa exacta. */
  amigos?: Amigo[];
  /** Temas de la guía con paradas reales. */
  cargarTemas?: () => Promise<Tema[]>;
}

function Maqueta({ progreso, titulo, detalle, children }: { progreso: number; titulo: string; detalle?: string; children?: React.ReactNode }) {
  const alturas = [38, 66, 52, 88, 46, 74, 34];
  return (
    <div className="calle-carga">
      <div className="calle-maqueta" aria-hidden="true">
        {alturas.map((h, i) => {
          const f = Math.max(0, Math.min(1, progreso * 1.5 - i * 0.07));
          return <i key={i} style={{ height: `${h}%`, transform: `scaleY(${Math.max(0.05, f)})` }} />;
        })}
      </div>
      <h1>{titulo}</h1>
      {detalle && <p>{detalle}</p>}
      {children}
      <p className="calle-credito-carga"><Credito /></p>
    </div>
  );
}

function Calle({ lat, lon, hora, puntoPedido, proveedorTiles, proveedorLugar, crearWorker, crearWorkerCiudad, calidadFija, alMotor, rumboInicial, lugares, guardarLugares, visitados, guardarVisitados, mandar, casa, facu, amigos, cargarTemas }: PropsCalle) {
  const router = useRouter();
  const lienzo = useRef<HTMLDivElement>(null);
  const motor = useRef<Motor | null>(null);
  const dial = useRef<HTMLSpanElement>(null), rumbo = useRef<HTMLElement>(null);
  const joyBase = useRef<HTMLDivElement>(null), joyPunta = useRef<HTMLElement>(null);
  const [montado, setMontado] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sinWebGL, setSinWebGL] = useState(false);
  const [calle, setCalle] = useState<string | null>(null);
  const [local, setLocal] = useState<Local | null>(null);
  const [cerca, setCerca] = useState<Local | null>(null);
  const [interior, setInterior] = useState<Local | null>(null);
  const [fundido, setFundido] = useState(false);
  const [nube, setNube] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [modo, setModo] = useState<ModoMarcha>("caminar");
  const [modosAbiertos, setModosAbiertos] = useState(false);
  const [ayuda, setAyuda] = useState(false);
  const [intento, setIntento] = useState(0);
  const [buscando, setBuscando] = useState(false);
  const [destino, setDestino] = useState<Destino | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [viaje, setViaje] = useState<EstadoViaje | null>(null);
  const [llegada, setLlegada] = useState<{ nombre: string; recorrido: { metros: number; pasos: number; kcal: number } } | null>(null);
  const [menu, setMenu] = useState(false);
  const [enMapa, setEnMapa] = useState(false);
  const [salirHoja, setSalirHoja] = useState(false);
  const [recepcion, setRecepcion] = useState(false);
  const [datosLugar, setDatosLugar] = useState<DatosLugar | null>(null);
  const [cargandoLugar, setCargandoLugar] = useState(false);
  const [edificio, setEdificio] = useState<{ d: DatosEdificio | null; local: Local | null; ascensor: boolean } | null>(null);
  const [piso, setPiso] = useState(0);
  const [terraza, setTerraza] = useState<{ altura: number; estimada: boolean } | null>(null);
  const [horaSim, setHoraSim] = useState<number | null>(hora ?? null);
  const [foto, setFoto] = useState<{ url: string; blob: Blob } | null>(null);
  const [paseo, setPaseo] = useState<{ paradas: (Parada & { bajada?: string })[]; i: number } | null>(null);
  const [cuenta, setCuenta] = useState(0);
  const [favs, setFavs] = useState<Destino[]>(() => lugares ?? []);
  const [vistos, setVistos] = useState<Visita[]>(() => visitados ?? []);
  const [hoja, setHoja] = useState<HojaMenu | "cuadra" | null>(null);
  const [filtro, setFiltro] = useState<{ id: IdFiltro; lista: Cercano[] } | null>(null);
  const [cuadra, setCuadra] = useState<Cuadra | null>(null);
  const [modoFoto, setModoFoto] = useState(false);
  const [temas, setTemas] = useState<Tema[] | null>(null);
  const [cliente, setCliente] = useState<ClienteCiudad | null>(null);
  const hayHoja = useRef(false), saliendo = useRef(false), habiaAntes = useRef(false), inicio = useRef({ lat, lon }), edifActual = useRef<DatosEdificio | null>(null);
  const llegadaAcc = useRef<((nombre: string) => void) | null>(null);
  const filtroRef = useRef(filtro);
  filtroRef.current = filtro;

  const tiles = useMemo(() => proveedorTiles ?? crearProveedorTiles(), [proveedorTiles]);
  const lugar = useMemo(() => proveedorLugar ?? crearProveedorLugar(), [proveedorLugar]);
  const motorDe = useCallback(() => motor.current, []);
  const posicion = useCallback(() => motor.current?.posicionReal() ?? null, []);

  useEffect(() => {
    setMontado(true);
    if (lugares?.length) return;
    try { const v = JSON.parse(leer(FAVS) ?? "[]"); if (Array.isArray(v)) setFavs(v); } catch { /* lista dañada */ }
    if (!guardarVisitados) try { const v = JSON.parse(leer(VIS) ?? "[]"); if (Array.isArray(v)) setVistos(v); } catch { /* lista dañada */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const c = crearCliente(crearWorkerCiudad);
    setCliente(c);
    return () => c.destruir();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Si el celular recargó la página, se retoma donde estabas */
  useEffect(() => {
    try {
      const j = JSON.parse(sessionStorage.getItem(SESION) ?? "null");
      const mismo = j && j.pedido === location.search;
      if (mismo && Date.now() - j.t < 3600000) inicio.current = { lat: j.lat, lon: j.lon };
      else if (!puntoPedido && j && Date.now() - j.t < 3600000) inicio.current = { lat: j.lat, lon: j.lon };
    } catch { /* sin almacenamiento */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!montado) return;
    let vivo = true, m: Motor | null = null;
    const reducir = matchMedia("(prefers-reduced-motion: reduce)").matches;
    (async () => {
      const { Motor, hayWebGL } = await import("@/lib/calle/motor");
      if (!vivo || !lienzo.current) return;
      if (!hayWebGL()) { setSinWebGL(true); return; }
      try {
        m = new Motor(lienzo.current, {
          lat: inicio.current.lat, lon: inicio.current.lon, hora, proveedorTiles: tiles, crearWorker, calidadFija, reducirMovimiento: reducir,
          eventos: {
            progreso: (f) => setProgreso((p) => Math.max(p, f)),
            listo: () => { if (rumboInicial != null) motor.current?.setRumbo(rumboInicial); setListo(true); },
            fallo: setError,
            aviso: setAviso,
            calle: setCalle,
            rumbo: (g) => {
              if (dial.current) dial.current.style.transform = `rotate(${-g}deg)`;
              if (rumbo.current) rumbo.current.textContent = CARD[Math.round(g / 45) % 8];
            },
            local: setLocal,
            cerca: setCerca,
            interior: (l) => {
              setInterior(l);
              setPiso(0);
              if (l) { anotarVisita({ nombre: l.nombre, lat: l.lat, lon: l.lon, direccion: l.direccion ?? undefined }); setRecepcion(false); setDestino(null); setModo((q) => { if (q === "auto" || q === "volar") { motor.current?.cambiarModo("caminar"); return "caminar"; } return q; }); }
            },
            fundido: setFundido,
            joystick: (a, x, y, dx, dy) => {
              const b = joyBase.current, p = joyPunta.current;
              if (!b || !p) return;
              b.classList.toggle("activo", a);
              b.style.transform = a ? `translate(${x}px,${y}px)` : "";
              p.style.transform = `translate(${dx}px,${dy}px)`;
            },
            viaje: (e) => setViaje(e),
            cartel: (i) => { const c = filtroRef.current?.lista[i]; if (c) elegirDestinoRef.current?.(destinoDe(c)); },
            llegada: (n) => llegadaAcc.current?.(n),
            nube: setNube,
            azotea: (h) => { setTerraza(h == null ? null : { altura: h, estimada: edifActual.current?.calidad !== 0 }); setEdificio(null); },
            piso: setPiso,
            edificio: (a, b) => {
              if (hayHoja.current) return;
              clienteRef.current?.edificio(a, b).then((d) => { if (d && !hayHoja.current) { edifActual.current = d; setEdificio({ d, local: null, ascensor: false }); } }).catch(() => {});
            },
          },
        });
        motor.current = m;
        alMotor?.(m);
      } catch {
        setSinWebGL(true);
      }
    })();
    return () => { vivo = false; m?.destruir(); motor.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [montado, intento]);
  const clienteRef = useRef<ClienteCiudad | null>(null);
  clienteRef.current = cliente;

  /* Guarda dónde estás, por si el sistema recarga la página */
  useEffect(() => {
    if (!listo) return;
    const t = setInterval(() => {
      const p = motor.current?.posicionReal();
      if (!p) return;
      inicio.current = p;
      try { sessionStorage.setItem(SESION, JSON.stringify({ lat: p.lat, lon: p.lon, t: Date.now(), pedido: location.search })); } catch { /* sin almacenamiento */ }
    }, 4000);
    return () => clearInterval(t);
  }, [listo]);

  useEffect(() => {
    if (!listo || leer("sm-calle-ayuda2")) return;
    setAyuda(true);
    const t = setTimeout(() => { setAyuda(false); guardar("sm-calle-ayuda2", "1"); }, 7000);
    return () => clearTimeout(t);
  }, [listo]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 4000);
    return () => clearTimeout(t);
  }, [aviso]);

  /* Una hoja abierta: el botón de volver la cierra en vez de salir, y los toques no abren otra */
  hayHoja.current = menu || !!hoja || modoFoto || recepcion || !!edificio || buscando || enMapa || salirHoja || !!foto || !!destino || !!llegada;

  const cerrarHojas = useCallback(() => {
    setMenu(false); setHoja(null); setModoFoto(false); setRecepcion(false); setEdificio(null); setBuscando(false); setEnMapa(false); setFoto(null); setDestino(null); setLlegada(null);
  }, []);

  /* Volver del celular: el gesto del borde o la flecha del navegador nunca sacan de golpe */
  useEffect(() => {
    habiaAntes.current = window.history.length > 1;
    window.history.pushState(window.history.state, "", window.location.href);
    const alVolver = () => {
      if (saliendo.current) return;
      window.history.pushState(window.history.state, "", window.location.href);
      if (hayHoja.current) cerrarHojas(); else setSalirHoja(true);
    };
    window.addEventListener("popstate", alVolver);
    return () => window.removeEventListener("popstate", alVolver);
  }, [cerrarHojas]);

  function salirDeVerdad() {
    saliendo.current = true;
    try { sessionStorage.removeItem(SESION); } catch { /* sin almacenamiento */ }
    if (habiaAntes.current) {
      window.history.go(-2);
      /* Si no había adónde volver, no te deja colgado */
      setTimeout(() => { if (document.visibilityState === "visible" && window.location.pathname === "/calle") router.replace("/inicio"); }, 700);
    } else router.replace("/inicio");
  }

  const cerrar = useCallback(() => motor.current?.cerrarTarjeta(), []);
  const reintentar = () => { setError(null); setProgreso(0); setListo(false); setIntento((i) => i + 1); };
  const elegirModo = (m: ModoMarcha) => { setModo(m); setModosAbiertos(false); motor.current?.cambiarModo(m); };
  const tactil = montado && matchMedia("(pointer:coarse)").matches;

  /* ───────── Ir a un lugar ───────── */
  const elegirDestino = useCallback((d: Destino) => {
    setBuscando(false);
    const p = motor.current?.posicionReal();
    const dist = p ? Math.hypot((d.lat - p.lat) * 111320, (d.lon - p.lon) * 91700) : d.dist;
    setDestino({ ...d, dist });
  }, []);
  const elegirDestinoRef = useRef(elegirDestino);
  const destinoDe = (c: Cercano): Destino => ({ nombre: c.nombre, lat: c.lat, lon: c.lon, categoria: c.categoria, categoriaCruda: c.categoriaCruda, direccion: c.direccion, dist: c.dist });

  /* Historial: una visita por lugar, la última arriba */
  function anotarVisita(d: { nombre: string; lat?: number; lon?: number; direccion?: string }) {
    if (d.lat == null || d.lon == null) return;
    const v: Visita = { nombre: d.nombre, lat: d.lat, lon: d.lon, direccion: d.direccion, t: Date.now() };
    setVistos((l) => {
      const n = [v, ...l.filter((q) => q.nombre !== v.nombre)].slice(0, 60);
      guardar(VIS, JSON.stringify(n));
      guardarVisitados?.(n);
      return n;
    });
  }
  function borrarVisitas() { setVistos([]); guardar(VIS, "[]"); guardarVisitados?.([]); }

  /* ───────── Filtros: carteles flotantes ───────── */
  async function ponerFiltro(id: IdFiltro) {
    const m = motor.current;
    setHoja(null);
    if (!m || !cliente) return;
    setAviso("Buscando cerca tuyo…");
    const lista = await cliente.filtro(id, m.posicionReal()).catch(() => [] as Cercano[]);
    const f = FILTROS.find((q) => q.id === id)!;
    if (!lista.length) { setAviso(`Sin resultados de ${f.nombre.toLowerCase()} acá cerca.`); setFiltro(null); m.ponerCarteles(null); return; }
    setAviso(null);
    setFiltro({ id, lista });
    m.ponerCarteles(lista.map((c) => ({ lat: c.lat, lon: c.lon, texto: c.nombre, sub: `${c.categoria} · ${distancia(c.dist)}` })));
  }
  function quitarFiltro() { setFiltro(null); setHoja(null); motor.current?.ponerCarteles(null); }

  /* ───────── La cuadra: qué tenés alrededor ───────── */
  useEffect(() => {
    if (!listo || !cliente) return;
    let ult: { lat: number; lon: number } | null = null;
    const mirar = () => {
      const p = motor.current?.posicionReal();
      if (!p || (ult && Math.hypot((p.lat - ult.lat) * 111320, (p.lon - ult.lon) * 91700) < 22)) return;
      ult = p;
      cliente.cuadra(p).then(setCuadra).catch(() => {});
    };
    mirar();
    const t = setInterval(mirar, 2500);
    return () => clearInterval(t);
  }, [listo, cliente]);

  function alLlegarA(d: Destino) {
    const m = motor.current;
    if (!m) return;
    const r = m.recorrido(), real = m.localEn(d.lat, d.lon, d.nombre);
    setViaje(m.estadoViaje());
    anotarVisita(d);
    /* En un paseo manda el cartel de la parada: la tarjeta lo taparía */
    if (paseoRef.current) return;
    if (real) m.abrir(real);
    else if (d.categoria) {
      /* No tiene frente en la calle: igual se puede entrar y hablar con recepción */
      const c = describirCategoria(d.categoriaCruda);
      m.abrirExterno({ id: `busca-${d.lat},${d.lon}`, nombre: d.nombre, rubro: { ...RUBROS.otro, nombre: d.categoria }, x: 0, z: 0, nx: 0, nz: 1, ancho: 6, pisos: 1, altura: 3, direccion: d.direccion ?? null, px: 0, pz: 0, lat: d.lat, lon: d.lon, categoria: d.categoriaCruda ?? c.nombre });
    }
    setLlegada({ nombre: d.nombre, recorrido: r });
    setTimeout(() => setLlegada(null), 5000);
  }
  const paseoRef = useRef(paseo);
  paseoRef.current = paseo;

  async function irCaminando(d: Destino) {
    const m = motor.current, c = cliente;
    if (!m || !c) return;
    const p = m.posicionReal();
    setCalculando(true);
    try {
      const r = await c.ruta(p, d, modo === "auto" ? "auto" : "pie");
      if (!r) { setAviso("No encontré un camino hasta ahí. Probá con Ir ya."); return; }
      setDestino(null);
      setLocal(null);
      setLlegada(null);
      m.cerrarTarjeta();
      llegadaAcc.current = () => alLlegarA(d);
      destinoActual.current = d;
      m.iniciarRuta(r, d.nombre);
      if (modo === "volar") setModo("caminar");
      return r;
    } catch { setAviso("No pude armar la ruta. Revisá tu conexión."); } finally { setCalculando(false); }
  }
  const destinoActual = useRef<Destino | null>(null);

  /* Practicar: te lleva al inicio y lo hacés caminando */
  async function practicar(desde: Destino | null, hasta: Destino) {
    const m = motor.current, c = cliente;
    if (!m || !c) return;
    setHoja(null);
    if (!desde) { void irCaminando(hasta); return; }
    setAviso("Armando el recorrido…");
    const r = await c.ruta(desde, hasta, "pie").catch(() => null);
    if (!r) { setAviso("No encontré un camino hasta ahí."); return; }
    setAviso(`Son ${distancia(r.largo)}: unos ${tiempo(r.largo / 1.35)} a pie.`);
    llegadaAcc.current = () => alLlegarA(hasta);
    destinoActual.current = hasta;
    m.volarA(desde.lat, desde.lon, () => m.iniciarRuta(r, hasta.nombre));
  }

  /* Punto de encuentro: el medio entre vos y quienes elegiste, y algo real ahí */
  async function puntoMedio(ids: string[]) {
    const m = motor.current;
    if (!m || !cliente) return null;
    const yo = casa ?? m.posicionReal(), g = (amigos ?? []).filter((a) => ids.includes(a.id)), n = g.length + 1;
    const c = { lat: (yo.lat + g.reduce((a, q) => a + q.lat, 0)) / n, lon: (yo.lon + g.reduce((a, q) => a + q.lon, 0)) / n };
    const l = await cliente.filtro("estudiar", c, 900).catch(() => [] as Cercano[]);
    const q = l[0];
    return q ? { nombre: q.nombre, lat: q.lat, lon: q.lon, detalle: [q.categoria, q.direccion].filter(Boolean).join(" · ") } : null;
  }

  function irYa(d: Destino) {
    const m = motor.current;
    if (!m) return;
    setDestino(null);
    setLlegada(null);
    m.cerrarTarjeta();
    if (modo === "volar" || modo === "auto") setModo("caminar");
    m.volarA(d.lat, d.lon, () => alLlegarA(d));
  }

  const retomar = () => { const d = destinoActual.current; motor.current?.cancelarRuta(); if (d) void irCaminando(d); };

  /* ───────── Paseo guiado ───────── */
  async function empezarPaseo() {
    const m = motor.current;
    if (!m || !cliente) return;
    setAviso("Buscando paradas cerca…");
    const paradas = await cliente.paseo(m.posicionReal()).catch(() => [] as Parada[]);
    if (paradas.length < 2) { setAviso("No encontré paradas para un paseo por acá."); return; }
    setAviso(null);
    setHoja(null);
    setPaseo({ paradas, i: 0 });
    void irCaminando(destinoDeParada(paradas[0]));
  }
  function empezarTema(t: Tema) {
    const p = motor.current?.posicionReal();
    if (!p) return;
    /* Ordena por cercanía: no va y vuelve */
    const resto = [...t.paradas], paradas: (Parada & { bajada?: string })[] = [];
    let u: { lat: number; lon: number } = p;
    const dist = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => Math.hypot((a.lat - b.lat) * 111320, (a.lon - b.lon) * 91700);
    while (resto.length) {
      resto.sort((a, b) => dist(u, a) - dist(u, b));
      const q = resto.shift()!;
      paradas.push({ nombre: q.nombre, categoria: "", lat: q.lat, lon: q.lon, direccion: q.direccion ?? "", bajada: q.bajada });
      u = q;
    }
    setHoja(null);
    setPaseo({ paradas, i: 0 });
    void irCaminando(destinoDeParada(paradas[0]));
  }
  function abrirRecorridos() {
    setHoja("recorridos");
    if (temas === null) { if (cargarTemas) cargarTemas().then(setTemas).catch(() => setTemas([])); else setTemas([]); }
  }
  /* Al llegar a una parada queda unos segundos y sigue sola */
  const enParada = !!paseo && !viaje?.activo && !viaje?.volando && !calculando;
  useEffect(() => {
    if (!enParada) { setCuenta(0); return; }
    setCuenta(9);
    const t = setInterval(() => setCuenta((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [enParada, paseo?.i]);
  useEffect(() => { if (enParada && cuenta === 1) { const t = setTimeout(siguienteParada, 900); return () => clearTimeout(t); } });
  const destinoDeParada = (p: Parada): Destino => ({ nombre: p.nombre, lat: p.lat, lon: p.lon, direccion: p.direccion, categoria: describirCategoria(p.categoria).nombre, categoriaCruda: p.categoria });
  function siguienteParada() {
    if (!paseo) return;
    const i = paseo.i + 1;
    if (i >= paseo.paradas.length) { setPaseo(null); setAviso("Terminó el paseo. ¡Buena caminata!"); return; }
    setPaseo({ ...paseo, i });
    void irCaminando(destinoDeParada(paseo.paradas[i]));
  }

  /* ───────── Recepción y edificio ───────── */
  const lugarAbierto = interior;
  useEffect(() => {
    if (!recepcion || !lugarAbierto) return;
    const l = lugarAbierto, base: DatosLugar = { nombre: l.nombre, lat: l.lat, lon: l.lon, direccion: l.direccion, categoria: l.categoria, telefono: l.telefono, web: l.web, red: l.red, whatsapp: l.whatsapp, horario: l.horario };
    setDatosLugar(base);
    if (l.lat == null || l.lon == null || !cliente) return;
    let vivo = true;
    setCargandoLugar(true);
    const pos = { lat: l.lat, lon: l.lon };
    const pre = l.telefono || l.web || l.red || l.horario ? Promise.resolve(null) : cliente.lugar(pos, l.nombre).catch(() => null);
    pre.then(async (d) => {
      if (!vivo) return;
      if (d) { setDatosLugar({ ...base, ...d, nombre: l.nombre, direccion: base.direccion ?? d.direccion }); return; }
      if (l.telefono || l.web || l.red || l.horario) return;
      const e = await lugar({ nombre: l.nombre, lat: pos.lat, lon: pos.lon }).catch(() => null);
      if (vivo && e) setDatosLugar({ ...base, telefono: e.telefono, web: e.web, horario: e.horario });
    }).finally(() => { if (vivo) setCargandoLugar(false); });
    return () => { vivo = false; };
  }, [recepcion, lugarAbierto, cliente, lugar]);

  async function abrirEdificio(l: Local | null, ascensor: boolean) {
    if (!l) return;
    setEdificio({ d: null, local: l, ascensor });
    if (l.lat == null || l.lon == null || !cliente) return;
    const d = await cliente.edificio({ lat: l.lat, lon: l.lon }).catch(() => null);
    edifActual.current = d;
    setEdificio((e) => (e && e.local === l ? { ...e, d } : e));
  }

  function subirTerraza() {
    const m = motor.current, e = edificio;
    if (!m || !e) return;
    const altura = e.d?.altura ?? e.local?.altura;
    if (!altura) return;
    edifActual.current = e.d;
    m.subirTerraza({ lat: e.d?.lat, lon: e.d?.lon, altura, anillo: e.d?.anillo }, e.local);
  }

  /* ───────── Guardar y compartir ───────── */
  const claveFav = (d: { lat?: number; lon?: number }) => `${d.lat?.toFixed(5)},${d.lon?.toFixed(5)}`;
  const guardado = !!datosLugar && favs.some((f) => claveFav(f) === claveFav(datosLugar));
  function alternarFav() {
    const d = datosLugar;
    if (!d || d.lat == null || d.lon == null) return;
    const n: Destino[] = guardado ? favs.filter((f) => claveFav(f) !== claveFav(d)) : [{ nombre: d.nombre, lat: d.lat, lon: d.lon, direccion: d.direccion ?? undefined, categoriaCruda: d.categoria ?? undefined, categoria: describirCategoria(d.categoria).nombre }, ...favs].slice(0, 30);
    setFavs(n);
    guardar(FAVS, JSON.stringify(n));
    guardarLugares?.(n);
  }

  async function compartirLugar() {
    const d = datosLugar;
    if (!d) return;
    const texto = `Mirá este lugar: ${d.nombre}${d.direccion ? `, ${d.direccion}` : ""}`;
    if (mandar && d.lat != null && d.lon != null) { mandar({ texto, adjunto: { nombre: d.nombre, lat: d.lat, lon: d.lon } }); return; }
    const url = d.lat != null ? `${location.origin}/calle?lat=${d.lat.toFixed(6)}&lon=${d.lon!.toFixed(6)}` : location.href;
    try {
      if (navigator.share) await navigator.share({ title: d.nombre, text: texto, url });
      else { await navigator.clipboard.writeText(`${texto} ${url}`); setAviso("Copié el enlace."); }
    } catch { /* canceló */ }
  }

  async function sacarFoto() {
    const m = motor.current;
    if (!m) return;
    const b = await m.foto();
    if (!b) { setAviso("No pude sacar la foto."); return; }
    /* Lleva el lugar y el crédito de los datos */
    try {
      const im = await createImageBitmap(b), c = document.createElement("canvas");
      c.width = im.width; c.height = im.height;
      const g = c.getContext("2d")!, u = Math.max(14, Math.round(im.width / 42));
      g.drawImage(im, 0, 0);
      const alto = u * 3.2, grad = g.createLinearGradient(0, c.height - alto * 1.6, 0, c.height);
      grad.addColorStop(0, "rgba(0,0,0,0)"); grad.addColorStop(1, "rgba(0,0,0,.62)");
      g.fillStyle = grad; g.fillRect(0, c.height - alto * 1.6, c.width, alto * 1.6);
      g.fillStyle = "#fff"; g.textBaseline = "bottom";
      g.font = `800 ${Math.round(u * 1.25)}px system-ui,sans-serif`;
      g.fillText(interior?.nombre ?? calle ?? "Buenos Aires", u, c.height - u * 1.5);
      g.font = `600 ${Math.round(u * 0.62)}px system-ui,sans-serif`;
      g.fillText(interior ? "FAMA · Recreación ilustrativa" : "FAMA · Datos: © OpenStreetMap, Overture Maps, 3D-GloBFP, GHSL", u, c.height - u * 0.6);
      const final = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", 0.92));
      if (final) { setFoto({ url: URL.createObjectURL(final), blob: final }); return; }
    } catch { /* sin createImageBitmap: va la foto sola */ }
    setFoto({ url: URL.createObjectURL(b), blob: b });
  }

  async function compartirFoto() {
    if (!foto) return;
    const f = new File([foto.blob], "calle.jpg", { type: foto.blob.type });
    try {
      if (navigator.canShare?.({ files: [f] })) await navigator.share({ files: [f], title: "Mirá dónde estoy" });
      else setAviso("Mantené apretada la foto para guardarla.");
    } catch { /* canceló */ }
  }

  function cambiarHora(h: number | null) { setHoraSim(h); motor.current?.setHora(h); }

  /* Compartir este punto: quien lo abre cae acá mismo, mirando para el mismo lado */
  async function compartirPunto() {
    const m = motor.current;
    if (!m) return;
    const e = m.estadoMapa(), nombre = (cuadra?.calle ?? calle) ? `${cuadra?.calle ?? calle}${cuadra?.altura ? ` ${cuadra.altura}` : ""}` : "Este punto", rumboG = Math.round(e.rumbo);
    const texto = `Mirá este punto: ${nombre}`;
    if (mandar) { mandar({ texto, adjunto: { nombre, lat: e.lat, lon: e.lon, rumbo: rumboG } }); return; }
    const url = `${location.origin}/calle?lat=${e.lat.toFixed(6)}&lon=${e.lon.toFixed(6)}&rumbo=${rumboG}`;
    try {
      if (navigator.share) await navigator.share({ title: nombre, text: texto, url });
      else { await navigator.clipboard.writeText(`${texto} ${url}`); setAviso("Copié el enlace."); }
    } catch { /* canceló */ }
  }

  function abrirMapa() { motor.current?.pausar(true); setEnMapa(true); }
  function cerrarMapa() { motor.current?.pausar(false); setEnMapa(false); }

  const parar = (e: React.SyntheticEvent) => e.stopPropagation();
  if (!montado) return null;

  const enViaje = !!viaje?.activo, volando = !!viaje?.volando, modoAct = MODOS.find((q) => q.id === modo) ?? MODOS[0];
  const pos = motor.current?.posicionReal() ?? null;
  const nombreCalle = cuadra?.calle ?? calle, etiquetaFiltro = filtro ? FILTROS.find((f) => f.id === filtro.id)?.nombre : null;
  const seVa = modo === "bici" ? "en bici" : modo === "auto" ? "en auto" : modo === "correr" ? "corriendo" : "a pie";

  return createPortal(
    <div className="calle" onTouchStart={parar} onTouchMove={parar} onTouchEnd={parar} onTouchCancel={parar}>
      <div ref={lienzo} className="calle-lienzo" />

      {modoFoto && (
        <div className="calle-modofoto">
          <button className="calle-redondo" onClick={() => setModoFoto(false)} aria-label="Salir del modo foto"><Icono n="x" /></button>
          <button className="calle-disparo" onClick={() => { void sacarFoto(); }} aria-label="Sacar la foto"><Svg d={CAMARA} t={30} /></button>
        </div>
      )}
      {listo && !interior && !terraza && !modoFoto && (
        <>
          <div ref={joyBase} className="calle-joy" aria-hidden="true"><i ref={joyPunta} /></div>
          <div className="calle-arriba">
            {enViaje ? (
              <section className="calle-viaje" aria-label={`Yendo a ${viaje?.nombre ?? "tu destino"}`}>
                <div className="calle-viaje-txt">
                  <strong aria-live="polite">{viaje?.pausada ? "En pausa" : viaje?.maniobra ? (viaje.enM < 12 ? viaje.maniobra : `En ${distancia(viaje.enM)}: ${viaje.maniobra[0].toLowerCase()}${viaje.maniobra.slice(1)}`) : `Seguí hasta ${viaje?.nombre}`}</strong>
                  <small>{distancia(viaje?.restante ?? 0)} · unos {tiempo(viaje?.segundos ?? 0)} {seVa}{paseo ? ` · Parada ${paseo.i + 1} de ${paseo.paradas.length}` : ""}</small>
                </div>
                <button className="calle-redondo" onClick={() => (viaje?.pausada ? retomar() : motor.current?.pausarRuta(true))} aria-label={viaje?.pausada ? "Seguir" : "Pausar"}><Svg d={viaje?.pausada ? PLAY : PAUSA} /></button>
                <button className="calle-redondo" onClick={() => { motor.current?.cancelarRuta(); setPaseo(null); }} aria-label="Cancelar el viaje"><Icono n="x" /></button>
              </section>
            ) : (
              <Buscador cliente={cliente} posicion={posicion} abierto={buscando} abrir={() => setBuscando(true)} cerrar={() => setBuscando(false)} elegir={elegirDestino} enMapa={abrirMapa} guardados={favs} />
            )}
            {!buscando && <button className="calle-redondo calle-menu-btn" onClick={() => setMenu(true)} aria-label="Más opciones" aria-expanded={menu}><Icono n="menu" /></button>}
          </div>
          {!buscando && (
            <div className={`calle-segunda ${enViaje ? "viaje" : ""}`}>
              <button className="calle-brujula" onClick={() => setHoja("cuadra")} aria-label={`Estás en ${nombreCalle ?? "una calle sin nombre"}${cuadra?.altura ? ` ${cuadra.altura}` : ""}. Ver qué hay en la cuadra`}>
                <span ref={dial} className="calle-dial" aria-hidden="true"><b>N</b></span>
                <strong>{nombreCalle ?? "Calle sin nombre"}{cuadra?.altura ? ` ${cuadra.altura}` : ""}</strong>
                <small ref={rumbo}>N</small>
              </button>
              <MiniMapa motor={motorDe} cliente={cliente} abrir={abrirMapa} />
            </div>
          )}
          {filtro && !buscando && <button className="calle-filtro" onClick={quitarFiltro} aria-label={`Sacar los carteles de ${etiquetaFiltro}`}><span>{etiquetaFiltro}: {filtro.lista.length}</span><Icono n="x" t={18} /></button>}

          <div className={`calle-marcha ${modosAbiertos ? "abierta" : ""}`}>
            {modo === "volar" && !modosAbiertos && (
              <div className="calle-altura" role="group" aria-label={`Altura del dron: ${Math.round(viaje?.altura ?? 70)} metros`}>
                <button onClick={() => motor.current?.setAlturaDron((viaje?.altura ?? 70) + 20)} aria-label="Subir"><Icono n="subir" t={22} /></button>
                <span>{Math.round(viaje?.altura ?? 70)} m</span>
                <button onClick={() => motor.current?.setAlturaDron((viaje?.altura ?? 70) - 20)} aria-label="Bajar"><Icono n="bajar" t={22} /></button>
              </div>
            )}
            {modosAbiertos ? (
              <div className="calle-modos" role="radiogroup" aria-label="Forma de moverte">
                {MODOS.map((q) => (
                  <button key={q.id} role="radio" aria-checked={modo === q.id} className={modo === q.id ? "on" : ""} onClick={() => elegirModo(q.id)}><Svg d={q.d} /><span>{q.nombre}</span></button>
                ))}
              </div>
            ) : (
              <button className="calle-modo-act" onClick={() => setModosAbiertos(true)} aria-label={`Forma de moverte: ${modoAct.nombre}. Cambiar`} aria-haspopup="true"><Svg d={modoAct.d} t={26} /><span>{modoAct.nombre}</span></button>
            )}
          </div>

          {ayuda && !buscando && <p className="calle-ayuda" role="status">{tactil ? "Mové con el dedo izquierdo, arrastrá para mirar y tocá un local o un edificio." : "Caminá con WASD o las flechas, arrastrá para mirar y tocá un local o un edificio."}</p>}
          {cerca && !local && !enViaje && !destino && modo !== "volar" && !volando && !buscando && (
            <button className="calle-cerca" onClick={() => motor.current?.abrir(cerca)}>
              <i style={{ background: cerca.rubro.color }} /><span><b>{cerca.nombre}</b><small>{cerca.rubro.nombre}</small></span><Icono n="flecha" t={20} />
            </button>
          )}
          {local && !destino && <TarjetaLocal key={local.id} local={local} proveedor={lugar} cerrar={cerrar} entrar={() => motor.current?.entrar(local)} edificio={() => abrirEdificio(local, false)} />}
          {destino && <TarjetaDestino d={destino} cerrar={() => setDestino(null)} caminando={() => irCaminando(destino)} ya={() => irYa(destino)} ocupado={calculando} />}
          {llegada && !local && (
            <div className="calle-llegada" role="status">
              <strong>Llegaste a {llegada.nombre}</strong>
              {llegada.recorrido.pasos > 0 && <small>{distancia(llegada.recorrido.metros)} · {llegada.recorrido.pasos.toLocaleString("es-AR")} pasos · {llegada.recorrido.kcal} kcal estimadas</small>}
            </div>
          )}
          {paseo && !enViaje && !volando && (
            <div className="calle-paseo" role="status">
              <strong>Parada {paseo.i + 1} de {paseo.paradas.length}: {paseo.paradas[paseo.i].nombre}</strong>
              {paseo.paradas[paseo.i].bajada && <small>{paseo.paradas[paseo.i].bajada}</small>}
              <div className="calle-acciones">
                <button className="calle-btn" onClick={() => setPaseo(null)}>Terminar</button>
                <button className="calle-btn pri" onClick={siguienteParada}>{paseo.i + 1 < paseo.paradas.length ? `Sigue en ${cuenta}` : `Termina en ${cuenta}`}</button>
              </div>
            </div>
          )}
        </>
      )}

      {interior && (
        <div className="calle-interior">
          <div className="calle-interior-tit"><strong>{interior.nombre}</strong><small>{piso ? `Piso ${piso} · Pasillo ilustrativo, no es el edificio real` : "Recreación ilustrativa, no es el local real"}</small></div>
          <div ref={joyBase} className="calle-joy" aria-hidden="true"><i ref={joyPunta} /></div>
          <div className="calle-int-acc">
            {piso === 0 && <button className="calle-btn pri calle-recepcion" onClick={() => setRecepcion(true)}><Icono n="chat" t={22} />Hablar con recepción</button>}
            {(interior.pisos > 1 || piso > 0) && <button className="calle-btn" onClick={() => abrirEdificio(interior, true)}><Svg d={ASCENSOR} t={22} />{piso ? "Ascensor" : "Pisos y terraza"}</button>}
            {piso === 0 && <button className="calle-btn" onClick={() => motor.current?.salir()}><Icono n="salir" t={22} />Salir</button>}
          </div>
        </div>
      )}

      {terraza && (
        <div className="calle-interior">
          <div className="calle-interior-tit"><strong>Terraza · {Math.round(terraza.altura)} m</strong><small>{terraza.estimada ? "Altura estimada. La ciudad de alrededor es la real" : "La ciudad de alrededor es la real"}</small></div>
          <div ref={joyBase} className="calle-joy" aria-hidden="true"><i ref={joyPunta} /></div>
          <div className="calle-int-acc"><button className="calle-btn pri" onClick={() => motor.current?.bajarTerraza()}><Icono n="bajar" t={22} />Bajar</button></div>
        </div>
      )}

      {listo && !interior && <p className="calle-credito"><Credito /></p>}
      {aviso && <p className="calle-aviso" role="status">{aviso}</p>}
      <div className={`calle-nube ${nube ? "on" : ""}`} aria-hidden="true" />
      <div className={`calle-fundido ${fundido ? "on" : ""}`} aria-hidden="true" />

      {menu && <MenuCalle cerrar={() => setMenu(false)} abrir={(h) => (h === "recorridos" ? abrirRecorridos() : setHoja(h))} enMapa={abrirMapa} modoFoto={() => setModoFoto(true)} compartir={compartirPunto} salir={() => setSalirHoja(true)} posicion={pos} recorrido={motor.current?.recorrido() ?? { metros: 0, pasos: 0, kcal: 0 }} tactil={tactil} />}
      {hoja === "filtros" && <HojaFiltros activo={filtro?.id ?? null} elegir={ponerFiltro} quitar={quitarFiltro} cerrar={() => setHoja(null)} />}
      {hoja === "cuadra" && <HojaCuadra c={cuadra} calleMotor={calle} tocar={(l) => { setHoja(null); elegirDestino(destinoDe(l)); }} cerrar={() => setHoja(null)} />}
      {hoja === "recorridos" && <HojaRecorridos temas={temas} cerca={empezarPaseo} elegir={empezarTema} cerrar={() => setHoja(null)} />}
      {hoja === "practicar" && <HojaPracticar casa={casa ?? null} facu={facu ?? null} guardados={favs} practicar={practicar} cerrar={() => setHoja(null)} />}
      {hoja === "encuentro" && <HojaEncuentro amigos={amigos ?? []} buscar={puntoMedio} cerrar={() => setHoja(null)} />}
      {hoja === "clima" && <HojaClima hora={horaSim} setHora={cambiarHora} cerrar={() => setHoja(null)} />}
      {hoja === "lugares" && <HojaLugares favoritos={favs} visitados={vistos} ir={(d) => { setHoja(null); elegirDestino(d); }} borrar={borrarVisitas} cerrar={() => setHoja(null)} />}
      {recepcion && datosLugar && <Recepcion datos={datosLugar} cargando={cargandoLugar} guardado={guardado} alternarGuardado={alternarFav} compartir={compartirLugar} cerrar={() => setRecepcion(false)} />}
      {edificio && <HojaEdificio d={edificio.d} titulo={edificio.ascensor ? "Pisos y terraza" : undefined} pisosLocal={edificio.local?.pisos} alturaLocal={edificio.local?.altura} piso={piso} irAPiso={edificio.ascensor ? (n) => { setEdificio(null); motor.current?.irAPiso(n); } : undefined} terraza={(edificio.d?.altura ?? edificio.local?.altura) ? subirTerraza : null} cerrar={() => setEdificio(null)} />}
      {foto && (
        <HojaCalle titulo="Tu foto" cerrar={() => { URL.revokeObjectURL(foto.url); setFoto(null); }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="calle-foto" src={foto.url} alt="Foto de lo que estabas viendo en la calle" />
          <div className="calle-acciones calle-pie-hoja">
            <a className="calle-btn" href={foto.url} download="calle.jpg">Guardar</a>
            <button className="calle-btn pri" onClick={compartirFoto}><Icono n="compartir" t={20} />Compartir</button>
          </div>
        </HojaCalle>
      )}
      {salirHoja && (
        <HojaCalle titulo="¿Salir de la calle?" cerrar={() => setSalirHoja(false)} chica>
          <p className="calle-sub">Vas a volver a la pantalla de antes.</p>
          <div className="calle-acciones calle-pie-hoja">
            <button className="calle-btn pri" onClick={() => setSalirHoja(false)}>Seguir acá</button>
            <button className="calle-btn" onClick={salirDeVerdad}>Salir</button>
          </div>
        </HojaCalle>
      )}
      {enMapa && <ElegirLugar titulo="Elegí adónde ir" boton="Ir a este punto" inicial={pos ?? undefined} cerrar={cerrarMapa} listo={(l: Lugar) => { cerrarMapa(); elegirDestino({ nombre: l.nombre, lat: l.lat, lon: l.lon, direccion: l.barrio }); }} />}

      {sinWebGL && (
        <Maqueta progreso={1} titulo="Este equipo no puede mostrar el 3D" detalle="Le falta WebGL. Podés seguir usando el resto de la app.">
          <button className="calle-btn pri" onClick={salirDeVerdad}>Volver</button>
        </Maqueta>
      )}
      {!sinWebGL && error && (
        <Maqueta progreso={0.4} titulo="No pudimos armar la calle" detalle={`${error} Seguís acá: no perdiste nada.`}>
          <div className="calle-acciones"><button className="calle-btn pri" onClick={reintentar}>Probar de nuevo</button><button className="calle-btn" onClick={() => setSalirHoja(true)}>Salir</button></div>
        </Maqueta>
      )}
      {!sinWebGL && !error && !listo && (
        <Maqueta progreso={progreso} titulo="Armando la cuadra" detalle={progreso < 0.25 ? "Bajando el mapa…" : progreso < 0.8 ? "Levantando los edificios…" : "Plantando los árboles…"}>
          <div className="calle-barra" role="progressbar" aria-label="Cargando" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progreso * 100)}><i style={{ transform: `scaleX(${progreso})` }} /></div>
        </Maqueta>
      )}
    </div>,
    document.body,
  );
}

export default function CalleVista(p: PropsCalle) {
  return <Protector><Calle {...p} /></Protector>;
}
