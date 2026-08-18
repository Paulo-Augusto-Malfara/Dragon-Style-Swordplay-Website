## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## CSS conventions

- Small tag/pill/badge components (`.status-badge`, `.stat-pill`, and any new one styled the same way) must always size to their own content — never stretch to fill a parent. When adding a new CSS rule that targets a generic tag like `span` inside a container (e.g. `.some-list li span`), scope it to the direct child (`.some-list li > span`), not a bare descendant selector — a bare descendant selector also matches badges/pills nested deeper inside that span and stretches them. This has caused a visible bug more than once (e.g. the "Inativo" badge in `MembrosList.svelte` inheriting `flex:1; min-width:60%` meant for the outer row `<span>`).

## Níveis de permissão (revisado em 15/08/2026)

`auth_level` no `dMembros`. O middleware barra quem está acima de 3 ou `oculto`.

| Nível | Quem | Função no banco | Prop no site |
|---|---|---|---|
| 1 | Admin do sistema | `is_admin_sistema()` | `isAdminSistema` |
| 2 | Organizador | `is_organizador()` **e `is_admin()`** | `isOrganizador` |
| 3 | Staff | `is_staff()` | (só entrar no painel) |
| 4+ / nulo | Membro | — | não entra |

**`is_admin()` NÃO é o admin do sistema: é nível ≤ 2, idêntica a
`is_organizador()`.** É nome histórico e metade das policies usa ele. Em policy
nova prefira `is_organizador()`, que diz o que faz. As quatro funções têm
`comment` no banco dizendo isso.

Quem faz o quê hoje:

- **Staff (3)**: registra e corrige presença de treino e de evento, cadastra
  membro novo (a RLS só deixa criar com nível ≥ 4), e no torneio inscreve
  participante e lança placar de partida. Não abre, não fecha, não edita membro.
- **Organizador (2)**: o do staff, mais abrir treino e evento, fechar evento,
  abrir torneio, gerar as chaves e fechar torneio, agenda, novidades,
  modalidades, e **conferir** doações (sem lançar).
- **Admin do sistema (1)**: tudo. Único que fecha, reabre e exclui treino,
  reabre e exclui torneio, edita membro, lança/edita/exclui doação e mexe na
  fila de aprovações.

## Torneios

Quatro tabelas (`fTorneios`, `fTorneioEquipes`, `fTorneioIntegrantes`,
`fTorneioPartidas`) e nove RPCs, todas criadas em 18/08/2026. Dois pontos que
não se descobrem lendo o schema:

- **O chaveamento é JavaScript, não plpgsql.** Mora em `src/lib/torneio.ts`,
  função pura, com teste em `scripts/test-torneio.mjs` (roda no `npm test` com
  `--experimental-strip-types`). A RPC `gerar_partidas` só grava o que o motor
  montou. No JSON que ela recebe, `proxima` é **índice dentro do array**, não
  id: na hora em que a chave é montada nenhuma partida tem id ainda.
- **`melhor_de` mora na partida**, não numa tabela de fases. É o que dá a regra
  de vitória flexível (3 nas eliminatórias, 5 na semi, 7 na final) e ainda deixa
  corrigir uma partida isolada.
- **Eliminatória dupla**: quem perde vai pra `proxima_derrota`/`proxima_derrota_vaga`,
  o par exato do `proxima_partida`. Duas coisas dela não se adivinham:
  **(a)** os byes da primeira rodada não geram perdedor, e isso esvaziaria
  partidas inteiras do começo da repescagem; `chaveEliminatoriaDupla` conta
  quantos participantes cada partida terá de verdade e **descarta** as de menos
  de dois, religando a rota de quem passaria por ali. Por isso a chave dupla não
  tem número fixo de partidas por rodada, e a numeração das rodadas da
  repescagem só sai depois do descarte. **(b)** A **final de desempate** não
  nasce com a chave: se quem veio da repescagem vence a grande final, os dois
  ficam com uma derrota e falta mais uma partida. A tela gera sob demanda, e a
  `fechar_torneio` recusa fechar enquanto ela faltar. Os nomes de fase
  `Grande final` e `Final de desempate` são regra, não legenda: estão em
  `torneio.ts` como `FASE_GRANDE_FINAL`/`FASE_DESEMPATE` e repetidos dentro da
  RPC. Campeão do mata-mata é o vencedor da **última** partida da chave (maior
  `id_partida` por classe), e não "a que não tem seguinte", justamente porque a
  grande final e o desempate ficam as duas sem seguinte.
- Bye e "semifinal esperando a outra semi" são idênticos no banco (um lado nulo).
  O que separa os dois é o bye já nascer com `id_equipe_vencedora` preenchido.
  Qualquer tela nova que desenhe partida precisa desse teste.
- **Fechar tem trava dupla**: a tela desabilita o botão e a `fechar_torneio`
  levanta exceção de novo. Nunca deixe só um dos dois lados.
