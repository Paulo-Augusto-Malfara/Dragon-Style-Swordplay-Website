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

Esse nome já custou uma brecha, achada na auditoria de 20/08/2026: dez tabelas
tinham policy de escrita `using is_admin()`, então o organizador lançava PH pra
si mesmo direto na tabela, reescrevia a régua de `dFaixas` e apagava o
`fMarcoZero`, tudo por REST, sem passar por RPC. Hoje **`fPH`, `fMarcoZero`,
`dRegrasPH`, `dFaixas`, `dClasses`, `fTreinos` e as quatro `fTorneio*` têm
escrita `is_admin_sistema()`**, e é assim que tem que continuar: a tabela crua
precisa exigir o mesmo nível que a RPC correspondente, senão a RPC vira sugestão.
Seguem no organizador, de propósito, `fAgendaTreinos`, `fAgendaConfirmacoes`,
`posts`, `modalidades` e `fEventos`.

**`oculto` desarma no banco, e não só no painel** (desde 20/08/2026). As quatro
funções de cargo testam `and not oculto`, então esconder alguém tira junto os
poderes de RPC. Antes disso ele só barrava o painel pelo `getStaffMembro`, e um
staff escondido seguia registrando presença e votando pauta pela API, que era a
porta de serviço.

O par disso é uma trava que **não pode sair**: a policy `admin_sistema_update`
do `dMembros` recusa `oculto = true` em conta nível 1. Sem ela, ocultar o único
admin o tiraria do `is_admin_sistema()`, e como desocultar exige ser admin, ele
ficaria trancado do lado de fora, com saída só pelo SQL do painel do Supabase.
Se um dia o `oculto` voltar a ser só de painel, essa trava é que perde o
sentido, não o contrário.

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

## Foto e vínculo de login (auditoria de 20/08/2026)

Duas travas que nasceram de brechas de verdade e não podem ser afrouxadas sem
saber por quê:

- **No balde público `avatars`, o staff tem INSERT e não tem UPDATE.** A policy
  `staff_update_membro_folder` foi apagada. Ela deixava qualquer staff dar
  UPDATE em qualquer arquivo sob `membro-*`, inclusive numa foto já aprovada, e
  isso é a mesma brecha de 20/08 pela outra porta: aquela correção tornou o
  caminho do upload único (`membro-N/<timestamp>.webp`), mas não tirou a
  permissão de sobrescrever o que já existia. Se um dia o recrutamento precisar
  trocar arquivo, o certo é subir num caminho novo, nunca devolver o UPDATE.
- **`vincular_membro_por_email()` só casa linha de nível 4.** A expressão é
  `coalesce(auth_level,4) >= 4`, literalmente a mesma da policy `staff_insert`
  da `dMembros` e da trava da edge function `convidar-membro`. As três
  perguntam "esta linha é de alguém sem privilégio?". Ligar-se a um cadastro
  nunca pode promover: promover é um segundo ato, no painel de membros, onde a
  policy de UPDATE já exige admin do sistema.

O que a auditoria de 20/08 olhou e achou limpo, pra não refazer: RLS nas 25
tabelas, as três edge functions, os três baldes, o middleware, a regra da tela
filha repetir a trava do índice nas 20 páginas do painel, segredo no histórico
inteiro do Git, `npm audit` e os cabeçalhos da Vercel. O que ficou de propósito
sem correção está no handoff de segurança da memória.

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
- **Corrigir é sempre de frente pra trás**, e a `registrar_resultado` recusa
  quando a partida seguinte já andou. A final de desempate é a exceção que
  precisou de código próprio: ela não é apontada por `proxima_partida` (nasce
  depois da grande final, sob demanda), então a trava não a enxergava, e mudar
  quem venceu a grande final deixava de pé um desempate decidido por uma
  premissa já derrubada; como o campeão é o vencedor da última partida da
  chave, era o desempate velho que seguia coroando. Hoje, quando o vencedor da
  grande final muda, a RPC recusa se o desempate tiver resultado e **apaga** o
  desempate sem resultado, senão sobrava uma partida injogável travando o
  fechar pra sempre. Corrigido em 18/08/2026, com o caso provado em bloco com
  rollback antes e depois.
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

## Voto de pauta: secreto, e placar só na hora certa

Revisado em 21/08/2026. As duas votações do mural são secretas **por policy**,
não por a tela não desenhar. `fPautaVotos` e `fPautaDecisaoVotos` têm select
`id_membro = current_membro_id()`: cada um enxerga o próprio voto e mais nada,
inclusive o admin do sistema. Antes disso era `is_staff()`, e qualquer staff
lia a lista inteira por REST enquanto a tela ainda baixava `id_membro, opcao`
pro navegador de todo mundo.

