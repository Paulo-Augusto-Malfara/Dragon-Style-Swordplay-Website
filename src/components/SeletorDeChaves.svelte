<script lang="ts">
  /**
   * A barra de chaves do torneio de classes, e o resumo que ela abre em "Geral".
   *
   * Torneio de classes é vários torneios ao mesmo tempo, e despejar todas as
   * chaves numa página só não deixa ninguém achar a partida que interessa. Aqui
   * a pessoa escolhe uma classe de cada vez, e "Geral" é o panorama: uma linha
   * por classe dizendo em que pé ela está.
   *
   * O painel e a tela pública usam o mesmo componente. O que muda entre os dois
   * é de onde saem os nomes, e por isso eles entram como função.
   */
  import { emJogo } from "../lib/torneio";

  interface Props {
    /** Ids de classe do torneio, na ordem em que as chaves foram geradas. */
    chaves: number[];
    partidas: any[];
    campeoes: { id_classe: number | null; id_equipe: number }[];
    nomeDaClasse: (id: number | null) => string;
    nomeEquipe: (id: number | null) => string;
    /**
     * Falso quando o pódio já está na tela, logo acima: aí o nome do campeão no
     * cartão só repetiria o que o pódio diz em letra maior.
     */
    mostrarCampeao?: boolean;
    /** Classe escolhida, ou "geral" para o panorama. */
    valor: number | "geral";
  }

  let {
    chaves,
    partidas,
    campeoes,
    nomeDaClasse,
    nomeEquipe,
    mostrarCampeao = true,
    valor = $bindable(),
  }: Props = $props();

  const resumo = $derived(
    chaves.map((id) => {
      const daChave = partidas.filter((p) => p.id_classe === id);
      const abertas = daChave.filter((p) => p.id_equipe_vencedora === null);
      return {
        id,
        nome: nomeDaClasse(id),
        // Mais de uma partida ao mesmo tempo é o normal numa classe grande.
        agora: daChave.filter(emJogo),
        // A próxima a decidir dá o nome da fase em que a chave está parada.
        fase: abertas[0]?.fase ?? null,
        abertas: abertas.length,
        campeao: campeoes.find((c) => c.id_classe === id)?.id_equipe ?? null,
      };
    }),
  );

  const aoVivoPorChave = $derived(new Map(resumo.map((r) => [r.id, r.agora.length > 0])));
</script>

