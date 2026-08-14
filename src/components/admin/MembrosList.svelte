<script lang="ts">
  import { supabase } from "../../lib/supabase-browser";

  interface Props {
    podeEditar: boolean;
  }
  const { podeEditar }: Props = $props();

  const POR_PAGINA = 25;

  // O filtro mexe no `where` da consulta, então cada opção carrega o próprio
  // pedaço. "Organizadores" é nível 1 e 2 juntos, que é o mesmo corte que o
  // site usa pra decidir quem abre treino (ver isOrganizador em lib/auth.ts):
  // separar admin do sistema aqui daria uma lista de duas pessoas.
  const FILTROS = [
    { chave: "todos", label: "Todos os membros" },
    { chave: "ativos", label: "Ativos" },
    { chave: "inativos", label: "Inativos" },
    { chave: "organizadores", label: "Organizadores" },
    { chave: "staff", label: "Staff" },
  ] as const;
  type Filtro = (typeof FILTROS)[number]["chave"];

  let termo = $state("");
  let filtro = $state<Filtro>("todos");
  let pagina = $state(1);

  let membros = $state<any[]>([]);
  let total = $state(0);
  let loading = $state(true);
  let erro = $state("");
  let timer: ReturnType<typeof setTimeout> | undefined;

  const totalPaginas = $derived(Math.max(1, Math.ceil(total / POR_PAGINA)));

  async function load() {
    loading = true;
    const de = (pagina - 1) * POR_PAGINA;
    let query = supabase
      .from("v_ranking_nivel_geral")
      .select("id_membro, nome, foto_url, nivel_geral, auth_level, status_ativo", { count: "exact" })
      .order("status_ativo", { ascending: false })
      .order("nome")
      .range(de, de + POR_PAGINA - 1);

    if (termo.trim().length >= 2) query = query.ilike("nome", `%${termo.trim()}%`);
    if (filtro === "ativos") query = query.eq("status_ativo", true);
    if (filtro === "inativos") query = query.eq("status_ativo", false);
    if (filtro === "organizadores") query = query.lte("auth_level", 2);
    if (filtro === "staff") query = query.eq("auth_level", 3);

    const { data, count, error } = await query;
    erro = error?.message ?? "";
    membros = data ?? [];
    total = count ?? 0;
    loading = false;
  }

  // Buscar ou trocar de filtro sempre volta pra primeira página: senão a
  // pessoa filtra estando na página 4 e recebe uma lista vazia que parece
  // "nenhum resultado".
  function recomecar() {
    pagina = 1;
    load();
  }

  function onInput() {
    clearTimeout(timer);
    timer = setTimeout(recomecar, 250);
  }

  function irPara(p: number) {
    pagina = p;
    load();
    document.querySelector(".membros-busca")?.scrollIntoView({ block: "start" });
  }

  function limpar() {
    termo = "";
    filtro = "todos";
    recomecar();
  }

  // O painel mostra o nível de acesso porque é o que decide quem consegue
  // abrir treino, lançar doação e editar cadastro. Antes só aparecia dentro
  // da edição, um membro por vez.
  const NIVEIS = ["", "Admin do sistema", "Organizador", "Staff", "Membro"];

  const filtrando = $derived(termo.trim().length >= 2 || filtro !== "todos");

  load();
</script>

