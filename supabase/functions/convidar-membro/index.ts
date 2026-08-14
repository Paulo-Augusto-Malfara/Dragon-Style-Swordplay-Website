/**
 * Convida um membro que já está no cadastro a criar o login dele.
 *
 * Existe porque o cadastro aberto foi desligado no Supabase: ninguém mais se
 * registra sozinho, e sem uma linha em `auth.users` o pedido de código devolve
 * `signup_disabled`. O convite cria essa linha, e o gatilho
 * `on_auth_user_created_claim_membro` liga ela ao cadastro pelo e-mail sozinho.
 *
 * Duas decisões de segurança que não devem ser desfeitas sem saber por quê:
 *
 * 1. **O e-mail sai do banco, não do corpo do pedido.** Quem chama escolhe qual
 *    membro, nunca qual endereço. Sem isso a função vira uma máquina de mandar
 *    e-mail pra qualquer lugar, usando a cota e a reputação de envio do
 *    projeto. É a mesma proteção que o `aprovar-foto` usa pro caminho do
 *    arquivo.
 * 2. **A chave de service role nunca sai daqui.** A alternativa seria um
 *    gatilho no banco chamando HTTP por `pg_net`, o que exigiria guardar essa
 *    chave dentro do Postgres, e aí qualquer falha numa função SECURITY
 *    DEFINER viraria caminho pra ela. Mesmo raciocínio já registrado no
 *    `notificar-aprovacao`.
 * 3. **Só convida quem está em nível 4.** Convite cria acesso, e nível 4 não
 *    tem privilégio nenhum, então o pior resultado possível dessa função é uma
 *    conta que só enxerga o próprio perfil. Promover é um segundo ato,
 *    deliberado, no painel de membros, onde a policy de UPDATE já exige admin
 *    do sistema. Sem isso, um membro cadastrado como nível 1 e ainda sem login
 *    viraria admin com um clique só. Hoje quem convida já é admin e poderia
 *    fazer as duas coisas de qualquer jeito; a trava é o que segura o dia em
 *    que o convite for aberto pra organizador ou staff, que é uma mudança de
 *    uma linha aqui em cima.
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

  // Cliente com o token de quem chamou: a checagem de nível enxerga o usuário
  // certo e vale de verdade, em vez de confiar no que a tela desenhou.
  const comoUsuario = createClient(URL_SUPABASE, CHAVE_ANON, {
    global: { headers: { Authorization: autorizacao } },
  });

  // Nível 1, o mesmo que abre a página de aprovações. Convite é criação de
  // acesso ao painel, então acompanha a permissão mais estreita, não a de quem
  // só cadastra membro.
  const { data: ehAdmin, error: erroNivel } = await comoUsuario.rpc("is_admin_sistema");
  if (erroNivel) return responde({ erro: erroNivel.message }, 500);
  if (!ehAdmin) return responde({ erro: "Só o admin do sistema convida membro" }, 403);

  let corpo: { id_membro?: number };
  try {
    corpo = await req.json();
  } catch {
    return responde({ erro: "Corpo inválido" }, 400);
  }
  const idMembro = Number(corpo.id_membro);
  if (!Number.isInteger(idMembro)) return responde({ erro: "id_membro inválido" }, 400);

  const admin = createClient(URL_SUPABASE, CHAVE_SERVICE);

  const { data: membro, error: erroMembro } = await admin
    .from("dMembros")
    .select("id_membro, nome, email, auth_user_id, auth_level")
    .eq("id_membro", idMembro)
    .single();

  if (erroMembro) return responde({ erro: erroMembro.message }, 500);
  if (!membro) return responde({ erro: "Membro não encontrado" }, 404);
  if (!membro.email) {
    return responde({ erro: "Esse membro não tem e-mail no cadastro" }, 400);
  }
  // `coalesce(auth_level, 4) >= 4` é a mesma expressão da policy `staff_insert`
  // da dMembros. Vale a pena ser literalmente igual: as duas respondem "esta
  // linha é de alguém sem privilégio?", e se um dia a definição mudar, quem
  // procurar vai achar os dois lugares de uma vez.
  if ((membro.auth_level ?? 4) < 4) {
    return responde(
      {
        erro:
          "Esse membro tem cargo no sistema. Baixe pra membro no painel de membros, convide, " +
          "e devolva o cargo depois.",
      },
      403,
    );
  }
  // Já tem login: reconvidar só serviria pra mandar e-mail repetido pra uma
  // pessoa de verdade.
  if (membro.auth_user_id) {
    return responde({ erro: "Esse membro já tem login" }, 409);
  }

  // Sem `redirectTo`: o link do convite cai na Site URL configurada no projeto.
  // Passar um endereço daqui só criaria mais um lugar pra desconfigurar, e o
  // link nem é o essencial: o que destrava a entrada é a linha em `auth.users`
  // existir, então a pessoa pode ignorar o convite e pedir o código normalmente.
  const { error: erroConvite } = await admin.auth.admin.inviteUserByEmail(membro.email);

  if (erroConvite) {
    // Já existe usuário com esse e-mail, mas o cadastro do membro não aponta
    // pra ele. Acontece quando o e-mail foi corrigido depois que a pessoa já
    // tinha entrado, e o gatilho de vínculo não roda de novo.
    if (erroConvite.status === 422) {
      return responde(
        { erro: "Já existe um login com esse e-mail, mas ele não está vinculado a este membro." },
        409,
      );
    }
    return responde({ erro: erroConvite.message }, 500);
  }

  return responde({ ok: true, nome: membro.nome }, 200);
});
