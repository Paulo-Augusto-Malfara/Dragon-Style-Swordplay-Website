<script lang="ts">
  import { supabase } from "../../lib/supabase-browser";

  interface Props {
    id: string;
    meuIdMembro: number;
  }
  const { id, meuIdMembro }: Props = $props();
  const isNew = id === "new";

  // ponytail: <input type="date"> é um widget nativo do navegador -- não dá
  // pra estilizar dias específicos (ex: destacar domingo) nele. Como os
  // treinos são sempre aos domingos, pré-selecionamos o próximo domingo em
  // vez de tentar "pintar" um controle que o navegador não expõe pra CSS/JS.
  function proximoDomingo(): string {
    const hoje = new Date();
    const diasAteDomingo = (7 - hoje.getDay()) % 7 || 7;
    hoje.setDate(hoje.getDate() + diasAteDomingo);
    // ponytail: toISOString() converte pra UTC e pode pular um dia (ex: à
    // noite no Brasil, UTC já é o dia seguinte) -- monta a string a partir
    // dos componentes locais em vez disso.
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, "0");
    const dia = String(hoje.getDate()).padStart(2, "0");
    return `${ano}-${mes}-${dia}`;
  }

  let dataTreino = $state(isNew ? proximoDomingo() : "");
  let horarioInicio = $state("15:00");
  let horarioTermino = $state("18:00");
  let cidade = $state("São José do Rio Preto");
  let local = $state("Praça do Vivendas");
  let endereco = $state(
    "R. Cap. Justino Moreira do Espírito Santo, 310-270 - Jardim Vivendas, São José do Rio Preto - SP, 15090-400"
  );
  let linkMaps = $state("https://maps.app.goo.gl/RYGZuBdCKouHrnBT8");
  let status = $state<"agendado" | "cancelado">("agendado");
  let statusReq = $state<"idle" | "loading" | "saving" | "saved" | "error">(isNew ? "idle" : "loading");
  let errorMessage = $state("");

  async function load() {
    const { data, error } = await supabase.from("fAgendaTreinos").select("*").eq("id_agenda", id).single();
    if (error) {
      statusReq = "error";
      errorMessage = error.message;
      return;
    }
    dataTreino = data.data_treino;
    horarioInicio = data.horario_inicio;
    horarioTermino = data.horario_termino ?? "";
    cidade = data.cidade;
    local = data.local;
    endereco = data.endereco ?? "";
    linkMaps = data.link_maps ?? "";
    status = data.status;
    statusReq = "idle";
  }

  async function save(e: SubmitEvent) {
    e.preventDefault();
    statusReq = "saving";
    const payload = {
      data_treino: dataTreino,
      horario_inicio: horarioInicio,
      horario_termino: horarioTermino || null,
      cidade,
      local,
      endereco: endereco || null,
      link_maps: linkMaps || null,
      status,
    };
    const { error } = isNew
      ? await supabase.from("fAgendaTreinos").insert({ ...payload, criado_por: meuIdMembro })
      : await supabase.from("fAgendaTreinos").update(payload).eq("id_agenda", id);
    if (error) {
      statusReq = "error";
      errorMessage = error.message;
      return;
    }
    statusReq = "saved";
    window.location.href = "/admin/agenda";
  }

  const naoEDomingo = $derived(dataTreino !== "" && new Date(dataTreino + "T00:00:00").getDay() !== 0);

  if (!isNew) load();
</script>

{#if statusReq === "loading"}
  <p>Carregando...</p>
{:else}
  <form class="admin-form" onsubmit={save}>
    <label>
      Data
      <input type="date" bind:value={dataTreino} required />
    </label>
    {#if naoEDomingo}
      <p class="admin-error">⚠️ Essa data não é um domingo. Os treinos costumam ser aos domingos, confira antes de salvar.</p>
    {/if}
    <label>
      Horário de início
      <input type="time" bind:value={horarioInicio} required />
    </label>
    <label>
      Horário de término (opcional)
      <input type="time" bind:value={horarioTermino} />
    </label>
    <label>
      Cidade
      <input type="text" bind:value={cidade} required />
    </label>
    <label>
      Local
      <input type="text" bind:value={local} required />
    </label>
    <label>
      Endereço (opcional)
      <input type="text" bind:value={endereco} />
    </label>
    <label>
      Link do Google Maps (opcional)
      <input type="url" bind:value={linkMaps} placeholder="https://maps.app.goo.gl/..." />
    </label>
    <label>
      Status
      <select bind:value={status}>
        <option value="agendado">Agendado</option>
        <option value="cancelado">Cancelado</option>
      </select>
    </label>
    <button type="submit" class="btn btn-primary" disabled={statusReq === "saving"}>
      {statusReq === "saving" ? "Salvando..." : "Salvar"}
    </button>
    {#if statusReq === "error"}
      <p class="admin-error">{errorMessage}</p>
    {/if}
  </form>
{/if}
