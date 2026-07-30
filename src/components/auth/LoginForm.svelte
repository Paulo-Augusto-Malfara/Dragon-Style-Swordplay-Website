<script lang="ts">
  interface Props {
    redirectPath?: string;
  }
  const { redirectPath = "/" }: Props = $props();

  // ponytail: client-side cooldown so reloading/resubmitting the form can't be
  // used to spam OTP emails at a target address. Supabase also rate-limits
  // this server-side; this is just an extra, cheap layer.
  const RESEND_COOLDOWN_SECONDS = 30;
  const COOLDOWN_STORAGE_KEY = "ds-otp-last-sent-at";

  let email = $state("");
  let code = $state("");
  let step = $state<"email" | "code">("email");
  let status = $state<"idle" | "sending" | "verifying" | "error">("idle");
  let errorMessage = $state("");
  let cooldownSeconds = $state(0);

  function startCooldownTicker() {
    const interval = setInterval(() => {
      const lastSent = Number(sessionStorage.getItem(COOLDOWN_STORAGE_KEY) ?? 0);
      const elapsed = Math.floor((Date.now() - lastSent) / 1000);
      const remaining = RESEND_COOLDOWN_SECONDS - elapsed;
      cooldownSeconds = remaining > 0 ? remaining : 0;
      if (cooldownSeconds === 0) clearInterval(interval);
    }, 1000);
  }

  if (typeof sessionStorage !== "undefined") {
    const lastSent = Number(sessionStorage.getItem(COOLDOWN_STORAGE_KEY) ?? 0);
    const elapsed = Math.floor((Date.now() - lastSent) / 1000);
    if (elapsed < RESEND_COOLDOWN_SECONDS) {
      cooldownSeconds = RESEND_COOLDOWN_SECONDS - elapsed;
      startCooldownTicker();
    }
  }

  // ponytail: Supabase sometimes returns an unhelpful/empty message (e.g. "{}")
  // for retryable fetch errors -- fall back to something readable instead.
  function readableMessage(raw: string | undefined): string {
    if (!raw || raw === "{}") return "Não foi possível completar agora. Tente novamente em instantes.";
    const rateLimitMatch = raw.match(/after (\d+) seconds?/i);
    if (rateLimitMatch) {
      return `Por segurança, você só pode pedir um novo código em ${rateLimitMatch[1]} segundos.`;
    }
    return raw;
  }

  async function sendCode(e: SubmitEvent) {
    e.preventDefault();
    status = "sending";
    errorMessage = "";
    try {
      // ponytail: dynamic import, not a top-level one -- this component is used
      // inside dashboard.astro, a fully static page. A static import would
      // evaluate createBrowserClient() during Astro's SSR pass at build time,
      // which crashes the whole build if the Supabase env vars aren't set then.
      const { supabase } = await import("../../lib/supabase-browser");
      const { data: existe, error: checkError } = await supabase.rpc("email_tem_cadastro", {
        p_email: email,
      });
      if (checkError) {
        status = "error";
        errorMessage = readableMessage(checkError.message);
        return;
      }
      if (!existe) {
        status = "error";
        errorMessage = "Esse email não está vinculado a um cadastro de membro. Fale com um organizador.";
        return;
      }

      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) {
        status = "error";
        errorMessage = readableMessage(error.message);
        return;
      }
      sessionStorage.setItem(COOLDOWN_STORAGE_KEY, Date.now().toString());
      cooldownSeconds = RESEND_COOLDOWN_SECONDS;
      startCooldownTicker();
      step = "code";
      status = "idle";
    } catch (err) {
      status = "error";
      errorMessage = readableMessage(err instanceof Error ? err.message : String(err));
    }
  }

  async function verifyCode(e: SubmitEvent) {
    e.preventDefault();
    status = "verifying";
    errorMessage = "";
    try {
      const { supabase } = await import("../../lib/supabase-browser");
      const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
      if (error) {
        status = "error";
        errorMessage = readableMessage(error.message);
        return;
      }
      window.location.href = redirectPath;
    } catch (err) {
      status = "error";
      errorMessage = readableMessage(err instanceof Error ? err.message : String(err));
    }
  }

  function trocarEmail() {
    step = "email";
    code = "";
    status = "idle";
    errorMessage = "";
  }
</script>

{#if step === "email"}
  <form class="admin-form" onsubmit={sendCode}>
    <label>
      Email
      <input type="email" bind:value={email} placeholder="seu@email.com" required />
    </label>
    <button type="submit" class="btn btn-primary" disabled={status === "sending" || cooldownSeconds > 0}>
      {#if status === "sending"}
        Enviando...
      {:else if cooldownSeconds > 0}
        Aguarde {cooldownSeconds}s
      {:else}
        Enviar código de acesso
      {/if}
    </button>
    {#if status === "error"}
      <p class="admin-error">{errorMessage}</p>
    {/if}
  </form>
{:else}
  <form class="admin-form" onsubmit={verifyCode}>
    <p class="gold-title">Enviamos um código de 8 dígitos para {email}.</p>
    <label>
      Código de verificação
      <input
        type="text"
        inputmode="numeric"
        autocomplete="one-time-code"
        maxlength="8"
        bind:value={code}
        placeholder="00000000"
        required
      />
    </label>
    <button type="submit" class="btn btn-primary" disabled={status === "verifying"}>
      {status === "verifying" ? "Verificando..." : "Entrar"}
    </button>
    {#if status === "error"}
      <p class="admin-error">{errorMessage}</p>
    {/if}
    <button type="button" class="btn btn-sm" onclick={trocarEmail}>Usar outro email</button>
  </form>
{/if}
