## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## CSS conventions

- Small tag/pill/badge components (`.status-badge`, `.stat-pill`, and any new one styled the same way) must always size to their own content — never stretch to fill a parent. When adding a new CSS rule that targets a generic tag like `span` inside a container (e.g. `.some-list li span`), scope it to the direct child (`.some-list li > span`), not a bare descendant selector — a bare descendant selector also matches badges/pills nested deeper inside that span and stretches them. This has caused a visible bug more than once (e.g. the "Inativo" badge in `MembrosList.svelte` inheriting `flex:1; min-width:60%` meant for the outer row `<span>`).

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

The `supabase` MCP server in `.mcp.json` stays at `read_only=false` permanently — don't toggle it back to `true` after a migration, and don't ask the user to flip it before one. Instead, always ask an explicit, clear question in chat before running `apply_migration`, `execute_sql` for anything beyond a plain `SELECT`, or any other DB write — every single time, even in Auto Mode, even if the conversation already implied it. A yes covers only that one action. After any migration, run `get_advisors(type:"security")` and compare against the known baseline (8 intentional `SECURITY DEFINER` views, RPCs intentionally exposed to anon/authenticated by design, leaked password protection warning pre-existing) — flag only genuinely new items.

Baseline auditada em 15/08/2026, item a item: as 8 views (`v_registro_treinos`,
`v_treinos_publicos`, `v_registro_eventos`, `v_ranking_nivel_geral`,
`v_ranking_por_classe`, `v_historico_doacoes`, `v_agenda_confirmacoes`) só
publicam o que o site já mostra e filtram `not m.oculto`; a oitava,
`v_historico_presencas`, se limita sozinha por `auth.uid()`. Nenhuma expõe
email, telegram_id ou auth_user_id. As 25 funções `SECURITY DEFINER` têm
guarda interna (`is_admin`, `is_staff`, `is_organizador`, `current_membro_id` ou
`auth.uid()`); o anônimo só alcança os cinco booleanos sem argumento, que
respondem falso pra ele. Refazer essa varredura de tempos em tempos.

Auth: "Allow new users to sign up" is **off** (since 2026-08-14). Nobody self-registers; a new member has to be invited from the Supabase dashboard, and the `on_auth_user_created_claim_membro` trigger links them to `dMembros` by email. Don't "fix" a login that returns `signup_disabled` by turning signups back on — that error is the intended answer for an email with no user.
