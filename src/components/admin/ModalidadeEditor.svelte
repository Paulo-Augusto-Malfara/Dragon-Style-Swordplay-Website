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
  let minParticipantes = $state(0);
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
    minParticipantes = data.min_participantes ?? 0;
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
      min_participantes: Number(minParticipantes) || 0,
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
    window.location.href = "/admin/modalidades";
  }

  if (!isNew) load();
</script>

{#if status === "loading"}
  <div class="esqueleto esqueleto-form"></div>
{:else}
  <form class="admin-form" onsubmit={save}>
    <p class="admin-form-titulo">Identificação</p>

    <div class="campos">
      <label>
        Título
        <input type="text" bind:value={title} required />
      </label>
      <label>
        Endereço da página
        <input type="text" bind:value={slug} required pattern="[a-z0-9-]+" />
        <small>Só letras minúsculas, números e hífen.</small>
      </label>
      <label>
        Mínimo de participantes
        <input type="number" bind:value={minParticipantes} min="0" max="200" step="1" />
        <small>
          Alimenta o filtro "quantos vieram hoje?" da página de modalidades. Deixe 0 se não houver
          mínimo: aí a modalidade aparece em todos os filtros.
        </small>
      </label>
    </div>

    <p class="admin-form-titulo">Como se joga</p>
    <p class="admin-form-nota">Um item por linha em todos os campos abaixo. Linha vazia é ignorada.</p>

    <div class="campos">
      <label class="campo-largo">
        Descrição
        <textarea bind:value={description} rows="5"></textarea>
        <small>Um parágrafo por linha.</small>
      </label>
      <label>
        Objetivo e condição de vitória
        <textarea bind:value={objective} rows="4"></textarea>
      </label>
      <label>
        Pontuação e respawn
        <textarea bind:value={scoringRespawn} rows="4"></textarea>
      </label>
      <label>
        Requisitos e armas permitidas
        <textarea bind:value={requirements} rows="4"></textarea>
      </label>
      <label>
        Regras específicas e variações
        <textarea bind:value={variations} rows="4"></textarea>
        <small>Opcional.</small>
      </label>
    </div>

    <div class="form-acoes">
      <button type="submit" class="btn btn-primary" disabled={status === "saving"}>
        {status === "saving" ? "Salvando..." : isNew ? "Criar modalidade" : "Salvar alterações"}
      </button>
      <a href="/admin/modalidades" class="btn btn-ghost">Cancelar</a>
    </div>

    {#if status === "error"}
      <p class="admin-error" role="alert">{errorMessage}</p>
    {/if}
  </form>
{/if}
