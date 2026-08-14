<script lang="ts">
  import { onMount } from "svelte";

  /**
   * Entrada da área do membro no cabeçalho.
   *
   * Logado, é um círculo com a foto (ou a inicial). O nome saía escrito aqui e
   * era largura imprevisível: "Zé" e "Maria Fernanda" empurram o logo e a busca
   * de formas diferentes, e num cabeçalho grudado a largura é o recurso mais
   * disputado. O círculo mede sempre 34px, então o cabeçalho para de mudar de
   * layout dependendo de quem entrou. O nome continua acessível pelo
   * aria-label, que é onde ele serve de verdade.
   */
  let nome = $state<string | null>(null);
  let fotoUrl = $state<string | null>(null);
  let carregado = $state(false);

  const inicial = $derived((nome ?? "").trim().charAt(0).toUpperCase());

  onMount(async () => {
    // ponytail: Header.astro (and this island) render on every page, including
    // the 40 pages that are prerendered at build time -- Astro SSRs a Svelte
    // island once to produce that static HTML even for client:idle. Importing
    // the Supabase client at module scope ran createBrowserClient() during
    // that SSR pass too, which crashed the whole build if the Supabase env
    // vars weren't set at build time. Deferring the import into onMount means
    // this only ever runs in an actual browser, after hydration.
    const { supabase } = await import("../../lib/supabase-browser");
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      carregado = true;
      return;
    }

    const { data: membro } = await supabase
      .from("dMembros")
      .select("nome, apelido, foto_url")
      .eq("auth_user_id", session.user.id)
      .single();

    nome = membro?.apelido || membro?.nome || "Minha conta";
    fotoUrl = membro?.foto_url ?? null;
    carregado = true;
  });
</script>

{#if nome}
  <a href="/dashboard" class="auth-avatar" aria-label={`Meu perfil, ${nome}`} title={nome}>
    {#if fotoUrl}
      <img src={fotoUrl} alt="" />
    {:else}
      <span aria-hidden="true">{inicial}</span>
    {/if}
  </a>
{:else}
  <!-- Enquanto a sessão não respondeu, o botão fica reservado no lugar em vez
       de aparecer do nada e empurrar o cabeçalho depois que a página assentou. -->
  <a href="/dashboard" class="auth-entrar" class:auth-esperando={!carregado}>Entrar</a>
{/if}

<style>
  .auth-avatar {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    flex: none;
    border-radius: 50%;
    border: 1px solid var(--ds-gold);
    background: var(--ds-bg-alt);
    overflow: hidden;
    font-family: var(--ds-font-display);
    font-size: 0.9rem;
    color: var(--ds-gold-light);
    text-decoration: none;
  }

  .auth-avatar:hover,
  .auth-avatar:focus-visible {
    border-color: var(--ds-gold-light);
  }

  .auth-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .auth-entrar {
    flex: none;
    padding: 8px 16px;
    border-radius: 999px;
    background: var(--ds-gold);
    color: var(--ds-bg);
    font-size: 0.82rem;
    font-weight: 500;
    text-decoration: none;
    white-space: nowrap;
  }

  .auth-entrar:hover,
  .auth-entrar:focus-visible {
    background: var(--ds-gold-light);
    color: var(--ds-bg);
  }

  .auth-esperando {
    /* Ocupa o lugar sem piscar "Entrar" pra quem está logado. */
    visibility: hidden;
  }
</style>
