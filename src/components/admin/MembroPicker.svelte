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
  let timer: ReturnType<typeof setTimeout> | undefined;

  function onInput() {
    aberto = true;
    clearTimeout(timer);
    if (termo.trim().length < 2) {
      resultados = [];
      return;
    }
    timer = setTimeout(buscar, 250);
  }

  async function buscar() {
    buscando = true;
    let query = supabase.from("v_ranking_nivel_geral").select("id_membro, nome, foto_url, nivel_geral, status_ativo").ilike("nome", `%${termo.trim()}%`).order("status_ativo", { ascending: false }).order("nome").limit(10);
    if (excludeId) query = query.neq("id_membro", excludeId);
    const { data } = await query;
    resultados = data ?? [];
    buscando = false;
  }

  function escolher(m: Membro) {
    onSelect(m);
    termo = "";
    resultados = [];
    aberto = false;
  }
</script>

<div class="membro-picker">
  <input
    type="text"
    bind:value={termo}
    oninput={onInput}
    onfocus={() => (aberto = true)}
    {placeholder}
  />
  {#if aberto && termo.trim().length >= 2}
    <ul class="membro-picker-results">
      {#if buscando}
        <li class="membro-picker-empty">Buscando...</li>
      {:else if resultados.length === 0}
        <li class="membro-picker-empty">Nenhum membro encontrado.</li>
      {:else}
        {#each resultados as m}
          <li>
            <button type="button" onclick={() => escolher(m)}>
              <p class="mural-avatar" style="width:2em;height:2em;font-size:0.85em;margin:0;flex-shrink:0;">
                {#if m.foto_url}
                  <img src={m.foto_url} alt="" />
                {:else}
                  {m.nome.charAt(0).toUpperCase()}
                {/if}
              </p>
              <span class="membro-picker-nome">{m.nome} <small>(Nvl {m.nivel_geral})</small></span>
              <span class="status-dot {m.status_ativo ? 'status-dot--ativo' : 'status-dot--inativo'}"></span>
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
