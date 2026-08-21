<script lang="ts">
  /*
   * Reuniões de staff, dentro da tela de Agenda.
   *
   * Fica junto do agendamento de treino porque é a mesma pergunta ("o que vem
   * marcado?"), mas é OUTRA tabela: fAgendaTreinos é lida pelo site público
   * (`public_select using (true)`), e reunião de staff não pode aparecer lá.
   *
   * A data da reunião é o relógio do sistema de pautas inteiro: a votação de
   * prioridade fecha 24h antes dela. Mudar a data aqui mexe naquela janela.
   */
  import { supabase } from "../../lib/supabase-browser";
  import ConfirmarAcao from "./ConfirmarAcao.svelte";

  const ROTULOS: Record<string, string> = {
    agendada: "Agendada",
    realizada: "Realizada",
    cancelada: "Cancelada",
  };

  let itens = $state<any[]>([]);
  let loading = $state(true);
  let erro = $state("");
  let ocupado = $state(false);
  let confirmar: ConfirmarAcao;

  let criando = $state(false);
  let quando = $state("");
  let local = $state("");
  let linkCall = $state("");
  let editandoId = $state<number | null>(null);

  const agora = new Date().toISOString();
  const proximas = $derived(itens.filter((r) => r.status === "agendada" && r.data_hora >= agora));
  const passadas = $derived(itens.filter((r) => !(r.status === "agendada" && r.data_hora >= agora)));

  async function load() {
    loading = true;
    const { data, error } = await supabase
      .from("fReunioes")
      .select("id_reuniao, data_hora, local, link_call, status, ata")
      .order("data_hora", { ascending: false });
    erro = error?.message ?? "";
    itens = data ?? [];
    loading = false;
  }

  load();

  /* Um lugar só pra zerar o formulário: abrir "+ Marcar" depois de ter editado
     uma reunião trazia os campos da outra preenchidos. */
  function limpar() {
    editandoId = null;
    quando = "";
    local = "";
    linkCall = "";
  }

  async function chamar(fn: string, args: Record<string, unknown>) {
    ocupado = true;
    erro = "";
    const { error } = await supabase.rpc(fn, args);
    ocupado = false;
    if (error) {
      erro = error.message;
      return false;
    }
    await load();
    return true;
  }

  async function salvar(e: SubmitEvent) {
    e.preventDefault();
    if (!quando || ocupado) return;
    // datetime-local devolve hora local sem fuso; o Date do navegador resolve
    // pro fuso de quem está marcando, que é o de São Paulo na prática.
    const iso = new Date(quando).toISOString();
    const ok = editandoId
      ? await chamar("editar_reuniao", {
          p_id_reuniao: editandoId,
          p_data_hora: iso,
          p_local: local,
          p_link_call: linkCall,
        })
      : await chamar("agendar_reuniao", { p_data_hora: iso, p_local: local, p_link_call: linkCall });
    if (ok) {
      criando = false;
      limpar();
    }
  }

  function editar(r: any) {
    editandoId = r.id_reuniao;
    // O input quer "YYYY-MM-DDTHH:mm" no fuso local, não o ISO em UTC.
    const d = new Date(r.data_hora);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    quando = d.toISOString().slice(0, 16);
    local = r.local ?? "";
    linkCall = r.link_call ?? "";
    criando = true;
  }

  async function encerrar(r: any) {
    const ok = await confirmar.pedir({
      titulo: `Encerrar a reunião de ${dataBR(r.data_hora)}?`,
      texto:
        "Pauta que ficou sem decisão volta pra fila com os votos zerados, e disputa de novo na próxima reunião.",
      acao: "Encerrar",
    });
    if (!ok) return;
    await chamar("encerrar_reuniao", { p_id_reuniao: r.id_reuniao, p_ata: null });
  }

  async function cancelar(r: any) {
    const ok = await confirmar.pedir({
      titulo: `Cancelar a reunião de ${dataBR(r.data_hora)}?`,
      texto: "As pautas voltam pra fila com os votos zerados, esperando a próxima data.",
      acao: "Cancelar reunião",
      perigo: true,
    });
    if (!ok) return;
    await chamar("cancelar_reuniao", { p_id_reuniao: r.id_reuniao });
  }

  const dataBR = (d: string) =>
    new Date(d).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });

  const horaBR = (d: string) =>
    new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
