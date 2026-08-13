/**
 * Sincroniza os hashes de script inline do CSP com o que o build realmente
 * gerou.
 *
 * Por que existe: a CSP é `script-src 'self' 'sha256-...'`, sem
 * 'unsafe-inline'. O Astro embute os scripts pequenos direto no HTML em vez de
 * emitir arquivo, então cada `<script>` novo numa página vira um hash novo, e
 * sem ele no vercel.json o navegador bloqueia o script em produção calado. Não
 * quebra o build, não quebra o dev (que não tem CSP), só quebra no ar.
 *
 * Os três hashes que já estavam lá foram colados à mão uma vez. Isso não escala
 * e nem sobrevive a um upgrade do Astro, que muda o runtime embutido.
 *
 * Uso:
 *   node scripts/csp-hashes.mjs          reescreve o vercel.json
 *   node scripts/csp-hashes.mjs --check  só reprova se estiver desatualizado
 *
 * Roda depois do `astro build`, porque lê o HTML de .vercel/output/static.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RAIZ = ".vercel/output/static";
const CONFIG = "vercel.json";
const checando = process.argv.includes("--check");

function htmls(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const caminho = join(dir, e.name);
    if (e.isDirectory()) return htmls(caminho);
    return e.name.endsWith(".html") ? [caminho] : [];
  });
}

const hashes = new Set();
for (const arquivo of htmls(RAIZ)) {
  const html = readFileSync(arquivo, "utf8");
  // Só o que não tem src: script com src é coberto por 'self'.
  for (const m of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/\ssrc=/.test(m[1]) || m[2] === "") continue;
    hashes.add(`'sha256-${createHash("sha256").update(m[2], "utf8").digest("base64")}'`);
  }
}

const ordenados = [...hashes].sort();
const config = JSON.parse(readFileSync(CONFIG, "utf8"));
const regra = config.headers
  .flatMap((h) => h.headers)
  .find((h) => h.key === "Content-Security-Policy");

if (!regra) throw new Error("vercel.json não tem Content-Security-Policy");

const atual = regra.value;
const novo = atual.replace(
  /script-src [^;]+;/,
  `script-src 'self' ${ordenados.join(" ")} https://vercel.live;`,
);

if (atual === novo) {
  console.log(`ok: ${ordenados.length} hashes de script inline já no CSP`);
  process.exit(0);
}

if (checando) {
  const tinha = [...atual.matchAll(/'sha256-[^']+'/g)].map((m) => m[0]);
  console.error("CSP desatualizado. Rode: node scripts/csp-hashes.mjs");
  console.error(`  no vercel.json: ${tinha.length} hashes`);
  console.error(`  no build:       ${ordenados.length} hashes`);
  for (const h of ordenados) if (!tinha.includes(h)) console.error(`  faltando ${h}`);
  for (const h of tinha) if (!ordenados.includes(h)) console.error(`  sobrando ${h}`);
  process.exit(1);
}

regra.value = novo;
writeFileSync(CONFIG, JSON.stringify(config, null, 2) + "\n");
console.log(`vercel.json atualizado: ${ordenados.length} hashes de script inline`);
