<script lang="ts">
  import { supabase } from "../../lib/supabase-browser";

  let data = $state(new Date().toISOString().slice(0, 10));
  let abrindo = $state(false);
  let erro = $state("");

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
  <label>
    Data do treino
    <input type="date" bind:value={data} />
  </label>
  <button type="button" class="btn btn-primary" onclick={abrir} disabled={abrindo}>
    {abrindo ? "Abrindo..." : "Abrir treino"}
  </button>
  {#if erro}
    <p class="admin-error">{erro}</p>
  {/if}
</div>
