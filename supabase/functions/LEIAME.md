# Funções de borda

Estas funções rodam no Supabase, não na Vercel, e existem porque precisam da
chave de service role, que nunca pode chegar no navegador.

- **aprovar-foto**: copia a foto do bucket privado `avatars-pendentes` pro
  público `avatars` e grava a URL no cadastro. É função, e não RPC, porque o
  Postgres não move arquivo de storage.
- **notificar-aprovacao**: manda a notificação Web Push pra quem é nível 1,
  quando alguém põe foto ou apelido na fila.
- **convidar-membro**: cria a conta em `auth.users` e confirma o e-mail no ato.
  É a mais sensível das três, porque é a única que cria acesso, e por isso é a
  mais travada: exige nível 1 (`is_admin_sistema`, checado no banco e não na
  tela), convida sempre em nível 4, e tira o endereço da `dMembros` pelo
  `id_membro` recebido — quem chama escolhe qual membro, jamais qual e-mail,
  senão a função vira uma máquina de mandar mensagem pra qualquer lugar usando
  a cota e a reputação de envio do projeto.

`cors.ts` é cópia de `_compartilhado/cors.ts`. Cada função de borda sobe com o
próprio conjunto de arquivos, então não dá pra importar de uma pasta irmã: se
mexer no compartilhado, copie pras três.

## Segredos

Ficam em Edge Functions → Secrets, no painel do Supabase. Não estão neste
repositório e não devem estar:

- `VAPID_PUBLICA` — a mesma que está em `src/lib/push.ts` (é pública mesmo)
- `VAPID_PRIVADA` — assina o push
- `VAPID_CONTATO` — opcional, um `mailto:` que o serviço de push usa pra
  cobrar responsabilidade em caso de abuso

`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` são injetadas
pela própria plataforma.

## Deploy

Pelo painel do Supabase ou pela CLI (`supabase functions deploy <nome>`). Os
arquivos aqui são a fonte da verdade: o que está publicado hoje foi gerado a
partir deles.
