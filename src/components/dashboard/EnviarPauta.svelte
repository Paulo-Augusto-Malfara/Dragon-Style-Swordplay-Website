<script lang="ts">
  /*
   * Créditos de pauta na ficha do membro, e a janela que gasta um deles.
   *
   * O saldo NÃO é uma coluna do banco: é o teto do mês menos as pautas que a
   * pessoa já mandou neste mês (ver `meus_creditos_pauta`). Por isso aqui não
   * existe "resetar" nem estado guardado no cliente — depois de enviar, o
   * número é relido do banco, que é o único que sabe contar.
   *
   * O bloco não entra na grade de `.ficha-stats`: aquela grade é de quatro
   * colunas fixas e no celular de 320px os quatro já estão espremidos, um
   * quinto quebraria a linha. Aqui é cartão próprio, largura cheia.
   */
  import { onMount } from "svelte";

  interface Props {
    /* A mesma promessa preguiçosa do MemberDashboard: a página do perfil é
       estática, e um import estático do cliente Supabase é avaliado na passada
       de SSR do build, o que já derrubou a build inteira uma vez. */
    getSupabase: () => Promise<any>;
  }
  const { getSupabase }: Props = $props();

  const CATEGORIAS = [
    { id: "ideia", rotulo: "Ideia" },
    { id: "sugestao", rotulo: "Sugestão" },
    { id: "critica", rotulo: "Crítica" },
    { id: "nova_modalidade", rotulo: "Nova modalidade" },
  ];

  const TITULO_MAX = 120;
  const CORPO_MAX = 4000;
  const OBJETIVO_MAX = 200;

  let teto = $state(0);
  let saldo = $state(0);
  let carregando = $state(true);

  let dialogo: HTMLDialogElement;
  let categoria = $state("ideia");
  let titulo = $state("");
  let corpo = $state("");
  /* Uma linha dizendo o que a pauta quer melhorar. Opcional, e serve pro staff
     entender a proposta antes de abrir o corpo inteiro na reunião. Vai no mesmo
     `proposta` jsonb que a modalidade usa, que é onde mora o extra estruturado
     de cada categoria. */
  let resumoObjetivo = $state("");
  /* Campos da proposta de modalidade, um item por linha, do mesmo jeito que o
     ModalidadeEditor do painel pede. A descrição não está aqui: ela é o
     `corpo`, que toda pauta tem. */
  let objetivo = $state("");
  let pontuacao = $state("");
  let requisitos = $state("");
  let variacoes = $state("");
  let minParticipantes = $state(0);

  let enviando = $state(false);
  let erro = $state("");

  const ehModalidade = $derived(categoria === "nova_modalidade");
  const podeEnviar = $derived(
    saldo > 0 &&
      titulo.trim().length >= 5 &&
      titulo.trim().length <= TITULO_MAX &&
      corpo.trim().length >= 10 &&
      corpo.trim().length <= CORPO_MAX,
  );

  const linhas = (texto: string) =>
    texto
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

  async function carregar() {
    const supabase = await getSupabase();
    const { data } = await supabase.rpc("meus_creditos_pauta");
    if (data) {
      teto = data.teto ?? 0;
      saldo = data.saldo ?? 0;
    }
    carregando = false;
  }

  onMount(carregar);

  function abrir() {
    if (saldo <= 0) return;
    erro = "";
    dialogo.showModal();
  }

  function fechar() {
    if (dialogo.open) dialogo.close();
  }

  async function enviar(e: SubmitEvent) {
    e.preventDefault();
    if (!podeEnviar || enviando) return;
    enviando = true;
    erro = "";

    const supabase = await getSupabase();
    const { error } = await supabase.rpc("enviar_pauta", {
      p_categoria: categoria,
      p_titulo: titulo.trim(),
      p_corpo: corpo.trim(),
      p_proposta: ehModalidade
        ? {
            objective: linhas(objetivo),
            scoring_respawn: linhas(pontuacao),
            requirements: linhas(requisitos),
            variations: linhas(variacoes),
            min_participantes: Number(minParticipantes) || 0,
          }
        : resumoObjetivo.trim()
          ? { objetivo: resumoObjetivo.trim() }
          : null,
    });

    enviando = false;
    if (error) {
      erro = error.message;
      return;
    }

    titulo = "";
    corpo = "";
    resumoObjetivo = "";
    objetivo = "";
    pontuacao = "";
    requisitos = "";
    variacoes = "";
    minParticipantes = 0;
    fechar();
    await carregar();
  }

</script>

