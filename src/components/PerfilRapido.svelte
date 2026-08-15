<script lang="ts">
  /**
   * A janela de perfil que o olhinho abre no Ranking Geral, no Ranking por
   * Classe e no Mural de Membros.
   *
   * É uma ilha só por página, e não uma por linha da lista: quem manda abrir é
   * um clique em qualquer `[data-perfil]` do documento, escutado aqui em cima.
   * Vinte e cinco botões numa página de ranking, cada um carregando o próprio
   * componente, seria vinte e cinco vezes o mesmo código no navegador.
   *
   * Nada é buscado antes do primeiro clique, e a lista de classes (que é a
   * mesma pra qualquer perfil) é buscada uma vez só na vida da página.
   */
  import { onMount } from "svelte";
  import { corDaFaixa } from "../lib/faixa";
  import { CLASSE_BASICO, calcularRanks, slugDaClasse } from "../lib/rank-classe";
  import { VERSOES, versaoDaUrl, type Versao } from "../lib/ranking-versao";

  // Import dinâmico pelo mesmo motivo do MemberDashboard: um import de topo
  // faria `createBrowserClient()` rodar na passada de SSR e derrubar o build
  // quando as variáveis de ambiente não estivessem presentes ali.
  let supabasePromise: Promise<any> | undefined;
  function getSupabase() {
    supabasePromise ??= import("../lib/supabase-browser").then((m) => m.supabase);
    return supabasePromise;
  }

  /** Quantos treinos valem um nível de classe. Igual ao MemberDashboard. */
  const TREINOS_POR_NIVEL = 4;
  /** Últimas presenças não entram: ver o comentário no fim do template. */

  type Linha = {
    id_membro: number;
    id_classe: number;
    nome_classe: string;
    treinos_por_classe: number;
    nivel_por_classe: number;
  };

  let dialogo: HTMLDialogElement;
  let status = $state<"carregando" | "pronto" | "erro">("carregando");
  let erro = $state("");
  let membro = $state<any>(null);
  let minhasClasses = $state<Linha[]>([]);
  let ranks = $state(new Map<number, { posicao: number; total: number }>());
  /** Em qual leitura do ranking essa colocação foi medida. */
  let versaoRank = $state<Versao>("ativa");

  /** A lista inteira só é pedida uma vez, e é ela que dá as colocações. */
  let todasPromise: Promise<Linha[]> | undefined;
  /**
   * Quem está na ativa. Vem de `v_ranking_nivel_geral` porque a view por classe
   * não carrega `status_ativo`, exatamente como a página do Ranking por Classe
   * faz. Também é pedida uma vez só.
   */
  let ativosPromise: Promise<Set<number>> | undefined;

  /**
   * Os mesmos dois totais que o Ranking Geral mostra, calculados do mesmo
   * jeito: treinos somam tudo, nível de classe pula o Básico. Se as duas telas
   * contassem diferente, a janela desmentiria a linha de onde ela saiu.
   */
  const totalTreinos = $derived(
    minhasClasses.reduce((soma, c) => soma + (c.treinos_por_classe ?? 0), 0),
  );
  const nivelClasseTotal = $derived(
    minhasClasses
      .filter((c) => c.id_classe !== CLASSE_BASICO)
      .reduce((soma, c) => soma + (c.nivel_por_classe ?? 0), 0),
  );

  function progressoDaClasse(c: Linha) {
    const treinos = c.treinos_por_classe ?? 0;
    const nivel = c.nivel_por_classe ?? 0;
    // Se a regra mudar no banco e a constante daqui ficar velha, some a barra
    // em vez de desenhar um progresso errado.
    if (Math.floor(treinos / TREINOS_POR_NIVEL) !== nivel) return null;
    return { andados: treinos % TREINOS_POR_NIVEL, total: TREINOS_POR_NIVEL };
  }

  async function abrir(id: number) {
    status = "carregando";
    erro = "";
    membro = null;
    minhasClasses = [];
    ranks = new Map();
    if (!dialogo.open) dialogo.showModal();

    try {
      const supabase = await getSupabase();
      todasPromise ??= supabase
        .from("v_ranking_por_classe")
        .select("id_membro, id_classe, nome_classe, treinos_por_classe, nivel_por_classe")
        .then((r: any) => {
          if (r.error) throw r.error;
          return (r.data ?? []) as Linha[];
        });

      ativosPromise ??= supabase
        .from("v_ranking_nivel_geral")
        .select("id_membro, status_ativo")
        .then((r: any) => {
          if (r.error) throw r.error;
          return new Set<number>(
            (r.data ?? []).filter((m: any) => m.status_ativo).map((m: any) => m.id_membro),
          );
        });

      const [geral, todas, ativos] = await Promise.all([
        supabase.from("v_ranking_nivel_geral").select("*").eq("id_membro", id).single(),
        todasPromise,
        ativosPromise,
      ]);
      if (geral.error) throw geral.error;

      membro = geral.data;
      // Básico por último, o resto pelo mais treinado. Igual à ficha própria.
      minhasClasses = todas
        .filter((t) => t.id_membro === id)
        .sort((a, b) => {
          const aBasico = a.id_classe === CLASSE_BASICO;
          const bBasico = b.id_classe === CLASSE_BASICO;
          if (aBasico !== bBasico) return aBasico ? 1 : -1;
          return b.treinos_por_classe - a.treinos_por_classe;
        });
      /**
       * A base da colocação é a leitura que a PÁGINA está mostrando, lida da
       * URL na hora do clique: se a lista atrás da janela é "Na Ativa", a
       * colocação da janela também é, senão os dois números se contradizem na
       * mesma tela. O Mural não tem o parâmetro e cai no padrão, que é "ativa".
       *
       * A exceção é quem não está na ativa: ele não existe nessa base, e medi-lo
       * contra ela daria uma colocação numa lista que não o contém. Aí vale o
       * Legado, que é onde ele de fato aparece. Nas duas páginas de ranking isso
       * nunca acontece, porque a versão "Na Ativa" já não mostra membro inativo
       * (nem o olhinho dele); acontece no Mural, que tem um grupo inteiro de
       * Membros Inativos. É por isso que a base fica escrita na tela.
       */
      const souAtivo = !!geral.data?.status_ativo;
      const daPagina = versaoDaUrl(new URL(window.location.href));
      versaoRank = daPagina === "ativa" && !souAtivo ? "legado" : daPagina;
      ranks = calcularRanks(minhasClasses, todas, ativos, versaoRank === "ativa");
      status = "pronto";
    } catch (e) {
      // Promessa que falhou não fica guardada, senão o próximo clique repete o
      // erro sem nem tentar de novo.
      todasPromise = undefined;
      ativosPromise = undefined;
      erro = e instanceof Error ? e.message : String(e);
      status = "erro";
    }
  }

  function fechar() {
    if (dialogo.open) dialogo.close();
  }

  onMount(() => {
    // Delegação no documento: os botões são HTML estático das páginas, sem
    // JavaScript próprio nenhum. Basta um `data-perfil` com o id.
    const aoClicar = (e: MouseEvent) => {
      const alvo = (e.target as HTMLElement | null)?.closest?.("[data-perfil]");
      if (!alvo) return;
      const id = Number((alvo as HTMLElement).dataset.perfil);
      if (Number.isFinite(id)) abrir(id);
    };
    document.addEventListener("click", aoClicar);
    return () => document.removeEventListener("click", aoClicar);
  });
