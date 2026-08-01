# Status do projeto — Dragon Style Swordplay (rebuild Astro + Supabase)

> Última atualização: 2026-07-27. Este arquivo existe para retomar o
> trabalho em uma sessão nova do Claude Code (`claude --resume` ou uma
> sessão fresca) sem perder o contexto do que já foi feito e do que falta.

## Regra permanente

**Nunca mexer na branch `main`** (produção, live na Vercel). Todo o
trabalho deste rebuild acontece na branch `master-upgrade`. Só faz merge
para `main` quando o usuário pedir explicitamente — ainda não pediu.

## EM ANDAMENTO — retomar isto primeiro (sessão interrompida em 2026-07-27)

Continuação da sessão anterior. As 4 mudanças visuais da landing (ver
lista abaixo) **já foram verificadas visualmente no navegador** (dev
server + `claude-in-chrome`, modo "escolher no Chrome" porque havia 2
browsers conectados) e um bug real foi encontrado e corrigido no
processo: o `<h2>` do CTA final ("Pronto pra empunhar sua arma?")
saía tudo grudado numa linha só (`PRONTO PRA EMPUNHARSUA ARMA?`) porque
a regra genérica sitewide `h2 { display: flex }` (global.css:393)
sobrescrevia o `display: block` dos `.line` — `.hero h1` já tinha esse
override explícito, `.cta-band h2` não tinha. Corrigido com
`display: block` em `.cta-band h2`. Também corrigido um overflow em
telas ≤331px (tipo iPhone SE 1ª geração): `white-space: nowrap` nas
linhas do CTA passava da largura disponível nesse caso extremo — agora
tem uma media query `@media (max-width: 340px)` liberando quebra normal
só nesse breakpoint bem pequeno.

**Depois disso**, na mesma sessão, o usuário pediu uma 5ª coisa: uma
mini-galeria de fotos entre "Escolha sua Classe" e o CTA final. Ver
seção dedicada "Mini-galeria da landing" mais abaixo — também já
implementada e verificada visualmente.

Nota sobre a ferramenta de screenshot nesta sessão: o
`mcp__claude-in-chrome__computer` (action `screenshot`) ficou bastante
flaky — vários timeouts de 30s ("renderer frozen") e capturas de frames
parcialmente pintados (imagens aparecendo pretas/cortadas) mesmo com o
conteúdo real correto (confirmado via `javascript_tool` checando
`img.complete`/`naturalWidth` e `getComputedStyle`). Não parecia ligado
a nada específico do código novo — aconteceu até em seções antigas
inalteradas. Se persistir em sessões futuras, considerar reportar como
bug da extensão; o workaround que funcionou foi esperar (`wait` 2-3s)
antes de cada `screenshot` e, quando travava, abrir uma aba nova.

Working tree neste momento (nada commitado, nada revertido):
- `.mcp.json` modificado (fora do escopo deste pedido — é a integração
  Higgsfield de uma tarefa anterior, ver seção Higgsfield mais abaixo;
  não mexer nele por causa deste pedido de landing page)
- `docs/status.md` modificado (este arquivo)
- `src/components/HomeContent.astro` modificado (4 ajustes visuais +
  seção de galeria nova)
- `src/styles/global.css` modificado (4 ajustes visuais + fix do bug do
  CTA + fix de overflow + CSS da galeria)
- `src/pages/galeria.astro` **novo**, não commitado (stub da página de
  galeria completa)
- `public/assets/img/galeria/galeria-1.webp` até `galeria-8.webp`
  **novos**, não commitados (8 fotos processadas, ver seção dedicada)

As 4 mudanças pedidas pelo usuário e o que foi feito em código:

1. **Linha dourada separando a barra de stats (49 Membros Ativos, 10
   Classes...) do bloco "O que é Swordplay"**: adicionada a classe
   `hairline-bottom` na `<section class="stats-band">` em
   `HomeContent.astro` (mesma técnica já usada no `.hero`, que tem
   `hairline-bottom` pra separar do stats-band acima dele).
