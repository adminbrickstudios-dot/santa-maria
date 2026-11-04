import { sb } from "./sb";

function b64(s: string) {
  const p = (s + "=".repeat((4 - (s.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(p), (c) => c.charCodeAt(0));
}
export const pushSoportado = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
export const estaInstalada = () => typeof window !== "undefined" && (matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
export const esIOS = () => typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);

export async function activarPush(perfilId: string): Promise<"ok" | "denegado" | "instalar" | "error"> {
  if (!pushSoportado()) return esIOS() ? "instalar" : "error";
  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") return "denegado";
  try {
    const { data: clave } = await sb.rpc("push_clave_publica");
    if (!clave) return "error";
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(clave) });
    const j = sub.toJSON();
    await sb.from("suscripciones_push").upsert({ perfil_id: perfilId, endpoint: j.endpoint, p256dh: j.keys?.p256dh, auth: j.keys?.auth, agente: navigator.userAgent.slice(0, 200) }, { onConflict: "endpoint" });
    return "ok";
  } catch {
    return "error";
  }
}
