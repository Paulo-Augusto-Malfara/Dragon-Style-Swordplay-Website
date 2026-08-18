/**
 * Prova o motor de chaveamento de `src/lib/torneio.ts`.
 *
 * Chave de torneio é a parte do painel em que o defeito não aparece na tela: um
 * bye no lugar errado, uma revanche no suíço ou um vencedor avançando para a
 * chave da classe errada só são percebidos no dia do torneio, com as pessoas
 * esperando. Aqui isso quebra o `npm test` antes de sair da máquina.
 *
 * Roda com `--experimental-strip-types` porque importa o `.ts` direto, sem
 * build. Ver o script `test` do package.json.
 */
import assert from "node:assert/strict";
import {
  FASE_GRANDE_FINAL,
  chaveEliminatoria,
  chaveEliminatoriaDupla,
  partidaDesempate,
  precisaDesempate,
  classificacao,
  gerarChaves,
  rodadaSuico,
  todosContraTodos,
  vitoriasNecessarias,
} from "../src/lib/torneio.ts";

const equipes = (n, idClasse = null) =>
  Array.from({ length: n }, (_, i) => ({ id_equipe: i + 1, seed: i + 1, id_classe: idClasse }));

const MELHOR_DE = { padrao: 3, semifinal: 5, final: 7 };

/* ---- melhor de N ---- */

assert.equal(vitoriasNecessarias(1), 1);
assert.equal(vitoriasNecessarias(3), 2);
assert.equal(vitoriasNecessarias(5), 3);
assert.equal(vitoriasNecessarias(7), 4);

/* ---- eliminatória: número certo de partidas, fases e melhor de por fase ---- */

{
  const chave = chaveEliminatoria(equipes(8), MELHOR_DE);
  assert.equal(chave.length, 7, "8 equipes dão 4 + 2 + 1 partidas");

  const porFase = (f) => chave.filter((p) => p.fase === f);
  assert.equal(porFase("Quartas de final").length, 4);
  assert.equal(porFase("Semifinal").length, 2);
  assert.equal(porFase("Final").length, 1);

  assert.ok(porFase("Quartas de final").every((p) => p.melhor_de === 3));
  assert.ok(porFase("Semifinal").every((p) => p.melhor_de === 5));
  assert.equal(porFase("Final")[0].melhor_de, 7);

  // O 1 e o 2 só podem se encontrar na final: é o que a ordem de seeds garante.
  const primeira = porFase("Quartas de final");
  assert.deepEqual(
    primeira.map((p) => [p.id_equipe_a, p.id_equipe_b]),
    [
      [1, 8],
      [4, 5],
      [2, 7],
      [3, 6],
    ],
  );

  // Toda partida menos a final aponta para uma seguinte, e nenhuma vaga da
  // rodada seguinte recebe dois donos.
  const final = porFase("Final")[0];
  assert.equal(final.proxima, null);
  const vagas = new Set();
  for (const p of chave) {
    if (p === final) continue;
    assert.ok(p.proxima !== null && p.proxima_vaga !== null, "só a final fica sem seguinte");
    const vaga = `${p.proxima}${p.proxima_vaga}`;
    assert.ok(!vagas.has(vaga), `vaga ${vaga} disputada por duas partidas`);
    vagas.add(vaga);
  }
  assert.equal(vagas.size, 6, "3 partidas seguintes com 2 vagas cada");
}

/* ---- eliminatória com bye: 6 equipes numa chave de 8 ---- */

{
  const chave = chaveEliminatoria(equipes(6), MELHOR_DE);
  assert.equal(chave.length, 7, "a chave é sempre de tamanho potência de 2");

  const primeira = chave.filter((p) => p.fase === "Quartas de final");
  const byes = primeira.filter((p) => p.id_equipe_b === null);
  assert.equal(byes.length, 2, "6 equipes numa chave de 8 dão 2 byes");

  // Bye nasce decidido, senão o torneio nunca fecha: ninguém lança placar de
  // uma partida que não aconteceu.
  for (const p of byes) {
    assert.equal(p.id_equipe_vencedora, p.id_equipe_a);
  }
  // E o bye vai para os melhores seeds, não para quem calhar.
  assert.deepEqual(byes.map((p) => p.id_equipe_a).sort(), [1, 2]);

  // Quem passou de bye já aparece na semifinal, sem ninguém clicar em nada.
  const semis = chave.filter((p) => p.fase === "Semifinal");
  const naSemi = semis.flatMap((p) => [p.id_equipe_a, p.id_equipe_b]).filter((x) => x !== null);
  assert.deepEqual(naSemi.sort(), [1, 2]);

  // Nunca cai bye contra bye: seria uma partida sem nenhum dos dois lados.
  assert.ok(!primeira.some((p) => p.id_equipe_a === null && p.id_equipe_b === null));

  // 5 equipes: 3 byes, mesma regra.
  const cinco = chaveEliminatoria(equipes(5), MELHOR_DE);
  assert.equal(cinco.filter((p) => p.fase === "Quartas de final" && p.id_equipe_b === null).length, 3);
}