- **Torneio de classes é vários torneios ao mesmo tempo**, uma chave por classe,
  todas rodando juntas. Desde 18/08 a mesma pessoa entra em mais de uma chave no
  mesmo dia: a trava de "já inscrito" da `inscrever_equipe` é por classe quando
  `tipo = 'classes'`, e por torneio quando é aberto. O teto de classes por
  pessoa é a coluna `max_classes` (padrão 3, de 1 a 10), escolhida na abertura,
  e a `inscrever_equipe` conta as inscrições que já existem, não só a que está
  entrando. A tela mostra o teto antes, o banco recusa depois: as duas travas.
- **A leitura pública é policy, não view.** `fTorneios` e `fTorneioPartidas`
  têm `public_select` pra status diferente de `inscricao`, e é de propósito: o
  Realtime só entrega a linha que a policy do assinante deixa ver, então uma
  view deixaria a tela pública (`/torneios/[id]`, `TorneioPublico.svelte`) sem
  receber placar nenhum. Equipe e integrante seguem só do staff, e o nome do
  participante sai da `v_torneio_equipes`. Se algum dia a tela pública precisar
  de um campo novo, ele entra na view, não numa policy nova.

RPC nova neste projeto nasce com `execute` para `public` e `anon`, e **toda RPC
de escrita daqui é `{postgres, authenticated, service_role}`**. Depois de criar
função, rode `revoke execute on function ... from public, anon;` e confira com
`get_advisors`, senão a lista de `anon_security_definer_function_executable`
cresce (ela tem que ficar só nos cinco sem argumento).

Regra ao mexer numa tela do painel: **a trava da página filha tem que repetir a
do índice**. Já aconteceu de `/admin/posts/[id]` e `/admin/modalidades/[id]`
abrirem pra quem a lista escondia, e o erro só aparecer no salvar.

## claude-in-chrome usage

Don't open/screenshot the site with claude-in-chrome unprompted. The user runs `npm run dev` himself and watches localhost live (PC and phone) — he checks visual/UI changes on his own. Only use claude-in-chrome when: the user explicitly asks in that turn, a large/whole-feature review he requested calls for it, or there's a genuine need with no other way to verify — and even then, ask for authorization first (yes, even in auto mode) before opening the browser.

## Supabase: qual projeto é o certo

**O único project ref deste repositório é `gkfgoevpbqydcirtinkw`.** Antes de
qualquer chamada MCP que aceite `project_id`, confira que é esse valor. Se a
ferramenta pedir o projeto e você não tiver certeza de qual conta está ativa,
rode `list_projects` e confirme o ref antes de seguir; nunca chute pelo nome.

Existe um segundo conector Supabase carregado nesta máquina (nome com UUID)
autenticado em **outra conta** (org `kpxqzchjykqqjqrfjwno`, projetos "Data
Analysis Database" e "Ignis View Dev"). Nada deste site vive lá. Se só ele
aparecer, ou se `gkfgoevpbqydcirtinkw` não estiver na lista, **pare e avise o
usuário** em vez de operar no projeto que apareceu.

## Supabase MCP write policy

The `supabase` MCP server in `.mcp.json` stays at `read_only=false` permanently — don't toggle it back to `true` after a migration, and don't ask the user to flip it before one. Instead, always ask an explicit, clear question in chat before running `apply_migration`, `execute_sql` for anything beyond a plain `SELECT`, or any other DB write — every single time, even in Auto Mode, even if the conversation already implied it. A yes covers only that one action. After any migration, run `get_advisors(type:"security")` and compare against the known baseline (9 intentional `SECURITY DEFINER` views, RPCs intentionally exposed to anon/authenticated by design, leaked password protection warning pre-existing) — flag only genuinely new items.

Baseline auditada em 15/08/2026, item a item: as views (`v_registro_treinos`,
`v_treinos_publicos`, `v_registro_eventos`, `v_ranking_nivel_geral`,
`v_ranking_por_classe`, `v_historico_doacoes`, `v_agenda_confirmacoes`) só
publicam o que o site já mostra e filtram `not m.oculto`; a oitava,
`v_historico_presencas`, se limita sozinha por `auth.uid()`. A nona,
`v_torneio_equipes`, entrou em 18/08/2026 com a tela pública de torneios e
segue a mesma regra: só torneio fora de `inscricao`, apelido aprovado, e membro
`oculto` sai como "Participante". Nenhuma expõe
email, telegram_id ou auth_user_id. As 25 funções `SECURITY DEFINER` têm
guarda interna (`is_admin`, `is_staff`, `is_organizador`, `current_membro_id` ou
`auth.uid()`); o anônimo só alcança os cinco booleanos sem argumento, que
respondem falso pra ele. Refazer essa varredura de tempos em tempos.

Auth: "Allow new users to sign up" is **off** (since 2026-08-14). Nobody self-registers; a new member has to be invited from the Supabase dashboard, and the `on_auth_user_created_claim_membro` trigger links them to `dMembros` by email. Don't "fix" a login that returns `signup_disabled` by turning signups back on — that error is the intended answer for an email with no user.
