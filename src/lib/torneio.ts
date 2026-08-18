/**
 * Motor de chaveamento dos torneios.
 *
 * Tudo aqui é função pura: entra lista de equipes e partidas já jogadas, sai
 * lista de partidas novas. Nada de Supabase, nada de Svelte. O motivo é que
 * chave de torneio é a única parte do painel em que o erro não aparece na
 * tela: um bye no lugar errado ou uma revanche no suíço só são percebidos no
 * dia, com todo mundo em volta da mesa. Sendo função pura, o
 * `scripts/test-torneio.mjs` consegue provar o comportamento sem banco e sem
 * navegador.
 *
 * O 1x1 não tem caminho próprio: uma pessoa é uma equipe de um integrante.
 * Isso deixa um único código de partida em vez de dois quase iguais.
 *
 * Quem grava no banco é a RPC `gerar_partidas`, que recebe esta lista como
 * jsonb. Por isso `proxima` é índice DENTRO do array devolvido, e não id: no
 * momento em que a chave é montada nenhuma partida tem id ainda.
 */

export interface Equipe {
  id_equipe: number;
  /** Ordem de força. Sem seed, a ordem da lista é que vale. */
  seed?: number | null;
  /** Só no torneio de classes. É o que separa uma chave da outra. */
  id_classe?: number | null;
}

/** Partida recém gerada, ainda sem id do banco. */
export interface PartidaNova {
  fase: string;
  ordem: number;
  id_classe: number | null;
  id_equipe_a: number | null;
  /** Nulo é bye: a equipe A passa sem jogar. */
  id_equipe_b: number | null;
  melhor_de: number;
  /** Índice da partida seguinte dentro deste mesmo array, ou nulo. */
  proxima: number | null;
  proxima_vaga: "a" | "b" | null;
  /**
   * Para onde vai quem PERDE. Só a eliminatória dupla usa, porque só nela
   * perder não é sair. Ausente vale nulo: nos outros formatos o perdedor não
   * tem destino, e obrigar os três a escrever `null` era ruído.
   */
  proxima_derrota?: number | null;
  proxima_derrota_vaga?: "a" | "b" | null;
  /** Só vem preenchido quando a partida já nasce decidida, ou seja, num bye. */
  id_equipe_vencedora: number | null;
}

/** Partida como ela volta do banco, para calcular classificação e pareamento. */
export interface PartidaFeita {
  id_equipe_a: number | null;
  id_equipe_b: number | null;
  id_equipe_vencedora: number | null;
  pontos_a: number;
  pontos_b: number;
}

/** Melhor de quantas por fase. É a regra de vitória flexível do pedido. */
export interface MelhorDe {
  padrao: number;
  semifinal: number;
  final: number;
}

export type Formato = "eliminatoria" | "eliminatoria_dupla" | "suico" | "todos_contra_todos";

/**
 * Nomes de fase que o resto do sistema lê, e não só exibe. A `fechar_torneio`
 * usa a grande final para saber se ainda falta o desempate, então mudar estes
 * dois textos é mudar regra, não legenda: mude aqui e na RPC junto.
 */
export const FASE_GRANDE_FINAL = "Grande final";
export const FASE_DESEMPATE = "Final de desempate";

/**
 * Mínimo de participantes para uma classe virar chave.
 *
 * São quatro por causa do pódio: com dois sai campeão e vice, com três o
 * terceiro lugar é quem perdeu a semifinal sozinho, e só a partir de quatro o
 * bronze é disputado por gente que jogou o mesmo tanto. Classe abaixo disso não
 * é gerada, e a tela avisa antes, enquanto ainda dá pra inscrever mais gente.
 *
 * Vale por chave, e não por torneio: uma classe pode ter doze e a do lado
 * quatro no mesmo dia.
 */
export const MINIMO_POR_CHAVE = 4;

/**
 * Quantas vitórias fecham uma partida melhor de N. Esta conta está repetida
 * dentro da RPC `registrar_resultado` de propósito: o banco não pode depender
 * do cliente para saber quem venceu.
 */
export function vitoriasNecessarias(melhorDe: number): number {
  return Math.ceil(melhorDe / 2);
}

