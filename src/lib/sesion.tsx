"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { sb } from "./sb";
import { Cargando } from "@/components/Cargando";

type Ctx = {
  perfil: any; grupo: any; personas: any[]; sinLeer: number; avisos: number; lugares: any[];
  recargar: () => Promise<void>; recuentos: () => Promise<void>; toast: (t: string) => void; pantalla: (n: string) => boolean;
  asegurarPersonas: (ids: string[]) => Promise<void>;
};
const C = createContext<Ctx>(null as any);
/* Copia para abrir rápido. No confundir con "sm-sesion", donde Supabase guarda el inicio de sesión. */
const FOTO = "sm-foto";
export function olvidarSesion() { try { localStorage.removeItem(FOTO); } catch {} }
export const useSesion = () => useContext(C);
/* Si lo que llegó es igual a la foto, se conserva el objeto: así no se redibuja toda la app por nada */
const igual = <T,>(a: T, b: T) => (JSON.stringify(a) === JSON.stringify(b) ? a : b);

export function aplicarTema(tema?: string, acento?: string) {
  const r = document.documentElement;
  if (tema === "claro") r.setAttribute("data-theme", "light");
  else if (tema === "oscuro") r.setAttribute("data-theme", "dark");
  else r.removeAttribute("data-theme");
  if (acento) r.style.setProperty("--taxi", acento); else r.style.removeProperty("--taxi");
}

export function Sesion({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [perfil, setP] = useState<any>(null), [grupo, setG] = useState<any>(null), [personas, setPs] = useState<any[]>([]), [lugares, setL] = useState<any[]>([]);
  const [sinLeer, setS] = useState(0), [avisos, setA] = useState(0), [msg, setMsg] = useState<string | null>(null);
  const tm = useRef<any>(null);

  const toast = useCallback((t: string) => {
    setMsg(t); clearTimeout(tm.current); tm.current = setTimeout(() => setMsg(null), 2800);
  }, []);
  const recuentos = useCallback(async () => {
    const { data } = await sb.rpc("mis_recuentos");
    setS(Number(data?.sin_leer || 0)); setA(Number(data?.avisos || 0));
  }, []);
  /* En un grupo grande la lista inicial no trae a todos: completa solo a quien hace falta */
  const conocidas = useRef(new Set<string>());
  const asegurarPersonas = useCallback(async (ids: string[]) => {
    const faltan = [...new Set(ids.filter(Boolean))].filter((i) => !conocidas.current.has(i));
    if (!faltan.length) return;
    faltan.forEach((i) => conocidas.current.add(i));
    const { data } = await sb.rpc("personas_por_id", { p_ids: faltan.slice(0, 200) });
    if (data?.length) setPs((l) => [...l, ...data.filter((x: any) => !l.some((y) => y.id === x.id))]);
  }, []);
  const recargar = useCallback(async () => {
    const { data: u, error } = await sb.auth.getSession();
    const uid = u?.session?.user?.id;
    if (!uid) {
      /* Sin internet no se puede renovar la sesión: no es lo mismo que haberla perdido */
      if (error && !navigator.onLine) return;
      router.replace("/entrar");
      return;
    }
    const { data: p } = await sb.from("perfiles").select("*").eq("id", uid).single();
    if (!p) { await sb.auth.signOut(); router.replace("/entrar"); return; }
    if (p.debe_cambiar_clave) { router.replace("/entrar?paso=clave"); return; }
    if (!p.onboarding_hecho) { router.replace("/bienvenida"); return; }
    setP((a: any) => igual(a, p)); aplicarTema(p.tema, p.preferencias?.acento);
    const [{ data: g }, { data: ps }, { data: ls }] = await Promise.all([
      sb.from("grupos").select("*").eq("id", p.grupo_id).single(),
      sb.rpc("personas_del_grupo"),
      sb.from("lugares").select("*").order("orden"),
    ]);
    setG((a: any) => igual(a, g)); setPs((a) => igual(a, ps || [])); setL((a) => igual(a, ls || []));
    conocidas.current = new Set((ps || []).map((x: any) => x.id));
    try { localStorage.setItem(FOTO, JSON.stringify({ perfil: p, grupo: g, personas: ps || [], lugares: ls || [] })); } catch {}
    recuentos();
  }, [router, recuentos]);

  /* Abre al instante con lo último que vimos y se actualiza por detrás */
  useLayoutEffect(() => {
    try {
      const f = JSON.parse(localStorage.getItem(FOTO) || "null");
      if (f?.perfil) { setP(f.perfil); setG(f.grupo); setPs(f.personas || []); setL(f.lugares || []); aplicarTema(f.perfil.tema, f.perfil.preferencias?.acento); }
    } catch {}
  }, []);
  useEffect(() => { recargar(); }, [recargar]);
  useEffect(() => {
    if (!perfil?.id) return;
    /* Un canal por persona y solo con la app a la vista: cada conexión abierta cuenta contra el cupo de Realtime.
       Varios avisos seguidos se resuelven con una sola consulta. */
    let canal: any = null, t: any = null;
    const abrir = () => { if (!canal) canal = sb.channel("mis-avisos").on("postgres_changes", { event: "INSERT", schema: "public", table: "notificaciones", filter: `perfil_id=eq.${perfil.id}` }, () => { clearTimeout(t); t = setTimeout(recuentos, 1500); }).subscribe(); };
    const cerrar = () => { if (canal) { sb.removeChannel(canal); canal = null; } };
    const vis = () => { if (document.hidden) cerrar(); else { abrir(); recuentos(); } };
    if (!document.hidden) abrir();
    document.addEventListener("visibilitychange", vis);
    return () => { clearTimeout(t); document.removeEventListener("visibilitychange", vis); cerrar(); };
  }, [perfil?.id, recuentos]);
  useEffect(() => {
    /* Fallas de la app: sin datos de la persona, con tope por visita */
    let n = 0;
    const anotar = (m: unknown) => { if (n++ < 5) sb.rpc("registrar_error", { p_origen: "app", p_codigo: "", p_mensaje: String(m).slice(0, 300), p_ruta: location.pathname }).then(() => {}, () => {}); };
    const e1 = (e: ErrorEvent) => anotar(e.message), e2 = (e: PromiseRejectionEvent) => anotar((e.reason as any)?.message || e.reason);
    addEventListener("error", e1); addEventListener("unhandledrejection", e2);
    return () => { removeEventListener("error", e1); removeEventListener("unhandledrejection", e2); };
  }, []);

  const pantalla = useCallback((n: string) => grupo?.pantallas?.[n] !== false, [grupo]);
  const v = useMemo(() => ({ perfil, grupo, personas, lugares, sinLeer, avisos, recargar, recuentos, toast, pantalla, asegurarPersonas }), [perfil, grupo, personas, lugares, sinLeer, avisos, recargar, recuentos, toast, pantalla, asegurarPersonas]);
  if (!perfil) return <Cargando />;
  return <C.Provider value={v}>{children}{msg && <div className="toast" role="status">{msg}</div>}</C.Provider>;
}
