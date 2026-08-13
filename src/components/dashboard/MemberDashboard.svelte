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
  let faixas = $state<{ nome_faixa: string; nivel_minimo: number }[]>([]);

  const displayName = $derived(apelido || nomeOficial);

  /**
   * Total de treinos, somado por classe.
   *
   * Era `historico.length`, e isso mostrava 9 para quem o Ranking Geral mostrava
   * 44: `v_historico_presencas` só tem as presenças registradas pelo sistema
   * novo, enquanto o contador por classe carrega o histórico inteiro do grupo. A
   * mesma pessoa via dois números para a mesma coisa em duas páginas. Agora sai
   * da mesma fonte que o ranking usa, então os dois sempre concordam. O bloco
   * "Últimas presenças" continua listando só o histórico detalhado, que é o que
   * ele diz ser.
   */
  const totalTreinos = $derived(
    porClasse.reduce((soma, c) => soma + (c.treinos_por_classe ?? 0), 0),
  );

  /**
   * A próxima graduação e o quanto falta pra ela.
   *
   * Os limiares vêm de dFaixas, não de uma cópia aqui: a tabela é legível pelo
   * cliente público e continua sendo a única fonte da verdade, que é a regra
   * que src/lib/faixa.ts documenta. Na faixa Preta não há próxima, e aí o bloco
   * inteiro sai da tela em vez de mostrar uma barra cheia sem destino.
   */
  const graduacao = $derived.by(() => {
    const proxima = faixas
      .filter((f) => f.nivel_minimo > nivelGeral)
      .sort((a, b) => a.nivel_minimo - b.nivel_minimo)[0];
    if (!proxima) return null;

    const atual = faixas
      .filter((f) => f.nivel_minimo <= nivelGeral)
      .sort((a, b) => b.nivel_minimo - a.nivel_minimo)[0];
    const piso = atual?.nivel_minimo ?? 0;
    const vao = proxima.nivel_minimo - piso;

    return {
      nome: proxima.nome_faixa,
      nivel: proxima.nivel_minimo,
      faltam: proxima.nivel_minimo - nivelGeral,
      // Um quadradinho por nível que falta, não uma barra contínua. Contínua
      // fica vazia e parece que não carregou justamente quando a pessoa acaba
      // de mudar de faixa (nível 18 de 18, zero por cento andado). Segmentada,
      // o vão é visível mesmo com nada preenchido: dá pra contar sete casas.
      total: vao,
      andados: nivelGeral - piso,
    };
  });

  /**
   * Quantos treinos valem um nível de classe.
   *
   * Confere contra o `nivel_por_classe` que vem do banco antes de desenhar: se
   * a regra mudar lá e este número ficar velho, os quadradinhos somem em vez de
   * mostrar um progresso errado. Errar calado é pior do que não mostrar.
   */
  const TREINOS_POR_NIVEL = 4;

  function progressoDaClasse(c: any) {
    const treinos = c.treinos_por_classe ?? 0;
    const nivel = c.nivel_por_classe ?? 0;
    if (Math.floor(treinos / TREINOS_POR_NIVEL) !== nivel) return null;
    return { andados: treinos % TREINOS_POR_NIVEL, total: TREINOS_POR_NIVEL };
  }

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

      const [geral, classes, historia, escala] = await Promise.all([
        supabase.from("v_ranking_nivel_geral").select("*").eq("id_membro", membro.id_membro).single(),
        supabase.from("v_ranking_por_classe").select("*").eq("id_membro", membro.id_membro),
        supabase
          .from("v_historico_presencas")
          .select("*")
          .eq("id_membro", membro.id_membro)
          .order("data_treino", { ascending: false }),
        supabase.from("dFaixas").select("nome_faixa, nivel_minimo"),
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
      // A escala de faixas é enfeite informativo: se falhar, some a barra de
      // progresso e o resto da ficha continua de pé.
      faixas = escala.data ?? [];
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

    {#if graduacao}
      <section class="ficha-graduacao" aria-label="Progresso até a próxima graduação">
        <div class="ficha-graduacao-topo">
          <span>Próxima graduação: <strong>Faixa {graduacao.nome}</strong></span>
          <span class="ficha-graduacao-falta">
            nível {graduacao.nivel} · {graduacao.faltam === 1
              ? "falta 1"
              : `faltam ${graduacao.faltam}`}
          </span>
        </div>
        <ol class="ficha-casas" aria-label={`${graduacao.andados} de ${graduacao.total} níveis`}>
          {#each { length: graduacao.total } as _, i}
            <li class:cheia={i < graduacao.andados}></li>
          {/each}
        </ol>
      </section>
    {/if}

    <h2>Minhas classes</h2>
    {#if porClasse.length === 0}
      <p class="ficha-aviso">
        Nenhum treino registrado ainda. Depois do seu primeiro treino a classe aparece aqui.
      </p>
    {:else}
      <!-- Era tabela de três colunas. Vira grade de cartões porque a tabela
           obrigava rolagem lateral no celular pra ler três números curtos, e
           porque cada linha é uma classe, não uma comparação entre elas. -->
      <ul class="ficha-classes">
        {#each porClasse as c}
          {@const progresso = progressoDaClasse(c)}
          <li>
            <span class="ficha-classe-nome">{c.nome_classe}</span>
            <span class="ficha-classe-nivel">Nível {c.nivel_por_classe}</span>
            <span class="ficha-classe-treinos">
              {c.treinos_por_classe === 1 ? "1 treino" : `${c.treinos_por_classe} treinos`}
            </span>
            {#if progresso}
              <ol
                class="ficha-casas ficha-casas--classe"
                aria-label={`${progresso.andados} de ${progresso.total} treinos para o nível ${c.nivel_por_classe + 1}`}
              >
                {#each { length: progresso.total } as _, i}
                  <li class:cheia={i < progresso.andados}></li>
                {/each}
              </ol>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}

    <h2>Últimas presenças</h2>
    {#if historico.length === 0}
      <p class="ficha-aviso">
        Nenhuma presença registrada ainda. Confirme presença na <a class="links-de-texto" href="/agenda">agenda</a>.
      </p>
    {:else}
      <!-- Lista, não tabela: data, classe e ganho cabem numa linha só até em
           tela estreita, e o número do treino virou detalhe secundário porque
           ninguém procura presença por id. -->
      <ol class="ficha-presencas">
        {#each historico as h}
          <li>
            <span class="ficha-presenca-data">
              {new Date(h.data_treino + "T00:00:00").toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
              })}
            </span>
            <span class="ficha-presenca-classe">{h.nome_classe}</span>
            <span class="ficha-presenca-ganho">
              {h.ph_ganho_treino > 0 ? `+${h.ph_ganho_treino} PH` : "presença"}
            </span>
          </li>
        {/each}
      </ol>
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

  /* ======== PRÓXIMA GRADUAÇÃO ======== */

  /* O único elemento dourado cheio da ficha. É de propósito: a pergunta que
     traz a pessoa aqui é "quanto falta pra minha próxima faixa", e essa
     resposta não pode disputar atenção com mais nada da página. */
  .ficha-graduacao {
    margin: 0.4em 0 0.8em;
    padding: 16px 18px;
    border: 1px solid var(--ds-gold-dim);
    border-radius: 14px;
    background: var(--ds-gold-wash);
  }

  .ficha-graduacao-topo {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 6px;
    margin-bottom: 10px;
    font-size: 0.88rem;
  }

  .ficha-graduacao-topo strong {
    color: var(--ds-gold);
    font-weight: 600;
  }

  .ficha-graduacao-falta {
    font-size: 0.8rem;
    color: var(--ds-text-3);
  }

  /* Uma casa por passo que falta. As casas dividem a largura em partes iguais,
     então serve tanto pro vão de 5 níveis quanto pro de 15 entre Roxa e Preta
     sem ninguém precisar escolher um tamanho de quadradinho. */
  .ficha-casas {
    display: flex;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .ficha-casas > li {
    flex: 1;
    height: 9px;
    border-radius: 3px;
    border: 1px solid var(--ds-line-strong);
    background: rgba(255, 255, 255, 0.04);
  }

  .ficha-casas > li.cheia {
    border-color: var(--ds-gold);
    background: var(--ds-gold);
  }

  .ficha-casas--classe {
    grid-column: 1 / -1;
    margin-top: 8px;
    gap: 3px;
  }

  .ficha-casas--classe > li {
    height: 6px;
  }

  /* ======== CLASSES E PRESENÇAS ======== */

  .ficha-classes,
  .ficha-presencas {
    margin: 0 0 0.4em;
    padding: 0;
    list-style: none;
  }

  .ficha-classes {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: 10px;
  }

  .ficha-classes > li {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: baseline;
    gap: 2px 10px;
    padding: 14px 16px;
    border: 1px solid var(--ds-line);
    border-radius: 13px;
    background: var(--ds-surface);
  }

  .ficha-classe-nome {
    font-family: var(--ds-font-display);
    font-size: 1rem;
    font-weight: 600;
  }

  .ficha-classe-nivel {
    justify-self: end;
    font-size: 0.78rem;
    color: var(--ds-gold);
  }

  .ficha-classe-treinos {
    grid-column: 1 / -1;
    font-size: 0.76rem;
    color: var(--ds-text-4);
  }

  .ficha-presencas {
    border: 1px solid var(--ds-line);
    border-radius: 14px;
    overflow: hidden;
  }

  .ficha-presencas > li {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 16px;
    background: var(--ds-surface);
    font-size: 0.88rem;
  }

  .ficha-presencas > li + li {
    border-top: 1px solid var(--ds-line);
  }

  .ficha-presenca-data {
    flex: none;
    width: 46px;
    font-family: var(--ds-font-display);
    font-size: 0.82rem;
    color: var(--ds-gold);
  }

  .ficha-presenca-classe {
    flex: 1;
    min-width: 0;
  }

  .ficha-presenca-ganho {
    flex: none;
    font-size: 0.78rem;
    color: var(--ds-text-4);
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