2. **Fundo do bloco "O que é Swordplay" (os 3 cards: Combate Seguro /
   Honra em Cada Golpe / Corpo, Mente e Reflexo) trocado pro azul bem
   escuro do início/fim do site** (o mesmo tom por trás do hero e do
   CTA final "Pronto pra empunhar sua arma?", que usa
   `var(--primary-color)` = `#121212`, bem mais escuro que o
   `var(--secondary-color)` = `#151f28` usado nos outros painéis).
   Implementado: nova classe `.landing-panel-dark { background:
   var(--primary-color); }` em `global.css`, aplicada como classe extra
   (`class="landing-panel landing-panel-dark"`) na section "O que é
   Swordplay" em `HomeContent.astro`.
3. **Mesma troca de fundo escuro no bloco "Escolha sua Classe"**:
   mesma classe `landing-panel-dark` aplicada na `<section
   class="landing-panel" id="classes">`.
   - **Decisão intencional**: a section "Próximo Treino" (que fica
     entre essas duas, tem `id="proximo-treino"`) **não** recebeu essa
     classe — o usuário só mencionou/mostrou screenshot dos blocos
     "O que é Swordplay" e "Escolha sua Classe", não do Próximo Treino.
     Ela continua com o fundo navy `--secondary-color` de antes,
     criando um banding alternado navy/escuro/navy/escuro/escuro. Ela já
     tinha `hairline-top` e `hairline-bottom` próprios, então continua
     visualmente separada dos vizinhos independente da cor de fundo
     deles ter mudado. **Se o usuário achar estranho o Próximo Treino
     ter ficado navy no meio de dois escuros, é só aplicar
     `landing-panel-dark` nele também** — decisão não confirmada com o
     usuário, foi um julgamento de escopo (ele não pediu).
4. **Texto quebrado do CTA final ("Pronto pra empunhar sua arma?")**:
   o `<h2>` tinha `text-wrap: balance` + `max-width: 18ch`, que
   quebrava o texto de um jeito estranho (tipo duas colunas, não duas
   linhas limpas). Trocado pelo mesmo padrão já usado no `<h1>` do
   hero (`<span class="line">`): agora é
   `<h2><span class="line">Pronto pra empunhar</span><span class="line
   gold-title">sua arma?</span></h2>`, com nova regra CSS `.cta-band h2
   .line { display: block; white-space: nowrap; }`. Removido `text-wrap:
   balance` e `max-width: 18ch` do `.cta-band h2` (não são mais
   necessários com as linhas explícitas).

As 4 mudanças acima + o fix do bug do CTA + o fix de overflow **já foram
verificados visualmente** (ver nota no topo desta seção). Falta só a
mini-galeria (seção dedicada abaixo) ser conferida pelo usuário e, aí
sim, perguntar se pode commitar tudo junto (as 4 mudanças + os 2 fixes
+ a galeria).

## Mini-galeria da landing (nova seção "Nossos Treinos em Ação")

Pedido do usuário, na mesma sessão, depois das 4 mudanças visuais
acima: uma seção de galeria entre "Escolha sua Classe" e o CTA final
("Pronto pra empunhar sua arma?"), com fundo navy claro (mesmo
`var(--secondary-color)` do rodapé) pra alternar com o escuro
(`var(--primary-color)`) dos painéis vizinhos, mais um link "Ver
galeria completa" pra uma página cheia futura.

**Discussão de arquitetura antes de implementar**: usuário perguntou se
dava pra puxar fotos direto do Google Drive, ou se seria melhor um
banco de dados. Resposta dada: Drive não serve pra produção (sem CDN,
quebra hotlink com frequência, sem otimização); o ideal — quando a
galeria crescer pra algo dinâmico/gerenciável pelo admin — é Supabase
Storage (bucket público, tem CDN) pra guardar os arquivos, com uma
tabela pequena de metadados (tipo `fGaleriaFotos`: caminho, legenda,
ordem) apontando pra eles, nunca blob de imagem direto no Postgres.
Free tier do Supabase (checado nesta sessão via WebSearch): 1 GB de
Storage, 500 MB de Database, 5 GB egress/mês — dá margem pra milhares
de fotos comprimidas em `.webp`.

