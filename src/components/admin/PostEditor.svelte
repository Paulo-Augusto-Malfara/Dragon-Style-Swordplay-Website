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

  // O slug vira a âncora da novidade dentro de /novidades, e digitar
  // "primeiro-treino-de-2026" à mão convida a erro de acento e espaço. Aqui
  // ele sai do título enquanto ninguém tiver mexido no campo, e para de
  // seguir no primeiro toque.
  let slugManual = $state(false);

  const paraSlug = (t: string) =>
    t
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

  function onTitulo() {
    if (isNew && !slugManual) slug = paraSlug(title);
  }

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
    window.location.href = "/admin/posts";
  }

  if (!isNew) load();
</script>

{#if status === "loading"}
  <div class="esqueleto esqueleto-form"></div>
{:else}
  <form class="admin-form" onsubmit={save}>
    <div class="campos">
      <label class="campo-largo">
        Título
        <input type="text" bind:value={title} oninput={onTitulo} required />
      </label>
      <label class="campo-largo">
        Endereço da novidade
        <input
          type="text"
          bind:value={slug}
          oninput={() => (slugManual = true)}
          required
          pattern="[a-z0-9-]+"
        />
        <small>Só letras minúsculas, números e hífen. É a âncora do link: /novidades#{slug || "..."}</small>
      </label>
      <label class="campo-largo">
        Texto
        <textarea bind:value={body} rows="16" required></textarea>
        <small>Aceita HTML: &lt;p&gt; para parágrafo, &lt;strong&gt; para negrito, &lt;a href&gt; para link.</small>
      </label>
    </div>

    <label class="checkbox">
      <input type="checkbox" bind:checked={isPublished} />
      Publicada (aparece na home pra qualquer visitante)
    </label>

    <div class="form-acoes">
      <button type="submit" class="btn btn-primary" disabled={status === "saving"}>
        {status === "saving" ? "Salvando..." : isNew ? "Criar novidade" : "Salvar alterações"}
      </button>
      <a href="/admin/posts" class="btn btn-ghost">Cancelar</a>
    </div>

    {#if status === "error"}
      <p class="admin-error" role="alert">{errorMessage}</p>
    {/if}
  </form>
{/if}
