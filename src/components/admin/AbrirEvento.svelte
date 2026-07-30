<script lang="ts">
  import { supabase } from "../../lib/supabase-browser";

  let nome = $state("");
  let cidade = $state("");
  let tipoRegra = $state(9);
  let abrindo = $state(false);
  let erro = $state("");

  async function abrir() {
    if (!nome.trim() || !cidade.trim()) {
      erro = "Preencha nome e cidade do evento.";
      return;
    }
    abrindo = true;
    erro = "";
    const { data: idEvento, error } = await supabase.rpc("abrir_evento", {
      p_nome: nome.trim(),
      p_cidade: cidade.trim(),
      p_tipo_regra: tipoRegra,
    });
    abrindo = false;
    if (error) {
      erro = error.message;
      return;
    }
    window.location.href = `/admin/eventos/${idEvento}`;
  }
</script>

<div class="admin-form">
  <label>
    Nome do evento
    <input type="text" bind:value={nome} />
  </label>
  <label>
    Cidade
    <input type="text" bind:value={cidade} />
  </label>
  <label>
    Tipo de evento
    <select bind:value={tipoRegra}>
      <option value={9}>Staff Evento Externo (4 PH base)</option>
      <option value={10}>Staff Evento do Grupo (2 PH base)</option>
    </select>
  </label>
  <button type="button" class="btn btn-primary" onclick={abrir} disabled={abrindo}>
    {abrindo ? "Abrindo..." : "Abrir evento"}
  </button>
  {#if erro}
    <p class="admin-error">{erro}</p>
  {/if}
</div>
