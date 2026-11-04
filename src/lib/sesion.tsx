"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { sb } from "./sb";

type Ctx = {
  perfil: any; grupo: any; personas: any[]; sinLeer: number; avisos: number; lugares: any[];
  recargar: () => Promise<void>; recuentos: () => Promise<void>; toast: (t: string) => void; pantalla: (n: string) => boolean;
};
const C = createContext<Ctx>(null as any);
/* Copia para abrir rápido. No confundir con "sm-sesion", donde Supabase guarda el inicio de sesión. */
const FOTO = "sm-foto";
export function olvidarSesion() { try { localStorage.removeItem(FOTO); } catch {} }
export const useSesion = () => useContext(C);

export function aplicarTema(tema?: string, acento?: string) {
  const r = document.documentElement;
  if (tema === "claro") r.setAttribute("data-theme", "light");
  else if (tema === "oscuro") r.setAttribute("data-theme", "dark");
  else r.removeAttribute("data-theme");
  if (acento) r.style.setProperty("--taxi", acento); else r.style.removeProperty("--taxi");
}

export function Sesion({ children }: { children: ReactNode }) {
  const router = useRouter(), ruta = usePathname();
  const [perfil, setP] = useState<any>(null), [grupo, setG] = useState<any>(null), [personas, setPs] = useState<any[]>([]), [lugares, setL] = useState<any[]>([]);
  const [sinLeer, setS] = useState(0), [avisos, setA] = useState(0), [msg, setMsg] = useState<string | null>(null);
  const tm = useRef<any>(null);

  const toast = useCallback((t: string) => {
    setMsg(t); clearTimeout(tm.current); tm.current = setTimeout(() => setMsg(null), 2800);
  }, []);
  const recuentos = useCallback(async () => {
    const [{ data: c }, { count }] = await Promise.all([
      sb.rpc("mis_conversaciones"),
      sb.from("notificaciones").select("id", { count: "exact", head: true }).eq("leida", false),
    ]);
    setS((c || []).reduce((a: number, x: any) => a + Number(x.sin_leer || 0), 0));
    setA(count || 0);
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
    setP(p); aplicarTema(p.tema, p.preferencias?.acento);
    const [{ data: g }, { data: ps }, { data: ls }] = await Promise.all([
      sb.from("grupos").select("*").eq("id", p.grupo_id).single(),
      sb.rpc("personas_del_grupo"),
      sb.from("lugares").select("*").order("orden"),
    ]);
    setG(g); setPs(ps || []); setL(ls || []);
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
    const canal = sb.channel("mis-avisos").on("postgres_changes", { event: "INSERT", schema: "public", table: "notificaciones", filter: `perfil_id=eq.${perfil.id}` }, () => recuentos()).subscribe();
    return () => { sb.removeChannel(canal); };
  }, [perfil?.id, recuentos]);
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  const pantalla = useCallback((n: string) => grupo?.pantallas?.[n] !== false, [grupo]);
  const v = useMemo(() => ({ perfil, grupo, personas, lugares, sinLeer, avisos, recargar, recuentos, toast, pantalla }), [perfil, grupo, personas, lugares, sinLeer, avisos, recargar, recuentos, toast, pantalla]);
  void ruta;
  if (!perfil) return <div className="cargando"><span className="sello">Santa María</span></div>;
  return <C.Provider value={v}>{children}{msg && <div className="toast" role="status">{msg}</div>}</C.Provider>;
}