/**
 * Ordem clássica de seeds numa chave de tamanho potência de 2, aquela em que o
 * 1 e o 2 só se encontram na final. Cresce dobrando: cada seed s da chave
 * menor vira o par (s, n+1-s) na maior.
 */
function ordemSeeds(tamanho: number): number[] {
  let ordem = [1, 2];
  while (ordem.length < tamanho) {
    const n = ordem.length * 2;
    const nova: number[] = [];
    for (const s of ordem) nova.push(s, n + 1 - s);
    ordem = nova;
  }
  return ordem;
}

function nomeFase(partidasRestantes: number): string {
  if (partidasRestantes === 1) return "Final";
  if (partidasRestantes === 2) return "Semifinal";
  if (partidasRestantes === 4) return "Quartas de final";
  if (partidasRestantes === 8) return "Oitavas de final";
  return `Fase de ${partidasRestantes * 2}`;
}

function melhorDeDaFase(partidasRestantes: number, m: MelhorDe): number {
  if (partidasRestantes === 1) return m.final;
  if (partidasRestantes === 2) return m.semifinal;
  return m.padrao;
}

/** Encaixa o vencedor de `p` na vaga que ele ocupa na partida seguinte. */
function avancar(partidas: PartidaNova[], p: PartidaNova) {
  if (p.proxima === null || p.proxima_vaga === null) return;
  const alvo = partidas[p.proxima];
  if (p.proxima_vaga === "a") alvo.id_equipe_a = p.id_equipe_vencedora;
  else alvo.id_equipe_b = p.id_equipe_vencedora;
}

/**
 * Mata-mata simples, com a chave inteira gerada de uma vez (todas as rodadas já
 * ligadas pelo `proxima`). Gerar tudo de saída, e não rodada a rodada, é o que
 * permite desenhar a chave na tela antes da primeira partida acontecer.
 *
 * Bye: a chave é arredondada para a próxima potência de 2 e as vagas que sobram
 * viram partida sem adversário, já decidida. Como o tamanho da chave é sempre
 * menor que o dobro do número de equipes, nunca cai bye contra bye, e por isso
 * o avanço automático só precisa de um nível.
 */
export function chaveEliminatoria(
  equipes: Equipe[],
  melhorDe: MelhorDe,
  idClasse: number | null = null,
): PartidaNova[] {
  if (equipes.length < 2) {
    throw new Error("Uma chave de eliminatória precisa de pelo menos 2 equipes.");
  }

  const ordenadas = [...equipes].sort((a, b) => (a.seed ?? Infinity) - (b.seed ?? Infinity));
  const n = ordenadas.length;
  const tamanho = 2 ** Math.ceil(Math.log2(n));

  const partidas: PartidaNova[] = [];
  let camadaAnterior: number[] = [];

  for (let restantes = tamanho / 2; restantes >= 1; restantes /= 2) {
    const inicio = partidas.length;
    for (let i = 0; i < restantes; i++) {
      partidas.push({
        fase: nomeFase(restantes),
        ordem: i + 1,
        id_classe: idClasse,
        id_equipe_a: null,
        id_equipe_b: null,
        melhor_de: melhorDeDaFase(restantes, melhorDe),
        proxima: null,
        proxima_vaga: null,
        id_equipe_vencedora: null,
      });
    }
    // Duas partidas da rodada anterior desaguam na mesma partida desta.
    camadaAnterior.forEach((idx, i) => {
      partidas[idx].proxima = inicio + Math.floor(i / 2);
      partidas[idx].proxima_vaga = i % 2 === 0 ? "a" : "b";
    });
    camadaAnterior = Array.from({ length: restantes }, (_, i) => inicio + i);
  }

  // Primeira rodada: as vagas da ordem de seeds acima do número de equipes
  // ficam vazias, e é isso que vira bye.
  const vagas = ordemSeeds(tamanho).map((s) => (s <= n ? ordenadas[s - 1] : null));
  for (let i = 0; i < tamanho / 2; i++) {
    partidas[i].id_equipe_a = vagas[2 * i]?.id_equipe ?? null;
    partidas[i].id_equipe_b = vagas[2 * i + 1]?.id_equipe ?? null;
  }
  for (let i = 0; i < tamanho / 2; i++) {
    const p = partidas[i];
    if (p.id_equipe_a !== null && p.id_equipe_b === null) p.id_equipe_vencedora = p.id_equipe_a;
    else if (p.id_equipe_a === null && p.id_equipe_b !== null) p.id_equipe_vencedora = p.id_equipe_b;
    if (p.id_equipe_vencedora !== null) avancar(partidas, p);
  }

  return partidas;
}