</script>

<ConfirmarAcao bind:this={confirmar} />

<div class="admin-secao-cab">
  <h2>Reuniões de staff {#if !loading}<span class="contagem">{proximas.length}</span>{/if}</h2>
  {#if !criando}
    <button
      type="button"
      class="btn btn-primary btn-sm"
      onclick={() => {
        limpar();
        criando = true;
      }}>+ Marcar reunião</button
    >
  {/if}
</div>

<p class="nota">
  Não aparece na agenda pública. A votação das pautas fecha 24h antes da data
  marcada aqui.
</p>

{#if criando}
  <form class="admin-form" onsubmit={salvar}>
    <div class="campos">
      <label>
        Data e hora
        <input type="datetime-local" bind:value={quando} required />
      </label>
      <label>
        Onde (opcional)
        <input type="text" bind:value={local} placeholder="Chamada de vídeo, casa do fulano..." />
      </label>
      <label>
        Link da call (opcional)
        <input type="url" bind:value={linkCall} placeholder="https://meet.google.com/..." />
      </label>
    </div>
    <div class="form-acoes">
      <button type="submit" class="btn btn-primary" disabled={ocupado || !quando}>
        {editandoId ? "Salvar" : "Marcar"}
      </button>
      <button
        type="button"
        class="btn btn-ghost"
        onclick={() => {
          criando = false;
          limpar();
        }}>Cancelar</button
      >
    </div>
  </form>
{/if}

{#if erro}
  <p class="admin-error" role="alert">{erro}</p>
{/if}

{#if loading}
  <div class="esqueleto-lista">
    {#each { length: 2 } as _, i (i)}
      <div class="esqueleto esqueleto-linha"></div>
    {/each}
  </div>
{:else}
  {#if proximas.length === 0}
    <p class="vazio">
      Nenhuma reunião marcada. Sem data, a votação das pautas não abre e o mural
      fica só acumulando.
    </p>
  {:else}
    <ul class="admin-list">
      {#each proximas as r (r.id_reuniao)}
        <li>
          <span class="agenda-data">
            <strong>{dataBR(r.data_hora).replace(".", "")}</strong>
            <span>{horaBR(r.data_hora)}</span>
          </span>
          <div class="row-corpo">
            <span class="row-titulo">{r.local ?? "Sem local definido"}</span>
            <span class="row-meta">
              <span class="status-badge status-badge--{r.status}">{ROTULOS[r.status]}</span>
              {#if r.link_call}
                <a class="link-call" href={r.link_call} target="_blank" rel="noopener noreferrer">Entrar na call</a>
              {/if}
            </span>
          </div>
          <div class="row-acoes">
            <button type="button" class="btn btn-sm btn-ghost" onclick={() => editar(r)}>Editar</button>
            <button type="button" class="btn btn-sm" disabled={ocupado} onclick={() => encerrar(r)}>
              Encerrar
            </button>
            <button type="button" class="btn btn-sm btn-danger" disabled={ocupado} onclick={() => cancelar(r)}>
              Cancelar
            </button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}

  {#if passadas.length > 0}
    <details class="agenda-passados">
      <summary>Reuniões que já passaram ({passadas.length})</summary>
      <ul class="admin-list">
        {#each passadas as r (r.id_reuniao)}
          <li>
            <span class="agenda-data">
              <strong>{dataBR(r.data_hora).replace(".", "")}</strong>
              <span>{horaBR(r.data_hora)}</span>
            </span>
            <div class="row-corpo">
              <span class="row-titulo">{r.local ?? "Sem local definido"}</span>
              <span class="row-meta">
                <span class="status-badge status-badge--{r.status}">{ROTULOS[r.status]}</span>
              </span>
            </div>
          </li>
        {/each}
      </ul>
    </details>
  {/if}
{/if}

<style>
  /* Ver a mesma nota em PautasMural: o `p { width: 90%; margin: auto }` do
     global.css é pra texto corrido de página, e aqui ele centralizava a nota
     no meio da lista. */
  p {
    width: 100%;
    margin: 0;
  }

  .nota {
    font-size: 0.8rem;
    color: var(--ds-text-4);
  }

  .link-call {
    font-size: 0.78rem;
    color: var(--ds-gold);
    text-decoration: underline;
  }
</style>
