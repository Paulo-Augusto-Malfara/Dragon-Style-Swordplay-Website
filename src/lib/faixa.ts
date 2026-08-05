// Mapa nome da faixa -> variável de cor (definidas em global.css).
//
// Qual faixa cada membro tem é regra de negócio e mora no banco: a coluna
// `nome_faixa` de `v_ranking_nivel_geral` já entrega o nome pronto. Aqui só se
// decide COMO pintar esse nome — a tabela de limiares (nível 1, 3, 7, 12, 18,
// 25, 35, 50) não é replicada no frontend de propósito, pra não existir uma
// segunda fonte da verdade que pode divergir do banco.
const CORES: Record<string, string> = {
  branca: "--faixa-branca",
  amarela: "--faixa-amarela",
  "azul claro": "--faixa-azul-claro",
  laranja: "--faixa-laranja",
  verde: "--faixa-verde",
  marrom: "--faixa-marrom",
  roxa: "--faixa-roxa",
  preta: "--faixa-preta",
};

/**
 * Devolve a cor CSS da faixa, ou null quando não há faixa pra mostrar.
 *
 * "Sem Faixa" (novatos, nível geral 0 — hoje 98 dos 173 membros) e qualquer
 * nome que o banco venha a criar caem no null, e quem chama simplesmente não
 * desenha o selo. É melhor não desenhar nada do que desenhar na cor errada.
 */
export function corDaFaixa(nome: string | null | undefined): string | null {
  const variavel = CORES[(nome ?? "").trim().toLowerCase()];
  return variavel ? `var(${variavel})` : null;
}

/**
 * Catálogo das 8 faixas na ordem da progressão, pra quem precisa desenhar a
 * escala inteira (hoje só a faixa de graduação da landing).
 *
 * Deriva de CORES em vez de repetir a lista: uma segunda lista escrita à mão
 * sairia de ordem no dia que uma faixa mudar. Continua valendo a regra do topo
 * do arquivo — qual faixa um MEMBRO tem vem do banco, nunca daqui. Isto é o
 * catálogo da escala, não o estado de ninguém.
 */
export const FAIXAS = Object.keys(CORES).map((nome) => ({
  nome: nome.replace(/\b\p{L}/gu, (letra) => letra.toUpperCase()),
  cor: `var(${CORES[nome]})`,
}));
