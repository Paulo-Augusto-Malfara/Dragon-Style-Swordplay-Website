/* Dragon Style - service worker
 *
 * HTML: network-first, cai pro cache só quando a rede falha (offline).
 * Estático (css/js/img/fonte): cache-first, porque o Astro versiona o nome do arquivo.
 *
 * Nunca guarda em cache:
 *  - rotas privadas (ficha, admin, login), senão os dados de um membro ficariam
 *    visíveis pro próximo que abrisse o app num aparelho compartilhado;
 *  - respostas do Supabase, que são cross-origin e não passam no teste type === 'basic'.
 */
const VERSION = "ds-v1";
const OFFLINE = "/offline.html";

// Casa com /dashboard, /admin/... e /auth/..., mas não com /agenda.
const PRIVADO = /^\/(dashboard|admin|auth)(\/|$)/;

const CORE = [
  "/",
  OFFLINE,
  "/manifest.webmanifest",
  "/pwa/icon-192.png",
  "/assets/img/logo-ds-landscape.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(VERSION)
      // addAll é tudo-ou-nada: um 404 aqui derrubaria a instalação inteira.
      .then((c) => Promise.all(CORE.map((u) => c.add(u).catch(() => null))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase, Vercel Live, etc.
  if (PRIVADO.test(url.pathname)) return; // deixa passar direto pra rede

  const isDoc =
    req.mode === "navigate" ||
    (req.headers.get("accept") || "").includes("text/html");

  if (isDoc) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copia = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copia));
          return res;
        })
        .catch(() =>
          caches.match(req).then((hit) => hit || caches.match(OFFLINE)),
        ),
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((res) => {
          if (res.ok && res.type === "basic") {
            const copia = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copia));
          }
          return res;
        })
        .catch(() => hit);
    }),
  );
});