/* ---- classificação só conta partida decidida ---- */

{
  const linhas = classificacao(equipes(3), [
    { id_equipe_a: 1, id_equipe_b: 2, id_equipe_vencedora: 1, pontos_a: 2, pontos_b: 0 },
    // Em andamento: tem placar, mas ainda não tem vencedor. Não pode contar,
    // senão o pareamento da rodada seguinte muda no meio da rodada atual.
    { id_equipe_a: 3, id_equipe_b: 2, id_equipe_vencedora: null, pontos_a: 1, pontos_b: 0 },
  ]);
  const por = Object.fromEntries(linhas.map((l) => [l.id_equipe, l]));
  assert.equal(por[1].vitorias, 1);
  assert.equal(por[1].saldo, 2);
  assert.equal(por[2].derrotas, 1);
  assert.equal(por[3].jogos, 0, "a partida em andamento não entrou");
  assert.equal(linhas[0].id_equipe, 1, "o vencedor lidera");
}

/* ---- suíço: ninguém repete adversário e o bye circula ---- */

{
  const time = equipes(5);
  const feitas = [];
  const byes = [];

  for (let rodada = 1; rodada <= 3; rodada++) {
    const novas = rodadaSuico(time, feitas, 3, rodada);
    assert.equal(novas.length, 3, "5 equipes dão 2 partidas e 1 bye por rodada");
    assert.ok(novas.every((p) => p.fase === `Rodada ${rodada}`));

    // Todo mundo entra na rodada, exatamente uma vez.
    const entraram = novas.flatMap((p) => [p.id_equipe_a, p.id_equipe_b]).filter((x) => x !== null);
    assert.deepEqual([...entraram].sort(), [1, 2, 3, 4, 5]);

    const bye = novas.find((p) => p.id_equipe_b === null);
    assert.equal(bye.id_equipe_vencedora, bye.id_equipe_a, "bye do suíço já nasce decidido");
    byes.push(bye.id_equipe_a);

    // Joga a rodada: vence sempre o menor id, para a tabela ficar desigual e o
    // pareamento por pontuação ter o que ordenar.
    for (const p of novas) {
      if (p.id_equipe_b === null) {
        feitas.push({ ...p, pontos_a: 0, pontos_b: 0 });
        continue;
      }
      const vencedor = Math.min(p.id_equipe_a, p.id_equipe_b);
      feitas.push({
        id_equipe_a: p.id_equipe_a,
        id_equipe_b: p.id_equipe_b,
        id_equipe_vencedora: vencedor,
        pontos_a: p.id_equipe_a === vencedor ? 2 : 0,
        pontos_b: p.id_equipe_b === vencedor ? 2 : 0,
      });
    }
  }

  const confrontos = feitas
    .filter((p) => p.id_equipe_b !== null)
    .map((p) => [p.id_equipe_a, p.id_equipe_b].sort().join("-"));
  assert.equal(new Set(confrontos).size, confrontos.length, "houve revanche no suíço");
  assert.equal(new Set(byes).size, byes.length, "a mesma equipe folgou duas vezes");
}

/* ---- todos contra todos: cada par exatamente uma vez ---- */

{
  const chave = todosContraTodos(equipes(5), 3);
  const jogos = chave.filter((p) => p.id_equipe_b !== null);
  assert.equal(jogos.length, 10, "5 equipes dão 5 * 4 / 2 confrontos");

  const pares = jogos.map((p) => [p.id_equipe_a, p.id_equipe_b].sort().join("-"));
  assert.equal(new Set(pares).size, 10, "algum confronto saiu repetido");

  // Ímpar: uma folga por rodada, e cada equipe folga uma vez só.
  const folgas = chave.filter((p) => p.id_equipe_b === null);
  assert.equal(folgas.length, 5);
  assert.deepEqual(folgas.map((p) => p.id_equipe_a).sort(), [1, 2, 3, 4, 5]);
  assert.ok(folgas.every((p) => p.id_equipe_vencedora === p.id_equipe_a));

  assert.equal(new Set(chave.map((p) => p.fase)).size, 5, "5 equipes jogam em 5 rodadas");

  // Par não gera folga nenhuma.
  const quatro = todosContraTodos(equipes(4), 3);
  assert.equal(quatro.length, 6);
  assert.ok(quatro.every((p) => p.id_equipe_b !== null));
}

