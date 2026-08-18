# Status do projeto — Dragon Style Swordplay (rebuild Astro + Supabase)

> Última atualização: 2026-08-15. Este arquivo existe para retomar o
> trabalho numa sessão nova do Claude Code sem perder o contexto do que
> já foi feito e do que falta. Ele é a única memória do projeto que vive
> no repositório — o histórico de conversa fica em `~/.claude/` na
> máquina do usuário e **não** chega em sessão nova nem em sessão na
> nuvem. O que precisa sobreviver tem que estar aqui, no `CLAUDE.md` ou
> numa mensagem de commit.

## Regra permanente

**Nunca mexer na branch `main`** (produção, live na Vercel). Todo o
trabalho deste rebuild acontece na branch `master-upgrade`. Só faz merge
para `main` quando o usuário pedir explicitamente — ainda não pediu.

## Onde o trabalho parou

Último commit: `b7f9ca6`, 15/08 00:45 — padronização das quatro
caixinhas de número do Meu Perfil e da janela de perfil (número dourado
em Cinzel, rótulo apagado em Rubik), igualando ao `.rk-valor` do ranking
e ao `.mural-numeros` do mural.

Não há trabalho em aberto no meio do caminho: a working tree estava
limpa e a sequência de 14/08 fechou tanto a auditoria dos dados
históricos quanto o ciclo de janela de perfil. O próximo passo é o que o
usuário pedir.

## Sistema de torneios (18/08)

Seção nova do painel, em `/admin/torneios`. Dois tipos: **aberto** (1x1,
2x2 ou 3x3, chave única) e **de classes** (1x1, uma chave por classe,
para premiar o vencedor de cada uma). Três formatos: eliminatória
simples, eliminatória dupla, suíço e todos contra todos.

O que foi decidido e por quê:

- **Sem PH.** O torneio não toca `fPH`, nível de classe nem ranking.
  Premiação ficou explicitamente para depois; entra como regra nova em
  `dRegrasPH` mais um lançamento dentro do `fechar_torneio`, sem mexer
  em nada do que já existe.
- **Eliminatória dupla entrou depois**, no mesmo dia, e custou uma coluna
  de rota do perdedor (`proxima_derrota`) mais uma função no motor. Duas
  decisões dela merecem registro. A primeira: **partida que provadamente
  teria menos de dois participantes é descartada**, e a rota de quem
  passaria por ali aponta direto pro destino seguinte. Os byes da
  primeira rodada não geram perdedor, então sem isso o começo da
  repescagem viraria uma fileira de partidas de um lado só, que ninguém
  consegue lançar porque não têm placar. A segunda: **a final de
  desempate não nasce com a chave.** Na hora de montar não dá pra saber
  se vai ser precisa, e ela só existe se quem veio da repescagem vencer a
  grande final. A tela gera sob demanda e a `fechar_torneio` recusa
  fechar enquanto falta, que é a mesma trava dupla do resto.
- **Uma pessoa é uma equipe de um integrante.** O 1x1 não tem caminho
  próprio, o que deixa um único código de partida em vez de dois quase
  iguais.
- **`melhor_de` na partida, não numa tabela de fases.** Uma tabela a
  menos, e dá para corrigir uma partida isolada sem mexer na chave.
- **O melhor de N não é perguntado na abertura**, e sim na hora de gerar
  a chave: é aí que o organizador está olhando a lista de inscritos, que
  é o que faz decidir entre melhor de 3 e melhor de 5.

Arquivos: `src/lib/torneio.ts` (motor puro),
`scripts/test-torneio.mjs` (no `npm test`),
`src/pages/admin/torneios/{index,[id]}.astro`,
`src/components/admin/{AbrirTorneio,TorneioAtivo}.svelte`.

Testado ponta a ponta contra o banco de verdade, num torneio descartável
apagado no fim: bye nascendo decidido e avançando sozinho, melhor de N
fechando no ponto certo, recusa de placar acima do máximo, recusa de
correção quando a partida seguinte já andou, recusa de lançamento em
torneio fechado, a trava dupla do fechamento e o cascade do excluir.

Depois disso, a mesma coisa foi refeita pelo navegador, no painel logado,
com 5 membros reais em duas classes: abrir, inscrever pela caixa de
busca, gerar chave, lançar placar, reabrir, corrigir fora de ordem
(recusado com a mensagem certa na tela), corrigir na ordem, fechar e
excluir. A passada pelo navegador achou quatro defeitos que o teste de
banco não pegava, todos corrigidos: `"Viking,Final"` sem espaço (o
Svelte come o espaço solto no fim de um bloco `{#if}`), `"Faltam 1
partida"` sem concordância, a partida que espera escondendo quem já
estava classificado nela, e o botão de tirar ponto continuando clicável
com o torneio fechado (o banco recusava, mas a tela oferecia).

