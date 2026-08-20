import { createClient } from "@supabase/supabase-js";

// Anonymous, cookie-free client for server-rendered public reads
// (RLS's public_select policies apply, no session needed).
//
// As duas opções não são ajuste fino, são a trava que deixa este singleton
// seguro. Ele é criado uma vez por instância e, com o Fluid Compute, uma
// instância atende várias requisições ao mesmo tempo: qualquer sessão guardada
// aqui dentro seria compartilhada entre pessoas diferentes. Hoje ninguém
// autentica neste cliente, então não há o que guardar, mas o padrão do
// createClient é `persistSession: true`, e num servidor sem storage isso cai
// em memória, dentro do próprio objeto. Uma chamada de auth adicionada por
// distração aqui viraria vazamento de login entre usuários. Desligado, não vira.
// O autoRefreshToken vai junto porque sem sessão ele só deixaria um timer de
// fundo vivo no servidor.
export const supabasePublic = createClient(
  import.meta.env.PUBLIC_SUPABASE_URL,
  import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);
