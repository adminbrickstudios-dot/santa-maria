/* Service worker: guarda el plano para que abra rápido y recibe notificaciones. */
const V = "sm-v2";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== V) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  if (u.pathname.startsWith("/data/") || u.pathname.startsWith("/_next/static/") || u.pathname.startsWith("/iconos/")) {
    e.respondWith(caches.open(V).then(async (c) => {
      const h = await c.match(e.request);
      if (h) return h;
      const r = await fetch(e.request);
      if (r.ok) c.put(e.request, r.clone());
      return r;
    }));
  } else if (e.request.mode === "navigate") {
    /* Si la red tarda, abre lo guardado y se actualiza por detrás */
    e.respondWith((async () => {
      const c = await caches.open(V), h = await c.match(u.pathname);
      const red = fetch(e.request).then((r) => { if (r.ok) c.put(u.pathname, r.clone()); return r; });
      if (!h) return red.catch(async () => (await c.match("/inicio")) || Response.error());
      return Promise.race([red.catch(() => h), new Promise((ok) => setTimeout(() => ok(h), 700))]);
    })());
  }
});
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data.json(); } catch {}
  e.waitUntil(self.registration.showNotification(d.titulo || "Santa María", { body: d.cuerpo || "", icon: "/iconos/192.png", badge: "/iconos/insignia.png", data: { url: d.enlace || "/inicio" }, tag: d.tag }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = e.notification.data?.url || "/inicio";
  e.waitUntil((async () => {
    const l = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of l) if ("focus" in c) { await c.focus(); c.navigate(url); return; }
    await clients.openWindow(url);
  })());
});