Vale a lição geral: **o teste de banco não substitui a passada pela
tela**. Nenhum dos quatro aparecia em SQL.

A eliminatória dupla ganhou os dois testes na mesma medida. No motor,
`scripts/test-torneio.mjs` joga a chave inteira de 2, 3, 5, 6, 8, 11 e 16
equipes e cobra a promessa do formato: `2n - 2` partidas jogadas, campeão
sem nenhuma derrota e **todo mundo mais com exatamente duas**. É a
asserção que pega bye mal encaixado, rota de perdedor trocada e partida
fantasma de uma vez só. No banco, um torneio descartável de 4 equipes
provou o resto: o perdedor descendo pra repescagem em vez de sumir, a
recusa de fechar com o desempate faltando, e o campeão saindo certo
depois do desempate.

A passada pelo navegador foi feita logo depois, com 5 membros reais num
torneio aberto 1x1: 11 partidas geradas (8 pra jogar mais 3 byes,
exatamente o previsto), a repescagem recebendo cada perdedor na hora, a
partida vazia do começo da repescagem sumindo da tela como devia, o
bloco da final de desempate aparecendo sozinho quando a repescagem
venceu a grande final, e o **campeão saindo como o vencedor do
desempate**, que é o caso que a regra antiga de campeão errava. Dessa vez
não apareceu defeito nenhum de tela. O torneio foi excluído no fim e as
quatro tabelas voltaram a zero.

Existe um **manual para os organizadores** publicado como artifact, com
os dois tipos, os quatro formatos, a tabela de quantas partidas cada um
pede e o passo a passo. Ele registra também a regra de combate que não
mora no código: no torneio por classe todo mundo luta no nível 1 da
classe, sem o bônus de nível 3.

### Tela pública ao vivo (18/08)

`/torneios` lista os que estão acontecendo e o histórico paginado;
`/torneios/[id]` mostra a chave, o placar e os campeões, em leitura, e se
atualiza sozinha enquanto a mesa lança resultado. Entrou no menu, em
Comunidade, e o painel ganhou um link pra ela no cabeçalho do torneio,
que é o link que o organizador manda pro grupo.

Duas decisões que não se leem no código:

- **A leitura pública é RLS, e não view.** O caminho previsto era uma
  `v_torneios_publicos`, mas view não serve: o Realtime entrega só a linha
  que a policy do assinante deixa ver, e sem policy pro anônimo a tela
  nunca receberia o placar novo. Então `fTorneios` e `fTorneioPartidas`
  ganharam `public_select` pra torneio fora de `inscricao`. Não há dado
  pessoal nas duas: são ids, fase e pontos. As tabelas de equipe e de
  integrante continuam só do staff.
- **O nome sai por view**, a `v_torneio_equipes`, porque ele mora na
  `dMembros`, fechada pra quem não é staff. Mesma regra de apelido das
  outras oito views públicas, e membro `oculto` aparece como
  "Participante" em vez de sumir: sumir deixaria a chave com um lado em
  branco. É a nona view `SECURITY DEFINER` da baseline do advisor.

O "ao vivo" não depende só do socket: a tela recarrega quando a aba volta
a ficar visível e a cada minuto. Se o websocket cai, o supabase-js
reconecta mas o que passou enquanto ele esteve fora não volta, e a tela
ficaria parada sem avisar ninguém.

A matriz de permissão foi provada de novo depois da migração, num bloco
com rollback: anônimo e membro (nível ≥ 4) leem torneio já começado e não
escrevem nada, por tabela nem por RPC; staff lê tudo, não escreve direto
na tabela e lança placar pela RPC. Torneio em `inscricao` continua
invisível de fora.

### Mega torneio de classes (18/08)

O torneio de classes sempre foi uma chave por classe rodando ao mesmo
tempo. O que faltava era a pessoa poder estar em mais de uma chave, e
agora ela pode: a inscrição virou uma grade com as 10 classes oficiais
(o Básico fica fora) e seleção múltipla, no lugar do menu suspenso. Uma
chamada de `inscrever_equipe` por classe marcada, em sequência, porque o
seed sai de um `max(seed)` por chave.

