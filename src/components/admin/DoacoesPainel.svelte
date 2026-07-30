<script lang="ts">
  import { supabase } from "../../lib/supabase-browser";
  import MembroPicker from "./MembroPicker.svelte";

  let membroSelecionado = $state<{ id_membro: number; nome: string } | null>(null);
  let valor = $state("");
  let salvando = $state(false);
  let erro = $state("");

  let doacoes = $state<any[]>([]);
  let loading = $state(true);

  async function carregar() {
    loading = true;
    const { data: linhas } = await supabase
      .from("fDoacoes")
      .select("id_doacao, id_membro, valor, data_doacao")
      .order("data_doacao", { ascending: false })
      .limit(30);
    const rows = linhas ?? [];
    const ids = [...new Set(rows.map((d) => d.id_membro))];
    let nomes = new Map<number, string>();
    if (ids.length > 0) {
      const { data: membros } = await supabase.from("dMembros").select("id_membro, nome").in("id_membro", ids);
      nomes = new Map((membros ?? []).map((m) => [m.id_membro, m.nome]));
    }
    doacoes = rows.map((d) => ({ ...d, nome: nomes.get(d.id_membro) ?? `#${d.id_membro}` }));
    loading = false;
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
    <p><strong>Membro:</strong> {membroSelecionado.nome} <button type="button" class="btn btn-sm" onclick={() => (membroSelecionado = null)}>trocar</button></p>
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
  <ul class="admin-list">
    {#each doacoes as d}
      <li>
        <span>
          {d.nome} — R$ {Number(d.valor).toFixed(2)}
          <small>({new Date(d.data_doacao).toLocaleDateString("pt-BR")})</small>
        </span>
      </li>
    {/each}
  </ul>
{/if}
