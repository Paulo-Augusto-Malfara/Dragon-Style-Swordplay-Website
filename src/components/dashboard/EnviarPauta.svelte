<script lang="ts">
  /*
   * Créditos de feedback na ficha do membro, e a janela que gasta um deles.
   *
   * O saldo NÃO é uma coluna do banco: é o teto do mês menos as pautas que a
   * pessoa já mandou neste mês (ver `meus_creditos_pauta`). Por isso aqui não
   * existe "resetar" nem estado guardado no cliente — depois de enviar, o
   * número é relido do banco, que é o único que sabe contar.
   *
   * O bloco não entra na grade de `.ficha-stats`: aquela grade é de quatro
   * colunas fixas e no celular de 320px os quatro já estão espremidos, um
   * quinto quebraria a linha. Aqui é cartão próprio, largura cheia.
   */
  import { onMount } from "svelte";

  interface Props {
    /* A mesma promessa preguiçosa do MemberDashboard: a página do perfil é
       estática, e um import estático do cliente Supabase é avaliado na passada
       de SSR do build, o que já derrubou a build inteira uma vez. */
    getSupabase: () => Promise<any>;
  }
  const { getSupabase }: Props = $props();

  const CATEGORIAS = [
    { id: "ideia", rotulo: "Ideia" },
    { id: "sugestao", rotulo: "Sugestão" },
    { id: "critica", rotulo: "Crítica" },
    { id: "nova_modalidade", rotulo: "Nova modalidade" },
  ];

  const TITULO_MAX = 120;
  const CORPO_MAX = 4000;
  const OBJETIVO_MAX = 200;

  /* Anexos.
   *
   * Só imagem, e imagem que o navegador redesenha antes de subir: o arquivo
   * escolhido é decodificado pra pixel e re-codificado aqui, então o que sobe
   * é pixel novo. EXIF, comentário escondido e arquivo que é imagem e script ao
   * mesmo tempo não sobrevivem a essa passagem.
   *
   * Isso NÃO é a trava de segurança, porque o navegador é de quem envia. As
   * travas estão no banco: o bucket `pautas-anexos` é privado, aceita só
   * jpeg/png/webp e no máximo 3MB por arquivo, a policy do storage só deixa
   * escrever dentro da pasta do próprio `auth.uid()`, e a `enviar_pauta` confere
   * o teto e o dono de cada caminho. Aqui em cima é comodidade e peso de
   * upload, lá embaixo é a regra. */
  /* O teto é por cargo: staff e acima mandam 10, membro comum 5. Quem recusa de
     verdade é a `enviar_pauta`, que pergunta `is_staff()` no banco; aqui é só
     pra tela não oferecer o que vai ser recusado depois. */
  const ANEXOS_MEMBRO = 5;
  const ANEXOS_STAFF = 10;
  let anexosMax = $state(ANEXOS_MEMBRO);
  const ANEXO_BYTES = 8 * 1024 * 1024; // do arquivo original, antes de redesenhar
  const ANEXO_LADO = 1600; // px no maior lado depois de redesenhar
  const ANEXO_TIPOS = ["image/jpeg", "image/png", "image/webp"];

  let teto = $state(0);
  let saldo = $state(0);
  let carregando = $state(true);

  let dialogo: HTMLDialogElement;
  let categoria = $state("ideia");
  let titulo = $state("");
  let corpo = $state("");
  /* Uma linha dizendo o que a pauta quer melhorar. Opcional, e serve pro staff
     entender a proposta antes de abrir o corpo inteiro na reunião. Vai no mesmo
     `proposta` jsonb que a modalidade usa, que é onde mora o extra estruturado
     de cada categoria. */
  let resumoObjetivo = $state("");
  /* Campos da proposta de modalidade, um item por linha, do mesmo jeito que o
     ModalidadeEditor do painel pede. A descrição não está aqui: ela é o
     `corpo`, que toda pauta tem. */
  let objetivo = $state("");
  let pontuacao = $state("");
  let requisitos = $state("");
  let variacoes = $state("");
  let minParticipantes = $state(0);

  let anexos = $state<{ blob: Blob; previa: string }[]>([]);
  let erroAnexo = $state("");
  let lendoAnexo = $state(false);
  let entradaAnexo: HTMLInputElement | undefined = $state();

  let enviando = $state(false);
  let erro = $state("");

  const ehModalidade = $derived(categoria === "nova_modalidade");
  const podeEnviar = $derived(
    saldo > 0 &&
      titulo.trim().length >= 5 &&
      titulo.trim().length <= TITULO_MAX &&
      corpo.trim().length >= 10 &&
      corpo.trim().length <= CORPO_MAX,
  );

  const linhas = (texto: string) =>
    texto
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

  async function carregar() {
    const supabase = await getSupabase();
    const { data: staff } = await supabase.rpc("is_staff");
    anexosMax = staff ? ANEXOS_STAFF : ANEXOS_MEMBRO;
    const { data } = await supabase.rpc("meus_creditos_pauta");
    if (data) {
      teto = data.teto ?? 0;
      saldo = data.saldo ?? 0;
    }
    carregando = false;
  }

  onMount(carregar);

  function abrir() {
    if (saldo <= 0) return;
    erro = "";
    dialogo.showModal();
  }

  function fechar() {
    if (dialogo.open) dialogo.close();
  }

  /* Decodifica pra pixel e re-codifica. É aqui que o arquivo de origem deixa de
     existir: o que sai é um desenho novo feito pelo navegador. */
  async function redesenhar(file: File): Promise<Blob> {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error("Não foi possível ler essa imagem."));
        i.src = url;
      });

      const escala = Math.min(1, ANEXO_LADO / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * escala);
      canvas.height = Math.round(img.naturalHeight * escala);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas indisponível neste navegador.");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      /* O Safari do iOS exibe webp mas não codifica: o toBlob ignora o tipo
         pedido e devolve PNG calado. A descoberta é num canvas de 1px pra não
         pagar a codificação grande duas vezes, igual ao AvatarUploader. */
      const sonda = document.createElement("canvas");
      sonda.width = 1;
      sonda.height = 1;
      const tipo = sonda.toDataURL("image/webp").startsWith("data:image/webp")
        ? "image/webp"
        : "image/jpeg";

      return await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Falha ao gerar a imagem."))), tipo, 0.85);
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function escolherAnexos(e: Event) {
    const alvo = e.target as HTMLInputElement;
    const arquivos = Array.from(alvo.files ?? []);
    alvo.value = "";
    if (arquivos.length === 0) return;

    erroAnexo = "";
    lendoAnexo = true;
    for (const file of arquivos) {
      if (anexos.length >= anexosMax) {
        erroAnexo = `No máximo ${anexosMax} imagens.`;
        break;
      }
      if (!ANEXO_TIPOS.includes(file.type)) {
        erroAnexo = "Envie imagem JPG, PNG ou WEBP.";
        continue;
      }
      if (file.size > ANEXO_BYTES) {
        erroAnexo = "Imagem muito grande (máximo 8MB).";
        continue;
      }
      try {
        const blob = await redesenhar(file);
        anexos = [...anexos, { blob, previa: URL.createObjectURL(blob) }];
      } catch (err) {
        erroAnexo = err instanceof Error ? err.message : String(err);
      }
    }
    lendoAnexo = false;
  }

  function tirarAnexo(i: number) {
    URL.revokeObjectURL(anexos[i].previa);
    anexos = anexos.filter((_, j) => j !== i);
    erroAnexo = "";
  }

  function limparAnexos() {
    anexos.forEach((a) => URL.revokeObjectURL(a.previa));
    anexos = [];
  }

  /* Sobe antes de criar a pauta, porque o caminho vai como argumento da RPC.
     ponytail: se a pessoa escolher imagem e desistir sem enviar, o arquivo fica
     órfão no bucket privado. São poucos KB num lugar que ninguém lê; se um dia
     incomodar, uma função agendada apaga o que não está citado em `fPautas`. */
  async function subirAnexos(supabase: any): Promise<string[]> {
    if (anexos.length === 0) return [];
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Sessão expirada, entre de novo.");

    const caminhos: string[] = [];
    for (const a of anexos) {
      const ext = a.blob.type === "image/webp" ? "webp" : "jpg";
      const caminho = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("pautas-anexos")
        .upload(caminho, a.blob, { contentType: a.blob.type });
      if (error) throw error;
      caminhos.push(caminho);
    }
    return caminhos;
  }

  async function enviar(e: SubmitEvent) {
    e.preventDefault();
    if (!podeEnviar || enviando) return;
    enviando = true;
    erro = "";

    const supabase = await getSupabase();

    let caminhos: string[] = [];
    try {
      caminhos = await subirAnexos(supabase);
    } catch (err) {
      enviando = false;
      erro = err instanceof Error ? err.message : String(err);
      return;
    }

    const { error } = await supabase.rpc("enviar_pauta", {
      p_categoria: categoria,
      p_titulo: titulo.trim(),
      p_corpo: corpo.trim(),
      p_proposta: ehModalidade
        ? {
            objective: linhas(objetivo),
            scoring_respawn: linhas(pontuacao),
            requirements: linhas(requisitos),
            variations: linhas(variacoes),
            min_participantes: Number(minParticipantes) || 0,
          }
        : resumoObjetivo.trim()
          ? { objetivo: resumoObjetivo.trim() }
          : null,
      p_anexos: caminhos,
    });

    enviando = false;
    if (error) {
      erro = error.message;
      return;
    }

    titulo = "";
    corpo = "";
    resumoObjetivo = "";
    objetivo = "";
    pontuacao = "";
    requisitos = "";
    variacoes = "";
    minParticipantes = 0;
    limparAnexos();
    erroAnexo = "";
    fechar();
    await carregar();
  }