**Decisão de escopo pra esta sessão**: como o pedido explícito foi só a
mini-seção (8 fotos fixas, curadas), sem a página de galeria completa
ainda, montar a infra de Storage/tabela agora seria trabalho adiantado
sem uso imediato — decisão (ponytail-style) foi usar o mesmo padrão já
estabelecido no site pras imagens de classe: arquivo estático `.webp`
otimizado, comitado no repo em `public/assets/img/`, sem
`astro:assets`/pipeline de otimização automática (o projeto não usa
isso em lugar nenhum, todo `<img src>` aponta pra um `.webp`
pré-otimizado manualmente). **Quando o usuário pedir a página de
galeria completa de verdade** (com upload pelo admin, mais fotos do que
essas 8, crescendo com o tempo), aí sim vale montar Supabase Storage +
tabela — é literalmente o momento em que a dinâmica passa a compensar
a complexidade extra.

**Fotos**: usuário forneceu 10 fotos reais de treino em
`C:\Users\paulo\Downloads\Fotos DS\` (fora do repo, arquivos PNG
originais de ~30-49 MB cada, ~4800x6400px, com marca d'água
"DS.SWORDPLAY" no canto). Processadas com Python 3.13 + Pillow (script
descartável em scratchpad, não ficou no repo): resize pro lado maior
1100px + reconvertido pra `.webp` qualidade 70 → ficaram 44-273 KB cada
(dentro do padrão de peso das outras imagens do site, que ficam
~100-190 KB). 8 das 10 foram escolhidas pra essa leva (critério: melhor
variedade de cenário/ângulo/ação — descartadas uma foto "andando de
costas com bandeiras" e uma foto de melee em grupo redundante com
outra muito parecida já escolhida). As 2 fotos não usadas continuam na
pasta Downloads do usuário, disponíveis se quiser usar na página de
galeria completa depois.

Arquivos gerados: `public/assets/img/galeria/galeria-1.webp` até
`galeria-8.webp` (novos, não commitados ainda).

**Implementação**:
- `HomeContent.astro`: novo array `galeriaPreview` no frontmatter (8
  entradas, `img` + `alt` descritivo em PT-BR), nova
  `<section class="landing-panel" id="galeria">` entre `#classes` e
  `.cta-band` — usa `.landing-panel` **sem** `-dark` (que já resolve
  pro navy `--secondary-color`, não precisou de classe/cor nova), grid
  de imagens, link `.section-link` "Ver galeria completa →" pra
  `/galeria`, seguindo exatamente o mesmo padrão estrutural das outras
  seções da landing (`.section-head` com eyebrow/h2/p + `.section-link`
  no fim).
- CSS novo em `global.css`: `.galeria-grid` (grid 4 colunas desktop, 2
  em ≤820px, `gap: 1rem`, **`max-width: 1180px; margin: 0 auto;`** —
  esse max-width foi necessário porque `.galeria-grid` também é
  reusado na página `/galeria`, que não tem o `.wrap` da landing
  envolvendo o conteúdo; sem isso as imagens ficavam enormes,
  esticando pra largura total da `<main>`, que não tem max-width
  próprio) e `.galeria-item` (aspect-ratio 3/4, border-radius, hover
  zoom — mesmo tratamento visual de `.class-card`).
- `src/pages/galeria.astro` **novo**: stub mínimo da página de galeria
  completa, pra o link "Ver galeria completa" não cair em 404. Usa
  `PageLayout` (título "Galeria", prev/next pra Resumo das Classes /
  Início), mostra as mesmas 8 fotos num `.galeria-grid` + texto "Galeria
  completa em construção — mais fotos em breve." Quando o usuário
  pedir a versão de verdade (mais fotos, Storage dinâmico, talvez
  categorias/lightbox), essa página deve ser substituída, não
  incrementada em cima do stub.

Tudo verificado visualmente no navegador (background navy correto,
grid 4×2 bem proporcionado, hover, todas as 8 imagens carregando,
página `/galeria` com o grid corretamente contido em 1180px depois do
fix do `max-width`). Sem erros no console em nenhuma das duas páginas.

## Onde está o plano original

