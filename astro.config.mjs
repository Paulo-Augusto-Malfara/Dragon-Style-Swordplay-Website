import { defineConfig } from "astro/config";
import svelte from "@astrojs/svelte";
import sitemap from "@astrojs/sitemap";
import mdx from "@astrojs/mdx";
import vercel from "@astrojs/vercel";

// A árvore de dependências do sanitize-html, empacotada junto no build. Ver o
// comentário grande em `vite.ssr` abaixo, que explica por que é a árvore
// inteira e não só o pacote de cima.
const ARVORE_SANITIZE_HTML = [
  "sanitize-html",
  "dayjs",
  "deepmerge",
  "dom-serializer",
  "domelementtype",
  "domhandler",
  "domutils",
  "entities",
  "escape-string-regexp",
  "htmlparser2",
  "is-plain-object",
  "launder",
  "nanoid",
  "parse-srcset",
  "picocolors",
  "postcss",
  "source-map-js",
];

// Só no build. No `astro dev` o Vite passa esses pacotes pelo pipeline de ESM
// em vez de deixar o Node carregá-los, e o sanitize-html é CommonJS: os
// `require()` dele ficam sem definição e /novidades morre com "require is not
// defined". No desenvolvimento não existe rastreio de arquivos pra enganar,
// então empacotar não serve pra nada ali.
const EMPACOTANDO = process.argv.includes("build");

export default defineConfig({
  site: "https://swordplayds.com.br",
  // ponytail: output stays "static" (the default) -- the 40 Phase 1 pages don't need
  // a server. Only /admin/* and the two Supabase-backed public pages opt in via
  // `export const prerender = false`. The adapter is still required for those.
  adapter: vercel(),
  // expõe o dev server na rede local pra testar no celular sem digitar
  // `-- --host` toda vez. Só afeta `astro dev`; o build da Vercel ignora.
  server: { host: true },
  // Os redirects das páginas de equipamento antigas estão no vercel.json, não
  // aqui: o adaptador da Vercel gera uma rota inválida quando `redirects` do
  // Astro convive com o vercel.json deste projeto.
  integrations: [svelte(), sitemap(), mdx()],
  // Nenhum script embutido no HTML: todos viram arquivo, que a CSP já cobre
  // com 'self'. Ver o comentário no topo de scripts/csp-hashes.mjs.
  vite: {
    build: { assetsInlineLimit: 0 },
    // O sanitize-html é CommonJS e o htmlparser2 12, do qual ele depende, é
    // ESM puro. O carregador da Vercel não faz require() de ESM, então
    // /novidades caía com 500 em produção enquanto passava no dev, onde o Vite
    // empacota tudo. A saída é empacotar o sanitize-html junto no build.
    //
    // Mas tem que ser a árvore inteira, e não só ele. Empacotando só o pacote
    // de cima, os require() das dependências dele ficam apontando pra fora
    // como chamada dinâmica, que o rastreio de arquivos da Vercel não enxerga:
    // os pacotes deixam de ser copiados pra função e o 500 volta, agora
    // dizendo "módulo não encontrado". Foram dois deploys assim, um por
    // dependência.
    //
    // A lista é a árvore do sanitize-html, e ela envelhece a cada upgrade dele.
    // Quem avisa é scripts/test-funcao-vercel.mjs, que roda a função compilada
    // fora do repositório e falha se alguma rota parar de responder.
    ssr: {
      noExternal: EMPACOTANDO ? ARVORE_SANITIZE_HTML : [],
    },
  },
});
