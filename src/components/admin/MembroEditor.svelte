<script lang="ts">
  import { supabase } from "../../lib/supabase-browser";
  import MembroPicker from "./MembroPicker.svelte";

  interface Props {
    id: string;
  }
  const { id }: Props = $props();

  let nome = $state("");
  let email = $state("");
  let statusAtivo = $state(true);
  let authLevel = $state(4);
  let oculto = $state(false);
  let padrinho = $state<{ id_membro: number; nome: string } | null>(null);
  let trocandoPadrinho = $state(false);

  let porClasse = $state<any[]>([]);
  let historico = $state<any[]>([]);

  let status = $state<"loading" | "idle" | "saving" | "saved" | "error">("loading");
  let errorMessage = $state("");

  async function load() {
    const { data, error } = await supabase
      .from("dMembros")
      .select("nome, email, status_ativo, auth_level, oculto, indicado_por")
      .eq("id_membro", id)
      .single();
    if (error) {
      status = "error";
      errorMessage = error.message;
      return;
    }
    nome = data.nome;
    email = data.email ?? "";
    statusAtivo = data.status_ativo;
    authLevel = data.auth_level;
    oculto = data.oculto;
    if (data.indicado_por) {
      const { data: p } = await supabase.from("dMembros").select("id_membro, nome").eq("id_membro", data.indicado_por).single();
      padrinho = p;
    }

    const [classes, historia] = await Promise.all([
      supabase.from("v_ranking_por_classe").select("*").eq("id_membro", id),
      supabase.from("v_historico_presencas").select("*").eq("id_membro", id).order("data_treino", { ascending: false }),
    ]);
    porClasse = (classes.data ?? []).sort((a, b) => {
      const aBasico = a.id_classe === 11;
      const bBasico = b.id_classe === 11;
      if (aBasico !== bBasico) return aBasico ? 1 : -1;
      return b.treinos_por_classe - a.treinos_por_classe;
    });
    historico = historia.data ?? [];

    status = "idle";
  }

  async function save(e: SubmitEvent) {
    e.preventDefault();
    status = "saving";
    const { error } = await supabase
      .from("dMembros")
      .update({
        nome,
        email: email.trim() || null,
        status_ativo: statusAtivo,
        auth_level: authLevel,
        indicado_por: padrinho?.id_membro ?? null,
      })
      .eq("id_membro", id);
    if (error) {
      status = "error";
      errorMessage = error.message;
      return;
    }
    status = "saved";
    window.location.href = "/admin/membros";
  }

  async function excluirMembro() {
    if (!confirm(`Ocultar ${nome}? Ele vai sumir do login, mural e rankings.`)) return;
    if (!confirm("Essa ação não pode ser desfeita facilmente. Confirma?")) return;
    const { error } = await supabase.from("dMembros").update({ oculto: true }).eq("id_membro", id);
    if (error) {
      errorMessage = error.message;
      return;
    }
    window.location.href = "/admin/membros";
  }

  load();
</script>

{#if status === "loading"}
  <p>Carregando...</p>
{:else}
  <form class="admin-form" onsubmit={save}>
    <label>
      Nome
      <input type="text" bind:value={nome} required />
    </label>

    <label>
      Email (usado pro login)
      <input type="email" bind:value={email} placeholder="sem email vinculado" />
    </label>

    <label class="checkbox">
      <input type="checkbox" bind:checked={statusAtivo} />
      Ativo (aparece na seção "Membros Ativos" do mural)
    </label>

    <label>
      Nível de acesso
      <select bind:value={authLevel}>
        <option value={1}>1 — Admin do sistema</option>
        <option value={2}>2 — Organizador</option>
        <option value={3}>3 — Staff</option>
        <option value={4}>4 — Membro comum</option>
      </select>
    </label>

    <div>
      <p class="gold-title">Padrinho</p>
      {#if padrinho && !trocandoPadrinho}
        <p>
          {padrinho.nome}
          <button type="button" class="btn btn-sm" onclick={() => (trocandoPadrinho = true)}>trocar</button>
          <button type="button" class="btn btn-sm" onclick={() => (padrinho = null)}>remover</button>
        </p>
      {:else}
        <MembroPicker
          placeholder="Buscar padrinho..."
          excludeId={Number(id)}
          onSelect={(m) => {
            padrinho = m;
            trocandoPadrinho = false;
          }}
        />
      {/if}
    </div>

    <button type="submit" class="btn btn-primary" disabled={status === "saving"}>
      {status === "saving" ? "Salvando..." : "Salvar"}
    </button>
    {#if status === "error"}
      <p class="admin-error">{errorMessage}</p>
    {/if}
  </form>

  {#if !oculto}
    <div class="admin-list-actions">
      <button type="button" class="btn btn-danger" onclick={excluirMembro}>Ocultar / excluir membro</button>
    </div>
  {:else}
    <p class="admin-error">Este membro já está oculto (excluído).</p>
  {/if}

  <h2>Níveis por Classe</h2>
  {#if porClasse.length === 0}
    <p class="dashboard-empty">Nenhum treino registrado ainda.</p>
  {:else}
    <div class="table-scroll">
      <table class="ranking-tabela ranking-tabela--dashboard">
        <thead>
          <tr>
            <th class="col-nome">Classe</th>
            <th class="col-stat">Nível</th>
            <th class="col-stat">Treinos</th>
          </tr>
        </thead>
        <tbody>
          {#each porClasse as c}
            <tr>
              <td class="col-nome">{c.nome_classe}</td>
              <td class="col-stat"><span class="stat-pill">{c.nivel_por_classe}</span></td>
              <td class="col-stat"><span class="stat-pill">{c.treinos_por_classe}</span></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  <h2>Histórico de Presença</h2>
  {#if historico.length === 0}
    <p class="dashboard-empty">Nenhuma presença registrada ainda.</p>
  {:else}
    <div class="table-scroll">
      <table class="ranking-tabela ranking-tabela--historico">
        <thead>
          <tr>
            <th class="col-rank">Nº Treino</th>
            <th class="col-nome">Data</th>
            <th class="col-faixa">Classe</th>
            <th class="col-stat">PH Ganho</th>
          </tr>
        </thead>
        <tbody>
          {#each historico as h}
            <tr>
              <td class="col-rank"><span class="rank-badge">{h.id_treino}</span></td>
              <td class="col-nome">
                {new Date(h.data_treino).toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "2-digit",
                })}
              </td>
              <td class="col-faixa">{h.nome_classe}</td>
              <td class="col-stat"><span class="stat-pill">{h.ph_ganho_treino}</span></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
{/if}
