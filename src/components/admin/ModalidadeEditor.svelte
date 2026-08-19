<script lang="ts">
  import { supabase } from "../../lib/supabase-browser";

  interface Props {
    id: string;
    /* Id da pauta aprovada que originou esta modalidade, quando a criação veio
       do mural. Só o admin do sistema chega aqui com isso preenchido, e a
       gravação passa a ser pela RPC, que numa transação só cria a modalidade,
       fecha a pauta e paga os 10 PH ao autor. */
    pauta?: number | null;
  }
  const { id, pauta = null }: Props = $props();
  const isNew = id === "new";

  let slug = $state("");
  let title = $state("");
  let description = $state("");
  let objective = $state("");
  let scoringRespawn = $state("");
  let requirements = $state("");
  let minParticipantes = $state(0);
  let variations = $state("");
  let status = $state<"idle" | "loading" | "saving" | "saved" | "error">(
    isNew && !pauta ? "idle" : "loading",
  );
  let errorMessage = $state("");
  let autorDaPauta = $state("");

  const toLines = (arr: string[] | null) => (arr ?? []).join("\n");
  const toArray = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);

  /* Endereço sugerido a partir do título, só como ponto de partida: quem
     publica revisa antes de salvar. Sem acento, sem símbolo, sem hífen dobrado. */
  const sugerirSlug = (texto: string) =>
    texto
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  async function loadPauta() {
    const { data, error } = await supabase
      .from("fPautas")
      .select("titulo, corpo, proposta, dMembros(nome, apelido)")
      .eq("id_pauta", pauta)
      .single();
    if (error) {
      status = "error";
      errorMessage = error.message;
      return;
    }
    const proposta = (data.proposta ?? {}) as Record<string, any>;
    title = data.titulo;
    slug = sugerirSlug(data.titulo);
    // A descrição da modalidade é o corpo da pauta: quem propôs escreveu ali
    // como o jogo funciona, e não existe um segundo campo pra mesma coisa.
    description = data.corpo;
    objective = toLines(proposta.objective);
    scoringRespawn = toLines(proposta.scoring_respawn);
    requirements = toLines(proposta.requirements);
    variations = toLines(proposta.variations);
    minParticipantes = proposta.min_participantes ?? 0;
    autorDaPauta = data.dMembros?.apelido?.trim() || data.dMembros?.nome || "";
    status = "idle";
  }

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
    const { error } = pauta
      ? await supabase.rpc("publicar_modalidade_da_pauta", {
          p_id_pauta: pauta,
          p_slug: payload.slug,
          p_title: payload.title,
          p_description: payload.description,
          p_objective: payload.objective,
          p_scoring_respawn: payload.scoring_respawn,
          p_requirements: payload.requirements,
          p_variations: payload.variations,
          p_min_participantes: payload.min_participantes,
        })
      : isNew
        ? await supabase.from("modalidades").insert(payload)
        : await supabase.from("modalidades").update(payload).eq("id", id);
    if (error) {
      status = "error";
      errorMessage = error.message;
      return;
    }
    status = "saved";
    window.location.href = pauta ? "/admin/pautas" : "/admin/modalidades";
  }

  if (pauta) loadPauta();
  else if (!isNew) load();
</script>

{#if status === "loading"}
  <div class="esqueleto esqueleto-form"></div>
{:else}
  <form class="admin-form" onsubmit={save}>
    {#if pauta}
      <p class="admin-form-nota">
        Proposta de {autorDaPauta || "um membro"}, aprovada no fim do teste.
        Salvar publica a modalidade e credita 10 PH a quem teve a ideia.
      </p>
    {/if}

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
        {status === "saving"
          ? "Salvando..."
          : pauta
            ? "Publicar e creditar 10 PH"
            : isNew
              ? "Criar modalidade"
              : "Salvar alterações"}
      </button>
      <a href={pauta ? "/admin/pautas" : "/admin/modalidades"} class="btn btn-ghost">Cancelar</a>
    </div>

    {#if status === "error"}
      <p class="admin-error" role="alert">{errorMessage}</p>
    {/if}
  </form>
{/if}
