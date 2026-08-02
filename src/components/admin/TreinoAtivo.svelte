<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { supabase } from "../../lib/supabase-browser";
  import MembroPicker from "./MembroPicker.svelte";
  import RecrutarMembro from "./RecrutarMembro.svelte";

  interface Props {
    idTreino: number;
    souOrganizador: boolean;
    souAdminSistema: boolean;
    meuIdMembro: number;
  }
  const { idTreino, souOrganizador, souAdminSistema, meuIdMembro }: Props = $props();

  const TORSO_OPCOES = [
    { valor: "nenhum", label: "Nenhum" },
    { valor: "camiseta", label: "Camiseta DS" },
    { valor: "tabardo_oficial", label: "Tabardo Oficial" },
    { valor: "tabardo_modificado", label: "Tabardo Modificado" },
  ];

  let classesMap = new Map<number, string>();
  let siglaMap = new Map<number, string>();
  let classesTodas = $state<{ id_classe: number; nome_classe: string }[]>([]);
  let classesDisponiveis = $state<{ id_classe: number; nome_classe: string }[]>([]);

  let membroSelecionado = $state<{ id_membro: number; nome: string; nivel_geral?: number } | null>(null);
  let criandoMembro = $state(false);
  let classeEscolhida = $state<number | null>(null);
  let torso = $state("nenhum");
  let usouFaixa = $state(false);
  let adicionando = $state(false);
  let erroAdicionar = $state("");
  let nivelPorClasseMap = $state(new Map<number, { treinos_por_classe: number; nivel_por_classe: number }>());

  function infoNivelClasse(idClasse: number) {
    const r = nivelPorClasseMap.get(idClasse);
    const treinos = r?.treinos_por_classe ?? 0;
    const nivel = r?.nivel_por_classe ?? 0;
    const proximoNivelTreinos = (nivel + 1) * 4;
    const faltam = proximoNivelTreinos - treinos;
    return { treinos, nivel, proximoNivelTreinos, faltam, vaiSubir: faltam === 1 };
  }
  let classeInfo = $derived(classeEscolhida !== null ? infoNivelClasse(classeEscolhida) : null);

  function labelClasse(c: { id_classe: number; nome_classe: string }) {
    const i = infoNivelClasse(c.id_classe);
    return `${c.nome_classe} — Nível ${i.nivel} — ${i.treinos}/${i.proximoNivelTreinos}`;
  }

  let presencas = $state<any[]>([]);
  let carregandoPresencas = $state(true);

  let finalizando = $state(false);
  let statusTreino = $state<string | null>(null);
  let resumo = $state<any | null>(null);
  let resumoLinhas = $state<any[]>([]);
  let dataTreinoResumo = $state<string | null>(null);
  let erroFinalizar = $state("");

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
      treinosBasico < 4 ? classesTodas.filter((c) => c.id_classe === 11) : classesTodas.filter((c) => c.id_classe !== 11);
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

  async function removerPresenca(idPresenca: number) {
    if (!confirm("Remover esta presença? Essa ação corrige o cadastro, não pode ser desfeita.")) return;
    await supabase.from("fPresencas").delete().eq("id_presenca", idPresenca);
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
    if (!confirm("Finalizar este treino? Depois de finalizado não é possível registrar mais presenças.")) return;
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

  onMount(async () => {
    await carregarClasses();
    await carregarPresencas();
    const { data: treino } = await supabase.from("fTreinos").select("status").eq("id_treino", idTreino).single();
    statusTreino = treino?.status ?? "aberto";
    if (statusTreino === "finalizado") {
      await carregarResumoFinalizado();
      return;
    }
    channel = supabase
      .channel(`treino-${idTreino}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "fPresencas", filter: `id_treino=eq.${idTreino}` },
        () => carregarPresencas()
      )
      .subscribe();
  });

  onDestroy(() => {
    if (channel) supabase.removeChannel(channel);
  });
</script>

{#if statusTreino === null}
  <p>Carregando...</p>
{:else if resumo}
  <div class="admin-form">
    <p class="gold-title card-titulo">🏁 Treino finalizado!</p>
    <p>
      Treino #{idTreino}{#if dataTreinoResumo} — {new Date(dataTreinoResumo + "T00:00:00").toLocaleDateString("pt-BR")}{/if}
    </p>
    <p>{presencas.length} presença(s) registrada(s).</p>
    {#if resumo.bonus_indicacao?.length > 0}
      <p class="gold-title">Bônus de indicação:</p>
      <ul class="admin-list">
        {#each resumo.bonus_indicacao as b}
          <li><span>🏅 <strong>{b.nome}</strong> ganhou +{b.ph_ganho} PH — {b.detalhes}</span></li>
        {/each}
      </ul>
    {/if}
    <div class="table-scroll">
      <table class="ranking-tabela ranking-tabela--treino-resumo">
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
              <td class="col-faixa">{p.sigla_classe}</td>
              <td class="col-stat">
                <span class={`status-badge status-badge--${p.vestimenta ? "ativo" : "inativo"}`}>
                  {p.vestimenta ? "Sim" : "Não"}
                </span>
              </td>
              <td class="col-stat">
                <span class={`status-badge status-badge--${p.usou_faixa ? "ativo" : "inativo"}`}>
                  {p.usou_faixa ? "Sim" : "Não"}
                </span>
              </td>
              <td class="col-stat"><span class="stat-pill">{p.ph_total}</span></td>
              <td class="col-stat">
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
    <a href="/admin/treinos" class="btn btn-primary">Voltar</a>
  </div>
{:else}
  <div class="admin-form">
    <p class="gold-title card-titulo">Registrar presença</p>

    {#if membroSelecionado}
      <p class="membro-atual"><strong>Membro:</strong> {membroSelecionado.nome} <button type="button" class="btn btn-sm" onclick={() => (membroSelecionado = null)}>trocar</button></p>
      <p class="membro-atual"><span class="stat-pill">Nível Geral: {membroSelecionado.nivel_geral ?? 0}</span></p>

      <label>
        Classe
        <select bind:value={classeEscolhida}>
          {#each classesDisponiveis as c}
            <option value={c.id_classe}>{labelClasse(c)}</option>
          {/each}
        </select>
      </label>

      {#if classeInfo}
        <div class="nivel-progresso">
          <div class="nivel-progresso-info">
            <span class="stat-pill">Nível {classeInfo.nivel}</span>
            <span>{classeInfo.treinos}/{classeInfo.proximoNivelTreinos} treinos</span>
          </div>
          <div class="nivel-progresso-barra">
            <div class="nivel-progresso-fill" style={`width: ${((classeInfo.treinos % 4) / 4) * 100}%`}></div>
          </div>
          {#if classeInfo.vaiSubir}
            <p class="nivel-progresso-aviso">
              🎉 {classeEscolhida === 11
                ? "Essa presença torna o membro veterano!"
                : `Essa presença sobe a classe para o nível ${classeInfo.nivel + 1}!`}
            </p>
          {/if}
        </div>
      {/if}

      <label>
        Vestimenta (torso)
        <select bind:value={torso}>
          {#each TORSO_OPCOES as o}
            <option value={o.valor}>{o.label}</option>
          {/each}
        </select>
      </label>

      <label class="checkbox">
        <input type="checkbox" bind:checked={usouFaixa} />
        Usou faixa
      </label>

      <button type="button" class="btn btn-primary" onclick={adicionarPresenca} disabled={adicionando}>
        {adicionando ? "Adicionando..." : "+ Adicionar presença"}
      </button>
      {#if erroAdicionar}
        <p class="admin-error">{erroAdicionar}</p>
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

  <h2>Presenças registradas ({presencas.length})</h2>
  {#if carregandoPresencas}
    <p>Carregando...</p>
  {:else if presencas.length === 0}
    <p class="dashboard-empty">Nenhuma presença registrada ainda.</p>
  {:else}
    <div class="table-scroll">
      <table class="ranking-tabela ranking-tabela--presencas">
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
              <td class="col-faixa">{p.sigla_classe}</td>
              <td class="col-stat">
                <span class={`status-badge status-badge--${p.vestimenta ? "ativo" : "inativo"}`}>
                  {p.vestimenta ? "Sim" : "Não"}
                </span>
              </td>
              <td class="col-stat">
                <span class={`status-badge status-badge--${p.usou_faixa ? "ativo" : "inativo"}`}>
                  {p.usou_faixa ? "Sim" : "Não"}
                </span>
              </td>
              <td class="col-stat"><span class="stat-pill">{p.ph_ganho_treino}</span></td>
              <td class="col-stat col-acoes">
                {#if souAdminSistema}
                  <button type="button" class="btn btn-sm btn-danger" onclick={() => removerPresenca(p.id_presenca)}>remover</button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  {#if souOrganizador}
    <div class="admin-list-actions">
      <button type="button" class="btn btn-danger" onclick={finalizarTreino} disabled={finalizando}>
        {finalizando ? "Finalizando..." : "Finalizar treino"}
      </button>
    </div>
    {#if erroFinalizar}
      <p class="admin-error">{erroFinalizar}</p>
    {/if}
  {/if}
{/if}