/* ---- torneio de classes: uma chave por classe, sem cruzar os índices ---- */

{
  const daClasse1 = equipes(4, 1);
  const daClasse2 = equipes(2, 2).map((e) => ({ ...e, id_equipe: e.id_equipe + 100 }));
  // Classe com uma pessoa só: não vira chave, ela é campeã sem jogar.
  const daClasse3 = [{ id_equipe: 200, seed: 1, id_classe: 3 }];

  const chave = gerarChaves({
    formato: "eliminatoria",
    equipes: [...daClasse1, ...daClasse2, ...daClasse3],
    melhorDe: MELHOR_DE,
    porClasse: true,
  });

  assert.equal(chave.length, 3 + 1, "4 equipes dão 3 partidas, 2 equipes dão 1");
  assert.ok(!chave.some((p) => p.id_classe === 3), "classe de uma pessoa só não gera partida");

  // O deslocamento dos índices é o ponto: sem ele o vencedor da classe 2
  // avançaria para dentro da chave da classe 1.
  for (const p of chave) {
    if (p.proxima === null) continue;
    assert.equal(
      chave[p.proxima].id_classe,
      p.id_classe,
      "partida apontando para a chave de outra classe",
    );
  }

  const finais = chave.filter((p) => p.proxima === null);
  assert.deepEqual(finais.map((p) => p.id_classe).sort(), [1, 2], "uma final por classe");
  assert.ok(finais.every((p) => p.melhor_de === MELHOR_DE.final));
}

/* ---- eliminatória dupla (repescagem) ---- */

/**
 * Joga a chave inteira com a regra "quem tem o menor id vence" e devolve quantas
 * partidas foram de fato jogadas e quantas derrotas cada equipe levou. Vale como
 * teste porque a promessa da eliminatória dupla é exatamente essa: ninguém sai
 * antes da segunda derrota. Percorrer o array em ordem basta, porque toda
 * partida é criada depois das que desaguam nela.
 */
function simular(chave) {
  const derrotas = new Map();
  let jogadas = 0;

  for (const p of chave) {
    assert.ok(p.id_equipe_a !== null, `partida ${p.fase} sem ninguém no lado A`);
    if (p.id_equipe_vencedora === null) {
      assert.ok(p.id_equipe_b !== null, `partida ${p.fase} de um lado só sem ser bye`);
      jogadas++;
      const perdedor = Math.max(p.id_equipe_a, p.id_equipe_b);
      derrotas.set(perdedor, (derrotas.get(perdedor) ?? 0) + 1);
      p.id_equipe_vencedora = Math.min(p.id_equipe_a, p.id_equipe_b);
    }
    if (p.proxima !== null) {
      chave[p.proxima][p.proxima_vaga === "a" ? "id_equipe_a" : "id_equipe_b"] =
        p.id_equipe_vencedora;
    }
    if (p.proxima_derrota != null) {
      const perdedor = p.id_equipe_a === p.id_equipe_vencedora ? p.id_equipe_b : p.id_equipe_a;
      chave[p.proxima_derrota][
        p.proxima_derrota_vaga === "a" ? "id_equipe_a" : "id_equipe_b"
      ] = perdedor;
    }
  }
  return { derrotas, jogadas };
}