O plano das 5 fases do rebuild está em
`C:\Users\paulo\.claude\plans\mutable-nibbling-lerdorf.md` (fora do
repositório). As 5 fases já foram concluídas e commitadas em
`master-upgrade`:

1. Setup Astro + Supabase, migração do conteúdo estático
2. Painel admin
3. (ajustes de ordenação de tabelas)
4. Dashboard de membro (login, apelido, nível, presenças)
5. Páginas públicas de ranking/mural/registro de treinos

## Estado atual da branch `master-upgrade`

Commits mais recentes (mais novo primeiro):

- `b353520` — corrige de vez a cor dos títulos da landing (branco, não
  dourado — o commit anterior só tinha removido o override e caía de
  volta no `h2 { color: gold }` genérico do site) e o contraste dos
  cards (trio-card/treino-card/class-card usavam a mesma navy
  semi-transparente do fundo do painel e ficavam invisíveis; agora usam
  `--landing-card-bg` sólido).
- `dd45d68` — primeira tentativa de restaurar a paleta da landing
  conforme o mockup (incompleta, corrigida pelo commit acima).
- `fcbb68f` — landing page nova na Home (hero, stats ao vivo, 3 cards
  "O que é Swordplay", card "Próximo Treino", preview de 4 classes, CTA
  final) + footer sitewide novo (`Footer.astro`, entra no
  `BaseLayout.astro`) + ícones `calendar`/`clock`/`location` no
  `Icon.astro`. Ver detalhes na seção "Landing page nova" abaixo.
- `b1e92c1` — corrige overflow horizontal mobile (tabelas largas
  vazavam a largura da página e cortavam o header/nav ao dar zoom out),
  troca o accordion do ranking por classe por navegação via botão +
  `:target` (uma tabela por vez), mural agora lista todo mundo em 4
  grupos (Organizadores/Staff/Membros Ativos/Membros Inativos), e
  reescreve `v_registro_treinos` para mostrar Nível Geral e Nível
  Classe históricos (no momento daquele treino) com seta verde ▲
  quando subiu de nível.
- `a8116ae` — primeira rodada de feedback das páginas da Fase 5: tabelas
  de ranking com largura ajustada ao conteúdo (coluna de nome
  padronizada em 40ch), rankings geral/por classe passam a incluir
  membros inativos, classe "Básico" removida do ranking por classe,
  registro de treinos agrupado por treino (rowspan em data/número).
- `c4ae48f` e anteriores — Fases 1 a 5 completas + correções de bugs
  reais encontrados no preview da Vercel (build quebrando por
  eager-init do client Supabase, CSP bloqueando hidratação dos islands,
  redirect do magic link caindo em localhost).

Build de produção (`npm run build`) e o smoke test de 45 URLs
(`node scripts/smoke-test.mjs`, precisa do dev server rodando em
`localhost:4321`) estão passando 45/45 na última verificação (depois do
commit `b353520`).

## Landing page nova (Início)

A Home (`src/pages/index.astro` e `/home`, ambas renderizam
`src/components/HomeContent.astro`) deixou de ser um texto corrido e
virou uma landing page de verdade. Foi desenhada primeiro como mockup
num Artifact (HTML standalone, fontes/logo/imagens reais embutidas em
base64) antes de virar código real — o usuário aprovou o visual desse
mockup e pediu pra instalar.

Estrutura da `HomeContent.astro` (usa `BaseLayout` direto, não
`PageLayout` — uma landing não usa o `<h1>`/paginação prev-next
genéricos):

1. Hero: eyebrow "São José do Rio Preto", título 2 linhas fixas via
   `<span class="line">` com `white-space:nowrap` ("ONDE HONRA" /
   "ENCONTRA AÇÃO", ambas as palavras em destaque douradas), CTAs
   "Quero Participar" / "Ver Próximo Treino".
2. Barra de stats: Membros Ativos e Treinos Registrados vêm **ao vivo**
   do Supabase (`v_ranking_nivel_geral` e `v_registro_treinos`, mesmo
   padrão de `supabasePublic` usado em `ranking-geral.astro` etc.); "10
   Classes", "+30 Combinações de Equipamentos" e "9 Modalidades" são
   estáticos (fatos estáveis, já hardcoded em outros lugares do
   código).
