<script lang="ts">
  import { supabase } from "../../lib/supabase-browser";

  interface Props {
    id: string;
  }
  const { id }: Props = $props();
  const isNew = id === "new";

  let slug = $state("");
  let title = $state("");
  let description = $state("");
  let objective = $state("");
  let scoringRespawn = $state("");
  let requirements = $state("");
  let variations = $state("");
  let status = $state<"idle" | "loading" | "saving" | "saved" | "error">(isNew ? "idle" : "loading");
  let errorMessage = $state("");

  const toLines = (arr: string[] | null) => (arr ?? []).join("\n");
  const toArray = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);

  async function load() {
    const { data, error } = await supabase.from("modalidades").select("*").eq("id", id).single();
    if (error) {
      status = "error";
      errorMessage = error.message;
      return;
    }
    slug = data.slug;
    title = data.title;
    description = toLines(data.description);
    objective = toLines(data.objective);
    scoringRespawn = toLines(data.scoring_respawn);
    requirements = toLines(data.requirements);
    variations = toLines(data.variations);
    status = "idle";
  }

  async function save(e: SubmitEvent) {
    e.preventDefault();
    status = "saving";
    const payload = {
      slug,
      title,
      description: toArray(description),
      objective: toArray(objective),
      scoring_respawn: toArray(scoringRespawn),
      requirements: toArray(requirements),
      variations: toArray(variations),
    };
    const { error } = isNew
      ? await supabase.from("modalidades").insert(payload)
      : await supabase.from("modalidades").update(payload).eq("id", id);
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
      Descrição (um parágrafo por linha)
      <textarea bind:value={description} rows="6"></textarea>
    </label>
    <label>
      Objetivo/Condição de Vitória (um item por linha)
      <textarea bind:value={objective} rows="4"></textarea>
    </label>
    <label>
      Sistema de Pontuação/Respawn (um item por linha)
      <textarea bind:value={scoringRespawn} rows="4"></textarea>
    </label>
    <label>
      Requisitos/Armas Permitidas (um item por linha)
      <textarea bind:value={requirements} rows="4"></textarea>
    </label>
    <label>
      Regras específicas/Variações (um item por linha, opcional)
      <textarea bind:value={variations} rows="4"></textarea>
    </label>
    <button type="submit" class="btn btn-primary" disabled={status === "saving"}>
      {status === "saving" ? "Salvando..." : "Salvar"}
    </button>
    {#if status === "error"}
      <p class="admin-error">{errorMessage}</p>
    {/if}
  </form>
{/if}