O teto é a coluna `max_classes` da `fTorneios`, padrão 3, de 1 a 10,
escolhida na abertura: 1 faz um torneio de classe única, 10 é sem teto na
prática. A tela conta "2 de 3", apaga os cartões restantes ao chegar no
teto e explica ao clicar; a `inscrever_equipe` recusa de novo, contando o
que já existe e não só a inscrição que está entrando. A lista de
inscritos passou a ser uma por classe, com a contagem do lado, que é o
que o organizador precisa ver antes de gerar as chaves.

A `abrir_torneio` mudou de assinatura (ganhou `p_max_classes`), então a
antiga foi derrubada antes: duas funções com a mesma origem fariam o
PostgREST responder 300 quando a chamada casasse com as duas.

**Falta**: PH e premiação, adiados de propósito.

Arquivos da tela pública: `src/pages/torneios/{index,[id]}.astro`,
`src/components/TorneioPublico.svelte`.

### Uma chave de cada vez, e o pódio (18/08)

Com dez classes rodando juntas, as duas telas viraram uma rolagem só e
ninguém achava a partida que interessava. Agora as duas (painel e tela
pública) abrem em "Geral" e têm uma barra de abas por classe:

- **Geral** é panorama, não despejo: um cartão por classe dizendo em que
  fase ela está, quantas partidas faltam, e qual luta está acontecendo
  agora, com o placar correndo. Clicar no cartão abre a classe.
- **A aba da classe com luta rolando pisca no dourado**, com a bolinha do
  "ao vivo". Partida "acontecendo agora" é a `emJogo` do motor: os dois
  lados preenchidos, placar já lançado e sem vencedor ainda. É o que
  separa do bye (um lado nulo, já decidido) e da partida que nem começou.
- Escolher uma classe filtra a chave e a classificação daquela classe.

O pódio deixou de ser só o campeão: virou uma grade de cartões, um por
classe, com primeiro, segundo e terceiro. Quem decide é a `podio` do
motor, e a regra muda com o formato. No suíço e no todos contra todos o
pódio é a classificação cortada em três. No mata-mata a tabela não serve
pro topo (quem passou de bye chega à final com menos vitórias que um
semifinalista eliminado), então ouro e prata saem da partida decisiva, e
o bronze é o melhor colocado entre os que sobraram. Eliminatória simples
não tem disputa de terceiro: ali o bronze é critério de tabela.

Os dois pedaços são componentes compartilhados pelas duas telas,
`src/components/SeletorDeChaves.svelte` e `PodioDoTorneio.svelte`. O que
muda entre painel e tela pública é de onde saem os nomes, e por isso eles
entram como função.

## O que mudou desde a última escrita deste arquivo (27/07 → 15/08)

Este arquivo tinha parado em 27/07, descrevendo a landing e a
mini-galeria como trabalho em andamento. Ambas foram concluídas e
commitadas, e o projeto andou muito além disso: ~50 commits entre 13/08
e 15/08. As mensagens de commit deste projeto são longas e explicam o
porquê de cada decisão — **quando precisar do detalhe de algo abaixo,
`git log` no arquivo em questão é a melhor fonte**, não este resumo.

### Home, conteúdo e navegação

- `/` e `/home` renderizavam a mesma página. A raiz ficou; `/home` virou
  redirect permanente no `vercel.json`.
- As 17 páginas sem frase de abertura ganharam resumo, e os 56 `<br />`
  de espaçamento entre parágrafos morreram — existe `.prosa p` agora
  (a regra `p { margin: auto }` do global.css era o motivo dos `<br />`).
- As duas páginas de progressão pararam de mandar o membro procurar o
  nome numa planilha do Google; a ficha do site faz isso ao vivo.
- Rodapé escondido abaixo de 861px (o dock já é a navegação no celular),
  reduzido a 3 colunas. Administração, Doações e Mural de Doações, que
  moravam só no rodapé, viraram o grupo "Institucional" do índice.
- A tabela de graduações de `/nivel-geral`, que era HTML na mão dentro do
  `.mdx` e uma segunda cópia de `dFaixas.nivel_minimo`, virou o
  componente `EscalaDeFaixas`, alimentado pelo `FAIXAS` de
  `src/lib/faixa.ts`. Ele quebra o build se alguém adicionar faixa em
  `CORES` sem adicionar o nível.
- Comparador de classes removido. Glossário descolado da grade de
  equipamentos.

### Ranking, mural e perfil

