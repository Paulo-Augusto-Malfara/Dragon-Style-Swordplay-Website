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
  interface Pedido {
    titulo: string;
    /** A consequência, em uma frase. */
    texto?: string;
    /** Rótulo do botão que confirma. */
    acao?: string;
    /** Pinta o botão de confirmar de vermelho. */
    perigo?: boolean;
  }

  let dialogo: HTMLDialogElement;
  let pedido = $state<Pedido | null>(null);
  let responder: ((ok: boolean) => void) | null = null;

  export function pedir(p: Pedido): Promise<boolean> {
    pedido = p;
    dialogo.showModal();
    return new Promise((r) => (responder = r));
  }

  function fechar(ok: boolean) {
    // Zera antes de fechar: close() dispara o evento "close", que chama
    // fechar(false) de novo, e sem isso um "sim" viraria "não" no caminho.
    const r = responder;
    responder = null;
    if (dialogo.open) dialogo.close();
    r?.(ok);
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
    <div class="confirmar-acoes">
      <button type="button" class="btn btn-ghost" onclick={() => fechar(false)}>Cancelar</button>
      <button
        type="button"
        class="btn {pedido.perigo ? 'btn-danger' : 'btn-primary'}"
        onclick={() => fechar(true)}
      >
        {pedido.acao ?? "Confirmar"}
      </button>
    </div>
  {/if}
</dialog>

<style>
  .confirmar {
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

  .confirmar-acoes {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
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
