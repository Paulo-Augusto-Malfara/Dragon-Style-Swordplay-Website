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

/* O destaque "esta linha é você" tem que ser aceso pelo navegador, nunca vir
 * montado do servidor: o HTML do ranking fica 60s no cache de borda e é servido
 * igual pra todo visitante, então um `rk-eu` vindo pronto marcaria a linha de um
 * membro como sendo de outro, para todo mundo que abrisse a página nesse
 * minuto. O `data-membro` é o outro lado: sem ele o script não acha a linha e o
 * destaque nunca acende. */
const RANKING = "/ranking-por-classe?classe=viking";

// Uma rota SSR de cada dependência de risco: /novidades é a que usa o
// sanitize-html, as outras duas cobrem o caminho comum do Supabase.
// /admin/login entra por outro motivo, explicado em TRANSICAO logo abaixo.
const ROTAS = ["/novidades", RANKING, "/", "/admin/login"];

/* Quem pode e quem não pode ter transição de página.
 *
 * O ClientRouter é ligado por rota no BaseLayout, e o admin fica de fora de
 * propósito: lá as ilhas Svelte contam com onDestroy pra fechar canal de
 * Realtime, e trocar o DOM por baixo delas arrisca canal vazado bem na tela em
 * que três organizadores lançam presença junto. Uma regex no layout é fácil
 * demais de afrouxar sem perceber, então a decisão fica conferida aqui.
 */
const TRANSICAO = { "/": true, "/novidades": true, "/admin/login": false };
const MARCA = "/_astro/ClientRouter";

/* Quem é medido e quem não é.
 *
 * A audiência do site é gente de fora, e o painel é ferramenta de trabalho: a
 * visita do staff não é público, a URL de lá carrega id de treino, de membro e
 * de torneio, e o teto de eventos do plano é melhor gasto com visitante. A
 * decisão mora no mesmo teste de rota do ClientRouter, no BaseLayout, e é
 * justamente por isso que ela é conferida aqui junto: quem afrouxar aquela
 * regex por causa da transição levaria a medição junto sem perceber.
 */
const MEDIDO = { "/": true, "/novidades": true, "/admin/login": false };
const MARCA_MEDICAO = "<vercel-analytics";

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
    let html;
    try {
      const res = await handler.fetch(new Request("https://swordplayds.com.br" + rota));
      status = res.status;
      html = await res.text();
    } catch (err) {
      falhas.push(`${rota}: exceção ${err.message.split("\n")[0]}`);
      continue;
    }
    if (status !== 200) {
      falhas.push(`${rota}: ${status}`);
      continue;
    }

    if (rota === RANKING) {
      if (!html.includes("data-membro=")) {
        falhas.push(`${rota}: sem data-membro nas linhas, o destaque da sua linha nunca acende`);
      }
      // Procurado dentro de um atributo class, e não no HTML solto: o nome da
      // classe também aparece no CSS, e casar com ele reprovaria à toa.
      if (/class="[^"]*\brk-eu(["\s])/.test(html)) {
        falhas.push(
          `${rota}: o destaque "você" veio pronto do servidor. O cache de borda serviria ` +
            `essa marcação pra todo visitante. Ele tem que ser aceso pelo navegador.`,
        );
      }
    }

    const medido = MEDIDO[rota];
    if (medido !== undefined && html.includes(MARCA_MEDICAO) !== medido) {
      falhas.push(
        medido
          ? `${rota}: perdeu o <Analytics />, a página pública parou de ser medida`
          : `${rota}: ganhou o <Analytics />, e o painel não entra na medição de audiência`,
      );
    }

    const esperado = TRANSICAO[rota];
    if (esperado !== undefined && html.includes(MARCA) !== esperado) {
      falhas.push(
        esperado
          ? `${rota}: perdeu o ClientRouter, a navegação voltou a recarregar a página inteira`
          : `${rota}: ganhou o ClientRouter, e o admin tem que ficar fora das transições`,
      );
    }
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
