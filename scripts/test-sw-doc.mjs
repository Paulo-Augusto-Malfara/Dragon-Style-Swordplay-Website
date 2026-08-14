/**
 * Roda o handler de fetch do service worker de verdade, com rede e cache
 * falsos, e confere os caminhos de uma navegação.
 *
 * Por que existe: o `respondWith` do documento decide o que a pessoa vê em toda
 * troca de página. Se ele resolver com undefined, ou mandar uma navegação pro
 * ramo cache-first, não é uma página que quebra, é o site inteiro, e só no
 * aparelho de quem já tem o service worker instalado. Nenhum build reprova por
 * isso, e em desenvolvimento não aparece, porque lá o worker é desinstalado.
 *
 * O sw.js roda dentro de um vm com `self`, `caches` e `fetch` de mentira. O
 * LIMITE_MS é reescrito pra 50ms só pra suíte não levar meio minuto; o valor
 * real é conferido à parte, no fim.
 *
 * Rode com `node scripts/test-sw-doc.mjs`.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";

const ORIGEM = "https://ds.test";
const LIMITE_TESTE = 50;
const fonte = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

const resposta = (corpo) => ({ corpo, ok: true, type: "basic", clone() { return this; } });

/** Como o navegador pede uma página ao clicar num link. */
const navegacao = (caminho) => ({
  method: "GET",
  url: `${ORIGEM}${caminho}`,
  mode: "navigate",
  headers: { get: () => "text/html" },
});

/** Como o ClientRouter pede a mesma página: fetch comum, sem "navigate" e sem accept. */
const transicao = (caminho) => ({
  method: "GET",
  url: `${ORIGEM}${caminho}`,
  mode: "cors",
  headers: { get: () => "*/*" },
});

/** Monta um service worker isolado e devolve o que ele responde ao pedido. */
function montar({ redeMs = 0, redeFalha = false, emCache = [] }) {
  const guardado = new Map([["/offline.html", resposta("offline")]]);
  for (const caminho of emCache) guardado.set(caminho, resposta("do cache"));

  const chave = (req) => new URL(typeof req === "string" ? ORIGEM + req : req.url).pathname;
  const eventos = {};

  const contexto = createContext({
    self: {
      addEventListener: (nome, fn) => (eventos[nome] = fn),
      location: { origin: ORIGEM },
      skipWaiting: () => {},
      clients: { claim: () => {} },
    },
    caches: {
      open: async () => ({ put: (req, res) => guardado.set(chave(req), res), add: async () => {} }),
      match: async (req) => guardado.get(chave(req)),
      keys: async () => [],
      delete: async () => {},
    },
    fetch: () =>
      new Promise((ok, falha) =>
        setTimeout(() => (redeFalha ? falha(new Error("sem rede")) : ok(resposta("da rede"))), redeMs),
      ),
    setTimeout,
    clearTimeout,
    URL,
    Promise,
    Error,
  });

  runInContext(fonte.replace(/const LIMITE_MS = \d+;/, `const LIMITE_MS = ${LIMITE_TESTE};`), contexto);
  assert.ok(eventos.fetch, "o sw.js não registrou handler de fetch");

  return {
    guardado,
    responder(req) {
      let entregue;
      eventos.fetch({ request: req, respondWith: (p) => (entregue = p) });
      return entregue;
    },
  };
}

const corpoDe = async (req, cenario) => {
  const sw = montar(cenario);
  const p = sw.responder(req);
  assert.ok(p, "o handler não chamou respondWith");
  const r = await p;
  assert.ok(r, "respondeu com undefined, a tela ficaria em branco");
  return r.corpo;
};

/* ---------- Os caminhos de uma navegação ---------- */

const casos = [
  ["rede rápida entrega a rede", navegacao("/agenda"), { emCache: ["/agenda"] }, "da rede"],
  ["rede lenta com cache entrega o cache", navegacao("/agenda"), { redeMs: LIMITE_TESTE * 6, emCache: ["/agenda"] }, "do cache"],
  ["rede lenta sem cache espera a rede", navegacao("/agenda"), { redeMs: LIMITE_TESTE * 6 }, "da rede"],
  ["rede caída com cache entrega o cache", navegacao("/agenda"), { redeFalha: true, emCache: ["/agenda"] }, "do cache"],
  ["rede caída sem cache entrega o offline", navegacao("/agenda"), { redeFalha: true }, "offline"],
  // O que o ClientRouter quebraria se o sw.js olhasse `mode`/`accept`: este
  // pedido cairia no ramo cache-first e devolveria "do cache" pra sempre.
  ["troca de página do ClientRouter vai pro ramo de documento", transicao("/agenda"), { emCache: ["/agenda"] }, "da rede"],
  ["/busca.json também é tratado como dado, não como arquivo", transicao("/busca.json"), { emCache: ["/busca.json"] }, "da rede"],
  // Arquivo versionado no nome continua saindo do cache sem tocar a rede.
  ["arquivo estático segue cache-first", transicao("/_astro/app.CaFe1234.css"), { emCache: ["/_astro/app.CaFe1234.css"] }, "do cache"],
  ["imagem segue cache-first", transicao("/assets/img/logo.png"), { emCache: ["/assets/img/logo.png"] }, "do cache"],
];

for (const [nome, req, cenario, esperado] of casos) {
  assert.equal(await corpoDe(req, cenario), esperado, nome);
}

// Pedido de dado sem rede e sem cache tem que falhar, e não devolver a página
// de offline: HTML dentro de um `resposta.json()` estoura com erro de sintaxe,
// que é bem mais difícil de entender do que uma falha de rede.
await assert.rejects(
  montar({ redeFalha: true }).responder(transicao("/busca.json")),
  "pedido de dado sem rede devolveu alguma coisa em vez de falhar",
);

// A rede continua correndo depois de o cache já ter respondido, e o que ela
// trouxer tem que entrar no cache. Sem isso a página nunca sairia da versão
// velha em quem está numa rede ruim de forma crônica.
const lento = montar({ redeMs: LIMITE_TESTE * 2, emCache: ["/agenda"] });
assert.equal((await lento.responder(navegacao("/agenda"))).corpo, "do cache");
await new Promise((r) => setTimeout(r, LIMITE_TESTE * 4));
assert.equal(
  lento.guardado.get("/agenda").corpo,
  "da rede",
  "a rede terminou e não atualizou o cache pra próxima vez",
);

// Rota privada não pode nem passar pelo handler: sem respondWith, o pedido vai
// direto pra rede e nada é guardado no aparelho.
assert.equal(
  montar({}).responder(navegacao("/admin/treinos/12")),
  undefined,
  "/admin passou pelo cache do service worker",
);

// O valor que vai pro ar, e não o de teste.
const real = Number(fonte.match(/const LIMITE_MS = (\d+);/)[1]);
assert.ok(real >= 1000 && real <= 5000, `LIMITE_MS fora do razoável: ${real}ms`);

console.log(`ok: ${casos.length + 3} caminhos do service worker conferidos (LIMITE_MS real ${real}ms)`);
