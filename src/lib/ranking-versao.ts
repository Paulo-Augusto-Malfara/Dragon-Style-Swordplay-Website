/**
 * As duas leituras dos rankings, compartilhadas pelo Ranking Geral e pelo
 * Ranking por Classe.
 *
 * Vive aqui, e não em cada página, porque o rótulo, a explicação e o valor
 * padrão têm que bater nas duas: se uma página chamasse de "Ativos" e a outra
 * de "Na Ativa", seriam duas coisas diferentes aos olhos de quem lê.
 *
 * Quem decide se alguém está ativo é o banco, no `status_ativo` de dMembros,
 * recalculado por `atualizar_status_ativo_por_frequencia()` a cada treino
 * fechado, reaberto ou excluído. Aqui só se filtra pelo que já veio decidido.
 */
export const VERSOES = {
  ativa: { label: "Na Ativa", dica: "apenas membros ativos" },
  legado: { label: "Legado", dica: "todos os membros que já passaram pelo clã" },
} as const;

export type Versao = keyof typeof VERSOES;

/**
 * "ativa" é o padrão porque quem abre um ranking quer saber como está a
 * disputa hoje, não a soma de tudo que já houve. O Legado continua a um
 * toque de distância.
 */
export function versaoDaUrl(url: URL): Versao {
  const pedida = url.searchParams.get("versao");
  return pedida !== null && pedida in VERSOES ? (pedida as Versao) : "ativa";
}