- **"Na Ativa" e "Legado"**: os dois rankings passaram a ter duas
  leituras, via `?versao=`. "Na Ativa" é o padrão (a disputa de hoje);
  "Legado" é o comportamento antigo (todo mundo menos os ocultos). Quem
  decide quem está ativo é o `status_ativo` do banco. O corte acontece
  **antes** de ordenar e paginar, senão a colocação numerada descreveria
  uma lista maior que a exibida. Lógica em `src/lib/ranking-versao.ts`.
- **Janela de perfil (o "olhinho")**: um botão por linha no Ranking
  Geral, Ranking por Classe e Mural de Membros abre a ficha de qualquer
  membro sem sair da lista — `PerfilRapido.svelte`. É **uma ilha por
  página**, não uma por linha: os botões são HTML puro com
  `data-perfil` e quem escuta é o componente, por delegação no
  documento. Mural de Doações fica de fora de propósito (lá cada linha é
  uma doação, não uma pessoa).
- A colocação por classe virou `src/lib/rank-classe.ts`, compartilhada
  entre o Meu Perfil e a janela — e passou a ser medida na mesma base
  (`?versao=`) que a lista atrás dela, senão a página mostrava um número
  e a janela outro na mesma tela. Exceção: quem não está na ativa
  continua medido contra o Legado, que é onde de fato aparece.
- Empate divide a posição (dois em 3º, ninguém em 4º). Não é detalhe
  teórico: em Cavaleiro 21 pessoas têm exatamente 8 treinos.
- Básico fica fora da colocação por classe, igual à página de Ranking por
  Classe: é porta de entrada, não classe de disputa.
- Mural de Doações passou a reusar o `RankingLista` (com `posicao`
  opcional) em vez de ter aparência própria. Sai a rolagem lateral no
  celular e o "R$ 10.00" com ponto decimal.
- Destaque "esta linha é você" no ranking, aceso **pelo navegador e
  nunca pelo servidor** — regra que qualquer personalização futura
  nessas páginas tem que seguir, por causa do cache de borda (ver
  Desempenho).
- Podium virou só a cor do número (ouro/prata/bronze). A moldura dourada
  do primeiro lugar saiu: competia com o anel de "você".
- Últimas presenças do perfil paginadas de 5 em 5 (a lista inteira
  empurrava as conquistas pra fora da tela em quem treina há anos).

### Painel administrativo

- Refeito por inteiro (`ec298e4`): botão em três níveis, campo em grade,
  linha de lista na linguagem do site, e tabela que vira cartão por
  registro abaixo de 720px em vez de rolar de lado.
- `ConfirmarAcao.svelte`, um `<dialog>` nativo, substituiu 14 `confirm()`
  do navegador — no app instalado a caixa nativa parece erro do sistema.
- Lista de membros com 25 por página e filtro de Ativos/Inativos/
  Organizadores/Staff. Novidades e Modalidades viraram seções próprias.
- Hub com quatro cards de número; o de Aprovações é o único que leva a
  algum lugar.
- As sete tabelas do admin trocaram a moldura dourada do site antigo pelo
  cartão escuro. Ali a tabela continua sendo a forma certa (comparar
  linha por coluna é o ponto), então mudou a pele, não a estrutura.

### Registro de treino e agenda

- **Tela de presença refeita pro celular** (`07187ba`): vestimenta e
  faixa viraram botões (cada `<select>` era três toques, vinte vezes por
  treino), editar/excluir viraram ícones na linha do nome, e o cartão
  passou a ter duas metades iguais.
- **Corrigir presença passou a existir** — antes só dava pra remover e
  lançar de novo. Função nova no banco, `atualizar_presenca_treino`, que
  recalcula o PH pelas mesmas regras e faz um UPDATE só. Quem corrige é
  quem lança, não só o nível 1; apagar continua sendo do administrador.
- **Agenda e treino deixaram de ser dois sistemas separados**
  (`e59d7a9`) — isto era o "Plano de Unificação de Agenda de Treinos"
  que este arquivo listava como EM ESPERA, e está implementado.
  `abrir_treino` amarra a agenda do dia ao treino que nasce, **casando
  por data, nunca por id** (o número do treino é registro histórico e
  não tem relação com a ordem da agenda). Na tela do treino, quem
  confirmou aparece numa lista própria e um toque leva o nome pro
  formulário. Continua sendo registro manual de propósito: confirmar na
  agenda é intenção, presença é o staff que dá.
  - Não foi gravado status "realizado" na agenda: o select do editor só
    conhece agendado e cancelado, então salvar apagaria o status de
    volta calado. O vínculo com `fTreinos` responde a mesma pergunta.
