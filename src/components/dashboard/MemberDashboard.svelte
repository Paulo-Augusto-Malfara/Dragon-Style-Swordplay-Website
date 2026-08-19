<script lang="ts">
  import { onMount } from "svelte";
  import LoginForm from "../auth/LoginForm.svelte";
  import AvatarUploader from "./AvatarUploader.svelte";
  import EnviarPauta from "./EnviarPauta.svelte";
  import { corDaFaixa } from "../../lib/faixa";
  import {
    CLASSE_BASICO,
    basicoConcluido,
    calcularRanks,
    classesVisiveis,
    progressoDaClasse,
    slugDaClasse,
    versaoDoRank,
  } from "../../lib/rank-classe";

  // ponytail: dynamic import, not a top-level one -- this component is used
  // inside dashboard.astro, a fully static page. A static import evaluates
  // createBrowserClient() during Astro's SSR pass at build time, which
  // crashed the whole build when the Supabase env vars weren't set then.
  let supabasePromise: Promise<any> | undefined;
  function getSupabase() {
    supabasePromise ??= import("../../lib/supabase-browser").then((m) => m.supabase);
    return supabasePromise;
  }

  // "sem-cadastro" e "oculto" eram o mesmo estado, e a mensagem dizia "seu email
  // não está vinculado a um cadastro" nos dois casos. No segundo isso é falso: o
  // vínculo existe, o cadastro é que está fora do site. Enganou duas vezes o
  // próprio administrador em 14/08, e enganaria qualquer membro oculto que
  // entrasse. São causas diferentes e pedem providências diferentes.
  type Status =
    | "checking"
    | "unauthenticated"
    | "loading"
    | "ready"
    | "sem-cadastro"
    | "oculto"
    | "error";
  let status = $state<Status>("checking");
  let errorMessage = $state("");

  let nomeOficial = $state("");
  let fotoUrl = $state<string | null>(null);
  let apelido = $state<string | null>(null);
  // Foto e apelido passam por aprovação antes de aparecer pros outros. Estes
  // quatro campos são o que a pessoa precisa saber sobre isso: se tem algo na
  // fila, e por que foi recusado se foi.
  let fotoPendenteEm = $state<string | null>(null);
  let fotoRecusaMotivo = $state<string | null>(null);
  let apelidoPendente = $state<string | null>(null);
  let apelidoRecusaMotivo = $state<string | null>(null);
  /** "foto" ou "apelido" enquanto a baixa do aviso está indo ao banco. */
  let descartando = $state<string | null>(null);
  let editingApelido = $state(false);
  let apelidoInput = $state("");
  let savingApelido = $state(false);
  let apelidoError = $state("");

  let ehStaffOuMais = $state(false);

  let nivelGeral = $state(0);
  let nomeFaixa = $state<string | null>(null);
  let phTotal = $state(0);
  let porClasse = $state<any[]>([]);
  /** id_classe → colocação da pessoa naquela classe. Ver `calcularRanks`. */
  let rankPorClasse = $state(new Map<number, { posicao: number; total: number }>());
  /** Em qual leitura do ranking essa colocação foi medida. */
  let versaoRank = $state<"ativa" | "legado">("ativa");
  let historico = $state<any[]>([]);
  let paginaPresencas = $state(1);
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
   * A soma dos níveis de classe, que é a coluna "Classe" do Ranking Geral.
   *
   * Pula o Básico pelo mesmo motivo que o ranking pula: ele é gate de veterano,
   * não classe pra disputar. Somando ele aqui, a ficha mostraria um número
   * maior do que a linha da própria pessoa no ranking.
   */
  const nivelClasseTotal = $derived(
    porClasse
      .filter((c) => c.id_classe !== CLASSE_BASICO)
      .reduce((soma, c) => soma + (c.nivel_por_classe ?? 0), 0),
  );

  /**
   * O Básico sai da grade assim que existe classe oficial treinada (ver
   * `classesVisiveis`): ele não anda mais e não disputa colocação com ninguém.
   * Quem diz que ele foi feito é o selo "Veterano" embaixo da faixa.
   *
   * Os quatro treinos continuam contados em "Treinos" e o nível dele continua
   * dentro do Nível Geral: sai da grade, não da conta.
   */
  const veterano = $derived(porClasse.some(basicoConcluido));
  const classesNaGrade = $derived(classesVisiveis(porClasse));

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
   * "Últimas presenças" é o que o título promete: as últimas.
   *
   * A lista inteira empurrava as conquistas pra fora da tela em quem treina há
   * anos, e ninguém rola cinquenta linhas procurando a semana passada. Cinco por
   * página, com a numeração do Ranking Geral, que é o mesmo gesto na mesma cara.
   */
  const PRESENCAS_POR_PAGINA = 5;
  const totalPaginasPresencas = $derived(
    Math.max(1, Math.ceil(historico.length / PRESENCAS_POR_PAGINA)),
  );
  const presencasDaPagina = $derived(
    historico.slice(
      (paginaPresencas - 1) * PRESENCAS_POR_PAGINA,
      paginaPresencas * PRESENCAS_POR_PAGINA,
    ),
  );


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
        .select(
          "id_membro, nome, apelido, foto_url, oculto, auth_level, foto_pendente_em, foto_recusa_motivo, apelido_pendente, apelido_recusa_motivo",
        )
        .eq("auth_user_id", session.user.id)
        .single();

      if (!membro) {
        // Primeiro login com esse email (ou email vinculado ao cadastro depois
        // de uma tentativa anterior): tenta vincular agora e recarrega uma vez.
        await supabase.rpc("vincular_membro_por_email");
        const retry = await supabase
          .from("dMembros")
          .select(
          "id_membro, nome, apelido, foto_url, oculto, auth_level, foto_pendente_em, foto_recusa_motivo, apelido_pendente, apelido_recusa_motivo",
        )
          .eq("auth_user_id", session.user.id)
          .single();
        membro = retry.data;
      }

      if (!membro) {
        status = "sem-cadastro";
        return;
      }
      if (membro.oculto) {
        status = "oculto";
        return;
      }

      nomeOficial = membro.nome;
      fotoUrl = membro.foto_url;
      apelido = membro.apelido;
      ehStaffOuMais = membro.auth_level <= 3;
      apelidoInput = membro.apelido ?? "";
      fotoPendenteEm = membro.foto_pendente_em;
      fotoRecusaMotivo = membro.foto_recusa_motivo;
      apelidoPendente = membro.apelido_pendente;
      apelidoRecusaMotivo = membro.apelido_recusa_motivo;

      const [geral, classes, todasAsClasses, ativos, historia, escala] = await Promise.all([
        supabase.from("v_ranking_nivel_geral").select("*").eq("id_membro", membro.id_membro).single(),
        supabase.from("v_ranking_por_classe").select("*").eq("id_membro", membro.id_membro),
        supabase.from("v_ranking_por_classe").select("id_membro, id_classe, treinos_por_classe"),
        // A view por classe não carrega `status_ativo`, e a colocação é medida
        // na base "Na Ativa". Mesmo par de consultas que o Ranking por Classe faz.
        supabase.from("v_ranking_nivel_geral").select("id_membro, status_ativo"),
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
        const aBasico = a.id_classe === CLASSE_BASICO;
        const bBasico = b.id_classe === CLASSE_BASICO;
        if (aBasico !== bBasico) return aBasico ? 1 : -1;
        return b.treinos_por_classe - a.treinos_por_classe;
      });
      // Colocação é enfeite informativo, igual à escala de faixas: se a consulta
      // falhar, some a linha do rank e o cartão continua inteiro.
      const souAtivo = !!geral.data?.status_ativo;
      rankPorClasse = calcularRanks(
        porClasse,
        todasAsClasses.data ?? [],
        new Set<number>(
          (ativos.data ?? []).filter((m) => m.status_ativo).map((m) => m.id_membro),
        ),
        souAtivo,
      );
      versaoRank = versaoDoRank(souAtivo);
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
    // Limpar o apelido vale na hora (voltar pro nome oficial nunca é o
    // problema que a fila existe pra pegar); escolher um novo espera aprovação.
    const proposto = apelidoInput.trim();
    if (proposto) {
      apelidoPendente = proposto;
      apelidoRecusaMotivo = null;
      void avisarAdmins();
    } else {
      apelido = null;
      apelidoPendente = null;
    }
    editingApelido = false;
  }

  /* Dá baixa no aviso de recusa. Passa pelo banco porque o membro não escreve
   * no próprio cadastro (o UPDATE da dMembros é do admin do sistema), e sem
   * isso o X só apagaria o aviso até a próxima vez que a página carregasse. */
  async function descartarRecusa(tipo: "foto" | "apelido") {
    descartando = tipo;
    const supabase = await getSupabase();
    const { error } = await supabase.rpc("descartar_recusa", { p_tipo: tipo });
    descartando = null;
    if (error) return;
    if (tipo === "foto") fotoRecusaMotivo = null;
    else apelidoRecusaMotivo = null;
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

  /**
   * Cutuca a notificação de quem administra. Falhar aqui não é problema do
   * membro: o pedido já está na fila e o painel mostra a contagem de qualquer
   * jeito, então o erro é engolido de propósito em vez de virar aviso
   * vermelho numa tela onde deu tudo certo.
   */
  async function avisarAdmins() {
    try {
      const supabase = await getSupabase();
      const { data: sessao } = await supabase.auth.getSession();
      const token = sessao.session?.access_token;
      if (!token) return;
      await fetch(`${import.meta.env.PUBLIC_SUPABASE_URL}/functions/v1/notificar-aprovacao`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: "{}",
      });
    } catch {
      // silêncio proposital, ver acima
    }
  }

  async function saveMinhaFoto(blob: Blob): Promise<void> {
    const supabase = await getSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Sessão expirada, faça login novamente.");

    // Bucket privado, não o público. O membro escreve só na pasta dele e não
    // consegue ler nem a própria: quem lê a fila é organizador. A foto só chega
    // no bucket público depois de aprovada, e quem copia é a função de borda.
    // O nome é fixo de propósito, mesmo quando o conteúdo é JPEG (iPhone, ver
    // AvatarUploader): a função de borda `aprovar-foto` baixa por este caminho
    // exato e a prévia da moderação assina esta mesma string. Extensão variável
    // obrigaria as duas a listar a pasta pra adivinhar o arquivo. Quem decide o
    // formato na hora de exibir é o Content-Type, que sai do mime guardado.
    const path = `${user.id}/avatar.webp`;
    const { error: uploadError } = await supabase.storage
      .from("avatars-pendentes")
      .upload(path, blob, { upsert: true, contentType: blob.type });
    if (uploadError) throw uploadError;

    const { error: rpcError } = await supabase.rpc("enviar_foto_para_analise");
    if (rpcError) throw rpcError;

    fotoPendenteEm = new Date().toISOString();
    fotoRecusaMotivo = null;
    void avisarAdmins();
  }

  onMount(load);