3. 3 cards "O que é Swordplay" (resumo de `o-que-e-swordplay.mdx`).
4. Card "Próximo Treino" (`#proximo-treino`): **hardcoded** de propósito
   (dia/horário/local direto no topo do frontmatter de
   `HomeContent.astro`, com comentário `ponytail:` explicando por quê)
   — decisão explícita do usuário até a tabela `fAgendaTreinos` (ver
   abaixo) ter dados e alguém automatizar isso.
5. Preview de 4 classes (Guerreiro/Arqueiro/Cavaleiro/Sicário) linkando
   pra `/resumo-das-classes`.
6. CTA final + ícones sociais.

Regressões já encontradas e corrigidas no processo (guardar como
lição): o site tem um `h2 { color: var(--golden-color) }` genérico
que qualquer `.section-head h2`/`.cta-band h2` precisa sobrescrever
**explicitamente** (só remover um override anterior não basta, cai de
volta no dourado do genérico); e cards com fundo
`var(--secondary-color-opacity)` ficam invisíveis quando o painel atrás
já é sólido da mesma cor — por isso existe `--landing-card-bg: #1a2029`
específico pros cards da landing.

Footer novo (`Footer.astro`) é sitewide (entra no `BaseLayout.astro`,
aparece em toda página) — logo, 3 colunas de links reais, ícones
sociais, copyright.

## Banco: `fAgendaTreinos` (agenda de treinos futuros)

Criada via migration `create_fagendatreinos` (aplicada direto via MCP,
não tem arquivo de migration local — o projeto não versiona SQL de
migration localmente, só no histórico do Supabase). Motivo: `fEventos`
é pra eventos especiais e `fTreinos` é um log do que **já aconteceu**
(criado quando o treino abre) — nenhuma das duas serve pra "próximo
treino agendado".

```sql
create table public."fAgendaTreinos" (
  id_agenda bigint generated by default as identity primary key,
  data_treino date not null,
  horario_inicio time not null,
  horario_termino time,
  cidade text not null default 'São José do Rio Preto',
  endereco text,
  status text not null default 'agendado', -- agendado | cancelado | realizado
  id_treino bigint references public."fTreinos"(id_treino),
  criado_por bigint references public."dMembros"(telegram_id),
  criado_em timestamptz not null default now()
);
```

RLS: `public_select using (true)` (agenda é informação pública, mesmo
padrão de `modalidades`) + `admin_write` restrito a `is_admin()`.
`get_advisors(security)` não trouxe nada novo além dos avisos já
conhecidos/intencionais.

**Estado**: tabela existe mas está **vazia**. O card "Próximo Treino" da
landing continua lendo do hardcode, não desta tabela — ninguém pediu
ainda pra conectar. Ideias futuras do usuário (ainda não implementadas):
botão de localização linkando pro Maps, e uma forma de alguém
adicionar treino na agenda (form/admin).

## Higgsfield — geração/edição de imagens (em andamento, não concluído)

**Objetivo do usuário**: as 10 imagens de personagens em
`public/assets/img/logo-classes/classes-juntas/*.webp` (guerreiros,
arqueiros, cavaleiros, espadachins, hoplitas, lanceiros, sicarios,
templarios, vikings, barbaros — os pares de personagem por classe,
usados no preview de classes da landing, no grid de
`/resumo-das-classes` e nas páginas individuais de cada classe) foram
pegas do Pinterest em 2022 e têm iluminação ruim e, em alguns casos, os
dois personagens do mesmo par claramente vêm de fontes/estilos
diferentes (ex.: `guerreiros.webp` tem um homem em estilo pintura
semi-realista e uma mulher em estilo anime/gacha). Pedido: usar
Higgsfield pra reformular essas 10 imagens deixando a iluminação mais
realista e os dois personagens de cada par mais coerentes entre si,
**mantendo** o personagem reconhecível (pose, armadura, arma, cor de
cabelo) — sem apagar as imagens antigas (git já garante isso, não
precisa duplicar arquivo). Regra confirmada: **não mexer** em nenhuma
outra imagem do site (fotos reais do grupo, histórico, equipamentos
ficam de fora).