- **Realtime completo** (`69e6a29`): fechar, reabrir e remover presença
  agora chegam nos outros celulares (só INSERT funcionava). `fTreinos`
  entrou na publicação do Realtime por migração; o ouvinte de DELETE vai
  sem filtro de propósito, porque com `REPLICA IDENTITY default` o
  Postgres só manda a chave primária da linha apagada.
- O card "Próximo Treino" **não é mais hardcoded**: `ProximoTreino.astro`
  lê `fAgendaTreinos` de verdade, e o mesmo componente serve a landing e
  a página Como Participar.

### Acesso, convite e e-mails

- **Cadastro novo está desligado** no Supabase desde 14/08. Ninguém se
  auto-registra. `signup_disabled` na tela de acesso é a **resposta
  certa** pra e-mail sem usuário, não um defeito pra consertar
  religando o cadastro aberto.
- **Convite de acesso virou item das aprovações** (`bee1c15`), travado em
  nível 4. A função de borda `convidar-membro` tira o e-mail **do banco,
  nunca do corpo do pedido** — quem chama escolhe qual membro, jamais
  qual endereço, senão a função vira máquina de mandar e-mail usando a
  cota e a reputação de envio do projeto.
- A função **confirma o e-mail no ato do convite** (`823b97b`). Sem isso,
  enquanto o convidado não aceitasse, pedir código devolvia
  `signup_disabled` — exatamente a mesma resposta de um endereço
  inexistente — e o link do convite expirava, deixando a pessoa travada
  *e* sumida da lista. Isso não afrouxa nada: pra entrar continua sendo
  preciso receber o código na caixa de entrada.
- **Modelos de e-mail em português** versionados em `supabase/emails/`
  (`convite.html`, `codigo-de-acesso.html`, mais `LEIAME.md`). O conteúdo
  de verdade mora no painel do Supabase, que não tem histórico — os
  arquivos existem pra ter de onde recuperar. Conferidos a 375px.
- A marca dos e-mails é **texto, não imagem**: cliente de e-mail não
  busca imagem remota por padrão (o Outlook bloqueia, o preview do painel
  roda em iframe que bloqueia sempre). Não era problema de formato — o
  servidor entrega PNG legítimo.
- Foto e apelido do perfil **passam por aprovação** antes de aparecer
  (`31388ad`). A foto vai pro bucket privado `avatars-pendentes`; a trava
  real foi a policy `avatars_own_folder_insert` **sair** — sem isso o
  navegador escrevia direto no bucket público e qualquer checagem dentro
  do site seria enfeite. Aprovar copia pro bucket público via função de
  borda (`aprovar-foto`), porque o Postgres não move arquivo de storage.
- **Notificação push no celular** quando algo entra na fila (`6251e5e`).
  Uma linha por **aparelho**, não por pessoa. A chave pública VAPID está
  no código porque é pública mesmo; a privada só existe como segredo da
  função de borda.
- "sem cadastro" e "cadastro oculto" viraram duas mensagens diferentes —
  a mensagem única enganou o próprio administrador duas vezes em uma
  hora.

### Segurança

- **Fechado o oráculo de e-mail do login** (`2aa01fd`): a tela perguntava
  ao banco "esse e-mail tem cadastro?" sem login e sem limite, o que
  permitia testar uma lista inteira de endereços. `email_tem_cadastro`
  foi removida.
- `atualizar_status_ativo_por_frequencia` e `calcula_ph_doacao` perderam
  o EXECUTE de anon/authenticated. A primeira era **a única escrita do
  banco sem trava nenhuma**: com a chave pública, que vive no bundle,
  qualquer pessoa deslogada disparava um UPDATE em massa na `dMembros`.
  Ganhou também `is_admin()` por dentro, caso um DROP+CREATE futuro
  devolva o grant sem ninguém notar.
- **Limite de taxa** na `notificar-aprovacao`: janela mínima de 10
  minutos em `dMembros.aprovacao_notificada_em`, marcada **antes** do
  envio de propósito (duas chamadas simultâneas passariam as duas). As
  outras duas funções de borda são auto-limitadas e não precisavam.
- **Dependências**: `npm audit` volta zero. Os 5 alertas do Dependabot
  são da árvore morta do express na `main` e morrem no merge; as 4 da
  `master-upgrade` foram corrigidas (só bump de patch).
- **Validade do código de acesso**: apertada de 3600 para 600 segundos no
  painel do Supabase, registrada em `supabase/emails/LEIAME.md` porque
  esse campo não tem histórico nem revisão. Cuidado: o mesmo campo
  governa o token do convite — pode ser curto **porque** o convite não
  usa link de aceite. Se o `ConfirmationURL` voltar pro modelo, a saída é
  manter o convite sem link, não afrouxar a validade do código.
