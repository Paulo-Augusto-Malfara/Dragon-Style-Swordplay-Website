<script lang="ts">
  /**
   * A tela de dentro do torneio. Três estados no mesmo componente, porque são
   * três momentos da mesma coisa e a pessoa passa de um para o outro sem sair
   * da página:
   *
   *   inscricao    monta a lista de participantes e gera as chaves
   *   em_andamento lança o placar das partidas
   *   finalizado   mostra os campeões, em leitura
   *
   * O chaveamento não mora aqui: ele é função pura em src/lib/torneio.ts, com
   * teste em scripts/test-torneio.mjs. Daqui sai só a chamada e o desenho.
   *
   * Quem decide o vencedor de uma partida é a RPC `registrar_resultado`, e não
   * esta tela. Melhor de N é regra do torneio, e regra do torneio não pode
   * depender do que o navegador mandou.
   */
  import { onMount, onDestroy } from "svelte";
  import { supabase } from "../../lib/supabase-browser";
  import MembroPicker from "./MembroPicker.svelte";
  import ConfirmarAcao from "./ConfirmarAcao.svelte";
  import SeletorDeChaves from "../SeletorDeChaves.svelte";
  import PodioDoTorneio from "../PodioDoTorneio.svelte";
  import { nomeExibido } from "../../lib/nome";
  import {
    FASE_DESEMPATE,
    MINIMO_POR_CHAVE,
    classificacao,
    gerarChaves,
    partidaDesempate,
    precisaDesempate,
    vitoriasNecessarias,
  } from "../../lib/torneio";

  interface Props {
    idTorneio: number;
    souOrganizador: boolean;
    souAdminSistema: boolean;
  }
  const { idTorneio, souOrganizador, souAdminSistema }: Props = $props();

  const FORMATOS: Record<string, string> = {
    eliminatoria: "Eliminatória simples",
    eliminatoria_dupla: "Eliminatória dupla",
    suico: "Suíço",
    todos_contra_todos: "Todos contra todos",
  };

  let torneio = $state<any | null>(null);
  let equipes = $state<any[]>([]);
  let partidas = $state<any[]>([]);
  let classes = $state<{ id_classe: number; nome_classe: string; sigla_classe: string }[]>([]);
  let membros = $state(new Map<number, { nome: string; foto_url: string | null }>());
  let carregando = $state(true);
  let erro = $state("");
  let confirmar: ConfirmarAcao;
  let channel: ReturnType<typeof supabase.channel> | null = null;

  const porClasse = $derived(torneio?.tipo === "classes");
  const tamanhoEquipe = $derived(torneio?.tamanho_equipe ?? 1);
  // Os dois mata-matas terminam em final e campeão; o suíço e o todos contra
  // todos terminam em tabela. É essa divisão que a tela usa, não o formato.
  const mataMata = $derived(
    torneio?.formato === "eliminatoria" || torneio?.formato === "eliminatoria_dupla",
  );

  /* ---------- carregamento ---------- */

  async function carregar() {
    const [t, e, p, c] = await Promise.all([
      supabase.from("fTorneios").select("*").eq("id_torneio", idTorneio).single(),
      supabase
        .from("fTorneioEquipes")
        .select("id_equipe, nome_equipe, id_classe, seed, fTorneioIntegrantes(id_membro)")
        .eq("id_torneio", idTorneio)
        .order("id_classe", { nullsFirst: true })
        .order("seed"),
      supabase.from("fTorneioPartidas").select("*").eq("id_torneio", idTorneio).order("id_partida"),
      supabase.from("dClasses").select("id_classe, nome_classe, sigla_classe").order("nome_classe"),
    ]);

    torneio = t.data;
    equipes = (e.data ?? []).map((x: any) => ({
      ...x,
      integrantes: (x.fTorneioIntegrantes ?? []).map((i: any) => i.id_membro),
    }));
    partidas = p.data ?? [];
    classes = c.data ?? [];

    const ids = [...new Set(equipes.flatMap((x) => x.integrantes))];
    if (ids.length > 0) {
      const { data } = await supabase
        .from("dMembros")
        .select("id_membro, nome, apelido, foto_url")
        .in("id_membro", ids);
      membros = new Map(
        (data ?? []).map((m: any) => [m.id_membro, { nome: nomeExibido(m), foto_url: m.foto_url }]),
      );
    }
    carregando = false;
  }

  onMount(async () => {
    await carregar();
    // Numa mesa de torneio é normal duas pessoas lançarem resultado ao mesmo
    // tempo. Sem filtro no DELETE porque com REPLICA IDENTITY default o
    // Postgres só manda a chave primária da linha apagada, e o filtro por
    // id_torneio nunca casaria.
    channel = supabase
      .channel(`torneio-${idTorneio}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "fTorneioPartidas", filter: `id_torneio=eq.${idTorneio}` },
        () => carregar(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "fTorneios", filter: `id_torneio=eq.${idTorneio}` },
        () => carregar(),
      )
      .subscribe();
  });

  onDestroy(() => {
    if (channel) supabase.removeChannel(channel);
  });

  /* ---------- nomes ---------- */

  const nomeDaClasse = (id: number | null) =>
    classes.find((c) => c.id_classe === id)?.nome_classe ?? "Sem classe";

  function nomeEquipe(id: number | null): string {
    if (id === null) return "";
    const e = equipes.find((x) => x.id_equipe === id);
    if (!e) return `#${id}`;
    if (e.nome_equipe) return e.nome_equipe;
    return e.integrantes.map((m: number) => membros.get(m)?.nome ?? `#${m}`).join(" e ");
  }

  /* ---------- inscrição ---------- */

  let emMontagem = $state<{ id_membro: number; nome: string }[]>([]);
  let classesEscolhidas = $state<number[]>([]);
  let nomeEquipeNova = $state("");
  let inscrevendo = $state(false);

  const equipeCompleta = $derived(emMontagem.length === tamanhoEquipe);

  /* O Básico fica fora da grade: torneio de classes é disputa de classe
     oficial, e o Básico é por onde todo mundo passa antes de ter uma. */
  const ID_BASICO = 11;
  const classesOficiais = $derived(classes.filter((c) => c.id_classe !== ID_BASICO));

  /* Teto de classes por pessoa, escolhido na abertura do torneio. A trava de
     verdade está na `inscrever_equipe`, que recusa a que passar; aqui ela só
     aparece antes, pra ninguém montar uma inscrição que o banco vai devolver. */
  const MAX_CLASSES = $derived(torneio?.max_classes ?? 3);

  /* Em que classes esta pessoa já está inscrita neste torneio. Ela pode disputar
     várias no mesmo dia, mas não duas vezes a mesma: essas saem desmarcáveis da
     grade, com o motivo escrito no próprio cartão. */
  const classesJaInscritas = $derived.by(() => {
    const daMontagem = new Set(emMontagem.map((m) => m.id_membro));
    const achadas = new Set<number>();
    for (const e of equipes) {
      if (e.id_classe != null && e.integrantes.some((m: number) => daMontagem.has(m))) {
        achadas.add(e.id_classe);
      }
    }
    return achadas;
  });

  /* As que ela já disputa mais as que estão sendo marcadas agora: o teto é do
     torneio inteiro, e não de uma inscrição só, senão bastava inscrever três
     vezes em sequência pra passar por cima dele. */
  const classesDaPessoa = $derived(classesJaInscritas.size + classesEscolhidas.length);
  const noTeto = $derived(classesDaPessoa >= MAX_CLASSES);

  function alternarClasse(id: number) {
    if (classesEscolhidas.includes(id)) {
      classesEscolhidas = classesEscolhidas.filter((c) => c !== id);
      erro = "";
      return;
    }
    if (noTeto) {
      erro = `Cada pessoa disputa no máximo ${MAX_CLASSES} classes no mesmo torneio. Desmarque uma para trocar.`;
      return;
    }
    classesEscolhidas = [...classesEscolhidas, id];
    erro = "";
  }

  async function selecionarMembro(m: { id_membro: number; nome: string }) {
    if (emMontagem.some((x) => x.id_membro === m.id_membro)) return;
    if (emMontagem.length >= tamanhoEquipe) return;
    emMontagem = [...emMontagem, { id_membro: m.id_membro, nome: m.nome }];
    erro = "";

    // A classe já vem preenchida com a do último treino da pessoa, que é o
    // palpite certo na esmagadora maioria das vezes. Por data do treino e não
    // por id: os treinos antigos foram cadastrados depois e têm id maior que a
    // data deles, então ordenar por id apontaria a classe errada como a última.
    if (porClasse && classesEscolhidas.length === 0) {
      const { data } = await supabase
        .from("fPresencas")
        .select("id_classe, fTreinos(data_treino)")
        .eq("id_membro", m.id_membro);
      let melhor = "";
      let ultima: number | null = null;
      for (const linha of (data ?? []) as any[]) {
        const d = linha.fTreinos?.data_treino;
        if (d && d > melhor) {
          melhor = d;
          ultima = linha.id_classe;
        }
      }
      // Nada marcado quando a última foi Básico: ela não está na grade, e marcar
      // no escuro uma classe que a pessoa não vê é pior do que não marcar nada.
      if (ultima !== null && ultima !== ID_BASICO) classesEscolhidas = [ultima];
    }
  }

  function tirarDaMontagem(idMembro: number) {
    emMontagem = emMontagem.filter((x) => x.id_membro !== idMembro);
    if (emMontagem.length === 0) classesEscolhidas = [];
  }

  /* Inscritos chave por chave. A `carregar` já pede as equipes ordenadas por
     classe e por seed, então basta agrupar mantendo a ordem que veio. */
  const inscritosPorChave = $derived.by(() => {
    const mapa = new Map<number | null, { id_classe: number | null; linhas: any[] }>();
    for (const e of equipes) {
      const chave = e.id_classe ?? null;
      if (!mapa.has(chave)) mapa.set(chave, { id_classe: chave, linhas: [] });
      mapa.get(chave)!.linhas.push(e);
    }
    return [...mapa.values()];
  });

  async function inscrever() {
    if (!equipeCompleta) return;
    if (porClasse && classesEscolhidas.length === 0) {
      erro = "Marque pelo menos uma classe deste participante.";
      return;
    }
    inscrevendo = true;
    erro = "";

    // Uma inscrição por classe marcada, porque cada classe é uma chave separada.
    // Em sequência e não em paralelo: o seed sai de um max(seed) por chave, e
    // duas inserções ao mesmo tempo leriam o mesmo número.
    const alvos: (number | null)[] = porClasse ? [...classesEscolhidas] : [null];
    const falhas: string[] = [];
    for (const c of alvos) {
      const { error } = await supabase.rpc("inscrever_equipe", {
        p_id_torneio: idTorneio,
        p_membros: emMontagem.map((x) => x.id_membro),
        p_id_classe: c,
        p_nome_equipe: nomeEquipeNova.trim() || null,
      });
      if (error) falhas.push(porClasse ? `${nomeDaClasse(c)}: ${error.message}` : error.message);
    }
    inscrevendo = false;
    erro = falhas.join(" ");

    // Se nenhuma entrou, a montagem fica de pé pra corrigir e tentar de novo.
    // Se pelo menos uma entrou, ela é limpa e o erro do resto continua na tela.
    if (falhas.length < alvos.length) {
      emMontagem = [];
      classesEscolhidas = [];
      nomeEquipeNova = "";
    }
    await carregar();
  }

  async function removerInscricao(e: any) {
    const ok = await confirmar.pedir({
      titulo: `Tirar ${nomeEquipe(e.id_equipe)} do torneio?`,
      texto: "Serve pra corrigir inscrição errada, antes das chaves saírem.",
      acao: "Tirar",
      perigo: true,
    });
    if (!ok) return;
    const { error } = await supabase.rpc("remover_equipe", { p_id_equipe: e.id_equipe });
    if (error) erro = error.message;
    await carregar();
  }

  /* ---------- geração de chaves ---------- */

  let melhorDePadrao = $state(3);
  let melhorDeSemi = $state(5);
  let melhorDeFinal = $state(7);
  let gerando = $state(false);

  const partidasEmAberto = $derived(partidas.filter((p) => p.id_equipe_vencedora === null).length);

  const rodadasFeitas = $derived(new Set(partidas.map((p) => p.fase)).size);
  const faltamRodadas = $derived(
    torneio?.formato === "suico" ? (torneio.rodadas ?? 0) - rodadasFeitas : 0,
  );
  const podeGerarProxima = $derived(
    torneio?.status === "em_andamento" && faltamRodadas > 0 && partidasEmAberto === 0,
  );

  // Grandes finais que a repescagem venceu e ainda não ganharam o desempate. Uma
  // por chave, porque o torneio de classes tem uma grande final em cada classe.
  const desempatesPendentes = $derived(
    torneio?.formato === "eliminatoria_dupla"
      ? partidas.filter(
          (p) =>
            precisaDesempate(p) &&
            !partidas.some((d) => d.fase === FASE_DESEMPATE && d.id_classe === p.id_classe),
        )
      : [],
  );

  /* Classe abaixo do mínimo não vira chave, e quem estiver nela fica de fora do
     torneio. Vale avisar bem antes de gerar: depois disso não dá mais pra
     inscrever ninguém, e aí a única saída é reabrir tudo. */
  const classesCurtas = $derived(
    porClasse
      ? [...new Set(equipes.map((e) => e.id_classe))].filter(
          (c) => equipes.filter((e) => e.id_classe === c).length < MINIMO_POR_CHAVE,
        )
      : [],
  );

  async function gerar() {
    gerando = true;
    erro = "";
    try {
      const novas = gerarChaves({
        formato: torneio.formato,
        equipes: equipes.map((e) => ({
          id_equipe: e.id_equipe,
          seed: e.seed,
          id_classe: e.id_classe,
        })),
        melhorDe: { padrao: melhorDePadrao, semifinal: melhorDeSemi, final: melhorDeFinal },
        porClasse,
        feitas: partidas,
        numeroRodada: rodadasFeitas + 1,
      });
      if (novas.length === 0) {
        erro = "Não deu pra montar nenhuma chave. Confira se há pelo menos duas equipes.";
        return;
      }
      const { error } = await supabase.rpc("gerar_partidas", {
        p_id_torneio: idTorneio,
        p_partidas: novas,
      });
      if (error) erro = error.message;
      await carregar();
    } catch (e: any) {
      erro = e.message ?? String(e);
    } finally {
      gerando = false;
    }
  }

  /**
   * A final de desempate não sai junto com a chave: na hora de montar ela não
   * dá pra saber se vai ser precisa. Nasce aqui, depois que a grande final
   * termina com a repescagem vencendo.
   */
  async function gerarDesempate() {
    gerando = true;
    erro = "";
    const { error } = await supabase.rpc("gerar_partidas", {
      p_id_torneio: idTorneio,
      p_partidas: desempatesPendentes.map(partidaDesempate),
    });
    if (error) erro = error.message;
    await carregar();
    gerando = false;
  }

  /* ---------- partidas ---------- */

  /** Agrupa na ordem em que as partidas foram geradas: chave por chave, fase por fase. */
  const grupos = $derived.by(() => {
    const mapa = new Map<string, { id_classe: number | null; fase: string; linhas: any[] }>();
    for (const p of partidas) {
      const chave = `${p.id_classe ?? ""}|${p.fase}`;
      if (!mapa.has(chave)) mapa.set(chave, { id_classe: p.id_classe, fase: p.fase, linhas: [] });
      mapa.get(chave)!.linhas.push(p);
    }
    return [...mapa.values()];
  });

  async function marcar(p: any, lado: "a" | "b", delta: number) {
    const pontos = {
      p_id_partida: p.id_partida,
      p_pontos_a: p.pontos_a + (lado === "a" ? delta : 0),
      p_pontos_b: p.pontos_b + (lado === "b" ? delta : 0),
    };
    if (pontos.p_pontos_a < 0 || pontos.p_pontos_b < 0) return;
    erro = "";
    const { error } = await supabase.rpc("registrar_resultado", pontos);
    if (error) erro = error.message;
    await carregar();
  }

  async function zerar(p: any) {
    erro = "";
    const { error } = await supabase.rpc("registrar_resultado", {
      p_id_partida: p.id_partida,
      p_pontos_a: 0,
      p_pontos_b: 0,
    });
    if (error) erro = error.message;
    await carregar();
  }

  async function trocarMelhorDe(p: any, valor: number) {
    erro = "";
    const { error } = await supabase.rpc("definir_melhor_de", {
      p_id_partida: p.id_partida,
      p_melhor_de: valor,
    });
    if (error) erro = error.message;
    await carregar();
  }

  /* ---------- classificação e campeões ---------- */

  const chavesDoTorneio = $derived(
    porClasse ? [...new Set(equipes.map((e) => e.id_classe))] : [null],
  );

  function tabelaDaChave(idClasse: number | null) {
    const doGrupo = equipes.filter((e) => (e.id_classe ?? null) === idClasse);
    const ids = new Set(doGrupo.map((e) => e.id_equipe));
    const feitas = partidas.filter((p) => ids.has(p.id_equipe_a) || ids.has(p.id_equipe_b));
    return classificacao(doGrupo, feitas);
  }

  const campeoes = $derived.by(() => {
    if (!torneio || partidas.length === 0) return [];
    if (mataMata) {
      // Campeão é quem venceu a última partida da chave. Pela ordem das
      // partidas, e não por "não ter partida seguinte": na eliminatória dupla a
      // final de desempate nasce depois da grande final, e as duas ficam sem
      // seguinte, o que daria dois campeões na mesma classe.
      const ultima = new Map<number | null, any>();
      for (const p of partidas) {
        const atual = ultima.get(p.id_classe ?? null);
        if (!atual || p.id_partida > atual.id_partida) ultima.set(p.id_classe ?? null, p);
      }
      return [...ultima.values()]
        .filter((p) => p.id_equipe_vencedora !== null)
        .map((p) => ({ id_classe: p.id_classe, id_equipe: p.id_equipe_vencedora }));
    }
    return chavesDoTorneio
      .map((c) => {
        const primeiro = tabelaDaChave(c)[0];
        return primeiro ? { id_classe: c, id_equipe: primeiro.id_equipe } : null;
      })
      .filter(Boolean) as { id_classe: number | null; id_equipe: number }[];
  });

  /* ---------- uma chave de cada vez ---------- */

  /* Torneio de classes é vários torneios ao mesmo tempo, e as dez chaves na
     mesma rolagem não deixam a mesa achar a partida que está para lançar.
     "Geral" é o panorama, e cada classe abre a chave dela sozinha. */
  let aba = $state<number | "geral">("geral");

  const fechado = $derived(torneio?.status === "finalizado" && partidas.length > 0);

  const chavesClasse = $derived(
    porClasse ? chavesDoTorneio.filter((c): c is number => c !== null) : [],
  );

  const soResumo = $derived(porClasse && aba === "geral");

  const gruposVisiveis = $derived(
    soResumo ? [] : porClasse ? grupos.filter((g) => g.id_classe === aba) : grupos,
  );

  const chavesVisiveis = $derived(soResumo ? [] : porClasse ? [aba as number] : chavesDoTorneio);

  /* ---------- fechar, reabrir, excluir ---------- */

  let fechando = $state(false);
  let acaoPerigo = $state(false);

  // Primeira das duas travas do fechamento. A segunda é a exceção dentro da RPC
  // fechar_torneio, que recusa de novo. A tela sozinha nunca é trava, porque
  // quem chama a RPC direto passa por cima dela.
  const podeFechar = $derived(
    torneio?.status === "em_andamento" &&
      partidas.length > 0 &&
      partidasEmAberto === 0 &&
      faltamRodadas <= 0 &&
      desempatesPendentes.length === 0,
  );

  // O verbo concorda com o número: "Falta 1 partida", "Faltam 3 partidas".
  const contagem = (n: number, singular: string, plural: string) =>
    n === 1 ? `Falta 1 ${singular}` : `Faltam ${n} ${plural}`;

  const motivoNaoFecha = $derived(
    partidas.length === 0
      ? "Gere as chaves antes."
      : partidasEmAberto > 0
        ? `${contagem(partidasEmAberto, "partida", "partidas")} sem resultado.`
        : faltamRodadas > 0
          ? `${contagem(faltamRodadas, "rodada", "rodadas")} do suíço.`
          : desempatesPendentes.length > 0
            ? `${contagem(desempatesPendentes.length, "final de desempate", "finais de desempate")}.`
            : "",
  );

  async function fechar() {
    const ok = await confirmar.pedir({
      titulo: `Fechar ${torneio.nome}?`,
      texto: "O torneio passa a ser só leitura. Só o admin do sistema consegue reabrir.",
      acao: "Fechar torneio",
    });
    if (!ok) return;
    fechando = true;
    erro = "";
    const { error } = await supabase.rpc("fechar_torneio", { p_id_torneio: idTorneio });
    fechando = false;
    if (error) erro = error.message;
    await carregar();
  }

  async function reabrir() {
    const ok = await confirmar.pedir({
      titulo: `Reabrir ${torneio.nome}?`,
      texto: "Volta a aceitar correção de placar.",
      acao: "Reabrir",
    });
    if (!ok) return;
    acaoPerigo = true;
    erro = "";
    const { error } = await supabase.rpc("reabrir_torneio", { p_id_torneio: idTorneio });
    acaoPerigo = false;
    if (error) erro = error.message;
    await carregar();
  }

  async function excluir() {
    const ok = await confirmar.pedir({
      titulo: `Excluir ${torneio.nome}?`,
      texto: "Some com as inscrições, as chaves e todos os placares. Não dá pra desfazer.",
      acao: "Excluir",
      perigo: true,
    });
    if (!ok) return;
    acaoPerigo = true;
    erro = "";
    const { error } = await supabase.rpc("excluir_torneio", { p_id_torneio: idTorneio });
    acaoPerigo = false;
    if (error) {
      erro = error.message;
      return;
    }
    window.location.href = "/admin/torneios";
  }
</script>

<ConfirmarAcao bind:this={confirmar} />

{#if carregando}
  <p class="vazio">Carregando...</p>
{:else if !torneio}
  <p class="vazio">Torneio não encontrado.</p>
{:else}
  <div class="torneio-cab">
    <h2>{torneio.nome}</h2>
    <p class="torneio-meta">
      {porClasse ? "Por classe" : "Aberto"}, {torneio.tamanho_equipe}x{torneio.tamanho_equipe},
      <!-- Sem quebra de linha antes de cada {#if}: ela virava um espaço solto e
           o texto saía "Eliminatória simples , até 3 classes". -->
      {FORMATOS[torneio.formato]}{#if torneio.formato === "suico"}, {torneio.rodadas}
        rodadas{/if}{#if porClasse}, até {MAX_CLASSES}
        {MAX_CLASSES === 1 ? "classe" : "classes"} por pessoa{/if}
      {" · "}{new Date(torneio.data_torneio + "T00:00:00").toLocaleDateString("pt-BR")}
    </p>
    <!-- O link que o organizador manda pro grupo. Só depois das chaves saírem,
         porque é só aí que a tela pública passa a mostrar alguma coisa. -->
    {#if torneio.status !== "inscricao"}
      <p class="torneio-publico">
        <a
          class="links-de-texto"
          href={`/torneios/${idTorneio}`}
          target="_blank"
          rel="noopener"
        >
          Ver a tela pública deste torneio
        </a>
      </p>
    {/if}
  </div>

  {#if erro}
    <p class="admin-error" role="alert">{erro}</p>
  {/if}

  <!-- ============ INSCRIÇÃO ============ -->
  {#if torneio.status === "inscricao"}
    <div class="admin-form">
      <p class="admin-form-titulo">
        {tamanhoEquipe === 1 ? "Inscrever participante" : `Montar equipe de ${tamanhoEquipe}`}
      </p>
      <p class="admin-form-nota">
        {tamanhoEquipe === 1
          ? "Busque pelo apelido ou pelo nome do cadastro, do mesmo jeito do registro de presença."
          : `Escolha ${tamanhoEquipe} pessoas e inscreva a equipe. Ninguém entra em duas equipes do mesmo torneio.`}
      </p>

      {#if emMontagem.length > 0}
        <ul class="montagem">
          {#each emMontagem as m (m.id_membro)}
            <li>
              <span class="montagem-nome">{m.nome}</span>
              <button
                type="button"
                class="btn-icone btn-icone--perigo"
                aria-label={`Tirar ${m.nome}`}
                onclick={() => tirarDaMontagem(m.id_membro)}>×</button
              >
            </li>
          {/each}
        </ul>
      {/if}

      {#if !equipeCompleta}
        <MembroPicker
          onSelect={selecionarMembro}
          placeholder={tamanhoEquipe === 1
            ? "Buscar membro..."
            : `Buscar membro (${emMontagem.length} de ${tamanhoEquipe})...`}
        />
      {/if}

      {#if porClasse && emMontagem.length > 0}
        <p class="classes-rotulo">
          Em que classes ele entra
          <span class="contagem">{classesDaPessoa} de {MAX_CLASSES}</span>
        </p>
        <div class="classes-grade">
          {#each classesOficiais as c (c.id_classe)}
            {@const escolhida = classesEscolhidas.includes(c.id_classe)}
            {@const ja = classesJaInscritas.has(c.id_classe)}
            {@const fora = !escolhida && !ja && noTeto}
            <button
              type="button"
              class="classe-card"
              class:escolhida
              class:apagada={ja || fora}
              aria-pressed={escolhida}
              disabled={ja || fora}
              onclick={() => alternarClasse(c.id_classe)}
            >
              <span class="classe-nome">{c.nome_classe}</span>
              <span class="classe-obs">{ja ? "já inscrito" : escolhida ? "✓" : c.sigla_classe}</span>
            </button>
          {/each}
        </div>
        <p class="admin-form-nota">
          {noTeto
            ? `No teto de ${MAX_CLASSES} classes. Desmarque uma para trocar.`
            : `A classe do último treino já vem marcada. Pode marcar até ${MAX_CLASSES}: cada classe é uma chave separada, e a mesma pessoa pode disputar mais de uma no mesmo dia.`}
        </p>
      {/if}

      <div class="campos">
        {#if tamanhoEquipe > 1 && emMontagem.length > 0}
          <label>
            Nome da equipe
            <input type="text" bind:value={nomeEquipeNova} placeholder="Opcional" />
            <small>Sem nome, a equipe aparece pelos nomes de quem está nela.</small>
          </label>
        {/if}
      </div>

      {#if emMontagem.length > 0}
        <div class="form-acoes">
          <button
            type="button"
            class="btn btn-primary"
            onclick={inscrever}
            disabled={inscrevendo || !equipeCompleta}
          >
            {inscrevendo
              ? "Inscrevendo..."
              : !equipeCompleta
                ? `Faltam ${tamanhoEquipe - emMontagem.length}`
                : classesEscolhidas.length > 1
                  ? `Inscrever nas ${classesEscolhidas.length} classes`
                  : "Inscrever"}
          </button>
        </div>
      {/if}
    </div>

    <div class="admin-secao-cab">
      <h2>Inscritos <span class="contagem">{equipes.length}</span></h2>
    </div>

    {#if equipes.length === 0}
      <p class="vazio">Ninguém inscrito ainda.</p>
    {:else}
      <!-- Uma lista por chave. O torneio de classes é um torneio de vários ao
           mesmo tempo, e a lista corrida escondia justamente o que o organizador
           precisa ver antes de gerar: quantos entraram em cada classe. -->
      {#each inscritosPorChave as g (g.id_classe ?? 0)}
        {#if porClasse}
          <p class="chave-titulo">
            {nomeDaClasse(g.id_classe)}
            <span class="contagem">{g.linhas.length}</span>
          </p>
        {/if}
        <ul class="admin-list">
          {#each g.linhas as e (e.id_equipe)}
            <li>
              <div class="row-link">
                <span class="rank-badge">{e.seed}</span>
                <span class="row-corpo">
                  <span class="row-titulo">{nomeEquipe(e.id_equipe)}</span>
                </span>
                <span class="row-acoes">
                  <button
                    type="button"
                    class="btn-icone btn-icone--perigo"
                    aria-label={`Tirar ${nomeEquipe(e.id_equipe)}`}
                    onclick={() => removerInscricao(e)}>×</button
                  >
                </span>
              </div>
            </li>
          {/each}
        </ul>
      {/each}
    {/if}

    {#if souOrganizador}
      <div class="admin-form">
        <p class="admin-form-titulo">Gerar as chaves</p>
        <p class="admin-form-nota">
          Depois disso não dá mais pra inscrever nem tirar ninguém. O melhor de N vale por fase e
          continua editável partida a partida.
        </p>

        {#if classesCurtas.length > 0}
          <p class="admin-aviso">
            {classesCurtas.map(nomeDaClasse).join(", ")}
            {classesCurtas.length === 1 ? "não chega" : "não chegam"} a {MINIMO_POR_CHAVE}
            inscritos, então {classesCurtas.length === 1 ? "não vira chave" : "não viram chave"} e
            quem está {classesCurtas.length === 1 ? "nela" : "nelas"} fica de fora do torneio.
            Inscreva mais gente antes de gerar, ou tire {classesCurtas.length === 1 ? "essa" : "essas"}
            {classesCurtas.length === 1 ? "pessoa da classe" : "pessoas das classes"}: com menos de
            {MINIMO_POR_CHAVE} não dá pódio até o terceiro lugar.
          </p>
        {/if}

        <div class="campos campos-melhor-de">
          {#if mataMata}
            <label>
              {torneio.formato === "eliminatoria_dupla" ? "Rodadas comuns" : "Eliminatórias"}
              <select bind:value={melhorDePadrao}>
                {#each [1, 3, 5, 7, 9] as n}<option value={n}>Melhor de {n}</option>{/each}
              </select>
            </label>
            <label>
              {torneio.formato === "eliminatoria_dupla" ? "Finais das chaves" : "Semifinal"}
              <select bind:value={melhorDeSemi}>
                {#each [1, 3, 5, 7, 9] as n}<option value={n}>Melhor de {n}</option>{/each}
              </select>
            </label>
            <label>
              {torneio.formato === "eliminatoria_dupla" ? "Grande final" : "Final"}
              <select bind:value={melhorDeFinal}>
                {#each [1, 3, 5, 7, 9] as n}<option value={n}>Melhor de {n}</option>{/each}
              </select>
            </label>
          {:else}
            <label>
              Todas as partidas
              <select bind:value={melhorDePadrao}>
                {#each [1, 3, 5, 7, 9] as n}<option value={n}>Melhor de {n}</option>{/each}
              </select>
            </label>
          {/if}
        </div>

        <div class="form-acoes">
          <button
            type="button"
            class="btn btn-primary"
            onclick={gerar}
            disabled={gerando || equipes.length < 2}
          >
            {gerando ? "Gerando..." : "Gerar chaves e começar"}
          </button>
        </div>
        {#if equipes.length < 2}
          <p class="admin-form-nota">Precisa de pelo menos duas inscrições.</p>
        {/if}
      </div>
    {/if}
  {/if}

  <!-- ============ PÓDIO (torneio fechado) ============ -->
  {#if fechado}
    <div class="admin-secao-cab">
      <h2>{chavesDoTorneio.length === 1 ? "Pódio" : "Pódio de cada classe"}</h2>
    </div>
    <PodioDoTorneio
      chaves={chavesDoTorneio}
      {equipes}
      {partidas}
      {mataMata}
      {porClasse}
      {nomeDaClasse}
      {nomeEquipe}
    />
  {/if}

  <!-- ============ PARTIDAS ============ -->
  {#if porClasse && partidas.length > 0}
    <SeletorDeChaves
      chaves={chavesClasse}
      {partidas}
      {campeoes}
      {nomeDaClasse}
      {nomeEquipe}
      mostrarCampeao={!fechado}
      bind:valor={aba}
    />
  {/if}

  {#if partidas.length > 0}
    {#each gruposVisiveis as g (`${g.id_classe}|${g.fase}`)}
      <div class="admin-secao-cab">
        <!-- Título montado numa expressão só. Escrito como `{...}, {/if}{g.fase}`
             o Svelte come o espaço depois da vírgula e sai "Viking,Final". -->
        <h2>{porClasse ? `${nomeDaClasse(g.id_classe)}, ${g.fase}` : g.fase}</h2>
      </div>
      <ul class="partidas">
        {#each g.linhas as p (p.id_partida)}
          {@const necessarias = vitoriasNecessarias(p.melhor_de)}
          {@const decidida = p.id_equipe_vencedora !== null}
          <!-- Bye e "semifinal esperando a outra semi" são a mesma coisa no
               banco: um lado preenchido e o outro nulo. O que separa os dois é
               o bye já nascer decidido na geração da chave. Sem o teste do
               vencedor, quem chegou primeiro na semifinal apareceria como
               "passou sem jogar". -->
          {@const bye =
            p.id_equipe_b === null && p.id_equipe_a !== null && p.id_equipe_vencedora !== null}
          <li class:decidida>
            {#if bye}
              <div class="partida-bye">
                <span class="partida-nome">{nomeEquipe(p.id_equipe_a) || "A definir"}</span>
                <span class="partida-obs">passou sem jogar</span>
              </div>
            {:else if p.id_equipe_a === null || p.id_equipe_b === null}
              <!-- Quem já se classificou aparece pelo nome. Escondê-lo atrás de
                   um "esperando" genérico tirava da tela justamente o que o
                   organizador quer saber: quem já está na final. -->
              <div class="partida-bye">
                {#if p.id_equipe_a !== null || p.id_equipe_b !== null}
                  <span class="partida-nome">
                    {nomeEquipe(p.id_equipe_a ?? p.id_equipe_b)}
                  </span>
                  <span class="partida-obs">esperando o adversário da fase anterior</span>
                {:else}
                  <span class="partida-obs">Esperando as duas vagas da fase anterior.</span>
                {/if}
              </div>
            {:else}
              <div class="partida">
                {#each ["a", "b"] as lado (lado)}
                  {@const idEquipe = lado === "a" ? p.id_equipe_a : p.id_equipe_b}
                  {@const pontos = lado === "a" ? p.pontos_a : p.pontos_b}
                  <div
                    class="partida-lado"
                    class:venceu={p.id_equipe_vencedora === idEquipe}
                  >
                    <span class="partida-nome">{nomeEquipe(idEquipe)}</span>
                    <div class="partida-placar">
                      <button
                        type="button"
                        class="btn-icone"
                        aria-label={`Tirar um ponto de ${nomeEquipe(idEquipe)}`}
                        disabled={pontos === 0 || torneio.status !== "em_andamento"}
                        onclick={() => marcar(p, lado as "a" | "b", -1)}>−</button
                      >
                      <span class="partida-pontos">{pontos}</span>
                      <button
                        type="button"
                        class="btn-icone"
                        aria-label={`Dar um ponto a ${nomeEquipe(idEquipe)}`}
                        disabled={decidida || torneio.status !== "em_andamento"}
                        onclick={() => marcar(p, lado as "a" | "b", 1)}>+</button
                      >
                    </div>
                  </div>
                {/each}
              </div>

              <div class="partida-rodape">
                {#if decidida}
                  <span class="partida-obs">
                    {nomeEquipe(p.id_equipe_vencedora)} venceu por {p.pontos_a}
                    a {p.pontos_b}
                  </span>
                  {#if torneio.status === "em_andamento"}
                    <button type="button" class="btn btn-ghost btn-sm" onclick={() => zerar(p)}>
                      Corrigir
                    </button>
                  {/if}
                {:else if torneio.status === "em_andamento"}
                  <label class="melhor-de">
                    <span>Melhor de</span>
                    <select
                      value={p.melhor_de}
                      onchange={(ev) => trocarMelhorDe(p, Number(ev.currentTarget.value))}
                    >
                      {#each [1, 3, 5, 7, 9] as n}<option value={n}>{n}</option>{/each}
                    </select>
                  </label>
                  <span class="partida-obs">{necessarias} vitória{necessarias === 1 ? "" : "s"} fecha</span>
                {:else}
                  <span class="partida-obs">Sem resultado.</span>
                {/if}
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/each}
  {/if}

  <!-- ============ CLASSIFICAÇÃO (suíço e todos contra todos) ============ -->
  {#if partidas.length > 0 && !mataMata}
    {#each chavesVisiveis as c (c)}
      {@const tabela = tabelaDaChave(c)}
      {#if tabela.length > 0}
        <div class="admin-secao-cab">
          <h2>Classificação{porClasse ? `, ${nomeDaClasse(c)}` : ""}</h2>
        </div>
        <ul class="admin-list classificacao">
          {#each tabela as linha, i (linha.id_equipe)}
            <li>
              <div class="row-link">
                <span class="rank-badge">{i + 1}</span>
                <span class="row-corpo">
                  <span class="row-titulo">{nomeEquipe(linha.id_equipe)}</span>
                  <span class="row-meta">
                    <span>{linha.vitorias}V, {linha.derrotas}D</span>
                    <span>saldo {linha.saldo > 0 ? "+" : ""}{linha.saldo}</span>
                  </span>
                </span>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    {/each}
  {/if}

  <!-- ============ AÇÕES DO TORNEIO ============ -->
  {#if torneio.status === "em_andamento" && souOrganizador}
    <div class="admin-form">
      {#if desempatesPendentes.length > 0}
        <p class="admin-form-titulo">
          {desempatesPendentes.length === 1 ? "Final de desempate" : "Finais de desempate"}
        </p>
        <p class="admin-form-nota">
          A repescagem venceu a grande final, então os dois finalistas estão com uma derrota cada e
          ninguém foi eliminado ainda. Falta mais uma partida entre eles.
        </p>
        <div class="form-acoes">
          <button type="button" class="btn btn-primary" onclick={gerarDesempate} disabled={gerando}>
            {gerando
              ? "Gerando..."
              : desempatesPendentes.length === 1
                ? "Gerar a final de desempate"
                : `Gerar as ${desempatesPendentes.length} finais de desempate`}
          </button>
        </div>
      {:else if podeGerarProxima}
        <p class="admin-form-titulo">Rodada {rodadasFeitas + 1} de {torneio.rodadas}</p>
        <p class="admin-form-nota">
          O pareamento sai da classificação atual e evita repetir adversário.
        </p>
        <div class="form-acoes">
          <button type="button" class="btn btn-primary" onclick={gerar} disabled={gerando}>
            {gerando ? "Gerando..." : `Gerar rodada ${rodadasFeitas + 1}`}
          </button>
        </div>
      {:else}
        <p class="admin-form-titulo">Fechar o torneio</p>
        <p class="admin-form-nota">
          {podeFechar
            ? "Tudo decidido. Fechar deixa o torneio só em leitura."
            : motivoNaoFecha}
        </p>
        <div class="form-acoes">
          <button
            type="button"
            class="btn btn-primary"
            onclick={fechar}
            disabled={!podeFechar || fechando}
          >
            {fechando ? "Fechando..." : "Fechar torneio"}
          </button>
        </div>
      {/if}
    </div>
  {/if}

  {#if souAdminSistema && torneio.status !== "inscricao"}
    <div class="admin-form zona-perigo">
      <p class="admin-form-titulo">Zona de perigo</p>
      <p class="admin-form-nota">Só o admin do sistema chega aqui.</p>
      <div class="form-acoes">
        {#if torneio.status === "finalizado"}
          <button type="button" class="btn btn-ghost" onclick={reabrir} disabled={acaoPerigo}>
            Reabrir torneio
          </button>
        {/if}
        <button type="button" class="btn btn-danger" onclick={excluir} disabled={acaoPerigo}>
          Excluir torneio
        </button>
      </div>
    </div>
  {/if}
{/if}

<style>
  .torneio-cab {
    margin-bottom: 16px;
  }

  .torneio-cab h2 {
    margin: 0;
    font-family: var(--ds-font-display);
    font-size: 1.25rem;
    color: var(--ds-gold-light);
  }

  .torneio-meta {
    margin: 4px 0 0;
    font-size: 0.86rem;
    color: var(--ds-text-3);
  }

  .torneio-publico {
    margin: 6px 0 0;
    font-size: 0.82rem;
  }

  /* Fichas de quem já entrou na equipe em montagem. */
  .montagem {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 0 0 12px;
    padding: 0;
    list-style: none;
  }

  .montagem li {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 6px 4px 13px;
    border: 1px solid var(--ds-gold-dim);
    border-radius: 999px;
    background: var(--ds-gold-wash);
  }

  /* O × da ficha não é o botão de ícone das listas: lá o quadrado de 36px com
     borda é o alvo certo numa linha inteira, aqui ele fica maior que a própria
     cápsula e briga com o arredondado dela. Vira um glifo redondo, e o vermelho
     do :hover do .btn-icone--perigo continua valendo. */
  .montagem li > .btn-icone {
    width: 22px;
    height: 22px;
    border-width: 0;
    border-radius: 50%;
    font-size: 1.05rem;
    line-height: 1;
    color: var(--ds-text-4);
  }

  .montagem-nome {
    font-size: 0.88rem;
    color: var(--ds-gold-light);
  }

  .classes-rotulo {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin: 4px 0 8px;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--ds-text-4);
  }

  .classes-rotulo > .contagem {
    text-transform: none;
    letter-spacing: 0.04em;
    color: var(--ds-text-5);
  }

  /* auto-fill com 96px pra caber duas colunas com folga na tela de 320px, que é
     a do celular do usuário, e ir pra três e quatro conforme sobra espaço. */
  .classes-grade {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
    gap: 8px;
    margin-bottom: 10px;
  }

  .classe-card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    padding: 9px 11px;
    border: 1px solid var(--ds-line);
    border-radius: 10px;
    background: var(--ds-surface);
    text-align: left;
    cursor: pointer;
    transition:
      border-color 0.15s ease,
      background 0.15s ease,
      color 0.15s ease;
  }

  .classe-card:hover:not(:disabled) {
    border-color: var(--ds-line-strong);
  }

  .classe-card:focus-visible {
    outline: 2px solid var(--ds-gold-light);
    outline-offset: 2px;
  }

  .classe-card.escolhida {
    border-color: var(--ds-gold-dim);
    background: var(--ds-gold-wash);
  }

  /* Serve pras duas razões de um cartão estar fora de alcance: a pessoa já
     disputa aquela classe, ou ela chegou no teto de classes. */
  .classe-card.apagada {
    cursor: default;
    opacity: 0.5;
  }

  .classe-nome {
    font-size: 0.88rem;
    color: var(--ds-text-2);
  }

  .classe-card.escolhida > .classe-nome {
    color: var(--ds-gold-light);
    font-weight: 600;
  }

  /* Sigla apagada no cartão solto, e o mesmo lugar virando o ✓ dourado quando
     ele é marcado: assim a linha de baixo não muda de altura ao marcar. */
  .classe-obs {
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--ds-text-5);
  }

  .classe-card.escolhida > .classe-obs {
    color: var(--ds-gold);
  }

  .chave-titulo {
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: 760px;
    margin: 14px auto 6px;
    font-family: var(--ds-font-display);
    font-size: 0.92rem;
    color: var(--ds-gold-light);
  }

  /* A .contagem do global só existe dentro do .admin-secao-cab, e aqui o título
     é um <p>. Mesma tinta e mesmo peso, pro número ler igual ao das outras
     seções do painel. */
  .chave-titulo > .contagem {
    font-family: var(--ds-font-body);
    font-size: 0.8rem;
    font-weight: 400;
    letter-spacing: 0.04em;
    color: var(--ds-text-5);
  }

  .campos-melhor-de {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 12px;
  }

  .partidas {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 0 0 18px;
    padding: 0;
    list-style: none;
  }

  .partidas > li {
    padding: 12px 14px;
    border: 1px solid var(--ds-line);
    border-radius: 12px;
    background: var(--ds-surface);
  }

  .partidas > li.decidida {
    border-color: var(--ds-gold-dim);
  }

  .partida {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .partida-lado {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  /* Direto no filho, não descendente solto: um seletor amplo aqui pegaria
     qualquer span aninhado e esticaria fichas e selos junto. */
  .partida-lado > .partida-nome {
    flex: 1;
    min-width: 0;
    font-size: 0.95rem;
    color: var(--ds-text-2);
    overflow-wrap: anywhere;
  }

  .partida-lado.venceu > .partida-nome {
    color: var(--ds-gold-light);
    font-weight: 600;
  }

  .partida-placar {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: none;
  }

  .partida-pontos {
    min-width: 1.6em;
    text-align: center;
    font-family: var(--ds-font-display);
    font-size: 1.15rem;
    color: var(--ds-gold);
  }

  .partida-rodape {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--ds-line);
  }

  .partida-obs {
    font-size: 0.8rem;
    color: var(--ds-text-5);
  }

  .partida-bye {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px;
  }

  .partida-bye > .partida-nome {
    font-size: 0.95rem;
    color: var(--ds-text-2);
  }

  .melhor-de {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8rem;
    color: var(--ds-text-5);
  }

  .melhor-de select {
    padding: 3px 6px;
    border: 1px solid var(--ds-line);
    border-radius: 6px;
    background: var(--ds-bg);
    color: var(--ds-text-2);
    font: inherit;
  }

  .classificacao .row-link {
    cursor: default;
  }

  /* Mesma tinta da .btn-danger do global, para a zona de perigo do torneio ler
     igual à das outras telas do painel. */
  .zona-perigo {
    border-color: rgba(192, 57, 43, 0.4);
  }
</style>
