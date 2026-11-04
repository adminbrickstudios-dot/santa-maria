/* Texto del service worker. Se arma en el build con la versión del deploy, así cada publicación trae caches propias.
   Va con String.raw y sin interpolar: los valores entran por reemplazo en cuerpoSW. */
const FUENTE = String.raw`/* __MARCA__: service worker de la versión __V__ */
const V = __VJ__, MARCA = __MARCAJ__;
const HTML = "sm-html-" + V, EST = "sm-est-" + V, DATOS = "sm-datos-1", CIUDAD = "sm-ciudad-1", META = "sm-meta";
/* Si la red tarda más que esto, abre lo guardado de esta misma versión */
const ESPERA_HTML = 1200;
const TOPE_CIUDAD = 150 * 1024 * 1024;
const PRINCIPALES = ["/inicio", "/agenda", "/billetera", "/mapa", "/gente", "/entrar"];

/* El HTML guardado tiene que ser de esta versión: si no, apuntaría a chunks de otra */
const esDeEstaVersion = (t) => t.includes('data-dpl-id="' + V + '"');

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => e.waitUntil((async () => {
  /* Queda la cache de archivos de la versión anterior: una pestaña vieja todavía puede pedir sus chunks */
  const meta = await caches.open(META), r = await meta.match("/version");
  const previa = r ? await r.text() : "";
  if (previa !== V) await meta.put("/version", new Response(V));
  const guardar = previa && previa !== V ? "sm-est-" + previa : "";
  for (const k of await caches.keys()) {
    if (k === EST || k === HTML || k === DATOS || k === CIUDAD || k === META || k === guardar) continue;
    await caches.delete(k);
  }
  await self.clients.claim();
  for (const c of await self.clients.matchAll({ type: "window", includeUncontrolled: true })) c.postMessage({ tipo: "sm-version", v: V });
  precalentar();
})()));

self.addEventListener("message", (e) => {
  if (e.data && e.data.tipo === "sm-version?" && e.source) e.source.postMessage({ tipo: "sm-version", v: V });
});

/* Deja listas las pantallas principales para que la próxima apertura sea instantánea */
async function precalentar() {
  if (self.navigator.connection && self.navigator.connection.saveData) return;
  const h = await caches.open(HTML), est = await caches.open(EST);
  for (const p of PRINCIPALES) {
    try {
      if (await h.match(p)) continue;
      const r = await fetch(p, { credentials: "same-origin" });
      if (!r.ok || r.redirected) continue;
      const t = await r.clone().text();
      if (!esDeEstaVersion(t)) continue;
      await h.put(p, r);
      const urls = new Set(Array.from(t.matchAll(/(?:href|src)="(\/_next\/static\/[^"]+)"/g), (m) => m[1].replace(/&amp;/g, "&")));
      for (const u of urls) {
        if (await est.match(u)) continue;
        const a = await fetch(u);
        if (a.ok) await est.put(u, a);
      }
    } catch {}
  }
}

const esHtml = (r) => (r.headers.get("content-type") || "").includes("text/html");

async function guardarHtml(c, clave, r) {
  try { if (esDeEstaVersion(await r.clone().text())) await c.put(clave, r); } catch {}
}
/* Se engancha antes de responder: si la respuesta se va por lo guardado, igual llega a guardarse */
function guardarAlLlegar(e, c, clave, red) {
  e.waitUntil(red.then((r) => (r.ok && !r.redirected && esHtml(r) ? guardarHtml(c, clave, r.clone()) : undefined)).catch(() => {}));
}

/* Pantallas: primero la red. Lo guardado solo si no hay red, o si la red tarda más que ESPERA_HTML */
async function pagina(e, u) {
  const c = await caches.open(HTML), h = await c.match(u.pathname);
  const red = fetch(e.request);
  guardarAlLlegar(e, c, u.pathname, red);
  if (!h) return red.catch(sinRed);
  if (self.navigator.onLine === false) { red.catch(() => {}); return h; }
  let tm;
  const espera = new Promise((ok) => { tm = setTimeout(() => ok(null), ESPERA_HTML); });
  try {
    const r = await Promise.race([red, espera]);
    if (!r) red.catch(() => {});
    return r || h;
  } catch { return h; } finally { clearTimeout(tm); }
}

/* Nunca una pantalla equivocada: sin red y sin esa página guardada, lo decimos */
function sinRed() {
  const t = '<!doctype html><html lang="es-AR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>' + MARCA + '</title><body style="margin:0;min-height:100dvh;display:grid;place-content:center;gap:14px;padding:24px;text-align:center;background:#0B0C0F;color:#fff;font:600 18px system-ui,sans-serif"><b style="font-size:26px">Sin conexión</b><span style="color:#AEB3BB">Esta pantalla necesita internet la primera vez.</span><button onclick="location.reload()" style="min-height:54px;border:0;border-radius:16px;background:#fff;color:#0B0C0F;font:800 18px system-ui,sans-serif">Reintentar</button></body></html>';
  return new Response(t, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

/* Los archivos con hash no cambian nunca: una vez guardados no se piden más */
async function archivoFijo(q) {
  const h = await caches.match(q);
  if (h) return h;
  const r = await fetch(q);
  if (r.ok && !esHtml(r)) { const c = await caches.open(EST); await c.put(q, r.clone()); }
  return r;
}

/* Plano, transporte e íconos: abre con lo guardado y se actualiza por detrás */
async function datos(e, q) {
  const c = await caches.open(DATOS), h = await c.match(q);
  const red = fetch(q).then(async (r) => {
    if (r.ok && !(h && h.headers.get("etag") && h.headers.get("etag") === r.headers.get("etag"))) await c.put(q, r.clone());
    return r;
  });
  if (h) { e.waitUntil(red.catch(() => {})); return h; }
  return red;
}

/* Ciudad 3D: muchos archivos chicos que no cambian, con un tope para no llenar el celular */
let nuevosCiudad = 0;
async function ciudad(e, q) {
  const c = await caches.open(CIUDAD), h = await c.match(q);
  if (h) return h;
  const r = await fetch(q);
  if (r.ok) {
    await c.put(q, r.clone());
    if (++nuevosCiudad >= 40) { nuevosCiudad = 0; e.waitUntil(recortarCiudad()); }
  }
  return r;
}
async function recortarCiudad() {
  const c = await caches.open(CIUDAD), ks = await c.keys();
  let total = 0;
  for (let i = ks.length - 1; i >= 0; i--) {
    const r = await c.match(ks[i]);
    if (!r) continue;
    total += +(r.headers.get("content-length") || 0) || (await r.clone().blob()).size;
    if (total > TOPE_CIUDAD) await c.delete(ks[i]);
  }
}

self.addEventListener("fetch", (e) => {
  const q = e.request;
  if (q.method !== "GET") return;
  const u = new URL(q.url);
  if (u.origin !== location.origin) return;
  const p = u.pathname;
  if (p.startsWith("/api/") || p === "/sw.js") return;
  if (q.mode === "navigate") e.respondWith(pagina(e, u));
  else if (p.startsWith("/_next/static/")) e.respondWith(archivoFijo(q));
  else if (p.startsWith("/ciudad/")) e.respondWith(ciudad(e, q));
  else if (p.startsWith("/data/") || p.startsWith("/iconos/") || p.startsWith("/mapa-mini")) e.respondWith(datos(e, q));
});

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data.json(); } catch {}
  e.waitUntil(self.registration.showNotification(d.titulo || MARCA, { body: d.cuerpo || "", icon: "/iconos/192.png", badge: "/iconos/insignia.png", data: { url: d.enlace || "/inicio" }, tag: d.tag }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/inicio";
  e.waitUntil((async () => {
    const l = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of l) if ("focus" in c) { await c.focus(); c.navigate(url); return; }
    await clients.openWindow(url);
  })());
});
`;

export function cuerpoSW(version: string, marca: string) {
  return FUENTE.replaceAll("__VJ__", JSON.stringify(version)).replaceAll("__MARCAJ__", JSON.stringify(marca)).replaceAll("__V__", version).replaceAll("__MARCA__", marca);
}