- **CSP bloqueava a hidratação de toda página SSR em produção**
  (`3141210`, `07e7259`): o `csp-hashes.mjs` só varria
  `.vercel/output/static`, e página com `prerender=false` nunca aparece
  ali. O painel admin ficava em "Carregando..." pra sempre.
  `assetsInlineLimit: 0` resolveu o caso geral (todo script vira arquivo,
  coberto por `'self'`) e os scripts de diretiva são lidos do manifesto
  do bundle do servidor. Só em produção; dev não tem CSP.

### Desempenho e PWA

- **Cache de borda em 10 rotas SSR públicas**, 60s. É seguro porque foi
  conferido: todas leem pelo `supabasePublic` (cliente anônimo sem
  cookie) e nenhum layout personaliza nada. **A lista é explícita e nunca
  curinga** — incluir uma rota personalizada custaria vazamento entre
  visitantes. Custo aceito: o ranking público pode ficar até 60s
  desatualizado depois de fechar um treino.
- Prefetch com estratégia hover; `viewport` só no dock (toque não tem
  hover). `ClientRouter` no site público e **só nele** — o admin fica de
  fora porque o `TreinoAtivo` conta com `onDestroy` pra fechar o canal de
  Realtime.
- Três coisas quebraram com o `ClientRouter` e estão tratadas: o service
  worker mandava toda navegação pro ramo cache-first (o router troca de
  página com fetch comum, sem `mode: navigate`), a busca global morria
  depois da primeira navegação, e o `aria-expanded` do menu parava de
  sincronizar.
- Cabeçalho, dock e lateral usam `transition:persist` (o cabeçalho
  piscava a cada navegação). Isso quebrou o destaque "você" no ranking —
  quem carimba o id no `<html>` é o `AuthLink`, e persistido ele monta
  uma vez só; agora recarimba a cada navegação.
- **Fila de escrita offline ficou de fora de propósito** e não deve
  voltar sem motivo novo: uma presença enviada com atraso pode cair num
  treino já fechado, que é onde o PH é calculado.
- **Foto de iPhone saía 10x maior** (`a01bdf8`): o Safari do iOS exibe
  webp mas não codifica — o `toBlob` ignora o tipo pedido e devolve PNG,
  calado. 31KB do Chrome contra 340KB do iPhone pro mesmo recorte. Agora
  o código sonda com um canvas de 1 pixel e cai pra JPEG.

### Auditoria dos dados históricos (`fMarcoZero`) — concluída

Documento completo em **`docs/auditoria-marco-zero.md`**. Resumo:

- **Os IDs não se misturaram.** 159 de 161 nomes batem com a `ID RAIZ`, e
  a importação copiou fielmente o que estava na planilha.
- **O erro estava na própria planilha**: uma faixa de fórmula ancorada no
  rodapé da Lista de Presença não acompanhou o crescimento da lista e
  carimbou `Cavaleiro = 8` em 24 membros que nunca treinaram de
  Cavaleiro, marchando em ordem alfabética decrescente pelos inativos.
- Duas migrações já aplicadas: os 23 fantasmas e o marco zero do Arthur
  Romero, que a importação tinha perdido inteiro.
- **O Básico fica como está.** Reconstruir o Básico real reprova no teste
  da regra do grupo (deixaria 18 membros com classe avançada sem os 4
  Básicos que a destravam). No Cavaleiro o fantasma tinha impressão
  digital; no Básico, lançamento manual legítimo e fantasma são a mesma
  coisa nos dados.
- Marco zero do Luke refeito a pedido (Arqueiro 5, Guerreiro 5, Básico
  4). Armadilha registrada: a linha dele carrega **também** 10 presenças
  reais de 2025 que nunca viraram treino em `fTreinos` — sobrescrever a
  linha inteira apagaria essas presenças.
- Bônus de veterano do Milokos: 2 níveis, **somados** e não substituídos
  (os 2 que ele já tinha são presenças reais). Concessão do usuário, não
  correção de erro.
- Os IDs 164/165/166/170 **estão certos onde estão** — `fTreinos` começa
  no treino 68 (31/08/2025) e a planilha parou em 24/08/2025; mover
  exigiria inventar treino antigo ou contar dobrado.
- `ph_total` da `v_ranking_nivel_geral` soma **três** fontes:
  `fMarcoZero` + `fPresencas` + `fPH`.