for (const n of [2, 3, 5, 6, 8, 11, 16]) {
  const tamanho = 2 ** Math.ceil(Math.log2(n));
  const chave = chaveEliminatoriaDupla(equipes(n), MELHOR_DE);

  // Uma partida por equipe eliminada (duas derrotas cada) mais a final, e os
  // byes da primeira rodada, que aparecem mas não se joga.
  assert.equal(chave.length, 2 * n - 2 + (tamanho - n), `total de partidas com ${n} equipes`);

  const finais = chave.filter((p) => p.proxima === null);
  assert.equal(finais.length, 1, `uma grande final só com ${n} equipes`);
  assert.equal(finais[0].fase, FASE_GRANDE_FINAL);
  assert.equal(finais[0].melhor_de, MELHOR_DE.final);

  // Toda rota, de vencedor e de perdedor, aponta pra frente. É o que garante
  // que dá pra resolver a chave numa passada só, aqui e na tela.
  chave.forEach((p, i) => {
    if (p.proxima !== null) assert.ok(p.proxima > i, "rota de vencedor apontando pra trás");
    if (p.proxima_derrota != null) {
      assert.ok(p.proxima_derrota > i, "rota de perdedor apontando pra trás");
    }
  });

  const { derrotas, jogadas } = simular(chave);
  assert.equal(jogadas, 2 * n - 2, `partidas jogadas com ${n} equipes`);
  assert.equal(derrotas.get(1) ?? 0, 0, "quem vence tudo não pode ter derrota");
  for (let e = 2; e <= n; e++) {
    assert.equal(derrotas.get(e), 2, `equipe ${e} tinha que sair na segunda derrota`);
  }
}

{
  // 5 equipes é o caso que mais dói: 3 byes na primeira rodada esvaziam o
  // começo da repescagem, e sem descartar as partidas vazias sobrariam partidas
  // de um lado só, que ninguém consegue lançar porque não têm placar.
  const chave = chaveEliminatoriaDupla(equipes(5), MELHOR_DE);
  const byes = chave.filter((p) => p.id_equipe_vencedora !== null);
  assert.equal(byes.length, 3, "5 equipes numa chave de 8 dão 3 byes");
  assert.ok(
    byes.every((p) => p.proxima_derrota == null),
    "quem passou sem jogar não manda perdedor pra repescagem",
  );

  const rodadas = [...new Set(chave.map((p) => p.fase))].filter((f) => f.startsWith("Repescagem"));
  assert.ok(
    !rodadas.includes("Repescagem, rodada 2") || rodadas.includes("Repescagem, rodada 1"),
    "a numeração da repescagem não pode começar na rodada 2",
  );
  assert.ok(
    chave.some((p) => p.fase === "Final da repescagem"),
    "falta a final da repescagem",
  );
  assert.equal(
    chave.filter((p) => p.fase === "Final da repescagem").length,
    1,
    "só existe uma final da repescagem",
  );
}

{
  // O desempate: quem venceu a grande final vindo da repescagem deixou os dois
  // com uma derrota, e aí ninguém foi eliminado ainda.
  const gf = { fase: FASE_GRANDE_FINAL, id_equipe_a: 1, id_equipe_b: 2, melhor_de: 7 };
  assert.equal(precisaDesempate({ ...gf, id_equipe_vencedora: 1 }), false);
  assert.equal(precisaDesempate({ ...gf, id_equipe_vencedora: 2 }), true);
  assert.equal(precisaDesempate({ ...gf, id_equipe_vencedora: null }), false);
  assert.equal(
    precisaDesempate({ ...gf, fase: "Final", id_equipe_vencedora: 2 }),
    false,
    "só a grande final da eliminatória dupla gera desempate",
  );

  const desempate = partidaDesempate({ ...gf, id_classe: null });
  assert.equal(desempate.id_equipe_a, 2, "quem venceu a grande final entra como A");
  assert.equal(desempate.id_equipe_b, 1);
  assert.equal(desempate.melhor_de, 7);
  assert.equal(desempate.proxima, null);
}

{
  // Torneio de classes com repescagem: os índices das duas chaves não podem se
  // cruzar, e agora isso vale também para a rota do perdedor.
  const chave = gerarChaves({
    formato: "eliminatoria_dupla",
    equipes: [...equipes(4, 1), ...equipes(3, 2).map((e) => ({ ...e, id_equipe: e.id_equipe + 10 }))],
    melhorDe: MELHOR_DE,
    porClasse: true,
  });

  assert.equal(chave.length, 6 + 5, "4 equipes dão 6 partidas, 3 equipes dão 4 mais um bye");
  for (const p of chave) {
    for (const destino of [p.proxima, p.proxima_derrota]) {
      if (destino === null || destino === undefined) continue;
      assert.equal(
        chave[destino].id_classe,
        p.id_classe,
        "partida apontando para a chave de outra classe",
      );
    }
  }
}

/* ---- recusas ---- */

assert.throws(() => chaveEliminatoria(equipes(1), MELHOR_DE), /pelo menos 2/);
assert.throws(() => todosContraTodos(equipes(1), 3), /pelo menos 2/);

console.log("test-torneio: ok");