/**
 * Eliminatória dupla, a repescagem. Perder uma vez não bota ninguém pra fora:
 * quem cai na chave dos vencedores desce pra repescagem e continua no torneio.
 * Só sai mesmo na segunda derrota.
 *
 * A chave tem três pedaços:
 *
 *   vencedores    o mata-mata de sempre, e quem perde aqui desce
 *   repescagem    alterna uma rodada só entre quem já desceu e uma rodada
 *                 recebendo os perdedores novos da chave de cima
 *   grande final  campeão dos vencedores contra campeão da repescagem
 *
 * O campeão dos vencedores chega na grande final sem nenhuma derrota, e o da
 * repescagem com uma. Se o da repescagem vencer, os dois ficam com uma derrota
 * cada e ninguém foi eliminado ainda: falta a final de desempate. Ela não nasce
 * aqui, porque na hora de montar a chave não dá pra saber se vai ser precisa.
 * Quem gera é a tela, com `partidaDesempate`, e a `fechar_torneio` recusa fechar
 * enquanto ela estiver faltando.
 *
 * Bye: quem passa sem jogar na primeira rodada não produz perdedor, e isso
 * esvazia partidas inteiras do começo da repescagem. Em vez de deixar partida
 * de um lado só, que ninguém consegue lançar porque não tem placar, toda
 * partida que comprovadamente teria menos de dois participantes é descartada, e
 * a rota de quem passaria por ela aponta direto para o destino seguinte.
 */
