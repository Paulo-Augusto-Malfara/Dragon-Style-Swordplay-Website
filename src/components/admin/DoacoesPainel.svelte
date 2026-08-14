<script lang="ts">
  import { supabase } from "../../lib/supabase-browser";
  import MembroPicker from "./MembroPicker.svelte";
  import ConfirmarAcao from "./ConfirmarAcao.svelte";

  interface Props {
    podeEditar: boolean;
  }
  const { podeEditar }: Props = $props();

  const LIMITE = 30;

  let membroSelecionado = $state<{ id_membro: number; nome: string } | null>(null);
  let valor = $state("");
  let salvando = $state(false);
  let erro = $state("");

  let doacoes = $state<any[]>([]);
  let totalGeral = $state(0);
  let quantasDoacoes = $state(0);
  let loading = $state(true);
  let confirmar: ConfirmarAcao;

  let editandoId = $state<number | null>(null);
  let editValor = $state("");
  let editData = $state("");

  const real = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

  async function carregar() {
    loading = true;
    const [{ data: linhas }, { data: todas }] = await Promise.all([
      supabase
        .from("fDoacoes")
        .select("id_doacao, id_membro, valor, data_doacao")
        .order("data_doacao", { ascending: false })
        .limit(LIMITE),
      // A soma do grupo inteiro é o número que se vem conferir aqui, e ela
      // não sai das 30 últimas linhas.
      supabase.from("fDoacoes").select("id_membro, valor"),
    ]);

    const rows = linhas ?? [];
    const todasDoacoes = todas ?? [];
    totalGeral = todasDoacoes.reduce((s, d) => s + Number(d.valor), 0);
    quantasDoacoes = todasDoacoes.length;

    const totalPorMembro = new Map<number, number>();
    for (const d of todasDoacoes) {
      totalPorMembro.set(d.id_membro, (totalPorMembro.get(d.id_membro) ?? 0) + Number(d.valor));
    }

    const ids = [...new Set(rows.map((d) => d.id_membro))];
    let membrosPorId = new Map<number, { nome: string; foto_url: string | null }>();
    if (ids.length > 0) {
      const { data: membros } = await supabase
        .from("dMembros")
        .select("id_membro, nome, foto_url")
        .in("id_membro", ids);
      membrosPorId = new Map((membros ?? []).map((m) => [m.id_membro, m]));
    }

    doacoes = rows.map((d) => ({
      ...d,
      nome: membrosPorId.get(d.id_membro)?.nome ?? `#${d.id_membro}`,
      foto_url: membrosPorId.get(d.id_membro)?.foto_url ?? null,
      total: totalPorMembro.get(d.id_membro) ?? Number(d.valor),
    }));
    loading = false;
  }

  function editar(d: any) {
    editandoId = d.id_doacao;
    editValor = String(d.valor).replace(".", ",");
    editData = d.data_doacao;
  }

  async function salvarEdicao(id: number) {
    const valorNumero = Number(editValor.replace(",", "."));
    if (!valorNumero || valorNumero <= 0 || !editData) {
      erro = "Informe uma data e um valor maior que zero.";
      return;
    }
    const { error } = await supabase.rpc("editar_doacao", {
      p_id_doacao: id,
      p_valor: valorNumero,
      p_data_doacao: editData,
    });
    if (error) {
      erro = error.message;
      return;
    }
    erro = "";
    editandoId = null;
    await carregar();
  }

  async function excluir(d: any) {
    const ok = await confirmar.pedir({
      titulo: `Excluir a doação de ${real(Number(d.valor))}?`,
      texto: `Lançada em nome de ${d.nome}. O valor sai do total do grupo e do mural público.`,
      acao: "Excluir",
      perigo: true,
    });
    if (!ok) return;
    const { error } = await supabase.rpc("excluir_doacao", { p_id_doacao: d.id_doacao });
    if (error) {
      erro = error.message;
      return;
    }
    await carregar();
  }

  async function registrar() {
    const valorNumero = Number(valor.replace(",", "."));
    if (!membroSelecionado || !valorNumero || valorNumero <= 0) {
      erro = "Escolha o membro e informe um valor válido.";
      return;
    }
    salvando = true;
    erro = "";
    const { error } = await supabase.rpc("registrar_doacao", {
      p_id_membro: membroSelecionado.id_membro,
      p_valor: valorNumero,
    });
    salvando = false;
    if (error) {
      erro = error.message;
      return;
    }
    membroSelecionado = null;
    valor = "";
    await carregar();
  }

  const dataCurta = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });

  carregar();
</script>

<ConfirmarAcao bind:this={confirmar} />

<ul class="admin-stats">
  <li class="admin-stat">
    <span class="admin-stat-valor">{loading ? "..." : real(totalGeral)}</span>
    <span class="admin-stat-rotulo">Total arrecadado</span>
  </li>
  <li class="admin-stat">
    <span class="admin-stat-valor">{loading ? "..." : quantasDoacoes}</span>
    <span class="admin-stat-rotulo">Doações lançadas</span>
  </li>
</ul>

