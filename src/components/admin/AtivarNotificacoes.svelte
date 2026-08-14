<script lang="ts">
  /**
   * Liga a notificação da fila de aprovação neste aparelho.
   *
   * É por aparelho, não por conta: o navegador guarda a inscrição junto com o
   * service worker, então ligar no celular não liga no computador. Por isso o
   * botão fala em "neste aparelho" e não em "na minha conta".
   *
   * O navegador só aceita o pedido de permissão dentro de um clique. Não dá
   * pra pedir sozinho ao abrir a tela, e nem seria bom: pedido de permissão
   * que chega sem a pessoa ter pedido é o que faz todo mundo clicar em
   * bloquear.
   */
  import { onMount } from "svelte";
  import { desinscrever, estadoAtual, inscrever, suportaPush, type EstadoPush } from "../../lib/push";

  let estado = $state<EstadoPush | "carregando">("carregando");
  let ocupado = $state(false);
  let erro = $state("");

  onMount(async () => {
    estado = suportaPush() ? await estadoAtual() : "sem-suporte";
  });

  async function alternar() {
    ocupado = true;
    erro = "";
    try {
      estado = estado === "inscrito" ? await desinscrever() : await inscrever();
    } catch (e) {
      erro = e instanceof Error ? e.message : String(e);
    } finally {
      ocupado = false;
    }
  }
</script>

{#if estado !== "carregando" && estado !== "sem-suporte"}
  <div class="notif">
    <div class="notif-texto">
      <p class="notif-titulo">
        {estado === "inscrito"
          ? "Notificação ligada neste aparelho"
          : "Avisar quando alguém enviar foto ou apelido"}
      </p>
      <p class="notif-nota">
        {#if estado === "negado"}
          O navegador está bloqueando notificações deste site. Libere nas configurações do site e
          recarregue a página.
        {:else if estado === "inscrito"}
          Este aparelho recebe um aviso assim que algo entra na fila de aprovação.
        {:else}
          Vale só para este aparelho. No celular, o aviso chega com o app instalado na tela inicial.
        {/if}
      </p>
      {#if erro}
        <p class="admin-error" role="alert">{erro}</p>
      {/if}
    </div>
    <button
      type="button"
      class="btn btn-sm {estado === 'inscrito' ? 'btn-ghost' : 'btn-primary'}"
      disabled={ocupado || estado === "negado"}
      onclick={alternar}
    >
      {#if ocupado}
        aguarde...
      {:else if estado === "inscrito"}
        Desligar
      {:else}
        Ligar
      {/if}
    </button>
  </div>
{/if}

<style>
  .notif {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    max-width: 760px;
    margin: 0 auto 1em;
    padding: 12px 15px;
    border: 1px solid var(--ds-line);
    border-radius: 12px;
    background: var(--ds-surface);
  }

  .notif-texto {
    flex: 1 1 240px;
    min-width: 0;
  }

  .notif-titulo {
    margin: 0;
    font-size: 0.92rem;
    color: var(--ds-text-2);
  }

  .notif-nota {
    margin: 3px 0 0;
    font-size: 0.78rem;
    line-height: 1.5;
    color: var(--ds-text-5);
  }
</style>