Fechar a policy custou o Realtime, que só entrega a linha que a policy do
assinante deixa ver. Por isso o placar mora em `fPautas.votos_total` e
`fPautas.decisao_tally`, mantido por três gatilhos, e a tela assina a
`fPautas`. **Não troque essas colunas por `count(*)` na view**: elas existem
pra o Realtime ter o que entregar com o voto fechado. O terceiro gatilho,
`recontar_ao_trocar_reuniao`, cobre o que não se adivinha: sair da reunião
congela o placar da decisão (é assim que a pauta adiada guarda como foi
votada), e só entrar numa reunião nova zera.

Esconder placar é regra de **quando**, e não de quem:

- Prioridade aparece quando a votação trava, 24h antes da reunião, pela mesma
  `pauta_votacao_aberta` que trava o voto. Um relógio só.
- Decisão aparece quando o organizador encerra. Durante, sai só
  `decisao_votantes`, que conta cabeças e não preferência.
- **A ordem da lista denuncia tanto quanto o número.** Enquanto trava, o mural
  vem da pauta mais recente pra mais antiga, com as urgentes no topo. Nunca
  volte a ordenar por voto nesse período.

O motivo é efeito manada, não sigilo: com o placar à vista, quem vota depois
vota atrás de quem já está na frente.

**Pauta urgente não recebe voto** (`votar_pauta` recusa), porque ela entra na
reunião por fora das três vagas e o voto seria jogado fora. Marcar como urgente
**apaga** os votos que a pauta já tinha, devolvendo o saldo de quem votou.
Desmarcar não traz de volta.

**ARMADILHA**: a `fPautas` não tem mais `select` de tabela pro `authenticated`,
e sim grant coluna a coluna, sem `votos_total` e `decisao_tally`. Coluna nova
não nasce visível: quem esquecer de acrescentar no grant vai ver o campo sumir
do REST calado, sem erro, e o defeito vai parecer da tela.

## "Em teste" vale pra qualquer pauta

Desde 22/08/2026 `em_teste` é a quarta opção da rodada de mérito, votável em
ideia, sugestão e crítica também: a sala aprova pra experimentar, a pauta sai da
reunião, e a rodada seguinte (`aprovada`/`recusada`/`mais_teste`) decide se
fica. O trilho de volta já existia e não precisou de nada: a `agendar_reuniao`
sempre puxou `status in ('aberta','em_teste')`, e a segunda rodada nunca olhou
categoria.

Modalidade continua sendo a exceção pelo outro lado: ela cai em teste **sem
ninguém votar nisso**, porque `validada` numa `nova_modalidade` nunca pode virar
página direto. As duas entradas moram no mesmo galho da `fechar_decisao`, e é
por isso que ele testa `v_resultado = 'em_teste' or (v_resultado = 'validada'
and v_categoria = 'nova_modalidade')`.

Pauta em teste não recebe voto de prioridade (a `votar_pauta` exige `aberta`) e
a view não dá `posicao` pra ela: ela volta pra reunião por direito, sem disputar
as três vagas.

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

The `supabase` MCP server in `.mcp.json` stays at `read_only=false` permanently — don't toggle it back to `true` after a migration, and don't ask the user to flip it before one. Instead, always ask an explicit, clear question in chat before running `apply_migration`, `execute_sql` for anything beyond a plain `SELECT`, or any other DB write — every single time, even in Auto Mode, even if the conversation already implied it. A yes covers only that one action. After any migration, run `get_advisors(type:"security")` and compare against the known baseline (10 intentional `SECURITY DEFINER` views, RPCs intentionally exposed to anon/authenticated by design, leaked password protection warning pre-existing) — flag only genuinely new items.

Baseline auditada em 15/08/2026, item a item: as views (`v_registro_treinos`,
`v_treinos_publicos`, `v_registro_eventos`, `v_ranking_nivel_geral`,
`v_ranking_por_classe`, `v_historico_doacoes`, `v_agenda_confirmacoes`) só
publicam o que o site já mostra e filtram `not m.oculto`; a oitava,
`v_historico_presencas`, se limita sozinha por `auth.uid()`. A nona,
`v_torneio_equipes`, entrou em 18/08/2026 com a tela pública de torneios e
segue a mesma regra: só torneio fora de `inscricao`, apelido aprovado, e membro
`oculto` sai como "Participante". Nenhuma expõe
email, telegram_id ou auth_user_id. A décima, `v_pautas_mural`, virou definer
em 21/08/2026 pra esconder placar de votação (veja "Voto de pauta"); ela filtra
por `is_staff()` dentro de si, e é a única da lista que existe pra **esconder**
coluna, não pra juntar tabela. As 25 funções `SECURITY DEFINER` têm
guarda interna (`is_admin`, `is_staff`, `is_organizador`, `current_membro_id` ou
`auth.uid()`); o anônimo só alcança os cinco booleanos sem argumento, que
respondem falso pra ele. Refazer essa varredura de tempos em tempos.

Auth: "Allow new users to sign up" is **off** (since 2026-08-14). Nobody self-registers; a new member has to be invited from the Supabase dashboard, and the `on_auth_user_created_claim_membro` trigger links them to `dMembros` by email. Don't "fix" a login that returns `signup_disabled` by turning signups back on — that error is the intended answer for an email with no user.
