<script lang="ts">
  import { supabase } from "../../lib/supabase-browser";

  interface Membro {
    id_membro: number;
    nome: string;
    foto_url?: string | null;
    nivel_geral?: number;
    status_ativo?: boolean;
  }

  interface Props {
    placeholder?: string;
    excludeId?: number;
    onSelect: (membro: Membro) => void;
    onCriarNovo?: () => void;
  }
  const { placeholder = "Buscar membro...", excludeId, onSelect, onCriarNovo }: Props = $props();

  let termo = $state("");
  let resultados = $state<Membro[]>([]);
  let buscando = $state(false);
  let aberto = $state(false);
  // Qual resultado está marcado pela seta do teclado. -1 é "nenhum ainda".
  let marcado = $state(-1);
  let caixa: HTMLDivElement;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const mostrando = $derived(aberto && termo.trim().length >= 2);

  function onInput() {
    aberto = true;
    marcado = -1;
    clearTimeout(timer);
    if (termo.trim().length < 2) {
      resultados = [];
      return;
    }
    timer = setTimeout(buscar, 250);
  }

  async function buscar() {
    buscando = true;
    let query = supabase
      .from("v_ranking_nivel_geral")
      .select("id_membro, nome, foto_url, nivel_geral, status_ativo")
      .ilike("nome", `%${termo.trim()}%`)
      .order("status_ativo", { ascending: false })
      .order("nome")
      .limit(10);
    if (excludeId) query = query.neq("id_membro", excludeId);
    const { data } = await query;
    resultados = data ?? [];
    marcado = resultados.length > 0 ? 0 : -1;
    buscando = false;
  }

  function escolher(m: Membro) {
    onSelect(m);
    termo = "";
    resultados = [];
    aberto = false;
    marcado = -1;
  }

  // Registrar presença é a tarefa mais repetida do painel: digitar o nome,
  // descer com a seta e apertar Enter tira a mão do teclado zero vez. Antes
  // só dava pra escolher com o mouse.
  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      aberto = false;
      return;
    }
    if (!mostrando || resultados.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      marcado = (marcado + 1) % resultados.length;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      marcado = (marcado - 1 + resultados.length) % resultados.length;
    } else if (e.key === "Enter" && marcado >= 0) {
      e.preventDefault();
      escolher(resultados[marcado]);
    }
  }
</script>

<div
  class="membro-picker"
  bind:this={caixa}
  onfocusout={(e) => {
    if (!caixa.contains(e.relatedTarget as Node | null)) aberto = false;
  }}
>
  <input
    type="text"
    role="combobox"
    aria-expanded={mostrando}
    aria-controls="membro-picker-lista"
    aria-autocomplete="list"
    autocomplete="off"
    bind:value={termo}
    oninput={onInput}
    onkeydown={onKeydown}
    onfocus={() => (aberto = true)}
    {placeholder}
  />
  {#if mostrando}
    <!-- preventDefault no mousedown: sem ele o clique tira o foco do campo,
         a lista fecha antes do click chegar no botão, e a escolha some. -->
    <ul
      class="membro-picker-results"
      id="membro-picker-lista"
      role="listbox"
      onmousedown={(e) => e.preventDefault()}
    >
      {#if buscando}
        <li class="membro-picker-empty">Buscando...</li>
      {:else if resultados.length === 0}
        <li class="membro-picker-empty">Nenhum membro com esse nome.</li>
      {:else}
        {#each resultados as m, i}
          <li>
            <button
              type="button"
              role="option"
              aria-selected={i === marcado}
              onclick={() => escolher(m)}
              onmouseenter={() => (marcado = i)}
            >
              <span class="row-avatar">
                {#if m.foto_url}
                  <img src={m.foto_url} alt="" loading="lazy" />
                {:else}
                  {m.nome.charAt(0).toUpperCase()}
                {/if}
              </span>
              <span class="membro-picker-nome">{m.nome} <small>Nvl {m.nivel_geral}</small></span>
              <span class="status-dot {m.status_ativo ? 'status-dot--ativo' : 'status-dot--inativo'}"
              ></span>
            </button>
          </li>
        {/each}
      {/if}
      {#if onCriarNovo && !buscando}
        <li class="membro-picker-criar">
          <button type="button" onclick={onCriarNovo}>+ Cadastrar novo membro</button>
        </li>
      {/if}
    </ul>
  {/if}
</div>

<style>
  small {
    color: var(--ds-text-5);
    font-size: 0.8em;
  }
</style>
