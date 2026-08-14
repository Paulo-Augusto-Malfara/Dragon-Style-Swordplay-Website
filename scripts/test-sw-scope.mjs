/**
 * Guarda as duas listas que decidem o que pode ser guardado fora do servidor:
 * a regex do service worker (cache no aparelho) e a regra de Cache-Control do
 * vercel.json (cache na borda da Vercel).
 *
 * São a mesma pergunta feita em dois lugares, "essa rota pode ser guardada?", e
 * um falso negativo em qualquer uma delas entrega dado de um membro pra outra
 * pessoa. Rode com `node scripts/test-sw-scope.mjs`.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/* ---------- 1. Cache no aparelho: a regex do service worker ---------- */

// Lê a regex do próprio sw.js, pra não haver duas cópias que divergem.
const src = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
const linha = src.match(/^const PRIVADO = (.+);$/m);
assert.ok(linha, "não achei a const PRIVADO em public/sw.js");
const PRIVADO = eval(linha[1]);

const privadas = ["/admin", "/admin/doacoes", "/admin/treinos/123", "/auth/login", "/auth/callback"];
const publicas = [
  "/",
  "/agenda",
  "/administracao",
  "/quem-somos",
  "/resumo-das-classes",
  "/mural-de-membros",
  "/ranking-geral",
  "/assets/img/logo-ds-landscape.png",
  // A casca de /dashboard é construída no build e não tem dado de membro
  // dentro, então pode ser guardada. Ver o comentário na PRIVADO do sw.js: se
  // essa página um dia virar SSR, ela precisa voltar pra lista de privadas.
  "/dashboard",
  "/dashboard/",
];

for (const p of privadas) {
  assert.equal(PRIVADO.test(p), true, `deveria ser privada e não é: ${p}`);
}
for (const p of publicas) {
  assert.equal(PRIVADO.test(p), false, `deveria ser pública e não é: ${p}`);
}

/* ---------- 2. Cache na borda: a regra do vercel.json ----------
 *
 * As páginas SSR públicas leem o banco pelo supabasePublic, o cliente anônimo
 * sem cookie, e nenhum layout personaliza nada por usuário: a resposta é a
 * mesma pra todo visitante, então a borda pode guardá-la. A lista lá é
 * explícita, e não um curinga, de propósito: esquecer uma rota custa lentidão,
 * incluir uma rota personalizada custaria vazamento. É isso que este teste
 * protege.
 */

const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));

const cacheados = config.headers.filter((h) =>
  h.headers.some((c) => c.key === "Vercel-CDN-Cache-Control"),
);
assert.ok(cacheados.length > 0, "nenhuma rota com Vercel-CDN-Cache-Control no vercel.json");

for (const regra of cacheados) {
  // O navegador tem que revalidar sempre. Se um s-maxage vazar pro
  // Cache-Control comum, o HTML fica preso no aparelho e no service worker, e
  // aí sim aparece ranking de ontem sem jeito de limpar.
  const doNavegador = regra.headers.find((c) => c.key === "Cache-Control");
  assert.ok(doNavegador, `${regra.source}: falta o Cache-Control do navegador`);
  assert.match(
    doNavegador.value,
    /max-age=0/,
    `${regra.source}: o Cache-Control do navegador tem que ser max-age=0`,
  );

  // A regra é uma alternância de rotas literais, tipo /(agenda|novidades). Um
  // curinga aqui pegaria /admin e /dashboard junto.
  assert.doesNotMatch(
    regra.source,
    /\.\*|\(\.|\/\(\?/,
    `${regra.source}: curinga na rota cacheada. Liste as rotas uma a uma.`,
  );
  for (const proibida of ["admin", "auth", "dashboard"]) {
    assert.doesNotMatch(
      regra.source,
      new RegExp(proibida),
      `${regra.source}: /${proibida} não pode ser guardada na borda, o HTML dela tem dado de membro`,
    );
  }
}

/* ---------- 3. O que torna o cache de borda seguro ----------
 *
 * A regra acima só é segura enquanto a resposta dessas páginas não depender de
 * quem pediu. Basta alguém pôr um "Olá, Fulano" no cabeçalho, ou ler a sessão
 * numa dessas páginas, pra borda passar a servir o HTML de um membro para o
 * visitante seguinte. Não é hipótese distante: o cabeçalho e o rodapé são
 * compartilhados, e quem mexer neles não vai lembrar desta regra de cache.
 *
 * Por isso a varredura é ampla de propósito, e não segue a cadeia de imports:
 * qualquer .astro do site público que leia sessão reprova aqui. Se um dia isso
 * for mesmo necessário, a saída é tirar a página da lista de cacheadas, e não
 * afrouxar este teste.
 */
const LEITURA_DE_SESSAO = /Astro\.cookies|Astro\.locals|createSupabaseServerClient|getSession|getUser\b/;

function astrosPublicos(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const caminho = join(dir, e.name);
    if (e.isDirectory()) return e.name === "admin" ? [] : astrosPublicos(caminho);
    return e.name.endsWith(".astro") ? [caminho] : [];
  });
}

const suspeitos = [];
for (const raiz of ["src/pages", "src/layouts", "src/components"]) {
  for (const arquivo of astrosPublicos(new URL(`../${raiz}`, import.meta.url).pathname.slice(1))) {
    if (LEITURA_DE_SESSAO.test(readFileSync(arquivo, "utf8"))) suspeitos.push(arquivo);
  }
}

assert.deepEqual(
  suspeitos,
  [],
  `página pública lendo sessão, e a borda guarda essas respostas por 60s:\n  ${suspeitos.join("\n  ")}\n` +
    `Se a personalização for mesmo necessária, tire a rota da lista de cache no vercel.json.`,
);

console.log(
  `ok: ${privadas.length} rotas privadas bloqueadas no aparelho, ${publicas.length} liberadas; ` +
    `${cacheados.length} regras de cache de borda conferidas, nenhuma página pública lê sessão`,
);
