<script lang="ts">
  import { supabase } from "../../lib/supabase-browser";
  import LoginForm from "../auth/LoginForm.svelte";

  type Status = "checking" | "unauthenticated" | "loading" | "ready" | "no-member" | "error";
  let status = $state<Status>("checking");
  let errorMessage = $state("");

  let nome = $state("");
  let nivelGeral = $state(0);
  let nomeFaixa = $state<string | null>(null);
  let phTotal = $state(0);
  let porClasse = $state<any[]>([]);
  let historico = $state<any[]>([]);

  async function load() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      status = "unauthenticated";
      return;
    }

    status = "loading";

    const { data: membro } = await supabase
      .from("dMembros")
      .select("id_membro, nome")
      .eq("auth_user_id", session.user.id)
      .single();

    if (!membro) {
      status = "no-member";
      return;
    }

    nome = membro.nome;

    const [geral, classes, historia] = await Promise.all([
      supabase.from("v_ranking_nivel_geral").select("*").eq("id_membro", membro.id_membro).single(),
      supabase.from("v_ranking_por_classe").select("*").eq("id_membro", membro.id_membro),
      supabase.from("v_historico_presencas").select("*").order("data_treino", { ascending: false }),
    ]);

    if (geral.error) {
      status = "error";
      errorMessage = geral.error.message;
      return;
    }

    nivelGeral = geral.data?.nivel_geral ?? 0;
    nomeFaixa = geral.data?.nome_faixa ?? null;
    phTotal = geral.data?.ph_total ?? 0;
    // Básico (id_classe 11) always last, everything else by most-trained first.
    porClasse = (classes.data ?? []).sort((a, b) => {
      const aBasico = a.id_classe === 11;
      const bBasico = b.id_classe === 11;
      if (aBasico !== bBasico) return aBasico ? 1 : -1;
      return b.treinos_por_classe - a.treinos_por_classe;
    });
    historico = historia.data ?? [];
    status = "ready";
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.reload();
  }

  load();
</script>

<div class="dashboard-container">
  {#if status === "checking" || status === "loading"}
    <p class="dashboard-loading">Carregando...</p>
  {:else if status === "unauthenticated"}
    <LoginForm redirectPath="/dashboard" />
  {:else if status === "no-member"}
    <p class="admin-error">
      Seu email ainda não está vinculado a um cadastro de membro. Fale com um organizador.
    </p>
  {:else if status === "error"}
    <p class="admin-error">{errorMessage}</p>
  {:else}
    <div class="dashboard-profile">
      <div class="dashboard-profile-header">
        <p class="dashboard-name">{nome}</p>
        <button class="btn btn-sm" onclick={logout}>sair</button>
      </div>
      <div class="dashboard-stats">
        <div class="dashboard-stat">
          <span class="label">Nível Geral</span>
          <span class="value">{nivelGeral}</span>
        </div>
        {#if nomeFaixa}
          <div class="dashboard-stat">
            <span class="label">Faixa</span>
            <span class="value">{nomeFaixa}</span>
          </div>
        {/if}
        <div class="dashboard-stat">
          <span class="label">Pontos de Honra</span>
          <span class="value">{phTotal}</span>
        </div>
      </div>
    </div>

    <h2>Níveis por Classe</h2>
    {#if porClasse.length === 0}
      <p class="dashboard-empty">Nenhum treino registrado ainda.</p>
    {:else}
      <div class="graduacao-tabela">
        <table>
          <thead>
            <tr>
              <th>Classe</th>
              <th>Nível</th>
              <th>Treinos</th>
            </tr>
          </thead>
          <tbody>
            {#each porClasse as c}
              <tr>
                <td>{c.nome_classe}</td>
                <td>{c.nivel_por_classe}</td>
                <td>{c.treinos_por_classe}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}

    <h2>Histórico de Presença</h2>
    {#if historico.length === 0}
      <p class="dashboard-empty">Nenhuma presença registrada ainda.</p>
    {:else}
      <div class="graduacao-tabela">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Classe</th>
              <th>PH Ganho</th>
            </tr>
          </thead>
          <tbody>
            {#each historico as h}
              <tr>
                <td>{new Date(h.data_treino).toLocaleDateString("pt-BR")}</td>
                <td>{h.nome_classe}</td>
                <td>{h.ph_ganho_treino}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {/if}
</div>
