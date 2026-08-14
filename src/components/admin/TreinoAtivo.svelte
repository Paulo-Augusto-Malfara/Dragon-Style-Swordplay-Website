<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { supabase } from "../../lib/supabase-browser";
  import MembroPicker from "./MembroPicker.svelte";
  import RecrutarMembro from "./RecrutarMembro.svelte";
  import ConfirmarAcao from "./ConfirmarAcao.svelte";

  interface Props {
    idTreino: number;
    souAdminSistema: boolean;
    meuIdMembro: number;
  }
  const { idTreino, souAdminSistema, meuIdMembro }: Props = $props();

  const TORSO_OPCOES = [
    { valor: "nenhum", label: "Nenhum" },
    { valor: "camiseta", label: "Camiseta DS" },
    { valor: "tabardo_oficial", label: "Tabardo Oficial" },
    { valor: "tabardo_modificado", label: "Tabardo Modificado" },
  ];

  // Quantos treinos fecham um nível de classe. O número está aqui como
  // constante porque a tela desenha as casas a partir dele.
  const TREINOS_POR_NIVEL = 4;

  let classesMap = new Map<number, string>();
  let siglaMap = new Map<number, string>();
  let classesTodas = $state<{ id_classe: number; nome_classe: string }[]>([]);
  let classesDisponiveis = $state<{ id_classe: number; nome_classe: string }[]>([]);

  let membroSelecionado = $state<{ id_membro: number; nome: string; nivel_geral?: number; foto_url?: string | null } | null>(null);
  let criandoMembro = $state(false);
  let classeEscolhida = $state<number | null>(null);
  let torso = $state("nenhum");
  let usouFaixa = $state(false);
  let adicionando = $state(false);
  let erroAdicionar = $state("");
  let nivelPorClasseMap = $state(new Map<number, { treinos_por_classe: number; nivel_por_classe: number }>());
  let confirmar: ConfirmarAcao;

  function infoNivelClasse(idClasse: number) {
    const r = nivelPorClasseMap.get(idClasse);
    const treinos = r?.treinos_por_classe ?? 0;
    const nivel = r?.nivel_por_classe ?? 0;
    const proximoNivelTreinos = (nivel + 1) * TREINOS_POR_NIVEL;
    const faltam = proximoNivelTreinos - treinos;
    // As casas só aparecem se a conta de 4 treinos por nível bater com o
    // nível que o banco devolveu. Quando não bate (regra antiga, ajuste
    // manual), é melhor não desenhar nada do que desenhar progresso errado.
    const casasConferem = Math.floor(treinos / TREINOS_POR_NIVEL) === nivel;
    return { treinos, nivel, proximoNivelTreinos, faltam, casasConferem, vaiSubir: faltam === 1 };
  }
  let classeInfo = $derived(classeEscolhida !== null ? infoNivelClasse(classeEscolhida) : null);

  function labelClasse(c: { id_classe: number; nome_classe: string }) {
    const i = infoNivelClasse(c.id_classe);
    return `${c.nome_classe}, nível ${i.nivel} (${i.treinos}/${i.proximoNivelTreinos})`;
  }

  let presencas = $state<any[]>([]);
  let carregandoPresencas = $state(true);

  let finalizando = $state(false);
  let statusTreino = $state<string | null>(null);
  let resumo = $state<any | null>(null);
  let resumoLinhas = $state<any[]>([]);
  let dataTreinoResumo = $state<string | null>(null);
  let erroFinalizar = $state("");
  let reabrindo = $state(false);
  // Vale pros dois botões da zona de perigo do treino fechado: reabrir e
  // excluir. O excluir avisava por alert(), que é a caixa do navegador de
  // novo, e ainda por cima só depois de a ação ter falhado calada.
  let erroAcao = $state("");
  let excluindo = $state(false);

  let channel: ReturnType<typeof supabase.channel> | null = null;

  async function carregarClasses() {
    const { data } = await supabase.from("dClasses").select("id_classe, nome_classe, sigla_classe").order("nome_classe");
    classesTodas = data ?? [];
    classesMap = new Map(classesTodas.map((c) => [c.id_classe, c.nome_classe]));
    siglaMap = new Map(classesTodas.map((c) => [c.id_classe, c.sigla_classe]));
  }

  async function carregarPresencas() {
    const { data: pres } = await supabase
      .from("fPresencas")
      .select("id_presenca, id_membro, id_classe, usou_camiseta, usou_tabardo, usou_faixa, ph_ganho_treino")
      .eq("id_treino", idTreino)
      .order("id_presenca");

    const linhas = pres ?? [];
    const ids = [...new Set(linhas.map((p) => p.id_membro))];
    let membrosMap = new Map<number, { nome: string; foto_url: string | null }>();
    if (ids.length > 0) {
      const { data: membros } = await supabase.from("dMembros").select("id_membro, nome, foto_url").in("id_membro", ids);
      membrosMap = new Map((membros ?? []).map((m) => [m.id_membro, m]));
    }

    presencas = linhas.map((p) => ({
      ...p,
      nome: membrosMap.get(p.id_membro)?.nome ?? `#${p.id_membro}`,
      foto_url: membrosMap.get(p.id_membro)?.foto_url ?? null,
      sigla_classe: siglaMap.get(p.id_classe) ?? `#${p.id_classe}`,
      nome_classe: classesMap.get(p.id_classe) ?? "",
      vestimenta: p.usou_camiseta || p.usou_tabardo,
    }));
    carregandoPresencas = false;
  }

  async function checarElegibilidade(idMembro: number) {
    const { data } = await supabase
      .from("v_ranking_por_classe")
      .select("id_classe, treinos_por_classe, nivel_por_classe")
      .eq("id_membro", idMembro);
    nivelPorClasseMap = new Map((data ?? []).map((r) => [r.id_classe, r]));
    const treinosBasico = nivelPorClasseMap.get(11)?.treinos_por_classe ?? 0;
    const pool =
      treinosBasico < TREINOS_POR_NIVEL
        ? classesTodas.filter((c) => c.id_classe === 11)
        : classesTodas.filter((c) => c.id_classe !== 11);
    classesDisponiveis = [...pool].sort((a, b) => infoNivelClasse(a.id_classe).faltam - infoNivelClasse(b.id_classe).faltam);
    classeEscolhida = classesDisponiveis[0]?.id_classe ?? null;
  }

  async function selecionarMembro(m: { id_membro: number; nome: string }) {
    membroSelecionado = m;
    torso = "nenhum";
    usouFaixa = false;
    erroAdicionar = "";
    await checarElegibilidade(m.id_membro);
  }

  async function adicionarPresenca() {
    if (!membroSelecionado || !classeEscolhida) return;
    adicionando = true;
    erroAdicionar = "";
    const { error } = await supabase.rpc("registrar_presenca_treino", {
      p_id_treino: idTreino,
      p_id_membro: membroSelecionado.id_membro,
      p_id_classe: classeEscolhida,
      p_torso: torso,
      p_usou_faixa: usouFaixa,
    });
    adicionando = false;
    if (error) {
      erroAdicionar = error.message;
      return;
    }
    membroSelecionado = null;
    classeEscolhida = null;
    torso = "nenhum";
    usouFaixa = false;
    await carregarPresencas();
  }

  async function removerPresenca(p: any) {
    const ok = await confirmar.pedir({
      titulo: `Remover a presença de ${p.nome}?`,
      texto: "Serve pra corrigir lançamento errado. O PH deste treino sai junto e não volta.",
      acao: "Remover",
      perigo: true,
    });
    if (!ok) return;
    await supabase.from("fPresencas").delete().eq("id_presenca", p.id_presenca);
    await carregarPresencas();
  }

  async function montarResumo(dadosPresencas: any[], dadosBonus: any[]) {
    let nomesBonus = new Map<number, string>();
    if (dadosBonus.length > 0) {
      const ids = [...new Set(dadosBonus.map((b: any) => b.id_membro))];
      const { data: membrosBonus } = await supabase.from("dMembros").select("id_membro, nome").in("id_membro", ids);
      nomesBonus = new Map((membrosBonus ?? []).map((m) => [m.id_membro, m.nome]));
    }
    const bonusPorMembro = new Map<number, number>();
    for (const b of dadosBonus) {
      bonusPorMembro.set(b.id_membro, (bonusPorMembro.get(b.id_membro) ?? 0) + Number(b.ph_ganho));
    }

    resumo = {
      bonus_indicacao: dadosBonus.map((b: any) => ({ ...b, nome: nomesBonus.get(b.id_membro) ?? `#${b.id_membro}` })),
    };

    const porNome = new Map(presencas.map((p) => [p.nome, p]));
    resumoLinhas = dadosPresencas
      .map((r: any) => {
        const base = porNome.get(r.nome);
        const phBonus = base ? (bonusPorMembro.get(base.id_membro) ?? 0) : 0;
        return { ...base, ...r, ph_total: (base?.ph_ganho_treino ?? 0) + phBonus };
      })
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    dataTreinoResumo = resumoLinhas[0]?.data_treino ?? null;
  }

  async function carregarResumoFinalizado() {
    const [{ data: registros }, { data: bonusBruto }] = await Promise.all([
      supabase.from("v_registro_treinos").select("*").eq("id_treino", idTreino),
      supabase.from("fPH").select("*").eq("id_treino", idTreino).eq("id_regra_ph", 6),
    ]);
    await montarResumo(registros ?? [], bonusBruto ?? []);
  }

  async function finalizarTreino() {
    const ok = await confirmar.pedir({
      titulo: `Fechar o treino com ${presencas.length} ${presencas.length === 1 ? "presença" : "presenças"}?`,
      texto: "É o fechamento que distribui o PH e sobe os níveis. Depois de fechado não dá pra registrar mais ninguém, só reabrir.",
      acao: "Fechar treino",
    });
    if (!ok) return;
    finalizando = true;
    erroFinalizar = "";
    const { data, error } = await supabase.rpc("fechar_treino", { p_id_treino: idTreino });
    finalizando = false;
    if (error) {
      erroFinalizar = error.message;
      return;
    }
    statusTreino = "finalizado";
    await montarResumo(data.presencas ?? [], data.bonus_indicacao ?? []);
  }

  async function reabrirTreino() {
    const ok = await confirmar.pedir({
      titulo: "Reabrir este treino?",
      texto: "Ele volta ao estado aberto e aceita presença de novo, até você fechar outra vez.",
      acao: "Reabrir",
    });
    if (!ok) return;
    reabrindo = true;
    erroAcao = "";
    const { error } = await supabase.rpc("reabrir_treino", { p_id_treino: idTreino });
    reabrindo = false;
    if (error) {
      erroAcao = error.message;
      return;
    }
    statusTreino = "aberto";
    resumo = null;
    await carregarPresencas();
  }

  async function excluirTreino() {
    const ok = await confirmar.pedir({
      titulo: `Excluir o treino #${idTreino} de vez?`,
      texto: "Apaga as presenças e todo o PH ganho nele. Os níveis de quem treinou caem junto, e não tem como desfazer.",
      acao: "Excluir treino",
      perigo: true,
    });
    if (!ok) return;
    excluindo = true;
    const { error } = await supabase.rpc("excluir_treino", { p_id_treino: idTreino });
    excluindo = false;
    if (error) {
      erroAcao = error.message;
      return;
    }
    window.location.href = "/admin/treinos";
  }

  /* No treino são três ou quatro organizadores lançando presença ao mesmo
   * tempo, cada um no seu celular. Sem isto, a tela de cada um só se atualiza
   * depois da própria ação: dois lançam o mesmo membro, e quem remove uma linha
   * some dela sozinho. */
  async function aplicarStatus(novo: string | undefined) {
    // Quem executou a ação já mudou o estado na mão. O eco do Realtime chega
    // pra ele também, e sem esta saída ele refaria o resumo inteiro à toa.
    if (!novo || novo === statusTreino) return;
    statusTreino = novo;
    await carregarPresencas();
    if (novo === "finalizado") {
      await carregarResumoFinalizado();
    } else {
      resumo = null;
    }
  }

  onMount(async () => {
    await carregarClasses();
    await carregarPresencas();
    const { data: treino } = await supabase.from("fTreinos").select("status").eq("id_treino", idTreino).single();
    statusTreino = treino?.status ?? "aberto";
    if (statusTreino === "finalizado") await carregarResumoFinalizado();

    // A inscrição vale também com o treino já fechado, senão quem estivesse na
    // tela de resumo não veria a reabertura feita por outro.
    channel = supabase
      .channel(`treino-${idTreino}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "fPresencas", filter: `id_treino=eq.${idTreino}` },
        () => carregarPresencas()
      )
      .on(
        // Sem filtro de propósito. Com REPLICA IDENTITY default o Postgres só
        // manda a chave primária da linha apagada, então um `id_treino=eq.N`
        // nunca casaria e a remoção não chegaria em ninguém. Só existe um
        // treino aberto por vez, então recarregar à toa é raro.
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "fPresencas" },
        () => carregarPresencas()
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "fTreinos", filter: `id_treino=eq.${idTreino}` },
        (payload) => aplicarStatus((payload.new as { status?: string }).status)
      )
      .subscribe();
  });

  onDestroy(() => {
    if (channel) supabase.removeChannel(channel);
  });
</script>

<ConfirmarAcao bind:this={confirmar} />

{#if statusTreino === null}
  <div class="esqueleto esqueleto-form"></div>
{:else if resumo}
  <div class="admin-form">
    <p class="admin-ok">
      Treino #{idTreino}{#if dataTreinoResumo}
        de {new Date(dataTreinoResumo + "T00:00:00").toLocaleDateString("pt-BR")}{/if} fechado.
      {presencas.length}
      {presencas.length === 1 ? "presença registrada" : "presenças registradas"}, PH distribuído.
    </p>

    {#if resumo.bonus_indicacao?.length > 0}
      <p class="admin-form-titulo">Bônus de indicação</p>
      <ul class="admin-list">
        {#each resumo.bonus_indicacao as b}
          <li>
            <div class="row-corpo">
              <span class="row-titulo">{b.nome}</span>
              <span class="row-meta">{b.detalhes}</span>
            </div>
            <span class="stat-pill">+{b.ph_ganho} PH</span>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <div class="admin-secao-cab">
    <h2>Como ficou <span class="contagem">{resumoLinhas.length}</span></h2>
  </div>
  <div class="table-scroll">
    <table class="ranking-tabela ranking-tabela--treino-resumo tabela-cartoes">
      <thead>
        <tr>
          <th class="col-nome">Nome</th>
          <th class="col-faixa">Classe</th>
          <th class="col-stat">Vestimenta</th>
          <th class="col-stat">Faixa</th>
          <th class="col-stat">PH</th>
          <th class="col-stat">Nível</th>
        </tr>
      </thead>
      <tbody>
        {#each resumoLinhas as p}
          <tr>
            <td class="col-nome">
              <span class="row-avatar">
                {#if p.foto_url}
                  <img src={p.foto_url} alt="" />
                {:else}
                  {p.nome.charAt(0).toUpperCase()}
                {/if}
              </span>
              <span class="row-name">{p.nome}</span>
            </td>
            <td class="col-faixa" data-label="Classe">{p.sigla_classe}</td>
            <td class="col-stat" data-label="Vestimenta">
              <span class={`status-badge status-badge--${p.vestimenta ? "ativo" : "inativo"}`}>
                {p.vestimenta ? "Sim" : "Não"}
              </span>
            </td>
            <td class="col-stat" data-label="Faixa">
              <span class={`status-badge status-badge--${p.usou_faixa ? "ativo" : "inativo"}`}>
                {p.usou_faixa ? "Sim" : "Não"}
              </span>
            </td>
            <td class="col-stat" data-label="PH"><span class="stat-pill">{p.ph_total}</span></td>
            <td class="col-stat" data-label="Nível geral">
              <span class={`stat-pill ${p.subiu_nivel_geral ? "stat-pill-up" : ""}`}>
                {p.nivel_geral}
                {#if p.subiu_nivel_geral}
                  <span class="level-up-arrow">{"▲".repeat(p.subida_nivel_geral)}</span>
                {/if}
              </span>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <div class="admin-list-actions">
    <a href="/admin/treinos" class="btn btn-primary">Voltar para treinos</a>
  </div>

  {#if souAdminSistema}
    <div class="zona-perigo">
      <p>
        Reabrir devolve o treino ao estado aberto pra corrigir presença. Excluir apaga o treino e
        todo o PH que ele deu.
      </p>
      <div class="row-acoes">
        <button type="button" class="btn btn-sm btn-ghost" onclick={reabrirTreino} disabled={reabrindo}>
          {reabrindo ? "Reabrindo..." : "Reabrir treino"}
        </button>
        <button type="button" class="btn btn-sm btn-danger" onclick={excluirTreino} disabled={excluindo}>
          {excluindo ? "Excluindo..." : "Excluir treino"}
        </button>
      </div>
    </div>
    {#if erroAcao}
      <p class="admin-error" role="alert">{erroAcao}</p>
    {/if}
  {/if}
{:else}
  <div class="admin-form">
    <p class="admin-form-titulo">Registrar presença</p>

    {#if membroSelecionado}
      <div class="membro-escolhido">
        <span class="row-avatar">
          {#if membroSelecionado.foto_url}
            <img src={membroSelecionado.foto_url} alt="" />
          {:else}
            {membroSelecionado.nome.charAt(0).toUpperCase()}
          {/if}
        </span>
        <div class="row-corpo">
          <span class="row-titulo">{membroSelecionado.nome}</span>
          <span class="row-meta">Nível geral {membroSelecionado.nivel_geral ?? 0}</span>
        </div>
        <div class="row-acoes">
          <button type="button" class="btn btn-sm btn-ghost" onclick={() => (membroSelecionado = null)}>
            Trocar
          </button>
        </div>
      </div>

      <div class="campos">
        <label class="campo-largo">
          Classe treinada
          <select bind:value={classeEscolhida}>
            {#each classesDisponiveis as c}
              <option value={c.id_classe}>{labelClasse(c)}</option>
            {/each}
          </select>
        </label>
      </div>

      {#if classeInfo}
        <div class="nivel-progresso">
          <div class="nivel-progresso-info">
            <span class="stat-pill">Nível {classeInfo.nivel}</span>
            <span>{classeInfo.treinos} de {classeInfo.proximoNivelTreinos} treinos</span>
          </div>
          {#if classeInfo.casasConferem}
            <ol
              class="casas"
              aria-label={`${classeInfo.treinos % TREINOS_POR_NIVEL} de ${TREINOS_POR_NIVEL} treinos deste nível`}
            >
              {#each { length: TREINOS_POR_NIVEL } as _, i}
                <li
                  class:cheia={i < classeInfo.treinos % TREINOS_POR_NIVEL}
                  class:proxima={i === classeInfo.treinos % TREINOS_POR_NIVEL}
                ></li>
              {/each}
            </ol>
          {/if}
          {#if classeInfo.vaiSubir}
            <p class="nivel-progresso-aviso">
              {classeEscolhida === 11
                ? "Esta presença torna o membro veterano."
                : `Esta presença sobe a classe para o nível ${classeInfo.nivel + 1}.`}
            </p>
          {/if}
        </div>
      {/if}

      <div class="campos">
        <label>
          Vestimenta (torso)
          <select bind:value={torso}>
            {#each TORSO_OPCOES as o}
              <option value={o.valor}>{o.label}</option>
            {/each}
          </select>
        </label>
      </div>

      <label class="checkbox">
        <input type="checkbox" bind:checked={usouFaixa} />
        Usou faixa
      </label>

      <div class="form-acoes">
        <button type="button" class="btn btn-primary" onclick={adicionarPresenca} disabled={adicionando}>
          {adicionando ? "Adicionando..." : "Adicionar presença"}
        </button>
      </div>
      {#if erroAdicionar}
        <p class="admin-error" role="alert">{erroAdicionar}</p>
      {/if}
    {:else if criandoMembro}
      <RecrutarMembro
        {meuIdMembro}
        onCreated={(m) => {
          criandoMembro = false;
          selecionarMembro(m);
        }}
        onCancelar={() => (criandoMembro = false)}
      />
    {:else}
      <MembroPicker
        placeholder="Buscar membro para registrar presença..."
        onSelect={selecionarMembro}
        onCriarNovo={() => (criandoMembro = true)}
      />
    {/if}
  </div>

  <div class="admin-secao-cab">
    <h2>Presenças <span class="contagem">{presencas.length}</span></h2>
  </div>

  {#if carregandoPresencas}
    <div class="esqueleto-lista">
      {#each { length: 3 } as _}
        <div class="esqueleto esqueleto-linha"></div>
      {/each}
    </div>
  {:else if presencas.length === 0}
    <p class="vazio">Ninguém registrado ainda. Busque o membro acima para começar.</p>
  {:else}
    <div class="table-scroll">
      <table class="ranking-tabela ranking-tabela--presencas tabela-cartoes">
        <thead>
          <tr>
            <th class="col-nome">Nome</th>
            <th class="col-faixa">Classe</th>
            <th class="col-stat">Vestimenta</th>
            <th class="col-stat">Faixa</th>
            <th class="col-stat">PH</th>
            <th class="col-stat col-acoes">Ações</th>
          </tr>
        </thead>
        <tbody>
          {#each presencas as p}
            <tr>
              <td class="col-nome">
                <span class="row-avatar">
                  {#if p.foto_url}
                    <img src={p.foto_url} alt="" />
                  {:else}
                    {p.nome.charAt(0).toUpperCase()}
                  {/if}
                </span>
                <span class="row-name">{p.nome}</span>
              </td>
              <td class="col-faixa" data-label="Classe">{p.sigla_classe}</td>
              <td class="col-stat" data-label="Vestimenta">
                <span class={`status-badge status-badge--${p.vestimenta ? "ativo" : "inativo"}`}>
                  {p.vestimenta ? "Sim" : "Não"}
                </span>
              </td>
              <td class="col-stat" data-label="Faixa">
                <span class={`status-badge status-badge--${p.usou_faixa ? "ativo" : "inativo"}`}>
                  {p.usou_faixa ? "Sim" : "Não"}
                </span>
              </td>
              <td class="col-stat" data-label="PH"><span class="stat-pill">{p.ph_ganho_treino}</span></td>
              <td class="col-stat col-acoes">
                {#if souAdminSistema}
                  <button type="button" class="btn btn-sm btn-danger" onclick={() => removerPresenca(p)}>
                    Remover
                  </button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  {#if souAdminSistema}
    <!-- Fechar não é ação destrutiva, é o fim do trabalho do dia: é o
         fechamento que distribui o PH. Estava em vermelho, no mesmo tom de
         "excluir", e a confirmação já explica o que ele faz. -->
    <div class="fechar-treino">
      <p>
        Fechar distribui o PH e sobe os níveis de quem treinou. Enquanto o treino estiver aberto,
        ninguém consegue abrir outro.
      </p>
      <button type="button" class="btn btn-primary" onclick={finalizarTreino} disabled={finalizando || presencas.length === 0}>
        {finalizando ? "Fechando..." : "Fechar treino"}
      </button>
    </div>
    {#if presencas.length === 0}
      <p class="admin-form-nota fechar-nota">Registre ao menos uma presença antes de fechar.</p>
    {/if}
    {#if erroFinalizar}
      <p class="admin-error" role="alert">{erroFinalizar}</p>
    {/if}
  {/if}
{/if}

<style>
  .fechar-treino {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.8em;
    max-width: 760px;
    margin: 1.4em auto 0.6em;
    padding: 1em 1.1em;
    border: 1px solid var(--ds-gold-dim);
    border-radius: var(--card-radius);
    background: var(--ds-gold-wash);
  }

  .fechar-treino p {
    margin: 0;
    max-width: 44ch;
    font-size: 0.86rem;
    line-height: 1.5;
    color: var(--ds-text-2);
  }

  .fechar-nota {
    max-width: 760px;
    margin: 0 auto 1.4em;
    text-align: center;
  }
</style>
