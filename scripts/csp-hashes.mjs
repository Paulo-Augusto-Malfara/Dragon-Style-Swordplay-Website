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
 *
 * ATENÇÃO, e isto custou um bug em produção: o HTML estático NÃO é tudo. Toda
 * página com `export const prerender = false` (o admin inteiro, /agenda,
 * /modalidades, os rankings) é montada a cada pedido e nunca aparece em
 * .vercel/output/static. Os scripts embutidos dela ficavam invisíveis aqui, o
 * hash nunca entrava no CSP, e o navegador bloqueava calado só em produção: o
 * painel administrativo abria e ficava em "Carregando..." para sempre, porque
 * a ilha nunca hidratava. Em dev não acontece, porque dev não tem CSP.
 *
 * O que uma página SSR pode embutir e uma estática não é o script de diretiva
 * de hidratação (`client:load`, `client:visible`, ...). Esses cinco scripts
 * vivem no manifesto do bundle do servidor, então são lidos de lá, todos, sem
 * depender de qual página usa qual. Um upgrade do Astro que mude essas strings
 * gera hash novo automaticamente.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RAIZ = ".vercel/output/static";
const SERVIDOR = ".vercel/output/functions/_render.func/dist/server/entry.mjs";
const CONFIG = "vercel.json";
const checando = process.argv.includes("--check");

function htmls(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const caminho = join(dir, e.name);
    if (e.isDirectory()) return htmls(caminho);
    return e.name.endsWith(".html") ? [caminho] : [];
  });
}

const hash = (texto) =>
  `'sha256-${createHash("sha256").update(texto, "utf8").digest("base64")}'`;

const hashes = new Set();

for (const arquivo of htmls(RAIZ)) {
  const html = readFileSync(arquivo, "utf8");
  // Só o que não tem src: script com src é coberto por 'self'.
  for (const m of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/\ssrc=/.test(m[1]) || m[2] === "") continue;
    hashes.add(hash(m[2]));
  }
}

/**
 * Os scripts de diretiva de hidratação, lidos do manifesto do bundle do
 * servidor. São os únicos que uma página SSR embute e uma estática pode nunca
 * embutir, por isso não dá pra descobri-los varrendo só o HTML gerado.
 */
function diretivasDeHidratacao() {
  let bundle;
  try {
    bundle = readFileSync(SERVIDOR, "utf8");
  } catch {
    // Projeto sem nenhuma rota SSR não gera essa função. Nada a acrescentar.
    return [];
  }

  const inicio = bundle.indexOf('"clientDirectives":[');
  if (inicio < 0) {
    throw new Error(
      `não achei clientDirectives em ${SERVIDOR}. O formato do manifesto do ` +
        `Astro mudou: conferir e corrigir aqui, senão o CSP volta a bloquear ` +
        `a hidratação das páginas SSR em produção, sem erro nenhum no build.`,
    );
  }

  const trecho = bundle.slice(inicio, bundle.indexOf("]],", inicio) + 2);
  const pares = [
    ...trecho.matchAll(/\["(idle|load|visible|media|only)","((?:[^"\\]|\\.)*)"\]/g),
  ];

  if (pares.length === 0) {
    throw new Error(`achei clientDirectives em ${SERVIDOR} mas não consegui ler nenhuma.`);
  }

  return pares.map((p) => JSON.parse(`"${p[2]}"`));
}

for (const script of diretivasDeHidratacao()) hashes.add(hash(script));

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
