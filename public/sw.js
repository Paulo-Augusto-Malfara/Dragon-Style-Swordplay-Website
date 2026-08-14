/* Dragon Style - service worker
 *
 * HTML: rede primeiro, com prazo. Passou de LIMITE_MS sem resposta, entrega o
 *   que houver em cache e deixa a rede terminar por fora pra atualizar.
 * Estático (css/js/img/fonte): cache-first, porque o Astro versiona o nome do arquivo.
 *
 * Nunca guarda em cache:
 *  - rotas privadas (admin, login), senão os dados de um membro ficariam
 *    visíveis pro próximo que abrisse o app num aparelho compartilhado;
 *  - respostas do Supabase, que são cross-origin e não passam no teste type === 'basic'.
 */
const VERSION = "ds-v2";
const OFFLINE = "/offline.html";

// Quanto a tela espera a rede antes de aceitar o cache. Não é o tempo do
// pedido: a rede continua correndo e o que ela trouxer entra no cache do mesmo
// jeito. É só até quando vale a pena olhar pra uma tela parada.
const LIMITE_MS = 2500;

/* Casa com /admin/... e /auth/..., mas não com /agenda.
 *
 * /dashboard saiu daqui de propósito. Ele não tem `prerender = false`: o HTML é
 * construído no build e não contém dado nenhum de membro, tudo vem do
 * MemberDashboard.svelte depois, falando com o Supabase pelo navegador. Guardar
 * essa casca não expõe nada em aparelho compartilhado, e faz a ficha abrir na
 * hora em vez de esperar o HTML.
 *
 * /admin e /auth continuam fora, e não podem sair: aqueles são SSR de verdade,
 * o dado vai dentro do HTML. Se um dia /dashboard ganhar `prerender = false`,
 * ele volta pra cá junto. */
const PRIVADO = /^\/(admin|auth)(\/|$)/;

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

  /* Documento é tudo que não termina em extensão de arquivo estático.
   *
   * Antes isto era `req.mode === "navigate" || accept inclui text/html`, e o
   * ClientRouter derrubaria os dois testes: ele troca de página com um `fetch`
   * comum, que não tem mode "navigate" e manda `Accept: * / *`. Cada navegação
   * cairia no ramo cache-first ali embaixo, e o HTML ficaria congelado no
   * aparelho até a próxima troca de VERSION. Nada disso apareceria em
   * desenvolvimento, onde o service worker é desinstalado de propósito.
   *
   * `.json` está fora da lista de propósito: /busca.json é dado, e cache-first
   * nele deixaria o índice da busca velho.
   */
  const ARQUIVO =
    /\.(css|m?js|png|jpe?g|webp|avif|gif|svg|ico|woff2?|ttf|webmanifest|xml|txt)$/i;

  if (!ARQUIVO.test(url.pathname)) {
    const daRede = fetch(req).then((res) => {
      const copia = res.clone();
      caches.open(VERSION).then((c) => c.put(req, copia));
      return res;
    });
    // A rede segue correndo mesmo depois de o cache já ter respondido, e o que
    // ela trouxer atualiza o cache pra próxima vez. Este catch existe só pra
    // essa corrida perdida não virar "unhandled rejection" no console.
    daRede.catch(() => {});

    // Sem isto, rede ruim deixa a tela parada até o navegador desistir sozinho,
    // que é o que dá a sensação de travamento. Devolve undefined quando não há
    // nada em cache ainda, e aí o passo seguinte volta a esperar a rede.
    const prazo = new Promise((resolve) => setTimeout(resolve, LIMITE_MS)).then(() =>
      caches.match(req),
    );

    e.respondWith(
      Promise.race([daRede, prazo])
        .then((res) => res || daRede)
        .catch(() =>
          caches.match(req).then((hit) => {
            if (hit) return hit;
            // A página de offline só serve pra quem está trocando de página.
            // Devolver HTML pra um pedido de dado (o /busca.json) faria o
            // `resposta.json()` estourar em vez de falhar limpo.
            if (req.mode === "navigate") return caches.match(OFFLINE);
            throw new Error("sem rede");
          }),
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
