"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { sb, correoDe, normalizarUsuario } from "@/lib/sb";
import { latirLetra, pase, sacudirLetras } from "@/lib/pase";
import { MARCA } from "@/lib/marca";

export function Formulario() {
  const r = useRouter(), q = useSearchParams();
  const [modo, setModo] = useState<"entrar" | "registro" | "clave">(q.get("paso") === "clave" ? "clave" : "entrar");
  const [u, setU] = useState(""), [c, setC] = useState(""), [c2, setC2] = useState(""), [nom, setNom] = useState(""), [cod, setCod] = useState("");
  const [err, setErr] = useState(""), [ir, setIr] = useState(false), [tiembla, setT] = useState(false), [verC, setVerC] = useState(false);

  useEffect(() => {
    if (q.get("paso") === "clave") setModo("clave");
  }, [q]);

  const escribe = (f: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => { f(e.target.value); latirLetra(); };
  function fallo(t: string) { setErr(t); setT(true); sacudirLetras(); setTimeout(() => setT(false), 450); }

  async function entrar(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setIr(true);
    const { error } = await sb.auth.signInWithPassword({ email: correoDe(u), password: c });
    setIr(false);
    if (error) return fallo("Usuario o contraseña incorrectos. Si es tu primera vez, la contraseña es la que te pasaron.");
    pase(() => r.replace("/inicio"));
  }
  async function registrar(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    const us = normalizarUsuario(u);
    if (us.length < 3) return fallo("Elegí un usuario de al menos 3 letras.");
    if (c.length < 8) return fallo("La contraseña necesita al menos 8 caracteres.");
    setIr(true);
    const { data: res, error } = await sb.rpc("registrar_usuario", { p_usuario: us, p_nombre: nom.trim() || u, p_clave: c, p_codigo: cod.trim() || null });
    if (error || res !== "ok") {
      setIr(false);
      return fallo(res === "usuario_ocupado" ? "Ese usuario ya existe. Probá con otro." : res === "codigo_invalido" ? "Ese código de grupo no existe." : "No pude crear la cuenta. Probá de nuevo.");
    }
    const e2 = await sb.auth.signInWithPassword({ email: correoDe(us), password: c });
    setIr(false);
    if (e2.error) { setErr("La cuenta se creó, pero no pude entrar. Probá iniciar sesión."); setModo("entrar"); return; }
    pase(() => r.replace("/inicio"));
  }
  async function cambiar(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    if (c.length < 8) return fallo("Usá al menos 8 caracteres.");
    if (c === "12345678") return fallo("Esa es la contraseña inicial. Elegí una tuya.");
    if (c !== c2) return fallo("Las dos contraseñas no coinciden.");
    setIr(true);
    const { error } = await sb.auth.updateUser({ password: c });
    if (error) { setIr(false); return fallo("No pude cambiarla. Probá con otra."); }
    await sb.rpc("clave_cambiada");
    pase(() => r.replace("/inicio"));
  }

  return <div className="fa-hoja">
    {modo === "entrar" && <>
      <p className="lema">{MARCA.lema}</p>
      <form onSubmit={entrar} className={`fa-form ${tiembla ? "temblar" : ""}`}>
        <div className="campo"><label htmlFor="usuario">Usuario</label><input id="usuario" type="text" autoCapitalize="none" autoComplete="username" placeholder="Tu nombre" value={u} onChange={escribe(setU)} required /></div>
        <div className="campo"><label htmlFor="clave">Contraseña</label><div className="fa-clave"><input id="clave" type={verC ? "text" : "password"} autoComplete="current-password" value={c} onChange={escribe(setC)} required /><button type="button" onClick={() => setVerC(!verC)} aria-pressed={verC}>{verC ? "Ocultar" : "Ver"}</button></div></div>
        {err && <p className="error" role="alert">{err}</p>}
        <button className="btn pri" disabled={ir}>{ir ? "Entrando…" : "Entrar"}</button>
      </form>
      <div className="fa-enlaces">
        <button className="enl" onClick={() => { setErr(""); setModo("registro"); }}>Soy nuevo, crear cuenta</button>
        <button className="enl" onClick={() => setErr("Pedile a quien administra tu grupo que te resetee la contraseña.")}>Me olvidé la contraseña</button>
      </div>
    </>}
    {modo === "registro" && <>
      <p className="lema">Creá tu cuenta en un minuto.</p>
      <form onSubmit={registrar} className={`fa-form ${tiembla ? "temblar" : ""}`}>
        <div className="campo"><label htmlFor="n">Tu nombre</label><input id="n" type="text" value={nom} onChange={escribe(setNom)} required /></div>
        <div className="campo"><label htmlFor="us">Usuario</label><input id="us" type="text" autoCapitalize="none" value={u} onChange={escribe(setU)} required /></div>
        <div className="campo"><label htmlFor="cl">Contraseña</label><input id="cl" type="password" autoComplete="new-password" value={c} onChange={escribe(setC)} required /></div>
        <div className="campo"><label htmlFor="co">Código de tu grupo (si tenés)</label><input id="co" type="text" autoCapitalize="characters" value={cod} onChange={escribe(setCod)} /></div>
        {err && <p className="error" role="alert">{err}</p>}
        <button className="btn pri" disabled={ir}>{ir ? "Creando…" : "Crear cuenta"}</button>
      </form>
      <div className="fa-enlaces"><button className="enl" onClick={() => { setErr(""); setModo("entrar"); }}>Ya tengo cuenta</button></div>
    </>}
    {modo === "clave" && <>
      <p className="lema">Primero, elegí tu contraseña. Es lo que protege tus mensajes y tu dirección.</p>
      <form onSubmit={cambiar} className={`fa-form ${tiembla ? "temblar" : ""}`}>
        <div className="campo"><label htmlFor="c1">Contraseña nueva</label><input id="c1" type="password" autoComplete="new-password" value={c} onChange={escribe(setC)} required /></div>
        <div className="campo"><label htmlFor="c2">Repetila</label><input id="c2" type="password" autoComplete="new-password" value={c2} onChange={escribe(setC2)} required /></div>
        {err && <p className="error" role="alert">{err}</p>}
        <button className="btn pri" disabled={ir}>{ir ? "Guardando…" : "Guardar y seguir"}</button>
      </form>
    </>}
  </div>;
}
