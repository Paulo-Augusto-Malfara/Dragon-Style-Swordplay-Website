<script lang="ts">
  /**
   * Membros que têm e-mail no cadastro mas ainda não têm login.
   *
   * Fica aqui, e não no cadastro, porque convidar é mandar um e-mail pra uma
   * pessoa de verdade. No `RecrutarMembro` o nome está sendo digitado no meio de
   * um treino, e disparar convite naquele segundo surpreende quem talvez nem
   * tenha pedido conta. Aqui o convite é uma decisão separada, com nome e
   * endereço na frente de quem clica.
   */
  import { supabase } from "../../lib/supabase-browser";

  const NIVEIS: Record<number, string> = {
    1: "admin do sistema",
    2: "organizador",
    3: "staff",
  };

  type SemLogin = {
    id_membro: number;
    nome: string;
    email: string;
    auth_level: number | null;
  };

  // A função de borda só convida nível 4, que é quem não tem privilégio nenhum:
  // assim o convite nunca cria acesso privilegiado sozinho. Quem tem cargo
  // aparece aqui do mesmo jeito, com o motivo no lugar do botão. Esconder seria
  // pior: some da lista, e daqui a um mês ninguém lembra por quê.
  const podeConvidar = (m: SemLogin) => (m.auth_level ?? 4) >= 4;

  let fila = $state<SemLogin[]>([]);
  let carregando = $state(true);
  let erro = $state("");
  let ocupado = $state<number | null>(null);
  let convidados = $state<Record<number, string>>({});

  async function carregar() {
    carregando = true;
    erro = "";
    const { data, error } = await supabase
      .from("dMembros")
      .select("id_membro, nome, email, auth_level")
      .not("email", "is", null)
      .is("auth_user_id", null)
      .order("nome");

    if (error) {
      erro = error.message;
      carregando = false;
      return;
    }

    fila = (data ?? []) as SemLogin[];
    carregando = false;
  }

  async function convidar(m: SemLogin) {
    ocupado = m.id_membro;
    erro = "";
    try {
      const { data: sessao } = await supabase.auth.getSession();
      const token = sessao.session?.access_token;
      if (!token) throw new Error("Sessão expirada, entre de novo.");

      const resposta = await fetch(
        `${import.meta.env.PUBLIC_SUPABASE_URL}/functions/v1/convidar-membro`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ id_membro: m.id_membro }),
        },
      );
      const corpo = await resposta.json();
      if (!resposta.ok) throw new Error(corpo?.erro ?? "Falha ao enviar o convite.");

      // O item some da lista no recarregar, porque o gatilho do banco já
      // preencheu o auth_user_id. A confirmação fica só pro caso de a lista
      // demorar, pra quem clicou não ficar sem resposta.
      convidados[m.id_membro] = "Convite enviado.";
      await carregar();
    } catch (e) {
      erro = e instanceof Error ? e.message : String(e);
    } finally {
      ocupado = null;
    }
  }

  carregar();
</script>

<section class="convites">
  <h2>Membros sem convite do sistema</h2>

  {#if erro}
    <p class="admin-error" role="alert">{erro}</p>
  {/if}

  {#if carregando}
    <div class="esqueleto-lista">
      {#each { length: 2 } as _}
        <div class="esqueleto esqueleto-linha"></div>
      {/each}
    </div>
  {:else if fila.length === 0}
    <p class="vazio">Todo mundo com e-mail no cadastro já tem login.</p>
  {:else}
    <ul class="fila">
      {#each fila as m (m.id_membro)}
        <li class="fila-item">
          <div class="pedido-corpo">
            <div>
              <p class="fila-nome">{m.nome}</p>
              <p class="pedido-quando">{m.email}</p>
            </div>
          </div>
          <div class="pedido-acoes">
            {#if !podeConvidar(m)}
              <span class="convite-travado">
                É {NIVEIS[m.auth_level ?? 4] ?? "membro"}. Baixe pra membro no painel de membros,
                convide, e devolva o cargo.
              </span>
            {:else}
              {#if convidados[m.id_membro]}
                <span class="convite-feito">{convidados[m.id_membro]}</span>
              {/if}
              <button
                class="btn btn-sm btn-primary"
                disabled={ocupado === m.id_membro}
                onclick={() => convidar(m)}
              >
                {ocupado === m.id_membro ? "Enviando..." : "Convidar"}
              </button>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .convites {
    margin-top: 26px;
  }

  .fila {
    list-style: none;
    max-width: 760px;
    margin: 0 auto;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .fila-item {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 13px 15px;
    border: 1px solid var(--ds-line);
    border-radius: 12px;
    background: var(--ds-surface);
  }

  .fila-nome {
    margin: 0;
    font-family: var(--ds-font-display);
    font-size: 1rem;
    color: var(--ds-gold-light);
  }

  .pedido-corpo {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .pedido-quando {
    margin: 2px 0 0;
    font-size: 0.76rem;
    color: var(--ds-text-5);
  }

  .pedido-acoes {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .convite-feito {
    font-size: 0.76rem;
    color: var(--ds-text-3);
  }

  /* Ocupa largura limitada pra não empurrar o nome pra fora da linha em telas
     estreitas: é uma explicação, não um alerta. */
  .convite-travado {
    max-width: 30ch;
    font-size: 0.74rem;
    line-height: 1.45;
    color: var(--ds-text-5);
    text-align: right;
  }
</style>
