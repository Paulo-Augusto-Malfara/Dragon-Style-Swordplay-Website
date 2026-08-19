<script lang="ts">
  /*
   * Mural de pautas.
   *
   * Duas votações moram aqui e são coisas diferentes:
   *
   * 1. Voto de PRIORIDADE (fPautaVotos): 3 por staff por reunião, decide quais
   *    pautas entram na reunião. Abre quando a reunião é agendada e fecha 24h
   *    antes dela, e é a `pauta_votacao_aberta` no banco que manda -- o que
   *    esta tela desenha é só o aviso. Nunca deixe só o lado da tela.
   *
   * 2. Voto de DECISÃO (fPautaDecisaoVotos): acontece durante a reunião, o
   *    organizador abre e fecha, e é o que define o desfecho. As opções mudam
   *    conforme a rodada: pauta na fila decide mérito (validada/recusada/
   *    adiada), modalidade em teste decide o fim do teste (aprovada/recusada/
   *    mais tempo).
   *
   * Tudo que aparece na tela é texto puro por interpolação, que o Svelte
   * escapa. Nenhum `{@html}` aqui, e não introduza um.
   */
  import { onMount, onDestroy } from "svelte";
  import { supabase } from "../../lib/supabase-browser";
  import ConfirmarAcao from "./ConfirmarAcao.svelte";

  interface Props {
    isOrganizador: boolean;
    isAdminSistema: boolean;
  }
  const { isOrganizador, isAdminSistema }: Props = $props();

  const CATEGORIA: Record<string, string> = {
    ideia: "Ideia",
    sugestao: "Sugestão",
    critica: "Crítica",
    nova_modalidade: "Nova modalidade",
  };

  const STATUS: Record<string, string> = {
    aberta: "Na fila",
    em_teste: "Em teste",
    validada: "Validada",
    recusada: "Recusada",
    aprovada: "Aprovada",
    arquivada: "Arquivada",
  };

  /* Rótulo de cada opção de decisão, por rodada. */
  const OPCOES_MERITO = [
    { id: "validada", rotulo: "Validada" },
    { id: "recusada", rotulo: "Recusada" },
    { id: "adiada", rotulo: "Adiada" },
  ];
  const OPCOES_TESTE = [
    { id: "aprovada", rotulo: "Aprovada" },
    { id: "recusada", rotulo: "Recusada" },
    { id: "mais_teste", rotulo: "Mais tempo de teste" },
  ];

  let pautas = $state<any[]>([]);
  let reuniao = $state<any>(null);
  let euId = $state<number | null>(null);
  let carregando = $state(true);
  let erro = $state("");
  let filtro = $state<"fila" | "teste" | "arquivo">("fila");

  let abertaId = $state<number | null>(null);
  let comentarios = $state<any[]>([]);
  let decisaoVotos = $state<any[]>([]);
  let mensagem = $state("");
  let ocupado = $state(false);
  let dialogo: HTMLDialogElement;
  let confirmar: ConfirmarAcao;
  let canal: any = null;
  let agora = $state(Date.now());
  let tique: ReturnType<typeof setInterval> | undefined;

  const aberta = $derived(pautas.find((p) => p.id_pauta === abertaId) ?? null);

  const janelaFecha = $derived(
    reuniao ? new Date(reuniao.data_hora).getTime() - 24 * 3600 * 1000 : 0,
  );
  const janelaAberta = $derived(!!reuniao && agora < janelaFecha);

  const naFila = $derived(pautas.filter((p) => p.status === "aberta"));
  const emTeste = $derived(pautas.filter((p) => p.status === "em_teste"));
  const arquivo = $derived(
    pautas.filter((p) => !["aberta", "em_teste"].includes(p.status)),
  );
  const visiveis = $derived(
    filtro === "fila" ? naFila : filtro === "teste" ? emTeste : arquivo,
  );

  /* O teto é o mesmo da `votar_pauta` no banco, que é quem recusa de verdade.
     Aqui ele só desenha e desabilita o botão. */
  const VOTOS_POR_REUNIAO = 3;

  /* Votos que a pessoa já gastou nesta reunião. Sai da própria lista, e não de
     uma consulta à parte, pra não existirem dois números que podem divergir. */
  const votosUsados = $derived(naFila.filter((p) => p.votei).length);

  async function carregar() {
    const [lista, prox, eu] = await Promise.all([
      supabase.from("v_pautas_mural").select("*").order("votos", { ascending: false }),
      supabase
        .from("fReunioes")
        .select("id_reuniao, data_hora, local, status")
        .eq("status", "agendada")
        .gt("data_hora", new Date().toISOString())
        .order("data_hora")
        .limit(1)
        .maybeSingle(),
      supabase.rpc("current_membro_id"),
    ]);
    erro = lista.error?.message ?? "";
    pautas = lista.data ?? [];
    reuniao = prox.data ?? null;
    euId = eu.data ?? null;
    carregando = false;
  }

  onMount(() => {
    carregar();
    tique = setInterval(() => (agora = Date.now()), 30_000);
  });

  onDestroy(() => {
    if (tique) clearInterval(tique);
    if (canal) supabase.removeChannel(canal);
  });

  async function abrirPauta(id: number) {
    abertaId = id;
    comentarios = [];
    decisaoVotos = [];
    mensagem = "";
    dialogo.showModal();
    await carregarConversa(id);

    if (canal) supabase.removeChannel(canal);
    // Discussão e apuração ao vivo: durante a reunião todo mundo está com a
    // mesma pauta aberta, e recarregar na mão não é opção.
    canal = supabase
      .channel(`pauta-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "fPautaComentarios", filter: `id_pauta=eq.${id}` },
        () => carregarConversa(id),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "fPautaDecisaoVotos", filter: `id_pauta=eq.${id}` },
        () => carregarConversa(id),
      )
      .subscribe();
  }

  async function carregarConversa(id: number) {
    const [cs, ds] = await Promise.all([
      supabase
        .from("fPautaComentarios")
        .select("id_comentario, mensagem, criado_em, id_membro, dMembros(nome, apelido)")
        .eq("id_pauta", id)
        .order("criado_em"),
      supabase.from("fPautaDecisaoVotos").select("id_membro, opcao").eq("id_pauta", id),
    ]);
    comentarios = cs.data ?? [];
    decisaoVotos = ds.data ?? [];
  }

  function fechar() {
    if (canal) {
      supabase.removeChannel(canal);
      canal = null;
    }
    abertaId = null;
    if (dialogo.open) dialogo.close();
  }

  async function chamar(fn: string, args: Record<string, unknown>, recarregarConversa = false) {
    ocupado = true;
    erro = "";
    const { error } = await supabase.rpc(fn, args);
    ocupado = false;
    if (error) {
      erro = error.message;
      return false;
    }
    await carregar();
    if (recarregarConversa && abertaId) await carregarConversa(abertaId);
    return true;
  }

  const votar = (p: any) =>
    chamar(p.votei ? "desvotar_pauta" : "votar_pauta", { p_id_pauta: p.id_pauta });

  async function comentar(e: SubmitEvent) {
    e.preventDefault();
    const texto = mensagem.trim();
    if (!texto || ocupado || !abertaId) return;
    if (await chamar("comentar_pauta", { p_id_pauta: abertaId, p_mensagem: texto }, true)) {
      mensagem = "";
    }
  }

  async function fecharDecisao(override: string | null) {
    if (!abertaId) return;
    const ok = await confirmar.pedir({
      titulo: override ? `Encerrar como "${rotuloOpcao(override)}"?` : "Encerrar a votação?",
      texto: override
        ? "O desfecho fica registrado como escolha do organizador, e não como resultado da contagem."
        : "Vale a opção mais votada. Se der empate, você escolhe.",
      acao: "Encerrar",
    });
    if (!ok) return;
    await chamar("fechar_decisao", { p_id_pauta: abertaId, p_override: override }, true);
  }

  async function arquivar() {
    if (!abertaId) return;
    const ok = await confirmar.pedir({
      titulo: "Arquivar esta pauta?",
      texto: "Ela sai da fila sem passar por reunião. O crédito do autor não volta.",
      acao: "Arquivar",
      perigo: true,
    });
    if (!ok) return;
    if (await chamar("arquivar_pauta", { p_id_pauta: abertaId })) fechar();
  }

  const opcoesDa = (p: any) => (p.status === "em_teste" ? OPCOES_TESTE : OPCOES_MERITO);
  const rotuloOpcao = (id: string) =>
    [...OPCOES_MERITO, ...OPCOES_TESTE].find((o) => o.id === id)?.rotulo ?? id;
  const contar = (opcao: string) => decisaoVotos.filter((v) => v.opcao === opcao).length;
  const meuVoto = $derived(decisaoVotos.find((v) => v.id_membro === euId)?.opcao ?? null);

  const nomeDe = (m: any) => (m?.apelido?.trim() ? m.apelido : (m?.nome ?? "Alguém"));

  const dataHoraBR = (d: string) =>
    new Date(d).toLocaleString("pt-BR", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  const horaBR = (d: string) =>
    new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  /* Quanto falta pra janela fechar, em dia e hora. Sem segundos: o número não
     precisa de precisão, precisa de "dá tempo" ou "não dá". */
  function faltam(alvo: number) {
    const ms = alvo - agora;
    if (ms <= 0) return "";
    const horas = Math.floor(ms / 3600000);
    const dias = Math.floor(horas / 24);
    if (dias >= 1) return `${dias}d ${horas % 24}h`;
    if (horas >= 1) return `${horas}h`;
    return `${Math.max(Math.floor(ms / 60000), 1)}min`;
  }

  const linhasDe = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);
</script>

<ConfirmarAcao bind:this={confirmar} />

{#if carregando}
  <div class="esqueleto esqueleto-form"></div>
{:else}
  <section class="cabeca">
    {#if reuniao}
      <p class="cabeca-linha">
        <span class="cabeca-rotulo">Próxima reunião</span>
        <span class="cabeca-valor">{dataHoraBR(reuniao.data_hora)}</span>
        {#if reuniao.local}<span class="cabeca-local">{reuniao.local}</span>{/if}
      </p>
      {#if janelaAberta}
        <!-- Mesmo par número+rótulo do cartão de créditos do perfil: o staff
             precisa bater o olho e saber quantos votos ainda tem na mão. -->
        <div class="votos-saldo">
          <span class="votos-numero">{VOTOS_POR_REUNIAO - votosUsados}<span class="votos-de"
              >/{VOTOS_POR_REUNIAO}</span
            ></span>
          <span class="votos-texto">
            <span class="votos-titulo">
              {VOTOS_POR_REUNIAO - votosUsados === 1 ? "voto restante" : "votos restantes"}
            </span>
            <span class="votos-sub">
              {#if votosUsados >= VOTOS_POR_REUNIAO}
                Você já usou os {VOTOS_POR_REUNIAO}. Tire um voto para mover para outra pauta.
              {:else}
                A votação fecha em {faltam(janelaFecha)}.
              {/if}
            </span>
          </span>
        </div>
      {:else}
        <p class="cabeca-sub">Votação encerrada: falta menos de 24h para a reunião.</p>
      {/if}
    {:else}
      <p class="cabeca-sub">
        Nenhuma reunião agendada. As pautas ficam esperando, e a votação só abre
        quando um organizador marcar a próxima na Agenda.
      </p>
    {/if}
  </section>

  <div class="abas" role="tablist">
    <button
      type="button"
      role="tab"
      class="aba"
      class:aba--ativa={filtro === "fila"}
      aria-selected={filtro === "fila"}
      onclick={() => (filtro = "fila")}>Fila ({naFila.length})</button
    >
    <button
      type="button"
      role="tab"
      class="aba"
      class:aba--ativa={filtro === "teste"}
      aria-selected={filtro === "teste"}
      onclick={() => (filtro = "teste")}>Em teste ({emTeste.length})</button
    >
    <button
      type="button"
      role="tab"
      class="aba"
      class:aba--ativa={filtro === "arquivo"}
      aria-selected={filtro === "arquivo"}
      onclick={() => (filtro = "arquivo")}>Decididas ({arquivo.length})</button
    >
  </div>

  {#if erro}
    <p class="admin-error" role="alert">{erro}</p>
  {/if}

  {#if visiveis.length === 0}
    <p class="vazio">Nada por aqui ainda.</p>
  {:else}
    <ul class="cards">
      {#each visiveis as p (p.id_pauta)}
        <li class="card" class:card--principal={filtro === "fila" && p.posicao <= 3}>
          <button type="button" class="card-corpo" onclick={() => abrirPauta(p.id_pauta)}>
            <span class="card-tags">
              <span class="status-badge status-badge--{p.status}">{STATUS[p.status]}</span>
              <span class="tag">{CATEGORIA[p.categoria]}</span>
              {#if filtro === "fila" && p.posicao <= 3}
                <span class="tag tag--principal">Pauta da reunião</span>
              {/if}
            </span>
            <span class="card-titulo">{p.titulo}</span>
            <span class="card-meta">
              {p.autor} · {p.comentarios} comentário{p.comentarios === 1 ? "" : "s"}
              {#if p.decisao_aberta_em}· <strong>votação aberta</strong>{/if}
            </span>
          </button>

          {#if p.status === "aberta"}
            <div class="card-voto">
              <span class="card-votos">{p.votos}</span>
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                disabled={!janelaAberta || ocupado || (!p.votei && votosUsados >= VOTOS_POR_REUNIAO)}
                onclick={() => votar(p)}
              >
                {p.votei ? "Tirar voto" : "Votar"}
              </button>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
{/if}

<dialog
  bind:this={dialogo}
  class="janela janela--larga barra-fina"
  aria-label="Pauta"
  onclick={(e) => {
    if (e.target === dialogo) fechar();
  }}
>
  <div class="janela-barra">
    <button type="button" class="janela-fechar" onclick={fechar} aria-label="Fechar">✕</button>
  </div>

  {#if aberta}
    <!-- A janela empilha bloco atrás de bloco, e o reset do site zera a margem
         de tudo: sem esta casca com gap, título, corpo, proposta, votação e
         discussão colam uns nos outros. -->
    <div class="det">
    <span class="card-tags">
      <span class="status-badge status-badge--{aberta.status}">{STATUS[aberta.status]}</span>
      <span class="tag">{CATEGORIA[aberta.categoria]}</span>
    </span>
    <h2 class="det-titulo">{aberta.titulo}</h2>
    <p class="det-autor">Por {aberta.autor} · {horaBR(aberta.criada_em)}</p>

    {#if aberta.categoria !== "nova_modalidade" && aberta.proposta?.objetivo}
      <p class="det-rotulo">Objetivo</p>
      <p class="det-corpo">{aberta.proposta.objetivo}</p>
      <p class="det-rotulo">O que foi escrito</p>
    {/if}

    <p class="det-corpo">{aberta.corpo}</p>

    {#if aberta.categoria === "nova_modalidade" && aberta.proposta}
      <div class="det-proposta">
        {#each [["Objetivo e condição de vitória", "objective"], ["Pontuação e respawn", "scoring_respawn"], ["Requisitos e armas", "requirements"], ["Regras e variações", "variations"]] as [rotulo, chave] (chave)}
          {#if linhasDe(aberta.proposta[chave]).length > 0}
            <p class="det-rotulo">{rotulo}</p>
            <ul class="det-lista">
              {#each linhasDe(aberta.proposta[chave]) as item, i (i)}
                <li>{item}</li>
              {/each}
            </ul>
          {/if}
        {/each}
        {#if aberta.proposta.min_participantes}
          <p class="det-rotulo">Mínimo de participantes: {aberta.proposta.min_participantes}</p>
        {/if}
      </div>
    {/if}

    {#if isAdminSistema && aberta.status === "validada" && aberta.categoria === "nova_modalidade" && !aberta.id_modalidade}
      <p class="det-publicar">
        Aprovada no teste e esperando virar página.
        <a class="btn btn-primary" href={`/admin/modalidades/new?pauta=${aberta.id_pauta}`}>
          Publicar modalidade
        </a>
      </p>
    {/if}

    <!-- 2ª votação: só existe durante a reunião, e só o organizador abre e
         fecha. O staff vê a apuração ao vivo enquanto discute. -->
    {#if aberta.decisao_aberta_em}
      <section class="decisao">
        <p class="det-rotulo">Votação em curso</p>
        <div class="decisao-opcoes">
          {#each opcoesDa(aberta) as o (o.id)}
            <button
              type="button"
              class="decisao-opcao"
              class:decisao-opcao--minha={meuVoto === o.id}
              disabled={ocupado}
              onclick={() =>
                chamar("votar_decisao", { p_id_pauta: aberta.id_pauta, p_opcao: o.id }, true)}
            >
              <span class="decisao-rotulo">{o.rotulo}</span>
              <span class="decisao-contagem">{contar(o.id)}</span>
            </button>
          {/each}
        </div>
        {#if isOrganizador}
          <div class="decisao-fechar">
            <button type="button" class="btn btn-primary" disabled={ocupado} onclick={() => fecharDecisao(null)}>
              Encerrar pela contagem
            </button>
            {#each opcoesDa(aberta) as o (o.id)}
              <button type="button" class="btn btn-ghost btn-sm" disabled={ocupado} onclick={() => fecharDecisao(o.id)}>
                Encerrar como {o.rotulo}
              </button>
            {/each}
          </div>
        {/if}
      </section>
    {:else if isOrganizador && ["aberta", "em_teste"].includes(aberta.status)}
      <div class="det-acoes">
        <button
          type="button"
          class="btn"
          disabled={ocupado || !aberta.id_reuniao}
          onclick={() => chamar("abrir_decisao", { p_id_pauta: aberta.id_pauta }, true)}
        >
          Abrir votação de decisão
        </button>
        <button type="button" class="btn btn-ghost btn-sm" disabled={ocupado} onclick={arquivar}>
          Arquivar
        </button>
      </div>
      {#if !aberta.id_reuniao}
        <p class="det-nota">A pauta só entra em votação depois de entrar na fila de uma reunião.</p>
      {/if}
    {/if}

    <section class="conversa">
      <p class="det-rotulo">Discussão</p>
      {#if comentarios.length === 0}
        <p class="det-nota">Ninguém comentou ainda.</p>
      {:else}
        <ul class="conversa-lista">
          {#each comentarios as c (c.id_comentario)}
            <li>
              <span class="conversa-quem">{nomeDe(c.dMembros)}</span>
              <span class="conversa-quando">{horaBR(c.criado_em)}</span>
              <p class="conversa-texto">{c.mensagem}</p>
            </li>
          {/each}
        </ul>
      {/if}

      {#if ["aberta", "em_teste"].includes(aberta.status)}
        <form class="conversa-form" onsubmit={comentar}>
          <textarea bind:value={mensagem} rows="2" maxlength="2000" placeholder="Escreva aqui"></textarea>
          <button type="submit" class="btn btn-sm" disabled={ocupado || !mensagem.trim()}>
            Comentar
          </button>
        </form>
      {:else}
        <p class="det-nota">Pauta decidida: a discussão está fechada.</p>
      {/if}
    </section>

    {#if erro}
      <p class="admin-error" role="alert">{erro}</p>
    {/if}
    </div>
  {/if}
</dialog>

<style>
  /* O global.css dá `p { width: 90%; margin: auto }` pra que o texto corrido
     das páginas do manual ganhe largura de leitura. Dentro de cartão e de
     janela aquilo vira parágrafo encolhido e boiando no meio da caixa, com
     cada bloco começando num recuo diferente. Qualquer componente novo que use
     <p> dentro de caixa precisa desta linha. */
  p {
    width: 100%;
    margin: 0;
  }

  .cabeca {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px 14px;
    border: 1px solid var(--ds-line);
    border-radius: 12px;
    background: var(--ds-bg);
  }

  .votos-saldo {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-top: 8px;
    padding: 10px 12px;
    border: 1px solid var(--ds-line);
    border-radius: 10px;
    background: var(--ds-surface);
  }

  .votos-numero {
    flex: none;
    font-family: var(--ds-font-display);
    font-size: 1.6rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--ds-gold);
  }

  .votos-de {
    font-size: 0.9rem;
    color: var(--ds-text-4);
  }

  .votos-texto {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .votos-titulo {
    font-size: 0.9rem;
  }

  .votos-sub {
    font-size: 0.78rem;
    color: var(--ds-text-4);
  }

  .cabeca-linha {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px;
  }

  .cabeca-rotulo {
    font-size: 0.68rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--ds-text-4);
  }

  .cabeca-valor {
    font-family: var(--ds-font-display);
    font-size: 1.1rem;
    color: var(--ds-gold);
  }

  .cabeca-local,
  .cabeca-sub,
  .vazio,
  .det-nota,
  .det-autor,
  .conversa-quando {
    font-size: 0.8rem;
    color: var(--ds-text-4);
  }

  .abas {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .aba {
    padding: 6px 12px;
    border: 1px solid var(--ds-line);
    border-radius: 999px;
    background: var(--ds-bg);
    color: var(--ds-text-3);
    font-size: 0.82rem;
    cursor: pointer;
  }

  .aba--ativa {
    border-color: var(--ds-gold);
    color: var(--ds-gold);
  }

  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 10px;
    list-style: none;
  }

  .card {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--ds-line);
    border-radius: 12px;
    background: var(--ds-bg);
    overflow: hidden;
  }

  /* As três primeiras da fila são as que entram na reunião. O contorno dourado
     é o mesmo destaque de "precisa de atenção" do hub. */
  .card--principal {
    border-color: var(--ds-gold-dim);
  }

  .card-corpo {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    padding: 12px;
    border: 0;
    background: none;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }

  .card-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }

  /* Etiqueta neutra ao lado do selo de status. Dimensiona pelo próprio texto,
     igual ao .status-badge, e nunca estica dentro do cartão. */
  .tag {
    display: inline-block;
    width: auto;
    min-width: 0;
    flex: none;
    padding: 0.3em 0.7em;
    border: 1px solid var(--ds-line);
    border-radius: 999px;
    background: var(--ds-bg-alt);
    color: var(--ds-text-4);
    font-size: 0.68rem;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .tag--principal {
    border-color: var(--ds-gold-dim);
    color: var(--ds-gold-deep);
  }

  .card-titulo {
    font-size: 0.95rem;
    line-height: 1.3;
  }

  .card-meta {
    font-size: 0.75rem;
    color: var(--ds-text-4);
  }

  .card-voto {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 12px;
    border-top: 1px solid var(--ds-line);
  }

  .card-votos {
    font-family: var(--ds-font-display);
    font-size: 1.3rem;
    font-variant-numeric: tabular-nums;
    color: var(--ds-gold);
  }

  .det {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .det-titulo {
    font-family: var(--ds-font-display);
    font-size: 1.35rem;
    color: var(--ds-gold);
  }

  .det-corpo,
  .conversa-texto {
    white-space: pre-wrap;
    line-height: 1.55;
  }

  .det-rotulo {
    margin-top: 4px;
    font-size: 0.68rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ds-text-4);
  }

  .det-lista {
    padding-left: 18px;
    list-style: disc;
    line-height: 1.5;
  }

  .det-proposta,
  .decisao,
  .conversa,
  .det-acoes,
  .det-publicar {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .det-acoes,
  .det-publicar,
  .decisao-fechar {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .decisao {
    padding: 12px;
    border: 1px solid var(--ds-gold-dim);
    border-radius: 12px;
    background: var(--ds-gold-wash);
  }

  .decisao-opcoes {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .decisao-opcao {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border: 1px solid var(--ds-line-strong);
    border-radius: 10px;
    background: var(--ds-surface-solid);
    color: var(--ds-text-2);
    cursor: pointer;
  }

  .decisao-opcao--minha {
    border-color: var(--ds-gold);
    color: var(--ds-gold);
  }

  .decisao-contagem {
    font-family: var(--ds-font-display);
    font-variant-numeric: tabular-nums;
  }

  .conversa-lista {
    display: flex;
    flex-direction: column;
    gap: 10px;
    list-style: none;
  }

  .conversa-quem {
    font-weight: 700;
    font-size: 0.85rem;
  }

  .conversa-form {
    display: flex;
    gap: 8px;
    align-items: flex-end;
  }

  /* A caixa de comentário fica fora de um `.admin-form`, e é lá que mora o
     desenho dos campos do painel. Sem isto ela sai branca e monoespaçada, o
     controle cru do navegador no meio da janela escura. */
  .conversa-form textarea {
    flex: 1;
    min-height: 2.9em;
    padding: 0.6em 0.8em;
    border: 1px solid var(--ds-line-strong);
    border-radius: 10px;
    background: var(--ds-bg-alt);
    color: var(--ds-text-1);
    font-family: var(--ds-font-body);
    font-size: 0.95rem;
    line-height: 1.55;
    resize: vertical;
  }
</style>
