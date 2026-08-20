<script lang="ts">
  /*
   * O que aconteceu com as pautas que a pessoa mandou.
   *
   * Ela não entra no painel, então este é o único lugar onde ela vê o destino
   * do que escreveu. A lista fica no fim da ficha, no mesmo desenho de
   * "Últimas presenças" (as classes .presencas-lista são globais), e a janela
   * devolve o texto que ela escreveu, que ninguém guarda de cabeça.
   *
   * "Adiada" não é status: adiada devolve a pauta pra fila. O que separa uma
   * pauta nova de uma adiada é a coluna `decisao` do último desfecho.
   */
  import { onMount } from "svelte";
  import AnexosPauta from "../AnexosPauta.svelte";

  interface Props {
    /* A mesma promessa preguiçosa do MemberDashboard: a página do perfil é
       estática, e um import estático do cliente Supabase é avaliado na passada
       de SSR do build. */
    getSupabase: () => Promise<any>;
  }
  const { getSupabase }: Props = $props();

  const POR_PAGINA = 5;

  const CATEGORIA: Record<string, string> = {
    ideia: "Ideia",
    sugestao: "Sugestão",
    critica: "Crítica",
    nova_modalidade: "Nova modalidade",
  };

  let itens = $state<any[]>([]);
  let carregando = $state(true);
  let pagina = $state(1);
  let aberta = $state<any>(null);
  let dialogo: HTMLDialogElement;
  /* Guardado no onMount pra não chamar `getSupabase()` a cada desenho: as
     miniaturas do anexo precisam do cliente e não devem virar promessa nova. */
  let cliente = $state<any>(null);

  /* Um rótulo só, usado no selo da linha e no cabeçalho da janela. */
  const situacao = (p: any) => {
    if (p.status === "aberta") return p.decisao === "adiada" ? "adiada" : "aberta";
    if (p.status === "validada" || p.status === "aprovada") return "aprovada";
    return p.status;
  };

  const ROTULO: Record<string, string> = {
    aberta: "Na fila",
    adiada: "Adiada",
    em_teste: "Em teste",
    aprovada: "Aprovada",
    recusada: "Recusada",
    arquivada: "Arquivada",
  };

  const conta = (s: string) => itens.filter((p) => situacao(p) === s).length;

  const resumo = $derived([
    { rotulo: "Na fila", n: conta("aberta") },
    { rotulo: "Aprovadas", n: conta("aprovada") },
    { rotulo: "Recusadas", n: conta("recusada") },
    { rotulo: "Em teste", n: conta("em_teste") },
    { rotulo: "Adiadas", n: conta("adiada") },
  ]);

  const totalPaginas = $derived(Math.max(1, Math.ceil(itens.length / POR_PAGINA)));
  const daPagina = $derived(itens.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA));

  onMount(async () => {
    const supabase = await getSupabase();
    cliente = supabase;
    // O filtro por id_membro é obrigatório, e não redundante com a RLS: a
    // policy de fPautas é `is_staff() or id_membro = current_membro_id()`,
    // então pra quem é staff ela deixa passar o mural inteiro. Aqui a lista é
    // "meus feedbacks", e staff também é membro.
    const { data: eu } = await supabase.rpc("current_membro_id");
    if (!eu) {
      carregando = false;
      return;
    }
    const { data } = await supabase
      .from("fPautas")
      .select("id_pauta, categoria, titulo, corpo, proposta, status, decisao, motivo_decisao, anexos, criada_em")
      .eq("id_membro", eu)
      .order("criada_em", { ascending: false });
    itens = data ?? [];
    carregando = false;
  });

  function abrir(p: any) {
    aberta = p;
    dialogo.showModal();
  }

  function fechar() {
    if (dialogo.open) dialogo.close();
  }

  const dataBR = (d: string) =>
    new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

  const linhas = (v: any) => (Array.isArray(v) ? v : []);
</script>

