import type { Versao } from "./ranking-versao";

/** Classe que existe pra liberar o veterano, não pra disputar posição. */
export const CLASSE_BASICO = 11;

/** Quantos treinos valem um nível de classe. */
export const TREINOS_POR_NIVEL = 4;

/**
 * Quanto falta pro próximo nível daquela classe, em casinhas.
 *
 * Confere contra o `nivel_por_classe` que veio do banco antes de responder: se
 * a regra mudar lá e a constante daqui ficar velha, some a barra em vez de
 * desenhar um progresso errado. Errar calado é pior do que não mostrar.
 *
 * Mora aqui pelo mesmo motivo de `calcularRanks`: três telas desenham esses
 * quadradinhos (Meu Perfil, a janela do olhinho e a edição de membro), e três
 * cópias da mesma conta divergem sem ninguém perceber.
 */
export function progressoDaClasse(c: {
  treinos_por_classe?: number | null;
  nivel_por_classe?: number | null;
}) {
  const treinos = c.treinos_por_classe ?? 0;
  const nivel = c.nivel_por_classe ?? 0;
  if (Math.floor(treinos / TREINOS_POR_NIVEL) !== nivel) return null;
  return { andados: treinos % TREINOS_POR_NIVEL, total: TREINOS_POR_NIVEL };
}

/** O mínimo de `v_ranking_por_classe` que a colocação precisa. */
export type LinhaClasse = {
  id_membro: number;
  id_classe: number;
  treinos_por_classe: number;
};

/**
 * A colocação de um membro em cada classe que ele treina.
 *
 * Vive aqui porque duas telas mostram esse número, o Meu Perfil e a janela de
 * perfil do ranking, e elas têm que concordar entre si e com a página do
 * Ranking por Classe. Eram duas cópias da mesma conta, e cópia de regra é o
 * tipo de coisa que só diverge depois que alguém já leu os dois números.
 *
 * A base é a mesma do Ranking por Classe, que abre em "Na Ativa": contar o clã
 * inteiro daria uma colocação que a lista aberta pelo link não confirma. Quem
 * não está na ativa é medido contra o Legado, que é onde ele de fato aparece,
 * e aí o link tem que levar pra lá; ver `versaoDoRank`.
 *
 * Empate divide a posição (dois em 3º, ninguém em 4º), que é como ranking de
 * competição sempre se comportou. A página do Ranking por Classe numera pela
 * ordem do array e nesse caso mostraria 3 e 4; a diferença só aparece com
 * empate, e inventar desempate aqui seria pior: a pessoa veria uma colocação
 * que nenhum critério visível na tela explica.
 */
export function calcularRanks(
  minhas: LinhaClasse[],
  todas: LinhaClasse[],
  idsAtivos: Set<number>,
  souAtivo: boolean,
) {
  const base = souAtivo ? todas.filter((t) => idsAtivos.has(t.id_membro)) : todas;
  const mapa = new Map<number, { posicao: number; total: number }>();

  for (const minha of minhas) {
    if (minha.id_classe === CLASSE_BASICO) continue;
    const daClasse = base.filter((t) => t.id_classe === minha.id_classe);
    if (daClasse.length === 0) continue;
    mapa.set(minha.id_classe, {
      posicao:
        daClasse.filter((t) => t.treinos_por_classe > minha.treinos_por_classe).length + 1,
      total: daClasse.length,
    });
  }

  return mapa;
}

/** A versão do ranking em que essa colocação foi medida, pro link não mentir. */
export const versaoDoRank = (souAtivo: boolean): Versao => (souAtivo ? "ativa" : "legado");

/**
 * O `?classe=` da URL do Ranking por Classe. Mora aqui porque quem monta esse
 * link (o Meu Perfil e a janela de perfil) e quem o lê (a própria página) têm
 * que usar a mesma regra: eram três cópias da mesma linha.
 */
export const slugDaClasse = (nome: string) =>
  nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
