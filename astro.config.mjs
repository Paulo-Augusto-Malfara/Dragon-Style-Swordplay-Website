import { defineConfig } from "astro/config";
import svelte from "@astrojs/svelte";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  // ponytail: real production domain unknown, needed for sitemap.xml <loc> — confirm with user and update
  site: "https://dragonstyleswordplay.com.br",
  integrations: [svelte(), sitemap()],
});
