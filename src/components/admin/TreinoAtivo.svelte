<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { supabase } from "../../lib/supabase-browser";
  import MembroPicker from "./MembroPicker.svelte";

  interface Props {
    idTreino: number;
    souOrganizador: boolean;
    souAdminSistema: boolean;
  }
  const { idTreino, souOrganizador, souAdminSistema }: Props = $props();

  const TORSO_OPCOES = [
    { valor: "nenhum", label: "Nenhum" },
    { valor: "camiseta", label: "Camiseta DS" },
    { valor: "tabardo_oficial", label: "Tabardo Oficial" },
    { valor: "tabardo_modificado", label: "Tabardo Modificado" },
  ];

  let classesMap = new Map<number, string>();
  let classesTodas = $state<{ id_classe: number; nome_classe: string }[]>([]);
  let classesDisponiveis = $state<{ id_classe: number; nome_classe: string }[]>([]);

  let membroSelecionado = $state<{ id_membro: number; nome: string } | null>(null);
  let classeEscolhida = $state<number | null>(null);
  let torso = $state("nenhum");
  let usouFaixa = $state(false);
  let adicionando = $state(false);
  let erroAdicionar = $state("");

  let presencas = $state<any[]>([]);
  let carregandoPresencas = $state(true);

  let finalizando = $state(false);
  let resumo = $state<any | null>(null);
  let erroFinalizar = $state("");

  let channel: ReturnType<typeof supabase.channel> | null = null;

  async function carregarClasses() {
    const { data } = await supabase.from("dClasses").select("id_classe, nome_classe").order("nome_classe");
    classesTodas = data ?? [];
    classesMap = new Map(classesTodas.map((c) => [c.id_classe, c.nome_classe]));
  }

  async function carregarPresencas() {
    const { data: pres } = await supabase
      .from("fPresencas")
      .select("id_presenca, id_membro, id_classe, ph_ganho_treino")
      .eq("id_treino", idTreino)
      .order("id_presenca");

    const linhas = pres ?? [];
    const ids = [...new Set(linhas.map((p) => p.id_membro))];
    let nomes = new Map<number, string>();
    if (ids.length > 0) {
      const { data: membros } = await supabase.from("dMembros").select("id_membro, nome").in("id_membro", ids);
      nomes = new Map((membros ?? []).map((m) => [m.id_membro, m.nome]));
    }

    presencas = linhas.map((p) => ({
      ...p,
      nome: nomes.get(p.id_membro) ?? `#${p.id_membro}`,
      nome_classe: classesMap.get(p.id_classe) ?? `#${p.id_classe}`,
    }));
    carregandoPresencas = false;
  }

  async function checarElegibilidade(idMembro: number) {
    const { data } = await supabase
      .from("v_ranking_por_classe")
      .select("treinos_por_classe")
      .eq("id_membro", idMembro)
      .eq("id_classe", 11)
      .maybeSingle();
    const treinosBasico = data?.treinos_por_classe ?? 0;
    classesDisponiveis =
      treinosBasico < 4 ? classesTodas.filter((c) => c.id_classe === 11) : classesTodas.filter((c) => c.id_classe !== 11);
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
    resumo = data;
  }

  onMount(async () => {
    await carregarClasses();
    await carregarPresencas();
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

{#if resumo}
  <div class="admin-form">
    <p class="gold-title">🏁 Treino finalizado!</p>
    <p>{presencas.length} presença(s) registrada(s).</p>
    {#if resumo.bonus_indicacao?.length > 0}
      <p class="gold-title">Bônus de indicação:</p>
      <ul>
        {#each resumo.bonus_indicacao as b}
          <li>+{b.ph_ganho} PH — {b.detalhes}</li>
        {/each}
      </ul>
    {/if}
    <a href="/admin/treinos" class="btn btn-primary">Voltar</a>
  </div>
{:else}
  <div class="admin-form">
    <p class="gold-title">Registrar presença</p>

    {#if membroSelecionado}
      <p><strong>Membro:</strong> {membroSelecionado.nome} <button type="button" class="btn btn-sm" onclick={() => (membroSelecionado = null)}>trocar</button></p>

      <label>
        Classe
        <select bind:value={classeEscolhida}>
          {#each classesDisponiveis as c}
            <option value={c.id_classe}>{c.nome_classe}</option>
          {/each}
        </select>
      </label>

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
    {:else}
      <MembroPicker placeholder="Buscar membro para registrar presença..." onSelect={selecionarMembro} />
    {/if}
  </div>

  <h2>Presenças registradas ({presencas.length})</h2>
  {#if carregandoPresencas}
    <p>Carregando...</p>
  {:else if presencas.length === 0}
    <p class="dashboard-empty">Nenhuma presença registrada ainda.</p>
  {:else}
    <ul class="admin-list">
      {#each presencas as p}
        <li>
          <span>{p.nome} — {p.nome_classe} <small>(+{p.ph_ganho_treino} PH)</small></span>
          {#if souAdminSistema}
            <button type="button" class="btn btn-sm btn-danger" onclick={() => removerPresenca(p.id_presenca)}>remover</button>
          {/if}
        </li>
      {/each}
    </ul>
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
