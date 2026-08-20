<script lang="ts">
  /*
   * As imagens que acompanham uma pauta. Serve o mural (staff) e a lista do
   * perfil (o autor), que são os dois únicos lugares que podem ler o bucket.
   *
   * O bucket `pautas-anexos` é privado, então cada imagem precisa de uma URL
   * assinada e a assinatura vence. Por isso a lista é assinada toda vez que o
   * componente monta com caminhos novos, e nada é guardado: URL velha guardada
   * no cliente seria imagem quebrada meia hora depois.
   *
   * A imagem entra só como `<img>`, e é de propósito. Ela mora em outra origem
   * (*.supabase.co), e é lá que ela tem que continuar: nada de iframe, nada de
   * link "abrir o arquivo", nada de `{@html}`. Mesmo que um dia algo estranho
   * chegasse ao bucket, ele não teria como alcançar sessão nem cookie do site.
   */
  interface Props {
    caminhos: string[] | null;
    /** Cliente do Supabase, já pronto ou ainda como promessa. */
    cliente: any;
  }
  const { caminhos, cliente }: Props = $props();

  const VALIDADE = 60 * 10; // segundos; a janela raramente fica aberta mais que isso

  let urls = $state<string[]>([]);
  let ampliada = $state<string | null>(null);

  $effect(() => {
    const lista = caminhos ?? [];
    if (lista.length === 0) {
      urls = [];
      return;
    }
    let vivo = true;
    (async () => {
      const sb = await cliente;
      const { data } = await sb.storage.from("pautas-anexos").createSignedUrls(lista, VALIDADE);
      // Falha de assinatura some com a miniatura e não derruba a janela: o
      // texto da pauta é o que importa, a imagem é o complemento.
      if (vivo) urls = (data ?? []).map((d: any) => d.signedUrl).filter(Boolean);
    })();
    return () => {
      vivo = false;
    };
  });
</script>

{#if urls.length > 0}
  <p class="anexos-rotulo">{urls.length === 1 ? "Imagem anexada" : `${urls.length} imagens anexadas`}</p>
  <div class="anexos">
    {#each urls as url (url)}
      <button
        type="button"
        class="anexo"
        class:anexo--grande={ampliada === url}
        onclick={() => (ampliada = ampliada === url ? null : url)}
        aria-label={ampliada === url ? "Reduzir imagem" : "Ampliar imagem"}
      >
        <img src={url} alt="" loading="lazy" />
      </button>
    {/each}
  </div>
{/if}

<style>
  /* Cópia do `.det-rotulo` das duas telas que usam este componente. Não dá pra
     reaproveitar a classe delas: estilo de componente Svelte é escopado e não
     atravessa pra cá, e o `p { width: 90%; margin: auto }` do global.css pegava
     o parágrafo sem dono e deixava o rótulo encolhido e deslocado no meio. */
  .anexos-rotulo {
    width: 100%;
    margin: 4px 0 0;
    font-size: 0.68rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ds-text-4);
  }

  /* Fita de miniaturas. Clicar numa abre ela em largura cheia ali mesmo, em vez
     de uma segunda janela por cima da janela da pauta: no celular a janela de
     cima cobria a de baixo e o botão de fechar virava adivinhação. */
  .anexos {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .anexo {
    width: 84px;
    height: 84px;
    padding: 0;
    border: 1px solid var(--ds-line);
    border-radius: 10px;
    overflow: hidden;
    background: var(--ds-bg);
    cursor: zoom-in;
  }

  .anexo img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .anexo--grande {
    width: 100%;
    height: auto;
    max-height: 70vh;
    cursor: zoom-out;
  }

  .anexo--grande img {
    height: auto;
    max-height: 70vh;
    object-fit: contain;
  }
</style>
