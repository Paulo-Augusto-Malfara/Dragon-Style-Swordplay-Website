<script lang="ts">
  /**
   * Confirmação de ação, no lugar do confirm() do navegador.
   *
   * O painel tinha catorze confirm(), e cinco deles em dupla: excluir um item
   * pedia "Excluir este item?" e logo depois "Essa ação não pode ser desfeita.
   * Confirma?". Duas caixas seguidas não protegem ninguém, porque a segunda
   * chega quando a pessoa já decidiu e vira reflexo de OK. E a caixa do
   * navegador aparece com o endereço do site em cima dela, o que no aplicativo
   * instalado parece erro do sistema, não pergunta do painel.
   *
   * Aqui é uma pergunta só, com o nome do que vai ser apagado no título e a
   * consequência escrita embaixo, que é onde o aviso realmente serve. O botão
   * de cancelar recebe o foco de propósito: Enter fecha sem apagar nada.
   *
   * <dialog> nativo carrega sozinho o fundo escurecido, a armadilha de foco,
   * o Esc pra fechar e o retorno do foco pro botão que abriu.
   *
   * Uso:
   *   let confirmar: ConfirmarAcao;
   *   ...
   *   <ConfirmarAcao bind:this={confirmar} />
   *   if (!(await confirmar.pedir({ titulo: "...", perigo: true }))) return;
   */
  interface Campo {
    /** Rótulo em cima da caixa de texto. */
    rotulo: string;
    /** Sem texto, o botão de confirmar fica desligado. */
    obrigatorio?: boolean;
    /** Exige esta palavra exata pra liberar o botão, sem ligar pra maiúscula
        nem pra espaço em volta. É pra ação que não tem volta: escrever a
        palavra é o que separa decidir de esbarrar no botão. */
    deveSer?: string;
    dica?: string;
    max?: number;
  }

  interface Pedido {
    titulo: string;
    /** A consequência, em uma frase. */
    texto?: string;
    /** Rótulo do botão que confirma. */
    acao?: string;
    /** Pinta o botão de confirmar de vermelho. */
    perigo?: boolean;
    /** Pede um texto junto da confirmação. Ver `pedirComTexto`. */
    campo?: Campo;
  }

  let dialogo: HTMLDialogElement;
  let pedido = $state<Pedido | null>(null);
  let valor = $state("");
  let responder: ((r: any) => void) | null = null;

  const faltaTexto = $derived(
    !!pedido?.campo?.deveSer
      ? valor.trim().toLowerCase() !== pedido.campo.deveSer.toLowerCase()
      : !!pedido?.campo?.obrigatorio && valor.trim().length === 0,
  );

  export function pedir(p: Pedido): Promise<boolean> {
    pedido = p;
    valor = "";
    dialogo.showModal();
    return new Promise((r) => (responder = r));
  }

  /* Mesma caixa, com um texto junto. Devolve o que foi escrito, ou null se a
     pessoa cancelou. Função à parte porque `pedir` devolve booleano em catorze
     lugares do painel, e string vazia é falsa: misturar as duas trocaria um
     "sim" por "não" no dia em que alguém confirmasse sem escrever nada. */
  export function pedirComTexto(p: Pedido & { campo: Campo }): Promise<string | null> {
    pedido = p;
    valor = "";
    dialogo.showModal();
    return new Promise((r) => (responder = r));
  }

  /* Cursor na caixa assim que ela aparece: quem confirmou já quer escrever. */
  function focar(node: HTMLTextAreaElement) {
    node.focus();
  }

  function fechar(ok: boolean) {
    // Zera antes de fechar: close() dispara o evento "close", que chama
    // fechar(false) de novo, e sem isso um "sim" viraria "não" no caminho.
    const r = responder;
    const comCampo = !!pedido?.campo;
    const texto = valor.trim();
    responder = null;
    if (dialogo.open) dialogo.close();
    if (!r) return;
    r(comCampo ? (ok ? texto : null) : ok);
  }
