"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sb, traerTodo } from "@/lib/sb";
import { useSesion } from "@/lib/sesion";
import { Icono } from "@/components/Icono";
import { lanzarEfecto } from "@/components/Efectos";
import { claveDeISO, diaClave } from "@/lib/agenda";
import { ahoraBA } from "@/lib/util";
import { guardarLocal, leerLocal, Vacio } from "@/components/organizar/Comun";
import { horasTexto, minutosHechos, minutosPorSemana, nuevoFoco, pausar, racha, reloj, seguir, segundosRestan, type EstadoFoco } from "./logica";

const CLAVE = "sm-foco", TIEMPOS = [15, 25, 50], DESCANSOS = [5, 10], R = 46, L = 2 * Math.PI * R;
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function Foco({ materias }: { materias: any[] }) {
  const { perfil, toast } = useSesion();
  const [ses, setS] = useState<any[]>([]), [cargado, setCargado] = useState(false);
  const [f, setF0] = useState<EstadoFoco | null>(null), [ahora, setAhora] = useState(() => Date.now());
  const [min, setMin] = useState(25), [mid, setMid] = useState<number | null>(null), [recien, setRecien] = useState<number | null>(null);
  const guardando = useRef(false), candado = useRef<any>(null);

  const setF = useCallback((x: EstadoFoco | null) => { setF0(x); guardarLocal(CLAVE, x); }, []);
  const cargar = useCallback(async () => {
    const data = await traerTodo((d, h) => sb.from("sesiones_foco").select("id,materia_id,inicio,minutos").order("inicio", { ascending: false }).order("id").range(d, h), 2000);
    setS(data || []); setCargado(true);
  }, []);
  useEffect(() => { cargar(); const g = leerLocal<EstadoFoco>(CLAVE); if (g?.inicio) setF0(g); }, [cargar]);

  /* El reloj sale de la hora de inicio: al volver de la pantalla apagada se pone al día solo */
  useEffect(() => {
    const tic = () => setAhora(Date.now());
    const vuelve = () => { if (!document.hidden) { guardando.current = false; tic(); } };
    const t = setInterval(tic, 1000);
    document.addEventListener("visibilitychange", vuelve); addEventListener("focus", vuelve); addEventListener("online", vuelve);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", vuelve); removeEventListener("focus", vuelve); removeEventListener("online", vuelve); };
  }, []);

  /* Mantener la pantalla prendida mientras corre, si el teléfono lo permite */
  const corre = !!f && !f.pausadoEn;
  useEffect(() => {
    if (!corre) return;
    let vivo = true;
    const pedir = async () => { try { const c = await (navigator as any).wakeLock?.request("screen"); if (vivo) candado.current = c; else c?.release(); } catch { /* sin permiso sigue contando igual */ } };
    const vuelve = () => { if (!document.hidden) pedir(); };
    pedir(); document.addEventListener("visibilitychange", vuelve);
    return () => { vivo = false; document.removeEventListener("visibilitychange", vuelve); candado.current?.release?.().catch?.(() => {}); candado.current = null; };
  }, [corre]);

  const cerrar = useCallback(async (x: EstadoFoco, minutos: number) => {
    if (x.modo === "descanso") { setF(null); toast("Descanso terminado. ¿Otra vuelta?"); return; }
    if (minutos < 1) { setF(null); return; }
    if (guardando.current) return;
    guardando.current = true;
    const { error } = await sb.from("sesiones_foco").upsert({ perfil_id: perfil.id, materia_id: x.materiaId, inicio: new Date(x.inicio).toISOString(), minutos }, { onConflict: "perfil_id,inicio", ignoreDuplicates: true });
    if (error) { toast("No pude guardar la sesión. Reintento cuando vuelvas."); return; }
    guardando.current = false;
    setF(null); setRecien(minutos); lanzarEfecto("listo", `+${minutos} min`); navigator.vibrate?.([30, 60, 30]); cargar();
  }, [perfil.id, setF, toast, cargar]);

  const resta = f ? segundosRestan(f, ahora) : 0;
  useEffect(() => { if (f && !f.pausadoEn && resta <= 0) cerrar(f, f.min); }, [f, resta, cerrar]);

  function empezar(modo: EstadoFoco["modo"], m: number) { setRecien(null); const n = Date.now(); setAhora(n); setF(nuevoFoco(m, modo, mid, n)); }
  function pausa() { if (!f) return; const n = Date.now(); setAhora(n); setF(f.pausadoEn ? seguir(f, n) : pausar(f, n)); }

  const hoy = diaClave(ahoraBA());
  const conDia = useMemo(() => ses.map((s) => ({ ...s, dia: claveDeISO(s.inicio) })), [ses]);
  const r = useMemo(() => racha(conDia.map((s) => s.dia), hoy), [conDia, hoy]);
  const semanas = useMemo(() => minutosPorSemana(conDia, hoy), [conDia, hoy]);
  const semana = semanas[semanas.length - 1], tope = Math.max(...semanas.map((s) => s.minutos), 1);
  const hoyMin = conDia.filter((s) => s.dia === hoy).reduce((a, s) => a + s.minutos, 0);
  const porMateria = useMemo(() => {
    const g = new Map<number | null, number>();
    for (const s of conDia) if (s.dia >= semana.desde) g.set(s.materia_id, (g.get(s.materia_id) || 0) + s.minutos);
    return [...g].sort((a, b) => b[1] - a[1]).map(([id, m]) => ({ id, m, n: materias.find((x) => x.id === id) }));
  }, [conDia, semana.desde, materias]);
  const cursando = materias.filter((m) => m.estado === "cursando");
  const nomMateria = f?.materiaId ? materias.find((m) => m.id === f.materiaId)?.nombre : null;
  const total = (f?.min || min) * 60, frac = f ? resta / total : 1;

  return <>
    <div className={`es-reloj ${corre ? "corre" : ""} ${f?.modo === "descanso" ? "descanso" : ""}`} role="timer" aria-label={f ? `Quedan ${Math.ceil(resta / 60)} minutos` : `${min} minutos de foco`}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <defs><linearGradient id="es-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={f?.modo === "descanso" ? "var(--billetera2)" : "var(--estudio2)"} /><stop offset="1" stopColor={f?.modo === "descanso" ? "var(--billetera)" : "var(--estudio)"} /></linearGradient></defs>
        <circle className="fondo" cx="50" cy="50" r={R} />
        <circle className="va" cx="50" cy="50" r={R} style={{ strokeDasharray: L, strokeDashoffset: L * (1 - frac) }} />
      </svg>
      <div className="centro"><b>{reloj(f ? resta : min * 60)}</b><small>{f ? (f.modo === "descanso" ? "Descanso" : nomMateria || "Foco") + (f.pausadoEn ? ", en pausa" : "") : "Elegí cuánto y arrancá"}</small></div>
    </div>

    {!f && <>
      {recien != null && <p className="expl" role="status" style={{ textAlign: "center" }}>Listo: sumaste {recien} minutos. Si querés, descansá un rato.</p>}
      <div className="chipera" style={{ justifyContent: "center" }}>{TIEMPOS.map((t) => <button key={t} className="chip" aria-pressed={min === t} onClick={() => setMin(t)}>{t} min</button>)}</div>
      {cursando.length > 0 && <div className="campo"><label htmlFor="fo-m">Materia</label><select id="fo-m" value={mid ?? ""} onChange={(e) => setMid(e.target.value ? +e.target.value : null)}><option value="">Sin elegir</option>{cursando.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select></div>}
      <button className="btn pri" onClick={() => empezar("foco", min)}><Icono n="fuego" />Empezar</button>
      <div className="fila">{DESCANSOS.map((d) => <button key={d} className="btn sec2 chico" onClick={() => empezar("descanso", d)}>Descanso de {d}</button>)}</div>
    </>}
    {f && <div className="dos">
      <button className="btn sec2" onClick={pausa}>{f.pausadoEn ? "Seguir" : "Pausar"}</button>
      <button className="btn mal" onClick={() => { guardando.current = false; cerrar(f, minutosHechos(f, Date.now())); }}>Terminar</button>
    </div>}
    {f && <p className="chico" style={{ textAlign: "center" }}>Podés apagar la pantalla: sigue contando y se guarda solo cuando vuelvas.</p>}

    <div className="dos">
      <div className="mini"><span className="et">Racha</span><b>{r} {r === 1 ? "día" : "días"}</b><small>{r ? "Seguí así" : "Empezá hoy"}</small></div>
      <div className="mini"><span className="et">Esta semana</span><b>{horasTexto(semana.minutos)}</b><small>Hoy {horasTexto(hoyMin)}</small></div>
    </div>
    {cargado && !ses.length ? <Vacio emoji="🍅" titulo="Todavía no hay sesiones" texto="Hacé una vuelta de foco y acá vas a ver tu racha y cuánto estudiaste por semana." /> : <>
      <div className="tarjeta"><h3>Minutos por semana</h3>
        <div className="es-bars">{semanas.map((s, i) => { const k = new Date(`${s.desde}T12:00:00Z`); return <div key={s.desde} className={i === semanas.length - 1 ? "ya" : ""}><em>{s.minutos || ""}</em><i style={{ height: `${Math.max(3, (s.minutos / tope) * 70)}%` }} /><span>{k.getUTCDate()} {MESES[k.getUTCMonth()]}</span></div>; })}</div>
      </div>
      {porMateria.length > 0 && <div className="lista">{porMateria.map((x) => <div key={x.id ?? 0} className="item" style={{ minHeight: 54 }}><span className="q"><b style={{ fontSize: 16.5 }}>{x.n?.nombre || "Sin materia"}</b></span><span className="v">{horasTexto(x.m)}</span></div>)}</div>}
    </>}
  </>;
}