{#if !carregando}
  <section class="pautas" aria-label="Créditos de pauta">
    {#if teto > 0}
      <button type="button" class="pautas-cartao" onclick={abrir} disabled={saldo <= 0}>
        <span class="pautas-numero">{saldo}<span class="pautas-de">/{teto}</span></span>
        <span class="pautas-texto">
          <span class="pautas-titulo">Créditos de pauta</span>
          <span class="pautas-sub">
            {#if saldo > 0}
              Mande uma ideia, sugestão, crítica ou proponha uma modalidade.
            {:else}
              Seus créditos deste mês acabaram. Volta tudo no dia 1º.
            {/if}
          </span>
        </span>
      </button>
    {:else}
      <p class="pautas-vazio">
        Créditos de pauta começam na faixa Amarela, no nível geral 3. Cada
        graduação dali pra frente vale mais um por mês.
      </p>
    {/if}

  </section>
{/if}

<dialog
  bind:this={dialogo}
  class="janela barra-fina"
  aria-label="Nova pauta"
  onclick={(e) => {
    if (e.target === dialogo) fechar();
  }}
>
  <div class="janela-barra">
    <button type="button" class="janela-fechar" onclick={fechar} aria-label="Fechar">✕</button>
  </div>

  <form class="admin-form" onsubmit={enviar}>
    <p class="admin-form-titulo">Do que se trata</p>
    <div class="cats">
      {#each CATEGORIAS as c (c.id)}
        <button
          type="button"
          class="cat"
          class:cat--ativa={categoria === c.id}
          onclick={() => (categoria = c.id)}
        >
          {c.rotulo}
        </button>
      {/each}
    </div>

    <div class="campos">
      <label class="campo-largo">
        Título
        <input type="text" bind:value={titulo} maxlength={TITULO_MAX} required />
        <small>{titulo.trim().length}/{TITULO_MAX}</small>
      </label>

      {#if !ehModalidade}
        <label class="campo-largo">
          Objetivo (opcional)
          <input type="text" bind:value={resumoObjetivo} maxlength={OBJETIVO_MAX} />
          <small>
            Resuma em poucas palavras o que essa {CATEGORIAS.find((c) => c.id === categoria)
              ?.rotulo.toLowerCase()} almeja melhorar ou corrigir.
          </small>
        </label>
      {/if}

      <label class="campo-largo">
        {ehModalidade ? "Como a modalidade funciona" : "Escreva com calma"}
        <textarea bind:value={corpo} rows={ehModalidade ? 5 : 9} maxlength={CORPO_MAX}></textarea>
        <small>{corpo.trim().length}/{CORPO_MAX}</small>
      </label>
    </div>

    {#if ehModalidade}
      <p class="admin-form-titulo">Regras da modalidade</p>
      <p class="admin-form-nota">
        Um item por linha. Nada disso vai pro site agora: é a proposta que o
        staff lê na reunião. O endereço da página quem escolhe é quem publica.
      </p>
      <div class="campos">
        <label>
          Objetivo e condição de vitória
          <textarea bind:value={objetivo} rows="3"></textarea>
        </label>
        <label>
          Pontuação e respawn
          <textarea bind:value={pontuacao} rows="3"></textarea>
        </label>
        <label>
          Requisitos e armas permitidas
          <textarea bind:value={requisitos} rows="3"></textarea>
        </label>
        <label>
          Regras específicas e variações
          <textarea bind:value={variacoes} rows="3"></textarea>
        </label>
        <label>
          Mínimo de participantes
          <input type="number" bind:value={minParticipantes} min="0" max="200" step="1" />
        </label>
      </div>
    {/if}

    <div class="form-acoes">
      <button type="submit" class="btn btn-primary" disabled={!podeEnviar || enviando}>
        {enviando ? "Enviando..." : "Gastar 1 crédito e mandar"}
      </button>
      <button type="button" class="btn btn-ghost" onclick={fechar}>Cancelar</button>
    </div>

    {#if erro}
      <p class="admin-error" role="alert">{erro}</p>
    {/if}
  </form>
</dialog>

<style>
  /* Ver a mesma nota em PautasMural: o `p { width: 90%; margin: auto }` do
     global.css é pra texto corrido de página, e dentro de cartão ele encolhe e
     centraliza o parágrafo. */
  p {
    width: 100%;
    margin: 0;
  }

  .pautas {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .pautas-cartao {
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
    padding: 12px 14px;
    border: 1px solid var(--ds-line);
    border-radius: 12px;
    background: var(--ds-bg);
    color: inherit;
    text-align: left;
    cursor: pointer;
  }

  .pautas-cartao:disabled {
    cursor: default;
    opacity: 0.65;
  }

  /* Número dourado em Cinzel, rótulo apagado: a mesma hierarquia do
     `.ficha-stat` logo acima, pra não parecer outro sistema. */
  .pautas-numero {
    flex: none;
    font-family: var(--ds-font-display);
    font-size: 1.6rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--ds-gold);
  }

  .pautas-de {
    font-size: 0.9rem;
    color: var(--ds-text-4);
  }

  .pautas-texto {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .pautas-titulo {
    font-size: 0.9rem;
  }

  .pautas-sub,
  .pautas-vazio {
    font-size: 0.78rem;
    color: var(--ds-text-4);
  }

  .cats {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .cat {
    padding: 6px 12px;
    border: 1px solid var(--ds-line);
    border-radius: 999px;
    background: var(--ds-bg);
    color: var(--ds-text-3);
    font-size: 0.82rem;
    cursor: pointer;
  }

  .cat--ativa {
    border-color: var(--ds-gold);
    color: var(--ds-gold);
  }
</style>
