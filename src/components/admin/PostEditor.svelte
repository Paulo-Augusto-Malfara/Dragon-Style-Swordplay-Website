<script lang="ts">
  import { supabase } from "../../lib/supabase-browser";

  interface Props {
    id: string;
  }
  const { id }: Props = $props();
  const isNew = id === "new";

  let slug = $state("");
  let title = $state("");
  let body = $state("");
  let isPublished = $state(false);
  let status = $state<"idle" | "loading" | "saving" | "saved" | "error">(isNew ? "idle" : "loading");
  let errorMessage = $state("");

  async function load() {
    const { data, error } = await supabase.from("posts").select("*").eq("id", id).single();
    if (error) {
      status = "error";
      errorMessage = error.message;
      return;
    }
    slug = data.slug;
    title = data.title;
    body = data.body;
    isPublished = data.is_published;
    status = "idle";
  }

  async function save(e: SubmitEvent) {
    e.preventDefault();
    status = "saving";
    const payload = {
      slug,
      title,
      body,
      is_published: isPublished,
      published_at: isPublished ? new Date().toISOString() : null,
    };
    const { error } = isNew
      ? await supabase.from("posts").insert(payload)
      : await supabase.from("posts").update(payload).eq("id", id);
    if (error) {
      status = "error";
      errorMessage = error.message;
      return;
    }
    status = "saved";
    window.location.href = "/admin";
  }

  if (!isNew) load();
</script>

{#if status === "loading"}
  <p>Carregando...</p>
{:else}
  <form class="admin-form" onsubmit={save}>
    <label>
      Slug
      <input type="text" bind:value={slug} required pattern="[a-z0-9-]+" />
    </label>
    <label>
      Título
      <input type="text" bind:value={title} required />
    </label>
    <label>
      Corpo (HTML)
      <textarea bind:value={body} rows="16" required></textarea>
    </label>
    <label class="checkbox">
      <input type="checkbox" bind:checked={isPublished} />
      Publicado
    </label>
    <button type="submit" class="btn btn-primary" disabled={status === "saving"}>
      {status === "saving" ? "Salvando..." : "Salvar"}
    </button>
    {#if status === "error"}
      <p class="admin-error">{errorMessage}</p>
    {/if}
  </form>
{/if}
