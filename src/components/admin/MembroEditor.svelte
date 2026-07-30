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
{/if}