</script>

<dialog
  bind:this={dialogo}
  class="pf barra-fina"
  aria-label="Perfil do membro"
  onclick={(e) => {
    if (e.target === dialogo) fechar();
  }}
>
  <!-- Sempre presente, inclusive enquanto carrega e quando dá erro: sair não
       pode depender do Esc, que ninguém acha no celular. -->
  <div class="pf-barra">
    <button type="button" class="pf-fechar" onclick={fechar} aria-label="Fechar" title="Fechar">
      <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true">
        <path
          d="M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4l5.6 5.6L5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6z"
        ></path>
      </svg>
    </button>
  </div>

  {#if status === "carregando"}
    <p class="pf-aviso">Carregando...</p>
  {:else if status === "erro"}
    <p class="admin-error">{erro}</p>
  {:else if membro}
    <div class="pf-topo">
      <span class="pf-avatar">
        {#if membro.foto_url}
          <img src={membro.foto_url} alt="" />
        {:else}
          {membro.nome.charAt(0).toUpperCase()}
        {/if}
      </span>
      <div class="pf-id">
        <h2 class="pf-nome">{membro.nome}</h2>
        <!-- Traço de cor, o mesmo do ranking, e não o nome escrito: a faixa é
             um atributo da pessoa e estava com pílula dourada maior que o
             próprio nome. O nome continua no title e pro leitor de tela, que é
             quem não enxerga a cor. -->
        {#if corDaFaixa(membro.nome_faixa)}
          <p>
            <span
              class="pf-faixa"
              style={`--faixa:${corDaFaixa(membro.nome_faixa)}`}
              title={`Faixa ${membro.nome_faixa}`}
            >
              <span class="sr-only">Faixa {membro.nome_faixa}</span>
            </span>
          </p>
        {/if}
      </div>
    </div>

    <div class="pf-stats">
      <div class="pf-stat">
        <span class="label">Nível Geral</span>
        <span class="value">{membro.nivel_geral}</span>
      </div>
      <div class="pf-stat">
        <span class="label">Nível de Classe</span>
        <span class="value">{nivelClasseTotal}</span>
      </div>
      <div class="pf-stat">
        <span class="label">Pontos de Honra</span>
        <span class="value">{membro.ph_total}</span>
      </div>
      <div class="pf-stat">
        <span class="label">Treinos</span>
        <span class="value">{totalTreinos}</span>
      </div>
    </div>

    <h3 class="pf-sec">
      Classes
      <!-- Contra quem a colocação foi medida. Sem isto, a mesma pessoa aberta
           do Mural e do Ranking mostraria dois números sem explicação na tela. -->
      {#if ranks.size > 0}
        <span class="pf-base">colocação: {VERSOES[versaoRank].label}</span>
      {/if}
    </h3>
    {#if minhasClasses.length === 0}
      <p class="pf-aviso">Nenhum treino registrado ainda.</p>
    {:else}
      <ul class="pf-classes">
        {#each minhasClasses as c}
          {@const progresso = progressoDaClasse(c)}
          {@const rank = ranks.get(c.id_classe)}
          <li>
            <span class="pf-classe-nome">{c.nome_classe}</span>
            <span class="pf-classe-nivel">Nível {c.nivel_por_classe}</span>
            <span class="pf-classe-treinos">
              {c.treinos_por_classe === 1 ? "1 treino" : `${c.treinos_por_classe} treinos`}
            </span>
            {#if rank}
              <a
                class="pf-classe-rank"
                class:podio-1={rank.posicao === 1}
                class:podio-2={rank.posicao === 2}
                class:podio-3={rank.posicao === 3}
                href={`/ranking-por-classe?classe=${slugDaClasse(c.nome_classe)}&versao=${versaoRank}`}
                title={`Colocação em ${c.nome_classe} (${VERSOES[versaoRank].label})`}
              >
                <strong>{rank.posicao}º</strong> de {rank.total}
              </a>
            {/if}
            {#if progresso}
              <ol
                class="pf-casas"
                aria-label={`${progresso.andados} de ${progresso.total} treinos para o nível ${c.nivel_por_classe + 1}`}
              >
                {#each { length: progresso.total } as _, i}
                  <li class:cheia={i < progresso.andados}></li>
                {/each}
              </ol>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}

    <!-- Últimos treinos ficaram de fora de propósito. `v_historico_presencas`
         filtra por `auth.uid()` dentro da própria definição, ou seja, ela só
         devolve as SUAS presenças: mostrar as de outra pessoa pediria uma view
         pública nova, e essa decisão foi adiada. -->

    <h3 class="pf-sec">Conquistas</h3>
    <p class="pf-aviso">As conquistas ainda estão sendo montadas.</p>
  {/if}
</dialog>

<style>
  .pf {
    /* Sem isto a caixa gruda no alto e na esquerda: o `* { margin: 0 }` do
       reset do site apaga o `margin: auto` que a folha do navegador usa pra
       centralizar diálogo modal. Já mordeu o ConfirmarAcao e o equipamentos. */
    margin: auto;
    position: relative;
    width: min(520px, calc(100vw - 2rem));
    max-height: 86vh;
    overflow: auto;
    padding: clamp(1.1rem, 4vw, 1.5rem);
    border: 1px solid var(--ds-line-strong);
    border-radius: var(--card-radius);
    background: var(--ds-surface-solid);
    color: var(--ds-text-1);
    box-shadow: var(--card-shadow-alta);
  }

  .pf::backdrop {
    background: rgba(5, 8, 11, 0.72);
  }

  /* A barra é filha direta do <dialog>, e é isso que faz o sticky valer pela
     rolagem inteira: `position: sticky` é limitado pela caixa do PAI, então a
     mesma barra dentro de um invólucro qualquer descolaria na primeira linha.
     Foi por isso também que ela virou barra em vez de um botão `absolute`, que
     é o que o equipamentos fazia: absolute dentro de caixa que rola some junto
     com o topo do conteúdo. */
  .pf-barra {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    justify-content: flex-end;
    margin-bottom: 2px;
  }

  .pf-fechar {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    padding: 0;
    border: 1px solid var(--ds-line-strong);
    border-radius: 9px;
    background: var(--ds-surface-solid);
    color: var(--ds-text-3);
    font-size: 1rem;
    cursor: pointer;
  }

  .pf-fechar:hover {
    border-color: var(--ds-gold-dim);
    background: var(--ds-gold-wash);
    color: var(--ds-gold-light);
  }

  .pf-fechar:focus-visible {
    outline: 2px solid var(--ds-gold-light);
    outline-offset: 2px;
  }

  .pf-aviso {
    margin: 0;
    color: var(--ds-text-4);
  }

  .pf-topo {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 16px;
  }

  .pf-avatar {
    flex: none;
    display: grid;
    place-items: center;
    overflow: hidden;
    width: 68px;
    height: 68px;
    border-radius: 50%;
    border: 1px solid var(--ds-gold-dim);
    background: var(--ds-bg-alt);
    font-family: var(--ds-font-display);
    font-size: 1.6rem;
    color: var(--ds-text-3);
  }

  .pf-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .pf-id {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
  }

  .pf-nome {
    margin: 0;
    font-family: var(--ds-font-display);
    font-size: 1.35rem;
    line-height: 1.15;
    color: var(--ds-gold-light);
  }

  /* Mesma caixinha do .rk-faixa, um pouco maior porque aqui ela não divide a
     linha com mais nada. */
  .pf-faixa {
    display: inline-block;
    width: 32px;
    height: 11px;
    border-radius: 2px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: var(--faixa);
  }

  .pf-stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }

  .pf-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: 10px 6px;
    border: 1px solid var(--ds-line);
    border-radius: 12px;
    background: var(--ds-bg);
  }

  /* Número dourado em Cinzel, rótulo apagado embaixo: é como o .rk-valor do
     ranking e o .mural-numeros do mural desenham a mesma coisa. Aqui estava ao
     contrário, rótulo dourado em caixa alta e número na fonte do corpo, e era
     isso que destoava do resto do site. */
  .pf-stat .label {
    font-size: 0.64rem;
    letter-spacing: 0.04em;
    text-align: center;
    color: var(--ds-text-4);
  }

  .pf-stat .value {
    font-family: var(--ds-font-display);
    font-size: 1.35rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--ds-gold);
  }

  .pf-sec {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 4px 10px;
    margin: 1.2em 0 0.5em;
    font-family: var(--ds-font-display);
    font-size: 1rem;
    color: var(--ds-gold);
  }

  .pf-base {
    font-family: inherit;
    font-size: 0.7rem;
    font-weight: 400;
    color: var(--ds-text-5);
  }

  .pf-classes {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .pf-classes > li {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: baseline;
    gap: 2px 10px;
    padding: 12px 14px;
    border: 1px solid var(--ds-line);
    border-radius: 13px;
    background: var(--ds-surface);
  }

  .pf-classe-nome {
    font-family: var(--ds-font-display);
    font-size: 0.95rem;
    font-weight: 600;
  }

  .pf-classe-nivel {
    justify-self: end;
    font-size: 0.76rem;
    color: var(--ds-gold);
  }

  .pf-classe-treinos {
    font-size: 0.74rem;
    color: var(--ds-text-4);
  }

  .pf-classe-rank {
    justify-self: end;
    font-size: 0.7rem;
    color: var(--ds-text-5);
    text-decoration: none;
    white-space: nowrap;
  }

  .pf-classe-rank strong {
    font-family: var(--ds-font-display);
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--ds-text-2);
  }

  /* Ouro, prata e bronze, os mesmos do ranking. Depois do :hover de propósito,
     igual à ficha própria: no pódio a cor é informação, não estado de ponteiro. */
  .pf-classe-rank.podio-1 strong {
    color: var(--ds-gold-light);
  }

  .pf-classe-rank.podio-2 strong {
    color: var(--ds-prata);
  }

  .pf-classe-rank.podio-3 strong {
    color: var(--ds-bronze);
  }

  .pf-casas {
    grid-column: 1 / -1;
    display: flex;
    gap: 3px;
    margin: 6px 0 0;
    padding: 0;
    list-style: none;
  }

  .pf-casas > li {
    flex: 1;
    height: 6px;
    border-radius: 3px;
    border: 1px solid var(--ds-line-strong);
    background: rgba(255, 255, 255, 0.04);
  }

  .pf-casas > li.cheia {
    border-color: var(--ds-gold);
    background: var(--ds-gold);
  }

  /* Os quatro números continuam numa linha só no celular, e quem cede é o
     tamanho do rótulo, não a quantidade de colunas. Em duas linhas de dois, a
     leitura vira comparação entre pares que não têm nada a ver um com o outro. */
  @media (max-width: 460px) {
    .pf-stats {
      gap: 5px;
    }

    .pf-stat {
      padding: 9px 3px;
    }

    .pf-stat .label {
      font-size: 0.56rem;
      letter-spacing: 0.01em;
    }

    .pf-stat .value {
      font-size: 1.1rem;
    }
  }
</style>
