<script lang="ts">
  /*
   * Mural de pautas.
   *
   * Duas votações moram aqui e são coisas diferentes:
   *
   * 1. Voto de PRIORIDADE (fPautaVotos): 3 por staff por reunião, decide quais
   *    pautas entram na reunião. Abre quando a reunião é agendada e fecha 24h
   *    antes dela, e é a `pauta_votacao_aberta` no banco que manda -- o que
   *    esta tela desenha é só o aviso. Nunca deixe só o lado da tela.
   *
   * 2. Voto de DECISÃO (fPautaDecisaoVotos): acontece durante a reunião, o
   *    organizador abre e fecha, e é o que define o desfecho. As opções mudam
   *    conforme a rodada: pauta na fila decide mérito (validada/recusada/
   *    adiada), modalidade em teste decide o fim do teste (aprovada/recusada/
   *    mais tempo).
   *
   * Tudo que aparece na tela é texto puro por interpolação, que o Svelte
   * escapa. Nenhum `{@html}` aqui, e não introduza um.
   */
  import { onMount, onDestroy } from "svelte";
  import { supabase } from "../../lib/supabase-browser";
  import ConfirmarAcao from "./ConfirmarAcao.svelte";
  import AnexosPauta from "../AnexosPauta.svelte";

  interface Props {
    isOrganizador: boolean;
    isAdminSistema: boolean;
  }
  const { isOrganizador, isAdminSistema }: Props = $props();

  const CATEGORIA: Record<string, string> = {
    ideia: "Ideia",
    sugestao: "Sugestão",
    critica: "Crítica",
    nova_modalidade: "Nova modalidade",
  };

  const STATUS: Record<string, string> = {
    aberta: "Na fila",
    em_teste: "Em teste",
    validada: "Aprovada",
    recusada: "Recusada",
    // Status `aprovada` só existe depois que a modalidade virou página e o PH
    // foi pago, então o selo diz isso em vez de repetir "Aprovada", que é o
    // selo do passo anterior.
    aprovada: "Publicada",
    arquivada: "Arquivada",
  };

  /* Rótulo de cada opção de decisão, por rodada. */
  /* `rotulo` é o desfecho, e nomeia o voto. `verbo` é a ordem que o organizador
     dá ao encerrar, e por isso os botões de encerrar não repetem "encerrar
     como" três vezes. */
  const OPCOES_MERITO = [
    { id: "validada", rotulo: "Aprovada", verbo: "Aprovar" },
    { id: "recusada", rotulo: "Recusada", verbo: "Recusar" },
    { id: "adiada", rotulo: "Adiada", verbo: "Adiar" },
  ];
  const OPCOES_TESTE = [
    { id: "aprovada", rotulo: "Efetivada", verbo: "Efetivar" },
    { id: "recusada", rotulo: "Recusada", verbo: "Recusar" },
    { id: "mais_teste", rotulo: "Mais tempo de teste", verbo: "Dar mais tempo" },
  ];

  let pautas = $state<any[]>([]);
  let reuniao = $state<any>(null);
  let euId = $state<number | null>(null);
  let carregando = $state(true);
  let erro = $state("");
  let filtro = $state<"fila" | "teste" | "arquivo">("fila");

  let abertaId = $state<number | null>(null);
  let comentarios = $state<any[]>([]);
  /* Comentário longo entra cortado em duas linhas. `cortados` guarda quem de
     fato transbordou, medido no elemento, porque contar caractere não sabe a
     largura da janela; `expandidos` guarda quem o leitor já abriu. */
  let cortados = $state(new Set<number>());
  let expandidos = $state(new Set<number>());
  /* Comentário que a caixa está respondendo, ou nulo pra comentário solto. */
  let respondendoA = $state<number | null>(null);
  /* Comentário em edição e o texto que está sendo mexido. */
  let editandoId = $state<number | null>(null);
  let rascunho = $state("");
  /* Texto da resposta em curso. Separado do `mensagem`, que é da caixa lá
     embaixo: as duas podem estar preenchidas ao mesmo tempo. */
  let resposta = $state("");
  /* Só pra tela avisar que o texto de antes voltou. */
  let temRascunho = $state(false);
  /* Raízes com as respostas à mostra. Fechado é o padrão: a discussão fica
     limpa e quem quiser abre. */
  let respostasAbertas = $state(new Set<number>());
  let decisaoVotos = $state<any[]>([]);
  let mensagem = $state("");
  let ocupado = $state(false);
  let dialogo: HTMLDialogElement;
  let confirmar: ConfirmarAcao;
  let canal: any = null;
  let canalLista: any = null;
  let agora = $state(Date.now());
  let tique: ReturnType<typeof setInterval> | undefined;

  const aberta = $derived(pautas.find((p) => p.id_pauta === abertaId) ?? null);

  const janelaFecha = $derived(
    reuniao ? new Date(reuniao.data_hora).getTime() - 24 * 3600 * 1000 : 0,
  );
  const janelaAberta = $derived(!!reuniao && agora < janelaFecha);

  /* Quais pautas de fato entram na reunião.
   *
   * Enquanto a janela de voto está aberta a ordem ainda muda a cada voto, então
   * marcar as três primeiras seria anunciar um resultado que ninguém decidiu
   * ainda. O selo só aparece depois que a janela fecha, 24h antes da reunião, e
   * aí ele é o resultado da votação.
   *
   * O `!!p.posicao` não é enfeite: a view devolve `posicao` nula pra pauta sem
   * reunião, e em JavaScript `null <= 3` é verdadeiro. Sem ele, pauta nenhuma
   * amarrada a reunião nenhuma apareceria como pauta da reunião.
   *
   * Urgente entra por fora: a view põe as prioritárias nas primeiras posições,
   * então somar quantas são ao corte deixa as três mais votadas entrando
   * inteiras. Marcar duas urgentes faz a reunião ter cinco pautas, e é isso
   * mesmo, o voto do staff não perde vaga pra decisão do admin. */
  const daReuniao = (p: any) =>
    filtro === "fila" && !janelaAberta && !!p.posicao && p.posicao <= VAGAS_VOTADAS + urgentes;

  const naFila = $derived(pautas.filter((p) => p.status === "aberta"));

  /* As três vagas que a votação de prioridade decide. */
  const VAGAS_VOTADAS = 3;

  /* A marca de urgente só diz alguma coisa enquanto a pauta espera reunião.
     Depois de decidida ela continua gravada, e repetir o selo no arquivo seria
     anunciar uma pressa que já passou. */
  const urgente = (p: any) => p.prioritaria && ["aberta", "em_teste"].includes(p.status);
  const urgentes = $derived(naFila.filter((p) => p.prioritaria && !!p.posicao).length);
  const emTeste = $derived(pautas.filter((p) => p.status === "em_teste"));
  const arquivo = $derived(
    pautas.filter((p) => !["aberta", "em_teste"].includes(p.status)),
  );
  const visiveis = $derived(
    filtro === "fila" ? naFila : filtro === "teste" ? emTeste : arquivo,
  );

  /* O teto é o mesmo da `votar_pauta` no banco, que é quem recusa de verdade.
     Aqui ele só desenha e desabilita o botão. */
  const VOTOS_POR_REUNIAO = 3;

  /* Votos que a pessoa já gastou nesta reunião. Sai da própria lista, e não de
     uma consulta à parte, pra não existirem dois números que podem divergir. */
  const votosUsados = $derived(naFila.filter((p) => p.votei).length);

  async function carregar() {
    const [lista, prox, eu] = await Promise.all([
      // Urgente na frente, senão o cartão que a view numerou em primeiro lugar
      // apareceria lá embaixo por não ter voto nenhum.
      supabase
        .from("v_pautas_mural")
        .select("*")
        .order("prioritaria", { ascending: false })
        .order("votos", { ascending: false }),
      supabase
        .from("fReunioes")
        .select("id_reuniao, data_hora, local, status")
        .eq("status", "agendada")
        .gt("data_hora", new Date().toISOString())
        .order("data_hora")
        .limit(1)
        .maybeSingle(),
      supabase.rpc("current_membro_id"),
    ]);
    erro = lista.error?.message ?? "";
    pautas = lista.data ?? [];
    reuniao = prox.data ?? null;
    euId = eu.data ?? null;
    carregando = false;
  }

  /* A lista inteira ao vivo: pauta nova aparece sozinha, e o contador de voto
     de cada card acompanha quem votou do outro lado. É um canal separado do
     canal da pauta aberta, que assina só o que é daquela pauta.

     O `recarregar` espera 400ms antes de ir ao banco porque durante a reunião
     os votos chegam em rajada, e cada linha nova dispararia uma consulta da
     lista inteira. Uma consulta depois da rajada mostra o mesmo número. */
  let esperandoRecarga: ReturnType<typeof setTimeout> | undefined;
  function recarregar() {
    if (esperandoRecarga) clearTimeout(esperandoRecarga);
    esperandoRecarga = setTimeout(carregar, 400);
  }

  onMount(() => {
    carregar();
    tique = setInterval(() => (agora = Date.now()), 30_000);
    canalLista = supabase
      .channel("pautas-lista")
      .on("postgres_changes", { event: "*", schema: "public", table: "fPautas" }, recarregar)
      .on("postgres_changes", { event: "*", schema: "public", table: "fPautaVotos" }, recarregar)
      .subscribe();
  });

  onDestroy(() => {
    if (tique) clearInterval(tique);
    if (esperandoRecarga) clearTimeout(esperandoRecarga);
    if (canal) supabase.removeChannel(canal);
    if (canalLista) supabase.removeChannel(canalLista);
  });

  /* Rascunho do que a pessoa estava escrevendo, guardado no próprio navegador
     dela. Fechar a janela sem querer, clicando fora ou no Esc, deixou de
     custar o texto. Não vai pro banco de propósito: rascunho não é comentário,
     ninguém mais precisa ver, e assim não existe meio-comentário na discussão
     de uma reunião. */
  const chaveRascunho = (id: number) => `ds:pauta-rascunho:${id}`;

  function guardarRascunho() {
    if (!abertaId) return;
    const vale = mensagem.trim() || resposta.trim();
    if (vale) {
      localStorage.setItem(
        chaveRascunho(abertaId),
        JSON.stringify({ mensagem, resposta, respondendoA }),
      );
    } else {
      localStorage.removeItem(chaveRascunho(abertaId));
    }
  }

  function recuperarRascunho(id: number) {
    const cru = localStorage.getItem(chaveRascunho(id));
    if (!cru) return false;
    try {
      const r = JSON.parse(cru);
      mensagem = r.mensagem ?? "";
      resposta = r.resposta ?? "";
      respondendoA = r.respondendoA ?? null;
      return true;
    } catch {
      localStorage.removeItem(chaveRascunho(id));
      return false;
    }
  }

  $effect(() => {
    // Lê os três pra reagir a qualquer um deles.
    void mensagem;
    void resposta;
    void respondendoA;
    if (abertaId) guardarRascunho();
  });

  async function abrirPauta(id: number) {
    abertaId = id;
    comentarios = [];
    cortados = new Set();
    expandidos = new Set();
    respondendoA = null;
    editandoId = null;
    respostasAbertas = new Set();
    decisaoVotos = [];
    mensagem = "";
    resposta = "";
    temRascunho = recuperarRascunho(id);
    dialogo.showModal();
    await carregarConversa(id);

    if (canal) supabase.removeChannel(canal);
    // Discussão e apuração ao vivo: durante a reunião todo mundo está com a
    // mesma pauta aberta, e recarregar na mão não é opção.
    canal = supabase
      .channel(`pauta-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "fPautaComentarios", filter: `id_pauta=eq.${id}` },
        () => carregarConversa(id),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "fPautaDecisaoVotos", filter: `id_pauta=eq.${id}` },
        () => carregarConversa(id),
      )
      .subscribe();
  }

  const totalRespostas = $derived(comentarios.filter((c) => c.responde_a).length);
  const totalRaizes = $derived(comentarios.length - totalRespostas);

  /* A conversa é desenhada em um nível só: raiz e as respostas dela. O banco
     também achata, então aqui não existe resposta de resposta pra tratar. */
  const conversa = $derived(
    comentarios
      .filter((c) => !c.responde_a)
      .map((raiz) => ({
        ...raiz,
        respostas: comentarios.filter((c) => c.responde_a === raiz.id_comentario),
      })),
  );

  async function carregarConversa(id: number) {
    const [cs, ds] = await Promise.all([
      supabase
        .from("fPautaComentarios")
        .select("id_comentario, mensagem, criado_em, editado_em, id_membro, responde_a, dMembros(nome, apelido)")
        .eq("id_pauta", id)
        .order("criado_em"),
      supabase.from("fPautaDecisaoVotos").select("id_membro, opcao").eq("id_pauta", id),
    ]);
    comentarios = cs.data ?? [];
    decisaoVotos = ds.data ?? [];
  }

  function fechar() {
    guardarRascunho();
    if (canal) {
      supabase.removeChannel(canal);
      canal = null;
    }
    abertaId = null;
    if (dialogo.open) dialogo.close();
  }

  async function chamar(fn: string, args: Record<string, unknown>, recarregarConversa = false) {
    ocupado = true;
    erro = "";
    const { error } = await supabase.rpc(fn, args);
    ocupado = false;
    if (error) {
      erro = error.message;
      return false;
    }
    await carregar();
    if (recarregarConversa && abertaId) await carregarConversa(abertaId);
    return true;
  }

  const votar = (p: any) =>
    chamar(p.votei ? "desvotar_pauta" : "votar_pauta", { p_id_pauta: p.id_pauta });

  /* Uma medida só, quando o parágrafo entra na tela: com o corte aplicado,
     scrollHeight maior que a altura visível quer dizer que sobrou texto. */
  function medirCorte(node: HTMLElement, id: number) {
    if (node.scrollHeight - node.clientHeight > 2) cortados = new Set(cortados).add(id);
  }

  /* A caixa nasce com o cursor dentro: quem clicou em Responder ou Editar já
     quer digitar, e no celular isso é o teclado subindo sozinho. */
  function focar(node: HTMLTextAreaElement) {
    node.focus();
  }

  function alternarRespostas(id: number) {
    const novo = new Set(respostasAbertas);
    if (!novo.delete(id)) novo.add(id);
    respostasAbertas = novo;
  }

  function responder(c: any) {
    respondendoA = c.id_comentario;
    editandoId = null;
    resposta = "";
    // Responder a uma resposta pendura na mesma raiz, igual ao banco faz.
    respostasAbertas = new Set(respostasAbertas).add(c.responde_a ?? c.id_comentario);
  }

  function editarComentario(c: any) {
    editandoId = c.id_comentario;
    rascunho = c.mensagem;
    respondendoA = null;
  }

  async function salvarEdicao() {
    const texto = rascunho.trim();
    if (!texto || !editandoId || ocupado) return;
    // Salvar sem ter mudado nada não pode carimbar "editado" à toa.
    const antes = comentarios.find((c) => c.id_comentario === editandoId)?.mensagem;
    if (texto === antes) {
      editandoId = null;
      return;
    }
    const ok = await chamar(
      "editar_comentario",
      { p_id_comentario: editandoId, p_mensagem: texto },
      true,
    );
    if (ok) editandoId = null;
  }

  async function apagarComentario(c: any) {
    const ok = await confirmar.pedir({
      titulo: "Apagar seu comentário?",
      texto: "Ele some da discussão para todo mundo, e isso não tem volta.",
      acao: "Apagar",
      perigo: true,
    });
    if (!ok) return;
    await chamar("excluir_comentario", { p_id_comentario: c.id_comentario }, true);
  }

  function alternar(id: number) {
    const novo = new Set(expandidos);
    if (!novo.delete(id)) novo.add(id);
    expandidos = novo;
  }

  async function enviarResposta() {
    const texto = resposta.trim();
    if (!texto || !abertaId || ocupado) return;
    const ok = await chamar(
      "comentar_pauta",
      { p_id_pauta: abertaId, p_mensagem: texto, p_responde_a: respondendoA },
      true,
    );
    if (ok) {
      resposta = "";
      respondendoA = null;
      temRascunho = false;
    }
  }

  async function comentar(e: SubmitEvent) {
    e.preventDefault();
    const texto = mensagem.trim();
    if (!texto || ocupado || !abertaId) return;
    if (await chamar("comentar_pauta", { p_id_pauta: abertaId, p_mensagem: texto }, true)) {
      mensagem = "";
      temRascunho = false;
    }
  }

  /* Desfecho que nega ou empurra a ideia precisa de motivo, e quem lê é quem
     escreveu a pauta. Pela contagem o desfecho ainda não se sabe, então o
     campo aparece do mesmo jeito, opcional na tela e exigido pelo banco se
     cair num deles. */
  const PRECISA_MOTIVO = ["recusada", "adiada", "mais_teste"];

  async function fecharDecisao(override: string | null) {
    if (!abertaId) return;
    const exige = !!override && PRECISA_MOTIVO.includes(override);

    const motivo = await confirmar.pedirComTexto({
      titulo: override ? `Encerrar a votação como "${rotuloOpcao(override)}"?` : "Encerrar a votação?",
      texto: override
        ? "O desfecho fica registrado como escolha do organizador, e não como resultado da contagem."
        : "Vale a opção mais votada. Se der empate, você escolhe.",
      acao: "Encerrar",
      campo: {
        rotulo: exige ? "Motivo da decisão" : "Motivo da decisão (se for recusar ou adiar)",
        obrigatorio: exige,
        dica: "Quem escreveu a pauta vai ler isto no perfil dele.",
      },
    });
    if (motivo === null) return;
    await chamar(
      "fechar_decisao",
      { p_id_pauta: abertaId, p_override: override, p_motivo: motivo || null },
      true,
    );
  }

  async function reabrirDecisao() {
    if (!abertaId) return;
    const ok = await confirmar.pedir({
      titulo: "Reabrir a votação desta pauta?",
      texto:
        "A pauta volta ao estado de antes da decisão e a votação abre de novo. Se o desfecho tinha sido Adiar, os votos de prioridade já foram apagados e não voltam.",
      acao: "Reabrir",
    });
    if (!ok) return;
    await chamar("reabrir_decisao", { p_id_pauta: abertaId }, true);
  }

  /* Marcar e desmarcar é a mesma chamada, e nenhuma das duas é irreversível:
     sem janela de confirmação. Quem pode é o admin do sistema, e a
     `priorizar_pauta` recusa qualquer outro. */
  const priorizar = () =>
    chamar("priorizar_pauta", { p_id_pauta: abertaId, p_ligar: !aberta.prioritaria }, true);

  async function arquivar() {
    if (!abertaId) return;
    const ok = await confirmar.pedir({
      titulo: "Arquivar esta pauta?",
      texto: "Ela sai da fila sem passar por reunião. O crédito do autor não volta.",
      acao: "Arquivar",
      perigo: true,
    });
    if (!ok) return;
    if (await chamar("arquivar_pauta", { p_id_pauta: abertaId })) fechar();
  }

  /* Cada desfecho tem uma cor, e ela é a mesma no voto e no resultado: verde
     pra quem passa, vermelho pra quem cai, cinza pra quem fica esperando. */
  const COR_DA_OPCAO: Record<string, string> = {
    validada: "sim",
    aprovada: "sim",
    recusada: "nao",
    adiada: "espera",
    mais_teste: "espera",
  };

  const opcoesDa = (p: any) => (p.status === "em_teste" ? OPCOES_TESTE : OPCOES_MERITO);

  /* Depois de decidida a pauta já mudou de status, então a rodada não sai mais
     dele: sai do desfecho gravado. "Recusada" existe nas duas, e aí o empate
     de nome cai na de mérito, que é a mais comum. */
  const opcoesDoDesfecho = (p: any) =>
    OPCOES_TESTE.some((o) => o.id === p.decisao) && !OPCOES_MERITO.some((o) => o.id === p.decisao)
      ? OPCOES_TESTE
      : OPCOES_MERITO;
  const rotuloOpcao = (id: string) =>
    [...OPCOES_MERITO, ...OPCOES_TESTE].find((o) => o.id === id)?.rotulo ?? id;
  const contar = (opcao: string) => decisaoVotos.filter((v) => v.opcao === opcao).length;
  const meuVoto = $derived(decisaoVotos.find((v) => v.id_membro === euId)?.opcao ?? null);

  /* Prazo do admin pra desfazer um engano. O banco recusa depois disso, aqui
     só some com o botão. */
  const HORAS_PRA_REABRIR = 24;

  const podeReabrir = $derived(
    !!aberta?.decidida_em &&
      isAdminSistema &&
      agora - new Date(aberta.decidida_em).getTime() < HORAS_PRA_REABRIR * 3600 * 1000,
  );

  const nomeDe = (m: any) => (m?.apelido?.trim() ? m.apelido : (m?.nome ?? "Alguém"));

  const dataHoraBR = (d: string) =>
    new Date(d).toLocaleString("pt-BR", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  const horaBR = (d: string) =>
    new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  /* Quanto falta pra janela fechar, em dia e hora. Sem segundos: o número não
     precisa de precisão, precisa de "dá tempo" ou "não dá". */
  function faltam(alvo: number) {
    const ms = alvo - agora;
    if (ms <= 0) return "";
    const horas = Math.floor(ms / 3600000);
    const dias = Math.floor(horas / 24);
    if (dias >= 1) return `${dias}d ${horas % 24}h`;
    if (horas >= 1) return `${horas}h`;
    return `${Math.max(Math.floor(ms / 60000), 1)}min`;
  }

  const linhasDe = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);
</script>

<ConfirmarAcao bind:this={confirmar} />

{#if carregando}
  <div class="esqueleto esqueleto-form"></div>
{:else}
  <section class="cabeca">
    {#if reuniao}
      <p class="cabeca-linha">
        <span class="cabeca-rotulo">Próxima reunião</span>
        <span class="cabeca-valor">{dataHoraBR(reuniao.data_hora)}</span>
        {#if reuniao.local}<span class="cabeca-local">{reuniao.local}</span>{/if}
      </p>
      {#if janelaAberta}
        <!-- Mesmo par número+rótulo do cartão de créditos do perfil: o staff
             precisa bater o olho e saber quantos votos ainda tem na mão. -->
        <div class="votos-saldo">
          <span class="votos-numero">{VOTOS_POR_REUNIAO - votosUsados}<span class="votos-de"
              >/{VOTOS_POR_REUNIAO}</span
            ></span>
          <span class="votos-texto">
            <span class="votos-titulo">
              {VOTOS_POR_REUNIAO - votosUsados === 1 ? "voto restante" : "votos restantes"}
            </span>
            <span class="votos-sub">
              {#if votosUsados >= VOTOS_POR_REUNIAO}
                Você já usou os {VOTOS_POR_REUNIAO}. Tire um voto para mover para outra pauta.
              {:else}
                A votação fecha em {faltam(janelaFecha)}.
              {/if}
            </span>
          </span>
        </div>
      {:else}
        <p class="cabeca-sub">Votação encerrada: falta menos de 24h para a reunião.</p>
      {/if}
    {:else}
      <p class="cabeca-sub">
        Nenhuma reunião agendada. As pautas ficam esperando, e a votação só abre
        quando um organizador marcar a próxima na Agenda.
      </p>
    {/if}
  </section>

  <div class="abas" role="tablist">
    <button
      type="button"
      role="tab"
      class="aba"
      class:aba--ativa={filtro === "fila"}
      aria-selected={filtro === "fila"}
      onclick={() => (filtro = "fila")}>Fila ({naFila.length})</button
    >
    <button
      type="button"
      role="tab"
      class="aba"
      class:aba--ativa={filtro === "teste"}
      aria-selected={filtro === "teste"}
      onclick={() => (filtro = "teste")}>Em teste ({emTeste.length})</button
    >
    <button
      type="button"
      role="tab"
      class="aba"
      class:aba--ativa={filtro === "arquivo"}
      aria-selected={filtro === "arquivo"}
      onclick={() => (filtro = "arquivo")}>Decididas ({arquivo.length})</button
    >
  </div>

  {#if erro}
    <p class="admin-error" role="alert">{erro}</p>
  {/if}

  {#if visiveis.length === 0}
    <p class="vazio">Nada por aqui ainda.</p>
  {:else}
    <ul class="cards">
      {#each visiveis as p (p.id_pauta)}
        <li class="card" class:card--principal={daReuniao(p)}>
          <button type="button" class="card-corpo" onclick={() => abrirPauta(p.id_pauta)}>
            <span class="card-tags">
              <span class="status-badge status-badge--{p.status}">{STATUS[p.status]}</span>
              <span class="tag">{CATEGORIA[p.categoria]}</span>
              {#if urgente(p)}
                <span class="tag tag--urgente">Urgente</span>
              {/if}
              {#if daReuniao(p)}
                <span class="tag tag--principal">Pauta da reunião</span>
              {/if}
            </span>
            <span class="card-titulo">{p.titulo}</span>
            <span class="card-meta">
              {p.autor} · {p.comentarios} comentário{p.comentarios === 1 ? "" : "s"}
              {#if p.decisao_aberta_em}· <strong>votação aberta</strong>{/if}
            </span>
          </button>

          {#if p.status === "aberta"}
            <div class="card-voto">
              <span class="card-votos">{p.votos}</span>
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                disabled={!janelaAberta || ocupado || (!p.votei && votosUsados >= VOTOS_POR_REUNIAO)}
                onclick={() => votar(p)}
              >
                {p.votei ? "Tirar voto" : "Votar"}
              </button>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
{/if}

<dialog
  bind:this={dialogo}
  class="janela janela--larga barra-fina"
  aria-label="Pauta"
  onclick={(e) => {
    if (e.target === dialogo) fechar();
  }}
>
  <div class="janela-barra">
    <button type="button" class="janela-fechar" onclick={fechar} aria-label="Fechar">✕</button>
  </div>

  {#if aberta}
    <!-- A janela empilha bloco atrás de bloco, e o reset do site zera a margem
         de tudo: sem esta casca com gap, título, corpo, proposta, votação e
         discussão colam uns nos outros. -->
    <div class="det">
    <span class="card-tags">
      <span class="status-badge status-badge--{aberta.status}">{STATUS[aberta.status]}</span>
      <span class="tag">{CATEGORIA[aberta.categoria]}</span>
      {#if urgente(aberta)}
        <span class="tag tag--urgente">Urgente</span>
      {/if}
    </span>
    <h2 class="det-titulo">{aberta.titulo}</h2>
    <p class="det-autor">Por {aberta.autor} · {horaBR(aberta.criada_em)}</p>

    {#if aberta.categoria !== "nova_modalidade" && aberta.proposta?.objetivo}
      <p class="det-rotulo">Objetivo</p>
      <p class="det-corpo">{aberta.proposta.objetivo}</p>
      <p class="det-rotulo">O que foi escrito</p>
    {/if}

    <p class="det-corpo">{aberta.corpo}</p>

    {#if aberta.categoria === "nova_modalidade" && aberta.proposta}
      <div class="det-proposta">
        {#each [["Objetivo e condição de vitória", "objective"], ["Pontuação e respawn", "scoring_respawn"], ["Requisitos e armas", "requirements"], ["Regras e variações", "variations"]] as [rotulo, chave] (chave)}
          {#if linhasDe(aberta.proposta[chave]).length > 0}
            <p class="det-rotulo">{rotulo}</p>
            <ul class="det-lista">
              {#each linhasDe(aberta.proposta[chave]) as item, i (i)}
                <li>{item}</li>
              {/each}
            </ul>
          {/if}
        {/each}
        {#if aberta.proposta.min_participantes}
          <p class="det-rotulo">Mínimo de participantes: {aberta.proposta.min_participantes}</p>
        {/if}
      </div>
    {/if}

    <AnexosPauta caminhos={aberta.anexos} cliente={supabase} />

    {#if isAdminSistema && aberta.status === "validada" && aberta.categoria === "nova_modalidade" && !aberta.id_modalidade}
      <p class="det-publicar">
        Efetivada depois do teste, esperando virar página.
        <a class="btn btn-primary" href={`/admin/modalidades/new?pauta=${aberta.id_pauta}`}>
          Publicar modalidade
        </a>
      </p>
    {/if}

    <!-- 2ª votação: só existe durante a reunião, e só o organizador abre e
         fecha. O staff vê a apuração ao vivo enquanto discute. -->
    {#if aberta.decisao_aberta_em}
      <section class="decisao">
        <p class="det-rotulo">Votação em curso</p>
        <p class="decisao-nota">Clique na sua escolha. Dá pra trocar enquanto a votação estiver aberta.</p>
        <div class="decisao-opcoes">
          {#each opcoesDa(aberta) as o (o.id)}
            <button
              type="button"
              class="decisao-opcao decisao-opcao--{COR_DA_OPCAO[o.id]}"
              class:decisao-opcao--minha={meuVoto === o.id}
              disabled={ocupado}
              aria-pressed={meuVoto === o.id}
              onclick={() =>
                chamar("votar_decisao", { p_id_pauta: aberta.id_pauta, p_opcao: o.id }, true)}
            >
              <span class="decisao-rotulo">{o.rotulo}</span>
              <span class="decisao-contagem">{contar(o.id)}</span>
            </button>
          {/each}
        </div>

        {#if isOrganizador}
          <div class="decisao-encerrar">
            <p class="decisao-aviso">
              Atenção: qualquer botão daqui de baixo encerra a votação na hora e
              aplica o desfecho na pauta.
            </p>
            <div class="decisao-fechar">
              <button type="button" class="btn btn-primary btn-sm" disabled={ocupado} onclick={() => fecharDecisao(null)}>
                Encerrar pela contagem
              </button>
              <span class="decisao-fechar-manual">
                {#each opcoesDa(aberta) as o (o.id)}
                  <button
                    type="button"
                    class="btn btn-ghost btn-sm"
                    disabled={ocupado}
                    onclick={() => fecharDecisao(o.id)}
                  >
                    {o.verbo}
                  </button>
                {/each}
              </span>
            </div>
          </div>
        {/if}
      </section>
    {:else if isOrganizador && ["aberta", "em_teste"].includes(aberta.status)}
      <div class="det-acoes">
        <button
          type="button"
          class="btn"
          disabled={ocupado || !aberta.id_reuniao}
          onclick={() => chamar("abrir_decisao", { p_id_pauta: aberta.id_pauta }, true)}
        >
          Abrir votação de decisão
        </button>
        <button type="button" class="btn btn-ghost btn-sm" disabled={ocupado} onclick={arquivar}>
          Arquivar
        </button>
        {#if isAdminSistema}
          <button type="button" class="btn btn-ghost btn-sm" disabled={ocupado} onclick={priorizar}>
            {aberta.prioritaria ? "Tirar a urgência" : "Marcar como urgente"}
          </button>
        {/if}
      </div>
      {#if isAdminSistema}
        <p class="det-nota">
          {#if aberta.prioritaria}
            Urgente: esta pauta entra na reunião por fora das três mais votadas.
          {:else}
            Urgente leva a pauta pra reunião sem depender de voto, por fora das três
            mais votadas.
          {/if}
        </p>
      {/if}
      {#if !aberta.id_reuniao}
        <p class="det-nota">A pauta só entra em votação depois de entrar na fila de uma reunião.</p>
      {/if}
    {:else if aberta.decisao}
      <!-- Votação encerrada: a apuração continua à vista, com a vencedora
           preenchida. Quem decide o rumo da pauta é o selo lá em cima; aqui é
           a contagem que levou até ele. -->
      <section class="decisao decisao--fechada">
        <p class="det-rotulo">Como ficou a votação</p>
        <div class="decisao-opcoes">
          {#each opcoesDoDesfecho(aberta) as o (o.id)}
            <span
              class="decisao-opcao decisao-opcao--{COR_DA_OPCAO[o.id]}"
              class:decisao-opcao--vencedora={aberta.decisao === o.id}
            >
              <span class="decisao-rotulo">{o.rotulo}</span>
              <span class="decisao-contagem">{contar(o.id)}</span>
            </span>
          {/each}
        </div>
        {#if aberta.motivo_decisao}
          <p class="det-rotulo">Motivo</p>
          <p class="det-corpo">{aberta.motivo_decisao}</p>
        {/if}
        {#if podeReabrir}
          <p class="decisao-nota">
            Encerrada {horaBR(aberta.decidida_em)}. Como admin do sistema, você pode
            desfazer nas primeiras {HORAS_PRA_REABRIR} horas.
          </p>
          <div>
            <button type="button" class="btn btn-sm" disabled={ocupado} onclick={reabrirDecisao}>
              Reabrir a votação
            </button>
          </div>
        {/if}
      </section>
    {/if}

    <!-- Um desenho só pro comentário, seja ele raiz ou resposta: o que muda
         entre os dois é o recuo, que é da lista. -->
    {#snippet comentario(c: any)}
      <span class="conversa-quem">{nomeDe(c.dMembros)}</span>
      <span class="conversa-quando">
        {horaBR(c.criado_em)}{#if c.editado_em}&nbsp;· editado{/if}
      </span>

      {#if editandoId === c.id_comentario}
        <form
          class="conversa-form conversa-form--edicao"
          onsubmit={(e) => {
            e.preventDefault();
            salvarEdicao();
          }}
        >
          <textarea bind:value={rascunho} rows="3" maxlength="2000" use:focar></textarea>
          <span class="conversa-edicao-acoes">
            <button type="submit" class="btn btn-sm" disabled={ocupado || !rascunho.trim()}>
              Salvar
            </button>
            <button type="button" class="conversa-link" onclick={() => (editandoId = null)}>
              cancelar
            </button>
          </span>
        </form>
      {:else}
        <p
          class="conversa-texto"
          class:conversa-texto--curto={!expandidos.has(c.id_comentario)}
          use:medirCorte={c.id_comentario}
        >
          {c.mensagem}
        </p>
        <span class="conversa-acoes">
          {#if cortados.has(c.id_comentario)}
            <button type="button" class="conversa-link" onclick={() => alternar(c.id_comentario)}>
              {expandidos.has(c.id_comentario) ? "Mostrar menos" : "Ler mais"}
            </button>
          {/if}
          {#if ["aberta", "em_teste"].includes(aberta.status)}
            <button type="button" class="conversa-link" onclick={() => responder(c)}>
              Responder
            </button>
            {#if c.id_membro === euId}
              <button type="button" class="conversa-link" onclick={() => editarComentario(c)}>
                Editar
              </button>
              <!-- Comentário com resposta não se apaga: a FK é cascata e levaria
                   junto o que os outros escreveram. O botão some aqui e a
                   `excluir_comentario` recusa de novo no banco. -->
              {#if !comentarios.some((x) => x.responde_a === c.id_comentario)}
                <button
                  type="button"
                  class="conversa-link conversa-link--perigo"
                  disabled={ocupado}
                  onclick={() => apagarComentario(c)}
                >
                  Apagar
                </button>
              {/if}
            {/if}
          {/if}
        </span>
      {/if}

      {#if respondendoA === c.id_comentario}
        <form
          class="conversa-form conversa-form--edicao"
          onsubmit={(e) => {
            e.preventDefault();
            enviarResposta();
          }}
        >
          <textarea
            bind:value={resposta}
            rows="3"
            maxlength="2000"
            placeholder="Responder a {nomeDe(c.dMembros)}"
            use:focar
          ></textarea>
          <span class="conversa-edicao-acoes">
            <button type="submit" class="btn btn-sm" disabled={ocupado || !resposta.trim()}>
              Responder
            </button>
            <button type="button" class="conversa-link" onclick={() => (respondendoA = null)}>
              cancelar
            </button>
          </span>
        </form>
      {/if}
    {/snippet}

    <!-- A discussão inteira mora num cartão que abre e fecha. Fechado é o
         padrão: durante a reunião o que importa é a votação, e a conversa se
         anuncia sozinha pela contagem no cabeçalho. -->
    <details class="conversa-caixa">
      <summary>
        <span class="conversa-cab">
          <span class="det-rotulo">Discussão</span>
          <span class="conversa-resumo">
            {#if comentarios.length === 0}
              Ninguém comentou ainda
            {:else}
              {totalRaizes} {totalRaizes === 1 ? "comentário" : "comentários"}, {totalRespostas}
              {totalRespostas === 1 ? "resposta" : "respostas"}
            {/if}
          </span>
        </span>
        <span class="conversa-chevron" aria-hidden="true">›</span>
      </summary>

      <section class="conversa">
      <!-- Sem comentário nenhum não repete o aviso: o cabeçalho já disse, e
           aqui embaixo só a caixa de escrever interessa. -->
      {#if comentarios.length > 0}
        <ul class="conversa-lista">
          {#each conversa as c (c.id_comentario)}
            <li>
              {@render comentario(c)}
              {#if c.respostas.length > 0}
                <button
                  type="button"
                  class="conversa-link conversa-abrir"
                  aria-expanded={respostasAbertas.has(c.id_comentario)}
                  onclick={() => alternarRespostas(c.id_comentario)}
                >
                  {respostasAbertas.has(c.id_comentario) ? "Ocultar" : "Ver"}
                  {c.respostas.length}
                  {c.respostas.length === 1 ? "resposta" : "respostas"}
                </button>
                {#if respostasAbertas.has(c.id_comentario)}
                  <ul class="conversa-respostas">
                    {#each c.respostas as r (r.id_comentario)}
                      <li>{@render comentario(r)}</li>
                    {/each}
                  </ul>
                {/if}
              {/if}
            </li>
          {/each}
        </ul>
      {/if}

      {#if ["aberta", "em_teste"].includes(aberta.status)}
        {#if temRascunho}
          <p class="conversa-rascunho">
            Recuperamos o que você estava escrevendo antes de fechar a janela.
          </p>
        {/if}
        <form class="conversa-form" onsubmit={comentar}>
          <textarea bind:value={mensagem} rows="2" maxlength="2000" placeholder="Escreva aqui"></textarea>
          <button type="submit" class="btn btn-sm" disabled={ocupado || !mensagem.trim()}>
            Comentar
          </button>
        </form>
      {:else}
        <p class="det-nota">Pauta decidida: a discussão está fechada.</p>
      {/if}
      </section>
    </details>

    {#if erro}
      <p class="admin-error" role="alert">{erro}</p>
    {/if}
    </div>
  {/if}
</dialog>

<style>
  /* O global.css dá `p { width: 90%; margin: auto }` pra que o texto corrido
     das páginas do manual ganhe largura de leitura. Dentro de cartão e de
     janela aquilo vira parágrafo encolhido e boiando no meio da caixa, com
     cada bloco começando num recuo diferente. Qualquer componente novo que use
     <p> dentro de caixa precisa desta linha. */
  p {
    width: 100%;
    margin: 0;
  }

  .cabeca {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px 14px;
    border: 1px solid var(--ds-line);
    border-radius: 12px;
    background: var(--ds-bg);
  }

  .votos-saldo {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-top: 8px;
    padding: 10px 12px;
    border: 1px solid var(--ds-line);
    border-radius: 10px;
    background: var(--ds-surface);
  }

  .votos-numero {
    flex: none;
    font-family: var(--ds-font-display);
    font-size: 1.6rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--ds-gold);
  }

  .votos-de {
    font-size: 0.9rem;
    color: var(--ds-text-4);
  }

  .votos-texto {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .votos-titulo {
    font-size: 0.9rem;
  }

  .votos-sub {
    font-size: 0.78rem;
    color: var(--ds-text-4);
  }

  .cabeca-linha {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px;
  }

  .cabeca-rotulo {
    font-size: 0.68rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--ds-text-4);
  }

  .cabeca-valor {
    font-family: var(--ds-font-display);
    font-size: 1.1rem;
    color: var(--ds-gold);
  }

  .cabeca-local,
  .cabeca-sub,
  .vazio,
  .det-nota,
  .det-autor,
  .conversa-quando {
    font-size: 0.8rem;
    color: var(--ds-text-4);
  }

  /* O reset do site zera a margem de tudo, e cabeçalho, abas e cartões são
     irmãos soltos aqui, sem pai com gap: sem esta margem os três encostam e a
     fila parece continuação da caixa da reunião. Mais folga em cima que
     embaixo, porque a aba pertence à lista que vem depois dela. */
  .abas {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 20px 0 14px;
  }

  .aba {
    padding: 6px 12px;
    border: 1px solid var(--ds-line);
    border-radius: 999px;
    background: var(--ds-bg);
    color: var(--ds-text-3);
    font-size: 0.82rem;
    cursor: pointer;
  }

  .aba--ativa {
    border-color: var(--ds-gold);
    color: var(--ds-gold);
  }

  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 10px;
    list-style: none;
  }

  .card {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--ds-line);
    border-radius: 12px;
    background: var(--ds-bg);
    overflow: hidden;
  }

  /* As três primeiras da fila são as que entram na reunião. O contorno dourado
     é o mesmo destaque de "precisa de atenção" do hub. */
  .card--principal {
    border-color: var(--ds-gold-dim);
  }

  .card-corpo {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    padding: 12px;
    border: 0;
    background: none;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }

  .card-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }

  /* Etiqueta neutra ao lado do selo de status. Dimensiona pelo próprio texto,
     igual ao .status-badge, e nunca estica dentro do cartão. */
  .tag {
    display: inline-block;
    width: auto;
    min-width: 0;
    flex: none;
    padding: 0.3em 0.7em;
    border: 1px solid var(--ds-line);
    border-radius: 999px;
    background: var(--ds-bg-alt);
    color: var(--ds-text-4);
    font-size: 0.68rem;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .tag--principal {
    border-color: var(--ds-gold-dim);
    color: var(--ds-gold-deep);
  }

  /* Urgente não é o dourado da pauta escolhida: é o vermelho de "isso não
     esperou a votação", pra que os dois selos não se confundam quando aparecem
     lado a lado no mesmo cartão. */
  .tag--urgente {
    border-color: var(--ds-danger);
    color: var(--ds-danger);
  }

  .card-titulo {
    font-size: 0.95rem;
    line-height: 1.3;
  }

  .card-meta {
    font-size: 0.75rem;
    color: var(--ds-text-4);
  }

  .card-voto {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 12px;
    border-top: 1px solid var(--ds-line);
  }

  .card-votos {
    font-family: var(--ds-font-display);
    font-size: 1.3rem;
    font-variant-numeric: tabular-nums;
    color: var(--ds-gold);
  }

  .det {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .det-titulo {
    font-family: var(--ds-font-display);
    font-size: 1.35rem;
    color: var(--ds-gold);
  }

  .det-corpo,
  .conversa-texto {
    white-space: pre-wrap;
    line-height: 1.55;
  }

  .conversa-cab .det-rotulo {
    margin-top: 0;
  }

  .det-rotulo {
    margin-top: 4px;
    font-size: 0.68rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ds-text-4);
  }

  .det-lista {
    padding-left: 18px;
    list-style: disc;
    line-height: 1.5;
  }

  .det-proposta,
  .decisao,
  .conversa,
  .det-acoes,
  .det-publicar {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .det-acoes,
  .det-publicar {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  /* Encerrar pela contagem é o caminho normal e fica sozinho na primeira
     linha; os três desfechos manuais vêm embaixo, com folga entre eles, porque
     clicar no errado aqui não tem desfazer. */
  .decisao-fechar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 12px;
    margin-top: 2px;
  }

  .decisao-fechar-manual {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    width: 100%;
  }

  .decisao {
    padding: 12px;
    border: 1px solid var(--ds-gold-dim);
    border-radius: 12px;
    background: var(--ds-gold-wash);
  }

  .decisao-opcoes {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .decisao-nota,
  .decisao-aviso {
    font-size: 0.78rem;
    color: var(--ds-text-4);
  }

  .decisao-encerrar {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 4px;
    padding-top: 10px;
    border-top: 1px solid var(--ds-line);
  }

  /* O aviso fica ao lado do que ele avisa, e não perdido no meio do cartão:
     estes botões não pedem confirmação segunda vez depois do sim. */
  .decisao-aviso {
    color: #f0a67e;
  }

  .decisao-opcao {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border: 1px solid var(--ds-cor-linha, var(--ds-line-strong));
    border-radius: 10px;
    background: var(--ds-surface-solid);
    color: var(--ds-cor-texto, var(--ds-text-2));
    cursor: pointer;
  }

  /* Cada desfecho carrega sua cor em duas variáveis, e os estados abaixo só
     mudam quanto dela aparece: contorno no repouso, fundo lavado na sua
     escolha, sólido na vencedora. Assim não existe uma regra por combinação
     de cor e estado. */
  .decisao-opcao--sim {
    --ds-cor: #4fd18b;
    --ds-cor-texto: #4fd18b;
    --ds-cor-linha: rgba(79, 209, 139, 0.4);
    --ds-cor-fundo: #0e2a1c;
  }

  .decisao-opcao--nao {
    --ds-cor: #f0776e;
    --ds-cor-texto: #f0776e;
    --ds-cor-linha: rgba(240, 119, 110, 0.4);
    --ds-cor-fundo: #2a1414;
  }

  .decisao-opcao--espera {
    --ds-cor: var(--ds-text-3);
    --ds-cor-texto: var(--ds-text-3);
    --ds-cor-linha: var(--ds-line-strong);
    --ds-cor-fundo: var(--ds-surface);
  }

  .decisao-opcao--minha {
    border-color: var(--ds-cor);
    background: var(--ds-cor-fundo);
  }

  /* A que levou a votação fica cheia da própria cor. O texto vai pro fundo
     escuro do site, que é o que dá contraste em cima de verde e de vermelho. */
  .decisao-opcao--vencedora {
    border-color: var(--ds-cor);
    background: var(--ds-cor);
    color: var(--ds-bg);
    font-weight: 700;
  }

  .decisao--fechada .decisao-opcao {
    cursor: default;
  }

  .decisao-contagem {
    font-family: var(--ds-font-display);
    font-variant-numeric: tabular-nums;
  }

  .conversa-caixa {
    padding: 12px;
    border: 1px solid var(--ds-line);
    border-radius: 12px;
    background: var(--ds-surface);
  }

  .conversa-caixa summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    cursor: pointer;
    list-style: none;
  }

  .conversa-caixa summary::-webkit-details-marker {
    display: none;
  }

  .conversa-caixa[open] summary {
    margin-bottom: 10px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--ds-line);
  }

  .conversa-cab {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 10px;
    min-width: 0;
  }

  .conversa-rascunho {
    font-size: 0.78rem;
    color: var(--ds-gold-light);
  }

  .conversa-resumo {
    font-size: 0.8rem;
    color: var(--ds-text-4);
  }

  .conversa-chevron {
    flex: none;
    color: var(--ds-gold);
    transition: transform 0.2s ease;
  }

  .conversa-caixa[open] .conversa-chevron {
    transform: rotate(90deg);
  }

  .conversa-lista {
    display: flex;
    flex-direction: column;
    gap: 10px;
    list-style: none;
  }


  /* Duas linhas e corta. O botão só aparece pra quem transbordou de verdade. */
  .conversa-texto--curto {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
  }

  .conversa-acoes {
    display: flex;
    gap: 12px;
    margin-top: 2px;
  }

  .conversa-link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--ds-gold-light);
    font-size: 0.78rem;
    cursor: pointer;
  }

  /* Um nível de recuo, e só. O banco achata resposta de resposta pro mesmo
     pai, então esta lista nunca aninha de novo. */
  .conversa-respostas {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 8px 0 0 14px;
    padding-left: 10px;
    border-left: 2px solid var(--ds-line);
    list-style: none;
  }

  /* O mesmo vermelho do `.btn-danger`, que é o `--ds-danger` clareado pra ler
     no fundo escuro. O token puro é escuro demais pra texto pequeno. */
  .conversa-link--perigo {
    color: #e57368;
  }

  .conversa-abrir {
    display: block;
    margin-top: 6px;
  }

  .conversa-quem {
    font-weight: 700;
    font-size: 0.85rem;
  }

  .conversa-form {
    display: flex;
    gap: 8px;
    align-items: flex-end;
  }

  .conversa-form--edicao {
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
    margin-top: 4px;
  }

  .conversa-edicao-acoes {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  /* A caixa de comentário fica fora de um `.admin-form`, e é lá que mora o
     desenho dos campos do painel. Sem isto ela sai branca e monoespaçada, o
     controle cru do navegador no meio da janela escura. */
  .conversa-form textarea {
    flex: 1;
    min-height: 2.9em;
    padding: 0.6em 0.8em;
    border: 1px solid var(--ds-line-strong);
    border-radius: 10px;
    background: var(--ds-bg-alt);
    color: var(--ds-text-1);
    font-family: var(--ds-font-body);
    font-size: 0.95rem;
    line-height: 1.55;
    resize: vertical;
  }
</style>