{#if podeEditar}
  <div class="admin-form">
    <p class="admin-form-titulo">Registrar doação</p>
    <p class="admin-form-nota">A data é a de hoje. Para lançar em outro dia, registre e depois edite.</p>

    {#if membroSelecionado}
      <div class="membro-escolhido">
        <div class="row-corpo">
          <span class="row-titulo">{membroSelecionado.nome}</span>
        </div>
        <div class="row-acoes">
          <button type="button" class="btn btn-sm btn-ghost" onclick={() => (membroSelecionado = null)}>
            Trocar
          </button>
        </div>
      </div>
    {:else}
      <MembroPicker placeholder="Buscar quem doou..." onSelect={(m) => (membroSelecionado = m)} />
    {/if}

    <div class="campos">
      <label>
        Valor
        <input type="text" inputmode="decimal" bind:value={valor} placeholder="0,00" />
        <small>Em reais, com vírgula.</small>
      </label>
    </div>

    <div class="form-acoes">
      <button type="button" class="btn btn-primary" onclick={registrar} disabled={salvando}>
        {salvando ? "Registrando..." : "Registrar doação"}
      </button>
    </div>

    {#if erro}
      <p class="admin-error" role="alert">{erro}</p>
    {/if}
  </div>
{:else if erro}
  <p class="admin-error" role="alert">{erro}</p>
{/if}

<div class="admin-secao-cab">
  <h2>Últimas doações {#if !loading}<span class="contagem">{doacoes.length}</span>{/if}</h2>
</div>

{#if loading}
  <div class="esqueleto-lista">
    {#each { length: 4 } as _}
      <div class="esqueleto esqueleto-linha"></div>
    {/each}
  </div>
{:else if doacoes.length === 0}
  <p class="vazio">Nenhuma doação registrada ainda.</p>
{:else}
  <div class="table-scroll">
    <table class="ranking-tabela ranking-tabela--doacoes tabela-cartoes">
      <thead>
        <tr>
          <th class="col-nome">Membro</th>
          <th class="col-faixa">Data</th>
          <th class="col-stat">Valor</th>
          <th class="col-stat">Total doado</th>
          <th class="col-stat">Ações</th>
        </tr>
      </thead>
      <tbody>
        {#each doacoes as d}
          <tr>
            <td class="col-nome">
              <span class="row-avatar">
                {#if d.foto_url}
                  <img src={d.foto_url} alt="" loading="lazy" />
                {:else}
                  {d.nome.charAt(0).toUpperCase()}
                {/if}
              </span>
              <span class="row-name">{d.nome}</span>
            </td>
            {#if podeEditar && editandoId === d.id_doacao}
              <td class="col-faixa" data-label="Data">
                <input type="date" bind:value={editData} />
              </td>
              <td class="col-stat" data-label="Valor">
                <input type="text" inputmode="decimal" bind:value={editValor} class="edit-valor" />
              </td>
              <td class="col-stat" data-label="Total doado">
                <span class="stat-pill">{real(d.total)}</span>
              </td>
              <td class="col-stat col-acoes">
                <button type="button" class="btn btn-sm btn-primary" onclick={() => salvarEdicao(d.id_doacao)}>
                  Salvar
                </button>
                <button type="button" class="btn btn-sm btn-ghost" onclick={() => (editandoId = null)}>
                  Cancelar
                </button>
              </td>
            {:else}
              <td class="col-faixa" data-label="Data">{dataCurta(d.data_doacao)}</td>
              <td class="col-stat" data-label="Valor">
                <span class="stat-pill">{real(Number(d.valor))}</span>
              </td>
              <td class="col-stat" data-label="Total doado">
                <span class="total-membro">{real(d.total)}</span>
              </td>
              <td class="col-stat col-acoes">
                {#if podeEditar}
                  <button type="button" class="btn btn-sm btn-ghost" onclick={() => editar(d)}>Editar</button>
                  <button type="button" class="btn btn-sm btn-danger" onclick={() => excluir(d)}>Excluir</button>
                {/if}
              </td>
            {/if}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<style>
  /* O valor da doação é o dado da linha, e o total do membro é contexto. Os
     dois eram pílula dourada e disputavam o olho; agora só o valor é. */
  .total-membro {
    font-size: 0.85rem;
    color: var(--ds-text-4);
  }

  .edit-valor {
    width: 100%;
    max-width: 7em;
    min-height: 2.2em;
    padding: 0.3em 0.5em;
    border: 1px solid var(--ds-gold-dim);
    border-radius: 8px;
    background: var(--ds-bg-alt);
    color: var(--ds-text-1);
    font-family: var(--ds-font-body);
    font-size: 0.9rem;
  }

  td input[type="date"] {
    min-height: 2.2em;
    padding: 0.3em 0.5em;
    border: 1px solid var(--ds-gold-dim);
    border-radius: 8px;
    background: var(--ds-bg-alt);
    color: var(--ds-text-1);
    font-family: var(--ds-font-body);
    font-size: 0.85rem;
    color-scheme: dark;
  }
</style>
