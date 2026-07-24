import type { SupabaseClient } from "@supabase/supabase-js";

export async function getAdminMembro(supabase: SupabaseClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membro } = await supabase
    .from("dMembros")
    .select("id_membro, nome, auth_level")
    .eq("auth_user_id", user.id)
    .single();

  if (!membro || membro.auth_level > 2) return null;
  return membro;
}
