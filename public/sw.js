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

/* Notificação de aprovação pendente.
 *
 * O corpo vem como JSON da função de borda. Se vier vazio ou quebrado, ainda
 * assim mostra alguma coisa: o navegador é obrigado a exibir uma notificação
 * depois de receber um push, e um push silencioso derruba a permissão do site
 * com o tempo. Melhor uma genérica do que nenhuma.
 */
self.addEventListener("push", (e) => {
  let dados = {};
  try {
    dados = e.data ? e.data.json() : {};
  } catch {
    dados = {};
  }

  const titulo = dados.titulo || "Dragon Style";
  const opcoes = {
    body: dados.corpo || "Tem coisa esperando aprovação no painel.",
    icon: "/pwa/icon-192.png",
    badge: "/pwa/icon-192.png",
    // Mesma tag pra fila: dois envios seguidos empilhariam duas notificações
    // dizendo a mesma coisa, e a segunda substitui a primeira.
    tag: dados.tag || "ds-aprovacao",
    data: { url: dados.url || "/admin/moderacao" },
  };

  e.waitUntil(self.registration.showNotification(titulo, opcoes));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const destino = (e.notification.data && e.notification.data.url) || "/admin/moderacao";

  // Reaproveita uma aba do site se já houver uma aberta, em vez de abrir a
  // terceira janela do app no celular.
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
      for (const j of janelas) {
        if (new URL(j.url).origin === self.location.origin && "focus" in j) {
          j.navigate(destino);
          return j.focus();
        }
      }
      return self.clients.openWindow(destino);
    }),
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
