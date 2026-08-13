/**
 * Guarda a leitura do mínimo de participantes das modalidades.
 *
 * Os casos abaixo são os requisitos reais das 9 modalidades cadastradas, cada
 * um com uma redação diferente. É a única lógica da página de modalidades que
 * pode errar em silêncio: filtro que devolve o número errado esconde jogo que
 * cabia, e ninguém percebe porque a página não acusa nada.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// A função é TypeScript de uma linha só; em vez de puxar um compilador pra
// dentro do teste, lemos a regex do próprio arquivo. Assim nunca existem duas
// cópias divergentes, que é a mesma regra do test-sw-scope.
const fonte = readFileSync(new URL("../src/lib/modalidades.ts", import.meta.url), "utf8");
const bruta = fonte.match(/const GENTE = \/(.+?)\/gi;/);
assert.ok(bruta, "não achei a regex GENTE em src/lib/modalidades.ts");
const GENTE = new RegExp(bruta[1], "gi");

const minimo = (requisitos) => {
  const numeros = [...requisitos.join(" ").matchAll(GENTE)].map((m) => Number(m[1]));
  return numeros.length ? Math.max(...numeros) : 0;
};

const casos = [
  [["- Ao menos 10 participantes;", "- Armas Variadas (Classes)."], 10],
  [["- Ao menos 4 participantes;", "- Clava única ou armas variadas."], 4],
  [["- 2 times com pelo menos 5 participantes, ou seja, pelo menos 10 participantes;"], 10],
  [["- Ter 3 times com pelo menos 5 combatentes cada (ao menos 15 pessoas);"], 15],
  [["- Ter 2 times com pelo menos 10 combatentes cada (ao menos 20 pessoas);"], 20],
  [["- Pelo menos 5 pessoas;"], 5],
  // "2 times" não é gente contada, e respawn em segundos não é gente nenhuma.
  [["- Ter 2 times;", "- Respawn de 10s."], 0],
  // Requisito escrito de um jeito novo cai em 0 de propósito: aparece em todos
  // os filtros em vez de sumir de todos.
  [["- Traga o que quiser."], 0],
  [[], 0],
];

for (const [requisitos, esperado] of casos) {
  const obtido = minimo(requisitos);
  assert.equal(
    obtido,
    esperado,
    `esperava ${esperado}, veio ${obtido} para: ${JSON.stringify(requisitos)}`,
  );
}

console.log(`ok: ${casos.length} redações de requisito lidas corretamente`);
