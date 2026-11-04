"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

const MIA = process.env.NEXT_PUBLIC_VERSION;
const YA = "sm-recarga";
let nueva = "";

/* Nunca recargamos encima de algo a medio escribir ni con una hoja abierta */
function hayAlgoEscrito() {
  if (document.querySelector(".hoja,.el-fondo,.tq-fondo")) return true;
  const a = document.activeElement as HTMLElement | null;
  if (a?.matches?.("input,textarea,select,[contenteditable]")) return true;
  for (const c of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input:not([type=hidden]):not([type=search]):not([type=checkbox]):not([type=radio]),textarea")) if (c.value) return true;
  return false;
}
function recargarSiSePuede() {
  if (!nueva || nueva === MIA || hayAlgoEscrito()) return;
  /* Una sola vez por versión: si el servidor todavía no la tiene, no entramos en un bucle */
  try { if (sessionStorage.getItem(YA) === nueva) return; sessionStorage.setItem(YA, nueva); } catch { return; }
  location.reload();
}
const FALTA_CHUNK = /ChunkLoadError|Loading chunk|Failed to load chunk|dynamically imported module|Importing a module script failed/i;

/* Registra el service worker y recarga en un momento tranquilo cuando sale una versión nueva */
export function Version() {
  const ruta = usePathname();
  useEffect(() => { recargarSiSePuede(); }, [ruta]);
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const sw = navigator.serviceWorker;
    let reg: ServiceWorkerRegistration | undefined, ultima = Date.now();
    const alMensaje = (e: MessageEvent) => { if (e.data?.tipo === "sm-version" && e.data.v && e.data.v !== MIA) nueva = e.data.v; };
    const preguntar = () => sw.controller?.postMessage({ tipo: "sm-version?" });
    const alCambiarVisible = () => {
      if (document.visibilityState === "hidden") return recargarSiSePuede();
      recargarSiSePuede();
      /* En el celular la app queda abierta días: al volver miramos si hay versión nueva */
      if (Date.now() - ultima > 5 * 60e3) { ultima = Date.now(); reg?.update().catch(() => {}); }
    };
    const alFallar = (e: ErrorEvent | PromiseRejectionEvent) => {
      const t = String((e as ErrorEvent).message || (e as PromiseRejectionEvent).reason?.message || (e as PromiseRejectionEvent).reason || "");
      /* Fijo por versión: si el chunk falta de verdad, se reintenta una sola vez y no entra en bucle */
      if (FALTA_CHUNK.test(t) && navigator.onLine) { nueva = nueva || `sin-chunk-${MIA}`; recargarSiSePuede(); }
    };
    sw.addEventListener("message", alMensaje);
    sw.addEventListener("controllerchange", preguntar);
    document.addEventListener("visibilitychange", alCambiarVisible);
    addEventListener("error", alFallar); addEventListener("unhandledrejection", alFallar);
    const registrar = () => sw.register("/sw.js", { updateViaCache: "none" }).then((r) => { reg = r; preguntar(); }).catch(() => {});
    const id = setTimeout(registrar, 1500);
    return () => {
      clearTimeout(id);
      sw.removeEventListener("message", alMensaje); sw.removeEventListener("controllerchange", preguntar);
      document.removeEventListener("visibilitychange", alCambiarVisible);
      removeEventListener("error", alFallar); removeEventListener("unhandledrejection", alFallar);
    };
  }, []);
  return null;
}
