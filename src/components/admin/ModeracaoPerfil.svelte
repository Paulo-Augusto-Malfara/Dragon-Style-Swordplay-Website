<script lang="ts">
  /**
   * Fila de aprovação de foto e apelido.
   *
   * A foto vive num bucket privado e é vista aqui por URL assinada, que expira.
   * Isso é de propósito: se ela virasse link público pra pré-visualizar, o
   * conteúdo que a fila existe pra barrar já estaria no ar, alcançável por quem
   * tivesse o endereço, que é exatamente o que se quer evitar.
   *
   * A fila tem DUAS origens, e elas se aprovam de um jeito diferente:
   *
   * 1. Foto do próprio membro: mora no bucket privado `avatars-pendentes`, sob
   *    o `auth_user_id`. Aprovar precisa copiar de bucket, e quem copia é a
   *    função de borda, porque o Postgres não move arquivo.
   * 2. Foto que o staff subiu no recrutamento (`foto_pendente_url`): já nasce
   *    no bucket público, porque o membro novo muitas vezes nem tem conta de
   *    login ainda, e o caminho do bucket privado é o `auth_user_id`. Aqui
   *    aprovar é só carimbar a URL, sem mexer em arquivo.
   */
  import { supabase } from "../../lib/supabase-browser";

  const VALIDADE_PREVIA = 300; // segundos; só precisa durar a olhada

  type Pendente = {
    id_membro: number;
    nome: string;
    apelido: string | null;
    auth_user_id: string | null;
    foto_pendente_em: string | null;
    /** Preenchida só quando a foto veio do recrutamento, feito por staff. */
    foto_pendente_url: string | null;
    apelido_pendente: string | null;
    apelido_pendente_em: string | null;
    previa?: string | null;
  };

  let fila = $state<Pendente[]>([]);
  let carregando = $state(true);
  let erro = $state("");
  let ocupado = $state<number | null>(null);
  // Recusa pede motivo, e o motivo é o que o membro vai ler. Fica em campo na
  // própria linha em vez de prompt() do navegador: o painel já tirou as caixas
  // nativas justamente porque no aplicativo instalado elas parecem erro do
  // sistema, e um prompt não deixa nem escrever com calma.
  let recusando = $state<{ id: number; tipo: "foto" | "apelido" } | null>(null);
  let motivo = $state("");

  async function carregar() {
    carregando = true;
    erro = "";
    const { data, error } = await supabase
      .from("dMembros")
      .select(
        "id_membro, nome, apelido, auth_user_id, foto_pendente_em, foto_pendente_url, apelido_pendente, apelido_pendente_em",
      )
      .or("foto_pendente_em.not.is.null,apelido_pendente.not.is.null")
      .order("foto_pendente_em", { ascending: true, nullsFirst: false });

    if (error) {
      erro = error.message;
      carregando = false;
      return;
    }

    const itens = (data ?? []) as Pendente[];
    // Uma assinatura por foto. Falha de assinatura não derruba a fila: o item
    // aparece sem prévia e ainda dá pra recusar, que é a ação mais urgente.
    await Promise.all(
      itens.map(async (m) => {
        if (!m.foto_pendente_em) return;
        // A do recrutamento já é URL pública: não tem o que assinar.
        if (m.foto_pendente_url) {
          m.previa = m.foto_pendente_url;
          return;
        }
        if (!m.auth_user_id) return;
        const { data: assinada } = await supabase.storage
          .from("avatars-pendentes")
          .createSignedUrl(`${m.auth_user_id}/avatar.webp`, VALIDADE_PREVIA);
        m.previa = assinada?.signedUrl ?? null;
      }),
    );

    fila = itens;
    carregando = false;
  }

  async function aprovarFoto(m: Pendente) {
    ocupado = m.id_membro;
    erro = "";
    try {
      // Recrutamento: o arquivo já está no bucket público, então aprovar é
      // carimbar a URL no cadastro. Nada pra copiar, nada pra função de borda.
      if (m.foto_pendente_url) {
        const { error } = await supabase.rpc("aplicar_foto_aprovada", {
          p_id_membro: m.id_membro,
          p_url: m.foto_pendente_url,
        });
        if (error) throw new Error(error.message);
        await carregar();
        return;
      }

      const { data: sessao } = await supabase.auth.getSession();
      const token = sessao.session?.access_token;
      if (!token) throw new Error("Sessão expirada, entre de novo.");

      // A cópia entre buckets é feita pela função de borda: o Postgres não move
      // arquivo de storage, e fazer isso daqui deixaria o cadastro e o arquivo
      // podendo discordar se algo falhasse no meio.
      const resposta = await fetch(
        `${import.meta.env.PUBLIC_SUPABASE_URL}/functions/v1/aprovar-foto`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ id_membro: m.id_membro }),
        },
      );
      const corpo = await resposta.json();
      if (!resposta.ok) throw new Error(corpo?.erro ?? "Falha ao aprovar a foto.");
      await carregar();
    } catch (e) {
      erro = e instanceof Error ? e.message : String(e);
    } finally {
      ocupado = null;
    }
  }

  function abrirRecusa(m: Pendente, tipo: "foto" | "apelido") {
    recusando = { id: m.id_membro, tipo };
    motivo = "";
  }

  async function confirmarRecusa(m: Pendente) {
    if (!recusando) return;
    const tipo = recusando.tipo;
    ocupado = m.id_membro;
    erro = "";
    const { error } = await supabase.rpc(tipo === "foto" ? "recusar_foto" : "recusar_apelido", {
      p_id_membro: m.id_membro,
      p_motivo: motivo,
    });
    ocupado = null;
    if (error) {
      erro = error.message;
      return;
    }
    recusando = null;
    await carregar();
  }

  async function aprovarApelido(m: Pendente) {
    ocupado = m.id_membro;
    erro = "";
    const { error } = await supabase.rpc("aprovar_apelido", { p_id_membro: m.id_membro });
    ocupado = null;
    if (error) {
      erro = error.message;
      return;
    }
    await carregar();
  }

  const quando = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "";

  carregar();
