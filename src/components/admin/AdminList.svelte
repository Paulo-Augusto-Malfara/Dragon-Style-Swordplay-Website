<script lang="ts">
  import { supabase } from "../../lib/supabase-browser";

  interface Props {
    kind: "posts" | "modalidades";
  }
  const { kind }: Props = $props();

  let items = $state<any[]>([]);
  let loading = $state(true);

  async function load() {
    loading = true;
    const { data } = await supabase
      .from(kind)
      .select("id, slug, title" + (kind === "posts" ? ", is_published" : ""))
      .order("id");
    items = data ?? [];
    loading = false;
  }

  async function remove(id: number) {
    if (!confirm("Excluir este item?")) return;
    if (!confirm("Essa ação não pode ser desfeita. Confirma a exclusão?")) return;
    await supabase.from(kind).delete().eq("id", id);
    await load();
  }

  async function togglePublish(item: any) {
    await supabase.from("posts").update({ is_published: !item.is_published }).eq("id", item.id);
    await load();
  }

  load();
</script>

{#if loading}
  <p>Carregando...</p>
{:else}
  <ul class="admin-list">
    {#each items as item}
      <li>
        <span>{item.title}</span>
        <a href={`/admin/${kind}/${item.id}`} class="btn btn-sm">editar</a>
        {#if kind === "posts"}
          <button class="btn btn-sm" onclick={() => togglePublish(item)}>
            {item.is_published ? "despublicar" : "publicar"}
          </button>
        {/if}
        <button class="btn btn-sm btn-danger" onclick={() => remove(item.id)}>excluir</button>
      </li>
    {/each}
  </ul>
{/if}
<div class="admin-list-actions">
  <a href={`/admin/${kind}/new`} class="btn btn-primary">+ novo</a>
</div>
