<script lang="ts">
  import { supabase } from "../../lib/supabase-browser";

  // ponytail: mesma lógica do AgendaEditor -- monta a data a partir dos
  // componentes locais (não toISOString(), que converte pra UTC e pode
  // pular um dia à noite no fuso do Brasil). Diferença: aqui o treino
  // normalmente é aberto no próprio domingo, então hoje conta como válido
  // em vez de sempre pular pro próximo domingo.
  function domingoAtualOuProximo(): string {
    const hoje = new Date();
    const diasAteDomingo = (7 - hoje.getDay()) % 7;
    hoje.setDate(hoje.getDate() + diasAteDomingo);
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, "0");
    const dia = String(hoje.getDate()).padStart(2, "0");
    return `${ano}-${mes}-${dia}`;
  }

  let data = $state(domingoAtualOuProximo());
  let abrindo = $state(false);
  let erro = $state("");

  const naoEDomingo = $derived(data !== "" && new Date(data + "T00:00:00").getDay() !== 0);

  async function abrir() {
    abrindo = true;
    erro = "";
    const { data: idTreino, error } = await supabase.rpc("abrir_treino", { p_data: data });
    abrindo = false;
    if (error) {
      erro = error.message;
      return;
    }
    window.location.href = `/admin/treinos/${idTreino}`;
  }
</script>

<div class="admin-form">
  <label class="label-center">
    Data do treino
    <input type="date" bind:value={data} />
  </label>
  {#if naoEDomingo}
    <p class="admin-error">⚠️ Essa data não é um domingo — os treinos costumam ser aos domingos, confira antes de abrir.</p>
  {/if}
  <button type="button" class="btn btn-primary" onclick={abrir} disabled={abrindo}>
    {abrindo ? "Abrindo..." : "Abrir treino"}
  </button>
  {#if erro}
    <p class="admin-error">{erro}</p>
  {/if}
</div>
