<script lang="ts">
  import { supabase } from "../../lib/supabase-browser";

  interface Membro {
    id_membro: number;
    nome: string;
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
    let query = supabase.from("dMembros").select("id_membro, nome").ilike("nome", `%${termo.trim()}%`).order("nome").limit(10);
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
            <button type="button" onclick={() => escolher(m)}>{m.nome}</button>
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