**Achado técnico importante**: as imagens atuais são `RGBA` de verdade
(confirmado com `PIL.Image.open(...).mode` → `RGBA`), ou seja, têm
transparência real — não um fundo branco chapado. Isso importa porque
são reusadas em layouts com fundos diferentes atrás do personagem
(grid de classes, páginas individuais). Qualquer imagem nova **precisa
sair com fundo transparente** também, senão vai aparecer uma caixa
colorida feia nesses outros lugares. Higgsfield tem um modelo próprio
pra isso: `image_background_remover` (1 crédito).

### Tentativa 1 — CLI (abandonada)

Instalado `@higgsfield/cli` global + `higgsfield auth login` + skills
via `npx skills add higgsfield-ai/skills` (7 skills em
`.agents/skills/`, pasta nunca commitada). **Bloqueio**: toda tentativa
de gerar imagem (`seedream_v4_5`, `nano_banana_2_lite`, `nano_banana`)
retornou `job_minimum_basic_plan_required` — o workspace é plano
**free** (10 créditos), e por mais que `higgsfield generate cost`
mostrasse "1 crédito", **o plano free não consegue rodar geração de
imagem nenhuma**, independente do saldo de créditos. Nenhum crédito foi
gasto (todas as tentativas falharam antes de cobrar).

Usuário pediu pra desfazer tudo e tentar via MCP em vez de CLI. Feito:
`higgsfield auth logout`, `npm uninstall -g @higgsfield/cli`, removida
a pasta `.agents/` inteira (estava untracked, sem perda de histórico).
Nenhum diretório de config sobrou (`~/.higgsfield` etc. — checado, não
existe).

### Tentativa 2 — MCP (piloto rodado, resultado não aprovado)

`.mcp.json` tem uma segunda entrada, junto com `supabase`:

```json
"higgsfield": {
  "type": "http",
  "url": "https://mcp.higgsfield.ai/mcp"
}
```

**Achado importante**: via MCP a geração de imagem **funciona** no
plano free (diferente da CLI, que bloqueava com
`job_minimum_basic_plan_required`). A única restrição do plano free
encontrada foi `Rate limit reached: max 1 concurrent job(s)` — dá pra
gerar, só não em paralelo (rodar um job por vez, sequencial).

**Piloto rodado em 2026-07-27**: gerado `guerreiros.webp` (upload via
`media_upload`/`media_confirm` + `medias: [{role: "image"}]` como
referência) em 2 modelos, usando o prompt já rascunhado abaixo:

- **`nano_banana_pro`** (id retornado: `nano_banana_2`, 2 créditos):
  fundo branco liso, estilo pictórico único e coerente entre os dois
  personagens, pose/arma/armadura/cores preservadas. Melhor dos dois.
- **`soul_2`** (id retornado: `text2image_soul_v2`, 1 crédito): reescreve
  o prompt sozinho a partir da imagem de referência (não usa o prompt
  do usuário como está) e devolve fundo **preto** (não branco, ignora o
  pedido), com a guerreira saindo bem estilizada/anime (decote, saltos,
  saia curta) destoando do guerreiro em armadura realista — repete o
  problema de inconsistência de estilo que a imagem original já tinha.

**Decisão do usuário**: nenhum dos dois resultados ficou bom o
suficiente. Trabalho de imagem **pausado por ora** — usuário vai tentar
rodar localmente com outra IA (não Higgsfield) numa sessão futura.
**Não seguir com background-remover nem com as outras 9 imagens até o
usuário retomar isso explicitamente.**

### Plano acordado pro trabalho de imagem (se/quando retomar)

- Reavaliar a ferramenta — usuário quer tentar geração local com outra
  IA em vez do Higgsfield.
- **Piloto primeiro**: gerar `guerreiros.webp` em modelos diferentes pra
  comparar, escolher o melhor com o usuário, só então rodar
  background-remover no vencedor (Higgsfield tem `remove_background`
  dedicado pra isso, 1 crédito, mas nunca foi testado nesta sessão —
  nenhum crédito foi gasto nele).
