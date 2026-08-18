<script lang="ts">
  /**
   * A mesma chave que o painel mostra, em leitura, para quem está de fora.
   *
   * Só o que muda entra pelo canal: as partidas. Os nomes das equipes chegam
   * prontos do servidor (a `v_torneio_equipes` cruza a `dMembros`, que o
   * visitante não alcança) e não mudam depois das inscrições fecharem, então
   * não há por que buscá-los de novo a cada placar lançado.
   */
  import { onMount, onDestroy } from "svelte";
  import { supabase } from "../lib/supabase-browser";
  import { classificacao, vitoriasNecessarias } from "../lib/torneio";
  import SeletorDeChaves from "./SeletorDeChaves.svelte";
  import PodioDoTorneio from "./PodioDoTorneio.svelte";

  interface Equipe {
    id_equipe: number;
    id_classe: number | null;
    seed: number;
    nome: string;
  }

  interface Props {
    torneio: any;
    equipes: Equipe[];
    classes: { id_classe: number; nome_classe: string }[];
    partidasIniciais: any[];
  }

  const { torneio: inicial, equipes, classes, partidasIniciais }: Props = $props();

  let torneio = $state(inicial);
  let partidas = $state(partidasIniciais);

  const porClasse = $derived(torneio.tipo === "classes");
  const aoVivo = $derived(torneio.status === "em_andamento");
  const fechado = $derived(torneio.status === "finalizado" && partidas.length > 0);
  const mataMata = $derived(
    torneio.formato === "eliminatoria" || torneio.formato === "eliminatoria_dupla",
  );

  /* ---------- o que muda ---------- */

  let channel: ReturnType<typeof supabase.channel> | null = null;
  let relogio: ReturnType<typeof setInterval> | null = null;

  async function recarregar() {
    const [p, t] = await Promise.all([
      supabase
        .from("fTorneioPartidas")
        .select("*")
        .eq("id_torneio", torneio.id_torneio)
        .order("id_partida"),
      supabase
        .from("fTorneios")
        .select("id_torneio, nome, data_torneio, tipo, tamanho_equipe, formato, rodadas, status")
        .eq("id_torneio", torneio.id_torneio)
        .single(),
    ]);
    if (p.data) partidas = p.data;
    if (t.data) torneio = t.data;
  }

  function aoVoltar() {
    if (document.visibilityState === "visible") recarregar();
  }

  onMount(() => {
    if (torneio.status === "finalizado") return;

    channel = supabase
      .channel(`torneio-publico-${torneio.id_torneio}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "fTorneioPartidas",
          filter: `id_torneio=eq.${torneio.id_torneio}`,
        },
        () => recarregar(),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "fTorneios",
          filter: `id_torneio=eq.${torneio.id_torneio}`,
        },
        () => recarregar(),
      )
      .subscribe();

    /* Rede de segurança do "ao vivo": se o socket cair, o supabase-js reconecta
       sozinho mas o que passou enquanto ele esteve fora não volta, e a tela fica
       parada sem avisar ninguém. O celular que dormiu no bolso é o caso comum,
       e é o que o visibilitychange resolve; o minuto cobre o resto. */
    document.addEventListener("visibilitychange", aoVoltar);
    relogio = setInterval(recarregar, 60000);
  });

  onDestroy(() => {
    if (channel) supabase.removeChannel(channel);
    if (relogio) clearInterval(relogio);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", aoVoltar);
  });

  /* ---------- nomes ---------- */

  const nomeDaClasse = (id: number | null) =>
    classes.find((c) => c.id_classe === id)?.nome_classe ?? "Sem classe";

  const nomeEquipe = (id: number | null) =>
    id === null ? "" : (equipes.find((e) => e.id_equipe === id)?.nome ?? `#${id}`);

  /* ---------- agrupamento, campeões e tabela ---------- */

  const grupos = $derived.by(() => {
    const mapa = new Map<string, { id_classe: number | null; fase: string; linhas: any[] }>();
    for (const p of partidas) {
      const chave = `${p.id_classe ?? ""}|${p.fase}`;
      if (!mapa.has(chave)) mapa.set(chave, { id_classe: p.id_classe, fase: p.fase, linhas: [] });
      mapa.get(chave)!.linhas.push(p);
    }
    return [...mapa.values()];
  });

  const chavesDoTorneio = $derived(
    porClasse ? [...new Set(equipes.map((e) => e.id_classe))] : [null],
  );

  function tabelaDaChave(idClasse: number | null) {
    const doGrupo = equipes.filter((e) => (e.id_classe ?? null) === idClasse);
    const ids = new Set(doGrupo.map((e) => e.id_equipe));
    const feitas = partidas.filter((p) => ids.has(p.id_equipe_a) || ids.has(p.id_equipe_b));
    return classificacao(doGrupo, feitas);
  }

  /* Mesma regra do painel: campeão é quem venceu a ÚLTIMA partida da chave, e
     não a que não tem seguinte. Na eliminatória dupla a grande final e a final
     de desempate ficam as duas sem seguinte, e isso daria dois campeões. */
  const campeoes = $derived.by(() => {
    if (torneio.status !== "finalizado" || partidas.length === 0) return [];
    if (mataMata) {
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

  const emAberto = $derived(partidas.filter((p) => p.id_equipe_vencedora === null).length);

  /* ---------- uma chave de cada vez ---------- */

  /* Torneio de classes é vários torneios ao mesmo tempo, e as dez chaves na
     mesma rolagem não deixam ninguém achar a partida que interessa. "Geral" é o
     panorama, e cada classe abre a chave dela sozinha. */
  let aba = $state<number | "geral">("geral");

  const chavesClasse = $derived(
    porClasse ? chavesDoTorneio.filter((c): c is number => c !== null) : [],
  );

  const soResumo = $derived(porClasse && aba === "geral");

  const gruposVisiveis = $derived(
    soResumo ? [] : porClasse ? grupos.filter((g) => g.id_classe === aba) : grupos,
  );

  const chavesVisiveis = $derived(
    soResumo ? [] : porClasse ? [aba as number] : chavesDoTorneio,
  );
</script>

{#if aoVivo}
  <!-- Div, e não p: o global tem `p { width: 90% }`, e como ficha ele venceria o
       inline-flex daqui e esticaria o selo por quase toda a largura da página. -->
  <div class="ao-vivo"><span class="ponto" aria-hidden="true"></span>Ao vivo</div>
{/if}

{#if fechado}
  <h2 class="secao">{chavesDoTorneio.length === 1 ? "Pódio" : "Pódio de cada classe"}</h2>
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

{#if partidas.length === 0}
  <p class="vazio">As chaves ainda não saíram. Assim que o organizador gerar, elas aparecem aqui.</p>
{/if}

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

{#each gruposVisiveis as g (`${g.id_classe}|${g.fase}`)}
  <h2 class="secao">{porClasse ? `${nomeDaClasse(g.id_classe)}, ${g.fase}` : g.fase}</h2>
  <ul class="partidas">
    {#each g.linhas as p (p.id_partida)}
      {@const decidida = p.id_equipe_vencedora !== null}
      <!-- Bye e "esperando a outra semi" são a mesma linha no banco: um lado
           nulo. O que separa os dois é o bye já nascer com vencedor. -->
      {@const bye = p.id_equipe_b === null && p.id_equipe_a !== null && decidida}
      <li class:decidida>
        {#if bye}
          <div class="partida-espera">
            <span class="partida-nome">{nomeEquipe(p.id_equipe_a)}</span>
            <span class="partida-obs">passou sem jogar</span>
          </div>
        {:else if p.id_equipe_a === null || p.id_equipe_b === null}
          <div class="partida-espera">
            {#if p.id_equipe_a !== null || p.id_equipe_b !== null}
              <span class="partida-nome">{nomeEquipe(p.id_equipe_a ?? p.id_equipe_b)}</span>
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
              <div class="partida-lado" class:venceu={p.id_equipe_vencedora === idEquipe}>
                <span class="partida-nome">{nomeEquipe(idEquipe)}</span>
                <span class="partida-pontos">{pontos}</span>
              </div>
            {/each}
          </div>
          <p class="partida-rodape">
            {#if decidida}
              <span class="partida-obs">
                {nomeEquipe(p.id_equipe_vencedora)} venceu por {p.pontos_a} a {p.pontos_b}
              </span>
            {:else}
              {@const necessarias = vitoriasNecessarias(p.melhor_de)}
              <span class="partida-obs">
                Melhor de {p.melhor_de}, {necessarias} vitória{necessarias === 1 ? "" : "s"} fecha
              </span>
            {/if}
          </p>
        {/if}
      </li>
    {/each}
  </ul>
{/each}

{#if partidas.length > 0 && !mataMata}
  {#each chavesVisiveis as c (c)}
    {@const tabela = tabelaDaChave(c)}
    {#if tabela.length > 0}
      <h2 class="secao">Classificação{porClasse ? `, ${nomeDaClasse(c)}` : ""}</h2>
      <ul class="tabela">
        {#each tabela as linha, i (linha.id_equipe)}
          <li>
            <span class="tabela-pos">{i + 1}</span>
            <span class="tabela-nome">{nomeEquipe(linha.id_equipe)}</span>
            <span class="tabela-num">{linha.vitorias}V, {linha.derrotas}D</span>
            <span class="tabela-num">saldo {linha.saldo > 0 ? "+" : ""}{linha.saldo}</span>
          </li>
        {/each}
      </ul>
    {/if}
  {/each}
{/if}

{#if aoVivo && partidas.length > 0}
  <p class="rodape-vivo">
    {emAberto === 0
      ? "Todas as partidas decididas. Falta o organizador fechar o torneio."
      : emAberto === 1
        ? "1 partida ainda sem resultado. A tela se atualiza sozinha."
        : `${emAberto} partidas ainda sem resultado. A tela se atualiza sozinha.`}
  </p>
{/if}

<style>
  .ao-vivo {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 18px;
    padding: 5px 14px 5px 12px;
    border: 1px solid var(--ds-gold-dim);
    border-radius: 999px;
    background: var(--ds-gold-wash);
    font-size: 0.74rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--ds-gold-light);
  }

  .ponto {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--ds-gold);
    animation: pulso 1.8s ease-in-out infinite;
  }

  @keyframes pulso {
    50% {
      opacity: 0.25;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .ponto {
      animation: none;
    }
  }

  .secao {
    margin: 22px 0 10px;
    font-family: var(--ds-font-display);
    font-size: 1rem;
    font-weight: 600;
    color: var(--ds-gold-light);
  }

  .vazio {
    color: var(--ds-text-4);
  }

  .partidas,
  .tabela {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0;
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
    gap: 6px;
  }

  .partida-lado {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  /* Filho direto, nunca descendente solto: um seletor amplo aqui esticaria
     qualquer ficha aninhada junto com o nome. */
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

  .partida-pontos {
    flex: none;
    min-width: 1.4em;
    text-align: center;
    font-family: var(--ds-font-display);
    font-size: 1.25rem;
    color: var(--ds-gold);
  }

  .partida-rodape {
    margin: 10px 0 0;
    padding-top: 10px;
    border-top: 1px solid var(--ds-line);
  }

  .partida-espera {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px;
  }

  .partida-espera > .partida-nome {
    font-size: 0.95rem;
    color: var(--ds-text-2);
  }

  .partida-obs {
    font-size: 0.8rem;
    color: var(--ds-text-5);
  }

  .tabela li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 12px;
    padding: 10px 14px;
    border: 1px solid var(--ds-line);
    border-radius: 12px;
    background: var(--ds-surface);
  }

  .tabela-pos {
    flex: none;
    min-width: 1.6em;
    font-family: var(--ds-font-display);
    color: var(--ds-gold);
  }

  .tabela-nome {
    flex: 1 1 160px;
    min-width: 0;
    font-size: 0.95rem;
    color: var(--ds-text-2);
    overflow-wrap: anywhere;
  }

  .tabela-num {
    flex: none;
    font-size: 0.78rem;
    color: var(--ds-text-4);
    font-variant-numeric: tabular-nums;
  }

  .rodape-vivo {
    margin: 18px 0 0;
    font-size: 0.82rem;
    color: var(--ds-text-5);
  }
</style>