- **Pendências da auditoria: zeradas.** A planilha foi aposentada pelo
  usuário em 14/08 — o app cobre o lançamento agora.

## Pendências conhecidas / próximos passos possíveis

- **Merge para `main`**: ainda não foi pedido. É o próximo passo grande
  quando o usuário decidir que está pronto.
- **Upload de foto no Mural de Membros**: adiado pelo usuário ("pode
  fazer depois"). Ainda não implementado.
- **Backfill de `dMembros.email`**: a maior parte dos ~190 membros ainda
  não tem e-mail no banco, e sem e-mail não há como convidar. O convite
  pelo painel de aprovações já existe e funciona ponta a ponta, mas
  depende desse dado estar lá.
- **Últimos treinos na janela de perfil**: ficaram de fora de propósito.
  `v_historico_presencas` filtra por `auth.uid()` dentro da própria
  definição, então só devolve as presenças de quem pergunta. Mostrar as
  de outra pessoa pede uma view pública nova — decisão adiada.
- **Apelido na janela de perfil**: também fora. As views públicas expõem
  `nome`, e mudar isso mexeria no ranking e no mural juntos.
- **Conquistas**: a lista ainda está sendo montada; o espaço já está
  reservado na ficha.
- **Imagens de personagens (Higgsfield)**: pausado (ver seção dedicada).

## Notas técnicas pra retomar

- **Ambiente local**: Windows. O shell Bash costuma estar quebrado
  (`bash.exe` não encontrado) — usar a tool **PowerShell**. Subir o
  servidor:
  ```powershell
  Start-Process cmd.exe -ArgumentList '/c npx astro dev --port 4321 > dev.log 2>&1' -WindowStyle Hidden
  ```
- **Sessão na nuvem** (Claude Code na web, sem o PC ligado): roda em
  container Linux com o repositório clonado do zero. Só chega o que está
  versionado — este arquivo, o `CLAUDE.md` e o histórico do git. Não há
  acesso a `~/.claude/`, ao Chrome do usuário nem aos arquivos fora do
  repo.
- **Testes**: `npm test` roda a bateria inteira — `test-sw-scope`,
  `test-sw-doc`, `test-icone-maskable`, `test-alcance`, `test-catalogo`,
  `test-funcao-vercel` e `csp-hashes --check`. `npm run smoke-test`
  precisa do dev server em `localhost:4321`.
  - `test-funcao-vercel.mjs` **copia a função compilada pra pasta
    temporária do sistema** antes de pedir as rotas. Copiar importa:
    rodando de dentro do repositório o defeito de empacotamento não
    aparece, porque o Node sobe a árvore de diretórios e acha o pacote no
    `node_modules` do projeto. Foi exatamente assim que um conserto
    quebrado passou por verificado.
  - `test-sw-scope.mjs` guarda a **regra do cache de borda**: reprova
    curinga na rota cacheada, reprova admin/auth/dashboard na lista, e
    varre todo `.astro` público procurando leitura de sessão. Basta um
    "Olá, Fulano" no cabeçalho compartilhado pra borda servir o HTML de
    um membro pro visitante seguinte.
- **`sanitize-html` + Vercel**: a lista `ARVORE_SANITIZE_HTML` no
  `astro.config.mjs` empacota os 17 pacotes da árvore. Empacotar só o
  pacote de cima deixa os `require()` das dependências apontando pra fora
  como chamada dinâmica, que o rastreio de arquivos da Vercel não
  enxerga — foi um deploy por dependência até descobrir isso. A lista só
  vale quando está compilando; no dev o Vite passaria o CommonJS pelo
  pipeline de ESM e os `require()` ficariam sem definição.
- **`.mcp.json`** tem três servidores: `supabase` (com
  `read_only=false`, **permanente** — ver a política no `CLAUDE.md`, que
  exige pergunta explícita em chat antes de qualquer escrita),
  `higgsfield` e `n8n-mcp`.
- **Migrações**: o projeto **não versiona SQL de migration localmente**,
  só no histórico do Supabase. Migrações aplicadas ficam registradas nas
  mensagens de commit — quando uma mudança de banco acompanha código, o
  commit diz qual foi.
- **Depois de migração**: rodar `get_advisors(type: "security")` e
  comparar com a linha de base — **7** views `SECURITY DEFINER`
  intencionais (eram 5 antes de agenda e eventos ganharem as suas), RPCs
  expostas a anon/authenticated por design, e o aviso de leaked password
  protection, que é pré-existente.
- **Views principais**: `v_ranking_nivel_geral`, `v_ranking_por_classe`,
  `v_registro_treinos`, `v_historico_presencas` (essa é privada, filtrada
  por `auth.uid()`).
- **Funções de borda** em `supabase/functions/` — `aprovar-foto`,
  `notificar-aprovacao`, `convidar-membro`, com `LEIAME.md` explicando
  por que são função e não RPC (o Postgres não move arquivo de storage) e
  por que o `cors.ts` é cópia em cada uma (função de borda sobe com o
  próprio conjunto de arquivos).
- **CSP em `vercel.json`**: tem hashes SHA-256 fixos. Se a versão do
  Astro mudar, rodar `node scripts/csp-hashes.mjs` pra regerar — e
  lembrar que mexer em script inline sem regerar **reprova o `npm test`**
  (já aconteceu).
- **Armadilhas de CSS que já morderam mais de uma vez**:
  - `h2 { color: var(--golden-color) }` genérico do site: qualquer
    `.section-head h2`/`.cta-band h2` precisa sobrescrever
    **explicitamente**. Só remover um override anterior não basta.
  - `h2 { display: flex }` genérico: `.line` dentro de `h2` precisa de
    `display: block` explícito, senão o texto sai grudado numa linha só.
  - O `* { margin: 0 }` do reset apaga o `margin: auto` que o navegador
    usa pra centralizar `<dialog>` modal. Já mordeu três vezes
    (`#busca-dialog`, `ConfirmarAcao`, equipamentos).
  - Estilo escopado (Astro **e** Svelte) não alcança DOM criado por
    `createElement` nem pseudo-elemento de barra de rolagem — precisa de
    `is:global`/`:global`. Já mordeu na busca, na pílula do ranking e na
    `.barra-fina`.
  - `margin-inline: auto` num item flex cancela o stretch: a casca do
    site encolhia pra largura do conteúdo em página curta.
  - A regra de badges/pills e seletor de filho direto está no `CLAUDE.md`
    e vale sempre.

## Configurações feitas fora do código

Nada disto é reproduzível por migration; vive no painel do Supabase.

- **SMTP customizado** com Resend (resolve o rate limit baixo do mailer
  padrão).
- **Templates de e-mail** (Authentication → Emails): magic link/OTP e
  convite. Cópias de referência em `supabase/emails/` e
  `supabase/email-templates/magic-link.html`.
- **Validade do código de acesso**: 600 segundos.
- **"Allow new users to sign up": desligado** desde 14/08. Membro novo
  entra por convite; o gatilho `on_auth_user_created_claim_membro` liga a
  conta ao `dMembros` pelo e-mail.
- **Realtime**: `fTreinos` adicionada à publicação `supabase_realtime`.
- **Storage**: policy `pendentes_own_folder_read` em `storage.objects` —
  sem ela o envio de foto falha pra quem não é organizador, porque a API
  de Storage insere com `RETURNING *` e no Postgres isso também exige as
  policies de SELECT.

## Higgsfield — imagens de personagens (pausado)

**Objetivo**: refazer as 10 imagens de
`public/assets/img/logo-classes/classes-juntas/*.webp` (pegas do
Pinterest em 2022) com iluminação melhor e os dois personagens de cada
par coerentes entre si, mantendo pose, armadura, arma e cor de cabelo.
Não mexer em nenhuma outra imagem do site.

**Achado técnico**: as imagens atuais são `RGBA` de verdade — têm
transparência real, e são reusadas em layouts com fundos diferentes.
Qualquer imagem nova precisa sair com fundo transparente, senão aparece
uma caixa colorida nesses outros lugares.

**Estado**: piloto rodado em 27/07 no `guerreiros.webp`, em dois modelos.
`nano_banana_pro` (2 créditos) devolveu o melhor resultado — estilo
coerente, fundo branco liso, prompt respeitado literalmente. `soul_2`
reescreve o prompt sozinho e devolveu fundo preto com a guerreira em
estilo anime, repetindo o problema que a imagem original já tinha.
**Nenhum dos dois convenceu o usuário.** Ele quer tentar outra IA
rodando localmente antes de continuar. **Não seguir com
background-remover nem com as outras 9 imagens até ele retomar isso
explicitamente.**

Notas: via MCP a geração funciona no plano free (a CLI bloqueava com
`job_minimum_basic_plan_required`); a única restrição é
`max 1 concurrent job`. O prompt do piloto está preservado no histórico
do git, na versão anterior deste arquivo (`git show 87ab560:docs/status.md`
ou anterior).
