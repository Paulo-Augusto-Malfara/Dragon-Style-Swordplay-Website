import { createClient } from "@supabase/supabase-js";

// Anonymous, cookie-free client for server-rendered public reads
// (RLS's public_select policies apply, no session needed).
export const supabasePublic = createClient(
  import.meta.env.PUBLIC_SUPABASE_URL,
  import.meta.env.PUBLIC_SUPABASE_ANON_KEY
);
