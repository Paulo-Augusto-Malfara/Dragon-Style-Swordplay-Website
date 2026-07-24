<script lang="ts">
  import { supabase } from "../../lib/supabase-browser";

  let email = $state("");
  let status = $state<"idle" | "sending" | "sent" | "error">("idle");
  let errorMessage = $state("");

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    status = "sending";
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/admin/callback` },
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
  <p>Link enviado! Confira seu email para entrar.</p>
{:else}
  <form onsubmit={submit}>
    <input type="email" bind:value={email} placeholder="seu@email.com" required />
    <button type="submit" disabled={status === "sending"}>
      {status === "sending" ? "Enviando..." : "Enviar link de acesso"}
    </button>
    {#if status === "error"}
      <p class="error">{errorMessage}</p>
    {/if}
  </form>
{/if}

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: 1em;
    max-width: 320px;
    margin: 2em auto;
  }
  input {
    padding: 0.6em;
    font-size: 1em;
  }
  button {
    padding: 0.6em;
    cursor: pointer;
  }
  .error {
    color: red;
  }
</style>
