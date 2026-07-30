<script lang="ts">
  import { supabase } from "../../lib/supabase-browser";

  interface Props {
    podeEditar: boolean;
  }
  const { podeEditar }: Props = $props();

  let termo = $state("");
  let membros = $state<any[]>([]);
  let loading = $state(true);
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function load() {
    loading = true;
    let query = supabase
      .from("v_ranking_nivel_geral")
      .select("id_membro, nome, foto_url, nivel_geral, auth_level, status_ativo")
      .order("nome")
      .limit(50);
    if (termo.trim().length >= 2) {
      query = query.ilike("nome", `%${termo.trim()}%`);
    }
    const { data } = await query;
    membros = data ?? [];
    loading = false;
  }

  function onInput() {
    clearTimeout(timer);
    timer = setTimeout(load, 250);
  }

  load();
</script>

<div class="membro-picker" style="max-width: 480px; margin-bottom: 1em;">
  <input type="text" bind:value={termo} oninput={onInput} placeholder="Buscar membro pelo nome..." />
</div>

{#if loading}
  <p>Carregando...</p>
{:else}
  <ul class="admin-list">
    {#each membros as m}
      <li>
        <p class="mural-avatar" style="width:2.4em;height:2.4em;font-size:1em;flex-shrink:0;">
          {#if m.foto_url}
            <img src={m.foto_url} alt="" />
          {:else}
            {m.nome.charAt(0).toUpperCase()}
          {/if}
        </p>
        <span>{m.nome} <small>(Nvl {m.nivel_geral})</small>{#if !m.status_ativo} <small>— inativo</small>{/if}</span>
        {#if podeEditar}
          <a href={`/admin/membros/${m.id_membro}`} class="btn btn-sm">editar</a>
        {/if}
      </li>
    {/each}
  </ul>
  {#if membros.length === 0}
    <p class="dashboard-empty">Nenhum membro encontrado.</p>
  {/if}
{/if}
<div class="admin-list-actions">
  <a href="/admin/membros/novo" class="btn btn-primary">+ cadastrar membro</a>
</div>