{#if !carregando}
  <h2>Status dos Feedbacks</h2>

  {#if itens.length === 0}
    <!-- Mesmo tratamento de "Últimas presenças": a seção aparece vazia em vez
         de sumir, senão quem nunca mandou nada acha que a lista não existe. -->
    <!-- O texto não manda usar um crédito "lá em cima" porque quem está abaixo
         da faixa Amarela tem teto zero, e aí o cartão de créditos nem existe:
         a frase apontava pra um botão que não estava na tela. Quem tem crédito
         vê o cartão logo acima com o saldo, e não precisa da instrução. -->
    <p class="ficha-aviso">
      Você ainda não mandou nenhum feedback. Quando mandar uma ideia, sugestão,
      crítica ou proposta de modalidade, o destino dela aparece aqui.
    </p>
  {:else}
  <ul class="resumo">
    {#each resumo as r (r.rotulo)}
      <li><span class="resumo-n">{r.n}</span> {r.rotulo}</li>
    {/each}
  </ul>

  <ol class="presencas-lista feedbacks-lista">
    {#each daPagina as p (p.id_pauta)}
      <li>
        <button type="button" onclick={() => abrir(p)}>
          <span class="presenca-data">{dataBR(p.criada_em)}</span>
          <span class="presenca-classe">{p.titulo}</span>
          <span class="status-badge status-badge--{situacao(p)}">{ROTULO[situacao(p)]}</span>
        </button>
      </li>
    {/each}
  </ol>

  <!-- Mesmas classes do Ranking Geral, como nas presenças logo acima: a lista
       inteira já está na memória, então trocar de página não pede nada. -->
  {#if totalPaginas > 1}
    <nav class="ranking-pagination" aria-label="Páginas dos feedbacks">
      <button class="chip" onclick={() => (pagina -= 1)} disabled={pagina === 1} aria-label="Página anterior">
        ‹
      </button>
      {#each { length: totalPaginas } as _, i}
        <button
          class="chip"
          class:ativo={pagina === i + 1}
          onclick={() => (pagina = i + 1)}
          aria-current={pagina === i + 1 ? "page" : undefined}
        >
          {i + 1}
        </button>
      {/each}
      <button
        class="chip"
        onclick={() => (pagina += 1)}
        disabled={pagina === totalPaginas}
        aria-label="Próxima página"
      >
        ›
      </button>
    </nav>
  {/if}
  {/if}
{/if}

<dialog
  bind:this={dialogo}
  class="janela barra-fina"
  aria-label="Meu feedback"
  onclick={(e) => {
    if (e.target === dialogo) fechar();
  }}
>
  <div class="janela-barra">
    <button type="button" class="janela-fechar" onclick={fechar} aria-label="Fechar">✕</button>
  </div>

  {#if aberta}
    <div class="det">
      <span class="det-selos">
        <span class="status-badge status-badge--{situacao(aberta)}">{ROTULO[situacao(aberta)]}</span>
        <span class="tag">{CATEGORIA[aberta.categoria] ?? aberta.categoria}</span>
      </span>
      <h2 class="det-titulo">{aberta.titulo}</h2>
      <p class="det-quando">Enviado em {dataBR(aberta.criada_em)}</p>

      <!-- Recusada e adiada chegam com explicação, e ela vem antes do que a
           pessoa escreveu: é a resposta que ela veio buscar aqui. -->
      {#if aberta.motivo_decisao}
        <p class="det-motivo">
          <span class="det-rotulo">Por que a decisão foi essa</span>
          {aberta.motivo_decisao}
        </p>
      {/if}

      {#if aberta.categoria !== "nova_modalidade" && aberta.proposta?.objetivo}
        <p class="det-rotulo">Objetivo</p>
        <p class="det-corpo">{aberta.proposta.objetivo}</p>
        <p class="det-rotulo">O que você escreveu</p>
      {/if}

      <p class="det-corpo">{aberta.corpo}</p>

      {#if aberta.categoria === "nova_modalidade" && aberta.proposta}
        {#each [["Objetivo e condição de vitória", "objective"], ["Pontuação e respawn", "scoring_respawn"], ["Requisitos e armas", "requirements"], ["Regras e variações", "variations"]] as [rotulo, chave] (chave)}
          {#if linhas(aberta.proposta[chave]).length > 0}
            <p class="det-rotulo">{rotulo}</p>
            <ul class="det-lista">
              {#each linhas(aberta.proposta[chave]) as item, i (i)}
                <li>{item}</li>
              {/each}
            </ul>
          {/if}
        {/each}
      {/if}

      {#if cliente}
        <AnexosPauta caminhos={aberta.anexos} {cliente} />
      {/if}
    </div>
  {/if}
</dialog>

<style>
  /* Ver a nota no EnviarPauta: o `p { width: 90%; margin: auto }` do global.css
     é pra texto corrido de página, e aqui ele desloca cada parágrafo. */
  p {
    width: 100%;
    margin: 0;
  }

  .resumo {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 16px;
    margin: 0 0 10px;
    padding: 0;
    list-style: none;
    font-size: 0.78rem;
    color: var(--ds-text-4);
  }

  .resumo-n {
    font-family: var(--ds-font-display);
    font-variant-numeric: tabular-nums;
    color: var(--ds-gold);
  }

  /* A linha inteira é o botão, e não um pedaço dela: o padding sai do `li` e
     vai pro botão, senão sobra uma borda clicável em volta que não faz nada. */
  .feedbacks-lista > li {
    padding: 0;
  }

  .feedbacks-lista li > button {
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
    padding: 12px 16px;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .feedbacks-lista li > button:hover {
    background: var(--ds-gold-wash);
  }

  .det {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .det-selos {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .det-titulo {
    margin: 0;
    font-size: 1.2rem;
    color: var(--ds-gold);
  }

  .det-quando {
    font-size: 0.8rem;
    color: var(--ds-text-4);
  }

  .det-corpo {
    white-space: pre-wrap;
    line-height: 1.55;
  }

  .det-rotulo {
    font-size: 0.68rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ds-text-4);
  }

  .det-motivo {
    padding: 10px 12px;
    border: 1px solid var(--ds-line);
    border-left: 3px solid var(--ds-gold-dim);
    border-radius: 8px;
    background: var(--ds-surface);
    white-space: pre-wrap;
    line-height: 1.55;
  }

  .det-motivo .det-rotulo {
    display: block;
    margin-bottom: 4px;
  }

  .det-lista {
    margin: 0;
    padding-left: 18px;
    list-style: disc;
    line-height: 1.5;
  }
</style>