</script>

<div class="ficha">
  {#if status === "checking" || status === "loading"}
    <p class="ficha-aviso">Carregando...</p>
  {:else if status === "unauthenticated"}
    <LoginForm redirectPath="/dashboard" />
  {:else if status === "sem-cadastro"}
    <div class="ficha-bloco-status">
      <p class="admin-error">
        Seu email ainda não está vinculado a um cadastro de membro. Fale com um organizador.
      </p>
      <button class="btn btn-sm" onclick={logout}>Novo login</button>
    </div>
  {:else if status === "oculto"}
    <div class="ficha-bloco-status">
      <p class="admin-error">
        Seu cadastro está fora do site no momento, então a ficha não aparece. Fale com um
        organizador para reativar.
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
        <AvatarUploader {fotoUrl} nome={displayName} savePhoto={saveMinhaFoto} />
        <div class="ficha-id">
          <p class="ficha-nome">
            {displayName}
            <!-- O lápis fica colado no nome porque é o nome que ele edita. Como
                 botão de texto lá embaixo, "editar apelido" obrigava a ler três
                 rótulos pra descobrir qual mexia em quê. -->
            <button
              class="ficha-icone"
              onclick={() => (editingApelido = true)}
              aria-label="Editar apelido"
              title="Editar apelido"
            >
              <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true">
                <path
                  d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
                ></path>
              </svg>
            </button>
          </p>
          <!-- Traço de cor, o mesmo do ranking e da janela de perfil, no lugar
               da pílula dourada que escrevia o nome: a faixa é um atributo da
               pessoa e não deve competir de tamanho com o nome dela. Quem não
               enxerga a cor continua tendo o nome no title e no leitor de tela. -->
          {#if corDaFaixa(nomeFaixa)}
            <p>
              <span
                class="ficha-faixa"
                style={`--faixa:${corDaFaixa(nomeFaixa)}`}
                title={`Faixa ${nomeFaixa}`}
              >
                <span class="sr-only">Faixa {nomeFaixa}</span>
              </span>
            </p>
          {/if}
          <!-- Fica embaixo da faixa e não vira cartão de classe: o Básico
               fechado não anda mais, e o que interessa dele daqui em diante é
               só esta palavra. -->
          {#if veterano}
            <p>
              <span class="status-badge status-badge--veterano" title="Concluiu os treinos do Básico">
                Veterano
              </span>
            </p>
          {/if}
          {#if apelido}
            <p class="ficha-oficial">Nome oficial: {nomeOficial}</p>
          {/if}
        </div>

        <!-- Sair mora no canto de cima, longe das ações que a pessoa realmente
             veio fazer. É ícone, e não o botão de texto que já esteve aqui: era
             largo o bastante pra cair em cima da foto no celular. -->
        <button
          class="ficha-icone ficha-sair"
          onclick={logout}
          aria-label="Sair da conta"
          title="Sair da conta"
        >
          <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true">
            <path
              d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"
            ></path>
          </svg>
        </button>
      </div>

      <!-- Estado da fila. Sem isto a pessoa manda a foto, nada muda na tela e
           ela conclui que quebrou, e manda de novo. -->
      {#if fotoPendenteEm || apelidoPendente || fotoRecusaMotivo || apelidoRecusaMotivo}
        <ul class="ficha-moderacao">
          {#if fotoPendenteEm}
            <li class="analise">
              <strong>Foto em análise.</strong> Um organizador precisa aprovar antes dela aparecer
              no seu perfil.
            </li>
          {/if}
          {#if apelidoPendente}
            <li class="analise">
              <strong>Apelido em análise:</strong> "{apelidoPendente}". Até a aprovação, o site
              continua te mostrando como {apelido || nomeOficial}.
            </li>
          {/if}
          <!-- O aviso de recusa é o único que não sai sozinho: o "em análise"
               some quando alguém decide, mas a recusa ficava no perfil para
               sempre. Depois de lido, a pessoa dá baixa nele. -->
          {#if fotoRecusaMotivo}
            <li class="recusado">
              <span><strong>Foto recusada.</strong> {fotoRecusaMotivo}</span>
              <button
                type="button"
                class="descartar"
                onclick={() => descartarRecusa("foto")}
                disabled={descartando === "foto"}
                aria-label="Dispensar o aviso de foto recusada"
                title="Dispensar aviso"
              >
                ✕
              </button>
            </li>
          {/if}
          {#if apelidoRecusaMotivo}
            <li class="recusado">
              <span><strong>Apelido recusado.</strong> {apelidoRecusaMotivo}</span>
              <button
                type="button"
                class="descartar"
                onclick={() => descartarRecusa("apelido")}
                disabled={descartando === "apelido"}
                aria-label="Dispensar o aviso de apelido recusado"
                title="Dispensar aviso"
              >
                ✕
              </button>
            </li>
          {/if}
        </ul>
      {/if}

      <div class="ficha-stats">
        <div class="ficha-stat">
          <span class="label">Nível Geral</span>
          <span class="value">{nivelGeral}</span>
        </div>
        <div class="ficha-stat">
          <span class="label">Nível de Classe</span>
          <span class="value">{nivelClasseTotal}</span>
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

      <EnviarPauta {getSupabase} />

      {#if !editingApelido}
        <!-- Sobrou uma ação de texto só, e ela ganhou o botão cheio do site (o
             mesmo de "Quero treinar" na home) em vez do miúdo que dividia a
             linha com "sair". Quem não é staff não vê barra nenhuma. -->
        {#if ehStaffOuMais}
          <div class="ficha-acoes">
            <a href="/admin" class="btn">Painel administrativo</a>
          </div>
        {/if}
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
    {#if classesNaGrade.length === 0}
      <p class="ficha-aviso">
        Nenhum treino registrado ainda. Depois do seu primeiro treino a classe aparece aqui.
      </p>
    {:else}
      <!-- Era tabela de três colunas. Vira grade de cartões porque a tabela
           obrigava rolagem lateral no celular pra ler três números curtos, e
           porque cada linha é uma classe, não uma comparação entre elas. -->
      <ul class="classes-cartoes">
        {#each classesNaGrade as c}
          {@const progresso = progressoDaClasse(c)}
          {@const rank = rankPorClasse.get(c.id_classe)}
          <li>
            <span class="classe-cartao-nome">{c.nome_classe}</span>
            <span class="classe-cartao-nivel">Nível {c.nivel_por_classe}</span>
            <span class="classe-cartao-treinos">
              {c.treinos_por_classe === 1 ? "1 treino" : `${c.treinos_por_classe} treinos`}
            </span>
            <!-- A colocação divide a linha dos treinos, que estava vazia à
                 direita, então o cartão não cresce um pixel. -->
            {#if rank}
              <a
                class="classe-cartao-rank"
                class:podio-1={rank.posicao === 1}
                class:podio-2={rank.posicao === 2}
                class:podio-3={rank.posicao === 3}
                href={`/ranking-por-classe?classe=${slugDaClasse(c.nome_classe)}&versao=${versaoRank}`}
                title={`Sua colocação em ${c.nome_classe} (${versaoRank === "ativa" ? "Na Ativa" : "Legado"})`}
              >
                <strong>{rank.posicao}º</strong> de {rank.total}
              </a>
            {/if}
            {#if progresso}
              <ol
                class="classe-cartao-casas"
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
      <ol class="presencas-lista">
        {#each presencasDaPagina as h}
          <li>
            <span class="presenca-data">
              {new Date(h.data_treino + "T00:00:00").toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
              })}
            </span>
            <span class="presenca-classe">{h.nome_classe}</span>
            <span class="presenca-ganho">
              {h.ph_ganho_treino > 0 ? `+${h.ph_ganho_treino} PH` : "presença"}
            </span>
          </li>
        {/each}
      </ol>

      <!-- Mesmas classes globais do Ranking Geral. Lá são links, porque a
           página inteira recarrega; aqui é botão, porque a lista já está toda
           na memória e trocar de página não pede nada ao servidor. -->
      {#if totalPaginasPresencas > 1}
        <nav class="ranking-pagination" aria-label="Páginas das presenças">
          <button
            class="chip"
            onclick={() => (paginaPresencas -= 1)}
            disabled={paginaPresencas === 1}
            aria-label="Página anterior"
          >
            ‹
          </button>
          {#each { length: totalPaginasPresencas } as _, i}
            <button
              class="chip"
              class:ativo={paginaPresencas === i + 1}
              onclick={() => (paginaPresencas = i + 1)}
              aria-current={paginaPresencas === i + 1 ? "page" : undefined}
            >
              {i + 1}
            </button>
          {/each}
          <button
            class="chip"
            onclick={() => (paginaPresencas += 1)}
            disabled={paginaPresencas === totalPaginasPresencas}
            aria-label="Próxima página"
          >
            ›
          </button>
        </nav>
      {/if}
    {/if}

    <h2>Conquistas</h2>
    <p class="ficha-aviso">
      As conquistas ainda estão sendo montadas. Quando entrarem, elas aparecem aqui junto com o
      que cada uma libera, como as flechas extras do Atirador de Elite.
    </p>
  {/if}
</div>

<style>
  /* Avisos da fila de aprovação. Ficam logo abaixo da identidade porque é
     sobre a identidade que eles falam. */
  .ficha-moderacao {
    list-style: none;
    margin: 12px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .ficha-moderacao li {
    padding: 10px 13px;
    border: 1px solid var(--ds-line-strong);
    border-radius: 10px;
    background: var(--ds-surface);
    font-size: 0.86rem;
    line-height: 1.5;
    color: var(--ds-text-3);
    text-align: left;
  }

  .ficha-moderacao .analise {
    border-color: var(--ds-gold-dim);
    background: var(--ds-gold-wash);
  }

  .ficha-moderacao .recusado {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    border-color: var(--ds-danger);
  }

  /* O X fica no alto à direita e não desce com o texto: o motivo pode ter duas
     linhas, e um botão centralizado num aviso alto flutua no meio do nada. */
  .descartar {
    flex: none;
    margin: -2px -4px 0 auto;
    padding: 2px 6px;
    border: none;
    border-radius: 6px;
    background: none;
    color: var(--ds-text-5);
    font-size: 0.9rem;
    line-height: 1;
    cursor: pointer;
  }

  .descartar:hover,
  .descartar:focus-visible {
    color: var(--ds-text-2);
  }

  .descartar:disabled {
    opacity: 0.4;
    cursor: default;
  }

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

  /* A regra global `p { width: 90%; margin: auto }` centraliza todo parágrafo
     solto do site, e aqui isso jogava faixa, selo e nome oficial 7px pra
     dentro em relação ao nome, que escapa dela. O empilhamento já é do flex. */
  .ficha-id > p {
    width: auto;
    margin: 0;
  }

  .ficha-nome {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: var(--ds-font-display);
    font-size: 1.5rem;
    line-height: 1.15;
    color: var(--ds-gold-light);
  }

  /* Botão que é só o ícone: alvo de 34px, que é o mínimo que se acerta com o
     dedo, mesmo o desenho tendo 16. Sem moldura parada, porque duas molduras
     douradas ao redor da foto já seriam ruído; a borda aparece no toque. */
  .ficha-icone {
    flex: none;
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 9px;
    background: transparent;
    color: var(--ds-text-4);
    font-size: 1.05rem;
    cursor: pointer;
    transition:
      color 0.15s ease,
      border-color 0.15s ease,
      background 0.15s ease;
  }

  .ficha-icone:hover {
    border-color: var(--ds-gold-dim);
    background: var(--ds-gold-wash);
    color: var(--ds-gold-light);
  }

  .ficha-icone:focus-visible {
    outline: 2px solid var(--ds-gold-light);
    outline-offset: 2px;
  }

  /* Encostado no topo da linha, não no meio dela: é o canto do cartão que ele
     ocupa. Fora do fluxo do nome, então nome comprido não empurra nem cobre. */
  .ficha-sair {
    margin-left: auto;
    align-self: flex-start;
  }

  .ficha-sair:hover {
    border-color: rgba(192, 57, 43, 0.6);
    background: rgba(192, 57, 43, 0.12);
    color: #e57368;
  }

  /* Mesma caixinha do .rk-faixa e do .pf-faixa. */
  .ficha-faixa {
    display: inline-block;
    width: 32px;
    height: 11px;
    border-radius: 2px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: var(--faixa);
  }

  .ficha-oficial {
    font-size: 0.82rem;
    color: var(--ds-text-4);
  }

  .ficha-stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }

  .ficha-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 12px 6px;
    border: 1px solid var(--ds-line);
    border-radius: 12px;
    background: var(--ds-bg);
  }

  /* Número dourado em Cinzel, rótulo apagado embaixo: é como o .rk-valor do
     ranking e o .mural-numeros do mural desenham a mesma coisa. Aqui estava ao
     contrário, rótulo dourado em caixa alta e número na fonte do corpo, e era
     isso que destoava do resto do site. */
  .ficha-stat .label {
    font-size: 0.68rem;
    letter-spacing: 0.04em;
    text-align: center;
    color: var(--ds-text-4);
  }

  .ficha-stat .value {
    font-family: var(--ds-font-display);
    font-size: 1.6rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--ds-gold);
  }

  .ficha-acoes,
  .ficha-apelido {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding-top: 4px;
    border-top: 1px solid var(--ds-line);
  }

  /* Sobrou uma ação só nessa barra, e encostada à esquerda ela parecia ter
     perdido a companheira. Vale só aqui: no formulário do apelido o campo
     cresce e ocupa a linha, então centralizar não muda nada. */
  .ficha-acoes {
    justify-content: center;
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

  /* ======== CLASSES E PRESENÇAS ======== */

  /* Os cartões de classe (.classes-cartoes) e a lista de presenças
     (.presencas-lista) moram no global.css: o desenho nasceu aqui, mas hoje a
     edição de membro do painel usa os mesmos. */

  @media (max-width: 420px) {
    .ficha-topo {
      flex-direction: column;
      gap: 10px;
      text-align: center;
    }

    .ficha-id {
      align-items: center;
    }

    /* Os quatro numa linha só, igual à janela de perfil: quem cede é o tamanho
       do rótulo, não a quantidade de colunas. */
    .ficha-stats {
      gap: 5px;
    }

    .ficha-stat {
      padding: 9px 3px;
    }

    .ficha-stat .label {
      font-size: 0.56rem;
      letter-spacing: 0.01em;
    }

    .ficha-stat .value {
      font-size: 1.25rem;
    }
  }
</style>
