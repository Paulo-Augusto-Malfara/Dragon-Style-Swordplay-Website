<script lang="ts">
  import { supabase } from "../../lib/supabase-browser";
  import ConfirmarAcao from "./ConfirmarAcao.svelte";

  let itens = $state<any[]>([]);
  let loading = $state(true);
  let erro = $state("");
  let confirmar: ConfirmarAcao;

  // Hoje no fuso do Brasil. Comparar com uma data em UTC jogaria o treino de
  // hoje pra lista dos passados a partir das 21h.
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

  async function load() {
    loading = true;
    const { data, error } = await supabase
      .from("fAgendaTreinos")
      .select(
        "id_agenda, data_treino, horario_inicio, horario_termino, cidade, local, status, id_treino, fTreinos(status)"
      )
      .order("data_treino");
    erro = error?.message ?? "";
    itens = data ?? [];
    loading = false;
  }

  // A lista vinha inteira em ordem crescente, então o topo da tela era sempre
  // o treino mais antigo já cadastrado, e o próximo treino (a única coisa que
  // se vem conferir aqui) ficava no fim. Agora o que vem primeiro é o que vem.
  const proximos = $derived(itens.filter((i) => i.data_treino >= hoje));
  const passados = $derived(itens.filter((i) => i.data_treino < hoje).reverse());

  async function remove(item: any) {
    const ok = await confirmar.pedir({
      titulo: `Excluir o treino de ${dataBR(item.data_treino)}?`,
      texto: "Ele some da agenda pública. Se o treino só foi desmarcado, prefira editar e trocar o status para Cancelado, que avisa quem já viu a data.",
      acao: "Excluir",
      perigo: true,
    });
    if (!ok) return;
    const { error } = await supabase.from("fAgendaTreinos").delete().eq("id_agenda", item.id_agenda);
    if (error) {
      erro = error.message;
      return;
    }
    await load();
  }

  const dataBR = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("pt-BR", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
    });

  const hora = (h: string | null) => (h ? h.slice(0, 5) : "");

  /* A agenda não guarda "realizado", e nem deve: quem sabe se o treino
   * aconteceu é o vínculo com fTreinos, preenchido pela abrir_treino. Um status
   * a mais seria uma segunda fonte pra mesma verdade, livre pra divergir, e o
   * editor de agenda ainda sobrescreveria o valor ao salvar.
   *
   * Mas o vínculo sozinho não basta: ele nasce quando o treino ABRE e nunca é
   * desfeito, então a agenda dizia "realizado" desde o momento em que alguém
   * abria o treino, e continuava dizendo depois de reabrir um treino fechado.
   * Quem responde é o status do treino do outro lado do vínculo. */
  const rotulo = (i: any) =>
    i.status !== "agendado"
      ? "cancelado"
      : i.fTreinos?.status === "finalizado"
        ? "realizado"
        : i.id_treino != null
          ? "andamento"
          : "agendado";

  const ROTULOS: Record<string, string> = {
    agendado: "Agendado",
    cancelado: "Cancelado",
    andamento: "Em andamento",
    realizado: "Realizado",
  };

  load();
</script>

<ConfirmarAcao bind:this={confirmar} />

<div class="admin-secao-cab">
  <h2>Próximos treinos {#if !loading}<span class="contagem">{proximos.length}</span>{/if}</h2>
  <a href="/admin/agenda/new" class="btn btn-primary btn-sm">+ Marcar treino</a>
</div>

{#if erro}
  <p class="admin-error">{erro}</p>
{/if}

{#if loading}
  <div class="esqueleto-lista">
    {#each { length: 3 } as _}
      <div class="esqueleto esqueleto-linha"></div>
    {/each}
  </div>
{:else}
  {#if proximos.length === 0}
    <p class="vazio">
      Nenhum treino marcado daqui pra frente. Como o grupo não tem dia fixo, sem data aqui a
      página pública não tem o que mostrar.
    </p>
  {:else}
    <ul class="admin-list">
      {#each proximos as item}
        <li>
          <span class="agenda-data">
            <strong>{dataBR(item.data_treino).replace(".", "")}</strong>
            <span>{hora(item.horario_inicio)}{item.horario_termino ? ` às ${hora(item.horario_termino)}` : ""}</span>
          </span>
          <div class="row-corpo">
            <span class="row-titulo">{item.local}</span>
            <span class="row-meta">
              <span>{item.cidade}</span>
              <span class="status-badge status-badge--{rotulo(item)}">
                {ROTULOS[rotulo(item)]}
              </span>
            </span>
          </div>
          <div class="row-acoes">
            <a href={`/admin/agenda/${item.id_agenda}`} class="btn btn-sm btn-ghost">Editar</a>
            <button class="btn btn-sm btn-danger" onclick={() => remove(item)}>Excluir</button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}

  {#if passados.length > 0}
    <details class="agenda-passados">
      <summary>Treinos que já passaram ({passados.length})</summary>
      <ul class="admin-list">
        {#each passados as item}
          <li>
            <span class="agenda-data">
              <strong>{dataBR(item.data_treino).replace(".", "")}</strong>
              <span>{hora(item.horario_inicio)}</span>
            </span>
            <div class="row-corpo">
              <span class="row-titulo">{item.local}</span>
              <span class="row-meta">
                <span>{item.cidade}</span>
                {#if rotulo(item) !== "agendado"}
                  <span class="status-badge status-badge--{rotulo(item)}">
                    {ROTULOS[rotulo(item)]}
                  </span>
                {/if}
              </span>
            </div>
            <div class="row-acoes">
              <a href={`/admin/agenda/${item.id_agenda}`} class="btn btn-sm btn-ghost">Editar</a>
              <button class="btn btn-sm btn-danger" onclick={() => remove(item)}>Excluir</button>
            </div>
          </li>
        {/each}
      </ul>
    </details>
  {/if}
{/if}
