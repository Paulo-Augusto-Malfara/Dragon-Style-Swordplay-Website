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

  const diaDaSemana = $derived(
    data === ""
      ? ""
      : new Date(data + "T00:00:00").toLocaleDateString("pt-BR", {
          weekday: "long",
          day: "2-digit",
          month: "long",
        })
  );

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
  <p class="admin-form-titulo">Abrir treino de hoje</p>
  <p class="admin-form-nota">
    Com o treino aberto, qualquer organizador registra presença pelo celular, e o PH só é
    distribuído quando ele for fechado.
  </p>

  <div class="campos">
    <label>
      Data do treino
      <input type="date" bind:value={data} />
      {#if diaDaSemana}<small>{diaDaSemana}</small>{/if}
    </label>
  </div>

  {#if naoEDomingo}
    <p class="admin-aviso">
      Essa data não é um domingo. Os treinos costumam ser aos domingos, confira antes de abrir.
    </p>
  {/if}

  <div class="form-acoes">
    <button type="button" class="btn btn-primary" onclick={abrir} disabled={abrindo}>
      {abrindo ? "Abrindo..." : "Abrir treino"}
    </button>
  </div>

  {#if erro}
    <p class="admin-error" role="alert">{erro}</p>
  {/if}
</div>