export function chaveEliminatoriaDupla(
  equipes: Equipe[],
  melhorDe: MelhorDe,
  idClasse: number | null = null,
): PartidaNova[] {
  if (equipes.length < 2) {
    throw new Error("Uma chave de repescagem precisa de pelo menos 2 equipes.");
  }

  const ordenadas = [...equipes].sort((a, b) => (a.seed ?? Infinity) - (b.seed ?? Infinity));
  const n = ordenadas.length;
  const tamanho = 2 ** Math.ceil(Math.log2(n));
  const k = Math.log2(tamanho);

  const partidas: PartidaNova[] = [];
  /** Rodada da repescagem de cada partida. -1 é chave dos vencedores ou final. */
  const rodadaLB: number[] = [];

  const criar = (fase: string, melhorDeN: number, rodada = -1): number => {
    partidas.push({
      fase,
      ordem: 0,
      id_classe: idClasse,
      id_equipe_a: null,
      id_equipe_b: null,
      melhor_de: melhorDeN,
      proxima: null,
      proxima_vaga: null,
      proxima_derrota: null,
      proxima_derrota_vaga: null,
      id_equipe_vencedora: null,
    });
    rodadaLB.push(rodada);
    return partidas.length - 1;
  };

  const wb: number[][] = [];
  for (let r = 0; r < k; r++) {
    const qtd = tamanho / 2 ** (r + 1);
    const fase = qtd === 1 ? "Final dos vencedores" : `Vencedores, ${nomeFase(qtd)}`;
    const md = qtd === 1 ? melhorDe.semifinal : melhorDe.padrao;
    wb.push(Array.from({ length: qtd }, () => criar(fase, md)));
  }
  for (let r = 0; r + 1 < k; r++) {
    wb[r].forEach((idx, i) => {
      partidas[idx].proxima = wb[r + 1][Math.floor(i / 2)];
      partidas[idx].proxima_vaga = i % 2 === 0 ? "a" : "b";
    });
  }

  const lb: number[][] = [];
  for (let i = 1; i <= k - 1; i++) {
    const qtd = 2 ** (k - 1 - i);
    const rodada = lb.length;
    lb.push(
      Array.from({ length: qtd }, () =>
        criar(`Repescagem, rodada ${rodada + 1}`, melhorDe.padrao, rodada),
      ),
    );
    lb.push(
      Array.from({ length: qtd }, () =>
        criar(`Repescagem, rodada ${rodada + 2}`, melhorDe.padrao, rodada + 1),
      ),
    );
  }

  const gf = criar(FASE_GRANDE_FINAL, melhorDe.final);

  if (k >= 2) {
    // Perdedores da primeira rodada abrem a repescagem, dois a dois.
    wb[0].forEach((idx, m) => {
      partidas[idx].proxima_derrota = lb[0][Math.floor(m / 2)];
      partidas[idx].proxima_derrota_vaga = m % 2 === 0 ? "a" : "b";
    });
    // Das rodadas seguintes, um perdedor por partida da rodada de junção. A
    // ordem é invertida de propósito: é o que empurra pra longe o reencontro de
    // quem acabou de se enfrentar lá em cima.
    for (let r = 1; r <= k - 1; r++) {
      const destino = lb[2 * r - 1];
      wb[r].forEach((idx, m) => {
        partidas[idx].proxima_derrota = destino[destino.length - 1 - m];
        partidas[idx].proxima_derrota_vaga = "b";
      });
    }
    for (let i = 1; i <= k - 1; i++) {
      lb[2 * i - 2].forEach((idx, m) => {
        partidas[idx].proxima = lb[2 * i - 1][m];
        partidas[idx].proxima_vaga = "a";
      });
      if (i < k - 1) {
        lb[2 * i - 1].forEach((idx, m) => {
          partidas[idx].proxima = lb[2 * i][Math.floor(m / 2)];
          partidas[idx].proxima_vaga = m % 2 === 0 ? "a" : "b";
        });
      }
    }
    const finalRepescagem = lb[lb.length - 1][0];
    partidas[finalRepescagem].proxima = gf;
    partidas[finalRepescagem].proxima_vaga = "b";
  } else {
    // Dois participantes: não existe repescagem, e quem perde a única partida
    // vai direto pra grande final com a derrota nas costas.
    partidas[wb[0][0]].proxima_derrota = gf;
    partidas[wb[0][0]].proxima_derrota_vaga = "b";
  }
  partidas[wb[k - 1][0]].proxima = gf;
  partidas[wb[k - 1][0]].proxima_vaga = "a";

  // Quantos participantes cada partida vai ter, de verdade. Uma passada só
  // resolve porque a ordem de criação já é topológica: toda partida nasce
  // depois de todas as que desaguam nela.
  const entrantes: number[] = new Array(partidas.length).fill(0);
  const vagas = ordemSeeds(tamanho).map((s) => (s <= n ? ordenadas[s - 1] : null));
  wb[0].forEach((idx, i) => {
    const p = partidas[idx];
    p.id_equipe_a = vagas[2 * i]?.id_equipe ?? null;
    p.id_equipe_b = vagas[2 * i + 1]?.id_equipe ?? null;
    entrantes[idx] = (p.id_equipe_a === null ? 0 : 1) + (p.id_equipe_b === null ? 0 : 1);
  });
  for (let i = 0; i < partidas.length; i++) {
    const p = partidas[i];
    if (entrantes[i] >= 1 && p.proxima !== null) entrantes[p.proxima]++;
    if (entrantes[i] >= 2 && p.proxima_derrota != null) entrantes[p.proxima_derrota]++;
  }

  // O bye da primeira rodada continua aparecendo, porque ele é informação: diz
  // quem passou sem jogar. Já a partida vazia no meio da repescagem é só um
  // corredor, e corredor não se mostra.
  const primeiraRodada = new Set(wb[0]);
  const descartada = partidas.map(
    (_, i) => entrantes[i] === 0 || (entrantes[i] === 1 && !primeiraRodada.has(i)),
  );

  const seguir = (
    idx: number | null | undefined,
    vaga: "a" | "b" | null | undefined,
  ): [number | null, "a" | "b" | null] => {
    let i = idx ?? null;
    let v = vaga ?? null;
    while (i !== null && descartada[i]) {
      v = partidas[i].proxima_vaga ?? null;
      i = partidas[i].proxima ?? null;
    }
    return [i, v];
  };

  for (let i = 0; i < partidas.length; i++) {
    if (descartada[i]) continue;
    const p = partidas[i];
    [p.proxima, p.proxima_vaga] = seguir(p.proxima, p.proxima_vaga);
    if (entrantes[i] < 2) {
      // Passou sem jogar, então não produz perdedor nenhum.
      p.proxima_derrota = null;
      p.proxima_derrota_vaga = null;
    } else {
      [p.proxima_derrota, p.proxima_derrota_vaga] = seguir(
        p.proxima_derrota,
        p.proxima_derrota_vaga,
      );
    }
  }

  const mantidas = partidas.map((_, i) => i).filter((i) => !descartada[i]);
  const novoIndice = new Map(mantidas.map((antigo, novo) => [antigo, novo]));
  const remapear = (i: number | null | undefined) =>
    i === null || i === undefined ? null : (novoIndice.get(i) ?? null);
  const finais: PartidaNova[] = mantidas.map((i) => ({
    ...partidas[i],
    proxima: remapear(partidas[i].proxima),
    proxima_derrota: remapear(partidas[i].proxima_derrota),
  }));

  // Rodada de repescagem descartada inteira sai da contagem: começar a lista na
  // "rodada 2" porque a 1 evaporou seria mentira na tela.
  const rodadasVivas = [...new Set(mantidas.map((i) => rodadaLB[i]))]
    .filter((r) => r >= 0)
    .sort((a, b) => a - b);
  mantidas.forEach((antigo, novo) => {
    const r = rodadaLB[antigo];
    if (r < 0) return;
    const pos = rodadasVivas.indexOf(r);
    const ultima = pos === rodadasVivas.length - 1;
    finais[novo].fase = ultima ? "Final da repescagem" : `Repescagem, rodada ${pos + 1}`;
    if (ultima) finais[novo].melhor_de = melhorDe.semifinal;
  });

  const porFase = new Map<string, number>();
  for (const p of finais) {
    const ordem = (porFase.get(p.fase) ?? 0) + 1;
    porFase.set(p.fase, ordem);
    p.ordem = ordem;
  }

  for (const p of finais) {
    if (p.id_equipe_a !== null && p.id_equipe_b === null) p.id_equipe_vencedora = p.id_equipe_a;
    else if (p.id_equipe_a === null && p.id_equipe_b !== null) p.id_equipe_vencedora = p.id_equipe_b;
  }
  for (const p of finais) if (p.id_equipe_vencedora !== null) avancar(finais, p);

  return finais;
}

