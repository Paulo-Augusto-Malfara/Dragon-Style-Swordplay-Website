<script lang="ts">
  import { supabase } from "../../lib/supabase-browser";
  import MembroPicker from "./MembroPicker.svelte";

  interface Props {
    podeEditar: boolean;
  }
  const { podeEditar }: Props = $props();

  let membroSelecionado = $state<{ id_membro: number; nome: string } | null>(null);
  let valor = $state("");
  let salvando = $state(false);
  let erro = $state("");

  let doacoes = $state<any[]>([]);
  let loading = $state(true);

  let editandoId = $state<number | null>(null);
  let editValor = $state("");
  let editData = $state("");

  async function carregar() {
    loading = true;
    const { data: linhas } = await supabase
      .from("fDoacoes")
      .select("id_doacao, id_membro, valor, data_doacao")
      .order("data_doacao", { ascending: false })
      .limit(30);
    const rows = linhas ?? [];
    const ids = [...new Set(rows.map((d) => d.id_membro))];
    let membrosPorId = new Map<number, { nome: string; foto_url: string | null }>();
    let totalPorMembro = new Map<number, number>();
    if (ids.length > 0) {
      const [{ data: membros }, { data: todasDoacoes }] = await Promise.all([
        supabase.from("dMembros").select("id_membro, nome, foto_url").in("id_membro", ids),
        supabase.from("fDoacoes").select("id_membro, valor").in("id_membro", ids),
      ]);
      membrosPorId = new Map((membros ?? []).map((m) => [m.id_membro, m]));
      for (const d of todasDoacoes ?? []) {
        totalPorMembro.set(d.id_membro, (totalPorMembro.get(d.id_membro) ?? 0) + Number(d.valor));
      }
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
    if (!valorNumero || valorNumero <= 0 || !editData) return;
    const { error } = await supabase.rpc("editar_doacao", {
      p_id_doacao: id,
      p_valor: valorNumero,
      p_data_doacao: editData,
    });
    if (error) {
      erro = error.message;
      return;
    }
    editandoId = null;
    await carregar();
  }

  async function excluir(d: any) {
    if (!confirm(`Excluir a doação de R$ ${Number(d.valor).toFixed(2)} de ${d.nome}?`)) return;
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

  carregar();
</script>

<div class="admin-form">
  <p class="gold-title">Registrar doação</p>
  {#if membroSelecionado}
    <div style="display:flex; align-items:center; justify-content:space-between; gap:0.8em;">
      <span><strong>Membro:</strong> {membroSelecionado.nome}</span>
      <button type="button" class="btn btn-sm" onclick={() => (membroSelecionado = null)}>trocar</button>
    </div>
  {:else}
    <MembroPicker placeholder="Buscar membro..." onSelect={(m) => (membroSelecionado = m)} />
  {/if}
  <label>
    Valor (R$)
    <input type="text" inputmode="decimal" bind:value={valor} placeholder="0,00" />
  </label>
  <button type="button" class="btn btn-primary" onclick={registrar} disabled={salvando}>
    {salvando ? "Registrando..." : "Registrar doação"}
  </button>
  {#if erro}
    <p class="admin-error">{erro}</p>
  {/if}
</div>

<h2>Doações registradas</h2>
{#if loading}
  <p>Carregando...</p>
{:else if doacoes.length === 0}
  <p class="dashboard-empty">Nenhuma doação registrada ainda.</p>
{:else}
  <div class="table-scroll">
    <table class="ranking-tabela ranking-tabela--doacoes">
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
                  <img src={d.foto_url} alt="" />
                {:else}
                  {d.nome.charAt(0).toUpperCase()}
                {/if}
              </span>
              <span class="row-name">{d.nome}</span>
            </td>
            {#if podeEditar && editandoId === d.id_doacao}
              <td class="col-faixa"><input type="date" bind:value={editData} /></td>
              <td class="col-stat"><input type="text" inputmode="decimal" bind:value={editValor} style="width:5em;" /></td>
              <td class="col-stat"><span class="stat-pill">R$ {d.total.toFixed(2)}</span></td>
              <td class="col-stat col-acoes">
                <button type="button" class="btn btn-sm btn-primary" onclick={() => salvarEdicao(d.id_doacao)}>salvar</button>
                <button type="button" class="btn btn-sm" onclick={() => (editandoId = null)}>cancelar</button>
              </td>
            {:else}
              <td class="col-faixa">
                {new Date(d.data_doacao + "T00:00:00").toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "2-digit",
                })}
              </td>
              <td class="col-stat"><span class="status-badge status-badge--agendado">R$ {Number(d.valor).toFixed(2)}</span></td>
              <td class="col-stat"><span class="stat-pill">R$ {d.total.toFixed(2)}</span></td>
              <td class="col-stat col-acoes">
                {#if podeEditar}
                  <button type="button" class="btn btn-sm" onclick={() => editar(d)}>editar</button>
                  <button type="button" class="btn btn-sm btn-danger" onclick={() => excluir(d)}>excluir</button>
                {/if}
              </td>
            {/if}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}