</script>

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
  <p class="vazio">Nada esperando aprovação. Foto e apelido novos aparecem aqui.</p>
{:else}
  <ul class="fila">
    {#each fila as m (m.id_membro)}
      <li class="fila-item">
        <div class="fila-cab">
          <span class="fila-nome">{m.nome}</span>
          {#if m.apelido}
            <span class="fila-atual">hoje aparece como "{m.apelido}"</span>
          {/if}
        </div>

        {#if m.foto_pendente_em}
          <div class="pedido">
            <div class="pedido-corpo">
              {#if m.previa}
                <img class="previa" src={m.previa} alt={`Foto enviada por ${m.nome}`} />
              {:else}
                <div class="previa previa-falha">sem prévia</div>
              {/if}
              <div>
                <p class="pedido-tipo">Foto de perfil</p>
                <p class="pedido-quando">enviada em {quando(m.foto_pendente_em)}</p>
              </div>
            </div>
            <div class="pedido-acoes">
              <button
                class="btn btn-sm btn-primary"
                disabled={ocupado === m.id_membro}
                onclick={() => aprovarFoto(m)}
              >
                Aprovar
              </button>
              <button
                class="btn btn-sm btn-danger"
                disabled={ocupado === m.id_membro}
                onclick={() => abrirRecusa(m, "foto")}
              >
                Recusar
              </button>
            </div>

            {#if recusando?.id === m.id_membro && recusando.tipo === "foto"}
              <form
                class="recusa"
                onsubmit={(e) => {
                  e.preventDefault();
                  confirmarRecusa(m);
                }}
              >
                <label>
                  Motivo, que o membro vai ler
                  <input
                    type="text"
                    bind:value={motivo}
                    placeholder="Fora das regras de conduta do grupo."
                    required
                  />
                </label>
                <div class="recusa-acoes">
                  <button type="submit" class="btn btn-sm btn-danger" disabled={ocupado === m.id_membro}>
                    Confirmar recusa
                  </button>
                  <button type="button" class="btn btn-sm btn-ghost" onclick={() => (recusando = null)}>
                    Cancelar
                  </button>
                </div>
              </form>
            {/if}
          </div>
        {/if}

        {#if m.apelido_pendente}
          <div class="pedido">
            <div class="pedido-corpo">
              <div>
                <p class="pedido-tipo">Apelido: <strong>{m.apelido_pendente}</strong></p>
                <p class="pedido-quando">enviado em {quando(m.apelido_pendente_em)}</p>
              </div>
            </div>
            <div class="pedido-acoes">
              <button
                class="btn btn-sm btn-primary"
                disabled={ocupado === m.id_membro}
                onclick={() => aprovarApelido(m)}
              >
                Aprovar
              </button>
              <button
                class="btn btn-sm btn-danger"
                disabled={ocupado === m.id_membro}
                onclick={() => abrirRecusa(m, "apelido")}
              >
                Recusar
              </button>
            </div>

            {#if recusando?.id === m.id_membro && recusando.tipo === "apelido"}
              <form
                class="recusa"
                onsubmit={(e) => {
                  e.preventDefault();
                  confirmarRecusa(m);
                }}
              >
                <label>
                  Motivo, que o membro vai ler
                  <input
                    type="text"
                    bind:value={motivo}
                    placeholder="Fora das regras de conduta do grupo."
                    required
                  />
                </label>
                <div class="recusa-acoes">
                  <button type="submit" class="btn btn-sm btn-danger" disabled={ocupado === m.id_membro}>
                    Confirmar recusa
                  </button>
                  <button type="button" class="btn btn-sm btn-ghost" onclick={() => (recusando = null)}>
                    Cancelar
                  </button>
                </div>
              </form>
            {/if}
          </div>
        {/if}
      </li>
    {/each}
  </ul>
{/if}

<style>
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
    padding: 13px 15px;
    border: 1px solid var(--ds-line);
    border-radius: 12px;
    background: var(--ds-surface);
  }

  .fila-cab {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 10px;
  }

  .fila-nome {
    font-family: var(--ds-font-display);
    font-size: 1rem;
    color: var(--ds-gold-light);
  }

  .fila-atual {
    font-size: 0.76rem;
    color: var(--ds-text-5);
  }

  /* Um pedido por bloco: a mesma pessoa pode ter foto e apelido esperando, e
     aprovar um não decide nada sobre o outro. */
  .pedido {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 0;
    border-top: 1px solid var(--ds-line);
  }

  .pedido-corpo {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  /* Grande o bastante pra decidir sem abrir em outra aba. */
  .previa {
    flex: none;
    width: 76px;
    height: 76px;
    border-radius: 50%;
    border: 1px solid var(--ds-line-strong);
    object-fit: cover;
    background: var(--ds-bg-alt);
  }

  .previa-falha {
    display: grid;
    place-items: center;
    font-size: 0.68rem;
    color: var(--ds-text-5);
    text-align: center;
  }

  .pedido-tipo {
    margin: 0;
    font-size: 0.92rem;
    color: var(--ds-text-2);
  }

  .pedido-quando {
    margin: 2px 0 0;
    font-size: 0.76rem;
    color: var(--ds-text-5);
  }

  .pedido-acoes {
    display: flex;
    gap: 8px;
  }

  /* Ocupa a linha inteira: o motivo é texto e não cabe espremido ao lado dos
     botões. */
  .recusa {
    flex-basis: 100%;
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 8px;
    margin-top: 4px;
  }

  .recusa label {
    flex: 1 1 240px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.76rem;
    color: var(--ds-text-5);
  }

  .recusa input {
    min-height: 2.5em;
    padding: 0.5em 0.7em;
    border: 1px solid var(--ds-line-strong);
    border-radius: 10px;
    background: var(--ds-bg-alt);
    color: var(--ds-text-1);
    font-family: var(--ds-font-body);
    font-size: 0.9rem;
  }

  .recusa input:focus {
    border-color: var(--ds-gold);
    box-shadow: 0 0 0 3px var(--ds-gold-wash);
    outline: none;
  }

  .recusa-acoes {
    display: flex;
    gap: 8px;
  }
</style>
