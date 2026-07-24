<script lang="ts">
  import { supabase } from "../../lib/supabase-browser";

  let label = $state("Login");

  async function check() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    const { data: membro } = await supabase
      .from("dMembros")
      .select("nome")
      .eq("auth_user_id", session.user.id)
      .single();
    label = membro?.nome?.split(" ")[0] ?? "Minha Conta";
  }

  check();
</script>

<a href="/dashboard" class="auth-link">
  <svg class="icon header-icon" viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true">
    <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10m0 2c-4.4 0-8 2.2-8 5v3h16v-3c0-2.8-3.6-5-8-5" />
  </svg>
  <span>{label}</span>
</a>