</script>

<dialog
  bind:this={dialogo}
  class="confirmar"
  role="alertdialog"
  aria-labelledby="confirmar-titulo"
  onclose={() => fechar(false)}
  onclick={(e) => {
    if (e.target === dialogo) fechar(false);
  }}
>
  {#if pedido}
    <h2 id="confirmar-titulo">{pedido.titulo}</h2>
    {#if pedido.texto}
      <p>{pedido.texto}</p>
    {/if}
    {#if pedido.campo}
      <label class="confirmar-campo">
        {pedido.campo.rotulo}
        <textarea
          bind:value={valor}
          rows={pedido.campo.deveSer ? 1 : 3}
          maxlength={pedido.campo.max ?? 1000}
          use:focar
        ></textarea>
        {#if pedido.campo.dica}
          <small>{pedido.campo.dica}</small>
        {/if}
      </label>
    {/if}
    <div class="confirmar-acoes">
      <button type="button" class="btn btn-ghost" onclick={() => fechar(false)}>Cancelar</button>
      <button
        type="button"
        class="btn {pedido.perigo ? 'btn-danger' : 'btn-primary'}"
        disabled={faltaTexto}
        onclick={() => fechar(true)}
      >
        {pedido.acao ?? "Confirmar"}
      </button>
    </div>
  {/if}
</dialog>

<style>
  .confirmar {
    /* O navegador centraliza <dialog> modal com um `margin: auto` na folha
       dele, e o `* { margin: 0 }` do reset do site apaga esse auto: a caixa
       grudava no alto da tela. A busca já contorna isso na mão (ver o margin
       do #busca-dialog), esta faltava. Uma pergunta que interrompe o trabalho
       pertence ao meio da tela, que é pra onde o olho vai. */
    margin: auto;
    width: min(420px, calc(100vw - 2rem));
    padding: clamp(1.1rem, 4vw, 1.5rem);
    border: 1px solid var(--ds-line-strong);
    border-radius: var(--card-radius);
    background: var(--ds-surface-solid);
    color: var(--ds-text-1);
    box-shadow: var(--card-shadow-alta);
  }

  .confirmar::backdrop {
    background: rgba(5, 8, 11, 0.72);
  }

  .confirmar h2 {
    margin: 0 0 0.5em;
    font-family: var(--ds-font-display);
    font-size: 1.15rem;
    line-height: 1.3;
    color: var(--ds-gold-light);
  }

  .confirmar p {
    margin: 0;
    font-size: 0.92rem;
    line-height: 1.55;
    color: var(--ds-text-3);
  }

  .confirmar-campo {
    display: flex;
    flex-direction: column;
    gap: 0.4em;
    margin-top: 1em;
    font-size: 0.78rem;
    font-weight: 500;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ds-text-4);
    text-align: left;
  }

  /* A caixa fica fora de um `.admin-form`, que é onde mora o desenho dos
     campos do painel. Sem isto ela sai branca e monoespaçada. */
  .confirmar-campo textarea {
    padding: 0.6em 0.8em;
    border: 1px solid var(--ds-line-strong);
    border-radius: 10px;
    background: var(--ds-bg-alt);
    color: var(--ds-text-1);
    font-family: var(--ds-font-body);
    font-size: 0.95rem;
    font-weight: 400;
    letter-spacing: normal;
    text-transform: none;
    line-height: 1.55;
    resize: vertical;
  }

  .confirmar-campo small {
    font-size: 0.72rem;
    font-weight: 400;
    letter-spacing: normal;
    text-transform: none;
  }

  .confirmar-acoes {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.6em;
    margin-top: 1.3em;
  }

  .confirmar-acoes :global(.btn) {
    flex: 1 1 auto;
  }

  @media (min-width: 480px) {
    .confirmar-acoes :global(.btn) {
      flex: none;
    }
  }
</style>
