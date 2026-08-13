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
});
