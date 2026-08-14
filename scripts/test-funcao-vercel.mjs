/**
 * Roda a função compilada da Vercel FORA do repositório e pede as rotas SSR.
 *
 * Existe por causa de um 500 que só acontecia em produção. Na Vercel a função
 * recebe só os pacotes que o rastreio de arquivos copiou pra dentro dela; se um
 * `require` sobrar apontando pra um pacote que não foi copiado, a rota morre e
 * o build passa verde, porque nada disso aparece em tempo de compilação.
 *
 * A pegadinha é que rodar a função de dentro do repositório NÃO pega o defeito:
 * o Node não acha o pacote na pasta da função, sobe a árvore de diretórios e
 * encontra no node_modules do projeto, onde está tudo. Por isso aqui a função é
 * copiada pra pasta temporária do sistema antes de rodar, longe de qualquer
 * node_modules de cima. Foi assim que o mesmo 500 passou por dois deploys.
 *
 * Rode depois de `npm run build`. Precisa das variáveis do .env, porque as
 * rotas testadas consultam o banco.
 */
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FUNCAO = ".vercel/output/functions/_render.func";

// Uma rota SSR de cada dependência de risco: /novidades é a que usa o
// sanitize-html, as outras duas cobrem o caminho comum do Supabase.
const ROTAS = ["/novidades", "/ranking-por-classe?classe=viking", "/"];

assert.ok(existsSync(FUNCAO), `rode npm run build antes: ${FUNCAO} não existe`);

// O .env não é lido sozinho fora do Astro.
if (existsSync(".env")) {
  for (const linha of readFileSync(".env", "utf8").split("\n")) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
assert.ok(
  process.env.PUBLIC_SUPABASE_URL && process.env.PUBLIC_SUPABASE_ANON_KEY,
  "faltam PUBLIC_SUPABASE_URL e PUBLIC_SUPABASE_ANON_KEY (no .env ou no ambiente)",
);

const destino = mkdtempSync(join(tmpdir(), "ds-funcao-"));
try {
  cpSync(resolve(FUNCAO), join(destino, "func"), { recursive: true });
  const entry = pathToFileURL(join(destino, "func", "dist/server/entry.mjs"));
  const { default: handler } = await import(entry);

  const falhas = [];
  for (const rota of ROTAS) {
    let status;
    try {
      const res = await handler.fetch(new Request("https://swordplayds.com.br" + rota));
      status = res.status;
      await res.text();
    } catch (err) {
      falhas.push(`${rota}: exceção ${err.message.split("\n")[0]}`);
      continue;
    }
    if (status !== 200) falhas.push(`${rota}: ${status}`);
  }

  assert.equal(
    falhas.length,
    0,
    `rota SSR quebrada rodando fora do repositório (é o que a Vercel vai ver):\n  ${falhas.join("\n  ")}`,
  );
  console.log(`ok: ${ROTAS.length} rotas SSR respondem 200 com a função isolada`);
} finally {
  rmSync(destino, { recursive: true, force: true });
}
