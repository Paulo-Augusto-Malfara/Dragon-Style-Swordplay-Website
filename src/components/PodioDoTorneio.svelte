<script lang="ts">
  /**
   * O pódio do torneio: um cartão por chave, com primeiro, segundo e terceiro.
   *
   * Quem decide quem é cada um é a `podio` do motor, e não esta tela: no
   * mata-mata o ouro e a prata saem da partida decisiva, e no suíço e no todos
   * contra todos o pódio é a classificação cortada em três.
   *
   * O painel e a tela pública usam o mesmo componente, e é por isso que os
   * nomes entram como função: no painel eles vêm da dMembros, e na tela pública
   * da v_torneio_equipes.
   */
  import { podio } from "../lib/torneio";

  interface Props {
    /** Ids de classe, ou [null] no torneio aberto. */
    chaves: (number | null)[];
    equipes: { id_equipe: number; id_classe?: number | null; seed?: number | null }[];
    partidas: any[];
    mataMata: boolean;
    porClasse: boolean;
    nomeDaClasse: (id: number | null) => string;
    nomeEquipe: (id: number | null) => string;
  }

  const { chaves, equipes, partidas, mataMata, porClasse, nomeDaClasse, nomeEquipe }: Props =
    $props();

  const MEDALHAS = ["1º", "2º", "3º"];

  const podios = $derived(
    chaves
      .map((id) => {
        const doGrupo = equipes.filter((e) => (e.id_classe ?? null) === id);
        const ids = new Set(doGrupo.map((e) => e.id_equipe));
        const daChave = partidas.filter(
          (p) => ids.has(p.id_equipe_a) || ids.has(p.id_equipe_b),
        );
        return { id, lugares: podio(doGrupo, daChave, mataMata) };
      })
      .filter((c) => c.lugares.length > 0),
  );
</script>

{#if podios.length > 0}
  <ul class="podio">
    {#each podios as c (c.id)}
      <li>
        {#if porClasse}<span class="podio-classe">{nomeDaClasse(c.id)}</span>{/if}
        <ol class="podio-lugares">
          {#each c.lugares as idEquipe, i (idEquipe)}
            <li class="pos-{i + 1}" class:ouro={i === 0}>
              <span class="podio-pos">{MEDALHAS[i]}</span>
              <span class="podio-nome">{nomeEquipe(idEquipe)}</span>
            </li>
          {/each}
        </ol>
      </li>
    {/each}
  </ul>
{/if}

<style>
  /* Cartão por chave. Com dez classes, uma linha inteira por campeão virava uma
     rolagem só de pódio; em grade elas cabem lado a lado. O 240px é o mínimo em
     que "1º" e um apelido comprido ainda dividem a linha na tela de 320px. */
  .podio {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .podio > li {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 13px 16px;
    border: 1px solid var(--ds-gold-dim);
    border-radius: 12px;
    background: var(--ds-gold-wash);
  }

  .podio-classe {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--ds-gold);
  }

  .podio-lugares {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .podio-lugares > li {
    display: flex;
    align-items: baseline;
    gap: 10px;
  }

  /* Filho direto, nunca descendente solto: seletor amplo aqui esticaria
     qualquer ficha aninhada junto com o nome. */
  .podio-lugares > li > .podio-pos {
    flex: none;
    min-width: 1.6em;
    font-family: var(--ds-font-display);
    font-size: 0.82rem;
    font-variant-numeric: tabular-nums;
  }

  /* Ouro, prata e bronze, os mesmos três do Ranking: a escala mora em tokens no
     global justamente para não haver duas leituras de 1º, 2º e 3º no site. */
  .podio-lugares > li.pos-1 > .podio-pos {
    color: var(--ds-gold-light);
  }

  .podio-lugares > li.pos-2 > .podio-pos {
    color: var(--ds-prata);
  }

  .podio-lugares > li.pos-3 > .podio-pos {
    color: var(--ds-bronze);
  }

  .podio-lugares > li > .podio-nome {
    flex: 1;
    min-width: 0;
    font-size: 0.88rem;
    color: var(--ds-text-3);
    overflow-wrap: anywhere;
  }

  /* Só o campeão sai em letra de título: o pódio inteiro em display viraria
     três nomes brigando pela mesma atenção. */
  .podio-lugares > li.ouro > .podio-nome {
    font-family: var(--ds-font-display);
    font-size: 1.05rem;
    color: var(--ds-gold-light);
  }
</style>
