<script lang="ts">
  import { onMount } from "svelte";
  import LoginForm from "../auth/LoginForm.svelte";
  import AvatarUploader from "./AvatarUploader.svelte";

  // ponytail: dynamic import, not a top-level one -- this component is used
  // inside dashboard.astro, a fully static page. A static import evaluates
  // createBrowserClient() during Astro's SSR pass at build time, which
  // crashed the whole build when the Supabase env vars weren't set then.
  let supabasePromise: Promise<any> | undefined;
  function getSupabase() {
    supabasePromise ??= import("../../lib/supabase-browser").then((m) => m.supabase);
    return supabasePromise;
  }

  type Status = "checking" | "unauthenticated" | "loading" | "ready" | "no-member" | "error";
  let status = $state<Status>("checking");
  let errorMessage = $state("");

  let nomeOficial = $state("");
  let fotoUrl = $state<string | null>(null);
  let apelido = $state<string | null>(null);
  let editingApelido = $state(false);
  let apelidoInput = $state("");
  let savingApelido = $state(false);
  let apelidoError = $state("");

  let ehStaffOuMais = $state(false);

  let nivelGeral = $state(0);
  let nomeFaixa = $state<string | null>(null);
  let phTotal = $state(0);
  let porClasse = $state<any[]>([]);
  let historico = $state<any[]>([]);

  const displayName = $derived(apelido || nomeOficial);

  async function load() {
    try {
      const supabase = await getSupabase();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        status = "unauthenticated";
        return;
      }

      status = "loading";

      let { data: membro } = await supabase
        .from("dMembros")
        .select("id_membro, nome, apelido, foto_url, oculto, auth_level")
        .eq("auth_user_id", session.user.id)
        .single();

      if (!membro) {
        // Primeiro login com esse email (ou email vinculado ao cadastro depois
        // de uma tentativa anterior): tenta vincular agora e recarrega uma vez.
        await supabase.rpc("vincular_membro_por_email");
        const retry = await supabase
          .from("dMembros")
          .select("id_membro, nome, apelido, foto_url, oculto, auth_level")
          .eq("auth_user_id", session.user.id)
          .single();
        membro = retry.data;
      }

      if (!membro || membro.oculto) {
        status = "no-member";
        return;
      }

      nomeOficial = membro.nome;
      fotoUrl = membro.foto_url;
      apelido = membro.apelido;
      ehStaffOuMais = membro.auth_level <= 3;
      apelidoInput = membro.apelido ?? "";

      const [geral, classes, historia] = await Promise.all([
        supabase.from("v_ranking_nivel_geral").select("*").eq("id_membro", membro.id_membro).single(),
        supabase.from("v_ranking_por_classe").select("*").eq("id_membro", membro.id_membro),
        supabase
          .from("v_historico_presencas")
          .select("*")
          .eq("id_membro", membro.id_membro)
          .order("data_treino", { ascending: false }),
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
    } catch (err) {
      // Anything unexpected (e.g. Supabase env vars missing at runtime) should
      // surface as a visible error, not leave the UI stuck on "Carregando...".
      status = "error";
      errorMessage = err instanceof Error ? err.message : String(err);
    }
  }

  async function saveApelido(e: SubmitEvent) {
    e.preventDefault();
    savingApelido = true;
    apelidoError = "";
    const supabase = await getSupabase();
    const { error } = await supabase.rpc("set_meu_apelido", { novo_apelido: apelidoInput });
    savingApelido = false;
    if (error) {
      apelidoError = error.message;
      return;
    }
    apelido = apelidoInput.trim() || null;
    editingApelido = false;
  }

  function cancelApelido() {
    editingApelido = false;
    apelidoInput = apelido ?? "";
    apelidoError = "";
  }

  async function logout() {
    const supabase = await getSupabase();
    await supabase.auth.signOut();
    window.location.reload();
  }

  async function saveMinhaFoto(blob: Blob): Promise<string> {
    const supabase = await getSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Sessão expirada, faça login novamente.");

    const path = `${user.id}/avatar.webp`;
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, blob, { upsert: true, contentType: "image/webp" });
    if (uploadError) throw uploadError;

    const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
    // cache-busting: mesmo path sempre (upsert), a query string muda a cada
    // envio para o navegador não continuar mostrando a foto antiga em cache
    const finalUrl = `${pub.publicUrl}?v=${Date.now()}`;

    const { error: rpcError } = await supabase.rpc("set_minha_foto", { nova_foto_url: finalUrl });
    if (rpcError) throw rpcError;

    return finalUrl;
  }

  onMount(load);