/**
 * A grande final terminou com o campeão da repescagem vencendo, então os dois
 * finalistas estão com uma derrota cada e o torneio não acabou. Vale só na
 * eliminatória dupla, e o lado B da grande final é sempre quem veio da
 * repescagem.
 */
export function precisaDesempate(p: {
  fase: string;
  id_equipe_b: number | null;
  id_equipe_vencedora: number | null;
}): boolean {
  return (
    p.fase === FASE_GRANDE_FINAL &&
    p.id_equipe_vencedora !== null &&
    p.id_equipe_vencedora === p.id_equipe_b
  );
}

/**
 * Partida acontecendo agora: a mesa já lançou ponto e ela ainda não fechou.
 *
 * Os dois lados preenchidos separam da vaga esperando a fase anterior, e o
 * placar zerado separa da partida que ainda nem começou. O bye cai fora pelos
 * dois testes: um lado é nulo e ele já nasce decidido.
 */
export function emJogo(p: {
  id_equipe_a: number | null;
  id_equipe_b: number | null;
  id_equipe_vencedora: number | null;
  pontos_a: number;
  pontos_b: number;
}): boolean {
  return (
    p.id_equipe_vencedora === null &&
    p.id_equipe_a !== null &&
    p.id_equipe_b !== null &&
    (p.pontos_a > 0 || p.pontos_b > 0)
  );
}

