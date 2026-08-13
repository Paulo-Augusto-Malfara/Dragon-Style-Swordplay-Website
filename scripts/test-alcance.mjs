/**
 * Checa que toda página estática é alcançável navegando a partir da home.
 *
 * A IA de 2026 tirou as páginas de detalhe do menu (as 10 classes, as 6
 * categorias de arma) e passou a depender dos catálogos pra chegar nelas. Se
 * alguém mexer num catálogo e derrubar os links, a página não some nem dá erro:
 * ela simplesmente vira inalcançável, e isso não aparece em build nenhum. Foi
 * assim que /conquistas e /vestimentas ficaram sem um único link no site.
 *
 * Rode depois de `npm run build`.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const RAIZ = ".vercel/output/static";

// Rotas sem HTML estático (SSR ou sob login) e as que estão fora do menu de
// propósito, porque o conteúdo ainda não é real.
const IGNORAR = new Set([
  "/admin",
  "/dashboard",
  "/conquistas",
  "/vestimentas",
]);

assert.ok(existsSync(RAIZ), `rode npm run build antes: ${RAIZ} não existe`);

function paginas(dir = RAIZ, base = "") {
  const achadas = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      achadas.push(...paginas(join(dir, e.name), `${base}/${e.name}`));
    } else if (e.name === "index.html") {
      achadas.push(base || "/");
    }
  }
  return achadas;
}

const links = (rota) => {
  const arq = join(RAIZ, rota === "/" ? "" : rota, "index.html");
  if (!existsSync(arq)) return [];
  const html = readFileSync(arq, "utf8");
  return [...html.matchAll(/href="(\/[^"#?]*)"/g)]
    .map((m) => m[1].replace(/\/$/, "") || "/")
    .filter((h) => !/\.[a-z0-9]+$/i.test(h)); // fora assets
};

// A home é SSR (prerender = false), então não existe index.html estático pra
// servir de ponto de partida. Como nav e rodapé vêm do BaseLayout e portanto
// estão em toda página, qualquer estática responde a mesma pergunta: "saindo da
// navegação global, chega-se a tudo?".
const SEMENTE = "/quem-somos";
assert.ok(
  existsSync(join(RAIZ, SEMENTE, "index.html")),
  `a semente ${SEMENTE} não existe mais no build; escolha outra página estática`,
);

const vistas = new Set([SEMENTE]);
const fila = [SEMENTE];
while (fila.length) {
  for (const alvo of links(fila.shift())) {
    if (!vistas.has(alvo)) {
      vistas.add(alvo);
      fila.push(alvo);
    }
  }
}

const todas = paginas().filter((p) => !IGNORAR.has(p));
const perdidas = todas.filter((p) => !vistas.has(p));

console.log(`${todas.length} páginas estáticas, ${vistas.size} alcançadas a partir de ${SEMENTE}`);
assert.deepEqual(
  perdidas,
  [],
  `inalcançáveis navegando a partir de ${SEMENTE}: ${perdidas.join(", ")}`,
);
console.log("ok: nenhuma página órfã");
