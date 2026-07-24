<script lang="ts">
  import { supabase } from "../../lib/supabase-browser";

  interface Props {
    redirectPath?: string;
  }
  const { redirectPath = "/" }: Props = $props();

  let email = $state("");
  let status = $state<"idle" | "sending" | "sent" | "error">("idle");
  let errorMessage = $state("");

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    status = "sending";
    const callback = `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectPath)}`;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callback },
    });
    if (error) {
      status = "error";
      errorMessage = error.message;
      return;
    }
    status = "sent";
  }
</script>

{#if status === "sent"}
  <p class="gold-title">Link enviado! Confira seu email para entrar.</p>
{:else}
  <form class="admin-form" onsubmit={submit}>
    <label>
      Email
      <input type="email" bind:value={email} placeholder="seu@email.com" required />
    </label>
    <button type="submit" class="btn btn-primary" disabled={status === "sending"}>
      {status === "sending" ? "Enviando..." : "Enviar link de acesso"}
    </button>
    {#if status === "error"}
      <p class="admin-error">{errorMessage}</p>
    {/if}
  </form>
{/if}