/** A partida de desempate, com quem venceu a grande final entrando como A. */
export function partidaDesempate(gf: {
  id_classe: number | null;
  id_equipe_a: number | null;
  id_equipe_b: number | null;
  melhor_de: number;
}): PartidaNova {
  return {
    fase: FASE_DESEMPATE,
    ordem: 1,
    id_classe: gf.id_classe,
    id_equipe_a: gf.id_equipe_b,
    id_equipe_b: gf.id_equipe_a,
    melhor_de: gf.melhor_de,
    proxima: null,
    proxima_vaga: null,
    proxima_derrota: null,
    proxima_derrota_vaga: null,
    id_equipe_vencedora: null,
  };
}

export interface LinhaClassificacao {
  id_equipe: number;
  jogos: number;
  vitorias: number;
  derrotas: number;
  pontosPro: number;
  pontosContra: number;
  saldo: number;
}

/**
 * Tabela de classificação. Só conta partida decidida: partida em andamento com
 * placar parcial não pode mexer na ordem, senão o pareamento da rodada seguinte
 * muda no meio da rodada atual.
 */
export function classificacao(equipes: Equipe[], feitas: PartidaFeita[]): LinhaClassificacao[] {
  const linhas = new Map<number, LinhaClassificacao>(
    equipes.map((e) => [
      e.id_equipe,
      {
        id_equipe: e.id_equipe,
        jogos: 0,
        vitorias: 0,
        derrotas: 0,
        pontosPro: 0,
        pontosContra: 0,
        saldo: 0,
      },
    ]),
  );

  for (const p of feitas) {
    if (p.id_equipe_vencedora === null) continue;
    const lados: [number | null, number, number][] = [
      [p.id_equipe_a, p.pontos_a, p.pontos_b],
      [p.id_equipe_b, p.pontos_b, p.pontos_a],
    ];
    for (const [id, feitos, sofridos] of lados) {
      if (id === null) continue;
      const l = linhas.get(id);
      if (!l) continue;
      l.jogos++;
      if (p.id_equipe_vencedora === id) l.vitorias++;
      else l.derrotas++;
      l.pontosPro += feitos;
      l.pontosContra += sofridos;
      l.saldo = l.pontosPro - l.pontosContra;
    }
  }

  return [...linhas.values()].sort(
    (a, b) => b.vitorias - a.vitorias || b.saldo - a.saldo || a.id_equipe - b.id_equipe,
  );
}

/**
 * Pódio de uma chave: primeiro, segundo e terceiro, nesta ordem.
 *
 * No suíço e no todos contra todos a tabela já é o pódio, e basta cortar em
 * três. No mata-mata ela não serve para o topo: quem passou de bye chega à
 * final com menos vitórias que um semifinalista eliminado. Então o ouro e a
 * prata saem da partida decisiva (a de maior `id_partida` da chave, porque na
 * eliminatória dupla a grande final e o desempate ficam as duas sem seguinte),
 * e o bronze é o melhor colocado entre os que sobraram.
 *
 * Eliminatória simples não tem disputa de terceiro, então o bronze aqui é
 * critério de tabela, não resultado de partida: entre os dois que perderam a
 * semifinal, fica com ele quem venceu mais e tem melhor saldo.
 *
 * Devolve menos de três posições quando a chave é pequena demais para elas.
 */
export function podio(
  equipes: Equipe[],
  partidasDaChave: (PartidaFeita & { id_partida: number })[],
  mataMata: boolean,
): number[] {
  const tabela = classificacao(equipes, partidasDaChave);
  if (!mataMata) return tabela.slice(0, 3).map((l) => l.id_equipe);

  let decisiva: (PartidaFeita & { id_partida: number }) | null = null;
  for (const p of partidasDaChave) {
    if (!decisiva || p.id_partida > decisiva.id_partida) decisiva = p;
  }
  if (!decisiva || decisiva.id_equipe_vencedora === null) return [];

  const primeiro = decisiva.id_equipe_vencedora;
  const segundo =
    decisiva.id_equipe_a === primeiro ? decisiva.id_equipe_b : decisiva.id_equipe_a;
  const terceiro =
    tabela.find((l) => l.id_equipe !== primeiro && l.id_equipe !== segundo)?.id_equipe ?? null;

  return [primeiro, segundo, terceiro].filter((x): x is number => x !== null);
}

const chaveConfronto = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

