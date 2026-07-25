# Status do projeto — Dragon Style Swordplay (rebuild Astro + Supabase)

> Última atualização: 2026-07-24. Este arquivo existe para retomar o
> trabalho em uma sessão nova do Claude Code (`claude --resume` ou uma
> sessão fresca) sem perder o contexto do que já foi feito e do que falta.

## Regra permanente

**Nunca mexer na branch `main`** (produção, live na Vercel). Todo o
trabalho deste rebuild acontece na branch `master-upgrade`. Só faz merge
para `main` quando o usuário pedir explicitamente — ainda não pediu.

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
`localhost:4321`) estão passando 45/45 na última verificação.

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

- **Merge para `main`**: ainda não foi pedido. Quando o usuário decidir
  que está pronto, é o próximo passo grande.
- **Upload de foto no Mural de Membros**: pedido explicitamente adiado
  pelo usuário ("pode fazer depois"). Ainda não implementado.
- **Backfill de `dMembros.email`**: só o membro Papito (id 4) tem e-mail
  cadastrado pra teste. Os outros ~172 membros não têm e-mail no banco
  ainda, o que significa que só ele consegue logar via magic link hoje.
- Testar o preview mais recente (commit `b1e92c1`) no celular pra
  confirmar que o corte do header no zoom-out mobile foi resolvido.

## Notas técnicas úteis pra retomar

- **Ambiente**: Windows, o shell Bash desta sessão está quebrado
  (`bash.exe` não encontrado) — usar a tool **PowerShell** para tudo
  que envolve shell.
- **Subir o servidor local**:
  ```powershell
  Start-Process cmd.exe -ArgumentList '/c npx astro dev --port 4321 > dev.log 2>&1' -WindowStyle Hidden
  ```
  depois `astro dev stop` pra derrubar.
- **Aplicar migrations no Supabase**: o `.mcp.json` está com
  `read_only: true` por padrão. Pra aplicar uma migration via MCP:
  1. Editar `.mcp.json` pra `read_only: false`
  2. Pedir pro usuário rodar `/mcp` pra reconectar
  3. Aplicar a migration (`mcp__supabase__apply_migration`)
  4. Rodar `mcp__supabase__get_advisors(type: "security")` pra
     conferir que não apareceu nada novo além dos avisos já conhecidos
     (as views `SECURITY DEFINER` são intencionais — é o padrão "view
     curada sobre tabela trancada" usado no projeto)
  5. Voltar `.mcp.json` pra `read_only: true`
- **Views principais do banco** (todas `SECURITY DEFINER`, expõem só o
  necessário publicamente): `v_ranking_nivel_geral`,
  `v_ranking_por_classe`, `v_registro_treinos`,
  `v_historico_presencas` (essa última é privada, filtrada por
  `auth.uid()`, usada no dashboard do membro).
- **CSP em `vercel.json`**: tem hashes SHA-256 fixos pros scripts
  inline do Astro. Se a versão do Astro for atualizada, os hashes
  provavelmente precisam ser recalculados (gerar um build real e
  extrair os hashes que o navegador reclama no console).