- Depois do piloto aprovado, aplicar o mesmo modelo nas outras 9
  imagens, dentro do orçamento de créditos disponível — usuário topa
  fazer isso **aos poucos, em vários dias**, sem problema.
- **Sempre sobrescrever o arquivo original** (`git commit` depois — não
  duplicar old/new lado a lado; o histórico do git já é a rede de
  segurança que o usuário pediu). Se ficar ruim, reverte o commit.
- Prompt usado no piloto (reaproveitar se voltar a tentar via
  Higgsfield; ajustar arma/armadura/cor de cabelo pra cada classe nas
  próximas):

  > Full-body fantasy knight duo, exactly matching the reference image
  > composition: on the left a male knight, on the right a female
  > knight, both standing in confident battle poses, both wielding a
  > longsword in one hand and holding a large kite shield in the
  > other. Preserve their armor color scheme (steel-blue and silver
  > plate armor with dark leather straps), the male's short brown
  > hair, and the female's long blonde ponytail. Repaint both
  > characters in one single cohesive, semi-realistic digital painting
  > style with matching level of detail and material rendering between
  > the two — same painterly realism, same metal and fabric shading,
  > same skin rendering, no anime or cel-shaded elements on either
  > character, no mismatched art styles. Improve the lighting to soft,
  > natural, three-dimensional studio lighting with believable
  > directional shadows and specular highlights on the armor. Full
  > body, standing pose, plain flat white background, no floor, no
  > shadow cast on background, high detail concept art.

  Nota: com `nano_banana_pro`/`nano_banana_2` o prompt é respeitado
  literalmente. Com `soul_2` o modelo reescreve o prompt sozinho a
  partir da referência — não confiar que vai seguir instruções
  específicas tipo "fundo branco" com esse modelo.

## Configurações feitas fora do código (não versionadas em migrations)

- **SMTP customizado no Supabase Auth**: configurado com Resend
  (resolve o rate limit baixo do mailer padrão do Supabase). Feito
  direto no dashboard do Supabase, não é algo que uma migration
  reproduz.
- **Template de e-mail "Magic link or OTP"**: customizado no dashboard
  do Supabase (Authentication → Emails) com a identidade visual do
  site. Uma cópia de referência está salva em
  `supabase/email-templates/magic-link.html` — se precisar reaplicar
  ou copiar pra outro projeto Supabase, o conteúdo está lá.

## Pendências conhecidas / próximos passos possíveis

- **Imagens de personagens (Higgsfield)**: pausado por decisão do
  usuário — piloto do Guerreiro rodou e funcionou tecnicamente, mas o
  resultado visual não convenceu. Usuário quer tentar outra IA rodando
  localmente antes de continuar. Ver seção dedicada acima.
- **Merge para `main`**: ainda não foi pedido. Quando o usuário decidir
  que está pronto, é o próximo passo grande.
- **Upload de foto no Mural de Membros**: pedido explicitamente adiado
  pelo usuário ("pode fazer depois"). Ainda não implementado.
- **Backfill de `dMembros.email`**: só o membro Papito (id 4) tem e-mail
  cadastrado pra teste. Os outros ~172 membros não têm e-mail no banco
  ainda, o que significa que só ele consegue logar via magic link hoje.
- **`fAgendaTreinos`**: tabela existe mas vazia; conectar o card
  "Próximo Treino" da landing a ela quando o usuário pedir, mais ideias
  futuras dele (link pro Maps, alguém poder cadastrar treino).
- Testar o preview mais recente (commit `b353520`, a landing page) no
  celular — o usuário estava no meio dessa checagem quando a sessão
  precisou ser encerrada.

## Notas técnicas úteis pra retomar

- **Ambiente**: Windows, o shell Bash desta sessão está quebrado
  (`bash.exe` não encontrado) — usar a tool **PowerShell** para tudo
  que envolve shell.
- **Subir o servidor local**:
  ```powershell
  Start-Process cmd.exe -ArgumentList '/c npx astro dev --port 4321 > dev.log 2>&1' -WindowStyle Hidden
  ```
  depois `astro dev stop` pra derrubar (ou matar o processo ouvindo na
  porta 4321).