/**
 * Pareamento sem revanche, por retrocesso. Testa os adversários na ordem da
 * classificação, então na prática o primeiro palpite já serve e o retrocesso
 * quase nunca dispara.
 *
 * ponytail: força bruta, fatorial no pior caso. O `orcamento` existe porque uma
 * rodada tardia de suíço pequeno pode ser genuinamente impossível sem revanche,
 * e aí é melhor devolver nulo rápido do que travar a tela. Se um dia o grupo
 * rodar suíço com muita gente e isso pesar, o troco é emparelhamento de peso
 * máximo (blossom).
 */
function parearSemRevanche(
  ids: number[],
  jaJogaram: Set<string>,
  orcamento = { passos: 50000 },
): [number, number][] | null {
  if (ids.length === 0) return [];
  if (orcamento.passos-- <= 0) return null;
  const [a, ...resto] = ids;
  for (let i = 0; i < resto.length; i++) {
    if (jaJogaram.has(chaveConfronto(a, resto[i]))) continue;
    const sub = parearSemRevanche(
      resto.filter((_, j) => j !== i),
      jaJogaram,
      orcamento,
    );
    if (sub) return [[a, resto[i]], ...sub];
  }
  return null;
}

/**
 * Uma rodada de suíço. Todo mundo joga toda rodada, pareado por pontuação, sem
 * repetir adversário enquanto for possível.
 *
 * Número ímpar de equipes leva bye, e o bye vai para a última colocada que
 * ainda não teve um. Sem essa condição a mesma pessoa folgaria toda rodada.
 */
export function rodadaSuico(
  equipes: Equipe[],
  feitas: PartidaFeita[],
  melhorDe: number,
  numeroRodada: number,
  idClasse: number | null = null,
): PartidaNova[] {
  const ordem = classificacao(equipes, feitas).map((l) => l.id_equipe);
  const jaJogaram = new Set<string>();
  const jaTeveBye = new Set<number>();
  for (const p of feitas) {
    if (p.id_equipe_a !== null && p.id_equipe_b !== null) {
      jaJogaram.add(chaveConfronto(p.id_equipe_a, p.id_equipe_b));
    } else if (p.id_equipe_a !== null) jaTeveBye.add(p.id_equipe_a);
    else if (p.id_equipe_b !== null) jaTeveBye.add(p.id_equipe_b);
  }

  const fase = `Rodada ${numeroRodada}`;
  const partidas: PartidaNova[] = [];
  const nova = (a: number, b: number | null): PartidaNova => ({
    fase,
    ordem: partidas.length + 1,
    id_classe: idClasse,
    id_equipe_a: a,
    id_equipe_b: b,
    melhor_de: melhorDe,
    proxima: null,
    proxima_vaga: null,
    id_equipe_vencedora: b === null ? a : null,
  });

  let restantes = ordem;
  let bye: number | null = null;
  if (restantes.length % 2 === 1) {
    // De trás para frente: quem está pior na tabela folga primeiro.
    const candidatos = [...restantes].reverse();
    bye = candidatos.find((id) => !jaTeveBye.has(id)) ?? candidatos[0];
    restantes = restantes.filter((id) => id !== bye);
  }

  const pares =
    parearSemRevanche(restantes, jaJogaram) ??
    // Chegou no ponto em que não existe pareamento sem revanche. Aí a revanche
    // é o mal menor: melhor repetir confronto do que não ter rodada.
    restantes.reduce<[number, number][]>((acc, _, i) => {
      if (i % 2 === 0) acc.push([restantes[i], restantes[i + 1]]);
      return acc;
    }, []);

  for (const [a, b] of pares) partidas.push(nova(a, b));
  if (bye !== null) partidas.push(nova(bye, null));
  return partidas;
}

/**
 * Todos contra todos pelo método do círculo: a primeira equipe fica parada e as
 * outras giram, o que dá cada confronto exatamente uma vez e já distribuído em
 * rodadas. Número ímpar ganha uma equipe fantasma, e quem cair contra ela folga.
 */
