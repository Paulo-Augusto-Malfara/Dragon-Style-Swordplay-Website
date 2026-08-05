<script lang="ts">
  import { onMount } from "svelte";
  import { supabase } from "../../lib/supabase-browser";

  interface Props {
    idAgenda: number;
    contagemInicial: number;
    mostrarLista?: boolean;
  }
  const { idAgenda, contagemInicial, mostrarLista = false }: Props = $props();

  let carregandoSessao = $state(true);
  let logado = $state(false);
  let meuIdMembro: number | null = null;
  let jaConfirmado = $state(false);
  let contagem = $state(contagemInicial);
  let processando = $state(false);
  let erro = $state("");

  let listaAberta = $state(false);
  let confirmados = $state<{ nome: string; foto_url: string | null }[]>([]);
  let carregandoLista = $state(false);

  const textoContagem = $derived(contagem === 1 ? "1 Combatente Confirmado" : `${contagem} Combatentes Confirmados`);

  onMount(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session) {
      const { data: membro } = await supabase
        .from("dMembros")
        .select("id_membro")
        .eq("auth_user_id", session.user.id)
        .single();

      if (membro) {
        logado = true;
        meuIdMembro = membro.id_membro;

        const { data: minha } = await supabase
          .from("fAgendaConfirmacoes")
          .select("id_confirmacao")
          .eq("id_agenda", idAgenda)
          .eq("id_membro", membro.id_membro)
          .maybeSingle();
        jaConfirmado = !!minha;
      }
    }

    carregandoSessao = false;
  });

  async function carregarLista() {
    carregandoLista = true;
    const { data } = await supabase
      .from("v_agenda_confirmacoes")
      .select("nome, foto_url")
      .eq("id_agenda", idAgenda)
      .order("confirmado_em");
    confirmados = data ?? [];
    carregandoLista = false;
  }

  function toggleLista() {
    listaAberta = !listaAberta;
    if (listaAberta && confirmados.length === 0) carregarLista();
  }

  async function confirmar() {
    if (!meuIdMembro) return;
    if (!confirm("Confirmar sua presença neste treino?")) return;
    processando = true;
    erro = "";
    const { error } = await supabase.from("fAgendaConfirmacoes").insert({ id_agenda: idAgenda, id_membro: meuIdMembro });
    processando = false;
    if (error) {
      erro = error.message;
      return;
    }
    jaConfirmado = true;
    contagem += 1;
    if (listaAberta) await carregarLista();
  }

  async function cancelar() {
    if (!meuIdMembro) return;
    if (!confirm("Cancelar sua presença confirmada neste treino?")) return;
    processando = true;
    erro = "";
    const { error } = await supabase
      .from("fAgendaConfirmacoes")
      .delete()
      .eq("id_agenda", idAgenda)
      .eq("id_membro", meuIdMembro);
    processando = false;
    if (error) {
      erro = error.message;
      return;
    }
    jaConfirmado = false;
    contagem = Math.max(0, contagem - 1);
    if (listaAberta) await carregarLista();
  }
</script>

<div class="confirma-presenca">
  <p class="confirma-presenca-contagem">{textoContagem}</p>

  {#if mostrarLista}
    <details class="confirma-presenca-lista" bind:open={listaAberta} ontoggle={toggleLista}>
      <summary>Ver quem confirmou</summary>
      {#if carregandoLista}
        <p class="dashboard-empty">Carregando...</p>
      {:else if confirmados.length === 0}
        <p class="dashboard-empty">Ninguém confirmou ainda.</p>
      {:else}
        <ul class="confirma-presenca-membros">
          {#each confirmados as m}
            <li>
              <span class="row-avatar">
                {#if m.foto_url}
                  <img src={m.foto_url} alt="" />
                {:else}
                  {m.nome.charAt(0).toUpperCase()}
                {/if}
              </span>
              {m.nome}
            </li>
          {/each}
        </ul>
      {/if}
    </details>
  {/if}

  {#if !carregandoSessao}
    {#if !logado}
      <a class="btn btn-primary" href="/como-participar">Confirmar Presença</a>
    {:else if jaConfirmado}
      <button type="button" class="btn btn-sm" onclick={cancelar} disabled={processando}>
        {processando ? "Cancelando..." : "✓ Presença confirmada (cancelar)"}
      </button>
    {:else}
      <button type="button" class="btn btn-primary" onclick={confirmar} disabled={processando}>
        {processando ? "Confirmando..." : "Confirmar Presença"}
      </button>
    {/if}
    {#if erro}
      <p class="admin-error">{erro}</p>
    {/if}
  {/if}
</div>
