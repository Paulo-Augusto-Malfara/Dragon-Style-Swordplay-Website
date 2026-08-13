/**
 * ponytail: o mínimo de participantes de uma modalidade vive em prosa, dentro
 * de `requirements` ("Ter 2 times com pelo menos 10 combatentes cada (ao menos
 * 20 pessoas)"), e não como coluna do banco. Isto lê o maior número que venha
 * colado num substantivo de gente, o que acerta as 9 modalidades cadastradas
 * hoje e ignora de propósito "2 times" e "respawn de 10s".
 *
 * É heurística sobre texto livre: requisito escrito de outro jeito devolve 0, e
 * a modalidade passa a aparecer em todos os filtros em vez de sumir de todos,
 * que é o lado seguro de errar. Upgrade quando incomodar: uma coluna
 * `min_participantes` na tabela, e esta função vira leitura de campo.
 *
 * Coberto por scripts/test-modalidades.mjs.
 */
const GENTE = /(\d+)\s*(?:pessoas|participantes|combatentes|jogadores)/gi;

export function minimoDeParticipantes(requisitos: string[] | null): number {
  const texto = (requisitos ?? []).join(" ");
  const numeros = [...texto.matchAll(GENTE)].map((m) => Number(m[1]));
  return numeros.length ? Math.max(...numeros) : 0;
}
