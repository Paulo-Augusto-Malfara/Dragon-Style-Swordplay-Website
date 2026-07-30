<script lang="ts">
  import { supabase } from "../../lib/supabase-browser";
  import MembroPicker from "./MembroPicker.svelte";

  interface Props {
    idEvento: number;
    souOrganizador: boolean;
    souAdminSistema: boolean;
  }
  const { idEvento, souOrganizador, souAdminSistema }: Props = $props();

  const TORSO_OPCOES = [
    { valor: "nenhum", label: "Nenhum" },
    { valor: "camiseta", label: "Camiseta DS" },
    { valor: "tabardo_oficial", label: "Tabardo Oficial" },
    { valor: "tabardo_modificado", label: "Tabardo Modificado" },
  ];

  let membroSelecionado = $state<{ id_membro: number; nome: string } | null>(null);
  let torso = $state("nenhum");
  let usouFaixa = $state(false);
  let adicionando = $state(false);
  let erroAdicionar = $state("");

  let presencas = $state<any[]>([]);
  let carregandoPresencas = $state(true);

  let finalizando = $state(false);
  let resumo = $state<any | null>(null);
  let erroFinalizar = $state("");

  async function carregarPresencas() {
    const { data: pres } = await supabase
      .from("fEventos_Presencas")
      .select("id_registro, id_membro, ph_ganho")
      .eq("id_evento", idEvento)
      .order("id_registro");

    const linhas = pres ?? [];
    const ids = [...new Set(linhas.map((p) => p.id_membro))];
    let nomes = new Map<number, string>();
    if (ids.length > 0) {
      const { data: membros } = await supabase.from("dMembros").select("id_membro, nome").in("id_membro", ids);
      nomes = new Map((membros ?? []).map((m) => [m.id_membro, m.nome]));
    }

    presencas = linhas.map((p) => ({ ...p, nome: nomes.get(p.id_membro) ?? `#${p.id_membro}` }));
    carregandoPresencas = false;
  }

  function selecionarMembro(m: { id_membro: number; nome: string }) {
    membroSelecionado = m;
    torso = "nenhum";
    usouFaixa = false;
    erroAdicionar = "";
  }

  async function adicionarPresenca() {
    if (!membroSelecionado) return;
    adicionando = true;
    erroAdicionar = "";
    const { error } = await supabase.rpc("registrar_presenca_evento", {
      p_id_evento: idEvento,
      p_id_membro: membroSelecionado.id_membro,
      p_torso: torso,
      p_usou_faixa: usouFaixa,
    });
    adicionando = false;
    if (error) {
      erroAdicionar = error.message;
      return;
    }
    membroSelecionado = null;
    torso = "nenhum";
    usouFaixa = false;
    await carregarPresencas();
  }

  async function removerPresenca(idRegistro: number) {
    if (!confirm("Remover esta presença? Essa ação corrige o cadastro, não pode ser desfeita.")) return;
    await supabase.from("fEventos_Presencas").delete().eq("id_registro", idRegistro);
    await carregarPresencas();
  }

  async function finalizarEvento() {
    if (!confirm("Finalizar este evento? Depois de finalizado não é possível registrar mais presenças.")) return;
    finalizando = true;
    erroFinalizar = "";
    const { data, error } = await supabase.rpc("fechar_evento", { p_id_evento: idEvento });
    finalizando = false;
    if (error) {
      erroFinalizar = error.message;
      return;
    }
    resumo = data;
  }

  carregarPresencas();
</script>

{#if resumo}
  <div class="admin-form">
    <p class="gold-title">🚩 Evento finalizado!</p>
    <p>{resumo.participantes.length} participante(s) — {resumo.total_ph} PH distribuídos.</p>
    <ul>
      {#each resumo.participantes as p}
        <li>{p.nome} — +{p.ph} PH</li>
      {/each}
    </ul>
    <a href="/admin/eventos" class="btn btn-primary">Voltar</a>
  </div>
{:else}
  <div class="admin-form">
    <p class="gold-title">Registrar presença</p>

    {#if membroSelecionado}
      <p><strong>Membro:</strong> {membroSelecionado.nome} <button type="button" class="btn btn-sm" onclick={() => (membroSelecionado = null)}>trocar</button></p>

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
          <span>{p.nome} <small>(+{p.ph_ganho} PH)</small></span>
          {#if souAdminSistema}
            <button type="button" class="btn btn-sm btn-danger" onclick={() => removerPresenca(p.id_registro)}>remover</button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  {#if souOrganizador}
    <div class="admin-list-actions">
      <button type="button" class="btn btn-danger" onclick={finalizarEvento} disabled={finalizando}>
        {finalizando ? "Finalizando..." : "Finalizar evento"}
      </button>
    </div>
    {#if erroFinalizar}
      <p class="admin-error">{erroFinalizar}</p>
    {/if}
  {/if}
{/if}