</script>

{#if !carregando}
  <section class="pautas" aria-label="Créditos de feedback">
    {#if teto > 0}
      <button type="button" class="pautas-cartao" onclick={abrir} disabled={saldo <= 0}>
        <span class="pautas-numero">{saldo}<span class="pautas-de">/{teto}</span></span>
        <span class="pautas-texto">
          <span class="pautas-titulo">Créditos de feedback</span>
          <span class="pautas-sub">
            {#if saldo > 0}
              Mande uma ideia, sugestão, crítica ou proponha uma modalidade.
            {:else}
              Seus créditos deste mês acabaram. Volta tudo no dia 1º.
            {/if}
          </span>
          <!-- Aponta pra lista lá no fim da ficha: sem isto o membro comum não
               tem como saber que existe um lugar mostrando o destino do que
               ele mandou. -->
          <span class="pautas-onde">Status dos seus feedbacks no fim desta página.</span>
        </span>
      </button>
    {:else}
      <p class="pautas-vazio">
        Créditos de feedback começam na faixa Amarela, no nível geral 3. Cada
        graduação dali pra frente vale mais um por mês.
      </p>
    {/if}

  </section>
{/if}

<dialog
  bind:this={dialogo}
  class="janela barra-fina"
  aria-label="Nova pauta"
  onclick={(e) => {
    if (e.target === dialogo) fechar();
  }}
>
  <div class="janela-barra">
    <button type="button" class="janela-fechar" onclick={fechar} aria-label="Fechar">✕</button>
  </div>

  <form class="admin-form" onsubmit={enviar}>
    <p class="admin-form-titulo">Do que se trata</p>
    <div class="cats">
      {#each CATEGORIAS as c (c.id)}
        <button
          type="button"
          class="cat"
          class:cat--ativa={categoria === c.id}
          onclick={() => (categoria = c.id)}
        >
          {c.rotulo}
        </button>
      {/each}
    </div>

    <div class="campos">
      <label class="campo-largo">
        Título
        <input type="text" bind:value={titulo} maxlength={TITULO_MAX} required />
        <small>{titulo.trim().length}/{TITULO_MAX}</small>
      </label>

      {#if !ehModalidade}
        <label class="campo-largo">
          Objetivo (opcional)
          <input type="text" bind:value={resumoObjetivo} maxlength={OBJETIVO_MAX} />
          <small>
            Resuma em poucas palavras o que essa {CATEGORIAS.find((c) => c.id === categoria)
              ?.rotulo.toLowerCase()} almeja melhorar ou corrigir.
          </small>
        </label>
      {/if}

      <label class="campo-largo">
        {ehModalidade ? "Como a modalidade funciona" : "Escreva com calma"}
        <textarea bind:value={corpo} rows={ehModalidade ? 5 : 9} maxlength={CORPO_MAX}></textarea>
        <small>{corpo.trim().length}/{CORPO_MAX}</small>
      </label>
    </div>

    <p class="admin-form-titulo">Imagens (opcional)</p>
    <p class="admin-form-nota">
      Até {anexosMax} imagens pra ilustrar o que você escreveu.
    </p>
    <div class="anexos-escolha">
      {#each anexos as a, i (a.previa)}
        <div class="anexo-item">
          <img src={a.previa} alt="" />
          <button type="button" class="anexo-tirar" onclick={() => tirarAnexo(i)} aria-label="Tirar esta imagem">
            ✕
          </button>
        </div>
      {/each}

      {#if anexos.length < anexosMax}
        <button
          type="button"
          class="anexo-add"
          onclick={() => entradaAnexo?.click()}
          disabled={lendoAnexo}
        >
          {lendoAnexo ? "..." : "+"}
        </button>
      {/if}
    </div>
    <input
      bind:this={entradaAnexo}
      type="file"
      accept="image/jpeg,image/png,image/webp"
      multiple
      class="anexo-entrada"
      onchange={escolherAnexos}
    />
    {#if erroAnexo}
      <p class="admin-error" role="alert">{erroAnexo}</p>
    {/if}

    {#if ehModalidade}
      <p class="admin-form-titulo">Regras da modalidade</p>
      <p class="admin-form-nota">
        Um item por linha. Nada disso vai pro site agora: é a proposta que o
        staff lê na reunião. O endereço da página quem escolhe é quem publica.
      </p>
      <div class="campos">
        <label>
          Objetivo e condição de vitória
          <textarea bind:value={objetivo} rows="3"></textarea>
        </label>
        <label>
          Pontuação e respawn
          <textarea bind:value={pontuacao} rows="3"></textarea>
        </label>
        <label>
          Requisitos e armas permitidas
          <textarea bind:value={requisitos} rows="3"></textarea>
        </label>
        <label>
          Regras específicas e variações
          <textarea bind:value={variacoes} rows="3"></textarea>
        </label>
        <label>
          Mínimo de participantes
          <input type="number" bind:value={minParticipantes} min="0" max="200" step="1" />
        </label>
      </div>
    {/if}

    <div class="form-acoes">
      <button type="submit" class="btn btn-primary" disabled={!podeEnviar || enviando}>
        {enviando ? "Enviando..." : "Gastar 1 crédito e mandar"}
      </button>
      <button type="button" class="btn btn-ghost" onclick={fechar}>Cancelar</button>
    </div>

    {#if erro}
      <p class="admin-error" role="alert">{erro}</p>
    {/if}
  </form>
</dialog>

<style>
  /* Ver a mesma nota em PautasMural: o `p { width: 90%; margin: auto }` do
     global.css é pra texto corrido de página, e dentro de cartão ele encolhe e
     centraliza o parágrafo. */
  p {
    width: 100%;
    margin: 0;
  }

  .pautas {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  /* Miniatura quadrada com o ✕ no canto, e o quadro do "+" do mesmo tamanho:
     a fileira continua alinhada com uma imagem só ou com cinco. */
  .anexos-escolha {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .anexo-item {
    position: relative;
    width: 72px;
    height: 72px;
    border: 1px solid var(--ds-line);
    border-radius: 10px;
    overflow: hidden;
  }

  .anexo-item img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .anexo-tirar {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: rgba(11, 16, 22, 0.8);
    color: var(--ds-text-1);
    font-size: 0.75rem;
    line-height: 1;
    cursor: pointer;
  }

  .anexo-add {
    width: 72px;
    height: 72px;
    border: 1px dashed var(--ds-line-strong);
    border-radius: 10px;
    background: none;
    color: var(--ds-text-3);
    font-size: 1.5rem;
    line-height: 1;
    cursor: pointer;
  }

  .anexo-add:disabled {
    cursor: default;
    opacity: 0.6;
  }

  .anexo-entrada {
    display: none;
  }

  .pautas-cartao {
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
    padding: 12px 14px;
    border: 1px solid var(--ds-line);
    border-radius: 12px;
    background: var(--ds-bg);
    color: inherit;
    text-align: left;
    cursor: pointer;
  }

  .pautas-cartao:disabled {
    cursor: default;
    opacity: 0.65;
  }

  /* Número dourado em Cinzel, rótulo apagado: a mesma hierarquia do
     `.ficha-stat` logo acima, pra não parecer outro sistema. */
  .pautas-numero {
    flex: none;
    font-family: var(--ds-font-display);
    font-size: 1.6rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--ds-gold);
  }

  .pautas-de {
    font-size: 0.9rem;
    color: var(--ds-text-4);
  }

  .pautas-texto {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .pautas-titulo {
    font-size: 0.9rem;
  }

  .pautas-onde {
    display: block;
    margin-top: 3px;
    font-size: 0.74rem;
    color: var(--ds-gold-light);
  }

  .pautas-sub,
  .pautas-vazio {
    font-size: 0.78rem;
    color: var(--ds-text-4);
  }

  .cats {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .cat {
    padding: 6px 12px;
    border: 1px solid var(--ds-line);
    border-radius: 999px;
    background: var(--ds-bg);
    color: var(--ds-text-3);
    font-size: 0.82rem;
    cursor: pointer;
  }

  .cat--ativa {
    border-color: var(--ds-gold);
    color: var(--ds-gold);
  }
</style>
