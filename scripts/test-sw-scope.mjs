/**
 * Checa a regex que decide o que o service worker NÃO pode cachear.
 * Um falso negativo aqui deixa a ficha de um membro no cache do aparelho.
 * Rode com `node scripts/test-sw-scope.mjs`.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Lê a regex do próprio sw.js, pra não haver duas cópias que divergem.
const src = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
const linha = src.match(/^const PRIVADO = (.+);$/m);
assert.ok(linha, "não achei a const PRIVADO em public/sw.js");
const PRIVADO = eval(linha[1]);

const privadas = [
  "/dashboard",
  "/dashboard/",
  "/admin",
  "/admin/doacoes",
  "/admin/treinos/123",
  "/auth/login",
  "/auth/callback",
];
const publicas = [
  "/",
  "/agenda",
  "/administracao",
  "/quem-somos",
  "/resumo-das-classes",
  "/mural-de-membros",
  "/ranking-geral",
  "/assets/img/logo-ds-landscape.png",
];

for (const p of privadas) {
  assert.equal(PRIVADO.test(p), true, `deveria ser privada e não é: ${p}`);
}
for (const p of publicas) {
  assert.equal(PRIVADO.test(p), false, `deveria ser pública e não é: ${p}`);
}

console.log(`ok: ${privadas.length} rotas privadas bloqueadas, ${publicas.length} públicas liberadas`);
