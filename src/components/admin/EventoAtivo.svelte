<script lang="ts">
  import { supabase } from "../../lib/supabase-browser";
  import MembroPicker from "./MembroPicker.svelte";
  import ConfirmarAcao from "./ConfirmarAcao.svelte";

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

  let membroSelecionado = $state<{ id_membro: number; nome: string; foto_url?: string | null } | null>(null);
  let torso = $state("nenhum");
  let usouFaixa = $state(false);
  let adicionando = $state(false);
  let erroAdicionar = $state("");
  let confirmar: ConfirmarAcao;

  let presencas = $state<any[]>([]);
  let carregandoPresencas = $state(true);

  let evento = $state<{ nome_evento: string; cidade: string; numero_dia: number } | null>(null);

  let finalizando = $state(false);
  let resumo = $state<any | null>(null);
  let participantesResumo = $state<any[]>([]);
  let erroFinalizar = $state("");

  async function carregarEvento() {
    const { data } = await supabase
      .from("fEventos")
      .select("nome_evento, cidade, numero_dia")
      .eq("id_evento", idEvento)
      .single();
    if (!data) return;
    evento = { nome_evento: data.nome_evento, cidade: data.cidade, numero_dia: data.numero_dia };
  }

  async function carregarPresencas() {
    const { data: pres } = await supabase
      .from("fEventos_Presencas")
      .select("id_registro, id_membro, ph_ganho")
      .eq("id_evento", idEvento)
      .order("id_registro");

    const linhas = pres ?? [];
    const ids = [...new Set(linhas.map((p) => p.id_membro))];
    let membrosMap = new Map<number, { nome: string; foto_url: string | null }>();
    if (ids.length > 0) {
      const { data: membros } = await supabase
        .from("dMembros")
        .select("id_membro, nome, foto_url")
        .in("id_membro", ids);
      membrosMap = new Map((membros ?? []).map((m) => [m.id_membro, m]));
    }

    presencas = linhas.map((p) => ({
      ...p,
      nome: membrosMap.get(p.id_membro)?.nome ?? `#${p.id_membro}`,
      foto_url: membrosMap.get(p.id_membro)?.foto_url ?? null,
    }));
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

  async function removerPresenca(p: any) {
    const ok = await confirmar.pedir({
      titulo: `Remover ${p.nome} deste evento?`,
      texto: "Serve pra corrigir lançamento errado. O PH do evento sai junto.",
      acao: "Remover",
      perigo: true,
    });
    if (!ok) return;
    await supabase.from("fEventos_Presencas").delete().eq("id_registro", p.id_registro);
    await carregarPresencas();
  }

  async function finalizarEvento() {
    const ok = await confirmar.pedir({
      titulo: `Fechar o evento com ${presencas.length} ${presencas.length === 1 ? "participante" : "participantes"}?`,
      texto: "É o fechamento que distribui o PH. Depois de fechado não dá pra lançar mais ninguém.",
      acao: "Fechar evento",
    });
    if (!ok) return;
    finalizando = true;
    erroFinalizar = "";
    const { data, error } = await supabase.rpc("fechar_evento", { p_id_evento: idEvento });
    finalizando = false;
    if (error) {
      erroFinalizar = error.message;
      return;
    }
    resumo = data;
    const { data: registros } = await supabase
      .from("v_registro_eventos")
      .select("nome, foto_url, ph_ganho, nivel_geral, subiu_nivel_geral, subida_nivel_geral")
      .eq("id_evento", idEvento);
    participantesResumo = registros ?? [];
  }

  carregarEvento();
  carregarPresencas();
</script>

<ConfirmarAcao bind:this={confirmar} />

{#if resumo}
  <div class="admin-form">
    <p class="admin-ok">
      Evento fechado. {resumo.participantes.length}
      {resumo.participantes.length === 1 ? "participante" : "participantes"}, {resumo.total_ph} PH distribuídos.
    </p>
  </div>

  <div class="admin-secao-cab">
    <h2>Como ficou <span class="contagem">{participantesResumo.length}</span></h2>
  </div>
  <div class="table-scroll">
    <table class="ranking-tabela ranking-tabela--evento tabela-cartoes">
      <thead>
        <tr>
          <th class="col-nome">Nome</th>
          <th class="col-stat">PH Ganho</th>
          <th class="col-stat">Nível Geral</th>
        </tr>
      </thead>
      <tbody>
        {#each participantesResumo as p}
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
            <td class="col-stat" data-label="PH ganho"><span class="stat-pill">{p.ph_ganho}</span></td>
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
    <a href="/admin/eventos" class="btn btn-primary">Voltar para eventos</a>
  </div>
{:else}
  <div class="admin-form">
    {#if evento}
      <p class="admin-form-titulo">{evento.nome_evento}</p>
      <p class="admin-form-nota">{evento.cidade}, dia {evento.numero_dia} do evento.</p>
    {/if}

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
        </div>
        <div class="row-acoes">
          <button type="button" class="btn btn-sm btn-ghost" onclick={() => (membroSelecionado = null)}>
            Trocar
          </button>
        </div>
      </div>

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
          {adicionando ? "Adicionando..." : "Adicionar participante"}
        </button>
      </div>
      {#if erroAdicionar}
        <p class="admin-error" role="alert">{erroAdicionar}</p>
      {/if}
    {:else}
      <MembroPicker placeholder="Buscar quem participou do evento..." onSelect={selecionarMembro} />
    {/if}
  </div>

  <div class="admin-secao-cab">
    <h2>Participantes <span class="contagem">{presencas.length}</span></h2>
  </div>

  {#if carregandoPresencas}
    <div class="esqueleto-lista">
      {#each { length: 3 } as _}
        <div class="esqueleto esqueleto-linha"></div>
      {/each}
    </div>
  {:else if presencas.length === 0}
    <p class="vazio">Ninguém lançado ainda. Busque o membro acima para começar.</p>
  {:else}
    <ul class="admin-list">
      {#each presencas as p}
        <li>
          <span class="row-avatar">
            {#if p.foto_url}
              <img src={p.foto_url} alt="" loading="lazy" />
            {:else}
              {p.nome.charAt(0).toUpperCase()}
            {/if}
          </span>
          <div class="row-corpo">
            <span class="row-titulo">{p.nome}</span>
          </div>
          <span class="stat-pill">+{p.ph_ganho} PH</span>
          {#if souAdminSistema}
            <div class="row-acoes">
              <button type="button" class="btn btn-sm btn-danger" onclick={() => removerPresenca(p)}>
                Remover
              </button>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  {#if souOrganizador}
    <div class="fechar-evento">
      <p>Fechar distribui o PH de quem está na lista. Enquanto estiver aberto, não dá pra abrir outro evento.</p>
      <button
        type="button"
        class="btn btn-primary"
        onclick={finalizarEvento}
        disabled={finalizando || presencas.length === 0}
      >
        {finalizando ? "Fechando..." : "Fechar evento"}
      </button>
    </div>
    {#if presencas.length === 0}
      <p class="fechar-nota">Lance ao menos um participante antes de fechar.</p>
    {/if}
    {#if erroFinalizar}
      <p class="admin-error" role="alert">{erroFinalizar}</p>
    {/if}
  {/if}
{/if}

<style>
  .fechar-evento {
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

  .fechar-evento p {
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
    font-size: 0.85rem;
    color: var(--ds-text-4);
  }
</style>
