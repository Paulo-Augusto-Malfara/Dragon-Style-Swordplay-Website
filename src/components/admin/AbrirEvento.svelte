<script lang="ts">
  import { supabase } from "../../lib/supabase-browser";

  interface EventoRecente {
    id_evento: number;
    nome_evento: string;
    cidade: string;
    data_evento: string;
    numero_dia: number;
  }

  interface Props {
    eventosRecentes?: EventoRecente[];
  }
  const { eventosRecentes = [] }: Props = $props();

  // ponytail: monta a data a partir dos componentes locais (não toISOString(),
  // que converte pra UTC e pode pular um dia à noite no fuso do Brasil) --
  // mesma técnica já usada em AgendaEditor/AbrirTreino.
  function hojeLocal(): string {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, "0");
    const dia = String(hoje.getDate()).padStart(2, "0");
    return `${ano}-${mes}-${dia}`;
  }

  let nome = $state("");
  let cidade = $state("");
  let data = $state(hojeLocal());
  let numeroDia = $state(1);
  let tipoRegra = $state(9);
  let idEventoPai = $state<number | "">("");
  let abrindo = $state(false);
  let erro = $state("");

  function onEventoPaiChange() {
    if (idEventoPai === "") return;
    const pai = eventosRecentes.find((e) => e.id_evento === idEventoPai);
    if (pai) {
      nome = pai.nome_evento;
      cidade = pai.cidade;
      numeroDia = Math.min(10, (pai.numero_dia ?? 1) + 1);
      const dataPai = new Date(pai.data_evento + "T00:00:00");
      const proximoDia = new Date(dataPai.getFullYear(), dataPai.getMonth(), dataPai.getDate() + 1);
      data = `${proximoDia.getFullYear()}-${String(proximoDia.getMonth() + 1).padStart(2, "0")}-${String(proximoDia.getDate()).padStart(2, "0")}`;
    }
  }

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
      p_id_evento_pai: idEventoPai === "" ? null : idEventoPai,
      p_data: data,
      p_numero_dia: numeroDia,
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
  <p class="admin-form-titulo">Abrir evento</p>
  <p class="admin-form-nota">
    Evento é participação de staff fora do treino. Com ele aberto, dá pra lançar quem esteve lá e
    o PH sai quando for fechado.
  </p>

  {#if eventosRecentes.length > 0}
    <div class="campos">
      <label class="campo-largo">
        É outro dia de um evento que já aconteceu?
        <select bind:value={idEventoPai} onchange={onEventoPaiChange}>
          <option value="">Não, é um evento novo</option>
          {#each eventosRecentes as e}
            <option value={e.id_evento}>
              {e.nome_evento}, {e.cidade} ({new Date(e.data_evento + "T00:00:00").toLocaleDateString("pt-BR")})
            </option>
          {/each}
        </select>
        <small>Escolhendo um, o nome, a cidade, a data e o número do dia já vêm preenchidos.</small>
      </label>
    </div>
  {/if}

  <div class="campos">
    <label class="campo-largo">
      Nome do evento
      <input type="text" bind:value={nome} />
    </label>
    <label>
      Data
      <input type="date" bind:value={data} />
    </label>
    <label>
      Dia do evento
      <select bind:value={numeroDia}>
        {#each Array.from({ length: 10 }, (_, i) => i + 1) as n}
          <option value={n}>Dia {n}</option>
        {/each}
      </select>
    </label>
    <label>
      Cidade
      <input type="text" bind:value={cidade} />
    </label>
    <label class="campo-largo">
      Tipo de evento
      <select bind:value={tipoRegra}>
        <option value={9}>Staff em evento externo (4 PH base)</option>
        <option value={10}>Staff em evento do grupo (2 PH base)</option>
      </select>
    </label>
  </div>

  <div class="form-acoes">
    <button type="button" class="btn btn-primary" onclick={abrir} disabled={abrindo}>
      {abrindo ? "Abrindo..." : "Abrir evento"}
    </button>
  </div>

  {#if erro}
    <p class="admin-error" role="alert">{erro}</p>
  {/if}
</div>
