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
    { valor: "tabardo_oficial", label: "Tabard Oficial" },
    { valor: "tabardo_modificado", label: "Tabard Modificado" },
  ];

  // Quantos treinos fecham um nível de classe. O número está aqui como
  // constante porque a tela desenha as casas a partir dele.
  const TREINOS_POR_NIVEL = 4;

  /* Quanto vale cada item, lido do banco e não copiado pra cá: dRegrasPH é a
   * fonte da verdade do PH e é legível por qualquer um. Serve pra uma coisa só,
   * descobrir qual tabardo a pessoa usou, e isso precisa de conta porque o banco
   * guarda `usou_tabardo` booleano: Oficial e Modificado dividem a mesma coluna
   * e só se distinguem pelo PH que geraram. Sem isso, editar quem veio de
   * tabardo modificado devolveria "Oficial" na tela e promoveria o PH dela em
   * silêncio, mexendo num valor que ninguém pediu pra mexer. */
  let phPorAtividade = $state(new Map<string, number>());

  function torsoDaPresenca(p: any): string {
    if (p.usou_camiseta) return "camiseta";
    if (!p.usou_tabardo) return "nenhum";
    const phFaixa = p.usou_faixa ? (phPorAtividade.get("Faixa") ?? 0) : 0;
    const phTorso = Number(p.ph_ganho_treino ?? 0) - phFaixa;
    const oficial = phPorAtividade.get("Tabardo Oficial") ?? 0;
    const modificado = phPorAtividade.get("Tabardo Modificado") ?? 0;
    // Empata pro Oficial: se um dia os dois valerem o mesmo, a diferença deixa
    // de existir pro PH e o rótulo mais provável é o oficial.
    return Math.abs(phTorso - modificado) < Math.abs(phTorso - oficial)
      ? "tabardo_modificado"
      : "tabardo_oficial";
  }

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
  /** null = lançando presença nova; um id = corrigindo aquela linha. */
  let idPresencaEditando = $state<number | null>(null);
  let nivelPorClasseMap = $state(new Map<number, { treinos_por_classe: number; nivel_por_classe: number }>());
  /** id_classe → data do treino mais recente da pessoa naquela classe. */
  let ultimaData = $state(new Map<number, string>());
  /** A classe do último treino da pessoa, a que ganha a tag. */
  let ultimaClasse = $state<number | null>(null);
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

  let presencas = $state<any[]>([]);
  let carregandoPresencas = $state(true);

  /* Quem confirmou presença na agenda daquele dia. Não é presença registrada:
   * é quem avisou que vinha, pra o staff não ter que digitar o nome de novo.
   * Quem confirmou e faltou simplesmente nunca sai desta lista. O vínculo
   * agenda↔treino é feito pela abrir_treino, casando por data. */
  let confirmados = $state<{ id_membro: number; nome: string; foto_url: string | null }[]>([]);

  // Filtra na tela em vez de refazer a consulta a cada presença lançada: é a
  // mesma pessoa, só mudou de lado.
  const confirmadosPendentes = $derived(
    confirmados.filter((c) => !presencas.some((p) => p.id_membro === c.id_membro))
  );

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

  async function carregarRegrasPH() {
    const { data } = await supabase.from("dRegrasPH").select("atividade, valor_ph");
    phPorAtividade = new Map((data ?? []).map((r) => [r.atividade, Number(r.valor_ph)]));
  }

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

  async function carregarConfirmados() {
    const { data: agenda } = await supabase
      .from("fAgendaTreinos")
      .select("id_agenda")
      .eq("id_treino", idTreino)
      .maybeSingle();
    if (!agenda) return;
    const { data } = await supabase
      .from("v_agenda_confirmacoes")
      .select("id_membro, nome, foto_url")
      .eq("id_agenda", agenda.id_agenda);
    confirmados = data ?? [];
  }

  async function checarElegibilidade(idMembro: number) {
    const [{ data }, { data: anteriores }] = await Promise.all([
      supabase
        .from("v_ranking_por_classe")
        .select("id_classe, treinos_por_classe, nivel_por_classe")
        .eq("id_membro", idMembro),
      /* Por data do treino, não por id: os treinos antigos foram cadastrados
       * depois e têm id maior que a data deles, então ordenar por id apontaria
       * a classe errada como "a última". Fora o treino de agora, senão editar
       * uma presença faria ela ser o próprio último treino. */
      supabase
        .from("fPresencas")
        .select("id_classe, fTreinos(data_treino)")
        .eq("id_membro", idMembro)
        .neq("id_treino", idTreino),
    ]);
    nivelPorClasseMap = new Map((data ?? []).map((r) => [r.id_classe, r]));

    const datas = new Map<number, string>();
    for (const p of (anteriores ?? []) as any[]) {
      const d = p.fTreinos?.data_treino;
      // Data em ISO (AAAA-MM-DD) compara direito como texto.
      if (d && d > (datas.get(p.id_classe) ?? "")) datas.set(p.id_classe, d);
    }
    ultimaData = datas;
    ultimaClasse = [...datas].sort((a, b) => b[1].localeCompare(a[1]))[0]?.[0] ?? null;

    const treinosBasico = nivelPorClasseMap.get(11)?.treinos_por_classe ?? 0;
    const pool =
      treinosBasico < TREINOS_POR_NIVEL
        ? classesTodas.filter((c) => c.id_classe === 11)
        : classesTodas.filter((c) => c.id_classe !== 11);
    classesDisponiveis = [...pool].sort((a, b) => {
      const perto = infoNivelClasse(a.id_classe).faltam - infoNivelClasse(b.id_classe).faltam;
      if (perto !== 0) return perto;
      // Empate em quanto falta: ganha a treinada mais recentemente, que é o
      // caso comum de "repetir o último treino". Classe nunca treinada fica
      // com "" e cai pro fim do próprio empate.
      return (ultimaData.get(b.id_classe) ?? "").localeCompare(ultimaData.get(a.id_classe) ?? "");
    });
    classeEscolhida = classesDisponiveis[0]?.id_classe ?? null;
  }

  async function selecionarMembro(m: { id_membro: number; nome: string; nivel_geral?: number; foto_url?: string | null }) {
    idPresencaEditando = null;
    membroSelecionado = m;
    torso = "nenhum";
    usouFaixa = false;
    erroAdicionar = "";
    // O MembroPicker já traz o nível junto; a lista de confirmados e o
    // RecrutarMembro não. A busca fica aqui, e não em cada chamador, porque sem
    // ela o cartão diz "Nível geral 0", que é informação errada e não
    // informação faltando. Vem da view, que é quem calcula o nível.
    if (m.nivel_geral == null) {
      supabase
        .from("v_ranking_nivel_geral")
        .select("nivel_geral")
        .eq("id_membro", m.id_membro)
        .maybeSingle()
        .then(({ data }) => {
          if (membroSelecionado?.id_membro === m.id_membro) {
            membroSelecionado = { ...membroSelecionado, nivel_geral: data?.nivel_geral ?? 0 };
          }
        });
    }
    await checarElegibilidade(m.id_membro);
  }

  /* Editar reusa o formulário de cima em vez de abrir campos dentro da linha.
   * A linha é estreita, e no celular ela é um cartão: caberia mal, e ainda
   * duplicaria a lista de classes, as casas de progresso e a validação de
   * novato. O que muda é o botão do fim e o título. */
  async function editarPresenca(p: any) {
    idPresencaEditando = p.id_presenca;
    membroSelecionado = { id_membro: p.id_membro, nome: p.nome, foto_url: p.foto_url };
    erroAdicionar = "";
    // A lista de presenças não carrega nível: sem isto o cartão dizia "Nível
    // geral 0" pra todo mundo, que é informação errada, não informação
    // faltando. Vem da view, e não de dMembros, que não tem essa coluna.
    supabase
      .from("v_ranking_nivel_geral")
      .select("nivel_geral")
      .eq("id_membro", p.id_membro)
      .single()
      .then(({ data }) => {
        if (membroSelecionado?.id_membro === p.id_membro) {
          membroSelecionado = { ...membroSelecionado, nivel_geral: data?.nivel_geral ?? 0 };
        }
      });
    await checarElegibilidade(p.id_membro);
    // Depois da elegibilidade, que sobrescreve classeEscolhida com a sugestão.
    classeEscolhida = p.id_classe;
    torso = torsoDaPresenca(p);
    usouFaixa = p.usou_faixa;
    document.querySelector(".admin-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function cancelarEdicao() {
    idPresencaEditando = null;
    membroSelecionado = null;
    classeEscolhida = null;
    torso = "nenhum";
    usouFaixa = false;
    erroAdicionar = "";
  }

  async function salvarEdicao() {
    if (idPresencaEditando === null || !classeEscolhida) return;
    adicionando = true;
    erroAdicionar = "";
    const { error } = await supabase.rpc("atualizar_presenca_treino", {
      p_id_presenca: idPresencaEditando,
      p_id_classe: classeEscolhida,
      p_torso: torso,
      p_usou_faixa: usouFaixa,
    });
    adicionando = false;
    if (error) {
      erroAdicionar = error.message;
      return;
    }
    cancelarEdicao();
    await carregarPresencas();
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
    await Promise.all([carregarClasses(), carregarRegrasPH()]);
    await carregarPresencas();
    await carregarConfirmados();
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
    <p class="admin-form-titulo">
      {idPresencaEditando === null ? "Registrar presença" : "Corrigir presença"}
    </p>

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
          {#if idPresencaEditando === null}
            <button type="button" class="btn btn-sm btn-ghost" onclick={() => (membroSelecionado = null)}>
              Trocar
            </button>
          {/if}
        </div>
      </div>

      <!-- Cartão por classe, não <select>. Isto é preenchido em pé, no celular,
           com o membro esperando na frente: o select pedia três toques e ainda
           escondia dentro da roda do sistema justamente o que faz escolher, o
           quanto falta pra subir. Os cartões vêm ordenados do mais perto do
           próximo nível pro mais longe (ver classesDisponiveis), que é a ordem
           em que a pessoa quer ouvir: "você está a um treino de Arqueiro". -->
      <fieldset class="escolha">
        <legend>Classe treinada</legend>
        <ul class="classes-grade">
          {#each classesDisponiveis as c}
            {@const i = infoNivelClasse(c.id_classe)}
            <li>
              <button
                type="button"
                class="classe-card"
                class:ativo={classeEscolhida === c.id_classe}
                class:perto={i.vaiSubir}
                aria-pressed={classeEscolhida === c.id_classe}
                onclick={() => (classeEscolhida = c.id_classe)}
              >
                <span class="cc-topo">
                  <span class="cc-nome">{c.nome_classe}</span>
                  {#if c.id_classe === ultimaClasse}
                    <span class="cc-tag">Repetir</span>
                  {/if}
                </span>
                <span class="cc-linha">
                  <span class="cc-nivel">Nível {i.nivel}</span>
                  <span class="cc-treinos">{i.treinos}/{i.proximoNivelTreinos}</span>
                </span>
                {#if i.casasConferem}
                  <ol class="casas casas--mini" aria-hidden="true">
                    {#each { length: TREINOS_POR_NIVEL } as _, k}
                      <li
                        class:cheia={k < i.treinos % TREINOS_POR_NIVEL}
                        class:proxima={k === i.treinos % TREINOS_POR_NIVEL &&
                          classeEscolhida === c.id_classe}
                      ></li>
                    {/each}
                  </ol>
                {/if}
              </button>
            </li>
          {/each}
        </ul>
      </fieldset>

      {#if classeInfo?.vaiSubir}
        <p class="nivel-progresso-aviso">
          {classeEscolhida === 11
            ? "Esta presença torna o membro veterano."
            : `Esta presença sobe a classe para o nível ${classeInfo.nivel + 1}.`}
        </p>
      {/if}

      <!-- Quatro opções viram quatro alvos, não um <select>. Isso é lançado no
           celular, em pé, um membro atrás do outro: cada select era abrir a
           roda do sistema, rolar e confirmar, três toques pra uma escolha que
           cabe inteira na tela. A faixa segue a mesma ideia, porque a caixinha
           de marcar tem alvo de 13px e aqui o dedo é o ponteiro. -->
      <fieldset class="escolha">
        <legend>Vestimenta</legend>
        <div class="escolha-opcoes torso-grade">
          {#each TORSO_OPCOES as o}
            <button
              type="button"
              class="chip"
              class:ativo={torso === o.valor}
              aria-pressed={torso === o.valor}
              onclick={() => (torso = o.valor)}
            >
              {o.label}
            </button>
          {/each}
          <!-- A faixa mora aqui e não num grupo próprio: é vestimenta também, e
               uma legenda inteira pra um botão só custava uma seção a mais de
               rolagem numa tela que se preenche em pé. Atravessa a grade porque
               não é a quinta opção de torso, é um liga-desliga solto. -->
          <button
            type="button"
            class="chip faixa-toggle"
            class:ativo={usouFaixa}
            aria-pressed={usouFaixa}
            onclick={() => (usouFaixa = !usouFaixa)}
          >
            Usou faixa
          </button>
        </div>
      </fieldset>

      <div class="form-acoes">
        {#if idPresencaEditando === null}
          <button type="button" class="btn btn-primary" onclick={adicionarPresenca} disabled={adicionando}>
            {adicionando ? "Adicionando..." : "Adicionar presença"}
          </button>
        {:else}
          <button type="button" class="btn btn-primary" onclick={salvarEdicao} disabled={adicionando}>
            {adicionando ? "Salvando..." : "Salvar correção"}
          </button>
          <button type="button" class="btn btn-ghost" onclick={cancelarEdicao} disabled={adicionando}>
            Cancelar
          </button>
        {/if}
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

  <!-- Quem já disse que vem aparece pronto pra registrar, mas continua sendo
       registro manual: confirmar na agenda é intenção, presença é o staff que
       dá, junto da classe. Por isso um botão que preenche o formulário de
       cima, e não um que lança a presença sozinho. -->
  {#if confirmadosPendentes.length > 0}
    <div class="admin-secao-cab">
      <h2>Confirmaram na agenda <span class="contagem">{confirmadosPendentes.length}</span></h2>
    </div>
    <p class="admin-form-nota confirmados-nota">
      Avisaram que vinham e ainda não foram registrados. O nome vai pro formulário acima; o PH só
      conta depois que você escolher a classe e confirmar.
    </p>
    <ul class="admin-list confirmados-lista">
      {#each confirmadosPendentes as c}
        <li>
          <span class="row-avatar">
            {#if c.foto_url}
              <img src={c.foto_url} alt="" />
            {:else}
              {c.nome.charAt(0).toUpperCase()}
            {/if}
          </span>
          <div class="row-corpo">
            <span class="row-titulo">{c.nome}</span>
          </div>
          <div class="row-acoes">
            <button
              type="button"
              class="btn btn-sm btn-primary"
              onclick={() => selecionarMembro(c)}
            >
              Registrar
            </button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}

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
              <!-- Corrigir é de quem lança, não só do nível 1: quem digitou a
                   classe errada há dez segundos é justamente quem está com o
                   celular na mão. Apagar continua sendo do administrador, que
                   é a ação que some com PH. -->
              <td class="col-stat col-acoes">
                <button
                  type="button"
                  class="btn-icone"
                  onclick={() => editarPresenca(p)}
                  aria-label={`Corrigir a presença de ${p.nome}`}
                  title="Corrigir presença"
                >
                  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true">
                    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                  </svg>
                </button>
                {#if souAdminSistema}
                  <button
                    type="button"
                    class="btn-icone btn-icone--perigo"
                    onclick={() => removerPresenca(p)}
                    aria-label={`Remover a presença de ${p.nome}`}
                    title="Remover presença"
                  >
                    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true">
                      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                    </svg>
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

  .confirmados-nota {
    margin: -0.4em 0 0.8em;
  }

  /* Uma linha por confirmado. O .row-corpo da lista padrão tem base de 190px,
     que somada ao avatar e ao botão não cabe em tela estreita: o botão caía
     pra uma segunda linha e dobrava a altura de um item que só tem um nome e
     um "Registrar". Aqui o nome cede espaço (base 0 e reticências, que ele já
     tem) em vez de a linha quebrar. */
  .confirmados-lista > li {
    flex-wrap: nowrap;
  }

  .confirmados-lista > li > .row-corpo {
    flex-basis: 0;
  }

  /* Grade em vez da fila que quebra sozinha: em fila, "Nenhum" ficava do
     tamanho da palavra e o quarto botão sobrava numa segunda linha, deixando
     alvos de tamanhos diferentes num formulário que é tocado com o polegar.
     Aqui são quatro caixas iguais, 2x2 no celular e 4 numa linha quando cabe.
     A regra vale só dentro desta grade: chip solto continua do tamanho do
     próprio texto. */
  .torso-grade {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    /* Todas as linhas da altura da mais alta: "Tabard Modificado" pode quebrar
       em duas linhas na tela estreita, e sem isto só a caixa dele cresceria. */
    grid-auto-rows: 1fr;
    gap: 8px;
  }

  @media (min-width: 560px) {
    .torso-grade {
      grid-template-columns: repeat(4, 1fr);
    }
  }

  .torso-grade > .chip {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 7px 10px;
    /* O .chip solto é nowrap porque vive numa fila que rola de lado. Aqui a
       largura é da grade, então quebrar é o certo: sem isto o rótulo longo
       vazaria pra fora da caixa. */
    white-space: normal;
    text-align: center;
  }

  .torso-grade > .faixa-toggle {
    grid-column: 1 / -1;
    margin-top: 2px;
  }

  /* Mesma grade dos cartões de "Minhas classes" do Meu Perfil, encolhida: aqui
     não cabe colocação nem "N treinos" por extenso, porque o alvo é duas
     colunas no celular sem rolar a tela inteira pra achar a classe. */
  /* Duas colunas fixas no celular, não auto-fill. Medido: dentro do .admin-form
     o auto-fill(140px) dá duas colunas de 340px de viewport pra cima, mas em
     320px sobra 283px de grade e ele desiste, desenhando uma coluna só. E
     320px é o que um S21 FE reporta com a escala de tela ampliada do Samsung.
     Fixar em duas entrega o que a tela precisa, que é comparar classes lado a
     lado; de 560px pra cima volta a caber quantas couberem. */
  .classes-grade {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  @media (min-width: 560px) {
    .classes-grade {
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    }
  }

  .classe-card {
    display: flex;
    flex-direction: column;
    gap: 5px;
    width: 100%;
    padding: 8px 9px 9px;
    border: 1px solid var(--ds-line);
    border-radius: 12px;
    background: var(--ds-surface);
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  /* Quem está a um treino de subir ganha um fio dourado antes de ser tocada:
     é a resposta visual da pergunta que o staff faz em voz alta no treino. */
  .classe-card.perto {
    border-color: var(--ds-gold-dim);
  }

  .classe-card.ativo {
    border-color: var(--ds-gold);
    background: var(--ds-gold-wash);
  }

  .cc-topo {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 3px 6px;
  }

  /* Encolhe pro próprio texto e encosta na direita: nunca esticar num cartão
     de 140px. */
  .cc-tag {
    flex: none;
    align-self: center;
    margin-left: auto;
    padding: 1px 6px;
    border: 1px solid var(--ds-line-strong);
    border-radius: 999px;
    font-size: 0.6rem;
    line-height: 1.5;
    color: var(--ds-text-4);
    white-space: nowrap;
  }

  .classe-card.ativo .cc-tag {
    border-color: var(--ds-gold-dim);
    color: var(--ds-gold-light);
  }

  .cc-nome {
    font-family: var(--ds-font-display);
    font-size: 0.88rem;
    line-height: 1.1;
    color: var(--ds-text-2);
  }

  .classe-card.ativo .cc-nome {
    color: var(--ds-gold-light);
  }

  .cc-linha {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 6px;
  }

  .cc-nivel {
    font-size: 0.74rem;
    color: var(--ds-gold);
  }

  .cc-treinos {
    font-size: 0.72rem;
    color: var(--ds-text-5);
  }

  .casas--mini {
    gap: 3px;
  }

  .casas--mini > li {
    height: 6px;
  }
</style>
