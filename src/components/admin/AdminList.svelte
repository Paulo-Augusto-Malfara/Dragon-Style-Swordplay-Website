<script lang="ts">
  import { supabase } from "../../lib/supabase-browser";
  import ConfirmarAcao from "./ConfirmarAcao.svelte";

  interface Props {
    kind: "posts" | "modalidades";
  }
  const { kind }: Props = $props();

  const rotulo = kind === "posts" ? "novidade" : "modalidade";
  const rotuloPlural = kind === "posts" ? "novidades" : "modalidades";

  let items = $state<any[]>([]);
  let loading = $state(true);
  let erro = $state("");
  let confirmar: ConfirmarAcao;

  async function load() {
    loading = true;
    const query = supabase
      .from(kind)
      .select("id, slug, title" + (kind === "posts" ? ", is_published, created_at" : ""));
    const { data, error } =
      kind === "posts" ? await query.order("created_at", { ascending: false }) : await query.order("id");
    erro = error?.message ?? "";
    items = data ?? [];
    loading = false;
  }

  async function remove(item: any) {
    const ok = await confirmar.pedir({
      titulo: `Excluir "${item.title}"?`,
      texto: `A ${rotulo} sai do site na hora e não dá pra recuperar o texto depois.`,
      acao: "Excluir",
      perigo: true,
    });
    if (!ok) return;
    const { error } = await supabase.from(kind).delete().eq("id", item.id);
    if (error) {
      erro = error.message;
      return;
    }
    await load();
  }

  async function togglePublish(item: any) {
    const { error } = await supabase
      .from("posts")
      .update({ is_published: !item.is_published })
      .eq("id", item.id);
    if (error) {
      erro = error.message;
      return;
    }
    await load();
  }

  const dataBR = (d: string) =>
    new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });

  load();
</script>

<ConfirmarAcao bind:this={confirmar} />

<div class="admin-secao-cab">
  <h2>
    {rotuloPlural.charAt(0).toUpperCase() + rotuloPlural.slice(1)}
    {#if !loading}<span class="contagem">{items.length}</span>{/if}
  </h2>
  <a href={`/admin/${kind}/new`} class="btn btn-primary btn-sm">+ Nova {rotulo}</a>
</div>

{#if erro}
  <p class="admin-error">{erro}</p>
{/if}

{#if loading}
  <div class="esqueleto-lista">
    {#each { length: 3 } as _}
      <div class="esqueleto esqueleto-linha"></div>
    {/each}
  </div>
{:else if items.length === 0}
  <p class="admin-vazio">Nenhuma {rotulo} cadastrada ainda.</p>
{:else}
  <ul class="admin-list">
    {#each items as item}
      <li>
        <div class="row-corpo">
          <span class="row-titulo">{item.title}</span>
          <span class="row-meta">
            <code>/{item.slug}</code>
            {#if kind === "posts"}
              <span class="status-badge status-badge--{item.is_published ? 'ativo' : 'inativo'}">
                {item.is_published ? "Publicada" : "Rascunho"}
              </span>
              {#if item.created_at}<span>{dataBR(item.created_at)}</span>{/if}
            {/if}
          </span>
        </div>
        <div class="row-acoes">
          <a href={`/admin/${kind}/${item.id}`} class="btn btn-sm btn-ghost">Editar</a>
          {#if kind === "posts"}
            <button class="btn btn-sm btn-ghost" onclick={() => togglePublish(item)}>
              {item.is_published ? "Despublicar" : "Publicar"}
            </button>
          {/if}
          <button class="btn btn-sm btn-danger" onclick={() => remove(item)}>Excluir</button>
        </div>
      </li>
    {/each}
  </ul>
{/if}

<style>
  code {
    font-size: 0.78rem;
    color: var(--ds-text-5);
  }
</style>
