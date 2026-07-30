import type { SupabaseClient } from "@supabase/supabase-js";

export async function getStaffMembro(supabase: SupabaseClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membro } = await supabase
    .from("dMembros")
    .select("id_membro, nome, auth_level, oculto")
    .eq("auth_user_id", user.id)
    .single();

  if (!membro || membro.oculto || membro.auth_level > 3) return null;

  return {
    ...membro,
    isOrganizador: membro.auth_level <= 2,
    isAdminSistema: membro.auth_level <= 1,
  };
}
