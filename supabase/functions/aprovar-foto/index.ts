/**
 * Aprova a foto que está na fila: copia do bucket privado pro público e grava
 * a URL no cadastro.
 *
 * Existe porque o Postgres não move arquivo de storage. A alternativa seria o
 * navegador do organizador baixar e re-subir, mas aí uma falha no meio deixa o
 * cadastro apontando pra uma foto que não existe, ou a foto no ar sem estar
 * aprovada. Aqui os dois passos ficam no mesmo lugar, e a URL só é gravada
 * depois que a cópia deu certo.
 *
 * A chave de service role NUNCA vai pro navegador: ela é lida do ambiente da
 * função. Por isso a autorização é conferida aqui na mão, com o JWT de quem
 * chamou, antes de qualquer escrita.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { cors } from "./cors.ts";

const URL_SUPABASE = Deno.env.get("SUPABASE_URL")!;
const CHAVE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CHAVE_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.serve(async (req) => {
  const CORS = cors(req);
  const responde = (corpo: unknown, status: number) =>
    new Response(JSON.stringify(corpo), {
      status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const autorizacao = req.headers.get("Authorization") ?? "";
  if (!autorizacao) return responde({ erro: "Sem credencial" }, 401);

  // Cliente com o token de quem chamou: is_organizador() enxerga o usuário
  // certo e a checagem vale de verdade.
  const comoUsuario = createClient(URL_SUPABASE, CHAVE_ANON, {
    global: { headers: { Authorization: autorizacao } },
  });

  const { data: ehOrganizador, error: erroNivel } = await comoUsuario.rpc("is_organizador");
  if (erroNivel) return responde({ erro: erroNivel.message }, 500);
  if (!ehOrganizador) return responde({ erro: "Só organizador aprova foto" }, 403);

  let corpo: { id_membro?: number };
  try {
    corpo = await req.json();
  } catch {
    return responde({ erro: "Corpo inválido" }, 400);
  }
  const idMembro = Number(corpo.id_membro);
  if (!Number.isInteger(idMembro)) return responde({ erro: "id_membro inválido" }, 400);

  const admin = createClient(URL_SUPABASE, CHAVE_SERVICE);

  // O caminho sai do banco, não do corpo do pedido: quem chama não escolhe de
  // qual pasta copiar.
  const { data: membro, error: erroMembro } = await admin
    .from("dMembros")
    .select("id_membro, auth_user_id, foto_pendente_em")
    .eq("id_membro", idMembro)
    .single();

  if (erroMembro) return responde({ erro: erroMembro.message }, 500);
  if (!membro?.auth_user_id) return responde({ erro: "Membro sem login vinculado" }, 400);
  if (!membro.foto_pendente_em) return responde({ erro: "Nenhuma foto em análise" }, 409);

  const caminho = `${membro.auth_user_id}/avatar.webp`;

  const { data: arquivo, error: erroBaixa } = await admin.storage
    .from("avatars-pendentes")
    .download(caminho);
  if (erroBaixa || !arquivo) {
    return responde({ erro: `Foto pendente não encontrada: ${erroBaixa?.message ?? "vazia"}` }, 404);
  }

  const { error: erroSobe } = await admin.storage
    .from("avatars")
    .upload(caminho, arquivo, { upsert: true, contentType: "image/webp" });
  if (erroSobe) return responde({ erro: erroSobe.message }, 500);

  // Mesmo caminho sempre (upsert), então a query string é o que faz o navegador
  // parar de mostrar a foto antiga do cache.
  const { data: publico } = admin.storage.from("avatars").getPublicUrl(caminho);
  const url = `${publico.publicUrl}?v=${Date.now()}`;

  const { error: erroAplica } = await admin.rpc("aplicar_foto_aprovada", {
    p_id_membro: idMembro,
    p_url: url,
  });
  if (erroAplica) return responde({ erro: erroAplica.message }, 500);

  // Só agora sai da fila. Se a remoção falhar, a foto já está aprovada e no ar;
  // o arquivo órfão no bucket privado é lixo, não é defeito visível.
  await admin.storage.from("avatars-pendentes").remove([caminho]);

  return responde({ ok: true, foto_url: url }, 200);
});
