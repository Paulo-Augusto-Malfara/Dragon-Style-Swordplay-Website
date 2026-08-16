/**
 * Checa o catálogo de equipamentos no HTML já construído.
 *
 * O filtro é o que a página tem de lógica, e ele roda em cima de atributos
 * data-* gerados no build. Um erro ali não quebra o build nem aparece no
 * console: o card só some do filtro, ou o clique abre nada. Este teste pega os
 * dois casos.
 *
 * O caso que mais preocupa é o clique morto: o card aponta pro dialog pelo
 * #hash, e se um id divergir o usuário clica e não acontece nada, calado.
 */
import { readFileSync } from "node:fs";

const HTML = readFileSync(".vercel/output/static/equipamentos/index.html", "utf8");
const erros = [];

const itens = [...HTML.matchAll(/<li class="eq-item"([^>]*)>/g)].map((m) => {
  const attr = (n) => (m[1].match(new RegExp(`data-${n}="([^"]*)"`)) || [, null])[1];
  return { cat: attr("cat"), maos: attr("maos"), classes: attr("classes"), busca: attr("busca") };
});

if (itens.length < 25) erros.push(`só ${itens.length} itens no catálogo, esperava 30`);

for (const [i, it] of itens.entries()) {
  for (const campo of ["cat", "maos", "classes", "busca"]) {
    if (!it[campo]) erros.push(`item ${i}: data-${campo} vazio ou ausente`);
  }
  // O select de mãos filtra por "uma"/"duas" dentro da string. Qualquer outro
  // valor faz o item sumir dos dois filtros sem ninguém perceber.
  if (it.maos && !/uma|duas/.test(it.maos)) {
    erros.push(`item ${i}: data-maos="${it.maos}" não casa com nenhuma opção do filtro`);
  }
  // A busca compara sem acento; se sobrar acento aqui, digitar sem acento não acha.
  if (it.busca && /[^\x00-\x7f]/.test(it.busca)) {
    erros.push(`item ${i}: data-busca ainda tem acento: "${it.busca}"`);
  }
}

// Clique morto: todo card tem que ter o dialog correspondente na página. Quem
// abre é o BaseLayout, casando o #hash da URL com o data-hash do <dialog>, então
// é esse par que precisa bater.
const alvos = [...HTML.matchAll(/<a class="eq-card"[^>]*href="#([^"]+)"/g)].map((m) => m[1]);
const dialogs = new Set(
  [...HTML.matchAll(/<dialog[^>]*data-hash="([^"]+)"/g)].map((m) => m[1]),
);
for (const a of alvos) if (!dialogs.has(a)) erros.push(`card "${a}" abre um dialog que não existe`);
if (alvos.length !== dialogs.size) {
  erros.push(`${alvos.length} cards para ${dialogs.size} dialogs`);
}

// Os chips de categoria têm que cobrir todas as categorias que os itens usam,
// senão existe item que nenhum filtro alcança.
const chips = new Set(
  // eq-chip no meio da lista de classes, não no começo: a aparência vem de
  // .chip, que vem antes dele no atributo.
  [...HTML.matchAll(/<button type="button" class="[^"]*\beq-chip\b[^"]*" data-cat="([^"]*)"/g)].map(
    (m) => m[1],
  ),
);
for (const cat of new Set(itens.map((i) => i.cat))) {
  if (!chips.has(cat)) erros.push(`categoria "${cat}" tem item mas não tem chip`);
}

// O select de classe precisa oferecer toda classe que aparece nos itens.
const opcoes = new Set([...HTML.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]));
for (const c of new Set(itens.flatMap((i) => i.classes.split(" ").filter(Boolean)))) {
  if (!opcoes.has(c)) erros.push(`classe "${c}" está num item mas não está no select`);
}

if (erros.length) {
  for (const e of erros) console.error("FALHA:", e);
  process.exit(1);
}

const porClasse = {};
for (const it of itens) for (const c of it.classes.split(" ").filter(Boolean)) porClasse[c] = (porClasse[c] ?? 0) + 1;
console.log(`ok: ${itens.length} equipamentos, ${dialogs.size} detalhes, ${chips.size - 1} categorias`);
console.log(`   por classe: ${Object.entries(porClasse).map(([c, n]) => `${c} ${n}`).join(", ")}`);
