<script lang="ts">
  import { supabase } from "../../lib/supabase-browser";

  let itens = $state<any[]>([]);
  let loading = $state(true);

  async function load() {
    loading = true;
    const { data } = await supabase
      .from("fAgendaTreinos")
      .select("id_agenda, data_treino, horario_inicio, cidade, status")
      .order("data_treino");
    itens = data ?? [];
    loading = false;
  }

  async function remove(id: number) {
    if (!confirm("Excluir este item da agenda?")) return;
    await supabase.from("fAgendaTreinos").delete().eq("id_agenda", id);
    await load();
  }

  load();
</script>

{#if loading}
  <p>Carregando...</p>
{:else}
  <ul class="admin-list">
    {#each itens as item}
      <li>
        <span>
          {new Date(item.data_treino + "T00:00:00").toLocaleDateString("pt-BR")} às {item.horario_inicio} — {item.cidade}
          <small>({item.status})</small>
        </span>
        <a href={`/admin/agenda/${item.id_agenda}`} class="btn btn-sm">editar</a>
        <button class="btn btn-sm btn-danger" onclick={() => remove(item.id_agenda)}>excluir</button>
      </li>
    {/each}
  </ul>
  {#if itens.length === 0}
    <p class="dashboard-empty">Nenhum treino agendado ainda.</p>
  {/if}
{/if}
<div class="admin-list-actions">
  <a href="/admin/agenda/new" class="btn btn-primary">+ novo</a>
</div>