<div class="membros-busca">
  <div class="membro-picker">
    <input
      type="search"
      bind:value={termo}
      oninput={onInput}
      placeholder="Buscar membro pelo nome..."
      aria-label="Buscar membro pelo nome"
    />
  </div>
  <select bind:value={filtro} onchange={recomecar} aria-label="Filtrar membros">
    {#each FILTROS as f}
      <option value={f.chave}>{f.label}</option>
    {/each}
  </select>
  {#if podeEditar}
    <a href="/admin/membros/novo" class="btn btn-primary">+ Cadastrar</a>
  {/if}
</div>

{#if erro}
  <p class="admin-error" role="alert">{erro}</p>
{/if}

{#if loading}
  <div class="esqueleto-lista">
    {#each { length: 6 } as _}
      <div class="esqueleto esqueleto-linha"></div>
    {/each}
  </div>
{:else if membros.length === 0}
  <p class="admin-vazio">
    {filtrando ? "Nenhum membro com esse nome ou nesse filtro." : "Nenhum membro cadastrado ainda."}
    {#if filtrando}
      <br /><button type="button" class="btn btn-sm btn-ghost" onclick={limpar}>Limpar busca e filtro</button>
    {/if}
  </p>
{:else}
  <p class="membros-contagem">
    {total}
    {total === 1 ? "membro" : "membros"}
    {#if totalPaginas > 1}
      <span>, página {pagina} de {totalPaginas}</span>
    {/if}
  </p>

  <ul class="admin-list">
    {#each membros as m}
      <li>
        <span class="row-avatar">
          {#if m.foto_url}
            <img src={m.foto_url} alt="" loading="lazy" />
          {:else}
            {m.nome.charAt(0).toUpperCase()}
          {/if}
        </span>
        <div class="row-corpo">
          <span class="row-titulo">{m.nome}</span>
          <span class="row-meta">
            <span class="stat-pill">Nvl {m.nivel_geral}</span>
            <span>{NIVEIS[m.auth_level] ?? "Membro"}</span>
            {#if !m.status_ativo}
              <span class="status-badge status-badge--inativo">Inativo</span>
            {/if}
          </span>
        </div>
        {#if podeEditar}
          <div class="row-acoes">
            <a href={`/admin/membros/${m.id_membro}`} class="btn btn-sm btn-ghost">Editar</a>
          </div>
        {/if}
      </li>
    {/each}
  </ul>

  {#if totalPaginas > 1}
    <nav class="ranking-pagination" aria-label="Páginas da lista de membros">
      <button type="button" class="btn btn-sm" disabled={pagina === 1} onclick={() => irPara(pagina - 1)}>
        ‹
      </button>
      {#each Array.from({ length: totalPaginas }, (_, i) => i + 1) as p}
        <button
          type="button"
          class="btn btn-sm{p === pagina ? ' btn-primary' : ''}"
          aria-current={p === pagina ? "page" : undefined}
          onclick={() => irPara(p)}
        >
          {p}
        </button>
      {/each}
      <button
        type="button"
        class="btn btn-sm"
        disabled={pagina === totalPaginas}
        onclick={() => irPara(pagina + 1)}
      >
        ›
      </button>
    </nav>
  {/if}
{/if}

<style>
  /* Busca, filtro e cadastro na mesma linha: são as três coisas que se faz ao
     abrir esta tela, e o botão de cadastrar estava lá embaixo, depois de
     cinquenta linhas de lista. */
  .membros-busca {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    max-width: 760px;
    margin: 0 auto 1em;
    scroll-margin-top: calc(var(--ds-header-h) + 70px);
  }

  .membros-busca :global(.membro-picker) {
    flex: 1 1 220px;
  }

  .membros-busca select {
    flex: 0 1 auto;
    min-height: 2.9em;
    padding: 0.6em 0.8em;
    border: 1px solid var(--ds-line-strong);
    border-radius: 10px;
    background: var(--ds-bg-alt);
    color: var(--ds-text-1);
    font-family: var(--ds-font-body);
    font-size: 0.95rem;
    color-scheme: dark;
  }

  .membros-busca select:focus {
    border-color: var(--ds-gold);
    box-shadow: 0 0 0 3px var(--ds-gold-wash);
    outline: none;
  }

  .membros-contagem {
    max-width: 760px;
    margin: 0 auto 0.6em;
    font-size: 0.8rem;
    color: var(--ds-text-5);
  }

  .membros-contagem span {
    color: var(--ds-text-5);
  }
</style>
