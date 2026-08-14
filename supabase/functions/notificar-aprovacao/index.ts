/**
 * Avisa quem administra o sistema que tem coisa esperando aprovação.
 *
 * Quem chama é o próprio membro, logo depois de mandar foto ou apelido. Isso
 * é de propósito: a alternativa seria um gatilho no banco chamando HTTP por
 * pg_net, o que exige a extensão e a chave de service role guardada dentro do
 * Postgres. Como notificação perdida não é falha de segurança (a fila continua
 * lá, e o painel mostra a contagem), não vale essa máquina toda.
 *
 * Duas travas impedem isso de virar canal de spam, e são travas diferentes:
 *
 * 1. Quem chamou precisa REALMENTE ter algo pendente no banco. Isso barra quem
 *    não tem pendência nenhuma.
 * 2. A última notificação precisa ter saído há mais de JANELA_MIN minutos. Isso
 *    barra a repetição de quem TEM pendência, que a trava 1 sozinha deixava
 *    passar: bastava chamar a função em sequência enquanto a foto não fosse
 *    aprovada pra fazer o celular de quem administra apitar sem parar.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { cors } from "./cors.ts";

const URL_SUPABASE = Deno.env.get("SUPABASE_URL")!;
const CHAVE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CHAVE_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const VAPID_PUBLICA = Deno.env.get("VAPID_PUBLICA")!;
const VAPID_PRIVADA = Deno.env.get("VAPID_PRIVADA")!;
const VAPID_CONTATO = Deno.env.get("VAPID_CONTATO") ?? "mailto:papito.paulo@gmail.com";

// Quanto tempo tem que passar entre duas notificações disparadas pelo mesmo
// membro. Dez minutos é folgado pro caso legítimo (mandar foto e depois apelido
// vira um aviso só, e a fila continua aparecendo no painel de qualquer jeito) e
// apertado o bastante pra repetição não incomodar ninguém.
const JANELA_MIN = 10;

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

  const comoUsuario = createClient(URL_SUPABASE, CHAVE_ANON, {
    global: { headers: { Authorization: autorizacao } },
  });
  const {
    data: { user },
  } = await comoUsuario.auth.getUser();
  if (!user) return responde({ erro: "Sessão inválida" }, 401);

  // Depois da autenticação: a configuração da função não é assunto de quem não
  // entrou. Mas falha alto em vez de fingir que enviou, senão um segredo
  // faltando fica escondido por semanas.
  if (!VAPID_PUBLICA || !VAPID_PRIVADA) {
    return responde({ erro: "Faltam os segredos VAPID_PUBLICA e VAPID_PRIVADA" }, 500);
  }

  const admin = createClient(URL_SUPABASE, CHAVE_SERVICE);

  // Só notifica se quem pediu tem mesmo algo na fila.
  const { data: quem } = await admin
    .from("dMembros")
    .select("id_membro, nome, apelido, foto_pendente_em, apelido_pendente, aprovacao_notificada_em")
    .eq("auth_user_id", user.id)
    .single();

  if (!quem) return responde({ erro: "Membro não encontrado" }, 404);
  if (!quem.foto_pendente_em && !quem.apelido_pendente) {
    return responde({ ok: true, enviados: 0, motivo: "nada pendente" }, 200);
  }

  // A janela é conferida aqui, e não no navegador, porque quem chama esta
  // função é o cliente e nada do que ele diz vale como limite. Responde 200:
  // pro membro não é erro nenhum, o pedido dele está na fila do mesmo jeito.
  if (quem.aprovacao_notificada_em) {
    const desde = (Date.now() - new Date(quem.aprovacao_notificada_em).getTime()) / 60000;
    if (desde < JANELA_MIN) {
      return responde({ ok: true, enviados: 0, motivo: "avisado há pouco" }, 200);
    }
  }

  const oque =
    quem.foto_pendente_em && quem.apelido_pendente
      ? "mandou foto e apelido novos"
      : quem.foto_pendente_em
        ? "mandou uma foto nova"
        : "escolheu um apelido novo";

  // Só admin do sistema recebe. Organizador aprova, mas quem pediu pra ser
  // avisado no celular foi o admin.
  const { data: alvos } = await admin
    .from("dMembros")
    .select("auth_user_id")
    .lte("auth_level", 1)
    .not("auth_user_id", "is", null);

  const ids = (alvos ?? []).map((m) => m.auth_user_id);
  if (ids.length === 0) return responde({ ok: true, enviados: 0, motivo: "sem admin" }, 200);

  const { data: inscricoes } = await admin
    .from("push_inscricoes")
    .select("endpoint, p256dh, auth_secret")
    .in("auth_user_id", ids);

  if (!inscricoes || inscricoes.length === 0) {
    return responde({ ok: true, enviados: 0, motivo: "nenhum aparelho inscrito" }, 200);
  }

  /* Marca ANTES de enviar, de propósito.
   *
   * Marcando depois, duas chamadas disparadas ao mesmo tempo passariam as duas
   * pela janela, que é justamente o caso que se quer fechar. O preço é que uma
   * falha no envio custa uma notificação perdida, e isso é aceitável: a fila
   * continua no banco e o painel mostra a contagem, então ninguém deixa de ser
   * atendido, só deixa de ser cutucado.
   *
   * Fica depois da checagem de inscrições pra não gastar a janela de 10 minutos
   * quando não há nem aparelho pra receber. */
  await admin
    .from("dMembros")
    .update({ aprovacao_notificada_em: new Date().toISOString() })
    .eq("id_membro", quem.id_membro);

  webpush.setVapidDetails(VAPID_CONTATO, VAPID_PUBLICA, VAPID_PRIVADA);

  // O nome vai pro corpo da notificação, que o sistema operacional desenha como
  // texto puro. Não há HTML aqui, então apelido com < ou > não vira marcação.
  const carga = JSON.stringify({
    titulo: "Esperando aprovação",
    corpo: `${quem.apelido || quem.nome} ${oque}.`,
    url: "/admin/moderacao",
    tag: "ds-aprovacao",
  });

  let enviados = 0;
  const mortas: string[] = [];

  await Promise.all(
    inscricoes.map(async (i) => {
      try {
        await webpush.sendNotification(
          { endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth_secret } },
          carga,
        );
        enviados++;
      } catch (e) {
        // 404 e 410 são o serviço de push dizendo que a inscrição morreu (app
        // desinstalado, permissão revogada). Guardar isso pra sempre faria a
        // tabela só crescer e cada envio ficar mais lento.
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) mortas.push(i.endpoint);
      }
    }),
  );

  if (mortas.length > 0) {
    await admin.from("push_inscricoes").delete().in("endpoint", mortas);
  }

  return responde({ ok: true, enviados, removidas: mortas.length }, 200);
});
