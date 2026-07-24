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
  <ul>
    {#each items as item}
      <li>
        <span>{item.title}</span>
        <a href={`/admin/${kind}/${item.id}`}>editar</a>
        {#if kind === "posts"}
          <button onclick={() => togglePublish(item)}>
            {item.is_published ? "despublicar" : "publicar"}
          </button>
        {/if}
        <button onclick={() => remove(item.id)}>excluir</button>
      </li>
    {/each}
  </ul>
{/if}
<a href={`/admin/${kind}/new`}>+ novo</a>

<style>
  ul {
    list-style: none;
  }
  li {
    display: flex;
    gap: 1em;
    align-items: center;
    padding: 0.5em 0;
    border-bottom: 1px solid var(--border-dark-color);
  }
  li span {
    flex: 1;
  }
</style>
