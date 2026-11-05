"use client";
/* "Iniciar recorrido": caminar en la calle de verdad con el 3D siguiéndote. La ubicación queda en el celular. */
import { useCallback, useEffect, useRef, useState } from "react";
import { avisarGiro, FiltroGPS, pedirBrujula, Sensores, senalDe, type Lectura, type Senal } from "@/lib/calle/caminata";
import { distanciaM, type Punto } from "@/lib/calle/ciudad";
import type { ClienteCiudad } from "@/lib/calle/cliente";
import type { Motor } from "@/lib/calle/motor";
import type { Destino } from "./Buscador";

export interface EstadoCaminata {
  buscando: boolean;
  precision: number;
  senal: Senal;
  brujula: boolean;
  corrigiendo: boolean;
  metros: number;
  segundos: number;
  destino: Destino | null;
  recalculando: boolean;
}

const LEJOS = 2500;

export function useCaminata({ motor, cliente, avisar, alLlegar }: {
  motor: () => Motor | null; cliente: ClienteCiudad | null; avisar: (t: string | null) => void; alLlegar: (d: Destino, r: { metros: number; segundos: number }) => void;
}) {
  const [estado, setEstado] = useState<EstadoCaminata | null>(null);
  const [voz, setVoz] = useState(false);
  const [lejos, setLejos] = useState<{ destino: Destino; desde: Punto; metros: number } | null>(null);
  const [recordatorio, setRecordatorio] = useState<string | null>(null);
  const r = useRef({ sensores: null as Sensores | null, filtro: new FiltroGPS(), destino: null as Destino | null, inicio: 0, ultPos: null as Punto | null, metros: 0, fuera: 0, tRuta: 0, avisado: "", cruces: [] as Punto[], tCruces: null as Punto | null, tCruce: 0, ruteado: false, voz: false });
  r.current.voz = voz;

  const terminar = useCallback(() => {
    const q = r.current;
    q.sensores?.terminar();
    q.sensores = null;
    q.destino = null;
    const m = motor();
    m?.cancelarRuta();
    m?.terminarReal();
    setEstado(null);
    setLejos(null);
    setRecordatorio(null);
  }, [motor]);

  useEffect(() => () => { r.current.sensores?.terminar(); }, []);

  const trazar = useCallback(async (desde: Punto, d: Destino) => {
    const m = motor();
    if (!m || !cliente) return false;
    const q = r.current;
    q.tRuta = Date.now();
    q.avisado = "";
    const h = await cliente.ruta(desde, d, "pie").catch(() => null);
    if (!h || !r.current.sensores) { if (!h) avisar("No encontré un camino a pie. Seguís viendo tu punto en el 3D."); return false; }
    m.rutaReal(h, d.nombre);
    return true;
  }, [motor, cliente, avisar]);

  const primerPunto = useCallback(async (p: Punto) => {
    const m = motor(), q = r.current;
    if (!m) return;
    const yo = m.posicionReal(), d = q.destino, lejosDe3D = distanciaM(yo, p) > 120;
    /* Si el 3D estaba en otro lado, se va adonde estás parado */
    if (lejosDe3D) await new Promise<void>((ok) => { m.terminarReal(); m.volarA(p.lat, p.lon, () => ok()); });
    if (lejosDe3D) { m.iniciarReal(); m.lecturaReal(p.lat, p.lon, q.filtro.precision); }
    if (!d) return;
    const dist = distanciaM(p, d);
    if (dist > LEJOS) { setLejos({ destino: d, desde: p, metros: dist }); return; }
    await trazar(p, d);
  }, [motor, trazar]);

  const alPosicion = useCallback((l: Lectura) => {
    const q = r.current, m = motor();
    if (!m) return;
    const aceptada = q.filtro.entrar(l), pos = q.filtro.pos!;
    if (aceptada) m.lecturaReal(pos.lat, pos.lon, Math.max(q.filtro.precision, 5));
    if (q.ultPos) { const d = distanciaM(q.ultPos, pos); if (d > 1.5 && d < 40) q.metros += d; }
    q.ultPos = pos;
    if (!q.ruteado) { q.ruteado = true; void primerPunto(pos); }
    setEstado((e) => e && { ...e, buscando: false, precision: l.precision, senal: senalDe(l.precision), metros: q.metros, segundos: (Date.now() - q.inicio) / 1000 });
  }, [motor, primerPunto]);

  /* Giros, desvíos y cruces: una mirada por segundo alcanza */
  useEffect(() => {
    if (!estado) return;
    const t = setInterval(() => {
      const m = motor(), q = r.current;
      if (!m || !q.ultPos) return;
      const e = m.estadoViaje();
      if (e.activo && e.maniobra && e.enM < 28 && q.avisado !== e.maniobra) { q.avisado = e.maniobra; avisarGiro(e.maniobra, q.voz); }
      /* Te fuiste de la ruta: se recalcula, sin insistir */
      const umbral = Math.max(30, q.filtro.precision * 1.5);
      if (e.activo && m.desvioReal > umbral) q.fuera++; else q.fuera = 0;
      if (q.destino && q.fuera >= 6 && Date.now() - q.tRuta > 20000) {
        q.fuera = 0;
        setEstado((s) => s && { ...s, recalculando: true });
        void trazar(q.ultPos, q.destino).finally(() => setEstado((s) => s && { ...s, recalculando: false }));
      }
      /* Cruces cerca: se piden de a poco */
      if (cliente && (!q.tCruces || distanciaM(q.tCruces, q.ultPos) > 70)) {
        q.tCruces = q.ultPos;
        cliente.cruces(q.ultPos).then((c) => { q.cruces = c; }).catch(() => {});
      }
      if (q.filtro.vel > 1.9 && Date.now() - q.tCruce > 45000 && q.cruces.some((c) => distanciaM(c, q.ultPos!) < 16)) {
        q.tCruce = Date.now();
        setRecordatorio("Cruce cerca: mirá el camino");
        setTimeout(() => setRecordatorio(null), 4000);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [!!estado, motor, cliente, trazar]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Se llama directo desde el toque: iOS solo acepta el permiso ahí. */
  const iniciar = useCallback((destino: Destino | null) => {
    const m = motor();
    if (!m) return;
    const permiso = pedirBrujula();
    const q = r.current;
    q.sensores?.terminar();
    q.filtro = new FiltroGPS();
    Object.assign(q, { destino, inicio: Date.now(), ultPos: null, metros: 0, fuera: 0, avisado: "", cruces: [], tCruces: null, tCruce: 0, ruteado: false });
    setEstado({ buscando: true, precision: 999, senal: "mala", brujula: false, corrigiendo: false, metros: 0, segundos: 0, destino, recalculando: false });
    m.cancelarRuta();
    m.iniciarReal();
    setRecordatorio("Mirá el camino al cruzar, no la pantalla.");
    setTimeout(() => setRecordatorio(null), 4500);
    q.sensores = new Sensores({
      posicion: alPosicion,
      rumbo: (g, i) => { motor()?.rumboReal(g, i); setEstado((e) => (e && !e.brujula ? { ...e, brujula: true } : e)); },
      error: (t) => {
        if (t === "sinSenal") { avisar("No llega señal de ubicación. Seguimos intentando."); return; }
        terminar();
        avisar(t === "permiso" ? "Sin permiso de ubicación no puedo seguirte. Seguís en modo manual; podés activarlo en los ajustes del navegador." : "Este equipo no da ubicación. Seguís en modo manual.");
      },
    });
    q.sensores.empezar();
    void permiso;
  }, [motor, alPosicion, avisar, terminar]);

  /* Llegó: distancia y tiempo de verdad */
  const llego = useCallback(() => {
    const q = r.current, d = q.destino;
    avisarGiro(d ? `Llegaste a ${d.nombre}` : "Llegaste", q.voz);
    if (d) alLlegar(d, { metros: q.metros, segundos: (Date.now() - q.inicio) / 1000 });
    q.destino = null;
    setEstado((e) => e && { ...e, destino: null });
  }, [alLlegar]);

  const irDesdeLejos = useCallback(() => {
    const l = lejos;
    setLejos(null);
    if (l) void trazar(l.desde, l.destino);
  }, [lejos, trazar]);

  const corregir = useCallback((si: boolean) => { motor()?.corregirReal(si); setEstado((e) => e && { ...e, corrigiendo: si }); }, [motor]);

  return { estado, voz, setVoz, lejos, setLejos, recordatorio, iniciar, terminar, corregir, irDesdeLejos, llego };
}
