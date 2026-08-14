import { defineConfig } from "astro/config";
import svelte from "@astrojs/svelte";
import sitemap from "@astrojs/sitemap";
import mdx from "@astrojs/mdx";
import vercel from "@astrojs/vercel";

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
    // sanitize-html é CommonJS e depende do htmlparser2 12, que é ESM puro.
    // Fora do pacote, o Node da função tenta `require()` no ESM e derruba a
    // rota com 500: /novidades morria assim em produção e passava no dev,
    // porque no dev o Vite empacota tudo. Empacotado junto, o require some.
    ssr: { noExternal: ["sanitize-html"] },
  },
});