</script>

<div class="dashboard-container">
  {#if status === "checking" || status === "loading"}
    <p class="dashboard-loading">Carregando...</p>
  {:else if status === "unauthenticated"}
    <LoginForm redirectPath="/dashboard" />
  {:else if status === "no-member"}
    <div class="dashboard-status-block">
      <p class="admin-error">
        Seu email ainda não está vinculado a um cadastro de membro. Fale com um organizador.
      </p>
      <button class="btn btn-sm" onclick={logout}>Novo login</button>
    </div>
  {:else if status === "error"}
    <div class="dashboard-status-block">
      <p class="admin-error">{errorMessage}</p>
      <button class="btn btn-sm" onclick={logout}>Novo login</button>
    </div>
  {:else}
    <div class="dashboard-profile">
      {#if ehStaffOuMais}
        <a href="/admin" class="btn btn-sm dashboard-admin-link">painel administrativo</a>
      {/if}
      <button class="btn btn-sm dashboard-logout" onclick={logout}>sair</button>
      <AvatarUploader {fotoUrl} nome={displayName} onUploaded={(url) => (fotoUrl = url)} savePhoto={saveMinhaFoto} />
      <p class="dashboard-name">{displayName}</p>
      {#if apelido}
        <p class="dashboard-official-name">Nome oficial: {nomeOficial}</p>
      {/if}

      {#if !editingApelido}
        <button class="btn btn-sm dashboard-nickname-toggle" onclick={() => (editingApelido = true)}>
          editar apelido
        </button>
      {:else}
        <form class="dashboard-nickname-form" onsubmit={saveApelido}>
          <input
            type="text"
            bind:value={apelidoInput}
            maxlength="50"
            placeholder="Deixe em branco para usar o nome oficial"
          />
          <button type="submit" class="btn btn-sm btn-primary" disabled={savingApelido}>
            {savingApelido ? "salvando..." : "salvar"}
          </button>
          <button type="button" class="btn btn-sm" onclick={cancelApelido}>cancelar</button>
        </form>
        {#if apelidoError}
          <p class="admin-error">{apelidoError}</p>
        {/if}
      {/if}

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
      <div class="table-scroll">
        <table class="ranking-tabela ranking-tabela--dashboard">
          <thead>
            <tr>
              <th class="col-nome">Classe</th>
              <th class="col-stat">Nível</th>
              <th class="col-stat">Treinos</th>
            </tr>
          </thead>
          <tbody>
            {#each porClasse as c}
              <tr>
                <td class="col-nome">{c.nome_classe}</td>
                <td class="col-stat"><span class="stat-pill">{c.nivel_por_classe}</span></td>
                <td class="col-stat"><span class="stat-pill">{c.treinos_por_classe}</span></td>
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
      <div class="table-scroll">
        <table class="ranking-tabela ranking-tabela--historico">
          <thead>
            <tr>
              <th class="col-rank">Nº Treino</th>
              <th class="col-nome">Data</th>
              <th class="col-faixa">Classe</th>
              <th class="col-stat">PH Ganho</th>
            </tr>
          </thead>
          <tbody>
            {#each historico as h}
              <tr>
                <td class="col-rank"><span class="rank-badge">{h.id_treino}</span></td>
                <td class="col-nome">
                  {new Date(h.data_treino).toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "2-digit",
                  })}
                </td>
                <td class="col-faixa">{h.nome_classe}</td>
                <td class="col-stat"><span class="stat-pill">{h.ph_ganho_treino}</span></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {/if}
</div>
