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
  // O total de treinos já estava na tela, espalhado por classe. Somado ele vira
  // o número que a pessoa realmente quer saber quando abre a ficha.
  const totalTreinos = $derived(historico.length);

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

<div class="ficha">
  {#if status === "checking" || status === "loading"}
    <p class="ficha-aviso">Carregando...</p>
  {:else if status === "unauthenticated"}
    <LoginForm redirectPath="/dashboard" />
  {:else if status === "no-member"}
    <div class="ficha-bloco-status">
      <p class="admin-error">
        Seu email ainda não está vinculado a um cadastro de membro. Fale com um organizador.
      </p>
      <button class="btn btn-sm" onclick={logout}>Novo login</button>
    </div>
  {:else if status === "error"}
    <div class="ficha-bloco-status">
      <p class="admin-error">{errorMessage}</p>
      <button class="btn btn-sm" onclick={logout}>Novo login</button>
    </div>
  {:else}
    <section class="ficha-perfil">
      <div class="ficha-topo">
        <AvatarUploader {fotoUrl} nome={displayName} onUploaded={(url) => (fotoUrl = url)} savePhoto={saveMinhaFoto} />
        <div class="ficha-id">
          <p class="ficha-nome">{displayName}</p>
          {#if nomeFaixa}
            <p><span class="ficha-faixa">{nomeFaixa}</span></p>
          {/if}
          {#if apelido}
            <p class="ficha-oficial">Nome oficial: {nomeOficial}</p>
          {/if}
        </div>
      </div>

      <div class="ficha-stats">
        <div class="ficha-stat">
          <span class="label">Nível Geral</span>
          <span class="value">{nivelGeral}</span>
        </div>
        <div class="ficha-stat">
          <span class="label">Pontos de Honra</span>
          <span class="value">{phTotal}</span>
        </div>
        <div class="ficha-stat">
          <span class="label">Treinos</span>
          <span class="value">{totalTreinos}</span>
        </div>
      </div>

      {#if !editingApelido}
        <div class="ficha-acoes">
          <button class="btn btn-sm" onclick={() => (editingApelido = true)}>editar apelido</button>
          {#if ehStaffOuMais}
            <a href="/admin" class="btn btn-sm">painel administrativo</a>
          {/if}
          <button class="btn btn-sm" onclick={logout}>sair</button>
        </div>
      {:else}
        <form class="ficha-apelido" onsubmit={saveApelido}>
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
    </section>

    <h2>Níveis por classe</h2>
    {#if porClasse.length === 0}
      <p class="ficha-aviso">
        Nenhum treino registrado ainda. Depois do seu primeiro treino a classe aparece aqui.
      </p>
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

    <h2>Histórico de presença</h2>
    {#if historico.length === 0}
      <p class="ficha-aviso">
        Nenhuma presença registrada ainda. Confirme presença na <a class="links-de-texto" href="/agenda">agenda</a>.
      </p>
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
                  {new Date(h.data_treino + "T00:00:00").toLocaleDateString("pt-BR", {
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

    <h2>Conquistas</h2>
    <p class="ficha-aviso">
      As conquistas ainda estão sendo montadas. Quando entrarem, elas aparecem aqui junto com o
      que cada uma libera, como as flechas extras do Atirador de Elite.
    </p>
  {/if}
</div>

<style>
  /* Este bloco saiu do global.css. Era o único lugar do site que usava as
     classes .dashboard-*, então elas viviam num arquivo global sem motivo. */

  .ficha {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .ficha-aviso {
    color: var(--ds-text-4);
  }

  .ficha-bloco-status {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1em;
    margin-top: 1.5em;
    text-align: center;
  }

  .ficha-perfil {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 18px;
    margin-bottom: 12px;
    padding: 22px 20px 20px;
    border: 1px solid var(--ds-line-strong);
    border-radius: 14px;
    background: var(--ds-surface-solid);
    box-shadow: var(--card-shadow-alta);
    overflow: hidden;
  }

  .ficha-perfil::before {
    content: "";
    position: absolute;
    inset: 0 0 auto 0;
    height: 2px;
    background: var(--hairline-gold);
  }

  /* Foto e identidade lado a lado. Antes tudo era centralizado numa coluna só,
     com "sair" e "painel administrativo" flutuando nos cantos de cima, o que
     no celular caía em cima da foto. */
  .ficha-topo {
    display: flex;
    align-items: center;
    gap: 18px;
  }

  .ficha-id {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .ficha-nome {
    font-family: var(--ds-font-display);
    font-size: 1.5rem;
    line-height: 1.15;
    color: var(--ds-gold-light);
  }

  /* Encolhe com o próprio texto: em bloco ele esticaria pela largura do card. */
  .ficha-faixa {
    display: inline-block;
    padding: 3px 10px;
    border: 1px solid var(--ds-gold-dim);
    border-radius: 999px;
    background: var(--ds-gold-wash);
    font-size: 0.76rem;
    color: var(--ds-gold-light);
  }

  .ficha-oficial {
    font-size: 0.82rem;
    color: var(--ds-text-4);
  }

  .ficha-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }

  .ficha-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 12px 8px;
    border: 1px solid var(--ds-line);
    border-radius: 12px;
    background: var(--ds-bg);
  }

  .ficha-stat .label {
    font-size: 0.68rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    text-align: center;
    color: var(--ds-gold);
  }

  .ficha-stat .value {
    font-size: 1.7rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--ds-text-1);
  }

  .ficha-acoes,
  .ficha-apelido {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding-top: 4px;
    border-top: 1px solid var(--ds-line);
  }

  .ficha-apelido input {
    flex: 1 1 200px;
    padding: 0.5em 0.8em;
    border: 1px solid var(--ds-line-strong);
    border-radius: 6px;
    background: var(--ds-bg);
    color: var(--ds-text-1);
    font-family: inherit;
  }

  .ficha-apelido input:focus {
    border-color: var(--ds-gold);
  }

  @media (max-width: 420px) {
    .ficha-topo {
      flex-direction: column;
      gap: 10px;
      text-align: center;
    }

    .ficha-id {
      align-items: center;
    }
  }
</style>
