"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { sb, correoDe, normalizarUsuario } from "@/lib/sb";
import { Ciudad } from "@/components/Ciudad";

function Marca() {
  const l = (t: string, d: number) => t.split("").map((c, i) => <span key={i} style={{ "--i": i + d } as React.CSSProperties}>{c}</span>);
  return <h1 className="marca-p" aria-label="Santa María">{l("Santa", 0)}<br /><em>{l("María", 5)}</em></h1>;
}

function Entrar() {
  const r = useRouter(), q = useSearchParams();
  const [modo, setModo] = useState<"entrar" | "registro" | "clave">(q.get("paso") === "clave" ? "clave" : "entrar");
  const [u, setU] = useState(""), [c, setC] = useState(""), [c2, setC2] = useState(""), [nom, setNom] = useState(""), [cod, setCod] = useState("");
  const [err, setErr] = useState(""), [ir, setIr] = useState(false), [tiembla, setT] = useState(false), [verC, setVerC] = useState(false), [pase, setPase] = useState(false);

  useEffect(() => {
    if (q.get("paso") === "clave") setModo("clave");
  }, [q]);

  async function entrar(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setIr(true);
    const { error } = await sb.auth.signInWithPassword({ email: correoDe(u), password: c });
    setIr(false);
    if (error) { setErr("Usuario o contraseña incorrectos. Si es tu primera vez, la contraseña es la que te pasaron."); setT(true); setTimeout(() => setT(false), 450); return; }
    setPase(true); setTimeout(() => r.replace("/inicio"), 460);
  }
  async function registrar(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    const us = normalizarUsuario(u);
    if (us.length < 3) { setErr("Elegí un usuario de al menos 3 letras."); return; }
    if (c.length < 8) { setErr("La contraseña necesita al menos 8 caracteres."); return; }
    setIr(true);
    const { data: res, error } = await sb.rpc("registrar_usuario", { p_usuario: us, p_nombre: nom.trim() || u, p_clave: c, p_codigo: cod.trim() || null });
    if (error || res !== "ok") {
      setIr(false);
      setErr(res === "usuario_ocupado" ? "Ese usuario ya existe. Probá con otro." : res === "codigo_invalido" ? "Ese código de grupo no existe." : "No pude crear la cuenta. Probá de nuevo.");
      return;
    }
    const e2 = await sb.auth.signInWithPassword({ email: correoDe(us), password: c });
    setIr(false);
    if (e2.error) { setErr("La cuenta se creó, pero no pude entrar. Probá iniciar sesión."); setModo("entrar"); return; }
    r.replace("/inicio");
  }
  async function cambiar(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    if (c.length < 8) { setErr("Usá al menos 8 caracteres."); return; }
    if (c === "12345678") { setErr("Esa es la contraseña inicial. Elegí una tuya."); return; }
    if (c !== c2) { setErr("Las dos contraseñas no coinciden."); return; }
    setIr(true);
    const { error } = await sb.auth.updateUser({ password: c });
    if (error) { setIr(false); setErr("No pude cambiarla. Probá con otra."); return; }
    await sb.rpc("clave_cambiada");
    r.replace("/inicio");
  }

  return (
    <div className="portada">
      {pase && <div className="pase" />}
      <Ciudad />
      <div className="portada-cu">
        <Marca />
        {modo === "entrar" && <>
          <p className="lema entra" style={{ "--i": 0 } as React.CSSProperties}>Tu vida en Buenos Aires, resuelta.</p>
          <form onSubmit={entrar} className={tiembla ? "temblar" : ""} style={{ display: "grid", gap: 12 }}>
            <div className="campo entra" style={{ "--i": 1 } as React.CSSProperties}><label htmlFor="usuario">Usuario</label><input id="usuario" type="text" autoCapitalize="none" autoComplete="username" placeholder="Tu nombre" value={u} onChange={(e) => setU(e.target.value)} required /></div>
            <div className="campo entra" style={{ "--i": 2 } as React.CSSProperties}><label htmlFor="clave">Contraseña</label><div style={{ position: "relative" }}><input id="clave" type={verC ? "text" : "password"} autoComplete="current-password" value={c} onChange={(e) => setC(e.target.value)} required style={{ paddingRight: 70 }} /><button type="button" onClick={() => setVerC(!verC)} style={{ position: "absolute", right: 12, top: 15, color: "#D9DEE2", fontWeight: 700, fontSize: 15 }}>{verC ? "Ocultar" : "Ver"}</button></div></div>
            {err && <p className="error" role="alert">{err}</p>}
            <button className="btn pri entra" style={{ "--i": 3 } as React.CSSProperties} disabled={ir}>{ir ? "Entrando…" : "Entrar"}</button>
          </form>
          <button className="enl entra" style={{ "--i": 4 } as React.CSSProperties} onClick={() => { setErr(""); setModo("registro"); }}>Soy nuevo, crear cuenta</button>
          <button className="enl entra" style={{ "--i": 5, fontSize: 15, padding: 0 } as React.CSSProperties} onClick={() => setErr("Pedile a quien administra tu grupo que te resetee la contraseña.")}>Me olvidé la contraseña</button>
        </>}
        {modo === "registro" && <>
          <p className="lema">Creá tu cuenta en un minuto.</p>
          <form onSubmit={registrar} style={{ display: "grid", gap: 12 }}>
            <div className="campo"><label htmlFor="n">Tu nombre</label><input id="n" type="text" value={nom} onChange={(e) => setNom(e.target.value)} required /></div>
            <div className="campo"><label htmlFor="us">Usuario</label><input id="us" type="text" autoCapitalize="none" value={u} onChange={(e) => setU(e.target.value)} required /></div>
            <div className="campo"><label htmlFor="cl">Contraseña</label><input id="cl" type="password" autoComplete="new-password" value={c} onChange={(e) => setC(e.target.value)} required /></div>
            <div className="campo"><label htmlFor="co">Código de tu grupo (si tenés)</label><input id="co" type="text" autoCapitalize="characters" value={cod} onChange={(e) => setCod(e.target.value)} /></div>
            {err && <p className="error" role="alert">{err}</p>}
            <button className="btn pri" disabled={ir}>{ir ? "Creando…" : "Crear cuenta"}</button>
          </form>
          <button className="enl" onClick={() => { setErr(""); setModo("entrar"); }}>Ya tengo cuenta</button>
        </>}
        {modo === "clave" && <>
          <p className="lema">Primero, elegí tu contraseña. Es lo que protege tus mensajes y tu dirección.</p>
          <form onSubmit={cambiar} style={{ display: "grid", gap: 12 }}>
            <div className="campo"><label htmlFor="c1">Contraseña nueva</label><input id="c1" type="password" autoComplete="new-password" value={c} onChange={(e) => setC(e.target.value)} required /></div>
            <div className="campo"><label htmlFor="c2">Repetila</label><input id="c2" type="password" autoComplete="new-password" value={c2} onChange={(e) => setC2(e.target.value)} required /></div>
            {err && <p className="error" role="alert">{err}</p>}
            <button className="btn pri" disabled={ir}>{ir ? "Guardando…" : "Guardar y seguir"}</button>
          </form>
        </>}
      </div>
    </div>
  );
}
export default function Pagina() {
  return <Suspense><Entrar /></Suspense>;
}