- **`.mcp.json` agora tem 2 servidores**: `supabase` (read_only por
  padrão) e `higgsfield` (novo, sem flag de read_only — é só um
  endpoint de auth/geração, não tem esse conceito).
- **Aplicar migrations no Supabase**: o `.mcp.json` está com
  `read_only: true` por padrão pro servidor `supabase`. Pra aplicar uma
  migration via MCP:
  1. Editar `.mcp.json` pra `read_only: false` — **a tool de Edit do
     Claude Code é bloqueada automaticamente nessa direção específica**
     (loosening de permissão), mesmo com o usuário mandando explicitamente
     "pode ir"; quem precisa fazer essa edição manualmente é o usuário.
     Já a direção inversa (voltar pra `true`, travando de novo) a IA
     consegue fazer sozinha sem bloqueio.
  2. Pedir pro usuário rodar `/mcp` pra reconectar
  3. Aplicar a migration (`mcp__supabase__apply_migration`)
  4. Rodar `mcp__supabase__get_advisors(type: "security")` pra
     conferir que não apareceu nada novo além dos avisos já conhecidos
     (as views `SECURITY DEFINER` são intencionais — é o padrão "view
     curada sobre tabela trancada" usado no projeto)
  5. Voltar `.mcp.json` pra `read_only: true` (a IA consegue fazer essa
     direção sozinha) e pedir pro usuário reconectar de novo com `/mcp`
- **Views principais do banco** (todas `SECURITY DEFINER`, expõem só o
  necessário publicamente): `v_ranking_nivel_geral`,
  `v_ranking_por_classe`, `v_registro_treinos`,
  `v_historico_presencas` (essa última é privada, filtrada por
  `auth.uid()`, usada no dashboard do membro).
- **CSP em `vercel.json`**: tem hashes SHA-256 fixos pros scripts
  inline do Astro. Se a versão do Astro for atualizada, os hashes
  provavelmente precisam ser recalculados (gerar um build real e
  extrair os hashes que o navegador reclama no console).
- **Higgsfield CLI/skills**: removidos nesta sessão (ver seção
  dedicada). Se reaparecerem comandos `higgsfield` no PATH ou uma pasta
  `.agents/skills/higgsfield-*`, é porque uma sessão nova os
  reinstalou — não é resquício desta.

## Plano de Unificação de Agenda de Treinos (2026-07-31, EM ESPERA)

Plano aprovado pra ligar a Agenda de Treinos (`fAgendaTreinos` +
`fAgendaConfirmacoes`, agendamento futuro com auto-confirmação do membro) ao
Registro de Treino (`fTreinos` + `fPresencas`, o fluxo real do dia em
`TreinoAtivo.svelte`) — hoje os dois sistemas não se falam. Achado-chave:
`fAgendaTreinos.id_treino` já existe no schema como FK pra `fTreinos` mas
está sempre `NULL` — o vínculo já estava previsto, só nunca foi ligado.

Resumo da abordagem: `abrir_treino(p_data)` passa a linkar automaticamente
a linha da Agenda que bate com a data (por `data_treino`, nunca por ID);
`TreinoAtivo.svelte` ganha uma seção "Confirmados aguardando registro" que
lista quem já confirmou na Agenda e ainda não tem presença registrada —
staff clica, escolhe classe/torso/faixa (mesmo formulário de hoje) e
confirma, sem precisar buscar o nome de novo. Continua sendo staff quem
credita o PH, não é presença automática.

**Em espera**: `fTreinos.id_treino` é `IDENTITY BY DEFAULT` (ordem de
inserção, sem relação com a data) — o usuário ainda tem treinos antigos
faltando (desde ~71, o próximo da Agenda seria ~90) e quer terminar esse
backfill em ordem cronológica primeiro, já que o Nº do treino é um registro
histórico importante pro grupo. Só implementar este plano depois que o
usuário avisar que o backfill terminou. Plano completo salvo na memória do
Claude Code (fora deste repo) como "Plano de Unificação de Agenda de
Treinos" — chamar por esse nome quando for a hora.