<div class="abas" role="tablist" aria-label="Chaves do torneio">
  <button
    type="button"
    role="tab"
    class="aba"
    class:atual={valor === "geral"}
    aria-selected={valor === "geral"}
    onclick={() => (valor = "geral")}
  >
    Geral
  </button>
  {#each chaves as id (id)}
    {@const vivo = aoVivoPorChave.get(id) ?? false}
    <button
      type="button"
      role="tab"
      class="aba"
      class:atual={valor === id}
      class:vivo
      aria-selected={valor === id}
      onclick={() => (valor = id)}
    >
      {#if vivo}<span class="aba-ponto" aria-hidden="true"></span>{/if}
      {nomeDaClasse(id)}
    </button>
  {/each}
</div>

{#if valor === "geral"}
  <ul class="resumo">
    {#each resumo as r (r.id)}
      <li class:vivo={r.agora.length > 0} class:fechada={r.campeao !== null}>
        <button type="button" class="resumo-abrir" onclick={() => (valor = r.id)}>
          <span class="resumo-cab">
            <span class="resumo-classe">{r.nome}</span>
            {#if r.agora.length > 0}
              <span class="resumo-selo">
                <span class="aba-ponto" aria-hidden="true"></span>
                Ao vivo
              </span>
            {/if}
          </span>

          {#if r.agora.length > 0}
            {#each r.agora as p (p.id_partida)}
              <span class="resumo-jogo">
                <span class="resumo-quem">{nomeEquipe(p.id_equipe_a)}</span>
                <span class="resumo-placar">{p.pontos_a} a {p.pontos_b}</span>
                <span class="resumo-quem">{nomeEquipe(p.id_equipe_b)}</span>
              </span>
            {/each}
          {:else if mostrarCampeao && r.campeao !== null}
            <span class="resumo-campeao">Campeão: {nomeEquipe(r.campeao)}</span>
          {/if}

          <span class="resumo-obs">
            {#if r.abertas === 0}
              Chave encerrada
            {:else}
              {r.fase}{r.abertas === 1 ? ", falta 1 partida" : `, faltam ${r.abertas} partidas`}
            {/if}
          </span>
        </button>
      </li>
    {/each}
  </ul>
{/if}

<style>
  /* Rola de lado, como a barra de seções do painel: com wrap, dez classes
     viravam três linhas e empurravam a chave pra fora da primeira tela. */
  .abas {
    display: flex;
    gap: 6px;
    margin: 18px 0 4px;
    overflow-x: auto;
    scrollbar-width: none;
    /* Respiro pro anel de foco não ser cortado pelo overflow. */
    padding: 3px 0;
  }

  .abas::-webkit-scrollbar {
    display: none;
  }

  .aba {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 6px 13px;
    border: 1px solid var(--ds-line);
    border-radius: 999px;
    background: var(--ds-surface);
    font: inherit;
    font-size: 0.82rem;
    color: var(--ds-text-3);
    cursor: pointer;
    transition:
      border-color 0.15s ease,
      background 0.15s ease,
      color 0.15s ease;
  }

  .aba:hover {
    border-color: var(--ds-line-strong);
    color: var(--ds-text-2);
  }

  .aba:focus-visible {
    outline: 2px solid var(--ds-gold-light);
    outline-offset: 2px;
  }

  .aba.atual {
    border-color: var(--ds-gold-dim);
    background: var(--ds-gold-wash);
    color: var(--ds-gold-light);
    font-weight: 600;
  }

  /* A classe com luta rolando pisca no dourado, esteja ela escolhida ou não. */
  .aba.vivo {
    color: var(--ds-gold-light);
    animation: pisca-borda 1.8s ease-in-out infinite;
  }

  .aba-ponto {
    flex: none;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--ds-gold);
    animation: pulso 1.8s ease-in-out infinite;
  }

  @keyframes pulso {
    50% {
      opacity: 0.25;
    }
  }

  @keyframes pisca-borda {
    50% {
      border-color: var(--ds-gold);
      background: var(--ds-gold-wash);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .aba-ponto,
    .aba.vivo {
      animation: none;
    }

    .aba.vivo {
      border-color: var(--ds-gold-dim);
    }
  }

  .resumo {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 14px 0 0;
    padding: 0;
    list-style: none;
  }

  .resumo-abrir {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 5px;
    width: 100%;
    padding: 12px 14px;
    border: 1px solid var(--ds-line);
    border-radius: 12px;
    background: var(--ds-surface);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition:
      border-color 0.15s ease,
      background 0.15s ease;
  }

  .resumo-abrir:hover {
    border-color: var(--ds-gold-dim);
    background: var(--ds-gold-wash);
  }

  .resumo-abrir:focus-visible {
    outline: 2px solid var(--ds-gold-light);
    outline-offset: 2px;
  }

  .resumo > li.vivo > .resumo-abrir,
  .resumo > li.fechada > .resumo-abrir {
    border-color: var(--ds-gold-dim);
  }

  .resumo-cab {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .resumo-classe {
    font-family: var(--ds-font-display);
    font-size: 1rem;
    color: var(--ds-gold-light);
  }

  .resumo-selo {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--ds-gold);
  }

  .resumo-jogo {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 8px;
    font-size: 0.9rem;
    color: var(--ds-text-2);
  }

  .resumo-placar {
    font-family: var(--ds-font-display);
    color: var(--ds-gold);
    font-variant-numeric: tabular-nums;
  }

  .resumo-campeao {
    font-size: 0.9rem;
    color: var(--ds-text-2);
  }

  .resumo-obs {
    font-size: 0.78rem;
    color: var(--ds-text-5);
  }
</style>