export function todosContraTodos(
  equipes: Equipe[],
  melhorDe: number,
  idClasse: number | null = null,
): PartidaNova[] {
  if (equipes.length < 2) {
    throw new Error("Todos contra todos precisa de pelo menos 2 equipes.");
  }
  const roda: (number | null)[] = equipes.map((e) => e.id_equipe);
  if (roda.length % 2 === 1) roda.push(null);

  const n = roda.length;
  const partidas: PartidaNova[] = [];
  for (let r = 0; r < n - 1; r++) {
    const fase = `Rodada ${r + 1}`;
    let ordem = 0;
    for (let i = 0; i < n / 2; i++) {
      const a = roda[i];
      const b = roda[n - 1 - i];
      if (a === null && b === null) continue;
      const semAdversario = a === null || b === null;
      partidas.push({
        fase,
        ordem: ++ordem,
        id_classe: idClasse,
        id_equipe_a: a ?? b,
        id_equipe_b: semAdversario ? null : b,
        melhor_de: melhorDe,
        proxima: null,
        proxima_vaga: null,
        id_equipe_vencedora: semAdversario ? (a ?? b) : null,
      });
    }
    roda.splice(1, 0, roda.pop()!);
  }
  return partidas;
}

/**
 * Junta chaves independentes num array só, corrigindo os índices de `proxima`.
 * É o que o torneio de classes precisa: dez chaves, uma por classe, mas uma
 * única lista para a RPC gravar. Concatenar sem deslocar apontaria o vencedor
 * de uma classe para a semifinal de outra.
 */
export function juntarChaves(chaves: PartidaNova[][]): PartidaNova[] {
  const todas: PartidaNova[] = [];
  for (const chave of chaves) {
    const deslocamento = todas.length;
    for (const p of chave) {
      todas.push({
        ...p,
        proxima: p.proxima === null ? null : p.proxima + deslocamento,
        proxima_derrota:
          p.proxima_derrota === null || p.proxima_derrota === undefined
            ? null
            : p.proxima_derrota + deslocamento,
      });
    }
  }
  return todas;
}

/**
 * Ponto de entrada da tela. Agrupa por classe quando o torneio é de classes,
 * roda o formato escolhido em cada grupo e devolve a lista pronta para a RPC.
 *
 * O suíço e o todos contra todos entram aqui pela rodada corrente; a
 * eliminatória ignora `numeroRodada` porque nasce inteira.
 */
export function gerarChaves(opts: {
  formato: Formato;
  equipes: Equipe[];
  melhorDe: MelhorDe;
  porClasse: boolean;
  /** Partidas já gravadas, necessárias para parear a próxima rodada do suíço. */
  feitas?: PartidaFeita[];
  numeroRodada?: number;
}): PartidaNova[] {
  const { formato, equipes, melhorDe, porClasse, feitas = [], numeroRodada = 1 } = opts;

  const grupos: [number | null, Equipe[]][] = porClasse
    ? [...new Set(equipes.map((e) => e.id_classe ?? null))]
        .sort((a, b) => (a ?? 0) - (b ?? 0))
        .map((c) => [c, equipes.filter((e) => (e.id_classe ?? null) === c)])
    : [[null, equipes]];

  return juntarChaves(
    grupos
      // Classe abaixo do mínimo não vira chave. No torneio aberto o mínimo é
      // outro: lá não existe "as outras chaves", e recusar 3 pessoas seria
      // recusar o torneio inteiro.
      .filter(([, doGrupo]) => doGrupo.length >= (porClasse ? MINIMO_POR_CHAVE : 2))
      .map(([idClasse, doGrupo]) => {
        const ids = new Set(doGrupo.map((e) => e.id_equipe));
        const feitasDoGrupo = feitas.filter(
          (p) =>
            (p.id_equipe_a !== null && ids.has(p.id_equipe_a)) ||
            (p.id_equipe_b !== null && ids.has(p.id_equipe_b)),
        );
        if (formato === "eliminatoria") return chaveEliminatoria(doGrupo, melhorDe, idClasse);
        if (formato === "eliminatoria_dupla")
          return chaveEliminatoriaDupla(doGrupo, melhorDe, idClasse);
        if (formato === "todos_contra_todos")
          return todosContraTodos(doGrupo, melhorDe.padrao, idClasse);
        return rodadaSuico(doGrupo, feitasDoGrupo, melhorDe.padrao, numeroRodada, idClasse);
      }),
  );
}
