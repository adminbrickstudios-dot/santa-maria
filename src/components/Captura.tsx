"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { tic } from "@/lib/tic";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { sb } from "@/lib/sb";
import { useSesion } from "@/lib/sesion";
import { Hoja } from "./Hoja";
import { Icono } from "./Icono";
import { lanzarEfecto } from "./Efectos";
import { avisosDe, fechaISO, hoyBA, interpretarEvento, interpretarPlata, queEs } from "@/lib/interpretar";
import { aISO, TIPOS } from "@/lib/agenda";
import { pesos } from "@/lib/util";

type Modo = "plata" | "agenda" | "auto";
export function abrirCaptura(modo: Modo, tipo?: "gasto" | "ingreso", texto?: string) { window.dispatchEvent(new CustomEvent("sm-captura", { detail: { modo, tipo, texto } })); }

/* Si no hay internet, lo guardo acá y lo subo cuando vuelve */
const COLA = "sm-cola";
function aCola(tabla: string, fila: any) { try { localStorage.setItem(COLA, JSON.stringify([...JSON.parse(localStorage.getItem(COLA) || "[]"), { tabla, fila }])); } catch {} }
export async function vaciarCola() {
  let l: any[] = []; try { l = JSON.parse(localStorage.getItem(COLA) || "[]"); } catch {}
  if (!l.length || !navigator.onLine) return;
  const quedan: any[] = [];
  for (const x of l) { const { error } = await sb.from(x.tabla).insert(x.fila); if (error) quedan.push(x); }
  try { localStorage.setItem(COLA, JSON.stringify(quedan)); } catch {}
  window.dispatchEvent(new Event("sm-plata")); window.dispatchEvent(new Event("sm-agenda"));
}
let capac: { audio: boolean; ia: boolean } | null = null;
async function capacidades() {
  if (!capac) capac = await fetch("/api/voz").then((r) => r.json()).catch(() => ({ audio: false, ia: false }));
  return capac!;
}
async function pedirIA(modo: Modo, texto: string, audio: Blob | null, categorias: string) {
  const { data } = await sb.auth.getSession();
  const f = new FormData();
  f.append("modo", modo); f.append("hoy", fechaISO(hoyBA())); f.append("categorias", categorias);
  if (audio) f.append("audio", new File([audio], "audio.webm", { type: audio.type })); else f.append("texto", texto);
  const r = await fetch("/api/voz", { method: "POST", headers: { Authorization: `Bearer ${data.session?.access_token}` }, body: f });
  return r.ok ? r.json() : null;
}
export function Captura() {
  const q = useSearchParams(), { perfil, toast } = useSesion(), router = useRouter();
  const [modo, setModo] = useState<Modo | null>(null), [tipo, setTipo] = useState<"gasto" | "ingreso">("gasto");
  const [txt, setTxt] = useState(""), [oye, setOye] = useState(false), [pensando, setPensando] = useState(false);
  const [mov, setMov] = useState<any>(null), [ev, setEv] = useState<any>(null), [cats, setCats] = useState<any[]>([]);
  const rec = useRef<any>(null), chunks = useRef<Blob[]>([]);

  const reiniciar = useCallback(() => { setTxt(""); setMov(null); setEv(null); setOye(false); setPensando(false); }, []);
  useEffect(() => {
    const f = (e: Event) => { const d = (e as CustomEvent).detail; reiniciar(); setModo(d.modo); setTipo(d.tipo || "gasto"); tic(10); if (d.texto) setTimeout(() => { setTxt(d.texto); }, 0); };
    addEventListener("sm-captura", f);
    return () => removeEventListener("sm-captura", f);
  }, [reiniciar]);
  useEffect(() => {
    if (q.get("rapido") === "1") abrirCaptura(location.pathname.startsWith("/agenda") ? "agenda" : "plata");
  }, [q]);
  useEffect(() => {
    if ((modo === "plata" || modo === "auto") && !cats.length) sb.from("plata_categorias").select("*").order("orden").then(({ data }: any) => setCats(data || []));
  }, [modo, cats.length]);
  const lista = cats.filter((c) => c.tipo === tipo);

  async function procesar(texto: string, audio: Blob | null = null, forzado?: Modo) {
    let md = forzado || modo;
    if (!md) return;
    const t = texto.trim();
    if (md === "auto" && t) {
      const dest = t.match(/^(?:c[oó]mo llego|como voy|ir|llevame|quiero ir) (?:a |al |hasta )?(.+)$/i);
      if (dest) { setModo(null); router.push(`/mapa?q=${encodeURIComponent(dest[1])}`); return; }
      md = queEs(t); setModo(md);
      if (md === "plata") { const c = interpretarPlata(t); setTipo(c.tipo); setMov({ ...c, monto: String(c.monto) }); return; }
    }
    if (t) {
      if (md === "plata") { const p = interpretarPlata(t, tipo); setMov({ ...p, monto: p.monto ? String(p.monto) : "" }); }
      else setEv(interpretarEvento(t));
    }
    const c = await capacidades();
    if (!(c.ia || (audio && c.audio))) return;
    setPensando(true);
    const r = await pedirIA(md === "auto" ? "agenda" : md, t, audio, lista.map((x) => x.nombre).join(", ")).catch(() => null);
    setPensando(false);
    if (r?.texto && !t) { setTxt(r.texto); await procesar(r.texto); return; }
    if (!r?.datos) return;
    if (md === "plata") { setTipo(r.datos.tipo || tipo); setMov((m: any) => ({ ...m, ...r.datos, monto: String(r.datos.monto || m?.monto || "") })); }
    else setEv((e: any) => ({ ...e, ...r.datos, avisos: avisosDe(r.datos.tipo || e?.tipo) }));
  }
  async function microfono() {
    if (oye) { rec.current?.stop?.(); return; }
    const c = await capacidades();
    tic(14);
    if (c.audio && typeof MediaRecorder !== "undefined") {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        const m = new MediaRecorder(s); chunks.current = [];
        m.ondataavailable = (e) => chunks.current.push(e.data);
        m.onstop = () => { s.getTracks().forEach((t) => t.stop()); setOye(false); procesar("", new Blob(chunks.current, { type: m.mimeType })); };
        m.start(); rec.current = m; setOye(true);
        return;
      } catch { toast("Dale permiso al micrófono para usar audios."); return; }
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return toast("Tocá el micrófono de tu teclado y dictá.");
    const r = new SR(); r.lang = "es-AR"; r.interimResults = true; r.continuous = false;
    let fin = "";
    r.onresult = (e: any) => { fin = [...e.results].map((x: any) => x[0].transcript).join(" "); setTxt(fin); };
    r.onerror = (e: any) => { setOye(false); if (e.error === "not-allowed") toast("Dale permiso al micrófono para usar audios."); };
    r.onend = () => { setOye(false); if (fin) procesar(fin); };
    rec.current = r; setOye(true); r.start();
  }
  async function guardarMov() {
    const n = +String(mov.monto).replace(/\./g, "").replace(",", ".");
    if (!(n > 0)) return toast("Poné el monto.");
    const fila = { perfil_id: perfil.id, tipo, monto: n, categoria: mov.categoria, nota: mov.nota || null, fecha: mov.fecha };
    setModo(null);
    lanzarEfecto(tipo === "gasto" ? "quema" : "gana", `${tipo === "gasto" ? "−" : "+"}${pesos(n)}`);
    const { error } = await sb.from("movimientos").insert(fila);
    if (error) { aCola("movimientos", fila); toast("Sin conexión: lo subo cuando vuelva."); } else window.dispatchEvent(new Event("sm-plata"));
  }
  async function guardarEv() {
    if (!ev.titulo?.trim()) return toast("Poné qué es.");
    const fila = { perfil_id: perfil.id, tipo: ev.tipo, titulo: ev.titulo.trim(), fecha: aISO(ev.fecha, ev.hora), todo_dia: !ev.hora, lugar_nombre: ev.lugar || null, avisos: ev.avisos };
    setModo(null); lanzarEfecto("listo");
    const { error } = await sb.from("eventos").insert(fila);
    if (error) { aCola("eventos", fila); toast("Sin conexión: lo subo cuando vuelva."); } else window.dispatchEvent(new Event("sm-agenda"));
  }
  if (!modo) return null;
  const esPlata = modo === "plata", yaLeido = esPlata ? mov : ev;
  return <Hoja titulo={modo === "auto" ? "Decime" : esPlata ? "Anotar" : "Sumar a la agenda"} cerrar={() => setModo(null)}>
    {esPlata && (mov || !yaLeido) && <div className="cap-tipo" data-i={tipo === "gasto" ? 0 : 1}><button onClick={() => { setTipo("gasto"); setMov((m: any) => m && { ...m, categoria: "Otros" }); }}>Gasto</button><button onClick={() => { setTipo("ingreso"); setMov((m: any) => m && { ...m, categoria: "Otros" }); }}>Ingreso</button></div>}
    {!yaLeido && <>
      <button className={`cap-mic ${esPlata ? "plata" : ""} ${oye ? "oye" : ""}`} onClick={microfono} aria-label={oye ? "Terminar" : "Hablar"}><Icono n={oye ? "ok" : "mic"} t={36} /></button>
      <p className="expl" style={{ textAlign: "center" }}>{oye ? "Te escucho…" : modo === "auto" ? "Un gasto, un parcial o a dónde vas. Yo lo acomodo." : esPlata ? (tipo === "gasto" ? "Decí algo como “5 lucas en el súper”" : "Decí algo como “cobré 200 mil de la changa”") : "Decí algo como “parcial de Mate el jueves a las 10”"}</p>
      <form className="cap-txt" onSubmit={(e) => { e.preventDefault(); if (txt.trim()) procesar(txt); }}>
        <input type="text" value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="O escribilo acá" aria-label="Escribir" enterKeyHint="done" />
        <button className="cap-ok" aria-label="Seguir" style={{ "--sec-c": esPlata ? "var(--billetera)" : "var(--agenda)" } as React.CSSProperties}><Icono n="flecha" t={22} /></button>
      </form>
      {modo === "plata" && <button className="btn sec2 chico" onClick={() => setMov({ monto: "", categoria: lista[0]?.nombre || "Otros", nota: "", fecha: fechaISO(hoyBA()) })}>Elegir a mano</button>}
      {modo === "agenda" && <button className="btn sec2 chico" onClick={() => setEv({ titulo: "", tipo: "personal", fecha: fechaISO(hoyBA()), hora: null, lugar: "", avisos: avisosDe("personal") })}>Completar a mano</button>}
    </>}
    {esPlata && mov && <>
      <label className="cap-monto"><span>$</span><input inputMode="numeric" autoFocus={!mov.monto} value={mov.monto} onChange={(e) => setMov({ ...mov, monto: e.target.value.replace(/[^\d.,]/g, "") })} aria-label="Monto" placeholder="0" /></label>
      <div className="cap-cats">{lista.map((c) => <button key={c.id} className="cap-cat" aria-pressed={mov.categoria === c.nombre} style={{ "--c": c.color } as React.CSSProperties} onClick={() => setMov({ ...mov, categoria: c.nombre })}><i>{c.emoji}</i>{c.nombre}</button>)}</div>
      <div className="dos"><div className="campo"><label htmlFor="c-f">Fecha</label><input id="c-f" type="date" value={mov.fecha} onChange={(e) => setMov({ ...mov, fecha: e.target.value })} /></div><div className="campo"><label htmlFor="c-n">Nota</label><input id="c-n" type="text" value={mov.nota} onChange={(e) => setMov({ ...mov, nota: e.target.value })} /></div></div>
      <button className="btn pri" style={{ "--sec-c": tipo === "gasto" ? "var(--agenda)" : "var(--billetera)" } as React.CSSProperties} onClick={guardarMov}>{tipo === "gasto" ? "Anotar gasto" : "Anotar ingreso"}</button>
    </>}
    {!esPlata && ev && <>
      <div className="campo"><label htmlFor="c-t">Qué es</label><input id="c-t" type="text" value={ev.titulo} onChange={(e) => setEv({ ...ev, titulo: e.target.value })} /></div>
      <div className="cap-cats">{Object.entries(TIPOS).filter(([k]) => k !== "otro").map(([k, t]) => <button key={k} className="cap-cat" aria-pressed={ev.tipo === k} style={{ "--c": t.c } as React.CSSProperties} onClick={() => setEv({ ...ev, tipo: k, avisos: avisosDe(k) })}><i>{t.e}</i>{t.n}</button>)}</div>
      <div className="dos"><div className="campo"><label htmlFor="c-f2">Día</label><input id="c-f2" type="date" value={ev.fecha} onChange={(e) => setEv({ ...ev, fecha: e.target.value })} /></div><div className="campo"><label htmlFor="c-h">Hora</label><input id="c-h" type="time" value={ev.hora || ""} onChange={(e) => setEv({ ...ev, hora: e.target.value || null })} /></div></div>
      <div className="campo"><label htmlFor="c-l">Dónde</label><input id="c-l" type="text" value={ev.lugar} onChange={(e) => setEv({ ...ev, lugar: e.target.value })} /></div>
      <button className="btn pri" style={{ "--sec-c": "var(--agenda)" } as React.CSSProperties} onClick={guardarEv}>Sumar a la agenda</button>
    </>}
    {pensando && <p className="chico" style={{ textAlign: "center" }}>Pensando…</p>}
  </Hoja>;
}
